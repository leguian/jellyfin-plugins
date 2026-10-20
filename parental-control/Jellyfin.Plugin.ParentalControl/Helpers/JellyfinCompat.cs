using System.Collections.Generic;
using System.Threading.Tasks;
using Jellyfin.Database.Implementations.Entities;
using MediaBrowser.Controller.Library;

namespace Jellyfin.Plugin.ParentalControl.Helpers;

/// <summary>
/// The server APIs whose shape differs between Jellyfin 10.11 and 12 (JELLYFIN_12 is defined by the project file).
/// </summary>
internal static class JellyfinCompat
{
    /// <summary>
    /// Lists every user of the server.
    /// </summary>
    /// <param name="userManager">The user manager.</param>
    /// <returns>The users.</returns>
    public static IEnumerable<User> GetUsers(IUserManager userManager)
    {
#if JELLYFIN_12
        return userManager.GetUsers();
#else
        return userManager.Users;
#endif
    }

    /// <summary>
    /// Sets the password of a user.
    /// </summary>
    /// <param name="userManager">The user manager.</param>
    /// <param name="user">The user.</param>
    /// <param name="password">The new password.</param>
    /// <returns>The task.</returns>
    public static Task ChangePassword(IUserManager userManager, User user, string password)
    {
#if JELLYFIN_12
        return userManager.ChangePassword(user.Id, password);
#else
        return userManager.ChangePassword(user, password);
#endif
    }
}
