// Watch live (#/live/<gameId> or #/live/next): plays the user's next game with ENGINE.simGame,
// replays its play-by-play on a timer with a scoreboard and a live box score, then records the
// game into the season the same way ENGINE.simDays does.
// Also holds the small shared helpers (UI.extras) used by ui-commish.js and fantasy.js.
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI) { if (window.console) console.warn('[live] UI core (js/ui-core.js) is not loaded; watch live is off.'); return; }
  const P = UI.pages = UI.pages || {};
  const esc = UI.esc;

  // =====================================================================
  // Shared helpers for the extra pages
  // =====================================================================
  const X = UI.extras = UI.extras || {};

  const looksLikeState = o => !!(o && typeof o === 'object' && o.players && typeof o.players === 'object' &&
    !Array.isArray(o.players) && o.teams && typeof o.teams === 'object' && o.season && Array.isArray(o.season.days));

  // The full league state (contract-v2). The UI keeps it in UI.state.game; older names are tried too.
  X.getState = function () {
    const st = UI.state || {};
    const cands = [st.game];
    try { if (typeof UI.getLeagueState === 'function') cands.push(UI.getLeagueState()); } catch (e) { /* ignore */ }
    cands.push(st.lg, st.franchise, st.leagueState, window.A13_STATE);
    for (let i = 0; i < cands.length; i++) if (looksLikeState(cands[i])) return cands[i];
    return null;
  };

  // The engine's season object, from the league state, or the plain season the first UI keeps.
  X.season = function () {
    const s = X.getState();
    if (s) return s.season;
    const es = UI.state && UI.state.season;
    return es && Array.isArray(es.days) ? es : null;
  };

  // The league the engine plays games with.
  X.view = function () {
    const s = X.getState();
    if (s && window.LEAGUE && typeof window.LEAGUE.leagueView === 'function') return window.LEAGUE.leagueView(s);
    if (typeof UI.leagueForEngine === 'function' && UI.state.league) return UI.leagueForEngine();
    return null;
  };

  X.userTeam = function () {
    const s = X.getState();
    return (s && s.userTeam) || (UI.userTeam && UI.userTeam()) || null;
  };

  // Make a league state the active one (in a save slot when the save module is there).
  X.setState = function (state, opts) {
    opts = opts || {};
    const S = UI.saves;
    if (S && typeof S.activate === 'function') {
      const slot = Number(opts.slot) || (typeof S.firstEmpty === 'function' && S.firstEmpty()) || UI.state.slot || 1;
      S.activate(slot, state, { name: opts.name || null, created: Date.now() });
    } else {
      UI.state.game = state;
      window.A13_STATE = state;
    }
    if (UI.bump) UI.bump();
    return state;
  };

  // Save after a change, with whatever the save module offers.
  X.persist = async function () {
    try {
      if (typeof UI.saveNow === 'function') return await UI.saveNow();
      if (UI.saves && typeof UI.saves.write === 'function') return await UI.saves.write();
    } catch (e) {
      console.warn('[extras] save failed', e);
      UI.toast('Could not save: ' + (e && e.message ? e.message : e), 'error');
    }
    return false;
  };

  X.refresh = function () {
    if (UI.bump) UI.bump();
    try { if (UI.updateChrome) UI.updateChrome(); } catch (e) { /* ignore */ }
  };

  X.log = function (state, type, text, ids, extra) {
    state.transactions = state.transactions || [];
    state.transactions.push(Object.assign({ year: state.year, day: state.day || 0, type, text, ids: ids || [] }, extra || {}));
  };

  X.teamName = function (abbr) {
    const s = X.getState();
    const t = s && s.teams && s.teams[abbr];
    if (t && t.city) return (t.city + ' ' + (t.name || '')).trim();
    return UI.teamName ? UI.teamName(abbr) : abbr;
  };

  X.msg = (title, body, actions) => UI.empty(title, body, '<div class="row-btns">' + (actions || '<a class="btn" href="#/home">HOME</a>') + '</div>');

  // Renders a friendly message and returns true when something needed is missing.
  X.need = function (app, what) {
    const E = window.ENGINE;
    if (what.indexOf('engine') >= 0 && !(E && typeof E.simGame === 'function')) {
      app.innerHTML = X.msg('SIM ENGINE NOT LOADED', 'The game engine (<code>js/engine.js</code>) did not load, so games cannot be played here yet.');
      return true;
    }
    if (what.indexOf('league') >= 0 && !(window.LEAGUE && typeof window.LEAGUE.newLeague === 'function')) {
      app.innerHTML = X.msg('LEAGUE MODULE NOT LOADED', 'The league orchestrator (<code>js/league.js</code>) did not load, so this page cannot run yet.');
      return true;
    }
    if (what.indexOf('state') >= 0 && !X.getState()) {
      app.innerHTML = X.msg('NO LEAGUE LOADED', 'Start a new league or load a save first.',
        '<a class="btn btn-gold" href="#/new">PLAY THE ASSOCIATION</a><a class="btn" href="#/fantasy/new">FANTASY DRAFT</a><a class="btn" href="#/saves">SAVES</a>');
      return true;
    }
    if (what.indexOf('season') >= 0 && !X.season()) {
      app.innerHTML = X.msg('NO SEASON LOADED', 'Start a new league or load a save first.',
        '<a class="btn btn-gold" href="#/new">PLAY THE ASSOCIATION</a><a class="btn" href="#/saves">SAVES</a>');
      return true;
    }
    return false;
  };

  X.money = d => {
    const n = Number(d);
    if (!n) return '-';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    return '$' + Math.round(n / 1e3) + 'K';
  };

  // Page leave hooks, run before any page draws.
  const leaveHooks = [];
  X.onLeave = fn => leaveHooks.push(fn);
  function runLeave() {
    while (leaveHooks.length) { const fn = leaveHooks.shift(); try { fn(); } catch (e) { console.warn('[extras] leave hook failed', e); } }
  }

  // =====================================================================
  // Router: draw the extra pages even if the main router does not list them,
  // and add links to them on the season and home pages.
  // =====================================================================
  const MINE = ['live', 'commish', 'fantasy'];
  const NAV = { live: 'season', commish: 'home', fantasy: 'home' };
  function addLinks(page) {
    const app = document.getElementById('app');
    if (!app) return;
    if (page === 'season' && !app.querySelector('a[href^="#/live"]')) {
      const box = app.querySelector('.sim-btns');
      if (box && X.season() && X.nextUserGame()) {
        const a = document.createElement('a');
        a.className = 'btn btn-gold lv-watch';
        a.href = '#/live/next';
        a.textContent = 'WATCH LIVE';
        box.insertBefore(a, box.firstChild);
      }
    }
    // The home menu stays short on purpose; fantasy draft and commissioner live under More.
  }
  const origRoute = UI.route;
  UI.route = function () {
    runLeave();
    const parts = (location.hash || '#/home').replace(/^#\/?/, '').split('/');
    const page = parts[0] || 'home';
    const arg = parts.slice(1).join('/');
    // An older router that only knows its own pages: draw ours here.
    if (typeof UI.extraPages !== 'function' && MINE.indexOf(page) >= 0 && typeof P[page] === 'function') {
      const app = document.getElementById('app');
      UI.$$('#mainnav a').forEach(a => a.classList.toggle('on', a.getAttribute('data-nav') === NAV[page]));
      if (!UI.state.league) { app.innerHTML = UI.notBuilt ? UI.notBuilt('data') : X.msg('LEAGUE DATA NOT LOADED', 'The league file did not load.'); return; }
      let decoded = arg;
      try { decoded = decodeURIComponent(arg); } catch (e) { /* keep raw */ }
      try { P[page](app, decoded); }
      catch (e) {
        console.warn('Page failed', page, e);
        app.innerHTML = X.msg('SOMETHING WENT WRONG', 'This page could not be drawn: ' + esc(e && e.message ? e.message : e));
      }
      return;
    }
    const out = typeof origRoute === 'function' ? origRoute.apply(this, arguments) : undefined;
    try { addLinks(page); } catch (e) { console.warn('[extras] links failed', e); }
    return out;
  };

  // =====================================================================
  // Recording a game the way ENGINE.simDays does (playGame, storeResult,
  // recordStanding, injuries, playoff series). Used only when the engine
  // does not export its own recordGame.
  // =====================================================================
  const KEEP_PBP = 20;
  const DAY_MS = 86400000;
  const round1 = x => Math.round(x * 10) / 10;
  const statKeys = () => (window.ENGINE && window.ENGINE.STAT_KEYS) || ['min', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf'];
  function emptyLine() { const o = { g: 0, gs: 0 }; statKeys().forEach(k => { o[k] = 0; }); return o; }
  function addLine(map, row) {
    const s = map[row.id] || (map[row.id] = emptyLine());
    if (row.min > 0) s.g++;
    if (row.starter) s.gs++;
    statKeys().forEach(k => { s[k] = (s[k] || 0) + (row[k] || 0); });
    s.min = round1(s.min);
  }
  function teamMeta(season, abbr) {
    return (season.teams || []).find(t => t.abbr === abbr) || { abbr, conf: 'East', div: 'East' };
  }
  function recordStanding(season, home, away, hs, as) {
    const H = season.standings[home], A = season.standings[away];
    if (!H || !A) return;
    const hm = teamMeta(season, home), am = teamMeta(season, away);
    const homeWon = hs > as;
    const W = homeWon ? H : A, L = homeWon ? A : H;
    W.w++; L.l++;
    W.streak = W.streak > 0 ? W.streak + 1 : 1;
    L.streak = L.streak < 0 ? L.streak - 1 : -1;
    if (homeWon) { H.home[0]++; A.away[1]++; } else { H.home[1]++; A.away[0]++; }
    if (hm.conf === am.conf) { W.confW++; L.confL++; }
    if (hm.div === am.div) { W.divW++; L.divL++; }
    H.pf += hs; H.pa += as; A.pf += as; A.pa += hs;
    W.last10.push(1); L.last10.push(0);
    if (W.last10.length > 10) W.last10.shift();
    if (L.last10.length > 10) L.last10.shift();
  }
  function rostersBy(league) {
    const by = {};
    (league.teams || []).forEach(t => { by[t.abbr] = []; });
    (league.players || []).forEach(p => { if (by[p.team]) by[p.team].push(p); });
    return by;
  }
  function countDownInjuries(season, abbr, by, fresh) {
    (by[abbr] || []).forEach(p => {
      const e = season.injuries[p.id];
      if (!e || fresh[p.id]) return;
      e.games--;
      if (e.games <= 0) delete season.injuries[p.id];
    });
  }
  // Same trimming as the engine: compact box rows, full box scores for the last KEEP_FULL games and
  // every user team game, play-by-play for the last KEEP_PBP games.
  const KEEP_FULL = 120;
  function compactRow(r) {
    const o = { id: r.id, min: r.min, pts: r.pts };
    statKeys().forEach(k => { if (r[k] && o[k] == null) o[k] = r[k]; });
    if (r.starter) o.starter = true;
    return o;
  }
  function storeResult(season, g, res) {
    season.boxScores = season.boxScores || {};
    season.order = season.order || [];
    const stored = {
      id: res.id, date: res.date,
      home: { abbr: res.home.abbr, pts: res.home.pts, box: res.home.box.map(compactRow) },
      away: { abbr: res.away.abbr, pts: res.away.pts, box: res.away.box.map(compactRow) },
      quarters: res.quarters, ot: res.ot, pbp: res.pbp
    };
    if (res.playoff) stored.playoff = true;
    if (res.injuries && res.injuries.length) stored.injuries = res.injuries;
    season.boxScores[g.id] = stored;
    season.order.push(g.id);
    const len = season.order.length;
    const oldP = season.order[len - 1 - KEEP_PBP];
    if (oldP && season.boxScores[oldP]) delete season.boxScores[oldP].pbp;
    const oldF = season.order[len - 1 - KEEP_FULL];
    const r = oldF && season.boxScores[oldF];
    if (r && r.home && typeof r.home === 'object') {
      const user = season.userTeam;
      if (!user || (r.home.abbr !== user && r.away.abbr !== user)) {
        const slim = { id: r.id, home: r.home.abbr, away: r.away.abbr, hs: r.home.pts, as: r.away.pts, date: r.date };
        if (r.playoff) slim.playoff = true;
        season.boxScores[oldF] = slim;
      }
    }
  }

  // playoff helpers, same rules as the engine
  const pct = s => (s.w + s.l ? s.w / (s.w + s.l) : 0);
  function rankTeams(season, list) {
    return list.slice().sort((a, b) => {
      const A = season.standings[a], B = season.standings[b];
      let d = pct(B) - pct(A);
      if (Math.abs(d) > 1e-9) return d;
      d = (B.pf - B.pa) - (A.pf - A.pa);
      if (d) return d;
      return a < b ? -1 : 1;
    });
  }
  function makeSeries(season, id, conf, round, a, aSeed, b, bSeed, startDay) {
    const hiFirst = rankTeams(season, [a, b])[0] === a;
    return { id, conf, round, hi: hiFirst ? a : b, lo: hiFirst ? b : a, hiSeed: hiFirst ? aSeed : bSeed, loSeed: hiFirst ? bSeed : aSeed,
      hw: 0, lw: 0, games: [], winner: null, next: startDay };
  }
  function findSeries(b, id) {
    for (let r = 0; r < b.rounds.length; r++) for (let i = 0; i < b.rounds[r].length; i++) if (b.rounds[r][i].id === id) return b.rounds[r][i];
    return null;
  }
  const seedOf = (s, abbr) => (s.hi === abbr ? s.hiSeed : s.loSeed);
  function finalsMvp(season, s) {
    let best = null, bestV = -1, id = null;
    s.games.forEach(gid => {
      const r = season.boxScores[gid];
      if (!r || typeof r.home !== 'object') return;
      const side = r.home.abbr === s.winner ? r.home : r.away;
      side.box.forEach(row => {
        const f = k => row[k] || 0;
        const v = f('pts') + 1.2 * (f('oreb') + f('dreb')) + 1.5 * f('ast') + 2 * (f('stl') + f('blk')) - f('tov');
        best = best || {};
        best[row.id] = (best[row.id] || 0) + v;
      });
    });
    if (!best) return null;
    Object.keys(best).forEach(k => { if (best[k] > bestV) { bestV = best[k]; id = k; } });
    return id;
  }
  function applyPlayoffResult(season, g, res) {
    const b = season.playoffs;
    const s = b && findSeries(b, g.series);
    if (!s) return;
    s.games.push(g.id);
    if (res.winner === s.hi) s.hw++; else s.lw++;
    if (s.hw === 4) s.winner = s.hi;
    if (s.lw === 4) s.winner = s.lo;
    const round = b.rounds[b.round - 1];
    if (!round.every(x => x.winner)) return;
    if (b.round === 4 || round.length === 1) {
      b.champion = round[0].winner;
      b.finalsMvp = finalsMvp(season, round[0]);
      return;
    }
    const nextRound = [];
    const startDay = b.cal + 1;
    if (b.round === 3) {
      const e = round.filter(x => x.conf === 'East')[0];
      const w = round.filter(x => x.conf === 'West')[0];
      nextRound.push(makeSeries(season, 'F', 'Finals', 4, e.winner, seedOf(e, e.winner), w.winner, seedOf(w, w.winner), startDay));
    } else {
      ['East', 'West'].forEach((c, ci) => {
        const list = round.filter(x => x.conf === c);
        for (let i = 0; i + 1 < list.length; i += 2) {
          const x = list[i], y = list[i + 1];
          nextRound.push(makeSeries(season, c[0] + (b.round + 1) + '-' + (i / 2 + 1), c, b.round + 1,
            x.winner, seedOf(x, x.winner), y.winner, seedOf(y, y.winner), startDay + ((i / 2 + ci) % 2)));
        }
      });
    }
    b.rounds.push(nextRound);
    b.round++;
  }
  function addDays(s, n) {
    const p = String(s).split('-');
    const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]) + n * DAY_MS);
    const pad = x => (x < 10 ? '0' : '') + x;
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  // Adds the next playoff day to season.days, like the engine does at the start of a playoff day.
  function schedulePlayoffDay(season) {
    const E = window.ENGINE;
    if (E && typeof E.schedulePlayoffDay === 'function') return E.schedulePlayoffDay(season);
    const b = season.playoffs;
    if (!b || b.champion) return false;
    for (let tries = 0; tries < 10; tries++) {
      const round = b.rounds[b.round - 1];
      const games = [];
      round.forEach(s => {
        if (s.winner || s.next > b.cal) return;
        const gn = s.hw + s.lw + 1;
        const hiHome = gn === 1 || gn === 2 || gn === 5 || gn === 7;
        games.push({ id: 'p' + s.id + '-' + gn, home: hiHome ? s.hi : s.lo, away: hiHome ? s.lo : s.hi, played: false, hs: null, as: null, series: s.id, gameNum: gn });
        s.next = b.cal + 2;
      });
      const date = addDays(b.startDate, b.cal);
      b.cal++;
      if (games.length) { season.days.push({ date, games, playoff: true }); return true; }
    }
    return false;
  }

  // Record one simulated game into the season. Mirrors the engine's playGame.
  X.recordGame = function (season, g, res, league, isPlayoff, date) {
    const E = window.ENGINE;
    if (E && typeof E.recordGame === 'function') return E.recordGame(season, g, res, league, { playoff: isPlayoff, date });
    res.id = g.id; res.date = date;
    if (isPlayoff) res.playoff = true;
    g.played = true; g.hs = res.home.pts; g.as = res.away.pts;
    const statMap = isPlayoff ? (season.playoffStats = season.playoffStats || {}) : (season.playerStats = season.playerStats || {});
    res.home.box.forEach(r => addLine(statMap, r));
    res.away.box.forEach(r => addLine(statMap, r));
    if (!isPlayoff) recordStanding(season, g.home, g.away, res.home.pts, res.away.pts);
    const by = rostersBy(league);
    const fresh = {};
    season.injuries = season.injuries || {};
    (res.injuries || []).forEach(inj => { fresh[inj.id] = 1; });
    countDownInjuries(season, g.home, by, fresh);
    countDownInjuries(season, g.away, by, fresh);
    (res.injuries || []).forEach(inj => {
      const cur = season.injuries[inj.id];
      if (!cur || cur.games < inj.games) season.injuries[inj.id] = { type: inj.type, games: inj.games };
    });
    storeResult(season, g, res);
    if (isPlayoff) applyPlayoffResult(season, g, res);
    return res;
  };

  // =====================================================================
  // Finding the game and getting to its day
  // =====================================================================
  // Returns { game, dayIndex, day } for the user's next unplayed game, or a specific game id.
  X.nextUserGame = function (id) {
    const season = X.season();
    const user = X.userTeam();
    if (!season || !user) return null;
    const from = Math.max(0, season.day || 0);
    for (let i = id ? 0 : from; i < season.days.length; i++) {
      const d = season.days[i];
      for (let j = 0; j < d.games.length; j++) {
        const g = d.games[j];
        if (id ? g.id === id : (!g.played && (g.home === user || g.away === user))) return { game: g, dayIndex: i, day: d };
      }
    }
    return null;
  };

  // In the playoffs the engine only schedules a day when it plays it; schedule it now so it can be watched.
  function preparePlayoffDay(season) {
    const E = window.ENGINE;
    if (season.phase === 'done') return false;
    if (season.phase === 'regular' && season.day >= season.days.length) {
      if (!(E && typeof E.seedPlayoffs === 'function')) return false;
      season.phase = 'playoffs';
      season.playoffs = E.seedPlayoffs(season);
    }
    if (season.phase === 'playoffs' && season.day >= season.days.length) return schedulePlayoffDay(season);
    return false;
  }

  function nextRng() {
    const E = window.ENGINE;
    const s = X.getState();
    const mk = E && typeof E.rng === 'function' ? E.rng : UI.rng;
    if (s && s.rngSeed) {
      s.rngSeed = (s.rngSeed * 1103515245 + 12345) % 2147483647;
      return mk(s.rngSeed);
    }
    const sv = UI.state.save;
    if (sv) {
      sv.sims = (sv.sims || 0) + 1;
      return UI.rng(((sv.seed || 1) ^ Math.imul(sv.sims, 2654435761)) >>> 0);
    }
    return Math.random;
  }

  // Sim the league up to (not including) the given day. Returns { ok, reason }.
  function simUntil(dayIndex, force) {
    const season = X.season();
    const s = X.getState();
    const E = window.ENGINE;
    let guard = 0;
    while (season.day < dayIndex && guard++ < 400) {
      const before = season.day;
      if (s && window.LEAGUE && typeof window.LEAGUE.advance === 'function' && !force) {
        const r = window.LEAGUE.advance(s, { days: 1 });
        if (r && r.stopped === 'event' && season.day === before) return { ok: false, reason: 'event' };
      } else {
        E.simDays(season, 1, nextRng(), X.view());
        if (s) s.day = season.day;
      }
      if (season.day === before) return { ok: false, reason: 'stuck' };
    }
    return { ok: season.day >= dayIndex };
  }

  function teamFor(season, league, abbr) {
    const by = rostersBy(league);
    const lt = (league.teams || []).find(t => t.abbr === abbr) || null;
    const lineups = season.lineups && season.lineups[abbr];
    return {
      abbr,
      players: by[abbr] || [],
      starters: (lineups && lineups.starters) || (lt && lt.starters) || null,
      minutes: (lineups && lineups.minutes) || null
    };
  }

  // =====================================================================
  // Play-by-play parsing for the live box score
  // =====================================================================
  const LINE = /^(Q\d|OT\d+) (\d+):(\d\d) (?:([A-Z][A-Z0-9]{1,3}) )?(.*?)(?: \((\d+)-(\d+)\))?$/;
  function periodIndex(p) { return p[0] === 'Q' ? Number(p.slice(1)) - 1 : 3 + Number(p.slice(2)); }
  function elapsedAt(p, m, s) {
    const i = periodIndex(p);
    const left = m * 60 + s;
    return i < 4 ? i * 720 + (720 - left) : 2880 + (i - 4) * 300 + (300 - left);
  }

  function makeParser(res) {
    const sides = { [res.home.abbr]: 'home', [res.away.abbr]: 'away' };
    const names = { home: [], away: [] };
    ['home', 'away'].forEach(side => {
      res[side].box.forEach(r => { if (r.name) names[side].push({ name: r.name, id: r.id }); });
      names[side].sort((a, b) => b.name.length - a.name.length);
    });
    const other = side => (side === 'home' ? 'away' : 'home');
    const find = (side, text) => {
      for (const n of names[side]) if (text === n.name || text.indexOf(n.name + ' ') === 0) return n;
      return null;
    };
    const byName = (side, name) => names[side].find(n => n.name === name) || null;
    let la = 0, lh = 0; // the engine only prints the score when it changes
    return function (line) {
      const m = LINE.exec(line);
      if (!m) return { text: line };
      if (m[6] != null) { la = +m[6]; lh = +m[7]; }
      const ev = { period: m[1], clock: m[2] + ':' + m[3], elapsed: elapsedAt(m[1], +m[2], +m[3]), team: m[4] || null,
        body: m[5], as: la, hs: lh, text: line, stats: [] };
      const side = ev.team && sides[ev.team];
      if (!side) return ev;
      ev.side = side;
      const who = find(side, ev.body);
      if (!who) return ev;
      const rest = ev.body.slice(who.name.length + 1);
      const add = (sd, id, k, v) => ev.stats.push([sd, id, k, v == null ? 1 : v]);
      let mm;
      if ((mm = /^makes (\d+) of (\d+) free throws$/.exec(rest))) {
        add(side, who.id, 'ftm', +mm[1]); add(side, who.id, 'fta', +mm[2]); add(side, who.id, 'pts', +mm[1]);
      } else if ((mm = /^makes (.+?)(?: \((.+) assists\))?(?:, fouled by (.+))?$/.exec(rest))) {
        const three = mm[1].indexOf('three point') >= 0;
        add(side, who.id, 'fgm'); add(side, who.id, 'fga'); add(side, who.id, 'pts', three ? 3 : 2);
        if (three) { add(side, who.id, 'tpm'); add(side, who.id, 'tpa'); }
        const a = mm[2] && byName(side, mm[2]);
        if (a) add(side, a.id, 'ast');
        const f = mm[3] && byName(other(side), mm[3]);
        if (f) add(other(side), f.id, 'pf');
        ev.score = true;
      } else if ((mm = /^misses (.+?)(?:, blocked by (.+))?$/.exec(rest))) {
        add(side, who.id, 'fga');
        if (mm[1].indexOf('three point') >= 0) add(side, who.id, 'tpa');
        const b = mm[2] && byName(other(side), mm[2]);
        if (b) add(other(side), b.id, 'blk');
      } else if ((mm = /^fouled by (.+?) on /.exec(rest))) {
        const f = byName(other(side), mm[1]);
        if (f) add(other(side), f.id, 'pf');
      } else if (rest === 'offensive rebound') add(side, who.id, 'oreb');
      else if (rest === 'defensive rebound') add(side, who.id, 'dreb');
      else if ((mm = /^turnover, stolen by (.+)$/.exec(rest))) {
        add(side, who.id, 'tov');
        const st = byName(other(side), mm[1]);
        if (st) add(other(side), st.id, 'stl');
      } else if (rest === 'turnover') add(side, who.id, 'tov');
      else if (rest === 'offensive foul') { add(side, who.id, 'tov'); add(side, who.id, 'pf'); }
      else if (rest === 'personal foul') add(side, who.id, 'pf');
      else if (rest === 'checks in') ev.sub = true;
      return ev;
    };
  }

  // =====================================================================
  // The page
  // =====================================================================
  const SPEEDS = { 1: 900, 4: 225, 16: 56 };
  let live = null; // the game being watched

  function stopTimer() { if (live && live.timer) { clearTimeout(live.timer); live.timer = null; } }

  P.live = function (app, arg) {
    if (X.need(app, 'engine season')) return;
    const season = X.season();
    const user = X.userTeam();
    if (!user) { app.innerHTML = X.msg('NO USER TEAM', 'This league has no user team.'); return; }

    // still watching this game (for example after a redraw)
    if (live && !live.recorded && (!arg || arg === 'next' || arg === live.game.id)) { drawLive(app); return; }

    const id = arg && arg !== 'next' ? arg : null;
    let found = X.nextUserGame(id);
    if (!found && !id && preparePlayoffDay(season)) found = X.nextUserGame(null);
    if (!found) {
      const over = season.phase === 'done' || (season.phase === 'playoffs' && season.playoffs && season.playoffs.champion);
      app.innerHTML = X.msg(id ? 'GAME NOT FOUND' : 'NO GAME TO WATCH',
        id ? 'There is no game with the id ' + esc(id) + ' in this season.'
          : over ? 'The season is over for everyone.'
          : season.phase === 'playoffs' ? 'Your team has no playoff game on the schedule. Sim ahead from the season page.'
          : 'Your team has no unplayed games left this season.',
        '<a class="btn" href="#/season">BACK TO SEASON</a>');
      return;
    }
    if (found.game.played) {
      app.innerHTML = X.msg('ALREADY PLAYED', 'That game is final: ' + esc(found.game.away) + ' ' + found.game.as + ', ' + esc(found.game.home) + ' ' + found.game.hs + '.',
        `<a class="btn" href="#/game/${esc(found.game.id)}">BOX SCORE</a><a class="btn" href="#/season">BACK TO SEASON</a>`);
      return;
    }
    if (found.dayIndex < (season.day || 0)) {
      app.innerHTML = X.msg('GAME DAY HAS PASSED', 'That day has already been simmed.', '<a class="btn" href="#/season">BACK TO SEASON</a>');
      return;
    }
    drawPregame(app, found);
  };

  P.live.navLabel = 'Watch Live';
  P.live.navDesc = 'Watch your next game play by play with a live box score';

  function recordOf(season, abbr) {
    const s = season.standings && season.standings[abbr];
    return s ? s.w + '-' + s.l : '0-0';
  }

  function drawPregame(app, found) {
    const season = X.season();
    const g = found.game;
    const ahead = found.dayIndex - (season.day || 0);
    const label = found.day.playoff ? 'PLAYOFFS | GAME ' + (g.gameNum || '') : 'REGULAR SEASON';
    app.innerHTML = `
      <section class="lv-board lv-pre">
        <div class="lv-team">${UI.logo(g.away, 84)}<b>${esc(X.teamName(g.away))}</b><small>${esc(recordOf(season, g.away))} | AWAY</small></div>
        <div class="lv-mid"><div class="lv-k">${esc(label)}</div><div class="lv-at">@</div><div class="lv-k">${esc(found.day.date || '')}</div></div>
        <div class="lv-team">${UI.logo(g.home, 84)}<b>${esc(X.teamName(g.home))}</b><small>${esc(recordOf(season, g.home))} | HOME</small></div>
      </section>
      <div class="lv-pre-actions">
        ${ahead > 0 ? `<p class="muted">Your game is ${ahead} day${ahead > 1 ? 's' : ''} ahead. The rest of the league plays those days first.</p>` : ''}
        <div class="row-btns center"><button type="button" class="btn btn-gold" id="lvTip">TIP OFF</button><a class="btn" href="#/season">BACK TO SEASON</a></div>
        <p class="lv-err" id="lvErr" hidden></p>
      </div>`;
    const tip = UI.$('#lvTip');
    tip.addEventListener('click', () => start(app, found, false));
  }

  function start(app, found, force) {
    const season = X.season();
    const err = UI.$('#lvErr');
    if (found.dayIndex > season.day) {
      const r = simUntil(found.dayIndex, force);
      X.refresh();
      if (!r.ok) {
        if (r.reason === 'event') {
          err.hidden = false;
          err.innerHTML = 'You have decisions waiting (trade offers, injuries or contracts). Handle them on the season page first, or <button type="button" class="btn btn-small" id="lvForce">SIM AHEAD ANYWAY</button>';
          UI.$('#lvForce').addEventListener('click', () => start(app, found, true));
        } else {
          err.hidden = false;
          err.textContent = 'The league could not be simmed to your game day.';
        }
        X.persist();
        return;
      }
    }
    const again = X.nextUserGame(found.game.id);
    if (!again || again.game.played) { X.persist(); UI.toast('That game was already played.'); location.hash = '#/season'; return; }
    const g = again.game;
    const view = X.view();
    if (!view) { err.hidden = false; err.textContent = 'The league view is missing, so the game cannot be played.'; return; }
    let res;
    try {
      res = window.ENGINE.simGame(teamFor(season, view, g.home), teamFor(season, view, g.away), nextRng(), { injuries: season.injuries, norms: season.norms });
    } catch (e) {
      console.warn('[live] simGame failed', e);
      err.hidden = false; err.textContent = 'The game engine failed: ' + (e && e.message ? e.message : e);
      return;
    }
    const parse = makeParser(res);
    const events = (res.pbp || []).map(parse);
    const stats = { home: {}, away: {} };
    ['home', 'away'].forEach(side => res[side].box.forEach(r => { stats[side][r.id] = { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 }; }));
    const totalSec = 2880 + Math.max(0, (res.quarters || []).length - 4) * 300;
    live = { game: g, dayIndex: again.dayIndex, day: again.day, res, events, i: 0, speed: 1, stats, totalSec, view,
      as: 0, hs: 0, period: 'Q1', clock: '12:00', elapsed: 0, recorded: false, timer: null, quarters: [] };
    X.onLeave(leaveLive);
    drawLive(app);
    tick();
  }

  // Leaving mid-game still counts the game, so a result cannot be re-rolled.
  function leaveLive() {
    stopTimer();
    if (live && !live.recorded) {
      finish(true);
      UI.toast('Game recorded: ' + live.game.away + ' ' + live.res.away.pts + ', ' + live.game.home + ' ' + live.res.home.pts + '.');
    }
    live = null;
  }

  function finish(silent) {
    if (!live || live.recorded) return;
    stopTimer();
    while (live.i < live.events.length) apply(live.events[live.i++]);
    const season = X.season();
    const state = X.getState();
    const g = live.game;
    if (g.played) { live.recorded = true; return; }
    X.recordGame(season, g, live.res, live.view, !!live.day.playoff, live.day.date);
    live.recorded = true;
    // injuries to the user's players become events and news, like the league sim does
    if (state) {
      (live.res.injuries || []).forEach(inj => {
        const p = state.players && state.players[inj.id];
        if (!p || p.team !== state.userTeam || !(inj.games > 0)) return;
        state.events = state.events || [];
        state.events.push({ type: 'injury', playerId: inj.id, text: p.name + ': ' + inj.type + ', out about ' + inj.games + ' games' });
        state.news = state.news || [];
        state.news.unshift({ year: state.year, day: state.day, headline: p.name + ' injured', body: inj.type + ', expected to miss about ' + inj.games + ' games.', ids: [inj.id] });
      });
    }
    X.refresh();
    X.persist();
    if (!silent) drawFinal();
  }

  function apply(ev) {
    if (!ev) return;
    if (ev.period) {
      live.period = ev.period; live.clock = ev.clock; live.elapsed = ev.elapsed;
      live.as = ev.as; live.hs = ev.hs;
    }
    (ev.stats || []).forEach(([side, id, k, v]) => {
      const row = live.stats[side][id];
      if (row) row[k] = (row[k] || 0) + v;
    });
  }

  function tick() {
    if (!live || live.recorded) return;
    if (live.i >= live.events.length) { finish(false); return; }
    const ev = live.events[live.i++];
    apply(ev);
    update(ev);
    live.timer = setTimeout(tick, SPEEDS[live.speed] || 900);
  }

  // ---------- drawing ----------
  function boxTable(side, final) {
    const res = live.res;
    const abbr = res[side].abbr;
    const frac = final ? 1 : Math.min(1, live.elapsed / live.totalSec);
    const rows = res[side].box.map(r => {
      const s = final ? r : live.stats[side][r.id];
      const min = final ? r.min : r.min * frac;
      return { r, s, min };
    });
    const sum = k => rows.reduce((t, x) => t + (x.s[k] || 0), 0);
    const body = rows.map(({ r, s, min }) => `<tr class="${r.starter ? 'lv-st' : ''}"><td class="l"><a href="#/player/${esc(r.id)}">${esc(r.name || r.id)}</a></td>
      <td>${Math.round(min)}</td><td><b>${s.pts}</b></td><td>${s.fgm}-${s.fga}</td><td>${s.tpm}-${s.tpa}</td><td>${s.ftm}-${s.fta}</td>
      <td>${s.oreb + s.dreb}</td><td>${s.ast}</td><td>${s.stl}</td><td>${s.blk}</td><td>${s.tov}</td><td>${s.pf}</td></tr>`).join('');
    return `<div class="lv-box" data-side="${side}">
      <div class="lv-box-h">${UI.logo(abbr, 26)}<b>${esc(X.teamName(abbr).toUpperCase())}</b></div>
      <div class="tscroll"><table class="stats box"><thead><tr><th class="l">PLAYER</th><th>MIN</th><th>PTS</th><th>FG</th><th>3P</th><th>FT</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>PF</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td class="l">TOTALS</td><td>${final ? 240 + 25 * Math.max(0, (res.quarters || []).length - 4) : Math.round(frac * (240 + 25 * Math.max(0, (res.quarters || []).length - 4)))}</td><td><b>${sum('pts')}</b></td><td>${sum('fgm')}-${sum('fga')}</td><td>${sum('tpm')}-${sum('tpa')}</td><td>${sum('ftm')}-${sum('fta')}</td><td>${sum('oreb') + sum('dreb')}</td><td>${sum('ast')}</td><td>${sum('stl')}</td><td>${sum('blk')}</td><td>${sum('tov')}</td><td>${sum('pf')}</td></tr></tfoot>
      </table></div></div>`;
  }

  function periodLabel(p) { return p && p[0] === 'Q' ? p.replace('Q', 'Q') : p; }

  function quarterTable() {
    const q = live.res.quarters || [];
    const cur = periodIndex(live.period || 'Q1');
    const n = Math.max(4, live.recorded ? q.length : cur + 1);
    // running quarter scores from the events shown so far
    const by = [];
    let la = 0, lh = 0;
    for (let i = 0; i < live.i; i++) {
      const ev = live.events[i];
      if (!ev.period) continue;
      const k = periodIndex(ev.period);
      by[k] = by[k] || [0, 0];
      by[k][0] += ev.as - la; by[k][1] += ev.hs - lh;
      la = ev.as; lh = ev.hs;
    }
    const lbl = i => (i < 4 ? 'Q' + (i + 1) : 'OT' + (i - 3));
    const cell = (i, k) => (by[i] ? by[i][k] : (i <= cur ? 0 : '-'));
    const g = live.game;
    return `<div class="tscroll"><table class="stats qtable lv-q"><thead><tr><th class="l">TEAM</th>${Array.from({ length: n }, (_, i) => `<th>${lbl(i)}</th>`).join('')}<th>T</th></tr></thead><tbody>
      <tr><td class="l">${UI.logo(g.away, 20)} ${esc(g.away)}</td>${Array.from({ length: n }, (_, i) => `<td>${cell(i, 0)}</td>`).join('')}<td><b>${live.as}</b></td></tr>
      <tr><td class="l">${UI.logo(g.home, 20)} ${esc(g.home)}</td>${Array.from({ length: n }, (_, i) => `<td>${cell(i, 1)}</td>`).join('')}<td><b>${live.hs}</b></td></tr>
      </tbody></table></div>`;
  }

  function drawLive(app) {
    const g = live.game;
    const season = X.season();
    const label = live.day.playoff ? 'PLAYOFFS | GAME ' + (g.gameNum || '') : (live.day.date || '');
    app.innerHTML = `
      <section class="lv-board" id="lvBoard">
        <div class="lv-team">${UI.logo(g.away, 76)}<b>${esc(X.teamName(g.away))}</b><small>${esc(recordOf(season, g.away))}</small></div>
        <div class="lv-mid">
          <div class="lv-k" id="lvLabel">${esc(label)}</div>
          <div class="lv-score"><span id="lvAs">0</span><i>-</i><span id="lvHs">0</span></div>
          <div class="lv-clock"><b id="lvPer">Q1</b><span id="lvClock">12:00</span></div>
          <div class="lv-prog"><i id="lvProg"></i></div>
        </div>
        <div class="lv-team">${UI.logo(g.home, 76)}<b>${esc(X.teamName(g.home))}</b><small>${esc(recordOf(season, g.home))}</small></div>
      </section>
      <div class="lv-controls" id="lvControls">
        <span class="lv-ck">SPEED</span>
        ${[1, 4, 16].map(s => `<button type="button" class="btn btn-small lv-speed${live.speed === s ? ' on' : ''}" data-speed="${s}">${s}X</button>`).join('')}
        <button type="button" class="btn btn-small" id="lvSkip">SKIP TO END</button>
      </div>
      <div class="lv-grid">
        <section class="lv-feed-wrap">${UI.header('PLAY-BY-PLAY')}<ol class="pbp lv-feed" id="lvFeed"></ol></section>
        <section>${UI.header('SCORING')}<div id="lvQ"></div><div class="lv-last" id="lvLast"></div></section>
      </div>
      <div id="lvBoxes" class="lv-boxes"></div>
      <div id="lvAfter"></div>`;
    app.querySelectorAll('.lv-speed').forEach(b => b.addEventListener('click', () => {
      live.speed = Number(b.getAttribute('data-speed'));
      app.querySelectorAll('.lv-speed').forEach(x => x.classList.toggle('on', x === b));
      if (live.timer) { clearTimeout(live.timer); live.timer = setTimeout(tick, SPEEDS[live.speed]); }
    }));
    UI.$('#lvSkip').addEventListener('click', () => finish(false));
    // replay what has already happened (redraws)
    const feed = UI.$('#lvFeed');
    feed.innerHTML = live.events.slice(Math.max(0, live.i - 80), live.i).reverse().map(feedItem).join('');
    update(null);
    if (live.recorded) drawFinal();
  }

  function feedItem(ev) {
    const t = ev.period ? `<span class="lv-ft">${esc(ev.period)} ${esc(ev.clock)}</span>` : '';
    const team = ev.team ? UI.logo(ev.team, 18) : '<span class="lv-dot"></span>';
    const body = ev.period ? (ev.body || '') : ev.text;
    return `<li class="${ev.score ? 'lv-made' : ''}${ev.team ? '' : ' lv-sys'}">${t}${team}<span class="lv-tx">${esc(body)}</span><span class="lv-sc">${ev.period ? ev.as + '-' + ev.hs : ''}</span></li>`;
  }

  let lastBoxDraw = 0;
  function update(ev) {
    if (!live) return;
    const $ = id => document.getElementById(id);
    if (!$('lvBoard')) return;
    $('lvAs').textContent = live.as;
    $('lvHs').textContent = live.hs;
    $('lvAs').className = live.as > live.hs ? 'lead' : '';
    $('lvHs').className = live.hs > live.as ? 'lead' : '';
    $('lvPer').textContent = live.recorded ? 'FINAL' : periodLabel(live.period);
    $('lvClock').textContent = live.recorded ? '' : live.clock;
    $('lvProg').style.width = Math.min(100, live.elapsed / live.totalSec * 100) + '%';
    if (ev) {
      const feed = $('lvFeed');
      feed.insertAdjacentHTML('afterbegin', feedItem(ev));
      while (feed.children.length > 80) feed.removeChild(feed.lastChild);
      if (ev.score) $('lvLast').innerHTML = `<span class="lv-ck">LAST BASKET</span> ${UI.logo(ev.team, 22)} ${esc(ev.body)}`;
    }
    const now = Date.now();
    if (!ev || live.speed < 16 || now - lastBoxDraw > 250 || live.recorded) {
      lastBoxDraw = now;
      $('lvQ').innerHTML = quarterTable();
      $('lvBoxes').innerHTML = boxTable('away', live.recorded) + boxTable('home', live.recorded);
    }
  }

  function drawFinal() {
    const $ = id => document.getElementById(id);
    if (!live || !$('lvBoard')) return;
    live.elapsed = live.totalSec;
    live.as = live.res.away.pts; live.hs = live.res.home.pts;
    const feed = $('lvFeed');
    feed.innerHTML = live.events.slice(-80).reverse().map(feedItem).join('');
    update(null);
    const ot = Math.max(0, (live.res.quarters || []).length - 4);
    $('lvPer').textContent = 'FINAL' + (ot ? (ot > 1 ? '/' + ot + 'OT' : '/OT') : '');
    $('lvControls').innerHTML = '<span class="lv-ck">GAME OVER</span>';
    const g = live.game;
    const user = X.userTeam();
    const won = (g.home === user && g.hs > g.as) || (g.away === user && g.as > g.hs);
    const season = X.season();
    $('lvAfter').innerHTML = `<div class="lv-final ${won ? 'won' : 'lost'}">
        <div class="lv-k">${won ? 'WIN' : 'LOSS'} | ${esc(user)} NOW ${esc(recordOf(season, user))}</div>
        <div class="row-btns center">
          <button type="button" class="btn btn-gold" id="lvNext">WATCH NEXT GAME</button>
          <a class="btn" href="#/game/${esc(g.id)}">FULL BOX SCORE</a>
          <a class="btn" href="#/season">BACK TO SEASON</a>
        </div></div>`;
    UI.$('#lvNext').addEventListener('click', () => {
      live = null;
      if (location.hash === '#/live/next') UI.route(); else location.hash = '#/live/next';
    });
  }

  // For tests and other pages.
  X.live = {
    current: () => live,
    finishNow: () => finish(false)
  };
})();
