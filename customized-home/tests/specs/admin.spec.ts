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

test('layouts tab embeds the default layout editor, limited to 1100px, with a save button on top', async ({ page }) => {
    await openAdminPage(page, { defaultLayout: DEFAULT_LAYOUT });
    await page.click('#chTabLayouts');
    await expect(page.locator('#chPanelOptions')).toBeHidden();
    await page.waitForSelector(`${EDITOR} .ch-list .ch-row`);

    expect(await rowTitles(page, `${EDITOR} .ch-list`)).toEqual(['My Media', 'Next Up']);
    expect(await rowTitles(page, `${EDITOR} .ch-unlisted`)).toContain('Live TV');
    await expect(page.locator(`${EDITOR} .ch-save-top`)).toBeVisible();

    const width = await page.locator('.cha-shell').evaluate((node) => node.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(1100);
    expect(width).toBeGreaterThan(960);
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

test('forcing the default layout comes first, turns off and locks the customization options', async ({ page }) => {
    await openAdminPage(page);
    const usersCard = page.locator('#CustomizedHomeConfigForm .cha-card').first();
    const switches = await usersCard.locator('.cha-switch').evaluateAll((nodes) => nodes.map((node) => node.id));
    expect(switches).toEqual(['chForceDefaultLayout', 'chAllowUserCustomization']);

    const locked = ['#chAllowUserCustomization', '#chShowCustomizeButtonOnHome', '#chShowUserMenuEntry'];
    for (const selector of locked) {
        await page.check(selector);
    }
    await page.check('#chForceDefaultLayout');
    for (const selector of locked) {
        await expect(page.locator(selector)).not.toBeChecked();
        await expect(page.locator(selector)).toBeDisabled();
    }
    await page.click('#CustomizedHomeConfigForm button[type="submit"]');
    await expect.poll(async () => (await recordedRequests(page)).find((request) => request.path === 'PluginConfiguration')?.body).toMatchObject({
        ForceDefaultLayout: true,
        AllowUserCustomization: false,
        ShowCustomizeButtonOnHome: false,
        ShowUserMenuEntry: false
    });

    await page.uncheck('#chForceDefaultLayout');
    for (const selector of locked) {
        await expect(page.locator(selector)).toBeEnabled();
    }
});

test('options form is as wide as the cards despite the dashboard form width cap', async ({ page }) => {
    await openAdminPage(page);
    const widths = await page.evaluate(() => {
        const width = (selector: string): number => document.querySelector(selector)?.getBoundingClientRect().width ?? 0;
        return { statusCard: width('#chPanelOptions > .cha-card'), form: width('#CustomizedHomeConfigForm') };
    });
    expect(widths.statusCard).toBeGreaterThan(0);
    expect(widths.form).toBe(widths.statusCard);
});

test('layouts tab has no "not displayed" toggle: there is no home page under the administration editor', async ({ page }) => {
    await openAdminPage(page, { defaultLayout: DEFAULT_LAYOUT });
    await page.click('#chTabLayouts');
    await page.waitForSelector(`${EDITOR} .ch-list .ch-row`);
    await expect(page.locator(`${EDITOR} .ch-show-all`)).toBeHidden();
    expect((await rowTitles(page, `${EDITOR} .ch-unlisted`)).length).toBeGreaterThan(0);
});

test('genres tab uploads, replaces and removes a genre thumbnail', async ({ page }) => {
    await openAdminPage(page);
    await page.click('#chTabGenres');
    await expect(page.locator('#chTabGenres')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#chTabLayouts')).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#chPanelLayouts')).toBeHidden();
    await expect(page.locator('#chGenres .cha-genre')).toHaveCount(3);
    const comedy = page.locator('#chGenres .cha-genre', { hasText: 'Comedy' });
    await expect(comedy.locator('.cha-genre-thumb')).toHaveText('Poster collage');

    // Smallest valid PNG (1 x 1).
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const chooser = page.waitForEvent('filechooser');
    await comedy.locator('.chGenreUpload').click();
    await (await chooser).setFiles({ name: 'comedy.png', mimeType: 'image/png', buffer: png });

    await expect(comedy.locator('.cha-genre-thumb')).toHaveClass(/cha-has-image/);
    const upload = (await recordedRequests(page)).find((request) => request.method === 'POST' && request.path === 'CustomizedHome/GenreImages');
    expect(upload?.body).toMatchObject({ Name: 'Comedy', Data: png.toString('base64') });

    page.once('dialog', (dialog) => void dialog.accept());
    await comedy.locator('.chGenreRemove').click();
    await expect(comedy.locator('.cha-genre-thumb')).toHaveText('Poster collage');
    await expect(comedy.locator('.chGenreRemove')).toHaveCount(0);
});

test('genres tab rejects files that are not PNG, JPEG or WebP before sending anything', async ({ page }) => {
    await openAdminPage(page);
    await page.click('#chTabGenres');
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#chGenres .cha-genre').first().locator('.chGenreUpload').click();
    await (await chooser).setFiles({ name: 'evil.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
    await expect.poll(async () => (await recordedRequests(page)).some((request) => request.method === 'ALERT')).toBe(true);
    expect((await recordedRequests(page)).some((request) => request.method === 'POST' && request.path === 'CustomizedHome/GenreImages')).toBe(false);
});
