const { chromium } = require('playwright');
const BASE = process.env.JF_BASE || 'http://127.0.0.1:8096';
const SHOTS = __dirname + '/shots';
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-proxy-server'] });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' })).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('WebSocket') && !m.text().includes('gstatic') && !m.text().includes('CERT')) errors.push(m.text().substring(0, 200)); });
    await page.goto(BASE + '/web/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#txtManualName', { timeout: 60000 });
    await page.fill('#txtManualName', process.env.JF_ADMIN_USER || 'admin');
    await page.fill('#txtManualPassword', process.env.JF_ADMIN_PASS || 'admin123');
    await page.click('button[type="submit"].btnLogin, .manualLoginForm button[type="submit"]');
    await page.waitForSelector('#homeTab .sections .verticalSection:not(#hssLoadingIndicator)', { timeout: 60000 });
    await page.waitForTimeout(3000);
    // user editor: search
    await page.click('.ch-customize-button');
    await page.waitForSelector('.ch-dialog .ch-row', { timeout: 15000 });
    console.log('user editor: arrows:', await page.$$eval('.ch-act-up, .ch-act-down', n => n.length), 'new folder btn:', await page.$$eval('.ch-new-folder', n => n.length), 'search:', await page.$$eval('.ch-search', n => n.length));
    await page.fill('.ch-search', 'genre');
    await page.waitForTimeout(300);
    console.log('search "genre":', await page.$$eval('.ch-dialog .ch-list .ch-row', rows => rows.map(r => r.querySelector('.ch-row-title').textContent + (r.classList.contains('ch-row-unlisted') ? ' [absente]' : ''))));
    await page.screenshot({ path: SHOTS + '/30-search.png' });
    await page.click('.ch-dialog .ch-cancel');
    // admin page
    await page.goto(BASE + '/web/index.html#/configurationpage?name=Customized%20Home', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#CustomizedHomeConfigPage:not(.hide) #chStatus', { timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: SHOTS + '/31-admin-options.png', fullPage: true });
    console.log('status:', (await page.textContent('#chStatus')).substring(0, 120));
    const sidebar = await page.evaluate(() => Array.from(document.querySelectorAll('a[href*="configurationpage"], .navMenuOption')).filter(a => /Customized/.test(a.textContent)).map(a => ({ text: a.textContent.trim(), icon: (a.querySelector('.material-icons') || {}).textContent || (a.querySelector('.material-icons') || {}).className })));
    console.log('sidebar entries:', JSON.stringify(sidebar));
    await page.click('.chTabs .emby-tab-button[data-index="1"]');
    await page.waitForSelector('#chDefaultEditor .ch-row, #chDefaultEditor .ch-empty', { timeout: 15000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: SHOTS + '/32-admin-layouts.png', fullPage: true });
    console.log('embedded rows:', await page.$$eval('#chDefaultEditor .ch-row', rows => rows.length), 'user layouts:', (await page.textContent('#chUserLayouts')).replace(/\s+/g, ' ').substring(0, 100));
    // toggle a section visible and save
    const eye = await page.$('#chDefaultEditor .ch-row .ch-act-visibility');
    if (eye) { await eye.click(); await page.click('#chDefaultEditor .ch-save'); await page.waitForTimeout(1500); console.log('summary after save:', await page.textContent('#chDefaultSummary')); console.log('editor still open:', await page.$$eval('#chDefaultEditor .ch-row', r => r.length)); }
    console.log('plugin image:', (await (await fetch(BASE + '/Plugins/7c99a4bf-cd3b-4bc8-b941-7ddccd816f3c/1.0.0.0/Image')).status));
    console.log('errors:', JSON.stringify(errors));
    await browser.close();
})().catch(err => { console.error('PROBE FAILED', err); process.exit(1); });
