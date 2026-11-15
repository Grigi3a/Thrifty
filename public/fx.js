/* Thrifty — effets discrets : révélation douce des sections au premier défilement. Rien de permanent, rien qui retarde le contenu. */
(function () {
  'use strict';
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { document.documentElement.classList.remove('js'); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  const scan = () => document.querySelectorAll('.rv:not(.in):not([data-ob])').forEach((el) => { el.dataset.ob = '1'; io.observe(el); });
  window.T.reveal = scan; new MutationObserver(scan).observe(document.getElementById('view'), { childList: true, subtree: true }); scan();
  // filet de sécurité : tout devient visible si l'observateur tarde
  setTimeout(() => document.querySelectorAll('.rv:not(.in)').forEach((el) => el.classList.add('in')), 2500);
})();
