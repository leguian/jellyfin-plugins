import { expect, test } from '@playwright/test';
import { openEditor, openHome, recordedRequests, rowTitles, visibleSectionTitles, type Layout } from './support';

const LIST = '.ch-overlay .ch-list';
const UNLISTED = '.ch-overlay .ch-unlisted';

const LAYOUT: Layout = {
    Version: 1,
    HideUnlisted: true,
    Items: [
        { Type: 'section', Key: 'jf:smalllibrarytiles', Visible: true },
        { Type: 'section', Key: 'jf:resume', Visible: true },
        { Type: 'section', Key: 'jf:nextup', Visible: true }
    ]
};

async function openEmptyEditor(page: import('@playwright/test').Page): Promise<void> {
    await page.click('.ch-customize-button');
    await page.waitForSelector(`${UNLISTED} .ch-row`);
}

test('without a layout the left column is empty and every home section sits on the right', async ({ page }) => {
    await openHome(page);
    await openEmptyEditor(page);
    expect(await rowTitles(page, LIST)).toEqual([]);
    await expect(page.locator(`${LIST} .ch-empty`)).toContainText('the default home page is displayed');
    expect(await rowTitles(page, UNLISTED)).toEqual([
        'Continue Listening', 'Continue Reading', 'Continue Watching', 'My Media', 'Next Up', 'Recently Added in Movies', 'Recently Added in Shows'
    ]);
    // Removed from the editor: arrows, folder creation, "hide unlisted" toggle; top save is for the embedded editor only.
    await expect(page.locator('.ch-act-up, .ch-act-down, .ch-new-folder, .ch-hide-unlisted')).toHaveCount(0);
    await expect(page.locator('.ch-overlay .ch-save-top')).toBeHidden();
});

test('right column rows only offer "add", which puts the section at the very top', async ({ page }) => {
    await openHome(page, { layout: LAYOUT });
    await openEditor(page);
    const row = page.locator(`${UNLISTED} .ch-row`, { hasText: 'Recently Added in Shows' });
    await expect(row.locator('.ch-act-visibility, .ch-act-menu, .ch-act-top, .ch-act-remove')).toHaveCount(0);
    await row.locator('.ch-act-add').click();
    expect(await rowTitles(page, LIST)).toEqual(['Recently Added in Shows', 'My Media', 'Continue Watching', 'Next Up']);
    expect(await rowTitles(page, UNLISTED)).not.toContain('Recently Added in Shows');
});

test('left column: the menu button opens the display format options directly, remove has its own action', async ({ page }) => {
    await openHome(page, { layout: LAYOUT });
    await openEditor(page);
    const row = page.locator(`${LIST} .ch-row`, { hasText: 'My Media' });
    await row.locator('.ch-act-menu').click();
    const labels = await page.locator('.ch-popup .ch-popup-label').allTextContents();
    expect(labels).toEqual(['Card shape', 'Card size']);
    await expect(page.locator('.ch-popup')).not.toContainText('Remove from the layout');
    await page.locator('.ch-popup button', { hasText: 'Landscape' }).click();
    await expect(row.locator('.ch-row-format')).toHaveText('Landscape');

    await row.locator('.ch-act-remove').click();
    expect(await rowTitles(page, LIST)).toEqual(['Continue Watching', 'Next Up']);
    expect(await rowTitles(page, UNLISTED)).toContain('My Media');
});

test('search: left rows get "move to top", right rows get "add" and no "move to top"', async ({ page }) => {
    await openHome(page, { layout: LAYOUT });
    await openEditor(page);
    await expect(page.locator('.ch-act-top')).toHaveCount(0);

    await page.fill('.ch-overlay .ch-search', 'live');
    expect(await rowTitles(page, LIST)).toEqual([]);
    expect(await rowTitles(page, UNLISTED)).toEqual(['Live TV']);
    await expect(page.locator(`${UNLISTED} .ch-act-top`)).toHaveCount(0);
    await page.locator(`${UNLISTED} .ch-row .ch-act-add`).click();

    await page.fill('.ch-overlay .ch-search', 'next');
    const nextUp = page.locator(`${LIST} .ch-row`, { hasText: 'Next Up' });
    await nextUp.hover();
    await nextUp.locator('.ch-act-top').click();
    await page.fill('.ch-overlay .ch-search', '');
    expect(await rowTitles(page, LIST)).toEqual(['Next Up', 'Live TV', 'My Media', 'Continue Watching']);
});

test('saved layout replaces the default home page', async ({ page }) => {
    await openHome(page);
    await openEmptyEditor(page);
    await page.locator(`${UNLISTED} .ch-row`, { hasText: 'My Media' }).locator('.ch-act-add').click();
    await page.locator(`${UNLISTED} .ch-row`, { hasText: 'Continue Watching' }).locator('.ch-act-add').click();
    await page.locator(`${UNLISTED} .ch-row`, { hasText: 'Next Up' }).locator('.ch-act-add').click();
    await page.locator(`${LIST} .ch-row`, { hasText: 'Continue Watching' }).locator('.ch-act-visibility').click();
    await page.locator('.ch-overlay .ch-dialog-footer .ch-save').click();
    await expect(page.locator('.ch-overlay')).toHaveCount(0);

    const post = (await recordedRequests(page)).find((request) => request.method === 'POST' && request.path === 'CustomizedHome/Layout');
    const saved = post?.body as Layout;
    expect(saved.Items.map((item) => item.Key)).toEqual(['jf:nextup', 'jf:resume', 'jf:smalllibrarytiles']);
    expect(saved.HideUnlisted).toBe(true);
    expect(saved.Items.find((item) => item.Key === 'jf:resume')?.Visible).toBe(false);
    // Only the listed, visible sections remain: the "Recently Added" rows are gone.
    await expect.poll(() => visibleSectionTitles(page)).toEqual(['Next Up', 'My Media']);
});

test('drag and drop reorders sections and dropping on the right column removes them', async ({ page }) => {
    await openHome(page, { layout: LAYOUT });
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
