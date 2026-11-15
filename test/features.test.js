'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'thrifty-f-'));
process.env.ADMIN_EMAIL = 'admin@thrifty.ma';
process.env.ADMIN_PASSWORD = 'MotDePasseAdmin1';
const { app, bootstrapAdmin } = require('../server/index.js');
let server, URL;
before(async () => { await bootstrapAdmin(); server = await new Promise((r) => { const s = app.listen(0, () => r(s)); }); URL = 'http://127.0.0.1:' + server.address().port; });
after(() => server.close());
class C {
  constructor() { this.cookie = ''; }
  async req(method, p, body) {
    const r = await fetch(URL + p, { method, headers: { 'Content-Type': 'application/json', Cookie: this.cookie, Origin: URL }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    let j = null; try { j = await r.json(); } catch { /* */ }
    return { status: r.status, body: j };
  }
}
const JPEG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(900, 7)]).toString('base64');
const ok = (r, s = 200) => assert.equal(r.status, s, JSON.stringify(r.body));
const S = new C(), B = new C(), B2 = new C(), AD = new C(), G = new C();
const ids = [];
const mkItem = async (title, price, extra = {}) => {
  const up = await S.req('POST', '/api/photos', { data: JPEG });
  const r = await S.req('POST', '/api/items', { publish: true, univ: 'femmes', cat: 'Robes', title, brand: 'Zara', size: 'M', color: 'Beige', cond: 'Très bon état', noDefect: true, desc: 'Belle pièce portée deux fois.', price, city: 'Rabat', pack: 'Moyen', decl: true, photos: [up.body.file], ...extra });
  ok(r); ids.push(r.body.id); return r.body.id;
};
const addr = { name: 'Bilal', address: '12 rue des Fleurs', city: 'Fès', phone: '0612345678' };

test('setup', async () => {
  ok(await S.req('POST', '/api/auth/register', { name: 'Sara', email: 's@x.ma', password: 'password1', city: 'Rabat', terms: true }));
  ok(await B.req('POST', '/api/auth/register', { name: 'Bilal', email: 'b@x.ma', password: 'password1', city: 'Fès', terms: true }));
  ok(await B2.req('POST', '/api/auth/register', { name: 'Zineb', email: 'z@x.ma', password: 'password1', city: 'Fès', terms: true }));
  ok(await AD.req('POST', '/api/auth/login', { email: 'admin@thrifty.ma', password: 'MotDePasseAdmin1' }));
});

test('aucune donnée fictive : tout est vide au départ', async () => {
  assert.equal((await G.req('GET', '/api/collections')).body.collections.length, 0);
  const cfg = (await G.req('GET', '/api/config')).body;
  assert.equal(cfg.drops, false); assert.equal(cfg.launch, null);
  assert.equal(cfg.rate, cfg.baseRate);
});

test('mesures : validation + sortie, ancienne annonce sans mesures OK', async () => {
  const bad = await S.req('POST', '/api/items', { publish: false, univ: 'femmes', cat: 'Robes', title: 'Robe test', measures: { poitrine: 'abc' } });
  ok(bad, 400);
  const a = await mkItem('Robe lin', 100, { fit: 'normal', measures: { poitrine: 48.5, longueur: 95 } });
  const it = (await G.req('GET', '/api/items/' + a)).body.item;
  assert.equal(it.fit, 'normal'); assert.ok(it.measures.length >= 1);
  const old = await mkItem('Robe simple', 80);
  assert.deepEqual((await G.req('GET', '/api/items/' + old)).body.item.measures, []);
});

test('collections : admin only, visible seulement si disponible, cachée sinon', async () => {
  ok(await S.req('POST', '/api/admin/collections', { title: 'Drop été', items: [ids[0]] }), 403);
  const r = await AD.req('POST', '/api/admin/collections', { title: 'Drop été', desc: 'Sélection', items: [ids[0], ids[1]] }); ok(r);
  const list = (await G.req('GET', '/api/collections')).body.collections; assert.equal(list.length, 1);
  assert.equal((await G.req('GET', '/api/config')).body.drops, true);
  ok(await G.req('GET', '/api/collections/' + r.body.slug));
  // collection vide → cachée
  const e = await AD.req('POST', '/api/admin/collections', { title: 'Vide', items: [] }); ok(e);
  ok(await G.req('GET', '/api/collections/' + e.body.slug), 404);
});

test('profil vendeur : stats réelles, pas de badge', async () => {
  const p = (await G.req('GET', '/api/sellers/' + (await S.req('GET', '/api/me')).body.user.id)).body;
  assert.equal(p.stats.sales, 0); assert.equal(p.stats.reviews, 0); assert.equal(p.reviews.length, 0);
  assert.equal(p.seller.emailVerified, false);
});

