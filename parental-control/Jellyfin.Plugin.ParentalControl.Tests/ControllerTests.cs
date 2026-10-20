using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.ParentalControl.Api;
using Jellyfin.Plugin.ParentalControl.Configuration;
using Jellyfin.Plugin.ParentalControl.Models;
using Jellyfin.Plugin.ParentalControl.Services;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Configuration;
using MediaBrowser.Model.Users;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Jellyfin.Plugin.ParentalControl.Tests;

public sealed class ControllerTests : IDisposable
{
    private readonly TempFolder _folder = new();
    private readonly UserDirectory _users = new();
    private readonly MemoryConfiguration _config = new();
    private readonly ManualTimeProvider _time = new(new DateTimeOffset(2026, 10, 20, 12, 0, 0, TimeSpan.Zero));
    private readonly TagSyncService _tagSync;
    private readonly ProfileService _profiles;
    private readonly ScreenTimeService _screenTime;
    private readonly UsageStore _usage;
    private readonly Mock<IUserManager> _userManager = new();

    public ControllerTests()
    {
        _userManager.Setup(manager => manager.GetUserById(It.IsAny<Guid>())).Returns<Guid>(id => _users.Users.GetValueOrDefault(id));
        _userManager.Setup(manager => manager.GetUserDto(It.IsAny<User>(), It.IsAny<string?>())).Returns<User, string?>((user, _) => _users.Dto(user));
        _userManager.Setup(manager => manager.UpdatePolicyAsync(It.IsAny<Guid>(), It.IsAny<UserPolicy>()))
            .Callback<Guid, UserPolicy>((id, policy) => _users.Policies[id] = UserDirectory.Copy(policy))
            .Returns(Task.CompletedTask);
        ContentExpander expander = new(Mock.Of<ILibraryManager>());
        _tagSync = new TagSyncService(Mock.Of<ILibraryManager>(), expander, new TagStateStore(_folder.File("tags.json"), NullLogger<TagStateStore>.Instance), _config.Source, NullLogger<TagSyncService>.Instance);
        _profiles = new ProfileService(_userManager.Object, expander, _tagSync, _config.Source, new PinAttemptLimiter(_time), NullLogger<ProfileService>.Instance);
        _usage = new UsageStore(_folder.File("usage.json"), NullLogger<UsageStore>.Instance);
        Mock<IServerConfigurationManager> server = new();
        server.SetupGet(manager => manager.Configuration).Returns(new ServerConfiguration());
        _screenTime = new ScreenTimeService(Mock.Of<ISessionManager>(), Mock.Of<ILibraryManager>(), _usage, _config.Source, server.Object, _time, NullLogger<ScreenTimeService>.Instance);
    }

    public void Dispose()
    {
        _profiles.Dispose();
        _tagSync.Dispose();
        _screenTime.Dispose();
        _folder.Dispose();
    }

    private ParentalControlController Controller(User? signedIn)
    {
        ParentalControlController controller = new(_profiles, _screenTime, _tagSync, new WebInjectionService(NullLogger<WebInjectionService>.Instance), _userManager.Object, Mock.Of<ILibraryManager>(), _time, NullLogger<ParentalControlController>.Instance);
        List<Claim> claims = signedIn is null ? new() : new() { new Claim("Jellyfin-UserId", signedIn.Id.ToString()) };
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test")) } };
        return controller;
    }

    private async Task<User> Protected(string name, Action<ControlledProfile>? configure = null, NativeSettings? native = null)
    {
        User user = _users.Add(name);
        ControlledProfile profile = new() { ScreenTime = new ScreenTimeSettings() };
        configure?.Invoke(profile);
        await _profiles.SaveProfileAsync(user.Id, profile, native);
        return user;
    }

    [Fact]
    public async Task The_sign_in_page_only_learns_about_visible_enabled_pin_users()
    {
        User tim = await Protected("Tim", profile => profile.PinSignIn = true);
        User hidden = await Protected("Hidden", profile => profile.PinSignIn = true);
        _users.Policies[hidden.Id].IsHidden = true;
        await Protected("NoPin");
        User paused = await Protected("Paused", profile =>
        {
            profile.PinSignIn = true;
            profile.Enabled = false;
        });
        await _profiles.SetUserPinAsync(tim.Id, "123456");

        SignInInfo info = Controller(null).GetSignIn().Value!;

        PinUser single = Assert.Single(info.PinUsers);
        Assert.Equal(tim.Id.ToString("N"), single.Id);
        Assert.Equal(6, single.Length);
        Assert.True(single.AllowedNow);
        Assert.DoesNotContain(info.PinUsers, user => user.Id == paused.Id.ToString("N"));
    }

    [Fact]
    public async Task The_sign_in_page_learns_that_a_child_is_outside_their_hours_without_the_hours()
    {
        await Protected("Tim", profile => profile.PinSignIn = true, new NativeSettings { EnableAllFolders = true, ShowOnSignInScreen = true, AccessSchedules = [new ScheduleWindow { DayOfWeek = "Everyday", StartHour = 7, EndHour = 8 }] });

        Assert.False(Controller(null).GetSignIn().Value!.PinUsers.Single().AllowedNow);
    }

