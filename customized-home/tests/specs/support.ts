import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(HERE, '../../Jellyfin.Plugin.CustomizedHome');
const FIXTURES_DIR = resolve(HERE, '../fixtures');
const STUB_PATH = resolve(FIXTURES_DIR, 'apiClientStub.js');

export const SCRIPT_PATH = resolve(PLUGIN_DIR, 'Web/customized-home.js');
export const STYLE_PATH = resolve(PLUGIN_DIR, 'Web/customized-home.css');
export const CONFIG_PAGE_PATH = resolve(PLUGIN_DIR, 'Configuration/configPage.html');
export const HOME_FIXTURE_URL = pathToFileURL(resolve(FIXTURES_DIR, 'home.html')).href;

export interface LayoutSection {
    Type: 'section';
    Key: string;
    Visible: boolean;
    Label?: string | null;
    Shape?: string;
    Size?: string;
    ShowTitle?: boolean;
    ShowSectionTitle?: boolean;
    Genres?: string[];
    GenreStyle?: 'posters' | 'custom' | 'colors';
}

export type HeroSource = 'random' | 'recentMovies' | 'recentShows' | 'latestMovies' | 'latestShows';

export interface HeroSettings {
    Enabled: boolean;
    Sources: HeroSource[];
    Count: number;
    IntervalSeconds: number;
    ExcludePlayed: boolean;
    RequireBackdrop: boolean;
}

export interface HeroItem {
    Id: string;
    Name: string;
    Type: 'Movie' | 'Series';
    MediaType?: string;
    IsFolder?: boolean;
    Overview?: string;
    ProductionYear?: number;
    RunTimeTicks?: number;
    OfficialRating?: string;
    CommunityRating?: number;
    CriticRating?: number;
    Genres?: string[];
    LocalTrailerCount?: number;
    RemoteTrailers?: { Url: string }[];
    ImageTags?: Record<string, string>;
    BackdropImageTags?: string[];
    UserData?: { PlaybackPositionTicks?: number; IsFavorite?: boolean; Played?: boolean };
}

export interface Layout {
    Version: number;
    HideUnlisted: boolean;
    Hero?: HeroSettings;
    Items: LayoutSection[];
}

export interface CatalogEntry {
    Key: string;
    Origin: 'customized' | 'jellyfin' | 'hss';
    Category: string;
    IsFamily: boolean;
    Labels: Record<string, string>;
}

export interface MockRequest {
    method: string;
    path: string;
    url?: string;
    body: unknown;
    failed?: boolean;
    /** Date.now() of the page when the request was made (the fake clock when one is installed). */
    ts?: number;
}

export interface CardItem {
    Id: string;
    Name: string;
    Type: string;
    UserData?: { PlaybackPositionTicks?: number; PlayedPercentage?: number };
}

export interface MockOptions {
    layout?: Layout;
    defaultLayout?: Layout;
    hasUserLayout?: boolean;
    canCustomize?: boolean;
    enableIntegratedSections?: boolean;
    genreImages?: { Name: string; Shape?: 'portrait' | 'landscape' | 'square'; Version: number }[];
    heroItems?: Partial<Record<HeroSource, HeroItem[]>>;
    /** Layout per user id, for tests that switch users; the other options apply to everyone. */
    layoutsByUser?: Record<string, Layout>;
    resumeItems?: CardItem[];
    /** "<METHOD> <path>" -> number of failures (-1: always). */
    failures?: Record<string, number>;
    /** "<METHOD> <path>" -> milliseconds before the answer. */
    delays?: Record<string, number>;
}

interface MockWindow {
    __mock: { requests: MockRequest[] } & Record<string, unknown>;
}

function entry(key: string, origin: CatalogEntry['Origin'], label: string, isFamily = false): CatalogEntry {
    return { Key: key, Origin: origin, Category: 'general', IsFamily: isFamily, Labels: { en: label } };
}

/** Subset of the server catalog: enough to identify the fixture sections and to search absent ones. */
export const CATALOG: CatalogEntry[] = [
    entry('ch:combined', 'customized', 'Continue Watching / Next Up'),
    entry('ch:genre', 'customized', 'Genre: {0}', true),
    entry('ch:allGenres', 'customized', 'All genres'),
    entry('jf:smalllibrarytiles', 'jellyfin', 'My Media'),
    entry('jf:resume', 'jellyfin', 'Continue Watching'),
    entry('jf:resumeaudio', 'jellyfin', 'Continue Listening'),
    entry('jf:resumebook', 'jellyfin', 'Continue Reading'),
    entry('jf:nextup', 'jellyfin', 'Next Up'),
    entry('jf:latestmedia', 'jellyfin', 'Recently Added in {0}', true),
    entry('jf:livetv', 'jellyfin', 'Live TV')
];

export const EMPTY_LAYOUT: Layout = { Version: 1, HideUnlisted: false, Items: [] };

export const GENRES = [
    { Id: 'genre-action', Name: 'Action', Type: 'Genre' },
    { Id: 'genre-comedy', Name: 'Comedy', Type: 'Genre' },
    { Id: 'genre-drama', Name: 'Drama', Type: 'Genre' }
];

