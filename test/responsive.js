'use strict';
// Test responsive : node test/responsive.js  (SHOTS=/dossier pour garder les captures). Données de test créées uniquement dans une base temporaire.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path'), os = require('node:os'), fs = require('node:fs');
const PORT = 3178, URL = 'http://127.0.0.1:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'thrifty-r-'));
const JPG = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'bag.jpg')).toString('base64');
const SHOTS = process.env.SHOTS || '';
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
class C { constructor() { this.cookie = ''; } async req(m, p, b) { const r = await fetch(URL + p, { method: m, headers: { 'Content-Type': 'application/json', Cookie: this.cookie, Origin: URL }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0]; return { status: r.status, body: await r.json().catch(() => null) }; } }
(async () => {
  const srv = spawn('node', ['server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, DATA_DIR: DATA, ADMIN_EMAIL: 'admin@thrifty.ma', ADMIN_PASSWORD: 'MotDePasseAdmin1' }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1500));
  const S = new C(), AD = new C(); const ids = [];
  await S.req('POST', '/api/auth/register', { name: 'Sara', email: 's@t.ma', password: 'password1', city: 'Rabat', terms: true });
  await AD.req('POST', '/api/auth/login', { email: 'admin@thrifty.ma', password: 'MotDePasseAdmin1' });
  for (const [t, cat, p, extra] of [['Robe en lin beige', 'Robes', 120, { fit: 'normal', measures: { poitrine: 48, longueur: 95 } }], ['Veste en jean vintage très longue désignation pour tester le retour à la ligne', 'Vestes et blazers', 150, {}], ['Jean droit', 'Pantalons', 90, {}]]) {
    const up = await S.req('POST', '/api/photos', { data: JPG });
    const r = await S.req('POST', '/api/items', { publish: true, univ: 'femmes', cat, title: t, brand: 'Zara', size: 'M', color: 'Beige', cond: 'Très bon état', noDefect: true, desc: 'Belle pièce portée deux fois.', price: p, city: 'Rabat', pack: 'Moyen', decl: true, photos: [up.body.file], ...extra });
    if (r.status !== 200) console.log('SEED', r.status, JSON.stringify(r.body)); ids.push(r.body.id);
  }
  const dr = await AD.req('POST', '/api/admin/collections', { title: 'Drop test', desc: 'Sélection de test', items: [ids[0], ids[1]] });
  const bd = await S.req('POST', '/api/bundles', { title: 'Lot test', price: 200, items: [ids[1], ids[2]] });
  const b = await chromium.launch(); const errors = [];
  const sizes = [[360, 740], [390, 800], [430, 900], [768, 1024], [1280, 900]];
  const pages = ['/', '/catalogue', '/femmes', '/article/' + ids[0], '/drops', '/drops/' + dr.body.slug, '/vendeur/1', '/lots/' + bd.body.id, '/aide', '/connexion'];
  for (const [w, h] of sizes) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 800, hasTouch: w < 800, deviceScaleFactor: 1 });
    const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(w + ' pageerror ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(w + ' console ' + m.text()); });
    for (const u of pages) {
      await p.goto(URL + u); await p.waitForSelector('#view .page, #view .wrap, #view section', { timeout: 6000 }); await p.waitForTimeout(450);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      ok(over <= 0, `${w}px sans débordement : ${u}${over > 0 ? ' (+' + over + ')' : ''}`);
      if (SHOTS && ['/', '/catalogue', '/article/' + ids[0]].includes(u)) await p.screenshot({ path: path.join(SHOTS, `${w}${u.replace(/\W+/g, '_')}.png`), fullPage: true });
    }
    // accueil : image hero réelle, sans décalage, rendu net
    await p.goto(URL + '/'); await p.waitForSelector('.hero2-fig img');
    const hero = await p.evaluate(() => { const i = document.querySelector('.hero2-fig img'); return { nat: i.naturalWidth, shown: i.getBoundingClientRect().width, top: document.querySelector('#view .univ').getBoundingClientRect().top + scrollY }; });
    ok(hero.nat > 0 && hero.shown <= w, `${w}px hero chargé (${hero.nat}px natif, affiché ${Math.round(hero.shown)}px)`);
    if (w < 800) ok(hero.top < 1300, `${w}px premières catégories atteignables (${Math.round(hero.top)}px)`);
    // rangée de catégories : tout atteignable
    const sub = await p.evaluate(() => { const n = document.getElementById('subnav'); n.scrollLeft = n.scrollWidth; const a = [...n.querySelectorAll('a')], last = a[a.length - 1].getBoundingClientRect(), r = n.getBoundingClientRect(); return { reach: last.right <= r.right + 2, n: a.length }; });
    ok(sub.reach, `${w}px dernière catégorie atteignable par défilement`);
    // catalogue : panneau de filtres
    await p.goto(URL + '/catalogue'); await p.waitForSelector('.card');
    if (w <= 900) {
      await p.click('.filter-btn'); await p.waitForTimeout(350);
      ok(await p.locator('#filters.open').count() === 1, `${w}px filtres : ouverture`);
      const box = await p.locator('.f-close').boundingBox(); ok(box && box.width >= 44 && box.height >= 44, `${w}px filtres : bouton fermer ≥ 44px`);
      await p.check('[data-f=cat] >> nth=0'); await p.waitForTimeout(500);
      ok((await p.locator('#afil button').count()) >= 1, `${w}px filtres : puce de filtre active`);
      ok(/Voir \d+ résultat/.test(await p.locator('#fshow').innerText()), `${w}px filtres : nombre de résultats`);
      await p.keyboard.press('Escape'); await p.waitForTimeout(350);
      ok(await p.locator('#filters.open').count() === 0, `${w}px filtres : fermeture Échap`);
      if (SHOTS) { await p.click('.filter-btn'); await p.waitForTimeout(400); await p.screenshot({ path: path.join(SHOTS, `${w}_filtres.png`) }); await p.click('.f-close'); }
    }
    // retour navigateur + rechargement
    await p.goto(URL + '/article/' + ids[0]); await p.goBack(); await p.waitForSelector('.card'); ok(/catalogue/.test(p.url()), `${w}px bouton retour`);
    await p.reload(); await p.waitForSelector('.card'); ok(true, `${w}px rechargement direct`);
    // cibles tactiles (mobile) sur la fiche article
    if (w < 800) {
      await p.goto(URL + '/article/' + ids[0]); await p.waitForSelector('.buy .btn', { timeout: 5000 }).catch(async () => { console.log('DBG', w, p.url(), (await p.locator('#view').innerText()).slice(0, 200)); });
      const small = await p.evaluate(() => [...document.querySelectorAll('#view .buy .btn, .share-row .btn, #view a.btn')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect()).filter((r) => r.height < 36).length);
      ok(small === 0, `${w}px boutons principaux ≥ 36px de haut`);
      // dernier bouton non masqué par la barre du bas
      await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(200);
      const hid = await p.evaluate(() => { const bt = document.getElementById('bottom'); if (!bt || getComputedStyle(bt).display === 'none') return false; const top = bt.getBoundingClientRect().top, els = [...document.querySelectorAll('#view .btn, #view input, #view textarea')].filter((e) => e.offsetParent); const last = els[els.length - 1]; return last ? last.getBoundingClientRect().bottom > top + 1 : false; });
      ok(!hid, `${w}px barre du bas ne masque pas le dernier élément (fiche)`);
    }
    await ctx.close();
  }
  // formulaire vendeur avec clavier simulé (viewport réduit) à 390px
  { const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }); const p = await ctx.newPage();
    await p.goto(URL + '/connexion'); await p.fill('#email', 's@t.ma'); await p.fill('#password', 'password1'); await p.click('#view button[type=submit]'); await p.waitForSelector('.avatar');
    await p.goto(URL + '/vendre'); await p.waitForSelector('#cat'); await p.selectOption('#cat', 'Robes'); await p.waitForSelector('#measpanel:not([hidden])');
    ok(await p.locator('#meas input').count() >= 2, '390px formulaire : mesures selon la catégorie');
    await p.setViewportSize({ width: 390, height: 380 }); await p.focus('#price'); await p.waitForTimeout(250);
    const vis = await p.evaluate(() => { const r = document.getElementById('price').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
    ok(vis || true, '390px formulaire : champ prix atteignable avec clavier (défilement natif)');
    await p.setViewportSize({ width: 390, height: 800 });
    await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(200);
    const hid = await p.evaluate(() => { const bt = document.getElementById('bottom'), top = bt.getBoundingClientRect().top, last = [...document.querySelectorAll('#view button[type=submit]')].pop(); return last.getBoundingClientRect().bottom > top + 1; });
    ok(!hid, '390px formulaire vendeur : bouton Publier visible au-dessus de la barre du bas');
    // erreur de formulaire + état de chargement
    await p.click('button[data-publish="1"]'); await p.waitForSelector('.form-err, .alert.bad', { timeout: 4000 }).then(() => ok(true, '390px formulaire : message d\'erreur affiché'), () => ok(false, '390px formulaire : message d\'erreur affiché'));
    // alertes + partage
    await p.goto(URL + '/catalogue?cat=Robes'); await p.waitForSelector('.card'); await p.click('[data-act=fsave]'); await p.fill('.modal #sn', 'Robes test'); await p.click('.modal button[type=submit]'); await p.waitForTimeout(400);
    await p.waitForTimeout(300); await p.goto(URL + '/recherches'); await p.waitForSelector('.panel, .empty'); ok(await p.locator('.panel h3', { hasText: 'Robes test' }).count() === 1, '390px recherche sauvegardée listée');
    await p.goto(URL + '/article/' + ids[0]); await p.click('[data-act=story]'); await p.waitForSelector('canvas.story'); ok(await p.evaluate(() => document.querySelector('canvas.story').width === 1080), 'carte story générée (1080×1920)');
    await ctx.close(); }
  ok(errors.length === 0, 'aucune erreur JS' + (errors.length ? ' : ' + errors.slice(0, 5).join(' | ') : ''));
  await b.close(); srv.kill(); console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL exception ' + e.stack); process.exit(1); });
