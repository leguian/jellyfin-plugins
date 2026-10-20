using System;
using System.Threading.Tasks;
using Jellyfin.Data.Events.Users;
using MediaBrowser.Controller.Events;

namespace Jellyfin.Plugin.ParentalControl.Services;

/// <summary>
/// Forgets the profile and the screen time of a deleted user.
/// </summary>
public class UserDeletedConsumer : IEventConsumer<UserDeletedEventArgs>
{
    private readonly ProfileService _profiles;
    private readonly UsageStore _usage;
    private readonly TimeProvider _time;

    /// <summary>
    /// Initializes a new instance of the <see cref="UserDeletedConsumer"/> class.
    /// </summary>
    /// <param name="profiles">The profile service.</param>
    /// <param name="usage">The usage store.</param>
    /// <param name="time">The clock.</param>
    public UserDeletedConsumer(ProfileService profiles, UsageStore usage, TimeProvider time)
    {
        _profiles = profiles;
        _usage = usage;
        _time = time;
    }

    /// <inheritdoc />
    public async Task OnEvent(UserDeletedEventArgs eventArgs)
    {
        ArgumentNullException.ThrowIfNull(eventArgs);
        Guid userId = eventArgs.Argument.Id;
        await _profiles.ForgetUserAsync(userId).ConfigureAwait(false);
        _usage.Remove(userId);
        _usage.Flush(_time.GetLocalNow().DateTime);
    }
}
