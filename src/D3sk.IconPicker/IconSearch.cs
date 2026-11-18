using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace D3sk.IconPicker;

/// <summary>An Iconify icon and its SVG.</summary>
/// <param name="Name">The Iconify name, <c>prefix:name</c>.</param>
/// <param name="Svg">The SVG text, drawn in <c>currentColor</c> at <c>1em</c>.</param>
public sealed record IconResult(string Name, string Svg);

/// <summary>Iconify name search and SVG fetch, cached in memory; safe under concurrent calls.</summary>
/// <remarks>Brand and logo sets rank above the general search. SVGs are fetched one request per icon set (Iconify answers 429 to a page asking a hundred SVGs one by one).</remarks>
/// <param name="http">The client to use; without one, its own (10 s timeout, redirects not followed).</param>
/// <param name="cacheSize">How many searches, and how many SVGs, each cache keeps.</param>
public sealed partial class IconSearch(HttpClient? http = null, int cacheSize = 512)
{
    private const string Iconify = "https://api.iconify.design";
    private const string BrandPrefixes =
        "logos,simple-icons,fa-brands,mdi,fluent,vscode-icons,devicon,ant-design,material-symbols,"
        + "ri,bi,file-icons,ph,tabler,heroicons,ion,clarity,carbon,cib,ic,twemoji";
    private const int SearchLimit = 128;
    private const int StrippedLimit = 64;
    private const int MaxResults = 160;
    private const int MaxQuery = 80;
    private const int MaxSearchBytes = 512 * 1024;
    private const int MaxSetBytes = 1024 * 1024;

    [GeneratedRegex("^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:[-_][a-z0-9]+)*$", RegexOptions.CultureInvariant)]
    private static partial Regex NameRe();

