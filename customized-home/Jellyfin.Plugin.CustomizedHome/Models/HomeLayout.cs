using System.Collections.Generic;
using System.Xml.Serialization;

namespace Jellyfin.Plugin.CustomizedHome.Models;

/// <summary>
/// A home screen layout: an ordered tree (one level deep) of sections and folders.
/// </summary>
public class HomeLayout
{
    /// <summary>
    /// Gets or sets the layout schema version.
    /// </summary>
    public int Version { get; set; } = 1;

    /// <summary>
    /// Gets or sets a value indicating whether sections that are not listed in the layout are hidden
    /// instead of being appended at the end of the home page.
    /// </summary>
    public bool HideUnlisted { get; set; }

    /// <summary>
    /// Gets or sets the hero banner shown above the sections.
    /// </summary>
    public HeroSettings Hero { get; set; } = new HeroSettings();

    /// <summary>
    /// Gets or sets the ordered top level items (sections or folders).
    /// </summary>
    [XmlArrayItem("Item")]
    public List<LayoutItem> Items { get; set; } = new List<LayoutItem>();
}
