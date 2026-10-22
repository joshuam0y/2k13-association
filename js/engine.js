// 2K13 Association: simulation engine.
// Classic script: attaches window.ENGINE (and module.exports under Node).
// Plain JavaScript, no libraries. The season object is plain JSON so it can be saved.
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  var ATTR_KEYS = ['close', 'mid', 'three', 'ft', 'layup', 'dunk', 'post', 'handle', 'pass', 'oreb', 'dreb',
    'steal', 'block', 'perD', 'intD', 'speed', 'vert', 'strength', 'stamina', 'durability', 'oiq', 'diq'];
  var STAT_KEYS = ['min', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf'];
  var SHOT_TYPES = ['close', 'post', 'mid', 'three'];
  var DAY_MS = 86400000;
  var KEEP_PBP = 20;            // play-by-play kept for the most recent 20 games
  var KEEP_FULL = 120;          // full box scores kept for the most recent 120 games (and all user team games)
  var REG_SECONDS = 2880;
  var STARTER_MIN = [36, 34, 32, 30, 30];
  var BENCH_MIN5 = [22, 18, 16, 12, 10];
  var BENCH_MIN4 = [24, 22, 18, 14];

  // Tuning knobs (calibrated against 2012-13 league averages by tools/engine-test.js).
  // Rating effects are in z-scores against league norms, so the engine stays calibrated
  // whatever spread the ratings data uses.
  var T = {
    playMean: 14.2,           // seconds for the first play of a possession
    secondMean: 7.5,          // seconds for a play after an offensive rebound or a non-bonus foul
    typeBase: { close: 0.38, post: 0.08, mid: 0.35, three: 0.155 },
    typeK: { close: 0.9, post: 1.1, mid: 0.8, three: 1.5 },
    makeBase: { close: 0.545, post: 0.41, mid: 0.358, three: 0.36 },
    makeOff: { close: 0.018, post: 0.015, mid: 0.013, three: 0.013 },
    makeDef: { close: 0.009, post: 0.009, mid: 0.0056, three: 0.0056 },
    makeOvr: 0.0028,           // per (softened) z of shooter overall vs his defender
    teamEdge: 0.0010,         // per point of lineup average overall vs the opponent lineup
    formSd: 0.015,             // per-game shooting form of a team (hot and cold nights)
    soft: 0.7,                // regression of elite shot-making toward the mean (diminishing returns)
    starDrain: 0.2,           // extra fatigue per unit of usage above average
    rubber: 0.0014,           // leading teams ease off and trailing teams push (per point of lead, capped at 20)
    stratPace: 0.068,         // first-play length change per unit of pace slider (both teams add up, capped)
    stratThree: 0.31,         // log change of three-point weight per unit of the three slider (about +-25% of 3PA)
    stratCrash: 0.035,        // offensive rebound chance per unit of the crash slider
    stratTrans: 0.03,         // opponent make bonus on the next play after a defensive rebound, per unit of crash
    minorK: 0.3,              // scale of the secondary team rating effects (turnovers, rebounding, blocks)
    usageK: 0.34,
    foulShot: { close: 0.22, post: 0.165, mid: 0.048, three: 0.014 },
    andOneFactor: 0.62,
    blockGivenMiss: { close: 0.256, post: 0.176, mid: 0.062, three: 0.029 },
    astChance: { close: 0.57, post: 0.37, mid: 0.65, three: 0.85 },
    toBase: 0.134,
    stealShare: 0.535,
    offFoulShare: 0.10,
    nonShootFoul: 0.066,
    orebBase: 0.264,
    teamReb: 0.12,
    putback: 0.33,
    ftBase: 0.753,
    ftK: 0.085,
    homeMake: 0.009,
    fatigueZ: 2.2,            // z lost per unit of energy below 1
    rebK: 0.42,
    astK: 0.55,
    stlK: 0.55,
    blkK: 0.8
  };

  var INJURIES = [
    // [type, weight, minGames, maxGames]  (999 = out for the season)
    ['Sprained ankle', 24, 2, 8],
    ['Bruised knee', 11, 1, 4],
    ['Back spasms', 9, 1, 5],
    ['Hamstring strain', 9, 3, 12],
    ['Groin strain', 7, 3, 10],
    ['Calf strain', 6, 3, 10],
    ['Concussion', 5, 1, 7],
    ['Sprained knee', 6, 6, 20],
    ['Plantar fasciitis', 4, 5, 15],
    ['Sprained wrist', 4, 2, 6],
    ['Bruised thigh', 4, 1, 4],
    ['Sore Achilles', 3, 2, 8],
    ['Broken hand', 3, 15, 30],
    ['Broken foot', 2, 25, 50],
    ['Torn meniscus', 2, 15, 40],
    ['Torn ACL', 1, 999, 999],
    ['Torn Achilles', 0.5, 999, 999]
  ];

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  function mulberry32(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function parseDate(s) { var p = String(s).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function fmtDate(t) { var d = new Date(t); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
  function addDays(s, n) { return fmtDate(parseDate(s) + n * DAY_MS); }
  function weekday(s) { return new Date(parseDate(s)).getUTCDay(); }
  function pickWeighted(items, weights, rng) {
    var sum = 0, i;
    for (i = 0; i < weights.length; i++) sum += weights[i];
    if (sum <= 0) return items[Math.floor(rng() * items.length)];
    var r = rng() * sum;
    for (i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
  function randInt(lo, hi, rng) { return lo + Math.floor(rng() * (hi - lo + 1)); }
  function emptyLine() { var o = { g: 0, gs: 0 }; STAT_KEYS.forEach(function (k) { o[k] = 0; }); return o; }
  function round1(x) { return Math.round(x * 10) / 10; }
  function globalLeague() {
    if (typeof window !== 'undefined' && window.LEAGUE_2012) return window.LEAGUE_2012;
    if (typeof global !== 'undefined' && global.LEAGUE_2012) return global.LEAGUE_2012;
    return null;
  }

  // ---------------------------------------------------------------------------
  // Positions
  // ---------------------------------------------------------------------------
  function primaryPos(pos) { return String(pos || 'SF').toUpperCase().split(/[-\/ ,]/)[0]; }
  function posGroup(pos) {
    var p = primaryPos(pos);
    if (p === 'PG' || p === 'SG' || p === 'G') return 'G';
    if (p === 'PF' || p === 'C' || p === 'FC') return 'B';
    return 'W';
  }
  var POS_RANK = { PG: 1, G: 1.5, SG: 2, GF: 2.5, SF: 3, F: 3.5, PF: 4, FC: 4.5, C: 5 };
  function posRank(pos) { var r = POS_RANK[primaryPos(pos)]; return r == null ? 3 : r; }

  // ---------------------------------------------------------------------------
  // Ratings and league norms
  // ---------------------------------------------------------------------------
  function attr(p, k) {
    var a = p.attrs;
    if (a && a[k] != null && !isNaN(a[k])) return +a[k];
    return p.ovr != null ? +p.ovr : 60;
  }
  function offRatings(p) {
    return {
      close: 0.45 * attr(p, 'layup') + 0.25 * attr(p, 'dunk') + 0.30 * attr(p, 'close'),
      post: 0.60 * attr(p, 'post') + 0.20 * attr(p, 'strength') + 0.20 * attr(p, 'close'),
      mid: attr(p, 'mid'),
      three: attr(p, 'three')
    };
  }

  var ROT_WEIGHTS = [36, 34, 32, 30, 30, 22, 18, 16, 12, 10];
  var cachedNorms = null;

  function rotationOf(players) {
    return players.slice().sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0); }).slice(0, 10);
  }

  function wStats(list, minSd) { // [[value, weight]] -> {m, sd}
    var s = 0, w = 0, v = 0;
    list.forEach(function (x) { s += x[0] * x[1]; w += x[1]; });
    var m = w ? s / w : 0;
    list.forEach(function (x) { v += (x[0] - m) * (x[0] - m) * x[1]; });
    var sd = w ? Math.sqrt(v / w) : 1;
    return { m: m, sd: Math.max(sd, minSd == null ? 3 : minSd) };
  }

  // Raw profile numbers that do not depend on the norms
  function rawProfile(p) {
    var a = {};
    ATTR_KEYS.forEach(function (k) { a[k] = attr(p, k); });
    return { a: a, off: offRatings(p), ovr: p.ovr != null ? +p.ovr : 60 };
  }

  // z-scored profile (depends on norms)
  function zProfile(rp, n) {
    var z = {}, oz = {}, mz = {};
    ATTR_KEYS.forEach(function (k) { z[k] = clamp((rp.a[k] - n.mean[k]) / n.sd[k], -3, 3); });
    SHOT_TYPES.forEach(function (t) {
      oz[t] = clamp((rp.off[t] - n.offMean[t]) / n.offSd[t], -3, 3);
      mz[t] = soften(clamp((rp.off[t] - n.offShot[t]) / n.offSd[t], -3, 3));
    });
    var zo = clamp((rp.ovr - n.ovrMean) / n.ovrSd, -3, 3.5);
    var zoSoft = soften(zo);
    var sorted = SHOT_TYPES.map(function (t) { return oz[t]; }).sort(function (x, y) { return y - x; });
    var skill = 0.5 * sorted[0] + 0.25 * sorted[1] + 0.25 * z.oiq;
    var useRaw = 0.35 * zo + 0.65 * skill;
    var shares = {}, sum = 0;
    SHOT_TYPES.forEach(function (t) {
      var v = T.typeBase[t] * Math.exp(clamp(T.typeK[t] * oz[t], -5, 1.8));
      shares[t] = v; sum += v;
    });
    SHOT_TYPES.forEach(function (t) { shares[t] /= sum; });
    return { z: z, offZ: oz, makeZ: mz, ovrZ: zo, ovrSoft: zoSoft, useRaw: useRaw, shares: shares };
  }

  function soften(z) { return z / (1 + T.soft * Math.abs(z)); }

  function usageOf(zp, n) {
    var u = (zp.useRaw - n.useMean) / n.useSd;
    return clamp(1 + T.usageK * u, 0.35, 2.0);
  }

  // League means and spreads of the ratings, weighted by expected minutes (and shot volume
  // for the shot ratings), so make chances stay centered on league averages.
  function computeNorms(teamsPlayers) {
    var rots = [];
    teamsPlayers.forEach(function (players) { var r = rotationOf(players); if (r.length) rots.push(r.map(rawProfile)); });
    var n = { mean: {}, sd: {}, offMean: {}, offSd: {}, offShot: {}, ovrMean: 74, ovrSd: 7, useMean: 0, useSd: 1, ftShot: 70, rimZ: 0.5 };
    if (!rots.length) {
      ATTR_KEYS.forEach(function (k) { n.mean[k] = 65; n.sd[k] = 15; });
      SHOT_TYPES.forEach(function (t) { n.offMean[t] = 65; n.offSd[t] = 15; n.offShot[t] = 70; });
      n.ftShot = 70;
      return n;
    }
    function collect(fn) {
      var list = [];
      rots.forEach(function (rot) { rot.forEach(function (rp, i) { list.push([fn(rp), ROT_WEIGHTS[i] || 8]); }); });
      return wStats(list);
    }
    ATTR_KEYS.forEach(function (k) { var s = collect(function (rp) { return rp.a[k]; }); n.mean[k] = s.m; n.sd[k] = s.sd; });
    SHOT_TYPES.forEach(function (t) { var s = collect(function (rp) { return rp.off[t]; }); n.offMean[t] = s.m; n.offSd[t] = s.sd; n.offShot[t] = s.m; });
    var so = collect(function (rp) { return rp.ovr; });
    n.ovrMean = so.m; n.ovrSd = so.sd;
    // usage composite
    var su = [];
    rots.forEach(function (rot) { rot.forEach(function (rp, i) { su.push([zProfile(rp, n).useRaw, ROT_WEIGHTS[i] || 8]); }); });
    var us = wStats(su, 0.2);
    n.useMean = us.m; n.useSd = us.sd;
    // shot-weighted centers for make chances and free throws
    var os = {}, ow = {}, fs = 0, fw = 0;
    SHOT_TYPES.forEach(function (t) { os[t] = 0; ow[t] = 0; });
    rots.forEach(function (rot) {
      rot.forEach(function (rp, i) {
        var zp = zProfile(rp, n);
        var w = (ROT_WEIGHTS[i] || 8) * usageOf(zp, n);
        SHOT_TYPES.forEach(function (t) { os[t] += w * zp.shares[t] * rp.off[t]; ow[t] += w * zp.shares[t]; });
        var f = w * (zp.shares.close + 0.6 * zp.shares.post + 0.2 * zp.shares.mid);
        fs += f * rp.a.ft; fw += f;
      });
    });
    SHOT_TYPES.forEach(function (t) { if (ow[t] > 0) n.offShot[t] = os[t] / ow[t]; });
    n.ftShot = fw ? fs / fw : n.mean.ft;
    // rim protection center: half the matched defender (avg 0) plus half the best on the floor
    var rim = 0;
    rots.forEach(function (rot) {
      var best = -9;
      rot.slice(0, 5).forEach(function (rp) { best = Math.max(best, (rp.a.intD - n.mean.intD) / n.sd.intD); });
      rim += 0.5 * best;
    });
    n.rimZ = rim / rots.length;
    var blk = 0;
    rots.forEach(function (rot) {
      var best = -9;
      rot.slice(0, 5).forEach(function (rp) { best = Math.max(best, (rp.a.block - n.mean.block) / n.sd.block); });
      blk += best;
    });
    n.blkZ = blk / rots.length;
    n.v = 2;
    return n;
  }

  function leagueTeamsPlayers(league) {
    if (!league || !league.teams || !league.players) return [];
    var by = {};
    league.teams.forEach(function (t) { by[t.abbr] = []; });
    league.players.forEach(function (p) { if (by[p.team]) by[p.team].push(p); });
    return Object.keys(by).map(function (k) { return by[k]; });
  }

  function getNorms(opts) {
    if (opts && opts.norms && opts.norms.v === 2) return opts.norms;
    if (cachedNorms) return cachedNorms;
    var lg = globalLeague();
    cachedNorms = computeNorms(lg ? leagueTeamsPlayers(lg) : []);
    return cachedNorms;
  }

  // ---------------------------------------------------------------------------
  // Game engine
  // ---------------------------------------------------------------------------
  function makeState(p, n) {
    var rp = rawProfile(p), zp = zProfile(rp, n);
    return {
      p: p, id: p.id, name: p.name || String(p.id), ovr: rp.ovr, group: posGroup(p.pos), rank: posRank(p.pos),
      a: rp.a, z: zp.z, offZ: zp.offZ, makeZ: zp.makeZ, ovrZ: zp.ovrZ, ovrSoft: zp.ovrSoft, shares: zp.shares, usage: usageOf(zp, n),
      target: 0, sec: 0, energy: 1, fouls: 0, out: false, onCourt: false, starter: false,
      injuryAt: -1, injury: null, need: 0,
      box: emptyLine()
    };
  }

  function isInjured(p, injuries) {
    if (injuries) { var e = injuries[p.id]; return !!(e && e.games > 0); }
    return !!(p.injury && p.injury.games > 0);
  }

  function pickStarters(avail, forced) {
    if (forced && forced.length) {
      var f = avail.filter(function (s) { return forced.indexOf(s.id) >= 0; }).slice(0, 5);
      if (f.length === 5) return f;
      if (f.length >= 3) {
        // some chosen starters are hurt: fill the open spots with the best healthy players
        avail.forEach(function (s) { if (f.length < 5 && f.indexOf(s) < 0) f.push(s); });
        return f;
      }
    }
    var top = avail.slice(0, Math.min(8, avail.length));
    if (top.length <= 5) return top.slice();
    var best = null, bestScore = -1e9;
    var k = top.length;
    for (var a = 0; a < k; a++) for (var b = a + 1; b < k; b++) for (var c = b + 1; c < k; c++)
      for (var d = c + 1; d < k; d++) for (var e = d + 1; e < k; e++) {
        var set = [top[a], top[b], top[c], top[d], top[e]];
        var g = 0, bg = 0, score = 0;
        set.forEach(function (s) { score += s.ovr; if (s.group === 'G') g++; if (s.group === 'B') bg++; });
        if (g === 0) score -= 14;
        if (bg === 0) score -= 14;
        if (g > 2) score -= 4 * (g - 2);
        if (bg > 2) score -= 4 * (bg - 2);
        if (score > bestScore) { bestScore = score; best = set; }
      }
    return best;
  }

  function buildTeam(team, side, rng, opts, n) {
    var injuries = opts.injuries || null;
    var all = (team.players || []).map(function (p) { return makeState(p, n); });
    var avail = all.filter(function (s) { return !isInjured(s.p, injuries); });
    if (avail.length < 5) {
      // Emergency: bring back the least injured, then fill with replacement players
      var hurt = all.filter(function (s) { return avail.indexOf(s) < 0; });
      var gamesOut = function (s) { var e = injuries && injuries[s.id]; return e ? e.games : (s.p.injury ? s.p.injury.games : 0); };
      hurt.sort(function (a, b) { return gamesOut(a) - gamesOut(b); });
      while (avail.length < 5 && hurt.length) avail.push(hurt.shift());
      var pos = ['PG', 'SG', 'SF', 'PF', 'C'];
      while (avail.length < 5) {
        var rp = { id: (team.abbr || 'T') + '_rep' + avail.length, name: 'Replacement Player', pos: pos[avail.length], ovr: Math.round(n.ovrMean - 2 * n.ovrSd) };
        avail.push(makeState(rp, n));
      }
    }
    avail.sort(function (a, b) { return b.ovr - a.ovr; });
    var starters = pickStarters(avail, team.starters);
    var bench = avail.filter(function (s) { return starters.indexOf(s) < 0; });
    starters.sort(function (a, b) { return b.ovr - a.ovr; });
    starters.forEach(function (s, i) { s.starter = true; s.target = STARTER_MIN[i]; });
    var benchTargets = bench.length >= 5 && bench[4].ovr >= bench[0].ovr - 12 ? BENCH_MIN5 : BENCH_MIN4;
    if (bench.length < benchTargets.length) {
      var missing = 0;
      for (var i = bench.length; i < benchTargets.length; i++) missing += benchTargets[i];
      benchTargets = benchTargets.slice(0, bench.length).map(function (m) { return m + missing / Math.max(1, bench.length); });
    }
    bench.forEach(function (s, i) { s.target = benchTargets[i] || 0; });
    var mins = team.minutes || null;
    var roster = starters.concat(bench);
    var listed = 0;
    if (mins) roster.forEach(function (s) { if (mins[s.id] != null) listed += Math.max(0, +mins[s.id] || 0); });
    if (listed <= 0) mins = null;
    roster.forEach(function (s) {
      if (mins && mins[s.id] != null) s.target = clamp(+mins[s.id] || 0, 0, 48);
      else if (mins && listed >= 200) s.target = 0;      // a full saved rotation: others only play in emergencies
      else if (s.target > 0) s.target += clamp(s.z.stamina * 1.8, -3, 3);
    });
    var tot = 0;
    roster.forEach(function (s) { tot += s.target; });
    if (tot > 0) roster.forEach(function (s) { s.target = Math.min(mins ? 46 : 42, s.target * 240 / tot); });
    // Injury rolls for this game: about 0.15% to 0.4% per player, by durability and minutes
    roster.forEach(function (s) {
      if (s.target <= 0) return;
      var d = clamp(s.a.durability, 25, 99);
      var p = 0.004 - 0.0025 * (d - 25) / 74;
      p *= clamp(s.target / 26, 0.5, 1.4);
      if (rng() < p) s.injuryAt = Math.floor(rng() * REG_SECONDS);
    });
    return { abbr: team.abbr, side: side, roster: roster, all: all, lineup: [], teamFouls: 0, late2: 0, pts: 0, lastSub: -999,
      strat: readStrategy(team.strategy) };
  }

  // Team strategy: sliders 0..100 with 50 neutral, turned into -1..1 (0 = neutral)
  function readStrategy(st) {
    st = st || {};
    function d(v) { v = +v; return isNaN(v) ? 0 : clamp((v - 50) / 50, -1, 1); }
    var def = String(st.defense || 'man').toLowerCase();
    return { pace: d(st.pace), three: d(st.three), crash: d(st.crash), defense: def === 'zone' || def === 'switch' ? def : 'man' };
  }

  // Shot type weights and make adjustments for an offense against a defensive scheme
  function shotPlan(offStrat, defStrat) {
    var mult = { close: 1, post: 1, mid: 1, three: Math.exp(T.stratThree * offStrat.three) };
    var make = { close: 0, post: 0, mid: 0, three: 0 };
    if (defStrat.defense === 'zone') {
      mult.close *= 0.86; mult.post *= 0.92; mult.mid *= 1.04; mult.three *= 1.17;
    } else if (defStrat.defense === 'switch') {
      mult.three *= 0.92; make.three -= 0.010;
      mult.post *= 1.15; make.post += 0.014; make.close += 0.008;
    }
    return { mult: mult, make: make };
  }

  function fmtClock(sec) { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ':' + pad2(sec % 60); }

  function simGame(homeTeam, awayTeam, rng, opts) {
    rng = rng || Math.random;
    opts = opts || {};
    var n = getNorms(opts);
    var wantPbp = opts.pbp !== false;
    var wantSubs = !!opts.pbpSubs;   // substitution lines in the play-by-play (off by default to keep saves small)
    var H = buildTeam(homeTeam, 0, rng, opts, n);
    var A = buildTeam(awayTeam, 1, rng, opts, n);
    var teams = [H, A];
    var pbp = [];
    var quarters = [];
    var q = 1, clock = 720, elapsed = 0;
    var qStart = [0, 0];
    var injuriesOut = [];
    var homeEdge = opts.neutral ? 0 : T.homeMake;
    H.plan = shotPlan(H.strat, A.strat);
    A.plan = shotPlan(A.strat, H.strat);
    var paceF = 1 - clamp(T.stratPace * (H.strat.pace + A.strat.pace), -0.1, 0.1);
    H.form = (rng() + rng() + rng() - 1.5) * 2 * T.formSd;
    A.form = (rng() + rng() + rng() - 1.5) * 2 * T.formSd;

    var lastScore = '0-0';
    function log(team, text) {
      if (!wantPbp) return;
      var sc = A.pts + '-' + H.pts;
      pbp.push((q <= 4 ? 'Q' + q : 'OT' + (q - 4)) + ' ' + fmtClock(clock) + ' ' + (team ? team.abbr + ' ' : '') + text +
        (sc !== lastScore ? ' (' + sc + ')' : ''));
      lastScore = sc;
    }
    function fz(s) { return (1 - s.energy) * T.fatigueZ; }
    function lineupZ(t, key) {
      var s = 0;
      t.lineup.forEach(function (p) { s += p.z[key] - fz(p); });
      return s / Math.max(1, t.lineup.length);
    }
    function lineupOvr(t) {
      var s = 0;
      t.lineup.forEach(function (p) { s += p.ovr - fz(p) * n.ovrSd * 0.5; });
      return s / Math.max(1, t.lineup.length);
    }

    // ---- substitutions ----
    function chooseLineup(t, forceStarters) {
      var margin = Math.abs(H.pts - A.pts);
      var cands = t.roster.filter(function (s) { return !s.out; });
      var crunch = q >= 4 && clock <= 300 && margin <= 10;
      var blowout = q === 4 && ((clock <= 480 && margin >= 22) || (clock <= 300 && margin >= 16));
      var scale = Math.max(elapsed, 1) / REG_SECONDS;
      cands.forEach(function (s) {
        var need = s.target * scale - s.sec / 60;
        if (s.onCourt) need += 3.4;
        need -= Math.max(0, 0.9 - s.energy) * 45;
        if (q <= 2 && s.fouls >= q + 2) need -= 9;
        else if (q === 3 && s.fouls >= 5) need -= 9;
        else if (q === 4 && s.fouls >= 5 && clock > 360) need -= 4;
        if (s.target <= 0) need -= 6;
        if (forceStarters && s.starter) need += 1000;
        if (crunch) need = 100 + s.target * 0.6 - Math.max(0, 0.85 - s.energy) * 60 - (s.fouls >= 5 ? 3 : 0) + (s.onCourt ? 1 : 0);
        if (blowout) need = 100 - s.target + (s.onCourt ? 1 : 0);
        s.need = need;
      });
      cands.sort(function (a, b) { return b.need - a.need; });
      if (cands.length < 5) {
        // Not enough eligible players: fouled-out players stay in (NBA rule), injured ones last
        var extra = t.roster.filter(function (s) { return s.out; });
        extra.sort(function (a, b) { return (a.injury ? 1 : 0) - (b.injury ? 1 : 0); });
        cands = cands.concat(extra.slice(0, 5 - cands.length));
      }
      var pick = cands.slice(0, 5);
      // positional sanity: at least one guard and one big when available
      ['G', 'B'].forEach(function (g) {
        if (pick.some(function (s) { return s.group === g; })) return;
        var add = cands.slice(5).filter(function (s) { return s.group === g && s.need > -40; })[0];
        if (!add) return;
        var counts = {};
        pick.forEach(function (s) { counts[s.group] = (counts[s.group] || 0) + 1; });
        for (var i = pick.length - 1; i >= 0; i--) {
          var s = pick[i];
          if (forceStarters && s.starter) continue;
          if ((counts[s.group] || 0) > 1 || s.group === 'W') { pick[i] = add; break; }
        }
      });
      var outs = [], ins = [];
      t.lineup.forEach(function (s) { if (pick.indexOf(s) < 0) { s.onCourt = false; outs.push(s.name); } });
      pick.forEach(function (s) { if (!s.onCourt) { s.onCourt = true; ins.push(s.name); } });
      if (ins.length) {
        t.lastSub = elapsed;
        if (wantSubs && elapsed > 0 && !forceStarters) log(t, 'substitution: ' + ins.join(', ') + ' in for ' + outs.join(', '));
      }
      t.lineup = pick.sort(function (a, b) { return a.rank - b.rank; });
    }

    function runClock(sec) {
      teams.forEach(function (t) {
        t.roster.forEach(function (s) {
          if (s.onCourt) {
            s.sec += sec;
            var drain = (0.0125 - s.z.stamina * 0.0016) * (1 + T.starDrain * Math.max(0, s.usage - 1)) / 60;
            s.energy = Math.max(0.4, s.energy - drain * sec);
          } else {
            s.energy = Math.min(1, s.energy + 0.034 / 60 * sec);
          }
        });
      });
      clock -= sec;
      elapsed += sec;
    }

    function checkInjuries() {
      var hit = [];
      teams.forEach(function (t) {
        t.lineup.forEach(function (s) {
          if (s.injuryAt >= 0 && !s.out && elapsed >= s.injuryAt) {
            var inj = rollInjury(rng);
            s.out = true; s.injury = inj; s.injuryAt = -1;
            injuriesOut.push({ id: s.id, name: s.name, team: t.abbr, type: inj.type, games: inj.games });
            log(t, s.name + ' leaves the game with an injury (' + inj.type + ')');
            if (hit.indexOf(t) < 0) hit.push(t);
          }
        });
      });
      hit.forEach(function (t) { chooseLineup(t, false); });
    }

    function pickBy(list, fn) { return pickWeighted(list, list.map(fn), rng); }

    function defenderFor(def, off, shooter) {
      var i = off.lineup.indexOf(shooter);
      return def.lineup[clamp(i, 0, def.lineup.length - 1)];
    }

    function foulOutCheck(team, s) {
      if (s.fouls >= 6 && !s.out) { s.out = true; log(team, s.name + ' fouls out'); }
    }

    function shootFT(off, shooter, count) {
      var pct = clamp(T.ftBase + T.ftK * (shooter.a.ft - n.ftShot) / n.sd.ft, 0.35, 0.93);
      var made = 0, last = true;
      for (var i = 0; i < count; i++) {
        shooter.box.fta++;
        last = rng() < pct;
        if (last) { made++; shooter.box.ftm++; shooter.box.pts++; off.pts++; }
      }
      log(off, shooter.name + ' makes ' + made + ' of ' + count + ' free throws');
      return { made: made, lastMissed: !last };
    }

    function rebound(off, def, shotType, blocked) {
      if (rng() < T.teamReb) return { team: rng() < 0.3 ? off : def, player: null };
      var p = T.orebBase + T.minorK * (0.03 * lineupZ(off, 'oreb') - 0.03 * lineupZ(def, 'dreb')) + T.stratCrash * off.strat.crash;
      if (shotType === 'three') p -= 0.015;
      if (blocked) p += 0.04;
      p = clamp(p, 0.12, 0.45);
      if (rng() < p) {
        var r = pickBy(off.lineup, function (s) {
          return Math.exp(T.rebK * (s.z.oreb - fz(s))) * (s.group === 'B' ? 1.2 : (s.group === 'W' ? 1 : 0.85));
        });
        r.box.oreb++;
        log(off, r.name + ' offensive rebound');
        return { team: off, player: r };
      }
      var d = pickBy(def.lineup, function (s) {
        return Math.exp(T.rebK * (s.z.dreb - fz(s))) * (s.group === 'B' ? 1.2 : (s.group === 'W' ? 1 : 0.85));
      });
      d.box.dreb++;
      log(def, d.name + ' defensive rebound');
      return { team: def, player: d };
    }

    function inBonus(def) { return def.teamFouls >= 5 || (clock <= 120 && def.late2 >= 2); }
    function addTeamFoul(def) { def.teamFouls++; if (clock <= 120) def.late2++; }

    function creditAssist(off, shooter, type) {
      var pa = T.astChance[type] * Math.exp(-0.08 * shooter.z.handle - 0.25 * (shooter.usage - 1));
      if (rng() >= pa) return null;
      var mates = off.lineup.filter(function (s) { return s !== shooter; });
      if (!mates.length) return null;
      var a = pickBy(mates, function (s) {
        return Math.exp(T.astK * s.z.pass + 0.25 * s.z.handle) * (s.group === 'G' ? 1.7 : (s.group === 'W' ? 1 : 0.7));
      });
      a.box.ast++;
      return a;
    }

    function afterFT(off, def, r) {
      if (!r.lastMissed) return { next: def, dead: true };
      var rb = rebound(off, def, 'ft', false);
      return { next: rb.team, dead: false, second: rb.team === off };
    }

    // One play. Returns { next: team with the ball, dead, second (continuation), putback }
    function play(off, def, putbackBy, trans) {
      var edge = (lineupOvr(off) - lineupOvr(def)) * T.teamEdge + (off === H ? homeEdge : -homeEdge) -
        T.rubber * clamp(off.pts - def.pts, -20, 20);
      if (!putbackBy) {
        // ---- turnover ----
        var hand = lineupZ(off, 'handle') * 0.6 + lineupZ(off, 'pass') * 0.4;
        var stl = lineupZ(def, 'steal') * 0.6 + lineupZ(def, 'perD') * 0.4;
        var pTO = T.toBase * Math.exp(T.minorK * (-0.14 * hand + 0.12 * stl) - edge * 3);
        if (rng() < pTO) {
          var tp = pickBy(off.lineup, function (s) {
            return (0.4 + s.usage) * (s.group === 'G' ? 1.25 : 1) * Math.exp(-0.2 * s.z.handle);
          });
          tp.box.tov++;
          var ps = T.stealShare * Math.exp(T.minorK * 0.15 * stl);
          if (rng() < ps) {
            var st = pickBy(def.lineup, function (s) { return Math.exp(T.stlK * s.z.steal); });
            st.box.stl++;
            log(off, tp.name + ' turnover, stolen by ' + st.name);
            return { next: def, dead: false };
          }
          if (rng() < T.offFoulShare / (1 - T.stealShare)) {
            tp.box.pf++; tp.fouls++;
            log(off, tp.name + ' offensive foul');
            foulOutCheck(off, tp);
          } else {
            log(off, tp.name + ' turnover');
          }
          return { next: def, dead: true };
        }
        // ---- non-shooting foul ----
        if (rng() < T.nonShootFoul) {
          var fd = pickBy(def.lineup, function (s) { return Math.exp(-0.25 * s.z.diq) * (s.group === 'B' ? 1.2 : 1); });
          fd.box.pf++; fd.fouls++;
          var bonus = inBonus(def);
          addTeamFoul(def);
          log(def, fd.name + ' personal foul');
          foulOutCheck(def, fd);
          if (bonus) {
            var fs = pickBy(off.lineup, function (s) { return s.usage * (0.6 + s.shares.close); });
            return afterFT(off, def, shootFT(off, fs, 2));
          }
          return { next: off, dead: true, second: true };
        }
      }
      // ---- shot ----
      var shooter = putbackBy || pickBy(off.lineup, function (s) { return s.usage * (0.5 + 0.5 * s.energy); });
      var type = putbackBy ? 'close' : pickWeighted(SHOT_TYPES, SHOT_TYPES.map(function (t) {
        return shooter.shares[t] * off.plan.mult[t] * (t === 'close' && trans > 0 ? 1 + trans : 1);
      }), rng);
      var dfd = defenderFor(def, off, shooter);
      var offZ = shooter.makeZ[type] - fz(shooter);
      var defZ;
      if (type === 'close' || type === 'post') {
        var bestInt = -9;
        def.lineup.forEach(function (s) { bestInt = Math.max(bestInt, s.z.intD - fz(s)); });
        defZ = 0.5 * (dfd.z.intD - fz(dfd)) + 0.5 * bestInt - n.rimZ;
      } else {
        defZ = dfd.z.perD - fz(dfd);
      }
      var pMake = T.makeBase[type] + T.makeOff[type] * offZ - T.makeDef[type] * defZ +
        T.makeOvr * ((shooter.ovrSoft - fz(shooter)) - (dfd.ovrSoft - fz(dfd))) + edge + off.form;
      if (putbackBy) pMake += 0.04;
      pMake += off.plan.make[type];
      if (trans) pMake += T.stratTrans * trans;   // transition chances after the other team crashed the glass
      if (clock < 2 && rng() < 0.5) pMake *= 0.4; // end of quarter heave
      pMake = clamp(pMake, 0.12, 0.85);
      var is3 = type === 'three';
      var pFoul = T.foulShot[type] * Math.exp(0.15 * shooter.z.strength + 0.6 * (shooter.usage - 1) - 0.1 * dfd.z.diq);
      var desc = shotDesc(type, shooter, rng);
      if (rng() < pFoul) {
        var fouler = (type === 'close' || type === 'post') && rng() < 0.45 ?
          pickBy(def.lineup, function (s) { return s.group === 'B' ? 2 : 1; }) : dfd;
        fouler.box.pf++; fouler.fouls++;
        addTeamFoul(def);
        if (rng() < pMake * T.andOneFactor) {
          shooter.box.fga++; shooter.box.fgm++;
          if (is3) { shooter.box.tpa++; shooter.box.tpm++; }
          var pts = is3 ? 3 : 2;
          shooter.box.pts += pts; off.pts += pts;
          var a1 = putbackBy ? null : creditAssist(off, shooter, type);
          log(off, shooter.name + ' makes ' + desc + (a1 ? ' (' + a1.name + ' assists)' : '') + ', fouled by ' + fouler.name);
          foulOutCheck(def, fouler);
          return afterFT(off, def, shootFT(off, shooter, 1));
        }
        log(off, shooter.name + ' fouled by ' + fouler.name + ' on ' + desc);
        foulOutCheck(def, fouler);
        return afterFT(off, def, shootFT(off, shooter, is3 ? 3 : 2));
      }
      shooter.box.fga++;
      if (is3) shooter.box.tpa++;
      if (rng() < pMake) {
        shooter.box.fgm++;
        if (is3) shooter.box.tpm++;
        var p2 = is3 ? 3 : 2;
        shooter.box.pts += p2; off.pts += p2;
        var ast = putbackBy ? null : creditAssist(off, shooter, type);
        log(off, shooter.name + ' makes ' + desc + (ast ? ' (' + ast.name + ' assists)' : ''));
        return { next: def, dead: true };
      }
      // miss: blocked?
      var maxBlk = -9;
      def.lineup.forEach(function (s) { maxBlk = Math.max(maxBlk, s.z.block - fz(s)); });
      var pBlk = T.blockGivenMiss[type] * Math.exp(T.minorK * 0.35 * (maxBlk - n.blkZ));
      var blocked = rng() < pBlk;
      if (blocked) {
        var bl = pickBy(def.lineup, function (s) {
          return Math.exp(T.blkK * s.z.block) * (s === dfd ? 1.6 : 1) * (type === 'three' || type === 'mid' ? 1 : (s.group === 'B' ? 1.5 : 0.8));
        });
        bl.box.blk++;
        log(off, shooter.name + ' misses ' + desc + ', blocked by ' + bl.name);
      } else {
        log(off, shooter.name + ' misses ' + desc);
      }
      var rb = rebound(off, def, type, blocked);
      if (rb.team === off && rb.player && !rb.player.out && rng() < T.putback) return { next: off, dead: false, second: true, putback: rb.player };
      return { next: rb.team, dead: false, second: rb.team === off, trans: rb.team === def && rb.player ? off.strat.crash : 0 };
    }

    // ---- main loop ----
    var poss = rng() < 0.5 ? H : A;
    var tipWinner = poss;
    log(null, 'Tip-off: ' + A.abbr + ' at ' + H.abbr + ', ' + poss.abbr + ' wins the tip');
    chooseLineup(H, true); chooseLineup(A, true);
    var second = false, putback = null, dead = true, trans = 0;
    var guard = 0;
    while (guard++ < 3000) {
      if (clock <= 0.01) {
        quarters.push([H.pts - qStart[0], A.pts - qStart[1]]);
        qStart = [H.pts, A.pts];
        log(null, 'End of ' + (q <= 4 ? 'Q' + q : 'OT' + (q - 4)));
        if (q >= 4 && H.pts !== A.pts) break;
        q++;
        clock = q <= 4 ? 720 : 300;
        H.teamFouls = A.teamFouls = 0; H.late2 = A.late2 = 0;
        if (q > 4) H.teamFouls = A.teamFouls = 1;
        var rest = q === 3 ? 0.16 : 0.05;
        teams.forEach(function (t) { t.roster.forEach(function (s) { s.energy = Math.min(1, s.energy + rest); }); });
        if (q === 2 || q === 3) poss = tipWinner === H ? A : H;
        else if (q === 4) poss = tipWinner;
        else poss = rng() < 0.5 ? H : A;
        chooseLineup(H, q === 3); chooseLineup(A, q === 3);
        second = false; putback = null; dead = true; trans = 0;
        continue;
      }
      checkInjuries();
      if (dead) {
        teams.forEach(function (t) {
          var crunchTime = q >= 4 && clock <= 300;
          if (elapsed - t.lastSub >= 100 || crunchTime || t.lineup.some(function (s) { return s.out; })) chooseLineup(t, false);
        });
      }
      var def = poss === H ? A : H;
      var dur;
      if (putback) dur = 1 + rng() * 3;
      else if (second) dur = 3 + rng() * 2 * (T.secondMean - 3);
      else {
        var pace = 1 - ((lineupZ(poss, 'speed') + lineupZ(def, 'speed')) / 2) * 0.03;
        dur = 4 + (rng() + rng()) * (T.playMean * pace * paceF - 4);
        if (trans > 0) dur *= 1 - 0.15 * trans;
      }
      dur = Math.min(dur, 24);
      if (dur >= clock) dur = clock;
      runClock(dur);
      var res = play(poss, def, putback, trans);
      poss = res.next;
      second = !!res.second;
      putback = res.putback || null;
      trans = res.trans || 0;
      dead = !!res.dead;
    }

    var result = {
      home: { abbr: H.abbr, pts: H.pts, box: boxRows(H) },
      away: { abbr: A.abbr, pts: A.pts, box: boxRows(A) },
      quarters: quarters,
      ot: Math.max(0, quarters.length - 4),
      pbp: pbp,
      injuries: injuriesOut,
      winner: H.pts > A.pts ? H.abbr : A.abbr
    };
    log(null, 'Final: ' + A.abbr + ' ' + A.pts + ', ' + H.abbr + ' ' + H.pts + (result.ot ? ' (' + (result.ot > 1 ? result.ot : '') + 'OT)' : ''));
    return result;
  }

  function boxRows(t) {
    return t.roster.filter(function (s) { return s.sec > 0; }).map(function (s) {
      var b = s.box;
      return {
        id: s.id, name: s.name, min: round1(s.sec / 60), pts: b.pts, fgm: b.fgm, fga: b.fga, tpm: b.tpm, tpa: b.tpa,
        ftm: b.ftm, fta: b.fta, oreb: b.oreb, dreb: b.dreb, ast: b.ast, stl: b.stl, blk: b.blk, tov: b.tov, pf: b.pf,
        starter: s.starter
      };
    });
  }

  function shotDesc(type, s, rng) {
    var r = rng();
    if (type === 'three') return (r < 0.25 ? 'a 26-foot ' : (r < 0.5 ? 'a corner ' : 'a ')) + 'three point jumper';
    if (type === 'mid') return r < 0.5 ? 'a pull-up jumper' : 'an 18-foot jumper';
    if (type === 'post') return r < 0.5 ? 'a hook shot' : 'a turnaround post shot';
    var dunkish = s.a.dunk > 70 && rng() < (s.a.dunk - 55) / 70;
    if (dunkish) return 'a dunk';
    return r < 0.5 ? 'a driving layup' : 'a layup';
  }

  function rollInjury(rng) {
    var row = pickWeighted(INJURIES, INJURIES.map(function (r) { return r[1]; }), rng);
    var games = row[2] >= 999 ? 999 : randInt(row[2], row[3], rng);
    return { type: row[0], games: games };
  }

  // ---------------------------------------------------------------------------
  // Schedule
  // ---------------------------------------------------------------------------
  function buildMatchups(teams, rng) {
    var confs = {};
    teams.forEach(function (t) {
      var c = t.conf || 'East', d = t.div || c;
      confs[c] = confs[c] || {};
      (confs[c][d] = confs[c][d] || []).push(t.abbr);
    });
    var counts = {};
    function key(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
    function set(a, b, games, extraHome) { counts[key(a, b)] = { a: a, b: b, games: games, extraHome: extraHome }; }
    var abbrs = teams.map(function (t) { return t.abbr; });
    var confOf = {}, divOf = {};
    teams.forEach(function (t) { confOf[t.abbr] = t.conf || 'East'; divOf[t.abbr] = t.div || t.conf || 'East'; });
    // defaults: other conference 2, same conference 4
    for (var i = 0; i < abbrs.length; i++) for (var j = i + 1; j < abbrs.length; j++) {
      var a = abbrs[i], b = abbrs[j];
      set(a, b, confOf[a] === confOf[b] ? 4 : 2, null);
    }
    // same conference, other division: each team plays 4 of those 10 opponents only 3 times
    Object.keys(confs).forEach(function (c) {
      var divs = Object.keys(confs[c]).map(function (d) {
        var list = confs[c][d].slice();
        for (var k = list.length - 1; k > 0; k--) { var r = Math.floor(rng() * (k + 1)); var tmp = list[k]; list[k] = list[r]; list[r] = tmp; }
        return list;
      });
      if (divs.length !== 3 || divs.some(function (d) { return d.length !== 5; })) return;
      for (var x = 0; x < 3; x++) for (var y = x + 1; y < 3; y++) {
        for (var ii = 0; ii < 5; ii++) {
          for (var off = 0; off < 2; off++) {
            var jj = (ii + off) % 5;
            var ta = divs[x][ii], tb = divs[y][jj];
            set(ta, tb, 3, off === 0 ? ta : tb);
          }
        }
      }
    });
    var games = [];
    Object.keys(counts).forEach(function (k) {
      var m = counts[k];
      var homesA = Math.floor(m.games / 2), homesB = Math.floor(m.games / 2);
      if (m.games % 2) { if (m.extraHome === m.a) homesA++; else homesB++; }
      for (var h = 0; h < homesA; h++) games.push({ home: m.a, away: m.b });
      for (var h2 = 0; h2 < homesB; h2++) games.push({ home: m.b, away: m.a });
    });
    return games;
  }

  var BLACKOUT = { '11-22': 1, '12-24': 1, '02-14': 1, '02-15': 1, '02-16': 1, '02-17': 1, '02-18': 1 };
  var WEEKDAY_W = [0.62, 0.8, 0.78, 1.45, 0.45, 1.3, 1.05]; // Sun..Sat

  function buildCalendar(start, end) {
    var dates = [];
    for (var t = parseDate(start); t <= parseDate(end); t += DAY_MS) {
      var s = fmtDate(t);
      if (BLACKOUT[s.slice(5)]) continue;
      dates.push(s);
    }
    return dates;
  }

  function scheduleOnce(teams, matchups, dates, rng) {
    var abbrs = teams.map(function (t) { return t.abbr; });
    var total = {}, played = {}, last = {}, prev2 = {};
    abbrs.forEach(function (a) { total[a] = 0; played[a] = 0; last[a] = -9; prev2[a] = -9; });
    matchups.forEach(function (m) { total[m.home]++; total[m.away]++; });
    var remaining = matchups.slice();
    var wts = dates.map(function (d) { return d.slice(5) === '12-25' ? 0.65 : WEEKDAY_W[weekday(d)]; });
    // opening night is light
    wts[0] = 0.4;
    var totalW = 0; wts.forEach(function (w) { totalW += w; });
    var cumW = 0;
    var days = [];
    var lastMet = {};
    for (var di = 0; di < dates.length; di++) {
      var remW = totalW - cumW;
      cumW += wts[di];
      var frac = cumW / totalW;
      var daysLeft = dates.length - di;
      var target = Math.round(remaining.length * wts[di] / remW + (rng() - 0.5) * 2);
      target = clamp(target, 1, 15);
      if (di === dates.length - 1) target = 15;
      var busy = {};
      var cand = [];
      for (var k = 0; k < remaining.length; k++) {
        var m = remaining[k];
        var h = m.home, a = m.away;
        // no three games in three nights
        if (last[h] === di - 1 && prev2[h] === di - 2) continue;
        if (last[a] === di - 1 && prev2[a] === di - 2) continue;
        var defH = total[h] * frac - played[h], defA = total[a] * frac - played[a];
        var remH = total[h] - played[h], remA = total[a] - played[a];
        var must = (remH >= daysLeft * 0.62 ? 6 : 0) + (remA >= daysLeft * 0.62 ? 6 : 0);
        var b2b = (last[h] === di - 1 ? 1 : 0) + (last[a] === di - 1 ? 1 : 0);
        var pk = h < a ? h + a : a + h;
        var recent = lastMet[pk] != null && di - lastMet[pk] < 6 ? 2.5 : 0;
        var score = defH + defA + must - b2b * 0.03 - recent + rng() * 0.8;
        cand.push({ k: k, m: m, score: score, must: must });
      }
      cand.sort(function (x, y) { return y.score - x.score; });
      var chosen = [];
      for (var c = 0; c < cand.length; c++) {
        var g = cand[c].m;
        if (busy[g.home] || busy[g.away]) continue;
        if (chosen.length >= target && !(cand[c].must >= 6)) continue;
        if (chosen.length >= 15) break;
        busy[g.home] = busy[g.away] = 1;
        chosen.push(cand[c]);
      }
      var takenIdx = {};
      chosen.forEach(function (x) {
        takenIdx[x.k] = 1;
        var g = x.m;
        [g.home, g.away].forEach(function (t) { prev2[t] = last[t]; last[t] = di; played[t]++; });
        lastMet[g.home < g.away ? g.home + g.away : g.away + g.home] = di;
      });
      remaining = remaining.filter(function (m, idx) { return !takenIdx[idx]; });
      if (chosen.length) days.push({ date: dates[di], games: chosen.map(function (x) { return { home: x.m.home, away: x.m.away }; }) });
    }
    return { days: days, left: remaining };
  }

  function buildSchedule(teams, rng, start, end) {
    var dates = buildCalendar(start, end);
    var matchups = buildMatchups(teams, rng);
    var best = null;
    for (var attempt = 0; attempt < 12; attempt++) {
      var res = scheduleOnce(teams, matchups, dates, rng);
      if (!best || res.left.length < best.left.length) best = res;
      if (!res.left.length) break;
    }
    // Any leftovers (should be rare) go on extra dates after the end
    var d = end;
    while (best.left.length) {
      d = addDays(d, 1);
      var busy = {}, today = [], keep = [];
      best.left.forEach(function (g) {
        if (!busy[g.home] && !busy[g.away]) { busy[g.home] = busy[g.away] = 1; today.push(g); } else keep.push(g);
      });
      best.days.push({ date: d, games: today });
      best.left = keep;
    }
    var id = 0;
    best.days.forEach(function (day) {
      day.games.forEach(function (g) {
        id++;
        g.id = 'g' + (id < 10 ? '000' : id < 100 ? '00' : id < 1000 ? '0' : '') + id;
        g.played = false; g.hs = null; g.as = null;
      });
    });
    return best.days;
  }

  // The real schedule for a season from data/schedules.js (window.SCHEDULES_GET(year) returns
  // [[date, home, away(, "cancelled")], ...] or null). Cancelled games are skipped. Returns null
  // (generate one instead) when there is no real schedule or a team in the league is missing from it.
  function realSchedule(year, teams) {
    var G = (root && root.SCHEDULES_GET) || (typeof window !== 'undefined' && window.SCHEDULES_GET) || null;
    if (typeof G !== 'function') return null;
    var list = null;
    try { list = G(year); } catch (e) { list = null; }
    if (!list || !list.length) return null;
    var known = {}, seen = {};
    teams.forEach(function (t) { known[t.abbr] = true; });
    var days = [], byDate = {};
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      if (!g || g[3] === 'cancelled') continue;
      if (!known[g[1]] || !known[g[2]]) return null;
      seen[g[1]] = seen[g[2]] = true;
      var day = byDate[g[0]];
      if (!day) { day = byDate[g[0]] = { date: g[0], games: [] }; days.push(day); }
      day.games.push({ home: g[1], away: g[2] });
    }
    for (var a in known) if (!seen[a]) return null;
    days.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
    var id = 0;
    days.forEach(function (d) {
      d.games.forEach(function (gm) {
        id++;
        gm.id = 'g' + (id < 10 ? '000' : id < 100 ? '00' : id < 1000 ? '0' : '') + id;
        gm.played = false; gm.hs = null; gm.as = null;
      });
    });
    return days;
  }

  // ---------------------------------------------------------------------------
  // Season
  // ---------------------------------------------------------------------------
  function newStanding() {
    return { w: 0, l: 0, confW: 0, confL: 0, divW: 0, divL: 0, streak: 0, home: [0, 0], away: [0, 0], pf: 0, pa: 0, last10: [] };
  }

  function newSeason(league, opts) {
    opts = opts || {};
    league = league || globalLeague();
    if (!league) throw new Error('ENGINE.newSeason: no league data');
    var rng = opts.rng || (opts.seed != null ? mulberry32(opts.seed) : Math.random);
    var year = opts.year || league.season || 2013;
    var start = opts.startDate || (year - 1) + '-10-30';
    var end = opts.endDate || year + '-04-17';
    var teams = league.teams.map(function (t) { return { abbr: t.abbr, conf: t.conf || 'East', div: t.div || t.conf || 'East' }; });
    // real dates and games when data/schedules.js has the season (opts.realSchedule === false to generate)
    var days = opts.realSchedule === false || opts.startDate || opts.endDate ? null : realSchedule(year, teams);
    var realSched = !!days;
    if (!days) days = buildSchedule(teams, rng, start, end);
    var standings = {};
    teams.forEach(function (t) { standings[t.abbr] = newStanding(); });
    var injuries = {};
    (league.players || []).forEach(function (p) {
      if (p.injury && p.injury.games > 0) injuries[p.id] = { type: p.injury.type || 'Injury', games: p.injury.games };
    });
    var norms = computeNorms(leagueTeamsPlayers(league));
    cachedNorms = norms;
    return {
      year: year,
      day: 0,
      days: days,
      teams: teams,
      standings: standings,
      playerStats: {},
      playoffStats: {},
      boxScores: {},
      injuries: injuries,
      phase: 'regular',
      playoffs: null,
      champion: null,
      userTeam: opts.userTeam || null,
      order: [],
      norms: norms,
      realSchedule: realSched,
      version: 1
    };
  }

  function teamMeta(season, abbr) {
    for (var i = 0; i < season.teams.length; i++) if (season.teams[i].abbr === abbr) return season.teams[i];
    return { abbr: abbr, conf: 'East', div: 'East' };
  }

  function rosters(league) {
    var by = {};
    (league.teams || []).forEach(function (t) { by[t.abbr] = []; });
    (league.players || []).forEach(function (p) { if (by[p.team]) by[p.team].push(p); });
    return by;
  }

  function teamObj(season, league, by, abbr) {
    var lt = null;
    (league.teams || []).forEach(function (t) { if (t.abbr === abbr) lt = t; });
    var lineups = season.lineups && season.lineups[abbr];
    return {
      abbr: abbr,
      players: by[abbr] || [],
      starters: (lineups && lineups.starters) || (lt && lt.starters) || null,
      minutes: (lineups && lineups.minutes) || null,
      strategy: (lt && lt.strategy) || (season.strategies && season.strategies[abbr]) || null
    };
  }

  function addLine(map, row) {
    var s = map[row.id] || (map[row.id] = emptyLine());
    if (row.min > 0) s.g++;
    if (row.starter) s.gs++;
    STAT_KEYS.forEach(function (k) { s[k] += row[k]; });
    s.min = round1(s.min);
  }

  function recordStanding(season, home, away, hs, as) {
    var H = season.standings[home], A = season.standings[away];
    if (!H || !A) return;
    var hm = teamMeta(season, home), am = teamMeta(season, away);
    var homeWon = hs > as;
    var W = homeWon ? H : A, L = homeWon ? A : H;
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

  function countDownInjuries(season, abbr, by, freshIds) {
    (by[abbr] || []).forEach(function (p) {
      var e = season.injuries[p.id];
      if (!e || freshIds[p.id]) return;
      e.games--;
      if (e.games <= 0) delete season.injuries[p.id];
    });
  }

  // Saves stay small: full box scores for the last KEEP_FULL games and every user team game,
  // play-by-play for the last KEEP_PBP games, and only { id, home, away, hs, as, date } otherwise.
  // Stored box rows leave out the name and zero stats (ENGINE.getBoxScore fills them back in).
  function compactRow(r) {
    var o = { id: r.id, min: r.min, pts: r.pts };
    STAT_KEYS.forEach(function (k) { if (r[k] && o[k] == null) o[k] = r[k]; });
    if (r.starter) o.starter = true;
    return o;
  }
  function expandRow(r, names) {
    var o = { id: r.id, name: r.name || (names && names[r.id]) || r.id };
    STAT_KEYS.forEach(function (k) { o[k] = r[k] || 0; });
    o.starter = !!r.starter;
    return o;
  }

  function storeResult(season, g, res) {
    var stored = {
      id: res.id, date: res.date,
      home: { abbr: res.home.abbr, pts: res.home.pts, box: res.home.box.map(compactRow) },
      away: { abbr: res.away.abbr, pts: res.away.pts, box: res.away.box.map(compactRow) },
      quarters: res.quarters, ot: res.ot, pbp: res.pbp
    };
    if (res.playoff) stored.playoff = true;
    if (res.injuries && res.injuries.length) stored.injuries = res.injuries;
    season.boxScores[g.id] = stored;
    season.order.push(g.id);
    var len = season.order.length;
    var oldP = season.order[len - 1 - KEEP_PBP];
    if (oldP && season.boxScores[oldP]) delete season.boxScores[oldP].pbp;
    var oldF = season.order[len - 1 - KEEP_FULL];
    var r = oldF && season.boxScores[oldF];
    if (r && r.home && typeof r.home === 'object') {
      var user = season.userTeam;
      if (!user || (r.home.abbr !== user && r.away.abbr !== user)) {
        var slim = { id: r.id, home: r.home.abbr, away: r.away.abbr, hs: r.home.pts, as: r.away.pts, date: r.date };
        if (r.playoff) slim.playoff = true;
        season.boxScores[oldF] = slim;
      }
    }
  }

  function remainingGames(season, abbr) {
    var n = 0;
    for (var i = season.day; i < season.days.length; i++) {
      season.days[i].games.forEach(function (g) { if (!g.played && (g.home === abbr || g.away === abbr)) n++; });
    }
    return n;
  }

  function playGame(season, league, by, g, rng, isPlayoff, dayDate) {
    var res = simGame(teamObj(season, league, by, g.home), teamObj(season, league, by, g.away), rng,
      { injuries: season.injuries, norms: season.norms });
    res.id = g.id; res.date = dayDate;
    if (isPlayoff) res.playoff = true;
    g.played = true; g.hs = res.home.pts; g.as = res.away.pts;
    var statMap = isPlayoff ? season.playoffStats : season.playerStats;
    res.home.box.forEach(function (r) { addLine(statMap, r); });
    res.away.box.forEach(function (r) { addLine(statMap, r); });
    if (!isPlayoff) recordStanding(season, g.home, g.away, res.home.pts, res.away.pts);
    var fresh = {};
    res.injuries.forEach(function (inj) { fresh[inj.id] = 1; });
    countDownInjuries(season, g.home, by, fresh);
    countDownInjuries(season, g.away, by, fresh);
    res.injuries.forEach(function (inj) {
      if (inj.games >= 999) {
        // out for the season: the rest of the team's schedule plus a full playoff run
        inj.games = remainingGames(season, inj.team) + 28;
        inj.seasonEnding = true;
      }
      var cur = season.injuries[inj.id];
      if (!cur || cur.games < inj.games) season.injuries[inj.id] = { type: inj.type, games: inj.games };
    });
    storeResult(season, g, res);
    return res;
  }

  function countDownFreeAgents(season, by) {
    // Free agents heal about one game every two days
    if (season.day % 2) return;
    Object.keys(season.injuries).forEach(function (id) {
      var onTeam = false;
      Object.keys(by).forEach(function (a) { if (!onTeam) onTeam = by[a].some(function (p) { return p.id === id; }); });
      if (onTeam) return;
      var e = season.injuries[id];
      if (e.games < 999) { e.games--; if (e.games <= 0) delete season.injuries[id]; }
    });
  }

  function simDays(season, n, rng, league) {
    rng = rng || Math.random;
    league = league || globalLeague();
    if (!league) throw new Error('ENGINE.simDays: no league data');
    if (season.norms) cachedNorms = season.norms;
    var by = rosters(league);
    var out = { gamesPlayed: [], phaseChanged: false, injuries: [], daysPlayed: 0 };
    n = n == null ? 1 : n;
    for (var i = 0; i < n; i++) {
      if (season.phase === 'regular' && season.day >= season.days.length) {
        season.phase = 'playoffs';
        season.playoffs = seedPlayoffs(season);
        out.phaseChanged = true;
      }
      if (season.phase === 'playoffs' && season.day >= season.days.length) {
        if (!schedulePlayoffDay(season)) { finishSeason(season); out.phaseChanged = true; break; }
      }
      if (season.phase === 'done') break;
      var day = season.days[season.day];
      var isPO = !!day.playoff;
      day.games.forEach(function (g) {
        if (g.played) return;
        var res = playGame(season, league, by, g, rng, isPO, day.date);
        out.gamesPlayed.push(res);
        res.injuries.forEach(function (x) { out.injuries.push(x); });
        if (isPO) applyPlayoffResult(season, g, res);
      });
      season.day++;
      out.daysPlayed++;
      countDownFreeAgents(season, by);
      if (season.phase === 'playoffs' && season.playoffs && season.playoffs.champion) {
        finishSeason(season); out.phaseChanged = true; break;
      }
      if (season.phase === 'regular' && season.day >= season.days.length && i === n - 1) {
        // regular season just ended on the last requested day: seed now so the UI sees the bracket
        season.phase = 'playoffs';
        season.playoffs = seedPlayoffs(season);
        out.phaseChanged = true;
      }
    }
    return out;
  }

  function finishSeason(season) {
    season.phase = 'done';
    if (season.playoffs) season.champion = season.playoffs.champion;
  }

  // ---------------------------------------------------------------------------
  // Playoffs
  // ---------------------------------------------------------------------------
  function pct(s) { return s.w + s.l ? s.w / (s.w + s.l) : 0; }
  function rankTeams(season, list) {
    return list.slice().sort(function (a, b) {
      var A = season.standings[a], B = season.standings[b];
      var d = pct(B) - pct(A);
      if (Math.abs(d) > 1e-9) return d;
      d = (B.pf - B.pa) - (A.pf - A.pa);
      if (d) return d;
      return a < b ? -1 : 1;
    });
  }

  function conferenceSeeds(season, conf) {
    var list = season.teams.filter(function (t) { return t.conf === conf; }).map(function (t) { return t.abbr; });
    var ranked = rankTeams(season, list);
    // 2012-13 rule: division winners are guaranteed a top-4 seed
    var divs = {};
    season.teams.forEach(function (t) { if (t.conf === conf) (divs[t.div] = divs[t.div] || []).push(t.abbr); });
    var winners = Object.keys(divs).map(function (d) { return rankTeams(season, divs[d])[0]; });
    // from 2015-16 on, seeds go by record only (win pct, so uneven game counts like 2019-20 work)
    if (winners.length !== 3 || (season.year || 2013) >= 2016) return ranked.slice(0, 8);
    var bestOther = ranked.filter(function (a) { return winners.indexOf(a) < 0; })[0];
    var top4 = rankTeams(season, winners.concat(bestOther ? [bestOther] : []));
    var rest = ranked.filter(function (a) { return top4.indexOf(a) < 0; });
    return top4.concat(rest).slice(0, 8);
  }

  function makeSeries(season, id, conf, round, a, aSeed, b, bSeed, startDay) {
    var hiFirst = rankTeams(season, [a, b])[0] === a;
    return {
      id: id, conf: conf, round: round,
      hi: hiFirst ? a : b, lo: hiFirst ? b : a,
      hiSeed: hiFirst ? aSeed : bSeed, loSeed: hiFirst ? bSeed : aSeed,
      hw: 0, lw: 0, games: [], winner: null, next: startDay
    };
  }

  function buildBracket(season) {
    var seeds = { East: conferenceSeeds(season, 'East'), West: conferenceSeeds(season, 'West') };
    var pairs = [[1, 8], [4, 5], [3, 6], [2, 7]];
    var round1 = [];
    ['East', 'West'].forEach(function (c, ci) {
      pairs.forEach(function (pr, i) {
        var a = seeds[c][pr[0] - 1], b = seeds[c][pr[1] - 1];
        if (!a || !b) return;
        var s = makeSeries(season, c[0] + '1-' + (i + 1), c, 1, a, pr[0], b, pr[1], (i + ci) % 2);
        s.hi = a; s.lo = b; s.hiSeed = pr[0]; s.loSeed = pr[1]; // seed order decides home court in round 1
        round1.push(s);
      });
    });
    var lastDate = season.days.length ? season.days[season.days.length - 1].date : (season.year + '-04-17');
    return {
      seeds: seeds,
      rounds: [round1],
      round: 1,
      champion: null,
      finalsMvp: null,
      startDate: addDays(lastDate, 3),
      cal: 0
    };
  }

  function seedPlayoffs(season) {
    if (season.playoffs && season.phase !== 'regular') return season.playoffs;
    return buildBracket(season);
  }

  function playoffs(season) {
    if (season.playoffs) return season.playoffs;
    return buildBracket(season);
  }

  // Creates the next playoff day in season.days. Returns false when the playoffs are over.
  function schedulePlayoffDay(season) {
    var b = season.playoffs;
    if (!b || b.champion) return false;
    for (var tries = 0; tries < 10; tries++) {
      var round = b.rounds[b.round - 1];
      var games = [];
      round.forEach(function (s) {
        if (s.winner || s.next > b.cal) return;
        var gn = s.hw + s.lw + 1;
        var hiHome = gn === 1 || gn === 2 || gn === 5 || gn === 7;
        var id = 'p' + s.id + '-' + gn;
        games.push({ id: id, home: hiHome ? s.hi : s.lo, away: hiHome ? s.lo : s.hi, played: false, hs: null, as: null, series: s.id, gameNum: gn });
        s.next = b.cal + 2;
      });
      var date = addDays(b.startDate, b.cal);
      b.cal++;
      if (games.length) {
        season.days.push({ date: date, games: games, playoff: true });
        return true;
      }
    }
    return false;
  }

  function findSeries(b, id) {
    for (var r = 0; r < b.rounds.length; r++) for (var i = 0; i < b.rounds[r].length; i++) if (b.rounds[r][i].id === id) return b.rounds[r][i];
    return null;
  }

  function applyPlayoffResult(season, g, res) {
    var b = season.playoffs;
    var s = findSeries(b, g.series);
    if (!s) return;
    s.games.push(g.id);
    if (res.winner === s.hi) s.hw++; else s.lw++;
    if (s.hw === 4) s.winner = s.hi;
    if (s.lw === 4) s.winner = s.lo;
    var round = b.rounds[b.round - 1];
    if (!round.every(function (x) { return x.winner; })) return;
    if (b.round === 4 || round.length === 1) {
      b.champion = round[0].winner;
      b.finalsMvp = finalsMvp(season, round[0]);
      return;
    }
    // next round
    var nextRound = [];
    var startDay = b.cal + 1;
    if (b.round === 3) {
      var e = round.filter(function (x) { return x.conf === 'East'; })[0];
      var w = round.filter(function (x) { return x.conf === 'West'; })[0];
      nextRound.push(makeSeries(season, 'F', 'Finals', 4, e.winner, seedOf(e, e.winner), w.winner, seedOf(w, w.winner), startDay));
    } else {
      ['East', 'West'].forEach(function (c, ci) {
        var list = round.filter(function (x) { return x.conf === c; });
        for (var i = 0; i + 1 < list.length; i += 2) {
          var x = list[i], y = list[i + 1];
          nextRound.push(makeSeries(season, c[0] + (b.round + 1) + '-' + (i / 2 + 1), c, b.round + 1,
            x.winner, seedOf(x, x.winner), y.winner, seedOf(y, y.winner), startDay + ((i / 2 + ci) % 2)));
        }
      });
    }
    b.rounds.push(nextRound);
    b.round++;
  }

  function seedOf(s, abbr) { return s.hi === abbr ? s.hiSeed : s.loSeed; }

  function finalsMvp(season, s) {
    var best = null, bestV = -1;
    s.games.forEach(function (gid) {
      var r = season.boxScores[gid];
      if (!r || typeof r.home !== 'object') return;
      var side = r.home.abbr === s.winner ? r.home : r.away;
      side.box.forEach(function (row) {
        var f = function (k) { return row[k] || 0; };
        var v = f('pts') + 1.2 * (f('oreb') + f('dreb')) + 1.5 * f('ast') + 2 * (f('stl') + f('blk')) - f('tov');
        best = best || {};
        best[row.id] = (best[row.id] || 0) + v;
      });
    });
    if (!best) return null;
    var id = null;
    Object.keys(best).forEach(function (k) { if (best[k] > bestV) { bestV = best[k]; id = k; } });
    return id;
  }

  // ---------------------------------------------------------------------------
  // Convenience
  // ---------------------------------------------------------------------------
  // Full box score for a game: the contract shape with every stat key and player names.
  // Older games that were trimmed come back as { id, home, away, hs, as, date } with slim: true.
  function getBoxScore(season, gameId, league) {
    var r = season.boxScores[gameId];
    if (!r) return null;
    if (typeof r.home !== 'object') return { id: r.id, home: r.home, away: r.away, hs: r.hs, as: r.as, date: r.date, slim: true };
    league = league || globalLeague();
    var names = {};
    if (league && league.players) league.players.forEach(function (p) { names[p.id] = p.name; });
    var out = {};
    Object.keys(r).forEach(function (k) { out[k] = r[k]; });
    ['home', 'away'].forEach(function (side) {
      out[side] = { abbr: r[side].abbr, pts: r[side].pts, box: r[side].box.map(function (row) { return expandRow(row, names); }) };
    });
    out.winner = r.home.pts > r.away.pts ? r.home.abbr : r.away.abbr;
    return out;
  }
  function teamSchedule(season, abbr) {
    var out = [];
    season.days.forEach(function (d, i) {
      d.games.forEach(function (g) { if (g.home === abbr || g.away === abbr) out.push({ dayIndex: i, date: d.date, game: g }); });
    });
    return out;
  }
  function standingsList(season, conf) {
    var list = season.teams.filter(function (t) { return !conf || t.conf === conf; }).map(function (t) { return t.abbr; });
    return rankTeams(season, list).map(function (a) {
      var s = season.standings[a];
      return { abbr: a, w: s.w, l: s.l, pct: pct(s), streak: s.streak };
    });
  }

  var ENGINE = {
    version: 1,
    newSeason: newSeason,
    realSchedule: realSchedule,
    simDays: simDays,
    simGame: simGame,
    playoffs: playoffs,
    seedPlayoffs: seedPlayoffs,
    getBoxScore: getBoxScore,
    teamSchedule: teamSchedule,
    standingsList: standingsList,
    computeNorms: function (league) { return computeNorms(leagueTeamsPlayers(league)); },
    rng: mulberry32,
    STAT_KEYS: STAT_KEYS,
    ATTR_KEYS: ATTR_KEYS,
    tuning: T
  };

  if (typeof window !== 'undefined') window.ENGINE = ENGINE;
  else if (root) root.ENGINE = ENGINE;
  if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
})(typeof self !== 'undefined' ? self : this);
