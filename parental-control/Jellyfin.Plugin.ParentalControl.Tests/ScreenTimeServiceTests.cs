using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.ParentalControl.Configuration;
using Jellyfin.Plugin.ParentalControl.Models;
using Jellyfin.Plugin.ParentalControl.Services;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Configuration;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Session;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Jellyfin.Plugin.ParentalControl.Tests;

public sealed class ScreenTimeServiceTests : IDisposable
{
    private static readonly DateTimeOffset Start = new(2026, 10, 20, 15, 0, 0, TimeSpan.Zero);
    private readonly TempFolder _folder = new();
    private readonly ManualTimeProvider _time = new(Start);
    private readonly Mock<ISessionManager> _sessions = new();
    private readonly List<SessionInfo> _active = new();
    private readonly List<string> _commands = new();
    private readonly Guid _kid = Guid.NewGuid();
    private readonly UsageStore _usage;
    private readonly PluginConfiguration _config = new();

    public ScreenTimeServiceTests()
    {
        _usage = new UsageStore(_folder.File("usage.json"), NullLogger<UsageStore>.Instance);
        _sessions.SetupGet(manager => manager.Sessions).Returns(_active);
        _sessions.Setup(manager => manager.SendMessageCommand(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<MessageCommand>(), It.IsAny<CancellationToken>()))
            .Callback<string, string, MessageCommand, CancellationToken>((_, session, command, _) => _commands.Add(session + ":message:" + command.Header))
            .Returns(Task.CompletedTask);
        _sessions.Setup(manager => manager.SendPlaystateCommand(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<PlaystateRequest>(), It.IsAny<CancellationToken>()))
            .Callback<string, string, PlaystateRequest, CancellationToken>((_, session, request, _) => _commands.Add(session + ":" + request.Command))
            .Returns(Task.CompletedTask);
        _config.Profiles.Add(new ControlledProfile
        {
            UserId = _kid,
            TagKey = "tim",
            ScreenTime = new ScreenTimeSettings { Enabled = true, DailyLimitMinutes = [10, 10, 10, 10, 10, 10, 10], WarningMinutes = 2 }
        });
    }

    public void Dispose() => _folder.Dispose();

    private ScreenTimeService Create(string uiCulture = "fr")
    {
        Mock<IServerConfigurationManager> server = new();
        server.SetupGet(manager => manager.Configuration).Returns(new ServerConfiguration { UICulture = uiCulture });
        return new ScreenTimeService(_sessions.Object, Mock.Of<ILibraryManager>(), _usage, new MemoryConfiguration(_config).Source, server.Object, _time, NullLogger<ScreenTimeService>.Instance);
    }

    private SessionInfo Play(string id, bool paused = false, Guid? user = null)
    {
        SessionInfo session = new(_sessions.Object, NullLogger.Instance)
        {
            Id = id,
            UserId = user ?? _kid,
            DeviceName = "TV " + id,
            NowPlayingItem = new BaseItemDto { Id = Guid.NewGuid(), Name = "Bluey" },
            PlayState = new PlayerStateInfo { IsPaused = paused },
            LastPlaybackCheckIn = _time.GetUtcNow().UtcDateTime
        };
        _active.Add(session);
        return session;
    }

    private int UsedToday() => _usage.GetSeconds(_kid, UsageStore.DayKey(_time.GetLocalNow().DateTime));

    private async Task Tick(ScreenTimeService service, int seconds)
    {
        _time.Advance(TimeSpan.FromSeconds(seconds));
        foreach (SessionInfo session in _active)
        {
            session.LastPlaybackCheckIn = _time.GetUtcNow().UtcDateTime;
        }

        await service.TickAsync();
    }

