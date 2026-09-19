import { expect, test } from '@playwright/test';
import { openEditor, openHome, recordedRequests, type HeroItem, type HeroSettings, type HeroSource, type Layout } from './support';

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
    await expect(active).toHaveAttribute('data-id', held ?? '');
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
