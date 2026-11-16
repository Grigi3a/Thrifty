'use strict';
/* Crédits vendeur (v8).
   - Le vendeur recharge par virement / CashPlus / espèces ; l'administration valide la recharge à réception de l'argent.
   - Les crédits paient les options (remonter une annonce, mise à la une) et les frais de la remise en main propre.
   - Frais main propre : prélevés à la commande, remboursés si la commande est annulée ou remboursée.
     Un solde négatif est toléré jusqu'à « credit_limit » DH, pour que les premières ventes ne demandent aucune recharge.
   Thrifty ne détient jamais l'argent des acheteurs : seuls les vendeurs achètent des crédits, pour des services Thrifty. */
const { get, all, run, tx, getSetting, setSetting } = require('./db');

const num = (k, d) => { const n = Number(getSetting(k, d)); return Number.isFinite(n) ? n : Number(d); };
const prices = () => ({ bump: num('bump_price', '5'), feature: num('feature_price', '20'), featureDays: num('feature_days', '7'), bumpHours: 24 });
const creditLimit = () => num('credit_limit', '30');
const handMin = () => num('hand_min', '5');
const payInfo = () => ({ name: getSetting('pay_name', ''), rib: getSetting('pay_rib', ''), cashplus: getSetting('pay_cashplus', ''), note: getSetting('pay_note', '') });
const PACKS = [50, 100, 200];
const METHODS = { virement: 'Virement bancaire', cashplus: 'CashPlus / Wafacash', especes: 'Espèces remises à Thrifty' };
const KIND = { topup: 'Recharge', bump: 'Annonce remontée', feature: 'Mise à la une', hand_fee: 'Frais main propre', hand_refund: 'Frais main propre remboursés', adjust: 'Ajustement Thrifty' };

const balance = (uid) => { const u = get('SELECT credits FROM users WHERE id=?', uid); return u ? u.credits : 0; };
/* Mouvement de crédits : à appeler dans une transaction quand il accompagne une autre écriture. */
function move(uid, amount, kind, ref, note, adminId) {
  run('UPDATE users SET credits=credits+? WHERE id=?', amount, uid);
  const b = balance(uid);
  run('INSERT INTO credit_tx(user_id,amount,balance,kind,ref,note,admin_id,ts) VALUES(?,?,?,?,?,?,?,?)', uid, amount, b, kind, ref || null, note || '', adminId || null, Date.now());
  return b;
}
/* Frais main propre : taux × prix, avec un minimum, jamais plus que le prix. Taux 0 = gratuit (pas de minimum). */
const handFee = (price, rate) => (rate > 0 ? Math.min(price, Math.max(handMin(), Math.round(price * rate))) : 0);
const canPay = (credits, fee) => fee <= 0 || credits - fee >= -creditLimit();
function refundHand(o, code) {
  if (o.handover !== 'hand' || !(o.commission > 0)) return;
  if (get("SELECT 1 x FROM credit_tx WHERE kind='hand_refund' AND ref=?", o.id)) return;
  if (!get("SELECT 1 x FROM credit_tx WHERE kind='hand_fee' AND ref=?", o.id)) return;
  move(o.seller_id, Math.round(o.commission), 'hand_refund', o.id, code);
}
function stats() {
  const s = (sql) => get(sql).n || 0;
  return {
    creditsSold: s("SELECT SUM(amount) n FROM topups WHERE status='approved'"),
    optionsSold: -s("SELECT SUM(amount) n FROM credit_tx WHERE kind IN ('bump','feature')"),
    handFees: -s("SELECT SUM(amount) n FROM credit_tx WHERE kind IN ('hand_fee','hand_refund')"),
    debt: -s('SELECT SUM(credits) n FROM users WHERE credits<0'),
    pendingTopups: s("SELECT COUNT(*) n FROM topups WHERE status='pending'")
  };
}

