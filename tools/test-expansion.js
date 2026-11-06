// Expansion to 32 teams (js/expansion.js): node tools/test-expansion.js
// Announces the expansion during the 2012-13 season (it waits for the draft), then plays the first
// 32-team season and the next draft, and checks teams, conferences, schedule, playoffs and picks.
const fs = require("fs");
global.window = global;
console.warn = () => {};
const files = ["data/league2012.js", "data/drafts.js", "data/draft-prior.js", "data/targets.js", "data/cap-history.js", "data/coaches.js", "data/coach-history.js", "data/gleague.js",
  "data/history.js", "data/personalities.js", "data/logos.js", "data/world-events.js", "data/career-prior.js", "data/picks-2012.js", "data/awards-prior.js", "data/schedules.js", "data/tendencies.js", "data/tendency-history.js", "data/defense-history.js",
  "js/engine.js", "js/cba.js", "js/trade.js", "js/freeagency.js", "js/mood.js", "js/draft.js", "js/draft-gen.js", "js/rookies.js", "js/progression.js", "js/coaches.js", "js/gleague.js", "js/awards.js",
  "js/news.js", "js/league.js", "js/expansion.js", "js/allstar.js", "js/positions.js"];
for (const f of files) if (fs.existsSync(f)) require("../" + f);
const L = window.LEAGUE, D = window.DRAFT, X = window.EXPANSION;
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("  ok   " + msg); } else { fail++; console.log("  FAIL " + msg); } };

function seasonToEnd(s) {
  let r, g = 0;
  do { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); r = L.advance(s, "endPlayoffs"); } while (r.stopped !== "seasonOver" && ++g < 400);
}
function offseasonUntil(s, phase) {
  let steps = 0;
  while (s.phase !== phase && steps++ < 120) {
    s.events.forEach(e => (e.resolved = true)); L.clearResolved(s);
    const r = L.advance(s, "nextPhase");
    if (r && r.stopped === "userPick") {
      const pool = D.pool(s, s.year).map(id => s.players[id]).sort((a, b) => (a.undrafted - b.undrafted) || b.ovr - a.ovr);
      D.pick(s, s.userTeam, pool[0].id);
    }
  }
}
const confCount = s => { const c = {}; Object.values(s.teams).forEach(t => { c[t.conf] = (c[t.conf] || 0) + 1; }); return c; };

const s = L.newLeague("OKC", { seed: 77 });
const before = Object.keys(s.players).filter(id => s.teams[s.players[id].team]).length;
const r0 = X.addTeams(s);
ok(r0.ok && r0.pending === 2014, "announced during the season: pending for 2013-14 (" + JSON.stringify(r0) + ")");
ok(Object.keys(s.teams).length === 30, "still 30 teams during the season");

seasonToEnd(s);
offseasonUntil(s, "resign");
ok(X.isExpanded(s), "the expansion happens right after the 2013 draft");
ok(Object.keys(s.teams).length === 32, "32 teams (" + Object.keys(s.teams).length + ")");
const cc = confCount(s);
ok(cc.East === 16 && cc.West === 16, "16 teams in each conference (" + JSON.stringify(cc) + ")");
ok(s.teams.MEM.conf === "East" && s.teams.PHX.div === "Southwest" && s.teams.SEA.div === "Northwest" && s.teams.LVG.div === "Pacific", "realignment: MEM East, PHX Southwest, SEA Northwest, LVG Pacific");
const roster = a => Object.values(s.players).filter(p => !p.retired && p.team === a);
const taken = a => (s.expansion.draft || []).filter(x => x.to === a).length;
const rightsOf = a => Object.keys(s.fa.rights || {}).filter(id => s.fa.rights[id].team === a && s.players[id].team === "FA").length;
ok(taken("SEA") === 14 && taken("LVG") === 14, "each new team takes 14 players (" + taken("SEA") + ", " + taken("LVG") + "): under contract " + roster("SEA").length + " and " + roster("LVG").length + ", free agent rights " + rightsOf("SEA") + " and " + rightsOf("LVG"));
const fromCount = {};
(s.expansion.draft || []).forEach(x => { fromCount[x.from] = (fromCount[x.from] || 0) + 1; });
ok(Object.values(fromCount).every(n => n <= 1), "no team loses more than one player");
ok((s.expansion.draft || []).every(x => !(s.players[x.id].draft && +s.players[x.id].draft.year === 2013)), "this summer's draft picks are exempt");
ok(s.teams.SEA.coach && s.teams.LVG.coach, "both new teams have a coach");
ok([2014, 2015, 2016].every(y => [1, 2].every(rd => s.teams.SEA.picks.some(pk => pk.year === y && pk.round === rd && pk.original === "SEA"))), "Seattle owns its own picks from 2014");
const again = X.addTeams(s);
ok(again.already && Object.keys(s.teams).length === 32, "calling again does nothing");
ok(s.news.some(n => /expands to 32/.test(n.headline)), "news: the league expands");

