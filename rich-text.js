(() => {
  const allowedTags = new Set(["strong", "b", "em", "i", "u", "s", "del", "code", "a"]);
  const blockedTags = new Set(["script", "style", "iframe", "object", "embed", "svg", "math"]);

  const isSafeHref = (value) => /^(?:https?:|mailto:)/i.test(String(value || "").trim());

  const sanitizeInlineHtml = (value) => {
    const template = document.createElement("template");
    template.innerHTML = String(value || "");

    const sanitizeNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return [document.createTextNode(node.nodeValue || "")];
      if (node.nodeType !== Node.ELEMENT_NODE) return [];

      const tagName = node.tagName.toLowerCase();
      if (tagName === "br") return [document.createElement("br")];
      if (blockedTags.has(tagName)) return [];
      const children = [...node.childNodes].flatMap(sanitizeNode);
      if (!allowedTags.has(tagName)) return children;

      if (tagName === "a") {
        const href = node.getAttribute("href")?.trim() || "";
        if (!isSafeHref(href)) return children;
        const link = document.createElement("a");
        link.href = href;
        link.target = "_blank";
        link.rel = "noreferrer noopener";
        children.forEach((child) => link.append(child));
        return [link];
      }

      const element = document.createElement(tagName);
      children.forEach((child) => element.append(child));
      return [element];
    };

    const container = document.createElement("div");
    [...template.content.childNodes].flatMap(sanitizeNode).forEach((node) => container.append(node));
    return container.innerHTML;
  };

  const textFromNode = (node) => {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    if (node.tagName.toLowerCase() === "br") return "\n";
    return [...node.childNodes].map(textFromNode).join("");
  };

  window.HshimRichText = {
    isSafeHref,
    sanitizeInlineHtml,
    textFromNode,
  };
})();
