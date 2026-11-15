/* Vues : Drops, lots, profils vendeurs, partage, signalements, recherches sauvegardées, vérification e-mail. */
(function () {
  'use strict';
  const T = window.T, SH = T.SH, { esc, dh, $, $$ } = T, DJ = T.DJ;
  const needLogin = () => { if (T.user) return false; T.go('/connexion?next=' + encodeURIComponent(location.pathname + location.search)); return true; };
  const abs = (p) => location.origin + p;

  /* ---------- schémas « comment mesurer » (aide, non à l'échelle) ---------- */
  const SHAPES = {
    haut: 'M30 14 L44 8 Q60 20 76 8 L90 14 L108 40 L96 48 L88 38 L88 112 L32 112 L32 38 L24 48 L12 40 Z',
    robe: 'M40 8 Q60 24 80 8 L88 36 L82 52 L100 114 L20 114 L38 52 L32 36 Z',
    pantalon: 'M34 8 H86 L92 116 H66 L60 50 L54 116 H28 Z',
    chaussure: 'M14 70 Q14 54 30 52 L60 52 Q70 70 106 74 Q112 76 112 88 L112 96 H14 Z',
    accessoire: 'M22 40 H98 V104 H22 Z M40 40 Q40 18 60 18 Q80 18 80 40'
  };
  const LINES = {
    poitrine: [34, 40, 86, 40, 'h'], taille: [38, 56, 82, 56, 'h'], longueur: [60, 12, 60, 112, 'v'], manche: [16, 40, 28, 12, 'd'],
    entrejambe: [60, 52, 60, 116, 'v'], semelle: [16, 62, 100, 62, 'h'], largeur: [22, 72, 98, 72, 'h'], hauteur: [60, 18, 60, 104, 'v']
  };
  T.mdiagram = (group, k, label) => {
    const l = LINES[k] || LINES.longueur, shape = SHAPES[group] || SHAPES.haut;
    return `<figure><svg viewBox="0 0 120 124" role="img" aria-label="Schéma : ${esc(label)}"><path d="${shape}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" opacity=".55"/><line x1="${l[0]}" y1="${l[1]}" x2="${l[2]}" y2="${l[3]}" stroke="#3454F5" stroke-width="3.5" stroke-linecap="round"/><circle cx="${l[0]}" cy="${l[1]}" r="3.5" fill="#3454F5"/><circle cx="${l[2]}" cy="${l[3]}" r="3.5" fill="#3454F5"/></svg><figcaption>${esc(label)}</figcaption></figure>`;
  };

  /* ---------- cartes ---------- */
  T.dropCard = (c) => `<a class="drop-card rv" href="/drops/${esc(c.slug)}">${c.cover ? `<img src="${esc(c.cover)}" alt="" loading="lazy">` : ''}<div class="tx"><h3>${esc(c.title)}</h3><p>${c.count} pièce${c.count > 1 ? 's' : ''}${c.desc ? ' · ' + esc(c.desc.slice(0, 60)) : ''}</p></div></a>`;
  T.bundleCard = (b) => `<div class="bundle"><div class="between"><b>${esc(b.title)}</b><span class="pill blue">−${b.pct} %</span></div>
    <div class="pieces">${b.items.map((i) => `<a href="/article/${i.id}" aria-label="${esc(i.title)}">${i.photo ? `<img src="${esc(i.photo)}" alt="${esc(i.title)}" loading="lazy">` : ''}</a>`).join('')}</div>
    <ul class="small">${b.items.map((i) => `<li>${esc(i.title)} · taille ${esc(i.size || '—')} · ${esc(i.cond)} · ${dh(i.price)}</li>`).join('')}</ul>
    <div class="fees"><div><span>Total des pièces séparées</span><s>${dh(b.sum)}</s></div><div><span>Prix du lot</span><b>${dh(b.price)}</b></div><div><span>Vous économisez</span><b>${dh(b.saving)}</b></div><div><span>Livraison (un seul colis)</span><b>${dh(b.ship)}</b></div><div class="tot"><span>Total à payer</span><b>${dh(b.total)}</b></div></div>
    <a class="btn btn-fill btn-block" href="/lots/${b.id}">Voir le lot</a></div>`;

  /* ---------- Drops ---------- */
  T.route(/^\/drops$/, async () => {
    const { collections } = await T.get('/collections'); T.title('Drops Thrifty');
    return `<div class="wrap sp"><h1 class="h2">Drops Thrifty</h1><p class="muted" style="margin:6px 0 22px">Des sélections de pièces choisies par l'équipe.</p>${collections.length ? `<div class="drops">${collections.map(T.dropCard).join('')}</div>` : T.emptyBox('Pas de drop pour le moment', 'Revenez bientôt, de nouvelles sélections arrivent.', '<a class="btn btn-fill" href="/catalogue">Voir tout le catalogue</a>')}</div>`;
  });
  T.route(/^\/drops\/([a-z0-9-]+)$/, async ([slug]) => {
    const { collection: c } = await T.get('/collections/' + slug);
    if (T.user && !T.favsLoaded) await T.loadFavs();
    T.title(c.title);
    return `<div class="wrap sp"><div class="drop-hero">${c.cover ? `<img src="${esc(c.cover)}" alt="">` : ''}<div class="tx"><div class="eyebrow" style="color:#fff"><span class="bar" style="background:#fff"></span>Drop Thrifty</div><h1>${esc(c.title)}</h1>${c.desc ? `<p>${esc(c.desc)}</p>` : ''}</div></div>
      <div class="share-row" style="margin:16px 0"><button class="btn btn-line btn-sm" data-act="copylink" data-url="/drops/${esc(c.slug)}">Copier le lien</button><button class="btn btn-line btn-sm" data-act="nshare" data-url="/drops/${esc(c.slug)}" data-t="${esc(c.title)}">Partager</button></div>
      ${T.grid(c.items)}</div>`;
  });

  /* ---------- admin : édition d'un drop ---------- */
  T.acts.dropedit = async (el) => {
    const id = Number(el.dataset.id), all = (await T.get('/admin/items')).items.filter((i) => i.status === 'published');
    const cur = id ? (await T.get('/admin/collections')).collections.find((c) => c.id === id) : { title: '', desc: '', position: 0, active: true, items: [], coverFile: '', cover: '' };
    let cover = cur.coverFile || '';
    const sel = new Set(cur.items.map((i) => i.id));
    const extra = cur.items.filter((i) => !all.some((a) => a.id === i.id));
    const pool = [...extra.map((i) => ({ id: i.id, title: i.title + ' (' + i.status + ')', price: i.price, photos: [] })), ...all];
    const r = await T.modal(`<h3>${id ? 'Modifier' : 'Nouvelle'} collection</h3><form class="stack" id="df"><div class="field"><label for="dt">Titre</label><input class="in" id="dt" name="title" maxlength="70" required value="${esc(cur.title)}"></div>
      <div class="field"><label for="dd">Description courte</label><textarea class="in" id="dd" name="desc" maxlength="300" style="min-height:70px">${esc(cur.desc)}</textarea></div>
      <div class="field"><label for="dp">Ordre d'affichage</label><input class="in" id="dp" name="position" type="number" min="0" max="999" value="${cur.position}"></div>
      <div class="field"><label for="dc">Couverture (facultatif)</label><input id="dc" type="file" accept="image/*"><span class="hint" id="dch">${cover ? 'Couverture enregistrée.' : 'Sans couverture, la première photo est utilisée.'}</span></div>
      <div class="field"><label>Pièces (annonces en ligne)</label><div class="pick" id="dpick">${pool.map((i) => `<label><input type="checkbox" data-sel value="${i.id}"${sel.has(i.id) ? ' checked' : ''}>${i.photos && i.photos[0] ? `<img src="${esc(i.photos[0])}" alt="">` : '<div style="aspect-ratio:4/5;background:var(--mist)"></div>'}<span>${esc(i.title)} · ${dh(i.price)}</span></label>`).join('') || '<p class="muted small">Aucune annonce en ligne.</p>'}</div></div>
      <label class="ck"><input type="checkbox" name="active"${cur.active ? ' checked' : ''}> Collection active</label>
      <div class="row"><button class="btn btn-fill" type="submit">Enregistrer</button><button class="btn btn-line" type="button" data-close="no">Annuler</button></div></form>`, {
      setup: (m) => { $('#dc', m).addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { const d = await T.toJpeg(f); const up = await T.post('/photos', { data: d }); cover = up.file; $('#dch', m).textContent = 'Couverture ajoutée.'; } catch (x) { $('#dch', m).textContent = x.message; } }); }
    });
    if (!r) return;
    const body = { title: r.title, desc: r.desc, position: Number(r.position) || 0, active: !!r.active, cover, items: r._sel };
    if (await T.run(() => (id ? T.put('/admin/collections/' + id, body) : T.post('/admin/collections', body)), 'Collection enregistrée.')) { Object.assign(T.cfg, await T.get('/config')); T.chrome(); T.render(); }
  };
  T.acts.dropdel = async (el) => { if (await T.confirm('Supprimer cette collection ?', 'Les annonces ne sont pas supprimées.', 'Supprimer', true) && (await T.run(() => T.del('/admin/collections/' + el.dataset.id), 'Collection supprimée.'))) { Object.assign(T.cfg, await T.get('/config')); T.chrome(); T.render(); } };
  /* ---------- Lots (page publique + paiement + gestion vendeur) ---------- */
  T.route(/^\/lots\/(\d+)$/, async ([id]) => {
    const { bundle: b } = await T.get('/bundles/' + id); T.title(b.title);
    const mine = T.user && T.user.id === b.seller.id;
    return `<div class="wrap sp" style="max-width:760px"><nav class="crumbs"><a href="/vendeur/${b.seller.id}">${esc(b.seller.name)}</a><span>/</span><span>Lot</span></nav><h1 class="h2" style="margin:10px 0 16px">${esc(b.title)}</h1>
      ${T.bundleCard(b).replace(/<a class="btn btn-fill btn-block" href="[^"]*">Voir le lot<\/a>/, b.available && !mine ? `<a class="btn btn-fill btn-block" href="/paiement-lot/${b.id}">Acheter le lot · ${dh(b.total)}</a>` : `<p class="alert warn">${mine ? 'Ceci est votre lot.' : 'Ce lot n\'est plus disponible : une pièce a été vendue ou le vendeur l\'a modifié.'}</p>`)}
      <p class="muted small" style="margin-top:12px">Une seule livraison pour tout le lot, facturée une fois. Le prix du lot ne s'applique qu'à l'achat complet.</p></div>`;
  });
  T.route(/^\/paiement-lot\/(\d+)$/, async ([id]) => {
    const { bundle: b } = await T.get('/bundles/' + id); T.title('Paiement du lot'); const u = T.user;
    if (!b.available) return T.emptyBox('Lot indisponible', 'Une pièce a été vendue ou le lot a été modifié.', `<a class="btn btn-fill" href="/vendeur/${b.seller.id}">Voir le dressing</a>`);
    return `<div class="wrap sp" style="max-width:720px"><h1 class="h2" style="margin-bottom:16px">Commander le lot</h1><div class="stack"><div class="fees"><div><span>${esc(b.title)} (${b.items.length} pièces)</span><b>${dh(b.price)}</b></div><div><span>Livraison</span><b>${dh(b.ship)}</b></div><div class="tot"><span>Total à payer à la livraison</span><b>${dh(b.total)}</b></div></div>
      <form class="panel stack" data-form="lotorder" data-id="${b.id}" novalidate><div class="form-grid"><div class="field"><label for="name">Nom du destinataire</label><input class="in" id="name" name="name" value="${esc(u.name)}" autocomplete="name"></div><div class="field"><label for="phone">Téléphone</label><input class="in" id="phone" name="phone" type="tel" value="${esc(u.phone || '')}" autocomplete="tel"></div>
      <div class="field"><label for="city">Ville</label><select class="in" id="city" name="city">${T.opts(SH.CITIES, u.city, 'Choisir…')}</select></div><div class="field full"><label for="address">Adresse</label><input class="in" id="address" name="address" autocomplete="street-address"></div></div>
      <button class="btn btn-fill btn-block" type="submit">Confirmer la commande · ${dh(b.total)}</button></form></div></div>`;
  }, { auth: true });
  T.forms.lotorder = async (f) => { T.fieldErr(f, ''); const d = T.formData(f); try { const r = await T.post(`/bundles/${f.dataset.id}/order`, { name: d.name, phone: d.phone, address: d.address, city: d.city }); T.toast(`${DJ.congrats} ! Commande confirmée.`); T.go('/commande/' + r.id); } catch (e) { T.fieldErr(f, e.message); } };

  T.route(/^\/lots$/, async () => {
    const { bundles } = await T.get('/bundles'); T.title('Mes lots');
    return `<div class="wrap sp"><div class="between" style="margin-bottom:18px"><h1 class="h2">Mes lots</h1><button class="btn btn-fill" data-act="bnew">Créer un lot</button></div>
      <p class="muted small" style="margin-bottom:16px">Un lot regroupe plusieurs de vos pièces en ligne à un prix inférieur à leur somme. Si une pièce est vendue séparément, le lot devient indisponible tant que vous ne le mettez pas à jour.</p>
      ${bundles.length ? `<div class="stack">${bundles.map((b) => `<div class="panel"><div class="between"><h3>${esc(b.title)}</h3><span class="pill ${b.available ? 'ok' : 'warn'}">${b.available ? 'Disponible' : b.active ? 'À mettre à jour' : 'Désactivé'}</span></div><p class="small muted">${b.items.length} pièces · ${dh(b.price)} au lieu de ${dh(b.sum)} · vous recevez ${dh(b.net)}</p>${b.stale ? '<p class="alert warn small">Une pièce n\'est plus en ligne : modifiez le lot ou retirez-la.</p>' : ''}<div class="row" style="margin-top:10px"><a class="btn btn-sm btn-line" href="/lots/${b.id}">Voir</a><button class="btn btn-sm btn-line" data-act="bnew" data-id="${b.id}">Modifier</button><button class="btn btn-sm btn-line" data-act="btoggle" data-id="${b.id}">${b.active ? 'Désactiver' : 'Activer'}</button><button class="btn btn-sm btn-line" data-act="bdel" data-id="${b.id}">Supprimer</button></div></div>`).join('')}</div>` : T.emptyBox(DJ.empty, 'Vous n\'avez pas encore de lot.', '<button class="btn btn-fill" data-act="bnew">Créer un lot</button>')}</div>`;
  }, { auth: true });
  T.acts.bnew = async (el) => {
    const id = Number(el.dataset.id || 0), mine = (await T.get('/my/items')).items.filter((i) => i.status === 'published');
    const cur = id ? (await T.get('/bundles/' + id)).bundle : { title: '', price: '', items: [] }, sel = new Set(cur.items.map((i) => i.id));
    if (mine.length < 2) return T.toast('Il faut au moins 2 annonces en ligne pour créer un lot.');
    const r = await T.modal(`<h3>${id ? 'Modifier' : 'Créer'} un lot</h3><form class="stack"><div class="field"><label for="bt">Nom du lot</label><input class="in" id="bt" name="title" maxlength="70" required value="${esc(cur.title)}" placeholder="Ex. Lot jeans été"></div>
      <div class="field"><label>Pièces du lot (2 minimum)</label><div class="pick">${mine.map((i) => `<label><input type="checkbox" data-sel name="it" value="${i.id}" data-p="${i.price}"${sel.has(i.id) ? ' checked' : ''}>${i.photos[0] ? `<img src="${esc(i.photos[0])}" alt="">` : ''}<span>${esc(i.title)} · ${dh(i.price)}</span></label>`).join('')}</div></div>
      <div class="field"><label for="bp">Prix du lot (DH)</label><input class="in" id="bp" name="price" type="number" min="1" required value="${cur.price}"><span class="hint" id="bh">Doit être inférieur à la somme des pièces.</span></div>
      <div class="row"><button class="btn btn-fill" type="submit">Enregistrer</button><button class="btn btn-line" type="button" data-close="no">Annuler</button></div></form>`);
    if (!r) return;
    const body = { title: r.title, price: Number(r.price), items: r._sel };
    if (await T.run(() => (id ? T.put('/bundles/' + id, body) : T.post('/bundles', body)), 'Lot enregistré.')) T.render();
  };
  document.addEventListener('change', (e) => { const i = e.target; if (i.name === 'it' && i.closest('.modal')) { const m = i.closest('.modal'); const sum = $$('input[name=it]:checked', m).reduce((s, c) => s + Number(c.dataset.p), 0); const h = $('#bh', m); if (h) h.textContent = `Somme des pièces : ${dh(sum)}. Le prix du lot doit être inférieur.`; } });
  T.acts.btoggle = async (el) => { if (await T.run(() => T.post(`/bundles/${el.dataset.id}/toggle`), DJ.done + ' !')) T.render(); };
  T.acts.bdel = async (el) => { if (await T.confirm('Supprimer ce lot ?', 'Les annonces restent en ligne.', 'Supprimer', true) && (await T.run(() => T.del('/bundles/' + el.dataset.id), 'Lot supprimé.'))) T.render(); };

  /* ---------- Profil vendeur ---------- */
  T.route(/^\/vendeur\/(\d+)$/, async ([id]) => {
    const s = await T.get('/sellers/' + id); if (T.user && !T.favsLoaded) await T.loadFavs();
    T.title(s.seller.name); const st = s.stats, me = T.user && T.user.id === s.seller.id;
    return `<div class="wrap sp"><div class="row" style="gap:20px;align-items:flex-start"><span class="avatar lg">${esc(s.seller.name[0].toUpperCase())}</span><div class="grow"><h1 class="h2">${esc(s.seller.name)}</h1>
      <p class="muted">${esc(s.seller.city || '')} · membre depuis ${new Date(s.seller.since).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}${s.seller.emailVerified ? ' · <span class="badge-v">E-mail confirmé</span>' : ''}</p>
      ${s.seller.bio ? `<p style="margin-top:8px;white-space:pre-line">${esc(s.seller.bio)}</p>` : ''}
      <p style="margin-top:8px">${st.reviews ? T.stars(st.avg) + ` ${st.avg}/5 · ${st.reviews} avis` : 'Pas encore d\'avis'} · ${st.sales} vente${st.sales > 1 ? 's' : ''} conclue${st.sales > 1 ? 's' : ''} · ${st.available} pièce${st.available > 1 ? 's' : ''} en ligne</p>
      <p class="muted small" style="margin-top:6px">Mode de remise : ${s.handover.map((h) => `${esc(h.label)} (${dh(h.fee)})`).join(', ')}. Délai communiqué par le transporteur, non garanti.</p>
      <div class="share-row" style="margin-top:10px"><button class="btn btn-line btn-sm" data-act="copylink" data-url="/vendeur/${s.seller.id}">Copier le lien du dressing</button><button class="btn btn-line btn-sm" data-act="nshare" data-url="/vendeur/${s.seller.id}" data-t="Dressing de ${esc(s.seller.name)}">Partager</button>${T.user && !me ? `<button class="btn btn-line btn-sm" data-act="report" data-type="user" data-id="${s.seller.id}">Signaler ce profil</button>` : ''}</div></div></div>
      ${s.bundles.length ? `<h2 class="h2" style="font-size:26px;margin:32px 0 14px">Lots</h2><div class="drops">${s.bundles.map(T.bundleCard).join('')}</div>` : ''}
      <h2 class="h2" style="font-size:26px;margin:32px 0 16px">Dressing (${s.items.length})</h2>${s.items.length ? T.grid(s.items) : T.emptyBox(DJ.empty, 'Aucun article en ligne pour le moment.')}
      ${s.reviews.length ? `<h2 class="h2" style="font-size:26px;margin:36px 0 16px">Avis d'acheteurs</h2><div class="stack">${s.reviews.map((r) => `<div class="panel"><div class="between"><b>${esc(r.buyer)}</b><span class="muted small">${T.ago(r.ts)}</span></div>${T.stars(r.rating)}<p>${esc(r.text)}</p></div>`).join('')}</div><p class="muted small" style="margin-top:8px">Chaque avis provient d'une commande réellement livrée et confirmée.</p>` : ''}</div>`;
  });

  /* ---------- Signalement ---------- */
  const REASONS = { item: ['Contrefaçon', 'Photo trompeuse', 'Prix abusif', 'Article interdit', 'Autre'], user: ['Comportement abusif', 'Faux profil', 'Arnaque', 'Autre'], review: ['Avis injurieux', 'Avis mensonger', 'Autre'] };
  T.reportDlg = async (type, id) => {
    if (needLogin()) return;
    const r = await T.modal(`<h3>Signaler</h3><form class="stack"><div class="field"><label for="rr">Motif</label><select class="in" id="rr" name="reason" required>${T.opts(REASONS[type], '', 'Choisir…')}</select></div><div class="field"><label for="rn">Précisions (facultatif)</label><textarea class="in" id="rn" name="note" maxlength="500"></textarea></div><div class="row"><button class="btn btn-fill" type="submit">Envoyer</button><button class="btn btn-line" type="button" data-close="no">Annuler</button></div></form>`);
    if (r && r.reason) await T.run(() => T.post('/report', { type, id, reason: r.reason, note: r.note }), 'Merci, notre équipe examine le signalement.');
  };

  /* ---------- Partage ---------- */
  T.acts.copylink = async (el) => {
    const u = abs(el.dataset.url);
    try { await navigator.clipboard.writeText(u); T.toast('Lien copié'); } catch { await T.modal(`<h3>Copiez le lien</h3><form class="stack"><input class="in" readonly value="${esc(u)}" onfocus="this.select()" aria-label="Lien"><button class="btn btn-fill" type="submit">Fermer</button></form>`); }
  };
  T.acts.nshare = async (el) => {
    const u = abs(el.dataset.url);
    if (navigator.share) { try { await navigator.share({ title: el.dataset.t, url: u }); } catch { /* annulé */ } } else T.acts.copylink(el);
  };
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const wrap = (ctx, text, x, y, w, lh, max) => { const words = text.split(' '); let line = '', n = 0; for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (ctx.measureText(t).width > w && line) { ctx.fillText(line, x, y); y += lh; line = wd; if (++n >= max - 1) break; } else line = t; } ctx.fillText(n >= max - 1 && words.join(' ').length > line.length + 20 ? line + '…' : line, x, y); return y; };
  T.acts.story = async (el) => {
    const it = (await T.get('/items/' + el.dataset.id)).item;
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; c.className = 'story'; const x = c.getContext('2d');
    x.fillStyle = '#F5F3ED'; x.fillRect(0, 0, 1080, 1920);
    x.fillStyle = '#3454F5'; x.fillRect(0, 0, 1080, 220);
    try { const lg = await loadImg('/assets/logo.png'), h = 90, w = lg.width * h / lg.height; x.fillStyle = '#fff'; x.fillRect(60, 65, w + 40, h + 0); x.drawImage(lg, 80, 65, w, h); } catch { x.fillStyle = '#fff'; x.font = '800 72px sans-serif'; x.fillText('Thrifty', 60, 140); }
    if (it.photos[0]) {
      try { const im = await loadImg(it.photos[0]), bx = 60, by = 280, bw = 960, bh = 1100, r = Math.max(bw / im.width, bh / im.height), sw = bw / r, sh = bh / r;
        x.save(); x.beginPath(); x.roundRect(bx, by, bw, bh, 40); x.clip(); x.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, bx, by, bw, bh); x.restore(); } catch { /* photo illisible */ }
    }
    x.fillStyle = '#242629'; x.font = '700 64px "DM Sans",sans-serif'; const y = wrap(x, it.title, 60, 1480, 960, 74, 2);
    x.fillStyle = '#3454F5'; x.font = '800 110px "Bricolage Grotesque",sans-serif'; x.fillText(dh(it.price), 60, y + 130);
    x.fillStyle = '#242629'; x.font = '500 40px "DM Sans",sans-serif'; x.fillText([it.size && 'Taille ' + it.size, it.cond].filter(Boolean).join(' · '), 60, y + 200);
    x.fillStyle = '#3454F5'; x.fillRect(0, 1780, 1080, 140); x.fillStyle = '#fff'; x.font = '700 44px "DM Sans",sans-serif'; x.fillText('Les belles pièces circulent.', 60, 1865); x.font = '500 34px "DM Sans",sans-serif'; x.textAlign = 'right'; x.fillText(location.host, 1020, 1865);
    const r = await T.modal(`<h3>Carte pour votre story</h3><p class="muted small">Téléchargez l'image puis publiez-la vous-même : rien n'est publié automatiquement.</p><form class="stack"><div id="cv" style="display:grid"></div><div class="row"><button class="btn btn-fill" type="submit" data-dl="1">Télécharger l'image</button><button class="btn btn-line" type="button" data-close="no">Fermer</button></div></form>`, { setup: (m) => $('#cv', m).appendChild(c) });
    if (r) c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'thrifty-story-' + it.id + '.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/png');
  };

  /* ---------- Recherches sauvegardées ---------- */
  T.saveSearch = async (params) => {
    if (needLogin()) return;
    if (!Object.values(params).some(Boolean)) return T.toast('Choisissez au moins un filtre avant d\'enregistrer.');
    const r = await T.modal(`<h3>Enregistrer cette recherche</h3><form class="stack"><div class="field"><label for="sn">Nom</label><input class="in" id="sn" name="name" maxlength="50" value="Ma recherche" required></div><label class="ck"><input type="checkbox" name="alerts" checked> Me prévenir dans Thrifty quand une nouvelle pièce correspond</label>${T.cfg.mailEnabled ? '<label class="ck"><input type="checkbox" name="email"> Et aussi par e-mail</label>' : ''}<div class="row"><button class="btn btn-fill" type="submit">Enregistrer</button><button class="btn btn-line" type="button" data-close="no">Annuler</button></div></form>`);
    if (r && (await T.run(() => T.post('/searches', { name: r.name, params, alerts: !!r.alerts, email: !!r.email }), 'Recherche enregistrée.'))) { /* ok */ }
  };
  T.route(/^\/recherches$/, async () => {
    const { searches, mailEnabled } = await T.get('/searches'); T.title('Mes recherches');
    const desc = (p) => [p.univ && SH.UNIV[p.univ], p.cat, p.size && 'Taille ' + p.size, p.cond, p.brand, p.max && '≤ ' + p.max + ' DH', p.zone && SH.ZONES[p.zone] && SH.ZONES[p.zone].label, p.city, p.q && '« ' + p.q + ' »'].filter(Boolean).join(' · ');
    return `<div class="wrap sp"><h1 class="h2" style="margin-bottom:18px">Mes recherches</h1>${searches.length ? `<div class="stack">${searches.map((s) => `<div class="panel"><div class="between"><h3>${esc(s.name)}</h3><span class="pill ${s.alerts ? 'ok' : ''}">${s.alerts ? 'Alertes actives' : 'Alertes coupées'}</span></div><p class="small muted">${esc(desc(s.params))}</p><div class="row" style="margin-top:10px"><a class="btn btn-sm btn-fill" href="/catalogue?${new URLSearchParams(s.params)}">Voir les résultats</a><button class="btn btn-sm btn-line" data-act="srename" data-id="${s.id}" data-n="${esc(s.name)}">Renommer</button><button class="btn btn-sm btn-line" data-act="salert" data-id="${s.id}" data-on="${s.alerts ? 1 : 0}">${s.alerts ? 'Couper les alertes' : 'Activer les alertes'}</button>${mailEnabled && s.alerts ? `<button class="btn btn-sm btn-line" data-act="smail" data-id="${s.id}" data-on="${s.email ? 1 : 0}">${s.email ? 'Stop e-mails' : 'Recevoir par e-mail'}</button>` : ''}<button class="btn btn-sm btn-line" data-act="sdel" data-id="${s.id}">Supprimer</button></div></div>`).join('')}</div>` : T.emptyBox(DJ.empty, 'Utilisez « Enregistrer la recherche » dans le catalogue pour être prévenu(e) des nouvelles pièces.', '<a class="btn btn-fill" href="/catalogue">Ouvrir le catalogue</a>')}</div>`;
  }, { auth: true });
  T.acts.salert = async (el) => { if (await T.run(() => T.put('/searches/' + el.dataset.id, { alerts: el.dataset.on !== '1' }), DJ.done + ' !')) T.render(); };
  T.acts.smail = async (el) => { if (await T.run(() => T.put('/searches/' + el.dataset.id, { email: el.dataset.on !== '1' }), DJ.done + ' !')) T.render(); };
  T.acts.sdel = async (el) => { if (await T.run(() => T.del('/searches/' + el.dataset.id), 'Recherche supprimée.')) T.render(); };
  T.acts.srename = async (el) => { const r = await T.modal(`<h3>Renommer</h3><form class="stack"><input class="in" name="name" maxlength="50" value="${esc(el.dataset.n)}" required aria-label="Nom"><div class="row"><button class="btn btn-fill" type="submit">Valider</button><button class="btn btn-line" type="button" data-close="no">Annuler</button></div></form>`); if (r && (await T.run(() => T.put('/searches/' + el.dataset.id, { name: r.name }), DJ.done + ' !'))) T.render(); };

  /* ---------- Confirmation d'e-mail ---------- */
  T.route(/^\/verifier-email$/, async (_, q) => {
    T.title('Confirmation d\'e-mail');
    let msg, ok = false; try { await T.post('/me/verify-email/confirm', { token: q.get('token') || '' }); ok = true; msg = 'Votre e-mail est confirmé.'; if (T.user) T.user.emailVerified = true; } catch (e) { msg = e.message; }
    return `<div class="wrap sp" style="max-width:520px">${T.emptyBox(ok ? DJ.done + ' !' : 'Lien invalide', msg, '<a class="btn btn-fill" href="/compte">Mon compte</a>')}</div>`;
  }, { auth: true });
})();
