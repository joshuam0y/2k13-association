// 2K13 Association: D-League / G League and two-way contracts (window.GLEAGUE).
// Classic script, plain JS, no libraries. Also module.exports under Node.
// Club and affiliation data: data/gleague.js (window.GLEAGUE_DATA).
// State kept in state.gleague = { year, week, simDay, usageDay, assigned: { [playerId]: clubId }, since: { [playerId]: week },
//   standings: { [clubId]: { w, l, pf, pa } }, stats: { [playerId]: totals }, usage: { [playerId]: { days, games } },
//   twoWaySeen: { [playerId]: true }, results: [ ... ] }.
// An assigned player also has player.gleague = true (contract-v2). The orchestrator's leagueView skips those players,
// so they play no NBA games. Main entry points:
//   eligible(state, id) -> { ok, reason }    can he be sent down right now?
//   recallable(state, id) -> { ok, reason }  can he be called up right now?
//   assign(state, id) / recall(state, id) -> { ok, reason }
//   roster(state, abbr) -> { nba: [rows], affiliate: [rows], club, clubName, league, counts, rule }
//   sync(state, rng) plays every full week of D-League games since the last call (safe to call after every sim day).
(function (root) {
  'use strict';

  var SEASON_GAMES = 50;
  var MIN_HEALTHY = 8;   // an NBA team has to dress at least eight players
  var STAT_KEYS = ['min', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'reb', 'ast', 'stl', 'blk', 'tov'];

  function data() {
    if (typeof window !== 'undefined' && window.GLEAGUE_DATA) return window.GLEAGUE_DATA;
    if (root && root.GLEAGUE_DATA) return root.GLEAGUE_DATA;
    if (typeof require === 'function') { try { return require('../data/gleague.js'); } catch (e) { /* ignore */ } }
    return { clubs: [], affiliates: {}, leagueNames: [{ from: 2002, name: 'NBA D-League' }] };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function rngOf(r) { return typeof r === 'function' ? r : Math.random; }
  function yearOf(state) { return (state && state.year) || 2013; }
  function gauss(rng) { var u = 0, v = 0; while (u === 0) u = rng(); v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function clubById(id) {
    var list = data().clubs;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function active(c, year) { return c.from <= year && (c.to == null || c.to >= year); }
  function nameIn(c, year) {
    var n = c.names[0];
    c.names.forEach(function (x) { if (x.from <= year) n = x; });
    return n;
  }

  function leagueName(year) {
    var n = 'NBA D-League';
    data().leagueNames.forEach(function (x) { if (x.from <= year) n = x.name; });
    return n;
  }
  function shortName(year) { return leagueName(year).replace(/^NBA /, ''); }

  // The club an NBA team is affiliated with in a given season, or null (flexible assignment).
  function affiliateOf(abbr, year) {
    var list = data().affiliates[abbr] || [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (a[0] <= year && (a[1] == null || a[1] >= year)) return a[2];
    }
    return null;
  }

  // All clubs playing in a season: [{ id, city, name, full, affiliates: [abbr] }]
  function clubs(year) {
    year = year || 2013;
    var aff = data().affiliates;
    return data().clubs.filter(function (c) { return active(c, year); }).map(function (c) {
      var n = nameIn(c, year);
      var teams = [];
      Object.keys(aff).forEach(function (abbr) {
        if (abbr === 'NOP' || abbr === 'CHH') return;   // aliases
        if (affiliateOf(abbr, year) === c.id) teams.push(abbr);
      });
      return { id: c.id, city: n.city, name: n.name, full: n.city + ' ' + n.name, affiliates: teams };
    });
  }

  function clubName(id, year) {
    var c = clubById(id);
    if (!c) return id;
    var n = nameIn(c, year || 2013);
    return n.city + ' ' + n.name;
  }

  // The club a team's players go to: its affiliate, or a flexible-assignment club picked the same way every time.
  function clubFor(state, abbr) {
    var year = yearOf(state);
    var a = affiliateOf(abbr, year);
    if (a) return a;
    var open = clubs(year).filter(function (c) { return c.affiliates.length === 0 || c.id === 'FWA'; });
    if (!open.length) open = clubs(year);
    if (!open.length) return null;
    return open[hash(abbr + year) % open.length].id;
  }

  // Two-way contracts: from 2017-18. 45 NBA days through 2019-20, 50 NBA games from 2020-21
  // (the 72-game 2020-21 season already used a games limit), three slots per team from 2023-24.
  function twoWayRules(year) {
    if (year < 2018) return { allowed: false, slots: 0, limitType: null, limit: 0 };
    if (year <= 2020) return { allowed: true, slots: 2, limitType: 'days', limit: 45 };
    return { allowed: true, slots: year >= 2024 ? 3 : 2, limitType: 'games', limit: 50 };
  }

  // Who can be sent down without asking. Through 2016-17: players in their first two NBA seasons
  // (yearsPro 0 or 1), any number of times. From 2017-18: fewer than three years of service, any number of times.
  // Veterans past that need to agree (opts.consent).
  function assignRule(year) {
    if (year <= 2017) return { maxYearsPro: 1, text: 'Players in their first two NBA seasons can be sent down and called up any number of times.' };
    return { maxYearsPro: 2, text: 'Players with fewer than three years of service can be sent down and called up any number of times.' };
  }

  function newSeason(state) {
    var year = yearOf(state);
    var day = state.season && state.season.day || 0;
    var g = { year: year, week: 0, simDay: day, usageDay: day, assigned: {}, since: {}, standings: {}, stats: {}, usage: {},
      twoWaySeen: {}, results: [], manualUsage: false };
    clubs(year).forEach(function (c) { g.standings[c.id] = { w: 0, l: 0, pf: 0, pa: 0 }; });
    // players already flagged as assigned keep their spot
    var ps = state.players || {};
    Object.keys(ps).forEach(function (id) {
      var p = ps[id];
      if (p && p.gleague && !p.retired && state.teams && state.teams[p.team]) { g.assigned[id] = clubFor(state, p.team); g.since[id] = 0; }
    });
    state.gleague = g;
    return g;
  }

  function ensure(state) {
    if (!state.gleague || state.gleague.year !== yearOf(state)) newSeason(state);
    var g = state.gleague;
    if (!g.since) g.since = {};
    if (!g.twoWaySeen) g.twoWaySeen = {};
    if (g.simDay == null) g.simDay = state.season && state.season.day || 0;
    if (g.usageDay == null) g.usageDay = g.simDay;
    return g;
  }

  function txn(state, text, ids) {
    if (!state.transactions) return;
    // AI teams move players up and down every week; only the user's moves go in the log (it would
    // otherwise be hundreds of lines a season and bury the trades and signings)
    var ps = state.players || {};
    if (state.userTeam && !(ids || []).some(function (id) { return ps[id] && ps[id].team === state.userTeam; })) return;
    state.transactions.push({ year: yearOf(state), day: state.day || 0, type: 'assign', text: text, ids: ids || [] });
  }
  function isTwoWay(p) { return !!(p && p.contract && p.contract.twoWay); }
  function onNbaTeam(state, p) {
    return !!(p && !p.retired && state.teams && state.teams[p.team] && !(p.stashedUntil && p.stashedUntil > yearOf(state)));
  }
  function injuryOf(state, p) {
    var inj = state.season && state.season.injuries && state.season.injuries[p.id];
    if (inj && inj.games > 0) return inj;
    return p.injury && p.injury.games > 0 ? p.injury : null;
  }

  // Keeps state.gleague.assigned and player.gleague in step after trades, releases and signings,
  // and sends new two-way players to the affiliate (where a two-way contract lives by default).
  function reconcile(state) {
    var g = ensure(state), ps = state.players || {};
    Object.keys(g.assigned).forEach(function (id) {
      var p = ps[id];
      if (!p || !onNbaTeam(state, p) || p.gleague === false) {
        delete g.assigned[id]; delete g.since[id];
        if (p && p.gleague) p.gleague = false;
        return;
      }
      var c = clubFor(state, p.team);
      if (c && g.assigned[id] !== c) g.assigned[id] = c;
    });
    var tw = twoWayRules(yearOf(state));
    Object.keys(ps).forEach(function (id) {
      var p = ps[id];
      if (!p) return;
      if (p.gleague && !g.assigned[id]) {
        if (onNbaTeam(state, p)) { g.assigned[id] = clubFor(state, p.team); g.since[id] = g.week; } else p.gleague = false;
      }
      if (tw.allowed && isTwoWay(p) && onNbaTeam(state, p) && !g.twoWaySeen[id]) {
        g.twoWaySeen[id] = true;
        if (!g.assigned[id]) { var c = clubFor(state, p.team); if (c) { g.assigned[id] = c; g.since[id] = g.week; p.gleague = true; } }
      }
    });
    return g;
  }

  // Healthy players the NBA team can dress right now (assigned players excluded).
  function healthyNba(state, abbr) {
    var ps = state.players || {}, n = 0;
    Object.keys(ps).forEach(function (id) {
      var p = ps[id];
      if (p && p.team === abbr && onNbaTeam(state, p) && !p.gleague && !injuryOf(state, p)) n++;
    });
    return n;
  }

  // Can this player be sent down right now? { ok, reason }. The reason is one short line.
  function eligible(state, playerId, opts) {
    opts = opts || {};
    var p = state.players && state.players[playerId];
    var year = yearOf(state), lg = shortName(year);
    if (!p) return { ok: false, reason: 'Unknown player.' };
    if (p.retired) return { ok: false, reason: 'Retired.' };
    if (!state.teams || !state.teams[p.team]) return { ok: false, reason: 'Not on an NBA roster.' };
    if (p.stashedUntil && p.stashedUntil > year) return { ok: false, reason: 'Playing overseas this season.' };
    var g = ensure(state);
    if (g.assigned[playerId] || p.gleague) return { ok: false, reason: 'Already in the ' + lg + '.' };
    if (state.season && state.season.phase && state.season.phase !== 'regular' && !opts.force) {
      return { ok: false, reason: 'The ' + lg + ' season is over.' };
    }
    if (injuryOf(state, p)) return { ok: false, reason: 'Injured: he has to be healthy to go down.' };
    if (!isTwoWay(p)) {
      var rule = assignRule(year);
      if ((p.yearsPro || 0) > rule.maxYearsPro && !opts.consent) {
        return { ok: false, reason: year <= 2017 ? 'Only first- and second-year players can be sent down.'
          : 'Only players with under three years of service can be sent down.' };
      }
    }
    if (healthyNba(state, p.team) - 1 < MIN_HEALTHY && !opts.force) {
      return { ok: false, reason: 'The NBA team has to keep at least ' + MIN_HEALTHY + ' healthy players.' };
    }
    if (!clubFor(state, p.team)) return { ok: false, reason: 'No club available.' };
    return { ok: true, reason: isTwoWay(p) ? 'Two-way contract: he can go down any time.' : assignRule(year).text };
  }

  function usageOf(state, playerId) {
    var g = ensure(state);
    return g.usage[playerId] || (g.usage[playerId] = { days: 0, games: 0 });
  }

  function canUseNba(state, playerId) {
    var p = state.players && state.players[playerId];
    if (!isTwoWay(p)) return true;
    var r = twoWayRules(yearOf(state));
    if (!r.allowed) return true;
    var u = usageOf(state, playerId);
    return (r.limitType === 'days' ? u.days : u.games) < r.limit;
  }

  // NBA days or games left on a two-way deal: { type: 'days'|'games', left, limit } or null.
  function nbaLeft(state, playerId) {
    var p = state.players && state.players[playerId];
    var r = twoWayRules(yearOf(state));
    if (!isTwoWay(p) || !r.allowed) return null;
    var u = usageOf(state, playerId);
    return { type: r.limitType, left: Math.max(0, r.limit - (r.limitType === 'days' ? u.days : u.games)), limit: r.limit };
  }

  // Can this player be called up right now? { ok, reason }
  function recallable(state, playerId) {
    var p = state.players && state.players[playerId];
    if (!p) return { ok: false, reason: 'Unknown player.' };
    var g = ensure(state);
    if (!g.assigned[playerId] && !p.gleague) return { ok: false, reason: 'Already with the NBA team.' };
    if (isTwoWay(p) && !canUseNba(state, playerId)) {
      return { ok: false, reason: 'No NBA ' + twoWayRules(yearOf(state)).limitType + ' left on his two-way deal.' };
    }
    return { ok: true, reason: '' };
  }

  // Assigned players leave the rotation; called-up players join at the end of the bench.
  function fixRotation(state, abbr, playerId, kind) {
    var tm = state.teams && state.teams[abbr];
    if (!tm) return;
    var lu = state.season && state.season.lineups && state.season.lineups[abbr];
    if (kind === 'assign') {
      if (Array.isArray(tm.rotation)) tm.rotation = tm.rotation.filter(function (x) { return x !== playerId; });
      if (Array.isArray(tm.inactive)) tm.inactive = tm.inactive.filter(function (x) { return x !== playerId; });
      if (tm.minutes && typeof tm.minutes === 'object') delete tm.minutes[playerId];
      if (lu) {
        var starters = Array.isArray(tm.rotation) && tm.rotation.length >= 5 ? tm.rotation.slice(0, 5)
          : (lu.starters || []).filter(function (x) { return x !== playerId; });
        var mins = lu.minutes && typeof lu.minutes === 'object' ? Object.assign({}, lu.minutes) : null;
        if (mins) delete mins[playerId];
        if (starters.length >= 5) state.season.lineups[abbr] = { starters: starters, minutes: mins };
        else delete state.season.lineups[abbr];
      }
    } else {
      if (Array.isArray(tm.rotation) && tm.rotation.length && tm.rotation.indexOf(playerId) < 0) tm.rotation.push(playerId);
      if (tm.minutes && typeof tm.minutes === 'object' && tm.minutes[playerId] == null) tm.minutes[playerId] = 0;
      if (lu && lu.minutes && typeof lu.minutes === 'object' && lu.minutes[playerId] == null) lu.minutes[playerId] = 0;
    }
  }

  // Sends a player to his team's affiliate. opts.consent: a veteran agreed. opts.force: skip the roster and season checks.
  function assign(state, playerId, opts) {
    opts = opts || {};
    reconcile(state);
    var e = eligible(state, playerId, opts);
    if (!e.ok) return e;
    var g = ensure(state), p = state.players[playerId];
    accountUsage(state);
    var club = clubFor(state, p.team);
    g.assigned[playerId] = club;
    g.since[playerId] = g.week;
    p.gleague = true;
    fixRotation(state, p.team, playerId, 'assign');
    txn(state, 'The ' + p.team + ' assigned ' + p.name + ' to the ' + clubName(club, yearOf(state)) + ' (' + shortName(yearOf(state)) + ').', [playerId]);
    return { ok: true, reason: '', club: club, clubName: clubName(club, yearOf(state)) };
  }

  function recall(state, playerId) {
    reconcile(state);
    var r = recallable(state, playerId);
    if (!r.ok) return r;
    var g = ensure(state), p = state.players[playerId];
    accountUsage(state);
    var club = g.assigned[playerId];
    delete g.assigned[playerId];
    delete g.since[playerId];
    p.gleague = false;
    fixRotation(state, p.team, playerId, 'recall');
    txn(state, 'The ' + p.team + ' recalled ' + p.name + (club ? ' from the ' + clubName(club, yearOf(state)) : '') + '.', [playerId]);
    return { ok: true, reason: '' };
  }

  // Can this player suit up for his NBA team right now?
  function nbaAvailable(state, playerId) {
    var p = state.players && state.players[playerId];
    if (!p || p.retired) return false;
    if (p.gleague || (state.gleague && state.gleague.assigned[playerId])) return false;
    return canUseNba(state, playerId);
  }

  function sendDownForLimit(state, playerId) {
    var g = ensure(state), p = state.players[playerId];
    if (g.assigned[playerId] || !onNbaTeam(state, p)) return;
    var club = clubFor(state, p.team);
    if (!club) return;
    g.assigned[playerId] = club; g.since[playerId] = g.week; p.gleague = true;
    fixRotation(state, p.team, playerId, 'assign');
    txn(state, p.name + ' used up his NBA time on a two-way contract and returns to the ' + clubName(club, yearOf(state)) + '.', [playerId]);
  }

  // The orchestrator may call this when a two-way player spends NBA days or plays NBA games.
  // Once it is used, the module stops counting NBA time on its own.
  function recordNba(state, playerId, amount) {
    var g = ensure(state);
    g.manualUsage = true;
    var u = usageOf(state, playerId);
    u.days += (amount && amount.days) || 0;
    u.games += (amount && amount.games) || 0;
    if (isTwoWay(state.players[playerId]) && !canUseNba(state, playerId)) sendDownForLimit(state, playerId);
    return u;
  }

  // Counts NBA days (or team games) for two-way players who are with their NBA team, from the last count to today.
  function accountUsage(state) {
    var g = ensure(state), s = state.season;
    var day = s && s.day || 0;
    if (g.usageDay > day) g.usageDay = day;          // a new engine season started
    var from = g.usageDay;
    g.usageDay = day;
    var r = twoWayRules(yearOf(state));
    if (!r.allowed || g.manualUsage || day <= from || !s) return;
    var ps = state.players || {};
    Object.keys(ps).forEach(function (id) {
      var p = ps[id];
      if (!isTwoWay(p) || g.assigned[id] || p.gleague || !onNbaTeam(state, p)) return;
      var u = usageOf(state, id);
      if (r.limitType === 'days') u.days += day - from;
      else {
        var n = 0;
        for (var d = from; d < day && Array.isArray(s.days) && d < s.days.length; d++) {
          (s.days[d].games || []).forEach(function (gm) { if (gm.home === p.team || gm.away === p.team) n++; });
        }
        u.games += n;
      }
      if (!canUseNba(state, id)) sendDownForLimit(state, id);
    });
  }

  function twoWaySlots(state, abbr) {
    var r = twoWayRules(yearOf(state));
    var used = 0;
    var ps = state.players || {};
    Object.keys(ps).forEach(function (id) { if (ps[id].team === abbr && isTwoWay(ps[id]) && !ps[id].retired) used++; });
    return { total: r.slots, used: used, open: Math.max(0, r.slots - used) };
  }

  function attr(p, k) {
    var a = p.attrs && p.attrs[k];
    return typeof a === 'number' ? a : (p.ovr || 60);
  }

  // One game line for an NBA player in the minor league, from his ratings.
  function statLine(p, rng) {
    var ovr = p.ovr || 60;
    var min = Math.round(clamp(30 + (ovr - 60) * 0.5 + gauss(rng) * 3, 16, 42));   // NBA assignees play big minutes
    var f = min / 32;
    var scoring = (attr(p, 'close') + attr(p, 'mid') + attr(p, 'three') + attr(p, 'layup')) / 4;
    var pts = Math.max(0, Math.round(((ovr - 36) * 0.55 + (scoring - 60) * 0.15) * f + gauss(rng) * 4.5));
    var reb = Math.max(0, Math.round(((attr(p, 'oreb') + attr(p, 'dreb')) / 2 - 30) * 0.13 * f + gauss(rng) * 2));
    var ast = Math.max(0, Math.round((attr(p, 'pass') - 30) * 0.1 * f + gauss(rng) * 1.5));
    var stl = Math.max(0, Math.round((attr(p, 'steal') - 40) * 0.03 * f + gauss(rng) * 0.7));
    var blk = Math.max(0, Math.round((attr(p, 'block') - 40) * 0.03 * f + gauss(rng) * 0.7));
    var tpa = Math.max(0, Math.round((attr(p, 'three') - 40) * 0.1 * f + gauss(rng)));
    var tpm = Math.min(tpa, Math.max(0, Math.round(tpa * (0.25 + attr(p, 'three') / 600))));
    var fta = Math.max(0, Math.round(pts * 0.22 + gauss(rng)));
    var ftm = Math.min(fta, Math.round(fta * (0.55 + attr(p, 'ft') / 400)));
    var fgm = Math.max(tpm, Math.round((pts - ftm - tpm) / 2));
    pts = 2 * fgm + tpm + ftm;
    var fga = Math.max(fgm, Math.round(fgm / clamp(0.4 + (ovr - 60) * 0.004, 0.36, 0.6)));
    var tov = Math.max(0, Math.round(1 + gauss(rng) + ast * 0.2));
    return { min: min, pts: pts, fgm: fgm, fga: fga, tpm: tpm, tpa: tpa, ftm: ftm, fta: fta, reb: reb, ast: ast, stl: stl, blk: blk, tov: tov };
  }

  function addStats(g, id, line) {
    var s = g.stats[id] || (g.stats[id] = { g: 0 });
    s.g++;
    STAT_KEYS.forEach(function (k) { s[k] = (s[k] || 0) + line[k]; });
  }

  function shuffle(a, rng) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // Simulates one week: about three games per club, stat lines for assigned players.
  // Returns { week, games: [{ home, away, hs, as }], lines: [{ id, club, ...line }] }.
  function simWeek(state, rng) {
    rng = rngOf(rng);
    var g = ensure(state);
    g.week++;
    var year = yearOf(state);
    var list = clubs(year).map(function (c) { return c.id; });
    var ps = state.players || {};

    var full = {};
    Object.keys(g.assigned).forEach(function (id) {
      var p = ps[id];
      if (!p || p.retired) { delete g.assigned[id]; return; }
      (full[g.assigned[id]] = full[g.assigned[id]] || []).push(p);
    });

    function strength(club) {
      var s = 0;
      (full[club] || []).forEach(function (p) { s += Math.max(0, (p.ovr || 60) - 62) * 0.35; });
      return Math.min(12, s);
    }

    var out = { week: g.week, games: [], lines: [] };
    for (var round = 0; round < 3; round++) {
      var order = shuffle(list.filter(function (c) {
        var st = g.standings[c] || (g.standings[c] = { w: 0, l: 0, pf: 0, pa: 0 });
        return st.w + st.l < SEASON_GAMES;
      }), rng);
      for (var i = 0; i + 1 < order.length; i += 2) {
        var h = order[i], a = order[i + 1];
        var edge = strength(h) - strength(a) + 2;
        var hs = Math.round(104 + edge / 2 + gauss(rng) * 11);
        var as = Math.round(104 - edge / 2 + gauss(rng) * 11);
        if (hs === as) { if (rng() < 0.5 + edge / 40) hs += 1 + Math.floor(rng() * 6); else as += 1 + Math.floor(rng() * 6); }
        var H = g.standings[h], A = g.standings[a];
        if (hs > as) { H.w++; A.l++; } else { A.w++; H.l++; }
        H.pf += hs; H.pa += as; A.pf += as; A.pa += hs;
        var game = { week: g.week, home: h, away: a, hs: hs, as: as };
        out.games.push(game);
        [h, a].forEach(function (club) {
          (full[club] || []).forEach(function (p) {
            if (injuryOf(state, p)) return;
            var line = statLine(p, rng);
            addStats(g, p.id, line);
            var row = { id: p.id, club: club };
            STAT_KEYS.forEach(function (k) { row[k] = line[k]; });
            out.lines.push(row);
          });
        });
      }
    }
    g.results = g.results.concat(out.games).slice(-200);
    return out;
  }

  // AI front offices use their affiliate on their own: deep-bench young players go down for a few weeks,
  // come back when injuries hit, and two-way players are called up when the team is short. Never the user's team.
  function aiManage(state, rng) {
    rng = rngOf(rng);
    var g = ensure(state), ps = state.players || {};
    var byTeam = {};
    Object.keys(ps).forEach(function (id) {
      var p = ps[id];
      if (p && onNbaTeam(state, p) && p.team !== state.userTeam) (byTeam[p.team] = byTeam[p.team] || []).push(p);
    });
    var moves = 0;
    Object.keys(byTeam).forEach(function (abbr) {
      var list = byTeam[abbr];
      var healthy = healthyNba(state, abbr);
      // call-ups: injuries first, then players who have had their run
      list.filter(function (p) { return g.assigned[p.id]; }).sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0); }).forEach(function (p) {
        if (injuryOf(state, p) || !recallable(state, p.id).ok) return;
        var weeks = g.week - (g.since[p.id] || 0);
        var short = healthy < 10;
        if (isTwoWay(p) ? short : (short || weeks >= 2 + hash(p.id + ':' + g.week) % 4)) {
          if (recall(state, p.id).ok) { healthy++; moves++; }
        }
      });
      // two-way players go back down once the team is healthy again
      list.forEach(function (p) {
        if (isTwoWay(p) && !g.assigned[p.id] && healthy >= 12 && eligible(state, p.id).ok && assign(state, p.id).ok) { healthy--; moves++; }
      });
      // send-downs: young players outside the top 12 who are not playing, now and then
      var nba = list.filter(function (p) { return !g.assigned[p.id]; }).sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0); });
      var downNow = list.filter(function (p) { return g.assigned[p.id] && !isTwoWay(p); }).length;
      nba.slice(12).forEach(function (p) {
        if (downNow >= 2 || healthy <= 11 || isTwoWay(p) || rng() > 0.3) return;
        if ((p.age || 30) > 25 || !eligible(state, p.id).ok) return;
        if (assign(state, p.id).ok) { downNow++; healthy--; moves++; }
      });
    });
    return moves;
  }

  // Plays every full week of D-League games since the last call and counts two-way NBA time.
  // Safe to call after every sim day; it only does work once seven days have passed.
  function sync(state, rng) {
    if (!state || !state.season) return 0;
    var g = ensure(state), s = state.season, day = s.day || 0;
    if (g.simDay > day) g.simDay = day;               // a new engine season started
    reconcile(state);
    accountUsage(state);
    var n = 0, regEnd = day;
    if (s.phase && s.phase !== 'regular' && Array.isArray(s.days)) {
      regEnd = s.days.filter(function (d) { return d && !d.playoff; }).length;   // weeks left over from a long sim
    }
    while (Math.min(day, regEnd) - g.simDay >= 7 && n < 40) {
      var r = rng ? rngOf(rng) : mulberry32(hash(String(state.rngSeed || 1) + ':' + yearOf(state) + ':' + g.week));
      aiManage(state, r);
      simWeek(state, r);
      g.simDay += 7;
      n++;
    }
    if (s.phase && s.phase !== 'regular') {
      g.simDay = day;
      if (!g.seasonOver) {                             // the D-League season is over: AI teams bring everyone back
        g.seasonOver = true;
        Object.keys(g.assigned).forEach(function (id) {
          var p = state.players[id];
          if (p && p.team !== state.userTeam && !isTwoWay(p)) recall(state, id);
        });
      }
    }
    return n;
  }

  function standings(state) {
    var g = ensure(state);
    return Object.keys(g.standings).map(function (id) {
      var s = g.standings[id];
      return { id: id, name: clubName(id, g.year), w: s.w, l: s.l, pct: s.w + s.l ? s.w / (s.w + s.l) : 0 };
    }).sort(function (a, b) { return b.pct - a.pct || b.w - a.w; });
  }

  function playerStats(state, playerId) {
    var g = ensure(state);
    var s = g.stats[playerId];
    if (!s || !s.g) return null;
    var r = { g: s.g };
    STAT_KEYS.forEach(function (k) { r[k] = Math.round(10 * s[k] / s.g) / 10; });
    return r;
  }

  function contractType(p) {
    var c = p && p.contract;
    if (!c) return 'None';
    if (c.twoWay) return 'Two-way';
    if (c.rookie) return 'Rookie scale';
    return 'Standard';
  }

  // Both sides of the 2K-style screen for one NBA team. Rows never include potential.
  function roster(state, abbr) {
    reconcile(state);
    var g = ensure(state), year = yearOf(state), ps = state.players || {};
    var club = clubFor(state, abbr);
    var info = club ? clubs(year).filter(function (c) { return c.id === club; })[0] : null;
    var nba = [], affiliate = [];
    Object.keys(ps).forEach(function (id) {
      var p = ps[id];
      if (!p || p.team !== abbr || !onNbaTeam(state, p)) return;
      var inj = injuryOf(state, p);
      var row = { id: id, name: p.name, pos: p.pos || '', age: p.age || null, ovr: p.ovr || 0, yearsPro: p.yearsPro || 0,
        contract: contractType(p), twoWay: isTwoWay(p), injury: inj ? { type: inj.type || 'Injury', games: inj.games } : null,
        stats: playerStats(state, id), nbaLeft: nbaLeft(state, id) };
      row.gp = row.stats ? row.stats.g : 0;
      if (g.assigned[id] || p.gleague) { row.action = recallable(state, id); affiliate.push(row); }
      else { row.action = eligible(state, id); nba.push(row); }
    });
    var byOvr = function (a, b) { return b.ovr - a.ovr || String(a.name).localeCompare(String(b.name)); };
    nba.sort(byOvr); affiliate.sort(byOvr);
    var std = nba.concat(affiliate).filter(function (r) { return !r.twoWay; }).length;
    var tw = twoWaySlots(state, abbr), st = g.standings[club];
    return {
      nba: nba, affiliate: affiliate, club: club, clubName: club ? clubName(club, year) : null,
      league: leagueName(year), shortName: shortName(year), shared: info ? info.affiliates.filter(function (a) { return a !== abbr; }) : [],
      flexible: !affiliateOf(abbr, year), record: st ? { w: st.w, l: st.l } : null, week: g.week,
      counts: { roster: std, max: 15, active: nba.length, healthy: healthyNba(state, abbr), down: affiliate.length,
        twoWay: tw.used, twoWaySlots: tw.total },
      rule: assignRule(year).text, twoWayRules: twoWayRules(year)
    };
  }

  var GLEAGUE = {
    leagueName: leagueName,
    shortName: shortName,
    clubs: clubs,
    clubName: clubName,
    affiliateOf: affiliateOf,
    clubFor: clubFor,
    twoWayRules: twoWayRules,
    twoWaySlots: twoWaySlots,
    assignRule: assignRule,
    newSeason: newSeason,
    eligible: eligible,
    recallable: recallable,
    assign: assign,
    recall: recall,
    roster: roster,
    sync: sync,
    aiManage: aiManage,
    nbaAvailable: nbaAvailable,
    nbaLeft: nbaLeft,
    recordNba: recordNba,
    usage: usageOf,
    simWeek: simWeek,
    standings: standings,
    playerStats: playerStats,
    statLine: statLine
  };

  if (typeof window !== 'undefined') window.GLEAGUE = GLEAGUE;
  else if (root) root.GLEAGUE = GLEAGUE;
  if (typeof module !== 'undefined' && module.exports) module.exports = GLEAGUE;
})(typeof self !== 'undefined' ? self : this);
