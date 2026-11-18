using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace D3sk.IconPicker.Tests;

public partial class IconSearchTests
{
    [GeneratedRegex("^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:[-_][a-z0-9]+)*$")]
    private static partial Regex NameRe();

    private static Searcher Search(FakeIconify fake) => new(new IconSearch(new HttpClient(fake)));

    // Passes the test's cancellation token (xUnit1051) so each test reads as a plain call.
    private sealed class Searcher(IconSearch inner)
    {
        public Task<IReadOnlyList<IconResult>> SearchAsync(string query) =>
            inner.SearchAsync(query, TestContext.Current.CancellationToken);

        public Task<string> DataUrlAsync(string name) => inner.DataUrlAsync(name, TestContext.Current.CancellationToken);
    }

    private static List<string> FixtureNames(params string[] files)
    {
        var seen = new List<string>();
        foreach (var file in files)
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(FakeIconify.FixtureDir, file + ".json")));
            foreach (var n in doc.RootElement.GetProperty("icons").EnumerateArray().Select(e => e.GetString()!))
                if (NameRe().IsMatch(n) && !seen.Contains(n)) seen.Add(n);
        }
        return seen;
    }

    private static string Svg(string body = "<path/>") => "{\"width\":24,\"height\":24,\"icons\":{\"a\":{\"body\":\"" + body + "\"}}}";

    // A synthetic Iconify: `names` for every search, one icon per set answered by `set`.
    private static FakeIconify Synthetic(string[] names, Func<string, HttpResponseMessage?>? set = null) =>
        new(uri =>
        {
            if (uri.AbsolutePath == "/search")
                return FakeIconify.Json(JsonSerializer.Serialize(new { icons = names }));
            var prefix = uri.AbsolutePath.TrimStart('/').Replace(".json", "");
            var custom = set?.Invoke(prefix);
            if (custom is not null) return custom;
            var icons = uri.Query.Split('=')[1].Split(',')
                .Select(icon => "\"" + icon + "\":{\"body\":\"<path d='" + prefix + "'/>\"}");
            return FakeIconify.Json("{\"icons\":{" + string.Join(',', icons) + "}}");
        });

    [Fact]
    public async Task Brand_then_every_set_deduplicated_one_request_per_set()
    {
        var fake = new FakeIconify();
        var found = await Search(fake).SearchAsync("github");
        var expected = FixtureNames("search-github-brand", "search-github-all").Take(160).ToList();
        Assert.Equal(expected, found.Select(f => f.Name));
        Assert.All(found, f => Assert.StartsWith("<svg", f.Svg));
        Assert.Equal(2, fake.Count("/search"));
        var sets = expected.Select(n => n.Split(':')[0]).Distinct().Count();
        Assert.Equal(sets, fake.Requests.Count(r => !r.StartsWith("/search")));
        Assert.Equal(fake.Requests.Count, fake.Requests.Distinct().Count());
    }

    [Fact]
    public async Task The_merged_result_is_cut_at_160()
    {
        var fake = Synthetic(Enumerable.Range(0, 200).Select(i => $"mdi:icon-{i}").ToArray());
        var found = await Search(fake).SearchAsync("many");
        Assert.Equal(160, found.Count);
        Assert.Equal("mdi:icon-159", found[^1].Name);
        Assert.Equal(1, fake.Requests.Count(r => r.StartsWith("/mdi.json")));
    }

    [Fact]
    public async Task A_vendor_word_adds_a_stripped_brand_search_in_the_middle()
    {
        var fake = new FakeIconify();
        var found = await Search(fake).SearchAsync(" microsoft   teams ");
        var expected = FixtureNames("search-microsoft-teams-brand", "search-teams-brand", "search-microsoft-teams-all").Take(160).ToList();
        Assert.Equal(expected, found.Select(f => f.Name));
        Assert.Equal(3, fake.Count("/search"));
        Assert.Contains(fake.Requests, r => r.EndsWith("query=teams&prefixes=" + BrandTail(r)) && r.EndsWith("&limit=64"));
    }

    private static string BrandTail(string url) => url.Split("prefixes=")[1];

    [Fact]
    public async Task A_query_with_no_vendor_word_asks_twice()
    {
        var fake = Synthetic([]);
        await Search(fake).SearchAsync("rocket");
        Assert.Equal(2, fake.Count("/search"));
    }

    [Fact]
    public async Task The_query_is_trimmed_collapsed_cut_at_80_and_quoted_like_python()
    {
        var fake = Synthetic([]);
        var search = Search(fake);
        await search.SearchAsync("  a/b   c!'()*é ");
        await search.SearchAsync(new string('x', 100));
        Assert.StartsWith("/search?query=a/b%20c%21%27%28%29%2A%C3%A9&prefixes=logos,", fake.Requests[0]);
        Assert.Contains($"query={new string('x', 80)}&", fake.Requests[2]);
    }

    [Fact]
    public async Task An_empty_query_asks_nothing()
    {
        var fake = new FakeIconify();
        Assert.Empty(await Search(fake).SearchAsync("   "));
        Assert.Empty(fake.Requests);
    }

    [Fact]
    public async Task Bad_names_are_dropped()
    {
        var fake = Synthetic(["mdi:a", "bad name", "Logos:Github", "mdi:a", "x:y:z"]);
        var found = await Search(fake).SearchAsync("q");
        Assert.Equal(["mdi:a"], found.Select(f => f.Name));
    }

    [Fact]
    public async Task A_repeat_search_in_another_case_is_cached()
    {
        var fake = new FakeIconify();
        var search = Search(fake);
        var first = await search.SearchAsync("github");
        var asked = fake.Requests.Count;
        var again = await search.SearchAsync("GitHub");
        Assert.Equal(asked, fake.Requests.Count);
        Assert.Equal(first.Select(f => f.Name), again.Select(f => f.Name));
    }

    [Fact]
    public async Task A_missing_icon_is_remembered()
    {
        var fake = Synthetic(["mdi:a", "mdi:ghost"], _ => FakeIconify.Json(Svg()));
        var search = Search(fake);
        Assert.Equal(["mdi:a"], (await search.SearchAsync("one")).Select(f => f.Name));
        var sets = fake.Count("/mdi.json");
        Assert.Equal(["mdi:a"], (await search.SearchAsync("two")).Select(f => f.Name));
        Assert.Equal(sets, fake.Count("/mdi.json"));
        Assert.Equal(1, sets);
    }

    [Fact]
    public async Task A_failing_set_leaves_the_others_and_is_not_remembered()
    {
        var down = true;
        var fake = Synthetic(["mdi:a", "ri:a"], prefix =>
            prefix == "ri" && down ? FakeIconify.Reply(HttpStatusCode.InternalServerError, "") : null);
        var search = Search(fake);
        Assert.Equal(["mdi:a"], (await search.SearchAsync("one")).Select(f => f.Name));
        down = false;
        Assert.Equal(["mdi:a", "ri:a"], (await search.SearchAsync("two")).Select(f => f.Name));
        Assert.Equal(1, fake.Count("/mdi.json"));
        Assert.Equal(2, fake.Count("/ri.json"));
    }

    [Fact]
    public async Task An_oversize_or_non_json_set_is_a_failing_set()
    {
        var fake = Synthetic(["mdi:a", "ri:a", "bi:a"], prefix => prefix switch
        {
            "mdi" => FakeIconify.Json(new string(' ', 1024 * 1024 + 1)),
            "ri" => FakeIconify.Json("<html>"),
            _ => null,
        });
        Assert.Equal(["bi:a"], (await Search(fake).SearchAsync("q")).Select(f => f.Name));
    }

    [Fact]
    public async Task Unreachable_is_unavailable()
    {
        var fake = new FakeIconify(_ => throw new HttpRequestException("no route"));
        var ex = await Assert.ThrowsAsync<IconUnavailableException>(() => Search(fake).SearchAsync("q"));
        Assert.Contains("icon search is unavailable", ex.Message);
    }

    [Fact]
    public async Task A_non_200_search_is_unavailable_and_not_cached()
    {
        var fake = new FakeIconify(_ => FakeIconify.Reply(HttpStatusCode.TooManyRequests, "{}"));
        var search = Search(fake);
        var ex = await Assert.ThrowsAsync<IconUnavailableException>(() => search.SearchAsync("q"));
        Assert.Equal("Iconify answered 429", ex.Message);
        await Assert.ThrowsAsync<IconUnavailableException>(() => search.SearchAsync("q"));
    }

    [Fact]
    public async Task An_oversize_search_answer_is_unavailable()
    {
        var fake = new FakeIconify(_ => FakeIconify.Json(new string(' ', 512 * 1024 + 1)));
        var ex = await Assert.ThrowsAsync<IconUnavailableException>(() => Search(fake).SearchAsync("q"));
        Assert.Equal("Iconify's answer is too large", ex.Message);
    }

    [Fact]
    public async Task A_non_json_search_answer_is_unavailable()
    {
        var fake = new FakeIconify(_ => FakeIconify.Json("<html>nope"));
        var ex = await Assert.ThrowsAsync<IconUnavailableException>(() => Search(fake).SearchAsync("q"));
        Assert.Equal("Iconify's answer is not JSON", ex.Message);
    }

    [Fact]
    public async Task The_data_url_of_a_name()
    {
        var fake = new FakeIconify();
        var url = await Search(fake).DataUrlAsync(" MDI:GitHub ");
        Assert.StartsWith("data:image/svg+xml;base64,", url);
        var svg = Encoding.UTF8.GetString(Convert.FromBase64String(url["data:image/svg+xml;base64,".Length..]));
        Assert.StartsWith("<svg", svg);
        Assert.Equal(["/mdi.json?icons=github"], fake.Requests);
    }

    [Fact]
    public async Task An_unknown_icon_is_unavailable_and_a_bad_name_an_icon_error()
    {
        var fake = Synthetic([], _ => FakeIconify.Json(Svg()));
        var search = Search(fake);
        var ex = await Assert.ThrowsAsync<IconUnavailableException>(() => search.DataUrlAsync("mdi:ghost"));
        Assert.Equal("Iconify has no icon mdi:ghost", ex.Message);
        await Assert.ThrowsAsync<IconException>(() => search.DataUrlAsync("not a name"));
    }

    [Fact]
    public async Task Parallel_searches_stay_correct()
    {
        var fake = new FakeIconify();
        var search = Search(fake);
        var sequential = (await Search(new FakeIconify()).SearchAsync("github")).Select(f => f.Name).ToList();
        var all = await Task.WhenAll(Enumerable.Range(0, 16).Select(i =>
            search.SearchAsync(i % 2 == 0 ? "github" : "GITHUB")));
        Assert.All(all, r => Assert.Equal(sequential, r.Select(f => f.Name)));
    }
}
