// Draft Challenge (#/challenge): build a starting five, drop it on a franchise with a scrub bench and sim
// one season with playoffs, separate from the Association saves.
//   One season: the real league of 2003-04, 2008-09, 2012-13 or 2016-17. Pick any five (free) or spin the
//   wheel five times and take one player from each team it lands on. Your picks leave their real teams,
//   which sign the best free agent at the spot; the franchise you take over loses its real roster.
//   All-time: veterans from every season in one pool (no rookies), a 30-team, 5-round snake draft against
//   29 AI teams; every team plays its five big minutes with a scrub bench.
// Ratings: 2012-13 is the real 2K13 file (data/league2012.js); the other seasons are rated from real stats
// on the 2K13 scale (data/era-YYYY.js or data/start-YYYY.js, loaded on demand).
// window.CHALLENGE holds the logic (node: tools/test-challenge.js); the page is drawn when the UI is loaded.
(function (root) {
  'use strict';
  var W = root;
  // Every season from 1946-47 (the BAA's first) to 2026-27. 1946-47 to 2002-03 and three later seasons have their
  // own Draft Challenge file (data/era-YYYY.js, rated from that season's stats; the old seasons are scaled to the
  // 2012-13 league so a rating means the same in every era); 2012-13 is the game's own league; the rest use the
  // Association start files (data/start-YYYY.js: opening-night rosters, that season's records and per-game lines).
  // The all-time draft uses data/challenge-pool.js, the best veterans of every season in one small file.
  var ERA_FILES = { 2004: 'data/era-2004.js', 2009: 'data/era-2009.js', 2017: 'data/era-2017.js' };
  for (var ey = 1947; ey <= 2003; ey++) ERA_FILES[ey] = 'data/era-' + ey + '.js';
  var SEASONS = [];
  for (var sy = 1947; sy <= 2027; sy++) SEASONS.push(sy === 2013 ? { year: 2013, label: '2012-13', builtin: true }
    : { year: sy, label: (sy - 1) + '-' + String(sy).slice(2), file: ERA_FILES[sy] || 'data/start-' + sy + '.js', start: !ERA_FILES[sy] });
  var POOL_FILE = 'data/challenge-pool.js';
  var ROUNDS = 5;
  var GROUP = { PG: 'G', SG: 'G', SF: 'W', PF: 'B', C: 'B', G: 'G', F: 'W' };
  var SCRUB_POS = ['PG', 'SG', 'SF', 'PF', 'C', 'PG', 'SF', 'C'];
  var FIRST = ['Marcus', 'Tyler', 'Devin', 'Jamal', 'Corey', 'Brandon', 'Kyle', 'Darnell', 'Trey', 'Andre', 'Rashad', 'Casey', 'Jordan', 'Derrick',
    'Malik', 'Nate', 'Shawn', 'Travis', 'Keith', 'Lamar', 'Reggie', 'Damon', 'Cedric', 'Quinton', 'Terrence', 'Isaiah', 'Wesley', 'Garrett'];
  var LAST = ['Hollins', 'Pruitt', 'Bledsoe', 'Kearns', 'Whitlow', 'Tolliver', 'Mabry', 'Gaines', 'Dupree', 'Kittles', 'Raymond', 'Seals', 'Crum',
    'Haskins', 'Ogden', 'Pippen', 'Lusk', 'Fortson', 'Rowe', 'Sealy', 'Burrell', 'McCants', 'Dorsey', 'Bratton', 'Ivey', 'Stroud', 'Hairston', 'Lyles'];

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function primaryPos(pos) { var p = String(pos || 'SF').toUpperCase().split(/[-\/ ,]/)[0]; return GROUP[p] ? p : 'SF'; }
  function groupOf(p) { return GROUP[primaryPos(p.pos)] || 'W'; }
  function shuffle(list, rng) { for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = list[i]; list[i] = list[j]; list[j] = t; } return list; }
  function seasonInfo(year) { return SEASONS.filter(function (s) { return s.year === +year; })[0] || null; }

  // ---------- season data ----------
  // { year, label, teams: [...], players: [...on teams], free: [...free agents] } or null when not loaded yet
  var cache = {};
  function loaded(year) {
    if (year === 'pool') return !!W.CHALLENGE_POOL;
    var info = seasonInfo(year);
    if (!info) return false;
    return +year === 2013 ? !!W.LEAGUE_2012 : info.start ? !!(W.START_LEAGUES && W.START_LEAGUES[year]) : !!(W.ERA_ROSTERS && W.ERA_ROSTERS[year]);
  }
  // a real player's real position that season (data/pos-history.js), while his real career covers it
  function realPos(id, year) {
    var rows = W.POS_HISTORY && W.POS_HISTORY[id], pos = null;
    if (!rows || rows[0][0] > year || rows[rows.length - 1][0] < year) return null;
    for (var i = 0; i < rows.length; i++) if (rows[i][0] <= year) pos = rows[i][1];
    return pos;
  }
  function seasonData(year) {
    year = +year;
    if (cache[year]) return cache[year];
    var info = seasonInfo(year);
    if (!info || !loaded(year)) return null;
    var src = year === 2013 ? W.LEAGUE_2012 : info.start ? W.START_LEAGUES[year] : W.ERA_ROSTERS[year];
    var prior = W.CAREER_PRIOR || null, startCareer = info.start && src.prior && src.prior.career || {}, lines = info.start && src.seasonStats || {};
    var teams = src.teams.map(function (t) {
      var real = info.start && src.real && src.real[t.abbr];
      return { abbr: t.abbr, city: t.city, name: t.name, conf: t.conf, div: t.div, colors: (t.colors || ['#333', '#777']).slice(0, 2), logo: t.logo || null,
        logoNoRef: !!t.logoNoRef, real: real || t.real || t.record || (year === 2013 && REAL_2013[t.abbr] ? { w: REAL_2013[t.abbr][0], l: REAL_2013[t.abbr][1] } : null) };
    });
    var known = {};
    teams.forEach(function (t) { known[t.abbr] = true; });
    var players = [], free = [];
    src.players.forEach(function (p0) {
      if (p0.stashedUntil) return;
      var p = { id: p0.id, name: p0.name, team: p0.team, pos: (year !== 2013 && realPos(p0.id, year)) || p0.pos, age: p0.age, ht: p0.ht, wt: p0.wt, ovr: p0.ovr, attrs: p0.attrs,
        nbaId: p0.nbaId || null, stats: lines[p0.id] || p0.stats || null, season: year };
      if (p0.tend) p.tend = p0.tend;
      if (info.start) p.rookie = !(startCareer[p0.id] && startCareer[p0.id].length);
      else if (year === 2013) {
        var yrs = prior ? (prior[p0.id] || []).length : null;
        p.rookie = yrs === 0 && !(p0.yearsPro > 0);
      } else p.rookie = !!p0.rookie;
      if (known[p.team]) players.push(p); else { p.team = 'FA'; free.push(p); }
    });
    players.sort(byOvr); free.sort(byOvr);
    cache[year] = { year: year, label: info.label, teams: teams, players: players, free: free,
      champion: src.champion || (year === 2013 ? 'MIA' : null) };
    return cache[year];
  }
  function byOvr(a, b) { return (b.ovr || 0) - (a.ovr || 0) || (a.name < b.name ? -1 : 1); }
  // Real 2012-13 records (Basketball-Reference)
  var REAL_2013 = { MIA: [66, 16], NYK: [54, 28], IND: [49, 32], BKN: [49, 33], CHI: [45, 37], ATL: [44, 38], BOS: [41, 40], MIL: [38, 44],
    PHI: [34, 48], TOR: [34, 48], DET: [29, 53], WAS: [29, 53], CLE: [24, 58], CHA: [21, 61], ORL: [20, 62],
    OKC: [60, 22], SAS: [58, 24], DEN: [57, 25], LAC: [56, 26], MEM: [56, 26], GSW: [47, 35], HOU: [45, 37], LAL: [45, 37],
    UTA: [43, 39], DAL: [41, 41], POR: [33, 49], MIN: [31, 51], SAC: [28, 54], NOH: [27, 55], PHX: [25, 57] };

  // Loads data/era-YYYY.js once (browser). Resolves to the season data.
  var loading = {};
  function load(year) {
    if (year === 'pool') {
      if (W.CHALLENGE_POOL) return Promise.resolve(W.CHALLENGE_POOL);
      if (typeof document === 'undefined') return Promise.reject(new Error('No all-time pool'));
      if (!loading.pool) loading.pool = new Promise(function (res, rej) {
        var sp = document.createElement('script');
        sp.src = POOL_FILE;
        sp.onload = function () { W.CHALLENGE_POOL ? res(W.CHALLENGE_POOL) : rej(new Error('The all-time pool did not load.')); };
        sp.onerror = function () { delete loading.pool; rej(new Error('The all-time pool did not load. Check the connection and try again.')); };
        document.head.appendChild(sp);
      });
      return loading.pool;
    }
    year = +year;
    if (loaded(year)) return Promise.resolve(seasonData(year));
    var info = seasonInfo(year);
    if (!info || !info.file || typeof document === 'undefined') return Promise.reject(new Error('No data for ' + year));
    if (!loading[year]) loading[year] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = info.file;
      s.onload = function () { loaded(year) ? res(seasonData(year)) : rej(new Error('The ' + info.label + ' rosters did not load.')); };
      s.onerror = function () { delete loading[year]; rej(new Error('The ' + info.label + ' rosters did not load. Check the connection and try again.')); };
      document.head.appendChild(s);
    });
    return loading[year];
  }
  function loadAll() { return Promise.all(SEASONS.map(function (s) { return load(s.year).catch(function () { return null; }); })); }

  // ---------- all-time pool ----------
  // Veterans from every loaded season (no rookies, 20+ games, 12+ minutes). Key: bbrefId@year.
  function allTimePool() {
    var E = W.ENGINE, out = [];
    if (W.CHALLENGE_POOL) {
      out = W.CHALLENGE_POOL.players.map(function (p) {
        var q = clone(p);
        q.base = p.id; q.key = p.id + '@' + p.season; q.from = p.team; q.label = (p.season - 1) + '-' + String(p.season).slice(2);
        return q;
      });
      out.sort(byOvr);
      return out;
    }
    SEASONS.forEach(function (s) {
      var d = seasonData(s.year);
      if (!d) return;
      d.players.forEach(function (p) {
        if (p.rookie) return;
        var st = p.stats;
        if (st && (st.g < 20 || st.mpg < 12)) return;
        var q = clone(p);
        q.base = p.id; q.key = p.id + '@' + s.year; q.from = p.team; q.label = s.label;
        // style and defense rates fixed to that season (the ids change, so the engine tables would miss them)
        if (!q.tend && E) {
          var t = clone(E.tendencyOf(p));
          var dr = E.defRates(p);
          t.blk = Math.round(dr.blk * 100) / 10; t.stl = Math.round(dr.stl * 100) / 10;
          delete t.generated;
          q.tend = t;
        }
        out.push(q);
      });
    });
    out.sort(byOvr);
    return out;
  }
  // seasons in the all-time pool
  function poolSeasons() {
    var P = W.CHALLENGE_POOL, seen = {};
    if (P) P.players.forEach(function (p) { seen[p.season] = true; });
    else SEASONS.forEach(function (s) { if (loaded(s.year)) seen[s.year] = true; });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }
  function eraTeam(year, abbr) {
    var d = seasonData(year), P = W.CHALLENGE_POOL;
    var list = d ? d.teams : P && P.teams && P.teams[year] ? P.teams[year] : null;
    return list ? list.filter(function (t) { return t.abbr === abbr; })[0] || null : null;
  }

  // ---------- scrubs ----------
  function makeScrubs(abbr, templates, rng, used) {
    var out = [];
    SCRUB_POS.forEach(function (pos, k) {
      var g = GROUP[pos];
      var opts = templates.filter(function (p) { return groupOf(p) === g && primaryPos(p.pos) === pos; });
      if (!opts.length) opts = templates.filter(function (p) { return groupOf(p) === g; });
      if (!opts.length) opts = templates;
      var t = opts[Math.floor(rng() * opts.length)];
      var target = 43 + Math.floor(rng() * 9) - (k >= 5 ? 2 : 0);
      var shift = (target - t.ovr) * 0.8;
      var attrs = {};
      Object.keys(t.attrs).forEach(function (a) { attrs[a] = clamp(Math.round(t.attrs[a] + shift + (rng() - 0.5) * 6), 25, 90); });
      var name;
      for (var tries = 0; tries < 40; tries++) {
        name = FIRST[Math.floor(rng() * FIRST.length)] + ' ' + LAST[Math.floor(rng() * LAST.length)];
        if (!used[name]) break;
      }
      used[name] = true;
      out.push({ id: 'scrub-' + abbr + '-' + k, name: name, team: abbr, pos: pos, age: 23 + Math.floor(rng() * 9), ht: t.ht, wt: t.wt,
        ovr: target, attrs: attrs, scrub: true, injury: null });
    });
    return out;
  }
  function scrubTemplates(d) {
    var list = d.players.concat(d.free).filter(function (p) { return p.attrs && p.ovr >= 40 && p.ovr <= 58; });
    return list.length >= 10 ? list : d.players.slice(-60);
  }

  // ---------- one season challenge ----------
  // cfg: { mode: 'year', year, team (franchise taken over), name (optional), picks: [ids], seed, injuries }
  // cfg.sides (versus mode): [{ team, picks, name }, { team, picks, name }], two players in the same league
  function buildYear(cfg) {
    var d = seasonData(cfg.year);
    if (!d) throw new Error('The ' + cfg.year + ' rosters are not loaded.');
    var rng = mulberry32((cfg.seed ^ 0x2545F491) >>> 0);
    var sides = cfg.sides || [{ team: cfg.team, picks: cfg.picks, name: cfg.name }];
    var teams = d.teams.map(clone), mine = {};
    sides.forEach(function (sd) { if (!teams.some(function (t) { return t.abbr === sd.team; })) throw new Error('Unknown team ' + sd.team); mine[sd.team] = true; });
    var players = {}, pool = [];
    d.players.concat(d.free).forEach(function (p0) { var p = clone(p0); p.injury = null; players[p.id] = p; });
    var picked = {}, moves = [], lost = {};
    sides.forEach(function (sd) {
      var picks = (sd.picks || []).filter(function (id) { return players[id]; });
      if (picks.length !== 5) throw new Error('Pick five players first.');
      picks.forEach(function (id, i) {
        var p = players[id];
        picked[id] = true;
        if (!mine[p.team] && p.team !== 'FA') { (lost[p.team] = lost[p.team] || []).push(p); }
        p.realTeam = p.team; p.team = sd.team; p.pick = i + 1;
      });
    });
    // the franchises' real rosters leave
    Object.keys(players).forEach(function (id) {
      var p = players[id];
      if (picked[id]) return;
      if (mine[p.team]) { p.realTeam = p.team; p.team = 'FA'; }
      if (p.team === 'FA') pool.push(p);
    });
    pool.sort(byOvr);
    // teams that lost a player sign the best free agent at the same spot
    Object.keys(lost).sort().forEach(function (abbr) {
      lost[abbr].forEach(function (gone) {
        var g = groupOf(gone), i = -1;
        for (var k = 0; k < pool.length; k++) if (groupOf(pool[k]) === g) { i = k; break; }
        if (i < 0) i = pool.length ? 0 : -1;
        if (i < 0) return;
        var s = pool.splice(i, 1)[0];
        s.team = abbr;
        moves.push({ team: abbr, out: gone.id, outName: gone.name, inId: s.id, inName: s.name, inOvr: s.ovr });
      });
    });
    sides.forEach(function (sd) {
      var user = teams.filter(function (t) { return t.abbr === sd.team; })[0];
      user.autoStyle = 'challenge'; user.ironman = true;   // just the five: all 48 minutes, never hurt, no bench
      user.orig = { city: user.city, name: user.name };
      if (sd.name) { var nm = splitName(sd.name, user); user.city = nm.city; user.name = nm.name; }
    });
    var ch = finishBuild(cfg, d.year, teams, players, moves, null);
    ch.user = sides[0].team;
    if (sides[1]) ch.rival = sides[1].team;
    return ch;
  }

  // ---------- versus: two players, one league ----------
  // snake order of the ten picks: A B B A A B B A A B
  var VS_ORDER = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1];
  // picks each: the five, plus cfg.bench (0 or 3) bench players; the snake keeps going A B B A A B B A ...
  function vsPer(cfg) { return 5 + (cfg && +cfg.bench > 0 ? +cfg.bench : 0); }
  function vsOnClock(cfg) {
    var n = cfg.sides[0].picks.length + cfg.sides[1].picks.length;
    return n >= 2 * vsPer(cfg) ? -1 : (n === 0 ? 0 : (Math.floor((n - 1) / 2) % 2 === 0 ? 1 : 0));
  }

  // ---------- auction draft (versus): a hidden pool, bid for every player ----------
  // cfg.auction = { budget: 20, start: 1, raise: 1, pool: 10, quality: 'stars' | 'mixed' | 'any', show: 0 | 1 (the pool is visible) }.
  // A player goes up at the start price, held by whoever opens that round (the opener alternates); the other side raises or passes;
  // a pass sells him to the side that holds the bid, at that price. Each side must keep the start price for every slot it still has to
  // fill, a full side stops bidding, and the other side takes what is left at no cost.
  function aucOpts(a) { return Object.assign({ budget: 20, start: 1, raise: 1, pool: 10, quality: 'stars', show: 0 }, a || {}); }
  function aucFull(st, side) { return st.won[side].length >= st.per; }
  // the most this side may bid now: its money minus the start price for each of its other empty slots
  function aucMax(st, side) { return st.o.budget - st.spent[side] - Math.max(0, st.per - st.won[side].length - 1) * st.o.start; }
  function aucCanRaise(st, side) { return !aucFull(st, side) && st.price + st.o.raise <= aucMax(st, side); }
  function aucSell(st, side, price) {
    var id = st.ids[st.i];
    st.won[side].push(id); st.spent[side] += price; st.log.push({ id: id, side: side, price: price });
  }
  // moves to the next player and settles every round nobody can contest
  function aucNext(st) {
    for (;;) {
      st.i++;
      if (st.i >= st.ids.length || (aucFull(st, 0) && aucFull(st, 1))) { st.done = true; st.turn = -1; st.holder = -1; return st; }
      var open = st.i % 2;
      if (aucFull(st, open)) {   // the opener has his five: the other side takes him free
        aucSell(st, 1 - open, 0); continue;
      }
      if (aucFull(st, 1 - open)) { aucSell(st, open, 0); continue; }
      st.holder = open; st.price = st.o.start; st.turn = 1 - open;
      if (!aucCanRaise(st, st.turn)) { aucSell(st, st.holder, st.price); continue; }
      return st;
    }
  }
  function auctionStart(cfg, players) {
    var o = aucOpts(cfg.auction), per = vsPer(cfg), n = Math.max(o.pool, 2 * per), rng = mulberry32(((cfg.seed || 1) ^ 0xA0C710) >>> 0);
    var sorted = players.slice().sort(function (a, b) { return b.ovr - a.ovr || (a.id < b.id ? -1 : 1); });
    var top = o.quality === 'stars' ? Math.max(n, 60) : o.quality === 'mixed' ? Math.max(n, 200) : sorted.length;
    var pool = shuffle(sorted.slice(0, top), rng).slice(0, n);
    var st = { o: o, per: per, ids: pool.map(function (p) { return p.id; }), i: -1, price: o.start, holder: 0, turn: 1, spent: [0, 0], won: [[], []], log: [], done: false };
    return aucNext(st);
  }
  // side raises (action 'raise') or passes (action 'pass'); returns false when it is not his move
  function auctionAct(st, side, action) {
    if (!st || st.done || st.turn !== side) return false;
    if (action === 'raise') {
      if (!aucCanRaise(st, side)) return false;
      st.price += st.o.raise; st.holder = side; st.turn = 1 - side;
      if (!aucCanRaise(st, st.turn)) { aucSell(st, st.holder, st.price); aucNext(st); }
      return true;
    }
    if (action === 'pass') { aucSell(st, st.holder, st.price); aucNext(st); return true; }
    return false;
  }
  // Versus: no season. The two fives meet in a series (cfg.bestOf 3, 5 or 7; home court on a coin flip:
  // 1-1-1, 2-2-1 or 2-2-1-1-1), each playing all 48 minutes, nobody on the bench. Fit and positions count
  // like everywhere else. opts.pbp keeps every game's play-by-play (res) for the court view.
  // Returns { cfg, label, bestOf, need, sides: [{ team, five, fit }], games: [...], wins, winner, mvp, lines, home }
  var VS_HOME = { 1: [1], 3: [1, 0, 1], 5: [1, 1, 0, 0, 1], 7: [1, 1, 0, 0, 1, 0, 1] };
  function playVersus(cfg, opts) {
    opts = opts || {};
    var bestOf = VS_HOME[cfg.bestOf] ? +cfg.bestOf : 5, need = Math.ceil(bestOf / 2);
    // cfg.year 0: every season (era spin), the picks are all-time pool keys (id@season)
    var everyEra = !cfg.year, E = W.ENGINE, d = seasonData(everyEra ? 2013 : cfg.year);
    if (!E) throw new Error('Game engine not loaded');
    if (!d) throw new Error('The ' + (cfg.year || 2013) + ' rosters are not loaded.');
    var byId = {};
    if (everyEra) {
      allTimePool().forEach(function (e) { var q = clone(e); q.id = e.key; byId[e.key] = q; });
      // picks from a landed season's full rosters (not in the pool): that season's data, keyed id@season
      [].concat(cfg.sides[0].picks, cfg.sides[1].picks).forEach(function (k) {
        if (byId[k]) return;
        var bits = String(k).split('@'), sd = seasonData(+bits[1]), src = sd && sd.players.filter(function (q) { return q.id === bits[0]; })[0];
        if (!src) return;
        var q = clone(src);
        if (!q.tend && E.tendencyOf) { var tt = clone(E.tendencyOf(src)), dr = E.defRates(src); tt.blk = Math.round(dr.blk * 100) / 10; tt.stl = Math.round(dr.stl * 100) / 10; delete tt.generated; q.tend = tt; }
        q.id = k; q.key = k; q.base = src.id; q.from = src.team; q.season = +bits[1];
        byId[k] = q;
      });
    }
    else d.players.concat(d.free).forEach(function (p) { byId[p.id] = p; });
    var rng = mulberry32((cfg.seed ^ 0x7F4A7C15) >>> 0);
    var sides = cfg.sides.map(function (sd) {
      var t = clone(d.teams.filter(function (x) { return x.abbr === sd.team; })[0] || { abbr: sd.team, city: sd.team, name: '' });
      t.orig = { city: t.city, name: t.name };
      if (sd.name) { var nm = splitName(sd.name, t); t.city = nm.city; t.name = nm.name; }
      var all = sd.picks.map(function (id, i) { var p = clone(byId[id]); p.team = sd.team; p.realTeam = byId[id].from || byId[id].team; p.pick = i + 1; p.injury = null; return p; });
      if (all.length !== vsPer(cfg)) throw new Error('Pick your players first.');
      var five = all.slice(0, 5), bench = cfg.noBench ? [] : all.slice(5);   // noBench: the eight were drafted, the five play all 48
      var fit = lineupFit(five);
      applyFit(five, fit);
      var mins = {};
      five.forEach(function (p) { mins[p.id] = bench.length ? 34 : 48; });
      bench.forEach(function (p) { mins[p.id] = 70 / bench.length; });
      return { abbr: sd.team, team: t, five: five, bench: bench, fit: fit, obj: { abbr: sd.team, players: five.concat(bench), minutes: mins, ironman: true, strategy: null } };
    });
    var norms = E.computeNorms({ season: d.year, teams: d.teams, players: d.players });
    var era = E.eraFor(cfg.year || +(cfg.era || 2013));
    var A = sides[0].abbr, B = sides[1].abbr, hi = rng() < 0.5 ? 0 : 1, lo = 1 - hi;
    var wins = {}; wins[A] = 0; wins[B] = 0;
    var games = [], tot = {};
    for (var g = 0; g < bestOf && wins[A] < need && wins[B] < need; g++) {
      var hiHome = !!VS_HOME[bestOf][g];
      var home = sides[hiHome ? hi : lo], away = sides[hiHome ? lo : hi];
      var res = E.simGame(home.obj, away.obj, rng, { injuries: {}, norms: norms, era: era, year: cfg.year, pbp: !!opts.pbp, sizeMatters: true });
      var hs = res.home.pts, as = res.away.pts, win = hs > as ? home.abbr : away.abbr;
      wins[win]++;
      var top = null;
      res.home.box.concat(res.away.box).forEach(function (r) {
        var x = tot[r.id] || (tot[r.id] = { g: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 });
        x.g++; x.min += r.min || 0; x.pts += r.pts || 0; x.reb += (r.oreb || 0) + (r.dreb || 0); x.ast += r.ast || 0; x.stl += r.stl || 0; x.blk += r.blk || 0;
        x.fgm += r.fgm || 0; x.fga += r.fga || 0; x.tpm += r.tpm || 0; x.tpa += r.tpa || 0; x.tov += r.tov || 0; x.ftm += r.ftm || 0; x.fta += r.fta || 0;
        if (!top || (r.pts || 0) > top.pts) top = { id: r.id, pts: r.pts || 0, reb: (r.oreb || 0) + (r.dreb || 0), ast: r.ast || 0 };
      });
      var gm = { n: g + 1, home: home.abbr, away: away.abbr, hs: hs, as: as, winner: win, ot: res.ot || 0, top: top,
        wins: (function () { var w = {}; w[A] = wins[A]; w[B] = wins[B]; return w; })() };
      if (opts.pbp) gm.res = { id: 'vs' + (g + 1), home: { abbr: res.home.abbr, pts: hs, box: res.home.box }, away: { abbr: res.away.abbr, pts: as, box: res.away.box },
        quarters: res.quarters, ot: res.ot, pbp: res.pbp, pbx: res.pbx, pbl: res.pbl };
      games.push(gm);
    }
    var winner = wins[A] > wins[B] ? A : B;
    var r1 = function (x) { return Math.round(x * 10) / 10; };
    var lines = {};
    Object.keys(tot).forEach(function (id) { var x = tot[id], n = x.g || 1; lines[id] = { g: x.g, mpg: r1(x.min / n), pts: r1(x.pts / n), reb: r1(x.reb / n), ast: r1(x.ast / n), stl: r1(x.stl / n), blk: r1(x.blk / n),
      tov: r1(x.tov / n), tpm: r1(x.tpm / n), fgp: x.fga ? r1(100 * x.fgm / x.fga) : null, tpp: x.tpa ? r1(100 * x.tpm / x.tpa) : null, ftp: x.fta ? r1(100 * x.ftm / x.fta) : null }; });
    var win5 = sides[winner === A ? 0 : 1].five;
    var mvp = win5.slice().sort(function (x, y) { var a = lines[x.id] || {}, b = lines[y.id] || {}; return ((b.pts || 0) + (b.reb || 0) + (b.ast || 0)) - ((a.pts || 0) + (a.reb || 0) + (a.ast || 0)); })[0];
    return { cfg: cfg, label: everyEra ? 'Every season' : d.label, bestOf: bestOf, need: need, home: sides[hi].abbr, games: games, wins: wins, winner: winner,
      mvp: mvp ? { id: mvp.id, name: mvp.name, line: lines[mvp.id] } : null, lines: lines,
      sides: sides.map(function (sd) { return { abbr: sd.abbr, team: { abbr: sd.team.abbr, city: sd.team.city, name: sd.team.name, colors: sd.team.colors, logo: sd.team.logo, logoNoRef: sd.team.logoNoRef },
        fit: sd.fit, five: sd.five.map(function (p) { return { id: p.id, name: p.name, pos: p.pos, ovr: p.baseOvr || p.ovr, nbaId: p.nbaId || null, slot: SLOTS[p.slot], season: p.season || null }; }),
        bench: sd.bench.map(function (p) { return { id: p.id, name: p.name, pos: p.pos, ovr: p.baseOvr || p.ovr, nbaId: p.nbaId || null, season: p.season || null }; }) }; }) };
  }

  function splitName(full, t) {
    full = String(full || '').trim().slice(0, 32);
    if (!full) return { city: t.city, name: t.name };
    var parts = full.split(/\s+/);
    if (parts.length === 1) return { city: '', name: parts[0] };
    return { city: parts.slice(0, -1).join(' '), name: parts[parts.length - 1] };
  }

  // ---------- all-time draft ----------
  // dr = { cfg, order: [abbr x30], picks: [{ n, round, team, key }], taken: { base: true }, pool: [entries] }
  function newDraft(cfg) {
    setCapSlots(5);
    var base = seasonData(2013);
    if (!base) throw new Error('League data not loaded');
    var rng = mulberry32((cfg.seed ^ 0x51ED270B) >>> 0);
    var order = shuffle(base.teams.map(function (t) { return t.abbr; }), rng);
    if (cfg.slot) {
      var at = order.indexOf(cfg.team), to = clamp(cfg.slot, 1, order.length) - 1;
      order[at] = order[to]; order[to] = cfg.team;
    }
    var pool = allTimePool().filter(function (e) { return !cfg.seasons || cfg.seasons.indexOf(e.season) >= 0; });
    if (pool.length < order.length * ROUNDS) throw new Error('Not enough players in those seasons for ' + order.length + ' teams of five. Switch on more seasons.');
    return { cfg: cfg, order: order, picks: [], taken: {}, pool: pool, spins: [], respins: 1 };
  }
  // an all-seasons draft offers the whole roster of the team-season the wheel lands on, not only the few best veterans of the
  // pool file: the season's file loads and its players join the pool (same keys: id@season)
  function extendPool(dr, year) {
    var d = seasonData(year), E = W.ENGINE;
    dr.ext = dr.ext || {};
    if (!d || dr.ext[year]) return 0;
    dr.ext[year] = true;
    var have = {}, n = 0;
    dr.pool.forEach(function (e) { have[e.key] = true; });
    d.players.forEach(function (p) {
      var key = p.id + '@' + year;
      if (have[key]) return;
      var q = clone(p);
      q.base = p.id; q.key = key; q.from = p.team; q.label = (year - 1) + '-' + String(year).slice(2);
      if (!q.tend && E) { var t = clone(E.tendencyOf(p)), r = E.defRates(p); t.blk = Math.round(r.blk * 100) / 10; t.stl = Math.round(r.stl * 100) / 10; delete t.generated; q.tend = t; }
      dr.pool.push(q); n++;
    });
    return n;
  }
  function draftSlot(dr, n) {
    var N = dr.order.length, r = Math.floor(n / N), k = n % N;
    return { n: n, round: r + 1, pick: k + 1, team: r % 2 === 0 ? dr.order[k] : dr.order[N - 1 - k] };
  }
  function onClock(dr) { return dr.picks.length >= dr.order.length * ROUNDS ? null : draftSlot(dr, dr.picks.length); }
  // the key a pick takes off the board: the player, or (duplicates on) just that season of the player
  function takenKey(dr, e) { return dr.cfg && dr.cfg.dupes ? (e.key || e.id) : e.base; }
  function available(dr) { return dr.pool.filter(function (e) { return !dr.taken[takenKey(dr, e)]; }); }
  function teamPicks(dr, abbr) { return dr.picks.filter(function (x) { return x.team === abbr; }).map(function (x) { return entry(dr, x.key); }); }
  function entry(dr, key) { for (var i = 0; i < dr.pool.length; i++) if (dr.pool[i].key === key) return dr.pool[i]; return null; }
  // ---------- salary cap (cfg.cap, $ millions; 0 = off) ----------
  // Every player has a price from his overall, like a Basketball GM contract: a 99 costs $45M, an 85 about
  // $19M, a 70 about $3M, the minimum is $1M. The five must fit under the cap, so a pick may not leave less
  // than the minimum for each spot still open.
  var CAP_MIN = 1, CAP_SLOTS = 5;
  // how many players the cap covers: five, or eight in an 8-man draft (set when a draft board is built; the cap itself scales with it, see capFor)
  function setCapSlots(n) { CAP_SLOTS = +n > 5 ? +n : 5; }
  function capFor(cap, bench) { return cap && +bench > 0 ? Math.round(cap * (5 + +bench) / 5) : (+cap || 0); }
  function price(p) {
    var x = clamp(((p.baseOvr || p.ovr || 60) - 60) / 39, 0, 1);
    return Math.max(CAP_MIN, Math.round((1 + 44 * Math.pow(x, 1.9)) * 10) / 10);
  }
  function capState(cap, list) {
    var spent = 0;
    (list || []).forEach(function (p) { if (p) spent += price(p); });
    spent = Math.round(spent * 10) / 10;
    var open = Math.max(0, CAP_SLOTS - (list || []).filter(Boolean).length);
    return { cap: cap, spent: spent, left: Math.round((cap - spent) * 10) / 10, open: open,
      max: open ? Math.round((cap - spent - CAP_MIN * (open - 1)) * 10) / 10 : 0 };   // the most the next pick can cost
  }
  function capFits(cap, list, p) { return !cap || price(p) <= capState(cap, list).max + 1e-9; }
  function draftPick(dr, key) {
    var c = onClock(dr), e = entry(dr, key);
    if (!c) return { ok: false, reason: 'The draft is over.' };
    if (!e || dr.taken[takenKey(dr, e)]) return { ok: false, reason: 'That player is already taken.' };
    if (dr.cfg.cap && !capFits(dr.cfg.cap, teamPicks(dr, c.team), e)) return { ok: false, reason: 'That contract does not fit under the cap.' };
    dr.taken[takenKey(dr, e)] = true;
    dr.picks.push({ n: c.n + 1, round: c.round, team: c.team, key: key });
    return { ok: true, slot: c, entry: e };
  }
  function aiScore(dr, abbr, e, rng) {
    var mine = teamPicks(dr, abbr), g = groupOf(e), n = 0;
    mine.forEach(function (q) { if (groupOf(q) === g) n++; });
    var s = e.ovr + rng() * 3;
    if (n >= 2) s -= 6 * (n - 1);
    var groups = { G: 0, W: 0, B: 0 };
    mine.forEach(function (q) { groups[groupOf(q)]++; });
    if (mine.length >= 2 && groups[g] === 0) s += 3;
    if ((e.age || 27) >= 35) s -= 2;
    return s;
  }
  function aiPick(dr) {
    var c = onClock(dr);
    if (!c) return null;
    var rng = mulberry32((dr.cfg.seed + (dr.picks.length + 1) * 7919) >>> 0);
    var best = null, bs = -1e9;
    var mine = dr.cfg.cap ? teamPicks(dr, c.team) : null;
    // under a cap the AI also weighs the price: value per dollar once the stars are gone
    available(dr).filter(function (e) { return !mine || capFits(dr.cfg.cap, mine, e); }).slice(0, 50).forEach(function (e) {
      var s = aiScore(dr, c.team, e, rng) - (mine ? 0.25 * price(e) : 0);
      if (s > bs) { bs = s; best = e; }
    });
    return best ? draftPick(dr, best.key) : null;
  }
  function simToUser(dr) {
    var n = 0, c;
    while ((c = onClock(dr)) && c.team !== dr.cfg.team) { aiPick(dr); n++; }
    return n;
  }
  function autoDraft(dr) { var n = 0; while (onClock(dr)) { aiPick(dr); n++; } return n; }

  // Wheel: a random team (one season) or team-season (all-time) that still has someone to take.
  // used: spins already taken (keys 'year:abbr').
  // the franchise behind a team abbreviation across the eras (the Bulls are the Bulls in every season; the Warriors from Philadelphia on)
  var FRANCHISE = { PHW: 'GSW', SFW: 'GSW', MNL: 'LAL', ROC: 'SAC', CIN: 'SAC', KCO: 'SAC', KCK: 'SAC', SYR: 'PHI', FTW: 'DET', MLH: 'ATL', STL: 'ATL', TRI: 'ATL',
    CHP: 'WAS', CHZ: 'WAS', BAL: 'WAS', CAP: 'WAS', WSB: 'WAS', SDR: 'HOU', BUF: 'LAC', SDC: 'LAC', NOJ: 'UTA', NYN: 'BKN', NJN: 'BKN', SEA: 'OKC',
    CHH: 'NOH', NOP: 'NOH', VAN: 'MEM' };
  function franchise(abbr) { return FRANCHISE[abbr] || abbr; }
  function spin(cfg, used, rng, dr) {
    var opts = [];
    if (cfg.mode === 'alltime') {
      var left = available(dr), seen = {};
      left.forEach(function (e) { var k = e.season + ':' + e.from; if (!seen[k] && used.indexOf(k) < 0) { seen[k] = true; opts.push({ year: e.season, abbr: e.from, key: k }); } });
    } else {
      var d = seasonData(cfg.year), taken = {};
      (cfg.picks || []).forEach(function (id) { taken[id] = true; });
      d.teams.forEach(function (t) {
        var k = d.year + ':' + t.abbr;
        if (used.indexOf(k) >= 0) return;
        if (d.players.some(function (p) { return p.team === t.abbr && !taken[p.id]; })) opts.push({ year: d.year, abbr: t.abbr, key: k });
      });
    }
    if (!opts.length) return null;
    // an all-seasons draft never lands on the same franchise twice (two Bulls years) while other franchises are left
    if (cfg.mode === 'alltime') {
      var got = {}; used.forEach(function (k) { got[franchise(String(k).split(':')[1])] = 1; });
      var fresh = opts.filter(function (o) { return !got[franchise(o.abbr)]; });
      if (fresh.length) opts = fresh;
    }
    return opts[Math.floor(rng() * opts.length)];
  }
  function spinRoster(cfg, s, dr) {
    if (cfg.mode === 'alltime') return available(dr).filter(function (e) { return e.season === s.year && e.from === s.abbr; });
    var d = seasonData(s.year), taken = {};
    (cfg.picks || []).forEach(function (id) { taken[id] = true; });
    return d.players.filter(function (p) { return p.team === s.abbr && !taken[p.id]; });
  }

  function buildAllTime(cfg, dr) {
    var base = seasonData(2013);
    var rng = mulberry32((cfg.seed ^ 0x2545F491) >>> 0);
    var teams = base.teams.map(clone), players = {};
    teams.forEach(function (t) {
      t.autoStyle = 'challenge'; t.real = null; t.ironman = true;   // every team is its five, all 48 minutes
      t.orig = { city: t.city, name: t.name };
      if (t.abbr === cfg.team && cfg.name) { var nm = splitName(cfg.name, t); t.city = nm.city; t.name = nm.name; }
      teamPicks(dr, t.abbr).forEach(function (e, i) {
        var p = clone(e);
        p.id = e.key; p.team = t.abbr; p.realTeam = e.from; p.pick = i + 1; p.injury = null;
        players[p.id] = p;
      });
    });
    cfg.picks = teamPicks(dr, cfg.team).map(function (e) { return e.key; });
    return finishBuild(cfg, 2013, teams, players, [], dr);
  }

  // ---------- lineup fit: position and how the five go together ----------
  // Each drafted five is put in the spots PG, SG, SF, PF, C that cost the least (a player away from his
  // position loses ground: guarding quicker players when he plays smaller, size and boards when bigger), and
  // the team is graded on what a lineup needs: someone to run it, shooting, rim protection, rebounding,
  // perimeter defense and not too many players who need the ball. The grades move every player's
  // ratings a little (a whole lineup at most about -8 to +3); the five then matches up by those spots.
  var SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'], PIDX = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4, G: 0.5, F: 2.5 };
  var PEN = [0, 1.5, 4, 7, 10];
  // a player's second spot when his listed position has only one: from his size and game
  function secondPos(p) {
    var parts = String(p.pos || 'SF').toUpperCase().split(/[-\/ ,]+/).filter(function (x) { return PIDX[x] != null && x.length === 2 || x === 'C'; });
    if (parts.length > 1) return parts[1];
    var a = p.attrs || {}, ht = +p.ht || 79, one = parts[0] || 'SF';
    if (one === 'PG') return ht >= 80 ? 'SF' : 'SG';   // a 6-8 point guard (Ben Simmons) also plays the wing
    if (one === 'SG') return ht >= 78 || (a.handle || 60) < 70 ? 'SF' : 'PG';
    if (one === 'SF') return ht >= 81 || (a.dreb || 50) >= 65 ? 'PF' : 'SG';
    if (one === 'PF') return ht >= 82 || (a.block || 50) >= 70 ? 'C' : 'SF';
    return 'PF';
  }
  function posLabel(p) { var one = primaryPos(p.pos); return one + '/' + secondPos(p); }
  function posRange(p) {
    var parts = (primaryPos(p.pos) + '-' + secondPos(p)).split('-').map(function (x) { return PIDX[x]; }).filter(function (x) { return x != null; });
    if (!parts.length) parts = [2];
    return [Math.min.apply(null, parts), Math.max.apply(null, parts)];
  }
  function slotPen(p, k) {
    var r = posRange(p), d = k < r[0] ? r[0] - k : k > r[1] ? k - r[1] : 0;
    var i = Math.floor(d), f = d - i;
    return i >= 4 ? PEN[4] : PEN[i] + (PEN[i + 1] - PEN[i]) * f;
  }
  function attr(p, k) { return p.attrs && p.attrs[k] != null ? +p.attrs[k] : 50; }
  function grade(v, cuts, pts, words) { for (var i = 0; i < cuts.length; i++) if (v >= cuts[i]) return { v: pts[i], word: words[i] }; return { v: pts[pts.length - 1], word: words[words.length - 1] }; }
  function lineupFit(five) {
    five = five.filter(Boolean).slice(0, 5);
    // the best spots: every way to put the players in PG to C (open spots while drafting stay empty)
    var best = null, start = five.slice();
    while (start.length < 5) start.push(null);
    (function perm(arr, k) {
      if (k === arr.length) {
        var cost = 0;
        arr.forEach(function (p, i) { if (p) cost += slotPen(p, i) * (1 + (p.ovr || 70) / 200); });
        if (!best || cost < best.cost) best = { cost: cost, order: arr.slice() };
        return;
      }
      for (var i = k; i < arr.length; i++) { var t = arr[k]; arr[k] = arr[i]; arr[i] = t; perm(arr, k + 1); t = arr[k]; arr[k] = arr[i]; arr[i] = t; }
    })(start, 0);
    var order = best.order;
    var slots = [];
    order.forEach(function (p, i) { slots.push(p ? { id: p.id, name: p.name, pos: primaryPos(p.pos), slot: SLOTS[i], k: i, pen: Math.round(slotPen(p, i) * 10) / 10 } : { id: null, slot: SLOTS[i], k: i, pen: 0 }); });
    var parts = [];
    if (five.length >= 5) {
      var max = function (fn) { return Math.max.apply(null, five.map(fn)); };
      var hand = max(function (p) { return attr(p, 'handle') * 0.6 + attr(p, 'pass') * 0.4; });
      parts.push(Object.assign({ k: 'PLAYMAKING' }, grade(hand, [85, 76, 66], [1, 0, -2, -4], ['GREAT', 'GOOD', 'THIN', 'NOBODY'])));
      var sh = 0; five.forEach(function (p) { var t = attr(p, 'three'); sh += t >= 75 ? 1 : t >= 70 ? 0.5 : 0; });
      parts.push(Object.assign({ k: 'SHOOTING' }, grade(sh, [4, 3, 2, 1], [1, 0.5, 0, -1.5, -3], ['GREAT', 'GOOD', 'OK', 'CRAMPED', 'NONE'])));
      var rim = max(function (p) { return attr(p, 'block') * 0.5 + attr(p, 'intD') * 0.5; });
      parts.push(Object.assign({ k: 'RIM PROTECTION' }, grade(rim, [80, 70, 60], [0.5, 0, -1.5, -3], ['GREAT', 'GOOD', 'SOFT', 'NONE'])));
      var dr = five.map(function (p) { return attr(p, 'dreb'); }).sort(function (a, b) { return b - a; }).slice(0, 3);
      parts.push(Object.assign({ k: 'REBOUNDING' }, grade((dr[0] + dr[1] + dr[2]) / 3, [70, 58, 48], [0.5, 0, -1.5, -3], ['GREAT', 'GOOD', 'SMALL', 'BAD'])));
      var pd = order.slice(0, 3).map(function (p) { return attr(p, 'perD'); });
      parts.push(Object.assign({ k: 'PERIMETER D' }, grade((pd[0] + pd[1] + pd[2]) / 3, [76, 62], [0.5, 0, -1], ['GREAT', 'GOOD', 'LEAKY'])));
      var cooks = five.filter(function (p) { return (attr(p, 'mid') + attr(p, 'three') + attr(p, 'close')) / 3 >= 78 && attr(p, 'handle') >= 74 && (p.ovr || 0) >= 86; }).length;
      parts.push(Object.assign({ k: 'BALL SHARING' }, grade(-cooks, [-2, -3], [0, -0.5, -1.5], ['FINE', 'CROWDED', 'TOO MANY'])));
    }
    var team = 0; parts.forEach(function (x) { team += x.v; });
    team = clamp(team, -8, 3);
    var outOf = slots.filter(function (x) { return x.pen >= 1.5; }).length;
    if (five.length < 5) return { slots: slots, parts: [], team: 0, word: '', partial: true };
    var word = outOf >= 3 || team < -3 ? 'BAD FIT' : team >= 1.5 && !outOf ? 'GREAT FIT' : team >= 0 && outOf <= 1 ? 'GOOD FIT' : 'SOME HOLES';
    return { slots: slots, parts: parts, team: team, word: word };
  }
  // moves the five's ratings by their fit (on the league's own copies)
  var INSIDE = ['intD', 'dreb', 'oreb', 'block', 'strength', 'post'], OUTSIDE = ['perD', 'speed', 'handle'];
  function applyFit(five, fit) {
    var byId = {};
    fit.slots.forEach(function (x) { if (x.id) byId[x.id] = x; });
    five.forEach(function (p) {
      var x = byId[p.id];
      if (!x) return;
      var r = posRange(p), g = fit.team * 0.6, pen = x.pen;
      p.slot = x.k;
      if (p.attrs) {
        var a = p.attrs;
        Object.keys(a).forEach(function (k) { if (typeof a[k] === 'number') a[k] = clamp(Math.round(a[k] + g), 25, 99); });
        (x.k < r[0] ? OUTSIDE : x.k > r[1] ? INSIDE : []).forEach(function (k) { if (a[k] != null) a[k] = clamp(Math.round(a[k] - pen * 1.4), 25, 99); });
      }
      p.baseOvr = p.ovr;
      p.ovr = clamp(Math.round(p.ovr + g - pen * 0.6), 30, 99);
    });
  }

  function finishBuild(cfg, year, teams, players, moves, dr) {
    // the drafted fives (picks) play where they fit best
    var fits = {};
    teams.forEach(function (t) {
      var five = Object.keys(players).map(function (id) { return players[id]; }).filter(function (p) { return p.team === t.abbr && p.pick; })
        .sort(function (a, b) { return a.pick - b.pick; });
      if (five.length !== 5) return;
      var f = lineupFit(five);
      applyFit(five, f);
      fits[t.abbr] = f;
    });
    var list = [];
    var known = {};
    teams.forEach(function (t) { known[t.abbr] = true; });
    Object.keys(players).forEach(function (id) { var p = players[id]; if (known[p.team]) list.push(p); });
    var eraYear = cfg.mode === 'alltime' ? +(cfg.era || 2013) : year;
    return { cfg: cfg, year: year, eraYear: eraYear, user: cfg.team, teams: teams, players: players, moves: moves, fits: fits,
      league: { season: year, teams: teams, players: list }, draft: dr ? { order: dr.order, picks: dr.picks } : null };
  }

  // ---------- schedule ----------
  // Every team plays 82: three games against everyone, minus the pairs at the smallest distances on a
  // shuffled circle (two games instead), so each team drops the same number. Works for 29 to 32 teams.
  function matchups(abbrs, rng, games82) {
    var order = shuffle(abbrs.slice(), rng), N = order.length, G = games82 || 82;
    if (N < 28 || G !== 82) return matchupsAny(order, G);
    var r = 3 * (N - 1) - 82, drop = {};
    for (var d = 1; d <= Math.floor(r / 2); d++) drop[d] = true;
    if (r % 2) drop[N / 2] = true;
    var games = [];
    for (var i = 0; i < N; i++) for (var j = i + 1; j < N; j++) {
      var dist = Math.min(j - i, N - (j - i));
      var a = order[i], b = order[j];
      games.push({ home: a, away: b }, { home: b, away: a });
      if (drop[dist]) continue;
      // the third game: hosted by the team "behind" on the circle, so everyone hosts 41
      if ((j - i) <= N / 2 && !(N % 2 === 0 && j - i === N / 2)) games.push({ home: a, away: b });
      else games.push({ home: b, away: a });
    }
    return games;
  }

  // any league size and season length (the old leagues: 8 to 27 teams, 60 to 82 games): everyone plays everyone
  // base times, then the rest against the teams nearest on a shuffled circle; one game short when the maths needs it
  function matchupsAny(order, G) {
    var N = order.length, base = Math.floor(G / (N - 1)), r = G - base * (N - 1), games = [], extra = {};
    for (var d = 1; d <= Math.floor(r / 2); d++) extra[d] = true;
    if (r % 2 && N % 2 === 0) extra[N / 2] = true;
    for (var i = 0; i < N; i++) for (var j = i + 1; j < N; j++) {
      var a = order[i], b = order[j], dist = Math.min(j - i, N - (j - i));
      for (var k = 0; k < base; k++) games.push(k % 2 ? { home: a, away: b } : { home: b, away: a });
      if (extra[dist]) games.push(base % 2 ? { home: b, away: a } : { home: a, away: b });
    }
    return games;
  }
  // the games every team plays that season, from the real records (the most common total)
  function seasonGames(ch) {
    var c = {}, best = 82, n = 0;
    ch.teams.forEach(function (t) { var rr = t.real; if (!rr) return; var g = rr.w + rr.l; c[g] = (c[g] || 0) + 1; });
    Object.keys(c).forEach(function (g) { if (c[g] > n) { n = c[g]; best = +g; } });
    return best;
  }
  // ---------- the season ----------
  function start(ch) {
    setCapSlots(5);
    var E = W.ENGINE;
    if (!E) throw new Error('Game engine not loaded');
    var rng = mulberry32((ch.cfg.seed ^ 0x6C8E9CF5) >>> 0);
    var y = ch.year;
    var season = E.newSeason(ch.league, { year: y, realSchedule: false, playIn: false, rng: rng, userTeam: ch.user });
    season.playoffSpec = null;   // the Draft Challenge sizes its own playoffs below
    var nT = season.teams.length, G = nT >= 28 ? 82 : Math.max(40, Math.min(82, seasonGames(ch)));
    if (nT < 28) {   // the old small leagues: fewer playoff teams a conference
      var cs = {}; season.teams.forEach(function (t) { cs[t.conf] = (cs[t.conf] || 0) + 1; });
      var small = Math.min.apply(null, Object.keys(cs).map(function (k) { return cs[k]; }).concat([8]));
      season.playoffK = nT >= 20 && small >= 8 ? 8 : small >= 4 && nT >= 12 ? 4 : 2;
    }
    season.days = E.buildSchedule(season.teams, rng, (y - 1) + '-10-30', y + '-04-16', matchups(season.teams.map(function (t) { return t.abbr; }), rng, G));
    season.era = E.eraFor(ch.eraYear);
    season.userTeam = ch.user;
    // all-time teams are rated against a normal league (2012-13), so stars still look like stars
    if (ch.cfg.mode === 'alltime') {
      var b = seasonData(2013);
      season.norms = E.computeNorms({ season: 2013, teams: b.teams, players: b.players });
    }
    season.injuries = {};
    ch.season = season;
    ch.rng = rng;
    return ch;
  }
  // Sims n days. Returns true once the playoffs are over.
  function step(ch, n) {
    var E = W.ENGINE;
    for (var i = 0; i < n && ch.season.phase !== 'done'; i++) {
      E.simDays(ch.season, 1, ch.rng, ch.league);
      if (ch.cfg.injuries === false) ch.season.injuries = {};
    }
    return ch.season.phase === 'done';
  }
  function runAll(ch) { if (!ch.season) start(ch); var guard = 0; while (!step(ch, 10) && guard++ < 100); return summary(ch); }
  function progress(ch) {
    var s = ch.season, st = s.standings[ch.user] || { w: 0, l: 0 };
    var regDays = s.days.filter(function (d) { return !d.playoff; }).length;
    return { w: st.w, l: st.l, phase: s.phase, frac: s.phase === 'regular' ? Math.min(1, s.day / regDays) * 0.85 : s.phase === 'done' ? 1 : 0.85 + 0.15 * Math.min(1, (s.playoffs && s.playoffs.round || 1) / 4) };
  }

  // ---------- results ----------
  var ROUND_NAME = ['First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];
  function perGame(t) {
    if (!t || !t.g) return null;
    var g = t.g, r1 = function (x) { return Math.round(x * 10) / 10; };
    var tsa = (t.fga || 0) + 0.44 * (t.fta || 0);
    return { g: g, gs: t.gs || 0, mpg: r1(t.min / g), pts: r1(t.pts / g), reb: r1(((t.oreb || 0) + (t.dreb || 0)) / g), ast: r1(t.ast / g), stl: r1(t.stl / g),
      blk: r1(t.blk / g), tov: r1((t.tov || 0) / g), fgp: t.fga ? r1(100 * t.fgm / t.fga) : null, tpp: t.tpa ? r1(100 * t.tpm / t.tpa) : null,
      ftp: t.fta ? r1(100 * t.ftm / t.fta) : null, ts: tsa ? r1(100 * t.pts / (2 * tsa)) : null, pm: r1((t.pm || 0) / g), td: t.td || 0 };
  }
  function teamInfo(ch, abbr) { var t = ch.teams.filter(function (x) { return x.abbr === abbr; })[0] || { abbr: abbr, city: abbr, name: '' }; return { abbr: t.abbr, city: t.city, name: t.name, colors: t.colors, logo: t.logo, logoNoRef: t.logoNoRef, conf: t.conf, real: t.real || null, orig: t.orig || null }; }
  // the team a pick came from, as it was that season
  function fromTeam(ch, p) {
    var abbr = p.realTeam || p.from, t = p.season && p.season !== ch.year ? eraTeam(p.season, abbr) : null;
    if (!t) { var m = ch.teams.filter(function (x) { return x.abbr === abbr; })[0]; t = m ? { abbr: m.abbr, city: (m.orig || m).city, name: (m.orig || m).name, colors: m.colors, logo: m.logo } : null; }
    if (!t && p.season) t = eraTeam(p.season, abbr);
    return t ? { abbr: t.abbr, city: t.city, name: t.name, colors: t.colors, logo: t.logo, logoNoRef: !!t.logoNoRef } : { abbr: abbr || 'FA', city: abbr === 'FA' || !abbr ? 'Free' : abbr, name: abbr === 'FA' || !abbr ? 'Agent' : '', colors: ['#3a3a40', '#8a8a90'], logo: null };
  }
  function nameOf(ch, abbr) { var t = teamInfo(ch, abbr); return (t.city + ' ' + t.name).trim(); }
  function fakeState(ch) {
    return { year: ch.year, players: ch.players, teams: (function () { var m = {}; ch.teams.forEach(function (t) { m[t.abbr] = t; }); return m; })(),
      season: ch.season, history: { seasons: [] }, userTeam: ch.user };
  }
  function summary(ch) {
    var E = W.ENGINE, s = ch.season, u = ch.user, me = teamInfo(ch, u);
    var st = s.standings[u];
    var conf = me.conf;
    var confList = E.standingsList(s, conf);
    var seed = confList.map(function (x) { return x.abbr; }).indexOf(u) + 1;
    var series = [], exit = 'missed', rounds = (s.playoffs && s.playoffs.rounds) || [];
    rounds.forEach(function (list, ri) {
      list.forEach(function (x) {
        if (x.hi !== u && x.lo !== u) return;
        var mineHi = x.hi === u, w = mineHi ? x.hw : x.lw, l = mineHi ? x.lw : x.hw;
        series.push({ round: ri + 1, name: ROUND_NAME[ri + 4 - (Math.round(Math.log(s.playoffK || 8) / Math.LN2) + 1)] || 'Round ' + (ri + 1), opp: mineHi ? x.lo : x.hi, oppName: nameOf(ch, mineHi ? x.lo : x.hi), w: w, l: l, won: x.winner === u });
      });
    });
    var champ = s.champion || (s.playoffs && s.playoffs.champion) || null;
    if (champ === u) exit = 'champion';
    else if (series.length) exit = ['first', 'semis', 'conf', 'finals'][series[series.length - 1].round - 1 + 4 - (Math.round(Math.log(s.playoffK || 8) / Math.LN2) + 1)] || 'first';
    var lastS = series[series.length - 1];
    var resultText = exit === 'champion' ? 'NBA Champions' : exit === 'missed' ? 'Missed the playoffs'
      : 'Lost in the ' + lastS.name + ' to the ' + lastS.oppName + ' ' + lastS.w + '-' + lastS.l;
    var awards = null;
    try { awards = W.AWARDS && W.AWARDS.season ? W.AWARDS.season(fakeState(ch)) : null; } catch (e) { awards = null; }
    var fmvp = s.playoffs && s.playoffs.finalsMvp || null;
    var tags = {};
    function tag(id, t) { if (!id) return; (tags[id] = tags[id] || []).push(t); }
    if (awards) {
      tag(awards.mvp, 'MVP'); tag(awards.dpoy, 'DPOY'); tag(awards.roy, 'ROY'); tag(awards.smoy, '6MOY');
      (awards.allNba || []).forEach(function (team, i) { (team || []).forEach(function (id) { tag(id, 'All-NBA ' + ['1st', '2nd', '3rd'][i]); }); });
      (awards.allDefense || []).forEach(function (team, i) { (team || []).forEach(function (id) { tag(id, 'All-Defense ' + ['1st', '2nd'][i]); }); });
    }
    if (fmvp) tag(typeof fmvp === 'object' ? fmvp.id : fmvp, 'Finals MVP');
    var five = (ch.cfg.picks || []).map(function (id) {
      var p = ch.players[id];
      if (!p) return null;
      return { id: id, base: p.base || p.id, name: p.name, pos: p.pos, ovr: p.ovr, age: p.age, nbaId: p.nbaId || null, from: p.realTeam || p.from || null, season: p.season || ch.year,
        label: p.label || null, fromTeam: fromTeam(ch, p), line: perGame(s.playerStats[id]), po: perGame(s.playoffStats[id]), real: p.stats || null, tags: tags[id] || [] };
    }).filter(Boolean);
    var bench = Object.keys(ch.players).filter(function (id) { var p = ch.players[id]; return p.team === u && p.scrub; }).map(function (id) {
      var p = ch.players[id]; return { id: id, name: p.name, pos: p.pos, ovr: p.ovr, line: perGame(s.playerStats[id]) };
    }).sort(function (a, b) { return ((b.line && b.line.mpg) || 0) - ((a.line && a.line.mpg) || 0); });
    // best nights and the game log, from the user's box scores
    var best = [], log = [];
    Object.keys(s.boxScores).forEach(function (gid) {
      var bx = s.boxScores[gid];
      if (!bx || !bx.home || typeof bx.home !== 'object') return;
      var side = bx.home.abbr === u ? 'home' : bx.away.abbr === u ? 'away' : null;
      if (!side) return;
      var us = bx[side], them = bx[side === 'home' ? 'away' : 'home'];
      var top = null;
      (us.box || []).forEach(function (r) {
        if (!top || (r.pts || 0) > (top.pts || 0)) top = r;
        var p = ch.players[r.id];
        if (p && !p.scrub) best.push({ gid: gid, id: r.id, name: p.name, pts: r.pts || 0, reb: (r.oreb || 0) + (r.dreb || 0), ast: r.ast || 0, opp: them.abbr, date: bx.date, playoff: !!bx.playoff });
      });
      log.push({ id: gid, date: bx.date, home: side === 'home', opp: them.abbr, us: us.pts, them: them.pts, won: us.pts > them.pts, playoff: !!bx.playoff,
        top: top && ch.players[top.id] ? ch.players[top.id].name + ' ' + (top.pts || 0) : '' });
    });
    best.sort(function (a, b) { return b.pts - a.pts || b.reb + b.ast - a.reb - a.ast; });
    log.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var standings = {};
    ['East', 'West'].forEach(function (c) {
      standings[c] = E.standingsList(s, c).map(function (x) { var t = teamInfo(ch, x.abbr); return { abbr: x.abbr, name: (t.city + ' ' + t.name).trim(), w: x.w, l: x.l, real: t.real }; });
    });
    var award = function (id) {
      if (!id) return null;
      var p = ch.players[id];
      return p ? { id: id, name: p.name, team: p.team, mine: p.team === u, line: perGame(s.playerStats[id]), label: p.label || null, season: p.label ? p.season : null } : null;
    };
    var leaders = {};
    ['pts', 'reb', 'ast'].forEach(function (k) {
      leaders[k] = Object.keys(s.playerStats).map(function (id) { return { id: id, line: perGame(s.playerStats[id]) }; })
        .filter(function (x) { return x.line && x.line.g >= 50; })
        .sort(function (a, b) { return b.line[k] - a.line[k]; }).slice(0, 5)
        .map(function (x) { var p = ch.players[x.id]; return { id: x.id, name: p ? p.name : x.id, team: p ? p.team : '', mine: !!(p && p.team === u), v: x.line[k], season: p && p.label ? p.season : null }; });
    });
    return {
      v: 1, when: Date.now(), mode: ch.cfg.mode, build: ch.cfg.build || 'free', year: ch.year, eraYear: ch.eraYear,
      label: ch.cfg.mode === 'alltime' ? 'All-Time' : (seasonInfo(ch.year) || {}).label, seed: ch.cfg.seed, injuries: ch.cfg.injuries !== false,
      team: me, w: st.w, l: st.l, pf: st.pf, pa: st.pa, seed_: seed, confRank: seed, exit: exit, result: resultText, series: series,
      champion: champ ? teamInfo(ch, champ) : null, five: five, bench: bench, best: best.filter(function (b) { return !b.playoff; }).slice(0, 5),
      poBest: best.filter(function (b) { return b.playoff; }).slice(0, 5), log: log,
      awards: awards ? { mvp: award(awards.mvp), dpoy: award(awards.dpoy), roy: award(awards.roy), smoy: award(awards.smoy),
        fmvp: award(typeof fmvp === 'object' && fmvp ? fmvp.id : fmvp) } : null,
      standings: standings, leaders: leaders, moves: ch.moves || [], picks: (ch.cfg.picks || []).slice(), cfg: clone(ch.cfg), fit: ch.fits && ch.fits[ch.user] || null,
      teams: ch.teams.map(function (t) { return { abbr: t.abbr, city: t.city, name: t.name, colors: t.colors, logo: t.logo, logoNoRef: t.logoNoRef, conf: t.conf }; }),
      draft: ch.draft ? ch.draft.picks.map(function (x) { var e = ch.players[x.key]; return { n: x.n, team: x.team, key: x.key, name: e ? e.name : x.key, label: e ? e.label : '', ovr: e ? e.ovr : 0 }; }) : null
    };
  }

  // One call for tests and quick sims: cfg (+ draft for all-time) to a finished summary.
  function play(cfg, dr) {
    if (cfg.mode === 'versus') return playVersus(cfg);
    var ch = cfg.mode === 'alltime' ? buildAllTime(cfg, dr) : buildYear(cfg);
    start(ch);
    return runAll(ch);
  }

  var API = {
    setCapSlots: setCapSlots, capFor: capFor, price: price, capState: capState, capFits: capFits, CAP_MIN: CAP_MIN,
    SEASONS: SEASONS, ROUNDS: ROUNDS, seasonInfo: seasonInfo, seasonData: seasonData, loaded: loaded, load: load, loadAll: loadAll,
    allTimePool: allTimePool, poolSeasons: poolSeasons, eraTeam: eraTeam, buildYear: buildYear, buildAllTime: buildAllTime, newDraft: newDraft, onClock: onClock,
    draftSlot: draftSlot, draftPick: draftPick, aiPick: aiPick, simToUser: simToUser, autoDraft: autoDraft, available: available,
    teamPicks: teamPicks, lineupFit: lineupFit, posLabel: posLabel, secondPos: secondPos, SLOTS: SLOTS, vsOnClock: vsOnClock, vsPer: vsPer, auctionStart: auctionStart, auctionAct: auctionAct, aucOpts: aucOpts, aucMax: aucMax, aucCanRaise: aucCanRaise, playVersus: playVersus, VS_ORDER: VS_ORDER, spin: spin, takenKey: takenKey, extendPool: extendPool, franchise: franchise, spinRoster: spinRoster, matchups: matchups, start: start, step: step, runAll: runAll,
    progress: progress, summary: summary, play: play, perGame: perGame, groupOf: groupOf, primaryPos: primaryPos, rng: mulberry32
  };
  W.CHALLENGE = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
