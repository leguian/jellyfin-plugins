using System;
using System.Collections.Generic;
using System.Globalization;
using Jellyfin.Plugin.CustomizedHome.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.CustomizedHome;

/// <summary>
/// Customized Home plugin entry point.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    /// <summary>
    /// The plugin identifier, also declared in build.yaml.
    /// </summary>
    public const string PluginGuid = "7c99a4bf-cd3b-4bc8-b941-7ddccd816f3c";

    /// <summary>
    /// Initializes a new instance of the <see cref="Plugin"/> class.
    /// </summary>
    /// <param name="applicationPaths">Instance of the <see cref="IApplicationPaths"/> interface.</param>
    /// <param name="xmlSerializer">Instance of the <see cref="IXmlSerializer"/> interface.</param>
    /// <param name="serverConfigurationManager">Instance of the <see cref="IServerConfigurationManager"/> interface.</param>
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer, IServerConfigurationManager serverConfigurationManager)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
        ServerConfigurationManager = serverConfigurationManager;
    }

    /// <summary>
    /// Gets the current plugin instance.
    /// </summary>
    public static Plugin? Instance { get; private set; }

    /// <inheritdoc />
    public override string Name => "Customized Home";

    /// <inheritdoc />
    public override Guid Id => Guid.Parse(PluginGuid);

    /// <inheritdoc />
    public override string Description => "Reorder, hide and group the home screen sections into folders.";

    /// <summary>
    /// Gets the server configuration manager (used to resolve the configured base URL).
    /// </summary>
    public IServerConfigurationManager ServerConfigurationManager { get; }

    /// <summary>
    /// Gets the plugin version as a string usable in cache-busting query strings.
    /// </summary>
    public string VersionString => Version?.ToString() ?? "0.0.0.0";

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages()
    {
        return
        [
            new PluginPageInfo
            {
                Name = Name,
                DisplayName = Name,
                EnableInMainMenu = true,
                MenuIcon = "other_houses",
                EmbeddedResourcePath = string.Format(CultureInfo.InvariantCulture, "{0}.Configuration.configPage.html", GetType().Namespace)
            }
        ];
    }
}
