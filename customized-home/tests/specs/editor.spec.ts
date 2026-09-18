import { expect, test } from '@playwright/test';
import { openEditor, openHome, recordedRequests, rowTitles, visibleSectionTitles, type Layout } from './support';

const LIST = '.ch-overlay .ch-list';
const UNLISTED = '.ch-overlay .ch-unlisted';

test('shows the home sections on the left and the other known sections on the right', async ({ page }) => {
    await openHome(page);
    await openEditor(page);
    // Sections rendered by the web client but currently empty (hidden) are listed too.
    expect(await rowTitles(page, LIST)).toEqual([
        'My Media', 'Continue Watching', 'Continue Listening', 'Continue Reading', 'Next Up', 'Recently Added in Movies', 'Recently Added in Shows'
    ]);
    await expect(page.locator('.ch-overlay .ch-col-layout .ch-col-title')).toHaveText('Customized home page');
    await expect(page.locator('.ch-overlay .ch-col-unlisted .ch-col-title')).toHaveText('Sections not in the layout');
    // No up/down arrows, no folder creation, and the top save button is reserved to the embedded editor.
    await expect(page.locator('.ch-act-up, .ch-act-down, .ch-new-folder')).toHaveCount(0);
    await expect(page.locator('.ch-overlay .ch-save-top')).toBeHidden();
});

test('row menu offers format and removal, never a folder entry', async ({ page }) => {
    await openHome(page);
    await openEditor(page);
    await page.locator(`${LIST} .ch-row`).first().locator('.ch-act-menu').click();
    const entries = await page.locator('.ch-popup button, .ch-popup .ch-popup-label').allTextContents();
    expect(entries.map((text) => text.replace(/^[a-z_]+/, '').trim())).toEqual(['Display format', 'Remove from the layout']);
});

test('search finds sections that are not displayed and moves one to the very top', async ({ page }) => {
    await openHome(page);
    await openEditor(page);
    await expect(page.locator('.ch-act-top')).toHaveCount(0);

    await page.fill('.ch-overlay .ch-search', 'live');
    expect(await rowTitles(page, LIST)).toEqual([]);
    expect(await rowTitles(page, UNLISTED)).toEqual(['Live TV']);

    const row = page.locator(`${UNLISTED} .ch-row`).first();
    await row.hover();
    await row.locator('.ch-act-top').click();
    await page.fill('.ch-overlay .ch-search', '');
    expect((await rowTitles(page, LIST))[0]).toBe('Live TV');
});

test('saves the edited layout and applies it to the home page', async ({ page }) => {
    await openHome(page);
    await openEditor(page);
    // Hide "Continue Watching", then move "Next Up" first through the search shortcut.
    await page.locator(`${LIST} .ch-row`, { hasText: 'Continue Watching' }).locator('.ch-act-visibility').click();
    await page.fill('.ch-overlay .ch-search', 'next up');
    const nextUp = page.locator(`${LIST} .ch-row`, { hasText: 'Next Up' });
    await nextUp.hover();
    await nextUp.locator('.ch-act-top').click();
    await page.locator('.ch-overlay .ch-dialog-footer .ch-save').click();
    await expect(page.locator('.ch-overlay')).toHaveCount(0);

    const post = (await recordedRequests(page)).find((request) => request.method === 'POST' && request.path === 'CustomizedHome/Layout');
    const saved = post?.body as Layout;
    expect(saved.Items.map((item) => item.Key)).toEqual([
        'jf:nextup', 'jf:smalllibrarytiles', 'jf:resume', 'jf:resumeaudio', 'jf:resumebook', 'jf:latestmedia:lib-movies', 'jf:latestmedia:lib-shows'
    ]);
    expect(saved.Items.find((item) => item.Key === 'jf:resume')?.Visible).toBe(false);
    await expect.poll(() => visibleSectionTitles(page)).toEqual([
        'Next Up', 'My Media', 'Recently Added in Movies', 'Recently Added in Shows'
    ]);
});

test('drag and drop reorders sections and dropping on the right column removes them', async ({ page }) => {
    await openHome(page);
    await openEditor(page);

    const source = page.locator(`${LIST} .ch-row`, { hasText: 'Next Up' }).locator('.ch-handle');
    const target = page.locator(`${LIST} .ch-row`).first();
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) {
        throw new Error('rows not laid out');
    }
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox.x + 10, sourceBox.y - 10, { steps: 4 });
    await page.mouse.move(targetBox.x + 20, targetBox.y + 2, { steps: 8 });
    await page.mouse.up();
    expect((await rowTitles(page, LIST))[0]).toBe('Next Up');

    const handle = page.locator(`${LIST} .ch-row`, { hasText: 'My Media' }).locator('.ch-handle');
    const handleBox = await handle.boundingBox();
    const sideBox = await page.locator('.ch-overlay .ch-col-unlisted').boundingBox();
    if (!handleBox || !sideBox) {
        throw new Error('columns not laid out');
    }
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + 30, handleBox.y + 10, { steps: 4 });
    await page.mouse.move(sideBox.x + sideBox.width / 2, sideBox.y + 40, { steps: 8 });
    await expect(page.locator('.ch-overlay .ch-col-unlisted')).toHaveClass(/ch-drop-remove/);
    await page.mouse.up();
    expect(await rowTitles(page, LIST)).not.toContain('My Media');
    expect(await rowTitles(page, UNLISTED)).toContain('My Media');
});
