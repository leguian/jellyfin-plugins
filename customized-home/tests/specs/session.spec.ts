import { expect, test, type Page } from '@playwright/test';
import {
    loadHome, openEditor, openHome, recordedRequests, rowTitles, showHomeAgain, updateMock, visibleSectionTitles,
    type CardItem, type HeroItem, type Layout, type LayoutSection
} from './support';

const NATIVE_HOME = ['My Media', 'Continue Watching', 'Next Up', 'Recently Added in Movies', 'Recently Added in Shows'];
const COMBINED_TITLE = 'Continue Watching / Next Up';

function section(key: string): LayoutSection {
    return { Type: 'section', Key: key, Visible: true };
}

function layoutOf(keys: string[], hero = false): Layout {
    return {
        Version: 1,
        HideUnlisted: true,
        Items: keys.map(section),
        Hero: { Enabled: hero, Sources: hero ? ['recentMovies'] : [], Count: 3, IntervalSeconds: 0, ExcludePlayed: true, RequireBackdrop: true }
    };
}

function heroMovie(id: string, positionTicks = 0): HeroItem {
    return { Id: id, Name: 'Movie ' + id, Type: 'Movie', MediaType: 'Video', BackdropImageTags: ['b'], UserData: { PlaybackPositionTicks: positionTicks } };
}

const PRIVATE_RESUME: CardItem[] = [{ Id: 'resume-1', Name: 'Private Movie', Type: 'Movie' }];

async function requestCount(page: Page, predicate: (url: string) => boolean): Promise<number> {
    return (await recordedRequests(page)).filter((request) => predicate(request.url ?? request.path)).length;
}

function combinedCards(page: Page): ReturnType<Page['locator']> {
    return page.locator('.ch-section[data-ch-key="ch:combined"] .ch-card');
}

