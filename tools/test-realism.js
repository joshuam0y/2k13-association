// Realism checks for start years: node tools/test-realism.js
// Gap years in a real career do not turn into breakouts, players who barely played in real life are not
// rated like rotation players (the minutes cap in the start files), and stars keep their ratings.
const fs = require("fs");
global.window = global;
console.warn = () => {};
["data/league2012.js", "data/start-2004.js", "data/start-2008.js", "data/start-2017.js", "data/start-2021.js", "data/drafts.js", "data/draft-prior.js", "data/targets.js",
  "data/cap-history.js", "data/coaches.js", "data/coach-history.js", "data/history.js", "data/career-prior.js", "data/alltime-prior.js", "data/picks-2012.js",
  "data/awards-prior.js", "data/schedules.js", "data/logos.js", "data/tendencies.js", "data/tendency-history.js", "data/defense-history.js", "data/personalities.js",
  "js/engine.js", "js/cba.js", "js/future.js", "js/trade.js", "js/freeagency.js", "js/mood.js", "js/draft.js", "js/draft-gen.js", "js/rookies.js",
  "js/progression.js", "js/coaches.js", "js/awards.js", "js/news.js", "js/league.js", "js/expansion.js", "js/positions.js"].forEach(f => { if (fs.existsSync(f)) require("../" + f); });
const L = window.LEAGUE;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok  ", m); } else { fail++; console.log("  FAIL", m); } };
const season = s => { let r, g = 0; do { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); r = L.advance(s, "endPlayoffs"); } while (r.stopped !== "seasonOver" && ++g < 400); };
const offseason = s => { let k = 0; while (s.phase !== "regular" && k++ < 120) { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); L.advance(s, "nextPhase", { auto: true }); } };

// start files: buried and washed-up players capped, stars untouched
const P = (Y, id) => (window.START_LEAGUES[Y].players.find(p => p.id === id) || {}).ovr;
ok(P(2017, "marjabo01") <= 70 && P(2017, "mcgeeja01") <= 70, "2016-17: Boban Marjanovic " + P(2017, "marjabo01") + " and JaVale McGee " + P(2017, "mcgeeja01") + " (real 8 to 10 minutes a game) are not rotation-level");
ok(P(2004, "barroda01") <= 70, "2003-04: Dana Barros (1 real game at 36) is " + P(2004, "barroda01"));
ok(P(2017, "jamesle01") >= 95 && P(2017, "curryst01") >= 95 && P(2021, "thompkl01") >= 85, "stars keep their ratings (LeBron " + P(2017, "jamesle01") + ", Curry " + P(2017, "curryst01") + ", Klay after two lost seasons " + P(2021, "thompkl01") + ")");

// a season: players who barely played in real life do not take big minutes
{
  const Y = 2017, D = window.START_LEAGUES[Y], s = L.newLeague(D.teams[0].abbr, { seed: 7, start: Y });
  season(s);
  const real = D.seasonStats || {}, big = [];
  Object.values(s.players).forEach(p => {
    const c = (p.careerStats || []).find(x => x.year === Y);
    if (!c || c.g < 20) return;
    const r = real[p.id];
    if (r && r.mpg < 10 && r.g >= 10 && c.min / c.g >= 22) big.push(p.name);
  });
  ok(big.length <= 2, "2016-17: real end-of-bench players with 22+ minutes in the sim: " + big.length + (big.length ? " (" + big.join(", ") + ")" : ""));
}

// gap years: Sergio Rodriguez (real 74 before and after Spain) stays near his real level
{
  const s = L.newLeague("BOS", { seed: 4, start: 2008 });
  let hi = 0;
  for (let k = 0; k < 3; k++) { season(s); offseason(s); const p = s.players.rodrise01; if (p && !p.retired) hi = Math.max(hi, p.ovr); }
  ok(hi > 0 && hi <= 77, "a gap in a real career is not a breakout: Sergio Rodriguez peaks at " + hi + " over three seasons");
}

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exitCode = 1;
