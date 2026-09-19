using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Jellyfin.Plugin.CustomizedHome.Api;
using Jellyfin.Plugin.CustomizedHome.Configuration;
using Jellyfin.Plugin.CustomizedHome.Models;
using Jellyfin.Plugin.CustomizedHome.Services;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Net;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Serialization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Jellyfin.Plugin.CustomizedHome.Tests;

/// <summary>
/// Where the data of the plugin lives, and what an uninstallation does to it: nothing, the log says where it is.
/// One test creates a <see cref="Plugin"/>, which becomes the process wide instance the other classes read:
/// this class runs alone, once every parallel test is over.
/// </summary>
[Collection(PluginInstanceCollection.Name)]
public sealed class PluginDataTests : IDisposable
{
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00];

    private readonly string _configurations = Path.Combine(Path.GetTempPath(), "ch-tests-" + Guid.NewGuid().ToString("N"));
    private readonly WebInjectionService _injection = new(NullLogger<WebInjectionService>.Instance);
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
        _injection.Dispose();
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
    public void Uninstalling_keeps_every_file_and_the_log_says_where_they_are()
    {
        WriteDataWithTheRealStores();
        File.WriteAllText(Path.Combine(_configurations, "Jellyfin.Plugin.CustomizedHome.xml"), "<PluginConfiguration />");
        List<string> before = EveryFile();
        RecordingLogger logger = new();

        Plugin.ReportKeptData(_paths, logger);

        // A layout, the thumbnail index, a thumbnail and the configuration: reinstalling finds them all again.
        Assert.Equal(4, before.Count);
        Assert.Equal(before, EveryFile());
        (LogLevel Level, string Message) entry = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Information, entry.Level);
        Assert.Contains(Root, entry.Message, StringComparison.Ordinal);
        Assert.Contains("kept", entry.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Uninstalling_a_plugin_that_never_stored_anything_says_nothing_and_does_not_fail()
    {
        RecordingLogger logger = new();

        Plugin.ReportKeptData(_paths, logger);

        Assert.Empty(logger.Entries);
        Assert.False(Directory.Exists(_configurations));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void The_plugin_keeps_its_data_when_the_server_uninstalls_it(bool hasData)
    {
        if (hasData)
        {
            WriteDataWithTheRealStores();
        }

        List<string> before = EveryFile();
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
        RecordingLogger<Plugin> logger = new();
        try
        {
            Plugin plugin = new(paths.Object, serializer.Object, serverConfiguration.Object, logger);

            plugin.OnUninstalling();

            Assert.Equal(before, EveryFile());
            Assert.Equal(hasData ? 3 : 0, before.Count);
            Assert.Equal(hasData ? 1 : 0, logger.Entries.Count(entry => entry.Message.Contains(Root, StringComparison.Ordinal)));
        }
        finally
        {
            typeof(Plugin).GetProperty(nameof(Plugin.Instance), BindingFlags.Public | BindingFlags.Static)!.SetValue(null, null);
        }
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void A_default_layout_that_cannot_be_written_is_a_503_and_the_previous_one_still_applies(bool accessDenied)
    {
        Exception failure = accessDenied
            ? new UnauthorizedAccessException("Access to the path is denied.")
            : new IOException("The process cannot access the file because it is being used by another process.");
        HomeLayout previous = new() { Items = [new LayoutItem { Key = "jf:resume" }] };
        Mock<IApplicationPaths> paths = new();
        paths.SetupGet(p => p.PluginConfigurationsPath).Returns(_configurations);
        paths.SetupGet(p => p.PluginsPath).Returns(Path.Combine(_configurations, "plugins"));
        Mock<IXmlSerializer> serializer = new();
        serializer.Setup(s => s.DeserializeFromFile(It.IsAny<Type>(), It.IsAny<string>())).Returns(new PluginConfiguration { DefaultLayout = previous });
        Mock<IServerConfigurationManager> serverConfiguration = new();
        serverConfiguration.Setup(manager => manager.GetConfiguration(It.IsAny<string>())).Returns(new NetworkConfiguration());

        // Saving the configuration writes the XML file through the serializer of the server.
        serializer.Setup(s => s.SerializeToFile(It.IsAny<object>(), It.IsAny<string>())).Throws(failure);
        RecordingLoggerWithException controllerLogger = new();
        try
        {
            Plugin plugin = new(paths.Object, serializer.Object, serverConfiguration.Object, new RecordingLogger<Plugin>());
            Assert.Same(previous, plugin.Configuration.DefaultLayout);
            CustomizedHomeController controller = NewController(controllerLogger);

            ActionResult<HomeLayout>? result = controller.SaveDefaultLayout(new HomeLayout { Items = [new LayoutItem { Key = "jf:nextup" }] });

            ObjectResult answer = Assert.IsType<ObjectResult>(result.Result);
            Assert.Equal(StatusCodes.Status503ServiceUnavailable, answer.StatusCode);
            string message = Assert.IsType<string>(answer.Value);
            Assert.Contains("could not be written", message, StringComparison.Ordinal);
            Assert.DoesNotContain(failure.Message, message, StringComparison.Ordinal);
            (LogLevel Level, Exception? Exception) entry = Assert.Single(controllerLogger.Entries);
            Assert.Equal(LogLevel.Warning, entry.Level);
            Assert.Same(failure, entry.Exception);

            // Never applied in memory either: the administrator would see it work until the next restart.
            Assert.Same(previous, plugin.Configuration.DefaultLayout);
            Assert.Equal(["jf:resume"], controller.GetDefaultLayout().Value!.Items.Select(item => item.Key));

            // Once the disk lets the file be written the new layout is saved and applies.
            serializer.Setup(s => s.SerializeToFile(It.IsAny<object>(), It.IsAny<string>()));
            Assert.Equal(["jf:nextup"], controller.SaveDefaultLayout(new HomeLayout { Items = [new LayoutItem { Key = "jf:nextup" }] }).Value!.Items.Select(item => item.Key));
            Assert.Equal(["jf:nextup"], plugin.Configuration.DefaultLayout.Items.Select(item => item.Key));
        }
        finally
        {
            typeof(Plugin).GetProperty(nameof(Plugin.Instance), BindingFlags.Public | BindingFlags.Static)!.SetValue(null, null);
        }
    }

    private CustomizedHomeController NewController(ILogger<CustomizedHomeController> logger)
    {
        LayoutStore store = new(_paths, NullLogger<LayoutStore>.Instance);
        GenreImageStore genreImages = new(_paths, NullLogger<GenreImageStore>.Instance);
        return new CustomizedHomeController(store, genreImages, _injection, Mock.Of<IUserManager>(), Mock.Of<IUserViewManager>(), logger)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
    }

    private List<string> EveryFile()
    {
        return Directory.Exists(_configurations)
            ? Directory.GetFiles(_configurations, "*", SearchOption.AllDirectories).Order(StringComparer.Ordinal).ToList()
            : [];
    }

    private sealed class RecordingLogger<T> : RecordingLogger, ILogger<T>
    {
    }

    /// <summary>
    /// Keeps the exception too: what the administrator needs in the server log is the cause, not the message
    /// the client is shown.
    /// </summary>
    private sealed class RecordingLoggerWithException : ILogger<CustomizedHomeController>
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

    private class RecordingLogger : ILogger
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
