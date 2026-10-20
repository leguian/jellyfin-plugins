using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using Jellyfin.Plugin.ParentalControl.Models;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.ParentalControl.Services;

/// <summary>
/// Screen time per day, extra time granted and recent playback of the controlled users. Kept in memory and written
/// to disk at most once a minute (and when the server stops): it changes every few seconds during playback.
/// </summary>
public sealed partial class UsageStore
{
    /// <summary>
    /// How many days of screen time are kept.
    /// </summary>
    public const int RetainedDays = 35;

    /// <summary>
    /// How many playback entries are kept per user.
    /// </summary>
    public const int RetainedHistory = 100;

    /// <summary>
    /// A playback of the same item resumed within this delay continues the previous entry.
    /// </summary>
    public static readonly TimeSpan ResumeWindow = TimeSpan.FromMinutes(30);

    private const string DayFormat = "yyyy-MM-dd";

    private readonly object _lock = new();
    private readonly string _path;
    private readonly ILogger<UsageStore> _logger;
    private UsageData? _data;
    private bool _dirty;

    /// <summary>
    /// Initializes a new instance of the <see cref="UsageStore"/> class.
    /// </summary>
    /// <param name="applicationPaths">The application paths.</param>
    /// <param name="logger">The logger.</param>
    public UsageStore(IApplicationPaths applicationPaths, ILogger<UsageStore> logger)
        : this(Path.Combine(PluginData.GetRoot(applicationPaths), PluginData.UsageFile), logger)
    {
    }

    /// <summary>
    /// Initializes a new instance of the <see cref="UsageStore"/> class on a given file. Test seam, invisible to the
    /// dependency injection container.
    /// </summary>
    /// <param name="path">The data file.</param>
    /// <param name="logger">The logger.</param>
    internal UsageStore(string path, ILogger<UsageStore> logger)
    {
        _path = path;
        _logger = logger;
    }

