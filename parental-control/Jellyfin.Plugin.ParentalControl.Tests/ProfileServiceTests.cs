using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.ParentalControl.Configuration;
using Jellyfin.Plugin.ParentalControl.Models;
using Jellyfin.Plugin.ParentalControl.Services;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Users;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Jellyfin.Plugin.ParentalControl.Tests;

public sealed class ProfileServiceTests : IDisposable
{
    private readonly TempFolder _folder = new();
    private readonly UserDirectory _users = new();
    private readonly Mock<IUserManager> _userManager = new();
    private readonly MemoryConfiguration _config = new();
    private readonly TagSyncService _tagSync;
    private readonly ProfileService _service;
    private readonly ManualTimeProvider _time = new(DateTimeOffset.UnixEpoch);
    private readonly List<string> _passwords = new();

    public ProfileServiceTests()
    {
        _userManager.Setup(manager => manager.GetUserById(It.IsAny<Guid>())).Returns<Guid>(id => _users.Users.GetValueOrDefault(id));
        _userManager.Setup(manager => manager.GetUserDto(It.IsAny<User>(), It.IsAny<string?>())).Returns<User, string?>((user, _) => _users.Dto(user));
        _userManager.Setup(manager => manager.UpdatePolicyAsync(It.IsAny<Guid>(), It.IsAny<UserPolicy>()))
            .Callback<Guid, UserPolicy>((id, policy) => _users.Policies[id] = UserDirectory.Copy(policy))
            .Returns(Task.CompletedTask);
#if JELLYFIN_12
        _userManager.Setup(manager => manager.ChangePassword(It.IsAny<Guid>(), It.IsAny<string>()))
            .Callback<Guid, string>((_, password) => _passwords.Add(password))
            .Returns(Task.CompletedTask);
#else
        _userManager.Setup(manager => manager.ChangePassword(It.IsAny<User>(), It.IsAny<string>()))
            .Callback<User, string>((_, password) => _passwords.Add(password))
            .Returns(Task.CompletedTask);
#endif
        ContentExpander expander = new(Mock.Of<ILibraryManager>());
        _tagSync = new TagSyncService(Mock.Of<ILibraryManager>(), expander, new TagStateStore(_folder.File("tags.json"), NullLogger<TagStateStore>.Instance), _config.Source, NullLogger<TagSyncService>.Instance);
        _service = new ProfileService(_userManager.Object, expander, _tagSync, _config.Source, new PinAttemptLimiter(_time), NullLogger<ProfileService>.Instance);
    }

    public void Dispose()
    {
        _service.Dispose();
        _tagSync.Dispose();
        _folder.Dispose();
    }

    private static ControlledProfile Settings(ContentMode mode = ContentMode.BlockList, params ContentRule[] hidden) => new()
    {
        Mode = mode,
        Hidden = hidden.ToList(),
        ScreenTime = new ScreenTimeSettings()
    };

    private UserPolicy PolicyOf(User user) => _users.Policies[user.Id];

    [Fact]
    public async Task A_new_profile_gets_a_key_and_writes_its_tags_beside_the_existing_ones()
    {
        User tim = _users.Add("Tim");
        PolicyOf(tim).BlockedTags = ["Horror"];

        ControlledProfile saved = await _service.SaveProfileAsync(tim.Id, Settings(ContentMode.AllowList, new ContentRule { Kind = RuleKind.Tag, Value = "violent" }), native: null);

        Assert.Equal("tim", saved.TagKey);
        Assert.Equal(["Horror", "pc-hidden-tim", "violent"], PolicyOf(tim).BlockedTags);
        Assert.Equal(["pc-allowed-tim"], PolicyOf(tim).AllowedTags);
        Assert.Equal(["pc-hidden-tim", "violent"], saved.AppliedBlockedTags);
        Assert.Single(_config.Configuration.Profiles);
        Assert.Equal(1, _config.Saves);
    }

