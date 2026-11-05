// Tests for the all-time records (js/records.js) and the single-game highs the engine keeps (js/engine.js
// trackGameHighs): highs match the box scores, playoffs stay apart from the regular season, real pre-2013
// totals plus the save add up, the all-time board holds the retired greats in order, a milestone story fires
// once, and the storage stays small.
// node tools/test-records.js
const path = require("path");
global.window = global;
const R = f => require(path.join(__dirname, "..", f));
["data/league2012.js", "data/schedules.js", "data/tendencies.js", "data/tendency-history.js", "data/drafts.js", "data/targets.js", "data/cap-history.js",
  "data/coaches.js", "data/personalities.js", "data/career-prior.js", "data/alltime-prior.js", "data/awards-prior.js",
  "js/engine.js", "js/cba.js", "js/trade.js", "js/freeagency.js", "js/mood.js", "js/draft.js", "js/progression.js", "js/coaches.js",
  "js/awards.js", "js/records.js", "js/news.js", "js/league.js"].forEach(R);
const L = window.LEAGUE, E = window.ENGINE, REC = window.RECORDS, A = window.ALLTIME_PRIOR;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const reb = r => (r.oreb || 0) + (r.dreb || 0);
const val = (r, k) => (k === "reb" ? reb(r) : r[k] || 0);
const resolveAll = s => { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); };
const bytes = x => (x == null ? 0 : JSON.stringify(x).length);

// ---------- highs captured match the box scores ----------
const s = L.newLeague("MIA", { seed: 4242 });
let guard = 0;
while (s.season.order.length < 100 && guard++ < 40) { resolveAll(s); L.advance(s, { days: 1 }); }
const boxes = s.season.order.map(id => s.season.boxScores[id]);
ok(boxes.length >= 60 && boxes.every(b => b && typeof b.home === "object"), "every box score still full after " + boxes.length + " games");
const want = {}, wantTop = {};
REC.HI.forEach(k => { wantTop[k] = []; });
boxes.forEach(b => [[b.home, b.away], [b.away, b.home]].forEach(([side, opp]) => side.box.forEach(r => {
  if (!(r.min > 0)) return;
  REC.HI.forEach(k => {
    const v = val(r, k);
    if (v <= 0) return;
    const w = want[r.id] || (want[r.id] = {});
    if (!w[k] || v > w[k][0]) w[k] = [v, 1, b.date, opp.abbr, b.id]; else if (v === w[k][0]) w[k][1]++;
    wantTop[k].push(v);
  });
})));
const gh = s.season.gh.r;
let mism = 0, checked = 0;
Object.keys(want).forEach(id => REC.HI.forEach(k => { checked++; if (JSON.stringify(want[id][k] || null) !== JSON.stringify((gh[id] && gh[id][k]) || null)) mism++; }));
ok(checked > 1000 && mism === 0, `player highs match the box scores (${checked} checked, ${mism} off)`);
ok(Object.keys(gh).length === Object.keys(want).length, "a high for every player who played");
REC.HI.forEach(k => {
  const top = wantTop[k].sort((a, b) => b - a).slice(0, E.GTOP_N.r), got = (s.season.gtop.r[k] || []).map(x => x[0]);
  ok(JSON.stringify(top) === JSON.stringify(got), "season top " + k + " matches: " + got.join(","));
  (s.season.gtop.r[k] || []).forEach(x => {
    const b = s.season.boxScores[x[5]], row = b && [].concat(b.home.box, b.away.box).find(r => r.id === x[1]);
    ok(row && val(row, k) === x[0] && b.date === x[2], "top game " + k + " " + x[0] + " is in its box score");
  });
});
const career0 = REC.careerHighs(s, s.players.jamesle01);
ok(career0.r.pts && career0.r.pts[0] === gh.jamesle01.pts[0], "careerHighs reads the live season");

// ---------- playoffs stay apart ----------
guard = 0;
while (s.season.phase === "regular" && guard++ < 300) { resolveAll(s); L.advance(s, { days: 7 }); }
const regSnap = JSON.stringify(s.season.gh.r), regTop = JSON.stringify(s.season.gtop.r);
guard = 0;
while (s.season.phase === "playoffs" && !Object.keys(s.season.gh.p).length && guard++ < 40) { resolveAll(s); L.advance(s, { days: 1 }); }
guard = 0;
while (s.season.phase === "playoffs" && guard++ < 6) { resolveAll(s); L.advance(s, { days: 1 }); }
ok(Object.keys(s.season.gh.p).length > 0, "playoff highs recorded");
ok(JSON.stringify(s.season.gh.r) === regSnap && JSON.stringify(s.season.gtop.r) === regTop, "playoff games leave the regular season highs alone");
let poBad = 0;
Object.keys(s.season.gh.p).forEach(id => REC.HI.forEach(k => { const x = s.season.gh.p[id][k]; const b = x && s.season.boxScores[x[4]]; if (x && !(b && b.playoff && !b.playIn)) poBad++; }));
ok(poBad === 0, "every playoff high comes from a playoff game (" + poBad + " not)");
const midBytes = bytes(s.season.gh) + bytes(s.season.gtop);
guard = 0;
while (s.phase !== "draftLottery" && guard++ < 400) { resolveAll(s); L.advance(s, "endPlayoffs"); }
ok(s.phase === "draftLottery" && s.records && s.records.done === s.year, "season archived into state.records");
ok(!REC.archive(s), "archive runs once per season");

