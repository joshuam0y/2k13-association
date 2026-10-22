// 2K13 Association: D-League / G League and two-way contracts (window.GLEAGUE).
// Classic script, plain JS, no libraries. Also module.exports under Node.
// Club and affiliation data: data/gleague.js (window.GLEAGUE_DATA).
// State kept in state.gleague = { year, week, assigned: { [playerId]: clubId }, standings: { [clubId]: { w, l, pf, pa } },
//   stats: { [playerId]: totals }, usage: { [playerId]: { days, games } }, results: [ ... ] }.
// An assigned player also has player.gleague = true (contract-v2).
(function (root) {
  'use strict';

  var SEASON_GAMES = 50;
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

  function newSeason(state) {
    var year = yearOf(state);
    var g = { year: year, week: 0, assigned: {}, standings: {}, stats: {}, usage: {}, results: [], manualUsage: false };
    clubs(year).forEach(function (c) { g.standings[c.id] = { w: 0, l: 0, pf: 0, pa: 0 }; });
    // players already flagged as assigned keep their spot
    var ps = state.players || {};
    Object.keys(ps).forEach(function (id) {
      var p = ps[id];
      if (p && p.gleague && !p.retired && state.teams && state.teams[p.team]) g.assigned[id] = clubFor(state, p.team);
    });
    state.gleague = g;
    return g;
  }

  function ensure(state) {
    if (!state.gleague || state.gleague.year !== yearOf(state)) newSeason(state);
    return state.gleague;
  }

  function txn(state, text, ids) {
    if (!state.transactions) return;
    state.transactions.push({ year: yearOf(state), day: state.day || 0, type: 'assign', text: text, ids: ids || [] });
  }
  function isTwoWay(p) { return !!(p && p.contract && p.contract.twoWay); }

  // Sends a player to his team's affiliate. Players with three or more years of service need opts.consent.
  function assign(state, playerId, opts) {
    opts = opts || {};
    var g = ensure(state);
    var p = state.players && state.players[playerId];
    if (!p) return { ok: false, reason: 'Unknown player.' };
    if (p.retired) return { ok: false, reason: p.name + ' is retired.' };
    if (!state.teams || !state.teams[p.team]) return { ok: false, reason: p.name + ' is not on an NBA roster.' };
    if (p.stashedUntil && p.stashedUntil > yearOf(state)) return { ok: false, reason: p.name + ' is playing overseas.' };
    if (g.assigned[playerId]) return { ok: false, reason: p.name + ' is already in the ' + leagueName(yearOf(state)) + '.' };
    if (!isTwoWay(p) && (p.yearsPro || 0) >= 3 && !opts.consent) {
      return { ok: false, reason: p.name + ' has three or more years of service and must agree to the assignment.' };
    }
    var club = clubFor(state, p.team);
    if (!club) return { ok: false, reason: 'No club available.' };
    g.assigned[playerId] = club;
    p.gleague = true;
    txn(state, 'The ' + p.team + ' assigned ' + p.name + ' to the ' + clubName(club, yearOf(state)) + '.', [playerId]);
    return { ok: true, club: club, clubName: clubName(club, yearOf(state)) };
  }

  function recall(state, playerId) {
    var g = ensure(state);
    var p = state.players && state.players[playerId];
    if (!p) return { ok: false, reason: 'Unknown player.' };
    if (!g.assigned[playerId] && !p.gleague) return { ok: false, reason: p.name + ' is not on assignment.' };
    if (isTwoWay(p) && !canUseNba(state, playerId)) {
      return { ok: false, reason: p.name + ' has used all of his NBA time on a two-way contract.' };
    }
    var club = g.assigned[playerId];
    delete g.assigned[playerId];
    p.gleague = false;
    txn(state, 'The ' + p.team + ' recalled ' + p.name + (club ? ' from the ' + clubName(club, yearOf(state)) : '') + '.', [playerId]);
    return { ok: true };
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

  // Can this player suit up for his NBA team right now?
  function nbaAvailable(state, playerId) {
    var p = state.players && state.players[playerId];
    if (!p || p.retired) return false;
    if (p.gleague || (state.gleague && state.gleague.assigned[playerId])) return false;
    return canUseNba(state, playerId);
  }

  // The orchestrator calls this when a two-way player spends NBA days or plays NBA games.
  // Once it is used, simWeek stops estimating NBA time on its own.
  function recordNba(state, playerId, amount) {
    var g = ensure(state);
    g.manualUsage = true;
    var u = usageOf(state, playerId);
    u.days += (amount && amount.days) || 0;
    u.games += (amount && amount.games) || 0;
    var p = state.players[playerId];
    if (isTwoWay(p) && !canUseNba(state, playerId) && !g.assigned[playerId] && state.teams && state.teams[p.team]) {
      g.assigned[playerId] = clubFor(state, p.team);
      p.gleague = true;
    }
    return u;
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
    var min = Math.round(clamp(26 + (ovr - 62) * 0.7 + gauss(rng) * 3, 14, 42));
    var f = min / 32;
    var scoring = (attr(p, 'close') + attr(p, 'mid') + attr(p, 'three') + attr(p, 'layup')) / 4;
    var pts = Math.max(0, Math.round(((ovr - 42) * 0.45 + (scoring - 60) * 0.15) * f + gauss(rng) * 4.5));
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

  // Simulates one week: about three games per club, stat lines for assigned and two-way players.
  // Returns { week, games: [{ home, away, hs, as }], lines: [{ id, club, ...line }] }.
  function simWeek(state, rng) {
    rng = rngOf(rng);
    var g = ensure(state);
    g.week++;
    var year = yearOf(state);
    var rules = twoWayRules(year);
    var list = clubs(year).map(function (c) { return c.id; });
    var ps = state.players || {};

    // rosters for the week: assigned players, plus two-way players splitting time
    var full = {}, split = {};
    Object.keys(g.assigned).forEach(function (id) {
      var p = ps[id];
      if (!p || p.retired) { delete g.assigned[id]; return; }
      (full[g.assigned[id]] = full[g.assigned[id]] || []).push(p);
    });
    if (rules.allowed) {
      Object.keys(ps).forEach(function (id) {
        var p = ps[id];
        if (!isTwoWay(p) || p.retired || g.assigned[id] || !state.teams || !state.teams[p.team]) return;
        var club = clubFor(state, p.team);
        if (!club) return;
        (split[club] = split[club] || []).push(p);
        if (!g.manualUsage) {
          var u = usageOf(state, id);
          if (rules.limitType === 'days') u.days += 3; else u.games += 2;   // about half the NBA week
          if (!canUseNba(state, id)) { g.assigned[id] = club; p.gleague = true; }
        }
      });
    }

    function strength(club) {
      var s = 0;
      (full[club] || []).concat(split[club] || []).forEach(function (p) { s += Math.max(0, (p.ovr || 60) - 62) * 0.35; });
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
          var players = (full[club] || []).slice();
          (split[club] || []).forEach(function (p) { if ((round + hash(p.id)) % 2 === 0) players.push(p); });
          players.forEach(function (p) {
            if (state.season && state.season.injuries && state.season.injuries[p.id]) return;
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

  var GLEAGUE = {
    leagueName: leagueName,
    clubs: clubs,
    clubName: clubName,
    affiliateOf: affiliateOf,
    clubFor: clubFor,
    twoWayRules: twoWayRules,
    twoWaySlots: twoWaySlots,
    newSeason: newSeason,
    assign: assign,
    recall: recall,
    nbaAvailable: nbaAvailable,
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
