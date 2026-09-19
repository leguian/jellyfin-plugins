using Xunit;

namespace Jellyfin.Plugin.CustomizedHome.Tests;

/// <summary>
/// Tests that create a <see cref="Plugin"/>. Its constructor sets the process wide <see cref="Plugin.Instance"/>,
/// which the controller and the index.html patch read: these tests never run while another test does.
/// </summary>
[CollectionDefinition(Name, DisableParallelization = true)]
public sealed class PluginInstanceCollection
{
    /// <summary>
    /// The collection name.
    /// </summary>
    public const string Name = "Plugin instance";
}
