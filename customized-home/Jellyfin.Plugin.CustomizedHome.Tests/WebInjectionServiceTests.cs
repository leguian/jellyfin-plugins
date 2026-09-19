using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.CustomizedHome.Helpers;
using Jellyfin.Plugin.CustomizedHome.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Jellyfin.Plugin.CustomizedHome.Tests;

/// <summary>
/// Registration with File Transformation goes through reflection on an assembly this plugin does not reference.
/// The fakes below only prove how each shape of that assembly is handled: they cannot tell that the real
/// File Transformation changed its API, only a real server can.
/// </summary>
public sealed class WebInjectionServiceTests
{
    private const string InterfaceName = "Jellyfin.Plugin.FileTransformation.PluginInterface";
    private static readonly TimeSpan Patience = TimeSpan.FromSeconds(10);

    // The tests of a class run one after the other: what the fakes record is reset for each of them.
    private static readonly List<object?> Received = new();

    public WebInjectionServiceTests()
    {
        Received.Clear();
    }

    private static WebInjectionService CreateService(Func<Assembly?> findFileTransformation)
    {
        return new WebInjectionService(NullLogger<WebInjectionService>.Instance, findFileTransformation, _ => TimeSpan.FromMilliseconds(1));
    }

    private static WebInjectionService CreateService(Type? pluginInterface)
    {
        FakeAssembly assembly = new(pluginInterface);
        return CreateService(() => assembly);
    }

    private static void AssertPayload(string json)
    {
        using JsonDocument payload = JsonDocument.Parse(json);
        JsonElement root = payload.RootElement;

        Assert.Equal(Guid.Parse(WebInjectionService.TransformationId), root.GetProperty("id").GetGuid());

        // The exact string the other plugins register: File Transformation runs a single pipeline per pattern.
        Assert.Equal("index.html", root.GetProperty("fileNamePattern").GetString());

        // What File Transformation does with the three callback fields.
        Assert.Equal(typeof(Plugin).Assembly.FullName, root.GetProperty("callbackAssembly").GetString());
        Type callbackClass = typeof(Plugin).Assembly.GetType(root.GetProperty("callbackClass").GetString()!, throwOnError: true)!;
        Assert.Equal(typeof(TransformationPatches), callbackClass);
        MethodInfo callback = callbackClass.GetMethod(root.GetProperty("callbackMethod").GetString()!)!;
        Assert.True(callback.IsStatic);
        Assert.Equal(typeof(string), callback.ReturnType);
    }

    private static async Task WaitUntil(Func<bool> condition)
    {
        Stopwatch watch = Stopwatch.StartNew();
        while (!condition())
        {
            Assert.True(watch.Elapsed < Patience, "The condition was not met in time.");
            await Task.Delay(5);
        }
    }

    [Fact]
    public void Without_File_Transformation_nothing_is_registered_and_no_error_is_reported()
    {
        WebInjectionService service = CreateService(() => null);

        Assert.Equal(RegistrationOutcome.NotInstalled, service.TryRegister());

        Assert.False(service.Status.FileTransformationDetected);
        Assert.False(service.Status.Registered);
        Assert.Null(service.Status.Error);
        Assert.NotNull(service.Status.LastAttemptUtc);
        Assert.Null(service.Status.RegisteredUtc);
    }

    [Fact]
    public void A_json_string_parameter_receives_the_payload()
    {
        WebInjectionService service = CreateService(typeof(StringInterface));

        Assert.Equal(RegistrationOutcome.Registered, service.TryRegister());

        AssertPayload(Assert.IsType<string>(Assert.Single(Received)));
        Assert.True(service.Status.FileTransformationDetected);
        Assert.True(service.Status.Registered);
        Assert.Equal("2.5.0.0", service.Status.FileTransformationVersion);
        Assert.NotNull(service.Status.RegisteredUtc);
        Assert.Null(service.Status.Error);
    }

    [Fact]
    public void A_parameter_type_with_a_static_Parse_receives_the_parsed_payload()
    {
        // The real signature: RegisterTransformation(JObject), a type from another assembly load context.
        WebInjectionService service = CreateService(typeof(ParsedInterface));

        Assert.Equal(RegistrationOutcome.Registered, service.TryRegister());

        AssertPayload(Assert.IsType<FakeJObject>(Assert.Single(Received)).Json);
        Assert.True(service.Status.Registered);
    }

