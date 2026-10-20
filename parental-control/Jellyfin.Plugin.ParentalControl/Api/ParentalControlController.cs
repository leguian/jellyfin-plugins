using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.ParentalControl.Configuration;
using Jellyfin.Plugin.ParentalControl.Helpers;
using Jellyfin.Plugin.ParentalControl.Models;
using Jellyfin.Plugin.ParentalControl.Services;
using MediaBrowser.Common.Api;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Users;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Net.Http.Headers;

namespace Jellyfin.Plugin.ParentalControl.Api;

/// <summary>
/// Parental Control API: client assets, administration of the profiles and labels, and what the web client of a
/// controlled user needs (its own settings, the parent PIN check, extra time).
/// </summary>
[ApiController]
[Route("ParentalControl")]
public partial class ParentalControlController : ControllerBase
{
    private const string UserIdClaim = "Jellyfin-UserId";

    // A profile with 500 entries per list and long names stays far below; without a limit the body is fully
    // deserialized before the validator can reject it.
    private const long ProfileRequestLimit = 1024 * 1024;
    private const long LabelRequestLimit = 2 * 1024 * 1024;
    private const long SmallRequestLimit = 4 * 1024;

    private const int MaxExtendMinutes = 120;
    private const int MaxBonusMinutes = 12 * 60;
    private const int PreviewSampleSize = 24;

    private const string StorageUnavailableMessage = "The plugin data could not be written: nothing was changed. Try again later; the server log has the details.";

    private static readonly ConcurrentDictionary<string, CachedAsset> AssetCache = new(StringComparer.Ordinal);

    private readonly ProfileService _profiles;
    private readonly ScreenTimeService _screenTime;
    private readonly TagSyncService _tagSync;
    private readonly WebInjectionService _injection;
    private readonly IUserManager _userManager;
    private readonly ILibraryManager _libraryManager;
    private readonly TimeProvider _time;
    private readonly ILogger<ParentalControlController> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="ParentalControlController"/> class.
    /// </summary>
    /// <param name="profiles">The profile service.</param>
    /// <param name="screenTime">The screen time service.</param>
    /// <param name="tagSync">The tag synchronization.</param>
    /// <param name="injection">The web injection service.</param>
    /// <param name="userManager">The user manager.</param>
    /// <param name="libraryManager">The library manager.</param>
    /// <param name="time">The clock.</param>
    /// <param name="logger">The logger.</param>
    public ParentalControlController(ProfileService profiles, ScreenTimeService screenTime, TagSyncService tagSync, WebInjectionService injection, IUserManager userManager, ILibraryManager libraryManager, TimeProvider time, ILogger<ParentalControlController> logger)
    {
        _profiles = profiles;
        _screenTime = screenTime;
        _tagSync = tagSync;
        _injection = injection;
        _userManager = userManager;
        _libraryManager = libraryManager;
        _time = time;
        _logger = logger;
    }

