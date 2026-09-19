using System;
using System.Collections.Generic;
using System.Globalization;
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
    /// The server removes the plugin binaries and nothing else: the layouts of every user and the genre
    /// thumbnails would stay on disk for good, and come back unannounced with a later installation.
    /// </summary>
    public override void OnUninstalling()
    {
        DeleteData(ApplicationPaths, _logger);
        base.OnUninstalling();
    }

    /// <summary>
    /// Deletes the data folders of the plugin and logs the outcome. Never throws for a file system error:
    /// an exception here would make the server refuse the uninstallation.
    /// </summary>
    /// <param name="applicationPaths">The application paths.</param>
    /// <param name="logger">The logger.</param>
    internal static void DeleteData(IApplicationPaths applicationPaths, ILogger logger)
    {
        DataCleanupResult result = PluginData.DeleteAll(PluginData.GetRoot(applicationPaths));
        foreach (string folder in result.Deleted)
        {
            LogDataDeleted(logger, folder);
        }

        foreach (DataCleanupFailure failure in result.Failed)
        {
            LogDataNotDeleted(logger, failure.Path, failure.Error);
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

    [LoggerMessage(Level = LogLevel.Information, Message = "Customized Home: uninstalling, deleted the plugin data folder {Path}")]
    private static partial void LogDataDeleted(ILogger logger, string path);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Customized Home: uninstalling, could not delete the plugin data folder {Path}: remove it by hand")]
    private static partial void LogDataNotDeleted(ILogger logger, string path, Exception exception);
}