    [Theory]
    [InlineData(null, "no RegisterTransformation method")]
    [InlineData(typeof(NoMethodInterface), "no RegisterTransformation method")]
    [InlineData(typeof(TwoParametersInterface), "Unexpected RegisterTransformation signature")]
    [InlineData(typeof(UnknownPayloadInterface), "Could not build the payload")]
    public void Another_api_than_the_expected_one_is_reported_as_incompatible(Type? pluginInterface, string expectedError)
    {
        WebInjectionService service = CreateService(pluginInterface);

        Assert.Equal(RegistrationOutcome.Incompatible, service.TryRegister());

        Assert.Empty(Received);
        Assert.True(service.Status.FileTransformationDetected);
        Assert.False(service.Status.Registered);
        Assert.Contains(expectedError, service.Status.Error, StringComparison.Ordinal);
    }

    [Fact]
    public void A_registration_that_throws_is_a_failure_carrying_the_reason_and_a_later_success_clears_it()
    {
        Type pluginInterface = typeof(ThrowingInterface);
        WebInjectionService service = CreateService(() => new FakeAssembly(pluginInterface));

        Assert.Equal(RegistrationOutcome.Failed, service.TryRegister());
        Assert.False(service.Status.Registered);
        Assert.Equal("The pipeline is not ready.", service.Status.Error);

        pluginInterface = typeof(StringInterface);
        Assert.Equal(RegistrationOutcome.Registered, service.TryRegister());
        Assert.True(service.Status.Registered);
        Assert.Null(service.Status.Error);
    }

    [Fact]
    public void Two_overloads_are_not_an_error_the_first_usable_one_is_called_once()
    {
        WebInjectionService service = CreateService(typeof(OverloadedInterface));

        Assert.Equal(RegistrationOutcome.Registered, service.TryRegister());

        Assert.Single(Received);
        Assert.Null(service.Status.Error);
    }

    [Fact]
    public void A_generic_method_cannot_be_called_and_is_reported_as_incompatible()
    {
        WebInjectionService service = CreateService(typeof(GenericInterface));

        Assert.Equal(RegistrationOutcome.Incompatible, service.TryRegister());
        Assert.Contains("Unexpected RegisterTransformation signature", service.Status.Error, StringComparison.Ordinal);
    }

    [Fact]
    public void An_unexpected_exception_is_a_failed_attempt_that_names_it_instead_of_an_error_for_the_caller()
    {
        // What the status and retry endpoints call: an exception here would be an HTTP 500 for the administrator.
        WebInjectionService brokenAssembly = CreateService(() => new UnloadableAssembly());
        Assert.Equal(RegistrationOutcome.Failed, brokenAssembly.TryRegister());
        Assert.Equal("FileLoadException: A dependency of File Transformation could not be loaded.", brokenAssembly.Status.Error);
        Assert.True(brokenAssembly.Status.FileTransformationDetected);
        Assert.False(brokenAssembly.Status.Registered);

        WebInjectionService brokenLookup = CreateService(() => throw new InvalidOperationException("Collection was modified."));
        Assert.Equal(RegistrationOutcome.Failed, brokenLookup.TryRegister());
        Assert.Equal("InvalidOperationException: Collection was modified.", brokenLookup.Status.Error);
    }

    [Fact]
    public async Task The_startup_loop_survives_an_unexpected_exception_and_registers_on_a_later_attempt()
    {
        int attempts = 0;
        using WebInjectionService service = CreateService(() => Interlocked.Increment(ref attempts) switch
        {
            1 => throw new InvalidOperationException("Collection was modified."),
            2 => new UnloadableAssembly(),
            _ => new FakeAssembly(typeof(StringInterface))
        });

        await service.StartAsync(CancellationToken.None);
        await WaitUntil(() => service.Status.Registered);
        await service.StopAsync(CancellationToken.None);

        Assert.Equal(3, attempts);
        Assert.Null(service.Status.Error);
        Assert.Single(Received);
    }

    [Fact]
    public void A_failure_that_repeats_is_logged_once_with_its_exception()
    {
        RecordingLogger logger = new();
        Type pluginInterface = typeof(ThrowingInterface);
        WebInjectionService service = new(logger, () => new FakeAssembly(pluginInterface), _ => TimeSpan.Zero);

        service.TryRegister();
        service.TryRegister();
        service.TryRegister();

        (LogLevel Level, Exception? Exception) entry = Assert.Single(logger.Entries, logged => logged.Level >= LogLevel.Warning);
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.IsType<InvalidOperationException>(entry.Exception);

        // Registered, then failing again: the administrator is told again.
        pluginInterface = typeof(StringInterface);
        service.TryRegister();
        pluginInterface = typeof(ThrowingInterface);
        service.TryRegister();

        Assert.Equal(2, logger.Entries.Count(logged => logged.Level >= LogLevel.Warning));
    }

