using System;
using System.IO;
using System.Linq;
using Jellyfin.Plugin.CustomizedHome.Services;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Jellyfin.Plugin.CustomizedHome.Tests;

public sealed class GenreImageStoreTests : IDisposable
{
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00];
    private static readonly byte[] Jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
    private static readonly byte[] Webp = [(byte)'R', (byte)'I', (byte)'F', (byte)'F', 0, 0, 0, 0, (byte)'W', (byte)'E', (byte)'B', (byte)'P'];

    private readonly string _root = Path.Combine(Path.GetTempPath(), "ch-tests-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    private GenreImageStore CreateStore()
    {
        Mock<IApplicationPaths> paths = new();
        paths.SetupGet(p => p.PluginConfigurationsPath).Returns(_root);
        return new GenreImageStore(paths.Object, NullLogger<GenreImageStore>.Instance);
    }

    private string GenresDirectory => Path.Combine(_root, "Jellyfin.Plugin.CustomizedHome", "genres");

    [Fact]
    public void Save_then_read_returns_the_bytes_and_the_detected_content_type()
    {
        GenreImageStore store = CreateStore();

        GenreImageEntry? entry = store.Save("Comedy", Png, out string? error);

        Assert.Null(error);
        Assert.NotNull(entry);
        (byte[] Data, string ContentType)? image = store.Read("Comedy");
        Assert.NotNull(image);
        Assert.Equal(Png, image.Value.Data);
        Assert.Equal("image/png", image.Value.ContentType);
    }

    [Theory]
    [InlineData("jpeg")]
    [InlineData("webp")]
    public void Format_comes_from_the_bytes(string kind)
    {
        GenreImageStore store = CreateStore();
        byte[] data = kind == "jpeg" ? Jpeg : Webp;

        store.Save("Drama", data, out _);

        Assert.Equal(kind == "jpeg" ? "image/jpeg" : "image/webp", store.Read("Drama")!.Value.ContentType);
    }

    [Fact]
    public void Svg_and_other_content_is_rejected_and_nothing_is_written()
    {
        GenreImageStore store = CreateStore();
        byte[] svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>"u8.ToArray();

        GenreImageEntry? entry = store.Save("Action", svg, out string? error);

        Assert.Null(entry);
        Assert.NotNull(error);
        Assert.Null(store.Read("Action"));
        Assert.False(Directory.Exists(GenresDirectory) && Directory.EnumerateFiles(GenresDirectory).Any());
    }

    [Fact]
    public void Oversized_and_empty_images_are_rejected()
    {
        GenreImageStore store = CreateStore();
        byte[] tooBig = new byte[GenreImageStore.MaxImageBytes + 1];
        Png.CopyTo(tooBig, 0);

        Assert.Null(store.Save("Action", tooBig, out _));
        Assert.Null(store.Save("Action", [], out _));
    }

    [Theory]
    [InlineData("../../../etc/passwd")]
    [InlineData("..\\..\\windows\\system32\\evil")]
    [InlineData("C:/absolute/path")]
    public void Genre_names_never_become_file_names(string hostileName)
    {
        GenreImageStore store = CreateStore();

        GenreImageEntry? entry = store.Save(hostileName, Png, out _);

        Assert.NotNull(entry);
        string[] files = Directory.GetFiles(_root, "*", SearchOption.AllDirectories);
        Assert.All(files, file => Assert.StartsWith(GenresDirectory, file, StringComparison.Ordinal));
        string image = files.Single(file => !file.EndsWith("index.json", StringComparison.Ordinal));
        Assert.Matches("^[0-9A-F]{32}\\.png$", Path.GetFileName(image));
        Assert.Equal(Png, store.Read(hostileName)!.Value.Data);
    }

    [Fact]
    public void Blank_or_too_long_names_are_rejected()
    {
        GenreImageStore store = CreateStore();

        Assert.Null(store.Save("   ", Png, out _));
        Assert.Null(store.Save(new string('x', 101), Png, out _));
        Assert.Null(store.Read(null));
    }

    [Fact]
    public void Names_are_case_insensitive_and_replacing_bumps_the_version_and_drops_the_old_file()
    {
        GenreImageStore store = CreateStore();
        GenreImageEntry first = store.Save("Sci-Fi", Png, out _)!;

        GenreImageEntry second = store.Save("SCI-FI", Jpeg, out _)!;

        Assert.True(second.Version > first.Version);
        Assert.Single(store.List());
        Assert.Equal("image/jpeg", store.Read("sci-fi")!.Value.ContentType);
        Assert.Single(Directory.GetFiles(GenresDirectory), file => !file.EndsWith("index.json", StringComparison.Ordinal));
    }

    [Fact]
    public void Delete_removes_the_file_and_the_entry_and_survives_a_restart()
    {
        GenreImageStore store = CreateStore();
        store.Save("Horror", Png, out _);
        store.Save("Comedy", Png, out _);

        Assert.True(store.Delete("Horror"));
        Assert.False(store.Delete("Horror"));

        GenreImageStore reloaded = CreateStore();
        Assert.Equal(["Comedy"], reloaded.List().Select(entry => entry.Name));
        Assert.Null(reloaded.Read("Horror"));
        Assert.NotNull(reloaded.Read("Comedy"));
    }
}
