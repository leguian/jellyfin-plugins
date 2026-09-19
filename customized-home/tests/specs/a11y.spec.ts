import { expect, test, type Page } from '@playwright/test';
import { openAdminPage, openHome, recordedRequests, rowTitles, type FolderLayout, type Layout, type LayoutFolder, type LayoutSection } from './support';

// The editor without a pointer: these specs only use the keyboard once the home page is loaded.

const LIST = '.ch-overlay .ch-list';

const LAYOUT: Layout = {
    Version: 1,
    HideUnlisted: true,
    Items: [
        { Type: 'section', Key: 'jf:smalllibrarytiles', Visible: true },
        { Type: 'section', Key: 'jf:resume', Visible: true },
        { Type: 'section', Key: 'jf:nextup', Visible: true }
    ]
};

const FOLDER_LAYOUT: FolderLayout = {
    Version: 1,
    HideUnlisted: true,
    Items: [
        { Type: 'section', Key: 'jf:smalllibrarytiles', Visible: true },
        {
            Type: 'folder', Id: 'f1', Name: 'Series', Visible: true, Items: [
                { Type: 'section', Key: 'jf:resume', Visible: true },
                { Type: 'section', Key: 'jf:nextup', Visible: true }
            ]
        },
        { Type: 'section', Key: 'jf:latestmedia:lib-movies', Visible: true }
    ]
};

const MAX_TABS = 60;

interface FocusInfo {
    classes: string;
    row: string;
    inOverlay: boolean;
    inPopup: boolean;
    tag: string;
}

async function focusInfo(page: Page): Promise<FocusInfo> {
    return page.evaluate(() => {
        const active = document.activeElement;
        const row = active?.closest('.ch-row');
        return {
            classes: active?.className ?? '',
            row: row?.querySelector('.ch-row-title')?.textContent ?? (row?.querySelector<HTMLInputElement>('.ch-folder-name')?.value ?? ''),
            inOverlay: !!active?.closest('.ch-overlay'),
            inPopup: !!active?.closest('.ch-popup'),
            tag: active?.tagName ?? ''
        };
    });
}

/** Presses Tab until the focus sits on the wanted control of the wanted row. */
async function tabTo(page: Page, className: string, row: string): Promise<void> {
    for (let i = 0; i < MAX_TABS; i++) {
        const info = await focusInfo(page);
        if (info.classes.split(/\s+/).includes(className) && info.row === row) {
            return;
        }
        await page.keyboard.press('Tab');
    }
    throw new Error(`no ${className} reached by Tab in the row "${row}"`);
}

async function openEditorWithKeyboard(page: Page): Promise<void> {
    await page.locator('.ch-customize-button').focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector(`${LIST} .ch-row`);
}

async function savedItems(page: Page): Promise<(LayoutSection | LayoutFolder)[]> {
    const posts = (await recordedRequests(page)).filter((request) => request.method === 'POST' && request.path === 'CustomizedHome/Layout');
    return (posts[posts.length - 1]?.body as FolderLayout).Items;
}

function shape(items: (LayoutSection | LayoutFolder)[]): unknown[] {
    return items.map((item) => (item.Type === 'folder' ? [item.Id, ...item.Items.map((member) => member.Key)] : item.Key));
}

async function saveWithKeyboard(page: Page): Promise<void> {
    for (let i = 0; i < MAX_TABS; i++) {
        const info = await focusInfo(page);
        if (info.classes.includes('ch-save') && !info.classes.includes('ch-save-top')) {
            await page.keyboard.press('Enter');
            await expect(page.locator('.ch-overlay')).toHaveCount(0);
            return;
        }
        await page.keyboard.press('Tab');
    }
    throw new Error('save button not reached by Tab');
}

