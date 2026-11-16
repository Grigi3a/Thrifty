'use strict';
/* v7 : remise en main propre, masquage des coordonnées, SEO (slug, contenu serveur, JSON-LD), vues, délai de réponse, PWA. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'thrifty-v7-'));
process.env.ADMIN_EMAIL = 'admin@thrifty.ma';
process.env.ADMIN_PASSWORD = 'MotDePasseAdmin1';
delete process.env.BASE_URL;
const SH = require('../public/shared.js');
const { app, bootstrapAdmin } = require('../server/index.js');
const { run } = require('../server/db.js');
let server, URL;
before(async () => { await bootstrapAdmin(); server = await new Promise((r) => { const s = app.listen(0, () => r(s)); }); URL = 'http://127.0.0.1:' + server.address().port; });
after(() => server.close());
let ipn = 0;
class C {
  constructor() { this.cookie = ''; this.ip = '10.7.0.' + (++ipn); }
  async req(method, p, body) {
    const r = await fetch(URL + p, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', Cookie: this.cookie, Origin: URL, 'CF-Connecting-IP': this.ip }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch { /* html */ }
    return { status: r.status, body: j, text: txt, headers: r.headers };
  }
}
const ok = (r, s = 200) => assert.equal(r.status, s, JSON.stringify(r.body));
const JPEG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(900, 7)]).toString('base64');
const S = new C(), B = new C(), B2 = new C(), AD = new C(), G = new C();
const mk = async (title, price, city, extra = {}) => {
  const up = await S.req('POST', '/api/photos', { data: JPEG });
  const r = await S.req('POST', '/api/items', { publish: true, univ: 'femmes', cat: 'Robes', title, brand: 'Zara', size: 'M', color: 'Beige', cond: 'Très bon état', noDefect: true, desc: 'Belle pièce portée deux fois.', price, city, pack: 'Moyen', decl: true, photos: [up.body.file], ...extra });
  ok(r); return r.body.id;
};

test('setup', async () => {
  ok(await S.req('POST', '/api/auth/register', { name: 'Salma', email: 's@x.ma', password: 'password1', city: 'Salé', phone: '0611223344', terms: true }));
  ok(await B.req('POST', '/api/auth/register', { name: 'Yassine', email: 'b@x.ma', password: 'password1', city: 'Rabat', phone: '0699887766', terms: true }));
  ok(await B2.req('POST', '/api/auth/register', { name: 'Karim', email: 'k@x.ma', password: 'password1', city: 'Fès', terms: true }));
  ok(await AD.req('POST', '/api/auth/login', { email: 'admin@thrifty.ma', password: 'MotDePasseAdmin1' }));
});

test('masquage : numéros, e-mails, WhatsApp ; pas les prix ni les dates', () => {
  const m = (s) => SH.maskContacts(s);
  assert.ok(m('appelle moi 06 12 34 56 78').masked);
  assert.ok(m('+212 6-12-34-56-78').masked);
  assert.ok(m('٠٦١٢٣٤٥٦٧٨').masked);
  assert.ok(m('mon mail : sara.b@gmail.com').masked);
  assert.ok(m('wa.me/212612345678').masked);
  assert.ok(!m('je propose 250 DH, dispo le 15.11.2026, taille 38').masked);
  assert.ok(!m('poitrine 56 cm, longueur 63 cm').masked);
});

test('description et messages : coordonnées masquées avant commande, libres après', async () => {
  const id = await mk('Robe fleurie', 300, 'Rabat', { desc: 'Très jolie robe, appelez le 0612345678 pour voir.' });
  const it = (await G.req('GET', '/api/items/' + id)).body.item;
  assert.doesNotMatch(it.desc, /0612345678/); assert.match(it.desc, /coordonnée masquée/);
  const c = (await B2.req('POST', '/api/convos', { itemId: id })).body;
  const r = await B2.req('POST', `/api/convos/${c.id}/messages`, { text: 'Mon whatsapp 0677 88 99 00' });
  ok(r); assert.equal(r.body.masked, true);
  const msgs = (await B2.req('GET', '/api/convos/' + c.id)).body.messages;
  assert.doesNotMatch(msgs[0].text, /0677/);
  ok(await B2.req('POST', '/api/orders', { itemId: id, name: 'Karim', phone: '0600000000', address: '3 rue Atlas', city: 'Fès' }));
  const r2 = await B2.req('POST', `/api/convos/${c.id}/messages`, { text: 'Mon numéro 0677 88 99 00' });
  assert.equal(r2.body.masked, false);
  assert.match((await B2.req('GET', '/api/convos/' + c.id)).body.messages.pop().text, /0677 88 99 00/);
});

