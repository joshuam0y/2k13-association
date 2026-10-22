// 2K13 Association: contracts, re-signing and free agency.
// Classic script: attaches window.FA (and module.exports under Node). Needs js/mood.js (window.MOOD).
// Uses window.CBA (js/cba.js) for rules, payroll and canSign when it is loaded; otherwise falls back to
// built-in numbers (2012-13: cap $58,044,000, tax $70,307,000, MLE $5,000,000, minimum $473,604 to $1,352,181).
//
// Offseason flow:
//   FA.startOffseason(state)   options decided, contracts expire, Bird rights and qualifying offers set.
//                              Opens state.fa = { year, day, length, stage: "resign", rights, offerSheets, signings, ... }
//                              where year is the season the new contracts start (state.year + 1).
//   FA.resignWindow(state)     the user's expiring players, what they ask and whether they will talk.
//   FA.simDay(state, rng)      one free agency day (the first call opens free agency and runs AI re-signings).
//                              About 30 days; on the last day rosters are filled to 13 to 15 and old veterans may retire.
//   FA.offer(state, abbr, id, { salaries, option, twoWay })  -> { accepted, message }
//   FA.demand(state, id[, abbr]) -> { amount, years, minYears, maxYears, max, required? }
//   FA.release(state, abbr, id), FA.decideOption, FA.setQualifyingOffer, FA.matchOfferSheet (user decisions).
(function () {
  'use strict';

  var G = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});
  function tryReq(p) { try { return typeof require === 'function' ? require(p) : null; } catch (e) { return null; } }
  function MOOD() { return G.MOOD || tryReq('./mood.js'); }
  function CBAX() { return G.CBA || null; }

  var FA_DAYS = 30, MAX_ROSTER = 15, MIN_ROSTER = 13;
  var NBA_PHASES_OFF = { draftLottery: 1, draft: 1, resign: 1, freeAgency: 1 };

  // ---------------------------------------------------------------------------
  // Rules (fallback numbers, merged with CBA.rules when present)
  // ---------------------------------------------------------------------------
  var MIN_2013 = [473604, 762195, 854389, 884293, 915852, 947907, 979963, 1012018, 1092454, 1177667, 1352181];
  var CAPS = {
    2013: [58044000, 70307000], 2014: [58679000, 71748000], 2015: [63065000, 76829000], 2016: [70000000, 84740000],
    2017: [94143000, 113287000], 2018: [99093000, 119266000], 2019: [101869000, 123733000], 2020: [109140000, 132627000],
    2021: [109140000, 132627000], 2022: [112414000, 136606000], 2023: [123655000, 150267000], 2024: [136021000, 165294000],
    2025: [140588000, 170814000], 2026: [154647000, 187895000], 2027: [165000000, 201000000]
  };
  var ruleCache = {};

  function fallbackRules(year) {
    var ct = CAPS[year];
    if (!ct) {
      var y = year > 2027 ? 2027 : 2013, g = Math.pow(1.045, year - y);
      ct = [Math.round(CAPS[y][0] * g), Math.round(CAPS[y][1] * g)];
    }
    var cap = ct[0], tax = ct[1], scale = cap / CAPS[2013][0];
    var minTab = MIN_2013.map(function (m) { return Math.round(m * scale); });
    return {
      year: year, cap: cap, tax: tax, apron: Math.round(tax + 4000000 * scale), minPayroll: Math.round(cap * 0.9),
      maxPct: [25, 30, 35],
      minSalary: function (yp) { yp = Math.max(0, Math.min(10, Math.floor(yp || 0))); return minTab[yp]; },
      mle: Math.round(5000000 * scale), taxMle: Math.round(3090000 * scale), roomException: Math.round(2500000 * scale),
      bae: Math.round(1957000 * scale), twoWay: year >= 2018, maxTwoWay: year >= 2024 ? 3 : 2,
      raise: year >= 2018 ? 0.05 : 0.045, birdRaise: year >= 2018 ? 0.08 : 0.075
    };
  }

  function rules(year) {
    var C = CBAX();
    var key = (C && C.rules ? 'c' : 'f') + year;
    if (ruleCache[key]) return ruleCache[key];
    var r = fallbackRules(year);
    if (C && typeof C.rules === 'function') {
      var c = null;
      try { c = C.rules(year); } catch (e) { c = null; }
      if (c) Object.keys(c).forEach(function (k) { if (c[k] != null) r[k] = c[k]; });
      if (typeof r.minSalary !== 'function') {
        var t = r.minSalary;
        r.minSalary = Array.isArray(t) ? function (yp) { return t[Math.max(0, Math.min(t.length - 1, yp || 0))]; } : fallbackRules(year).minSalary;
      }
      if (!r.taxMle) r.taxMle = Math.round(r.mle * 0.618);
      if (!r.apron) r.apron = r.tax + Math.round(r.cap * 0.07);
      if (!Array.isArray(r.maxPct)) r.maxPct = [25, 30, 35];
    }
    // maxTwoWay in CBA.rules may be a slot count or a salary; keep a slot count here.
    r.twoWaySlots = (typeof r.maxTwoWay === 'number' && r.maxTwoWay < 10) ? r.maxTwoWay : (year >= 2024 ? 3 : 2);
    r.twoWaySalary = (typeof r.maxTwoWay === 'number' && r.maxTwoWay >= 10) ? r.maxTwoWay : Math.round(r.minSalary(0) * 0.5);
    ruleCache[key] = r;
    return r;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function r10k(x) { return Math.round(x / 10000) * 10000; }
  function money(x) { return '$' + (x / 1e6).toFixed(x >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M'; }
  function pers(p) { return p.personality || { loyalty: 50, winning: 50, money: 50, market: 50, ego: 50 }; }
  function isTeam(state, abbr) { return !!(state.teams && state.teams[abbr]); }

  // The season new contracts start in. During the offseason this is the coming season.
  function contractYear(state) {
    if (state.fa && state.fa.year > state.year) return state.fa.year;
    if (NBA_PHASES_OFF[state.phase]) return state.year + 1;
    return state.year;
  }

  function salaryFor(c, year) {
    if (!c || !c.salaries) return 0;
    for (var i = 0; i < c.salaries.length; i++) if (c.salaries[i].year === year) return c.salaries[i].amount;
    return 0;
  }
  function lastYear(c) { return c && c.salaries && c.salaries.length ? c.salaries[c.salaries.length - 1].year : 0; }
  function lastSalary(p) {
    var c = p.contract || p.lastContract;
    if (c && c.salaries && c.salaries.length) return c.salaries[c.salaries.length - 1].amount;
    return p.salary || 0;
  }
  function minSalary(state, p, year) { return rules(year || contractYear(state)).minSalary(p.yearsPro || 0); }

  // Salary in the last season of the contract before the one being signed for `year`.
  function prevSalary(p, year) {
    var c = p.contract;
    if (c && c.salaries && c.salaries.length && lastYear(c) < year) return c.salaries[c.salaries.length - 1].amount;
    c = p.lastContract;
    if (c && c.salaries && c.salaries.length) return c.salaries[c.salaries.length - 1].amount;
    return p.salary || 0;
  }

  // Max by years of service (25/30/35% of the cap), or 105% of his previous salary if that is more.
  function maxSalary(state, p, year) {
    year = year || contractYear(state);
    var r = rules(year), yp = p.yearsPro || 0;
    var pct = r.maxPct[yp >= 10 ? 2 : yp >= 7 ? 1 : 0];
    return Math.max(Math.round(r.cap * pct / 100), Math.round(prevSalary(p, year) * 1.05));
  }

  function standardOn(state, abbr) {
    var out = [];
    Object.keys(state.players).forEach(function (id) {
      var p = state.players[id];
      if (p.team === abbr && !p.retired && !(p.contract && p.contract.twoWay) && !(p.stashedUntil && p.stashedUntil > contractYear(state))) out.push(p);
    });
    return out;
  }

  function payrollRaw(state, abbr, year) {
    var C = CBAX();
    if (C && typeof C.payroll === 'function') {
      try { var v = C.payroll(state, abbr, year); if (typeof v === 'number' && !isNaN(v)) return v; } catch (e) { /* fall through */ }
    }
    var sum = 0;
    Object.keys(state.players).forEach(function (id) {
      var p = state.players[id];
      if (p.team !== abbr || p.retired || !p.contract || p.contract.twoWay) return;
      sum += salaryFor(p.contract, year);
    });
    var t = state.teams[abbr];
    (t && t.deadMoney || []).forEach(function (d) { if (d.year === year) sum += d.amount; });
    return sum;
  }

  // Pending offer sheets count against the offering team's cap and roster.
  function pendingFor(state, abbr) {
    var fa = state.fa, amt = 0, n = 0;
    if (fa) fa.offerSheets.forEach(function (s) { if (s.from === abbr) { amt += s.salaries[0].amount; n++; } });
    return { amount: amt, count: n };
  }
  function payroll(state, abbr, year) {
    year = year || contractYear(state);
    return payrollRaw(state, abbr, year) + pendingFor(state, abbr).amount;
  }
  function rosterCount(state, abbr) { return standardOn(state, abbr).length + pendingFor(state, abbr).count; }
  function twoWayCount(state, abbr) {
    var n = 0;
    Object.keys(state.players).forEach(function (id) { var p = state.players[id]; if (p.team === abbr && p.contract && p.contract.twoWay && !p.retired) n++; });
    return n;
  }

  // ---------------------------------------------------------------------------
  // Context: rosters, strength and payroll, cached during a day and refreshed per team on a signing
  // ---------------------------------------------------------------------------
  function buildCtx(state) {
    var M = MOOD();
    var ctx = M ? M.buildCtx(state) : { rosters: {}, strength: {}, avgStrength: 70 };
    ctx.pay = {}; ctx.count = {};
    Object.keys(state.teams).forEach(function (a) { refreshTeam(state, ctx, a); });
    return ctx;
  }
  function refreshTeam(state, ctx, abbr) {
    var Y = contractYear(state);
    var all = [];
    Object.keys(state.players).forEach(function (id) { var p = state.players[id]; if (p.team === abbr && !p.retired) all.push(p); });
    all.sort(function (x, y) { return y.ovr - x.ovr; });
    ctx.rosters[abbr] = all;
    var std = all.filter(function (p) { return !(p.contract && p.contract.twoWay) && !(p.stashedUntil && p.stashedUntil > Y); });
    var top = std.slice(0, 8), s = 0;
    top.forEach(function (p) { s += p.ovr; });
    ctx.strength[abbr] = top.length ? s / Math.max(8, top.length) : 60;
    var pend = pendingFor(state, abbr);
    ctx.pay[abbr] = payrollRaw(state, abbr, Y) + pend.amount;
    ctx.count[abbr] = std.length + pend.count;
  }

  function winPct(state, abbr, ctx) {
    var M = MOOD();
    return M ? M.teamWinPct(state, abbr, ctx) : 0.5;
  }

  function direction(state, abbr, ctx) {
    var t = state.teams[abbr];
    if (t && (t.direction === 'contend' || t.direction === 'rebuild')) return t.direction;
    var w = winPct(state, abbr, ctx);
    return w >= 0.56 ? 'contend' : w <= 0.4 ? 'rebuild' : 'neutral';
  }

  // ---------------------------------------------------------------------------
  // Player value and demands
  // ---------------------------------------------------------------------------
  var CURVE = [[60, 0], [66, 0.012], [70, 0.03], [73, 0.055], [76, 0.085], [79, 0.13], [82, 0.18], [85, 0.235], [88, 0.29], [91, 0.35], [95, 0.4]];
  function curvePct(o) {
    if (o <= CURVE[0][0]) return 0;
    for (var i = 1; i < CURVE.length; i++) {
      if (o <= CURVE[i][0]) { var a = CURVE[i - 1], b = CURVE[i]; return a[1] + (b[1] - a[1]) * (o - a[0]) / (b[0] - a[0]); }
    }
    return CURVE[CURVE.length - 1][1];
  }

  function effOvr(p) {
    var w = [0.4, 0.4, 0.4, 0.35, 0.28, 0.2, 0.12, 0.06][clamp((p.age || 25) - 18, 0, 8)] || 0;
    if ((p.age || 25) >= 26) w = 0;
    return p.ovr + Math.max(0, (p.pot || p.ovr) - p.ovr) * w;
  }

  function recentStats(state, p) {
    var s = state.season && state.season.playerStats && state.season.playerStats[p.id];
    if (s && s.g >= 15) return { pts: s.pts / s.g, reb: (s.oreb + s.dreb) / s.g, ast: s.ast / s.g, stl: s.stl / s.g, blk: s.blk / s.g };
    if (p.stats && p.stats.g >= 15 && (state.year || 2013) <= 2013) return p.stats;
    return null;
  }

  function statFactor(state, p) {
    var s = recentStats(state, p);
    if (!s) return 1;
    var prod = s.pts + 0.8 * s.reb + 1.1 * s.ast + 1.5 * ((s.stl || 0) + (s.blk || 0));
    var exp = Math.max(4, 14.5 + 0.93 * (p.ovr - 70));
    return clamp(Math.sqrt(Math.max(prod, 0.5) / exp), 0.9, 1.1);
  }

  // What the player is worth on the open market, before personality and team fit.
  function marketValue(state, id, year) {
    var p = typeof id === 'object' ? id : state.players[id];
    if (!p) return 0;
    year = year || contractYear(state);
    var r = rules(year);
    var v = curvePct(effOvr(p)) * r.cap;
    if (p.age >= 31) v *= Math.max(0.35, 1 - 0.07 * (p.age - 30));
    v *= statFactor(state, p);
    if (p.injury && p.injury.games > 40) v *= 0.8;
    return Math.round(clamp(v, minSalary(state, p, year), maxSalary(state, p, year)));
  }

  function isStar(p) { return effOvr(p) >= 86 && p.age < 33; }

  function desiredYears(p, amount, min) {
    var a = p.age || 25, y = a <= 29 ? 4 : a <= 31 ? 3 : a <= 33 ? 2 : 1;
    if (amount <= min * 1.5) y = Math.min(y, a <= 26 ? 2 : 1);
    else if (amount <= min * 3) y = Math.min(y, 3);
    return y;
  }

  function dayDecay(state, p) {
    var fa = state.fa;
    if (p.team !== 'FA') return 1;
    var d = !fa ? 40 : fa.stage === 'resign' ? 0 : fa.stage === 'done' ? 40 : fa.day;
    if (isStar(p)) return Math.max(0.85, 1 - 0.004 * Math.max(0, d - 5));
    return Math.max(0.5, 1 - 0.018 * Math.max(0, d - 2));
  }

  function demand(state, id, abbr, ctx) {
    var p = state.players[id];
    if (!p) return null;
    var Y = contractYear(state), t = pers(p);
    var min = minSalary(state, p, Y), max = maxSalary(state, p, Y);
    var amount = marketValue(state, p, Y) * (1 + (t.money - 50) / 50 * 0.06 + (t.ego - 50) / 50 * 0.04);
    var star = isStar(p);
    if (star) amount = max;
    amount *= dayDecay(state, p);
    amount = clamp(amount, min, max);
    amount = amount <= min * 1.02 ? min : Math.min(max, r10k(amount));
    var years = desiredYears(p, amount, min);
    var rights = state.fa && state.fa.rights[id];
    if (star && p.age <= 28 && rights && rights.bird === 'full') years = 5;
    var out = { amount: amount, years: years, minYears: Math.max(1, years - 1), maxYears: Math.min(5, years + 1), max: star, min: min };
    if (abbr) {
      var tb = teamBonus(state, abbr, p, ctx);
      out.required = Math.min(max, Math.max(min, Math.round(amount * (1 - tb.bonus))));
      out.bonus = tb.bonus; out.parts = tb.parts;
    }
    return out;
  }

  function rightsTeam(state, p) { var r = state.fa && state.fa.rights[p.id]; return r ? r.team : null; }

  // How much the team itself is worth to the player, as a fraction of his asking price (+ is a discount).
  function teamBonus(state, abbr, p, ctx) {
    ctx = ctx || buildCtx(state);
    var M = MOOD(), t = pers(p), parts = {};
    var ww = t.winning / 100 * 2;
    if (p.age >= 30) ww *= 1.3;
    parts.winning = (winPct(state, abbr, ctx) - 0.5) * 0.3 * ww;
    parts.market = ((M ? M.marketSize(abbr) : 0.5) - 0.5) * 0.18 * (t.market / 100 * 2);
    var roster = (ctx.rosters[abbr] || []).filter(function (x) { return x !== p && !(x.contract && x.contract.twoWay); });
    var rank = 0;
    roster.forEach(function (x) { if (x.ovr > p.ovr) rank++; });
    var egoF = 0.6 + t.ego / 100 * 0.8;
    parts.role = 0;
    if (p.ovr >= 80) { if (rank >= 9) parts.role = -0.12 * egoF; else if (rank >= 5) parts.role = -0.06 * egoF; else if (rank === 0) parts.role = 0.03 * t.ego / 100; }
    else if (p.ovr >= 74) { if (rank >= 9) parts.role = -0.06 * egoF; else if (rank < 5) parts.role = 0.02; }
    else if (rank < 9) parts.role = 0.03;
    parts.loyalty = 0;
    var own = rightsTeam(state, p) === abbr || p.team === abbr || p.lastTeam === abbr;
    if (own) {
      var mood = typeof p.mood === 'number' ? p.mood : 55;
      parts.loyalty = t.loyalty / 100 * Math.min(p.yearsWithTeam || 0, 10) / 10 * 0.16;
      parts.loyalty += mood < 50 ? (mood - 50) / 50 * 0.14 : (mood - 50) / 50 * 0.05;
      if (mood < 25) parts.loyalty -= 0.08;
    }
    var cr = M && M.coachRating ? M.coachRating(state, abbr) : null;
    parts.coach = cr == null ? 0 : clamp((cr - 70) / 30 * 0.05, -0.05, 0.05);
    var b = 0;
    Object.keys(parts).forEach(function (k) { b += parts[k]; });
    b *= 1.3 - t.money / 100 * 0.6;
    return { bonus: clamp(b, -0.4, 0.3), parts: parts, rank: rank, own: own };
  }

  // ---------------------------------------------------------------------------
  // Cap checks
  // ---------------------------------------------------------------------------
  function birdLimit(state, p, rights, year) {
    var r = rules(year), prev = rights.prev || lastSalary(p), max = maxSalary(state, p, year);
    if (rights.bird === 'full') return max;
    if (rights.bird === 'early') return Math.min(max, Math.max(prev * 1.75, r.cap * 0.09));
    return Math.min(max, Math.max(prev * 1.2, r.minSalary(p.yearsPro || 0) * 1.2));
  }

  function used(state, abbr) {
    var fa = state.fa;
    if (!fa) return {};
    return fa.used[abbr] || (fa.used[abbr] = {});
  }

  // Internal cap check. Returns { ok, via, reason, maxYears }.
  function canSignInternal(state, abbr, id, salaries, opts) {
    opts = opts || {};
    var p = state.players[id], Y = salaries[0].year, r = rules(Y), first = salaries[0].amount, n = salaries.length;
    if (!p) return { ok: false, reason: 'Unknown player' };
    if (opts.twoWay) {
      if (!r.twoWay) return { ok: false, reason: 'Two-way contracts start in 2017-18' };
      if ((p.yearsPro || 0) > 3) return { ok: false, reason: 'Two-way contracts are only for players with 0 to 3 years of service' };
      if (twoWayCount(state, abbr) >= r.twoWaySlots) return { ok: false, reason: 'No two-way slots left' };
      if (n > 2) return { ok: false, reason: 'Two-way contracts are at most 2 years' };
      return { ok: true, via: 'twoWay' };
    }
    var cnt = opts.count != null ? opts.count : rosterCount(state, abbr);
    if (!opts.ignoreRoster && cnt >= MAX_ROSTER) return { ok: false, reason: 'Roster is full (' + MAX_ROSTER + ' players)' };
    var pay = opts.pay != null ? opts.pay : payroll(state, abbr, Y);
    var max = maxSalary(state, p, Y);
    if (first > max) return { ok: false, reason: 'More than the maximum salary (' + money(max) + ')' };
    var rights = state.fa && state.fa.rights[id];
    if (opts.qo && rights && rights.team === abbr) return { ok: true, via: 'qo' };
    if (rights && rights.team === abbr && !rights.renounced && first <= birdLimit(state, p, rights, Y) + 1 && n <= (rights.bird === 'full' ? 5 : 4)) {
      return { ok: true, via: 'bird' };
    }
    if (first <= r.minSalary(p.yearsPro || 0) + 1 && n <= 2) return { ok: true, via: 'min' };
    if (n > 4) return { ok: false, reason: 'Only Bird rights allow a 5-year deal' };
    var u = used(state, abbr);
    if (pay + first <= r.cap) return { ok: true, via: 'space' };
    if (!u.space && !u.mle) {
      if (pay + first <= r.apron && first <= r.mle && n <= 4) return { ok: true, via: 'mle' };
      if (first <= r.taxMle && n <= 3) return { ok: true, via: 'mle', tax: true };
    }
    if (pay < r.cap && !u.room && first <= r.roomException && n <= 2) return { ok: true, via: 'room' };
    if (!u.space && !u.bae && pay + first <= r.apron && first <= r.bae && n <= 2) return { ok: true, via: 'bae' };
    return { ok: false, reason: 'Not enough cap space and no exception fits (payroll ' + money(pay) + ', cap ' + money(r.cap) + ')' };
  }

  function canSign(state, abbr, id, salaries, opts) {
    var internal = canSignInternal(state, abbr, id, salaries, opts);
    var C = CBAX();
    if (!C || typeof C.canSign !== 'function') return internal;
    var rights = state.fa && state.fa.rights[id];
    var res = null;
    try {
      res = C.canSign(state, abbr, id, salaries, Object.assign({}, opts || {}, {
        rights: rights || null, bird: rights && rights.team === abbr ? rights.bird : null,
        used: used(state, abbr), year: salaries[0].year
      }));
    } catch (e) { res = null; }
    if (!res) return internal;
    // CBA.canSign may not know about free agency rights or offer sheets; trust the internal check for those.
    if (!res.ok && internal.ok && (internal.via === 'bird' || internal.via === 'qo' || internal.via === 'twoWay')) return internal;
    if (res.ok && !internal.ok && /Roster is full/.test(internal.reason || '')) return internal;
    return res;
  }

  function maxYearsFor(via, rights) {
    return via === 'bird' ? (rights && rights.bird === 'full' ? 5 : 4) : via === 'mle' ? 4 : via === 'space' ? 4 : via === 'qo' ? 1 : 2;
  }

  function makeSalaries(year, avg, years, raise) {
    var first = avg / (1 + raise * (years - 1) / 2), out = [];
    for (var i = 0; i < years; i++) out.push({ year: year + i, amount: Math.round(first * (1 + raise * i)) });
    return out;
  }

  function makeFirst(year, first, years, raise) {
    var out = [];
    for (var i = 0; i < years; i++) out.push({ year: year + i, amount: Math.round(first * (1 + raise * i)) });
    return out;
  }

  function normSalaries(state, salaries) {
    var Y = contractYear(state);
    if (!salaries || !salaries.length) return null;
    return salaries.map(function (s, i) { return typeof s === 'number' ? { year: Y + i, amount: Math.round(s) } : { year: s.year, amount: Math.round(s.amount) }; });
  }

  function checkStructure(state, salaries, via) {
    var Y = contractYear(state);
    var r = rules(Y), raise = via === 'bird' ? r.birdRaise : r.raise, first = salaries[0].amount;
    for (var i = 0; i < salaries.length; i++) {
      if (salaries[i].year !== Y + i) return 'Contract years must start in ' + Y + ' and run in order';
      if (i > 0) {
        var step = salaries[i].amount - salaries[i - 1].amount;
        if (step > first * raise + 1) return 'Raises can be at most ' + Math.round(raise * 1000) / 10 + '% of the first-year salary';
        if (step < -first * raise - 1) return 'Pay cuts can be at most ' + Math.round(raise * 1000) / 10 + '% of the first-year salary';
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Contract building (for league start and the draft)
  // ---------------------------------------------------------------------------
  function makeRookieContract(year, firstSalary, opts) {
    opts = opts || {};
    var f = [1, 1.045, 1.092, 1.376];
    var sal = f.map(function (m, i) { return { year: year + i, amount: Math.round(firstSalary * m) }; });
    var options = [{ year: year + 2, type: 'team' }, { year: year + 3, type: 'team' }];
    return { salaries: sal, option: options[0], options: options, rookie: true, twoWay: false, signedYear: year, round: 1, pick: opts.pick || null };
  }

  // Builds contracts from the league file's salary and contractEnd for players that have none.
  function contractsFromSalary(state) {
    var n = 0, Y = state.year;
    Object.keys(state.players).forEach(function (id) {
      var p = state.players[id];
      if (p.contract || !isTeam(state, p.team) || !(p.salary > 0)) return;
      var end = Math.max(Y, p.contractEnd || Y), sal = [];
      for (var y = Y; y <= end; y++) sal.push({ year: y, amount: p.salary });
      if (p.yearsPro == null) p.yearsPro = clamp((p.age || 24) - 19, 0, 20);
      if (p.yearsWithTeam == null) p.yearsWithTeam = Math.min(p.yearsPro, 3);
      var rookie = p.yearsPro <= 3 && p.age <= 24 && p.salary >= 1000000 && p.salary <= 7000000;
      var c = { salaries: sal, option: null, rookie: rookie, twoWay: false, signedYear: Y - (rookie ? p.yearsPro : Math.min(p.yearsWithTeam, 2)) };
      if (rookie) {
        c.round = 1;
        c.options = [{ year: c.signedYear + 2, type: 'team' }, { year: c.signedYear + 3, type: 'team' }].filter(function (o) { return o.year > Y && o.year <= end; });
        c.option = c.options[0] || null;
      }
      p.contract = c; n++;
    });
    return n;
  }

  function optionsOf(c) { return c.options ? c.options.slice() : (c.option ? [c.option] : []); }
  function setOptions(c, list) { c.options = list; c.option = list[0] || null; }

  // ---------------------------------------------------------------------------
  // Offseason start
  // ---------------------------------------------------------------------------
  function log(state, type, text, ids) {
    state.transactions = state.transactions || [];
    state.transactions.push({ year: state.year, day: state.fa ? state.fa.day : (state.day || 0), type: type, text: text, ids: ids || [] });
  }
  function news(state, headline, body, ids) {
    state.news = state.news || [];
    state.news.push({ year: state.year, day: state.fa ? state.fa.day : (state.day || 0), headline: headline, body: body || '', ids: ids || [] });
  }

  function qoAmount(state, p, c, Y) {
    var last = lastSalary(p), r = rules(Y);
    if (c && c.rookie && c.round !== 2) {
      var pick = c.pick || (p.draft && p.draft.pick) || 15;
      return Math.round(last * (1.3 + 0.2 * clamp((pick - 1) / 29, 0, 1)));
    }
    return Math.round(Math.max(last * 1.25, r.minSalary(p.yearsPro || 0) + 200000 * r.cap / CAPS[2013][0]));
  }

  function shouldExtendQO(state, p, qo, Y) {
    var v = marketValue(state, p, Y);
    return v >= qo * 0.85 || (p.age <= 24 && (p.pot || 0) >= 76 && v >= qo * 0.6);
  }

  function decidePlayerOption(state, p, opt, Y) {
    var c = p.contract, optSal = salaryFor(c, Y), v = marketValue(state, p, Y), t = pers(p);
    var mood = typeof p.mood === 'number' ? p.mood : 55;
    if (opt.type === 'eto') {
      var rem = c.salaries.filter(function (s) { return s.year >= Y; });
      var avg = rem.reduce(function (a, s) { return a + s.amount; }, 0) / rem.length;
      optSal = avg;
    }
    var out = v >= optSal * 1.08 && !(p.age >= 33 && v < optSal * 1.25);
    if (!out && mood < 30 && v >= optSal * 0.9 && t.loyalty < 70) out = true;
    return out;
  }

  function decideTeamOption(state, p, opt, Y) {
    var optSal = salaryFor(p.contract, Y), v = marketValue(state, p, Y);
    if (p.contract.rookie) return v >= optSal * 0.7 || (p.age <= 23 && (p.pot || 0) >= 75);
    return v >= optSal * 0.85;
  }

  function startOffseason(state, opts) {
    opts = opts || {};
    var Y = opts.year || state.year + 1;
    if (state.fa && state.fa.year === Y) return state.fa.summary;
    var M = MOOD();
    if (M && opts.mood !== false) M.update(state, { offseason: true });
    state.events = state.events || [];
    state.transactions = state.transactions || [];
    state.news = state.news || [];
    var fa = state.fa = { year: Y, day: 0, length: opts.days || FA_DAYS, stage: 'resign', rights: {}, offerSheets: [], signings: [], decisions: [], used: {}, released: [], retired: [] };
    var summary = { year: Y, expiring: [], optedOut: [], optedIn: [], declined: [], exercised: [], rfa: [] };
    fa.summary = summary;
    Object.keys(state.players).forEach(function (id) {
      var p = state.players[id];
      if (p.retired || !isTeam(state, p.team)) return;
      if (p.stashedUntil && p.stashedUntil >= Y) return;
      var c = p.contract;
      // A season of service for players who were paid or played in the season just ended (not new draftees).
      var ps = state.season && state.season.playerStats && state.season.playerStats[id];
      var served = (c && c.salaries && c.salaries.some(function (s) { return s.year === Y - 1; })) || (ps && ps.g > 0);
      if (opts.service !== false && served) { p.yearsPro = (p.yearsPro || 0) + 1; p.yearsWithTeam = (p.yearsWithTeam || 0) + 1; }
      if (!c) { expire(state, p, Y, summary); return; }
      // Options for the coming season
      var list = optionsOf(c), keep = [];
      list.forEach(function (o) {
        if (o.year !== Y) { if (o.year > Y) keep.push(o); return; }
        var cut = false, rec = { id: id, team: p.team, type: o.type, year: Y, amount: salaryFor(c, Y) };
        if (o.type === 'team') {
          var ex = decideTeamOption(state, p, o, Y);
          cut = !ex;
          (ex ? summary.exercised : summary.declined).push(id);
          rec.decision = ex ? 'exercised' : 'declined';
          log(state, 'option', p.team + (ex ? ' exercises ' : ' declines ') + 'its ' + Y + ' team option on ' + p.name, [id]);
          if (p.team === state.userTeam) state.events.push({ type: 'contractDecision', kind: 'teamOption', playerId: id, team: p.team, year: Y, amount: rec.amount, defaultDecision: rec.decision, text: 'Team option on ' + p.name + ' for ' + money(rec.amount) + ': ' + rec.decision + ' by default. Use FA.decideOption to change it before free agency.' });
        } else {
          var outOpt = decidePlayerOption(state, p, o, Y);
          cut = outOpt;
          (outOpt ? summary.optedOut : summary.optedIn).push(id);
          rec.decision = outOpt ? 'optedOut' : 'optedIn';
          log(state, 'option', p.name + (outOpt ? ' opts out of ' : ' opts in to ') + 'his ' + Y + (o.type === 'eto' ? ' contract (early termination)' : ' player option'), [id]);
          if (outOpt && p.ovr >= 78) news(state, p.name + ' opts out and becomes a free agent', '', [id]);
        }
        if (cut) {
          rec.stripped = c.salaries.filter(function (s) { return s.year >= Y; });
          rec.strippedOptions = list.filter(function (x) { return x.year > Y; });
          c.salaries = c.salaries.filter(function (s) { return s.year < Y; });
          c.declinedOption = o.type === 'team';
          keep = [];
        }
        fa.decisions.push(rec);
      });
      setOptions(c, keep.filter(function (o) { return lastYear(c) >= o.year; }));
      if (lastYear(c) >= Y) return;
      expire(state, p, Y, summary);
    });
    return summary;
  }

  function expire(state, p, Y, summary) {
    var fa = state.fa, c = p.contract, id = p.id;
    var yw = p.yearsWithTeam || 0;
    var rights = { team: p.team, bird: yw >= 3 ? 'full' : yw === 2 ? 'early' : 'non', prev: lastSalary(p), rfa: false, qo: 0, renounced: false };
    var rookieDone = c && c.rookie && !c.declinedOption;
    if (!(c && c.twoWay) && (rookieDone || ((p.yearsPro || 0) <= 3 && !(c && c.declinedOption)))) {
      var qo = qoAmount(state, p, c, Y);
      rights.qo = qo;
      rights.rfa = shouldExtendQO(state, p, qo, Y);
      if (rights.rfa) summary.rfa.push(id);
      if (p.team === state.userTeam) state.events.push({ type: 'contractDecision', kind: 'qualifyingOffer', playerId: id, team: p.team, amount: qo, defaultDecision: rights.rfa ? 'extended' : 'withheld', text: 'Qualifying offer of ' + money(qo) + ' to ' + p.name + ': ' + (rights.rfa ? 'extended' : 'not extended') + ' by default. Use FA.setQualifyingOffer to change it before free agency.' });
    }
    fa.rights[id] = rights;
    p.lastTeam = p.team;
    p.lastContract = c;
    p.contract = null;
    p.team = 'FA';
    summary.expiring.push(id);
  }

  // ---------------------------------------------------------------------------
  // User decisions before free agency opens
  // ---------------------------------------------------------------------------
  function clearEvent(state, kind, id) {
    state.events = (state.events || []).filter(function (e) { return !(e.type === 'contractDecision' && e.kind === kind && e.playerId === id); });
  }

  function decideOption(state, id, exercise) {
    var fa = state.fa, p = state.players[id];
    if (!fa || fa.stage !== 'resign') return { ok: false, message: 'Options can only be changed before free agency opens' };
    var rec = null;
    fa.decisions.forEach(function (d) { if (d.id === id && d.type === 'team') rec = d; });
    if (!rec || rec.team !== state.userTeam) return { ok: false, message: 'No team option to decide' };
    clearEvent(state, 'teamOption', id);
    if (exercise && rec.decision === 'declined') {
      var c = p.lastContract || p.contract;
      c.salaries = c.salaries.concat(rec.stripped);
      setOptions(c, rec.strippedOptions || []);
      c.declinedOption = false;
      p.contract = c; p.team = rec.team; p.lastContract = null;
      delete fa.rights[id];
      rec.decision = 'exercised';
      return { ok: true, message: 'Option exercised: ' + p.name + ' stays at ' + money(rec.amount) };
    }
    if (!exercise && rec.decision === 'exercised') {
      var c2 = p.contract;
      rec.stripped = c2.salaries.filter(function (s) { return s.year >= fa.year; });
      rec.strippedOptions = optionsOf(c2).filter(function (o) { return o.year > fa.year; });
      c2.salaries = c2.salaries.filter(function (s) { return s.year < fa.year; });
      c2.declinedOption = true;
      setOptions(c2, []);
      expire(state, p, fa.year, fa.summary);
      fa.rights[id].rfa = false;
      rec.decision = 'declined';
      return { ok: true, message: 'Option declined: ' + p.name + ' is a free agent' };
    }
    return { ok: true, message: 'No change' };
  }

  function setQualifyingOffer(state, id, extend) {
    var fa = state.fa, r = fa && fa.rights[id];
    if (!r || !r.qo) return { ok: false, message: 'Not eligible for a qualifying offer' };
    if (r.team !== state.userTeam) return { ok: false, message: 'Not your player' };
    if (fa.stage !== 'resign') return { ok: false, message: 'Qualifying offers are set before free agency opens' };
    r.rfa = !!extend;
    clearEvent(state, 'qualifyingOffer', id);
    return { ok: true, message: state.players[id].name + (extend ? ' is a restricted free agent (qualifying offer ' + money(r.qo) + ')' : ' is an unrestricted free agent') };
  }

  function renounce(state, abbr, id) {
    var r = state.fa && state.fa.rights[id];
    if (!r || r.team !== abbr) return { ok: false, message: 'No rights to renounce' };
    r.renounced = true; r.rfa = false;
    return { ok: true, message: abbr + ' renounces its rights to ' + state.players[id].name };
  }

  function resignWindow(state) {
    if (!state.fa || state.fa.year <= state.year) startOffseason(state);
    var fa = state.fa, ctx = buildCtx(state), abbr = state.userTeam, out = [];
    Object.keys(fa.rights).forEach(function (id) {
      var r = fa.rights[id], p = state.players[id];
      if (r.team !== abbr || p.team !== 'FA') return;
      var d = demand(state, id, abbr, ctx), mood = typeof p.mood === 'number' ? p.mood : 55;
      var willing = !(mood < 25 && pers(p).loyalty < 60);
      out.push({ id: id, name: p.name, ovr: p.ovr, age: p.age, pos: p.pos, mood: mood, bird: r.bird, rfa: r.rfa, qo: r.qo,
        ask: d.amount, years: d.years, required: d.required, willing: willing,
        message: willing ? p.name + ' wants about ' + money(d.required) + ' a year for ' + d.years + (d.years === 1 ? ' year' : ' years') + '.'
          : p.name + ' is unhappy and wants to test free agency.' });
    });
    out.sort(function (a, b) { return b.ovr - a.ovr; });
    return { year: fa.year, stage: fa.stage, team: abbr, players: out };
  }

  // ---------------------------------------------------------------------------
  // Signing
  // ---------------------------------------------------------------------------
  function sign(state, abbr, p, salaries, via, opts, ctx) {
    opts = opts || {};
    var fa = state.fa, Y = salaries[0].year, id = p.id;
    var rights = fa && fa.rights[id];
    var resign = !!(rights && rights.team === abbr) || p.lastTeam === abbr && p.team === 'FA' && !rights;
    var payBefore = ctx && ctx.pay[abbr] != null ? ctx.pay[abbr] : payroll(state, abbr, Y);
    var maxAtSigning = maxSalary(state, p, Y);
    p.contract = { salaries: salaries, option: opts.option || null, options: opts.option ? [opts.option] : [], rookie: false,
      twoWay: via === 'twoWay', signedYear: Y, via: via };
    if (!resign) { p.yearsWithTeam = 0; p.mood = Math.max(typeof p.mood === 'number' ? p.mood : 55, 60); }
    else p.mood = Math.min(100, (typeof p.mood === 'number' ? p.mood : 55) + 8);
    p.tradeRequest = false;
    p.team = abbr;
    if (fa) {
      delete fa.rights[id];
      var u = used(state, abbr);
      if (via === 'space') u.space = true;
      if (via === 'mle') u.mle = true;
      if (via === 'room') u.room = true;
      if (via === 'bae') u.bae = true;
    }
    var total = salaries.reduce(function (a, s) { return a + s.amount; }, 0);
    var desc = salaries.length + (salaries.length === 1 ? ' year' : ' years') + ', ' + money(total);
    var rec = { day: fa ? fa.day : (state.day || 0), year: Y, abbr: abbr, id: id, name: p.name, ovr: p.ovr, age: p.age,
      yearsPro: p.yearsPro || 0, salaries: salaries.map(function (s) { return { year: s.year, amount: s.amount }; }),
      via: via, resign: resign, payrollBefore: payBefore, option: opts.option || null, max: maxAtSigning };
    if (fa) { rec.seq = fa.seq = (fa.seq || 0) + 1; fa.signings.push(rec); }
    log(state, 'sign', abbr + (resign ? ' re-signs ' : ' signs ') + p.name + ' (' + desc + (via === 'twoWay' ? ', two-way' : '') + ')', [id]);
    if (p.ovr >= 78) news(state, p.name + (resign ? ' re-signs with ' : ' signs with ') + abbr, p.name + ' agrees to ' + desc + '.', [id]);
    if (ctx) refreshTeam(state, ctx, abbr);
    rec.payrollAfter = ctx ? ctx.pay[abbr] : payroll(state, abbr, Y);
    return rec;
  }

  function offerSheet(state, abbr, p, salaries, via, opts, ctx) {
    var fa = state.fa, r = fa.rights[p.id];
    var sheet = { id: p.id, from: abbr, rightsTeam: r.team, salaries: salaries, via: via, day: fa.day, expires: fa.day + 3, option: (opts && opts.option) || null };
    fa.offerSheets.push(sheet);
    log(state, 'sign', p.name + ' signs an offer sheet with ' + abbr + ' (' + salaries.length + ' years, ' + money(salaries.reduce(function (a, s) { return a + s.amount; }, 0)) + '); ' + r.team + ' has 3 days to match', [p.id]);
    if (r.team === state.userTeam) {
      state.events.push({ type: 'contractDecision', kind: 'offerSheet', playerId: p.id, team: r.team, from: abbr, salaries: salaries, expiresDay: sheet.expires,
        text: p.name + ' signed an offer sheet with ' + abbr + ' for ' + money(salaries[0].amount) + ' a year. Match it with FA.matchOfferSheet within 3 days.' });
    }
    if (ctx) refreshTeam(state, ctx, abbr);
    return sheet;
  }

  function resolveSheet(state, sheet, match, ctx) {
    var fa = state.fa, p = state.players[sheet.id];
    fa.offerSheets = fa.offerSheets.filter(function (s) { return s !== sheet; });
    clearEvent(state, 'offerSheet', sheet.id);
    if (ctx) refreshTeam(state, ctx, sheet.from);
    if (match) {
      var rec = sign(state, sheet.rightsTeam, p, sheet.salaries, 'bird', { option: sheet.option }, ctx);
      rec.matched = true;
      log(state, 'sign', sheet.rightsTeam + ' matches the offer sheet for ' + p.name, [p.id]);
      return rec;
    }
    var chk = canSign(state, sheet.from, p.id, sheet.salaries, ctx ? { pay: ctx.pay[sheet.from], count: ctx.count[sheet.from] } : {});
    if (!chk.ok) return null;
    var r2 = sign(state, sheet.from, p, sheet.salaries, sheet.via || chk.via, { option: sheet.option }, ctx);
    r2.offerSheet = true;
    return r2;
  }

  function matchOfferSheet(state, id, match) {
    var fa = state.fa, sheet = null;
    if (fa) fa.offerSheets.forEach(function (s) { if (s.id === id) sheet = s; });
    if (!sheet) return { ok: false, message: 'No pending offer sheet' };
    if (sheet.rightsTeam !== state.userTeam) return { ok: false, message: 'Not your restricted free agent' };
    if (match && rosterCount(state, sheet.rightsTeam) >= MAX_ROSTER) return { ok: false, message: 'Roster is full: release a player before matching' };
    var rec = resolveSheet(state, sheet, !!match, null);
    return { ok: true, message: match ? 'Matched: ' + state.players[id].name + ' stays' : state.players[id].name + ' joins ' + sheet.from, signing: rec };
  }

  function aiWantsToMatch(state, sheet, ctx) {
    var p = state.players[sheet.id], abbr = sheet.rightsTeam, Y = sheet.salaries[0].year, r = rules(Y);
    var worst = null;
    if (ctx.count[abbr] >= MAX_ROSTER) {
      (ctx.rosters[abbr] || []).forEach(function (x) { if (!(x.contract && x.contract.twoWay) && (!worst || x.ovr < worst.ovr)) worst = x; });
      if (!worst || p.ovr < worst.ovr + 5) return false;
    }
    var avg = sheet.salaries.reduce(function (a, s) { return a + s.amount; }, 0) / sheet.salaries.length;
    var val = marketValue(state, p, Y) * (p.age <= 24 ? 1.4 : 1.25);
    if (avg > val) return false;
    var after = ctx.pay[abbr] + sheet.salaries[0].amount;
    if (after > r.tax && !(direction(state, abbr, ctx) === 'contend' && p.ovr >= 78) && p.ovr < 82) return false;
    if (worst) { release(state, abbr, worst.id); refreshTeam(state, ctx, abbr); }
    return true;
  }

  // ---------------------------------------------------------------------------
  // User and AI offers
  // ---------------------------------------------------------------------------
  function reasonText(p, parts, abbr, shortMoney) {
    var lines = [], him = p.name.split(' ').slice(-1)[0];
    var list = Object.keys(parts).map(function (k) { return [k, parts[k]]; }).filter(function (x) { return Math.abs(x[1]) >= 0.025; });
    list.sort(function (a, b) { return Math.abs(b[1]) - Math.abs(a[1]); });
    list.slice(0, 3).forEach(function (x) {
      var k = x[0], good = x[1] > 0;
      if (k === 'winning') lines.push(good ? 'he sees a chance to win here' : 'he wants to play for a winner');
      if (k === 'market') lines.push(good ? 'he likes the big market' : 'he would rather play in a bigger market');
      if (k === 'role') lines.push(good ? 'he would have a big role' : 'he expects a bigger role than ' + abbr + ' can give him');
      if (k === 'loyalty') lines.push(good ? 'he is loyal to ' + abbr : 'he is unhappy with ' + abbr + ' and wants a fresh start');
      if (k === 'coach') lines.push(good ? 'he respects the coach' : 'he does not trust the coach');
    });
    return lines;
  }

  function offer(state, abbr, id, terms) {
    terms = terms || {};
    var p = state.players[id];
    if (!p || p.retired) return { accepted: false, message: 'That player is not available' };
    if (!isTeam(state, abbr)) return { accepted: false, message: 'Unknown team ' + abbr };
    var fa = state.fa;
    if (p.team !== 'FA') return { accepted: false, message: p.name + ' is under contract with ' + p.team };
    if (fa && fa.offerSheets.some(function (s) { return s.id === id; })) return { accepted: false, message: p.name + ' has already signed an offer sheet' };
    var rights = fa && fa.rights[id];
    if (fa && fa.stage === 'resign' && !(rights && rights.team === abbr)) {
      return { accepted: false, message: 'Free agency has not opened yet. Only ' + (rights ? rights.team : 'his old team') + ' can negotiate with ' + p.name + ' now.' };
    }
    var Y = contractYear(state), r = rules(Y);
    var salaries = normSalaries(state, terms.salaries);
    if (terms.twoWay && !salaries) salaries = [{ year: Y, amount: r.twoWaySalary }];
    if (!salaries) return { accepted: false, message: 'No salary offered' };
    var chk = canSign(state, abbr, id, salaries, { twoWay: !!terms.twoWay });
    if (!chk.ok) return { accepted: false, message: chk.reason || 'Not allowed under the cap rules' };
    if (salaries.length > maxYearsFor(chk.via, rights) && chk.via !== 'twoWay') return { accepted: false, message: 'Too many years for the ' + chk.via + ' route (max ' + maxYearsFor(chk.via, rights) + ')' };
    var bad = checkStructure(state, salaries, chk.via);
    if (bad) return { accepted: false, message: bad };

    var ctx = buildCtx(state);
    var d = demand(state, id, abbr, ctx);
    var t = pers(p), name = p.name, n = salaries.length;
    var avg = salaries.reduce(function (a, s) { return a + s.amount; }, 0) / n;
    var mood = typeof p.mood === 'number' ? p.mood : 55;
    if (rights && rights.team === abbr && fa && fa.stage === 'resign' && mood < 25 && t.loyalty < 60) {
      return { accepted: false, message: name + ' is unhappy with ' + abbr + ' and wants to test free agency.', ask: d };
    }
    if (terms.twoWay) {
      var ok2 = d.amount <= d.min * 1.6 || p.ovr < 72 || (fa && fa.day >= 10);
      if (!ok2) return { accepted: false, message: name + ' wants a standard NBA contract, not a two-way deal.', ask: d };
      sign(state, abbr, p, salaries, 'twoWay', {}, null);
      return { accepted: true, message: name + ' signs a two-way contract with ' + abbr + '.', via: 'twoWay' };
    }
    var required = d.required, notes = [];
    if (n < d.minYears) { required *= 1 + 0.08 * (d.minYears - n); notes.push('he wants ' + d.years + ' years, not ' + n); }
    if (n > d.maxYears && p.age < 31) { required *= 1 + 0.04 * (n - d.maxYears); notes.push('he does not want to be locked in for ' + n + ' years'); }
    var opt = terms.option || null;
    if (opt && opt.type === 'player') required *= 0.95;
    if (opt && opt.type === 'eto') required *= 0.97;
    if (opt && opt.type === 'team') { required *= 1.05; notes.push('he does not like the team option'); }
    required = Math.max(d.min, required);
    var accepted = avg >= required * 0.995;
    var why = reasonText(p, d.parts || {}, abbr);
    var msg;
    if (!accepted) {
      var shortBy = required - avg;
      var parts = ['the money is ' + money(shortBy) + ' a year short (he wants about ' + money(required) + ')'].concat(notes).concat(why.filter(function (w) { return /wants|rather|expects|unhappy|trust/.test(w); }));
      msg = name + ' rejects the offer: ' + parts.join('; ') + '.';
      return { accepted: false, message: msg, ask: d, required: Math.round(required) };
    }
    var likes = why.filter(function (w) { return !/wants|rather|expects|unhappy|trust/.test(w); });
    if (rights && rights.rfa && rights.team !== abbr) {
      offerSheet(state, abbr, p, salaries, chk.via, { option: opt }, null);
      return { accepted: true, offerSheet: true, message: name + ' signs the offer sheet. ' + rights.team + ' has 3 days to match.', via: chk.via };
    }
    sign(state, abbr, p, salaries, chk.via, { option: opt }, null);
    msg = name + ' accepts: ' + n + (n === 1 ? ' year, ' : ' years, ') + money(avg * n) + '.' + (likes.length ? ' ' + likes.join(', ').replace(/^./, function (c) { return c.toUpperCase(); }) + '.' : avg >= d.amount ? ' The money is right.' : '');
    return { accepted: true, message: msg, via: chk.via };
  }

  // What an AI team would offer, or null.
  function aiBid(state, ctx, abbr, p, d, opts) {
    opts = opts || {};
    var Y = contractYear(state), r = rules(Y), fa = state.fa;
    var count = ctx.count[abbr], pay = ctx.pay[abbr];
    if (count >= MAX_ROSTER) return null;
    var roster = (ctx.rosters[abbr] || []).filter(function (x) { return !(x.contract && x.contract.twoWay); });
    var rank = 0;
    roster.forEach(function (x) { if (x.ovr > p.ovr) rank++; });
    var need = count < MIN_ROSTER;
    if (!need && rank >= 11) return null;
    var dir = direction(state, abbr, ctx);
    var mv = marketValue(state, p, Y);
    var val = mv;
    if (dir === 'contend' && p.age >= 28) val *= 1.1;
    if (dir === 'rebuild' && p.age >= 29) val *= 0.75;
    if (dir === 'rebuild' && p.age <= 24) val *= 1.1;
    if (rank >= 9) val *= 0.8;
    if (isStar(p)) val = Math.max(val, d.amount);
    var tb = teamBonus(state, abbr, p, ctx);
    var maxS = maxSalary(state, p, Y);
    var required = Math.min(maxS, Math.max(d.min, d.amount * (1 - tb.bonus)));
    if (required > val * 1.05 && required > d.min * 1.01) return null;
    var target = Math.max(required, Math.min(d.amount, val));
    var rights = fa && fa.rights[p.id];
    var isRights = rights && rights.team === abbr && !rights.renounced;
    var years = d.years;
    if (isStar(p) && isRights && rights.bird === 'full' && p.age <= 28) years = 5;
    // Routes from biggest to smallest
    var routes = [];
    if (isRights) routes.push({ via: 'bird', max: birdLimit(state, p, rights, Y), years: rights.bird === 'full' ? 5 : 4, raise: r.birdRaise });
    var u = used(state, abbr);
    if (r.cap - pay > 0) routes.push({ via: 'space', max: r.cap - pay, years: 4, raise: r.raise });
    if (!u.space && !u.mle) routes.push(pay + r.mle <= r.apron ? { via: 'mle', max: r.mle, years: 4, raise: r.raise } : { via: 'mle', max: r.taxMle, years: 3, raise: r.raise });
    if (pay < r.cap && !u.room) routes.push({ via: 'room', max: r.roomException, years: 2, raise: r.raise });
    if (!u.space && !u.bae && pay + r.bae <= r.apron) routes.push({ via: 'bae', max: r.bae, years: 2, raise: r.raise });
    routes.push({ via: 'min', max: d.min, years: 2, raise: 0 });
    var best = null;
    routes.forEach(function (rt) {
      var y = Math.min(years, rt.years);
      var reqAdj = required * (y < d.minYears ? 1 + 0.08 * (d.minYears - y) : 1);
      var want = Math.max(target, reqAdj);
      if (rt.via === 'min') { if (reqAdj > d.min * 1.001) return; want = d.min; }
      // Max players get the max as the first-year salary, with raises on top.
      var sal = d.max && rt.via !== 'min' ? makeFirst(Y, Math.min(maxS, rt.max), y, rt.raise) : makeSalaries(Y, want, y, rt.raise);
      if (sal[0].amount > rt.max) {
        var f = rt.max / sal[0].amount;
        sal = makeSalaries(Y, want * f, y, rt.raise);
        if (want * f < reqAdj) return;
      }
      if (rt.via === 'min') sal = sal.map(function (s) { return { year: s.year, amount: d.min }; });
      var avg = sal.reduce(function (a, s) { return a + s.amount; }, 0) / sal.length;
      var cand = { salaries: sal, avg: avg, via: rt.via, required: reqAdj, tb: tb };
      if (!best || avg > best.avg) best = cand;
    });
    if (!best) return null;
    // Luxury tax caution
    var after = pay + best.salaries[0].amount;
    if (after > r.tax && best.via !== 'min' && !(dir === 'contend' && p.ovr >= 78) && !(isRights && p.ovr >= 82)) return null;
    var chk = canSign(state, abbr, p.id, best.salaries, { pay: pay, count: count });
    if (!chk.ok) return null;
    best.via = chk.via;
    return best;
  }

  // ---------------------------------------------------------------------------
  // Free agency days
  // ---------------------------------------------------------------------------
  function freeAgents(state) {
    var Y = contractYear(state), out = [];
    Object.keys(state.players).forEach(function (id) {
      var p = state.players[id];
      if (p.team !== 'FA' || p.retired) return;
      if (p.stashedUntil && p.stashedUntil > Y) return;
      out.push(p);
    });
    return out;
  }

  function seededRng(state) {
    var M = MOOD(), seed = ((state.rngSeed || 1) * 31 + (state.fa ? state.fa.day : 0) * 7919 + (state.fa ? state.fa.year : 0)) >>> 0;
    return M ? M.rng(seed) : Math.random;
  }

  function aiResign(state, ctx, rng) {
    var fa = state.fa, out = [];
    var ids = Object.keys(fa.rights).filter(function (id) { var r = fa.rights[id]; return r.team !== state.userTeam && state.players[id].team === 'FA'; });
    ids.sort(function (a, b) { return state.players[b].ovr - state.players[a].ovr; });
    ids.forEach(function (id) {
      var p = state.players[id], r = fa.rights[id], t = pers(p);
      var mood = typeof p.mood === 'number' ? p.mood : 55;
      if (mood < 25 && t.loyalty < 60) return;                                   // wants out
      if (p.ovr < 70 && !(p.age <= 24 && (p.pot || 0) >= 75)) return;            // replaceable: the team waits
      var test = clamp(0.15 + 0.35 * t.money / 100 - 0.35 * t.loyalty / 100 + (mood < 45 ? 0.2 : 0), 0.03, 0.6);
      if (r.rfa) test = Math.max(test, 0.4);                                     // let the market set the price
      if (rng() < test) return;                                                  // tests the market
      var d = demand(state, id, null, ctx);
      var bid = aiBid(state, ctx, r.team, p, d);
      if (!bid || bid.via !== 'bird' && bid.via !== 'min' && bid.via !== 'space') return;
      if (bid.avg < bid.required) return;
      out.push(sign(state, r.team, p, bid.salaries, bid.via, {}, ctx));
    });
    return out;
  }

  function openFreeAgency(state, rng) {
    var fa = state.fa;
    state.events = (state.events || []).filter(function (e) { return !(e.type === 'contractDecision' && (e.kind === 'teamOption' || e.kind === 'qualifyingOffer')); });
    var ctx = buildCtx(state);
    var re = aiResign(state, ctx, rng);
    fa.stage = 'open';
    return re;
  }

  function signingsPerDay(day) { return day >= 20 ? 3 : 2; }

  function aiSignings(state, ctx, rng, out) {
    var fa = state.fa, user = state.userTeam;
    var teams = Object.keys(state.teams).filter(function (a) { return a !== user; });
    var pending = {};
    fa.offerSheets.forEach(function (s) { pending[s.id] = 1; });
    var pool = freeAgents(state).filter(function (p) { return !pending[p.id]; });
    var mv = {};
    pool.forEach(function (p) { mv[p.id] = marketValue(state, p); });
    pool.sort(function (a, b) { return mv[b.id] - mv[a.id] || b.ovr - a.ovr; });
    var today = {};
    pool.forEach(function (p) {
      var d = demand(state, p.id, null, ctx);
      var best = null, n = 0;
      teams.forEach(function (abbr) {
        if ((today[abbr] || 0) >= signingsPerDay(fa.day)) return;
        if (ctx.count[abbr] >= MAX_ROSTER) return;
        var bid = aiBid(state, ctx, abbr, p, d);
        if (!bid || bid.avg < bid.required * 0.995) return;
        n++;
        var util = bid.avg / d.amount + bid.tb.bonus + (rng() - 0.5) * 0.04;
        if (!best || util > best.util) { best = bid; best.util = util; best.abbr = abbr; }
      });
      if (!best) return;
      var pSign = Math.min(0.92, (isStar(p) ? 0.5 : 0.35) + 0.04 * fa.day + 0.05 * Math.min(n, 4));
      if (rng() > pSign) return;
      today[best.abbr] = (today[best.abbr] || 0) + 1;
      var rights = fa.rights[p.id];
      if (rights && rights.rfa && rights.team !== best.abbr) out.offerSheets.push(offerSheet(state, best.abbr, p, best.salaries, best.via, {}, ctx));
      else out.signings.push(sign(state, best.abbr, p, best.salaries, best.via, {}, ctx));
    });
  }

  function processOfferSheets(state, ctx, rng, out, force) {
    var fa = state.fa;
    fa.offerSheets.slice().forEach(function (s) {
      if (s.rightsTeam === state.userTeam) {
        if (fa.day >= s.expires || force) { var r0 = resolveSheet(state, s, false, ctx); if (r0) out.signings.push(r0); }
        return;
      }
      if (fa.day <= s.day && !force) return;
      var rec = resolveSheet(state, s, aiWantsToMatch(state, s, ctx), ctx);
      if (rec) out.signings.push(rec);
    });
  }

  // Late free agency: teams under 13 fill with minimum deals; players take them as camp nears.
  function fillRosters(state, ctx, rng, out, final) {
    var fa = state.fa;
    var teams = Object.keys(state.teams).filter(function (a) { return final || a !== state.userTeam; });
    var pending = {};
    fa.offerSheets.forEach(function (s) { pending[s.id] = 1; });
    var pool = freeAgents(state).filter(function (p) { return !pending[p.id]; });
    pool.sort(function (a, b) { return b.ovr - a.ovr; });
    teams.sort(function (a, b) { return ctx.count[a] - ctx.count[b]; });
    var guard = 0;
    while (guard++ < 200) {
      var needy = teams.filter(function (a) { return ctx.count[a] < MIN_ROSTER; });
      if (!needy.length) break;
      needy.sort(function (a, b) { return ctx.count[a] - ctx.count[b]; });
      var abbr = needy[0], pick = null;
      for (var i = 0; i < pool.length; i++) {
        var p = pool[i];
        if (p.team !== 'FA') continue;
        var d = demand(state, p.id, null, ctx);
        var willing = final ? !isStar(p) || d.amount <= d.min * 1.5 : (d.amount <= d.min * 1.3 || fa.day >= 27 && !isStar(p));
        if (willing) { pick = p; break; }
      }
      if (!pick) pick = final ? replacement(state, abbr) : null;
      if (!pick) break;
      var Y = contractYear(state), min = minSalary(state, pick, Y);
      var sal = [{ year: Y, amount: min }];
      if (pick.age <= 27 && rng() < 0.4) sal.push({ year: Y + 1, amount: min });
      out.signings.push(sign(state, abbr, pick, sal, 'min', {}, ctx));
    }
  }

  // Last resort when the free agent pool is empty: a generic camp player on a minimum deal.
  function replacement(state, abbr) {
    var Y = contractYear(state), n = 1;
    while (state.players['rep' + Y + '_' + n]) n++;
    var id = 'rep' + Y + '_' + n;
    var p = { id: id, name: 'Camp Invite ' + n, team: 'FA', pos: 'SF', age: 24, ht: 79, wt: 215, ovr: 55, pot: 60, nbaId: null,
      injury: null, attrs: {}, contract: null, yearsPro: 0, yearsWithTeam: 0, draft: null, personality: { loyalty: 50, winning: 50, money: 50, market: 50, ego: 20 },
      mood: 60, stashedUntil: null, gleague: false, careerStats: [], awards: [], retired: false, hof: false, generated: true };
    state.players[id] = p;
    return p;
  }

  function trimRosters(state, ctx, out) {
    var Y = contractYear(state);
    Object.keys(state.teams).forEach(function (abbr) {
      while (ctx.count[abbr] > MAX_ROSTER) {
        var std = (ctx.rosters[abbr] || []).filter(function (p) { return !(p.contract && p.contract.twoWay); });
        // Release the player with the least guaranteed money left, worst overall first.
        std.sort(function (a, b) {
          var ga = a.contract ? a.contract.salaries.reduce(function (s, x) { return s + (x.year >= Y ? x.amount : 0); }, 0) : 0;
          var gb = b.contract ? b.contract.salaries.reduce(function (s, x) { return s + (x.year >= Y ? x.amount : 0); }, 0) : 0;
          return (a.ovr - b.ovr) + (ga - gb) / 5e5;
        });
        var cut = std[0];
        if (!cut) break;
        release(state, abbr, cut.id);
        out.released.push(cut.id);
        refreshTeam(state, ctx, abbr);
      }
    });
  }

  function signTwoWays(state, ctx, rng, out) {
    var Y = contractYear(state), r = rules(Y);
    if (!r.twoWay) return;
    var pool = freeAgents(state).filter(function (p) { return (p.yearsPro || 0) <= 3; });
    pool.sort(function (a, b) { return (b.pot + b.ovr) - (a.pot + a.ovr); });
    Object.keys(state.teams).forEach(function (abbr) {
      if (abbr === state.userTeam) return;
      while (twoWayCount(state, abbr) < r.twoWaySlots && pool.length) {
        var p = pool.shift();
        if (p.team !== 'FA') continue;
        out.signings.push(sign(state, abbr, p, [{ year: Y, amount: r.twoWaySalary }], 'twoWay', {}, ctx));
      }
    });
  }

  function retirements(state, rng, out) {
    freeAgents(state).forEach(function (p) {
      if (p.generated) { delete state.players[p.id]; return; }
      var a = p.age || 25;
      if (a < 34 || p.ovr >= 82) return;
      var chance = a >= 38 ? 1 : 0.35 + 0.12 * (a - 34);
      if (rng() >= chance) return;
      p.retired = true; p.team = 'RET'; p.retiredYear = state.fa.year - 1;
      if (state.fa.rights[p.id]) delete state.fa.rights[p.id];
      state.fa.retired.push(p.id);
      out.retired.push(p.id);
      log(state, 'retire', p.name + ' retires after going unsigned', [p.id]);
      if (p.ovr >= 76) news(state, p.name + ' retires', p.name + ' retires at ' + a + '.', [p.id]);
    });
  }

  function finish(state, ctx, rng, out) {
    var fa = state.fa, Y = contractYear(state);
    processOfferSheets(state, ctx, rng, out, true);
    // Unsigned restricted free agents take their qualifying offers.
    Object.keys(fa.rights).forEach(function (id) {
      var r = fa.rights[id], p = state.players[id];
      if (!r.rfa || p.team !== 'FA' || !isTeam(state, r.team)) return;
      var rec = sign(state, r.team, p, [{ year: Y, amount: r.qo }], 'qo', {}, ctx);
      rec.qualifyingOffer = true;
      out.signings.push(rec);
    });
    fillRosters(state, ctx, rng, out, true);
    trimRosters(state, ctx, out);
    signTwoWays(state, ctx, rng, out);
    retirements(state, rng, out);
    fa.stage = 'done';
    out.done = true;
  }

  function simDay(state, rng) {
    if (!state.fa || state.fa.year <= state.year && state.fa.stage === 'done') startOffseason(state);
    var fa = state.fa;
    rng = rng || seededRng(state);
    var out = { day: fa.day, signings: [], offerSheets: [], released: [], retired: [], done: false };
    if (fa.stage === 'done') { out.done = true; return out; }
    if (fa.stage === 'resign') out.signings = out.signings.concat(openFreeAgency(state, rng));
    fa.day++;
    out.day = fa.day;
    var ctx = buildCtx(state);
    processOfferSheets(state, ctx, rng, out, false);
    aiSignings(state, ctx, rng, out);
    if (fa.day >= 20) fillRosters(state, ctx, rng, out, false);
    if (fa.day >= fa.length) finish(state, ctx, rng, out);
    return out;
  }

  // Runs the remaining free agency days.
  function finishFreeAgency(state, rng) {
    var all = [];
    var guard = 0;
    while (state.fa && state.fa.stage !== 'done' && guard++ < 100) all.push(simDay(state, rng));
    return all;
  }

  function release(state, abbr, id) {
    var p = state.players[id];
    if (!p || p.team !== abbr) return { ok: false, message: 'Not on ' + abbr };
    var Y = contractYear(state), dead = 0, t = state.teams[abbr];
    t.deadMoney = t.deadMoney || [];
    if (p.contract && !p.contract.twoWay) {
      p.contract.salaries.forEach(function (s) {
        if (s.year >= Y) { t.deadMoney.push({ year: s.year, amount: s.amount, id: id }); dead += s.amount; }
      });
    }
    p.lastTeam = abbr; p.team = 'FA'; p.contract = null; p.yearsWithTeam = 0;
    if (state.fa && state.fa.rights[id]) delete state.fa.rights[id];
    if (state.fa) state.fa.released.push({ id: id, abbr: abbr, day: state.fa.day, dead: dead, seq: state.fa.seq = (state.fa.seq || 0) + 1 });
    log(state, 'release', abbr + ' waives ' + p.name + (dead ? ' (' + money(dead) + ' dead money)' : ''), [id]);
    return { ok: true, dead: dead, message: p.name + ' waived' + (dead ? '; ' + money(dead) + ' stays on the books' : '') };
  }

  var FA = {
    FA_DAYS: FA_DAYS, MAX_ROSTER: MAX_ROSTER, MIN_ROSTER: MIN_ROSTER,
    rules: rules, contractYear: contractYear, payroll: payroll, rosterCount: rosterCount, twoWayCount: twoWayCount,
    minSalary: minSalary, maxSalary: maxSalary, prevSalary: prevSalary, makeFirst: makeFirst, marketValue: marketValue, demand: demand, teamBonus: teamBonus,
    canSign: canSign, birdLimit: birdLimit, makeSalaries: makeSalaries, makeRookieContract: makeRookieContract,
    contractsFromSalary: contractsFromSalary, salaryFor: salaryFor,
    startOffseason: startOffseason, resignWindow: resignWindow, decideOption: decideOption,
    setQualifyingOffer: setQualifyingOffer, renounce: renounce, matchOfferSheet: matchOfferSheet,
    offer: offer, simDay: simDay, finish: finishFreeAgency, release: release, freeAgents: freeAgents
  };

  if (typeof window !== 'undefined') window.FA = FA;
  if (typeof module !== 'undefined' && module.exports) module.exports = FA;
})();
