using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.ParentalControl.Models;

/// <summary>
/// The Jellyfin user policy settings the profile editor shows. They live in the user policy: the plugin reads them
/// from it and writes them back, so the native user page and the plugin always agree.
/// </summary>
public class NativeSettings
{
    /// <summary>
    /// Gets or sets the highest rating score allowed (<c>null</c>: no limit).
    /// </summary>
    public int? MaxParentalRating { get; set; }

    /// <summary>
    /// Gets or sets the highest rating sub score allowed (<c>null</c>: no limit).
    /// </summary>
    public int? MaxParentalSubRating { get; set; }

    /// <summary>
    /// Gets or sets the kinds of unrated items that are blocked (names of the Jellyfin UnratedItem values).
    /// </summary>
    public List<string> BlockUnratedItems { get; set; } = new();

    /// <summary>
    /// Gets or sets the windows during which the user may use the server. Empty: always.
    /// </summary>
    public List<ScheduleWindow> AccessSchedules { get; set; } = new();

    /// <summary>
    /// Gets or sets a value indicating whether every library is accessible.
    /// </summary>
    public bool EnableAllFolders { get; set; } = true;

    /// <summary>
    /// Gets or sets the accessible libraries when <see cref="EnableAllFolders"/> is false.
    /// </summary>
    public List<Guid> EnabledFolders { get; set; } = new();

    /// <summary>
    /// Gets or sets a value indicating whether the user may connect from outside the local network.
    /// </summary>
    public bool EnableRemoteAccess { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the user may download media.
    /// </summary>
    public bool EnableContentDownloading { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the user may delete media.
    /// </summary>
    public bool EnableContentDeletion { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the user may watch live TV.
    /// </summary>
    public bool EnableLiveTvAccess { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the user may change their own settings (password, display, home).
    /// </summary>
    public bool EnableUserPreferenceAccess { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the user may use SyncPlay.
    /// </summary>
    public bool EnableSyncPlay { get; set; }

    /// <summary>
    /// Gets or sets the maximum number of simultaneous sessions (0: no limit).
    /// </summary>
    public int MaxActiveSessions { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the user appears on the sign-in screen (the opposite of the
    /// "hidden" setting of Jellyfin, which new accounts get by default).
    /// </summary>
    public bool ShowOnSignInScreen { get; set; }
}

/// <summary>
/// One window of the access schedule, in server local time.
/// </summary>
public class ScheduleWindow
{
    /// <summary>
    /// Gets or sets the day: a day name (Sunday ... Saturday), Everyday, Weekday or Weekend.
    /// </summary>
    public string DayOfWeek { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the start hour (0 to 24, half hours allowed).
    /// </summary>
    public double StartHour { get; set; }

    /// <summary>
    /// Gets or sets the end hour (0 to 24, half hours allowed).
    /// </summary>
    public double EndHour { get; set; }
}
