import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Locator, Page } from '@playwright/test';

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

export interface LayoutFolder {
    Type: 'folder';
    Id: string;
    Name: string;
    Icon?: string;
    Visible: boolean;
    Collapsed?: boolean;
    Items: LayoutSection[];
}

/** Layouts saved by earlier versions may hold folders; the editor no longer creates them. */
export interface FolderLayout extends Omit<Layout, 'Items'> {
    Items: (LayoutSection | LayoutFolder)[];
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
    layout?: Layout | FolderLayout;
    defaultLayout?: Layout | FolderLayout;
    hasUserLayout?: boolean;
    canCustomize?: boolean;
    enableIntegratedSections?: boolean;
    genreImages?: { Name: string; Shape?: 'portrait' | 'landscape' | 'square'; Version: number }[];
    /** Users that saved a layout, as the administration page lists them. */
    userLayouts?: { UserId: string; UserName: string; SectionCount: number; ModifiedUtc: string }[];
    heroItems?: Partial<Record<HeroSource, HeroItem[]>>;
    /** Replaces the three default genres. */
    genres?: { Id: string; Name: string; Type: string }[];
    /** Layout per user id, for tests that switch users; the other options apply to everyone. */
    layoutsByUser?: Record<string, Layout>;
    resumeItems?: CardItem[];
    /** "<METHOD> <path>" -> number of failures (-1: always). */
    failures?: Record<string, number>;
    /** "<METHOD> <path>" -> milliseconds before the answer. */
    delays?: Record<string, number>;
    /** Stylesheet text injected instead of the plugin stylesheet (see legacyEngineStyle). */
    style?: string;
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

function layoutResponse(options: MockOptions, layout: Layout | FolderLayout | undefined): Record<string, unknown> {
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
        genres: options.genres ?? GENRES,
        genreImages: options.genreImages ?? [],
        userLayouts: options.userLayouts ?? [],
        heroItems: options.heroItems ?? {},
        defaultLayout: options.defaultLayout ?? EMPTY_LAYOUT,
        // The administration page reads the default layout summary from the plugin configuration.
        pluginConfiguration: { DefaultLayout: options.defaultLayout ?? EMPTY_LAYOUT },
        layoutResponse: layoutResponse(options, options.layout)
    };
}

/** Seeds the mock, then loads the stub, the stylesheet and the plugin script into the current page. */
export async function injectPlugin(page: Page, options: MockOptions): Promise<void> {
    await page.evaluate((state) => {
        (window as unknown as { __mock: Record<string, unknown> }).__mock = state;
    }, mockState(options));
    await page.addScriptTag({ path: STUB_PATH });
    await page.addStyleTag(options.style === undefined ? { path: STYLE_PATH } : { content: options.style });
    await page.addScriptTag({ path: SCRIPT_PATH });
}

/** Values and properties that Chromium up to 79 (webOS up to 6) and iOS up to 14.4 do not know. */
const MODERN_VALUE = /(^|[^a-z-])(clamp|min|max)\(|color-mix\(/;

export function isModernDeclaration(property: string, value: string): boolean {
    return property === 'inset' || MODERN_VALUE.test(value);
}

/**
 * The plugin stylesheet as an older engine reads it: declarations it does not know are dropped one by one, and a
 * rule whose selector it does not know (:focus-visible, :focus-within) is dropped as a whole.
 */
export function legacyEngineStyle(): string {
    const css = readFileSync(STYLE_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    return css
        .replace(/([^{}]*)\{([^{}]*)\}/g, (rule: string, selector: string) => (/:focus-visible|:focus-within/.test(selector) ? '' : rule))
        .replace(/([\w-]+)\s*:\s*([^;{}]+);/g, (declaration: string, property: string, value: string) => (isModernDeclaration(property, value) ? '' : declaration));
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
export async function openAdminPage(page: Page, options: MockOptions = {}, language?: string): Promise<void> {
    await page.goto(HOME_FIXTURE_URL);
    await page.evaluate(() => document.querySelector('#indexPage')?.remove());
    // Before the page script runs: it reads the language once, when it builds its string table.
    if (language) {
        await page.evaluate((code) => document.documentElement.setAttribute('lang', code), language);
    }
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

/** Page colours of the light theme of jellyfin-web (src/themes/light/theme.scss); the fixture is dark by default. */
export const LIGHT_DASHBOARD_STYLE = 'html, body { background-color: #f2f2f2; color: rgba(0, 0, 0, 0.87); }';

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

/**
 * WCAG contrast ratio between the text of an element and what is painted behind it. Backgrounds and opacities of
 * the ancestors are composited on a canvas, which understands every colour syntax the engine computes
 * (color-mix results come back as "color(srgb ...)").
 */
export async function textContrast(target: Locator): Promise<number> {
    return target.first().evaluate((node) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('no 2d context');
        }
        const chain: Element[] = [];
        for (let element: Element | null = node; element; element = element.parentElement) {
            chain.unshift(element);
        }
        const pixel = (): number[] => Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
        const luminance = (rgb: number[]): number => {
            const [r = 0, g = 0, b = 0] = rgb.map((value) => {
                const channel = value / 255;
                return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 1, 1);
        let opacity = 1;
        for (const element of chain) {
            const style = getComputedStyle(element);
            opacity *= parseFloat(style.opacity);
            context.globalAlpha = opacity;
            context.fillStyle = style.backgroundColor;
            context.fillRect(0, 0, 1, 1);
        }
        const background = luminance(pixel());
        context.globalAlpha = opacity;
        context.fillStyle = getComputedStyle(node).color;
        context.fillRect(0, 0, 1, 1);
        const text = luminance(pixel());
        return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
    });
}

/** Painted colours of an element that WCAG treats as a UI component boundary. */
export type SurfaceColour = 'backgroundColor' | 'borderTopColor' | 'outlineColor';

/**
 * WCAG contrast ratio between one painted colour of an element and what is painted *behind* the element
 * (its ancestors only, so the element's own background does not become its own reference). Used for the
 * boundaries of a UI component: the fill of a button, its border, its focus ring. The colour is read from
 * the computed style, which resolves color-mix to a "color(srgb ...)" the canvas understands.
 */
export async function surfaceContrast(target: Locator, property: SurfaceColour): Promise<number> {
    return target.first().evaluate((node, read) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('no 2d context');
        }
        const chain: Element[] = [];
        for (let element: Element | null = node.parentElement; element; element = element.parentElement) {
            chain.unshift(element);
        }
        const pixel = (): number[] => Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
        const luminance = (rgb: number[]): number => {
            const [r = 0, g = 0, b = 0] = rgb.map((value) => {
                const channel = value / 255;
                return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 1, 1);
        let opacity = 1;
        for (const element of chain) {
            const style = getComputedStyle(element);
            opacity *= parseFloat(style.opacity);
            context.globalAlpha = opacity;
            context.fillStyle = style.backgroundColor;
            context.fillRect(0, 0, 1, 1);
        }
        const behind = luminance(pixel());
        context.globalAlpha = opacity;
        context.fillStyle = getComputedStyle(node)[read];
        context.fillRect(0, 0, 1, 1);
        const front = luminance(pixel());
        return (Math.max(front, behind) + 0.05) / (Math.min(front, behind) + 0.05);
    }, property);
}

export async function recordedRequests(page: Page): Promise<MockRequest[]> {
    return page.evaluate(() => (window as unknown as MockWindow).__mock.requests);
}

export async function rowTitles(page: Page, listSelector: string): Promise<string[]> {
    return page.locator(`${listSelector} .ch-row .ch-row-title`).allTextContents();
}
