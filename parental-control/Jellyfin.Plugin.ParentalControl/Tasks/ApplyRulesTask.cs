using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.ParentalControl.Services;
using MediaBrowser.Model.Tasks;

namespace Jellyfin.Plugin.ParentalControl.Tasks;

/// <summary>
/// Scheduled task: applies every profile to its user policy again and synchronizes the tags. Repairs what a policy
/// edited by hand or a metadata refresh may have undone. Runs every night and on demand.
/// </summary>
public class ApplyRulesTask : IScheduledTask
{
    private static readonly TimeSpan DefaultTime = TimeSpan.FromHours(3.5);

    private readonly ProfileService _profiles;
    private readonly TagSyncService _tagSync;

    /// <summary>
    /// Initializes a new instance of the <see cref="ApplyRulesTask"/> class.
    /// </summary>
    /// <param name="profiles">The profile service.</param>
    /// <param name="tagSync">The tag synchronization.</param>
    public ApplyRulesTask(ProfileService profiles, TagSyncService tagSync)
    {
        _profiles = profiles;
        _tagSync = tagSync;
    }

    /// <inheritdoc />
    public string Name => "Apply parental control rules";

    /// <inheritdoc />
    public string Key => "ParentalControlApplyRules";

    /// <inheritdoc />
    public string Description => "Writes the parental control settings into the user policies again and puts the tags of the profiles and labels back on the library items.";

    /// <inheritdoc />
    public string Category => "Parental Control";

    /// <inheritdoc />
    public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(progress);
        await _profiles.ReapplyAllAsync().ConfigureAwait(false);
        progress.Report(5);
        await _tagSync.SyncAsync(cancellationToken, new Progress<double>(value => progress.Report(5 + (value * 0.95)))).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
    {
        return
        [
            new TaskTriggerInfo { Type = TaskTriggerInfoType.DailyTrigger, TimeOfDayTicks = DefaultTime.Ticks }
        ];
    }
}
