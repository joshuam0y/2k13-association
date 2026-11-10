// Records, stat titles and rookies in leagues that start in another season: node tools/test-records-start.js
// The real record book stops at the start (no Kobe 81 in a 2003-04 league, Bam Adebayo's 83 and Klay
// Thompson's 14 threes in 2026-27), stat titles real and in the save, rookies counted from the start file.
const fs = require("fs");
global.window = global;
console.warn = () => {};
["data/league2012.js", "data/start-2004.js", "data/start-2008.js", "data/start-2017.js", "data/start-2027.js", "data/drafts.js", "data/draft-prior.js", "data/targets.js",
  "data/cap-history.js", "data/coaches.js", "data/coach-history.js", "data/history.js", "data/personalities.js", "data/career-prior.js", "data/alltime-prior.js",
  "data/real-games.js", "data/stat-leaders.js", "data/picks-2012.js", "data/awards-prior.js", "data/schedules.js", "data/tendencies.js", "data/tendency-history.js",
  "data/defense-history.js", "data/logos.js", "js/engine.js", "js/cba.js", "js/future.js", "js/trade.js", "js/freeagency.js", "js/mood.js", "js/draft.js", "js/draft-gen.js",
  "js/rookies.js", "js/progression.js", "js/coaches.js", "js/awards.js", "js/records.js", "js/news.js", "js/league.js", "js/expansion.js", "js/positions.js"].forEach(f => { if (fs.existsSync(f)) require("../" + f); });
const L = window.LEAGUE, R = window.RECORDS, A = window.AWARDS;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok  ", m); } else { fail++; console.log("  FAIL", m); } };
const names = l => l.map(x => x.name + " " + x.v).join(", ");

// the record book by start
const s04 = { startYear: 2004 }, s13 = { startYear: 2013 }, s27 = { startYear: 2027 }, s27t = { startYear: 2027, startDate: "2026-11-08" };
const p04 = R.realGames("pts", "r", s04), p13 = R.realGames("pts", "r", s13), p27 = R.realGames("pts", "r", s27);
ok(p04[0].v === 100 && !p04.some(x => x.v === 81 || x.v === 83), "2003-04 league: Wilt's 100 tops it, no Kobe 81, no Bam 83 (" + names(p04.slice(0, 4)) + ")");
ok(p13.some(x => x.v === 81 && /Kobe/.test(x.name)) && !p13.some(x => x.v === 83), "2012-13 league: Kobe's 81, not Bam's 83");
ok(p27[1] && p27[1].v === 83 && /Adebayo/.test(p27[1].name) && p27[1].date === "2026-03-10", "2026-27 league: Bam Adebayo's 83 (March 10, 2026) second only to Wilt");
const t13 = R.realGames("tpm", "r", s13), t27 = R.realGames("tpm", "r", s27);
ok(!t13.some(x => x.v >= 13) && t27[0].v === 14 && /Thompson/.test(t27[0].name), "threes: Klay Thompson's 14 only from 2018-19 on (" + names(t27.slice(0, 3)) + ")");
const pp27 = R.realGames("pts", "p", s27t), pp04 = R.realGames("pts", "p", s04);
ok(pp27[0].v === 63 && /Jordan/.test(pp27[0].name) && pp27.some(x => /Mitchell/.test(x.name) && x.v === 57) && !pp04.some(x => /Mitchell/.test(x.name)), "playoff records: Jordan's 63; Donovan Mitchell's 57 (2020) only for later starts");
ok(["reb", "ast", "stl", "blk"].every(k => R.realGames(k, "r", s04).length >= 4), "every stat has a real top list");
ok(R.realLabel(s04) === "2003-04" && R.realLabel({}) === "2012-13", "the label follows the start (2003-04, default 2012-13)");

// real stat titles before the start
const kobe = A.realTitles("bryanko01", 2008).map(a => a.year + " " + a.award);
ok(kobe.indexOf("2006 Scoring Champion") >= 0 && kobe.indexOf("2007 Scoring Champion") >= 0 && !kobe.some(t => /^2008|^2009/.test(t)), "Kobe's real scoring titles before 2007-08 (" + kobe.join(", ") + ")");
ok(A.realTitles("howardw01", 2008).some(a => a.award === "Rebounding Champion") === false && A.realTitles("howardw01", 2010).some(a => a.year === 2008 && a.award === "Rebounding Champion"),
  "Dwight's 2008 rebounding title shows up only for starts after it");
ok(A.realTitles("curryst01", 2017).filter(a => a.award === "Three-Point Champion").length >= 3, "Curry's three-point titles by 2016-17");

// a season in a 2007-08 league: stat titles in the save, rookies from the start file
const s = L.newLeague("BOS", { seed: 3, start: 2008 });
const rookieIds = Object.values(s.players).filter(p => p.team !== "DRAFT" && !p.retired && p.yearsPro === 0).map(p => p.id);
const CP = window.CAREER_PRIOR;
ok(rookieIds.length > 30 && rookieIds.every(id => !(CP[id] || []).length) && rookieIds.indexOf("duranke01") >= 0 && rookieIds.indexOf("anthoca01") < 0,
  "2007-08 rookies: " + rookieIds.length + ", Durant in, Carmelo Anthony out, none with an NBA season before");
let r, g = 0;
do { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); r = L.advance(s, "endPlayoffs"); } while (r.stopped !== "seasonOver" && ++g < 400);
const H = s.history.seasons[s.history.seasons.length - 1];
const roy = H.awards && H.awards.roy && s.players[H.awards.roy];
ok(roy && !(CP[roy.id] || []).length, "the save's Rookie of the Year is a real rookie (" + (roy && roy.name) + ")");
ok(H.awards && H.awards.mip && s.players[H.awards.mip], "a Most Improved Player in the first season of a 2007-08 league (" + (H.awards && s.players[H.awards.mip] ? s.players[H.awards.mip].name : "none") + ")");
const titles = H.awards && H.awards.titles;
ok(titles && ["pts", "reb", "ast", "stl", "blk", "tpm"].every(k => titles[k]), "six stat titles in the save's 2007-08 (" + (titles ? Object.keys(titles).map(k => k + " " + s.players[titles[k]].name).join(", ") : "none") + ")");
ok(titles && ["Rebounding Champion", "Assists Champion", "Three-Point Champion"].every(a => Object.values(s.players).some(p => (p.awards || []).some(x => x.year === 2008 && x.award === a))), "and they go on the players' award lists");
const sc = titles && s.players[titles.pts], line = sc && (sc.careerStats || []).find(x => x.year === 2008);
ok(line && line.g >= 58, "the scoring champion played enough games (" + (line && line.g) + ")");

// the save's own record book is separate
ok(R.singleGame(s, "r", "pts", 5).length > 0, "the save's single-game records are kept");

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exitCode = 1;
