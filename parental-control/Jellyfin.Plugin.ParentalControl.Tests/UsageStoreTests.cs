using System;
using System.IO;
using Jellyfin.Plugin.ParentalControl.Models;
using Jellyfin.Plugin.ParentalControl.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Jellyfin.Plugin.ParentalControl.Tests;

public sealed class UsageStoreTests : IDisposable
{
    private static readonly DateTime Today = new(2026, 10, 20, 15, 0, 0);
    private readonly TempFolder _folder = new();

    public void Dispose() => _folder.Dispose();

    private UsageStore Create() => new(_folder.File("usage.json"), NullLogger<UsageStore>.Instance);

    [Fact]
    public void Time_and_bonus_survive_a_restart()
    {
        Guid kid = Guid.NewGuid();
        string day = UsageStore.DayKey(Today);
        UsageStore store = Create();
        store.AddSeconds(kid, day, 90, null);
        store.AddSeconds(kid, day, 30, null);
        store.AddBonus(kid, day, 15);
        store.Flush(Today);

        UsageStore again = Create();

        Assert.Equal(120, again.GetSeconds(kid, day));
        Assert.Equal(15, again.GetBonus(kid, day));
    }

    [Fact]
    public void The_bonus_never_goes_below_zero()
    {
        UsageStore store = Create();
        Guid kid = Guid.NewGuid();

        Assert.Equal(0, store.AddBonus(kid, "2026-10-20", -30));
        Assert.Equal(10, store.AddBonus(kid, "2026-10-20", 10));
    }

    [Fact]
    public void The_warning_is_given_once_a_day_and_again_after_extra_time()
    {
        UsageStore store = Create();
        Guid kid = Guid.NewGuid();

        Assert.True(store.MarkWarned(kid, "2026-10-20"));
        Assert.False(store.MarkWarned(kid, "2026-10-20"));
        Assert.True(store.MarkWarned(kid, "2026-10-21"));

        store.AddBonus(kid, "2026-10-21", 15);
        Assert.True(store.MarkWarned(kid, "2026-10-21"));
    }

    [Fact]
    public void Resuming_the_same_item_shortly_after_continues_its_entry()
    {
        UsageStore store = Create();
        Guid kid = Guid.NewGuid();
        Guid movie = Guid.NewGuid();
        DateTime start = Today.ToUniversalTime();

        HistoryEntry first = store.StartPlayback(kid, new HistoryEntry { ItemId = movie, StartedUtc = start }, start);
        store.AddSeconds(kid, "d", 600, first);
        HistoryEntry resumed = store.StartPlayback(kid, new HistoryEntry { ItemId = movie, StartedUtc = start.AddMinutes(20) }, start.AddMinutes(20));
        HistoryEntry later = store.StartPlayback(kid, new HistoryEntry { ItemId = movie, StartedUtc = start.AddHours(3) }, start.AddHours(3));

        Assert.Same(first, resumed);
        Assert.NotSame(first, later);
        Assert.Equal(2, store.GetHistory(kid, 10).Count);
        Assert.Equal(600, store.GetHistory(kid, 10)[1].Seconds);
    }

    [Fact]
    public void History_and_days_are_bounded()
    {
        UsageStore store = Create();
        Guid kid = Guid.NewGuid();
        for (int i = 0; i < UsageStore.RetainedHistory + 20; i++)
        {
            store.StartPlayback(kid, new HistoryEntry { ItemId = Guid.NewGuid(), StartedUtc = Today }, Today);
        }

        store.AddSeconds(kid, UsageStore.DayKey(Today.AddDays(-UsageStore.RetainedDays - 1)), 60, null);
        store.AddSeconds(kid, UsageStore.DayKey(Today), 60, null);
        store.Flush(Today);
        UsageStore again = Create();

        Assert.Equal(UsageStore.RetainedHistory, again.GetHistory(kid, 1000).Count);
        Assert.Equal(0, again.GetSeconds(kid, UsageStore.DayKey(Today.AddDays(-UsageStore.RetainedDays - 1))));
        Assert.Equal(60, again.GetSeconds(kid, UsageStore.DayKey(Today)));
    }

    [Fact]
    public void Days_are_listed_oldest_first_with_zeros()
    {
        UsageStore store = Create();
        Guid kid = Guid.NewGuid();
        store.AddSeconds(kid, UsageStore.DayKey(Today.AddDays(-1)), 42, null);

        var days = store.GetDays(kid, Today, 3);

        Assert.Equal([0, 42, 0], [days[0].Seconds, days[1].Seconds, days[2].Seconds]);
        Assert.Equal(Today.Date, days[2].Day);
    }

    [Fact]
    public void A_broken_file_starts_from_zero_instead_of_failing()
    {
        File.WriteAllText(_folder.File("usage.json"), "{ not json");

        UsageStore store = Create();

        Assert.Equal(0, store.GetSeconds(Guid.NewGuid(), "2026-10-20"));
    }

    [Fact]
    public void A_deleted_user_is_forgotten()
    {
        UsageStore store = Create();
        Guid kid = Guid.NewGuid();
        store.AddSeconds(kid, "2026-10-20", 60, null);

        store.Remove(kid);

        Assert.Equal(0, store.GetSeconds(kid, "2026-10-20"));
    }
}
