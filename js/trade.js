/* Trades and the AI GM: player and pick values, AI trade evaluation, the trade finder,
   the trading block (shop), AI offers to the user, AI to AI trades and trade execution.
   Plain classic script on window.TRADE (module.exports for Node). Uses window.CBA when it is loaded,
   otherwise a simple 2012 CBA check (125% + $100,000 salary matching for teams over the cap). */
(function (root) {
  "use strict";
  var W = root;

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  var BASE_CAP = 58044000;          // 2012-13 salary cap
  var BASE_TAX = 70307000;          // 2012-13 luxury tax line
  var ROSTER_MIN = 13, ROSTER_MAX = 15, OFFSEASON_MAX = 20;   // offseason rosters may carry up to 20 (CBA)
  var OFFSEASON = ["draftLottery", "draft", "resign", "freeAgency", "training"];
  // Real trade deadlines by season-ending year (month-day); later seasons use the recent early-February date
  var DEADLINES = { 2013: "02-21", 2014: "02-20", 2015: "02-19", 2016: "02-18", 2017: "02-23", 2018: "02-08", 2019: "02-07",
    2020: "02-06", 2021: "03-25", 2022: "02-10", 2023: "02-09", 2024: "02-08", 2025: "02-06", 2026: "02-05" };
  function deadlineMD(year) { return DEADLINES[year] || "02-05"; }
  var DEADLINE_MD = "02-21";        // 2012-13 deadline, kept for older callers; use deadlineMD(year)
  var DIFFICULTY = {                // margin the AI wants: base + pct of the value it gives
    easy: { base: 0, pct: 0 },
    normal: { base: 0.4, pct: 0.05 },
    hard: { base: 0.8, pct: 0.10 },
    hof: { base: 1.2, pct: 0.16 }
  };
  var AI_MARGIN = { base: 0.25, pct: 0.02 };   // AI to AI deals: each side wants a small edge
  var MAX_AI_TRADES = 16, MAX_TEAM_TRADES = 3, MAX_OFFERS = 5;

  function cba() { return W.CBA || null; }
  function isArr(x) { return Object.prototype.toString.call(x) === "[object Array]"; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function round2(x) { return Math.round(x * 100) / 100; }

  // ---------------------------------------------------------------------------
  // Context: one snapshot of the league for a call (rosters, payrolls, caches)
  // ---------------------------------------------------------------------------
  function salaryYear(state) {
    return OFFSEASON.indexOf(state.phase) >= 0 ? state.year + 1 : state.year;
  }
  // the next draft that has not happened yet
  function draftYear(state) {
    var p = state.phase;
    if (p === "resign" || p === "freeAgency" || p === "training") return state.year + 1;
    return state.year;
  }
  function rulesFor(year) {
    var C = cba(), r = null;
    if (C && typeof C.rules === "function") { try { r = C.rules(year); } catch (e) { r = null; } }
    var grow = Math.pow(1.045, Math.max(0, year - 2013));
    return {
      cap: r && r.cap ? r.cap : Math.round(BASE_CAP * grow),
      tax: r && r.tax ? r.tax : Math.round(BASE_TAX * grow)
    };
  }

  function salaryOf(p, year) {
    if (!p) return 0;
    if (p.contract && isArr(p.contract.salaries)) {
      for (var i = 0; i < p.contract.salaries.length; i++) if (p.contract.salaries[i].year === year) return p.contract.salaries[i].amount || 0;
      return 0;
    }
    if (p.salary && p.contractEnd && p.contractEnd >= year) return p.salary;
    return 0;
  }
  function remaining(p, year) {
    var out = [];
    if (p.contract && isArr(p.contract.salaries)) {
      p.contract.salaries.forEach(function (s) { if (s.year >= year && s.amount > 0) out.push({ year: s.year, amount: s.amount }); });
      out.sort(function (a, b) { return a.year - b.year; });
    } else if (p.salary && p.contractEnd) {
      for (var y = year; y <= p.contractEnd; y++) out.push({ year: y, amount: p.salary });
    }
    return out;
  }

  function isStashed(state, p) { return !!(p.stashedUntil && p.stashedUntil > state.year); }
  function isTwoWay(p) { return !!(p.contract && p.contract.twoWay); }
  function countsOnRoster(state, p) { return !isStashed(state, p) && !isTwoWay(p); }

  function injuryGames(state, p) {
    var g = 0;
    if (p.injury && p.injury.games > 0 && p.injury.type !== "Playing overseas") g = p.injury.games;
    var si = state.season && state.season.injuries && state.season.injuries[p.id];
    if (si && si.games > g) g = si.games;
    return g;
  }

  function currentDate(state) {
    var s = state.season;
    if (!s || !isArr(s.days) || !s.days.length) return null;
    var d = s.days[Math.min(s.day || 0, s.days.length - 1)];
    return d ? d.date : null;
  }

  function makeCtx(state) {
    var year = salaryYear(state);
    var rules = rulesFor(year);
    var ctx = {
      state: state, year: year, draftYear: draftYear(state), rules: rules,
      capRatio: rules.cap / BASE_CAP,
      user: state.userTeam, rosters: {}, counts: {}, pay: {}, posInfo: {},
      vcache: {}, tvcache: {}, proj: null
    };
    Object.keys(state.teams || {}).forEach(function (a) { ctx.rosters[a] = []; ctx.counts[a] = 0; ctx.pay[a] = 0; });
    var ids = Object.keys(state.players || {});
    for (var i = 0; i < ids.length; i++) {
      var p = state.players[ids[i]];
      if (!p || p.retired || !ctx.rosters[p.team]) continue;
      ctx.rosters[p.team].push(p.id);
      if (countsOnRoster(state, p)) ctx.counts[p.team]++;
      ctx.pay[p.team] += salaryOf(p, year);
    }
    var C = cba();
    if (C && typeof C.payroll === "function") {
      Object.keys(ctx.pay).forEach(function (a) {
        try { var v = C.payroll(state, a, year); if (typeof v === "number" && isFinite(v)) ctx.pay[a] = v; } catch (e) { /* keep ours */ }
      });
    }
    return ctx;
  }

  // ---------------------------------------------------------------------------
  // Team direction (contend, rebuild, neutral)
  // ---------------------------------------------------------------------------
  function teamProfile(ctx, abbr) {
    var st = ctx.state, list = ctx.rosters[abbr].map(function (id) { return st.players[id]; })
      .filter(function (p) { return countsOnRoster(st, p); })
      .sort(function (a, b) { return b.ovr - a.ovr; });
    var w = [1.3, 1.2, 1.1, 1, 0.9, 0.8, 0.7, 0.6], sum = 0, ws = 0, age = 0;
    for (var i = 0; i < Math.min(8, list.length); i++) {
      var p = list[i], inj = injuryGames(st, p) >= 40 ? 0.6 : 1;
      sum += p.ovr * w[i] * inj + (1 - inj) * 60 * w[i]; ws += w[i]; age += p.age * w[i];
    }
    var rec = st.season && st.season.standings && st.season.standings[abbr];
    var gp = rec ? (rec.w || 0) + (rec.l || 0) : 0;
    return { rating: ws ? sum / ws : 60, age: ws ? age / ws : 27, star: list.length ? list[0].ovr : 60,
      gp: gp, wp: gp ? rec.w / gp : 0.5 };
  }

  function computeDirections(ctx) {
    var abbrs = Object.keys(ctx.rosters), prof = {}, st = ctx.state;
    abbrs.forEach(function (a) {
      var pr = teamProfile(ctx, a);
      pr.score = pr.rating + (pr.gp >= 10 ? (pr.wp - 0.5) * 14 * Math.min(1, pr.gp / 40) : 0);
      prof[a] = pr;
    });
    var order = abbrs.slice().sort(function (a, b) { return prof[b].score - prof[a].score; });
    var out = {};
    order.forEach(function (a, i) {
      var rank = i + 1, pr = prof[a], prev = st.teams[a] && st.teams[a].direction, d = "neutral";
      if (rank <= 8 || (rank <= 12 && pr.star >= 88)) d = "contend";
      else if (rank >= 22 || (rank >= 16 && pr.age >= 29.5) || (pr.gp >= 25 && pr.wp < 0.35)) d = "rebuild";
      // hysteresis: keep a plan unless the situation clearly changed
      if (d === "neutral" && prev === "contend" && rank <= 12) d = "contend";
      if (d === "neutral" && prev === "rebuild" && rank >= 17) d = "rebuild";
      out[a] = d;
    });
    ctx.profiles = prof;
    return out;
  }

  function meta(state) {
    var m = state.tradeMeta;
    if (!m || m.year !== state.year) {
      m = state.tradeMeta = { year: state.year, ai: 0, offers: 0, teams: {}, dirDay: null, dirPhase: null };
    }
    return m;
  }

  // sets team.direction for every team; run by aiTrades every few weeks
  function updateDirections(state) {
    var ctx = makeCtx(state), dirs = computeDirections(ctx);
    Object.keys(dirs).forEach(function (a) { state.teams[a].direction = dirs[a]; });
    var m = meta(state); m.dirDay = state.day || 0; m.dirPhase = state.phase;
    return dirs;
  }
  function ensureDirections(state) {
    var m = meta(state);
    if (m.dirDay === null) updateDirections(state);
  }
  function dirOf(ctx, abbr) {
    var t = ctx.state.teams[abbr];
    if (t && (t.direction === "contend" || t.direction === "rebuild" || t.direction === "neutral")) return t.direction;
    if (!ctx.dirs) ctx.dirs = computeDirections(ctx);
    return ctx.dirs[abbr] || "neutral";
  }

  // ---------------------------------------------------------------------------
  // Player value
  // ---------------------------------------------------------------------------
  function projRating(p, n) {
    var r = p.ovr, a = p.age || 27, pot = Math.max(p.pot || p.ovr, p.ovr);
    for (var i = 0; i < n; i++) {
      if (a <= 22) r += (pot - r) * 0.3;
      else if (a <= 25) r += (pot - r) * 0.22;
      else if (a <= 27) r += (pot - r) * 0.12;
      if (a >= 30) r -= (a - 29) * 0.9;
      a++;
    }
    return r;
  }
  function effRating(p, dir) {
    var e;
    if (dir === "contend") {
      e = 0.85 * p.ovr + 0.15 * projRating(p, 2);
      if (p.age <= 22 && p.ovr < 70) e -= 1;              // raw kids do not help a contender
    } else if (dir === "rebuild") {
      e = 0.35 * p.ovr + 0.65 * projRating(p, 3);
      if (p.age > 29) e -= (p.age - 29) * 0.6;
    } else {
      e = 0.6 * p.ovr + 0.4 * projRating(p, 2);
    }
    return e;
  }
  var REPLACEMENT = Math.exp(2 / 8);   // a 62 overall is worth nothing above a minimum signing
  function talentCurve(eff) { return Math.max(0, Math.exp((eff - 60) / 8) - REPLACEMENT); }

  function marketSalary(r, capRatio) {
    var x = clamp((r - 60) / 32, 0, 1);
    return (800000 + 17500000 * x * x) * capRatio;
  }

  function fitMult(ctx, abbr, p) {
    if (!ctx.posInfo[abbr]) {
      var info = {}, st = ctx.state;
      ctx.rosters[abbr].forEach(function (id) {
        var q = st.players[id]; if (!countsOnRoster(st, q)) return;
        (info[q.pos] = info[q.pos] || []).push({ id: q.id, ovr: q.ovr });
      });
      Object.keys(info).forEach(function (k) { info[k].sort(function (a, b) { return b.ovr - a.ovr; }); });
      ctx.posInfo[abbr] = info;
    }
    var others = (ctx.posInfo[abbr][p.pos] || []).filter(function (o) { return o.id !== p.id; });
    var best = others.length ? others[0].ovr : 0;
    if (p.ovr >= best + 3) return 1.06;
    if (others.filter(function (o) { return o.ovr >= p.ovr; }).length >= 2) return 0.94;
    return 1;
  }

  // value parts of a player as seen by team abbr: talent (on-court, depth weighted later) and contract
  function parts(ctx, id, abbr) {
    var key = abbr + "|" + id;
    if (ctx.vcache[key]) return ctx.vcache[key];
    var st = ctx.state, p = st.players[id], dir = dirOf(ctx, abbr);
    var eff = effRating(p, dir);
    var talent = talentCurve(eff);
    if (isStashed(st, p)) {
      talent *= dir === "rebuild" ? 0.8 : dir === "contend" ? 0.4 : 0.6;
    } else {
      var g = injuryGames(st, p);
      if (g > 0) talent *= 1 - Math.min(1, g / 82) * (dir === "contend" ? 0.8 : dir === "rebuild" ? 0.3 : 0.55);
    }
    if (ctx.rosters[abbr]) talent *= fitMult(ctx, abbr, p);
    if (p.tradeRequest && p.team === abbr) talent *= 0.85;   // an unhappy player is easier to pry loose

    // contract: what he is paid against what a player of his level earns, year by year
    var w = dir === "contend" ? 0.25 : dir === "rebuild" ? 0.45 : 0.35;
    var rem = remaining(p, ctx.year), surplus = 0, opt = p.contract && p.contract.option;
    for (var i = 0; i < rem.length; i++) {
      var ratio = ctx.capRatio * Math.pow(1.045, i);
      var s = (marketSalary(projRating(p, i), ratio) - rem[i].amount) / 1e6 / ratio;
      if (opt && opt.year === rem[i].year) {
        if (opt.type === "team" && s < 0) s = 0;                       // team would decline
        if ((opt.type === "player" || opt.type === "eto") && s > 0) s = 0;  // player would opt out
      }
      surplus += s * Math.pow(0.88, i);
    }
    var contract = surplus * w;
    if (rem.length === 1) {
      var m = rem[0].amount / 1e6 / ctx.capRatio;
      if (m > 4) contract += m * (dir === "rebuild" ? 0.1 : dir === "neutral" ? 0.04 : 0);   // cap relief
    }
    var out = { talent: talent, contract: contract, total: talent + contract, eff: eff };
    ctx.vcache[key] = out;
    return out;
  }

  // ---------------------------------------------------------------------------
  // Pick value
  // ---------------------------------------------------------------------------
  function pickCurve(round, s) {
    return round === 1 ? 1.5 + 18 * Math.exp(-(s - 1) / 6.5) : 0.3 + 1.0 * Math.exp(-(s - 1) / 10);
  }
  function projections(ctx) {
    if (ctx.proj) return ctx.proj;
    var st = ctx.state, abbrs = Object.keys(ctx.rosters), base = {}, ages = {};
    abbrs.forEach(function (a) { var pr = teamProfile(ctx, a); base[a] = pr; });
    var n = abbrs.length || 30, mid = (n + 1) / 2;
    // games played share of the season, for current-year certainty
    var gpAvg = 0;
    abbrs.forEach(function (a) { gpAvg += base[a].gp; });
    gpAvg = gpAvg / Math.max(1, n);
    var progress = OFFSEASON.indexOf(st.phase) >= 0 && ctx.draftYear === st.year ? 1 : clamp(gpAvg / 82, 0, 1);
    var proj = { mid: mid, n: n, byD: [] , progress: progress, order: null };
    // real draft order once the season is over, if the draft module offers it
    if (ctx.draftYear === st.year && progress >= 1 && W.DRAFT && typeof W.DRAFT.order === "function") {
      try {
        var ord = W.DRAFT.order(st, st.year);
        if (isArr(ord) && ord.length) proj.order = ord;
      } catch (e) { proj.order = null; }
    }
    for (var d = 0; d <= 7; d++) {
      var score = {};
      abbrs.forEach(function (a) {
        var pr = base[a], rating = pr.rating - Math.max(0, pr.age - 27) * 0.8 * d + Math.max(0, 26 - pr.age) * 0.6 * d;
        var wpW = d === 0 ? Math.min(0.85, pr.gp / 60) : 0;
        score[a] = (1 - wpW) * rating + wpW * (60 + (pr.wp - 0.5) * 40);
      });
      var order = abbrs.slice().sort(function (a, b) { return score[a] - score[b]; });   // worst first
      var slots = {};
      order.forEach(function (a, i) {
        var raw = i + 1, reg = Math.pow(0.8, d);
        slots[a] = { mu: mid + (raw - mid) * reg, sd: d === 0 ? 1.5 + 4 * (1 - progress) : 2.5 + 3 * d };
      });
      proj.byD.push(slots);
    }
    ctx.proj = proj;
    return proj;
  }
  function slotOf(ctx, original, round, d) {
    var proj = projections(ctx);
    if (d === 0 && proj.order) {
      var count = 0;
      for (var i = 0; i < proj.order.length; i++) {
        var e = proj.order[i], t = typeof e === "string" ? e : e && (e.original || e.team || e.abbr);
        var r = e && e.round ? e.round : (i < proj.n ? 1 : 2);
        if (r !== round) continue;
        count++;
        if (t === original) return { mu: count, sd: 0.3 };
      }
    }
    var s = proj.byD[Math.min(d, proj.byD.length - 1)][original];
    return s || { mu: proj.mid, sd: 8 };
  }
  function rawPick(ctx, pick, depth) {
    var d = pick.year - ctx.draftYear;
    if (d < 0) return 0;
    var n = projections(ctx).n, sl = slotOf(ctx, pick.original, pick.round, d);
    var prot = pick.protection, top = protTop(prot, pick.year);
    var fallback = 0;
    var gone = prot && prot.extinguish && (prot.until == null || pick.year >= +prot.until);   // not conveyed: the pick is gone
    if (top && depth < 3 && !gone) {
      var next = { year: pick.year + 1, round: pick.round, original: pick.original,
        protection: prot.until != null && pick.year + 1 <= prot.until ? prot : null };
      fallback = 0.85 * rawPick(ctx, next, depth + 1);
    }
    var tw = 0, ev = 0;
    for (var s = 1; s <= n; s++) {
      var z = (s - sl.mu) / sl.sd, w = Math.exp(-0.5 * z * z);
      tw += w;
      var at = pick.round === 2 && top > 30 ? s + n : s;   // second round protections count the overall pick
      ev += w * (!top || at > top ? pickCurve(pick.round, s) : fallback);
    }
    return (tw ? ev / tw : 0) * Math.pow(0.92, d);
  }
  function pickVal(ctx, pick, abbr) {
    var dir = dirOf(ctx, abbr);
    var live = liveSlotValue(ctx, pick);
    if (live != null) {
      // draft night: a known slot and a known pool, so the plan matters less than for future picks
      return live * (dir === "rebuild" ? 1.2 : dir === "contend" ? 0.85 : 1);
    }
    var mult = dir === "rebuild" ? 1.35 : dir === "contend" ? 0.75 : 1;
    return rawPick(ctx, pick, 0) * mult;
  }

  // ---------------------------------------------------------------------------
  // Draft night: the live order (state.draft.order) and the prospects still on the board
  // ---------------------------------------------------------------------------
  function liveDraft(state) {
    var d = state && state.draft;
    if (!d || !isArr(d.order) || !d.order.length || d.done || +d.year !== +state.year) return null;
    if (state.phase !== "draft" && state.phase !== "draftLottery") return null;
    return d;
  }
  // the slot of the live draft a pick entry stands for (holder: the team that holds the entry)
  function slotForEntry(state, entry, holder) {
    var d = liveDraft(state), r = parsePickRef(entry);
    if (!d || !r || +r.year !== +d.year) return null;
    var same = null, swapped = null;
    for (var i = 0; i < d.order.length; i++) {
      var s = d.order[i];
      if (+s.round !== +r.round) continue;
      if (s.original === r.original) {
        if (!holder || s.team === holder) return s;
        if (!same) same = s;
      } else if (holder && s.team === holder && s.swapped && !swapped) swapped = s;
    }
    return swapped || same;
  }
  // the pick entry a slot stands for: the holder's entry for that original, else (pick swaps)
  // the holder's entry for the round that has no slot of its own
  function entryForSlot(state, slot) {
    if (!slot || !state.teams[slot.team]) return null;
    var t = state.teams[slot.team], list = t.picks || [], i;
    for (i = 0; i < list.length; i++) {
      var k = list[i];
      if (+k.year === +slot.year && +k.round === +slot.round && k.original === slot.original) return k;
    }
    for (i = 0; i < list.length; i++) {
      var q = list[i];
      if (+q.year !== +slot.year || +q.round !== +slot.round) continue;
      var s2 = slotForEntry(state, q, slot.team);
      if (s2 === slot) return q;
    }
    return null;
  }
  function pickUsed(state, entry, holder) {
    var s = slotForEntry(state, entry, holder);
    return !!(s && s.player);
  }
  // a prospect is a long-term asset: what he is now and what he projects to in four years
  function prospectTalent(ovr, pot, age) {
    var q = { ovr: ovr, pot: Math.max(pot || ovr, ovr), age: age || 20 };
    return talentCurve(0.3 * ovr + 0.7 * projRating(q, 4));
  }
  function prospectScore(p) { return prospectTalent(p.ovr, p.pot, p.age); }
  // what a typical class offers at an overall pick (same curve js/draft.js uses for fictional classes)
  function baselineTalent(overall) {
    var x = clamp((overall - 1) / 69, 0, 1);
    return prospectTalent(74 - 20 * Math.pow(x, 0.7), 90 - 30 * Math.pow(x, 0.55), 20);
  }
  function boardOf(ctx) {
    if (ctx.board) return ctx.board;
    var st = ctx.state, d = liveDraft(st), out = [];
    if (d) {
      var ids = Object.keys(st.players);
      for (var i = 0; i < ids.length; i++) {
        var p = st.players[ids[i]];
        if (p && p.team === "DRAFT" && +p.draftYear === +d.year && !p.undrafted && !p.retired) out.push(p);
      }
      out.sort(function (a, b) { return prospectScore(b) - prospectScore(a); });
    }
    ctx.board = out;
    return out;
  }
  // value of a current-draft pick by its slot and the prospects still available; null when not live
  function liveSlotValue(ctx, pick) {
    var st = ctx.state, d = liveDraft(st);
    if (!d || +pick.year !== +d.year) return null;
    var slot = slotForEntry(st, pick, null);
    if (!slot) return null;
    if (slot.player) return 0;
    var k = 0;
    for (var i = 0; i < d.order.length; i++) {
      var s = d.order[i];
      if (s.player) continue;
      k++;
      if (s === slot) break;
    }
    var board = boardOf(ctx), pr = board[k - 1];
    var curve = pickCurve(slot.round, slot.pickInRound || (slot.round === 1 ? slot.overall : slot.overall - 30));
    if (!pr) return curve * 0.4;
    var ratio = clamp((prospectScore(pr) + 1) / (baselineTalent(slot.overall) + 1), 0.5, 1.8);
    return curve * ratio;
  }
  // the order slot moves with the pick entry, so the new owner makes the pick right away
  function moveLiveSlot(state, entry, from, to) {
    var s = slotForEntry(state, entry, from);
    if (!s || s.player || s.team !== from) return null;
    s.team = to;
    s.via = s.original !== to ? s.original : null;
    s.traded = { from: from, day: state.day || 0 };
    var d = state.draft;
    if (d && d.userOnClock === s.overall && to !== state.userTeam) d.userOnClock = null;
    return s;
  }

  // ---------------------------------------------------------------------------
  // Trade helpers
  // ---------------------------------------------------------------------------
  function pickId(p) { return p.year + "-" + p.round + "-" + p.original; }
  function parsePickRef(ref) {
    if (!ref) return null;
    if (typeof ref === "string") {
      var m = ref.split("-");
      return { year: +m[0], round: +m[1], original: m.slice(2).join("-") };
    }
    return ref;
  }
  function findPick(state, abbr, ref) {
    var r = parsePickRef(ref), t = state.teams[abbr];
    if (!r || !t || !isArr(t.picks)) return null;
    for (var i = 0; i < t.picks.length; i++) {
      var p = t.picks[i];
      if (p.year === r.year && p.round === r.round && p.original === r.original) return p;
    }
    return null;
  }
  function sideOf(trade, abbr) {
    var g = trade.give && trade.give[abbr];
    return { players: (g && g.players) || [], picks: (g && g.picks) || [] };
  }
  // who receives an asset given by abbr: trade.dest[id] for 3-team deals, else the other team
  function receiver(trade, abbr, key) {
    if (trade.dest && trade.dest[key]) return trade.dest[key];
    for (var i = 0; i < trade.teams.length; i++) if (trade.teams[i] !== abbr) return trade.teams[i];
    return null;
  }
  function flows(state, trade, abbr) {
    var out = sideOf(trade, abbr), inP = [], inK = [];
    trade.teams.forEach(function (t) {
      if (t === abbr) return;
      var s = sideOf(trade, t);
      s.players.forEach(function (id) { if (receiver(trade, t, id) === abbr) inP.push(id); });
      s.picks.forEach(function (pk) {
        var r = parsePickRef(pk);
        if (receiver(trade, t, pickId(r)) === abbr) inK.push(findPick(state, t, r) || r);
      });
    });
    var outK = out.picks.map(function (pk) { var r = parsePickRef(pk); return findPick(state, abbr, r) || r; });
    return { outP: out.players.slice(), outK: outK, inP: inP, inK: inK };
  }
  function cloneTrade(t) {
    var c = { teams: t.teams.slice(), give: {} };
    t.teams.forEach(function (a) { var s = sideOf(t, a); c.give[a] = { players: s.players.slice(), picks: s.picks.slice() }; });
    if (t.dest) c.dest = JSON.parse(JSON.stringify(t.dest));
    return c;
  }

  // ---------------------------------------------------------------------------
  // Legality
  // ---------------------------------------------------------------------------
  function windowOpen(state) {
    if (state.phase === "playoffs") return false;
    if (state.season && state.season.phase === "playoffs" && OFFSEASON.indexOf(state.phase) < 0) return false;
    if (state.phase === "regular") {
      var d = currentDate(state);
      if (d && d > state.year + "-" + deadlineMD(state.year)) return false;
    }
    return true;
  }
  function inSeason(state) { return OFFSEASON.indexOf(state.phase) < 0; }
  function closedText(state) {
    return "The trade deadline has passed. Trades reopen after the playoffs.";
  }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dayNum(iso) { var t = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); return Math.round(t / 864e5); }
  // the trade window for the UI: { open, status, date, label, daysLeft, text }
  //   status: "open" (before the deadline), "deadline" (deadline day), "closed" (after it, until the
  //   playoffs end), "offseason" (open: the real NBA reopens trades after the Finals)
  function deadline(state) {
    var md = deadlineMD(state.year), nmd = deadlineMD(state.year + 1);
    var date = state.year + "-" + md;
    var label = MONTHS[+md.slice(0, 2) - 1] + " " + (+md.slice(3));
    var nextLabel = MONTHS[+nmd.slice(0, 2) - 1] + " " + (+nmd.slice(3));
    var out = { open: windowOpen(state), date: date, label: label, daysLeft: null, status: "open", text: "" };
    if (OFFSEASON.indexOf(state.phase) >= 0) {
      out.status = "offseason";
      out.text = "Offseason: trades are open. Next deadline: " + nextLabel + ", " + (state.year + 1) + ".";
      return out;
    }
    if (!out.open) { out.status = "closed"; out.text = "Trade deadline passed (" + label + "). Trades reopen after the playoffs."; return out; }
    var d = currentDate(state);
    if (d) {
      var left = dayNum(date) - dayNum(d);
      out.daysLeft = left;
      if (left <= 0) { out.status = "deadline"; out.text = "Trade deadline: today, " + label + ". Last chance to deal."; return out; }
      out.text = "Trade deadline: " + label + ", " + left + " day" + (left === 1 ? "" : "s") + " left";
    } else out.text = "Trade deadline: " + label + ".";
    return out;
  }

  // simple 2012 CBA salary check, also used to find which side must change
  function salaryCheck(ctx, trade) {
    var st = ctx.state, bad = [];
    trade.teams.forEach(function (a) {
      var f = flows(st, trade, a), out = 0, inn = 0;
      f.outP.forEach(function (id) { out += salaryOf(st.players[id], ctx.year); });
      f.inP.forEach(function (id) { inn += salaryOf(st.players[id], ctx.year); });
      var after = ctx.pay[a] - out + inn;
      if (after > ctx.rules.cap && inn > out && inn > out * 1.25 + 100000) {
        bad.push({ team: a, incoming: inn, outgoing: out, need: inn - (out * 1.25 + 100000) });
      }
    });
    return bad;
  }
  function rosterCheck(ctx, trade) {
    var st = ctx.state, bad = [], season = inSeason(st), userless = trade.teams.indexOf(st.userTeam) < 0;
    trade.teams.forEach(function (a) {
      var f = flows(st, trade, a), before = ctx.counts[a], after = before;
      f.outP.forEach(function (id) { if (countsOnRoster(st, st.players[id])) after--; });
      f.inP.forEach(function (id) { if (countsOnRoster(st, st.players[id])) after++; });
      // offseason rosters may hold 20 in deals with the user; AI to AI deals stay at 15
      var min = season ? ROSTER_MIN : 10, max = season || userless ? ROSTER_MAX : OFFSEASON_MAX;
      if ((after > max && after > before) || (after < min && after < before)) bad.push({ team: a, after: after, over: after > ROSTER_MAX });
    });
    return bad;
  }
  // a team may not be without a first round pick in two straight future drafts
  function stepienCheck(ctx, trade) {
    var st = ctx.state, bad = [];
    trade.teams.forEach(function (a) {
      var f = flows(st, trade, a);
      if (!f.outK.some(function (k) { return k.round === 1; })) return;
      var held = {}, maxY = ctx.draftYear;
      var outIds = {};
      f.outK.forEach(function (k) { outIds[pickId(k)] = k; });
      (st.teams[a].picks || []).forEach(function (k) {
        if (k.year > maxY) maxY = k.year;
        if (k.round !== 1) return;
        var gone = outIds[pickId(k)];
        if (!gone || (gone.protection && gone.original === a)) held[k.year] = true;
      });
      f.inK.forEach(function (k) { if (k.round === 1) held[k.year] = true; });
      var y0 = liveDraft(st) && st.phase === "draft" ? ctx.draftYear + 1 : ctx.draftYear;
      for (var y = y0; y < maxY; y++) {
        if (!held[y] && !held[y + 1]) { bad.push({ team: a, years: [y, y + 1] }); break; }
      }
    });
    return bad;
  }

  function validate(state, trade, ctx) {
    ctx = ctx || makeCtx(state);
    var reasons = [], res = { ok: true, reasons: reasons, salary: [], roster: [], closed: false };
    if (!trade || !isArr(trade.teams) || trade.teams.length < 2) { res.ok = false; reasons.push("A trade needs two teams."); return res; }
    var seen = {};
    for (var i = 0; i < trade.teams.length; i++) {
      var a = trade.teams[i];
      if (!state.teams[a]) { res.ok = false; reasons.push("Unknown team " + a + "."); return res; }
      if (seen[a]) { res.ok = false; reasons.push("A team appears twice."); return res; }
      seen[a] = 1;
    }
    if (!windowOpen(state)) { res.ok = false; res.closed = true; reasons.push(closedText(state)); return res; }
    var any = 0;
    trade.teams.forEach(function (a) {
      var s = sideOf(trade, a);
      s.players.forEach(function (id) {
        any++;
        var p = state.players[id];
        if (!p || p.team !== a || p.retired) { res.ok = false; reasons.push((p ? p.name : id) + " is not on " + a + "."); }
      });
      s.picks.forEach(function (pk) {
        any++;
        if (!findPick(state, a, pk)) { res.ok = false; reasons.push(a + " does not own that pick (" + pickId(parsePickRef(pk)) + ")."); }
        else if (pickUsed(state, pk, a)) { res.ok = false; reasons.push("The " + pickLabel(state, pk, a) + " pick has already been made."); }
      });
    });
    if (!any) { res.ok = false; reasons.push("The trade is empty."); }
    if (!res.ok) return res;

    res.roster = rosterCheck(ctx, trade);
    res.roster.forEach(function (b) {
      res.ok = false;
      reasons.push(teamName(state, b.team) + " would have " + b.after + " players (rosters hold " + ROSTER_MIN + " to " + ROSTER_MAX + ").");
    });
    stepienCheck(ctx, trade).forEach(function (b) {
      res.ok = false;
      reasons.push(teamName(state, b.team) + " cannot be without a first round pick in both " + b.years[0] + " and " + b.years[1] + ".");
    });

    var own = salaryCheck(ctx, trade), C = cba(), used = false;
    if (C && typeof C.validateTrade === "function") {
      try {
        var r = C.validateTrade(state, trade);
        if (r && typeof r.ok === "boolean") {
          used = true;
          if (!r.ok) {
            res.ok = false;
            (r.reasons || ["Breaks the salary rules."]).forEach(function (x) { reasons.push(x); });
            res.salary = own;
            res.cbaFail = true;
          }
        }
      } catch (e) { used = false; }
    }
    if (!used && own.length) {
      res.ok = false; res.salary = own;
      own.forEach(function (b) {
        reasons.push(teamName(state, b.team) + " is over the cap and can take back at most 125% plus $100,000 of outgoing salary ($" +
          fmtM(b.outgoing * 1.25 + 100000) + " allowed, $" + fmtM(b.incoming) + " incoming).");
      });
    }
    return res;
  }

  // ---------------------------------------------------------------------------
  // Valuing a trade for one team
  // ---------------------------------------------------------------------------
  function depthW(rank) { return rank < 5 ? 1 : rank < 8 ? 0.85 : rank < 10 ? 0.5 : 0.25; }
  function teamVal(ctx, abbr, ids) {
    var list = ids.map(function (id) { return parts(ctx, id, abbr); });
    var sorted = list.slice().sort(function (a, b) { return b.talent - a.talent; });
    var v = 0;
    for (var i = 0; i < sorted.length; i++) v += sorted[i].talent * depthW(i) + sorted[i].contract;
    return v;
  }
  function difficulty(state) {
    var d = state.settings && state.settings.difficulty;
    return DIFFICULTY[d] || DIFFICULTY.normal;
  }

  function gain(ctx, abbr, trade, marginRule) {
    var st = ctx.state, f = flows(st, trade, abbr);
    var before = ctx.rosters[abbr];
    if (ctx.tvcache[abbr] == null) ctx.tvcache[abbr] = teamVal(ctx, abbr, before);
    var outSet = {};
    f.outP.forEach(function (id) { outSet[id] = 1; });
    var after = before.filter(function (id) { return !outSet[id]; }).concat(f.inP);
    var playersDelta = teamVal(ctx, abbr, after) - ctx.tvcache[abbr];
    var pin = 0, pout = 0;
    f.inK.forEach(function (k) { pin += pickVal(ctx, k, abbr); });
    f.outK.forEach(function (k) { pout += pickVal(ctx, k, abbr); });

    // luxury tax: teams hate paying it, rebuilders most of all
    var outS = 0, inS = 0;
    f.outP.forEach(function (id) { outS += salaryOf(st.players[id], ctx.year); });
    f.inP.forEach(function (id) { inS += salaryOf(st.players[id], ctx.year); });
    var payB = ctx.pay[abbr], payA = payB - outS + inS, tax = ctx.rules.tax;
    var overB = Math.max(0, payB - tax), overA = Math.max(0, payA - tax);
    var dir = dirOf(ctx, abbr);
    var taxW = dir === "contend" ? 0.25 : dir === "rebuild" ? 0.6 : 0.45;
    var taxPenalty = (overA - overB) / 1e6 / ctx.capRatio * 1.5 * taxW;

    var outTalent = 0, inTalent = 0, best = null;
    before.forEach(function (id) { var t = parts(ctx, id, abbr).talent; if (!best || t > best.t) best = { id: id, t: t }; });
    f.outP.forEach(function (id) { outTalent += parts(ctx, id, abbr).talent; });
    f.inP.forEach(function (id) { inTalent += parts(ctx, id, abbr).talent; });
    var outValue = outTalent + pout, inValue = inTalent + pin;
    var rule = marginRule || difficulty(st);
    var required = rule.base + rule.pct * outValue;
    var starOut = best && outSet[best.id] && best.t >= 25 ? best.id : null;
    if (starOut) required += 0.12 * best.t;          // franchise players cost extra
    var g = playersDelta + pin - pout - taxPenalty;
    return { team: abbr, gain: g, required: required, margin: g - required, outValue: outValue, inValue: inValue,
      taxPenalty: taxPenalty, starOut: starOut, dir: dir, payAfter: payA, inSalary: inS, outSalary: outS, flows: f };
  }

  function aiTeamsOf(state, trade) {
    var ai = trade.teams.filter(function (a) { return a !== state.userTeam; });
    return ai;
  }

  function teamName(state, a) { var t = state.teams[a]; return t ? t.city + " " + t.name : a; }
  function shortName(state, a) { var t = state.teams[a]; return t ? t.name : a; }
  function fmtM(x) { return (x / 1e6).toFixed(1) + "M"; }

  function valueMessage(state, ctx, e) {
    var who = "The " + shortName(state, e.team), short = e.required - e.gain;
    if (e.margin >= 0) return who + " accept the trade.";
    if (e.taxPenalty > 0.5 && e.gain + e.taxPenalty >= e.required) return who + " need to shed salary. This deal adds to their luxury tax bill.";
    if (e.starOut && short > 0.15 * Math.max(5, e.outValue)) {
      return who + " are not looking to move " + state.players[e.starOut].name + ".";
    }
    if (e.gain < -0.5 * Math.max(4, e.outValue)) return "That's not even close. " + who + " want much more value.";
    var tail = "";
    var inPlayers = e.flows.inP.map(function (id) { return state.players[id]; });
    if (e.dir === "rebuild" && inPlayers.length && inPlayers.every(function (p) { return p.age >= 29; })) tail = " They are rebuilding and want young players and picks.";
    if (e.dir === "contend" && inPlayers.length && inPlayers.every(function (p) { return p.ovr < 72; }) && !e.flows.inK.length) tail = " They are trying to win now.";
    if (short <= 0.15 * Math.max(5, e.outValue) + 0.5) return who + " want a little more value." + tail;
    return who + " want more value." + tail;
  }
  function legalMessage(state, trade, v) {
    if (v.closed) return closedText(state);
    if (v.roster.length) return v.reasons[0];
    if (v.salary.length) {
      var b = v.salary[0];
      if (b.team !== state.userTeam) return "The " + shortName(state, b.team) + " need to shed salary: they cannot take back that much. " + v.reasons[v.reasons.length - 1];
      return "Your team cannot take back that much salary. Send more salary or take less. " + v.reasons[v.reasons.length - 1];
    }
    return "This trade breaks the rules: " + v.reasons.join(" ");
  }

  // ---------------------------------------------------------------------------
  // Public: value, pickValue, evaluate
  // ---------------------------------------------------------------------------
  function value(state, playerId, forAbbr) {
    var p = state.players[playerId];
    if (!p) return 0;
    ensureDirections(state);
    var ctx = makeCtx(state);
    var a = forAbbr || p.team;
    return round2(parts(ctx, playerId, a).total);
  }
  function pickValue(state, pick, forAbbr) {
    ensureDirections(state);
    var ctx = makeCtx(state);
    var p = parsePickRef(pick);
    return round2(pickVal(ctx, p, forAbbr || p.original));
  }

  function evaluate(state, trade, opts) {
    opts = opts || {};
    ensureDirections(state);
    var ctx = opts.ctx || makeCtx(state);
    var v = validate(state, trade, ctx);
    if (!v.ok) return { accepts: false, margin: -Infinity, message: legalMessage(state, trade, v), reasons: v.reasons, legal: false };
    var ai = aiTeamsOf(state, trade), worst = null, all = {};
    var rule = opts.margin || (ai.length === trade.teams.length ? AI_MARGIN : null);
    ai.forEach(function (a) {
      var e = gain(ctx, a, trade, rule);
      all[a] = { gain: round2(e.gain), required: round2(e.required), margin: round2(e.margin) };
      if (!worst || e.margin < worst.margin) worst = e;
    });
    if (!worst) return { accepts: true, margin: 0, message: "No AI team in this trade.", legal: true, teams: all };
    return { accepts: worst.margin >= 0, margin: round2(worst.margin), message: valueMessage(state, ctx, worst), legal: true, teams: all };
  }

  // ---------------------------------------------------------------------------
  // Package builder (finder, AI offers, AI to AI)
  // ---------------------------------------------------------------------------
  function recentlyTraded(state, p) {
    var t = p.lastTrade;
    return !!(t && t.year === state.year && (state.day || 0) - (t.day || 0) < 30 && t.phase === state.phase);
  }
  function combos(n, k, fn) {
    var idx = [];
    function rec(start, depth) {
      if (depth === k) { fn(idx.slice()); return; }
      for (var i = start; i < n; i++) { idx.push(i); rec(i + 1, depth + 1); idx.pop(); }
    }
    rec(0, 0);
  }
  function addPlayer(trade, abbr, id) { trade.give[abbr].players.push(id); }

  function fixLegal(ctx, trade, G, R, opts) {
    var st = ctx.state;
    for (var step = 0; step < 6; step++) {
      var v = validate(st, trade, ctx);
      if (v.ok) return trade;
      if (v.closed) return null;
      var fixed = false;
      if (v.salary.length) {
        var b = v.salary[0], X = b.team;
        if (opts.noFiller && opts.noFiller[X]) return null;
        var other = X === G ? R : G;
        var used = {};
        trade.teams.forEach(function (a) { sideOf(trade, a).players.forEach(function (id) { used[id] = 1; }); });
        var need = b.need > 0 ? b.need / 1.25 : 1000000;
        // salary filler never comes from the team's core (its three best players or anyone worth 4+)
        var core = {};
        ctx.rosters[X].slice().sort(function (a, b2) { return parts(ctx, b2, X).talent - parts(ctx, a, X).talent; })
          .forEach(function (id, rk) { if (rk < 3 || parts(ctx, id, X).total >= 4) core[id] = 1; });
        var fill = ctx.rosters[X].filter(function (id) {
          var p = st.players[id];
          return !used[id] && !core[id] && countsOnRoster(st, p) && salaryOf(p, ctx.year) > 0 && !(opts.protect && opts.protect[id]);
        }).map(function (id) { return { id: id, s: salaryOf(st.players[id], ctx.year), v: parts(ctx, id, X).total }; });
        if (!fill.length) return null;
        var enough = fill.filter(function (f) { return f.s >= need; }).sort(function (a, b2) { return a.v - b2.v || a.s - b2.s; });
        var pickF = enough.length ? enough[0] : fill.sort(function (a, b2) { return b2.s - a.s; })[0];
        addPlayer(trade, X, pickF.id);
        if (trade.dest) trade.dest[pickF.id] = other;
        fixed = true;
      } else if (v.roster.length) {
        var rb = v.roster[0];
        if (!rb.over) return null;
        var X2 = rb.team, other2 = X2 === G ? R : G;
        if (opts.noFiller && opts.noFiller[X2]) return null;
        var used2 = {};
        trade.teams.forEach(function (a) { sideOf(trade, a).players.forEach(function (id) { used2[id] = 1; }); });
        var cand = ctx.rosters[X2].filter(function (id) { return !used2[id] && countsOnRoster(st, st.players[id]) && !(opts.protect && opts.protect[id]); })
          .sort(function (a, b2) { return parts(ctx, a, X2).total - parts(ctx, b2, X2).total; });
        if (!cand.length) return null;
        addPlayer(trade, X2, cand[0]);
        fixed = true;
      }
      if (!fixed) return null;
    }
    return validate(st, trade, ctx).ok ? trade : null;
  }

  // G gives assets to R in exchange for wantIds (players of R). opts:
  //   rOk(eR), gOk(eG) acceptance tests, score(eR, eG), limit, maxAssets, rngJitter, aiGiver
  function buildPackages(ctx, G, R, wantIds, opts) {
    var st = ctx.state, limit = opts.limit || 3, maxAssets = opts.maxAssets || 3;
    var base = { teams: [G, R], give: {} };
    base.give[G] = { players: [], picks: [] };
    base.give[R] = { players: wantIds.slice(), picks: (opts.wantPicks || []).slice() };
    var protect = {};
    wantIds.forEach(function (id) { protect[id] = 1; });

    // candidate assets from G, ranked by what R thinks of them
    var pl = ctx.rosters[G].filter(function (id) {
      var p = st.players[id];
      return !protect[id] && !(opts.skipRecent && recentlyTraded(st, p)) && !(opts.keep && opts.keep[id]);
    }).map(function (id) { return { kind: "p", id: id, vR: parts(ctx, id, R).total, vG: parts(ctx, id, G).total, s: salaryOf(st.players[id], ctx.year) }; });
    var top = pl.filter(function (c) { return c.vR > 0.2; }).sort(function (a, b) { return b.vR - a.vR; }).slice(0, 9);
    var topSet = {};
    top.forEach(function (c) { topSet[c.id] = 1; });
    var fillers = pl.filter(function (c) { return !topSet[c.id] && c.s >= 1500000 * ctx.capRatio; })
      .sort(function (a, b) { return a.vG - b.vG; }).slice(0, 3);
    var picks = ((st.teams[G].picks) || []).filter(function (k) { return k.year >= ctx.draftYear && !pickUsed(st, k, G); })
      .map(function (k) { return { kind: "k", pick: k, vR: pickVal(ctx, k, R), vG: pickVal(ctx, k, G) }; })
      .sort(function (a, b) { return b.vR - a.vR; });
    var seconds = picks.filter(function (c) { return c.pick.round === 2; });
    var pickC = picks.slice(0, 5);
    if (seconds.length && pickC.indexOf(seconds[seconds.length - 1]) < 0) pickC.push(seconds[seconds.length - 1]);
    var cands = top.concat(fillers, pickC);

    function make(sel) {
      var t = cloneTrade(base);
      sel.forEach(function (c) {
        if (c.kind === "p") t.give[G].players.push(c.id);
        else t.give[G].picks.push({ year: c.pick.year, round: c.pick.round, original: c.pick.original });
      });
      return t;
    }
    function check(t) {
      var eR = gain(ctx, R, t, opts.rRule);
      if (!opts.rOk(eR)) return null;
      var eG = gain(ctx, G, t, opts.gRule);
      if (opts.gOk && !opts.gOk(eG)) return null;
      return { eR: eR, eG: eG };
    }
    var passing = [];
    for (var k = 1; k <= maxAssets; k++) {
      combos(cands.length, k, function (ix) {
        var sel = ix.map(function (i) { return cands[i]; });
        var t = make(sel), r = check(t);
        if (!r) return;
        var main = sel.slice().sort(function (a, b) { return b.vR - a.vR; })[0];
        passing.push({ trade: t, sel: sel, eR: r.eR, eG: r.eG, main: main.kind === "p" ? main.id : pickId(main.pick),
          score: opts.score(r.eR, r.eG) + (opts.jitter ? opts.jitter() : 0) });
      });
    }
    // greedy fallback with more assets
    if (!passing.length && opts.greedy) {
      var sel = [], sorted = cands.slice().sort(function (a, b) { return b.vR - a.vR; });
      for (var i = 0; i < sorted.length && sel.length < 6; i++) {
        sel.push(sorted[i]);
        var t2 = make(sel), r2 = check(t2);
        if (r2) { passing.push({ trade: t2, sel: sel.slice(), eR: r2.eR, eG: r2.eG, main: "greedy", score: opts.score(r2.eR, r2.eG) }); break; }
      }
    }
    passing.sort(function (a, b) { return b.score - a.score; });

    // make the best candidates legal (salary filler, roster balance), then rescore and keep distinct ones
    // candidates that already pass the salary and roster checks go first
    var clean = [], dirty = [];
    passing.forEach(function (c) { (salaryCheck(ctx, c.trade).length || rosterCheck(ctx, c.trade).length ? dirty : clean).push(c); });
    passing = clean.slice(0, 40).concat(dirty);
    var finals = [], triedMain = {}, tries = 0, maxTries = opts.maxTries || 80;
    for (var j = 0; j < passing.length && tries < maxTries; j++) {
      var c = passing[j];
      triedMain[c.main] = (triedMain[c.main] || 0) + 1;
      if (triedMain[c.main] > 8) continue;
      tries++;
      var legal = fixLegal(ctx, cloneTrade(c.trade), G, R, { protect: protect, noFiller: opts.noFiller });
      if (!legal) continue;
      var r3 = check(legal);
      if (!r3) continue;
      if (opts.maxOverpay && r3.eR.margin > opts.maxOverpay(r3.eR)) continue;
      finals.push({ trade: legal, eR: r3.eR, eG: r3.eG, main: c.main, score: opts.score(r3.eR, r3.eG) + (opts.jitter ? opts.jitter() : 0) });
      if (finals.length >= limit * 4) break;
    }
    finals.sort(function (a, b) { return b.score - a.score; });
    var out = [], usedMain = {};
    for (var q = 0; q < finals.length && out.length < limit; q++) {
      if (usedMain[finals[q].main]) continue;
      usedMain[finals[q].main] = 1;
      out.push({ trade: finals[q].trade, eR: finals[q].eR, eG: finals[q].eG });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Public: finder
  // ---------------------------------------------------------------------------
  function finder(state, userAbbr, targetAbbr, wantIds, opts) {
    opts = opts || {};
    ensureDirections(state);
    var ctx = makeCtx(state);
    if (!windowOpen(state) || !state.teams[userAbbr] || !state.teams[targetAbbr] || userAbbr === targetAbbr) return [];
    var want = (wantIds || []).filter(function (id) { var p = state.players[id]; return p && p.team === targetAbbr && !p.retired; });
    // opts.wantPicks: picks of the target team the user wants (draft night: "trade for this pick")
    var wantPicks = (opts.wantPicks || []).map(function (k) { return findPick(state, targetAbbr, k); })
      .filter(function (k) { return k && !pickUsed(state, k, targetAbbr); })
      .map(function (k) { return { year: k.year, round: k.round, original: k.original }; });
    if (!want.length && !wantPicks.length) return [];
    var res = buildPackages(ctx, userAbbr, targetAbbr, want, {
      limit: opts.limit || 3, maxAssets: 3, greedy: true, wantPicks: wantPicks,
      rOk: function (e) { return e.margin >= 0; },
      score: function (eR, eG) { return eG.gain - 0.3 * eR.margin; },   // cheapest for the user that still works
      maxOverpay: function (eR) { return 0.4 * eR.inValue + 2; },        // never suggest giving away the farm
      keep: opts.keep
    });
    return res.map(function (r) {
      return { trade: r.trade, accepts: true, margin: round2(r.eR.margin), text: describe(state, r.trade),
        message: "The " + shortName(state, targetAbbr) + " would accept this deal." };
    });
  }

  // ---------------------------------------------------------------------------
  // Public: shop (the trading block). Every AI team says what it would give for the
  // user's block players. Each offer is legal and accepted by evaluate. Best for the user first.
  // ---------------------------------------------------------------------------
  function shop(state, userAbbr, playerIds, opts) {
    opts = opts || {};
    userAbbr = userAbbr || state.userTeam;
    if (!state.teams[userAbbr] || !windowOpen(state)) return [];
    var ids = [];
    (playerIds || []).forEach(function (id) {
      var p = state.players[id];
      if (p && p.team === userAbbr && !p.retired && ids.indexOf(id) < 0) ids.push(id);
    });
    if (!ids.length) return [];
    ensureDirections(state);
    var ctx = makeCtx(state), rule = difficulty(state);
    var sets = ids.map(function (id) { return [id]; });
    if (ids.length > 1 && ids.length <= 3) sets.push(ids.slice());
    var noFiller = {}; noFiller[userAbbr] = 1;
    var found = [];
    Object.keys(state.teams).forEach(function (T) {
      if (T === userAbbr || (opts.teams && opts.teams.indexOf(T) < 0)) return;
      sets.forEach(function (set) {
        var want = 0;
        set.forEach(function (id) { want += parts(ctx, id, T).total; });
        if (want <= 0.3) return;     // this team has no use for them
        var res = buildPackages(ctx, T, userAbbr, set, {
          limit: 1, maxAssets: 3, maxTries: 30, gRule: rule, rRule: { base: 0, pct: 0 }, noFiller: noFiller,
          rOk: function (e) { return e.inValue > 0.2 || e.gain > 0; },
          gOk: function (e) { return e.margin >= 0; },
          score: function (eR) { return eR.gain; }
        });
        res.forEach(function (r) {
          var tr = { teams: [userAbbr, T], give: {} };
          tr.give[userAbbr] = r.trade.give[userAbbr];
          tr.give[T] = r.trade.give[T];
          var ev = evaluate(state, tr, { ctx: ctx });
          if (!ev.accepts) return;
          var C = cba();
          if (C && typeof C.validateTrade === "function") {
            var cv = null;
            try { cv = C.validateTrade(state, tr); } catch (e) { cv = { ok: false }; }
            if (!cv || !cv.ok) return;
          }
          found.push({ from: T, trade: tr, accepts: true, value: round2(r.eR.gain), margin: ev.margin,
            text: describe(state, tr), message: "The " + shortName(state, T) + " would do this deal." });
        });
      });
    });
    found.sort(function (a, b) { return b.value - a.value; });
    // keep the best offer per team for each block set, then the overall best
    var seen = {}, out = [];
    found.forEach(function (o) {
      var key = o.from + "|" + o.trade.give[userAbbr].players.slice().sort().join(",");
      if (seen[key]) return;
      seen[key] = 1; out.push(o);
    });
    return out.slice(0, opts.limit || 15);
  }

  // ---------------------------------------------------------------------------
  // AI to AI trades and AI offers
  // ---------------------------------------------------------------------------
  function weighted(list, wfn, rng) {
    var tot = 0, ws = list.map(function (x) { var w = Math.max(0, wfn(x)); tot += w; return w; });
    if (tot <= 0) return null;
    var r = rng() * tot;
    for (var i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  }

  // expected AI trade attempts for one call (one sim day in season, one step in the offseason)
  function attemptRate(state) {
    var ph = state.phase;
    if (ph === "draft") return 1.5;
    if (ph === "resign") return 0.8;
    if (ph === "freeAgency") return 0.12;
    if (ph === "training") return 0.8;
    if (ph === "preseason") return 0.5;
    if (ph === "draftLottery" || ph === "playoffs") return 0;
    var d = currentDate(state);
    if (!d) return 0.04;
    var y = state.year, dl = y + "-" + deadlineMD(y);
    if (d > dl) return 0;
    if (d === dl) return 2.5;
    if (d >= y + "-02-01") return 0.18;
    if (d >= (y - 1) + "-12-15") return 0.03;
    return 0.005;
  }

  function tryAiTrade(state, rng) {
    var ctx = makeCtx(state), m = meta(state);
    var ai = Object.keys(state.teams).filter(function (a) { return a !== state.userTeam && (m.teams[a] || 0) < MAX_TEAM_TRADES; });
    if (ai.length < 2) return null;
    for (var tries = 0; tries < 4; tries++) {
      var buyer = weighted(ai, function (a) { var d = dirOf(ctx, a); return d === "contend" ? 4 : d === "neutral" ? 1.5 : 0.4; }, rng);
      var sellers = ai.filter(function (a) { return a !== buyer; });
      var seller = weighted(sellers, function (a) { var d = dirOf(ctx, a); return d === "rebuild" ? 4 : d === "neutral" ? 1.5 : 0.4; }, rng);
      if (!buyer || !seller) continue;
      var targets = ctx.rosters[seller].filter(function (id) {
        var p = state.players[id];
        return countsOnRoster(state, p) && !recentlyTraded(state, p) && parts(ctx, id, buyer).talent >= 1.5;
      }).map(function (id) {
        return { id: id, diff: parts(ctx, id, buyer).total - parts(ctx, id, seller).total };
      }).filter(function (t) { return t.diff > 0; })
        .sort(function (a, b) { return b.diff - a.diff; }).slice(0, 5);
      if (!targets.length) continue;
      var tgt = weighted(targets, function (t) { return t.diff; }, rng);
      var pk = buildPackages(ctx, buyer, seller, [tgt.id], {
        limit: 1, maxAssets: 3, skipRecent: true,
        rRule: AI_MARGIN, gRule: AI_MARGIN,
        rOk: function (e) { return e.margin >= 0; },
        gOk: function (e) { return e.margin >= 0; },
        score: function (eR, eG) { return Math.min(eR.margin, eG.margin); },
        jitter: function () { return rng() * 0.5; }
      });
      for (var q = 0; q < pk.length; q++) if (keepsFullRoster(ctx, pk[q].trade)) return pk[q].trade;
    }
    return null;
  }
  // AI to AI deals never leave a team short of a full 13 man roster, even in the offseason
  function keepsFullRoster(ctx, trade) {
    var st = ctx.state;
    return trade.teams.every(function (a) {
      var f = flows(st, trade, a), before = ctx.counts[a], after = before;
      f.outP.forEach(function (id) { if (countsOnRoster(st, st.players[id])) after--; });
      f.inP.forEach(function (id) { if (countsOnRoster(st, st.players[id])) after++; });
      return (after >= ROSTER_MIN || after >= before) && (after <= ROSTER_MAX || after <= before);
    });
  }

  function aiTrades(state, rng, opts) {
    rng = rng || Math.random;
    opts = opts || {};
    var m = meta(state);
    // re-plan directions every 20 days and at each new phase
    if (m.dirDay === null || m.dirPhase !== state.phase || (state.day || 0) - m.dirDay >= 20) updateDirections(state);
    if (!windowOpen(state)) return [];
    var rate = (opts.rate != null ? opts.rate : attemptRate(state)) * (opts.days || 1);
    var n = Math.floor(rate) + (rng() < rate - Math.floor(rate) ? 1 : 0);
    var done = [];
    for (var i = 0; i < n && m.ai < MAX_AI_TRADES; i++) {
      var t = tryAiTrade(state, rng);
      if (!t) continue;
      var r = execute(state, t);
      if (r.ok) {
        m.ai++;
        t.teams.forEach(function (a) { m.teams[a] = (m.teams[a] || 0) + 1; });
        done.push({ trade: t, text: r.text });
      }
    }
    return done;
  }

  // AI offers to the user. Realistic: teams mostly ask about role players, expiring deals and
  // upgrades a contender needs. A star is asked about rarely, and only with a clearly better package
  // for the user. The same player is not asked about again within 30 days, and offers come at most
  // about every 2 to 3 weeks (every few days in the run-up to the deadline, one per offseason phase).
  var OFFER_GAP = 18, OFFER_GAP_HOT = 5, ASK_AGAIN = 30;
  function aiOffers(state, rng, opts) {
    rng = rng || Math.random;
    opts = opts || {};
    var user = state.userTeam;
    if (!user || !state.teams[user] || !windowOpen(state)) return [];
    ensureDirections(state);
    var m = meta(state);
    m.asked = m.asked || {};
    if (m.offers >= MAX_OFFERS && !opts.force) return [];
    var d = currentDate(state), hot = d && d >= state.year + "-02-01";
    var off = OFFSEASON.indexOf(state.phase) >= 0, day = state.day || 0;
    if (!opts.force) {
      if (off) { if (m.lastOfferPhase === state.phase) return []; }
      else if (m.lastOfferDay != null && m.lastOfferPhase === state.phase && day - m.lastOfferDay < (hot ? OFFER_GAP_HOT : OFFER_GAP)) return [];
    }
    var p = off ? 0.3 : hot ? 0.85 : 0.6;   // js/league.js asks on about 8% of days; the gap above caps the rate
    if (!opts.force && rng() >= p) return [];
    var ctx = makeCtx(state);
    var ai = Object.keys(state.teams).filter(function (a) { return a !== user; });
    // the user's stars: his two best players, anyone 85+, or a franchise-level talent
    var mine = ctx.rosters[user].filter(function (id) { return countsOnRoster(state, state.players[id]); })
      .sort(function (a, b) { return state.players[b].ovr - state.players[a].ovr; });
    var star = {};
    mine.forEach(function (id, i) { var q = state.players[id]; if (i < 2 || q.ovr >= 85 || parts(ctx, id, user).talent >= 20) star[id] = 1; });
    for (var tries = 0; tries < 6; tries++) {
      var T = weighted(ai, function (a) { var dd = dirOf(ctx, a); return dd === "contend" ? 3 : dd === "neutral" ? 2 : 1; }, rng);
      var tdir = dirOf(ctx, T);
      var targets = mine.filter(function (id) {
        var q = state.players[id], last = m.asked[id];
        if (last && last.phase === state.phase && day - last.day < ASK_AGAIN) return false;
        return parts(ctx, id, T).talent >= 1;
      }).map(function (id) {
        var q = state.players[id], vT = parts(ctx, id, T).total, vU = parts(ctx, id, user).total;
        var w = Math.max(0.2, (vT - vU) + 0.2 * vT);
        var rem = remaining(q, ctx.year);
        if (star[id]) w *= 0.08;                                        // stars: rare
        else if (q.ovr >= 66) w *= 1.4;                                 // role players: the usual ask
        if (rem.length === 1 && tdir !== "rebuild") w *= 1.4;           // expiring deals
        if (tdir === "contend" && !star[id] && fitMult(ctx, T, q) > 1) w *= 1.5;   // a contender's upgrade
        if (tdir === "rebuild" && q.age >= 29) w *= 0.4;
        return { id: id, w: w };
      });
      if (!targets.length) continue;
      var tgt = weighted(targets, function (t) { return t.w; }, rng);
      var isStar = !!star[tgt.id];
      // T gives, the user (R) receives value close to fair, slightly favoring the AI; for a star the
      // user must come out clearly ahead
      var pk = buildPackages(ctx, T, user, [tgt.id], {
        limit: 1, maxAssets: 3, skipRecent: true, gRule: difficulty(state), rRule: { base: 0, pct: 0 },
        rOk: isStar ? function (e) { return e.gain >= 0.06 * e.outValue + 0.5; }
          : function (e) { return e.gain >= -(0.1 * e.outValue + 0.5) && e.gain <= 0.25 * e.outValue + 1.5; },
        gOk: function (e) { return e.margin >= 0; },
        score: isStar ? function (eR) { return eR.gain; } : function (eR) { return -Math.abs(eR.gain + 0.04 * eR.outValue); },
        jitter: function () { return rng() * 0.3; }
      });
      if (!pk.length) { m.asked[tgt.id] = { day: day, phase: state.phase }; continue; }
      m.offers++;
      m.lastOfferDay = day; m.lastOfferPhase = state.phase;
      m.asked[tgt.id] = { day: day, phase: state.phase };
      var tr = pk[0].trade;
      return [{ type: "tradeOffer", from: T, trade: tr, year: state.year, day: day,
        text: describe(state, tr),
        message: "The " + shortName(state, T) + " want " + state.players[tgt.id].name + ". " + describe(state, tr) }];
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // Execute
  // ---------------------------------------------------------------------------
  // "2013 1st (DAL, top 20 protected)", "2015 2nd (BOS)"
  // the protection for a pick in its own year: byYear when the data has it, else top
  function protTop(prot, year) {
    if (!prot || typeof prot !== "object") return 0;
    if (prot.until != null && year != null && year > +prot.until) return 0;
    if (prot.byYear && year != null && prot.byYear[year] != null) return +prot.byYear[year];
    return prot.top != null ? +prot.top : 0;
  }
  function protectionText(prot, pick) {
    if (!prot) return "";
    if (typeof prot === "string") return prot;
    if (prot.text) return String(prot.text);
    var year = pick && pick.year, round = pick && pick.round || 1;
    var top = protTop(prot, year);
    if (!top) return prot.top == null ? "protected" : "";
    var t;
    if (round === 2 && top > 30) t = top >= 60 ? "fully protected" : "protected 31-" + top;
    else if (top >= 30) t = "fully protected";
    else t = "top " + top + (prot.range && prot.range.length === 2 ? " and " + prot.range[0] + "-" + prot.range[1] : "") + " protected";
    if (prot.until != null && (year == null || +prot.until > year)) t += " through " + prot.until;
    return t;
  }
  function pickText(k) {
    if (!k) return "";
    var r = parsePickRef(k), rd = r.round === 1 ? "1st" : r.round === 2 ? "2nd" : r.round + "th";
    var pr = protectionText(r.protection, r);
    return r.year + " " + rd + " (" + r.original + (pr ? ", " + pr : "") + ")";
  }
  // current-draft picks read "2013 #7 (from DET)" once the order is known; others use pickText
  function pickLabel(state, k, holder) {
    if (!k) return "";
    var r = parsePickRef(k), s = state ? slotForEntry(state, r, holder || null) : null;
    if (!s) return pickText(k);
    var own = holder || s.team;
    return r.year + " #" + s.overall + (s.original && s.original !== own ? " (from " + s.original + ")" : "");
  }
  function listText(arr) {
    if (!arr.length) return "nothing";
    if (arr.length === 1) return arr[0];
    return arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1];
  }
  function describe(state, trade) {
    var parts2 = [];
    trade.teams.forEach(function (a) {
      var s = sideOf(trade, a), items = [];
      s.players.forEach(function (id) { var p = state.players[id]; items.push(p ? p.name + " (" + p.ovr + ")" : id); });
      s.picks.forEach(function (pk) { var r = findPick(state, a, pk) || parsePickRef(pk); items.push(pickLabel(state, r, a)); });
      var to = trade.teams.length === 2 ? " to " + (a === trade.teams[0] ? trade.teams[1] : trade.teams[0]) : "";
      parts2.push(a + " sends " + listText(items) + to);
    });
    return parts2.join("; ") + ".";
  }

  // saved rotations: an incoming player takes the slot (and minutes) of the player he replaces
  function fixRotations(state, teams, moves) {
    teams.forEach(function (t) {
      var tm = state.teams[t];
      if (!tm || !isArr(tm.rotation)) return;
      var outIds = {}, inc = [];
      moves.forEach(function (mv) {
        if (mv.kind !== "p") return;
        if (mv.from === t) outIds[mv.id] = 1;
        if (mv.to === t) inc.push(mv.id);
      });
      inc.sort(function (a, b) { return (state.players[b].ovr || 0) - (state.players[a].ovr || 0); });
      var mins = tm.minutes && typeof tm.minutes === "object" ? tm.minutes : null, rot = [];
      tm.rotation.forEach(function (id) {
        if (!outIds[id]) { rot.push(id); return; }
        var nid = inc.shift();
        if (nid) { rot.push(nid); if (mins) mins[nid] = mins[id] != null ? mins[id] : 0; }
        if (mins) delete mins[id];
      });
      inc.forEach(function (id) { rot.push(id); if (mins && mins[id] == null) mins[id] = 0; });
      tm.rotation = rot.filter(function (id) { return state.players[id] && state.players[id].team === t; });
      if (isArr(tm.inactive)) tm.inactive = tm.inactive.filter(function (id) { return !outIds[id]; });
      if (state.season && state.season.lineups && state.season.lineups[t]) {
        state.season.lineups[t] = { starters: tm.rotation.slice(0, 5), minutes: mins };
      }
    });
  }

  function execute(state, trade, opts) {
    opts = opts || {};
    if (!trade || !isArr(trade.teams) || trade.teams.length < 2) return { ok: false, reason: "Not a trade." };
    // ownership must still hold (offers can go stale)
    for (var i = 0; i < trade.teams.length; i++) {
      var a = trade.teams[i], s = sideOf(trade, a);
      if (!state.teams[a]) return { ok: false, reason: "Unknown team " + a + "." };
      for (var j = 0; j < s.players.length; j++) {
        var p = state.players[s.players[j]];
        if (!p || p.team !== a) return { ok: false, reason: (p ? p.name : s.players[j]) + " is no longer on " + a + "." };
      }
      for (var k = 0; k < s.picks.length; k++) if (!findPick(state, a, s.picks[k])) return { ok: false, reason: a + " no longer owns that pick." };
    }
    var text = describe(state, trade), ids = [], moves = [];
    trade.teams.forEach(function (a) {
      var s = sideOf(trade, a);
      s.players.forEach(function (id) { moves.push({ kind: "p", id: id, from: a, to: receiver(trade, a, id) }); });
      s.picks.forEach(function (pk) { var r = findPick(state, a, pk); moves.push({ kind: "k", pick: r, from: a, to: receiver(trade, a, pickId(r)) }); });
    });
    moves.forEach(function (mv) {
      if (mv.kind === "p") {
        var p = state.players[mv.id];
        p.team = mv.to; p.yearsWithTeam = 0; p.gleague = false;
        p.lastTrade = { year: state.year, day: state.day || 0, phase: state.phase };
        ids.push(mv.id);
      } else {
        var from = state.teams[mv.from], to = state.teams[mv.to];
        moveLiveSlot(state, mv.pick, mv.from, mv.to);
        var idx = from.picks.indexOf(mv.pick);
        if (idx >= 0) from.picks.splice(idx, 1);
        (to.picks = to.picks || []).push(mv.pick);
      }
    });
    fixRotations(state, trade.teams, moves);
    var day = state.day || 0;
    state.transactions = state.transactions || [];
    state.transactions.push({ year: state.year, day: day, type: "trade", text: text, ids: ids, teams: trade.teams.slice() });
    // headline names the best player moved
    var star = ids.map(function (id) { return state.players[id]; }).sort(function (x, y) { return y.ovr - x.ovr; })[0];
    var headline = star ? star.name + " traded to the " + teamName(state, star.team)
      : shortName(state, trade.teams[0]) + " and " + shortName(state, trade.teams[1]) + " swap picks";
    state.news = state.news || [];
    state.news.unshift({ year: state.year, day: day, headline: headline, body: text, ids: ids });
    if (state.news.length > 300) state.news.length = 300;
    return { ok: true, text: text, headline: headline };
  }

  // ---------------------------------------------------------------------------
  // Ask for more: the AI team adds one pick or player to its own offer, if it still says yes.
  // Returns { trade, added: { kind, id|pick }, text } or null ("that is our best offer").
  // ---------------------------------------------------------------------------
  function askForMore(state, trade, fromAbbr) {
    var user = state.userTeam;
    if (!trade || !isArr(trade.teams) || trade.teams.length !== 2 || trade.teams.indexOf(user) < 0) return null;
    var T = fromAbbr || (trade.teams[0] === user ? trade.teams[1] : trade.teams[0]);
    if (!state.teams[T] || !windowOpen(state)) return null;
    ensureDirections(state);
    var ctx = makeCtx(state), base = cloneTrade(trade);
    if (!validate(state, base, ctx).ok) return null;
    var used = {};
    base.teams.forEach(function (a) { sideOf(base, a).players.forEach(function (id) { used[id] = 1; }); });
    var usedK = {};
    sideOf(base, T).picks.forEach(function (k) { usedK[pickId(parsePickRef(k))] = 1; });
    // the team's core never goes in as an add-on
    var core = {};
    ctx.rosters[T].slice().sort(function (a, b) { return parts(ctx, b, T).talent - parts(ctx, a, T).talent; })
      .forEach(function (id, rk) { if (rk < 4) core[id] = 1; });
    var cands = [];
    (state.teams[T].picks || []).forEach(function (k) {
      if (k.year < ctx.draftYear || usedK[pickId(k)] || pickUsed(state, k, T)) return;
      cands.push({ kind: "k", pick: k, vT: pickVal(ctx, k, T), vU: pickVal(ctx, k, user) });
    });
    ctx.rosters[T].forEach(function (id) {
      var p = state.players[id];
      if (used[id] || core[id] || !countsOnRoster(state, p)) return;
      cands.push({ kind: "p", id: id, vT: parts(ctx, id, T).total, vU: parts(ctx, id, user).total });
    });
    // cheapest for them first, so the search finds something they can live with
    cands.sort(function (a, b) { return a.vT - b.vT; });
    var best = null;
    for (var i = 0; i < cands.length && i < 40; i++) {
      var c = cands[i];
      if (c.vU <= 0.15) continue;
      var t = cloneTrade(base);
      if (c.kind === "k") t.give[T].picks.push({ year: c.pick.year, round: c.pick.round, original: c.pick.original });
      else t.give[T].players.push(c.id);
      var ev = evaluate(state, t, { ctx: ctx });
      if (!ev.accepts) continue;
      if (!best || c.vU > best.c.vU) best = { c: c, trade: t };
    }
    if (!best) return null;
    var added = best.c.kind === "k" ? pickLabel(state, best.c.pick, T) : state.players[best.c.id].name;
    return { trade: best.trade, added: best.c.kind === "k" ? { kind: "pick", pick: best.c.pick } : { kind: "player", id: best.c.id },
      addedText: added, text: describe(state, best.trade),
      message: "The " + shortName(state, T) + " agree to add " + added + "." };
  }

  // ---------------------------------------------------------------------------
  // Draft night AI to AI pick trades: a team that loves a prospect moves up to the pick on the
  // clock, sending its later first and a sweetener. Called by js/draft.js before each AI pick.
  // ---------------------------------------------------------------------------
  var MAX_DRAFT_TRADES = 3;
  function draftNightTrade(state, rng, opts) {
    opts = opts || {};
    rng = rng || Math.random;
    var d = liveDraft(state);
    if (!d || state.phase !== "draft") return null;
    var slot = d.order[d.index];
    if (!slot || slot.player || slot.round !== 1 || slot.team === state.userTeam) return null;
    d.aiTrades = d.aiTrades || 0;
    if (d.aiTrades >= MAX_DRAFT_TRADES) return null;
    if (!opts.force && rng() >= (opts.rate != null ? opts.rate : 0.07)) return null;
    ensureDirections(state);
    var ctx = makeCtx(state), S = slot.team;
    var upEntry = entryForSlot(state, slot);
    if (!upEntry) return null;
    // buyers: AI teams with a later first-round pick in this draft
    var later = d.order.filter(function (s) {
      return !s.player && s.round === 1 && s.overall > slot.overall && s.overall <= slot.overall + 14 &&
        s.team !== S && s.team !== state.userTeam;
    });
    var seen = {}, buyers = [];
    later.forEach(function (s) { if (!seen[s.team]) { seen[s.team] = 1; buyers.push(s); } });
    for (var i = buyers.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), x = buyers[i]; buyers[i] = buyers[j]; buyers[j] = x; }
    var rule = { base: 0.1, pct: 0.02 };
    for (var b = 0; b < buyers.length && b < 6; b++) {
      var bs = buyers[b], B = bs.team, downEntry = entryForSlot(state, bs);
      if (!downEntry) continue;
      var love = 0.15 + rng() * 0.35;   // how much the buyer wants the player on the board
      var vUp = pickVal(ctx, upEntry, B) * (1 + love);
      // sweeteners: nothing, then the buyer's second-rounders and future picks, cheapest first
      var extras = [null].concat((state.teams[B].picks || []).filter(function (k) {
        return k !== downEntry && k.year >= d.year && !pickUsed(state, k, B) && (k.year > d.year || k.round === 2);
      }).sort(function (a, c) { return pickVal(ctx, a, B) - pickVal(ctx, c, B); }));
      for (var e = 0; e < extras.length && e < 8; e++) {
        var t = { teams: [B, S], give: {} };
        t.give[B] = { players: [], picks: [{ year: downEntry.year, round: downEntry.round, original: downEntry.original }] };
        if (extras[e]) t.give[B].picks.push({ year: extras[e].year, round: extras[e].round, original: extras[e].original });
        t.give[S] = { players: [], picks: [{ year: upEntry.year, round: upEntry.round, original: upEntry.original }] };
        var eS = gain(ctx, S, t, rule);
        if (eS.margin < 0) continue;
        var cost = pickVal(ctx, downEntry, B) + (extras[e] ? pickVal(ctx, extras[e], B) : 0);
        if (vUp - cost < 0) break;   // more sweetener only costs more
        if (!validate(state, t, ctx).ok) continue;
        var upNo = slot.overall, downNo = bs.overall;
        var r = execute(state, t);
        if (!r.ok) return null;
        d.aiTrades++;
        var head = "The " + teamName(state, B) + " trade up to No. " + upNo;
        var body = "Draft night deal: the " + shortName(state, B) + " move up from No. " + downNo + " to No. " + upNo +
          ", sending " + listText(t.give[B].picks.map(function (k) { return k.year === d.year && k.round === downEntry.round && k.original === downEntry.original ? "No. " + downNo : pickLabel(state, findPick(state, S, k) || k, B); })) +
          " to the " + shortName(state, S) + ".";
        if (state.news && state.news[0] && state.news[0].body === r.text) { state.news[0].headline = head; state.news[0].body = body; state.news[0].draftTrade = true; }
        return { trade: t, text: r.text, headline: head, body: body };
      }
    }
    return null;
  }

  var API = {
    value: value, pickValue: pickValue, evaluate: evaluate, finder: finder,
    aiOffers: aiOffers, aiTrades: aiTrades, execute: execute,
    // extras
    validate: function (state, trade) { return validate(state, trade); },
    describe: describe, updateDirections: updateDirections, windowOpen: windowOpen, pickId: pickId,
    shop: shop, pickText: pickText, protectionText: protectionText,
    // draft night and trade screen helpers
    pickLabel: pickLabel, slotForEntry: slotForEntry, entryForSlot: entryForSlot, pickUsed: pickUsed,
    deadline: deadline, deadlineMD: deadlineMD, askForMore: askForMore, draftNightTrade: draftNightTrade, liveDraft: liveDraft
  };
  W.TRADE = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
