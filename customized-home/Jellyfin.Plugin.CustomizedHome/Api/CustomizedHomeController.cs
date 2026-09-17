using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.IO;
using System.Linq;
using System.Reflection;
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

    private static readonly ConcurrentDictionary<string, CachedAsset> AssetCache = new(StringComparer.Ordinal);

    private readonly LayoutStore _store;
    private readonly WebInjectionService _injection;
    private readonly IUserManager _userManager;

    /// <summary>
    /// Initializes a new instance of the <see cref="CustomizedHomeController"/> class.
    /// </summary>
    /// <param name="store">The layout store.</param>
    /// <param name="injection">The web injection service.</param>
    /// <param name="userManager">The user manager.</param>
    public CustomizedHomeController(LayoutStore store, WebInjectionService injection, IUserManager userManager)
    {
        _store = store;
        _injection = injection;
        _userManager = userManager;
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
    public ActionResult<IReadOnlyList<SectionDefinition>> GetCatalog()
    {
        return Ok(SectionCatalog.All);
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
