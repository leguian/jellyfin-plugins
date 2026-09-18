using System.Collections.Generic;
using System.Xml.Serialization;

namespace Jellyfin.Plugin.CustomizedHome.Models;

/// <summary>
/// Settings of the hero banner shown at the top of the home page: a carousel of featured media.
/// </summary>
public class HeroSettings
{
    /// <summary>
    /// Gets or sets a value indicating whether the hero is shown.
    /// </summary>
    public bool Enabled { get; set; }

    /// <summary>
    /// Gets or sets the sources the featured media come from (see <see cref="HeroSources"/>). Sources are combined.
    /// </summary>
    [XmlArrayItem("Source")]
    public List<string> Sources { get; set; } = new List<string>();

    /// <summary>
    /// Gets or sets the number of media in the carousel.
    /// </summary>
    public int Count { get; set; } = HeroLimits.DefaultCount;

    /// <summary>
    /// Gets or sets the delay between two slides, in seconds. 0 disables the automatic rotation.
    /// </summary>
    public int IntervalSeconds { get; set; } = HeroLimits.DefaultIntervalSeconds;

    /// <summary>
    /// Gets or sets a value indicating whether media the user already watched are left out.
    /// </summary>
    public bool ExcludePlayed { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether media without a backdrop image are left out.
    /// </summary>
    public bool RequireBackdrop { get; set; } = true;
}

/// <summary>
/// Sources of the hero banner.
/// </summary>
public static class HeroSources
{
    /// <summary>Random movies and shows.</summary>
    public const string Random = "random";

    /// <summary>Movies recently added to the libraries.</summary>
    public const string RecentMovies = "recentMovies";

    /// <summary>Shows recently added to the libraries.</summary>
    public const string RecentShows = "recentShows";

    /// <summary>Latest movies by release date.</summary>
    public const string LatestMovies = "latestMovies";

    /// <summary>Latest shows by release date.</summary>
    public const string LatestShows = "latestShows";

    /// <summary>Every accepted source.</summary>
    public static readonly string[] All = [Random, RecentMovies, RecentShows, LatestMovies, LatestShows];
}

/// <summary>
/// Bounds of the hero settings.
/// </summary>
public static class HeroLimits
{
    /// <summary>Minimum number of media in the carousel.</summary>
    public const int MinCount = 1;

    /// <summary>Maximum number of media in the carousel.</summary>
    public const int MaxCount = 12;

    /// <summary>Default number of media in the carousel.</summary>
    public const int DefaultCount = 6;

    /// <summary>Shortest automatic rotation delay, in seconds (0 means no rotation).</summary>
    public const int MinIntervalSeconds = 3;

    /// <summary>Longest automatic rotation delay, in seconds.</summary>
    public const int MaxIntervalSeconds = 60;

    /// <summary>Default automatic rotation delay, in seconds.</summary>
    public const int DefaultIntervalSeconds = 10;
}
