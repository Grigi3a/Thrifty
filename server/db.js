'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(process.env.DB_FILE || path.join(DATA_DIR, 'thrifty.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, pass_hash TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'user',
  banned INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, terms_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER NOT NULL, expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS resets(
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS items(
  id INTEGER PRIMARY KEY, seller_id INTEGER NOT NULL REFERENCES users(id), univ TEXT NOT NULL, cat TEXT NOT NULL,
  title TEXT NOT NULL, brand TEXT NOT NULL DEFAULT '', size TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '',
  cond TEXT NOT NULL DEFAULT '', defects TEXT NOT NULL DEFAULT '', descr TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0, old_price INTEGER, city TEXT NOT NULL DEFAULT '', pack TEXT NOT NULL DEFAULT 'Moyen',
  status TEXT NOT NULL DEFAULT 'draft', paused_hide INTEGER NOT NULL DEFAULT 0, search TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL, updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status, created DESC);
CREATE INDEX IF NOT EXISTS idx_items_seller ON items(seller_id, status);
CREATE TABLE IF NOT EXISTS item_photos(
  id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE, file TEXT NOT NULL, pos INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_item ON item_photos(item_id, pos);
CREATE TABLE IF NOT EXISTS uploads(file TEXT PRIMARY KEY, user_id INTEGER NOT NULL, ts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS favs(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  price_at_fav INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY(user_id, item_id)
);
CREATE TABLE IF NOT EXISTS convos(
  id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  buyer_id INTEGER NOT NULL REFERENCES users(id), seller_id INTEGER NOT NULL REFERENCES users(id),
  agreed INTEGER, created INTEGER NOT NULL, UNIQUE(item_id, buyer_id)
);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY, convo_id INTEGER NOT NULL REFERENCES convos(id) ON DELETE CASCADE, from_id INTEGER NOT NULL,
  type TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', amount INTEGER, status TEXT, counter INTEGER NOT NULL DEFAULT 0, ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msgs_convo ON messages(convo_id, ts);
CREATE TABLE IF NOT EXISTS convo_reads(
  convo_id INTEGER NOT NULL REFERENCES convos(id) ON DELETE CASCADE, user_id INTEGER NOT NULL, last_ts INTEGER NOT NULL, PRIMARY KEY(convo_id, user_id)
);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY, item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  item_title TEXT NOT NULL, item_brand TEXT NOT NULL DEFAULT '', item_size TEXT NOT NULL DEFAULT '', item_photo TEXT,
  buyer_id INTEGER NOT NULL REFERENCES users(id), seller_id INTEGER NOT NULL REFERENCES users(id),
  price INTEGER NOT NULL, ship INTEGER NOT NULL, total INTEGER NOT NULL, rate REAL NOT NULL, commission REAL NOT NULL, net REAL NOT NULL,
  status TEXT NOT NULL, prev_status TEXT, payout TEXT NOT NULL, pack TEXT NOT NULL DEFAULT 'Moyen',
  ship_name TEXT NOT NULL, ship_address TEXT NOT NULL, ship_city TEXT NOT NULL, ship_phone TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cod', tracking TEXT NOT NULL DEFAULT '', payout_ref TEXT NOT NULL DEFAULT '',
  issue_reason TEXT, issue_text TEXT, issue_ts INTEGER, created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id, created DESC);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id, created DESC);
CREATE TABLE IF NOT EXISTS order_events(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, text TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS reviews(order_id INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE, rating INTEGER NOT NULL, text TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS notifs(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, text TEXT NOT NULL, link TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifs(user_id, ts DESC);
CREATE TABLE IF NOT EXISTS contacts(id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', topic TEXT NOT NULL, text TEXT NOT NULL, ts INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

/* ---- Migrations additives (sûres sur une base existante) ---- */
function addCol(table, col, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
}
addCol('items', 'fit', "TEXT NOT NULL DEFAULT ''");
addCol('items', 'measures', "TEXT NOT NULL DEFAULT ''");
addCol('items', 'published_at', 'INTEGER');
db.exec("UPDATE items SET published_at=created WHERE published_at IS NULL AND status IN ('published','sold','hidden')");
addCol('users', 'bio', "TEXT NOT NULL DEFAULT ''");
addCol('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');
addCol('orders', 'group_id', 'INTEGER');
addCol('orders', 'bundle_title', "TEXT NOT NULL DEFAULT ''");
/* v7 : remise en main propre (code de remise montré à l'acheteur seul), vues des annonces. */
addCol('orders', 'handover', "TEXT NOT NULL DEFAULT 'carrier'");
addCol('orders', 'hand_code', "TEXT NOT NULL DEFAULT ''");
addCol('orders', 'hand_tries', 'INTEGER NOT NULL DEFAULT 0');
addCol('items', 'views', 'INTEGER NOT NULL DEFAULT 0');
/* v8 : crédits vendeur (en DH entiers), options payantes (remontée, mise à la une). */
addCol('users', 'credits', 'INTEGER NOT NULL DEFAULT 0');
addCol('items', 'bumped_at', 'INTEGER NOT NULL DEFAULT 0');
addCol('items', 'featured_until', 'INTEGER NOT NULL DEFAULT 0');
db.exec(`
CREATE TABLE IF NOT EXISTS credit_tx(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), amount INTEGER NOT NULL, balance INTEGER NOT NULL,
  kind TEXT NOT NULL, ref INTEGER, note TEXT NOT NULL DEFAULT '', admin_id INTEGER, ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_tx(user_id, ts DESC);
CREATE TABLE IF NOT EXISTS topups(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), amount INTEGER NOT NULL, method TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', note TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL, decided_ts INTEGER, admin_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_topups_status ON topups(status, ts DESC);
`);
db.exec(`
CREATE TABLE IF NOT EXISTS collections(
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, descr TEXT NOT NULL DEFAULT '', cover TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL, updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS collection_items(
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  pos INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(collection_id, item_id)
);
CREATE TABLE IF NOT EXISTS bundles(
  id INTEGER PRIMARY KEY, seller_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, price INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL, updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bundle_items(
  bundle_id INTEGER NOT NULL REFERENCES bundles(id) ON DELETE CASCADE, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  PRIMARY KEY(bundle_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_bundle_items_item ON bundle_items(item_id);
CREATE TABLE IF NOT EXISTS saved_searches(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, params TEXT NOT NULL,
  alerts INTEGER NOT NULL DEFAULT 1, email INTEGER NOT NULL DEFAULT 0, last_checked INTEGER NOT NULL, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reports(
  id INTEGER PRIMARY KEY, reporter_id INTEGER NOT NULL, target_type TEXT NOT NULL, target_id INTEGER NOT NULL, reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', note TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL, handled_ts INTEGER
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, ts DESC);
CREATE TABLE IF NOT EXISTS email_tokens(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, purpose TEXT NOT NULL, expires INTEGER NOT NULL);
`);

const cache = new Map();
const prep = (sql) => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };
const clean = (p) => p.map((x) => (x === undefined ? null : x));
const get = (sql, ...p) => prep(sql).get(...clean(p)) || null;
const all = (sql, ...p) => prep(sql).all(...clean(p));
const run = (sql, ...p) => { const r = prep(sql).run(...clean(p)); return { changes: Number(r.changes), id: Number(r.lastInsertRowid) }; };
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ } throw e; }
}
const getSetting = (k, d) => { const r = get('SELECT value FROM settings WHERE key=?', k); return r ? r.value : d; };
const setSetting = (k, v) => run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, String(v));

module.exports = { db, get, all, run, tx, getSetting, setSetting, DATA_DIR, UPLOAD_DIR };
