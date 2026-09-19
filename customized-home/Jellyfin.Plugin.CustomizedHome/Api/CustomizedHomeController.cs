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
using MediaBrowser.Model.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Net.Http.Headers;

namespace Jellyfin.Plugin.CustomizedHome.Api;

/// <summary>
/// Customized Home API: client assets, per-user layouts and administration.
/// </summary>
[ApiController]
[Route("CustomizedHome")]
public partial class CustomizedHomeController : ControllerBase
{
    private const string UserIdClaim = "Jellyfin-UserId";
    private const string AdministratorRole = "Administrator";
    private const string HomeScreenSectionsAssemblyName = "Jellyfin.Plugin.HomeScreenSections";

    // 5 MB image, base64 encoded, plus the JSON envelope.
    private const long GenreImageRequestLimit = 8 * 1024 * 1024;

    // About three times the largest layout the client can send (500 sections with long non-ASCII labels, genres on
    // the genre section only). Without a limit the body is fully deserialized before the validator can reject it.
    private const long LayoutRequestLimit = 2 * 1024 * 1024;

    private const string StorageUnavailableMessage = "The plugin data could not be written: nothing was changed. Try again later; the server log has the details.";

    private const string StorageUnreadableMessage = "The plugin data could not be read. Try again later; the server log has the details.";

    private static readonly ConcurrentDictionary<string, CachedAsset> AssetCache = new(StringComparer.Ordinal);

    private readonly LayoutStore _store;
    private readonly GenreImageStore _genreImages;
    private readonly WebInjectionService _injection;
    private readonly IUserManager _userManager;
    private readonly IUserViewManager _userViewManager;
    private readonly Func<PluginConfiguration> _configuration;
    private readonly ILogger<CustomizedHomeController> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="CustomizedHomeController"/> class.
    /// </summary>
    /// <param name="store">The layout store.</param>
    /// <param name="genreImages">The genre thumbnail store.</param>
    /// <param name="injection">The web injection service.</param>
    /// <param name="userManager">The user manager.</param>
    /// <param name="userViewManager">The user view manager.</param>
    /// <param name="logger">The logger.</param>
    public CustomizedHomeController(LayoutStore store, GenreImageStore genreImages, WebInjectionService injection, IUserManager userManager, IUserViewManager userViewManager, ILogger<CustomizedHomeController> logger)
        : this(store, genreImages, injection, userManager, userViewManager, logger, () => Plugin.Instance?.Configuration ?? new PluginConfiguration())
    {
    }

    /// <summary>
    /// Initializes a new instance of the <see cref="CustomizedHomeController"/> class with its own configuration source.
    /// Test seam: the plugin instance is a process wide singleton that only a running server creates. Being internal,
    /// this constructor is invisible to the dependency injection container, which only considers public constructors.
    /// </summary>
    /// <param name="store">The layout store.</param>
    /// <param name="genreImages">The genre thumbnail store.</param>
    /// <param name="injection">The web injection service.</param>
    /// <param name="userManager">The user manager.</param>
    /// <param name="userViewManager">The user view manager.</param>
    /// <param name="logger">The logger.</param>
    /// <param name="configuration">Gets the current plugin configuration.</param>
    internal CustomizedHomeController(LayoutStore store, GenreImageStore genreImages, WebInjectionService injection, IUserManager userManager, IUserViewManager userViewManager, ILogger<CustomizedHomeController> logger, Func<PluginConfiguration> configuration)
    {
        _store = store;
        _injection = injection;
        _userManager = userManager;
        _userViewManager = userViewManager;
        _genreImages = genreImages;
        _logger = logger;
        _configuration = configuration;
    }

