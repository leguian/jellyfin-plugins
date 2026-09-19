using System;
using System.Linq;
using System.Reflection;
using Xunit;

namespace Jellyfin.Plugin.CustomizedHome.Tests;

/// <summary>
/// A server refuses a plugin whose Jellyfin assembly references are newer than its own assemblies.
/// The declared targetAbi is the version the plugin is built against: the references must not exceed it.
/// </summary>
public class PluginAssemblyTests
{
    private static readonly string[] ServerAssemblyPrefixes = ["MediaBrowser.", "Jellyfin.", "Emby."];

    [Fact]
    public void Jellyfin_references_do_not_exceed_the_declared_target_abi()
    {
        string declared = typeof(PluginAssemblyTests).Assembly
            .GetCustomAttributes<AssemblyMetadataAttribute>()
            .Single(attribute => attribute.Key == "JellyfinVersion")
            .Value!;
        Version targetAbi = Version.Parse(declared + ".0");

        AssemblyName[] references = typeof(Plugin).Assembly.GetReferencedAssemblies()
            .Where(reference => ServerAssemblyPrefixes.Any(prefix => reference.Name!.StartsWith(prefix, StringComparison.Ordinal)))
            .ToArray();

        Assert.NotEmpty(references);
        Assert.All(references, reference => Assert.True(
            reference.Version <= targetAbi,
            $"{reference.Name} {reference.Version} is newer than the declared targetAbi {targetAbi}"));
    }
}
