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

const normalize = (v = {}) => ({
  icon: v.icon || "", tint: Boolean(v.tint), iconify: v.iconify || null, color: v.color || "",
});

const customColor = (color) => (HEX_RE.test(color) ? color : FALLBACK_COLOR);

function domHelpers(doc) {
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
  return { make, button };
}

// Colour: Auto (the host's), the palette, any colour.
function buildPalette({ make, button }, palette, color) {
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
  custom.value = customColor(color);
  colors.append(auto, ...swatches, custom);
  return { colors, auto, swatches, custom };
}

// Icon: search field, suggestion chips.
function buildSearch({ make, button }, placeholder, suggestions) {
  const query = make("input", "icon-picker__search");
  query.type = "search";
  query.placeholder = placeholder;
  query.setAttribute("aria-label", "Search icons");
  query.autocomplete = "off";
  const ideas = make("div", "icon-picker__ideas");
  const chips = suggestions.map((idea) => {
    const chip = button("icon-picker__idea", idea);
    chip.dataset.query = idea;
    return chip;
  });
  ideas.append(...chips);
  return { query, ideas, chips };
}

// Icon: upload, default.
function buildUpload({ make, button }, query) {
  const upload = button("icon-picker__button", "Upload image…");
  const file = make("input", "icon-picker__file");
  file.type = "file";
  file.accept = "image/*";
  file.hidden = true;
  const defaultIcon = button("icon-picker__button", "Default icon");
  const tools = make("div", "icon-picker__tools");
  tools.append(query, upload, defaultIcon, file);
  return { tools, upload, file, defaultIcon };
}

function buildResults({ make }) {
  const current = make("span", "icon-picker__current");
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
  return { current, status, results, credit };
}

function buildBlock(root, dom, parts) {
  const { make } = dom;
  const block = make("div", "icon-picker");
  block.append(
    make("span", "icon-picker__label", "Colour"), parts.colors,
    make("span", "icon-picker__label", "Icon"), parts.tools, parts.current,
    parts.ideas, parts.status, parts.results, parts.credit,
  );
  root.replaceChildren(block);
}

function paintCurrent({ pick }, { current }, dom) {
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
    const image = dom.make("img");
    image.src = pick.icon;
    image.alt = "";
    current.append(image);
  }
}

function paintColors({ pick }, ui, palette) {
  for (const swatch of [ui.auto, ...ui.swatches]) {
    swatch.classList.toggle("active", (swatch.dataset.value || "") === pick.color);
  }
  ui.custom.classList.toggle("active", Boolean(pick.color) && !palette.some((c) => c.value === pick.color));
}

// Previews carry the chosen colour (or the page's text colour) so they show on any theme; a
// logo in its own colours has no currentColor and stays as it is.
function resultItem(dom, state, name, svg, tint, onPick) {
  const item = dom.button(`icon-picker__item${name === state.pick.iconify ? " active" : ""}`);
  item.title = name;
  item.setAttribute("role", "option");
  const image = dom.make("img");
  image.src = svgDataUrl(String(svg).replace(/currentColor/gi, tint));
  image.alt = name;
  item.append(image);
  item.addEventListener("click", () => {
    state.pick = { ...state.pick, icon: svgDataUrl(String(svg)), tint: /currentcolor/i.test(svg), iconify: name };
    onPick();
  });
  return item;
}

function paintResults(doc, dom, state, ui, onPick) {
  const tint = state.pick.color || doc.defaultView.getComputedStyle(doc.body).color;
  ui.results.replaceChildren(...state.found.map(({ name, svg }) => resultItem(dom, state, name, svg, tint, onPick)));
}

