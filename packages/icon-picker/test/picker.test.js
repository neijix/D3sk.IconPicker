import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { mountIconPicker } from "../src/index.js";
import { page, flush, decodeDataUrl, SVG_TINT, SVG_LOGO } from "./helpers.js";

const PALETTE = [{ label: "Red", value: "#e5484d" }, { label: "Blue", value: "#3e7bfa" }];
const results = (n) => Array.from({ length: n }, (_, i) => ({ name: `mdi:icon-${i}`, svg: SVG_TINT }));

let dom;
let picker;
let changes;
let calls;

function mount(overrides = {}) {
  dom = page();
  changes = [];
  calls = [];
  const search = overrides.search || (async (q, { signal }) => { calls.push({ q, signal }); return results(2); });
  picker = mountIconPicker(dom.root, {
    value: { icon: "", tint: false, iconify: null, color: "" },
    palette: PALETTE,
    suggestions: ["folder", "rocket"],
    search,
    onChange: (v) => changes.push(v),
    placeholder: "Search icons (rocket…)",
    ...overrides,
    search,
  });
  return dom;
}

const q = (sel) => dom.root.querySelector(sel);
const qa = (sel) => [...dom.root.querySelectorAll(sel)];
const type = (text) => {
  const input = q(".icon-picker__search");
  input.value = text;
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
};
const enter = () => q(".icon-picker__search").dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
afterEach(() => {
  picker?.destroy();
  mock.timers.reset();
  delete globalThis.Image;
  delete globalThis.document;
});

test("mounts Auto, the palette, the custom colour input, the host placeholder and the Iconify credit", () => {
  mount();
  const swatches = qa(".icon-picker__swatch");
  assert.equal(swatches.length, 3);
  assert.equal(swatches[0].textContent, "A");
  assert.equal(swatches[0].title, "Default colour");
  assert.deepEqual(swatches.slice(1).map((s) => s.title), ["Red", "Blue"]);
  assert.equal(q(".icon-picker__custom").type, "color");
  assert.equal(q(".icon-picker__search").placeholder, "Search icons (rocket…)");
  assert.deepEqual(qa(".icon-picker__button").map((b) => b.textContent), ["Upload image…", "Default icon"]);
  assert.match(q(".icon-picker__credit").textContent, /^Icons from Iconify/);
  assert.equal(q(".icon-picker__credit a").href, "https://icon-sets.iconify.design/");
});

test("the value's colour marks its swatch active; a colour outside the palette marks the custom input", () => {
  mount({ value: { color: "#3e7bfa" } });
  assert.deepEqual(qa(".icon-picker__swatch.active").map((s) => s.title), ["Blue"]);
  picker.setValue({ color: "#123456" });
  assert.equal(qa(".icon-picker__swatch.active").length, 0);
  assert.ok(q(".icon-picker__custom").classList.contains("active"));
  assert.equal(q(".icon-picker__custom").value, "#123456");
  picker.setValue({});
  assert.ok(q(".icon-picker__swatch--auto").classList.contains("active"));
});

test("clicking a swatch, Auto or the custom input reports the colour", () => {
  mount();
  qa(".icon-picker__swatch")[1].click();
  assert.equal(picker.getValue().color, "#e5484d");
  const custom = q(".icon-picker__custom");
  custom.value = "#00ff00";
  custom.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  assert.equal(picker.getValue().color, "#00ff00");
  q(".icon-picker__swatch--auto").click();
  assert.equal(picker.getValue().color, "");
  assert.deepEqual(changes.map((c) => c.color), ["#e5484d", "#00ff00", ""]);
});

test("typing searches after 320 ms, not before", async () => {
  mount();
  type("github");
  mock.timers.tick(319);
  await flush();
  assert.equal(calls.length, 0);
  mock.timers.tick(1);
  await flush();
  assert.deepEqual(calls.map((c) => c.q), ["github"]);
  assert.equal(q(".icon-picker__status").textContent, "2 icons");
  assert.equal(qa(".icon-picker__item").length, 2);
});

test("Enter searches at once and cancels the pending debounce", async () => {
  mount();
  type("rocket");
  enter();
  await flush();
  mock.timers.tick(1000);
  await flush();
  assert.deepEqual(calls.map((c) => c.q), ["rocket"]);
});

test("a suggestion chip fills the field and searches", async () => {
  mount();
  qa(".icon-picker__idea").find((c) => c.textContent === "rocket").click();
  await flush();
  assert.equal(q(".icon-picker__search").value, "rocket");
  assert.deepEqual(calls.map((c) => c.q), ["rocket"]);
});

