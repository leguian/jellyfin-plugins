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
    private const string TempSuffix = ".tmp";
    private const string CorruptSuffix = ".bad";
    private const string IndexUnreadableMessage = "The genre thumbnail index could not be read: nothing was changed.";
    private const int MaxGenreNameLength = 100;

    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private readonly object _lock = new();
    private readonly string _directory;
    private readonly ILogger<GenreImageStore> _logger;
    private readonly Func<string, Stream> _openRead;
    private Dictionary<string, GenreImageEntry>? _index;

    /// <summary>
    /// Initializes a new instance of the <see cref="GenreImageStore"/> class.
    /// </summary>
    /// <param name="applicationPaths">The application paths.</param>
    /// <param name="logger">The logger.</param>
    public GenreImageStore(IApplicationPaths applicationPaths, ILogger<GenreImageStore> logger)
        : this(applicationPaths, logger, File.OpenRead)
    {
    }

    /// <summary>
    /// Initializes a new instance of the <see cref="GenreImageStore"/> class with its own way of opening files.
    /// Test seam: a locked file or a denied access cannot be produced the same way on every platform. Being
    /// internal, this constructor is invisible to the dependency injection container.
    /// </summary>
    /// <param name="applicationPaths">The application paths.</param>
    /// <param name="logger">The logger.</param>
    /// <param name="openRead">Opens a file for reading.</param>
    internal GenreImageStore(IApplicationPaths applicationPaths, ILogger<GenreImageStore> logger, Func<string, Stream> openRead)
    {
        ArgumentNullException.ThrowIfNull(applicationPaths);
        _directory = Path.Combine(PluginData.GetRoot(applicationPaths), PluginData.GenresFolder);
        _logger = logger;
        _openRead = openRead;
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
            return (LoadIndex()?.Values ?? Enumerable.Empty<GenreImageEntry>())
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
    /// <exception cref="IOException">The index could not be read, or the thumbnail could not be written: nothing changed.</exception>
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
            // Writing over an index that could not be read would drop every other thumbnail.
            Dictionary<string, GenreImageEntry> index = LoadIndex() ?? throw new IOException(IndexUnreadableMessage);
            string key = KeyOf(name, normalizedShape);
            Directory.CreateDirectory(_directory);
            index.TryGetValue(key, out GenreImageEntry? previous);

            // Both parts come from this class: a hash and a known shape name.
            string fileName = HashOf(name) + "-" + normalizedShape + format.Extension;
            string path = Path.Combine(_directory, fileName);

            // Same format as before: the new file takes the place of the previous one in a single move.
            bool takesThePlaceOfThePrevious = previous is not null && string.Equals(previous.FileName, fileName, StringComparison.OrdinalIgnoreCase);

            // Strictly increasing: the version is part of the image URL, which clients cache for good.
            GenreImageEntry entry = new()
            {
                Name = name,
                Shape = normalizedShape,
                FileName = fileName,
                ContentType = format.ContentType,
                Version = Math.Max(DateTime.UtcNow.Ticks, (previous?.Version ?? 0) + 1)
            };
            Dictionary<string, GenreImageEntry> updated = new(index, StringComparer.Ordinal) { [key] = entry };

            // Image first, index next, previous file last: whenever this stops, the index on disk and the one in
            // memory both name a complete file.
            WriteAtomically(path, stream => stream.Write(data));
            try
            {
                SaveIndex(updated);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                if (!takesThePlaceOfThePrevious)
                {
                    TryDeleteFile(path);
                }

                throw;
            }

            _index = updated;
            if (!takesThePlaceOfThePrevious && previous is not null && !string.IsNullOrEmpty(previous.FileName))
            {
                TryDeleteFile(PathOf(previous));
            }

            return entry;
        }
    }

    /// <summary>
    /// Deletes the thumbnail of a genre for a card shape.
    /// </summary>
    /// <param name="genreName">The genre name.</param>
    /// <param name="shape">The card shape.</param>
    /// <returns><c>true</c> when a thumbnail existed.</returns>
    /// <exception cref="IOException">The index could not be read or written: nothing changed.</exception>
    public bool Delete(string? genreName, string? shape)
    {
        string? name = NormalizeName(genreName);
        if (name is null)
        {
            return false;
        }

        lock (_lock)
        {
            Dictionary<string, GenreImageEntry> index = LoadIndex() ?? throw new IOException(IndexUnreadableMessage);
            string key = KeyOf(name, NormalizeShape(shape));
            if (!index.TryGetValue(key, out GenreImageEntry? entry))
            {
                return false;
            }

            Dictionary<string, GenreImageEntry> updated = new(index, StringComparer.Ordinal);
            updated.Remove(key);

            // Index first: a file the index no longer names is harmless, an entry without its file is not.
            SaveIndex(updated);
            _index = updated;
            if (!string.IsNullOrEmpty(entry.FileName))
            {
                TryDeleteFile(PathOf(entry));
            }

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
            Dictionary<string, GenreImageEntry>? index = LoadIndex();
            if (index is null || !index.TryGetValue(KeyOf(name, NormalizeShape(shape)), out GenreImageEntry? entry))
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

    /// <summary>
    /// Writes a file under a temporary name, then gives it its name: readers never see half a file, and a
    /// failed write leaves the previous contents in place.
    /// </summary>
    private static void WriteAtomically(string path, Action<Stream> write)
    {
        string temp = path + TempSuffix;
        try
        {
            using (FileStream stream = File.Create(temp))
            {
                write(stream);
            }

            File.Move(temp, path, overwrite: true);
        }
        catch
        {
            try
            {
                File.Delete(temp);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // The write already failed: that is the error to report.
            }

            throw;
        }
    }

    // The file name comes from the index written by this class, never from a request; GetFileName is a second guard.
    private string PathOf(GenreImageEntry entry)
    {
        return Path.Combine(_directory, Path.GetFileName(entry.FileName));
    }

    /// <summary>
    /// Deletes a file nothing refers to any more. Failing to do so only leaves an unused file behind.
    /// </summary>
    private void TryDeleteFile(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            LogLeftover(path, ex);
        }
    }

    /// <summary>
    /// Loads the index once. <c>null</c> means it could not be read this time: nothing is remembered, and
    /// nothing may be written over it.
    /// </summary>
    private Dictionary<string, GenreImageEntry>? LoadIndex()
    {
        if (_index is not null)
        {
            return _index;
        }

        Dictionary<string, GenreImageEntry> index = new(StringComparer.Ordinal);
        string path = Path.Combine(_directory, IndexFileName);
        if (File.Exists(path))
        {
            try
            {
                using Stream stream = _openRead(path);
                Dictionary<string, GenreImageEntry>? stored = JsonSerializer.Deserialize<Dictionary<string, GenreImageEntry>>(stream, JsonOptions);
                foreach (GenreImageEntry? entry in stored?.Values ?? Enumerable.Empty<GenreImageEntry>())
                {
                    string? name = NormalizeName(entry?.Name);
                    if (entry is null || name is null)
                    {
                        continue;
                    }

                    // Entries written before shapes existed carry no shape: they were poster thumbnails.
                    entry.Shape = NormalizeShape(entry.Shape);
                    index[KeyOf(name, entry.Shape)] = entry;
                }
            }
            catch (JsonException ex)
            {
                // The index itself is broken: start again from an empty one, and keep the broken file aside
                // because the next upload writes a new index.
                LogCorruptIndex(path, ex);
                index.Clear();
                SetCorruptIndexAside(path);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // The index may be fine (locked by a backup, permissions being fixed): the next call tries again.
                LogUnreadableIndex(path, ex);
                return null;
            }
        }

        _index = index;
        return index;
    }

    private void SetCorruptIndexAside(string path)
    {
        try
        {
            File.Move(path, path + CorruptSuffix, overwrite: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            LogLeftover(path, ex);
        }
    }

    private void SaveIndex(Dictionary<string, GenreImageEntry> index)
    {
        Directory.CreateDirectory(_directory);
        WriteAtomically(Path.Combine(_directory, IndexFileName), stream => JsonSerializer.Serialize(stream, index, JsonOptions));
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Customized Home: could not read genre image index {Path} this time, thumbnails are unavailable until it can be read")]
    private partial void LogUnreadableIndex(string path, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Customized Home: genre image index {Path} is corrupt, starting from an empty one (the file is kept with a .bad extension)")]
    private partial void LogCorruptIndex(string path, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Customized Home: could not remove or move {Path}, the file is left in place")]
    private partial void LogLeftover(string path, Exception exception);

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
