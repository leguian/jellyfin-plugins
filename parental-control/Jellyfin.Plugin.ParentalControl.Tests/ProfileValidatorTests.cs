using System;
using System.Collections.Generic;
using System.Linq;
using Jellyfin.Plugin.ParentalControl.Helpers;
using Jellyfin.Plugin.ParentalControl.Models;
using Xunit;

namespace Jellyfin.Plugin.ParentalControl.Tests;

public class ProfileValidatorTests
{
    private static readonly string LabelId = Guid.NewGuid().ToString("N");

    private static ControlledProfile Valid() => new()
    {
        Mode = ContentMode.AllowList,
        Hidden = [new ContentRule { Kind = RuleKind.Genre, Value = "Horror" }],
        Allowed = [new ContentRule { Kind = RuleKind.Item, Value = Guid.NewGuid().ToString() }],
        HiddenElements = ["search", "cast"],
        ScreenTime = new ScreenTimeSettings { Enabled = true, DailyLimitMinutes = [60, 30, 30, 60, 30, 30, -1], WarningMinutes = 5 }
    };

    private static ControlledProfile? Normalize(ControlledProfile? profile, out string? error) =>
        ProfileValidator.NormalizeProfile(profile, [LabelId], out error);

    [Fact]
    public void A_valid_profile_comes_back_normalized()
    {
        ControlledProfile? result = Normalize(Valid(), out string? error);

        Assert.Null(error);
        Assert.NotNull(result);
        Assert.Equal(ContentMode.AllowList, result!.Mode);
        Assert.Equal(["cast", "search"], result.HiddenElements);
        Assert.Equal(32, result.Allowed[0].Value.Length);
    }

    [Fact]
    public void Identity_and_policy_records_are_never_taken_from_the_client()
    {
        ControlledProfile sent = Valid();
        sent.UserId = Guid.NewGuid();
        sent.TagKey = "someone-else";
        sent.AppliedBlockedTags = ["injected"];
        sent.PinLength = 4;

        ControlledProfile result = Normalize(sent, out _)!;

        Assert.Equal(Guid.Empty, result.UserId);
        Assert.Equal(string.Empty, result.TagKey);
        Assert.Empty(result.AppliedBlockedTags);
        Assert.Equal(0, result.PinLength);
    }

    [Fact]
    public void Unknown_interface_elements_are_dropped()
    {
        ControlledProfile sent = Valid();
        sent.HiddenElements = ["search", "dashboard", "<script>", "search"];

        Assert.Equal(["search"], Normalize(sent, out _)!.HiddenElements);
    }

    [Fact]
    public void Duplicate_rules_are_merged_whatever_the_case_of_names_and_the_format_of_ids()
    {
        Guid id = Guid.NewGuid();
        ControlledProfile sent = Valid();
        sent.Hidden =
        [
            new ContentRule { Kind = RuleKind.Item, Value = id.ToString("D") },
            new ContentRule { Kind = RuleKind.Item, Value = id.ToString("N").ToUpperInvariant() },
            new ContentRule { Kind = RuleKind.Tag, Value = "Violent" },
            new ContentRule { Kind = RuleKind.Tag, Value = " violent " }
        ];

        Assert.Equal(2, Normalize(sent, out _)!.Hidden.Count);
    }

    [Fact]
    public void Rules_on_deleted_labels_are_dropped_silently()
    {
        ControlledProfile sent = Valid();
        sent.Hidden = [new ContentRule { Kind = RuleKind.Label, Value = LabelId }, new ContentRule { Kind = RuleKind.Label, Value = Guid.NewGuid().ToString("N") }];

        ControlledProfile result = Normalize(sent, out _)!;

        Assert.Single(result.Hidden);
        Assert.Equal(LabelId, result.Hidden[0].Value);
    }

    [Theory]
    [InlineData(RuleKind.Item, "not-a-guid")]
    [InlineData(RuleKind.Collection, "00000000-0000-0000-0000-000000000000")]
    [InlineData(RuleKind.Genre, "   ")]
    [InlineData(RuleKind.Tag, "bell\u0007")]
    [InlineData((RuleKind)42, "x")]
    public void Malformed_rules_are_refused(RuleKind kind, string value)
    {
        ControlledProfile sent = Valid();
        sent.Hidden = [new ContentRule { Kind = kind, Value = value }];

        Assert.Null(Normalize(sent, out string? error));
        Assert.NotNull(error);
    }

    [Fact]
    public void Lists_have_a_size_limit()
    {
        ControlledProfile sent = Valid();
        sent.Hidden = Enumerable.Range(0, ProfileValidator.MaxRules + 1).Select(_ => new ContentRule { Kind = RuleKind.Item, Value = Guid.NewGuid().ToString() }).ToList();

        Assert.Null(Normalize(sent, out _));
    }

