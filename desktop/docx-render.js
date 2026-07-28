"use strict";

function decodeBase64(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function timeout(delay, message) {
  return new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error(message)), delay);
  });
}

async function waitForImages(container) {
  const images = [...container.querySelectorAll("img")];
  await Promise.all(images.map(image => {
    if (image.complete) {
      if (image.naturalWidth === 0) throw new Error("A Word document image failed to load");
      return undefined;
    }
    return new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", () => reject(new Error("A Word document image failed to load")), { once: true });
    });
  }));
  return images.length;
}

window.docflowRenderDocx = async base64 => {
  if (!window.docx || typeof window.docx.renderAsync !== "function") {
    throw new Error("The bundled DOCX renderer failed to load");
  }
  const documentContainer = document.getElementById("document-container");
  const styleContainer = document.getElementById("style-container");
  documentContainer.replaceChildren();
  styleContainer.replaceChildren();
  document.documentElement.removeAttribute("data-render-complete");

  const bytes = decodeBase64(base64);
  await window.docx.renderAsync(bytes.buffer, documentContainer, styleContainer, {
    breakPages: true,
    debug: false,
    ignoreFonts: false,
    ignoreHeight: false,
    ignoreLastRenderedPageBreak: false,
    ignoreWidth: false,
    inWrapper: true,
    renderChanges: false,
    renderEndnotes: true,
    renderFooters: true,
    renderFootnotes: true,
    renderHeaders: true,
    trimXmlDeclaration: true,
    useBase64URL: true
  });

  if (document.fonts?.ready) {
    await Promise.race([document.fonts.ready, timeout(15_000, "Timed out waiting for Word document fonts")]);
  }
  const imageCount = await Promise.race([
    waitForImages(documentContainer),
    timeout(15_000, "Timed out waiting for Word document images")
  ]);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const pageElements = [...documentContainer.querySelectorAll("section.docx")];
  if (!pageElements.length) throw new Error("The Word document renderer produced no pages");
  const pageSizes = pageElements.map(page => {
    const pageStyle = getComputedStyle(page);
    const pageBounds = page.getBoundingClientRect();
    const width = Number.parseFloat(pageStyle.width) || pageBounds.width;
    const height = Number.parseFloat(pageStyle.minHeight)
      || Number.parseFloat(pageStyle.height)
      || pageBounds.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error("The Word document renderer produced an invalid page size");
    }
    return { width, height };
  });
  const [firstPageSize] = pageSizes;
  const mixedPageSizes = pageSizes.some(size => (
    Math.abs(size.width - firstPageSize.width) > 1
    || Math.abs(size.height - firstPageSize.height) > 1
  ));
  if (mixedPageSizes) {
    throw new Error("Mixed page sizes or orientations in one Word document are not supported by the local PDF renderer");
  }
  document.documentElement.dataset.renderComplete = "true";
  return {
    pages: pageElements.length,
    images: imageCount,
    pageWidthPx: firstPageSize.width,
    pageHeightPx: firstPageSize.height,
    pageSizes
  };
};
