// Simulates the DOM produced by Home Screen Sections inside the real home page and checks identification/ordering.
const { chromium } = require('playwright');
const BASE = process.env.JF_BASE || 'http://127.0.0.1:8096';
const SHOTS = __dirname + '/shots';
(async () => {
    const auth = await (await fetch(BASE + '/Users/AuthenticateByName', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'MediaBrowser Client="pw", Device="pw", DeviceId="pw-2", Version="1.0"' }, body: JSON.stringify({ Username: 'admin', Pw: process.env.JF_ADMIN_PASS || 'admin123' }) })).json();
    const authHeader = `MediaBrowser Client="pw", Device="pw", DeviceId="pw-2", Version="1.0", Token="${auth.AccessToken}"`;
    await fetch(BASE + '/CustomizedHome/Layout', { method: 'DELETE', headers: { Authorization: authHeader } });

    const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-proxy-server'] });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' })).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('WebSocket') && !m.text().includes('gstatic')) errors.push(m.text().substring(0, 200)); });
    await page.goto(BASE + '/web/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#txtManualName', { timeout: 60000 });
    await page.fill('#txtManualName', process.env.JF_ADMIN_USER || 'admin');
    await page.fill('#txtManualPassword', process.env.JF_ADMIN_PASS || 'admin123');
    await page.click('button[type="submit"].btnLogin, .manualLoginForm button[type="submit"]');
    await page.waitForSelector('#homeTab .sections .verticalSection:not(#hssLoadingIndicator)', { timeout: 60000 });
    await page.waitForTimeout(3000);

    // Replace the vanilla content with an HSS-like rendering (same markup as HSS loadSections.js).
    await page.evaluate(() => {
        const c = document.querySelector('#homeTab .sections');
        const defs = [
            ['MyMedia', 'Mes médias', 0], ['ContinueWatchingNextUp', 'Continuer à regarder / À suivre', 1], ['RecentlyAddedMovies', 'Films ajoutés récemment', 2],
            ['RecentlyAddedShows', 'Séries ajoutées récemment', 3], ['BecauseYouWatched-The-Office', 'Parce que vous avez regardé The Office', 4],
            ['BecauseYouWatched-Dark', 'Parce que vous avez regardé Dark', 5], ['WatchAgain', 'Regarder à nouveau', 6], ['CollectionsSection', 'Collections', 7], ['Genre-Action', 'Action films', 8], ['DiscoverTV', 'Découvrir les séries', 9]
        ];
        let html = '<div id="hssLoadingIndicator" class="verticalSection" style="order: 2147000000;display:none;"></div>';
        defs.forEach(([cls, title, order], i) => {
            html += '<div data-page="1" style="order:' + order + ';" class="verticalSection ' + cls + ' section' + i + '">'
                + '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left"><h2 class="sectionTitle sectionTitle-cards">' + title + '</h2></div>'
                + '<div class="itemsContainer scrollSlider"><div class="card">x</div></div></div>';
        });
        c.innerHTML = html;
        c.classList.add('homeSectionsContainer');
    });
    await page.waitForTimeout(1500);
    const found = await page.evaluate(() => window.CustomizedHome.sections());
    console.log('identified:', JSON.stringify(found, null, 1));

    // Save a layout: folder "Séries" (RecentlyAddedShows, DiscoverTV), then BecauseYouWatched family, then MyMedia; hide Genre; unlisted appended.
    const layout = { Version: 1, HideUnlisted: false, Items: [
        { Type: 'folder', Id: 'series', Name: 'Séries', Icon: 'tv', Visible: true, Collapsed: false, Items: [ { Type: 'section', Key: 'hss:RecentlyAddedShows', Visible: true }, { Type: 'section', Key: 'hss:DiscoverTV', Visible: true } ] },
        { Type: 'section', Key: 'hss:BecauseYouWatched', Visible: true },
        { Type: 'section', Key: 'hss:MyMedia', Visible: true },
        { Type: 'section', Key: 'hss:Genre', Visible: false }
    ] };
    const saved = await (await fetch(BASE + '/CustomizedHome/Layout', { method: 'POST', headers: { Authorization: authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify(layout) })).json();
    console.log('saved items:', saved.Items.length);
    await page.evaluate(() => window.CustomizedHome.refresh());
    await page.waitForTimeout(1500);
    const ordered = await page.evaluate(() => Array.from(document.querySelectorAll('#homeTab .sections > *')).map(n => ({ cls: n.className.replace(/\s+/g, ' ').replace('verticalSection ', ''), order: parseInt(n.style.order, 10), hidden: n.classList.contains('ch-hidden') || n.style.display === 'none', folder: n.dataset.chFolder || '' })).sort((a, b) => a.order - b.order));
    console.log('visual order:', JSON.stringify(ordered, null, 1));
    await page.screenshot({ path: SHOTS + '/12-hss-sim-home.png', fullPage: true });

    await page.click('.ch-customize-button');
    await page.waitForSelector('.ch-dialog .ch-row', { timeout: 15000 });
    await page.waitForTimeout(500);
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.ch-dialog .ch-list .ch-row')).map(r => ({ key: r._item && r._item.Key, text: r.querySelector('.ch-row-title') ? r.querySelector('.ch-row-title').textContent : (r.querySelector('.ch-folder-name') || {}).value, sub: (r.querySelector('.ch-row-sub') || {}).textContent, child: r.classList.contains('ch-row-child'), unlisted: r.classList.contains('ch-row-unlisted') })));
    console.log('editor rows:', JSON.stringify(rows, null, 1));
    await page.screenshot({ path: SHOTS + '/13-hss-sim-editor.png' });
    console.log('errors:', JSON.stringify(errors));
    await browser.close();
})().catch(err => { console.error('PROBE FAILED', err); process.exit(1); });