function mount(c) {
  const { app, A, L, HttpError, bad, needUser, needAdmin, notify, notifyAdmins, idParam, dh } = c;
  const admin = [needUser, needAdmin];
  const txOut = (t) => ({ id: t.id, amount: t.amount, balance: t.balance, kind: t.kind, label: KIND[t.kind] || t.kind, note: t.note, ts: t.ts });
  const topOut = (t) => ({ id: t.id, amount: t.amount, method: t.method, methodLabel: METHODS[t.method] || t.method, reference: t.reference, status: t.status, note: t.note, ts: t.ts, decided: t.decided_ts });

  app.get('/api/credits', needUser, (req, res) => {
    const u = req.user.id;
    res.json({
      balance: balance(u), limit: creditLimit(), prices: prices(), packs: PACKS, methods: METHODS, pay: payInfo(), handMin: handMin(),
      tx: all('SELECT * FROM credit_tx WHERE user_id=? ORDER BY ts DESC, id DESC LIMIT 60', u).map(txOut),
      topups: all('SELECT * FROM topups WHERE user_id=? ORDER BY ts DESC LIMIT 20', u).map(topOut)
    });
  });
  app.post('/api/credits/topup', needUser, L.rateLimit('topup', 10, 3600000, (r) => 'u' + r.user.id), A(async (req, res) => {
    const b = req.body || {}, amount = L.int(b.amount), method = METHODS[b.method] ? b.method : null, ref = L.clean(b.reference, 80);
    if (!(amount >= 20 && amount <= 2000)) throw bad('Montant entre 20 et 2 000 DH.');
    if (!method) throw bad('Choisissez le moyen de paiement.');
    if (method !== 'especes' && ref.length < 3) throw bad('Indiquez la référence du virement ou du transfert : elle nous permet de retrouver votre paiement.');
    if (get("SELECT COUNT(*) n FROM topups WHERE user_id=? AND status='pending'", req.user.id).n >= 3) throw bad('Vous avez déjà 3 recharges en attente de validation.');
    const r = run('INSERT INTO topups(user_id,amount,method,reference,ts) VALUES(?,?,?,?,?)', req.user.id, amount, method, ref, Date.now());
    notifyAdmins(`Recharge à vérifier : ${req.user.name}, ${dh(amount)} (${METHODS[method]}${ref ? ', réf. ' + ref : ''}).`, '/admin/credits');
    res.json({ id: r.id });
  }));

  /* Options payantes : seulement avec un solde suffisant (pas de dette pour les options). */
  const ownLive = (req) => {
    const it = get('SELECT * FROM items WHERE id=?', idParam(req.params.id));
    if (!it) throw new HttpError(404, 'Annonce introuvable.');
    if (it.seller_id !== req.user.id) throw new HttpError(403, 'Cette annonce ne vous appartient pas.');
    if (it.status !== 'published') throw bad('Seule une annonce en ligne peut être mise en avant.');
    return it;
  };
  const needFunds = (uid, cost) => { const b = balance(uid); if (b < cost) throw new HttpError(402, `Solde insuffisant (${dh(b)}). Rechargez vos crédits pour utiliser cette option (${dh(cost)}).`); };
  app.post('/api/items/:id/bump', needUser, A(async (req, res) => {
    const it = ownLive(req), P = prices(), t = Date.now();
    const last = Math.max(it.bumped_at || 0, it.published_at || 0, it.created || 0);
    if (t - last < P.bumpHours * 3600000) { const h = Math.ceil((last + P.bumpHours * 3600000 - t) / 3600000); throw new HttpError(409, `Annonce déjà en tête des nouveautés. Vous pourrez la remonter dans ${h} h.`); }
    const b = tx(() => { needFunds(req.user.id, P.bump); run('UPDATE items SET bumped_at=? WHERE id=?', t, it.id); return move(req.user.id, -P.bump, 'bump', it.id, it.title); });
    res.json({ ok: true, balance: b });
  }));
  app.post('/api/items/:id/feature', needUser, A(async (req, res) => {
    const it = ownLive(req), P = prices(), t = Date.now();
    const until = Math.max(t, it.featured_until || 0) + P.featureDays * 864e5;
    const b = tx(() => { needFunds(req.user.id, P.feature); run('UPDATE items SET featured_until=? WHERE id=?', until, it.id); return move(req.user.id, -P.feature, 'feature', it.id, it.title); });
    res.json({ ok: true, balance: b, until });
  }));

  /* ---- administration ---- */
  app.get('/api/admin/credits', admin, (req, res) => {
    res.json({
      stats: stats(), prices: prices(), limit: creditLimit(), pay: payInfo(),
      topups: all("SELECT t.*, u.name, u.email, u.phone FROM topups t JOIN users u ON u.id=t.user_id ORDER BY t.status='pending' DESC, t.ts DESC LIMIT 200").map((t) => ({ ...topOut(t), user: { id: t.user_id, name: t.name, email: t.email, phone: t.phone } })),
      balances: all('SELECT id,name,email,credits FROM users WHERE credits<>0 AND deleted=0 ORDER BY credits ASC LIMIT 200')
    });
  });
  app.post('/api/admin/topups/:id/:action', admin, A(async (req, res) => {
    const t = get('SELECT * FROM topups WHERE id=?', idParam(req.params.id));
    if (!t) throw new HttpError(404, 'Recharge introuvable.');
    if (t.status !== 'pending') throw new HttpError(409, 'Recharge déjà traitée.');
    const a = req.params.action, note = L.clean((req.body || {}).note, 200);
    if (a === 'approve') {
      tx(() => { run("UPDATE topups SET status='approved', decided_ts=?, admin_id=?, note=? WHERE id=?", Date.now(), req.user.id, note, t.id); move(t.user_id, t.amount, 'topup', t.id, METHODS[t.method] + (t.reference ? ' · ' + t.reference : ''), req.user.id); });
      notify(t.user_id, `Recharge validée : ${dh(t.amount)} ajoutés à vos crédits.`, '/credits');
    } else if (a === 'reject') {
      run("UPDATE topups SET status='rejected', decided_ts=?, admin_id=?, note=? WHERE id=?", Date.now(), req.user.id, note, t.id);
      notify(t.user_id, `Recharge de ${dh(t.amount)} non validée${note ? ' : ' + note : ' : paiement introuvable'}. Contactez-nous si besoin.`, '/credits');
    } else throw new HttpError(404, 'Action inconnue.');
    res.json({ ok: true });
  }));
  app.post('/api/admin/credits/adjust', admin, A(async (req, res) => {
    const b = req.body || {}, u = get('SELECT id FROM users WHERE id=? AND deleted=0', idParam(b.userId)), amount = L.int(b.amount), note = L.clean(b.note, 200);
    if (!u) throw new HttpError(404, 'Membre introuvable.');
    if (!amount || Math.abs(amount) > 2000) throw bad('Montant non nul, entre −2 000 et 2 000 DH.');
    if (note.length < 3) throw bad('Indiquez le motif (visible par le membre).');
    const bal = tx(() => move(u.id, amount, 'adjust', null, note, req.user.id));
    notify(u.id, `Vos crédits ont été ajustés de ${amount > 0 ? '+' : ''}${dh(amount)} : ${note}.`, '/credits');
    res.json({ ok: true, balance: bal });
  }));
  app.post('/api/admin/credit-settings', admin, A(async (req, res) => {
    const b = req.body || {}, bump = L.int(b.bump), feat = L.int(b.feature), days = L.int(b.featureDays);
    if (!(bump >= 1 && bump <= 500) || !(feat >= 1 && feat <= 1000) || !(days >= 1 && days <= 60)) throw bad('Prix entre 1 et 1 000 DH, durée entre 1 et 60 jours.');
    setSetting('bump_price', bump); setSetting('feature_price', feat); setSetting('feature_days', days);
    setSetting('pay_name', L.clean(b.payName, 100)); setSetting('pay_rib', L.clean(b.payRib, 60)); setSetting('pay_cashplus', L.clean(b.payCashplus, 120)); setSetting('pay_note', L.clean(b.payNote, 300));
    res.json({ ok: true });
  }));
}

module.exports = { mount, balance, move, handFee, handMin, canPay, creditLimit, refundHand, prices, stats, PACKS };
