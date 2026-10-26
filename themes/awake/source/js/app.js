/* hero-intro.js */
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

/* lake-hero.js */
/* ============================================================
   AwaKeSpace · 首屏水面
   真实水面循环影像 → 低分辨率明暗 → 半调网点
   ============================================================ */
(function () {
  'use strict';

  var stage = document.querySelector('[data-lake-stage]');
  var canvas = document.querySelector('[data-lake-canvas]');
  var image = document.querySelector('[data-lake-texture]');
  if (!stage || !canvas || !image) return;

  if (window.__awakeLakeCleanup) {
    try { window.__awakeLakeCleanup(); } catch (err) {}
  }
  var lakeController = window.AbortController ? new AbortController() : null;
  var lakeSignal = lakeController ? lakeController.signal : undefined;
  var lakeRaf = 0;
  var lakeObserver = null;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var gl = null;
  try {
    gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      powerPreference: 'high-performance'
    });
  } catch (err) { gl = null; }
  if (!gl) { stage.classList.add('is-fallback'); return; }

  var VS = [
    '#version 300 es',
    'in vec2 aPos; out vec2 vUv;',
    'void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var TONE_FS = [
    '#version 300 es',
    'precision highp float;',
    'uniform sampler2D uVideo;',
    'uniform vec2 uRes;',
    'uniform float uTime;',
    'uniform float uAspect;',
    'uniform vec4 uRipples[6];',
    'in vec2 vUv; out vec4 outTone;',
    'void main(){',
    '  vec2 uv = vUv;',
    '  vec2 texel = 1.0 / uRes;',
    '  vec2 warp = vec2(0.0);',
    '  for (int i = 0; i < 6; i++){',
    '    vec4 r = uRipples[i];',
    '    if (r.w <= 0.0) continue;',
    '    float age = uTime - r.z;',
    '    if (age < 0.0 || age > 4.5) continue;',
    '    vec2 d = vec2((uv.x - r.x) * uAspect, uv.y - r.y);',
    '    float dist = length(d) + 0.0001;',
    '    float phase = dist * 34.0 - age * 8.0;',
    '    float env = exp(-dist * 6.5) * exp(-age * 1.2);',
    '    warp += normalize(d) * (cos(phase) * env * r.w * 0.0105);',
    '  }',
    '  vec2 t = uv - 0.5;',
    '  float va = 16.0 / 9.0;',
    '  if (uAspect > va) t.y *= va / uAspect; else t.x *= uAspect / va;',
    '  vec2 baseUv = t + 0.5;',
    '  vec2 suv = clamp(baseUv + warp, vec2(0.001), vec2(0.999));',
    '  vec3 src = texture(uVideo, suv).rgb;',
    '  float lum = dot(src, vec3(0.299, 0.587, 0.114));',
    '  lum = pow(clamp(lum, 0.0, 1.0), 0.92);',
    '  lum = smoothstep(0.10, 0.82, lum);',
    '  float lx = dot(texture(uVideo, clamp(suv + vec2(texel.x, 0.0), 0.001, 0.999)).rgb, vec3(0.299, 0.587, 0.114));',
    '  float ly = dot(texture(uVideo, clamp(suv + vec2(0.0, texel.y), 0.001, 0.999)).rgb, vec3(0.299, 0.587, 0.114));',
    '  vec2 grad = vec2(lx - lum, ly - lum);',
    '  float glint = smoothstep(0.006, 0.035, length(grad));',
    '  float ridge = smoothstep(0.004, 0.030, length(grad));',
    '  float tone = clamp(0.05 + lum * 1.05 + glint * 0.18 - ridge * 0.08, 0.08, 0.96);',
    '  outTone = vec4(tone, glint, 0.0, 1.0);',
    '}'
  ].join('\n');

  var HALFTONE_FS = [
    '#version 300 es',
    'precision highp float;',
    'uniform sampler2D uTone;',
    'uniform vec2 uRes;',
    'uniform float uDpr;',
    'in vec2 vUv; out vec4 outColor;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }',
    'void main(){',
    '  vec2 uv = vUv;',
    '  vec4 s = texture(uTone, uv);',
    '  float tone = s.r;',
    '  float glint = s.g;',
    '  vec3 paper = vec3(0.992, 0.988, 0.902);',
    '  vec3 tealInk = vec3(0.176, 0.451, 0.439);',
    '  float cell = 4.6 * uDpr;',
    '  float ang = 0.42;',
    '  mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));',
    '  vec2 hp = rot * (uv * uRes) / cell;',
    '  vec2 hf = fract(hp) - 0.5;',
    '  float hd = length(hf);',
    '  float dark = pow(clamp(1.0 - tone, 0.0, 1.0), 1.15);',
    '  float radius = sqrt(clamp(dark, 0.0, 1.0)) * 0.72;',
    '  float aa = 1.0 / cell;',
    '  float dotMask = 1.0 - smoothstep(radius - aa, radius + aa, hd);',
    '  dotMask *= 0.88 + hash(floor(hp * 2.2)) * 0.15;',
    '  vec3 col = mix(paper, tealInk, clamp(dotMask, 0.0, 1.0) * 0.92);',
    '  vec2 hp2 = rot * (uv * uRes) / (cell * 0.64);',
    '  float d2 = length(fract(hp2) - 0.5);',
    '  float pinhole = 1.0 - smoothstep(0.06, 0.16, d2);',
    '  col = mix(col, paper, clamp(pinhole * glint * 0.55, 0.0, 1.0));',
    '  col += (hash(floor(uv * uRes * 0.7)) - 0.5) * 0.018;',
    '  vec2 c = uv - 0.5;',
    '  col *= mix(0.95, 1.0, smoothstep(0.95, 0.15, length(c * vec2(0.9, 1.08))));',
    '  outColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      if (window.console && console.warn) console.warn('[lake]', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }
  function build(fsSource) {
    var vs = compile(gl.VERTEX_SHADER, VS);
    var fs = compile(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    return program;
  }

  var toneProgram = build(TONE_FS);
  var halfProgram = build(HALFTONE_FS);
  if (!toneProgram || !halfProgram) { stage.classList.add('is-fallback'); return; }

  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  function bindQuad(program) {
    var loc = gl.getAttribLocation(program, 'aPos');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  var videoCanvas = document.createElement('canvas');
  videoCanvas.width = 2560;
  videoCanvas.height = 1440;
  var videoCtx = videoCanvas.getContext('2d');

  var videoTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, videoTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 70, 75, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  var toneW = 2560;
  var toneH = 1440;
  var toneTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, toneTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, toneW, toneH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  var framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, toneTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  var uni1 = {
    video: gl.getUniformLocation(toneProgram, 'uVideo'),
    res: gl.getUniformLocation(toneProgram, 'uRes'),
    time: gl.getUniformLocation(toneProgram, 'uTime'),
    aspect: gl.getUniformLocation(toneProgram, 'uAspect'),
    ripples: gl.getUniformLocation(toneProgram, 'uRipples')
  };
  var uni2 = {
    tone: gl.getUniformLocation(halfProgram, 'uTone'),
    res: gl.getUniformLocation(halfProgram, 'uRes'),
    dpr: gl.getUniformLocation(halfProgram, 'uDpr')
  };

  var state = {
    time: 0,
    ripples: [],
    lastMove: 0,
    draw: 0,
    visible: true,
    started: false,
    ready: false
  };

  function addRipple(x, y, amp) {
    state.ripples.unshift({ x: x, y: y, t: state.time, a: amp });
    if (state.ripples.length > 6) state.ripples.length = 6;
  }

  function mapPointer(event) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height))
    };
  }

  window.addEventListener('pointermove', function (event) {
    if (reduceMotion) return;
    var p = mapPointer(event);
    if (!p) return;
    var now = performance.now();
    if (now - state.lastMove > 70) {
      addRipple(p.x, p.y, 0.10);
      state.lastMove = now;
    }
  }, { passive: true, signal: lakeSignal });

  window.addEventListener('pointerdown', function (event) {
    if (reduceMotion) return;
    var p = mapPointer(event);
    if (p) addRipple(p.x, p.y, 0.30);
  }, { passive: true, signal: lakeSignal });

  function resize() {
    var rect = stage.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    var max = 2600000;
    if (w * h > max) {
      var k = Math.sqrt(max / (w * h));
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function render() {
    if (!state.ready) return;
    var pos = state.time * 4;
    var f0 = Math.floor(pos) % 24;
    var f1 = (f0 + 1) % 24;
    var mix = pos - Math.floor(pos);
    var x0 = (f0 % 6) * 1280, y0 = Math.floor(f0 / 6) * 720;
    var x1 = (f1 % 6) * 1280, y1 = Math.floor(f1 / 6) * 720;
    videoCtx.globalAlpha = 1;
    videoCtx.drawImage(image, x0, y0, 1280, 720, 0, 0, videoCanvas.width, videoCanvas.height);
    videoCtx.globalAlpha = mix;
    videoCtx.drawImage(image, x1, y1, 1280, 720, 0, 0, videoCanvas.width, videoCanvas.height);
    videoCtx.globalAlpha = 1;
    gl.bindTexture(gl.TEXTURE_2D, videoTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoCanvas);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, toneW, toneH);
    gl.useProgram(toneProgram);
    bindQuad(toneProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTex);
    gl.uniform1i(uni1.video, 0);
    gl.uniform2f(uni1.res, toneW, toneH);
    gl.uniform1f(uni1.time, state.time);
    gl.uniform1f(uni1.aspect, canvas.width / canvas.height);
    var data = new Float32Array(24);
    for (var i = 0; i < 6; i++) {
      var r = state.ripples[i];
      data[i * 4] = r ? r.x : 0;
      data[i * 4 + 1] = r ? r.y : 0;
      data[i * 4 + 2] = r ? r.t : 0;
      data[i * 4 + 3] = r ? r.a : 0;
    }
    gl.uniform4fv(uni1.ripples, data);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(halfProgram);
    bindQuad(halfProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, toneTex);
    gl.uniform1i(uni2.tone, 0);
    gl.uniform2f(uni2.res, canvas.width, canvas.height);
    gl.uniform1f(uni2.dpr, Math.min(window.devicePixelRatio || 1, 2));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (!canvas.classList.contains('is-ready')) {
      canvas.classList.add('is-ready');
      stage.classList.add('is-ready');
    }
  }

  var imagePoll = null;

  function useFallback() {
    stage.classList.add('is-fallback');
    stage.classList.remove('is-ready');
  }

  function markReady() {
    if (state.ready) return;
    if (!image.naturalWidth) return;
    if (imagePoll) window.clearInterval(imagePoll);
    state.ready = true;
    stage.classList.remove('is-fallback');
    render();
  }

  image.addEventListener('load', markReady);
  image.addEventListener('error', useFallback);
  if (image.naturalWidth) {
    markReady();
  } else {
    imagePoll = window.setInterval(function () {
      if (image.naturalWidth) markReady();
    }, 150);
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !reduceMotion) render();
  }, { signal: lakeSignal });

  if ('IntersectionObserver' in window) {
    lakeObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        state.visible = entry.isIntersecting;
      });
    }, { rootMargin: '80px' });
    lakeObserver.observe(stage);
  }

  resize();
  window.addEventListener('resize', function () {
    resize();
    if (reduceMotion) render();
  }, { passive: true, signal: lakeSignal });

  var last = 0;
  function frame(now) {
    lakeRaf = requestAnimationFrame(frame);
    if (!state.visible || document.hidden || !state.ready) return;
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    state.time += dt;
    if (now - state.draw < 15) return;
    state.draw = now;
    render();
  }

  lakeRaf = requestAnimationFrame(frame);

  window.__awakeLakeCleanup = function () {
    if (lakeRaf) cancelAnimationFrame(lakeRaf);
    if (lakeObserver) lakeObserver.disconnect();
    if (lakeController) lakeController.abort();
  };
})();

