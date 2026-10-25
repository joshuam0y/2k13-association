// 2K13 Association: awards, All-Stars, Finals MVP, Hall of Fame and jersey retirements (window.AWARDS).
// Classic script, plain JS, no libraries. Also module.exports under Node.
// Reads state.season.playerStats (season totals from ENGINE: g, gs, min, pts, fgm, fga, tpm, tpa, ftm, fta,
// oreb, dreb, ast, stl, blk, tov, pf), state.season.standings and state.players.
(function (root) {
  'use strict';

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function r1(x) { return Math.round(x * 10) / 10; }
  function yearOf(state) { return (state && state.season && state.season.year) || (state && state.year) || 2013; }
  function players(state) { return (state && state.players) || {}; }
  function statsMap(state) { return (state && state.season && (state.season.playerStats || state.season.stats)) || {}; }
  function standings(state) { return (state && state.season && state.season.standings) || {}; }
  function coachApi() {
    if (typeof window !== 'undefined' && window.COACH) return window.COACH;
    return root && root.COACH ? root.COACH : null;
  }
  function priorData() {
    if (typeof window !== 'undefined' && window.HISTORY_PRIOR) return window.HISTORY_PRIOR;
    return root && root.HISTORY_PRIOR ? root.HISTORY_PRIOR : null;
  }

  // ---------------------------------------------------------------------------
  // Per-game lines
  // ---------------------------------------------------------------------------
  function perGame(t) {
    var g = t.g || 0;
    if (!g) return null;
    var reb = (t.oreb || 0) + (t.dreb || 0) + (t.reb || 0);
    var gmsc = (t.pts || 0) + 0.4 * (t.fgm || 0) - 0.7 * (t.fga || 0) - 0.4 * ((t.fta || 0) - (t.ftm || 0)) +
      0.7 * (t.oreb || 0) + 0.3 * (t.dreb || 0) + 0.3 * (t.reb || 0) + (t.stl || 0) + 0.7 * (t.ast || 0) +
      0.7 * (t.blk || 0) - 0.4 * (t.pf || 0) - (t.tov || 0);
    return {
      g: g, gs: t.gs || 0, mpg: (t.min || 0) / g, ppg: (t.pts || 0) / g, rpg: reb / g, apg: (t.ast || 0) / g,
      spg: (t.stl || 0) / g, bpg: (t.blk || 0) / g, drpg: ((t.dreb || 0) + 0.7 * (t.reb || 0)) / g,
      fgp: t.fga ? t.fgm / t.fga : 0, gmsc: gmsc / g
    };
  }

  function pct(s) { var g = (s.w || 0) + (s.l || 0); return g ? s.w / g : 0.5; }
  function teamGames(state) {
    var m = 0, st = standings(state);
    Object.keys(st).forEach(function (a) { m = Math.max(m, (st[a].w || 0) + (st[a].l || 0)); });
    return m || 82;
  }
  // Voters rarely back players who missed a lot of time; from 2023-24 the CBA requires 65 games.
  function minGames(state) {
    var G = teamGames(state);
    return Math.floor(yearOf(state) >= 2024 ? G * 65 / 82 : G * 0.7);
  }

  function primaryPos(pos) { return String(pos || 'SF').toUpperCase().split(/[-\/ ,]/)[0]; }
  function posGroup(pos) {
    var p = primaryPos(pos);
    if (p === 'PG' || p === 'SG' || p === 'G') return 'G';
    if (p === 'C') return 'C';
    return 'F';
  }

  function isRookie(p, year) {
    if (!p) return false;
    if (p.yearsPro != null) return p.yearsPro === 0;
    if (p.rookie != null) return !!p.rookie;
    return !!(p.draft && p.draft.year === year - 1);
  }

  function attrAvg(p, keys) {
    var a = p.attrs || {}, s = 0;
    keys.forEach(function (k) { s += typeof a[k] === 'number' ? a[k] : (p.ovr || 60); });
    return s / keys.length;
  }

  // Team defense: points allowed per game against the league average
  function teamDefense(state) {
    var st = standings(state), out = {}, sum = 0, n = 0;
    Object.keys(st).forEach(function (a) {
      var g = (st[a].w || 0) + (st[a].l || 0);
      if (g) { out[a] = st[a].pa / g; sum += out[a]; n++; }
    });
    var avg = n ? sum / n : 100;
    Object.keys(out).forEach(function (a) { out[a] = avg - out[a]; });
    return out;
  }

  // Candidates: one entry per player with season stats
  function candidates(state) {
    var ps = players(state), sm = statsMap(state), st = standings(state);
    var year = yearOf(state), def = teamDefense(state);
    var confSeeds = seeds(state);
    var list = [];
    Object.keys(sm).forEach(function (id) {
      var p = ps[id];
      var line = perGame(sm[id]);
      if (!p || !line) return;
      var team = p.team;
      var s = st[team] || { w: 0, l: 0 };
      var c = {
        id: id, p: p, team: team, line: line, winPct: pct(s), seed: confSeeds[team] || 15,
        group: posGroup(p.pos), rookie: isRookie(p, year), teamDef: def[team] || 0
      };
      // overall value: game score with a nod to scoring volume
      c.value = line.gmsc + 0.25 * line.ppg + 0.2 * line.apg;
      c.rep = clamp(((p.ovr || 75) - 80) * 0.2, -3, 4);   // voters lean on reputation a little
      // defensive value: stocks, defensive boards, ratings and team defense
      c.defense = 3.2 * line.spg + 2.6 * line.bpg + 0.45 * line.drpg + 0.12 * (attrAvg(p, ['perD', 'intD', 'diq']) - 60) +
        0.35 * c.teamDef + 0.06 * line.mpg;
      list.push(c);
    });
    return list;
  }

  function seeds(state) {
    var st = standings(state), ts = state.teams || {}, out = {};
    var by = {};
    Object.keys(st).forEach(function (a) {
      var conf = (ts[a] && ts[a].conf) || confFromSeason(state, a) || 'East';
      (by[conf] = by[conf] || []).push(a);
    });
    Object.keys(by).forEach(function (c) {
      by[c].sort(function (x, y) { return pct(st[y]) - pct(st[x]); });
      by[c].forEach(function (a, i) { out[a] = i + 1; });
    });
    return out;
  }
  function confFromSeason(state, abbr) {
    var t = state.season && state.season.teams;
    if (!t) return null;
    for (var i = 0; i < t.length; i++) if (t[i].abbr === abbr) return t[i].conf;
    return null;
  }

  function sortBy(list, key) { return list.slice().sort(function (a, b) { return b[key] - a[key]; }); }
  function ballot(list, key, n) { return list.slice(0, n || 5).map(function (c) { return { id: c.id, team: c.team, score: r1(c[key]) }; }); }

  // ---------------------------------------------------------------------------
  // Single awards
  // ---------------------------------------------------------------------------
  function mvpScore(c) {
    // winning matters: a top seed adds a lot, a losing record sinks a case
    var seedBonus = c.seed <= 1 ? 4 : c.seed <= 2 ? 3 : c.seed <= 4 ? 1.5 : c.seed <= 8 ? 0 : -4;
    return c.value * (0.75 + 0.5 * c.winPct) + (c.winPct - 0.5) * 18 + seedBonus + 0.5 * c.rep;
  }

  function teamsOf(ranked, count, perTeam, positional) {
    // ranked: candidates best first. Positional: 2 G, 2 F, 1 C per team.
    var used = {}, teams = [];
    for (var t = 0; t < count; t++) {
      var team = [], need = positional ? { G: 2, F: 2, C: 1 } : null;
      ranked.forEach(function (c) {
        if (team.length >= perTeam || used[c.id]) return;
        if (need) { if (!need[c.group]) return; need[c.group]--; }
        team.push(c.id); used[c.id] = 1;
      });
      // not enough at a position: fill with the best left
      ranked.forEach(function (c) { if (team.length < perTeam && !used[c.id]) { team.push(c.id); used[c.id] = 1; } });
      teams.push(team);
    }
    return teams;
  }

  // Puts an award winner on the first team of a selection (MVP on All-NBA, DPOY on All-Defensive, ROY on
  // All-Rookie). If he is missing there, he goes in his position slot (2 G, 2 F, 1 C until 2022-23) and the
  // lowest ranked player at his position (any player when positionless) moves down a team, down to the team
  // he left (or off the last team). Works on ids only, so it also repairs a stored vote. Returns true if changed.
  function placeOnFirstTeam(state, teams, id, positional) {
    if (!id || !Array.isArray(teams) || !teams.length) return false;
    if (teams[0].indexOf(id) >= 0) return false;
    var ps = players(state);
    var groupOf = function (x) { return posGroup(ps[x] && ps[x].pos); };
    var g = groupOf(id), from = -1;
    teams.forEach(function (t, i) { var k = t.indexOf(id); if (k >= 0) { t.splice(k, 1); from = i; } });
    var carry = id;
    for (var t = 0; t < teams.length && carry; t++) {
      var team = teams[t];
      team.unshift(carry);
      if (t === from || team.length <= 5) { carry = null; break; }
      // bump the lowest ranked player at the same position (not the winner himself)
      var k = -1;
      for (var i = team.length - 1; i > 0; i--) { if (!positional || groupOf(team[i]) === g) { k = i; break; } }
      if (k < 0) k = team.length - 1;
      carry = team.splice(k, 1)[0];
    }
    return true;
  }
  function makeConsistent(state, res) {
    if (!res) return false;
    var positional = (res.year || yearOf(state)) < 2024, changed = false;
    if (placeOnFirstTeam(state, res.allNba, res.mvp, positional)) changed = true;
    if (placeOnFirstTeam(state, res.allDefense, res.dpoy, positional)) changed = true;
    if (placeOnFirstTeam(state, res.allRookie, res.roy, false)) changed = true;
    return changed;
  }

  function lastSeasonLine(state, p) {
    var year = yearOf(state);
    var cs = (p.careerStats || []).filter(function (x) { return x.year === year - 1; });
    if (cs.length) {
      var tot = { g: 0, pts: 0, reb: 0, ast: 0 };
      cs.forEach(function (x) {
        var g = x.g || 0;
        var totals = x.min != null && g && x.min / g > 4;
        var reb = x.reb != null ? x.reb : (x.oreb || 0) + (x.dreb || 0);
        tot.g += g;
        tot.pts += totals ? x.pts || 0 : (x.pts || 0) * g;
        tot.reb += totals ? reb : reb * g;
        tot.ast += totals ? x.ast || 0 : (x.ast || 0) * g;
      });
      if (tot.g) return { g: tot.g, ppg: tot.pts / tot.g, rpg: tot.reb / tot.g, apg: tot.ast / tot.g };
    }
    if (year === 2013 && p.stats && p.stats.g) return { g: p.stats.g, ppg: p.stats.pts || 0, rpg: p.stats.reb || 0, apg: p.stats.ast || 0 };
    return null;
  }
  function previousOvr(state, p) {
    var year = yearOf(state);
    if (p.ovrHistory && p.ovrHistory[year - 1] != null) return p.ovrHistory[year - 1];
    if (p.prevOvr != null) return p.prevOvr;
    if (p.startOvr != null) return p.startOvr;
    return null;
  }
  function hasAward(p, name) { return (p.awards || []).some(function (a) { return a.award === name; }); }

  function coachOfYear(state) {
    var st = standings(state), ts = state.teams || {}, C = coachApi();
    var prevSt = null;
    var seasons = state.history && state.history.seasons;
    if (seasons && seasons.length) {
      var last = seasons[seasons.length - 1];
      if (last && last.standings) prevSt = last.standings;
    }
    var list = Object.keys(st).map(function (a) {
      var w = pct(st[a]);
      var exp = C && C.expectedPct ? C.expectedPct(state, a) : 0.5;
      var prev = prevSt && prevSt[a] ? pct(prevSt[a]) : w;
      var coach = ts[a] && ts[a].coach ? ts[a].coach : (C && C.of && C.of(state, a) ? C.of(state, a).id : null);
      return { team: a, coach: coach, score: (w - exp) * 100 + (w - prev) * 40 + w * 25 };
    }).sort(function (x, y) { return y.score - x.score; });
    return { winner: list[0] ? { coach: list[0].coach, team: list[0].team } : null, ballot: list.slice(0, 5) };
  }

  // Full set of end-of-season awards. Returns ids.
  function season(state) {
    var prev = locked(state);
    if (prev) return prev;
    var year = yearOf(state), G = teamGames(state), minG = minGames(state);
    var all = candidates(state);
    var eligible = all.filter(function (c) { return c.line.g >= minG && c.line.mpg >= 20; });
    if (eligible.length < 15) eligible = sortBy(all, 'value').slice(0, Math.max(15, eligible.length));

    eligible.forEach(function (c) { c.mvp = mvpScore(c); c.nba = c.value * (0.9 + 0.3 * c.winPct) + 0.1 * c.line.ppg + c.rep; });
    var mvpList = sortBy(eligible, 'mvp');

    var defList = sortBy(eligible.filter(function (c) { return c.line.mpg >= 24; }), 'defense');
    if (!defList.length) defList = sortBy(eligible, 'defense');

    var rookies = all.filter(function (c) { return c.rookie && c.line.g >= Math.floor(G * 0.45); });
    rookies.forEach(function (c) { c.roy = c.value * Math.sqrt(clamp(c.line.g / (G * 0.85), 0, 1)) + 0.1 * c.line.mpg; });
    var royList = sortBy(rookies, 'roy');

    var benchMinG = year >= 2024 ? minG : Math.floor(G * 0.6);
    var bench = all.filter(function (c) { return c.line.g >= benchMinG && c.line.gs * 2 < c.line.g && c.line.mpg >= 15; });
    bench.forEach(function (c) { c.smoy = c.value + 0.15 * c.line.ppg + 2 * c.winPct; });
    var smoyList = sortBy(bench, 'smoy');

    var mipPool = all.filter(function (c) { return !c.rookie && c.line.g >= Math.floor(G * 0.6) && !hasAward(c.p, 'MIP'); });
    mipPool.forEach(function (c) {
      var prev = lastSeasonLine(state, c.p);
      var po = previousOvr(state, c.p);
      var jump = 0;
      if (prev && prev.g >= 10) jump += (c.line.ppg - prev.ppg) + 0.5 * (c.line.rpg - prev.rpg) + 0.7 * (c.line.apg - prev.apg);
      else if (prev) jump += 0.5 * (c.line.ppg - prev.ppg);
      if (po != null) jump += 0.9 * ((c.p.ovr || 0) - po);
      if (prev && prev.ppg > 22) jump -= 3;     // established stars rarely win it
      c.mip = jump + 0.05 * c.line.ppg;
      c.mipKnown = !!prev || po != null;
    });
    var mipList = sortBy(mipPool.filter(function (c) { return c.mipKnown; }), 'mip');

    var positional = year < 2024;
    var nbaRanked = sortBy(eligible, 'nba');
    var allNba = teamsOf(nbaRanked, 3, 5, positional);
    var allDefense = teamsOf(defList, 2, 5, positional);
    var allRookie = teamsOf(royList, 2, 5, false);

    // Clutch Player of the Year (Jerry West Trophy), from 2022-23: closers on winning teams
    var clutchList = [];
    if (year >= 2023) {
      eligible.forEach(function (c) {
        c.clutch = c.value * (0.7 + 0.6 * c.winPct) + 0.3 * c.line.ppg + 0.08 * (attrAvg(c.p, ['oiq', 'mid', 'ft', 'handle']) - 70) +
          (c.seed <= 6 ? 2 : -2);
      });
      clutchList = sortBy(eligible.filter(function (c) { return c.line.mpg >= 28; }), 'clutch');
    }

    var coy = coachOfYear(state);
    var res = {
      year: year,
      mvp: mvpList[0] ? mvpList[0].id : null,
      dpoy: defList[0] ? defList[0].id : null,
      roy: royList[0] ? royList[0].id : null,
      smoy: smoyList[0] ? smoyList[0].id : null,
      mip: mipList[0] ? mipList[0].id : null,
      coy: coy.winner,
      allNba: allNba,
      allDefense: allDefense,
      allRookie: allRookie,
      ballots: {
        mvp: ballot(mvpList, 'mvp', 10), dpoy: ballot(defList, 'defense', 5), roy: ballot(royList, 'roy', 5),
        smoy: ballot(smoyList, 'smoy', 5), mip: ballot(mipList, 'mip', 5), coy: coy.ballot
      }
    };
    if (year >= 2023) {
      res.clutch = clutchList[0] ? clutchList[0].id : null;
      res.ballots.clutch = ballot(clutchList, 'clutch', 5);
    }
    res.ballots.rules = { minGames: minG, teamGames: G, positionless: !positional, clutch: year >= 2023 };
    makeConsistent(state, res);
    votes(res);
    // Ballots are due when the regular season ends: from then on every call returns the same result
    if (lockable(state)) state.season.awardVote = JSON.parse(JSON.stringify(res));
    return res;
  }
  function lockable(state) { return !!(state && state.season && state.season.phase && state.season.phase !== 'regular'); }
  function locked(state) {
    var v = lockable(state) && state.season.awardVote;
    if (!v || v.year !== yearOf(state)) return null;
    // votes stored before the first team rule: repair them once (and redo the team point totals)
    if (makeConsistent(state, v) && v.ballots) { delete v.ballots.teamVotes; votes(v); }
    return JSON.parse(JSON.stringify(v));
  }

  // ---------------------------------------------------------------------------
  // Media voting: points and first place votes for every finalist, simulated from the candidate scores
  // with a seeded random number generator (the same season always gets the same totals).
  // ---------------------------------------------------------------------------
  function seeded(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    var a = h >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gauss(rng) { var u = rng() || 1e-9, v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  // The real panels: about 120 to 130 media members until 2016, 100 since (plus the fan vote 2017 to 2021).
  function voterCount(year) { return year <= 2013 ? 121 : year <= 2014 ? 125 : year <= 2016 ? 130 : year <= 2021 ? 101 : 100; }
  // All-Defensive and All-Rookie teams were picked by the 30 head coaches until 2013-14
  function teamVoterCount(key, year) { return key !== 'allNba' && year <= 2014 ? 29 : voterCount(year); }
  var PLACES = { mvp: [10, 7, 5, 3, 1], dpoy: [5, 3, 1], roy: [5, 3, 1], smoy: [5, 3, 1], mip: [5, 3, 1], coy: [5, 3, 1], clutch: [5, 3, 1] };
  var TIER_POINTS = { allNba: [5, 3, 1], allDefense: [2, 1], allRookie: [2, 1] };

  function voteSingle(list, places, voters, rng) {
    var n = list.length;
    if (!n) return;
    var scores = list.map(function (b, i) { return typeof b.score === 'number' ? b.score : -i; });
    var spread = Math.max(0.5, scores[0] - scores[Math.min(n, 5) - 1]);
    var sd = 0.15 * spread + 0.3;
    var tally = list.map(function () { return { pts: 0, first: 0, places: places.map(function () { return 0; }) }; });
    for (var v = 0; v < voters; v++) {
      var order = scores.map(function (s, i) { return { i: i, s: s + gauss(rng) * sd }; }).sort(function (a, b) { return b.s - a.s; });
      for (var k = 0; k < places.length && k < n; k++) {
        var t = tally[order[k].i];
        t.pts += places[k]; t.places[k]++;
        if (k === 0) t.first++;
      }
    }
    // the official order stands: the best tallies go to the best scores, so the winner has the most points
    tally.sort(function (a, b) { return b.pts - a.pts || b.first - a.first; });
    list.forEach(function (b, i) { b.pts = tally[i].pts; b.first = tally[i].first; b.places = tally[i].places; b.voters = voters; b.maxPts = voters * places[0]; });
  }
  function voteTeams(teams, tierPts, voters, rng) {
    var flat = [];
    teams.forEach(function (t, ti) { t.forEach(function (id, k) { flat.push({ id: id, tier: ti, r: ti * 5 + k }); }); });
    if (!flat.length) return [];
    var tally = flat.map(function () { return { pts: 0, first: 0 }; });
    for (var v = 0; v < voters; v++) {
      var order = flat.map(function (x, i) { return { i: i, s: -x.r + gauss(rng) * 2.2 }; }).sort(function (a, b) { return b.s - a.s; });
      order.forEach(function (o, pos) {
        var tier = Math.floor(pos / 5);
        if (tier < tierPts.length) { tally[o.i].pts += tierPts[tier]; if (tier === 0) tally[o.i].first++; }
      });
    }
    tally.sort(function (a, b) { return b.pts - a.pts || b.first - a.first; });
    var out = teams.map(function () { return []; });
    flat.forEach(function (x, i) { out[x.tier].push({ id: x.id, pts: tally[i].pts, first: tally[i].first }); });
    return out;
  }
  // Adds points and first place votes to res.ballots (and res.ballots.teamVotes for the team selections).
  // Works on a stored season result too, so seasons saved before voting existed get totals once.
  function votes(res) {
    if (!res) return res;
    var y = res.year || 2013, b = res.ballots = res.ballots || {};
    Object.keys(PLACES).forEach(function (k) {
      if (!Array.isArray(b[k]) || !b[k].length || b[k][0].pts != null) return;
      voteSingle(b[k], PLACES[k], voterCount(y), seeded(y + ':' + k + ':' + b[k].map(function (x) { return x.id || x.team; }).join(',')));
    });
    if (!b.teamVotes) {
      b.teamVotes = {};
      Object.keys(TIER_POINTS).forEach(function (k) {
        if (!Array.isArray(res[k])) return;
        var n = teamVoterCount(k, y);
        b.teamVotes[k] = { voters: n, maxPts: n * TIER_POINTS[k][0],
          teams: voteTeams(res[k], TIER_POINTS[k], n, seeded(y + ':' + k + ':' + [].concat.apply([], res[k]).join(','))) };
      });
    }
    return res;
  }

  // Writes awards onto players (player.awards) and coaches (coach.awards). Returns the same result.
  function record(state, res) {
    if (!res) return res;
    var ps = players(state), y = res.year;
    function give(id, award) { var p = ps[id]; if (!p) return; (p.awards = p.awards || []).push({ year: y, award: award }); }
    if (res.mvp) give(res.mvp, 'MVP');
    if (res.dpoy) give(res.dpoy, 'DPOY');
    if (res.roy) give(res.roy, 'ROY');
    if (res.smoy) give(res.smoy, '6MOY');
    if (res.mip) give(res.mip, 'MIP');
    if (res.clutch) give(res.clutch, 'Clutch Player of the Year');
    var nth = ['1st', '2nd', '3rd'];
    (res.allNba || []).forEach(function (t, i) { t.forEach(function (id) { give(id, 'All-NBA ' + nth[i] + ' Team'); }); });
    (res.allDefense || []).forEach(function (t, i) { t.forEach(function (id) { give(id, 'All-Defensive ' + nth[i] + ' Team'); }); });
    (res.allRookie || []).forEach(function (t, i) { t.forEach(function (id) { give(id, 'All-Rookie ' + nth[i] + ' Team'); }); });
    if (res.coy && res.coy.coach && state.coaches && state.coaches[res.coy.coach]) {
      var c = state.coaches[res.coy.coach];
      (c.awards = c.awards || []).push({ year: y, award: 'COY', team: res.coy.team });
    }
    if (res.finalsMvp) give(res.finalsMvp, 'Finals MVP');
    return res;
  }

  // ---------------------------------------------------------------------------
  // All-Stars (at the break)
  // ---------------------------------------------------------------------------
  function allStarFormat(year) {
    if (year >= 2025) return 'Four-team tournament';
    if (year >= 2018 && year <= 2023) return 'Captains draft';
    return 'East vs West';
  }

  function allStars(state) {
    var year = yearOf(state);
    var played = teamGames(state);
    var inj = (state.season && state.season.injuries) || {};
    var ts = state.teams || {};
    var all = candidates(state).filter(function (c) {
      return c.line.g >= Math.max(1, Math.floor(played * 0.5)) && !(inj[c.id] && inj[c.id].games > 14);
    });
    all.forEach(function (c) {
      c.fan = c.value + 0.35 * c.line.ppg + 0.3 * ((c.p.ovr || 70) - 75);
      c.coachVote = c.value * (0.8 + 0.5 * c.winPct) + 0.1 * c.line.ppg;
    });
    var out = { year: year, format: allStarFormat(year), East: null, West: null };
    ['East', 'West'].forEach(function (conf) {
      var pool = all.filter(function (c) { return ((ts[c.team] && ts[c.team].conf) || confFromSeason(state, c.team)) === conf; });
      var used = {}, starters = [], reserves = [];
      var byFan = sortBy(pool, 'fan'), byCoach = sortBy(pool, 'coachVote');
      function take(list, dest, n, ok) {
        list.forEach(function (c) { if (n > 0 && !used[c.id] && ok(c)) { dest.push(c.id); used[c.id] = 1; n--; } });
      }
      take(byFan, starters, 2, function (c) { return c.group === 'G'; });
      take(byFan, starters, 3, function (c) { return c.group !== 'G'; });
      take(byFan, starters, 5 - starters.length, function () { return true; });
      take(byCoach, reserves, 2, function (c) { return c.group === 'G'; });
      take(byCoach, reserves, 3, function (c) { return c.group !== 'G'; });
      take(byCoach, reserves, 7 - reserves.length, function () { return true; });
      out[conf] = { starters: starters, reserves: reserves };
    });
    return out;
  }

  function recordAllStars(state, res) {
    var ps = players(state);
    ['East', 'West'].forEach(function (c) {
      if (!res || !res[c]) return;
      res[c].starters.concat(res[c].reserves).forEach(function (id) {
        if (ps[id]) (ps[id].awards = ps[id].awards || []).push({ year: res.year, award: 'All-Star' });
      });
    });
    return res;
  }

  // ---------------------------------------------------------------------------
  // Finals MVP from the Finals box scores (ENGINE.simGame results)
  // ---------------------------------------------------------------------------
  function finalsMvp(state, boxes, champion) {
    boxes = (boxes || []).filter(Boolean);
    if (!champion && state && state.season && state.season.playoffs) champion = state.season.playoffs.champion;
    if (!champion) {
      var wins = {};
      boxes.forEach(function (b) { if (b.winner) wins[b.winner] = (wins[b.winner] || 0) + 1; });
      Object.keys(wins).forEach(function (a) { if (!champion || wins[a] > wins[champion]) champion = a; });
    }
    if (!champion) return null;
    var tot = {}, ps = players(state);
    boxes.forEach(function (b) {
      var side = b.home && b.home.abbr === champion ? b.home : (b.away && b.away.abbr === champion ? b.away : null);
      if (!side) return;
      side.box.forEach(function (row) {
        var t = tot[row.id] || (tot[row.id] = { g: 0, pts: 0, reb: 0, ast: 0, v: 0, name: row.name });
        t.g++; t.pts += row.pts; t.reb += (row.oreb || 0) + (row.dreb || 0); t.ast += row.ast;
        t.v += row.pts + 1.1 * ((row.oreb || 0) + (row.dreb || 0)) + 1.4 * row.ast + 1.8 * ((row.stl || 0) + (row.blk || 0)) -
          (row.tov || 0) + 0.4 * (row.fgm || 0) - 0.3 * (row.fga || 0);
      });
    });
    var best = null;
    Object.keys(tot).forEach(function (id) { if (!best || tot[id].v > tot[best].v) best = id; });
    if (!best) return null;
    var t = tot[best];
    return { id: best, name: (ps[best] && ps[best].name) || t.name || best, team: champion, g: t.g,
      ppg: r1(t.pts / t.g), rpg: r1(t.reb / t.g), apg: r1(t.ast / t.g) };
  }

  // ---------------------------------------------------------------------------
  // Hall of Fame and jersey retirements
  // ---------------------------------------------------------------------------
  function careerTotals(p) {
    var t = { g: 0, pts: 0, reb: 0, ast: 0, seasons: 0, byTeam: {} };
    (p.careerStats || []).forEach(function (x) {
      var g = x.g || 0;
      if (!g) return;
      var totals = x.min != null && x.min / g > 4;
      var reb = x.reb != null ? x.reb : (x.oreb || 0) + (x.dreb || 0);
      var pts = totals ? (x.pts || 0) : (x.pts || 0) * g;
      var rb = totals ? reb : reb * g;
      var as = totals ? (x.ast || 0) : (x.ast || 0) * g;
      t.g += g; t.pts += pts; t.reb += rb; t.ast += as; t.seasons++;
      var bt = t.byTeam[x.team] || (t.byTeam[x.team] = { seasons: 0, years: [], g: 0, pts: 0, reb: 0, ast: 0 });
      if (bt.years.indexOf(x.year) < 0) { bt.years.push(x.year); bt.seasons++; }
      bt.g += g; bt.pts += pts; bt.reb += rb; bt.ast += as;
    });
    return t;
  }

  var AWARD_POINTS = {
    'MVP': 16, 'Finals MVP': 8, 'Champion': 3, 'DPOY': 5, 'ROY': 2, '6MOY': 1.5, 'MIP': 1, 'All-Star': 2.5,
    'All-NBA 1st Team': 6, 'All-NBA 2nd Team': 4, 'All-NBA 3rd Team': 2.5,
    'All-Defensive 1st Team': 1.5, 'All-Defensive 2nd Team': 1
  };
  function awardPoints(list) {
    var s = 0;
    (list || []).forEach(function (a) { s += AWARD_POINTS[a.award] || 0; });
    return s;
  }
  function hofScore(p) {
    var t = careerTotals(p);
    return t.pts / 1000 * 2.2 + t.reb / 1000 * 1.1 + t.ast / 1000 * 1.6 + awardPoints(p.awards);
  }
  function retiredYear(p) {
    if (p.retiredYear) return p.retiredYear;
    var last = 0;
    (p.careerStats || []).forEach(function (x) { last = Math.max(last, x.year || 0); });
    return last || null;
  }

  // Inducts retired players with great careers, four full seasons after they retire.
  function hallOfFame(state, year) {
    year = year || yearOf(state);
    var ps = players(state), inducted = [];
    Object.keys(ps).forEach(function (id) {
      var p = ps[id];
      if (!p || !p.retired || p.hof) return;
      var ry = retiredYear(p);
      if (!ry || year - ry < 4) return;
      var s = hofScore(p);
      if (s >= 55) { p.hof = true; p.hofYear = year; inducted.push({ id: id, name: p.name, score: r1(s) }); }
    });
    if (state.history) {
      state.history.hallOfFame = state.history.hallOfFame || [];
      inducted.forEach(function (x) { state.history.hallOfFame.push({ year: year, id: x.id, name: x.name }); });
    }
    return inducted;
  }

  function retiredNumbers(state) {
    state.history = state.history || {};
    if (!state.history.retiredJerseys) {
      var seed = {}, prior = priorData();
      var src = (state.history.prior && state.history.prior.retiredNumbers) || (prior && prior.retiredNumbers) || {};
      Object.keys(src).forEach(function (a) {
        seed[a] = src[a].map(function (x) { return { number: x.number, name: x.name, id: null, year: x.year || null }; });
      });
      state.history.retiredJerseys = seed;
    }
    return state.history.retiredJerseys;
  }

  // Teams retire the numbers of franchise greats once they retire. Returns [{ team, id, name, number }].
  function retireJerseys(state, year) {
    year = year || yearOf(state);
    var ps = players(state), out = [], book = retiredNumbers(state);
    Object.keys(ps).forEach(function (id) {
      var p = ps[id];
      if (!p || !p.retired || p.jerseysChecked) return;
      var ry = retiredYear(p);
      if (ry && year - ry < 1) return;
      p.jerseysChecked = true;
      var t = careerTotals(p), career = hofScore(p);
      Object.keys(t.byTeam).forEach(function (abbr) {
        var bt = t.byTeam[abbr];
        var teamAwards = (p.awards || []).filter(function (a) { return bt.years.indexOf(a.year) >= 0; });
        var score = bt.pts / 1000 * 2.2 + bt.reb / 1000 * 1.1 + bt.ast / 1000 * 1.6 + awardPoints(teamAwards);
        var ok = (bt.seasons >= 6 && score >= 34) || (bt.seasons >= 4 && career >= 55 && score >= 30);
        if (!ok) return;
        var number = p.jersey != null ? p.jersey : (p.number != null ? p.number : null);
        var list = book[abbr] || (book[abbr] = []);
        if (number != null && list.some(function (x) { return String(x.number) === String(number); })) return;
        list.push({ number: number, name: p.name, id: id, year: year });
        (p.jerseysRetired = p.jerseysRetired || []).push(abbr);
        out.push({ team: abbr, id: id, name: p.name, number: number });
      });
    });
    return out;
  }

  var AWARDS = {
    season: season,
    record: record,
    allStars: allStars,
    recordAllStars: recordAllStars,
    allStarFormat: allStarFormat,
    finalsMvp: finalsMvp,
    hallOfFame: hallOfFame,
    hofScore: hofScore,
    retireJerseys: retireJerseys,
    retiredNumbers: retiredNumbers,
    perGame: perGame,
    minGames: minGames,
    votes: votes,
    voterCount: voterCount
  };

  if (typeof window !== 'undefined') window.AWARDS = AWARDS;
  else if (root) root.AWARDS = AWARDS;
  if (typeof module !== 'undefined' && module.exports) module.exports = AWARDS;
})(typeof self !== 'undefined' ? self : this);
