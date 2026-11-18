import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "icon-picker.global.js");
const source = readFileSync(file, "utf8");

test("the global build runs as a classic script and defines exactly one global, D3skIconPicker", () => {
  const context = vm.createContext({});
  const before = new Set(Object.getOwnPropertyNames(context));
  vm.runInContext(source, context, { filename: "icon-picker.global.js" });
  const added = Object.getOwnPropertyNames(context).filter((name) => !before.has(name));
  assert.deepEqual(added, ["D3skIconPicker"]);
  const api = context.D3skIconPicker;
  assert.deepEqual(Object.keys(api).sort(), ["iconifySearch", "mountIconPicker", "squareImage"]);
  for (const fn of Object.values(api)) assert.equal(typeof fn, "function");
});

test("the global build holds no import or export statement", () => {
  assert.doesNotMatch(source, /^\s*(import|export)\b/m);
});
