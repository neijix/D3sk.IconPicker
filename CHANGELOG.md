# Changelog

All notable changes to `D3sk.IconPicker` and `@d3sk/icon-picker-web`. Versions follow
[Semantic Versioning](https://semver.org).

## [Unreleased]

## [0.1.0] - 2026-11-18

First release: an icon picker in two packages, sharing one set of Iconify rules.

### `D3sk.IconPicker` (NuGet)

- `IconSearch.SearchAsync(query)`: Iconify name search (brand sets, then the search without a leading vendor word, then every set), at most 160 names, each with its SVG; in-memory caches, safe under concurrent calls. `DataUrlAsync(name)` returns the data URL to store.
- `IconValidator`: `CheckIcon` (SVG without scripts or links, or a PNG / JPEG / GIF / WebP recognised by its bytes), `CheckColor`, `CheckLabel`, `CheckName`, `IsTinted`, `SvgDataUrl`.
- `IconSvg.Build`: an SVG from an Iconify set's JSON, aliases followed up to four hops.
- `IconException` (refused value, host answers 422) and `IconUnavailableException` (Iconify unreachable, host answers 502).

### `@d3sk/icon-picker-web` (npm)

- `mountIconPicker(root, options)`: the Colour + Icon block returning `{ getValue, setValue, destroy }`.
- `iconifySearch(query, { fetch, signal })`: the same name search, run in the page.
- `squareImage(file, size)`: an uploaded image as a square PNG data URL.
- `picker.css`: themable through `--icon-picker-*` custom properties.
- `icon-picker.global.js`: a classic-script build defining `D3skIconPicker`, for pages without a bundler.
