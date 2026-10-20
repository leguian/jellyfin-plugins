import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LIGHT_DASHBOARD_STYLE, controlled, member, openAdminPage, openWeb, profileView, usage, type MockOptions } from './support';

// Visual review only (npm run screenshots): captures in test-results/screenshots, nothing is asserted.
const OUT = 'test-results/screenshots/';

const TIM = member('tim-id', 'Tim', { HasProfile: true, Enabled: true, RuleCount: 2, Today: usage({ Enabled: true, UsedSeconds: 2700, LimitMinutes: 60, RemainingSeconds: 900 }) });
const WILL = member('will-id', 'Will', { HasProfile: true, Enabled: true, Mode: 'AllowList', RuleCount: 6, Today: usage({ Enabled: true, UsedSeconds: 600, LimitMinutes: 45, RemainingSeconds: 2100 }) });
const ADMIN = member('admin-id', 'Admin', { IsAdministrator: true });

const ADMIN_OPTIONS: MockOptions = {
    family: [TIM, WILL, ADMIN],
    views: {
        'tim-id': profileView(TIM, {
            Mode: 'AllowList',
            Allowed: [
                { Kind: 'Item', Value: 'movie-1', Name: 'Bluey Movie (2024)', ItemType: 'Movie' },
                { Kind: 'Item', Value: 'series-1', Name: 'Peppa Pig', ItemType: 'Series' },
                { Kind: 'Collection', Value: 'set-1', Name: 'Pixar Collection', ItemType: 'BoxSet' },
                { Kind: 'Label', Value: 'label-1', Name: 'Pour Tim' }
            ],
            Hidden: [{ Kind: 'Tag', Value: 'violent', Name: 'violent' }, { Kind: 'Genre', Value: 'Horror', Name: 'Horror' }],
            ScreenTime: { Enabled: true, DailyLimitMinutes: [120, 60, 60, 90, 60, 60, 120], WarningMinutes: 5, ShowRemaining: true },
            HiddenElements: ['search', 'syncplay', 'cast', 'settings'],
            LockSession: true,
            PinSignIn: true
        }, {
            MaxParentalRating: 6,
            BlockUnratedItems: ['Movie'],
            AccessSchedules: [
                { DayOfWeek: 'Weekday', StartHour: 7, EndHour: 8.5 },
                { DayOfWeek: 'Weekday', StartHour: 16.5, EndHour: 20 },
                { DayOfWeek: 'Weekend', StartHour: 8, EndHour: 20.5 }
            ],
            EnableRemoteAccess: false
        })
    },
    labels: [
        { Id: 'label-1', Name: 'Pour Tim', Color: '#2e9e5b', Targets: [{ Kind: 'Genre', Value: 'Animation', Name: 'Animation' }, { Kind: 'Item', Value: 'movie-1', Name: 'Bluey Movie' }] },
        { Id: 'label-2', Name: 'Fait peur', Color: '#e5533d', Targets: [{ Kind: 'Item', Value: 'movie-2', Name: 'Scary Night' }] }
    ]
};

async function shoot(page: Page, name: string): Promise<void> {
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + name + '.png', fullPage: true });
}

for (const theme of ['dark', 'light'] as const) {
    test(`administration page, ${theme} dashboard`, async ({ page }) => {
        await openAdminPage(page, ADMIN_OPTIONS, 'fr', theme === 'light' ? LIGHT_DASHBOARD_STYLE : undefined);
        await shoot(page, `admin-${theme}-1-family`);
        await page.locator('.pca-member', { hasText: 'Tim' }).click();
        await shoot(page, `admin-${theme}-2-content`);
        for (const section of ['time', 'interface', 'signin', 'activity']) {
            await page.click(`[data-section="${section}"]`);
            await shoot(page, `admin-${theme}-3-${section}`);
        }
        await page.click('[data-section="content"]');
        await page.click('[data-action="add-rule"][data-list="Hidden"]');
        await page.locator('.pca-result').nth(1).click();
        await shoot(page, `admin-${theme}-4-picker`);
        await page.keyboard.press('Escape');
        await page.click('#pcaTabLabels');
        await shoot(page, `admin-${theme}-5-labels`);
        await page.click('#pcaTabSettings');
        await shoot(page, `admin-${theme}-6-settings`);
    });
}

// One test per screen: the fixture keeps its script loaded across a navigation to the same document.
test('web client: end of the screen time and the parent PIN', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openWeb(page, { me: { 'tim-id': controlled({ ScreenTime: usage({ Enabled: true, LimitMinutes: 60, UsedSeconds: 3600, RemainingSeconds: 0, Exhausted: true }) }) } });
    await shoot(page, 'client-1-end');
    await page.click('.pc-chip[data-minutes="15"]');
    await shoot(page, 'client-2-parent-pin');
});

test('web client: outside the access hours', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(7, 30, 0, 0);
    await openWeb(page, { me: { 'tim-id': controlled({ AllowedNow: false, NextAllowed: tomorrow.toISOString() }) } });
    await shoot(page, 'client-3-schedule');
});

test('web client: time left', async ({ page }) => {
    await openWeb(page, { me: { 'tim-id': controlled({ ScreenTime: usage({ Enabled: true, LimitMinutes: 60, UsedSeconds: 3400, RemainingSeconds: 200 }), WarningMinutes: 5 }) } });
    await page.click('.pc-pill-button');
    await shoot(page, 'client-4-pill');
});

test('web client: sign-in page and PIN pad', async ({ page }) => {
    await openWeb(page, { userId: null, signIn: { PinUsers: [{ Id: 'tim-id', Length: 4, AllowedNow: true }, { Id: 'will-id', Length: 4, AllowedNow: false }] } });
    await shoot(page, 'client-5-sign-in');
    await page.click('#divUsers .card:has(.cardContent[data-username="Tim"])');
    await page.click('.pc-key[data-key="1"]');
    await page.click('.pc-key[data-key="2"]');
    await shoot(page, 'client-6-pin-pad');
});
