import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LIGHT_DASHBOARD_STYLE, lastRequest, member, openAdminPage, profileView, requests, textContrast, type Label, type MockOptions, type Profile, type ProfileView } from './support';

const TIM = member('tim-id', 'Tim', { HasProfile: true, Enabled: true, RuleCount: 2, Today: { Enabled: true, UsedSeconds: 1500, LimitMinutes: 60, BonusMinutes: 0, RemainingSeconds: 2100, Exhausted: false } });
const WILL = member('will-id', 'Will');
const ADMIN = member('admin-id', 'Admin', { IsAdministrator: true });

function options(overrides: MockOptions = {}): MockOptions {
    return {
        family: [TIM, WILL, ADMIN],
        views: {
            'tim-id': profileView(TIM, { Hidden: [{ Kind: 'Tag', Value: 'violent', Name: 'violent' }, { Kind: 'Item', Value: 'movie-2', Name: 'Scary Night', ItemType: 'Movie' }] }),
            'will-id': profileView(WILL, { Enabled: true }, { ShowOnSignInScreen: false })
        },
        labels: [{ Id: 'label-1', Name: 'Pour Tim', Color: '#2e9e5b', Targets: [{ Kind: 'Genre', Value: 'Animation', Name: 'Animation' }] }],
        ...overrides
    };
}

async function openProfile(page: Page, name: string, overrides: MockOptions = {}): Promise<void> {
    await openAdminPage(page, options(overrides));
    await page.locator('.pca-member', { hasText: name }).click();
    await expect(page.locator('.pca-editor-name')).toHaveText(name);
}

async function savedProfile(page: Page, userId = 'tim-id'): Promise<{ Profile: Profile; Native: ProfileView['Native'] }> {
    await page.click('.pca-savebar [data-action="save"]');
    await expect(page.locator('.pca-savebar')).toHaveCount(0);
    const request = await lastRequest(page, 'POST', `ParentalControl/Profiles/${userId}`);
    return request?.body as { Profile: Profile; Native: ProfileView['Native'] };
}

test('the family lists every user with what applies to them', async ({ page }) => {
    await openAdminPage(page, options());

    const cards = page.locator('.pca-member');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText('Protected');
    await expect(cards.nth(0)).toContainText('Everything except 2 hidden item(s)');
    await expect(cards.nth(0)).toContainText('Today: 25 min of 1 h');
    await expect(cards.nth(1)).toContainText('Not protected');
    await expect(cards.nth(1)).toContainText('Protect Will');
    await expect(cards.nth(2)).toBeDisabled();
    // A profile exists: the three steps introduction is gone.
    await expect(page.locator('.pca-hero')).toHaveCount(0);
});

test('a family without any profile gets the three steps introduction', async ({ page }) => {
    await openAdminPage(page, options({ family: [WILL, ADMIN] }));

    await expect(page.locator('.pca-hero')).toContainText('Protect your children in three steps');
});

test('protecting a child starts from sensible defaults and saves them with the native settings', async ({ page }) => {
    await openProfile(page, 'Will');

    await expect(page.locator('.pca-member-meta').first()).toHaveText('New profile: nothing is applied until you save.');
    // A new profile can be saved right away.
    await expect(page.locator('.pca-savebar')).toBeVisible();

    const saved = await savedProfile(page, 'will-id');
    expect(saved.Profile.Enabled).toBe(true);
    expect(saved.Profile.Mode).toBe('BlockList');
    expect(saved.Profile.HiddenElements).toEqual(['syncplay', 'cast']);
    expect(saved.Native.ShowOnSignInScreen).toBe(false);
    await expect(page.locator('.pca-toast-text')).toHaveText('Saved');
});

