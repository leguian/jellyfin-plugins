using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.ParentalControl.Models;

/// <summary>
/// A user of the server as the family page lists it.
/// </summary>
public class FamilyMember
{
    /// <summary>
    /// Gets or sets the user identifier.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// Gets or sets the user name.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the tag of the user image, <c>null</c> without image.
    /// </summary>
    public string? PrimaryImageTag { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the user is an administrator (never controlled).
    /// </summary>
    public bool IsAdministrator { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the user is disabled.
    /// </summary>
    public bool IsDisabled { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether a profile exists for the user.
    /// </summary>
    public bool HasProfile { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether that profile is applied.
    /// </summary>
    public bool Enabled { get; set; }

    /// <summary>
    /// Gets or sets the content mode of the profile.
    /// </summary>
    public ContentMode Mode { get; set; }

    /// <summary>
    /// Gets or sets the number of hidden or allowed entries of the profile.
    /// </summary>
    public int RuleCount { get; set; }

    /// <summary>
    /// Gets or sets today's usage.
    /// </summary>
    public UsageToday? Today { get; set; }
}

/// <summary>
/// The screen time of the current day.
/// </summary>
public class UsageToday
{
    /// <summary>
    /// Gets or sets a value indicating whether the limit is enforced.
    /// </summary>
    public bool Enabled { get; set; }

    /// <summary>
    /// Gets or sets the playback time of the day, in seconds.
    /// </summary>
    public int UsedSeconds { get; set; }

    /// <summary>
    /// Gets or sets the limit of the day in minutes, <see cref="ScreenTimeSettings.Unlimited"/> without limit.
    /// </summary>
    public int LimitMinutes { get; set; } = ScreenTimeSettings.Unlimited;

    /// <summary>
    /// Gets or sets the extra minutes granted today.
    /// </summary>
    public int BonusMinutes { get; set; }

    /// <summary>
    /// Gets or sets the seconds left today, <c>null</c> without limit.
    /// </summary>
    public int? RemainingSeconds { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the time of the day is used up.
    /// </summary>
    public bool Exhausted { get; set; }
}

/// <summary>
/// Everything the profile editor shows for one user.
/// </summary>
public class ProfileView
{
    /// <summary>
    /// Gets or sets the user.
    /// </summary>
    public FamilyMember User { get; set; } = new();

    /// <summary>
    /// Gets or sets the profile (a new, not yet saved one when the user has none).
    /// </summary>
    public ControlledProfile Profile { get; set; } = new();

    /// <summary>
    /// Gets or sets the native settings read from the user policy.
    /// </summary>
    public NativeSettings Native { get; set; } = new();

    /// <summary>
    /// Gets or sets the usage of the last days and the recent playback.
    /// </summary>
    public UsageReport Usage { get; set; } = new();
}

/// <summary>
/// A profile and the native settings to save together.
/// </summary>
public class ProfileUpdate
{
    /// <summary>
    /// Gets or sets the profile.
    /// </summary>
    public ControlledProfile? Profile { get; set; }

    /// <summary>
    /// Gets or sets the native settings, left untouched when <c>null</c>.
    /// </summary>
    public NativeSettings? Native { get; set; }
}

/// <summary>
/// Screen time of the recent days and recent playback of a user.
/// </summary>
public class UsageReport
{
    /// <summary>
    /// Gets or sets today's usage.
    /// </summary>
    public UsageToday Today { get; set; } = new();

    /// <summary>
    /// Gets or sets the playback time of the last days, oldest first, today included.
    /// </summary>
    public List<DayUsage> Days { get; set; } = new();

    /// <summary>
    /// Gets or sets the recent playback, newest first.
    /// </summary>
    public List<HistoryEntry> History { get; set; } = new();
}

/// <summary>
/// The playback time of one day.
/// </summary>
public class DayUsage
{
    /// <summary>
    /// Gets or sets the day (yyyy-MM-dd, server local time).
    /// </summary>
    public string Date { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the playback time, in seconds.
    /// </summary>
    public int Seconds { get; set; }

    /// <summary>
    /// Gets or sets the limit of that day in minutes, <see cref="ScreenTimeSettings.Unlimited"/> without limit.
    /// </summary>
    public int LimitMinutes { get; set; } = ScreenTimeSettings.Unlimited;
}

/// <summary>
/// One playback of a controlled user.
/// </summary>
public class HistoryEntry
{
    /// <summary>
    /// Gets or sets the item played.
    /// </summary>
    public Guid ItemId { get; set; }

    /// <summary>
    /// Gets or sets the item name.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the series name of an episode.
    /// </summary>
    public string? SeriesName { get; set; }

    /// <summary>
    /// Gets or sets the item type.
    /// </summary>
    public string? ItemType { get; set; }

    /// <summary>
    /// Gets or sets the device the item was played on.
    /// </summary>
    public string? DeviceName { get; set; }

    /// <summary>
    /// Gets or sets the start of the playback.
    /// </summary>
    public DateTime StartedUtc { get; set; }

    /// <summary>
    /// Gets or sets the playback time counted, in seconds.
    /// </summary>
    public int Seconds { get; set; }
}

/// <summary>
/// What the web client needs to know about the current user.
/// </summary>
public class ClientContext
{
    /// <summary>
    /// Gets or sets a value indicating whether the current user is controlled.
    /// </summary>
    public bool Controlled { get; set; }

    /// <summary>
    /// Gets or sets the elements of the web client to hide.
    /// </summary>
    public List<string> HiddenElements { get; set; } = new();

    /// <summary>
    /// Gets or sets a value indicating whether signing out asks for the parent PIN.
    /// </summary>
    public bool LockSession { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether a parent PIN is set.
    /// </summary>
    public bool ParentPinSet { get; set; }

    /// <summary>
    /// Gets or sets today's screen time.
    /// </summary>
    public UsageToday ScreenTime { get; set; } = new();

    /// <summary>
    /// Gets or sets how many minutes before the end the warning appears.
    /// </summary>
    public int WarningMinutes { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the time left is shown.
    /// </summary>
    public bool ShowRemaining { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the access schedule allows the server right now.
    /// </summary>
    public bool AllowedNow { get; set; } = true;

    /// <summary>
    /// Gets or sets the next start of an allowed window (server local time, ISO 8601 with offset) while outside the schedule.
    /// </summary>
    public string? NextAllowed { get; set; }

    /// <summary>
    /// Gets or sets the plugin version.
    /// </summary>
    public string PluginVersion { get; set; } = string.Empty;
}

/// <summary>
/// What the sign-in page needs: the users that sign in with a PIN pad. Anonymous: identifiers only.
/// </summary>
public class SignInInfo
{
    /// <summary>
    /// Gets or sets the users with a PIN pad.
    /// </summary>
    public List<PinUser> PinUsers { get; set; } = new();
}

/// <summary>
/// A user that signs in with a PIN pad.
/// </summary>
public class PinUser
{
    /// <summary>
    /// Gets or sets the user identifier ("N" format, as the sign-in page writes it).
    /// </summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the PIN length, 0 when unknown.
    /// </summary>
    public int Length { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the access schedule lets the user sign in right now. Jellyfin refuses
    /// the sign-in otherwise, and the pad says so instead of "wrong code". No times: the endpoint is anonymous.
    /// </summary>
    public bool AllowedNow { get; set; } = true;
}

/// <summary>
/// A PIN sent by a client.
/// </summary>
public class PinRequest
{
    /// <summary>
    /// Gets or sets the PIN.
    /// </summary>
    public string? Pin { get; set; }
}

/// <summary>
/// Extra screen time asked from the web client of a controlled user, approved with the parent PIN.
/// </summary>
public class ExtendRequest
{
    /// <summary>
    /// Gets or sets the parent PIN.
    /// </summary>
    public string? Pin { get; set; }

    /// <summary>
    /// Gets or sets the minutes to add for today.
    /// </summary>
    public int Minutes { get; set; }
}

/// <summary>
/// Extra screen time granted by an administrator.
/// </summary>
public class BonusRequest
{
    /// <summary>
    /// Gets or sets the minutes to add for today (negative to take back, never below zero).
    /// </summary>
    public int Minutes { get; set; }
}

/// <summary>
/// Outcome of a PIN check.
/// </summary>
public class PinCheckResult
{
    /// <summary>
    /// Gets or sets a value indicating whether the PIN is right.
    /// </summary>
    public bool Valid { get; set; }

    /// <summary>
    /// Gets or sets the seconds before a new attempt is accepted, when too many failed.
    /// </summary>
    public int RetryAfterSeconds { get; set; }
}

/// <summary>
/// Diagnostics shown on the settings tab.
/// </summary>
public class PluginStatus
{
    /// <summary>
    /// Gets or sets the plugin version.
    /// </summary>
    public string PluginVersion { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the state of the web client injection.
    /// </summary>
    public Services.InjectionStatus Injection { get; set; } = new();

    /// <summary>
    /// Gets or sets the state of the tag synchronization.
    /// </summary>
    public SyncStatus Sync { get; set; } = new();

    /// <summary>
    /// Gets or sets a value indicating whether a parent PIN is set.
    /// </summary>
    public bool ParentPinSet { get; set; }

    /// <summary>
    /// Gets or sets the language of the messages sent to the players.
    /// </summary>
    public string MessageLanguage { get; set; } = "auto";

    /// <summary>
    /// Gets or sets a value indicating whether developer mode is on.
    /// </summary>
    public bool DeveloperMode { get; set; }
}

/// <summary>
/// Options of the settings tab.
/// </summary>
public class PluginOptions
{
    /// <summary>
    /// Gets or sets the language of the messages sent to the players: auto, en or fr.
    /// </summary>
    public string? MessageLanguage { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether developer mode is on.
    /// </summary>
    public bool DeveloperMode { get; set; }
}

/// <summary>
/// State of the synchronization of the tags written by the plugin.
/// </summary>
public class SyncStatus
{
    /// <summary>
    /// Gets or sets a value indicating whether a synchronization is running or waiting to run.
    /// </summary>
    public bool Running { get; set; }

    /// <summary>
    /// Gets or sets the end of the last synchronization.
    /// </summary>
    public DateTime? LastRunUtc { get; set; }

    /// <summary>
    /// Gets or sets how many items carry a tag written by the plugin.
    /// </summary>
    public int TaggedItems { get; set; }

    /// <summary>
    /// Gets or sets how many items the last synchronization changed.
    /// </summary>
    public int LastChanged { get; set; }

    /// <summary>
    /// Gets or sets the error of the last synchronization, <c>null</c> when it succeeded.
    /// </summary>
    public string? LastError { get; set; }
}

/// <summary>
/// How many items of each kind a user can see, and a few of them.
/// </summary>
public class VisibilityPreview
{
    /// <summary>
    /// Gets or sets the number of visible movies.
    /// </summary>
    public int Movies { get; set; }

    /// <summary>
    /// Gets or sets the number of visible series.
    /// </summary>
    public int Series { get; set; }

    /// <summary>
    /// Gets or sets the number of visible collections.
    /// </summary>
    public int Collections { get; set; }

    /// <summary>
    /// Gets or sets the number of visible music albums.
    /// </summary>
    public int Albums { get; set; }

    /// <summary>
    /// Gets or sets a sample of the visible movies and series.
    /// </summary>
    public List<PreviewItem> Sample { get; set; } = new();

    /// <summary>
    /// Gets or sets a value indicating whether a tag synchronization is still running (the counts may change).
    /// </summary>
    public bool Syncing { get; set; }
}

/// <summary>
/// One item of a visibility preview.
/// </summary>
public class PreviewItem
{
    /// <summary>
    /// Gets or sets the item identifier.
    /// </summary>
    public Guid Id { get; set; }

    /// <summary>
    /// Gets or sets the name.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the item type.
    /// </summary>
    public string ItemType { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the production year.
    /// </summary>
    public int? Year { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the item has a primary image.
    /// </summary>
    public bool HasImage { get; set; }
}
