import { test } from '@playwright/test';
import { LIGHT_DASHBOARD_STYLE, openAdminPage, openEditor, openHome, type Layout } from './support';

// Visual review helper, not an assertion suite: run with `npm run screenshots`.

const MATERIAL_ICONS = 'https://fonts.googleapis.com/icon?family=Material+Icons';
const OUTPUT_DIR = 'test-results/screenshots';

const DEFAULT_LAYOUT: Layout = {
    Version: 1,
    HideUnlisted: false,
    Items: [
        { Type: 'section', Key: 'jf:smalllibrarytiles', Visible: true, Size: 'small' },
        { Type: 'section', Key: 'ch:combined', Visible: true, Shape: 'landscape' },
        { Type: 'section', Key: 'jf:nextup', Visible: false },
        { Type: 'section', Key: 'ch:genre', Visible: true, Genres: ['Action'] },
        { Type: 'section', Key: 'ch:allGenres', Visible: true }
    ]
};

test('home with genre cards', async ({ page }) => {
    await openHome(page, { enableIntegratedSections: true, layout: DEFAULT_LAYOUT });
    await page.addStyleTag({ url: MATERIAL_ICONS });
    // The fixture has no jellyfin-web card stylesheet: give cards a size so the collage is visible.
    await page.addStyleTag({ content: '.ch-items{display:flex;gap:12px}.ch-card{width:150px}.cardPadder-overflowPortrait{padding-bottom:150%}.cardImageContainer{position:absolute;inset:0;background-size:cover}' });
    await page.locator('[data-ch-key="ch:allGenres"] .ch-collage').first().waitFor();
    await page.locator('[data-ch-key="ch:allGenres"]').screenshot({ path: `${OUTPUT_DIR}/home-all-genres.png` });
});

test('home with colored genre cards', async ({ page }) => {
    await openHome(page, {
        enableIntegratedSections: true,
        layout: { Version: 1, HideUnlisted: true, Items: [{ Type: 'section', Key: 'ch:allGenres', Visible: true, GenreStyle: 'colors' }] }
    });
    await page.addStyleTag({ content: '.ch-items{display:flex;gap:12px}.ch-card{width:240px}.cardPadder-overflowBackdrop{padding-bottom:56.25%}.cardImageContainer{position:absolute;inset:0}' });
    await page.locator('[data-ch-key="ch:allGenres"] .ch-genre-color').first().waitFor();
    await page.locator('[data-ch-key="ch:allGenres"]').screenshot({ path: `${OUTPUT_DIR}/home-all-genres-colors.png` });
});

test('home with a rotating hero: pause button next to the dots, keyboard focus on it', async ({ page }) => {
    const media = [1, 2, 3].map((index) => ({
        Id: `hero-${index}`, Name: `Featured movie ${index}`, Type: 'Movie' as const, MediaType: 'Video', ProductionYear: 2024,
        Overview: 'A synopsis long enough to show how the text sits above the actions of the hero.', BackdropImageTags: ['backdrop']
    }));
    await openHome(page, {
        enableIntegratedSections: true,
        heroItems: { recentMovies: media },
        layout: {
            Version: 1, HideUnlisted: false, Items: [{ Type: 'section', Key: 'jf:resume', Visible: true }],
            Hero: { Enabled: true, Sources: ['recentMovies'], Count: 3, IntervalSeconds: 10, ExcludePlayed: true, RequireBackdrop: true }
        }
    });
    await page.addStyleTag({ url: MATERIAL_ICONS });
    await page.locator('.ch-hero .ch-hero-pause').waitFor();
    await page.keyboard.press('Tab');
    await page.locator('.ch-hero .ch-hero-pause').focus();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUTPUT_DIR}/home-hero-pause.png` });
});

test('user editor', async ({ page }) => {
    await openHome(page, { enableIntegratedSections: true, layout: DEFAULT_LAYOUT });
    await page.addStyleTag({ url: MATERIAL_ICONS });
    await openEditor(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUTPUT_DIR}/editor.png` });
    await page.locator('.ch-overlay .ch-list .ch-row', { hasText: 'Genre' }).first().locator('.ch-act-menu').click();
    await page.locator('.ch-popup .ch-genre-option').first().waitFor();
    await page.screenshot({ path: `${OUTPUT_DIR}/editor-format-menu.png` });
    await page.keyboard.press('Escape');
    await page.locator('.ch-overlay .ch-list .ch-row').first().locator('.ch-act-remove').hover();
    await page.screenshot({ path: `${OUTPUT_DIR}/editor-tooltip.png` });
    await page.fill('.ch-overlay .ch-search', 'continue');
    await page.locator('.ch-overlay .ch-list .ch-row').first().hover();
    await page.screenshot({ path: `${OUTPUT_DIR}/editor-search.png` });
    // Unsaved changes: the question takes the place of the footer.
    await page.fill('.ch-overlay .ch-search', '');
    await page.locator('.ch-overlay .ch-list .ch-row').first().locator('.ch-handle').focus();
    await page.keyboard.press('ArrowDown');
    await page.screenshot({ path: `${OUTPUT_DIR}/editor-keyboard-move.png` });
    await page.keyboard.press('Escape');
    await page.locator('.ch-overlay .ch-confirm').waitFor();
    await page.screenshot({ path: `${OUTPUT_DIR}/editor-unsaved-changes.png` });
});

