import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { iconifySearch } from "../src/index.js";

const DIR = new URL("../../../tests/fixtures/iconify/2026-11/", import.meta.url);
const index = JSON.parse(readFileSync(new URL("index.json", DIR), "utf8"));
const recorded = (file) => JSON.parse(readFileSync(new URL(file, DIR), "utf8"));

// A fake fetch replaying the recorded answers by path + query; an unrecorded URL is a miss the test asserts on.
function replay(overrides = {}) {
  const calls = [];
  const misses = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const key = url.replace("https://api.iconify.design", "");
    const answer = overrides[key];
    if (answer) return answer;
    if (!index[key]) {
      misses.push(key);
      return new Response("not recorded", { status: 404 });
    }
    return new Response(readFileSync(new URL(index[key], DIR)), { status: 200 });
  };
  return { fetch, calls, misses };
}

const BRAND =
  "logos,simple-icons,fa-brands,mdi,fluent,vscode-icons,devicon,ant-design,material-symbols,ri,bi,file-icons,ph,tabler,heroicons,ion,clarity,carbon,cib,ic,twemoji";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const keyOf = (call) => call.url.replace("https://api.iconify.design", "");
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

test("github: brand search then every-set search, two requests, no vendor-stripped one", async () => {
  const fake = replay();
  const names = await iconifySearch("github", { fetch: fake.fetch });
  assert.deepEqual(fake.misses, []);
  assert.equal(fake.calls.length, 2);
  assert.match(keyOf(fake.calls[0]), /^\/search\?query=github&prefixes=logos,simple-icons,.*,twemoji&limit=128$/);
  assert.equal(keyOf(fake.calls[1]), "/search?query=github&limit=128");
  const expected = [...new Set([...recorded("search-github-brand.json").icons, ...recorded("search-github-all.json").icons])];
  assert.deepEqual(names, expected);
  assert.deepEqual(names.slice(0, 3), ["mdi:github", "ri:github-fill", "ri:github-line"]);
});

test("microsoft teams: brand, vendor-stripped brand, every set, in that merge order", async () => {
  const fake = replay();
  const names = await iconifySearch("  Microsoft   Teams ".replace("Microsoft", "microsoft").replace("Teams", "teams"), { fetch: fake.fetch });
  assert.deepEqual(fake.misses, []);
  assert.deepEqual(fake.calls.map((c) => keyOf(c).replace(/prefixes=[^&]*&/, "P&")), [
    "/search?query=microsoft%20teams&P&limit=128",
    "/search?query=teams&P&limit=64",
    "/search?query=microsoft%20teams&limit=128",
  ]);
  const expected = [
    ...new Set([
      ...recorded("search-microsoft-teams-brand.json").icons,
      ...recorded("search-teams-brand.json").icons,
      ...recorded("search-microsoft-teams-all.json").icons,
    ]),
  ];
  assert.deepEqual(names, expected);
  assert.equal(names[0], "mdi:microsoft-teams");
  // The stripped search's own first hit comes after the first brand search's names.
  assert.ok(names.indexOf("tabler:brand-teams") > names.indexOf("logos:microsoft-teams"));
});

test("the result is an array of well-formed, unique Iconify name strings", async () => {
  const names = await iconifySearch("microsoft teams", { fetch: replay().fetch });
  assert.ok(Array.isArray(names) && names.length > 0);
  for (const name of names) {
    assert.equal(typeof name, "string");
    assert.match(name, NAME_RE);
  }
  assert.equal(new Set(names).size, names.length);
});

test("the three searches are started together, before any answer", async () => {
  let started = 0;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const fetch = async () => {
    started += 1;
    await gate;
    return json({ icons: [] });
  };
  const pending = iconifySearch("microsoft teams", { fetch });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(started, 3);
  release();
  assert.deepEqual(await pending, []);
});

test("bad names are dropped, duplicates keep their first place, order is brand first", async () => {
  const fake = replay({
    [`/search?query=x&prefixes=${BRAND}&limit=128`]: json({ icons: ["b:one", "Bad:Name", "no-colon", "a:b/c", "a:b:c", "b:one", 7, null, "a:-x", "c:two_2"] }),
    "/search?query=x&limit=128": json({ icons: ["a:zero", "b:one", "c:two_2"] }),
  });
  assert.deepEqual(await iconifySearch("x", { fetch: fake.fetch }), ["b:one", "c:two_2", "a:zero"]);
});

