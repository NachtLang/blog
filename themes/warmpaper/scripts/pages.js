hexo.extend.generator.register('tags_index', function(locals) {
  return {
    path: 'tags/index.html',
    data: { title: 'Tags' },
    layout: ['tags']
  };
});

hexo.extend.generator.register('categories_index', function(locals) {
  return {
    path: 'categories/index.html',
    data: { title: 'Categories' },
    layout: ['categories']
  };
});

hexo.extend.generator.register('photos_index', function(locals) {
  return {
    path: 'photos/index.html',
    data: { title: '随手拍' },
    layout: ['photos']
  };
});
