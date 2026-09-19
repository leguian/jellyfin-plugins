using System;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.CustomizedHome.Helpers;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.CustomizedHome.Services;

/// <summary>
/// Registers the index.html transformation with the File Transformation plugin so the client script
/// gets injected into the web client. The registration is retried for a while after startup because
/// plugins may finish initializing in any order.
/// </summary>
public sealed partial class WebInjectionService : IHostedService, IDisposable
{
    /// <summary>
    /// Stable identifier of the transformation registered with File Transformation.
    /// </summary>
    public const string TransformationId = "4f0a2c8e-6d3b-4a7e-9f21-0b7c5d3e8a19";

    /// <summary>
    /// Pattern matched by File Transformation against the served path. File Transformation runs a single
    /// pipeline per request (the first registered pattern that matches), so this must be the exact string
    /// used by the other plugins (Home Screen Sections, Plugin Pages, ...) to share their pipeline.
    /// The pattern also matches chunks such as "session-login-index-html.xxx.chunk.js": the callback
    /// leaves any document without a body tag untouched.
    /// </summary>
    public const string IndexHtmlPattern = "index.html";

    private const string FileTransformationAssemblyName = "Jellyfin.Plugin.FileTransformation";
    private const string FileTransformationInterface = "Jellyfin.Plugin.FileTransformation.PluginInterface";
    private const string RegisterMethodName = "RegisterTransformation";

    private const int FastAttempts = 5;
    private static readonly TimeSpan FastRetryDelay = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan SlowRetryDelay = TimeSpan.FromSeconds(10);

    private readonly ILogger<WebInjectionService> _logger;
    private readonly Func<Assembly?> _findFileTransformation;
    private readonly Func<int, TimeSpan> _retryDelay;
    private readonly object _lock = new();
    private CancellationTokenSource? _cts;
    private string? _lastLoggedFailure;

    /// <summary>
    /// Initializes a new instance of the <see cref="WebInjectionService"/> class.
    /// </summary>
    /// <param name="logger">The logger.</param>
    public WebInjectionService(ILogger<WebInjectionService> logger)
        : this(logger, FindFileTransformation, attempt => attempt <= FastAttempts ? FastRetryDelay : SlowRetryDelay)
    {
    }

    /// <summary>
    /// Initializes a new instance of the <see cref="WebInjectionService"/> class with its own assembly lookup and pace.
    /// Test seam: File Transformation cannot be loaded in a unit test and the real retry delays last minutes. Being
    /// internal, this constructor is invisible to the dependency injection container.
    /// </summary>
    /// <param name="logger">The logger.</param>
    /// <param name="findFileTransformation">Finds the loaded File Transformation assembly, <c>null</c> when there is none.</param>
    /// <param name="retryDelay">Gives the delay to wait after a failed attempt (1 based).</param>
    internal WebInjectionService(ILogger<WebInjectionService> logger, Func<Assembly?> findFileTransformation, Func<int, TimeSpan> retryDelay)
    {
        _logger = logger;
        _findFileTransformation = findFileTransformation;
        _retryDelay = retryDelay;
    }

