using System.Collections.Generic;

namespace Jellyfin.Plugin.CustomizedHome.Services;

/// <summary>
/// A known home screen section.
/// </summary>
public sealed class SectionDefinition
{
    /// <summary>
    /// Initializes a new instance of the <see cref="SectionDefinition"/> class.
    /// </summary>
    /// <param name="key">The stable section key.</param>
    /// <param name="origin">The section provider: <c>jellyfin</c> or <c>hss</c>.</param>
    /// <param name="category">A category hint used by the editor.</param>
    /// <param name="english">The English label.</param>
    /// <param name="french">The French label.</param>
    /// <param name="isFamily">Whether the key groups several instances (e.g. one section per library or per item).</param>
    public SectionDefinition(string key, string origin, string category, string english, string french, bool isFamily = false)
    {
        Key = key;
        Origin = origin;
        Category = category;
        IsFamily = isFamily;
        Labels = new Dictionary<string, string>
        {
            ["en"] = english,
            ["fr"] = french
        };
    }

    /// <summary>
    /// Gets the stable section key (e.g. <c>hss:NextUp</c>, <c>jf:resume</c>).
    /// </summary>
    public string Key { get; }

    /// <summary>
    /// Gets the provider of the section: <c>jellyfin</c> (built-in web client) or <c>hss</c> (Home Screen Sections plugin).
    /// </summary>
    public string Origin { get; }

    /// <summary>
    /// Gets a category hint: general, movies, series, music, books, livetv, discover.
    /// </summary>
    public string Category { get; }

    /// <summary>
    /// Gets a value indicating whether the key represents a family of sections rendered several times
    /// (one per library, per genre, per watched item...). Family members share the same layout entry.
    /// </summary>
    public bool IsFamily { get; }

    /// <summary>
    /// Gets the labels per language code.
    /// </summary>
    public IReadOnlyDictionary<string, string> Labels { get; }
}

/// <summary>
/// Catalog of the sections known to the plugin. Sections discovered at runtime on the home page
/// (from any other plugin) are handled by the client script with a key derived from their title.
/// </summary>
public static class SectionCatalog
{
    /// <summary>
    /// Gets every known section.
    /// </summary>
    public static IReadOnlyList<SectionDefinition> All { get; } = new List<SectionDefinition>
    {
        // Built-in jellyfin-web sections (keys mirror the "homesectionN" user setting values).
        new("jf:smalllibrarytiles", "jellyfin", "general", "My Media", "Mes médias"),
        new("jf:librarybuttons", "jellyfin", "general", "My Media (small)", "Mes médias (petit)"),
        new("jf:resume", "jellyfin", "general", "Continue Watching", "Continuer de regarder"),
        new("jf:resumeaudio", "jellyfin", "music", "Continue Listening", "Reprendre l'écoute"),
        new("jf:resumebook", "jellyfin", "books", "Continue Reading", "Reprendre la lecture"),
        new("jf:nextup", "jellyfin", "series", "Next Up", "À suivre"),
        new("jf:latestmedia", "jellyfin", "general", "Recently Added in {0}", "{0}, ajouts récents", isFamily: true),
        new("jf:livetv", "jellyfin", "livetv", "Live TV", "TV en direct"),
        new("jf:activerecordings", "jellyfin", "livetv", "Active Recordings", "Enregistrements actifs"),

        // Home Screen Sections plugin (IAmParadox27). Keys mirror the HSS section identifiers.
        new("hss:MyMedia", "hss", "general", "My Media", "Mes médias"),
        new("hss:ContinueWatching", "hss", "general", "Continue Watching", "Continuer à regarder"),
        new("hss:NextUp", "hss", "series", "Next Up", "À suivre"),
        new("hss:ContinueWatchingNextUp", "hss", "general", "Continue Watching / Next Up", "Continuer à regarder / À suivre"),
        new("hss:RecentlyAddedMovies", "hss", "movies", "Recently Added Movies", "Films ajoutés récemment"),
        new("hss:RecentlyAddedShows", "hss", "series", "Recently Added Shows", "Séries ajoutées récemment"),
        new("hss:LatestMovies", "hss", "movies", "Latest Movies", "Derniers films"),
        new("hss:LatestShows", "hss", "series", "Latest Shows", "Dernières séries"),
        new("hss:BecauseYouWatched", "hss", "general", "Because You Watched {0}", "Parce que vous avez regardé {0}", isFamily: true),
        new("hss:WatchAgain", "hss", "general", "Watch Again", "Regarder à nouveau"),
        new("hss:CollectionsSection", "hss", "movies", "Collections", "Collections"),
        new("hss:Discover", "hss", "discover", "Discover", "Découvrir"),
        new("hss:DiscoverMovies", "hss", "discover", "Discover Movies", "Découvrir les films"),
        new("hss:DiscoverTV", "hss", "discover", "Discover TV Shows", "Découvrir les séries"),
        new("hss:Genre", "hss", "movies", "Genre", "Genre", isFamily: true),
        new("hss:MyList", "hss", "general", "My List", "Ma liste"),
        new("hss:MyJellyseerrRequests", "hss", "discover", "My Requests", "Mes demandes"),
        new("hss:TopTen", "hss", "general", "Top Ten", "Top 10"),
        new("hss:LiveTV", "hss", "livetv", "Live TV", "TV en direct"),
        new("hss:RecentlyAddedInLibrary", "hss", "general", "Recently Added in {0}", "Ajouté récemment dans {0}", isFamily: true),
        new("hss:RecentlyAddedAlbums", "hss", "music", "Recently Added Albums", "Albums ajoutés récemment"),
        new("hss:RecentlyAddedArtists", "hss", "music", "Recently Added Artists", "Artistes ajoutés récemment"),
        new("hss:RecentlyAddedMusicVideos", "hss", "music", "Recently Added Music Videos", "Vidéos musicales ajoutées récemment"),
        new("hss:RecentlyAddedAudioBooks", "hss", "books", "Recently Added Audiobooks", "Livres audio ajoutés récemment"),
        new("hss:RecentlyAddedBooks", "hss", "books", "Recently Added Books", "Livres ajoutés récemment"),
        new("hss:LatestAlbums", "hss", "music", "Latest Albums", "Derniers albums"),
        new("hss:LatestMusicVideo", "hss", "music", "Latest Music Videos", "Dernières vidéos musicales"),
        new("hss:LatestAudioBooks", "hss", "books", "Latest Audiobooks", "Derniers livres audio"),
        new("hss:LatestBooks", "hss", "books", "Latest Books", "Derniers livres"),
        new("hss:DirectedBy", "hss", "movies", "Directed by {0}", "Réalisé par {0}", isFamily: true),
        new("hss:Starring", "hss", "movies", "Starring {0}", "Avec {0}", isFamily: true),
        new("hss:UpcomingShows", "hss", "series", "Upcoming Shows", "Séries à venir"),
        new("hss:UpcomingMovies", "hss", "movies", "Upcoming Movies", "Films à venir"),
        new("hss:UpcomingMusic", "hss", "music", "Upcoming Music", "Musiques à venir"),
        new("hss:UpcomingBooks", "hss", "books", "Upcoming Books", "Livres à venir")
    };
}