test('keyboard: the arrow keys move the focused row, the focus follows it, and the order is saved', async ({ page }) => {
    await openHome(page, { layout: LAYOUT });
    await openEditorWithKeyboard(page);
    await tabTo(page, 'ch-handle', 'Next Up');

    await page.keyboard.press('ArrowUp');
    expect(await rowTitles(page, LIST)).toEqual(['My Media', 'Next Up', 'Continue Watching']);
    expect(await focusInfo(page)).toMatchObject({ row: 'Next Up', tag: 'BUTTON' });
    await expect(page.locator('.ch-overlay .ch-live')).toHaveText('Next Up: row 2 of 3');
    await expect(page.locator('.ch-overlay .ch-live')).toHaveAttribute('role', 'status');

    await page.keyboard.press('ArrowUp');
    expect(await rowTitles(page, LIST)).toEqual(['Next Up', 'My Media', 'Continue Watching']);
    // Already first: nothing moves, and the focus stays where it is.
    await page.keyboard.press('ArrowUp');
    expect(await rowTitles(page, LIST)).toEqual(['Next Up', 'My Media', 'Continue Watching']);
    expect((await focusInfo(page)).classes).toContain('ch-handle');

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await rowTitles(page, LIST)).toEqual(['My Media', 'Continue Watching', 'Next Up']);
    expect(await focusInfo(page)).toMatchObject({ row: 'Next Up', inOverlay: true });

    await page.keyboard.press('ArrowUp');
    await saveWithKeyboard(page);
    expect(shape(await savedItems(page))).toEqual(['jf:smalllibrarytiles', 'jf:nextup', 'jf:resume']);
});

test('keyboard: activating a handle opens a move up / move down menu that stays open', async ({ page }) => {
    await openHome(page, { layout: LAYOUT });
    await openEditorWithKeyboard(page);
    await tabTo(page, 'ch-handle', 'Next Up');
    const handle = page.locator(`${LIST} .ch-row`, { hasText: 'Next Up' }).locator('.ch-handle');
    await expect(handle).toHaveAttribute('aria-label', /arrow keys/);

    await page.keyboard.press('Enter');
    const menu = page.locator('.ch-popup');
    await expect(menu.locator('[role="menuitem"] span:last-child')).toHaveText(['Move up', 'Move down']);
    // Last row: "move down" has nowhere to go.
    await expect(menu.locator('.ch-move-down')).toBeDisabled();
    await expect(menu.locator('.ch-move-up')).toBeFocused();

    await page.keyboard.press('Enter');
    expect(await rowTitles(page, LIST)).toEqual(['My Media', 'Next Up', 'Continue Watching']);
    await expect(menu.locator('.ch-move-up')).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await rowTitles(page, LIST)).toEqual(['Next Up', 'My Media', 'Continue Watching']);
    // First row now: the focus moves to the only action left.
    await expect(menu.locator('.ch-move-up')).toBeDisabled();
    await expect(menu.locator('.ch-move-down')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page.locator('.ch-overlay')).toHaveCount(1);
});

test('keyboard: a section leaves and enters a folder at its ends, and a folder moves with its members', async ({ page }) => {
    await openHome(page, { layout: FOLDER_LAYOUT });
    await openEditorWithKeyboard(page);

    // Last member, one step down: out of the folder, right after it.
    await tabTo(page, 'ch-handle', 'Next Up');
    await page.keyboard.press('ArrowDown');
    expect(await focusInfo(page)).toMatchObject({ row: 'Next Up', tag: 'BUTTON' });
    await expect(page.locator(`${LIST} .ch-row`, { hasText: 'Next Up' })).not.toHaveClass(/ch-row-child/);
    // One more step: below the next section.
    await page.keyboard.press('ArrowDown');
    expect(await rowTitles(page, LIST)).toEqual(['My Media', 'Continue Watching', 'Recently Added in Movies', 'Next Up']);
    // Back up twice: below the folder, then inside it again as the last member.
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator(`${LIST} .ch-row`, { hasText: 'Next Up' })).toHaveClass(/ch-row-child/);
    // Inside the folder.
    await page.keyboard.press('ArrowUp');
    expect(await rowTitles(page, LIST)).toEqual(['My Media', 'Next Up', 'Continue Watching', 'Recently Added in Movies']);
    // First member, one step up: out of the folder, right before it.
    await page.keyboard.press('ArrowUp');
    await expect(page.locator(`${LIST} .ch-row`, { hasText: 'Next Up' })).not.toHaveClass(/ch-row-child/);

    // The folder itself: above the two sections that precede it now.
    await tabTo(page, 'ch-handle', 'Series');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    expect(await focusInfo(page)).toMatchObject({ row: 'Series', tag: 'BUTTON' });

    await saveWithKeyboard(page);
    expect(shape(await savedItems(page))).toEqual([['f1', 'jf:resume'], 'jf:smalllibrarytiles', 'jf:nextup', 'jf:latestmedia:lib-movies']);
});