async function runSearch(search, state, ui, repaintResults) {
  clearTimeout(state.timer);
  state.timer = null;
  const text = ui.query.value.trim();
  if (state.controller) state.controller.abort();
  state.controller = null;
  const ticket = ++state.asked;
  if (!text) {
    state.found = [];
    ui.status.textContent = "";
    repaintResults();
    return;
  }
  const mine = new AbortController();
  state.controller = mine;
  ui.status.textContent = "Searching…";
  let answer;
  try {
    answer = await search(text, { signal: mine.signal });
  } catch (err) {
    if (ticket !== state.asked || isAbort(err)) return;  // superseded or aborted: neither an error nor shown
    state.found = [];
    ui.status.textContent = (err && err.message) || String(err);
    repaintResults();
    return;
  }
  if (ticket !== state.asked) return;
  state.found = Array.isArray(answer) ? answer : [];
  ui.status.textContent = state.found.length ? `${state.found.length} icons` : "No icon found.";
  repaintResults();
}

async function handleUpload(state, ui, uploadSize, paintAll, changed) {
  const { file, status } = ui;
  const chosen = file.files && file.files[0];
  file.value = "";
  if (!chosen) return;
  let icon;
  try {
    icon = await squareImage(chosen, uploadSize);
  } catch (err) {
    if (state.destroyed) return;
    status.textContent = (err && err.message) || String(err);
    return;
  }
  if (state.destroyed) return;
  state.pick = { ...state.pick, icon, tint: false, iconify: null };
  status.textContent = "";
  paintAll();
  changed();
}

function bindEvents(state, ui, act) {
  const on = [];
  const listen = (target, type, handler) => {
    target.addEventListener(type, handler);
    on.push(() => target.removeEventListener(type, handler));
  };
  listen(ui.colors, "click", (event) => {
    const swatch = event.target.closest && event.target.closest(".icon-picker__swatch");
    if (swatch) act.setColor(swatch.dataset.value || "");
  });
  listen(ui.custom, "input", () => act.setColor(ui.custom.value));
  listen(ui.query, "input", () => {
    clearTimeout(state.timer);
    state.timer = setTimeout(act.runSearch, DEBOUNCE_MS);
  });
  listen(ui.query, "keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      act.runSearch();
    }
  });
  for (const chip of ui.chips) {
    listen(chip, "click", () => {
      ui.query.value = chip.dataset.query;
      act.runSearch();
    });
  }
  listen(ui.upload, "click", () => ui.file.click());
  listen(ui.file, "change", act.upload);
  listen(ui.defaultIcon, "click", act.clearIcon);
  return on;
}

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
  const dom = domHelpers(doc);
  const state = { pick: normalize(options.value), found: [], timer: null, asked: 0, controller: null, destroyed: false };

  const found_ui = buildSearch(dom, placeholder, suggestions);
  const ui = {
    ...buildPalette(dom, palette, state.pick.color),
    ...found_ui,
    ...buildUpload(dom, found_ui.query),
    ...buildResults(dom),
  };
  buildBlock(root, dom, ui);

  const changed = () => {
    if (onChange) onChange({ ...state.pick });
  };
  const repaintResults = () => paintResults(doc, dom, state, ui, () => {
    repaintResults();
    paintCurrent(state, ui, dom);
    changed();
  });
  const paintAll = () => {
    paintColors(state, ui, palette);
    paintCurrent(state, ui, dom);
    repaintResults();
  };
  const act = {
    setColor(color) {
      state.pick = { ...state.pick, color };
      if (HEX_RE.test(color)) ui.custom.value = color;
      paintAll();
      changed();
    },
    runSearch: () => runSearch(search, state, ui, repaintResults),
    upload: () => handleUpload(state, ui, uploadSize, paintAll, changed),
    clearIcon() {
      state.pick = { ...state.pick, icon: "", tint: false, iconify: null };
      paintAll();
      changed();
    },
  };
  const on = bindEvents(state, ui, act);

  paintAll();

  return {
    getValue: () => ({ ...state.pick }),
    // The host replaces the value (its Reset, a reopened dialog): redrawn, onChange not called.
    setValue(value) {
      state.pick = normalize(value);
      ui.custom.value = customColor(state.pick.color);
      paintAll();
    },
    destroy() {
      state.destroyed = true;
      clearTimeout(state.timer);
      state.asked++;
      if (state.controller) state.controller.abort();
      state.controller = null;
      for (const off of on) off();
      root.replaceChildren();
    },
  };
}
