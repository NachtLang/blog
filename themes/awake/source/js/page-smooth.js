/* ============================================================
   AwaKeSpace · 页面纵向阻尼滚动
   滚轮累积目标位置；速度做低通，平滑靠近目标并精确停住
   ============================================================ */
(function () {
  'use strict';

  if (!window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('scrollBehavior' in document.documentElement.style)) return;

  var target = window.scrollY;
  var current = target;
  var velocity = 0;
  var running = false;
  var lastTime = 0;

  function pageMax() {
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  function clamp(value) {
    return Math.max(0, Math.min(pageMax(), value));
  }

  function jumpTo(value) {
    // 明确用 instant，避开 html { scroll-behavior: smooth } 的二次动画
    window.scrollTo({ top: value, left: 0, behavior: 'instant' });
  }

  function tick(now) {
    if (!running) return;

    var elapsed = now - lastTime;
    var dt = elapsed > 0 && elapsed < 34 ? elapsed : 16.7;
    lastTime = now;
    var stepFactor = dt / 16.7;

    var distance = target - current;
    var desiredSpeed = distance * 0.13;

    // 速度低通：wheel 的离散输入被抹成连续速度，同时不越过目标
    velocity += (desiredSpeed - velocity) * 0.34;
    velocity = Math.max(-75, Math.min(75, velocity));
    var next = current + velocity * stepFactor;
    // 不越过目标：到目标即停，避免惯性冲过头再弹回来
    if ((current < target && next > target) || (current > target && next < target)) {
      next = target;
      velocity = 0;
    }
    current = clamp(next);

    if (Math.abs(target - current) < 0.5 && Math.abs(velocity) < 0.4) {
      current = target;
      velocity = 0;
      jumpTo(current);
      running = false;
      return;
    }

    jumpTo(current);
    requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(tick);
  }

  function isInsideScrollable(el) {
    while (el && el !== document.body && el !== document.documentElement) {
      var style = window.getComputedStyle(el);
      var oy = style.overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return true;
      el = el.parentElement;
    }
    return false;
  }

  window.addEventListener('wheel', function (event) {
    // 音乐展柜、灯箱、菜单、搜索、表单控件内部的滚动不由页面接管
    if (event.defaultPrevented || event.ctrlKey) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (document.body.style.overflow === 'hidden') return;

    var el = event.target;
    if (el && el.nodeType === 1 && el.closest('[data-lightbox], .menu, .search, [data-no-smooth]')) return;
    if (el && el.nodeType === 1 && isInsideScrollable(el)) return;

    var delta = event.deltaY;
    if (event.deltaMode === 1) delta *= 16;
    else if (event.deltaMode === 2) delta *= window.innerHeight;

    event.preventDefault();
    if (!running) current = window.scrollY;
    target = clamp(target + delta);
    start();
  }, { passive: false });

  window.addEventListener('scroll', function () {
    if (!running) {
      current = window.scrollY;
      target = current;
      velocity = 0;
    }
  }, { passive: true });

  window.addEventListener('resize', function () {
    target = clamp(target);
    current = clamp(current);
  }, { passive: true });
})();
