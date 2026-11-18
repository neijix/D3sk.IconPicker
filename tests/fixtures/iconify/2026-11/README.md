# Iconify fixtures, 2026-11

Real answers of the public `https://api.iconify.design` (no token, no cookie), recorded on
2026-11-18 with the `curl` lines below. Never edited by hand: a new upstream version means a new
dated folder, not a patch here.

`index.json` maps each exact request (path + query, as the code builds it, `%20` for a space) to
the file holding its answer. Both fakes (the C# `FakeIconify` and the JS fake `fetch`) look a request
up there and fail the test on any URL not listed. Oversize, non-JSON and non-200 answers are
synthetic, in the tests.

## Searches

```sh
P="logos,simple-icons,fa-brands,mdi,fluent,vscode-icons,devicon,ant-design,material-symbols,ri,bi,file-icons,ph,tabler,heroicons,ion,clarity,carbon,cib,ic,twemoji"
B=https://api.iconify.design
U='User-Agent: d3sk-icon-picker-fixture-recorder'
curl -sS -f -H "$U" "$B/search?query=github&prefixes=$P&limit=128" -o search-github-brand.json
curl -sS -f -H "$U" "$B/search?query=github&limit=128" -o search-github-all.json
curl -sS -f -H "$U" "$B/search?query=microsoft%20teams&prefixes=$P&limit=128" -o search-microsoft-teams-brand.json
curl -sS -f -H "$U" "$B/search?query=teams&prefixes=$P&limit=64" -o search-teams-brand.json
curl -sS -f -H "$U" "$B/search?query=microsoft%20teams&limit=128" -o search-microsoft-teams-all.json
```

"github" has no vendor word (two searches); "microsoft teams" loses "microsoft" (three).

## Icon sets

One request per set, `/{prefix}.json?icons=a,b,...`, the names of the merged, capped (160)
result grouped by set in order of first appearance, each set's icons in result order: exactly what
`IconSearch` sends. The files are named `set-<query>-<prefix>.json`; the request each one answers
is its `index.json` key, recorded with:

```sh
# for every key K of index.json whose file is set-*: 
curl -sS -f -H "$U" "$B$K" -o <file>
```

Contents: 81 of the 91 sets carry set-wide `width`/`height`; one answer holds an alias
(`set-microsoft-teams-tabler.json`: `brand-microsoft-teams` → parent `brand-teams`).