test('keyboard: no reordering while a search filters the rows, like drag and drop', async ({ page }) => {
    await openHome(page, { layout: LAYOUT });
    await openEditorWithKeyboard(page);
    await tabTo(page, 'ch-search', '');
    await page.keyboard.type('next');
    expect(await rowTitles(page, LIST)).toEqual(['Next Up']);

    const handle = page.locator(`${LIST} .ch-row .ch-handle`);
    await expect(handle).toBeHidden();
    // Hidden, so out of the tab order; a key event that reaches it anyway changes nothing.
    await handle.evaluate((node) => {
        node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        (node as HTMLElement).click();
    });
    await expect(page.locator('.ch-popup')).toHaveCount(0);

    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    expect(await rowTitles(page, LIST)).toEqual(['My Media', 'Continue Watching', 'Next Up']);
});

test('pointer: the click that ends a drag does not open the move menu, a plain click does', async ({ page }) => {
    await openHome(page, { layout: FOLDER_LAYOUT });
    await page.click('.ch-customize-button');
    // A folder dropped on the right column goes nowhere: the rows are not rebuilt, the handle is still there
    // when the click that follows the release of the button reaches it.
    const handle = page.locator(`${LIST} .ch-row-folder .ch-handle`);
    const box = await handle.boundingBox();
    const side = await page.locator('.ch-overlay .ch-col-unlisted').boundingBox();
    if (!box || !side) {
        throw new Error('editor not laid out');
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + 10, { steps: 3 });
    await page.mouse.move(side.x + side.width / 2, side.y + 40, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator(`${LIST} .ch-dragging`)).toHaveCount(0);
    await expect(page.locator('.ch-popup')).toHaveCount(0);

    await handle.click();
    await expect(page.locator('.ch-popup .ch-move-up')).toBeVisible();
});

/* ---- the modal: name, focus, Escape, menus, questions ---- */

/** The editor never falls back on the dialogs of the browser: the ones that show up are listed. */
function nativeDialogs(page: Page): string[] {
    const seen: string[] = [];
    page.on('dialog', (dialog) => {
        seen.push(`${dialog.type()}: ${dialog.message()}`);
        void dialog.dismiss();
    });
    return seen;
}

async function layoutPosts(page: Page): Promise<number> {
    return (await recordedRequests(page)).filter((request) => request.method !== 'GET' && request.path === 'CustomizedHome/Layout').length;
}

test('modal: the dialog is named by its title, and Tab never leaves it in either direction', async ({ page }) => {
    await openHome(page, { layout: LAYOUT });
    await openEditorWithKeyboard(page);
    const dialog = page.locator('.ch-overlay .ch-dialog');
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    const titleId = await dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    await expect(page.locator(`#${titleId}`)).toHaveText('Customize the home screen');

    // Backwards from the dialog itself: the last control, not the page behind the overlay.
    await page.keyboard.press('Shift+Tab');
    expect(await focusInfo(page)).toMatchObject({ inOverlay: true, tag: 'BUTTON' });
    expect((await focusInfo(page)).classes).toContain('ch-save');
    // Forwards from the last control: the first one.
    await page.keyboard.press('Tab');
    expect((await focusInfo(page)).classes).toContain('ch-close');
    await page.keyboard.press('Shift+Tab');
    expect((await focusInfo(page)).classes).toContain('ch-save');
    for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        expect((await focusInfo(page)).inOverlay).toBe(true);
    }
});

