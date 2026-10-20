using System;
using Jellyfin.Plugin.ParentalControl.Helpers;
using Jellyfin.Plugin.ParentalControl.Services;
using Xunit;

namespace Jellyfin.Plugin.ParentalControl.Tests;

public class PinTests
{
    [Theory]
    [InlineData("1234", true)]
    [InlineData("12345678", true)]
    [InlineData("123", false)]
    [InlineData("123456789", false)]
    [InlineData("12a4", false)]
    [InlineData("１２３４", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void Pins_have_four_to_eight_ascii_digits(string? pin, bool valid)
    {
        Assert.Equal(valid, PinHasher.IsWellFormed(pin));
    }

    [Fact]
    public void A_hash_accepts_its_pin_and_nothing_else()
    {
        (string hash, string salt) = PinHasher.Hash("2468");

        Assert.True(PinHasher.Verify("2468", hash, salt, PinHasher.Iterations));
        Assert.False(PinHasher.Verify("2469", hash, salt, PinHasher.Iterations));
        Assert.False(PinHasher.Verify("2468", hash, salt, PinHasher.Iterations - 1));
        Assert.DoesNotContain("2468", hash, StringComparison.Ordinal);
    }

    [Fact]
    public void The_same_pin_hashes_differently_each_time()
    {
        Assert.NotEqual(PinHasher.Hash("1111").Hash, PinHasher.Hash("1111").Hash);
    }

    [Theory]
    [InlineData(null, "c2FsdA==")]
    [InlineData("not base64!", "c2FsdA==")]
    [InlineData("aGFzaA==", null)]
    public void A_missing_or_broken_hash_accepts_nothing(string? hash, string? salt)
    {
        Assert.False(PinHasher.Verify("1234", hash, salt, PinHasher.Iterations));
    }

    [Fact]
    public void Five_failures_lock_the_account_for_five_minutes()
    {
        ManualTimeProvider time = new(DateTimeOffset.Parse("2026-10-20T10:00:00Z", System.Globalization.CultureInfo.InvariantCulture));
        PinAttemptLimiter limiter = new(time);
        Guid kid = Guid.NewGuid();
        Guid other = Guid.NewGuid();

        for (int i = 0; i < PinAttemptLimiter.MaxFailures - 1; i++)
        {
            limiter.RecordFailure(kid);
            Assert.Equal(0, limiter.RetryAfterSeconds(kid));
        }

        limiter.RecordFailure(kid);
        Assert.Equal(300, limiter.RetryAfterSeconds(kid));
        Assert.Equal(0, limiter.RetryAfterSeconds(other));

        time.Advance(TimeSpan.FromMinutes(4));
        Assert.Equal(60, limiter.RetryAfterSeconds(kid));
        time.Advance(TimeSpan.FromMinutes(1));
        Assert.Equal(0, limiter.RetryAfterSeconds(kid));
    }

    [Fact]
    public void Failures_spread_over_time_do_not_add_up()
    {
        ManualTimeProvider time = new(DateTimeOffset.UnixEpoch);
        PinAttemptLimiter limiter = new(time);
        Guid kid = Guid.NewGuid();

        for (int i = 0; i < 10; i++)
        {
            limiter.RecordFailure(kid);
            time.Advance(TimeSpan.FromMinutes(2));
        }

        Assert.Equal(0, limiter.RetryAfterSeconds(kid));
    }

    [Fact]
    public void A_success_forgets_the_failures()
    {
        ManualTimeProvider time = new(DateTimeOffset.UnixEpoch);
        PinAttemptLimiter limiter = new(time);
        Guid kid = Guid.NewGuid();
        for (int i = 0; i < PinAttemptLimiter.MaxFailures - 1; i++)
        {
            limiter.RecordFailure(kid);
        }

        limiter.RecordSuccess(kid);
        limiter.RecordFailure(kid);

        Assert.Equal(0, limiter.RetryAfterSeconds(kid));
    }
}