test("the status line: Searching…, N icons, No icon found., cleared for an empty query", async () => {
  let release;
  mount({ search: (query) => new Promise((resolve) => { release = () => resolve(query === "none" ? [] : results(3)); }) });
  type("a");
  enter();
  assert.equal(q(".icon-picker__status").textContent, "Searching…");
  release();
  await flush();
  assert.equal(q(".icon-picker__status").textContent, "3 icons");
  type("none");
  enter();
  release();
  await flush();
  assert.equal(q(".icon-picker__status").textContent, "No icon found.");
  assert.equal(qa(".icon-picker__item").length, 0);
  type("  ");
  enter();
  assert.equal(q(".icon-picker__status").textContent, "");
});

test("the latest search wins: a slow older answer is dropped", async () => {
  const pending = [];
  mount({ search: (query) => new Promise((resolve) => pending.push({ query, resolve })) });
  type("one");
  enter();
  type("two");
  enter();
  pending[1].resolve([{ name: "mdi:two", svg: SVG_TINT }]);
  await flush();
  pending[0].resolve([{ name: "mdi:one", svg: SVG_TINT }]);
  await flush();
  assert.deepEqual(qa(".icon-picker__item").map((i) => i.title), ["mdi:two"]);
  assert.equal(q(".icon-picker__status").textContent, "1 icons");
});

test("a newer query aborts the previous search through its signal; the aborted one shows nothing", async () => {
  const seen = [];
  mount({
    search: (query, { signal }) => new Promise((resolve, reject) => {
      seen.push({ query, signal });
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      if (query === "two") resolve(results(1));
    }),
  });
  type("one");
  enter();
  type("two");
  enter();
  await flush();
  assert.equal(seen[0].signal.aborted, true);
  assert.equal(seen[1].signal.aborted, false);
  assert.equal(q(".icon-picker__status").textContent, "1 icons");
  assert.equal(qa(".icon-picker__item").length, 1);
});

