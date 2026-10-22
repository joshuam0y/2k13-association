/* 2K13 Association: CBA rules, payroll, signing checks and trade salary matching.
   Classic script on window.CBA (module.exports under Node). Data: data/cap-history.js (window.CAP_HISTORY).

   Years are season-ending years (2013 = 2012-13). Three CBA eras:
     "2011" for 2013 to 2017, "2017" for 2018 to 2023, "2023" from 2024 on.

   API (contract-v2.md, plus helpers):
     CBA.rules(year) -> { year, era, projected, cap, tax, apron, apron2, minPayroll, maxPct: [25,30,35],
                          maxTiers: [0-6, 7-9, 10+ dollars], supermax, maxSalary(yearsPro, opts),
                          minScale: [0..10+], minSalary(yearsPro), rookieScale(pick) (year 1 scale, 100%),
                          mle, taxMle, roomException, bae, twoWay, maxTwoWay (slots), twoWaySlots,
                          twoWaySalary, playIn, nbaCup, lotteryOdds, lotteryDraws, seasonGames, seasonNote,
                          rosterMin, rosterMax, offseasonRosterMax, raise, birdRaise, maxYears }
     CBA.rookieScale(pick, year) -> { pick, year, amount, salaries: [4 x 100% scale], guaranteedYears: 2,
                          teamOptionYears: [year+2, year+3], qualifyingOffer, min, max }
     CBA.rookieContract(pick, year, pct) -> contract object (salaries, option, options, rookie: true)
     CBA.payroll(state, abbr, year)   NBA contracts + dead money (two-way and stashed players excluded)
     CBA.capSpace(state, abbr, year)  cap minus payroll, never below 0
     CBA.capStatus(state, abbr, year) -> { payroll, cap, space, overCap, overTax, overApron, overApron2 }
     CBA.birdRights(state, abbr, playerId, year) -> "full" | "early" | "non" | null
     CBA.canSign(state, abbr, playerId, salaries, opts) -> { ok, via, exception, reason, maxYears }
        via is "space" | "mle" | "room" | "bae" | "min" | "bird" | "rookie" | "twoWay"
        (room and bae are the room and bi-annual exceptions; tax: true marks the taxpayer MLE).
        opts: { year, twoWay, rookie, pick, bird ("full"|"early"|"non"), used: { space, mle, room, bae },
                supermax, pay, count, ignoreRoster }
     CBA.validateTrade(state, trade, opts) -> { ok, reasons: [], warnings: [], teams: { abbr: {...} } }
     CBA.maxIncoming(year, outgoing, status) era salary matching for one team
     CBA.luxuryTax(state, abbr, year, repeater) tax bill (approximate brackets)
     CBA.salaryYear(state) the season whose salaries count now (next season during the offseason) */
