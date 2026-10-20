import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { controlled, mockValue, openWeb, setMock, typeDigits, usage, type ElementKey } from './support';

const ALL: ElementKey[] = ['search', 'favorites', 'syncplay', 'cast', 'settings', 'drawer', 'signout'];

// Every element of both layouts of the fixture, by the key that hides it.
const SELECTORS: Record<ElementKey, string[]> = {
    search: ['.headerSearchButton', 'a[href="#/search"]'],
    favorites: ['a[href="#/home?tab=1"]', '.headerTabs .emby-tab-button[data-index="1"]'],
    syncplay: ['.headerSyncButton', '[aria-controls="app-sync-play-menu"]'],
    cast: ['.headerCastButton', '[aria-controls="app-remote-play-menu"]'],
    settings: ['.btnSettings', '.headerUserButton', '#app-user-menu a[href="#/mypreferencesmenu"]', '#app-user-menu a[href^="#/userprofile"]'],
    drawer: ['.mainDrawerButton', '.mainDrawer', '.MuiDrawer-root', '.MuiAppBar-root a[href*="topParentId="]', 'svg[data-testid="MenuIcon"]'],
    signout: ['.btnLogout', '.btnSelectServer', '#app-user-menu li:has(svg[data-testid="LogoutIcon"])', '#app-user-menu li:has(svg[data-testid="StorageIcon"])']
};

async function visibleKeys(page: Page): Promise<ElementKey[]> {
    const visible: ElementKey[] = [];
    for (const key of ALL) {
        for (const selector of SELECTORS[key]) {
            if (await page.locator(selector).first().isVisible()) {
                visible.push(key);
                break;
            }
        }
    }
    return visible;
}

test('an uncontrolled user keeps the whole interface and no lock', async ({ page }) => {
    await openWeb(page, { userId: 'parent-id' });
    await expect.poll(() => page.evaluate(() => (window as unknown as { ParentalControl: { context: () => unknown } }).ParentalControl.context())).not.toBeNull();

    expect(await visibleKeys(page)).toEqual(ALL);
    await page.evaluate(() => (window as unknown as { Dashboard: { logout: () => void } }).Dashboard.logout());
    await expect(page.locator('.pc-pad')).toHaveCount(0);
    expect(await mockValue<number>(page, 'logouts')).toBe(1);
    await expect(page.locator('.pc-pill')).toHaveCount(0);
});

for (const key of ALL) {
    test(`hiding "${key}" hides it in both layouts and nothing else`, async ({ page }) => {
        await openWeb(page, { me: { 'tim-id': controlled({ HiddenElements: [key] }) } });
        await expect(page.locator('html')).toHaveClass(new RegExp(`pc-hide-${key}`));

        expect(await visibleKeys(page)).toEqual(ALL.filter((other) => other !== key));
        for (const selector of SELECTORS[key]) {
            await expect(page.locator(selector).first()).toBeHidden();
        }
    });
}

test('the user menu button goes when both its settings and sign out entries are hidden', async ({ page }) => {
    await openWeb(page, { me: { 'tim-id': controlled({ HiddenElements: ['settings'] }) } });
    await expect(page.locator('html')).toHaveClass(/pc-hide-settings/);
    await expect(page.locator('[aria-controls="app-user-menu"]')).toBeVisible();

    await setMock(page, { me: { 'tim-id': controlled({ HiddenElements: ['settings', 'signout'] }) } });
    await page.evaluate(() => (window as unknown as { ParentalControl: { refresh: () => Promise<void> } }).ParentalControl.refresh());

    await expect(page.locator('[aria-controls="app-user-menu"]')).toBeHidden();
});

test('a hidden page opened anyway goes back to the home page', async ({ page }) => {
    await openWeb(page, { me: { 'tim-id': controlled({ HiddenElements: ['search', 'settings', 'favorites'] }) } }, '#/search?query=x');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/home');

    for (const hash of ['#/mypreferencesdisplay', '#/userprofile?userId=tim-id', '#/home?tab=1']) {
        await page.evaluate((target) => {
            location.hash = target;
        }, hash);
        await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/home');
    }

    // The home page itself and the other pages stay where they are.
    await page.evaluate(() => {
        location.hash = '#/movies?topParentId=lib-movies';
    });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => location.hash)).toBe('#/movies?topParentId=lib-movies');
});