// ---------- prior totals plus save totals ----------
const lb = s.players.jamesle01, pr = A.active.jamesle01;
const cs = lb.careerStats.filter(r => r.year === s.year)[0];
const t = REC.totals(s, lb, "r");
ok(pr && t.pts === pr[0][1] + cs.pts && t.tpm === pr[0][6] + cs.tpm && t.g === pr[0][0] + cs.g && t.reb === pr[0][2] + cs.oreb + cs.dreb, `LeBron regular season ${t.pts} = ${pr[0][1]} real + ${cs.pts} in the save`);
const po = (lb.careerPO || [])[0];
const tp = REC.totals(s, lb, "p");
ok(po ? tp.pts === pr[1][1] + po[4] && tp.g === pr[1][0] + po[2] : tp.pts === pr[1][1], "LeBron playoffs " + tp.pts + " = real + save");
ok(pr[0][1] === 19045 && pr[0][6] === 917, "LeBron real totals before 2012-13 are 19,045 points and 917 threes");
const cH = REC.careerHighs(s, lb);
ok(cH.r.pts && lb.gh && lb.gh.r.pts && cH.r.pts[0] === lb.gh.r.pts[0], "career highs archived onto the player");

// ---------- the all-time board ----------
const bd = REC.board(s, "r", "pts");
const names = bd.slice(0, 12).map(x => x.name);
ok(bd[0].name === "Kareem Abdul-Jabbar" && bd[0].v === 38387 && bd[0].real, "Kareem leads the points board: " + names.slice(0, 4).join(", "));
ok(names.indexOf("Karl Malone") === 1 && names.indexOf("Michael Jordan") > 1 && names.includes("Wilt Chamberlain"), "Malone, Jordan, Wilt on the board");
ok(bd.every((x, i) => i === 0 || bd[i - 1].v >= x.v), "board in order");
const ids = {};
let dupes = 0;
bd.forEach(x => { if (ids[x.id]) dupes++; ids[x.id] = 1; });
ok(dupes === 0, "no player twice on the board");
const inLeague = {};
window.LEAGUE_2012.players.forEach(p => { inLeague[p.id] = 1; });
ok(A.retired.every(x => !inLeague[x[0]] && x[3] < 2013), "retired greats are none of the 2012 league and finished before 2012-13");
const kobe = REC.rankOf(s, s.players.bryanko01, "r", "pts");
ok(kobe.rank >= 2 && kobe.rank <= 6, "Kobe ranks near the top all-time: " + kobe.rank);
ok(REC.board(s, "r", "reb")[0].name === "Wilt Chamberlain" && REC.board(s, "r", "ast", { limit: 3 }).some(x => x.name === "John Stockton"), "Wilt leads rebounds, Stockton on assists");
const act = REC.board(s, "r", "pts", { activeOnly: true, limit: 5 });
ok(act.every(x => !x.real && x.p && !x.p.retired), "active leaders hold save players only");
ok(REC.realGames("pts")[0].v === 100 && REC.realGames("pts")[0].name === "Wilt Chamberlain" && REC.realGames("stl").filter(g => g.v === 11).length === 2 && REC.realGames("pts").length >= 5 && REC.realGames("pts")[1].name === "Kobe Bryant", "real single-game top 5 with ties (Wilt 100, Kobe 81)");
ok(REC.singleGame(s, "r", "pts", 10).length === 10 && REC.singleGame(s, "p", "pts", 5).length > 0, "league single-game records kept for both phases");

// ---------- storage ----------
const recB = bytes(s.records);
let ghB = 0, poB = 0;
Object.keys(s.players).forEach(id => { ghB += bytes(s.players[id].gh); poB += bytes(s.players[id].careerPO); });
console.log(`storage after one season: state.records ${recB} B, player career highs ${ghB} B, playoff rows ${poB} B; live season.gh + gtop at the end of the regular season ${midBytes} B`);
ok(recB < 12000 && ghB < 200000 && poB < 20000 && midBytes < 180000, "records stay small");

// ---------- a milestone story fires once ----------
const m = L.newLeague("CLE", { seed: 99 });
REC.prior("jamesle01").r[1] = 38300;   // LeBron 87 points behind Kareem (the first sim day is not walked by NEWS.tick)
let tries = 0;
while (!(m.season.playerStats.jamesle01 && m.season.playerStats.jamesle01.g >= 9) && tries++ < 40) { resolveAll(m); L.advance(m, { days: 1 }); }
const hits = m.news.filter(n => /LeBron James Passes Kareem Abdul-Jabbar For Most Points In NBA History/.test(n.headline));
ok(hits.length === 1, "the Kareem story fires once, got " + hits.length);
ok(m.news.filter(n => /LeBron James Passes/.test(n.headline)).length === 1, "no other passes stories once he is first");
window.NEWS.tick(m);
ok(m.news.filter(n => /Passes Kareem/.test(n.headline)).length === 1, "a second tick adds nothing");

console.log(`test-records: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
