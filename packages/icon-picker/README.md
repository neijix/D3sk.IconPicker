# @d3sk/icon-picker-web

A Colour + Icon picker for any web page: an Auto swatch, your palette, any colour, a searchable grid of
icons, image upload and a Default icon button. No framework and no build step: ES modules plus one
stylesheet, and a classic-script build for pages without a bundler.

The rules a server applies to what the picker produces exist for .NET as the NuGet package
`D3sk.IconPicker`. See the [repository](https://github.com/neijix/D3sk.IconPicker).

```bash
npm install --save-exact @d3sk/icon-picker-web
```

```js
import { mountIconPicker } from "@d3sk/icon-picker-web";
import "@d3sk/icon-picker-web/picker.css"; // or <link rel="stylesheet" href=".../picker.css">

const picker = mountIconPicker(document.querySelector("#icon"), {
  value: { icon: "", tint: false, iconify: null, color: "" },
  palette: [{ label: "Blue", value: "#3e7bfa" }],
  suggestions: ["folder", "github", "database"],
  search: (query, { signal }) => fetch(`/api/icons?q=${encodeURIComponent(query)}`, { signal }).then((r) => r.json()),
  onChange: (value) => save(value),
});
```

Without a bundler, load `icon-picker.global.js` as a classic `<script>`; everything is on the global
`D3skIconPicker` (`D3skIconPicker.mountIconPicker(...)`).

## `mountIconPicker(root, options)`

Builds the block inside `root` (replacing its content) and returns a handle.

| Option | Default | Meaning |
|---|---|---|
| `search(query, { signal })` | required | Returns (a promise of) `[{ name, svg }]`: an Iconify name and its SVG text, drawn in `currentColor` where it should follow the colour. `signal` is aborted when the user types again; an `AbortError` is ignored, any other error's message is shown. |
| `value` | empty | The starting value, partial allowed. |
| `palette` | `[]` | `[{ label, value }]` colour swatches, `value` any CSS colour. |
| `suggestions` | `[]` | Words shown as chips; a click runs that search. |
| `onChange(value)` | none | Called after each choice by the user (not after `setValue`). |
| `placeholder` | `"Search icons"` | The search field's placeholder. |
| `uploadSize` | `64` | Side in pixels of an uploaded image. |

The value is `{ icon, tint, iconify, color }`:

- `icon`: a data URL, or `""` for the host's default icon.
- `tint`: true when `icon` is an SVG in `currentColor`, which the host paints in `color`.
- `iconify`: the Iconify name of the chosen icon, or `null` (upload, default).
- `color`: `""` for Auto (the host's colour), else a CSS colour (`#rrggbb` for the colour input).

The handle: `getValue()` returns a copy of the value; `setValue(value)` replaces it and redraws without
calling `onChange` (a Reset button, a reopened dialog); `destroy()` removes the listeners and empties `root`.

The picker puts SVG text only into base64 data URLs (an `<img>` source or a CSS mask), never into markup.
Still validate on the server: the value comes from the client.

## `iconifySearch(query, { fetch, signal })`

Searches the public `https://api.iconify.design` from the page and returns Iconify names only
(`Promise<string[]>`): brand sets first, then the search without a leading vendor word (`microsoft`,
`apple`, `google`, `aws`, `amazon`, `ms`), then every set; well-formed names, deduplicated, at most 160.
`fetch` defaults to `globalThis.fetch`. A blank query returns `[]`; a failure throws an `Error`.

## `squareImage(file, size = 64)`

Resolves to a PNG data URL of the centred square of an image `File` or `Blob`, scaled to `size` x `size`.
Rejects with `This file is not an image`.

## Styling

Every themable value is a custom property with a default. Map your own tokens on `.icon-picker`:

```css
.icon-picker { --icon-picker-accent: var(--my-accent); --icon-picker-item-size: 40px; }
```

| Property | Default | Used for |
|---|---|---|
| `--icon-picker-fg` | `inherit` | Text colour of the block, buttons and chips |
| `--icon-picker-font-size` | `13px` | Base font size |
| `--icon-picker-label-size` | `12px` | Labels, status and credit lines |
| `--icon-picker-muted` | `#6b6f7b` | Labels, status, credit, the Auto swatch letter |
| `--icon-picker-gap` | `6px` | Space between rows and swatches |
| `--icon-picker-swatch-size` | `22px` | Colour swatches and the colour input |
| `--icon-picker-strong` | `currentColor` | Border of the selected swatch |
| `--icon-picker-border` | `#c4c7d0` | Borders of buttons, chips, results and the Auto swatch |
| `--icon-picker-radius` | `6px` | Corner radius of buttons and results |
| `--icon-picker-button-bg` | `transparent` | Button background |
| `--icon-picker-hover-bg` | `rgba(127, 127, 127, 0.15)` | Button and chip hover background |
| `--icon-picker-chip-bg` | `transparent` | Suggestion chip background |
| `--icon-picker-current-size` | `24px` | The chosen icon's preview |
| `--icon-picker-color` | `currentColor` | Colour of a tinted preview (the block sets it from the chosen colour) |
| `--icon-picker-accent` | `#3e7bfa` | Hovered or selected result border, credit link |
| `--icon-picker-accent-soft` | `rgba(62, 123, 250, 0.15)` | Selected result background |
| `--icon-picker-item-size` | `34px` | Result cell size |
| `--icon-picker-item-gap` | `4px` | Space between result cells |
| `--icon-picker-item-bg` | `transparent` | Result cell background |
| `--icon-picker-results-max-height` | `220px` | Height of the results grid before it scrolls |

`--icon-picker-mask` is set by the block itself for a tinted preview; do not set it.

## Package contents

`src/` (ES modules, `exports` `.` and `./picker.css`), `picker.css`, `icon-picker.global.js`, `LICENSE`.
Node 20 or later is needed to run the tests, not to use the package.
