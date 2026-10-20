using System.Collections.Generic;
using Jellyfin.Plugin.ParentalControl.Models;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.ParentalControl.Configuration;

/// <summary>
/// Plugin configuration. Written only through the plugin API, which validates every change.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets the controlled users.
    /// </summary>
    public List<ControlledProfile> Profiles { get; set; } = new();

    /// <summary>
    /// Gets or sets the labels.
    /// </summary>
    public List<ContentLabel> Labels { get; set; } = new();

    /// <summary>
    /// Gets or sets the PBKDF2 hash of the parent PIN (base64), <c>null</c> when no PIN is set.
    /// </summary>
    public string? ParentPinHash { get; set; }

    /// <summary>
    /// Gets or sets the salt of the parent PIN hash (base64).
    /// </summary>
    public string? ParentPinSalt { get; set; }

    /// <summary>
    /// Gets or sets the PBKDF2 iteration count the parent PIN was hashed with.
    /// </summary>
    public int ParentPinIterations { get; set; }

    /// <summary>
    /// Gets or sets the language of the messages sent to the players ("auto": the server language).
    /// </summary>
    public string MessageLanguage { get; set; } = "auto";

    /// <summary>
    /// Gets or sets a value indicating whether the client assets are served without caching (development).
    /// </summary>
    public bool DeveloperMode { get; set; }
}
