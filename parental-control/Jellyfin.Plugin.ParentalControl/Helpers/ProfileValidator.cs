using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using Jellyfin.Plugin.ParentalControl.Models;

namespace Jellyfin.Plugin.ParentalControl.Helpers;

/// <summary>
/// Validates and normalizes what a client sends: profiles, native settings and labels. Nothing reaches the
/// configuration or the user policy without going through here.
/// </summary>
public static partial class ProfileValidator
{
    /// <summary>
    /// Most entries in a hidden or allowed list.
    /// </summary>
    public const int MaxRules = 500;

    /// <summary>
    /// Most labels.
    /// </summary>
    public const int MaxLabels = 100;

    /// <summary>
    /// Most targets of one label.
    /// </summary>
    public const int MaxLabelTargets = 2000;

    /// <summary>
    /// Longest label name.
    /// </summary>
    public const int MaxLabelNameLength = 60;

    /// <summary>
    /// Longest rule value or display name.
    /// </summary>
    public const int MaxNameLength = 200;

    /// <summary>
    /// Most windows of an access schedule.
    /// </summary>
    public const int MaxScheduleWindows = 70;

    /// <summary>
    /// Longest daily limit (a whole day).
    /// </summary>
    public const int MaxDailyMinutes = 24 * 60;

    /// <summary>
    /// Longest warning before the end of the screen time.
    /// </summary>
    public const int MaxWarningMinutes = 60;

    /// <summary>
    /// Most simultaneous sessions that can be set (higher: no limit).
    /// </summary>
    public const int MaxSessions = 50;

    /// <summary>
    /// The day values of a schedule window.
    /// </summary>
    public static readonly IReadOnlyList<string> ScheduleDays =
        ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Everyday", "Weekday", "Weekend"];

    /// <summary>
    /// The kinds of unrated items Jellyfin can block (UnratedItem).
    /// </summary>
    public static readonly IReadOnlyList<string> UnratedKinds =
        ["Movie", "Trailer", "Series", "Music", "Book", "LiveTvChannel", "LiveTvProgram", "ChannelContent", "Other"];

    private const int DaysPerWeek = 7;
    private const double HourStep = 0.5;
    private const double HoursPerDay = 24;

    private static readonly RuleKind[] ProfileKinds = [RuleKind.Item, RuleKind.Collection, RuleKind.Genre, RuleKind.Tag, RuleKind.Label];
    private static readonly RuleKind[] LabelKinds = [RuleKind.Item, RuleKind.Collection, RuleKind.Genre];

    /// <summary>
    /// Normalizes the settings of a profile sent by a client. The identity of the profile (user, tag key) and what
    /// the plugin wrote into the policy are not taken from the client: the caller sets them.
    /// </summary>
    /// <param name="input">The profile sent.</param>
    /// <param name="labelIds">The identifiers of the existing labels.</param>
    /// <param name="error">The reason of a refusal.</param>
    /// <returns>The normalized profile, or <c>null</c> when it is refused.</returns>
    public static ControlledProfile? NormalizeProfile(ControlledProfile? input, IReadOnlyCollection<string> labelIds, out string? error)
    {
        ArgumentNullException.ThrowIfNull(labelIds);
        if (input is null)
        {
            error = "A profile is required.";
            return null;
        }

        if (!Enum.IsDefined(input.Mode))
        {
            error = "Unknown content mode.";
            return null;
        }

        List<ContentRule>? hidden = NormalizeRules(input.Hidden, ProfileKinds, MaxRules, out error);
        if (hidden is null)
        {
            return null;
        }

        List<ContentRule>? allowed = NormalizeRules(input.Allowed, ProfileKinds, MaxRules, out error);
        if (allowed is null)
        {
            return null;
        }

        // A label deleted meanwhile has nothing left to hide or allow.
        hidden.RemoveAll(rule => rule.Kind == RuleKind.Label && !labelIds.Contains(rule.Value));
        allowed.RemoveAll(rule => rule.Kind == RuleKind.Label && !labelIds.Contains(rule.Value));

        ScreenTimeSettings? screenTime = NormalizeScreenTime(input.ScreenTime, out error);
        if (screenTime is null)
        {
            return null;
        }

        error = null;
        return new ControlledProfile
        {
            Enabled = input.Enabled,
            Mode = input.Mode,
            Hidden = hidden,
            Allowed = allowed,
            ScreenTime = screenTime,
            HiddenElements = (input.HiddenElements ?? [])
                .Where(key => key is not null && InterfaceElements.All.Contains(key))
                .Distinct(StringComparer.Ordinal)
                .OrderBy(key => key, StringComparer.Ordinal)
                .ToList(),
            LockSession = input.LockSession,
            PinSignIn = input.PinSignIn
        };
    }

