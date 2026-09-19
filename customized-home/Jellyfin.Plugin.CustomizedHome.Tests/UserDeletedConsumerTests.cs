using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Jellyfin.Data.Events.Users;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.CustomizedHome.Models;
using Jellyfin.Plugin.CustomizedHome.Services;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Events;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Jellyfin.Plugin.CustomizedHome.Tests;

/// <summary>
/// The server tells about a deleted user through its event manager, which resolves every registered
/// IEventConsumer of UserDeletedEventArgs in a new scope. These tests cannot tell that a real server does so.
/// </summary>
public sealed class UserDeletedConsumerTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "ch-tests-" + Guid.NewGuid().ToString("N"));
    private readonly IApplicationPaths _paths;

    public UserDeletedConsumerTests()
    {
        Mock<IApplicationPaths> paths = new();
        paths.SetupGet(p => p.PluginConfigurationsPath).Returns(_root);
        _paths = paths.Object;
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    private static User NewUser(string name)
    {
        return new User(name, "test-provider", "test-provider");
    }

    private static HomeLayout Layout()
    {
        return new HomeLayout { Items = [new LayoutItem { Key = "jf:resume", Label = "Private label" }] };
    }

    private string[] LayoutFiles()
    {
        string users = Path.Combine(_root, "Jellyfin.Plugin.CustomizedHome", "users");
        return Directory.Exists(users) ? Directory.GetFiles(users).Select(file => Path.GetFileName(file)!).ToArray() : [];
    }

    [Fact]
    public async Task The_layout_of_a_deleted_user_is_deleted_and_only_theirs()
    {
        User alice = NewUser("alice");
        User bob = NewUser("bob");
        LayoutStore store = new(_paths, NullLogger<LayoutStore>.Instance);
        store.Save(alice.Id, Layout());
        store.Save(bob.Id, Layout());
        Assert.NotNull(store.Get(alice.Id));

        await new UserDeletedConsumer(store, NullLogger<UserDeletedConsumer>.Instance).OnEvent(new UserDeletedEventArgs(alice));

        Assert.Equal([bob.Id.ToString("N") + ".json"], LayoutFiles());
        Assert.Null(store.Get(alice.Id));
        Assert.NotNull(store.Get(bob.Id));
    }

    [Fact]
    public async Task A_deleted_user_without_a_layout_changes_nothing()
    {
        User bob = NewUser("bob");
        LayoutStore store = new(_paths, NullLogger<LayoutStore>.Instance);
        store.Save(bob.Id, Layout());
        UserDeletedConsumer consumer = new(store, NullLogger<UserDeletedConsumer>.Instance);

        await consumer.OnEvent(new UserDeletedEventArgs(NewUser("alice")));

        Assert.Single(LayoutFiles());
        await Assert.ThrowsAsync<ArgumentNullException>(() => consumer.OnEvent(null!));
    }

    [Fact]
    public async Task A_layout_file_in_use_does_not_break_the_deletion_of_the_user()
    {
        User alice = NewUser("alice");
        LayoutStore store = new(_paths, NullLogger<LayoutStore>.Instance);
        store.Save(alice.Id, Layout());
        string file = Path.Combine(_root, "Jellyfin.Plugin.CustomizedHome", "users", LayoutFiles().Single());

        using (new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.None))
        {
            // Windows refuses to delete an open file, Linux does not mind: either way the server gets no exception.
            await new UserDeletedConsumer(store, NullLogger<UserDeletedConsumer>.Instance).OnEvent(new UserDeletedEventArgs(alice));
        }

        // Still on disk or not, the layout no longer applies.
        Assert.Null(store.Get(alice.Id));
    }

    [Fact]
    public async Task The_server_finds_the_consumer_among_the_services_the_plugin_registers()
    {
        User alice = NewUser("alice");
        ServiceCollection services = new();
        services.AddSingleton(_paths);
        services.AddSingleton(typeof(ILogger<>), typeof(NullLogger<>));
        new PluginServiceRegistrator().RegisterServices(services, Mock.Of<IServerApplicationHost>());
        await using ServiceProvider provider = services.BuildServiceProvider(validateScopes: true);
        provider.GetRequiredService<LayoutStore>().Save(alice.Id, Layout());

        // What the event manager of the server does when a user is deleted.
        await using (AsyncServiceScope scope = provider.CreateAsyncScope())
        {
            IEventConsumer<UserDeletedEventArgs> consumer = Assert.Single(scope.ServiceProvider.GetServices<IEventConsumer<UserDeletedEventArgs>>());
            await consumer.OnEvent(new UserDeletedEventArgs(alice));
        }

        Assert.Empty(LayoutFiles());
        Assert.Null(provider.GetRequiredService<LayoutStore>().Get(alice.Id));
    }
}
