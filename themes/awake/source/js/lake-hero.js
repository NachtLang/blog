/* ============================================================
   AwaKeSpace · 首屏水面
   真实水面循环影像 → 低分辨率明暗 → 半调网点
   ============================================================ */
(function () {
  'use strict';

  var stage = document.querySelector('[data-lake-stage]');
  var canvas = document.querySelector('[data-lake-canvas]');
  var image = document.querySelector('[data-lake-image]');
  if (!stage || !canvas || !image) return;

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
    '  vec3 tealInk = vec3(0.070, 0.255, 0.265);',
    '  float cell = 7.2 * uDpr;',
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
  videoCanvas.width = 640;
  videoCanvas.height = 360;
  var videoCtx = videoCanvas.getContext('2d');

  var videoTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, videoTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 70, 75, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  var toneW = 640;
  var toneH = 360;
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
  }, { passive: true });

  window.addEventListener('pointerdown', function (event) {
    if (reduceMotion) return;
    var p = mapPointer(event);
    if (p) addRipple(p.x, p.y, 0.30);
  }, { passive: true });

  function resize() {
    var rect = stage.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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
    videoCtx.drawImage(image, 0, 0, videoCanvas.width, videoCanvas.height);
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
    gl.uniform1f(uni2.dpr, Math.min(window.devicePixelRatio || 1, 1.5));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (!canvas.classList.contains('is-ready')) {
      canvas.classList.add('is-ready');
      stage.classList.add('is-ready');
    }
  }

  var fallbackTimer = null;
  var imagePoll = null;

  function useFallback() {
    if (stage.classList.contains('is-fallback')) return;
    if (fallbackTimer) window.clearTimeout(fallbackTimer);
    if (imagePoll) window.clearInterval(imagePoll);
    stage.classList.add('is-fallback');
    stage.classList.remove('is-ready');
  }

  function markReady() {
    if (state.ready) return;
    if (!image.naturalWidth) return;
    if (fallbackTimer) window.clearTimeout(fallbackTimer);
    if (imagePoll) window.clearInterval(imagePoll);
    state.ready = true;
    render();
  }

  fallbackTimer = window.setTimeout(function () {
    if (!state.ready) useFallback();
  }, 5000);

  image.addEventListener('error', useFallback);
  if (image.naturalWidth) {
    markReady();
  } else {
    image.addEventListener('load', markReady);
    if (image.decode) {
      image.decode().then(markReady).catch(function () {});
    }
    imagePoll = window.setInterval(function () {
      if (image.naturalWidth) markReady();
    }, 100);
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !reduceMotion) render();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        state.visible = entry.isIntersecting;
      });
    }, { rootMargin: '80px' }).observe(stage);
  }

  resize();
  window.addEventListener('resize', function () {
    resize();
    if (reduceMotion) render();
  }, { passive: true });

  var last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!state.visible || document.hidden || !state.ready || reduceMotion) return;
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    state.time += dt;
    if (now - state.draw < 15) return;
    state.draw = now;
    render();
  }

  if (!reduceMotion) requestAnimationFrame(frame);
})();
