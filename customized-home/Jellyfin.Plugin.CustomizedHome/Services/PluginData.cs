using System;
using System.Collections.Generic;
using System.IO;
using MediaBrowser.Common.Configuration;

namespace Jellyfin.Plugin.CustomizedHome.Services;

/// <summary>
/// Where the plugin keeps its own files: a folder named after the plugin next to its XML configuration,
/// holding one folder per kind of data. The server knows nothing about it and never cleans it up.
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

    private static readonly string[] Folders = [UsersFolder, GenresFolder];

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

    /// <summary>
    /// Deletes the data folders of the plugin, then the folder holding them when nothing else is left in it.
    /// Only the folders this plugin creates are removed: anything else found next to them is left alone.
    /// Never throws for a file system error: an uninstallation must not fail because a file is locked.
    /// </summary>
    /// <param name="root">The folder returned by <see cref="GetRoot"/>.</param>
    /// <returns>What was deleted and what could not be.</returns>
    public static DataCleanupResult DeleteAll(string root)
    {
        List<string> deleted = new();
        List<DataCleanupFailure> failed = new();
        if (string.IsNullOrWhiteSpace(root))
        {
            return new DataCleanupResult(deleted, failed);
        }

        foreach (string folder in Folders)
        {
            string path = Path.Combine(root, folder);
            try
            {
                if (Directory.Exists(path))
                {
                    Directory.Delete(path, recursive: true);
                    deleted.Add(path);
                }
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                failed.Add(new DataCleanupFailure(path, ex));
            }
        }

        try
        {
            if (Directory.Exists(root) && Directory.GetFileSystemEntries(root).Length == 0)
            {
                Directory.Delete(root);
                deleted.Add(root);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            failed.Add(new DataCleanupFailure(root, ex));
        }

        return new DataCleanupResult(deleted, failed);
    }
}

/// <summary>
/// Outcome of <see cref="PluginData.DeleteAll"/>.
/// </summary>
/// <param name="Deleted">The folders that were deleted.</param>
/// <param name="Failed">The folders that could not be deleted.</param>
internal sealed record DataCleanupResult(IReadOnlyList<string> Deleted, IReadOnlyList<DataCleanupFailure> Failed);

/// <summary>
/// A folder that could not be deleted.
/// </summary>
/// <param name="Path">The folder.</param>
/// <param name="Error">Why it is still there.</param>
internal sealed record DataCleanupFailure(string Path, Exception Error);
