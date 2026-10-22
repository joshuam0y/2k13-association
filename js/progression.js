// Ratings and progression: window.PROG (and module.exports under Node).
// offseason(state, rng): aging, development toward window.TARGETS for history players,
// a 2K-style age curve toward potential for everyone else, and retirements.
// inSeason(state, rng): one month of small hot and cold streak changes.
(function (root) {
  'use strict';

  var ATTR_KEYS = ['close', 'mid', 'three', 'ft', 'layup', 'dunk', 'post', 'handle', 'pass', 'oreb', 'dreb',
    'steal', 'block', 'perD', 'intD', 'speed', 'vert', 'strength', 'stamina', 'durability', 'oiq', 'diq'];

  // Position weights for the overall, same key order as ATTR_KEYS.
  var POS_WEIGHTS = {
    PG: [0.6, 1.0, 1.2, 0.5, 1.0, 0.3, 0.1, 1.6, 1.6, 0.1, 0.3, 1.0, 0.1, 1.1, 0.1, 1.3, 0.5, 0.2, 0.6, 0.3, 1.3, 0.8],
    SG: [0.7, 1.2, 1.4, 0.6, 1.1, 0.6, 0.2, 1.1, 0.8, 0.2, 0.4, 1.0, 0.2, 1.1, 0.2, 1.1, 0.7, 0.3, 0.6, 0.3, 1.2, 0.8],
    SF: [0.9, 1.1, 1.1, 0.5, 1.0, 0.8, 0.5, 0.8, 0.7, 0.5, 0.7, 0.8, 0.5, 1.0, 0.6, 0.9, 0.8, 0.6, 0.6, 0.3, 1.1, 0.9],
    PF: [1.2, 0.8, 0.5, 0.4, 0.8, 0.9, 1.0, 0.3, 0.4, 1.1, 1.3, 0.4, 1.0, 0.4, 1.2, 0.4, 0.7, 1.1, 0.5, 0.3, 1.0, 1.0],
    C: [1.3, 0.4, 0.2, 0.3, 0.6, 1.0, 1.1, 0.1, 0.3, 1.3, 1.5, 0.3, 1.4, 0.2, 1.5, 0.3, 0.6, 1.3, 0.5, 0.3, 0.9, 1.1]
  };
  var PHYSICAL = { speed: 1, vert: 1, stamina: 1, durability: 1, strength: 0.5 };
  var CRAFT = { three: 1, mid: 1, ft: 1, pass: 1, oiq: 1, diq: 1, post: 0.5 };

  var OVR_MIN = 35, OVR_MAX = 99, ATTR_MIN = 25, ATTR_MAX = 99;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
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
  function gauss(rng) {
    var u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function makeRng(state, rng, salt) {
    if (typeof rng === 'function') return rng;
    var seed = ((state && state.rngSeed) || 12345) ^ Math.imul((state && state.year) || 2013, 2654435761) ^ (salt || 0);
    return mulberry32(seed);
  }
  function primaryPos(pos) {
    var p = String(pos || 'SF').toUpperCase().split(/[-\/ ,]/)[0];
    if (p === 'G') return 'SG';
    if (p === 'F') return 'SF';
    return POS_WEIGHTS[p] ? p : 'SF';
  }
  function teamsOf(state) { return (state && state.teams) || {}; }
  function isNbaTeam(state, abbr) { return !!(abbr && teamsOf(state)[abbr]); }
  function targets() { return root.TARGETS || null; }
  function addTransaction(state, t) { if (state) (state.transactions = state.transactions || []).push(t); }
  function addNews(state, n) { if (state) (state.news = state.news || []).push(n); }

  // Position-weighted mean of the attributes (raw, before the player's own calibration offset).
  function weightedOvr(attrs, pos) {
    if (!attrs) return null;
    var w = POS_WEIGHTS[primaryPos(pos)], s = 0, ws = 0;
    for (var i = 0; i < ATTR_KEYS.length; i++) {
      var v = attrs[ATTR_KEYS[i]];
      if (v == null) continue;
      s += w[i] * v; ws += w[i];
    }
    return ws ? s / ws : null;
  }

  // Scales a player's attributes so the position-weighted overall moves by the same amount
  // as the overall, then sets p.ovr. The player's own offset (ovr minus weighted mean) is kept,
  // so the 2K13 calibration of each player survives every change.
  function setOvr(p, target, opts) {
    opts = opts || {};
    target = Math.round(clamp(target, OVR_MIN, OVR_MAX));
    if (!p.attrs) { p.ovr = target; return p; }
    var cur = weightedOvr(p.attrs, p.pos);
    var offset = (p.ovr != null ? p.ovr : cur) - cur;
    var want = target - offset;
    var age = p.age || 25;
    var base = {};
    ATTR_KEYS.forEach(function (k) { base[k] = p.attrs[k] != null ? p.attrs[k] : 50; });
    var declining = want < cur;
    function tilt(k) {
      if (declining && age >= 30) return 1 + 0.7 * (PHYSICAL[k] || 0) - 0.5 * (CRAFT[k] || 0);
      if (!declining && age <= 23) return 1 + 0.3 * (CRAFT[k] || 0) - 0.3 * (PHYSICAL[k] || 0);
      return 1;
    }
    var tilts = {};
    ATTR_KEYS.forEach(function (k) { tilts[k] = tilt(k); });
    function build(kf, round) {
      var a = {};
      ATTR_KEYS.forEach(function (k) {
        var v = base[k] * (1 + (kf - 1) * tilts[k]);
        v = clamp(v, ATTR_MIN, ATTR_MAX);
        a[k] = round ? Math.round(v) : v;
      });
      return a;
    }
    // Bisection on the scale factor (weighted mean is monotonic in it)
    var lo = 0.3, hi = 2.5;
    for (var it = 0; it < 40; it++) {
      var mid = (lo + hi) / 2;
      if (weightedOvr(build(mid, false), p.pos) < want) lo = mid; else hi = mid;
    }
    var next = build((lo + hi) / 2, true);
    Object.keys(p.attrs).forEach(function (k) { if (next[k] == null) next[k] = p.attrs[k]; });
    p.attrs = next;
    p.ovr = target;
    if (opts.keepPot !== true && p.pot != null && p.pot < target) p.pot = target;
    return p;
  }

  // ---------------------------------------------------------------------------
  // Targets
  // ---------------------------------------------------------------------------
  function targetInfo(id) {
    var T = targets();
    var t = T && T[id];
    if (!t) return null;
    var years = Object.keys(t).filter(function (k) { return /^\d{4}$/.test(k) && t[k] != null; })
      .map(Number).sort(function (a, b) { return a - b; });
    if (!years.length && t.retire == null) return null;
    return { t: t, years: years, first: years[0], last: years[years.length - 1], retire: t.retire != null ? +t.retire : null };
  }
  // Target overall for a season (season-ending year). Interpolates gaps; null outside the known range.
  function targetFor(info, year) {
    if (!info || !info.years.length) return null;
    var t = info.t;
    if (t[year] != null) return +t[year];
    if (year < info.first || year > info.last) return null;
    var a = info.first, b = info.last;
    info.years.forEach(function (y) { if (y < year && y > a) a = y; if (y > year && y < b) b = y; });
    return +t[a] + (+t[b] - +t[a]) * (year - a) / (b - a);
  }

  // ---------------------------------------------------------------------------
  // Age curve (players without a history target for the season)
  // ---------------------------------------------------------------------------
  function ageCurveDelta(age, ovr, pot, rng) {
    var gap = Math.max(0, (pot || ovr) - ovr), mean, sd;
    if (age <= 20) { mean = 0.5 + gap * 0.28; sd = 2.2; }
    else if (age <= 22) { mean = 0.4 + gap * 0.26; sd = 2.1; }
    else if (age <= 24) { mean = 0.2 + gap * 0.24; sd = 1.9; }
    else if (age <= 26) { mean = gap * 0.22; sd = 1.7; }
    else if (age <= 28) { mean = gap * 0.18; sd = 1.5; }
    else if (age <= 30) { mean = -0.4 + gap * 0.1; sd = 1.5; }
    else if (age <= 32) { mean = -1.5; sd = 1.5; }
    else if (age <= 34) { mean = -2.6; sd = 1.6; }
    else if (age <= 36) { mean = -4.0; sd = 1.8; }
    else { mean = -5.5; sd = 2.0; }
    var d = mean + gauss(rng) * sd;
    // Occasional breakout or bust for young players
    if (age <= 25 && rng() < 0.05) d += (rng() < 0.55 ? 1 : -1) * (3 + rng() * 3);
    return d;
  }
  function adjustPot(p, age, rng, isHistory) {
    if (isHistory) { if (p.pot == null || p.pot < p.ovr) p.pot = p.ovr; return; }
    var pot = p.pot != null ? p.pot : p.ovr;
    if (age <= 25) pot += Math.round(gauss(rng) * 1.2);
    if (age >= 30) pot = p.ovr;
    else if (age >= 27) pot = Math.min(pot, p.ovr + 3);
    p.pot = clamp(Math.max(pot, p.ovr), OVR_MIN, OVR_MAX);
  }

  // ---------------------------------------------------------------------------
  // Retirement
  // ---------------------------------------------------------------------------
  function ageRetireChance(age, ovr, unsigned) {
    var table = { 30: 0.02, 31: 0.04, 32: 0.07, 33: 0.12, 34: 0.2, 35: 0.32, 36: 0.45, 37: 0.6, 38: 0.72, 39: 0.85, 40: 0.92 };
    var p = age < 30 ? 0 : (age > 40 ? 1 : table[age]);
    if (ovr >= 85) p *= 0.2; else if (ovr >= 80) p *= 0.4; else if (ovr >= 75) p *= 0.7;
    else if (ovr < 55) p *= 2.5; else if (ovr < 62) p *= 1.5;
    if (unsigned) {
      if (age >= 25 && ovr < 62) p += 0.35;
      else if (age >= 23 && ovr < 55) p += 0.3;
      else if (age >= 31) p += 0.15;
    }
    return clamp(p, 0, 1);
  }
  // seasonDone = the season just finished (season-ending year)
  function historyRetireChance(info, seasonDone, p) {
    // TARGETS retire = first season not played, so r is his last real season
    var r = info.retire != null ? info.retire - 1 : null;
    if (r == null) {
      if (info.last != null && seasonDone >= info.last) return null; // past the data: use the age model
      return 0;
    }
    var d = seasonDone - r, ch;
    if (d < -1) ch = 0;
    else if (d === -1) ch = (p.age || 0) >= 33 ? 0.1 : 0.03;
    else if (d === 0) ch = 0.8;
    else ch = 1;
    if (p.ovr >= 85) ch *= 0.05; else if (p.ovr >= 80) ch *= 0.15;
    // The sim made him much worse than he really was: he leaves earlier
    var t = targetFor(info, seasonDone);
    if (t != null && p.ovr < t - 8 && (p.age || 0) >= 30) ch = Math.max(ch, 0.25);
    return clamp(ch, 0, 1);
  }
  function retire(state, p, year) {
    p.retired = true;
    p.retiredYear = year;
    p.lastTeam = p.team;
    p.team = 'RET';
    p.injury = null;
    p.stashedUntil = null;
    p.contract = { salaries: [], option: null, rookie: false, twoWay: false, signedYear: p.contract && p.contract.signedYear || null };
    var day = state.day || 0;
    addTransaction(state, { year: year, day: day, type: 'retire', text: p.name + ' retired' + (p.lastTeam && p.lastTeam !== 'FA' ? ' (' + p.lastTeam + ')' : '') + ' at ' + p.age + '.', ids: [p.id] });
    if (p.ovr >= 78 || (p.awards && p.awards.length >= 3)) {
      addNews(state, { year: year, day: day, headline: p.name + ' retires', body: p.name + ' announced his retirement at age ' + p.age + ', after ' + (p.yearsPro || 'many') + ' seasons.', ids: [p.id] });
    }
  }

  // ---------------------------------------------------------------------------
  // Offseason
  // ---------------------------------------------------------------------------
  var OFFSEASON_PHASES = { playoffs: 1, draftLottery: 1, draft: 1, resign: 1, freeAgency: 1, training: 1 };
  function seasonAhead(state) {
    // Before the year rolls over (offseason phases) the next season is year + 1.
    return OFFSEASON_PHASES[state.phase] ? state.year + 1 : state.year;
  }
  function draftedThisSummer(p, seasonDone) {
    if (p.team === 'DRAFT') return true;
    if (p.draft && p.draft.year === seasonDone) return true;
    if (p.draftYear === seasonDone && !p.yearsPro) return true;
    return false;
  }

  function retireRoll(state, p, seasonDone, rng) {
    var info = targetInfo(p.id);
    var age = (p.age || 22) + 1; // his age next season
    var ch = info ? historyRetireChance(info, seasonDone, p) : null;
    if (ch == null) ch = ageRetireChance(age, p.ovr - (p.form || 0), !isNbaTeam(state, p.team));
    if (p.stashedUntil) ch *= 0.2; // rights held, still overseas
    return ch > 0 && rng() < ch;
  }

  // Retirements for the summer after seasonDone. Runs once per summer: DRAFT.lottery calls it right
  // after the season (so teams can replace retirees in free agency); offseason() runs it if nobody did.
  function retirements(state, rng, opts) {
    opts = opts || {};
    rng = makeRng(state, rng, 0x77);
    var done = opts.seasonDone != null ? opts.seasonDone : (OFFSEASON_PHASES[state.phase] ? state.year : state.year - 1);
    state.prog = state.prog || {};
    var out = [];
    if (state.prog.lastRetire != null && state.prog.lastRetire >= done && !opts.force) return out;
    state.prog.lastRetire = done;
    var players = state.players || {};
    Object.keys(players).forEach(function (id) {
      var p = players[id];
      if (!p || p.retired || p.team === 'RET' || draftedThisSummer(p, done)) return;
      if (retireRoll(state, p, done, rng)) { retire(state, p, done); out.push(id); }
    });
    return out;
  }

  // opts.year: the season being prepared (season-ending year); default from state.phase.
  function offseason(state, rng, opts) {
    opts = opts || {};
    rng = makeRng(state, rng, 0x51);
    var next = opts.year != null ? opts.year : seasonAhead(state);
    var done = next - 1;
    state.prog = state.prog || {};
    var out = { year: next, retired: [], changes: [] };
    if (state.prog.lastOffseason != null && state.prog.lastOffseason >= next && !opts.force) return out;
    state.prog.lastOffseason = next;
    out.retired = retirements(state, rng, { seasonDone: done, force: opts.force });
    var players = state.players || {};
    Object.keys(players).forEach(function (id) {
      var p = players[id];
      if (!p || p.retired || p.team === 'RET') return;
      if (draftedThisSummer(p, done)) return;
      // Remove any in-season streak before developing
      if (p.form) { setOvr(p, p.ovr - p.form, { keepPot: true }); }
      p.form = 0;
      var before = p.ovr;
      p.age = (p.age || 22) + 1;
      var info = targetInfo(id);
      var tgt = info ? targetFor(info, next) : null;
      var newOvr;
      if (tgt != null) {
        var prevT = targetFor(info, done);
        var prevDev = prevT != null ? before - prevT : 0;
        var dev = 0.45 * prevDev + gauss(rng) * 1.4;
        var cap = 4 + 0.5 * Math.max(0, Math.abs(prevDev) - 4);
        dev = clamp(dev, -cap, cap);
        newOvr = tgt + dev;
      } else {
        newOvr = p.ovr + ageCurveDelta(p.age, p.ovr, p.pot, rng);
      }
      setOvr(p, newOvr, { keepPot: true });
      adjustPot(p, p.age, rng, !!info);
      p.formBase = p.ovr;
      if (p.ovr !== before) out.changes.push({ id: id, from: before, to: p.ovr });
      // Stashed players keep their overseas status until they arrive
      if (p.stashedUntil && p.stashedUntil > next) p.injury = { type: 'Playing overseas', games: 999 };
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // In season: one month of streaks (call once per month)
  // ---------------------------------------------------------------------------
  function inSeason(state, rng) {
    rng = makeRng(state, rng, (state.day || 0) * 7919 + 0x99);
    var out = [];
    var players = state.players || {};
    Object.keys(players).forEach(function (id) {
      var p = players[id];
      if (!p || p.retired || !isNbaTeam(state, p.team)) return;
      if (p.stashedUntil && p.stashedUntil > state.year) return; // overseas
      var form = p.form || 0;
      if (rng() < 0.5) return;
      var step = rng() < 0.7 ? 1 : 2;
      var up = rng() < clamp(0.5 - 0.15 * form, 0.1, 0.9);
      var nf = clamp(form + (up ? step : -step), -3, 3);
      if (nf === form) return;
      var before = p.ovr;
      setOvr(p, p.ovr + (nf - form), { keepPot: true });
      p.form = form + (p.ovr - before);
      if (p.ovr !== before) out.push({ id: id, from: before, to: p.ovr });
    });
    return out;
  }

  var PROG = {
    ATTR_KEYS: ATTR_KEYS,
    POS_WEIGHTS: POS_WEIGHTS,
    offseason: offseason,
    inSeason: inSeason,
    retirements: retirements,
    setOvr: setOvr,
    weightedOvr: weightedOvr,
    targetFor: function (id, year) { return targetFor(targetInfo(id), year); },
    ageCurveDelta: ageCurveDelta,
    retireChance: function (p, seasonDone, unsigned) {
      var info = targetInfo(p.id);
      var ch = info ? historyRetireChance(info, seasonDone, p) : null;
      return ch == null ? ageRetireChance((p.age || 22) + 1, p.ovr, unsigned) : ch;
    },
    primaryPos: primaryPos,
    mulberry32: mulberry32,
    gauss: gauss
  };

  if (root) root.PROG = PROG;
  if (typeof module !== 'undefined' && module.exports) module.exports = PROG;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
