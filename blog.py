#!/usr/bin/env python3
"""Small file-based blog server and renderer for hshim studio.

The editor writes through this script so posts and uploaded assets stay inside
the project folder. No third-party Python packages are required.

Typical usage:
    python3 blog.py serve
    python3 blog.py render
"""

from __future__ import annotations

import argparse
import json
import math
import mimetypes
import re
import sys
import unicodedata
import webbrowser
from datetime import datetime, timezone
from html import escape as html_escape
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
from urllib.error import URLError
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent
POSTS_DIR = ROOT / "posts"
UPLOADS_DIR = ROOT / "assets" / "uploads"
INDEX_FILE = POSTS_DIR / "index.json"
MAX_JSON_BYTES = 2 * 1024 * 1024
MAX_UPLOAD_BYTES = 512 * 1024 * 1024
ALLOWED_BLOCK_TYPES = {
    "paragraph",
    "heading1",
    "heading2",
    "quote",
    "bullet",
    "numbered",
    "code",
    "divider",
    "image",
    "video",
    "file",
}
ALLOWED_INLINE_TAGS = {"strong", "b", "em", "i", "u", "s", "del", "code", "a"}
BLOCKED_INLINE_TAGS = {"script", "style", "iframe", "object", "embed", "svg", "math"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", str(value or "")).strip().lower()
    normalized = re.sub(r"[^\w\s-]", "", normalized, flags=re.UNICODE)
    normalized = re.sub(r"[\s_-]+", "-", normalized).strip("-")
    return normalized[:80] or f"post-{datetime.now().strftime('%Y%m%d-%H%M%S')}"


def safe_filename(value: str) -> str:
    raw = unicodedata.normalize("NFKC", Path(str(value or "")).name).strip()
    raw = re.sub(r"[^\w.()\- ]", "-", raw, flags=re.UNICODE)
    raw = re.sub(r"\s+", "-", raw).strip(".-")
    return raw[:160] or "asset"


def clean_text(value: object, limit: int = 20000) -> str:
    text = str(value or "").replace("\x00", "").replace("\r\n", "\n")
    return text[:limit].strip()


def safe_inline_href(value: object) -> str | None:
    href = str(value or "").strip()
    return href if re.match(r"^(?:https?:|mailto:)", href, re.IGNORECASE) else None


class InlineHTMLSanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.stack: list[tuple[str, bool]] = []
        self.blocked_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if self.blocked_depth:
            if tag in BLOCKED_INLINE_TAGS:
                self.blocked_depth += 1
            return
        if tag in BLOCKED_INLINE_TAGS:
            self.blocked_depth = 1
            return
        if tag == "br":
            self.parts.append("<br>")
            return

        emitted = False
        if tag in ALLOWED_INLINE_TAGS:
            if tag == "a":
                attributes = {name.lower(): value for name, value in attrs}
                href = safe_inline_href(attributes.get("href"))
                if href:
                    escaped_href = html_escape(href, quote=True)
                    self.parts.append(
                        f'<a href="{escaped_href}" target="_blank" rel="noreferrer noopener">'
                    )
                    emitted = True
            else:
                self.parts.append(f"<{tag}>")
                emitted = True
        self.stack.append((tag, emitted))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in BLOCKED_INLINE_TAGS:
            return
        if tag.lower() == "br":
            self.parts.append("<br>")
            return
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self.blocked_depth:
            if tag in BLOCKED_INLINE_TAGS:
                self.blocked_depth -= 1
            return
        if tag == "br":
            return
        match_index = next(
            (index for index in range(len(self.stack) - 1, -1, -1) if self.stack[index][0] == tag),
            None,
        )
        if match_index is None:
            return
        while len(self.stack) > match_index:
            open_tag, emitted = self.stack.pop()
            if emitted:
                self.parts.append(f"</{open_tag}>")

    def handle_data(self, data: str) -> None:
        if self.blocked_depth:
            return
        self.parts.append(html_escape(data, quote=False))


class InlineTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "br":
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def sanitize_inline_html(value: object) -> str:
    if not isinstance(value, str) or not value:
        return ""
    parser = InlineHTMLSanitizer()
    parser.feed(value)
    parser.close()
    return "".join(parser.parts)


def inline_text(value: str) -> str:
    parser = InlineTextParser()
    parser.feed(value)
    parser.close()
    return "".join(parser.parts)


def normalize_asset_width(value: object) -> int:
    try:
        width = float(value)
    except (TypeError, ValueError):
        return 100
    if not math.isfinite(width):
        return 100
    return min(100, max(25, round(width / 5) * 5))


def safe_asset_ref(value: object) -> str | None:
    raw = str(value or "").replace("\\", "/").strip()
    if not raw:
        return None
    path = Path(raw)
    if path.is_absolute() or ".." in path.parts:
        return None
    normalized = path.as_posix().lstrip("./")
    return normalized if normalized.startswith("assets/") else None


def asset_refs(blocks: object) -> set[str]:
    if not isinstance(blocks, list):
        return set()
    return {
        src
        for block in blocks
        if isinstance(block, dict)
        for src in [safe_asset_ref(block.get("src"))]
        if src
    }


def post_asset_refs(post: object) -> set[str]:
    if not isinstance(post, dict):
        return set()
    refs = asset_refs(post.get("blocks"))
    cover = safe_asset_ref(post.get("cover"))
    if cover:
        refs.add(cover)
    return refs


def upload_asset_path(ref: object) -> Path | None:
    normalized = safe_asset_ref(ref)
    if not normalized:
        return None
    candidate = ROOT / normalized
    uploads_root = UPLOADS_DIR.resolve()
    try:
        candidate.resolve().relative_to(uploads_root)
    except ValueError:
        return None
    return candidate


def referenced_assets(exclude: Path | None = None) -> set[str]:
    refs: set[str] = set()
    for path in POSTS_DIR.glob("*.json"):
        if path.name == INDEX_FILE.name or (exclude and path == exclude):
            continue
        post = read_json(path)
        if post:
            refs.update(post_asset_refs(post))
    return refs


def remove_orphaned_assets(previous_post: object, current_post: object, target: Path) -> None:
    removed = post_asset_refs(previous_post) - post_asset_refs(current_post)
    if not removed:
        return
    in_use = referenced_assets(exclude=target)
    for ref in removed - in_use:
        path = upload_asset_path(ref)
        if not path or not (path.is_file() or path.is_symlink()):
            continue
        try:
            path.unlink()
        except OSError:
            continue
        try:
            path.parent.rmdir()
        except OSError:
            pass


def ensure_directories() -> None:
    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    if not INDEX_FILE.exists():
        INDEX_FILE.write_text("[]\n", encoding="utf-8")


def read_json(path: Path) -> dict | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def normalize_blocks(value: object) -> list[dict]:
    if not isinstance(value, list):
        return [{"type": "paragraph", "text": ""}]

    blocks: list[dict] = []
    for raw in value:
        if not isinstance(raw, dict):
            continue
        block_type = str(raw.get("type", "paragraph"))
        if block_type not in ALLOWED_BLOCK_TYPES:
            block_type = "paragraph"

        if block_type == "divider":
            blocks.append({"type": "divider"})
            continue

        if block_type in {"image", "video", "file"}:
            src = safe_asset_ref(raw.get("src"))
            if not src:
                continue
            alignment = raw.get("align")
            if not isinstance(alignment, str) or alignment not in {"left", "center", "right"}:
                alignment = "left"
            asset = {
                "type": block_type,
                "src": src,
                "name": clean_text(raw.get("name") or Path(src).name, 240),
                "mime": clean_text(raw.get("mime"), 120),
                "width": normalize_asset_width(raw.get("width", 100)),
                "align": alignment,
            }
            if raw.get("alt"):
                asset["alt"] = clean_text(raw.get("alt"), 240)
            blocks.append(asset)
            continue

        html = sanitize_inline_html(raw.get("html"))
        text = clean_text(inline_text(html), 20000) if html else clean_text(raw.get("text"), 20000)
        if text or html or not blocks:
            block = {"type": block_type, "text": text}
            if html:
                block["html"] = html
            blocks.append(block)

    return blocks or [{"type": "paragraph", "text": ""}]


def reading_time(blocks: list[dict]) -> int:
    text = " ".join(str(block.get("text", "")) for block in blocks)
    count = len(re.findall(r"\S+", text))
    return max(1, round(count / 220 + 0.5))


def post_metadata(post: dict, filename: str) -> dict:
    blocks = post.get("blocks", [])
    cover = post.get("cover")
    if not safe_asset_ref(cover):
        cover = next(
            (block.get("src") for block in blocks if block.get("type") == "image"),
            None,
        )
    return {
        "id": post.get("id", post.get("slug", "")),
        "slug": post.get("slug", ""),
        "title": post.get("title", "제목 없음"),
        "excerpt": post.get("excerpt", ""),
        "tags": post.get("tags", []),
        "status": post.get("status", "draft"),
        "publishedAt": post.get("publishedAt"),
        "updatedAt": post.get("updatedAt"),
        "readingTime": post.get("readingTime", reading_time(blocks)),
        "cover": cover,
        "file": f"./posts/{filename}",
    }


def rebuild_index() -> list[dict]:
    ensure_directories()
    items: list[dict] = []
    for path in POSTS_DIR.glob("*.json"):
        if path.name == INDEX_FILE.name:
            continue
        post = read_json(path)
        if not post or post.get("status") != "published":
            continue
        items.append(post_metadata(post, path.name))

    items.sort(
        key=lambda item: item.get("publishedAt") or item.get("updatedAt") or "",
        reverse=True,
    )
    INDEX_FILE.write_text(
        json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return items


def save_post(payload: dict) -> dict:
    ensure_directories()
    title = clean_text(payload.get("title"), 160) or "제목 없는 글"
    slug = slugify(clean_text(payload.get("slug"), 100) or title)
    status = payload.get("status") if payload.get("status") in {"draft", "published"} else "draft"
    target = POSTS_DIR / f"{slug}.json"
    previous = read_json(target) if target.exists() else None
    created_at = (previous or {}).get("createdAt") or now_iso()
    published_at = (previous or {}).get("publishedAt")
    if status == "published" and not published_at:
        published_at = now_iso()

    tags = payload.get("tags", [])
    if isinstance(tags, str):
        tags = [tag.strip() for tag in tags.split(",") if tag.strip()]
    tags = [clean_text(tag, 40) for tag in tags if clean_text(tag, 40)][:8]
    blocks = normalize_blocks(payload.get("blocks"))
    cover = safe_asset_ref(payload.get("cover"))
    post = {
        "id": (previous or {}).get("id") or slug,
        "slug": slug,
        "title": title,
        "excerpt": clean_text(payload.get("excerpt"), 500),
        "tags": tags,
        "status": status,
        "createdAt": created_at,
        "updatedAt": now_iso(),
        "publishedAt": published_at if status == "published" else None,
        "readingTime": reading_time(blocks),
        "cover": cover,
        "blocks": blocks,
    }
    target.write_text(json.dumps(post, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    remove_orphaned_assets(previous, post, target)
    index = rebuild_index()
    return {"post": post, "index": index}


def remove_post_assets(post: object, target: Path, slug: str) -> list[str]:
    in_use = referenced_assets(exclude=target)
    candidates = set(post_asset_refs(post))
    upload_dir = UPLOADS_DIR / slug

    if upload_dir.is_dir():
        for path in upload_dir.iterdir():
            if path.is_file() or path.is_symlink():
                candidates.add(path.relative_to(ROOT).as_posix())

    deleted: list[str] = []
    for ref in sorted(candidates - in_use):
        path = upload_asset_path(ref)
        if not path or not (path.is_file() or path.is_symlink()):
            continue
        path.unlink()
        deleted.append(ref)
        try:
            path.parent.rmdir()
        except OSError:
            pass

    try:
        upload_dir.rmdir()
    except OSError:
        pass
    return deleted


def delete_post(slug: str) -> dict:
    ensure_directories()
    raw_slug = str(slug or "").strip()
    if not raw_slug or "/" in raw_slug or "\\" in raw_slug:
        raise ValueError("삭제할 글 주소가 올바르지 않습니다.")

    normalized_slug = slugify(raw_slug)
    target = POSTS_DIR / f"{normalized_slug}.json"
    post = read_json(target)
    if not post:
        raise FileNotFoundError("글을 찾을 수 없습니다.")

    deleted_assets = remove_post_assets(post, target, normalized_slug)
    target.unlink()
    index = rebuild_index()
    return {"slug": normalized_slug, "deletedAssets": deleted_assets, "index": index}


def new_post(title: str) -> Path:
    ensure_directories()
    slug = slugify(title or "새 글")
    target = POSTS_DIR / f"{slug}.json"
    if target.exists():
        slug = slugify(f"{title}-{datetime.now().strftime('%H%M%S')}")
        target = POSTS_DIR / f"{slug}.json"
    post = {
        "id": slug,
        "slug": slug,
        "title": clean_text(title, 160) or "새 글",
        "excerpt": "",
        "tags": [],
        "status": "draft",
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
        "publishedAt": None,
        "readingTime": 1,
        "cover": None,
        "blocks": [{"type": "paragraph", "text": ""}],
    }
    target.write_text(json.dumps(post, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    rebuild_index()
    return target


def decode_multipart_filename(value: str) -> str:
    decoded = unquote(value.strip().strip('"'))
    try:
        return decoded.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return decoded


def parse_multipart(body: bytes, content_type: str) -> dict[str, object]:
    match = re.search(r"boundary=(?:\"([^\"]+)\"|([^;]+))", content_type, re.I)
    if not match:
        raise ValueError("multipart boundary가 없습니다.")
    boundary = (match.group(1) or match.group(2)).encode()
    delimiter = b"--" + boundary
    parts: dict[str, object] = {}
    for chunk in body.split(delimiter)[1:]:
        if chunk.startswith(b"--"):
            break
        chunk = chunk.lstrip(b"\r\n")
        if chunk.endswith(b"\r\n"):
            chunk = chunk[:-2]
        if b"\r\n\r\n" not in chunk:
            continue
        header_blob, content = chunk.split(b"\r\n\r\n", 1)
        headers: dict[str, str] = {}
        for line in header_blob.split(b"\r\n"):
            if b":" not in line:
                continue
            key, value = line.split(b":", 1)
            headers[key.decode("latin-1").lower()] = value.decode("latin-1").strip()
        disposition = headers.get("content-disposition", "")
        name_match = re.search(r'name="([^"]+)"', disposition)
        if not name_match:
            continue
        name = name_match.group(1)
        filename_match = re.search(r'filename\*=(?:UTF-8\'\')?([^;]+)', disposition, re.I)
        if not filename_match:
            filename_match = re.search(r'filename="([^"]*)"', disposition, re.I)
        if filename_match:
            filename = decode_multipart_filename(filename_match.group(1))
            parts[name] = {
                "filename": filename,
                "content": content,
                "content_type": headers.get("content-type", ""),
            }
        else:
            parts[name] = content.decode("utf-8", errors="replace")
    return parts


class BlogRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format: str, *args) -> None:
        sys.stderr.write(f"[blog] {self.address_string()} - {format % args}\n")

    def send_json(self, value: object, status: int = 200) -> None:
        data = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def read_body(self, limit: int) -> bytes:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("Content-Length가 올바르지 않습니다.") from exc
        if length < 0 or length > limit:
            raise ValueError("요청 파일 크기가 제한을 초과했습니다.")
        return self.rfile.read(length)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self.send_json({"ok": True, "root": str(ROOT)})
            return
        if parsed.path == "/api/posts":
            include_drafts = parse_qs(parsed.query).get("includeDrafts", ["0"])[0] == "1"
            if include_drafts:
                posts = [
                    post_metadata(post, path.name)
                    for path in POSTS_DIR.glob("*.json")
                    if path.name != INDEX_FILE.name
                    for post in [read_json(path)]
                    if post
                ]
                posts.sort(key=lambda item: item.get("updatedAt") or "", reverse=True)
            else:
                posts = rebuild_index()
            self.send_json(posts)
            return
        if parsed.path == "/api/post":
            slug = slugify(parse_qs(parsed.query).get("slug", [""])[0])
            post = read_json(POSTS_DIR / f"{slug}.json")
            if not post:
                self.send_json({"error": "글을 찾을 수 없습니다."}, 404)
                return
            self.send_json(post)
            return
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/save-post":
                payload = json.loads(self.read_body(MAX_JSON_BYTES).decode("utf-8"))
                if not isinstance(payload, dict):
                    raise ValueError("글 데이터 형식이 올바르지 않습니다.")
                self.send_json({"ok": True, **save_post(payload)})
                return

            if parsed.path == "/api/upload":
                body = self.read_body(MAX_UPLOAD_BYTES)
                parts = parse_multipart(body, self.headers.get("Content-Type", ""))
                file_part = parts.get("file")
                if not isinstance(file_part, dict):
                    raise ValueError("업로드할 파일이 없습니다.")
                filename = safe_filename(str(file_part.get("filename", "asset")))
                requested_slug = slugify(str(parts.get("slug", "draft")))
                target_dir = UPLOADS_DIR / requested_slug
                target_dir.mkdir(parents=True, exist_ok=True)
                target = target_dir / filename
                suffix = target.suffix
                stem = target.stem
                counter = 2
                while target.exists():
                    target = target_dir / f"{stem}-{counter}{suffix}"
                    counter += 1
                content = file_part.get("content", b"")
                if not isinstance(content, bytes) or not content:
                    raise ValueError("빈 파일은 업로드할 수 없습니다.")
                target.write_bytes(content)
                content_type = str(file_part.get("content_type", "")) or mimetypes.guess_type(filename)[0] or "application/octet-stream"
                kind = "image" if content_type.startswith("image/") else "video" if content_type.startswith("video/") else "file"
                self.send_json({
                    "ok": True,
                    "type": kind,
                    "src": target.relative_to(ROOT).as_posix(),
                    "name": target.name,
                    "mime": content_type,
                })
                return

            raise ValueError("지원하지 않는 API입니다.")
        except (ValueError, json.JSONDecodeError, OSError) as exc:
            self.send_json({"ok": False, "error": str(exc)}, 400)

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/post":
                slug = parse_qs(parsed.query).get("slug", [""])[0]
                self.send_json({"ok": True, **delete_post(slug)})
                return

            raise ValueError("지원하지 않는 API입니다.")
        except FileNotFoundError as exc:
            self.send_json({"ok": False, "error": str(exc)}, 404)
        except (ValueError, OSError) as exc:
            self.send_json({"ok": False, "error": str(exc)}, 400)


def browser_host(host: str) -> str:
    return "127.0.0.1" if host in {"0.0.0.0", "::"} else host


def editor_url(host: str, port: int) -> str:
    return f"http://{browser_host(host)}:{port}/editor.html"


def running_blog_server(host: str, port: int) -> bool:
    try:
        with urlopen(f"http://{browser_host(host)}:{port}/api/health", timeout=1) as response:
            return response.status == 200
    except (OSError, URLError):
        return False


def open_editor(host: str, port: int) -> None:
    url = editor_url(host, port)
    print(f"에디터 열기: {url}")
    webbrowser.open(url, new=2)


def serve(host: str, port: int, auto_open: bool = True) -> int:
    ensure_directories()
    try:
        server = ThreadingHTTPServer((host, port), BlogRequestHandler)
    except OSError as exc:
        if running_blog_server(host, port):
            print(f"이미 실행 중인 블로그 서버를 사용합니다: http://{browser_host(host)}:{port}/")
            if auto_open:
                open_editor(host, port)
            return 0
        raise RuntimeError(
            f"포트 {port}를 사용할 수 없습니다. 다른 프로그램이 사용 중이면 --port를 바꿔 실행해주세요."
        ) from exc
    print(f"hshim studio blog running at http://{host}:{port}/")
    print(f"editor: {editor_url(host, port)}")
    if auto_open:
        open_editor(host, port)
    print("Ctrl+C로 종료합니다.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 종료합니다.")
    finally:
        server.server_close()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="hshim studio 파일 기반 블로그 도구")
    parser.add_argument("--host", default="127.0.0.1", help="로컬 서버 주소")
    parser.add_argument("--port", type=int, default=4173, help="로컬 서버 포트")
    parser.add_argument("--no-open", action="store_true", help="서버만 실행하고 에디터는 자동으로 열지 않습니다.")
    subparsers = parser.add_subparsers(dest="command")

    serve_parser = subparsers.add_parser("serve", help="에디터와 블로그를 로컬 서버로 실행합니다.")
    serve_parser.add_argument("--host", dest="serve_host", default=None)
    serve_parser.add_argument("--port", dest="serve_port", type=int, default=None)
    serve_parser.add_argument("--no-open", dest="serve_no_open", action="store_true")

    new_parser = subparsers.add_parser("new", help="새 초안 JSON 파일을 만듭니다.")
    new_parser.add_argument("title", nargs="?", default="새 글")

    subparsers.add_parser("render", help="posts 폴더를 읽어 공개 글 인덱스를 다시 만듭니다.")

    args = parser.parse_args()
    if args.command is None or args.command == "serve":
        host = getattr(args, "serve_host", None) or args.host
        port = getattr(args, "serve_port", None) or args.port
        no_open = args.no_open or getattr(args, "serve_no_open", False)
        return serve(host, port, auto_open=not no_open)
    elif args.command == "new":
        path = new_post(args.title)
        print(path.relative_to(ROOT).as_posix())
    elif args.command == "render":
        items = rebuild_index()
        print(f"공개 글 {len(items)}개를 posts/index.json에 반영했습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
