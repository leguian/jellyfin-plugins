using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Jellyfin.Plugin.CustomizedHome.Api;
using Jellyfin.Plugin.CustomizedHome.Helpers;
using Jellyfin.Plugin.CustomizedHome.Models;
using Microsoft.AspNetCore.Mvc;
using Xunit;

namespace Jellyfin.Plugin.CustomizedHome.Tests;

/// <summary>
/// The default layout is written by an administrator who sees every library: what is sent to another user
/// must not reveal the libraries that user cannot access.
/// </summary>
public class DefaultLayoutFilterTests
{
    private static readonly Guid Movies = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Adult = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static LayoutItem Section(string key, string? label = null)
    {
        return new LayoutItem { Type = LayoutItemTypes.Section, Key = key, Label = label, Visible = true };
    }

    private static string Latest(Guid view)
    {
        return DefaultLayoutFilter.LatestMediaPrefix + view.ToString("N");
    }

    private static HomeLayout DefaultLayout()
    {
        return new HomeLayout
        {
            HideUnlisted = true,
            Hero = new HeroSettings { Enabled = true, Sources = ["recentMovies"] },
            Items =
            [
                Section("jf:resume", "Continue Watching"),
                Section(Latest(Movies), "Recently Added in Movies"),
                Section(Latest(Adult), "Recently Added in Private"),
                new LayoutItem
                {
                    Type = LayoutItemTypes.Folder,
                    Id = "folder-1",
                    Name = "More",
                    Items = [Section(Latest(Adult).ToUpperInvariant(), "Recently Added in Private"), Section("jf:nextup", "Next Up")]
                }
            ]
        };
    }

    [Fact]
    public void Libraries_the_user_cannot_access_are_removed_everywhere_and_no_library_name_is_sent()
    {
        HomeLayout result = DefaultLayoutFilter.ForUser(DefaultLayout(), new HashSet<Guid> { Movies });

        Assert.Equal(["jf:resume", Latest(Movies)], result.Items.Where(item => item.Type == LayoutItemTypes.Section).Select(item => item.Key));
        LayoutItem folder = Assert.Single(result.Items, item => item.Type == LayoutItemTypes.Folder);
        Assert.Equal(["jf:nextup"], folder.Items.Select(item => item.Key));

        // Even for a library the user can see, the name comes from their own views on the client.
        Assert.Null(result.Items.Single(item => item.Key == Latest(Movies)).Label);
        Assert.Equal("Continue Watching", result.Items.Single(item => item.Key == "jf:resume").Label);
        Assert.DoesNotContain("Private", System.Text.Json.JsonSerializer.Serialize(result), StringComparison.Ordinal);
    }

    [Fact]
    public void Everything_else_is_kept_and_the_stored_layout_is_left_untouched()
    {
        HomeLayout source = DefaultLayout();

        HomeLayout result = DefaultLayoutFilter.ForUser(source, new HashSet<Guid> { Movies, Adult });

        Assert.True(result.HideUnlisted);
        Assert.True(result.Hero.Enabled);
        Assert.Equal(["recentMovies"], result.Hero.Sources);
        Assert.Equal(4, result.Items.Count);
        Assert.NotSame(source.Items[0], result.Items[0]);
        Assert.Equal("Recently Added in Private", source.Items[2].Label);
        Assert.Equal(4, source.Items.Count);
    }

    [Fact]
    public void A_user_without_any_view_or_an_unreadable_identifier_gets_no_library_section()
    {
        HomeLayout layout = new() { Items = [Section("jf:latestmedia:not-a-guid", "Secret"), Section(Latest(Movies), "Movies"), Section("jf:resume")] };

        HomeLayout result = DefaultLayoutFilter.ForUser(layout, new HashSet<Guid>());

        Assert.Equal(["jf:resume"], result.Items.Select(item => item.Key));
    }

    [Theory]
    [InlineData(nameof(CustomizedHomeController.SaveLayout))]
    [InlineData(nameof(CustomizedHomeController.SaveDefaultLayout))]
    public void Layout_uploads_are_size_limited_before_they_are_deserialized(string action)
    {
        MethodInfo method = typeof(CustomizedHomeController).GetMethod(action)!;

        Assert.NotNull(method.GetCustomAttribute<RequestSizeLimitAttribute>());
    }
}
