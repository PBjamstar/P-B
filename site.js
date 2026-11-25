/* Phantom Bloodline — home page extras: counting numbers, section highlight in the nav, back-to-top.
   Everything here is optional polish: if it fails, the page works exactly as before. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1. Numbers count up the first time they scroll into view
  function animate(el) {
    var node = null;
    el.childNodes.forEach(function (n) { if (!node && n.nodeType === 3 && /^\s*\d[\d,]*\s*$/.test(n.nodeValue)) node = n; });
    if (!node) return;
    var raw = node.nodeValue.trim(), target = parseInt(raw.replace(/,/g, ''), 10);
    if (!(target > 0) || (target >= 1900 && target <= 2100) || reduce) return; // skip years
    var comma = raw.indexOf(',') > -1, t0 = null, dur = 1100;
    (function tick(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1), v = Math.round(target * (1 - Math.pow(1 - p, 3)));
      node.nodeValue = comma ? v.toLocaleString('en-GB') : String(v);
      if (p < 1) requestAnimationFrame(tick); else node.nodeValue = raw;
    })(performance.now());
  }
  try {
    var seen = new WeakSet();
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && !seen.has(e.target)) { seen.add(e.target); animate(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.6 });
    document.querySelectorAll('.stat-number, .stats-bar-num, .join-stat-num, .big-num').forEach(function (el) { io.observe(el); });
  } catch (e) {}

  // 2. Nav highlights the section you are reading
  try {
    var links = {};
    document.querySelectorAll('.nav-links a[href^="#"]').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var ids = Object.keys(links).filter(function (id) { return document.getElementById(id); });
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        Object.keys(links).forEach(function (k) { links[k].classList.remove('active'); links[k].removeAttribute('aria-current'); });
        var a = links[e.target.id]; if (a) { a.classList.add('active'); a.setAttribute('aria-current', 'true'); }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ids.forEach(function (id) { spy.observe(document.getElementById(id)); });
  } catch (e) {}

  // 3. Back-to-top
  try {
    var btn = document.createElement('button');
    btn.className = 'to-top'; btn.type = 'button'; btn.setAttribute('aria-label', 'Back to top'); btn.textContent = '↑';
    btn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });
    document.body.appendChild(btn);
    var ticking = false;
    addEventListener('scroll', function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () { btn.classList.toggle('show', window.scrollY > 900); ticking = false; });
    }, { passive: true });
  } catch (e) {}
})();
