// Draft Challenge era rosters (data/era-2004.js, era-2009.js, era-2017.js): node tools/test-eras.js
// Shape, team counts, roster sizes, rating ranges, and a quick engine game for each season.
global.window = global;
console.warn = () => {};
require("../data/league2012.js");
require("../data/tendencies.js");
const E = require("../js/engine.js");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok  ", m); } else { fail++; console.log("  FAIL", m); } };
const SEASONS = { 2004: { teams: 29, label: "2003-04", has: ["SEA", "NJN", "NOH", "MEM"], not: ["CHA", "OKC"], champ: "DET" },
  2009: { teams: 30, label: "2008-09", has: ["OKC", "NJN", "CHA", "NOH"], not: ["SEA", "BKN"], champ: "LAL" },
  2017: { teams: 30, label: "2016-17", has: ["BKN", "CHA", "NOP"], not: ["NJN", "NOH"], champ: "GSW" } };
Object.keys(SEASONS).forEach(y => {
  const want = SEASONS[y];
  const D = require("../data/era-" + y + ".js");
  ok(window.ERA_ROSTERS && window.ERA_ROSTERS[y] === D, y + " registers window.ERA_ROSTERS[" + y + "]");
  ok(D.season === +y && D.label === want.label, y + " season and label " + D.label);
  ok(D.teams.length === want.teams, y + " has " + D.teams.length + " teams");
  const abbrs = D.teams.map(t => t.abbr);
  ok(want.has.every(a => abbrs.includes(a)) && want.not.every(a => !abbrs.includes(a)), y + " era franchises: " + want.has.join(", "));
  ok(D.teams.every(t => t.city && t.name && /East|West/.test(t.conf) && t.div && t.colors.length === 2 && t.record.w + t.record.l === 82), y + " team metadata and real 82-game records");
  ok(D.champion === want.champ && D.players.some(p => p.id === D.realMvp), y + " real champion " + D.champion + " and MVP " + D.realMvp);
  const per = {};
  D.players.forEach(p => { per[p.team] = (per[p.team] || 0) + 1; });
  ok(abbrs.every(a => per[a] >= 12 && per[a] <= 15) && D.players.every(p => abbrs.includes(p.team)), y + " rosters of 12 to 15 (" + Math.min(...Object.values(per)) + " to " + Math.max(...Object.values(per)) + ")");
  ok(new Set(D.players.map(p => p.id)).size === D.players.length, y + " one row per player");
  ok(D.players.every(p => p.ovr >= 25 && p.ovr <= 99 && E.ATTR_KEYS.every(k => p.attrs[k] >= 25 && p.attrs[k] <= 99)), y + " ratings 25 to 99");
  ok(D.players.every(p => ["usage", "three", "mid", "rim", "post", "pass", "drawFoul"].every(k => p.tend[k] >= 0 && p.tend[k] <= 100) && p.tend.blk >= 0 && p.tend.stl >= 0 && !p.tend.generated), y + " tendencies in range (real, not generated)");
  ok(D.players.every(p => /^(PG|SG|SF|PF|C)$/.test(p.pos) && p.ht >= 64 && p.ht <= 91 && p.age >= 18 && p.age <= 45), y + " positions, heights, ages");
  ok(D.players.every(p => p.stats && p.stats.g > 0 && p.stats.mpg > 0 && typeof p.rookie === "boolean" && p.yearsPro >= 0), y + " real season stats and experience");
  const top = D.players.slice().sort((a, b) => b.ovr - a.ovr);
  ok(top[0].ovr >= 94 && top[0].ovr <= 99 && top[200].ovr >= 60, y + " top of the scale " + top.slice(0, 3).map(p => p.name + " " + p.ovr).join(", "));
  const a = D.teams[0].abbr, b = D.teams[1].abbr;
  const res = E.simGame({ abbr: a, players: D.players.filter(p => p.team === a) }, { abbr: b, players: D.players.filter(p => p.team === b) }, E.rng(3), { year: +y });
  ok(res.home.pts > 60 && res.away.pts > 60, y + " engine plays a game: " + a + " " + res.home.pts + ", " + b + " " + res.away.pts);
});
console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exitCode = 1;
