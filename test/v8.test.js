'use strict';
/* v8 : crédits vendeur, recharges validées par l'admin, frais main propre prélevés sur les crédits, options payantes. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'thrifty-v8-'));
process.env.ADMIN_EMAIL = 'admin@thrifty.ma';
process.env.ADMIN_PASSWORD = 'MotDePasseAdmin1';
delete process.env.BASE_URL;
const { app, bootstrapAdmin } = require('../server/index.js');
const { run, get } = require('../server/db.js');
let server, URL;
before(async () => { await bootstrapAdmin(); server = await new Promise((r) => { const s = app.listen(0, () => r(s)); }); URL = 'http://127.0.0.1:' + server.address().port; });
after(() => server.close());
let ipn = 0;
class C {
  constructor() { this.cookie = ''; this.ip = '10.8.0.' + (++ipn); }
  async req(method, p, body) {
    const r = await fetch(URL + p, { method, headers: { 'Content-Type': 'application/json', Cookie: this.cookie, Origin: URL, 'CF-Connecting-IP': this.ip }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    let j = null; try { j = await r.json(); } catch { /* vide */ }
    return { status: r.status, body: j };
  }
}
const ok = (r, s = 200) => assert.equal(r.status, s, JSON.stringify(r.body));
const JPEG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(900, 7)]).toString('base64');
const S = new C(), S2 = new C(), B = new C(), AD = new C(), G = new C();
const mk = async (who, title, price, city) => {
  const up = await who.req('POST', '/api/photos', { data: JPEG });
  const r = await who.req('POST', '/api/items', { publish: true, univ: 'femmes', cat: 'Robes', title, brand: 'Zara', size: 'M', color: 'Beige', cond: 'Très bon état', noDefect: true, desc: 'Belle pièce portée deux fois.', price, city, pack: 'Moyen', decl: true, photos: [up.body.file] });
  ok(r); return r.body.id;
};
const hand = (id) => B.req('POST', '/api/orders', { itemId: id, handover: 'hand', name: 'Yassine', phone: '0699887766', city: 'Rabat', spot: 'Mega Mall' });
const bal = async (who) => (await who.req('GET', '/api/credits')).body.balance;
const sid = () => get("SELECT id FROM users WHERE email='s@x.ma'").id;

test('setup', async () => {
  ok(await S.req('POST', '/api/auth/register', { name: 'Salma', email: 's@x.ma', password: 'password1', city: 'Salé', phone: '0611223344', terms: true }));
  ok(await S2.req('POST', '/api/auth/register', { name: 'Hind', email: 'h@x.ma', password: 'password1', city: 'Rabat', terms: true }));
  ok(await B.req('POST', '/api/auth/register', { name: 'Yassine', email: 'b@x.ma', password: 'password1', city: 'Rabat', phone: '0699887766', terms: true }));
  ok(await AD.req('POST', '/api/auth/login', { email: 'admin@thrifty.ma', password: 'MotDePasseAdmin1' }));
  const cfg = (await G.req('GET', '/api/config')).body;
  assert.equal(cfg.hand.rate, 0.05); assert.equal(cfg.hand.min, 5); assert.deepEqual([cfg.credits.bump, cfg.credits.feature, cfg.credits.featureDays], [5, 20, 7]);
});

