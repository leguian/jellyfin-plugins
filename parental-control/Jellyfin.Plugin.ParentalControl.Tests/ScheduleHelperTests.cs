using System;
using System.Collections.Generic;
using Jellyfin.Plugin.ParentalControl.Helpers;
using Jellyfin.Plugin.ParentalControl.Models;
using Xunit;

namespace Jellyfin.Plugin.ParentalControl.Tests;

public class ScheduleHelperTests
{
    // 2026-10-20 is a Tuesday.
    private static readonly DateTime Tuesday = new(2026, 10, 20, 0, 0, 0, DateTimeKind.Local);

    private static List<ScheduleWindow> School() =>
    [
        new ScheduleWindow { DayOfWeek = "Weekday", StartHour = 7, EndHour = 8.5 },
        new ScheduleWindow { DayOfWeek = "Weekday", StartHour = 16.5, EndHour = 20 },
        new ScheduleWindow { DayOfWeek = "Weekend", StartHour = 8, EndHour = 20.5 }
    ];

    [Fact]
    public void An_empty_schedule_allows_everything()
    {
        Assert.True(ScheduleHelper.IsAllowed([], Tuesday.AddHours(3)));
        Assert.Null(ScheduleHelper.NextAllowed([], Tuesday.AddHours(3)));
    }

    [Theory]
    [InlineData(6.9, false)]
    [InlineData(7, true)]
    [InlineData(8.5, true)]
    [InlineData(12, false)]
    [InlineData(19.99, true)]
    [InlineData(21, false)]
    public void Both_bounds_are_included_like_jellyfin_does(double hour, bool allowed)
    {
        Assert.Equal(allowed, ScheduleHelper.IsAllowed(School(), Tuesday.AddHours(hour)));
    }

    [Fact]
    public void The_next_window_is_found_the_same_day_or_later()
    {
        Assert.Equal(Tuesday.AddHours(16.5), ScheduleHelper.NextAllowed(School(), Tuesday.AddHours(12)));
        Assert.Equal(Tuesday.AddDays(1).AddHours(7), ScheduleHelper.NextAllowed(School(), Tuesday.AddHours(21)));

        // Friday night: the weekend window of Saturday.
        Assert.Equal(Tuesday.AddDays(4).AddHours(8), ScheduleHelper.NextAllowed(School(), Tuesday.AddDays(3).AddHours(21)));
    }

    [Theory]
    [InlineData("Everyday", DayOfWeek.Sunday, true)]
    [InlineData("Weekday", DayOfWeek.Saturday, false)]
    [InlineData("Weekday", DayOfWeek.Monday, true)]
    [InlineData("Weekend", DayOfWeek.Sunday, true)]
    [InlineData("Tuesday", DayOfWeek.Tuesday, true)]
    [InlineData("Tuesday", DayOfWeek.Wednesday, false)]
    public void Day_values_cover_their_days(string value, DayOfWeek day, bool covered)
    {
        Assert.Equal(covered, ScheduleHelper.Covers(value, day));
    }
}
