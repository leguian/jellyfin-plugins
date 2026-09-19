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

    private LayoutStore CreateStore(Func<string, Stream>? openRead = null)
    {
        Mock<IApplicationPaths> paths = new();
        paths.SetupGet(p => p.PluginConfigurationsPath).Returns(_root);
        return openRead is null
            ? new LayoutStore(paths.Object, NullLogger<LayoutStore>.Instance)
            : new LayoutStore(paths.Object, NullLogger<LayoutStore>.Instance, openRead);
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
    public void A_deletion_that_fails_leaves_the_layout_in_place_for_the_running_instance_too()
    {
        LayoutStore store = CreateStore();
        store.Save(Alice, SampleLayout());
        Assert.NotNull(store.Get(Alice));
        bool deleted;

        using (new FileStream(FileOf(Alice), FileMode.Open, FileAccess.Read, FileShare.None))
        {
            // Windows refuses to delete an open file, Linux does not mind: only Windows exercises the failure.
            try
            {
                store.Delete(Alice);
                deleted = true;
            }
            catch (IOException)
            {
                deleted = false;
            }
        }

        // Never "no layout" for the running instance while the file waits for the next restart.
        Assert.Equal(deleted, !File.Exists(FileOf(Alice)));
        Assert.Equal(deleted, store.Get(Alice) is null);
        Assert.Equal(deleted, CreateStore().Get(Alice) is null);
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
    public void Layouts_of_users_that_no_longer_exist_are_not_listed_nor_even_read()
    {
        CreateStore().Save(Alice, SampleLayout());
        CreateStore().Save(Bob, SampleLayout());
        int reads = 0;
        LayoutStore store = CreateStore(path =>
        {
            reads++;
            return File.OpenRead(path);
        });

        StoredLayoutInfo info = Assert.Single(store.List(userId => userId == Bob));

        Assert.Equal(Bob, info.UserId);
        Assert.Equal(1, reads);

        // The file is not touched: deleting is left to the "user deleted" event and to the administrator.
        Assert.True(File.Exists(FileOf(Alice)));
        Assert.Equal(2, store.List().Count);
        Assert.Throws<ArgumentNullException>(() => store.List(null!));
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
    public void A_file_edited_by_hand_with_null_lists_loads_and_is_listed()
    {
        WriteFile(
            Alice.ToString("N") + ".json",
            """{ "Hero": { "Enabled": true, "Sources": null }, "Items": [ null, { "Type": "folder", "Id": "f1", "Items": null }, { "Key": "jf:resume", "Genres": null } ] }""");
        WriteFile(Bob.ToString("N") + ".json", """{ "Hero": null, "Items": null }""");
        LayoutStore store = CreateStore();

        HomeLayout alice = store.Get(Alice)!;
        Assert.Equal(2, alice.Items.Count);
        Assert.Empty(alice.Items[0].Items);
        Assert.Empty(alice.Items[1].Genres);
        Assert.False(alice.Hero.Enabled);
        Assert.Empty(alice.Hero.Sources);

        HomeLayout bob = store.Get(Bob)!;
        Assert.Empty(bob.Items);
        Assert.False(bob.Hero.Enabled);

        Assert.Equal([(1, 1), (0, 0)], store.List().OrderBy(info => info.UserId).Select(info => (info.SectionCount, info.FolderCount)));
    }

    [Fact]
    public void What_is_read_from_a_file_is_normalized_like_what_a_client_sends()
    {
        WriteFile(
            Alice.ToString("N") + ".json",
            """{ "Hero": { "Count": 900 }, "Items": [ { "Key": "jf:resume", "Shape": "HEXAGON" }, { "Key": "jf:resume" }, { "Key": "  " } ] }""");

        HomeLayout layout = CreateStore().Get(Alice)!;

        LayoutItem section = Assert.Single(layout.Items);
        Assert.Equal(LayoutFormats.ShapeAuto, section.Shape);
        Assert.Equal(HeroLimits.MaxCount, layout.Hero.Count);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void A_file_that_holds_no_valid_layout_means_no_layout(bool tooManyItems)
    {
        string contents = tooManyItems
            ? "{ \"Items\": [ " + string.Join(", ", Enumerable.Range(0, 501).Select(index => "{ \"Key\": \"key:" + index + "\" }")) + " ] }"
            : "null";
        WriteFile(Alice.ToString("N") + ".json", contents);
        LayoutStore store = CreateStore();

        Assert.Null(store.Get(Alice));
        Assert.Empty(store.List());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void A_read_that_fails_is_not_remembered_as_no_layout(bool accessDenied)
    {
        CreateStore().Save(Alice, SampleLayout());
        bool failing = true;
        int attempts = 0;
        LayoutStore store = CreateStore(path =>
        {
            attempts++;
            if (!failing)
            {
                return File.OpenRead(path);
            }

            throw accessDenied ? new UnauthorizedAccessException("Access to the path is denied.") : new IOException("The file is used by another process.");
        });

        // While the file cannot be read the user has no layout and the administrator sees none, without an error.
        Assert.Null(store.Get(Alice));
        Assert.Empty(store.List());
        Assert.Equal(2, attempts);

        failing = false;

        Assert.Equal(2, store.Get(Alice)!.Items.Count);
        Assert.Single(store.List());

        // Read once: from now on the layout comes from memory.
        Assert.Equal(3, attempts);
    }

    [Fact]
    public void A_file_locked_by_another_program_is_read_once_it_is_released()
    {
        CreateStore().Save(Alice, SampleLayout());
        LayoutStore store = CreateStore();

        using (new FileStream(FileOf(Alice), FileMode.Open, FileAccess.ReadWrite, FileShare.None))
        {
            Assert.Null(store.Get(Alice));
        }

        Assert.NotNull(store.Get(Alice));
    }

    [Fact]
    public void A_missing_or_corrupt_file_is_remembered_so_the_disk_is_not_read_on_every_request()
    {
        WriteFile(Bob.ToString("N") + ".json", "{ broken");
        int attempts = 0;
        LayoutStore store = CreateStore(path =>
        {
            attempts++;
            return File.OpenRead(path);
        });

        Assert.Null(store.Get(Bob));
        Assert.Null(store.Get(Bob));
        Assert.Null(store.Get(Alice));

        Assert.Equal(1, attempts);
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
