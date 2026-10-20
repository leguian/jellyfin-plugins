/*
 * Parental Control - Jellyfin plugin client script.
 * Injected into the web client by the File Transformation plugin.
 *
 * For a controlled user: hides the chosen elements of the interface, asks for the parent PIN before signing out of a
 * locked session, shows the screen time left, and covers the app with a friendly screen when the time of the day is
 * used up or when the access schedule closes. On the sign-in page: a PIN pad for the users that sign in with a PIN.
 *
 * Nothing here is a security boundary. Content filtering, schedules and the screen time limit are enforced by the
 * server, in every client; this script only makes the web client pleasant and consistent with them.
 */
(function () {
    'use strict';

    if (window.ParentalControl && window.ParentalControl.loaded) {
        return;
    }

    const VERSION = '1.0.0.0';
    const API = 'ParentalControl';
    const STYLE_ID = 'pc-interface-style';
    const POLL_IDLE_MS = 60 * 1000;
    const POLL_PLAYING_MS = 20 * 1000;
    const POLL_URGENT_MS = 10 * 1000;
    const RETRY_BASE_MS = 5 * 1000;
    const RETRY_MAX_MS = 5 * 60 * 1000;
    const URGENT_SECONDS = 120;
    const SIGN_IN_CACHE_MS = 60 * 1000;
    const SIGN_IN_POLL_MS = 150;
    const SIGN_IN_TIMEOUT_MS = 20 * 1000;
    const TOAST_MS = 4000;
    const MIN_PIN = 4;
    const MAX_PIN = 8;
    const EXTEND_CHOICES = [15, 30, 60];
    const HOME_PATH = '/home';

    /*
     * Elements of the web client a profile can hide, for both layouts of jellyfin-web 10.11 / 12: the legacy one
     * (classes of libraryMenu.js) and the modern one (MUI, stable hooks only: href, aria-controls, icon test ids).
     * "css": hidden by a stylesheet rule. "icons": MUI icons whose button or menu entry is marked, then hidden.
     * "routes": pages left for the home page when they are opened anyway (link, bookmark, back button).
     */
    const ELEMENTS = dict({
        search: {
            css: ['.headerSearchButton', 'a[href^="#/search"]'],
            routes: ['/search']
        },
        favorites: {
            css: ['a[href="#/home?tab=1"]', 'a[href="#/home.html?tab=1"]', '[data-pc-home-tab="1"]'],
            routes: ['/favorites'],
            homeTab: '1'
        },
        syncplay: {
            css: ['.headerSyncButton', '[aria-controls="app-sync-play-menu"]']
        },
        cast: {
            css: ['.headerCastButton', '[aria-controls="app-remote-play-menu"]']
        },
        settings: {
            css: ['.btnSettings', '.headerUserButton', 'a[href^="#/mypreferences"]', 'a[href^="#/userprofile"]'],
            routes: ['/mypreferences', '/userprofile']
        },
        drawer: {
            css: ['.mainDrawerButton', '.mainDrawer', '.MuiDrawer-root', '.MuiAppBar-root a[href*="topParentId="]'],
            icons: ['MenuIcon']
        },
        signout: {
            css: ['.btnLogout', '.btnSelectServer'],
            icons: ['LogoutIcon', 'StorageIcon'],
            iconScope: '#app-user-menu'
        }
    });

    const I18N = {
        en: {
            timeLeft: '{0} left',
            timeLeftDetail: 'Screen time today: {0} used of {1}. {2} left.',
            timeLeftLabel: 'Screen time left today: {0}. Show the details.',
            endTitle: 'That\'s all for today!',
            endText: 'You used your {0} of screen time. See you tomorrow!',
            endTextNone: 'No screen time today. See you tomorrow!',
            askMore: 'A parent can add some time',
            scheduleTitle: 'Time for a break',
            scheduleText: 'You can come back {0}.',
            scheduleTextUnknown: 'Ask a parent when you can come back.',
            todayAt: 'today at {0}',
            tomorrowAt: 'tomorrow at {0}',
            dayAt: '{0} at {1}',
            signOut: 'Sign out',
            parentPin: 'Parent PIN',
            parentPinSignOut: 'Type the parent PIN to leave this session.',
            parentPinExtend: 'Type the parent PIN to add {0}.',
            wrongPin: 'Wrong PIN',
            retryIn: 'Too many attempts. Try again in {0} s.',
            pinUnavailable: 'The PIN could not be checked. Try again.',
            signInPin: 'Type your secret code',
            signInFailed: 'That is not the right code',
            signInSlow: 'The server does not answer. Try again.',
            pinBadge: 'Signs in with a code',
            cancel: 'Cancel',
            erase: 'Erase',
            confirm: 'OK',
            digit: '{0}',
            dotsKnown: '{0} of {1} digits typed',
            dotsUnknown: '{0} digit(s) typed',
            added: '{0} added. Enjoy!',
            minutes: '{0} min',
            hours: '{0} h',
            hoursMinutes: '{0} h {1}',
            seconds: '{0} s',
            lessThanMinute: 'less than a minute'
        },
        fr: {
            timeLeft: 'Encore {0}',
            timeLeftDetail: 'Temps d\'écran aujourd\'hui : {0} sur {1}. Il reste {2}.',
            timeLeftLabel: 'Temps d\'écran restant aujourd\'hui : {0}. Afficher le détail.',
            endTitle: 'C\'est fini pour aujourd\'hui !',
            endText: 'Tu as utilisé tes {0} d\'écran. À demain !',
            endTextNone: 'Pas d\'écran aujourd\'hui. À demain !',
            askMore: 'Un parent peut ajouter du temps',
            scheduleTitle: 'C\'est l\'heure de faire une pause',
            scheduleText: 'Tu pourras revenir {0}.',
            scheduleTextUnknown: 'Demande à un parent quand tu pourras revenir.',
            todayAt: 'aujourd\'hui à {0}',
            tomorrowAt: 'demain à {0}',
            dayAt: '{0} à {1}',
            signOut: 'Se déconnecter',
            parentPin: 'Code parent',
            parentPinSignOut: 'Saisissez le code parent pour quitter cette session.',
            parentPinExtend: 'Saisissez le code parent pour ajouter {0}.',
            wrongPin: 'Code incorrect',
            retryIn: 'Trop d\'essais. Réessayez dans {0} s.',
            pinUnavailable: 'Le code n\'a pas pu être vérifié. Réessayez.',
            signInPin: 'Tape ton code secret',
            signInFailed: 'Ce n\'est pas le bon code',
            signInSlow: 'Le serveur ne répond pas. Réessaie.',
            pinBadge: 'Connexion par code',
            cancel: 'Annuler',
            erase: 'Effacer',
            confirm: 'Valider',
            digit: '{0}',
            dotsKnown: '{0} chiffre(s) sur {1}',
            dotsUnknown: '{0} chiffre(s) saisi(s)',
            added: '{0} ajoutées. Profite bien !',
            minutes: '{0} min',
            hours: '{0} h',
            hoursMinutes: '{0} h {1}',
            seconds: '{0} s',
            lessThanMinute: 'moins d\'une minute'
        }
    };

    const state = {
        identity: null,
        epoch: 0,
        context: null,
        loading: null,
        failures: 0,
        pollTimer: null,
        countdownTimer: null,
        remaining: null,
        screen: null,
        screenKind: null,
        pill: null,
        pillOpen: false,
        lockInstalled: false,
        signIn: null,
        signInAt: 0,
        signInLoading: null,
        pad: null,
        scanScheduled: false
    };

    /* ------------------------------------------------------------------ */
    /* Utilities                                                           */
    /* ------------------------------------------------------------------ */

    // Map keyed by values the script does not choose: without a prototype, "constructor" is a key like any other.
    function dict(entries) {
        return Object.assign(Object.create(null), entries || {});
    }

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
            text = text.split('{' + (i - 1) + '}').join(String(arguments[i]));
        }
        return text;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
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

    function icon(name) {
        return '<span class="material-icons" aria-hidden="true">' + escapeHtml(name) + '</span>';
    }

    function apiUrl(path) {
        return apiClient().getUrl(API + '/' + path);
    }

    function apiGet(path) {
        return apiClient().getJSON(apiUrl(path));
    }

    function apiPost(path, body) {
        return apiClient().ajax({
            type: 'POST',
            url: apiUrl(path),
            data: JSON.stringify(body),
            contentType: 'application/json',
            dataType: 'json'
        });
    }

    // "1 h 05", "42 min", "less than a minute".
    function formatDuration(seconds) {
        const total = Math.max(0, Math.round(seconds));
        if (total > 0 && total < 60) {
            return t('lessThanMinute');
        }
        const minutes = Math.ceil(total / 60);
        if (minutes < 60) {
            return t('minutes', minutes);
        }
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        return rest === 0 ? t('hours', hours) : t('hoursMinutes', hours, rest < 10 ? '0' + rest : rest);
    }

    function routePath() {
        const hash = window.location.hash || '';
        const path = hash.indexOf('#') === 0 ? hash.substring(1) : hash;
        return path.split('?')[0] || '/';
    }

    function routeQuery() {
        const hash = window.location.hash || '';
        const index = hash.indexOf('?');
        return index < 0 ? '' : hash.substring(index + 1);
    }

    function isPlaying() {
        const media = document.querySelectorAll('video, audio');
        for (let i = 0; i < media.length; i++) {
            if (!media[i].paused && !media[i].ended) {
                return true;
            }
        }
        return false;
    }

    function pauseMedia() {
        Array.prototype.forEach.call(document.querySelectorAll('video, audio'), function (media) {
            try {
                media.pause();
            } catch (e) {
                /* the player owns it */
            }
        });
    }

    let toastTimer = null;

    function toast(message) {
        let node = document.querySelector('.pc-toast');
        if (!node) {
            node = el('div', 'pc-toast');
            node.setAttribute('role', 'status');
            node.setAttribute('aria-live', 'polite');
            document.body.appendChild(node);
        }
        node.textContent = message;
        node.classList.add('pc-toast-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            node.classList.remove('pc-toast-visible');
        }, TOAST_MS);
    }

    /* ------------------------------------------------------------------ */
    /* Session                                                             */
    /* ------------------------------------------------------------------ */

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

    // Sign out, someone else signs in, another server: nothing of the previous user may stay on screen.
    function resetSession() {
        state.epoch++;
        clearTimeout(state.pollTimer);
        clearInterval(state.countdownTimer);
        state.pollTimer = null;
        state.countdownTimer = null;
        state.context = null;
        state.loading = null;
        state.failures = 0;
        state.remaining = null;
        applyInterface(null);
        removeScreen();
        removePill();
        closePad(null);
    }

    function checkSession() {
        const identity = sessionIdentity();
        if (identity !== state.identity) {
            if (state.identity !== null) {
                resetSession();
            }
            state.identity = identity;
            if (identity) {
                loadContext();
            }
        }
        return identity !== null;
    }

    function loadContext() {
        if (state.loading) {
            return state.loading;
        }
        const epoch = state.epoch;
        state.loading = apiGet('Me').then(function (context) {
            if (epoch !== state.epoch) {
                return;
            }
            state.loading = null;
            state.failures = 0;
            applyContext(context);
            schedulePoll();
        }, function (error) {
            if (epoch !== state.epoch) {
                return;
            }
            state.loading = null;
            state.failures++;
            // The plugin may be gone (404) or the server unreachable: try again, more and more slowly.
            console.warn('[ParentalControl] could not load the settings of the current user', error);
            const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, state.failures - 1));
            clearTimeout(state.pollTimer);
            state.pollTimer = setTimeout(loadContext, delay);
        });
        return state.loading;
    }

    function schedulePoll() {
        clearTimeout(state.pollTimer);
        const context = state.context;
        if (!context || !context.Controlled) {
            // An administrator may turn the profile on later: a slow check is enough.
            state.pollTimer = setTimeout(loadContext, POLL_IDLE_MS * 5);
            return;
        }
        let delay = isPlaying() ? POLL_PLAYING_MS : POLL_IDLE_MS;
        if (state.remaining !== null && state.remaining <= URGENT_SECONDS) {
            delay = POLL_URGENT_MS;
        }
        state.pollTimer = setTimeout(loadContext, delay);
    }

    function applyContext(context) {
        state.context = context || null;
        const controlled = !!(context && context.Controlled);
        applyInterface(controlled ? context.HiddenElements || [] : null);
        if (controlled) {
            installLock();
        }

        const screenTime = controlled && context.ScreenTime ? context.ScreenTime : null;
        const limited = !!(screenTime && screenTime.Enabled && screenTime.RemainingSeconds !== null && screenTime.RemainingSeconds !== undefined);
        state.remaining = limited ? screenTime.RemainingSeconds : null;

        if (controlled && context.AllowedNow === false) {
            showScreen('schedule');
        } else if (limited && screenTime.Exhausted) {
            showScreen('end');
        } else {
            removeScreen();
        }

        if (limited && context.ShowRemaining && !screenTime.Exhausted && context.AllowedNow !== false) {
            renderPill();
        } else {
            removePill();
        }
        startCountdown();
    }

    // Between two answers of the server the time left goes down while something plays, so that the pill and the
    // end screen follow the playback to the second. The server stays the reference: the next answer corrects it.
    function startCountdown() {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
        if (state.remaining === null || state.remaining <= 0) {
            return;
        }
        state.countdownTimer = setInterval(function () {
            if (state.remaining === null || !isPlaying()) {
                return;
            }
            state.remaining = Math.max(0, state.remaining - 1);
            if (state.remaining === 0) {
                clearInterval(state.countdownTimer);
                state.countdownTimer = null;
                loadContext();
            } else if (state.remaining <= URGENT_SECONDS && state.remaining % 10 === 0) {
                loadContext();
            }
            updatePill();
        }, 1000);
    }

    /* ------------------------------------------------------------------ */
    /* Interface                                                           */
    /* ------------------------------------------------------------------ */

    // With its settings and sign out entries both hidden, the user menu of the modern layout would open empty.
    const EMPTY_USER_MENU = ['settings', 'signout'];

    function interfaceStyle() {
        return 'html.pc-hide-usermenu [aria-controls="app-user-menu"] { display: none !important; }\n' + Object.keys(ELEMENTS).map(function (key) {
            const selectors = ELEMENTS[key].css.concat(['[data-pc-el~="' + key + '"]']);
            return selectors.map(function (selector) {
                return 'html.pc-hide-' + key + ' ' + selector;
            }).join(',\n') + ' { display: none !important; }';
        }).join('\n');
    }

    function ensureStyle() {
        if (!document.getElementById(STYLE_ID)) {
            const style = el('style');
            style.id = STYLE_ID;
            style.textContent = interfaceStyle();
            document.head.appendChild(style);
        }
    }

    // keys: the hidden elements, or null for an unrestricted user.
    function applyInterface(keys) {
        const root = document.documentElement;
        const hidden = dict();
        (keys || []).forEach(function (key) {
            if (ELEMENTS[key]) {
                hidden[key] = true;
            }
        });
        Object.keys(ELEMENTS).forEach(function (key) {
            root.classList.toggle('pc-hide-' + key, !!hidden[key]);
        });
        root.classList.toggle('pc-hide-usermenu', EMPTY_USER_MENU.every(function (key) {
            return !!hidden[key];
        }));
        root.classList.toggle('pc-controlled', keys !== null);
        if (keys !== null) {
            ensureStyle();
            markElements();
            guardRoute();
        }
    }

    function hiddenKeys() {
        const context = state.context;
        return context && context.Controlled ? (context.HiddenElements || []) : [];
    }

    // MUI buttons and menu entries have no class of their own: they are found by their icon and marked.
    function markElements() {
        const keys = hiddenKeys();
        if (keys.length === 0) {
            return;
        }
        keys.forEach(function (key) {
            const definition = ELEMENTS[key];
            if (!definition || !definition.icons) {
                return;
            }
            const scope = definition.iconScope ? document.querySelector(definition.iconScope) : document;
            if (!scope) {
                return;
            }
            definition.icons.forEach(function (name) {
                Array.prototype.forEach.call(scope.querySelectorAll('svg[data-testid="' + name + '"]'), function (svg) {
                    const target = svg.closest('li, [role="menuitem"], button, a');
                    if (target) {
                        addMark(target, key);
                    }
                });
            });
        });

        // The legacy layout shows the tabs of the home page in the header: the second one is Favorites.
        Array.prototype.forEach.call(document.querySelectorAll('[data-pc-home-tab]'), function (node) {
            node.removeAttribute('data-pc-home-tab');
        });
        if (routePath() === HOME_PATH || routePath() === '/' || routePath() === '/home.html') {
            Array.prototype.forEach.call(document.querySelectorAll('.headerTabs .emby-tab-button[data-index]'), function (button) {
                button.setAttribute('data-pc-home-tab', button.getAttribute('data-index'));
            });
        }
    }

    function addMark(node, key) {
        const marks = (node.getAttribute('data-pc-el') || '').split(' ').filter(Boolean);
        if (marks.indexOf(key) < 0) {
            marks.push(key);
            node.setAttribute('data-pc-el', marks.join(' '));
        }
    }

    // A hidden page opened anyway (bookmark, history, a link elsewhere in the app) goes back to the home page.
    function guardRoute() {
        const keys = hiddenKeys();
        if (keys.length === 0) {
            return;
        }
        const path = routePath();
        const blocked = keys.some(function (key) {
            const definition = ELEMENTS[key];
            if (!definition) {
                return false;
            }
            if (definition.homeTab && path === HOME_PATH && new RegExp('(^|&)tab=' + definition.homeTab + '($|&)').test(routeQuery())) {
                return true;
            }
            return (definition.routes || []).some(function (route) {
                return path.indexOf(route) === 0;
            });
        });
        if (blocked) {
            window.location.replace('#' + HOME_PATH);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Locked session                                                      */
    /* ------------------------------------------------------------------ */

    function isLocked() {
        const context = state.context;
        return !!(context && context.Controlled && context.LockSession && context.ParentPinSet);
    }

    // Every way out of the session in jellyfin-web (user menu, drawer, settings page) calls Dashboard.logout or
    // Dashboard.selectServer: wrapping them covers all of them, whatever the layout.
    function installLock() {
        const dashboard = window.Dashboard;
        if (state.lockInstalled || !dashboard || typeof dashboard.logout !== 'function') {
            return;
        }
        state.lockInstalled = true;
        ['logout', 'selectServer'].forEach(function (name) {
            const original = dashboard[name];
            if (typeof original !== 'function') {
                return;
            }
            dashboard[name] = function () {
                const args = arguments;
                if (!isLocked()) {
                    return original.apply(dashboard, args);
                }
                askParentPin(t('parentPinSignOut')).then(function (granted) {
                    if (granted) {
                        original.apply(dashboard, args);
                    }
                });
                return undefined;
            };
        });
    }

    function askParentPin(subtitle) {
        return openPad({
            title: t('parentPin'),
            subtitle: subtitle,
            iconName: 'lock',
            length: 0,
            submit: function (pin) {
                return apiPost('Me/ParentPin', { Pin: pin }).then(pinOutcome, function () {
                    return { ok: false, message: t('pinUnavailable') };
                });
            }
        }).then(function (result) {
            return !!result;
        });
    }

    function pinOutcome(result) {
        if (result && result.Valid) {
            return { ok: true };
        }
        const wait = result && result.RetryAfterSeconds;
        return { ok: false, retryAfter: wait || 0, message: wait ? t('retryIn', wait) : t('wrongPin') };
    }

    /* ------------------------------------------------------------------ */
    /* Screen time pill                                                    */
    /* ------------------------------------------------------------------ */

    function renderPill() {
        if (!state.pill || !state.pill.isConnected) {
            const pill = el('div', 'pc-pill');
            pill.innerHTML = '<button type="button" class="pc-pill-button">' + icon('hourglass_bottom') + '<span class="pc-pill-text"></span></button>' +
                '<div class="pc-pill-detail" role="status" aria-live="polite"></div>';
            pill.querySelector('.pc-pill-button').addEventListener('click', function () {
                state.pillOpen = !state.pillOpen;
                updatePill();
            });
            document.body.appendChild(pill);
            state.pill = pill;
        }
        updatePill();
    }

    function updatePill() {
        const pill = state.pill;
        const context = state.context;
        if (!pill || !context || state.remaining === null) {
            return;
        }
        const screenTime = context.ScreenTime;
        const remaining = state.remaining;
        const warning = (context.WarningMinutes || 0) * 60;
        pill.classList.toggle('pc-pill-warn', warning > 0 && remaining <= warning);
        pill.classList.toggle('pc-pill-urgent', remaining <= 60);
        pill.classList.toggle('pc-pill-open', state.pillOpen);
        // Out of the way while a video fills the screen: the player has its own controls there.
        pill.classList.toggle('pc-pill-hidden', routePath().indexOf('/video') === 0);
        const text = formatDuration(remaining);
        pill.querySelector('.pc-pill-text').textContent = t('timeLeft', text);
        const button = pill.querySelector('.pc-pill-button');
        button.setAttribute('aria-label', t('timeLeftLabel', text));
        button.setAttribute('aria-expanded', state.pillOpen ? 'true' : 'false');
        const limitSeconds = ((screenTime.LimitMinutes || 0) + (screenTime.BonusMinutes || 0)) * 60;
        pill.querySelector('.pc-pill-detail').textContent = state.pillOpen
            ? t('timeLeftDetail', formatDuration(Math.max(0, limitSeconds - remaining)), formatDuration(limitSeconds), text)
            : '';
        const nowPlaying = document.querySelector('.nowPlayingBar:not(.hide)');
        pill.classList.toggle('pc-pill-raised', !!nowPlaying && nowPlaying.offsetHeight > 0);
    }

    function removePill() {
        if (state.pill) {
            state.pill.remove();
        }
        state.pill = null;
        state.pillOpen = false;
    }

    /* ------------------------------------------------------------------ */
    /* End of time and schedule screens                                    */
    /* ------------------------------------------------------------------ */

    function describeNext(iso) {
        const next = new Date(iso);
        if (isNaN(next.getTime())) {
            return null;
        }
        const lang = getLanguage();
        let time;
        try {
            time = next.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            time = next.toLocaleTimeString();
        }
        const today = new Date();
        const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
        if (next.toDateString() === today.toDateString()) {
            return t('todayAt', time);
        }
        if (next.toDateString() === tomorrow.toDateString()) {
            return t('tomorrowAt', time);
        }
        let day;
        try {
            day = next.toLocaleDateString(lang, { weekday: 'long' });
        } catch (e) {
            day = next.toDateString();
        }
        return t('dayAt', day, time);
    }

    function screenContent(kind) {
        const context = state.context;
        if (kind === 'schedule') {
            const when = context.NextAllowed ? describeNext(context.NextAllowed) : null;
            return {
                iconName: 'bedtime',
                title: t('scheduleTitle'),
                text: when ? t('scheduleText', when) : t('scheduleTextUnknown'),
                extend: false
            };
        }
        const screenTime = context.ScreenTime || {};
        const allowed = ((screenTime.LimitMinutes || 0) + (screenTime.BonusMinutes || 0)) * 60;
        return {
            iconName: 'hourglass_empty',
            title: t('endTitle'),
            text: allowed > 0 ? t('endText', formatDuration(allowed)) : t('endTextNone'),
            extend: !!context.ParentPinSet
        };
    }

    function showScreen(kind) {
        const content = screenContent(kind);
        pauseMedia();
        let screen = state.screen;
        if (!screen || !screen.isConnected) {
            screen = el('div', 'pc-screen');
            screen.setAttribute('role', 'alertdialog');
            screen.setAttribute('aria-modal', 'true');
            screen.setAttribute('aria-labelledby', 'pcScreenTitle');
            screen.setAttribute('aria-describedby', 'pcScreenText');
            document.body.appendChild(screen);
            state.screen = screen;
            screen.addEventListener('click', onScreenClick);
            screen.addEventListener('keydown', trapFocus);
        }
        const signature = kind + '|' + content.text + '|' + content.extend;
        if (screen.getAttribute('data-signature') === signature) {
            return;
        }
        screen.setAttribute('data-signature', signature);
        screen.className = 'pc-screen pc-screen-' + kind;
        const choices = content.extend ? EXTEND_CHOICES.map(function (minutes) {
            return '<button type="button" class="pc-chip" data-minutes="' + minutes + '">' + icon('add') + '<span>' + escapeHtml(formatDuration(minutes * 60)) + '</span></button>';
        }).join('') : '';
        screen.innerHTML =
            '<div class="pc-screen-sky" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>' +
            '<div class="pc-screen-card">' +
            '<div class="pc-screen-icon">' + icon(content.iconName) + '</div>' +
            '<h1 class="pc-screen-title" id="pcScreenTitle">' + escapeHtml(content.title) + '</h1>' +
            '<p class="pc-screen-text" id="pcScreenText">' + escapeHtml(content.text) + '</p>' +
            (content.extend ? '<div class="pc-screen-more"><p class="pc-screen-more-title">' + escapeHtml(t('askMore')) + '</p><div class="pc-chips">' + choices + '</div></div>' : '') +
            '<button type="button" class="pc-screen-signout">' + icon('logout') + '<span>' + escapeHtml(t('signOut')) + '</span></button>' +
            '</div>';
        state.screenKind = kind;
        document.documentElement.classList.add('pc-screen-open');
        const first = screen.querySelector('.pc-chip, .pc-screen-signout');
        if (first && !state.pad) {
            first.focus();
        }
    }

    function removeScreen() {
        if (state.screen) {
            state.screen.remove();
        }
        state.screen = null;
        state.screenKind = null;
        document.documentElement.classList.remove('pc-screen-open');
    }

    function onScreenClick(e) {
        const chip = e.target.closest('.pc-chip');
        if (chip) {
            extend(parseInt(chip.getAttribute('data-minutes'), 10));
            return;
        }
        if (e.target.closest('.pc-screen-signout') && window.Dashboard && typeof window.Dashboard.logout === 'function') {
            window.Dashboard.logout();
        }
    }

    function extend(minutes) {
        const label = formatDuration(minutes * 60);
        openPad({
            title: t('parentPin'),
            subtitle: t('parentPinExtend', label),
            iconName: 'more_time',
            length: 0,
            submit: function (pin) {
                return apiPost('Me/Extend', { Pin: pin, Minutes: minutes }).then(pinOutcome, function () {
                    return { ok: false, message: t('pinUnavailable') };
                });
            }
        }).then(function (result) {
            if (result) {
                toast(t('added', label));
                state.loading = null;
                loadContext();
            }
        });
    }

    function trapFocus(e) {
        if (e.key !== 'Tab') {
            return;
        }
        const container = e.currentTarget;
        const focusable = Array.prototype.filter.call(container.querySelectorAll('button:not([disabled])'), function (node) {
            return node.offsetParent !== null;
        });
        if (focusable.length === 0) {
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    /* ------------------------------------------------------------------ */
    /* PIN pad                                                             */
    /* ------------------------------------------------------------------ */

    /*
     * options: title, subtitle, iconName or avatar (CSS background-image value), length (0: unknown, confirm key),
     * submit(pin) -> Promise<{ ok, message, retryAfter }>. Resolves with true once submit succeeds, null when cancelled.
     */
    function openPad(options) {
        closePad(null);
        return new Promise(function (resolve) {
            const opener = document.activeElement;
            const backdrop = el('div', 'pc-pad-backdrop');
            const known = options.length >= MIN_PIN && options.length <= MAX_PIN ? options.length : 0;
            const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'erase', '0', known ? 'cancel' : 'confirm'];
            const visual = options.avatar
                ? '<div class="pc-pad-avatar" style="background-image:' + escapeHtml(options.avatar) + '"></div>'
                : '<div class="pc-pad-avatar pc-pad-avatar-icon">' + icon(options.iconName || 'lock') + '</div>';
            backdrop.innerHTML =
                '<div class="pc-pad" role="dialog" aria-modal="true" aria-labelledby="pcPadTitle" aria-describedby="pcPadSubtitle" tabindex="-1">' +
                '<button type="button" class="pc-pad-close" aria-label="' + escapeHtml(t('cancel')) + '">' + icon('close') + '</button>' +
                visual +
                '<h2 class="pc-pad-title" id="pcPadTitle">' + escapeHtml(options.title) + '</h2>' +
                '<p class="pc-pad-subtitle" id="pcPadSubtitle">' + escapeHtml(options.subtitle || '') + '</p>' +
                '<div class="pc-pad-dots" role="status" aria-live="polite"></div>' +
                '<p class="pc-pad-error" role="alert"></p>' +
                '<div class="pc-pad-keys">' + keys.map(function (key) {
                    if (key === 'erase') {
                        return '<button type="button" class="pc-key pc-key-action" data-key="erase" aria-label="' + escapeHtml(t('erase')) + '">' + icon('backspace') + '</button>';
                    }
                    if (key === 'confirm') {
                        return '<button type="button" class="pc-key pc-key-confirm" data-key="confirm" aria-label="' + escapeHtml(t('confirm')) + '">' + icon('check') + '</button>';
                    }
                    if (key === 'cancel') {
                        return '<button type="button" class="pc-key pc-key-action" data-key="cancel" aria-label="' + escapeHtml(t('cancel')) + '">' + icon('close') + '</button>';
                    }
                    return '<button type="button" class="pc-key" data-key="' + key + '">' + key + '</button>';
                }).join('') + '</div>' +
                '</div>';
            document.body.appendChild(backdrop);

            const pad = {
                backdrop: backdrop,
                digits: '',
                busy: false,
                lockedUntil: 0,
                lockTimer: null,
                resolve: resolve,
                opener: opener
            };
            state.pad = pad;
            const dots = backdrop.querySelector('.pc-pad-dots');
            const error = backdrop.querySelector('.pc-pad-error');

            function render() {
                const count = known || Math.max(MIN_PIN, pad.digits.length);
                let html = '';
                for (let i = 0; i < count; i++) {
                    html += '<span class="pc-dot' + (i < pad.digits.length ? ' pc-dot-filled' : '') + '"></span>';
                }
                dots.innerHTML = html + '<span class="pc-visually-hidden">' + escapeHtml(known ? t('dotsKnown', pad.digits.length, known) : t('dotsUnknown', pad.digits.length)) + '</span>';
                backdrop.classList.toggle('pc-pad-busy', pad.busy);
                const waiting = pad.lockedUntil > Date.now();
                Array.prototype.forEach.call(backdrop.querySelectorAll('.pc-key'), function (button) {
                    const key = button.getAttribute('data-key');
                    button.disabled = pad.busy || (waiting && key !== 'cancel') || (key === 'confirm' && pad.digits.length < MIN_PIN);
                });
            }

            function fail(message, retryAfter) {
                pad.digits = '';
                pad.busy = false;
                error.textContent = message || '';
                backdrop.querySelector('.pc-pad').classList.remove('pc-pad-shake');
                // Restarted on purpose: the same error twice must shake twice.
                void backdrop.offsetWidth;
                backdrop.querySelector('.pc-pad').classList.add('pc-pad-shake');
                if (retryAfter > 0) {
                    pad.lockedUntil = Date.now() + retryAfter * 1000;
                    clearInterval(pad.lockTimer);
                    pad.lockTimer = setInterval(function () {
                        const left = Math.ceil((pad.lockedUntil - Date.now()) / 1000);
                        if (left <= 0) {
                            clearInterval(pad.lockTimer);
                            error.textContent = '';
                            render();
                            return;
                        }
                        error.textContent = t('retryIn', left);
                    }, 1000);
                }
                render();
                if (!backdrop.contains(document.activeElement) || document.activeElement.disabled) {
                    backdrop.querySelector('.pc-pad').focus();
                }
            }

            function submit() {
                if (pad.busy || pad.digits.length < MIN_PIN || pad.lockedUntil > Date.now()) {
                    return;
                }
                pad.busy = true;
                error.textContent = '';
                // The keys are disabled while the server answers: the focus stays in the dialog, on the pad itself.
                backdrop.querySelector('.pc-pad').focus();
                render();
                const pin = pad.digits;
                Promise.resolve(options.submit(pin)).then(function (outcome) {
                    if (state.pad !== pad) {
                        return;
                    }
                    if (outcome && outcome.ok) {
                        closePad(true);
                    } else {
                        fail(outcome && outcome.message, outcome && outcome.retryAfter);
                    }
                }, function () {
                    if (state.pad === pad) {
                        fail(t('pinUnavailable'), 0);
                    }
                });
            }

            function press(key) {
                if (pad.busy) {
                    return;
                }
                if (key === 'cancel') {
                    closePad(null);
                    return;
                }
                if (pad.lockedUntil > Date.now()) {
                    return;
                }
                if (key === 'erase') {
                    pad.digits = pad.digits.substring(0, pad.digits.length - 1);
                } else if (key === 'confirm') {
                    submit();
                    return;
                } else if (/^[0-9]$/.test(key) && pad.digits.length < (known || MAX_PIN)) {
                    pad.digits += key;
                    if (error.textContent && pad.digits.length === 1 && !(pad.lockedUntil > Date.now())) {
                        error.textContent = '';
                    }
                }
                render();
                if (known && pad.digits.length === known) {
                    submit();
                }
            }

            pad.press = press;
            backdrop.addEventListener('click', function (e) {
                const button = e.target.closest('.pc-key');
                if (button && !button.disabled) {
                    press(button.getAttribute('data-key'));
                } else if (e.target.closest('.pc-pad-close') || e.target === backdrop) {
                    closePad(null);
                }
            });
            backdrop.addEventListener('keydown', function (e) {
                trapFocus(e);
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    closePad(null);
                } else if (/^[0-9]$/.test(e.key)) {
                    e.preventDefault();
                    // Typed on a keyboard: Enter must then confirm, not press the key that has the focus.
                    backdrop.querySelector('.pc-pad').focus();
                    press(e.key);
                } else if (e.key === 'Backspace') {
                    e.preventDefault();
                    press('erase');
                } else if (e.key === 'Enter' && !e.target.closest('.pc-key, .pc-pad-close')) {
                    e.preventDefault();
                    press('confirm');
                }
            });
            render();
            backdrop.querySelector('.pc-key[data-key="1"]').focus();
        });
    }

    function closePad(result) {
        const pad = state.pad;
        if (!pad) {
            return;
        }
        state.pad = null;
        clearInterval(pad.lockTimer);
        pad.backdrop.remove();
        if (pad.opener && typeof pad.opener.focus === 'function' && pad.opener.isConnected) {
            pad.opener.focus();
        }
        pad.resolve(result);
    }

    /* ------------------------------------------------------------------ */
    /* Sign-in page                                                        */
    /* ------------------------------------------------------------------ */

    function signInPage() {
        const page = document.getElementById('loginPage');
        return page && !page.classList.contains('hide') ? page : null;
    }

    function loadSignIn() {
        if (state.signIn && Date.now() - state.signInAt < SIGN_IN_CACHE_MS) {
            return Promise.resolve(state.signIn);
        }
        if (state.signInLoading) {
            return state.signInLoading;
        }
        const client = apiClient();
        if (!client || typeof client.getUrl !== 'function') {
            return Promise.resolve(null);
        }
        // Anonymous endpoint: nobody is signed in yet, so a plain fetch without the token of the API client.
        state.signInLoading = fetch(client.getUrl(API + '/SignIn'), { credentials: 'same-origin' }).then(function (response) {
            return response.ok ? response.json() : null;
        }).then(function (info) {
            state.signInLoading = null;
            state.signIn = dict();
            ((info && info.PinUsers) || []).forEach(function (user) {
                state.signIn[normalizeId(user.Id)] = { length: user.Length || 0, allowed: user.AllowedNow !== false };
            });
            state.signInAt = Date.now();
            return state.signIn;
        }, function () {
            state.signInLoading = null;
            return null;
        });
        return state.signInLoading;
    }

    // The server writes identifiers without dashes ("N"); compared the same way whatever the format.
    function normalizeId(id) {
        return String(id || '').replace(/-/g, '').toLowerCase();
    }

    function pinUserOf(card) {
        const content = card && card.querySelector('.cardContent[data-userid]');
        const pinUsers = state.signIn;
        if (!content || !pinUsers) {
            return null;
        }
        const id = normalizeId(content.getAttribute('data-userid'));
        const info = pinUsers[id];
        return info ? { id: id, name: content.getAttribute('data-username') || '', length: info.length, allowed: info.allowed, content: content } : null;
    }

    function decorateSignIn() {
        const page = signInPage();
        if (!page) {
            return;
        }
        loadSignIn().then(function () {
            Array.prototype.forEach.call(page.querySelectorAll('#divUsers .card'), function (card) {
                const user = pinUserOf(card);
                card.classList.toggle('pc-pin-card', !!user);
                card.classList.toggle('pc-pin-card-asleep', !!user && !user.allowed);
                let badge = card.querySelector('.pc-pin-badge');
                if (user) {
                    const name = user.allowed ? 'dialpad' : 'bedtime';
                    if (!badge) {
                        badge = el('span', 'pc-pin-badge');
                        (card.querySelector('.cardScalable') || card).appendChild(badge);
                    }
                    if (badge.getAttribute('data-icon') !== name) {
                        badge.setAttribute('data-icon', name);
                        badge.innerHTML = icon(name);
                    }
                    badge.title = user.allowed ? t('pinBadge') : t('scheduleTitle');
                } else if (badge) {
                    badge.remove();
                }
            });
        });
    }

    // Runs before the handler of jellyfin-web (capture phase): a PIN user gets the pad instead of the password form.
    function onSignInClick(e) {
        const page = signInPage();
        const card = page && e.target.closest ? e.target.closest('#divUsers .card') : null;
        const user = card ? pinUserOf(card) : null;
        if (!user || !page.querySelector('.manualLoginForm')) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        const image = card.querySelector('.cardImageContainer');
        const avatar = image && image.style.backgroundImage ? image.style.backgroundImage : null;
        if (!user.allowed) {
            showSignInBreak(user.name, avatar);
            return;
        }
        openPad({
            title: user.name,
            subtitle: t('signInPin'),
            avatar: avatar,
            iconName: 'face',
            length: user.length,
            submit: function (pin) {
                return nativeSignIn(page, user.name, pin);
            }
        });
    }

    // Outside the access schedule Jellyfin refuses the sign-in whatever the code: say why instead of asking for it.
    function showSignInBreak(name, avatar) {
        closePad(null);
        const opener = document.activeElement;
        const backdrop = el('div', 'pc-pad-backdrop');
        const visual = avatar
            ? '<div class="pc-pad-avatar" style="background-image:' + escapeHtml(avatar) + '"></div>'
            : '<div class="pc-pad-avatar pc-pad-avatar-icon">' + icon('bedtime') + '</div>';
        backdrop.innerHTML =
            '<div class="pc-pad pc-pad-break" role="dialog" aria-modal="true" aria-labelledby="pcPadTitle" aria-describedby="pcPadSubtitle" tabindex="-1">' +
            visual +
            '<h2 class="pc-pad-title" id="pcPadTitle">' + escapeHtml(name) + '</h2>' +
            '<p class="pc-pad-break-icon" aria-hidden="true">' + icon('bedtime') + '</p>' +
            '<p class="pc-pad-subtitle" id="pcPadSubtitle"><strong>' + escapeHtml(t('scheduleTitle')) + '</strong><br>' + escapeHtml(t('scheduleTextUnknown')) + '</p>' +
            '<button type="button" class="pc-screen-signout pc-pad-ok">' + icon('check') + '<span>' + escapeHtml(t('confirm')) + '</span></button>' +
            '</div>';
        document.body.appendChild(backdrop);
        const pad = { backdrop: backdrop, resolve: function () {}, opener: opener, lockTimer: null };
        state.pad = pad;
        backdrop.addEventListener('click', function (e) {
            if (e.target === backdrop || e.target.closest('.pc-pad-ok')) {
                closePad(null);
            }
        });
        backdrop.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closePad(null);
            }
        });
        backdrop.querySelector('.pc-pad-ok').focus();
    }

    // Signs in through the form of jellyfin-web, which then does everything a normal sign-in does (credentials,
    // remember me, navigation). It empties the password field when the server refuses: that is the failure signal.
    function nativeSignIn(page, name, pin) {
        const form = page.querySelector('.manualLoginForm');
        const nameInput = page.querySelector('#txtManualName');
        const passwordInput = page.querySelector('#txtManualPassword');
        const remember = page.querySelector('.chkRememberLogin');
        if (!form || !nameInput || !passwordInput) {
            return Promise.resolve({ ok: false, message: t('signInSlow') });
        }
        nameInput.value = name;
        passwordInput.value = pin;
        if (remember) {
            // A child's own device: no code to type again tomorrow.
            remember.checked = true;
        }
        if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
        } else {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
        const started = Date.now();
        return new Promise(function (resolve) {
            (function check() {
                if (currentUserId() || !signInPage()) {
                    resolve({ ok: true });
                } else if (passwordInput.value === '') {
                    resolve({ ok: false, message: t('signInFailed') });
                } else if (Date.now() - started > SIGN_IN_TIMEOUT_MS) {
                    passwordInput.value = '';
                    resolve({ ok: false, message: t('signInSlow') });
                } else {
                    setTimeout(check, SIGN_IN_POLL_MS);
                }
            })();
        });
    }

    /* ------------------------------------------------------------------ */
    /* Bootstrap                                                           */
    /* ------------------------------------------------------------------ */

    function scan() {
        state.scanScheduled = false;
        if (checkSession()) {
            if (state.context && state.context.Controlled) {
                markElements();
                guardRoute();
                installLock();
                if (state.screen && !state.screen.isConnected) {
                    // Something replaced the body content: put the screen back.
                    state.screen = null;
                    showScreen(state.screenKind || 'end');
                }
                updatePill();
            }
        } else {
            decorateSignIn();
        }
    }

    function scheduleScan() {
        if (state.scanScheduled) {
            return;
        }
        state.scanScheduled = true;
        (window.requestAnimationFrame || setTimeout)(scan);
    }

    function bootstrap() {
        const observer = new MutationObserver(scheduleScan);
        observer.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('click', onSignInClick, true);
        document.addEventListener('viewshow', scheduleScan);
        window.addEventListener('hashchange', scheduleScan);
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && state.identity) {
                loadContext();
            }
        });
        scheduleScan();
    }

    window.ParentalControl = {
        loaded: true,
        version: VERSION,
        refresh: function () {
            state.loading = null;
            return loadContext();
        },
        context: function () {
            return state.context;
        }
    };

    if (document.body) {
        bootstrap();
    } else {
        document.addEventListener('DOMContentLoaded', bootstrap);
    }
})();
