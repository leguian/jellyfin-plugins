using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.ParentalControl.Configuration;
using Jellyfin.Plugin.ParentalControl.Models;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Session;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.ParentalControl.Services;

/// <summary>
/// Counts the playback time of the controlled users and enforces their daily limit on every client: a message
/// warns a few minutes before the end, then the playback is stopped with a message, and a new playback is
/// stopped as soon as it starts. Clients that cannot be remote controlled cannot be stopped; the web client also
/// shows its own screen (parental-control.js).
/// </summary>
public sealed partial class ScreenTimeService : IHostedService, IDisposable
{
    /// <summary>
    /// How often the playing sessions are counted.
    /// </summary>
    public static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(15);

    /// <summary>
    /// A session that has not reported its playback for this long is not counted (closed player, lost network).
    /// </summary>
    public static readonly TimeSpan StaleSession = TimeSpan.FromMinutes(3);

    // A player that ignores the stop command is not sent the same message over and over.
    private static readonly TimeSpan EnforceInterval = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan FlushInterval = TimeSpan.FromMinutes(1);
    private const long MessageTimeoutMs = 15000;
    private const int ReportDays = 7;
    private const int ReportHistory = 30;

    private readonly ISessionManager _sessionManager;
    private readonly ILibraryManager _libraryManager;
    private readonly UsageStore _usage;
    private readonly ConfigurationSource _configuration;
    private readonly IServerConfigurationManager _serverConfiguration;
    private readonly TimeProvider _time;
    private readonly ILogger<ScreenTimeService> _logger;
    private readonly ConcurrentDictionary<string, HistoryEntry> _playing = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, DateTimeOffset> _enforced = new(StringComparer.Ordinal);
    private readonly object _tickLock = new();
    private CancellationTokenSource? _cts;
    private DateTimeOffset _lastTick;
    private DateTimeOffset _lastFlush;

    /// <summary>
    /// Initializes a new instance of the <see cref="ScreenTimeService"/> class.
    /// </summary>
    /// <param name="sessionManager">The session manager.</param>
    /// <param name="libraryManager">The library manager.</param>
    /// <param name="usage">The usage store.</param>
    /// <param name="configuration">The plugin configuration.</param>
    /// <param name="serverConfiguration">The server configuration (language of the messages).</param>
    /// <param name="time">The clock.</param>
    /// <param name="logger">The logger.</param>
    public ScreenTimeService(ISessionManager sessionManager, ILibraryManager libraryManager, UsageStore usage, ConfigurationSource configuration, IServerConfigurationManager serverConfiguration, TimeProvider time, ILogger<ScreenTimeService> logger)
    {
        _sessionManager = sessionManager;
        _libraryManager = libraryManager;
        _usage = usage;
        _configuration = configuration;
        _serverConfiguration = serverConfiguration;
        _time = time;
        _logger = logger;
        _lastTick = time.GetUtcNow();
        _lastFlush = _lastTick;
    }

    /// <summary>
    /// Gets the screen time of today for a profile.
    /// </summary>
    /// <param name="profile">The profile.</param>
    /// <returns>Today's usage.</returns>
    public UsageToday GetToday(ControlledProfile profile)
    {
        ArgumentNullException.ThrowIfNull(profile);
        DateTime now = _time.GetLocalNow().DateTime;
        string day = UsageStore.DayKey(now);
        return Compute(profile.ScreenTime, now.DayOfWeek, _usage.GetSeconds(profile.UserId, day), _usage.GetBonus(profile.UserId, day));
    }

    /// <summary>
    /// Gets the screen time of the last days and the recent playback of a user.
    /// </summary>
    /// <param name="profile">The profile; <c>null</c> for a user without profile (empty report).</param>
    /// <param name="userId">The user.</param>
    /// <returns>The report.</returns>
    public UsageReport GetReport(ControlledProfile? profile, Guid userId)
    {
        DateTime now = _time.GetLocalNow().DateTime;
        ScreenTimeSettings settings = profile?.ScreenTime ?? new ScreenTimeSettings();
        return new UsageReport
        {
            Today = profile is null ? new UsageToday() : GetToday(profile),
            Days = _usage.GetDays(userId, now, ReportDays)
                .Select(entry => new DayUsage
                {
                    Date = UsageStore.DayKey(entry.Day),
                    Seconds = entry.Seconds,
                    LimitMinutes = settings.Enabled ? settings.DailyLimitMinutes[(int)entry.Day.DayOfWeek] : ScreenTimeSettings.Unlimited
                })
                .ToList(),
            History = _usage.GetHistory(userId, ReportHistory).ToList()
        };
    }