    /// <summary>
    /// Serves the client script injected into the web client.
    /// </summary>
    /// <returns>The script.</returns>
    [HttpGet("parental-control.js")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status304NotModified)]
    public ActionResult GetScript()
    {
        return ServeAsset("Web.parental-control.js", "application/javascript; charset=utf-8");
    }

    /// <summary>
    /// Serves the client stylesheet injected into the web client.
    /// </summary>
    /// <returns>The stylesheet.</returns>
    [HttpGet("parental-control.css")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status304NotModified)]
    public ActionResult GetStylesheet()
    {
        return ServeAsset("Web.parental-control.css", "text/css; charset=utf-8");
    }

    /// <summary>
    /// Lists the users that sign in with a PIN pad. Anonymous: the sign-in page has nobody signed in. Only
    /// identifiers of users the sign-in page already lists (not hidden, not disabled).
    /// </summary>
    /// <returns>The sign-in information.</returns>
    [HttpGet("SignIn")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<SignInInfo> GetSignIn()
    {
        SignInInfo info = new();
        foreach (ControlledProfile profile in _profiles.Configuration.Profiles.Where(profile => profile.Enabled && profile.PinSignIn))
        {
            User? user = FindUser(profile.UserId);
            if (user is null)
            {
                continue;
            }

            UserPolicy policy = _profiles.GetPolicy(user);
            if (!policy.IsHidden && !policy.IsDisabled)
            {
                info.PinUsers.Add(new PinUser
                {
                    Id = user.Id.ToString("N", CultureInfo.InvariantCulture),
                    Length = profile.PinLength,
                    AllowedNow = ScheduleHelper.IsAllowed(PolicyMapper.ReadNative(policy).AccessSchedules, _time.GetLocalNow().DateTime)
                });
            }
        }

        return info;
    }

    /// <summary>
    /// Gets what the web client needs about the current user. Works outside the access schedule, so that the client
    /// can say why the server refuses everything else.
    /// </summary>
    /// <returns>The client context.</returns>
    [HttpGet("Me")]
    [Authorize(Policy = Policies.IgnoreParentalControl)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<ClientContext> GetMe()
    {
        ClientContext context = new() { PluginVersion = Plugin.Instance?.VersionString ?? string.Empty, ParentPinSet = _profiles.HasParentPin };
        ControlledProfile? profile = _profiles.GetActiveProfile(GetUserId());
        User? user = profile is null ? null : FindUser(profile.UserId);
        if (profile is null || user is null)
        {
            return context;
        }

        context.Controlled = true;
        context.HiddenElements = profile.HiddenElements.ToList();
        context.LockSession = profile.LockSession;
        context.ScreenTime = _screenTime.GetToday(profile);
        context.WarningMinutes = profile.ScreenTime.WarningMinutes;
        context.ShowRemaining = profile.ScreenTime.ShowRemaining;

        List<ScheduleWindow> schedule = PolicyMapper.ReadNative(_profiles.GetPolicy(user)).AccessSchedules;
        DateTimeOffset now = _time.GetLocalNow();
        context.AllowedNow = ScheduleHelper.IsAllowed(schedule, now.DateTime);
        if (!context.AllowedNow && ScheduleHelper.NextAllowed(schedule, now.DateTime) is DateTime next)
        {
            context.NextAllowed = new DateTimeOffset(next, now.Offset).ToString("o", CultureInfo.InvariantCulture);
        }

        return context;
    }

    /// <summary>
    /// Checks the parent PIN typed on the device of the current user (to sign out of a locked session).
    /// </summary>
    /// <param name="request">The PIN.</param>
    /// <returns>The outcome.</returns>
    [HttpPost("Me/ParentPin")]
    [Authorize(Policy = Policies.IgnoreParentalControl)]
    [RequestSizeLimit(SmallRequestLimit)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public ActionResult<PinCheckResult> CheckParentPin([FromBody] PinRequest request)
    {
        if (!_profiles.HasParentPin)
        {
            return Conflict("No parent PIN is set.");
        }

        return _profiles.CheckParentPin(GetUserId(), request?.Pin);
    }

    /// <summary>
    /// Grants extra screen time for today from the device of the current user, approved with the parent PIN.
    /// </summary>
    /// <param name="request">The parent PIN and the minutes.</param>
    /// <returns>The outcome of the PIN check.</returns>
    [HttpPost("Me/Extend")]
    [Authorize(Policy = Policies.IgnoreParentalControl)]
    [RequestSizeLimit(SmallRequestLimit)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public ActionResult<PinCheckResult> Extend([FromBody] ExtendRequest request)
    {
        if (request is null || request.Minutes <= 0 || request.Minutes > MaxExtendMinutes)
        {
            return BadRequest("Between 1 and " + MaxExtendMinutes.ToString(CultureInfo.InvariantCulture) + " minutes.");
        }

        Guid userId = GetUserId();
        if (_profiles.GetActiveProfile(userId) is null)
        {
            return Conflict("This account has no screen time to extend.");
        }

        if (!_profiles.HasParentPin)
        {
            return Conflict("No parent PIN is set.");
        }

        PinCheckResult result = _profiles.CheckParentPin(userId, request.Pin);
        if (result.Valid)
        {
            _screenTime.AddBonus(userId, request.Minutes);
            LogExtended(userId, request.Minutes);
        }

        return result;
    }

    /// <summary>
    /// Lists the users of the server with their profile state (administrators).
    /// </summary>
    /// <returns>The family.</returns>
    [HttpGet("Family")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<FamilyMember>> GetFamily()
    {
        return Ok(JellyfinCompat.GetUsers(_userManager)
            .Select(user => Describe(user, _profiles.GetProfile(user.Id)))
            .OrderBy(member => member.IsAdministrator)
            .ThenBy(member => member.Name, StringComparer.CurrentCultureIgnoreCase)
            .ToList());
    }

    /// <summary>
    /// Gets the profile of a user, a new one when the user has none (administrators).
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <returns>The profile view.</returns>
    [HttpGet("Profiles/{userId}")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult<ProfileView> GetProfile([FromRoute] Guid userId)
    {
        User? user = FindUser(userId);
        if (user is null)
        {
            return NotFound();
        }

        return BuildView(user);
    }

    /// <summary>
    /// Saves the profile and the native settings of a user (administrators).
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <param name="update">The profile and the native settings.</param>
    /// <returns>The profile view after the save.</returns>
    [HttpPost("Profiles/{userId}")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [RequestSizeLimit(ProfileRequestLimit)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<ProfileView>> SaveProfile([FromRoute] Guid userId, [FromBody] ProfileUpdate update)
    {
        PluginConfiguration config = _profiles.Configuration;
        ControlledProfile? profile = ProfileValidator.NormalizeProfile(update?.Profile, config.Labels.Select(label => label.Id).ToList(), out string? error);
        if (profile is null)
        {
            return BadRequest(error);
        }

        NativeSettings? native = null;
        if (update!.Native is not null)
        {
            native = ProfileValidator.NormalizeNative(update.Native, out error);
            if (native is null)
            {
                return BadRequest(error);
            }
        }

        try
        {
            await _profiles.SaveProfileAsync(userId, profile, native).ConfigureAwait(false);
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex) when (IsStorageFailure(ex))
        {
            return StorageUnavailable("save a profile", ex);
        }

        return BuildView(FindUser(userId)!);
    }

    /// <summary>
    /// Deletes the profile of a user: what the plugin added to the policy is removed (administrators).
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <returns>No content.</returns>
    [HttpDelete("Profiles/{userId}")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult> DeleteProfile([FromRoute] Guid userId)
    {
        try
        {
            return await _profiles.DeleteProfileAsync(userId).ConfigureAwait(false) ? NoContent() : NotFound();
        }
        catch (Exception ex) when (IsStorageFailure(ex))
        {
            return StorageUnavailable("delete a profile", ex);
        }
    }

    /// <summary>
    /// Grants (or takes back) extra screen time for today (administrators).
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <param name="request">The minutes.</param>
    /// <returns>Today's usage.</returns>
    [HttpPost("Profiles/{userId}/Bonus")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [RequestSizeLimit(SmallRequestLimit)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult<UsageToday> AddBonus([FromRoute] Guid userId, [FromBody] BonusRequest request)
    {
        if (request is null || request.Minutes == 0 || Math.Abs(request.Minutes) > MaxBonusMinutes)
        {
            return BadRequest("Between -" + MaxBonusMinutes.ToString(CultureInfo.InvariantCulture) + " and " + MaxBonusMinutes.ToString(CultureInfo.InvariantCulture) + " minutes, not 0.");
        }

        ControlledProfile? profile = _profiles.GetProfile(userId);
        if (profile is null)
        {
            return NotFound();
        }

        _screenTime.AddBonus(userId, request.Minutes);
        return _screenTime.GetToday(profile);
    }

    /// <summary>
    /// Sets the sign-in PIN of a user: it becomes the password of the account (administrators).
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <param name="request">The PIN.</param>
    /// <returns>No content.</returns>
    [HttpPost("Profiles/{userId}/Pin")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [RequestSizeLimit(SmallRequestLimit)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> SetUserPin([FromRoute] Guid userId, [FromBody] PinRequest request)
    {
        if (!PinHasher.IsWellFormed(request?.Pin))
        {
            return BadRequest("A PIN has 4 to 8 digits.");
        }

        try
        {
            await _profiles.SetUserPinAsync(userId, request!.Pin!).ConfigureAwait(false);
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }

        return NoContent();
    }

    /// <summary>
    /// Counts what a user can see right now, with a sample (administrators).
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <returns>The preview.</returns>
    [HttpGet("Profiles/{userId}/Preview")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult<VisibilityPreview> GetPreview([FromRoute] Guid userId)
    {
        User? user = FindUser(userId);
        if (user is null)
        {
            return NotFound();
        }

        // The query carries the user: Jellyfin applies their libraries, rating limit and tags, as for their own requests.
        int Count(BaseItemKind kind) => _libraryManager.GetCount(new InternalItemsQuery(user) { IncludeItemTypes = [kind], Recursive = true });

        IReadOnlyList<BaseItem> sample = _libraryManager.GetItemList(new InternalItemsQuery(user)
        {
            IncludeItemTypes = [BaseItemKind.Movie, BaseItemKind.Series],
            Recursive = true,
            Limit = PreviewSampleSize,
            OrderBy = [(ItemSortBy.DateCreated, SortOrder.Descending)]
        });

        return new VisibilityPreview
        {
            Movies = Count(BaseItemKind.Movie),
            Series = Count(BaseItemKind.Series),
            Collections = Count(BaseItemKind.BoxSet),
            Albums = Count(BaseItemKind.MusicAlbum),
            Syncing = _tagSync.GetStatus().Running,
            Sample = sample.Select(item => new PreviewItem
            {
                Id = item.Id,
                Name = item.Name ?? string.Empty,
                ItemType = item.GetBaseItemKind().ToString(),
                Year = item.ProductionYear,
                HasImage = item.HasImage(ImageType.Primary)
            }).ToList()
        };
    }

    /// <summary>
    /// Lists the labels (administrators).
    /// </summary>
    /// <returns>The labels.</returns>
    [HttpGet("Labels")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<ContentLabel>> GetLabels()
    {
        return Ok(_profiles.Configuration.Labels);
    }

    /// <summary>
    /// Creates a label (administrators).
    /// </summary>
    /// <param name="label">The label.</param>
    /// <returns>The saved label.</returns>
    [HttpPost("Labels")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [RequestSizeLimit(LabelRequestLimit)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public Task<ActionResult<ContentLabel>> CreateLabel([FromBody] ContentLabel label)
    {
        return SaveLabel(null, label);
    }

    /// <summary>
    /// Updates a label (administrators).
    /// </summary>
    /// <param name="id">The label.</param>
    /// <param name="label">The label.</param>
    /// <returns>The saved label.</returns>
    [HttpPost("Labels/{id}")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [RequestSizeLimit(LabelRequestLimit)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public Task<ActionResult<ContentLabel>> UpdateLabel([FromRoute] string id, [FromBody] ContentLabel label)
    {
        return SaveLabel(id, label);
    }

    /// <summary>
    /// Deletes a label: its tag is removed from the items and from the profiles (administrators).
    /// </summary>
    /// <param name="id">The label.</param>
    /// <returns>No content.</returns>
    [HttpDelete("Labels/{id}")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult> DeleteLabel([FromRoute] string id)
    {
        try
        {
            return await _profiles.DeleteLabelAsync(id).ConfigureAwait(false) ? NoContent() : NotFound();
        }
        catch (Exception ex) when (IsStorageFailure(ex))
        {
            return StorageUnavailable("delete a label", ex);
        }
    }

    /// <summary>
    /// Gets the diagnostics of the settings tab (administrators).
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
    /// Applies every profile and synchronizes the tags now (administrators).
    /// </summary>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>The status after the synchronization.</returns>
    [HttpPost("Sync")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<PluginStatus>> SyncNow(CancellationToken cancellationToken)
    {
        try
        {
            await _profiles.ReapplyAllAsync().ConfigureAwait(false);
            await _tagSync.SyncAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (IsStorageFailure(ex))
        {
            return StorageUnavailable("synchronize", ex);
        }

        return BuildStatus();
    }

    /// <summary>
    /// Sets the parent PIN (administrators).
    /// </summary>
    /// <param name="request">The PIN.</param>
    /// <returns>No content.</returns>
    [HttpPost("ParentPin")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [RequestSizeLimit(SmallRequestLimit)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public ActionResult SetParentPin([FromBody] PinRequest request)
    {
        if (!PinHasher.IsWellFormed(request?.Pin))
        {
            return BadRequest("A PIN has 4 to 8 digits.");
        }

        try
        {
            _profiles.SetParentPin(request!.Pin!);
        }
        catch (Exception ex) when (IsStorageFailure(ex))
        {
            return StorageUnavailable("set the parent PIN", ex);
        }

        return NoContent();
    }

    /// <summary>
    /// Removes the parent PIN (administrators).
    /// </summary>
    /// <returns>No content.</returns>
    [HttpDelete("ParentPin")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public ActionResult ClearParentPin()
    {
        try
        {
            _profiles.ClearParentPin();
        }
        catch (Exception ex) when (IsStorageFailure(ex))
        {
            return StorageUnavailable("remove the parent PIN", ex);
        }

        return NoContent();
    }

    /// <summary>
    /// Saves the options of the settings tab (administrators).
    /// </summary>
    /// <param name="options">The options.</param>
    /// <returns>The status.</returns>
    [HttpPost("Options")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [RequestSizeLimit(SmallRequestLimit)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public ActionResult<PluginStatus> SaveOptions([FromBody] PluginOptions options)
    {
        string language = (options?.MessageLanguage ?? "auto").ToLowerInvariant();
        if (language is not ("auto" or "en" or "fr"))
        {
            return BadRequest("Unknown language.");
        }

        try
        {
            _profiles.SaveOptions(language, options!.DeveloperMode);
        }
        catch (Exception ex) when (IsStorageFailure(ex))
        {
            return StorageUnavailable("save the options", ex);
        }

        return BuildStatus();
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

    private async Task<ActionResult<ContentLabel>> SaveLabel(string? id, ContentLabel label)
    {
        IEnumerable<string> others = _profiles.Configuration.Labels
            .Where(existing => !string.Equals(existing.Id, id, StringComparison.Ordinal))
            .Select(existing => existing.Name);
        ContentLabel? normalized = ProfileValidator.NormalizeLabel(label, others, out string? error);
        if (normalized is null)
        {
            return BadRequest(error);
        }

        try
        {
            return await _profiles.SaveLabelAsync(id, normalized).ConfigureAwait(false);
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex) when (IsStorageFailure(ex))
        {
            return StorageUnavailable("save a label", ex);
        }
    }

    private ProfileView BuildView(User user)
    {
        ControlledProfile? profile = _profiles.GetProfile(user.Id);
        return new ProfileView
        {
            User = Describe(user, profile),
            Profile = profile ?? new ControlledProfile { UserId = user.Id },
            Native = PolicyMapper.ReadNative(_profiles.GetPolicy(user)),
            Usage = _screenTime.GetReport(profile, user.Id)
        };
    }

    private FamilyMember Describe(User user, ControlledProfile? profile)
    {
        UserDto dto = _userManager.GetUserDto(user);
        return new FamilyMember
        {
            UserId = user.Id,
            Name = user.Username,
            PrimaryImageTag = dto.PrimaryImageTag,
            IsAdministrator = dto.Policy.IsAdministrator,
            IsDisabled = dto.Policy.IsDisabled,
            HasProfile = profile is not null,
            Enabled = profile?.Enabled ?? false,
            Mode = profile?.Mode ?? ContentMode.BlockList,
            RuleCount = profile is null ? 0 : profile.Hidden.Count + (profile.Mode == ContentMode.AllowList ? profile.Allowed.Count : 0),
            Today = profile is null ? null : _screenTime.GetToday(profile)
        };
    }

    private PluginStatus BuildStatus()
    {
        PluginConfiguration config = _profiles.Configuration;
        return new PluginStatus
        {
            PluginVersion = Plugin.Instance?.VersionString ?? string.Empty,
            Injection = _injection.Status,
            Sync = _tagSync.GetStatus(),
            ParentPinSet = _profiles.HasParentPin,
            MessageLanguage = config.MessageLanguage,
            DeveloperMode = config.DeveloperMode
        };
    }

    /// <summary>
    /// Answers a request the disk refused: the cause goes to the server log, the client gets a message it can show.
    /// </summary>
    private ObjectResult StorageUnavailable(string operation, Exception exception)
    {
        LogStorageFailure(operation, exception);
        return StatusCode(StatusCodes.Status503ServiceUnavailable, StorageUnavailableMessage);
    }

    private ActionResult ServeAsset(string suffix, string contentType)
    {
        CachedAsset asset = AssetCache.GetOrAdd(suffix, LoadAsset);
        if (asset.Bytes.Length == 0)
        {
            return NotFound();
        }

        bool developerMode = _profiles.Configuration.DeveloperMode;
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

    private User? FindUser(Guid userId)
    {
        // The user manager refuses the empty identifier with an exception.
        return userId == Guid.Empty ? null : _userManager.GetUserById(userId);
    }

    private Guid GetUserId()
    {
        string? value = User.FindFirst(UserIdClaim)?.Value;
        return Guid.TryParse(value, out Guid userId) ? userId : Guid.Empty;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Parental Control: could not {Operation}, the request was answered with an error 503")]
    private partial void LogStorageFailure(string operation, Exception exception);

    [LoggerMessage(Level = LogLevel.Information, Message = "Parental Control: {Minutes} extra minute(s) granted with the parent PIN to {UserId}")]
    private partial void LogExtended(Guid userId, int minutes);

    private sealed record CachedAsset(byte[] Bytes, string ETag);
}
