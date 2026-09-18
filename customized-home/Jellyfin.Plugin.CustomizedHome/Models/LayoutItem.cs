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
    /// Gets or sets the card shape (sections only): <c>auto</c>, <c>portrait</c>, <c>landscape</c> or <c>square</c>.
    /// </summary>
    public string Shape { get; set; } = LayoutFormats.ShapeAuto;

    /// <summary>
    /// Gets or sets the card size (sections only): <c>small</c>, <c>normal</c> or <c>large</c>.
    /// </summary>
    public string Size { get; set; } = LayoutFormats.SizeNormal;

    /// <summary>
    /// Gets or sets a value indicating whether the card titles are shown (sections only).
    /// </summary>
    public bool ShowTitle { get; set; } = true;

    /// <summary>
    /// Gets or sets the genres displayed by the genre section, one row per genre (section <c>ch:genre</c> only).
    /// Empty means automatic: genres picked from the watch history of the user.
    /// </summary>
    [XmlArrayItem("Genre")]
    public List<string> Genres { get; set; } = new List<string>();

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

/// <summary>
/// Display format values accepted for a section.
/// </summary>
public static class LayoutFormats
{
    /// <summary>Keep the shape chosen by the section renderer.</summary>
    public const string ShapeAuto = "auto";

    /// <summary>Poster cards (2:3).</summary>
    public const string ShapePortrait = "portrait";

    /// <summary>Backdrop / thumb cards (16:9).</summary>
    public const string ShapeLandscape = "landscape";

    /// <summary>Square cards.</summary>
    public const string ShapeSquare = "square";

    /// <summary>Small cards.</summary>
    public const string SizeSmall = "small";

    /// <summary>Default card size.</summary>
    public const string SizeNormal = "normal";

    /// <summary>Large cards.</summary>
    public const string SizeLarge = "large";

    /// <summary>Every accepted shape.</summary>
    public static readonly string[] Shapes = [ShapeAuto, ShapePortrait, ShapeLandscape, ShapeSquare];

    /// <summary>Every accepted size.</summary>
    public static readonly string[] Sizes = [SizeSmall, SizeNormal, SizeLarge];
}