    [Theory]
    [InlineData(new[] { 60, 60, 60, 60, 60, 60 })]
    [InlineData(new[] { 60, 60, 60, 60, 60, 60, 60, 60 })]
    [InlineData(new[] { 60, 60, 60, -2, 60, 60, 60 })]
    [InlineData(new[] { 60, 60, 60, 1441, 60, 60, 60 })]
    public void Daily_limits_must_list_seven_days_in_range(int[] limits)
    {
        ControlledProfile sent = Valid();
        sent.ScreenTime.DailyLimitMinutes = limits;

        Assert.Null(Normalize(sent, out _));
    }

    [Fact]
    public void The_warning_is_clamped()
    {
        ControlledProfile sent = Valid();
        sent.ScreenTime.WarningMinutes = 500;

        Assert.Equal(ProfileValidator.MaxWarningMinutes, Normalize(sent, out _)!.ScreenTime.WarningMinutes);
    }

    [Fact]
    public void Native_schedules_are_rounded_to_half_hours_and_ordered()
    {
        NativeSettings native = new()
        {
            AccessSchedules =
            [
                new ScheduleWindow { DayOfWeek = "weekend", StartHour = 8.2, EndHour = 20.4 },
                new ScheduleWindow { DayOfWeek = "Monday", StartHour = 7, EndHour = 8 }
            ]
        };

        NativeSettings result = ProfileValidator.NormalizeNative(native, out string? error)!;

        Assert.Null(error);
        Assert.Equal("Monday", result.AccessSchedules[0].DayOfWeek);
        Assert.Equal("Weekend", result.AccessSchedules[1].DayOfWeek);
        Assert.Equal(8, result.AccessSchedules[1].StartHour);
        Assert.Equal(20.5, result.AccessSchedules[1].EndHour);
    }

    [Theory]
    [InlineData("Funday", 7, 8)]
    [InlineData("Monday", 9, 8)]
    [InlineData("Monday", -1, 8)]
    [InlineData("Monday", 7, 25)]
    [InlineData("Monday", 7, 7)]
    public void Invalid_windows_are_refused(string day, double start, double end)
    {
        NativeSettings native = new() { AccessSchedules = [new ScheduleWindow { DayOfWeek = day, StartHour = start, EndHour = end }] };

        Assert.Null(ProfileValidator.NormalizeNative(native, out _));
    }

    [Fact]
    public void Native_lists_are_cleaned()
    {
        Guid library = Guid.NewGuid();
        NativeSettings native = new()
        {
            BlockUnratedItems = ["movie", "Movie", "Spaceship"],
            EnableAllFolders = false,
            EnabledFolders = [library, library, Guid.Empty],
            MaxActiveSessions = 999,
            MaxParentalRating = null,
            MaxParentalSubRating = 3
        };

        NativeSettings result = ProfileValidator.NormalizeNative(native, out _)!;

        Assert.Equal(["Movie"], result.BlockUnratedItems);
        Assert.Equal([library], result.EnabledFolders);
        Assert.Equal(0, result.MaxActiveSessions);
        Assert.Null(result.MaxParentalSubRating);
    }

    [Fact]
    public void All_libraries_clears_the_list()
    {
        NativeSettings result = ProfileValidator.NormalizeNative(new NativeSettings { EnableAllFolders = true, EnabledFolders = [Guid.NewGuid()] }, out _)!;

        Assert.Empty(result.EnabledFolders);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("pc-hidden-tim")]
    [InlineData("PC-Mine")]
    [InlineData("a|b")]
    [InlineData("1234567890123456789012345678901234567890123456789012345678901")]
    public void Bad_label_names_are_refused(string name)
    {
        Assert.Null(ProfileValidator.NormalizeLabel(new ContentLabel { Name = name }, [], out string? error));
        Assert.NotNull(error);
    }

    [Fact]
    public void Label_names_are_unique_like_jellyfin_compares_tags()
    {
        Assert.Null(ProfileValidator.NormalizeLabel(new ContentLabel { Name = "Dessins Animés" }, ["dessins animes"], out _));
    }

    [Fact]
    public void Labels_accept_only_items_collections_and_genres()
    {
        ContentLabel label = new() { Name = "Pour Tim", Targets = [new ContentRule { Kind = RuleKind.Tag, Value = "x" }] };

        Assert.Null(ProfileValidator.NormalizeLabel(label, [], out _));
    }

    [Fact]
    public void A_bad_colour_falls_back_on_the_accent()
    {
        ContentLabel result = ProfileValidator.NormalizeLabel(new ContentLabel { Name = "  Pour   Tim ", Color = "red;background:url(x)" }, [], out _)!;

        Assert.Equal("Pour Tim", result.Name);
        Assert.Equal("#00a4dc", result.Color);
    }
}
