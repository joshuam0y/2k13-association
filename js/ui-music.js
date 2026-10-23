// Soundtrack bar: a persistent bottom bar that plays window.SOUNDTRACK. Two sources:
//   spotify: Spotify embed through the Spotify iFrame API. No ads. Full songs only when the viewer is
//     logged in to Spotify in this browser. Logged out, the embed reports a 30 second preview.
//   youtube: YouTube IFrame API on youtube-nocookie.com. Full songs, but YouTube can show ads.
// Spotify is tried first. Its first playback_update reports the track duration: under 35 seconds means
// a logged-out preview, so the bar switches to YouTube for the rest of the session and remembers that
// in localStorage. A full-length duration keeps Spotify. The toggle in the tracklist panel lets the
// viewer pick either source by hand. Songs auto-advance when they end on either source.
// Music starts on the first click anywhere (browsers block autoplay). Songs with no ID for the
// chosen source are skipped. With no IDs at all, the bar shows the tracklist instead.
(function () {
  'use strict';
  const UI = window.UI;
  const M = UI.music = { idx: 0, playing: false, muted: false, started: false, src: 'spotify', open: false,
    switched: null, manual: false, spotifyPreview: false };
  const PREF = 'a13-music';
  const PREVIEW_MS = 35000; // Spotify previews are about 30 seconds. Every soundtrack song is far longer.
  const SOURCES = {
    spotify: { label: 'Spotify (full songs if logged in)', note: 'No ads. Full songs when you are logged in to Spotify in this browser, 30 second previews when you are not.' },
    youtube: { label: 'YouTube (full songs, may show ads)', note: 'Full songs. YouTube may play an ad before some songs.' }
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
      if (p.switched === 'preview' && M.src === 'youtube') M.switched = 'preview';
    } catch (e) { /* ignore */ }
  }
  function savePrefs() {
    try {
      localStorage.setItem(PREF, JSON.stringify({ muted: M.muted, idx: M.idx, src: M.src, switched: M.src === 'youtube' ? M.switched : null }));
    } catch (e) { /* ignore */ }
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
        width: 240, height: 135,
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
            if (e.data === S.ENDED) { if (M.playing) next(); }
            else if (e.data === S.PLAYING) { if (!M.playing) { M.playing = true; refresh(); } }
            else if (e.data === S.PAUSED) { if (M.playing) { M.playing = false; refresh(); } }
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
    ctrl: null, ready: false, loading: false, failed: false, want: null, uri: null, last: null, live: false, kick: 0, watch: 0,
    load() {
      if (this.ctrl || this.loading) return;
      this.loading = true;
      const prev = window.onSpotifyIframeApiReady;
      window.onSpotifyIframeApiReady = api => { if (prev) prev(api); this.create(api); };
      const s = document.createElement('script');
      s.src = 'https://open.spotify.com/embed/iframe-api/v1';
      s.async = true;
      s.onerror = () => { this.failed = true; useYoutube('failed'); refresh(); };
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
      // If Spotify never reports back (blocked by an extension, slow network), fall back to YouTube.
      clearTimeout(this.watch);
      this.watch = setTimeout(() => { if (M.src === 'spotify' && M.playing && !this.last && !M.manual) useYoutube('failed'); }, 9000);
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
      // A logged-out embed reports the preview length (about 30 seconds) as the duration, even before playing.
      if (d.duration > 0) {
        const preview = d.duration < PREVIEW_MS;
        if (preview && !M.manual) { M.spotifyPreview = true; useYoutube('preview'); return; }
        if (preview !== M.spotifyPreview) { M.spotifyPreview = preview; refresh(); }
      }
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
      clearTimeout(this.watch);
      if (this.ready && this.last && !this.last.isPaused) this.call('pause');
    }
  };

  const engine = () => (M.src === 'spotify' ? SP : YT);
  const srcFailed = () => engine().failed;

  // Automatic switch from Spotify to YouTube: a logged-out preview, or a Spotify player that did not load.
  function useYoutube(why) {
    if (M.src !== 'spotify' || M.manual) return;
    const was = M.playing;
    SP.pause();
    M.src = 'youtube';
    M.switched = why;
    if (!idFor(M.idx)) M.idx = Math.max(0, nextPlayable(M.idx, 1));
    savePrefs();
    YT.load();
    if (was) { M.playing = true; YT.start(M.idx); }
    refresh();
  }

  const ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L9.5 12 18 18zM6 6h2v12H6z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l8.5 6L6 18zM16 6h2v12h-2z"/></svg>',
    vol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zM16 8.5a4.5 4.5 0 010 7M18.5 6a8 8 0 010 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 9v6h4l5 4V5L8 9z"/></svg>',
    mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h12M4 12h12M4 18h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 14v6l4-3z"/></svg>'
  };

  function nowHtml() {
    const list = tracks();
    const t = list[M.idx];
    if (!M.hasIds()) return `<span class="mb-label">2K13 SOUNDTRACK</span><span class="mb-song">${list.length} songs. Song IDs are being added.</span>`;
    if (srcFailed()) return `<span class="mb-label">SOUNDTRACK</span><span class="mb-song">The ${M.src === 'spotify' ? 'Spotify' : 'YouTube'} player could not load. Try the other source in the tracklist.</span>`;
    if (!M.started) return `<span class="mb-label">SOUNDTRACK</span><span class="mb-song">Click anywhere to start the music</span>`;
    return `<span class="mb-label">NOW PLAYING</span><span class="mb-song">${UI.esc(t ? t.title + ', ' + t.artist : '')}</span>`;
  }

  function controlsHtml() {
    const on = M.hasIds() && !srcFailed() ? '' : 'disabled';
    const muteLabel = M.muted ? 'Unmute' : (M.src === 'spotify' ? 'Mute (pauses Spotify)' : 'Mute');
    return `<button type="button" class="mb-btn" data-act="prev" ${on} aria-label="Previous song" title="Previous song">${ICON.prev}</button>
      <button type="button" class="mb-btn" data-act="play" ${on} aria-label="${M.playing ? 'Pause' : 'Play'}">${M.playing ? ICON.pause : ICON.play}</button>
      <button type="button" class="mb-btn" data-act="next" ${on} aria-label="Next song" title="Next song">${ICON.next}</button>
      <button type="button" class="mb-btn" data-act="mute" ${on} aria-label="${muteLabel}" title="${muteLabel}">${M.muted ? ICON.mute : ICON.vol}</button>
      <button type="button" class="mb-btn${M.open ? ' active' : ''}" data-act="list" aria-label="Tracklist and music source" title="Tracklist and music source" aria-expanded="${M.open ? 'true' : 'false'}">${ICON.list}</button>`;
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

  function noteText() {
    if (M.src === 'youtube' && M.switched === 'preview') return 'Spotify only plays 30 second previews when you are not logged in to Spotify in this browser, so the music switched to YouTube for full songs. YouTube may play an ad before some songs.';
    if (M.src === 'youtube' && M.switched === 'failed') return 'The Spotify player did not load, so the music switched to YouTube for full songs. YouTube may play an ad before some songs.';
    if (M.src === 'spotify' && M.spotifyPreview) return 'Spotify is playing 30 second previews because you are not logged in to Spotify in this browser. Log in at open.spotify.com and reload for full songs, or pick YouTube.';
    return SOURCES[M.src].note;
  }

  function addStyles() {
    if (document.getElementById('mbSrcStyle')) return;
    const st = document.createElement('style');
    st.id = 'mbSrcStyle';
    st.textContent = `
      .mb-src { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; font-family: var(--body); letter-spacing: 0; }
      .mb-src > span { color: var(--muted); font-size: 12px; margin-right: 2px; }
      .mb-src-btn { padding: 5px 12px; font-size: 12px; letter-spacing: 0; background: transparent; color: var(--text2); border: 1px solid var(--line); border-radius: 999px; cursor: pointer; }
      .mb-src-btn:hover { border-color: var(--gold-dim); color: var(--gold2); }
      .mb-src-btn.on { background: var(--gold); border-color: var(--gold); color: #000; font-weight: 600; }
      .mb-src-note { display: block; margin-top: 6px; font-family: var(--body); letter-spacing: 0; color: var(--text2); font-size: 12px; line-height: 1.45; }
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
    document.getElementById('mbSrcNote').textContent = noteText();
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
  function step(dir) {
    const n = nextPlayable(M.idx, dir);
    if (n < 0) return;
    M.idx = n;
    M.started = true;
    M.playing = true;
    if (M.muted && M.src === 'spotify') M.muted = false;
    savePrefs();
    engine().start(n);
    refresh();
  }
  const next = () => step(1);
  const prev = () => step(-1);
  M.next = next;
  M.prev = prev;
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
  // A source picked by hand is kept for this session, even a logged-out Spotify preview.
  function setSource(src) {
    if (!SOURCES[src] || src === M.src) return;
    const was = M.playing;
    engine().pause();
    M.playing = false;
    M.src = src;
    M.manual = true;
    M.switched = null;
    if (!idFor(M.idx)) M.idx = Math.max(0, nextPlayable(M.idx, 1));
    savePrefs();
    engine().load();
    if (was) play(); else refresh();
  }
  M.setSource = setSource;
  // For tests and debugging: what the active player last reported.
  M.status = () => ({ src: M.src, idx: M.idx, playing: M.playing, switched: M.switched, manual: M.manual, spotifyPreview: M.spotifyPreview,
    spotify: SP.last, spotifyReady: SP.ready, youtubeReady: YT.ready,
    youtubeState: YT.ready && YT.player.getPlayerState ? YT.player.getPlayerState() : null,
    youtubeTime: YT.ready && YT.player.getCurrentTime ? YT.player.getCurrentTime() : null,
    youtubeDuration: YT.ready && YT.player.getDuration ? YT.player.getDuration() : null,
    youtubeId: YT.ready && YT.player.getVideoData ? YT.player.getVideoData().video_id : null });
  M.youtubePlayer = () => (YT.ready ? YT.player : null);
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

  // Layout: the bar is fixed to the bottom, so the page keeps that much room free. Its real height
  // goes to the CSS variable --mb-h (body padding, sticky confirm bars, the phone More menu use it),
  // and a dropdown or popup opened behind the bar is scrolled up so its buttons stay above it.
  function keepClear(bar) {
    const root = document.documentElement;
    const row = () => bar.querySelector('.mb-row') || bar;
    const sync = () => {
      const h = bar.hidden || getComputedStyle(bar).display === 'none' ? 0 : Math.ceil(row().getBoundingClientRect().height);
      root.style.setProperty('--mb-h', h + 'px');
    };
    sync();
    if (typeof ResizeObserver === 'function') new ResizeObserver(sync).observe(row());
    window.addEventListener('resize', sync);
    // a <details> dropdown in the page (SIM TO... and the like) opened near the bottom of the screen
    const lift = el => {
      if (!el || !el.getBoundingClientRect || el.closest('#musicbar') || getComputedStyle(el).position === 'fixed') return;
      const r = el.getBoundingClientRect(), top = bar.getBoundingClientRect().top;
      if (r.bottom > top - 8 && r.height < top - 80) window.scrollBy({ top: r.bottom - top + 16, behavior: 'smooth' });
    };
    document.addEventListener('toggle', e => {
      const d = e.target;
      if (!d || d.tagName !== 'DETAILS' || !d.open) return;
      requestAnimationFrame(() => lift(d));
    }, true);
  }

  M.init = function () {
    loadPrefs();
    if (!tracks()[M.idx]) M.idx = 0;
    build();
    refresh();
    const bar = document.getElementById('musicbar');
    keepClear(bar);
    bar.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const act = b.getAttribute('data-act');
      if (act === 'play') { if (M.playing) pause(); else play(); }
      else if (act === 'next') next();
      else if (act === 'prev') prev();
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
