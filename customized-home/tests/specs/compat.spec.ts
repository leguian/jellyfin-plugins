import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { isModernDeclaration, legacyEngineStyle, openEditor, openHome, STYLE_PATH, visibleSectionTitles, type HeroItem, type Layout } from './support';

// Older engines still served by jellyfin-web (webOS up to 6 = Chromium 79 and older, iOS up to 14.4). No such engine
// runs here: the stylesheet is checked as text, then loaded the way such an engine reads it (unknown declarations
// and rules dropped). What a real old engine does with the rest of the page is not covered.

interface Declaration {
    property: string;
    value: string;
}

interface Rule {
    selector: string;
    declarations: Declaration[];
}

function parseRules(css: string): Rule[] {
    const rules: Rule[] = [];
    const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of text.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
        const declarations = (match[2] ?? '').split(';').map((chunk) => chunk.trim()).filter((chunk) => chunk.length > 0).map((chunk) => {
            const colon = chunk.indexOf(':');
            return { property: chunk.slice(0, colon).trim(), value: chunk.slice(colon + 1).trim().replace(/\s+/g, ' ') };
        });
        rules.push({ selector: (match[1] ?? '').trim().replace(/\s+/g, ' '), declarations });
    }
    return rules;
}

const RULES = parseRules(readFileSync(STYLE_PATH, 'utf8'));

const LAYOUT: Layout = {
    Version: 1,
    HideUnlisted: true,
    Items: [
        { Type: 'section', Key: 'jf:nextup', Visible: true },
        { Type: 'section', Key: 'jf:latestmedia:lib-shows', Visible: true },
        { Type: 'section', Key: 'jf:smalllibrarytiles', Visible: true },
        { Type: 'section', Key: 'jf:resume', Visible: false }
    ]
};

const HERO_MOVIE: HeroItem = { Id: 'movie-1', Name: 'First Movie', Type: 'Movie', BackdropImageTags: ['backdrop-1'], UserData: {} };
const HERO_SHOW: HeroItem = { Id: 'show-1', Name: 'First Show', Type: 'Series', BackdropImageTags: ['backdrop-2'], UserData: {} };

const HERO_LAYOUT: Layout = {
    ...LAYOUT,
    Hero: { Enabled: true, Sources: ['recentMovies', 'recentShows'], Count: 2, IntervalSeconds: 0, ExcludePlayed: true, RequireBackdrop: true }
};

test('the stylesheet parses into rules (guard of the checks below)', () => {
    expect(RULES.length).toBeGreaterThan(150);
    expect(RULES.some((rule) => rule.selector === '.ch-overlay')).toBe(true);
});

test('no "inset" shorthand: offsets are written as top / right / bottom / left', () => {
    const offenders = RULES.filter((rule) => rule.declarations.some((declaration) => declaration.property === 'inset')).map((rule) => rule.selector);
    expect(offenders).toEqual([]);
    const overlay = RULES.find((rule) => rule.selector === '.ch-overlay');
    expect(overlay?.declarations.filter((declaration) => ['top', 'right', 'bottom', 'left'].includes(declaration.property)).map((declaration) => declaration.value)).toEqual(['0', '0', '0', '0']);
});

