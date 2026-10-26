'use strict';

/**
 * AwaKeSpace 主题辅助函数
 */

function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** 纯文本摘要 */
hexo.extend.helper.register('awake_excerpt', function (content, length) {
  const len = Number(length) || 120;
  const text = stripTags(content);
  if (text.length <= len) return text;
  return text.slice(0, len).replace(/[，、；：,;:\s]+$/, '') + '…';
});

/** 阅读时长（中文按 420 字/分钟，英文按 220 词/分钟粗算） */
hexo.extend.helper.register('awake_read_time', function (content) {
  const text = stripTags(content);
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const latinWords = (text.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
  const minutes = Math.max(1, Math.round(cjk / 420 + latinWords / 220));
  return minutes;
});

/** 文章字数 */
hexo.extend.helper.register('awake_word_count', function (content) {
  const text = stripTags(content);
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const latinWords = (text.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + latinWords;
});

/** 日期：2026.10.22 */
hexo.extend.helper.register('awake_date', function (date, sep) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const s = sep || '.';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${s}${pad(d.getMonth() + 1)}${s}${pad(d.getDate())}`;
});

/** 把十六进制颜色变成 rgba，用于生成每篇文章的微光色 */
hexo.extend.helper.register('awake_tint', function (seed, alpha) {
  const s = String(seed || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) % 360;
  }
  return `hsla(${150 + (h % 36)}, 42%, 62%, ${alpha == null ? 0.5 : alpha})`;
});

/** 文章封面：没有封面时用标题生成一层水光渐变作为背景 */
hexo.extend.helper.register('awake_cover_style', function (post) {
  const title = (post && post.title) || '';
  let h = 0;
  for (let i = 0; i < title.length; i += 1) {
    h = (h * 33 + title.charCodeAt(i)) % 360;
  }
  const x = 28 + (h % 44);
  const y = 38 + ((h * 7) % 34);
  const hue = 148 + (h % 26);
  return [
    `--art-x:${x}%`,
    `--art-y:${y}%`,
    `--art-hue:${hue}`,
    `--art-hue2:${hue + 12}`
  ].join(';');
});

/** 当前导航项高亮 */
hexo.extend.helper.register('awake_nav_active', function (id) {
  const path = String(this.page.path || '');
  const isHome = path === '' || path === 'index.html';
  if (id === 'post') return isHome || path.startsWith('archives/') || path.startsWith('tags/') || path.startsWith('categories/');
  if (id === 'music') return path.startsWith('music/');
  if (id === 'zato') return path.startsWith('zato/');
  if (id === 'about') return path.startsWith('about/');
  return false;
});
