/* Vues acheteur : accueil, catalogue, article, vendeur, favoris. */
(function () {
  'use strict';
  const T = window.T, SH = T.SH, { esc, dh, $, $$ } = T, DJ = T.DJ;

  /* ---------- Accueil (allégé) ---------- */
  T.route(/^\/$/, async () => {
    const { items } = await T.get('/items?per=8');
    const tile = (k, l, n) => `<a class="tile rv" href="/${k}" style="--d:${n * 0.08}s"><div class="tile-top"><span>Thrifty</span><span class="arrow">${T.ico('arrow', 20)}</span></div><h3>${l}</h3></a>`;
    return `<section class="hero"><div class="wrap hero-in"><div>
        <div class="eyebrow"><span class="bar"></span>${esc(DJ.hello)}</div>
        <h1 class="display"><span class="line" style="--i:0"><span>Seconde main.</span></span><span class="line" style="--i:1"><span class="skew">Premier choix.</span></span></h1>
        <form class="herosearch" data-form="search" role="search"><input name="q" type="search" placeholder="${esc(DJ.ask)}" aria-label="Rechercher"><button class="btn btn-ink" type="submit">Chercher</button></form>
      </div><div class="hero-visual"><div class="bagwrap"><img src="/assets/bag.jpg" alt="Sac Thrifty" width="540" height="530"></div></div></div></section>
    <section class="wrap sp-s"><div class="univ">${tile('femmes', 'Femmes', 0)}${tile('hommes', 'Hommes', 1)}${tile('enfants', 'Enfants', 2)}</div></section>
    <section class="wrap sp-s"><div class="sec-head"><div><div class="eyebrow"><span class="bar"></span>Nouveautés</div></div><a class="link" href="/catalogue">Tout voir</a></div>
      ${items.length ? T.grid(items) : T.emptyBox(DJ.empty, 'Soyez la première personne à mettre une belle pièce en ligne.', `<a class="btn btn-fill" href="/vendre">${esc(DJ.sell)}</a>`)}</section>
    <section class="banner"><div class="wrap banner-in"><div><div class="eyebrow" style="color:#fff"><span class="bar" style="background:#fff"></span>${esc(DJ.hi)}</div><h2>Un dressing qui dort ? ${esc(DJ.sell)}.</h2><p>Photographiez, fixez votre prix, on s'occupe du reste. Commission de ${Math.round(T.cfg.rate * 100)} % seulement quand vous vendez.</p>
      <p style="margin-top:20px"><a class="btn btn-inverse" href="/vendre">Mettre en vente <span class="ar">→</span></a></p></div><div class="photo"><img src="/assets/couple.jpg" alt="" loading="lazy"></div></div></section>`;
  });

  /* ---------- Catalogue ---------- */
  const catalogue = (univ, promo) => async (_, q) => {
    const st = { univ, promo, q: q.get('q') || '', cat: (q.get('cat') || '').split(',').filter(Boolean), size: (q.get('size') || '').split(',').filter(Boolean), cond: (q.get('cond') || '').split(',').filter(Boolean), max: q.get('max') || '', city: q.get('city') || '', sort: q.get('sort') || '', page: Number(q.get('page')) || 1 };
    const title = promo ? 'Promos' : univ ? SH.UNIV[univ] : st.q ? `« ${st.q} »` : 'Tout voir';
    T.title(title);
    if (T.user && !T.favsLoaded) await loadFavs();
    const cats = univ ? SH.catsFor(univ) : SH.CATS, sizes = univ ? SH.allSizes(univ) : [...new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL'])];
    const html = `<section class="cat-head"><div class="wrap cat-head-in"><div><nav class="crumbs" aria-label="Fil d'Ariane"><a href="/">Accueil</a><span>/</span><span>${esc(title)}</span></nav><h1>${esc(title)}</h1></div><p class="muted" id="cnt" aria-live="polite"></p></div></section>
    <div class="wrap layout"><aside class="filters" id="filters" aria-label="Filtres">
      <div class="fg"><h4>Catégorie</h4>${cats.map((c) => `<label class="ck"><input type="checkbox" data-f="cat" value="${esc(c)}"${st.cat.includes(c) ? ' checked' : ''}>${esc(c)}</label>`).join('')}</div>
      <div class="fg"><h4>Taille</h4><div class="sizes">${sizes.map((s) => `<button type="button" class="sz" data-act="fsize" data-v="${esc(s)}" aria-pressed="${st.size.includes(s)}">${esc(s)}</button>`).join('')}</div></div>
      <div class="fg"><h4>État</h4>${SH.COND.map((c) => `<label class="ck"><input type="checkbox" data-f="cond" value="${esc(c)}"${st.cond.includes(c) ? ' checked' : ''}>${esc(c)}</label>`).join('')}</div>
      <div class="fg"><h4>Prix max : <span id="maxv">${st.max ? dh(st.max) : 'illimité'}</span></h4><input type="range" id="maxr" min="0" max="1000" step="10" value="${st.max || 1000}" aria-label="Prix maximum"></div>
      <div class="fg"><h4>Ville</h4><select class="sel" id="fcity" style="width:100%">${T.opts(SH.CITIES, st.city, 'Toutes les villes')}</select></div>
      <div class="fg"><button class="btn btn-line btn-sm" type="button" data-act="freset">Tout effacer</button></div></aside>
      <div><div class="toolbar"><button class="btn btn-line btn-sm filter-btn" type="button" data-act="ftoggle">Filtres</button><label class="row small">Trier par <select class="sel" id="fsort"><option value="">Nouveautés</option><option value="asc">Prix croissant</option><option value="desc">Prix décroissant</option></select></label></div>
      <div id="list"></div><nav class="row" id="pager" style="justify-content:center;margin-top:28px" aria-label="Pagination"></nav></div></div>`;
    return [html, (root) => {
      $('#fsort', root).value = st.sort;
      let tm;
      const sync = () => {
        const p = new URLSearchParams();
        ['q', 'max', 'city', 'sort'].forEach((k) => st[k] && p.set(k, st[k]));
        ['cat', 'size', 'cond'].forEach((k) => st[k].length && p.set(k, st[k].join(',')));
        if (st.page > 1) p.set('page', st.page);
        history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
      };
      const load = async () => {
        sync();
        const p = new URLSearchParams({ per: 24, page: st.page });
        if (st.univ) p.set('univ', st.univ); if (st.promo) p.set('promo', '1');
        ['q', 'max', 'city', 'sort'].forEach((k) => st[k] && p.set(k, st[k]));
        ['cat', 'size', 'cond'].forEach((k) => st[k].length && p.set(k, st[k].join(',')));
        try {
          const r = await T.get('/items?' + p);
          $('#cnt', root).textContent = `${r.total} article${r.total > 1 ? 's' : ''}`;
          $('#list', root).innerHTML = r.items.length ? T.grid(r.items) : T.emptyBox(DJ.empty, 'Aucun article ne correspond. Essayez moins de filtres.', '<button class="btn btn-line" data-act="freset">Tout effacer</button>');
          $('#pager', root).innerHTML = r.pages > 1 ? `<button class="btn btn-line btn-sm" data-act="fpage" data-p="${r.page - 1}"${r.page <= 1 ? ' disabled' : ''}>Précédent</button><span class="muted small">Page ${r.page} / ${r.pages}</span><button class="btn btn-line btn-sm" data-act="fpage" data-p="${r.page + 1}"${r.page >= r.pages ? ' disabled' : ''}>Suivant</button>` : '';
        } catch (e) { $('#list', root).innerHTML = `<p class="alert bad">${esc(e.message)}</p>`; }
      };
      const reset = () => { st.page = 1; load(); };
      root.addEventListener('change', (e) => {
        const t = e.target;
        if (t.dataset.f) { st[t.dataset.f] = $$(`[data-f=${t.dataset.f}]:checked`, root).map((c) => c.value); reset(); }
        else if (t.id === 'fcity') { st.city = t.value; reset(); } else if (t.id === 'fsort') { st.sort = t.value; reset(); }
      });
      $('#maxr', root).addEventListener('input', (e) => { const v = Number(e.target.value); st.max = v >= 1000 ? '' : String(v); $('#maxv', root).textContent = st.max ? dh(st.max) : 'illimité'; clearTimeout(tm); tm = setTimeout(reset, 300); });
      T.acts.fsize = (el) => { const v = el.dataset.v, on = el.getAttribute('aria-pressed') !== 'true'; el.setAttribute('aria-pressed', on); st.size = on ? [...st.size, v] : st.size.filter((x) => x !== v); reset(); };
      T.acts.freset = () => { Object.assign(st, { q: '', cat: [], size: [], cond: [], max: '', city: '', sort: '', page: 1 }); T.render(); history.replaceState(null, '', location.pathname); };
      T.acts.ftoggle = () => $('#filters', root).classList.toggle('open');
      T.acts.fpage = (el) => { st.page = Number(el.dataset.p); load().then(() => window.scrollTo({ top: 0, behavior: 'smooth' })); };
      load();
    }];
  };
  async function loadFavs() { try { T.favs = new Set((await T.get('/favs/ids')).ids); } catch { /* ignore */ } T.favsLoaded = true; }
  T.loadFavs = loadFavs;
  T.route(/^\/(femmes|hommes|enfants)$/, (m, q) => catalogue(m[0])(m, q));
  T.route(/^\/catalogue$/, catalogue(null, false));
  T.route(/^\/promos$/, catalogue(null, true));

  /* ---------- Article ---------- */
  T.route(/^\/article\/(\d+)$/, async ([id]) => {
    const d = await T.get('/items/' + id), it = d.item, u = T.user, mine = u && u.id === it.seller.id, ss = d.sellerStats;
    if (u && !T.favsLoaded) await loadFavs();
    T.title(it.title + ' · ' + dh(it.price));
    const m = { price: it.price, ship: T.cfg.ship }, agreed = d.convo && d.convo.agreed && d.convo.agreed < it.price ? d.convo.agreed : null, pay = agreed || it.price;
    const sold = it.status === 'sold', avail = it.status === 'published';
    const fav = T.favs.has(it.id);
    const photos = it.photos.length ? it.photos : [null];
    const html = `<div class="wrap"><nav class="crumbs" style="margin-top:20px" aria-label="Fil d'Ariane"><a href="/">Accueil</a><span>/</span><a href="/${it.univ}">${esc(SH.UNIV[it.univ])}</a><span>/</span><span>${esc(it.cat)}</span></nav>
    <div class="item"><div class="gal${photos.length < 2 ? ' one' : ''}"><div class="thumbs">${photos.map((p, i) => `<button type="button" data-act="thumb" data-i="${i}" aria-current="${i === 0}" aria-label="Photo ${i + 1}">${p ? `<img src="${esc(p)}" alt="">` : ''}</button>`).join('')}</div>
      <div class="main-img" id="mainimg">${photos[0] ? `<img id="mainph" src="${esc(photos[0])}" alt="${esc(it.title)}">` : '<div class="art"></div>'}${sold ? '<div class="sold-ov">Vendu</div>' : ''}</div></div>
    <div><h1 class="ititle">${esc(it.title)}</h1>
      <div class="bigprice"><b>${dh(it.price)}</b>${it.oldPrice ? `<s>${dh(it.oldPrice)}</s><span class="pill blue">−${Math.round((1 - it.price / it.oldPrice) * 100)} %</span>` : ''}</div>
      <p class="muted small">+ ${dh(m.ship)} de livraison · ${esc(T.cfg.paymentMethods.map((x) => x.label).join(', ') || '')}</p>
      ${agreed ? `<p class="alert ok" style="margin-top:12px">${esc(DJ.congrats)} ! Prix convenu avec le vendeur : <b>${dh(agreed)}</b></p>` : ''}
      <dl class="facts"><div><dt>Marque</dt><dd>${esc(it.brand)}</dd></div><div><dt>Taille</dt><dd>${esc(it.size)}</dd></div><div><dt>État</dt><dd>${esc(it.cond)}</dd></div><div><dt>Couleur</dt><dd>${esc(it.color)}</dd></div><div><dt>Défauts</dt><dd>${esc(it.defects)}</dd></div><div><dt>Ville</dt><dd>${esc(it.city)}</dd></div></dl>
      <p style="white-space:pre-line">${esc(it.desc)}</p>
      <div class="buy">${mine ? `<a class="btn btn-fill" href="/vendre/${it.id}">Modifier l'annonce</a>` + (avail ? `<button class="btn btn-line" data-act="lower" data-id="${it.id}" data-price="${it.price}">Baisser le prix</button>` : '')
        : sold ? `<p class="alert info">${esc(DJ.done)}, cet article est déjà vendu. <a class="link" href="/${it.univ}">Voir des pièces similaires</a></p>`
        : !avail ? '<p class="alert warn">Cette annonce n\'est pas en ligne.</p>'
        : `<a class="btn btn-fill btn-block" href="/paiement/${it.id}">Acheter · ${dh(pay + m.ship)} <span class="ar">→</span></a>
           <div class="row"><button class="btn btn-line grow" data-act="offer" data-id="${it.id}" data-price="${it.price}">${esc(DJ.offer)} · ${esc(DJ.offerFr)}</button><button class="btn btn-line grow" data-act="contact" data-id="${it.id}">Écrire au vendeur</button>
           <button class="btn btn-line" data-act="fav" data-id="${it.id}" aria-pressed="${fav}" aria-label="Favori">${T.ico('heart', 20)}</button></div>`}</div>
      <a class="seller-card" href="/vendeur/${it.seller.id}"><span class="avatar">${esc(it.seller.name[0].toUpperCase())}</span><span class="grow"><b>${esc(it.seller.name)}</b><br><span class="small muted">${esc(it.seller.city || '')}${ss.reviews ? ' · ' + T.stars(ss.avg) + ' (' + ss.reviews + ')' : ' · pas encore d\'avis'} · ${ss.sales} vente${ss.sales > 1 ? 's' : ''}</span></span>${T.ico('arrow', 20)}</a>
      <div class="note-box"><span>🔒</span><span>Vous réglez à la livraison. Vérifiez le colis, puis confirmez la réception : le vendeur n'est payé qu'ensuite. En cas de problème, signalez-le depuis votre commande.</span></div>
      ${!mine && u ? `<p class="small" style="margin-top:14px"><button class="link" style="background:none;border-width:0 0 2px" data-act="report" data-id="${it.id}">Signaler cette annonce</button></p>` : ''}</div></div>
    ${d.similar.length ? `<section class="sp-s"><h2 class="h2" style="font-size:28px;margin-bottom:18px">Dans le même esprit</h2>${T.grid(d.similar)}</section>` : ''}</div>`;
    return [html, (root) => {
      T.acts.thumb = (el) => { const p = photos[Number(el.dataset.i)]; $$('.thumbs button', root).forEach((b) => b.setAttribute('aria-current', b === el)); if (p) $('#mainph', root).src = p; };
      const mi = $('#mainimg', root);
      mi.addEventListener('mousemove', (e) => { const r = mi.getBoundingClientRect(); const im = $('img', mi); if (im) { im.style.setProperty('--zx', ((e.clientX - r.left) / r.width * 100) + '%'); im.style.setProperty('--zy', ((e.clientY - r.top) / r.height * 100) + '%'); } });
    }];
  });
  const needLogin = () => { if (T.user) return false; T.go('/connexion?next=' + encodeURIComponent(location.pathname)); return true; };
  T.acts.contact = async (el) => { if (needLogin()) return; const r = await T.run(() => T.post('/convos', { itemId: Number(el.dataset.id) })); if (r) T.go('/messages/' + r.id); };
  T.acts.offer = async (el) => {
    if (needLogin()) return;
    const price = Number(el.dataset.price), sug = Math.max(1, Math.round(price * 0.85));
    const r = await T.modal(`<h3>${esc(DJ.offer)}</h3><p class="muted">Prix affiché : ${dh(price)}. Proposez un montant plus bas, le vendeur peut accepter, refuser ou répondre.</p>
      <form class="stack" id="of"><div class="field"><label for="am">Votre offre (DH)</label><input class="in" id="am" name="amount" type="number" min="1" max="${price - 1}" value="${sug}" required></div>
      <div class="row"><button class="btn btn-fill" type="submit">Envoyer l'offre</button><button class="btn btn-line" type="button" data-close="no">Annuler</button></div></form>`);
    if (!r) return;
    const c = await T.run(() => T.post('/convos', { itemId: Number(el.dataset.id) })); if (!c) return;
    if (await T.run(() => T.post(`/convos/${c.id}/offers`, { amount: Number(r.amount) }), 'Offre envoyée')) T.go('/messages/' + c.id);
  };
  T.acts.lower = async (el) => {
    const price = Number(el.dataset.price);
    const r = await T.modal(`<h3>Baisser le prix</h3><p class="muted">Les personnes qui ont mis l'article en favori seront prévenues.</p><form class="stack"><div class="field"><label for="np">Nouveau prix (DH)</label><input class="in" id="np" name="price" type="number" min="1" max="${price - 1}" value="${Math.max(1, Math.round(price * 0.9))}" required></div><div class="row"><button class="btn btn-fill" type="submit">Valider</button><button class="btn btn-line" type="button" data-close="no">Annuler</button></div></form>`);
    if (r && (await T.run(() => T.post(`/items/${el.dataset.id}/price`, { price: Number(r.price) }), DJ.done + ' !'))) T.render();
  };
  T.acts.report = async (el) => {
    const r = await T.modal(`<h3>Signaler l'annonce</h3><form class="stack"><div class="field"><label for="rs">Que se passe-t-il ?</label><textarea class="in" id="rs" name="reason" required minlength="5" maxlength="500" placeholder="Contrefaçon, photo trompeuse, prix abusif…"></textarea></div><div class="row"><button class="btn btn-fill" type="submit">Envoyer</button><button class="btn btn-line" type="button" data-close="no">Annuler</button></div></form>`);
    if (r) await T.run(() => T.post('/report', { itemId: Number(el.dataset.id), reason: r.reason }), 'Merci, nous regardons ça.');
  };

  /* ---------- Vendeur ---------- */
  T.route(/^\/vendeur\/(\d+)$/, async ([id]) => {
    const [s, l] = await Promise.all([T.get('/sellers/' + id), T.get('/items?seller=' + id + '&per=48')]);
    if (T.user && !T.favsLoaded) await loadFavs();
    T.title(s.seller.name);
    const st = s.stats;
    return `<div class="wrap sp"><div class="row" style="gap:20px"><span class="avatar lg">${esc(s.seller.name[0].toUpperCase())}</span><div><h1 class="h2">${esc(s.seller.name)}</h1><p class="muted">${esc(s.seller.city || '')} · membre depuis ${new Date(s.seller.since).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p>
      <p>${st.reviews ? T.stars(st.avg) + ` ${st.avg}/5 · ${st.reviews} avis` : 'Pas encore d\'avis'} · ${st.sales} vente${st.sales > 1 ? 's' : ''}</p></div></div>
      <h2 class="h2" style="font-size:26px;margin:32px 0 16px">Dressing (${l.total})</h2>${l.items.length ? T.grid(l.items) : T.emptyBox(DJ.empty, 'Aucun article en ligne pour le moment.')}
      ${s.reviews.length ? `<h2 class="h2" style="font-size:26px;margin:36px 0 16px">Avis</h2><div class="stack">${s.reviews.map((r) => `<div class="panel"><div class="between"><b>${esc(r.buyer)}</b><span class="muted small">${T.ago(r.ts)}</span></div>${T.stars(r.rating)}<p>${esc(r.text)}</p></div>`).join('')}</div>` : ''}</div>`;
  });

  /* ---------- Favoris ---------- */
  T.route(/^\/favoris$/, async () => {
    const { items } = await T.get('/favs'); T.favs = new Set(items.map((i) => i.id)); T.favsLoaded = true; T.title('Favoris');
    return `<div class="wrap sp"><h1 class="h2" style="margin-bottom:20px">Mes favoris</h1>${items.length ? T.grid(items) : T.emptyBox(DJ.empty, 'Touchez le cœur d\'un article pour le retrouver ici et être prévenu si son prix baisse.', '<a class="btn btn-fill" href="/catalogue">Découvrir</a>')}</div>`;
  }, { auth: true });
})();