(function (root) {
  "use strict";
  var G = typeof window !== "undefined" ? window : root;
  var OFFSEASON = ["draftLottery", "draft", "resign", "freeAgency", "training"];
  var IN_SEASON = { preseason: 1, regular: 1, playoffs: 1 };

  function hist() {
    var h = (G && G.CAP_HISTORY) || (root && root.CAP_HISTORY) || null;
    if (!h && typeof require === "function") {
      try { h = require("../data/cap-history.js"); } catch (e) { h = null; }
    }
    if (!h) throw new Error("CBA: data/cap-history.js (window.CAP_HISTORY) is not loaded");
    return h;
  }

  function r1000(x) { return Math.round(x / 1000) * 1000; }
  function r100(x) { return Math.round(x / 100) * 100; }
  function isArr(a) { return Object.prototype.toString.call(a) === "[object Array]"; }
  function money(x) {
    var v = Math.abs(x) / 1e6, s = v >= 10 ? v.toFixed(2) : v.toFixed(3);
    s = s.replace(/0+$/, "").replace(/\.$/, "");
    return (x < 0 ? "-$" : "$") + s + "M";
  }
  function seasonLabel(y) { return (y - 1) + "-" + String(y).slice(2); }

  function eraOf(year) { return year <= 2017 ? "2011" : year <= 2023 ? "2017" : "2023"; }

  // ---------------------------------------------------------------------------
  // Season figures (real through 2027, then 4.5% a year)
  // ---------------------------------------------------------------------------
  var MONEY_KEYS = ["cap", "tax", "apron", "apron2", "minPayroll", "mle", "taxMle", "roomException", "bae"];

  function rawSeason(year) {
    var H = hist(), S = H.seasons, last = H.lastRealYear || 2027;
    var y = year < 2013 ? 2013 : year;
    if (S[y]) {
      var s = {};
      for (var k in S[y]) s[k] = S[y][k];
      s.projected = false; s.growth = 1;
      return s;
    }
    var base = S[last], g = Math.pow(1 + (H.growthAfter || 0.045), y - last), out = { projected: true, growth: g };
    MONEY_KEYS.forEach(function (k) { out[k] = base[k] == null ? null : r1000(base[k] * g); });
    out.minSalary0 = Math.round(base.minSalary0 * g);
    out.minSalary10 = Math.round(base.minSalary10 * g);
    return out;
  }

  function minScaleFor(year, s) {
    if (s.minScale && !s.projected) return s.minScale.slice();
    var shape = hist().minScaleShape, f = s.minSalary0 / shape[0], out = [];
    for (var i = 0; i < shape.length; i++) out.push(Math.round(shape[i] * f));
    out[0] = s.minSalary0; out[10] = s.minSalary10;
    return out;
  }

  function maxTiersFor(year, s) {
    if (s.maxSalary && !s.projected) return s.maxSalary.slice();
    return [Math.round(s.cap * 0.25), Math.round(s.cap * 0.30), Math.round(s.cap * 0.35)];
  }

  // 2012-13 scale grown with the cap for later seasons (rounded to $100 like the real tables).
  function rookieRow(pick, year) {
    var H = hist(), rows = H.rookieScale2013;
    if (!(pick >= 1 && pick <= rows.length)) return null;
    var row = rows[pick - 1], f = year <= 2013 ? 1 : rawSeason(year).cap / H.seasons[2013].cap;
    var y1 = r100(row[0] * f), y2 = r100(row[1] * f), y3 = r100(row[2] * f);
    var y4 = Math.round(y3 * (1 + row[3]));
    return { salaries: [y1, y2, y3, y4], y4Raise: row[3], qoRaise: row[4] };
  }

  var ruleCache = {};
  function rules(year) {
    year = Math.round(+year || 2013);
    if (ruleCache[year]) return ruleCache[year];
    var H = hist(), s = rawSeason(year), era = eraOf(year);
    var minScale = minScaleFor(year, s), maxTiers = maxTiersFor(year, s);
    var twoWay = year >= 2018, slots = !twoWay ? 0 : year >= 2024 ? 3 : 2;
    var tws = !twoWay ? 0 : (H.twoWaySalary && H.twoWaySalary[year]) || Math.round(minScale[0] / 2);
    var games = year === 2020 || year === 2021 ? 72 : 82;
    var r = {
      year: year, era: era, label: seasonLabel(year), projected: !!s.projected,
      cap: s.cap, tax: s.tax, apron: s.apron, apron2: s.apron2 || null,
      firstApron: s.apron, secondApron: s.apron2 || null,
      minPayroll: s.minPayroll,
      maxPct: [25, 30, 35], maxTiers: maxTiers, supermax: year >= 2018,
      minScale: minScale,
      mle: s.mle, taxMle: s.taxMle, roomException: s.roomException, bae: s.bae,
      twoWay: twoWay, maxTwoWay: slots, twoWaySlots: slots, twoWaySalary: tws, twoWayMaxService: 3, twoWayMaxYears: 2,
      playIn: year >= 2021, nbaCup: year >= 2024,
      lotteryOdds: (year >= 2019 ? H.lotteryOdds.from2019 : H.lotteryOdds.pre2019).slice(),
      lotteryDraws: year >= 2019 ? 4 : 3,
      seasonGames: games, seasonNote: (H.seasonNotes && H.seasonNotes[year]) || null,
      shortened: year === 2020 ? "bubble" : year === 2021 ? "72 games" : null,
      rosterMin: 13, rosterMax: 15, offseasonRosterMax: 20,
      raise: era === "2011" ? 0.045 : 0.05, birdRaise: era === "2011" ? 0.075 : 0.08,
      maxYears: { bird: 5, other: 4, mle: 4, taxMle: era === "2023" ? 2 : 3, room: era === "2023" ? 3 : 2, bae: 2, min: 2 },
      tradeCushion: era === "2023" ? 0 : 100000
    };
    r.minSalary = function (yearsPro) {
      var i = Math.max(0, Math.min(10, Math.floor(+yearsPro || 0)));
      return minScale[i];
    };
    r.maxSalary = function (yearsPro, opts) {
      opts = opts || {};
      var yp = +yearsPro || 0, t = yp >= 10 ? 2 : yp >= 7 ? 1 : 0;
      if (opts.supermax && r.supermax && yp >= 7) t = 2;
      var m = maxTiers[t];
      if (opts.prevSalary) m = Math.max(m, Math.round(opts.prevSalary * 1.05));
      return m;
    };
    r.rookieScale = function (pick) { var row = rookieRow(pick, year); return row ? row.salaries[0] : 0; };
    r.rookieScaleRow = function (pick) { var row = rookieRow(pick, year); return row ? row.salaries.slice() : null; };
    ruleCache[year] = r;
    return r;
  }

  function maxSalary(yearsPro, year, opts) { return rules(year).maxSalary(yearsPro, opts); }
  function minSalary(yearsPro, year) { return rules(year).minSalary(yearsPro); }

  // ---------------------------------------------------------------------------
  // Rookie scale
  // ---------------------------------------------------------------------------
  function rookieScale(pick, year) {
    var row = rookieRow(pick, year);
    if (!row) return null;
    var s = row.salaries;
    return {
      pick: pick, year: year, amount: s[0], salaries: s.slice(),
      years: [year, year + 1, year + 2, year + 3],
      guaranteedYears: 2, teamOptionYears: [year + 2, year + 3],
      y4Raise: row.y4Raise, qoRaise: row.qoRaise,
      qualifyingOffer: Math.round(s[3] * (1 + row.qoRaise)),
      min: s.map(function (x) { return Math.round(x * 0.8); }),
      max: s.map(function (x) { return Math.round(x * 1.2); })
    };
  }

  function rookieContract(pick, year, pct) {
    var sc = rookieScale(pick, year);
    if (!sc) return null;
    pct = pct == null ? 1.2 : Math.max(0.8, Math.min(1.2, pct));
    var sal = sc.salaries.map(function (x, i) { return { year: year + i, amount: Math.round(x * pct) }; });
    var options = [{ year: year + 2, type: "team" }, { year: year + 3, type: "team" }];
    return { salaries: sal, option: options[0], options: options, rookie: true, twoWay: false,
             signedYear: year, round: 1, pick: pick };
  }

  // ---------------------------------------------------------------------------
  // Payroll
  // ---------------------------------------------------------------------------
  function salaryYear(state) {
    if (!state) return 2013;
    return OFFSEASON.indexOf(state.phase) >= 0 ? state.year + 1 : state.year;
  }

  function salaryOf(p, year) {
    if (!p) return 0;
    var c = p.contract;
    if (c && isArr(c.salaries)) {
      for (var i = 0; i < c.salaries.length; i++) if (c.salaries[i].year === year) return c.salaries[i].amount || 0;
      return 0;
    }
    if (!c && p.salary && p.contractEnd && p.contractEnd >= year && p.team !== "FA") return p.salary;
    return 0;
  }
  function isTwoWay(p) { return !!(p && p.contract && p.contract.twoWay); }
  function isStashed(p, year) { return !!(p && p.stashedUntil != null && p.stashedUntil > year); }
  function onTeam(p, abbr) { return p && p.team === abbr && !p.retired; }

  function teamPlayers(state, abbr) {
    var out = [], P = (state && state.players) || {};
    for (var id in P) if (onTeam(P[id], abbr)) out.push(P[id]);
    return out;
  }

  function payroll(state, abbr, year) {
    if (year == null) year = salaryYear(state);
    var sum = 0, P = (state && state.players) || {};
    for (var id in P) {
      var p = P[id];
      if (!onTeam(p, abbr) || isTwoWay(p) || isStashed(p, year)) continue;
      sum += salaryOf(p, year);
    }
    var t = state && state.teams && state.teams[abbr];
    if (t && isArr(t.deadMoney)) t.deadMoney.forEach(function (d) { if (d && d.year === year) sum += d.amount || 0; });
    return sum;
  }

  function capSpace(state, abbr, year) {
    if (year == null) year = salaryYear(state);
    return Math.max(0, rules(year).cap - payroll(state, abbr, year));
  }

  function capStatus(state, abbr, year) {
    if (year == null) year = salaryYear(state);
    var r = rules(year), pay = payroll(state, abbr, year);
    return { year: year, payroll: pay, cap: r.cap, space: Math.max(0, r.cap - pay), overCap: pay > r.cap,
             overTax: pay > r.tax, overApron: pay > r.apron, overApron2: r.apron2 != null && pay > r.apron2,
             minPayroll: r.minPayroll, belowMinimum: pay < r.minPayroll };
  }

  function rosterCount(state, abbr, year) {
    if (year == null) year = salaryYear(state);
    var n = 0;
    teamPlayers(state, abbr).forEach(function (p) { if (!isTwoWay(p) && !isStashed(p, year)) n++; });
    return n;
  }
  function twoWayCount(state, abbr) {
    var n = 0;
    teamPlayers(state, abbr).forEach(function (p) { if (isTwoWay(p)) n++; });
    return n;
  }

  // Luxury tax bill. 2012-13: $1 per $1. From 2013-14: $5M brackets at 1.5, 1.75, 2.5, 3.25, then +0.5
  // each (repeaters +1.0). Brackets grow with the cap from 2023-24 (approximate).
  function luxuryTax(state, abbr, year, repeater) {
    if (year == null) year = salaryYear(state);
    var r = rules(year), over = payroll(state, abbr, year) - r.tax;
    return taxBill(over, year, repeater);
  }
  function taxBill(over, year, repeater) {
    if (!(over > 0)) return 0;
    if (year <= 2013) return Math.round(over);
    var r = rules(year), step = year >= 2024 ? 5000000 * r.cap / rules(2024).cap : 5000000;
    var rates = repeater ? [2.5, 2.75, 3.5, 4.25] : [1.5, 1.75, 2.5, 3.25], bill = 0, i = 0;
    while (over > 0) {
      var part = Math.min(over, step), rate = i < 4 ? rates[i] : rates[3] + 0.5 * (i - 3);
      bill += part * rate; over -= part; i++;
    }
    return Math.round(bill);
  }

  // ---------------------------------------------------------------------------
  // Bird rights
  // ---------------------------------------------------------------------------
  // Seasons with the team: the biggest of player.birdYears (kept by free agency, travels in trades),
  // player.yearsWithTeam, and seasons already played on the current contract.
  function birdYears(state, abbr, p, year) {
    if (!p) return 0;
    var n = Math.max(+p.birdYears || 0, +p.yearsWithTeam || 0);
    var c = p.contract;
    if (c && c.signedYear != null && (p.team === abbr || p.lastTeam === abbr)) {
      var played = 0;
      if (isArr(c.salaries)) c.salaries.forEach(function (s) { if (s.year < year && s.year >= c.signedYear) played++; });
      n = Math.max(n, played, Math.max(0, year - c.signedYear));
    }
    return n;
  }
  function birdRights(state, abbr, playerId, year) {
    var p = state && state.players && state.players[playerId];
    if (!p) return null;
    if (year == null) year = salaryYear(state);
    var holds = p.team === abbr || p.lastTeam === abbr ||
      (state.fa && state.fa.rights && state.fa.rights[playerId] && state.fa.rights[playerId].team === abbr);
    if (!holds) return null;
    var n = birdYears(state, abbr, p, year);
    return n >= 3 ? "full" : n >= 2 ? "early" : n >= 1 ? "non" : null;
  }

  function lastSalary(p, year) {
    var c = p && p.contract, best = 0, by = -1;
    if (c && isArr(c.salaries)) c.salaries.forEach(function (s) { if (s.year < year && s.year > by) { by = s.year; best = s.amount || 0; } });
    if (!best && p && p.salary) best = p.salary;
    return best;
  }

  // ---------------------------------------------------------------------------
  // canSign
  // ---------------------------------------------------------------------------
  function normSalaries(salaries, year) {
    if (!isArr(salaries)) salaries = [salaries];
    return salaries.map(function (s, i) {
      if (typeof s === "number") return { year: year + i, amount: s };
      return { year: s.year != null ? s.year : year + i, amount: +s.amount || 0 };
    });
  }

  function raiseProblem(sal, limit) {
    var first = sal[0].amount;
    for (var i = 1; i < sal.length; i++) {
      var d = sal[i].amount - sal[i - 1].amount;
      if (Math.abs(d) > first * limit + 1) return "Raises are limited to " + Math.round(limit * 1000) / 10 + "% of the first-year salary";
    }
    return null;
  }

  function canSign(state, abbr, playerId, salaries, opts) {
    opts = opts || {};
    var p = state && state.players && state.players[playerId];
    if (!p) return { ok: false, reason: "Unknown player" };
    var Y = opts.year != null ? opts.year : (isArr(salaries) && salaries[0] && salaries[0].year != null ? salaries[0].year : salaryYear(state));
    var sal = normSalaries(salaries, Y), r = rules(Y);
    if (!sal.length || !(sal[0].amount > 0)) return { ok: false, reason: "No salary given" };
    var first = sal[0].amount, n = sal.length, yp = +p.yearsPro || 0;
    var used = opts.used || {};

    // two-way
    if (opts.twoWay) {
      if (!r.twoWay) return { ok: false, reason: "Two-way contracts start in 2017-18" };
      if (yp > r.twoWayMaxService) return { ok: false, reason: "Two-way contracts are for players with 0 to " + r.twoWayMaxService + " years of service" };
      if (n > r.twoWayMaxYears) return { ok: false, reason: "Two-way contracts are at most " + r.twoWayMaxYears + " years" };
      var tw = twoWayCount(state, abbr) - (isTwoWay(p) && p.team === abbr ? 1 : 0);
      if (tw >= r.twoWaySlots) return { ok: false, reason: "No two-way slots left (" + r.twoWaySlots + " in " + r.label + ")" };
      return { ok: true, via: "twoWay", exception: "twoWay", maxYears: r.twoWayMaxYears };
    }

    // roster room
    var inSeason = !!IN_SEASON[state.phase];
    var cap = inSeason ? r.rosterMax : r.offseasonRosterMax;
    var cnt = opts.count != null ? opts.count : rosterCount(state, abbr, Y) - (p.team === abbr && !isTwoWay(p) ? 1 : 0);
    if (!opts.ignoreRoster && cnt >= cap) return { ok: false, reason: "Roster is full (" + cap + " NBA contracts)" };

    // rookie scale (first round picks)
    if (opts.rookie || (opts.pick && opts.pick <= 30)) {
      var row = rookieRow(opts.pick || 30, Y);
      if (!row) return { ok: false, reason: "Rookie scale covers first round picks 1 to 30" };
      if (first > row.salaries[0] * 1.2 + 1) return { ok: false, reason: "More than 120% of the rookie scale (" + money(row.salaries[0] * 1.2) + ")" };
      if (first < row.salaries[0] * 0.8 - 1) return { ok: false, reason: "Less than 80% of the rookie scale (" + money(row.salaries[0] * 0.8) + ")" };
      return { ok: true, via: "rookie", exception: "rookieScale", maxYears: 4 };
    }

    // maximum salary
    var prev = opts.rights && opts.rights.prev ? opts.rights.prev : lastSalary(p, Y);
    var max = r.maxSalary(yp, { supermax: !!opts.supermax, prevSalary: prev });
    if (first > max + 1) return { ok: false, reason: "More than the maximum salary for " + yp + " years of service (" + money(max) + ")" };

    var pay = opts.pay != null ? opts.pay : payroll(state, abbr, Y) - (p.team === abbr ? salaryOf(p, Y) : 0);
    var after = pay + first;

    // Bird rights (re-signing own free agent)
    // When the caller passes rights or bird (free agency does), trust them; otherwise work it out here.
    var given = Object.prototype.hasOwnProperty.call(opts, "bird") || Object.prototype.hasOwnProperty.call(opts, "rights");
    var bird = opts.bird || (opts.rights && opts.rights.bird) || (given ? null : birdRights(state, abbr, playerId, Y));
    if (opts.rights && ((opts.rights.team && opts.rights.team !== abbr) || opts.rights.renounced)) bird = null;
    if (bird && (p.team === abbr || p.team === "FA" || p.lastTeam === abbr || opts.bird)) {
      var lim = bird === "full" ? max
        : bird === "early" ? Math.min(max, Math.max(prev * 1.75, r.cap * 0.09 * 1.05))
        : Math.min(max, Math.max(prev * 1.2, r.minSalary(yp) * 1.2));
      var by = bird === "full" ? r.maxYears.bird : r.maxYears.other;
      if (first <= lim + 1 && n <= by) {
        var rp = raiseProblem(sal, r.birdRaise);
        if (!rp) return { ok: true, via: "bird", exception: bird === "full" ? "bird" : bird === "early" ? "earlyBird" : "nonBird", maxYears: by };
      }
    }

    // minimum (any team, up to 2 years)
    if (first <= r.minSalary(yp) + 1 && n <= r.maxYears.min) return { ok: true, via: "min", exception: "minimum", maxYears: r.maxYears.min };

    if (n > r.maxYears.other) return { ok: false, reason: "Only Bird rights allow a " + n + "-year deal" };
    var rpo = raiseProblem(sal, r.raise);
    if (rpo) return { ok: false, reason: rpo };

    // cap space
    if (after <= r.cap) return { ok: true, via: "space", exception: "capSpace", maxYears: r.maxYears.other };

    // mid-level exceptions (non-taxpayer MLE hard caps at the first apron)
    if (!used.space && !used.mle) {
      if (after <= r.apron && first <= r.mle + 1 && n <= r.maxYears.mle)
        return { ok: true, via: "mle", exception: "nonTaxpayerMle", maxYears: r.maxYears.mle };
      var taxOk = r.apron2 != null ? after <= r.apron2 : true;
      if (taxOk && first <= r.taxMle + 1 && n <= r.maxYears.taxMle)
        return { ok: true, via: "mle", tax: true, exception: "taxpayerMle", maxYears: r.maxYears.taxMle };
    }
    // room exception: teams that went under the cap
    if (pay < r.cap && !used.room && first <= r.roomException + 1 && n <= r.maxYears.room)
      return { ok: true, via: "room", exception: "roomMle", maxYears: r.maxYears.room };
    // bi-annual: below the apron after signing
    if (!used.space && !used.bae && after <= r.apron && first <= r.bae + 1 && n <= r.maxYears.bae)
      return { ok: true, via: "bae", exception: "biAnnual", maxYears: r.maxYears.bae };

    return { ok: false, reason: "No cap space and no exception fits: payroll " + money(pay) + ", cap " + money(r.cap) +
      ", MLE " + money(r.mle) + (bird ? "" : " (no Bird rights)") };
  }

  // ---------------------------------------------------------------------------
  // Trades
  // ---------------------------------------------------------------------------
  // Most a team may take back for `outgoing` dollars. status: { overTax, overApron, overApron2 } after the trade.
  function maxIncoming(year, outgoing, status) {
    status = status || {};
    var r = rules(year), era = r.era, out = +outgoing || 0;
    if (era === "2011") {
      if (status.overTax) return out * 1.25 + 100000;
      if (out <= 9800000) return out * 1.5 + 100000;
      if (out <= 19600000) return out + 5000000;
      return out * 1.25 + 100000;
    }
    if (era === "2017") {
      if (status.overTax) return out * 1.25 + 100000;
      var f = r.cap / rules(2018).cap, t1 = 6533333 * f, t2 = 19600000 * f;
      if (out <= t1) return out * 1.75 + 100000;
      if (out <= t2) return out + 5000000 * f;
      return out * 1.25 + 100000;
    }
    // 2023 CBA
    if (year === 2024) { if (status.overApron || status.overApron2) return out * 1.10; }
    else if (status.overApron || status.overApron2) return out;
    var g = r.cap / rules(2024).cap, b1 = 7500000 * g, b2 = 29000000 * g;
    if (out <= b1) return out * 2 + 250000;
    if (out <= b2) return out + 7500000 * g;
    return out * 1.25 + 250000;
  }

  function matchRuleText(year, status) {
    var r = rules(year);
    if (r.era === "2011") return status.overTax ? "125% + $100,000 for a team over the tax after the trade"
      : "150% + $100,000 up to $9.8M, outgoing + $5M up to $19.6M, then 125% + $100,000";
    if (r.era === "2017") return status.overTax ? "125% + $100,000 for a team over the tax after the trade"
      : "175% + $100,000, outgoing + $5M, or 125% + $100,000 by size";
    if (status.overApron || status.overApron2) return year === 2024 ? "110% for a team over an apron after the trade"
      : "100% for a team over the first apron after the trade";
    return "200% + $250,000, outgoing + $7.5M, or 125% + $250,000 by size";
  }

  function teamLabel(state, abbr) {
    var t = state && state.teams && state.teams[abbr];
    return t && t.city ? t.city + " " + (t.name || "") : abbr;
  }
  function currentDate(state) {
    var s = state && state.season;
    if (!s || !isArr(s.days) || !s.days.length) return null;
    var d = s.days[Math.min(s.day || 0, s.days.length - 1)];
    return d && d.date ? d.date : null;
  }
  function pickKey(k) { return k ? (k.year + ":" + k.round + ":" + k.original) : ""; }

  // Players each team receives. Two-team trades: everything goes to the other side. Larger trades need
  // give[abbr].to = { playerId: destAbbr } (picks may carry a .to field).
  function flows(trade) {
    var teams = trade.teams || Object.keys(trade.give || {}), give = trade.give || {}, F = {}, err = [];
    teams.forEach(function (a) { F[a] = { outP: [], inP: [], outK: [], inK: [] }; });
    teams.forEach(function (a) {
      var g = give[a] || {}, others = teams.filter(function (b) { return b !== a; });
      (g.players || []).forEach(function (id) {
        var dest = g.to && g.to[id] ? g.to[id] : others.length === 1 ? others[0] : null;
        if (!dest || !F[dest]) { err.push("Say which team receives each player in a " + teams.length + "-team trade."); return; }
        F[a].outP.push(id); F[dest].inP.push(id);
      });
      (g.picks || []).forEach(function (k) {
        var dest = k && k.to ? k.to : others.length === 1 ? others[0] : null;
        if (!dest || !F[dest]) { err.push("Say which team receives each pick in a " + teams.length + "-team trade."); return; }
        F[a].outK.push(k); F[dest].inK.push(k);
      });
    });
    return { F: F, errors: err };
  }

  function validateTrade(state, trade, opts) {
    opts = opts || {};
    var res = { ok: true, reasons: [], warnings: [], teams: {} };
    function bad(msg) { res.ok = false; if (res.reasons.indexOf(msg) < 0) res.reasons.push(msg); }
    if (!trade || !trade.give) { bad("Empty trade."); return res; }
    var teams = trade.teams || Object.keys(trade.give);
    if (teams.length < 2) { bad("A trade needs at least two teams."); return res; }
    var Y = trade.year != null ? trade.year : salaryYear(state), r = rules(Y);
    var fl = flows(trade), F = fl.F;
    fl.errors.forEach(bad);
    var P = state.players || {};
    var inSeason = !!IN_SEASON[state.phase] || OFFSEASON.indexOf(state.phase) < 0;
    var date = currentDate(state);

    teams.forEach(function (a) {
      if (!state.teams || !state.teams[a]) bad("Unknown team " + a + ".");
      var f = F[a];
      f.outP.forEach(function (id) {
        var p = P[id];
        if (!p) { bad("Unknown player " + id + "."); return; }
        if (p.team !== a || p.retired) bad(p.name + " is not on " + teamLabel(state, a) + ".");
        // recently signed free agents: 3 months or December 15, whichever is later
        var c = p.contract;
        if (!opts.skipRecentSigning && c && !c.rookie && !c.twoWay && c.signedYear === Y && c.via) {
          var dec15 = (Y - 1) + "-12-15", blocked = false;
          if (OFFSEASON.indexOf(state.phase) >= 0) blocked = true;
          else if (date && date < dec15) blocked = true;
          if (c.signedDay != null && state.day != null && state.day - c.signedDay < 90) blocked = true;
          if (blocked) bad(p.name + " signed recently and cannot be traded until December 15 (or 3 months after signing).");
        }
      });
      f.outK.forEach(function (k) {
        var t = state.teams && state.teams[a];
        if (!t || !isArr(t.picks)) return;
        var have = t.picks.some(function (q) { return pickKey(q) === pickKey(k); });
        if (!have) bad(teamLabel(state, a) + " does not own the " + k.year + " " + (k.round === 1 ? "first" : "second") + " round pick (" + k.original + ").");
      });
    });

    teams.forEach(function (a) {
      var f = F[a];
      var out = 0, inn = 0, outMax = 0, outCount = 0, inRoster = 0, outRoster = 0, inTw = 0, outTw = 0;
      f.outP.forEach(function (id) {
        var p = P[id]; if (!p) return;
        if (isTwoWay(p)) { outTw++; return; }
        var s = salaryOf(p, Y); out += s; if (s > outMax) outMax = s; if (s > 0) outCount++;
        if (!isStashed(p, Y)) outRoster++;
      });
      f.inP.forEach(function (id) {
        var p = P[id]; if (!p) return;
        if (isTwoWay(p)) { inTw++; return; }
        inn += salaryOf(p, Y);
        if (!isStashed(p, Y)) inRoster++;
      });
      var pay = payroll(state, a, Y), after = pay - out + inn;
      var status = { overCap: after > r.cap, overTax: after > r.tax, overApron: after > r.apron,
                     overApron2: r.apron2 != null && after > r.apron2 };
      var info = { outgoing: out, incoming: inn, payrollBefore: pay, payrollAfter: after, status: status, allowed: null };
      res.teams[a] = info;

      // salary matching
      if (inn > out && after > r.cap + r.tradeCushion) {
        var allowed = maxIncoming(Y, out, status);
        info.allowed = allowed;
        if (inn > allowed + 0.5) {
          bad(teamLabel(state, a) + " would take back " + money(inn) + " for " + money(out) + " outgoing; " + r.label +
              " rules allow " + money(Math.floor(allowed)) + " (" + matchRuleText(Y, status) + ").");
        }
      }
      // second apron: no aggregating salaries (2024-25 on)
      if (r.era === "2023" && Y >= 2025 && status.overApron2 && outCount > 1 && inn > outMax) {
        bad(teamLabel(state, a) + " would be over the second apron and cannot combine salaries to take back a bigger contract.");
      }

      // rosters
      var before = rosterCount(state, a, Y), rosterAfter = before - outRoster + inRoster;
      var maxR = inSeason ? r.rosterMax : r.offseasonRosterMax;
      info.rosterAfter = rosterAfter;
      if (rosterAfter > maxR && rosterAfter > before) bad(teamLabel(state, a) + " would have " + rosterAfter + " NBA contracts (limit " + maxR + ").");
      if (inSeason && rosterAfter < r.rosterMin && rosterAfter < before) {
        res.warnings.push(teamLabel(state, a) + " would drop to " + rosterAfter + " players and must sign up to " + r.rosterMin + " within two weeks.");
      }
      if (inTw > outTw) {
        var tw = twoWayCount(state, a) - outTw + inTw;
        if (!r.twoWay) bad("Two-way contracts do not exist in " + r.label + ".");
        else if (tw > r.twoWaySlots) bad(teamLabel(state, a) + " would have " + tw + " two-way players (limit " + r.twoWaySlots + ").");
      }
    });

    var any = teams.some(function (a) { return F[a].outP.length || F[a].outK.length; });
    if (!any) bad("Nothing is being traded.");
    return res;
  }

  var CBA = {
    rules: rules, eraOf: eraOf, salaryYear: salaryYear, salaryOf: salaryOf,
    maxSalary: maxSalary, minSalary: minSalary, rookieScale: rookieScale, rookieContract: rookieContract,
    payroll: payroll, capSpace: capSpace, capStatus: capStatus, rosterCount: rosterCount, twoWayCount: twoWayCount,
    birdRights: birdRights, canSign: canSign, maxIncoming: maxIncoming, validateTrade: validateTrade,
    luxuryTax: luxuryTax, taxBill: taxBill, money: money
  };

  if (typeof window !== "undefined") window.CBA = CBA;
  else if (root) root.CBA = CBA;
  if (typeof module !== "undefined" && module.exports) module.exports = CBA;
})(typeof self !== "undefined" ? self : this);
