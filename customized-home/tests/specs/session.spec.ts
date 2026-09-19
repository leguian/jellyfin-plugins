import { expect, test, type Page } from '@playwright/test';
import {
    loadHome, openEditor, openHome, rebuildHomeView, recordedRequests, rowTitles, showHomeAgain, updateMock, visibleSectionTitles,
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
    // The selection is kept (a random source would otherwise deal new media under the user's eyes): one request
    // for the media on screen, none for the sources.
    expect(await requestCount(page, (url) => url.includes('ids=m1%2Cm2%2Cm3'))).toBe(1);
    expect(await requestCount(page, (url) => url.includes('sortBy=DateCreated'))).toBe(1);
});

test('a reload that fails keeps what is on screen, and the next return tries again', async ({ page }) => {
    await page.clock.install();
    await openHome(page, {
        enableIntegratedSections: true,
        layout: layoutOf(['ch:combined'], true),
        resumeItems: PRIVATE_RESUME,
        heroItems: { recentMovies: [heroMovie('m1')] }
    });
    await expect(combinedCards(page)).toHaveCount(1);
    await expect(page.locator('.ch-hero-slide')).toHaveCount(1);

    // Laptop waking up, server restarting: every request of the reload fails.
    await updateMock(page, { failures: { 'GET UserItems/Resume': -1, 'GET Shows/NextUp': -1, 'GET Items': -1 } });
    await page.clock.fastForward(20_000);
    await showHomeAgain(page);
    await expect.poll(() => requestCount(page, (url) => url.startsWith('UserItems/Resume'))).toBe(2);
    await page.clock.runFor(500);
    await expect(combinedCards(page)).toHaveCount(1);
    await expect(page.locator('.ch-hero-slide')).toHaveCount(1);
    await expect(page.locator('.ch-notice')).toHaveCount(0);
    expect(await visibleSectionTitles(page)).toEqual([COMBINED_TITLE]);

    // Back online: no need to wait another 15 s, the data on screen is still the old one.
    await updateMock(page, { failures: {}, resumeItems: [{ Id: 'resume-9', Name: 'Next Episode', Type: 'Movie' }] });
    await showHomeAgain(page);
    await expect(page.getByText('Next Episode').first()).toBeVisible();
});

test('unchanged data leaves the rows and the hero alone: no lost focus, no scroll reset', async ({ page }) => {
    await page.clock.install();
    await openHome(page, {
        enableIntegratedSections: true,
        layout: layoutOf(['ch:combined'], true),
        resumeItems: PRIVATE_RESUME,
        heroItems: { recentMovies: [heroMovie('m1'), heroMovie('m2')] }
    });
    await expect(combinedCards(page)).toHaveCount(1);
    await page.evaluate(() => {
        document.querySelector('.ch-section')?.setAttribute('data-probe', 'same-node');
        document.querySelector('.ch-hero')?.setAttribute('data-probe', 'same-node');
    });

    await page.clock.fastForward(20_000);
    await showHomeAgain(page);
    await expect.poll(() => requestCount(page, (url) => url.startsWith('UserItems/Resume'))).toBe(2);
    await page.clock.runFor(500);
    await expect(page.locator('.ch-section')).toHaveAttribute('data-probe', 'same-node');
    await expect(page.locator('.ch-hero')).toHaveAttribute('data-probe', 'same-node');

    // Changed data replaces the row, and the focus follows the media.
    await combinedCards(page).locator('a').first().focus();
    await updateMock(page, { resumeItems: [{ Id: 'resume-0', Name: 'Newer', Type: 'Movie' }, ...PRIVATE_RESUME] });
    await page.clock.fastForward(20_000);
    await showHomeAgain(page);
    await expect(combinedCards(page)).toHaveCount(2);
    await expect(page.locator('.ch-section')).not.toHaveAttribute('data-probe', 'same-node');
    expect(await page.evaluate(() => document.activeElement?.closest('[data-id]')?.getAttribute('data-id'))).toBe('resume-1');
});

