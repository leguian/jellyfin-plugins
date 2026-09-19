import { expect, test, type Page } from '@playwright/test';
import { openHome, recordedRequests, rowTitles, type FolderLayout, type Layout, type LayoutFolder, type LayoutSection } from './support';

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
