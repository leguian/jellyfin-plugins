using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.ParentalControl.Models;

/// <summary>
/// How the content of a controlled user is filtered.
/// </summary>
public enum ContentMode
{
    /// <summary>
    /// Everything the native settings allow, except what is hidden.
    /// </summary>
    BlockList = 0,

    /// <summary>
    /// Only what is explicitly allowed (and still within the native settings).
    /// </summary>
    AllowList = 1
}

/// <summary>
/// The settings of the plugin for one controlled user. The native Jellyfin settings (rating, schedule, libraries,
/// permissions) are not stored here: they stay in the user policy, the plugin edits them in place.
/// </summary>
public class ControlledProfile
{
    /// <summary>
    /// Gets or sets the controlled user.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the profile is applied. A paused profile keeps its settings and
    /// removes from the user policy everything the plugin added there.
    /// </summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// Gets or sets the key used in the tags of this profile (pc-hidden-key, pc-allowed-key). Chosen once, never
    /// changed: renaming the user does not touch the tags written on the items.
    /// </summary>
    public string TagKey { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets how the content is filtered.
    /// </summary>
    public ContentMode Mode { get; set; }

    /// <summary>
    /// Gets or sets what is hidden from the user.
    /// </summary>
    public List<ContentRule> Hidden { get; set; } = new();

    /// <summary>
    /// Gets or sets what the user may see in <see cref="ContentMode.AllowList"/> mode.
    /// </summary>
    public List<ContentRule> Allowed { get; set; } = new();

    /// <summary>
    /// Gets or sets the screen time settings.
    /// </summary>
    public ScreenTimeSettings ScreenTime { get; set; } = new();

    /// <summary>
    /// Gets or sets the elements of the web client hidden from the user (keys of <see cref="Helpers.InterfaceElements"/>).
    /// </summary>
    public List<string> HiddenElements { get; set; } = new();

    /// <summary>
    /// Gets or sets a value indicating whether signing out or changing server on the web client asks for the parent PIN.
    /// </summary>
    public bool LockSession { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the sign-in page of the web client shows a PIN pad for this user.
    /// </summary>
    public bool PinSignIn { get; set; }

    /// <summary>
    /// Gets or sets the length of the PIN set through the plugin, so that the PIN pad signs in as soon as it is typed
    /// (0: unknown, the pad shows a confirm key).
    /// </summary>
    public int PinLength { get; set; }

    /// <summary>
    /// Gets or sets the blocked tags the plugin wrote into the user policy, so that it removes only its own.
    /// </summary>
    public List<string> AppliedBlockedTags { get; set; } = new();

    /// <summary>
    /// Gets or sets the allowed tags the plugin wrote into the user policy, so that it removes only its own.
    /// </summary>
    public List<string> AppliedAllowedTags { get; set; } = new();

    /// <summary>
    /// Gets or sets the time of the last change.
    /// </summary>
    public DateTime? ModifiedUtc { get; set; }
}

/// <summary>
/// Daily screen time.
/// </summary>
public class ScreenTimeSettings
{
    /// <summary>
    /// Value of a day without limit.
    /// </summary>
    public const int Unlimited = -1;

    /// <summary>
    /// Gets or sets a value indicating whether the daily limit is enforced.
    /// </summary>
    public bool Enabled { get; set; }

    /// <summary>
    /// Gets or sets the minutes of playback allowed per day, indexed by <see cref="DayOfWeek"/> (Sunday first);
    /// <see cref="Unlimited"/> for no limit that day, 0 for no playback at all.
    /// </summary>
    public int[] DailyLimitMinutes { get; set; } = [90, 60, 60, 90, 60, 60, 90];

    /// <summary>
    /// Gets or sets how many minutes before the end the user is warned (0: no warning).
    /// </summary>
    public int WarningMinutes { get; set; } = 5;

    /// <summary>
    /// Gets or sets a value indicating whether the web client shows the time left.
    /// </summary>
    public bool ShowRemaining { get; set; } = true;
}