    /// <summary>
    /// Grants extra minutes for today.
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <param name="minutes">The minutes, negative to take back.</param>
    /// <returns>The extra minutes of today.</returns>
    public int AddBonus(Guid userId, int minutes)
    {
        int total = _usage.AddBonus(userId, UsageStore.DayKey(_time.GetLocalNow().DateTime), minutes);
        _usage.Flush(_time.GetLocalNow().DateTime);
        return total;
    }

    /// <summary>
    /// Computes the usage of a day.
    /// </summary>
    /// <param name="settings">The screen time settings.</param>
    /// <param name="day">The day of the week.</param>
    /// <param name="usedSeconds">The playback time of the day.</param>
    /// <param name="bonusMinutes">The extra minutes of the day.</param>
    /// <returns>The usage.</returns>
    public static UsageToday Compute(ScreenTimeSettings settings, DayOfWeek day, int usedSeconds, int bonusMinutes)
    {
        ArgumentNullException.ThrowIfNull(settings);
        int limit = settings.Enabled && settings.DailyLimitMinutes.Length == 7 ? settings.DailyLimitMinutes[(int)day] : ScreenTimeSettings.Unlimited;
        UsageToday today = new()
        {
            Enabled = settings.Enabled,
            UsedSeconds = usedSeconds,
            LimitMinutes = limit,
            BonusMinutes = bonusMinutes
        };
        if (limit != ScreenTimeSettings.Unlimited)
        {
            int remaining = ((limit + bonusMinutes) * 60) - usedSeconds;
            today.RemainingSeconds = Math.Max(0, remaining);
            today.Exhausted = remaining <= 0;
        }

        return today;
    }

    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
        _sessionManager.PlaybackStart += OnPlaybackStart;
        _sessionManager.PlaybackStopped += OnPlaybackStopped;
        _cts = new CancellationTokenSource();
        CancellationToken token = _cts.Token;
        _ = Task.Run(() => LoopAsync(token), token);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken)
    {
        _sessionManager.PlaybackStart -= OnPlaybackStart;
        _sessionManager.PlaybackStopped -= OnPlaybackStopped;
        _cts?.Cancel();
        _usage.Flush(_time.GetLocalNow().DateTime);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public void Dispose()
    {
        _cts?.Dispose();
    }

    /// <summary>
    /// Counts the time elapsed since the previous tick for every controlled user with a playing session, then
    /// enforces the limits. Called every <see cref="TickInterval"/>; public for the tests.
    /// </summary>
    /// <returns>The task.</returns>
    public async Task TickAsync()
    {
        DateTimeOffset now = _time.GetUtcNow();
        List<(SessionInfo Session, ControlledProfile Profile)> playing;
        int elapsed;
        lock (_tickLock)
        {
            // Capped: after a pause of the server (sleep, debugger) the gap is not playback.
            elapsed = (int)Math.Clamp((now - _lastTick).TotalSeconds, 0, TickInterval.TotalSeconds * 2);
            _lastTick = now;
            playing = PlayingSessions(now.UtcDateTime);
        }

        DateTime local = _time.GetLocalNow().DateTime;
        string day = UsageStore.DayKey(local);
        foreach (IGrouping<Guid, (SessionInfo Session, ControlledProfile Profile)> user in playing.GroupBy(entry => entry.Profile.UserId))
        {
            // Two screens at once count once: the limit is about the child, not the devices.
            (SessionInfo first, ControlledProfile profile) = user.First();
            _usage.AddSeconds(user.Key, day, elapsed, EntryFor(first, profile));
            await EnforceAsync(profile, user.Select(entry => entry.Session).ToList(), local).ConfigureAwait(false);
        }

        if (now - _lastFlush >= FlushInterval)
        {
            _lastFlush = now;
            _usage.Flush(local);
        }
    }

    private List<(SessionInfo Session, ControlledProfile Profile)> PlayingSessions(DateTime nowUtc)
    {
        PluginConfiguration config = _configuration.Current;
        List<(SessionInfo, ControlledProfile)> result = new();
        foreach (SessionInfo session in _sessionManager.Sessions)
        {
            if (session.NowPlayingItem is null || session.PlayState is null || session.PlayState.IsPaused || session.UserId == Guid.Empty)
            {
                continue;
            }

            if (nowUtc - session.LastPlaybackCheckIn > StaleSession)
            {
                continue;
            }

            ControlledProfile? profile = config.Profiles.FirstOrDefault(candidate => candidate.UserId == session.UserId && candidate.Enabled);
            if (profile is not null)
            {
                result.Add((session, profile));
            }
        }

        return result;
    }

    private HistoryEntry? EntryFor(SessionInfo session, ControlledProfile profile)
    {
        if (session.NowPlayingItem is null)
        {
            return null;
        }

        string key = session.Id + "|" + session.NowPlayingItem.Id.ToString("N");
        if (_playing.TryGetValue(key, out HistoryEntry? entry))
        {
            return entry;
        }

        // Playback that started before the server (or the plugin) did: the history starts now.
        entry = StartHistory(profile.UserId, session.NowPlayingItem.Id, session.DeviceName);
        _playing[key] = entry;
        return entry;
    }

    private HistoryEntry StartHistory(Guid userId, Guid itemId, string? deviceName)
    {
        var item = _libraryManager.GetItemById(itemId);
        HistoryEntry entry = new()
        {
            ItemId = itemId,
            Name = item?.Name ?? string.Empty,
            SeriesName = (item as Episode)?.SeriesName,
            ItemType = item?.GetBaseItemKind().ToString(),
            DeviceName = deviceName,
            StartedUtc = _time.GetUtcNow().UtcDateTime
        };
        return _usage.StartPlayback(userId, entry, entry.StartedUtc);
    }

    private async Task EnforceAsync(ControlledProfile profile, IReadOnlyList<SessionInfo> sessions, DateTime local)
    {
        if (!profile.ScreenTime.Enabled)
        {
            return;
        }

        string day = UsageStore.DayKey(local);
        UsageToday today = Compute(profile.ScreenTime, local.DayOfWeek, _usage.GetSeconds(profile.UserId, day), _usage.GetBonus(profile.UserId, day));
        if (today.RemainingSeconds is not int remaining)
        {
            return;
        }

        Messages text = Messages.For(Language());
        if (today.Exhausted)
        {
            foreach (SessionInfo session in sessions)
            {
                await StopAsync(session, text).ConfigureAwait(false);
            }

            return;
        }

        int warning = profile.ScreenTime.WarningMinutes * 60;
        if (warning > 0 && remaining <= warning && _usage.MarkWarned(profile.UserId, day))
        {
            int minutes = Math.Max(1, (int)Math.Ceiling(remaining / 60.0));
            foreach (SessionInfo session in sessions)
            {
                await SendAsync(session, text.WarningHeader, string.Format(System.Globalization.CultureInfo.InvariantCulture, text.WarningText, minutes), stop: false).ConfigureAwait(false);
            }
        }
    }

    private async Task StopAsync(SessionInfo session, Messages text)
    {
        DateTimeOffset now = _time.GetUtcNow();
        if (_enforced.TryGetValue(session.Id, out DateTimeOffset last) && now - last < EnforceInterval)
        {
            return;
        }

        _enforced[session.Id] = now;
        LogLimitReached(session.UserName, session.DeviceName);
        await SendAsync(session, text.EndHeader, text.EndText, stop: true).ConfigureAwait(false);
    }

    private async Task SendAsync(SessionInfo session, string header, string body, bool stop)
    {
        try
        {
            await _sessionManager.SendMessageCommand(string.Empty, session.Id, new MessageCommand { Header = header, Text = body, TimeoutMs = MessageTimeoutMs }, CancellationToken.None).ConfigureAwait(false);
        }
#pragma warning disable CA1031 // A player that cannot show messages is still stopped below.
        catch (Exception ex)
#pragma warning restore CA1031
        {
            LogCommandFailed("message", session.DeviceName, ex);
        }

        if (!stop)
        {
            return;
        }

        try
        {
            await _sessionManager.SendPlaystateCommand(string.Empty, session.Id, new PlaystateRequest { Command = PlaystateCommand.Stop }, CancellationToken.None).ConfigureAwait(false);
        }
#pragma warning disable CA1031 // Some players cannot be remote controlled: nothing more the server can do.
        catch (Exception ex)
#pragma warning restore CA1031
        {
            LogCommandFailed("stop", session.DeviceName, ex);
        }
    }

    private string Language()
    {
        string setting = _configuration.Current.MessageLanguage;
        if (!string.Equals(setting, "auto", StringComparison.OrdinalIgnoreCase))
        {
            return setting;
        }

        return _serverConfiguration.Configuration.UICulture ?? "en";
    }

    private void OnPlaybackStart(object? sender, PlaybackProgressEventArgs e)
    {
        if (e.Session is null || e.Item is null)
        {
            return;
        }

        ControlledProfile? profile = _configuration.Current.Profiles.FirstOrDefault(candidate => candidate.UserId == e.Session.UserId && candidate.Enabled);
        if (profile is null)
        {
            return;
        }

        _playing[e.Session.Id + "|" + e.Item.Id.ToString("N")] = StartHistory(profile.UserId, e.Item.Id, e.Session.DeviceName);
        _ = EnforceOnStartAsync(profile, e.Session);
    }

    private async Task EnforceOnStartAsync(ControlledProfile profile, SessionInfo session)
    {
        try
        {
            // A new playback after the end of the time is stopped at once, not at the next tick.
            _enforced.TryRemove(session.Id, out _);
            await EnforceAsync(profile, [session], _time.GetLocalNow().DateTime).ConfigureAwait(false);
        }
#pragma warning disable CA1031 // Event handler: nobody to report to.
        catch (Exception ex)
#pragma warning restore CA1031
        {
            LogCommandFailed("enforce", session.DeviceName, ex);
        }
    }

    private void OnPlaybackStopped(object? sender, PlaybackStopEventArgs e)
    {
        if (e.Session is not null && e.Item is not null)
        {
            _playing.TryRemove(e.Session.Id + "|" + e.Item.Id.ToString("N"), out _);
        }
    }

    private async Task LoopAsync(CancellationToken token)
    {
        using PeriodicTimer timer = new(TickInterval, _time);
        try
        {
            while (await timer.WaitForNextTickAsync(token).ConfigureAwait(false))
            {
                try
                {
                    await TickAsync().ConfigureAwait(false);
                }
#pragma warning disable CA1031 // One failed tick must not end the counting for good.
                catch (Exception ex)
#pragma warning restore CA1031
                {
                    LogTickFailed(ex);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // The server is stopping.
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Parental Control: screen time of {User} used up, playback stopped on {Device}")]
    private partial void LogLimitReached(string? user, string? device);

    [LoggerMessage(Level = LogLevel.Debug, Message = "Parental Control: could not send the {Command} command to {Device}")]
    private partial void LogCommandFailed(string command, string? device, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Parental Control: screen time tick failed")]
    private partial void LogTickFailed(Exception exception);

    /// <summary>
    /// The texts sent to the players, in the server language.
    /// </summary>
    private sealed record Messages(string WarningHeader, string WarningText, string EndHeader, string EndText)
    {
        private static readonly Messages English = new(
            "Screen time",
            "{0} minute(s) of screen time left today.",
            "Screen time is over",
            "That is all for today. See you tomorrow!");

        private static readonly Messages French = new(
            "Temps d'écran",
            "Plus que {0} minute(s) d'écran aujourd'hui.",
            "Temps d'écran terminé",
            "C'est fini pour aujourd'hui. À demain !");

        public static Messages For(string language)
        {
            return language.StartsWith("fr", StringComparison.OrdinalIgnoreCase) ? French : English;
        }
    }
}