    /// <summary>
    /// Normalizes the screen time settings.
    /// </summary>
    /// <param name="input">The settings sent.</param>
    /// <param name="error">The reason of a refusal.</param>
    /// <returns>The normalized settings, or <c>null</c> when they are refused.</returns>
    public static ScreenTimeSettings? NormalizeScreenTime(ScreenTimeSettings? input, out string? error)
    {
        if (input is null)
        {
            error = null;
            return new ScreenTimeSettings();
        }

        int[]? limits = input.DailyLimitMinutes;
        if (limits is null || limits.Length != DaysPerWeek)
        {
            error = "The daily limits must list the seven days of the week.";
            return null;
        }

        if (limits.Any(minutes => minutes != ScreenTimeSettings.Unlimited && (minutes < 0 || minutes > MaxDailyMinutes)))
        {
            error = "A daily limit is out of range.";
            return null;
        }

        error = null;
        return new ScreenTimeSettings
        {
            Enabled = input.Enabled,
            DailyLimitMinutes = (int[])limits.Clone(),
            WarningMinutes = Math.Clamp(input.WarningMinutes, 0, MaxWarningMinutes),
            ShowRemaining = input.ShowRemaining
        };
    }

    /// <summary>
    /// Normalizes the native settings sent with a profile.
    /// </summary>
    /// <param name="input">The settings sent.</param>
    /// <param name="error">The reason of a refusal.</param>
    /// <returns>The normalized settings, or <c>null</c> when they are refused.</returns>
    public static NativeSettings? NormalizeNative(NativeSettings? input, out string? error)
    {
        if (input is null)
        {
            error = "Native settings are required.";
            return null;
        }

        if (input.MaxParentalRating < 0 || input.MaxParentalSubRating < 0)
        {
            error = "A rating limit cannot be negative.";
            return null;
        }

        List<ScheduleWindow> windows = new();
        foreach (ScheduleWindow? window in input.AccessSchedules ?? [])
        {
            if (window is null)
            {
                continue;
            }

            string? day = ScheduleDays.FirstOrDefault(name => string.Equals(name, window.DayOfWeek, StringComparison.OrdinalIgnoreCase));
            if (day is null)
            {
                error = "Unknown schedule day: " + window.DayOfWeek;
                return null;
            }

            double start = RoundHour(window.StartHour);
            double end = RoundHour(window.EndHour);
            if (double.IsNaN(window.StartHour) || double.IsNaN(window.EndHour) || start < 0 || end > HoursPerDay || start >= end)
            {
                error = "A schedule window must start before it ends, between 0:00 and 24:00.";
                return null;
            }

            windows.Add(new ScheduleWindow { DayOfWeek = day, StartHour = start, EndHour = end });
        }

        if (windows.Count > MaxScheduleWindows)
        {
            error = "Too many schedule windows.";
            return null;
        }

        error = null;
        return new NativeSettings
        {
            MaxParentalRating = input.MaxParentalRating,
            MaxParentalSubRating = input.MaxParentalRating is null ? null : input.MaxParentalSubRating,
            BlockUnratedItems = (input.BlockUnratedItems ?? [])
                .Select(kind => UnratedKinds.FirstOrDefault(name => string.Equals(name, kind, StringComparison.OrdinalIgnoreCase)))
                .OfType<string>()
                .Distinct(StringComparer.Ordinal)
                .ToList(),
            AccessSchedules = windows
                .OrderBy(window => DayRank(window.DayOfWeek))
                .ThenBy(window => window.StartHour)
                .ToList(),
            EnableAllFolders = input.EnableAllFolders,
            EnabledFolders = input.EnableAllFolders ? new List<Guid>() : (input.EnabledFolders ?? []).Where(id => id != Guid.Empty).Distinct().ToList(),
            EnableRemoteAccess = input.EnableRemoteAccess,
            EnableContentDownloading = input.EnableContentDownloading,
            EnableContentDeletion = input.EnableContentDeletion,
            EnableLiveTvAccess = input.EnableLiveTvAccess,
            EnableUserPreferenceAccess = input.EnableUserPreferenceAccess,
            EnableSyncPlay = input.EnableSyncPlay,
            MaxActiveSessions = input.MaxActiveSessions <= 0 || input.MaxActiveSessions > MaxSessions ? 0 : input.MaxActiveSessions,
            ShowOnSignInScreen = input.ShowOnSignInScreen
        };
    }

