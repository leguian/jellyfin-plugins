using System;
using System.IO;
using System.Threading.Tasks;
using Jellyfin.Data.Events.Users;
using MediaBrowser.Controller.Events;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.CustomizedHome.Services;

/// <summary>
/// Deletes the layout of a user when the server deletes that user: the file holds their section labels and
/// would otherwise stay on disk for good.
/// The server publishes the deletion through its event manager, which resolves every registered
/// <see cref="IEventConsumer{T}"/> (IUserManager has no "user deleted" event in Jellyfin 10.11 and 12).
/// </summary>
public sealed partial class UserDeletedConsumer : IEventConsumer<UserDeletedEventArgs>
{
    private readonly LayoutStore _store;
    private readonly ILogger<UserDeletedConsumer> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="UserDeletedConsumer"/> class.
    /// </summary>
    /// <param name="store">The layout store.</param>
    /// <param name="logger">The logger.</param>
    public UserDeletedConsumer(LayoutStore store, ILogger<UserDeletedConsumer> logger)
    {
        _store = store;
        _logger = logger;
    }

    /// <inheritdoc />
    public Task OnEvent(UserDeletedEventArgs eventArgs)
    {
        ArgumentNullException.ThrowIfNull(eventArgs);

        Guid userId = eventArgs.Argument.Id;
        try
        {
            if (_store.Delete(userId))
            {
                LogLayoutDeleted(userId);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // The user is gone whatever happens here. The file is no longer listed, and an administrator
            // can still remove it through DELETE /CustomizedHome/Layout?userId=.
            LogLayoutNotDeleted(userId, ex);
        }

        return Task.CompletedTask;
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Customized Home: deleted the home layout of the deleted user {UserId}")]
    private partial void LogLayoutDeleted(Guid userId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Customized Home: could not delete the home layout of the deleted user {UserId}")]
    private partial void LogLayoutNotDeleted(Guid userId, Exception exception);
}