test('a locked session asks for the parent PIN before signing out or changing server', async ({ page }) => {
    await openWeb(page, { me: { 'tim-id': controlled({ LockSession: true }) } });
    await expect(page.locator('html')).toHaveClass(/pc-controlled/);

    await page.evaluate(() => (window as unknown as { Dashboard: { logout: () => void } }).Dashboard.logout());
    await expect(page.locator('.pc-pad')).toBeVisible();
    await expect(page.locator('.pc-pad-title')).toHaveText('Parent PIN');
    expect(await mockValue<number>(page, 'logouts')).toBe(0);

    // Wrong PIN: the pad shakes and stays.
    await typeDigits(page, '1111');
    await page.click('.pc-key[data-key="confirm"]');
    await expect(page.locator('.pc-pad-error')).toHaveText('Wrong PIN');
    expect(await mockValue<number>(page, 'logouts')).toBe(0);

    // Typed on a keyboard, confirmed with Enter.
    await page.keyboard.type('4321');
    await page.keyboard.press('Enter');
    await expect(page.locator('.pc-pad')).toHaveCount(0);
    expect(await mockValue<number>(page, 'logouts')).toBe(1);

    await page.evaluate(() => (window as unknown as { Dashboard: { selectServer: () => void } }).Dashboard.selectServer());
    await page.keyboard.press('Escape');
    await expect(page.locator('.pc-pad')).toHaveCount(0);
    expect(await mockValue<number>(page, 'selectServers')).toBe(0);
});

test('too many wrong PINs lock the pad with a countdown', async ({ page }) => {
    await openWeb(page, { me: { 'tim-id': controlled({ LockSession: true }) }, retryAfter: 300 });
    await expect(page.locator('html')).toHaveClass(/pc-controlled/);
    await page.evaluate(() => (window as unknown as { Dashboard: { logout: () => void } }).Dashboard.logout());

    await typeDigits(page, '0000');
    await page.click('.pc-key[data-key="confirm"]');

    await expect(page.locator('.pc-pad-error')).toContainText('Try again in');
    await expect(page.locator('.pc-key[data-key="5"]')).toBeDisabled();
});

test('without a parent PIN a locked session signs out normally', async ({ page }) => {
    await openWeb(page, { me: { 'tim-id': controlled({ LockSession: true, ParentPinSet: false }) } });
    await expect(page.locator('html')).toHaveClass(/pc-controlled/);

    await page.evaluate(() => (window as unknown as { Dashboard: { logout: () => void } }).Dashboard.logout());

    expect(await mockValue<number>(page, 'logouts')).toBe(1);
    await expect(page.locator('.pc-pad')).toHaveCount(0);
});

test('the time left shows in a corner and its details on demand', async ({ page }) => {
    const screenTime = usage({ Enabled: true, UsedSeconds: 1800, LimitMinutes: 60, RemainingSeconds: 1800 });
    await openWeb(page, { me: { 'tim-id': controlled({ ScreenTime: screenTime }) } });

    await expect(page.locator('.pc-pill-text')).toHaveText('30 min left');
    await page.click('.pc-pill-button');
    await expect(page.locator('.pc-pill-detail')).toHaveText('Screen time today: 30 min used of 1 h. 30 min left.');
    await expect(page.locator('.pc-pill-button')).toHaveAttribute('aria-expanded', 'true');
});

test('the pill warns before the end and is not shown when the parent turned it off', async ({ page }) => {
    await openWeb(page, { me: { 'tim-id': controlled({ ScreenTime: usage({ Enabled: true, LimitMinutes: 60, RemainingSeconds: 240 }), WarningMinutes: 5 }) } });
    await expect(page.locator('.pc-pill')).toHaveClass(/pc-pill-warn/);

    await setMock(page, { me: { 'tim-id': controlled({ ShowRemaining: false, ScreenTime: usage({ Enabled: true, LimitMinutes: 60, RemainingSeconds: 240 }) }) } });
    await page.evaluate(() => (window as unknown as { ParentalControl: { refresh: () => Promise<void> } }).ParentalControl.refresh());
    await expect(page.locator('.pc-pill')).toHaveCount(0);
});

