using System;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.CustomizedHome.Services;

/// <summary>
/// Removes, once per server start, the layout files whose user no longer exists.
/// <see cref="UserDeletedConsumer"/> handles the deletions the server announces while the plugin runs; this
/// covers the rest: users deleted before that consumer existed, or while the plugin was disabled or uninstalled.
/// It runs here rather than in the administration endpoints because those are requested on every visit of the
/// configuration page, and a purge belongs neither in a listing nor in a request an administrator waits on.
/// </summary>
public sealed partial class OrphanLayoutCleanupService : IHostedService
{
    private readonly LayoutStore _store;
    private readonly IUserManager _userManager;
    private readonly ILogger<OrphanLayoutCleanupService> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="OrphanLayoutCleanupService"/> class.
    /// </summary>
    /// <param name="store">The layout store.</param>
    /// <param name="userManager">The user manager.</param>
    /// <param name="logger">The logger.</param>
    public OrphanLayoutCleanupService(LayoutStore store, IUserManager userManager, ILogger<OrphanLayoutCleanupService> logger)
    {
        _store = store;
        _userManager = userManager;
        _logger = logger;
    }

    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
        // Off the startup path: the users may not be loaded yet, and one lookup per stored layout is a database
        // query on Jellyfin 12. Nothing waits for the result.
        _ = Task.Run(Purge, CancellationToken.None);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken)
    {
        return Task.CompletedTask;
    }

    /// <summary>
    /// Runs the purge and reports what it removed. Never throws: nothing here is worth failing a start for.
    /// </summary>
    /// <returns>The number of deleted files.</returns>
    internal int Purge()
    {
        try
        {
            int deleted = _store.PurgeOrphans(UserExists);
            if (deleted > 0)
            {
                LogPurged(deleted);
            }

            return deleted;
        }
#pragma warning disable CA1031 // Startup task: whatever the store or the user manager throws, the server goes on.
        catch (Exception ex)
#pragma warning restore CA1031
        {
            LogPurgeFailed(ex);
            return 0;
        }
    }

    private bool UserExists(Guid userId)
    {
        // The user manager refuses the empty identifier with an exception.
        return userId != Guid.Empty && _userManager.GetUserById(userId) is not null;
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Customized Home: removed {Count} home layout(s) left behind by deleted users")]
    private partial void LogPurged(int count);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Customized Home: the cleanup of the layouts of deleted users could not run")]
    private partial void LogPurgeFailed(Exception exception);
}
