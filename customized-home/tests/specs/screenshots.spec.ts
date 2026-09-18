import { test } from '@playwright/test';
import { openAdminPage, openEditor, openHome, type Layout } from './support';

// Visual review helper, not an assertion suite: run with `npm run screenshots`.

const MATERIAL_ICONS = 'https://fonts.googleapis.com/icon?family=Material+Icons';
const OUTPUT_DIR = 'test-results/screenshots';

const DEFAULT_LAYOUT: Layout = {
    Version: 1,
    HideUnlisted: false,
    Items: [
        { Type: 'section', Key: 'jf:smalllibrarytiles', Visible: true, Size: 'small' },
        { Type: 'section', Key: 'ch:combined', Visible: true, Shape: 'landscape' },
        { Type: 'section', Key: 'jf:nextup', Visible: false }
    ]
};

test('user editor', async ({ page }) => {
    await openHome(page, { enableIntegratedSections: true });
    await page.addStyleTag({ url: MATERIAL_ICONS });
    await openEditor(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUTPUT_DIR}/editor.png` });
    await page.fill('.ch-overlay .ch-search', 'continue');
    await page.locator('.ch-overlay .ch-unlisted .ch-row').first().hover();
    await page.screenshot({ path: `${OUTPUT_DIR}/editor-search.png` });
});

test('administration page', async ({ page }) => {
    await openAdminPage(page, { defaultLayout: DEFAULT_LAYOUT, enableIntegratedSections: true });
    await page.addStyleTag({ url: MATERIAL_ICONS });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUTPUT_DIR}/admin-options.png`, fullPage: true });
    await page.click('#chTabLayouts');
    await page.waitForSelector('#chDefaultEditor .ch-row');
    await page.screenshot({ path: `${OUTPUT_DIR}/admin-layouts.png`, fullPage: true });
});
