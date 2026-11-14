/* Thrifty — effets et interactions (aucune dépendance). Désactivés si « réduire les animations » est demandé. */
(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const prog = document.createElement('div'); prog.id = 'prog'; prog.setAttribute('aria-hidden', 'true'); document.body.appendChild(prog);
  const hd = document.getElementById('hd');
  let lastY = scrollY, tick = false;
  function onScroll() {
    if (tick) return; tick = true;
    requestAnimationFrame(() => {
      tick = false; const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
      prog.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
      if (hd && !reduce) hd.classList.toggle('hide', y > lastY + 4 && y > 240 && !document.querySelector('.pop,.modal-bg') && !document.activeElement.matches('input,textarea,select') ? true : y < lastY - 4 ? false : hd.classList.contains('hide'));
      lastY = y;
      if (!reduce) document.querySelectorAll('.photo img').forEach((im) => { const r = im.parentElement.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) im.style.transform = 'translateY(' + ((r.top + r.height / 2 - innerHeight / 2) * -0.07).toFixed(1) + 'px)'; });
    });
  }
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); setInterval(onScroll, 700);
  if (reduce) return;
  // cartes : inclinaison 3D + reflet
  if (fine) {
    let raf;
    document.addEventListener('pointermove', (e) => {
      const c = e.target.closest && e.target.closest('.card');
      if (c) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => { const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; c.style.setProperty('--ry', ((x - 0.5) * 8).toFixed(2) + 'deg'); c.style.setProperty('--rx', ((0.5 - y) * 8).toFixed(2) + 'deg'); c.style.setProperty('--gx', (x * 100) + '%'); c.style.setProperty('--gy', (y * 100) + '%'); });
      }
      // accueil : parallaxe des pastilles + légère rotation du sac
      const h = e.target.closest && e.target.closest('.hero');
      if (h) { const r = h.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; h.querySelectorAll('.chip').forEach((c2) => { const d = Number(c2.dataset.depth || 20); c2.style.setProperty('--mx', (x * d).toFixed(1) + 'px'); c2.style.setProperty('--my', (y * d).toFixed(1) + 'px'); }); const b = h.querySelector('.bagwrap'); if (b) b.style.setProperty('--rot', (x * 2.4).toFixed(2) + 'deg'); }
      // boutons magnétiques
      const m = e.target.closest && e.target.closest('.mag');
      if (m) { const r = m.getBoundingClientRect(); m.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1) + 'px,' + ((e.clientY - r.top - r.height / 2) * 0.28).toFixed(1) + 'px)'; }
    }, { passive: true });
    document.addEventListener('pointerout', (e) => {
      const c = e.target.closest && e.target.closest('.card'); if (c && !c.contains(e.relatedTarget)) { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); }
      const m = e.target.closest && e.target.closest('.mag'); if (m && !m.contains(e.relatedTarget)) m.style.transform = '';
    });
  }

  // projecteur lumineux qui suit la souris dans l'accueil
  if (fine) document.addEventListener('pointermove', (e) => { const h = e.target.closest && e.target.closest('.hero'); if (h) { const r = h.getBoundingClientRect(); h.style.setProperty('--hx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%'); h.style.setProperty('--hy', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%'); } }, { passive: true });
  // confettis (« Mabrouk ! »)
  window.T.confetti = () => { const cols = ['#3454F5', '#DCE7EF', '#242629', '#F5F3ED', '#8AA0FF']; for (let i = 0; i < 36; i++) { const d = document.createElement('i'); d.className = 'cf'; d.style.left = (10 + Math.random() * 80) + 'vw'; d.style.background = cols[i % cols.length]; d.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px'); d.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg'); d.style.animationDelay = (Math.random() * 0.25) + 's'; document.body.appendChild(d); setTimeout(() => d.remove(), 2400); } };
  // recherche de l'accueil : suggestions qui s'écrivent
  const sugg = ['une veste en jean…', 'une robe d\'été…', 'des baskets blanches…', 'un manteau camel…', 'Zara, Mango, Levi\'s…'];
  let si = 0, ci = 0, typing = null;
  function type() {
    const inp = document.querySelector('.herosearch input'); if (!inp || document.activeElement === inp || inp.value) { typing = setTimeout(type, 1500); return; }
    const w = sugg[si]; ci++; inp.placeholder = 'Chercher ' + w.slice(0, ci);
    if (ci >= w.length) { ci = 0; si = (si + 1) % sugg.length; typing = setTimeout(type, 1900); } else typing = setTimeout(type, 70);
  }
  type();
  // cœur : onde au clic
  document.addEventListener('click', (e) => { const h = e.target.closest && e.target.closest('.heart'); if (h) { h.classList.remove('burst'); void h.offsetWidth; h.classList.add('burst'); setTimeout(() => h.classList.remove('burst'), 700); } });
  // le menu réapparaît à chaque changement de page
  addEventListener('popstate', () => hd && hd.classList.remove('hide')); document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a[href]') && hd) hd.classList.remove('hide'); });
})();
