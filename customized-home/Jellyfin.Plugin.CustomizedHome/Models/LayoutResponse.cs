namespace Jellyfin.Plugin.CustomizedHome.Models;

/// <summary>
/// Layout and options returned to the client script.
/// </summary>
public class LayoutResponse
{
    /// <summary>
    /// Gets or sets where the layout comes from: <c>user</c>, <c>default</c> or <c>none</c>.
    /// </summary>
    public string Source { get; set; } = "none";

    /// <summary>
    /// Gets or sets the layout to apply.
    /// </summary>
    public HomeLayout Layout { get; set; } = new HomeLayout();

    /// <summary>
    /// Gets or sets a value indicating whether the current user may edit and save a layout.
    /// </summary>
    public bool CanCustomize { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the current user has a saved layout of their own.
    /// </summary>
    public bool HasUserLayout { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the current user is an administrator.
    /// </summary>
    public bool IsAdministrator { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the "Customize" button is shown on the home page.
    /// </summary>
    public bool ShowCustomizeButtonOnHome { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether an entry is added to the user menu.
    /// </summary>
    public bool ShowUserMenuEntry { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether folders can be collapsed by clicking their header.
    /// </summary>
    public bool FoldersCollapsible { get; set; }

    /// <summary>
    /// Gets or sets the plugin version.
    /// </summary>
    public string PluginVersion { get; set; } = string.Empty;
}
