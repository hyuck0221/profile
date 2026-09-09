(() => {
  const list = document.querySelector("#post-list");
  if (!list) return;

  const state = {
    posts: [],
    query: "",
  };

  const search = document.querySelector("#post-search");
  const status = document.querySelector("#journal-status");

  const createText = (tagName, className, value) => {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = value || "";
    return element;
  };

  const formatDate = (value) => {
    if (!value) return "날짜 미정";
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  };

  const getCover = (post) => {
    if (post.cover) return post.cover;
    return post.blocks?.find((block) => block.type === "image")?.src || "";
  };

  const createCard = (post, index) => {
    const article = document.createElement("article");
    article.className = "post-card";

    const link = document.createElement("a");
    link.className = "post-card__link";
    link.href = `./post.html?slug=${encodeURIComponent(post.slug || "")}`;
    link.setAttribute("aria-label", `${post.title || "제목 없음"} 읽기`);

    const cover = document.createElement("div");
    cover.className = "post-card__cover";
    const coverSource = getCover(post);
    if (coverSource) {
      const image = document.createElement("img");
      image.src = `./${coverSource.replace(/^\.\//, "")}`;
      image.alt = post.title || "글 이미지";
      image.loading = "lazy";
      cover.append(image);
    } else {
      cover.append(
        createText("span", "post-card__cover-label", `NOTE / ${String(index + 1).padStart(2, "0")}`),
        createText("span", "post-card__cover-mark", "↗"),
      );
    }

    const body = document.createElement("div");
    body.className = "post-card__body";
    body.append(
      createText("span", "post-card__eyebrow", `NOTE ${String(index + 1).padStart(2, "0")}`),
      createText("h3", "post-card__title", post.title || "제목 없음"),
      createText("p", "post-card__excerpt", post.excerpt || "본문을 열어 기록의 맥락을 확인해보세요."),
    );

    const footer = document.createElement("div");
    footer.className = "post-card__footer";
    const metadata = createText(
      "span",
      "post-card__meta",
      `${formatDate(post.publishedAt || post.updatedAt)} · ${post.readingTime || 1}분 읽기`,
    );
    footer.append(metadata);

    const tags = document.createElement("span");
    tags.className = "post-card__tags";
    (post.tags || []).slice(0, 2).forEach((tag) => tags.append(createText("span", "tag", `#${tag}`)));
    footer.append(tags);
    body.append(footer);

    link.append(cover, body);
    article.append(link);
    return article;
  };

  const renderEmpty = (message, detail) => {
    const empty = document.createElement("article");
    empty.className = "journal-empty";
    empty.append(
      createText("p", "section-eyebrow", "NO MATCHING NOTES"),
      createText("h3", "", message),
      createText("p", "", detail),
    );
    list.append(empty);
  };

  const render = () => {
    const query = state.query.trim().toLowerCase();
    const filtered = state.posts.filter((post) => {
      const searchable = [post.title, post.excerpt, ...(post.tags || [])].join(" ").toLowerCase();
      return !query || searchable.includes(query);
    });

    list.replaceChildren();

    if (!filtered.length) {
      renderEmpty(
        state.posts.length ? "조건에 맞는 글이 없습니다." : "첫 번째 기록을 시작해보세요.",
        state.posts.length ? "검색어나 태그를 바꿔 다시 확인해보세요." : "에디터에서 글을 작성하고 공개하면 이곳에 자동으로 정리됩니다.",
      );
      return;
    }

    filtered.forEach((post, index) => list.append(createCard(post, index)));
  };

  const loadPosts = async () => {
    try {
      const response = await fetch(`./posts/index.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("posts/index.json을 불러오지 못했습니다.");
      const data = await response.json();
      state.posts = Array.isArray(data) ? data : [];
      render();
      status.textContent = "";
    } catch (error) {
      state.posts = [];
      render();
      status.textContent = "posts/index.json을 읽지 못했습니다. Python 서버를 실행했는지 확인해주세요.";
    }
  };

  search?.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });

  loadPosts();
})();
