// Draft Challenge (js/challenge.js): node tools/test-challenge.js
// 82-game schedules for any league size, picks leaving their real teams, the scrub bench, heavy minutes
// for the five, a full season with playoffs and awards, and the all-time snake draft.
const fs = require("fs");
global.window = global;
console.warn = () => {};
["data/league2012.js", "data/tendencies.js", "data/defense-history.js", "data/career-prior.js", "data/awards-prior.js",
  "data/era-2004.js", "data/era-2009.js", "data/era-2017.js",
  "js/engine.js", "js/awards.js", "js/challenge.js"].forEach(f => { if (fs.existsSync(f)) require("../" + f); });
const C = window.CHALLENGE;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok  ", m); } else { fail++; console.log("  FAIL", m); } };
const dash = new RegExp("[\\u2013\\u2014]");

// schedules
[29, 30, 31, 32].forEach(N => {
  const abbrs = Array.from({ length: N }, (_, i) => "T" + i);
  const g = C.matchups(abbrs, C.rng(N));
  const games = {}, home = {};
  g.forEach(x => { games[x.home] = (games[x.home] || 0) + 1; games[x.away] = (games[x.away] || 0) + 1; home[x.home] = (home[x.home] || 0) + 1; });
  ok(abbrs.every(a => games[a] === 82 && home[a] === 41), N + " teams: everyone plays 82, 41 at home");
});

// one season, 2012-13
const five = ["nashst01", "allenra02", "piercpa01", "nowitdi01", "bynuman01"];
const cfg = { mode: "year", year: 2013, team: "CHA", name: "Queen City Legends", picks: five, seed: 42, build: "free" };
const ch = C.buildYear(cfg);
const on = abbr => ch.league.players.filter(p => p.team === abbr);
ok(five.every(id => ch.players[id].team === "CHA"), "the five are on the user's team");
ok(on("CHA").length === 13 && on("CHA").filter(p => p.scrub).length === 8, "five plus an eight-man scrub bench");
ok(on("CHA").filter(p => p.scrub).every(p => p.ovr >= 38 && p.ovr <= 55), "scrubs rated 38 to 55");
ok(!ch.league.players.some(p => p.team === "CHA" && !p.scrub && five.indexOf(p.id) < 0), "the real Bobcats are gone");
ok(["LAL", "BOS", "DAL", "MIA"].every(a => ch.moves.some(m => m.team === a)) && ch.moves.length === 5, "every team that lost a pick signed a replacement (" + ch.moves.map(m => m.team + " " + m.inName).join(", ") + ")");
ok(["LAL", "BOS", "DAL", "MIA"].every(a => on(a).length >= 12), "their rosters stay full");
ok(ch.teams.find(t => t.abbr === "CHA").name === "Legends" && ch.teams.find(t => t.abbr === "CHA").city === "Queen City", "custom team name");
C.start(ch);
const t0 = Date.now();
const r = C.runAll(ch);
const ms = Date.now() - t0;
ok(r.w + r.l === 82, "82 games: " + r.w + "-" + r.l + " in " + ms + " ms, " + r.result);
const mpg = r.five.map(x => x.line ? x.line.mpg : 0);
ok(r.five.every(x => x.line && x.line.reb > 0) && r.five.every(x => !x.line || x.line.mpg >= 33), "the five play big minutes: " + r.five.map(x => x.name + " " + (x.line ? x.line.mpg + " mpg " + x.line.pts + " ppg" : "no games")).join(", "));
ok(r.bench.every(x => !x.line || x.line.mpg < 20), "the bench plays little: " + r.bench.map(x => x.line ? x.line.mpg : 0).join(", "));
ok(typeof r.result === "string" && !dash.test(JSON.stringify(r)), "result text with no long dashes");
ok(r.standings.East.length === 15 && r.standings.West.length === 15, "standings for both conferences");
ok(r.champion && r.awards && r.awards.mvp, "champion " + r.champion.abbr + ", MVP " + r.awards.mvp.name);
ok(r.log.filter(g => !g.playoff).length === 82, "the game log has all 82 games");
ok(r.best.length && r.best[0].pts >= 25, "best night: " + (r.best[0] ? r.best[0].name + " " + r.best[0].pts : "none"));
ok(JSON.stringify(r).length < 120000, "summary small enough to keep (" + Math.round(JSON.stringify(r).length / 1024) + " KB)");

// injuries off: nobody misses games
const r2 = C.play(Object.assign({}, cfg, { seed: 7, injuries: false }));
ok(r2.five.every(x => x.line && x.line.g >= 80), "injuries off: the five play every game (" + r2.five.map(x => x.line.g).join(", ") + ")");

// spin the wheel
const used = [], picks = [], rng = C.rng(9);
const wcfg = { mode: "year", year: 2013, team: "ORL", picks, seed: 9, build: "wheel" };
for (let i = 0; i < 5; i++) {
  const s = C.spin(wcfg, used, rng);
  used.push(s.key);
  const ros = C.spinRoster(wcfg, s);
  ok(ros.length > 0 && ros.every(p => p.team === s.abbr), "spin " + (i + 1) + ": " + s.abbr + " (" + ros.length + " to choose from)");
  picks.push(ros[0].id);
}
ok(new Set(used).size === 5, "five different teams");
const rw = C.play(wcfg);
ok(rw.w + rw.l === 82, "wheel team season: " + rw.w + "-" + rw.l);

// all-time draft
const acfg = { mode: "alltime", team: "LAL", seed: 3, build: "free" };
const dr = C.newDraft(acfg);
ok(dr.pool.length > 200 && dr.pool.every(e => !e.rookie), "all-time pool: " + dr.pool.length + " veterans from " + C.SEASONS.filter(s => C.loaded(s.year)).map(s => s.label).join(", "));
C.simToUser(dr);
let c = C.onClock(dr);
ok(c && c.team === "LAL", "sim to the user's pick (#" + (c && c.n + 1) + ")");
const first = C.available(dr)[0];
ok(C.draftPick(dr, first.key).ok, "user takes " + first.name + " (" + first.label + ")");
ok(!C.draftPick(dr, first.key).ok, "the same player cannot go twice");
C.autoDraft(dr);
ok(dr.picks.length === 150, "150 picks");
const bases = dr.picks.map(x => dr.pool.find(e => e.key === x.key).base);
ok(new Set(bases).size === 150, "no player drafted twice, even from different seasons");
const ach = C.buildAllTime(acfg, dr);
ok(ach.teams.every(t => ach.league.players.filter(p => p.team === t.abbr).length === 13), "every all-time team: 5 picks and 8 scrubs");
C.start(ach);
const ra = C.runAll(ach);
ok(ra.w + ra.l === 82 && ra.five.length === 5, "all-time season: " + ra.w + "-" + ra.l + ", " + ra.result);
const top = ra.leaders.pts[0];
ok(top && top.v > 18 && top.v < 45, "all-time scoring leader " + (top && top.name + " " + top.v));

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exitCode = 1;
