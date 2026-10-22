// 2K13 Association: head coaches (window.COACH).
// Classic script, plain JS, no libraries. Also module.exports under Node.
// Data comes from data/coaches.js (window.COACHES). Coaches live in state.coaches = { [id]: Coach },
// and each team points at its coach with team.coach = coachId (contract-v2).
(function (root) {
  'use strict';

  var MAX_EFFECT = 0.03;   // a coach moves things by 3 percent at most
  var NEUTRAL = 70;        // a rating of 70 is a neutral coach

  function data() {
    if (typeof window !== 'undefined' && window.COACHES) return window.COACHES;
    if (root && root.COACHES) return root.COACHES;
    if (typeof require === 'function') { try { return require('../data/coaches.js'); } catch (e) { /* ignore */ } }
    return { start: [], pool: [], startByTeam: {}, firstNames: ['Sam'], lastNames: ['Coach'] };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function round3(x) { return Math.round(x * 1000) / 1000; }
  function copy(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }
  function rngOf(r) { return typeof r === 'function' ? r : Math.random; }
  function yearOf(state) { return (state && state.year) || 2013; }

  function ovr(c) {
    if (!c) return 0;
    return Math.round(0.3 * c.offense + 0.3 * c.defense + 0.2 * c.development + 0.2 * c.motivation);
  }
  function age(c, year) { return c && c.born ? year - c.born : 50; }

  function makeCoach(src, status) {
    var c = copy(src);
    c.status = status;                 // "employed" | "free" | "retired"
    c.team = status === 'employed' ? src.team : null;
    c.hiredYear = status === 'employed' ? (src.since || 2013) : null;
    c.available = src.available || 1900;
    c.seasons = [];                    // [{ year, team, w, l }]
    c.firedYears = [];
    c.ovr = ovr(c);
    return c;
  }

  // Builds state.coaches and sets team.coach for every team. Safe to call more than once.
  function init(state) {
    if (!state) return state;
    var d = data();
    if (!state.coaches) {
      state.coaches = {};
      d.start.forEach(function (c) { state.coaches[c.id] = makeCoach(c, 'employed'); });
      d.pool.forEach(function (c) { state.coaches[c.id] = makeCoach(c, 'free'); });
    }
    var teams = state.teams || {};
    Object.keys(teams).forEach(function (abbr) {
      var t = teams[abbr];
      if (t.coach && state.coaches[t.coach]) return;
      var id = d.startByTeam[abbr];
      if (id && state.coaches[id] && state.coaches[id].status !== 'retired' &&
          (!state.coaches[id].team || state.coaches[id].team === abbr)) {
        place(state, abbr, id, state.coaches[id].hiredYear || yearOf(state));
      } else {
        var best = available(state, yearOf(state))[0] || generate(state, yearOf(state), Math.random);
        place(state, abbr, best.id, yearOf(state));
      }
    });
    return state;
  }

  function place(state, abbr, id, year) {
    var c = state.coaches[id];
    c.status = 'employed'; c.team = abbr; c.hiredYear = year;
    if (state.teams && state.teams[abbr]) state.teams[abbr].coach = id;
  }

  function of(state, abbr) {
    if (!state || !state.coaches) return null;
    var t = state.teams && state.teams[abbr];
    var id = t && t.coach;
    if (id && state.coaches[id]) return state.coaches[id];
    var found = null;
    Object.keys(state.coaches).forEach(function (k) {
      var c = state.coaches[k];
      if (!found && c.status === 'employed' && c.team === abbr) found = c;
    });
    return found;
  }

  function scale(r) { return clamp((r - NEUTRAL) / (99 - NEUTRAL), -1, 1) * MAX_EFFECT; }

  // Small modifiers for the engine and progression: { offense, defense, development, morale }, each within +-3 percent.
  function effect(state, abbr) {
    var c = of(state, abbr);
    if (!c) return { offense: 0, defense: 0, development: 0, morale: 0 };
    var t = state.teams && state.teams[abbr];
    var budget = t && t.budget && typeof t.budget.coaching === 'number' ? t.budget.coaching : 50;
    var b = clamp((budget - 50) / 50, -1, 1) * 0.005;   // the coaching budget adds half a percent at most
    function f(v, extra) { return round3(clamp(scale(v) + (extra || 0), -MAX_EFFECT, MAX_EFFECT)); }
    return {
      offense: f(c.offense),
      defense: f(c.defense),
      development: f(c.development, b),
      morale: f(c.motivation)
    };
  }

  // Free coaches who can be hired this year, best first.
  function available(state, year) {
    year = year || yearOf(state);
    if (!state || !state.coaches) return [];
    return Object.keys(state.coaches).map(function (k) { return state.coaches[k]; }).filter(function (c) {
      return c.status === 'free' && (c.available || 0) <= year;
    }).sort(function (a, b) { return ovr(b) - ovr(a); });
  }

  function log(state, text, ids) {
    if (!state.transactions) return;
    state.transactions.push({ year: yearOf(state), day: state.day || 0, type: 'coach', text: text, ids: ids || [] });
  }

  function teamName(state, abbr) {
    var t = state.teams && state.teams[abbr];
    return t && t.name ? (t.city ? t.city + ' ' : '') + t.name : abbr;
  }

  function fire(state, abbr) {
    var c = of(state, abbr);
    if (!c) return { ok: false, reason: 'No head coach to fire.' };
    c.status = 'free'; c.team = null; c.hiredYear = null;
    c.firedYears.push(yearOf(state));
    if (state.teams && state.teams[abbr]) state.teams[abbr].coach = null;
    log(state, 'The ' + teamName(state, abbr) + ' fired head coach ' + c.name + '.', [c.id]);
    return { ok: true, coach: c.id };
  }

  function hire(state, abbr, coachId) {
    var c = state.coaches && state.coaches[coachId];
    if (!c) return { ok: false, reason: 'Unknown coach.' };
    if (c.status === 'retired') return { ok: false, reason: c.name + ' has retired.' };
    if (c.status === 'employed' && c.team !== abbr) return { ok: false, reason: c.name + ' is under contract with ' + c.team + '.' };
    if ((c.available || 0) > yearOf(state)) return { ok: false, reason: c.name + ' is not available yet.' };
    var cur = of(state, abbr);
    if (cur && cur.id === coachId) return { ok: true, coach: coachId };
    if (cur) fire(state, abbr);
    place(state, abbr, coachId, yearOf(state));
    log(state, 'The ' + teamName(state, abbr) + ' hired ' + c.name + ' as head coach.', [c.id]);
    return { ok: true, coach: coachId };
  }

  // Adds each coach's regular season record from state.season.standings (once per year).
  function recordSeason(state) {
    if (!state || !state.coaches || !state.season || !state.season.standings) return;
    var year = state.season.year || yearOf(state);
    Object.keys(state.season.standings).forEach(function (abbr) {
      var c = of(state, abbr), s = state.season.standings[abbr];
      if (!c || !s) return;
      if (c.seasons.some(function (x) { return x.year === year; })) return;
      c.seasons.push({ year: year, team: abbr, w: s.w || 0, l: s.l || 0 });
    });
  }

  function tenure(state, c) { return c.hiredYear ? yearOf(state) - c.hiredYear + 1 : 0; }

  // Team strength from the roster (top eight overalls), used for expectations.
  function rosterStrength(state, abbr) {
    var list = [];
    var ps = state.players || {};
    Object.keys(ps).forEach(function (id) {
      var p = ps[id];
      if (p && p.team === abbr && !p.retired && !p.gleague) list.push(p.ovr || 0);
    });
    list.sort(function (a, b) { return b - a; });
    var top = list.slice(0, 8);
    if (!top.length) return 0;
    var w = [1.4, 1.3, 1.2, 1.1, 1, 0.8, 0.6, 0.5], s = 0, ws = 0;
    top.forEach(function (v, i) { s += v * w[i]; ws += w[i]; });
    return s / ws;
  }

  function expectedPct(state, abbr) {
    var teams = Object.keys((state.season && state.season.standings) || state.teams || {});
    if (!teams.length) return 0.5;
    var strength = teams.map(function (a) { return { a: a, s: rosterStrength(state, a) }; });
    strength.sort(function (x, y) { return y.s - x.s; });
    var rank = 0;
    strength.forEach(function (x, i) { if (x.a === abbr) rank = i; });
    return 0.72 - 0.44 * rank / Math.max(1, teams.length - 1);
  }

  function pickCoachFor(state, abbr, rng) {
    var list = available(state, yearOf(state));
    if (list.length < 3) { generate(state, yearOf(state), rng); list = available(state, yearOf(state)); }
    var t = state.teams && state.teams[abbr];
    var rebuild = t && t.direction === 'rebuild';
    var best = null, bestV = -1e9;
    list.forEach(function (c) {
      if (c.firedYears.indexOf(yearOf(state)) >= 0 && list.length > 3) return;   // not the one just let go
      var v = ovr(c) + (rebuild ? (c.development - 75) * 0.4 : (c.offense + c.defense - 150) * 0.2) + rng() * 6;
      if (c.seasons.some(function (x) { return x.team === abbr; }) && list.length > 3) v -= 8;
      if (v > bestV) { bestV = v; best = c; }
    });
    return best || generate(state, yearOf(state), rng);
  }

  // After the regular season: AI teams with bad or disappointing seasons may change coaches.
  // Returns [{ team, fired, hired }].
  function aiChanges(state, rng) {
    rng = rngOf(rng);
    if (!state || !state.coaches) return [];
    recordSeason(state);
    var changes = [];
    var st = (state.season && state.season.standings) || {};
    Object.keys(st).forEach(function (abbr) {
      if (abbr === state.userTeam) return;
      var c = of(state, abbr);
      if (!c) return;
      var s = st[abbr], g = (s.w || 0) + (s.l || 0);
      if (!g) return;
      var pct = s.w / g;
      var gap = expectedPct(state, abbr) - pct;             // positive = underachieved
      var p = 0;
      if (pct < 0.3) p += 0.35; else if (pct < 0.4) p += 0.2; else if (pct < 0.5) p += 0.06;
      if (gap > 0.15) p += 0.3; else if (gap > 0.08) p += 0.15;
      var ten = tenure(state, c);
      if (ten <= 1) p *= 0.3; else if (ten === 2) p *= 0.7;
      if (ovr(c) >= 88) p *= 0.4;
      var prev = c.seasons.filter(function (x) { return x.team === abbr && x.year < (state.season.year || yearOf(state)); });
      var last = prev[prev.length - 1];
      if (last && last.w / Math.max(1, last.w + last.l) < 0.4 && pct < 0.4) p += 0.15;   // hot seat
      if (pct >= 0.6 && gap < 0.05) p = 0.01;
      if (rng() < clamp(p, 0, 0.85)) {
        var old = c.id;
        fire(state, abbr);
        var next = pickCoachFor(state, abbr, rng);
        place(state, abbr, next.id, yearOf(state) + 1);
        log(state, 'The ' + teamName(state, abbr) + ' hired ' + next.name + ' as head coach.', [next.id]);
        changes.push({ team: abbr, fired: old, hired: next.id });
      }
    });
    return changes;
  }

  // Makes a fictional coach (used from 2027 on, or when the free pool runs dry).
  function generate(state, year, rng) {
    rng = rngOf(rng);
    var d = data();
    state.coaches = state.coaches || {};
    var n = 0, id;
    do { id = 'fic' + year + '-' + (n++); } while (state.coaches[id]);
    var fn = d.firstNames[Math.floor(rng() * d.firstNames.length)];
    var ln = d.lastNames[Math.floor(rng() * d.lastNames.length)];
    function r() { return Math.round(52 + rng() * 34); }
    var c = makeCoach({ id: id, name: fn + ' ' + ln, born: year - 38 - Math.floor(rng() * 16),
      offense: r(), defense: r(), development: r(), motivation: r(), available: year, last: null, fictional: true }, 'free');
    state.coaches[id] = c;
    return c;
  }

  // Offseason step: retirements, new fictional coaches after 2026, and vacancies filled.
  function offseason(state, rng) {
    rng = rngOf(rng);
    init(state);
    var year = yearOf(state);
    Object.keys(state.coaches).forEach(function (k) {
      var c = state.coaches[k];
      if (c.status === 'retired') return;
      var a = age(c, year);
      var pastReal = c.last != null && year > c.last + 1;
      if (c.status === 'free' && (pastReal || a >= 72) && rng() < 0.6) c.status = 'retired';
      else if (c.status === 'employed' && a >= 76 && rng() < 0.5) {
        var abbr = c.team; fire(state, abbr); c.status = 'retired';
      }
    });
    if (year >= 2026) {
      var free = available(state, year + 1).length;
      for (var i = free; i < 8; i++) generate(state, year + 1, rng);
    }
    var filled = [];
    Object.keys(state.teams || {}).forEach(function (abbr) {
      if (of(state, abbr) || abbr === state.userTeam) return;
      var next = pickCoachFor(state, abbr, rng);
      place(state, abbr, next.id, year + 1);
      filled.push({ team: abbr, fired: null, hired: next.id });
    });
    return filled;
  }

  function record(c) {
    var w = 0, l = 0;
    (c && c.seasons || []).forEach(function (s) { w += s.w; l += s.l; });
    return { w: w, l: l };
  }

  var COACH = {
    init: init,
    ovr: ovr,
    of: of,
    effect: effect,
    available: available,
    hire: hire,
    fire: fire,
    recordSeason: recordSeason,
    aiChanges: aiChanges,
    offseason: offseason,
    generate: generate,
    record: record,
    expectedPct: expectedPct,
    MAX_EFFECT: MAX_EFFECT
  };

  if (typeof window !== 'undefined') window.COACH = COACH;
  else if (root) root.COACH = COACH;
  if (typeof module !== 'undefined' && module.exports) module.exports = COACH;
})(typeof self !== 'undefined' ? self : this);
