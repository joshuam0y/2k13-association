// Draft Challenge (#/challenge): build a starting five, drop it on a franchise with a scrub bench and sim
// one season with playoffs, separate from the Association saves.
//   One season: the real league of 2003-04, 2008-09, 2012-13 or 2016-17. Pick any five (free) or spin the
//   wheel five times and take one player from each team it lands on. Your picks leave their real teams,
//   which sign the best free agent at the spot; the franchise you take over loses its real roster.
//   All-time: veterans from every season in one pool (no rookies), a 30-team, 5-round snake draft against
//   29 AI teams; every team plays its five big minutes with a scrub bench.
// Ratings: 2012-13 is the real 2K13 file (data/league2012.js); the other seasons are rated from real stats
// on the 2K13 scale (data/era-YYYY.js, loaded on demand).
// window.CHALLENGE holds the logic (node: tools/test-challenge.js); the page is drawn when the UI is loaded.
(function (root) {
  'use strict';
  var W = root;
  var SEASONS = [
    { year: 2004, label: '2003-04', file: 'data/era-2004.js' },
    { year: 2009, label: '2008-09', file: 'data/era-2009.js' },
    { year: 2013, label: '2012-13', builtin: true },
    { year: 2017, label: '2016-17', file: 'data/era-2017.js' }
  ];
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
  function loaded(year) { return +year === 2013 ? !!W.LEAGUE_2012 : !!(W.ERA_ROSTERS && W.ERA_ROSTERS[year]); }
  function seasonData(year) {
    year = +year;
    if (cache[year]) return cache[year];
    var info = seasonInfo(year);
    if (!info || !loaded(year)) return null;
    var src = year === 2013 ? W.LEAGUE_2012 : W.ERA_ROSTERS[year];
    var prior = W.CAREER_PRIOR || null;
    var teams = src.teams.map(function (t) {
      return { abbr: t.abbr, city: t.city, name: t.name, conf: t.conf, div: t.div, colors: (t.colors || ['#333', '#777']).slice(0, 2), logo: t.logo || null,
        logoNoRef: !!t.logoNoRef, real: t.real || t.record || (year === 2013 && REAL_2013[t.abbr] ? { w: REAL_2013[t.abbr][0], l: REAL_2013[t.abbr][1] } : null) };
    });
    var known = {};
    teams.forEach(function (t) { known[t.abbr] = true; });
    var players = [], free = [];
    src.players.forEach(function (p0) {
      if (p0.stashedUntil) return;
      var p = { id: p0.id, name: p0.name, team: p0.team, pos: p0.pos, age: p0.age, ht: p0.ht, wt: p0.wt, ovr: p0.ovr, attrs: p0.attrs,
        nbaId: p0.nbaId || null, stats: p0.stats || null, season: year };
      if (p0.tend) p.tend = p0.tend;
      if (year === 2013) {
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
  function eraTeam(year, abbr) { var d = seasonData(year); return d ? d.teams.filter(function (t) { return t.abbr === abbr; })[0] || null : null; }

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
  function buildYear(cfg) {
    var d = seasonData(cfg.year);
    if (!d) throw new Error('The ' + cfg.year + ' rosters are not loaded.');
    var rng = mulberry32((cfg.seed ^ 0x2545F491) >>> 0);
    var teams = d.teams.map(clone), T = cfg.team;
    var user = teams.filter(function (t) { return t.abbr === T; })[0];
    if (!user) throw new Error('Unknown team ' + T);
    var players = {}, pool = [];
    d.players.concat(d.free).forEach(function (p0) { var p = clone(p0); p.injury = null; players[p.id] = p; });
    var picks = (cfg.picks || []).filter(function (id) { return players[id]; });
    if (picks.length !== 5) throw new Error('Pick five players first.');
    var picked = {};
    picks.forEach(function (id) { picked[id] = true; });
    var moves = [], lost = {};
    picks.forEach(function (id, i) {
      var p = players[id];
      if (p.team !== T && p.team !== 'FA') { (lost[p.team] = lost[p.team] || []).push(p); }
      p.realTeam = p.team; p.team = T; p.pick = i + 1;
    });
    // the franchise's real roster leaves
    Object.keys(players).forEach(function (id) {
      var p = players[id];
      if (picked[id]) return;
      if (p.team === T) { p.realTeam = T; p.team = 'FA'; }
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
    user.autoStyle = 'challenge';
    user.orig = { city: user.city, name: user.name };
    if (cfg.name) { var nm = splitName(cfg.name, user); user.city = nm.city; user.name = nm.name; }
    var used = {};
    Object.keys(players).forEach(function (id) { used[players[id].name] = true; });
    makeScrubs(T, scrubTemplates(d), rng, used).forEach(function (s) { players[s.id] = s; });
    return finishBuild(cfg, d.year, teams, players, moves, null);
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
    var base = seasonData(2013);
    if (!base) throw new Error('League data not loaded');
    var rng = mulberry32((cfg.seed ^ 0x51ED270B) >>> 0);
    var order = shuffle(base.teams.map(function (t) { return t.abbr; }), rng);
    if (cfg.slot) {
      var at = order.indexOf(cfg.team), to = clamp(cfg.slot, 1, order.length) - 1;
      order[at] = order[to]; order[to] = cfg.team;
    }
    return { cfg: cfg, order: order, picks: [], taken: {}, pool: allTimePool(), spins: [], respins: 1 };
  }
  function draftSlot(dr, n) {
    var N = dr.order.length, r = Math.floor(n / N), k = n % N;
    return { n: n, round: r + 1, pick: k + 1, team: r % 2 === 0 ? dr.order[k] : dr.order[N - 1 - k] };
  }
  function onClock(dr) { return dr.picks.length >= dr.order.length * ROUNDS ? null : draftSlot(dr, dr.picks.length); }
  function available(dr) { return dr.pool.filter(function (e) { return !dr.taken[e.base]; }); }
  function teamPicks(dr, abbr) { return dr.picks.filter(function (x) { return x.team === abbr; }).map(function (x) { return entry(dr, x.key); }); }
  function entry(dr, key) { for (var i = 0; i < dr.pool.length; i++) if (dr.pool[i].key === key) return dr.pool[i]; return null; }
  function draftPick(dr, key) {
    var c = onClock(dr), e = entry(dr, key);
    if (!c) return { ok: false, reason: 'The draft is over.' };
    if (!e || dr.taken[e.base]) return { ok: false, reason: 'That player is already taken.' };
    dr.taken[e.base] = true;
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
    available(dr).slice(0, 50).forEach(function (e) { var s = aiScore(dr, c.team, e, rng); if (s > bs) { bs = s; best = e; } });
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
    var teams = base.teams.map(clone), players = {}, used = {};
    var tpl = scrubTemplates(base);
    dr.pool.forEach(function (e) { used[e.name] = true; });
    teams.forEach(function (t) {
      t.autoStyle = 'challenge'; t.real = null;
      t.orig = { city: t.city, name: t.name };
      if (t.abbr === cfg.team && cfg.name) { var nm = splitName(cfg.name, t); t.city = nm.city; t.name = nm.name; }
      teamPicks(dr, t.abbr).forEach(function (e, i) {
        var p = clone(e);
        p.id = e.key; p.team = t.abbr; p.realTeam = e.from; p.pick = i + 1; p.injury = null;
        players[p.id] = p;
      });
      makeScrubs(t.abbr, tpl, rng, used).forEach(function (s) { players[s.id] = s; });
    });
    cfg.picks = teamPicks(dr, cfg.team).map(function (e) { return e.key; });
    return finishBuild(cfg, 2013, teams, players, [], dr);
  }

  function finishBuild(cfg, year, teams, players, moves, dr) {
    var list = [];
    var known = {};
    teams.forEach(function (t) { known[t.abbr] = true; });
    Object.keys(players).forEach(function (id) { var p = players[id]; if (known[p.team]) list.push(p); });
    var eraYear = cfg.mode === 'alltime' ? +(cfg.era || 2013) : year;
    return { cfg: cfg, year: year, eraYear: eraYear, user: cfg.team, teams: teams, players: players, moves: moves,
      league: { season: year, teams: teams, players: list }, draft: dr ? { order: dr.order, picks: dr.picks } : null };
  }

  // ---------- schedule ----------
  // Every team plays 82: three games against everyone, minus the pairs at the smallest distances on a
  // shuffled circle (two games instead), so each team drops the same number. Works for 29 to 32 teams.
  function matchups(abbrs, rng) {
    var order = shuffle(abbrs.slice(), rng), N = order.length;
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

  // ---------- the season ----------
  function start(ch) {
    var E = W.ENGINE;
    if (!E) throw new Error('Game engine not loaded');
    var rng = mulberry32((ch.cfg.seed ^ 0x6C8E9CF5) >>> 0);
    var y = ch.year;
    var season = E.newSeason(ch.league, { year: y, realSchedule: false, playIn: false, rng: rng, userTeam: ch.user });
    season.days = E.buildSchedule(season.teams, rng, (y - 1) + '-10-30', y + '-04-16', matchups(season.teams.map(function (t) { return t.abbr; }), rng));
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
        series.push({ round: ri + 1, name: ROUND_NAME[ri] || 'Round ' + (ri + 1), opp: mineHi ? x.lo : x.hi, oppName: nameOf(ch, mineHi ? x.lo : x.hi), w: w, l: l, won: x.winner === u });
      });
    });
    var champ = s.champion || (s.playoffs && s.playoffs.champion) || null;
    if (champ === u) exit = 'champion';
    else if (series.length) exit = ['first', 'semis', 'conf', 'finals'][series[series.length - 1].round - 1] || 'first';
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
      standings: standings, leaders: leaders, moves: ch.moves || [], picks: (ch.cfg.picks || []).slice(), cfg: clone(ch.cfg),
      teams: ch.teams.map(function (t) { return { abbr: t.abbr, city: t.city, name: t.name, colors: t.colors, logo: t.logo, logoNoRef: t.logoNoRef, conf: t.conf }; }),
      draft: ch.draft ? ch.draft.picks.map(function (x) { var e = ch.players[x.key]; return { n: x.n, team: x.team, key: x.key, name: e ? e.name : x.key, label: e ? e.label : '', ovr: e ? e.ovr : 0 }; }) : null
    };
  }

  // One call for tests and quick sims: cfg (+ draft for all-time) to a finished summary.
  function play(cfg, dr) {
    var ch = cfg.mode === 'alltime' ? buildAllTime(cfg, dr) : buildYear(cfg);
    start(ch);
    return runAll(ch);
  }

  var API = {
    SEASONS: SEASONS, ROUNDS: ROUNDS, seasonInfo: seasonInfo, seasonData: seasonData, loaded: loaded, load: load, loadAll: loadAll,
    allTimePool: allTimePool, eraTeam: eraTeam, buildYear: buildYear, buildAllTime: buildAllTime, newDraft: newDraft, onClock: onClock,
    draftSlot: draftSlot, draftPick: draftPick, aiPick: aiPick, simToUser: simToUser, autoDraft: autoDraft, available: available,
    teamPicks: teamPicks, spin: spin, spinRoster: spinRoster, matchups: matchups, start: start, step: step, runAll: runAll,
    progress: progress, summary: summary, play: play, perGame: perGame, groupOf: groupOf, primaryPos: primaryPos, rng: mulberry32
  };
  W.CHALLENGE = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