    /// <summary>
    /// Gets the current state of the File Transformation registration.
    /// </summary>
    public InjectionStatus Status { get; } = new();

    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
        _cts = new CancellationTokenSource();
        CancellationToken token = _cts.Token;
        _ = Task.Run(() => RegisterWithRetryAsync(token), token);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken)
    {
        _cts?.Cancel();
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public void Dispose()
    {
        _cts?.Dispose();
    }

    /// <summary>
    /// Tries to register the transformation once and updates <see cref="Status"/>.
    /// </summary>
    /// <returns>The registration outcome.</returns>
    public RegistrationOutcome TryRegister()
    {
        lock (_lock)
        {
            Status.LastAttemptUtc = DateTime.UtcNow;
            Status.Error = null;

            try
            {
                return Register();
            }
            catch (TargetInvocationException ex) when (ex.InnerException is not null)
            {
                // File Transformation itself refused or failed: its own message is the useful one.
                return Fail(ex.InnerException.Message, ex.InnerException);
            }
#pragma warning disable CA1031 // Boundary with third-party code reached through reflection: whatever it throws is a failed attempt.
            catch (Exception ex)
#pragma warning restore CA1031
            {
                // An exception leaving this method would end the startup loop for good and turn the status
                // and retry endpoints into errors: the administrator would never learn why nothing is injected.
                return Fail(ex.GetType().Name + ": " + ex.Message, ex);
            }
        }
    }

    private RegistrationOutcome Register()
    {
        Assembly? assembly = _findFileTransformation();
        if (assembly is null)
        {
            Status.FileTransformationDetected = false;
            Status.Registered = false;
            return RegistrationOutcome.NotInstalled;
        }

        Status.FileTransformationDetected = true;
        Status.FileTransformationVersion = assembly.GetName().Version?.ToString();

        // Picked among the overloads by hand: GetMethod(name) throws as soon as there are two of them.
        Type? pluginInterface = assembly.GetType(FileTransformationInterface, throwOnError: false);
        MethodInfo[] overloads = pluginInterface?.GetMethods(BindingFlags.Public | BindingFlags.Static)
            .Where(method => string.Equals(method.Name, RegisterMethodName, StringComparison.Ordinal))
            .ToArray() ?? [];
        if (overloads.Length == 0)
        {
            return Incompatible("File Transformation exposes no RegisterTransformation method (incompatible version).");
        }

        MethodInfo[] candidates = overloads
            .Where(method => !method.IsGenericMethodDefinition && method.GetParameters().Length == 1)
            .ToArray();
        if (candidates.Length == 0)
        {
            return Incompatible("Unexpected RegisterTransformation signature (incompatible version).");
        }

        string json = BuildPayloadJson();
        foreach (MethodInfo register in candidates)
        {
            object? payload = BuildPayload(register.GetParameters()[0].ParameterType, json);
            if (payload is null)
            {
                continue;
            }

            register.Invoke(null, [payload]);
            Status.Registered = true;
            Status.RegisteredUtc = DateTime.UtcNow;
            _lastLoggedFailure = null;
            LogRegistered(Status.FileTransformationVersion);
            return RegistrationOutcome.Registered;
        }

        return Incompatible("Could not build the payload expected by File Transformation (incompatible version).");
    }

    private RegistrationOutcome Incompatible(string error)
    {
        Status.Error = error;
        Status.Registered = false;
        return RegistrationOutcome.Incompatible;
    }

    private RegistrationOutcome Fail(string error, Exception exception)
    {
        Status.Error = error;
        Status.Registered = false;

        // The startup loop tries thirty times: the same failure is logged once with its stack trace.
        if (!string.Equals(_lastLoggedFailure, error, StringComparison.Ordinal))
        {
            _lastLoggedFailure = error;
            LogAttemptThrew(error, exception);
        }

        return RegistrationOutcome.Failed;
    }

    private static Assembly? FindFileTransformation()
    {
        return AssemblyLoadContext.All
            .SelectMany(context => context.Assemblies)
            .FirstOrDefault(candidate => string.Equals(candidate.GetName().Name, FileTransformationAssemblyName, StringComparison.Ordinal));
    }

    private static string BuildPayloadJson()
    {
        return JsonSerializer.Serialize(new
        {
            id = TransformationId,
            fileNamePattern = IndexHtmlPattern,
            callbackAssembly = typeof(WebInjectionService).Assembly.FullName,
            callbackClass = typeof(TransformationPatches).FullName,
            callbackMethod = nameof(TransformationPatches.IndexHtml)
        });
    }

    /// <summary>
    /// Builds the payload in the type expected by File Transformation. The plugin is loaded in a different
    /// assembly load context, so its JObject type is used through reflection instead of a direct reference.
    /// </summary>
    private static object? BuildPayload(Type parameterType, string json)
    {
        if (parameterType == typeof(string))
        {
            return json;
        }

        MethodInfo? parse = parameterType.GetMethod("Parse", BindingFlags.Public | BindingFlags.Static, [typeof(string)]);
        return parse?.Invoke(null, [json]);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Customized Home: index.html transformation registered with File Transformation {Version}")]
    private partial void LogRegistered(string? version);

    [LoggerMessage(Level = LogLevel.Error, Message = "Customized Home: File Transformation is installed but incompatible: {Error}")]
    private partial void LogIncompatible(string? error);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Customized Home: the File Transformation plugin was not found. Install it (https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) so the client script can be injected into the web client.")]
    private partial void LogNotInstalled();

    [LoggerMessage(Level = LogLevel.Warning, Message = "Customized Home: registering with File Transformation failed, the attempt may be repeated: {Error}")]
    private partial void LogAttemptThrew(string error, Exception exception);

    [LoggerMessage(Level = LogLevel.Debug, Message = "Customized Home: registration attempt {Attempt} failed: {Error}")]
    private partial void LogAttemptFailed(int attempt, string? error);

    [LoggerMessage(Level = LogLevel.Error, Message = "Customized Home: could not register with File Transformation: {Error}")]
    private partial void LogRegistrationFailed(string? error);

    private async Task RegisterWithRetryAsync(CancellationToken token)
    {
        const int MaxAttempts = 30;
        for (int attempt = 1; attempt <= MaxAttempts && !token.IsCancellationRequested; attempt++)
        {
            RegistrationOutcome outcome = TryRegister();
            switch (outcome)
            {
                case RegistrationOutcome.Registered:
                    return;
                case RegistrationOutcome.Incompatible:
                    LogIncompatible(Status.Error);
                    return;
                case RegistrationOutcome.NotInstalled:
                    if (attempt == FastAttempts)
                    {
                        LogNotInstalled();
                    }

                    break;
                case RegistrationOutcome.Failed:
                    LogAttemptFailed(attempt, Status.Error);
                    break;
            }

            try
            {
                await Task.Delay(_retryDelay(attempt), token).ConfigureAwait(false);
            }
            catch (TaskCanceledException)
            {
                return;
            }
        }

        if (Status.FileTransformationDetected && !Status.Registered)
        {
            LogRegistrationFailed(Status.Error);
        }
    }
}

/// <summary>
/// Outcome of a registration attempt.
/// </summary>
public enum RegistrationOutcome
{
    /// <summary>
    /// The transformation is registered.
    /// </summary>
    Registered,

    /// <summary>
    /// File Transformation is not installed (or not loaded yet).
    /// </summary>
    NotInstalled,

    /// <summary>
    /// File Transformation is installed but its API is not the expected one.
    /// </summary>
    Incompatible,

    /// <summary>
    /// The call failed; it may succeed later.
    /// </summary>
    Failed
}

/// <summary>
/// State of the File Transformation registration, exposed to administrators.
/// </summary>
public class InjectionStatus
{
    /// <summary>
    /// Gets or sets a value indicating whether the File Transformation plugin assembly is loaded.
    /// </summary>
    public bool FileTransformationDetected { get; set; }

    /// <summary>
    /// Gets or sets the detected File Transformation version.
    /// </summary>
    public string? FileTransformationVersion { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the transformation is registered.
    /// </summary>
    public bool Registered { get; set; }

    /// <summary>
    /// Gets or sets the time of the successful registration.
    /// </summary>
    public DateTime? RegisteredUtc { get; set; }

    /// <summary>
    /// Gets or sets the time of the last attempt.
    /// </summary>
    public DateTime? LastAttemptUtc { get; set; }

    /// <summary>
    /// Gets or sets the last error message.
    /// </summary>
    public string? Error { get; set; }
}
