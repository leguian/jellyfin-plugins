using System.Collections.Generic;
using System.Linq;
using Jellyfin.Plugin.CustomizedHome.Helpers;
using Jellyfin.Plugin.CustomizedHome.Models;
using Xunit;

namespace Jellyfin.Plugin.CustomizedHome.Tests;

public class LayoutValidatorTests
{
    private static LayoutItem Section(string key) => new() { Type = LayoutItemTypes.Section, Key = key };

    [Fact]
    public void Null_layout_is_rejected()
    {
        Assert.Null(LayoutValidator.Normalize(null, out string? error));
        Assert.NotNull(error);
    }

    [Fact]
    public void Duplicates_and_blank_keys_are_dropped_and_order_is_kept()
    {
        HomeLayout layout = new() { Items = [Section("jf:nextup"), Section(" "), Section("jf:resume"), Section("jf:nextup")] };

        HomeLayout normalized = LayoutValidator.Normalize(layout, out _)!;

        Assert.Equal(["jf:nextup", "jf:resume"], normalized.Items.Select(item => item.Key));
    }

    [Fact]
    public void Unknown_format_values_fall_back_to_defaults_and_known_ones_are_kept()
    {
        LayoutItem item = Section("jf:resume");
        item.Shape = "HEXAGON";
        item.Size = " Large ";
        item.ShowTitle = false;
        item.ShowSectionTitle = false;

        LayoutItem normalized = LayoutValidator.Normalize(new HomeLayout { Items = [item] }, out _)!.Items.Single();

        Assert.Equal(LayoutFormats.ShapeAuto, normalized.Shape);
        Assert.Equal(LayoutFormats.SizeLarge, normalized.Size);
        Assert.False(normalized.ShowTitle);
        Assert.False(normalized.ShowSectionTitle);
    }

    [Fact]
    public void Genres_are_trimmed_deduplicated_and_capped()
    {
        LayoutItem item = Section("ch:genre");
        item.Genres = [" Action ", "action", "", "Drama"];
        item.Genres.AddRange(Enumerable.Range(0, 40).Select(index => "Genre " + index));

        List<string> genres = LayoutValidator.Normalize(new HomeLayout { Items = [item] }, out _)!.Items.Single().Genres;

        Assert.Equal(20, genres.Count);
        Assert.Equal(["Action", "Drama", "Genre 0"], genres.Take(3));
    }

    [Fact]
    public void Nested_folders_are_flattened_away_and_folder_members_are_kept()
    {
        LayoutItem folder = new() { Type = LayoutItemTypes.Folder, Id = "f1", Name = "Series", Icon = "../evil" };
        folder.Items.Add(Section("jf:nextup"));
        folder.Items.Add(new LayoutItem { Type = LayoutItemTypes.Folder, Id = "nested" });

        LayoutItem normalized = LayoutValidator.Normalize(new HomeLayout { Items = [folder] }, out _)!.Items.Single();

        Assert.Equal(["jf:nextup"], normalized.Items.Select(member => member.Key));
        Assert.Null(normalized.Icon);
    }

    [Theory]
    [InlineData("custom", "custom")]
    [InlineData(" COLORS ", "colors")]
    [InlineData("rainbow", "posters")]
    [InlineData(null, "posters")]
    public void Genre_style_is_limited_to_known_values(string? input, string expected)
    {
        LayoutItem item = Section("ch:allGenres");
        item.GenreStyle = input!;

        Assert.Equal(expected, LayoutValidator.Normalize(new HomeLayout { Items = [item] }, out _)!.Items.Single().GenreStyle);
    }

    [Fact]
    public void Hero_defaults_to_disabled_with_safe_settings()
    {
        HeroSettings hero = LayoutValidator.Normalize(new HomeLayout(), out _)!.Hero;

        Assert.False(hero.Enabled);
        Assert.Empty(hero.Sources);
        Assert.Equal(6, hero.Count);
        Assert.Equal(10, hero.IntervalSeconds);
        Assert.True(hero.ExcludePlayed);
        Assert.True(hero.RequireBackdrop);
    }

    [Fact]
    public void Hero_sources_are_filtered_deduplicated_and_ordered()
    {
        HomeLayout layout = new()
        {
            Hero = new HeroSettings { Enabled = true, Sources = ["latestShows", "<script>", " RANDOM ", "random", "recentMovies"] }
        };

        HeroSettings hero = LayoutValidator.Normalize(layout, out _)!.Hero;

        Assert.True(hero.Enabled);
        Assert.Equal(["random", "recentMovies", "latestShows"], hero.Sources);
    }

    [Fact]
    public void Hero_without_a_valid_source_cannot_be_enabled()
    {
        HomeLayout layout = new() { Hero = new HeroSettings { Enabled = true, Sources = ["nope"] } };

        Assert.False(LayoutValidator.Normalize(layout, out _)!.Hero.Enabled);
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(500, 12)]
    [InlineData(8, 8)]
    public void Hero_count_is_clamped(int input, int expected)
    {
        HomeLayout layout = new() { Hero = new HeroSettings { Count = input } };

        Assert.Equal(expected, LayoutValidator.Normalize(layout, out _)!.Hero.Count);
    }

    [Theory]
    [InlineData(-5, 0)]
    [InlineData(0, 0)]
    [InlineData(1, 3)]
    [InlineData(3, 3)]
    [InlineData(15, 15)]
    [InlineData(9999, 60)]
    public void Hero_interval_is_off_or_clamped(int input, int expected)
    {
        HomeLayout layout = new() { Hero = new HeroSettings { IntervalSeconds = input } };

        Assert.Equal(expected, LayoutValidator.Normalize(layout, out _)!.Hero.IntervalSeconds);
    }

    [Fact]
    public void Too_many_items_are_rejected()
    {
        HomeLayout layout = new() { Items = Enumerable.Range(0, 501).Select(index => Section("key:" + index)).ToList() };

        Assert.Null(LayoutValidator.Normalize(layout, out string? error));
        Assert.NotNull(error);
    }
}