test('the allow list mode shows what the child may see, filled from the content picker', async ({ page }) => {
    await openProfile(page, 'Tim');
    await expect(page.locator('.pca-savebar')).toHaveCount(0);

    await page.locator('.pca-mode', { hasText: 'Only what I allow' }).click();
    await expect(page.locator('.pca-card', { hasText: 'Nothing allowed yet: Tim sees nothing.' })).toBeVisible();

    await page.click('[data-action="add-rule"][data-list="Allowed"]');
    const picker = page.locator('.pca-dialog-wide');
    await expect(picker.locator('.pca-result')).toHaveCount(3);
    await expect(picker.locator('.pca-result', { hasText: 'Scary Night' })).toBeEnabled();
    await picker.locator('.pca-result', { hasText: 'Bluey Movie' }).click();
    await picker.locator('.pca-result', { hasText: 'Peppa Pig' }).click();
    await expect(picker.locator('.pca-picker-count')).toHaveText('2 selected');

    await picker.locator('[data-pick="kind"][data-kind="collections"]').click();
    await picker.locator('.pca-result', { hasText: 'Pixar Collection' }).click();
    await picker.locator('[data-pick="kind"][data-kind="labels"]').click();
    await picker.locator('.pca-result', { hasText: 'Pour Tim' }).click();
    await picker.locator('[data-pick="add"]').click();

    await expect(page.locator('.pca-rule')).toHaveCount(6);
    const saved = await savedProfile(page);
    expect(saved.Profile.Mode).toBe('AllowList');
    expect(saved.Profile.Allowed.map((rule) => [rule.Kind, rule.Value])).toEqual([
        ['Item', 'movie-1'], ['Item', 'series-1'], ['Collection', 'set-1'], ['Label', 'label-1']
    ]);
});

test('the picker marks what is already in the list and searches as you type', async ({ page }) => {
    await openProfile(page, 'Tim');
    await page.click('[data-action="add-rule"][data-list="Hidden"]');
    const picker = page.locator('.pca-dialog-wide');

    await expect(picker.locator('.pca-result', { hasText: 'Scary Night' })).toBeDisabled();
    await expect(picker.locator('.pca-result', { hasText: 'Scary Night' })).toContainText('already added');

    await picker.locator('input[type="search"]').fill('pep');
    await expect(picker.locator('.pca-result')).toHaveCount(1);
    expect((await requests(page)).some((request) => request.url?.includes('SearchTerm=pep'))).toBe(true);

    // Tags: the plugin's own tags and the tags of the labels are never offered.
    await picker.locator('[data-pick="kind"][data-kind="tags"]').click();
    await picker.locator('input[type="search"]').fill('');
    await expect(picker.locator('.pca-result')).toHaveCount(2);
    await expect(picker.locator('.pca-result', { hasText: 'violent' })).toBeDisabled();
    await expect(picker.locator('.pca-result', { hasText: 'pc-hidden-tim' })).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(page.locator('.pca-savebar')).toHaveCount(0);
});

test('removing a rule and discarding brings the saved profile back', async ({ page }) => {
    await openProfile(page, 'Tim');

    await page.locator('.pca-rule', { hasText: 'Scary Night' }).getByRole('button').click();
    await expect(page.locator('.pca-rule')).toHaveCount(1);
    await expect(page.locator('.pca-savebar')).toBeVisible();

    await page.click('.pca-savebar [data-action="discard"]');
    await expect(page.locator('.pca-rule')).toHaveCount(2);
    await expect(page.locator('.pca-savebar')).toHaveCount(0);
});

