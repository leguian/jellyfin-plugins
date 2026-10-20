using System;
using Jellyfin.Data.Events.Users;
using Jellyfin.Plugin.ParentalControl.Services;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Events;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Jellyfin.Plugin.ParentalControl;

/// <summary>
/// Registers the plugin services in the server dependency injection container.
/// </summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.TryAddSingleton(TimeProvider.System);
        serviceCollection.AddSingleton<ConfigurationSource>();
        serviceCollection.AddSingleton<ContentExpander>();
        serviceCollection.AddSingleton<TagStateStore>();
        serviceCollection.AddSingleton<UsageStore>();
        serviceCollection.AddSingleton<PinAttemptLimiter>();
        serviceCollection.AddSingleton<ProfileService>();

        serviceCollection.AddSingleton<TagSyncService>();
        serviceCollection.AddHostedService(provider => provider.GetRequiredService<TagSyncService>());
        serviceCollection.AddSingleton<ScreenTimeService>();
        serviceCollection.AddHostedService(provider => provider.GetRequiredService<ScreenTimeService>());
        serviceCollection.AddSingleton<WebInjectionService>();
        serviceCollection.AddHostedService(provider => provider.GetRequiredService<WebInjectionService>());

        // The scheduled task (Tasks/ApplyRulesTask) is found by the server in the plugin assembly, like every IScheduledTask.

        // Resolved by the event manager of the server each time a user is deleted.
        serviceCollection.AddScoped<IEventConsumer<UserDeletedEventArgs>, UserDeletedConsumer>();
    }
}
