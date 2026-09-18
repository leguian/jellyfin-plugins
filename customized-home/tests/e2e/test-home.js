// End-to-end check of the Customized Home plugin against the local Jellyfin test server.
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.JF_BASE || 'http://127.0.0.1:8096';
const SHOTS = __dirname + '/shots';
const user = process.env.JF_USER || 'admin';
const pass = process.env.JF_PASS || process.env.JF_ADMIN_PASS || 'admin123';

async function apiLogin() {
    const res = await fetch(BASE + '/Users/AuthenticateByName', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'MediaBrowser Client="pw", Device="pw", DeviceId="pw-1", Version="1.0"' },
        body: JSON.stringify({ Username: user, Pw: pass })
    });
    return res.json();
}

(async () => {
    const auth = await apiLogin();
    const token = auth.AccessToken;
    const authHeader = `MediaBrowser Client="pw", Device="pw", DeviceId="pw-1", Version="1.0", Token="${token}"`;
    // reset any stored layout so the run is deterministic
    await fetch(BASE + '/CustomizedHome/Layout', { method: 'DELETE', headers: { Authorization: authHeader } });

    const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-proxy-server'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' });
    const page = await context.newPage();
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error' || msg.text().includes('CustomizedHome')) errors.push(msg.type() + ': ' + msg.text()); });
    page.on('pageerror', err => errors.push('pageerror: ' + err.message));

    await page.goto(BASE + '/web/index.html', { waitUntil: 'domcontentloaded' });
    const html = await page.content();
    console.log('script injected:', html.includes('CustomizedHome/customized-home.js'), 'css injected:', html.includes('CustomizedHome/customized-home.css'));

    // login form (manual login page)
    await page.waitForSelector('#txtManualName, .manualLoginForm #txtManualName, input[name="username"], .cardImageContainer', { timeout: 60000 });
    if (await page.$('#txtManualName')) {
        await page.fill('#txtManualName', user);
        await page.fill('#txtManualPassword', pass);
        await page.click('button[type="submit"].btnLogin, .manualLoginForm button[type="submit"]');
    }
    await page.waitForSelector('#homeTab .sections .verticalSection:not(#hssLoadingIndicator)', { timeout: 60000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: SHOTS + '/01-home-initial.png', fullPage: true });

    const dump = await page.evaluate(() => {
        const c = document.querySelector('#homeTab .sections');
        const rows = [];
        c.querySelectorAll(':scope > *').forEach(n => {
            const title = n.querySelector('h2') ? n.querySelector('h2').textContent.trim() : '';
            rows.push({ cls: n.className, id: n.id, order: n.style.order, title, hidden: n.classList.contains('hide') || n.classList.contains('ch-hidden'), children: n.classList.contains('ch-wrapper') ? Array.from(n.children).map(g => ({ cls: g.className, order: g.style.order, title: g.querySelector('h2') ? g.querySelector('h2').textContent.trim() : '', hidden: g.classList.contains('hide') })) : undefined });
        });
        return { containerClass: c.className, rows, api: !!(window.CustomizedHome && window.CustomizedHome.loaded), customizeButton: !!document.querySelector('.ch-customize-button') };
    });
    console.log(JSON.stringify(dump, null, 1));

    // Open the editor from the home button
    await page.click('.ch-customize-button');
    await page.waitForSelector('.ch-dialog .ch-row', { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: SHOTS + '/02-editor.png' });
    const rowsBefore = await page.$$eval('.ch-dialog .ch-row', rows => rows.map(r => ({ text: r.querySelector('.ch-row-title') ? r.querySelector('.ch-row-title').textContent : (r.querySelector('.ch-folder-name') || {}).value, folder: r.classList.contains('ch-row-folder'), child: r.classList.contains('ch-row-child'), unlisted: r.classList.contains('ch-row-unlisted') })));
    console.log('editor rows:', JSON.stringify(rowsBefore));

    // create a folder, rename it, then drag two sections with content into it
    await page.click('.ch-new-folder');
    await page.fill('.ch-dialog .ch-folder-name', 'Séries');

    async function rowByTitle(t) {
        const all = await page.$$('.ch-dialog .ch-list .ch-row');
        for (const r of all) { const txt = await r.evaluate(n => n.querySelector('.ch-row-title') ? n.querySelector('.ch-row-title').textContent : ''); if (txt === t) return r; }
        return null;
    }
    async function dragBelow(sourceTitle, targetRow, indent) {
        const source = await rowByTitle(sourceTitle);
        const handle = await source.$('.ch-handle');
        const hb = await handle.boundingBox();
        const tb = await targetRow.boundingBox();
        await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
        await page.mouse.down();
        await page.mouse.move(hb.x + hb.width / 2, hb.y + 15, { steps: 4 });
        await page.mouse.move(tb.x + indent, tb.y + tb.height + 4, { steps: 12 });
        await page.waitForTimeout(100);
        await page.mouse.up();
        await page.waitForTimeout(250);
    }
    await dragBelow('Séries, ajouts récents', await page.$('.ch-dialog .ch-row-folder'), 120);
    await page.screenshot({ path: SHOTS + '/03-after-first-drag.png' });
    // second: drop below the last member (indented) to append
    await dragBelow('À suivre', (await page.$('.ch-dialog .ch-row-child')) || (await page.$('.ch-dialog .ch-row-folder')), 120);
    // move "Films, ajouts récents" to the top (drop above the folder = before first row, not indented)
    const films = await rowByTitle('Films, ajouts récents');
    {
        const handle = await films.$('.ch-handle');
        const hb = await handle.boundingBox();
        const fb = await (await page.$('.ch-dialog .ch-row-folder')).boundingBox();
        await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
        await page.mouse.down();
        await page.mouse.move(hb.x + hb.width / 2, hb.y - 15, { steps: 4 });
        await page.mouse.move(fb.x + 10, fb.y + 3, { steps: 12 });
        await page.mouse.up();
        await page.waitForTimeout(250);
    }
    // hide "Continuer de regarder" using the eye button
    const resume = await rowByTitle('Continuer de regarder');
    if (resume) { await (await resume.$('.ch-act-visibility')).click(); }
    await page.screenshot({ path: SHOTS + '/04-editor-after.png' });
    const rowsAfter = await page.$$eval('.ch-dialog .ch-list .ch-row', rows => rows.map(r => ({ text: r.querySelector('.ch-row-title') ? r.querySelector('.ch-row-title').textContent : (r.querySelector('.ch-folder-name') || {}).value, folder: r.classList.contains('ch-row-folder'), child: r.classList.contains('ch-row-child'), hidden: r.classList.contains('ch-row-hidden') })));
    console.log('editor rows after:', JSON.stringify(rowsAfter));

    await page.click('.ch-dialog .ch-save');
    await page.waitForSelector('.ch-dialog', { state: 'detached', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: SHOTS + '/05-home-after-save.png', fullPage: true });

    const after = await page.evaluate(() => {
        const c = document.querySelector('#homeTab .sections');
        const list = [];
        c.querySelectorAll('.verticalSection, .ch-folder').forEach(n => list.push({ cls: n.className.replace(/\s+/g, ' '), order: parseInt(n.style.order, 10), title: n.querySelector('h2') ? n.querySelector('h2').textContent.trim() : '', hidden: n.classList.contains('hide') || n.classList.contains('ch-hidden'), folder: n.dataset.chFolder || n.dataset.chFolderId || '' }));
        list.sort((a, b) => a.order - b.order);
        return list;
    });
    console.log('home after save:', JSON.stringify(after, null, 1));

    // reload and check persistence
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#homeTab .sections .ch-folder', { timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: SHOTS + '/06-home-reloaded.png', fullPage: true });
    // collapse folder
    await page.click('.ch-folder-header');
    await page.waitForTimeout(500);
    await page.screenshot({ path: SHOTS + '/07-folder-collapsed.png', fullPage: true });
    const collapsed = await page.evaluate(() => ({ collapsed: document.querySelector('.ch-folder').classList.contains('ch-folder-collapsed'), memberHidden: Array.from(document.querySelectorAll('.ch-in-folder')).map(n => n.classList.contains('ch-hidden')) }));
    console.log('collapsed:', JSON.stringify(collapsed));

    // user menu entry
    await page.click('button[aria-label="Menu utilisateur"], button[aria-label="User menu" i]');
    await page.waitForTimeout(800);
    await page.screenshot({ path: SHOTS + '/08-user-menu.png' });
    console.log('menu entry present:', !!(await page.$('#app-user-menu .ch-menu-entry')));

    const stored = await (await fetch(BASE + '/CustomizedHome/Layout', { headers: { Authorization: authHeader } })).json();
    console.log('stored layout:', JSON.stringify(stored.Layout));
    console.log('console errors:', JSON.stringify(errors, null, 1));
    await browser.close();
})().catch(err => { console.error('TEST FAILED', err); process.exit(1); });