test('leaving with unsaved changes asks first, and Escape keeps the changes', async ({ page }) => {
    await openProfile(page, 'Tim');
    await page.locator('.pca-rule', { hasText: 'violent' }).getByRole('button').click();

    await page.click('[data-action="back"]');
    const question = page.locator('[role="alertdialog"]');
    await expect(question).toContainText('Discard your changes?');
    await expect(question.locator('.pca-ask-no')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.pca-editor-name')).toBeVisible();

    await page.click('#pcaTabSettings');
    await question.locator('.pca-ask-yes').click();
    await expect(page.locator('#pcaPanelSettings')).toBeVisible();
    await expect(page.locator('.pca-savebar')).toHaveCount(0);
});

test('age rating, unrated content and libraries edit the native settings', async ({ page }) => {
    await openProfile(page, 'Tim');

    await page.selectOption('#pcaRating', '12');
    await page.locator('[data-action="unrated"][data-kind="Movie"]').click();
    await page.click('label[for="pcaAllFolders"]');
    await page.locator('[data-action="library"][data-id="lib-shows"]').click();

    const saved = await savedProfile(page);
    expect(saved.Native.MaxParentalRating).toBe(12);
    expect(saved.Native.BlockUnratedItems).toEqual(['Movie']);
    expect(saved.Native.EnableAllFolders).toBe(false);
    expect(saved.Native.EnabledFolders).toEqual(['lib-shows']);
});

test('the preview shows what the child sees right now', async ({ page }) => {
    await openProfile(page, 'Tim');

    await expect(page.locator('#pcaPreviewCard .pca-stat').first()).toContainText('3');
    await expect(page.locator('#pcaPreviewCard')).toContainText('Movies');
});

test('daily limits: presets per group of days, steppers and unlimited days', async ({ page }) => {
    await openProfile(page, 'Tim');
    await page.click('[data-section="time"]');

    await page.click('label[for="pcaLimitOn"]');
    await page.click('[data-action="limit-scope"][data-scope="weekend"]');
    await page.click('[data-action="limit-preset"][data-minutes="120"]');
    await page.click('[data-action="limit-scope"][data-scope="weekdays"]');
    await page.click('[data-action="limit-preset"][data-minutes="60"]');
    // Wednesday: one more step (15 min), Friday: no limit.
    await page.click('[data-action="day-step"][data-day="3"][data-delta="1"]');
    await page.click('[data-action="day-unlimited"][data-day="5"]');
    await page.selectOption('#pcaWarning', '10');

    const saved = await savedProfile(page);
    expect(saved.Profile.ScreenTime.Enabled).toBe(true);
    expect(saved.Profile.ScreenTime.DailyLimitMinutes).toEqual([120, 60, 60, 75, 60, -1, 120]);
    expect(saved.Profile.ScreenTime.WarningMinutes).toBe(10);
});

test('extra time is granted at once, for today', async ({ page }) => {
    await openProfile(page, 'Tim');
    await page.click('[data-section="time"]');

    await page.click('[data-action="bonus"][data-minutes="30"]');

    expect((await lastRequest(page, 'POST', 'ParentalControl/Profiles/tim-id/Bonus'))?.body).toEqual({ Minutes: 30 });
    await expect(page.locator('.pca-card', { hasText: 'Today' })).toContainText('30 min extra today');
    await expect(page.locator('.pca-savebar')).toHaveCount(0);
});

test('access hours are painted on a weekly grid', async ({ page }) => {
    await openProfile(page, 'Tim');
    await page.click('[data-section="time"]');

    await page.click('label[for="pcaScheduleOn"]');
    await expect(page.locator('#pcaScheduleSummary')).toContainText('Mon 07:00–08:30, 16:30–20:00');

    await page.click('[data-action="schedule-preset"][data-preset="clear"]');
    await expect(page.locator('#pcaScheduleSummary')).toContainText('Mon Never allowed');
    // Drag over Monday from 10:00 to 11:30 (slots 20 to 22).
    const first = page.locator('.pca-slot[data-day="1"][data-slot="20"]');
    const last = page.locator('.pca-slot[data-day="1"][data-slot="22"]');
    const from = await first.boundingBox();
    const to = await last.boundingBox();
    if (!from || !to) {
        throw new Error('grid not laid out');
    }
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('#pcaScheduleSummary')).toContainText('Mon 10:00–11:30');

    const saved = await savedProfile(page);
    expect(saved.Native.AccessSchedules).toEqual([{ DayOfWeek: 'Monday', StartHour: 10, EndHour: 11.5 }]);
});

test('an access schedule cleared to nothing is not saved as no limit', async ({ page }) => {
    await openProfile(page, 'Tim');
    await page.click('[data-section="time"]');
    await page.click('label[for="pcaScheduleOn"]');
    await page.click('[data-action="schedule-preset"][data-preset="clear"]');
    await expect(page.locator('.pca-note-warn', { hasText: 'No half hour is allowed' })).toBeVisible();

    // The draft holds no window, like the saved profile: the save bar comes from another change.
    await page.click('label[for="pcaLimitOn"]');
    await page.click('.pca-savebar [data-action="save"]');

    await expect(page.locator('.pca-toast-text')).toContainText('No half hour is allowed');
    expect(await lastRequest(page, 'POST', 'ParentalControl/Profiles/tim-id')).toBeUndefined();

    await page.click('label[for="pcaScheduleOn"]');
    await page.click('.pca-savebar [data-action="save"]');
    await expect(page.locator('.pca-savebar')).toHaveCount(0);
    expect(((await lastRequest(page, 'POST', 'ParentalControl/Profiles/tim-id'))?.body as { Native: { AccessSchedules: unknown[] } }).Native.AccessSchedules).toEqual([]);
});

test('the schedule grid works with the keyboard', async ({ page }) => {
    await openProfile(page, 'Tim');
    await page.click('[data-section="time"]');
    await page.click('label[for="pcaScheduleOn"]');
    await page.click('[data-action="schedule-preset"][data-preset="clear"]');

    await page.locator('.pca-grid').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');

    await expect(page.locator('#pcaScheduleSummary')).toContainText('Mon 08:30–09:00');
});

