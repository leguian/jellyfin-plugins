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

test('left column: format menu opens directly and stays open while several options are picked', async ({ page }) => {
    await openHome(page, { layout: LAYOUT });
    await openEditor(page);
    const row = page.locator(`${LIST} .ch-row`, { hasText: 'My Media' });
    await row.locator('.ch-act-menu').click();
    expect(await page.locator('.ch-popup .ch-popup-label').allTextContents()).toEqual(['Card shape', 'Card size', 'Section', 'Cards']);
    await expect(page.locator('.ch-popup')).not.toContainText('Remove from the layout');

    await expect(page.locator('.ch-tooltip')).toHaveCount(0);
    await page.locator('.ch-popup button', { hasText: 'Landscape' }).click();
    await page.locator('.ch-popup button', { hasText: 'Large' }).click();
    await page.locator('.ch-popup .ch-opt-section-title').click();
    await expect(page.locator('.ch-popup')).toBeVisible();
    await expect(page.locator('.ch-popup button', { hasText: 'Landscape' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator(`${LIST} .ch-row`, { hasText: 'My Media' }).locator('.ch-row-format')).toHaveText('Landscape · Large · no section title');

    await page.keyboard.press('Escape');
    await expect(page.locator('.ch-popup')).toHaveCount(0);
    await expect(page.locator('.ch-overlay')).toHaveCount(1);

    await page.locator(`${LIST} .ch-row`, { hasText: 'My Media' }).locator('.ch-act-remove').click();
    expect(await rowTitles(page, LIST)).toEqual(['Continue Watching', 'Next Up']);
    expect(await rowTitles(page, UNLISTED)).toContain('My Media');
});

test('hiding the section title is saved and applied to the home page', async ({ page }) => {
    await openHome(page, { layout: LAYOUT });
    await openEditor(page);
    await page.locator(`${LIST} .ch-row`, { hasText: 'Next Up' }).locator('.ch-act-menu').click();
    await page.locator('.ch-popup .ch-opt-section-title').click();
    await page.keyboard.press('Escape');
    await page.locator('.ch-overlay .ch-dialog-footer .ch-save').click();
    await expect(page.locator('.ch-overlay')).toHaveCount(0);

    const post = (await recordedRequests(page)).find((request) => request.method === 'POST' && request.path === 'CustomizedHome/Layout');
    expect((post?.body as Layout).Items.find((item) => item.Key === 'jf:nextup')?.ShowSectionTitle).toBe(false);
    const nextUp = page.locator('#homeTab .verticalSection.section5');
    await expect(nextUp).toHaveClass(/ch-nosectiontitle/);
    await expect(nextUp.locator('h2')).toBeHidden();
    await expect(page.locator('#homeTab .verticalSection.section0 h2')).toBeVisible();
});

test('icons carry tooltips, and a legend explains the two origins', async ({ page }) => {
    await openHome(page, { layout: LAYOUT, enableIntegratedSections: true });
    await openEditor(page);
    await expect(page.locator('.ch-overlay .ch-legend')).toContainText('Customized Home section');
    await expect(page.locator('.ch-overlay .ch-legend')).toContainText('Jellyfin default section');

    const row = page.locator(`${LIST} .ch-row`, { hasText: 'My Media' });
    await expect(row.locator('.ch-origin-jellyfin svg')).toHaveCount(1);
    await row.locator('.ch-act-remove').hover();
    await expect(page.locator('.ch-tooltip')).toHaveText('Remove from the customized home page');
    await row.locator('.ch-origin-jellyfin').hover();
    await expect(page.locator('.ch-tooltip')).toHaveText('Jellyfin default section');

    const customized = page.locator(`${UNLISTED} .ch-row`, { hasText: 'Continue Watching / Next Up' });
    await expect(customized.locator('.ch-origin-customized')).toHaveText('house');
    await customized.locator('.ch-act-add').hover();
    await expect(page.locator('.ch-tooltip')).toHaveText('Add to the customized home page');
    await page.mouse.move(0, 0);
    await expect(page.locator('.ch-tooltip')).toHaveCount(0);
});

test('unchecking "also list not displayed sections" keeps the displayed and the plugin sections', async ({ page }) => {
    await openHome(page, { layout: LAYOUT, enableIntegratedSections: true });
    await openEditor(page);
    const toggle = page.locator('.ch-overlay .ch-show-all');
    await expect(toggle).not.toBeChecked();
    const titles = await rowTitles(page, UNLISTED);
    expect(titles).toContain('Recently Added in Movies');
    expect(titles).toContain('All genres');
    expect(titles).not.toContain('Live TV');
    await toggle.check();
    expect(await rowTitles(page, UNLISTED)).toContain('Live TV');
    await toggle.uncheck();
    expect(await rowTitles(page, UNLISTED)).not.toContain('Live TV');
    expect((await rowTitles(page, UNLISTED)).length).toBeGreaterThan(0);
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

test('a library name is never stored with the layout, and an unknown library shows no leftover name', async ({ page }) => {
    await openHome(page, {
        layout: {
            Version: 1,
            HideUnlisted: true,
            Items: [
                { Type: 'section', Key: 'jf:latestmedia:lib-movies', Visible: true, Label: 'Recently Added in Movies' },
                // Stored by an administrator, or before the user lost access to that library.
                { Type: 'section', Key: 'jf:latestmedia:lib-private', Visible: true, Label: 'Recently Added in Private Library' },
                { Type: 'section', Key: 'jf:nextup', Visible: true, Label: 'Next Up' }
            ]
        }
    });
    await openEditor(page);
    expect(await rowTitles(page, LIST)).toEqual(['Recently Added in Movies', 'Recently added (library not available)', 'Next Up']);
    await expect(page.getByText('Private Library')).toHaveCount(0);

    await page.locator('.ch-dialog-footer .ch-save').click();
    const saved = (await recordedRequests(page)).find((request) => request.method === 'POST' && request.path === 'CustomizedHome/Layout');
    const labels = (saved?.body as Layout).Items.map((item) => item.Label);
    expect(labels).toEqual([null, null, 'Next Up']);
});