test('another user logging in in the same tab gets their own layout and nothing of the previous one', async ({ page }) => {
    await openHome(page, {
        enableIntegratedSections: true,
        layoutsByUser: { 'user-1': layoutOf(['ch:combined', 'jf:nextup'], true), 'user-2': layoutOf(['jf:smalllibrarytiles']) },
        resumeItems: PRIVATE_RESUME,
        heroItems: { recentMovies: [heroMovie('private-hero')] }
    });
    await expect(combinedCards(page)).toHaveCount(1);
    await expect(page.locator('.ch-hero-slide')).toHaveCount(1);
    await expect(page.locator('html')).toHaveClass(/ch-hero-under-header/);
    await expect.poll(() => visibleSectionTitles(page)).toEqual([COMBINED_TITLE, 'Next Up']);

    // jellyfin-web logs out and in again without reloading the page.
    await updateMock(page, { userId: 'user-2', resumeItems: [] });

    await expect.poll(() => visibleSectionTitles(page)).toEqual(['My Media']);
    await expect(page.locator('.ch-section')).toHaveCount(0);
    await expect(page.locator('.ch-hero')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveClass(/ch-hero-under-header/);
    await expect(page.getByText('Private Movie')).toHaveCount(0);
    expect(await requestCount(page, (url) => url === 'CustomizedHome/Layout')).toBe(2);

    // The editor starts from the new user's layout, not from the one kept in memory.
    await openEditor(page);
    expect(await rowTitles(page, '.ch-list')).toEqual(['My Media']);
});

test('switching back within the cache lifetime never serves the other user cached rows', async ({ page }) => {
    const shared = layoutOf(['ch:combined']);
    await openHome(page, { enableIntegratedSections: true, layoutsByUser: { 'user-1': shared, 'user-2': shared }, resumeItems: PRIVATE_RESUME });
    await expect(combinedCards(page)).toHaveCount(1);

    await updateMock(page, { userId: 'user-2', resumeItems: [{ Id: 'resume-2', Name: 'Kids Movie', Type: 'Movie' }] });
    await expect(page.getByText('Kids Movie').first()).toBeVisible();
    await expect(page.getByText('Private Movie')).toHaveCount(0);
    expect(await requestCount(page, (url) => url.startsWith('UserItems/Resume'))).toBe(2);
});

test('logging out gives the native home page back and closes the editor', async ({ page }) => {
    await openHome(page, { enableIntegratedSections: true, layout: layoutOf(['ch:combined', 'jf:nextup']), resumeItems: PRIVATE_RESUME });
    await expect(combinedCards(page)).toHaveCount(1);
    await openEditor(page);

    await updateMock(page, { userId: null });

    await expect(page.locator('.ch-overlay')).toHaveCount(0);
    await expect(page.locator('.ch-section, .ch-customize-bar')).toHaveCount(0);
    await expect.poll(() => visibleSectionTitles(page)).toEqual(NATIVE_HOME);
});

test('rows that depend on what was watched are reloaded when the home page is shown again, the others are not', async ({ page }) => {
    await page.clock.install();
    await openHome(page, { enableIntegratedSections: true, layout: layoutOf(['ch:combined', 'ch:latestMovies', 'jf:nextup']), resumeItems: PRIVATE_RESUME });
    await expect(combinedCards(page)).toHaveCount(1);
    const latestRequests = await requestCount(page, (url) => url.includes('sortBy=PremiereDate'));

    // Shown again right away: nothing is old enough to be fetched again.
    await showHomeAgain(page);
    await page.clock.runFor(500);
    expect(await requestCount(page, (url) => url.startsWith('UserItems/Resume'))).toBe(1);

    // The user watched something for a while, then comes back.
    await updateMock(page, { resumeItems: [{ Id: 'resume-9', Name: 'Next Episode', Type: 'Movie' }] });
    await page.clock.fastForward(20_000);
    await showHomeAgain(page);
    await expect(page.getByText('Next Episode').first()).toBeVisible();
    await expect(page.getByText('Private Movie')).toHaveCount(0);
    await expect(page.locator('.ch-section[data-ch-key="ch:combined"]')).toHaveCount(1);
    expect(await requestCount(page, (url) => url.startsWith('UserItems/Resume'))).toBe(2);
    expect(await requestCount(page, (url) => url.includes('sortBy=PremiereDate'))).toBe(latestRequests);
});

test('reloading the hero keeps the media in front and refreshes its resume position', async ({ page }) => {
    await page.clock.install();
    const movies = [heroMovie('m1'), heroMovie('m2'), heroMovie('m3')];
    await openHome(page, { enableIntegratedSections: true, layout: layoutOf(['jf:nextup'], true), heroItems: { recentMovies: movies } });
    await page.locator('.ch-hero-dot').nth(1).click();
    const active = page.locator('.ch-hero-slide.ch-active');
    await expect(active).toHaveAttribute('data-id', 'm2');
    await expect(active.locator('.ch-hero-play')).toHaveAttribute('data-action', 'play');

    await updateMock(page, { heroItems: { recentMovies: [heroMovie('m1'), heroMovie('m2', 42), heroMovie('m3')] } });
    await page.clock.fastForward(20_000);
    await showHomeAgain(page);

    await expect(active.locator('.ch-hero-play')).toHaveAttribute('data-action', 'resume');
    await expect(active).toHaveAttribute('data-id', 'm2');
    await expect(active).toHaveAttribute('data-positionticks', '42');
    await expect(page.locator('.ch-hero')).toHaveCount(1);
});

test('a failing layout request leaves the native home alone and is retried with growing delays', async ({ page }) => {
    await page.clock.install();
    await loadHome(page, { layout: layoutOf(['jf:nextup']), failures: { 'GET CustomizedHome/Layout': -1 } });
    const layoutRequests = (): Promise<number> => requestCount(page, (url) => url === 'CustomizedHome/Layout');
    await expect.poll(layoutRequests).toBe(1);

    // jellyfin-web keeps touching the DOM: that must not turn into a request per change.
    for (let i = 0; i < 20; i++) {
        await updateMock(page, {});
        await page.clock.runFor(30);
    }
    expect(await layoutRequests()).toBe(1);
    expect(await visibleSectionTitles(page)).toEqual(NATIVE_HOME);

    await page.clock.runFor(2_100);
    await expect.poll(layoutRequests).toBe(2);
    await page.clock.runFor(2_100);
    expect(await layoutRequests()).toBe(2);
    await page.clock.runFor(2_100);
    await expect.poll(layoutRequests).toBe(3);

    // The server is back: the next attempt applies the layout.
    await updateMock(page, { failures: {} });
    await page.clock.runFor(8_200);
    await expect.poll(() => visibleSectionTitles(page)).toEqual(['Next Up']);
});

test('plugin sections do not count while the administrator disabled them: the home page is not blanked', async ({ page }) => {
    await openHome(page, { enableIntegratedSections: false, layout: layoutOf(['ch:combined', 'ch:latestMovies']) });
    await expect.poll(() => visibleSectionTitles(page)).toEqual(NATIVE_HOME);
});

test('a layout whose sections all went missing falls back to the default home after a grace period', async ({ page }) => {
    await page.clock.install();
    const warnings: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'warning') {
            warnings.push(message.text());
        }
    });
    await openHome(page, { layout: layoutOf(['jf:livetv']) });
    // While the page may still be filling up, nothing unlisted is shown (no flash of the default home).
    await expect.poll(() => visibleSectionTitles(page)).toEqual([]);

    await page.clock.runFor(5_200);
    await expect.poll(() => visibleSectionTitles(page)).toEqual(NATIVE_HOME);
    expect(warnings.some((text) => text.includes('no section of the layout is displayed'))).toBe(true);
});

test('saving locks the visible save button, and a failed save keeps the editor open and gives it back', async ({ page }) => {
    await openHome(page, {
        layout: layoutOf(['jf:nextup', 'jf:resume']),
        failures: { 'POST CustomizedHome/Layout': 1 },
        delays: { 'POST CustomizedHome/Layout': 400 }
    });
    await openEditor(page);
    const save = page.locator('.ch-dialog-footer .ch-save');

    await save.click();
    // No second request while the first one is on its way.
    await expect(save).toBeDisabled();
    await expect(page.locator('.ch-toast')).toHaveText('Could not save the layout');
    await expect(page.locator('.ch-overlay')).toHaveCount(1);
    await expect(save).toBeEnabled();

    await save.click();
    await expect(page.locator('.ch-overlay')).toHaveCount(0);
    const posts = (await recordedRequests(page)).filter((request) => request.method === 'POST' && request.path === 'CustomizedHome/Layout');
    expect(posts.map((request) => request.failed === true)).toEqual([true, false]);
});
