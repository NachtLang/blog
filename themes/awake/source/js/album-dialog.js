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
