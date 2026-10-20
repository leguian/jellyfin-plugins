using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.ParentalControl.Services;

/// <summary>
/// Reads and writes the JSON data files of the plugin. A write goes to a temporary file first, then replaces the
/// previous file: a crash or a full disk never leaves half a file behind.
/// </summary>
internal static class JsonFile
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = false,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    /// <summary>
    /// Reads a file, or returns <c>null</c> when it does not exist.
    /// </summary>
    /// <typeparam name="T">The type of the content.</typeparam>
    /// <param name="path">The file.</param>
    /// <returns>The content.</returns>
    /// <exception cref="JsonException">The file is not valid JSON.</exception>
    /// <exception cref="IOException">The file could not be read.</exception>
    public static T? Read<T>(string path)
        where T : class
    {
        if (!File.Exists(path))
        {
            return null;
        }

        using FileStream stream = File.OpenRead(path);
        return JsonSerializer.Deserialize<T>(stream, Options);
    }

    /// <summary>
    /// Writes a file atomically.
    /// </summary>
    /// <typeparam name="T">The type of the content.</typeparam>
    /// <param name="path">The file.</param>
    /// <param name="value">The content.</param>
    /// <exception cref="IOException">The file could not be written: the previous one is still there.</exception>
    public static void Write<T>(string path, T value)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        string temp = path + ".tmp";
        using (FileStream stream = File.Create(temp))
        {
            JsonSerializer.Serialize(stream, value, Options);
        }

        File.Move(temp, path, overwrite: true);
    }
}
