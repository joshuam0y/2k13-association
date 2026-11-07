// Associations that open in another season (js/league.js opts.start, data/start-YYYY.js): node tools/test-start.js
// Opening-night rosters, contracts, picks and the past for that season; the 2012-13 tables come back for a
// 2012-13 save; a full season and offseason play.
const fs = require("fs");
global.window = global;
console.warn = () => {};
["data/league2012.js", "data/start-2017.js", "data/drafts.js", "data/draft-prior.js", "data/targets.js", "data/cap-history.js", "data/coaches.js",
  "data/coach-history.js", "data/history.js", "data/personalities.js", "data/career-prior.js", "data/alltime-prior.js", "data/picks-2012.js",
  "data/awards-prior.js", "data/schedules.js", "data/tendencies.js", "data/tendency-history.js", "data/defense-history.js", "data/logos.js",
  "js/engine.js", "js/cba.js", "js/future.js", "js/trade.js", "js/freeagency.js", "js/mood.js", "js/draft.js", "js/draft-gen.js", "js/rookies.js",
  "js/progression.js", "js/coaches.js", "js/awards.js", "js/news.js", "js/league.js", "js/expansion.js", "js/positions.js"].forEach(f => { if (fs.existsSync(f)) require("../" + f); });
const L = window.LEAGUE;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok  ", m); } else { fail++; console.log("  FAIL", m); } };

[2017].forEach(Y => {
  const D = window.START_LEAGUES && window.START_LEAGUES[Y];
  ok(!!D, Y + " start data loaded");
  if (!D) return;
  const s = L.newLeague("GSW", { seed: 5, start: Y });
  const on = a => Object.values(s.players).filter(p => p.team === a && !p.retired && !(p.stashedUntil > s.year));
  ok(s.year === Y && s.startYear === Y && s.season.year === Y, "the league opens in " + D.label);
  ok(Object.keys(s.teams).length === 30 && Object.keys(s.teams).every(a => on(a).length >= 12 && on(a).length <= 16), "30 teams with 12 to 16 players each");
  ok(s.season.realSchedule, "the real " + D.label + " schedule");
  const P = id => s.players[id];
  ok(P("duranke01").team === "GSW" && P("curryst01").team === "GSW", "Durant and Curry on the Warriors");
  ok(P("simmobe01") && P("simmobe01").team === "PHI", "Ben Simmons on the 76ers even though he never played that season");
  ok(P("curryst01").contract && P("curryst01").contract.salaries[0].amount === 12112359, "Curry's real 2016-17 salary ($12,112,359)");
  const pay = a => on(a).reduce((t, p) => t + ((p.contract && p.contract.salaries.find(x => x.year === Y) || {}).amount || 0), 0);
  ok(pay("CLE") > 110e6 && pay("PHI") > 30e6, "payrolls: CLE $" + (pay("CLE") / 1e6).toFixed(0) + "M, PHI $" + (pay("PHI") / 1e6).toFixed(0) + "M");
  const bos = s.teams.BOS.picks, bkn = s.teams.BKN.picks;
  ok(bos.some(p => p.year === 2018 && p.round === 1 && p.original === "BKN"), "the Celtics own the Nets' 2018 first");
  ok(bkn.some(p => p.year === 2017 && p.round === 1 && p.swap === "BOS"), "and can swap firsts with the Nets in 2017");
  const cls = Object.values(s.players).filter(p => p.team === "DRAFT" && +p.draftYear === Y);
  ok(cls.length >= 30 && cls.some(p => p.id === "fultzma01"), "the " + Y + " draft class is waiting (" + cls.length + " prospects)");
  ok(!Object.values(s.players).some(p => p.team === "DRAFT" && +p.draftYear < Y), "no prospect from a class already drafted");
  const C = window.CAREER_PRIOR, A = window.AWARDS_PRIOR, H = window.HISTORY_PRIOR;
  ok((C.curryst01 || []).some(x => x.year === Y - 1) && !(C.curryst01 || []).some(x => x.year >= Y), "career stats run through " + (Y - 2) + "-" + String(Y - 1).slice(2));
  ok((A.curryst01 || []).some(x => x.year === 2016 && x.award === "MVP"), "Curry's 2016 MVP is in his awards");
  ok(H.champions.some(c => c.year === 2016 && c.abbr === "CLE") && (H.titles.CLE || 0) >= 1, "the 2016 champion Cavaliers are in the history");
  ok(s.players.jamesle01.yearsPro >= 13, "LeBron's years in the league counted from his real career (" + s.players.jamesle01.yearsPro + ")");
  // a 2012-13 save gets the 2012-13 tables back
  L.useStart(2013);
  ok(!(window.CAREER_PRIOR.curryst01 || []).some(x => x.year >= 2013), "a 2012-13 save sees careers only through 2011-12");
  L.useStart(Y);
  // a full season and offseason
  let r, g = 0;
  do { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); r = L.advance(s, "endPlayoffs"); } while (r.stopped !== "seasonOver" && ++g < 400);
  ok(r.stopped === "seasonOver", "the " + D.label + " season plays to a champion (" + s.history.seasons[s.history.seasons.length - 1].champion + ")");
  let steps = 0;
  while (s.phase !== "regular" && steps++ < 120) { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); L.advance(s, "nextPhase", { auto: true }); }
  ok(s.year === Y + 1 && s.phase === "regular", "the offseason leads into " + Y + "-" + String(Y + 1).slice(2));
  const fultz = s.players.fultzma01;
  ok(fultz && fultz.team !== "DRAFT" && !!s.teams[fultz.team], "the " + Y + " class was drafted (Fultz to " + (fultz && fultz.team) + ")");
});

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exitCode = 1;
