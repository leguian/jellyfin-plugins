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
    await page.locator('.ch-popup .ch-act-genres').click();
    await expect(page.locator('.ch-genre-option')).toHaveText(['Action', 'Comedy', 'Drama']);
    await expect(page.locator('.ch-genre-option input').first()).toBeChecked();
    await page.locator('.ch-genre-option', { hasText: 'Comedy' }).locator('input').check();
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
    await expect(page.locator('.ch-popup .ch-act-genres')).toHaveCount(0);
});
