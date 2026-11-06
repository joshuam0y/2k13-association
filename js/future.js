// 2K13 Association: the league after the real data ends (window.FUTURE). Classic script, plain JS, also module.exports under Node.
// Real history runs through 2025-26. After that each save writes its own future:
//   - the style of play keeps drifting (pace, threes, shooting, passing), so 2035 does not play like 2026
//   - each summer the league may announce a rule change for the next season: game rules (the arc moves
//     back, a 20 second shot clock, a 4-point line), the season format (72 games, flatter lottery odds),
//     money and the draft (a new media deal lifts the cap, the supermax goes away, high schoolers return)
//   - expansion to 32 teams (window.EXPANSION, js/expansion.js): announced two summers ahead
// Everything lives in state.future = { changes: [{ id, year, announced }], base: { year: era }, rolled: year,
// expansion: { year, announced, done } }. The engine reads season.era (set at the start of each season),
// CBA.rules goes through FUTURE's hook for cap and lottery changes, and js/draft-gen.js asks
// FUTURE.youngDraft for the share of 18 year olds. state.settings.futureRules and futureExpansion
// (true unless set to false on the settings page) switch each part off.
(function (root) {
  'use strict';

  var LAST_REAL = 2026;   // the last season with real league data
  // [pace, three, make2, ast, tov, make3, four] of 2025-26 (js/engine.js ERA plus the two new slots)
  var START_ERA = [1.07, 1.681, 0.0606, 1.048, 0.923, 0, 0];

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function rngOf(state, tag) { return mulberry32(hash((state.rngSeed || 1) + ':future:' + tag)); }
  function gauss(rng) { return (rng() + rng() + rng() + rng() - 2) * 1.732; }
  function seasonLabel(y) { return (y - 1) + '-' + String(y).slice(2); }

  // ---------------------------------------------------------------------------
  // The changes. mods: pace, three, ast, tov multiply; make2, make3, four add. cba(r): changes CBA.rules.
  // ---------------------------------------------------------------------------
  var CHANGES = [
    { id: 'arcBack', cat: 'game', w: 1, once: true, mods: { three: 0.86, make3: -0.012 },
      headline: 'NBA Moves The Three-Point Line Back',
      body: 'Starting in {season}, the arc moves back to 25 feet all the way around. The league expects fewer threes and a lower percentage on them.' },
    { id: 'shotClock20', cat: 'game', w: 1, once: true, mods: { pace: 1.06, tov: 1.03 },
      headline: 'Shot Clock Cut To 20 Seconds',
      body: 'The Board of Governors approved a 20 second shot clock for {season}. Expect more possessions, more points and a few more rushed turnovers.' },
    { id: 'freedom', cat: 'game', w: 1.1, mods: { make2: 0.01, make3: 0.005 },
      headline: 'Officials Told To Crack Down On Contact',
      body: 'A new freedom of movement point of emphasis for {season} takes away grabbing and hand-checking off the ball. Scorers should find it easier to get open.' },
    { id: 'physical', cat: 'game', w: 0.8, mods: { make2: -0.008, make3: -0.004, tov: 0.97 },
      headline: 'Referees Told To Let Them Play',
      body: 'After complaints about free throw parades, officials will call fewer marginal fouls in {season}. Defenses get to be more physical.' },
    { id: 'defThree', cat: 'game', w: 0.8, once: true, mods: { make2: -0.012, pace: 0.99 },
      headline: 'Defensive Three Seconds Rule Eliminated',
      body: 'Big men can now stay in the paint as long as they want on defense starting in {season}. Shots at the rim should get harder.' },
    { id: 'fourPoint', cat: 'game', w: 0.35, once: true, from: 2029, mods: { four: 0.06 },
      headline: 'NBA Adds A 4-Point Line',
      body: 'Starting in {season}, shots from beyond 30 feet are worth four points. The league expects a handful a game, and some wild comebacks.' },
    { id: 'season72', cat: 'format', w: 0.5, once: true, games: 72,
      headline: 'Regular Season Cut To 72 Games',
      body: 'Teams will play 72 games starting in {season}, to cut down on rest days and keep stars on the floor.' },
    { id: 'lotteryFlat', cat: 'format', w: 0.7, once: true,
      cba: function (r) { if (!r.lotteryOdds || r.lotteryOdds.length < 7) return; var s = 0, i; for (i = 0; i < 7; i++) s += +r.lotteryOdds[i]; for (i = 0; i < 7; i++) r.lotteryOdds[i] = Math.round(s / 7 * 100) / 100; },
      headline: 'Lottery Reform: Flatter Odds To Stop Tanking',
      body: 'The seven worst teams will all have the same chance at the top pick from the {season} draft lottery on.' },
    { id: 'mediaDeal', cat: 'money', w: 0.9, once: true, from: 2028,
      cba: function (r) {
        var k = 1.15;
        ['cap', 'tax', 'apron', 'apron2', 'firstApron', 'secondApron', 'minPayroll', 'mle', 'taxMle', 'roomException', 'bae'].forEach(function (f) { if (typeof r[f] === 'number') r[f] = Math.round(r[f] * k); });
        if (Array.isArray(r.maxTiers)) for (var i = 0; i < r.maxTiers.length; i++) r.maxTiers[i] = Math.round(r.maxTiers[i] * k);
      },
      headline: 'New Media Deal Sends The Salary Cap Soaring',
      body: 'The money from the new national TV deals arrives in {season}: the cap and every threshold jump 15 percent at once. Expect big free agent contracts.' },
    { id: 'supermaxGone', cat: 'money', w: 0.5, once: true,
      cba: function (r) { r.supermax = false; },
      headline: 'Supermax Contracts Eliminated',
      body: 'The new CBA removes the designated veteran extension starting in {season}. Stars top out at the regular max, which makes it harder to keep them.' },
    { id: 'highSchool', cat: 'money', w: 0.6, once: true, young: 0.6,
      headline: 'High Schoolers Can Enter The Draft Again',
      body: 'The one-and-done rule is gone: 18 year olds are eligible again from the {season} draft on (the draft held the summer before). Classes get younger and rawer.' }
  ];
  var BY_ID = {};
  CHANGES.forEach(function (c) { BY_ID[c.id] = c; });

  function settingOn(state, key) { return !(state && state.settings && state.settings[key] === false); }
  function fut(state) {
    var f = state.future || (state.future = {});
    f.changes = f.changes || [];
    f.base = f.base || {};
    return f;
  }
  function active(state, year) {
    if (!state || !state.future || !settingOn(state, 'futureRules')) return [];
    return state.future.changes.filter(function (c) { return c.year <= year && BY_ID[c.id]; });
  }

  // ---------------------------------------------------------------------------
  // The style of play after 2026: a slow random walk per save (threes keep rising toward a ceiling,
  // pace and passing wander, the other numbers pull back toward 2026), then the rule changes on top
  // ---------------------------------------------------------------------------
  function baseEra(state, year) {
    var f = fut(state);
    if (year <= LAST_REAL) return START_ERA.slice();
    if (f.base[year]) return f.base[year].slice();
    var prev = baseEra(state, year - 1), rng = rngOf(state, 'era' + year), e = prev.slice();
    e[0] = clamp(prev[0] + 0.25 * (1.07 - prev[0]) + 0.008 * gauss(rng), 0.97, 1.16);
    e[1] = clamp(prev[1] + 0.07 * (2.0 - prev[1]) + 0.025 * gauss(rng), 1.4, 2.15);
    e[2] = clamp(prev[2] + 0.2 * (0.065 - prev[2]) + 0.002 * gauss(rng), 0.04, 0.08);
    e[3] = clamp(prev[3] + 0.2 * (1.05 - prev[3]) + 0.01 * gauss(rng), 0.95, 1.12);
    e[4] = clamp(prev[4] + 0.25 * (0.92 - prev[4]) + 0.008 * gauss(rng), 0.85, 1);
    e[5] = 0; e[6] = 0;
    e = e.map(function (x) { return Math.round(x * 10000) / 10000; });
    f.base[year] = e;
    return e.slice();
  }
  // The season's style for the engine (ENGINE.simGame opts.era), or null through 2026
  function eraFor(state, year) {
    if (!state || year <= LAST_REAL) return null;
    var e = baseEra(state, year);
    var m = { pace: e[0], three: e[1], make2: e[2], ast: e[3], tov: e[4], make3: e[5], four: e[6] };
    active(state, year).forEach(function (c) {
      var d = BY_ID[c.id].mods;
      if (!d) return;
      ['pace', 'three', 'ast', 'tov'].forEach(function (k) { if (d[k] != null) m[k] *= d[k]; });
      ['make2', 'make3', 'four'].forEach(function (k) { if (d[k] != null) m[k] += d[k]; });
    });
    return m;
  }

  // ---------------------------------------------------------------------------
  // Summer announcements (LEAGUE.endSeason calls FUTURE.summer once the season is over)
  // ---------------------------------------------------------------------------
  function post(state, headline, body) {
    state.news = state.news || [];
    state.news.unshift({ year: state.year, day: state.day || 0, headline: headline, body: body, ids: [], tag: 'league' });
  }
  function summer(state) {
    var f = fut(state), done = state.year, next = done + 1;
    if (done < LAST_REAL || f.rolled >= done) return null;
    f.rolled = done;
    var rng = rngOf(state, 'summer' + done), out = null;
    // expansion: once, announced two summers ahead (a team starts play in next + 1)
    var X = root && root.EXPANSION;
    if (X && typeof X.addTeams === 'function' && settingOn(state, 'futureExpansion') && !f.expansion) {
      var odds = done >= 2030 ? 1 : done === LAST_REAL ? 0.2 : 0.3;
      if (rng() < odds) {
        f.expansion = { year: next + 1, announced: done };
        post(state, 'NBA Votes To Expand To 32 Teams', 'Seattle and Las Vegas join the league for the ' + seasonLabel(next + 1) + ' season. An expansion draft follows the ' + next + ' draft, and the conferences will be realigned.');
        out = { expansion: next + 1 };
      }
    }
    if (!settingOn(state, 'futureRules')) { activate(state); return out; }
    // a rule change most summers, never two in one summer
    if (rng() < 0.4) {
      var used = {};
      f.changes.forEach(function (c) { used[c.id] = c.year; });
      var pool = CHANGES.filter(function (c) {
        if (c.from && next < c.from) return false;
        if (c.once && used[c.id] != null) return false;
        if (used[c.id] != null && next - used[c.id] < 6) return false;
        if (c.id === 'physical' && used.freedom != null && next - used.freedom < 3) return false;
        if (c.id === 'freedom' && used.physical != null && next - used.physical < 3) return false;
        return true;
      });
      var tot = 0;
      pool.forEach(function (c) { tot += c.w; });
      var r = rng() * tot, pick = null;
      for (var i = 0; i < pool.length && !pick; i++) { r -= pool[i].w; if (r <= 0) pick = pool[i]; }
      pick = pick || pool[pool.length - 1];
      if (pick) {
        f.changes.push({ id: pick.id, year: next, announced: done });
        post(state, pick.headline, pick.body.replace('{season}', 'the ' + seasonLabel(next) + ' season'));
        out = out || {};
        out.change = pick.id;
      }
    }
    activate(state);
    return out;
  }

  // After the draft (LEAGUE.nextPhase, draft to re-signing): the expansion teams join for next season
  function afterDraft(state) {
    var f = state.future, X = root && root.EXPANSION;
    if (!f || !f.expansion || f.expansion.done || f.expansion.year !== state.year + 1 || !X) return false;
    if (!settingOn(state, 'futureExpansion')) return false;
    X.addTeams(state, { year: state.year + 1 });
    f.expansion.done = true;
    return true;
  }

  // ---------------------------------------------------------------------------
  // The new season (LEAGUE.startSeason): its era for the engine, a shorter schedule if the league cut games
  // ---------------------------------------------------------------------------
  function seasonGames(state, year) {
    var g = 82;
    active(state, year).forEach(function (c) { if (BY_ID[c.id].games) g = BY_ID[c.id].games; });
    return g;
  }
  // Takes games off a generated 82 game schedule until every team plays `games` (random, retried until it fits)
  function trimSchedule(season, games, rng) {
    var days = season.days || [];
    var all = [];
    days.forEach(function (d, di) { (d.games || []).forEach(function (g, gi) { if (!g.playIn && !g.playoff) all.push([di, gi, g]); }); });
    var teams = {};
    all.forEach(function (x) { teams[x[2].home] = (teams[x[2].home] || 0) + 1; teams[x[2].away] = (teams[x[2].away] || 0) + 1; });
    var cut = null;
    for (var tries = 0; tries < 60 && !cut; tries++) {
      var need = {}, order = all.slice(), drop = [];
      Object.keys(teams).forEach(function (t) { need[t] = teams[t] - games; });
      for (var k = order.length - 1; k > 0; k--) { var j = Math.floor(rng() * (k + 1)); var tmp = order[k]; order[k] = order[j]; order[j] = tmp; }
      order.forEach(function (x) { var g = x[2]; if (need[g.home] > 0 && need[g.away] > 0) { need[g.home]--; need[g.away]--; drop.push(x); } });
      if (Object.keys(need).every(function (t) { return need[t] === 0; })) cut = drop;
    }
    if (!cut) return false;
    var gone = {};
    cut.forEach(function (x) { gone[x[0] + ':' + x[1]] = 1; });
    days.forEach(function (d, di) { d.games = (d.games || []).filter(function (g, gi) { return !gone[di + ':' + gi]; }); });
    season.days = days.filter(function (d) { return d.games.length || d.allStar || d.event; });
    season.seasonGames = games;
    return true;
  }
  function startSeason(state) {
    var s = state.season;
    if (!s) return;
    var era = eraFor(state, state.year);
    if (era) s.era = era; else delete s.era;
    var g = seasonGames(state, state.year);
    if (g < 82 && !s.trimmed) { if (trimSchedule(s, g, rngOf(state, 'sched' + state.year))) s.trimmed = g; }
    activate(state);
  }

  // ---------------------------------------------------------------------------
  // Hooks for CBA.rules and the draft generator (the save that is playing right now)
  // ---------------------------------------------------------------------------
  var current = null;
  function activate(state) {
    current = state || null;
    var C = root && root.CBA;
    if (C && typeof C.setFuture === 'function') C.setFuture(state && state.future && state.future.changes.length ? cbaHook : null);
  }
  function cbaHook(r, year) {
    if (!current) return;
    active(current, year).forEach(function (c) { var d = BY_ID[c.id]; if (d.cba) d.cba(r, year); });
    var g = seasonGames(current, year);
    if (g !== 82) r.seasonGames = g;
  }
  // Extra share of 18 year olds in the draft held in the summer of `year` (0 = the real mix)
  function youngDraft(year) {
    if (!current) return 0;
    var y = 0;
    active(current, year + 1).forEach(function (c) { if (BY_ID[c.id].young) y = BY_ID[c.id].young; });
    return y;
  }

  // The list for the League page: every announced change, newest first
  function timeline(state) {
    var f = state && state.future;
    if (!f) return [];
    var out = (f.changes || []).map(function (c) { var d = BY_ID[c.id] || {}; return { year: c.year, announced: c.announced, id: c.id, cat: d.cat, headline: d.headline, body: (d.body || '').replace('{season}', 'the ' + seasonLabel(c.year) + ' season') }; });
    if (f.expansion) out.push({ year: f.expansion.year, announced: f.expansion.announced, id: 'expansion', cat: 'format', headline: 'Expansion To 32 Teams', body: 'Seattle and Las Vegas join for the ' + seasonLabel(f.expansion.year) + ' season.' + (f.expansion.done ? '' : ' (coming)') });
    return out.sort(function (a, b) { return b.year - a.year; });
  }

  var FUTURE = {
    LAST_REAL: LAST_REAL, CHANGES: CHANGES,
    eraFor: eraFor, summer: summer, afterDraft: afterDraft, startSeason: startSeason, activate: activate,
    youngDraft: youngDraft, seasonGames: seasonGames, trimSchedule: trimSchedule, timeline: timeline
  };
  if (root) root.FUTURE = FUTURE;
  if (typeof module !== 'undefined' && module.exports) module.exports = FUTURE;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
