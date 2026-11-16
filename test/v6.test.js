'use strict';
/* Correctifs v6 : domaine canonique, vraie IP derrière proxy, lien de réinitialisation admin, alerte de configuration. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'thrifty-v6-'));
process.env.ADMIN_EMAIL = 'admin@thrifty.ma';
process.env.ADMIN_PASSWORD = 'MotDePasseAdmin1';
process.env.BASE_URL = 'https://thrifty-shop.store';
delete process.env.SMTP_URL;
const { app, bootstrapAdmin } = require('../server/index.js');
let server, URL, PORT;
before(async () => { await bootstrapAdmin(); server = await new Promise((r) => { const s = app.listen(0, () => r(s)); }); PORT = server.address().port; URL = 'http://127.0.0.1:' + PORT; });
after(() => server.close());

const raw = (p, headers = {}, method = 'GET', body) => new Promise((res, rej) => {
  const rq = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: { 'Content-Type': 'application/json', ...headers } }, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: d })); });
  rq.on('error', rej); if (body) rq.write(JSON.stringify(body)); rq.end();
});
class C {
  constructor() { this.cookie = ''; }
  async req(method, p, body, extra = {}) {
    const r = await fetch(URL + p, { method, headers: { 'Content-Type': 'application/json', Cookie: this.cookie, Origin: URL, ...extra }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    let j = null; try { j = await r.json(); } catch { /* */ }
    return { status: r.status, body: j };
  }
}
const ok = (r, s = 200) => assert.equal(r.status, s, JSON.stringify(r.body));

test('domaine technique et www redirigés en 301 vers BASE_URL, healthz épargné', async () => {
  const r = await raw('/article/3?x=1', { Host: 'thrifty-fdd8.onrender.com' });
  assert.equal(r.status, 301); assert.equal(r.headers.location, 'https://thrifty-shop.store/article/3?x=1');
  assert.equal((await raw('/', { Host: 'www.thrifty-shop.store' })).headers.location, 'https://thrifty-shop.store/');
  assert.equal((await raw('/healthz', { Host: 'thrifty-fdd8.onrender.com' })).status, 200);
  assert.equal((await raw('/', { Host: 'thrifty-shop.store' })).status, 200);
});

test('canonical, sitemap, robots utilisent le vrai domaine', async () => {
  const h = (await raw('/', { Host: 'thrifty-shop.store' })).body;
  assert.match(h, /<link rel="canonical" href="https:\/\/thrifty-shop\.store\/">/);
  assert.doesNotMatch(h, /onrender/);
  assert.match((await raw('/sitemap.xml', { Host: 'thrifty-shop.store' })).body, /<loc>https:\/\/thrifty-shop\.store\/femmes<\/loc>/);
  assert.match((await raw('/robots.txt', { Host: 'thrifty-shop.store' })).body, /Sitemap: https:\/\/thrifty-shop\.store\/sitemap\.xml/);
});

test('article inexistant : 404 + noindex', async () => {
  const r = await raw('/article/99999', { Host: 'thrifty-shop.store' });
  assert.equal(r.status, 404); assert.match(r.body, /noindex/);
});

test('limite d\'inscriptions par visiteur (CF-Connecting-IP), pas globale', async () => {
  for (let i = 0; i < 10; i++) ok(await new C().req('POST', '/api/auth/register', { name: 'User' + i, email: `u${i}@x.ma`, password: 'password1', city: 'Rabat', terms: true }, { 'CF-Connecting-IP': '10.0.0.' + i }));
  const same = [];
  for (let i = 0; i < 9; i++) same.push((await new C().req('POST', '/api/auth/register', { name: 'Same' + i, email: `same${i}@x.ma`, password: 'password1', city: 'Rabat', terms: true }, { 'CF-Connecting-IP': '10.9.9.9' })).status);
  assert.deepEqual(same.slice(0, 8), Array(8).fill(200)); assert.equal(same[8], 429);
});

test('lien de réinitialisation généré par l\'admin, refusé aux membres', async () => {
  const U = new C(), AD = new C();
  ok(await U.req('POST', '/api/auth/register', { name: 'Nora', email: 'nora@x.ma', password: 'password1', city: 'Rabat', phone: '0612345678', terms: true }, { 'CF-Connecting-IP': '10.1.1.1' }));
  const me = (await U.req('GET', '/api/me')).body.user;
  assert.equal((await U.req('POST', `/api/admin/users/${me.id}/reset-link`, {})).status, 403);
  ok(await AD.req('POST', '/api/auth/login', { email: 'admin@thrifty.ma', password: 'MotDePasseAdmin1' }, { 'CF-Connecting-IP': '10.2.2.2' }));
  const r = await AD.req('POST', `/api/admin/users/${me.id}/reset-link`, {});
  ok(r); assert.match(r.body.url, /^https:\/\/thrifty-shop\.store\/reinitialiser\?token=[a-f0-9]{64}$/); assert.equal(r.body.phone, '0612345678');
  const token = r.body.url.split('token=')[1];
  ok(await new C().req('POST', '/api/auth/reset', { token, password: 'nouveauMDP9' }, { 'CF-Connecting-IP': '10.3.3.3' }));
  assert.equal((await new C().req('POST', '/api/auth/reset', { token, password: 'encoreAutre9' }, { 'CF-Connecting-IP': '10.3.3.4' })).status, 400); // usage unique
  ok(await new C().req('POST', '/api/auth/login', { email: 'nora@x.ma', password: 'nouveauMDP9' }, { 'CF-Connecting-IP': '10.4.4.4' }));
  const stats = (await AD.req('GET', '/api/admin/stats')).body;
  assert.ok(stats.setup.some((x) => x.k === 'SMTP_URL'));
  assert.ok(stats.setup.some((x) => x.k.includes('COMPANY_NAME')));
  assert.ok(!stats.setup.some((x) => x.t.startsWith('Adresse publique')));
});