test("a missing or malformed icons list gives nothing, not an error", async () => {
  const fetch = async () => json({ total: 0 });
  assert.deepEqual(await iconifySearch("x", { fetch }), []);
  assert.deepEqual(await iconifySearch("x", { fetch: async () => json([1, 2]) }), []);
  assert.deepEqual(await iconifySearch("x", { fetch: async () => json({ icons: "mdi:a" }) }), []);
});

test("the result is capped at 160 names", async () => {
  const many = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}:icon-${i}`);
  const fetch = async (url) => json({ icons: url.includes("prefixes=") ? many("a", 128) : many("b", 128) });
  const names = await iconifySearch("anything", { fetch });
  assert.equal(names.length, 160);
  assert.equal(names[0], "a:icon-0");
  assert.equal(names[127], "a:icon-127");
  assert.equal(names[128], "b:icon-0");
  assert.equal(names[159], "b:icon-31");
});

test("an empty or blank query asks nothing", async () => {
  const fake = replay();
  for (const q of ["", "   ", "\n\t", undefined, null]) assert.deepEqual(await iconifySearch(q, { fetch: fake.fetch }), []);
  assert.equal(fake.calls.length, 0);
});

test("the query is trimmed, whitespace collapsed and cut at 80", async () => {
  const fake = replay();
  await iconifySearch("  github   \n ", { fetch: fake.fetch });
  assert.equal(keyOf(fake.calls[1]), "/search?query=github&limit=128");
  const long = "a".repeat(100);
  const urls = [];
  await iconifySearch(long, { fetch: async (url) => (urls.push(url), json({ icons: [] })) });
  assert.equal(urls[1], `https://api.iconify.design/search?query=${"a".repeat(80)}&limit=128`);
});

test("a vendor word alone, or the same word in another case, adds no second brand search", async () => {
  for (const q of ["Microsoft", "apple Apple"]) {
    const calls = [];
    const fetch = async (url) => (calls.push(url), json({ icons: [] }));
    await iconifySearch(q, { fetch });
    assert.equal(calls.length, q === "apple Apple" ? 3 : 2, q);
  }
});

test("characters are quoted as Python's quote does", async () => {
  const calls = [];
  const fetch = async (url) => (calls.push(url), json({ icons: [] }));
  await iconifySearch("a/b (c)!'*é", { fetch });
  assert.match(calls[0], /query=a\/b%20%28c%29%21%27%2A%C3%A9&prefixes=/);
});

test("signal is passed to every fetch", async () => {
  const controller = new AbortController();
  const fake = replay();
  await iconifySearch("microsoft teams", { fetch: fake.fetch, signal: controller.signal });
  assert.equal(fake.calls.length, 3);
  for (const call of fake.calls) assert.equal(call.init.signal, controller.signal);
});

test("an aborted search rejects with the AbortError, not a wrapped one", async () => {
  const controller = new AbortController();
  const fetch = (url, { signal }) =>
    new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
  const pending = iconifySearch("github", { fetch, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (err) => err.name === "AbortError");
});

test("a failing fetch throws a readable Error", async () => {
  const fetch = async () => {
    throw new TypeError("network down");
  };
  await assert.rejects(iconifySearch("github", { fetch }), (err) => {
    assert.ok(err instanceof Error);
    assert.equal(err.message, "icon search is unavailable: network down");
    return true;
  });
});

test("a non-OK answer throws a readable Error", async () => {
  const fetch = async () => new Response("slow down", { status: 429 });
  await assert.rejects(iconifySearch("github", { fetch }), { message: "Iconify answered 429" });
});

test("one failing search of three fails the whole search", async () => {
  const fetch = async (url) => (url.includes("limit=64") ? new Response("", { status: 500 }) : json({ icons: ["a:b"] }));
  await assert.rejects(iconifySearch("microsoft teams", { fetch }), { message: "Iconify answered 500" });
});

test("a non-JSON answer throws a readable Error", async () => {
  const fetch = async () => new Response("<html>oops</html>", { status: 200 });
  await assert.rejects(iconifySearch("github", { fetch }), { message: "Iconify's answer is not JSON" });
});

test("the global fetch is the default", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => (calls.push(url), json({ icons: ["mdi:a"] }));
  try {
    assert.deepEqual(await iconifySearch("a"), ["mdi:a"]);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(calls.length, 2);
});
