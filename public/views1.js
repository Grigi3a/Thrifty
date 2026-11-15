/* Vues acheteur : accueil, catalogue, article, vendeur, favoris. */
(function () {
  'use strict';
  const T = window.T, SH = T.SH, { esc, dh, $, $$ } = T, DJ = T.DJ;

  /* ---------- Accueil (allégé) ---------- */
  T.route(/^\/$/, async () => {
    const [{ items }, dr] = await Promise.all([T.get('/items?per=8'), T.cfg.drops ? T.get('/collections').catch(() => ({ collections: [] })) : Promise.resolve({ collections: [] })]);
    const chips = { femmes: ['Robes', 'Vestes', 'Sacs'], hommes: ['Chemises', 'Pulls', 'Baskets'], enfants: ['0-12 ans', 'Manteaux', 'Chaussures'] };
    const tile = (k, l, n) => `<a class="tile rv" href="/${k}" style="--d:${n * 0.06}s"><div class="tile-top"><span>Thrifty</span><span class="arrow">${T.ico('arrow', 20)}</span></div><div><h3>${l}</h3><ul>${chips[k].map((c) => `<li>${c}</li>`).join('')}</ul></div></a>`;
    const z = SH.ZONES.rabat;
    const drops = dr.collections.length ? `<section class="wrap sp-s rv"><div class="sec-head"><div class="eyebrow"><span class="bar"></span>Drops Thrifty</div><a class="link" href="/drops">Tous les drops</a></div><div class="drops">${dr.collections.slice(0, 3).map(T.dropCard).join('')}</div></section>` : '';
    return `<section class="hero2"><div class="wrap hero2-in"><div>
        <div class="eyebrow"><span class="bar"></span>${esc(DJ.hello)}</div>
        <h1>Seconde main. Premier choix.</h1>
        <p class="lead">Les belles pièces circulent : femmes, hommes, enfants. Achetez, vendez, négociez, partout au Maroc.</p>
        <form class="herosearch" data-form="search" role="search"><span class="hs-ico" aria-hidden="true">${T.ico('search', 18)}</span><input name="q" type="search" placeholder="${esc(DJ.ask)}" aria-label="Rechercher"><button class="btn btn-ink" type="submit">Chercher</button></form>
        <div class="hero-cta"><a class="btn btn-inverse" href="/catalogue">Découvrir les pièces</a><a class="btn btn-ghost-w" href="/vendre">${esc(DJ.sell)}</a></div>
      </div><figure class="hero2-fig"><picture><source type="image/webp" srcset="/assets/hero-480.webp 480w, /assets/hero-720.webp 720w, /assets/hero-1122.webp 1122w" sizes="(max-width:860px) 92vw, 470px"><img src="/assets/hero-720.jpg" width="1122" height="1402" alt="Une jeune femme en veste en jean et sac cobalt tient des cintres de vêtements de seconde main" fetchpriority="high" decoding="async"></picture></figure></div></section>
    <section class="wrap sp-s"><div class="univ">${tile('femmes', 'Femmes', 0)}${tile('hommes', 'Hommes', 1)}${tile('enfants', 'Enfants', 2)}</div></section>
    <section class="wrap sp-s rv"><div class="sec-head"><div class="eyebrow"><span class="bar"></span>Près de chez vous</div></div>
      <div class="zone-row"><a class="btn btn-fill btn-sm" href="/catalogue?zone=rabat">${esc(z.label)}</a>${['Casablanca', 'Fès', 'Marrakech', 'Tanger'].map((c) => `<a class="btn btn-line btn-sm" href="/catalogue?city=${encodeURIComponent(c)}">${c}</a>`).join('')}<a class="link small" href="/catalogue">Toutes les villes</a></div>
      <p class="muted small" style="margin-top:10px">Vous choisissez la ville vous-même, nous n'utilisons pas votre position. Livraison par transporteur : ${dh(T.cfg.ship)} (délai communiqué par le transporteur, non garanti).</p></section>
    ${drops}
    <section class="wrap sp-s rv"><div class="sec-head"><div class="eyebrow"><span class="bar"></span>Nouveautés</div><a class="link" href="/catalogue">Tout voir</a></div>
      ${items.length ? T.grid(items) : T.emptyBox(DJ.empty, 'Soyez la première personne à mettre une belle pièce en ligne.', `<a class="btn btn-fill" href="/vendre">${esc(DJ.sell)}</a>`)}</section>
    <section class="banner"><div class="wrap banner-in"><div><div class="eyebrow" style="color:#fff"><span class="bar" style="background:#fff"></span>${esc(DJ.hi)}</div><h2>Un dressing qui dort ? ${esc(DJ.sell)}.</h2><p>Photographiez, fixez votre prix et échangez avec les acheteurs. Publier est gratuit.</p>
      <p style="margin-top:20px"><a class="btn btn-inverse" href="/vendre">Mettre en vente <span class="ar">→</span></a></p></div><div class="photo"><img src="/assets/couple.jpg" alt="" loading="lazy" width="600" height="600"></div></div></section>`;
  });

  /* ---------- Catalogue ---------- */
  const catalogue = (univ, promo) => async (_, q) => {
    const csv = (k) => (q.get(k) || '').split(',').filter(Boolean);
    const st = { univ, promo, q: q.get('q') || '', cat: csv('cat'), size: csv('size'), cond: csv('cond'), max: q.get('max') || '', city: q.get('city') || '', zone: SH.ZONES[q.get('zone')] ? q.get('zone') : '', brand: q.get('brand') || '', sort: q.get('sort') || '', page: Number(q.get('page')) || 1 };
    const title = promo ? 'Promos' : univ ? SH.UNIV[univ] : st.q ? `« ${st.q} »` : 'Tout voir';
    T.title(title);
    if (T.user && !T.favsLoaded) await loadFavs();
    const cats = univ ? SH.catsFor(univ) : SH.CATS, sizes = univ ? SH.allSizes(univ) : ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    const html = `<section class="cat-head"><div class="wrap cat-head-in"><div><nav class="crumbs" aria-label="Fil d'Ariane"><a href="/">Accueil</a><span>/</span><span>${esc(title)}</span></nav><h1>${esc(title)}</h1></div><p class="muted" id="cnt" aria-live="polite"></p></div></section>
    <div class="wrap layout"><div class="f-ov" id="fov" data-act="fclose"></div><aside class="filters" id="filters" aria-label="Filtres" role="region">
      <div class="f-head"><h3>Filtres</h3><button type="button" class="f-close" data-act="fclose" aria-label="Fermer les filtres">${T.ico('x', 20)}</button></div>
      <div class="fg"><h4>Catégorie</h4>${cats.map((c) => `<label class="ck"><input type="checkbox" data-f="cat" value="${esc(c)}"${st.cat.includes(c) ? ' checked' : ''}>${esc(c)}</label>`).join('')}</div>
      <div class="fg"><h4>Taille</h4><div class="sizes">${sizes.map((x) => `<button type="button" class="sz" data-act="fsize" data-v="${esc(x)}" aria-pressed="${st.size.includes(x)}">${esc(x)}</button>`).join('')}</div></div>
      <div class="fg"><h4>État</h4>${SH.COND.map((c) => `<label class="ck"><input type="checkbox" data-f="cond" value="${esc(c)}"${st.cond.includes(c) ? ' checked' : ''}>${esc(c)}</label>`).join('')}</div>
      <div class="fg"><h4>Marque</h4><input class="in" id="fbrand" type="search" value="${esc(st.brand)}" placeholder="Zara, Levi's…" autocomplete="off" aria-label="Marque"></div>
      <div class="fg"><h4>Prix max : <span id="maxv">${st.max ? dh(st.max) : 'illimité'}</span></h4><input type="range" id="maxr" min="0" max="1000" step="10" value="${st.max || 1000}" aria-label="Prix maximum"></div>
      <div class="fg"><h4>Ville</h4><select class="sel" id="fzone" style="width:100%" aria-label="Zone"><option value="">Toutes les villes</option><option value="rabat"${st.zone ? ' selected' : ''}>${esc(SH.ZONES.rabat.label)}</option></select>
        <select class="sel" id="fcity" style="width:100%;margin-top:8px" aria-label="Autre ville">${T.opts(SH.CITIES, st.city, 'Une ville précise')}</select></div>
      <div class="f-foot"><button class="btn btn-line" type="button" data-act="freset">Tout effacer</button><button class="btn btn-fill" type="button" data-act="fclose" id="fshow">Voir les résultats</button></div>
      <div class="fg hide-d"></div></aside>
      <div><div class="toolbar"><button class="btn btn-line btn-sm filter-btn" type="button" data-act="ftoggle" aria-controls="filters" aria-expanded="false">${T.ico('filter', 18)} Filtres</button><label class="row small">Trier par <select class="sel" id="fsort"><option value="">Nouveautés</option><option value="asc">Prix croissant</option><option value="desc">Prix décroissant</option></select></label><button class="btn btn-line btn-sm" type="button" data-act="fsave">Enregistrer la recherche</button></div>
      <div class="afil" id="afil" aria-label="Filtres actifs"></div>
      <div id="list" aria-live="polite"></div><nav class="row" id="pager" style="justify-content:center;margin-top:28px" aria-label="Pagination"></nav></div></div>`;
    return [html, (root) => {
      $('#fsort', root).value = st.sort;
      let tm, opener = null, seq = 0;
      const params = () => {
        const p = new URLSearchParams();
        ['q', 'max', 'city', 'zone', 'brand', 'sort'].forEach((k) => st[k] && p.set(k, st[k]));
        ['cat', 'size', 'cond'].forEach((k) => st[k].length && p.set(k, st[k].join(',')));
        return p;
      };
      const chips = () => {
        const c = [];
        st.cat.forEach((v) => c.push(['cat', v, v])); st.size.forEach((v) => c.push(['size', v, 'Taille ' + v])); st.cond.forEach((v) => c.push(['cond', v, v]));
        if (st.brand) c.push(['brand', '', st.brand]); if (st.max) c.push(['max', '', '≤ ' + dh(st.max)]);
        if (st.zone) c.push(['zone', '', SH.ZONES[st.zone].label]); if (st.city) c.push(['city', '', st.city]);
        $('#afil', root).innerHTML = c.map(([k, v, l]) => `<button type="button" data-act="fchip" data-k="${k}" data-v="${esc(v)}" aria-label="Retirer le filtre ${esc(l)}">${esc(l)} <span aria-hidden="true">×</span></button>`).join('');
      };
      const load = async () => {
        const mine = ++seq, p = params(); p.set('per', 24); p.set('page', st.page);
        const keep = params(); if (st.page > 1) keep.set('page', st.page);
        history.replaceState(null, '', location.pathname + (keep.toString() ? '?' + keep : ''));
        chips(); $('#list', root).classList.add('busy');
        if (st.univ) p.set('univ', st.univ); if (st.promo) p.set('promo', '1');
        try {
          const r = await T.get('/items?' + p); if (mine !== seq) return;
          $('#cnt', root).textContent = `${r.total} article${r.total > 1 ? 's' : ''}`; $('#fshow', root).textContent = `Voir ${r.total} résultat${r.total > 1 ? 's' : ''}`;
          $('#list', root).innerHTML = r.items.length ? T.grid(r.items) : T.emptyBox(DJ.empty, 'Aucun article ne correspond pour le moment. Essayez moins de filtres.', '<button class="btn btn-line" data-act="freset">Tout effacer</button>');
          $('#pager', root).innerHTML = r.pages > 1 ? `<button class="btn btn-line btn-sm" data-act="fpage" data-p="${r.page - 1}"${r.page <= 1 ? ' disabled' : ''}>Précédent</button><span class="muted small">Page ${r.page} / ${r.pages}</span><button class="btn btn-line btn-sm" data-act="fpage" data-p="${r.page + 1}"${r.page >= r.pages ? ' disabled' : ''}>Suivant</button>` : '';
        } catch (e) { if (mine === seq) $('#list', root).innerHTML = `<p class="alert bad">${esc(e.message)}</p>`; }
        $('#list', root).classList.remove('busy'); T.reveal && T.reveal();
      };
      const reset = () => { st.page = 1; load(); };
      const syncInputs = () => {
        $$('[data-f]', root).forEach((c) => { c.checked = st[c.dataset.f].includes(c.value); });
        $$('.sz', root).forEach((b) => b.setAttribute('aria-pressed', st.size.includes(b.dataset.v)));
        $('#fbrand', root).value = st.brand; $('#fcity', root).value = st.city; $('#fzone', root).value = st.zone;
        $('#maxr', root).value = st.max || 1000; $('#maxv', root).textContent = st.max ? dh(st.max) : 'illimité';
      };
      root.addEventListener('change', (e) => {
        const t = e.target;
        if (t.dataset.f) { st[t.dataset.f] = $$(`[data-f=${t.dataset.f}]:checked`, root).map((c) => c.value); reset(); }
        else if (t.id === 'fcity') { st.city = t.value; if (t.value) { st.zone = ''; $('#fzone', root).value = ''; } reset(); }
        else if (t.id === 'fzone') { st.zone = t.value; if (t.value) { st.city = ''; $('#fcity', root).value = ''; } reset(); }
        else if (t.id === 'fsort') { st.sort = t.value; reset(); }
      });
      $('#fbrand', root).addEventListener('input', (e) => { st.brand = e.target.value.trim(); clearTimeout(tm); tm = setTimeout(reset, 350); });
      $('#maxr', root).addEventListener('input', (e) => { const v = Number(e.target.value); st.max = v >= 1000 ? '' : String(v); $('#maxv', root).textContent = st.max ? dh(st.max) : 'illimité'; clearTimeout(tm); tm = setTimeout(reset, 300); });
      T.acts.fsize = (el) => { const v = el.dataset.v, on = el.getAttribute('aria-pressed') !== 'true'; el.setAttribute('aria-pressed', on); st.size = on ? [...st.size, v] : st.size.filter((x) => x !== v); reset(); };
      T.acts.fchip = (el) => { const k = el.dataset.k, v = el.dataset.v; if (Array.isArray(st[k])) st[k] = st[k].filter((x) => x !== v); else st[k] = ''; syncInputs(); reset(); };
      T.acts.freset = () => { Object.assign(st, { q: '', cat: [], size: [], cond: [], max: '', city: '', zone: '', brand: '', sort: '', page: 1 }); $('#fsort', root).value = ''; syncInputs(); load(); };
      const setOpen = (on) => {
        const f = $('#filters', root); f.classList.toggle('open', on); $('#fov', root).classList.toggle('open', on); document.body.classList.toggle('lock', on && innerWidth <= 900);
        $('.filter-btn', root).setAttribute('aria-expanded', on);
        if (on) { opener = document.activeElement; setTimeout(() => $('.f-close', root).focus(), 30); } else if (opener) { opener.focus(); opener = null; }
      };
      T.acts.ftoggle = () => setOpen(!$('#filters', root).classList.contains('open'));
      T.acts.fclose = () => setOpen(false);
      const esc2 = (e) => { if (e.key === 'Escape' && $('#filters', root) && $('#filters', root).classList.contains('open')) setOpen(false); };
      document.addEventListener('keydown', esc2);
      new MutationObserver((_, ob) => { if (!document.body.contains(root.firstChild) && !$('#filters')) { document.removeEventListener('keydown', esc2); document.body.classList.remove('lock'); ob.disconnect(); } }).observe(document.getElementById('view'), { childList: true });
      T.acts.fpage = (el) => { st.page = Number(el.dataset.p); load().then(() => window.scrollTo({ top: 0, behavior: 'smooth' })); };
      T.acts.fsave = () => T.saveSearch({ univ: st.univ || '', cat: st.cat.join(','), size: st.size.join(','), cond: st.cond.join(','), max: st.max, brand: st.brand, zone: st.zone, city: st.city, q: st.q });
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
      <div class="fees" style="margin-top:10px"><div><span>Prix de l'article</span><b>${dh(pay)}</b></div><div><span>Livraison (transporteur)</span><b>${dh(m.ship)}</b></div><div class="tot"><span>Total à payer</span><b>${dh(pay + m.ship)}</b></div><div class="muted small" style="display:block">${esc(T.cfg.paymentMethods.map((x) => x.label).join(', ') || '')}</div></div>
      ${mine ? (() => { const f = T.fees(pay); return `<div class="fees" style="margin-top:8px"><div><span>Commission Thrifty (${T.pct(f.rate)})</span><b>−${dh(f.commission)}</b></div><div class="tot"><span>Vous recevez</span><b>${dh(f.net)}</b></div></div>`; })() : ''}
      ${agreed ? `<p class="alert ok" style="margin-top:12px">${esc(DJ.congrats)} ! Prix convenu avec le vendeur : <b>${dh(agreed)}</b></p>` : ''}
      ${it.fit ? `<p style="margin-top:10px"><span class="fitbadge">${esc(SH.FITS[it.fit] || '')}</span> <span class="muted small">(avis du vendeur)</span></p>` : ''}
      <dl class="facts"><div><dt>Marque</dt><dd>${esc(it.brand)}</dd></div><div><dt>Taille</dt><dd>${esc(it.size)}</dd></div><div><dt>État</dt><dd>${esc(it.cond)}</dd></div><div><dt>Couleur</dt><dd>${esc(it.color)}</dd></div><div><dt>Défauts</dt><dd>${esc(it.defects)}</dd></div><div><dt>Ville</dt><dd>${esc(it.city)}</dd></div></dl>
      <p style="white-space:pre-line">${esc(it.desc)}</p>
      ${it.measures.length ? `<div class="panel" style="margin-top:14px"><h3 style="font-size:17px;margin-bottom:6px">Mesures du vendeur</h3><table class="measures">${it.measures.map((x) => `<tr><td>${esc(x.label)}</td><td>${x.value} cm</td></tr>`).join('')}</table><p class="muted small" style="margin-top:8px">${esc(SH.FLAT_NOTE)}</p></div>` : '<p class="muted small" style="margin-top:10px">Le vendeur n\'a pas indiqué de mesures : posez-lui la question avant d\'acheter.</p>'}
      <div id="bundles"></div>
      <div class="buy">${mine ? `<a class="btn btn-fill" href="/vendre/${it.id}">Modifier l'annonce</a>` + (avail ? `<button class="btn btn-line" data-act="lower" data-id="${it.id}" data-price="${it.price}">Baisser le prix</button>` : '')
        : sold ? `<p class="alert info">${esc(DJ.done)}, cet article est déjà vendu. <a class="link" href="/${it.univ}">Voir des pièces similaires</a></p>`
        : !avail ? '<p class="alert warn">Cette annonce n\'est pas en ligne.</p>'
        : `<a class="btn btn-fill btn-block" href="/paiement/${it.id}">Acheter · ${dh(pay + m.ship)} <span class="ar">→</span></a>
           <div class="row"><button class="btn btn-line grow" data-act="offer" data-id="${it.id}" data-price="${it.price}">${esc(DJ.offer)} · ${esc(DJ.offerFr)}</button><button class="btn btn-line grow" data-act="contact" data-id="${it.id}">Écrire au vendeur</button>
           <button class="btn btn-line" data-act="fav" data-id="${it.id}" aria-pressed="${fav}" aria-label="Favori">${T.ico('heart', 20)}</button></div>`}</div>
      <a class="seller-card" href="/vendeur/${it.seller.id}"><span class="avatar">${esc(it.seller.name[0].toUpperCase())}</span><span class="grow"><b>${esc(it.seller.name)}</b><br><span class="small muted">${esc(it.seller.city || '')}${ss.reviews ? ' · ' + T.stars(ss.avg) + ' (' + ss.reviews + ')' : ' · pas encore d\'avis'} · ${ss.sales} vente${ss.sales > 1 ? 's' : ''}</span></span>${T.ico('arrow', 20)}</a>
      <div class="note-box"><span>🔒</span><span>Vous réglez à la livraison. Vérifiez le colis, puis confirmez la réception : Thrifty ne verse le vendeur qu'après. En cas de problème, signalez-le depuis votre commande : l'équipe étudie chaque dossier.</span></div>
      ${avail || mine ? `<div class="share-row" style="margin-top:14px"><button class="btn btn-line btn-sm" data-act="copylink" data-url="/article/${it.id}">Copier le lien</button><button class="btn btn-line btn-sm" data-act="nshare" data-url="/article/${it.id}" data-t="${esc(it.title)}">Partager</button><button class="btn btn-line btn-sm" data-act="story" data-id="${it.id}">Carte story</button></div>` : ''}
      ${!mine && u ? `<p class="small" style="margin-top:14px"><button class="link" style="background:none;border-width:0 0 2px" data-act="report" data-type="item" data-id="${it.id}">Signaler cette annonce</button></p>` : ''}</div></div>
    ${d.similar.length ? `<section class="sp-s"><h2 class="h2" style="font-size:28px;margin-bottom:18px">Dans le même esprit</h2>${T.grid(d.similar)}</section>` : ''}</div>`;
    return [html, (root) => {
      T.acts.thumb = (el) => { const p = photos[Number(el.dataset.i)]; $$('.thumbs button', root).forEach((b) => b.setAttribute('aria-current', b === el)); if (p) $('#mainph', root).src = p; };
      T.get('/items/' + it.id + '/bundles').then((r) => { const el = $('#bundles', root); if (el && r.bundles.length) el.innerHTML = '<h3 style="font-size:17px;margin:16px 0 8px">Disponible en lot</h3>' + r.bundles.map(T.bundleCard).join(''); }).catch(() => {});
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
  T.acts.report = (el) => T.reportDlg(el.dataset.type || 'item', Number(el.dataset.id));

  /* ---------- Favoris ---------- */
  T.route(/^\/favoris$/, async () => {
    const { items } = await T.get('/favs'); T.favs = new Set(items.map((i) => i.id)); T.favsLoaded = true; T.title('Favoris');
    return `<div class="wrap sp"><h1 class="h2" style="margin-bottom:20px">Mes favoris</h1>${items.length ? T.grid(items) : T.emptyBox(DJ.empty, 'Touchez le cœur d\'un article pour le retrouver ici et être prévenu si son prix baisse.', '<a class="btn btn-fill" href="/catalogue">Découvrir</a>')}</div>`;
  }, { auth: true });
})();
