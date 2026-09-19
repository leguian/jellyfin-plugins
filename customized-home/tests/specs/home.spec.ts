import { expect, test } from '@playwright/test';
import { HOME_FIXTURE_URL, injectPlugin, openHome, visibleSectionTitles, type Layout } from './support';

const LAYOUT: Layout = {
    Version: 1,
    HideUnlisted: false,
    Items: [
        { Type: 'section', Key: 'jf:nextup', Visible: true },
        { Type: 'section', Key: 'jf:latestmedia:lib-shows', Visible: true, Shape: 'landscape', Size: 'large', ShowTitle: false },
        { Type: 'section', Key: 'jf:resume', Visible: false },
        { Type: 'section', Key: 'jf:smalllibrarytiles', Visible: true }
    ]
};

test('keeps the native order without a layout', async ({ page }) => {
    await openHome(page);
    expect(await visibleSectionTitles(page)).toEqual([
        'My Media', 'Continue Watching', 'Next Up', 'Recently Added in Movies', 'Recently Added in Shows'
    ]);
});

test('applies order, visibility and display format from the layout', async ({ page }) => {
    await openHome(page, { layout: LAYOUT });
    // "Recently Added in Movies" is not part of the layout: a non-empty layout replaces the default home page.
    await expect.poll(() => visibleSectionTitles(page)).toEqual(['Next Up', 'Recently Added in Shows', 'My Media']);
    const shows = page.locator('#homeTab .verticalSection', { hasText: 'Recently Added in Shows' });
    await expect(shows).toHaveClass(/ch-shape-landscape/);
    await expect(shows).toHaveClass(/ch-size-large/);
    await expect(shows).toHaveClass(/ch-notitle/);
});

test('ignores the stored HideUnlisted flag: any non-empty layout hides the unlisted sections', async ({ page }) => {
    await openHome(page, { layout: { ...LAYOUT, HideUnlisted: false } });
    await expect.poll(() => visibleSectionTitles(page)).toEqual(['Next Up', 'Recently Added in Shows', 'My Media']);
});

test('offers no customize button when customization is disabled', async ({ page }) => {
    await openHome(page, { canCustomize: false });
    await expect(page.locator('.ch-customize-button')).toHaveCount(0);
});

test('does nothing on a page without the home container', async ({ page }) => {
    await page.goto(HOME_FIXTURE_URL);
    await page.evaluate(() => document.querySelector('#indexPage')?.remove());
    await expect(page.locator('.ch-container')).toHaveCount(0);
});

test('a row whose title links to a library is keyed by the library id, whatever the language and the home settings', async ({ page }) => {
    await page.goto(HOME_FIXTURE_URL);
    // Titles in a language the plugin has no catalog for, and home settings that cannot be read.
    await page.evaluate(() => {
        document.querySelectorAll('.section6 h2').forEach((heading, index) => {
            heading.textContent = index === 0 ? 'Kürzlich hinzugefügt in Filme' : 'Kürzlich hinzugefügt in Privat';
        });
    });
    await injectPlugin(page, { failures: { 'GET DisplayPreferences': -1 } });
    await page.waitForSelector('#homeTab .sections.ch-container');

    const keys = await page.evaluate(() => (window as unknown as { CustomizedHome: { sections(): { key: string }[] } }).CustomizedHome.sections().map((entry) => entry.key));
    // Never "title:kurzlich-hinzugefugt-in-privat": a key built from the title would carry the library name around.
    expect(keys).toContain('jf:latestmedia:lib-movies');
    expect(keys).toContain('jf:latestmedia:lib-shows');
    expect(keys.filter((key) => key.includes('privat') || key.includes('filme'))).toEqual([]);
});
