using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.ParentalControl.Configuration;
using Jellyfin.Plugin.ParentalControl.Helpers;
using Jellyfin.Plugin.ParentalControl.Models;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Users;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.ParentalControl.Services;

/// <summary>
/// Changes the profiles, the labels and the PINs, and writes the user policies. Every change goes through one gate:
/// two administrators saving at the same time cannot interleave a configuration write and a policy write.
/// </summary>
public sealed partial class ProfileService : IDisposable
{
    private readonly IUserManager _userManager;
    private readonly ContentExpander _expander;
    private readonly TagSyncService _tagSync;
    private readonly ConfigurationSource _configuration;
    private readonly PinAttemptLimiter _limiter;
    private readonly ILogger<ProfileService> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);

    /// <summary>
    /// Initializes a new instance of the <see cref="ProfileService"/> class.
    /// </summary>
    /// <param name="userManager">The user manager.</param>
    /// <param name="expander">The rule expander, used to refresh the names of the targets.</param>
    /// <param name="tagSync">The tag synchronization.</param>
    /// <param name="configuration">The plugin configuration.</param>
    /// <param name="limiter">The parent PIN attempt limiter.</param>
    /// <param name="logger">The logger.</param>
    public ProfileService(IUserManager userManager, ContentExpander expander, TagSyncService tagSync, ConfigurationSource configuration, PinAttemptLimiter limiter, ILogger<ProfileService> logger)
    {
        _userManager = userManager;
        _expander = expander;
        _tagSync = tagSync;
        _configuration = configuration;
        _limiter = limiter;
        _logger = logger;
    }

    /// <summary>
    /// Gets the current configuration.
    /// </summary>
    public PluginConfiguration Configuration => _configuration.Current;

    /// <summary>
    /// Gets a value indicating whether a parent PIN is set.
    /// </summary>
    public bool HasParentPin => !string.IsNullOrEmpty(Configuration.ParentPinHash);

    /// <summary>
    /// Gets the profile of a user.
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <returns>The profile, or <c>null</c>.</returns>
    public ControlledProfile? GetProfile(Guid userId)
    {
        return Configuration.Profiles.FirstOrDefault(profile => profile.UserId == userId);
    }

    /// <summary>
    /// Gets the profile of a user when it is applied.
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <returns>The profile, or <c>null</c> without profile or when it is paused.</returns>
    public ControlledProfile? GetActiveProfile(Guid userId)
    {
        ControlledProfile? profile = GetProfile(userId);
        return profile is { Enabled: true } ? profile : null;
    }

    /// <summary>
    /// Reads the user policy.
    /// </summary>
    /// <param name="user">The user.</param>
    /// <returns>The policy.</returns>
    public UserPolicy GetPolicy(User user)
    {
        return _userManager.GetUserDto(user).Policy;
    }

    /// <summary>
    /// Saves a profile and applies it: native settings and tags in the user policy, then the item tags.
    /// </summary>
    /// <param name="userId">The controlled user.</param>
    /// <param name="settings">The profile, normalized by <see cref="ProfileValidator.NormalizeProfile"/>.</param>
    /// <param name="native">The native settings, normalized; <c>null</c> leaves them untouched.</param>
    /// <returns>The saved profile.</returns>
    /// <exception cref="KeyNotFoundException">The user does not exist.</exception>
    /// <exception cref="InvalidOperationException">The user is an administrator.</exception>
    public async Task<ControlledProfile> SaveProfileAsync(Guid userId, ControlledProfile settings, NativeSettings? native)
    {
        ArgumentNullException.ThrowIfNull(settings);
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            User user = FindControllableUser(userId);
            PluginConfiguration config = Configuration;
            ControlledProfile? existing = config.Profiles.FirstOrDefault(profile => profile.UserId == userId);

            ControlledProfile profile = new()
            {
                UserId = userId,
                TagKey = existing?.TagKey is { } key && TagNames.IsValidKey(key)
                    ? key
                    : TagNames.MakeKey(user.Username, userId, config.Profiles.Select(other => other.TagKey)),
                Enabled = settings.Enabled,
                Mode = settings.Mode,
                Hidden = Describe(settings.Hidden, config.Labels),
                Allowed = Describe(settings.Allowed, config.Labels),
                ScreenTime = settings.ScreenTime,
                HiddenElements = settings.HiddenElements,
                LockSession = settings.LockSession,
                PinSignIn = settings.PinSignIn,
                PinLength = existing?.PinLength ?? 0,
                AppliedBlockedTags = existing?.AppliedBlockedTags ?? new(),
                AppliedAllowedTags = existing?.AppliedAllowedTags ?? new(),
                ModifiedUtc = DateTime.UtcNow
            };

            await ApplyPolicyAsync(user, profile, config.Labels, native).ConfigureAwait(false);
            Replace(config, profile, remove: false);
            _tagSync.RequestSync(TagSyncService.RulesChangeDelay);
            return profile;
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// Deletes the profile of a user: what the plugin put into the policy is removed, the native settings stay.
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <returns><c>true</c> when a profile existed.</returns>
    public async Task<bool> DeleteProfileAsync(Guid userId)
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            PluginConfiguration config = Configuration;
            ControlledProfile? existing = config.Profiles.FirstOrDefault(profile => profile.UserId == userId);
            if (existing is null)
            {
                return false;
            }

            User? user = userId == Guid.Empty ? null : _userManager.GetUserById(userId);
            if (user is not null)
            {
                ControlledProfile paused = Copy(existing);
                paused.Enabled = false;
                await ApplyPolicyAsync(user, paused, config.Labels, native: null).ConfigureAwait(false);
            }

            Replace(config, existing, remove: true);
            _tagSync.RequestSync(TagSyncService.RulesChangeDelay);
            return true;
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// Forgets the profile of a user who no longer exists (no policy to clean).
    /// </summary>
    /// <param name="userId">The deleted user.</param>
    /// <returns>The task.</returns>
    public async Task ForgetUserAsync(Guid userId)
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            PluginConfiguration config = Configuration;
            ControlledProfile? existing = config.Profiles.FirstOrDefault(profile => profile.UserId == userId);
            if (existing is not null)
            {
                Replace(config, existing, remove: true);
                _tagSync.RequestSync(TagSyncService.RulesChangeDelay);
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// Creates or updates a label, then applies the profiles that use it.
    /// </summary>
    /// <param name="id">The label to update, <c>null</c> to create one.</param>
    /// <param name="label">The label, normalized by <see cref="ProfileValidator.NormalizeLabel"/>.</param>
    /// <returns>The saved label.</returns>
    /// <exception cref="KeyNotFoundException">The label does not exist.</exception>
    /// <exception cref="InvalidOperationException">There are too many labels.</exception>
    public async Task<ContentLabel> SaveLabelAsync(string? id, ContentLabel label)
    {
        ArgumentNullException.ThrowIfNull(label);
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            PluginConfiguration config = Configuration;
            List<ContentLabel> labels = config.Labels.ToList();
            int index = id is null ? -1 : labels.FindIndex(existing => string.Equals(existing.Id, id, StringComparison.Ordinal));
            if (id is not null && index < 0)
            {
                throw new KeyNotFoundException("Unknown label.");
            }

            if (id is null && labels.Count >= ProfileValidator.MaxLabels)
            {
                throw new InvalidOperationException("Too many labels.");
            }

            ContentLabel saved = new()
            {
                Id = id ?? Guid.NewGuid().ToString("N"),
                Name = label.Name,
                Color = label.Color,
                Targets = Describe(label.Targets, labels)
            };
            if (index < 0)
            {
                labels.Add(saved);
            }
            else
            {
                labels[index] = saved;
            }

            List<ContentLabel> previous = config.Labels;
            config.Labels = labels.OrderBy(entry => entry.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
            SaveOrRollback(() => config.Labels = previous);

            await ReapplyProfilesUsingAsync(config, saved.Id).ConfigureAwait(false);
            _tagSync.RequestSync(TagSyncService.RulesChangeDelay);
            return saved;
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// Deletes a label: its tag is removed from the items it was written on, and from the profiles.
    /// </summary>
    /// <param name="id">The label.</param>
    /// <returns><c>true</c> when the label existed.</returns>
    public async Task<bool> DeleteLabelAsync(string id)
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            PluginConfiguration config = Configuration;
            if (!config.Labels.Any(label => string.Equals(label.Id, id, StringComparison.Ordinal)))
            {
                return false;
            }

            // The policies still hold the label name: the profiles are applied once more without it.
            List<ControlledProfile> users = config.Profiles.Where(profile => UsesLabel(profile, id)).ToList();
            List<ContentLabel> previousLabels = config.Labels;
            List<ControlledProfile> previousProfiles = config.Profiles;
            config.Labels = config.Labels.Where(label => !string.Equals(label.Id, id, StringComparison.Ordinal)).ToList();
            config.Profiles = config.Profiles.Select(profile => UsesLabel(profile, id) ? WithoutLabel(profile, id) : profile).ToList();
            SaveOrRollback(() =>
            {
                config.Labels = previousLabels;
                config.Profiles = previousProfiles;
            });

            foreach (ControlledProfile profile in config.Profiles.Where(profile => users.Any(user => user.UserId == profile.UserId)))
            {
                await ReapplyAsync(config, profile).ConfigureAwait(false);
            }

            _tagSync.RequestSync(TagSyncService.RulesChangeDelay);
            return true;
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// Applies every profile again (policy only): repairs a policy edited by hand on the native user page.
    /// </summary>
    /// <returns>The task.</returns>
    public async Task ReapplyAllAsync()
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            PluginConfiguration config = Configuration;
            foreach (ControlledProfile profile in config.Profiles)
            {
                await ReapplyAsync(config, profile).ConfigureAwait(false);
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// Sets the parent PIN.
    /// </summary>
    /// <param name="pin">The PIN, well formed.</param>
    public void SetParentPin(string pin)
    {
        (string hash, string salt) = PinHasher.Hash(pin);
        PluginConfiguration config = Configuration;
        (string? oldHash, string? oldSalt, int oldIterations) = (config.ParentPinHash, config.ParentPinSalt, config.ParentPinIterations);
        config.ParentPinHash = hash;
        config.ParentPinSalt = salt;
        config.ParentPinIterations = PinHasher.Iterations;
        SaveOrRollback(() =>
        {
            config.ParentPinHash = oldHash;
            config.ParentPinSalt = oldSalt;
            config.ParentPinIterations = oldIterations;
        });
    }

    /// <summary>
    /// Removes the parent PIN.
    /// </summary>
    public void ClearParentPin()
    {
        PluginConfiguration config = Configuration;
        (string? oldHash, string? oldSalt, int oldIterations) = (config.ParentPinHash, config.ParentPinSalt, config.ParentPinIterations);
        config.ParentPinHash = null;
        config.ParentPinSalt = null;
        config.ParentPinIterations = 0;
        SaveOrRollback(() =>
        {
            config.ParentPinHash = oldHash;
            config.ParentPinSalt = oldSalt;
            config.ParentPinIterations = oldIterations;
        });
    }

    /// <summary>
    /// Checks the parent PIN typed on the device of a user, within the attempt limits of that user.
    /// </summary>
    /// <param name="account">The account the attempt comes from.</param>
    /// <param name="pin">The PIN typed.</param>
    /// <returns>The outcome.</returns>
    public PinCheckResult CheckParentPin(Guid account, string? pin)
    {
        int wait = _limiter.RetryAfterSeconds(account);
        if (wait > 0)
        {
            return new PinCheckResult { Valid = false, RetryAfterSeconds = wait };
        }

        PluginConfiguration config = Configuration;
        if (PinHasher.Verify(pin, config.ParentPinHash, config.ParentPinSalt, config.ParentPinIterations))
        {
            _limiter.RecordSuccess(account);
            return new PinCheckResult { Valid = true };
        }

        _limiter.RecordFailure(account);
        LogParentPinRefused(account);
        return new PinCheckResult { Valid = false, RetryAfterSeconds = _limiter.RetryAfterSeconds(account) };
    }

    /// <summary>
    /// Sets the password of a controlled user to a PIN, for the PIN pad of the sign-in page.
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <param name="pin">The PIN, well formed.</param>
    /// <returns>The task.</returns>
    /// <exception cref="KeyNotFoundException">The user does not exist.</exception>
    /// <exception cref="InvalidOperationException">The user is an administrator.</exception>
    public async Task SetUserPinAsync(Guid userId, string pin)
    {
        ArgumentNullException.ThrowIfNull(pin);
        User user = FindControllableUser(userId);
        await JellyfinCompat.ChangePassword(_userManager, user, pin).ConfigureAwait(false);
        LogUserPinSet(user.Username);

        // The length lets the PIN pad sign in without a confirm key. Remembered only for a user with a profile.
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            PluginConfiguration config = Configuration;
            if (config.Profiles.FirstOrDefault(profile => profile.UserId == userId) is { } existing)
            {
                ControlledProfile copy = Copy(existing);
                copy.PinLength = pin.Length;
                Replace(config, copy, remove: false);
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// Saves the options of the settings tab.
    /// </summary>
    /// <param name="language">The message language: auto, en or fr.</param>
    /// <param name="developerMode">The developer mode.</param>
    public void SaveOptions(string language, bool developerMode)
    {
        PluginConfiguration config = Configuration;
        (string oldLanguage, bool oldDeveloper) = (config.MessageLanguage, config.DeveloperMode);
        config.MessageLanguage = language;
        config.DeveloperMode = developerMode;
        SaveOrRollback(() =>
        {
            config.MessageLanguage = oldLanguage;
            config.DeveloperMode = oldDeveloper;
        });
    }

    /// <inheritdoc />
    public void Dispose()
    {
        _gate.Dispose();
    }

    private static bool UsesLabel(ControlledProfile profile, string id)
    {
        return profile.Hidden.Concat(profile.Allowed).Any(rule => rule.Kind == RuleKind.Label && string.Equals(rule.Value, id, StringComparison.Ordinal));
    }

    private static ControlledProfile WithoutLabel(ControlledProfile profile, string id)
    {
        ControlledProfile copy = Copy(profile);
        copy.Hidden = profile.Hidden.Where(rule => !(rule.Kind == RuleKind.Label && string.Equals(rule.Value, id, StringComparison.Ordinal))).ToList();
        copy.Allowed = profile.Allowed.Where(rule => !(rule.Kind == RuleKind.Label && string.Equals(rule.Value, id, StringComparison.Ordinal))).ToList();
        return copy;
    }

    private static ControlledProfile Copy(ControlledProfile profile)
    {
        return new ControlledProfile
        {
            UserId = profile.UserId,
            Enabled = profile.Enabled,
            TagKey = profile.TagKey,
            Mode = profile.Mode,
            Hidden = profile.Hidden.ToList(),
            Allowed = profile.Allowed.ToList(),
            ScreenTime = profile.ScreenTime,
            HiddenElements = profile.HiddenElements.ToList(),
            LockSession = profile.LockSession,
            PinSignIn = profile.PinSignIn,
            PinLength = profile.PinLength,
            AppliedBlockedTags = profile.AppliedBlockedTags.ToList(),
            AppliedAllowedTags = profile.AppliedAllowedTags.ToList(),
            ModifiedUtc = profile.ModifiedUtc
        };
    }

    private User FindControllableUser(Guid userId)
    {
        User user = (userId == Guid.Empty ? null : _userManager.GetUserById(userId)) ?? throw new KeyNotFoundException("Unknown user.");
        if (GetPolicy(user).IsAdministrator)
        {
            throw new InvalidOperationException("Administrators cannot be controlled: their access is not limited by Jellyfin.");
        }

        return user;
    }

    private List<ContentRule> Describe(IEnumerable<ContentRule> rules, IReadOnlyList<ContentLabel> labels)
    {
        List<ContentRule> described = new();
        foreach (ContentRule rule in rules)
        {
            ContentRule copy = new() { Kind = rule.Kind, Value = rule.Value, Name = rule.Name, ItemType = rule.ItemType };
            if (rule.Kind is RuleKind.Item or RuleKind.Collection && _expander.Describe(rule.Value) is { } info)
            {
                copy.Name = info.Name;
                copy.ItemType = info.ItemType;
            }
            else if (rule.Kind == RuleKind.Label)
            {
                copy.Name = labels.FirstOrDefault(label => string.Equals(label.Id, rule.Value, StringComparison.Ordinal))?.Name ?? copy.Name;
            }
            else if (rule.Kind is RuleKind.Genre or RuleKind.Tag)
            {
                copy.Name = rule.Value;
            }

            described.Add(copy);
        }

        return described;
    }

    private async Task ReapplyProfilesUsingAsync(PluginConfiguration config, string labelId)
    {
        foreach (ControlledProfile profile in config.Profiles.Where(profile => UsesLabel(profile, labelId)).ToList())
        {
            ControlledProfile renamed = Copy(profile);
            renamed.Hidden = Describe(profile.Hidden, config.Labels);
            renamed.Allowed = Describe(profile.Allowed, config.Labels);
            await ReapplyAsync(config, renamed).ConfigureAwait(false);
        }
    }

    private async Task ReapplyAsync(PluginConfiguration config, ControlledProfile profile)
    {
        User? user = profile.UserId == Guid.Empty ? null : _userManager.GetUserById(profile.UserId);
        if (user is null)
        {
            return;
        }

        ControlledProfile copy = Copy(profile);
        await ApplyPolicyAsync(user, copy, config.Labels, native: null).ConfigureAwait(false);
        Replace(config, copy, remove: false);
    }

    /// <summary>
    /// Writes the native settings and the tags of a profile into the policy, and records the tags written in the profile.
    /// </summary>
    private async Task ApplyPolicyAsync(User user, ControlledProfile profile, IReadOnlyList<ContentLabel> labels, NativeSettings? native)
    {
        UserPolicy policy = GetPolicy(user);
        if (native is not null)
        {
            PolicyMapper.WriteNative(policy, native, user.Id);
        }

        (List<string> blocked, List<string> allowed) = PolicyMapper.ManagedTags(profile, labels);
        string[] own = TagNames.IsValidKey(profile.TagKey) ? [TagNames.Hidden(profile.TagKey), TagNames.Allowed(profile.TagKey)] : [];
        policy.BlockedTags = PolicyMapper.Merge(policy.BlockedTags, profile.AppliedBlockedTags, own, blocked);
        policy.AllowedTags = PolicyMapper.Merge(policy.AllowedTags, profile.AppliedAllowedTags, own, allowed);
        await _userManager.UpdatePolicyAsync(user.Id, policy).ConfigureAwait(false);
        profile.AppliedBlockedTags = blocked;
        profile.AppliedAllowedTags = allowed;
        LogPolicyApplied(user.Username, blocked.Count, allowed.Count);
    }

    private void Replace(PluginConfiguration config, ControlledProfile profile, bool remove)
    {
        List<ControlledProfile> previous = config.Profiles;
        List<ControlledProfile> next = previous.Where(existing => existing.UserId != profile.UserId).ToList();
        if (!remove)
        {
            next.Add(profile);
        }

        config.Profiles = next;
        SaveOrRollback(() => config.Profiles = previous);
    }

    private void SaveOrRollback(Action rollback)
    {
        try
        {
            _configuration.Save();
        }
        catch
        {
            // The XML file was not written: keeping the change in memory would apply it until the next restart, then lose it.
            rollback();
            throw;
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Parental Control: policy of {User} updated ({Blocked} blocked tag(s), {Allowed} allowed tag(s) managed by the plugin)")]
    private partial void LogPolicyApplied(string user, int blocked, int allowed);

    [LoggerMessage(Level = LogLevel.Information, Message = "Parental Control: sign-in PIN of {User} changed by an administrator")]
    private partial void LogUserPinSet(string user);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Parental Control: wrong parent PIN typed from the account {Account}")]
    private partial void LogParentPinRefused(Guid account);
}
