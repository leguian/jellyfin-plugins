using System;
using System.IO;
using MediaBrowser.Common.Configuration;

namespace Jellyfin.Plugin.CustomizedHome.Services;

/// <summary>
/// Where the plugin keeps its own files: a folder named after the plugin next to its XML configuration,
/// holding one folder per kind of data. The server knows nothing about it and never cleans it up, and neither
/// does the plugin when it is uninstalled: only the layout of a deleted user is removed.
/// </summary>
internal static class PluginData
{
    /// <summary>
    /// Folder of the per-user layouts.
    /// </summary>
    public const string UsersFolder = "users";

    /// <summary>
    /// Folder of the genre thumbnails and their index.
    /// </summary>
    public const string GenresFolder = "genres";

    /// <summary>
    /// Gets the folder holding the data folders of the plugin.
    /// </summary>
    /// <param name="applicationPaths">The application paths.</param>
    /// <returns>The folder path. It may not exist yet.</returns>
    public static string GetRoot(IApplicationPaths applicationPaths)
    {
        ArgumentNullException.ThrowIfNull(applicationPaths);
        return Path.Combine(applicationPaths.PluginConfigurationsPath, typeof(Plugin).Namespace!);
    }
}