test('when the time is up a friendly screen covers the app and a parent can add time', async ({ page }) => {
    const exhausted = usage({ Enabled: true, UsedSeconds: 3600, LimitMinutes: 60, RemainingSeconds: 0, Exhausted: true });
    await openWeb(page, { me: { 'tim-id': controlled({ ScreenTime: exhausted }) } });

    const screen = page.locator('.pc-screen');
    await expect(screen).toBeVisible();
    await expect(screen).toHaveAttribute('role', 'alertdialog');
    await expect(page.locator('.pc-screen-title')).toHaveText('That\'s all for today!');
    await expect(page.locator('.pc-screen-text')).toHaveText('You used your 1 h of screen time. See you tomorrow!');
    await expect(page.locator('.pc-pill')).toHaveCount(0);
    await expect(page.locator('.pc-chip')).toHaveCount(3);

    await page.click('.pc-chip[data-minutes="30"]');
    await expect(page.locator('.pc-pad-subtitle')).toHaveText('Type the parent PIN to add 30 min.');
    await typeDigits(page, '4321');
    await page.click('.pc-key[data-key="confirm"]');

    await expect(screen).toHaveCount(0);
    await expect(page.locator('.pc-toast')).toHaveText('30 min added. Enjoy!');
    await expect(page.locator('.pc-pill-text')).toHaveText('30 min left');
});

test('without a parent PIN the end screen offers no extra time', async ({ page }) => {
    await openWeb(page, { me: { 'tim-id': controlled({ ParentPinSet: false, ScreenTime: usage({ Enabled: true, LimitMinutes: 0, RemainingSeconds: 0, Exhausted: true }) }) } });

    await expect(page.locator('.pc-screen-text')).toHaveText('No screen time today. See you tomorrow!');
    await expect(page.locator('.pc-chip')).toHaveCount(0);
    await page.click('.pc-screen-signout');
    expect(await mockValue<number>(page, 'logouts')).toBe(1);
});

test('outside the access hours the screen says when the child can come back', async ({ page }) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(7, 30, 0, 0);
    await openWeb(page, { me: { 'tim-id': controlled({ AllowedNow: false, NextAllowed: tomorrow.toISOString() }) } });

    await expect(page.locator('.pc-screen-schedule')).toBeVisible();
    await expect(page.locator('.pc-screen-title')).toHaveText('Time for a break');
    await expect(page.locator('.pc-screen-text')).toHaveText(/^You can come back tomorrow at 07:30/);
});

test('the screens follow the language of the user', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tim-id-language', 'fr-FR'));
    await openWeb(page, { me: { 'tim-id': controlled({ ScreenTime: usage({ Enabled: true, LimitMinutes: 90, RemainingSeconds: 0, Exhausted: true, UsedSeconds: 5400 }) }) } });

    await expect(page.locator('.pc-screen-title')).toHaveText('C\'est fini pour aujourd\'hui !');
    await expect(page.locator('.pc-screen-text')).toHaveText('Tu as utilisé tes 1 h 30 d\'écran. À demain !');
});

test('signing in as someone else removes everything of the previous child', async ({ page }) => {
    await openWeb(page, { me: { 'tim-id': controlled({ HiddenElements: ['search'], ScreenTime: usage({ Enabled: true, LimitMinutes: 10, RemainingSeconds: 0, Exhausted: true }) }) } });
    await expect(page.locator('.pc-screen')).toBeVisible();

    await setMock(page, { userId: 'parent-id' });
    await page.evaluate(() => document.body.appendChild(document.createElement('i')));

    await expect(page.locator('.pc-screen')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveClass(/pc-hide-search/);
    await expect(page.locator('.headerSearchButton')).toBeVisible();
});