test('interface elements and the locked session are saved, with a warning without parent PIN', async ({ page }) => {
    const status = { PluginVersion: '1.0.0.0', Injection: { FileTransformationDetected: false, Registered: false }, Sync: {}, ParentPinSet: false, MessageLanguage: 'auto', DeveloperMode: false };
    await openProfile(page, 'Tim', { status });
    await page.click('[data-section="interface"]');

    await expect(page.locator('.pca-note-warn').first()).toContainText('File Transformation');
    await page.click('label[for="pcaElsearch"]');
    await page.click('label[for="pcaElsignout"]');
    await page.click('label[for="pcaLock"]');
    await expect(page.locator('.pca-note-warn', { hasText: 'No parent PIN is set yet' })).toBeVisible();

    const saved = await savedProfile(page);
    expect(saved.Profile.HiddenElements).toEqual(['search', 'signout']);
    expect(saved.Profile.LockSession).toBe(true);
});

test('sign-in: the PIN pad, the sign-in screen and the warnings that go with them', async ({ page }) => {
    await openProfile(page, 'Tim');
    await page.click('[data-section="signin"]');

    await page.click('label[for="pcaPinSignIn"]');
    await expect(page.locator('.pca-note-warn', { hasText: 'Remote access is on' })).toBeVisible();
    await page.click('label[for="pcaPermEnableRemoteAccess"]');
    await expect(page.locator('.pca-note-warn', { hasText: 'Remote access is on' })).toHaveCount(0);

    await page.fill('#pcaPin1', '12');
    await page.click('[data-action="set-user-pin"]');
    await expect(page.locator('#pcaPinError')).toHaveText('A PIN has 4 to 8 digits.');
    await page.fill('#pcaPin1', '1234');
    await page.fill('#pcaPin2', '1235');
    await page.click('[data-action="set-user-pin"]');
    await expect(page.locator('#pcaPinError')).toHaveText('The two PINs differ.');
    await page.fill('#pcaPin2', '1234');
    await page.click('[data-action="set-user-pin"]');
    await expect(page.locator('.pca-toast-text')).toHaveText('PIN saved');
    expect((await lastRequest(page, 'POST', 'ParentalControl/Profiles/tim-id/Pin'))?.body).toEqual({ Pin: '1234' });

    await page.selectOption('#pcaSessions', '2');
    const saved = await savedProfile(page);
    expect(saved.Profile.PinSignIn).toBe(true);
    expect(saved.Native.EnableRemoteAccess).toBe(false);
    expect(saved.Native.MaxActiveSessions).toBe(2);
});

test('a new profile cannot get a PIN before it is saved', async ({ page }) => {
    await openProfile(page, 'Will');
    await page.click('[data-section="signin"]');

    await expect(page.locator('#pcaPin1')).toHaveCount(0);
    await expect(page.locator('.pca-card', { hasText: 'Sign-in PIN' })).toContainText('Save the profile first.');
});

test('the activity shows the last days and the recent playback', async ({ page }) => {
    await openProfile(page, 'Tim');
    await page.click('[data-section="activity"]');

    await expect(page.locator('.pca-chart-col')).toHaveCount(7);
    await expect(page.locator('.pca-chart-col.pca-over')).toHaveCount(2);
    await expect(page.locator('.pca-history-row')).toContainText('Bluey Movie');
    await expect(page.locator('.pca-history-row')).toContainText('on Living room TV');
});

test('removing the protection asks first', async ({ page }) => {
    await openProfile(page, 'Tim');
    await page.click('[data-section="signin"]');

    await page.click('[data-action="delete-profile"]');
    await expect(page.locator('[role="alertdialog"]')).toContainText('Remove the protection of Tim?');
    await page.click('.pca-ask-yes');

    await expect.poll(async () => (await requests(page)).some((request) => request.method === 'DELETE' && request.path === 'ParentalControl/Profiles/tim-id')).toBe(true);
    await expect(page.locator('.pca-family')).toBeVisible();
});

test('a refused save keeps the changes and says why', async ({ page }) => {
    await openProfile(page, 'Tim', { failures: { 'POST ParentalControl/Profiles/tim-id': { status: 400, message: 'A daily limit is out of range.' } } });
    await page.locator('.pca-rule', { hasText: 'violent' }).getByRole('button').click();

    await page.click('.pca-savebar [data-action="save"]');

    await expect(page.locator('.pca-toast-text')).toHaveText('Could not save: A daily limit is out of range.');
    await expect(page.locator('.pca-savebar')).toBeVisible();
});

