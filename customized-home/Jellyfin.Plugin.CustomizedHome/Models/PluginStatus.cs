using Jellyfin.Plugin.CustomizedHome.Services;

namespace Jellyfin.Plugin.CustomizedHome.Models;

/// <summary>
/// Diagnostic information for administrators.
/// </summary>
public class PluginStatus
{
    /// <summary>
    /// Gets or sets the plugin version.
    /// </summary>
    public string PluginVersion { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the base URL prefix used for the injected assets.
    /// </summary>
    public string RootPath { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the File Transformation registration state.
    /// </summary>
    public InjectionStatus Injection { get; set; } = new InjectionStatus();

    /// <summary>
    /// Gets or sets the number of users that saved their own layout.
    /// </summary>
    public int UserLayoutCount { get; set; }

    /// <summary>
    /// Gets or sets the number of items in the default layout.
    /// </summary>
    public int DefaultLayoutItemCount { get; set; }
}
