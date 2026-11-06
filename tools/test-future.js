// The league after 2026 (js/future.js): node tools/test-future.js
// Rule change announcements, the style of play drifting, cap and lottery changes through CBA.rules,
// 72 game schedules, 4-point shots in the engine and younger draft classes.
const fs = require("fs");
global.window = global;
console.warn = () => {};
["data/league2012.js", "data/drafts.js", "data/draft-prior.js", "data/targets.js", "data/cap-history.js", "data/coaches.js", "data/history.js", "data/personalities.js",
  "data/career-prior.js", "data/picks-2012.js", "data/awards-prior.js", "data/schedules.js", "data/tendencies.js", "data/tendency-history.js", "data/defense-history.js",
  "js/engine.js", "js/cba.js", "js/future.js", "js/trade.js", "js/freeagency.js", "js/mood.js", "js/draft.js", "js/draft-gen.js", "js/rookies.js", "js/progression.js",
  "js/coaches.js", "js/awards.js", "js/news.js", "js/league.js", "js/positions.js"].forEach(f => { if (fs.existsSync(f)) require("../" + f); });
const F = window.FUTURE, C = window.CBA, E = window.ENGINE, L = window.LEAGUE;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok  ", m); } else { fail++; console.log("  FAIL", m); } };

// announcements over twenty summers
const s = L.newLeague("OKC", { seed: 7 });
ok(F.eraFor(s, 2026) === null, "through 2026 the engine uses the real eras");
const perSummer = {};
for (let y = 2026; y <= 2045; y++) {
  s.year = y; const before = s.future ? s.future.changes.length : 0;
  F.summer(s); F.summer(s);
  perSummer[y] = s.future.changes.length - before;
}
const ch = s.future.changes;
ok(Object.values(perSummer).every(n => n <= 1), "at most one rule change a summer (" + ch.length + " in 20 summers: " + ch.map(c => c.id + " " + c.year).join(", ") + ")");
ok(ch.length >= 4 && ch.length <= 14, "a handful of changes over twenty years");
const ids = ch.map(c => c.id), onceIds = F.CHANGES.filter(c => c.once).map(c => c.id);
ok(onceIds.every(id => ids.filter(x => x === id).length <= 1), "one-time changes happen once");
ok(s.news.some(n => ch.length && n.headline === F.CHANGES.find(c => c.id === ch[0].id).headline), "announcements go to the news");
const e30 = F.eraFor(s, 2030), e45 = F.eraFor(s, 2045);
ok(e30 && e30.three > 1.3 && e30.three < 2.4 && e30.pace > 0.9 && e30.pace < 1.25, "2030 style in range: pace " + e30.pace.toFixed(3) + ", threes " + e30.three.toFixed(3));
ok(JSON.stringify(F.eraFor(s, 2045)) === JSON.stringify(e45), "the style of a season is fixed once drawn");

// each change does what it says
function fresh(changes) { const t = L.newLeague("OKC", { seed: 9 }); t.future = { changes, base: {}, rolled: 2030 }; F.activate(t); return t; }
fresh([]); const cap0 = C.rules(2031).cap, odds0 = C.rules(2031).lotteryOdds.slice(), sm0 = C.rules(2031).supermax;
let t = fresh([{ id: "mediaDeal", year: 2031 }, { id: "lotteryFlat", year: 2031 }, { id: "supermaxGone", year: 2031 }, { id: "season72", year: 2031 }]);
const r = C.rules(2031);
ok(Math.abs(r.cap / cap0 - 1.15) < 0.01, "media deal: cap " + (cap0 / 1e6).toFixed(1) + "M to " + (r.cap / 1e6).toFixed(1) + "M");
ok(C.rules(2030).cap < r.cap / 1.1, "the cap jump starts in its season");
ok(r.lotteryOdds.slice(0, 7).every(x => x === r.lotteryOdds[0]) && Math.abs(r.lotteryOdds.slice(0, 7).reduce((a, b) => a + b, 0) - odds0.slice(0, 7).reduce((a, b) => a + b, 0)) < 0.1, "lottery reform: the worst seven share the same odds (" + r.lotteryOdds[0] + "%)");
ok(sm0 === true && r.supermax === false, "supermax gone");
ok(r.seasonGames === 72, "72 game seasons in the rules");
t = fresh([{ id: "arcBack", year: 2031 }, { id: "shotClock20", year: 2031 }]);
const a = F.eraFor(t, 2031), b = F.eraFor(fresh([]), 2031);
ok(a.three < b.three * 0.9 && a.make3 < 0 && a.pace > b.pace * 1.04, "arc back and 20 second clock change the style");

// 72 game schedule
const lg = { season: 2031, teams: s.teams ? Object.keys(s.teams).map(k => ({ abbr: k, conf: s.teams[k].conf, div: s.teams[k].div })) : [], players: [] };
const season = E.newSeason(lg, { year: 2031, seed: 3, realSchedule: false });
ok(F.trimSchedule(season, 72, Math.random), "trimmed a generated schedule");
const cnt = {}; season.days.forEach(d => d.games.forEach(g => { cnt[g.home] = (cnt[g.home] || 0) + 1; cnt[g.away] = (cnt[g.away] || 0) + 1; }));
ok(Object.values(cnt).every(n => n === 72) && Object.keys(cnt).length === lg.teams.length, "every team plays 72 games");

// 4-point shots
let fours = 0, games = 0;
const st = L.newLeague("OKC", { seed: 11 });
const era = Object.assign({}, E.eraFor(2026), { four: 0.3 });
// simulate through the league so the teams are built the normal way
st.season.era = era;
L.advance(st, { days: 3 });
Object.values(st.season.boxScores).forEach(bx => { if (!bx.home || !bx.home.box) return; games++; [bx.home, bx.away].forEach(side => side.box.forEach(rw => { fours += (rw.pts || 0) - (2 * (rw.fgm || 0) + (rw.tpm || 0) + (rw.ftm || 0)); })); });
ok(games > 0 && fours > 0, "4-point shots count four (" + fours + " extra points over " + games + " games)");

// younger classes once high schoolers are back
const G = window.DRAFTGEN;
fresh([]);
const young0 = G.generate(2032, 5).filter(p => p.age <= 18).length;
fresh([{ id: "highSchool", year: 2033 }]);
const young1 = G.generate(2032, 5).filter(p => p.age <= 18).length;
ok(young1 > young0 * 2, "high schoolers: 18 year olds in a class " + young0 + " to " + young1);

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exitCode = 1;
