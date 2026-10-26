/* ============================================================
   AwaKeSpace · 页面切换
   同站链接离开时先落下纸面，再进入新页
   ============================================================ */
(function () {
  'use strict';

  if (!window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.history || !window.history.pushState) return;

  var veil = document.querySelector('[data-page-veil]');
  if (!veil) return;

  var leaving = false;

  function isPlainClick(event) {
    return event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey;
  }

  function isSameDocument(url) {
    return url.pathname === window.location.pathname && url.search === window.location.search;
  }

  document.addEventListener('click', function (event) {
    if (leaving || event.defaultPrevented || !isPlainClick(event)) return;

    var link = event.target.closest('a[href]');
    if (!link) return;
    if (link.target && link.target !== '_self') return;
    if (link.hasAttribute('download')) return;

    var href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return;

    var url;
    try {
      url = new URL(link.href, window.location.href);
    } catch (err) {
      return;
    }

    if (url.origin !== window.location.origin) return;
    if (isSameDocument(url)) return;

    event.preventDefault();
    leaving = true;
    veil.classList.add('is-leaving');
    veil.setAttribute('aria-hidden', 'false');

    window.setTimeout(function () {
      window.location.href = url.href;
    }, 430);
  });

  window.addEventListener('pageshow', function () {
    leaving = false;
    veil.classList.remove('is-leaving');
    veil.setAttribute('aria-hidden', 'true');
  });
})();
