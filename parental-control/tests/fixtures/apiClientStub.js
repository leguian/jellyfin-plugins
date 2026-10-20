/*
 * Minimal stand-in for the globals of jellyfin-web (ApiClient, Dashboard, the sign-in page handlers), backed by
 * window.__mock. Tests seed window.__mock before this file loads and read window.__mock.requests afterwards.
 */
(function () {
    'use strict';

    const mock = window.__mock = Object.assign({
        // The signed in user; null while on the sign-in page.
        userId: 'tim-id',
        // GET ParentalControl/Me per user id (a non-controlled answer when missing).
        me: {},
        signIn: { PinUsers: [] },
        // Sign-in page: user name -> [password, user id].
        accounts: { Tim: ['1234', 'tim-id'], Will: ['5678', 'will-id'], Parent: ['secret', 'parent-id'] },
        parentPin: '4321',
        family: [],
        views: {},
        preview: { Movies: 3, Series: 1, Collections: 0, Albums: 0, Sample: [], Syncing: false },
        labels: [],
        status: {
            PluginVersion: '1.0.0.0',
            Injection: { FileTransformationDetected: true, FileTransformationVersion: '3.0.0.0', Registered: true },
            Sync: { Running: false, LastRunUtc: '2026-10-20T08:00:00Z', TaggedItems: 12, LastChanged: 3 },
            ParentPinSet: true,
            MessageLanguage: 'auto',
            DeveloperMode: false
        },
        libraries: [{ Id: 'lib-movies', Name: 'Movies', CollectionType: 'movies' }, { Id: 'lib-shows', Name: 'Shows', CollectionType: 'tvshows' }],
        ratings: [{ Name: 'TP', Value: 0 }, { Name: 'U', Value: 0 }, { Name: '6+', Value: 6 }, { Name: '12', Value: 12 }, { Name: '16', Value: 16 }, { Name: '18', Value: 18 }],
        items: [
            { Id: 'movie-1', Name: 'Bluey Movie', Type: 'Movie', ProductionYear: 2024, ImageTags: { Primary: 'p1' } },
            { Id: 'series-1', Name: 'Peppa Pig', Type: 'Series', ProductionYear: 2004, ImageTags: {} },
            { Id: 'movie-2', Name: 'Scary Night', Type: 'Movie', ProductionYear: 2020, ImageTags: {} }
        ],
        collections: [{ Id: 'set-1', Name: 'Pixar Collection', Type: 'BoxSet', ImageTags: {} }],
        genres: [{ Id: 'g1', Name: 'Animation' }, { Id: 'g2', Name: 'Horror' }],
        tags: ['violent', 'pc-hidden-tim', 'cartoon'],
        failures: {},
        requests: [],
        logouts: 0,
        selectServers: 0
    }, window.__mock || {});

    function record(method, url, body) {
        mock.requests.push({ method: method, path: url.split('?')[0], url: url, body: body === undefined ? null : body, ts: Date.now() });
    }

    function query(url, name) {
        const match = new RegExp('[?&]' + name + '=([^&]*)').exec(url);
        return match ? decodeURIComponent(match[1]) : '';
    }

    function route(method, url, body) {
        const path = url.split('?')[0];
        let match;
        if (path === 'ParentalControl/Me') {
            return mock.me[mock.userId] || { Controlled: false, HiddenElements: [], ScreenTime: { Enabled: false }, AllowedNow: true, ParentPinSet: true };
        }
        if (path === 'ParentalControl/Me/ParentPin') {
            return body.Pin === mock.parentPin ? { Valid: true, RetryAfterSeconds: 0 } : { Valid: false, RetryAfterSeconds: mock.retryAfter || 0 };
        }
        if (path === 'ParentalControl/Me/Extend') {
            if (body.Pin !== mock.parentPin) {
                return { Valid: false, RetryAfterSeconds: 0 };
            }
            const me = mock.me[mock.userId];
            me.ScreenTime.BonusMinutes = (me.ScreenTime.BonusMinutes || 0) + body.Minutes;
            me.ScreenTime.RemainingSeconds = body.Minutes * 60;
            me.ScreenTime.Exhausted = false;
            return { Valid: true, RetryAfterSeconds: 0 };
        }
        if (path === 'ParentalControl/Family') {
            return mock.family;
        }
        if ((match = /^ParentalControl\/Profiles\/([^/]+)$/.exec(path))) {
            const view = mock.views[match[1]];
            if (method === 'POST') {
                view.Profile = Object.assign({}, body.Profile, { UserId: match[1], TagKey: view.Profile.TagKey || 'key' });
                view.Native = body.Native;
                view.User.HasProfile = true;
                view.User.Enabled = body.Profile.Enabled;
            } else if (method === 'DELETE') {
                view.User.HasProfile = false;
                return null;
            }
            return view;
        }
        if ((match = /^ParentalControl\/Profiles\/([^/]+)\/Bonus$/.exec(path))) {
            const today = mock.views[match[1]].Usage.Today;
            today.BonusMinutes = Math.max(0, today.BonusMinutes + body.Minutes);
            return today;
        }
        if (/^ParentalControl\/Profiles\/[^/]+\/Pin$/.test(path)) {
            return null;
        }
        if (/^ParentalControl\/Profiles\/[^/]+\/Preview$/.test(path)) {
            return mock.preview;
        }
        if (path === 'ParentalControl/Labels') {
            if (method === 'POST') {
                const label = Object.assign({}, body, { Id: 'label-' + (mock.labels.length + 1) });
                mock.labels.push(label);
                return label;
            }
            return mock.labels;
        }
        if ((match = /^ParentalControl\/Labels\/(.+)$/.exec(path))) {
            const id = match[1];
            if (method === 'DELETE') {
                mock.labels = mock.labels.filter(function (label) {
                    return label.Id !== id;
                });
                return null;
            }
            const updated = Object.assign({}, body, { Id: id });
            mock.labels = mock.labels.map(function (label) {
                return label.Id === id ? updated : label;
            });
            return updated;
        }
        if (path === 'ParentalControl/Status' || path === 'ParentalControl/Status/Retry' || path === 'ParentalControl/Sync') {
            return mock.status;
        }
        if (path === 'ParentalControl/ParentPin') {
            mock.status.ParentPinSet = method === 'POST';
            return null;
        }
        if (path === 'ParentalControl/Options') {
            mock.status.MessageLanguage = body.MessageLanguage;
            mock.status.DeveloperMode = body.DeveloperMode;
            return mock.status;
        }
        if (path === 'Library/MediaFolders') {
            return { Items: mock.libraries };
        }
        if (path === 'Localization/ParentalRatings') {
            return mock.ratings;
        }
        if (path === 'Genres') {
            return { Items: mock.genres };
        }
        if (path === 'Items/Filters2') {
            return { Tags: mock.tags };
        }
        if (path === 'Items') {
            const list = query(url, 'IncludeItemTypes') === 'BoxSet' ? mock.collections : mock.items;
            const term = query(url, 'SearchTerm').toLowerCase();
            return {
                Items: list.filter(function (item) {
                    return !term || item.Name.toLowerCase().indexOf(term) >= 0;
                })
            };
        }
        return null;
    }

    // Same shape as the API client of jellyfin-web: an error carries the status and the body of the answer.
    function respond(method, url, body) {
        record(method, url, body);
        const key = method + ' ' + url.split('?')[0];
        const failure = mock.failures[key];
        if (failure) {
            return Promise.reject({
                status: failure.status || 500,
                text: function () {
                    return Promise.resolve(failure.message || '');
                }
            });
        }
        const result = route(method, url, body);
        return Promise.resolve(result === null || result === undefined ? result : JSON.parse(JSON.stringify(result)));
    }

    window.ApiClient = {
        getCurrentUserId: function () {
            return mock.userId;
        },
        serverId: function () {
            return 'server-1';
        },
        getUrl: function (path, params) {
            const text = params ? Object.keys(params).map(function (key) {
                return key + '=' + encodeURIComponent(params[key]);
            }).join('&') : '';
            return path + (text ? '?' + text : '');
        },
        getJSON: function (url) {
            return respond('GET', url);
        },
        ajax: function (request) {
            return respond(request.type, request.url, request.data ? JSON.parse(request.data) : undefined);
        }
    };

    // The anonymous sign-in information is read with fetch: answered from the mock too.
    const nativeFetch = window.fetch;
    window.fetch = function (input, init) {
        const url = String(input);
        if (url.indexOf('ParentalControl/SignIn') === 0) {
            record('GET', url);
            return Promise.resolve(new Response(JSON.stringify(mock.signIn), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return nativeFetch.call(window, input, init);
    };

    window.Dashboard = {
        logout: function () {
            mock.logouts++;
        },
        selectServer: function () {
            mock.selectServers++;
        },
        alert: function () { },
        showLoadingMsg: function () { },
        hideLoadingMsg: function () { }
    };

    // The handlers of the sign-in page of jellyfin-web: a card click shows the manual form, a submit signs in after a
    // round trip, and a refused password empties the password field.
    const loginPage = document.getElementById('loginPage');
    if (loginPage) {
        loginPage.querySelector('#divUsers').addEventListener('click', function (e) {
            const card = e.target.closest('.card');
            if (card) {
                mock.requests.push({ method: 'NATIVE', path: 'card-click', body: card.querySelector('.cardContent').getAttribute('data-username') });
                loginPage.querySelector('.manualLoginForm').classList.remove('hide');
            }
        });
        loginPage.querySelector('.manualLoginForm').addEventListener('submit', function (e) {
            e.preventDefault();
            const name = loginPage.querySelector('#txtManualName').value;
            const password = loginPage.querySelector('#txtManualPassword').value;
            mock.requests.push({ method: 'NATIVE', path: 'sign-in', body: { name: name, password: password, remember: loginPage.querySelector('.chkRememberLogin').checked } });
            setTimeout(function () {
                const account = mock.accounts[name];
                if (account && account[0] === password) {
                    mock.userId = account[1];
                    loginPage.classList.add('hide');
                } else {
                    loginPage.querySelector('#txtManualPassword').value = '';
                }
            }, mock.signInDelay || 50);
        });
    }
})();
