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
})();
