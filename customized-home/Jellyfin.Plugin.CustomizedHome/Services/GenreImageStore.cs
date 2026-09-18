using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Jellyfin.Plugin.CustomizedHome.Models;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.CustomizedHome.Services;

/// <summary>
/// Stores the thumbnails uploaded by administrators for the genre cards, in the plugin configuration folder.
/// A genre can have one thumbnail per card shape (portrait, landscape, square).
/// Files are named after a hash of the genre name, never after user input.
/// </summary>
public sealed partial class GenreImageStore
{
    /// <summary>
    /// Maximum accepted size of an uploaded thumbnail, in bytes.
    /// </summary>
    public const int MaxImageBytes = 5 * 1024 * 1024;

    private const string IndexFileName = "index.json";
    private const int MaxGenreNameLength = 100;

    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private readonly object _lock = new();
    private readonly string _directory;
    private readonly ILogger<GenreImageStore> _logger;
    private Dictionary<string, GenreImageEntry>? _index;

    /// <summary>
    /// Initializes a new instance of the <see cref="GenreImageStore"/> class.
    /// </summary>
    /// <param name="applicationPaths">The application paths.</param>
    /// <param name="logger">The logger.</param>
    public GenreImageStore(IApplicationPaths applicationPaths, ILogger<GenreImageStore> logger)
    {
        ArgumentNullException.ThrowIfNull(applicationPaths);
        _directory = Path.Combine(applicationPaths.PluginConfigurationsPath, typeof(Plugin).Namespace!, "genres");
        _logger = logger;
    }

    /// <summary>
    /// Gets the card shapes a thumbnail can be uploaded for.
    /// </summary>
    public static IReadOnlyList<string> Shapes { get; } = [LayoutFormats.ShapePortrait, LayoutFormats.ShapeLandscape, LayoutFormats.ShapeSquare];

    /// <summary>
    /// Normalizes a card shape; anything unknown is the portrait shape.
    /// </summary>
    /// <param name="shape">The requested shape.</param>
    /// <returns>One of <see cref="Shapes"/>.</returns>
    public static string NormalizeShape(string? shape)
    {
        string? candidate = shape?.Trim();
        return Shapes.FirstOrDefault(known => string.Equals(known, candidate, StringComparison.OrdinalIgnoreCase)) ?? LayoutFormats.ShapePortrait;
    }

    /// <summary>
    /// Lists the custom thumbnails.
    /// </summary>
    /// <returns>The entries, ordered by genre name then shape.</returns>
    public IReadOnlyList<GenreImageEntry> List()
    {
        lock (_lock)
        {
            return LoadIndex().Values
                .OrderBy(entry => entry.Name, StringComparer.OrdinalIgnoreCase)
                .ThenBy(entry => entry.Shape, StringComparer.Ordinal)
                .ToList();
        }
    }

    /// <summary>
    /// Saves the thumbnail of a genre for a card shape, replacing any previous one.
    /// </summary>
    /// <param name="genreName">The genre name.</param>
    /// <param name="shape">The card shape.</param>
    /// <param name="data">The image bytes.</param>
    /// <param name="error">The reason when the image is rejected.</param>
    /// <returns>The stored entry, or <c>null</c> when rejected.</returns>
    public GenreImageEntry? Save(string? genreName, string? shape, byte[] data, out string? error)
    {
        ArgumentNullException.ThrowIfNull(data);
        error = null;

        string? name = NormalizeName(genreName);
        if (name is null)
        {
            error = "Genre name is required (100 characters maximum).";
            return null;
        }

        if (data.Length == 0 || data.Length > MaxImageBytes)
        {
            error = "Image is empty or larger than 5 MB.";
            return null;
        }

        ImageFormat? format = ImageFormat.Detect(data);
        if (format is null)
        {
            error = "Unsupported image: use PNG, JPEG or WebP.";
            return null;
        }

        string normalizedShape = NormalizeShape(shape);
        lock (_lock)
        {
            Dictionary<string, GenreImageEntry> index = LoadIndex();
            string key = KeyOf(name, normalizedShape);
            Directory.CreateDirectory(_directory);

            index.TryGetValue(key, out GenreImageEntry? previous);
            DeleteFile(previous);

            // Both parts come from this class: a hash and a known shape name.
            string fileName = HashOf(name) + "-" + normalizedShape + format.Extension;
            File.WriteAllBytes(Path.Combine(_directory, fileName), data);

            // Strictly increasing: the version is part of the image URL, which clients cache for good.
            GenreImageEntry entry = new()
            {
                Name = name,
                Shape = normalizedShape,
                FileName = fileName,
                ContentType = format.ContentType,
                Version = Math.Max(DateTime.UtcNow.Ticks, (previous?.Version ?? 0) + 1)
            };
            index[key] = entry;
            SaveIndex(index);
            return entry;
        }
    }

