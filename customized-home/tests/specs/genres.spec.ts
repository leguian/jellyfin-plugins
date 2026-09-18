import { expect, test } from '@playwright/test';
import { openEditor, openHome, recordedRequests, visibleSectionTitles, type Layout } from './support';

const LIST = '.ch-overlay .ch-list';

function layoutWith(items: Layout['Items']): Layout {
    return { Version: 1, HideUnlisted: true, Items: items };
}

test('genre section renders one row per chosen genre, in the chosen order', async ({ page }) => {
    await openHome(page, {
        enableIntegratedSections: true,
        layout: layoutWith([{ Type: 'section', Key: 'ch:genre', Visible: true, Genres: ['Drama', 'Action'] }])
    });
    await expect.poll(() => visibleSectionTitles(page)).toEqual(['Genre: Drama', 'Genre: Action']);
    const cards = page.locator('[data-ch-key="ch:genre"]').first().locator('.ch-card .textActionButton');
    await expect(cards).toHaveText(['Drama One', 'Drama Two']);
});

test('all genres section shows one card per genre linking to the genre list', async ({ page }) => {
    await openHome(page, {
        enableIntegratedSections: true,
        layout: layoutWith([{ Type: 'section', Key: 'ch:allGenres', Visible: true }])
    });
    await expect.poll(() => visibleSectionTitles(page)).toEqual(['All genres']);
    const links = page.locator('[data-ch-key="ch:allGenres"] .ch-card a.cardImageContainer');
    await expect(links).toHaveCount(3);
    await expect(links.first()).toHaveAttribute('href', '#/list?genreId=genre-action&serverId=server-1');
});

test('genre cards are poster shaped and show a collage of four distinct posters', async ({ page }) => {
    await openHome(page, {
        enableIntegratedSections: true,
        layout: layoutWith([{ Type: 'section', Key: 'ch:allGenres', Visible: true }])
    });
    const card = page.locator('[data-ch-key="ch:allGenres"] .ch-card').first();
    await expect(card).toHaveClass(/overflowPortraitCard/);
    const cells = await card.locator('.ch-collage-cell').evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.backgroundImage));
    expect(cells).toHaveLength(4);
    expect(new Set(cells).size).toBe(4);
});

test('uploaded thumbnails are only used when the section is set to custom images', async ({ page }) => {
    const genreImages = [{ Name: 'Comedy', Version: 7 }];
    await openHome(page, {
        enableIntegratedSections: true,
        genreImages,
        layout: layoutWith([{ Type: 'section', Key: 'ch:allGenres', Visible: true }])
    });
    const comedyDefault = page.locator('[data-ch-key="ch:allGenres"] .ch-card', { hasText: 'Comedy' });
    await expect(comedyDefault.locator('.ch-collage')).toHaveCount(1);

    await openHome(page, {
        enableIntegratedSections: true,
        genreImages,
        layout: layoutWith([{ Type: 'section', Key: 'ch:allGenres', Visible: true, GenreStyle: 'custom' }])
    });
    const comedy = page.locator('[data-ch-key="ch:allGenres"] .ch-card', { hasText: 'Comedy' });
    await expect(comedy.locator('.ch-collage')).toHaveCount(0);
    const background = await comedy.locator('a.cardImageContainer').evaluate((node) => (node as HTMLElement).style.backgroundImage);
    expect(background).toContain('CustomizedHome/GenreImages/Image?name=Comedy&shape=portrait&v=7');
    // A genre without an upload falls back to the poster collage.
    await expect(page.locator('[data-ch-key="ch:allGenres"] .ch-card', { hasText: 'Action' }).locator('.ch-collage')).toHaveCount(1);
});

test('custom thumbnails follow the card shape, and fall back to another uploaded shape', async ({ page }) => {
    const genreImages = [
        { Name: 'Comedy', Shape: 'portrait' as const, Version: 1 },
        { Name: 'Comedy', Shape: 'landscape' as const, Version: 2 },
        { Name: 'Drama', Shape: 'square' as const, Version: 3 }
    ];
    const backgroundOf = (genre: string): Promise<string> => page
        .locator('[data-ch-key="ch:allGenres"] .ch-card', { hasText: genre })
        .locator('a.cardImageContainer')
        .evaluate((node) => (node as HTMLElement).style.backgroundImage);

    await openHome(page, {
        enableIntegratedSections: true,
        genreImages,
        layout: layoutWith([{ Type: 'section', Key: 'ch:allGenres', Visible: true, GenreStyle: 'custom', Shape: 'landscape' }])
    });
    expect(await backgroundOf('Comedy')).toContain('name=Comedy&shape=landscape&v=2');
    // Drama only has a square thumbnail: better than nothing on a landscape card.
    expect(await backgroundOf('Drama')).toContain('name=Drama&shape=square&v=3');

    await openHome(page, {
        enableIntegratedSections: true,
        genreImages,
        layout: layoutWith([{ Type: 'section', Key: 'ch:allGenres', Visible: true, GenreStyle: 'custom' }])
    });
    expect(await backgroundOf('Comedy')).toContain('name=Comedy&shape=portrait&v=1');
});

