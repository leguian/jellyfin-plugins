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

    private const int FastAttempts = 5;
    private static readonly TimeSpan FastRetryDelay = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan SlowRetryDelay = TimeSpan.FromSeconds(10);

    private readonly ILogger<WebInjectionService> _logger;
    private readonly Func<Assembly?> _findFileTransformation;
    private readonly Func<int, TimeSpan> _retryDelay;
    private readonly object _lock = new();
    private CancellationTokenSource? _cts;

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

            Assembly? assembly = _findFileTransformation();
            if (assembly is null)
            {
                Status.FileTransformationDetected = false;
                Status.Registered = false;
                return RegistrationOutcome.NotInstalled;
            }

            Status.FileTransformationDetected = true;
            Status.FileTransformationVersion = assembly.GetName().Version?.ToString();

            try
            {
                Type? pluginInterface = assembly.GetType(FileTransformationInterface, throwOnError: false);
                MethodInfo? register = pluginInterface?.GetMethod("RegisterTransformation", BindingFlags.Public | BindingFlags.Static);
                if (register is null)
                {
                    Status.Error = "File Transformation exposes no RegisterTransformation method (incompatible version).";
                    Status.Registered = false;
                    return RegistrationOutcome.Incompatible;
                }

                ParameterInfo[] parameters = register.GetParameters();
                if (parameters.Length != 1)
                {
                    Status.Error = "Unexpected RegisterTransformation signature (incompatible version).";
                    Status.Registered = false;
                    return RegistrationOutcome.Incompatible;
                }

                string json = BuildPayloadJson();
                object? payload = BuildPayload(parameters[0].ParameterType, json);
                if (payload is null)
                {
                    Status.Error = "Could not build the payload expected by File Transformation (incompatible version).";
                    Status.Registered = false;
                    return RegistrationOutcome.Incompatible;
                }

                register.Invoke(null, [payload]);
                Status.Registered = true;
                Status.RegisteredUtc = DateTime.UtcNow;
                LogRegistered(Status.FileTransformationVersion);
                return RegistrationOutcome.Registered;
            }
            catch (TargetInvocationException ex)
            {
                Status.Error = ex.InnerException?.Message ?? ex.Message;
                Status.Registered = false;
                return RegistrationOutcome.Failed;
            }
            catch (Exception ex) when (ex is ReflectionTypeLoadException or TypeLoadException or ArgumentException or MissingMethodException)
            {
                Status.Error = ex.Message;
                Status.Registered = false;
                return RegistrationOutcome.Failed;
            }
        }
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
