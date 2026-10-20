using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.ParentalControl.Configuration;
using Jellyfin.Plugin.ParentalControl.Helpers;
using Jellyfin.Plugin.ParentalControl.Models;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.ParentalControl.Services;

/// <summary>
/// Keeps the tags of the profiles and of the labels on the library items. The rules are the source of truth; the
/// tags are their projection, which the server enforces in every client. They are written again after a change of
/// the rules, after library changes (a new episode, a new member of a collection, a metadata refresh that dropped
/// them) and once a day by the scheduled task.
/// </summary>
public sealed partial class TagSyncService : IHostedService, IDisposable
{
    /// <summary>
    /// Delay after the last library change: a library scan sends thousands of them.
    /// </summary>
    public static readonly TimeSpan LibraryChangeDelay = TimeSpan.FromSeconds(90);

    /// <summary>
    /// Delay after the server start: the library is still loading.
    /// </summary>
    public static readonly TimeSpan StartupDelay = TimeSpan.FromMinutes(1);

    /// <summary>
    /// Delay after a change of the rules.
    /// </summary>
    public static readonly TimeSpan RulesChangeDelay = TimeSpan.FromSeconds(1);

    // The writes of the plugin raise library events too: they are ignored for this long after a synchronization.
    private static readonly TimeSpan OwnEventsWindow = TimeSpan.FromSeconds(15);

    private readonly ILibraryManager _libraryManager;
    private readonly ContentExpander _expander;
    private readonly TagStateStore _state;
    private readonly ConfigurationSource _configuration;
    private readonly ILogger<TagSyncService> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly Timer _timer;
    private readonly CancellationTokenSource _stopping = new();
    private int _scheduled;
    private int _running;
    private long _ignoreEventsUntilTicks;

    /// <summary>
    /// Initializes a new instance of the <see cref="TagSyncService"/> class.
    /// </summary>
    /// <param name="libraryManager">The library manager.</param>
    /// <param name="expander">The rule expander.</param>
    /// <param name="state">The record of the tags written.</param>
    /// <param name="configuration">The plugin configuration.</param>
    /// <param name="logger">The logger.</param>
    public TagSyncService(ILibraryManager libraryManager, ContentExpander expander, TagStateStore state, ConfigurationSource configuration, ILogger<TagSyncService> logger)
    {
        _libraryManager = libraryManager;
        _expander = expander;
        _state = state;
        _configuration = configuration;
        _logger = logger;
        _timer = new Timer(OnTimer, null, Timeout.Infinite, Timeout.Infinite);
    }

    /// <summary>
    /// Gets the state of the synchronization.
    /// </summary>
    /// <returns>The status.</returns>
    public SyncStatus GetStatus()
    {
        var (lastRun, changed, error, tagged) = _state.GetLastRun();
        return new SyncStatus
        {
            Running = Volatile.Read(ref _running) == 1 || Volatile.Read(ref _scheduled) == 1,
            LastRunUtc = lastRun,
            LastChanged = changed,
            LastError = error,
            TaggedItems = tagged
        };
    }

