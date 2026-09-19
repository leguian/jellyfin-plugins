using System;
using System.Collections.Generic;
using System.Linq;
using Jellyfin.Plugin.CustomizedHome.Models;

namespace Jellyfin.Plugin.CustomizedHome.Helpers;

/// <summary>
/// Prepares a layout for the user it is sent to.
/// The "recently added in a library" sections carry the identifier and sometimes the name of a library:
/// a user must never learn about a library they cannot access. This matters most for the default layout,
/// written by an administrator who sees every library, and also for a user's own layout saved before they
/// lost access to a library.
/// </summary>
public static class DefaultLayoutFilter
{
    /// <summary>
    /// Prefix of the keys of the "recently added in a library" sections, followed by the library view identifier.
    /// </summary>
    public const string LatestMediaPrefix = "jf:latestmedia:";

    // Sections the client could only identify by their title: the key and the label are that title.
    private const string TitlePrefix = "title:";

    /// <summary>
    /// Tells whether a layout holds anything <see cref="ForUser"/> would look at.
    /// </summary>
    /// <param name="layout">The layout.</param>
    /// <returns><c>true</c> when the layout lists a library or a title based section.</returns>
    public static bool NeedsFiltering(HomeLayout layout)
    {
        ArgumentNullException.ThrowIfNull(layout);
        return layout.Items.Any(item => IsSensitive(item) || item.Items.Any(IsSensitive));
    }

    /// <summary>
    /// Returns a copy of the layout without the library sections the user cannot access, and without any library name.
    /// </summary>
    /// <param name="layout">The layout. Never modified.</param>
    /// <param name="accessibleViews">The identifiers of the library views of the user.</param>
    /// <param name="writtenBySomeoneElse"><c>true</c> for the default layout: titles chosen by its author are not sent either.</param>
    /// <returns>The layout to send to that user.</returns>
    public static HomeLayout ForUser(HomeLayout layout, IReadOnlySet<Guid> accessibleViews, bool writtenBySomeoneElse)
    {
        ArgumentNullException.ThrowIfNull(layout);
        ArgumentNullException.ThrowIfNull(accessibleViews);

        // Normalize doubles as a deep copy: what is stored must not change.
        HomeLayout copy = LayoutValidator.Normalize(layout, out _) ?? new HomeLayout();
        Clean(copy.Items, accessibleViews, writtenBySomeoneElse);
        return copy;
    }

    private static void Clean(List<LayoutItem> items, IReadOnlySet<Guid> accessibleViews, bool writtenBySomeoneElse)
    {
        items.RemoveAll(item => IsLibrarySection(item, out Guid view) && !accessibleViews.Contains(view));
        foreach (LayoutItem item in items)
        {
            if (IsLibrarySection(item, out _) || (writtenBySomeoneElse && IsTitleSection(item)))
            {
                // The client builds the label from the user's own libraries, or from the section on screen.
                item.Label = null;
            }
        }

        // A folder the filter emptied would still tell its name, often the name of the library it grouped.
        items.RemoveAll(item =>
        {
            if (item.Items.Count == 0)
            {
                return false;
            }

            Clean(item.Items, accessibleViews, writtenBySomeoneElse);
            return item.Items.Count == 0;
        });
    }

    private static bool IsSensitive(LayoutItem item)
    {
        return IsLibrarySection(item, out _) || IsTitleSection(item);
    }

    private static bool IsTitleSection(LayoutItem item)
    {
        return item.Key is not null && item.Key.StartsWith(TitlePrefix, StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsLibrarySection(LayoutItem item, out Guid view)
    {
        view = Guid.Empty;
        if (item.Key is null || !item.Key.StartsWith(LatestMediaPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        // An identifier that cannot be read (title based key of the TV layout) is a library nobody can access:
        // the key itself holds the library name.
        _ = Guid.TryParse(item.Key.AsSpan(LatestMediaPrefix.Length), out view);
        return true;
    }
}
