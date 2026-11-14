/* Thrifty — noyau : API, routeur, en-tête/pied, outils. Tout le texte darija est dans DJ ci-dessous. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  const SH = window.SHARED;
  const T = (window.T = { SH, user: null, cfg: { rate: 0.1, ship: 25, paymentMethods: [], company: {} }, favs: new Set(), badges: { notifs: 0, messages: 0 }, routes: [], acts: {}, forms: {}, timers: [] });

  /* ---- Touches de darija (écriture latine). Modifiez ici librement. ---- */
  T.DJ = {
    hello: 'Marhba bik', hi: 'Salam', ask: 'Chno bghiti lyoum ?', sell: 'Bghit nbi3', sellFr: 'Vendre',
    offer: 'Nqess chwiya', offerFr: 'Faire une offre', done: 'Safi', congrats: 'Mabrouk', thanks: 'Bessaha', empty: 'Mazal walo hna',
    login: 'Dkhol', signup: 'Tsajjel', help: 'Chi sou2al ?', bye: 'Bslama'
  };

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dh = (n) => (Math.round(n * 100) / 100).toLocaleString('fr-FR') + ' DH';
  const ago = (ts) => {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return "à l'instant"; if (s < 3600) return Math.floor(s / 60) + ' min'; if (s < 86400) return Math.floor(s / 3600) + ' h';
    if (s < 7 * 86400) return Math.floor(s / 86400) + ' j'; return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };
  const dateFr = (ts) => new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  Object.assign(T, { $, $$, esc, dh, ago, dateFr });

  /* ---- icônes ---- */
  const P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', heart: '<path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3 5 6.5 5c2 0 3.6 1.1 4.5 2.6C11.9 6.1 13.5 5 15.5 5 19 5 20.8 8.6 19.5 11.8 19.5 11.8 12 21 12 21z"/>',
    msg: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>', bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 9H3c0-1 3-2 3-9zM10 21h4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', home: '<path d="M3 11 12 3l9 8v10H3z"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', check: '<path d="m5 12 5 5 9-10"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', tag: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>'
  };
  T.ico = (n, s) => `<svg width="${s || 22}" height="${s || 22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

  /* ---- toast / modal ---- */
  let toastT;
  T.toast = (m) => { if (/Mabrouk/.test(m) && T.confetti) T.confetti(); $$('.toast').forEach((e) => e.remove()); const e = document.createElement('div'); e.className = 'toast'; e.setAttribute('role', 'status'); e.textContent = m; document.body.appendChild(e); clearTimeout(toastT); toastT = setTimeout(() => e.remove(), 3600); };
  T.modal = (html) => new Promise((res) => {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    const close = (v) => { bg.remove(); document.removeEventListener('keydown', key); res(v); };
    const key = (e) => { if (e.key === 'Escape') close(null); };
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(null); });
    bg.addEventListener('click', (e) => { const c = e.target.closest('[data-close]'); if (c) close(c.dataset.close === 'ok' ? 'ok' : null); });
    bg.addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; const o = {}; new FormData(f).forEach((v, k) => (o[k] = v)); f.querySelectorAll('input[type=checkbox]').forEach((c) => (o[c.name] = c.checked)); close(o); });
    document.addEventListener('keydown', key); document.body.appendChild(bg);
    const f = $('input,textarea,select,button.btn-fill', bg); if (f) f.focus();
  });
  T.confirm = async (title, text, ok, danger) => (await T.modal(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p><div class="row"><button class="btn ${danger ? 'btn-danger' : 'btn-fill'}" data-close="ok">${esc(ok || 'Confirmer')}</button><button class="btn btn-line" data-close="no">Annuler</button></div>`)) === 'ok';

  /* ---- API ---- */
  T.api = async (method, url, body) => {
    let r;
    try { r = await fetch('/api' + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' }); }
    catch { const e = new Error('Connexion impossible. Vérifiez votre réseau.'); e.status = 0; throw e; }
    let j = null; try { j = await r.json(); } catch { /* vide */ }
    if (!r.ok) {
      const e = new Error((j && j.message) || 'Une erreur est survenue.'); e.status = r.status; e.errors = j && j.errors;
      if (r.status === 401 && T.user && !url.startsWith('/auth')) { T.user = null; T.chrome(); }
      throw e;
    }
    return j;
  };
  T.get = (u) => T.api('GET', u); T.post = (u, b) => T.api('POST', u, b || {}); T.put = (u, b) => T.api('PUT', u, b || {}); T.del = (u) => T.api('DELETE', u);
  T.run = async (fn, okMsg) => { try { const r = await fn(); if (okMsg) T.toast(okMsg); return r; } catch (e) { T.toast(e.message); return undefined; } };

  /* ---- routeur ---- */
  T.route = (re, fn, opt) => T.routes.push({ re, fn, opt: opt || {} });
  let seq = 0;
  T.go = (to, replace) => { if (to === location.pathname + location.search) return render(); history[replace ? 'replaceState' : 'pushState'](null, '', to); render(); };
  T.next = () => { const n = new URLSearchParams(location.search).get('next'); return n && n.startsWith('/') && !n.startsWith('//') ? n : '/'; };
  async function render() {
    const my = ++seq, view = $('#view');
    T.timers.forEach(clearInterval); T.timers = [];
    const path = location.pathname.replace(/\/+$/, '') || '/', q = new URLSearchParams(location.search);
    let hit = null, m;
    for (const r of T.routes) { if ((m = path.match(r.re))) { hit = r; break; } }
    if (!hit) { view.innerHTML = notFound(); done(); return; }
    if ((hit.opt.auth || hit.opt.admin) && !T.user) { return T.go('/connexion?next=' + encodeURIComponent(path + location.search), true); }
    if (hit.opt.admin && T.user.role !== 'admin') { view.innerHTML = notFound(); done(); return; }
    view.innerHTML = '<div class="wrap sp" aria-busy="true" aria-live="polite"><div class="sk sk-t"></div><div class="sk sk-s"></div><ul class="pgrid" style="margin-top:28px">' + '<li><div class="sk sk-card"></div></li>'.repeat(8) + '</ul></div>';
    document.title = 'Thrifty · Seconde main. Premier choix.';
    try {
      const out = await hit.fn(m.slice(1).map((x) => (x == null ? undefined : decodeURIComponent(x))), q);
      if (my !== seq) return;
      const [html, after] = Array.isArray(out) ? out : [out];
      view.innerHTML = `<div class="page">${html}</div>`;
      if (after) after(view);
    } catch (e) {
      if (my !== seq) return;
      view.innerHTML = e.status === 404 ? notFound(e.message) : `<div class="wrap sp"><div class="empty"><h3>Oups</h3><p class="muted">${esc(e.message)}</p><button class="btn btn-fill" data-act="reload">Réessayer</button></div></div>`;
    }
    done();
    function done() { if (my !== seq) return; window.scrollTo(0, 0); T.chrome(true); reveal(); view.focus({ preventScroll: true }); }
  }
  T.render = render; T.reveal = () => reveal();
  function notFound(m) { return `<div class="wrap sp"><div class="empty"><h3>Page introuvable</h3><p class="muted">${esc(m || "Cette page n'existe pas ou n'est plus disponible.")}</p><a class="btn btn-fill" href="/">Retour à l'accueil</a></div></div>`; }
  T.title = (t) => { document.title = t + ' · Thrifty'; };

  function reveal() {
    $$('.pgrid>li:not(.rv)').forEach((li, i) => { li.classList.add('rv'); li.style.setProperty('--d', ((i % 6) * 0.06) + 's'); });
    const els = $$('.rv:not(.in),.imgrev:not(.in)');
    if (!('IntersectionObserver' in window)) return els.forEach((e) => e.classList.add('in'));
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    els.forEach((e) => io.observe(e));
  }

  /* ---- délégation d'événements ---- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (a && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !a.target && !a.hasAttribute('download') && !a.dataset.native) {
      const u = new URL(a.href, location.href);
      if (u.origin === location.origin && !u.pathname.startsWith('/api/') && !u.pathname.startsWith('/uploads/') && !/\.\w+$/.test(u.pathname)) { e.preventDefault(); closePops(); T.go(u.pathname + u.search + u.hash); return; }
    }
    const el = e.target.closest('[data-act]');
    if (el && T.acts[el.dataset.act]) { e.preventDefault(); Promise.resolve(T.acts[el.dataset.act](el, e)).catch((er) => T.toast(er.message)); return; }
    if (!e.target.closest('.pop-wrap')) closePops();
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-form]');
    if (f && T.forms[f.dataset.form]) { e.preventDefault(); const btn = $('button[type=submit]', f); if (btn && btn.disabled) return; if (btn) btn.disabled = true; Promise.resolve(T.forms[f.dataset.form](f, e)).catch((er) => T.toast(er.message)).finally(() => { if (btn) btn.disabled = false; }); }
  });
  window.addEventListener('popstate', render);
  T.acts.reload = () => render();
  const closePops = () => $$('.pop').forEach((p) => p.remove());
  T.formData = (f) => { const o = {}; new FormData(f).forEach((v, k) => (o[k] = v)); $$('input[type=checkbox]', f).forEach((c) => (o[c.name] = c.checked)); return o; };
  T.fieldErr = (f, msg) => { let e = $('.form-err', f); if (!e) { e = document.createElement('p'); e.className = 'alert bad form-err'; e.setAttribute('role', 'alert'); f.appendChild(e); } e.textContent = msg || ''; e.hidden = !msg; if (msg) e.scrollIntoView({ block: 'nearest' }); };

  /* ---- composants ---- */
  T.cardHtml = (it, i) => {
    const fav = T.favs.has(it.id), promo = it.oldPrice ? Math.round((1 - it.price / it.oldPrice) * 100) : 0;
    return `<li style="--i:${i || 0}"><article class="card"><a class="img" href="/article/${it.id}" aria-label="${esc(it.title)}">${it.photos[0] ? `<img loading="lazy" src="${esc(it.photos[0])}" alt="${esc(it.title)}" style="width:100%;height:100%;object-fit:cover;display:block">` : '<div class="art"></div>'}${it.status === 'sold' ? '<div class="sold-ov">Vendu</div>' : ''}</a>
      ${it.status === 'published' ? `<button class="heart" data-act="fav" data-id="${it.id}" aria-pressed="${fav}" aria-label="Ajouter aux favoris">${T.ico('heart', 20)}</button>` : ''}
      ${promo >= 5 ? `<span class="tag-l c">−${promo} %</span>` : ''}
      <a class="meta" href="/article/${it.id}"><span class="t">${esc(it.title)}</span><span class="s">${esc(it.brand)} · ${esc(it.size)}</span><span class="pr"><b>${dh(it.price)}</b>${it.oldPrice ? `<s>${dh(it.oldPrice)}</s>` : ''}</span></a></article></li>`;
  };
  T.grid = (items) => `<ul class="pgrid">${items.map((it, i) => T.cardHtml(it, i)).join('')}</ul>`;
  T.emptyBox = (title, text, btn) => `<div class="empty"><h3>${esc(title)}</h3><p class="muted">${esc(text || '')}</p>${btn || ''}</div>`;
  T.stars = (n) => `<span class="stars" aria-label="${n} sur 5">${'★'.repeat(Math.round(n))}${'☆'.repeat(5 - Math.round(n))}</span>`;
  T.pill = (st) => `<span class="pill ${{ confirmed: 'ok', issue: 'bad', refunded: 'bad', cancelled: '', to_ship: 'warn', shipping: 'blue', delivered: 'blue' }[st] || ''}">${esc(SH.ORDER_LBL[st] || st)}</span>`;
  T.payPill = (p) => `<span class="pill ${{ paid: 'ok', due: 'warn', suspended: 'bad' }[p] || ''}">${esc(SH.PAY_LBL[p] || p)}</span>`;
  T.opts = (arr, sel, ph) => (ph ? `<option value="">${esc(ph)}</option>` : '') + arr.map((o) => `<option${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join('');

  /* ---- favoris ---- */
  T.acts.fav = async (el) => {
    if (!T.user) return T.go('/connexion?next=' + encodeURIComponent(location.pathname));
    const id = Number(el.dataset.id), on = el.getAttribute('aria-pressed') !== 'true';
    el.setAttribute('aria-pressed', on); on ? T.favs.add(id) : T.favs.delete(id);
    try { await (on ? T.put('/favs/' + id) : T.del('/favs/' + id)); } catch (e) { el.setAttribute('aria-pressed', !on); on ? T.favs.delete(id) : T.favs.add(id); T.toast(e.message); }
  };

  /* ---- en-tête, menu, pied de page ---- */
  const initial = () => esc((T.user.name || '?').trim()[0].toUpperCase());
  T.chrome = (full) => {
    const u = T.user, p = location.pathname;
    const cur = (h) => (p === h || p.startsWith(h + '/') ? ' aria-current="page"' : '');
    const hd = $('#hd');
    if (!hd.firstChild) {
      hd.innerHTML = `<div class="wrap hd-in"><a class="brand" href="/" aria-label="Thrifty, accueil"><img src="/assets/logo.png" alt="Thrifty" height="30"></a>
        <form class="search" role="search" data-form="search">${T.ico('search', 18)}<input name="q" type="search" placeholder="Rechercher une marque, une pièce…" aria-label="Rechercher" autocomplete="off"><button type="submit">Chercher</button></form><div class="hd-act" id="hact"></div></div>
        <nav class="subnav" aria-label="Catégories"><div class="wrap subnav-in" id="subnav"></div></nav>`;
    }
    $('#hact').innerHTML = u ? `
      <a class="btn btn-fill btn-sm hide-m" href="/vendre">${esc(T.DJ.sell)}</a>
      <a class="ib hide-m" href="/favoris" aria-label="Favoris">${T.ico('heart')}</a>
      <a class="ib hide-m" href="/messages" aria-label="Messages">${T.ico('msg')}${T.badges.messages ? `<span class="badge">${T.badges.messages}</span>` : ''}</a>
      <div class="pop-wrap"><button class="ib" data-act="notifs" aria-label="Notifications">${T.ico('bell')}${T.badges.notifs ? `<span class="badge">${T.badges.notifs}</span>` : ''}</button></div>
      <div class="pop-wrap"><button class="avatar" data-act="menu" aria-label="Mon compte" aria-haspopup="true">${initial()}</button></div>`
      : `<a class="btn btn-line btn-sm" href="/connexion">${esc(T.DJ.login)}</a><a class="btn btn-fill btn-sm hide-m" href="/inscription">${esc(T.DJ.signup)}</a>`;
    $('#subnav').innerHTML = [['/femmes', 'Femmes'], ['/hommes', 'Hommes'], ['/enfants', 'Enfants'], ['/catalogue', 'Tout voir'], ['/promos', 'Promos']].map(([h, l]) => `<a href="${h}"${cur(h)}${h === '/promos' ? ' class="promo-l"' : ''}>${l}</a>`).join('');
    $('#bottom').innerHTML = `<a href="/"${p === '/' ? ' aria-current="page"' : ''}>${T.ico('home')}Accueil</a><a href="/catalogue"${cur('/catalogue')}>${T.ico('search')}Explorer</a>
      <a class="sellb" href="/vendre"><span class="circ">${T.ico('plus')}</span>${esc(T.DJ.sellFr)}</a>
      <a href="/messages"${cur('/messages')}>${T.ico('msg')}Messages${T.badges.messages ? `<span class="badge">${T.badges.messages}</span>` : ''}</a>
      <a href="${u ? '/compte' : '/connexion'}"${cur(u ? '/compte' : '/connexion')}>${T.ico('user')}${u ? 'Compte' : esc(T.DJ.login)}</a>`;
    if (full || !$('#ft').firstChild) {
      const c = T.cfg.company;
      $('#ft').innerHTML = `<div class="foot"><div class="wrap"><div class="foot-in"><div><img class="big" src="/assets/logo-white.png" alt="Thrifty" width="420"><p class="tag">Les belles pièces circulent.</p></div>
        <div class="fcols"><ul><li><a href="/femmes">Femmes</a></li><li><a href="/hommes">Hommes</a></li><li><a href="/enfants">Enfants</a></li><li><a href="/promos">Promos</a></li></ul>
        <ul><li><a href="/vendre">Vendre</a></li><li><a href="/aide">${esc(T.DJ.help)}</a></li><li><a href="/cgu">Conditions</a></li><li><a href="/confidentialite">Confidentialité</a></li><li><a href="/mentions-legales">Mentions légales</a></li></ul></div></div>
        <p class="legal">© ${new Date().getFullYear()} Thrifty${c.name ? ' · ' + esc(c.name) : ''}. Seconde main. Premier choix.</p></div></div>`;
    }
  };
  T.acts.menu = (el) => {
    const w = el.parentElement, had = $('.pop', w); closePops(); if (had) return;
    const adm = T.user.role === 'admin';
    w.insertAdjacentHTML('beforeend', `<div class="pop" role="menu"><h4>${esc(T.DJ.hi)} ${esc(T.user.name)}</h4>
      <a href="/dressing">Mon dressing</a><a href="/ventes">Mes ventes</a><a href="/versements">Mes versements</a><a href="/achats">Mes achats</a><a href="/favoris">Favoris</a><a href="/messages">Messages</a>${adm ? '<hr><a href="/admin">Administration</a>' : ''}<hr><a href="/compte">Mon compte</a><a href="/aide">${esc(T.DJ.help)}</a><button class="mi" data-act="logout">Se déconnecter</button></div>`);
  };
  T.acts.logout = async () => { await T.run(() => T.post('/auth/logout')); T.user = null; T.favs = new Set(); T.badges = { notifs: 0, messages: 0 }; T.toast(T.DJ.bye + ' !'); T.go('/'); };
  T.acts.notifs = async (el) => {
    const w = el.parentElement, had = $('.pop', w); closePops(); if (had) return;
    const { notifs } = await T.get('/notifs');
    w.insertAdjacentHTML('beforeend', `<div class="pop"><h4>Notifications</h4>${notifs.length ? notifs.map((n) => `<a class="nt${n.read ? '' : ' unread'}" href="${esc(n.link || '/')}">${n.read ? '' : '<span class="dot"></span>'}<span>${esc(n.text)}<small>${ago(n.ts)}</small></span></a>`).join('') : `<p class="muted" style="padding:12px">${esc(T.DJ.empty)}.</p>`}</div>`);
    if (T.badges.notifs) { await T.post('/notifs/read'); T.badges.notifs = 0; T.chrome(); }
  };
  T.forms.search = (f) => { const q = new FormData(f).get('q').trim(); T.go('/catalogue' + (q ? '?q=' + encodeURIComponent(q) : '')); };
  T.pollBadges = async () => { if (!T.user || document.hidden) return; try { const b = await T.get('/badges'); if (b.notifs !== T.badges.notifs || b.messages !== T.badges.messages) { T.badges = b; T.chrome(); } } catch { /* silencieux */ } };
})();
