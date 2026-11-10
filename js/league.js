/* The orchestrator: one save (the league state), the calendar, and the offseason flow.
   Every other module is optional at runtime: if it hasn't loaded, its step is skipped instead of crashing. */
(function (root) {
  var W = root;
  function mod(name) { return W[name] || null; }
  function safe(label, fn, fallback) {
    try { return fn(); } catch (e) { if (W.console) console.warn("[league] " + label + " failed:", e && e.message); return fallback; }
  }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function rngFor(state) { state.rngSeed = (state.rngSeed * 1103515245 + 12345) % 2147483647; return mulberry32(state.rngSeed); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  // Real trade deadline and All-Star Sunday by season-ending year (month-day); trade.js owns the deadline table
  var ALL_STAR = { 2013: "02-17", 2014: "02-16", 2015: "02-15", 2016: "02-14", 2017: "02-19", 2018: "02-18", 2019: "02-17",
    2020: "02-16", 2021: "03-07", 2022: "02-20", 2023: "02-19", 2024: "02-18", 2025: "02-16", 2026: "02-15" };
  var KEY_DATES = {
    tradeDeadline: function (year) { return W.TRADE && W.TRADE.deadlineMD ? W.TRADE.deadlineMD(year) : "02-21"; },
    allStar: function (year) { return ALL_STAR[year] || "02-15"; }
  };
  function keyDate(how, year) { var f = KEY_DATES[how]; return f ? f(year) : null; }
  var OFFSEASON = ["draftLottery", "draft", "resign", "freeAgency", "training"];

  // ---------- building a new league ----------
  function contractFor(p, year) {
    var end = Math.max(year, p.contractEnd || year), salaries = [], real = {};
    // real year-by-year salaries from the league file when known; missing years grow 4.5% from the last known one
    (p.salaries || []).forEach(function (s) { if (s && s.year != null && s.amount > 0) real[s.year] = s.amount; });
    var last = real[year] || p.salary || 0;
    for (var y = year; y <= end; y++) {
      if (real[y]) last = real[y]; else if (y > year) last = Math.round(last * 1.045);
      salaries.push({ year: y, amount: last });
    }
    // real player, team and early termination options (year = the season the option covers)
    var options = (p.options || []).filter(function (o) { return o && o.year > year && o.year <= end && /^(player|team|eto)$/.test(o.type); })
      .map(function (o) { return { year: o.year, type: o.type }; }).sort(function (a, b) { return a.year - b.year; });
    var rookie = (p.age || 30) <= 24 && end - year <= 3 && (p.salary || 0) < 6000000;
    return { salaries: salaries, option: options[0] || null, options: options, rookie: rookie, twoWay: false, signedYear: year - 1 };
  }
  function personalityFor(id, rng) {
    var real = W.PERSONALITIES && W.PERSONALITIES[id];
    if (real) return clone(real);
    var r = function () { return Math.round(20 + rng() * 60); };
    return { loyalty: r(), winning: r(), money: r(), market: r(), ego: r() };
  }
  // ---------- start years ----------
  // A league can open in another season. data/start-YYYY.js sets window.START_LEAGUES[YYYY]: the opening-night
  // league (teams; players with contracts, ratings and tendencies, in the data/league2012.js format), draft
  // rights, pick ownership, and prior: what happened before it (career seasons, awards, champions and MVPs,
  // all-time totals, last season's records). useStart swaps the "before the save" tables (CAREER_PRIOR,
  // AWARDS_PRIOR, HISTORY_PRIOR, ALLTIME_PRIOR) to that season so every page reads the right past.
  // 2013 (the 2012-13 season, data/league2012.js) needs no start file.
  var PRIOR_BASE = null, PRIOR_FOR = {};
  function startData(year) { year = +year || 2013; return year === 2013 ? null : (W.START_LEAGUES && W.START_LEAGUES[year]) || null; }
  function mergePrior(base, add, year, S) {
    var career = {}, awards = {};
    function merge(dst, src, keyOf) {
      Object.keys(src || {}).forEach(function (id) {
        var have = {};
        (dst[id] || []).forEach(function (x) { have[keyOf(x)] = 1; });
        var list = (dst[id] || []).concat((src[id] || []).filter(function (x) { return x && x.year < year && !have[keyOf(x)]; }));
        list.sort(function (a, b) { return a.year - b.year; });
        if (list.length) dst[id] = list;
      });
    }
    Object.keys(base.career || {}).forEach(function (id) { var l = base.career[id].filter(function (x) { return x.year < year; }); if (l.length) career[id] = l; });
    merge(career, add.career, function (x) { return x.year + "|" + x.team; });
    Object.keys(base.awards || {}).forEach(function (id) { var l = base.awards[id].filter(function (x) { return x.year < year; }); if (l.length) awards[id] = l; });
    merge(awards, add.awards, function (x) { return x.year + "|" + x.award; });
    var h = base.history || {}, ah = add.history || {};
    var seen = {}, champs = [];
    (h.champions || []).concat(ah.champions || []).forEach(function (c) { if (c && c.year < year && !seen[c.year]) { seen[c.year] = 1; champs.push(c); } });
    champs.sort(function (a, b) { return a.year - b.year; });
    var titles = {};
    champs.forEach(function (c) { if (c.abbr) titles[c.abbr] = (titles[c.abbr] || 0) + 1; });
    // franchises whose old titles carry no abbreviation keep the count from the base table
    Object.keys(h.titles || {}).forEach(function (a) {
      var before = (h.champions || []).filter(function (c) { return c.abbr === a; }).length;
      if ((h.titles[a] || 0) > before) titles[a] = (titles[a] || 0) + h.titles[a] - before;
    });
    var mvp = {};
    Object.keys(h.mvp || {}).concat(Object.keys(ah.mvp || {})).forEach(function (y) { if (+y < year) mvp[y] = (ah.mvp && ah.mvp[y]) || h.mvp[y]; });
    var history = Object.assign({}, h, { champions: champs, mvp: mvp, titles: titles });
    if (ah.records) history.records = ah.records;
    // draft classes before 2013 and the real career ratings of those seasons (leagues that start before 2012-13)
    var drafts = base.drafts, targets = base.targets;
    if (S && S.drafts && Object.keys(S.drafts).length) drafts = Object.assign({}, base.drafts, S.drafts);
    if (S && S.targetsPrior && Object.keys(S.targetsPrior).length) {
      targets = Object.assign({}, base.targets);
      Object.keys(S.targetsPrior).forEach(function (id) { targets[id] = Object.assign({}, base.targets[id] || {}, S.targetsPrior[id]); });
    }
    return { career: career, awards: awards, history: history, alltime: add.alltime || base.alltime, drafts: drafts, targets: targets };
  }
  function useStart(year) {
    year = +year || 2013;
    if (!PRIOR_BASE) PRIOR_BASE = { career: W.CAREER_PRIOR, awards: W.AWARDS_PRIOR, history: W.HISTORY_PRIOR, alltime: W.ALLTIME_PRIOR, drafts: W.DRAFTS, targets: W.TARGETS };
    var S = startData(year), m = PRIOR_BASE;
    if (S && S.prior) m = PRIOR_FOR[year] || (PRIOR_FOR[year] = mergePrior(PRIOR_BASE, S.prior, year, S));
    W.CAREER_PRIOR = m.career; W.AWARDS_PRIOR = m.awards; W.HISTORY_PRIOR = m.history; W.ALLTIME_PRIOR = m.alltime;
    if (m.drafts) W.DRAFTS = m.drafts;
    if (m.targets) W.TARGETS = m.targets;
    return S ? year : 2013;
  }

  // opts.start: the season to open in (season-ending year, 2013 by default; others need data/start-YYYY.js)
  function newLeague(userTeam, opts) {
    opts = opts || {};
    var startYear = +opts.start || 2013;
    var base = startData(startYear) || W.LEAGUE_2012;
    if (!base) throw new Error("League data not loaded");
    if (startYear !== 2013 && base === W.LEAGUE_2012) throw new Error("The " + (startYear - 1) + "-" + String(startYear).slice(2) + " league data is not loaded");
    var other = base !== W.LEAGUE_2012;
    useStart(other ? base.season : 2013);
    var seed = opts.seed || Math.floor(Math.random() * 2147483646) + 1;
    var rng = mulberry32(seed);
    var state = { version: 1, year: base.season, phase: "regular", userTeam: userTeam, day: 0, rngSeed: seed,
      players: {}, teams: {}, season: null, history: { seasons: [], prior: W.HISTORY_PRIOR || null },
      transactions: [], news: [], events: [], settings: { difficulty: "normal" }, startYear: base.season };
    base.players.forEach(function (p0) {
      var p = clone(p0);
      p.contract = p.team === "FA" ? null : contractFor(p0, state.year);
      delete p.salaries; delete p.options; // folded into p.contract
      // real NBA seasons before 2012-13 (0 for true rookies), and the latest run of seasons with his team
      var prior = W.CAREER_PRIOR ? (W.CAREER_PRIOR[p.id] || []) : null;
      if (prior) {
        var seasonsPlayed = {}, run = 0;
        prior.forEach(function (x) { if (x && x.year != null) seasonsPlayed[x.year] = true; });
        p.yearsPro = Object.keys(seasonsPlayed).length;
        for (var k = prior.length - 1; k >= 0 && prior[k] && prior[k].team === p.team; k--) run++;
        p.yearsWithTeam = Math.min(p.yearsPro, run);
        // league-file players with no career-prior entry (the extra October 2012 free agents) carry their own count
        if (!prior.length && p0.yearsPro > 0) { p.yearsPro = p0.yearsPro; p.yearsWithTeam = 0; }
      } else if (p0.yearsPro != null) {
        p.yearsPro = p0.yearsPro; p.yearsWithTeam = 0;
      } else {
        p.yearsPro = Math.max(0, (p.age || 22) - 21);
        p.yearsWithTeam = p.contract && p.contract.rookie ? Math.min(p.yearsPro, 3) : 2;
      }
      p.draft = null; p.personality = personalityFor(p.id, rng); p.mood = 60;
      p.stashedUntil = null; p.gleague = false; p.careerStats = []; p.awards = []; p.retired = false; p.hof = false;
      // potential = the real career peak from the history targets, when known
      var tg = W.TARGETS && W.TARGETS[p.id];
      if (tg) { var peak = p.ovr, P = mod("PROG") ? W.PROG : null; for (var ty in tg) if (/^\d{4}$/.test(ty) && typeof tg[ty] === "number") peak = Math.max(peak, P && P.scaleRating ? P.scaleRating(+ty, tg[ty]) : tg[ty]); p.pot = Math.min(99, Math.round(peak)); }
      state.players[p.id] = p;
    });
    // Players drafted before 2013 whose rights a team held in October 2012 (data/drafts.js DRAFT_RIGHTS):
    // on the rights team as stash players (no contract, playing overseas) until their arrival season;
    // never part of a draft class. DRAFT.signRookies signs them with whoever holds the rights then.
    var teamAbbrs = {};
    base.teams.forEach(function (t0) { teamAbbrs[t0.abbr] = true; });
    var rightsPlayers = (other ? base.rights || [] : W.DRAFT_RIGHTS || []).slice();
    if (W.DRAFTS) Object.keys(W.DRAFTS).forEach(function (yr) { W.DRAFTS[yr].forEach(function (pr) { if (pr && pr.rights) rightsPlayers.push(pr); }); });
    rightsPlayers.forEach(function (pr) {
      var r = pr.rights;
      if (state.players[pr.id] || !r || !teamAbbrs[r.team]) return;
      // another start year: only rights to players still overseas (the rest are in the league file or gone)
      if (other && !(+pr.arrivalYear > state.year) && !(+r.draftYear >= state.year)) return;
      var p = clone(pr);
      p.team = r.team; p.draftYear = r.draftYear; p.realPick = r.pick; p.undrafted = false;
      p.draft = { year: r.draftYear, round: r.pick <= 30 ? 1 : 2, pick: r.pick, team: r.draftedBy || r.team };
      p.contract = { salaries: [], option: null, rookie: false, twoWay: false, signedYear: null };
      p.yearsPro = 0; p.yearsWithTeam = 0;
      p.personality = personalityFor(p.id, rng); p.mood = 60;
      p.gleague = false; p.careerStats = []; p.awards = []; p.retired = false; p.hof = false;
      scaleProspect(p, +pr.arrivalYear || state.year + 1);
      if (pr.arrivalYear != null && +pr.arrivalYear > state.year) {
        p.stashedUntil = +pr.arrivalYear;
        p.injury = { type: "Playing overseas", games: 999 };
        // the data has his arrival-season level: he starts a bit below it, since the age curve develops
        // him each summer overseas (the real target takes over in his arrival summer)
        var summers = +pr.arrivalYear - state.year - 1;
        if (summers > 0 && mod("PROG") && W.PROG.setOvr) safe("rightsOvr", function () { W.PROG.setOvr(p, p.ovr - 1.5 * summers, { keepPot: true }); });
      } else p.stashedUntil = null;
      state.players[p.id] = p;
    });
    if (W.DRAFTS) Object.keys(W.DRAFTS).forEach(function (yr) {
      if (+yr < state.year) return;   // classes drafted before the start are in the league file (or out of the league)
      var cls = [];
      W.DRAFTS[yr].forEach(function (pr) {
        if (state.players[pr.id] || pr.rights) return;
        var p = clone(pr); p.team = "DRAFT"; p.contract = null; p.yearsPro = 0; p.yearsWithTeam = 0;
        p.personality = personalityFor(p.id, rng); p.mood = 60; p.careerStats = []; p.awards = []; p.retired = false;
        state.players[p.id] = p; cls.push(p);
      });
      // the whole class onto the 2K13 rookie scale (by rank in the class, js/draft.js)
      if (mod("DRAFT") && W.DRAFT.rookieScale) safe("rookieScale", function () { W.DRAFT.rookieScale(cls, +yr); });
    });
    state.ratingScale = 2;
    base.teams.forEach(function (t0) {
      var t = clone(t0);
      t.picks = []; t.direction = "neutral"; t.strategy = { pace: 50, three: 50, defense: "man", crash: 50 };
      // budgets are display only (no gameplay effect)
      t.rotation = null; t.budget = { coaching: 50, facilities: 50, health: 50, scouting: 50 };
      t.finances = { revenue: 0, expenses: 0, ticketPrice: 50 };
      t.coach = null;
      state.teams[t.abbr] = t;
    });
    assignPicks(state, other ? base.picks || null : W.PICKS_2012);
    // injury and career fates: once per save, real story or the healthy path (never shown in the UI)
    if (mod("PROG") && W.PROG.rollFates) safe("fates", function () { W.PROG.rollFates(state); });
    // coaches are cosmetic: names and records for display
    if (mod("COACH") && W.COACH.init) safe("coaches", function () { W.COACH.init(state); });
    // a start's first season: AI rotations lean on who really played (real minutes per game that season)
    if (other && base.seasonStats) Object.keys(base.seasonStats).forEach(function (id) { var rp = state.players[id]; if (rp) rp.realMpg = { year: base.season, mpg: base.seasonStats[id].mpg }; });
    var today = opts.today && base.today ? base.today : null;
    if (today) todayRosters(state, today);
    startSeason(state);
    if (today) { todayResults(state, today); state.startDate = today.date; }
    // real-life mode (js/reallife.js): the real moves after opening night (or today) happen on their dates
    if (opts.realLife) {
      state.realLife = true;
      var first = state.season && state.season.days[state.season.day];
      state.realCursor = mod("REALLIFE") && first ? W.REALLIFE.dayBefore(first.date) : null;
    }
    news(state, "Welcome to the " + (state.year - 1) + "-" + String(state.year).slice(2) + " season",
      "You are now running the " + state.teams[userTeam].city + " " + state.teams[userTeam].name + "." +
      (today ? " The season is already under way: every game before " + today.date + " counts with its real score." : ""), []);
    return state;
  }

  // A league that starts at the draft (summer after season `year`, opts.realLife for what comes after): the
  // season is played out first with real life on (the real trades happen), then given its real ending: the
  // real records (they set the lottery), the real champion and each player's real line. The user takes
  // over on draft night; his team was run by its front office until then.
  function summerStart(userTeam, year, opts) {
    opts = opts || {};
    var base = startData(year);
    if (!base) throw new Error("The " + (year - 1) + "-" + String(year).slice(2) + " league data is not loaded");
    var state = newLeague(userTeam, { start: year, seed: opts.seed, realLife: !!W.REAL_MOVES });
    var guard = 0;
    while (state.season.phase !== "done" && guard++ < 200) {
      state.events.forEach(function (e) { e.resolved = true; });
      clearResolved(state);
      advance(state, { days: state.season.phase === "regular" ? 10 : 1 });   // one day at a time once the playoffs start, so the season stops at its end
    }
    if (state.phase !== "regular" && state.phase !== "playoffs") throw new Error("The season ended before its real results went in");
    var s = state.season, real = base.real || {};
    Object.keys(real).forEach(function (a) { if (s.standings[a]) { s.standings[a].w = real[a].w; s.standings[a].l = real[a].l; } });
    var E = mod("ENGINE"), lines = base.seasonStats || {};
    if (E && E.emptyLine) Object.keys(lines).forEach(function (id) {
      if (!state.players[id]) return;
      var x = lines[id], g = x.g || 0, t = E.emptyLine(), f = (x.fgp || 45) / 100, tp = (x.tpp || 33) / 100, ft = (x.ftp || 75) / 100;
      if (!g) return;
      var fga = x.pts * g / (2 * f + 0.3 * tp + 0.3 * ft);   // attempts from points and the real percentages
      t.g = g; t.gs = (s.playerStats[id] || {}).gs || 0; t.min = Math.round(x.mpg * g * 10) / 10; t.pts = Math.round(x.pts * g);
      t.fga = Math.round(fga); t.fgm = Math.round(fga * f); t.tpa = Math.round(fga * 0.3); t.tpm = Math.round(fga * 0.3 * tp);
      t.fta = Math.round(fga * 0.3); t.ftm = Math.round(fga * 0.3 * ft);
      t.oreb = Math.round(x.reb * g * 0.25); t.dreb = Math.round(x.reb * g) - t.oreb; t.ast = Math.round(x.ast * g); t.stl = Math.round(x.stl * g); t.blk = Math.round(x.blk * g);
      s.playerStats[id] = t;
    });
    if (base.champion && state.teams[base.champion] && s.playoffs) { s.playoffs.champion = base.champion; s.playoffs.finalsMvp = null; s.champion = base.champion; }
    state.events.forEach(function (e) { e.resolved = true; });
    clearResolved(state);
    advance(state, "endPlayoffs");   // the season's end: awards, career lines, history
    state.realLife = !!opts.realLife;
    state.summerStart = year;
    news(state, "Draft night " + year, "The " + (year - 1) + "-" + String(year).slice(2) + " season is in the books" +
      (base.champion && state.teams[base.champion] ? " (the " + state.teams[base.champion].name + " won it all)" : "") + ". You take over the " + state.teams[userTeam].name + " for the draft and free agency.", []);
    return state;
  }

  // A league that starts today, in a season still being played (base.today): the rosters as they are today,
  // every game already played with its real score, each player's real totals so far and today's injuries.
  function todayRosters(state, T) {
    var year = state.year;
    Object.keys(T.moves || {}).forEach(function (id) {
      var p = state.players[id], to = T.moves[id];
      if (p && to === "FA") { p.team = "FA"; p.yearsWithTeam = 0; p.contract = { salaries: [], option: null, options: [], rookie: false, twoWay: false, signedYear: null }; return; }
      if (!p || !state.teams[to]) return;
      p.team = to; p.yearsWithTeam = 0;
      if (!p.contract || !p.contract.salaries || !p.contract.salaries.some(function (x) { return x.year === year && x.amount > 0; })) {
        var r = mod("CBA") ? safe("min", function () { return W.CBA.rules(year); }, null) : null;
        var amt = (r && r.minSalary && r.minSalary(p.yearsPro || 0)) || 1200000;
        p.contract = { salaries: [{ year: year, amount: amt }], option: null, options: [], rookie: false, twoWay: false, signedYear: year, via: "min" };
      }
    });
    // real rosters list two-way players too: keep 15, letting go of the lowest rated who have not played
    Object.keys(state.teams).forEach(function (a) {
      var on = Object.keys(state.players).map(function (k) { return state.players[k]; })
        .filter(function (p) { return p.team === a && !p.retired && !(p.stashedUntil > year); });
      var played = function (p) { var t = T.totals && T.totals[p.id]; return t ? t[0] : 0; };
      on.sort(function (x, y) { return (played(x) > 0) - (played(y) > 0) || x.ovr - y.ovr; });
      for (var i = 0; on.length - i > 15; i++) {
        var p = on[i];
        p.team = "FA"; p.yearsWithTeam = 0; p.contract = { salaries: [], option: null, options: [], rookie: false, twoWay: false, signedYear: null };
      }
    });
  }
  function todayResults(state, T) {
    var s = state.season, E = mod("ENGINE");
    if (!s || !E || !E.recordScore) return;
    var real = {}, day = 0, missed = [];
    (T.results || []).forEach(function (r) { real[r[0] + ":" + r[1] + ":" + r[2]] = r; });
    s.days.forEach(function (d, i) {
      if (d.playoff || d.date >= T.date) return;
      day = i + 1;
      d.games.forEach(function (g) {
        var r = real[d.date + ":" + g.home + ":" + g.away];
        if (r) { E.recordScore(s, g, r[3], r[4]); g.real = true; } else missed.push(g);
      });
      d.games = d.games.filter(function (g) { return g.played; });
    });
    // a game the real calendar has not played yet (postponed): played the day after the regular season
    if (missed.length) {
      var last = s.days.filter(function (d) { return !d.playoff; }).slice(-1)[0], next = new Date(last.date + "T12:00:00Z");
      next.setUTCDate(next.getUTCDate() + 1);
      s.days.splice(s.days.indexOf(last) + 1, 0, { date: next.toISOString().slice(0, 10), games: missed });
    }
    s.day = day; state.day = day;
    Object.keys(T.totals || {}).forEach(function (id) {
      if (!state.players[id]) return;
      var t = T.totals[id], line = E.emptyLine();
      ["g", "gs", "min", "pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf", "td"].forEach(function (k, i) { line[k] = t[i] || 0; });
      s.playerStats[id] = line;
    });
    Object.keys(T.injuries || {}).forEach(function (id) {
      var p = state.players[id], x = T.injuries[id];
      if (!p || p.retired) return;
      s.injuries[id] = { type: x.type, games: x.games };
      p.injury = { type: x.type, games: x.games };
    });
  }

  // Draft picks each team owns. With window.PICKS_2012 (real ownership as of October 2012:
  // { ABBR: [ { year, round, original, protection } ] }) the real picks are used; every
  // year and round nobody holds is filled with the team's own pick.
  var PICK_YEARS = 7;
  // keeps every protection field: top, until, byYear, range, extinguish, then
  function normProtection(pr) {
    if (!pr || typeof pr !== "object") return null;
    var out = {};
    if (pr.top != null && +pr.top > 0) out.top = +pr.top;
    if (pr.until != null && !isNaN(+pr.until)) out.until = +pr.until;
    if (pr.byYear && typeof pr.byYear === "object") {
      out.byYear = {};
      for (var y in pr.byYear) if (pr.byYear[y] != null && !isNaN(+pr.byYear[y])) out.byYear[y] = +pr.byYear[y];
      if (out.top == null) { var ks = Object.keys(out.byYear).sort(); if (ks.length) out.top = out.byYear[ks[0]]; }
    }
    if (Array.isArray(pr.range) && pr.range.length === 2) out.range = [+pr.range[0], +pr.range[1]];
    if (pr.extinguish) out.extinguish = true;
    if (pr.then != null) out.then = String(pr.then);
    for (var k in pr) if (out[k] === undefined && pr[k] !== undefined) out[k] = clone(pr[k]); // anything else the data carries
    return out.top == null && !out.range ? null : out;
  }
  function assignPicks(state, real) {
    var abbrs = Object.keys(state.teams), held = {};
    var key = function (y, r, o) { return y + ":" + r + ":" + o; };
    if (real && typeof real === "object") {
      abbrs.forEach(function (a) {
        var list = Array.isArray(real[a]) ? real[a] : [];
        list.forEach(function (pk) {
          if (!pk || !(+pk.year >= state.year) || (+pk.round !== 1 && +pk.round !== 2)) return;
          var orig = state.teams[pk.original] ? pk.original : a;
          var k = key(+pk.year, +pk.round, orig);
          if (held[k]) return; // one owner per pick
          held[k] = a;
          var entry = { year: +pk.year, round: +pk.round, original: orig, protection: normProtection(pk.protection) };
          if (pk.swap && state.teams[pk.swap]) entry.swap = pk.swap;   // pick swap right held by that team
          state.teams[a].picks.push(entry);
        });
      });
    }
    abbrs.forEach(function (a) {
      for (var y = state.year; y < state.year + PICK_YEARS; y++) for (var rd = 1; rd <= 2; rd++) {
        if (held[key(y, rd, a)]) continue;
        held[key(y, rd, a)] = a;
        state.teams[a].picks.push({ year: y, round: rd, original: a, protection: null });
      }
      state.teams[a].picks.sort(function (x, z) { return x.year - z.year || x.round - z.round || (x.original < z.original ? -1 : 1); });
    });
  }

  // the view of the league the engine plays games with: NBA players only
  function leagueView(state) {
    var players = [];
    for (var id in state.players) {
      var p = state.players[id];
      if (p.retired || p.team === "FA" || p.team === "DRAFT" || p.gleague) continue;
      if (p.stashedUntil && p.stashedUntil > state.year) continue;
      if (!state.teams[p.team]) continue;
      players.push(p);
    }
    var teams = Object.keys(state.teams).map(function (k) { return state.teams[k]; });
    return { season: state.year, teams: teams, players: players };
  }
  // real rebrands and logo changes on their real dates
  var REBRANDS = { NOH: [[2014, "New Orleans", "Pelicans"]], CHA: [[2015, "Charlotte", "Hornets"]], BKN: [[2013, "Brooklyn", "Nets"]] };
  // Real moves for leagues that start before they happened: the SuperSonics become the Oklahoma City Thunder for
  // 2008-09 (the franchise keeps everything: players, contracts, picks, coach)
  var RELOCATIONS = { 2009: { from: "SEA", to: "OKC", city: "Oklahoma City", name: "Thunder", colors: ["#007AC1", "#EF3B24"],
    headline: "The SuperSonics move to Oklahoma City", body: "Seattle's franchise is now the Oklahoma City Thunder, starting with the 2008-09 season." } };
  function relocate(state, r) {
    var t = state.teams[r.from];
    if (!t || state.teams[r.to]) return false;
    t.abbr = r.to; t.city = r.city; t.name = r.name; t.colors = r.colors.slice();
    state.teams[r.to] = t; delete state.teams[r.from];
    var swap = function (a) { return a === r.from ? r.to : a; };
    Object.keys(state.players).forEach(function (id) {
      var p = state.players[id];
      p.team = swap(p.team); if (p.lastTeam) p.lastTeam = swap(p.lastTeam);
      if (p.draft && p.draft.team) p.draft.team = swap(p.draft.team);
    });
    Object.keys(state.teams).forEach(function (a) { (state.teams[a].picks || []).forEach(function (pk) { pk.original = swap(pk.original); if (pk.swap) pk.swap = swap(pk.swap); }); });
    Object.keys(state.coaches || {}).forEach(function (id) { var c = state.coaches[id]; if (c && c.team) c.team = swap(c.team); });
    if (state.fa && state.fa.rights) Object.keys(state.fa.rights).forEach(function (id) { var x = state.fa.rights[id]; if (x && x.team) x.team = swap(x.team); });
    state.userTeam = swap(state.userTeam);
    news(state, r.headline, r.body, []);
    (state.transactions = state.transactions || []).push({ year: state.year, day: 0, type: "relocation", text: r.headline + ".", ids: [] });
    return true;
  }
  function applyBrands(state) {
    for (var abbr in state.teams) {
      var t = state.teams[abbr];
      (REBRANDS[abbr] || []).forEach(function (r) {
        if (state.year >= r[0] && (t.name !== r[2] || t.city !== r[1])) { t.city = r[1]; t.name = r[2]; news(state, "The " + r[1] + " franchise is now the " + r[1] + " " + r[2], "New name, colors and logo for the " + (state.year - 1) + "-" + String(state.year).slice(2) + " season.", []); }
      });
      var list = W.LOGOS && W.LOGOS[abbr], best = null;
      if (list) list.forEach(function (e) { if (e.verified !== false && e.from <= state.year && (!best || e.from >= best.from)) best = e; });
      if (best) { t.logo = best.url; t.logoNoRef = !!best.noReferrer; }
    }
  }
  // Real seasons lost to injury (Achilles, ACL, knees, back): the only real lost seasons the save keeps
  var INJURY_OUT = {"thompkl01":[2020,2021],"duranke01":[2020],"walljo01":[2020],"irvinky01":[2026],"lillada01":[2026],"halibty01":[2026],"vanvlfr01":[2026],
    "beysa01":[2025],"leonaka01":[2022],"murraja01":[2022],"willizi01":[2022],"isaacjo01":[2021,2022],"balllo01":[2023,2024],"rosede01":[2013],"bynuman01":[2013],
    "gallida01":[2014,2023],"porzikr01":[2019],"murrade01":[2019],"roberan03":[2019],"couside01":[2020],"ezelife01":[2014],"adamsst01":[2024],"chandwi01":[2016],
    "exumda01":[2016],"knighbr03":[2018],"nunnke01":[2022],"fryech01":[2013],"okafoem01":[2014],"richaja01":[2014],"haywobr01":[2014],"cartemi01":[2022],
    "colliza01":[2021],"wisemja01":[2022],"curryse01":[2018],"kolokch01":[2024],"cancavl01":[2024],"sumneed01":[2022],"williel01":[2013],"pondequ01":[2016,2017],
    "milleda01":[2020]};
  // Real players' positions season by season (data/pos-history.js): each season after the start, while the
  // data covers it, a player still on his real path takes his real position that season.
  function realPositions(state) {
    var H = W.POS_HISTORY;
    if (!H || !(state.year > (state.startYear || 2013)) || state.year > 2027) return;
    Object.keys(H).forEach(function (id) {
      var p = state.players[id];
      if (!p || p.retired || p.offPath || p.team === "DRAFT") return;
      var rows = H[id], pos = null;
      for (var i = 0; i < rows.length; i++) if (rows[i][0] <= state.year) pos = rows[i][1];
      if (pos && rows[rows.length - 1][0] >= state.year - 1) p.pos = pos;   // only while his real career is still going
    });
  }
  function startSeason(state) {
    safe("realPositions", function () { realPositions(state); });
    // opening night rosters (chemistry's continuity); chemistry carries over half its distance from 60
    Object.keys(state.teams).forEach(function (a) {
      var t = state.teams[a];
      t.openRoster = Object.keys(state.players).filter(function (id) { var p = state.players[id]; return p.team === a && !p.retired; });
      t.chem = t.chem != null ? Math.round(60 + (t.chem - 60) * 0.5) : 60;
    });
    var move = RELOCATIONS[state.year];
    if (move) safe("relocation", function () { relocate(state, move); });
    applyBrands(state);
    // The offseason heals last season's injuries (overseas stash players stay away until they arrive)
    var newYear = state.history && state.history.seasons && state.history.seasons.length > 0;
    for (var oid in state.players) {
      var op = state.players[oid];
      var otg = mod("PROG") && W.PROG.targetsOf ? W.PROG.targetsOf(state, oid) : (W.TARGETS && W.TARGETS[oid]);
      if (newYear && op && op.injury && op.injury.type !== "Playing overseas" && op.injury.season !== state.year) op.injury = null;
      // Real seasons lost to injury (TARGETS out list, injury years only): the player sits out the whole
      // year, like he did in real life. Years he was out of the league or overseas (Greg Monroe in Russia)
      // do not bench him: if he is still good in this save, he plays.
      if (!op || op.retired || !otg || !Array.isArray(otg.out) || otg.out.indexOf(state.year) < 0) continue;
      if (!INJURY_OUT[oid] || INJURY_OUT[oid].indexOf(state.year) < 0) continue;
      if (!op.injury || (op.injury.games || 0) < 82) op.injury = { type: "Out for the season", games: 999, real: true, season: state.year };
    }
    var E = mod("ENGINE");
    if (!E) throw new Error("Game engine not loaded");
    state.season = E.newSeason(leagueView(state), { year: state.year, userTeam: state.userTeam,
      rules: mod("CBA") ? safe("rules", function () { return W.CBA.rules(state.year); }, null) : null });
    state.season.userTeam = state.userTeam;
    // after 2026: this save's style of play and season length (js/future.js)
    if (mod("FUTURE")) safe("futureSeason", function () { W.FUTURE.startSeason(state); });
    // keep saved rotations from season to season (players who left are dropped)
    state.season.lineups = state.season.lineups || {};
    for (var ab in state.teams) {
      var tm = state.teams[ab];
      if (!Array.isArray(tm.rotation) || !tm.rotation.length) continue;
      var ids = tm.rotation.filter(function (id) { var p = state.players[id]; return p && p.team === ab && !p.retired; });
      if (ids.length >= 5) state.season.lineups[ab] = { starters: ids.slice(0, 5), minutes: tm.minutes || null };
    }
    state.phase = "regular"; state.day = 0;
  }

  function news(state, headline, body, ids) {
    state.news.unshift({ year: state.year, day: state.day, headline: headline, body: body || "", ids: ids || [] });
    if (state.news.length > 300) state.news.length = 300;
  }
  function currentDate(state) {
    var s = state.season; if (!s || !s.days) return null;
    var d = s.days[Math.min(s.day || 0, s.days.length - 1)]; return d ? d.date : null;
  }

  // Real-world headlines already in the feed (date + headline). Older saves may hold duplicates: drop them.
  function worldSeen(state) {
    var seen = {};
    state.news = state.news.filter(function (n) {
      if (!n || !n.world) return true;
      var k = n.date + "|" + n.headline;
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
    return seen;
  }

  // ---------- in-season ----------
  // Team chemistry (0 to 100, team.chem): winning lately, continuity (how much of the rotation was on the
  // team on opening night) and the rotation's mood. It moves part of the way to its target after each
  // chunk of days; the engine turns it into a small edge (about -3 to +2.5 for every player).
  function chemClamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function chemParts(state, abbr) {
    var st = state.season && state.season.standings && state.season.standings[abbr], t = state.teams[abbr];
    var last = st && st.last10 && st.last10.length ? st.last10.reduce(function (a, b) { return a + b; }, 0) / st.last10.length : 0.5;
    var ps = state.season && state.season.playerStats || {};
    var rot = Object.keys(state.players).map(function (id) { return state.players[id]; })
      .filter(function (p) { return p.team === abbr && !p.retired; })
      .sort(function (a, b) { return ((ps[b.id] || {}).min || b.ovr / 10) - ((ps[a.id] || {}).min || a.ovr / 10); }).slice(0, 8);
    var open = (t && t.openRoster) || [];
    var cont = rot.length && open.length ? rot.filter(function (p) { return open.indexOf(p.id) >= 0; }).length / rot.length : 1;
    var mood = rot.length ? rot.reduce(function (a, p) { return a + (p.mood != null ? p.mood : 60); }, 0) / rot.length : 60;
    return { winning: Math.round((last - 0.5) * 50), continuity: Math.round((cont - 0.65) * 40), mood: Math.round((mood - 60) * 0.4) };
  }
  function updateChemistry(state, rate) {
    Object.keys(state.teams).forEach(function (a) {
      var t = state.teams[a], c = chemParts(state, a), cur = t.chem != null ? t.chem : 60, target = chemClamp(60 + c.winning + c.continuity + c.mood, 15, 98);
      t.chem = Math.round(chemClamp(cur + (target - cur) * (rate || 0.2), 10, 99));
      t.chemParts = c;
    });
  }
  function simChunk(state, days) {
    var E = mod("ENGINE"), rng = rngFor(state);
    var injBefore = clone(state.season.injuries || {});
    var res = E.simDays(state.season, days, rng, leagueView(state)) || {};
    state.day = state.season.day || state.day + days;
    // injuries to the user's players become events, and so do returns (see userInjuries below)
    var inj = state.season.injuries || {};
    for (var id in inj) if (!injBefore[id] && state.players[id] && state.players[id].team === state.userTeam && inj[id].games > 0) {
      var iev = injuryEvent(state, id, inj[id]);
      if (autoOn(state, "injuryAlerts")) state.events.push(iev);
      else { state.notices = state.notices || []; state.notices.push({ text: iev.text, ids: [id], year: state.year }); }   // GM Assistant: no stop
      news(state, state.players[id].name + " injured", inj[id].type + ", expected to miss about " + inj[id].games + " games.", [id]);
    }
    safe("injuryReturns", function () { injuryReturns(state, injBefore, inj); });
    if (state.realLife && mod("REALLIFE")) safe("realLife", function () { var nd = currentDate(state); if (nd) W.REALLIFE.applyUntil(state, state.season.phase === "done" ? nd : W.REALLIFE.dayBefore(nd)); });
    if (mod("COACH") && W.COACH.realSync) safe("coachReal", function () { var cd = currentDate(state); if (cd) W.COACH.realSync(state, cd); });
    if (mod("TRADE") && state.season.phase === "regular") {
      if (!state.realLife) safe("aiTrades", function () { W.TRADE.aiTrades(state, rng); });
      if (rng() < 0.08 * days) safe("aiOffers", function () { (W.TRADE.aiOffers(state, rng) || []).forEach(function (o) { state.events.push({ type: "tradeOffer", offer: o, quiet: !autoOn(state, "tradeOffers") }); }); });
    }
    if (mod("MOOD") && rng() < days / 30) safe("mood", function () { W.MOOD.update(state); });
    safe("chemistry", function () { updateChemistry(state, Math.min(0.5, 0.06 * days)); });
    if (mod("PROG") && rng() < days / 30) safe("inSeason", function () { W.PROG.inSeason(state, rng); });
    if (mod("GLEAGUE")) safe("gleague", function () { if (typeof W.GLEAGUE.sync === "function") W.GLEAGUE.sync(state, rng); else if (days >= 7) W.GLEAGUE.simWeek(state, rng); });
    // real-world headlines (elections, COVID, other sports) for the dates just simmed
    var now = currentDate(state);
    if (now && mod("NEWS") && W.NEWS.worldFor) safe("worldNews", function () {
      var from = state.lastNewsDate || "2012-10-01", seenW = worldSeen(state);
      (W.NEWS.worldFor(from, now) || []).forEach(function (ev) {
        if (state.lastNewsDate && ev.date <= state.lastNewsDate) return;   // the last simmed day was already covered
        var k = ev.date + "|" + ev.headline;
        if (seenW[k]) return;
        seenW[k] = true;
        state.news.unshift({ year: state.year, day: state.day, date: ev.date, headline: ev.headline, body: ev.body || "", ids: [], world: true });
      });
    });
    if (now) state.lastNewsDate = now;
    // in-season stories: player of the week, big games, streaks, milestones, injuries, rumors
    if (mod("NEWS") && W.NEWS.tick) safe("newsTick", function () { W.NEWS.tick(state); });
    // All-Star selections at the break, once a season
    if (now && state.allStarsYear !== state.year && now >= state.year + "-" + keyDate("allStar", state.year) && now < state.year + "-07-01" && mod("AWARDS") && W.AWARDS.allStars) {
      state.allStarsYear = state.year;
      safe("allStars", function () {
        var as = W.AWARDS.allStars(state);
        if (as && W.AWARDS.recordAllStars) W.AWARDS.recordAllStars(state, as);
        state.allStars = as || null;
        var mine = [];
        if (as) ["East", "West"].forEach(function (c) { if (as[c]) as[c].starters.concat(as[c].reserves).forEach(function (id) { if (state.players[id] && state.players[id].team === state.userTeam) mine.push(id); }); });
        news(state, "All-Stars named for " + state.year, mine.length ? mine.map(function (id) { return state.players[id].name; }).join(", ") + " made the team." : "", mine);
      });
    }
    return res;
  }

  // how: { days: n } | "tradeDeadline" | "allStar" | "endRegular" | "endPlayoffs" | "nextPhase"
  // opts (offseason only): { auto: true } lets the AI make the user's draft picks (the user confirmed simming past the draft)
  function advance(state, how, opts) {
    if (OFFSEASON.indexOf(state.phase) >= 0 || how === "nextPhase" && state.phase === "done") return nextPhase(state, opts);
    var target = typeof how === "object" ? how.days : null, guard = 0;
    while (guard++ < 400) {
      if (pendingEvents(state)) return { stopped: "event" };
      var before = state.season.phase;
      if (before === "done") { endSeason(state); return { stopped: "seasonOver" }; }
      if (how === "endRegular" && before !== "regular") return { stopped: "endRegular" };
      var date = currentDate(state);
      if (KEY_DATES[how] && date && date.slice(5) >= keyDate(how, state.year) && date.slice(5) < "07-01") return { stopped: how };
      simChunk(state, 1);
      if (target !== null && --target <= 0) return { stopped: "days" };
      if (how === "endPlayoffs" && state.season.phase === "done") { endSeason(state); return { stopped: "seasonOver" }; }
    }
    return { stopped: "limit" };
  }
  // quiet events (trade offers with the GM Assistant's popups off) wait in their tab and never stop the sim
  function pendingEvents(state) { return state.events.some(function (e) { return !e.resolved && !e.quiet; }); }
  // GM Assistant toggles (state.settings.auto, set on the settings page); a missing key is its default
  var AUTO_DEFAULTS = { rotation: true, roster: false, resign: true, draft: true, tradeOffers: true, injuryAlerts: true, confirmations: true };
  function autoOn(state, key) {
    var S = W.AUTO_SETTINGS, all = S && typeof S.get === "function" ? safe("autoSettings", function () { return S.get(state); }, null) : null;
    var a = all || (state.settings && state.settings.auto);
    return a && typeof a[key] === "boolean" ? a[key] : AUTO_DEFAULTS[key];
  }
  function resolveEvent(state, index, answer) {
    var e = state.events[index]; if (!e) return;
    e.resolved = true; e.answer = answer;
    if (e.type === "tradeOffer" && answer === "accept" && mod("TRADE")) safe("execute", function () { W.TRADE.execute(state, e.offer.trade || e.offer); });
    // roster popups (sign one, waive some, a free agent pitch) and contract decisions go to FA
    if (e.type === "roster" && mod("FA") && W.FA.resolveRosterEvent) e.result = safe("rosterEvent", function () { return W.FA.resolveRosterEvent(state, e, answer); }, null);
    if (e.type === "contractDecision" && mod("FA") && W.FA.applyDecision) e.result = safe("contractDecision", function () { return W.FA.applyDecision(state, e, answer); }, null);
    if (e.type === "injury" || e.type === "injuryReturn") safe("injuryAnswer", function () { injuryAnswer(state, e, answer); });
  }

  // ---------- injuries and the user's manual rotation ----------
  // A manual rotation is team.rotation (ids, the first five start) plus team.minutes; the engine reads
  // state.season.lineups[abbr] and never plays a hurt player (his minutes go to the others). When a
  // manual starter gets hurt, the best healthy player at his position takes his slot and minutes (they
  // swap, kept in team.injurySwaps); when he is back the user can swap them back. Auto rotations only
  // get a short notice (state.notices), since auto already puts him back.
  function isManual(t) { return !!(t && Array.isArray(t.rotation) && t.rotation.length >= 5); }
  function posGroup(pos) {
    var p = String(pos || "").toUpperCase().split(/[-\/ ]/)[0];
    return p === "PG" || p === "SG" || p === "G" ? "G" : p === "PF" || p === "C" || p === "FC" ? "B" : "W";
  }
  function syncLineup(state, abbr) {
    var t = state.teams[abbr];
    if (!state.season) return;
    state.season.lineups = state.season.lineups || {};
    state.season.lineups[abbr] = { starters: t.rotation.slice(0, 5), minutes: Object.assign({}, t.minutes || {}) };
  }
  function swapSlots(t, a, b) {
    var r = t.rotation, ia = r.indexOf(a), ib = r.indexOf(b);
    if (ia < 0) return;
    if (ib < 0) { r[ia] = b; r.push(a); } else { r[ia] = b; r[ib] = a; }
    t.minutes = t.minutes || {};
    var ma = t.minutes[a], mb = t.minutes[b];
    t.minutes[a] = mb != null ? mb : 0; t.minutes[b] = ma != null ? ma : 0;
  }
  function injuryName(type) {
    var t = String(type || "");
    if (!t || /^(injury|out for the season|recovering|playing overseas)/i.test(t)) return "injury";
    return "his " + (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
  }
  function injuryEvent(state, id, e) {
    var p = state.players[id], t = state.teams[state.userTeam], rep = null;
    // a minor injury he can play through: he stays in the lineup at a lower rating unless the user sits him
    if (e.hurt && e.games < 900 && t && t.playHurt !== false) {
      return { type: "injury", playerId: id, hurt: e.hurt, text: p.name + " has " + injuryName(e.type) + " (about " + e.games + (e.games === 1 ? " game" : " games") +
        "). He can play through it at " + e.hurt + " overall below his usual level, so he stays in the lineup.",
        options: [{ value: "ok", label: "Let him play" }, { value: "sit", label: "Sit him until he is healthy" }] };
    }
    var slot = isManual(t) ? t.rotation.indexOf(id) : -1;
    if (slot >= 0 && slot < 5) {
      var inj = state.season.injuries || {}, starters = t.rotation.slice(0, 5), out = t.inactive || [];
      var cands = leagueView(state).players.filter(function (q) {
        return q.team === state.userTeam && q.id !== id && starters.indexOf(q.id) < 0 && out.indexOf(q.id) < 0 && !(inj[q.id] && inj[q.id].games > 0);
      }).sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0); });
      rep = cands.filter(function (q) { return posGroup(q.pos) === posGroup(p.pos); })[0] || cands[0] || null;
      if (rep) {
        swapSlots(t, id, rep.id);
        t.injurySwaps = t.injurySwaps || {};
        t.injurySwaps[id] = { slot: slot, with: rep.id };
        syncLineup(state, state.userTeam);
      }
    }
    var text = p.name + " is out about " + e.games + (e.games === 1 ? " game" : " games") + " (" + injuryName(e.type).replace(/^his /, "") + ")." +
      (rep ? " " + rep.name + " takes his spot in the starting lineup." : "");
    var ev = { type: "injury", playerId: id, text: text, replacedBy: rep ? rep.id : null, options: [{ value: "ok", label: "OK" }] };
    if (isManual(t)) ev.options.push({ value: "rotation", label: "Open rotation" });
    return ev;
  }
  function injuryReturns(state, before, now) {
    var abbr = state.userTeam, t = state.teams[abbr];
    for (var id in before) {
      var p = state.players[id];
      if (!p || p.retired || p.team !== abbr || !(before[id].games > 0) || (now[id] && now[id].games > 0)) continue;
      var sw = t.injurySwaps && t.injurySwaps[id];
      var back = p.name + " is back from " + injuryName(before[id].type) + ".";
      if (isManual(t) && sw && t.rotation.indexOf(id) >= 5 && !autoOn(state, "injuryAlerts")) {
        // no popups wanted: he goes straight back into his starting spot
        var ev0 = { type: "injuryReturn", playerId: id };
        injuryAnswer(state, ev0, "restore");
        state.notices = state.notices || [];
        state.notices.push({ text: back + " He is back in the starting lineup.", ids: [id], year: state.year });
      } else if (isManual(t) && sw && t.rotation.indexOf(id) >= 5) {
        // until the user answers he plays bench minutes (his stand-in may have had none)
        t.minutes = t.minutes || {};
        if (!(t.minutes[id] > 0)) { t.minutes[id] = 12; syncLineup(state, abbr); }
        state.events.push({ type: "injuryReturn", playerId: id, text: back + " Adjust the lineup?",
          options: [{ value: "restore", label: "Put him back in the starting lineup" }, { value: "keep", label: "Keep the current lineup" }, { value: "rotation", label: "Open rotation" }] });
      } else {
        if (sw) delete t.injurySwaps[id];
        state.notices = state.notices || [];
        state.notices.push({ text: back + (isManual(t) ? "" : " Your coach put him back in the rotation."), ids: [id], year: state.year });
      }
    }
  }
  function injuryAnswer(state, e, answer) {
    var t = state.teams[state.userTeam], id = e.playerId;
    if (answer === "rotation") e.navigate = "#/manage";
    if (answer === "sit" && state.season && state.season.injuries && state.season.injuries[id]) { delete state.season.injuries[id].hurt; return; }   // out until healthy
    if (e.type !== "injuryReturn" || !t || !t.injurySwaps || !t.injurySwaps[id]) return;
    var sw = t.injurySwaps[id];
    delete t.injurySwaps[id];
    if (answer !== "restore" || !isManual(t) || state.players[id].team !== state.userTeam) return;
    var occ = t.rotation[sw.slot];
    if (occ && occ !== id && t.rotation.indexOf(id) >= 0) { swapSlots(t, occ, id); syncLineup(state, state.userTeam); }
  }
  function clearResolved(state) { state.events = state.events.filter(function (e) { return !e.resolved; }); }

  // ---------- season end and offseason ----------
  function endSeason(state) {
    if (state.phase !== "regular" && state.phase !== "playoffs") return;
    var awards = mod("AWARDS") ? safe("awards", function () { return W.AWARDS.season(state); }, null) : null;
    var champ = state.season.playoffs && (state.season.playoffs.champion || null);
    // Finals MVP: the engine picks it from the Finals box scores; AWARDS.finalsMvp is the fallback
    var fm = state.season.playoffs && state.season.playoffs.finalsMvp || null;
    if (fm && typeof fm === "object") fm = fm.id || null;
    if (!fm && champ && mod("AWARDS") && W.AWARDS.finalsMvp) {
      var boxes = Object.keys(state.season.boxScores || {}).map(function (k) { return state.season.boxScores[k]; })
        .filter(function (b) { return b && b.playoff && b.home && typeof b.home === "object"; });
      var fr = safe("finalsMvp", function () { return W.AWARDS.finalsMvp(state, boxes, champ); }, null);
      fm = fr && fr.id || null;
    }
    if (awards) awards.finalsMvp = fm;
    // awards go onto the players (player.awards) once per season
    if (awards && mod("AWARDS") && W.AWARDS.record && state.awardsRecorded !== state.year) {
      safe("recordAwards", function () { W.AWARDS.record(state, awards); });
      state.awardsRecorded = state.year;
    }
    // career stats
    var ps = state.season.playerStats || {};
    for (var id in ps) if (state.players[id]) state.players[id].careerStats.push(Object.assign({ year: state.year, team: state.players[id].team }, ps[id]));
    // single-game highs, league records and playoff totals for the records pages (js/records.js)
    if (mod("RECORDS")) safe("records", function () { W.RECORDS.archive(state); });
    state.history.seasons.push({ year: state.year, champion: champ, finalsMvp: fm, awards: awards, allStars: state.allStars && state.allStars.year === state.year ? state.allStars : null, standings: clone(state.season.standings) });
    if (champ) news(state, (state.teams[champ] ? state.teams[champ].city + " " + state.teams[champ].name : champ) + " win the " + state.year + " title", "", []);
    // coaching changes are cosmetic (names and records only)
    if (mod("COACH") && W.COACH.aiChanges) { var crng = rngFor(state); safe("coachChanges", function () { W.COACH.aiChanges(state, crng); }); }
    if (mod("PROG") && W.PROG.fateNews) safe("fateNews", function () { (W.PROG.fateNews(state, state.year) || []).forEach(function (n) { news(state, n.headline, n.body, n.ids); }); });
    // after the real data: rule changes and expansion announced this summer (js/future.js)
    if (mod("FUTURE")) safe("future", function () { W.FUTURE.summer(state); });
    state.phase = "draftLottery";
  }

  // Team options and qualifying offers are decided on the free agency page during re-signing; their
  // defaults stand otherwise. They go to the news feed instead of stopping the sim as decisions.
  function quietOffseasonDecisions(state) {
    var notes = [];
    state.events = (state.events || []).filter(function (e) {
      if (e && e.type === "contractDecision" && (e.kind === "teamOption" || e.kind === "qualifyingOffer")) { if (e.text) notes.push(e.text.replace(/ Use FA\.\w+ to change it before free agency\./, "")); return false; }
      return true;
    });
    if (notes.length) news(state, "Contract decisions for your team", notes.join(" ") + " Change them on the Free Agency page before free agency opens.", []);
  }

  // AI to AI trades during the offseason (TRADE.aiTrades knows the rate for each phase)
  function offseasonTrades(state, rng, days) {
    if (!mod("TRADE") || typeof W.TRADE.aiTrades !== "function" || state.realLife) return;   // real-life mode: the real trades instead
    safe("aiTrades", function () { W.TRADE.aiTrades(state, rng, { days: days || 1 }); });
  }

  // The user's picks still to make in this year's draft (slots from DRAFT.order).
  function userPicksLeft(state) {
    var d = state.draft;
    if (!d || !Array.isArray(d.order) || d.done || +d.year !== +state.year) return [];
    return d.order.filter(function (s, k) { return k >= (d.index || 0) && !s.player && s.team === state.userTeam; });
  }

  // Roster limits for the season about to start: 13 to 15 standard contracts, plus two-way
  // slots from 2017-18 on. Stashed players (still overseas) never count.
  function rosterRules(year) {
    var r = mod("CBA") ? safe("rules", function () { return W.CBA.rules(year); }, null) : null;
    return { min: (r && r.rosterMin) || 13, max: (r && r.rosterMax) || 15,
      twoWay: r ? !!r.twoWay : year >= 2018, slots: r && typeof r.twoWaySlots === "number" ? r.twoWaySlots : (year >= 2024 ? 3 : year >= 2018 ? 2 : 0) };
  }
  function isStashedFor(p, year) { return !!(p && p.stashedUntil != null && +p.stashedUntil > year); }
  function rosterOf(state, abbr, year) {
    var std = [], two = [];
    for (var id in state.players) {
      var p = state.players[id];
      if (!p || p.retired || p.team !== abbr || isStashedFor(p, year)) continue;
      (p.contract && p.contract.twoWay ? two : std).push(p);
    }
    return { std: std, two: two };
  }
  function minSalaryFor(p, year) {
    var r = mod("CBA") ? safe("rules", function () { return W.CBA.rules(year); }, null) : null;
    var v = r && typeof r.minSalary === "function" ? safe("minSalary", function () { return r.minSalary(p.yearsPro || 0); }, 0) : 0;
    return v > 0 ? Math.round(v) : Math.round(1000000 * Math.pow(1.045, Math.max(0, year - 2013)));
  }
  function releasePlayer(state, abbr, p, why) {
    var F = mod("FA");
    var done = F && typeof F.release === "function" ? safe("release", function () { return W.FA.release(state, abbr, p.id); }, null) : null;
    if (!done || done.ok === false || p.team === abbr) { p.team = "FA"; p.contract = null; p.lastTeam = abbr; }
    state.transactions.push({ year: state.year, day: state.day, type: "release", text: (state.teams[abbr] ? state.teams[abbr].name : abbr) + " waive " + p.name + " (" + why + ").", ids: [p.id] });
  }
  function enforceRosters(state) {
    var year = state.year, rules = rosterRules(year), fixes = [];
    var cut = function (list, keepN, why, abbr) {
      list.sort(function (a, b) { return (a.ovr || 0) - (b.ovr || 0) || (b.age || 0) - (a.age || 0); });
      while (list.length > keepN) { var p = list.shift(); releasePlayer(state, abbr, p, why); fixes.push({ team: abbr, out: p.id }); }
    };
    for (var abbr in state.teams) {
      var ro = rosterOf(state, abbr, year);
      if (ro.std.length > rules.max) cut(ro.std, rules.max, "roster limit " + rules.max, abbr);
      if (!rules.twoWay) ro.two.forEach(function (p) { p.contract.twoWay = false; });
      else if (ro.two.length > rules.slots) cut(ro.two, rules.slots, "two-way limit " + rules.slots, abbr);
      ro = rosterOf(state, abbr, year);
      var need = rules.min - ro.std.length;
      if (need > 0) {
        var pool = [];
        for (var id in state.players) { var q = state.players[id]; if (q && !q.retired && q.team === "FA" && !isStashedFor(q, year)) pool.push(q); }
        pool.sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0); });
        pool.slice(0, need).forEach(function (q) {
          var amt = minSalaryFor(q, year);
          q.team = abbr; q.yearsWithTeam = 0;
          q.contract = { salaries: [{ year: year, amount: amt }], option: null, rookie: false, twoWay: false, signedYear: year, via: "min" };
          state.transactions.push({ year: year, day: state.day, type: "sign", text: (state.teams[abbr] ? state.teams[abbr].name : abbr) + " sign " + q.name + " to a one-year minimum deal to reach " + rules.min + " players.", ids: [q.id] });
          fixes.push({ team: abbr, in: q.id });
        });
      }
    }
    return fixes;
  }

  // One step of the offseason. opts.auto: the user confirmed simming past this step (the AI
  // makes his draft picks). Without it the draft stops on each of the user's picks.
  function nextPhase(state, opts) {
    opts = opts || {};
    var rng = rngFor(state), i = OFFSEASON.indexOf(state.phase);
    var phase = state.phase;
    if (phase === "draftLottery") {
      if (mod("DRAFT")) safe("lottery", function () { W.DRAFT.lottery(state, rng); if (W.DRAFT.startDraft) W.DRAFT.startDraft(state, state.year); });
      // this summer's Hall of Fame class (retired four full seasons or more)
      if (mod("AWARDS") && W.AWARDS.hallOfFame && state.hofYear !== state.year) {
        state.hofYear = state.year;
        safe("hallOfFame", function () {
          (W.AWARDS.hallOfFame(state, state.year) || []).forEach(function (x) { news(state, x.name + " Elected To The Hall Of Fame", x.name + " headlines the " + state.year + " Hall of Fame class.", [x.id]); });
        });
      }
      state.phase = "draft";
    } else if (phase === "draft") {
      var D = mod("DRAFT");
      if (D) {
        var stop = safe("draft", function () {
          if (D.startDraft) D.startDraft(state, state.year);
          var guard = 0;
          while (D.current && D.current(state) && guard++ < 200) {
            var cur = D.current(state);
            if (cur.team === state.userTeam && !opts.auto) { state.draft.userOnClock = cur.overall; return cur; }
            var r = D.aiPick(state, cur.team);
            if (!r || r.ok === false) break;
          }
          if (state.draft) state.draft.userOnClock = null;
          if (opts.auto && state.draft && Array.isArray(state.draft.order) && mod("FA") && W.FA.userLog) state.draft.order.forEach(function (sl) {
            var dp = sl.player && state.players[sl.player];
            if (sl.team === state.userTeam && dp && !sl.logged) { sl.logged = true; W.FA.userLog(state, "Drafted " + dp.name + " (" + dp.pos + ") with pick " + sl.overall, [dp.id]); }
          });
          D.signRookies(state);
          return null;
        }, null);
        if (stop) return { phase: "draft", step: i, stopped: "userPick", pick: stop.overall };
      }
      // players who sat out their first season hurt, not overseas
      var REDSHIRT = { noelne01: 1, embiijo01: 1, simmobe01: 1, portemi01: 1, gilesha01: 1 };
      for (var rid in REDSHIRT) { var rp = state.players[rid]; if (rp && rp.injury && rp.injury.type === "Playing overseas") rp.injury.type = "Recovering from injury (redshirt season)"; }
      offseasonTrades(state, rng, 1);
      state.phase = "resign";
      // contracts expire and the re-signing window opens now, so the user can re-sign in this phase
      if (mod("FA")) safe("startOffseason", function () { W.FA.startOffseason(state); });
      quietOffseasonDecisions(state);
      // an expansion announced earlier happens now, right after the draft (js/expansion.js)
      if (mod("EXPANSION")) safe("expansion", function () { W.EXPANSION.applyPending(state); });
      // a league that opened in 2003-04: the Bobcats join after the 2004 draft
      if (mod("EXPANSION") && W.EXPANSION.applyHistoric && state.startYear && state.startYear <= 2004 && state.year === 2004 && !state.teams.CHA)
        safe("bobcats", function () { W.EXPANSION.applyHistoric(state, "bobcats"); });
    } else if (phase === "resign") {
      // real-life mode: the summer's real trades and signings before the AI's free agency
      if (state.realLife && mod("REALLIFE")) safe("realLife", function () { W.REALLIFE.applyUntil(state, state.year + "-09-30"); });
      if (mod("FA")) {
        safe("startOffseason", function () { W.FA.startOffseason(state); });
        quietOffseasonDecisions(state);
        // simming past re-signing: the user's players worth keeping are re-signed, not lost
        if (typeof W.FA.autoResign === "function") safe("autoResign", function () { W.FA.autoResign(state, state.userTeam); });
      }
      offseasonTrades(state, rng, 2);
      state.phase = "freeAgency"; state.faDay = 0;
    } else if (phase === "freeAgency") {
      // the user's decisions (good free agents, a short or long roster, offer sheets) stop the sim; the
      // next call carries on. opts.auto: he chose to sim past free agency, the front office decides.
      if (mod("FA") && W.FA.setSimMode && (opts.auto || !state.fa || !state.fa.simMode)) safe("simMode", function () { W.FA.setSimMode(state, opts.auto ? "auto" : "ask"); });
      if (mod("FA")) for (var d = 0; d < 60; d++) {
        if (d >= 30 && (!state.fa || state.fa.stage === "done")) break;
        var day = safe("faDay", function () { return W.FA.simDay(state, rng); }, null);
        if (day && day.waiting) return finishStep(state, { phase: state.phase, step: i, stopped: "event" });
        if (d % 6 === 5) offseasonTrades(state, rng, 1);
      }
      // offseason progression, before training camp; the before and after numbers go to state.progressReport
      if (mod("PROG")) safe("progression", function () { W.PROG.offseason(state, rng); });
      if (state.progressReport) { state.progressReport.team = state.userTeam; state.progressReport.seen = false; }
      state.phase = "training";
    } else if (phase === "training") {
      // the user's roster must be 13 to 15 before the season: he is asked (or the AI fixes it when he simmed past free agency)
      if (mod("FA") && W.FA.preseasonCheck && safe("preseasonCheck", function () { return W.FA.preseasonCheck(state, opts); }, false))
        return finishStep(state, { phase: state.phase, step: i, stopped: "event" });
      if (mod("PROG")) safe("progression", function () { W.PROG.offseason(state, rng); }); // no-op if it already ran
      offseasonTrades(state, rng, 1);
      if (mod("COACH") && W.COACH.offseason) safe("coaches", function () { W.COACH.offseason(state, rng); });
      state.year += 1;
      for (var id in state.players) {
        var p = state.players[id];
        if (p.stashedUntil && p.stashedUntil <= state.year) { p.stashedUntil = null; if (p.injury && p.injury.type === "Playing overseas") p.injury = null; }
      }
      enforceRosters(state);
      // a new season: last season's notices and unanswered quiet trade offers do not carry over
      state.notices = [];
      state.events = state.events.filter(function (e) { return !(e && e.quiet && e.type === "tradeOffer"); });
      startSeason(state);
      if (mod("COACH") && W.COACH.realSync) safe("coachReal", function () { W.COACH.realSync(state, null); });
      if (state.realLife && mod("REALLIFE") && state.season && state.season.days[0]) safe("realLife", function () { W.REALLIFE.applyUntil(state, W.REALLIFE.dayBefore(state.season.days[0].date)); });
      news(state, "The " + (state.year - 1) + "-" + String(state.year).slice(2) + " season begins", "", []);
    }
    return finishStep(state, { phase: state.phase, step: i });
  }
  // what the AI did for the user in this step goes into one "While you simmed" popup
  function finishStep(state, out) {
    if (mod("FA") && W.FA.flushSummary) safe("summary", function () { W.FA.flushSummary(state); });
    return out;
  }

  // Brings a loaded save up to date: current logos and names, world news without duplicates,
  // coaches without stored ratings (coaches are cosmetic). Safe to call on every load.
  // Ratings from later 2K games on the 2K13 scale (js/progression.js scaleRating), by the season
  // the rating is from. Once per player (p.scaled).
  function scaleProspect(p, year) {
    var P = mod("PROG") ? W.PROG : null;
    if (!p || p.scaled || !P || !P.scaleRating || !(year > 2013)) return;
    var o = Math.round(P.scaleRating(year, p.ovr)), pt = p.pot != null ? Math.round(P.scaleRating(year, p.pot)) : null;
    if (P.setOvr && p.attrs) P.setOvr(p, o, { keepPot: true });
    p.ovr = o; if (pt != null) p.pot = Math.max(o, pt);
    p.scaled = true;
    // undrafted rookies come in below the first round (their real rating was earned later)
    if (p.undrafted && p.team === "DRAFT" && p.ovr > UNDRAFTED_MAX) { if (P.setOvr && p.attrs) P.setOvr(p, UNDRAFTED_MAX, { keepPot: true }); p.ovr = UNDRAFTED_MAX; }
  }
  var UNDRAFTED_MAX = 70;
  function migrate(state) {
    if (!state || !state.teams) return state;
    // the past this save started from (another start year swaps the career, awards and history tables)
    useStart(state.startYear || 2013);
    // saves from before the 2K13 rating scale: every rating once onto it (players by the current
    // season, prospects by their arrival season)
    // saves from the first 2K13 scale: classes not drafted yet are rated again from the real data,
    // by rank in the class (Randle and Stauskas were in the 50s)
    if (state.ratingScale === 1 && W.DRAFTS && mod("DRAFT") && W.DRAFT.rookieScale) safe("migrate rookie scale", function () {
      Object.keys(W.DRAFTS).forEach(function (yr) {
        var cls = [];
        W.DRAFTS[yr].forEach(function (pr) {
          var p = state.players[pr.id];
          if (!p || p.team !== "DRAFT" || pr.rights) return;
          var o = p.ovr;
          p.ovr = pr.ovr; p.pot = pr.pot; p.scaled = false;
          if (p.attrs && mod("PROG") && W.PROG.setOvr) { p.ovr = o; W.PROG.setOvr(p, pr.ovr, { keepPot: true }); p.ovr = pr.ovr; }
          cls.push(p);
        });
        if (cls.length) W.DRAFT.rookieScale(cls, +yr);
      });
      state.ratingScale = 2;
    });
    if (!state.ratingScale) safe("migrate rating scale", function () {
      for (var id in state.players) {
        var p = state.players[id];
        if (!p || p.scaled) continue;
        if (p.team === "DRAFT") scaleProspect(p, Math.max((+p.draftYear || state.year) + 1, +p.arrivalYear || 0));
        else if (!p.retired && state.year > 2013) scaleProspect(p, state.year);
      }
      state.ratingScale = 2;
    });
    state.news = state.news || []; state.events = state.events || []; state.transactions = state.transactions || [];
    safe("migrate brands", function () { applyBrands(state); });
    safe("migrate news", function () { worldSeen(state); });
    if (mod("FUTURE")) safe("migrate future", function () { W.FUTURE.activate(state); });
    // triple-doubles from before box scores counted them: one recount of the season in progress from every
    // full box score still kept (all of the user's games and the latest 120 around the league)
    if (state.season && !state.season.tdCounted) safe("migrate triple-doubles", function () {
      var s = state.season, reg = {}, po = {};
      Object.keys(s.boxScores || {}).forEach(function (gid) {
        var b = s.boxScores[gid];
        if (!b || !b.home || typeof b.home !== "object" || b.playIn) return;
        var m = b.playoff ? po : reg;
        ["home", "away"].forEach(function (side) {
          (b[side].box || []).forEach(function (r) {
            var td = r.td || ([r.pts, (r.oreb || 0) + (r.dreb || 0), r.ast, r.stl, r.blk].filter(function (x) { return x >= 10; }).length >= 3 ? 1 : 0);
            if (td) m[r.id] = (m[r.id] || 0) + 1;
          });
        });
      });
      [[s.playerStats, reg], [s.playoffStats, po]].forEach(function (pr) {
        var map = pr[0] || {};
        Object.keys(pr[1]).forEach(function (id) { if (map[id] && (map[id].td || 0) < pr[1][id]) map[id].td = pr[1][id]; });
      });
      s.tdCounted = true;
    });
    if (state.coaches) for (var k in state.coaches) if (state.coaches[k]) delete state.coaches[k].ovr;
    return state;
  }

  var API = { KEY_DATES: KEY_DATES, newLeague: newLeague, summerStart: summerStart, chemParts: chemParts, advance: advance, nextPhase: nextPhase, leagueView: leagueView, resolveEvent: resolveEvent,
    clearResolved: clearResolved, currentDate: currentDate, useStart: useStart, startData: startData, pendingEvents: pendingEvents, OFFSEASON: OFFSEASON,
    userPicksLeft: userPicksLeft, handlesContractDecisions: true, autoOn: autoOn, applyBrands: applyBrands, migrate: migrate, rosterRules: rosterRules, rosterOf: rosterOf, enforceRosters: enforceRosters, assignPicks: assignPicks };
  W.LEAGUE = API;
  if (typeof module !== "undefined") module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
