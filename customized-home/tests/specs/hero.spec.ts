import { expect, test } from '@playwright/test';
import { openEditor, openHome, recordedRequests, showHomeAgain, updateMock, type HeroItem, type HeroSettings, type HeroSource, type Layout } from './support';

const TICKS_PER_MINUTE = 600_000_000;

const MOVIE_RESUMABLE: HeroItem = {
    Id: 'movie-1',
    Name: 'First Movie',
    Type: 'Movie',
    MediaType: 'Video',
    Overview: 'A <b>bold</b> synopsis.',
    ProductionYear: 2024,
    RunTimeTicks: 107 * TICKS_PER_MINUTE,
    OfficialRating: 'PG-13',
    CommunityRating: 7.84,
    CriticRating: 91,
    Genres: ['Action', 'Drama', 'Thriller', 'Mystery'],
    LocalTrailerCount: 1,
    ImageTags: { Logo: 'logo-1', Primary: 'primary-1' },
    BackdropImageTags: ['backdrop-1'],
    UserData: { PlaybackPositionTicks: 12 * TICKS_PER_MINUTE, IsFavorite: true }
};

const MOVIE_REMOTE_TRAILER: HeroItem = {
    Id: 'movie-2',
    Name: 'Second Movie',
    Type: 'Movie',
    MediaType: 'Video',
    ProductionYear: 2023,
    RemoteTrailers: [{ Url: 'https://trailers.example/watch?v=2' }],
    BackdropImageTags: ['backdrop-2'],
    UserData: {}
};

const MOVIE_UNSAFE_TRAILER: HeroItem = {
    Id: 'movie-3',
    Name: 'Third Movie',
    Type: 'Movie',
    RemoteTrailers: [{ Url: 'javascript:alert(1)' }],
    ImageTags: { Primary: 'primary-3' },
    UserData: {}
};

const SHOW: HeroItem = {
    Id: 'show-1',
    Name: 'First Show',
    Type: 'Series',
    IsFolder: true,
    ProductionYear: 2022,
    BackdropImageTags: ['backdrop-s1'],
    UserData: { Played: true }
};

const HERO_ITEMS: Partial<Record<HeroSource, HeroItem[]>> = {
    random: [MOVIE_REMOTE_TRAILER, SHOW],
    recentMovies: [MOVIE_RESUMABLE, MOVIE_REMOTE_TRAILER, MOVIE_UNSAFE_TRAILER],
    recentShows: [SHOW]
};

function hero(overrides: Partial<HeroSettings> = {}): HeroSettings {
    return { Enabled: true, Sources: ['recentMovies', 'recentShows'], Count: 3, IntervalSeconds: 0, ExcludePlayed: true, RequireBackdrop: true, ...overrides };
}

function layout(settings: HeroSettings): Layout {
    return { Version: 1, HideUnlisted: false, Hero: settings, Items: [{ Type: 'section', Key: 'jf:resume', Visible: true }] };
}

function slideIds(page: import('@playwright/test').Page): Promise<string[]> {
    return page.locator('.ch-hero-slide').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-id') ?? ''));
}

