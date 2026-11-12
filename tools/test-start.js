// Associations that open in another season (js/league.js opts.start, data/start-YYYY.js): node tools/test-start.js
// Opening-night rosters, contracts, picks and the past for that season; the 2012-13 tables come back for a
// 2012-13 save; a full season and offseason play.
const fs = require("fs");
global.window = global;
console.warn = () => {};
["data/league2012.js", "data/start-2004.js", "data/start-2007.js", "data/start-2008.js", "data/start-2017.js", "data/drafts.js", "data/draft-prior.js", "data/targets.js", "data/cap-history.js", "data/coaches.js",
  "data/coach-history.js", "data/history.js", "data/personalities.js", "data/career-prior.js", "data/alltime-prior.js", "data/picks-2012.js",
  "data/awards-prior.js", "data/schedules.js", "data/tendencies.js", "data/tendency-history.js", "data/defense-history.js", "data/logos.js",
  "js/engine.js", "js/cba.js", "js/future.js", "js/trade.js", "js/freeagency.js", "js/mood.js", "js/draft.js", "js/draft-gen.js", "js/rookies.js",
  "js/progression.js", "js/coaches.js", "js/awards.js", "js/news.js", "js/league.js", "js/expansion.js", "js/positions.js", "js/reallife.js", "data/real-moves.js"].forEach(f => { if (fs.existsSync(f)) require("../" + f); });
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
  ok(s.season.realSchedule && Object.values(s.season.days).reduce((n, d) => n + d.games.filter(g => g.home === K.team || g.away === K.team).length, 0) === 82, "the real " + D.label + " schedule, 82 games");
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
  if (Y === 2008) {
    ok(s.teams.SEA && s.teams.SEA.name === "SuperSonics" && s.teams.BKN.city === "New Jersey", "the Seattle SuperSonics and the New Jersey Nets");
    ok(s.teams.MIN.picks.some(p => p.year === 2009 && p.round === 1 && p.original === "BOS") && !s.teams.BOS.picks.some(p => p.year === 2009 && p.round === 1),
      "real pick trades: Minnesota holds Boston's 2009 first from the Garnett trade");
    const co = a => window.COACH && window.COACH.of(s, a);
    ok(co("BOS") && co("BOS").name === "Doc Rivers" && co("MIA").name === "Pat Riley" && co("SEA").name === "P.J. Carlesimo" && co("MIA").titles === 5,
      "the real 2007-08 coaches (Rivers, Riley with 5 titles, Carlesimo)");
    ok(window.COACH.available(s, Y).every(c => c.name !== "Erik Spoelstra" && c.name !== "Tom Thibodeau"), "coaches hired later in real life are not on the market yet");
  }
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

