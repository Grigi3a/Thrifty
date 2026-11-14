'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'thrifty-'));
process.env.ADMIN_EMAIL = 'admin@thrifty.ma';
process.env.ADMIN_PASSWORD = 'MotDePasseAdmin1';
const { app, bootstrapAdmin } = require('../server/index.js');

let server, URL;
before(async () => { await bootstrapAdmin(); server = await new Promise((r) => { const s = app.listen(0, () => r(s)); }); URL = 'http://127.0.0.1:' + server.address().port; });
after(() => server.close());

class Client {
  constructor() { this.cookie = ''; }
  async req(method, p, body) {
    const r = await fetch(URL + p, { method, headers: { 'Content-Type': 'application/json', Cookie: this.cookie, Origin: URL }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    let j = null; try { j = await r.json(); } catch { /* not json */ }
    return { status: r.status, body: j };
  }
}
const JPEG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(900, 7)]).toString('base64');
const ok = (r, s = 200) => assert.equal(r.status, s, JSON.stringify(r.body));

const S = new Client(), B = new Client(), B2 = new Client(), AD = new Client();
let itemId, orderId;

test('register + login + validation', async () => {
  ok(await S.req('POST', '/api/auth/register', { name: 'Sara', email: 'sara@x.ma', password: 'password1', city: 'Rabat', terms: true }));
  ok(await B.req('POST', '/api/auth/register', { name: 'Bilal', email: 'bilal@x.ma', password: 'password1', city: 'Fès', terms: true }));
  ok(await B2.req('POST', '/api/auth/register', { name: 'Zineb', email: 'zineb@x.ma', password: 'password1', city: 'Fès', terms: true }));
  ok(await S.req('POST', '/api/auth/register', { name: 'S', email: 'bad', password: 'x', city: 'Rabat' }), 400);
  ok(await new Client().req('POST', '/api/auth/register', { name: 'Sara', email: 'sara@x.ma', password: 'password1', city: 'Rabat', terms: true }), 409);
  ok(await new Client().req('POST', '/api/auth/login', { email: 'sara@x.ma', password: 'nope' }), 401);
  ok(await AD.req('POST', '/api/auth/login', { email: 'admin@thrifty.ma', password: 'MotDePasseAdmin1' }));
  assert.equal((await S.req('GET', '/api/me')).body.user.name, 'Sara');
});