test('main propre : refusée hors zone, gratuite, code réservé à l\'acheteur, vente conclue par le code', async () => {
  const cfg = (await G.req('GET', '/api/config')).body;
  assert.ok(cfg.hand); assert.deepEqual(cfg.hand.cities, ['Rabat', 'Salé', 'Témara']);
  const far = await mk('Veste Casa', 200, 'Casablanca');
  assert.equal((await B.req('POST', '/api/orders', { itemId: far, handover: 'hand', name: 'Yassine', phone: '0699887766', city: 'Rabat' })).status, 400);
  const id = await mk('Jean Levis', 250, 'Salé');
  assert.equal((await B2.req('POST', '/api/orders', { itemId: id, handover: 'hand', name: 'Karim', phone: '0600000000', city: 'Fès' })).status, 400);
  const r = await B.req('POST', '/api/orders', { itemId: id, handover: 'hand', name: 'Yassine', phone: '0699887766', city: 'Rabat', spot: 'Arribat Center', address: 'après 18 h' });
  ok(r);
  const ob = (await B.req('GET', '/api/orders/' + r.body.id)).body.order;
  assert.equal(ob.handover, 'hand'); assert.equal(ob.ship, 0); assert.equal(ob.total, 250); assert.match(ob.handCode, /^\d{6}$/);
  assert.equal(ob.sellerPhone, '0611223344'); assert.match(ob.address, /Arribat Center/);
  const os_ = (await S.req('GET', '/api/orders/' + r.body.id)).body.order;
  assert.equal(os_.handCode, undefined); assert.equal(os_.sellerPhone, undefined);
  assert.equal((await S.req('POST', `/api/orders/${r.body.id}/ship`, {})).status, 409); // pas d'expédition en main propre
  assert.equal((await B.req('POST', `/api/orders/${r.body.id}/handover`, { code: ob.handCode })).status, 409); // seul le vendeur saisit
  const wrong = ob.handCode === '000000' ? '111111' : '000000';
  const bad = await S.req('POST', `/api/orders/${r.body.id}/handover`, { code: wrong });
  assert.equal(bad.status, 400); assert.match(bad.body.message, /4 essais restants/);
  ok(await S.req('POST', `/api/orders/${r.body.id}/handover`, { code: ob.handCode.slice(0, 3) + ' ' + ob.handCode.slice(3) }));
  const done = (await B.req('GET', '/api/orders/' + r.body.id)).body.order;
  assert.equal(done.status, 'confirmed'); assert.equal(done.payout, 'collected'); assert.equal(done.handCode, undefined); // v8 : frais (5 %, min 5 DH) prélevés sur les crédits
  assert.equal(done.commission, 13);
  ok(await B.req('POST', `/api/orders/${r.body.id}/review`, { rating: 5, text: 'Rendez-vous parfait' }));
  const pay = (await S.req('GET', '/api/orders?role=seller')).body.payout;
  assert.equal(pay.pending, 270); assert.equal(pay.due, 0); // seule la commande livrée (300 − 10 %) attend ; la main propre est payée en espèces
});

test('main propre : 5 codes faux bloquent, frais main propre prélevés sur les crédits', async () => {
  ok(await AD.req('POST', '/api/admin/settings', { rate: 0.1, ship: 40, handOn: true, handRate: 0.05 }));
  run("UPDATE users SET credits=100 WHERE email='s@x.ma'");
  const id = await mk('Sac cuir', 400, 'Témara');
  const r = await B.req('POST', '/api/orders', { itemId: id, handover: 'hand', name: 'Yassine', phone: '0699887766', city: 'Rabat', spot: 'Mega Mall' });
  ok(r);
  const o = (await B.req('GET', '/api/orders/' + r.body.id)).body.order;
  assert.equal(o.commission, 20);
  const wrong = o.handCode === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.equal((await S.req('POST', `/api/orders/${r.body.id}/handover`, { code: wrong })).status, 400);
  assert.equal((await S.req('POST', `/api/orders/${r.body.id}/handover`, { code: o.handCode })).status, 429);
  run('UPDATE orders SET hand_tries=0 WHERE id=?', r.body.id); // l'équipe débloque après vérification
  ok(await S.req('POST', `/api/orders/${r.body.id}/handover`, { code: o.handCode }));
  assert.equal((await B.req('GET', '/api/orders/' + r.body.id)).body.order.payout, 'collected');
  assert.equal((await AD.req('GET', '/api/admin/stats')).body.handOwed, 0);
  ok(await AD.req('POST', '/api/admin/settings', { rate: 0.1, ship: 40, handOn: false, handRate: 0 }));
  assert.equal((await G.req('GET', '/api/config')).body.hand, null);
  const id2 = await mk('Pull laine', 150, 'Rabat');
  assert.equal((await B.req('POST', '/api/orders', { itemId: id2, handover: 'hand', name: 'Yassine', phone: '0699887766', city: 'Rabat' })).status, 400);
  ok(await AD.req('POST', '/api/admin/settings', { rate: 0.1, ship: 40, handOn: true, handRate: 0 }));
});

