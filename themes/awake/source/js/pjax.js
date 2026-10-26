/* ============================================================
   AwaKeSpace — PJAX navigation
   Keeps the document shell (nav, global player, album dialog)
   alive and swaps only <main>. Static pages stay crawlable.
   ============================================================ */
(function () {
  'use strict';

  if (!window.history || !window.history.pushState) return;

  var main = document.querySelector('#main');
  var veil = document.querySelector('[data-page-veil]');
  if (!main) return;

  var pageCache = new Map();
  var active = false;
  var currentRequest = 0;

  function isPlainClick(event) {
    return event.button === 0 &&
      !event.metaKey && !event.ctrlKey &&
      !event.shiftKey && !event.altKey;
  }

  function isPjaxLink(link) {
    if (!link || !link.href) return false;
    if (link.target && link.target !== '_self') return false;
    if (link.hasAttribute('download')) return false;
    if (link.hasAttribute('data-no-pjax')) return false;

    var url;
    try { url = new URL(link.href, location.href); } catch (err) { return false; }
    if (url.origin !== location.origin) return false;
    if (url.pathname === location.pathname && url.search === location.search) return false;
    if (/\.(?:xml|json|txt|pdf|zip|png|jpe?g|webp|gif|svg|mp3|flac|ogg|webm|mp4)$/i.test(url.pathname)) return false;
    return true;
  }

  function pageVersion() {
    var script = Array.prototype.find.call(document.scripts, function (s) {
      return /\/js\/app\.js/.test(s.src || '');
    });
    if (!script) return '';
    try { return new URL(script.src).searchParams.get('v') || ''; } catch (err) { return ''; }
  }

  function fetchPage(url) {
    var key = url.origin + url.pathname + url.search;
    if (pageCache.has(key)) return Promise.resolve(pageCache.get(key));
    return fetch(url.href, {
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'pjax' }
    }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    }).then(function (html) {
      pageCache.set(key, html);
      return html;
    });
  }

  function loadPageScript(src) {
    var version = pageVersion();
    var el = document.createElement('script');
    el.src = src + (version ? '?v=' + encodeURIComponent(version) : '');
    el.async = false;
    document.body.appendChild(el);
  }

  function syncHead(doc) {
    document.title = doc.title;
    var selectors = [
      'meta[name="description"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[property="og:url"]',
      'meta[name="twitter:title"]',
      'meta[name="twitter:description"]'
    ];
    selectors.forEach(function (selector) {
      var next = doc.querySelector(selector);
      var current = document.querySelector(selector);
      if (next && current) current.setAttribute('content', next.getAttribute('content') || '');
    });
    var nextCanonical = doc.querySelector('link[rel="canonical"]');
    var currentCanonical = document.querySelector('link[rel="canonical"]');
    if (nextCanonical && currentCanonical) currentCanonical.setAttribute('href', nextCanonical.getAttribute('href') || '');
  }

  function closeTransientUI() {
    var search = document.querySelector('[data-search]');
    if (search) {
      search.hidden = true;
      search.classList.remove('is-open');
      search.setAttribute('aria-hidden', 'true');
    }
    var menu = document.querySelector('[data-menu]');
    if (menu) {
      menu.classList.remove('is-open');
      menu.setAttribute('aria-hidden', 'true');
    }
    var dialog = document.querySelector('[data-album-dialog]');
    if (dialog && dialog.classList.contains('is-open')) {
      var close = dialog.querySelector('[data-album-close]');
      if (close) close.click();
    }
    document.body.style.overflow = '';
  }

  function replaceContent(doc, url) {
    var nextMain = doc.querySelector('#main');
    if (!nextMain) return false;

    main.innerHTML = nextMain.innerHTML;
    document.body.className = (doc.body.className || '')
      .replace(/\b(is-intro|is-intro-swap|is-intro-done|is-pjax)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim() + ' has-js is-loaded is-pjax';
    syncHead(doc);

    var newNavLinks = doc.querySelector('.nav__links');
    var navLinks = document.querySelector('.nav__links');
    if (newNavLinks && navLinks) navLinks.innerHTML = newNavLinks.innerHTML;

    main.querySelectorAll('[data-reveal]').forEach(function (el) {
      el.classList.add('is-inview');
    });

    closeTransientUI();

    // Page-only modules are initialized after the swap. Global player,
    // album dialog, search and nav are intentionally left untouched.
    if (main.querySelector('[data-lake-stage]')) loadPageScript('/js/lake-hero.js');
    if (main.querySelector('[data-music-shelf]')) loadPageScript('/js/music-shelf.js');

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    if (url.hash) {
      var target = document.querySelector(url.hash);
      if (target) window.setTimeout(function () { target.scrollIntoView(); }, 80);
    }
    return true;
  }

  function finishTransition() {
    if (!veil) return;
    window.setTimeout(function () {
      veil.classList.remove('is-leaving');
      veil.setAttribute('aria-hidden', 'true');
    }, 60);
  }

  function navigateZato(url, replace) {
    if (active) return;
    active = true;
    closeTransientUI();
    if (veil) {
      veil.classList.add('is-leaving');
      veil.setAttribute('aria-hidden', 'false');
    }
    main.innerHTML = '<div class="pjax-zato-shell"><iframe class="pjax-zato" src="' + url.href + '" title="ZATO"></iframe><a class="pjax-zato-open" href="' + url.href + '" target="_blank" rel="noopener">直接打开 ZATO <span aria-hidden="true">↗</span></a></div>';
    document.body.className = 'page-zato has-js is-loaded is-pjax';
    document.title = 'ZATO · AwaKeSpace';
    document.querySelectorAll('.nav__link').forEach(function (link) {
      var target = new URL(link.href, location.href);
      link.classList.toggle('is-active', target.pathname.indexOf('/zato') === 0);
    });
    window.scrollTo(0, 0);
    if (replace) history.replaceState({ awake: true, zato: true }, '', url.href);
    else history.pushState({ awake: true, zato: true }, '', url.href);
    active = false;
    finishTransition();
  }

  function navigate(url, replace) {
    if (active) return;
    active = true;
    var requestId = ++currentRequest;
    if (veil) {
      veil.classList.add('is-leaving');
      veil.setAttribute('aria-hidden', 'false');
    }

    fetchPage(url).then(function (html) {
      if (requestId !== currentRequest) return;
      var doc = new DOMParser().parseFromString(html, 'text/html');
      if (!replaceContent(doc, url)) throw new Error('No #main in response');
      if (replace) history.replaceState({ awake: true }, '', url.href);
      else history.pushState({ awake: true }, '', url.href);
      active = false;
      finishTransition();
    }).catch(function () {
      active = false;
      window.location.href = url.href;
    });
  }

  document.addEventListener('click', function (event) {
    if (active || event.defaultPrevented || !isPlainClick(event)) return;
    var link = event.target.closest('a[href]');
    if (!isPjaxLink(link)) return;
    event.preventDefault();
    var target = new URL(link.href, location.href);
    if (target.pathname === '/zato/' || target.pathname === '/zato') {
      navigateZato(target, false);
    } else {
      navigate(target, false);
    }
  });

  document.addEventListener('mouseover', function (event) {
    var link = event.target.closest('a[href]');
    if (!isPjaxLink(link)) return;
    var url = new URL(link.href, location.href);
    var key = url.origin + url.pathname + url.search;
    if (!pageCache.has(key)) {
      fetchPage(url).catch(function () {});
    }
  }, { passive: true });

  window.addEventListener('popstate', function () {
    if (!history.state || !history.state.awake) return;
    if (history.state.zato) navigateZato(new URL(location.href), true);
    else navigate(new URL(location.href), true);
  });

  if (!history.state || !history.state.awake) {
    history.replaceState({ awake: true }, '', location.href);
  }
})();
