// Soundtrack bar: a persistent bottom bar that plays window.SOUNDTRACK. Two sources, picked with a
// toggle in the tracklist panel and remembered in localStorage:
//   spotify (default): Spotify embed through the Spotify iFrame API. No ads. Full songs when the
//     viewer is logged in to Spotify in this browser, 30 second previews otherwise.
//   youtube: YouTube IFrame API on youtube-nocookie.com. Full songs, but YouTube can show ads.
// Music starts on the first click anywhere (browsers block autoplay). Songs with no ID for the
// chosen source are skipped. With no IDs at all, the bar shows the tracklist instead.
(function () {
  'use strict';
  const UI = window.UI;
  const M = UI.music = { idx: 0, playing: false, muted: false, started: false, failed: false, src: 'spotify', open: false };
  const PREF = 'a13-music';
  const SOURCES = {
    spotify: { label: 'Spotify', note: 'No ads. Full songs if you are logged in to Spotify in this browser, 30 second previews if not.' },
    youtube: { label: 'YouTube', note: 'Full songs, but YouTube may play an ad before a song.' }
  };

  const tracks = () => (Array.isArray(window.SOUNDTRACK) ? window.SOUNDTRACK : []);
  // Which ID a track uses on the current source (YouTube falls back to the backup video once the primary fails).
  M.useBackup = {};
  const idFor = (i, src) => {
    const t = tracks()[i];
    if (!t) return null;
    if ((src || M.src) === 'spotify') return t.sp || null;
    return M.useBackup[i] && t.backup ? t.backup : (t.yt || null);
  };
  const playable = () => tracks().map((t, i) => (idFor(i) ? i : -1)).filter(i => i >= 0);
  M.hasIds = () => playable().length > 0;

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF) || '{}');
      M.muted = !!p.muted;
      if (Number.isInteger(p.idx)) M.idx = p.idx;
      if (SOURCES[p.src]) M.src = p.src;
    } catch (e) { /* ignore */ }
  }
  function savePrefs() {
    try { localStorage.setItem(PREF, JSON.stringify({ muted: M.muted, idx: M.idx, src: M.src })); } catch (e) { /* ignore */ }
  }

  function nextPlayable(from, step) {
    const list = tracks();
    for (let k = 1; k <= list.length; k++) {
      const i = ((from + step * k) % list.length + list.length) % list.length;
      if (idFor(i)) return i;
    }
    return -1;
  }

  // ---------- YouTube source (youtube-nocookie.com) ----------
  const YT = {
    player: null, ready: false, pending: false, failed: false, loading: false,
    load() {
      if (this.player || this.loading) return;
      this.loading = true;
      if (window.YT && window.YT.Player) return this.create();
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); this.create(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => { this.failed = true; refresh(); };
      document.head.appendChild(s);
    },
    create() {
      const holder = document.getElementById('mbVideo');
      if (!holder) return;
      this.player = new window.YT.Player(holder, {
        width: 200, height: 113,
        host: 'https://www.youtube-nocookie.com',
        videoId: idFor(M.idx, 'youtube') || undefined,
        playerVars: { autoplay: 0, controls: 0, playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
        events: {
          onReady: () => {
            this.ready = true;
            if (M.muted) this.player.mute();
            if (this.pending && M.src === 'youtube') { this.pending = false; this.start(M.idx); }
          },
          onStateChange: e => {
            if (M.src !== 'youtube') return;
            const S = window.YT.PlayerState;
            if (e.data === S.ENDED) next();
            else if (e.data === S.PLAYING) { M.playing = true; refresh(); }
            else if (e.data === S.PAUSED) { M.playing = false; refresh(); }
          },
          onError: () => {
            if (M.src !== 'youtube') return;
            // Embedding blocked or video gone: try the backup ID once, then skip the song.
            const t = tracks()[M.idx];
            if (t && t.backup && !M.useBackup[M.idx]) {
              M.useBackup[M.idx] = true;
              this.player.loadVideoById(t.backup);
            } else next();
          }
        }
      });
    },
    start(i) {
      if (!this.ready) { this.pending = true; this.load(); return; }
      const id = idFor(i, 'youtube');
      const cur = this.player.getVideoData && this.player.getVideoData().video_id;
      if (cur !== id) this.player.loadVideoById(id); else this.player.playVideo();
    },
    pause() { this.pending = false; if (this.ready) this.player.pauseVideo(); },
    setMuted(m) { if (this.ready) { if (m) this.player.mute(); else this.player.unMute(); } }
  };

  // ---------- Spotify source (Spotify iFrame API) ----------
  // The embed has no volume control, so muting pauses it (see toggleMute).
  const SP = {
    ctrl: null, ready: false, loading: false, failed: false, want: null, uri: null, last: null, live: false, kick: 0,
    load() {
      if (this.ctrl || this.loading) return;
      this.loading = true;
      const prev = window.onSpotifyIframeApiReady;
      window.onSpotifyIframeApiReady = api => { if (prev) prev(api); this.create(api); };
      const s = document.createElement('script');
      s.src = 'https://open.spotify.com/embed/iframe-api/v1';
      s.async = true;
      s.onerror = () => { this.failed = true; refresh(); };
      document.head.appendChild(s);
    },
    create(api) {
      const holder = document.getElementById('mbSpotify');
      if (!holder) return;
      const id = idFor(M.idx, 'spotify');
      this.uri = id ? 'spotify:track:' + id : null;
      api.createController(holder, { uri: this.uri || undefined, width: '100%', height: 80 }, ctrl => {
        this.ctrl = ctrl;
        ctrl.addListener('ready', () => {
          this.ready = true;
          if (this.want != null && M.src === 'spotify') this.go();
        });
        ctrl.addListener('playback_update', e => this.update(e && e.data));
      });
    },
    start(i) {
      this.want = i;
      if (!this.ready) { this.load(); return; }
      this.go();
    },
    // Controller calls can throw (or reject) while the embed is between songs, so they never break the page.
    call(name, arg) {
      try {
        const r = arg === undefined ? this.ctrl[name]() : this.ctrl[name](arg);
        if (r && typeof r.catch === 'function') r.catch(() => {});
      } catch (e) { /* ignore */ }
    },
    atEnd(d) { return !!d && d.duration > 0 && d.position >= d.duration - 400; },
    go() {
      const i = this.want;
      this.want = null;
      const id = idFor(i, 'spotify');
      if (!id) return;
      const uri = 'spotify:track:' + id;
      this.live = false;
      clearTimeout(this.kick);
      const last = this.last && this.last.playingURI === this.uri ? this.last : null;
      if (uri !== this.uri) {
        this.uri = uri;
        this.call('loadUri', uri);
      } else if (last && !last.isPaused && !this.atEnd(last)) {
        this.live = true;
        return;
      } else if (last && last.position > 0 && !this.atEnd(last)) {
        this.call('resume');
      } else {
        this.call('play');
      }
      // play() right after loadUri can be dropped while the embed loads, so ask again until it plays.
      let tries = 0;
      const kick = () => {
        if (this.live || !M.playing || M.src !== 'spotify' || this.uri !== uri || ++tries > 6) return;
        this.call('play');
        this.kick = setTimeout(kick, 900);
      };
      this.kick = setTimeout(kick, 400);
    },
    update(d) {
      if (!d) return;
      const prev = this.last;
      this.last = d;
      if (M.src !== 'spotify' || (d.playingURI && d.playingURI !== this.uri)) return;
      if (!d.isPaused) {
        // A finished song (or 30 second preview) can sit at its last position without reporting a pause.
        if (this.live && M.playing && this.atEnd(d)) { this.live = false; next(); return; }
        if (!this.atEnd(d)) this.live = true;
        if (!M.playing && this.live) { M.playing = true; M.started = true; refresh(); }
        return;
      }
      if (!this.live || d.isBuffering) return;
      // A song that was playing stopped: it either reached the end (position back at 0 or at the end) or the user paused it.
      const ended = d.position === 0 || this.atEnd(d);
      if (ended && prev && !prev.isPaused && M.playing) { this.live = false; next(); return; }
      if (M.playing && !ended) { M.playing = false; refresh(); }
    },
    pause() {
      this.want = null;
      clearTimeout(this.kick);
      if (this.ready && this.last && !this.last.isPaused) this.call('pause');
    }
  };

  const engine = () => (M.src === 'spotify' ? SP : YT);
  const srcFailed = () => engine().failed;

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
    if (!M.hasIds()) return `<span class="mb-label">2K13 SOUNDTRACK</span><span class="mb-song">${list.length} songs. Song IDs are being added.</span>`;
    if (srcFailed()) return `<span class="mb-label">SOUNDTRACK</span><span class="mb-song">The ${SOURCES[M.src].label} player could not load. Try the other source in the tracklist.</span>`;
    if (!M.started) return `<span class="mb-label">SOUNDTRACK</span><span class="mb-song">Click anywhere to start the music</span>`;
    return `<span class="mb-label">NOW PLAYING</span><span class="mb-song">${UI.esc(t ? t.title + ', ' + t.artist : '')}</span>`;
  }

  function controlsHtml() {
    const on = M.hasIds() && !srcFailed() ? '' : 'disabled';
    const muteLabel = M.muted ? 'Unmute' : (M.src === 'spotify' ? 'Mute (pauses Spotify)' : 'Mute');
    return `<button type="button" class="mb-btn" data-act="play" ${on} aria-label="${M.playing ? 'Pause' : 'Play'}">${M.playing ? ICON.pause : ICON.play}</button>
      <button type="button" class="mb-btn" data-act="next" ${on} aria-label="Next song">${ICON.next}</button>
      <button type="button" class="mb-btn" data-act="mute" ${on} aria-label="${muteLabel}" title="${muteLabel}">${M.muted ? ICON.mute : ICON.vol}</button>
      <button type="button" class="mb-btn${M.open ? ' active' : ''}" data-act="list" aria-label="Tracklist" aria-expanded="${M.open ? 'true' : 'false'}">${ICON.list}</button>`;
  }

  function tracksHtml() {
    return tracks().map((s, i) => {
      const ok = !!idFor(i);
      return `<li class="${i === M.idx && M.started ? 'cur' : ''}${ok ? '' : ' noid'}"><button type="button" data-track="${i}" ${ok ? '' : 'disabled'}><span class="tn">${i + 1}</span><span class="tt">${UI.esc(s.title)}</span><span class="ta">${UI.esc(s.artist)}</span></button></li>`;
    }).join('');
  }

  function srcHtml() {
    return Object.keys(SOURCES).map(k => `<button type="button" class="mb-src-btn${k === M.src ? ' on' : ''}" data-src="${k}" aria-pressed="${k === M.src ? 'true' : 'false'}">${SOURCES[k].label}</button>`).join('');
  }

  function addStyles() {
    if (document.getElementById('mbSrcStyle')) return;
    const st = document.createElement('style');
    st.id = 'mbSrcStyle';
    st.textContent = `
      .mb-src { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-family: var(--body); letter-spacing: 0; }
      .mb-src > span { color: var(--muted); font-size: 12px; margin-right: 2px; }
      .mb-src-btn { padding: 4px 12px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; background: transparent; color: var(--text2); border: 1px solid var(--line); border-radius: 999px; cursor: pointer; }
      .mb-src-btn:hover { border-color: var(--gold-dim); color: var(--gold2); }
      .mb-src-btn.on { background: var(--gold); border-color: var(--gold); color: #000; font-weight: 600; }
      .mb-src-note { display: block; margin-top: 6px; font-family: var(--body); letter-spacing: 0; color: var(--text2); font-size: 12px; }
      .mb-spotify { padding: 4px 4px 10px; }
      .mb-spotify[hidden] { display: none; }
      .mb-spotify iframe { display: block; border: 0; width: 100%; border-radius: 12px; }`;
    document.head.appendChild(st);
  }

  // Built once, so the player iframes inside it are never moved or recreated.
  function build() {
    addStyles();
    const bar = document.getElementById('musicbar');
    bar.innerHTML = `
      <div class="mb-panel closed" id="mbPanel">
        <div class="mb-panel-head"><span>NBA 2K13 OFFICIAL SOUNDTRACK</span>${M.hasIds() ? '' : '<em>Song IDs are being added, so songs cannot play yet.</em>'}
          <div class="mb-src" id="mbSrc" role="group" aria-label="Music source"></div>
          <span class="mb-src-note" id="mbSrcNote"></span>
        </div>
        <div class="mb-panel-body">
          <div class="mb-spotify" id="mbSpotifyWrap" hidden><div id="mbSpotify"></div></div>
          <div class="mb-video" id="mbVideoWrap" hidden><div id="mbVideo"></div></div>
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
    document.getElementById('mbSrc').innerHTML = '<span>Source</span>' + srcHtml();
    document.getElementById('mbSrcNote').textContent = SOURCES[M.src].note;
    const has = M.hasIds();
    document.getElementById('mbSpotifyWrap').hidden = !(has && M.src === 'spotify');
    document.getElementById('mbVideoWrap').hidden = !(has && M.src === 'youtube');
  }

  function play() {
    if (!M.hasIds()) return;
    M.started = true;
    if (!idFor(M.idx)) M.idx = nextPlayable(M.idx, 1);
    if (M.muted && M.src === 'spotify') M.muted = false; // Spotify cannot play muted, so pressing play unmutes
    M.playing = true;
    engine().start(M.idx);
    savePrefs();
    refresh();
  }
  function pause() {
    engine().pause();
    M.playing = false;
    refresh();
  }
  function next() {
    const n = nextPlayable(M.idx, 1);
    if (n < 0) return;
    M.idx = n;
    M.started = true;
    M.playing = true;
    savePrefs();
    engine().start(n);
    refresh();
  }
  function toggleMute() {
    M.muted = !M.muted;
    if (M.src === 'spotify') {
      // The Spotify embed has no volume control: mute pauses, unmute picks the song back up.
      if (M.muted) { M.resumeAfterMute = M.playing; SP.pause(); M.playing = false; }
      else if (M.resumeAfterMute) { M.resumeAfterMute = false; M.playing = true; SP.start(M.idx); }
    } else YT.setMuted(M.muted);
    savePrefs();
    refresh();
  }
  function setSource(src) {
    if (!SOURCES[src] || src === M.src) return;
    const was = M.playing;
    engine().pause();
    M.playing = false;
    M.src = src;
    if (!idFor(M.idx)) M.idx = Math.max(0, nextPlayable(M.idx, 1));
    savePrefs();
    engine().load();
    if (was) play(); else refresh();
  }
  M.setSource = setSource;
  // For tests and debugging: what the active player last reported.
  M.status = () => ({ src: M.src, idx: M.idx, playing: M.playing, spotify: SP.last, spotifyReady: SP.ready, youtubeReady: YT.ready,
    youtubeState: YT.ready && YT.player.getPlayerState ? YT.player.getPlayerState() : null });
  M.playTrack = function (i) {
    if (!idFor(i)) return;
    M.idx = i;
    M.started = true;
    M.playing = true;
    if (M.muted && M.src === 'spotify') M.muted = false;
    engine().start(i);
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
      else if (b.hasAttribute('data-src')) setSource(b.getAttribute('data-src'));
      else if (b.hasAttribute('data-track')) M.playTrack(Number(b.getAttribute('data-track')));
    });
    if (!M.hasIds()) return;
    engine().load();
    const starter = e => {
      if (e.target.closest && e.target.closest('.mb-controls, .mb-tracks, .mb-src')) return;
      document.removeEventListener('pointerdown', starter, true);
      if (!M.started && !(M.muted && M.src === 'spotify')) play();
    };
    document.addEventListener('pointerdown', starter, true);
  };
})();