test('SEO : URL avec slug (301), contenu serveur, JSON-LD Product, catalogue lisible sans JS', async () => {
  const id = await mk('Robe d\'été Zara à fleurs', 180, 'Rabat');
  const r = await G.req('GET', '/article/' + id);
  assert.equal(r.status, 301); assert.equal(r.headers.get('location'), `/article/${id}-robe-d-ete-zara-a-fleurs`);
  const h = (await G.req('GET', `/article/${id}-robe-d-ete-zara-a-fleurs`)).text;
  assert.match(h, /<h1 class="ititle">Robe d&#39;été Zara à fleurs<\/h1>/);
  assert.match(h, /"@type":"Product"/); assert.match(h, /"priceCurrency":"MAD"/); assert.match(h, /"price":180/);
  assert.match(h, /alt="Robe d&#39;été Zara à fleurs Zara taille M d&#39;occasion au Maroc"/);
  assert.match(h, /rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/article\/\d+-robe-d-ete-zara-a-fleurs"/);
  assert.match(h, /rel="manifest"/);
  const cat = (await G.req('GET', '/femmes')).text;
  assert.match(cat, /Vêtements femme d&#39;occasion au Maroc/); assert.match(cat, new RegExp(`/article/${id}-robe-d-ete`));
  assert.match((await G.req('GET', '/')).text, /"@type":"WebSite"/);
  assert.match((await G.req('GET', '/sitemap.xml')).text, new RegExp(`/article/${id}-robe-d-ete-zara-a-fleurs</loc>`));
  const xss = await mk('<script>alert(1)</script> robe', 90, 'Rabat');
  const hx = (await G.req('GET', `/article/${xss}-script-alert-1-script-robe`)).text;
  assert.doesNotMatch(hx, /<script>alert/);
});

test('vues dédoublonnées, pas comptées pour le vendeur ; favoris comptés', async () => {
  const id = await mk('Baskets blanches', 220, 'Rabat');
  await S.req('GET', '/api/items/' + id);
  await B.req('GET', '/api/items/' + id); await B.req('GET', '/api/items/' + id);
  await B2.req('GET', '/api/items/' + id);
  ok(await B.req('PUT', '/api/favs/' + id));
  const it = (await G.req('GET', '/api/items/' + id)).body.item;
  assert.equal(it.views, 2); assert.equal(it.favCount, 1); assert.equal(it.hand, true);
});

test('délai de réponse : affiché seulement avec assez de conversations', async () => {
  assert.equal((await G.req('GET', '/api/items/' + (await mk('Chemise lin', 120, 'Rabat')))).body.sellerStats.respond, null);
  const buyers = [B, B2, new C()];
  ok(await buyers[2].req('POST', '/api/auth/register', { name: 'Nadia', email: 'n@x.ma', password: 'password1', city: 'Rabat', terms: true }));
  for (const [i, X] of buyers.entries()) {
    const id = await mk('Article ' + i, 100 + i, 'Rabat');
    const c = (await X.req('POST', '/api/convos', { itemId: id })).body;
    ok(await X.req('POST', `/api/convos/${c.id}/messages`, { text: 'Toujours dispo ?' }));
    ok(await S.req('POST', `/api/convos/${c.id}/messages`, { text: 'Oui !' }));
  }
  const id = await mk('Dernier', 99, 'Rabat');
  assert.equal((await G.req('GET', '/api/items/' + id)).body.sellerStats.respond, 'Répond en général en moins d\'une heure');
});

test('appli installable : manifest et service worker non mis en cache', async () => {
  const m = await G.req('GET', '/manifest.webmanifest');
  ok(m); assert.equal(m.body.display, 'standalone'); assert.ok(m.body.icons.some((i) => i.sizes === '512x512'));
  const sw = await G.req('GET', '/sw.js');
  ok(sw); assert.equal(sw.headers.get('cache-control'), 'no-cache'); assert.match(sw.text, /api\//);
  ok(await G.req('GET', '/assets/icon-512.png'));
});
