(() => {
  const list = document.querySelector("#project-list");
  if (!list) return;

  const state = { projects: [] };
  const status = document.querySelector("#projects-status");
  const dialog = document.querySelector("#project-dialog");
  const dialogClose = document.querySelector("#project-dialog-close");
  const dialogThumbnail = document.querySelector("#project-dialog-thumbnail");
  const dialogImage = document.querySelector("#project-dialog-image");
  const dialogTitle = document.querySelector("#project-dialog-title");
  const dialogDescription = document.querySelector("#project-dialog-description");
  const dialogLink = document.querySelector("#project-dialog-link");
  let dialogTrigger = null;

  const createText = (tagName, className, value) => {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = value || "";
    return element;
  };

  const assetUrl = (source) => {
    const value = String(source || "").replace(/^\.\//, "");
    return value.startsWith("assets/") ? `./${value}` : "";
  };

  const projectUrl = (value) => {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  };

  const closeDialog = () => {
    if (!dialog) return;
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    if (dialogTrigger?.isConnected) dialogTrigger.focus();
    dialogTrigger = null;
  };

  const openDialog = (project, trigger) => {
    if (!dialog || !dialogTitle || !dialogDescription || !dialogLink) return;
    const href = projectUrl(project.url);
    dialogTrigger = trigger;
    dialogTitle.textContent = project.title || "제목 없음";
    dialogDescription.textContent = project.description || "등록된 설명이 없습니다.";
    dialogLink.href = href || "#";
    dialogLink.hidden = !href;

    const thumbnail = assetUrl(project.thumbnail);
    if (thumbnail && dialogThumbnail && dialogImage) {
      dialogImage.src = thumbnail;
      dialogImage.alt = `${project.title || "프로젝트"} 썸네일`;
      dialogThumbnail.hidden = false;
    } else if (dialogThumbnail && dialogImage) {
      dialogImage.removeAttribute("src");
      dialogImage.alt = "";
      dialogThumbnail.hidden = true;
    }

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialogClose?.focus();
  };

  const createCard = (project, index) => {
    const article = document.createElement("article");
    article.className = "project-card";

    const thumbnailLink = document.createElement("a");
    thumbnailLink.className = "project-card__thumbnail-link";
    thumbnailLink.href = projectUrl(project.url) || "#";
    thumbnailLink.target = "_blank";
    thumbnailLink.rel = "noreferrer noopener";
    thumbnailLink.setAttribute("aria-label", `${project.title || "제목 없음"} 프로젝트 열기`);

    const cover = document.createElement("div");
    cover.className = "project-card__cover";
    const thumbnail = assetUrl(project.thumbnail);
    if (thumbnail) {
      const image = document.createElement("img");
      image.src = thumbnail;
      image.alt = `${project.title || "프로젝트"} 썸네일`;
      image.loading = "lazy";
      cover.append(image);
    } else {
      cover.append(createText("span", "project-card__placeholder", `PROJECT / ${String(index + 1).padStart(2, "0")}`));
    }
    cover.append(createText("span", "project-card__mark", "↗"));

    const infoButton = document.createElement("button");
    infoButton.className = "project-card__info";
    infoButton.type = "button";
    infoButton.setAttribute("aria-haspopup", "dialog");
    infoButton.setAttribute("aria-label", `${project.title || "제목 없음"} 상세 정보 보기`);

    const body = document.createElement("div");
    body.className = "project-card__body";
    body.append(
      createText("h2", "project-card__title", project.title || "제목 없음"),
      createText("p", "project-card__description", project.description || ""),
    );

    thumbnailLink.append(cover);
    infoButton.append(body);
    infoButton.addEventListener("click", () => openDialog(project, infoButton));
    article.append(thumbnailLink, infoButton);
    return article;
  };

  const renderEmpty = (title, detail) => {
    const empty = document.createElement("article");
    empty.className = "projects-empty";
    empty.append(
      createText("p", "section-eyebrow", "NO PROJECTS YET"),
      createText("h2", "", title),
      createText("p", "", detail),
    );
    list.append(empty);
  };

  const render = () => {
    list.replaceChildren();
    if (!state.projects.length) {
      renderEmpty(
        "첫 번째 프로젝트를 등록해보세요.",
        "등록된 프로젝트가 생기면 이곳에 카드 형태로 정리됩니다.",
      );
      return;
    }
    state.projects.forEach((project, index) => list.append(createCard(project, index)));
  };

  const loadProjects = async () => {
    try {
      const response = await fetch(`./projects/index.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("projects/index.json을 불러오지 못했습니다.");
      const data = await response.json();
      state.projects = Array.isArray(data) ? data : [];
      render();
      status.textContent = "";
    } catch (error) {
      state.projects = [];
      render();
      status.textContent = `${error.message} Python 서버 또는 정적 파일을 확인해주세요.`;
    }
  };

  dialogClose?.addEventListener("click", closeDialog);
  dialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });

  loadProjects();
})();