test('frais main propre : 5 %, minimum 5 DH, prélevés à la commande, découvert limité à 30 DH', async () => {
  assert.equal(await bal(S), 0);
  const small = await mk(S, 'Top lin', 60, 'Salé');
  const o1 = await hand(small); ok(o1);
  assert.equal((await S.req('GET', '/api/orders/' + o1.body.id)).body.order.commission, 5); // minimum
  assert.equal(await bal(S), -5);
  const big = await mk(S, 'Manteau laine', 500, 'Rabat');
  const o2 = await hand(big); ok(o2);
  assert.equal(await bal(S), -30); // 25 DH (5 %) → -30, encore toléré
  const third = await mk(S, 'Jupe plissée', 200, 'Témara');
  assert.equal((await G.req('GET', '/api/items/' + third)).body.item.hand, false); // la main propre n'est plus proposée
  const refused = await hand(third);
  assert.equal(refused.status, 409); assert.match(refused.body.message, /livraison/);
  assert.ok(get("SELECT 1 x FROM notifs WHERE user_id=? AND text LIKE '%solde de crédits est trop bas%'", sid())); // le vendeur est prévenu
  assert.equal((await G.req('GET', '/api/items/' + third)).body.item.status, 'published'); // rien n'a été vendu
  ok(await B.req('POST', '/api/orders', { itemId: third, name: 'Yassine', phone: '0699887766', address: '12 rue Fès', city: 'Rabat' })); // la livraison reste possible
  // Annulation : frais remboursés, une seule fois
  ok(await S.req('POST', `/api/orders/${o2.body.id}/cancel`, {}));
  assert.equal(await bal(S), -5);
  assert.equal((await S.req('POST', `/api/orders/${o2.body.id}/cancel`, {})).status, 409);
  assert.equal(await bal(S), -5);
  const h = (await S.req('GET', '/api/credits')).body.tx.map((t) => t.kind);
  assert.deepEqual(h.slice(0, 3), ['hand_refund', 'hand_fee', 'hand_fee']);
});

test('recharges : validation, contrôle admin, pas de double crédit', async () => {
  assert.equal((await S.req('POST', '/api/credits/topup', { amount: 10, method: 'virement', reference: 'ABC123' })).status, 400);
  assert.equal((await S.req('POST', '/api/credits/topup', { amount: 100, method: 'virement', reference: '' })).status, 400);
  assert.equal((await S.req('POST', '/api/credits/topup', { amount: 100, method: 'bitcoin', reference: 'x123' })).status, 400);
  const t1 = await S.req('POST', '/api/credits/topup', { amount: 100, method: 'cashplus', reference: 'CP-778812' }); ok(t1);
  const t2 = await S.req('POST', '/api/credits/topup', { amount: 50, method: 'especes' }); ok(t2);
  assert.equal(await bal(S), -5); // rien tant que l'admin n'a pas vu l'argent
  assert.equal((await S.req('POST', `/api/admin/topups/${t1.body.id}/approve`, {})).status, 403);
  const ac = (await AD.req('GET', '/api/admin/credits')).body;
  assert.equal(ac.stats.pendingTopups, 2); assert.equal(ac.topups[0].status, 'pending');
  ok(await AD.req('POST', `/api/admin/topups/${t1.body.id}/approve`, {}));
  assert.equal((await AD.req('POST', `/api/admin/topups/${t1.body.id}/approve`, {})).status, 409);
  ok(await AD.req('POST', `/api/admin/topups/${t2.body.id}/reject`, { note: 'Pas reçu' }));
  assert.equal(await bal(S), 95);
  const mine = (await S.req('GET', '/api/credits')).body.topups;
  assert.deepEqual(mine.map((t) => t.status).sort(), ['approved', 'rejected']);
});

test('remonter une annonce : payant, une fois par 24 h, repasse en tête', async () => {
  const old = await mk(S, 'Chemise ancienne', 150, 'Casablanca');
  run('UPDATE items SET created=?, published_at=? WHERE id=?', Date.now() - 3 * 864e5, Date.now() - 3 * 864e5, old);
  await mk(S2, 'Pièce récente', 90, 'Fès');
  assert.notEqual((await G.req('GET', '/api/items?per=48')).body.items[0].id, old);
  ok(await S.req('POST', `/api/items/${old}/bump`, {}));
  assert.equal(await bal(S), 90);
  assert.equal((await G.req('GET', '/api/items?per=48')).body.items[0].id, old);
  const again = await S.req('POST', `/api/items/${old}/bump`, {});
  assert.equal(again.status, 409); assert.equal(await bal(S), 90);
  const fresh = await mk(S, 'Toute neuve', 80, 'Fès');
  assert.equal((await S.req('POST', `/api/items/${fresh}/bump`, {})).status, 409); // déjà en tête : pas de paiement inutile
});