test('every clamp(), min(), max() and color-mix() value follows a plain declaration of the same property', () => {
    const offenders: string[] = [];
    let modern = 0;
    for (const rule of RULES) {
        rule.declarations.forEach((declaration, index) => {
            if (!isModernDeclaration(declaration.property, declaration.value)) {
                return;
            }
            modern++;
            const fallback = rule.declarations.slice(0, index).some((earlier) => earlier.property === declaration.property
                && !isModernDeclaration(earlier.property, earlier.value)
                && (!declaration.value.includes('color-mix(') || /rgba\(|#[0-9a-f]{3,8}\b/i.test(earlier.value)));
            if (!fallback) {
                offenders.push(`${rule.selector} { ${declaration.property}: ${declaration.value} }`);
            }
        });
    }
    expect(offenders).toEqual([]);
    // The stylesheet does use these values: an empty list above must not come from a parser that sees nothing.
    expect(modern).toBeGreaterThan(30);
});

test('no rule removes the focus outline while its own focus style may be dropped', () => {
    const offenders = RULES.filter((rule) => rule.declarations.some((declaration) => declaration.property === 'outline' && /^(none|0)$/.test(declaration.value))
        && rule.declarations.some((declaration) => declaration.value.includes('color-mix(')));
    expect(offenders.map((rule) => rule.selector)).toEqual([]);
    // An engine without :focus-visible drops the whole rule: it must not take a hover or TV focus style with it.
    const mixed = RULES.filter((rule) => rule.selector.includes(':focus-visible') && rule.selector.split(',').some((part) => !part.includes(':focus-visible')));
    expect(mixed.map((rule) => rule.selector)).toEqual([]);
});

test('keyboard focus is ringed on the home button and in the editor', async ({ page }) => {
    await openHome(page, { layout: LAYOUT });
    const button = page.locator('.ch-customize-button');
    await button.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    await expect(button).toHaveCSS('outline-style', 'solid');
    await expect(button).toHaveCSS('outline-color', 'rgb(0, 164, 220)');

    await page.keyboard.press('Enter');
    await page.waitForSelector('.ch-overlay .ch-list .ch-row');
    await page.keyboard.press('Tab');
    const focused = page.locator('.ch-overlay :focus');
    await expect(focused).toHaveCount(1);
    await expect(focused).toHaveCSS('outline-style', 'solid');
});

test('read by an older engine, the editor still covers the page and keeps its surfaces and focus outlines', async ({ page }) => {
    const style = legacyEngineStyle();
    expect(style).not.toMatch(/color-mix\(|clamp\(|inset:|:focus-visible/);
    await openHome(page, { layout: LAYOUT, style });
    const button = page.locator('.ch-customize-button');
    expect(await button.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgba(128, 128, 128, 0.16)');
    await button.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    // The outline of the engine itself: nothing removed it.
    await expect(button).not.toHaveCSS('outline-style', 'none');

    await openEditor(page);
    const viewport = page.viewportSize();
    const overlay = await page.locator('.ch-overlay').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });
    expect(overlay).toEqual({ left: 0, top: 0, width: viewport?.width, height: viewport?.height });
    const row = page.locator('.ch-overlay .ch-list .ch-row').first();
    expect(await row.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgba(128, 128, 128, 0.12)');
    expect(await row.evaluate((node) => getComputedStyle(node).borderTopColor)).toBe('rgba(128, 128, 128, 0.18)');
});

test('read by an older engine, the hero keeps its height and its slides fill it', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 700 });
    await openHome(page, { layout: HERO_LAYOUT, enableIntegratedSections: true, heroItems: { recentMovies: [HERO_MOVIE], recentShows: [HERO_SHOW] }, style: legacyEngineStyle() });
    const hero = page.locator('.ch-hero');
    await expect(hero).toHaveCount(1);
    const sizes = await hero.evaluate((node) => {
        const size = (selector: string): { width: number; height: number } => {
            const rect = node.querySelector(selector)?.getBoundingClientRect();
            return { width: Math.round(rect?.width ?? 0), height: Math.round(rect?.height ?? 0) };
        };
        const own = node.getBoundingClientRect();
        return { hero: { width: Math.round(own.width), height: Math.round(own.height) }, slide: size('.ch-hero-slide.ch-active'), backdrop: size('.ch-hero-slide.ch-active .ch-hero-backdrop'), shade: size('.ch-hero-shade') };
    });
    expect(sizes.hero.height).toBeGreaterThanOrEqual(Math.round(700 * 0.82));
    expect(sizes.slide).toEqual(sizes.hero);
    expect(sizes.backdrop).toEqual(sizes.hero);
    expect(sizes.shade).toEqual(sizes.hero);
    const content = await page.locator('.ch-hero-slide.ch-active .ch-hero-content').evaluate((node) => {
        const style = getComputedStyle(node);
        return { width: node.getBoundingClientRect().width, paddingLeft: parseFloat(style.paddingLeft) };
    });
    expect(content.width).toBeGreaterThan(400);
    expect(content.paddingLeft).toBeGreaterThan(0);
});

test.describe('engine without "display: contents"', () => {
    test.beforeEach(async ({ page }) => {
        // The engine under test knows it: only the answer given to the script is replaced, which is what decides.
        await page.addInitScript(() => {
            const original = CSS.supports.bind(CSS);
            CSS.supports = ((...args: [string, string?]): boolean => (args[0] === 'display' && args[1] === 'contents'
                ? false
                : (args[1] === undefined ? original(args[0]) : original(args[0], args[1])))) as typeof CSS.supports;
        });
    });

    test('the container keeps its native flow: sections are hidden and formatted, never pinned or reordered', async ({ page }) => {
        await openHome(page, { layout: LAYOUT });
        const container = page.locator('#homeTab .sections');
        await expect(container).not.toHaveClass(/ch-ordered/);
        await expect(container).toHaveCSS('display', 'block');
        await expect(page.locator('#homeTab .section6')).toHaveCSS('display', 'block');
        // Hidden and unlisted sections are gone, the others keep the order of the web client.
        await expect(page.locator('#homeTab .section1')).toBeHidden();
        const titles = await page.locator('#homeTab .sections .verticalSection h2').evaluateAll((nodes) => nodes
            .filter((node) => (node as HTMLElement).offsetParent !== null)
            .map((node) => node.textContent?.trim() ?? ''));
        expect(titles).toEqual(['My Media', 'Next Up', 'Recently Added in Shows']);
    });

    test('the hero is inserted at the top of the page instead of relying on "order"', async ({ page }) => {
        await openHome(page, { layout: HERO_LAYOUT, enableIntegratedSections: true, heroItems: { recentMovies: [HERO_MOVIE], recentShows: [HERO_SHOW] } });
        const hero = page.locator('#homeTab .sections > .ch-hero');
        await expect(hero).toHaveCount(1);
        expect(await hero.evaluate((node) => node === node.parentElement?.firstElementChild)).toBe(true);
        expect(await hero.evaluate((node) => Math.round(node.getBoundingClientRect().top + window.scrollY))).toBe(0);
        const firstSectionTop = await page.locator('#homeTab .section0').evaluate((node) => node.getBoundingClientRect().top);
        const heroBottom = await hero.evaluate((node) => node.getBoundingClientRect().bottom);
        // The first section starts in the dissolving end of the hero (-1.5em), never above it.
        expect(firstSectionTop).toBeGreaterThan(heroBottom - 40);
    });
});

test('with "display: contents" the container is ordered by flex as before', async ({ page }) => {
    await openHome(page, { layout: LAYOUT });
    const container = page.locator('#homeTab .sections');
    await expect(container).toHaveClass(/ch-ordered/);
    await expect(container).toHaveCSS('display', 'flex');
    await expect(page.locator('#homeTab .section6')).toHaveCSS('display', 'contents');
    expect(await visibleSectionTitles(page)).toEqual(['Next Up', 'Recently Added in Shows', 'My Media']);
});
