using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Security.Cryptography;
using Jellyfin.Plugin.CustomizedHome.Configuration;
using Jellyfin.Plugin.CustomizedHome.Helpers;
using Jellyfin.Plugin.CustomizedHome.Models;
using Jellyfin.Plugin.CustomizedHome.Services;
using MediaBrowser.Common.Api;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace Jellyfin.Plugin.CustomizedHome.Api;

/// <summary>
/// Customized Home API: client assets, per-user layouts and administration.
/// </summary>
[ApiController]
[Route("CustomizedHome")]
public class CustomizedHomeController : ControllerBase
{
    private const string UserIdClaim = "Jellyfin-UserId";
    private const string AdministratorRole = "Administrator";
    private const string HomeScreenSectionsAssemblyName = "Jellyfin.Plugin.HomeScreenSections";

    // 5 MB image, base64 encoded, plus the JSON envelope.
    private const long GenreImageRequestLimit = 8 * 1024 * 1024;

    private static readonly ConcurrentDictionary<string, CachedAsset> AssetCache = new(StringComparer.Ordinal);

    private readonly LayoutStore _store;
    private readonly GenreImageStore _genreImages;
    private readonly WebInjectionService _injection;
    private readonly IUserManager _userManager;

    /// <summary>
    /// Initializes a new instance of the <see cref="CustomizedHomeController"/> class.
    /// </summary>
    /// <param name="store">The layout store.</param>
    /// <param name="genreImages">The genre thumbnail store.</param>
    /// <param name="injection">The web injection service.</param>
    /// <param name="userManager">The user manager.</param>
    public CustomizedHomeController(LayoutStore store, GenreImageStore genreImages, WebInjectionService injection, IUserManager userManager)
    {
        _store = store;
        _injection = injection;
        _userManager = userManager;
        _genreImages = genreImages;
    }

    private static PluginConfiguration Configuration => Plugin.Instance?.Configuration ?? new PluginConfiguration();

