import { Window } from "happy-dom";

export const flush = () => new Promise((resolve) => setImmediate(resolve));

// A fresh happy-dom page with an empty #root; `body` carries the text colour previews fall back to.
export function page() {
  const window = new Window();
  window.document.body.style.color = "rgb(10, 20, 30)";
  const root = window.document.createElement("div");
  window.document.body.append(root);
  return { window, document: window.document, root };
}

export const SVG_TINT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path fill="currentColor" d="M0 0h8v8z"/></svg>';
export const SVG_LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path fill="#ff0000" d="M0 0h8v8z"/></svg>';

export const decodeDataUrl = (url) => Buffer.from(url.split(",")[1], "base64").toString("utf8");
