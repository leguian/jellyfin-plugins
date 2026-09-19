using System;
using System.Collections.Generic;
using Jellyfin.Plugin.CustomizedHome.Models;

namespace Jellyfin.Plugin.CustomizedHome.Helpers;

/// <summary>
/// Prepares the default layout, written by an administrator, for another user.
/// The "recently added in a library" sections carry the identifier and the name of a library:
/// a user must never learn about a library they cannot access.
/// </summary>
public static class DefaultLayoutFilter
{
    /// <summary>
    /// Prefix of the keys of the "recently added in a library" sections, followed by the library view identifier.
    /// </summary>
    public const string LatestMediaPrefix = "jf:latestmedia:";

    /// <summary>
    /// Returns a copy of the layout without the library sections the user cannot access, and without any library name.
    /// </summary>
    /// <param name="layout">The default layout. Never modified.</param>
    /// <param name="accessibleViews">The identifiers of the library views of the user.</param>
    /// <returns>The layout to send to that user.</returns>
    public static HomeLayout ForUser(HomeLayout layout, IReadOnlySet<Guid> accessibleViews)
    {
        ArgumentNullException.ThrowIfNull(layout);
        ArgumentNullException.ThrowIfNull(accessibleViews);

        // Normalize doubles as a deep copy: the stored configuration must not change.
        HomeLayout copy = LayoutValidator.Normalize(layout, out _) ?? new HomeLayout();
        Clean(copy.Items, accessibleViews);
        return copy;
    }

    private static void Clean(List<LayoutItem> items, IReadOnlySet<Guid> accessibleViews)
    {
        items.RemoveAll(item => IsLibrarySection(item, out Guid view) && !accessibleViews.Contains(view));
        foreach (LayoutItem item in items)
        {
            if (IsLibrarySection(item, out _))
            {
                // The client builds the label from the user's own libraries.
                item.Label = null;
            }

            if (item.Items.Count > 0)
            {
                Clean(item.Items, accessibleViews);
            }
        }
    }

    private static bool IsLibrarySection(LayoutItem item, out Guid view)
    {
        view = Guid.Empty;
        if (item.Key is null || !item.Key.StartsWith(LatestMediaPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        // An identifier that cannot be read is treated as a library nobody can access.
        _ = Guid.TryParse(item.Key.AsSpan(LatestMediaPrefix.Length), out view);
        return true;
    }
}
