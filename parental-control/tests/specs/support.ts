import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Locator, Page } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(HERE, '../../Jellyfin.Plugin.ParentalControl');
const FIXTURES_DIR = resolve(HERE, '../fixtures');
const STUB_PATH = resolve(FIXTURES_DIR, 'apiClientStub.js');

export const SCRIPT_PATH = resolve(PLUGIN_DIR, 'Web/parental-control.js');
export const STYLE_PATH = resolve(PLUGIN_DIR, 'Web/parental-control.css');
export const CONFIG_PAGE_PATH = resolve(PLUGIN_DIR, 'Configuration/configPage.html');
export const WEB_FIXTURE_URL = pathToFileURL(resolve(FIXTURES_DIR, 'web.html')).href;

export type ElementKey = 'search' | 'favorites' | 'syncplay' | 'cast' | 'settings' | 'drawer' | 'signout';

export interface UsageToday {
    Enabled: boolean;
    UsedSeconds: number;
    LimitMinutes: number;
    BonusMinutes: number;
    RemainingSeconds: number | null;
    Exhausted: boolean;
}

export interface ClientContext {
    Controlled: boolean;
    HiddenElements: ElementKey[];
    LockSession: boolean;
    ParentPinSet: boolean;
    ScreenTime: UsageToday;
    WarningMinutes: number;
    ShowRemaining: boolean;
    AllowedNow: boolean;
    NextAllowed?: string | null;
    PluginVersion: string;
}

export interface ContentRule {
    Kind: 'Item' | 'Collection' | 'Genre' | 'Tag' | 'Label';
    Value: string;
    Name?: string | null;
    ItemType?: string | null;
}

export interface ScheduleWindow {
    DayOfWeek: string;
    StartHour: number;
    EndHour: number;
}

export interface Profile {
    UserId: string;
    Enabled: boolean;
    TagKey: string;
    Mode: 'BlockList' | 'AllowList';
    Hidden: ContentRule[];
    Allowed: ContentRule[];
    ScreenTime: { Enabled: boolean; DailyLimitMinutes: number[]; WarningMinutes: number; ShowRemaining: boolean };
    HiddenElements: ElementKey[];
    LockSession: boolean;
    PinSignIn: boolean;
}

export interface NativeSettings {
    MaxParentalRating: number | null;
    MaxParentalSubRating: number | null;
    BlockUnratedItems: string[];
    AccessSchedules: ScheduleWindow[];
    EnableAllFolders: boolean;
    EnabledFolders: string[];
    EnableRemoteAccess: boolean;
    EnableContentDownloading: boolean;
    EnableContentDeletion: boolean;
    EnableLiveTvAccess: boolean;
    EnableUserPreferenceAccess: boolean;
    EnableSyncPlay: boolean;
    MaxActiveSessions: number;
    ShowOnSignInScreen: boolean;
}

export interface FamilyMember {
    UserId: string;
    Name: string;
    PrimaryImageTag?: string | null;
    IsAdministrator: boolean;
    IsDisabled: boolean;
    HasProfile: boolean;
    Enabled: boolean;
    Mode: 'BlockList' | 'AllowList';
    RuleCount: number;
    Today?: UsageToday | null;
}

export interface ProfileView {
    User: FamilyMember;
    Profile: Profile;
    Native: NativeSettings;
    Usage: { Today: UsageToday; Days: { Date: string; Seconds: number; LimitMinutes: number }[]; History: { ItemId: string; Name: string; SeriesName?: string; DeviceName?: string; StartedUtc: string; Seconds: number }[] };
}

export interface Label {
    Id: string;
    Name: string;
    Color: string;
    Targets: ContentRule[];
}

export interface MockRequest {
    method: string;
    path: string;
    url?: string;
    body: unknown;
}

export interface MockOptions {
    userId?: string | null;
    me?: Record<string, ClientContext>;
    signIn?: { PinUsers: { Id: string; Length: number; AllowedNow: boolean }[] };
    family?: FamilyMember[];
    views?: Record<string, ProfileView>;
    labels?: Label[];
    status?: Record<string, unknown>;
    failures?: Record<string, { status?: number; message?: string }>;
    retryAfter?: number;
    signInDelay?: number;
}

export function usage(overrides: Partial<UsageToday> = {}): UsageToday {
    return { Enabled: false, UsedSeconds: 0, LimitMinutes: -1, BonusMinutes: 0, RemainingSeconds: null, Exhausted: false, ...overrides };
}

export function controlled(overrides: Partial<ClientContext> = {}): ClientContext {
    return {
        Controlled: true,
        HiddenElements: [],
        LockSession: false,
        ParentPinSet: true,
        ScreenTime: usage(),
        WarningMinutes: 5,
        ShowRemaining: true,
        AllowedNow: true,
        NextAllowed: null,
        PluginVersion: 'test',
        ...overrides
    };
}

export function nativeSettings(overrides: Partial<NativeSettings> = {}): NativeSettings {
    return {
        MaxParentalRating: null,
        MaxParentalSubRating: null,
        BlockUnratedItems: [],
        AccessSchedules: [],
        EnableAllFolders: true,
        EnabledFolders: [],
        EnableRemoteAccess: true,
        EnableContentDownloading: true,
        EnableContentDeletion: false,
        EnableLiveTvAccess: true,
        EnableUserPreferenceAccess: true,
        EnableSyncPlay: true,
        MaxActiveSessions: 0,
        ShowOnSignInScreen: true,
        ...overrides
    };
}

