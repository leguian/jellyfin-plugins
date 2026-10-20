using System;
using System.Collections.Generic;
using System.Globalization;
using Jellyfin.Data.Enums;
using Jellyfin.Plugin.ParentalControl.Models;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;

namespace Jellyfin.Plugin.ParentalControl.Services;

/// <summary>
/// Turns content rules into the library items that carry their tag. Every item below a target is tagged too, not
/// only the target: Jellyfin 10.11 does not apply the tags of a series to its episodes in its queries (next up,
/// latest, search), and in allow-list mode a season or an episode without the tag is not visible at all.
/// </summary>
public class ContentExpander
{
    /// <summary>
    /// The item types a genre rule tags; seasons, episodes and tracks follow from their parents.
    /// </summary>
    internal static readonly BaseItemKind[] GenreItemKinds =
    [
        BaseItemKind.Movie, BaseItemKind.Series, BaseItemKind.MusicVideo, BaseItemKind.Video,
        BaseItemKind.MusicAlbum, BaseItemKind.AudioBook, BaseItemKind.Book, BaseItemKind.BoxSet
    ];

    private readonly ILibraryManager _libraryManager;

    /// <summary>
    /// Initializes a new instance of the <see cref="ContentExpander"/> class.
    /// </summary>
    /// <param name="libraryManager">The library manager.</param>
    public ContentExpander(ILibraryManager libraryManager)
    {
        _libraryManager = libraryManager;
    }

    /// <summary>
    /// Adds to a set the items a rule tags. Tag and label rules tag nothing: they go to the user policy as they are.
    /// </summary>
    /// <param name="rule">The rule.</param>
    /// <param name="into">The set to add the item identifiers to.</param>
    public virtual void Expand(ContentRule rule, HashSet<Guid> into)
    {
        ArgumentNullException.ThrowIfNull(rule);
        ArgumentNullException.ThrowIfNull(into);
        switch (rule.Kind)
        {
            case RuleKind.Item:
            case RuleKind.Collection:
                if (Guid.TryParse(rule.Value, out Guid id) && _libraryManager.GetItemById(id) is BaseItem item)
                {
                    AddWithDescendants(item, into);
                }

                break;
            case RuleKind.Genre:
                InternalItemsQuery query = new()
                {
                    Genres = [rule.Value],
                    IncludeItemTypes = GenreItemKinds,
                    Recursive = true
                };
                foreach (BaseItem match in _libraryManager.GetItemList(query))
                {
                    AddWithDescendants(match, into);
                }

                break;
        }
    }

    /// <summary>
    /// Gets the display name and type of an item, to refresh the snapshot kept in a rule.
    /// </summary>
    /// <param name="value">The item identifier.</param>
    /// <returns>The name and type, or <c>null</c> when the item is gone.</returns>
    public virtual (string Name, string ItemType)? Describe(string value)
    {
        if (!Guid.TryParse(value, out Guid id) || _libraryManager.GetItemById(id) is not BaseItem item)
        {
            return null;
        }

        string name = item.Name ?? string.Empty;
        if (item is MediaBrowser.Controller.Entities.TV.Season season && !string.IsNullOrEmpty(season.SeriesName))
        {
            name = season.SeriesName + " - " + name;
        }
        else if (item.ProductionYear is int year && item is not Folder)
        {
            name += " (" + year.ToString(CultureInfo.InvariantCulture) + ")";
        }

        return (name, item.GetBaseItemKind().ToString());
    }

    private static void AddWithDescendants(BaseItem root, HashSet<Guid> into)
    {
        Stack<BaseItem> pending = new();
        pending.Push(root);
        while (pending.Count > 0)
        {
            BaseItem item = pending.Pop();
            if (!into.Add(item.Id) || item is not Folder folder || item is ICollectionFolder || item is UserRootFolder || item is AggregateFolder)
            {
                // Already there, a leaf, or a library root: a rule never tags a whole library (library access does that).
                continue;
            }

            if (folder.LinkedChildren.Length > 0)
            {
                // Collections and playlists list their members as linked children: each member brings its own descendants.
                foreach (BaseItem member in folder.GetLinkedChildren())
                {
                    pending.Push(member);
                }
            }
            else
            {
                // Other folders own their descendants, found in one query.
                foreach (BaseItem descendant in folder.GetRecursiveChildren())
                {
                    into.Add(descendant.Id);
                }
            }
        }
    }
}
