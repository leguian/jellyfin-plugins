using System;
using System.IO;
using System.Linq;
using Jellyfin.Plugin.CustomizedHome.Models;
using Jellyfin.Plugin.CustomizedHome.Services;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Jellyfin.Plugin.CustomizedHome.Tests;

public sealed class LayoutStoreTests : IDisposable
{
    // What version 1.0 of the plugin wrote: no hero, no display format, folders.
    private const string FirstVersionLayout = """
        {
          "Version": 1,
          "HideUnlisted": true,
          "Items": [
            { "Type": "section", "Key": "jf:resume", "Label": "Continue Watching", "Visible": true },
            {
              "Type": "folder", "Id": "f1", "Name": "Series", "Icon": "tv", "Visible": true, "Collapsed": true,
              "Items": [
                { "Type": "section", "Key": "jf:nextup", "Label": "Next Up", "Visible": false },
                { "Type": "section", "Key": "hss:LatestShows", "Visible": true }
              ]
            }
          ]
        }
        """;

    private static readonly Guid Alice = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly Guid Bob = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000002");

    private readonly string _root = Path.Combine(Path.GetTempPath(), "ch-tests-" + Guid.NewGuid().ToString("N"));

    private string UsersDirectory => Path.Combine(_root, "Jellyfin.Plugin.CustomizedHome", "users");

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    private LayoutStore CreateStore()
    {
        Mock<IApplicationPaths> paths = new();
        paths.SetupGet(p => p.PluginConfigurationsPath).Returns(_root);
        return new LayoutStore(paths.Object, NullLogger<LayoutStore>.Instance);
    }

    private string FileOf(Guid userId)
    {
        return Path.Combine(UsersDirectory, userId.ToString("N") + ".json");
    }

    private string WriteFile(string name, string contents)
    {
        Directory.CreateDirectory(UsersDirectory);
        string path = Path.Combine(UsersDirectory, name);
        File.WriteAllText(path, contents);
        return path;
    }

    private static HomeLayout SampleLayout()
    {
        return new HomeLayout
        {
            HideUnlisted = true,
            Hero = new HeroSettings { Enabled = true, Sources = ["random"], Count = 4, IntervalSeconds = 0 },
            Items =
            [
                new LayoutItem { Key = "jf:resume", Label = "Reprendre", Shape = LayoutFormats.ShapeLandscape, ShowTitle = false },
                new LayoutItem
                {
                    Type = LayoutItemTypes.Folder,
                    Id = "f1",
                    Name = "Séries",
                    Items = [new LayoutItem { Key = "jf:nextup", Visible = false }, new LayoutItem { Key = "ch:genre", Genres = ["Drama", "Comedy"] }]
                }
            ]
        };
    }

    [Fact]
    public void A_user_without_a_layout_has_none_and_nothing_is_written()
    {
        LayoutStore store = CreateStore();

        Assert.Null(store.Get(Alice));
        Assert.False(store.Delete(Alice));
        Assert.Empty(store.List());
        Assert.False(Directory.Exists(UsersDirectory));
    }

    [Fact]
    public void A_saved_layout_is_read_back_by_another_instance_and_belongs_to_its_user_only()
    {
        CreateStore().Save(Alice, SampleLayout());

        LayoutStore restarted = CreateStore();
        HomeLayout layout = restarted.Get(Alice)!;

        Assert.True(layout.HideUnlisted);
        Assert.True(layout.Hero.Enabled);
        Assert.Equal(["random"], layout.Hero.Sources);
        Assert.Equal(4, layout.Hero.Count);
        Assert.Equal(0, layout.Hero.IntervalSeconds);
        Assert.Equal(["jf:resume", null], layout.Items.Select(item => item.Key));
        Assert.Equal("Reprendre", layout.Items[0].Label);
        Assert.Equal(LayoutFormats.ShapeLandscape, layout.Items[0].Shape);
        Assert.False(layout.Items[0].ShowTitle);
        Assert.Equal("Séries", layout.Items[1].Name);
        Assert.Equal(["jf:nextup", "ch:genre"], layout.Items[1].Items.Select(item => item.Key));
        Assert.False(layout.Items[1].Items[0].Visible);
        Assert.Equal(["Drama", "Comedy"], layout.Items[1].Items[1].Genres);

        Assert.Null(restarted.Get(Bob));
        Assert.Equal([FileOf(Alice)], Directory.GetFiles(_root, "*", SearchOption.AllDirectories));
    }

    [Fact]
    public void Saving_again_replaces_the_layout_for_the_running_instance_and_on_disk()
    {
        LayoutStore store = CreateStore();
        store.Save(Alice, SampleLayout());
        Assert.Equal(2, store.Get(Alice)!.Items.Count);

        store.Save(Alice, new HomeLayout { Items = [new LayoutItem { Key = "jf:latestmedia" }] });

        Assert.Equal(["jf:latestmedia"], store.Get(Alice)!.Items.Select(item => item.Key));
        Assert.Equal(["jf:latestmedia"], CreateStore().Get(Alice)!.Items.Select(item => item.Key));
        Assert.Equal([FileOf(Alice)], Directory.GetFiles(UsersDirectory));
    }