test('a home view rebuilt by the web client shows the cached rows at once, then reloads the ones that got old', async ({ page }) => {
    await page.clock.install();
    await openHome(page, { enableIntegratedSections: true, layout: layoutOf(['ch:combined', 'ch:latestMovies']), resumeItems: PRIVATE_RESUME });
    await expect(combinedCards(page)).toHaveCount(1);
    const latestRequests = await requestCount(page, (url) => url.includes('sortBy=PremiereDate'));

    await updateMock(page, { resumeItems: [{ Id: 'resume-9', Name: 'Next Episode', Type: 'Movie' }] });
    await page.clock.fastForward(60_000);
    await rebuildHomeView(page);

    await expect(page.getByText('Next Episode').first()).toBeVisible();
    await expect(page.getByText('Private Movie')).toHaveCount(0);
    expect(await requestCount(page, (url) => url.startsWith('UserItems/Resume'))).toBe(2);
    // One minute old: still good for a row that does not depend on what was watched.
    expect(await requestCount(page, (url) => url.includes('sortBy=PremiereDate'))).toBe(latestRequests);
});

test('an editor requested just before the session changed never opens in the next session', async ({ page }) => {
    await openHome(page, {
        layoutsByUser: { 'user-1': layoutOf(['jf:nextup', 'jf:resume']), 'user-2': layoutOf(['jf:smalllibrarytiles']) },
        delays: { 'GET UserViews': 500 }
    });
    await page.click('.ch-customize-button');
    await updateMock(page, { userId: 'user-2' });

    await expect.poll(() => visibleSectionTitles(page)).toEqual(['My Media']);
    await page.waitForTimeout(900);
    await expect(page.locator('.ch-overlay')).toHaveCount(0);
});

test('a failing layout request leaves the native home alone and is retried with growing delays', async ({ page }) => {
    await page.clock.install();
    await loadHome(page, { layout: layoutOf(['jf:nextup']), failures: { 'GET CustomizedHome/Layout': -1 } });
    const layoutTimes = async (): Promise<number[]> => (await recordedRequests(page))
        .filter((request) => request.path === 'CustomizedHome/Layout')
        .map((request) => request.ts ?? 0);
    await expect.poll(async () => (await layoutTimes()).length).toBeGreaterThan(0);

    // jellyfin-web keeps touching the DOM: that must not turn into a request per change.
    for (let i = 0; i < 20; i++) {
        await updateMock(page, {});
        await page.clock.runFor(30);
    }
    expect(await visibleSectionTitles(page)).toEqual(NATIVE_HOME);
    await page.clock.runFor(15_000);

    // Whatever the speed of the machine: 2 s, then 4 s, then 8 s between two attempts, never less.
    const times = await layoutTimes();
    expect(times.length).toBeGreaterThanOrEqual(3);
    expect(times.length).toBeLessThanOrEqual(4);
    times.slice(1).forEach((time, index) => {
        expect(time - times[index]).toBeGreaterThanOrEqual(2_000 * 2 ** index);
    });

    // The server is back: the next attempt applies the layout.
    await updateMock(page, { failures: {} });
    await page.clock.runFor(17_000);
    await expect.poll(() => visibleSectionTitles(page)).toEqual(['Next Up']);
});

test('plugin sections do not count while the administrator disabled them: the home page is not blanked, and says why', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', (message) => warnings.push(message.text()));
    await openHome(page, { enableIntegratedSections: false, layout: layoutOf(['ch:combined', 'ch:latestMovies']) });
    // Right away: this is not the safety net and its grace period, the layout simply does not replace the home page.
    expect(await visibleSectionTitles(page)).toEqual(NATIVE_HOME);
    expect(warnings.filter((text) => text.includes('no section of the layout'))).toEqual([]);
    const notice = page.locator('#homeTab .sections > .ch-notice');
    await expect(notice).toHaveAttribute('data-ch-reason', 'disabled');
    await expect(notice.locator('.ch-notice-why')).toContainText('the administrator turned off');
    // First on the page: the explanation must not sit below the sections it talks about.
    const isFirst = await notice.evaluate((node) => Array.from(node.parentElement?.children ?? [])
        .filter((other) => other !== node && other.getBoundingClientRect().height > 0)
        .every((other) => other.getBoundingClientRect().top >= node.getBoundingClientRect().top));
    expect(isFirst).toBe(true);
});

