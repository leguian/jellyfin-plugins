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

test('an uploaded genre thumbnail replaces the collage', async ({ page }) => {
    await openHome(page, {
        enableIntegratedSections: true,
        genreImages: [{ Name: 'Comedy', Version: 7 }],
        layout: layoutWith([{ Type: 'section', Key: 'ch:allGenres', Visible: true }])
    });
    const comedy = page.locator('[data-ch-key="ch:allGenres"] .ch-card', { hasText: 'Comedy' });
    await expect(comedy.locator('.ch-collage')).toHaveCount(0);
    const background = await comedy.locator('a.cardImageContainer').evaluate((node) => (node as HTMLElement).style.backgroundImage);
    expect(background).toContain('CustomizedHome/GenreImages/Image?name=Comedy&v=7');
    await expect(page.locator('[data-ch-key="ch:allGenres"] .ch-card', { hasText: 'Action' }).locator('.ch-collage')).toHaveCount(1);
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
});
