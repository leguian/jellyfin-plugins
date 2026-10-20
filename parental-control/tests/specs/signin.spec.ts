import { expect, test } from '@playwright/test';
import { lastRequest, openWeb, requests, typeDigits } from './support';

const SIGN_IN = {
    PinUsers: [
        { Id: 'tim-id', Length: 4, AllowedNow: true },
        { Id: 'will-id', Length: 0, AllowedNow: true }
    ]
};

function card(name: string): string {
    return `#divUsers .card:has(.cardContent[data-username="${name}"])`;
}

test('the cards of the PIN users get a badge, the others stay as they are', async ({ page }) => {
    await openWeb(page, { userId: null, signIn: SIGN_IN });

    await expect(page.locator(card('Tim'))).toHaveClass(/pc-pin-card/);
    await expect(page.locator(`${card('Tim')} .pc-pin-badge`)).toHaveAttribute('title', 'Signs in with a code');
    await expect(page.locator(`${card('Will')} .pc-pin-badge`)).toHaveCount(1);
    await expect(page.locator(`${card('Parent')} .pc-pin-badge`)).toHaveCount(0);
});

test('a PIN user gets the pad instead of the password form, and signs in as soon as the code is typed', async ({ page }) => {
    await openWeb(page, { userId: null, signIn: SIGN_IN });
    await expect(page.locator(card('Tim'))).toHaveClass(/pc-pin-card/);

    await page.click(card('Tim'));
    const pad = page.locator('.pc-pad');
    await expect(pad).toBeVisible();
    await expect(page.locator('.pc-pad-title')).toHaveText('Tim');
    await expect(page.locator('.pc-pad-subtitle')).toHaveText('Type your secret code');
    await expect(page.locator('.pc-dot')).toHaveCount(4);
    // The handler of the web client never saw the click.
    expect((await requests(page)).some((request) => request.path === 'card-click')).toBe(false);

    await typeDigits(page, '1234');

    await expect(pad).toHaveCount(0);
    const signIn = await lastRequest(page, 'NATIVE', 'sign-in');
    expect(signIn?.body).toEqual({ name: 'Tim', password: '1234', remember: true });
    await expect(page.locator('#loginPage')).toBeHidden();
});

test('a wrong code shakes the pad, says so and lets the child try again', async ({ page }) => {
    await openWeb(page, { userId: null, signIn: SIGN_IN });
    await expect(page.locator(card('Tim'))).toHaveClass(/pc-pin-card/);
    await page.click(card('Tim'));

    await typeDigits(page, '9999');

    await expect(page.locator('.pc-pad-error')).toHaveText('That is not the right code');
    await expect(page.locator('.pc-pad')).toHaveClass(/pc-pad-shake/);
    await expect(page.locator('.pc-dot-filled')).toHaveCount(0);

    await page.keyboard.type('1234');
    await expect(page.locator('.pc-pad')).toHaveCount(0);
});

test('without a known length the pad shows a confirm key that needs four digits', async ({ page }) => {
    await openWeb(page, { userId: null, signIn: SIGN_IN });
    await expect(page.locator(card('Will'))).toHaveClass(/pc-pin-card/);
    await page.click(card('Will'));

    const confirm = page.locator('.pc-key[data-key="confirm"]');
    await typeDigits(page, '567');
    await expect(confirm).toBeDisabled();
    await typeDigits(page, '8');
    await expect(confirm).toBeEnabled();

    // Erase works too, then the code is typed again.
    await page.click('.pc-key[data-key="erase"]');
    await expect(page.locator('.pc-dot-filled')).toHaveCount(3);
    await typeDigits(page, '8');
    await confirm.click();

    await expect(page.locator('.pc-pad')).toHaveCount(0);
    expect((await lastRequest(page, 'NATIVE', 'sign-in'))?.body).toMatchObject({ name: 'Will', password: '5678' });
});

test('closing the pad gives the card back to the child', async ({ page }) => {
    await openWeb(page, { userId: null, signIn: SIGN_IN });
    await expect(page.locator(card('Tim'))).toHaveClass(/pc-pin-card/);
    await page.click(card('Tim'));

    await page.keyboard.press('Escape');

    await expect(page.locator('.pc-pad')).toHaveCount(0);
    await expect(page.locator(card('Tim'))).toBeFocused();
});

test('a user outside their hours is told it is time for a break instead of getting the pad', async ({ page }) => {
    await openWeb(page, { userId: null, signIn: { PinUsers: [{ Id: 'tim-id', Length: 4, AllowedNow: false }] } });
    await expect(page.locator(card('Tim'))).toHaveClass(/pc-pin-card-asleep/);

    await page.click(card('Tim'));

    await expect(page.locator('.pc-pad-break')).toBeVisible();
    await expect(page.locator('.pc-pad-subtitle')).toContainText('Time for a break');
    await expect(page.locator('.pc-key')).toHaveCount(0);
    await page.click('.pc-pad-ok');
    await expect(page.locator('.pc-pad-break')).toHaveCount(0);
});

test('other users keep the sign-in of the web client', async ({ page }) => {
    await openWeb(page, { userId: null, signIn: SIGN_IN });
    await expect(page.locator(card('Tim'))).toHaveClass(/pc-pin-card/);

    await page.click(card('Parent'));

    await expect(page.locator('.pc-pad')).toHaveCount(0);
    expect((await lastRequest(page, 'NATIVE', 'card-click'))?.body).toBe('Parent');
});

test('identifiers written with dashes still match', async ({ page }) => {
    await openWeb(page, { userId: null, signIn: { PinUsers: [{ Id: 'timid', Length: 4, AllowedNow: true }] } });
    await page.evaluate(() => document.querySelector('.cardContent[data-username="Tim"]')?.setAttribute('data-userid', 'TIM-ID'));
    await page.evaluate(() => document.body.appendChild(document.createElement('i')));

    await expect(page.locator(card('Tim'))).toHaveClass(/pc-pin-card/);
});
