/*
 * Minimal stand-in for the global ApiClient / Dashboard objects of jellyfin-web, backed by window.__mock.
 * Tests seed window.__mock before the plugin script loads and read window.__mock.requests afterwards.
 */
(function () {
    'use strict';

    const mock = window.__mock = Object.assign({
        // The logged in user; null while logged out. layoutResponses overrides layoutResponse per user id.
        userId: 'user-1',
        layoutResponses: {},
        // "<METHOD> <path>" -> number of failures left (-1: always fails).
        failures: {},
        // "<METHOD> <path>" -> milliseconds before the answer.
        delays: {},
        resumeItems: [],
        nextUpItems: [],
        layoutResponse: null,
        defaultLayout: { Version: 1, HideUnlisted: false, Items: [] },
        catalog: [],
        userLayouts: [],
        genres: [],
        genreImages: [],
        heroItems: {},
        pluginConfiguration: {},
        status: {
            PluginVersion: '0.0.0.0',
            RootPath: '',
            Injection: { FileTransformationDetected: true, FileTransformationVersion: '3.0.0.0', Registered: true },
            UserLayoutCount: 0
        },
        requests: []
    }, window.__mock || {});

    function route(method, url, body) {
        const path = url.split('?')[0];
        mock.requests.push({ method: method, path: path, url: url, body: body === undefined ? null : body, ts: Date.now() });
        if (path === 'CustomizedHome/Layout' && method === 'GET') {
            return mock.layoutResponses[mock.userId] || mock.layoutResponse;
        }
        if (path === 'CustomizedHome/Layout' && method === 'POST') {
            const own = mock.layoutResponses[mock.userId] || mock.layoutResponse;
            own.Layout = body;
            own.HasUserLayout = true;
            return body;
        }
        if (path === 'UserItems/Resume') {
            return { Items: mock.resumeItems };
        }
        if (path === 'Shows/NextUp') {
            return { Items: mock.nextUpItems };
        }
        if (path === 'CustomizedHome/Layout' && method === 'DELETE') {
            const own = mock.layoutResponses[mock.userId] || mock.layoutResponse;
            own.Layout = { Version: 1, HideUnlisted: false, Items: [] };
            own.HasUserLayout = false;
            return null;
        }
        if (path === 'CustomizedHome/DefaultLayout') {
            if (method === 'POST') {
                mock.defaultLayout = body;
            }
            return mock.defaultLayout;
        }
        if (path === 'CustomizedHome/Catalog') {
            return mock.catalog;
        }
        if (path === 'CustomizedHome/Status' || path === 'CustomizedHome/Status/Retry') {
            return mock.status;
        }
        if (path === 'CustomizedHome/UserLayouts') {
            return mock.userLayouts;
        }
        if (path === 'CustomizedHome/GenreImages') {
            const nameMatch = /[?&]name=([^&]+)/.exec(url);
            const shapeMatch = /[?&]shape=([^&]+)/.exec(url);
            const isOther = function (name, shape) {
                return function (candidate) {
                    return candidate.Name !== name || (candidate.Shape || 'portrait') !== shape;
                };
            };
            if (method === 'POST') {
                const entry = { Name: body.Name, Shape: body.Shape || 'portrait', Version: mock.genreImages.length + 1 };
                mock.genreImages = mock.genreImages.filter(isOther(entry.Name, entry.Shape)).concat([entry]);
                return entry;
            }
            if (method === 'DELETE' && nameMatch) {
                const shape = shapeMatch ? decodeURIComponent(shapeMatch[1]) : 'portrait';
                mock.genreImages = mock.genreImages.filter(isOther(decodeURIComponent(nameMatch[1]), shape));
                return null;
            }
            return mock.genreImages;
        }
        if (path === 'Genres') {
            return { Items: mock.genres };
        }
        if (path === 'Items' && /[?&]ids=/.test(url)) {
            // Reload of the media already shown by the hero: same ids, current state.
            const ids = decodeURIComponent(/[?&]ids=([^&]*)/.exec(url)[1]).split(',');
            const known = {};
            Object.keys(mock.heroItems).forEach(function (source) {
                mock.heroItems[source].forEach(function (item) {
                    known[item.Id] = item;
                });
            });
            return {
                Items: ids.map(function (id) {
                    return known[id];
                }).filter(Boolean)
            };
        }
        if (path === 'Items' && /[?&]fields=Overview/.test(url)) {
            // Hero query: one list per source, recognized by its sort order and item type.
            const sortBy = decodeURIComponent((/[?&]sortBy=([^&]+)/.exec(url) || [])[1] || '');
            const types = decodeURIComponent((/[?&]includeItemTypes=([^&]+)/.exec(url) || [])[1] || '');
            const limit = parseInt((/[?&]limit=(\d+)/.exec(url) || [])[1] || '100', 10);
            let source = 'random';
            if (sortBy.indexOf('DateCreated') === 0) {
                source = types === 'Movie' ? 'recentMovies' : 'recentShows';
            } else if (sortBy.indexOf('PremiereDate') === 0) {
                source = types === 'Movie' ? 'latestMovies' : 'latestShows';
            }
            return { Items: (mock.heroItems[source] || []).slice(0, limit) };
        }
        if (path === 'Items') {
            // Items of one genre: two movies named after it. Any other item query (history...) is empty.
            const byId = /[?&]genreIds=([^&]+)/.exec(url);
            if (byId) {
                // Poster collage of a genre card: four distinct items with a primary image.
                const genreId = decodeURIComponent(byId[1]);
                return {
                    Items: [1, 2, 3, 4].map(function (index) {
                        return { Id: genreId + '-poster-' + index, Name: 'Poster ' + index, Type: 'Movie', ImageTags: { Primary: 'tag' + index } };
                    })
                };
            }
            const match = /[?&]genres=([^&]+)/.exec(url);
            if (!match) {
                return { Items: [] };
            }
            const genre = decodeURIComponent(match[1]);
            return {
                Items: [
                    { Id: 'item-' + genre + '-1', Name: genre + ' One', Type: 'Movie', ProductionYear: 2020 },
                    { Id: 'item-' + genre + '-2', Name: genre + ' Two', Type: 'Movie', ProductionYear: 2021 }
                ]
            };
        }
        return { Items: [] };
    }

    // Same shape as jellyfin-web: a rejected promise carrying the HTTP status.
    function respond(method, url, body) {
        const key = method + ' ' + url.split('?')[0];
        const delay = mock.delays[key];
        if (delay) {
            return new Promise(function (resolve) {
                setTimeout(resolve, delay);
            }).then(function () {
                return answer(method, url, body, key);
            });
        }
        return answer(method, url, body, key);
    }

    function answer(method, url, body, key) {
        const left = mock.failures[key];
        if (left) {
            if (left > 0) {
                mock.failures[key] = left - 1;
            }
            mock.requests.push({ method: method, path: url.split('?')[0], url: url, body: body === undefined ? null : body, failed: true, ts: Date.now() });
            return Promise.reject({ status: 500 });
        }
        return Promise.resolve(route(method, url, body));
    }

    window.ApiClient = {
        getCurrentUserId: function () {
            return mock.userId;
        },
        serverId: function () {
            return 'server-1';
        },
        getUrl: function (path, params) {
            const query = params ? Object.keys(params).map(function (key) {
                return key + '=' + encodeURIComponent(params[key]);
            }).join('&') : '';
            return path + (query ? '?' + query : '');
        },
        getJSON: function (url) {
            return respond('GET', url);
        },
        ajax: function (request) {
            return respond(request.type, request.url, request.data ? JSON.parse(request.data) : undefined);
        },
        getDisplayPreferences: function () {
            return Promise.resolve({ CustomPrefs: {} });
        },
        getUserViews: function () {
            const views = {
                Items: [
                    { Id: 'lib-movies', Name: 'Movies', CollectionType: 'movies' },
                    { Id: 'lib-shows', Name: 'Shows', CollectionType: 'tvshows' }
                ]
            };
            // delays['GET UserViews'] makes the editor slow to open.
            return new Promise(function (resolve) {
                setTimeout(function () {
                    resolve(views);
                }, mock.delays['GET UserViews'] || 0);
            });
        },
        // User data writes: recorded like the other requests, and able to fail ("POST UserData").
        updateFavoriteStatus: function (userId, itemId, isFavorite) {
            return respond('POST', 'UserData', { action: 'favorite', userId: userId, itemId: itemId, value: isFavorite });
        },
        markPlayed: function (userId, itemId) {
            return respond('POST', 'UserData', { action: 'played', userId: userId, itemId: itemId, value: true });
        },
        markUnplayed: function (userId, itemId) {
            return respond('POST', 'UserData', { action: 'played', userId: userId, itemId: itemId, value: false });
        },
        getImageUrl: function (id) {
            return 'about:blank#' + id;
        },
        getPluginConfiguration: function () {
            return Promise.resolve(mock.pluginConfiguration);
        },
        updatePluginConfiguration: function (id, config) {
            mock.pluginConfiguration = config;
            mock.requests.push({ method: 'POST', path: 'PluginConfiguration', body: config });
            return Promise.resolve({});
        }
    };

    window.Dashboard = {
        showLoadingMsg: function () { },
        hideLoadingMsg: function () { },
        processPluginConfigurationUpdateResult: function () { },
        alert: function (message) {
            mock.requests.push({ method: 'ALERT', path: String(message), body: null });
        }
    };
})();
