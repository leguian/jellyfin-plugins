using System;
using System.Collections.Generic;
using System.Linq;
using Jellyfin.Plugin.ParentalControl.Models;

namespace Jellyfin.Plugin.ParentalControl.Helpers;

/// <summary>
/// Reads an access schedule the way Jellyfin applies it (server local time, both bounds included).
/// </summary>
public static class ScheduleHelper
{
    private const int DaysToSearch = 8;

    /// <summary>
    /// Tells whether a schedule allows a moment. An empty schedule allows everything.
    /// </summary>
    /// <param name="windows">The schedule.</param>
    /// <param name="localTime">The moment, in server local time.</param>
    /// <returns><c>true</c> when allowed.</returns>
    public static bool IsAllowed(IReadOnlyCollection<ScheduleWindow> windows, DateTime localTime)
    {
        ArgumentNullException.ThrowIfNull(windows);
        if (windows.Count == 0)
        {
            return true;
        }

        double hour = localTime.TimeOfDay.TotalHours;
        return windows.Any(window => Covers(window.DayOfWeek, localTime.DayOfWeek) && hour >= window.StartHour && hour <= window.EndHour);
    }

    /// <summary>
    /// Finds the next start of an allowed window after a moment that is not allowed.
    /// </summary>
    /// <param name="windows">The schedule.</param>
    /// <param name="localTime">The moment, in server local time.</param>
    /// <returns>The start, or <c>null</c> when the schedule never allows anything.</returns>
    public static DateTime? NextAllowed(IReadOnlyCollection<ScheduleWindow> windows, DateTime localTime)
    {
        ArgumentNullException.ThrowIfNull(windows);
        DateTime? best = null;
        for (int offset = 0; offset < DaysToSearch; offset++)
        {
            DateTime day = localTime.Date.AddDays(offset);
            foreach (ScheduleWindow window in windows.Where(window => Covers(window.DayOfWeek, day.DayOfWeek)))
            {
                DateTime start = day.AddHours(window.StartHour);
                if (start > localTime && (best is null || start < best))
                {
                    best = start;
                }
            }

            if (best is not null)
            {
                return best;
            }
        }

        return best;
    }

    /// <summary>
    /// Tells whether a schedule day value covers a day of the week.
    /// </summary>
    /// <param name="value">Sunday ... Saturday, Everyday, Weekday or Weekend.</param>
    /// <param name="day">The day.</param>
    /// <returns><c>true</c> when covered.</returns>
    public static bool Covers(string value, DayOfWeek day)
    {
        bool weekend = day is DayOfWeek.Saturday or DayOfWeek.Sunday;
        return value switch
        {
            "Everyday" => true,
            "Weekday" => !weekend,
            "Weekend" => weekend,
            _ => string.Equals(value, day.ToString(), StringComparison.OrdinalIgnoreCase)
        };
    }
}