    [Fact]
    public async Task Me_tells_an_uncontrolled_user_nothing_and_a_child_their_settings()
    {
        User parent = _users.Add("Parent");
        User tim = await Protected("Tim", profile =>
        {
            profile.HiddenElements = ["search"];
            profile.LockSession = true;
            profile.ScreenTime = new ScreenTimeSettings { Enabled = true, DailyLimitMinutes = [30, 30, 30, 30, 30, 30, 30] };
        });

        ClientContext free = Controller(parent).GetMe().Value!;
        ClientContext child = Controller(tim).GetMe().Value!;

        Assert.False(free.Controlled);
        Assert.Empty(free.HiddenElements);
        Assert.True(child.Controlled);
        Assert.Equal(["search"], child.HiddenElements);
        Assert.True(child.LockSession);
        Assert.Equal(1800, child.ScreenTime.RemainingSeconds);
        Assert.True(child.AllowedNow);
    }

    [Fact]
    public async Task Me_gives_the_next_allowed_time_outside_the_hours()
    {
        User tim = await Protected("Tim", null, new NativeSettings { EnableAllFolders = true, AccessSchedules = [new ScheduleWindow { DayOfWeek = "Everyday", StartHour = 16.5, EndHour = 20 }] });

        ClientContext context = Controller(tim).GetMe().Value!;

        Assert.False(context.AllowedNow);
        Assert.StartsWith("2026-10-20T16:30:00", context.NextAllowed, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Extra_time_from_a_device_needs_the_parent_pin()
    {
        User tim = await Protected("Tim", profile => profile.ScreenTime = new ScreenTimeSettings { Enabled = true, DailyLimitMinutes = [0, 0, 0, 0, 0, 0, 0] });

        Assert.IsType<ConflictObjectResult>(Controller(tim).Extend(new ExtendRequest { Pin = "4321", Minutes = 15 }).Result);

        _profiles.SetParentPin("4321");
        Assert.False(Controller(tim).Extend(new ExtendRequest { Pin = "0000", Minutes = 15 }).Value!.Valid);
        Assert.IsType<BadRequestObjectResult>(Controller(tim).Extend(new ExtendRequest { Pin = "4321", Minutes = 500 }).Result);
        Assert.True(Controller(tim).Extend(new ExtendRequest { Pin = "4321", Minutes = 15 }).Value!.Valid);

        Assert.Equal(15 * 60, Controller(tim).GetMe().Value!.ScreenTime.RemainingSeconds);
    }

    [Fact]
    public async Task An_invalid_profile_or_an_administrator_is_refused()
    {
        User tim = _users.Add("Tim");
        User admin = _users.Add("Admin", administrator: true);
        ParentalControlController controller = Controller(admin);

        ActionResult<ProfileView> invalid = await controller.SaveProfile(tim.Id, new ProfileUpdate { Profile = new ControlledProfile { ScreenTime = new ScreenTimeSettings { DailyLimitMinutes = [1] } } });
        ActionResult<ProfileView> administrator = await controller.SaveProfile(admin.Id, new ProfileUpdate { Profile = new ControlledProfile() });
        ActionResult<ProfileView> unknown = await controller.SaveProfile(Guid.NewGuid(), new ProfileUpdate { Profile = new ControlledProfile() });

        Assert.IsType<BadRequestObjectResult>(invalid.Result);
        Assert.IsType<BadRequestObjectResult>(administrator.Result);
        Assert.IsType<NotFoundResult>(unknown.Result);
        Assert.Empty(_config.Configuration.Profiles);
    }

    [Fact]
    public async Task Pins_are_validated_before_anything_is_changed()
    {
        User tim = await Protected("Tim");
        ParentalControlController controller = Controller(null);

        Assert.IsType<BadRequestObjectResult>(controller.SetParentPin(new PinRequest { Pin = "12" }));
        Assert.IsType<BadRequestObjectResult>(await controller.SetUserPin(tim.Id, new PinRequest { Pin = "abcd" }));
        Assert.False(_profiles.HasParentPin);
    }

    [Fact]
    public void Options_accept_known_languages_only()
    {
        ParentalControlController controller = Controller(null);

        Assert.IsType<BadRequestObjectResult>(controller.SaveOptions(new PluginOptions { MessageLanguage = "klingon" }).Result);
        Assert.Equal("fr", controller.SaveOptions(new PluginOptions { MessageLanguage = "FR", DeveloperMode = true }).Value!.MessageLanguage);
        Assert.True(_config.Configuration.DeveloperMode);
    }

    [Fact]
    public async Task A_disk_that_refuses_the_write_answers_503()
    {
        User tim = _users.Add("Tim");
        _config.FailSaves = true;

        ActionResult<ProfileView> result = await Controller(null).SaveProfile(tim.Id, new ProfileUpdate { Profile = new ControlledProfile() });

        Assert.Equal(StatusCodes.Status503ServiceUnavailable, Assert.IsType<ObjectResult>(result.Result).StatusCode);
    }

    [Fact]
    public async Task The_family_lists_children_first_then_administrators()
    {
        _users.Add("Zed", administrator: true);
        await Protected("Tim");
        _users.Add("Anna");

        List<FamilyMember> family = Assert.IsAssignableFrom<IEnumerable<FamilyMember>>(Assert.IsType<OkObjectResult>(FamilyResult()).Value).ToList();

        Assert.Equal(["Anna", "Tim", "Zed"], family.Select(member => member.Name));
        Assert.True(family[1].HasProfile);
        Assert.True(family[2].IsAdministrator);
    }

    private ActionResult FamilyResult()
    {
#if JELLYFIN_12
        _userManager.Setup(manager => manager.GetUsers()).Returns(() => _users.Users.Values);
#else
        _userManager.SetupGet(manager => manager.Users).Returns(() => _users.Users.Values);
#endif
        return Controller(null).GetFamily().Result!;
    }
}
