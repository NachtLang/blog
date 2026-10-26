'use strict';

/*
 * Hexo 的 index 生成器在没有文章时不会生成首页。
 * 这里补一个空首页，保证文章全部删除后首页仍可访问。
 * 有文章时自动让位给 hexo-generator-index。
 */
hexo.extend.generator.register('home-empty', function (locals) {
  if (locals.posts.length) return;

  return [{
    path: '',
    layout: ['index'],
    data: {
      __index: true,
      base: '',
      total: 1,
      current: 1,
      current_url: '',
      posts: locals.posts,
      prev: 0,
      next: 0,
      prev_link: '',
      next_link: ''
    }
  }];
});