test('modal: a row action keeps the focus on the same button, Escape still closes, and the opener gets the focus back', async ({ page }) => {
    await openHome(page, { layout: LAYOUT });
    await openEditorWithKeyboard(page);

    await tabTo(page, 'ch-act-visibility', 'Continue Watching');
    await page.keyboard.press('Enter');
    await expect(page.locator(`${LIST} .ch-row`, { hasText: 'Continue Watching' })).toHaveClass(/ch-row-hidden/);
    expect(await focusInfo(page)).toMatchObject({ row: 'Continue Watching', tag: 'BUTTON' });
    expect((await focusInfo(page)).classes).toContain('ch-act-visibility');
    // Shown again: nothing left to lose, Escape closes at once even though every row was rebuilt twice.
    await page.keyboard.press('Enter');
    await expect(page.locator(`${LIST} .ch-row-hidden`)).toHaveCount(0);
    // Even with the focus on the body (a click on the page zoom, a screen reader moving its own cursor...).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect((await focusInfo(page)).tag).toBe('BODY');
    await page.keyboard.press('Escape');
    await expect(page.locator('.ch-overlay')).toHaveCount(0);
    await expect(page.locator('.ch-customize-button')).toBeFocused();
});

test('modal: removing and adding rows hands the focus to the row that takes their place', async ({ page }) => {
    await openHome(page, { layout: LAYOUT });
    await openEditorWithKeyboard(page);

    await tabTo(page, 'ch-act-remove', 'My Media');
    await page.keyboard.press('Enter');
    expect(await rowTitles(page, LIST)).toEqual(['Continue Watching', 'Next Up']);
    expect(await focusInfo(page)).toMatchObject({ row: 'Continue Watching', inOverlay: true });
    expect((await focusInfo(page)).classes).toContain('ch-act-remove');

    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    // Nothing left on the left: the focus follows the last removed section to the right column.
    expect(await rowTitles(page, LIST)).toEqual([]);
    expect(await focusInfo(page)).toMatchObject({ row: 'Next Up', inOverlay: true });
    expect((await focusInfo(page)).classes).toContain('ch-act-add');

    await page.keyboard.press('Enter');
    expect(await rowTitles(page, LIST)).toEqual(['Next Up']);
    expect((await focusInfo(page)).classes).toContain('ch-act-add');
    expect((await focusInfo(page)).inOverlay).toBe(true);
});

test('menus: inside the dialog, role menu, first entry focused, arrow keys, focus back on the button that opened them', async ({ page }) => {
    await openHome(page, { layout: FOLDER_LAYOUT, enableIntegratedSections: true });
    await openEditorWithKeyboard(page);
    const menu = page.locator('.ch-overlay .ch-dialog .ch-popup');

    // Hero settings.
    await tabTo(page, 'ch-hero-settings', '');
    const heroButton = page.locator('.ch-overlay .ch-hero-settings');
    await expect(heroButton).toHaveAttribute('aria-haspopup', 'menu');
    await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('role', 'menu');
    await expect(menu).toHaveAttribute('aria-label', 'Hero settings');
    await expect(heroButton).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.locator('.ch-hero-source').first()).toBeFocused();
    // Toggling a source rebuilds the hero row under the menu: it still says which button the menu belongs to.
    await page.keyboard.press('Enter');
    await expect(menu.locator('.ch-hero-source').first()).toBeFocused();
    await expect(heroButton).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(heroButton).toBeFocused();
    await expect(heroButton).toHaveAttribute('aria-expanded', 'false');

    // Format menu of a section.
    await tabTo(page, 'ch-act-menu', 'My Media');
    await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('role', 'menu');
    await expect(menu.locator('button').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.locator('button').nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(menu.locator('button').last()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.locator('button').first()).toBeFocused();
    // Tab stays in the menu as well.
    await page.keyboard.press('Shift+Tab');
    await expect(menu.locator('button').last()).toBeFocused();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator(`${LIST} .ch-row`, { hasText: 'My Media' }).locator('.ch-row-format')).toHaveText('Poster');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page.locator('.ch-overlay')).toHaveCount(1);
    expect(await focusInfo(page)).toMatchObject({ row: 'My Media', inOverlay: true });
    expect((await focusInfo(page)).classes).toContain('ch-act-menu');

    // Icon picker of a folder: choosing an icon closes it.
    await tabTo(page, 'ch-act-icon', 'Series');
    await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('role', 'menu');
    await expect(menu.locator('[role="menuitemradio"]').first()).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(menu).toHaveCount(0);
    expect(await focusInfo(page)).toMatchObject({ row: 'Series', inOverlay: true });
    expect((await focusInfo(page)).classes).toContain('ch-act-icon');
    await expect(page.locator(`${LIST} .ch-row-folder .ch-act-icon .material-icons`)).toHaveText('movie');
});

