const { chromium } = require('playwright');
const BASE = process.env.JF_BASE || 'http://127.0.0.1:8096';
const SHOTS = __dirname + '/shots';
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-proxy-server'] });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' })).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('WebSocket') && !m.text().includes('gstatic') && !m.text().includes('CERT')) errors.push(m.type() + ': ' + m.text().substring(0, 300)); });
    page.on('response', r => { if (r.status() >= 400 && !r.url().includes('gstatic')) errors.push('http ' + r.status() + ' ' + r.url().substring(0, 160)); });
    await page.goto(BASE + '/web/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#txtManualName', { timeout: 60000 });
    await page.fill('#txtManualName', process.env.JF_ADMIN_USER || 'admin');
    await page.fill('#txtManualPassword', process.env.JF_ADMIN_PASS || 'admin123');
    await page.click('button[type="submit"].btnLogin, .manualLoginForm button[type="submit"]');
    await page.waitForSelector('#homeTab .sections .ch-section', { timeout: 60000 });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: SHOTS + '/20-integrated-home.png', fullPage: true });
    const dump = await page.evaluate(() => Array.from(document.querySelectorAll('#homeTab .sections > .verticalSection, #homeTab .sections > .ch-wrapper > .verticalSection, #homeTab .sections > .ch-folder')).map(n => {
        const card = n.querySelector('.card');
        const img = card && card.querySelector('.cardImageContainer');
        return { key: n.dataset.chKey || '', cls: n.className.replace(/\s+/g, ' ').replace('verticalSection ', '').replace(' emby-scroller-container', ''), order: parseInt(n.style.order, 10), title: (n.querySelector('h2') || {}).textContent, cards: n.querySelectorAll('.card').length, cardClass: card ? card.className.split(' ').filter(c => c.indexOf('overflow') === 0).join(',') : '', cardWidth: card ? Math.round(card.getBoundingClientRect().width) : 0, img: img ? (img.style.backgroundImage || '').replace(/^url\("?|"?\)$/g, '').replace(/^https?:\/\/[^\/]+/, '').substring(0, 70) : '', hidden: n.classList.contains('hide') || n.classList.contains('ch-hidden'), titles: n.querySelectorAll('.cardText-first').length };
    }).sort((a, b) => a.order - b.order));
    console.log(JSON.stringify(dump.filter(d => d.key || d.cards), null, 0));
    console.log('ch keys:', await page.evaluate(() => Array.from(document.querySelectorAll('[data-ch-key]')).map(n => n.dataset.chKey + ':' + n.dataset.chInstance + ':' + n.querySelectorAll('.card').length + ':' + (n.classList.contains('hide') ? 'hide' : 'shown')).join(' ')));
    console.log('registry:', await page.evaluate(() => JSON.stringify(document.querySelector('#homeTab .sections')._chIntegrated)));
    console.log('cache:', await page.evaluate(() => JSON.stringify(Object.keys(window.CustomizedHome.sections ? {} : {}))));
    // click a card of an integrated section -> details page
    const firstCard = await page.$('.ch-section .ch-card a.cardImageContainer');
    if (firstCard) { await firstCard.click(); await page.waitForTimeout(2500); console.log('after card click url:', page.url()); await page.goBack(); await page.waitForTimeout(2000); }
    // editor: badges + format menu
    await page.click('.ch-customize-button');
    await page.waitForSelector('.ch-dialog .ch-row', { timeout: 15000 });
    await page.waitForTimeout(500);
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.ch-dialog .ch-list .ch-row')).map(r => ({ key: r._item && r._item.Key, text: (r.querySelector('.ch-row-title') || r.querySelector('.ch-folder-name') || {}).textContent || (r.querySelector('.ch-folder-name') || {}).value, sub: (r.querySelector('.ch-row-sub') || {}).textContent, badge: (r.querySelector('.ch-row-format') || {}).textContent, child: r.classList.contains('ch-row-child'), unlisted: r.classList.contains('ch-row-unlisted'), hidden: r.classList.contains('ch-row-hidden') })));
    console.log('editor rows:', JSON.stringify(rows, null, 1));
    // open format menu of the "Regarder à nouveau" row and pick "Paysage"
    const rowsEl = await page.$$('.ch-dialog .ch-list .ch-row');
    for (const r of rowsEl) { const k = await r.evaluate(n => n._item && n._item.Key); if (k === 'ch:watchAgain') { await (await r.$('.ch-act-menu')).click(); break; } }
    await page.waitForTimeout(300);
    await page.click('.ch-popup button:has-text("Format")');
    await page.waitForTimeout(300);
    await page.screenshot({ path: SHOTS + '/21-format-menu.png' });
    await page.click('.ch-popup button:has-text("Paysage")');
    await page.waitForTimeout(300);
    await page.click('.ch-dialog .ch-save');
    await page.waitForSelector('.ch-dialog', { state: 'detached', timeout: 15000 });
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => { const n = document.querySelector('[data-ch-key="ch:watchAgain"]'); return n ? { shape: n.dataset.chShape, cardClass: n.querySelector('.card') && n.querySelector('.card').className } : null; });
    console.log('watchAgain after format change:', JSON.stringify(after));
    console.log('ch keys after:', await page.evaluate(() => Array.from(document.querySelectorAll('[data-ch-key]')).map(n => n.dataset.chKey + ':' + n.dataset.chShape + ':' + n.querySelectorAll('.card').length).join(' ')));
    await page.screenshot({ path: SHOTS + '/22-integrated-after.png', fullPage: true });
    console.log('errors:', JSON.stringify(errors, null, 1));
    await browser.close();
})().catch(err => { console.error('PROBE FAILED', err); process.exit(1); });
