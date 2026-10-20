using System;
using Jellyfin.Plugin.ParentalControl.Helpers;
using Xunit;

namespace Jellyfin.Plugin.ParentalControl.Tests;

public class TagNamesTests
{
    [Theory]
    [InlineData("Tim", "tim")]
    [InlineData("Léa Martin", "lea-martin")]
    [InlineData("  Zoé--2 ", "zoe-2")]
    [InlineData("Ünïcödé!", "unicode")]
    public void Keys_are_ascii_slugs_of_the_user_name(string name, string expected)
    {
        Assert.Equal(expected, TagNames.MakeKey(name, Guid.NewGuid(), []));
    }

    [Fact]
    public void A_name_without_letters_falls_back_on_the_user_identifier()
    {
        Guid id = Guid.Parse("3f2a9c1b-0000-0000-0000-000000000000");

        Assert.Equal("3f2a9c1b", TagNames.MakeKey("小明", id, []));
    }

    [Fact]
    public void Keys_never_collide()
    {
        Assert.Equal("tim-2", TagNames.MakeKey("Tim", Guid.NewGuid(), ["tim"]));
        Assert.Equal("tim-3", TagNames.MakeKey("TIM", Guid.NewGuid(), ["tim", "Tim-2"]));
    }

    [Theory]
    [InlineData("pc-hidden-tim", true)]
    [InlineData("PC-anything", true)]
    [InlineData("pç-x", true)]
    [InlineData("Pour Tim", false)]
    [InlineData("pcx", false)]
    public void The_prefix_of_the_plugin_is_reserved_whatever_the_case_and_accents(string name, bool reserved)
    {
        Assert.Equal(reserved, TagNames.IsReserved(name));
    }

    [Fact]
    public void Folding_matches_the_comparison_of_jellyfin()
    {
        Assert.Equal("dessins animes", TagNames.Fold(" Dessins Animés "));
    }

    [Theory]
    [InlineData("tim", true)]
    [InlineData("lea-martin-2", true)]
    [InlineData("", false)]
    [InlineData("-tim", false)]
    [InlineData("tim ", false)]
    [InlineData("Tim", false)]
    public void Only_slug_keys_are_valid(string key, bool valid)
    {
        Assert.Equal(valid, TagNames.IsValidKey(key));
    }
}
