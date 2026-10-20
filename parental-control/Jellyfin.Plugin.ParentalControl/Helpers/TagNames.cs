using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace Jellyfin.Plugin.ParentalControl.Helpers;

/// <summary>
/// Names of the tags the plugin writes for the profiles. They start with a reserved prefix that labels cannot use.
/// </summary>
public static class TagNames
{
    /// <summary>
    /// Prefix of every profile tag, reserved: no label may start with it.
    /// </summary>
    public const string ReservedPrefix = "pc-";

    private const string HiddenPrefix = ReservedPrefix + "hidden-";
    private const string AllowedPrefix = ReservedPrefix + "allowed-";
    private const int MaxKeyLength = 24;

    /// <summary>
    /// Gets the tag written on the items hidden from a profile.
    /// </summary>
    /// <param name="key">The profile tag key.</param>
    /// <returns>The tag.</returns>
    public static string Hidden(string key) => HiddenPrefix + key;

    /// <summary>
    /// Gets the tag written on the items allowed to a profile.
    /// </summary>
    /// <param name="key">The profile tag key.</param>
    /// <returns>The tag.</returns>
    public static string Allowed(string key) => AllowedPrefix + key;

    /// <summary>
    /// Tells whether a name uses the reserved prefix (compared like Jellyfin compares tags: case and accents ignored).
    /// </summary>
    /// <param name="name">The name.</param>
    /// <returns><c>true</c> when the name is reserved.</returns>
    public static bool IsReserved(string name)
    {
        return Fold(name).StartsWith(ReservedPrefix, StringComparison.Ordinal);
    }

    /// <summary>
    /// Folds a tag the way Jellyfin matches tags in its queries: accents removed, lower case.
    /// </summary>
    /// <param name="tag">The tag.</param>
    /// <returns>The folded tag.</returns>
    public static string Fold(string tag)
    {
        string decomposed = (tag ?? string.Empty).Trim().Normalize(NormalizationForm.FormD);
        StringBuilder builder = new(decomposed.Length);
        foreach (char c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
            {
                builder.Append(c);
            }
        }

        return builder.ToString().Normalize(NormalizationForm.FormC).ToLowerInvariant();
    }

    /// <summary>
    /// Builds the tag key of a new profile from the user name: ASCII letters and digits, unique among the keys in use.
    /// </summary>
    /// <param name="userName">The user name.</param>
    /// <param name="userId">The user identifier, the fallback when the name has no usable character.</param>
    /// <param name="used">The keys already in use.</param>
    /// <returns>The key.</returns>
    public static string MakeKey(string? userName, Guid userId, IEnumerable<string> used)
    {
        HashSet<string> taken = new(used, StringComparer.OrdinalIgnoreCase);
        StringBuilder builder = new();
        foreach (char c in Fold(userName ?? string.Empty))
        {
            if (builder.Length >= MaxKeyLength)
            {
                break;
            }

            if (c is >= 'a' and <= 'z' or >= '0' and <= '9')
            {
                builder.Append(c);
            }
            else if (builder.Length > 0 && builder[^1] != '-')
            {
                builder.Append('-');
            }
        }

        string baseKey = builder.ToString().Trim('-');
        if (baseKey.Length == 0)
        {
            baseKey = userId.ToString("N", CultureInfo.InvariantCulture)[..8];
        }

        string key = baseKey;
        for (int suffix = 2; taken.Contains(key); suffix++)
        {
            key = baseKey + "-" + suffix.ToString(CultureInfo.InvariantCulture);
        }

        return key;
    }

    /// <summary>
    /// Tells whether a tag key has the shape <see cref="MakeKey"/> gives.
    /// </summary>
    /// <param name="key">The key.</param>
    /// <returns><c>true</c> when the key is usable.</returns>
    public static bool IsValidKey(string? key)
    {
        return !string.IsNullOrEmpty(key)
            && key.Length <= MaxKeyLength + 4
            && key.All(c => c is >= 'a' and <= 'z' or >= '0' and <= '9' or '-')
            && key[0] != '-'
            && key[^1] != '-';
    }
}