    /// <summary>
    /// Normalizes a label sent by a client.
    /// </summary>
    /// <param name="input">The label sent.</param>
    /// <param name="otherNames">The names of the other labels.</param>
    /// <param name="error">The reason of a refusal.</param>
    /// <returns>The normalized label (without identifier), or <c>null</c> when it is refused.</returns>
    public static ContentLabel? NormalizeLabel(ContentLabel? input, IEnumerable<string> otherNames, out string? error)
    {
        ArgumentNullException.ThrowIfNull(otherNames);
        if (input is null)
        {
            error = "A label is required.";
            return null;
        }

        string name = CollapseSpaces(input.Name ?? string.Empty);
        if (name.Length == 0 || name.Length > MaxLabelNameLength)
        {
            error = "A label name has 1 to " + MaxLabelNameLength.ToString(CultureInfo.InvariantCulture) + " characters.";
            return null;
        }

        if (name.Any(char.IsControl) || name.Contains('|', StringComparison.Ordinal))
        {
            error = "A label name cannot hold control characters or '|'.";
            return null;
        }

        if (TagNames.IsReserved(name))
        {
            error = "Label names cannot start with \"" + TagNames.ReservedPrefix + "\": the plugin keeps it for its own tags.";
            return null;
        }

        string folded = TagNames.Fold(name);
        if (otherNames.Any(other => string.Equals(TagNames.Fold(other), folded, StringComparison.Ordinal)))
        {
            error = "Another label already has this name.";
            return null;
        }

        List<ContentRule>? targets = NormalizeRules(input.Targets, LabelKinds, MaxLabelTargets, out error);
        if (targets is null)
        {
            return null;
        }

        return new ContentLabel
        {
            Name = name,
            Color = ColorPattern().IsMatch(input.Color ?? string.Empty) ? input.Color!.ToLowerInvariant() : "#00a4dc",
            Targets = targets
        };
    }

    /// <summary>
    /// Normalizes a list of rules: known kinds only, well-formed values, duplicates removed.
    /// </summary>
    /// <param name="input">The rules sent.</param>
    /// <param name="kinds">The kinds accepted.</param>
    /// <param name="max">The most rules accepted.</param>
    /// <param name="error">The reason of a refusal.</param>
    /// <returns>The normalized rules, or <c>null</c> when they are refused.</returns>
    public static List<ContentRule>? NormalizeRules(IEnumerable<ContentRule?>? input, IReadOnlyCollection<RuleKind> kinds, int max, out string? error)
    {
        ArgumentNullException.ThrowIfNull(kinds);
        List<ContentRule> rules = new();
        HashSet<string> seen = new(StringComparer.Ordinal);
        foreach (ContentRule? rule in input ?? [])
        {
            if (rule is null)
            {
                continue;
            }

            if (!kinds.Contains(rule.Kind))
            {
                error = "This list does not accept " + rule.Kind + " entries.";
                return null;
            }

            string? value = NormalizeValue(rule.Kind, rule.Value);
            if (value is null)
            {
                error = "Invalid " + rule.Kind + " entry: " + rule.Value;
                return null;
            }

            string identity = ((int)rule.Kind).ToString(CultureInfo.InvariantCulture) + ":" + (rule.Kind is RuleKind.Genre or RuleKind.Tag ? TagNames.Fold(value) : value);
            if (!seen.Add(identity))
            {
                continue;
            }

            rules.Add(new ContentRule
            {
                Kind = rule.Kind,
                Value = value,
                Name = Truncate(rule.Name),
                ItemType = Truncate(rule.ItemType)
            });
        }

        if (rules.Count > max)
        {
            error = "Too many entries (" + max.ToString(CultureInfo.InvariantCulture) + " at most).";
            return null;
        }

        error = null;
        return rules;
    }

    private static string? NormalizeValue(RuleKind kind, string? value)
    {
        switch (kind)
        {
            case RuleKind.Item:
            case RuleKind.Collection:
            case RuleKind.Label:
                return Guid.TryParse(value, out Guid id) && id != Guid.Empty ? id.ToString("N", CultureInfo.InvariantCulture) : null;
            case RuleKind.Genre:
            case RuleKind.Tag:
                string name = CollapseSpaces(value ?? string.Empty);
                return name.Length == 0 || name.Length > MaxNameLength || name.Any(char.IsControl) ? null : name;
            default:
                return null;
        }
    }

    private static string? Truncate(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        string trimmed = text.Trim();
        return trimmed.Length <= MaxNameLength ? trimmed : trimmed[..MaxNameLength];
    }

    private static string CollapseSpaces(string text)
    {
        return SpacesPattern().Replace(text.Trim(), " ");
    }

    private static double RoundHour(double hour)
    {
        return Math.Round(hour / HourStep, MidpointRounding.AwayFromZero) * HourStep;
    }

    private static int DayRank(string day)
    {
        for (int i = 0; i < ScheduleDays.Count; i++)
        {
            if (string.Equals(ScheduleDays[i], day, StringComparison.Ordinal))
            {
                return i;
            }
        }

        return ScheduleDays.Count;
    }

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex ColorPattern();

    [GeneratedRegex(@"\s+")]
    private static partial Regex SpacesPattern();
}