// every start file: the league builds, rosters are legal, a week plays
fs.readdirSync("data").filter(f => /^start-\d{4}\.js$/.test(f)).forEach(f => {
  const Y = +f.slice(6, 10);
  require("../data/" + f);
  const D = window.START_LEAGUES[Y];
  let s = null, err = null;
  try { s = L.newLeague(D.teams[0].abbr, { seed: Y, start: Y }); for (let d = 0; d < 7; d++) { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); L.advance(s, { days: 1 }); } } catch (e) { err = e; }
  const sizes = s ? Object.keys(s.teams).map(a => Object.values(s.players).filter(p => p.team === a && !(p.stashedUntil > s.year)).length) : [];
  const games = s ? Object.values(s.season.standings).reduce((n, x) => n + x.w + x.l, 0) / 2 : 0;
  ok(!err && sizes.every(n => n >= (Y < 1977 ? 8 : 10) && n <= 16) && games > (D.teams.length < 20 ? 5 : 20), D.label + ": " + (err ? "ERROR " + err.message : sizes.length + " teams, " + Math.min.apply(null, sizes) + " to " + Math.max.apply(null, sizes) + " players, " + games + " games in the first week"));
});
// the 2011-12 lockout: the real 66-game schedule from Christmas Day
{
  const s = L.newLeague("BOS", { seed: 9, start: 2012 });
  const n = Object.values(s.season.days).reduce((t, d) => t + d.games.filter(g => g.home === "BOS" || g.away === "BOS").length, 0);
  ok(s.season.realSchedule && n === 66 && s.season.days[0].date === "2011-12-25", "2011-12: the real 66-game lockout schedule from Christmas Day (" + n + " games, opens " + s.season.days[0].date + ")");
}
// the season being played now: 2026-27 as it opened
{
  const s = L.newLeague("NYK", { seed: 9, start: 2027 });
  const P = id => s.players[id];
  const n = Object.values(s.season.days).reduce((t, d) => t + d.games.filter(g => g.home === "NYK" || g.away === "NYK").length, 0);
  ok(s.year === 2027 && s.season.realSchedule && n === 82 && s.season.days[0].date === "2026-10-20", "2026-27: the real schedule from October 20, 2026 (" + n + " games)");
  ok(P("wembavi01").age === 22 && P("flaggco01").age === 19 && P("curryst01").age === 38, "real ages (Wembanyama 22, Flagg 19, Curry 38)");
  ok(P("gilgesh01").contract.salaries.length >= 4, "SGA's extension signed before the season is part of his contract (through " + P("gilgesh01").contract.salaries.slice(-1)[0].year + ")");
  ok(window.HISTORY_PRIOR.champions.some(c => c.year === 2026 && c.abbr === "NYK"), "the Knicks are the defending champions");
  ok(window.COACH.of(s, "NYK").name === "Mike Brown" && window.COACH.of(s, "NYK").titles === 1 && window.COACH.of(s, "DAL").name === "Dusty May", "the 2026-27 coaches (Mike Brown with his ring, Dusty May in Dallas)");
}
{
  const s = L.newLeague("GSW", { seed: 9, start: 2017 });
  ok(window.COACH.of(s, "GSW").name === "Steve Kerr" && window.COACH.of(s, "GSW").titles === 1 && window.COACH.available(s, 2017).every(c => c.name !== "Phil Jackson"),
    "2016-17: Steve Kerr (1 title) in Golden State, retired coaches off the market");
}
// start today: 2026-27 from the date in the data, real results and stats so far
{
  const s = L.newLeague("BOS", { seed: 9, start: 2027, today: true });
  const T = window.START_LEAGUES[2027].today, st = s.season.standings;
  const real = {}; T.results.forEach(r => { const hw = r[3] > r[4]; [[r[1], hw], [r[2], !hw]].forEach(([a, w]) => { const x = real[a] = real[a] || [0, 0]; x[w ? 0 : 1]++; }); });
  ok(s.season.days[s.season.day].date >= T.date && Object.keys(real).every(a => st[a].w === real[a][0] && st[a].l === real[a][1]), "start today (" + T.date + "): " + T.results.length + " real results in the standings (BOS " + st.BOS.w + "-" + st.BOS.l + ")");
  const sga = s.season.playerStats.gilgesh01;
  ok(sga && sga.g === T.totals.gilgesh01[0] && sga.pts === T.totals.gilgesh01[3], "real totals so far (SGA " + (sga && sga.g) + " games, " + (sga && sga.pts) + " points)");
  const sizes = Object.keys(s.teams).map(a => Object.values(s.players).filter(p => p.team === a && !p.retired && !(p.stashedUntil > s.year)).length);
  ok(Math.max.apply(null, sizes) <= 15 && Math.min.apply(null, sizes) >= 11, "today's rosters, 11 to 15 a team (" + Math.min.apply(null, sizes) + " to " + Math.max.apply(null, sizes) + ")");
  let r, g = 0;
  do { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); r = L.advance(s, "endPlayoffs"); } while (r.stopped !== "seasonOver" && ++g < 400);
  ok(r.stopped === "seasonOver" && Object.keys(st).every(a => st[a].w + st[a].l === 82), "the rest of the season plays to 82 games and a champion");
}
// real-life mode: the real moves happen on their dates
{
  const s = L.newLeague("BOS", { seed: 4, start: 2008, realLife: true });
  let r, g = 0;
  do { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); r = L.advance(s, "endPlayoffs"); } while (r.stopped !== "seasonOver" && ++g < 400);
  const at = id => s.players[id] && s.players[id].team;
  ok(s.realLife && at("gasolpa01") === "LAL" && at("onealsh01") === "PHX" && at("kiddja01") === "DAL", "real life 2007-08: Gasol to the Lakers, Shaq to Phoenix, Kidd to Dallas (" + s.realApplied + " real moves)");
  let k = 0;
  while (s.phase !== "regular" && k++ < 120) { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); L.advance(s, "nextPhase", { auto: true }); }
  const sizes = Object.keys(s.teams).map(a => Object.values(s.players).filter(p => p.team === a && !p.retired && !(p.stashedUntil > s.year)).length);
  ok(at("brandel01") === "PHI" && at("artesro01") === "HOU" && Math.max.apply(null, sizes) <= 15, "real life summer 2008: Brand to Philadelphia, Artest to Houston; rosters at most 15");
}
// draft night: summer 2007, the 2006-07 season with its real ending
{
  const s = L.summerStart("BOS", 2007, { seed: 5 });
  const H = s.history.seasons[s.history.seasons.length - 1];
  ok(s.phase === "draftLottery" && s.year === 2007 && H.champion === "SAS" && H.standings.BOS.w === 24 && H.standings.DAL.w === 67,
    "draft night 2007: the real 2006-07 ending (Spurs champions, Boston 24-58, Dallas 67-15)");
  ok(s.players.garneke01.team === "MIN" && s.players.garneke01.careerStats.slice(-1)[0].pts === Math.round(22.4 * 76), "Garnett still in Minnesota with his real 2006-07 line");
  s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); L.advance(s, "nextPhase");
  ok(s.draft && s.draft.order && s.draft.order.length >= 58 && (() => { const worst = Object.keys(H.standings).sort((a, b) => H.standings[a].w - H.standings[b].w).slice(0, 20); return s.draft.order.slice(0, 14).every(x => worst.indexOf(x.original || x.team) >= 0); })(), "the lottery runs off the real records (top picks: " + s.draft.order.slice(0, 3).map(x => x.team).join(", ") + ")");
}
// real contract options in the 2025-26 start
{
  const s = L.newLeague("BOS", { seed: 9, start: 2026 });
  const t = s.players.tatumja01;
  ok(t && t.contract && t.contract.options.some(o => o.year === 2030 && o.type === "player"), "real options: Tatum's 2029-30 player option");
}
L.useStart(2013);

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exitCode = 1;
