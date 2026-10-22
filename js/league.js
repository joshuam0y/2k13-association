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

  var KEY_DATES = { tradeDeadline: "02-21", allStar: "02-17" };
  var OFFSEASON = ["draftLottery", "draft", "resign", "freeAgency", "training"];

  // ---------- building a new league ----------
  function contractFor(p, year) {
    var end = Math.max(year, p.contractEnd || year), salaries = [];
    for (var y = year; y <= end; y++) salaries.push({ year: y, amount: Math.round((p.salary || 0) * Math.pow(1.045, y - year)) });
    var rookie = (p.age || 30) <= 24 && end - year <= 3 && (p.salary || 0) < 6000000;
    return { salaries: salaries, option: null, rookie: rookie, twoWay: false, signedYear: year - 1 };
  }
  function personalityFor(id, rng) {
    var real = W.PERSONALITIES && W.PERSONALITIES[id];
    if (real) return clone(real);
    var r = function () { return Math.round(20 + rng() * 60); };
    return { loyalty: r(), winning: r(), money: r(), market: r(), ego: r() };
  }
  function newLeague(userTeam, opts) {
    opts = opts || {};
    var base = W.LEAGUE_2012;
    if (!base) throw new Error("League data not loaded");
    var seed = opts.seed || Math.floor(Math.random() * 2147483646) + 1;
    var rng = mulberry32(seed);
    var state = { version: 1, year: base.season, phase: "regular", userTeam: userTeam, day: 0, rngSeed: seed,
      players: {}, teams: {}, season: null, history: { seasons: [], prior: W.HISTORY_PRIOR || null },
      transactions: [], news: [], events: [], settings: { difficulty: "normal" } };
    base.players.forEach(function (p0) {
      var p = clone(p0);
      p.contract = p.team === "FA" ? null : contractFor(p0, state.year);
      p.yearsPro = Math.max(0, (p.age || 22) - 21);
      p.yearsWithTeam = p.contract && p.contract.rookie ? Math.min(p.yearsPro, 3) : 2;
      p.draft = null; p.personality = personalityFor(p.id, rng); p.mood = 60;
      p.stashedUntil = null; p.gleague = false; p.careerStats = []; p.awards = []; p.retired = false; p.hof = false;
      // potential = the real career peak from the history targets, when known
      var tg = W.TARGETS && W.TARGETS[p.id];
      if (tg) { var peak = p.ovr; for (var ty in tg) if (ty !== "retire" && typeof tg[ty] === "number") peak = Math.max(peak, tg[ty]); p.pot = Math.min(99, peak); }
      state.players[p.id] = p;
    });
    if (W.DRAFTS) Object.keys(W.DRAFTS).forEach(function (yr) {
      W.DRAFTS[yr].forEach(function (pr) {
        if (state.players[pr.id]) return;
        var p = clone(pr); p.team = "DRAFT"; p.contract = null; p.yearsPro = 0; p.yearsWithTeam = 0;
        p.personality = personalityFor(p.id, rng); p.mood = 60; p.careerStats = []; p.awards = []; p.retired = false;
        state.players[p.id] = p;
      });
    });
    base.teams.forEach(function (t0) {
      var t = clone(t0), picks = [];
      for (var y = state.year; y <= state.year + 6; y++) for (var rd = 1; rd <= 2; rd++) picks.push({ year: y, round: rd, original: t.abbr, protection: null });
      t.picks = picks; t.direction = "neutral"; t.strategy = { pace: 50, three: 50, defense: "man", crash: 50 };
      t.rotation = null; t.budget = { coaching: 50, facilities: 50, health: 50, scouting: 50 };
      t.finances = { revenue: 0, expenses: 0, ticketPrice: 50 };
      t.coach = W.COACHES && W.COACHES.start2013 ? (W.COACHES.start2013[t.abbr] || null) : null;
      state.teams[t.abbr] = t;
    });
    startSeason(state);
    news(state, "Welcome to the " + (state.year - 1) + "-" + String(state.year).slice(2) + " season",
      "You are now running the " + state.teams[userTeam].city + " " + state.teams[userTeam].name + ".", []);
    return state;
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
  var REBRANDS = { NOH: [[2014, "New Orleans", "Pelicans"]], CHA: [[2015, "Charlotte", "Hornets"]] };
  function applyBrands(state) {
    for (var abbr in state.teams) {
      var t = state.teams[abbr];
      (REBRANDS[abbr] || []).forEach(function (r) {
        if (state.year >= r[0] && t.name !== r[2]) { t.city = r[1]; t.name = r[2]; news(state, "The " + r[1] + " franchise is now the " + r[1] + " " + r[2], "New name, colors and logo for the " + (state.year - 1) + "-" + String(state.year).slice(2) + " season.", []); }
      });
      var list = W.LOGOS && W.LOGOS[abbr], best = null;
      if (list) list.forEach(function (e) { if (e.verified !== false && e.from <= state.year && (!best || e.from >= best.from)) best = e; });
      if (best) { t.logo = best.url; t.logoNoRef = !!best.noReferrer; }
    }
  }
  function startSeason(state) {
    applyBrands(state);
    var E = mod("ENGINE");
    if (!E) throw new Error("Game engine not loaded");
    state.season = E.newSeason(leagueView(state), { year: state.year, userTeam: state.userTeam,
      rules: mod("CBA") ? safe("rules", function () { return W.CBA.rules(state.year); }, null) : null });
    state.season.userTeam = state.userTeam;
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

  // ---------- in-season ----------
  function simChunk(state, days) {
    var E = mod("ENGINE"), rng = rngFor(state);
    var injBefore = clone(state.season.injuries || {});
    var res = E.simDays(state.season, days, rng, leagueView(state)) || {};
    state.day = state.season.day || state.day + days;
    // injuries to the user's players become events
    var inj = state.season.injuries || {};
    for (var id in inj) if (!injBefore[id] && state.players[id] && state.players[id].team === state.userTeam && inj[id].games > 0) {
      state.events.push({ type: "injury", playerId: id, text: state.players[id].name + ": " + inj[id].type + ", out about " + inj[id].games + " games" });
      news(state, state.players[id].name + " injured", inj[id].type + ", expected to miss about " + inj[id].games + " games.", [id]);
    }
    if (mod("TRADE") && state.season.phase === "regular") {
      safe("aiTrades", function () { W.TRADE.aiTrades(state, rng); });
      if (rng() < 0.08 * days) safe("aiOffers", function () { (W.TRADE.aiOffers(state, rng) || []).forEach(function (o) { state.events.push({ type: "tradeOffer", offer: o }); }); });
    }
    if (mod("MOOD") && rng() < days / 30) safe("mood", function () { W.MOOD.update(state); });
    if (mod("PROG") && rng() < days / 30) safe("inSeason", function () { W.PROG.inSeason(state, rng); });
    if (mod("GLEAGUE") && days >= 7) safe("gleague", function () { W.GLEAGUE.simWeek(state, rng); });
    // real-world headlines (elections, COVID, other sports) for the dates just simmed
    var now = currentDate(state);
    if (now && mod("NEWS") && W.NEWS.worldFor) safe("worldNews", function () {
      (W.NEWS.worldFor(state.lastNewsDate || "2012-10-01", now) || []).forEach(function (ev) {
        state.news.unshift({ year: state.year, day: state.day, date: ev.date, headline: ev.headline, body: ev.body || "", ids: [], world: true });
      });
    });
    if (now) state.lastNewsDate = now;
    return res;
  }

  // how: { days: n } | "tradeDeadline" | "allStar" | "endRegular" | "endPlayoffs" | "nextPhase"
  function advance(state, how) {
    if (OFFSEASON.indexOf(state.phase) >= 0 || how === "nextPhase" && state.phase === "done") return nextPhase(state);
    var target = typeof how === "object" ? how.days : null, guard = 0;
    while (guard++ < 400) {
      if (pendingEvents(state)) return { stopped: "event" };
      var before = state.season.phase;
      if (before === "done") { endSeason(state); return { stopped: "seasonOver" }; }
      if (how === "endRegular" && before !== "regular") return { stopped: "endRegular" };
      var date = currentDate(state);
      if (KEY_DATES[how] && date && date.slice(5) >= KEY_DATES[how] && date.slice(5) < "07-01") return { stopped: how };
      simChunk(state, 1);
      if (target !== null && --target <= 0) return { stopped: "days" };
      if (how === "endPlayoffs" && state.season.phase === "done") { endSeason(state); return { stopped: "seasonOver" }; }
    }
    return { stopped: "limit" };
  }
  function pendingEvents(state) { return state.events.some(function (e) { return !e.resolved; }); }
  function resolveEvent(state, index, answer) {
    var e = state.events[index]; if (!e) return;
    e.resolved = true; e.answer = answer;
    if (e.type === "tradeOffer" && answer === "accept" && mod("TRADE")) safe("execute", function () { W.TRADE.execute(state, e.offer.trade || e.offer); });
  }
  function clearResolved(state) { state.events = state.events.filter(function (e) { return !e.resolved; }); }

  // ---------- season end and offseason ----------
  function endSeason(state) {
    if (state.phase !== "regular" && state.phase !== "playoffs") return;
    var awards = mod("AWARDS") ? safe("awards", function () { return W.AWARDS.season(state); }, null) : null;
    var champ = state.season.playoffs && (state.season.playoffs.champion || null);
    // career stats
    var ps = state.season.playerStats || {};
    for (var id in ps) if (state.players[id]) state.players[id].careerStats.push(Object.assign({ year: state.year, team: state.players[id].team }, ps[id]));
    state.history.seasons.push({ year: state.year, champion: champ, awards: awards, standings: clone(state.season.standings) });
    if (champ) news(state, (state.teams[champ] ? state.teams[champ].city + " " + state.teams[champ].name : champ) + " win the " + state.year + " title", "", []);
    state.phase = "draftLottery";
  }
  function nextPhase(state) {
    var rng = rngFor(state), i = OFFSEASON.indexOf(state.phase);
    var phase = state.phase;
    if (phase === "draftLottery") {
      if (mod("DRAFT")) safe("lottery", function () { W.DRAFT.lottery(state, rng); });
      state.phase = "draft";
    } else if (phase === "draft") {
      if (mod("DRAFT")) safe("draft", function () {
        var order = W.DRAFT.order(state, state.year);
        (order || []).forEach(function (slot) { if (slot.team !== state.userTeam || slot.auto) W.DRAFT.aiPick(state, slot.team, slot); });
        W.DRAFT.signRookies(state);
      });
      // players who sat out their first season hurt, not overseas
      var REDSHIRT = { noelne01: 1, embiijo01: 1, simmobe01: 1, portemi01: 1, gilesha01: 1 };
      for (var rid in REDSHIRT) { var rp = state.players[rid]; if (rp && rp.injury && rp.injury.type === "Playing overseas") rp.injury.type = "Recovering from injury (redshirt season)"; }
      state.phase = "resign";
    } else if (phase === "resign") {
      if (mod("FA")) safe("startOffseason", function () { W.FA.startOffseason(state); });
      state.phase = "freeAgency"; state.faDay = 0;
    } else if (phase === "freeAgency") {
      if (mod("FA")) for (var d = 0; d < 30; d++) safe("faDay", function () { W.FA.simDay(state, rng); });
      state.phase = "training";
    } else if (phase === "training") {
      if (mod("PROG")) safe("progression", function () { W.PROG.offseason(state, rng); });
      state.year += 1;
      for (var id in state.players) {
        var p = state.players[id];
        if (p.stashedUntil && p.stashedUntil <= state.year) { p.stashedUntil = null; if (p.injury && p.injury.type === "Playing overseas") p.injury = null; }
      }
      startSeason(state);
      news(state, "The " + (state.year - 1) + "-" + String(state.year).slice(2) + " season begins", "", []);
    }
    return { phase: state.phase, step: i };
  }

  var API = { newLeague: newLeague, advance: advance, nextPhase: nextPhase, leagueView: leagueView, resolveEvent: resolveEvent,
    clearResolved: clearResolved, currentDate: currentDate, pendingEvents: pendingEvents, OFFSEASON: OFFSEASON };
  W.LEAGUE = API;
  if (typeof module !== "undefined") module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
