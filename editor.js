(() => {
  const privateShell = document.querySelector("#editor-private-shell");
  const blockedScreen = document.querySelector("#editor-blocked");
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

  const editor = document.querySelector("#editor-blocks");
  if (!editor) return;

  const { isSafeHref, sanitizeInlineHtml, textFromNode } = window.HshimRichText;

  const form = document.querySelector("#post-form");
  const titleInput = document.querySelector("#post-title");
  const excerptInput = document.querySelector("#post-excerpt");
  const tagsInput = document.querySelector("#post-tags");
  const slugInput = document.querySelector("#post-slug");
  const assetInput = document.querySelector("#asset-input");
  const assetTrigger = document.querySelector("#asset-trigger");
  const thumbnailInput = document.querySelector("#thumbnail-input");
  const thumbnailTrigger = document.querySelector("#thumbnail-trigger");
  const thumbnailReset = document.querySelector("#thumbnail-reset");
  const thumbnailPreview = document.querySelector("#thumbnail-preview");
  const thumbnailState = document.querySelector("#thumbnail-state");
  const publishButton = document.querySelector("#publish-post");
  const deleteButton = document.querySelector("#delete-post");
  const previewButton = document.querySelector("#preview-post");
  const saveState = document.querySelector("#save-state");
  const editorStatus = document.querySelector("#editor-status");
  const editorMode = document.querySelector("#editor-mode");
  const blockCount = document.querySelector("#block-count");
  const slashMenu = document.querySelector("#slash-menu");
  const toolbarButtons = [...document.querySelectorAll("[data-insert-type]")];
  const inlineToolbarButtons = [...document.querySelectorAll("[data-inline-command]")];
  const inlineLinkButton = document.querySelector("#inline-link");
  const historyList = document.querySelector("#post-history");
  const historyCount = document.querySelector("#history-count");
  const newPostButton = document.querySelector("#new-post");
  const assetDialog = document.querySelector("#asset-name-dialog");
  const assetNameForm = document.querySelector("#asset-name-form");
  const assetNameInput = document.querySelector("#asset-name-input");
  const assetNameHint = document.querySelector("#asset-name-hint");
  const assetNameCancel = document.querySelector("#asset-name-cancel");

  const params = new URLSearchParams(window.location.search);
  let currentSlug = params.get("slug") || "";
  let activeBlock = null;
  let slugWasEdited = Boolean(currentSlug);
  let isLoading = true;
  let isSaving = false;
  let isDeleting = false;
  let coverSrc = "";
  let pendingCoverFile = null;
  let pendingCoverUrl = "";
  let draggedBlock = null;

  const textTypes = new Set(["paragraph", "heading1", "heading2", "quote", "bullet", "numbered", "code"]);
  const assetTypes = new Set(["image", "video", "file"]);
  const assetAlignments = new Set(["left", "center", "right"]);
  const placeholders = {
    paragraph: "내용을 입력하세요. / 를 입력하면 블록을 바꿀 수 있어요.",
    heading1: "큰 제목",
    heading2: "소제목",
    quote: "기억해둘 문장을 적어보세요.",
    bullet: "목록 항목",
    numbered: "목록 항목",
    code: "코드를 붙여 넣으세요.",
  };

  const formatHistoryDate = (value) => {
    if (!value) return "날짜 미정";
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  };

  const historyUrl = (slug) => `./editor.html?slug=${encodeURIComponent(slug || "")}`;

  const renderHistory = (posts) => {
    historyList.replaceChildren();
    historyCount.textContent = `${posts.length}개`;
    if (!posts.length) {
      historyList.append(Object.assign(document.createElement("p"), {
        className: "post-history__empty",
        textContent: "아직 작성한 글이 없습니다.",
      }));
      return;
    }

    posts.forEach((post) => {
      const item = document.createElement("article");
      item.className = `history-item${post.slug === currentSlug ? " is-current" : ""}`;

      const selectLink = document.createElement("a");
      selectLink.className = "history-item__select";
      selectLink.href = historyUrl(post.slug);
      selectLink.append(
        Object.assign(document.createElement("strong"), { textContent: post.title || "제목 없음" }),
        Object.assign(document.createElement("span"), {
          textContent: `${post.status === "published" ? "공개" : "초안"} · ${formatHistoryDate(post.updatedAt || post.publishedAt)}`,
        }),
      );

      const editLink = document.createElement("a");
      editLink.className = "history-item__edit";
      editLink.href = historyUrl(post.slug);
      editLink.textContent = "수정";
      editLink.setAttribute("aria-label", `${post.title || "제목 없음"} 수정`);

      item.append(selectLink, editLink);
      historyList.append(item);
    });
  };

  const loadHistory = async () => {
    try {
      const response = await fetch(`./api/posts?includeDrafts=1&ts=${Date.now()}`, { cache: "no-store" });
      const posts = await response.json();
      if (!response.ok || !Array.isArray(posts)) throw new Error("작성한 글 내역을 불러오지 못했습니다.");
      renderHistory(posts);
    } catch (error) {
      historyCount.textContent = "—";
      historyList.replaceChildren(Object.assign(document.createElement("p"), {
        className: "post-history__empty is-error",
        textContent: "글 내역을 불러오지 못했습니다.",
      }));
    }
  };

  const setSaveState = (label, state = "") => {
    saveState.textContent = label;
    saveState.className = `save-state${state ? ` is-${state}` : ""}`;
  };

  const setStatus = (message, state = "") => {
    editorStatus.textContent = message;
    editorStatus.className = `editor-status${state ? ` is-${state}` : ""}`;
  };

  const slugify = (value) => {
    const normalized = String(value || "").normalize("NFKC").trim().toLowerCase();
    return normalized
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  };

  const markDirty = () => {
    if (isLoading || isSaving) return;
    setSaveState("저장되지 않음", "dirty");
  };

  const blockText = (block) => textFromNode(block).trim();

  const updateEmpty = (block) => {
    block.dataset.empty = blockText(block) ? "false" : "true";
  };

  const focusEnd = (element) => {
    element.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const hideSlashMenu = () => {
    slashMenu.hidden = true;
  };

  const showSlashMenu = (block) => {
    activeBlock = block;
    slashMenu.hidden = false;
    slashMenu.style.top = `${editor.offsetTop + block.offsetTop + block.offsetHeight + 8}px`;
  };

  const maybeShowSlashMenu = (block) => {
    const value = textFromNode(block);
    if (block.dataset.type === "paragraph" && /(?:^|\s)\/[^\s]*$/.test(value)) {
      showSlashMenu(block);
    } else {
      hideSlashMenu();
    }
  };

  const setToolbarState = (type) => {
    toolbarButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.insertType === type);
    });
  };

  const clearDropMarkers = () => {
    editor.querySelectorAll("[data-drop-position]").forEach((block) => block.removeAttribute("data-drop-position"));
  };

  const dropTargetFor = (event) => {
    const target = event.target.closest?.("[data-block]");
    return target?.parentElement === editor ? target : editor.lastElementChild;
  };

  const markDropTarget = (event) => {
    clearDropMarkers();
    const target = dropTargetFor(event);
    if (!target || target === draggedBlock) return;
    const rect = target.getBoundingClientRect();
    target.dataset.dropPosition = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };

  const bindAssetMovement = (block) => {
    block.draggable = true;
    block.addEventListener("dragstart", (event) => {
      const source = event.target;
      if (source?.closest?.("button, input, textarea, a")) {
        event.preventDefault();
        return;
      }
      draggedBlock = block;
      block.classList.add("is-dragging");
      event.dataTransfer?.setData("text/plain", "asset-block");
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    block.addEventListener("dragend", () => {
      draggedBlock = null;
      block.classList.remove("is-dragging");
      clearDropMarkers();
    });
  };

  const moveDraggedBlock = (event) => {
    const block = draggedBlock;
    const target = dropTargetFor(event);
    if (!block || !target || target === block) return;
    const position = target.dataset.dropPosition
      || (event.clientY < target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2 ? "before" : "after");
    if (position === "before") target.before(block);
    else target.after(block);
    draggedBlock = null;
    block.classList.remove("is-dragging");
    clearDropMarkers();
    markDirty();
    renderThumbnail();
    setStatus("이미지 블록 위치를 이동했습니다.", "success");
  };

  const activeTextBlock = () => {
    if (activeBlock?.dataset.block === "text") return activeBlock;
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return element?.closest?.('[data-block="text"]') || null;
  };

  const updateInlineToolbar = () => {
    const block = activeTextBlock();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const isInsideBlock = Boolean(block && range && block.contains(range.commonAncestorContainer));

    inlineToolbarButtons.forEach((button) => {
      let isActive = false;
      if (isInsideBlock) {
        try {
          isActive = document.queryCommandState(button.dataset.inlineCommand);
        } catch (error) {
          isActive = false;
        }
      }
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  };

  const applyInlineCommand = (command, value = null) => {
    const block = activeTextBlock();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!block || !range || !block.contains(range.commonAncestorContainer)) {
      setStatus("먼저 본문에서 서식을 적용할 위치를 선택해주세요.");
      return;
    }

    try {
      const applied = document.execCommand(command, false, value);
      if (!applied) throw new Error("format command failed");
      updateEmpty(block);
      markDirty();
      updateInlineToolbar();
    } catch (error) {
      setStatus("이 브라우저에서는 해당 서식을 적용하지 못했습니다.", "error");
    }
  };

  const addLink = () => {
    const block = activeTextBlock();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!block || !range || !block.contains(range.commonAncestorContainer) || selection.isCollapsed) {
      setStatus("링크를 걸 텍스트를 먼저 선택해주세요.");
      return;
    }

    const currentLink = selection.anchorNode?.parentElement?.closest?.("a");
    const value = window.prompt("링크 주소를 입력해주세요.", currentLink?.getAttribute("href") || "https://");
    if (value === null) return;
    const href = value.trim();
    if (!isSafeHref(href)) {
      setStatus("http, https, mailto 링크만 사용할 수 있습니다.", "error");
      return;
    }
    applyInlineCommand("createLink", href);
  };

  const normalizeAssetWidth = (value) => {
    const width = Number(value);
    if (!Number.isFinite(width)) return 100;
    return Math.min(100, Math.max(25, Math.round(width / 5) * 5));
  };

  const normalizeAssetAlignment = (value) => assetAlignments.has(value) ? value : "left";

  const assetSource = (src) => `./${String(src || "").replace(/^\.\//, "")}`;

  const applyAssetLayout = (block, width = block.dataset.width, align = block.dataset.align) => {
    const normalizedWidth = normalizeAssetWidth(width);
    const normalizedAlign = normalizeAssetAlignment(align);
    block.dataset.width = String(normalizedWidth);
    block.dataset.align = normalizedAlign;
    block.style.setProperty("--asset-width", `${normalizedWidth}%`);

    block.querySelectorAll("[data-asset-width]").forEach((button) => {
      const isActive = Number(button.dataset.assetWidth) === normalizedWidth;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    block.querySelectorAll("[data-asset-align]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.assetAlign === normalizedAlign);
      button.setAttribute("aria-pressed", String(button.dataset.assetAlign === normalizedAlign));
    });
  };

  const createAssetControls = (block) => {
    const controls = document.createElement("div");
    controls.className = "asset-controls";
    controls.setAttribute("aria-label", "첨부 파일 배치 설정");

    const sizeControl = document.createElement("div");
    sizeControl.className = "asset-control asset-control--size";
    sizeControl.append(Object.assign(document.createElement("span"), { textContent: "크기" }));
    const sizeButtons = document.createElement("div");
    sizeButtons.className = "asset-size-buttons";
    [
      [25, "작게"],
      [50, "절반"],
      [75, "넓게"],
      [100, "전체"],
    ].forEach(([value, label]) => {
      const button = document.createElement("button");
      button.className = "asset-size-button";
      button.type = "button";
      button.dataset.assetWidth = String(value);
      button.textContent = `${label} ${value}%`;
      button.setAttribute("aria-label", `첨부 파일 크기 ${value}%`);
      button.addEventListener("click", () => {
        applyAssetLayout(block, value, block.dataset.align);
        markDirty();
      });
      sizeButtons.append(button);
    });
    sizeControl.append(sizeButtons);

    const alignControl = document.createElement("div");
    alignControl.className = "asset-control asset-control--align";
    alignControl.append(Object.assign(document.createElement("span"), { textContent: "위치" }));
    const alignButtons = document.createElement("div");
    alignButtons.className = "asset-align-buttons";
    [
      ["left", "왼쪽"],
      ["center", "가운데"],
      ["right", "오른쪽"],
    ].forEach(([value, label]) => {
      const button = document.createElement("button");
      button.className = "asset-align-button";
      button.type = "button";
      button.dataset.assetAlign = value;
      button.textContent = label;
      button.addEventListener("click", () => {
        applyAssetLayout(block, block.dataset.width, value);
        markDirty();
      });
      alignButtons.append(button);
    });
    alignControl.append(alignButtons);
    controls.append(sizeControl, alignControl);
    return controls;
  };

  const createRemoveButton = () => {
    const button = document.createElement("button");
    button.className = "asset-remove";
    button.type = "button";
    button.setAttribute("aria-label", "블록 삭제");
    button.textContent = "삭제";
    button.addEventListener("click", () => {
      const block = button.closest("[data-block]");
      if (!block) return;
      const wasAsset = block.dataset.block === "asset";
      block.remove();
      if (!editor.children.length) insertBlock("paragraph");
      updateBlockCount();
      markDirty();
      if (wasAsset) {
        renderThumbnail();
        setStatus("첨부 파일을 본문에서 삭제했습니다. 저장하면 assets에서도 정리됩니다.");
      }
    });
    return button;
  };

  const createAssetBlock = (asset) => {
    const assetType = assetTypes.has(asset.type) ? asset.type : "file";
    const block = document.createElement("figure");
    block.className = `editor-block editor-block--asset editor-block--${assetType}`;
    block.dataset.block = "asset";
    block.dataset.type = assetType;
    block.dataset.src = asset.src || "";
    block.dataset.name = asset.name || "asset";
    block.dataset.mime = asset.mime || "";
    block.dataset.width = String(normalizeAssetWidth(asset.width));
    block.dataset.align = normalizeAssetAlignment(asset.align);

    const source = assetSource(asset.src);
    if (assetType === "image") {
      const image = document.createElement("img");
      image.src = source;
      image.alt = asset.alt || asset.name || "업로드 이미지";
      image.loading = "lazy";
      image.draggable = false;
      block.append(image);
    } else if (assetType === "video") {
      const video = document.createElement("video");
      video.src = source;
      video.controls = true;
      video.preload = "metadata";
      block.append(video);
    } else {
      const fileCard = document.createElement("div");
      fileCard.className = "asset-file-card";
      fileCard.append(
        document.createElement("span"),
        document.createElement("div"),
      );
      fileCard.firstElementChild.className = "asset-file-card__icon";
      fileCard.firstElementChild.textContent = "FILE";
      fileCard.lastElementChild.append(
        Object.assign(document.createElement("strong"), { textContent: asset.name || "업로드 파일" }),
        Object.assign(document.createElement("span"), { textContent: asset.mime || "파일" }),
      );
      block.append(fileCard);
    }

    const caption = document.createElement("figcaption");
    caption.className = "asset-caption";
    caption.textContent = asset.name || "업로드 파일";
    block.append(caption, createAssetControls(block), createRemoveButton());
    applyAssetLayout(block);
    bindAssetMovement(block);
    return block;
  };

  const bindTextBlock = (block) => {
    block.addEventListener("focus", () => {
      activeBlock = block;
      setToolbarState(block.dataset.type);
      maybeShowSlashMenu(block);
      updateInlineToolbar();
    });
    block.addEventListener("input", () => {
      updateEmpty(block);
      maybeShowSlashMenu(block);
      updateBlockCount();
      markDirty();
      updateInlineToolbar();
    });
    block.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (!slashMenu.matches(":hover")) hideSlashMenu();
      }, 100);
    });
    block.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const nextType = ["bullet", "numbered"].includes(block.dataset.type) ? block.dataset.type : "paragraph";
        const next = insertBlock(nextType, block);
        focusEnd(next);
        hideSlashMenu();
        return;
      }
      if (event.key === "Backspace" && !blockText(block) && editor.children.length > 1) {
        event.preventDefault();
        const previous = block.previousElementSibling;
        block.remove();
        if (previous && previous.isContentEditable) focusEnd(previous);
        updateBlockCount();
        markDirty();
      }
    });
  };

  const createTextBlock = (type = "paragraph", text = "", html = "") => {
    const block = document.createElement("div");
    block.className = `editor-block editor-block--${type}`;
    block.dataset.block = "text";
    block.dataset.type = textTypes.has(type) ? type : "paragraph";
    block.dataset.placeholder = placeholders[block.dataset.type] || placeholders.paragraph;
    block.contentEditable = "true";
    block.spellcheck = true;
    if (html) block.innerHTML = sanitizeInlineHtml(html);
    else block.textContent = text;
    updateEmpty(block);
    bindTextBlock(block);
    return block;
  };

  const createDividerBlock = () => {
    const block = document.createElement("div");
    block.className = "editor-block editor-block--divider";
    block.dataset.block = "divider";
    block.dataset.type = "divider";
    const rule = document.createElement("hr");
    block.append(rule, createRemoveButton());
    return block;
  };

  function insertBlock(type = "paragraph", after = null, text = "") {
    const block = type === "divider" ? createDividerBlock() : createTextBlock(type, text);
    if (after && after.parentElement === editor) after.after(block);
    else editor.append(block);
    updateBlockCount();
    return block;
  }

  const changeBlockType = (type) => {
    if (!textTypes.has(type)) return;
    const target = activeBlock && activeBlock.dataset.block === "text" ? activeBlock : editor.lastElementChild;
    if (!target || target.dataset.block !== "text") {
      const created = insertBlock(type);
      focusEnd(created);
      return;
    }
    target.className = `editor-block editor-block--${type}`;
    target.dataset.type = type;
    target.dataset.placeholder = placeholders[type] || placeholders.paragraph;
    updateEmpty(target);
    activeBlock = target;
    setToolbarState(type);
    focusEnd(target);
    markDirty();
  };

  const insertDivider = () => {
    const target = activeBlock && activeBlock.parentElement === editor ? activeBlock : editor.lastElementChild;
    const divider = insertBlock("divider", target);
    const paragraph = insertBlock("paragraph", divider);
    focusEnd(paragraph);
    hideSlashMenu();
    markDirty();
  };

  const updateBlockCount = () => {
    const total = editor.querySelectorAll("[data-block]").length;
    blockCount.textContent = `블록 ${total}개`;
  };

  const collectBlocks = () => [...editor.querySelectorAll("[data-block]")].map((block) => {
    if (block.dataset.block === "divider") return { type: "divider" };
    if (block.dataset.block === "asset") {
      return {
        type: block.dataset.type,
        src: block.dataset.src,
        name: block.dataset.name,
        mime: block.dataset.mime,
        width: normalizeAssetWidth(block.dataset.width),
        align: normalizeAssetAlignment(block.dataset.align),
      };
    }
    const data = {
      type: block.dataset.type,
      text: blockText(block),
    };
    const html = sanitizeInlineHtml(block.innerHTML);
    if (/<(?:strong|b|em|i|u|s|del|code|a|br)(?:\s|>)/i.test(html)) data.html = html;
    return data;
  });

  const setEditorBlocks = (blocks) => {
    editor.replaceChildren();
    (blocks || []).forEach((block) => {
      if (block.type === "divider") editor.append(insertBlock("divider"));
      else if (["image", "video", "file"].includes(block.type)) editor.append(createAssetBlock(block));
      else editor.append(createTextBlock(block.type, block.text || "", block.html || ""));
    });
    if (!editor.children.length) insertBlock("paragraph");
    updateBlockCount();
    renderThumbnail();
  };

  const firstBodyImage = () => [...editor.querySelectorAll('[data-block="asset"]')]
    .find((block) => block.dataset.type === "image");

  const clearPendingCover = () => {
    if (pendingCoverUrl) URL.revokeObjectURL(pendingCoverUrl);
    pendingCoverFile = null;
    pendingCoverUrl = "";
  };

  const coverFileName = (src) => String(src || "").split("/").pop() || "썸네일 사진";

  const renderThumbnail = () => {
    const bodyImage = firstBodyImage();
    const isExplicit = Boolean(coverSrc || pendingCoverFile);
    const source = pendingCoverUrl || (coverSrc ? assetSource(coverSrc) : bodyImage ? assetSource(bodyImage.dataset.src) : "");
    const name = pendingCoverFile?.name || (coverSrc ? coverFileName(coverSrc) : bodyImage?.dataset.name || "본문 첫 사진");

    thumbnailPreview.replaceChildren();
    if (source) {
      const image = document.createElement("img");
      image.src = source;
      image.alt = titleInput.value || "글 썸네일";
      image.loading = "lazy";
      thumbnailPreview.append(
        image,
        Object.assign(document.createElement("span"), {
          className: "thumbnail-preview__name",
          textContent: name,
        }),
      );
    } else {
      thumbnailPreview.append(Object.assign(document.createElement("p"), {
        className: "thumbnail-preview__empty",
        textContent: "본문에 사진을 추가하면 첫 사진이 자동으로 표시됩니다.",
      }));
    }

    thumbnailState.textContent = isExplicit
      ? "직접 선택한 사진"
      : bodyImage
        ? "본문 첫 사진 사용 중"
        : "사진 없음";
    thumbnailReset.hidden = !isExplicit;
  };

  const uploadAssetFile = async (file, uploadSlug, uploadName = file.name) => {
    const formData = new FormData();
    formData.append("file", file, uploadName);
    formData.append("slug", uploadSlug);
    const response = await fetch("./api/upload", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "파일 업로드에 실패했습니다.");
    return data;
  };

  const getClientAssetType = (file) => {
    const name = String(file.name || "");
    if (file.type.startsWith("image/") || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(name)) return "image";
    if (file.type.startsWith("video/") || /\.(avi|m4v|mkv|mov|mp4|mpeg|webm|wmv)$/i.test(name)) return "video";
    return "file";
  };

  const requestFileName = (file) => new Promise((resolve) => {
    if (!assetDialog || !assetNameForm || !assetNameInput || typeof assetDialog.showModal !== "function") {
      const fallback = window.prompt("업로드할 파일 이름을 입력해주세요.", file.name);
      resolve(fallback ? fallback.trim() : null);
      return;
    }

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      assetNameForm.removeEventListener("submit", onSubmit);
      assetNameCancel?.removeEventListener("click", onCancel);
      assetDialog.removeEventListener("cancel", onCancel);
      if (assetDialog.open) assetDialog.close();
      resolve(value);
    };
    const onSubmit = (event) => {
      event.preventDefault();
      const value = assetNameInput.value.trim();
      if (!value) {
        assetNameInput.focus();
        return;
      }
      finish(value);
    };
    const onCancel = (event) => {
      event?.preventDefault();
      finish(null);
    };

    assetNameInput.value = file.name;
    assetNameHint.textContent = `“${file.name}” 파일이 본문에 표시될 이름을 정해주세요.`;
    assetNameForm.addEventListener("submit", onSubmit);
    assetNameCancel?.addEventListener("click", onCancel);
    assetDialog.addEventListener("cancel", onCancel);
    assetDialog.showModal();
    window.requestAnimationFrame(() => {
      assetNameInput.focus();
      assetNameInput.select();
    });
  });

  const uploadFiles = async (files) => {
    if (!files.length) return;
    const uploadSlug = slugInput.value.trim() || slugify(titleInput.value) || "draft";
    let insertionPoint = activeBlock?.parentElement === editor ? activeBlock : editor.lastElementChild;
    let uploadedCount = 0;
    for (const file of files) {
      let uploadName = file.name;
      if (getClientAssetType(file) === "file") {
        uploadName = await requestFileName(file);
        if (!uploadName) {
          setStatus(`${file.name} 업로드를 취소했습니다.`);
          continue;
        }
      }
      setSaveState(`업로드 중 · ${uploadName}`, "busy");
      try {
        const data = await uploadAssetFile(file, uploadSlug, uploadName);
        const assetBlock = createAssetBlock(data);
        if (insertionPoint?.parentElement === editor) insertionPoint.after(assetBlock);
        else editor.append(assetBlock);
        insertionPoint = assetBlock;
        updateBlockCount();
        renderThumbnail();
        markDirty();
        uploadedCount += 1;
      } catch (error) {
        setSaveState("업로드 실패", "error");
        setStatus(`${uploadName}: ${error.message} Python 서버가 실행 중인지 확인해주세요.`, "error");
        return;
      }
    }
    if (!uploadedCount) return;
    setSaveState("저장되지 않음", "dirty");
    setStatus("파일이 선택한 글 블록 다음에 추가되었습니다. 드래그해서 위치를 바꿀 수 있습니다.");
  };

  const savePost = async () => {
    if (isSaving) return;
    const title = titleInput.value.trim();
    if (!title) {
      setStatus("먼저 글 제목을 입력해주세요.", "error");
      titleInput.focus();
      return;
    }

    isSaving = true;
    publishButton.disabled = true;
    setSaveState("저장하는 중…", "busy");
    setStatus("");
    const payload = {
      slug: slugInput.value.trim() || slugify(title),
      title,
      excerpt: excerptInput.value.trim(),
      tags: tagsInput.value.split(",").map((tag) => tag.trim()).filter(Boolean),
      status: "published",
      cover: coverSrc || null,
      blocks: collectBlocks(),
    };

    try {
      if (pendingCoverFile) {
        const thumbnailFile = pendingCoverFile;
        setSaveState("썸네일 업로드 중…", "busy");
        const thumbnail = await uploadAssetFile(thumbnailFile, payload.slug, thumbnailFile.name);
        if (thumbnail.type !== "image") throw new Error("썸네일은 이미지 파일만 사용할 수 있습니다.");
        coverSrc = thumbnail.src;
        payload.cover = coverSrc;
        clearPendingCover();
        renderThumbnail();
      }
      const response = await fetch("./api/save-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "글 저장에 실패했습니다.");
      currentSlug = data.post.slug;
      slugInput.value = currentSlug;
      deleteButton.hidden = false;
      editorMode.textContent = "EDITING / PUBLISHED";
      previewButton.disabled = false;
      window.history.replaceState({}, "", `./editor.html?slug=${encodeURIComponent(currentSlug)}`);
      setSaveState("공개됨", "saved");
      setStatus("글을 저장했습니다. 홈에서 확인할 수 있어요.", "success");
      loadHistory();
    } catch (error) {
      setSaveState("저장 실패", "error");
      setStatus(`${error.message} Python 서버가 실행 중인지 확인해주세요.`, "error");
    } finally {
      isSaving = false;
      publishButton.disabled = false;
    }
  };

  const deletePost = async () => {
    if (!currentSlug || isSaving || isDeleting) return;

    const title = titleInput.value.trim() || "제목 없음";
    const confirmed = window.confirm(
      `“${title}” 글을 삭제할까요?\n글 본문과 관련된 업로드 파일·이미지도 함께 삭제되며, 되돌릴 수 없습니다.`,
    );
    if (!confirmed) return;

    isDeleting = true;
    deleteButton.disabled = true;
    publishButton.disabled = true;
    previewButton.disabled = true;
    setSaveState("삭제하는 중…", "busy");
    setStatus("");

    try {
      const response = await fetch(`./api/post?slug=${encodeURIComponent(currentSlug)}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "글 삭제에 실패했습니다.");

      currentSlug = "";
      slugWasEdited = false;
      coverSrc = "";
      clearPendingCover();
      titleInput.value = "";
      excerptInput.value = "";
      tagsInput.value = "";
      slugInput.value = "";
      setEditorBlocks([{ type: "paragraph", text: "" }]);
      editorMode.textContent = "NEW ENTRY";
      deleteButton.hidden = true;
      previewButton.disabled = true;
      window.history.replaceState({}, "", "./editor.html?new=1");
      setSaveState("저장 대기");
      setStatus(`글과 관련 파일 ${data.deletedAssets?.length || 0}개를 삭제했습니다.`, "success");
      loadHistory();
      focusEnd(editor.firstElementChild);
    } catch (error) {
      setSaveState("삭제 실패", "error");
      setStatus(`${error.message} Python 서버가 실행 중인지 확인해주세요.`, "error");
    } finally {
      isDeleting = false;
      deleteButton.disabled = false;
      publishButton.disabled = false;
      previewButton.disabled = !currentSlug;
    }
  };

  const loadPost = async () => {
    if (!currentSlug) {
      coverSrc = "";
      clearPendingCover();
      setEditorBlocks([{ type: "paragraph", text: "" }]);
      editorMode.textContent = "NEW ENTRY";
      focusEnd(editor.firstElementChild);
      isLoading = false;
      return;
    }

    try {
      const response = await fetch(`./api/post?slug=${encodeURIComponent(currentSlug)}`, { cache: "no-store" });
      const post = await response.json();
      if (!response.ok) throw new Error(post.error || "글을 불러오지 못했습니다.");
      titleInput.value = post.title || "";
      excerptInput.value = post.excerpt || "";
      tagsInput.value = (post.tags || []).join(", ");
      slugInput.value = post.slug || currentSlug;
      coverSrc = typeof post.cover === "string" ? post.cover : "";
      clearPendingCover();
      setEditorBlocks(post.blocks);
      editorMode.textContent = post.status === "published" ? "EDITING / PUBLISHED" : "EDITING / DRAFT";
      deleteButton.hidden = false;
      previewButton.disabled = post.status !== "published";
      setSaveState("저장됨", "saved");
      setStatus("기존 글을 불러왔습니다.");
    } catch (error) {
      setStatus(`${error.message} 새 글로 시작하려면 주소에서 ?slug=를 지워주세요.`, "error");
      setEditorBlocks([{ type: "paragraph", text: "" }]);
    } finally {
      isLoading = false;
    }
  };

  toolbarButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.insertType === "divider") insertDivider();
      else changeBlockType(button.dataset.insertType);
    });
  });

  inlineToolbarButtons.forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => applyInlineCommand(button.dataset.inlineCommand));
  });
  inlineLinkButton?.addEventListener("mousedown", (event) => event.preventDefault());
  inlineLinkButton?.addEventListener("click", addLink);
  document.addEventListener("selectionchange", updateInlineToolbar);

  newPostButton.addEventListener("click", () => {
    window.location.href = "./editor.html?new=1";
  });

  document.querySelectorAll("[data-slash-type]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      if (!activeBlock) return;
      activeBlock.textContent = activeBlock.textContent.replace(/\/[^\s]*$/, "");
      if (button.dataset.slashType === "divider") insertDivider();
      else changeBlockType(button.dataset.slashType);
      hideSlashMenu();
    });
  });

  thumbnailTrigger.addEventListener("click", () => thumbnailInput.click());
  thumbnailInput.addEventListener("change", () => {
    const file = thumbnailInput.files?.[0];
    thumbnailInput.value = "";
    if (!file) return;
    if (getClientAssetType(file) !== "image") {
      setStatus("썸네일은 이미지 파일만 선택할 수 있습니다.", "error");
      return;
    }
    clearPendingCover();
    pendingCoverFile = file;
    pendingCoverUrl = URL.createObjectURL(file);
    renderThumbnail();
    markDirty();
    setStatus("썸네일 사진을 선택했습니다. 저장하면 프로젝트 폴더에 업로드됩니다.");
  });
  thumbnailReset.addEventListener("click", () => {
    clearPendingCover();
    coverSrc = "";
    renderThumbnail();
    markDirty();
    setStatus("썸네일을 초기화했습니다. 저장하면 본문 첫 사진을 사용합니다.");
  });

  assetTrigger.addEventListener("click", () => assetInput.click());
  assetInput.addEventListener("change", () => {
    uploadFiles([...assetInput.files]);
    assetInput.value = "";
  });
  editor.addEventListener("dragover", (event) => {
    if (draggedBlock) {
      event.preventDefault();
      event.dataTransfer && (event.dataTransfer.dropEffect = "move");
      markDropTarget(event);
      return;
    }
    event.preventDefault();
    editor.classList.add("is-dragging");
  });
  editor.addEventListener("dragleave", () => editor.classList.remove("is-dragging"));
  editor.addEventListener("drop", (event) => {
    if (draggedBlock) {
      event.preventDefault();
      event.stopPropagation();
      moveDraggedBlock(event);
      return;
    }
    event.preventDefault();
    editor.classList.remove("is-dragging");
    uploadFiles([...event.dataTransfer.files]);
  });

  titleInput.addEventListener("input", () => {
    if (!slugWasEdited) slugInput.value = slugify(titleInput.value);
    markDirty();
  });
  [excerptInput, tagsInput].forEach((input) => input.addEventListener("input", markDirty));
  slugInput.addEventListener("input", () => {
    slugWasEdited = true;
    markDirty();
  });
  publishButton.addEventListener("click", () => savePost());
  deleteButton.addEventListener("click", () => deletePost());
  previewButton.addEventListener("click", () => {
    if (currentSlug) window.open(`./post.html?slug=${encodeURIComponent(currentSlug)}`, "_blank", "noopener");
  });
  form.addEventListener("submit", (event) => event.preventDefault());
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      savePost();
    }
    if (event.key === "Escape") hideSlashMenu();
  });

  loadHistory();
  loadPost();
})();
