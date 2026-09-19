using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Jellyfin.Plugin.CustomizedHome.Configuration;
using Jellyfin.Plugin.CustomizedHome.Models;
using Jellyfin.Plugin.CustomizedHome.Services;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Net;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Jellyfin.Plugin.CustomizedHome.Tests;

/// <summary>
/// What an uninstallation deletes: the data folders of the plugin, never anything next to them.
/// One test creates a <see cref="Plugin"/>, which becomes the process wide instance the other classes read:
/// this class runs alone, once every parallel test is over.
/// </summary>
[Collection(PluginInstanceCollection.Name)]
public sealed class PluginDataTests : IDisposable
{
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00];

    private readonly string _configurations = Path.Combine(Path.GetTempPath(), "ch-tests-" + Guid.NewGuid().ToString("N"));
    private readonly IApplicationPaths _paths;

    public PluginDataTests()
    {
        Mock<IApplicationPaths> paths = new();
        paths.SetupGet(p => p.PluginConfigurationsPath).Returns(_configurations);
        _paths = paths.Object;
    }

    private string Root => Path.Combine(_configurations, "Jellyfin.Plugin.CustomizedHome");

    public void Dispose()
    {
        if (Directory.Exists(_configurations))
        {
            Directory.Delete(_configurations, recursive: true);
        }
    }

    private void WriteDataWithTheRealStores()
    {
        new LayoutStore(_paths, NullLogger<LayoutStore>.Instance).Save(Guid.NewGuid(), new HomeLayout { Items = [new LayoutItem { Key = "jf:resume" }] });
        new GenreImageStore(_paths, NullLogger<GenreImageStore>.Instance).Save("Comedy", "portrait", Png, out _);
    }

    [Fact]
    public void The_data_root_is_the_folder_the_stores_write_into()
    {
        WriteDataWithTheRealStores();

        Assert.Equal(Root, PluginData.GetRoot(_paths));
        Assert.Equal(
            [Path.Combine(Root, PluginData.GenresFolder), Path.Combine(Root, PluginData.UsersFolder)],
            Directory.GetDirectories(Root).Order(StringComparer.Ordinal));
        Assert.Empty(Directory.GetFiles(Root));
    }

    [Fact]
    public void Uninstalling_deletes_the_layouts_and_the_thumbnails_and_nothing_else()
    {
        WriteDataWithTheRealStores();
        string configuration = Path.Combine(_configurations, "Jellyfin.Plugin.CustomizedHome.xml");
        string otherPlugin = Path.Combine(_configurations, "Jellyfin.Plugin.Other", "users", "data.json");
        File.WriteAllText(configuration, "<PluginConfiguration />");
        Directory.CreateDirectory(Path.GetDirectoryName(otherPlugin)!);
        File.WriteAllText(otherPlugin, "{}");
        RecordingLogger logger = new();

        Plugin.DeleteData(_paths, logger);

        Assert.False(Directory.Exists(Root));
        Assert.True(File.Exists(configuration));
        Assert.True(File.Exists(otherPlugin));

        // users, genres and the folder holding them: the administrator reads in the log what was removed.
        Assert.Equal(3, logger.Entries.Count);
        Assert.All(logger.Entries, entry => Assert.Equal(LogLevel.Information, entry.Level));
    }

    [Fact]
    public void Something_else_found_in_the_data_root_is_left_alone_with_the_root()
    {
        WriteDataWithTheRealStores();
        string foreignFile = Path.Combine(Root, "notes.txt");
        string foreignFolder = Path.Combine(Root, "backup", "users");
        File.WriteAllText(foreignFile, "mine");
        Directory.CreateDirectory(foreignFolder);

        DataCleanupResult result = PluginData.DeleteAll(Root);

        Assert.Equal(
            [Path.Combine(Root, PluginData.GenresFolder), Path.Combine(Root, PluginData.UsersFolder)],
            result.Deleted.Order(StringComparer.Ordinal));
        Assert.Empty(result.Failed);
        Assert.True(File.Exists(foreignFile));
        Assert.True(Directory.Exists(foreignFolder));
        Assert.False(Directory.Exists(Path.Combine(Root, PluginData.UsersFolder)));
        Assert.False(Directory.Exists(Path.Combine(Root, PluginData.GenresFolder)));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("MISSING")]
    public void Nothing_to_delete_is_not_an_error_and_a_blank_root_deletes_nothing(string? root)
    {
        WriteDataWithTheRealStores();

        DataCleanupResult result = PluginData.DeleteAll(root == "MISSING" ? Path.Combine(_configurations, "never-created") : root!);

        Assert.Empty(result.Deleted);
        Assert.Empty(result.Failed);
        Assert.True(Directory.Exists(Path.Combine(Root, PluginData.UsersFolder)));
    }

    [Fact]
    public void A_file_in_use_never_makes_the_uninstallation_fail()
    {
        WriteDataWithTheRealStores();
        string layoutFile = Directory.GetFiles(Path.Combine(Root, PluginData.UsersFolder)).Single();
        RecordingLogger logger = new();

        using (new FileStream(layoutFile, FileMode.Open, FileAccess.Read, FileShare.None))
        {
            // Windows refuses to delete an open file, Linux does not mind: either way nothing is thrown.
            Plugin.DeleteData(_paths, logger);
        }

        Assert.False(Directory.Exists(Path.Combine(Root, PluginData.GenresFolder)));
        if (Directory.Exists(Path.Combine(Root, PluginData.UsersFolder)))
        {
            (LogLevel Level, Exception? Exception) warning = Assert.Single(logger.Entries, entry => entry.Level == LogLevel.Warning);
            Assert.NotNull(warning.Exception);
        }
        else
        {
            Assert.DoesNotContain(logger.Entries, entry => entry.Level == LogLevel.Warning);
        }
    }

    [Fact]
    public void The_plugin_cleans_up_when_the_server_uninstalls_it()
    {
        WriteDataWithTheRealStores();
        Mock<IApplicationPaths> paths = new();
        paths.SetupGet(p => p.PluginConfigurationsPath).Returns(_configurations);
        paths.SetupGet(p => p.PluginsPath).Returns(Path.Combine(_configurations, "plugins"));

        // Creating the plugin makes it the process wide instance. No other test runs meanwhile (see the collection);
        // what could still be read from it (configuration, base URL) is answered like on a fresh server, and the
        // instance is taken back.
        Mock<IXmlSerializer> serializer = new();
        serializer.Setup(s => s.DeserializeFromFile(It.IsAny<Type>(), It.IsAny<string>())).Returns(new PluginConfiguration());
        Mock<IServerConfigurationManager> serverConfiguration = new();
        serverConfiguration.Setup(manager => manager.GetConfiguration(It.IsAny<string>())).Returns(new NetworkConfiguration());
        try
        {
            Plugin plugin = new(paths.Object, serializer.Object, serverConfiguration.Object, NullLogger<Plugin>.Instance);

            plugin.OnUninstalling();

            Assert.False(Directory.Exists(Root));
        }
        finally
        {
            typeof(Plugin).GetProperty(nameof(Plugin.Instance), BindingFlags.Public | BindingFlags.Static)!.SetValue(null, null);
        }
    }

    private sealed class RecordingLogger : ILogger
    {
        public List<(LogLevel Level, Exception? Exception)> Entries { get; } = new();

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
            Entries.Add((logLevel, exception));
        }
    }
}