/* music-shelf.js */
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

/* album-dialog.js */
/* ============================================================
   AwaKeSpace · 专辑详情 / 全局播放器
   ============================================================ */
(function () {
  'use strict';

  var dialog = document.querySelector('[data-album-dialog]');
  var dataEl = document.querySelector('[data-album-data]');
  if (!dialog || !dataEl) return;

  var albums;
  try {
    albums = JSON.parse(dataEl.textContent);
  } catch (err) {
    return;
  }

  var closeBtn = dialog.querySelector('.album-dialog__close');
  var cover = dialog.querySelector('[data-album-cover]');
  var titleEl = dialog.querySelector('[data-album-title]');
  var yearEl = dialog.querySelector('[data-album-year]');
  var sideArtist = dialog.querySelector('[data-album-side-artist]');
  var sideYear = dialog.querySelector('[data-album-side-year]');
  var metaEl = dialog.querySelector('[data-album-meta]');
  var noteEl = dialog.querySelector('[data-album-note]');
  var player = dialog.querySelector('[data-album-player]');
  var audio = dialog.querySelector('[data-album-audio]');
  var statusEl = dialog.querySelector('[data-album-status]');
  var list = dialog.querySelector('[data-album-tracks]');
  var officialEl = dialog.querySelector('[data-album-official]');
  var toggleBtn = dialog.querySelector('[data-player-toggle]');
  var playerTitle = dialog.querySelector('[data-player-title]');
  var playerTime = dialog.querySelector('[data-player-time]');
  var seek = dialog.querySelector('[data-player-seek]');
  var seekFill = dialog.querySelector('[data-seek-fill]');
  var seekThumb = dialog.querySelector('[data-seek-thumb]');
  var vinylTitle = dialog.querySelector('[data-vinyl-title]');
  var vinylArtist = dialog.querySelector('[data-vinyl-artist]');

  var mini = document.querySelector('[data-mini-player]');
  var miniCover = document.querySelector('[data-mini-cover]');
  var miniTitle = document.querySelector('[data-mini-title]');
  var miniArtist = document.querySelector('[data-mini-artist]');
  var miniToggle = document.querySelector('[data-mini-toggle]');
  var miniPrev = document.querySelector('[data-mini-prev]');
  var miniNext = document.querySelector('[data-mini-next]');
  var miniOpen = document.querySelector('[data-mini-open]');
  var miniClose = document.querySelector('[data-mini-close]');
  var miniFill = document.querySelector('[data-mini-fill]');

  var STATE_KEY = 'awake-player-state-v1';
  var lastFocus = null;
  var currentAlbum = null;
  var currentAlbumIndex = -1;
  var currentTrackIndex = -1;
  var activeButton = null;
  var closeTimer = null;
  var seeking = false;
  var miniDismissed = false;
  var lastSave = 0;

  function formatTime(value) {
    if (!isFinite(value) || value < 0) return '0:00';
    var m = Math.floor(value / 60);
    var s = Math.floor(value % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || '';
  }

  function setPlaying(playing) {
    if (toggleBtn) {
      toggleBtn.textContent = playing ? '❚❚' : '▶';
      toggleBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
      toggleBtn.classList.toggle('is-playing', playing);
    }
    if (miniToggle) {
      miniToggle.textContent = playing ? '❚❚' : '▶';
      miniToggle.setAttribute('aria-label', playing ? '暂停' : '播放');
    }
  }

  function hasTrack() {
    return Boolean(audio.getAttribute('src') && currentAlbum && currentTrackIndex >= 0);
  }

  function updateMiniProgress() {
    if (!miniFill) return;
    var ratio = 0;
    if (audio.duration) ratio = Math.max(0, Math.min(1, audio.currentTime / audio.duration));
    miniFill.style.width = (ratio * 100).toFixed(2) + '%';
  }

  function updateMini() {
    if (!mini) return;
    var show = hasTrack() && !dialog.classList.contains('is-open') && !miniDismissed;
    mini.hidden = !show;
    if (!show) return;

    if (miniCover) {
      miniCover.src = currentAlbum.cover || '';
      miniCover.alt = currentAlbum.title || '';
    }
    if (miniTitle) miniTitle.textContent = audio.dataset.title || '';
    if (miniArtist) miniArtist.textContent = [currentAlbum.artist, currentAlbum.year].filter(Boolean).join(' · ');
    setPlaying(!audio.paused);
    updateMiniProgress();
  }

  function setSeekVisual(ratio) {
    if (!seek) return;
    var safe = Math.max(0, Math.min(1, isFinite(ratio) ? ratio : 0));
    var percent = (safe * 100).toFixed(2) + '%';
    if (seekFill) seekFill.style.width = percent;
    if (seekThumb) seekThumb.style.left = percent;
    seek.setAttribute('aria-valuenow', String(Math.round(safe * 100)));
  }

  function updateProgress(force) {
    if (!audio.duration) return;
    if (seeking && !force) return;
    setSeekVisual(audio.currentTime / audio.duration);
    if (playerTime) {
      playerTime.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration);
    }
  }

  function saveState() {
    if (!hasTrack()) return;
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify({
        album: currentAlbumIndex,
        track: currentTrackIndex,
        time: audio.currentTime || 0,
        playing: !audio.paused
      }));
    } catch (err) {}
  }

  function resetPlayer() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    currentTrackIndex = -1;
    setPlaying(false);
    if (playerTitle) playerTitle.textContent = '选择一首歌';
    if (playerTime) playerTime.textContent = '0:00 / 0:00';
    setSeekVisual(0);
    setStatus('');
    updateMini();
  }

  function syncPlayerUI() {
    if (!audio.getAttribute('src')) {
      setPlaying(false);
      return;
    }
    if (audio.dataset.title) playerTitle.textContent = audio.dataset.title;
    setPlaying(!audio.paused);
    updateProgress(true);
  }

  function markActive(index) {
    if (activeButton) {
      activeButton.classList.remove('is-active');
      activeButton.removeAttribute('aria-current');
    }
    activeButton = null;
    var buttons = list ? list.querySelectorAll('.album-track') : [];
    if (buttons[index]) {
      activeButton = buttons[index];
      activeButton.classList.add('is-active');
      activeButton.setAttribute('aria-current', 'true');
    }
  }

  function playTrack(track, button) {
    if (!track || !track.audio) {
      setStatus('这首歌还没有音频文件。');
      return;
    }

    currentTrackIndex = currentAlbum && currentAlbum.tracks ? currentAlbum.tracks.indexOf(track) : -1;
    miniDismissed = false;

    if (activeButton) {
      activeButton.classList.remove('is-active');
      activeButton.removeAttribute('aria-current');
    }
    activeButton = button || null;
    if (!activeButton && list) {
      var buttons = list.querySelectorAll('.album-track');
      if (buttons[currentTrackIndex]) activeButton = buttons[currentTrackIndex];
    }
    if (activeButton) {
      activeButton.classList.add('is-active');
      activeButton.setAttribute('aria-current', 'true');
    }

    audio.src = track.audio;
    audio.dataset.title = track.title;
    if (playerTitle) playerTitle.textContent = track.title;
    if (playerTime) playerTime.textContent = '0:00 / 0:00';
    setSeekVisual(0);
    setStatus('正在载入：' + track.title);
    updateMini();
    saveState();

    audio.play().then(function () {
      setStatus('正在播放：' + track.title);
    }).catch(function () {
      setStatus('无法播放：音频文件未找到。把文件放到 source/music/audio/sound-fragment/ 后重新生成即可。');
      setPlaying(false);
    });
  }

  function trackButton(index) {
    var buttons = list ? list.querySelectorAll('.album-track') : [];
    return buttons[index] || null;
  }

  function buildTracks(album, preserve) {
    list.innerHTML = '';
    activeButton = null;

    if (!preserve) resetPlayer();

    if (!album.tracks || !album.tracks.length) {
      player.hidden = true;
      setStatus('这张专辑还没有曲目。');
      return;
    }

    player.hidden = false;
    setStatus('点击曲目开始播放');
    list.style.setProperty('--track-count', album.tracks.length);

    album.tracks.forEach(function (track, i) {
      var li = document.createElement('li');
      li.style.setProperty('--i', i);
      var button = document.createElement('button');
      var num = document.createElement('span');
      var name = document.createElement('span');
      var icon = document.createElement('span');

      button.type = 'button';
      button.className = 'album-track';
      button.setAttribute('aria-label', '播放 ' + track.title);
      num.className = 'album-track__num';
      name.className = 'album-track__title';
      icon.className = 'album-track__icon';
      num.textContent = String(i + 1).padStart(2, '0');
      name.textContent = track.title;
      icon.textContent = '▶';

      button.appendChild(num);
      button.appendChild(name);
      button.appendChild(icon);
      button.addEventListener('click', function () {
        playTrack(track, button);
      });

      li.appendChild(button);
      list.appendChild(li);
    });

    if (preserve && audio.getAttribute('src')) {
      markActive(currentTrackIndex);
      syncPlayerUI();
    }
  }

  function openAlbum(index) {
    var album = albums[index];
    if (!album) return;

    var sameAlbum = currentAlbum === album;
    currentAlbum = album;
    currentAlbumIndex = index;
    lastFocus = document.activeElement;
    miniDismissed = false;

    cover.src = album.cover;
    cover.alt = album.title;
    titleEl.textContent = album.title;
    yearEl.textContent = album.year || '';
    sideArtist.textContent = album.artist || '';
    sideYear.textContent = album.year || '';
    metaEl.textContent = album.note || '';
    noteEl.textContent = album.tracks && album.tracks.length ? album.tracks.length + ' 首曲目' : '';
    if (vinylTitle) vinylTitle.textContent = album.title;
    if (vinylArtist) vinylArtist.textContent = album.artist || '';

    if (album.official) {
      officialEl.href = album.official;
      officialEl.hidden = false;
    } else {
      officialEl.hidden = true;
      officialEl.removeAttribute('href');
    }

    if (!sameAlbum) {
      buildTracks(album, false);
    } else if (!list.children.length) {
      buildTracks(album, true);
    } else {
      syncPlayerUI();
      markActive(currentTrackIndex);
    }

    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }
    dialog.hidden = false;
    dialog.classList.remove('is-closing');
    requestAnimationFrame(function () {
      dialog.classList.add('is-open');
      updateMini();
    });
    document.body.style.overflow = 'hidden';
    document.body.classList.add('is-album-open');
    closeBtn.focus();
  }

  function closeAlbum() {
    if (dialog.hidden || dialog.classList.contains('is-closing')) return;

    dialog.classList.add('is-closing');
    dialog.classList.remove('is-open');
    updateMini();

    closeTimer = window.setTimeout(function () {
      closeTimer = null;
      dialog.hidden = true;
      dialog.classList.remove('is-closing');
      document.body.style.overflow = '';
      document.body.classList.remove('is-album-open');
      updateMini();
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    }, 420);
  }

  function restoreState() {
    var saved;
    try {
      saved = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
    } catch (err) {
      return;
    }
    if (!saved || !albums[saved.album]) return;

    var album = albums[saved.album];
    var track = album.tracks && album.tracks[saved.track];
    if (!track || !track.audio) return;

    currentAlbum = album;
    currentAlbumIndex = saved.album;
    currentTrackIndex = saved.track;
    audio.src = track.audio;
    audio.dataset.title = track.title;
    if (playerTitle) playerTitle.textContent = track.title;

    audio.addEventListener('loadedmetadata', function onMeta() {
      audio.removeEventListener('loadedmetadata', onMeta);
      if (saved.time > 0 && saved.time < audio.duration) audio.currentTime = saved.time;
      updateProgress(true);
      updateMini();
      if (saved.playing) {
        audio.play().catch(function () {
          setPlaying(false);
          setStatus('点击播放继续');
        });
      } else {
        setPlaying(false);
      }
    });

    audio.load();
    updateMini();
  }

  /* ---------- 专辑按钮 ---------- */
  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-album-index]');
    if (!button) return;
    event.preventDefault();
    openAlbum(Number(button.getAttribute('data-album-index')));
  });

  dialog.querySelectorAll('[data-album-close]').forEach(function (el) {
    el.addEventListener('click', closeAlbum);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeAlbum();
  });

  toggleBtn.addEventListener('click', function () {
    if (!audio.getAttribute('src')) {
      var first = list.querySelector('.album-track');
      if (first) first.click();
      return;
    }
    if (audio.paused) audio.play().catch(function () { setStatus('无法播放：音频文件未找到。'); });
    else audio.pause();
  });

  /* ---------- 自定义进度条 ---------- */
  function seekToClientX(clientX) {
    if (!audio.duration) return;
    var rect = seek.getBoundingClientRect();
    if (!rect.width) return;
    var ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setSeekVisual(ratio);
    if (playerTime) {
      playerTime.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration);
    }
    updateMiniProgress();
  }

  seek.addEventListener('pointerdown', function (event) {
    if (!audio.duration) return;
    seeking = true;
    event.preventDefault();
    seekToClientX(event.clientX);
    try { seek.setPointerCapture(event.pointerId); } catch (err) {}
  });

  seek.addEventListener('pointermove', function (event) {
    if (seeking) seekToClientX(event.clientX);
  });

  seek.addEventListener('pointerup', function (event) {
    seeking = false;
    if (seek.hasPointerCapture(event.pointerId)) {
      seek.releasePointerCapture(event.pointerId);
    }
    updateProgress(true);
  });

  seek.addEventListener('pointercancel', function () {
    seeking = false;
    updateProgress(true);
  });

  seek.addEventListener('keydown', function (event) {
    if (!audio.duration) return;
    var next = audio.currentTime;
    if (event.key === 'ArrowRight') next += 5;
    else if (event.key === 'ArrowLeft') next -= 5;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = audio.duration;
    else return;
    event.preventDefault();
    audio.currentTime = Math.max(0, Math.min(audio.duration, next));
    updateProgress(true);
  });

  /* ---------- 迷你播放器 ---------- */
  if (miniToggle) {
    miniToggle.addEventListener('click', function () {
      if (!audio.getAttribute('src')) return;
      if (audio.paused) audio.play().catch(function () {});
      else audio.pause();
    });
  }

  if (miniPrev) {
    miniPrev.addEventListener('click', function () {
      if (!currentAlbum || !currentAlbum.tracks) return;
      var next = currentTrackIndex - 1;
      if (next < 0) next = currentAlbum.tracks.length - 1;
      playTrack(currentAlbum.tracks[next], trackButton(next));
    });
  }

  if (miniNext) {
    miniNext.addEventListener('click', function () {
      if (!currentAlbum || !currentAlbum.tracks) return;
      var next = currentTrackIndex + 1;
      if (next >= currentAlbum.tracks.length) next = 0;
      playTrack(currentAlbum.tracks[next], trackButton(next));
    });
  }

  if (miniOpen) {
    miniOpen.addEventListener('click', function () {
      if (currentAlbumIndex >= 0) openAlbum(currentAlbumIndex);
    });
  }

  if (miniClose) {
    miniClose.addEventListener('click', function () {
      miniDismissed = true;
      audio.pause();
      updateMini();
      saveState();
    });
  }

  /* ---------- audio events ---------- */
  audio.addEventListener('play', function () {
    setPlaying(true);
    setStatus('正在播放：' + (audio.dataset.title || ''));
    updateMini();
    saveState();
  });

  audio.addEventListener('pause', function () {
    setPlaying(false);
    updateMini();
    saveState();
  });

  audio.addEventListener('timeupdate', function () {
    updateProgress(false);
    updateMiniProgress();
    var now = Date.now();
    if (now - lastSave > 1000) {
      lastSave = now;
      saveState();
    }
  });

  audio.addEventListener('loadedmetadata', function () {
    updateProgress(true);
    updateMiniProgress();
  });

  audio.addEventListener('ended', function () {
    setPlaying(false);
    setStatus('播放结束');
    updateMini();
    saveState();
  });

  audio.addEventListener('error', function () {
    setPlaying(false);
    setStatus('无法播放：音频文件未找到。把文件放到 source/music/audio/sound-fragment/ 后重新生成即可。');
  });

  window.addEventListener('pagehide', saveState);
  window.addEventListener('beforeunload', saveState);

  updateMini();
  restoreState();
})();

/* page-smooth.js */
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

/* main.js */
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
      var emptyTitle;
      var emptyNote;
      if (searchIndex === null) {
        emptyTitle = '正在加载';
        emptyNote = '正在读取站内文章索引。';
      } else if (searchLoadFailed) {
        emptyTitle = '索引加载失败';
        emptyNote = '请稍后刷新页面重试。';
      } else if (!items.length) {
        emptyTitle = '目前还没有文章';
        emptyNote = '发布第一篇文章后，这里会出现搜索结果。';
      } else {
        emptyTitle = '没有找到相关内容';
        emptyNote = '换一个关键词，或从标签和分类重新找。';
      }
      searchResults.innerHTML = '<div class="search__empty"><span class="search__empty-mark" aria-hidden="true"></span><p class="search__empty-title">' + emptyTitle + '</p><p class="search__empty-note">' + emptyNote + '</p></div>';
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