    /// <summary>
    /// Deletes the thumbnail of a genre for a card shape.
    /// </summary>
    /// <param name="genreName">The genre name.</param>
    /// <param name="shape">The card shape.</param>
    /// <returns><c>true</c> when a thumbnail existed.</returns>
    public bool Delete(string? genreName, string? shape)
    {
        string? name = NormalizeName(genreName);
        if (name is null)
        {
            return false;
        }

        lock (_lock)
        {
            Dictionary<string, GenreImageEntry> index = LoadIndex();
            string key = KeyOf(name, NormalizeShape(shape));
            if (!index.Remove(key, out GenreImageEntry? entry))
            {
                return false;
            }

            DeleteFile(entry);
            SaveIndex(index);
            return true;
        }
    }

    /// <summary>
    /// Opens the thumbnail of a genre for a card shape.
    /// </summary>
    /// <param name="genreName">The genre name.</param>
    /// <param name="shape">The card shape.</param>
    /// <returns>The bytes and content type, or <c>null</c> when there is no thumbnail for that shape.</returns>
    public (byte[] Data, string ContentType)? Read(string? genreName, string? shape)
    {
        string? name = NormalizeName(genreName);
        if (name is null)
        {
            return null;
        }

        lock (_lock)
        {
            if (!LoadIndex().TryGetValue(KeyOf(name, NormalizeShape(shape)), out GenreImageEntry? entry))
            {
                return null;
            }

            string path = PathOf(entry);
            return File.Exists(path) ? (File.ReadAllBytes(path), entry.ContentType) : null;
        }
    }

    private static string? NormalizeName(string? genreName)
    {
        string? name = genreName?.Trim();
        return string.IsNullOrEmpty(name) || name.Length > MaxGenreNameLength ? null : name;
    }

    private static string HashOf(string name)
    {
        byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(name.ToUpperInvariant()));
        return Convert.ToHexString(hash)[..32];
    }

    private static string KeyOf(string name, string shape)
    {
        return HashOf(name) + ":" + shape;
    }

    // The file name comes from the index written by this class, never from a request; GetFileName is a second guard.
    private string PathOf(GenreImageEntry entry)
    {
        return Path.Combine(_directory, Path.GetFileName(entry.FileName));
    }

    private void DeleteFile(GenreImageEntry? entry)
    {
        if (entry is null || string.IsNullOrEmpty(entry.FileName))
        {
            return;
        }

        string path = PathOf(entry);
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }

    private Dictionary<string, GenreImageEntry> LoadIndex()
    {
        if (_index is not null)
        {
            return _index;
        }

        _index = new Dictionary<string, GenreImageEntry>(StringComparer.Ordinal);
        string path = Path.Combine(_directory, IndexFileName);
        if (File.Exists(path))
        {
            try
            {
                using FileStream stream = File.OpenRead(path);
                Dictionary<string, GenreImageEntry>? stored = JsonSerializer.Deserialize<Dictionary<string, GenreImageEntry>>(stream, JsonOptions);
                foreach (GenreImageEntry entry in stored?.Values ?? Enumerable.Empty<GenreImageEntry>())
                {
                    string? name = NormalizeName(entry.Name);
                    if (name is null)
                    {
                        continue;
                    }

                    // Entries written before shapes existed carry no shape: they were poster thumbnails.
                    entry.Shape = NormalizeShape(entry.Shape);
                    _index[KeyOf(name, entry.Shape)] = entry;
                }
            }
            catch (JsonException ex)
            {
                LogUnreadableIndex(path, ex);
            }
            catch (IOException ex)
            {
                LogUnreadableIndex(path, ex);
            }
        }

        return _index;
    }

    private void SaveIndex(Dictionary<string, GenreImageEntry> index)
    {
        Directory.CreateDirectory(_directory);
        string path = Path.Combine(_directory, IndexFileName);
        string temp = path + ".tmp";
        using (FileStream stream = File.Create(temp))
        {
            JsonSerializer.Serialize(stream, index, JsonOptions);
        }

        File.Move(temp, path, overwrite: true);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Customized Home: could not read genre image index {Path}, ignoring it")]
    private partial void LogUnreadableIndex(string path, Exception exception);

    private sealed record ImageFormat(string Extension, string ContentType)
    {
        private static readonly byte[] PngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

        /// <summary>
        /// Identifies the image from its first bytes: the declared content type of an upload is never trusted.
        /// </summary>
        public static ImageFormat? Detect(byte[] data)
        {
            if (data.Length >= PngSignature.Length && data.AsSpan(0, PngSignature.Length).SequenceEqual(PngSignature))
            {
                return new ImageFormat(".png", "image/png");
            }

            if (data.Length >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF)
            {
                return new ImageFormat(".jpg", "image/jpeg");
            }

            if (data.Length >= 12
                && data.AsSpan(0, 4).SequenceEqual("RIFF"u8)
                && data.AsSpan(8, 4).SequenceEqual("WEBP"u8))
            {
                return new ImageFormat(".webp", "image/webp");
            }

            return null;
        }
    }
}

/// <summary>
/// A custom genre thumbnail.
/// </summary>
public class GenreImageEntry
{
    /// <summary>
    /// Gets or sets the genre name.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the card shape the thumbnail is meant for: portrait, landscape or square.
    /// </summary>
    public string Shape { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the stored file name (internal, hash based).
    /// </summary>
    public string FileName { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the detected content type.
    /// </summary>
    public string ContentType { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets a value that changes each time the thumbnail is replaced (cache busting).
    /// </summary>
    public long Version { get; set; }
}
