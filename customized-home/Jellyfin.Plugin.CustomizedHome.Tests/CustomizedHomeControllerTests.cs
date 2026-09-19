using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Claims;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.CustomizedHome.Api;
using Jellyfin.Plugin.CustomizedHome.Configuration;
using Jellyfin.Plugin.CustomizedHome.Helpers;
using Jellyfin.Plugin.CustomizedHome.Models;
using Jellyfin.Plugin.CustomizedHome.Services;
using MediaBrowser.Common.Api;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Net.Http.Headers;
using Moq;
using Xunit;

namespace Jellyfin.Plugin.CustomizedHome.Tests;

/// <summary>
/// The controller with its real stores on a temporary folder. The authentication pipeline of the server is not
/// there: the principal is built with the claims Jellyfin's CustomAuthenticationHandler sets (user identifier in
/// "Jellyfin-UserId", role "Administrator" or "User"). A renamed claim upstream can only be seen on a real server.
/// </summary>
public sealed class CustomizedHomeControllerTests : IDisposable
{
    private static readonly Guid Alice = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly Guid Bob = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000002");
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00];

    private readonly string _root = Path.Combine(Path.GetTempPath(), "ch-tests-" + Guid.NewGuid().ToString("N"));
    private readonly PluginConfiguration _config = new();
    private readonly Mock<IUserManager> _userManager = new();
    private readonly Mock<IUserViewManager> _userViewManager = new();
    private readonly WebInjectionService _injection = new(NullLogger<WebInjectionService>.Instance);
    private readonly RecordingLogger _logger = new();
    private readonly LayoutStore _store;
    private readonly GenreImageStore _genreImages;

    // Set by a test to make the disk refuse: a locked file cannot be produced the same way on every platform.
    private Exception? _diskFailure;

    public CustomizedHomeControllerTests()
    {
        Mock<IApplicationPaths> paths = new();
        paths.SetupGet(p => p.PluginConfigurationsPath).Returns(_root);
        _store = new LayoutStore(paths.Object, NullLogger<LayoutStore>.Instance, File.OpenRead, path =>
        {
            ThrowWhenTheDiskRefuses();
            File.Delete(path);
        });
        _genreImages = new GenreImageStore(paths.Object, NullLogger<GenreImageStore>.Instance, path =>
        {
            ThrowWhenTheDiskRefuses();
            return File.OpenRead(path);
        });

        _userManager.Setup(manager => manager.GetUserById(Alice)).Returns(NewUser("alice", Alice));
        _userManager.Setup(manager => manager.GetUserById(Bob)).Returns(NewUser("bob", Bob));
        _userViewManager.Setup(manager => manager.GetUserViews(It.IsAny<UserViewQuery>())).Returns(Array.Empty<Folder>());
    }

    public void Dispose()
    {
        _injection.Dispose();
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    private static User NewUser(string name, Guid id)
    {
        return new User(name, "test-provider", "test-provider") { Id = id };
    }

    private static ClaimsPrincipal Principal(string? userIdClaim, bool administrator)
    {
        List<Claim> claims = [new Claim(ClaimTypes.Role, administrator ? "Administrator" : "User")];
        if (userIdClaim is not null)
        {
            claims.Add(new Claim("Jellyfin-UserId", userIdClaim));
        }

        return new ClaimsPrincipal(new ClaimsIdentity(claims, "CustomAuthentication"));
    }

    private CustomizedHomeController ControllerFor(ClaimsPrincipal principal)
    {
        return new CustomizedHomeController(_store, _genreImages, _injection, _userManager.Object, _userViewManager.Object, _logger, () => _config)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = principal } }
        };
    }

    private CustomizedHomeController ControllerFor(Guid userId, bool administrator = false)
    {
        return ControllerFor(Principal(userId.ToString("N"), administrator));
    }

    private void ThrowWhenTheDiskRefuses()
    {
        if (_diskFailure is not null)
        {
            throw _diskFailure;
        }
    }

    private GenreImageStore NewGenreImageStore()
    {
        Mock<IApplicationPaths> paths = new();
        paths.SetupGet(p => p.PluginConfigurationsPath).Returns(_root);
        return new GenreImageStore(paths.Object, NullLogger<GenreImageStore>.Instance);
    }

    private void AssertStorageUnavailable(ActionResult? result, Exception cause)
    {
        ObjectResult answer = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, answer.StatusCode);
        string message = Assert.IsType<string>(answer.Value);
        Assert.Contains("could not be written", message, StringComparison.Ordinal);

        // The cause is for the administrator, in the server log, not for the client.
        Assert.DoesNotContain(cause.Message, message, StringComparison.Ordinal);
        (LogLevel Level, Exception? Exception) entry = Assert.Single(_logger.Entries);
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.Same(cause, entry.Exception);
    }

    private static HomeLayout Layout(params string[] keys)
    {
        return new HomeLayout { Items = keys.Select(key => new LayoutItem { Key = key }).ToList() };
    }

    private static IEnumerable<string?> KeysOf(HomeLayout layout)
    {
        return layout.Items.Select(item => item.Key);
    }

    private static void AssertForbidden(ActionResult? result)
    {
        if (result is ObjectResult withBody)
        {
            Assert.Equal(StatusCodes.Status403Forbidden, withBody.StatusCode);
        }
        else
        {
            Assert.IsType<ForbidResult>(result);
        }
    }

    // ---- Reading the layout ----

    [Fact]
    public void A_user_gets_their_own_layout_and_never_the_layout_of_someone_else()
    {
        _store.Save(Alice, Layout("jf:resume", "jf:nextup"));

        LayoutResponse alice = ControllerFor(Alice).GetLayout().Value!;
        LayoutResponse bob = ControllerFor(Bob).GetLayout().Value!;

        Assert.Equal("user", alice.Source);
        Assert.True(alice.HasUserLayout);
        Assert.Equal(["jf:resume", "jf:nextup"], KeysOf(alice.Layout));

        Assert.Equal("none", bob.Source);
        Assert.False(bob.HasUserLayout);
        Assert.Empty(bob.Layout.Items);
    }

    [Fact]
    public void A_user_without_a_layout_gets_the_default_one_even_when_it_is_a_hero_alone()
    {
        _config.DefaultLayout = Layout("jf:latestmedia");
        Assert.Equal("default", ControllerFor(Bob).GetLayout().Value!.Source);
        Assert.Equal(["jf:latestmedia"], KeysOf(ControllerFor(Bob).GetLayout().Value!.Layout));

        _config.DefaultLayout = new HomeLayout { Hero = new HeroSettings { Enabled = true, Sources = ["random"] } };
        LayoutResponse heroOnly = ControllerFor(Bob).GetLayout().Value!;
        Assert.Equal("default", heroOnly.Source);
        Assert.True(heroOnly.Layout.Hero.Enabled);
    }

    [Fact]
    public void The_default_layout_is_sent_without_the_libraries_the_user_cannot_access()
    {
        string hiddenLibrary = DefaultLayoutFilter.LatestMediaPrefix + Guid.NewGuid().ToString("N");
        _config.DefaultLayout = new HomeLayout
        {
            Items = [new LayoutItem { Key = "jf:resume" }, new LayoutItem { Key = hiddenLibrary, Label = "Recently Added in Private" }]
        };

        LayoutResponse response = ControllerFor(Bob).GetLayout().Value!;

        Assert.Equal(["jf:resume"], KeysOf(response.Layout));
        Assert.Equal(2, _config.DefaultLayout.Items.Count);
        _userViewManager.Verify(manager => manager.GetUserViews(It.Is<UserViewQuery>(query => query.User.Id == Bob && query.IncludeHidden)), Times.Once);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void The_response_tells_the_client_who_the_user_is_and_what_the_administrator_chose(bool administrator)
    {
        _config.ShowCustomizeButtonOnHome = false;
        _config.ShowUserMenuEntry = false;
        _config.FoldersCollapsible = false;
        _config.EnableIntegratedSections = false;

        LayoutResponse response = ControllerFor(Alice, administrator).GetLayout().Value!;

        Assert.Equal(administrator, response.IsAdministrator);
        Assert.True(response.CanCustomize);
        Assert.False(response.ShowCustomizeButtonOnHome);
        Assert.False(response.ShowUserMenuEntry);
        Assert.False(response.FoldersCollapsible);
        Assert.False(response.EnableIntegratedSections);
    }

    // ---- Requests that carry no usable user identifier (API keys, a claim that changed) ----

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-a-guid")]
    [InlineData("00000000000000000000000000000000")]
    public void Without_a_user_identifier_nothing_is_saved_or_reset_and_no_user_layout_is_read(string? claim)
    {
        _store.Save(Alice, Layout("jf:resume"));
        _store.Save(Guid.Empty, Layout("jf:nextup"));
        CustomizedHomeController controller = ControllerFor(Principal(claim, administrator: false));

        LayoutResponse response = controller.GetLayout().Value!;
        Assert.Equal("none", response.Source);
        Assert.False(response.HasUserLayout);

        Assert.IsType<ForbidResult>(controller.SaveLayout(Layout("jf:latestmedia")).Result);
        Assert.IsType<ForbidResult>(controller.ResetLayout(null));
        Assert.IsType<ForbidResult>(controller.ResetLayout(Guid.Empty));
        Assert.IsType<ForbidResult>(controller.ResetLayout(Alice));

        Assert.Equal(["jf:resume"], KeysOf(_store.Get(Alice)!));
        Assert.Equal(["jf:nextup"], KeysOf(_store.Get(Guid.Empty)!));
    }

    [Fact]
    public void An_administrator_api_key_has_no_layout_of_its_own_but_can_reset_a_user()
    {
        _store.Save(Alice, Layout("jf:resume"));
        CustomizedHomeController controller = ControllerFor(Principal(Guid.Empty.ToString("N"), administrator: true));

        Assert.IsType<ForbidResult>(controller.SaveLayout(Layout("jf:latestmedia")).Result);
        Assert.IsType<ForbidResult>(controller.ResetLayout(null));
        Assert.IsType<NoContentResult>(controller.ResetLayout(Alice));

        Assert.Null(_store.Get(Alice));
    }

    // ---- Resetting ----

    [Fact]
    public void A_user_cannot_reset_the_layout_of_someone_else()
    {
        _store.Save(Alice, Layout("jf:resume"));

        ActionResult result = ControllerFor(Bob).ResetLayout(Alice);

        Assert.IsType<ForbidResult>(result);
        Assert.Equal(["jf:resume"], KeysOf(_store.Get(Alice)!));
        Assert.Single(_store.List());
    }

    [Fact]
    public void An_administrator_can_reset_the_layout_of_someone_else()
    {
        _store.Save(Alice, Layout("jf:resume"));
        _store.Save(Bob, Layout("jf:nextup"));

        ActionResult result = ControllerFor(Bob, administrator: true).ResetLayout(Alice);

        Assert.IsType<NoContentResult>(result);
        Assert.Null(_store.Get(Alice));
        Assert.NotNull(_store.Get(Bob));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void A_user_resets_their_own_layout_with_or_without_naming_themselves(bool explicitIdentifier)
    {
        _store.Save(Alice, Layout("jf:resume"));
        _store.Save(Bob, Layout("jf:nextup"));

        ActionResult result = ControllerFor(Alice).ResetLayout(explicitIdentifier ? Alice : null);

        Assert.IsType<NoContentResult>(result);
        Assert.Null(_store.Get(Alice));
        Assert.NotNull(_store.Get(Bob));
    }

    // ---- Saving ----

    [Fact]
    public void Saving_stores_the_normalized_layout_for_the_current_user_only()
    {
        HomeLayout sent = Layout("jf:resume", " ", "jf:resume", "jf:nextup");
        sent.Items[0].Shape = "HEXAGON";

        ActionResult<HomeLayout> result = ControllerFor(Alice).SaveLayout(sent);

        Assert.Equal(["jf:resume", "jf:nextup"], KeysOf(result.Value!));
        Assert.Equal(LayoutFormats.ShapeAuto, result.Value!.Items[0].Shape);
        Assert.Equal(["jf:resume", "jf:nextup"], KeysOf(_store.Get(Alice)!));
        Assert.Null(_store.Get(Bob));
        Assert.Equal("user", ControllerFor(Alice).GetLayout().Value!.Source);
    }

    [Fact]
    public void A_layout_the_validator_rejects_is_a_bad_request_and_nothing_is_stored()
    {
        HomeLayout tooLarge = Layout(Enumerable.Range(0, 501).Select(index => "key:" + index).ToArray());

        ActionResult<HomeLayout> result = ControllerFor(Alice).SaveLayout(tooLarge);

        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Null(_store.Get(Alice));
    }

    // ---- ForceDefaultLayout and AllowUserCustomization ----

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void A_forced_default_layout_applies_to_everyone_administrators_included(bool administrator)
    {
        _config.ForceDefaultLayout = true;
        _config.DefaultLayout = Layout("jf:latestmedia");
        _store.Save(Alice, Layout("jf:resume"));
        CustomizedHomeController controller = ControllerFor(Alice, administrator);

        LayoutResponse response = controller.GetLayout().Value!;
        Assert.Equal("default", response.Source);
        Assert.Equal(["jf:latestmedia"], KeysOf(response.Layout));
        Assert.False(response.CanCustomize);

        // The saved layout is kept, ignored: it applies again when the administrator stops forcing the default.
        Assert.True(response.HasUserLayout);

        AssertForbidden(controller.SaveLayout(Layout("jf:nextup")).Result);
        Assert.Equal(["jf:resume"], KeysOf(_store.Get(Alice)!));

        _config.ForceDefaultLayout = false;
        Assert.Equal("user", controller.GetLayout().Value!.Source);
    }

    [Fact]
    public void A_forced_default_layout_that_is_empty_leaves_the_regular_home_page()
    {
        _config.ForceDefaultLayout = true;
        _store.Save(Alice, Layout("jf:resume"));

        LayoutResponse response = ControllerFor(Alice).GetLayout().Value!;

        Assert.Equal("none", response.Source);
        Assert.Empty(response.Layout.Items);
    }

    [Fact]
    public void With_customization_turned_off_a_user_gets_the_default_layout_and_cannot_save()
    {
        _config.AllowUserCustomization = false;
        _config.DefaultLayout = Layout("jf:latestmedia");
        _store.Save(Alice, Layout("jf:resume"));
        CustomizedHomeController controller = ControllerFor(Alice);

        LayoutResponse response = controller.GetLayout().Value!;
        Assert.False(response.CanCustomize);
        Assert.Equal("default", response.Source);
        Assert.Equal(["jf:latestmedia"], KeysOf(response.Layout));

        AssertForbidden(controller.SaveLayout(Layout("jf:nextup")).Result);
        Assert.Equal(["jf:resume"], KeysOf(_store.Get(Alice)!));
    }

    [Fact]
    public void With_customization_turned_off_an_administrator_still_has_a_layout_of_their_own()
    {
        _config.AllowUserCustomization = false;
        _config.DefaultLayout = Layout("jf:latestmedia");
        _store.Save(Alice, Layout("jf:resume"));
        CustomizedHomeController controller = ControllerFor(Alice, administrator: true);

        LayoutResponse response = controller.GetLayout().Value!;
        Assert.True(response.CanCustomize);
        Assert.Equal("user", response.Source);

        Assert.Equal(["jf:nextup"], KeysOf(controller.SaveLayout(Layout("jf:nextup")).Value!));
        Assert.Equal(["jf:nextup"], KeysOf(_store.Get(Alice)!));
    }

    // ---- Administration ----

    [Fact]
    public void The_default_layout_read_by_the_administration_page_is_the_configured_one()
    {
        _config.DefaultLayout = Layout("jf:latestmedia", "jf:resume");

        Assert.Same(_config.DefaultLayout, ControllerFor(Alice, administrator: true).GetDefaultLayout().Value);
    }

    [Fact]
    public void Stored_layouts_are_listed_with_the_user_names_in_alphabetical_order()
    {
        _store.Save(Bob, Layout("jf:resume"));
        _store.Save(Alice, Layout("jf:resume", "jf:nextup"));

        OkObjectResult result = Assert.IsType<OkObjectResult>(ControllerFor(Alice, administrator: true).GetUserLayouts().Result);
        List<StoredLayoutInfo> layouts = Assert.IsAssignableFrom<IEnumerable<StoredLayoutInfo>>(result.Value).ToList();

        Assert.Equal(["alice", "bob"], layouts.Select(info => info.UserName));
        Assert.Equal([Alice, Bob], layouts.Select(info => info.UserId));
        Assert.Equal([2, 1], layouts.Select(info => info.SectionCount));
    }

    [Fact]
    public void The_layout_left_by_a_deleted_user_is_neither_listed_nor_counted()
    {
        Guid deleted = Guid.Parse("dddddddd-0000-0000-0000-000000000004");
        _store.Save(Alice, Layout("jf:resume"));
        _store.Save(deleted, Layout("jf:resume"));

        // A file named after the empty identifier can only be made by hand; the user manager throws when asked about it.
        _store.Save(Guid.Empty, Layout("jf:resume"));
        _userManager.Setup(manager => manager.GetUserById(Guid.Empty)).Throws(new ArgumentException("Guid can't be empty"));
        CustomizedHomeController controller = ControllerFor(Alice, administrator: true);

        OkObjectResult result = Assert.IsType<OkObjectResult>(controller.GetUserLayouts().Result);
        StoredLayoutInfo listed = Assert.Single(Assert.IsAssignableFrom<IEnumerable<StoredLayoutInfo>>(result.Value));

        Assert.Equal(Alice, listed.UserId);
        Assert.Equal("alice", listed.UserName);

        // One lookup per stored layout: on Jellyfin 12 each of them is a database query.
        _userManager.Verify(manager => manager.GetUserById(Alice), Times.Once);
        _userManager.Verify(manager => manager.GetUserById(deleted), Times.Once);
        Assert.Equal(1, controller.GetStatus().Value!.UserLayoutCount);

        // Still there for an administrator who asks for it by identifier.
        Assert.IsType<NoContentResult>(controller.ResetLayout(deleted));
        Assert.Null(_store.Get(deleted));
    }

    [Fact]
    public void The_status_counts_the_layouts_and_reports_the_registration_state()
    {
        _config.DefaultLayout = Layout("jf:latestmedia", "jf:resume");
        _store.Save(Alice, Layout("jf:resume"));

        PluginStatus status = ControllerFor(Alice, administrator: true).GetStatus().Value!;

        Assert.Equal(1, status.UserLayoutCount);
        Assert.Equal(2, status.DefaultLayoutItemCount);
        Assert.Same(_injection.Status, status.Injection);
        Assert.Equal(string.Empty, status.RootPath);
    }

    [Fact]
    public void Without_Home_Screen_Sections_its_sections_are_left_out_of_the_catalog()
    {
        OkObjectResult result = Assert.IsType<OkObjectResult>(ControllerFor(Alice).GetCatalog().Result);
        List<SectionDefinition> catalog = Assert.IsAssignableFrom<IEnumerable<SectionDefinition>>(result.Value).ToList();

        Assert.NotEmpty(catalog);
        Assert.DoesNotContain(catalog, definition => definition.Origin == SectionCatalog.HomeScreenSectionsOrigin);
        Assert.Contains(SectionCatalog.All, definition => definition.Origin == SectionCatalog.HomeScreenSectionsOrigin);
    }

    // ---- Genre thumbnails ----

    public static TheoryData<string?, string?, string> RejectedUploads()
    {
        return new TheoryData<string?, string?, string>
        {
            { "Comedy", null, "required" },
            { "Comedy", string.Empty, "required" },
            { "Comedy", "this is not base64!", "base64" },
            { "Comedy", Convert.ToBase64String("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"u8.ToArray()), "Unsupported" },
            { "   ", Convert.ToBase64String(Png), "name" },
            { null, Convert.ToBase64String(Png), "name" }
        };
    }

    [Theory]
    [MemberData(nameof(RejectedUploads))]
    public void An_invalid_or_oversized_thumbnail_is_a_bad_request_and_nothing_is_stored(string? name, string? data, string expectedReason)
    {
        CustomizedHomeController controller = ControllerFor(Alice, administrator: true);

        ActionResult<GenreImageInfo> result = controller.UploadGenreImage(new GenreImageUpload { Name = name, Shape = "portrait", Data = data });

        BadRequestObjectResult rejected = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Contains(expectedReason, Assert.IsType<string>(rejected.Value), StringComparison.OrdinalIgnoreCase);
        Assert.Empty(_genreImages.List());
    }

    [Fact]
    public void An_oversized_thumbnail_is_refused_before_it_is_decoded()
    {
        // Valid base64 of a little more than 5 MB: only the length check of the controller answers with this message,
        // the store would say "empty or larger" after the whole payload was decoded.
        string data = new('A', ((GenreImageStore.MaxImageBytes / 3) + 2) * 4);

        ActionResult<GenreImageInfo> result = ControllerFor(Alice, administrator: true).UploadGenreImage(new GenreImageUpload { Name = "Comedy", Data = data });

        BadRequestObjectResult rejected = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("Image is larger than 5 MB.", rejected.Value);
        Assert.Empty(_genreImages.List());
    }

    [Fact]
    public void A_missing_upload_body_is_a_bad_request()
    {
        Assert.IsType<BadRequestObjectResult>(ControllerFor(Alice, administrator: true).UploadGenreImage(null!).Result);
    }

    [Fact]
    public void An_uploaded_thumbnail_is_listed_served_for_good_and_can_be_deleted()
    {
        CustomizedHomeController controller = ControllerFor(Alice, administrator: true);

        GenreImageInfo uploaded = controller.UploadGenreImage(new GenreImageUpload { Name = "Comedy", Shape = "landscape", Data = Convert.ToBase64String(Png) }).Value!;

        Assert.Equal("Comedy", uploaded.Name);
        Assert.Equal("landscape", uploaded.Shape);
        Assert.True(uploaded.Version > 0);

        OkObjectResult listed = Assert.IsType<OkObjectResult>(ControllerFor(Bob).GetGenreImages().Result);
        GenreImageInfo info = Assert.Single(Assert.IsAssignableFrom<IEnumerable<GenreImageInfo>>(listed.Value));
        Assert.Equal(uploaded.Version, info.Version);

        CustomizedHomeController anonymous = ControllerFor(new ClaimsPrincipal(new ClaimsIdentity()));
        FileContentResult image = Assert.IsType<FileContentResult>(anonymous.GetGenreImage("comedy", "landscape"));
        Assert.Equal(Png, image.FileContents);
        Assert.Equal("image/png", image.ContentType);
        Assert.Equal("public, max-age=31536000, immutable", anonymous.Response.Headers[HeaderNames.CacheControl].ToString());
        Assert.Equal("nosniff", anonymous.Response.Headers[HeaderNames.XContentTypeOptions].ToString());
        Assert.IsType<NotFoundResult>(anonymous.GetGenreImage("comedy", "portrait"));

        Assert.IsType<NoContentResult>(controller.DeleteGenreImage("Comedy", "landscape"));
        Assert.IsType<NotFoundResult>(anonymous.GetGenreImage("comedy", "landscape"));
        Assert.Empty(_genreImages.List());
    }

    // ---- The disk refuses (file locked by a backup, permissions, disk full) ----

    public static TheoryData<Exception> DiskFailures()
    {
        return new TheoryData<Exception>
        {
            new IOException("The process cannot access the file because it is being used by another process."),
            new UnauthorizedAccessException("Access to the path is denied.")
        };
    }

    [Theory]
    [MemberData(nameof(DiskFailures))]
    public void A_layout_that_cannot_be_deleted_is_a_503_and_the_layout_is_still_there(Exception failure)
    {
        _store.Save(Alice, Layout("jf:resume"));
        _diskFailure = failure;

        AssertStorageUnavailable(ControllerFor(Alice).ResetLayout(null), failure);

        _diskFailure = null;
        Assert.Equal(["jf:resume"], KeysOf(_store.Get(Alice)!));
        Assert.IsType<NoContentResult>(ControllerFor(Alice).ResetLayout(null));
        Assert.Null(_store.Get(Alice));
    }

    [Fact]
    public void A_layout_that_cannot_be_written_is_a_503_and_the_previous_one_is_still_there()
    {
        _store.Save(Alice, Layout("jf:resume"));

        // A folder where the store writes its temporary file: refused on every platform, as an IOException or
        // an UnauthorizedAccessException depending on the platform.
        string blocker = Directory.GetFiles(_root, "*.json", SearchOption.AllDirectories).Single() + ".tmp";
        Directory.CreateDirectory(blocker);

        ObjectResult answer = Assert.IsType<ObjectResult>(ControllerFor(Alice).SaveLayout(Layout("jf:nextup")).Result);

        Assert.Equal(StatusCodes.Status503ServiceUnavailable, answer.StatusCode);
        (LogLevel Level, Exception? Exception) entry = Assert.Single(_logger.Entries);
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.True(entry.Exception is IOException or UnauthorizedAccessException);
        Assert.Equal(["jf:resume"], KeysOf(_store.Get(Alice)!));

        Directory.Delete(blocker);
        Assert.Equal(["jf:nextup"], KeysOf(ControllerFor(Alice).SaveLayout(Layout("jf:nextup")).Value!));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void A_thumbnail_index_that_cannot_be_read_makes_uploads_and_deletions_a_503_and_nothing_changes(bool upload)
    {
        // Written by another instance: the store of the controller has yet to read the index.
        NewGenreImageStore().Save("Comedy", "portrait", Png, out _);
        _diskFailure = new IOException("The process cannot access the file because it is being used by another process.");
        CustomizedHomeController controller = ControllerFor(Alice, administrator: true);

        ActionResult? result = upload
            ? controller.UploadGenreImage(new GenreImageUpload { Name = "Drama", Shape = "portrait", Data = Convert.ToBase64String(Png) }).Result
            : controller.DeleteGenreImage("Comedy", "portrait");

        // The store reports the unreadable index with an exception of its own: only its kind is known here.
        ObjectResult answer = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, answer.StatusCode);
        Assert.Contains("could not be written", Assert.IsType<string>(answer.Value), StringComparison.Ordinal);
        (LogLevel Level, Exception? Exception) entry = Assert.Single(_logger.Entries);
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.IsType<IOException>(entry.Exception);

        _diskFailure = null;
        Assert.Equal(["Comedy"], NewGenreImageStore().List().Select(image => image.Name));
        Assert.IsType<NoContentResult>(controller.DeleteGenreImage("Comedy", "portrait"));
        Assert.Empty(NewGenreImageStore().List());
    }

    [Theory]
    [MemberData(nameof(DiskFailures))]
    public void A_thumbnail_file_that_cannot_be_read_is_a_503_and_not_a_404_the_client_would_cache(Exception failure)
    {
        // The index names the file, the file itself refuses: not "there is no thumbnail". The image is served
        // as immutable for a year, so a 404 here would be remembered by browsers and proxies long after the
        // disk is well again.
        _genreImages.Save("Comedy", "portrait", Png, out _);
        CustomizedHomeController anonymous = ControllerFor(new ClaimsPrincipal(new ClaimsIdentity()));

        // The index is already in memory: this failure can only come from reading the image file.
        _diskFailure = failure;
        ActionResult result = anonymous.GetGenreImage("Comedy", "portrait");

        ObjectResult answer = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, answer.StatusCode);
        string message = Assert.IsType<string>(answer.Value);
        Assert.Contains("could not be read", message, StringComparison.Ordinal);
        Assert.DoesNotContain(failure.Message, message, StringComparison.Ordinal);
        (LogLevel Level, Exception? Exception) entry = Assert.Single(_logger.Entries);
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.Same(failure, entry.Exception);

        // Nothing was cached for a year on the way out.
        Assert.Empty(anonymous.Response.Headers[HeaderNames.CacheControl].ToString());

        // Once the disk answers again the image is served as usual.
        _diskFailure = null;
        FileContentResult served = Assert.IsType<FileContentResult>(ControllerFor(new ClaimsPrincipal(new ClaimsIdentity())).GetGenreImage("Comedy", "portrait"));
        Assert.Equal(Png, served.FileContents);
    }

    [Fact]
    public void A_missing_thumbnail_is_still_a_404()
    {
        Assert.IsType<NotFoundResult>(ControllerFor(new ClaimsPrincipal(new ClaimsIdentity())).GetGenreImage("Comedy", "portrait"));
        Assert.Empty(_logger.Entries);
    }

    [Fact]
    public void A_storage_failure_is_declared_by_every_action_that_reaches_the_disk()
    {
        string[] writers =
        [
            nameof(CustomizedHomeController.SaveLayout),
            nameof(CustomizedHomeController.ResetLayout),
            nameof(CustomizedHomeController.UploadGenreImage),
            nameof(CustomizedHomeController.DeleteGenreImage),
            nameof(CustomizedHomeController.SaveDefaultLayout),
            nameof(CustomizedHomeController.GetGenreImage)
        ];

        foreach (string writer in writers)
        {
            IEnumerable<int> declared = typeof(CustomizedHomeController).GetMethod(writer)!.GetCustomAttributes<ProducesResponseTypeAttribute>().Select(attribute => attribute.StatusCode);
            Assert.Contains(StatusCodes.Status503ServiceUnavailable, declared);
        }
    }

    // ---- Client assets ----

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Client_assets_are_embedded_and_revalidated_with_their_etag(bool script)
    {
        CustomizedHomeController first = ControllerFor(new ClaimsPrincipal(new ClaimsIdentity()));
        FileContentResult asset = Assert.IsType<FileContentResult>(script ? first.GetScript() : first.GetStylesheet());
        string etag = first.Response.Headers[HeaderNames.ETag].ToString();

        Assert.NotEmpty(asset.FileContents);
        Assert.StartsWith(script ? "application/javascript" : "text/css", asset.ContentType, StringComparison.Ordinal);
        Assert.Equal("no-cache", first.Response.Headers[HeaderNames.CacheControl].ToString());
        Assert.Matches("^\"[0-9a-f]{16}\"$", etag);

        CustomizedHomeController second = ControllerFor(new ClaimsPrincipal(new ClaimsIdentity()));
        second.Request.Headers[HeaderNames.IfNoneMatch] = etag;
        StatusCodeResult notModified = Assert.IsType<StatusCodeResult>(script ? second.GetScript() : second.GetStylesheet());
        Assert.Equal(StatusCodes.Status304NotModified, notModified.StatusCode);

        // Developer mode: always the full file, never cached.
        _config.DeveloperMode = true;
        CustomizedHomeController developer = ControllerFor(new ClaimsPrincipal(new ClaimsIdentity()));
        developer.Request.Headers[HeaderNames.IfNoneMatch] = etag;
        Assert.IsType<FileContentResult>(script ? developer.GetScript() : developer.GetStylesheet());
        Assert.Equal("no-store", developer.Response.Headers[HeaderNames.CacheControl].ToString());
    }

    // ---- What the server enforces before an action runs ----

    [Fact]
    public void Every_action_requires_authentication_except_the_client_assets_and_the_administration_requires_elevation()
    {
        string[] anonymous = [nameof(CustomizedHomeController.GetScript), nameof(CustomizedHomeController.GetStylesheet), nameof(CustomizedHomeController.GetGenreImage)];
        string[] elevated =
        [
            nameof(CustomizedHomeController.GetDefaultLayout),
            nameof(CustomizedHomeController.SaveDefaultLayout),
            nameof(CustomizedHomeController.GetStatus),
            nameof(CustomizedHomeController.RetryRegistration),
            nameof(CustomizedHomeController.GetUserLayouts),
            nameof(CustomizedHomeController.UploadGenreImage),
            nameof(CustomizedHomeController.DeleteGenreImage)
        ];
        string[] authenticated =
        [
            nameof(CustomizedHomeController.GetLayout),
            nameof(CustomizedHomeController.SaveLayout),
            nameof(CustomizedHomeController.ResetLayout),
            nameof(CustomizedHomeController.GetCatalog),
            nameof(CustomizedHomeController.GetGenreImages)
        ];

        List<MethodInfo> actions = typeof(CustomizedHomeController)
            .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(method => method.GetCustomAttributes<HttpMethodAttribute>().Any())
            .ToList();

        // A new action has to be classified here: nothing is reachable by accident.
        Assert.Equal(anonymous.Concat(elevated).Concat(authenticated).Order(), actions.Select(action => action.Name).Order());
        Assert.Empty(typeof(CustomizedHomeController).GetCustomAttributes<AllowAnonymousAttribute>());

        foreach (MethodInfo action in actions)
        {
            bool allowsAnonymous = action.GetCustomAttributes<AllowAnonymousAttribute>().Any();
            string? policy = action.GetCustomAttributes<AuthorizeAttribute>().SingleOrDefault()?.Policy;
            bool authorizes = action.GetCustomAttributes<AuthorizeAttribute>().Any();

            if (anonymous.Contains(action.Name))
            {
                Assert.True(allowsAnonymous && !authorizes, action.Name + " serves a client asset to anonymous requests.");
            }
            else
            {
                Assert.True(authorizes && !allowsAnonymous, action.Name + " must require authentication.");
                Assert.Equal(elevated.Contains(action.Name) ? Policies.RequiresElevation : null, policy);
            }
        }
    }

    private sealed class RecordingLogger : ILogger<CustomizedHomeController>
    {
        public List<(LogLevel Level, Exception? Exception)> Entries { get; } = new();

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull
        {
            return null;
        }

        public bool IsEnabled(LogLevel logLevel)
        {
            return true;
        }

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Entries.Add((logLevel, exception));
        }
    }
}
