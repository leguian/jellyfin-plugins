using System.Collections.Generic;
using System.Xml.Serialization;

namespace Jellyfin.Plugin.CustomizedHome.Models;

/// <summary>
/// An entry of a <see cref="HomeLayout"/>: either a section or a folder holding sections.
/// </summary>
public class LayoutItem
{
    /// <summary>
    /// Gets or sets the item type: <see cref="LayoutItemTypes.Section"/> or <see cref="LayoutItemTypes.Folder"/>.
    /// </summary>
    public string Type { get; set; } = LayoutItemTypes.Section;

    /// <summary>
    /// Gets or sets the section key (sections only), e.g. <c>hss:NextUp</c> or <c>jf:resume</c>.
    /// </summary>
    public string? Key { get; set; }

    /// <summary>
    /// Gets or sets the folder identifier (folders only).
    /// </summary>
    public string? Id { get; set; }

    /// <summary>
    /// Gets or sets the folder display name (folders only).
    /// </summary>
    public string? Name { get; set; }

    /// <summary>
    /// Gets or sets the folder Material icon name (folders only).
    /// </summary>
    public string? Icon { get; set; }

    /// <summary>
    /// Gets or sets the last known display label of the section (sections only, informative).
    /// </summary>
    public string? Label { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the item is shown on the home page.
    /// </summary>
    public bool Visible { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the folder starts collapsed (folders only).
    /// </summary>
    public bool Collapsed { get; set; }

    /// <summary>
    /// Gets or sets the folder members (folders only).
    /// </summary>
    [XmlArrayItem("Item")]
    public List<LayoutItem> Items { get; set; } = new List<LayoutItem>();
}

/// <summary>
/// Layout item type names.
/// </summary>
public static class LayoutItemTypes
{
    /// <summary>
    /// A home screen section.
    /// </summary>
    public const string Section = "section";

    /// <summary>
    /// A folder grouping sections.
    /// </summary>
    public const string Folder = "folder";
}
