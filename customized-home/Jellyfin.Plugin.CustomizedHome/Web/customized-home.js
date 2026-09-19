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

    const VERSION = '1.8.3';
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
            emptyHomeTitle: 'The home layout is not applied',
            emptyHomeTitleBlank: 'Nothing to show on the home page',
            emptyHomeHidden: 'Every section of the layout is hidden.',
            emptyHomeEmpty: 'The sections of the layout have nothing to display for now (nothing in progress, empty library...).',
            emptyHomeMissing: 'The sections of the layout are no longer offered on this home page (Jellyfin update, plugin removed, Jellyfin home settings). The default home page is shown instead.',
            emptyHomeDisabled: 'The layout only holds sections rendered by Customized Home, which the administrator turned off. The default home page is shown instead.',
            emptyHomeFix: 'Open "Customize home" to show or add sections, or reset the layout.',
            emptyHomeFixAdmin: 'This layout is managed by the administrator: ask them to update it.',
            emptyHomeDismiss: 'Hide this message',
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
            showAll: 'Also list the Jellyfin sections that are not displayed right now',
            legendCustomized: 'Customized Home section',
            legendJellyfin: 'Jellyfin default section',
            legendOther: 'Section from another plugin',
            dragHandle: 'Drag to reorder, or to move to the other column',
            showSectionTitle: 'Show the section title',
            noSectionTitle: 'no section title',
            cardOptions: 'Cards',
            sectionOptions: 'Section',
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
            genreStyle: 'Genre cards',
            genreStylePosters: 'Posters of the genre',
            genreStyleCustom: 'Custom images',
            genreStyleColors: 'Names on colored backgrounds',
            becauseYouWatched: 'Because you watched {0}',
            genreTitle: 'Genre: {0}',
            format: 'Display format (shape, size, titles)',
            shape: 'Card shape',
            shapeAuto: 'Default',
            shapePortrait: 'Poster',
            shapeLandscape: 'Landscape',
            shapeSquare: 'Square',
            size: 'Card size',
            sizeSmall: 'Small',
            sizeNormal: 'Normal',
            sizeLarge: 'Large',
            showTitles: 'Show the card titles',
            noTitles: 'no card titles',
            heroTitle: 'Hero banner',
            heroHint: 'Carousel of featured media at the top of the home page',
            heroEnable: 'Turn the hero on',
            heroDisable: 'Turn the hero off',
            heroSettings: 'Hero settings',
            heroSources: 'Sources (combined)',
            heroSrcRandom: 'Random',
            heroSrcRecentMovies: 'Recently added movies',
            heroSrcRecentShows: 'Recently added shows',
            heroSrcLatestMovies: 'Latest movies (release date)',
            heroSrcLatestShows: 'Latest shows (release date)',
            heroNoSource: 'no source selected',
            heroCount: 'Number of media',
            heroCountBadge: '{0} media',
            heroLess: 'Fewer media',
            heroMoreCount: 'More media',
            heroInterval: 'Automatic rotation',
            heroIntervalOff: 'manual',
            heroSeconds: '{0} s',
            heroFilters: 'Filters',
            heroExcludePlayed: 'Skip media already watched',
            heroRequireBackdrop: 'Only media with a backdrop image',
            heroPlay: 'Play',
            heroResume: 'Resume',
            heroRestart: 'From the beginning',
            heroTrailer: 'Trailer',
            heroFavorite: 'Favorite',
            heroPlayed: 'Watched',
            heroActionError: 'Could not update this media',
            latestUnavailable: 'Recently added (library not available)',
            heroMore: 'More info',
            heroPrev: 'Previous media',
            heroNext: 'Next media',
            heroPosition: '{0} of {1}',
            heroHours: '{0} h {1} min',
            heroMinutes: '{0} min'
        },
        fr: {
            customize: "Personnaliser l'accueil",
            emptyHomeTitle: "La disposition de l'accueil n'est pas appliquée",
            emptyHomeTitleBlank: "Rien à afficher sur l'accueil",
            emptyHomeHidden: 'Toutes les sections de la disposition sont masquées.',
            emptyHomeEmpty: "Les sections de la disposition n'ont rien à afficher pour le moment (rien en cours de lecture, bibliothèque vide…).",
            emptyHomeMissing: "Les sections de la disposition ne sont plus proposées sur cet accueil (mise à jour de Jellyfin, plugin retiré, réglages d'accueil Jellyfin). La page d'accueil par défaut est affichée à la place.",
            emptyHomeDisabled: "La disposition ne contient que des sections rendues par Customized Home, désactivées par l'administrateur. La page d'accueil par défaut est affichée à la place.",
            emptyHomeFix: "Ouvrez « Personnaliser l'accueil » pour réafficher ou ajouter des sections, ou réinitialisez la disposition.",
            emptyHomeFixAdmin: "Cette disposition est gérée par l'administrateur : demandez-lui de la mettre à jour.",
            emptyHomeDismiss: 'Masquer ce message',
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
            showAll: 'Lister aussi les sections Jellyfin non affichées actuellement',
            legendCustomized: 'Section Customized Home',
            legendJellyfin: 'Section Jellyfin par défaut',
            legendOther: "Section d'un autre plugin",
            dragHandle: "Glisser pour réordonner, ou pour changer de colonne",
            showSectionTitle: 'Afficher le titre de la section',
            noSectionTitle: 'sans titre de section',
            cardOptions: 'Cartes',
            sectionOptions: 'Section',
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
            genreStyle: 'Cartes des genres',
            genreStylePosters: 'Affiches du genre',
            genreStyleCustom: 'Images personnalisées',
            genreStyleColors: 'Noms sur fonds de couleur',
            becauseYouWatched: 'Parce que vous avez regardé {0}',
            genreTitle: 'Genre : {0}',
            format: "Format d'affichage (forme, taille, titres)",
            shape: 'Forme des cartes',
            shapeAuto: 'Par défaut',
            shapePortrait: 'Affiche',
            shapeLandscape: 'Paysage',
            shapeSquare: 'Carré',
            size: 'Taille des cartes',
            sizeSmall: 'Petite',
            sizeNormal: 'Normale',
            sizeLarge: 'Grande',
            showTitles: 'Afficher les titres des cartes',
            noTitles: 'sans titres de cartes',
            heroTitle: 'Bannière « hero »',
            heroHint: "Carrousel de médias à la une, en haut de l'accueil",
            heroEnable: 'Activer le hero',
            heroDisable: 'Désactiver le hero',
            heroSettings: 'Réglages du hero',
            heroSources: 'Sources (cumulables)',
            heroSrcRandom: 'Aléatoire',
            heroSrcRecentMovies: 'Films ajoutés récemment',
            heroSrcRecentShows: 'Séries ajoutées récemment',
            heroSrcLatestMovies: 'Derniers films (date de sortie)',
            heroSrcLatestShows: 'Dernières séries (date de sortie)',
            heroNoSource: 'aucune source sélectionnée',
            heroCount: 'Nombre de médias',
            heroCountBadge: '{0} médias',
            heroLess: 'Moins de médias',
            heroMoreCount: 'Plus de médias',
            heroInterval: 'Rotation automatique',
            heroIntervalOff: 'manuelle',
            heroSeconds: '{0} s',
            heroFilters: 'Filtres',
            heroExcludePlayed: 'Exclure les médias déjà vus',
            heroRequireBackdrop: 'Uniquement les médias avec image de fond',
            heroPlay: 'Lire',
            heroResume: 'Reprendre',
            heroRestart: 'Depuis le début',
            heroTrailer: 'Bande-annonce',
            heroFavorite: 'Favori',
            heroPlayed: 'Vu',
            heroActionError: 'Impossible de mettre à jour ce média',
            latestUnavailable: 'Ajouts récents (médiathèque indisponible)',
            heroMore: "Plus d'infos",
            heroPrev: 'Média précédent',
            heroNext: 'Média suivant',
            heroPosition: '{0} sur {1}',
            heroHours: '{0} h {1} min',
            heroMinutes: '{0} min'
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
        genreNames: null,
        userViews: null,
        integratedCache: {},
        // Everything above belongs to one user on one server (see checkSession).
        identity: null,
        epoch: 0,
        loadFailures: 0,
        retryAt: 0,
        retryTimer: null,
        warnedEmptyHome: false,
        noticeDismissed: false
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

    const LOAD_RETRY_BASE_MS = 2000;
    const LOAD_RETRY_MAX_MS = 5 * 60 * 1000;
    const RETRY_TIMER_MARGIN_MS = 50;

    function sessionIdentity() {
        const userId = currentUserId();
        if (!userId) {
            return null;
        }
        let serverId = '';
        try {
            serverId = apiClient().serverId() || '';
        } catch (e) {
            serverId = '';
        }
        return userId + '@' + serverId;
    }

    // Gives the home sections back their native look and removes what the plugin rendered.
    function restoreContainer(container) {
        removeHero(container);
        Array.prototype.forEach.call(container.querySelectorAll(':scope > .ch-section, :scope > .ch-folder, :scope > .ch-customize-bar, :scope > .ch-notice'), function (node) {
            node.remove();
        });
        container._chIntegrated = null;
        container._chHeroEntry = null;
        Array.prototype.forEach.call(container.querySelectorAll('.verticalSection'), function (node) {
            ['ch-hidden', 'ch-in-folder', 'ch-notitle', 'ch-nosectiontitle', 'ch-shape-portrait', 'ch-shape-landscape', 'ch-shape-square', 'ch-size-small', 'ch-size-large'].forEach(function (name) {
                setClass(node, name, false);
            });
            if (node.style.order) {
                node.style.order = '';
            }
            if (node.dataset.chFolder !== undefined) {
                delete node.dataset.chFolder;
            }
        });
    }

    // Logout, login as someone else, other server: nothing loaded or rendered for the previous session may survive.
    function resetSession() {
        state.epoch++;
        closeEditor();
        if (state.container && state.container.isConnected) {
            restoreContainer(state.container);
            // The next user's sections get their content after the login: same patience as for a new page.
            startSettling(state.container);
        }
        Array.prototype.forEach.call(document.querySelectorAll('.ch-menu-entry'), function (node) {
            node.remove();
        });
        clearTimeout(state.retryTimer);
        state.response = null;
        state.layout = null;
        state.ctx = null;
        state.ctxStale = false;
        state.loadPromise = null;
        state.catalog = null;
        state.genreNames = null;
        state.userViews = null;
        state.integratedCache = {};
        state.discovered = [];
        state.loadFailures = 0;
        state.retryAt = 0;
        state.retryTimer = null;
        state.warnedEmptyHome = false;
        state.noticeDismissed = false;
    }

    // Returns false while nobody is logged in.
    function checkSession() {
        const identity = sessionIdentity();
        if (identity !== state.identity) {
            if (state.identity !== null) {
                resetSession();
            }
            state.identity = identity;
        }
        return identity !== null;
    }

    // After a failed load the next attempts are spaced out (2 s, 4 s ... 5 min) instead of following every DOM change.
    function canLoad() {
        return !!state.loadPromise || Date.now() >= state.retryAt;
    }

    function ensureLoaded() {
        if (state.loadPromise) {
            return state.loadPromise;
        }
        const epoch = state.epoch;
        state.loadPromise = waitForApiClient()
            .then(function () {
                return Promise.all([apiGet('Layout'), loadContext()]);
            })
            .then(function (results) {
                if (epoch !== state.epoch) {
                    throw new Error('session changed while loading');
                }
                state.response = results[0];
                state.layout = results[0].Layout || { Items: [] };
                state.ctx = results[1];
                state.loadFailures = 0;
                state.retryAt = 0;
                return state.response;
            })
            .catch(function (error) {
                if (epoch === state.epoch) {
                    console.warn('[CustomizedHome] could not load the layout', error);
                    state.loadPromise = null;
                    state.loadFailures++;
                    const delay = Math.min(LOAD_RETRY_MAX_MS, LOAD_RETRY_BASE_MS * Math.pow(2, state.loadFailures - 1));
                    state.retryAt = Date.now() + delay;
                    clearTimeout(state.retryTimer);
                    state.retryTimer = setTimeout(scheduleScan, delay + RETRY_TIMER_MARGIN_MS);
                }
                throw error;
            });
        return state.loadPromise;
    }

    function reloadLayout() {
        const epoch = state.epoch;
        return apiGet('Layout').then(function (response) {
            if (epoch !== state.epoch) {
                return response;
            }
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

    // Sub-requests may fail one by one without taking the row down. When they all fail the row itself failed:
    // the caller then keeps what is on screen instead of replacing it with nothing.
    function tolerant(requests, fallback) {
        let failures = 0;
        return Promise.all(requests.map(function (request) {
            return request.catch(function () {
                failures++;
                return fallback;
            });
        })).then(function (results) {
            if (requests.length > 0 && failures === requests.length) {
                throw new Error('every request failed');
            }
            return results;
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
        return tolerant([
            client.getJSON(client.getUrl('UserItems/Resume', Object.assign({ limit: 12, mediaTypes: 'Video' }, common))),
            client.getJSON(client.getUrl('Shows/NextUp', Object.assign({ limit: 24, enableResumable: false }, common)))
        ], null).then(function (results) {
            const resume = (results[0] && results[0].Items) || [];
            const nextUp = (results[1] && results[1].Items) || [];
            return dedupeItems(resume.concat(nextUp));
        });
    }

    function fetchBecauseYouWatched() {
        return itemsQuery({ includeItemTypes: 'Movie,Series', recursive: true, isPlayed: true, sortBy: 'DatePlayed', sortOrder: 'Descending', limit: 3, fields: 'PrimaryImageAspectRatio' })
            .then(function (seeds) {
                return tolerant(seeds.map(function (seed) {
                    const client = apiClient();
                    return client.getJSON(client.getUrl('Items/' + seed.Id + '/Similar', { userId: currentUserId(), limit: 12, fields: IMAGE_FIELDS }))
                        .then(function (result) {
                            return { title: t('becauseYouWatched', seed.Name), items: (result && result.Items) || [] };
                        });
                }), { title: '', items: [] });
            })
            .then(function (list) {
                return list.filter(function (instance) {
                    return instance.items.length > 0;
                });
            });
    }

    const AUTO_GENRE_ROWS = 2;
    const GENRE_ROW_ITEMS = 16;

    const GENRE_COLLAGE_SIZE = 4;
    const GENRE_FETCH_CONCURRENCY = 6;
    const GENRE_EAGER_COLLAGES = 12;


    // Uploaded thumbnails, by genre (upper case) then by card shape.
    function fetchGenreImages() {
        return apiGet('GenreImages').then(function (list) {
            const byName = {};
            (list || []).forEach(function (entry) {
                const key = entry.Name.toUpperCase();
                (byName[key] = byName[key] || {})[entry.Shape || 'portrait'] = entry;
            });
            return byName;
        }).catch(function () {
            return {};
        });
    }

    function genreImageUrl(entry) {
        return apiUrl('GenreImages/Image', { name: entry.Name, shape: entry.Shape || 'portrait', v: entry.Version });
    }

    // The thumbnail made for the card shape; otherwise another uploaded one (cropped by the card) rather than nothing.
    const GENRE_SHAPE_FALLBACK = {
        portrait: ['portrait', 'square', 'landscape'],
        landscape: ['landscape', 'square', 'portrait'],
        square: ['square', 'portrait', 'landscape']
    };

    function pickGenreImage(uploaded, shape) {
        if (!uploaded) {
            return null;
        }
        const order = GENRE_SHAPE_FALLBACK[shape] || GENRE_SHAPE_FALLBACK.portrait;
        for (let i = 0; i < order.length; i++) {
            if (uploaded[order[i]]) {
                return uploaded[order[i]];
            }
        }
        return null;
    }

    // Backgrounds of the "colors" genre cards: picked from the genre name, so a genre keeps its color.
    const GENRE_GRADIENTS = [
        ['#e53935', '#8e24aa'], ['#1e88e5', '#00acc1'], ['#43a047', '#c0ca33'], ['#fb8c00', '#f4511e'],
        ['#6d4c41', '#d81b60'], ['#3949ab', '#8e24aa'], ['#00897b', '#1e88e5'], ['#c2185b', '#ff7043'],
        ['#5e35b1', '#1e88e5'], ['#7cb342', '#00897b'], ['#f4511e', '#ffb300'], ['#546e7a', '#3949ab']
    ];

    function genreStyleOf(item) {
        const style = item && item.GenreStyle;
        return style === 'custom' || style === 'colors' ? style : 'posters';
    }

    function genreGradient(name) {
        const pair = GENRE_GRADIENTS[textHash(String(name).toUpperCase()) % GENRE_GRADIENTS.length];
        return 'linear-gradient(135deg, ' + pair[0] + ', ' + pair[1] + ')';
    }

    // Poster collages of the "all genres" cards cost one request per genre: they are loaded when a card comes
    // close to the screen, a few at a time, and kept for the session.
    const COLLAGE_ROOT_MARGIN = '300px';
    const collageQueue = [];
    let collageRunning = 0;

    function collageHtml(collage) {
        // Each cell keeps the poster ratio on portrait cards (2 x 2 posters = one poster shaped card).
        return '<div class="ch-collage ch-collage-' + collage.length + '">' + collage.map(function (url) {
            return '<span class="ch-collage-cell" style="background-image:url(&quot;' + escapeHtml(url) + '&quot;)"></span>';
        }).join('') + '</div>';
    }

    function runCollageQueue() {
        while (collageRunning < GENRE_FETCH_CONCURRENCY && collageQueue.length) {
            const job = collageQueue.shift();
            collageRunning++;
            job().then(function () {
                collageRunning--;
                runCollageQueue();
            });
        }
    }

    function fillCollage(card, genre) {
        const epoch = state.epoch;
        collageQueue.push(function () {
            if (epoch !== state.epoch || !card.isConnected) {
                return Promise.resolve();
            }
            return withPosterCollage(genre).then(function () {
                const holder = card.querySelector('.cardImageContainer');
                if (epoch !== state.epoch || !holder || !genre._chCollage || !genre._chCollage.length) {
                    return;
                }
                const text = holder.querySelector('.cardDefaultText');
                if (text) {
                    text.remove();
                }
                holder.insertAdjacentHTML('afterbegin', collageHtml(genre._chCollage));
            });
        });
        runCollageQueue();
    }

    function observeLazyCollages(node, items) {
        const cards = node.querySelectorAll('.ch-card');
        const waiting = [];
        items.forEach(function (item, index) {
            if (item._chLazyCollage && !item._chCollage && cards[index]) {
                waiting.push({ card: cards[index], genre: item });
            }
        });
        if (!waiting.length) {
            return;
        }
        if (typeof IntersectionObserver !== 'function') {
            // Old browser: the first cards only, the others keep the genre name.
            waiting.slice(0, GENRE_EAGER_COLLAGES).forEach(function (entry) {
                fillCollage(entry.card, entry.genre);
            });
            return;
        }
        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) {
                    return;
                }
                observer.unobserve(entry.target);
                const match = waiting.filter(function (candidate) {
                    return candidate.card === entry.target;
                })[0];
                if (match) {
                    fillCollage(match.card, match.genre);
                }
            });
        }, { rootMargin: COLLAGE_ROOT_MARGIN });
        waiting.forEach(function (entry) {
            observer.observe(entry.card);
        });
    }

    function withPosterCollage(genre) {
        return itemsQuery({ genreIds: genre.Id, includeItemTypes: 'Movie,Series', recursive: true, sortBy: 'Random', imageTypes: 'Primary', limit: GENRE_COLLAGE_SIZE, fields: 'PrimaryImageAspectRatio' })
            .then(function (items) {
                genre._chCollage = dedupeItems(items).filter(function (item) {
                    return item.ImageTags && item.ImageTags.Primary;
                }).map(function (item) {
                    return apiClient().getImageUrl(item.Id, { type: 'Primary', maxWidth: 240, tag: item.ImageTags.Primary });
                });
                return genre;
            })
            .catch(function () {
                return genre;
            });
    }

    // Genre cards, per style chosen on the section:
    //   posters - collage of distinct posters of the genre (one request per genre)
    //   custom  - thumbnail uploaded by the administrator, poster collage for genres without one
    //   colors  - genre name on a colored background (no extra request)
    function fetchGenreCards(item) {
        const style = genreStyleOf(item);
        if (style === 'colors') {
            return fetchGenreList().then(function (genres) {
                genres.forEach(function (genre) {
                    genre._chColor = genreGradient(genre.Name);
                });
                return genres;
            });
        }
        const images = style === 'custom' ? fetchGenreImages() : Promise.resolve({});
        const shape = formatFor(item, INTEGRATED['ch:allGenres']).shape;
        return Promise.all([fetchGenreList(), images]).then(function (results) {
            const custom = results[1];
            // No request per genre here: the row is displayed at once, the collages follow (observeLazyCollages).
            results[0].forEach(function (genre) {
                const uploaded = pickGenreImage(custom[String(genre.Name).toUpperCase()], shape);
                if (uploaded) {
                    genre._chImage = genreImageUrl(uploaded);
                } else {
                    genre._chLazyCollage = true;
                }
            });
            return results[0];
        });
    }

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
                return tolerant(genres.map(function (genre) {
                    return itemsQuery({ genres: genre, includeItemTypes: 'Movie,Series', recursive: true, sortBy: 'Random', limit: GENRE_ROW_ITEMS })
                        .then(function (items) {
                            return { title: t('genreTitle', genre), items: items };
                        });
                }), { title: '', items: [] });
            })
            .then(function (list) {
                return list.filter(function (instance) {
                    return instance.items.length > 0;
                });
            });
    }

    // Settings of a layout entry that change what an integrated section fetches.
    function dataSignature(item) {
        const style = genreStyleOf(item);
        const shape = style === 'custom' ? ((item && item.Shape) || 'auto') : '';
        return ((item && item.Genres) || []).join('|') + '#' + style + '#' + shape;
    }

    const INTEGRATED = {
        // volatile: depends on what the user just watched, reloaded when the home page is shown again.
        'ch:combined': { titleKey: 'int_combined', shape: 'landscape', volatile: true, fetch: fetchCombined },
        'ch:latestMovies': { titleKey: 'int_latestMovies', shape: 'portrait', fetch: function () {
            return itemsQuery({ includeItemTypes: 'Movie', recursive: true, sortBy: 'PremiereDate,SortName', sortOrder: 'Descending', limit: 16 });
        } },
        'ch:latestShows': { titleKey: 'int_latestShows', shape: 'portrait', fetch: function () {
            return itemsQuery({ includeItemTypes: 'Series', recursive: true, sortBy: 'PremiereDate,SortName', sortOrder: 'Descending', limit: 16 });
        } },
        'ch:collections': { titleKey: 'int_collections', shape: 'portrait', fetch: function () {
            return itemsQuery({ includeItemTypes: 'BoxSet', recursive: true, sortBy: 'DateCreated,SortName', sortOrder: 'Descending', limit: 16 });
        } },
        'ch:watchAgain': { titleKey: 'int_watchAgain', shape: 'portrait', volatile: true, fetch: function () {
            return itemsQuery({ includeItemTypes: 'Movie,Series', recursive: true, isPlayed: true, sortBy: 'DatePlayed', sortOrder: 'Descending', limit: 16 });
        } },
        'ch:becauseYouWatched': { titleKey: 'becauseYouWatched', shape: 'portrait', family: true, volatile: true, fetchInstances: fetchBecauseYouWatched },
        'ch:genre': { titleKey: 'genreTitle', shape: 'portrait', family: true, fetchInstances: fetchGenre },
        'ch:allGenres': { titleKey: 'int_allGenres', shape: 'portrait', fetch: fetchGenreCards }
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
        const collage = item._chImage ? [] : (item._chCollage || []);
        const image = item._chImage || (collage.length ? null : imageUrlFor(item, shape));
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
        let defaultText = '';
        if (item._chColor) {
            defaultText = '<div class="ch-genre-color" style="background:' + escapeHtml(item._chColor) + '"><span>' + escapeHtml(title) + '</span></div>';
        } else if (collage.length) {
            defaultText = collageHtml(collage);
        } else if (!image) {
            defaultText = '<div class="cardText cardDefaultText">' + escapeHtml(title) + '</div>';
        }

        let html = '<div class="card ' + shapeClass + ' card-hoverable card-withuserdata ch-card" data-id="' + escapeHtml(item.Id) + '" data-serverid="' + escapeHtml(serverId)
            + '" data-type="' + escapeHtml(item.Type || '') + '" data-isfolder="' + (item.IsFolder ? 'true' : 'false') + '"'
            + (item.MediaType ? ' data-mediatype="' + escapeHtml(item.MediaType) + '"' : '') + '>';
        html += '<div class="cardBox cardBox-bottompadded"><div class="cardScalable"><div class="cardPadder ' + padder + '"></div>';
        html += '<a href="' + href + '" class="' + imageClass + '"' + imageStyle + ' aria-label="' + escapeHtml(title) + '">' + defaultText + inner + '</a>';
        html += '</div>';
        // The name is already written on a colored card.
        if (showTitle && !item._chColor) {
            html += '<div class="cardText cardTextCentered cardText-first"><bdi><a href="' + href + '" class="textActionButton" title="' + escapeHtml(title) + '">' + escapeHtml(title) + '</a></bdi></div>';
            html += '<div class="cardText cardTextCentered cardText-secondary"><bdi>' + escapeHtml(secondary) + '</bdi></div>';
        }
        html += '</div></div>';
        return html;
    }

    function formatFor(item, definition) {
        const natural = definition === INTEGRATED['ch:allGenres'] && genreStyleOf(item) === 'colors' ? 'landscape' : definition.shape;
        const shape = item && item.Shape && item.Shape !== 'auto' ? item.Shape : natural;
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
        observeLazyCollages(node, items);
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
            let fresh = false;
            if (known) {
                // The web client may have wiped the container (settings change, navigation): render again.
                const missing = !known.loading && known.count > 0 && !container.querySelector('[data-ch-key="' + key + '"]');
                const changed = known.signature !== signature;
                fresh = !known.loading && !!known.refresh;
                if (!missing && !changed && !fresh) {
                    return;
                }
            }
            loadIntegratedSection(container, registry, key, wanted[key], signature, fresh);
        });
    }

    // What a reload may change on screen: the media, their order and the user data drawn on the cards.
    function itemState(item) {
        const userData = item.UserData || {};
        return [item.Id, userData.PlaybackPositionTicks || 0, Math.round(userData.PlayedPercentage || 0), !!userData.Played, !!userData.IsFavorite,
            userData.UnplayedItemCount || 0, item._chImage || '', item._chColor || ''];
    }

    function maxAgeOf(key) {
        return INTEGRATED[key] && INTEGRATED[key].volatile ? VOLATILE_REFRESH_MS : INTEGRATED_CACHE_MS;
    }

    // Keyboard and remote users: the focus follows the media from the old nodes to the new ones.
    function focusedItemId(nodes) {
        const active = document.activeElement;
        for (let i = 0; i < nodes.length; i++) {
            if (active && nodes[i].contains(active)) {
                const holder = active.closest('[data-id]');
                return holder ? holder.getAttribute('data-id') : '';
            }
        }
        return null;
    }

    function restoreFocus(nodes, itemId) {
        if (itemId === null) {
            return;
        }
        for (let i = 0; i < nodes.length; i++) {
            const holder = itemId ? nodes[i].querySelector('[data-id="' + itemId.replace(/"/g, '') + '"]') : null;
            const target = holder ? (holder.matches('a, button') ? holder : holder.querySelector('a, button')) : null;
            if (target) {
                target.focus();
                return;
            }
        }
    }

    // The rows on screen stay until the new data is there, and are only replaced when it differs: no flicker,
    // no lost scroll position, and a failed reload keeps them.
    function loadIntegratedSection(container, registry, key, item, signature, fresh) {
        const definition = INTEGRATED[key];
        const previous = registry[key];
        const sameData = !!previous && previous.signature === signature;
        const entry = {
            loading: true,
            // first: nothing was ever loaded for this key, the page waits for it before judging the layout.
            first: !previous || !previous.loaded,
            loaded: !!previous && previous.loaded,
            count: previous ? previous.count : 0,
            signature: signature,
            ts: previous ? previous.ts : 0,
            refresh: false,
            rendered: sameData ? previous.rendered : null
        };
        registry[key] = entry;
        const epoch = state.epoch;
        const cacheKey = state.identity + '|' + key + '#' + signature;
        const cached = state.integratedCache[cacheKey];
        let dataPromise;
        if (!fresh && cached && Date.now() - cached.ts < INTEGRATED_CACHE_MS) {
            dataPromise = Promise.resolve(cached);
        } else {
            const load = definition.family
                ? definition.fetchInstances(item)
                : definition.fetch(item).then(function (items) {
                    return [{ title: t(definition.titleKey), items: items }];
                });
            dataPromise = load.then(function (data) {
                const record = { ts: Date.now(), data: data };
                if (epoch === state.epoch) {
                    state.integratedCache[cacheKey] = record;
                }
                return record;
            });
        }
        function current() {
            return epoch === state.epoch && container.isConnected && container._chIntegrated === registry && registry[key] === entry;
        }
        function nodesOf() {
            return container.querySelectorAll(':scope > [data-ch-key="' + key + '"]');
        }
        dataPromise.then(function (record) {
            entry.loading = false;
            if (!current()) {
                return;
            }
            const instances = record.data;
            const rendered = JSON.stringify(instances.map(function (instance) {
                return [instance.title, instance.items.map(itemState)];
            }));
            entry.loaded = true;
            entry.first = false;
            // The age is the age of the data: rows served from the cache of a previous home view get old on time.
            entry.ts = record.ts;
            const old = nodesOf();
            if (rendered !== entry.rendered || old.length !== instances.length) {
                const focused = focusedItemId(old);
                Array.prototype.forEach.call(old, function (node) {
                    node.remove();
                });
                instances.forEach(function (instance, index) {
                    const node = createIntegratedSection(container, key, index);
                    const format = formatFor(item, definition);
                    renderIntegratedSection(node, instance.title, instance.items, format.shape, format.showTitle);
                });
                restoreFocus(nodesOf(), focused);
            }
            entry.rendered = rendered;
            entry.count = instances.length;
            if (Date.now() - entry.ts > maxAgeOf(key)) {
                entry.refresh = true;
            }
            scheduleApply();
        }).catch(function (error) {
            entry.loading = false;
            console.warn('[CustomizedHome] section ' + key + ' failed', error);
            if (!current()) {
                return;
            }
            entry.first = false;
            if (!nodesOf().length) {
                // Nothing to look for any more: a wiped row must not turn every pass into a request.
                entry.count = 0;
            }
            // The layout may now have nothing to show at all: let the next pass decide.
            scheduleApply();
        });
    }

    // Home page shown again (back navigation, end of playback, tab back to front): reload what got old.
    // Rows that depend on what was just watched go first; the others follow the cache lifetime.
    const VOLATILE_REFRESH_MS = 15 * 1000;

    function requestRefresh() {
        const container = state.container;
        if (!container || !container.isConnected || container.offsetParent === null || document.hidden) {
            return;
        }
        const now = Date.now();
        let needed = false;
        function flag(entry, maxAge) {
            if (entry && !entry.loading && !entry.refresh && now - entry.ts > maxAge) {
                entry.refresh = true;
                needed = true;
            }
        }
        const registry = container._chIntegrated || {};
        Object.keys(registry).forEach(function (key) {
            flag(registry[key], maxAgeOf(key));
        });
        // The hero carries the resume position and the favorite / watched states.
        flag(container._chHeroEntry, VOLATILE_REFRESH_MS);
        if (needed) {
            scheduleApply();
        }
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
        setClass(node, 'ch-nosectiontitle', !!item && item.ShowSectionTitle === false);
        if (integrated && node._chItems) {
            const format = formatFor(item, integrated);
            if (node.dataset.chShape !== format.shape || (node.dataset.chShowTitle === '1') !== format.showTitle) {
                renderIntegratedSection(node, node.querySelector('.sectionTitle').textContent, node._chItems, format.shape, format.showTitle);
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* Hero: carousel of featured media above the sections                 */
    /* ------------------------------------------------------------------ */

    const HERO_FIELDS = 'Overview,Genres,CommunityRating,CriticRating,OfficialRating,RunTimeTicks,ProductionYear,PremiereDate,RemoteTrailers,LocalTrailerCount';
    const HERO_IMAGE_TYPES = 'Backdrop,Logo,Primary';
    const HERO_DEFAULTS = { Enabled: false, Sources: [], Count: 6, IntervalSeconds: 10, ExcludePlayed: true, RequireBackdrop: true };
    const HERO_DEFAULT_SOURCES = ['recentMovies', 'recentShows'];
    const HERO_MIN_COUNT = 1;
    const HERO_MAX_COUNT = 12;
    // Seconds; 0 is the manual mode, listed last.
    const HERO_INTERVALS = [3, 5, 10, 0];
    const HERO_BACKDROP_WIDTHS = [960, 1280, 1920];
    const HERO_LOGO_WIDTH = 600;
    const HERO_MAX_GENRES = 3;
    const HERO_SWIPE_PX = 40;
    const TICKS_PER_MINUTE = 600000000;

    // Order matters: it is the order of the settings menu and of the round robin between sources.
    const HERO_SOURCES = {
        random: { labelKey: 'heroSrcRandom', query: { includeItemTypes: 'Movie,Series', sortBy: 'Random' } },
        recentMovies: { labelKey: 'heroSrcRecentMovies', query: { includeItemTypes: 'Movie', sortBy: 'DateCreated,SortName', sortOrder: 'Descending' } },
        recentShows: { labelKey: 'heroSrcRecentShows', query: { includeItemTypes: 'Series', sortBy: 'DateCreated,SortName', sortOrder: 'Descending' } },
        latestMovies: { labelKey: 'heroSrcLatestMovies', query: { includeItemTypes: 'Movie', sortBy: 'PremiereDate,SortName', sortOrder: 'Descending' } },
        latestShows: { labelKey: 'heroSrcLatestShows', query: { includeItemTypes: 'Series', sortBy: 'PremiereDate,SortName', sortOrder: 'Descending' } }
    };

    function normalizeHero(hero) {
        const result = Object.assign({}, HERO_DEFAULTS, hero || {});
        const sources = Array.isArray(result.Sources) ? result.Sources : [];
        result.Sources = Object.keys(HERO_SOURCES).filter(function (source) {
            return sources.indexOf(source) >= 0;
        });
        const count = parseInt(result.Count, 10);
        result.Count = Math.max(HERO_MIN_COUNT, Math.min(HERO_MAX_COUNT, isNaN(count) ? HERO_DEFAULTS.Count : count));
        const interval = parseInt(result.IntervalSeconds, 10);
        result.IntervalSeconds = isNaN(interval) || interval < 0 ? HERO_DEFAULTS.IntervalSeconds : interval;
        result.Enabled = !!result.Enabled;
        result.ExcludePlayed = result.ExcludePlayed !== false;
        result.RequireBackdrop = result.RequireBackdrop !== false;
        return result;
    }

    // The hero to show for a layout, or null. It relies on the sections rendered by the plugin being allowed.
    function wantedHero(layout) {
        if (!state.response || !state.response.EnableIntegratedSections || !layout || !layout.Hero) {
            return null;
        }
        const hero = normalizeHero(layout.Hero);
        return hero.Enabled && hero.Sources.length ? hero : null;
    }

    function heroDataSignature(hero) {
        return hero.Sources.join('|') + '#' + hero.Count + '#' + (hero.ExcludePlayed ? 1 : 0) + (hero.RequireBackdrop ? 1 : 0);
    }

    function fetchHeroItems(hero) {
        return tolerant(hero.Sources.map(function (source) {
            const query = Object.assign({ recursive: true, limit: hero.Count, fields: HERO_FIELDS, enableImageTypes: HERO_IMAGE_TYPES }, HERO_SOURCES[source].query);
            if (hero.ExcludePlayed) {
                query.isPlayed = false;
            }
            if (hero.RequireBackdrop) {
                query.imageTypes = 'Backdrop';
            }
            return itemsQuery(query);
        }), []).then(function (lists) {
            // Round robin between the sources, so that each of them is represented.
            const mixed = [];
            for (let i = 0; i < hero.Count; i++) {
                lists.forEach(function (list) {
                    if (list[i]) {
                        mixed.push(list[i]);
                    }
                });
            }
            return dedupeItems(mixed).slice(0, hero.Count);
        });
    }

    // Reload of a hero on screen: same selection, fresh user data (resume position, favorite, watched). One request
    // instead of one per source, and the random source does not deal new media under the user's eyes.
    function refreshHeroItems(hero, items) {
        const ids = items.map(function (item) {
            return item.Id;
        });
        return itemsQuery({ ids: ids.join(','), fields: HERO_FIELDS, enableImageTypes: HERO_IMAGE_TYPES }).then(function (fresh) {
            const byId = {};
            fresh.forEach(function (item) {
                byId[item.Id] = item;
            });
            return ids.map(function (id) {
                return byId[id];
            }).filter(function (item) {
                return !!item && !(hero.ExcludePlayed && item.UserData && item.UserData.Played);
            });
        });
    }

    function heroBackdropUrl(item) {
        const client = apiClient();
        const wanted = Math.round(window.innerWidth * (window.devicePixelRatio || 1));
        const width = HERO_BACKDROP_WIDTHS.filter(function (candidate) {
            return candidate >= wanted;
        })[0] || HERO_BACKDROP_WIDTHS[HERO_BACKDROP_WIDTHS.length - 1];
        const backdrops = item.BackdropImageTags || [];
        if (backdrops.length) {
            return { url: client.getImageUrl(item.Id, { type: 'Backdrop', maxWidth: width, tag: backdrops[0] }), backdrop: true };
        }
        const primary = (item.ImageTags || {}).Primary;
        return primary ? { url: client.getImageUrl(item.Id, { type: 'Primary', maxWidth: HERO_BACKDROP_WIDTHS[0], tag: primary }), backdrop: false } : null;
    }

    function formatRuntime(ticks) {
        const minutes = Math.round((ticks || 0) / TICKS_PER_MINUTE);
        if (minutes <= 0) {
            return '';
        }
        const hours = Math.floor(minutes / 60);
        return hours > 0 ? t('heroHours', hours, minutes % 60) : t('heroMinutes', minutes);
    }

    // Remote trailers are opened in a new tab: only plain web links are accepted.
    function remoteTrailerUrl(item) {
        const trailers = item.RemoteTrailers || [];
        for (let i = 0; i < trailers.length; i++) {
            const url = trailers[i] && trailers[i].Url;
            if (url && /^https?:\/\//i.test(url)) {
                return url;
            }
        }
        return null;
    }

    function heroMetaHtml(item) {
        const parts = [];
        const year = item.ProductionYear || (item.PremiereDate ? new Date(item.PremiereDate).getFullYear() : null);
        if (year) {
            parts.push('<span class="ch-hero-year">' + escapeHtml(year) + '</span>');
        }
        const runtime = formatRuntime(item.RunTimeTicks);
        if (runtime) {
            parts.push('<span class="ch-hero-runtime">' + escapeHtml(runtime) + '</span>');
        }
        if (item.OfficialRating) {
            parts.push('<span class="ch-hero-official">' + escapeHtml(item.OfficialRating) + '</span>');
        }
        if (item.CommunityRating) {
            parts.push('<span class="ch-hero-rating"><span class="material-icons" aria-hidden="true">star</span>' + escapeHtml(Number(item.CommunityRating).toFixed(1)) + '</span>');
        }
        if (item.CriticRating != null) {
            parts.push('<span class="ch-hero-critic"><span class="material-icons" aria-hidden="true">reviews</span>' + escapeHtml(Math.round(item.CriticRating)) + ' %</span>');
        }
        const genres = (item.Genres || []).slice(0, HERO_MAX_GENRES);
        if (genres.length) {
            parts.push('<span class="ch-hero-genres">' + escapeHtml(genres.join(' · ')) + '</span>');
        }
        return parts.join('');
    }

    // extraAttributes: the native click handler takes the item from the closest element carrying data-id, the
    // button itself when it has one.
    function heroButton(className, action, icon, label, extraAttributes) {
        return '<button is="emby-button" type="button" class="ch-hero-btn ' + className + ' itemAction" data-action="' + action + '" aria-label="' + escapeHtml(label) + '"' + (extraAttributes || '') + '>'
            + '<span class="material-icons" aria-hidden="true">' + icon + '</span><span>' + escapeHtml(label) + '</span></button>';
    }

    function heroSlideHtml(item, index, total, active) {
        const serverId = item.ServerId || apiClient().serverId();
        const userData = item.UserData || {};
        const title = item.Name || '';
        const href = '#/details?id=' + encodeURIComponent(item.Id) + '&serverId=' + encodeURIComponent(serverId);
        const image = heroBackdropUrl(item);
        const logoTag = (item.ImageTags || {}).Logo;
        const resumable = userData.PlaybackPositionTicks > 0;
        const ids = ' data-id="' + escapeHtml(item.Id) + '" data-serverid="' + escapeHtml(serverId) + '"';

        // The native click handler of the items container reads the item from these attributes.
        let html = '<div class="ch-hero-slide' + (active ? ' ch-active' : '') + '" role="group" aria-roledescription="slide" aria-label="' + escapeHtml(t('heroPosition', index + 1, total)) + '"'
            + (active ? '' : ' aria-hidden="true"') + ids
            + ' data-type="' + escapeHtml(item.Type || '') + '" data-isfolder="' + (item.IsFolder ? 'true' : 'false') + '"'
            + (item.MediaType ? ' data-mediatype="' + escapeHtml(item.MediaType) + '"' : '')
            + ' data-positionticks="' + escapeHtml(userData.PlaybackPositionTicks || 0) + '">';
        html += '<div class="ch-hero-backdrop' + (image && !image.backdrop ? ' ch-hero-backdrop-poster' : '') + '"' + (image ? ' data-ch-bg="' + escapeHtml(image.url) + '"' : '') + '></div>';
        html += '<div class="ch-hero-shade"></div><div class="ch-hero-content">';
        html += logoTag
            ? '<img class="ch-hero-logo" alt="' + escapeHtml(title) + '" loading="lazy" src="' + escapeHtml(apiClient().getImageUrl(item.Id, { type: 'Logo', maxWidth: HERO_LOGO_WIDTH, tag: logoTag })) + '" />'
            : '<h2 class="ch-hero-title">' + escapeHtml(title) + '</h2>';
        html += '<div class="ch-hero-meta">' + heroMetaHtml(item) + '</div>';
        if (item.Overview) {
            html += '<p class="ch-hero-overview">' + escapeHtml(item.Overview) + '</p>';
        }
        html += '<div class="ch-hero-actions">';
        html += resumable
            ? heroButton('ch-hero-play', 'resume', 'play_arrow', t('heroResume'))
            : heroButton('ch-hero-play', 'play', 'play_arrow', t('heroPlay'));
        if (resumable) {
            // "play" and "resume" both start at data-positionticks: the restart button is its own item, at position 0.
            html += heroButton('ch-hero-restart', 'play', 'replay', t('heroRestart'), ids
                + ' data-type="' + escapeHtml(item.Type || '') + '" data-isfolder="' + (item.IsFolder ? 'true' : 'false') + '"'
                + (item.MediaType ? ' data-mediatype="' + escapeHtml(item.MediaType) + '"' : '') + ' data-positionticks="0"');
        }
        if (item.LocalTrailerCount > 0) {
            html += heroButton('ch-hero-trailer', 'playtrailer', 'theaters', t('heroTrailer'));
        } else if (remoteTrailerUrl(item)) {
            html += '<a is="emby-linkbutton" class="ch-hero-btn ch-hero-trailer" target="_blank" rel="noopener noreferrer" aria-label="' + escapeHtml(t('heroTrailer')) + '" href="' + escapeHtml(remoteTrailerUrl(item)) + '">'
                + '<span class="material-icons" aria-hidden="true">theaters</span><span>' + escapeHtml(t('heroTrailer')) + '</span></a>';
        }
        // Plain buttons handled by the plugin: the rating and play state elements of the web client are only
        // registered once another view needed them, which left these buttons dead on the home page.
        html += '<button type="button" class="ch-hero-round ch-hero-favorite' + (userData.IsFavorite ? ' ch-on' : '') + '" aria-pressed="' + (userData.IsFavorite ? 'true' : 'false') + '"'
            + ' title="' + escapeHtml(t('heroFavorite')) + '" aria-label="' + escapeHtml(t('heroFavorite')) + '">'
            + '<span class="material-icons" aria-hidden="true">favorite</span></button>';
        html += '<button type="button" class="ch-hero-round ch-hero-played' + (userData.Played ? ' ch-on' : '') + '" aria-pressed="' + (userData.Played ? 'true' : 'false') + '"'
            + ' title="' + escapeHtml(t('heroPlayed')) + '" aria-label="' + escapeHtml(t('heroPlayed')) + '">'
            + '<span class="material-icons" aria-hidden="true">check</span></button>';
        html += '<a is="emby-linkbutton" class="ch-hero-btn ch-hero-more" aria-label="' + escapeHtml(t('heroMore')) + '" href="' + href + '"><span class="material-icons" aria-hidden="true">info</span><span>' + escapeHtml(t('heroMore')) + '</span></a>';
        html += '</div></div></div>';
        return html;
    }

    function stopHero(node) {
        if (node && node._chHero) {
            clearTimeout(node._chHero.timer);
            node._chHero = null;
        }
    }

    // Favorite / watched: optimistic, reverted when the server refuses. The media kept by the hero entry and by
    // the cache is updated too, so that the next reload sees nothing to replace.
    function toggleHeroUserData(node, button) {
        const slide = button.closest('.ch-hero-slide');
        const client = apiClient();
        const userId = currentUserId();
        if (!slide || !userId || button.disabled) {
            return;
        }
        const itemId = slide.getAttribute('data-id');
        const favorite = button.classList.contains('ch-hero-favorite');
        const value = button.getAttribute('aria-pressed') !== 'true';
        const epoch = state.epoch;
        function show(on) {
            setClass(button, 'ch-on', on);
            button.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        show(value);
        button.disabled = true;
        let request;
        if (favorite) {
            request = client.updateFavoriteStatus(userId, itemId, value);
        } else {
            request = value ? client.markPlayed(userId, itemId, new Date()) : client.markUnplayed(userId, itemId);
        }
        Promise.resolve(request).then(function () {
            const container = node.parentNode;
            const entry = container && container._chHeroEntry;
            if (epoch !== state.epoch || !entry || !entry.items) {
                return;
            }
            entry.items.forEach(function (item) {
                if (item.Id === itemId) {
                    item.UserData = item.UserData || {};
                    item.UserData[favorite ? 'IsFavorite' : 'Played'] = value;
                }
            });
            entry.rendered = JSON.stringify(entry.items.map(itemState));
        }).catch(function (error) {
            console.warn('[CustomizedHome] hero action failed', error);
            show(!value);
            toast(t('heroActionError'));
        }).then(function () {
            button.disabled = false;
        });
    }

    function startHero(node, intervalSeconds, startIndex) {
        const slides = node.querySelectorAll('.ch-hero-slide');
        const dots = node.querySelectorAll('.ch-hero-dot');
        const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const carousel = { index: 0, timer: null, paused: false };
        node._chHero = carousel;

        function loadBackdrop(index) {
            const backdrop = slides[index] && slides[index].querySelector('.ch-hero-backdrop[data-ch-bg]');
            if (backdrop) {
                backdrop.style.backgroundImage = 'url("' + backdrop.getAttribute('data-ch-bg').replace(/"/g, '%22') + '")';
                backdrop.removeAttribute('data-ch-bg');
            }
        }

        function schedule() {
            clearTimeout(carousel.timer);
            if (intervalSeconds <= 0 || reducedMotion || slides.length < 2 || carousel.paused || node._chHero !== carousel) {
                return;
            }
            carousel.timer = setTimeout(function () {
                if (!node.isConnected) {
                    stopHero(node);
                    return;
                }
                // Hidden tab or home tab not displayed: wait without moving.
                if (document.hidden || node.offsetParent === null) {
                    schedule();
                    return;
                }
                show(carousel.index + 1);
            }, intervalSeconds * 1000);
        }

        function show(index) {
            carousel.index = (index + slides.length) % slides.length;
            for (let i = 0; i < slides.length; i++) {
                const active = i === carousel.index;
                setClass(slides[i], 'ch-active', active);
                if (active) {
                    slides[i].removeAttribute('aria-hidden');
                } else {
                    slides[i].setAttribute('aria-hidden', 'true');
                }
                if (dots[i]) {
                    setClass(dots[i], 'ch-active', active);
                    dots[i].setAttribute('aria-current', active ? 'true' : 'false');
                }
            }
            loadBackdrop(carousel.index);
            loadBackdrop((carousel.index + 1) % slides.length);
            schedule();
        }

        function pause(paused) {
            carousel.paused = paused;
            schedule();
        }

        node.addEventListener('click', function (e) {
            const control = e.target.closest('.ch-hero-prev, .ch-hero-next, .ch-hero-dot');
            if (control) {
                if (control.classList.contains('ch-hero-dot')) {
                    show(parseInt(control.dataset.chIndex, 10) || 0);
                } else {
                    show(carousel.index + (control.classList.contains('ch-hero-prev') ? -1 : 1));
                }
                return;
            }
            const toggle = e.target.closest('.ch-hero-favorite, .ch-hero-played');
            if (toggle) {
                toggleHeroUserData(node, toggle);
            }
        });
        node.addEventListener('mouseenter', function () {
            pause(true);
        });
        node.addEventListener('mouseleave', function () {
            pause(node.contains(document.activeElement));
        });
        node.addEventListener('focusin', function () {
            pause(true);
        });
        node.addEventListener('focusout', function (e) {
            if (!node.contains(e.relatedTarget)) {
                pause(node.matches(':hover'));
            }
        });
        node.addEventListener('keydown', function (e) {
            // On TV the arrows move the focus: leave them alone.
            if (document.documentElement.classList.contains('layout-tv') || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) {
                return;
            }
            e.preventDefault();
            show(carousel.index + (e.key === 'ArrowLeft' ? -1 : 1));
            const target = slides[carousel.index].querySelector('.ch-hero-play');
            if (target) {
                target.focus();
            }
        });
        let swipeStart = null;
        node.addEventListener('pointerdown', function (e) {
            swipeStart = e.pointerType === 'touch' ? e.clientX : null;
        });
        node.addEventListener('pointerup', function (e) {
            if (swipeStart !== null && Math.abs(e.clientX - swipeStart) >= HERO_SWIPE_PX) {
                show(carousel.index + (e.clientX < swipeStart ? 1 : -1));
            }
            swipeStart = null;
        });

        show(startIndex || 0);
    }

    const HERO_UNDER_HEADER_CLASS = 'ch-hero-under-header';
    const HERO_NAVIGATION_SETTLE_MS = 300;
    let heroChromeReady = false;
    let heroChromeScheduled = false;

    function currentHero() {
        const container = state.container;
        const node = container && container.isConnected ? container.querySelector(':scope > .ch-hero') : null;
        // offsetParent is null while the home page or its tab is hidden.
        return node && node.offsetParent !== null ? node : null;
    }

    // Full bleed, starting under the header: the distances to the page edges are measured rather than assumed,
    // since they come from the theme (header height, page and container paddings).
    function layoutHero(node) {
        const page = node.closest('.page') || document.documentElement;
        node.style.marginTop = '0px';
        node.style.marginLeft = '0px';
        node.style.marginRight = '0px';
        const rect = node.getBoundingClientRect();
        const pageRect = page.getBoundingClientRect();
        node.style.marginTop = (pageRect.top - rect.top) + 'px';
        node.style.marginLeft = (pageRect.left - rect.left) + 'px';
        node.style.marginRight = (rect.right - pageRect.right) + 'px';
    }

    // The header is see-through while it lies over the hero, and gets its background back below it.
    function updateHeroChrome(relayout) {
        const node = currentHero();
        let under = false;
        if (node) {
            if (relayout) {
                layoutHero(node);
            }
            const header = document.querySelector('.skinHeader');
            under = node.getBoundingClientRect().bottom > (header ? header.offsetHeight : 0);
        }
        setClass(document.documentElement, HERO_UNDER_HEADER_CLASS, under);
    }

    function scheduleHeroChrome() {
        if (heroChromeScheduled) {
            return;
        }
        heroChromeScheduled = true;
        requestAnimationFrame(function () {
            heroChromeScheduled = false;
            updateHeroChrome(false);
        });
    }

    function initHeroChrome() {
        if (heroChromeReady) {
            return;
        }
        heroChromeReady = true;
        function relayout() {
            updateHeroChrome(true);
        }
        // Capture: also catches a scrolling element inside the page.
        window.addEventListener('scroll', scheduleHeroChrome, { passive: true, capture: true });
        window.addEventListener('resize', relayout);
        document.addEventListener('viewshow', relayout);
        window.addEventListener('hashchange', function () {
            setTimeout(relayout, HERO_NAVIGATION_SETTLE_MS);
        });
    }

    function renderHero(container, hero, items) {
        // A reload keeps the media the user is looking at in front, when it is still part of the selection.
        const shown = container.querySelector(':scope > .ch-hero .ch-hero-slide.ch-active');
        const shownId = shown ? shown.getAttribute('data-id') : null;
        const previousNode = container.querySelector(':scope > .ch-hero');
        const focusedControl = previousNode && previousNode.contains(document.activeElement)
            ? ['ch-hero-play', 'ch-hero-restart', 'ch-hero-trailer', 'ch-hero-favorite', 'ch-hero-played', 'ch-hero-more'].filter(function (name) {
                return document.activeElement.classList.contains(name);
            })[0] || 'ch-hero-play'
            : null;
        let startIndex = 0;
        items.forEach(function (item, index) {
            if (item.Id === shownId) {
                startIndex = index;
            }
        });
        removeHero(container);
        const node = el('div', 'ch-hero');
        node.setAttribute('role', 'region');
        node.setAttribute('aria-roledescription', 'carousel');
        node.setAttribute('aria-label', t('heroTitle'));
        let html = '<div is="emby-itemscontainer" class="ch-hero-slides" data-multiselect="false">' + items.map(function (item, index) {
            return heroSlideHtml(item, index, items.length, index === startIndex);
        }).join('') + '</div>';
        if (items.length > 1) {
            html += '<button type="button" class="ch-hero-nav ch-hero-prev" aria-label="' + escapeHtml(t('heroPrev')) + '"><span class="material-icons" aria-hidden="true">chevron_left</span></button>'
                + '<button type="button" class="ch-hero-nav ch-hero-next" aria-label="' + escapeHtml(t('heroNext')) + '"><span class="material-icons" aria-hidden="true">chevron_right</span></button>'
                + '<div class="ch-hero-dots">' + items.map(function (item, index) {
                    return '<button type="button" class="ch-hero-dot" data-ch-index="' + index + '" aria-label="' + escapeHtml(t('heroPosition', index + 1, items.length)) + '"></button>';
                }).join('') + '</div>';
        }
        node.innerHTML = html;
        container.appendChild(node);
        startHero(node, hero.IntervalSeconds, startIndex);
        if (focusedControl) {
            const target = node.querySelector('.ch-hero-slide.ch-active .' + focusedControl) || node.querySelector('.ch-hero-slide.ch-active .ch-hero-play');
            if (target) {
                target.focus();
            }
        }
        initHeroChrome();
        updateHeroChrome(true);
        return node;
    }

    function removeHero(container) {
        Array.prototype.forEach.call(container.querySelectorAll(':scope > .ch-hero'), function (node) {
            stopHero(node);
            node.remove();
        });
        updateHeroChrome(false);
    }

    function syncHero(container, hero) {
        if (!hero) {
            if (container._chHeroEntry) {
                container._chHeroEntry = null;
                removeHero(container);
            }
            return;
        }
        const dataSignatureOfHero = heroDataSignature(hero);
        const signature = dataSignatureOfHero + '#' + hero.IntervalSeconds;
        const known = container._chHeroEntry;
        let fresh = false;
        if (known && known.signature === signature) {
            // The web client may have wiped the container: render again.
            const missing = !known.loading && known.count > 0 && !container.querySelector(':scope > .ch-hero');
            fresh = !known.loading && !!known.refresh;
            if (!missing && !fresh) {
                return;
            }
        }
        // The hero on screen stays until the new data is there, and is only replaced when it differs.
        const sameSelection = !!known && known.dataSignature === dataSignatureOfHero;
        const entry = {
            loading: true,
            count: known ? known.count : 0,
            signature: signature,
            dataSignature: dataSignatureOfHero,
            ts: known ? known.ts : 0,
            selectedAt: sameSelection ? known.selectedAt : 0,
            items: sameSelection ? known.items : null,
            refresh: false,
            rendered: known && known.signature === signature ? known.rendered : null
        };
        container._chHeroEntry = entry;
        const epoch = state.epoch;
        const cacheKey = state.identity + '|hero#' + dataSignatureOfHero;
        const cached = state.integratedCache[cacheKey];
        let dataPromise;
        if (!fresh && cached && Date.now() - cached.selectedAt < INTEGRATED_CACHE_MS) {
            dataPromise = Promise.resolve(cached);
        } else {
            // A selection that is still young only gets its user data reloaded; past the cache lifetime the sources run again.
            const keep = fresh && entry.items && entry.items.length && Date.now() - entry.selectedAt < INTEGRATED_CACHE_MS;
            const selectedAt = keep ? entry.selectedAt : Date.now();
            dataPromise = (keep ? refreshHeroItems(hero, entry.items) : fetchHeroItems(hero)).then(function (items) {
                const record = { ts: Date.now(), selectedAt: selectedAt, data: items };
                if (epoch === state.epoch) {
                    state.integratedCache[cacheKey] = record;
                }
                return record;
            });
        }
        function current() {
            return epoch === state.epoch && container.isConnected && container._chHeroEntry === entry;
        }
        dataPromise.then(function (record) {
            entry.loading = false;
            if (!current()) {
                return;
            }
            const items = record.data;
            const rendered = JSON.stringify(items.map(itemState));
            entry.ts = record.ts;
            entry.selectedAt = record.selectedAt;
            entry.items = items;
            entry.count = items.length;
            const node = container.querySelector(':scope > .ch-hero');
            if (!items.length) {
                removeHero(container);
            } else if (rendered !== entry.rendered || !node) {
                renderHero(container, hero, items);
            }
            entry.rendered = rendered;
            if (Date.now() - entry.ts > VOLATILE_REFRESH_MS) {
                entry.refresh = true;
            }
            scheduleApply();
        }).catch(function (error) {
            entry.loading = false;
            console.warn('[CustomizedHome] hero failed', error);
            if (current() && !container.querySelector(':scope > .ch-hero')) {
                entry.count = 0;
            }
        });
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
            if (child.nodeType !== 1 || child.classList.contains('ch-folder') || child.classList.contains('ch-customize-bar') || child.classList.contains('ch-hero')
                || child.classList.contains('ch-notice')) {
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
        syncHero(container, wantedHero(layout));
        if (container._chHeroEntry) {
            updateHeroChrome(true);
        }

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
        const replacesHome = layoutReplacesHome(layout);
        const existingFolders = {};
        const folderNodes = container.querySelectorAll(':scope > .ch-folder');
        for (let i = 0; i < folderNodes.length; i++) {
            existingFolders[folderNodes[i].dataset.chFolderId] = folderNodes[i];
        }

        let order = ORDER_STEP;
        let shownTotal = 0;
        let resolved = 0;
        const used = {};
        const integratedRegistry = container._chIntegrated || {};

        function place(item, visible, folder, collapsed) {
            const key = item.Key;
            used[key] = true;
            const group = byKey[key];
            // Resolved: the section exists on this server, displayed or not (hidden by the user, empty for now).
            if (group || (integratedRegistry[key] && integratedRegistry[key].loaded)) {
                resolved++;
            }
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
            shownTotal += shown;
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

        // Safety net: a layout whose sections all went missing (renamed by an update, plugin removed...) would leave
        // an empty page for good: the default home page comes back. A section that exists but is empty or hidden
        // keeps the layout in charge. First loads of plugin sections are waited for, reloads are not.
        const pending = Object.keys(integratedRegistry).some(function (key) {
            return integratedRegistry[key].loading && integratedRegistry[key].first;
        });
        // The native sections arrive one by one: the verdict only falls once the page had time to fill.
        const settling = Date.now() - (container._chAttachedAt || 0) < EMPTY_HOME_GRACE_MS;
        const hideUnlisted = replacesHome && (resolved > 0 || pending || settling);
        if (replacesHome && !hideUnlisted && !state.warnedEmptyHome) {
            state.warnedEmptyHome = true;
            console.warn('[CustomizedHome] no section of the layout exists on this home page: showing the default home page instead');
        }
        // Default home page back although a layout exists, or nothing at all on the page: say why, and how to fix it.
        let noticeReason = null;
        const heroEntry = container._chHeroEntry;
        if (replacesHome && !hideUnlisted) {
            noticeReason = 'missing';
        } else if (!replacesHome && layoutSections(layout).length > 0) {
            noticeReason = 'disabled';
        } else if (replacesHome && shownTotal === 0 && !pending && !settling && !(heroEntry && (heroEntry.loading || heroEntry.count > 0))) {
            noticeReason = layoutSections(layout).every(function (entry) {
                return !entry.visible;
            }) ? 'hidden' : 'empty';
        }
        syncEmptyHomeNotice(container, noticeReason);

        sections.forEach(function (section) {
            if (used[section.key]) {
                return;
            }
            setOrder(section.el, ORDER_UNLISTED_BASE + section.origOrder);
            applyFormat(section.el, null);
            setClass(section.el, 'ch-hidden', hideUnlisted);
            setClass(section.el, 'ch-in-folder', false);
            if (section.el.dataset.chFolder !== undefined) {
                delete section.el.dataset.chFolder;
            }
        });

        ensureCustomizeBar(container);
    }

    // A layout replaces the default home page as soon as it lists one section that can exist: sections rendered
    // by the plugin do not count while the administrator keeps them disabled.
    const EMPTY_HOME_GRACE_MS = 5000;
    // After the hero (-2 in the stylesheet), before anything else: sections the web client left empty keep the default order 0.
    const ORDER_NOTICE = -1;
    const EMPTY_HOME_TEXT = { hidden: 'emptyHomeHidden', empty: 'emptyHomeEmpty', missing: 'emptyHomeMissing', disabled: 'emptyHomeDisabled' };
    // With these reasons the default home page is displayed; with the others the page is just empty.
    const EMPTY_HOME_FALLBACK = { missing: true, disabled: true };

    function startSettling(container) {
        container._chAttachedAt = Date.now();
        clearTimeout(container._chSettleTimer);
        container._chSettleTimer = setTimeout(scheduleApply, EMPTY_HOME_GRACE_MS + RETRY_TIMER_MARGIN_MS);
    }

    // The sections of a layout with their effective visibility (a hidden folder hides its members).
    function layoutSections(layout) {
        const list = [];
        (layout.Items || []).forEach(function (item) {
            if (item.Type === 'folder') {
                (item.Items || []).forEach(function (member) {
                    if (member.Key) {
                        list.push({ item: member, visible: item.Visible !== false && member.Visible !== false });
                    }
                });
            } else if (item.Key) {
                list.push({ item: item, visible: item.Visible !== false });
            }
        });
        return list;
    }

    function syncEmptyHomeNotice(container, reason) {
        const existing = container.querySelector(':scope > .ch-notice');
        if (!reason || state.noticeDismissed) {
            if (existing) {
                existing.remove();
            }
            return;
        }
        const canCustomize = !!(state.response && state.response.CanCustomize);
        const signature = reason + '|' + canCustomize + '|' + getLanguage();
        if (existing && existing.dataset.chNotice === signature) {
            return;
        }
        if (existing) {
            existing.remove();
        }
        const notice = el('div', 'ch-notice');
        notice.dataset.chNotice = signature;
        notice.dataset.chReason = reason;
        notice.setAttribute('role', 'status');
        notice.innerHTML = '<span class="material-icons ch-notice-icon" aria-hidden="true">info</span>'
            + '<div class="ch-notice-text"><h2 class="ch-notice-title"></h2><p class="ch-notice-why"></p><p class="ch-notice-fix"></p>'
            + '<div class="ch-notice-actions">'
            + (canCustomize ? '<button type="button" class="ch-btn ch-btn-primary ch-notice-customize"></button>' : '')
            + '<button type="button" class="ch-btn ch-notice-dismiss"></button>'
            + '</div></div>';
        notice.querySelector('.ch-notice-title').textContent = t(EMPTY_HOME_FALLBACK[reason] ? 'emptyHomeTitle' : 'emptyHomeTitleBlank');
        notice.querySelector('.ch-notice-why').textContent = t(EMPTY_HOME_TEXT[reason]);
        notice.querySelector('.ch-notice-fix').textContent = t(canCustomize ? 'emptyHomeFix' : 'emptyHomeFixAdmin');
        notice.querySelector('.ch-notice-dismiss').textContent = t('emptyHomeDismiss');
        notice.querySelector('.ch-notice-dismiss').addEventListener('click', function () {
            // For this session only: the message comes back with the next page load, as long as the cause is there.
            state.noticeDismissed = true;
            notice.remove();
        });
        if (canCustomize) {
            notice.querySelector('.ch-notice-customize').textContent = t('customize');
            notice.querySelector('.ch-notice-customize').addEventListener('click', function () {
                openEditor({ mode: 'user' });
            });
        }
        setOrder(notice, ORDER_NOTICE);
        container.appendChild(notice);
    }

    function layoutReplacesHome(layout) {
        const integratedAllowed = !!(state.response && state.response.EnableIntegratedSections);
        function counts(item) {
            return !!item.Key && (integratedAllowed || !INTEGRATED[item.Key]);
        }
        return (layout.Items || []).some(function (item) {
            return item.Type === 'folder' ? (item.Items || []).some(counts) : counts(item);
        });
    }

    function scheduleApply() {
        if (state.applyScheduled) {
            return;
        }
        state.applyScheduled = true;
        requestAnimationFrame(function () {
            state.applyScheduled = false;
            if (!state.container || !state.container.isConnected || !checkSession()) {
                return;
            }
            if (!state.response) {
                if (canLoad()) {
                    ensureLoaded().then(scheduleApply).catch(function () { /* logged already */ });
                }
                return;
            }
            if (state.ctxStale) {
                state.ctxStale = false;
                const epoch = state.epoch;
                loadJfSections().then(function (sections) {
                    if (epoch !== state.epoch || !state.ctx) {
                        return;
                    }
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
        // Grace period of the empty home safety net (applyLayout).
        startSettling(container);
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
                                // The built-in home was re-rendered: the user may have changed their home settings,
                                // and the page is filling up again.
                                state.ctxStale = true;
                                startSettling(container);
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
        const loggedIn = checkSession();
        const container = findHomeContainer();
        if (container !== state.container) {
            attachContainer(container);
        }
        if (loggedIn && !state.response && !state.loadPromise && canLoad()) {
            // Also logged in on another page (the user menu entry is available everywhere), a new session on the
            // same home page, or a failed load whose retry is due.
            ensureLoaded().then(function () {
                injectMenuEntries();
                scheduleApply();
            }).catch(function () { /* logged already */ });
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

    function isLibrarySection(key) {
        return String(key || '').toLowerCase().indexOf('jf:latestmedia:') === 0;
    }

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
        const epoch = state.epoch;
        ensureLoaded().then(function () {
            if (epoch !== state.epoch) {
                return null;
            }
            if (mode === 'user' && !state.response.CanCustomize) {
                toast(t('notAllowed'));
                return null;
            }
            const layoutPromise = mode === 'default' ? apiGet('DefaultLayout') : Promise.resolve(state.layout);
            return Promise.all([loadCatalog(), loadUserViews(), layoutPromise]).then(function (results) {
                // Requested by someone who is gone: never open their layout in the next session.
                if (epoch === state.epoch) {
                    buildEditor(mode, results[0] || [], results[1] || [], results[2] || { Items: [] }, options);
                }
            });
        }).catch(function (error) {
            if (epoch === state.epoch) {
                console.error('[CustomizedHome] editor error', error);
                toast(t('loadError'));
            }
        });
    }

    function buildEditor(mode, catalog, userViews, layout, options) {
        const info = buildKnown(catalog, userViews, mode);
        const model = cloneLayout(layout);
        model.Hero = normalizeHero(model.Hero);
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
                        // A library section that is not among the user's libraries: removed or no longer accessible.
                        label: (definition ? familyLabel(catalogLabel(definition, lang)) : null)
                            || (isLibrarySection(item.Key) ? t('latestUnavailable') : (item.Label || item.Key)),
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
            // Without a home page under the editor (administration, other page) nothing is "displayed": list everything.
            hasHome: mode === 'user' && (state.discovered || []).length > 0,
            showAll: !(mode === 'user' && (state.discovered || []).length > 0),
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
            + '<button type="button" class="ch-icon-btn ch-close" data-ch-tip="' + escapeHtml(t('close')) + '" aria-label="' + escapeHtml(t('close')) + '"><span class="material-icons" aria-hidden="true">close</span></button>'
            + '</div>'
            + '<div class="ch-dialog-body">'
            + '<p class="ch-hint"></p>'
            + '<div class="ch-toolbar">'
            + '<div class="ch-search-box"><span class="material-icons" aria-hidden="true">search</span><input type="search" class="ch-search" autocomplete="off" /></div>'
            + '<label><input type="checkbox" class="ch-show-all" /> <span></span></label>'
            + '<button type="button" class="ch-btn ch-btn-primary ch-save ch-save-top"></button>'
            + '</div>'
            + '<div class="ch-legend">'
            + '<span class="ch-legend-item"><span class="material-icons ch-origin-customized" aria-hidden="true">house</span><span class="ch-legend-customized"></span></span>'
            + '<span class="ch-legend-item"><span class="ch-origin-jellyfin">' + JELLYFIN_LOGO + '</span><span class="ch-legend-jellyfin"></span></span>'
            + '</div>'
            + '<div class="ch-columns">'
            + '<div class="ch-col ch-col-layout"><h3 class="ch-col-title"></h3><div class="ch-hero-slot"></div><div class="ch-list"></div></div>'
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
        editor.heroSlot = dialog.querySelector('.ch-hero-slot');
        editor.columns = dialog.querySelector('.ch-columns');
        dialog.querySelector('.ch-legend-customized').textContent = t('legendCustomized');
        dialog.querySelector('.ch-legend-jellyfin').textContent = t('legendJellyfin');
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
        dialog.querySelector('.ch-show-all').parentNode.style.display = editor.hasHome ? '' : 'none';
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
        initTooltips(overlay);

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
        hideTooltip();
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
            // Sections rendered by this plugin only exist once added: they are always offered.
            return !used[entry.key] && (editor.showAll || editor.query || entry.present || entry.origin === 'customized');
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
        row.innerHTML = '<span class="material-icons ch-handle" data-ch-tip="' + escapeHtml(t('dragHandle')) + '" aria-hidden="true">drag_indicator</span>'
            + originIconHtml(entry.origin)
            + '<div class="ch-row-text"><div class="ch-row-title"></div><div class="ch-row-sub"></div></div>'
            + (badge ? '<span class="ch-row-format"></span>' : '')
            + '<div class="ch-row-actions">' + rowActionsHtml(item) + '</div>';
        row.querySelector('.ch-row-title').textContent = entry.label || item.Key;
        row.querySelector('.ch-row-sub').textContent = subtitle.join(' · ');
        if (badge) {
            const badgeNode = row.querySelector('.ch-row-format');
            badgeNode.textContent = badge;
            badgeNode.setAttribute('data-ch-tip', badge);
        }
        return row;
    }

    const JELLYFIN_LOGO = '<svg class="ch-origin-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .002C8.826.002-1.398 18.537.16 21.666c1.56 3.129 22.14 3.094 23.682 0C25.384 18.573 15.177 0 12 0zm7.76 18.949c-1.008 2.028-14.493 2.05-15.514 0C3.224 16.9 9.92 4.755 12.003 4.755c2.081 0 8.77 12.166 7.759 14.196zM12 9.198c-1.054 0-4.446 6.15-3.93 7.189.518 1.04 7.348 1.027 7.86 0 .511-1.027-2.874-7.19-3.93-7.19z"/></svg>';

    function originLegendKey(origin) {
        if (origin === 'customized') {
            return 'legendCustomized';
        }
        return origin === 'jellyfin' ? 'legendJellyfin' : 'legendOther';
    }

    // House = rendered by this plugin, Jellyfin logo = default web client section, puzzle = another plugin.
    function originIconHtml(origin) {
        const tip = ' data-ch-tip="' + escapeHtml(t(originLegendKey(origin))) + '"';
        if (origin === 'jellyfin') {
            return '<span class="ch-row-icon ch-origin-jellyfin"' + tip + '>' + JELLYFIN_LOGO + '</span>';
        }
        return '<span class="material-icons ch-row-icon ch-origin-' + (origin === 'customized' ? 'customized' : 'other') + '"' + tip + ' aria-hidden="true">'
            + (origin === 'customized' ? 'house' : 'extension') + '</span>';
    }

    function actionButton(className, title, icon) {
        return '<button type="button" class="ch-icon-btn ' + className + '" data-ch-tip="' + escapeHtml(title) + '" aria-label="' + escapeHtml(title) + '"><span class="material-icons" aria-hidden="true">' + icon + '</span></button>';
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
        if (item.ShowSectionTitle === false) {
            parts.push(t('noSectionTitle'));
        }
        if (item.Key === 'ch:allGenres' && genreStyleOf(item) !== 'posters') {
            parts.push(t(genreStyleOf(item) === 'custom' ? 'genreStyleCustom' : 'genreStyleColors'));
        }
        if (item.Key === 'ch:genre' && item.Genres && item.Genres.length) {
            parts.push(t('genresCount', item.Genres.length));
        }
        return parts.join(' · ');
    }

    function loadGenreNames() {
        if (!state.genreNames) {
            state.genreNames = fetchGenreList().then(function (genres) {
                return genres.map(function (genre) {
                    return genre.Name;
                });
            }).catch(function () {
                state.genreNames = null;
                return [];
            });
        }
        return state.genreNames;
    }

    // The menu stays open while options are toggled: it closes on an outside click or Escape.
    function openFormatMenu(anchor, item) {
        const menu = el('div', 'ch-format-menu');

        function apply(change) {
            materialize(item);
            change();
            renderEditor();
            fill();
        }

        function group(label) {
            const node = el('div', 'ch-popup-label');
            node.textContent = label;
            menu.appendChild(node);
        }

        function option(kind, icon, label, selected, change) {
            const symbol = kind === 'radio'
                ? (selected ? 'radio_button_checked' : icon)
                : (selected ? 'check_box' : 'check_box_outline_blank');
            const button = el('button', selected ? 'ch-selected' : '', '<span class="material-icons" aria-hidden="true">' + symbol + '</span><span></span>');
            button.type = 'button';
            button.setAttribute('role', kind === 'radio' ? 'menuitemradio' : 'menuitemcheckbox');
            button.setAttribute('aria-checked', selected ? 'true' : 'false');
            button.querySelector('span:last-child').textContent = label;
            button.addEventListener('click', function () {
                apply(change);
            });
            menu.appendChild(button);
            return button;
        }

        function fill() {
            const focused = menu.contains(document.activeElement) ? Array.prototype.indexOf.call(menu.children, document.activeElement) : -1;
            menu.innerHTML = '';
            const shape = item.Shape || 'auto';
            const size = item.Size || 'normal';
            group(t('shape'));
            [['auto', 'shapeAuto', 'tune'], ['portrait', 'shapePortrait', 'crop_portrait'], ['landscape', 'shapeLandscape', 'crop_landscape'], ['square', 'shapeSquare', 'crop_square']].forEach(function (choice) {
                option('radio', choice[2], t(choice[1]), shape === choice[0], function () {
                    item.Shape = choice[0];
                });
            });
            menu.appendChild(el('div', 'ch-popup-sep'));
            group(t('size'));
            [['small', 'sizeSmall', 'photo_size_select_small'], ['normal', 'sizeNormal', 'photo_size_select_actual'], ['large', 'sizeLarge', 'photo_size_select_large']].forEach(function (choice) {
                option('radio', choice[2], t(choice[1]), size === choice[0], function () {
                    item.Size = choice[0];
                });
            });
            menu.appendChild(el('div', 'ch-popup-sep'));
            group(t('sectionOptions'));
            option('check', '', t('showSectionTitle'), item.ShowSectionTitle !== false, function () {
                item.ShowSectionTitle = item.ShowSectionTitle === false;
            }).classList.add('ch-opt-section-title');
            group(t('cardOptions'));
            option('check', '', t('showTitles'), item.ShowTitle !== false, function () {
                item.ShowTitle = item.ShowTitle === false;
            }).classList.add('ch-opt-card-titles');

            if (item.Key === 'ch:allGenres') {
                menu.appendChild(el('div', 'ch-popup-sep'));
                group(t('genreStyle'));
                [['posters', 'genreStylePosters', 'collections'], ['custom', 'genreStyleCustom', 'image'], ['colors', 'genreStyleColors', 'palette']].forEach(function (choice) {
                    option('radio', choice[2], t(choice[1]), genreStyleOf(item) === choice[0], function () {
                        item.GenreStyle = choice[0];
                    }).classList.add('ch-opt-genre-style');
                });
            }

            if (item.Key === 'ch:genre') {
                item.Genres = item.Genres || [];
                menu.appendChild(el('div', 'ch-popup-sep'));
                group(t('genres') + ' · ' + (item.Genres.length ? t('genresCount', item.Genres.length) : t('genresAuto')));
                const holder = el('div', 'ch-genre-picker');
                const status = el('div', 'ch-popup-label');
                status.textContent = t('genresLoading');
                holder.appendChild(status);
                menu.appendChild(holder);
                loadGenreNames().then(function (names) {
                    if (!holder.isConnected) {
                        return;
                    }
                    holder.innerHTML = '';
                    if (!names.length) {
                        status.textContent = t('genresNone');
                        holder.appendChild(status);
                        return;
                    }
                    names.forEach(function (name) {
                        option('check', '', name, item.Genres.indexOf(name) >= 0, function () {
                            const index = item.Genres.indexOf(name);
                            if (index < 0) {
                                item.Genres.push(name);
                            } else {
                                item.Genres.splice(index, 1);
                            }
                        }).classList.add('ch-genre-option');
                    });
                    // option() appends to the menu: move the genre entries into their scrollable holder.
                    Array.prototype.forEach.call(menu.querySelectorAll(':scope > .ch-genre-option'), function (node) {
                        holder.appendChild(node);
                    });
                });
            }
            if (focused >= 0 && menu.children[focused] && menu.children[focused].focus) {
                menu.children[focused].focus();
            }
        }

        fill();
        showPopup(anchor, menu);
    }

    /* ---- hero row (pinned above the layout) ---- */

    function heroBadge(hero) {
        if (!hero.Sources.length) {
            return t('heroNoSource');
        }
        return [
            hero.Sources.map(function (source) {
                return t(HERO_SOURCES[source].labelKey);
            }).join(', '),
            t('heroCountBadge', hero.Count),
            hero.IntervalSeconds > 0 ? t('heroSeconds', hero.IntervalSeconds) : t('heroIntervalOff')
        ].join(' · ');
    }

    function renderHeroRow() {
        const slot = editor.heroSlot;
        slot.innerHTML = '';
        // The hero is rendered by the plugin: nothing to configure when the administrator disabled that.
        if (!state.response || !state.response.EnableIntegratedSections) {
            return;
        }
        const hero = editor.model.Hero;
        const row = el('div', 'ch-hero-row' + (hero.Enabled ? '' : ' ch-hero-row-off'));
        const toggleLabel = hero.Enabled ? t('heroDisable') : t('heroEnable');
        row.innerHTML = '<span class="material-icons ch-row-icon" aria-hidden="true">view_carousel</span>'
            + '<div class="ch-row-text"><div class="ch-row-title"></div><div class="ch-row-sub"></div></div>'
            + '<div class="ch-row-actions">'
            + '<button type="button" class="ch-icon-btn ch-hero-toggle" role="switch" aria-checked="' + (hero.Enabled ? 'true' : 'false') + '" data-ch-tip="' + escapeHtml(toggleLabel) + '" aria-label="' + escapeHtml(toggleLabel) + '">'
            + '<span class="material-icons" aria-hidden="true">' + (hero.Enabled ? 'toggle_on' : 'toggle_off') + '</span></button>'
            + actionButton('ch-hero-settings', t('heroSettings'), 'tune')
            + '</div>';
        row.querySelector('.ch-row-title').textContent = t('heroTitle');
        row.querySelector('.ch-row-sub').textContent = hero.Enabled ? heroBadge(hero) : t('heroHint');
        row.querySelector('.ch-hero-toggle').addEventListener('click', function () {
            hero.Enabled = !hero.Enabled;
            const needsSources = hero.Enabled && !hero.Sources.length;
            if (needsSources) {
                hero.Sources = HERO_DEFAULT_SOURCES.slice();
            }
            renderHeroRow();
            if (needsSources) {
                openHeroMenu(editor.heroSlot.querySelector('.ch-hero-settings'));
            }
        });
        row.querySelector('.ch-hero-settings').addEventListener('click', function (e) {
            openHeroMenu(e.currentTarget);
        });
        slot.appendChild(row);
    }

    // Same behavior as the format menu: it stays open while options are toggled.
    function openHeroMenu(anchor) {
        const hero = editor.model.Hero;
        const menu = el('div', 'ch-format-menu ch-hero-menu');

        function apply(change) {
            change();
            // A hero without source shows nothing: it is switched off rather than left empty.
            if (!hero.Sources.length) {
                hero.Enabled = false;
            }
            renderHeroRow();
            fill();
        }

        function group(label) {
            const node = el('div', 'ch-popup-label');
            node.textContent = label;
            menu.appendChild(node);
        }

        function option(kind, className, label, selected, change) {
            const symbol = kind === 'radio'
                ? (selected ? 'radio_button_checked' : 'radio_button_unchecked')
                : (selected ? 'check_box' : 'check_box_outline_blank');
            const button = el('button', className + (selected ? ' ch-selected' : ''), '<span class="material-icons" aria-hidden="true">' + symbol + '</span><span></span>');
            button.type = 'button';
            button.setAttribute('role', kind === 'radio' ? 'menuitemradio' : 'menuitemcheckbox');
            button.setAttribute('aria-checked', selected ? 'true' : 'false');
            button.querySelector('span:last-child').textContent = label;
            button.addEventListener('click', function () {
                apply(change);
            });
            menu.appendChild(button);
            return button;
        }

        function fill() {
            const active = menu.contains(document.activeElement) ? document.activeElement : null;
            const focused = active ? Array.prototype.indexOf.call(menu.children, active) : -1;
            const stepperFocus = active && active.parentNode.classList.contains('ch-hero-stepper') ? active.className : null;
            menu.innerHTML = '';
            group(t('heroSources'));
            Object.keys(HERO_SOURCES).forEach(function (source) {
                option('check', 'ch-hero-source', t(HERO_SOURCES[source].labelKey), hero.Sources.indexOf(source) >= 0, function () {
                    const index = hero.Sources.indexOf(source);
                    if (index < 0) {
                        hero.Sources.push(source);
                        hero.Enabled = true;
                    } else {
                        hero.Sources.splice(index, 1);
                    }
                    hero.Sources = normalizeHero(hero).Sources;
                }).dataset.chSource = source;
            });
            menu.appendChild(el('div', 'ch-popup-sep'));
            group(t('heroCount'));
            const stepper = el('div', 'ch-hero-stepper');
            stepper.innerHTML = actionButton('ch-hero-less', t('heroLess'), 'remove') + '<output class="ch-hero-count"></output>' + actionButton('ch-hero-more-count', t('heroMoreCount'), 'add');
            stepper.querySelector('.ch-hero-count').textContent = String(hero.Count);
            stepper.querySelector('.ch-hero-less').disabled = hero.Count <= HERO_MIN_COUNT;
            stepper.querySelector('.ch-hero-more-count').disabled = hero.Count >= HERO_MAX_COUNT;
            stepper.querySelector('.ch-hero-less').addEventListener('click', function () {
                apply(function () {
                    hero.Count = Math.max(HERO_MIN_COUNT, hero.Count - 1);
                });
            });
            stepper.querySelector('.ch-hero-more-count').addEventListener('click', function () {
                apply(function () {
                    hero.Count = Math.min(HERO_MAX_COUNT, hero.Count + 1);
                });
            });
            menu.appendChild(stepper);
            menu.appendChild(el('div', 'ch-popup-sep'));
            group(t('heroInterval'));
            // A value saved by another client stays selectable.
            HERO_INTERVALS.concat(HERO_INTERVALS.indexOf(hero.IntervalSeconds) < 0 ? [hero.IntervalSeconds] : []).forEach(function (seconds) {
                option('radio', 'ch-hero-interval', seconds > 0 ? t('heroSeconds', seconds) : t('heroIntervalOff'), hero.IntervalSeconds === seconds, function () {
                    hero.IntervalSeconds = seconds;
                });
            });
            menu.appendChild(el('div', 'ch-popup-sep'));
            group(t('heroFilters'));
            option('check', 'ch-hero-exclude-played', t('heroExcludePlayed'), hero.ExcludePlayed, function () {
                hero.ExcludePlayed = !hero.ExcludePlayed;
            });
            option('check', 'ch-hero-require-backdrop', t('heroRequireBackdrop'), hero.RequireBackdrop, function () {
                hero.RequireBackdrop = !hero.RequireBackdrop;
            });
            if (stepperFocus) {
                const target = Array.prototype.filter.call(stepper.querySelectorAll('button'), function (button) {
                    return button.className === stepperFocus && !button.disabled;
                })[0];
                if (target) {
                    target.focus();
                }
            } else if (focused >= 0 && menu.children[focused] && menu.children[focused].focus) {
                menu.children[focused].focus();
            }
        }

        fill();
        showPopup(anchor, menu);
    }

    function renderFolderRow(item, index, siblings) {
        const row = el('div', 'ch-row ch-row-folder' + (item.Visible === false ? ' ch-row-hidden' : ''));
        row._item = item;
        row._parent = null;
        row.innerHTML = '<span class="material-icons ch-handle" aria-hidden="true">drag_indicator</span>'
            + '<button type="button" class="ch-icon-btn ch-act-icon" data-ch-tip="' + escapeHtml(t('chooseIcon')) + '" aria-label="' + escapeHtml(t('chooseIcon')) + '"><span class="material-icons" aria-hidden="true">' + escapeHtml(item.Icon || 'folder') + '</span></button>'
            + '<input type="text" class="ch-folder-name" maxlength="100" placeholder="' + escapeHtml(t('folderName')) + '" />'
            + '<div class="ch-row-actions">'
            + '<button type="button" class="ch-icon-btn ch-act-visibility" data-ch-tip="' + escapeHtml(item.Visible === false ? t('show') : t('hide')) + '" aria-label="' + escapeHtml(item.Visible === false ? t('show') : t('hide')) + '"><span class="material-icons" aria-hidden="true">' + (item.Visible === false ? 'visibility_off' : 'visibility') + '</span></button>'
            + '<button type="button" class="ch-icon-btn ch-act-menu" data-ch-tip="' + escapeHtml(t('more')) + '" aria-label="' + escapeHtml(t('more')) + '"><span class="material-icons" aria-hidden="true">more_vert</span></button>'
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
        renderHeroRow();

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

    /* ---- tooltips ---- */

    let tooltip = null;

    function hideTooltip() {
        if (tooltip) {
            tooltip.remove();
            tooltip = null;
        }
    }

    function showTooltip(target) {
        hideTooltip();
        const text = target.getAttribute('data-ch-tip');
        if (!text) {
            return;
        }
        tooltip = el('div', 'ch-tooltip');
        tooltip.setAttribute('role', 'tooltip');
        tooltip.textContent = text;
        document.body.appendChild(tooltip);
        const rect = target.getBoundingClientRect();
        const width = tooltip.offsetWidth;
        const height = tooltip.offsetHeight;
        let left = rect.left + rect.width / 2 - width / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
        let top = rect.top - height - 8;
        if (top < 8) {
            top = rect.bottom + 8;
        }
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    }

    // Delegated: works for rows rebuilt by renderEditor. Shown on hover and on keyboard focus.
    function initTooltips(root) {
        function onEnter(e) {
            const target = e.target.closest ? e.target.closest('[data-ch-tip]') : null;
            // No tooltip while a menu is open: it would sit on top of the menu it belongs to.
            if (target && root.contains(target) && !popup) {
                showTooltip(target);
            }
        }
        root.addEventListener('mouseover', onEnter);
        root.addEventListener('focusin', onEnter);
        root.addEventListener('mouseout', hideTooltip);
        root.addEventListener('focusout', hideTooltip);
        root.addEventListener('pointerdown', hideTooltip);
    }

    /* ---- popup menus ---- */

    let popup = null;

    function closePopup() {
        if (popup) {
            popup.remove();
            popup = null;
            document.removeEventListener('pointerdown', onDocumentPointerDown, true);
            document.removeEventListener('keydown', onPopupKeyDown, true);
        }
    }

    function onDocumentPointerDown(e) {
        if (popup && !popup.contains(e.target)) {
            closePopup();
        }
    }

    function onPopupKeyDown(e) {
        if (popup && e.key === 'Escape') {
            // Close the menu only, not the editor behind it.
            e.stopPropagation();
            e.preventDefault();
            closePopup();
        }
    }

    function showPopup(anchor, node) {
        closePopup();
        // The tooltip of the button that opens the menu would sit on top of it.
        hideTooltip();
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
        document.addEventListener('keydown', onPopupKeyDown, true);
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
                // Never for a library section: the name of a library is not for everyone (default layout).
                Label: isLibrarySection(item.Key) ? null : ((editor.known[item.Key] && editor.known[item.Key].label) || item.Label || null),
                Visible: item.Visible !== false,
                Shape: item.Shape || 'auto',
                Size: item.Size || 'normal',
                ShowTitle: item.ShowTitle !== false,
                ShowSectionTitle: item.ShowSectionTitle !== false,
                Genres: item.Key === 'ch:genre' ? (item.Genres || []) : [],
                GenreStyle: item.Key === 'ch:allGenres' ? genreStyleOf(item) : 'posters'
            };
        }
        const hero = normalizeHero(model.Hero);
        hero.Enabled = hero.Enabled && hero.Sources.length > 0;
        return {
            Version: 1,
            // A layout with at least one section replaces the default home page.
            HideUnlisted: model.Items.length > 0,
            Hero: hero,
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
        const saveButtons = current.overlay.querySelectorAll('.ch-save');
        function setSaving(saving) {
            Array.prototype.forEach.call(saveButtons, function (button) {
                button.disabled = saving;
            });
        }
        setSaving(true);
        const epoch = state.epoch;
        apiSend('POST', path, payload).then(function (saved) {
            if (current.mode === 'user' && epoch === state.epoch) {
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
            if (editor === current) {
                closeEditor();
                if (current.embedded) {
                    openEditor(current.options);
                }
            }
        }).catch(function (error) {
            console.error('[CustomizedHome] save failed', error);
            setSaving(false);
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

    const NAVIGATION_SETTLE_MS = 300;

    function bootstrap() {
        const observer = new MutationObserver(scheduleScan);
        observer.observe(document.body, { childList: true, subtree: true });
        // jellyfin-web restores the cached home view without rendering it again: these are the moments to catch up.
        document.addEventListener('viewshow', function () {
            scheduleScan();
            requestRefresh();
        });
        document.addEventListener('visibilitychange', requestRefresh);
        window.addEventListener('hashchange', function () {
            setTimeout(function () {
                scheduleScan();
                requestRefresh();
            }, NAVIGATION_SETTLE_MS);
        });
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