    [GeneratedRegex("^(ms|microsoft|apple|google|aws|amazon)\\s+", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex VendorRe();

    [GeneratedRegex("\\s+")]
    private static partial Regex SpacesRe();

    private static readonly byte[] Missing = [];

    private readonly HttpClient _http = http ?? new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
    {
        Timeout = TimeSpan.FromSeconds(10),
    };

    private readonly object _gate = new();
    private readonly Lru<string[]> _searches = new(cacheSize);
    private readonly Lru<byte[]> _svgs = new(cacheSize);

    /// <summary>Searches Iconify: brand sets first, then the same search without a leading vendor word, then every set.</summary>
    /// <param name="query">What to look for; trimmed, whitespace collapsed, cut at 80 characters. Blank asks nothing.</param>
    /// <param name="ct">Cancels the requests.</param>
    /// <returns>Well-formed Iconify names, deduplicated, at most 160, each with its SVG; an icon whose SVG could not be had is left out.</returns>
    /// <exception cref="IconUnavailableException">Iconify is unreachable, refused, or answered something too large or not JSON.</exception>
    public async Task<IReadOnlyList<IconResult>> SearchAsync(string query, CancellationToken ct = default)
    {
        var names = await NamesAsync(query, ct).ConfigureAwait(false);
        var svgs = await SvgsOfAsync(names, ct).ConfigureAwait(false);
        return [.. names.Where(svgs.ContainsKey).Select(n => new IconResult(n, Encoding.UTF8.GetString(svgs[n])))];
    }

    /// <summary>The data URL a host stores for one Iconify icon: its SVG in <c>currentColor</c>.</summary>
    /// <param name="name">The Iconify name, such as <c>mdi:folder-star</c>.</param>
    /// <param name="ct">Cancels the request.</param>
    /// <returns>A base64 <c>data:image/svg+xml</c> URL.</returns>
    /// <exception cref="IconException">The name is not an Iconify <c>prefix:name</c>.</exception>
    /// <exception cref="IconUnavailableException">Iconify is unreachable or has no such icon.</exception>
    public async Task<string> DataUrlAsync(string name, CancellationToken ct = default)
    {
        name = IconValidator.CheckName(name);
        var svgs = await SvgsOfAsync([name], ct).ConfigureAwait(false);
        if (!svgs.TryGetValue(name, out var svg)) throw new IconUnavailableException($"Iconify has no icon {name}");
        return IconValidator.SvgDataUrl(svg);
    }

    private async Task<string[]> NamesAsync(string query, CancellationToken ct)
    {
        var text = Cut(SpacesRe().Replace((query ?? "").Trim(), " "));
        if (text.Length == 0) return [];
        var key = text.ToLowerInvariant();
        lock (_gate)
        {
            if (_searches.TryGet(key, out var cached)) return cached;
        }
        var urls = new List<(string Url, int Limit)> { (SearchUrl(text, BrandPrefixes, SearchLimit), SearchLimit) };
        var stripped = SpacesRe().Replace(VendorRe().Replace(text, ""), " ").Trim();
        if (stripped.Length > 0 && !string.Equals(stripped, text, StringComparison.OrdinalIgnoreCase))
            urls.Add((SearchUrl(stripped, BrandPrefixes, StrippedLimit), StrippedLimit));
        urls.Add((SearchUrl(text, null, SearchLimit), SearchLimit));
        var bodies = await Task.WhenAll(urls.Select(u => GetJsonAsync(u.Url, MaxSearchBytes, ct))).ConfigureAwait(false);
        var seen = new HashSet<string>();
        var ordered = new List<string>();
        foreach (var body in bodies)
        {
            using (body)
            {
                if (body.RootElement.ValueKind != JsonValueKind.Object
                    || !body.RootElement.TryGetProperty("icons", out var icons)
                    || icons.ValueKind != JsonValueKind.Array) continue;
                foreach (var item in icons.EnumerateArray())
                    if (item.ValueKind == JsonValueKind.String && item.GetString() is { } n && NameRe().IsMatch(n) && seen.Add(n))
                        ordered.Add(n);
            }
        }
        var names = ordered.Take(MaxResults).ToArray();
        lock (_gate) _searches.Put(key, names);
        return names;
    }

    private static string Cut(string text)
    {
        var runes = text.EnumerateRunes().Take(MaxQuery + 1).ToList();
        return runes.Count <= MaxQuery ? text : string.Concat(runes.Take(MaxQuery).Select(r => r.ToString()));
    }

    private static string SearchUrl(string text, string? prefixes, int limit) =>
        $"{Iconify}/search?query={Quote(text)}" + (prefixes is null ? "" : $"&prefixes={prefixes}") + $"&limit={limit}";

    // Python's urllib.parse.quote: letters, digits, "_.-~" and "/" stay; every other UTF-8 byte is %XX.
    private static string Quote(string text)
    {
        var sb = new StringBuilder();
        foreach (var b in Encoding.UTF8.GetBytes(text))
        {
            if (b is (>= (byte)'a' and <= (byte)'z') or (>= (byte)'A' and <= (byte)'Z') or (>= (byte)'0' and <= (byte)'9')
                or (byte)'_' or (byte)'.' or (byte)'-' or (byte)'~' or (byte)'/')
                sb.Append((char)b);
            else
                sb.Append('%').Append(b.ToString("X2"));
        }
        return sb.ToString();
    }

    // name → SVG; an icon Iconify lacks, or whose set could not be read, is absent.
    private async Task<Dictionary<string, byte[]>> SvgsOfAsync(IReadOnlyList<string> names, CancellationToken ct)
    {
        var found = new Dictionary<string, byte[]>();
        var missing = new Dictionary<string, List<string>>();
        lock (_gate)
        {
            foreach (var name in names)
            {
                if (_svgs.TryGet(name, out var svg))
                {
                    if (svg.Length > 0) found[name] = svg;
                    continue;
                }
                var parts = name.Split(':', 2);
                if (!missing.TryGetValue(parts[0], out var list)) missing[parts[0]] = list = [];
                list.Add(parts[1]);
            }
        }
        if (missing.Count == 0) return found;
        var batches = await Task.WhenAll(missing.Select(m => SetSvgsAsync(m.Key, m.Value, ct))).ConfigureAwait(false);
        lock (_gate)
        {
            foreach (var batch in batches)
                foreach (var (name, svg) in batch)
                {
                    _svgs.Put(name, svg);
                    if (svg.Length > 0) found[name] = svg;
                }
        }
        return found;
    }

    // One request for many icons of one set; empty when the set could not be read (nothing is remembered).
    private async Task<Dictionary<string, byte[]>> SetSvgsAsync(string prefix, List<string> icons, CancellationToken ct)
    {
        var result = new Dictionary<string, byte[]>();
        JsonDocument doc;
        try
        {
            doc = await GetJsonAsync($"{Iconify}/{prefix}.json?icons={string.Join(',', icons)}", MaxSetBytes, ct).ConfigureAwait(false);
        }
        catch (IconUnavailableException)
        {
            return result;
        }
        using (doc)
        {
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return result;
            // A missing icon is remembered as empty, so a repeat search does not ask again.
            foreach (var icon in icons) result[$"{prefix}:{icon}"] = IconSvg.Build(doc.RootElement, icon) ?? Missing;
        }
        return result;
    }

    private async Task<JsonDocument> GetJsonAsync(string url, int maxBytes, CancellationToken ct)
    {
        try
        {
            using var response = await _http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
            if ((int)response.StatusCode != 200) throw new IconUnavailableException($"Iconify answered {(int)response.StatusCode}");
            var body = await ReadCappedAsync(response.Content, maxBytes, ct).ConfigureAwait(false)
                ?? throw new IconUnavailableException("Iconify's answer is too large");
            try
            {
                return JsonDocument.Parse(body);
            }
            catch (JsonException)
            {
                throw new IconUnavailableException("Iconify's answer is not JSON");
            }
        }
        catch (Exception e) when (e is HttpRequestException or IOException or OperationCanceledException && !ct.IsCancellationRequested)
        {
            throw new IconUnavailableException($"icon search is unavailable: {e.Message}", e);
        }
    }

    // The body, or null when it is longer than the cap (read no further than cap + 1 bytes).
    private static async Task<byte[]?> ReadCappedAsync(HttpContent content, int max, CancellationToken ct)
    {
        if (content.Headers.ContentLength > max) return null;
        await using var stream = await content.ReadAsStreamAsync(ct).ConfigureAwait(false);
        using var buffer = new MemoryStream();
        var chunk = new byte[16 * 1024];
        int read;
        while ((read = await stream.ReadAsync(chunk, ct).ConfigureAwait(false)) > 0)
        {
            if (buffer.Length + read > max) return null;
            buffer.Write(chunk, 0, read);
        }
        return buffer.ToArray();
    }

    // A small LRU; the caller holds the lock.
    private sealed class Lru<T>(int capacity)
    {
        private readonly Dictionary<string, LinkedListNode<(string Key, T Value)>> _map = [];
        private readonly LinkedList<(string Key, T Value)> _order = new();

        public bool TryGet(string key, out T value)
        {
            if (_map.TryGetValue(key, out var node))
            {
                _order.Remove(node);
                _order.AddLast(node);
                value = node.Value.Value;
                return true;
            }
            value = default!;
            return false;
        }

        public void Put(string key, T value)
        {
            if (_map.TryGetValue(key, out var old)) _order.Remove(old);
            _map[key] = _order.AddLast((key, value));
            while (_map.Count > capacity)
            {
                _map.Remove(_order.First!.Value.Key);
                _order.RemoveFirst();
            }
        }
    }
}
