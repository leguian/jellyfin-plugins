using System;
using System.Linq;
using System.Reflection;
using Jellyfin.Plugin.CustomizedHome.Helpers;
using Jellyfin.Plugin.CustomizedHome.Models;
using Xunit;

namespace Jellyfin.Plugin.CustomizedHome.Tests;

/// <summary>
/// The callback runs on every file of the web client whose name matches "index.html", on every server that
/// installs the plugin: a document it must not touch has to come back untouched.
/// No test creates a <see cref="Plugin"/> instance, so the callback runs here with an empty base URL.
/// </summary>
public class TransformationPatchesTests
{
    private const string Html = "<!DOCTYPE html><html><head><title>Jellyfin</title></head><body><div id=\"reactRoot\"></div></body></html>";
    private const string LinkStart = "<link rel=\"stylesheet\" href=\"";
    private const string ScriptStart = "<script src=\"";

    private static string Patch(string? contents)
    {
        return TransformationPatches.IndexHtml(new TransformationPayload { Contents = contents });
    }

    private static int Count(string text, string fragment)
    {
        int count = 0;
        for (int index = text.IndexOf(fragment, StringComparison.Ordinal); index >= 0; index = text.IndexOf(fragment, index + fragment.Length, StringComparison.Ordinal))
        {
            count++;
        }

        return count;
    }

    [Fact]
    public void A_document_gets_exactly_one_stylesheet_before_the_head_end_and_one_script_before_the_body_end()
    {
        string result = Patch(Html);

        Assert.Equal(1, Count(result, LinkStart));
        Assert.Equal(1, Count(result, ScriptStart));
        Assert.Equal(2, Count(result, TransformationPatches.Marker));
        Assert.Contains(TransformationPatches.Marker + " /></head>", result, StringComparison.Ordinal);
        Assert.Contains(TransformationPatches.Marker + " defer></script></body>", result, StringComparison.Ordinal);
        Assert.Contains(LinkStart + "/CustomizedHome/customized-home.css?v=", result, StringComparison.Ordinal);
        Assert.Contains(ScriptStart + "/CustomizedHome/customized-home.js?v=", result, StringComparison.Ordinal);

        // Nothing else moved: taking the two tags out gives the original document back.
        int linkIndex = result.IndexOf(LinkStart, StringComparison.Ordinal);
        int linkEnd = result.IndexOf("</head>", StringComparison.Ordinal);
        int scriptIndex = result.IndexOf(ScriptStart, StringComparison.Ordinal);
        int scriptEnd = result.IndexOf("</body>", StringComparison.Ordinal);
        Assert.Equal(Html, string.Concat(result.AsSpan(0, linkIndex), result.AsSpan(linkEnd, scriptIndex - linkEnd), result.AsSpan(scriptEnd)));
    }

    [Fact]
    public void Patching_twice_changes_nothing_more()
    {
        string once = Patch(Html);

        Assert.Equal(once, Patch(once));
    }

    [Theory]
    [InlineData("\"use strict\";(self.webpackChunk=self.webpackChunk||[]).push([[4213],{\"index.html\":function(e){e.exports=\"<head></head><div>login</div>\"}}]);")]
    [InlineData("<html><head></head><body>never closed")]
    [InlineData("")]
    public void Content_without_a_body_end_tag_is_returned_as_it_came(string contents)
    {
        // The pattern also matches script chunks such as "session-login-index-html.xxx.chunk.js".
        Assert.Same(contents, Patch(contents));
    }

    [Fact]
    public void Tags_are_found_whatever_their_case()
    {
        string result = Patch("<HTML><HEAD></HEAD><BODY><p>hi</p></BODY></HTML>");

        Assert.Contains(" /></HEAD>", result, StringComparison.Ordinal);
        Assert.Contains("defer></script></BODY>", result, StringComparison.Ordinal);
        Assert.Equal(2, Count(result, TransformationPatches.Marker));
    }

    [Fact]
    public void A_document_without_a_head_end_tag_only_gets_the_script()
    {
        string result = Patch("<html><body><p>hi</p></body></html>");

        Assert.Equal(0, Count(result, LinkStart));
        Assert.Equal(1, Count(result, ScriptStart));
        Assert.EndsWith("defer></script></body></html>", result, StringComparison.Ordinal);
        Assert.StartsWith("<html><body><p>hi</p><script ", result, StringComparison.Ordinal);
    }

    [Fact]
    public void The_tags_go_before_the_last_end_tag_when_the_document_quotes_one()
    {
        string result = Patch("<html><head></head><body><script>var s = '</body>';</script><p>hi</p></body></html>");

        Assert.Contains("var s = '</body>';</script><p>hi</p><script src=", result, StringComparison.Ordinal);
    }

    [Fact]
    public void Missing_contents_give_an_empty_document_and_a_missing_payload_is_refused()
    {
        Assert.Equal(string.Empty, Patch(null));
        Assert.Throws<ArgumentNullException>(() => TransformationPatches.IndexHtml(null!));
    }

    [Theory]
    [InlineData(null, "")]
    [InlineData("", "")]
    [InlineData("   ", "")]
    [InlineData("/", "")]
    [InlineData("jf", "/jf")]
    [InlineData("/jf", "/jf")]
    [InlineData("/jf/", "/jf")]
    [InlineData("  /media/jellyfin/ ", "/media/jellyfin")]
    public void The_base_url_becomes_a_prefix_without_trailing_slash(string? baseUrl, string expected)
    {
        Assert.Equal(expected, TransformationPatches.NormalizeRootPath(baseUrl));
    }

    [Fact]
    public void Asset_urls_start_with_the_base_url_and_carry_the_cache_key()
    {
        string result = TransformationPatches.InjectAssets(Html, TransformationPatches.NormalizeRootPath("/jf/"), "1.2.3.0");

        Assert.Contains("href=\"/jf/CustomizedHome/customized-home.css?v=1.2.3.0\"", result, StringComparison.Ordinal);
        Assert.Contains("src=\"/jf/CustomizedHome/customized-home.js?v=1.2.3.0\"", result, StringComparison.Ordinal);
    }

    [Fact]
    public void File_Transformation_can_look_the_callback_up_by_name()
    {
        // File Transformation calls type.GetMethod(name): a second method of that name, whatever its visibility
        // or a future change of their binding flags, would make the lookup ambiguous and stop the injection.
        MethodInfo callback = Assert.Single(
            typeof(TransformationPatches).GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance),
            method => method.Name == nameof(TransformationPatches.IndexHtml));

        Assert.True(callback.IsPublic && callback.IsStatic);
        Assert.Equal(typeof(string), callback.ReturnType);

        // The payload is built from { "contents": "..." }: a public settable property of that name, any case.
        ParameterInfo parameter = Assert.Single(callback.GetParameters());
        PropertyInfo contents = parameter.ParameterType.GetProperties().Single(property => string.Equals(property.Name, "contents", StringComparison.OrdinalIgnoreCase));
        Assert.True(contents.CanWrite && contents.PropertyType == typeof(string));
        Assert.NotNull(parameter.ParameterType.GetConstructor(Type.EmptyTypes));
    }
}
