import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LIGHT_DASHBOARD_STYLE, openAdminPage, recordedRequests, rowTitles, textContrast, type Layout } from './support';

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

const READABLE_TEXTS = ['.ch-hint', '.ch-col-layout .ch-col-title', '.ch-list .ch-row-title', '.ch-list .ch-row-sub', '.ch-unlisted .ch-row-title',
    '.ch-unlisted .ch-row-sub', '.ch-dialog-footer .ch-cancel'];
// WCAG AA for normal size text.
const MIN_CONTRAST = 4.5;

for (const theme of ['light', 'dark'] as const) {
    test(`embedded editor takes the text colour of a ${theme} dashboard and stays readable`, async ({ page }) => {
        await openAdminPage(page, { defaultLayout: DEFAULT_LAYOUT, enableIntegratedSections: true });
        if (theme === 'light') {
            await page.addStyleTag({ content: LIGHT_DASHBOARD_STYLE });
        }
        await page.click('#chTabLayouts');
        await page.waitForSelector(`${EDITOR} .ch-list .ch-row`);

        const pageColor = await page.evaluate(() => getComputedStyle(document.body).color);
        await expect(page.locator(`${EDITOR} .ch-dialog`)).toHaveCSS('color', pageColor);
        await expect(page.locator(`${EDITOR} .ch-dialog`)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        for (const selector of READABLE_TEXTS) {
            const ratio = await textContrast(page.locator(`${EDITOR} ${selector}`));
            expect(ratio, `${selector} on a ${theme} dashboard`).toBeGreaterThanOrEqual(MIN_CONTRAST);
        }
        // Rows of the default layout are not "absent": there is no home page to be absent from.
        await expect(page.locator(`${EDITOR} .ch-row-absent`)).toHaveCount(0);
    });
}

test('light dashboard: a folder name field has no dark surface left', async ({ page }) => {
    await openAdminPage(page, {
        defaultLayout: { Version: 1, HideUnlisted: true, Items: [{ Type: 'folder', Id: 'f1', Name: 'Series', Visible: true, Items: [{ Type: 'section', Key: 'jf:nextup', Visible: true }] }] }
    });
    await page.addStyleTag({ content: LIGHT_DASHBOARD_STYLE });
    await page.click('#chTabLayouts');
    const field = page.locator(`${EDITOR} .ch-folder-name`);
    await expect(field).toHaveValue('Series');
    expect(await textContrast(field)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    // Derived from the text colour (black on this theme), where the modal dialog uses a fixed dark tint.
    expect(await field.evaluate((node) => getComputedStyle(node).backgroundColor)).toMatch(/^color\(srgb 0 0 0 \/ 0\.0\d+\)$/);
});

test('genres tab shows the optimal sizes and handles one thumbnail per card shape', async ({ page }) => {
    await openAdminPage(page, { genreImages: [{ Name: 'Comedy', Shape: 'portrait', Version: 4 }] });
    await page.click('#chTabGenres');
    await expect(page.locator('#chTabGenres')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#chTabLayouts')).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#chPanelLayouts')).toBeHidden();
    await expect(page.locator('#chGenreSpecs .cha-spec')).toHaveText([
        /Poster · 2:3.*Optimal size: 600 × 900 px/, /Landscape · 16:9.*Optimal size: 960 × 540 px/, /Square · 1:1.*Optimal size: 600 × 600 px/
    ]);

    await expect(page.locator('#chGenres .cha-genre')).toHaveCount(3);
    const comedy = page.locator('#chGenres .cha-genre', { hasText: 'Comedy' });
    await expect(comedy.locator('.cha-slot')).toHaveCount(3);
    const poster = comedy.locator('.cha-slot[data-shape="portrait"] .cha-genre-thumb');
    await expect(poster).toHaveClass(/cha-has-image/);
    // Surfaces derive from currentColor: the slot must keep a visible background even if the image fails to load.
    expect(await poster.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toMatch(/\/ 0\)$|rgba\(0, 0, 0, 0\)/);
    const landscape = comedy.locator('.cha-slot[data-shape="landscape"]');
    await expect(landscape.locator('.cha-genre-thumb')).toHaveText('16:9');
    // Each slot previews its own ratio.
    const ratio = await landscape.locator('.cha-genre-thumb').evaluate((node) => {
        const box = node.getBoundingClientRect();
        return box.width / box.height;
    });
    expect(ratio).toBeCloseTo(16 / 9, 1);

    // Smallest valid PNG (1 x 1).
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const chooser = page.waitForEvent('filechooser');
    await landscape.locator('.chGenreUpload').click();
    await (await chooser).setFiles({ name: 'comedy.png', mimeType: 'image/png', buffer: png });

    await expect(landscape.locator('.cha-genre-thumb')).toHaveClass(/cha-has-image/);
    const upload = (await recordedRequests(page)).find((request) => request.method === 'POST' && request.path === 'CustomizedHome/GenreImages');
    expect(upload?.body).toMatchObject({ Name: 'Comedy', Shape: 'landscape', Data: png.toString('base64') });

    // Removing one shape leaves the others alone.
    await landscape.locator('.chGenreRemove').click();
    await page.locator('.cha-ask .cha-ask-yes').click();
    await expect(landscape.locator('.cha-genre-thumb')).toHaveText('16:9');
    await expect(landscape.locator('.chGenreRemove')).toHaveCount(0);
    await expect(comedy.locator('.cha-slot[data-shape="portrait"] .cha-genre-thumb')).toHaveClass(/cha-has-image/);
});

test('genres tab rejects files that are not PNG, JPEG or WebP before sending anything', async ({ page }) => {
    await openAdminPage(page);
    await page.click('#chTabGenres');
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#chGenres .cha-genre').first().locator('.chGenreUpload').first().click();
    await (await chooser).setFiles({ name: 'evil.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
    await expect.poll(async () => (await recordedRequests(page)).some((request) => request.method === 'ALERT')).toBe(true);
    expect((await recordedRequests(page)).some((request) => request.method === 'POST' && request.path === 'CustomizedHome/GenreImages')).toBe(false);
});

/* ---- questions asked in the page, in place of window.confirm ---- */

/** Records native dialogs and dismisses them: any window.confirm left in the page shows up here. */
function nativeDialogs(page: Page): string[] {
    const seen: string[] = [];
    page.on('dialog', (dialog) => {
        seen.push(`${dialog.type()}: ${dialog.message()}`);
        void dialog.dismiss();
    });
    return seen;
}

const ASK = '.cha-ask';

test('clearing the default layout asks in the page, and only clears it once confirmed', async ({ page }) => {
    const dialogs = nativeDialogs(page);
    await openAdminPage(page, { defaultLayout: DEFAULT_LAYOUT });
    await page.click('#chTabLayouts');
    await page.waitForSelector(`${EDITOR} .ch-list .ch-row`);
    const question = page.locator(ASK);

    await page.click('#chClearDefault');
    await expect(question).toHaveAttribute('role', 'alertdialog');
    await expect(question.locator('.cha-ask-title')).toHaveText('Clear the default layout?');
    await expect(question.locator('.cha-ask-text')).toContainText('cannot be recovered');
    await expect(question.locator('.cha-ask-yes')).toHaveText('Clear');
    // The answer that changes nothing has the focus.
    await expect(question.locator('.cha-ask-no')).toBeFocused();

    // Cancel changes nothing and hands the focus back to the button that asked.
    await question.locator('.cha-ask-no').click();
    await expect(question).toHaveCount(0);
    expect((await recordedRequests(page)).some((request) => request.method === 'POST' && request.path === 'CustomizedHome/DefaultLayout')).toBe(false);
    await expect(page.locator('#chClearDefault')).toBeFocused();

    await page.click('#chClearDefault');
    await question.locator('.cha-ask-yes').click();
    await expect(question).toHaveCount(0);
    await expect.poll(async () => (await recordedRequests(page)).filter((request) => request.method === 'POST' && request.path === 'CustomizedHome/DefaultLayout').length).toBe(1);
    await expect(page.locator('#chDefaultSummary')).toContainText('No default layout yet');
    expect(dialogs).toEqual([]);
});

test('a pending question keeps the keyboard: Escape cancels and Tab goes round the two answers only', async ({ page }) => {
    await openAdminPage(page, { defaultLayout: DEFAULT_LAYOUT });
    await page.click('#chTabLayouts');
    await page.waitForSelector(`${EDITOR} .ch-list .ch-row`);
    const question = page.locator(ASK);

    await page.click('#chClearDefault');
    await expect(question.locator('.cha-ask-no')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(question.locator('.cha-ask-yes')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(question.locator('.cha-ask-no')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(question.locator('.cha-ask-yes')).toBeFocused();

    // Escape means "cancel": nothing is sent, and the focus goes back to the button that asked.
    await page.keyboard.press('Escape');
    await expect(question).toHaveCount(0);
    expect((await recordedRequests(page)).some((request) => request.method === 'POST' && request.path === 'CustomizedHome/DefaultLayout')).toBe(false);
    await expect(page.locator('#chClearDefault')).toBeFocused();
});

const USER_LAYOUTS = [{ UserId: 'user-2', UserName: 'Alice', SectionCount: 3, ModifiedUtc: '2026-01-05T10:00:00Z' }];

test('resetting a user asks in the page and names the user it is about', async ({ page }) => {
    const dialogs = nativeDialogs(page);
    await openAdminPage(page, { defaultLayout: DEFAULT_LAYOUT, userLayouts: USER_LAYOUTS });
    await page.click('#chTabLayouts');
    await page.waitForSelector('#chUserLayouts .cha-user');
    const name = await page.locator('#chUserLayouts .cha-user-name').first().textContent();
    const question = page.locator(ASK);

    await page.locator('#chUserLayouts .chResetUser').first().click();
    await expect(question.locator('.cha-ask-title')).toHaveText(`Reset ${name} to the default layout?`);
    await expect(question.locator('.cha-ask-text')).toContainText('cannot be recovered');
    await expect(question.locator('.cha-ask-yes')).toHaveText('Reset');
    await expect(question.locator('.cha-ask-no')).toBeFocused();

    await question.locator('.cha-ask-no').click();
    expect((await recordedRequests(page)).some((request) => request.method === 'DELETE' && request.path === 'CustomizedHome/Layout')).toBe(false);

    await page.locator('#chUserLayouts .chResetUser').first().click();
    await question.locator('.cha-ask-yes').click();
    await expect.poll(async () => (await recordedRequests(page)).filter((request) => request.method === 'DELETE' && request.path === 'CustomizedHome/Layout').length).toBe(1);
    expect(dialogs).toEqual([]);
});

test('removing a genre thumbnail asks in the page, naming the genre and the card shape', async ({ page }) => {
    const dialogs = nativeDialogs(page);
    await openAdminPage(page, { genreImages: [{ Name: 'Comedy', Shape: 'landscape', Version: 2 }] });
    await page.click('#chTabGenres');
    const landscape = page.locator('#chGenres .cha-genre', { hasText: 'Comedy' }).locator('.cha-slot[data-shape="landscape"]');
    await expect(landscape.locator('.cha-genre-thumb')).toHaveClass(/cha-has-image/);
    const question = page.locator(ASK);

    await landscape.locator('.chGenreRemove').click();
    await expect(question).toHaveAttribute('role', 'alertdialog');
    await expect(question.locator('.cha-ask-title')).toHaveText('Remove this thumbnail?');
    // The wording names the card shape by its label, not by its internal id.
    await expect(question.locator('.cha-ask-text')).toContainText('landscape thumbnail of "Comedy"');
    await expect(question.locator('.cha-ask-yes')).toHaveText('Remove');
    await expect(question.locator('.cha-ask-no')).toBeFocused();

    await question.locator('.cha-ask-no').click();
    expect((await recordedRequests(page)).some((request) => request.method === 'DELETE' && request.path === 'CustomizedHome/GenreImages')).toBe(false);
    await expect(landscape.locator('.cha-genre-thumb')).toHaveClass(/cha-has-image/);

    await landscape.locator('.chGenreRemove').click();
    await question.locator('.cha-ask-yes').click();
    await expect(landscape.locator('.cha-genre-thumb')).toHaveText('16:9');
    expect(dialogs).toEqual([]);
});

for (const theme of ['light', 'dark'] as const) {
    test(`the question is opaque and readable on a ${theme} dashboard`, async ({ page }) => {
        await openAdminPage(page, { defaultLayout: DEFAULT_LAYOUT });
        if (theme === 'light') {
            await page.addStyleTag({ content: LIGHT_DASHBOARD_STYLE });
        }
        await page.click('#chTabLayouts');
        await page.waitForSelector(`${EDITOR} .ch-list .ch-row`);
        await page.click('#chClearDefault');
        const question = page.locator(ASK);

        // Opaque: the page must not show through the card of a question.
        const background = await question.evaluate((node) => getComputedStyle(node).backgroundColor);
        expect(background, `${theme} dashboard`).toBe(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));

        for (const selector of ['.cha-ask-title', '.cha-ask-text', '.cha-ask-no', '.cha-ask-yes']) {
            const ratio = await textContrast(question.locator(selector));
            expect(ratio, `${selector} on a ${theme} dashboard`).toBeGreaterThanOrEqual(MIN_CONTRAST);
        }
    });
}