test('lot : prix, achat groupé, pas de double vente', async () => {
  const x = await mkItem('Jean', 100), y = await mkItem('Pull', 60);
  ok(await B.req('POST', '/api/bundles', { title: 'Lot', price: 120, items: [x, y] }), 401 === 0 ? 0 : 400); // B ne peut pas regrouper les annonces d'autrui
  ok(await S.req('POST', '/api/bundles', { title: 'Lot', price: 160, items: [x, y] }), 400); // pas moins cher
  const b = await S.req('POST', '/api/bundles', { title: 'Lot hiver', price: 140, items: [x, y] }); ok(b);
  const pub = (await G.req('GET', '/api/bundles/' + b.body.id)).body.bundle;
  assert.equal(pub.saving, 20); assert.equal(pub.available, true);
  ok(await S.req('POST', `/api/bundles/${b.body.id}/order`, addr), 400); // propre lot
  const o = await B.req('POST', `/api/bundles/${b.body.id}/order`, addr); ok(o);
  assert.equal((await B2.req('POST', `/api/bundles/${b.body.id}/order`, addr)).status, 409);
  assert.equal((await B2.req('POST', '/api/orders', { ...addr, itemId: x })).status, 409);
  const orders = (await B.req('GET', '/api/orders')).body.orders.filter((q) => q.bundleTitle === 'Lot hiver');
  assert.equal(orders.length, 2);
  assert.equal(orders.reduce((s, q) => s + q.price, 0), 140);
  assert.equal(orders.filter((q) => q.ship > 0).length, 1); // livraison facturée une seule fois
  assert.equal((await G.req('GET', '/api/bundles/' + b.body.id)).body.bundle.available, false);
  // l'expédition s'applique à tout le colis
  ok(await S.req('POST', `/api/orders/${o.body.id}/ship`, { tracking: 'XY1' }));
  const after = (await B.req('GET', '/api/orders')).body.orders.filter((q) => q.bundleTitle === 'Lot hiver');
  assert.ok(after.every((q) => q.status === 'shipping'));
});

test('lot : une pièce vendue séparément le rend indisponible', async () => {
  const x = await mkItem('Veste', 90), y = await mkItem('Jupe', 50);
  const b = await S.req('POST', '/api/bundles', { title: 'Lot 2', price: 120, items: [x, y] }); ok(b);
  ok(await B2.req('POST', '/api/orders', { ...addr, itemId: x }));
  assert.equal((await G.req('GET', '/api/bundles/' + b.body.id)).body.bundle.available, false);
  assert.equal((await B.req('POST', `/api/bundles/${b.body.id}/order`, addr)).status, 409);
});

test('signalement + traitement admin', async () => {
  const tgt = await mkItem('Robe signalée', 55);
  ok(await G.req('POST', '/api/report', { type: 'item', id: tgt, reason: 'Contrefaçon' }), 401);
  ok(await B.req('POST', '/api/report', { type: 'item', id: tgt, reason: 'Contrefaçon' }));
  const rep = (await AD.req('GET', '/api/admin/reports')).body.reports; assert.equal(rep.length, 1);
  ok(await B.req('GET', '/api/admin/reports'), 403);
  ok(await AD.req('POST', `/api/admin/reports/${rep[0].id}/hide`));
  assert.equal((await G.req('GET', '/api/items/' + tgt)).status, 404);
});

test('recherches sauvegardées + alerte unique', async () => {
  ok(await B.req('POST', '/api/searches', { name: 'x', params: {} }), 400);
  const s = await B.req('POST', '/api/searches', { name: 'Robes Rabat', params: { cat: 'Robes', zone: 'rabat' } }); ok(s);
  ok(await B2.req('DELETE', '/api/searches/' + s.body.id), 404);
  await new Promise((r) => setTimeout(r, 5));
  await mkItem('Robe rouge', 70);
  require('../server/db').run('UPDATE saved_searches SET last_checked=last_checked-3600000');
  await app.runAlerts(); await app.runAlerts();
  const n = (await B.req('GET', '/api/notifs')).body;
  const hits = (n.notifs || n.items || []).filter((x) => /Robes Rabat/.test(x.text));
  assert.equal(hits.length, 1);
});

test('offre de lancement : désactivée par défaut, strictement bornée', async () => {
  const cur = (await AD.req('GET', '/api/admin/settings')).body; assert.equal(cur.launch.on, false);
  ok(await AD.req('POST', '/api/admin/settings', { rate: 0.1, ship: 40, launch: { on: true, rate: 0, start: 0, end: 0 } }), 400);
  const t = Date.now();
  ok(await AD.req('POST', '/api/admin/settings', { rate: 0.1, ship: 40, launch: { on: true, rate: 0, start: t - 1000, end: t + 864e5 } }));
  const cfg = (await G.req('GET', '/api/config')).body; assert.equal(cfg.rate, 0); assert.equal(cfg.baseRate, 0.1); assert.ok(cfg.launch.active);
  ok(await AD.req('POST', '/api/admin/settings', { rate: 0.1, ship: 40, launch: { on: false, rate: 0, start: t, end: t + 1 } }));
  assert.equal((await G.req('GET', '/api/config')).body.rate, 0.1);
});