    [Theory]
    [InlineData("{ \"Version\": 1, \"Items\": [ { \"Key\": \"jf:res")]
    [InlineData("not json at all")]
    [InlineData("")]
    public void A_corrupt_file_means_no_layout_and_the_next_save_recovers(string contents)
    {
        WriteFile(Alice.ToString("N") + ".json", contents);
        LayoutStore store = CreateStore();

        Assert.Null(store.Get(Alice));
        Assert.Empty(store.List());

        store.Save(Alice, SampleLayout());

        Assert.NotNull(store.Get(Alice));
        Assert.Equal(2, CreateStore().Get(Alice)!.Items.Count);
        Assert.Single(store.List());
    }

    [Fact]
    public void Delete_removes_the_file_and_what_the_instance_remembered()
    {
        LayoutStore store = CreateStore();
        store.Save(Alice, SampleLayout());
        store.Save(Bob, SampleLayout());
        Assert.NotNull(store.Get(Alice));

        Assert.True(store.Delete(Alice));

        Assert.Null(store.Get(Alice));
        Assert.False(File.Exists(FileOf(Alice)));
        Assert.False(store.Delete(Alice));
        Assert.NotNull(store.Get(Bob));
        Assert.Equal([Bob], store.List().Select(info => info.UserId));
    }

    [Fact]
    public void A_layout_deleted_then_saved_again_is_back()
    {
        LayoutStore store = CreateStore();
        store.Save(Alice, SampleLayout());
        store.Delete(Alice);

        store.Save(Alice, SampleLayout());

        Assert.NotNull(store.Get(Alice));
        Assert.True(File.Exists(FileOf(Alice)));
    }

    [Fact]
    public void List_counts_sections_and_folders_and_ignores_foreign_and_corrupt_files()
    {
        LayoutStore store = CreateStore();
        store.Save(Alice, SampleLayout());
        DateTime written = File.GetLastWriteTimeUtc(FileOf(Alice));
        WriteFile("notes.json", "{ \"Items\": [] }");
        WriteFile("readme.txt", "hello");
        WriteFile(Guid.NewGuid().ToString("N") + ".json.tmp", "{ \"Items\": [] }");
        WriteFile(Bob.ToString("N") + ".json", "{ \"Items\": [ ");

        StoredLayoutInfo info = Assert.Single(store.List());

        Assert.Equal(Alice, info.UserId);
        Assert.Equal(3, info.SectionCount);
        Assert.Equal(1, info.FolderCount);
        Assert.Equal(written, info.ModifiedUtc);
        Assert.Null(info.UserName);
    }

    [Fact]
    public void A_layout_written_by_the_first_version_loads_with_todays_defaults()
    {
        WriteFile(Alice.ToString("N") + ".json", FirstVersionLayout);
        LayoutStore store = CreateStore();

        HomeLayout layout = store.Get(Alice)!;

        Assert.True(layout.HideUnlisted);
        Assert.False(layout.Hero.Enabled);
        Assert.Empty(layout.Hero.Sources);
        Assert.Equal(HeroLimits.DefaultCount, layout.Hero.Count);
        Assert.Equal(HeroLimits.DefaultIntervalSeconds, layout.Hero.IntervalSeconds);

        LayoutItem section = layout.Items[0];
        Assert.Equal("jf:resume", section.Key);
        Assert.Equal("Continue Watching", section.Label);
        Assert.Equal(LayoutFormats.ShapeAuto, section.Shape);
        Assert.Equal(LayoutFormats.SizeNormal, section.Size);
        Assert.True(section.ShowTitle);
        Assert.True(section.ShowSectionTitle);
        Assert.Empty(section.Genres);
        Assert.Equal(LayoutFormats.GenreStylePosters, section.GenreStyle);

        LayoutItem folder = layout.Items[1];
        Assert.Equal(LayoutItemTypes.Folder, folder.Type);
        Assert.Equal("f1", folder.Id);
        Assert.Equal("Series", folder.Name);
        Assert.Equal("tv", folder.Icon);
        Assert.True(folder.Collapsed);
        Assert.Equal(["jf:nextup", "hss:LatestShows"], folder.Items.Select(item => item.Key));
        Assert.False(folder.Items[0].Visible);

        StoredLayoutInfo info = Assert.Single(store.List());
        Assert.Equal(3, info.SectionCount);
        Assert.Equal(1, info.FolderCount);
    }

    [Fact]
    public void Property_names_are_read_whatever_their_case()
    {
        WriteFile(Alice.ToString("N") + ".json", "{ \"hideUnlisted\": true, \"items\": [ { \"key\": \"jf:resume\", \"visible\": false } ] }");

        HomeLayout layout = CreateStore().Get(Alice)!;

        Assert.True(layout.HideUnlisted);
        Assert.Equal("jf:resume", Assert.Single(layout.Items).Key);
        Assert.False(layout.Items[0].Visible);
    }
}