    [Fact]
    public async Task The_startup_loop_waits_for_File_Transformation_to_load_then_stops()
    {
        int attempts = 0;
        using WebInjectionService service = CreateService(() => Interlocked.Increment(ref attempts) < 3 ? null : new FakeAssembly(typeof(StringInterface)));

        await service.StartAsync(CancellationToken.None);
        await WaitUntil(() => service.Status.Registered);
        await Task.Delay(100);
        await service.StopAsync(CancellationToken.None);

        Assert.Equal(3, attempts);
        Assert.Single(Received);
    }

    [Fact]
    public async Task The_startup_loop_gives_up_on_an_incompatible_api()
    {
        int attempts = 0;
        using WebInjectionService service = CreateService(() =>
        {
            Interlocked.Increment(ref attempts);
            return new FakeAssembly(typeof(NoMethodInterface));
        });

        await service.StartAsync(CancellationToken.None);
        await WaitUntil(() => service.Status.Error is not null);
        await Task.Delay(100);
        await service.StopAsync(CancellationToken.None);

        Assert.Equal(1, attempts);
    }

    [Fact]
    public async Task Stopping_the_service_ends_the_startup_loop()
    {
        int attempts = 0;
        using WebInjectionService service = new(
            NullLogger<WebInjectionService>.Instance,
            () =>
            {
                Interlocked.Increment(ref attempts);
                return null;
            },
            _ => TimeSpan.FromMinutes(5));

        await service.StartAsync(CancellationToken.None);
        await WaitUntil(() => Volatile.Read(ref attempts) == 1);
        await service.StopAsync(CancellationToken.None);
        await Task.Delay(100);

        Assert.Equal(1, attempts);
    }

    /// <summary>
    /// Stands for the File Transformation assembly: only what the service asks an assembly is answered.
    /// </summary>
    private sealed class FakeAssembly : Assembly
    {
        private readonly Type? _pluginInterface;

        public FakeAssembly(Type? pluginInterface)
        {
            _pluginInterface = pluginInterface;
        }

        public override AssemblyName GetName()
        {
            return new AssemblyName("Jellyfin.Plugin.FileTransformation") { Version = new Version(2, 5, 0, 0) };
        }

        public override Type? GetType(string name, bool throwOnError)
        {
            return string.Equals(name, InterfaceName, StringComparison.Ordinal) ? _pluginInterface : null;
        }
    }

    /// <summary>
    /// An assembly whose types cannot be loaded, as when a dependency of File Transformation is missing.
    /// </summary>
    private sealed class UnloadableAssembly : Assembly
    {
        public override AssemblyName GetName()
        {
            return new AssemblyName("Jellyfin.Plugin.FileTransformation") { Version = new Version(2, 5, 0, 0) };
        }

        public override Type? GetType(string name, bool throwOnError)
        {
            throw new FileLoadException("A dependency of File Transformation could not be loaded.");
        }
    }

    private sealed class RecordingLogger : ILogger<WebInjectionService>
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

    public sealed class FakeJObject
    {
        private FakeJObject(string json)
        {
            Json = json;
        }

        public string Json { get; }

        public static FakeJObject Parse(string json)
        {
            return new FakeJObject(json);
        }
    }

    public sealed class PayloadWithoutParse
    {
    }

    public static class StringInterface
    {
        public static void RegisterTransformation(string payload)
        {
            Received.Add(payload);
        }
    }

    public static class ParsedInterface
    {
        public static void RegisterTransformation(FakeJObject payload)
        {
            Received.Add(payload);
        }
    }

    public static class NoMethodInterface
    {
        public static void RemoveTransformation(Guid id)
        {
            Received.Add(id);
        }
    }

    public static class TwoParametersInterface
    {
        public static void RegisterTransformation(string payload, string options)
        {
            Received.Add(payload + options);
        }
    }

    public static class UnknownPayloadInterface
    {
        public static void RegisterTransformation(PayloadWithoutParse payload)
        {
            Received.Add(payload);
        }
    }

    public static class OverloadedInterface
    {
        public static void RegisterTransformation(FakeJObject payload)
        {
            Received.Add(payload);
        }

        public static void RegisterTransformation(string payload)
        {
            Received.Add(payload);
        }

        public static void RegisterTransformation(string payload, string options)
        {
            Received.Add(payload + options);
        }
    }

    public static class GenericInterface
    {
        public static void RegisterTransformation<TPayload>(TPayload payload)
        {
            Received.Add(payload);
        }
    }

    public static class ThrowingInterface
    {
        public static void RegisterTransformation(string payload)
        {
            throw new InvalidOperationException("The pipeline is not ready.");
        }
    }
}
