using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.CustomizedHome.Models;
using Jellyfin.Plugin.CustomizedHome.Services;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Jellyfin.Plugin.CustomizedHome.Tests;

/// <summary>
/// The cleanup that removes, once per server start, the layouts of users deleted while the plugin was not
/// running (<see cref="UserDeletedConsumer"/> covers the deletions the server announces). These tests cannot
/// tell that a real server starts the hosted services a plugin registers.
/// </summary>
public sealed class OrphanLayoutCleanupServiceTests : IDisposable
{
    private static readonly Guid Alice = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly Guid Bob = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000002");

    private readonly string _root = Path.Combine(Path.GetTempPath(), "ch-tests-" + Guid.NewGuid().ToString("N"));
    private readonly Mock<IUserManager> _userManager = new();
    private readonly IApplicationPaths _paths;

    public OrphanLayoutCleanupServiceTests()
    {
        Mock<IApplicationPaths> paths = new();
        paths.SetupGet(p => p.PluginConfigurationsPath).Returns(_root);
        _paths = paths.Object;
        _userManager.Setup(manager => manager.GetUserById(Bob)).Returns(new User("bob", "test-provider", "test-provider") { Id = Bob });
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    private string UsersDirectory => Path.Combine(_root, "Jellyfin.Plugin.CustomizedHome", "users");

    private string[] LayoutFiles()
    {
        return Directory.Exists(UsersDirectory)
            ? Directory.GetFiles(UsersDirectory).Select(file => Path.GetFileName(file)!).Order(StringComparer.Ordinal).ToArray()
            : [];
    }

    private static HomeLayout Layout()
    {
        return new HomeLayout { Items = [new LayoutItem { Key = "jf:resume", Label = "Private label" }] };
    }

    private LayoutStore NewStore()
    {
        return new LayoutStore(_paths, NullLogger<LayoutStore>.Instance);
    }

    [Fact]
    public void The_layout_left_behind_by_a_deleted_user_is_removed_and_the_others_are_kept()
    {
        LayoutStore store = NewStore();
        store.Save(Alice, Layout());
        store.Save(Bob, Layout());
        RecordingLogger logger = new();

        Assert.Equal(1, new OrphanLayoutCleanupService(store, _userManager.Object, logger).Purge());

        Assert.Equal([Bob.ToString("N") + ".json"], LayoutFiles());
        Assert.Null(store.Get(Alice));
        Assert.NotNull(store.Get(Bob));
        (LogLevel Level, string Message) entry = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Information, entry.Level);
        Assert.Contains("removed 1", entry.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void A_file_named_after_the_empty_identifier_is_left_alone_and_the_user_manager_is_never_asked_about_it()
    {
        // The user manager refuses the empty identifier with an exception: asking would break the whole cleanup.
        _userManager.Setup(manager => manager.GetUserById(Guid.Empty)).Throws(new ArgumentException("Guid can't be empty"));
        LayoutStore store = NewStore();
        store.Save(Guid.Empty, Layout());

        Assert.Equal(0, new OrphanLayoutCleanupService(store, _userManager.Object, new RecordingLogger()).Purge());

        Assert.Equal([Guid.Empty.ToString("N") + ".json"], LayoutFiles());
        _userManager.Verify(manager => manager.GetUserById(Guid.Empty), Times.Never);
    }

    [Fact]
    public void A_user_manager_that_throws_keeps_the_file_and_the_cleanup_goes_on()
    {
        _userManager.Setup(manager => manager.GetUserById(Alice)).Throws(new InvalidOperationException("the database is not ready"));
        Guid gone = Guid.Parse("dddddddd-0000-0000-0000-000000000004");
        LayoutStore store = NewStore();
        store.Save(Alice, Layout());
        store.Save(gone, Layout());

        Assert.Equal(1, new OrphanLayoutCleanupService(store, _userManager.Object, new RecordingLogger()).Purge());

        // The layout of Alice is kept: an unanswered question is not "this user is gone".
        Assert.Equal([Alice.ToString("N") + ".json"], LayoutFiles());
    }

    [Fact]
    public void Nothing_stored_yet_means_nothing_to_do_and_no_log()
    {
        RecordingLogger logger = new();

        Assert.Equal(0, new OrphanLayoutCleanupService(NewStore(), _userManager.Object, logger).Purge());

        Assert.Empty(logger.Entries);
        Assert.False(Directory.Exists(UsersDirectory));
    }

    [Fact]
    public async Task Starting_and_stopping_the_service_never_throws_and_removes_the_orphan()
    {
        LayoutStore store = NewStore();
        store.Save(Alice, Layout());
        OrphanLayoutCleanupService service = new(store, _userManager.Object, new RecordingLogger());

        await service.StartAsync(CancellationToken.None);

        // The purge runs off the startup path: the server does not wait for it.
        for (int attempt = 0; attempt < 200 && LayoutFiles().Length > 0; attempt++)
        {
            await Task.Delay(10);
        }

        Assert.Empty(LayoutFiles());
        await service.StopAsync(CancellationToken.None);
    }

    [Fact]
    public void The_server_finds_the_cleanup_among_the_hosted_services_the_plugin_registers()
    {
        ServiceCollection services = new();
        services.AddSingleton(_paths);
        services.AddSingleton(_userManager.Object);
        services.AddSingleton(typeof(ILogger<>), typeof(NullLogger<>));
        new PluginServiceRegistrator().RegisterServices(services, Mock.Of<IServerApplicationHost>());
        using ServiceProvider provider = services.BuildServiceProvider(validateScopes: true);

        Assert.Contains(provider.GetServices<IHostedService>(), service => service is OrphanLayoutCleanupService);
    }

    private sealed class RecordingLogger : ILogger<OrphanLayoutCleanupService>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = new();

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull
        {
            return null;
        }

        public bool IsEnabled(LogLevel logLevel)
        {
            return true;
        }

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Entries.Add((logLevel, formatter(state, exception)));
        }
    }
}
