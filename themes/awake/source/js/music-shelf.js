/* ============================================================
   AwaKeSpace · 音乐展柜
   鼠标滚轮 → 带惯性的横向无极滑动
   指针在展柜内时，页面不产生纵向滚动
   ============================================================ */
(function () {
  'use strict';

  if (window.__awakeShelfCleanup) {
    try { window.__awakeShelfCleanup(); } catch (err) {}
  }
  var shelf = document.querySelector('[data-music-shelf]');
  if (!shelf) return;

  var rail = document.querySelector('[data-music-progress]');
  var position = shelf.scrollLeft;
  var velocity = 0;
  var running = false;
  var lastTime = 0;
  var shelfRaf = 0;

  function maxScroll() {
    return Math.max(0, shelf.scrollWidth - shelf.clientWidth);
  }

  function updateRail() {
    if (!rail) return;
    var max = maxScroll();
    if (max <= 0) {
      rail.style.width = '100%';
      rail.style.transform = 'translateX(0)';
      return;
    }
    var visible = shelf.clientWidth / shelf.scrollWidth;
    var width = Math.max(8, Math.round(visible * 100));
    var ratio = shelf.scrollLeft / max;
    rail.style.width = width + '%';
    rail.style.transform = 'translateX(' + (ratio * (100 - width)) + '%)';
  }

  function tick(now) {
    if (!running) return;

    // rAF 的时间戳可能略早于 start() 里记录的 performance.now()，
    // 首帧不能用负的 dt，否则 position 会被夹回 0，滚动直接停住。
    var elapsed = now - lastTime;
    var dt = elapsed > 0 && elapsed < 34 ? elapsed : 16.7;
    lastTime = now;
    var stepFactor = dt / 16.7;

    position += velocity * stepFactor;
    var max = maxScroll();

    if (position <= 0) {
      position = 0;
      velocity = 0;
    } else if (position >= max) {
      position = max;
      velocity = 0;
    }

    shelf.scrollLeft = position;
    updateRail();

    velocity *= Math.pow(0.94, stepFactor);

    if (Math.abs(velocity) < 0.06) {
      velocity = 0;
      running = false;
      return;
    }

    shelfRaf = requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = performance.now();
    shelfRaf = requestAnimationFrame(tick);
  }

  function wheelDelta(event) {
    var delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (event.deltaMode === 1) delta *= 16;
    else if (event.deltaMode === 2) delta *= shelf.clientWidth;
    return delta;
  }

  shelf.addEventListener('wheel', function (event) {
    var max = maxScroll();
    // 展柜没有溢出内容时，把滚轮交还给页面
    if (max <= 0) return;

    // 指针在展柜内时始终接管滚轮，到两端也不带动页面
    event.preventDefault();

    // 不直接改 scrollLeft，而是把滚轮变成速度；多个 wheel 事件会叠加惯性
    velocity += wheelDelta(event) * 0.055;
    velocity = Math.max(-70, Math.min(70, velocity));
    start();
  }, { passive: false });

  shelf.addEventListener('scroll', function () {
    // 触摸/原生滚动时同步位置，避免下一次动画从头开始
    if (!running) position = shelf.scrollLeft;
    updateRail();
  }, { passive: true });

  shelf.addEventListener('keydown', function (event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    var stepSize = shelf.clientWidth * 0.7;
    velocity += (event.key === 'ArrowRight' ? stepSize : -stepSize) * 0.08;
    velocity = Math.max(-70, Math.min(70, velocity));
    start();
  });

  updateRail();
  window.__awakeShelfCleanup = function () {
    running = false;
    if (shelfRaf) cancelAnimationFrame(shelfRaf);
  };
  window.addEventListener('resize', function () {
    position = Math.max(0, Math.min(maxScroll(), position));
    updateRail();
  }, { passive: true });
})();
