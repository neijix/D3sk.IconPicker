import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { squareImage } from "../src/index.js";

// happy-dom draws nothing: a stubbed Image decodes to a size the test picks, a stubbed canvas records its drawing.
const saved = {};
let drawn;
let revoked;

function stub({ width = 200, height = 100, fail = false } = {}) {
  drawn = [];
  revoked = [];
  globalThis.URL.createObjectURL = () => "blob:fake";
  globalThis.URL.revokeObjectURL = (u) => revoked.push(u);
  globalThis.Image = class {
    set src(_value) {
      queueMicrotask(() => {
        if (fail) return this.onerror?.(new Event("error"));
        this.naturalWidth = width;
        this.naturalHeight = height;
        this.onload?.();
      });
    }
  };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: (...args) => drawn.push(args.slice(1)) }),
        toDataURL: (type) => `data:${type};base64,${canvas.width}x${canvas.height}`,
      };
      return canvas;
    },
  };
}

beforeEach(() => {
  for (const key of ["Image", "document"]) saved[key] = globalThis[key];
  saved.create = URL.createObjectURL;
  saved.revoke = URL.revokeObjectURL;
});
afterEach(() => {
  for (const key of ["Image", "document"]) {
    if (saved[key] === undefined) delete globalThis[key];
    else globalThis[key] = saved[key];
  }
  URL.createObjectURL = saved.create;
  URL.revokeObjectURL = saved.revoke;
});

test("a wide image is cropped to its centred square, scaled to 64 x 64, as a PNG data URL", async () => {
  stub({ width: 200, height: 100 });
  const url = await squareImage(new Blob(["x"]));
  assert.equal(url, "data:image/png;base64,64x64");
  assert.deepEqual(drawn, [[50, 0, 100, 100, 0, 0, 64, 64]]);
});

test("a tall image is cropped at its centre, at the requested size", async () => {
  stub({ width: 90, height: 150 });
  const url = await squareImage(new Blob(["x"]), 32);
  assert.equal(url, "data:image/png;base64,32x32");
  assert.deepEqual(drawn, [[0, 30, 90, 90, 0, 0, 32, 32]]);
});

test("a square image is drawn whole", async () => {
  stub({ width: 80, height: 80 });
  await squareImage(new Blob(["x"]), 64);
  assert.deepEqual(drawn, [[0, 0, 80, 80, 0, 0, 64, 64]]);
});

test("the object URL is released", async () => {
  stub();
  await squareImage(new Blob(["x"]));
  assert.deepEqual(revoked, ["blob:fake"]);
});

test("a file the browser cannot decode is refused", async () => {
  stub({ fail: true });
  await assert.rejects(squareImage(new Blob(["not an image"])), { message: "This file is not an image" });
  assert.deepEqual(revoked, ["blob:fake"]);
});

test("an image with no size is refused", async () => {
  stub({ width: 0, height: 0 });
  await assert.rejects(squareImage(new Blob(["x"])), { message: "This file is not an image" });
});
