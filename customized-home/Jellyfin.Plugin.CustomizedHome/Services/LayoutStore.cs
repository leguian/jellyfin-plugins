using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Jellyfin.Plugin.CustomizedHome.Helpers;
using Jellyfin.Plugin.CustomizedHome.Models;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.CustomizedHome.Services;

/// <summary>
/// Persists per-user layouts as JSON files in the plugin configuration folder.
/// </summary>
public sealed partial class LayoutStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly object _lock = new();
    private readonly Dictionary<Guid, HomeLayout?> _cache = new();
    private readonly string _directory;
    private readonly ILogger<LayoutStore> _logger;
    private readonly Func<string, Stream> _openRead;
    private readonly Action<string> _deleteFile;

    /// <summary>
    /// Initializes a new instance of the <see cref="LayoutStore"/> class.
    /// </summary>
    /// <param name="applicationPaths">The application paths.</param>
    /// <param name="logger">The logger.</param>
    public LayoutStore(IApplicationPaths applicationPaths, ILogger<LayoutStore> logger)
        : this(applicationPaths, logger, File.OpenRead)
    {
    }

    /// <summary>
    /// Initializes a new instance of the <see cref="LayoutStore"/> class with its own way of opening files.
    /// Test seam: a locked file or a denied access cannot be produced the same way on every platform. Being
    /// internal, this constructor is invisible to the dependency injection container.
    /// </summary>
    /// <param name="applicationPaths">The application paths.</param>
    /// <param name="logger">The logger.</param>
    /// <param name="openRead">Opens a file for reading.</param>
    /// <param name="deleteFile">Deletes a file; the file system does when omitted.</param>
    internal LayoutStore(IApplicationPaths applicationPaths, ILogger<LayoutStore> logger, Func<string, Stream> openRead, Action<string>? deleteFile = null)
    {
        ArgumentNullException.ThrowIfNull(applicationPaths);
        _directory = Path.Combine(PluginData.GetRoot(applicationPaths), PluginData.UsersFolder);
        _logger = logger;
        _openRead = openRead;
        _deleteFile = deleteFile ?? File.Delete;
    }

    /// <summary>
    /// Gets the layout saved by a user, or <c>null</c> when the user has none.
    /// </summary>
    /// <param name="userId">The user identifier.</param>
    /// <returns>The layout or <c>null</c>.</returns>
    public HomeLayout? Get(Guid userId)
    {
        lock (_lock)
        {
            if (_cache.TryGetValue(userId, out HomeLayout? cached))
            {
                return cached;
            }

            HomeLayout? layout = null;
            string path = GetPath(userId);
            if (File.Exists(path))
            {
                try
                {
                    using Stream stream = _openRead(path);

                    // A file is not a request: it may be edited by hand or come from an older version. Normalizing
                    // it gives the rest of the plugin the guarantees a saved layout has (no null list, known values).
                    layout = LayoutValidator.Normalize(JsonSerializer.Deserialize<HomeLayout>(stream, JsonOptions), out string? error);
                    if (layout is null)
                    {
                        LogInvalidLayout(path, error);
                    }
                }
                catch (JsonException ex)
                {
                    // The file itself is broken: it stays so until the user saves again.
                    LogUnreadableLayout(path, ex);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    // The file may be fine (locked by a backup, permissions being fixed): remembering "no layout"
                    // would hide it until the next restart. The next request tries again.
                    LogUnreadableLayout(path, ex);
                    return null;
                }
            }

            _cache[userId] = layout;
            return layout;
        }
    }

    /// <summary>
    /// Saves the layout of a user.
    /// </summary>
    /// <param name="userId">The user identifier.</param>
    /// <param name="layout">The layout to save.</param>
    /// <exception cref="IOException">The file could not be written: the previous layout, if any, is still there.</exception>
    public void Save(Guid userId, HomeLayout layout)
    {
        ArgumentNullException.ThrowIfNull(layout);

        lock (_lock)
        {
            Directory.CreateDirectory(_directory);
            string path = GetPath(userId);
            string temp = path + ".tmp";
            using (FileStream stream = File.Create(temp))
            {
                JsonSerializer.Serialize(stream, layout, JsonOptions);
            }

            File.Move(temp, path, overwrite: true);
            _cache[userId] = layout;
        }
    }

    /// <summary>
    /// Deletes the layout of a user.
    /// </summary>
    /// <param name="userId">The user identifier.</param>
    /// <returns><c>true</c> when a layout existed.</returns>
    /// <exception cref="IOException">The file could not be deleted: the layout is still there.</exception>
    public bool Delete(Guid userId)
    {
        lock (_lock)
        {
            string path = GetPath(userId);
            bool existed = File.Exists(path);
            if (existed)
            {
                _deleteFile(path);
            }

            // Forgotten once the file is gone: after a deletion that failed, the instance keeps answering what is
            // on disk instead of "no layout" until the next restart brings the layout back.
            _cache[userId] = null;
            return existed;
        }
    }

    /// <summary>
    /// Lists every stored layout, whoever it belongs to.
    /// </summary>
    /// <returns>The stored layouts summary.</returns>
    public IReadOnlyList<StoredLayoutInfo> List()
    {
        return List(static _ => true);
    }

    /// <summary>
    /// Lists the stored layouts of the users that still exist. The layout of a deleted user is removed when the
    /// server announces the deletion; a file that outlived its user (deleted while the plugin was not running, or
    /// before it cleaned up) is of no use to an administrator and is left out.
    /// </summary>
    /// <param name="userExists">Tells whether a user identifier is one of a current user.</param>
    /// <returns>The stored layouts summary.</returns>
    public IReadOnlyList<StoredLayoutInfo> List(Func<Guid, bool> userExists)
    {
        ArgumentNullException.ThrowIfNull(userExists);

        List<StoredLayoutInfo> result = new();
        string[] files;
        try
        {
            files = Directory.GetFiles(_directory, "*.json");
        }
        catch (DirectoryNotFoundException)
        {
            // Nothing was saved yet, or the folder was removed meanwhile. Checking first that it exists would
            // leave a moment for it to disappear before it is read.
            return result;
        }

        // The store is not locked while the caller is asked about a user: that question may reach the database.
        foreach (string file in files)
        {
            string name = Path.GetFileNameWithoutExtension(file);
            if (!Guid.TryParse(name, out Guid userId) || !userExists(userId))
            {
                continue;
            }

            HomeLayout? layout = Get(userId);
            if (layout is null)
            {
                continue;
            }

            int sections = 0;
            int folders = 0;
            foreach (LayoutItem item in layout.Items)
            {
                if (string.Equals(item.Type, LayoutItemTypes.Folder, StringComparison.OrdinalIgnoreCase))
                {
                    folders++;
                    sections += item.Items.Count;
                }
                else
                {
                    sections++;
                }
            }

            result.Add(new StoredLayoutInfo
            {
                UserId = userId,
                ModifiedUtc = File.GetLastWriteTimeUtc(file),
                SectionCount = sections,
                FolderCount = folders
            });
        }

        return result;
    }

    /// <summary>
    /// Deletes the layout files whose user no longer exists. The layout of a deleted user is removed when the
    /// server announces the deletion, but a user deleted before that was written, or while the plugin was not
    /// running, leaves a file holding their section labels that nothing lists and nobody can reset any more.
    /// Never throws: a file that cannot be deleted stays where it is and is tried again at the next start.
    /// </summary>
    /// <param name="userExists">Tells whether a user identifier is one of a current user.</param>
    /// <returns>The number of deleted files.</returns>
    public int PurgeOrphans(Func<Guid, bool> userExists)
    {
        ArgumentNullException.ThrowIfNull(userExists);

        string[] files;
        try
        {
            files = Directory.GetFiles(_directory, "*.json");
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // DirectoryNotFoundException included: nothing was saved yet, or the folder went away meanwhile.
            return 0;
        }

        int deleted = 0;
        foreach (string file in files)
        {
            // Anything that is not named after a user identifier was not written by this store: left alone.
            string name = Path.GetFileNameWithoutExtension(file);
            if (!Guid.TryParse(name, out Guid userId) || userId == Guid.Empty)
            {
                continue;
            }

            bool exists;
            try
            {
                // The store is not locked while the caller is asked about a user: that question may reach the
                // database, and whatever it throws must not stop the server from starting.
                exists = userExists(userId);
            }
#pragma warning disable CA1031 // The user manager decides what it throws: an unanswered question keeps the file.
            catch (Exception ex)
#pragma warning restore CA1031
            {
                LogOrphanNotChecked(userId, ex);
                continue;
            }

            if (exists)
            {
                continue;
            }

            try
            {
                Delete(userId);
                deleted++;
                LogOrphanDeleted(userId);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                LogOrphanNotDeleted(userId, ex);
            }
        }

        return deleted;
    }

    private string GetPath(Guid userId)
    {
        return Path.Combine(_directory, userId.ToString("N", CultureInfo.InvariantCulture) + ".json");
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Customized Home: could not read layout file {Path}, ignoring it")]
    private partial void LogUnreadableLayout(string path, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Customized Home: layout file {Path} holds no valid layout, ignoring it: {Error}")]
    private partial void LogInvalidLayout(string path, string? error);

    [LoggerMessage(Level = LogLevel.Information, Message = "Customized Home: deleted the home layout left behind by the deleted user {UserId}")]
    private partial void LogOrphanDeleted(Guid userId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Customized Home: could not delete the home layout left behind by the deleted user {UserId}, it is kept and tried again at the next start")]
    private partial void LogOrphanNotDeleted(Guid userId, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Customized Home: could not tell whether user {UserId} still exists, their layout file is kept")]
    private partial void LogOrphanNotChecked(Guid userId, Exception exception);
}

/// <summary>
/// Summary of a stored user layout.
/// </summary>
public class StoredLayoutInfo
{
    /// <summary>
    /// Gets or sets the user identifier.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// Gets or sets the user name (filled by the API layer).
    /// </summary>
    public string? UserName { get; set; }

    /// <summary>
    /// Gets or sets the last modification time.
    /// </summary>
    public DateTime ModifiedUtc { get; set; }

    /// <summary>
    /// Gets or sets the number of sections in the layout.
    /// </summary>
    public int SectionCount { get; set; }

    /// <summary>
    /// Gets or sets the number of folders in the layout.
    /// </summary>
    public int FolderCount { get; set; }
}