test('administration page', async ({ page }) => {
    await openAdminPage(page, { defaultLayout: DEFAULT_LAYOUT, enableIntegratedSections: true, genreImages: [{ Name: 'Comedy', Shape: 'portrait', Version: 1 }] });
    await page.addStyleTag({ url: MATERIAL_ICONS });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUTPUT_DIR}/admin-options.png`, fullPage: true });
    await page.click('#chTabLayouts');
    await page.waitForSelector('#chDefaultEditor .ch-row');
    await page.screenshot({ path: `${OUTPUT_DIR}/admin-layouts.png`, fullPage: true });
    await page.click('#chTabGenres');
    await page.locator('#chGenres .cha-genre').first().waitFor();
    await page.screenshot({ path: `${OUTPUT_DIR}/admin-genres.png`, fullPage: true });
});

test('administration page: a question asked in the page', async ({ page }) => {
    await openAdminPage(page, { defaultLayout: DEFAULT_LAYOUT, enableIntegratedSections: true });
    await page.addStyleTag({ url: MATERIAL_ICONS });
    await page.click('#chTabLayouts');
    await page.waitForSelector('#chDefaultEditor .ch-row');
    await page.click('#chClearDefault');
    await page.locator('.cha-ask').waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUTPUT_DIR}/admin-question.png` });
});

test('administration page: a question asked on a light dashboard', async ({ page }) => {
    await openAdminPage(page, { defaultLayout: DEFAULT_LAYOUT, enableIntegratedSections: true });
    await page.addStyleTag({ url: MATERIAL_ICONS });
    await page.addStyleTag({ content: LIGHT_DASHBOARD_STYLE });
    await page.click('#chTabLayouts');
    await page.waitForSelector('#chDefaultEditor .ch-row');
    await page.click('#chClearDefault');
    await page.locator('.cha-ask').waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUTPUT_DIR}/admin-question-light.png` });
});

test('administration page on a light dashboard', async ({ page }) => {
    await openAdminPage(page, { defaultLayout: DEFAULT_LAYOUT, enableIntegratedSections: true });
    await page.addStyleTag({ url: MATERIAL_ICONS });
    await page.addStyleTag({ content: LIGHT_DASHBOARD_STYLE });
    await page.click('#chTabLayouts');
    await page.waitForSelector('#chDefaultEditor .ch-row');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUTPUT_DIR}/admin-layouts-light.png`, fullPage: true });
    await page.locator('#chDefaultEditor .ch-list .ch-row').first().locator('.ch-act-menu').click();
    await page.screenshot({ path: `${OUTPUT_DIR}/admin-layouts-light-menu.png`, fullPage: true });
});
