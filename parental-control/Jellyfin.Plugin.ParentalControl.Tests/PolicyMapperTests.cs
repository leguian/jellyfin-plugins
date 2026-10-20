using System;
using System.Collections.Generic;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.ParentalControl.Helpers;
using Jellyfin.Plugin.ParentalControl.Models;
using MediaBrowser.Model.Users;
using Xunit;

namespace Jellyfin.Plugin.ParentalControl.Tests;

public class PolicyMapperTests
{
    private static readonly ContentLabel Scary = new() { Id = Guid.NewGuid().ToString("N"), Name = "Scary" };

    private static ControlledProfile Profile(ContentMode mode) => new()
    {
        TagKey = "tim",
        Mode = mode,
        Hidden = [new ContentRule { Kind = RuleKind.Tag, Value = "violent" }, new ContentRule { Kind = RuleKind.Label, Value = Scary.Id }, new ContentRule { Kind = RuleKind.Item, Value = Guid.NewGuid().ToString("N") }],
        Allowed = [new ContentRule { Kind = RuleKind.Tag, Value = "kids" }]
    };

    [Fact]
    public void A_block_list_profile_blocks_its_tag_its_tags_and_its_labels_and_allows_nothing()
    {
        (List<string> blocked, List<string> allowed) = PolicyMapper.ManagedTags(Profile(ContentMode.BlockList), [Scary]);

        Assert.Equal(["pc-hidden-tim", "violent", "Scary"], blocked);
        Assert.Empty(allowed);
    }

    [Fact]
    public void An_allow_list_profile_always_allows_its_own_tag_even_with_nothing_else()
    {
        ControlledProfile profile = Profile(ContentMode.AllowList);
        profile.Allowed.Clear();

        (_, List<string> allowed) = PolicyMapper.ManagedTags(profile, [Scary]);

        // An empty allowed list would mean "everything" to Jellyfin.
        Assert.Equal(["pc-allowed-tim"], allowed);
    }

    [Fact]
    public void A_paused_profile_manages_nothing()
    {
        ControlledProfile profile = Profile(ContentMode.AllowList);
        profile.Enabled = false;

        (List<string> blocked, List<string> allowed) = PolicyMapper.ManagedTags(profile, [Scary]);

        Assert.Empty(blocked);
        Assert.Empty(allowed);
    }

    [Fact]
    public void Merging_replaces_what_the_plugin_wrote_and_keeps_the_rest()
    {
        string[] current = ["Horror", "old-label", "pc-hidden-tim", "violent"];

        string[] merged = PolicyMapper.Merge(current, ["old-label", "violent"], ["pc-hidden-tim", "pc-allowed-tim"], ["pc-hidden-tim", "Scary"]);

        Assert.Equal(["Horror", "pc-hidden-tim", "Scary"], merged);
    }

    [Fact]
    public void Merging_compares_tags_like_jellyfin()
    {
        string[] merged = PolicyMapper.Merge(["Dessins Animés"], ["dessins animes"], [], ["Dessins animés"]);

        Assert.Equal(["Dessins animés"], merged);
    }

    [Fact]
    public void Native_settings_round_trip_through_the_policy()
    {
        Guid userId = Guid.NewGuid();
        Guid library = Guid.NewGuid();
        NativeSettings native = new()
        {
            MaxParentalRating = 10,
            BlockUnratedItems = ["Movie", "Series"],
            AccessSchedules = [new ScheduleWindow { DayOfWeek = "Weekday", StartHour = 7, EndHour = 20.5 }],
            EnableAllFolders = false,
            EnabledFolders = [library],
            EnableRemoteAccess = false,
            EnableContentDownloading = false,
            EnableContentDeletion = false,
            EnableLiveTvAccess = false,
            EnableUserPreferenceAccess = false,
            EnableSyncPlay = false,
            MaxActiveSessions = 1,
            ShowOnSignInScreen = true
        };
        UserPolicy policy = new() { IsHidden = true, SyncPlayAccess = SyncPlayUserAccessType.CreateAndJoinGroups };

        PolicyMapper.WriteNative(policy, native, userId);
        NativeSettings read = PolicyMapper.ReadNative(policy);

        Assert.False(policy.IsHidden);
        Assert.Equal(SyncPlayUserAccessType.None, policy.SyncPlayAccess);
        Assert.Equal(userId, policy.AccessSchedules[0].UserId);
        Assert.Equal(System.Text.Json.JsonSerializer.Serialize(native), System.Text.Json.JsonSerializer.Serialize(read));
    }

    [Fact]
    public void Turning_syncplay_back_on_keeps_a_finer_native_level()
    {
        UserPolicy policy = new() { SyncPlayAccess = SyncPlayUserAccessType.JoinGroups };

        PolicyMapper.WriteNative(policy, new NativeSettings { EnableSyncPlay = true }, Guid.NewGuid());

        Assert.Equal(SyncPlayUserAccessType.JoinGroups, policy.SyncPlayAccess);
    }
}