offseasonUntil(s, "regular");
ok(s.year === 2014 && s.season.teams.length === 32, "the 2013-14 season has 32 teams");
const games = {};
s.season.days.forEach(d => d.games.forEach(g => { games[g.home] = (games[g.home] || 0) + 1; games[g.away] = (games[g.away] || 0) + 1; }));
const counts = Object.values(games);
ok(counts.length === 32 && counts.every(n => n === 82), "82 games for every team (" + Math.min(...counts) + " to " + Math.max(...counts) + ")");
const homes = {};
s.season.days.forEach(d => d.games.forEach(g => { homes[g.home] = (homes[g.home] || 0) + 1; }));
ok(Object.values(homes).every(n => n === 41), "41 home games each");
ok(s.season.days.every(d => d.games.length <= 16), "never more than 16 games a day");
const rr = L.rosterRules(s.year), bad = [];
for (const a in s.teams) { const ro = L.rosterOf(s, a, s.year); if (ro.std.length < rr.min || ro.std.length > rr.max) bad.push(a + " " + ro.std.length); }
ok(!bad.length, "rosters 13 to 15 before the season (" + bad.join(", ") + ")");

seasonToEnd(s);
const h = s.history.seasons[s.history.seasons.length - 1];
ok(h && h.champion, "the 32-team playoffs finish: champion " + (h && h.champion));
const st = s.season.standings;
console.log("  (first season: SEA " + st.SEA.w + "-" + st.SEA.l + ", LVG " + st.LVG.w + "-" + st.LVG.l + "; roster OVR SEA " + roster("SEA").map(p => p.ovr).sort((x, y) => y - x).slice(0, 8).join(" ") + ")");
ok(Object.keys(st).length === 32 && Object.values(st).every(x => x.w + x.l === 82), "32 teams in the standings, 82 games each");
offseasonUntil(s, "draft");
const order = s.draft && s.draft.order ? s.draft.order : D.order(s, s.year);
ok(order.length === 64, "the 2014 draft has 64 picks (" + order.length + ")");
ok(order.filter(sl => sl.round === 1).length === 32, "32 picks in the first round");
const lot = s.draft.lottery;
ok(lot && ["SEA", "LVG"].every(a => lot.order.indexOf(a) < 0 || lot.order.indexOf(a) >= 4), "neither new team picks higher than fifth in its first draft (" + (lot ? lot.order.slice(0, 6).join(" ") : "") + ")");
offseasonUntil(s, "regular");
ok(s.year === 2015 && Object.keys(s.teams).length === 32, "the second 32-team season starts");
const bad2 = [];
for (const a in s.teams) { const ro = L.rosterOf(s, a, s.year); if (ro.std.length < rr.min || ro.std.length > rr.max) bad2.push(a + " " + ro.std.length); }
ok(!bad2.length, "rosters legal after the next offseason (" + bad2.join(", ") + ")");
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
