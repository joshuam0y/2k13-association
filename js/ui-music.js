// Soundtrack bar: a persistent bottom bar that plays window.SOUNDTRACK through the YouTube
// IFrame API. Music starts on the first click anywhere (browsers block autoplay).
// Songs with yt: null are skipped. With no IDs at all, the bar shows the tracklist instead.
(function () {
  'use strict';
  const UI = window.UI;
  const M = UI.music = { idx: 0, playing: false, muted: false, ready: false, started: false, player: null, failed: false };
  const PREF = 'a13-music';

  const tracks = () => (Array.isArray(window.SOUNDTRACK) ? window.SOUNDTRACK : []);
  const playable = () => tracks().map((t, i) => (t && t.yt ? i : -1)).filter(i => i >= 0);
  M.hasIds = () => playable().length > 0;
  // Which video plays for a track: the primary ID, or the backup once the primary has failed.
  M.useBackup = {};
  const idFor = i => { const t = tracks()[i]; return t ? (M.useBackup[i] && t.backup ? t.backup : t.yt) : null; };

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF) || '{}');
      M.muted = !!p.muted;
      if (Number.isInteger(p.idx)) M.idx = p.idx;
    } catch (e) { /* ignore */ }
  }
  function savePrefs() {
    try { localStorage.setItem(PREF, JSON.stringify({ muted: M.muted, idx: M.idx })); } catch (e) { /* ignore */ }
  }

  function nextPlayable(from, step) {
    const list = tracks();
    for (let k = 1; k <= list.length; k++) {
      const i = ((from + step * k) % list.length + list.length) % list.length;
      if (list[i] && list[i].yt) return i;
    }
    return -1;
  }

  const ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l8.5 6L6 18zM16 6h2v12h-2z"/></svg>',
    vol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zM16 8.5a4.5 4.5 0 010 7M18.5 6a8 8 0 010 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 9v6h4l5 4V5L8 9z"/></svg>',
    mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h12M4 12h12M4 18h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 14v6l4-3z"/></svg>'
  };

  function nowHtml() {
    const list = tracks();
    const t = list[M.idx];
    if (!M.hasIds()) return `<span class="mb-label">2K13 SOUNDTRACK</span><span class="mb-song">${list.length} songs. Video IDs are being added.</span>`;
    if (M.failed) return `<span class="mb-label">SOUNDTRACK</span><span class="mb-song">The YouTube player could not load.</span>`;
    if (!M.started) return `<span class="mb-label">SOUNDTRACK</span><span class="mb-song">Click anywhere to start the music</span>`;
    return `<span class="mb-label">NOW PLAYING</span><span class="mb-song">${UI.esc(t ? t.title + ', ' + t.artist : '')}</span>`;
  }

  function controlsHtml() {
    const on = M.hasIds() && !M.failed ? '' : 'disabled';
    return `<button type="button" class="mb-btn" data-act="play" ${on} aria-label="${M.playing ? 'Pause' : 'Play'}">${M.playing ? ICON.pause : ICON.play}</button>
      <button type="button" class="mb-btn" data-act="next" ${on} aria-label="Next song">${ICON.next}</button>
      <button type="button" class="mb-btn" data-act="mute" ${on} aria-label="${M.muted ? 'Unmute' : 'Mute'}">${M.muted ? ICON.mute : ICON.vol}</button>
      <button type="button" class="mb-btn${M.open ? ' active' : ''}" data-act="list" aria-label="Tracklist" aria-expanded="${M.open ? 'true' : 'false'}">${ICON.list}</button>`;
  }

  function tracksHtml() {
    return tracks().map((s, i) => `<li class="${i === M.idx && M.started ? 'cur' : ''}${s.yt ? '' : ' noid'}"><button type="button" data-track="${i}" ${s.yt ? '' : 'disabled'}><span class="tn">${i + 1}</span><span class="tt">${UI.esc(s.title)}</span><span class="ta">${UI.esc(s.artist)}</span></button></li>`).join('');
  }

  // Built once, so the YouTube iframe inside it is never moved or recreated.
  function build() {
    const bar = document.getElementById('musicbar');
    bar.innerHTML = `
      <div class="mb-panel closed" id="mbPanel">
        <div class="mb-panel-head"><span>NBA 2K13 OFFICIAL SOUNDTRACK</span>${M.hasIds() ? '' : '<em>Video IDs are being added, so songs cannot play yet.</em>'}</div>
        <div class="mb-panel-body">
          <div class="mb-video" id="mbVideoWrap"${M.hasIds() ? '' : ' hidden'}><div id="mbVideo"></div></div>
          <ol class="mb-tracks" id="mbTracks"></ol>
        </div>
      </div>
      <div class="mb-row">
        <div class="mb-eq" id="mbEq" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="mb-now" id="mbNow"></div>
        <div class="mb-controls" id="mbControls"></div>
      </div>`;
  }

  function refresh() {
    const panel = document.getElementById('mbPanel');
    if (!panel) return;
    panel.classList.toggle('closed', !M.open);
    document.getElementById('mbEq').className = 'mb-eq' + (M.playing ? ' on' : '');
    document.getElementById('mbNow').innerHTML = nowHtml();
    document.getElementById('mbControls').innerHTML = controlsHtml();
    document.getElementById('mbTracks').innerHTML = tracksHtml();
  }

  function loadApi() {
    if (window.YT && window.YT.Player) return createPlayer();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () { if (prev) prev(); createPlayer(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { M.failed = true; refresh(); };
    document.head.appendChild(s);
  }

  function createPlayer() {
    const t = tracks()[M.idx];
    const holder = document.getElementById('mbVideo');
    if (!holder) return;
    M.player = new window.YT.Player(holder, {
      width: 200, height: 113,
      videoId: t && t.yt ? idFor(M.idx) : undefined,
      playerVars: { autoplay: 0, controls: 0, playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
      events: {
        onReady: () => {
          M.ready = true;
          if (M.muted) M.player.mute();
          if (M.pending) { M.pending = false; play(); }
        },
        onStateChange: e => {
          const YTS = window.YT.PlayerState;
          if (e.data === YTS.ENDED) next();
          else if (e.data === YTS.PLAYING) { M.playing = true; refresh(); }
          else if (e.data === YTS.PAUSED) { M.playing = false; refresh(); }
        },
        onError: () => {
          // Embedding blocked or video gone: try the backup ID once, then skip the song.
          const t = tracks()[M.idx];
          if (t && t.backup && !M.useBackup[M.idx]) {
            M.useBackup[M.idx] = true;
            M.player.loadVideoById(t.backup);
          } else next();
        }
      }
    });
  }

  function play() {
    if (!M.hasIds()) return;
    M.started = true;
    if (!tracks()[M.idx] || !tracks()[M.idx].yt) M.idx = nextPlayable(M.idx, 1);
    if (!M.ready) { M.pending = true; refresh(); return; }
    const t = tracks()[M.idx];
    const cur = M.player.getVideoData && M.player.getVideoData().video_id;
    if (cur !== idFor(M.idx)) M.player.loadVideoById(idFor(M.idx));
    else M.player.playVideo();
    M.playing = true;
    savePrefs();
    refresh();
  }
  function pause() {
    if (M.ready) M.player.pauseVideo();
    M.playing = false;
    refresh();
  }
  function next() {
    const n = nextPlayable(M.idx, 1);
    if (n < 0) return;
    M.idx = n;
    M.started = true;
    savePrefs();
    if (M.ready) { M.player.loadVideoById(idFor(n)); M.playing = true; }
    refresh();
  }
  function toggleMute() {
    M.muted = !M.muted;
    if (M.ready) { if (M.muted) M.player.mute(); else M.player.unMute(); }
    savePrefs();
    refresh();
  }
  M.playTrack = function (i) {
    if (!tracks()[i] || !tracks()[i].yt) return;
    M.idx = i;
    M.started = true;
    if (M.ready) { M.player.loadVideoById(idFor(i)); M.playing = true; } else M.pending = true;
    savePrefs();
    refresh();
  };

  M.init = function () {
    loadPrefs();
    if (!tracks()[M.idx]) M.idx = 0;
    build();
    refresh();
    const bar = document.getElementById('musicbar');
    bar.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const act = b.getAttribute('data-act');
      if (act === 'play') { if (M.playing) pause(); else play(); }
      else if (act === 'next') next();
      else if (act === 'mute') toggleMute();
      else if (act === 'list') { M.open = !M.open; refresh(); }
      else if (b.hasAttribute('data-track')) M.playTrack(Number(b.getAttribute('data-track')));
    });
    if (!M.hasIds()) return;
    loadApi();
    const starter = e => {
      if (e.target.closest && e.target.closest('.mb-controls, .mb-tracks')) return;
      document.removeEventListener('pointerdown', starter, true);
      if (!M.started) play();
    };
    document.addEventListener('pointerdown', starter, true);
  };
})();
