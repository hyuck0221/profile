# hshim studio blog

파일 기반으로 글을 쓰고 공개하는 작은 블로그 도구입니다. Python 표준 라이브러리만 사용하며, 공개된 글은 GitHub Pages에서도 그대로 읽을 수 있습니다.

## 시작하기

프로젝트 폴더에서 Python을 실행하면 서버가 시작되고 글쓰기 페이지가 자동으로 열립니다.

```bash
python3 blog.py
```

자동으로 열리지 않는 경우에는 [http://127.0.0.1:4173/editor.html](http://127.0.0.1:4173/editor.html)을 직접 열면 됩니다. 서버만 실행하려면 `python3 blog.py --no-open`을 사용합니다.

에디터에서 제목과 본문을 작성한 뒤 `저장하기`를 누르면 공개 글 파일이 만들어집니다. 왼쪽에는 작성한 글 내역만 남아 있으며, 본문 툴바의 `파일` 버튼으로 이미지·영상·파일을 추가합니다. 일반 파일은 업로드 전에 저장할 이름을 정할 수 있고, 본문에 추가한 첨부 블록에서 크기와 위치를 조절할 수 있습니다.

썸네일은 본문과 별도로 `썸네일 사진 선택`에서 고를 수 있습니다. 별도 선택을 하지 않으면 본문에 넣은 첫 번째 이미지가 자동으로 글 썸네일이 되고, `본문 첫 사진 사용`으로 직접 선택한 썸네일을 초기화할 수 있습니다.

```text
posts/
  index.json
  글-주소.json
assets/
  uploads/
    글-주소/
      이미지·영상·첨부파일
```

공개 글은 `posts/index.json`에 자동으로 정리되고, `journal.html` 기록 페이지와 글 상세 화면에서 정적 JSON 파일을 읽습니다. `index.html`은 프로필 화면으로 유지되며, `contact.html`은 문의 화면으로 분리되어 있습니다. 따라서 방문자는 Python 서버 없이도 GitHub Pages에서 글을 볼 수 있습니다. JSON 파일을 직접 추가하거나 수정한 경우에는 다음 명령으로 인덱스를 다시 만듭니다.

```bash
python3 blog.py render
```

## GitHub Pages에 공개하기

로컬 에디터에서 글을 `저장하기`로 저장한 뒤, 생성된 글과 자산을 커밋하고 GitHub에 push합니다.

```bash
git add posts assets
git commit -m "Publish a new note"
git push
```

GitHub Pages는 `journal.html`에서 `posts/index.json`을 읽어 공개 글을 표시하고, `post.html`은 해당 글의 `posts/<slug>.json`을 읽습니다. 이미지·영상·첨부 파일은 `assets/uploads/`의 상대 경로로 연결됩니다. GitHub Pages에서는 글쓰기 API가 실행되지 않으므로 작성은 로컬에서 `python3 blog.py`로 진행하고, 공개 결과만 push합니다.

브라우저에서 서버를 실행하지 않고 HTML 파일을 직접 열면 파일 쓰기 API와 `fetch`가 동작하지 않습니다. 작성·업로드가 필요할 때는 반드시 `python3 blog.py`로 실행해주세요.
