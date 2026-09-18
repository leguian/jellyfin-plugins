// Probe the home page when Home Screen Sections ("Modular Home") renders it, and check identification.
const { chromium } = require('playwright');
const BASE = process.env.JF_BASE || 'http://127.0.0.1:8096';
const SHOTS = __dirname + '/shots';
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-proxy-server'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' });
    const page = await context.newPage();
    const logs = [];
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning' || m.text().includes('CustomizedHome') || m.text().includes('Loading section')) logs.push(m.type() + ': ' + m.text().substring(0, 200)); });
    page.on('pageerror', e => logs.push('pageerror: ' + e.message));
    await page.goto(BASE + '/web/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#txtManualName', { timeout: 60000 });
    await page.fill('#txtManualName', process.env.JF_ADMIN_USER || 'admin');
    await page.fill('#txtManualPassword', process.env.JF_ADMIN_PASS || 'admin123');
    await page.click('button[type="submit"].btnLogin, .manualLoginForm button[type="submit"]');
    await page.waitForSelector('#homeTab .sections .verticalSection:not(#hssLoadingIndicator)', { timeout: 60000 });
    await page.waitForTimeout(8000);
    await page.screenshot({ path: SHOTS + '/10-hss-home.png', fullPage: true });
    const dump = await page.evaluate(() => {
        const c = document.querySelector('#homeTab .sections');
        return {
            containerClass: c.className,
            hssMeta: window.HssPageMeta ? { page: window.HssPageMeta.Page, usePagination: window.HssPageMeta.UsePagination } : null,
            rows: Array.from(c.querySelectorAll(':scope > *')).map(n => ({ cls: n.className.replace(/\s+/g, ' '), page: n.dataset.page, order: n.style.order, orig: n.dataset.chOrigOrder, title: n.querySelector('h2') ? n.querySelector('h2').textContent.trim() : '', hide: n.classList.contains('hide'), cards: n.querySelectorAll('.card').length }))
        };
    });
    console.log(JSON.stringify(dump, null, 1));
    const btn = await page.$('.ch-customize-button');
    if (btn) {
        await btn.click();
        await page.waitForSelector('.ch-dialog .ch-row', { timeout: 15000 });
        await page.waitForTimeout(500);
        await page.screenshot({ path: SHOTS + '/11-hss-editor.png' });
        const rows = await page.$$eval('.ch-dialog .ch-list .ch-row', rows => rows.map(r => ({ text: r.querySelector('.ch-row-title') ? r.querySelector('.ch-row-title').textContent : (r.querySelector('.ch-folder-name') || {}).value, sub: r.querySelector('.ch-row-sub') ? r.querySelector('.ch-row-sub').textContent : '', key: r._item ? r._item.Key : undefined })));
        console.log('editor rows:', JSON.stringify(rows, null, 1));
        // keys are not accessible through $$eval (properties on nodes); dump via evaluate
        const keys = await page.evaluate(() => Array.from(document.querySelectorAll('.ch-dialog .ch-list .ch-row')).map(r => r._item && r._item.Key));
        console.log('keys:', JSON.stringify(keys));
        await page.click('.ch-dialog .ch-cancel');
    }
    // Apply a layout through the API: folder "Séries" + reorder + hide, then check the visual order.
    const auth = await (await fetch(BASE + '/Users/AuthenticateByName', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'MediaBrowser Client="pw", Device="pw", DeviceId="pw-3", Version="1.0"' }, body: JSON.stringify({ Username: 'admin', Pw: process.env.JF_ADMIN_PASS || 'admin123' }) })).json();
    const authHeader = `MediaBrowser Client="pw", Device="pw", DeviceId="pw-3", Version="1.0", Token="${auth.AccessToken}"`;
    const layout = { Version: 1, HideUnlisted: false, Items: [
        { Type: 'section', Key: 'hss:RecentlyAddedMovies', Visible: true },
        { Type: 'folder', Id: 'series', Name: 'Séries', Icon: 'tv', Visible: true, Collapsed: false, Items: [ { Type: 'section', Key: 'hss:RecentlyAddedShows', Visible: true }, { Type: 'section', Key: 'hss:NextUp', Visible: true }, { Type: 'section', Key: 'hss:LatestShows', Visible: true } ] },
        { Type: 'section', Key: 'hss:MyMedia', Visible: true },
        { Type: 'section', Key: 'hss:CollectionsSection', Visible: false }
    ] };
    const saved = await (await fetch(BASE + '/CustomizedHome/Layout', { method: 'POST', headers: { Authorization: authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify(layout) })).json();
    console.log('saved items:', saved.Items.length);
    await page.evaluate(() => window.CustomizedHome.refresh());
    await page.waitForTimeout(1500);
    const ordered = await page.evaluate(() => Array.from(document.querySelectorAll('#homeTab .sections > *')).map(n => ({ cls: n.className.replace(/\s+/g, ' ').replace('verticalSection ', '').replace(' emby-scroller-container', ''), order: parseInt(n.style.order, 10), hidden: n.classList.contains('ch-hidden'), hide: n.classList.contains('hide'), folder: n.dataset.chFolder || n.dataset.chFolderId || '' })).sort((a, b) => a.order - b.order));
    console.log('visual order:', JSON.stringify(ordered, null, 1));
    await page.screenshot({ path: SHOTS + '/12-hss-home-layout.png', fullPage: true });
    await fetch(BASE + '/CustomizedHome/Layout', { method: 'DELETE', headers: { Authorization: authHeader } });
    console.log(logs.slice(0, 40).join('\n'));
    await browser.close();
})().catch(err => { console.error('PROBE FAILED', err); process.exit(1); });
