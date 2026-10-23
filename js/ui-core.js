// UI core: shared state, formatting helpers, headshots and logos, and adapters that read
// the league state (window.LEAGUE, docs/contract-v2.md) and the engine's season object.
(function () {
  'use strict';
  const UI = window.UI = window.UI || {};

  UI.state = {
    league: null,      // window.LEAGUE_2012 (the starting data)
    engine: null,      // window.ENGINE
    L: null,           // window.LEAGUE (the orchestrator)
    game: null,        // the league state from LEAGUE.newLeague: players, teams, season, events...
    slot: null,        // active save slot number
    save: null,        // save metadata { name, created, updated }
    ver: 0             // bumped whenever the state changes, for caches
  };
  // The engine season object always comes from the league state (it is replaced each new season).
  Object.defineProperty(UI.state, 'season', { get() { return this.game ? this.game.season : null; } });
  UI.canPlay = () => !!(UI.state.L && UI.state.engine);
  // The active league state, for pages added by other modules.
  UI.getState = UI.getLeagueState = () => UI.state.game;

  // ---------- DOM and text ----------
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  UI.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  UI.$ = (sel, root) => (root || document).querySelector(sel);
  UI.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  UI.toast = function (msg, kind) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(UI.toast._t);
    UI.toast._t = setTimeout(() => { el.className = 'toast'; }, kind === 'error' ? 6000 : 2800);
  };

  UI.header = (title, sub) =>
    `<div class="sec-head"><h2>${UI.esc(title)}</h2>${sub ? `<div class="sec-sub">${sub}</div>` : ''}</div>`;

  UI.empty = (title, body, actions) =>
    `<div class="empty"><div class="empty-title">${UI.esc(title)}</div><p>${body || ''}</p>${actions || ''}</div>`;

  // ---------- formatting ----------
  UI.fmtHt = inches => {
    const n = Number(inches);
    if (!n) return '-';
    return Math.floor(n / 12) + "'" + (Math.round(n) % 12) + '"';
  };
  UI.fmtMoney = d => {
    const n = Number(d);
    if (!n) return '-';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    return '$' + Math.round(n / 1e3) + 'K';
  };
  UI.fmtSeasonEnd = y => (y ? (y - 1) + '-' + String(y).slice(-2) : '-');
  UI.fmt1 = v => (v == null || isNaN(v) ? '-' : Number(v).toFixed(1));
  UI.fmtPct = v => {
    if (v == null || isNaN(v)) return '-';
    const x = Number(v) > 1 ? Number(v) / 100 : Number(v);
    return (x * 100).toFixed(1);
  };
  UI.fmtWinPct = (w, l) => {
    const g = w + l;
    if (!g) return '.000';
    const p = w / g;
    return p >= 1 ? '1.000' : '.' + String(Math.round(p * 1000)).padStart(3, '0');
  };
  UI.ovrClass = o => (o >= 85 ? 'ovr-elite' : o >= 75 ? 'ovr-good' : o >= 65 ? 'ovr-mid' : 'ovr-low');

  // ---------- teams ----------
  const FA_TEAM = { abbr: 'FA', city: 'Free', name: 'Agents', conf: '', div: '', colors: ['#3a3a40', '#8a8a90'], logo: null };
  UI.teams = function () {
    const g = UI.state.game;
    if (g && g.teams) return Object.keys(g.teams).map(k => g.teams[k]);
    return (UI.state.league && UI.state.league.teams) || [];
  };
  UI.team = abbr => UI.teams().find(t => t.abbr === abbr) || (abbr === 'FA' ? FA_TEAM : { abbr: abbr || '?', city: abbr || '?', name: '', colors: ['#333', '#777'], logo: null });
  UI.teamColor = abbr => {
    const t = UI.team(abbr);
    return (t.colors && t.colors[0]) || '#555';
  };
  UI.teamName = abbr => {
    const t = UI.team(abbr);
    return (t.city + ' ' + t.name).trim();
  };

  UI.logo = function (abbr, size) {
    const t = UI.team(abbr);
    const c1 = (t.colors && t.colors[0]) || '#333';
    const c2 = (t.colors && t.colors[1]) || '#999';
    const style = `--c1:${c1};--c2:${c2};--sz:${size || 40}px`;
    const img = t.logo ? `<img src="${UI.esc(t.logo)}" alt="" loading="lazy"${t.logoNoRef || /wikia|nocookie/.test(t.logo) ? ' referrerpolicy="no-referrer"' : ''} onerror="this.parentNode.classList.add('nologo');this.remove()">` : '';
    return `<span class="logo${t.logo ? '' : ' nologo'}" style="${style}" title="${UI.esc(UI.teamName(abbr))}">${img}<b>${UI.esc(t.abbr)}</b></span>`;
  };

  // ---------- headshots ----------
  UI.faceSvg = function (color) {
    const c = color || '#555';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 190"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".95"/><stop offset="1" stop-color="${c}" stop-opacity=".55"/></linearGradient></defs><circle cx="130" cy="78" r="44" fill="url(#g)"/><path d="M42 190c4-52 42-80 88-80s84 28 88 80z" fill="url(#g)"/></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  };
  UI.faceFallback = function (img) {
    img.onerror = null;
    img.src = UI.faceSvg(img.getAttribute('data-c'));
    img.classList.add('hs-fallback');
  };
  UI.headshot = function (p, cls) {
    const color = UI.teamColor(p.team);
    let src;
    if (p.nbaId) src = `https://cdn.nba.com/headshots/nba/latest/260x190/${p.nbaId}.png`;
    else if (p.face) src = p.face;
    const klass = 'hs ' + (cls || '');
    if (!src) return `<img class="${klass} hs-fallback" src="${UI.faceSvg(color)}" alt="">`;
    return `<img class="${klass}" src="${UI.esc(src)}" data-c="${UI.esc(color)}" alt="" loading="lazy" onerror="UI.faceFallback(this)">`;
  };

  // ---------- players ----------
  // With a league loaded, everyone lives in state.players (NBA, free agents, retired, draft prospects).
  // Before that, the starting data in LEAGUE_2012 is shown.
  UI.player = function (id) {
    const g = UI.state.game;
    if (g && g.players) return g.players[id] || null;
    const L = UI.state.league;
    const base = L && L.players.find(p => p.id === id);
    if (base) return base;
    // Draft prospects before a league exists.
    const D = window.DRAFTS;
    if (D) for (const y of Object.keys(D)) { const p = D[y].find(x => x.id === id); if (p) return Object.assign({ team: 'DRAFT' }, p); }
    return null;
  };
  UI.allPlayers = function () {
    const g = UI.state.game;
    if (g && g.players) return Object.keys(g.players).map(k => g.players[k]);
    return (UI.state.league && UI.state.league.players) || [];
  };
  const active = p => p && !p.retired && p.team !== 'DRAFT';
  UI.roster = function (abbr) {
    return UI.allPlayers().filter(p => active(p) && p.team === abbr).sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
  };
  UI.teamOvr = function (abbr) {
    const r = UI.roster(abbr).filter(p => !p.gleague && !(p.stashedUntil && UI.state.game && p.stashedUntil > UI.state.game.year)).slice(0, 8);
    if (!r.length) return 0;
    const w = [1.6, 1.4, 1.3, 1.2, 1.1, 0.8, 0.7, 0.6];
    let s = 0, ws = 0;
    r.forEach((p, i) => { s += (p.ovr || 0) * w[i]; ws += w[i]; });
    return Math.round(s / ws);
  };
  UI.year = () => (UI.state.game ? UI.state.game.year : (UI.state.league && UI.state.league.season) || 2013);
  UI.seasonLabel = y => (y - 1) + '-' + String(y).slice(-2);
  // Salary this season and the last season of the deal, from contract.salaries when present.
  UI.salaryOf = function (p) {
    const c = p && p.contract;
    if (c && Array.isArray(c.salaries) && c.salaries.length) {
      const y = UI.year();
      const cur = c.salaries.find(s => s.year === y) || c.salaries[0];
      return cur.amount;
    }
    return p ? p.salary : 0;
  };
  UI.contractEndOf = function (p) {
    const c = p && p.contract;
    if (c && Array.isArray(c.salaries) && c.salaries.length) return c.salaries[c.salaries.length - 1].year;
    if (UI.state.game && p && p.team === 'FA') return null;
    return p ? p.contractEnd : null;
  };
  UI.contractNote = function (p) {
    const c = p && p.contract;
    if (!c) return '';
    const bits = [];
    const opts = Array.isArray(c.options) && c.options.length ? c.options : c.option ? [c.option] : [];
    opts.forEach(o => { if (o && o.type) bits.push((o.type === 'eto' ? 'ETO' : o.type === 'player' ? 'Player option' : 'Team option') + ' ' + UI.seasonLabel(o.year)); });
    if (c.rookie) bits.push('Rookie scale');
    if (c.twoWay) bits.push('Two-way');
    return bits.join(', ');
  };
  // Current injury: the season's injury table during a season, else the player's own field.
  UI.injuryOf = function (p) {
    if (!p) return null;
    const s = UI.state.season;
    if (s && s.injuries && s.injuries[p.id]) return s.injuries[p.id];
    if (p.injury && (p.injury.games == null || p.injury.games > 0) && (!s || p.injury.type === 'Playing overseas')) return p.injury;
    return null;
  };
  UI.injuryBadge = function (p) {
    const inj = UI.injuryOf(p);
    let out = '';
    if (inj) out += `<span class="badge badge-inj" title="${UI.esc(inj.type || 'Injured')}">${inj.type === 'Playing overseas' ? 'OVERSEAS' : 'INJ' + (inj.games && inj.games < 900 ? ' ' + inj.games + 'G' : '')}</span>`;
    if (p && p.gleague) out += ' <span class="badge badge-dim">G LEAGUE</span>';
    if (p && p.contract && p.contract.twoWay) out += ' <span class="badge badge-dim">TWO-WAY</span>';
    return out;
  };

  // ---------- season adapters (engine season object, contract.md) ----------
  const abbrOf = x => (x == null ? null : typeof x === 'string' ? x : (x.abbr || x.team || x.id || null));
  UI.abbrOf = abbrOf;

  // Every game of the season, flattened from season.days; result is the stored box score.
  let gcache = { ver: -1 };
  UI.games = function () {
    const s = UI.state.season;
    if (!s) return [];
    if (gcache.ver === UI.state.ver && gcache.season === s) return gcache.list;
    const list = [];
    (s.days || []).forEach((d, i) => (d.games || []).forEach(g => {
      list.push({
        id: String(g.id), day: i, date: d.date || null, playoff: !!d.playoff,
        home: g.home, away: g.away, played: !!g.played,
        hs: g.hs, as: g.as, series: g.series || null, gameNum: g.gameNum || null,
        get result() { return (s.boxScores && s.boxScores[g.id]) || null; }
      });
    }));
    gcache = { ver: UI.state.ver, season: s, list };
    return list;
  };
  UI.game = id => UI.games().find(g => g.id === String(id)) || null;
  UI.currentDay = () => { const s = UI.state.season; return s ? s.day || 0 : 0; };
  UI.regularDays = () => { const s = UI.state.season; return s && s.days ? s.days.filter(d => !d.playoff).length : 0; };
  UI.lastDay = () => { const n = UI.regularDays(); return n ? n - 1 : null; };
  UI.regularSeasonDone = () => { const s = UI.state.season; return !!s && s.phase !== 'regular'; };
  UI.userTeam = () => (UI.state.game && UI.state.game.userTeam) || null;
  UI.dateLabel = function (iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  UI.gameDay = g => (g.date ? UI.dateLabel(g.date).replace(/, \d{4}$/, '') : 'Day ' + (g.day + 1));

  // Standings rows from season.standings.
  let scache = { ver: -1 };
  UI.standings = function () {
    if (scache.ver === UI.state.ver && scache.season === UI.state.season) return scache.rows;
    const st = (UI.state.season && UI.state.season.standings) || {};
    const rows = {};
    UI.teams().forEach(t => {
      const x = st[t.abbr] || {};
      const w = x.w || 0, l = x.l || 0;
      const streak = typeof x.streak === 'number' ? (x.streak > 0 ? 'W' + x.streak : x.streak < 0 ? 'L' + (-x.streak) : '-') : (x.streak || '-');
      const l10 = Array.isArray(x.last10) && x.last10.length ? x.last10.filter(v => v).length + '-' + x.last10.filter(v => !v).length : '-';
      rows[t.abbr] = {
        abbr: t.abbr, conf: t.conf, div: t.div, w, l, pct: w + l ? w / (w + l) : 0,
        hw: (x.home || [0, 0])[0], hl: (x.home || [0, 0])[1], aw: (x.away || [0, 0])[0], al: (x.away || [0, 0])[1],
        diff: (x.pf || 0) - (x.pa || 0), streakText: streak, l10
      };
    });
    scache = { ver: UI.state.ver, season: UI.state.season, rows };
    return rows;
  };
  UI.confTable = function (conf) {
    const rows = Object.values(UI.standings()).filter(r => r.conf === conf)
      .sort((a, b) => b.pct - a.pct || b.diff - a.diff || a.abbr.localeCompare(b.abbr));
    const lead = rows[0];
    rows.forEach((r, i) => {
      r.rank = i + 1;
      const gb = lead ? ((lead.w - r.w) + (r.l - lead.l)) / 2 : 0;
      r.gb = gb === 0 ? '-' : (gb % 1 ? gb.toFixed(1) : String(gb));
    });
    return rows;
  };
  UI.record = abbr => {
    const r = UI.standings()[abbr];
    return r ? r.w + '-' + r.l : '0-0';
  };

  // Player season totals (season.playerStats, or season.playoffStats).
  UI.seasonTotals = function (playoffs) {
    const s = UI.state.season;
    return (s && (playoffs ? s.playoffStats : s.playerStats)) || {};
  };
  UI.perGame = function (t) {
    if (!t || !t.g) return null;
    const g = t.g;
    const reb = t.reb != null ? t.reb : (t.oreb || 0) + (t.dreb || 0);
    return {
      g, mpg: t.min / g, pts: t.pts / g, reb: reb / g, ast: t.ast / g, stl: t.stl / g, blk: t.blk / g,
      fgp: t.fga ? t.fgm / t.fga : null, tpp: t.tpa ? t.tpm / t.tpa : null, ftp: t.fta ? t.ftm / t.fta : null
    };
  };

  // Game log for a player from the stored box scores.
  UI.gameLog = function (pid) {
    const out = [];
    UI.games().forEach(g => {
      if (!g.played) return;
      const r = g.result;
      if (!r) return;
      ['home', 'away'].forEach(side => {
        const box = r[side] && r[side].box;
        const row = Array.isArray(box) && box.find(x => x && x.id === pid);
        if (row) out.push({ game: g, side, row });
      });
    });
    return out.sort((a, b) => b.game.day - a.game.day);
  };

  UI.bump = () => { UI.state.ver++; };
})();
