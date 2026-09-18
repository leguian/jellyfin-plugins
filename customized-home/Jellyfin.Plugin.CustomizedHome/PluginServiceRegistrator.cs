using Jellyfin.Plugin.CustomizedHome.Services;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.CustomizedHome;

/// <summary>
/// Registers the plugin services in the server dependency injection container.
/// </summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<LayoutStore>();
        serviceCollection.AddSingleton<GenreImageStore>();
        serviceCollection.AddSingleton<WebInjectionService>();
        serviceCollection.AddHostedService(provider => provider.GetRequiredService<WebInjectionService>());
    }
}
