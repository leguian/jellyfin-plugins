using System;
using System.Collections.Generic;
using System.Linq;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.ParentalControl.Models;
using MediaBrowser.Model.Users;

namespace Jellyfin.Plugin.ParentalControl.Helpers;

/// <summary>
/// Moves settings between a profile and the Jellyfin user policy. The policy is the source of truth for the native
/// settings; for the tags, the plugin only touches the entries it wrote itself.
/// </summary>
public static class PolicyMapper
{
    /// <summary>
    /// Reads the native settings of a user policy.
    /// </summary>
    /// <param name="policy">The policy.</param>
    /// <returns>The settings.</returns>
    public static NativeSettings ReadNative(UserPolicy policy)
    {
        ArgumentNullException.ThrowIfNull(policy);
        return new NativeSettings
        {
            MaxParentalRating = policy.MaxParentalRating,
            MaxParentalSubRating = policy.MaxParentalSubRating,
            BlockUnratedItems = (policy.BlockUnratedItems ?? []).Select(kind => kind.ToString()).ToList(),
            AccessSchedules = (policy.AccessSchedules ?? [])
                .Select(schedule => new ScheduleWindow { DayOfWeek = schedule.DayOfWeek.ToString(), StartHour = schedule.StartHour, EndHour = schedule.EndHour })
                .ToList(),
            EnableAllFolders = policy.EnableAllFolders,
            EnabledFolders = (policy.EnabledFolders ?? []).ToList(),
            EnableRemoteAccess = policy.EnableRemoteAccess,
            EnableContentDownloading = policy.EnableContentDownloading,
            EnableContentDeletion = policy.EnableContentDeletion,
            EnableLiveTvAccess = policy.EnableLiveTvAccess,
            EnableUserPreferenceAccess = policy.EnableUserPreferenceAccess,
            EnableSyncPlay = policy.SyncPlayAccess != SyncPlayUserAccessType.None,
            MaxActiveSessions = policy.MaxActiveSessions,
            ShowOnSignInScreen = !policy.IsHidden
        };
    }

    /// <summary>
    /// Writes normalized native settings into a user policy.
    /// </summary>
    /// <param name="policy">The policy to change.</param>
    /// <param name="native">The settings, normalized by <see cref="ProfileValidator.NormalizeNative"/>.</param>
    /// <param name="userId">The user the policy belongs to.</param>
    public static void WriteNative(UserPolicy policy, NativeSettings native, Guid userId)
    {
        ArgumentNullException.ThrowIfNull(policy);
        ArgumentNullException.ThrowIfNull(native);
        policy.MaxParentalRating = native.MaxParentalRating;
        policy.MaxParentalSubRating = native.MaxParentalSubRating;
        policy.BlockUnratedItems = native.BlockUnratedItems
            .Select(kind => Enum.TryParse(kind, ignoreCase: true, out UnratedItem value) ? (UnratedItem?)value : null)
            .OfType<UnratedItem>()
            .Distinct()
            .ToArray();
        policy.AccessSchedules = native.AccessSchedules
            .Select(window => new AccessSchedule(Enum.Parse<DynamicDayOfWeek>(window.DayOfWeek, ignoreCase: true), window.StartHour, window.EndHour, userId))
            .ToArray();
        policy.EnableAllFolders = native.EnableAllFolders;
        policy.EnabledFolders = native.EnableAllFolders ? [] : native.EnabledFolders.ToArray();
        policy.EnableRemoteAccess = native.EnableRemoteAccess;
        policy.EnableContentDownloading = native.EnableContentDownloading;
        policy.EnableContentDeletion = native.EnableContentDeletion;
        policy.EnableLiveTvAccess = native.EnableLiveTvAccess;
        policy.EnableUserPreferenceAccess = native.EnableUserPreferenceAccess;
        if (!native.EnableSyncPlay)
        {
            policy.SyncPlayAccess = SyncPlayUserAccessType.None;
        }
        else if (policy.SyncPlayAccess == SyncPlayUserAccessType.None)
        {
            // Turned back on: the native default. A finer level set on the native user page is kept as it is.
            policy.SyncPlayAccess = SyncPlayUserAccessType.CreateAndJoinGroups;
        }

        policy.MaxActiveSessions = native.MaxActiveSessions;
        policy.IsHidden = !native.ShowOnSignInScreen;
    }

    /// <summary>
    /// Computes the tags a profile puts into the blocked and allowed lists of the policy.
    /// </summary>
    /// <param name="profile">The profile.</param>
    /// <param name="labels">The labels, to resolve the label rules into tag names.</param>
    /// <returns>The blocked and allowed tags; both empty for a paused profile.</returns>
    public static (List<string> Blocked, List<string> Allowed) ManagedTags(ControlledProfile profile, IReadOnlyList<ContentLabel> labels)
    {
        ArgumentNullException.ThrowIfNull(profile);
        ArgumentNullException.ThrowIfNull(labels);
        List<string> blocked = new();
        List<string> allowed = new();
        if (!profile.Enabled)
        {
            return (blocked, allowed);
        }

        // Always present while the profile is on: hiding a first item then only needs the tag on the item.
        blocked.Add(TagNames.Hidden(profile.TagKey));
        blocked.AddRange(TagsOf(profile.Hidden, labels));

        if (profile.Mode == ContentMode.AllowList)
        {
            // Never left empty in this mode: an empty allowed list means "everything" to Jellyfin.
            allowed.Add(TagNames.Allowed(profile.TagKey));
            allowed.AddRange(TagsOf(profile.Allowed, labels));
        }

        return (Distinct(blocked), Distinct(allowed));
    }

    /// <summary>
    /// Merges the tags of a profile into the lists of a policy: what the plugin wrote before is replaced, what
    /// someone else wrote (native user page, another tool) is kept.
    /// </summary>
    /// <param name="current">The current list of the policy.</param>
    /// <param name="previouslyApplied">What the plugin wrote last time.</param>
    /// <param name="ownTags">Tags that are the plugin's whatever the record says (the profile tags).</param>
    /// <param name="managed">What the plugin writes now.</param>
    /// <returns>The new list.</returns>
    public static string[] Merge(IEnumerable<string>? current, IEnumerable<string> previouslyApplied, IEnumerable<string> ownTags, IReadOnlyCollection<string> managed)
    {
        ArgumentNullException.ThrowIfNull(managed);
        HashSet<string> remove = new(previouslyApplied.Concat(ownTags).Select(TagNames.Fold), StringComparer.Ordinal);
        List<string> result = (current ?? [])
            .Where(tag => !string.IsNullOrWhiteSpace(tag) && !remove.Contains(TagNames.Fold(tag)))
            .ToList();
        result.AddRange(managed);
        return Distinct(result).ToArray();
    }

    private static IEnumerable<string> TagsOf(IEnumerable<ContentRule> rules, IReadOnlyList<ContentLabel> labels)
    {
        foreach (ContentRule rule in rules)
        {
            if (rule.Kind == RuleKind.Tag)
            {
                yield return rule.Value;
            }
            else if (rule.Kind == RuleKind.Label)
            {
                ContentLabel? label = labels.FirstOrDefault(candidate => string.Equals(candidate.Id, rule.Value, StringComparison.Ordinal));
                if (label is not null)
                {
                    yield return label.Name;
                }
            }
        }
    }

    private static List<string> Distinct(IEnumerable<string> tags)
    {
        HashSet<string> seen = new(StringComparer.Ordinal);
        return tags.Where(tag => seen.Add(TagNames.Fold(tag))).ToList();
    }
}