test('labels are created, edited and deleted', async ({ page }) => {
    await openAdminPage(page, options());
    await page.click('#pcaTabLabels');
    await expect(page.locator('.pca-label-card')).toHaveCount(1);

    await page.click('[data-action="new-label"]');
    await page.fill('#pcaLabelName', 'Scary');
    await page.click('.pca-color[data-color="#e5533d"]');
    await page.click('[data-label="add"]');
    const picker = page.locator('.pca-dialog-wide');
    await picker.locator('.pca-result', { hasText: 'Scary Night' }).click();
    await picker.locator('[data-kind="genres"]').click();
    await picker.locator('.pca-result', { hasText: 'Horror' }).click();
    await picker.locator('[data-pick="add"]').click();
    await page.click('[data-label="save"]');

    await expect(page.locator('.pca-label-card')).toHaveCount(2);
    const created = (await lastRequest(page, 'POST', 'ParentalControl/Labels'))?.body as Label;
    expect(created.Name).toBe('Scary');
    expect(created.Color).toBe('#e5533d');
    expect(created.Targets.map((rule) => rule.Kind + ':' + rule.Value)).toEqual(['Item:movie-2', 'Genre:Horror']);

    await page.locator('.pca-label-card', { hasText: 'Pour Tim' }).locator('[data-action="edit-label"]').click();
    await page.fill('#pcaLabelName', 'Pour Tim et Will');
    await page.click('[data-label="save"]');
    await expect(page.locator('.pca-label-card', { hasText: 'Pour Tim et Will' })).toBeVisible();

    await page.locator('.pca-label-card', { hasText: 'Scary' }).locator('[data-action="delete-label"]').click();
    await page.click('.pca-ask-yes');
    await expect(page.locator('.pca-label-card')).toHaveCount(1);
});

test('a label refused by the server stays open with the reason', async ({ page }) => {
    await openAdminPage(page, options({ failures: { 'POST ParentalControl/Labels': { status: 400, message: 'Another label already has this name.' } } }));
    await page.click('#pcaTabLabels');
    await page.click('[data-action="new-label"]');
    await page.fill('#pcaLabelName', 'Pour tim');
    await page.click('[data-label="save"]');

    await expect(page.locator('.pca-label-error')).toHaveText('Another label already has this name.');
});

test('settings: parent PIN, injection state, synchronization and options', async ({ page }) => {
    await openAdminPage(page, options());
    await page.click('#pcaTabSettings');

    await expect(page.locator('.pca-card', { has: page.locator('h3', { hasText: 'Web client script' }) })).toContainText('Injected');
    await page.fill('#pcaParentPin1', '2468');
    await page.fill('#pcaParentPin2', '2468');
    await page.click('[data-action="parent-pin"]');
    await expect(page.locator('.pca-toast-text')).toHaveText('PIN saved');
    expect((await lastRequest(page, 'POST', 'ParentalControl/ParentPin'))?.body).toEqual({ Pin: '2468' });

    await page.click('[data-action="sync"]');
    await expect(page.locator('.pca-toast-text')).toHaveText('Synchronized');

    await page.selectOption('#pcaLanguage', 'fr');
    await page.click('[data-action="save-options"]');
    expect((await lastRequest(page, 'POST', 'ParentalControl/Options'))?.body).toEqual({ MessageLanguage: 'fr', DeveloperMode: false });

    await page.click('[data-action="remove-parent-pin"]');
    await page.click('.pca-ask-yes');
    await expect.poll(async () => (await requests(page)).some((request) => request.method === 'DELETE' && request.path === 'ParentalControl/ParentPin')).toBe(true);
});

test('the page follows the display language of the administrator', async ({ page }) => {
    await openAdminPage(page, options(), 'fr');

    await expect(page.locator('.pca-title')).toHaveText('Contrôle parental');
    await expect(page.locator('#pcaTabFamily')).toContainText('Famille');
    await expect(page.locator('.pca-member').first()).toContainText('Protégé');
    await page.locator('.pca-member', { hasText: 'Tim' }).click();
    await expect(page.locator('.pca-card-title').first()).toContainText('Ce que Tim peut voir');
});

test('the main texts stay readable on a light dashboard', async ({ page }) => {
    await openAdminPage(page, options(), undefined, LIGHT_DASHBOARD_STYLE);
    await page.locator('.pca-member', { hasText: 'Tim' }).click();

    for (const selector of ['.pca-subtitle', '.pca-card-desc', '.pca-mode-text', '.pca-rule-kind', '.pca-badge-ok']) {
        expect(await textContrast(page.locator(selector)), selector).toBeGreaterThanOrEqual(4.5);
    }
});
