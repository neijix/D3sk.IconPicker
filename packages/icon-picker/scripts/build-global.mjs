// The classic-script build for pages without a bundler: src/index.js as an IIFE that defines one
// global, D3skIconPicker (mountIconPicker, iconifySearch, squareImage).
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [join(root, "src", "index.js")],
  outfile: join(root, "icon-picker.global.js"),
  bundle: true,
  format: "iife",
  globalName: "D3skIconPicker",
  target: "es2020",
  legalComments: "none",
  logLevel: "warning",
});