test('unsaved changes: Escape, the close button, Cancel and the backdrop ask inside the page before dropping them', async ({ page }) => {
    const dialogs = nativeDialogs(page);
    await openHome(page, { layout: LAYOUT });
    await openEditorWithKeyboard(page);
    await tabTo(page, 'ch-act-visibility', 'Next Up');
    await page.keyboard.press('Enter');

    const question = page.locator('.ch-overlay .ch-dialog .ch-confirm');
    await page.keyboard.press('Escape');
    await expect(question).toHaveAttribute('role', 'alertdialog');
    await expect(question.locator('.ch-confirm-text')).toHaveText('Discard the changes you made to the layout?');
    await expect(question.locator('.ch-confirm-no')).toBeFocused();
    await expect(page.locator('.ch-overlay .ch-dialog-footer')).toBeHidden();
    // Tab goes round the two answers only.
    await page.keyboard.press('Tab');
    await expect(question.locator('.ch-confirm-yes')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(question.locator('.ch-confirm-no')).toBeFocused();
    // Escape means "keep editing": the editor stays, the focus goes back where it was.
    await page.keyboard.press('Escape');
    await expect(question).toHaveCount(0);
    await expect(page.locator('.ch-overlay')).toHaveCount(1);
    expect(await focusInfo(page)).toMatchObject({ row: 'Next Up', inOverlay: true });

    await page.locator('.ch-overlay .ch-close').click();
    await expect(question).toBeVisible();
    await question.locator('.ch-confirm-no').click();
    await expect(page.locator('.ch-overlay .ch-dialog-footer')).toBeVisible();

    await page.locator('.ch-overlay .ch-cancel').click();
    await expect(question).toBeVisible();
    await question.locator('.ch-confirm-no').click();

    await page.locator('.ch-overlay').click({ position: { x: 5, y: 5 } });
    await expect(question).toBeVisible();
    await question.locator('.ch-confirm-yes').click();
    await expect(page.locator('.ch-overlay')).toHaveCount(0);
    await expect(page.locator('.ch-customize-button')).toBeFocused();
    expect(await layoutPosts(page)).toBe(0);

    // Nothing was kept: the section is visible again in a new editor, which closes without a question.
    await openEditorWithKeyboard(page);
    await expect(page.locator(`${LIST} .ch-row-hidden`)).toHaveCount(0);
    await page.locator('.ch-overlay').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('.ch-overlay')).toHaveCount(0);
    expect(dialogs).toEqual([]);
});

test('reset asks inside the page, and only deletes the layout once confirmed', async ({ page }) => {
    const dialogs = nativeDialogs(page);
    await openHome(page, { layout: LAYOUT });
    await openEditorWithKeyboard(page);
    const question = page.locator('.ch-overlay .ch-confirm');

    await page.locator('.ch-overlay .ch-reset').click();
    await expect(question.locator('.ch-confirm-text')).toHaveText('Remove your custom layout and go back to the default one?');
    await question.locator('.ch-confirm-no').click();
    expect(await layoutPosts(page)).toBe(0);
    await expect(page.locator('.ch-overlay')).toHaveCount(1);

    await page.locator('.ch-overlay .ch-reset').click();
    await question.locator('.ch-confirm-yes').click();
    await expect(page.locator('.ch-overlay')).toHaveCount(0);
    const deleted = (await recordedRequests(page)).filter((request) => request.method === 'DELETE' && request.path === 'CustomizedHome/Layout');
    expect(deleted).toHaveLength(1);
    expect(dialogs).toEqual([]);
});

test('messages are a status region, announced inside the dialog while it is open', async ({ page }) => {
    await openHome(page, { layout: LAYOUT, failures: { 'POST CustomizedHome/Layout': 1 } });
    await openEditorWithKeyboard(page);
    const save = page.locator('.ch-dialog-footer .ch-save');

    await save.click();
    const failure = page.locator('.ch-overlay .ch-dialog .ch-toast');
    await expect(failure).toHaveText('Could not save the layout');
    await expect(failure).toHaveAttribute('role', 'status');

    await save.click();
    await expect(page.locator('.ch-overlay')).toHaveCount(0);
    // The dialog is gone, the message is not.
    await expect(page.locator('body > .ch-toast')).toHaveText('Home layout saved');
    await expect(page.locator('body > .ch-toast')).toBeVisible();
});