test('à la une : 7 jours en tête, badge, solde insuffisant refusé, pas sur l\'annonce d\'un autre', async () => {
  const id = await mk(S, 'Robe soirée', 400, 'Casablanca');
  run('UPDATE items SET created=? WHERE id=?', Date.now() - 10 * 864e5, id);
  await mk(S2, 'Encore plus récente', 70, 'Fès');
  const r = await S.req('POST', `/api/items/${id}/feature`, {}); ok(r);
  assert.equal(r.body.balance, 70);
  assert.ok(r.body.until > Date.now() + 6.9 * 864e5);
  const first = (await G.req('GET', '/api/items?per=48')).body.items[0];
  assert.equal(first.id, id); assert.equal(first.featured, true);
  const asc = (await G.req('GET', '/api/items?per=48&sort=asc')).body.items;
  assert.notEqual(asc[0].id, id); // le tri par prix n'est pas faussé
  const other = await mk(S2, 'Sac Hind', 120, 'Rabat');
  assert.equal((await S.req('POST', `/api/items/${other}/feature`, {})).status, 403);
  assert.equal((await S2.req('POST', `/api/items/${other}/feature`, {})).status, 402); // solde 0
  run("UPDATE users SET credits=-10 WHERE email='h@x.ma'");
  assert.equal((await S2.req('POST', `/api/items/${other}/bump`, {})).status, 409); // < 24 h
  run('UPDATE items SET created=?, published_at=? WHERE id=?', Date.now() - 2 * 864e5, Date.now() - 2 * 864e5, other);
  assert.equal((await S2.req('POST', `/api/items/${other}/bump`, {})).status, 402); // pas de dette pour les options
});

test('admin : ajustement manuel, réglages des prix, statistiques de revenus', async () => {
  const hid = get("SELECT id FROM users WHERE email='h@x.ma'").id;
  assert.equal((await AD.req('POST', '/api/admin/credits/adjust', { userId: hid, amount: 30, note: '' })).status, 400);
  ok(await AD.req('POST', '/api/admin/credits/adjust', { userId: hid, amount: 30, note: 'Crédits de bienvenue' }));
  assert.equal(await bal(S2), 20);
  ok(await AD.req('POST', '/api/admin/credit-settings', { bump: 3, feature: 15, featureDays: 5, payName: 'Thrifty SARL', payRib: '007 780 0001234567890123 45', payCashplus: 'Thrifty · 0600000000', payNote: '' }));
  const cfg = (await G.req('GET', '/api/config')).body.credits;
  assert.deepEqual([cfg.bump, cfg.feature, cfg.featureDays], [3, 15, 5]);
  assert.equal((await S.req('GET', '/api/credits')).body.pay.name, 'Thrifty SARL');
  const st = (await AD.req('GET', '/api/admin/stats')).body.credits;
  assert.equal(st.creditsSold, 100); assert.equal(st.optionsSold, 25); assert.equal(st.handFees, 5); assert.equal(st.debt, 0);
  ok(await AD.req('POST', '/api/admin/settings', { rate: 0.1, ship: 25, handOn: true, handRate: 0, handMin: 5, creditLimit: 0 }));
  const free = await mk(S2, 'Gratuit', 100, 'Rabat');
  run("UPDATE users SET credits=0 WHERE email='h@x.ma'");
  assert.equal((await G.req('GET', '/api/items/' + free)).body.item.hand, true); // 0 % = gratuit, même sans crédits
  const o = await hand(free); ok(o);
  assert.equal((await B.req('GET', '/api/orders/' + o.body.id)).body.order.commission, 0);
  assert.equal(await bal(S2), 0);
});
