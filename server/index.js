'use strict';
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { get, all, run, tx, getSetting, setSetting, UPLOAD_DIR, DATA_DIR } = require('./db');
const L = require('./lib');
const SH = require('../public/shared.js');
const payments = require('./payments');
const { HttpError, bad } = L;

const PUBLIC = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 3000;
const COOKIE = 'tsid';
const SESSION_MS = 30 * 864e5;
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);

/* ---------- helpers ---------- */
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const now = () => Date.now();
const rate = () => { const r = parseFloat(getSetting('rate', process.env.DEFAULT_COMMISSION_RATE || '0.10')); return Number.isFinite(r) ? r : 0.1; };
const shipFee = () => { const s = parseInt(getSetting('ship', process.env.DEFAULT_SHIPPING || '25'), 10); return Number.isFinite(s) ? s : 25; };
const money = (price) => { const r = rate(), s = shipFee(), c = Math.round(price * r * 100) / 100; return { price, ship: s, total: price + s, rate: r, commission: c, net: Math.round((price - c) * 100) / 100 }; };
const base = (req) => (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const notify = (userId, text, link) => run('INSERT INTO notifs(user_id,text,link,ts) VALUES(?,?,?,?)', userId, text, link || '', now());
const notifyAdmins = (text, link) => all("SELECT id FROM users WHERE role='admin' AND banned=0").forEach((a) => notify(a.id, text, link));
const evt = (orderId, text) => run('INSERT INTO order_events(order_id,text,ts) VALUES(?,?,?)', orderId, text, now());
const code = (id) => 'T' + (1000 + id);
const dh = (n) => `${Math.round(n * 100) / 100} DH`;
const idParam = (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'Introuvable.'); return n; };

function cookies(req) {
  const o = {};
  (req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) { try { o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch { /* ignore */ } } });
  return o;
}
function setSession(req, res, userId) {
  const t = L.token();
  run('INSERT INTO sessions(token_hash,user_id,created,expires) VALUES(?,?,?,?)', L.sha(t), userId, now(), now() + SESSION_MS);
  const secure = req.secure || process.env.COOKIE_SECURE === '1';
  res.setHeader('Set-Cookie', `${COOKIE}=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`);
}
const clearCookie = (res) => res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);

/* ---------- global middleware ---------- */
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  });
  if (process.env.NODE_ENV === 'production' && process.env.FORCE_HTTPS === '1') res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});
app.get('/healthz', (req, res) => { get('SELECT 1 AS ok'); res.json({ ok: true }); });
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny' }));
app.use(express.static(PUBLIC, { index: false, maxAge: '10m' }));

app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const o = req.get('origin');
  if (o) { try { if (new URL(o).host !== req.get('host')) return res.status(403).json({ error: 'origin', message: 'Origine refusée.' }); } catch { return res.status(403).json({ error: 'origin', message: 'Origine refusée.' }); } }
  next();
});
app.use('/api/photos', express.json({ limit: '3mb' }));
app.use('/api', express.json({ limit: '64kb' }));
app.use('/api', L.rateLimit('api', 600, 60000));
app.use('/api', (req, res, next) => {
  req.user = null;
  const t = cookies(req)[COOKIE];
  if (t) {
    const u = get('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND u.banned=0 AND u.deleted=0', L.sha(t), now());
    if (u) req.user = u;
  }
  next();
});
const needUser = (req, res, next) => (req.user ? next() : next(new HttpError(401, 'Connectez-vous pour continuer.')));
const needAdmin = (req, res, next) => (req.user && req.user.role === 'admin' ? next() : next(new HttpError(403, 'Accès réservé à l\'administration.')));
const publicUser = (u) => (u ? { id: u.id, name: u.name, email: u.email, city: u.city, phone: u.phone, role: u.role } : null);

/* ---------- config ---------- */
app.get('/api/config', (req, res) => {
  res.json({
    rate: rate(), ship: shipFee(), paymentMethods: payments.enabled().map((m) => ({ id: m.id, label: m.label })),
    company: { name: process.env.COMPANY_NAME || '', legalForm: process.env.COMPANY_LEGAL_FORM || '', address: process.env.COMPANY_ADDRESS || '', ice: process.env.COMPANY_ICE || '', rc: process.env.COMPANY_RC || '', email: process.env.CONTACT_EMAIL || '', phone: process.env.CONTACT_PHONE || '', host: process.env.HOSTING_PROVIDER || '' }
  });
});

/* ---------- auth ---------- */
const authLimit = L.rateLimit('auth', 20, 15 * 60000);
app.post('/api/auth/register', L.rateLimit('register', 8, 3600000), A(async (req, res) => {
  const b = req.body || {}, errors = [];
  const name = L.clean(b.name, 40), email = L.clean(b.email, 160).toLowerCase(), pw = typeof b.password === 'string' ? b.password : '';
  if (name.length < 2) errors.push('Entrez votre prénom ou votre nom.');
  if (!L.isEmail(email)) errors.push('Entrez une adresse e-mail valide.');
  if (pw.length < 8 || pw.length > 200) errors.push('Le mot de passe doit contenir au moins 8 caractères.');
  if (!SH.CITIES.includes(b.city)) errors.push('Choisissez votre ville.');
  if (b.terms !== true) errors.push('Vous devez accepter les conditions d\'utilisation.');
  if (errors.length) throw bad(errors[0], errors);
  if (get('SELECT id FROM users WHERE email=?', email)) throw new HttpError(409, 'Cette adresse e-mail est déjà utilisée.');
  const hash = await L.hashPassword(pw);
  const r = run('INSERT INTO users(email,name,pass_hash,city,phone,created,terms_at) VALUES(?,?,?,?,?,?,?)', email, name, hash, b.city, L.normPhone(b.phone), now(), now());
  setSession(req, res, r.id);
  res.json({ user: publicUser(get('SELECT * FROM users WHERE id=?', r.id)) });
}));
app.post('/api/auth/login', authLimit, A(async (req, res) => {
  const b = req.body || {}, email = L.clean(b.email, 160).toLowerCase(), pw = typeof b.password === 'string' ? b.password : '';
  const u = get('SELECT * FROM users WHERE email=? AND deleted=0', email);
  const ok = await L.verifyPassword(pw, u ? u.pass_hash : 'scrypt$00$00');
  if (!u || !ok) throw new HttpError(401, 'E-mail ou mot de passe incorrect.');
  if (u.banned) throw new HttpError(403, 'Ce compte est suspendu. Contactez-nous.');
  setSession(req, res, u.id);
  res.json({ user: publicUser(u) });
}));
app.post('/api/auth/logout', (req, res) => {
  const t = cookies(req)[COOKIE];
  if (t) run('DELETE FROM sessions WHERE token_hash=?', L.sha(t));
  clearCookie(res); res.json({ ok: true });
});
app.get('/api/me', (req, res) => res.json({ user: publicUser(req.user) }));
app.patch('/api/me', needUser, A(async (req, res) => {
  const b = req.body || {}, name = L.clean(b.name, 40);
  if (name.length < 2) throw bad('Entrez votre nom.');
  if (!SH.CITIES.includes(b.city)) throw bad('Choisissez votre ville.');
  run('UPDATE users SET name=?, city=?, phone=? WHERE id=?', name, b.city, L.normPhone(b.phone), req.user.id);
  res.json({ user: publicUser(get('SELECT * FROM users WHERE id=?', req.user.id)) });
}));
app.post('/api/me/password', needUser, authLimit, A(async (req, res) => {
  const b = req.body || {};
  if (!(await L.verifyPassword(String(b.current || ''), req.user.pass_hash))) throw new HttpError(400, 'Mot de passe actuel incorrect.');
  if (typeof b.next !== 'string' || b.next.length < 8 || b.next.length > 200) throw bad('Le nouveau mot de passe doit contenir au moins 8 caractères.');
  run('UPDATE users SET pass_hash=? WHERE id=?', await L.hashPassword(b.next), req.user.id);
  const keep = L.sha(cookies(req)[COOKIE] || '');
  run('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', req.user.id, keep);
  res.json({ ok: true });
}));
app.post('/api/me/delete', needUser, authLimit, A(async (req, res) => {
  const u = req.user;
  if (u.role === 'admin') throw bad('Un compte administrateur ne peut pas être supprimé ici.');
  if (!(await L.verifyPassword(String((req.body || {}).password || ''), u.pass_hash))) throw bad('Mot de passe incorrect.');
  const open = get("SELECT COUNT(*) n FROM orders WHERE (buyer_id=? OR seller_id=?) AND status IN ('to_ship','shipping','delivered','issue')", u.id, u.id).n;
  if (open) throw bad('Vous avez des commandes en cours. Terminez-les avant de supprimer votre compte.');
  tx(() => {
    run("DELETE FROM items WHERE seller_id=? AND status<>'sold'", u.id);
    run('DELETE FROM favs WHERE user_id=?', u.id);
    run('DELETE FROM sessions WHERE user_id=?', u.id);
    run("UPDATE items SET status='hidden' WHERE seller_id=?", u.id);
    run("UPDATE users SET deleted=1, name='Compte supprimé', email=?, phone='', city='', pass_hash='x' WHERE id=?", `supprime-${u.id}-${L.token().slice(0, 8)}@deleted.invalid`, u.id);
  });
  clearCookie(res); res.json({ ok: true });
}));
app.post('/api/auth/forgot', L.rateLimit('forgot', 5, 3600000), A(async (req, res) => {
  const email = L.clean((req.body || {}).email, 160).toLowerCase();
  const u = L.isEmail(email) ? get('SELECT * FROM users WHERE email=? AND deleted=0 AND banned=0', email) : null;
  if (u) {
    const t = L.token();
    run('DELETE FROM resets WHERE user_id=?', u.id);
    run('INSERT INTO resets(token_hash,user_id,expires) VALUES(?,?,?)', L.sha(t), u.id, now() + 3600000);
    await L.sendMail(u.email, 'Réinitialisation de votre mot de passe Thrifty', `Salam ${u.name},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${base(req)}/reinitialiser?token=${t}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`);
  }
  res.json({ ok: true });
}));
app.post('/api/auth/reset', authLimit, A(async (req, res) => {
  const b = req.body || {};
  const r = get('SELECT * FROM resets WHERE token_hash=? AND expires>?', L.sha(String(b.token || '')), now());
  if (!r) throw bad('Ce lien est invalide ou expiré. Refaites une demande.');
  if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 200) throw bad('Le mot de passe doit contenir au moins 8 caractères.');
  run('UPDATE users SET pass_hash=? WHERE id=?', await L.hashPassword(b.password), r.user_id);
  run('DELETE FROM resets WHERE user_id=?', r.user_id);
  run('DELETE FROM sessions WHERE user_id=?', r.user_id);
  res.json({ ok: true });
}));

