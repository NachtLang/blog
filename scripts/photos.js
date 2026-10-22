'use strict';

/**
 * /photos 页面生成器
 *
 * 数据源：source/_data/photos.yml
 * 渲染：交给 Stellar 的 {% gallery %} 标签，自动带灯箱（fancybox）。
 *
 * 这样照片仍然只维护一个 yml 文件，换主题不用重排内容。
 */

hexo.extend.generator.register('photos_page', function (locals) {
  const photos = (locals.data && locals.data.photos) ? locals.data.photos.slice() : [];
  if (!photos.length) return [];

  photos.sort((a, b) => new Date(b.date) - new Date(a.date));

  const lines = photos.map((p) => {
    const alt = p.title || '';
    return `![${alt}](${p.src})`;
  });

  const src = [
    '{% gallery layout:grid size:mix aspect_ratio:original %}',
    ...lines,
    '{% endgallery %}'
  ].join('\n');

  const renderTag = (str) =>
    new Promise((resolve, reject) => {
      hexo.extend.tag.render(str, {}, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

  return renderTag(src).then((html) => ({
    path: 'photos/index.html',
    data: {
      title: '随手拍',
      type: 'page',
      content: html
    },
    layout: ['page']
  }));
});