test("an aborted search alone is neither an error nor shown", async () => {
  mount({ search: async () => { throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" }); } });
  type("x");
  enter();
  await flush();
  assert.doesNotMatch(q(".icon-picker__status").textContent, /aborted/);
});

test("previews are <img src=data:> with currentColor replaced by the colour, else the page text colour", async () => {
  mount({ value: { color: "#e5484d" } });
  type("a");
  enter();
  await flush();
  let img = q(".icon-picker__item img");
  assert.match(img.src, /^data:image\/svg\+xml;base64,/);
  assert.match(decodeDataUrl(img.src), /fill="#e5484d"/);
  assert.doesNotMatch(decodeDataUrl(img.src), /currentColor/i);
  picker.setValue({});
  img = q(".icon-picker__item img");
  assert.match(decodeDataUrl(img.src), /fill="rgb\(10, 20, 30\)"/);
  qa(".icon-picker__swatch")[2].click();
  assert.match(decodeDataUrl(q(".icon-picker__item img").src), /fill="#3e7bfa"/);
});

test("a pick reaches onChange with the original SVG, the tint flag and the Iconify name", async () => {
  mount({ search: async () => [{ name: "mdi:a", svg: SVG_TINT }, { name: "logos:b", svg: SVG_LOGO }] });
  type("a");
  enter();
  await flush();
  const [first, second] = qa(".icon-picker__item");
  first.click();
  assert.equal(changes.length, 1);
  assert.equal(changes[0].iconify, "mdi:a");
  assert.equal(changes[0].tint, true);
  assert.equal(decodeDataUrl(changes[0].icon), SVG_TINT);
  assert.ok(qa(".icon-picker__item")[0].classList.contains("active"));
  second.click();
  assert.equal(changes[1].tint, false);
  assert.equal(changes[1].iconify, "logos:b");
  assert.equal(qa(".icon-picker__item.active").length, 1);
});

test("a tinted pick is drawn by CSS mask, an untinted one as an <img>", async () => {
  mount({ search: async () => [{ name: "mdi:a", svg: SVG_TINT }, { name: "logos:b", svg: SVG_LOGO }] });
  type("a");
  enter();
  await flush();
  qa(".icon-picker__item")[0].click();
  const current = q(".icon-picker__current");
  assert.equal(current.hidden, false);
  assert.ok(current.hasAttribute("data-tinted"));
  assert.equal(current.querySelector("img"), null);
  assert.match(current.style.getPropertyValue("--icon-picker-mask"), /^url\("data:image\/svg\+xml;base64,/);
  qa(".icon-picker__item")[1].click();
  assert.equal(q(".icon-picker__current").hasAttribute("data-tinted"), false);
  assert.ok(q(".icon-picker__current img"));
});

test("Default icon clears the icon and keeps the colour", async () => {
  mount({ value: { icon: "data:image/png;base64,AAAA", tint: false, iconify: null, color: "#e5484d" } });
  qa(".icon-picker__button").find((b) => b.textContent === "Default icon").click();
  assert.deepEqual(changes, [{ icon: "", tint: false, iconify: null, color: "#e5484d" }]);
  assert.equal(q(".icon-picker__current").hidden, true);
});

function stubUpload({ fail = false, width = 20, height = 10 } = {}) {
  const drawn = [];
  globalThis.URL.createObjectURL = () => "blob:fake";
  globalThis.URL.revokeObjectURL = () => {};
  globalThis.Image = class {
    set src(_v) {
      queueMicrotask(() => {
        if (fail) return this.onerror?.(new Event("error"));
        this.naturalWidth = width;
        this.naturalHeight = height;
        this.onload?.();
      });
    }
  };
  globalThis.document = {
    createElement: () => {
      const canvas = {
        width: 0, height: 0,
        getContext: () => ({ drawImage: (...a) => drawn.push(a.slice(1)) }),
        toDataURL: () => `data:image/png;base64,${canvas.width}x${canvas.height}`,
      };
      return canvas;
    },
  };
  return drawn;
}

async function chooseFile(name = "a.png") {
  const input = q(".icon-picker__file");
  Object.defineProperty(input, "files", { value: [new dom.window.File(["x"], name)], configurable: true });
  input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await flush();
}

test("Upload image… opens the file chooser; the upload becomes a 64 px square PNG pick, upscaling a small image", async () => {
  mount({ value: { icon: "", tint: true, iconify: "mdi:a", color: "" } });
  let opened = 0;
  q(".icon-picker__file").click = () => opened++;
  qa(".icon-picker__button")[0].click();
  assert.equal(opened, 1);
  const drawn = stubUpload();
  await chooseFile();
  assert.deepEqual(drawn, [[5, 0, 10, 10, 0, 0, 64, 64]]);
  assert.deepEqual(changes, [{ icon: "data:image/png;base64,64x64", tint: false, iconify: null, color: "" }]);
});

test("uploadSize sets the square", async () => {
  mount({ uploadSize: 256 });
  stubUpload();
  await chooseFile();
  assert.equal(picker.getValue().icon, "data:image/png;base64,256x256");
});

test("an upload of a non-image shows its message, keeps the current icon and does not call onChange", async () => {
  mount({ value: { icon: "data:image/png;base64,KEEP", tint: false, iconify: null, color: "" } });
  stubUpload({ fail: true });
  await chooseFile("notes.txt");
  assert.equal(q(".icon-picker__status").textContent, "This file is not an image");
  assert.equal(picker.getValue().icon, "data:image/png;base64,KEEP");
  assert.equal(changes.length, 0);
});

test("a rejected search shows the host's message and keeps the current icon", async () => {
  mount({
    value: { icon: "data:image/png;base64,KEEP", tint: false, iconify: null, color: "" },
    search: async () => { throw new Error("Icon search failed (it needs the internet): 502"); },
  });
  type("a");
  enter();
  await flush();
  assert.equal(q(".icon-picker__status").textContent, "Icon search failed (it needs the internet): 502");
  assert.equal(picker.getValue().icon, "data:image/png;base64,KEEP");
  assert.equal(qa(".icon-picker__item").length, 0);
  assert.equal(changes.length, 0);
});

test("the host replaces the value (its Reset): redrawn, onChange not called", async () => {
  mount();
  type("a");
  enter();
  await flush();
  qa(".icon-picker__item")[0].click();
  qa(".icon-picker__swatch")[1].click();
  changes.length = 0;
  picker.setValue({ icon: "", tint: false, iconify: null, color: "" });
  assert.deepEqual(picker.getValue(), { icon: "", tint: false, iconify: null, color: "" });
  assert.equal(qa(".icon-picker__item.active").length, 0);
  assert.ok(q(".icon-picker__swatch--auto").classList.contains("active"));
  assert.equal(q(".icon-picker__current").hidden, true);
  assert.equal(changes.length, 0);
});

test("an SVG carrying <img onerror> creates no element but the preview <img>", async () => {
  const evil = '<svg xmlns="http://www.w3.org/2000/svg"><image href="x" onerror="1"/><foreignObject><img src=x onerror="window.pwned=1"></foreignObject><path fill="currentColor" d="M0 0"/></svg>';
  mount({ search: async () => [{ name: "mdi:evil", svg: evil }] });
  type("a");
  enter();
  await flush();
  qa(".icon-picker__item")[0].click();
  assert.equal(qa("img").length, 1);  // the preview in the grid; the tinted pick is a mask
  assert.equal(qa("svg, foreignObject, [onerror]").length, 0);
  assert.equal(dom.window.pwned, undefined);
});

test("destroy aborts a pending search, drops the timer and empties the root", async () => {
  mount({ search: (query, { signal }) => { calls.push({ query, signal }); return new Promise(() => {}); } });
  type("a");
  enter();
  type("b");
  picker.destroy();
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(dom.root.childNodes.length, 0);
  mock.timers.tick(1000);
  await flush();
  assert.equal(calls.length, 1);
});
