// Iconify name search, run in the page: the same rules as the C# IconSearch (D3SKHAND's
// project_icons.py): brand sets, the vendor-word-stripped brand search, every set; then the
// name filter, dedup and the cap. Names only: the SVGs are the host's business.

const ICONIFY = "https://api.iconify.design";
const BRAND_PREFIXES =
  "logos,simple-icons,fa-brands,mdi,fluent,vscode-icons,devicon,ant-design,material-symbols," +
  "ri,bi,file-icons,ph,tabler,heroicons,ion,clarity,carbon,cib,ic,twemoji";
const SEARCH_LIMIT = 128;
const BRAND_STRIPPED_LIMIT = 64;
const MAX_RESULTS = 160;
const MAX_QUERY = 80;
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const VENDOR_RE = /^(ms|microsoft|apple|google|aws|amazon)\s+/i;

// Python's urllib.parse.quote(text): encodeURIComponent keeps !'()* and escapes "/".
function quote(text) {
  return encodeURIComponent(text)
    .replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%2F/g, "/");
}

async function getJson(fetchFn, url, signal) {
  let response;
  try {
    response = await fetchFn(url, { signal });
  } catch (err) {
    if (err && err.name === "AbortError") throw err;
    throw new Error(`icon search is unavailable: ${(err && err.message) || err}`);
  }
  if (!response.ok) throw new Error(`Iconify answered ${response.status}`);
  try {
    return await response.json();
  } catch (err) {
    if (err && err.name === "AbortError") throw err;
    throw new Error("Iconify's answer is not JSON");
  }
}

/**
 * Iconify names for a query: brand sets first, then the same search without a leading vendor
 * word, then every set; only well-formed names, deduplicated, at most 160.
 * @param {string} query
 * @param {{ fetch?: typeof fetch, signal?: AbortSignal }} [options]
 * @returns {Promise<string[]>}
 */
export async function iconifySearch(query, { fetch: fetchFn = globalThis.fetch, signal } = {}) {
  const text = String(query ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_QUERY);
  if (!text) return [];
  const urls = [`${ICONIFY}/search?query=${quote(text)}&prefixes=${BRAND_PREFIXES}&limit=${SEARCH_LIMIT}`];
  const stripped = text.replace(VENDOR_RE, "").replace(/\s+/g, " ").trim();
  if (stripped && stripped.toLowerCase() !== text.toLowerCase()) {
    urls.push(`${ICONIFY}/search?query=${quote(stripped)}&prefixes=${BRAND_PREFIXES}&limit=${BRAND_STRIPPED_LIMIT}`);
  }
  urls.push(`${ICONIFY}/search?query=${quote(text)}&limit=${SEARCH_LIMIT}`);
  const bodies = await Promise.all(urls.map((url) => getJson(fetchFn, url, signal)));
  const seen = new Set();
  for (const body of bodies) {
    const icons = body && Array.isArray(body.icons) ? body.icons : [];
    for (const name of icons) {
      if (typeof name === "string" && NAME_RE.test(name)) seen.add(name);
    }
  }
  return [...seen].slice(0, MAX_RESULTS);
}
