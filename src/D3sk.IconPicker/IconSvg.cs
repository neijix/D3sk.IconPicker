using System.Globalization;
using System.Text;
using System.Text.Json;

namespace D3sk.IconPicker;

/// <summary>Builds an SVG from an Iconify icon set's JSON.</summary>
public static class IconSvg
{
    private const int MaxSvg = 32 * 1024;
    private const int MaxHops = 4;

    /// <summary>Builds the SVG of one icon of an Iconify set, drawn in <c>currentColor</c> at <c>1em</c>.</summary>
    /// <remarks>An alias is followed up to 4 hops, its own fields winning over its parent's. Alias transforms (rotate, flip) are not applied: the parent's drawing stands in.</remarks>
    /// <param name="set">The set JSON (<c>icons</c>, <c>aliases</c>, set-wide size defaults).</param>
    /// <param name="icon">The icon or alias name inside the set, without its prefix.</param>
    /// <returns>UTF-8 SVG bytes, or null when the icon is missing, has no body, exceeds 32 KiB or fails the SVG check.</returns>
    public static byte[]? Build(JsonElement set, string icon)
    {
        if (set.ValueKind != JsonValueKind.Object) return null;
        var icons = Section(set, "icons");
        var aliases = Section(set, "aliases");
        var entry = new Dictionary<string, JsonElement>();
        var name = icon;
        for (var hop = 0; hop < MaxHops; hop++)
        {
            if (icons is { } i && i.TryGetProperty(name, out var found) && found.ValueKind == JsonValueKind.Object)
            {
                var merged = Fields(found);
                foreach (var (key, value) in entry)
                    if (key != "parent") merged[key] = value;
                entry = merged;
                break;
            }
            if (aliases is not { } a || !a.TryGetProperty(name, out var alias) || alias.ValueKind != JsonValueKind.Object)
                return null;
            var fields = Fields(alias);
            foreach (var (key, value) in entry) fields[key] = value;
            entry = fields;
            name = alias.TryGetProperty("parent", out var parent) && parent.ValueKind == JsonValueKind.String
                ? parent.GetString()!
                : "";
        }
        if (!entry.TryGetValue("body", out var body) || body.ValueKind != JsonValueKind.String) return null;
        var text = body.GetString();
        if (string.IsNullOrEmpty(text)) return null;

        double Num(string key, double fallback)
        {
            if (entry.TryGetValue(key, out var v) || set.TryGetProperty(key, out v))
                if (v.ValueKind == JsonValueKind.Number) return v.GetDouble();
            return fallback;
        }

        var box = string.Join(' ', new[] { Num("left", 0), Num("top", 0), Num("width", 16), Num("height", 16) }.Select(General));
        var svg = Encoding.UTF8.GetBytes(
            $"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1em\" height=\"1em\" viewBox=\"{box}\">{text}</svg>");
        if (svg.Length > MaxSvg) return null;
        try
        {
            return IconValidator.CheckSvg(svg);
        }
        catch (IconException)
        {
            return null;
        }
    }

    private static JsonElement? Section(JsonElement set, string key) =>
        set.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Object ? v : null;

    private static Dictionary<string, JsonElement> Fields(JsonElement obj)
    {
        var map = new Dictionary<string, JsonElement>();
        foreach (var p in obj.EnumerateObject()) map[p.Name] = p.Value;
        return map;
    }

    // Python's "{v:g}": six significant digits, e+06 exponents.
    private static string General(double v) =>
        v.ToString("G6", CultureInfo.InvariantCulture).Replace('E', 'e');
}
