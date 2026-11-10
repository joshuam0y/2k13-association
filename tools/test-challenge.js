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
ok(on("CHA").length === 5 && on("CHA").filter(p => p.scrub).length === 0, "just the five (no bench: all 48 minutes)");
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
ok(r.bench.filter(x => x.line && x.line.mpg >= 20).length <= 1 && r.bench.every(x => !x.line || x.line.mpg < 27), "the bench plays little (one may fill in for an injured starter): " + r.bench.map(x => x.line ? x.line.mpg : 0).join(", "));
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

// the other seasons: 29 teams in 2003-04, real records, era style
[[2004, "NOH"], [2009, "OKC"], [2017, "PHI"]].forEach(([y, team]) => {
  const d = C.seasonData(y);
  if (!d) { ok(false, y + " rosters loaded"); return; }
  const picks = d.players.slice(0, 5).map(p => p.id);
  const rs = C.play({ mode: "year", year: y, team, picks, seed: y });
  const all = Object.values(rs.standings).flat();
  ok(all.length === d.teams.length && all.every(t => t.w + t.l === 82), y + ": " + d.teams.length + " teams, all play 82; the top five (" + rs.five.map(x => x.name.split(" ").slice(-1)[0]).join(", ") + ") went " + rs.w + "-" + rs.l + ", " + rs.result);
  ok(rs.five.every(x => x.real && x.line && x.line.mpg >= 30), y + ": real lines kept and big minutes (" + rs.five.map(x => x.line.mpg).join(", ") + ", blowouts rest the stars)");
  ok(rs.team.real && rs.team.orig, y + ": the franchise's real record (" + rs.team.real.w + "-" + rs.team.real.l + ")");
});
const lb = C.allTimePool().filter(e => e.base === "jamesle01").map(e => e.label);
ok(lb.length === 3 && lb.indexOf("2003-04") < 0, "all-time LeBron: " + lb.join(", ") + " (no rookie year)");

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
ok(ach.teams.every(t => ach.league.players.filter(p => p.team === t.abbr).length === 5), "every all-time team: its five");
C.start(ach);
const ra = C.runAll(ach);
ok(ra.w + ra.l === 82 && ra.five.length === 5, "all-time season: " + ra.w + "-" + ra.l + ", " + ra.result);
const top = ra.leaders.pts[0];
ok(top && top.v > 18 && top.v < 45, "all-time scoring leader " + (top && top.name + " " + top.v));

// any season from an Association start file: 2007-08
require("../data/start-2008.js");
const d08 = C.seasonData(2008);
ok(C.SEASONS.length === 81 && d08 && d08.teams.find(t => t.abbr === "BOS").real.w === 66, "every season 1946-47 to 2026-27; 2007-08 from its start file, Boston's real 66-16");
const kg = d08.players.find(p => p.id === "garneke01");
ok(kg && kg.team === "BOS" && kg.stats && kg.stats.pts > 15 && !kg.rookie, "Garnett in Boston with his real 2007-08 line (" + (kg && kg.stats && kg.stats.pts) + " ppg)");
ok(d08.players.find(p => p.id === "duranke01").rookie, "Durant is a rookie that season");
const r08 = C.play({ mode: "year", year: 2008, team: "SEA", picks: ["garneke01", "piercpa01", "allenra02", "nashst01", "duncati01"], seed: 5, build: "free" });
ok(r08.w + r08.l === 82 && r08.w >= 50, "a 2007-08 super team in Seattle: " + r08.w + "-" + r08.l + ", " + r08.result);

// two players: same league, then a showdown
{
  const vcfg = { mode: "versus", year: 2008, seed: 11, injuries: true, sides: [{ team: "BOS", name: "", picks: [] }, { team: "NYK", name: "", picks: [] }] };
  const order = [];
  const pool = ["garneke01", "wadedw01", "paulch01", "nashst01", "bryanko01", "nowitdi01", "howardw01", "duncati01", "jamesle01", "anthoca01"];
  pool.forEach(id => { const i = C.vsOnClock(vcfg); order.push(i); vcfg.sides[i].picks.push(id); });
  ok(order.join("") === "0110011001" && C.vsOnClock(vcfg) === -1, "versus: snake order A B B A A B B A A B");
  const vr = C.playVersus(vcfg);
  const n = vr.games.length, ww = vr.wins[vr.winner];
  ok(ww === 3 && n >= 3 && n <= 5 && vr.games.every(g => g.hs !== g.as), "versus: a best-of-five series (" + vr.winner + " " + vr.wins.BOS + "-" + vr.wins.NYK + ", " + n + " games)");
  const ironmen = vr.sides[0].five.concat(vr.sides[1].five).every(p => vr.lines[p.id] && vr.lines[p.id].mpg >= 47);
  ok(ironmen && vr.mvp, "all ten play the full 48 minutes (MVP " + (vr.mvp && vr.mvp.name) + ")");
  [3, 7].forEach(bo => { const x = C.playVersus(Object.assign({}, vcfg, { bestOf: bo }), { pbp: true }); const need = Math.ceil(bo / 2);
    ok(x.wins[x.winner] === need && x.games.length >= need && x.games.length <= bo && x.games.every(g => g.res && g.res.pbp && g.res.pbp.length > 100), "best of " + bo + ": first to " + need + " (" + x.games.length + " games, each with its play-by-play for the court)"); });
  ok(vr.sides.every(sd => sd.fit && sd.fit.slots.filter(x => x.id).length === 5 && sd.fit.parts.length === 6 && sd.five.every(p => p.slot)), "each five gets its spots and fit grades");
}
// fit: five centers play out of position and grade badly; a real lineup grades well
{
  const P = C.seasonData(2008).players, o = id => P.find(p => p.id === id);
  const bigs = C.lineupFit(["howardw01", "duncati01", "onealsh01", "garneke01", "nowitdi01"].map(o));
  const good = C.lineupFit(["nashst01", "bryanko01", "jamesle01", "garneke01", "duncati01"].map(o));
  ok(bigs.word === "BAD FIT" && bigs.slots.filter(x => x.pen >= 1.5).length >= 3 && good.word === "GREAT FIT", "fit: five bigs " + bigs.word + ", Nash-Kobe-LeBron-Garnett-Duncan " + good.word);
  const r1 = C.play({ mode: "year", year: 2008, team: "SEA", picks: ["howardw01", "duncati01", "onealsh01", "garneke01", "nowitdi01"], seed: 3, build: "free" });
  ok(r1.fit && r1.fit.word === "BAD FIT", "a season result carries the lineup fit (" + r1.w + "-" + r1.l + ")");
}
// the all-time pool file: every finished season
require("../data/challenge-pool.js");
const pool = C.allTimePool();
ok(C.poolSeasons().length === 81 && pool.length > 2000 && pool.every(e => !e.rookie && e.tend), "all-time pool file: " + pool.length + " veterans from " + C.poolSeasons().length + " seasons");
const dr2 = C.newDraft({ mode: "alltime", team: "BOS", seed: 4, build: "free" });
C.autoDraft(dr2);
const ach2 = C.buildAllTime({ mode: "alltime", team: "BOS", seed: 4, build: "free" }, dr2);
C.start(ach2);
const ra2 = C.runAll(ach2);
ok(ra2.w + ra2.l === 82 && C.eraTeam(2008, "SEA") && C.eraTeam(2008, "SEA").name === "SuperSonics", "all-time season from the pool file: " + ra2.w + "-" + ra2.l + "; old teams still known (2008 SuperSonics)");

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exitCode = 1;