    [Fact]
    public async Task Saving_again_replaces_only_what_the_plugin_wrote()
    {
        User tim = _users.Add("Tim");
        await _service.SaveProfileAsync(tim.Id, Settings(ContentMode.AllowList, new ContentRule { Kind = RuleKind.Tag, Value = "violent" }), null);
        PolicyOf(tim).BlockedTags = PolicyOf(tim).BlockedTags.Append("added-on-the-user-page").ToArray();
        PolicyOf(tim).AllowedTags = PolicyOf(tim).AllowedTags.Append("Kids").ToArray();

        ControlledProfile saved = await _service.SaveProfileAsync(tim.Id, Settings(ContentMode.BlockList), null);

        Assert.Equal("tim", saved.TagKey);
        Assert.Equal(["added-on-the-user-page", "pc-hidden-tim"], PolicyOf(tim).BlockedTags);
        Assert.Equal(["Kids"], PolicyOf(tim).AllowedTags);
    }

    [Fact]
    public async Task Native_settings_are_written_only_when_sent()
    {
        User tim = _users.Add("Tim", hidden: true);
        await _service.SaveProfileAsync(tim.Id, Settings(), new NativeSettings { MaxParentalRating = 7, EnableAllFolders = true, ShowOnSignInScreen = true });
        Assert.Equal(7, PolicyOf(tim).MaxParentalRating);
        Assert.False(PolicyOf(tim).IsHidden);

        await _service.SaveProfileAsync(tim.Id, Settings(), native: null);

        Assert.Equal(7, PolicyOf(tim).MaxParentalRating);
    }

    [Fact]
    public async Task Administrators_and_unknown_users_cannot_be_controlled()
    {
        User admin = _users.Add("Admin", administrator: true);

        await Assert.ThrowsAsync<InvalidOperationException>(() => _service.SaveProfileAsync(admin.Id, Settings(), null));
        await Assert.ThrowsAsync<KeyNotFoundException>(() => _service.SaveProfileAsync(Guid.NewGuid(), Settings(), null));
        Assert.Empty(_config.Configuration.Profiles);
    }

    [Fact]
    public async Task Two_children_with_the_same_name_get_different_keys()
    {
        User first = _users.Add("Tim");
        User second = _users.Add("tim");

        await _service.SaveProfileAsync(first.Id, Settings(), null);
        ControlledProfile other = await _service.SaveProfileAsync(second.Id, Settings(), null);

        Assert.Equal("tim-2", other.TagKey);
    }

    [Fact]
    public async Task Pausing_removes_everything_the_plugin_added()
    {
        User tim = _users.Add("Tim");
        PolicyOf(tim).BlockedTags = ["Horror"];
        await _service.SaveProfileAsync(tim.Id, Settings(ContentMode.AllowList), null);
        ControlledProfile paused = Settings(ContentMode.AllowList);
        paused.Enabled = false;

        await _service.SaveProfileAsync(tim.Id, paused, null);

        Assert.Equal(["Horror"], PolicyOf(tim).BlockedTags);
        Assert.Empty(PolicyOf(tim).AllowedTags);
        Assert.Single(_config.Configuration.Profiles);
    }

    [Fact]
    public async Task Deleting_a_profile_cleans_the_policy_and_keeps_the_native_settings()
    {
        User tim = _users.Add("Tim");
        await _service.SaveProfileAsync(tim.Id, Settings(ContentMode.AllowList), new NativeSettings { MaxParentalRating = 7, EnableAllFolders = true });

        Assert.True(await _service.DeleteProfileAsync(tim.Id));

        Assert.Empty(PolicyOf(tim).BlockedTags);
        Assert.Empty(PolicyOf(tim).AllowedTags);
        Assert.Equal(7, PolicyOf(tim).MaxParentalRating);
        Assert.Empty(_config.Configuration.Profiles);
        Assert.False(await _service.DeleteProfileAsync(tim.Id));
    }

