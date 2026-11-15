/* Vues compte : connexion, messages, paiement, commandes, vente, dressing. */
(function () {
  'use strict';
  const T = window.T, SH = T.SH, { esc, dh, $, $$ } = T, DJ = T.DJ;
  const fld = (id, label, inner, hint) => `<div class="field"><label for="${id}">${label}</label>${inner}${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  const inp = (id, type, extra) => `<input class="in" id="${id}" name="${id}" type="${type}" ${extra || ''}>`;
  const row = (t) => `<div class="mini"><span class="grow"><b>${esc(t)}</b></span></div>`;

  /* ---------- Authentification ---------- */
  T.afterLogin = async (u) => { T.user = u; T.favsLoaded = false; T.favs = new Set(); T.loadFavs(); T.pollBadges(); };
  const authShell = (title, sub, body) => `<div class="wrap sp"><div class="panel" style="max-width:480px;margin-inline:auto"><h1 class="h2" style="font-size:34px">${title}</h1><p class="muted" style="margin:6px 0 20px">${sub}</p>${body}</div></div>`;
  T.route(/^\/connexion$/, () => {
    if (T.user) return T.go(T.next(), true), '';
    T.title('Connexion');
    return authShell(`${esc(DJ.hello)} !`, 'Connectez-vous pour acheter, vendre et suivre vos commandes.', `<form class="stack" data-form="login" novalidate>${fld('email', 'E-mail', inp('email', 'email', 'autocomplete="email" required'))}${fld('password', 'Mot de passe', inp('password', 'password', 'autocomplete="current-password" required'))}<button class="btn btn-fill btn-block" type="submit">${esc(DJ.login)}</button></form>
      <p class="small" style="margin-top:16px"><a class="link" href="/mot-de-passe-oublie">Mot de passe oublié ?</a></p><p class="small" style="margin-top:8px">Pas encore de compte ? <a class="link" href="/inscription${location.search}">${esc(DJ.signup)}</a></p>`);
  });
  T.forms.login = async (f) => {
    T.fieldErr(f, ''); const d = T.formData(f);
    try { const r = await T.post('/auth/login', { email: d.email, password: d.password }); await T.afterLogin(r.user); T.toast(`${DJ.hi} ${r.user.name} !`); T.go(T.next(), true); } catch (e) { T.fieldErr(f, e.message); }
  };
  T.route(/^\/inscription$/, () => {
    if (T.user) return T.go('/', true), '';
    T.title('Inscription');
    return authShell(`${esc(DJ.signup)}`, 'Gratuit, en une minute. Achetez et vendez avec le même compte.', `<form class="stack" data-form="register" novalidate>${fld('name', 'Prénom ou pseudo', inp('name', 'text', 'autocomplete="given-name" maxlength="40" required'))}${fld('email', 'E-mail', inp('email', 'email', 'autocomplete="email" required'))}
      ${fld('password', 'Mot de passe', inp('password', 'password', 'autocomplete="new-password" minlength="8" required'), '8 caractères minimum')}${fld('city', 'Ville', `<select class="in" id="city" name="city" required>${T.opts(SH.CITIES, '', 'Choisir…')}</select>`)}
      ${fld('phone', 'Téléphone (facultatif)', inp('phone', 'tel', 'autocomplete="tel" inputmode="tel"'), 'Utile pour la livraison. Jamais affiché publiquement.')}
      <label class="ck"><input type="checkbox" name="terms"> <span class="small">J'accepte les <a class="link" href="/cgu" target="_blank">conditions d'utilisation</a> et la <a class="link" href="/confidentialite" target="_blank">politique de confidentialité</a>.</span></label>
      <button class="btn btn-fill btn-block" type="submit">Créer mon compte</button></form><p class="small" style="margin-top:16px">Déjà inscrit ? <a class="link" href="/connexion${location.search}">${esc(DJ.login)}</a></p>`);
  });
  T.forms.register = async (f) => {
    T.fieldErr(f, ''); const d = T.formData(f);
    try { const r = await T.post('/auth/register', d); await T.afterLogin(r.user); T.toast(`${DJ.congrats} ! ${DJ.hello} sur Thrifty.`); T.go(T.next(), true); } catch (e) { T.fieldErr(f, e.message); }
  };
  T.route(/^\/mot-de-passe-oublie$/, () => authShell('Mot de passe oublié', 'Entrez votre e-mail, nous vous envoyons un lien pour en choisir un nouveau.', `<form class="stack" data-form="forgot" novalidate>${fld('email', 'E-mail', inp('email', 'email', 'required'))}<button class="btn btn-fill btn-block" type="submit">Envoyer le lien</button></form>`));
  T.forms.forgot = async (f) => { await T.post('/auth/forgot', { email: T.formData(f).email }); f.outerHTML = '<p class="alert ok">Si ce compte existe, un e-mail vient de partir. Pensez à regarder vos spams.</p>'; };
  T.route(/^\/reinitialiser$/, (_, q) => authShell('Nouveau mot de passe', 'Choisissez un mot de passe d\'au moins 8 caractères.', `<form class="stack" data-form="reset" data-token="${esc(q.get('token') || '')}" novalidate>${fld('password', 'Nouveau mot de passe', inp('password', 'password', 'autocomplete="new-password" minlength="8" required'))}<button class="btn btn-fill btn-block" type="submit">Enregistrer</button></form>`));
  T.forms.reset = async (f) => { T.fieldErr(f, ''); try { await T.post('/auth/reset', { token: f.dataset.token, password: T.formData(f).password }); T.toast(DJ.done + ' ! Connectez-vous.'); T.go('/connexion'); } catch (e) { T.fieldErr(f, e.message); } };

  /* ---------- Messages & offres ---------- */
  const thumb = (src) => `<span class="th" style="width:44px;height:56px;border-radius:10px;overflow:hidden;background:var(--art-bg);flex:none;display:block">${src ? `<img src="${esc(src)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">` : ''}</span>`;
  T.route(/^\/messages(?:\/(\d+))?$/, async ([id]) => {
    T.title('Messages');
    const { convos } = await T.get('/convos');
    const list = convos.length ? convos.map((c) => `<a class="citem" href="/messages/${c.id}" aria-current="${String(c.id) === id}">${thumb(c.item && c.item.photo)}<span class="grow"><b>${esc(c.other.name)}</b>${c.unread ? ' <span class="dot" style="display:inline-block"></span>' : ''}<br><span class="small muted" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.item ? c.item.title : '')}</span><span class="small muted" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.last ? esc(c.last.type === 'offer' ? 'Offre : ' + dh(c.last.amount) : c.last.text) : ''}</span></span></a>`).join('') : `<p class="muted" style="padding:20px">${esc(DJ.empty)}. Écrivez à un vendeur depuis une annonce.</p>`;
    let thread = `<div class="thread" style="align-items:center;justify-content:center;padding:40px;text-align:center"><p class="muted">Choisissez une conversation.</p></div>`, after;
    if (id) {
      const r = await T.get('/convos/' + id); T.badges.messages = Math.max(0, T.badges.messages - 1);
      thread = threadHtml(r); after = (root) => wireThread(root, id, r);
    }
    return [`<div class="wrap sp-s"><h1 class="h2" style="margin-bottom:16px">Messages</h1><div class="msgs${id ? ' has-thread' : ''}"><div class="clist">${list}</div>${thread}</div></div>`, after];
  }, { auth: true });
  function bubble(m, me, buyer, item) {
    if (m.type === 'system') return `<div class="bub sys">${esc(m.text)}</div>`;
    const mine = m.from === me;
    if (m.type === 'offer') {
      const lbl = { pending: 'En attente', accepted: 'Acceptée', refused: 'Refusée', replaced: 'Remplacée' }[m.status];
      return `<div class="bub ${mine ? 'r' : 'l'}"><small style="margin:0 0 4px">${m.counter ? 'Contre-proposition' : 'Offre'}</small><span class="amt">${dh(m.amount)}</span>${m.text ? esc(m.text) : ''}<small>${lbl} · ${T.ago(m.ts)}</small>
        ${m.status === 'pending' && !mine ? `<span class="ofr"><button class="btn btn-sm btn-inverse" data-act="oaccept" data-id="${m.id}">Accepter</button><button class="btn btn-sm btn-ghost" data-act="orefuse" data-id="${m.id}">Refuser</button></span>` : ''}</div>`;
    }
    return `<div class="bub ${mine ? 'r' : 'l'}">${esc(m.text).replace(/\n/g, '<br>')}<small>${T.ago(m.ts)}</small></div>`;
  }
  function threadHtml(r) {
    const c = r.convo, it = c.item, isBuyer = c.buyerId === r.me, can = it && it.status === 'published';
    return `<div class="thread"><div class="thead"><a class="mini" href="/article/${it ? it.id : ''}">${thumb(it && it.photo)}<span><b>${esc(it ? it.title : 'Article supprimé')}</b><br><span class="small muted">avec ${esc(c.other.name)} · ${it ? dh(it.price) : ''}${c.agreed ? ' · convenu ' + dh(c.agreed) : ''}</span></span></a>
      <span class="row">${can ? `<button class="btn btn-sm btn-line" data-act="toffer" data-price="${it.price}">${esc(DJ.offer)}</button>` : ''}${can && isBuyer ? `<a class="btn btn-sm btn-fill" href="/paiement/${it.id}">Acheter${c.agreed ? ' à ' + dh(c.agreed) : ''}</a>` : ''}${it && it.status === 'sold' ? '<span class="pill">Vendu</span>' : ''}</span></div>
      <div class="tbody" id="tbody" aria-live="polite">${r.messages.map((m) => bubble(m, r.me)).join('') || `<p class="muted">${esc(DJ.hi)} ! Écrivez le premier message.</p>`}</div>
      <form class="tcomp" data-form="send"><input class="in" name="text" maxlength="1000" placeholder="Votre message…" aria-label="Votre message" autocomplete="off" required><button class="btn btn-fill" type="submit">Envoyer</button></form></div>`;
  }
  function wireThread(root, id, r0) {
    const body = $('#tbody', root); body.scrollTop = body.scrollHeight;
    let sig = r0.messages.map((m) => m.id + m.status).join();
    const refresh = async (force) => {
      const r = await T.get('/convos/' + id); const s = r.messages.map((m) => m.id + m.status).join();
      if (s === sig && !force) return; sig = s;
      const th = $('.thread', root), draft = $('input[name=text]', th) && $('input[name=text]', th).value;
      th.outerHTML = threadHtml(r); const nb = $('#tbody', root); nb.scrollTop = nb.scrollHeight; const i = $('input[name=text]', root); if (i && draft) i.value = draft;
    };
    T.threadRefresh = () => refresh(true);
    T.timers.push(setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 8000));
    T.forms.send = async (f) => { const t = T.formData(f).text.trim(); if (!t) return; await T.post(`/convos/${id}/messages`, { text: t }); f.reset(); await refresh(true); $('input[name=text]', root).focus(); };
    T.acts.oaccept = async (el) => { if (await T.run(() => T.post(`/offers/${el.dataset.id}/accept`), DJ.congrats + ' ! Offre acceptée.')) refresh(true); };
    T.acts.orefuse = async (el) => { if (await T.run(() => T.post(`/offers/${el.dataset.id}/refuse`), 'Offre refusée.')) refresh(true); };
    T.acts.toffer = async (el) => {
      const price = Number(el.dataset.price);
      const r = await T.modal(`<h3>${esc(DJ.offer)}</h3><p class="muted">Prix affiché : ${dh(price)}.</p><form class="stack"><div class="field"><label for="am">Montant (DH)</label><input class="in" id="am" name="amount" type="number" min="1" max="${price}" required></div><div class="row"><button class="btn btn-fill" type="submit">Envoyer</button><button class="btn btn-line" type="button" data-close="no">Annuler</button></div></form>`);
      if (r && (await T.run(() => T.post(`/convos/${id}/offers`, { amount: Number(r.amount) }), 'Proposition envoyée'))) refresh(true);
    };
  }

  /* ---------- Paiement (livraison) ---------- */
  T.route(/^\/paiement\/(\d+)$/, async ([id]) => {
    const d = await T.get('/items/' + id), it = d.item, u = T.user;
    if (it.status !== 'published' || it.seller.id === u.id) return `<div class="wrap sp">${T.emptyBox(it.seller.id === u.id ? 'C\'est votre annonce' : 'Article indisponible', it.seller.id === u.id ? 'Vous ne pouvez pas acheter votre propre article.' : 'Cet article vient d\'être vendu ou retiré.', '<a class="btn btn-fill" href="/catalogue">Continuer mes recherches</a>')}</div>`;
    const price = d.convo && d.convo.agreed ? Math.min(d.convo.agreed, it.price) : it.price, ship = T.cfg.ship, pm = T.cfg.paymentMethods;
    T.title('Paiement');
    return `<div class="wrap sp"><h1 class="h2" style="margin-bottom:20px">Finaliser la commande</h1><div class="two"><form class="panel stack" data-form="order" data-item="${it.id}" novalidate><h2>Livraison</h2>
      <div class="form-grid">${fld('name', 'Nom du destinataire', inp('name', 'text', `value="${esc(u.name)}" autocomplete="name" required`))}${fld('phone', 'Téléphone', inp('phone', 'tel', `value="${esc(u.phone || '')}" autocomplete="tel" inputmode="tel" required`), 'Le transporteur vous appellera.')}
      <div class="full">${fld('address', 'Adresse complète', inp('address', 'text', 'autocomplete="street-address" required'), 'Rue, numéro, quartier, repère.')}</div>${fld('city', 'Ville', `<select class="in" id="city" name="city" required>${T.opts(SH.CITIES, u.city, 'Choisir…')}</select>`)}</div>
      <h2 style="margin-top:8px">Paiement</h2><div class="stack">${pm.map((p, i) => `<label class="rc"><input type="radio" name="paymentMethod" value="${esc(p.id)}"${i === 0 ? ' checked' : ''}><span><b>${esc(p.label)}</b><br><span class="small muted">Vous payez au livreur à la réception. Vérifiez le colis avant de confirmer.</span></span></label>`).join('')}</div>
      <button class="btn btn-fill btn-block" type="submit">Confirmer la commande · ${dh(price + ship)}</button></form>
      <aside class="panel"><div class="mini">${thumb(it.photos[0]).replace('width:44px;height:56px', 'width:72px;height:90px')}<span><b>${esc(it.title)}</b><br><span class="small muted">${esc(it.brand)} · ${esc(it.size)}</span></span></div>
      <dl class="lines"><div><dt>Article${d.convo && d.convo.agreed ? ' (prix convenu)' : ''}</dt><dd>${dh(price)}</dd></div><div><dt>Livraison</dt><dd>${dh(ship)}</dd></div><div class="big"><dt>Total à payer</dt><dd>${dh(price + ship)}</dd></div></dl>
      <p class="small muted" style="margin-top:14px">Le vendeur n'est payé qu'après votre confirmation de réception.</p></aside></div></div>`;
  }, { auth: true });
  T.forms.order = async (f) => {
    T.fieldErr(f, ''); const d = T.formData(f);
    try { const r = await T.post('/orders', { itemId: Number(f.dataset.item), name: d.name, phone: d.phone, address: d.address, city: d.city, paymentMethod: d.paymentMethod }); T.toast(`${DJ.congrats} ! Commande confirmée.`); T.go('/commande/' + r.id); } catch (e) { T.fieldErr(f, e.message); }
  };

  /* ---------- Commandes ---------- */
  const ocard = (o, role) => `<a class="ocard" href="/commande/${o.id}"><span class="th">${o.photo ? `<img src="${esc(o.photo)}" alt="">` : ''}</span><span class="grow"><b>${esc(o.title)}</b><br><span class="small muted">${esc(o.code)} · ${esc(role === 'seller' ? 'acheteur ' + o.buyer.name : 'vendeur ' + o.seller.name)} · ${T.ago(o.created)}</span><br>${T.pill(o.status)}</span><span class="end"><b>${dh(role === 'seller' ? o.net : o.total)}</b>${role === 'seller' ? T.payPill(o.payout) : ''}</span></a>`;
  T.route(/^\/achats$/, async () => {
    const { orders } = await T.get('/orders?role=buyer'); T.title('Mes achats');
    return `<div class="wrap sp"><h1 class="h2" style="margin-bottom:20px">Mes achats</h1>${orders.length ? `<div class="olist">${orders.map((o) => ocard(o, 'buyer')).join('')}</div>` : T.emptyBox(DJ.empty, 'Vous n\'avez pas encore commandé.', '<a class="btn btn-fill" href="/catalogue">Découvrir les pièces</a>')}</div>`;
  }, { auth: true });
  T.route(/^\/ventes$/, async () => {
    const { orders, payout } = await T.get('/orders?role=seller'); T.title('Mes ventes');
    return `<div class="wrap sp"><div class="between" style="margin-bottom:20px"><h1 class="h2">Mes ventes</h1><a class="btn btn-line" href="/versements">Mes versements</a></div>
      <div class="kpis" style="margin-bottom:24px"><div class="kpi"><small>À verser</small><b>${dh(payout.due)}</b></div><div class="kpi"><small>En attente de confirmation</small><b>${dh(payout.pending)}</b></div><div class="kpi dark"><small>Déjà versé</small><b>${dh(payout.paid)}</b></div></div>
      ${orders.length ? `<div class="olist">${orders.map((o) => ocard(o, 'seller')).join('')}</div>` : T.emptyBox(DJ.empty, 'Pas encore de vente. Mettez en ligne vos plus belles pièces.', `<a class="btn btn-fill" href="/vendre">${esc(DJ.sell)}</a>`)}</div>`;
  }, { auth: true });
  T.route(/^\/versements$/, async () => {
    const { orders, payout } = await T.get('/orders?role=seller'); T.title('Mes versements'); const rate = Math.round(T.cfg.rate * 100);
    return `<div class="wrap sp"><h1 class="h2" style="margin-bottom:8px">Mes versements</h1><p class="muted" style="margin-bottom:20px">Après confirmation de réception par l'acheteur, nous vous versons le prix de l'article moins ${rate} % de commission. La livraison est payée par l'acheteur.</p>
      <div class="kpis" style="margin-bottom:24px"><div class="kpi"><small>À verser</small><b>${dh(payout.due)}</b></div><div class="kpi"><small>En attente</small><b>${dh(payout.pending)}</b></div><div class="kpi"><small>Suspendu</small><b>${dh(payout.suspended)}</b></div><div class="kpi dark"><small>Versé</small><b>${dh(payout.paid)}</b></div></div>
      <div class="twrap"><table><thead><tr><th>Commande</th><th>Article</th><th class="r">Prix</th><th class="r">Commission</th><th class="r">Net</th><th>Versement</th></tr></thead><tbody>${orders.map((o) => `<tr><td><a class="link" href="/commande/${o.id}">${esc(o.code)}</a></td><td>${esc(o.title)}</td><td class="r">${dh(o.price)}</td><td class="r">${dh(o.commission)}</td><td class="r"><b>${dh(o.net)}</b></td><td>${T.payPill(o.payout)}</td></tr>`).join('') || `<tr><td colspan="6" class="muted">${esc(DJ.empty)}.</td></tr>`}</tbody></table></div></div>`;
  }, { auth: true });

  T.route(/^\/commande\/(\d+)$/, async ([id]) => {
    const { order: o } = await T.get('/orders/' + id), u = T.user, buyer = u.id === o.buyer.id, seller = u.id === o.seller.id; T.title('Commande ' + o.code);
    const steps = ['Commandée', 'Expédiée', 'Livrée', 'Confirmée'], idx = { to_ship: 0, shipping: 1, delivered: 2, confirmed: 3 }[o.status];
    const btns = [];
    if (seller && o.status === 'to_ship') btns.push('<button class="btn btn-fill" data-act="oship">Marquer comme expédiée</button>');
    if ((seller || buyer) && o.status === 'to_ship') btns.push('<button class="btn btn-danger" data-act="ocancel">Annuler la commande</button>');
    if (buyer && o.status === 'delivered') btns.push('<button class="btn btn-fill" data-act="oconfirm">Tout est conforme, confirmer la réception</button>');
    if (buyer && ['to_ship', 'shipping', 'delivered'].includes(o.status)) btns.push('<button class="btn btn-line" data-act="oissue">Signaler un problème</button>');
    return `<div class="wrap sp"><nav class="crumbs"><a href="/${buyer ? 'achats' : 'ventes'}">${buyer ? 'Mes achats' : 'Mes ventes'}</a><span>/</span><span>${esc(o.code)}</span></nav>
      <div class="between"><h1 class="h2">Commande ${esc(o.code)}</h1>${T.pill(o.status)}</div>
      ${idx !== undefined ? `<div class="stepper2">${steps.map((s, i) => `<div class="stp${i <= idx ? ' on' : ''}"><i></i>${s}</div>`).join('')}</div>` : o.status === 'issue' ? `<p class="alert bad" style="margin:16px 0">Problème signalé : ${esc(o.issue ? o.issue.reason : '')}. Notre équipe étudie le dossier.</p>` : `<p class="alert warn" style="margin:16px 0">${esc(SH.ORDER_LBL[o.status])}.</p>`}
      ${o.status === 'delivered' && buyer ? '<p class="alert info" style="margin-bottom:16px">Votre colis est livré ? Vérifiez-le, puis confirmez. Le vendeur sera payé après votre confirmation.</p>' : ''}
      <div class="two eq"><div class="panel"><div class="mini"><span class="th">${o.photo ? `<img src="${esc(o.photo)}" alt="">` : ''}</span><span><a class="link" href="/article/${o.itemId || ''}"><b>${esc(o.title)}</b></a><br><span class="small muted">${esc(o.brand)} · ${esc(o.size)}</span><br><span class="small muted">${buyer ? 'Vendeur : ' + esc(o.seller.name) : 'Acheteur : ' + esc(o.buyer.name)}</span></span></div>
      <dl class="lines"><div><dt>Prix de l'article</dt><dd>${dh(o.price)}</dd></div>${seller ? `<div><dt>Commission (${Math.round(o.rate * 1000) / 10} %)</dt><dd>− ${dh(o.commission)}</dd></div><div class="big"><dt>Vous recevez</dt><dd>${dh(o.net)}</dd></div><div><dt>Versement</dt><dd>${T.payPill(o.payout)}</dd></div>` : `<div><dt>Livraison</dt><dd>${dh(o.ship)}</dd></div><div class="big"><dt>Total à payer</dt><dd>${dh(o.total)}</dd></div><div><dt>Paiement</dt><dd>À la livraison</dd></div>`}</dl></div>
      <div class="panel"><h3>Livraison</h3>${o.bundleTitle ? `<p class="small" style="margin-top:6px"><b>Lot « ${esc(o.bundleTitle)} »</b> : un seul colis, ${1 + (o.siblings || []).length} pièces${(o.siblings || []).length ? ' (aussi : ' + o.siblings.map((x) => esc(x.title)).join(', ') + ')' : ''}.</p>` : ''}<p style="margin-top:8px">${esc(o.shipName || '')}<br>${esc(o.address || '')}<br>${esc(o.city)}<br>${esc(o.phone || '')}</p><p class="small muted" style="margin-top:8px">Colis ${esc(o.pack)}${o.tracking ? ' · n° de suivi indiqué par le vendeur (non vérifié) : ' + esc(o.tracking) : ''}</p>
      ${seller && o.status === 'to_ship' ? '<p class="alert warn small" style="margin-top:12px">Préparez le colis et remettez-le au transporteur. Puis indiquez-le ci-dessous : l\'étape « expédiée » est déclarée par vous, Thrifty n\'a pas de suivi automatique du transporteur.</p>' : ''}</div></div>
      ${btns.length ? `<div class="row" style="margin-top:20px">${btns.join('')}</div>` : ''}
      ${buyer && o.status === 'confirmed' && !o.review ? `<form class="panel stack" style="margin-top:20px" data-form="review" data-id="${o.id}"><h3>${esc(DJ.thanks)} ! Laissez un avis</h3><div class="row" role="radiogroup" aria-label="Note">${[1, 2, 3, 4, 5].map((n) => `<label class="chip-f" style="cursor:pointer"><input type="radio" name="rating" value="${n}" ${n === 5 ? 'checked' : ''} style="accent-color:var(--cobalt)"> ${n} ★</label>`).join('')}</div><textarea class="in" name="text" maxlength="500" placeholder="Article conforme ? Vendeur sérieux ?"></textarea><button class="btn btn-fill" type="submit">Publier l'avis</button></form>` : ''}
      ${o.review ? `<div class="panel" style="margin-top:20px"><b>Avis</b> ${T.stars(o.review.rating)}<p>${esc(o.review.text)}</p></div>` : ''}
      <h3 style="margin:28px 0 8px">Historique</h3><ul class="events">${o.events.map((e) => `<li><time>${T.dateFr(e.ts)}</time><span>${esc(e.t)}</span></li>`).join('')}</ul></div>`;
  }, { auth: true });
  const oid = () => location.pathname.split('/').pop();
  T.acts.oship = async () => {
    const r = await T.modal(`<h3>Expédition</h3><form class="stack"><div class="field"><label for="tr">Numéro de suivi (facultatif)</label><input class="in" id="tr" name="tracking" maxlength="60"></div><div class="row"><button class="btn btn-fill" type="submit">Colis expédié</button><button class="btn btn-line" type="button" data-close="no">Annuler</button></div></form>`);
    if (r && (await T.run(() => T.post(`/orders/${oid()}/ship`, { tracking: r.tracking }), DJ.done + ' ! Colis marqué expédié.'))) T.render();
  };
  T.acts.ocancel = async () => { if (await T.confirm('Annuler la commande ?', 'L\'article sera remis en vente.', 'Annuler la commande', true) && (await T.run(() => T.post(`/orders/${oid()}/cancel`), 'Commande annulée.'))) T.render(); };
  T.acts.oconfirm = async () => { if (await T.confirm('Confirmer la réception ?', 'Vous confirmez avoir reçu l\'article conforme à l\'annonce. Le vendeur sera payé.', 'Je confirme') && (await T.run(() => T.post(`/orders/${oid()}/confirm`), DJ.congrats + ' !'))) T.render(); };
  T.acts.oissue = async () => {
    const r = await T.modal(`<h3>Signaler un problème</h3><p class="muted">Le versement au vendeur est suspendu le temps de l'examen.</p><form class="stack"><div class="field"><label for="rs">Motif</label><select class="in" id="rs" name="reason">${T.opts(SH.REASONS)}</select></div><div class="field"><label for="tx">Décrivez le problème</label><textarea class="in" id="tx" name="text" required minlength="5" maxlength="800"></textarea></div><div class="row"><button class="btn btn-fill" type="submit">Envoyer</button><button class="btn btn-line" type="button" data-close="no">Annuler</button></div></form>`);
    if (r && (await T.run(() => T.post(`/orders/${oid()}/issue`, r), 'Signalement envoyé.'))) T.render();
  };
  T.forms.review = async (f) => { const d = T.formData(f); if (await T.run(() => T.post(`/orders/${f.dataset.id}/review`, { rating: Number(d.rating), text: d.text }), DJ.thanks + ' !')) T.render(); };

  /* ---------- Vendre / modifier ---------- */
  T.toJpeg = (f) => toJpeg(f);
  async function toJpeg(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Photo illisible : ' + file.name)); i.src = url; });
      const s = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.82);
    } finally { URL.revokeObjectURL(url); }
  }
  T.route(/^\/vendre(?:\/(\d+))?$/, async ([id]) => {
    let it = null; if (id) { it = (await T.get('/items/' + id)).item; if (it.seller.id !== T.user.id) throw Object.assign(new Error('Annonce introuvable.'), { status: 404 }); }
    T.title(it ? 'Modifier l\'annonce' : 'Mettre en vente');
    const v = it || { fit: '', measures: [], univ: 'femmes', cat: '', title: '', brand: '', size: '', color: '', cond: '', defects: '', desc: '', price: '', city: T.user.city, photos: [] };
    const st = { photos: v.photos.map((p) => p.split('/').pop()), busy: 0 };
    const noBrand = v.brand === 'Sans marque', noDef = v.defects === 'Aucun défaut constaté';
    const html = `<div class="wrap sp"><div class="between" style="margin-bottom:6px"><h1 class="h2">${it ? 'Modifier l\'annonce' : esc(DJ.sell)}</h1></div><p class="muted" style="margin-bottom:24px">${it ? '' : 'Des photos nettes, une description honnête : c\'est ce qui vend vite.'}</p>
    <form class="two" data-form="sell" data-id="${id || ''}" data-status="${it ? it.status : ''}" novalidate><div class="stack">
      <div class="panel stack"><h2>Photos</h2><label class="drop" id="drop" for="files"><b>Ajouter des photos</b><span class="small muted">Jusqu'à 20 · la première sera la photo principale</span><input id="files" type="file" accept="image/*" multiple hidden></label><div class="ph-grid" id="phs"></div></div>
      <div class="panel stack"><h2>L'article</h2><div class="form-grid">
        <div class="full">${fld('title', 'Titre', inp('title', 'text', `maxlength="100" value="${esc(v.title)}" placeholder="Ex. Veste en jean Levi's"`))}</div>
        <div class="full">${fld('desc', 'Description', `<textarea class="in" id="desc" name="desc" maxlength="2000" placeholder="Matière, coupe, occasions où vous l'avez portée…">${esc(v.desc)}</textarea>`, '10 caractères minimum pour publier.')}</div>
        ${fld('univ', 'Univers', `<select class="in" id="univ" name="univ">${Object.entries(SH.UNIV).map(([k, l]) => `<option value="${k}"${k === v.univ ? ' selected' : ''}>${l}</option>`).join('')}</select>`)}
        ${fld('cat', 'Catégorie', '<select class="in" id="cat" name="cat"></select>')}${fld('size', 'Taille', '<select class="in" id="size" name="size"></select>')}
        ${fld('color', 'Couleur', `<select class="in" id="color" name="color">${T.opts(Object.keys(SH.COLORS), v.color, 'Choisir…')}</select>`)}
        ${fld('brand', 'Marque', inp('brand', 'text', `maxlength="50" value="${noBrand ? '' : esc(v.brand)}"${noBrand ? ' disabled' : ''}`))}<label class="ck" style="align-self:end"><input type="checkbox" name="noBrand" id="noBrand"${noBrand ? ' checked' : ''}> Sans marque</label>
        ${fld('cond', 'État', `<select class="in" id="cond" name="cond">${T.opts(SH.COND, v.cond, 'Choisir…')}</select>`)}${fld('city', 'Ville de départ', `<select class="in" id="city" name="city">${T.opts(SH.CITIES, v.city, 'Choisir…')}</select>`)}
        <div class="full">${fld('defects', 'Défauts éventuels', `<textarea class="in" id="defects" name="defects" maxlength="500" style="min-height:70px"${noDef ? ' disabled' : ''}>${noDef ? '' : esc(v.defects)}</textarea>`)}<label class="ck"><input type="checkbox" name="noDefect" id="noDefect"${noDef ? ' checked' : ''}> Aucun défaut constaté</label></div></div></div>
      <div class="panel stack" id="measpanel" hidden><h2>Taille et mesures <span class="muted small">(facultatif)</span></h2>
        ${fld('fit', 'Coupe constatée', `<select class="in" id="fit" name="fit"><option value="">Non précisé</option>${Object.entries(SH.FITS).map(([k, l]) => `<option value="${k}"${k === v.fit ? ' selected' : ''}>${l}</option>`).join('')}</select>`, 'Votre ressenti, pas une garantie de taille.')}
        <div class="form-grid" id="meas"></div><div id="mhelp"></div></div>
      <div class="panel stack"><h2>Prix</h2>${fld('price', 'Prix (DH)', inp('price', 'number', `min="1" max="100000" step="1" inputmode="numeric" value="${v.price || ''}"`))}<p class="alert info small" id="net"></p>
        <label class="ck"><input type="checkbox" name="decl" id="decl"${it && it.status === 'published' ? ' checked' : ''}> <span class="small">Je certifie que l'article est conforme aux photos et à la description, et que je suis autorisé(e) à le vendre.</span></label></div></div>
      <aside class="panel stack" style="position:sticky;top:150px"><h2>Publier</h2><p class="small muted">Commission de ${T.pct(T.cfg.rate)} retenue uniquement quand l'article est vendu${T.cfg.launch ? ' (offre de lancement en cours)' : ''}. La livraison (${dh(T.cfg.ship)}) est payée par l'acheteur.</p>
        <button class="btn btn-fill btn-block" type="submit" data-publish="1">${it && it.status === 'published' ? 'Enregistrer' : 'Publier l\'annonce'}</button>${!it || it.status === 'draft' ? '<button class="btn btn-line btn-block" type="submit" data-publish="0">Enregistrer le brouillon</button>' : ''}</aside></form></div>`;
    return [html, (root) => {
      const $f = (n) => $('#' + n, root), selU = $f('univ'), selC = $f('cat'), selS = $f('size');
      const fillCats = () => { const cur = selC.value || v.cat; selC.innerHTML = T.opts(SH.catsFor(selU.value), cur, 'Choisir…'); fillSizes(); };
      const fillSizes = () => { const cur = selS.value || v.size; selS.innerHTML = selC.value ? T.opts(SH.sizesFor(selU.value, selC.value), cur, 'Choisir…') : '<option value="">Choisissez d\'abord la catégorie</option>'; };
      selU.addEventListener('change', () => { selC.value = ''; selS.value = ''; fillCats(); }); selC.addEventListener('change', () => { selS.value = ''; fillSizes(); }); fillCats();
      $f('noBrand').addEventListener('change', (e) => { $f('brand').disabled = e.target.checked; }); $f('noDefect').addEventListener('change', (e) => { $f('defects').disabled = e.target.checked; });
      const mv = {}; (v.measures || []).forEach((x) => { mv[x.k] = x.value; });
      const paintMeas = () => {
        const defs = SH.measuresFor(selC.value), P = $f('measpanel'); P.hidden = !defs.length; if (!defs.length) return;
        $f('meas').innerHTML = defs.map((d) => `<div class="field"><label for="m_${d.k}">${esc(d.label)}</label><input class="in" id="m_${d.k}" name="m_${d.k}" type="number" inputmode="decimal" min="1" max="300" step="0.5" value="${mv[d.k] != null ? mv[d.k] : ''}" placeholder="cm"></div>`).join('');
        $f('mhelp').innerHTML = `<details class="help"><summary>Comment mesurer ?</summary><div><p class="small">${esc(SH.FLAT_NOTE)}</p>${defs.map((d) => `<p class="small"><b>${esc(d.label)}.</b> ${esc(d.help)}</p>`).join('')}<div class="mdiag">${defs.map((d) => T.mdiagram(SH.measureGroup(selC.value), d.k, d.label)).join('')}</div></div></details>`;
        $$('#meas input', root).forEach((i) => i.addEventListener('input', () => { mv[i.name.slice(2)] = i.value; }));
      };
      selC.addEventListener('change', paintMeas); paintMeas();
      const net = () => { const p = Number($f('price').value); $f('net').textContent = p > 0 ? (() => { const f = T.fees(p); return `Prix ${dh(p)} − commission ${T.pct(f.rate)} (${dh(f.commission)}) = vous recevez ${dh(f.net)}.`; })() : 'Fixez un prix : nous calculons ce que vous recevez.'; };
      $f('price').addEventListener('input', net); net();
      const paint = () => { $f('phs').innerHTML = st.photos.map((f, i) => `<div class="ph${i === 0 ? ' main' : ''}"><img src="/uploads/${esc(f)}" alt="Photo ${i + 1}">${i === 0 ? '<span class="mk">Principale</span>' : ''}<div class="acts">${i ? `<button type="button" data-act="pmain" data-i="${i}">★ Principale</button>` : '<span></span>'}<button type="button" data-act="pdel" data-i="${i}" aria-label="Supprimer">✕</button></div></div>`).join('') + (st.busy ? `<div class="ph"><span class="small muted" style="position:absolute;inset:0;display:grid;place-items:center">Envoi…</span></div>`.repeat(st.busy) : ''); };
      paint();
      const add = async (files) => {
        const list = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, 20 - st.photos.length);
        for (const f of list) { st.busy++; paint(); try { const r = await T.post('/photos', { data: await toJpeg(f) }); st.photos.push(r.file); } catch (e) { T.toast(e.message); } st.busy--; paint(); }
      };
      $f('files').addEventListener('change', (e) => { add(e.target.files); e.target.value = ''; });
      const dz = $f('drop'); ['dragover', 'dragenter'].forEach((n) => dz.addEventListener(n, (e) => { e.preventDefault(); dz.classList.add('over'); })); ['dragleave', 'drop'].forEach((n) => dz.addEventListener(n, () => dz.classList.remove('over'))); dz.addEventListener('drop', (e) => { e.preventDefault(); add(e.dataTransfer.files); });
      T.acts.pmain = (el) => { const i = Number(el.dataset.i); st.photos.unshift(st.photos.splice(i, 1)[0]); paint(); }; T.acts.pdel = (el) => { st.photos.splice(Number(el.dataset.i), 1); paint(); };
      root.addEventListener('click', (e) => { const b = e.target.closest('button[type=submit]'); if (b) b.form.dataset.publish = b.dataset.publish; });
      T.forms.sell = async (f) => {
        T.fieldErr(f, ''); const d = T.formData(f), publish = f.dataset.publish !== '0';
        if (st.busy) return T.fieldErr(f, 'Patientez, des photos sont en cours d\'envoi.');
        const body = { publish, univ: d.univ, cat: d.cat, title: d.title, desc: d.desc, brand: d.brand, noBrand: d.noBrand, size: d.size, color: d.color, cond: d.cond, defects: d.defects, noDefect: d.noDefect, price: d.price, city: d.city, decl: d.decl, photos: st.photos, fit: d.fit, measures: Object.fromEntries(SH.measuresFor(d.cat).map((x) => [x.k, d['m_' + x.k]]).filter(([, val]) => val !== '' && val != null)) };
        try { const r = f.dataset.id ? await T.put('/items/' + f.dataset.id, body) : await T.post('/items', body); T.toast(r.status === 'published' ? `${DJ.congrats} ! Votre annonce est en ligne.` : 'Brouillon enregistré.'); T.go(r.status === 'published' ? '/article/' + r.id : '/dressing'); } catch (e) { T.fieldErr(f, e.errors && e.errors.length > 1 ? e.errors.join(' · ') : e.message); }
      };
    }];
  }, { auth: true });

  /* ---------- Dressing ---------- */
  T.route(/^\/dressing$/, async () => {
    const { items } = await T.get('/my/items'); T.title('Mon dressing'); const paused = items.some((i) => i.paused);
    const L = { published: ['En ligne', 'ok'], draft: ['Brouillon', ''], hidden: ['Masqué', 'warn'], sold: ['Vendu', 'blue'] };
    const rows = items.map((i) => `<div class="ocard"><a class="th" href="/article/${i.id}">${i.photos[0] ? `<img src="${esc(i.photos[0])}" alt="">` : ''}</a><span class="grow"><a href="/article/${i.id}"><b>${esc(i.title)}</b></a><br><span class="small muted">${dh(i.price)} · ${esc(i.size || '—')}</span><br><span class="pill ${L[i.status][1]}">${L[i.status][0]}</span></span>
      <span class="end">${i.status === 'sold' ? (i.orderId ? `<a class="btn btn-sm btn-line" href="/commande/${i.orderId}">Commande</a>` : '') : `<span class="row" style="justify-content:flex-end"><a class="btn btn-sm btn-line" href="/vendre/${i.id}">Modifier</a>${i.status === 'published' ? `<button class="btn btn-sm btn-line" data-act="ihide" data-id="${i.id}">Masquer</button>` : i.status === 'hidden' ? `<button class="btn btn-sm btn-line" data-act="ishow" data-id="${i.id}">Remettre en ligne</button>` : ''}<button class="btn btn-sm btn-danger" data-act="idel" data-id="${i.id}">Supprimer</button></span>`}</span></div>`).join('');
    return `<div class="wrap sp"><div class="between" style="margin-bottom:20px"><h1 class="h2">Mon dressing</h1><span class="row"><button class="btn btn-line" data-act="${paused ? 'iresume' : 'ipause'}">${paused ? 'Reprendre les ventes' : 'Mode vacances'}</button><a class="btn btn-fill" href="/vendre">${esc(DJ.sell)}</a></span></div>
      ${paused ? '<p class="alert warn" style="margin-bottom:16px">Mode vacances : vos annonces sont masquées.</p>' : ''}${items.length ? `<div class="olist">${rows}</div>` : T.emptyBox(DJ.empty, 'Votre dressing est vide. Mettez en ligne votre première pièce.', `<a class="btn btn-fill" href="/vendre">${esc(DJ.sell)}</a>`)}</div>`;
  }, { auth: true });
  const act = (path, msg) => async (el) => { if (await T.run(() => T.post(path(el), {}), msg)) T.render(); };
  T.acts.ihide = act((el) => `/items/${el.dataset.id}/hide`, 'Annonce masquée.'); T.acts.ishow = act((el) => `/items/${el.dataset.id}/unhide`, 'Annonce remise en ligne.');
  T.acts.ipause = act(() => '/my/pause', 'Mode vacances activé.'); T.acts.iresume = act(() => '/my/resume', DJ.done + ' ! Annonces remises en ligne.');
  T.acts.idel = async (el) => { if (await T.confirm('Supprimer l\'annonce ?', 'Cette action est définitive.', 'Supprimer', true) && (await T.run(() => T.del('/items/' + el.dataset.id), 'Annonce supprimée.'))) T.render(); };
})();
