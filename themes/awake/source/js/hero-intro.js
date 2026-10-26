/* ============================================================
   AwaKeSpace · 首屏入场
   Welcome → AwaKeSpace
   ============================================================ */
(function () {
  'use strict';

  var body = document.body;
  if (!body.classList.contains('is-intro')) return;

  var intro = document.querySelector('[data-hero-intro]');
  var mark = document.querySelector('.hero__mark');
  var finished = false;
  var timers = [];

  function finish() {
    if (finished) return;
    finished = true;
    timers.forEach(function (t) { window.clearTimeout(t); });
    body.classList.remove('is-intro', 'is-intro-swap');
    body.classList.add('is-intro-done');
    if (intro) intro.setAttribute('aria-hidden', 'true');
    if (mark) mark.style.opacity = '1';
  }

  function onKey(event) {
    if (event.key === 'Tab') return;
    finish();
  }

  function onPointer() {
    finish();
  }

  timers.push(window.setTimeout(function () {
    if (!finished) body.classList.add('is-intro-swap');
  }, 1350));

  timers.push(window.setTimeout(finish, 2550));

  window.addEventListener('pointerdown', onPointer, { passive: true });
  window.addEventListener('keydown', onKey);

  window.addEventListener('pagehide', function () {
    timers.forEach(function (t) { window.clearTimeout(t); });
  }, { passive: true });
})();
