using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Jellyfin.Plugin.CustomizedHome.Configuration;
using Jellyfin.Plugin.CustomizedHome.Services;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.CustomizedHome;

/// <summary>
/// Customized Home plugin entry point.
/// </summary>
public partial class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    /// <summary>
    /// The plugin identifier, also declared in build.yaml.
    /// </summary>
    public const string PluginGuid = "7c99a4bf-cd3b-4bc8-b941-7ddccd816f3c";

    private readonly ILogger<Plugin> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="Plugin"/> class.
    /// </summary>
    /// <param name="applicationPaths">Instance of the <see cref="IApplicationPaths"/> interface.</param>
    /// <param name="xmlSerializer">Instance of the <see cref="IXmlSerializer"/> interface.</param>
    /// <param name="serverConfigurationManager">Instance of the <see cref="IServerConfigurationManager"/> interface.</param>
    /// <param name="logger">The logger.</param>
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer, IServerConfigurationManager serverConfigurationManager, ILogger<Plugin> logger)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
        ServerConfigurationManager = serverConfigurationManager;
        _logger = logger;
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
    public override string Description => "Easily edit and organize the sections on your homepage";

    /// <summary>
    /// Gets the server configuration manager (used to resolve the configured base URL).
    /// </summary>
    public IServerConfigurationManager ServerConfigurationManager { get; }

    /// <summary>
    /// Gets the plugin version as a string usable in cache-busting query strings.
    /// </summary>
    public string VersionString => Version?.ToString() ?? "0.0.0.0";

    /// <summary>
    /// Called by the server when an administrator uninstalls the plugin (not when it is updated or disabled).
    /// The server removes the plugin binaries and nothing else, and so does the plugin: uninstalling then
    /// installing again is a common way of troubleshooting, and it must not cost every user their layout.
    /// The data folder is kept and the log says where it is.
    /// </summary>
    public override void OnUninstalling()
    {
        ReportKeptData(ApplicationPaths, _logger);
        base.OnUninstalling();
    }

    /// <summary>
    /// Logs where the data of the plugin stays after an uninstallation, when there is any. Nothing is deleted
    /// and nothing is thrown: an exception here would make the server refuse the uninstallation.
    /// </summary>
    /// <param name="applicationPaths">The application paths.</param>
    /// <param name="logger">The logger.</param>
    internal static void ReportKeptData(IApplicationPaths applicationPaths, ILogger logger)
    {
        string root = PluginData.GetRoot(applicationPaths);
        if (Directory.Exists(root))
        {
            LogDataKept(logger, root);
        }
    }

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

    [LoggerMessage(Level = LogLevel.Information, Message = "Customized Home: uninstalling, the plugin data folder {Path} is kept so that a later installation finds the layouts and the genre thumbnails again; remove it by hand to get rid of them")]
    private static partial void LogDataKept(ILogger logger, string path);
}
