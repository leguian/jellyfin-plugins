using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.ParentalControl.Helpers;

/// <summary>
/// The elements of the web client a profile can hide. The client script maps each key to its selectors.
/// </summary>
public static class InterfaceElements
{
    /// <summary>
    /// Search button and search page.
    /// </summary>
    public const string Search = "search";

    /// <summary>
    /// Favorites tab and menu entry.
    /// </summary>
    public const string Favorites = "favorites";

    /// <summary>
    /// SyncPlay button.
    /// </summary>
    public const string SyncPlay = "syncplay";

    /// <summary>
    /// Cast / remote play button.
    /// </summary>
    public const string Cast = "cast";

    /// <summary>
    /// Settings and profile entries of the user menu, and their pages.
    /// </summary>
    public const string Settings = "settings";

    /// <summary>
    /// Main menu (drawer) and its button.
    /// </summary>
    public const string Drawer = "drawer";

    /// <summary>
    /// Sign out and change server entries.
    /// </summary>
    public const string SignOut = "signout";

    /// <summary>
    /// Every known key.
    /// </summary>
    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        Search, Favorites, SyncPlay, Cast, Settings, Drawer, SignOut
    };
}
