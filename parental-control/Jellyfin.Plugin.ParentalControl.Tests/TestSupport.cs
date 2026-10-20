using System;
using System.Collections.Generic;
using System.IO;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.ParentalControl.Configuration;
using Jellyfin.Plugin.ParentalControl.Services;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Users;

namespace Jellyfin.Plugin.ParentalControl.Tests;

/// <summary>
/// A clock the tests move by hand.
/// </summary>
internal sealed class ManualTimeProvider : TimeProvider
{
    public ManualTimeProvider(DateTimeOffset now)
    {
        Now = now;
    }

    public DateTimeOffset Now { get; set; }

    public override TimeZoneInfo LocalTimeZone => TimeZoneInfo.Utc;

    public override DateTimeOffset GetUtcNow() => Now;

    public void Advance(TimeSpan delta) => Now += delta;
}

/// <summary>
/// A folder deleted with the test.
/// </summary>
internal sealed class TempFolder : IDisposable
{
    public TempFolder()
    {
        Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "pc-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path);
    }

    public string Path { get; }

    public string File(string name) => System.IO.Path.Combine(Path, name);

    public void Dispose()
    {
        try
        {
            Directory.Delete(Path, recursive: true);
        }
        catch (IOException)
        {
            // Best effort.
        }
    }
}

/// <summary>
/// Configuration kept in memory, saves counted.
/// </summary>
internal sealed class MemoryConfiguration
{
    public MemoryConfiguration(PluginConfiguration? configuration = null)
    {
        Configuration = configuration ?? new PluginConfiguration();
        Source = new ConfigurationSource(() => Configuration, () =>
        {
            if (FailSaves)
            {
                throw new IOException("disk full");
            }

            Saves++;
        });
    }

    public PluginConfiguration Configuration { get; }

    public ConfigurationSource Source { get; }

    public int Saves { get; private set; }

    public bool FailSaves { get; set; }
}

/// <summary>
/// Users and their policies, as the user manager of the server keeps them.
/// </summary>
internal sealed class UserDirectory
{
    public Dictionary<Guid, User> Users { get; } = new();

    public Dictionary<Guid, UserPolicy> Policies { get; } = new();

    public User Add(string name, bool administrator = false, bool hidden = false)
    {
        User user = new(name, "Jellyfin.Server.Implementations.Users.DefaultAuthenticationProvider", "Jellyfin.Server.Implementations.Users.DefaultPasswordResetProvider");
        Users[user.Id] = user;
        Policies[user.Id] = new UserPolicy { IsAdministrator = administrator, IsHidden = hidden, EnableAllFolders = true, EnableRemoteAccess = true };
        return user;
    }

    public UserDto Dto(User user)
    {
        // A copy, like the server: the caller changes it and sends it back with UpdatePolicyAsync.
        UserPolicy stored = Policies[user.Id];
        return new UserDto
        {
            Id = user.Id,
            Name = user.Username,
            Policy = Copy(stored)
        };
    }

    public static UserPolicy Copy(UserPolicy policy)
    {
        return System.Text.Json.JsonSerializer.Deserialize<UserPolicy>(System.Text.Json.JsonSerializer.Serialize(policy))!;
    }
}