test('cross-origin writes refused', async () => {
  const r = await fetch(URL + '/api/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
});

test('listing with photo upload; publish rules', async () => {
  assert.equal((await new Client().req('POST', '/api/photos', { data: JPEG })).status, 401);
  ok(await S.req('POST', '/api/photos', { data: 'data:image/png;base64,AAAA' }), 400);
  const up = await S.req('POST', '/api/photos', { data: JPEG }); ok(up);
  const f = up.body.file;
  const incomplete = await S.req('POST', '/api/items', { publish: true, univ: 'femmes', cat: 'Robes', title: 'Robe', photos: [f] });
  ok(incomplete, 400);
  const full = { publish: true, univ: 'femmes', cat: 'Robes', title: 'Robe en lin beige', brand: 'Zara', size: 'M', color: 'Beige', cond: 'Très bon état', noDefect: true, desc: 'Très belle robe portée deux fois.', price: 120, city: 'Rabat', decl: true, photos: [f] };
  // another user cannot use Sara's upload
  ok(await B.req('POST', '/api/items', full), 400);
  const r = await S.req('POST', '/api/items', full); ok(r); itemId = r.body.id;
  const pub = await new Client().req('GET', '/api/items?univ=femmes&q=lin'); ok(pub);
  assert.equal(pub.body.total, 1);
  assert.match(pub.body.items[0].photos[0], /^\/uploads\//);
  const img = await fetch(URL + pub.body.items[0].photos[0]); assert.equal(img.status, 200);
  const d = await new Client().req('GET', '/api/items/' + itemId); ok(d); assert.equal(d.body.item.desc, 'Très belle robe portée deux fois.');
});

test('draft is invisible to the public', async () => {
  const r = await S.req('POST', '/api/items', { univ: 'hommes', cat: 'Chemises', title: 'Brouillon chemise' }); ok(r);
  assert.equal((await new Client().req('GET', '/api/items/' + r.body.id)).status, 404);
  ok(await S.req('DELETE', '/api/items/' + r.body.id));
});

test('offers, accept, price pulled at checkout', async () => {
  const c = await B.req('POST', '/api/convos', { itemId }); ok(c);
  ok(await B.req('POST', `/api/convos/${c.body.id}/offers`, { amount: 120 }), 400); // not below price
  ok(await B.req('POST', `/api/convos/${c.body.id}/offers`, { amount: 100 }));
  const conv = await S.req('GET', '/api/convos/' + c.body.id); ok(conv);
  const offer = conv.body.messages.find((m) => m.type === 'offer');
  ok(await B.req('POST', `/api/offers/${offer.id}/accept`), 400); // own offer
  ok(await B2.req('POST', `/api/offers/${offer.id}/accept`), 404); // stranger
  ok(await S.req('POST', `/api/offers/${offer.id}/accept`));
  assert.equal((await B.req('GET', '/api/convos/' + c.body.id)).body.convo.agreed, 100);
});

test('order flow, double sale, privacy, payout', async () => {
  const ship = { itemId, name: 'Bilal A.', address: '12 rue des Fleurs', city: 'Fès', phone: '0612345678', paymentMethod: 'cod' };
  ok(await S.req('POST', '/api/orders', ship), 400); // own item
  ok(await B.req('POST', '/api/orders', { ...ship, paymentMethod: 'card' }), 400);
  const [o1, o2] = await Promise.all([B.req('POST', '/api/orders', ship), B2.req('POST', '/api/orders', ship)]);
  assert.deepEqual([o1.status, o2.status].sort(), [200, 409]);
  const winner = o1.status === 200 ? o1 : o2, W = o1.status === 200 ? B : B2, loser = o1.status === 200 ? B2 : B;
  orderId = winner.body.id;
  let o = (await W.req('GET', '/api/orders/' + orderId)).body.order;
  const expectedPrice = W === B ? 100 : 120;
  assert.equal(o.price, expectedPrice); assert.equal(o.commission, expectedPrice * 0.1); assert.equal(o.net, expectedPrice * 0.9); assert.equal(o.total, expectedPrice + 25);
  assert.equal(o.status, 'to_ship'); assert.equal(o.address, '12 rue des Fleurs');
  assert.equal((await loser.req('GET', '/api/orders/' + orderId)).status, 404);
  // seller sees address (needs it), cannot confirm
  assert.equal((await S.req('GET', '/api/orders/' + orderId)).body.order.address, '12 rue des Fleurs');
  ok(await S.req('POST', `/api/orders/${orderId}/confirm`), 409);
  ok(await W.req('POST', `/api/orders/${orderId}/ship`), 409); // buyer cannot ship
  ok(await S.req('POST', `/api/orders/${orderId}/ship`, { tracking: 'AB123' }));
  ok(await S.req('POST', `/api/admin/orders/${orderId}/deliver`), 403);
  ok(await AD.req('POST', `/api/admin/orders/${orderId}/deliver`));
  ok(await W.req('POST', `/api/orders/${orderId}/confirm`));
  ok(await W.req('POST', `/api/orders/${orderId}/review`, { rating: 5, text: 'Parfait' }));
  ok(await W.req('POST', `/api/orders/${orderId}/review`, { rating: 5 }), 409);
  const stats = (await AD.req('GET', '/api/admin/stats')).body;
  assert.equal(stats.comConfirmed, expectedPrice * 0.1); assert.equal(stats.due, expectedPrice * 0.9);
  ok(await AD.req('POST', `/api/admin/orders/${orderId}/pay`, { reference: 'VIR-1' }));
  assert.equal((await S.req('GET', '/api/orders?role=seller')).body.payout.paid, expectedPrice * 0.9);
  assert.equal((await new Client().req('GET', '/api/sellers/' + (await S.req('GET', '/api/me')).body.user.id)).body.stats.avg, 5);
  const csv = await fetch(URL + '/api/admin/export/orders.csv', { headers: { Cookie: AD.cookie } }); assert.equal(csv.status, 200); assert.match(await csv.text(), /T1001/);
  assert.equal((await fetch(URL + '/api/admin/export/orders.csv', { headers: { Cookie: S.cookie } })).status, 403);
});

test('dispute and refund path + cancel republish', async () => {
  const up = (await S.req('POST', '/api/photos', { data: JPEG })).body.file;
  const mk = async (t) => (await S.req('POST', '/api/items', { publish: true, univ: 'hommes', cat: 'Chemises', title: t, brand: 'Sans marque', size: 'L', color: 'Bleu', cond: 'Bon état', noDefect: true, desc: 'Chemise en bon état général.', price: 80, city: 'Rabat', decl: true, photos: [up] })).body.id;
  const i2 = await mk('Chemise bleue');
  const ship = { itemId: i2, name: 'Bilal', address: '12 rue des Fleurs', city: 'Fès', phone: '0612345678' };
  const o = (await B.req('POST', '/api/orders', ship)).body.id;
  ok(await S.req('POST', `/api/orders/${o}/ship`, {}));
  ok(await B.req('POST', `/api/orders/${o}/issue`, { reason: 'Mauvais article', text: 'Ce n\'est pas la bonne chemise' }));
  assert.equal((await B.req('GET', '/api/orders/' + o)).body.order.payout, 'suspended');
  ok(await AD.req('POST', `/api/admin/orders/${o}/refund`));
  const od = (await B.req('GET', '/api/orders/' + o)).body.order; assert.equal(od.status, 'refunded'); assert.equal(od.payout, 'cancelled');
  const i3 = await mk('Chemise verte');
  const o3 = (await B.req('POST', '/api/orders', { ...ship, itemId: i3 })).body.id;
  ok(await S.req('POST', `/api/orders/${o3}/cancel`));
  assert.equal((await new Client().req('GET', '/api/items/' + i3)).body.item.status, 'published');
});

test('price drop notifies favourites; ban hides listings; reset password', async () => {
  const up = (await S.req('POST', '/api/photos', { data: JPEG })).body.file;
  const id = (await S.req('POST', '/api/items', { publish: true, univ: 'enfants', cat: 'Pantalons', title: 'Jean enfant', brand: 'Sans marque', size: '4-5 ans', color: 'Denim', cond: 'Bon état', noDefect: true, desc: 'Jean enfant très solide.', price: 60, city: 'Rabat', decl: true, photos: [up] })).body.id;
  ok(await B2.req('PUT', '/api/favs/' + id));
  ok(await S.req('POST', `/api/items/${id}/price`, { price: 70 }), 400);
  ok(await S.req('POST', `/api/items/${id}/price`, { price: 45 }));
  const n = (await B2.req('GET', '/api/notifs')).body.notifs; assert.ok(n.some((x) => /Prix baissé/.test(x.text)));
  const d = (await new Client().req('GET', '/api/items/' + id)).body.item; assert.equal(d.oldPrice, 60);
  const sid = (await S.req('GET', '/api/me')).body.user.id;
  ok(await AD.req('POST', `/api/admin/users/${sid}/ban`));
  assert.equal((await new Client().req('GET', '/api/items/' + id)).status, 404);
  assert.equal((await S.req('GET', '/api/me')).body.user, null);
  ok(await AD.req('POST', `/api/admin/users/${sid}/unban`));
  ok(await new Client().req('POST', '/api/auth/forgot', { email: 'nobody@x.ma' })); // no enumeration
});

test('seo + sitemap + fallback', async () => {
  const h = await (await fetch(URL + '/article/' + itemId)).text(); assert.match(h, /og:title/); assert.match(h, /Robe en lin beige/);
  assert.match(await (await fetch(URL + '/sitemap.xml')).text(), /\/article\//);
  assert.equal((await fetch(URL + '/femmes')).status, 200);
});