/* ---------- photos ---------- */
const FILE_RE = /^[a-f0-9]{32}\.jpg$/;
app.post('/api/photos', needUser, L.rateLimit('photos', 150, 3600000, (r) => 'u' + (r.user ? r.user.id : r.ip)), A(async (req, res) => {
  const d = (req.body || {}).data;
  if (typeof d !== 'string' || !d.startsWith('data:image/jpeg;base64,')) throw bad('Format de photo non accepté (JPEG attendu).');
  const buf = Buffer.from(d.slice(23), 'base64');
  if (buf.length < 500 || buf.length > 2 * 1024 * 1024) throw bad('Photo trop lourde ou illisible.');
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) throw bad('Le fichier n\'est pas une image JPEG valide.');
  const file = crypto.randomBytes(16).toString('hex') + '.jpg';
  fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
  run('INSERT INTO uploads(file,user_id,ts) VALUES(?,?,?)', file, req.user.id, now());
  res.json({ file, url: '/uploads/' + file });
}));

/* ---------- items ---------- */
const ITEM_SELECT = 'SELECT i.*, u.name AS seller_name, u.city AS seller_city, u.banned AS seller_banned FROM items i JOIN users u ON u.id=i.seller_id';
function photosFor(ids) {
  const m = {};
  if (!ids.length) return m;
  all(`SELECT item_id,file FROM item_photos WHERE item_id IN (${ids.map(() => '?').join(',')}) ORDER BY item_id,pos`, ...ids).forEach((r) => (m[r.item_id] = m[r.item_id] || []).push(r.file));
  return m;
}
const itemOut = (r, ph) => ({
  id: r.id, seller: { id: r.seller_id, name: r.seller_name, city: r.seller_city }, univ: r.univ, cat: r.cat, title: r.title, brand: r.brand, size: r.size, color: r.color,
  cond: r.cond, defects: r.defects, desc: r.descr, price: r.price, oldPrice: r.old_price && r.old_price > r.price ? r.old_price : null, city: r.city, pack: r.pack,
  status: r.status, created: r.created, photos: (ph[r.id] || []).map((f) => '/uploads/' + f)
});
const itemsOut = (rows) => { const ph = photosFor(rows.map((r) => r.id)); return rows.map((r) => itemOut(r, ph)); };
function sellerStats(id) {
  const r = get('SELECT COUNT(*) n, AVG(rating) avg FROM reviews r JOIN orders o ON o.id=r.order_id WHERE o.seller_id=?', id);
  const sales = get("SELECT COUNT(*) n FROM orders WHERE seller_id=? AND status='confirmed'", id).n;
  return { avg: r.n ? Math.round(r.avg * 10) / 10 : null, reviews: r.n, sales };
}
const list = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20);