    /// <summary>
    /// Gets the key of a day.
    /// </summary>
    /// <param name="localDate">A moment in server local time.</param>
    /// <returns>The day key (yyyy-MM-dd).</returns>
    public static string DayKey(DateTime localDate)
    {
        return localDate.ToString(DayFormat, CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// Gets the playback time of a user on a day.
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <param name="day">The day key.</param>
    /// <returns>The time in seconds.</returns>
    public int GetSeconds(Guid userId, string day)
    {
        lock (_lock)
        {
            return Find(userId)?.Days.GetValueOrDefault(day) ?? 0;
        }
    }

    /// <summary>
    /// Gets the extra minutes granted to a user on a day.
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <param name="day">The day key.</param>
    /// <returns>The minutes.</returns>
    public int GetBonus(Guid userId, string day)
    {
        lock (_lock)
        {
            return Find(userId)?.Bonus.GetValueOrDefault(day) ?? 0;
        }
    }

    /// <summary>
    /// Adds extra minutes for a day; the total never goes below zero.
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <param name="day">The day key.</param>
    /// <param name="minutes">The minutes, negative to take back.</param>
    /// <returns>The new total of the day.</returns>
    public int AddBonus(Guid userId, string day, int minutes)
    {
        lock (_lock)
        {
            UserUsage usage = Get(userId);
            int total = Math.Max(0, usage.Bonus.GetValueOrDefault(day) + minutes);
            usage.Bonus[day] = total;

            // A warning already given would never come again for the new end.
            if (minutes > 0 && string.Equals(usage.WarnedDay, day, StringComparison.Ordinal))
            {
                usage.WarnedDay = null;
            }

            _dirty = true;
            return total;
        }
    }

    /// <summary>
    /// Adds playback time to a day and to a history entry.
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <param name="day">The day key.</param>
    /// <param name="seconds">The time to add.</param>
    /// <param name="entry">The history entry of the playback, if any.</param>
    /// <returns>The new total of the day.</returns>
    public int AddSeconds(Guid userId, string day, int seconds, HistoryEntry? entry)
    {
        lock (_lock)
        {
            UserUsage usage = Get(userId);
            int total = usage.Days.GetValueOrDefault(day) + Math.Max(0, seconds);
            usage.Days[day] = total;
            if (entry is not null)
            {
                entry.Seconds += Math.Max(0, seconds);
            }

            _dirty = true;
            return total;
        }
    }

    /// <summary>
    /// Records that a warning was given on a day.
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <param name="day">The day key.</param>
    /// <returns><c>true</c> the first time of the day, <c>false</c> when it was already given.</returns>
    public bool MarkWarned(Guid userId, string day)
    {
        lock (_lock)
        {
            UserUsage usage = Get(userId);
            if (string.Equals(usage.WarnedDay, day, StringComparison.Ordinal))
            {
                return false;
            }

            usage.WarnedDay = day;
            _dirty = true;
            return true;
        }
    }

    /// <summary>
    /// Starts a history entry, or continues the latest one when the same item is resumed shortly after.
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <param name="entry">The new entry.</param>
    /// <param name="now">The current time.</param>
    /// <returns>The entry to add the playback time to.</returns>
    public HistoryEntry StartPlayback(Guid userId, HistoryEntry entry, DateTime now)
    {
        ArgumentNullException.ThrowIfNull(entry);
        lock (_lock)
        {
            UserUsage usage = Get(userId);
            HistoryEntry? latest = usage.History.FirstOrDefault();
            if (latest is not null && latest.ItemId == entry.ItemId && now - latest.StartedUtc.AddSeconds(latest.Seconds) < ResumeWindow)
            {
                return latest;
            }

            usage.History.Insert(0, entry);
            if (usage.History.Count > RetainedHistory)
            {
                usage.History.RemoveRange(RetainedHistory, usage.History.Count - RetainedHistory);
            }

            _dirty = true;
            return entry;
        }
    }

    /// <summary>
    /// Gets the playback time of the last days, oldest first.
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <param name="today">Today, in server local time.</param>
    /// <param name="count">The number of days.</param>
    /// <returns>The days and their time in seconds.</returns>
    public IReadOnlyList<(DateTime Day, int Seconds)> GetDays(Guid userId, DateTime today, int count)
    {
        lock (_lock)
        {
            UserUsage? usage = Find(userId);
            List<(DateTime, int)> days = new();
            for (int offset = count - 1; offset >= 0; offset--)
            {
                DateTime day = today.Date.AddDays(-offset);
                days.Add((day, usage?.Days.GetValueOrDefault(DayKey(day)) ?? 0));
            }

            return days;
        }
    }

    /// <summary>
    /// Gets the recent playback of a user, newest first (copies).
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <param name="count">The most entries returned.</param>
    /// <returns>The entries.</returns>
    public IReadOnlyList<HistoryEntry> GetHistory(Guid userId, int count)
    {
        lock (_lock)
        {
            return (Find(userId)?.History ?? [])
                .Take(count)
                .Select(entry => new HistoryEntry
                {
                    ItemId = entry.ItemId,
                    Name = entry.Name,
                    SeriesName = entry.SeriesName,
                    ItemType = entry.ItemType,
                    DeviceName = entry.DeviceName,
                    StartedUtc = entry.StartedUtc,
                    Seconds = entry.Seconds
                })
                .ToList();
        }
    }

    /// <summary>
    /// Forgets everything about a user.
    /// </summary>
    /// <param name="userId">The user.</param>
    public void Remove(Guid userId)
    {
        lock (_lock)
        {
            if (Load().Users.Remove(userId))
            {
                _dirty = true;
            }
        }
    }

    /// <summary>
    /// Writes the data to disk when it changed, dropping the days older than <see cref="RetainedDays"/>.
    /// </summary>
    /// <param name="today">Today, in server local time.</param>
    public void Flush(DateTime today)
    {
        lock (_lock)
        {
            if (!_dirty || _data is null)
            {
                return;
            }

            string oldest = DayKey(today.Date.AddDays(-RetainedDays));
            foreach (UserUsage usage in _data.Users.Values)
            {
                foreach (string day in usage.Days.Keys.Where(day => string.CompareOrdinal(day, oldest) < 0).ToList())
                {
                    usage.Days.Remove(day);
                }

                foreach (string day in usage.Bonus.Keys.Where(day => string.CompareOrdinal(day, oldest) < 0).ToList())
                {
                    usage.Bonus.Remove(day);
                }
            }

            try
            {
                JsonFile.Write(_path, _data);
                _dirty = false;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // Kept in memory and dirty: the next flush tries again.
                LogWriteFailed(_path, ex);
            }
        }
    }

    private UserUsage? Find(Guid userId)
    {
        return Load().Users.GetValueOrDefault(userId);
    }

    private UserUsage Get(Guid userId)
    {
        UsageData data = Load();
        if (!data.Users.TryGetValue(userId, out UserUsage? usage))
        {
            usage = new UserUsage();
            data.Users[userId] = usage;
        }

        return usage;
    }

    private UsageData Load()
    {
        if (_data is not null)
        {
            return _data;
        }

        try
        {
            _data = JsonFile.Read<UsageData>(_path) ?? new UsageData();
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException)
        {
            // Screen time restarts from zero rather than blocking playback: the broken file is overwritten on the next flush.
            LogReadFailed(_path, ex);
            _data = new UsageData();
        }

        foreach (UserUsage usage in _data.Users.Values)
        {
            usage.Days ??= new();
            usage.Bonus ??= new();
            usage.History ??= new();
        }

        return _data;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Parental Control: could not read {Path}, screen time starts again from zero")]
    private partial void LogReadFailed(string path, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Parental Control: could not write {Path}, the next attempt is in a minute")]
    private partial void LogWriteFailed(string path, Exception exception);

    /// <summary>
    /// Content of the data file.
    /// </summary>
    internal sealed class UsageData
    {
        /// <summary>
        /// Gets or sets the data of each user.
        /// </summary>
        public Dictionary<Guid, UserUsage> Users { get; set; } = new();
    }

    /// <summary>
    /// The data of one user.
    /// </summary>
    internal sealed class UserUsage
    {
        /// <summary>
        /// Gets or sets the playback seconds per day.
        /// </summary>
        public Dictionary<string, int> Days { get; set; } = new();

        /// <summary>
        /// Gets or sets the extra minutes per day.
        /// </summary>
        public Dictionary<string, int> Bonus { get; set; } = new();

        /// <summary>
        /// Gets or sets the day the end-of-time warning was given.
        /// </summary>
        public string? WarnedDay { get; set; }

        /// <summary>
        /// Gets or sets the recent playback, newest first.
        /// </summary>
        public List<HistoryEntry> History { get; set; } = new();
    }
}
