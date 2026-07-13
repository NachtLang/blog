// Mobile nav toggle
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.site-nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', function () {
    var expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    nav.classList.toggle('open');
  });

  // Close menu when a nav link is clicked
  nav.addEventListener('click', function (e) {
    if (e.target.classList.contains('nav-link')) {
      toggle.setAttribute('aria-expanded', 'false');
      nav.classList.remove('open');
    }
  });
})();

(function () {
  // TOC scroll tracking
  var tocLinks = document.querySelectorAll('.toc a');
  if (!tocLinks.length) return;

  var headings = document.querySelectorAll(
    '.post-content h1[id], .post-content h2[id], .post-content h3[id], .post-content h4[id]'
  );
  if (!headings.length) return;

  function setActive(id) {
    tocLinks.forEach(function (link) {
      link.classList.remove('active');
      if (link.getAttribute('href') === '#' + id) {
        link.classList.add('active');
      }
    });
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          setActive(entry.target.getAttribute('id'));
        }
      });
    },
    {
      rootMargin: '-80px 0px -75% 0px',
    }
  );

  headings.forEach(function (heading) {
    observer.observe(heading);
  });
})();

// 随手拍 · 灯箱
(function () {
  var triggers = document.querySelectorAll('[data-photo-src]');
  if (!triggers.length) return;

  // 同一容器下的所有触发器构成一个相册组（首页条带 vs /photos 网格独立成组）
  var groups = new Map();
  triggers.forEach(function (el) {
    var group = el.closest('[data-snapshot-strip], [data-photos-grid]') || document.body;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(el);
  });

  // 主页条带是入口，点击直接跳转到 /photos，不开灯箱
  // /photos 页内才用灯箱
  var galleryGroup = null;
  groups.forEach(function (list, group) {
    if (group.hasAttribute && group.hasAttribute('data-photos-grid')) {
      galleryGroup = list;
    }
  });
  if (!galleryGroup) return;

  // 构建灯箱 DOM
  var lb = document.createElement('div');
  lb.className = 'snapshot-lightbox';
  lb.innerHTML =
    '<button class="snapshot-lightbox-close" aria-label="关闭">×</button>' +
    '<button class="snapshot-lightbox-nav prev" aria-label="上一张">‹</button>' +
    '<img class="snapshot-lightbox-img" alt="">' +
    '<button class="snapshot-lightbox-nav next" aria-label="下一张">›</button>' +
    '<div class="snapshot-lightbox-caption"></div>';
  document.body.appendChild(lb);

  var imgEl = lb.querySelector('.snapshot-lightbox-img');
  var capEl = lb.querySelector('.snapshot-lightbox-caption');
  var curIdx = 0;

  function render() {
    var el = galleryGroup[curIdx];
    imgEl.src = el.getAttribute('data-photo-src');
    imgEl.alt = el.getAttribute('data-photo-title') || '';
    var title = el.getAttribute('data-photo-title') || '';
    var date = el.getAttribute('data-photo-date') || '';
    var loc = el.getAttribute('data-photo-location') || '';
    var desc = el.getAttribute('data-photo-desc') || '';
    var meta = [date, loc].filter(Boolean).join(' · ');
    capEl.innerHTML =
      (title ? '<span class="ttl">' + title + '</span>' : '') +
      (meta ? meta : '') +
      (desc ? '<br>' + desc : '');
  }

  function open(i) {
    curIdx = i;
    render();
    lb.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    lb.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function step(d) {
    curIdx = (curIdx + d + galleryGroup.length) % galleryGroup.length;
    render();
  }

  galleryGroup.forEach(function (el, i) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      open(i);
    });
  });

  lb.querySelector('.snapshot-lightbox-close').addEventListener('click', close);
  lb.querySelector('.snapshot-lightbox-nav.prev').addEventListener('click', function (e) {
    e.stopPropagation();
    step(-1);
  });
  lb.querySelector('.snapshot-lightbox-nav.next').addEventListener('click', function (e) {
    e.stopPropagation();
    step(1);
  });
  lb.addEventListener('click', function (e) {
    if (e.target === lb || e.target === imgEl) close();
  });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });
})();
