using System.Net;
using System.Text.Json;

namespace D3sk.IconPicker.Tests;

/// <summary>
/// A stand-in for api.iconify.design: replays the recorded fixtures of tests/fixtures/iconify/2026-11,
/// matching path + query exactly against index.json, and fails the test on any unrecorded URL.
/// </summary>
public sealed class FakeIconify : HttpMessageHandler
{
    private static readonly Lazy<Dictionary<string, string>> Index = new(() =>
        JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(Path.Combine(FixtureDir, "index.json")))!);

    private readonly Func<Uri, HttpResponseMessage?>? _answer;
    private readonly List<string> _requests = [];

    /// <summary>Creates the fake; <paramref name="answer"/> may answer a request itself (null = replay the fixture).</summary>
    public FakeIconify(Func<Uri, HttpResponseMessage?>? answer = null) => _answer = answer;

    /// <summary>The recorded fixtures folder.</summary>
    public static string FixtureDir
    {
        get
        {
            var dir = AppContext.BaseDirectory;
            while (dir is not null && !File.Exists(Path.Combine(dir, "D3sk.IconPicker.slnx"))) dir = Path.GetDirectoryName(dir);
            return Path.Combine(dir ?? throw new InvalidOperationException("repo root not found"), "tests", "fixtures", "iconify", "2026-11");
        }
    }

    /// <summary>Path + query of every request seen, in arrival order.</summary>
    public IReadOnlyList<string> Requests
    {
        get { lock (_requests) return [.. _requests]; }
    }

    /// <summary>Requests whose path + query starts with <paramref name="start"/>.</summary>
    public int Count(string start) => Requests.Count(r => r.StartsWith(start, StringComparison.Ordinal));

    /// <summary>A 200 JSON answer.</summary>
    public static HttpResponseMessage Json(string json) => Reply(HttpStatusCode.OK, json);

    /// <summary>An answer with a status and a body.</summary>
    public static HttpResponseMessage Reply(HttpStatusCode status, string body) =>
        new(status) { Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json") };

    /// <inheritdoc/>
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var key = request.RequestUri!.PathAndQuery;
        lock (_requests) _requests.Add(key);
        var answer = _answer?.Invoke(request.RequestUri);
        if (answer is not null) return Task.FromResult(answer);
        if (!Index.Value.TryGetValue(key, out var file))
            throw new InvalidOperationException($"unrecorded Iconify URL: {key}");
        return Task.FromResult(Json(File.ReadAllText(Path.Combine(FixtureDir, file))));
    }
}
