'use strict';
// Test navigateur de bout en bout : node test/e2e.js  (nécessite playwright + chromium)
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const PORT = 3177, URL = 'http://127.0.0.1:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'thrifty-e2e-'));
const PHOTO = path.join(__dirname, '..', 'public', 'assets', 'bag.jpg');
const SHOTS = process.env.SHOTS || '';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };

(async () => {
  const srv = spawn('node', ['server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, DATA_DIR: DATA, ADMIN_EMAIL: 'admin@thrifty.ma', ADMIN_PASSWORD: 'MotDePasseAdmin1' }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1500));
  const b = await chromium.launch();
  const errors = [];
  const mk = async (opts) => { const c = await b.newContext(opts); const p = await c.newPage(); p.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errors.push('console: ' + m.text()); }); return p; };
  const shot = (p, n) => SHOTS && p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true });
  try {
    const S = await mk({ viewport: { width: 1280, height: 900 } });
    await S.goto(URL + '/'); await S.waitForSelector('.hero');
    ok(await S.locator('.display').innerText().then((t) => /Seconde main/.test(t)), 'accueil affiché');
    ok(await S.locator('.tile').count() === 3, 'accueil : 3 univers');
    ok(await S.locator('text=Marhba bik').count() > 0, 'darija présent');
    await shot(S, 'home');
    // inscription vendeuse
    await S.goto(URL + '/inscription');
    await S.fill('#name', 'Sara'); await S.fill('#email', 'sara@test.ma'); await S.fill('#password', 'password123'); await S.selectOption('#city', 'Rabat'); await S.check('input[name=terms]');
    await S.click('#view button[type=submit]'); await S.waitForSelector('.avatar');
    ok(true, 'inscription OK');
    // vendre avec vraie photo
    await S.goto(URL + '/vendre'); await S.waitForSelector('#files', { state: 'attached' });
    await S.setInputFiles('#files', PHOTO); await S.waitForSelector('.ph img');
    await S.fill('#title', 'Veste en jean vintage'); await S.fill('#desc', 'Veste en jean bleu délavé, portée quelques fois.');
    await S.selectOption('#cat', 'Vestes et blazers'); await S.selectOption('#size', 'M'); await S.selectOption('#color', 'Denim'); await S.fill('#brand', "Levi's");
    await S.selectOption('#cond', 'Très bon état'); await S.selectOption('#city', 'Rabat'); await S.check('#noDefect'); await S.fill('#price', '150'); await S.check('#decl');
    await shot(S, 'sell');
    await S.click('button[data-publish="1"]'); await S.waitForURL(/\/article\/\d+/);
    const itemUrl = S.url();
    ok(await S.locator('h1.ititle').innerText() === 'Veste en jean vintage', 'annonce publiée');
    ok(await S.locator('#mainph').evaluate((i) => i.naturalWidth > 0), 'photo affichée');
    await shot(S, 'item');
    // acheteur
    const B = await mk({ viewport: { width: 1280, height: 900 } });
    await B.goto(URL + '/catalogue'); await B.waitForSelector('.card');
    ok(await B.locator('.card').count() === 1, 'catalogue : 1 article');
    await shot(B, 'catalogue');
    await B.goto(URL + '/inscription');
    await B.fill('#name', 'Bilal'); await B.fill('#email', 'bilal@test.ma'); await B.fill('#password', 'password123'); await B.selectOption('#city', 'Fès'); await B.check('input[name=terms]');
    await B.click('#view button[type=submit]'); await B.waitForSelector('.avatar');
    await B.goto(itemUrl); await B.waitForSelector('.ititle');
    await B.click('[data-act=offer]'); await B.fill('.modal #am', '120'); await B.click('.modal button[type=submit]'); await B.waitForURL(/\/messages\/\d+/); await B.waitForSelector('.bub .amt');
    ok(/120/.test(await B.locator('.bub .amt').innerText()), 'offre envoyée');
    await S.goto(URL + '/messages'); await S.click('.citem'); await S.waitForSelector('[data-act=oaccept]'); await S.click('[data-act=oaccept]'); await S.waitForSelector('.bub.sys');
    ok(true, 'offre acceptée');
    await B.goto(itemUrl); await B.waitForSelector('.ititle');
    ok(/120/.test(await B.locator('.alert.ok').innerText()), 'prix convenu affiché');
    await B.click('.buy a.btn-fill'); await B.waitForSelector('form[data-form=order]');
    await B.fill('#address', '12 rue des Fleurs, Agdal'); await B.fill('#phone', '0612345678'); await shot(B, 'checkout');
    await B.click('form[data-form=order] button[type=submit]'); await B.waitForURL(/\/commande\/\d+/); await B.waitForSelector('.stepper2');
    ok(/145/.test(await B.locator('.lines .big dd').innerText()), 'total 120 + 25 = 145 DH');
    await shot(B, 'order');
    // vendeuse expédie
    await S.goto(B.url()); await S.click('[data-act=oship]'); await S.fill('.modal #tr', 'AB1'); await S.click('.modal button[type=submit]'); await S.waitForSelector('.stp.on:nth-child(2)');
    // admin livre
    const A = await mk({ viewport: { width: 1280, height: 900 } });
    await A.goto(URL + '/connexion'); await A.fill('#email', 'admin@thrifty.ma'); await A.fill('#password', 'MotDePasseAdmin1'); await A.click('#view button[type=submit]'); await A.waitForSelector('.avatar');
    await A.goto(URL + '/admin/commandes'); await A.click('[data-act=aord][data-a=deliver]'); await A.waitForSelector('text=Verser', { state: 'detached' }).catch(() => {});
    // acheteur confirme
    await B.reload(); await B.waitForSelector('[data-act=oconfirm]'); await B.click('[data-act=oconfirm]'); await B.click('.modal [data-close=ok]'); await B.waitForSelector('form[data-form=review]');
    await B.click('form[data-form=review] button[type=submit]'); await B.waitForSelector('text=Avis');
    // admin voit la commission puis verse
    await A.goto(URL + '/admin'); await A.waitForSelector('.kpi');
    ok(/^12\s*DH/.test(await A.locator('.kpi b').first().innerText()), 'commission 10 % de 120 = 12 DH');
    await shot(A, 'admin');
    await A.goto(URL + '/admin/commandes'); await A.click('[data-act=apay]'); await A.fill('.modal #rf', 'VIR-1'); await A.click('.modal button[type=submit]'); await A.waitForSelector('[data-act=apay]', { state: 'detached' });
    await S.goto(URL + '/versements'); await S.waitForSelector('table');
    ok(await S.locator('td .pill.ok').count() === 1, 'versement marqué versé côté vendeuse');
    // pages publiques + mobile
    const M = await mk({ viewport: { width: 390, height: 800 }, isMobile: true, deviceScaleFactor: 2 });
    for (const p of ['/', '/femmes', '/catalogue', itemUrl.replace(URL, ''), '/connexion', '/aide', '/cgu', '/mentions-legales']) {
      await M.goto(URL + p); await M.waitForSelector('#view .page');
      const over = await M.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(over <= 0, 'mobile sans débordement : ' + p + (over > 0 ? ' (+' + over + 'px)' : ''));
    }
    await shot(M, 'mobile-home');
    await M.goto(URL + '/'); await shot(M, 'mobile-home');
    await M.goto(URL + '/catalogue'); await shot(M, 'mobile-cat');
    // accès protégé
    const G = await mk({}); await G.goto(URL + '/admin'); await G.waitForURL(/connexion/); ok(true, 'admin protégé → connexion');
    await G.goto(URL + '/page-inconnue'); await G.waitForSelector('text=Page introuvable'); ok(true, '404 propre');
    ok(errors.length === 0, 'aucune erreur JS' + (errors.length ? ' : ' + errors.slice(0, 5).join(' | ') : ''));
  } catch (e) { console.log('FAIL exception: ' + e.message); fails++; if (errors.length) console.log(errors.join('\n')); }
  await b.close(); srv.kill();
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})();