test('shows the hero above the sections, mixing the sources in turn', async ({ page }) => {
    await openHome(page, { layout: layout(hero()), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    const banner = page.locator('#homeTab .sections > .ch-hero');
    await expect(banner).toHaveCount(1);
    expect(await slideIds(page)).toEqual(['movie-1', 'show-1', 'movie-2']);

    // Visually first: every layout section has a positive order.
    const isFirst = await banner.evaluate((node) => {
        const top = node.getBoundingClientRect().top;
        return Array.from(node.parentElement?.children ?? [])
            .filter((other) => other !== node && getComputedStyle(other).display !== 'none' && other.getBoundingClientRect().height > 0)
            .every((other) => other.getBoundingClientRect().top >= top);
    });
    expect(isFirst).toBe(true);
});

test('spans the whole width, starts under the header and gives the header its background back below', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 700 });
    await openHome(page, { layout: layout(hero()), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    const banner = page.locator('.ch-hero');
    await expect(banner).toHaveCount(1);
    const box = await banner.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top + window.scrollY, left: rect.left, right: rect.right, width: document.documentElement.clientWidth };
    });
    // The fixture pads the page (header) and the container (gutters): both are compensated.
    expect(box.top).toBeCloseTo(0, 0);
    expect(box.left).toBeCloseTo(0, 0);
    expect(box.right).toBeCloseTo(box.width, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const root = page.locator('html');
    await expect(root).toHaveClass(/ch-hero-under-header/);
    await expect(page.locator('.skinHeader')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    // The picture dissolves into the page instead of ending on an edge.
    await expect(page.locator('.ch-hero-slide.ch-active .ch-hero-backdrop')).toHaveCSS('mask-image', /linear-gradient/);

    await page.evaluate(() => {
        document.body.style.minHeight = '400vh';
        window.scrollTo(0, 3000);
    });
    await expect(root).not.toHaveClass(/ch-hero-under-header/);
    await expect(page.locator('.skinHeader')).toHaveCSS('background-color', 'rgb(32, 32, 32)');

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(root).toHaveClass(/ch-hero-under-header/);

    await page.setViewportSize({ width: 800, height: 700 });
    await expect.poll(() => banner.evaluate((node) => Math.round(node.getBoundingClientRect().right))).toBe(
        await page.evaluate(() => document.documentElement.clientWidth));
});

