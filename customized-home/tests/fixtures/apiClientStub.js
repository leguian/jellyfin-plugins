/*
 * Minimal stand-in for the global ApiClient / Dashboard objects of jellyfin-web, backed by window.__mock.
 * Tests seed window.__mock before the plugin script loads and read window.__mock.requests afterwards.
 */
(function () {
    'use strict';

    const mock = window.__mock = Object.assign({
        layoutResponse: null,
        defaultLayout: { Version: 1, HideUnlisted: false, Items: [] },
        catalog: [],
        userLayouts: [],
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
        mock.requests.push({ method: method, path: path, body: body === undefined ? null : body });
        if (path === 'CustomizedHome/Layout' && method === 'GET') {
            return mock.layoutResponse;
        }
        if (path === 'CustomizedHome/Layout' && method === 'POST') {
            mock.layoutResponse.Layout = body;
            mock.layoutResponse.HasUserLayout = true;
            return body;
        }
        if (path === 'CustomizedHome/Layout' && method === 'DELETE') {
            mock.layoutResponse.Layout = { Version: 1, HideUnlisted: false, Items: [] };
            mock.layoutResponse.HasUserLayout = false;
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
        return { Items: [] };
    }

    window.ApiClient = {
        getCurrentUserId: function () {
            return 'user-1';
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
            return Promise.resolve(route('GET', url));
        },
        ajax: function (request) {
            return Promise.resolve(route(request.type, request.url, request.data ? JSON.parse(request.data) : undefined));
        },
        getDisplayPreferences: function () {
            return Promise.resolve({ CustomPrefs: {} });
        },
        getUserViews: function () {
            return Promise.resolve({
                Items: [
                    { Id: 'lib-movies', Name: 'Movies', CollectionType: 'movies' },
                    { Id: 'lib-shows', Name: 'Shows', CollectionType: 'tvshows' }
                ]
            });
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