    [Theory]
    [InlineData(-1, 0, 5000, null, false)]
    [InlineData(60, 0, 3000, 600, false)]
    [InlineData(60, 15, 3600, 900, false)]
    [InlineData(60, 0, 3600, 0, true)]
    [InlineData(0, 0, 0, 0, true)]
    public void The_day_is_computed_from_the_limit_the_bonus_and_the_use(int limit, int bonus, int used, int? remaining, bool exhausted)
    {
        ScreenTimeSettings settings = new() { Enabled = true, DailyLimitMinutes = [limit, limit, limit, limit, limit, limit, limit] };

        UsageToday today = ScreenTimeService.Compute(settings, DayOfWeek.Monday, used, bonus);

        Assert.Equal(remaining, today.RemainingSeconds);
        Assert.Equal(exhausted, today.Exhausted);
    }

    [Fact]
    public void A_disabled_limit_never_runs_out()
    {
        UsageToday today = ScreenTimeService.Compute(new ScreenTimeSettings { Enabled = false, DailyLimitMinutes = [0, 0, 0, 0, 0, 0, 0] }, DayOfWeek.Monday, 99999, 0);

        Assert.False(today.Exhausted);
        Assert.Null(today.RemainingSeconds);
    }

    [Fact]
    public async Task Playing_time_is_counted_paused_time_is_not()
    {
        ScreenTimeService service = Create();
        SessionInfo session = Play("a");

        await Tick(service, 15);
        session.PlayState.IsPaused = true;
        await Tick(service, 15);

        Assert.Equal(15, UsedToday());
    }

    [Fact]
    public async Task Two_screens_at_once_count_once()
    {
        ScreenTimeService service = Create();
        Play("a");
        Play("b");

        await Tick(service, 15);

        Assert.Equal(15, UsedToday());
    }

    [Fact]
    public async Task A_long_gap_between_ticks_is_not_counted_as_playback()
    {
        ScreenTimeService service = Create();
        Play("a");

        await Tick(service, 3600);

        Assert.Equal((int)(ScreenTimeService.TickInterval.TotalSeconds * 2), UsedToday());
    }

    [Fact]
    public async Task Users_without_an_enabled_profile_are_not_counted()
    {
        ScreenTimeService service = Create();
        Play("a", user: Guid.NewGuid());

        await Tick(service, 15);

        Assert.Empty(_commands);
        Assert.Equal(0, UsedToday());
    }

    [Fact]
    public async Task The_warning_comes_once_then_the_playback_is_stopped_at_the_end()
    {
        ScreenTimeService service = Create();
        _usage.AddSeconds(_kid, UsageStore.DayKey(_time.GetLocalNow().DateTime), (8 * 60) - 10, null);
        Play("a");

        await Tick(service, 15);
        await Tick(service, 15);
        Assert.Equal(["a:message:Temps d'écran"], _commands);

        _usage.AddSeconds(_kid, UsageStore.DayKey(_time.GetLocalNow().DateTime), 120, null);
        await Tick(service, 15);
        Assert.Equal(["a:message:Temps d'écran", "a:message:Temps d'écran terminé", "a:Stop"], _commands);

        // A player that ignores the stop is not flooded.
        await Tick(service, 15);
        Assert.Equal(3, _commands.Count);
        await Tick(service, 30);
        Assert.Equal(5, _commands.Count);
    }

    [Fact]
    public async Task Messages_follow_the_server_language()
    {
        ScreenTimeService service = Create("en-US");
        _usage.AddSeconds(_kid, UsageStore.DayKey(_time.GetLocalNow().DateTime), 600, null);
        Play("a");

        await Tick(service, 15);

        Assert.Contains("a:message:Screen time is over", _commands);
    }

    [Fact]
    public void Extra_time_is_added_to_today()
    {
        ScreenTimeService service = Create();

        service.AddBonus(_kid, 15);

        Assert.Equal(15, service.GetToday(_config.Profiles[0]).BonusMinutes);
        Assert.Equal(25 * 60, service.GetToday(_config.Profiles[0]).RemainingSeconds);
    }
}
