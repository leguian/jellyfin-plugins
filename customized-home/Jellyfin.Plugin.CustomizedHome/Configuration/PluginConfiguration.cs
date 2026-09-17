using Jellyfin.Plugin.CustomizedHome.Models;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.CustomizedHome.Configuration;

/// <summary>
/// Plugin configuration (administrator settings and the default layout).
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets a value indicating whether users may define their own layout.
    /// When false only the default layout is applied.
    /// </summary>
    public bool AllowUserCustomization { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the default layout is applied to every user,
    /// ignoring any layout they saved themselves.
    /// </summary>
    public bool ForceDefaultLayout { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the "Customize home" button is shown at the bottom of the home page.
    /// </summary>
    public bool ShowCustomizeButtonOnHome { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether an entry is added to the user menu.
    /// </summary>
    public bool ShowUserMenuEntry { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether folders can be collapsed/expanded by clicking their header.
    /// </summary>
    public bool FoldersCollapsible { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the client assets are served without caching (development).
    /// </summary>
    public bool DeveloperMode { get; set; }

    /// <summary>
    /// Gets or sets the default layout applied to users without a layout of their own.
    /// </summary>
    public HomeLayout DefaultLayout { get; set; } = new HomeLayout();
}