test('an empty but valid layout stays in charge: no default home page, a message only when nothing at all is shown', async ({ page }) => {
    await page.clock.install();
    await openHome(page, { enableIntegratedSections: true, layout: layoutOf(['ch:combined']), resumeItems: [] });
    await page.clock.runFor(5_200);
    // Nothing in progress: the sections the user removed do not come back.
    expect(await visibleSectionTitles(page)).toEqual([]);
    await expect(page.locator('.ch-notice')).toHaveAttribute('data-ch-reason', 'empty');
    await expect(page.locator('.ch-notice-title')).toHaveText('Nothing to show on the home page');

    // Something to resume: the row appears and the message goes.
    await updateMock(page, { resumeItems: PRIVATE_RESUME });
    await page.clock.fastForward(20_000);
    await showHomeAgain(page);
    await expect(combinedCards(page)).toHaveCount(1);
    await expect(page.locator('.ch-notice')).toHaveCount(0);
});

test('with a hero on screen an empty layout needs no message', async ({ page }) => {
    await page.clock.install();
    await openHome(page, { enableIntegratedSections: true, layout: layoutOf(['ch:combined'], true), heroItems: { recentMovies: [heroMovie('m1')] } });
    await expect(page.locator('.ch-hero-slide')).toHaveCount(1);
    await page.clock.runFor(5_200);
    await expect(page.locator('.ch-notice')).toHaveCount(0);
    expect(await visibleSectionTitles(page)).toEqual([]);
});

test('the message explains a layout whose sections are all hidden and opens the editor to fix it', async ({ page }) => {
    await page.clock.install();
    const hidden = layoutOf(['jf:nextup', 'jf:resume']);
    hidden.Items.forEach((item) => {
        item.Visible = false;
    });
    await openHome(page, { layout: hidden });
    await expect(page.locator('.ch-notice')).toHaveCount(0);
    await page.clock.runFor(5_200);

    const notice = page.locator('.ch-notice');
    await expect(notice).toHaveAttribute('data-ch-reason', 'hidden');
    await expect(notice).toHaveAttribute('role', 'status');
    // Hidden on purpose: the default home page does not come back.
    expect(await visibleSectionTitles(page)).toEqual([]);
    await expect(notice.locator('.ch-notice-fix')).toContainText('Customize home');
    await notice.locator('.ch-notice-customize').click();
    await expect(page.locator('.ch-overlay .ch-list .ch-row')).toHaveCount(2);

    // Showing one section again applies the layout: the message goes away with its cause.
    await page.locator('.ch-list .ch-row').first().locator('.ch-act-visibility').click();
    await page.locator('.ch-dialog-footer .ch-save').click();
    await expect(page.locator('.ch-notice')).toHaveCount(0);
    await expect.poll(() => visibleSectionTitles(page)).toEqual(['Next Up']);
});

test('the message can be dismissed, and tells users who cannot customize to ask the administrator', async ({ page }) => {
    await openHome(page, { enableIntegratedSections: false, canCustomize: false, layout: layoutOf(['ch:combined']) });
    const notice = page.locator('.ch-notice');
    await expect(notice.locator('.ch-notice-fix')).toContainText('managed by the administrator');
    await expect(notice.locator('.ch-notice-customize')).toHaveCount(0);

    await notice.locator('.ch-notice-dismiss').click();
    await expect(notice).toHaveCount(0);
    // Still gone after the page changes again.
    await updateMock(page, {});
    await page.waitForTimeout(300);
    await expect(notice).toHaveCount(0);
});

test('no message when the layout is applied or when there is no layout', async ({ page }) => {
    await page.clock.install();
    await openHome(page, { layout: layoutOf(['jf:nextup']) });
    await page.clock.runFor(5_200);
    await expect(page.locator('.ch-notice')).toHaveCount(0);

    await openHome(page);
    await page.clock.runFor(5_200);
    await expect(page.locator('.ch-notice')).toHaveCount(0);
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
    expect(warnings.some((text) => text.includes('no section of the layout exists'))).toBe(true);
    await expect(page.locator('.ch-notice')).toHaveAttribute('data-ch-reason', 'missing');
    await expect(page.locator('.ch-notice .ch-notice-why')).toContainText('no longer offered');
});

test('saving locks the visible save button, and a failed save keeps the editor open and gives it back', async ({ page }) => {
    await openHome(page, {
        layout: layoutOf(['jf:nextup', 'jf:resume']),
        failures: { 'POST CustomizedHome/Layout': 1 },
        delays: { 'POST CustomizedHome/Layout': 1500 }
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
