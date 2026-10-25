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

  var FORM_MAX = 2;      // in-season streaks move a player at most 2 points either way
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
  // state (optional): a save where an injury-fate player stayed healthy carries his own targets
  // in state.prog.fateTargets[id]; everyone else follows window.TARGETS.
  function targetInfo(id, state) {
    var T = targets();
    var ft = state && state.prog && state.prog.fateTargets;
    var t = (ft && ft[id]) || (T && T[id]);
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
  // Injury fates: careers real injuries derailed. Once per save (deterministic from the seed) each one
  // either follows the real story or stays healthy from the injury season on: his targets hold near the
  // pre-injury level, then age normally, and he retires at a normal age. Never shown in the UI.
  // from = the season (season-ending year) the injury hit.
  // ---------------------------------------------------------------------------
  var INJURY_FATES = {
    bynuman01: { from: 2013, note: 'knees, missed all of 2012-13 and was done after 2013-14' },
    roybr01: { from: 2013, note: 'degenerative knees, retired in 2011, five games for Minnesota in 2012-13' },
    rosede01: { from: 2013, note: 'torn ACL in April 2012, then torn meniscus in 2013-14 and more knee trouble' },
    grangda01: { from: 2013, note: 'knee tendinosis in 2012-13, never the same' },
    thomais02: { from: 2018, note: 'hip injury in 2017-18' },
    walljo01: { from: 2019, note: 'heel surgery and a ruptured Achilles in 2019' },
    couside01: { from: 2018, note: 'ruptured Achilles in January 2018, torn ACL in 2019' },
    thompkl01: { from: 2020, note: 'torn ACL in the 2019 Finals, ruptured Achilles in 2020' },
    duranke01: { from: 2020, note: 'ruptured Achilles in the 2019 Finals, recovered', small: true },
    haywago01: { from: 2018, note: 'broken leg in the 2017-18 opener' },
    parsoch01: { from: 2017, note: 'knee surgeries from 2016 on' },
    georgpa01: { from: 2015, note: 'broken leg in August 2014, recovered', small: true },
    leonaka01: { from: 2018, note: 'quad injury in 2017-18, torn ACL in 2021' },
    willizi01: { from: 2020, note: 'knee and foot injuries from his rookie season on' },
    balllo01: { from: 2022, note: 'knee injury in January 2022, out two full seasons' },
    parkeja01: { from: 2015, note: 'torn ACL in December 2014 and again in 2017' },
    exumda01: { from: 2016, note: 'torn ACL in August 2015' },
    embiijo01: { from: 2015, note: 'foot injuries, missed 2014-15 and 2015-16' },
    // a number 1 pick whose shoulder condition derailed him: the healthy path grows toward his projection
    fultzma01: { from: 2018, note: 'thoracic outlet syndrome in 2017-18', grow: [82, 86], quiet: true },
    // career fate (not an injury): left the NBA in 2015; the other path keeps him playing
    sandela01: { from: 2015, note: 'left the NBA in 2015', type: 'career', chance: 0.4, quiet: true }
  };
  function hashStr(str) {
    var h = 2166136261 >>> 0;
    str = String(str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  // Healthy projection: hold the pre-injury level (young players grow a little), then age normally.
  // Never below what he really did (players who recovered, like Durant, change little).
  function healthyTargets(id, p, fate, rng) {
    var T = targets(), t = T && T[id];
    if (!t || !p) return null;
    var from = fate.from;
    var base = p.draftYear && p.team === 'DRAFT' ? +p.draftYear : 2013;
    var ageAt = function (y) { return (p.age || 22) + (y - base); };
    var before = t[from - 1] != null ? +t[from - 1] : null, at = t[from] != null ? +t[from] : null;
    var L = Math.max(before != null ? before : -1, at != null ? at : -1);
    if (L < 0) L = p.ovr || 70;
    var star = L >= 85;
    var retireAge = (star ? 34 : 33) + Math.floor(rng() * 3);   // last season played at this age
    var retireH = from + Math.max(1, retireAge - ageAt(from) + 1);
    var out = {};
    Object.keys(t).forEach(function (k) { out[k] = Array.isArray(t[k]) ? t[k].slice() : t[k]; });
    var years = Object.keys(t).filter(function (k) { return /^\d{4}$/.test(k); }).map(Number);
    var lastReal = years.length ? Math.max.apply(null, years) : from;
    var end = Math.max(lastReal, Math.min(2026, retireH - 1));
    var young = ageAt(from) <= 22;
    var v = L, goal = fate.grow ? fate.grow[0] + rng() * (fate.grow[1] - fate.grow[0]) : null;
    for (var y = from; y <= end; y++) {
      var a = ageAt(y);
      if (y > from && goal != null && a <= 25) v += Math.max(0, (goal - v) * 0.4);   // develops like a top pick
      // hold the pre-injury level (only a very young player still grows a little), then age normally
      else if (y > from) v += a <= 25 && young ? 1 : a <= 29 ? 0 : a === 30 ? -1 : a <= 32 ? -1.5 : a <= 34 ? -2.5 : -3.5;
      v = Math.min(v, goal != null ? goal : young ? L + 4 : L);
      var real = t[y] != null ? +t[y] : null;
      out[y] = Math.round(Math.max(real != null ? real : 0, Math.min(99, v)));
    }
    if (Array.isArray(out.out)) { out.out = out.out.filter(function (y) { return y < from; }); if (!out.out.length) delete out.out; }
    if (t.retire != null) out.retire = Math.max(+t.retire, retireH);
    return out;
  }
  // Rolls every injury fate once for a new save. Sets p.fate = "healthy" | "real" and, for healthy ones,
  // state.prog.fateTargets[id]. Clears a real 2012-13 injury and an injury redshirt for healthy players.
  function rollFates(state) {
    state.prog = state.prog || {};
    if (state.prog.fatesRolled) return state.prog.fateTargets || {};
    state.prog.fatesRolled = true;
    state.prog.fateTargets = state.prog.fateTargets || {};
    var players = state.players || {};
    Object.keys(INJURY_FATES).forEach(function (id) {
      var p = players[id], fate = INJURY_FATES[id];
      if (!p || p.retired) return;
      var r = mulberry32(hashStr((state.rngSeed || 1) + ':fate:' + id));
      if (r() >= (fate.chance != null ? fate.chance : 0.5)) { p.fate = 'real'; return; }
      var ht = healthyTargets(id, p, fate, r);
      if (!ht) { p.fate = 'real'; return; }
      p.fate = 'healthy';
      state.prog.fateTargets[id] = ht;
      var peak = 0;
      Object.keys(ht).forEach(function (k) { if (/^\d{4}$/.test(k)) peak = Math.max(peak, +ht[k]); });
      if (peak && (p.pot == null || p.pot < peak)) p.pot = Math.min(99, peak);
      if (fate.from <= (state.year || 2013) && p.injury && p.injury.type !== 'Playing overseas') p.injury = null;
      // a prospect who really sat out his first seasons hurt arrives on time
      if (p.team === 'DRAFT' && p.arrivalYear != null && p.draftYear != null && fate.from <= +p.draftYear + 1) p.arrivalYear = +p.draftYear + 1;
    });
    return state.prog.fateTargets;
  }
  // News when a healthy fate matters: he played the season his real injury took away.
  function fateNews(state, year) {
    var out = [], ps = (state.season && state.season.playerStats) || {};
    Object.keys(INJURY_FATES).forEach(function (id) {
      var p = state.players && state.players[id], fate = INJURY_FATES[id], T = targets();
      if (!p || p.fate !== 'healthy' || p.retired || fate.small || fate.quiet) return;
      var real = T && T[id], st = ps[id];
      var hurtYear = year === fate.from || (real && Array.isArray(real.out) && real.out.indexOf(year) >= 0);
      if (!hurtYear || !st || st.g < 60) return;
      out.push({ headline: p.name + ' plays ' + st.g + ' games', body: p.name + ' stayed healthy all season and played ' + st.g + ' games.', ids: [id] });
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Variety for history players: a persistent personal offset p.prog = { drift, boost }.
  // drift: a random walk each offseason, pulled back toward 0, clamped to +-6.
  // boost: breakouts and stalls, which fade slowly, clamped to +-10.
  // Playing time (25 and under) and major injuries move drift for everyone (fictional players too).
  // ---------------------------------------------------------------------------
  var SETTINGS = { variety: true };   // PROG.settings.variety = false: careers follow history with tiny noise
  var DRIFT_SD = 1.2, DRIFT_MEAN = 0.2, DRIFT_PULL = 0.7, DRIFT_PULL_UP = 0.7, DRIFT_MAX = 6, BOOST_KEEP = 0.9, BOOST_MAX = 8, STAR = 90, STAR_CAP = 2;
  var MAJOR_INJURY = /ACL|Achilles|Patellar/i;
  function seasonContext(state, done) {
    var season = state.season && (state.season.year == null || +state.season.year === done) ? state.season : null;
    var teamGames = 0;
    if (season && season.standings) Object.keys(season.standings).forEach(function (a) { var s = season.standings[a]; teamGames = Math.max(teamGames, (s.w || 0) + (s.l || 0)); });
    var gl = state.gleague && +state.gleague.year === done ? state.gleague.stats || {} : {};
    return { stats: (season && season.playerStats) || {}, gl: gl, inj: (season && season.injuryLog) || {}, teamGames: teamGames || 82, has: !!(season && season.playerStats && Object.keys(season.playerStats).length) };
  }
  // Drift change from last season's minutes (25 and under) and injuries. age = his age during that season.
  function seasonEffects(state, p, id, age, C, rng) {
    var out = { pt: 0, inj: 0, major: false };
    if (!C.has) return out;
    var lg = C.inj[id];
    if (lg && (lg.games >= 40 || lg.total >= 40 || MAJOR_INJURY.test(lg.type || ''))) {
      out.major = true;
      out.inj = -((age >= 30 ? 2 : 1) + rng() * 2);
    }
    if (age <= 25 && !(p.stashedUntil && +p.stashedUntil > (state.year || 0))) {
      var st = C.stats[id], g2 = C.gl[id];
      var nbaMin = st ? +st.min || 0 : 0, glMin = g2 ? +g2.min || 0 : 0;
      var missed = lg ? Math.min(C.teamGames, lg.total || lg.games || 0) : 0;
      var avail = Math.max(10, C.teamGames - missed);
      var mpg = (nbaMin + 0.5 * glMin) / avail;
      var played = (st && st.g) || (g2 && g2.g) || isNbaTeam(state, p.team);
      if (played && mpg >= 24) out.pt = 0.5 + Math.min(0.5, (mpg - 24) / 20);
      else if (played && mpg < 10 && !out.major) out.pt = -(0.75 + Math.min(0.75, (10 - mpg) / 13));
    }
    return out;
  }
  function peakYear(info) {
    var best = null, by = null;
    info.years.forEach(function (y) { var v = +info.t[y]; if (best == null || v > best) { best = v; by = y; } });
    return by;
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
  // seasonDone = the season just finished (season-ending year).
  // Real retirements happen in the real summer: TARGETS retire is the first season he did not play,
  // so retire - 1 is his last real season. Nobody keeps playing past it unless the sim has made him
  // clearly better than he really was, and even then only for a season or two.
  function historyRetireChance(info, seasonDone, p) {
    var r = info.retire != null ? info.retire - 1 : null;
    if (r == null) {
      if (info.last != null && seasonDone >= info.last) return null; // past the data: use the age model
      return 0;
    }
    var d = seasonDone - r, ch;
    var real = targetFor(info, Math.min(seasonDone, r));   // how good he really was at that point
    var better = real != null ? p.ovr - real : 0;           // positive: the sim made him better
    if (d < -1) ch = 0;
    else if (d === -1) ch = (p.age || 0) >= 34 ? 0.08 : 0.02;
    else if (d === 0) ch = 0.96;
    else ch = 1;
    if (d >= 0 && better >= 6) ch = d === 0 ? 0.45 : d === 1 ? 0.75 : 1;
    // his personal arc: well below his real self may retire a year early, well above a year late
    var off = p.prog ? (p.prog.drift || 0) + (p.prog.boost || 0) : 0;
    if (off <= -4 && d === -1) ch = Math.max(ch, 0.2);
    if (off >= 4 && d === 0 && better < 6) ch = Math.min(ch, 0.75);
    if (d < 0 && better > 2) ch *= 0.5;
    // The sim made him much worse than he really was: he leaves earlier
    if (real != null && better < -8 && (p.age || 0) >= 30) ch = Math.max(ch, 0.25);
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
    var info = targetInfo(p.id, state);
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
    if (!state.prog.fatesRolled) rollFates(state);
    var C = seasonContext(state, done);
    // Before and after numbers for the progression page: { id: [old, new, age] } (no potential)
    var report = { year: next, players: {}, rookies: [] };
    Object.keys(players).forEach(function (id) {
      var p = players[id];
      if (!p || p.retired || p.team === 'RET') return;
      if (draftedThisSummer(p, done)) {
        if (isNbaTeam(state, p.team)) report.rookies.push(id);
        return;
      }
      var shown = p.ovr;
      // Remove any in-season streak before developing
      if (p.form) { setOvr(p, p.ovr - p.form, { keepPot: true }); }
      p.form = 0;
      var before = p.ovr;
      var seasonAge = p.age || 22;
      p.age = seasonAge + 1;
      var info = targetInfo(id, state);
      var tgt = info ? targetFor(info, next) : null;
      var eff = SETTINGS.variety ? seasonEffects(state, p, id, seasonAge, C, rng) : { pt: 0, inj: 0 };
      var newOvr;
      if (tgt != null && !SETTINGS.variety) {
        // no-variance mode (tests and comparisons): stay close to the real arc
        var prevT = targetFor(info, done), prevDev = prevT != null ? before - prevT : 0;
        newOvr = tgt + clamp(0.3 * prevDev + gauss(rng) * 0.8, -2.5, 2.5);
      } else if (tgt != null) {
        // History as a guide, with real variety: real target + personal drift + breakouts + small noise
        var pr = p.prog = p.prog || { drift: 0, boost: 0 };
        var d0 = pr.drift || 0;
        pr.drift = clamp(d0 * (d0 > 0 ? DRIFT_PULL_UP : DRIFT_PULL) + DRIFT_MEAN + gauss(rng) * DRIFT_SD + eff.pt + eff.inj, -DRIFT_MAX, DRIFT_MAX);   // the small mean offsets injuries and the star cap
        var star = tgt >= STAR, capped = star || p.fate === 'healthy';
        // stars and healthy-fate players: positive drift pulled back hard
        if (capped && pr.drift > STAR_CAP) pr.drift = STAR_CAP + (pr.drift - STAR_CAP) * 0.3;
        pr.boost = (pr.boost || 0) * BOOST_KEEP;
        var py = peakYear(info);
        var young = p.age <= 25 && !star && (py == null || next <= py + 1);
        if (young && rng() < 0.025) pr.boost += 4 + rng() * 3;                                   // breakout
        else if (young && (p.pot || 0) >= 82 && (p.pot - p.ovr) >= 4 && rng() < 0.03) pr.boost -= 4 + rng() * 3; // stall
        pr.boost = clamp(pr.boost, -BOOST_MAX, BOOST_MAX);
        if (star && pr.boost > 0) pr.boost = 0;
        var off = pr.drift + pr.boost;
        if (off < 0 && star) off *= 0.6;   // stars stay stars
        newOvr = tgt + off + gauss(rng) * 0.6;
        // never more than 2 above the real rating once he is a 90+ player, or on a healthy-fate path
        if (capped) newOvr = Math.min(newOvr, tgt + STAR_CAP);
      } else {
        newOvr = p.ovr + ageCurveDelta(p.age, p.ovr, p.pot, rng) + eff.pt + eff.inj;
      }
      setOvr(p, newOvr, { keepPot: true });
      adjustPot(p, p.age, rng, !!info);
      p.formBase = p.ovr;
      if (p.ovr !== before) out.changes.push({ id: id, from: before, to: p.ovr });
      if (p.team !== 'DRAFT') report.players[id] = [shown, p.ovr, p.age];
      // Stashed players keep their overseas status until they arrive
      if (p.stashedUntil && p.stashedUntil > next) p.injury = { type: 'Playing overseas', games: 999 };
    });
    state.progressReport = report;
    out.report = report;
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
      var step = rng() < 0.8 ? 1 : 2;
      var up = rng() < clamp(0.5 - 0.15 * form, 0.1, 0.9);
      var nf = clamp(form + (up ? step : -step), -FORM_MAX, FORM_MAX);
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
    targetFor: function (id, year, state) { return targetFor(targetInfo(id, state), year); },
    targetsOf: function (state, id) { var i = targetInfo(id, state); return i ? i.t : null; },
    settings: SETTINGS,
    rollFates: rollFates,
    fateNews: fateNews,
    INJURY_FATES: INJURY_FATES,
    ageCurveDelta: ageCurveDelta,
    retireChance: function (p, seasonDone, unsigned, state) {
      var info = targetInfo(p.id, state);
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
