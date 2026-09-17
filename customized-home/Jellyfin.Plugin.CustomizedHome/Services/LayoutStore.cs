using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
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

    /// <summary>
    /// Initializes a new instance of the <see cref="LayoutStore"/> class.
    /// </summary>
    /// <param name="applicationPaths">The application paths.</param>
    /// <param name="logger">The logger.</param>
    public LayoutStore(IApplicationPaths applicationPaths, ILogger<LayoutStore> logger)
    {
        ArgumentNullException.ThrowIfNull(applicationPaths);
        _directory = Path.Combine(applicationPaths.PluginConfigurationsPath, typeof(Plugin).Namespace!, "users");
        _logger = logger;
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
                    using FileStream stream = File.OpenRead(path);
                    layout = JsonSerializer.Deserialize<HomeLayout>(stream, JsonOptions);
                }
                catch (JsonException ex)
                {
                    LogUnreadableLayout(path, ex);
                }
                catch (IOException ex)
                {
                    LogUnreadableLayout(path, ex);
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
    public bool Delete(Guid userId)
    {
        lock (_lock)
        {
            _cache[userId] = null;
            string path = GetPath(userId);
            if (!File.Exists(path))
            {
                return false;
            }

            File.Delete(path);
            return true;
        }
    }

    /// <summary>
    /// Lists the users that saved a layout.
    /// </summary>
    /// <returns>The stored layouts summary.</returns>
    public IReadOnlyList<StoredLayoutInfo> List()
    {
        List<StoredLayoutInfo> result = new();
        lock (_lock)
        {
            if (!Directory.Exists(_directory))
            {
                return result;
            }

            foreach (string file in Directory.EnumerateFiles(_directory, "*.json"))
            {
                string name = Path.GetFileNameWithoutExtension(file);
                if (!Guid.TryParse(name, out Guid userId))
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
        }

        return result;
    }

    private string GetPath(Guid userId)
    {
        return Path.Combine(_directory, userId.ToString("N", CultureInfo.InvariantCulture) + ".json");
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Customized Home: could not read layout file {Path}, ignoring it")]
    private partial void LogUnreadableLayout(string path, Exception exception);
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
