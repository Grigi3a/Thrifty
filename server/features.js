'use strict';
/* Nouvelles fonctions : Drops, lots, profils vendeurs, signalements, vérification e-mail, recherches sauvegardées. */
const crypto = require('node:crypto');

function mount(c) {
  const { app, A, get, all, run, tx, L, SH, HttpError, bad, needUser, needAdmin, notify, notifyAdmins, itemsOut, ITEM_SELECT, idParam, money, evt, code, dh, base, buildItemFilter, sellerStats, now, rb } = c;
  const admin = [needUser, needAdmin];
  const slugify = (s) => L.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'drop';
  const AV = "i.status='published' AND u.banned=0";

  /* ================= DROPS (collections éditoriales) ================= */
  const collOut = (r, withItems) => {
    const items = itemsOut(all(`${ITEM_SELECT} JOIN collection_items ci ON ci.item_id=i.id WHERE ci.collection_id=? AND ${AV} ORDER BY ci.pos, i.id`, r.id));
    const o = { id: r.id, slug: r.slug, title: r.title, desc: r.descr, cover: r.cover ? '/uploads/' + r.cover : (items[0] && items[0].photos[0]) || null, count: items.length };
    if (withItems) o.items = items; else o.preview = items.slice(0, 4).map((i) => ({ id: i.id, photo: i.photos[0] || null }));
    return o;
  };
  app.get('/api/collections', A(async (req, res) => {
    // Une collection sans pièce disponible n'est jamais montrée.
    const rows = all('SELECT * FROM collections WHERE active=1 ORDER BY position, id DESC');
    res.json({ collections: rows.map((r) => collOut(r, false)).filter((x) => x.count > 0) });
  }));
  app.get('/api/collections/:slug', A(async (req, res) => {
    const r = get('SELECT * FROM collections WHERE slug=? AND active=1', String(req.params.slug));
    const o = r && collOut(r, true);
    if (!o || !o.count) throw new HttpError(404, 'Cette collection n\'est pas disponible.');
    res.json({ collection: o });
  }));
  const adminColl = (r) => {
    const items = all('SELECT i.id,i.title,i.status,i.price FROM collection_items ci JOIN items i ON i.id=ci.item_id WHERE ci.collection_id=? ORDER BY ci.pos', r.id);
    return { id: r.id, slug: r.slug, title: r.title, desc: r.descr, cover: r.cover ? '/uploads/' + r.cover : '', coverFile: r.cover, position: r.position, active: !!r.active, items };
  };
  app.get('/api/admin/collections', admin, (req, res) => res.json({ collections: all('SELECT * FROM collections ORDER BY position, id DESC').map(adminColl) }));
  function collBody(b) {
    const title = L.clean(b.title, 70), descr = L.clean(b.desc, 300), position = Math.max(0, Math.min(999, L.int(b.position) || 0));
    const cover = typeof b.cover === 'string' && /^[a-f0-9]{32}\.jpg$/.test(b.cover) ? b.cover : '';
    if (title.length < 3) throw bad('Donnez un titre à la collection (3 caractères minimum).');
    const ids = [...new Set((Array.isArray(b.items) ? b.items : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 60);
    return { title, descr, position, cover, ids, active: b.active === false ? 0 : 1 };
  }
  const saveColl = (id, v) => {
    run('DELETE FROM collection_items WHERE collection_id=?', id);
    v.ids.forEach((iid, k) => { if (get('SELECT 1 x FROM items WHERE id=?', iid)) run('INSERT OR IGNORE INTO collection_items(collection_id,item_id,pos) VALUES(?,?,?)', id, iid, k); });
  };
  app.post('/api/admin/collections', admin, A(async (req, res) => {
    const v = collBody(rb(req)); let slug = slugify(v.title), n = 1;
    while (get('SELECT 1 x FROM collections WHERE slug=?', slug)) slug = slugify(v.title) + '-' + (++n);
    const id = tx(() => { const r = run('INSERT INTO collections(slug,title,descr,cover,position,active,created,updated) VALUES(?,?,?,?,?,?,?,?)', slug, v.title, v.descr, v.cover, v.position, v.active, now(), now()); saveColl(r.id, v); return r.id; });
    res.json({ id, slug });
  }));
  app.put('/api/admin/collections/:id', admin, A(async (req, res) => {
    const id = idParam(req.params.id), v = collBody(rb(req));
    if (!get('SELECT 1 x FROM collections WHERE id=?', id)) throw new HttpError(404, 'Collection introuvable.');
    tx(() => { run('UPDATE collections SET title=?,descr=?,cover=?,position=?,active=?,updated=? WHERE id=?', v.title, v.descr, v.cover, v.position, v.active, now(), id); saveColl(id, v); });
    res.json({ ok: true });
  }));
  app.delete('/api/admin/collections/:id', admin, (req, res) => { run('DELETE FROM collections WHERE id=?', idParam(req.params.id)); res.json({ ok: true }); });

  /* ================= LOTS ================= */
  /* Disponibilité calculée en direct : actif, ≥ 2 pièces, toutes en ligne chez le même vendeur, prix < somme. */
  function bundleOut(b, forOwner) {
    const items = all(`SELECT i.id,i.title,i.brand,i.size,i.cond,i.price,i.status,i.seller_id,(SELECT file FROM item_photos WHERE item_id=i.id ORDER BY pos LIMIT 1) photo FROM bundle_items bi JOIN items i ON i.id=bi.item_id WHERE bi.bundle_id=? ORDER BY i.id`, b.id);
    const sum = items.reduce((s, i) => s + i.price, 0), seller = get('SELECT id,name,banned FROM users WHERE id=?', b.seller_id);
    const allUp = items.length >= 2 && items.every((i) => i.status === 'published' && i.seller_id === b.seller_id);
    const available = !!b.active && allUp && !seller.banned && b.price < sum;
    const m = money(b.price);
    const o = {
      id: b.id, title: b.title, price: b.price, sum, saving: Math.max(0, sum - b.price), pct: sum ? Math.round(((sum - b.price) / sum) * 100) : 0, available, active: !!b.active,
      seller: { id: seller.id, name: seller.name }, ship: m.ship, total: m.total,
      items: items.map((i) => ({ id: i.id, title: i.title, brand: i.brand, size: i.size, cond: i.cond, price: i.price, status: i.status, photo: i.photo ? '/uploads/' + i.photo : null }))
    };
    if (forOwner) { o.net = m.net; o.commission = m.commission; o.stale = !available && !!b.active; }
    return o;
  }
  function bundleBody(req, selfId) {
    const b = rb(req), title = L.clean(b.title, 70), price = L.int(b.price);
    const ids = [...new Set((Array.isArray(b.items) ? b.items : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (title.length < 3) throw bad('Donnez un nom au lot.');
    if (ids.length < 2 || ids.length > 12) throw bad('Un lot contient de 2 à 12 pièces.');
    const rows = ids.map((id) => get("SELECT id,price,status,seller_id FROM items WHERE id=?", id));
    if (rows.some((r) => !r || r.seller_id !== req.user.id)) throw bad('Vous ne pouvez regrouper que vos propres annonces.');
    if (rows.some((r) => r.status !== 'published')) throw bad('Toutes les pièces du lot doivent être en ligne.');
    const sum = rows.reduce((s, r) => s + r.price, 0);
    if (!(price >= 1 && price < sum)) throw bad(`Le prix du lot doit être inférieur à la somme des pièces (${sum} DH).`);
    return { title, price, ids };
  }
  app.get('/api/bundles', needUser, (req, res) => res.json({ bundles: all('SELECT * FROM bundles WHERE seller_id=? ORDER BY id DESC', req.user.id).map((b) => bundleOut(b, true)) }));
  app.post('/api/bundles', needUser, L.rateLimit('bundle', 60, 3600000, (r) => 'u' + r.user.id), A(async (req, res) => {
    const v = bundleBody(req);
    const id = tx(() => { const r = run('INSERT INTO bundles(seller_id,title,price,active,created,updated) VALUES(?,?,?,1,?,?)', req.user.id, v.title, v.price, now(), now()); v.ids.forEach((i) => run('INSERT INTO bundle_items(bundle_id,item_id) VALUES(?,?)', r.id, i)); return r.id; });
    res.json({ id });
  }));
  const own = (req) => { const b = get('SELECT * FROM bundles WHERE id=?', idParam(req.params.id)); if (!b || b.seller_id !== req.user.id) throw new HttpError(404, 'Lot introuvable.'); return b; };
  app.put('/api/bundles/:id', needUser, A(async (req, res) => {
    const b = own(req), v = bundleBody(req);
    tx(() => { run('UPDATE bundles SET title=?,price=?,updated=? WHERE id=?', v.title, v.price, now(), b.id); run('DELETE FROM bundle_items WHERE bundle_id=?', b.id); v.ids.forEach((i) => run('INSERT INTO bundle_items(bundle_id,item_id) VALUES(?,?)', b.id, i)); });
    res.json({ ok: true });
  }));
  app.post('/api/bundles/:id/toggle', needUser, (req, res) => { const b = own(req); run('UPDATE bundles SET active=?,updated=? WHERE id=?', b.active ? 0 : 1, now(), b.id); res.json({ active: !b.active }); });
  app.delete('/api/bundles/:id', needUser, (req, res) => { run('DELETE FROM bundles WHERE id=?', own(req).id); res.json({ ok: true }); });
  app.get('/api/bundles/:id', A(async (req, res) => {
    const b = get('SELECT * FROM bundles WHERE id=?', idParam(req.params.id));
    if (!b) throw new HttpError(404, 'Lot introuvable.');
    res.json({ bundle: bundleOut(b, !!(req.user && req.user.id === b.seller_id)) });
  }));
  app.get('/api/items/:id/bundles', A(async (req, res) => {
    const rows = all('SELECT b.* FROM bundles b JOIN bundle_items bi ON bi.bundle_id=b.id WHERE bi.item_id=? AND b.active=1', idParam(req.params.id));
    res.json({ bundles: rows.map((b) => bundleOut(b, false)).filter((b) => b.available) });
  }));
  app.post('/api/bundles/:id/order', needUser, L.rateLimit('order', 30, 3600000, (r) => 'u' + r.user.id), A(async (req, res) => {
    const b = rb(req), errors = [];
    const name = L.clean(b.name, 60), addr = L.clean(b.address, 200), phone = L.normPhone(b.phone), city = SH.CITIES.includes(b.city) ? b.city : '';
    if (name.length < 2) errors.push('Renseignez le nom du destinataire.');
    if (addr.length < 5) errors.push('Renseignez l\'adresse de livraison.');
    if (!city) errors.push('Choisissez la ville de livraison.');
    if (!phone) errors.push('Entrez un numéro de téléphone valide.');
    if (errors.length) throw bad(errors[0], errors);
    const first = tx(() => {
      const bd = get('SELECT * FROM bundles WHERE id=?', idParam(req.params.id));
      if (!bd) throw new HttpError(404, 'Lot introuvable.');
      if (bd.seller_id === req.user.id) throw bad('Vous ne pouvez pas acheter votre propre lot.');
      const view = bundleOut(bd, false);
      if (!view.available) throw new HttpError(409, 'Ce lot n\'est plus disponible : une pièce a été vendue ou le vendeur l\'a modifié.');
      // Marquage atomique de chaque pièce : si l'une est déjà vendue, tout est annulé (la transaction est rejouée à zéro).
      for (const it of view.items) if (run("UPDATE items SET status='sold', updated=? WHERE id=? AND status='published'", now(), it.id).changes !== 1) throw new HttpError(409, 'Une pièce du lot vient d\'être vendue.');
      let left = view.price, gid = null, firstId = null;
      view.items.forEach((it, k) => {
        const last = k === view.items.length - 1;
        const share = last ? left : Math.round((view.price * it.price) / view.sum);
        left -= share;
        const m = money(share), ship = k === 0 ? m.ship : 0; // livraison facturée une seule fois : un seul colis
        const full = get('SELECT pack FROM items WHERE id=?', it.id);
        const r = run(`INSERT INTO orders(item_id,item_title,item_brand,item_size,item_photo,buyer_id,seller_id,price,ship,total,rate,commission,net,status,payout,pack,ship_name,ship_address,ship_city,ship_phone,payment_method,created,group_id,bundle_title)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'to_ship','pending',?,?,?,?,?,'cod',?,?,?)`,
          it.id, it.title, it.brand, it.size, it.photo ? it.photo.replace('/uploads/', '') : null, req.user.id, bd.seller_id, share, ship, share + ship, m.rate, m.commission, m.net, full.pack, name, addr, city, phone, now(), gid, bd.title);
        const id = r.id;
        if (k === 0) { gid = id; firstId = id; }
        run('UPDATE orders SET group_id=? WHERE id=?', gid, id);
        evt(id, `Commande passée (lot « ${bd.title} »)`);
      });
      notify(bd.seller_id, `Vente du lot « ${bd.title} » (${view.items.length} pièces, ${dh(view.price)}). Préparez un seul colis.`, '/commande/' + firstId);
      return firstId;
    });
    res.json({ id: first });
  }));

  /* ================= PROFILS VENDEURS ================= */
  app.get('/api/sellers/:id', A(async (req, res) => {
    const id = idParam(req.params.id), u = get('SELECT id,name,city,bio,email_verified,created,banned FROM users WHERE id=? AND deleted=0', id);
    if (!u || u.banned) throw new HttpError(404, 'Vendeur introuvable.');
    const st = sellerStats(id);
    const reviews = all(`SELECT r.rating,r.text,r.ts,b.name buyer FROM reviews r JOIN orders o ON o.id=r.order_id JOIN users b ON b.id=o.buyer_id WHERE o.seller_id=? ORDER BY r.ts DESC LIMIT 30`, id)
      .map((r) => ({ rating: r.rating, text: r.text, ts: r.ts, buyer: String(r.buyer).split(' ')[0] }));
    const items = itemsOut(all(`${ITEM_SELECT} WHERE i.seller_id=? AND ${AV} ORDER BY i.created DESC LIMIT 60`, id));
    const bundles = all('SELECT * FROM bundles WHERE seller_id=? AND active=1', id).map((b) => bundleOut(b, false)).filter((b) => b.available);
    res.json({
      seller: { id: u.id, name: u.name, city: u.city, bio: u.bio || '', since: u.created, emailVerified: !!u.email_verified },
      stats: { sales: st.sales, reviews: st.reviews, avg: st.avg, available: items.length, respond: st.respond },
      handover: [{ id: 'carrier', label: 'Livraison par transporteur', fee: money(0).ship }],
      reviews, items, bundles
    });
  }));

  /* ================= SIGNALEMENTS ================= */
  const TARGETS = { item: 'items', user: 'users', review: 'reviews' };
  app.post('/api/report', needUser, L.rateLimit('report', 10, 3600000, (r) => 'u' + r.user.id), A(async (req, res) => {
    const b = rb(req), type = TARGETS[b.type] ? b.type : '', tid = L.int(b.id), reason = L.clean(b.reason, 40), note = L.cleanText(b.note, 500);
    if (!type || tid < 1) throw bad('Signalement invalide.');
    if (!reason) throw bad('Choisissez un motif.');
    const exists = type === 'review' ? get('SELECT 1 x FROM reviews WHERE order_id=?', tid) : get(`SELECT 1 x FROM ${TARGETS[type]} WHERE id=?`, tid);
    if (!exists) throw new HttpError(404, 'Élément introuvable.');
    if (type === 'user' && tid === req.user.id) throw bad('Vous ne pouvez pas vous signaler vous-même.');
    if (get("SELECT 1 x FROM reports WHERE reporter_id=? AND target_type=? AND target_id=? AND status='open'", req.user.id, type, tid)) return res.json({ ok: true, duplicate: true });
    run('INSERT INTO reports(reporter_id,target_type,target_id,reason,note,ts) VALUES(?,?,?,?,?,?)', req.user.id, type, tid, reason, note, now());
    notifyAdmins(`Nouveau signalement (${b.type}) : ${reason}`, '/admin/signalements');
    res.json({ ok: true });
  }));
  app.get('/api/admin/reports', admin, (req, res) => {
    const rows = all(`SELECT r.*, u.name reporter FROM reports r JOIN users u ON u.id=r.reporter_id ORDER BY (r.status='open') DESC, r.ts DESC LIMIT 200`).map((r) => {
      let label = '';
      if (r.target_type === 'item') { const i = get('SELECT title,status FROM items WHERE id=?', r.target_id); label = i ? `${i.title} (${i.status})` : 'annonce supprimée'; }
      else if (r.target_type === 'user') { const u = get('SELECT name,banned FROM users WHERE id=?', r.target_id); label = u ? `${u.name}${u.banned ? ' (suspendu)' : ''}` : 'compte supprimé'; }
      else { const v = get('SELECT rating,text FROM reviews WHERE order_id=?', r.target_id); label = v ? `${v.rating}/5 « ${v.text.slice(0, 80)} »` : 'avis supprimé'; }
      return { id: r.id, type: r.target_type, targetId: r.target_id, reason: r.reason, note: r.note, status: r.status, ts: r.ts, reporter: r.reporter, label };
    });
    res.json({ reports: rows });
  });
  app.post('/api/admin/reports/:id/:action', admin, A(async (req, res) => {
    const r = get('SELECT * FROM reports WHERE id=?', idParam(req.params.id));
    if (!r) throw new HttpError(404, 'Signalement introuvable.');
    const a = req.params.action;
    tx(() => {
      if (a === 'hide' && r.target_type === 'item') run("UPDATE items SET status='hidden' WHERE id=? AND status='published'", r.target_id);
      else if (a === 'ban' && r.target_type === 'user') { const u = get('SELECT role FROM users WHERE id=?', r.target_id); if (!u || u.role === 'admin') throw bad('Action impossible.'); run('UPDATE users SET banned=1 WHERE id=?', r.target_id); run('DELETE FROM sessions WHERE user_id=?', r.target_id); }
      else if (a === 'delete' && r.target_type === 'review') run('DELETE FROM reviews WHERE order_id=?', r.target_id);
      else if (a !== 'dismiss' && a !== 'resolve') throw bad('Action inconnue.');
      run('UPDATE reports SET status=?, handled_ts=? WHERE id=?', a === 'dismiss' ? 'dismissed' : 'resolved', now(), r.id);
    });
    res.json({ ok: true });
  }));

  /* ================= E-MAIL VÉRIFIÉ (nécessite SMTP) ================= */
  app.post('/api/me/verify-email', needUser, L.rateLimit('verify', 5, 3600000, (r) => 'u' + r.user.id), A(async (req, res) => {
    if (!process.env.SMTP_URL) throw new HttpError(503, 'L\'envoi d\'e-mails n\'est pas encore configuré sur ce site.');
    if (req.user.email_verified) return res.json({ ok: true, already: true });
    const t = crypto.randomBytes(24).toString('base64url');
    run("DELETE FROM email_tokens WHERE user_id=? AND purpose='verify'", req.user.id);
    run("INSERT INTO email_tokens(token_hash,user_id,purpose,expires) VALUES(?,?,'verify',?)", L.sha(t), req.user.id, now() + 24 * 3600000);
    const ok = await L.sendMail(req.user.email, 'Confirmez votre e-mail Thrifty', `Salam ${req.user.name},\n\nPour confirmer votre adresse e-mail, ouvrez ce lien (valable 24 h) :\n${base(req)}/verifier-email?token=${t}\n`);
    if (!ok) throw new HttpError(503, 'L\'e-mail n\'a pas pu être envoyé. Réessayez plus tard.');
    res.json({ ok: true });
  }));
  app.post('/api/me/verify-email/confirm', needUser, A(async (req, res) => {
    const t = String(rb(req).token || ''), row = get("SELECT * FROM email_tokens WHERE token_hash=? AND purpose='verify'", L.sha(t));
    if (!row || row.expires < now() || row.user_id !== req.user.id) throw bad('Lien invalide ou expiré.');
    tx(() => { run('UPDATE users SET email_verified=1 WHERE id=?', req.user.id); run('DELETE FROM email_tokens WHERE token_hash=?', row.token_hash); });
    res.json({ ok: true });
  }));

  /* ================= RECHERCHES SAUVEGARDÉES + ALERTES ================= */
  const KEYS = ['univ', 'cat', 'size', 'cond', 'max', 'brand', 'zone', 'city', 'q'];
  const cleanParams = (q) => { const o = {}; for (const k of KEYS) { const v = L.clean(String(q && q[k] != null ? q[k] : ''), 120); if (v) o[k] = v; } return o; };
  const ssOut = (s) => ({ id: s.id, name: s.name, params: JSON.parse(s.params), alerts: !!s.alerts, email: !!s.email, created: s.created });
  app.get('/api/searches', needUser, (req, res) => res.json({ searches: all('SELECT * FROM saved_searches WHERE user_id=? ORDER BY id DESC', req.user.id).map(ssOut), mailEnabled: !!process.env.SMTP_URL }));
  function ssBody(req) {
    const b = rb(req), params = cleanParams(b.params), name = L.clean(b.name, 50);
    if (!Object.keys(params).length) throw bad('Choisissez au moins un filtre avant d\'enregistrer la recherche.');
    return { params, name: name || 'Ma recherche', alerts: b.alerts === false ? 0 : 1, email: b.email === true && process.env.SMTP_URL ? 1 : 0 };
  }
  app.post('/api/searches', needUser, A(async (req, res) => {
    if (get('SELECT COUNT(*) n FROM saved_searches WHERE user_id=?', req.user.id).n >= 20) throw bad('Vous pouvez enregistrer 20 recherches au maximum.');
    const v = ssBody(req), r = run('INSERT INTO saved_searches(user_id,name,params,alerts,email,last_checked,created) VALUES(?,?,?,?,?,?,?)', req.user.id, v.name, JSON.stringify(v.params), v.alerts, v.email, now(), now());
    res.json({ id: r.id });
  }));
  const ownS = (req) => { const s = get('SELECT * FROM saved_searches WHERE id=?', idParam(req.params.id)); if (!s || s.user_id !== req.user.id) throw new HttpError(404, 'Recherche introuvable.'); return s; };
  app.put('/api/searches/:id', needUser, A(async (req, res) => {
    const s = ownS(req), b = rb(req), name = L.clean(b.name, 50) || s.name;
    const alerts = b.alerts === undefined ? s.alerts : b.alerts ? 1 : 0, email = b.email === undefined ? s.email : (b.email && process.env.SMTP_URL ? 1 : 0);
    // Réactiver les alertes repart de maintenant : pas de rafale sur d'anciennes annonces.
    run('UPDATE saved_searches SET name=?, alerts=?, email=?, last_checked=CASE WHEN ?=1 AND alerts=0 THEN ? ELSE last_checked END WHERE id=?', name, alerts, email, alerts, now(), s.id);
    res.json({ ok: true });
  }));
  app.delete('/api/searches/:id', needUser, (req, res) => { run('DELETE FROM saved_searches WHERE id=?', ownS(req).id); res.json({ ok: true }); });

  /* Tâche périodique : au plus une notification regroupée par recherche et par passage (pas de doublon, pas de rafale). */
  let busy = false;
  async function runAlerts() {
    if (busy) return; busy = true;
    try {
      const t = now();
      for (const s of all('SELECT * FROM saved_searches WHERE alerts=1')) {
        if (t - s.last_checked < 15 * 60000) continue;
        const f = buildItemFilter(JSON.parse(s.params));
        const rows = all(`SELECT i.id,i.title FROM items i JOIN users u ON u.id=i.seller_id WHERE ${f.w.join(' AND ')} AND i.published_at>? AND i.seller_id<>? ORDER BY i.published_at DESC LIMIT 50`, ...f.p, s.last_checked, s.user_id);
        run('UPDATE saved_searches SET last_checked=? WHERE id=?', t, s.id);
        if (!rows.length) continue;
        const link = '/catalogue?' + new URLSearchParams(JSON.parse(s.params)).toString();
        const msg = rows.length === 1 ? `Nouveau pour « ${s.name} » : ${rows[0].title}` : `${rows.length} nouvelles pièces pour « ${s.name} »`;
        notify(s.user_id, msg, rows.length === 1 ? '/article/' + rows[0].id : link);
        if (s.email && process.env.SMTP_URL) {
          const u = get('SELECT email,name FROM users WHERE id=? AND banned=0', s.user_id);
          if (u) L.sendMail(u.email, `Thrifty · ${msg}`, `Salam ${u.name},\n\n${msg}.\nVoir : ${(process.env.BASE_URL || '').replace(/\/$/, '')}${link}\n\nVous recevez ce message car vous avez activé l'alerte e-mail. Désactivez-la dans « Mes recherches ».`).catch(() => {});
        }
      }
    } catch (e) { console.error('alertes :', e.message); } finally { busy = false; }
  }
  setInterval(runAlerts, 5 * 60000).unref();
  app.runAlerts = runAlerts; // utilisé par les tests
}

module.exports = { mount };
