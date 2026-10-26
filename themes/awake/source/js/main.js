/* ============================================================
   AwaKeSpace · 交互
   导航 / 菜单 / 搜索 / 滚动入场 / 阅读进度 / 灯箱 / 时钟
   ============================================================ */
(function () {
  'use strict';

  var doc = document;
  var body = doc.body;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;

  function $(sel, ctx) {
    return (ctx || doc).querySelector(sel);
  }

  function $$(sel, ctx) {
    return Array.from((ctx || doc).querySelectorAll(sel));
  }

  /* ---------- 导航 ---------- */
  var nav = $('[data-nav]');
  var menuEl = $('[data-menu]');
  var menuOpen = false;
  var lastY = window.scrollY;
  var ticking = false;

  function updateNav(y) {
    if (!nav) return;
    if (y > 24) nav.classList.add('is-scrolled');
    else nav.classList.remove('is-scrolled');

    if (!menuOpen) {
      if (y > lastY + 8 && y > 260) nav.classList.add('is-hidden');
      else if (y < lastY - 8) nav.classList.remove('is-hidden');
    }
    lastY = y;
  }

  /* ---------- 阅读进度 ---------- */
  var progressBar = $('.read-progress__bar');
  var articleEl = $('.post-content');
  var toTop = $('.to-top');

  function updateProgress(y) {
    if (progressBar && articleEl) {
      var rect = articleEl.getBoundingClientRect();
      var total = rect.height - window.innerHeight + 200;
      var passed = Math.min(Math.max(-rect.top + 120, 0), Math.max(total, 1));
      var ratio = Math.min(1, Math.max(0, passed / Math.max(total, 1)));
      progressBar.style.transform = 'scaleX(' + ratio + ')';
    }
    if (toTop) {
      if (y > 700) toTop.classList.add('is-visible');
      else toTop.classList.remove('is-visible');
    }
  }

  /* ---------- 目录高亮 ---------- */
  var tocLinks = $$('.post-toc .toc a');
  var headings = $$('.post-content h2[id], .post-content h3[id]');

  function normalizeHash(href) {
    if (!href) return '';
    try {
      return decodeURIComponent(href);
    } catch (err) {
      return href;
    }
  }

  function updateToc() {
    if (!tocLinks.length || !headings.length) return;
    var current = headings[0];
    headings.forEach(function (heading) {
      if (heading.getBoundingClientRect().top < 160) current = heading;
    });
    tocLinks.forEach(function (link) {
      var href = normalizeHash(link.getAttribute('href') || '');
      var isActive = href === '#' + current.id;
      link.classList.toggle('is-active', isActive);
    });
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      var y = window.scrollY;
      updateNav(y);
      updateProgress(y);
      updateToc();
      parallaxHero(y);
      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Hero 视差 ---------- */
  var hero = $('.hero');
  var heroInner = $('.hero__inner');

  function parallaxHero(y) {
    if (!heroInner || reduceMotion) return;
    if (y > window.innerHeight * 1.1) return;
    heroInner.style.transform = 'translate3d(0,' + (y * 0.06).toFixed(2) + 'px,0)';
    heroInner.style.opacity = String(Math.max(0, 1 - y / (window.innerHeight * 0.85)));
  }

  /* ---------- 入场动画 ---------- */
  var revealItems = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-inview');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    revealItems.forEach(function (item) {
      io.observe(item);
    });
  } else {
    revealItems.forEach(function (item) {
      item.classList.add('is-inview');
    });
  }

  /* ---------- 时钟 / 年份 ---------- */
  function updateClock() {
    var now = new Date();
    var hh = String(now.getHours()).padStart(2, '0');
    var mm = String(now.getMinutes()).padStart(2, '0');
    $$('[data-clock]').forEach(function (el) {
      el.textContent = hh + ':' + mm;
    });
    $$('[data-year]').forEach(function (el) {
      el.textContent = String(now.getFullYear());
    });
  }

  updateClock();
  window.setInterval(updateClock, 30000);

  /* ---------- 移动端菜单 ---------- */
  var menuToggle = $('[data-menu-open]');

  function openMenu() {
    if (!menuEl) return;
    menuOpen = true;
    menuEl.classList.add('is-open');
    menuEl.setAttribute('aria-hidden', 'false');
    body.classList.add('menu-open');
    body.style.overflow = 'hidden';
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'true');
    var first = menuEl.querySelector('[data-menu-close]');
    if (first) window.setTimeout(function () { first.focus(); }, 400);
  }

  function closeMenu() {
    if (!menuEl) return;
    menuOpen = false;
    menuEl.classList.remove('is-open');
    menuEl.setAttribute('aria-hidden', 'true');
    body.classList.remove('menu-open');
    body.style.overflow = '';
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
  }

  if (menuToggle) {
    menuToggle.addEventListener('click', function () {
      if (menuOpen) closeMenu();
      else openMenu();
    });
  }

  $$('[data-menu-close]').forEach(function (el) {
    el.addEventListener('click', closeMenu);
  });

  /* ---------- 搜索 ---------- */
  var searchEl = $('[data-search]');
  var searchInput = $('[data-search-input]');
  var searchResults = $('[data-search-results]');
  var searchTrigger = $('[data-search-open]');
  var searchIndex = null;
  var searchLoadFailed = false;
  var searchLoading = false;
  var searchActive = -1;
  var searchItems = [];

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function highlight(text, query) {
    var safe = escapeHtml(text);
    if (!query) return safe;
    var escaped = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      return safe.replace(new RegExp('(' + escaped + ')', 'gi'), '<mark>$1</mark>');
    } catch (err) {
      return safe;
    }
  }

  function absoluteUrl(path) {
    if (!path) return '/';
    if (/^https?:/.test(path)) return path;
    return path.charAt(0) === '/' ? path : '/' + path;
  }

  function renderSearch(query) {
    if (!searchResults) return;
    var q = (query || '').trim().toLowerCase();
    var items = searchIndex || [];
    var filtered = !q
      ? items.slice(0, 6)
      : items.filter(function (item) {
          var haystack = [item.title, item.excerpt, (item.tags || []).join(' '), (item.categories || []).join(' ')].join(' ').toLowerCase();
          return haystack.indexOf(q) !== -1;
        }).slice(0, 8);

    searchItems = filtered;
    searchActive = filtered.length ? 0 : -1;

    if (!filtered.length) {
      var emptyText;
      if (searchIndex === null) emptyText = '正在加载搜索索引…';
      else if (searchLoadFailed) emptyText = '搜索索引加载失败。';
      else if (!items.length) emptyText = '目前还没有文章。';
      else emptyText = '没有找到相关内容。';
      searchResults.innerHTML = '<p class="search__empty">' + emptyText + '</p>';
      return;
    }

    var html = '';
    html += filtered.map(function (item, i) {
      return (
        '<a class="search-result' + (i === 0 ? ' is-active' : '') + '" href="' + escapeHtml(absoluteUrl(item.url)) + '" data-search-result data-i="' + i + '">' +
          '<span class="search-result__top"><span>' + escapeHtml(item.date || '') + '</span><span>' + escapeHtml((item.tags || []).join(' · ')) + '</span></span>' +
          '<span class="search-result__title">' + highlight(item.title || '', query) + '</span>' +
          '<span class="search-result__excerpt">' + highlight(item.excerpt || '', query) + '</span>' +
        '</a>'
      );
    }).join('');

    searchResults.innerHTML = html;
  }

  function loadSearchIndex() {
    if (searchIndex || searchLoading) return;
    searchLoading = true;
    fetch('/search.json')
      .then(function (res) {
        if (!res.ok) throw new Error('search index unavailable');
        return res.json();
      })
      .then(function (data) {
        searchLoadFailed = false;
        searchIndex = Array.isArray(data) ? data : [];
        if (searchEl && !searchEl.hidden) renderSearch(searchInput ? searchInput.value : '');
      })
      .catch(function () {
        searchLoadFailed = true;
        searchIndex = [];
        if (searchEl && !searchEl.hidden) renderSearch(searchInput ? searchInput.value : '');
      })
      .finally(function () { searchLoading = false; });
  }

  function openSearch() {
    if (!searchEl) return;
    closeMenu();
    loadSearchIndex();
    searchEl.hidden = false;
    body.style.overflow = 'hidden';
    window.requestAnimationFrame(function () {
      searchEl.classList.add('is-open');
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      renderSearch('');
    });
  }

  function closeSearch() {
    if (!searchEl) return;
    searchEl.classList.remove('is-open');
    body.style.overflow = '';
    window.setTimeout(function () {
      if (!searchEl.classList.contains('is-open')) searchEl.hidden = true;
    }, 300);
  }

  if (searchTrigger) searchTrigger.addEventListener('click', openSearch);
  $$('[data-search-close]').forEach(function (el) {
    el.addEventListener('click', closeSearch);
  });

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      renderSearch(searchInput.value);
    });
    searchInput.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!searchItems.length) return;
        searchActive += event.key === 'ArrowDown' ? 1 : -1;
        if (searchActive < 0) searchActive = searchItems.length - 1;
        if (searchActive >= searchItems.length) searchActive = 0;
        $$('[data-search-result]').forEach(function (el, i) {
          el.classList.toggle('is-active', i === searchActive);
        });
        var activeEl = $('[data-search-result].is-active');
        if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (!searchItems.length) return;
        window.location.href = absoluteUrl(searchItems[searchActive >= 0 ? searchActive : 0].url);
      }
    });
  }

  doc.addEventListener('keydown', function (event) {
    var isTyping = /^(INPUT|TEXTAREA|SELECT)$/.test((event.target && event.target.tagName) || '');
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (searchEl && !searchEl.hidden) closeSearch();
      else openSearch();
      return;
    }
    if (event.key === 'Escape') {
      if (searchEl && !searchEl.hidden) closeSearch();
      if (menuOpen) closeMenu();
      return;
    }
    if (event.key === '/' && !isTyping && !menuOpen) {
      event.preventDefault();
      openSearch();
    }
  });

  /* ---------- 回到顶部 ---------- */
  $$('[data-to-top]').forEach(function (el) {
    el.addEventListener('click', function (event) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  /* ---------- 光标微光 ---------- */
  var glow = $('[data-cursor-glow]');
  if (glow && finePointer && !reduceMotion) {
    var gx = window.innerWidth / 2;
    var gy = window.innerHeight / 2;
    var tx = gx;
    var ty = gy;
    var glowVisible = false;

    window.addEventListener('pointermove', function (event) {
      tx = event.clientX;
      ty = event.clientY;
      if (!glowVisible) {
        glowVisible = true;
        glow.style.opacity = '1';
      }
    }, { passive: true });

    doc.addEventListener('pointerleave', function () {
      glowVisible = false;
      glow.style.opacity = '0';
    });

    (function glowLoop() {
      gx += (tx - gx) * 0.08;
      gy += (ty - gy) * 0.08;
      glow.style.transform = 'translate3d(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px,0)';
      window.requestAnimationFrame(glowLoop);
    })();
  }

  /* ---------- 照片灯箱 ---------- */
  var lightbox = $('[data-lightbox]');
  var lightboxImg = $('[data-lightbox-img]');
  var lightboxCap = $('[data-lightbox-cap]');
  var wallItems = $$('[data-photo]');
  var lightboxIndex = 0;

  function openLightbox(index) {
    if (!lightbox || !wallItems.length) return;
    lightboxIndex = (index + wallItems.length) % wallItems.length;
    var item = wallItems[lightboxIndex];
    if (!item) return;
    if (lightboxImg) {
      lightboxImg.src = item.getAttribute('data-photo') || '';
      lightboxImg.alt = item.getAttribute('data-title') || '';
    }
    if (lightboxCap) lightboxCap.textContent = item.getAttribute('data-caption') || '';
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
    body.style.overflow = 'hidden';
    var closeBtn = $('[data-lightbox-close]');
    if (closeBtn) closeBtn.focus();
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    body.style.overflow = '';
  }

  wallItems.forEach(function (item, index) {
    item.addEventListener('click', function () {
      openLightbox(index);
    });
  });

  $$('[data-lightbox-close]').forEach(function (el) {
    el.addEventListener('click', closeLightbox);
  });

  var lightboxPrev = $('[data-lightbox-prev]');
  var lightboxNext = $('[data-lightbox-next]');
  if (lightboxPrev) lightboxPrev.addEventListener('click', function () { openLightbox(lightboxIndex - 1); });
  if (lightboxNext) lightboxNext.addEventListener('click', function () { openLightbox(lightboxIndex + 1); });

  if (lightbox) {
    lightbox.addEventListener('click', function (event) {
      if (event.target === lightbox) closeLightbox();
    });
  }

  doc.addEventListener('keydown', function (event) {
    if (!lightbox || !lightbox.classList.contains('is-open')) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') openLightbox(lightboxIndex - 1);
    if (event.key === 'ArrowRight') openLightbox(lightboxIndex + 1);
  });

  /* ---------- 图片加载失败时兜底 ---------- */
  $$('img').forEach(function (img) {
    img.addEventListener('error', function () {
      img.style.opacity = '0';
      var parent = img.parentElement;
      if (parent) parent.classList.add('has-no-image');
    }, { once: true });
  });

  /* ---------- 首屏加载后标记 ---------- */
  window.addEventListener('load', function () {
    window.setTimeout(function () {
      body.classList.add('is-loaded');
    }, 80);
  });
})();
