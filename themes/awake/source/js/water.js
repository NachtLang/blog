/* ============================================================
   AwaKeSpace · 实时水面
   海浪纹理 + 解析水波 + 指针涟漪
   ------------------------------------------------------------
   · 连续波场缓慢推动整幅水面
   · 指针 / 点击写入解析涟漪，直接让水面照片产生折射位移
   · 水波的高度、梯度、高光全部来自同一套计算
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.querySelector('[data-water-canvas]');
  if (!canvas) return;

  var stage = canvas.closest('.water-stage');
  var textureUrl = canvas.getAttribute('data-texture') || '/images/water-hero.jpg';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var gl = null;
  try {
    gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance'
    });
  } catch (err) {
    gl = null;
  }

  if (!gl) return;

  var state = {
    time: 0,
    mouse: { x: 0.64, y: 0.44 },
    ripples: [],
    visible: true,
    photoReady: false,
    started: false,
    lastFrame: 0,
    lastDraw: 0
  };

  var VS = [
    '#version 300 es',
    'in vec2 aPos;',
    'out vec2 vUv;',
    'void main(){',
    '  vUv = aPos * 0.5 + 0.5;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS = [
    '#version 300 es',
    'precision highp float;',
    'uniform sampler2D uPhoto;',
    'uniform vec2 uRes;',
    'uniform float uTime;',
    'uniform vec2 uMouse;',
    'uniform vec4 uRipples[6];',
    'in vec2 vUv;',
    'out vec4 outColor;',
    '',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }',
    'float noise(vec2 p){',
    '  vec2 i = floor(p); vec2 f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);',
    '}',
    'float fbm(vec2 p, int oct){',
    '  float v = 0.0; float a = 0.5;',
    '  mat2 m = mat2(0.8, 0.6, -0.6, 0.8);',
    '  for (int i = 0; i < 6; i++){ if (i >= oct) break; v += a * noise(p); p = m * p * 2.03; a *= 0.5; }',
    '  return v;',
    '}',
    'vec2 cover(vec2 uv){',
    '  float aspect = uRes.x / uRes.y;',
    '  float ia = 16.0 / 9.0;',
    '  vec2 t = uv - 0.5;',
    '  if (aspect > ia) t.y *= ia / aspect; else t.x *= aspect / ia;',
    '  return t + 0.5;',
    '}',
    '',
    'void main(){',
    '  vec2 uv = vUv;',
    '  float aspect = uRes.x / uRes.y;',
    '  vec2 p = vec2(uv.x * aspect, uv.y);',
    '  float t = uTime;',
    '',
    '  float h = 0.0;',
    '  vec2 g = vec2(0.0);',
    '  for (int i = 0; i < 6; i++){',
    '    vec4 r = uRipples[i];',
    '    if (r.w <= 0.0) continue;',
    '    float age = t - r.z;',
    '    if (age < 0.0 || age > 5.0) continue;',
    '    vec2 d = vec2((uv.x - r.x) * aspect, uv.y - r.y);',
    '    float dist = length(d) + 0.0001;',
    '    float phase = dist * 30.0 - age * 7.0;',
    '    float env = exp(-dist * 5.0) * exp(-age * 1.0);',
    '    h += sin(phase) * env * r.w;',
    '    float dr = cos(phase) * 30.0 * env - sin(phase) * 5.0 * env;',
    '    g += normalize(d) * dr * r.w * 0.0027;',
    '  }',
    '',
    '  float bg = sin(p.x * 3.4 + t * 0.55) * 0.0035 + sin(p.y * 2.7 - t * 0.42) * 0.0030;',
    '  bg += (fbm(p * 2.2 + vec2(t * 0.03, -t * 0.02), 3) - 0.5) * 0.012;',
    '  h += bg;',
    '  vec2 gd = vec2(dFdx(h), dFdy(h)) / max(vec2(dFdx(uv.x), dFdy(uv.y)), vec2(1e-6));',
    '  g += gd * 0.0010;',
    '',
    '  vec2 warp = vec2(',
    '    fbm(p * 2.4 + vec2(t * 0.05, t * 0.03), 3) - 0.5,',
    '    fbm(p * 3.8 - vec2(t * 0.04, t * 0.02), 3) - 0.5',
    '  ) * 0.028;',
    '  vec2 drift = vec2(sin(t * 0.055) * 0.0100, cos(t * 0.045) * 0.0080);'
    ,'  vec2 uv2 = cover(uv + drift + g * 0.58 + warp);',
    '  vec3 base = texture(uPhoto, clamp(uv2, 0.002, 0.998)).rgb;',
    '',
    '  float lum = dot(base, vec3(0.299, 0.587, 0.114));',
    '  lum = smoothstep(-0.02, 0.86, lum);',
    '  vec3 shadow = vec3(0.005, 0.040, 0.058);',
    '  vec3 deep = vec3(0.012, 0.090, 0.125);',
    '  vec3 mid = vec3(0.030, 0.185, 0.235);',
    '  vec3 high = vec3(0.100, 0.400, 0.480);',
    '  vec3 cream = vec3(0.93, 0.925, 0.855);',
    '  vec3 col = mix(shadow, deep, smoothstep(0.0, 0.30, lum));',
    '  col = mix(col, mid, smoothstep(0.20, 0.56, lum));',
    '  col = mix(col, high, smoothstep(0.50, 0.82, lum));',
    '  col = mix(col, cream, smoothstep(0.78, 0.96, lum) * 0.92);',
    '',
    '  vec3 N = normalize(vec3(-g * 70.0, 1.0));',
    '  vec3 V = vec3(0.0, 0.0, 1.0);',
    '  vec3 L = normalize(vec3(-0.45, 0.40, 0.80));',
    '  vec3 Hv = normalize(L + V);',
    '  float ndh = clamp(dot(N, Hv), 0.0, 1.0);',
    '  float ndv = clamp(dot(N, V), 0.0, 1.0);',
    '  float spec = pow(ndh, 540.0);',
    '  float glint = pow(ndh, 2600.0);',
    '  float fres = pow(1.0 - ndv, 4.0);',
    '  col = mix(col, vec3(0.30, 0.55, 0.57), clamp(fres * 0.28, 0.0, 1.0));',
    '  col += cream * (spec * 0.22 + glint * 0.55);',
    '  col *= clamp(1.0 + h * 0.9, 0.86, 1.12);',
    '',
    '  float crest = smoothstep(0.12, 0.5, abs(h));',
    '  col = mix(col, cream, crest * 0.06);',
    '',
    '  vec2 mp = vec2(uMouse.x * aspect, uMouse.y);',
    '  float md = length(p - mp);',
    '  col += vec3(0.02, 0.065, 0.065) * exp(-md * 3.0) * 0.5;',
    '',
    '  vec2 c = uv - 0.5;',
    '  float vig = smoothstep(1.16, 0.15, length(c * vec2(0.9, 1.08)));',
    '  col *= mix(0.62, 1.0, vig);',
    '  col = mix(col, vec3(0.006, 0.038, 0.045), smoothstep(0.68, 1.0, uv.y) * 0.42);',
    '  col = mix(col, vec3(0.005, 0.032, 0.038), smoothstep(0.10, 0.0, uv.y) * 0.35);',
    '  float grain = hash(uv * uRes + fract(t) * 9.0);',
    '  col += (grain - 0.5) * 0.014;',
    '  outColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      if (window.console && console.warn) console.warn('[water]', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  var vs = compile(gl.VERTEX_SHADER, VS);
  var fs = compile(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return;

  var program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  var aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var loc = {
    photo: gl.getUniformLocation(program, 'uPhoto'),
    res: gl.getUniformLocation(program, 'uRes'),
    time: gl.getUniformLocation(program, 'uTime'),
    mouse: gl.getUniformLocation(program, 'uMouse'),
    ripples: gl.getUniformLocation(program, 'uRipples')
  };

  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([14, 72, 82, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  var image = new Image();
  image.decoding = 'async';
  image.onload = function () {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    state.photoReady = true;
    if (reduceMotion) drawStatic();
  };
  image.src = textureUrl;

  function resize() {
    var rect = stage ? stage.getBoundingClientRect() : canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var scale = w < 760 ? 0.68 : 0.86;
    var cw = Math.round(w * dpr * scale);
    var ch = Math.round(h * dpr * scale);
    var maxPixels = 2200000;
    if (cw * ch > maxPixels) {
      var k = Math.sqrt(maxPixels / (cw * ch));
      cw = Math.round(cw * k);
      ch = Math.round(ch * k);
    }
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
  }

  var rippleData = new Float32Array(24);

  function addRipple(x, y, amplitude) {
    state.ripples.unshift({ x: x, y: y, t: state.time, a: amplitude });
    if (state.ripples.length > 6) state.ripples.length = 6;
  }

  function mapPointer(event) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var x = (event.clientX - rect.left) / rect.width;
    var y = 1 - (event.clientY - rect.top) / rect.height;
    if (x < -0.1 || x > 1.1 || y < -0.1 || y > 1.1) return null;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }

  var lastMove = 0;
  window.addEventListener('pointermove', function (event) {
    var point = mapPointer(event);
    if (!point) return;
    state.mouse.x = point.x;
    state.mouse.y = point.y;
    if (reduceMotion) return;
    var now = performance.now();
    if (now - lastMove > 42) {
      addRipple(point.x, point.y, 0.060);
      lastMove = now;
    }
  }, { passive: true });

  window.addEventListener('pointerdown', function (event) {
    if (reduceMotion) return;
    var point = mapPointer(event);
    if (!point) return;
    addRipple(point.x, point.y, 0.42);
  }, { passive: true });

  var ambient = 0;
  function startAmbient() {
    if (reduceMotion) return;
    ambient = window.setInterval(function () {
      if (!state.visible || document.hidden) return;
      addRipple(0.12 + Math.random() * 0.76, 0.15 + Math.random() * 0.7, 0.025 + Math.random() * 0.02);
    }, 2800);
  }

  function render() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(loc.photo, 0);
    gl.uniform2f(loc.res, canvas.width, canvas.height);
    gl.uniform1f(loc.time, state.time);
    gl.uniform2f(loc.mouse, state.mouse.x, state.mouse.y);
    for (var i = 0; i < 6; i++) {
      var r = state.ripples[i];
      rippleData[i * 4] = r ? r.x : 0;
      rippleData[i * 4 + 1] = r ? r.y : 0;
      rippleData[i * 4 + 2] = r ? r.t : 0;
      rippleData[i * 4 + 3] = r ? r.a : 0;
    }
    gl.uniform4fv(loc.ripples, rippleData);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!canvas.classList.contains('is-ready') && state.photoReady) {
      canvas.classList.add('is-ready');
    }
  }

  function drawStatic() {
    if (!state.photoReady) return;
    state.time = 6;
    render();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!state.visible || document.hidden) {
      state.lastFrame = now;
      state.lastDraw = now;
      return;
    }
    if (!state.started) {
      state.started = true;
      state.lastFrame = now;
      state.lastDraw = now;
    }
    if (now - state.lastDraw < 24) return;
    state.lastDraw = now;
    var dt = Math.min(0.06, (now - state.lastFrame) / 1000);
    state.lastFrame = now;
    if (!reduceMotion) state.time += dt;
    render();
  }

  resize();
  window.addEventListener('resize', function () {
    resize();
    if (reduceMotion) drawStatic();
  }, { passive: true });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        state.visible = entry.isIntersecting;
      });
    }, { rootMargin: '120px' });
    io.observe(stage || canvas);
  }

  document.addEventListener('visibilitychange', function () {
    state.lastFrame = performance.now();
    state.lastDraw = 0;
  });

  addRipple(0.64, 0.44, 0.06);
  startAmbient();

  if (reduceMotion) {
    var wait = window.setInterval(function () {
      if (state.photoReady) {
        window.clearInterval(wait);
        drawStatic();
      }
    }, 120);
    window.setTimeout(function () { window.clearInterval(wait); }, 6000);
  } else {
    requestAnimationFrame(frame);
  }

  window.addEventListener('pagehide', function () {
    if (ambient) window.clearInterval(ambient);
  }, { passive: true });
})();