    /// <summary>
    /// Serves the client script injected into the web client.
    /// </summary>
    /// <returns>The script.</returns>
    [HttpGet("customized-home.js")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status304NotModified)]
    public ActionResult GetScript()
    {
        return ServeAsset("Web.customized-home.js", "application/javascript; charset=utf-8");
    }

    /// <summary>
    /// Serves the client stylesheet injected into the web client.
    /// </summary>
    /// <returns>The stylesheet.</returns>
    [HttpGet("customized-home.css")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status304NotModified)]
    public ActionResult GetStylesheet()
    {
        return ServeAsset("Web.customized-home.css", "text/css; charset=utf-8");
    }

    /// <summary>
    /// Gets the layout to apply for the current user, with the options relevant to the client.
    /// </summary>
    /// <returns>The layout response.</returns>
    [HttpGet("Layout")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<LayoutResponse> GetLayout()
    {
        PluginConfiguration config = Configuration;
        Guid userId = GetUserId();
        bool isAdmin = IsAdministrator();
        bool canCustomize = CanCustomize(config, isAdmin);

        HomeLayout? userLayout = userId == Guid.Empty ? null : _store.Get(userId);
        HomeLayout? effectiveUserLayout = canCustomize ? userLayout : null;

        HomeLayout layout;
        string source;
        if (effectiveUserLayout is not null)
        {
            layout = effectiveUserLayout;
            source = "user";
        }
        else if (config.DefaultLayout.Items.Count > 0)
        {
            layout = config.DefaultLayout;
            source = "default";
        }
        else
        {
            layout = new HomeLayout();
            source = "none";
        }

        return new LayoutResponse
        {
            Source = source,
            Layout = layout,
            CanCustomize = canCustomize,
            HasUserLayout = userLayout is not null,
            IsAdministrator = isAdmin,
            ShowCustomizeButtonOnHome = config.ShowCustomizeButtonOnHome,
            ShowUserMenuEntry = config.ShowUserMenuEntry,
            FoldersCollapsible = config.FoldersCollapsible,
            EnableIntegratedSections = config.EnableIntegratedSections,
            PluginVersion = Plugin.Instance?.VersionString ?? string.Empty
        };
    }

    /// <summary>
    /// Saves the layout of the current user.
    /// </summary>
    /// <param name="layout">The layout.</param>
    /// <returns>The normalized layout that was saved.</returns>
    [HttpPost("Layout")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public ActionResult<HomeLayout> SaveLayout([FromBody] HomeLayout layout)
    {
        Guid userId = GetUserId();
        if (userId == Guid.Empty)
        {
            return Forbid();
        }

        if (!CanCustomize(Configuration, IsAdministrator()))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Home customization is disabled by the administrator.");
        }

        HomeLayout? normalized = LayoutValidator.Normalize(layout, out string? error);
        if (normalized is null)
        {
            return BadRequest(error);
        }

        _store.Save(userId, normalized);
        return normalized;
    }

    /// <summary>
    /// Deletes the saved layout of the current user (or of another user for administrators).
    /// </summary>
    /// <param name="userId">Optional user identifier (administrators only).</param>
    /// <returns>No content.</returns>
    [HttpDelete("Layout")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public ActionResult ResetLayout([FromQuery] Guid? userId)
    {
        Guid current = GetUserId();
        Guid target = userId ?? current;
        if (target == Guid.Empty)
        {
            return Forbid();
        }

        if (target != current && !IsAdministrator())
        {
            return Forbid();
        }

        _store.Delete(target);
        return NoContent();
    }

    /// <summary>
    /// Gets the default layout (administrators).
    /// </summary>
    /// <returns>The default layout.</returns>
    [HttpGet("DefaultLayout")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [SuppressMessage("Performance", "CA1822:Mark members as static", Justification = "MVC action method.")]
    public ActionResult<HomeLayout> GetDefaultLayout()
    {
        return Configuration.DefaultLayout;
    }

    /// <summary>
    /// Saves the default layout (administrators).
    /// </summary>
    /// <param name="layout">The layout.</param>
    /// <returns>The normalized layout that was saved.</returns>
    [HttpPost("DefaultLayout")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public ActionResult<HomeLayout> SaveDefaultLayout([FromBody] HomeLayout layout)
    {
        Plugin? plugin = Plugin.Instance;
        if (plugin is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, "Plugin not initialized.");
        }

        HomeLayout? normalized = LayoutValidator.Normalize(layout, out string? error);
        if (normalized is null)
        {
            return BadRequest(error);
        }

        plugin.Configuration.DefaultLayout = normalized;
        plugin.SaveConfiguration();
        return normalized;
    }

    /// <summary>
    /// Gets the catalog of known sections.
    /// </summary>
    /// <returns>The section definitions.</returns>
    [HttpGet("Catalog")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [SuppressMessage("Performance", "CA1822:Mark members as static", Justification = "MVC action method.")]
    public ActionResult<IReadOnlyList<SectionDefinition>> GetCatalog()
    {
        if (IsHomeScreenSectionsInstalled())
        {
            return Ok(SectionCatalog.All);
        }

        // Without the Home Screen Sections plugin its sections can never be rendered: keep them out of the editor.
        return Ok(SectionCatalog.All
            .Where(definition => !string.Equals(definition.Origin, SectionCatalog.HomeScreenSectionsOrigin, StringComparison.Ordinal))
            .ToList());
    }

    /// <summary>
    /// Gets diagnostic information (administrators).
    /// </summary>
    /// <returns>The status.</returns>
    [HttpGet("Status")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<PluginStatus> GetStatus()
    {
        return BuildStatus();
    }

    /// <summary>
    /// Retries the File Transformation registration (administrators).
    /// </summary>
    /// <returns>The status after the attempt.</returns>
    [HttpPost("Status/Retry")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<PluginStatus> RetryRegistration()
    {
        _injection.TryRegister();
        return BuildStatus();
    }

    /// <summary>
    /// Lists the users that saved their own layout (administrators).
    /// </summary>
    /// <returns>The stored layouts.</returns>
    [HttpGet("UserLayouts")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<StoredLayoutInfo>> GetUserLayouts()
    {
        IReadOnlyList<StoredLayoutInfo> layouts = _store.List();
        foreach (StoredLayoutInfo info in layouts)
        {
            info.UserName = _userManager.GetUserById(info.UserId)?.Username;
        }

        return Ok(layouts.OrderBy(info => info.UserName, StringComparer.OrdinalIgnoreCase).ToList());
    }

    /// <summary>
    /// Lists the genres that have a custom thumbnail.
    /// </summary>
    /// <returns>The genres and the version of their thumbnail.</returns>
    [HttpGet("GenreImages")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<GenreImageInfo>> GetGenreImages()
    {
        return Ok(_genreImages.List().Select(entry => new GenreImageInfo { Name = entry.Name, Version = entry.Version }).ToList());
    }

    /// <summary>
    /// Serves the custom thumbnail of a genre. Anonymous like every Jellyfin image: it is loaded by plain image requests.
    /// </summary>
    /// <param name="name">The genre name.</param>
    /// <returns>The image.</returns>
    [HttpGet("GenreImages/Image")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult GetGenreImage([FromQuery] string? name)
    {
        (byte[] Data, string ContentType)? image = _genreImages.Read(name);
        if (image is null)
        {
            return NotFound();
        }

        // The URL carries a version parameter, so the response can be cached for good.
        Response.Headers[HeaderNames.CacheControl] = "public, max-age=31536000, immutable";
        Response.Headers[HeaderNames.XContentTypeOptions] = "nosniff";
        return File(image.Value.Data, image.Value.ContentType);
    }

    /// <summary>
    /// Uploads the thumbnail of a genre (administrators).
    /// </summary>
    /// <param name="upload">The genre name and the base64 encoded image.</param>
    /// <returns>The stored thumbnail information.</returns>
    [HttpPost("GenreImages")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [RequestSizeLimit(GenreImageRequestLimit)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public ActionResult<GenreImageInfo> UploadGenreImage([FromBody] GenreImageUpload upload)
    {
        if (upload is null || string.IsNullOrEmpty(upload.Data))
        {
            return BadRequest("Image data is required.");
        }

        // Base64 inflates by 4/3: reject oversized payloads before decoding them.
        if (upload.Data.Length > (GenreImageStore.MaxImageBytes * 4 / 3) + 4)
        {
            return BadRequest("Image is larger than 5 MB.");
        }

        byte[] data;
        try
        {
            data = Convert.FromBase64String(upload.Data);
        }
        catch (FormatException)
        {
            return BadRequest("Image data is not valid base64.");
        }

        GenreImageEntry? entry = _genreImages.Save(upload.Name, data, out string? error);
        if (entry is null)
        {
            return BadRequest(error);
        }

        return new GenreImageInfo { Name = entry.Name, Version = entry.Version };
    }

    /// <summary>
    /// Deletes the thumbnail of a genre (administrators).
    /// </summary>
    /// <param name="name">The genre name.</param>
    /// <returns>No content.</returns>
    [HttpDelete("GenreImages")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public ActionResult DeleteGenreImage([FromQuery] string? name)
    {
        _genreImages.Delete(name);
        return NoContent();
    }

    private static bool IsHomeScreenSectionsInstalled()
    {
        return AssemblyLoadContext.All
            .SelectMany(context => context.Assemblies)
            .Any(assembly => string.Equals(assembly.GetName().Name, HomeScreenSectionsAssemblyName, StringComparison.Ordinal));
    }

    private static CachedAsset LoadAsset(string suffix)
    {
        string resourceName = typeof(Plugin).Namespace + "." + suffix;
        using Stream? stream = typeof(Plugin).Assembly.GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            return new CachedAsset([], string.Empty);
        }

        using MemoryStream memory = new();
        stream.CopyTo(memory);
        byte[] bytes = memory.ToArray();
        string etag = "\"" + Convert.ToHexString(SHA256.HashData(bytes))[..16].ToLowerInvariant() + "\"";
        return new CachedAsset(bytes, etag);
    }

    private PluginStatus BuildStatus()
    {
        return new PluginStatus
        {
            PluginVersion = Plugin.Instance?.VersionString ?? string.Empty,
            RootPath = TransformationPatches.GetRootPath(),
            Injection = _injection.Status,
            UserLayoutCount = _store.List().Count,
            DefaultLayoutItemCount = Configuration.DefaultLayout.Items.Count
        };
    }

    private ActionResult ServeAsset(string suffix, string contentType)
    {
        CachedAsset asset = AssetCache.GetOrAdd(suffix, LoadAsset);
        if (asset.Bytes.Length == 0)
        {
            return NotFound();
        }

        bool developerMode = Configuration.DeveloperMode;
        Response.Headers[HeaderNames.CacheControl] = developerMode ? "no-store" : "no-cache";
        Response.Headers[HeaderNames.ETag] = asset.ETag;

        if (!developerMode)
        {
            string ifNoneMatch = Request.Headers[HeaderNames.IfNoneMatch].ToString();
            if (!string.IsNullOrEmpty(ifNoneMatch) && ifNoneMatch.Contains(asset.ETag, StringComparison.Ordinal))
            {
                return StatusCode(StatusCodes.Status304NotModified);
            }
        }

        return File(asset.Bytes, contentType);
    }

    private static bool CanCustomize(PluginConfiguration config, bool isAdmin)
    {
        if (config.ForceDefaultLayout)
        {
            return false;
        }

        return isAdmin || config.AllowUserCustomization;
    }

    private Guid GetUserId()
    {
        string? value = User.FindFirst(UserIdClaim)?.Value;
        return Guid.TryParse(value, out Guid userId) ? userId : Guid.Empty;
    }

    private bool IsAdministrator()
    {
        return User.IsInRole(AdministratorRole);
    }

    private sealed record CachedAsset(byte[] Bytes, string ETag);
}