export function member(id: string, name: string, overrides: Partial<FamilyMember> = {}): FamilyMember {
    return { UserId: id, Name: name, IsAdministrator: false, IsDisabled: false, HasProfile: false, Enabled: false, Mode: 'BlockList', RuleCount: 0, Today: null, ...overrides };
}

export function profileView(user: FamilyMember, profile: Partial<Profile> = {}, native: Partial<NativeSettings> = {}): ProfileView {
    return {
        User: user,
        Profile: {
            UserId: user.UserId,
            Enabled: true,
            TagKey: user.HasProfile ? user.Name.toLowerCase() : '',
            Mode: 'BlockList',
            Hidden: [],
            Allowed: [],
            ScreenTime: { Enabled: false, DailyLimitMinutes: [90, 60, 60, 90, 60, 60, 90], WarningMinutes: 5, ShowRemaining: true },
            HiddenElements: [],
            LockSession: false,
            PinSignIn: false,
            ...profile
        },
        Native: nativeSettings(native),
        Usage: {
            Today: usage({ Enabled: true, UsedSeconds: 1500, LimitMinutes: 60, RemainingSeconds: 2100 }),
            Days: ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'].map((date, index) => ({ Date: date, Seconds: index * 900, LimitMinutes: 60 })),
            History: [{ ItemId: 'movie-1', Name: 'Bluey Movie', DeviceName: 'Living room TV', StartedUtc: '2026-10-20T08:00:00Z', Seconds: 1500 }]
        }
    };
}

async function inject(page: Page, options: MockOptions): Promise<void> {
    await page.evaluate((state) => {
        (window as unknown as { __mock: Record<string, unknown> }).__mock = state;
    }, { ...options } as Record<string, unknown>);
    await page.addScriptTag({ path: STUB_PATH });
}

/** The mocked web client with the plugin script and stylesheet. */
export async function openWeb(page: Page, options: MockOptions = {}, hash = '#/home'): Promise<void> {
    await page.goto(WEB_FIXTURE_URL + hash);
    if (options.userId === null) {
        await page.evaluate(() => document.getElementById('loginPage')?.classList.remove('hide'));
    }
    await inject(page, options);
    await page.addStyleTag({ path: STYLE_PATH });
    await page.addScriptTag({ path: SCRIPT_PATH });
}

/** Renders the administration page (body of configPage.html) like jellyfin-web does for plugin pages. */
export async function openAdminPage(page: Page, options: MockOptions = {}, language?: string, style?: string): Promise<void> {
    await page.goto(WEB_FIXTURE_URL);
    await page.evaluate(() => {
        document.querySelectorAll('body > :not(#adminHost)').forEach((node) => node.remove());
    });
    if (language) {
        await page.evaluate((code) => document.documentElement.setAttribute('lang', code), language);
    }
    if (style) {
        await page.addStyleTag({ content: style });
    }
    await inject(page, { userId: 'admin-id', ...options });
    const html = readFileSync(CONFIG_PAGE_PATH, 'utf8');
    const body = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
    await page.evaluate((markup) => {
        const host = document.querySelector('#adminHost');
        if (!host) {
            throw new Error('admin host missing');
        }
        // createContextualFragment keeps inline scripts executable, like jellyfin-web does for plugin pages.
        host.append(document.createRange().createContextualFragment(markup));
        document.querySelector('#ParentalControlConfigPage')?.dispatchEvent(new CustomEvent('pageshow'));
    }, body);
}

export async function requests(page: Page): Promise<MockRequest[]> {
    return page.evaluate(() => (window as unknown as { __mock: { requests: MockRequest[] } }).__mock.requests);
}

export async function lastRequest(page: Page, method: string, path: string): Promise<MockRequest | undefined> {
    return (await requests(page)).filter((request) => request.method === method && request.path === path).pop();
}

export async function mockValue<T>(page: Page, key: string): Promise<T> {
    return page.evaluate((name) => (window as unknown as { __mock: Record<string, unknown> }).__mock[name] as T, key);
}

/** Changes the mock from a test (another user signs in, the server answers differently...). */
export async function setMock(page: Page, changes: Record<string, unknown>): Promise<void> {
    await page.evaluate((values) => {
        Object.assign((window as unknown as { __mock: Record<string, unknown> }).__mock, values);
    }, changes);
}

export async function typeDigits(page: Page, digits: string): Promise<void> {
    for (const digit of digits) {
        await page.click(`.pc-key[data-key="${digit}"]`);
    }
}

/** Page colours of the light theme of jellyfin-web; the fixture is dark by default. */
export const LIGHT_DASHBOARD_STYLE = 'html, body { background-color: #f2f2f2; color: rgba(0, 0, 0, 0.87); }';

/**
 * WCAG contrast ratio between the text of an element and what is painted behind it (backgrounds of the ancestors
 * composited on a canvas, which understands the colours color-mix computes).
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
