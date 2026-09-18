namespace Jellyfin.Plugin.CustomizedHome.Models;

/// <summary>
/// Upload of a genre thumbnail. The image travels as base64 because the web client API helper only sends text bodies.
/// </summary>
public class GenreImageUpload
{
    /// <summary>
    /// Gets or sets the genre name.
    /// </summary>
    public string? Name { get; set; }

    /// <summary>
    /// Gets or sets the card shape the image is meant for: portrait (default), landscape or square.
    /// </summary>
    public string? Shape { get; set; }

    /// <summary>
    /// Gets or sets the image bytes, base64 encoded (PNG, JPEG or WebP, 5 MB maximum).
    /// </summary>
    public string? Data { get; set; }
}

/// <summary>
/// A genre that has a custom thumbnail, as exposed to clients.
/// </summary>
public class GenreImageInfo
{
    /// <summary>
    /// Gets or sets the genre name.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the card shape the thumbnail is meant for: portrait, landscape or square.
    /// </summary>
    public string Shape { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets a value that changes each time the thumbnail is replaced (cache busting).
    /// </summary>
    public long Version { get; set; }
}