    private PluginConfiguration Configuration => _configuration();

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
            // Saved before the user lost access to a library, or seeded from a default layout: same care.
            layout = ForUser(effectiveUserLayout, userId, writtenBySomeoneElse: false);
            source = "user";
        }
        else if (config.DefaultLayout.Items.Count > 0 || config.DefaultLayout.Hero.Enabled)
        {
            // A default layout may consist of the hero alone, above the regular home page.
            // Written by an administrator: it may list libraries this user must not know about.
            layout = ForUser(config.DefaultLayout, userId, writtenBySomeoneElse: true);
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
    [RequestSizeLimit(LayoutRequestLimit)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
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

        try
        {
            _store.Save(userId, normalized);
        }
        catch (Exception ex) when (IsStorageFailure(ex))
        {
            return StorageUnavailable("save a layout", ex);
        }

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
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
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

        try
        {
            _store.Delete(target);
        }
        catch (Exception ex) when (IsStorageFailure(ex))
        {
            return StorageUnavailable("delete a layout", ex);
        }

        return NoContent();
    }

    /// <summary>
    /// Gets the default layout (administrators).
    /// </summary>
    /// <returns>The default layout.</returns>
    [HttpGet("DefaultLayout")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
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
    [RequestSizeLimit(LayoutRequestLimit)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
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

        HomeLayout previous = plugin.Configuration.DefaultLayout;
        plugin.Configuration.DefaultLayout = normalized;
        try
        {
            plugin.SaveConfiguration();
        }
        catch (Exception ex) when (IsStorageFailure(ex))
        {
            // The XML file was not written: keeping the new layout in memory would apply it until the next
            // restart, then silently lose it.
            plugin.Configuration.DefaultLayout = previous;
            return StorageUnavailable("save the default layout", ex);
        }

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
        // A layout whose user is gone has no name to show and nothing to reset: it is not listed.
        // One lookup per stored layout: on Jellyfin 12 each of them is a database query.
        Dictionary<Guid, string> names = new();
        IReadOnlyList<StoredLayoutInfo> layouts = _store.List(userId =>
        {
            string? name = FindUserName(userId);
            if (name is null)
            {
                return false;
            }

            names[userId] = name;
            return true;
        });
        foreach (StoredLayoutInfo info in layouts)
        {
            info.UserName = names[info.UserId];
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
        return Ok(_genreImages.List().Select(entry => new GenreImageInfo { Name = entry.Name, Shape = entry.Shape, Version = entry.Version }).ToList());
    }

    /// <summary>
    /// Serves the custom thumbnail of a genre. Anonymous like every Jellyfin image: it is loaded by plain image requests.
    /// </summary>
    /// <param name="name">The genre name.</param>
    /// <param name="shape">The card shape: portrait (default), landscape or square.</param>
    /// <returns>The image.</returns>
    [HttpGet("GenreImages/Image")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public ActionResult GetGenreImage([FromQuery] string? name, [FromQuery] string? shape)
    {
        (byte[] Data, string ContentType)? image;
        try
        {
            image = _genreImages.Read(name, shape);
        }
        catch (Exception ex) when (IsStorageFailure(ex))
        {
            // Not a 404: the thumbnail exists, the disk refused it this time. A 404 on a URL served as
            // immutable would be cached by browsers and proxies long after the disk is fine again.
            return StorageUnavailable("read a genre thumbnail", ex, StorageUnreadableMessage);
        }

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
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
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

        GenreImageEntry? entry;
        string? error;
        try
        {
            entry = _genreImages.Save(upload.Name, upload.Shape, data, out error);
        }
        catch (Exception ex) when (IsStorageFailure(ex))
        {
            return StorageUnavailable("save a genre thumbnail", ex);
        }

        if (entry is null)
        {
            return BadRequest(error);
        }

        return new GenreImageInfo { Name = entry.Name, Shape = entry.Shape, Version = entry.Version };
    }

    /// <summary>
    /// Deletes the thumbnail of a genre (administrators).
    /// </summary>
    /// <param name="name">The genre name.</param>
    /// <param name="shape">The card shape: portrait (default), landscape or square.</param>
    /// <returns>No content.</returns>
    [HttpDelete("GenreImages")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public ActionResult DeleteGenreImage([FromQuery] string? name, [FromQuery] string? shape)
    {
        try
        {
            _genreImages.Delete(name, shape);
        }
        catch (Exception ex) when (IsStorageFailure(ex))
        {
            return StorageUnavailable("delete a genre thumbnail", ex);
        }

        return NoContent();
    }

    private static bool IsHomeScreenSectionsInstalled()
    {
        return AssemblyLoadContext.All
            .SelectMany(context => context.Assemblies)
            .Any(assembly => string.Equals(assembly.GetName().Name, HomeScreenSectionsAssemblyName, StringComparison.Ordinal));
    }

    // What a store throws when the disk refuses: a file locked by a backup, permissions, a full disk.
    private static bool IsStorageFailure(Exception exception)
    {
        return exception is IOException or UnauthorizedAccessException;
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
            UserLayoutCount = _store.List(UserExists).Count,
            DefaultLayoutItemCount = Configuration.DefaultLayout.Items.Count
        };
    }

    /// <summary>
    /// Answers a request the disk refused: the cause goes to the server log, the client gets a message it can show
    /// instead of an anonymous error 500.
    /// </summary>
    private ObjectResult StorageUnavailable(string operation, Exception exception, string message = StorageUnavailableMessage)
    {
        LogStorageFailure(operation, exception);
        return StatusCode(StatusCodes.Status503ServiceUnavailable, message);
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

    private HomeLayout ForUser(HomeLayout layout, Guid userId, bool writtenBySomeoneElse)
    {
        // Most layouts list no library: the user's views are only looked up when one does.
        return DefaultLayoutFilter.NeedsFiltering(layout)
            ? DefaultLayoutFilter.ForUser(layout, GetAccessibleViews(userId), writtenBySomeoneElse)
            : layout;
    }

    private HashSet<Guid> GetAccessibleViews(Guid userId)
    {
        var user = userId == Guid.Empty ? null : _userManager.GetUserById(userId);
        if (user is null)
        {
            return new HashSet<Guid>();
        }

        // Views the user hid from their home page are still theirs to see.
        return _userViewManager.GetUserViews(new UserViewQuery { User = user, IncludeHidden = true })
            .Select(view => view.Id)
            .ToHashSet();
    }

    private bool UserExists(Guid userId)
    {
        return FindUserName(userId) is not null;
    }

    private string? FindUserName(Guid userId)
    {
        // The user manager refuses the empty identifier with an exception.
        return userId == Guid.Empty ? null : _userManager.GetUserById(userId)?.Username;
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

    [LoggerMessage(Level = LogLevel.Warning, Message = "Customized Home: could not {Operation}, the request was answered with an error 503")]
    private partial void LogStorageFailure(string operation, Exception exception);

    private sealed record CachedAsset(byte[] Bytes, string ETag);
}