test('embedded editor: a named group of the administration page, not a modal, and Cancel asks before reverting', async ({ page }) => {
    const dialogs = nativeDialogs(page);
    await openAdminPage(page, { defaultLayout: LAYOUT });
    await page.click('#chTabLayouts');
    await page.waitForSelector('#chDefaultEditor .ch-list .ch-row');
    const dialog = page.locator('#chDefaultEditor .ch-dialog');
    await expect(dialog).toHaveAttribute('role', 'group');
    await expect(dialog).not.toHaveAttribute('aria-modal', /.*/);
    await expect(page.locator(`#${await dialog.getAttribute('aria-labelledby')}`)).toHaveText('Default home layout (all users)');

    // Not a modal: Tab is free to leave it.
    await page.locator('#chDefaultEditor .ch-dialog-footer .ch-save').focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#chDefaultEditor'))).toBe(false);

    await page.locator('#chDefaultEditor .ch-row', { hasText: 'Next Up' }).locator('.ch-act-remove').click();
    await page.locator('#chDefaultEditor .ch-cancel').click();
    await expect(page.locator('#chDefaultEditor .ch-confirm')).toBeVisible();
    await page.locator('#chDefaultEditor .ch-confirm-yes').click();
    await expect(page.locator('#chDefaultEditor .ch-confirm')).toHaveCount(0);
    await expect(page.locator('#chDefaultEditor .ch-list .ch-row')).toHaveCount(3);
    expect(dialogs).toEqual([]);
});

/* ---- review fixes: focus restoration, question of the embedded editor, duplicated keys, lone row ---- */

interface EditorApi {
    CustomizedHome: { openEditor(options: { mode: 'user'; opener?: HTMLElement | null }): void };
}

const SHORT_VIEWPORT = { width: 1000, height: 400 };

/** The customize button sits at the very bottom of the home page: below the fold of a short viewport. */
async function expectButtonBelowTheFold(page: Page): Promise<void> {
    const box = await page.locator('.ch-customize-button').boundingBox();
    expect(box?.y ?? 0).toBeGreaterThan(SHORT_VIEWPORT.height);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
}

