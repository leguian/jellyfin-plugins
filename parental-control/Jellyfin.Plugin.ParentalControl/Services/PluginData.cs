using System;
using System.IO;
using MediaBrowser.Common.Configuration;

namespace Jellyfin.Plugin.ParentalControl.Services;

/// <summary>
/// Where the plugin keeps its own files: a folder named after the plugin next to its XML configuration. The settings
/// live in the XML configuration; this folder holds what changes all the time (screen time, tags written).
/// </summary>
internal static class PluginData
{
    /// <summary>
    /// File of the screen time and playback history.
    /// </summary>
    public const string UsageFile = "usage.json";

    /// <summary>
    /// File of the tags written on the items.
    /// </summary>
    public const string TagsFile = "tags.json";

    /// <summary>
    /// Gets the folder holding the data files of the plugin.
    /// </summary>
    /// <param name="applicationPaths">The application paths.</param>
    /// <returns>The folder path. It may not exist yet.</returns>
    public static string GetRoot(IApplicationPaths applicationPaths)
    {
        ArgumentNullException.ThrowIfNull(applicationPaths);
        return Path.Combine(applicationPaths.PluginConfigurationsPath, typeof(Plugin).Namespace!);
    }
}
