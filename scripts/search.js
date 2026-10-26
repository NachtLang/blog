'use strict';

/**
 * 生成 /search.json 站内搜索索引
 */
hexo.extend.generator.register('search_index', function (locals) {
  const posts = locals.posts.sort('-date').toArray();
  const data = posts.map((post) => ({
    title: post.title || '',
    url: '/' + String(post.path || '').replace(/^\/+/, ''),
    date: post.date ? post.date.format('YYYY.MM.DD') : '',
    excerpt: String(post.excerpt || post.content || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140),
    tags: post.tags ? post.tags.toArray().map((tag) => tag.name) : [],
    categories: post.categories ? post.categories.toArray().map((cat) => cat.name) : []
  }));

  return {
    path: 'search.json',
    data: JSON.stringify(data)
  };
});
