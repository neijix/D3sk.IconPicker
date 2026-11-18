# D3sk.IconPicker

A Colour + Icon picker for any app, with the rules a server needs to trust what it stores:

| Package | Where | What |
|---|---|---|
| `D3sk.IconPicker` | NuGet | The rules, BCL only, no UI types: Iconify search with SVGs (`IconSearch`), validation of icon data URLs, colours, labels and Iconify names (`IconValidator`), SVG building from an Iconify set (`IconSvg`). |
| `@d3sk/icon-picker-web` | npm | `mountIconPicker`: the picker block (Auto swatch, your palette, any colour, icon search, image upload, Default icon), plus `iconifySearch` and `squareImage`. No framework, no build step. |

The two packages apply the same Iconify rules (brand sets first, vendor word stripped, well-formed
names only, at most 160 results), so a page and a server agree on what a search returns.

## Install

```bash
dotnet add package D3sk.IconPicker --version 0.1.0
npm install --save-exact @d3sk/icon-picker-web@0.1.0
```

Both are published on [nuget.org](https://www.nuget.org/packages/D3sk.IconPicker) and
[npmjs.com](https://www.npmjs.com/package/@d3sk/icon-picker-web).

## How a host wires them

The browser cannot always fetch Iconify's SVGs itself (rate limits, your content security policy),
so the host serves the search and checks what comes back on save.

```csharp
// Server: one search endpoint, [{ name, svg }] as JSON.
using D3sk.IconPicker;

var icons = new IconSearch();                       // keep one; it caches searches and SVGs

app.MapGet("/api/icons", async (string q, CancellationToken ct) =>
{
    try { return Results.Ok(await icons.SearchAsync(q, ct)); }       // IconResult(Name, Svg)
    catch (IconUnavailableException e) { return Results.Problem(e.Message, statusCode: 502); }
});

app.MapPut("/api/project/icon", (IconBody body) =>
{
    try
    {
        var icon = IconValidator.CheckIcon(body.Icon);     // null = default icon; an SVG is re-encoded
        var color = IconValidator.CheckColor(body.Color);  // "#rgb" -> "#rrggbb"; null = default colour
        // store icon and color …
        return Results.NoContent();
    }
    catch (IconException e) { return Results.Problem(e.Message, statusCode: 422); }
});
```

`IconException` means the value is refused (answer 422); `IconUnavailableException` means Iconify
could not be reached or refused the request (answer 502). `CheckIcon` accepts an SVG without scripts or
links, or a PNG, JPEG, GIF or WebP recognised by its bytes, up to 96 KiB as a data URL.
`IconValidator` also has `CheckLabel`, `CheckName`, `IsTinted` and `SvgDataUrl`;
`IconSearch.DataUrlAsync(name)` turns an Iconify name into the data URL to store.

```js
// Page
import { mountIconPicker } from "@d3sk/icon-picker-web";
import "@d3sk/icon-picker-web/picker.css";

const picker = mountIconPicker(document.querySelector("#icon"), {
  palette: [{ label: "Blue", value: "#3e7bfa" }, { label: "Green", value: "#2f9e6f" }],
  search: (query, { signal }) => fetch(`/api/icons?q=${encodeURIComponent(query)}`, { signal }).then((r) => r.json()),
  onChange: ({ icon, tint, iconify, color }) => save({ icon, color }),
});
```

The block's value is `{ icon, tint, iconify, color }`. `icon` is a data URL (empty for the default
icon), `tint` says it is drawn in `currentColor` and follows `color`. Send `icon` and `color` to the
endpoint above. See [`packages/icon-picker/README.md`](packages/icon-picker/README.md) for every option.

Without a server, `iconifySearch(query)` runs the same name search in the page and returns names only;
you then fetch their SVGs yourself.

## A page without a bundler

`@d3sk/icon-picker-web` ships a classic-script build, `icon-picker.global.js`, which defines one
global, `D3skIconPicker`. Load it with `picker.css`:

```html
<link rel="stylesheet" href="/vendor/icon-picker/picker.css">
<script src="/vendor/icon-picker/icon-picker.global.js"></script>
<script>
  const picker = D3skIconPicker.mountIconPicker(document.querySelector("#icon"), { search });
</script>
```

Vendor the files at a pinned version, so the page never changes behind your back:

1. Copy `icon-picker.global.js` and `picker.css` into a folder of your app (`vendor/icon-picker/`).
2. Put a `VERSION` file there. Its first line is the pinned package, `@d3sk/icon-picker-web@0.1.0`.
3. Write a refresh script that reads that line, runs
   `npm pack <spec> --registry https://registry.npmjs.org/`, checks the tarball against the registry's
   `dist.integrity` (`npm view <spec> dist.integrity --registry https://registry.npmjs.org/`), unpacks it,
   and copies the two files over the folder. To upgrade, edit the `VERSION` line and run the script;
   the diff shows exactly what changed.

## Iconify

Icons come from [Iconify](https://iconify.design) and its open icon sets; each set has its own licence,
see [icon-sets.iconify.design](https://icon-sets.iconify.design). Every search reaches the public
`https://api.iconify.design`: with the C# package your server calls it, with `iconifySearch` the visitor's
browser does. The picker block shows an Iconify credit under the results.

## Development

Needs the .NET 10 SDK (`global.json`) and Node 20 or later.

```bash
./check.sh          # dotnet test (warnings are errors) + npm test: what CI runs
./check.sh --full   # …and npm pack --dry-run, what npm would publish
```

(`check.ps1` is the Windows twin.) Tests never reach the network. They replay recorded Iconify answers from
[`tests/fixtures/iconify/2026-11`](tests/fixtures/iconify/2026-11), and its README lists the exact `curl`
lines to record a new dated set.

## Licence

[MIT](LICENSE)
