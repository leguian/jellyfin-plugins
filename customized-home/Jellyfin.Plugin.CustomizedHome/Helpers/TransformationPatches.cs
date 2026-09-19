using System;
using System.Globalization;
using Jellyfin.Plugin.CustomizedHome.Models;
using MediaBrowser.Common.Net;

namespace Jellyfin.Plugin.CustomizedHome.Helpers;

/// <summary>
/// Callbacks invoked by the File Transformation plugin.
/// </summary>
public static class TransformationPatches
{
    /// <summary>
    /// Attribute marking the injected tags (also used to detect an already patched document).
    /// </summary>
    public const string Marker = "data-plugin=\"CustomizedHome\"";

    /// <summary>
    /// Injects the client stylesheet and script into index.html.
    /// </summary>
    /// <param name="payload">The transformation payload.</param>
    /// <returns>The patched document.</returns>
    public static string IndexHtml(TransformationPayload payload)
    {
        ArgumentNullException.ThrowIfNull(payload);

        string contents = payload.Contents ?? string.Empty;
        if (contents.Contains(Marker, StringComparison.Ordinal)
            || !contents.Contains("</body>", StringComparison.OrdinalIgnoreCase))
        {
            // Already patched, or not an HTML document: leave it untouched.
            return contents;
        }

        return InjectAssets(contents, GetRootPath(), GetCacheKey());
    }

    /// <summary>
    /// Inserts the stylesheet and script tags into an HTML document, for a given root path and cache key.
    /// Test seam: the callback reads both from the plugin instance, which only a running server creates.
    /// Deliberately not an overload of <see cref="IndexHtml"/>: File Transformation looks the callback up by name.
    /// </summary>
    /// <param name="contents">The HTML document.</param>
    /// <param name="root">The base URL prefix ("" or "/prefix").</param>
    /// <param name="cacheKey">The cache-busting key of the client assets.</param>
    /// <returns>The patched document.</returns>
    internal static string InjectAssets(string contents, string root, string cacheKey)
    {
        string link = string.Format(
            CultureInfo.InvariantCulture,
            "<link rel=\"stylesheet\" href=\"{0}/CustomizedHome/customized-home.css?v={1}\" {2} />",
            root,
            cacheKey,
            Marker);
        string script = string.Format(
            CultureInfo.InvariantCulture,
            "<script src=\"{0}/CustomizedHome/customized-home.js?v={1}\" {2} defer></script>",
            root,
            cacheKey,
            Marker);

        contents = InsertBefore(contents, "</head>", link);
        contents = InsertBefore(contents, "</body>", script);
        return contents;
    }

    /// <summary>
    /// Gets the configured base URL prefix ("" or "/prefix").
    /// </summary>
    /// <returns>The root path without trailing slash.</returns>
    public static string GetRootPath()
    {
        return NormalizeRootPath(Plugin.Instance?.ServerConfigurationManager.GetNetworkConfiguration().BaseUrl);
    }

    /// <summary>
    /// Turns the base URL of the network configuration into a prefix usable in front of an absolute path.
    /// </summary>
    /// <param name="baseUrl">The configured base URL, with or without slashes around it.</param>
    /// <returns>"" or "/prefix", without trailing slash.</returns>
    internal static string NormalizeRootPath(string? baseUrl)
    {
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            return string.Empty;
        }

        string trimmed = baseUrl.Trim().Trim('/');
        return trimmed.Length == 0 ? string.Empty : "/" + trimmed;
    }

    /// <summary>
    /// Gets the cache-busting key of the client assets.
    /// </summary>
    /// <returns>A query string value.</returns>
    public static string GetCacheKey()
    {
        Plugin? plugin = Plugin.Instance;
        string version = Uri.EscapeDataString(plugin?.VersionString ?? "0");
        if (plugin?.Configuration.DeveloperMode == true)
        {
            return version + "-" + DateTime.UtcNow.Ticks.ToString(CultureInfo.InvariantCulture);
        }

        return version;
    }

    private static string InsertBefore(string contents, string closingTag, string fragment)
    {
        int index = contents.LastIndexOf(closingTag, StringComparison.OrdinalIgnoreCase);
        return index < 0 ? contents : contents.Insert(index, fragment);
    }
}
