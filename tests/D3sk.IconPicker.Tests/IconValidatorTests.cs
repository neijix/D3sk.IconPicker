using System.Text;
using D3sk.IconPicker;

namespace D3sk.IconPicker.Tests;

public class IconValidatorTests
{
    private const string Svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><path fill=\"currentColor\" d=\"M0 0h1v1z\"/></svg>";
    private static readonly byte[] Png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, .. new byte[16]];

    private static string Data(string media, byte[] bytes) => $"data:{media};base64,{Convert.ToBase64String(bytes)}";
    private static string Data(string media, string text) => Data(media, Encoding.UTF8.GetBytes(text));

    [Fact]
    public void Empty_is_none()
    {
        Assert.Null(IconValidator.CheckIcon(null));
        Assert.Null(IconValidator.CheckIcon("   "));
    }

    [Fact]
    public void A_clean_svg_is_returned_re_encoded()
    {
        var url = Data("image/svg+xml", Svg);
        Assert.Equal(url, IconValidator.CheckIcon(url));
        Assert.StartsWith("data:image/svg+xml;base64,", IconValidator.CheckIcon(url));
    }

    [Theory]
    [InlineData("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>")]
    [InlineData("<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(1)\"></svg>")]
    [InlineData("<svg xmlns=\"http://www.w3.org/2000/svg\"><image href=\"https://evil.example/x.png\"/></svg>")]
    [InlineData("<svg xmlns=\"http://www.w3.org/2000/svg\"><a href=\"https://x\"><path d=\"M0 0\"/></a></svg>")]
    [InlineData("<svg xmlns=\"http://www.w3.org/2000/svg\"><foreignObject/></svg>")]
    [InlineData("<svg xmlns=\"http://www.w3.org/2000/svg\"><a xlink:href='javascript:alert(1)'/></svg>")]
    [InlineData("<svg><iframe/></svg>")]
    [InlineData("<svg><object/></svg>")]
    [InlineData("<svg><embed/></svg>")]
    public void An_svg_with_scripts_or_outside_links_is_refused(string bad)
    {
        var ex = Assert.Throws<IconException>(() => IconValidator.CheckIcon(Data("image/svg+xml", bad)));
        Assert.Equal("icon: the SVG carries scripts or links", ex.Message);
    }

    [Fact]
    public void A_local_href_is_accepted()
    {
        var svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><defs><path id=\"a\" d=\"M0 0\"/></defs><use href=\"#a\"/></svg>";
        Assert.NotNull(IconValidator.CheckIcon(Data("image/svg+xml", svg)));
    }

    [Theory]
    [InlineData("<html><svg/></html>")]
    [InlineData("hello")]
    public void An_svg_must_start_as_svg_or_xml(string bad)
    {
        var ex = Assert.Throws<IconException>(() => IconValidator.CheckIcon(Data("image/svg+xml", bad)));
        Assert.Equal("icon: not an SVG image", ex.Message);
    }

    [Fact]
    public void An_xml_prolog_is_accepted()
        => Assert.NotNull(IconValidator.CheckIcon(Data("image/svg+xml", "  <?xml version=\"1.0\"?>\n" + Svg)));

    [Fact]
    public void Raster_bytes_must_match_the_declared_type()
    {
        var jpeg = new byte[] { 0xff, 0xd8, 0xff, 0xe0, 0, 0 };
        var gif = Encoding.ASCII.GetBytes("GIF89a\0\0\0\0");
        var webp = Encoding.ASCII.GetBytes("RIFF\0\0\0\0WEBPVP8 ");
        Assert.Equal(Data("image/png", Png), IconValidator.CheckIcon(Data("image/png", Png)));
        Assert.Equal(Data("image/jpeg", jpeg), IconValidator.CheckIcon(Data("image/jpeg", jpeg)));
        Assert.Equal(Data("image/gif", gif), IconValidator.CheckIcon(Data("image/gif", gif)));
        Assert.Equal(Data("image/gif", Encoding.ASCII.GetBytes("GIF87a")), IconValidator.CheckIcon(Data("image/gif", Encoding.ASCII.GetBytes("GIF87a"))));
        Assert.Equal(Data("image/webp", webp), IconValidator.CheckIcon(Data("image/webp", webp)));
    }

    [Theory]
    [InlineData("image/png", "GIF89a....")]
    [InlineData("image/png", "<html>not a png</html>")]
    [InlineData("image/png", "<svg onload=\"alert(1)\"></svg>")]
    [InlineData("image/webp", "RIFF....WAVE")]
    [InlineData("image/webp", "RIF")]
    [InlineData("image/jpeg", "GIF89a")]
    [InlineData("text/html", "<html></html>")]
    [InlineData("image/bmp", "BM....")]
    public void Raster_bytes_that_are_not_the_declared_image_are_refused(string media, string text)
    {
        var bytes = Encoding.ASCII.GetBytes(text);
        var url = media == "text/html" ? $"data:{media};base64,{Convert.ToBase64String(bytes)}" : Data(media, bytes);
        var ex = Assert.Throws<IconException>(() => IconValidator.CheckIcon(url));
        Assert.Equal(media == "text/html" ? "icon: a base64 data: URL" : "icon: PNG, JPEG, GIF, WebP or SVG", ex.Message);
    }

    [Fact]
    public void A_url_that_is_not_a_base64_data_url_is_refused()
    {
        foreach (var bad in new[] { "https://evil.example/icon.png", "data:image/png;utf8,abc" })
        {
            var ex = Assert.Throws<IconException>(() => IconValidator.CheckIcon(bad));
            Assert.Equal("icon: a base64 data: URL", ex.Message);
        }
    }

    [Fact]
    public void Bad_base64_is_refused()
    {
        var ex = Assert.Throws<IconException>(() => IconValidator.CheckIcon("data:image/png;base64,AAAAA"));
        Assert.Equal("icon: bad base64", ex.Message);
    }

    [Fact]
    public void An_icon_over_96_KiB_is_refused()
    {
        var ex = Assert.Throws<IconException>(() => IconValidator.CheckIcon("data:image/png;base64," + new string('A', 200_000)));
        Assert.Equal("icon: too large", ex.Message);
    }

    [Theory]
    [InlineData("#ABC", "#aabbcc")]
    [InlineData("#A1b2C3", "#a1b2c3")]
    [InlineData(" #fff ", "#ffffff")]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void CheckColor_normalises(string? input, string? expected) => Assert.Equal(expected, IconValidator.CheckColor(input));

    [Theory]
    [InlineData("red")]
    [InlineData("#12345")]
    [InlineData("#ggg")]
    [InlineData("#fff;background:url(x)")]
    [InlineData("#aabbcc}body{x:y")]
    public void CheckColor_refuses_the_rest_and_css_injection(string bad)
    {
        var ex = Assert.Throws<IconException>(() => IconValidator.CheckColor(bad));
        Assert.Equal("color: #RGB or #RRGGBB", ex.Message);
    }

    [Fact]
    public void CheckLabel_collapses_whitespace_and_caps_at_120()
    {
        Assert.Equal("My big app", IconValidator.CheckLabel("  My \t big\n app  "));
        Assert.Null(IconValidator.CheckLabel("   "));
        Assert.Null(IconValidator.CheckLabel(null));
        Assert.Equal(120, IconValidator.CheckLabel(new string('a', 120))!.Length);
        var ex = Assert.Throws<IconException>(() => IconValidator.CheckLabel(new string('a', 121)));
        Assert.Equal("name: at most 120 characters", ex.Message);
    }

    [Theory]
    [InlineData("mdi:folder-star", "mdi:folder-star")]
    [InlineData(" MDI:Folder-Star ", "mdi:folder-star")]
    [InlineData("fa-brands:github", "fa-brands:github")]
    [InlineData("logos:a_b", "logos:a_b")]
    public void CheckName_accepts_iconify_names(string input, string expected) => Assert.Equal(expected, IconValidator.CheckName(input));

    [Theory]
    [InlineData("")]
    [InlineData("folder")]
    [InlineData("mdi:")]
    [InlineData("mdi:a b")]
    [InlineData("mdi:a/b")]
    [InlineData("-mdi:a")]
    [InlineData("a:b:c")]
    public void CheckName_refuses_the_rest(string bad)
    {
        var ex = Assert.Throws<IconException>(() => IconValidator.CheckName(bad));
        Assert.Equal("icon: an Iconify name like mdi:folder-star", ex.Message);
    }

    [Fact]
    public void Only_a_current_colour_svg_is_tinted()
    {
        Assert.True(IconValidator.IsTinted(Data("image/svg+xml", Svg)));
        Assert.True(IconValidator.IsTinted(Data("image/svg+xml", "<svg><path fill=\"CURRENTCOLOR\"/></svg>")));
        Assert.False(IconValidator.IsTinted(Data("image/svg+xml", "<svg><path fill=\"#000\"/></svg>")));
        Assert.False(IconValidator.IsTinted(Data("image/png", Png)));
        Assert.False(IconValidator.IsTinted("data:image/svg+xml;base64,!!!"));
        Assert.False(IconValidator.IsTinted(null));
        Assert.False(IconValidator.IsTinted(""));
    }

    [Fact]
    public void SvgDataUrl_round_trips()
        => Assert.Equal(Data("image/svg+xml", Svg), IconValidator.SvgDataUrl(Encoding.UTF8.GetBytes(Svg)));
}