    /// <summary>
    /// Asks for a synchronization after a delay; a new request before it runs postpones it.
    /// </summary>
    /// <param name="delay">The delay.</param>
    public void RequestSync(TimeSpan delay)
    {
        Volatile.Write(ref _scheduled, 1);
        try
        {
            _timer.Change(delay, Timeout.InfiniteTimeSpan);
        }
        catch (ObjectDisposedException)
        {
            // The server is stopping.
        }
    }

    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
        _libraryManager.ItemAdded += OnLibraryChanged;
        _libraryManager.ItemUpdated += OnLibraryChanged;
        RequestSync(StartupDelay);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken)
    {
        _libraryManager.ItemAdded -= OnLibraryChanged;
        _libraryManager.ItemUpdated -= OnLibraryChanged;
        _timer.Change(Timeout.Infinite, Timeout.Infinite);
        _stopping.Cancel();
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public void Dispose()
    {
        _timer.Dispose();
        _gate.Dispose();
        _stopping.Dispose();
    }

    /// <summary>
    /// Brings the tags of the items in line with the rules. One synchronization at a time.
    /// </summary>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <param name="progress">Receives the progress, 0 to 100.</param>
    /// <returns>The number of items changed.</returns>
    public async Task<int> SyncAsync(CancellationToken cancellationToken, IProgress<double>? progress = null)
    {
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        Volatile.Write(ref _running, 1);
        Volatile.Write(ref _scheduled, 0);
        try
        {
            return await RunAsync(cancellationToken, progress).ConfigureAwait(false);
        }
        finally
        {
            Interlocked.Exchange(ref _ignoreEventsUntilTicks, (DateTime.UtcNow + OwnEventsWindow).Ticks);
            Volatile.Write(ref _running, 0);
            _gate.Release();
        }
    }

    /// <summary>
    /// Computes, for each tag the plugin manages, the items that must carry it.
    /// </summary>
    /// <param name="config">The configuration.</param>
    /// <returns>Tag name to item identifiers.</returns>
    internal Dictionary<string, HashSet<Guid>> ComputeDesired(PluginConfiguration config)
    {
        Dictionary<string, HashSet<Guid>> desired = new(StringComparer.Ordinal);
        foreach (ContentLabel label in config.Labels)
        {
            desired[label.Name] = ExpandAll(label.Targets);
        }

        foreach (ControlledProfile profile in config.Profiles.Where(profile => profile.Enabled && TagNames.IsValidKey(profile.TagKey)))
        {
            desired[TagNames.Hidden(profile.TagKey)] = ExpandAll(profile.Hidden);
            if (profile.Mode == ContentMode.AllowList)
            {
                desired[TagNames.Allowed(profile.TagKey)] = ExpandAll(profile.Allowed);
            }
        }

        return desired;
    }

    /// <summary>
    /// Plans the tag changes: adds the missing tags, removes the ones the plugin wrote that are no longer wanted,
    /// never touches a tag the plugin did not write.
    /// </summary>
    /// <param name="desired">Tag name to the items that must carry it.</param>
    /// <param name="applied">Tag name to the items the plugin wrote it on.</param>
    /// <param name="tagsOf">Gives the current tags of an item, <c>null</c> when the item is gone.</param>
    /// <param name="newApplied">The record after the changes.</param>
    /// <returns>Item identifier to its new tags, for the items that change.</returns>
    internal static Dictionary<Guid, string[]> Plan(
        IReadOnlyDictionary<string, HashSet<Guid>> desired,
        IReadOnlyDictionary<string, HashSet<Guid>> applied,
        Func<Guid, string[]?> tagsOf,
        out Dictionary<string, HashSet<Guid>> newApplied)
    {
        Dictionary<Guid, List<string>> working = new();
        Dictionary<Guid, string[]?> original = new();
        newApplied = new Dictionary<string, HashSet<Guid>>(StringComparer.Ordinal);

        List<string>? Tags(Guid id)
        {
            if (working.TryGetValue(id, out List<string>? tags))
            {
                return tags;
            }

            if (!original.TryGetValue(id, out string[]? current))
            {
                current = tagsOf(id);
                original[id] = current;
            }

            if (current is null)
            {
                return null;
            }

            tags = new List<string>(current);
            working[id] = tags;
            return tags;
        }

        foreach (string tag in desired.Keys.Concat(applied.Keys).Distinct(StringComparer.Ordinal))
        {
            string folded = TagNames.Fold(tag);
            HashSet<Guid> want = desired.GetValueOrDefault(tag) ?? [];
            HashSet<Guid> had = applied.GetValueOrDefault(tag) ?? [];
            HashSet<Guid> record = new();

            foreach (Guid id in want)
            {
                List<string>? tags = Tags(id);
                if (tags is null)
                {
                    continue;
                }

                if (tags.Any(existing => string.Equals(TagNames.Fold(existing), folded, StringComparison.Ordinal)))
                {
                    // Ours when we wrote it; otherwise it was there before and is never ours to remove.
                    if (had.Contains(id))
                    {
                        record.Add(id);
                    }
                }
                else
                {
                    tags.Add(tag);
                    record.Add(id);
                }
            }

            foreach (Guid id in had.Where(id => !want.Contains(id)))
            {
                Tags(id)?.RemoveAll(existing => string.Equals(TagNames.Fold(existing), folded, StringComparison.Ordinal));
            }

            newApplied[tag] = record;
        }

        Dictionary<Guid, string[]> changes = new();
        foreach (KeyValuePair<Guid, List<string>> entry in working)
        {
            string[] before = original[entry.Key] ?? [];
            if (!before.SequenceEqual(entry.Value, StringComparer.Ordinal))
            {
                changes[entry.Key] = entry.Value.ToArray();
            }
        }

        return changes;
    }

    private HashSet<Guid> ExpandAll(IEnumerable<ContentRule> rules)
    {
        HashSet<Guid> ids = new();
        foreach (ContentRule rule in rules)
        {
            _expander.Expand(rule, ids);
        }

        return ids;
    }

    private async Task<int> RunAsync(CancellationToken cancellationToken, IProgress<double>? progress)
    {
        PluginConfiguration config = _configuration.Current;
        Dictionary<string, HashSet<Guid>> applied = _state.GetApplied();
        if (config.Labels.Count == 0 && config.Profiles.Count == 0 && applied.Count == 0)
        {
            progress?.Report(100);
            return 0;
        }

        Dictionary<string, HashSet<Guid>> desired = ComputeDesired(config);
        Dictionary<Guid, string[]> changes = Plan(desired, applied, id => _libraryManager.GetItemById(id) is BaseItem item ? item.Tags ?? [] : null, out Dictionary<string, HashSet<Guid>> newApplied);
        progress?.Report(10);

        HashSet<Guid> failed = new();
        int done = 0;
        string? error = null;
        foreach (KeyValuePair<Guid, string[]> change in changes)
        {
            cancellationToken.ThrowIfCancellationRequested();
            BaseItem? item = _libraryManager.GetItemById(change.Key);
            if (item is null)
            {
                continue;
            }

            string[] previous = item.Tags;
            try
            {
                item.Tags = change.Value;
                await item.UpdateToRepositoryAsync(ItemUpdateType.MetadataEdit, cancellationToken).ConfigureAwait(false);
            }
#pragma warning disable CA1031 // One item that cannot be saved must not stop the others: it is retried next time.
            catch (Exception ex) when (ex is not OperationCanceledException)
#pragma warning restore CA1031
            {
                item.Tags = previous;
                failed.Add(change.Key);
                error = ex.Message;
                LogItemFailed(item.Name, change.Key, ex);
            }

            done++;
            progress?.Report(10 + (90.0 * done / changes.Count));
        }

        if (failed.Count > 0)
        {
            // The record follows what is really on the items: a failed item keeps what it had.
            foreach (KeyValuePair<string, HashSet<Guid>> entry in newApplied)
            {
                HashSet<Guid> had = applied.GetValueOrDefault(entry.Key) ?? [];
                foreach (Guid id in failed)
                {
                    if (had.Contains(id))
                    {
                        entry.Value.Add(id);
                    }
                    else
                    {
                        entry.Value.Remove(id);
                    }
                }
            }
        }

        try
        {
            _state.Save(newApplied, DateTime.UtcNow, changes.Count - failed.Count, failed.Count == 0 ? null : error);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            LogStateNotSaved(ex);
        }

        LogSynced(changes.Count - failed.Count, failed.Count);
        progress?.Report(100);
        return changes.Count - failed.Count;
    }

    private void OnLibraryChanged(object? sender, ItemChangeEventArgs e)
    {
        if (Volatile.Read(ref _running) == 1 || DateTime.UtcNow.Ticks < Interlocked.Read(ref _ignoreEventsUntilTicks))
        {
            return;
        }

        PluginConfiguration config = _configuration.Current;
        if (config.Labels.Count == 0 && config.Profiles.Count == 0)
        {
            return;
        }

        RequestSync(LibraryChangeDelay);
    }

    private void OnTimer(object? state)
    {
        _ = RunFromTimerAsync();
    }

    private async Task RunFromTimerAsync()
    {
        try
        {
            await SyncAsync(_stopping.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // The server is stopping.
        }
#pragma warning disable CA1031 // A timer callback has nobody to report to: the failure is logged, the daily task tries again.
        catch (Exception ex)
#pragma warning restore CA1031
        {
            LogSyncFailed(ex);
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Parental Control: tags synchronized, {Changed} item(s) changed, {Failed} failed")]
    private partial void LogSynced(int changed, int failed);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Parental Control: could not save the tags of {Name} ({Id}), retried at the next synchronization")]
    private partial void LogItemFailed(string name, Guid id, Exception exception);

    [LoggerMessage(Level = LogLevel.Error, Message = "Parental Control: could not record the tags written")]
    private partial void LogStateNotSaved(Exception exception);

    [LoggerMessage(Level = LogLevel.Error, Message = "Parental Control: tag synchronization failed")]
    private partial void LogSyncFailed(Exception exception);
}