    [Fact]
    public async Task Renaming_a_label_renames_it_in_the_policies_that_use_it()
    {
        User tim = _users.Add("Tim");
        ContentLabel label = await _service.SaveLabelAsync(null, new ContentLabel { Name = "Scary", Color = "#ff0000" });
        await _service.SaveProfileAsync(tim.Id, Settings(ContentMode.BlockList, new ContentRule { Kind = RuleKind.Label, Value = label.Id }), null);
        Assert.Contains("Scary", PolicyOf(tim).BlockedTags);

        await _service.SaveLabelAsync(label.Id, new ContentLabel { Name = "Too scary", Color = "#ff0000" });

        Assert.DoesNotContain("Scary", PolicyOf(tim).BlockedTags);
        Assert.Contains("Too scary", PolicyOf(tim).BlockedTags);
        Assert.Equal("Too scary", _config.Configuration.Profiles[0].Hidden[0].Name);
    }

    [Fact]
    public async Task Deleting_a_label_takes_it_out_of_the_profiles_and_the_policies()
    {
        User tim = _users.Add("Tim");
        ContentLabel label = await _service.SaveLabelAsync(null, new ContentLabel { Name = "Scary" });
        await _service.SaveProfileAsync(tim.Id, Settings(ContentMode.BlockList, new ContentRule { Kind = RuleKind.Label, Value = label.Id }), null);

        Assert.True(await _service.DeleteLabelAsync(label.Id));

        Assert.Empty(_config.Configuration.Labels);
        Assert.Empty(_config.Configuration.Profiles[0].Hidden);
        Assert.Equal(["pc-hidden-tim"], PolicyOf(tim).BlockedTags);
    }

    [Fact]
    public async Task A_configuration_that_cannot_be_written_leaves_the_profiles_as_they_were()
    {
        User tim = _users.Add("Tim");
        await _service.SaveProfileAsync(tim.Id, Settings(), null);
        List<ControlledProfile> before = _config.Configuration.Profiles;
        _config.FailSaves = true;

        await Assert.ThrowsAsync<IOException>(() => _service.SaveProfileAsync(tim.Id, Settings(ContentMode.AllowList), null));

        Assert.Same(before, _config.Configuration.Profiles);
    }

    [Fact]
    public void The_parent_pin_is_hashed_checked_and_rate_limited_per_account()
    {
        Guid kid = Guid.NewGuid();
        _service.SetParentPin("4321");

        Assert.DoesNotContain("4321", _config.Configuration.ParentPinHash, StringComparison.Ordinal);
        Assert.True(_service.CheckParentPin(kid, "4321").Valid);
        for (int i = 0; i < PinAttemptLimiter.MaxFailures; i++)
        {
            Assert.False(_service.CheckParentPin(kid, "0000").Valid);
        }

        // Locked: even the right PIN waits.
        PinCheckResult locked = _service.CheckParentPin(kid, "4321");
        Assert.False(locked.Valid);
        Assert.True(locked.RetryAfterSeconds > 0);
        Assert.True(_service.CheckParentPin(Guid.NewGuid(), "4321").Valid);

        _service.ClearParentPin();
        Assert.False(_service.HasParentPin);
    }

    [Fact]
    public async Task A_sign_in_pin_becomes_the_password_and_its_length_is_remembered()
    {
        User tim = _users.Add("Tim");
        await _service.SaveProfileAsync(tim.Id, Settings(), null);

        await _service.SetUserPinAsync(tim.Id, "1234");

        Assert.Equal(["1234"], _passwords);
        Assert.Equal(4, _config.Configuration.Profiles[0].PinLength);

        // Saving the profile again does not forget it.
        await _service.SaveProfileAsync(tim.Id, Settings(), null);
        Assert.Equal(4, _config.Configuration.Profiles[0].PinLength);
    }

    [Fact]
    public async Task A_deleted_user_is_forgotten_without_touching_any_policy()
    {
        User tim = _users.Add("Tim");
        await _service.SaveProfileAsync(tim.Id, Settings(), null);
        _users.Users.Remove(tim.Id);

        await _service.ForgetUserAsync(tim.Id);

        Assert.Empty(_config.Configuration.Profiles);
    }
}
