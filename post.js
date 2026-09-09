(() => {
  const root = document.querySelector("#post-root");
  if (!root) return;

  const { sanitizeInlineHtml } = window.HshimRichText;

  const slug = new URLSearchParams(window.location.search).get("slug") || "";

  const createText = (tagName, className, value) => {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = value || "";
    return element;
  };

  const createRichText = (tagName, className, block) => {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    const html = sanitizeInlineHtml(block.html);
    if (html) element.innerHTML = html;
    else element.textContent = block.text || "";
    return element;
  };

  const assetUrl = (src) => `./${String(src || "").replace(/^\.\//, "")}`;

  const assetWidth = (value) => {
    const width = Number(value);
    if (!Number.isFinite(width)) return 100;
    return Math.min(100, Math.max(25, Math.round(width / 5) * 5));
  };

  const assetAlign = (value) => ["left", "center", "right"].includes(value) ? value : "left";

  const imageDialog = document.querySelector("#image-dialog");
  const imageDialogImage = imageDialog?.querySelector("[data-image-dialog-image]");
  const imageDialogClose = imageDialog?.querySelector("[data-image-dialog-close]");
  const imageDialogViewport = imageDialog?.querySelector("[data-image-dialog-viewport]");
  const imageZoomOut = imageDialog?.querySelector("[data-image-zoom-out]");
  const imageZoomIn = imageDialog?.querySelector("[data-image-zoom-in]");
  const imageZoomReset = imageDialog?.querySelector("[data-image-zoom-reset]");
  const imageZoomValue = imageDialog?.querySelector("[data-image-zoom-value]");
  const imageZoomMin = 0.5;
  const imageZoomMax = 4;
  const imageZoomStep = 0.25;
  let imageZoom = 1;
  let imagePanX = 0;
  let imagePanY = 0;
  let imageDrag = null;
  let imageDialogTrigger = null;

  const getImagePanBounds = () => {
    if (!imageDialogImage || !imageDialogViewport) return { x: 0, y: 0 };
    const viewportStyle = getComputedStyle(imageDialogViewport);
    const horizontalPadding = parseFloat(viewportStyle.paddingLeft) + parseFloat(viewportStyle.paddingRight);
    const verticalPadding = parseFloat(viewportStyle.paddingTop) + parseFloat(viewportStyle.paddingBottom);
    const availableWidth = Math.max(0, imageDialogViewport.clientWidth - horizontalPadding);
    const availableHeight = Math.max(0, imageDialogViewport.clientHeight - verticalPadding);
    return {
      x: Math.max(0, (imageDialogImage.offsetWidth * imageZoom - availableWidth) / 2),
      y: Math.max(0, (imageDialogImage.offsetHeight * imageZoom - availableHeight) / 2),
    };
  };

  const setImagePan = (x, y) => {
    if (!imageDialogImage) return;
    const bounds = getImagePanBounds();
    imagePanX = Math.min(bounds.x, Math.max(-bounds.x, Number(x) || 0));
    imagePanY = Math.min(bounds.y, Math.max(-bounds.y, Number(y) || 0));
    imageDialogImage.style.setProperty("--image-pan-x", `${imagePanX}px`);
    imageDialogImage.style.setProperty("--image-pan-y", `${imagePanY}px`);
  };

  const updateImageZoom = (value, focalPoint = null) => {
    if (!imageDialogImage) return;
    const nextZoom = Math.min(imageZoomMax, Math.max(imageZoomMin, Math.round(value * 100) / 100));
    if (focalPoint && nextZoom !== imageZoom) {
      const imageRect = imageDialogImage.getBoundingClientRect();
      const zoomRatio = nextZoom / imageZoom;
      const pointFromImageCenterX = focalPoint.clientX - (imageRect.left + imageRect.width / 2);
      const pointFromImageCenterY = focalPoint.clientY - (imageRect.top + imageRect.height / 2);
      imagePanX += pointFromImageCenterX * (1 - zoomRatio);
      imagePanY += pointFromImageCenterY * (1 - zoomRatio);
    }
    imageZoom = nextZoom;
    imageDialogImage.style.setProperty("--image-scale", String(imageZoom));
    setImagePan(imagePanX, imagePanY);
    if (imageZoomValue) imageZoomValue.textContent = `${Math.round(imageZoom * 100)}%`;
    if (imageZoomOut) imageZoomOut.disabled = imageZoom <= imageZoomMin;
    if (imageZoomIn) imageZoomIn.disabled = imageZoom >= imageZoomMax;
  };

  const resetImageDialog = () => {
    imageDrag = null;
    if (imageDialogImage) {
      imageDialogImage.removeAttribute("src");
      imageDialogImage.alt = "";
      imageDialogImage.classList.remove("is-dragging");
    }
    imagePanX = 0;
    imagePanY = 0;
    updateImageZoom(1);
    setImagePan(0, 0);
    const trigger = imageDialogTrigger;
    imageDialogTrigger = null;
    if (trigger?.isConnected) trigger.focus();
  };

  const closeImageDialog = () => {
    if (!imageDialog) return;
    if (imageDialog.open && typeof imageDialog.close === "function") imageDialog.close();
    else {
      imageDialog.removeAttribute("open");
      resetImageDialog();
    }
  };

  const openImageDialog = (trigger) => {
    const source = trigger.querySelector("img");
    if (!imageDialog || !imageDialogImage || !source) return;
    imageDialogTrigger = trigger;
    imageDialogImage.src = source.currentSrc || source.src;
    imageDialogImage.alt = source.alt || "본문 이미지";
    updateImageZoom(1);
    if (typeof imageDialog.showModal === "function") imageDialog.showModal();
    else imageDialog.setAttribute("open", "");
    imageDialogClose?.focus();
  };

  imageDialog?.addEventListener("close", resetImageDialog);
  imageDialogClose?.addEventListener("click", closeImageDialog);
  imageZoomOut?.addEventListener("click", () => updateImageZoom(imageZoom - imageZoomStep));
  imageZoomIn?.addEventListener("click", () => updateImageZoom(imageZoom + imageZoomStep));
  imageZoomReset?.addEventListener("click", () => updateImageZoom(1));
  imageDialog?.addEventListener("click", (event) => {
    if (event.target === imageDialog) closeImageDialog();
  });
  imageDialog?.addEventListener("keydown", (event) => {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      updateImageZoom(imageZoom + imageZoomStep);
    } else if (event.key === "-") {
      event.preventDefault();
      updateImageZoom(imageZoom - imageZoomStep);
    } else if (event.key === "0") {
      event.preventDefault();
      updateImageZoom(1);
    }
  });
  imageDialogImage?.addEventListener("load", () => setImagePan(imagePanX, imagePanY));
  imageDialogImage?.addEventListener("dragstart", (event) => event.preventDefault());
  imageDialogImage?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    imageDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPanX: imagePanX,
      startPanY: imagePanY,
    };
    imageDialogImage.setPointerCapture?.(event.pointerId);
    imageDialogImage.classList.add("is-dragging");
    event.preventDefault();
  });
  imageDialogImage?.addEventListener("pointermove", (event) => {
    if (!imageDrag || event.pointerId !== imageDrag.pointerId) return;
    setImagePan(
      imageDrag.startPanX + event.clientX - imageDrag.startX,
      imageDrag.startPanY + event.clientY - imageDrag.startY,
    );
    event.preventDefault();
  });
  const finishImageDrag = (event) => {
    if (!imageDrag || event.pointerId !== imageDrag.pointerId) return;
    if (imageDialogImage?.hasPointerCapture?.(event.pointerId)) imageDialogImage.releasePointerCapture(event.pointerId);
    imageDialogImage?.classList.remove("is-dragging");
    imageDrag = null;
  };
  imageDialogImage?.addEventListener("pointerup", finishImageDrag);
  imageDialogImage?.addEventListener("pointercancel", finishImageDrag);
  imageDialogViewport?.addEventListener("wheel", (event) => {
    if (!imageDialog?.open) return;
    event.preventDefault();
    updateImageZoom(
      imageZoom + (event.deltaY < 0 ? imageZoomStep : -imageZoomStep),
      { clientX: event.clientX, clientY: event.clientY },
    );
  }, { passive: false });

  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const trigger = target?.closest(".post-image-trigger");
    if (!trigger || !root.contains(trigger)) return;
    openImageDialog(trigger);
  });

  const formatDate = (value) => {
    if (!value) return "날짜 미정";
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(value));
  };

  const renderAsset = (block) => {
    const figure = document.createElement("figure");
    figure.className = `post-block post-block--asset post-block--${block.type}`;
    figure.dataset.align = assetAlign(block.align);
    figure.style.setProperty("--asset-width", `${assetWidth(block.width)}%`);
    if (block.type === "image") {
      const image = document.createElement("img");
      image.src = assetUrl(block.src);
      image.alt = block.alt || block.name || "본문 이미지";
      image.loading = "lazy";
      const trigger = document.createElement("button");
      trigger.className = "post-image-trigger";
      trigger.type = "button";
      trigger.setAttribute("aria-label", `${image.alt} 크게 보기`);
      trigger.append(image);
      figure.append(trigger);
    } else if (block.type === "video") {
      const video = document.createElement("video");
      video.src = assetUrl(block.src);
      video.controls = true;
      video.preload = "metadata";
      figure.append(video);
    } else {
      const link = document.createElement("a");
      link.className = "post-file-link";
      link.href = assetUrl(block.src);
      link.target = "_blank";
      link.rel = "noreferrer";
      link.append(
        createText("span", "post-file-link__icon", "FILE"),
        createText("span", "post-file-link__name", block.name || "첨부 파일"),
        createText("span", "post-file-link__arrow", "↗"),
      );
      figure.append(link);
    }
    if (block.name && block.type !== "file") figure.append(createText("figcaption", "", block.name));
    return figure;
  };

  const renderBlock = (block) => {
    const type = block.type || "paragraph";
    if (["image", "video", "file"].includes(type)) return renderAsset(block);
    if (type === "divider") {
      const divider = document.createElement("hr");
      divider.className = "post-block post-block--divider";
      return divider;
    }
    if (type === "heading1" || type === "heading2") return createRichText("h2", `post-block post-block--${type}`, block);
    if (type === "quote") return createRichText("blockquote", "post-block post-block--quote", block);
    if (type === "code") return createText("pre", "post-block post-block--code", block.text);
    if (type === "bullet" || type === "numbered") {
      const list = document.createElement(type === "numbered" ? "ol" : "ul");
      list.className = `post-block post-block--list post-block--${type}`;
      list.append(createRichText("li", "", block));
      return list;
    }
    return createRichText("p", "post-block post-block--paragraph", block);
  };

  const renderPost = (post) => {
    document.title = `hshim - 기록 | ${post.title || "기록"}`;
    root.replaceChildren();

    const backLink = document.createElement("a");
    backLink.className = "post-back-link";
    backLink.href = "./journal.html";
    backLink.append(document.createTextNode("← 기록 목록"));

    const header = document.createElement("header");
    header.className = "post-article__header";
    header.append(
      createText("p", "section-eyebrow", "HSHIM STUDIO / NOTE"),
      createText("h1", "post-article__title", post.title || "제목 없음"),
      createText("p", "post-article__excerpt", post.excerpt || ""),
    );

    const meta = document.createElement("div");
    meta.className = "post-article__meta";
    meta.append(
      createText("span", "", formatDate(post.publishedAt || post.updatedAt)),
      createText("span", "", `${post.readingTime || 1}분 읽기`),
    );
    const tags = document.createElement("div");
    tags.className = "post-article__tags";
    (post.tags || []).forEach((tag) => tags.append(createText("span", "tag", `#${tag}`)));
    meta.append(tags);

    const content = document.createElement("article");
    content.className = "post-article__content";
    (post.blocks || []).forEach((block) => content.append(renderBlock(block)));

    const footer = document.createElement("div");
    footer.className = "post-article__footer";
    footer.append(
      createText("span", "", "HSHIM / BACKEND NOTES"),
    );

    root.append(backLink, header, meta, content, footer);
  };

  const loadPost = async () => {
    if (!slug) {
      root.replaceChildren(
        createText("p", "section-eyebrow", "MISSING NOTE"),
        createText("h1", "post-error-title", "열어볼 기록이 없습니다."),
        createText("p", "post-error-detail", "기록 목록에서 글을 선택해주세요."),
      );
      return;
    }
    try {
      // GitHub Pages is static, so published notes must be read from the
      // generated JSON file rather than the local Python API.
      const response = await fetch(`./posts/${encodeURIComponent(slug)}.json?ts=${Date.now()}`, { cache: "no-store" });
      const post = await response.json();
      if (!response.ok) throw new Error(post.error || "글을 찾을 수 없습니다.");
      renderPost(post);
    } catch (error) {
      root.replaceChildren(
        createText("p", "section-eyebrow", "NOTE NOT FOUND"),
        createText("h1", "post-error-title", "기록을 불러오지 못했습니다."),
        createText("p", "post-error-detail", `${error.message} 기록 목록으로 돌아가 다시 선택해주세요.`),
      );
    }
  };

  loadPost();
})();
