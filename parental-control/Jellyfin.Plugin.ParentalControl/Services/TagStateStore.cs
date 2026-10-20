using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.ParentalControl.Services;

/// <summary>
/// Remembers which tags the plugin wrote on which items. Only those are ever removed: a tag that was already on an
/// item (from its metadata or from someone else) stays when a rule or a label stops covering the item.
/// </summary>
public sealed partial class TagStateStore
{
    private readonly object _lock = new();
    private readonly string _path;
    private readonly ILogger<TagStateStore> _logger;
    private TagState? _state;

    /// <summary>
    /// Initializes a new instance of the <see cref="TagStateStore"/> class.
    /// </summary>
    /// <param name="applicationPaths">The application paths.</param>
    /// <param name="logger">The logger.</param>
    public TagStateStore(IApplicationPaths applicationPaths, ILogger<TagStateStore> logger)
        : this(Path.Combine(PluginData.GetRoot(applicationPaths), PluginData.TagsFile), logger)
    {
    }

    /// <summary>
    /// Initializes a new instance of the <see cref="TagStateStore"/> class on a given file. Test seam, invisible to
    /// the dependency injection container.
    /// </summary>
    /// <param name="path">The data file.</param>
    /// <param name="logger">The logger.</param>
    internal TagStateStore(string path, ILogger<TagStateStore> logger)
    {
        _path = path;
        _logger = logger;
    }

    /// <summary>
    /// Gets a copy of the tags written per tag name.
    /// </summary>
    /// <returns>Tag name to item identifiers.</returns>
    public Dictionary<string, HashSet<Guid>> GetApplied()
    {
        lock (_lock)
        {
            Dictionary<string, HashSet<Guid>> copy = new(StringComparer.Ordinal);
            foreach (KeyValuePair<string, List<Guid>> entry in Load().Applied)
            {
                copy[entry.Key] = new HashSet<Guid>(entry.Value);
            }

            return copy;
        }
    }

    /// <summary>
    /// Gets the outcome of the last synchronization.
    /// </summary>
    /// <returns>End time, items changed and error.</returns>
    public (DateTime? LastRunUtc, int LastChanged, string? LastError, int TaggedItems) GetLastRun()
    {
        lock (_lock)
        {
            TagState state = Load();
            HashSet<Guid> items = new();
            foreach (List<Guid> ids in state.Applied.Values)
            {
                items.UnionWith(ids);
            }

            return (state.LastRunUtc, state.LastChanged, state.LastError, items.Count);
        }
    }

    /// <summary>
    /// Saves the tags written and the outcome of a synchronization.
    /// </summary>
    /// <param name="applied">Tag name to item identifiers.</param>
    /// <param name="runUtc">The end of the synchronization.</param>
    /// <param name="changed">How many items were changed.</param>
    /// <param name="error">The error, <c>null</c> on success.</param>
    /// <exception cref="IOException">The file could not be written.</exception>
    public void Save(Dictionary<string, HashSet<Guid>> applied, DateTime runUtc, int changed, string? error)
    {
        ArgumentNullException.ThrowIfNull(applied);
        lock (_lock)
        {
            TagState state = new() { LastRunUtc = runUtc, LastChanged = changed, LastError = error };
            foreach (KeyValuePair<string, HashSet<Guid>> entry in applied)
            {
                if (entry.Value.Count > 0)
                {
                    state.Applied[entry.Key] = new List<Guid>(entry.Value);
                }
            }

            _state = state;
            JsonFile.Write(_path, state);
        }
    }

    private TagState Load()
    {
        if (_state is not null)
        {
            return _state;
        }

        try
        {
            _state = JsonFile.Read<TagState>(_path) ?? new TagState();
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException)
        {
            // Without the record the plugin cannot tell its tags from the others: it keeps every tag it finds
            // (nothing is removed) and starts a new record.
            LogReadFailed(_path, ex);
            _state = new TagState();
        }

        _state.Applied ??= new(StringComparer.Ordinal);
        return _state;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Parental Control: could not read {Path}; tags written before are kept on the items")]
    private partial void LogReadFailed(string path, Exception exception);

    /// <summary>
    /// Content of the data file.
    /// </summary>
    internal sealed class TagState
    {
        /// <summary>
        /// Gets or sets the item identifiers per tag written.
        /// </summary>
        public Dictionary<string, List<Guid>> Applied { get; set; } = new(StringComparer.Ordinal);

        /// <summary>
        /// Gets or sets the end of the last synchronization.
        /// </summary>
        public DateTime? LastRunUtc { get; set; }

        /// <summary>
        /// Gets or sets how many items the last synchronization changed.
        /// </summary>
        public int LastChanged { get; set; }

        /// <summary>
        /// Gets or sets the error of the last synchronization.
        /// </summary>
        public string? LastError { get; set; }
    }
}
