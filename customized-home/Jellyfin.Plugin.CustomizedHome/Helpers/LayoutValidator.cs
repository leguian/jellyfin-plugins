using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;
using Jellyfin.Plugin.CustomizedHome.Models;

namespace Jellyfin.Plugin.CustomizedHome.Helpers;

/// <summary>
/// Validates and normalizes layouts received from clients.
/// </summary>
public static partial class LayoutValidator
{
    private const int MaxItems = 500;
    private const int MaxKeyLength = 200;
    private const int MaxNameLength = 100;
    private const int MaxLabelLength = 200;
    private const int MaxIconLength = 64;
    private const int MaxGenres = 20;
    private const int MaxGenreLength = 100;

    /// <summary>
    /// Validates a layout and returns a normalized copy.
    /// </summary>
    /// <param name="layout">The layout to validate.</param>
    /// <param name="error">The validation error when the layout is rejected.</param>
    /// <returns>The normalized layout, or <c>null</c> when invalid.</returns>
    public static HomeLayout? Normalize(HomeLayout? layout, out string? error)
    {
        error = null;
        if (layout is null)
        {
            error = "Layout is required.";
            return null;
        }

        HomeLayout result = new()
        {
            Version = 1,
            HideUnlisted = layout.HideUnlisted
        };

        int count = 0;
        HashSet<string> keys = new(StringComparer.Ordinal);
        HashSet<string> folderIds = new(StringComparer.Ordinal);

        foreach (LayoutItem item in layout.Items)
        {
            if (item is null)
            {
                continue;
            }

            if (++count > MaxItems)
            {
                error = "Too many items in the layout.";
                return null;
            }

            if (IsFolder(item))
            {
                LayoutItem folder = NormalizeFolder(item, folderIds);
                foreach (LayoutItem member in item.Items)
                {
                    if (member is null || IsFolder(member))
                    {
                        // Nested folders are not supported: skip them silently.
                        continue;
                    }

                    if (++count > MaxItems)
                    {
                        error = "Too many items in the layout.";
                        return null;
                    }

                    LayoutItem? section = NormalizeSection(member, keys);
                    if (section is not null)
                    {
                        folder.Items.Add(section);
                    }
                }

                result.Items.Add(folder);
            }
            else
            {
                LayoutItem? section = NormalizeSection(item, keys);
                if (section is not null)
                {
                    result.Items.Add(section);
                }
            }
        }

        return result;
    }

    private static bool IsFolder(LayoutItem item)
    {
        return string.Equals(item.Type, LayoutItemTypes.Folder, StringComparison.OrdinalIgnoreCase);
    }

    private static LayoutItem NormalizeFolder(LayoutItem item, HashSet<string> folderIds)
    {
        string id = Truncate(item.Id?.Trim(), MaxKeyLength) ?? string.Empty;
        if (id.Length == 0 || !folderIds.Add(id))
        {
            id = Guid.NewGuid().ToString("N", CultureInfo.InvariantCulture);
            folderIds.Add(id);
        }

        string? icon = Truncate(item.Icon?.Trim(), MaxIconLength);
        if (icon is not null && !IconRegex().IsMatch(icon))
        {
            icon = null;
        }

        return new LayoutItem
        {
            Type = LayoutItemTypes.Folder,
            Id = id,
            Name = Truncate(item.Name?.Trim(), MaxNameLength) ?? string.Empty,
            Icon = icon,
            Visible = item.Visible,
            Collapsed = item.Collapsed
        };
    }

    private static LayoutItem? NormalizeSection(LayoutItem item, HashSet<string> keys)
    {
        string? key = Truncate(item.Key?.Trim(), MaxKeyLength);
        if (string.IsNullOrEmpty(key) || !keys.Add(key))
        {
            // Missing or duplicate key: drop the entry.
            return null;
        }

        return new LayoutItem
        {
            Type = LayoutItemTypes.Section,
            Key = key,
            Label = Truncate(item.Label?.Trim(), MaxLabelLength),
            Visible = item.Visible,
            Shape = NormalizeChoice(item.Shape, LayoutFormats.Shapes, LayoutFormats.ShapeAuto),
            Size = NormalizeChoice(item.Size, LayoutFormats.Sizes, LayoutFormats.SizeNormal),
            ShowTitle = item.ShowTitle,
            Genres = NormalizeGenres(item.Genres)
        };
    }

    private static List<string> NormalizeGenres(List<string>? genres)
    {
        List<string> result = new();
        if (genres is null)
        {
            return result;
        }

        HashSet<string> seen = new(StringComparer.OrdinalIgnoreCase);
        foreach (string genre in genres)
        {
            string? name = Truncate(genre?.Trim(), MaxGenreLength);
            if (string.IsNullOrEmpty(name) || !seen.Add(name))
            {
                continue;
            }

            result.Add(name);
            if (result.Count >= MaxGenres)
            {
                break;
            }
        }

        return result;
    }

    private static string NormalizeChoice(string? value, string[] allowed, string fallback)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return fallback;
        }

        string trimmed = value.Trim().ToLowerInvariant();
        return Array.IndexOf(allowed, trimmed) >= 0 ? trimmed : fallback;
    }

    private static string? Truncate(string? value, int maxLength)
    {
        if (string.IsNullOrEmpty(value))
        {
            return value;
        }

        return value.Length <= maxLength ? value : value[..maxLength];
    }

    [GeneratedRegex("^[a-z0-9_]+$")]
    private static partial Regex IconRegex();
}