app.get('/api/items', A(async (req, res) => {
  const q = req.query, w = ["i.status='published'", 'u.banned=0'], p = [];
  if (SH.UNIV[q.univ]) { w.push('i.univ=?'); p.push(q.univ); }
  const cats = list(q.cat).filter((c) => SH.CATS.includes(c)); if (cats.length) { w.push(`i.cat IN (${cats.map(() => '?').join(',')})`); p.push(...cats); }
  const sizes = list(q.size); if (sizes.length) { w.push(`i.size IN (${sizes.map(() => '?').join(',')})`); p.push(...sizes); }
  const conds = list(q.cond).filter((c) => SH.COND.includes(c)); if (conds.length) { w.push(`i.cond IN (${conds.map(() => '?').join(',')})`); p.push(...conds); }
  const mx = L.int(q.max); if (mx > 0) { w.push('i.price<=?'); p.push(mx); }
  if (SH.CITIES.includes(q.city)) { w.push('i.city=?'); p.push(q.city); }
  if (q.promo === '1') w.push('i.old_price IS NOT NULL AND i.old_price>i.price');
  const sid = L.int(q.seller); if (sid > 0) { w.push('i.seller_id=?'); p.push(sid); }
  L.norm(q.q).split(/\s+/).filter(Boolean).slice(0, 6).forEach((t) => { w.push("i.search LIKE ? ESCAPE '\\'"); p.push('%' + t.replace(/[\\%_]/g, '\\$&') + '%'); });
  const order = q.sort === 'asc' ? 'i.price ASC, i.id DESC' : q.sort === 'desc' ? 'i.price DESC, i.id DESC' : 'i.created DESC, i.id DESC';
  const per = clampInt(q.per, 1, 48, 24), page = clampInt(q.page, 1, 1000, 1), where = w.join(' AND ');
  const total = get(`SELECT COUNT(*) n FROM items i JOIN users u ON u.id=i.seller_id WHERE ${where}`, ...p).n;
  const rows = all(`${ITEM_SELECT} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, ...p, per, (page - 1) * per);
  res.json({ items: itemsOut(rows), total, page, pages: Math.max(1, Math.ceil(total / per)) });
}));
function clampInt(v, a, b, d) { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; }

app.get('/api/items/:id', A(async (req, res) => {
  const id = idParam(req.params.id), r = get(`${ITEM_SELECT} WHERE i.id=?`, id);
  const u = req.user;
  const visible = r && ((r.status === 'published' && !r.seller_banned) || r.status === 'sold' || (u && (u.id === r.seller_id || u.role === 'admin')));
  if (!r || !visible) throw new HttpError(404, 'Cette annonce n\'existe pas ou n\'est plus disponible.');
  if (r.status === 'sold' && !(u && (u.id === r.seller_id || u.role === 'admin')) && false) throw new HttpError(404, 'Introuvable.');
  const item = itemsOut([r])[0];
  const similar = itemsOut(all(`${ITEM_SELECT} WHERE i.status='published' AND u.banned=0 AND i.id<>? AND i.univ=? AND (i.cat=? OR ABS(i.price-?)<40) ORDER BY i.created DESC LIMIT 4`, id, r.univ, r.cat, r.price));
  const convo = u ? get('SELECT id, agreed FROM convos WHERE item_id=? AND buyer_id=?', id, u.id) : null;
  const fav = u ? !!get('SELECT 1 x FROM favs WHERE user_id=? AND item_id=?', u.id, id) : false;
  res.json({ item, similar, sellerStats: sellerStats(r.seller_id), convo, fav });
}));

function checkItem(b, publish, userId, itemId) {
  const errors = [], v = {};
  v.univ = SH.UNIV[b.univ] ? b.univ : null;
  if (!v.univ) errors.push('Choisissez un univers.');
  v.cat = v.univ && SH.catsFor(v.univ).includes(b.cat) ? b.cat : null;
  if (!v.cat) errors.push('Choisissez une catégorie.');
  v.title = L.clean(b.title, 100); if (v.title.length < 3) errors.push('Ajoutez un titre (3 caractères minimum).');
  v.desc = L.cleanText(b.desc, 2000);
  const noBrand = b.noBrand === true || /^sans marque$/i.test(L.clean(b.brand, 50));
  v.brand = noBrand ? 'Sans marque' : L.clean(b.brand, 50);
  v.size = v.univ && v.cat && SH.sizesFor(v.univ, v.cat).includes(b.size) ? b.size : '';
  v.color = SH.COLORS[b.color] ? b.color : '';
  v.cond = SH.COND.includes(b.cond) ? b.cond : '';
  v.defects = b.noDefect === true ? 'Aucun défaut constaté' : L.cleanText(b.defects, 500);
  const price = b.price === '' || b.price == null ? 0 : L.int(b.price);
  if (!Number.isFinite(price) || price < 0 || price > 100000) errors.push('Le prix doit être positif et inférieur à 100 000 DH.');
  v.price = Number.isFinite(price) && price >= 0 && price <= 100000 ? price : 0;
  v.city = SH.CITIES.includes(b.city) ? b.city : '';
  v.pack = SH.PACKS[b.pack] ? b.pack : SH.packFor(v.cat);
  const photos = [...new Set((Array.isArray(b.photos) ? b.photos : []).filter((f) => typeof f === 'string' && FILE_RE.test(f)))].slice(0, 20);
  for (const f of photos) {
    const up = get('SELECT user_id FROM uploads WHERE file=?', f);
    const own = get('SELECT 1 x FROM item_photos WHERE file=? AND item_id=?', f, itemId || 0);
    if (!own && (!up || up.user_id !== userId)) errors.push('Une photo n\'est pas valide. Ajoutez-la à nouveau.');
  }
  v.photos = photos;
  if (publish) {
    if (!photos.length) errors.push('Ajoutez au moins une photo.');
    if (v.desc.length < 10) errors.push('Ajoutez une description (10 caractères minimum).');
    if (!v.brand) errors.push('Indiquez la marque ou cochez « Sans marque ».');
    if (!v.size) errors.push('Choisissez une taille.');
    if (!v.color) errors.push('Choisissez une couleur.');
    if (!v.cond) errors.push('Choisissez l\'état.');
    if (!v.defects) errors.push('Décrivez les défauts ou cochez « Aucun défaut constaté ».');
    if (!(v.price > 0)) errors.push('Fixez un prix.');
    if (!v.city) errors.push('Choisissez la ville.');
    if (b.decl !== true) errors.push('Cochez la déclaration d\'exactitude.');
  }
  return { errors: [...new Set(errors)], v };
}
const searchText = (v) => L.norm([v.title, v.brand, v.cat, v.desc, v.color, SH.UNIV[v.univ]].join(' '));
function savePhotos(itemId, files) {
  run('DELETE FROM item_photos WHERE item_id=?', itemId);
  files.forEach((f, i) => run('INSERT INTO item_photos(item_id,file,pos) VALUES(?,?,?)', itemId, f, i));
}
function notifyFavs(item, oldPrice, actorId) {
  all('SELECT user_id FROM favs WHERE item_id=? AND user_id<>?', item.id, actorId).forEach((f) => notify(f.user_id, `Prix baissé : ${item.title} passe de ${dh(oldPrice)} à ${dh(item.price)}.`, '/article/' + item.id));
}
app.post('/api/items', needUser, L.rateLimit('itemw', 60, 3600000, (r) => 'u' + r.user.id), A(async (req, res) => {
  const publish = req.body.publish === true;
  const { errors, v } = checkItem(req.body || {}, publish, req.user.id, 0);
  if (errors.length) throw bad(errors[0], errors);
  const id = tx(() => {
    const r = run('INSERT INTO items(seller_id,univ,cat,title,brand,size,color,cond,defects,descr,price,city,pack,status,search,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      req.user.id, v.univ, v.cat, v.title, v.brand, v.size, v.color, v.cond, v.defects, v.desc, v.price, v.city, v.pack, publish ? 'published' : 'draft', searchText(v), now(), now());
    savePhotos(r.id, v.photos);
    return r.id;
  });
  res.json({ id, status: publish ? 'published' : 'draft' });
}));
function ownItem(req) {
  const id = idParam(req.params.id), it = get('SELECT * FROM items WHERE id=?', id);
  if (!it) throw new HttpError(404, 'Annonce introuvable.');
  if (it.seller_id !== req.user.id) throw new HttpError(403, 'Cette annonce ne vous appartient pas.');
  return it;
}
app.put('/api/items/:id', needUser, A(async (req, res) => {
  const it = ownItem(req);
  if (it.status === 'sold') throw bad('Cette annonce est vendue, elle ne peut plus être modifiée.');
  const publish = req.body.publish === true || it.status === 'published';
  const { errors, v } = checkItem(req.body || {}, publish, req.user.id, it.id);
  if (errors.length) throw bad(errors[0], errors);
  let old = it.old_price, status = it.status;
  if (v.price && v.price < it.price && it.status !== 'draft') old = it.old_price && it.old_price > it.price ? it.old_price : it.price;
  else if (v.price >= it.price && old && old <= v.price) old = null;
  if (req.body.publish === true && (it.status === 'draft' || it.status === 'hidden')) status = 'published';
  tx(() => {
    run('UPDATE items SET univ=?,cat=?,title=?,brand=?,size=?,color=?,cond=?,defects=?,descr=?,price=?,old_price=?,city=?,pack=?,status=?,paused_hide=0,search=?,updated=? WHERE id=?',
      v.univ, v.cat, v.title, v.brand, v.size, v.color, v.cond, v.defects, v.desc, v.price, old, v.city, v.pack, status, searchText(v), now(), it.id);
    savePhotos(it.id, v.photos);
  });
  if (status === 'published' && v.price && v.price < it.price) notifyFavs({ id: it.id, title: v.title, price: v.price }, it.price, req.user.id);
  res.json({ id: it.id, status });
}));
app.post('/api/items/:id/price', needUser, A(async (req, res) => {
  const it = ownItem(req), p = L.int((req.body || {}).price);
  if (!['published', 'hidden'].includes(it.status)) throw bad('Cette annonce ne peut pas être modifiée.');
  if (!(p > 0) || p >= it.price) throw bad(`Le nouveau prix doit être positif et inférieur à ${dh(it.price)}.`);
  const old = it.old_price && it.old_price > it.price ? it.old_price : it.price;
  run('UPDATE items SET price=?, old_price=?, updated=? WHERE id=?', p, old, now(), it.id);
  if (it.status === 'published') notifyFavs({ id: it.id, title: it.title, price: p }, it.price, req.user.id);
  res.json({ ok: true });
}));
app.post('/api/items/:id/hide', needUser, A(async (req, res) => { const it = ownItem(req); if (it.status !== 'published') throw bad('Annonce non publiée.'); run("UPDATE items SET status='hidden', paused_hide=0 WHERE id=?", it.id); res.json({ ok: true }); }));
app.post('/api/items/:id/unhide', needUser, A(async (req, res) => { const it = ownItem(req); if (it.status !== 'hidden') throw bad('Annonce non masquée.'); run("UPDATE items SET status='published', paused_hide=0 WHERE id=?", it.id); res.json({ ok: true }); }));
app.delete('/api/items/:id', needUser, A(async (req, res) => { const it = ownItem(req); if (it.status === 'sold') throw bad('Une annonce vendue ne peut pas être supprimée.'); run('DELETE FROM items WHERE id=?', it.id); res.json({ ok: true }); }));
app.post('/api/my/pause', needUser, (req, res) => { run("UPDATE items SET status='hidden', paused_hide=1 WHERE seller_id=? AND status='published'", req.user.id); res.json({ ok: true }); });
app.post('/api/my/resume', needUser, (req, res) => { run("UPDATE items SET status='published', paused_hide=0 WHERE seller_id=? AND paused_hide=1 AND status='hidden'", req.user.id); res.json({ ok: true }); });
app.get('/api/my/items', needUser, A(async (req, res) => {
  const rows = all(`${ITEM_SELECT} WHERE i.seller_id=? ORDER BY i.created DESC`, req.user.id);
  const orders = all('SELECT id,item_id FROM orders WHERE seller_id=?', req.user.id);
  const items = itemsOut(rows).map((it) => { const o = orders.find((x) => x.item_id === it.id); return { ...it, orderId: o ? o.id : null, paused: !!rows.find((r) => r.id === it.id).paused_hide }; });
  res.json({ items });
}));

/* ---------- favourites ---------- */
app.get('/api/favs/ids', needUser, (req, res) => res.json({ ids: all('SELECT item_id FROM favs WHERE user_id=?', req.user.id).map((r) => r.item_id) }));
app.get('/api/favs', needUser, A(async (req, res) => {
  const rows = all(`${ITEM_SELECT} JOIN favs f ON f.item_id=i.id WHERE f.user_id=? AND i.status IN ('published','sold') ORDER BY f.ts DESC`, req.user.id);
  const fp = {}; all('SELECT item_id,price_at_fav FROM favs WHERE user_id=?', req.user.id).forEach((r) => (fp[r.item_id] = r.price_at_fav));
  res.json({ items: itemsOut(rows).map((i) => ({ ...i, favPrice: fp[i.id] })) });
}));
app.put('/api/favs/:id', needUser, A(async (req, res) => {
  const it = get("SELECT id,price FROM items WHERE id=? AND status IN ('published','sold')", idParam(req.params.id));
  if (!it) throw new HttpError(404, 'Introuvable.');
  run('INSERT OR IGNORE INTO favs(user_id,item_id,price_at_fav,ts) VALUES(?,?,?,?)', req.user.id, it.id, it.price, now());
  res.json({ ok: true });
}));
app.delete('/api/favs/:id', needUser, (req, res) => { run('DELETE FROM favs WHERE user_id=? AND item_id=?', req.user.id, idParam(req.params.id)); res.json({ ok: true }); });

/* ---------- conversations & offers ---------- */
function convoFor(req) {
  const c = get('SELECT * FROM convos WHERE id=?', idParam(req.params.id));
  if (!c || (c.buyer_id !== req.user.id && c.seller_id !== req.user.id)) throw new HttpError(404, 'Conversation introuvable.');
  return c;
}
const msgOut = (m) => ({ id: m.id, from: m.from_id, type: m.type, text: m.text, amount: m.amount, status: m.status, counter: !!m.counter, ts: m.ts });
const otherId = (c, uid) => (c.buyer_id === uid ? c.seller_id : c.buyer_id);
function convoSummary(c, uid) {
  const it = get('SELECT i.id,i.title,i.price,i.status,(SELECT file FROM item_photos WHERE item_id=i.id ORDER BY pos LIMIT 1) photo FROM items i WHERE i.id=?', c.item_id);
  const o = get('SELECT id,name FROM users WHERE id=?', otherId(c, uid));
  return { id: c.id, agreed: c.agreed, buyerId: c.buyer_id, other: { id: o.id, name: o.name }, item: it ? { id: it.id, title: it.title, price: it.price, status: it.status, photo: it.photo ? '/uploads/' + it.photo : null } : null };
}
app.get('/api/convos', needUser, A(async (req, res) => {
  const u = req.user.id;
  const rows = all('SELECT * FROM convos WHERE buyer_id=? OR seller_id=?', u, u);
  const out = rows.map((c) => {
    const last = get('SELECT * FROM messages WHERE convo_id=? ORDER BY ts DESC, id DESC LIMIT 1', c.id);
    const rd = get('SELECT last_ts FROM convo_reads WHERE convo_id=? AND user_id=?', c.id, u);
    return { ...convoSummary(c, u), last: last ? msgOut(last) : null, lastTs: last ? last.ts : c.created, unread: !!(last && last.from_id !== u && last.ts > (rd ? rd.last_ts : 0)) };
  }).filter((c) => c.last).sort((a, b) => b.lastTs - a.lastTs);
  res.json({ convos: out });
}));
app.get('/api/convos/:id', needUser, A(async (req, res) => {
  const c = convoFor(req);
  run('INSERT INTO convo_reads(convo_id,user_id,last_ts) VALUES(?,?,?) ON CONFLICT(convo_id,user_id) DO UPDATE SET last_ts=excluded.last_ts', c.id, req.user.id, now());
  res.json({ convo: convoSummary(c, req.user.id), me: req.user.id, messages: all('SELECT * FROM messages WHERE convo_id=? ORDER BY ts, id', c.id).map(msgOut) });
}));
app.post('/api/convos', needUser, A(async (req, res) => {
  const it = get('SELECT * FROM items WHERE id=?', idParam((req.body || {}).itemId));
  if (!it || it.status !== 'published') throw new HttpError(404, 'Cet article n\'est plus disponible.');
  if (it.seller_id === req.user.id) throw bad('C\'est votre propre annonce.');
  let c = get('SELECT * FROM convos WHERE item_id=? AND buyer_id=?', it.id, req.user.id);
  if (!c) { const r = run('INSERT INTO convos(item_id,buyer_id,seller_id,created) VALUES(?,?,?,?)', it.id, req.user.id, it.seller_id, now()); c = { id: r.id }; }
  res.json({ id: c.id });
}));
const msgLimit = L.rateLimit('msg', 60, 600000, (r) => 'u' + r.user.id);
app.post('/api/convos/:id/messages', needUser, msgLimit, A(async (req, res) => {
  const c = convoFor(req), text = L.cleanText((req.body || {}).text, 1000);
  if (!text) throw bad('Écrivez un message.');
  run("INSERT INTO messages(convo_id,from_id,type,text,ts) VALUES(?,?,'text',?,?)", c.id, req.user.id, text, now());
  const it = get('SELECT title FROM items WHERE id=?', c.item_id);
  notify(otherId(c, req.user.id), `Nouveau message de ${req.user.name} : ${it ? it.title : ''}`, '/messages/' + c.id);
  res.json({ ok: true });
}));
app.post('/api/convos/:id/offers', needUser, msgLimit, A(async (req, res) => {
  const c = convoFor(req), amount = L.int((req.body || {}).amount), text = L.cleanText((req.body || {}).text, 300);
  const it = get('SELECT * FROM items WHERE id=?', c.item_id);
  if (!it || it.status !== 'published') throw new HttpError(409, 'Cet article n\'est plus disponible.');
  if (!(amount > 0)) throw bad('Entrez un montant positif.');
  const had = get("SELECT 1 x FROM messages WHERE convo_id=? AND type='offer'", c.id);
  if (!had && req.user.id === c.buyer_id && amount >= it.price) throw bad(`L'offre doit être inférieure au prix affiché (${dh(it.price)}).`);
  if (amount > it.price) throw bad(`Le montant ne peut pas dépasser le prix affiché (${dh(it.price)}).`);
  tx(() => {
    run("UPDATE messages SET status='replaced' WHERE convo_id=? AND type='offer' AND status='pending'", c.id);
    run('UPDATE convos SET agreed=NULL WHERE id=?', c.id);
    run("INSERT INTO messages(convo_id,from_id,type,text,amount,status,counter,ts) VALUES(?,?,'offer',?,?,'pending',?,?)", c.id, req.user.id, text, amount, had ? 1 : 0, now());
  });
  notify(otherId(c, req.user.id), `${had ? 'Contre-proposition' : 'Nouvelle offre'} de ${req.user.name} : ${dh(amount)} sur ${it.title}`, '/messages/' + c.id);
  res.json({ ok: true });
}));
app.post('/api/offers/:id/:action', needUser, A(async (req, res) => {
  const m = get("SELECT * FROM messages WHERE id=? AND type='offer'", idParam(req.params.id));
  const c = m && get('SELECT * FROM convos WHERE id=?', m.convo_id);
  if (!m || !c || (c.buyer_id !== req.user.id && c.seller_id !== req.user.id)) throw new HttpError(404, 'Offre introuvable.');
  if (m.status !== 'pending') throw new HttpError(409, 'Cette offre n\'est plus en attente.');
  if (m.from_id === req.user.id) throw bad('Vous ne pouvez pas répondre à votre propre offre.');
  const it = get('SELECT * FROM items WHERE id=?', c.item_id);
  if (req.params.action === 'accept') {
    if (!it || it.status !== 'published') throw new HttpError(409, 'Cet article n\'est plus disponible.');
    tx(() => {
      run("UPDATE messages SET status='accepted' WHERE id=?", m.id);
      run('UPDATE convos SET agreed=? WHERE id=?', Math.min(m.amount, it.price), c.id);
      run("INSERT INTO messages(convo_id,from_id,type,text,ts) VALUES(?,?,'system',?,?)", c.id, req.user.id, `Prix convenu : ${dh(m.amount)}. Il sera repris au paiement.`, now());
    });
    notify(m.from_id, `Offre acceptée : ${it.title} à ${dh(m.amount)}.`, '/messages/' + c.id);
  } else if (req.params.action === 'refuse') {
    run("UPDATE messages SET status='refused' WHERE id=?", m.id);
    notify(m.from_id, `Offre refusée sur ${it ? it.title : 'l\'article'}.`, '/messages/' + c.id);
  } else throw new HttpError(404, 'Action inconnue.');
  res.json({ ok: true });
}));

/* ---------- orders ---------- */
const ORDER_SELECT = 'SELECT o.*, b.name AS buyer_name, s.name AS seller_name FROM orders o JOIN users b ON b.id=o.buyer_id JOIN users s ON s.id=o.seller_id';
function orderOut(o, viewer, full) {
  const out = {
    id: o.id, code: code(o.id), itemId: o.item_id, title: o.item_title, brand: o.item_brand, size: o.item_size, photo: o.item_photo ? '/uploads/' + o.item_photo : null,
    buyer: { id: o.buyer_id, name: o.buyer_name }, seller: { id: o.seller_id, name: o.seller_name }, price: o.price, ship: o.ship, total: o.total, rate: o.rate,
    commission: o.commission, net: o.net, status: o.status, payout: o.payout, pack: o.pack, city: o.ship_city, paymentMethod: o.payment_method, tracking: o.tracking, created: o.created
  };
  if (full) {
    const ok = viewer.role === 'admin' || viewer.id === o.buyer_id || viewer.id === o.seller_id;
    if (ok) { out.shipName = o.ship_name; out.address = o.ship_address; out.phone = o.ship_phone; }
    out.payoutRef = o.payout_ref;
    out.issue = o.issue_reason ? { reason: o.issue_reason, text: o.issue_text, ts: o.issue_ts } : null;
    const r = get('SELECT * FROM reviews WHERE order_id=?', o.id); out.review = r ? { rating: r.rating, text: r.text, ts: r.ts } : null;
    out.events = all('SELECT text AS t, ts FROM order_events WHERE order_id=? ORDER BY ts, id', o.id);
  }
  return out;
}
app.post('/api/orders', needUser, L.rateLimit('order', 30, 3600000, (r) => 'u' + r.user.id), A(async (req, res) => {
  const b = req.body || {}, errors = [];
  const name = L.clean(b.name, 60), addr = L.clean(b.address, 200), phone = L.normPhone(b.phone), city = SH.CITIES.includes(b.city) ? b.city : '';
  const method = b.paymentMethod || 'cod';
  if (name.length < 2) errors.push('Renseignez le nom du destinataire.');
  if (addr.length < 5) errors.push('Renseignez l\'adresse de livraison.');
  if (!city) errors.push('Choisissez la ville de livraison.');
  if (!phone) errors.push('Entrez un numéro de téléphone valide.');
  if (!payments.isEnabled(method)) errors.push('Moyen de paiement indisponible.');
  if (errors.length) throw bad(errors[0], errors);
  const orderId = tx(() => {
    const it = get('SELECT * FROM items WHERE id=?', idParam(b.itemId));
    if (!it || it.status !== 'published') throw new HttpError(409, 'Cet article n\'est plus disponible.');
    if (it.seller_id === req.user.id) throw bad('Vous ne pouvez pas acheter votre propre annonce.');
    const seller = get('SELECT banned FROM users WHERE id=?', it.seller_id);
    if (seller.banned) throw new HttpError(409, 'Cet article n\'est plus disponible.');
    const c = get('SELECT agreed FROM convos WHERE item_id=? AND buyer_id=?', it.id, req.user.id);
    const price = c && c.agreed ? Math.min(c.agreed, it.price) : it.price, m = money(price);
    if (run("UPDATE items SET status='sold', updated=? WHERE id=? AND status='published'", now(), it.id).changes !== 1) throw new HttpError(409, 'Cet article vient d\'être vendu.');
    const photo = get('SELECT file FROM item_photos WHERE item_id=? ORDER BY pos LIMIT 1', it.id);
    const r = run(`INSERT INTO orders(item_id,item_title,item_brand,item_size,item_photo,buyer_id,seller_id,price,ship,total,rate,commission,net,status,payout,pack,ship_name,ship_address,ship_city,ship_phone,payment_method,created)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'to_ship','pending',?,?,?,?,?,?,?)`,
      it.id, it.title, it.brand, it.size, photo ? photo.file : null, req.user.id, it.seller_id, m.price, m.ship, m.total, m.rate, m.commission, m.net, it.pack, name, addr, city, phone, method, now());
    evt(r.id, 'Commande passée');
    notify(it.seller_id, `Vente : ${it.title} à ${dh(price)}. Préparez le colis.`, '/commande/' + r.id);
    return r.id;
  });
  res.json({ id: orderId });
}));
app.get('/api/orders', needUser, A(async (req, res) => {
  const role = req.query.role === 'seller' ? 'seller' : 'buyer';
  const rows = all(`${ORDER_SELECT} WHERE o.${role}_id=? ORDER BY o.created DESC LIMIT 200`, req.user.id);
  const payout = { pending: 0, due: 0, paid: 0, suspended: 0 };
  if (role === 'seller') all('SELECT payout, SUM(net) s FROM orders WHERE seller_id=? GROUP BY payout', req.user.id).forEach((r) => { if (r.payout in payout) payout[r.payout] = r.s; });
  res.json({ orders: rows.map((o) => orderOut(o, req.user, false)), payout });
}));
function orderFor(req) {
  const o = get(`${ORDER_SELECT} WHERE o.id=?`, idParam(req.params.id));
  const u = req.user;
  if (!o || (u.role !== 'admin' && o.buyer_id !== u.id && o.seller_id !== u.id)) throw new HttpError(404, 'Commande introuvable.');
  return o;
}
app.get('/api/orders/:id', needUser, A(async (req, res) => res.json({ order: orderOut(orderFor(req), req.user, true) })));
function changed(o, status, payout, text) {
  run('UPDATE orders SET status=?, payout=COALESCE(?,payout) WHERE id=?', status, payout, o.id);
  evt(o.id, text);
}
const rb = (req) => req.body || {};
app.post('/api/orders/:id/ship', needUser, A(async (req, res) => {
  const o = orderFor(req);
  if (o.seller_id !== req.user.id || o.status !== 'to_ship') throw new HttpError(409, 'Action impossible pour cette commande.');
  run('UPDATE orders SET tracking=? WHERE id=?', L.clean(rb(req).tracking, 60), o.id);
  changed(o, 'shipping', null, 'Expédiée par le vendeur');
  notify(o.buyer_id, `Votre commande ${o.item_title} est expédiée.`, '/commande/' + o.id);
  res.json({ ok: true });
}));
app.post('/api/orders/:id/confirm', needUser, A(async (req, res) => {
  const o = orderFor(req);
  if (o.buyer_id !== req.user.id || o.status !== 'delivered') throw new HttpError(409, 'Action impossible pour cette commande.');
  changed(o, 'confirmed', 'due', 'Réception confirmée par l\'acheteur');
  notify(o.seller_id, `Réception confirmée sur ${o.item_title} : ${dh(o.net)} à verser.`, '/commande/' + o.id);
  notifyAdmins(`Versement à effectuer : ${code(o.id)} (${dh(o.net)}).`, '/admin/commandes');
  res.json({ ok: true });
}));
app.post('/api/orders/:id/issue', needUser, A(async (req, res) => {
  const o = orderFor(req), reason = SH.REASONS.includes(rb(req).reason) ? rb(req).reason : null, text = L.cleanText(rb(req).text, 800);
  if (o.buyer_id !== req.user.id || !['to_ship', 'shipping', 'delivered'].includes(o.status)) throw new HttpError(409, 'Action impossible pour cette commande.');
  if (!reason) throw bad('Choisissez un motif.');
  if (text.length < 5) throw bad('Décrivez brièvement le problème.');
  run('UPDATE orders SET prev_status=?, issue_reason=?, issue_text=?, issue_ts=? WHERE id=?', o.status, reason, text, now(), o.id);
  changed(o, 'issue', 'suspended', 'Problème signalé : ' + reason);
  notify(o.seller_id, `Problème signalé sur ${o.item_title}. Versement suspendu.`, '/commande/' + o.id);
  notifyAdmins(`Nouveau dossier ${code(o.id)} : ${reason}`, '/admin/dossiers');
  res.json({ ok: true });
}));
app.post('/api/orders/:id/cancel', needUser, A(async (req, res) => {
  const o = orderFor(req), adm = req.user.role === 'admin';
  const okState = o.status === 'to_ship' || (adm && o.status === 'shipping');
  if (!okState || !(adm || o.seller_id === req.user.id || o.buyer_id === req.user.id)) throw new HttpError(409, 'Action impossible pour cette commande.');
  tx(() => {
    changed(o, 'cancelled', 'cancelled', `Commande annulée par ${adm ? 'l\'administration' : o.seller_id === req.user.id ? 'le vendeur' : 'l\'acheteur'}`);
    if (o.item_id) run("UPDATE items SET status='published' WHERE id=? AND status='sold'", o.item_id);
  });
  [o.buyer_id, o.seller_id].filter((x) => x !== req.user.id).forEach((u) => notify(u, `Commande ${o.item_title} annulée.`, '/commande/' + o.id));
  res.json({ ok: true });
}));
app.post('/api/orders/:id/review', needUser, A(async (req, res) => {
  const o = orderFor(req), rating = L.int(rb(req).rating);
  if (o.buyer_id !== req.user.id || o.status !== 'confirmed') throw new HttpError(409, 'Vous pourrez laisser un avis après avoir confirmé la réception.');
  if (get('SELECT 1 x FROM reviews WHERE order_id=?', o.id)) throw new HttpError(409, 'Avis déjà publié.');
  if (!(rating >= 1 && rating <= 5)) throw bad('Choisissez une note de 1 à 5.');
  run('INSERT INTO reviews(order_id,rating,text,ts) VALUES(?,?,?,?)', o.id, rating, L.cleanText(rb(req).text, 500), now());
  evt(o.id, 'Avis publié');
  notify(o.seller_id, `${req.user.name} a laissé un avis ${rating}/5.`, '/commande/' + o.id);
  res.json({ ok: true });
}));

/* ---------- seller public page ---------- */
app.get('/api/sellers/:id', A(async (req, res) => {
  const u = get('SELECT id,name,city,created FROM users WHERE id=? AND banned=0 AND deleted=0', idParam(req.params.id));
  if (!u) throw new HttpError(404, 'Vendeur introuvable.');
  const reviews = all('SELECT r.rating,r.text,r.ts,b.name AS buyer FROM reviews r JOIN orders o ON o.id=r.order_id JOIN users b ON b.id=o.buyer_id WHERE o.seller_id=? ORDER BY r.ts DESC LIMIT 30', u.id);
  res.json({ seller: { id: u.id, name: u.name, city: u.city, since: u.created }, stats: sellerStats(u.id), reviews });
}));

/* ---------- notifications, badges, contact, report ---------- */
app.get('/api/badges', needUser, (req, res) => {
  const u = req.user.id;
  const notifs = get('SELECT COUNT(*) n FROM notifs WHERE user_id=? AND read=0', u).n;
  const messages = get("SELECT COUNT(*) n FROM convos c WHERE (c.buyer_id=? OR c.seller_id=?) AND EXISTS(SELECT 1 FROM messages m WHERE m.convo_id=c.id AND m.from_id<>? AND m.ts>COALESCE((SELECT last_ts FROM convo_reads r WHERE r.convo_id=c.id AND r.user_id=?),0))", u, u, u, u).n;
  res.json({ notifs, messages });
});
app.get('/api/notifs', needUser, (req, res) => res.json({ notifs: all('SELECT id,text,link,ts,read FROM notifs WHERE user_id=? ORDER BY ts DESC, id DESC LIMIT 30', req.user.id).map((n) => ({ ...n, read: !!n.read })) }));
app.post('/api/notifs/read', needUser, (req, res) => { const id = L.int(rb(req).id); if (id > 0) run('UPDATE notifs SET read=1 WHERE id=? AND user_id=?', id, req.user.id); else run('UPDATE notifs SET read=1 WHERE user_id=?', req.user.id); res.json({ ok: true }); });
const contactLimit = L.rateLimit('contact', 6, 3600000);
app.post('/api/contact', contactLimit, A(async (req, res) => {
  const b = req.body || {}, topics = ['Question sur le service', 'Réclamation', 'Suggestion', 'Autre'];
  const text = L.cleanText(b.text, 1000), email = L.clean(b.email, 160);
  if (text.length < 5) throw bad('Écrivez votre message.');
  if (!req.user && !L.isEmail(email)) throw bad('Laissez une adresse e-mail pour recevoir une réponse.');
  run('INSERT INTO contacts(user_id,name,email,topic,text,ts) VALUES(?,?,?,?,?,?)', req.user ? req.user.id : null, req.user ? req.user.name : L.clean(b.name, 40), req.user ? req.user.email : email, topics.includes(b.topic) ? b.topic : 'Autre', text, now());
  notifyAdmins('Nouveau message de contact', '/admin/messages');
  res.json({ ok: true });
}));
app.post('/api/report', needUser, contactLimit, A(async (req, res) => {
  const it = get('SELECT id,title FROM items WHERE id=?', idParam(rb(req).itemId));
  if (!it) throw new HttpError(404, 'Annonce introuvable.');
  run('INSERT INTO contacts(user_id,name,email,topic,text,ts) VALUES(?,?,?,?,?,?)', req.user.id, req.user.name, req.user.email, 'Signalement', `Annonce #${it.id} « ${it.title} » : ${L.cleanText(rb(req).reason, 500) || 'sans précision'}`, now());
  notifyAdmins(`Signalement : annonce #${it.id}`, '/admin/messages');
  res.json({ ok: true });
}));

/* ---------- admin ---------- */
const admin = [needUser, needAdmin];
app.get('/api/admin/stats', admin, (req, res) => {
  const os = all('SELECT id,status,payout,price,commission,net,created FROM orders ORDER BY created DESC');
  const sum = (a, f) => Math.round(a.reduce((x, o) => x + f(o), 0) * 100) / 100;
  const byStatus = {}; os.forEach((o) => (byStatus[o.status] = (byStatus[o.status] || 0) + 1));
  res.json({
    orders: os.length, gmv: sum(os.filter((o) => !['refunded', 'cancelled'].includes(o.status)), (o) => o.price),
    comConfirmed: sum(os.filter((o) => o.status === 'confirmed'), (o) => o.commission),
    comPending: sum(os.filter((o) => ['to_ship', 'shipping', 'delivered'].includes(o.status)), (o) => o.commission),
    due: sum(os.filter((o) => o.payout === 'due'), (o) => o.net), paid: sum(os.filter((o) => o.payout === 'paid'), (o) => o.net),
    issues: byStatus.issue || 0, byStatus, users: get("SELECT COUNT(*) n FROM users WHERE deleted=0").n, listings: get("SELECT COUNT(*) n FROM items WHERE status='published'").n,
    recent: os.slice(0, 8).map((o) => ({ id: o.id, code: code(o.id), commission: o.commission, status: o.status })),
    unreadContacts: get('SELECT COUNT(*) n FROM contacts WHERE done=0').n
  });
});
app.get('/api/admin/orders', admin, (req, res) => {
  const st = req.query.status, rows = all(`${ORDER_SELECT} ${st ? 'WHERE o.status=?' : ''} ORDER BY o.created DESC LIMIT 500`, ...(st ? [st] : []));
  res.json({ orders: rows.map((o) => orderOut(o, req.user, false)) });
});
const adminOrder = (req) => get(`${ORDER_SELECT} WHERE o.id=?`, idParam(req.params.id)) || (() => { throw new HttpError(404, 'Commande introuvable.'); })();
app.post('/api/admin/orders/:id/:action', admin, A(async (req, res) => {
  const o = adminOrder(req), a = req.params.action;
  if (a === 'deliver' && o.status === 'shipping') { changed(o, 'delivered', null, 'Livraison confirmée par l\'administration'); notify(o.buyer_id, `Votre commande ${o.item_title} est livrée. Vérifiez-la puis confirmez la réception.`, '/commande/' + o.id); }
  else if (a === 'resolve' && o.status === 'issue') { changed(o, o.prev_status || 'shipping', 'pending', 'Dossier résolu : le parcours reprend'); [o.buyer_id, o.seller_id].forEach((u) => notify(u, `Le dossier sur ${o.item_title} est résolu.`, '/commande/' + o.id)); }
  else if (a === 'refund' && o.status === 'issue') {
    tx(() => { changed(o, 'refunded', 'cancelled', 'Remboursement intégral enregistré (prix et livraison)'); if (o.item_id) run("UPDATE items SET status='hidden' WHERE id=?", o.item_id); });
    [o.buyer_id, o.seller_id].forEach((u) => notify(u, `Commande ${o.item_title} remboursée.`, '/commande/' + o.id));
  } else if (a === 'pay' && o.payout === 'due') {
    run('UPDATE orders SET payout_ref=? WHERE id=?', L.clean(rb(req).reference, 80), o.id);
    changed(o, o.status, 'paid', 'Versement vendeur exécuté' + (rb(req).reference ? ' (réf. ' + L.clean(rb(req).reference, 80) + ')' : ''));
    notify(o.seller_id, `Versement de ${dh(o.net)} exécuté pour ${o.item_title}.`, '/versements');
  } else throw new HttpError(409, 'Action impossible pour cette commande.');
  res.json({ ok: true });
}));
app.get('/api/admin/items', admin, (req, res) => res.json({ items: itemsOut(all(`${ITEM_SELECT} ORDER BY i.created DESC LIMIT 500`)) }));
app.post('/api/admin/items/:id/:action', admin, A(async (req, res) => {
  const it = get('SELECT * FROM items WHERE id=?', idParam(req.params.id));
  if (!it) throw new HttpError(404, 'Annonce introuvable.');
  const a = req.params.action;
  if (a === 'hide') run("UPDATE items SET status='hidden' WHERE id=? AND status='published'", it.id);
  else if (a === 'show') run("UPDATE items SET status='published' WHERE id=? AND status='hidden'", it.id);
  else if (a === 'delete') { if (it.status === 'sold') throw bad('Annonce vendue : impossible de la retirer.'); run('DELETE FROM items WHERE id=?', it.id); }
  else throw new HttpError(404, 'Action inconnue.');
  notify(it.seller_id, `Votre annonce « ${it.title} » a été ${a === 'hide' ? 'masquée' : a === 'show' ? 'remise en ligne' : 'retirée'} par l'administration.`, '/dressing');
  res.json({ ok: true });
}));
app.get('/api/admin/users', admin, (req, res) => res.json({ users: all("SELECT u.id,u.name,u.email,u.city,u.role,u.banned,u.created,(SELECT COUNT(*) FROM items WHERE seller_id=u.id AND status='published') AS listings,(SELECT COUNT(*) FROM orders WHERE buyer_id=u.id) AS purchases,(SELECT COUNT(*) FROM orders WHERE seller_id=u.id) AS sales FROM users u WHERE u.deleted=0 ORDER BY u.created DESC LIMIT 500") }));
app.post('/api/admin/users/:id/:action', admin, A(async (req, res) => {
  const u = get('SELECT * FROM users WHERE id=?', idParam(req.params.id));
  if (!u) throw new HttpError(404, 'Utilisateur introuvable.');
  if (u.role === 'admin') throw bad('Un administrateur ne peut pas être suspendu.');
  if (req.params.action === 'ban') tx(() => { run('UPDATE users SET banned=1 WHERE id=?', u.id); run('DELETE FROM sessions WHERE user_id=?', u.id); });
  else if (req.params.action === 'unban') run('UPDATE users SET banned=0 WHERE id=?', u.id);
  else throw new HttpError(404, 'Action inconnue.');
  res.json({ ok: true });
}));
app.get('/api/admin/settings', admin, (req, res) => res.json({ rate: rate(), ship: shipFee() }));
app.post('/api/admin/settings', admin, A(async (req, res) => {
  const r = Number(rb(req).rate), s = L.int(rb(req).ship);
  if (!(r >= 0 && r <= 0.3) || !(s >= 0 && s <= 200)) throw bad('Taux entre 0 et 30 %, livraison entre 0 et 200 DH.');
  setSetting('rate', Math.round(r * 1000) / 1000); setSetting('ship', s);
  res.json({ ok: true });
}));
app.get('/api/admin/contacts', admin, (req, res) => res.json({ contacts: all('SELECT * FROM contacts ORDER BY done, ts DESC LIMIT 300').map((c) => ({ ...c, done: !!c.done })) }));
app.post('/api/admin/contacts/:id/done', admin, (req, res) => { run('UPDATE contacts SET done=1 WHERE id=?', idParam(req.params.id)); res.json({ ok: true }); });
app.get('/api/admin/export/orders.csv', admin, (req, res) => {
  const rows = all(`${ORDER_SELECT} ORDER BY o.created DESC`);
  const head = ['Commande', 'Date', 'Article', 'Acheteur', 'Vendeur', 'Prix', 'Livraison', 'Total', 'Taux', 'Commission', 'Net vendeur', 'Statut', 'Versement', 'Référence versement', 'Ville'];
  const lines = rows.map((o) => [code(o.id), new Date(o.created).toISOString(), o.item_title, o.buyer_name, o.seller_name, o.price, o.ship, o.total, o.rate, o.commission, o.net, SH.ORDER_LBL[o.status], SH.PAY_LBL[o.payout], o.payout_ref, o.ship_city].map(L.csvCell).join(','));
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="commandes-thrifty.csv"' }).send('﻿' + [head.map(L.csvCell).join(','), ...lines].join('\n'));
});
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', message: 'Introuvable.' }));

/* ---------- pages (SPA + SEO) ---------- */
const INDEX = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
function page(req, res, meta) {
  const m = Object.assign({ title: 'Thrifty · Seconde main. Premier choix.', desc: 'Thrifty, la marketplace marocaine de vêtements de seconde main pour femmes, hommes et enfants. Achetez, vendez, négociez.', image: base(req) + '/assets/og.jpg', url: base(req) + req.path }, meta || {});
  const t = `<title>${L.esc(m.title)}</title><meta name="description" content="${L.esc(m.desc)}"><link rel="canonical" href="${L.esc(m.url)}"><meta property="og:type" content="website"><meta property="og:site_name" content="Thrifty"><meta property="og:title" content="${L.esc(m.title)}"><meta property="og:description" content="${L.esc(m.desc)}"><meta property="og:image" content="${L.esc(m.image)}"><meta property="og:url" content="${L.esc(m.url)}"><meta name="twitter:card" content="summary_large_image">`;
  res.set('Cache-Control', 'no-cache').type('html').send(INDEX.replace('<!--META-->', t));
}
app.get('/article/:id', (req, res) => {
  const id = Number(req.params.id), r = Number.isInteger(id) ? get(`${ITEM_SELECT} WHERE i.id=? AND i.status IN ('published','sold') AND u.banned=0`, id) : null;
  if (!r) return page(req, res);
  const ph = photosFor([r.id])[r.id];
  page(req, res, { title: `${r.title} · ${r.price} DH · Thrifty`, desc: `${r.brand}, taille ${r.size}, ${r.cond}. ${r.descr}`.slice(0, 200), image: ph && ph[0] ? base(req) + '/uploads/' + ph[0] : undefined });
});
app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /api/\nDisallow: /admin\nDisallow: /commande\nDisallow: /paiement\nSitemap: ${base(req)}/sitemap.xml\n`));
app.get('/sitemap.xml', (req, res) => {
  const b = base(req), urls = ['/', '/femmes', '/hommes', '/enfants', '/catalogue', '/promos', '/aide', '/cgu', '/confidentialite', '/mentions-legales'].map((p) => `<url><loc>${b}${p}</loc></url>`);
  all("SELECT i.id,i.updated FROM items i JOIN users u ON u.id=i.seller_id WHERE i.status='published' AND u.banned=0 ORDER BY i.created DESC LIMIT 5000").forEach((r) => urls.push(`<url><loc>${b}/article/${r.id}</loc><lastmod>${new Date(r.updated).toISOString().slice(0, 10)}</lastmod></url>`));
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
});
app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => page(req, res));

/* ---------- errors ---------- */
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError) return res.status(err.status).json({ error: 'error', message: err.message, errors: err.errors });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'json', message: 'Requête invalide.' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'size', message: 'Fichier trop volumineux.' });
  console.error(err);
  res.status(500).json({ error: 'server', message: 'Une erreur est survenue. Réessayez dans un instant.' });
});

/* ---------- bootstrap ---------- */
async function bootstrapAdmin() {
  if (get("SELECT id FROM users WHERE role='admin'")) return;
  const email = L.clean(process.env.ADMIN_EMAIL || '', 160).toLowerCase();
  if (!L.isEmail(email)) { console.warn('\n[!] Aucun compte administrateur. Définissez ADMIN_EMAIL (et ADMIN_PASSWORD) puis redémarrez.\n'); return; }
  const existing = get('SELECT id FROM users WHERE email=?', email);
  if (existing) { run("UPDATE users SET role='admin' WHERE id=?", existing.id); console.log('Compte existant promu administrateur :', email); return; }
  let pw = process.env.ADMIN_PASSWORD || '', generated = false;
  if (pw.length < 10) { pw = crypto.randomBytes(9).toString('base64url'); generated = true; }
  run("INSERT INTO users(email,name,pass_hash,city,role,created,terms_at) VALUES(?,?,?,?,'admin',?,?)", email, 'Administration', await L.hashPassword(pw), 'Fès', now(), now());
  console.log(`\nCompte administrateur créé : ${email}${generated ? `\nMot de passe généré (à changer, affiché une seule fois) : ${pw}` : ''}\n`);
}
function sweep() {
  run('DELETE FROM sessions WHERE expires<?', now());
  run('DELETE FROM resets WHERE expires<?', now());
  const old = all('SELECT file FROM uploads WHERE ts<? AND file NOT IN (SELECT file FROM item_photos) AND file NOT IN (SELECT item_photo FROM orders WHERE item_photo IS NOT NULL)', now() - 864e5);
  old.forEach((r) => { try { fs.unlinkSync(path.join(UPLOAD_DIR, r.file)); } catch { /* ignore */ } run('DELETE FROM uploads WHERE file=?', r.file); });
}
async function start() {
  await bootstrapAdmin();
  sweep(); setInterval(sweep, 6 * 3600000).unref();
  const server = app.listen(PORT, () => console.log(`Thrifty démarré sur le port ${PORT} · données : ${DATA_DIR}`));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  return server;
}
if (require.main === module) start().catch((e) => { console.error(e); process.exit(1); });
module.exports = { app, start, bootstrapAdmin };