function layoutResponse(options: MockOptions, layout: Layout | undefined): Record<string, unknown> {
    return {
        Source: layout ? 'user' : 'none',
        Layout: layout ?? EMPTY_LAYOUT,
        CanCustomize: options.canCustomize ?? true,
        HasUserLayout: options.hasUserLayout ?? layout !== undefined,
        IsAdministrator: true,
        ShowCustomizeButtonOnHome: true,
        ShowUserMenuEntry: true,
        FoldersCollapsible: true,
        EnableIntegratedSections: options.enableIntegratedSections ?? false,
        PluginVersion: 'test'
    };
}

function mockState(options: MockOptions): Record<string, unknown> {
    const layoutResponses: Record<string, unknown> = {};
    for (const [userId, layout] of Object.entries(options.layoutsByUser ?? {})) {
        layoutResponses[userId] = layoutResponse(options, layout);
    }
    return {
        layoutResponses,
        resumeItems: options.resumeItems ?? [],
        failures: options.failures ?? {},
        delays: options.delays ?? {},
        catalog: CATALOG,
        genres: GENRES,
        genreImages: options.genreImages ?? [],
        heroItems: options.heroItems ?? {},
        defaultLayout: options.defaultLayout ?? EMPTY_LAYOUT,
        // The administration page reads the default layout summary from the plugin configuration.
        pluginConfiguration: { DefaultLayout: options.defaultLayout ?? EMPTY_LAYOUT },
        layoutResponse: layoutResponse(options, options.layout)
    };
}

async function injectPlugin(page: Page, options: MockOptions): Promise<void> {
    await page.evaluate((state) => {
        (window as unknown as { __mock: Record<string, unknown> }).__mock = state;
    }, mockState(options));
    await page.addScriptTag({ path: STUB_PATH });
    await page.addStyleTag({ path: STYLE_PATH });
    await page.addScriptTag({ path: SCRIPT_PATH });
}

/** Loads the mocked home page and the plugin without waiting for a layout to be applied (failing server...). */
export async function loadHome(page: Page, options: MockOptions = {}): Promise<void> {
    await page.goto(HOME_FIXTURE_URL);
    await injectPlugin(page, options);
}

/** Opens the mocked home page with the plugin script and stylesheet injected. */
export async function openHome(page: Page, options: MockOptions = {}): Promise<void> {
    await loadHome(page, options);
    await page.waitForSelector('#homeTab .sections.ch-container');
}

/** Changes window.__mock from a test, then touches the DOM like jellyfin-web does all the time. */
export async function updateMock(page: Page, changes: Record<string, unknown>): Promise<void> {
    await page.evaluate((values) => {
        Object.assign((window as unknown as MockWindow).__mock, values);
        document.body.appendChild(document.createElement('i')).remove();
    }, changes);
}

/** jellyfin-web threw the cached home view away and rendered a new one: same native sections, new container. */
export async function rebuildHomeView(page: Page): Promise<void> {
    await page.evaluate(() => {
        const container = document.querySelector('#homeTab .sections');
        if (!container) {
            throw new Error('home container missing');
        }
        const fresh = container.cloneNode(true) as HTMLElement;
        fresh.querySelectorAll('.ch-section, .ch-hero, .ch-folder, .ch-customize-bar, .ch-notice').forEach((node) => node.remove());
        fresh.className = 'sections homeSectionsContainer';
        container.replaceWith(fresh);
    });
}

/** jellyfin-web dispatches a bubbling "viewshow" on the view it shows again (back navigation, end of playback). */
export async function showHomeAgain(page: Page): Promise<void> {
    await page.evaluate(() => document.querySelector('#indexPage')?.dispatchEvent(new CustomEvent('viewshow', { bubbles: true })));
}

/** Opens the user editor (modal) from the home page button. */
export async function openEditor(page: Page): Promise<void> {
    await page.click('.ch-customize-button');
    await page.waitForSelector('.ch-overlay .ch-list .ch-row');
}

/** Renders the administration page standalone (body of configPage.html) with the plugin script available. */
export async function openAdminPage(page: Page, options: MockOptions = {}): Promise<void> {
    await page.goto(HOME_FIXTURE_URL);
    await page.evaluate(() => document.querySelector('#indexPage')?.remove());
    await injectPlugin(page, options);
    const html = readFileSync(CONFIG_PAGE_PATH, 'utf8');
    const body = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
    await page.evaluate((markup) => {
        const host = document.querySelector('#adminHost');
        if (!host) {
            throw new Error('admin host missing');
        }
        // createContextualFragment keeps inline scripts executable, like jellyfin-web does for plugin pages.
        host.append(document.createRange().createContextualFragment(markup));
        document.querySelector('#CustomizedHomeConfigPage')?.dispatchEvent(new CustomEvent('pageshow'));
    }, body);
}

/** Visible home sections in visual (flex order) order, by title. */
export async function visibleSectionTitles(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll<HTMLElement>('#homeTab .sections .verticalSection'));
        return nodes
            .filter((node) => node.querySelector('h2') !== null && getComputedStyle(node).display !== 'none')
            .sort((a, b) => Number(a.style.order) - Number(b.style.order))
            .map((node) => node.querySelector('h2')?.textContent?.trim() ?? '');
    });
}

export async function recordedRequests(page: Page): Promise<MockRequest[]> {
    return page.evaluate(() => (window as unknown as MockWindow).__mock.requests);
}

export async function rowTitles(page: Page, listSelector: string): Promise<string[]> {
    return page.locator(`${listSelector} .ch-row .ch-row-title`).allTextContents();
}
