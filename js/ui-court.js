// Court view: a top-down court that plays a game's play-by-play with the ten players as dots and the ball.
// The events, scorers, lineups and score come straight from the engine's structured play-by-play
// (res.pbx and res.pbl, see packPbx in js/engine.js); only where the players stand is made up.
// Used by the live game page (js/ui-live.js) and the replay page (#/watch/<gameId>, from a box score).
// The pure part (COURT.timeline, COURT.linesAt) also runs under Node for tools/test-court.js.
(function (root) {
  'use strict';
  const ENG = () => root.ENGINE || null;

  // =====================================================================
  // Timeline: one event per pbp line, with the score and the ten on the floor
  // =====================================================================
  const KINDS = ['note', 'tip', 'end', 'final', 'make', 'miss', 'sfoul', 'ft', 'oreb', 'dreb', 'tov', 'pf', 'foulout', 'inj', 'sub'];
  const SHOTS = ['close', 'post', 'mid', 'three'];
  const TOVS = ['plain', 'steal', 'foul'];
  const LINE = /^(Q\d|OT\d+) (\d+):(\d\d) (?:([A-Z][A-Z0-9]{1,3}) )?(.*?)(?: \((\d+)-(\d+)\))?$/;
  const SIDES = ['home', 'away'];
  const other = s => (s === 'home' ? 'away' : 'home');
  const keyOf = (side, i) => (side === 'home' ? 'h' : 'a') + i;
  const sideOf = key => (key[0] === 'h' ? 'home' : 'away');
  const idxOf = key => +key.slice(1);
  function bitsOf(mask) {
    const out = [];
    for (let i = 0; mask > 0; i++) { if (mask % 2) out.push(i); mask = Math.floor(mask / 2); }
    return out;
  }
  function periodIndex(p) { return p[0] === 'Q' ? Number(p.slice(1)) - 1 : 3 + Number(p.slice(2)); }
  function periodStart(p) { const i = periodIndex(p); return i < 4 ? i * 720 : 2880 + (i - 4) * 300; }
  function periodLength(p) { return periodIndex(p) < 4 ? 720 : 300; }

  // A stored or fresh game result has what the court needs.
  function available(game) {
    const E = ENG();
    return !!(game && Array.isArray(game.pbp) && Array.isArray(game.pbx) && game.pbx.length === game.pbp.length &&
      Array.isArray(game.pbl) && game.pbl.length && game.home && game.away && E && typeof E.unpackPbx === 'function');
  }

  // Returns { home, away, events } or null. Each event:
  // { i, k (KINDS), side ('home'/'away', the team the line is about; for a tip the team that wins it), team, per, clock,
  //   t (seconds played), body, text, a, b, c (player keys 'h3' / 'a0', see packPbx for who is who), shot, made, att, tov,
  //   pts (scored on this line), hs, as (score after it), ts (score printed on the line, if any), on: { home, away } keys,
  //   stats: [[key, 'pts' | 'reb' | 'ast', n]] }
  function timeline(game) {
    if (!available(game)) return null;
    const E = ENG();
    const pbl = game.pbl;
    const events = [];
    let hs = 0, as = 0, li = 0, on = null, per = 'Q1', clock = '12:00', t = 0;
    const lineup = row => ({ home: bitsOf(row[1]).map(i => keyOf('home', i)), away: bitsOf(row[2]).map(i => keyOf('away', i)) });
    game.pbp.forEach((line, i) => {
      while (li + 1 < pbl.length && pbl[li + 1][0] <= i) { li++; on = null; }
      if (!on) on = lineup(pbl[li]);
      const m = LINE.exec(String(line));
      if (m) {
        per = m[1]; clock = m[2] + ':' + m[3];
        t = periodStart(per) + periodLength(per) - (+m[2] * 60 + +m[3]);
      }
      const u = E.unpackPbx(game.pbx[i]);
      const k = KINDS[u.k] || 'note';
      const side = SIDES[u.side];
      const mine = j => (j >= 0 ? keyOf(side, j) : null);
      const theirs = j => (j >= 0 ? keyOf(other(side), j) : null);
      const ev = { i, k, side: null, team: m && m[4] ? m[4] : null, per, clock, t, body: m ? m[5] : String(line), text: String(line),
        a: null, b: null, c: null, pts: 0, hs: 0, as: 0, ts: m && m[6] != null ? { as: +m[6], hs: +m[7] } : null, on, stats: [] };
      if (k !== 'note' && k !== 'end' && k !== 'final') { ev.side = side; ev.a = mine(u.a); }
      if (k === 'make') {
        ev.b = mine(u.b); ev.c = theirs(u.c); ev.shot = SHOTS[u.x] || 'close';
        ev.pts = ev.shot === 'three' ? 3 : 2;
        if (ev.a) ev.stats.push([ev.a, 'pts', ev.pts]);
        if (ev.b) ev.stats.push([ev.b, 'ast', 1]);
      } else if (k === 'miss' || k === 'sfoul') {
        ev.b = theirs(u.b); ev.shot = SHOTS[u.x] || 'close';
      } else if (k === 'ft') {
        ev.made = Math.floor(u.x / 4); ev.att = u.x % 4; ev.pts = ev.made;
        if (ev.a && ev.made) ev.stats.push([ev.a, 'pts', ev.made]);
      } else if (k === 'oreb' || k === 'dreb') {
        if (ev.a) ev.stats.push([ev.a, 'reb', 1]);
      } else if (k === 'tov') {
        ev.b = theirs(u.b); ev.tov = TOVS[u.x] || 'plain';
      }
      if (ev.pts) { if (side === 'home') hs += ev.pts; else as += ev.pts; }
      ev.hs = hs; ev.as = as;
      events.push(ev);
    });
    return { home: game.home.abbr, away: game.away.abbr, events };
  }

  // Points, rebounds and assists of every player after the first n events: { key: { pts, reb, ast } }.
  function linesAt(tl, n) {
    const out = {};
    const evs = (tl && tl.events) || [];
    for (let i = 0; i < Math.min(n, evs.length); i++) {
      evs[i].stats.forEach(([key, st, v]) => {
        const row = out[key] || (out[key] = { pts: 0, reb: 0, ast: 0 });
        row[st] += v;
      });
    }
    return out;
  }

  const COURT = { KINDS, timeline, linesAt, available, keyOf, sideOf, idxOf, bitsOf };
  root.COURT = COURT;
  if (typeof module !== 'undefined' && module.exports) module.exports = COURT;

  // =====================================================================
  // The view (browser only)
  // =====================================================================
  const UI = root.UI;
  if (!UI || typeof document === 'undefined') return;
  const esc = UI.esc;

  // Court coordinates are feet: x along the length (0 to 94), y across (0 to 50). Home attacks the
  // right basket in the first half and the left one after halftime.
  const CW = 94, CH = 50, M = 3, HOOP = 5.25;
  const V_WIN = 66;            // phones show the court upright, this many feet at a time; the camera follows the ball
  const NARROW = 560;          // container width below which the court stands upright
  const R_DOT = 2.1, R_HIT = 3.6;
  const HAND = [1.8, 1.1];     // where a player holds the ball, from the middle of his dot
  const POSR = { PG: 0, G: 0.5, SG: 1, GF: 1.5, SF: 2, F: 2.5, PF: 3, FC: 3.5, C: 4 };
  const OFF_SPOTS = [[27, 25], [21, 42], [21, 8], [15, 34], [7, 18]];   // [feet from the attacked baseline, y] by position
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const ease = p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  const lastName = n => { const parts = String(n || '').trim().split(/\s+/); return parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || ''; };
  const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
  let uid = 0;

  function lum(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return 0.2;
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const ch = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  // Home wears white with the team color, away wears the team color (bright enough to see on the dark floor).
  function kits(home, away, teamOf) {
    const cols = abbr => { const t = (teamOf || UI.team)(abbr) || {}; return (t.colors && t.colors.length ? t.colors : ['#555', '#999']).concat(['#555', '#999']); };
    const hc = cols(home), ac = cols(away);
    const ink = [hc[0], hc[1]].find(c => lum(c) < 0.4) || '#1a1a1a';
    const fill = [ac[0], ac[1]].find(c => lum(c) > 0.05 && lum(c) < 0.7) || '#6d6d75';
    return {
      home: { fill: '#f4f1e8', ring: ink, text: ink, paint: hc[0] },
      away: { fill, ring: '#ffffff', text: lum(fill) > 0.45 ? '#111111' : '#ffffff' }
    };
  }

  // Lines of the floor, drawn in court coordinates.
  function floorSvg(id, paint, paint2, abHome, abAway) {
    const half = (col, ab) => `
      <rect class="ct-paint" x="0" y="17" width="19" height="16" fill="${esc(col)}"/>
      <text class="ct-end" x="-0.9" y="25" transform="rotate(-90 -0.9 25)">${esc(ab || '')}</text>
      <rect class="ct-ln" x="0" y="17" width="19" height="16"/>
      <path class="ct-ln" d="M19 19 A6 6 0 0 1 19 31"/>
      <path class="ct-ln ct-dash" d="M19 19 A6 6 0 0 0 19 31"/>
      <path class="ct-ln" d="M5.25 21 A4 4 0 0 1 5.25 29"/>
      <path class="ct-ln" d="M0 3 H14.2 A23.75 23.75 0 0 1 14.2 47 H0"/>
      ${[7, 11, 14].map(x => `<path class="ct-ln" d="M${x} 17 V16.3 M${x} 33 V33.7"/>`).join('')}
      <path class="ct-board" d="M4 22 V28"/>
      <circle class="ct-rim" cx="5.25" cy="25" r="0.75"/>`;
    return `
      <defs><pattern id="ctWood${id}" width="94" height="2.5" patternUnits="userSpaceOnUse">
        <rect width="94" height="2.5" class="ct-plank"/><rect width="94" height="2.5" class="ct-plank2" y="0" opacity=".5"/><path d="M0 2.45 H94" class="ct-seam"/></pattern>
        <radialGradient id="ctGloss${id}" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs>
      <rect x="${-M}" y="${-M}" width="${CW + 2 * M}" height="${CH + 2 * M}" class="ct-apron"/>
      <rect x="0" y="0" width="${CW}" height="${CH}" fill="url(#ctWood${id})"/>
      <rect x="0" y="0" width="${CW}" height="${CH}" class="ct-ln ct-edge"/>
      <path class="ct-ln" d="M47 0 V50"/>
      <circle class="ct-ln" cx="47" cy="25" r="6"/><circle class="ct-ln" cx="47" cy="25" r="2"/>
      <circle class="ct-mid-fill" cx="47" cy="25" r="6" fill="${esc(paint)}"/>
      ${half(paint, abHome)}
      <g transform="translate(94 0) scale(-1 1)">${half(paint2, abAway)}</g>
      <rect x="0" y="0" width="${CW}" height="${CH}" fill="url(#ctGloss${id})" pointer-events="none"/>`;
  }

  // ---------- mount ----------
  // opts: { game (result with pbp, pbx, pbl), start (event index to start from), autoplay, onStep(i), onEnd(),
  //   team(abbr), player(id), logo(abbr, size): lookups for games outside the save (the Draft Challenge) }
  COURT.mount = function (el, opts) {
    opts = opts || {};
    const logoOf = opts.logo || UI.logo, playerOf = opts.player || UI.player;
    const tl = timeline(opts.game);
    if (!tl) { el.innerHTML = '<p class="muted">The court view needs the play-by-play of this game, which is not kept.</p>'; return null; }
    const game = opts.game;
    const evs = tl.events;
    const id = ++uid;
    const kit = kits(tl.home, tl.away, opts.team);
    const abbr = { home: tl.home, away: tl.away };
    const info = {};
    SIDES.forEach(side => (game[side].box || []).forEach((r, i) => {
      const p = playerOf ? playerOf(r.id) : null;
      const name = r.name || (p && p.name) || r.id;
      const pos = String((p && p.pos) || 'SF').toUpperCase().split(/[-\/ ,]/)[0];
      info[keyOf(side, i)] = { id: r.id, name, pos, ini: initials(name), last: lastName(name), side };
    }));
    const start = clamp(opts.start | 0, 0, evs.length);
    const st = {
      cur: start, done: start, ev: null, beats: [], beat: null, bt: 0, evDur: 0, evT: 0, tPrev: start ? evs[start - 1].t : 0,
      on: { home: [], away: [] }, pos: {}, alpha: {}, ball: { x: 47, y: 25, z: 0 }, holder: null, ph: null,
      off: null, set: false, form: null, hs: 0, as: 0, per: 'Q1', clock: '12:00', shownT: 0,
      playing: opts.autoplay !== false, speed: 1, tab: 'box', pnl: null, holdAt: null, ended: false, tags: [], sel: null, mode: null, camY: 0, raf: 0, last: 0, dead: false
    };
    if (start > 0) { const p = evs[start - 1]; st.hs = p.hs; st.as = p.as; st.per = p.per; st.shownT = p.t; }

    el.innerHTML = `
      <div class="ct-wrap">
        <div class="ct-strip">
          <div class="ct-tm">${logoOf(tl.away, 26)}<b>${esc(tl.away)}</b><span class="ct-pts" data-s="away">0</span></div>
          <div class="ct-clk"><b class="ct-per">Q1</b><span class="ct-time">12:00</span></div>
          <div class="ct-tm ct-tm-h"><span class="ct-pts" data-s="home">0</span><b>${esc(tl.home)}</b>${logoOf(tl.home, 26)}</div>
        </div>
        <div class="ct-stage">
          <svg class="ct-svg" role="img" aria-label="Court view of the game" preserveAspectRatio="xMidYMid meet"></svg>
          <div class="ct-banner" hidden></div>
          <div class="ct-sub" hidden></div>
        </div>
        <div class="ct-card"></div>
        <div class="ct-line"><span class="ct-lt"></span><span class="ct-lx">Tip-off coming up</span></div>
        <div class="ct-ctrl">
          <button type="button" class="btn btn-small ct-play" aria-label="Pause">PAUSE</button>
          ${[1, 2, 4].map(s => `<button type="button" class="btn btn-small ct-spd${s === 1 ? ' on' : ''}" data-speed="${s}">${s}X</button>`).join('')}
          <button type="button" class="btn btn-small ct-skip" aria-label="Skip to the end of the quarter">SKIP QTR</button>
          <button type="button" class="btn btn-small ct-pb" aria-label="Box score and plays">BOX / PLAYS</button>
          <button type="button" class="btn btn-small ct-fs" aria-label="Full screen">FULL SCREEN</button>
          ${window.MUSICBAR ? '<button type="button" class="btn btn-small ct-mus" aria-label="Music bar"></button>' : ''}
          ${window.SFX ? `<button type="button" class="btn btn-small ct-sfx${window.SFX.on ? ' on' : ''}" aria-label="Sound effects">${window.SFX.on ? 'SOUND ON' : 'SOUND OFF'}</button>` : ''}
        </div>
        <div class="ct-floor-list" aria-label="On the floor"></div>
        <div class="ct-pnl" hidden><div class="ct-ptabs"><button type="button" class="ct-ptab on" data-tab="box">BOX SCORE</button><button type="button" class="ct-ptab" data-tab="feed">PLAYS</button></div><div class="ct-pbody"></div></div>
      </div>`;
    const $ = sel => el.querySelector(sel);
    // full screen watch mode: the score, the court, the play, the controls and the five-a-side chips on one screen, no scrolling
    const FSKEY = 'a13-ct-full';
    let full = opts.full != null ? !!opts.full : (() => { try { return localStorage.getItem(FSKEY) !== '0'; } catch (e) { return true; } })();
    const narrow = () => (full ? window.innerWidth < NARROW || window.innerHeight > window.innerWidth * 1.15 : !!(el.clientWidth && el.clientWidth < NARROW));
    const wrapEl = $('.ct-wrap');
    const applyFull = () => {
      wrapEl.classList.toggle('ct-full', full);
      document.body.classList.toggle('ct-full-on', full);
      const fb = $('.ct-fs'); if (fb) fb.textContent = full ? 'EXIT FULL SCREEN' : 'FULL SCREEN';
      fitH();
      pnlShow(!full);   // the box score sits under the court on the page, and opens over it in full screen when asked for
    };
    // the height you can really see (phone browsers with a toolbar: 100vh is taller than the screen, the bottom would be cut off)
    const fitH = () => { const h = full ? Math.round((window.visualViewport && window.visualViewport.height) || window.innerHeight) : 0; wrapEl.style.height = h ? h + 'px' : ''; };
    window.addEventListener('resize', fitH);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', fitH);
    const syncMus = () => { const b = $('.ct-mus'); if (b && window.MUSICBAR) b.textContent = window.MUSICBAR.hidden() ? 'SHOW MUSIC' : 'HIDE MUSIC'; };
    const svg = $('.ct-svg');
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs, parent) => {
      const n = document.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(k => n.setAttribute(k, attrs[k]));
      if (parent) parent.appendChild(n);
      return n;
    };
    let dots = {}, ballEl = null, shadowEl = null, tagLayer = null;

    // ---------- drawing ----------
    function toScreen(x, y) { return st.mode === 'v' ? [CH - y + M, x + M] : [x + M, y + M]; }
    function build() {
      st.mode = narrow() ? 'v' : 'h';
      const v = st.mode === 'v';
      svg.setAttribute('viewBox', v ? `0 ${st.camY} ${CH + 2 * M} ${V_WIN}` : `0 0 ${CW + 2 * M} ${CH + 2 * M}`);
      svg.classList.toggle('ct-v', v);
      svg.classList.toggle('ct-names', !v && el.clientWidth >= 760);
      svg.innerHTML = '';
      const floor = mk('g', { transform: v ? `translate(${CH + M} ${M}) rotate(90)` : `translate(${M} ${M})` }, svg);
      floor.innerHTML = floorSvg(id, kit.home.paint, kit.away.fill, abbr.home, abbr.away);
      const mid = toScreen(47, 25);
      mk('text', { class: 'ct-mid', x: mid[0], y: mid[1] }, svg).textContent = tl.home;
      const dl = mk('g', { class: 'ct-dots' }, svg);
      shadowEl = mk('ellipse', { class: 'ct-shadow', rx: 0.8, ry: 0.5 }, dl);
      dots = {};
      Object.keys(info).forEach(key => {
        const k = kit[info[key].side];
        const g = mk('g', { class: 'ct-dot', 'data-key': key, opacity: 0 }, dl);
        mk('circle', { class: 'ct-hit', r: R_HIT }, g);
        mk('circle', { class: 'ct-body', r: R_DOT, fill: k.fill, stroke: k.ring }, g);
        const t = mk('text', { class: 'ct-ini', fill: k.text, y: 0.05 }, g);
        t.textContent = info[key].ini;
        const n = mk('text', { class: 'ct-nm', y: R_DOT + 1.6 }, g);
        n.textContent = info[key].last.toUpperCase();
        g.addEventListener('click', () => select(key));
        dots[key] = g;
      });
      ballEl = mk('circle', { class: 'ct-ball', r: 0.85 }, dl);
      tagLayer = mk('g', { class: 'ct-tags' }, svg);
      st.camSnap = true;
      render(0);
    }

    function render(dt) {
      Object.keys(dots).forEach(key => {
        const a = st.alpha[key] || 0;
        const g = dots[key];
        if (a <= 0.01) { if (g.getAttribute('opacity') !== '0') { g.setAttribute('opacity', 0); g.classList.add('gone'); } return; }
        const p = st.pos[key] || [47, 25];
        const s = toScreen(p[0], p[1]);
        g.setAttribute('transform', `translate(${s[0].toFixed(2)} ${s[1].toFixed(2)})`);
        g.setAttribute('opacity', a.toFixed(2));
        g.classList.toggle('sel', st.sel === key);
        g.classList.toggle('gone', a < 0.5);
        g.classList.toggle('ball', st.holder === key);
      });
      const b = ballPos();
      const g0 = toScreen(b[0], b[1]);
      shadowEl.setAttribute('cx', g0[0].toFixed(2)); shadowEl.setAttribute('cy', g0[1].toFixed(2));
      shadowEl.setAttribute('opacity', (0.45 - Math.min(0.3, st.ball.z * 0.03)).toFixed(2));
      ballEl.setAttribute('cx', g0[0].toFixed(2)); ballEl.setAttribute('cy', (g0[1] - st.ball.z * 0.55).toFixed(2));
      ballEl.setAttribute('r', (0.85 + st.ball.z * 0.06).toFixed(2));
      // floating tags
      st.tags = st.tags.filter(tg => (tg.age += dt) < tg.ttl);
      tagLayer.innerHTML = '';
      st.tags.forEach(tg => {
        const p = tg.key ? (st.pos[tg.key] || [47, 25]) : tg.at;
        const s = toScreen(p[0], p[1]);
        const f = tg.age / tg.ttl;
        if (tg.ring) {
          mk('circle', { class: 'ct-ringfx', cx: s[0], cy: s[1], r: (1 + f * 4).toFixed(2), opacity: (1 - f).toFixed(2) }, tagLayer);
          return;
        }
        const t = mk('text', { class: 'ct-tag ' + (tg.cls || ''), x: s[0].toFixed(2), y: (s[1] - R_DOT - 1.4 - f * 2.5).toFixed(2), opacity: (f < 0.75 ? 1 : (1 - f) * 4).toFixed(2) }, tagLayer);
        t.textContent = tg.text;
      });
      if (st.mode === 'v') {
        const target = clamp(toScreen(b[0], b[1])[1] - V_WIN / 2, 0, CW + 2 * M - V_WIN);
        st.camY = st.camSnap ? target : st.camY + (target - st.camY) * Math.min(1, dt / 420);
        st.camSnap = false;
        svg.setAttribute('viewBox', `0 ${st.camY.toFixed(2)} ${CH + 2 * M} ${V_WIN}`);
      }
      drawClock();
    }

    function ballPos() {
      if (st.holder && !st.flight) {
        const p = st.pos[st.holder] || [47, 25];
        const right = attacksRight(sideOf(st.holder), st.per);
        st.ball.x = p[0] + (right ? HAND[0] : -HAND[0]); st.ball.y = p[1] + HAND[1]; st.ball.z = 0;
      }
      return [st.ball.x, st.ball.y];
    }

    function drawClock() {
      const ev = st.ev;
      let t = st.shownT;
      if (ev && st.done <= ev.i && st.evDur > 0) t = st.tPrev + (ev.t - st.tPrev) * clamp(st.evT / st.evDur, 0, 1);
      const per = ev && st.done <= ev.i ? ev.per : st.per;
      const left = Math.max(0, periodStart(per) + periodLength(per) - t);
      const sec = Math.ceil(left - 1e-6);
      $('.ct-per').textContent = st.ended ? 'FINAL' : per;
      $('.ct-time').textContent = st.ended ? '' : Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    }
    function drawScore() {
      const a = $('.ct-pts[data-s="away"]'), h = $('.ct-pts[data-s="home"]');
      a.textContent = st.as; h.textContent = st.hs;
      a.classList.toggle('lead', st.as > st.hs); h.classList.toggle('lead', st.hs > st.as);
    }
    function drawLine(ev) {
      if (!ev) return;
      $('.ct-lt').innerHTML = `<span class="ct-lc">${esc(ev.per)} ${esc(ev.clock)}</span>${ev.team ? logoOf(ev.team, 20) : ''}`;
      $('.ct-lx').textContent = ev.body || ev.text;
      $('.ct-line').classList.toggle('made', ev.pts > 0);
    }
    // who came in for whom at event j (the lineup before it against the lineup it plays with)
    function subText(j) {
      const prev = j > 0 ? evs[j - 1] : null, cur = evs[j];
      if (!prev || !cur) return '';
      const parts = [];
      SIDES.forEach(side => {
        const ins = cur.on[side].filter(k => prev.on[side].indexOf(k) < 0), outs = prev.on[side].filter(k => cur.on[side].indexOf(k) < 0);
        if (ins.length) parts.push(abbr[side] + ': ' + ins.map(k => info[k].last).join(', ') + ' in for ' + outs.map(k => info[k].last).join(', '));
      });
      return parts.join('   |   ');
    }
    function announceSub(j) {
      const t = subText(j), b = $('.ct-sub');
      if (!t || !b) return;
      b.textContent = 'SUBSTITUTION  ' + t; b.hidden = false;
      clearTimeout(st.subT);
      st.subT = setTimeout(() => { b.hidden = true; }, 5000);
    }
    // the live box score and the play feed, as far as the game has got
    function pnlDraw() {
      const box = $('.ct-pnl'), body = $('.ct-pbody');
      if (!box || box.hidden || !body) return;
      if (st.tab === 'feed') {
        const out = [];
        for (let j = st.done - 1; j >= 0 && out.length < 40; j--) {
          out.push(`<li><small>${esc(evs[j].per)} ${esc(evs[j].clock)}</small>${esc(evs[j].body || evs[j].text)}</li>`);
          const sb = subText(j);
          if (sb) out.push(`<li class="sub"><small>SUB</small>${esc(sb)}</li>`);
        }
        body.innerHTML = out.length ? '<ol class="ct-feed">' + out.join('') + '</ol>' : '<p class="muted">Tip-off coming up.</p>';
        return;
      }
      const L = linesAt(tl, st.done);
      body.innerHTML = SIDES.slice().reverse().map(side => {
        const rows = Object.keys(info).filter(k => info[k].side === side).map(k => {
          const l = L[k] || { pts: 0, reb: 0, ast: 0 }, on = st.on[side].indexOf(k) >= 0;
          return `<tr class="${on ? 'on' : ''}"><td class="l">${on ? '<i></i>' : ''}${esc(info[k].name)}</td><td>${l.pts}</td><td>${l.reb}</td><td>${l.ast}</td></tr>`;
        }).join('');
        return `<table class="ct-bx"><thead><tr><th class="l">${esc(abbr[side])} ${side === 'home' ? st.hs : st.as}</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead><tbody>${rows}</tbody></table>`;
      }).join('');
    }
    function pnlShow(open) {
      const box = $('.ct-pnl'); if (!box) return;
      st.pnl = open; box.hidden = !open;
      box.classList.toggle('ct-pnl-over', full);
      pnlDraw();
    }
    function banner(text) {
      const b = $('.ct-banner');
      b.textContent = text; b.hidden = false;
      b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
      clearTimeout(st.bannerT);
      st.bannerT = setTimeout(() => { b.hidden = true; }, 2200);
    }
    function chips() {
      const box = $('.ct-floor-list');
      box.innerHTML = ['away', 'home'].map(side => `<div class="ct-row" data-side="${side}">${st.on[side].map(key => {
        const k = kit[side];
        return `<button type="button" class="ct-chip${st.sel === key ? ' on' : ''}" data-key="${key}" style="--cf:${esc(k.fill)};--cr:${esc(k.ring)};--ct:${esc(k.text)}"><i>${esc(info[key].ini)}</i><span>${esc(info[key].last)}</span></button>`;
      }).join('')}</div>`).join('');
    }
    $('.ct-floor-list').addEventListener('click', e => { const b = e.target.closest('[data-key]'); if (b) select(b.getAttribute('data-key')); });

    function select(key) {
      st.sel = st.sel === key ? null : key;
      card(); chips(); render(0);
    }
    function card() {
      const c = $('.ct-card');
      if (!st.sel || !info[st.sel]) { c.classList.add('empty'); c.innerHTML = '<span class="ct-hint">TAP A PLAYER ON THE COURT OR BELOW TO FOLLOW HIM</span>'; return; }
      c.classList.remove('empty');
      const p = info[st.sel];
      const line = linesAt(tl, st.done)[st.sel] || { pts: 0, reb: 0, ast: 0 };
      const onFloor = st.on[p.side].indexOf(st.sel) >= 0;
      c.innerHTML = `<div class="ct-cn">${logoOf(abbr[p.side], 22)}<b>${esc(p.name)}</b><small>${esc(p.pos)}${onFloor ? '' : ' | BENCH'}</small></div>
        <div class="ct-cl"><span><b>${line.pts}</b>PTS</span><span><b>${line.reb}</b>REB</span><span><b>${line.ast}</b>AST</span></div><button type="button" class="ct-x" aria-label="Stop following">X</button>`;
      c.querySelector('.ct-x').addEventListener('click', () => select(st.sel));
    }

    // ---------- floor geometry ----------
    function attacksRight(side, per) { return (side === 'home') !== (periodIndex(per || 'Q1') >= 2); }
    function at(side, per, d, y) { return [attacksRight(side, per) ? CW - d : d, y]; }
    function hoop(side, per) { return at(side, per, HOOP, 25); }
    function rank(key) { const r = POSR[info[key].pos]; return r == null ? 2 : r; }
    function ordered(keys) { return keys.slice().sort((p, q) => rank(p) - rank(q) || idxOf(p) - idxOf(q)); }
    function offenseSet(O, per) {
      const out = {};
      ordered(st.on[O]).forEach((key, i) => { const s = OFF_SPOTS[i] || OFF_SPOTS[4]; out[key] = at(O, per, s[0] + rnd(-1.5, 1.5), s[1] + rnd(-2, 2)); });
      return out;
    }
    function defenseSet(O, per, off) {
      const out = {}, D = other(O), h = hoop(O, per);
      const os = ordered(st.on[O]), ds = ordered(st.on[D]);
      ds.forEach((key, i) => {
        const man = off[os[i]] || off[os[0]];
        // between his man and the basket, never on top of him
        const d = Math.max(0.01, dist(man, h)), gap = Math.min(d * 0.8, Math.max(2.7, d * 0.28));
        out[key] = [man[0] + (h[0] - man[0]) / d * gap + rnd(-0.6, 0.6), man[1] + (h[1] - man[1]) / d * gap + rnd(-0.6, 0.6)];
      });
      return out;
    }
    function matchup(key) {
      const side = sideOf(key);
      const i = ordered(st.on[side]).indexOf(key);
      const ds = ordered(st.on[other(side)]);
      return ds[Math.max(0, i)] || ds[0];
    }
    function shotSpot(type, O, per) {
      const h = hoop(O, per);
      const sgn = attacksRight(O, per) ? -1 : 1;
      const polar = (r, deg) => { const a = deg * Math.PI / 180; return [h[0] + sgn * r * Math.cos(a), h[1] + r * Math.sin(a)]; };
      if (type === 'close') return at(O, per, rnd(3.2, 6), rnd(22, 28));
      if (type === 'post') return at(O, per, rnd(6, 10), pick([rnd(17.5, 20.5), rnd(29.5, 32.5)]));
      if (type === 'mid') return polar(rnd(11, 18), rnd(-75, 75));
      if (Math.random() < 0.3) return at(O, per, rnd(2.5, 7), pick([2.4, 47.6]));
      return polar(rnd(24.6, 26.5), rnd(-62, 62));
    }
    function landing(O, per) { return at(O, per, rnd(3.5, 13), rnd(15, 35)); }
    function drift(form, keys, r) { const out = {}; form = form || {}; keys.forEach(k => { if (form[k]) out[k] = [form[k][0] + rnd(-r, r), clamp(form[k][1] + rnd(-r, r), 1, 49)]; }); return out; }
    function huddles() {
      const out = {};
      ['home', 'away'].forEach(side => {
        const cx = side === 'home' ? 36 : 58;
        st.on[side].forEach((key, i) => { const a = i / 5 * Math.PI * 2; out[key] = [cx + Math.cos(a) * 2.6, 45.5 + Math.sin(a) * 1.8]; });
      });
      return out;
    }

    // ---------- planning: an event becomes a few beats ----------
    // beat: { dur (ms at 1x), move: { key: [x, y] }, fade: { key: alpha }, ball: { to: key | [x, y], arc }, hold, fire, at() }
    function tag(key, text, cls, ttl) { st.tags.push({ key, text, cls, age: 0, ttl: ttl || 1300 }); }
    function tagAt(p, text, cls, ttl) { st.tags.push({ at: p, text, cls, age: 0, ttl: ttl || 1300 }); }
    function ring(p) { st.tags.push({ at: p, ring: true, age: 0, ttl: 600 }); }
    function pass(B, to, extra) { const from = st.ph; st.ph = to; B.push(Object.assign({ dur: 380 + (from && st.pos[from] && st.pos[to] ? dist(st.pos[from], st.pos[to]) * 9 : 120), ball: { to, arc: 1.2 } }, extra || {})); }

    // Puts the ball in the hands of side O in its frontcourt. Returns the handler.
    function setUp(O, per, B) {
      let h = st.ph && sideOf(st.ph) === O && st.on[O].indexOf(st.ph) >= 0 ? st.ph : null;
      const ord = ordered(st.on[O]);
      if (st.off === O && st.set && h && st.form) return h;
      if (!h) {
        // inbound from under the basket the other team attacks
        const inb = ord[3] || ord[ord.length - 1], pg = inb === ord[0] ? ord[1] : ord[0];
        const own = attacksRight(O, per) ? -1.4 : CW + 1.4;
        const mv = {}; mv[inb] = [own, rnd(19, 31)]; mv[pg] = at(O, per, CW - rnd(9, 14), rnd(14, 36));
        B.push({ dur: 650, move: mv, ball: { to: inb, arc: 0.4 }, hold: inb });
        st.ph = inb;
        pass(B, pg);
        h = pg;
      } else if (h !== ord[0] && st.off !== O && Math.random() < 0.6) {
        const mv = {}; mv[ord[0]] = [st.pos[h][0] + (attacksRight(O, per) ? 9 : -9), clamp(st.pos[h][1] + rnd(-8, 8), 4, 46)];
        B.push({ dur: 420, move: mv });
        pass(B, ord[0]);
        h = ord[0];
      }
      const off = offenseSet(O, per);
      off[h] = at(O, per, rnd(25, 29), rnd(19, 31));
      const def = defenseSet(O, per, off);
      const far = Math.max.apply(null, Object.keys(off).map(k => dist(st.pos[k] || off[k], off[k])));
      B.push({ dur: clamp(far * 42, 700, 2300), move: Object.assign({}, off, def) });
      st.off = O; st.set = true; st.form = Object.assign({}, off, def);
      return h;
    }
    // A few passes around the perimeter, ending with the ball in `end`'s hands.
    function swing(O, B, end, n) {
      const keys = st.on[O];
      for (let j = 0; j < n; j++) {
        const opts2 = keys.filter(k => k !== st.ph && (j < n - 1 || k !== end || n === 1));
        if (!opts2.length) break;
        const to = pick(opts2);
        pass(B, to, { move: drift(st.form, st.on.home.concat(st.on.away), 1.6) });
      }
      if (st.ph !== end) pass(B, end, { move: drift(st.form, st.on.home.concat(st.on.away), 1.2) });
      return end;
    }

    function planSubs(ev, B) {
      const fade = {}, move = {}, ins = [];
      let any = false;
      SIDES.forEach(side => {
        const now = st.on[side], next = ev.on[side];
        const outs = now.filter(k => next.indexOf(k) < 0), inn = next.filter(k => now.indexOf(k) < 0);
        inn.forEach((k, j) => {
          any = true;
          const repl = outs[j];
          const spot = repl && st.pos[repl] ? st.pos[repl].slice() : [47 + rnd(-6, 6), rnd(8, 42)];
          st.pos[k] = [47 + rnd(-2, 2), 51.5];
          move[k] = spot; fade[k] = 1; ins.push(k);
          if (st.ph === repl) st.ph = k;
        });
        outs.forEach(k => { any = true; move[k] = [47 + rnd(-3, 3), 51.8]; fade[k] = 0; });
      });
      if (!any) return;
      const prevHolder = st.holder;
      st.on = { home: ev.on.home.slice(), away: ev.on.away.slice() };
      if (st.form) ins.forEach(k => { st.form[k] = move[k]; });
      B.push({ dur: 900, move, fade, hold: st.ph, at0: () => {
        chips();
        if (prevHolder && fade[prevHolder] === 0) st.holder = st.ph;
        ins.forEach(k => tag(k, 'IN', 'sub', 1100));
        announceSub(ev.i);
      } });
    }

    function plan(ev, prev) {
      const B = [];
      const per = ev.per;
      st.ph = st.holder;
      planSubs(ev, B);
      const k = ev.k, O = ev.side;
      if (k === 'tip') {
        const mv = {};
        SIDES.forEach(side => {
          const ord = ordered(st.on[side]);
          const jumper = ord[ord.length - 1];
          ord.forEach((key, i) => {
            if (key === jumper) mv[key] = [47 + (attacksRight(side, per) ? -1.1 : 1.1), 25];
            else mv[key] = at(side, per, 47 + rnd(7, 9), [11, 19, 31, 39][i] + rnd(-1, 1));
          });
          st.pos[jumper] = st.pos[jumper] || mv[jumper];
        });
        B.push({ dur: 900, move: mv, ball: { to: [47, 25], arc: 0 }, hold: null, at0: () => banner('TIP-OFF') });
        B.push({ dur: 650, ball: { to: [47, 25], arc: 8 }, hold: null });
        const pg = ordered(st.on[O])[0];
        B.push({ dur: 450, ball: { to: pg, arc: 2 }, hold: pg, fire: true });
        st.ph = pg; st.off = O; st.set = false; st.form = null;
        return B;
      }
      if (k === 'end' || k === 'final') {
        const ot = evs[evs.length - 1] && periodIndex(per) >= 4;
        const text = k === 'final' ? 'FINAL' + (ot ? (periodIndex(per) > 4 ? '/' + (periodIndex(per) - 3) + 'OT' : '/OT') : '')
          : per === 'Q2' ? 'HALFTIME' : 'END OF ' + per;
        B.push({ dur: k === 'final' ? 2400 : 1900, move: huddles(), ball: { to: [47, 25], arc: 1 }, hold: null, fire: true, at0: () => banner(text) });
        st.ph = null; st.off = null; st.set = false; st.form = null;
        return B;
      }
      if (k === 'make' || k === 'miss' || k === 'sfoul') {
        const shooter = ev.a;
        const putback = prev && prev.k === 'oreb' && prev.a === shooter && ev.shot === 'close' && st.ph === shooter;
        const spot = shotSpot(ev.shot, O, per);
        if (putback) {
          B.push({ dur: 320, move: { [shooter]: spot } });
        } else {
          setUp(O, per, B);
          const assister = k === 'make' ? ev.b : null;
          const hub = assister || (Math.random() < 0.55 ? shooter : null);
          const n = Math.floor(rnd(0, 2.6));
          if (hub) swing(O, B, hub, n);
          else if (n) swing(O, B, pick(st.on[O].filter(x => x !== shooter)) || shooter, n);
          if (st.ph !== shooter) pass(B, shooter, { move: Object.assign({ [shooter]: spot }, drift(st.form, st.on[O].filter(x => x !== shooter), 1)), dur: 560 });
          else B.push({ dur: clamp(dist(st.pos[shooter] || spot, spot) * 55, 350, 1200), move: { [shooter]: spot } });
        }
        const dfd = matchup(shooter);
        const h = hoop(O, per);
        const closeout = dfd ? { [dfd]: [spot[0] + (h[0] - spot[0]) * 0.14, spot[1] + (h[1] - spot[1]) * 0.14] } : {};
        const rim = [h[0] + rnd(-0.2, 0.2), h[1] + rnd(-0.2, 0.2)];
        const long = ev.shot === 'three', near = ev.shot === 'close';
        const arc = long ? 9 : near ? 2.8 : ev.shot === 'post' ? 4.5 : 6.5;
        const dur = long ? 860 : near ? 460 : 700;
        const label = { close: 'AT THE RIM', post: 'POST', mid: 'MID-RANGE', three: '3PT' }[ev.shot];
        st.ph = null;
        if (k === 'make') {
          const fouler = ev.c;
          if (fouler) closeout[fouler] = [spot[0] + (h[0] - spot[0]) * 0.1, spot[1] + 0.8];
          B.push({ dur, move: closeout, ball: { to: rim, arc }, hold: null, fire: true, at0: () => tag(shooter, label, 'kind', dur + 200), at: () => {
            ring(rim); tag(shooter, '+' + ev.pts, 'pts');
            if (fouler) { tag(fouler, 'FOUL', 'foul'); tagAt(rim, 'AND ONE', 'big', 1500); }
          } });
          B.push({ dur: 260, ball: { to: at(O, per, HOOP - 1.4, 25 + rnd(-1, 1)), arc: 0 }, hold: null });
          st.off = fouler ? O : null; st.set = !!fouler;
        } else if (k === 'sfoul') {
          const fouler = ev.b;
          if (fouler && st.pos[shooter]) closeout[fouler] = [spot[0] + (h[0] - spot[0]) * 0.08, spot[1] + 0.9];
          B.push({ dur: 420, move: closeout, at0: () => tag(shooter, label, 'kind', 600) });
          B.push({ dur: 420, ball: { to: [spot[0] + (h[0] - spot[0]) * 0.5, spot[1] + (h[1] - spot[1]) * 0.5], arc: 2 }, hold: null, fire: true, at: () => { if (fouler) tag(fouler, 'FOUL', 'foul'); } });
          st.off = O; st.set = true;
        } else if (ev.b) {
          const blk = ev.b;
          const meet = [spot[0] + (h[0] - spot[0]) * 0.12, spot[1] + (h[1] - spot[1]) * 0.12];
          const mv = Object.assign({}, closeout); mv[blk] = [meet[0] + rnd(-0.6, 0.6), meet[1] + rnd(-0.6, 0.6)];
          B.push({ dur: 360, move: mv, at0: () => tag(shooter, label, 'kind', 500) });
          B.push({ dur: 240, ball: { to: meet, arc: 2.5 }, hold: null, fire: true, at: () => tag(blk, 'BLOCK', 'big') });
          B.push({ dur: 460, ball: { to: landing(O, per), arc: 2 }, hold: null });
          st.off = null; st.set = false;
        } else {
          B.push({ dur, move: closeout, ball: { to: rim, arc }, hold: null, fire: true, at0: () => tag(shooter, label, 'kind', dur + 200), at: () => tag(shooter, 'MISS', 'miss', 900) });
          B.push({ dur: 420, ball: { to: landing(O, per), arc: 3 }, hold: null });
          st.off = null; st.set = false;
        }
        return B;
      }
      if (k === 'oreb' || k === 'dreb') {
        const r = ev.a;
        const crash = {};
        // the rebounder goes where the miss came down
        crash[r] = st.lastBallTo ? st.lastBallTo.slice() : [st.ball.x, st.ball.y];
        B.push({ dur: 520, move: crash });
        B.push({ dur: 220, ball: { to: r, arc: 0.6 }, hold: r, fire: true, at: () => tag(r, k === 'oreb' ? 'O-REB' : 'REB', 'reb', 900) });
        st.ph = r; st.off = O; st.set = k === 'oreb'; if (k === 'dreb') st.form = null;
        return B;
      }
      if (k === 'ft') {
        const shooter = ev.a;
        const D = other(O);
        const line = at(O, per, 19, 25);
        const mv = {}; mv[shooter] = line;
        const lane = { D: [[7, 16.2], [7, 33.8], [11, 16.2]], O: [[11, 33.8], [14, 16.2]] };
        ordered(st.on[D]).forEach((key, i) => { const s = lane.D[i]; mv[key] = s ? at(O, per, s[0], s[1]) : at(O, per, rnd(26, 29), i % 2 ? 12 : 38); });
        ordered(st.on[O]).filter(x => x !== shooter).forEach((key, i) => { const s = lane.O[i]; mv[key] = s ? at(O, per, s[0], s[1]) : at(O, per, rnd(27, 30), i % 2 ? 14 : 36); });
        B.push({ dur: 900, move: mv, ball: { to: shooter, arc: 1.2 }, hold: shooter });
        const reb = evs[ev.i + 1] && (evs[ev.i + 1].k === 'oreb' || evs[ev.i + 1].k === 'dreb');
        const lastMade = ev.made > 0 && !(reb && ev.made < ev.att);
        // made ones first when the last one misses, missed ones first otherwise
        const seq = [];
        for (let j = 0; j < ev.att; j++) seq.push(lastMade ? j >= ev.att - ev.made : j < ev.made);
        const h = hoop(O, per);
        let base = O === 'home' ? ev.hs - ev.made : ev.as - ev.made;
        seq.forEach((made, j) => {
          const last = j === seq.length - 1;
          B.push({ dur: 640, ball: { to: [h[0] + rnd(-0.15, 0.15), h[1]], arc: 4.5 }, hold: null, fire: last, at: () => {
            if (made) { base++; if (O === 'home') st.hs = base; else st.as = base; drawScore(); ring(h); tag(shooter, '+1', 'pts', 900); }
            else tag(shooter, 'MISS', 'miss', 800);
          } });
          if (!last) B.push({ dur: 420, ball: { to: shooter, arc: 2 }, hold: shooter });
          else if (made) B.push({ dur: 260, ball: { to: at(O, per, HOOP - 1.4, 25), arc: 0 }, hold: null });
          else B.push({ dur: 380, ball: { to: landing(O, per), arc: 2.5 }, hold: null });
        });
        st.ph = null; st.off = lastMade ? null : O; st.set = false; st.form = null;
        return B;
      }
      if (k === 'tov') {
        const tp = ev.a;
        setUp(O, per, B);
        if (st.ph !== tp && tp) pass(B, tp, { move: drift(st.form, st.on.home.concat(st.on.away), 1.4) });
        const D = other(O);
        if (ev.tov === 'steal' && ev.b) {
          const sp = st.pos[tp] ? [st.pos[tp][0] + rnd(-1.2, 1.2), st.pos[tp][1] + rnd(-1.2, 1.2)] : [47, 25];
          B.push({ dur: 380, move: { [ev.b]: sp }, ball: { to: ev.b, arc: 0.3 }, hold: ev.b, fire: true, at: () => tag(ev.b, 'STEAL', 'big') });
          st.ph = ev.b; st.off = D; st.set = false; st.form = null;
        } else if (ev.tov === 'foul') {
          const dfd = matchup(tp);
          const h = hoop(O, per);
          const p = st.form && st.form[tp] ? st.form[tp] : [47, 25];
          const hit = [p[0] + (h[0] - p[0]) * 0.3, p[1] + (h[1] - p[1]) * 0.3];
          const mv = { [tp]: hit };
          if (dfd) mv[dfd] = [hit[0] + (h[0] - hit[0]) * 0.08, hit[1] + 0.4];
          B.push({ dur: 520, move: mv, fire: true, at: () => tag(tp, 'OFFENSIVE FOUL', 'foul', 1400) });
          st.ph = tp; st.off = D; st.set = false; st.form = null;
          B.push({ dur: 300, ball: { to: [hit[0], hit[1] + 2], arc: 1 }, hold: null });
          st.ph = null;
        } else {
          const out = [clamp(st.ball.x + rnd(-10, 10), 2, 92), Math.random() < 0.5 ? -1.5 : CH + 1.5];
          B.push({ dur: 560, ball: { to: out, arc: 0.6 }, hold: null, fire: true, at: () => tag(tp, 'TURNOVER', 'miss', 1200) });
          st.ph = null; st.off = D; st.set = false; st.form = null;
        }
        return B;
      }
      if (k === 'pf') {
        const fouler = ev.a, Off = other(O);
        const h = setUp(Off, per, B);
        const p = st.form && st.form[h] ? st.form[h] : [47, 25];
        B.push({ dur: 480, move: { [fouler]: [p[0] + rnd(-1, 1), p[1] + rnd(-1, 1)] }, fire: true, at: () => tag(fouler, 'FOUL', 'foul') });
        return B;
      }
      if (k === 'foulout' || k === 'inj') {
        B.push({ dur: 1000, fire: true, at0: () => tag(ev.a, k === 'inj' ? 'INJURED' : 'FOULED OUT', 'foul', 1600) });
        return B;
      }
      B.push({ dur: 160, fire: true });
      return B;
    }

    // ---------- running ----------
    // the sound of a play (js/sfx.js), only when the game is being watched play by play, not skipped through
    function sound(ev) {
      const S = window.SFX;
      if (!S || !ev) return;
      if (ev.k === 'make') S.play(ev.pts === 3 ? 'three' : 'swish');
      else if (ev.k === 'miss') S.play('rim');
      else if (ev.k === 'ft') S.play(ev.made ? 'swish' : 'rim');
      else if (ev.k === 'sfoul' || ev.k === 'pf') S.play('whistle');
      else if (ev.k === 'end') S.play('buzzer');
      else if (ev.k === 'final') { S.play('buzzer'); setTimeout(() => S.play('crowd'), 500); }
    }
    function fire(i) {
      if (i < st.done) return;
      const few = i - st.done < 3;
      for (let j = st.done; j <= i && j < evs.length; j++) {
        const ev = evs[j];
        st.done = j + 1;
        st.hs = ev.hs; st.as = ev.as; st.per = ev.per; st.shownT = ev.t; st.tPrev = ev.t;
        if (typeof opts.onStep === 'function') { try { opts.onStep(j); } catch (e) { console.warn('[court] onStep failed', e); } }
      }
      const ev = evs[Math.min(i, evs.length - 1)];
      if (few) sound(ev);
      drawScore(); drawLine(ev); pnlDraw();
      if (st.sel) card();
    }
    function nextEvent() {
      if (st.cur >= evs.length) {
        if (!st.ended) { st.ended = true; drawClock(); if (typeof opts.onEnd === 'function') opts.onEnd(); syncControls(); }
        return false;
      }
      const ev = evs[st.cur];
      const prev = st.cur > 0 ? evs[st.cur - 1] : null;
      st.ev = ev;
      st.tPrev = prev ? prev.t : 0;
      st.beats = plan(ev, prev);
      if (!st.beats.some(b => b.fire)) st.beats.push({ dur: 100, fire: true });
      st.evDur = st.beats.reduce((s, b) => s + b.dur, 0);
      st.evT = 0;
      st.cur++;
      return true;
    }
    function beginBeat(b) {
      st.beat = b; st.bt = 0;
      b.from = {};
      Object.keys(b.move || {}).forEach(k => { b.from[k] = (st.pos[k] || b.move[k]).slice(); });
      b.a0 = {};
      Object.keys(b.fade || {}).forEach(k => { b.a0[k] = st.alpha[k] || 0; });
      if (b.ball) {
        st.flight = true;
        const p = ballPos();
        b.b0 = [p[0], p[1]];
        if (Array.isArray(b.ball.to)) st.lastBallTo = b.ball.to.slice();
      }
      if (b.at0) b.at0();
    }
    function endBeat(b) {
      Object.keys(b.move || {}).forEach(k => { st.pos[k] = b.move[k].slice(); });
      Object.keys(b.fade || {}).forEach(k => { st.alpha[k] = b.fade[k]; });
      if (b.ball) {
        const to = typeof b.ball.to === 'string' ? st.pos[b.ball.to] : b.ball.to;
        if (to) { st.ball.x = to[0]; st.ball.y = to[1]; }
        st.ball.z = 0; st.flight = false;
        st.holder = b.hold !== undefined ? b.hold : (typeof b.ball.to === 'string' ? b.ball.to : null);
      } else if (b.hold !== undefined) st.holder = b.hold;
      if (b.at) b.at();
      if (b.fire && st.ev) fire(st.ev.i);
      st.beat = null;
    }
    function stepBeat(b, ms) {
      st.bt += ms;
      const p = clamp(st.bt / b.dur, 0, 1), e = ease(p);
      Object.keys(b.move || {}).forEach(k => {
        const f = b.from[k], t = b.move[k];
        st.pos[k] = [f[0] + (t[0] - f[0]) * e, f[1] + (t[1] - f[1]) * e];
      });
      Object.keys(b.fade || {}).forEach(k => { st.alpha[k] = b.a0[k] + (b.fade[k] - b.a0[k]) * p; });
      if (b.ball) {
        const to = typeof b.ball.to === 'string' ? ballHand(b.ball.to) : b.ball.to;
        st.ball.x = b.b0[0] + (to[0] - b.b0[0]) * p;
        st.ball.y = b.b0[1] + (to[1] - b.b0[1]) * p;
        st.ball.z = (b.ball.arc || 0) * 4 * p * (1 - p);
      }
      return p >= 1;
    }
    function ballHand(key) {
      const p = st.pos[key] || [47, 25];
      return [p[0] + (attacksRight(sideOf(key), st.per) ? HAND[0] : -HAND[0]), p[1] + HAND[1]];
    }
    function advance(ms) {
      let guard = 0;
      while (ms > 0 && guard++ < 50) {
        if (!st.beat) {
          if (!st.beats.length && st.holdAt != null && st.cur >= st.holdAt && st.cur < evs.length) return;   // a watch party: wait for the leader
          if (!st.beats.length && !nextEvent()) return;
          if (!st.beats.length) continue;
          beginBeat(st.beats.shift());
        }
        const b = st.beat;
        const left = b.dur - st.bt;
        const use = Math.min(ms, left);
        st.evT += use;
        if (stepBeat(b, use)) endBeat(b);
        ms -= use;
      }
    }
    function frame(now) {
      st.raf = 0;
      if (st.dead) return;
      if (!el.isConnected || !svg.isConnected) { destroy(); return; }
      const dt = Math.min(100, st.last ? now - st.last : 16);
      st.last = now;
      if (st.playing && !st.ended) advance(dt * st.speed);
      render(dt);
      if ((st.playing && !st.ended) || st.tags.length) st.raf = requestAnimationFrame(frame);
      else st.last = 0;
    }
    function wake() { if (!st.raf && !st.dead) { st.last = 0; st.raf = requestAnimationFrame(frame); } }

    // Plays every event up to the end of the current period at once; the break itself still shows.
    function skipQuarter() {
      if (st.ended) return;
      let j = st.ev && st.done <= st.ev.i ? st.ev.i : st.cur;
      // already at a quarter break: go on to the end of the next quarter
      if (evs[j] && evs[j].k === 'end' && st.ev && st.ev.i === j) { fire(j); j++; }
      let k = j;
      while (k < evs.length && evs[k].k !== 'end' && evs[k].k !== 'final') k++;
      if (k >= evs.length) k = evs.length - 1;
      jumpTo(k);
    }
    // plays every event before k at once and sets the floor for event k (a skip, or catching up with the leader)
    function jumpTo(k) {
      if (k > 0) fire(k - 1);
      st.beats = []; st.beat = null; st.flight = false;
      st.cur = k;
      const ev = evs[k];
      if (ev) {
        st.on = { home: ev.on.home.slice(), away: ev.on.away.slice() };
        Object.keys(info).forEach(key => {
          const on = st.on[info[key].side].indexOf(key) >= 0;
          st.alpha[key] = on ? 1 : 0;
          if (on && !st.pos[key]) st.pos[key] = [47 + rnd(-10, 10), rnd(10, 40)];
        });
        chips();
      }
      st.holder = null; st.ph = null; st.off = null; st.set = false; st.form = null;
      st.ball = { x: 47, y: 25, z: 0 };
      st.ev = null;
      wake();
    }

    // ---------- controls ----------
    function syncControls() {
      const b = $('.ct-play');
      if (!b) return;
      b.textContent = st.ended ? 'FINAL' : st.playing ? 'PAUSE' : 'PLAY';
      b.setAttribute('aria-label', st.ended ? 'Game over' : st.playing ? 'Pause' : 'Play');
      b.disabled = st.ended;
      $('.ct-skip').disabled = st.ended;
      el.querySelectorAll('.ct-spd').forEach(x => { x.classList.toggle('on', Number(x.getAttribute('data-speed')) === st.speed); x.disabled = st.ended; });
    }
    // opts.onControl(kind, value): a tap on the controls, so a watch party can do the same on the other phone
    const told = (k, v) => { if (typeof opts.onControl === 'function') { try { opts.onControl(k, v); } catch (e) { /* the page's problem */ } } };
    $('.ct-play').addEventListener('click', () => { st.playing = !st.playing; syncControls(); wake(); told(st.playing ? 'play' : 'pause'); });
    el.querySelectorAll('.ct-spd').forEach(b => b.addEventListener('click', () => { st.speed = Number(b.getAttribute('data-speed')) || 1; syncControls(); told('speed', st.speed); }));
    $('.ct-skip').addEventListener('click', () => { skipQuarter(); told('skip'); });
    $('.ct-pb').addEventListener('click', () => pnlShow(!st.pnl));
    el.querySelectorAll('.ct-ptab').forEach(b => b.addEventListener('click', () => { st.tab = b.getAttribute('data-tab'); el.querySelectorAll('.ct-ptab').forEach(x => x.classList.toggle('on', x === b)); pnlDraw(); }));
    const sfxB = $('.ct-sfx');
    if (sfxB) sfxB.addEventListener('click', () => { window.SFX.set(!window.SFX.on); sfxB.classList.toggle('on', window.SFX.on); sfxB.textContent = window.SFX.on ? 'SOUND ON' : 'SOUND OFF'; });

    function onResize() {
      const want = narrow() ? 'v' : 'h';
      if (want !== st.mode) { build(); wake(); }
    }
    window.addEventListener('resize', onResize);
    $('.ct-fs').addEventListener('click', () => { full = !full; try { localStorage.setItem(FSKEY, full ? '1' : '0'); } catch (e) { /* private mode */ } applyFull(); build(); wake(); });
    const musB = $('.ct-mus'); if (musB) musB.addEventListener('click', () => { window.MUSICBAR.setHidden(!window.MUSICBAR.hidden()); syncMus(); });

    function destroy() {
      st.dead = true;
      document.body.classList.remove('ct-full-on');
      if (st.raf) cancelAnimationFrame(st.raf);
      st.raf = 0;
      clearTimeout(st.bannerT);
      window.removeEventListener('resize', fitH);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', fitH);
      window.removeEventListener('resize', onResize);
    }

    // ---------- start ----------
    const first = evs[start] || evs[evs.length - 1];
    st.on = { home: first.on.home.slice(), away: first.on.away.slice() };
    st.on.home.concat(st.on.away).forEach(key => { st.alpha[key] = 1; });
    if (start > 0 && evs[start]) {
      // joining a game already under way: the team with the ball sets up near half court
      st.per = evs[start].per;
      const O = SIDES.find(s => s === evs[start].side) || 'home';
      const off = offenseSet(O, st.per);
      Object.assign(st.pos, off, defenseSet(O, st.per, off));
      st.holder = ordered(st.on[O])[0];
      st.off = O; st.set = true; st.form = Object.assign({}, st.pos);
      if (evs[start].k === 'pf') { st.off = other(O); }
      drawLine(evs[start - 1]);
    } else {
      // tip-off: both teams near the center circle
      SIDES.forEach(side => ordered(st.on[side]).forEach((key, i) => { st.pos[key] = at(side, 'Q1', 47 + 8 + rnd(0, 3), [11, 19, 25, 31, 39][i]); }));
    }
    if (start >= evs.length) { st.ended = true; st.per = evs[evs.length - 1].per; }
    applyFull(); syncMus(); card();
    build();
    drawScore();
    chips();
    syncControls();
    if (st.ended) drawLine(evs[evs.length - 1]);
    wake();

    return {
      destroy,
      play() { st.playing = true; syncControls(); wake(); },
      pause() { st.playing = false; syncControls(); },
      setSpeed(s) { st.speed = s; syncControls(); },
      skipQuarter,
      seek(i) { i = clamp(i | 0, 0, evs.length - 1); if (st.ended || i <= st.cur) return; jumpTo(i); },   // catch up to event i
      hold(i) { st.holdAt = i == null ? null : i; wake(); },                                              // never run ahead of event i
      state: () => ({ cur: st.cur, done: st.done, playing: st.playing, speed: st.speed, ended: st.ended }),
      done: () => st.done,
      timeline: tl
    };
  };

  // =====================================================================
  // Replay page: #/watch/<gameId>, for a finished game whose play-by-play is still kept
  // =====================================================================
  const P = UI.pages = UI.pages || {};
  P.watch = function (app, id) {
    const g = UI.game ? UI.game(id || '') : null;
    const r = g && g.result;
    if (!g || !r || !available(r)) {
      app.innerHTML = UI.empty(g ? 'NO PLAY-BY-PLAY' : 'GAME NOT FOUND',
        g ? 'Play-by-play is kept for the most recent games only, so this one cannot be watched.' : 'There is no game with the id ' + esc(id) + ' in this season.',
        `<div class="row-btns">${g ? `<a class="btn" href="#/game/${esc(g.id)}">BOX SCORE</a>` : ''}<a class="btn" href="#/season">SEASON</a></div>`);
      return;
    }
    const dayLbl = (g.date && UI.dateLabel ? UI.dateLabel(g.date).toUpperCase() : '') + (g.playoff ? ' | PLAYOFFS GAME ' + (g.gameNum || '') : '');
    app.innerHTML = UI.header('COURT VIEW', esc(UI.teamName(g.away)) + ' at ' + esc(UI.teamName(g.home)) + (dayLbl ? ' | ' + esc(dayLbl) : '')) +
      `<div class="ct-host" id="ctHost"></div>
      <div class="row-btns center"><a class="btn" href="#/game/${esc(g.id)}">BOX SCORE</a><a class="btn" href="#/season">BACK TO SEASON</a></div>`;
    const ctl = COURT.mount(document.getElementById('ctHost'), { game: r, start: 0, autoplay: true });
    if (ctl && UI.extras && typeof UI.extras.onLeave === 'function') UI.extras.onLeave(() => ctl.destroy());
  };
  P.watch.hidden = true;
})(typeof window !== 'undefined' ? window : this);
