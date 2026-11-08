// Associations that open in another season (js/league.js opts.start, data/start-YYYY.js): node tools/test-start.js
// Opening-night rosters, contracts, picks and the past for that season; the 2012-13 tables come back for a
// 2012-13 save; a full season and offseason play.
const fs = require("fs");
global.window = global;
console.warn = () => {};
["data/league2012.js", "data/start-2004.js", "data/start-2008.js", "data/start-2017.js", "data/drafts.js", "data/draft-prior.js", "data/targets.js", "data/cap-history.js", "data/coaches.js",
  "data/coach-history.js", "data/history.js", "data/personalities.js", "data/career-prior.js", "data/alltime-prior.js", "data/picks-2012.js",
  "data/awards-prior.js", "data/schedules.js", "data/tendencies.js", "data/tendency-history.js", "data/defense-history.js", "data/logos.js",
  "js/engine.js", "js/cba.js", "js/future.js", "js/trade.js", "js/freeagency.js", "js/mood.js", "js/draft.js", "js/draft-gen.js", "js/rookies.js",
  "js/progression.js", "js/coaches.js", "js/awards.js", "js/news.js", "js/league.js", "js/expansion.js", "js/positions.js"].forEach(f => { if (fs.existsSync(f)) require("../" + f); });
const L = window.LEAGUE;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok  ", m); } else { fail++; console.log("  FAIL", m); } };

const CHECK = {
  2004: { team: "CLE", stars: [["jamesle01", "CLE"], ["garneke01", "MIN"], ["onealsh01", "LAL"]], teams: 29, cls: "howardw01", rich: "LAL", champ: [2003, "SAS"], vet: ["duncati01", 6] },
  2008: { team: "BOS", stars: [["garneke01", "BOS"], ["piercpa01", "BOS"], ["allenra02", "BOS"], ["duranke01", "SEA"]], teams: 30, cls: "rosede01", rich: "NYK", champ: [2007, "SAS"], vet: ["duncati01", 10] },
  2017: { team: "GSW", stars: [["duranke01", "GSW"], ["curryst01", "GSW"], ["simmobe01", "PHI"]], teams: 30, cls: "fultzma01", rich: "CLE", champ: [2016, "CLE"], vet: ["curryst01", 7] }
};
[2004, 2008, 2017].forEach(Y => {
  const K = CHECK[Y];
  const D = window.START_LEAGUES && window.START_LEAGUES[Y];
  ok(!!D, Y + " start data loaded");
  if (!D) return;
  const s = L.newLeague(K.team, { seed: 5, start: Y });
  const on = a => Object.values(s.players).filter(p => p.team === a && !p.retired && !(p.stashedUntil > s.year));
  ok(s.year === Y && s.startYear === Y && s.season.year === Y, "the league opens in " + D.label);
  ok(Object.keys(s.teams).length === K.teams && Object.keys(s.teams).every(a => on(a).length >= 12 && on(a).length <= 16), K.teams + " teams with 12 to 16 players each");
  ok(Y >= 2013 ? s.season.realSchedule : Object.values(s.season.days).reduce((n, d) => n + d.games.filter(g => g.home === K.team || g.away === K.team).length, 0) === 82, Y >= 2013 ? "the real " + D.label + " schedule" : "an 82-game schedule");
  const P = id => s.players[id];
  ok(K.stars.every(([id, t]) => P(id) && P(id).team === t), "opening night: " + K.stars.map(([id, t]) => (P(id) ? P(id).name : id) + " " + t).join(", "));
  const pay = a => on(a).reduce((t, p) => t + ((p.contract && p.contract.salaries.find(x => x.year === Y) || {}).amount || 0), 0);
  const cap = window.CBA.rules(Y).cap;
  ok(pay(K.rich) > cap, "payrolls: " + K.rich + " $" + (pay(K.rich) / 1e6).toFixed(0) + "M over the $" + (cap / 1e6).toFixed(1) + "M cap");
  if (Y === 2017) {
    ok(P("curryst01").contract && P("curryst01").contract.salaries[0].amount === 12112359, "Curry's real 2016-17 salary ($12,112,359)");
    ok(s.teams.BOS.picks.some(p => p.year === 2018 && p.round === 1 && p.original === "BKN"), "the Celtics own the Nets' 2018 first");
    ok(s.teams.BKN.picks.some(p => p.year === 2017 && p.round === 1 && p.swap === "BOS"), "and can swap firsts with the Nets in 2017");
  }
  if (Y === 2008) ok(s.teams.SEA && s.teams.SEA.name === "SuperSonics" && s.teams.BKN.city === "New Jersey", "the Seattle SuperSonics and the New Jersey Nets");
  if (Y === 2004) ok(!s.teams.CHA && s.teams.NOH.conf === "East", "29 teams: no Bobcats yet, New Orleans in the East");
  const cls = Object.values(s.players).filter(p => p.team === "DRAFT" && +p.draftYear === Y);
  ok(cls.length >= 30 && cls.some(p => p.id === K.cls), "the " + Y + " draft class is waiting (" + cls.length + " prospects, with " + K.cls + ")");
  ok(!Object.values(s.players).some(p => p.team === "DRAFT" && +p.draftYear < Y), "no prospect from a class already drafted");
  const C = window.CAREER_PRIOR, A = window.AWARDS_PRIOR, H = window.HISTORY_PRIOR;
  ok((C[K.vet[0]] || []).some(x => x.year === Y - 1) && !(C[K.vet[0]] || []).some(x => x.year >= Y), "career stats run through " + (Y - 2) + "-" + String(Y - 1).slice(2));
  ok(!(A.duncati01 || []).some(x => x.year >= Y) && (A.duncati01 || []).some(x => x.award === "MVP"), "awards only from before the start (Duncan's MVPs)");
  ok(H.champions.some(c => c.year === K.champ[0] && c.abbr === K.champ[1]) && !H.champions.some(c => c.year >= Y), "champions through " + K.champ[0] + " and none after");
  const vet = s.players[K.vet[0]];
  ok(vet && vet.yearsPro === K.vet[1], (vet ? vet.name : K.vet[0]) + "'s years in the league counted from his real career (" + (vet && vet.yearsPro) + ")");
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
  const top = s.players[K.cls];
  ok(top && top.team !== "DRAFT" && !!s.teams[top.team], "the " + Y + " class was drafted (" + (top && top.name) + " to " + (top && top.team) + ")");
  if (Y === 2004) ok(!!s.teams.CHA && s.teams.NOH.conf === "West" && Object.values(s.players).filter(p => p.team === "CHA").length >= 10, "the Bobcats joined with an expansion draft and New Orleans moved West");
});

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exitCode = 1;