test('colors style writes the genre names on stable colored backgrounds, without any per genre request', async ({ page }) => {
    const layout = layoutWith([{ Type: 'section', Key: 'ch:allGenres', Visible: true, GenreStyle: 'colors' }]);
    await openHome(page, { enableIntegratedSections: true, genreImages: [{ Name: 'Comedy', Version: 7 }], layout });
    const cards = page.locator('[data-ch-key="ch:allGenres"] .ch-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.locator('.ch-genre-color span')).toHaveText(['Action', 'Comedy', 'Drama']);
    await expect(cards.locator('.ch-collage')).toHaveCount(0);
    // The name is on the card: no title under it. Wide cards by default.
    await expect(cards.locator('.cardText-first')).toHaveCount(0);
    await expect(cards.first()).toHaveClass(/overflowBackdropCard/);
    const requests = await recordedRequests(page);
    expect(requests.filter((request) => request.path === 'Items' || request.path === 'CustomizedHome/GenreImages')).toEqual([]);

    const colors = await cards.locator('.ch-genre-color').evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.background));
    await openHome(page, { enableIntegratedSections: true, layout });
    const again = await page.locator('[data-ch-key="ch:allGenres"] .ch-genre-color').evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.background));
    expect(again).toEqual(colors);
});

test('genre card style is picked in the format menu, saved, and applied without reloading', async ({ page }) => {
    await openHome(page, {
        enableIntegratedSections: true,
        layout: layoutWith([{ Type: 'section', Key: 'ch:allGenres', Visible: true }])
    });
    // Presence, not visibility: the fixture has no jellyfin-web card stylesheet, so cards have no height there.
    await expect(page.locator('[data-ch-key="ch:allGenres"] .ch-collage')).toHaveCount(3);

    await openEditor(page);
    await page.locator(`${LIST} .ch-row`).first().locator('.ch-act-menu').click();
    await expect(page.locator('.ch-popup .ch-opt-genre-style')).toHaveText([/Posters of the genre/, /Custom images/, /Names on colored backgrounds/]);
    await page.locator('.ch-popup .ch-opt-genre-style', { hasText: 'colored' }).click();
    await expect(page.locator('.ch-popup .ch-opt-genre-style', { hasText: 'colored' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator(`${LIST} .ch-row`).first().locator('.ch-row-format')).toHaveText('Names on colored backgrounds');
    await page.keyboard.press('Escape');
    await page.locator('.ch-overlay .ch-dialog-footer .ch-save').click();
    await expect(page.locator('.ch-overlay')).toHaveCount(0);

    const post = (await recordedRequests(page)).find((request) => request.method === 'POST' && request.path === 'CustomizedHome/Layout');
    expect((post?.body as Layout).Items[0]?.GenreStyle).toBe('colors');
    await expect(page.locator('[data-ch-key="ch:allGenres"] .ch-genre-color')).toHaveCount(3);
    await expect(page.locator('[data-ch-key="ch:allGenres"] .ch-collage')).toHaveCount(0);
});

test('integrated sections stay off when the administrator disabled them', async ({ page }) => {
    await openHome(page, {
        enableIntegratedSections: false,
        layout: layoutWith([{ Type: 'section', Key: 'ch:allGenres', Visible: true }, { Type: 'section', Key: 'jf:nextup', Visible: true }])
    });
    await expect.poll(() => visibleSectionTitles(page)).toEqual(['Next Up']);
    await expect(page.locator('[data-ch-key]')).toHaveCount(0);
});

test('genres are chosen from the format menu, saved, and applied without reloading', async ({ page }) => {
    await openHome(page, {
        enableIntegratedSections: true,
        layout: layoutWith([{ Type: 'section', Key: 'ch:genre', Visible: true, Genres: ['Action'] }])
    });
    await expect.poll(() => visibleSectionTitles(page)).toEqual(['Genre: Action']);

    await openEditor(page);
    const row = page.locator(`${LIST} .ch-row`).first();
    await expect(row.locator('.ch-row-format')).toHaveText('1 genre(s)');
    await row.locator('.ch-act-menu').click();
    // Genres are listed inside the format menu, which stays open while they are toggled.
    await expect(page.locator('.ch-popup .ch-genre-option')).toHaveCount(3);
    await expect(page.locator('.ch-popup .ch-genre-option', { hasText: 'Action' })).toHaveAttribute('aria-checked', 'true');
    await page.locator('.ch-popup .ch-genre-option', { hasText: 'Comedy' }).click();
    await expect(page.locator('.ch-popup .ch-genre-option', { hasText: 'Comedy' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator(`${LIST} .ch-row`).first().locator('.ch-row-format')).toHaveText('2 genre(s)');

    await page.locator('.ch-overlay .ch-dialog-header').click();
    await page.locator('.ch-overlay .ch-dialog-footer .ch-save').click();
    await expect(page.locator('.ch-overlay')).toHaveCount(0);

    const post = (await recordedRequests(page)).find((request) => request.method === 'POST' && request.path === 'CustomizedHome/Layout');
    expect((post?.body as Layout).Items[0]?.Genres).toEqual(['Action', 'Comedy']);
    await expect.poll(() => visibleSectionTitles(page)).toEqual(['Genre: Action', 'Genre: Comedy']);
});

test('other sections never carry genres', async ({ page }) => {
    await openHome(page, { layout: layoutWith([{ Type: 'section', Key: 'jf:nextup', Visible: true }]) });
    await openEditor(page);
    await page.locator(`${LIST} .ch-row`).first().locator('.ch-act-menu').click();
    await expect(page.locator('.ch-popup')).toBeVisible();
    await expect(page.locator('.ch-popup .ch-genre-option')).toHaveCount(0);
    await expect(page.locator('.ch-popup .ch-opt-genre-style')).toHaveCount(0);
});
