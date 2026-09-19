using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Text.Json;
using Xunit;

namespace Jellyfin.Plugin.CustomizedHome.Tests;

/// <summary>
/// A server refuses a plugin whose Jellyfin assembly references are newer than its own assemblies.
/// The declared targetAbi is the version the plugin is built against: the references must not exceed it.
/// </summary>
public class PluginAssemblyTests
{
    /// <summary>
    /// Path of a zip produced by scripts/package.py. Set by the CI after packaging.
    /// </summary>
    private const string PackageVariable = "CUSTOMIZED_HOME_PACKAGE";

    private static readonly string[] ServerAssemblyPrefixes = ["MediaBrowser.", "Jellyfin.", "Emby."];

    /// <summary>
    /// The real thing: the targetAbi written by package.py in meta.json against the assembly shipped next to it.
    /// </summary>
    [Fact]
    public void Packaged_assembly_does_not_reference_a_newer_server_than_its_meta_json_declares()
    {
        string? zipPath = Environment.GetEnvironmentVariable(PackageVariable);
        if (string.IsNullOrEmpty(zipPath))
        {
            // No package at hand (plain local run): the build level check below still applies.
            return;
        }

        using ZipArchive zip = ZipFile.OpenRead(zipPath);
        using JsonDocument meta = JsonDocument.Parse(ReadEntry(zip, "meta.json"));
        Version targetAbi = Version.Parse(meta.RootElement.GetProperty("targetAbi").GetString()!);
        List<string> assemblies = meta.RootElement.GetProperty("assemblies").EnumerateArray().Select(item => item.GetString()!).ToList();
        Assert.NotEmpty(assemblies);

        foreach (string assembly in assemblies)
        {
            using MemoryStream stream = new(ReadEntry(zip, assembly));
            using PEReader pe = new(stream);
            MetadataReader reader = pe.GetMetadataReader();
            List<(string Name, Version Version)> references = reader.AssemblyReferences
                .Select(handle => reader.GetAssemblyReference(handle))
                .Select(reference => (reader.GetString(reference.Name), reference.Version))
                .Where(reference => ServerAssemblyPrefixes.Any(prefix => reference.Item1.StartsWith(prefix, StringComparison.Ordinal)))
                .ToList();

            Assert.NotEmpty(references);
            Assert.All(references, reference => Assert.True(
                reference.Version <= targetAbi,
                $"{assembly}: {reference.Name} {reference.Version} is newer than the targetAbi {targetAbi} declared in meta.json"));
        }
    }

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

    private static byte[] ReadEntry(ZipArchive zip, string name)
    {
        ZipArchiveEntry entry = zip.GetEntry(name) ?? throw new FileNotFoundException(name + " is missing from the package");
        using Stream source = entry.Open();
        using MemoryStream buffer = new();
        source.CopyTo(buffer);
        return buffer.ToArray();
    }
}
