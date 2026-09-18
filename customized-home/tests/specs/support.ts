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

export interface Layout {
    Version: number;
    HideUnlisted: boolean;
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
    body: unknown;
}

export interface MockOptions {
    layout?: Layout;
    defaultLayout?: Layout;
    hasUserLayout?: boolean;
    canCustomize?: boolean;
    enableIntegratedSections?: boolean;
    genreImages?: { Name: string; Version: number }[];
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

function mockState(options: MockOptions): Record<string, unknown> {
    return {
        catalog: CATALOG,
        genres: GENRES,
        genreImages: options.genreImages ?? [],
        defaultLayout: options.defaultLayout ?? EMPTY_LAYOUT,
        // The administration page reads the default layout summary from the plugin configuration.
        pluginConfiguration: { DefaultLayout: options.defaultLayout ?? EMPTY_LAYOUT },
        layoutResponse: {
            Source: options.layout ? 'user' : 'none',
            Layout: options.layout ?? EMPTY_LAYOUT,
            CanCustomize: options.canCustomize ?? true,
            HasUserLayout: options.hasUserLayout ?? options.layout !== undefined,
            IsAdministrator: true,
            ShowCustomizeButtonOnHome: true,
            ShowUserMenuEntry: true,
            FoldersCollapsible: true,
            EnableIntegratedSections: options.enableIntegratedSections ?? false,
            PluginVersion: 'test'
        }
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

/** Opens the mocked home page with the plugin script and stylesheet injected. */
export async function openHome(page: Page, options: MockOptions = {}): Promise<void> {
    await page.goto(HOME_FIXTURE_URL);
    await injectPlugin(page, options);
    await page.waitForSelector('#homeTab .sections.ch-container');
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
