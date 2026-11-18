using System.Text;
using System.Text.Json;
using D3sk.IconPicker;

namespace D3sk.IconPicker.Tests;

public class IconSvgTests
{
    private static JsonElement Json(string text) => JsonDocument.Parse(text).RootElement.Clone();

    private static string? Svg(string set, string icon)
    {
        var bytes = IconSvg.Build(Json(set), icon);
        return bytes is null ? null : Encoding.UTF8.GetString(bytes);
    }

    [Fact]
    public void An_alias_follows_its_parent_and_takes_the_set_sizes()
    {
        var svg = Svg("""{"width":24,"height":24,"icons":{"a":{"body":"<path/>"}},"aliases":{"b":{"parent":"a"}}}""", "b");
        Assert.Equal("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1em\" height=\"1em\" viewBox=\"0 0 24 24\"><path/></svg>", svg);
    }

    [Fact]
    public void A_missing_icon_is_none()
    {
        Assert.Null(Svg("""{"icons":{"a":{"body":"<path/>"}}}""", "missing"));
        Assert.Null(Svg("""{}""", "a"));
    }

    [Fact]
    public void Without_any_size_the_box_is_16()
    {
        Assert.Contains("viewBox=\"0 0 16 16\"", Svg("""{"icons":{"a":{"body":"<path/>"}}}""", "a"));
    }

    [Fact]
    public void Entry_fields_win_over_the_set_and_the_alias_over_its_parent()
    {
        var set = """{"width":24,"height":24,"icons":{"a":{"body":"<path/>","width":32,"left":1,"top":2}},"aliases":{"b":{"parent":"a","width":20}}}""";
        Assert.Contains("viewBox=\"1 2 20 24\"", Svg(set, "b"));
        Assert.Contains("viewBox=\"1 2 32 24\"", Svg(set, "a"));
    }

    [Fact]
    public void A_chain_of_aliases_resolves_up_to_four_hops()
    {
        var set = """{"icons":{"a":{"body":"<path/>"}},"aliases":{"b":{"parent":"a"},"c":{"parent":"b"},"d":{"parent":"c"},"e":{"parent":"d"}}}""";
        Assert.NotNull(Svg(set, "d"));
        Assert.Null(Svg(set, "e"));
    }

    [Fact]
    public void An_alias_loop_ends_in_none()
    {
        Assert.Null(Svg("""{"icons":{},"aliases":{"a":{"parent":"b"},"b":{"parent":"a"}}}""", "a"));
    }

    [Theory]
    [InlineData("""{"icons":{"x":{"body":"<script/>"}}}""")]
    [InlineData("""{"icons":{"x":{"body":""}}}""")]
    [InlineData("""{"icons":{"x":{}}}""")]
    [InlineData("""{"icons":{"x":{"body":"<a href=\"http://x\"/>"}}}""")]
    public void A_body_that_fails_the_check_is_none(string set) => Assert.Null(Svg(set, "x"));

    [Fact]
    public void An_svg_over_32_KiB_is_none()
    {
        string Set(int n) => "{\"icons\":{\"x\":{\"body\":\"" + new string('a', n) + "\"}}}";
        Assert.Null(Svg(Set(32 * 1024), "x"));
        Assert.NotNull(Svg(Set(32 * 1024 - 200), "x"));
    }

    [Fact]
    public void A_recorded_set_builds_its_alias()
    {
        var dir = AppContext.BaseDirectory;
        while (dir is not null && !File.Exists(Path.Combine(dir, "D3sk.IconPicker.slnx"))) dir = Path.GetDirectoryName(dir);
        Assert.NotNull(dir);
        var set = Json(File.ReadAllText(Path.Combine(dir, "tests", "fixtures", "iconify", "2026-11", "set-microsoft-teams-tabler.json")));
        var alias = IconSvg.Build(set, "brand-microsoft-teams");
        Assert.NotNull(alias);
        Assert.Equal(IconSvg.Build(set, "brand-teams"), alias);
        Assert.Contains("viewBox=\"0 0 24 24\"", Encoding.UTF8.GetString(alias));
    }
}
