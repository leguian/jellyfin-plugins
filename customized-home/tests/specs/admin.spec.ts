import { expect, test } from '@playwright/test';
import { openAdminPage, recordedRequests, rowTitles, type Layout } from './support';

const EDITOR = '#chDefaultEditor';

const DEFAULT_LAYOUT: Layout = {
    Version: 1,
    HideUnlisted: false,
    Items: [
        { Type: 'section', Key: 'jf:smalllibrarytiles', Visible: true },
        { Type: 'section', Key: 'jf:nextup', Visible: true }
    ]
};

test('shows the options tab with the injection status', async ({ page }) => {
    await openAdminPage(page);
    await expect(page.locator('#chTabOptions')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#chStatusBadge')).toHaveText('Active');
    await expect(page.locator('#chPanelLayouts')).toBeHidden();
});

test('layouts tab embeds the default layout editor, limited to 960px, with a save button on top', async ({ page }) => {
    await openAdminPage(page, { defaultLayout: DEFAULT_LAYOUT });
    await page.click('#chTabLayouts');
    await expect(page.locator('#chPanelOptions')).toBeHidden();
    await page.waitForSelector(`${EDITOR} .ch-list .ch-row`);

    expect(await rowTitles(page, `${EDITOR} .ch-list`)).toEqual(['My Media', 'Next Up']);
    expect(await rowTitles(page, `${EDITOR} .ch-unlisted`)).toContain('Live TV');
    await expect(page.locator(`${EDITOR} .ch-save-top`)).toBeVisible();

    const width = await page.locator('.cha-shell').evaluate((node) => node.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(960);
});

test('top save button stores the default layout and keeps the editor open', async ({ page }) => {
    await openAdminPage(page, { defaultLayout: DEFAULT_LAYOUT });
    await page.click('#chTabLayouts');
    await page.waitForSelector(`${EDITOR} .ch-list .ch-row`);
    await page.locator(`${EDITOR} .ch-list .ch-row`, { hasText: 'Next Up' }).locator('.ch-act-visibility').click();
    await page.click(`${EDITOR} .ch-save-top`);

    await expect.poll(async () => (await recordedRequests(page)).some((request) => request.method === 'POST' && request.path === 'CustomizedHome/DefaultLayout')).toBe(true);
    const post = (await recordedRequests(page)).find((request) => request.method === 'POST' && request.path === 'CustomizedHome/DefaultLayout');
    const saved = post?.body as Layout;
    expect(saved.Items.find((item) => item.Key === 'jf:nextup')?.Visible).toBe(false);
    await expect(page.locator(`${EDITOR} .ch-list .ch-row`)).toHaveCount(2);
    await expect(page.locator('#chDefaultSummary')).toContainText('2 section(s), 1 hidden');
});
