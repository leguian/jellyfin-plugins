using System.Collections.Generic;

namespace Jellyfin.Plugin.ParentalControl.Models;

/// <summary>
/// A label defined by the administrator: a Jellyfin tag the plugin writes on a set of items and keeps there.
/// Profiles hide or allow it like any tag; native clients and the metadata editor see it as a regular tag.
/// </summary>
public class ContentLabel
{
    /// <summary>
    /// Gets or sets the stable identifier ("N" format), referenced by the profile rules.
    /// </summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the name, which is also the tag written on the items.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the colour of the label in the administration page (#rrggbb).
    /// </summary>
    public string Color { get; set; } = "#00a4dc";

    /// <summary>
    /// Gets or sets the items the label is written on: items, collections and genres.
    /// </summary>
    public List<ContentRule> Targets { get; set; } = new();
}