test('closing: an editor opened without an opener restores no focus and does not scroll to the customize button', async ({ page }) => {
    await page.setViewportSize(SHORT_VIEWPORT);
    await openHome(page, { layout: LAYOUT });
    await expectButtonBelowTheFold(page);

    await page.evaluate(() => (window as unknown as EditorApi).CustomizedHome.openEditor({ mode: 'user', opener: null }));
    await page.waitForSelector(`${LIST} .ch-row`);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ch-overlay')).toHaveCount(0);

    await expect(page.locator('.ch-customize-button')).not.toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('closing: an opener that is gone hands the focus to the customize button without scrolling to it', async ({ page }) => {
    await page.setViewportSize(SHORT_VIEWPORT);
    await openHome(page, { layout: LAYOUT });
    await expectButtonBelowTheFold(page);

    await page.evaluate(() => {
        const opener = document.createElement('button');
        opener.id = 'temporaryOpener';
        document.body.prepend(opener);
        (window as unknown as EditorApi).CustomizedHome.openEditor({ mode: 'user', opener });
    });
    await page.waitForSelector(`${LIST} .ch-row`);
    await page.evaluate(() => document.querySelector('#temporaryOpener')?.remove());
    await page.keyboard.press('Escape');
    await expect(page.locator('.ch-overlay')).toHaveCount(0);

    await expect(page.locator('.ch-customize-button')).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('embedded editor: a pending question takes the keyboard, and nothing behind it can be reached or edited', async ({ page }) => {
    await openAdminPage(page, { defaultLayout: LAYOUT });
    await page.click('#chTabLayouts');
    await page.waitForSelector('#chDefaultEditor .ch-list .ch-row');
    const question = page.locator('#chDefaultEditor .ch-confirm');
    const remove = page.locator('#chDefaultEditor .ch-row', { hasText: 'Next Up' }).locator('.ch-act-remove');

    await remove.click();
    await page.locator('#chDefaultEditor .ch-cancel').click();
    await expect(question.locator('.ch-confirm-no')).toBeFocused();

    // Tab and Shift+Tab go round the two answers, never to the page around the editor.
    await page.keyboard.press('Shift+Tab');
    await expect(question.locator('.ch-confirm-yes')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(question.locator('.ch-confirm-no')).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(question.locator('.ch-confirm-no')).toBeFocused();

    // Behind the question: no focus, no typing, no row action.
    const search = page.locator('#chDefaultEditor .ch-search');
    await search.evaluate((node: HTMLElement) => node.focus());
    await expect(search).not.toBeFocused();
    await page.locator('#chDefaultEditor .ch-row .ch-act-remove').first().evaluate((node: HTMLElement) => node.click());
    await expect(page.locator('#chDefaultEditor .ch-list .ch-row')).toHaveCount(2);

    // Escape means "keep editing": the change is still there, and the editor is usable again.
    await question.locator('.ch-confirm-no').focus();
    await page.keyboard.press('Escape');
    await expect(question).toHaveCount(0);
    await expect(page.locator('#chDefaultEditor .ch-list .ch-row')).toHaveCount(2);
    await expect(page.locator('#chDefaultEditor .ch-cancel')).toBeFocused();
    await search.focus();
    await expect(search).toBeFocused();

    // Without a question the embedded editor leaves Escape alone: nothing is asked, nothing is reverted.
    await page.keyboard.press('Escape');
    await expect(question).toHaveCount(0);
    await expect(page.locator('#chDefaultEditor .ch-list .ch-row')).toHaveCount(2);
});

test('keyboard: with the same key twice in a layout, the focus follows the row that moved, not its twin', async ({ page }) => {
    const twins: Layout = { ...LAYOUT, Items: [...LAYOUT.Items, { Type: 'section', Key: 'jf:resume', Visible: true }] };
    await openHome(page, { layout: twins });
    await openEditorWithKeyboard(page);
    expect(await rowTitles(page, LIST)).toEqual(['My Media', 'Continue Watching', 'Next Up', 'Continue Watching']);
    const focusedRow = (): Promise<number> => page.evaluate((list) => {
        const row = document.activeElement?.closest('.ch-row') ?? null;
        return Array.from(document.querySelectorAll(`${list} .ch-row`)).indexOf(row as Element);
    }, LIST);

    await page.locator(`${LIST} .ch-row .ch-handle`).nth(3).focus();
    await page.keyboard.press('ArrowUp');
    expect(await rowTitles(page, LIST)).toEqual(['My Media', 'Continue Watching', 'Continue Watching', 'Next Up']);
    expect(await focusedRow()).toBe(2);
    await expect(page.locator('.ch-overlay .ch-live')).toHaveText('Continue Watching: row 3 of 4');
    await page.keyboard.press('ArrowUp');
    expect(await focusedRow()).toBe(1);
});

test('keyboard: the handle of a lone row still opens its menu, both moves disabled, and says why', async ({ page }) => {
    const lone: Layout = { ...LAYOUT, Items: [{ Type: 'section', Key: 'jf:resume', Visible: true }] };
    await openHome(page, { layout: lone });
    await openEditorWithKeyboard(page);
    await tabTo(page, 'ch-handle', 'Continue Watching');
    const handle = page.locator(`${LIST} .ch-row .ch-handle`);

    await page.keyboard.press('Enter');
    const menu = page.locator('.ch-overlay .ch-dialog .ch-popup');
    await expect(menu).toHaveAttribute('role', 'menu');
    await expect(menu.locator('.ch-move-up')).toBeDisabled();
    await expect(menu.locator('.ch-move-down')).toBeDisabled();
    await expect(handle).toHaveAttribute('aria-expanded', 'true');
    await expect(menu).toBeFocused();
    await expect(page.locator('.ch-overlay .ch-live')).toHaveText('This is the only row: there is nowhere to move it');
    // Tab has nowhere to go in this menu, and does not slip behind it.
    await page.keyboard.press('Tab');
    await expect(menu).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page.locator('.ch-overlay')).toHaveCount(1);
    await expect(handle).toBeFocused();
    await expect(handle).toHaveAttribute('aria-expanded', 'false');
});
