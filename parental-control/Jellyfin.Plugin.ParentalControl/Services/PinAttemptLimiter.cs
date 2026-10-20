using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.ParentalControl.Services;

/// <summary>
/// Limits the parent PIN attempts made from each account: a four digit PIN only resists when guessing is slow.
/// After <see cref="MaxFailures"/> failures within <see cref="Window"/>, the account waits <see cref="Lockout"/>.
/// </summary>
public sealed class PinAttemptLimiter
{
    /// <summary>
    /// Failures accepted within the window.
    /// </summary>
    public const int MaxFailures = 5;

    /// <summary>
    /// The window the failures are counted in.
    /// </summary>
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(5);

    /// <summary>
    /// The wait once the failures are used up.
    /// </summary>
    public static readonly TimeSpan Lockout = TimeSpan.FromMinutes(5);

    private readonly object _lock = new();
    private readonly Dictionary<Guid, List<DateTimeOffset>> _failures = new();
    private readonly Dictionary<Guid, DateTimeOffset> _lockedUntil = new();
    private readonly TimeProvider _time;

    /// <summary>
    /// Initializes a new instance of the <see cref="PinAttemptLimiter"/> class.
    /// </summary>
    /// <param name="time">The clock.</param>
    public PinAttemptLimiter(TimeProvider time)
    {
        _time = time;
    }

    /// <summary>
    /// Gets the seconds an account must wait before its next attempt, 0 when it may try now.
    /// </summary>
    /// <param name="account">The account making the attempt.</param>
    /// <returns>The seconds to wait.</returns>
    public int RetryAfterSeconds(Guid account)
    {
        lock (_lock)
        {
            if (_lockedUntil.TryGetValue(account, out DateTimeOffset until))
            {
                TimeSpan left = until - _time.GetUtcNow();
                if (left > TimeSpan.Zero)
                {
                    return (int)Math.Ceiling(left.TotalSeconds);
                }

                _lockedUntil.Remove(account);
            }

            return 0;
        }
    }

    /// <summary>
    /// Records a failed attempt.
    /// </summary>
    /// <param name="account">The account.</param>
    public void RecordFailure(Guid account)
    {
        lock (_lock)
        {
            DateTimeOffset now = _time.GetUtcNow();
            if (!_failures.TryGetValue(account, out List<DateTimeOffset>? list))
            {
                list = new List<DateTimeOffset>();
                _failures[account] = list;
            }

            list.RemoveAll(time => now - time > Window);
            list.Add(now);
            if (list.Count >= MaxFailures)
            {
                _lockedUntil[account] = now + Lockout;
                list.Clear();
            }
        }
    }

    /// <summary>
    /// Records a successful attempt: the failures are forgotten.
    /// </summary>
    /// <param name="account">The account.</param>
    public void RecordSuccess(Guid account)
    {
        lock (_lock)
        {
            _failures.Remove(account);
            _lockedUntil.Remove(account);
        }
    }
}
