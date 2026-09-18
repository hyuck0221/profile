(() => {
  const privateShell = document.querySelector("#project-editor-private-shell");
  const blockedScreen = document.querySelector("#project-editor-blocked");
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const isLocalEditor = ["http:", "https:"].includes(window.location.protocol)
    && localHosts.has(window.location.hostname.toLowerCase());

  if (!isLocalEditor) {
    document.title = "hshim - 접근 제한";
    privateShell.hidden = true;
    blockedScreen.hidden = false;
    return;
  }

  privateShell.hidden = false;

  const form = document.querySelector("#project-form");
  const titleInput = document.querySelector("#project-title");
  const linkInput = document.querySelector("#project-link");
  const descriptionInput = document.querySelector("#project-description");
  const thumbnailInput = document.querySelector("#project-thumbnail-input");
  const thumbnailTrigger = document.querySelector("#project-thumbnail-trigger");
  const thumbnailReset = document.querySelector("#project-thumbnail-reset");
  const thumbnailPreview = document.querySelector("#project-thumbnail-preview");
  const saveButton = document.querySelector("#save-project");
  const deleteButton = document.querySelector("#delete-project");
  const saveState = document.querySelector("#project-save-state");
  const editorStatus = document.querySelector("#project-editor-status");
  const editorMode = document.querySelector("#project-editor-mode");
  const historyList = document.querySelector("#project-history");
  const historyCount = document.querySelector("#project-history-count");
  const newProjectButton = document.querySelector("#new-project");

  const params = new URLSearchParams(window.location.search);
  let currentSlug = params.get("slug") || "";
  let isLoading = true;
  let isSaving = false;
  let isDeleting = false;
  let thumbnailSrc = "";
  let pendingThumbnailFile = null;
  let pendingThumbnailUrl = "";

  const setSaveState = (label, state = "") => {
    saveState.textContent = label;
    saveState.className = `save-state${state ? ` is-${state}` : ""}`;
  };

  const setStatus = (message, state = "") => {
    editorStatus.textContent = message;
    editorStatus.className = `editor-status${state ? ` is-${state}` : ""}`;
  };

  const markDirty = () => {
    if (!isLoading && !isSaving) setSaveState("저장되지 않음", "dirty");
  };

  const slugify = (value) => String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  const assetSource = (source) => {
    const value = String(source || "").replace(/^\.\//, "");
    return value.startsWith("assets/") ? `./${value}` : "";
  };

  const clearPendingThumbnail = () => {
    if (pendingThumbnailUrl) URL.revokeObjectURL(pendingThumbnailUrl);
    pendingThumbnailFile = null;
    pendingThumbnailUrl = "";
  };

  const renderThumbnail = () => {
    const source = pendingThumbnailUrl || assetSource(thumbnailSrc);
    thumbnailPreview.replaceChildren();
    if (source) {
      const image = document.createElement("img");
      image.src = source;
      image.alt = titleInput.value || "프로젝트 썸네일";
      image.loading = "lazy";
      thumbnailPreview.append(image);
    } else {
      const empty = document.createElement("p");
      empty.className = "project-thumbnail-preview__empty";
      empty.textContent = "카드에 사용할 이미지를 선택해주세요.";
      thumbnailPreview.append(empty);
    }
    thumbnailReset.hidden = !Boolean(source);
  };

  const uploadAssetFile = async (file, uploadSlug) => {
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("slug", uploadSlug);
    const response = await fetch("./api/upload", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "썸네일 업로드에 실패했습니다.");
    if (data.type !== "image") throw new Error("썸네일은 이미지 파일만 사용할 수 있습니다.");
    return data;
  };

  const isImageFile = (file) => file.type.startsWith("image/")
    || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name || "");

  const formatDate = (value) => {
    if (!value) return "날짜 미정";
    return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(value));
  };

  const historyUrl = (slug) => `./project-editor.html?slug=${encodeURIComponent(slug || "")}`;

  const renderHistory = (projects) => {
    historyList.replaceChildren();
    historyCount.textContent = `${projects.length}개`;
    if (!projects.length) {
      historyList.append(Object.assign(document.createElement("p"), {
        className: "post-history__empty",
        textContent: "아직 등록한 프로젝트가 없습니다.",
      }));
      return;
    }

    projects.forEach((project) => {
      const item = document.createElement("article");
      item.className = `history-item${project.slug === currentSlug ? " is-current" : ""}`;

      const selectLink = document.createElement("a");
      selectLink.className = "history-item__select";
      selectLink.href = historyUrl(project.slug);
      selectLink.append(
        Object.assign(document.createElement("strong"), { textContent: project.title || "제목 없음" }),
        Object.assign(document.createElement("span"), { textContent: formatDate(project.updatedAt || project.createdAt) }),
      );

      const editLink = document.createElement("a");
      editLink.className = "history-item__edit";
      editLink.href = historyUrl(project.slug);
      editLink.textContent = "수정";
      editLink.setAttribute("aria-label", `${project.title || "제목 없음"} 수정`);

      item.append(selectLink, editLink);
      historyList.append(item);
    });
  };

  const loadHistory = async () => {
    try {
      const response = await fetch(`./api/projects?ts=${Date.now()}`, { cache: "no-store" });
      const projects = await response.json();
      if (!response.ok || !Array.isArray(projects)) throw new Error("프로젝트 내역을 불러오지 못했습니다.");
      renderHistory(projects);
    } catch {
      historyCount.textContent = "—";
      historyList.replaceChildren(Object.assign(document.createElement("p"), {
        className: "post-history__empty is-error",
        textContent: "프로젝트 내역을 불러오지 못했습니다.",
      }));
    }
  };

  const validateLink = (value) => {
    try {
      const url = new URL(value.trim());
      if (!["http:", "https:"].includes(url.protocol)) return "";
      return url.href;
    } catch {
      return "";
    }
  };

  const saveProject = async () => {
    if (isSaving) return;
    const title = titleInput.value.trim();
    const url = validateLink(linkInput.value);
    if (!title) {
      setStatus("프로젝트 제목을 입력해주세요.", "error");
      titleInput.focus();
      return;
    }
    if (!url) {
      setStatus("http:// 또는 https://로 시작하는 링크를 입력해주세요.", "error");
      linkInput.focus();
      return;
    }
    if (!thumbnailSrc && !pendingThumbnailFile) {
      setStatus("프로젝트 썸네일을 선택해주세요.", "error");
      thumbnailTrigger.focus();
      return;
    }

    isSaving = true;
    saveButton.disabled = true;
    deleteButton.disabled = true;
    setSaveState("저장하는 중…", "busy");
    setStatus("");

    try {
      if (pendingThumbnailFile) {
        setSaveState("썸네일 업로드 중…", "busy");
        const uploadSlug = `project-${currentSlug || slugify(title) || "draft"}`;
        const thumbnail = await uploadAssetFile(pendingThumbnailFile, uploadSlug);
        thumbnailSrc = thumbnail.src;
        clearPendingThumbnail();
        renderThumbnail();
      }

      const response = await fetch("./api/save-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: currentSlug,
          title,
          url,
          thumbnail: thumbnailSrc,
          description: descriptionInput.value.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "프로젝트 저장에 실패했습니다.");

      currentSlug = data.project.slug;
      deleteButton.hidden = false;
      editorMode.textContent = "EDITING / PROJECT";
      window.history.replaceState({}, "", `./project-editor.html?slug=${encodeURIComponent(currentSlug)}`);
      setSaveState("저장됨", "saved");
      setStatus("프로젝트를 저장했습니다. 프로젝트 목록에서 확인할 수 있어요.", "success");
      loadHistory();
    } catch (error) {
      setSaveState("저장 실패", "error");
      setStatus(`${error.message} Python 서버가 실행 중인지 확인해주세요.`, "error");
    } finally {
      isSaving = false;
      saveButton.disabled = false;
      deleteButton.disabled = false;
    }
  };

  const resetForm = () => {
    currentSlug = "";
    titleInput.value = "";
    linkInput.value = "";
    descriptionInput.value = "";
    thumbnailSrc = "";
    clearPendingThumbnail();
    renderThumbnail();
    deleteButton.hidden = true;
    editorMode.textContent = "NEW ENTRY";
    window.history.replaceState({}, "", "./project-editor.html?new=1");
    setSaveState("저장 대기");
    setStatus("");
    titleInput.focus();
  };

  const deleteProject = async () => {
    if (!currentSlug || isSaving || isDeleting) return;
    if (!window.confirm(`“${titleInput.value.trim() || "제목 없음"}” 프로젝트를 삭제할까요?\n썸네일 파일도 함께 삭제되며 되돌릴 수 없습니다.`)) return;

    isDeleting = true;
    deleteButton.disabled = true;
    saveButton.disabled = true;
    setSaveState("삭제하는 중…", "busy");
    setStatus("");
    try {
      const response = await fetch(`./api/project?slug=${encodeURIComponent(currentSlug)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "프로젝트 삭제에 실패했습니다.");
      resetForm();
      setStatus(`프로젝트와 관련 파일 ${data.deletedAssets?.length || 0}개를 삭제했습니다.`, "success");
      loadHistory();
    } catch (error) {
      setSaveState("삭제 실패", "error");
      setStatus(`${error.message} Python 서버가 실행 중인지 확인해주세요.`, "error");
    } finally {
      isDeleting = false;
      deleteButton.disabled = false;
      saveButton.disabled = false;
    }
  };

  const loadProject = async () => {
    if (!currentSlug) {
      renderThumbnail();
      isLoading = false;
      titleInput.focus();
      return;
    }

    try {
      const response = await fetch(`./api/project?slug=${encodeURIComponent(currentSlug)}`, { cache: "no-store" });
      const project = await response.json();
      if (!response.ok) throw new Error(project.error || "프로젝트를 불러오지 못했습니다.");
      titleInput.value = project.title || "";
      linkInput.value = project.url || "";
      descriptionInput.value = project.description || "";
      thumbnailSrc = typeof project.thumbnail === "string" ? project.thumbnail : "";
      renderThumbnail();
      editorMode.textContent = "EDITING / PROJECT";
      deleteButton.hidden = false;
      setSaveState("저장됨", "saved");
      setStatus("기존 프로젝트를 불러왔습니다.");
    } catch (error) {
      setStatus(`${error.message} 새 프로젝트로 시작하려면 주소에서 ?slug=를 지워주세요.`, "error");
      resetForm();
    } finally {
      isLoading = false;
    }
  };

  thumbnailTrigger.addEventListener("click", () => thumbnailInput.click());
  thumbnailInput.addEventListener("change", () => {
    const file = thumbnailInput.files?.[0];
    thumbnailInput.value = "";
    if (!file) return;
    if (!isImageFile(file)) {
      setStatus("썸네일은 이미지 파일만 선택할 수 있습니다.", "error");
      return;
    }
    clearPendingThumbnail();
    pendingThumbnailFile = file;
    pendingThumbnailUrl = URL.createObjectURL(file);
    renderThumbnail();
    markDirty();
    setStatus("썸네일을 선택했습니다. 저장하면 프로젝트 폴더에 업로드됩니다.");
  });
  thumbnailReset.addEventListener("click", () => {
    clearPendingThumbnail();
    thumbnailSrc = "";
    renderThumbnail();
    markDirty();
    setStatus("썸네일을 지웠습니다. 저장하려면 새 이미지를 선택해주세요.");
  });

  [titleInput, linkInput, descriptionInput].forEach((input) => input.addEventListener("input", markDirty));
  newProjectButton.addEventListener("click", resetForm);
  saveButton.addEventListener("click", saveProject);
  deleteButton.addEventListener("click", deleteProject);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveProject();
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveProject();
    }
  });

  loadHistory();
  loadProject();
})();
