using System;
using System.Collections.Generic;
using System.Linq;
using Jellyfin.Plugin.ParentalControl.Configuration;
using Jellyfin.Plugin.ParentalControl.Models;
using Jellyfin.Plugin.ParentalControl.Services;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Jellyfin.Plugin.ParentalControl.Tests;

public class TagSyncTests
{
    private static readonly Guid A = Guid.NewGuid();
    private static readonly Guid B = Guid.NewGuid();
    private static readonly Guid C = Guid.NewGuid();
    private static readonly Guid Gone = Guid.NewGuid();

    private static Dictionary<string, HashSet<Guid>> Map(params (string Tag, Guid[] Ids)[] entries)
    {
        return entries.ToDictionary(entry => entry.Tag, entry => entry.Ids.ToHashSet(), StringComparer.Ordinal);
    }

    private static Func<Guid, string[]?> Library(Dictionary<Guid, string[]> items)
    {
        return id => items.TryGetValue(id, out string[]? tags) ? tags : null;
    }

    [Fact]
    public void Missing_tags_are_added_and_recorded()
    {
        Dictionary<Guid, string[]> items = new() { [A] = ["kids"], [B] = [] };

        var changes = Services.TagSyncService.Plan(Map(("pc-hidden-tim", [A, B])), Map(), Library(items), out var applied);

        Assert.Equal(["kids", "pc-hidden-tim"], changes[A]);
        Assert.Equal(["pc-hidden-tim"], changes[B]);
        Assert.Equal([A, B], applied["pc-hidden-tim"].OrderBy(id => id == B));
    }

    [Fact]
    public void A_tag_that_was_already_there_is_never_recorded_nor_removed()
    {
        // "Dessins animés" came with the metadata of A before the label existed.
        Dictionary<Guid, string[]> items = new() { [A] = ["Dessins Animés"], [B] = [] };

        var changes = Services.TagSyncService.Plan(Map(("Dessins animés", [A, B])), Map(), Library(items), out var applied);
        Assert.False(changes.ContainsKey(A));
        Assert.Equal([B], applied["Dessins animés"]);

        // The label stops covering A and B: only B loses the tag.
        var removal = Services.TagSyncService.Plan(Map(("Dessins animés", [])), applied, Library(new() { [A] = ["Dessins Animés"], [B] = ["Dessins animés"] }), out var after);
        Assert.False(removal.ContainsKey(A));
        Assert.Empty(removal[B]);
        Assert.Empty(after["Dessins animés"]);
    }

    [Fact]
    public void A_tag_dropped_by_a_metadata_refresh_is_written_again()
    {
        var changes = Services.TagSyncService.Plan(Map(("pc-hidden-tim", [A])), Map(("pc-hidden-tim", [A])), Library(new() { [A] = ["drama"] }), out var applied);

        Assert.Equal(["drama", "pc-hidden-tim"], changes[A]);
        Assert.Equal([A], applied["pc-hidden-tim"]);
    }

    [Fact]
    public void A_deleted_label_is_removed_from_the_items_it_was_written_on()
    {
        var changes = Services.TagSyncService.Plan(Map(), Map(("Old", [A, Gone])), Library(new() { [A] = ["Old", "drama"] }), out var applied);

        Assert.Equal(["drama"], changes[A]);
        Assert.Empty(applied["Old"]);
    }

    [Fact]
    public void Items_gone_from_the_library_are_skipped()
    {
        var changes = Services.TagSyncService.Plan(Map(("pc-hidden-tim", [Gone])), Map(), Library(new()), out var applied);

        Assert.Empty(changes);
        Assert.Empty(applied["pc-hidden-tim"]);
    }

    [Fact]
    public void Nothing_changes_when_everything_is_in_place()
    {
        var changes = Services.TagSyncService.Plan(Map(("x", [A]), ("y", [A, C])), Map(("x", [A]), ("y", [A, C])), Library(new() { [A] = ["x", "y"], [C] = ["y"] }), out _);

        Assert.Empty(changes);
    }

    [Fact]
    public void Several_tags_on_one_item_end_in_one_change()
    {
        var changes = Services.TagSyncService.Plan(Map(("x", [A]), ("y", [A])), Map(("z", [A])), Library(new() { [A] = ["z"] }), out _);

        Assert.Single(changes);
        Assert.Equal(["x", "y"], changes[A]);
    }

    [Fact]
    public void Desired_tags_follow_labels_and_enabled_profiles_only()
    {
        Guid item = Guid.NewGuid();
        Mock<ContentExpander> expander = new(Mock.Of<ILibraryManager>());
        expander.Setup(e => e.Expand(It.IsAny<ContentRule>(), It.IsAny<HashSet<Guid>>()))
            .Callback<ContentRule, HashSet<Guid>>((rule, into) =>
            {
                if (rule.Kind is RuleKind.Item or RuleKind.Collection or RuleKind.Genre)
                {
                    into.Add(item);
                }
            });
        using TempFolder folder = new();
        PluginConfiguration config = new()
        {
            Labels = [new ContentLabel { Id = "l1", Name = "Pour Tim", Targets = [new ContentRule { Kind = RuleKind.Genre, Value = "Animation" }] }],
            Profiles =
            [
                new ControlledProfile { UserId = Guid.NewGuid(), TagKey = "tim", Mode = ContentMode.AllowList, Allowed = [new ContentRule { Kind = RuleKind.Item, Value = item.ToString("N") }] },
                new ControlledProfile { UserId = Guid.NewGuid(), TagKey = "will", Enabled = false, Hidden = [new ContentRule { Kind = RuleKind.Item, Value = item.ToString("N") }] },
                new ControlledProfile { UserId = Guid.NewGuid(), TagKey = "BAD KEY" }
            ]
        };
        using TagSyncService service = new(Mock.Of<ILibraryManager>(), expander.Object, new TagStateStore(folder.File("tags.json"), NullLogger<TagStateStore>.Instance), new MemoryConfiguration(config).Source, NullLogger<TagSyncService>.Instance);

        Dictionary<string, HashSet<Guid>> desired = service.ComputeDesired(config);

        Assert.Equal(["Pour Tim", "pc-allowed-tim", "pc-hidden-tim"], desired.Keys.OrderBy(key => key, StringComparer.Ordinal));
        Assert.Equal([item], desired["pc-allowed-tim"]);
        Assert.Empty(desired["pc-hidden-tim"]);
    }
}
