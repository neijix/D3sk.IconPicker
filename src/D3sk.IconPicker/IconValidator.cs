using System.Text;
using System.Text.RegularExpressions;

namespace D3sk.IconPicker;

/// <summary>Checks for everything an icon picker stores: icon data URLs, colours, labels and Iconify names.</summary>
public static partial class IconValidator
{
    private const int MaxIcon = 96 * 1024;
    private const int MaxLabel = 120;
    private const string SvgPrefix = "data:image/svg+xml;base64,";

    // ECMAScript keeps \s and \b ASCII-only, as on Python bytes.
    private static readonly Regex ForbiddenSvg = new(
        "<\\s*(script|foreignobject|iframe|object|embed)\\b|\\son[a-z]+\\s*=|javascript:"
        + "|(?:xlink:)?href\\s*=\\s*[\"'](?!#)",
        RegexOptions.IgnoreCase | RegexOptions.ECMAScript | RegexOptions.CultureInvariant);

    [GeneratedRegex("^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:[-_][a-z0-9]+)*$", RegexOptions.CultureInvariant)]
    private static partial Regex NameRe();

    [GeneratedRegex("^#[0-9a-f]{6}$", RegexOptions.CultureInvariant)]
    private static partial Regex ColorRe();

    [GeneratedRegex("^data:(image/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)$", RegexOptions.CultureInvariant)]
    private static partial Regex DataUrlRe();

    /// <summary>Checks an icon data URL: an SVG without scripts or links, or a PNG / JPEG / GIF / WebP recognised by its bytes.</summary>
    /// <param name="value">The data URL, or null / blank for the default icon.</param>
    /// <returns>The data URL to store (an SVG is re-encoded), or null for the default icon.</returns>
    /// <exception cref="IconException">The icon is too large, not a base64 image data URL, or not the image it claims.</exception>
    public static string? CheckIcon(string? value)
    {
        var text = (value ?? "").Trim();
        if (text.Length == 0) return null;
        if (text.Length > MaxIcon) throw new IconException("icon: too large");
        var match = DataUrlRe().Match(text);
        if (!match.Success) throw new IconException("icon: a base64 data: URL");
        var media = match.Groups[1].Value;
        byte[] data;
        try
        {
            data = Convert.FromBase64String(match.Groups[2].Value);
        }
        catch (FormatException)
        {
            throw new IconException("icon: bad base64");
        }
        if (media == "image/svg+xml") return SvgDataUrl(CheckSvg(data));
        if (!IsRaster(media, data)) throw new IconException("icon: PNG, JPEG, GIF, WebP or SVG");
        return text;
    }

    /// <summary>Checks a colour: <c>#rgb</c> is expanded, <c>#rrggbb</c> lower-cased.</summary>
    /// <param name="value">The colour, or null / blank for the default colour.</param>
    /// <returns>A lower-case <c>#rrggbb</c>, or null for the default colour.</returns>
    /// <exception cref="IconException">The value is not a hex colour.</exception>
    public static string? CheckColor(string? value)
    {
        var text = (value ?? "").Trim().ToLowerInvariant();
        if (text.Length == 0) return null;
        if (text.Length == 4 && text[0] == '#')
        {
            var sb = new StringBuilder("#");
            foreach (var c in text.AsSpan(1)) sb.Append(c).Append(c);
            text = sb.ToString();
        }
        if (!ColorRe().IsMatch(text)) throw new IconException("color: #RGB or #RRGGBB");
        return text;
    }

    /// <summary>Checks a display label: whitespace is collapsed.</summary>
    /// <param name="value">The label, or null / blank for the default name.</param>
    /// <returns>The collapsed label, or null for the default name.</returns>
    /// <exception cref="IconException">The label is longer than 120 characters.</exception>
    public static string? CheckLabel(string? value)
    {
        var text = string.Join(' ', (value ?? "").Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        if (text.Length > MaxLabel) throw new IconException($"name: at most {MaxLabel} characters");
        return text.Length == 0 ? null : text;
    }

    /// <summary>Checks an Iconify name such as <c>mdi:folder-star</c>.</summary>
    /// <param name="name">The name, in any case.</param>
    /// <returns>The lower-cased <c>prefix:name</c>.</returns>
    /// <exception cref="IconException">The name is not an Iconify <c>prefix:name</c>.</exception>
    public static string CheckName(string name)
    {
        var text = (name ?? "").Trim().ToLowerInvariant();
        if (!NameRe().IsMatch(text)) throw new IconException("icon: an Iconify name like mdi:folder-star");
        return text;
    }

    /// <summary>Tells whether an icon is an SVG data URL drawn in <c>currentColor</c>, to be painted in the owner's colour.</summary>
    /// <param name="icon">The stored icon data URL.</param>
    /// <returns>True for an SVG using <c>currentColor</c>; false for anything else.</returns>
    public static bool IsTinted(string? icon)
    {
        if (string.IsNullOrEmpty(icon) || !icon.StartsWith(SvgPrefix, StringComparison.Ordinal)) return false;
        byte[] data;
        try
        {
            data = Convert.FromBase64String(icon[SvgPrefix.Length..]);
        }
        catch (FormatException)
        {
            return false;
        }
        return Encoding.Latin1.GetString(data).Contains("currentcolor", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>Wraps SVG bytes in a base64 <c>data:image/svg+xml</c> URL.</summary>
    /// <param name="svg">The SVG document.</param>
    /// <returns>The data URL.</returns>
    public static string SvgDataUrl(ReadOnlySpan<byte> svg) => SvgPrefix + Convert.ToBase64String(svg);

    // Also used by the SVG builder (same assembly) to drop a body that would not pass CheckIcon.
    internal static byte[] CheckSvg(byte[] data)
    {
        var start = 0;
        while (start < data.Length && IsAsciiSpace(data[start])) start++;
        var head = Encoding.Latin1.GetString(data, start, Math.Min(200, data.Length - start));
        var first400 = Encoding.Latin1.GetString(data, 0, Math.Min(400, data.Length));
        var startsRight = head.StartsWith("<svg", StringComparison.OrdinalIgnoreCase)
            || head.StartsWith("<?xml", StringComparison.OrdinalIgnoreCase);
        if (!startsRight || !first400.Contains("<svg", StringComparison.Ordinal))
            throw new IconException("icon: not an SVG image");
        if (ForbiddenSvg.IsMatch(Encoding.Latin1.GetString(data)))
            throw new IconException("icon: the SVG carries scripts or links");
        return data;
    }

    private static bool IsAsciiSpace(byte b) => b is 0x20 or (>= 0x09 and <= 0x0d);

    private static bool IsRaster(string media, byte[] data)
    {
        var span = data.AsSpan();
        return media switch
        {
            "image/png" => span.StartsWith(new byte[] { 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a }),
            "image/jpeg" => span.StartsWith(new byte[] { 0xff, 0xd8, 0xff }),
            "image/gif" => span.StartsWith("GIF87a"u8) || span.StartsWith("GIF89a"u8),
            "image/webp" => data.Length >= 12 && span[..4].SequenceEqual("RIFF"u8) && span.Slice(8, 4).SequenceEqual("WEBP"u8),
            _ => false,
        };
    }
}
