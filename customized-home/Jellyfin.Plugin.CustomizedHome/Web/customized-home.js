/*
 * Customized Home - Jellyfin plugin client script.
 * Injected into the web client by the File Transformation plugin.
 *
 * Reorders, hides and groups the home screen sections according to the layout stored on the server.
 * Sections are never moved in the DOM (moving an emby-itemscontainer resets its data bindings):
 * the home container is turned into a flex column and each section receives a CSS "order".
 */
(function () {
    'use strict';

    if (window.CustomizedHome && window.CustomizedHome.loaded) {
        return;
    }

    const VERSION = '1.4.0.1';
    const API = 'CustomizedHome';
    const ORDER_STEP = 1000;
    const ORDER_UNLISTED_BASE = 1000000000;
    const ORDER_TAIL = 2147000100; // after the Home Screen Sections loading indicator (2147000000)
    const STORAGE_PREFIX = 'customizedHome-';
    const DEFAULT_JF_SECTIONS = ['smalllibrarytiles', 'resume', 'resumeaudio', 'resumebook', 'livetv', 'nextup', 'latestmedia', 'none', 'none', 'none'];
    const NON_ID_CLASS = /^(verticalSection|hide|section\d+|verticalSection-extrabottompadding|padded-.*|ch-.*|emby-.*|focuscontainer.*|scrollSlider.*)$/;
    const FOLDER_ICONS = ['folder', 'tv', 'movie', 'live_tv', 'music_note', 'book', 'star', 'favorite', 'play_circle', 'history', 'explore',
        'new_releases', 'whatshot', 'collections', 'video_library', 'theaters', 'sports_esports', 'child_care', 'family_restroom', 'person',
        'group', 'home', 'label', 'category', 'dashboard', 'view_carousel', 'headphones', 'mic', 'photo_library', 'public'];

    const I18N = {
        en: {
            customize: 'Customize home',
            editorTitle: 'Customize the home screen',
            defaultTitle: 'Default home layout (all users)',
            newFolder: 'New folder',
            folderName: 'Folder name',
            save: 'Save',
            cancel: 'Cancel',
            reset: 'Reset',
            resetConfirm: 'Remove your custom layout and go back to the default one?',
            saved: 'Home layout saved',
            saveError: 'Could not save the layout',
            loadError: 'Could not load the layout',
            hideUnlisted: 'Hide sections that are not listed here',
            showAll: 'Show every known section',
            hint: 'The left column is your home page: as soon as it holds one section, it replaces the default home page. Add sections from the right column, drag the handles to reorder.',
            addToLayout: 'Add to the customized home page',
            removeAction: 'Remove from the customized home page',
            layoutEmpty: 'Empty: the default home page is displayed. Add sections from the right column to build your own.',
            search: 'Search a section',
            colLayout: 'Customized home page',
            colUnlisted: 'Sections not in the layout',
            moveToTop: 'Move this section to the very top',
            removeFromLayout: 'Remove from the layout',
            dropToRemove: 'Drop here to remove from the layout',
            searchNoResult: 'No section matches.',
            show: 'Show',
            hide: 'Hide',
            moveUp: 'Move up',
            moveDown: 'Move down',
            more: 'More',
            moveToFolder: 'Move to folder',
            removeFromFolder: 'Move out of the folder',
            chooseIcon: 'Choose an icon',
            collapsedByDefault: 'Collapsed by default',
            deleteFolder: 'Delete folder (sections are kept)',
            absent: 'not displayed right now',
            originJellyfin: 'Jellyfin',
            originHss: 'Home Screen Sections',
            originOther: 'Other plugin',
            empty: 'No section known yet. Open the home page first, then come back here.',
            sectionsCount: '{0} section(s)',
            notAllowed: 'Home customization is disabled by the administrator.',
            menuEntry: 'Customize home',
            unlisted: 'Sections not in the layout',
            close: 'Close',
            folder: 'Folder',
            family: 'several rows',
            originCustomized: 'Customized Home',
            int_combined: 'Continue Watching / Next Up',
            int_latestMovies: 'Latest Movies',
            int_latestShows: 'Latest Shows',
            int_collections: 'Collections',
            int_watchAgain: 'Watch Again',
            int_allGenres: 'All genres',
            genres: 'Genres',
            chooseGenres: 'Choose genres',
            genresAuto: 'Automatic (from your watch history)',
            genresCount: '{0} genre(s)',
            genresLoading: 'Loading genres…',
            genresNone: 'No genre found in your libraries.',
            becauseYouWatched: 'Because you watched {0}',
            genreTitle: 'Genre: {0}',
            format: 'Display format',
            shape: 'Card shape',
            shapeAuto: 'Default',
            shapePortrait: 'Poster',
            shapeLandscape: 'Landscape',
            shapeSquare: 'Square',
            size: 'Card size',
            sizeSmall: 'Small',
            sizeNormal: 'Normal',
            sizeLarge: 'Large',
            showTitles: 'Show titles',
            noTitles: 'no titles'
        },
        fr: {
            customize: "Personnaliser l'accueil",
            editorTitle: "Personnaliser l'accueil",
            defaultTitle: 'Disposition par défaut (tous les utilisateurs)',
            newFolder: 'Nouveau dossier',
            folderName: 'Nom du dossier',
            save: 'Enregistrer',
            cancel: 'Annuler',
            reset: 'Réinitialiser',
            resetConfirm: 'Supprimer votre disposition personnalisée et revenir à celle par défaut ?',
            saved: 'Disposition enregistrée',
            saveError: "Impossible d'enregistrer la disposition",
            loadError: 'Impossible de charger la disposition',
            hideUnlisted: 'Masquer les sections absentes de cette liste',
            showAll: 'Afficher toutes les sections connues',
            hint: "La colonne de gauche est votre page d'accueil : dès qu'elle contient une section, elle remplace la page d'accueil par défaut. Ajoutez des sections depuis la colonne de droite, glissez les poignées pour réordonner.",
            addToLayout: "Ajouter à la page d'accueil modifiée",
            removeAction: "Supprimer de la page d'accueil modifiée",
            layoutEmpty: "Vide : la page d'accueil par défaut est affichée. Ajoutez des sections depuis la colonne de droite pour composer la vôtre.",
            search: 'Rechercher une section',
            colLayout: "Page d'accueil modifiée",
            colUnlisted: 'Sections hors disposition',
            moveToTop: 'Remonter cette section tout en haut',
            removeFromLayout: 'Retirer de la disposition',
            dropToRemove: 'Déposer ici pour retirer de la disposition',
            searchNoResult: 'Aucune section ne correspond.',
            show: 'Afficher',
            hide: 'Masquer',
            moveUp: 'Monter',
            moveDown: 'Descendre',
            more: 'Plus',
            moveToFolder: 'Déplacer dans le dossier',
            removeFromFolder: 'Sortir du dossier',
            chooseIcon: 'Choisir une icône',
            collapsedByDefault: 'Replié par défaut',
            deleteFolder: 'Supprimer le dossier (les sections sont conservées)',
            absent: 'non affichée actuellement',
            originJellyfin: 'Jellyfin',
            originHss: 'Home Screen Sections',
            originOther: 'Autre plugin',
            empty: "Aucune section connue pour l'instant. Ouvrez d'abord la page d'accueil, puis revenez ici.",
            sectionsCount: '{0} section(s)',
            notAllowed: "La personnalisation de l'accueil est désactivée par l'administrateur.",
            menuEntry: "Personnaliser l'accueil",
            unlisted: 'Sections hors disposition',
            close: 'Fermer',
            folder: 'Dossier',
            family: 'plusieurs lignes',
            originCustomized: 'Customized Home',
            int_combined: 'Continuer à regarder / À suivre',
            int_latestMovies: 'Derniers films',
            int_latestShows: 'Dernières séries',
            int_collections: 'Collections',
            int_watchAgain: 'Regarder à nouveau',
            int_allGenres: 'Tous les genres',
            genres: 'Genres',
            chooseGenres: 'Choisir les genres',
            genresAuto: 'Automatique (selon votre historique)',
            genresCount: '{0} genre(s)',
            genresLoading: 'Chargement des genres…',
            genresNone: 'Aucun genre trouvé dans vos médiathèques.',
            becauseYouWatched: 'Parce que vous avez regardé {0}',
            genreTitle: 'Genre : {0}',
            format: "Format d'affichage",
            shape: 'Forme des cartes',
            shapeAuto: 'Par défaut',
            shapePortrait: 'Affiche',
            shapeLandscape: 'Paysage',
            shapeSquare: 'Carré',
            size: 'Taille des cartes',
            sizeSmall: 'Petite',
            sizeNormal: 'Normale',
            sizeLarge: 'Grande',
            showTitles: 'Afficher les titres',
            noTitles: 'sans titres'
        }
    };

    const state = {
        container: null,
        containerObserver: null,
        observedNodes: [],
        loadPromise: null,
        response: null,
        layout: null,
        ctx: null,
        ctxStale: false,
        discovered: [],
        applyScheduled: false,
        scanScheduled: false,
        catalog: null,
        userViews: null,
        integratedCache: {}
    };

    /* ------------------------------------------------------------------ */
    /* Utilities                                                           */
    /* ------------------------------------------------------------------ */

    function apiClient() {
        return window.ApiClient;
    }

    function currentUserId() {
        try {
            const client = apiClient();
            return client && client.getCurrentUserId ? client.getCurrentUserId() : null;
        } catch (e) {
            return null;
        }
    }

    function getLanguage() {
        let lang = '';
        try {
            const userId = currentUserId();
            if (userId) {
                lang = localStorage.getItem(userId + '-language') || '';
            }
        } catch (e) {
            lang = '';
        }
        if (!lang) {
            lang = document.documentElement.lang || navigator.language || 'en';
        }
        return lang.toLowerCase();
    }

    function t(key) {
        const table = I18N[getLanguage().split('-')[0]] || I18N.en;
        let text = table[key] || I18N.en[key] || key;
        for (let i = 1; i < arguments.length; i++) {
            text = text.replace('{' + (i - 1) + '}', arguments[i]);
        }
        return text;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function slug(text) {
        return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 80);
    }

    function storageGet(key) {
        try {
            return localStorage.getItem(STORAGE_PREFIX + key);
        } catch (e) {
            return null;
        }
    }

    function storageSet(key, value) {
        try {
            localStorage.setItem(STORAGE_PREFIX + key, value);
        } catch (e) {
            /* storage unavailable */
        }
    }

    function el(tag, className, html) {
        const node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (html !== undefined) {
            node.innerHTML = html;
        }
        return node;
    }

    function setClass(node, className, enabled) {
        if (enabled) {
            if (!node.classList.contains(className)) {
                node.classList.add(className);
            }
        } else if (node.classList.contains(className)) {
            node.classList.remove(className);
        }
    }

    function setOrder(node, order) {
        const value = String(order);
        if (node.style.order !== value) {
            node.style.order = value;
        }
    }

    let toastTimer = null;
    function toast(message) {
        let node = document.querySelector('.ch-toast');
        if (!node) {
            node = el('div', 'ch-toast');
            document.body.appendChild(node);
        }
        node.textContent = message;
        node.classList.add('ch-toast-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            node.classList.remove('ch-toast-visible');
        }, 3000);
    }

    function apiUrl(path, params) {
        return apiClient().getUrl(API + '/' + path, params);
    }

    function apiGet(path, params) {
        return apiClient().getJSON(apiUrl(path, params));
    }

    function apiSend(method, path, body, params) {
        const request = { type: method, url: apiUrl(path, params) };
        if (body !== undefined) {
            request.data = JSON.stringify(body);
            request.contentType = 'application/json';
            request.dataType = 'json';
        }
        return apiClient().ajax(request);
    }

    function waitForApiClient() {
        return new Promise(function (resolve, reject) {
            let attempts = 0;
            (function check() {
                if (currentUserId()) {
                    resolve(apiClient());
                    return;
                }
                if (++attempts > 240) {
                    reject(new Error('ApiClient not ready'));
                    return;
                }
                setTimeout(check, 250);
            })();
        });
    }

    /* ------------------------------------------------------------------ */
    /* Data loading                                                        */
    /* ------------------------------------------------------------------ */

    function ensureLoaded() {
        if (state.loadPromise) {
            return state.loadPromise;
        }
        state.loadPromise = waitForApiClient()
            .then(function () {
                return Promise.all([apiGet('Layout'), loadContext()]);
            })
            .then(function (results) {
                state.response = results[0];
                state.layout = results[0].Layout || { Items: [] };
                state.ctx = results[1];
                return state.response;
            })
            .catch(function (error) {
                console.warn('[CustomizedHome] could not load the layout', error);
                state.loadPromise = null;
                throw error;
            });
        return state.loadPromise;
    }

    function reloadLayout() {
        return apiGet('Layout').then(function (response) {
            state.response = response;
            state.layout = response.Layout || { Items: [] };
            scheduleApply();
            return response;
        });
    }

    function loadContext() {
        return Promise.all([loadJfSections(), loadCatalog()]).then(function (results) {
            return { jfSections: results[0], catalog: results[1], hss: false };
        });
    }

    function loadJfSections() {
        const client = apiClient();
        const userId = currentUserId();
        return client.getDisplayPreferences('usersettings', userId, 'emby').then(function (prefs) {
            const custom = (prefs && prefs.CustomPrefs) || {};
            const sections = [];
            for (let i = 0; i < 10; i++) {
                let value = custom['homesection' + i];
                if (value === undefined || value === null || value === '') {
                    try {
                        value = localStorage.getItem(userId + '-homesection' + i);
                    } catch (e) {
                        value = null;
                    }
                }
                if (!value) {
                    value = DEFAULT_JF_SECTIONS[i];
                }
                if (value === 'folders') {
                    value = DEFAULT_JF_SECTIONS[0];
                }
                sections.push(value);
            }
            if (document.documentElement.classList.contains('layout-tv')
                && sections.indexOf('smalllibrarytiles') < 0 && sections.indexOf('librarybuttons') < 0) {
                sections.unshift('smalllibrarytiles');
            }
            return sections;
        }).catch(function () {
            return null;
        });
    }

    function loadCatalog() {
        if (state.catalog) {
            return Promise.resolve(state.catalog);
        }
        return apiGet('Catalog').then(function (catalog) {
            state.catalog = catalog || [];
            return state.catalog;
        });
    }

    function loadUserViews() {
        const client = apiClient();
        return client.getUserViews({}, currentUserId()).then(function (result) {
            state.userViews = (result && result.Items) || [];
            return state.userViews;
        }).catch(function () {
            return state.userViews || [];
        });
    }

    /* ------------------------------------------------------------------ */
    /* Sections rendered by the plugin (no other plugin required)          */
    /* ------------------------------------------------------------------ */

    const IMAGE_FIELDS = 'PrimaryImageAspectRatio,ProductionYear,PremiereDate';
    const IMAGE_TYPES = 'Primary,Backdrop,Thumb';
    const INTEGRATED_CACHE_MS = 5 * 60 * 1000;

    function itemsQuery(params) {
        const client = apiClient();
        const query = Object.assign({
            userId: currentUserId(),
            fields: IMAGE_FIELDS,
            imageTypeLimit: 1,
            enableImageTypes: IMAGE_TYPES,
            enableTotalRecordCount: false
        }, params);
        return client.getJSON(client.getUrl('Items', query)).then(function (result) {
            return (result && result.Items) || [];
        });
    }

    function dedupeItems(items) {
        const seen = {};
        return items.filter(function (item) {
            if (!item || !item.Id || seen[item.Id]) {
                return false;
            }
            seen[item.Id] = true;
            return true;
        });
    }

    function fetchCombined() {
        const client = apiClient();
        const common = { userId: currentUserId(), fields: IMAGE_FIELDS, imageTypeLimit: 1, enableImageTypes: IMAGE_TYPES, enableTotalRecordCount: false };
        return Promise.all([
            client.getJSON(client.getUrl('UserItems/Resume', Object.assign({ limit: 12, mediaTypes: 'Video' }, common))).catch(function () { return null; }),
            client.getJSON(client.getUrl('Shows/NextUp', Object.assign({ limit: 24, enableResumable: false }, common))).catch(function () { return null; })
        ]).then(function (results) {
            const resume = (results[0] && results[0].Items) || [];
            const nextUp = (results[1] && results[1].Items) || [];
            return dedupeItems(resume.concat(nextUp));
        });
    }

    function fetchBecauseYouWatched() {
        return itemsQuery({ includeItemTypes: 'Movie,Series', recursive: true, isPlayed: true, sortBy: 'DatePlayed', sortOrder: 'Descending', limit: 3, fields: 'PrimaryImageAspectRatio' })
            .then(function (seeds) {
                return Promise.all(seeds.map(function (seed) {
                    const client = apiClient();
                    return client.getJSON(client.getUrl('Items/' + seed.Id + '/Similar', { userId: currentUserId(), limit: 12, fields: IMAGE_FIELDS }))
                        .then(function (result) {
                            return { title: t('becauseYouWatched', seed.Name), items: (result && result.Items) || [] };
                        })
                        .catch(function () {
                            return { title: '', items: [] };
                        });
                }));
            })
            .then(function (list) {
                return list.filter(function (instance) {
                    return instance.items.length > 0;
                });
            });
    }

    const AUTO_GENRE_ROWS = 2;
    const GENRE_ROW_ITEMS = 16;

    function fetchGenreList() {
        const client = apiClient();
        return client.getJSON(client.getUrl('Genres', {
            userId: currentUserId(),
            sortBy: 'SortName',
            includeItemTypes: 'Movie,Series',
            recursive: true,
            enableTotalRecordCount: false
        })).then(function (result) {
            return (result && result.Items) || [];
        });
    }

    function autoGenres() {
        return itemsQuery({ includeItemTypes: 'Movie,Series', recursive: true, isPlayed: true, sortBy: 'DatePlayed', sortOrder: 'Descending', limit: 100, fields: 'Genres' })
            .then(function (played) {
                const counts = {};
                played.forEach(function (item) {
                    (item.Genres || []).forEach(function (genre) {
                        counts[genre] = (counts[genre] || 0) + 1;
                    });
                });
                const weighted = Object.keys(counts).sort(function (a, b) {
                    return counts[b] - counts[a];
                }).slice(0, 6);
                if (weighted.length) {
                    return weighted;
                }
                return fetchGenreList().then(function (genres) {
                    return genres.map(function (genre) {
                        return genre.Name;
                    });
                }).catch(function () {
                    return [];
                });
            })
            .then(function (pool) {
                const remaining = pool.slice();
                const chosen = [];
                while (chosen.length < AUTO_GENRE_ROWS && remaining.length) {
                    chosen.push(remaining.splice(Math.floor(Math.random() * remaining.length), 1)[0]);
                }
                return chosen;
            });
    }

    // One row per genre: the genres chosen in the editor, or an automatic pick from the watch history.
    function fetchGenre(item) {
        const selected = (item && item.Genres) || [];
        const source = selected.length ? Promise.resolve(selected) : autoGenres();
        return source
            .then(function (genres) {
                return Promise.all(genres.map(function (genre) {
                    return itemsQuery({ genres: genre, includeItemTypes: 'Movie,Series', recursive: true, sortBy: 'Random', limit: GENRE_ROW_ITEMS })
                        .then(function (items) {
                            return { title: t('genreTitle', genre), items: items };
                        })
                        .catch(function () {
                            return { title: genre, items: [] };
                        });
                }));
            })
            .then(function (list) {
                return list.filter(function (instance) {
                    return instance.items.length > 0;
                });
            });
    }

    // Settings of a layout entry that change what an integrated section fetches.
    function dataSignature(item) {
        return ((item && item.Genres) || []).join('|');
    }

    const INTEGRATED = {
        'ch:combined': { titleKey: 'int_combined', shape: 'landscape', fetch: fetchCombined },
        'ch:latestMovies': { titleKey: 'int_latestMovies', shape: 'portrait', fetch: function () {
            return itemsQuery({ includeItemTypes: 'Movie', recursive: true, sortBy: 'PremiereDate,SortName', sortOrder: 'Descending', limit: 16 });
        } },
        'ch:latestShows': { titleKey: 'int_latestShows', shape: 'portrait', fetch: function () {
            return itemsQuery({ includeItemTypes: 'Series', recursive: true, sortBy: 'PremiereDate,SortName', sortOrder: 'Descending', limit: 16 });
        } },
        'ch:collections': { titleKey: 'int_collections', shape: 'portrait', fetch: function () {
            return itemsQuery({ includeItemTypes: 'BoxSet', recursive: true, sortBy: 'DateCreated,SortName', sortOrder: 'Descending', limit: 16 });
        } },
        'ch:watchAgain': { titleKey: 'int_watchAgain', shape: 'portrait', fetch: function () {
            return itemsQuery({ includeItemTypes: 'Movie,Series', recursive: true, isPlayed: true, sortBy: 'DatePlayed', sortOrder: 'Descending', limit: 16 });
        } },
        'ch:becauseYouWatched': { titleKey: 'becauseYouWatched', shape: 'portrait', family: true, fetchInstances: fetchBecauseYouWatched },
        'ch:genre': { titleKey: 'genreTitle', shape: 'portrait', family: true, fetchInstances: fetchGenre },
        'ch:allGenres': { titleKey: 'int_allGenres', shape: 'landscape', fetch: fetchGenreList }
    };

    function imageUrlFor(item, shape) {
        const client = apiClient();
        const tags = item.ImageTags || {};
        const backdrops = item.BackdropImageTags || [];
        const parentBackdrops = item.ParentBackdropImageTags || [];
        const width = shape === 'landscape' ? 600 : 360;
        function url(id, type, tag) {
            return client.getImageUrl(id, { type: type, maxWidth: width, tag: tag });
        }
        if (shape === 'landscape') {
            if (item.Type === 'Episode' && item.ParentThumbItemId && item.ParentThumbImageTag) {
                return url(item.ParentThumbItemId, 'Thumb', item.ParentThumbImageTag);
            }
            if (item.Type === 'Episode' && item.ParentBackdropItemId && parentBackdrops.length) {
                return url(item.ParentBackdropItemId, 'Backdrop', parentBackdrops[0]);
            }
            if (tags.Thumb) {
                return url(item.Id, 'Thumb', tags.Thumb);
            }
            if (backdrops.length) {
                return url(item.Id, 'Backdrop', backdrops[0]);
            }
            if (tags.Primary) {
                return url(item.Id, 'Primary', tags.Primary);
            }
            if (item.ParentBackdropItemId && parentBackdrops.length) {
                return url(item.ParentBackdropItemId, 'Backdrop', parentBackdrops[0]);
            }
            return null;
        }
        if (item.Type === 'Episode' && item.SeriesId && item.SeriesPrimaryImageTag) {
            return url(item.SeriesId, 'Primary', item.SeriesPrimaryImageTag);
        }
        if (tags.Primary) {
            return url(item.Id, 'Primary', tags.Primary);
        }
        if (item.Type === 'Episode' && item.ParentThumbItemId && item.ParentThumbImageTag) {
            return url(item.ParentThumbItemId, 'Thumb', item.ParentThumbImageTag);
        }
        if (tags.Thumb) {
            return url(item.Id, 'Thumb', tags.Thumb);
        }
        if (backdrops.length) {
            return url(item.Id, 'Backdrop', backdrops[0]);
        }
        return null;
    }

    function episodeLabel(item) {
        const parts = [];
        if (item.ParentIndexNumber != null && item.IndexNumber != null) {
            parts.push('S' + item.ParentIndexNumber + ':E' + item.IndexNumber);
        }
        if (item.Name) {
            parts.push(item.Name);
        }
        return parts.join(' - ');
    }

    function textHash(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = (hash * 31 + text.charCodeAt(i)) | 0;
        }
        return Math.abs(hash);
    }

    function cardHtml(item, shape, showTitle) {
        const serverId = item.ServerId || apiClient().serverId();
        const shapeClass = shape === 'landscape' ? 'overflowBackdropCard' : (shape === 'square' ? 'overflowSquareCard' : 'overflowPortraitCard');
        const padder = shape === 'landscape' ? 'cardPadder-overflowBackdrop' : (shape === 'square' ? 'cardPadder-overflowSquare' : 'cardPadder-overflowPortrait');
        const image = imageUrlFor(item, shape);
        const href = item.Type === 'Genre'
            ? '#/list?genreId=' + encodeURIComponent(item.Id) + '&serverId=' + encodeURIComponent(serverId)
            : '#/details?id=' + encodeURIComponent(item.Id) + '&serverId=' + encodeURIComponent(serverId);
        const isEpisode = item.Type === 'Episode';
        const title = isEpisode ? (item.SeriesName || item.Name || '') : (item.Name || '');
        let secondary = '';
        if (isEpisode) {
            secondary = episodeLabel(item);
        } else if (item.ProductionYear) {
            secondary = String(item.ProductionYear);
        } else if (item.PremiereDate) {
            secondary = String(new Date(item.PremiereDate).getFullYear());
        }
        const userData = item.UserData || {};
        let inner = '';
        if (userData.PlayedPercentage > 0 && userData.PlayedPercentage < 100) {
            inner += '<div class="itemProgressBar"><div class="itemProgressBarForeground" style="width:' + Math.round(userData.PlayedPercentage) + '%"></div></div>';
        }
        let indicators = '';
        if (userData.Played && item.Type !== 'BoxSet') {
            indicators += '<div class="playedIndicator indicator"><span class="material-icons indicatorIcon check" aria-hidden="true"></span></div>';
        } else if (userData.UnplayedItemCount) {
            indicators += '<div class="countIndicator indicator">' + userData.UnplayedItemCount + '</div>';
        }
        if (indicators) {
            inner += '<div class="cardIndicators">' + indicators + '</div>';
        }
        const imageClass = image
            ? 'cardImageContainer coveredImage cardContent'
            : 'cardImageContainer cardContent defaultCardBackground defaultCardBackground' + (textHash(title) % 5 + 1);
        const imageStyle = image ? ' style="background-image:url(&quot;' + escapeHtml(image) + '&quot;)"' : '';
        const defaultText = image ? '' : '<div class="cardText cardDefaultText">' + escapeHtml(title) + '</div>';

        let html = '<div class="card ' + shapeClass + ' card-hoverable card-withuserdata ch-card" data-id="' + escapeHtml(item.Id) + '" data-serverid="' + escapeHtml(serverId)
            + '" data-type="' + escapeHtml(item.Type || '') + '" data-isfolder="' + (item.IsFolder ? 'true' : 'false') + '"'
            + (item.MediaType ? ' data-mediatype="' + escapeHtml(item.MediaType) + '"' : '') + '>';
        html += '<div class="cardBox cardBox-bottompadded"><div class="cardScalable"><div class="cardPadder ' + padder + '"></div>';
        html += '<a href="' + href + '" class="' + imageClass + '"' + imageStyle + ' aria-label="' + escapeHtml(title) + '">' + defaultText + inner + '</a>';
        html += '</div>';
        if (showTitle) {
            html += '<div class="cardText cardTextCentered cardText-first"><bdi><a href="' + href + '" class="textActionButton" title="' + escapeHtml(title) + '">' + escapeHtml(title) + '</a></bdi></div>';
            html += '<div class="cardText cardTextCentered cardText-secondary"><bdi>' + escapeHtml(secondary) + '</bdi></div>';
        }
        html += '</div></div>';
        return html;
    }

    function formatFor(item, definition) {
        const shape = item && item.Shape && item.Shape !== 'auto' ? item.Shape : definition.shape;
        return { shape: shape, showTitle: !item || item.ShowTitle !== false };
    }

    function createIntegratedSection(container, key, instanceIndex) {
        const node = el('div', 'verticalSection ch-section hide');
        node.dataset.chKey = key;
        node.dataset.chInstance = String(instanceIndex || 0);
        node.innerHTML = '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left"><h2 class="sectionTitle sectionTitle-cards"></h2></div>'
            + '<div is="emby-scroller" class="padded-top-focusscale padded-bottom-focusscale" data-centerfocus="true">'
            + '<div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x ch-items"></div>'
            + '</div>';
        container.appendChild(node);
        return node;
    }

    function renderIntegratedSection(node, title, items, shape, showTitle) {
        node._chItems = items;
        node.dataset.chShape = shape;
        node.dataset.chShowTitle = showTitle ? '1' : '0';
        node.querySelector('.sectionTitle').textContent = title;
        node.querySelector('.ch-items').innerHTML = items.map(function (item) {
            return cardHtml(item, shape, showTitle);
        }).join('');
        setClass(node, 'hide', items.length === 0);
    }

    function wantedIntegrated(layout) {
        const wanted = {};
        if (!state.response || !state.response.EnableIntegratedSections) {
            return wanted;
        }
        (layout.Items || []).forEach(function (item) {
            if (item.Type === 'folder') {
                (item.Items || []).forEach(function (member) {
                    if (member.Key && INTEGRATED[member.Key] && member.Visible !== false && item.Visible !== false) {
                        wanted[member.Key] = member;
                    }
                });
            } else if (item.Key && INTEGRATED[item.Key] && item.Visible !== false) {
                wanted[item.Key] = item;
            }
        });
        return wanted;
    }

    function syncIntegratedSections(container, wanted) {
        const registry = container._chIntegrated || (container._chIntegrated = {});
        Array.prototype.forEach.call(container.querySelectorAll(':scope > .ch-section'), function (node) {
            if (!wanted[node.dataset.chKey]) {
                node.remove();
                delete registry[node.dataset.chKey];
            }
        });
        Object.keys(wanted).forEach(function (key) {
            const known = registry[key];
            const signature = dataSignature(wanted[key]);
            if (known) {
                // The web client may have wiped the container (settings change, navigation): render again.
                const missing = !known.loading && known.count > 0 && !container.querySelector('[data-ch-key="' + key + '"]');
                const changed = known.signature !== signature;
                if (!missing && !changed) {
                    return;
                }
                if (changed) {
                    Array.prototype.forEach.call(container.querySelectorAll(':scope > [data-ch-key="' + key + '"]'), function (node) {
                        node.remove();
                    });
                }
                delete registry[key];
            }
            const definition = INTEGRATED[key];
            const entry = { loading: true, count: 0, signature: signature };
            registry[key] = entry;
            const cacheKey = key + '#' + signature;
            const cached = state.integratedCache[cacheKey];
            let dataPromise;
            if (cached && Date.now() - cached.ts < INTEGRATED_CACHE_MS) {
                dataPromise = Promise.resolve(cached.data);
            } else {
                const load = definition.family
                    ? definition.fetchInstances(wanted[key])
                    : definition.fetch().then(function (items) {
                        return [{ title: t(definition.titleKey), items: items }];
                    });
                dataPromise = load.then(function (data) {
                    state.integratedCache[cacheKey] = { ts: Date.now(), data: data };
                    return data;
                });
            }
            dataPromise.then(function (instances) {
                entry.loading = false;
                entry.count = instances.length;
                if (!container.isConnected || container._chIntegrated !== registry || registry[key] !== entry) {
                    return;
                }
                instances.forEach(function (instance, index) {
                    const node = createIntegratedSection(container, key, index);
                    const format = formatFor(wanted[key], definition);
                    renderIntegratedSection(node, instance.title, instance.items, format.shape, format.showTitle);
                });
                scheduleApply();
            }).catch(function (error) {
                entry.loading = false;
                console.warn('[CustomizedHome] section ' + key + ' failed', error);
            });
        });
    }

    function applyFormat(node, item) {
        const integrated = node.dataset.chKey ? INTEGRATED[node.dataset.chKey] : null;
        const shape = !integrated && item && item.Shape && item.Shape !== 'auto' ? item.Shape : null;
        const size = item && item.Size && item.Size !== 'normal' ? item.Size : null;
        ['portrait', 'landscape', 'square'].forEach(function (candidate) {
            setClass(node, 'ch-shape-' + candidate, shape === candidate);
        });
        ['small', 'large'].forEach(function (candidate) {
            setClass(node, 'ch-size-' + candidate, size === candidate);
        });
        setClass(node, 'ch-notitle', !integrated && !!item && item.ShowTitle === false);
        if (integrated && node._chItems) {
            const format = formatFor(item, integrated);
            if (node.dataset.chShape !== format.shape || (node.dataset.chShowTitle === '1') !== format.showTitle) {
                renderIntegratedSection(node, node.querySelector('.sectionTitle').textContent, node._chItems, format.shape, format.showTitle);
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* Section discovery                                                   */
    /* ------------------------------------------------------------------ */

    function findHomeContainer() {
        return document.querySelector('#homeTab .sections');
    }

    function isSectionElement(node) {
        return node.nodeType === 1 && node.classList.contains('verticalSection')
            && !node.classList.contains('ch-folder') && !node.classList.contains('ch-customize-bar')
            && node.id !== 'hssLoadingIndicator';
    }

    function sectionIndexClass(node) {
        const match = /(^|\s)section(\d+)(\s|$)/.exec(node.className || '');
        return match ? parseInt(match[2], 10) : -1;
    }

    function sectionTitle(node) {
        const heading = node.querySelector('h2.sectionTitle, h2, .sectionTitle');
        return heading ? heading.textContent.trim() : '';
    }

    function hssSectionId(node) {
        const classes = node.className.split(/\s+/);
        for (let i = 0; i < classes.length; i++) {
            if (classes[i] && !NON_ID_CLASS.test(classes[i])) {
                return classes[i];
            }
        }
        return null;
    }

    function libraryIdFromSection(node) {
        const link = node.querySelector('.sectionTitleContainer a[href], a.sectionTitleTextButton[href]');
        const href = link ? link.getAttribute('href') || '' : '';
        const match = /[?&](?:topParentId|parentId)=([^&#]+)/i.exec(href);
        return match ? decodeURIComponent(match[1]) : null;
    }

    function catalogLabels(ctx, key) {
        const catalog = (ctx && ctx.catalog) || [];
        for (let i = 0; i < catalog.length; i++) {
            if (catalog[i].Key === key) {
                const labels = catalog[i].Labels || {};
                return Object.keys(labels).map(function (lang) {
                    return labels[lang];
                });
            }
        }
        return [];
    }

    function typeFromTitle(node, title, ctx) {
        if (!title) {
            return null;
        }
        if (node.querySelector('.homeLibraryButtonContainer')) {
            return 'librarybuttons';
        }
        const types = ['smalllibrarytiles', 'resume', 'resumeaudio', 'resumebook', 'nextup', 'activerecordings', 'livetv'];
        for (let i = 0; i < types.length; i++) {
            if (catalogLabels(ctx, 'jf:' + types[i]).indexOf(title) >= 0) {
                return types[i];
            }
        }
        const templates = catalogLabels(ctx, 'jf:latestmedia');
        for (let i = 0; i < templates.length; i++) {
            const parts = templates[i].split('{0}');
            if (parts.length === 2 && title.indexOf(parts[0]) === 0 && title.length > parts[0].length
                && (parts[1] === '' || title.lastIndexOf(parts[1]) === title.length - parts[1].length)) {
                return 'latestmedia';
            }
        }
        return null;
    }

    function describeSection(node, wrapperType, index, subIndex, ctx) {
        const info = { el: node, key: null, label: sectionTitle(node), origin: 'other', family: null, instance: null, origOrder: 0 };

        if (node.dataset.chKey) {
            info.key = node.dataset.chKey;
            info.origin = 'customized';
            info.family = INTEGRATED[info.key] && INTEGRATED[info.key].family ? info.key : null;
            info.instance = info.key + ':' + node.dataset.chInstance;
            info.origOrder = parseInt(node.dataset.chInstance, 10) || 0;
            return info;
        }

        if (node.dataset.chOrigOrder === undefined) {
            const inline = parseInt(node.style.order, 10);
            node.dataset.chOrigOrder = String(isNaN(inline) ? index * 100 + (subIndex || 0) : inline);
        }
        info.origOrder = parseInt(node.dataset.chOrigOrder, 10) || 0;

        if (node.dataset.page !== undefined) {
            const id = hssSectionId(node);
            if (id) {
                const dash = id.indexOf('-');
                info.family = dash > 0 ? id.substring(0, dash) : id;
                info.instance = id;
                info.key = 'hss:' + info.family;
                info.origin = 'hss';
                return info;
            }
        }

        let type = wrapperType;
        if (!type && ctx && ctx.jfSections) {
            const idx = sectionIndexClass(node);
            if (idx >= 0 && ctx.jfSections[idx] && ctx.jfSections[idx] !== 'none') {
                type = ctx.jfSections[idx];
            }
        }
        if (!type) {
            type = typeFromTitle(node, info.label, ctx);
        }
        if (type === 'latestmedia') {
            const libraryId = libraryIdFromSection(node);
            info.key = 'jf:latestmedia:' + (libraryId || slug(info.label));
            info.origin = 'jellyfin';
            return info;
        }
        if (type) {
            info.key = 'jf:' + type;
            info.origin = 'jellyfin';
            return info;
        }

        info.key = info.label ? 'title:' + slug(info.label) : 'anon:' + index + ':' + (subIndex || 0);
        return info;
    }

    function collectSections(container, ctx) {
        const list = [];
        const children = container.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.nodeType !== 1 || child.classList.contains('ch-folder') || child.classList.contains('ch-customize-bar') || child.id === 'hssLoadingIndicator') {
                continue;
            }
            if (isSectionElement(child)) {
                if (child.children.length > 0) {
                    list.push(describeSection(child, null, i, 0, ctx));
                }
                continue;
            }
            const idx = sectionIndexClass(child);
            if (idx >= 0) {
                const grandChildren = child.children;
                let hasSections = false;
                for (let j = 0; j < grandChildren.length; j++) {
                    if (isSectionElement(grandChildren[j])) {
                        hasSections = true;
                        break;
                    }
                }
                if (!hasSections) {
                    continue;
                }
                setClass(child, 'ch-wrapper', true);
                const wrapperType = ctx && ctx.jfSections && ctx.jfSections[idx] !== 'none' ? ctx.jfSections[idx] : null;
                for (let j = 0; j < grandChildren.length; j++) {
                    if (isSectionElement(grandChildren[j]) && grandChildren[j].children.length > 0) {
                        list.push(describeSection(grandChildren[j], wrapperType, i, j, ctx));
                    }
                }
            }
        }
        return list;
    }

    /* ------------------------------------------------------------------ */
    /* Layout application                                                  */
    /* ------------------------------------------------------------------ */

    function isFolderCollapsed(item) {
        if (state.response && state.response.FoldersCollapsible) {
            const stored = storageGet('folder-' + item.Id);
            if (stored === '1') {
                return true;
            }
            if (stored === '0') {
                return false;
            }
        }
        return !!item.Collapsed;
    }

    function ensureFolderHeader(container, item, existing) {
        let header = existing[item.Id];
        if (!header) {
            header = el('div', 'verticalSection ch-folder');
            header.dataset.chFolderId = item.Id;
            header.innerHTML = '<button type="button" class="ch-folder-header padded-left">'
                + '<span class="material-icons ch-folder-icon" aria-hidden="true"></span>'
                + '<h2 class="sectionTitle sectionTitle-cards ch-folder-title"></h2>'
                + '<span class="ch-folder-count"></span>'
                + '<span class="material-icons ch-folder-chevron" aria-hidden="true">expand_more</span>'
                + '</button>';
            header.querySelector('.ch-folder-header').addEventListener('click', function () {
                if (!state.response || !state.response.FoldersCollapsible) {
                    return;
                }
                const collapsed = header.classList.contains('ch-folder-collapsed');
                storageSet('folder-' + item.Id, collapsed ? '0' : '1');
                scheduleApply();
            });
            container.appendChild(header);
            existing[item.Id] = header;
        }
        return header;
    }

    function updateFolderHeader(header, item, collapsed, visibleMembers) {
        const icon = header.querySelector('.ch-folder-icon');
        const iconName = item.Icon || 'folder';
        if (icon.textContent !== iconName) {
            icon.textContent = iconName;
        }
        const name = header.querySelector('.ch-folder-title');
        if (name.textContent !== (item.Name || '')) {
            name.textContent = item.Name || '';
        }
        const count = header.querySelector('.ch-folder-count');
        const countText = collapsed ? t('sectionsCount', visibleMembers) : '';
        if (count.textContent !== countText) {
            count.textContent = countText;
        }
        const button = header.querySelector('.ch-folder-header');
        const collapsible = !!(state.response && state.response.FoldersCollapsible);
        if (button.disabled === collapsible) {
            button.disabled = !collapsible;
        }
        button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        setClass(header, 'ch-folder-collapsed', collapsed);
        setClass(header.querySelector('.ch-folder-chevron'), 'ch-hidden', !collapsible);
    }

    function ensureCustomizeBar(container) {
        let bar = container.querySelector(':scope > .ch-customize-bar');
        const wanted = !!(state.response && state.response.CanCustomize && state.response.ShowCustomizeButtonOnHome);
        if (!wanted) {
            if (bar) {
                bar.remove();
            }
            return;
        }
        if (!bar) {
            bar = el('div', 'ch-customize-bar');
            bar.innerHTML = '<button type="button" class="ch-customize-button"><span class="material-icons" aria-hidden="true">other_houses</span><span></span></button>';
            bar.querySelector('button').addEventListener('click', function () {
                openEditor({ mode: 'user' });
            });
            container.appendChild(bar);
        }
        const label = bar.querySelector('button span:last-child');
        if (label.textContent !== t('customize')) {
            label.textContent = t('customize');
        }
        setOrder(bar, ORDER_TAIL);
    }

    function observeSectionNodes(container) {
        const observer = state.containerObserver;
        if (!observer) {
            return;
        }
        const nodes = [];
        const children = container.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.nodeType !== 1 || child.classList.contains('ch-folder') || child.classList.contains('ch-customize-bar')) {
                continue;
            }
            nodes.push(child);
            if (child.classList.contains('ch-wrapper') || (!child.classList.contains('verticalSection') && sectionIndexClass(child) >= 0)) {
                for (let j = 0; j < child.children.length; j++) {
                    nodes.push(child.children[j]);
                }
            }
        }
        nodes.forEach(function (node) {
            if (state.observedNodes.indexOf(node) < 0) {
                // Content arrival (childList) and visibility changes ("hide" class) both require a new pass.
                observer.observe(node, { childList: true, attributes: true, attributeFilter: ['class'] });
                state.observedNodes.push(node);
            }
        });
        state.observedNodes = state.observedNodes.filter(function (node) {
            return node.isConnected;
        });
    }

    function applyLayout() {
        const container = state.container;
        if (!container || !container.isConnected || !state.ctx) {
            return;
        }
        const ctx = state.ctx;
        ctx.hss = !!container.querySelector(':scope > [data-page]');
        setClass(container, 'ch-container', true);

        const layout = state.layout || { Items: [], HideUnlisted: false };
        syncIntegratedSections(container, wantedIntegrated(layout));

        const sections = collectSections(container, ctx);
        state.discovered = sections;
        observeSectionNodes(container);

        const byKey = {};
        sections.forEach(function (section) {
            (byKey[section.key] = byKey[section.key] || []).push(section);
        });
        Object.keys(byKey).forEach(function (key) {
            byKey[key].sort(function (a, b) {
                return a.origOrder - b.origOrder;
            });
        });

        const items = layout.Items || [];
        const existingFolders = {};
        const folderNodes = container.querySelectorAll(':scope > .ch-folder');
        for (let i = 0; i < folderNodes.length; i++) {
            existingFolders[folderNodes[i].dataset.chFolderId] = folderNodes[i];
        }

        let order = ORDER_STEP;
        const used = {};

        function place(item, visible, folder, collapsed) {
            const key = item.Key;
            used[key] = true;
            const group = byKey[key];
            if (!group) {
                return 0;
            }
            let shown = 0;
            group.forEach(function (section, i) {
                const node = section.el;
                setOrder(node, order + i);
                applyFormat(node, item);
                setClass(node, 'ch-hidden', !visible || (!!folder && collapsed));
                setClass(node, 'ch-in-folder', !!folder);
                if (folder) {
                    if (node.dataset.chFolder !== folder.Id) {
                        node.dataset.chFolder = folder.Id;
                    }
                } else if (node.dataset.chFolder !== undefined) {
                    delete node.dataset.chFolder;
                }
                if (visible && !node.classList.contains('hide')) {
                    shown++;
                }
            });
            order += ORDER_STEP;
            return shown;
        }

        const keptFolders = {};
        items.forEach(function (item) {
            if (item.Type === 'folder') {
                if (!item.Id) {
                    return;
                }
                keptFolders[item.Id] = true;
                const collapsed = isFolderCollapsed(item);
                const header = ensureFolderHeader(container, item, existingFolders);
                setOrder(header, order);
                order += ORDER_STEP;
                let visibleMembers = 0;
                (item.Items || []).forEach(function (member) {
                    if (member.Type === 'folder' || !member.Key) {
                        return;
                    }
                    visibleMembers += place(member, item.Visible !== false && member.Visible !== false, item, collapsed);
                });
                updateFolderHeader(header, item, collapsed, visibleMembers);
                setClass(header, 'ch-hidden', item.Visible === false || visibleMembers === 0);
            } else if (item.Key) {
                place(item, item.Visible !== false, null, false);
            }
        });

        Object.keys(existingFolders).forEach(function (id) {
            if (!keptFolders[id]) {
                existingFolders[id].remove();
            }
        });

        sections.forEach(function (section) {
            if (used[section.key]) {
                return;
            }
            setOrder(section.el, ORDER_UNLISTED_BASE + section.origOrder);
            applyFormat(section.el, null);
            setClass(section.el, 'ch-hidden', items.length > 0);
            setClass(section.el, 'ch-in-folder', false);
            if (section.el.dataset.chFolder !== undefined) {
                delete section.el.dataset.chFolder;
            }
        });

        ensureCustomizeBar(container);
    }

    function scheduleApply() {
        if (state.applyScheduled) {
            return;
        }
        state.applyScheduled = true;
        requestAnimationFrame(function () {
            state.applyScheduled = false;
            if (!state.container || !state.container.isConnected) {
                return;
            }
            if (!state.response) {
                ensureLoaded().then(scheduleApply).catch(function () { /* logged already */ });
                return;
            }
            if (state.ctxStale) {
                state.ctxStale = false;
                loadJfSections().then(function (sections) {
                    if (sections) {
                        state.ctx.jfSections = sections;
                    }
                    applyLayout();
                });
                return;
            }
            applyLayout();
        });
    }

    /* ------------------------------------------------------------------ */
    /* Observers                                                           */
    /* ------------------------------------------------------------------ */

    function attachContainer(container) {
        if (state.containerObserver) {
            state.containerObserver.disconnect();
            state.containerObserver = null;
            state.observedNodes = [];
        }
        state.container = container;
        if (!container) {
            return;
        }
        state.containerObserver = new MutationObserver(function (mutations) {
            let relevant = false;
            for (let i = 0; i < mutations.length; i++) {
                const mutation = mutations[i];
                if (mutation.type === 'childList') {
                    relevant = true;
                    if (mutation.target === container) {
                        for (let j = 0; j < mutation.addedNodes.length; j++) {
                            const node = mutation.addedNodes[j];
                            if (node.nodeType === 1 && sectionIndexClass(node) >= 0 && node.dataset.page === undefined) {
                                // The built-in home was re-rendered: the user may have changed their home settings.
                                state.ctxStale = true;
                            }
                        }
                    }
                } else if (mutation.type === 'attributes') {
                    relevant = true;
                }
                if (relevant) {
                    break;
                }
            }
            if (relevant) {
                scheduleApply();
            }
        });
        state.containerObserver.observe(container, { childList: true });
        scheduleApply();
    }

    function scan() {
        const container = findHomeContainer();
        if (container !== state.container) {
            attachContainer(container);
        }
        if (!state.response && !state.loadPromise && currentUserId()) {
            // Logged in on another page: load the options so the user menu entry is available everywhere.
            ensureLoaded().then(injectMenuEntries).catch(function () { /* logged already */ });
        }
        injectMenuEntries();
    }

    function scheduleScan() {
        if (state.scanScheduled) {
            return;
        }
        state.scanScheduled = true;
        requestAnimationFrame(function () {
            state.scanScheduled = false;
            scan();
        });
    }

    /* ------------------------------------------------------------------ */
    /* User menu entries                                                   */
    /* ------------------------------------------------------------------ */

    function injectMenuEntries() {
        if (!state.response || !state.response.ShowUserMenuEntry || !state.response.CanCustomize) {
            return;
        }

        const menu = document.getElementById('app-user-menu');
        if (menu && !menu.querySelector('.ch-menu-entry')) {
            const settings = menu.querySelector('a[href="#/mypreferencesmenu"], a[href$="/mypreferencesmenu"]');
            if (settings) {
                const entry = settings.cloneNode(true);
                entry.classList.add('ch-menu-entry');
                entry.removeAttribute('href');
                entry.setAttribute('role', 'menuitem');
                const svg = entry.querySelector('svg');
                if (svg) {
                    const icon = el('span', 'material-icons', 'other_houses');
                    icon.setAttribute('aria-hidden', 'true');
                    svg.parentNode.replaceChild(icon, svg);
                }
                const textNode = entry.querySelector('.MuiListItemText-primary') || entry.querySelector('.MuiListItemText-root') || entry;
                textNode.textContent = t('menuEntry');
                entry.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const backdrop = menu.querySelector('.MuiBackdrop-root');
                    if (backdrop) {
                        backdrop.click();
                    }
                    setTimeout(function () {
                        openEditor({ mode: 'user' });
                    }, 50);
                });
                settings.parentNode.insertBefore(entry, settings.nextSibling);
            }
        }

        const drawer = document.querySelector('.mainDrawer-scrollContainer .userMenuOptions');
        if (drawer && !drawer.querySelector('.ch-menu-entry')) {
            const link = el('a', 'lnkMediaFolder navMenuOption ch-menu-entry');
            link.setAttribute('is', 'emby-linkbutton');
            link.setAttribute('href', '#');
            link.innerHTML = '<span class="material-icons navMenuOptionIcon other_houses" aria-hidden="true"></span><span class="sectionName navMenuOptionText"></span>';
            link.querySelector('.navMenuOptionText').textContent = t('menuEntry');
            link.addEventListener('click', function (e) {
                e.preventDefault();
                openEditor({ mode: 'user' });
            });
            drawer.appendChild(link);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Editor                                                              */
    /* ------------------------------------------------------------------ */

    let editor = null;

    function cloneLayout(layout) {
        return JSON.parse(JSON.stringify(layout || { Items: [] }));
    }

    function catalogLabel(definition, lang) {
        if (!definition) {
            return null;
        }
        const labels = definition.Labels || {};
        return labels[lang] || labels[lang.split('-')[0]] || labels.en || null;
    }

    function familyLabel(label) {
        return label ? label.replace('{0}', '…') : label;
    }

    function buildKnown(catalog, userViews, mode) {
        const lang = getLanguage();
        const known = {};
        const byKey = {};
        catalog.forEach(function (definition) {
            byKey[definition.Key] = definition;
        });

        function add(key, label, origin, present, isFamily) {
            if (!key) {
                return;
            }
            const entry = known[key] || (known[key] = { key: key, label: '', origin: origin || 'other', present: false, family: false });
            if (label && (!entry.label || present)) {
                entry.label = label;
            }
            entry.present = entry.present || !!present;
            entry.family = entry.family || !!isFamily;
            if (origin && entry.origin === 'other') {
                entry.origin = origin;
            }
        }

        const hssActive = !!(state.ctx && state.ctx.hss) || (state.discovered || []).some(function (s) {
            return s.origin === 'hss';
        });

        // Sections visible on the home page right now.
        (state.discovered || []).forEach(function (section) {
            const definition = byKey[section.key];
            const label = definition && definition.IsFamily ? familyLabel(catalogLabel(definition, lang)) : section.label;
            add(section.key, label || section.label || section.key, section.origin, true, definition && definition.IsFamily);
        });

        // Catalog entries relevant to the current setup.
        catalog.forEach(function (definition) {
            let relevant = mode === 'default' || (definition.Origin === 'hss' ? hssActive : !hssActive);
            if (definition.Origin === 'customized') {
                relevant = !!(state.response && state.response.EnableIntegratedSections);
            }
            if (!relevant) {
                return;
            }
            if (definition.Key === 'jf:latestmedia') {
                (userViews || []).forEach(function (view) {
                    const excluded = ['playlists', 'livetv', 'boxsets', 'channels', 'folders'];
                    if (view.CollectionType && excluded.indexOf(view.CollectionType) >= 0) {
                        return;
                    }
                    const template = catalogLabel(definition, lang) || '{0}';
                    add('jf:latestmedia:' + view.Id, template.replace('{0}', view.Name), 'jellyfin', false, false);
                });
                return;
            }
            add(definition.Key, familyLabel(catalogLabel(definition, lang)), definition.Origin, false, definition.IsFamily);
        });

        return { known: known, byKey: byKey, hssActive: hssActive };
    }

    function openEditor(options) {
        options = options || {};
        if (editor) {
            if (editor.embedded && options.container) {
                closeEditor();
            } else {
                return;
            }
        }
        const mode = options.mode === 'default' ? 'default' : 'user';
        ensureLoaded().then(function () {
            if (mode === 'user' && !state.response.CanCustomize) {
                toast(t('notAllowed'));
                return null;
            }
            const layoutPromise = mode === 'default' ? apiGet('DefaultLayout') : Promise.resolve(state.layout);
            return Promise.all([loadCatalog(), loadUserViews(), layoutPromise]).then(function (results) {
                buildEditor(mode, results[0] || [], results[1] || [], results[2] || { Items: [] }, options);
            });
        }).catch(function (error) {
            console.error('[CustomizedHome] editor error', error);
            toast(t('loadError'));
        });
    }

    function buildEditor(mode, catalog, userViews, layout, options) {
        const info = buildKnown(catalog, userViews, mode);
        const model = cloneLayout(layout);
        model.Items = (model.Items || []).filter(function (item) {
            return item && (item.Type === 'folder' ? !!item.Id : !!item.Key);
        });
        model.Items.forEach(function (item) {
            if (item.Type === 'folder') {
                item.Items = (item.Items || []).filter(function (member) {
                    return member && member.Type !== 'folder' && !!member.Key;
                });
            }
        });

        // Keys already in the layout: catalog label first, then the label stored with the layout.
        const lang = getLanguage();
        function registerLayoutKeys(items) {
            items.forEach(function (item) {
                if (item.Type === 'folder') {
                    registerLayoutKeys(item.Items || []);
                } else if (item.Key && !info.known[item.Key]) {
                    const definition = info.byKey[item.Key];
                    info.known[item.Key] = {
                        key: item.Key,
                        label: (definition ? familyLabel(catalogLabel(definition, lang)) : null) || item.Label || item.Key,
                        origin: definition ? definition.Origin : 'other',
                        present: false,
                        family: !!(definition && definition.IsFamily)
                    };
                }
            });
        }
        registerLayoutKeys(model.Items);

        const embedded = !!(options.container && options.container.isConnected);
        editor = {
            mode: mode,
            model: model,
            known: info.known,
            showAll: mode === 'default',
            query: '',
            embedded: embedded,
            options: options,
            overlay: null,
            list: null,
            body: null
        };

        const overlay = el('div', embedded ? 'ch-embedded' : 'ch-overlay');
        const dialog = el('div', 'ch-dialog');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.tabIndex = -1;
        dialog.innerHTML = '<div class="ch-dialog-header">'
            + '<span class="material-icons" aria-hidden="true">other_houses</span>'
            + '<h2 class="ch-dialog-title"></h2>'
            + '<button type="button" class="ch-icon-btn ch-close" title="' + escapeHtml(t('close')) + '"><span class="material-icons" aria-hidden="true">close</span></button>'
            + '</div>'
            + '<div class="ch-dialog-body">'
            + '<p class="ch-hint"></p>'
            + '<div class="ch-toolbar">'
            + '<div class="ch-search-box"><span class="material-icons" aria-hidden="true">search</span><input type="search" class="ch-search" autocomplete="off" /></div>'
            + '<label><input type="checkbox" class="ch-show-all" /> <span></span></label>'
            + '<button type="button" class="ch-btn ch-btn-primary ch-save ch-save-top"></button>'
            + '</div>'
            + '<div class="ch-columns">'
            + '<div class="ch-col ch-col-layout"><h3 class="ch-col-title"></h3><div class="ch-list"></div></div>'
            + '<div class="ch-col ch-col-unlisted"><h3 class="ch-col-title"></h3><div class="ch-unlisted"></div></div>'
            + '</div>'
            + '</div>'
            + '<div class="ch-dialog-footer">'
            + '<button type="button" class="ch-btn ch-btn-danger ch-reset"></button>'
            + '<span style="flex:1"></span>'
            + '<button type="button" class="ch-btn ch-cancel"></button>'
            + '<button type="button" class="ch-btn ch-btn-primary ch-save"></button>'
            + '</div>';
        overlay.appendChild(dialog);
        (embedded ? options.container : document.body).appendChild(overlay);
        if (embedded) {
            dialog.querySelector('.ch-close').style.display = 'none';
        }

        editor.overlay = overlay;
        editor.list = dialog.querySelector('.ch-list');
        editor.unlisted = dialog.querySelector('.ch-unlisted');
        editor.columns = dialog.querySelector('.ch-columns');
        dialog.querySelector('.ch-col-layout .ch-col-title').textContent = t('colLayout');
        dialog.querySelector('.ch-col-unlisted .ch-col-title').textContent = t('colUnlisted');
        if (!embedded) {
            dialog.querySelector('.ch-save-top').style.display = 'none';
        }
        editor.body = dialog.querySelector('.ch-dialog-body');

        dialog.querySelector('.ch-dialog-title').textContent = mode === 'default' ? t('defaultTitle') : t('editorTitle');
        dialog.querySelector('.ch-hint').textContent = t('hint');
        dialog.querySelector('.ch-search').placeholder = t('search');
        dialog.querySelector('.ch-show-all').checked = editor.showAll;
        dialog.querySelector('.ch-show-all').nextElementSibling.textContent = t('showAll');
        dialog.querySelector('.ch-cancel').textContent = t('cancel');
        Array.prototype.forEach.call(dialog.querySelectorAll('.ch-save'), function (button) {
            button.textContent = t('save');
            button.addEventListener('click', saveEditor);
        });
        const resetButton = dialog.querySelector('.ch-reset');
        resetButton.textContent = t('reset');
        if (mode !== 'user' || !state.response.HasUserLayout) {
            resetButton.style.display = 'none';
        }

        dialog.querySelector('.ch-close').addEventListener('click', closeEditor);
        dialog.querySelector('.ch-cancel').addEventListener('click', function () {
            if (embedded) {
                // Embedded editor: cancel reloads the stored layout.
                closeEditor();
                openEditor(options);
            } else {
                closeEditor();
            }
        });
        resetButton.addEventListener('click', resetEditor);
        dialog.querySelector('.ch-search').addEventListener('input', function (e) {
            editor.query = e.target.value.trim().toLowerCase();
            renderEditor();
        });
        dialog.querySelector('.ch-show-all').addEventListener('change', function (e) {
            editor.showAll = e.target.checked;
            renderEditor();
        });
        if (!embedded) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) {
                    closeEditor();
                }
            });
            overlay.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') {
                    e.stopPropagation();
                    closeEditor();
                }
            });
        }
        editor.columns.addEventListener('click', onListClick);
        editor.list.addEventListener('input', onListInput);
        initDrag(editor.columns, editor.list, editor.unlisted);

        renderEditor();
        if (!embedded) {
            dialog.focus();
        }
    }

    function newId() {
        return 'f' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    }

    function closeEditor() {
        if (!editor) {
            return;
        }
        closePopup();
        editor.overlay.remove();
        editor = null;
    }

    function usedKeys(model) {
        const keys = {};
        model.Items.forEach(function (item) {
            if (item.Type === 'folder') {
                (item.Items || []).forEach(function (member) {
                    keys[member.Key] = true;
                });
            } else {
                keys[item.Key] = true;
            }
        });
        return keys;
    }

    function unlistedEntries() {
        const used = usedKeys(editor.model);
        return Object.keys(editor.known).map(function (key) {
            return editor.known[key];
        }).filter(function (entry) {
            return !used[entry.key] && (editor.showAll || editor.query || entry.present);
        }).sort(function (a, b) {
            return a.label.localeCompare(b.label);
        });
    }

    function originLabel(origin) {
        if (origin === 'jellyfin') {
            return t('originJellyfin');
        }
        if (origin === 'hss') {
            return t('originHss');
        }
        if (origin === 'customized') {
            return t('originCustomized');
        }
        return t('originOther');
    }

    function renderSectionRow(item, parent, index, siblings) {
        const entry = editor.known[item.Key] || { label: item.Label || item.Key, origin: 'other', present: false, family: false };
        const row = el('div', 'ch-row' + (parent ? ' ch-row-child' : '') + (item.Visible === false ? ' ch-row-hidden' : '') + (entry.present ? '' : ' ch-row-absent'));
        row._item = item;
        row._parent = parent;
        const subtitle = [originLabel(entry.origin)];
        if (entry.family) {
            subtitle.push(t('family'));
        }
        // The administration editor has no home page under it: "not displayed right now" would be noise there.
        if (!entry.present && entry.origin !== 'customized' && editor.mode !== 'default') {
            subtitle.push(t('absent'));
        }
        const badge = formatBadge(item);
        row.innerHTML = '<span class="material-icons ch-handle" aria-hidden="true">drag_indicator</span>'
            + '<span class="material-icons ch-row-icon" aria-hidden="true">' + (entry.origin === 'hss' ? 'view_carousel' : (entry.origin === 'customized' ? 'auto_awesome' : 'view_stream')) + '</span>'
            + '<div class="ch-row-text"><div class="ch-row-title"></div><div class="ch-row-sub"></div></div>'
            + (badge ? '<span class="ch-row-format"></span>' : '')
            + '<div class="ch-row-actions">' + rowActionsHtml(item) + '</div>';
        row.querySelector('.ch-row-title').textContent = entry.label || item.Key;
        row.querySelector('.ch-row-sub').textContent = subtitle.join(' · ');
        if (badge) {
            row.querySelector('.ch-row-format').textContent = badge;
        }
        return row;
    }

    function actionButton(className, title, icon) {
        return '<button type="button" class="ch-icon-btn ' + className + '" title="' + escapeHtml(title) + '"><span class="material-icons" aria-hidden="true">' + icon + '</span></button>';
    }

    function rowActionsHtml(item) {
        if (item._unlisted) {
            // Right column: the only action is to add the section (it lands at the very top).
            return actionButton('ch-act-add', t('addToLayout'), 'add_circle_outline');
        }
        return (editor.query ? actionButton('ch-act-top', t('moveToTop'), 'vertical_align_top') : '')
            + actionButton('ch-act-visibility', item.Visible === false ? t('show') : t('hide'), item.Visible === false ? 'visibility_off' : 'visibility')
            + actionButton('ch-act-menu', t('format'), 'aspect_ratio')
            + actionButton('ch-act-remove', t('removeAction'), 'close');
    }

    function formatBadge(item) {
        const parts = [];
        if (item.Shape && item.Shape !== 'auto') {
            parts.push(t('shape' + item.Shape.charAt(0).toUpperCase() + item.Shape.slice(1)));
        }
        if (item.Size && item.Size !== 'normal') {
            parts.push(t('size' + item.Size.charAt(0).toUpperCase() + item.Size.slice(1)));
        }
        if (item.ShowTitle === false) {
            parts.push(t('noTitles'));
        }
        if (item.Key === 'ch:genre' && item.Genres && item.Genres.length) {
            parts.push(t('genresCount', item.Genres.length));
        }
        return parts.join(' · ');
    }

    function openFormatMenu(anchor, item) {
        const menu = el('div');
        function group(label) {
            const node = el('div', 'ch-popup-label');
            node.textContent = label;
            menu.appendChild(node);
        }
        function option(icon, label, selected, handler) {
            const button = el('button', '', '<span class="material-icons" aria-hidden="true">' + (selected ? 'radio_button_checked' : icon) + '</span><span></span>');
            button.type = 'button';
            button.querySelector('span:last-child').textContent = label;
            button.addEventListener('click', function () {
                closePopup();
                materialize(item);
                handler();
                renderEditor();
            });
            menu.appendChild(button);
        }
        const shape = item.Shape || 'auto';
        const size = item.Size || 'normal';
        group(t('shape'));
        [['auto', 'shapeAuto', 'tune'], ['portrait', 'shapePortrait', 'crop_portrait'], ['landscape', 'shapeLandscape', 'crop_landscape'], ['square', 'shapeSquare', 'crop_square']].forEach(function (choice) {
            option(choice[2], t(choice[1]), shape === choice[0], function () {
                item.Shape = choice[0];
            });
        });
        menu.appendChild(el('div', 'ch-popup-sep'));
        group(t('size'));
        [['small', 'sizeSmall', 'photo_size_select_small'], ['normal', 'sizeNormal', 'photo_size_select_actual'], ['large', 'sizeLarge', 'photo_size_select_large']].forEach(function (choice) {
            option(choice[2], t(choice[1]), size === choice[0], function () {
                item.Size = choice[0];
            });
        });
        menu.appendChild(el('div', 'ch-popup-sep'));
        option(item.ShowTitle === false ? 'check_box_outline_blank' : 'check_box', t('showTitles'), false, function () {
            item.ShowTitle = item.ShowTitle === false;
        });
        if (item.Key === 'ch:genre') {
            menu.appendChild(el('div', 'ch-popup-sep'));
            group(t('genres') + ' · ' + (item.Genres && item.Genres.length ? t('genresCount', item.Genres.length) : t('genresAuto')));
            const choose = el('button', 'ch-act-genres', '<span class="material-icons" aria-hidden="true">category</span><span></span>');
            choose.type = 'button';
            choose.querySelector('span:last-child').textContent = t('chooseGenres');
            choose.addEventListener('click', function () {
                closePopup();
                openGenrePicker(anchor, item);
            });
            menu.appendChild(choose);
        }
        showPopup(anchor, menu);
    }

    function openGenrePicker(anchor, item) {
        const picker = el('div', 'ch-genre-picker');
        const status = el('div', 'ch-popup-label');
        status.textContent = t('genresLoading');
        picker.appendChild(status);
        showPopup(anchor, picker);
        const opened = popup;

        fetchGenreList().then(function (genres) {
            if (popup !== opened) {
                return;
            }
            if (!genres.length) {
                status.textContent = t('genresNone');
                return;
            }
            item.Genres = item.Genres || [];
            function refreshStatus() {
                status.textContent = item.Genres.length ? t('genresCount', item.Genres.length) : t('genresAuto');
            }
            refreshStatus();
            genres.forEach(function (genre) {
                const label = el('label', 'ch-genre-option');
                const input = el('input');
                input.type = 'checkbox';
                input.checked = item.Genres.indexOf(genre.Name) >= 0;
                const text = el('span');
                text.textContent = genre.Name;
                label.appendChild(input);
                label.appendChild(text);
                input.addEventListener('change', function () {
                    const index = item.Genres.indexOf(genre.Name);
                    if (input.checked && index < 0) {
                        item.Genres.push(genre.Name);
                    } else if (!input.checked && index >= 0) {
                        item.Genres.splice(index, 1);
                    }
                    refreshStatus();
                    renderEditor();
                });
                picker.appendChild(label);
            });
        }).catch(function () {
            status.textContent = t('genresNone');
        });
    }

    function renderFolderRow(item, index, siblings) {
        const row = el('div', 'ch-row ch-row-folder' + (item.Visible === false ? ' ch-row-hidden' : ''));
        row._item = item;
        row._parent = null;
        row.innerHTML = '<span class="material-icons ch-handle" aria-hidden="true">drag_indicator</span>'
            + '<button type="button" class="ch-icon-btn ch-act-icon" title="' + escapeHtml(t('chooseIcon')) + '"><span class="material-icons" aria-hidden="true">' + escapeHtml(item.Icon || 'folder') + '</span></button>'
            + '<input type="text" class="ch-folder-name" maxlength="100" placeholder="' + escapeHtml(t('folderName')) + '" />'
            + '<div class="ch-row-actions">'
            + '<button type="button" class="ch-icon-btn ch-act-visibility" title="' + escapeHtml(item.Visible === false ? t('show') : t('hide')) + '"><span class="material-icons" aria-hidden="true">' + (item.Visible === false ? 'visibility_off' : 'visibility') + '</span></button>'
            + '<button type="button" class="ch-icon-btn ch-act-menu" title="' + escapeHtml(t('more')) + '"><span class="material-icons" aria-hidden="true">more_vert</span></button>'
            + '</div>';
        row.querySelector('.ch-folder-name').value = item.Name || '';
        return row;
    }

    function matchesQuery(item) {
        if (!editor.query) {
            return true;
        }
        const entry = editor.known[item.Key] || {};
        const haystack = ((entry.label || '') + ' ' + (item.Label || '') + ' ' + (item.Key || '') + ' ' + (item.Name || '')).toLowerCase();
        return haystack.indexOf(editor.query) >= 0;
    }

    function renderEditor() {
        if (!editor) {
            return;
        }
        const list = editor.list;
        const side = editor.unlisted;
        const scrollTop = editor.body.scrollTop;
        list.innerHTML = '';
        side.innerHTML = '';
        const model = editor.model;
        setClass(editor.columns, 'ch-filtered', !!editor.query);

        model.Items.forEach(function (item, index) {
            if (item.Type === 'folder') {
                const members = (item.Items || []).filter(matchesQuery);
                if (!members.length && !matchesQuery(item)) {
                    return;
                }
                list.appendChild(renderFolderRow(item, index, model.Items));
                members.forEach(function (member, memberIndex) {
                    list.appendChild(renderSectionRow(member, item, memberIndex, item.Items));
                });
            } else if (matchesQuery(item)) {
                list.appendChild(renderSectionRow(item, null, index, model.Items));
            }
        });

        const unlisted = unlistedEntries().filter(function (entry) {
            return matchesQuery({ Key: entry.key, Label: entry.label });
        });
        unlisted.forEach(function (entry) {
            const item = { Type: 'section', Key: entry.key, Label: entry.label, Visible: true, _unlisted: true };
            const row = renderSectionRow(item, null, -1, []);
            row.classList.add('ch-row-unlisted');
            side.appendChild(row);
        });

        if (!list.children.length) {
            list.appendChild(el('div', 'ch-empty', escapeHtml(editor.query ? t('searchNoResult') : t('layoutEmpty'))));
        }
        if (!side.children.length) {
            side.appendChild(el('div', 'ch-empty', escapeHtml(editor.query ? t('searchNoResult') : t('dropToRemove'))));
        }
        editor.body.scrollTop = scrollTop;
    }

    function materialize(item) {
        // An unlisted row that gets edited becomes part of the layout (appended at the end).
        if (item._unlisted) {
            delete item._unlisted;
            editor.model.Items.push(item);
        }
    }

    function removeItem(item) {
        const model = editor.model;
        let index = model.Items.indexOf(item);
        if (index >= 0) {
            model.Items.splice(index, 1);
            return;
        }
        for (let i = 0; i < model.Items.length; i++) {
            const folder = model.Items[i];
            if (folder.Type === 'folder') {
                index = folder.Items.indexOf(item);
                if (index >= 0) {
                    folder.Items.splice(index, 1);
                    return;
                }
            }
        }
    }

    function insertItem(item, target) {
        // target: { folder: folderItem|null, before: item|null }
        const array = target.folder ? target.folder.Items : editor.model.Items;
        let index = target.before ? array.indexOf(target.before) : -1;
        if (index < 0) {
            index = array.length;
        }
        array.splice(index, 0, item);
    }

    function moveItem(item, target) {
        if (item.Type === 'folder' && target.folder) {
            return;
        }
        materialize(item);
        removeItem(item);
        insertItem(item, target);
        renderEditor();
    }

    function onListInput(e) {
        const input = e.target.closest('.ch-folder-name');
        if (!input) {
            return;
        }
        const row = input.closest('.ch-row');
        if (row && row._item) {
            row._item.Name = input.value;
        }
    }

    function onListClick(e) {
        const button = e.target.closest('button');
        if (!button) {
            return;
        }
        const row = button.closest('.ch-row');
        if (!row || !row._item) {
            return;
        }
        const item = row._item;
        const parent = row._parent;

        if (button.classList.contains('ch-act-visibility')) {
            materialize(item);
            item.Visible = item.Visible === false;
            renderEditor();
        } else if (button.classList.contains('ch-act-top')) {
            materialize(item);
            removeItem(item);
            item.Visible = true;
            editor.model.Items.unshift(item);
            renderEditor();
        } else if (button.classList.contains('ch-act-add')) {
            delete item._unlisted;
            item.Visible = true;
            editor.model.Items.unshift(item);
            renderEditor();
        } else if (button.classList.contains('ch-act-remove')) {
            removeItem(item);
            renderEditor();
        } else if (button.classList.contains('ch-act-menu')) {
            if (item.Type === 'folder') {
                openRowMenu(button, item, parent);
            } else {
                openFormatMenu(button, item);
            }
        } else if (button.classList.contains('ch-act-icon')) {
            openIconPicker(button, item);
        }
    }

    /* ---- popup menus ---- */

    let popup = null;

    function closePopup() {
        if (popup) {
            popup.remove();
            popup = null;
            document.removeEventListener('pointerdown', onDocumentPointerDown, true);
        }
    }

    function onDocumentPointerDown(e) {
        if (popup && !popup.contains(e.target)) {
            closePopup();
        }
    }

    function showPopup(anchor, node) {
        closePopup();
        popup = node;
        popup.classList.add('ch-popup');
        document.body.appendChild(popup);
        const rect = anchor.getBoundingClientRect();
        const width = popup.offsetWidth;
        const height = popup.offsetHeight;
        let left = rect.right - width;
        let top = rect.bottom + 4;
        if (left < 8) {
            left = 8;
        }
        if (top + height > window.innerHeight - 8) {
            top = Math.max(8, rect.top - height - 4);
        }
        popup.style.left = left + 'px';
        popup.style.top = top + 'px';
        setTimeout(function () {
            document.addEventListener('pointerdown', onDocumentPointerDown, true);
        }, 0);
    }

    function openRowMenu(anchor, item, parent) {
        const menu = el('div');
        const folders = editor.model.Items.filter(function (candidate) {
            return candidate.Type === 'folder';
        });

        function addAction(icon, label, handler) {
            const button = el('button', '', '<span class="material-icons" aria-hidden="true">' + icon + '</span><span></span>');
            button.type = 'button';
            button.querySelector('span:last-child').textContent = label;
            button.addEventListener('click', function () {
                closePopup();
                handler();
            });
            menu.appendChild(button);
        }

        if (item.Type === 'folder') {
            addAction(item.Collapsed ? 'check_box' : 'check_box_outline_blank', t('collapsedByDefault'), function () {
                item.Collapsed = !item.Collapsed;
                renderEditor();
            });
            addAction('delete', t('deleteFolder'), function () {
                const index = editor.model.Items.indexOf(item);
                if (index >= 0) {
                    const members = item.Items || [];
                    editor.model.Items.splice(index, 1);
                    members.forEach(function (member, i) {
                        editor.model.Items.splice(index + i, 0, member);
                    });
                    renderEditor();
                }
            });
        }
        if (!menu.children.length) {
            return;
        }
        showPopup(anchor, menu);
    }

    function openIconPicker(anchor, item) {
        const grid = el('div');
        const inner = el('div', 'ch-icon-grid');
        FOLDER_ICONS.forEach(function (icon) {
            const button = el('button', icon === item.Icon ? 'ch-selected' : '', '<span class="material-icons" aria-hidden="true">' + icon + '</span>');
            button.type = 'button';
            button.title = icon;
            button.addEventListener('click', function () {
                item.Icon = icon;
                closePopup();
                renderEditor();
            });
            inner.appendChild(button);
        });
        grid.appendChild(inner);
        grid.style.width = '18em';
        showPopup(anchor, grid);
    }

    /* ---- drag and drop (pointer based, works with mouse and touch) ---- */

    function initDrag(root, list, side) {
        let drag = null;

        function isInside(node, e) {
            const rect = node.getBoundingClientRect();
            return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
        }

        function rowsFor(draggingFolder) {
            return Array.prototype.filter.call(list.querySelectorAll('.ch-row'), function (row) {
                if (row.classList.contains('ch-dragging') || row.classList.contains('ch-row-unlisted')) {
                    return false;
                }
                return !(draggingFolder && row.classList.contains('ch-row-child'));
            });
        }

        function computeTarget(e) {
            if (isInside(side.parentNode, e)) {
                // Over the "not in the layout" column: a layout section is removed, anything else stays where it is.
                return drag.item._unlisted || drag.item.Type === 'folder' ? null : { remove: true };
            }
            const draggingFolder = drag.item.Type === 'folder';
            const rows = rowsFor(draggingFolder);
            let before = null;
            let previous = null;
            for (let i = 0; i < rows.length; i++) {
                const rect = rows[i].getBoundingClientRect();
                if (e.clientY < rect.top + rect.height / 2) {
                    before = rows[i];
                    break;
                }
                previous = rows[i];
            }
            const listRect = list.getBoundingClientRect();
            const indented = e.clientX - listRect.left > 40;
            let folder = null;
            let beforeItem = null;

            if (draggingFolder) {
                // Folders only live at the top level: a child row stands for its parent folder.
                beforeItem = before ? (before._parent || before._item) : null;
            } else if (before && before._parent && before._parent !== drag.item) {
                // Between two members (or between a header and its first member): inside that folder.
                folder = before._parent;
                beforeItem = before._item;
            } else if (previous && previous._item.Type === 'folder' && previous._item !== drag.item && indented) {
                // Right below a folder header, indented: first position inside the folder.
                folder = previous._item;
                beforeItem = folder.Items.length ? folder.Items[0] : null;
            } else if (previous && previous._parent && previous._parent !== drag.item && indented) {
                // Below the last member, indented: last position inside the folder.
                folder = previous._parent;
                beforeItem = null;
            } else {
                beforeItem = before ? (before._parent || before._item) : null;
            }
            return { folder: folder, before: beforeItem, indicatorRow: before, lastRow: previous, indented: !!folder };
        }

        function showIndicator(target) {
            setClass(side.parentNode, 'ch-drop-remove', !!(target && target.remove));
            if (!target || target.remove) {
                const existing = list.querySelector('.ch-drop-indicator');
                if (existing) {
                    existing.remove();
                }
                return;
            }
            let indicator = list.querySelector('.ch-drop-indicator');
            if (!indicator) {
                indicator = el('div', 'ch-drop-indicator');
                list.appendChild(indicator);
            }
            const listRect = list.getBoundingClientRect();
            let y;
            if (target.indicatorRow) {
                y = target.indicatorRow.getBoundingClientRect().top - listRect.top - 3;
            } else if (target.lastRow) {
                y = target.lastRow.getBoundingClientRect().bottom - listRect.top + 1;
            } else {
                y = 0;
            }
            indicator.style.top = y + 'px';
            setClass(indicator, 'ch-drop-indent', target.indented);
        }

        function autoScroll(e) {
            const body = editor.body;
            const rect = body.getBoundingClientRect();
            const zone = 48;
            if (e.clientY < rect.top + zone) {
                body.scrollTop -= 12;
            } else if (e.clientY > rect.bottom - zone) {
                body.scrollTop += 12;
            }
        }

        function start(e) {
            drag.active = true;
            const row = drag.row;
            const ghost = row.cloneNode(true);
            ghost.classList.add('ch-ghost');
            ghost.style.width = row.offsetWidth + 'px';
            document.body.appendChild(ghost);
            drag.ghost = ghost;
            drag.offsetY = e.clientY - row.getBoundingClientRect().top;
            drag.offsetX = e.clientX - row.getBoundingClientRect().left;
            row.classList.add('ch-dragging');
            if (drag.item.Type === 'folder') {
                let sibling = row.nextElementSibling;
                while (sibling && sibling.classList.contains('ch-row-child')) {
                    sibling.classList.add('ch-dragging');
                    sibling = sibling.nextElementSibling;
                }
            }
        }

        function finish(apply) {
            if (!drag) {
                return;
            }
            const current = drag;
            drag = null;
            if (current.ghost) {
                current.ghost.remove();
            }
            const indicator = list.querySelector('.ch-drop-indicator');
            if (indicator) {
                indicator.remove();
            }
            Array.prototype.forEach.call(root.querySelectorAll('.ch-dragging'), function (row) {
                row.classList.remove('ch-dragging');
            });
            side.parentNode.classList.remove('ch-drop-remove');
            if (apply && current.active && current.target && current.target.remove) {
                removeItem(current.item);
                renderEditor();
            } else if (apply && current.active && current.target) {
                moveItem(current.item, { folder: current.target.folder, before: current.target.before });
            }
        }

        root.addEventListener('pointerdown', function (e) {
            const handle = e.target.closest('.ch-handle');
            if (!handle || e.button > 0) {
                return;
            }
            const row = handle.closest('.ch-row');
            if (!row || !row._item || editor.query) {
                return;
            }
            e.preventDefault();
            closePopup();
            drag = { row: row, item: row._item, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false, target: null };
            try {
                handle.setPointerCapture(e.pointerId);
            } catch (err) {
                /* not supported */
            }
        });

        root.addEventListener('pointermove', function (e) {
            if (!drag || e.pointerId !== drag.pointerId) {
                return;
            }
            if (!drag.active) {
                if (Math.abs(e.clientY - drag.startY) < 6 && Math.abs(e.clientX - drag.startX) < 6) {
                    return;
                }
                start(e);
            }
            e.preventDefault();
            drag.ghost.style.left = (e.clientX - drag.offsetX) + 'px';
            drag.ghost.style.top = (e.clientY - drag.offsetY) + 'px';
            drag.target = computeTarget(e);
            showIndicator(drag.target);
            autoScroll(e);
        });

        root.addEventListener('pointerup', function (e) {
            if (drag && e.pointerId === drag.pointerId) {
                finish(true);
            }
        });
        root.addEventListener('pointercancel', function () {
            finish(false);
        });
    }

    /* ---- save / reset ---- */

    function serializeModel(model) {
        function section(item) {
            return {
                Type: 'section',
                Key: item.Key,
                Label: (editor.known[item.Key] && editor.known[item.Key].label) || item.Label || null,
                Visible: item.Visible !== false,
                Shape: item.Shape || 'auto',
                Size: item.Size || 'normal',
                ShowTitle: item.ShowTitle !== false,
                Genres: item.Key === 'ch:genre' ? (item.Genres || []) : []
            };
        }
        return {
            Version: 1,
            // A layout with at least one section replaces the default home page.
            HideUnlisted: model.Items.length > 0,
            Items: model.Items.map(function (item) {
                if (item.Type === 'folder') {
                    return {
                        Type: 'folder',
                        Id: item.Id,
                        Name: item.Name || '',
                        Icon: item.Icon || 'folder',
                        Visible: item.Visible !== false,
                        Collapsed: !!item.Collapsed,
                        Items: (item.Items || []).map(section)
                    };
                }
                return section(item);
            })
        };
    }

    function saveEditor() {
        if (!editor) {
            return;
        }
        const current = editor;
        const payload = serializeModel(current.model);
        const path = current.mode === 'default' ? 'DefaultLayout' : 'Layout';
        const saveButton = current.overlay.querySelector('.ch-save');
        saveButton.disabled = true;
        apiSend('POST', path, payload).then(function (saved) {
            if (current.mode === 'user') {
                state.layout = saved || payload;
                if (state.response) {
                    state.response.HasUserLayout = true;
                    state.response.Source = 'user';
                }
                scheduleApply();
            }
            if (current.options && typeof current.options.onSaved === 'function') {
                current.options.onSaved(saved || payload);
            }
            toast(t('saved'));
            closeEditor();
            if (current.embedded) {
                openEditor(current.options);
            }
        }).catch(function (error) {
            console.error('[CustomizedHome] save failed', error);
            saveButton.disabled = false;
            toast(t('saveError'));
        });
    }

    function resetEditor() {
        if (!editor || !window.confirm(t('resetConfirm'))) {
            return;
        }
        apiSend('DELETE', 'Layout').then(function () {
            closeEditor();
            return reloadLayout();
        }).then(function () {
            toast(t('saved'));
        }).catch(function (error) {
            console.error('[CustomizedHome] reset failed', error);
            toast(t('saveError'));
        });
    }

    /* ------------------------------------------------------------------ */
    /* Bootstrap                                                           */
    /* ------------------------------------------------------------------ */

    function bootstrap() {
        const observer = new MutationObserver(scheduleScan);
        observer.observe(document.body, { childList: true, subtree: true });
        scheduleScan();
    }

    window.CustomizedHome = {
        loaded: true,
        version: VERSION,
        openEditor: openEditor,
        refresh: function () {
            state.integratedCache = {};
            return reloadLayout();
        },
        apply: scheduleApply,
        // Diagnostics: the sections found on the home page during the last pass.
        sections: function () {
            return (state.discovered || []).map(function (section) {
                return { key: section.key, label: section.label, origin: section.origin, instance: section.instance, order: section.el.style.order };
            });
        }
    };

    if (document.body) {
        bootstrap();
    } else {
        document.addEventListener('DOMContentLoaded', bootstrap);
    }
})();
