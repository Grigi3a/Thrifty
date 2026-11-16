(function () {
  'use strict';
  const T = window.T;
  (async () => {
    try { Object.assign(T.cfg, await T.get('/config')); } catch { /* valeurs par défaut */ }
    try { T.user = (await T.get('/me')).user; } catch { T.user = null; }
    if (T.user) { await T.loadFavs(); try { T.badges = await T.get('/badges'); } catch { /* ignore */ } }
    T.chrome(true);
    await T.render();
    setInterval(T.pollBadges, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) T.pollBadges(); });
  })();

  /* ---- Appli installable : service worker + proposition d'installation (Android / Chrome) ---- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
  const KEY = 'thrifty-install-dismissed';
  const dismissed = () => { try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < 30 * 864e5; } catch { return false; } };
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    if (dismissed() || document.querySelector('.install-bar')) return;
    const bar = document.createElement('div'); bar.className = 'install-bar'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', 'Installer Thrifty');
    bar.innerHTML = '<img src="/assets/icon.png" alt=""><span class="grow"><b>L\'appli Thrifty</b><br><span class="small muted">Plein écran, plus rapide, sans store.</span></span><button class="btn btn-fill btn-sm" type="button" data-i="ok">Installer</button><button class="btn btn-line btn-sm" type="button" data-i="no" aria-label="Plus tard">✕</button>';
    document.body.appendChild(bar);
    bar.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.i === 'ok') { try { e.prompt(); await e.userChoice; } catch { /* ignoré */ } }
      else { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* stockage indisponible */ } }
      bar.remove();
    });
  });
})();
