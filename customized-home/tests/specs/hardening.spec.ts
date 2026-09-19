import { expect, test, type Page } from '@playwright/test';
import { openEditor, openHome, recordedRequests, rowTitles, updateMock, visibleSectionTitles, type FolderLayout, type LayoutFolder, type LayoutSection } from './support';

// Layout keys and folder ids are free text for the server: names of Object.prototype members must be keys like
// any other for every map of the script (a plain {} answers "constructor" with a function, and swallows "__proto__").

const LIST = '.ch-overlay .ch-list';

const HOSTILE_LAYOUT: FolderLayout = {
    Version: 1,
    HideUnlisted: true,
    Items: [
        { Type: 'section', Key: 'constructor', Visible: true, Label: 'Constructor row' },
        { Type: 'section', Key: 'jf:resume', Visible: true },
        { Type: 'section', Key: '__proto__', Visible: true },
        {
            Type: 'folder', Id: 'constructor', Name: 'Constructor folder', Visible: true, Items: [
                { Type: 'section', Key: 'jf:nextup', Visible: true },
                { Type: 'section', Key: 'toString', Visible: true }
            ]
        },
        { Type: 'folder', Id: '__proto__', Name: 'Proto folder', Visible: true, Items: [{ Type: 'section', Key: 'jf:smalllibrarytiles', Visible: true }] },
        { Type: 'section', Key: 'hasOwnProperty', Visible: true },
        { Type: 'section', Key: 'valueOf', Visible: false }
    ]
};

function watchErrors(page: Page): string[] {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    return errors;
}

function shape(items: (LayoutSection | LayoutFolder)[]): unknown[] {
    return items.map((item) => (item.Type === 'folder' ? [item.Id, ...item.Items.map((member) => member.Key)] : item.Key));
}

for (const integrated of [false, true]) {
    test(`a layout keyed with Object.prototype member names is applied (plugin sections ${integrated ? 'on' : 'off'})`, async ({ page }) => {
        const errors = watchErrors(page);
        await openHome(page, { layout: HOSTILE_LAYOUT, enableIntegratedSections: integrated });

        await expect.poll(() => visibleSectionTitles(page)).toEqual(['Continue Watching', 'Constructor folder', 'Next Up', 'Proto folder', 'My Media']);
        await expect(page.locator('#homeTab .ch-folder')).toHaveCount(2);
        // Several passes (every DOM change schedules one): still two folder headers, still no error.
        await page.evaluate(() => document.body.appendChild(document.createElement('i')).remove());
        await page.waitForTimeout(300);
        await expect(page.locator('#homeTab .ch-folder')).toHaveCount(2);
        expect(errors).toEqual([]);
    });
}

test('a folder named after an inherited member goes away with the layout that held it', async ({ page }) => {
    const errors = watchErrors(page);
    await openHome(page, { layout: HOSTILE_LAYOUT });
    await expect(page.locator('#homeTab .ch-folder')).toHaveCount(2);

    const withoutFolders: FolderLayout = { Version: 1, HideUnlisted: true, Items: [{ Type: 'section', Key: 'jf:resume', Visible: true }] };
    await updateMock(page, { layoutResponse: { Source: 'user', Layout: withoutFolders, CanCustomize: true, HasUserLayout: true, ShowCustomizeButtonOnHome: true, FoldersCollapsible: true, EnableIntegratedSections: false } });
    await page.evaluate(() => (window as unknown as { CustomizedHome: { refresh: () => Promise<unknown> } }).CustomizedHome.refresh());
    await expect(page.locator('#homeTab .ch-folder')).toHaveCount(0);
    await expect.poll(() => visibleSectionTitles(page)).toEqual(['Continue Watching']);
    expect(errors).toEqual([]);
});

test('the editor lists, edits and saves such a layout', async ({ page }) => {
    const errors = watchErrors(page);
    await openHome(page, { layout: HOSTILE_LAYOUT, enableIntegratedSections: true });
    await openEditor(page);
    expect(await rowTitles(page, LIST)).toEqual(['Constructor row', 'Continue Watching', '__proto__', 'Next Up', 'toString', 'My Media', 'hasOwnProperty', 'valueOf']);
    await expect(page.locator(`${LIST} .ch-folder-name`)).toHaveCount(2);
    // Listed once: none of them comes back in the right column as a section "not in the layout".
    const unlisted = await rowTitles(page, '.ch-overlay .ch-unlisted');
    for (const title of ['Constructor row', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'Next Up']) {
        expect(unlisted).not.toContain(title);
    }

    await page.locator(`${LIST} .ch-row`, { hasText: 'hasOwnProperty' }).locator('.ch-act-visibility').click();
    await page.locator(`${LIST} .ch-row`, { hasText: '__proto__' }).locator('.ch-handle').focus();
    await page.keyboard.press('ArrowUp');
    // Taken out of the layout, a section goes to the right column, whatever its key, and comes back from there.
    await page.locator(`${LIST} .ch-row`, { hasText: 'toString' }).locator('.ch-act-remove').click();
    await page.locator(`${LIST} .ch-row`, { hasText: 'Constructor row' }).locator('.ch-act-remove').click();
    // They are not on the home page right now: the right column lists them once "also list..." is checked.
    await page.locator('.ch-overlay .ch-show-all').check();
    expect(await rowTitles(page, '.ch-overlay .ch-unlisted')).toEqual(expect.arrayContaining(['Constructor row', 'toString']));
    await page.locator('.ch-overlay .ch-unlisted .ch-row', { hasText: 'toString' }).locator('.ch-act-add').click();
    await page.locator('.ch-overlay .ch-unlisted .ch-row', { hasText: 'Constructor row' }).locator('.ch-act-add').click();

    await page.locator('.ch-overlay .ch-dialog-footer .ch-save').click();
    await expect(page.locator('.ch-overlay')).toHaveCount(0);

    const post = (await recordedRequests(page)).find((request) => request.method === 'POST' && request.path === 'CustomizedHome/Layout');
    const saved = (post?.body as FolderLayout).Items;
    expect(shape(saved)).toEqual([
        'constructor', 'toString', '__proto__', 'jf:resume', ['constructor', 'jf:nextup'], ['__proto__', 'jf:smalllibrarytiles'], 'hasOwnProperty', 'valueOf'
    ]);
    const sections = saved.filter((item): item is LayoutSection => item.Type === 'section');
    expect(sections.find((item) => item.Key === 'hasOwnProperty')?.Visible).toBe(false);
    expect(sections.find((item) => item.Key === 'constructor')?.Label).toBe('Constructor row');
    expect(errors).toEqual([]);
});