test('leaves the header alone when there is no hero', async ({ page }) => {
    await openHome(page, { layout: layout(hero({ Enabled: false })), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    await expect(page.locator('.ch-hero')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveClass(/ch-hero-under-header/);
    // Not even a transition: the stylesheet has no rule for the header of the web client without a hero.
    await expect(page.locator('.skinHeader')).toHaveCSS('transition-duration', '0s');
});

test('the header only fades between its two looks while a hero is displayed', async ({ page }) => {
    await openHome(page, { layout: layout(hero()), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    await expect(page.locator('.ch-hero')).toHaveCount(1);
    await expect(page.locator('.skinHeader')).toHaveCSS('transition-duration', '0.25s');
    // Scrolled below the hero: the background comes back, with the same fade.
    await page.evaluate(() => {
        document.body.style.minHeight = '400vh';
        window.scrollTo(0, 3000);
    });
    await expect(page.locator('html')).not.toHaveClass(/ch-hero-under-header/);
    await expect(page.locator('.skinHeader')).toHaveCSS('transition-duration', '0.25s');

    await page.evaluate(() => document.querySelector('#homeTab')?.classList.remove('is-active'));
    await expect(page.locator('.skinHeader')).toHaveCSS('transition-duration', '0s');
});

test('fills a slide with the media details and the native actions', async ({ page }) => {
    await openHome(page, { layout: layout(hero()), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    const slide = page.locator('.ch-hero-slide[data-id="movie-1"]');
    await expect(slide).toBeVisible();
    await expect(slide).toHaveAttribute('data-serverid', 'server-1');
    await expect(slide).toHaveAttribute('data-type', 'Movie');
    await expect(slide).toHaveAttribute('data-positionticks', String(12 * TICKS_PER_MINUTE));
    await expect(slide.locator('.ch-hero-logo')).toHaveAttribute('alt', 'First Movie');
    await expect(slide.locator('.ch-hero-year')).toHaveText('2024');
    await expect(slide.locator('.ch-hero-runtime')).toHaveText('1 h 47 min');
    await expect(slide.locator('.ch-hero-official')).toHaveText('PG-13');
    await expect(slide.locator('.ch-hero-rating')).toContainText('7.8');
    await expect(slide.locator('.ch-hero-critic')).toContainText('91 %');
    await expect(slide.locator('.ch-hero-genres')).toHaveText('Action · Drama · Thriller');
    // The synopsis is text, never markup.
    await expect(slide.locator('.ch-hero-overview')).toHaveText('A <b>bold</b> synopsis.');
    await expect(slide.locator('.ch-hero-overview b')).toHaveCount(0);
    await expect(slide.locator('.ch-hero-backdrop')).toHaveCSS('background-image', /movie-1/);

    // Actions handled by the items container of the web client.
    await expect(page.locator('.ch-hero-slides')).toHaveAttribute('is', 'emby-itemscontainer');
    await expect(slide.locator('.ch-hero-play')).toHaveAttribute('data-action', 'resume');
    await expect(slide.locator('.ch-hero-play')).toHaveClass(/itemAction/);
    // The web client starts "play" and "resume" alike at data-positionticks of the closest element carrying
    // data-id: the restart button carries its own, at position 0.
    const restart = slide.locator('.ch-hero-restart');
    await expect(restart).toHaveAttribute('data-action', 'play');
    await expect(restart).toHaveAttribute('data-id', 'movie-1');
    await expect(restart).toHaveAttribute('data-serverid', 'server-1');
    await expect(restart).toHaveAttribute('data-type', 'Movie');
    await expect(restart).toHaveAttribute('data-positionticks', '0');
    await expect(slide.locator('.ch-hero-play')).not.toHaveAttribute('data-id', /.*/);
    await expect(slide.locator('.ch-hero-trailer')).toHaveAttribute('data-action', 'playtrailer');
    await expect(slide.locator('.ch-hero-favorite')).toHaveAttribute('aria-pressed', 'true');
    await expect(slide.locator('.ch-hero-played')).toHaveAttribute('aria-pressed', 'false');
    await expect(slide.locator('.ch-hero-more')).toHaveAttribute('href', '#/details?id=movie-1&serverId=server-1');
});

test('favorite and watched are sent by the plugin itself, without any web client element', async ({ page }) => {
    await openHome(page, { layout: layout(hero()), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    const slide = page.locator('.ch-hero-slide[data-id="movie-1"]');
    const favorite = slide.locator('.ch-hero-favorite');
    const played = slide.locator('.ch-hero-played');
    // Nothing to upgrade: they work on a home page where the web client registered no rating element yet.
    await expect(favorite).not.toHaveAttribute('is', /.*/);
    await expect(played).not.toHaveAttribute('is', /.*/);

    await favorite.click();
    await expect(favorite).toHaveAttribute('aria-pressed', 'false');
    await expect(favorite).not.toHaveClass(/ch-on/);
    await played.click();
    await expect(played).toHaveAttribute('aria-pressed', 'true');
    await expect(played).toHaveClass(/ch-on/);
    await played.click();
    await expect(played).toHaveAttribute('aria-pressed', 'false');

    const writes = (await recordedRequests(page)).filter((request) => request.path === 'UserData').map((request) => request.body);
    expect(writes).toEqual([
        { action: 'favorite', userId: 'user-1', itemId: 'movie-1', value: false },
        { action: 'played', userId: 'user-1', itemId: 'movie-1', value: true },
        { action: 'played', userId: 'user-1', itemId: 'movie-1', value: false }
    ]);
});

test('a change keeps the keyboard focus on its button, and the next reload finds nothing to replace', async ({ page }) => {
    await page.clock.install();
    await openHome(page, { layout: layout(hero()), enableIntegratedSections: true, heroItems: HERO_ITEMS, delays: { 'POST UserData': 300 } });
    const favorite = page.locator('.ch-hero-slide[data-id="movie-1"] .ch-hero-favorite');
    await page.evaluate(() => document.querySelector('.ch-hero')?.setAttribute('data-probe', 'same-node'));

    await favorite.focus();
    await page.keyboard.press('Enter');
    // A disabled button would hand the focus to the page: with a remote the hero would be lost.
    await expect(favorite).toHaveAttribute('aria-busy', 'true');
    await expect(favorite).toBeFocused();
    await page.clock.runFor(400);
    await expect(favorite).not.toHaveAttribute('aria-busy', /.*/);
    await expect(favorite).toBeFocused();
    await page.keyboard.press('Enter');
    await page.clock.runFor(400);
    await expect(favorite).toHaveAttribute('aria-pressed', 'true');
    expect((await recordedRequests(page)).filter((request) => request.path === 'UserData')).toHaveLength(2);

    // Back on the home page later: the server says what the hero already shows.
    await page.clock.fastForward(20_000);
    await showHomeAgain(page);
    await expect.poll(async () => (await recordedRequests(page)).filter((request) => (request.url ?? '').includes('ids=')).length).toBe(1);
    await page.clock.runFor(300);
    await expect(page.locator('.ch-hero')).toHaveAttribute('data-probe', 'same-node');
    await expect(favorite).toHaveAttribute('aria-pressed', 'true');
});

test('the controls of hidden slides are out of reach of the keyboard and of the TV remote', async ({ page }) => {
    await openHome(page, { layout: layout(hero()), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    const tabStops = (id: string): Promise<(string | null)[]> => page.locator(`.ch-hero-slide[data-id="${id}"]`).locator('a, button')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('tabindex')));
    // The spatial navigation of jellyfin-web only skips tabindex="-1": hidden slides keep their size.
    expect((await tabStops('movie-1')).every((value) => value === null)).toBe(true);
    expect((await tabStops('show-1')).every((value) => value === '-1')).toBe(true);

    await page.locator('.ch-hero-dot').nth(1).click();
    expect((await tabStops('show-1')).every((value) => value === null)).toBe(true);
    expect((await tabStops('movie-1')).every((value) => value === '-1')).toBe(true);
});

test('an "unwatched only" hero deals a new selection when one of its media got watched', async ({ page }) => {
    await page.clock.install();
    const movies = HERO_ITEMS.recentMovies ?? [];
    await openHome(page, { layout: layout(hero({ Sources: ['recentMovies'], Count: 2 })), enableIntegratedSections: true, heroItems: { recentMovies: movies } });
    await expect(page.locator('.ch-hero-slide')).toHaveCount(2);
    await page.locator('.ch-hero-slide[data-id="movie-1"] .ch-hero-played').click();

    // The server no longer offers it (isPlayed=false): the next return must not leave a hero of one media.
    await updateMock(page, { heroItems: { recentMovies: movies.slice(1) } });
    await page.clock.fastForward(20_000);
    await showHomeAgain(page);
    await expect(page.locator('.ch-hero-slide[data-id="movie-1"]')).toHaveCount(0);
    await expect(page.locator('.ch-hero-slide')).toHaveCount(2);
    expect((await recordedRequests(page)).filter((request) => (request.url ?? '').includes('sortBy=DateCreated'))).toHaveLength(2);
});

test('a refused favorite or watched change is reverted and reported', async ({ page }) => {
    await openHome(page, { layout: layout(hero()), enableIntegratedSections: true, heroItems: HERO_ITEMS, failures: { 'POST UserData': 1 } });
    const favorite = page.locator('.ch-hero-slide[data-id="movie-1"] .ch-hero-favorite');
    await favorite.click();
    await expect(page.locator('.ch-toast')).toHaveText('Could not update this media');
    await expect(favorite).toHaveAttribute('aria-pressed', 'true');
    await expect(favorite).toBeEnabled();

    await favorite.click();
    await expect(favorite).toHaveAttribute('aria-pressed', 'false');
});

test('falls back to the title, plays from the start and links remote trailers safely', async ({ page }) => {
    await openHome(page, {
        layout: layout(hero({ Sources: ['recentMovies'], RequireBackdrop: false })),
        enableIntegratedSections: true,
        heroItems: HERO_ITEMS
    });
    const second = page.locator('.ch-hero-slide[data-id="movie-2"]');
    await expect(second.locator('.ch-hero-title')).toHaveText('Second Movie', { useInnerText: false });
    await expect(second.locator('.ch-hero-logo')).toHaveCount(0);
    await expect(second.locator('.ch-hero-play')).toHaveAttribute('data-action', 'play');
    await expect(second.locator('.ch-hero-restart')).toHaveCount(0);
    const trailer = second.locator('.ch-hero-trailer');
    await expect(trailer).toHaveAttribute('href', 'https://trailers.example/watch?v=2');
    await expect(trailer).toHaveAttribute('target', '_blank');
    await expect(trailer).toHaveAttribute('rel', 'noopener noreferrer');

    // Only web links are accepted as trailers; without a backdrop the poster is used.
    const third = page.locator('.ch-hero-slide[data-id="movie-3"]');
    await expect(third.locator('.ch-hero-trailer')).toHaveCount(0);
    await expect(third.locator('.ch-hero-backdrop')).toHaveClass(/ch-hero-backdrop-poster/);
});

test('queries each source with the filters and never shows a media twice', async ({ page }) => {
    await openHome(page, {
        layout: layout(hero({ Sources: ['random', 'recentMovies'], Count: 3 })),
        enableIntegratedSections: true,
        heroItems: HERO_ITEMS
    });
    await expect(page.locator('.ch-hero-slide')).toHaveCount(3);
    expect(await slideIds(page)).toEqual(['movie-2', 'movie-1', 'show-1']);

    const urls = (await recordedRequests(page)).map((request) => request.url ?? '').filter((url) => url.includes('fields=Overview'));
    expect(urls).toHaveLength(2);
    for (const url of urls) {
        expect(url).toContain('isPlayed=false');
        expect(url).toContain('imageTypes=Backdrop');
        expect(url).toContain('limit=3');
        expect(url).toContain('recursive=true');
    }
    expect(urls[0]).toContain('sortBy=Random');
    expect(urls[1]).toContain('includeItemTypes=Movie&');
});

test('drops the filters when they are switched off', async ({ page }) => {
    await openHome(page, {
        layout: layout(hero({ ExcludePlayed: false, RequireBackdrop: false })),
        enableIntegratedSections: true,
        heroItems: HERO_ITEMS
    });
    await expect(page.locator('.ch-hero-slide')).toHaveCount(3);
    const urls = (await recordedRequests(page)).map((request) => request.url ?? '').filter((url) => url.includes('fields=Overview'));
    for (const url of urls) {
        expect(url).not.toContain('isPlayed');
        expect(url).not.toContain('imageTypes=');
    }
});

test('navigates with the dots and the arrows, one visible slide at a time', async ({ page }) => {
    await openHome(page, { layout: layout(hero()), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    const active = page.locator('.ch-hero-slide.ch-active');
    await expect(active).toHaveAttribute('data-id', 'movie-1');
    await expect(page.locator('.ch-hero-slide[data-id="show-1"]')).toBeHidden();

    await page.locator('.ch-hero-dot').nth(2).click();
    await expect(active).toHaveAttribute('data-id', 'movie-2');
    await expect(page.locator('.ch-hero-dot').nth(2)).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.ch-hero-slide[data-id="movie-1"]')).toHaveAttribute('aria-hidden', 'true');

    await page.locator('.ch-hero').hover();
    await page.locator('.ch-hero-next').click();
    await expect(active).toHaveAttribute('data-id', 'movie-1');
    await page.locator('.ch-hero-prev').click();
    await expect(active).toHaveAttribute('data-id', 'movie-2');
    await expect(active).toHaveCount(1);
});

test('rotates on its own and pauses while hovered', async ({ page }) => {
    await openHome(page, { layout: layout(hero({ IntervalSeconds: 1 })), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    const active = page.locator('.ch-hero-slide.ch-active');
    await expect(active).toHaveAttribute('data-id', 'movie-1');
    await expect(active).toHaveAttribute('data-id', 'show-1', { timeout: 3000 });

    await page.locator('.ch-hero').hover();
    const held = await active.getAttribute('data-id');
    await page.waitForTimeout(1600);
    // Read once: an assertion that retries would pass when the rotation comes round to the same slide.
    expect(await active.getAttribute('data-id')).toBe(held);
});

test('shows no hero without sources, without media, or when plugin sections are disabled', async ({ page }) => {
    await openHome(page, { layout: layout(hero({ Sources: [] })), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    await expect(page.locator('.ch-hero')).toHaveCount(0);

    await openHome(page, { layout: layout(hero({ Sources: ['latestShows'] })), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    await expect(page.locator('.ch-hero')).toHaveCount(0);

    await openHome(page, { layout: layout(hero()), enableIntegratedSections: false, heroItems: HERO_ITEMS });
    await expect(page.locator('.ch-hero')).toHaveCount(0);
    await openEditor(page);
    await expect(page.locator('.ch-hero-row')).toHaveCount(0);
});

test('configures the hero from the editor and saves it with the layout', async ({ page }) => {
    await openHome(page, {
        layout: { Version: 1, HideUnlisted: true, Items: [{ Type: 'section', Key: 'jf:resume', Visible: true }] },
        enableIntegratedSections: true,
        heroItems: HERO_ITEMS
    });
    await expect(page.locator('.ch-hero')).toHaveCount(0);
    await openEditor(page);

    // Pinned above the list: not a draggable row.
    const row = page.locator('.ch-col-layout .ch-hero-slot .ch-hero-row');
    await expect(row).toHaveClass(/ch-hero-row-off/);
    await expect(row.locator('.ch-handle')).toHaveCount(0);

    // Turning it on picks default sources and opens the settings, which stay open while editing.
    await row.locator('.ch-hero-toggle').click();
    const menu = page.locator('.ch-hero-menu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('.ch-hero-source.ch-selected')).toHaveCount(2);
    await menu.locator('.ch-hero-source[data-ch-source="random"]').click();
    await menu.locator('.ch-hero-more-count').click();
    await menu.locator('.ch-hero-more-count').click();
    await expect(menu.locator('.ch-hero-count')).toHaveText('8');
    // Offered delays, manual mode last.
    await expect(menu.locator('.ch-hero-interval > span:last-child')).toHaveText(['3 s', '5 s', '10 s', 'manual']);
    await menu.locator('.ch-hero-interval', { hasText: '5 s' }).click();
    await menu.locator('.ch-hero-exclude-played').click();
    await expect(menu).toBeVisible();
    await expect(row.locator('.ch-row-sub')).toContainText('Random');
    await expect(row.locator('.ch-row-sub')).toContainText('8 media');

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await page.locator('.ch-dialog-footer .ch-save').click();

    const saved = (await recordedRequests(page)).find((request) => request.method === 'POST' && request.path === 'CustomizedHome/Layout');
    expect((saved?.body as Layout).Hero).toEqual({
        Enabled: true,
        Sources: ['random', 'recentMovies', 'recentShows'],
        Count: 8,
        IntervalSeconds: 5,
        ExcludePlayed: false,
        RequireBackdrop: true
    });
    // Applied right away on the home page.
    await expect(page.locator('.ch-hero-slide')).toHaveCount(4);
});

test('switches the hero off when its last source is removed', async ({ page }) => {
    await openHome(page, { layout: layout(hero({ Sources: ['recentShows'] })), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    await openEditor(page);
    const row = page.locator('.ch-hero-row');
    await expect(row.locator('.ch-hero-toggle')).toHaveAttribute('aria-checked', 'true');
    await row.locator('.ch-hero-settings').click();
    await page.locator('.ch-hero-menu .ch-hero-source[data-ch-source="recentShows"]').click();
    await expect(row.locator('.ch-hero-toggle')).toHaveAttribute('aria-checked', 'false');

    await page.keyboard.press('Escape');
    await page.locator('.ch-dialog-footer .ch-save').click();
    await expect(page.locator('.ch-hero')).toHaveCount(0);
});

/* ---- pause control, focus ring, tabs of the home page ---- */

/** Pointer and focus away from the hero: neither of the two automatic pauses is holding the rotation. */
async function leaveHero(page: import('@playwright/test').Page): Promise<void> {
    await page.mouse.move(2, 2);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

test('a pause button stops the rotation until the user resumes it, from the keyboard as well', async ({ page }) => {
    await openHome(page, { layout: layout(hero({ IntervalSeconds: 1 })), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    const active = page.locator('.ch-hero-slide.ch-active');
    const pause = page.locator('.ch-hero .ch-hero-pause');
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await expect(pause).toHaveAttribute('aria-label', 'Pause the automatic rotation');
    // Reachable by touch: a target of 24 CSS pixels at least (WCAG 2.5.8).
    const box = await pause.boundingBox();
    expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(24);

    await pause.focus();
    await page.keyboard.press('Enter');
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await expect(pause.locator('.material-icons')).toHaveText('play_arrow');
    await leaveHero(page);
    const held = await active.getAttribute('data-id');
    await page.waitForTimeout(1600);
    // Read once: an assertion that retries would pass when the rotation comes round to the same slide.
    expect(await active.getAttribute('data-id')).toBe(held);

    // The web client wiped the container, the hero is rendered again: still stopped.
    await page.evaluate(() => document.querySelector('.ch-hero')?.remove());
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await leaveHero(page);
    const rebuilt = await active.getAttribute('data-id');
    await page.waitForTimeout(1600);
    expect(await active.getAttribute('data-id')).toBe(rebuilt);

    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await expect(pause.locator('.material-icons')).toHaveText('pause');
    await leaveHero(page);
    await expect(active).not.toHaveAttribute('data-id', rebuilt ?? '', { timeout: 3000 });
});

test('no pause button when nothing rotates on its own', async ({ page }) => {
    await openHome(page, { layout: layout(hero({ IntervalSeconds: 0 })), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    await expect(page.locator('.ch-hero-dot')).toHaveCount(3);
    await expect(page.locator('.ch-hero-pause')).toHaveCount(0);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openHome(page, { layout: layout(hero({ IntervalSeconds: 5 })), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    await expect(page.locator('.ch-hero-dot')).toHaveCount(3);
    await expect(page.locator('.ch-hero-pause')).toHaveCount(0);
});

test('hero buttons show the keyboard focus although the web client removes the outline of its buttons', async ({ page }) => {
    await openHome(page, { layout: layout(hero({ IntervalSeconds: 5 })), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    await expect(page.locator('.ch-hero-slide.ch-active .ch-hero-play')).toBeVisible();
    // What the emby-button element does when the web client upgrades it; the fixture holds its "outline: none !important".
    await page.evaluate(() => document.querySelectorAll('.ch-hero [is="emby-button"], .ch-hero [is="emby-linkbutton"]').forEach((node) => node.classList.add('emby-button')));

    const controls = ['.ch-hero-slide.ch-active .ch-hero-play', '.ch-hero-slide.ch-active .ch-hero-more', '.ch-hero-slide.ch-active .ch-hero-favorite', '.ch-hero-pause', '.ch-hero-dot'];
    for (const selector of controls) {
        const control = page.locator(selector).first();
        // Reached with the keyboard: a focus set by a script alone may not count as visible.
        await control.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(control).toBeFocused();
        await expect(control).toHaveCSS('outline-style', 'solid');
        await expect(control).toHaveCSS('outline-color', 'rgb(0, 164, 220)');
    }
});

test('the header gets its background back on the Favorites tab, and lets the hero through again on the Home tab', async ({ page }) => {
    await openHome(page, { layout: layout(hero()), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    const root = page.locator('html');
    await expect(root).toHaveClass(/ch-hero-under-header/);

    // What maintabsmanager.js of the web client does on "beforetabchange": no view event, nothing that bubbles.
    const selectTab = (id: string): Promise<void> => page.evaluate((active) => {
        document.querySelectorAll('#indexPage > .pageTabContent').forEach((panel) => panel.classList.toggle('is-active', panel.id === active));
    }, id);

    await selectTab('favoritesTab');
    await expect(page.locator('.ch-hero')).toBeHidden();
    await expect(root).not.toHaveClass(/ch-hero-under-header/);
    await expect(page.locator('.skinHeader')).toHaveCSS('background-color', 'rgb(32, 32, 32)');

    await selectTab('homeTab');
    await expect(root).toHaveClass(/ch-hero-under-header/);
    const box = await page.locator('.ch-hero').evaluate((node) => ({ top: node.getBoundingClientRect().top + window.scrollY, left: node.getBoundingClientRect().left }));
    expect(box.top).toBeCloseTo(0, 0);
    expect(box.left).toBeCloseTo(0, 0);
});

// WCAG 2.2 "Target Size (Minimum)" (2.5.8): 24 CSS pixels in both directions, and hit areas that do not overlap.
const MIN_TARGET_PX = 24;

/**
 * The real hit box of each dot, probed with elementFromPoint: the box that receives a click, whether it comes from
 * the button itself or from an overlay it paints. Measuring a pseudo-element with getComputedStyle does not work,
 * it answers for a pseudo-element that was never generated.
 */
async function dotHitBoxes(page: import('@playwright/test').Page): Promise<{ width: number; height: number; left: number; right: number; painted: { width: number; height: number } }[]> {
    return page.locator('.ch-hero-dot').evaluateAll((nodes) => nodes.map((node) => {
        const painted = node.getBoundingClientRect();
        const centreX = painted.left + painted.width / 2;
        const centreY = painted.top + painted.height / 2;
        const hits = (x: number, y: number): boolean => {
            const target = document.elementFromPoint(x, y);
            return target === node || (target instanceof Element && target.closest('.ch-hero-dot') === node);
        };
        // Distance from the centre to the edge of the hit area, narrowed down to a hundredth of a pixel: a coarser
        // walk would under-report the box by up to one step per side and turn an exact 24px into a failure.
        const reach = (dx: number, dy: number): number => {
            let inside = 0;
            let outside = 60;
            if (hits(centreX + dx * outside, centreY + dy * outside)) {
                return outside;
            }
            while (outside - inside > 0.01) {
                const middle = (inside + outside) / 2;
                if (hits(centreX + dx * middle, centreY + dy * middle)) {
                    inside = middle;
                } else {
                    outside = middle;
                }
            }
            return outside;
        };
        const left = reach(-1, 0);
        const right = reach(1, 0);
        const height = reach(0, -1) + reach(0, 1);
        return {
            width: left + right,
            height,
            left: centreX - left,
            right: centreX + right,
            painted: { width: painted.width, height: painted.height }
        };
    }));
}

test('hero dots are hit targets of at least 24px that only touch, with the painted dots unchanged', async ({ page }) => {
    await openHome(page, { layout: layout(hero({ IntervalSeconds: 5 })), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    await expect(page.locator('.ch-hero-dot')).toHaveCount(3);
    const boxes = await dotHitBoxes(page);

    for (const [index, box] of boxes.entries()) {
        expect(box.width, `dot ${index} hit width`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
        expect(box.height, `dot ${index} hit height`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    }
    // The hit areas touch without overlapping: no dot steals a click from its neighbour.
    for (let index = 1; index < boxes.length; index++) {
        const previous = boxes[index - 1];
        const current = boxes[index];
        if (!previous || !current) {
            throw new Error('missing dot box');
        }
        expect(current.left, `dot ${index} against dot ${index - 1}`).toBeGreaterThanOrEqual(previous.right - 1);
    }

    // The dots still look the same: 0.6em painted, and 1.6em once active.
    const em = await page.locator('.ch-hero-dot').nth(1).evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
    const inactive = boxes[1];
    const active = boxes[0];
    if (!inactive || !active) {
        throw new Error('missing dot box');
    }
    expect(inactive.painted.width).toBeCloseTo(0.6 * em, 1);
    expect(inactive.painted.height).toBeCloseTo(0.6 * em, 1);
    await expect(page.locator('.ch-hero-dot').first()).toHaveClass(/ch-active/);
    expect(active.painted.width).toBeCloseTo(1.6 * em, 1);
});

test('a click lands on the dot whose hit area it falls in, including on the transparent part', async ({ page }) => {
    await openHome(page, { layout: layout(hero({ IntervalSeconds: 5 })), enableIntegratedSections: true, heroItems: HERO_ITEMS });
    const third = page.locator('.ch-hero-dot').nth(2);
    const box = await third.boundingBox();
    if (!box) {
        throw new Error('no dot box');
    }
    // Just outside the painted dot, inside the 24px hit area: the overlay must take the click.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + (MIN_TARGET_PX / 2 - 2));
    await expect(third).toHaveClass(/ch-active/);
});
