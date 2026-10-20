namespace Jellyfin.Plugin.ParentalControl.Models;

/// <summary>
/// What a content rule points at.
/// </summary>
public enum RuleKind
{
    /// <summary>
    /// One library item (movie, series, season, album...) and everything below it.
    /// </summary>
    Item = 0,

    /// <summary>
    /// A collection (box set) or a playlist: the collection itself and every member, with everything below them.
    /// </summary>
    Collection = 1,

    /// <summary>
    /// Every item of a genre, matched by name.
    /// </summary>
    Genre = 2,

    /// <summary>
    /// A tag that already exists on the items (metadata, other tools): passed as is to the user policy.
    /// </summary>
    Tag = 3,

    /// <summary>
    /// A label of this plugin, by its identifier: the label name is the tag written on its items.
    /// </summary>
    Label = 4
}

/// <summary>
/// One entry of a hidden or allowed list, or one target of a label.
/// </summary>
public class ContentRule
{
    /// <summary>
    /// Gets or sets what the rule points at.
    /// </summary>
    public RuleKind Kind { get; set; }

    /// <summary>
    /// Gets or sets the target: an item identifier ("N" format) for items and collections, a name for genres and
    /// tags, a label identifier for labels.
    /// </summary>
    public string Value { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the display name, refreshed by the server from the library when the rule is saved.
    /// </summary>
    public string? Name { get; set; }

    /// <summary>
    /// Gets or sets the item type of an item or collection target (Movie, Series, BoxSet...), for its icon.
    /// </summary>
    public string? ItemType { get; set; }
}
