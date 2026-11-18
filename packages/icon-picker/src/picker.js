// The Colour + Icon block: Auto swatch, the host's palette, any colour, icon search through the
// host's `search`, upload, Default icon. DOM built node by node; an SVG string only ever becomes
// a base64 data URL (an <img> src or a CSS mask), never markup.
import { squareImage } from "./image.js";

const DEBOUNCE_MS = 320;
const FALLBACK_COLOR = "#3e7bfa";
const HEX_RE = /^#[0-9a-f]{6}$/i;
const CREDIT_SETS = " (Material, Fluent, Phosphor, Lucide, Tabler, Simple Icons, logos…)";

function svgDataUrl(svg) {
  let binary = "";
  for (const byte of new TextEncoder().encode(svg)) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

const isAbort = (err) => Boolean(err) && err.name === "AbortError";

/**
 * @typedef {{ icon: string, tint: boolean, iconify: string | null, color: string }} IconPickerValue
 * @param {HTMLElement} root
 * @param {{
 *   value?: Partial<IconPickerValue>,
 *   palette?: { label: string, value: string }[],
 *   suggestions?: string[],
 *   search: (query: string, options: { signal: AbortSignal }) => Promise<{ name: string, svg: string }[]>,
 *   onChange?: (value: IconPickerValue) => void,
 *   placeholder?: string,
 *   uploadSize?: number,
 * }} options
 * @returns {{ getValue(): IconPickerValue, setValue(value: Partial<IconPickerValue>): void, destroy(): void }}
 */
export function mountIconPicker(root, options) {
  const { palette = [], suggestions = [], search, onChange, placeholder = "Search icons", uploadSize = 64 } = options;
  const doc = root.ownerDocument;
  const make = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (className, text) => {
    const node = make("button", className, text);
    node.type = "button";
    return node;
  };
  const normalize = (v = {}) => ({
    icon: v.icon || "", tint: Boolean(v.tint), iconify: v.iconify || null, color: v.color || "",
  });

  let pick = normalize(options.value);
  let found = [];
  let timer = null;
  let asked = 0;
  let controller = null;
  let destroyed = false;

  // Colour: Auto (the host's), the palette, any colour.
  const colors = make("div", "icon-picker__colors");
  colors.setAttribute("role", "group");
  colors.setAttribute("aria-label", "Colour");
  const auto = button("icon-picker__swatch icon-picker__swatch--auto", "A");
  auto.title = "Default colour";
  auto.dataset.value = "";
  const swatches = palette.map(({ label, value }) => {
    const swatch = button("icon-picker__swatch");
    swatch.title = label;
    swatch.setAttribute("aria-label", label);
    swatch.style.background = value;
    swatch.dataset.value = value;
    return swatch;
  });
  const custom = make("input", "icon-picker__custom");
  custom.type = "color";
  custom.title = "Any colour";
  custom.value = HEX_RE.test(pick.color) ? pick.color : FALLBACK_COLOR;
  colors.append(auto, ...swatches, custom);

  // Icon: search field, upload, default.
  const query = make("input", "icon-picker__search");
  query.type = "search";
  query.placeholder = placeholder;
  query.setAttribute("aria-label", "Search icons");
  query.autocomplete = "off";
  const upload = button("icon-picker__button", "Upload image…");
  const file = make("input", "icon-picker__file");
  file.type = "file";
  file.accept = "image/*";
  file.hidden = true;
  const defaultIcon = button("icon-picker__button", "Default icon");
  const tools = make("div", "icon-picker__tools");
  tools.append(query, upload, defaultIcon, file);

  const current = make("span", "icon-picker__current");
  const ideas = make("div", "icon-picker__ideas");
  const chips = suggestions.map((idea) => {
    const chip = button("icon-picker__idea", idea);
    chip.dataset.query = idea;
    return chip;
  });
  ideas.append(...chips);
  const status = make("p", "icon-picker__status");
  const results = make("div", "icon-picker__results");
  results.setAttribute("role", "listbox");
  results.setAttribute("aria-label", "Icons");
  const credit = make("p", "icon-picker__credit", "Icons from ");
  const link = make("a", "", "Iconify");
  link.href = "https://icon-sets.iconify.design";
  link.target = "_blank";
  link.rel = "noopener";
  credit.append(link, CREDIT_SETS);

  const block = make("div", "icon-picker");
  const colourLabel = make("span", "icon-picker__label", "Colour");
  const iconLabel = make("span", "icon-picker__label", "Icon");
  block.append(colourLabel, colors, iconLabel, tools, current, ideas, status, results, credit);
  root.replaceChildren(block);

  const textColor = () => doc.defaultView.getComputedStyle(doc.body).color;

  function paintCurrent() {
    current.replaceChildren();
    current.hidden = !pick.icon;
    current.removeAttribute("data-tinted");
    current.style.removeProperty("--icon-picker-mask");
    if (!pick.icon) return;
    if (pick.tint) {
      // A single-colour icon is a mask over the colour: it follows the colour without re-encoding.
      current.dataset.tinted = "";
      current.style.setProperty("--icon-picker-mask", `url("${pick.icon}")`);
      if (pick.color) current.style.setProperty("--icon-picker-color", pick.color);
      else current.style.removeProperty("--icon-picker-color");
    } else {
      const image = make("img");
      image.src = pick.icon;
      image.alt = "";
      current.append(image);
    }
  }

  function paintColors() {
    for (const swatch of [auto, ...swatches]) {
      swatch.classList.toggle("active", (swatch.dataset.value || "") === pick.color);
    }
    custom.classList.toggle("active", Boolean(pick.color) && !palette.some((c) => c.value === pick.color));
  }

  // Previews carry the chosen colour (or the page's text colour) so they show on any theme; a
  // logo in its own colours has no currentColor and stays as it is.
  function paintResults() {
    const tint = pick.color || textColor();
    results.replaceChildren(...found.map(({ name, svg }) => {
      const item = button(`icon-picker__item${name === pick.iconify ? " active" : ""}`);
      item.title = name;
      item.setAttribute("role", "option");
      const image = make("img");
      image.src = svgDataUrl(String(svg).replace(/currentColor/gi, tint));
      image.alt = name;
      item.append(image);
      item.addEventListener("click", () => {
        pick = { ...pick, icon: svgDataUrl(String(svg)), tint: /currentcolor/i.test(svg), iconify: name };
        paintResults();
        paintCurrent();
        changed();
      });
      return item;
    }));
  }

  function changed() {
    if (onChange) onChange({ ...pick });
  }

  function paintAll() {
    paintColors();
    paintCurrent();
    paintResults();
  }

  function setColor(color) {
    pick = { ...pick, color };
    if (HEX_RE.test(color)) custom.value = color;
    paintAll();
    changed();
  }

  async function runSearch() {
    clearTimeout(timer);
    timer = null;
    const text = query.value.trim();
    if (controller) controller.abort();
    controller = null;
    const ticket = ++asked;
    if (!text) {
      found = [];
      status.textContent = "";
      paintResults();
      return;
    }
    const mine = new AbortController();
    controller = mine;
    status.textContent = "Searching…";
    let answer;
    try {
      answer = await search(text, { signal: mine.signal });
    } catch (err) {
      if (ticket !== asked || isAbort(err)) return;  // superseded or aborted: neither an error nor shown
      found = [];
      status.textContent = (err && err.message) || String(err);
      paintResults();
      return;
    }
    if (ticket !== asked) return;
    found = Array.isArray(answer) ? answer : [];
    status.textContent = found.length ? `${found.length} icons` : "No icon found.";
    paintResults();
  }

  const on = [];
  const listen = (target, type, handler) => {
    target.addEventListener(type, handler);
    on.push(() => target.removeEventListener(type, handler));
  };

  listen(colors, "click", (event) => {
    const swatch = event.target.closest && event.target.closest(".icon-picker__swatch");
    if (swatch) setColor(swatch.dataset.value || "");
  });
  listen(custom, "input", () => setColor(custom.value));
  listen(query, "input", () => {
    clearTimeout(timer);
    timer = setTimeout(runSearch, DEBOUNCE_MS);
  });
  listen(query, "keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch();
    }
  });
  for (const chip of chips) {
    listen(chip, "click", () => {
      query.value = chip.dataset.query;
      runSearch();
    });
  }
  listen(upload, "click", () => file.click());
  listen(file, "change", async () => {
    const chosen = file.files && file.files[0];
    file.value = "";
    if (!chosen) return;
    let icon;
    try {
      icon = await squareImage(chosen, uploadSize);
    } catch (err) {
      if (destroyed) return;
      status.textContent = (err && err.message) || String(err);
      return;
    }
    if (destroyed) return;
    pick = { ...pick, icon, tint: false, iconify: null };
    status.textContent = "";
    paintAll();
    changed();
  });
  listen(defaultIcon, "click", () => {
    pick = { ...pick, icon: "", tint: false, iconify: null };
    paintAll();
    changed();
  });

  paintAll();

  return {
    getValue: () => ({ ...pick }),
    // The host replaces the value (its Reset, a reopened dialog): redrawn, onChange not called.
    setValue(value) {
      pick = normalize(value);
      custom.value = HEX_RE.test(pick.color) ? pick.color : FALLBACK_COLOR;
      paintAll();
    },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      asked++;
      if (controller) controller.abort();
      controller = null;
      for (const off of on) off();
      root.replaceChildren();
    },
  };
}
