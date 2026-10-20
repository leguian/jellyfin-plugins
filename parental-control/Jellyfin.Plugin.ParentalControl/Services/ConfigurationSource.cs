using System;
using Jellyfin.Plugin.ParentalControl.Configuration;

namespace Jellyfin.Plugin.ParentalControl.Services;

/// <summary>
/// Gives the services the plugin configuration and saves it. Changes replace whole lists and objects instead of
/// editing them in place, so a reader always sees a consistent configuration without taking a lock.
/// </summary>
public class ConfigurationSource
{
    private readonly Func<PluginConfiguration> _get;
    private readonly Action _save;

    /// <summary>
    /// Initializes a new instance of the <see cref="ConfigurationSource"/> class on the plugin instance.
    /// </summary>
    public ConfigurationSource()
        : this(() => Plugin.Instance?.Configuration ?? new PluginConfiguration(), SavePlugin)
    {
    }

    /// <summary>
    /// Initializes a new instance of the <see cref="ConfigurationSource"/> class with its own storage. Test seam: the
    /// plugin instance only exists in a running server. Invisible to the dependency injection container.
    /// </summary>
    /// <param name="get">Gets the configuration.</param>
    /// <param name="save">Saves it.</param>
    internal ConfigurationSource(Func<PluginConfiguration> get, Action save)
    {
        _get = get;
        _save = save;
    }

    /// <summary>
    /// Gets the current configuration.
    /// </summary>
    public PluginConfiguration Current => _get();

    /// <summary>
    /// Saves the configuration.
    /// </summary>
    /// <exception cref="System.IO.IOException">The file could not be written.</exception>
    public void Save() => _save();

    private static void SavePlugin()
    {
        Plugin plugin = Plugin.Instance ?? throw new InvalidOperationException("The plugin is not initialized.");
        plugin.SaveConfiguration();
    }
}
