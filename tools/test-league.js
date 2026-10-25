// Tests for the orchestrator (js/league.js) and the parts of draft, progression and coaches it relies on:
// real pick ownership and protections, the draft stopping for the user's picks, rookie contracts at 120%
// of the scale, the progression report, real retirements and cosmetic coaches.
// node tools/test-league.js
const path = require("path");
global.window = global;
const R = f => require(path.join(__dirname, "..", f));
["data/league2012.js", "data/drafts.js", "data/targets.js", "data/cap-history.js", "data/coaches.js", "data/personalities.js", "data/career-prior.js",
  "js/engine.js", "js/cba.js", "js/trade.js", "js/freeagency.js", "js/mood.js", "js/draft.js", "js/progression.js", "js/coaches.js", "js/league.js"].forEach(R);
const L = window.LEAGUE, D = window.DRAFT, P = window.PROG, C = window.CBA;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };

// Real picks: OKC holds Toronto's 2013 first, top 4 protected through 2014, then two seconds.
window.PICKS_2012 = {
  OKC: [{ year: 2013, round: 1, original: "TOR", protection: { top: 4, until: 2014, byYear: { "2013": 4, "2014": 4 }, extinguish: true, then: "if not conveyed by 2014, becomes TOR 2015 and 2016 2nd round picks" } }],
  TOR: [{ year: 2013, round: 2, original: "TOR", protection: null }],
  BKN: [{ year: 2014, round: 1, original: "BKN", protection: null, swap: "ATL" }],
  HOU: [{ year: 2014, round: 1, original: "DAL", protection: { top: 20, until: 2018 } }]
};
const s = L.newLeague("TOR", { seed: 77 });
window.PICKS_2012 = null;
const holders = (y, r, o) => Object.keys(s.teams).filter(a => s.teams[a].picks.some(pk => pk.year === y && pk.round === r && pk.original === o));
ok(holders(2013, 1, "TOR").join() === "OKC", "TOR 2013 1st is held by OKC only, got " + holders(2013, 1, "TOR"));
ok(s.teams.OKC.picks.find(pk => pk.original === "TOR").protection.top === 4, "protection kept");
ok(holders(2013, 2, "TOR").join() === "TOR", "TOR keeps its own 2013 2nd");
ok(holders(2014, 1, "DAL").join() === "HOU", "DAL 2014 1st held by HOU");
ok(holders(2019, 2, "MIA").join() === "MIA", "missing years filled with own picks");
let dup = 0;
for (let y = 2013; y < 2020; y++) for (const r of [1, 2]) for (const a in s.teams) if (holders(y, r, a).length !== 1) dup++;
ok(dup === 0, "every pick has exactly one owner (" + dup + " off)");

ok(s.teams.OKC.picks.find(pk => pk.original === "TOR").protection.extinguish === true, "extinguish kept");
ok(s.teams.BKN.picks.find(pk => pk.year === 2014 && pk.round === 1).swap === "ATL", "swap right kept");
// protection checks: byYear and range
const pn = D.protectedNow;
const prot = { top: 3, until: 2017, range: [15, 30], byYear: { 2013: 3, 2014: 2, 2016: 1 } };
ok(pn(prot, 2013, 3, 3, 1) && !pn(prot, 2013, 4, 4, 1) && pn(prot, 2013, 20, 20, 1), "range and top in 2013");
ok(!pn(prot, 2014, 3, 3, 1) && pn(prot, 2014, 2, 2, 1), "byYear top 2 in 2014");
ok(!pn(prot, 2018, 1, 1, 1), "unprotected after until");
ok(pn({ top: 55, until: 2013 }, 2013, 50, 20, 2) && !pn({ top: 55, until: 2013 }, 2013, 57, 27, 2), "second round uses overall picks");
ok(/Top 3 protected and 15-30/.test(D.protectionText(prot, 2013)), "protection text: " + D.protectionText(prot, 2013));

// Years in the league from the real careers before 2012-13
ok(s.players.irvinky01.yearsPro === 1, "Kyrie Irving is a second-year player");
ok(s.players.bryanko01.yearsPro === 16, "Kobe Bryant has 16 seasons");
const ad = s.players.davisan02; ok(!ad || ad.yearsPro === 0, "Anthony Davis is a rookie");

// Coaches: names for display, no gameplay effect
ok(!!s.teams.SAS.coach && s.coaches && s.coaches[s.teams.SAS.coach].name === "Gregg Popovich", "coach names kept for display");
const eff = window.COACH.effect(s, "SAS");
ok(eff.offense === 0 && eff.defense === 0 && eff.development === 0 && eff.morale === 0, "coach effect is neutral");
ok(window.MOOD.coachRating(s, "SAS") == null, "mood sees no coach rating");

// Make Toronto the worst team so its pick lands in the top 4 and stays home
Object.keys(s.season.standings).forEach((a, i) => { const st = s.season.standings[a]; st.w = 20 + i; st.l = 82 - st.w; });
s.season.standings.TOR.w = 5; s.season.standings.TOR.l = 77;
s.season.phase = "done"; s.phase = "draftLottery";
L.nextPhase(s);
ok(s.phase === "draft" && s.draft && Array.isArray(s.draft.order), "lottery done, draft order ready");
const torSlot = s.draft.order.find(x => x.round === 1 && x.original === "TOR");
ok(torSlot.overall <= 4 && torSlot.team === "TOR" && torSlot.protectedFor === "OKC", "protected pick stays with TOR at #" + torSlot.overall);
const rolled = s.teams.OKC.picks.find(pk => pk.original === "TOR" && pk.round === 1);
ok(rolled && rolled.year === 2014 && rolled.protection && rolled.protection.top === 4, "pick rolls to 2014, still top 4 protected");
ok(holders(2014, 1, "TOR").join() === "OKC", "TOR no longer also owns its 2014 1st");

// The draft stops on the user's pick
let r = L.nextPhase(s);
ok(r.stopped === "userPick" && s.phase === "draft" && D.current(s).team === "TOR", "draft stops for the user's pick");
ok(s.draft.userOnClock === D.current(s).overall, "draft page flag set");
ok(L.userPicksLeft(s).length >= 1, "user picks left listed");
const before = D.current(s).overall;
const prospect = Object.values(s.players).filter(p => p.team === "DRAFT" && +p.draftYear === 2013 && !p.undrafted).sort((a, b) => b.ovr - a.ovr)[0];
ok(D.pick(s, "TOR", prospect.id).ok, "user makes his pick");
r = L.nextPhase(s);
ok(r.stopped === "userPick" ? D.current(s).overall > before : s.phase === "resign", "the draft moves on after the user's pick");
if (r.stopped === "userPick") { r = L.nextPhase(s, { auto: true }); }
ok(s.phase === "resign" && s.draft.done, "auto finishes the draft after confirmation");
ok(Object.values(s.players).filter(p => p.draft && p.draft.year === 2013 && p.team === "TOR").length === 2, "TOR drafted two players");

// Rookie contracts at 120% of the scale
// the highest pick who signs now (a pick who sits out his first season, like Nerlens Noel, signs later)
const first = Object.values(s.players).filter(p => p.draft && p.draft.year === 2013 && p.draft.round === 1 && !p.stashedUntil)
  .sort((a, b) => a.draft.pick - b.draft.pick)[0];
const sc = C.rookieScale(first ? first.draft.pick : 1, 2014);
ok(first && first.contract.salaries[0].year === 2014 && first.contract.salaries[0].amount === Math.round(sc.salaries[0] * 1.2), "top signed pick (#" + (first && first.draft.pick) + ") gets 120% of the scale");
ok(first && first.contract.rookie === true, "rookie flag");

// Re-signing window opens in the resign phase
ok(s.fa && s.fa.stage === "resign", "re-signing window open during the resign phase");
L.nextPhase(s);
ok(s.phase === "freeAgency", "free agency next");
L.nextPhase(s, { auto: true });   // the user chose to sim past free agency: no popups, the front office decides
ok(s.phase === "training", "training camp after free agency");
const rep = s.progressReport;
ok(rep && rep.year === 2014 && Object.keys(rep.players).length > 300, "progression report stored");
ok(rep && Object.values(rep.players).every(v => v.length === 3), "report holds old, new and age only (no potential)");
L.nextPhase(s, { auto: true });
ok(s.phase === "regular" && s.year === 2014, "new season starts");
const rr = L.rosterRules(2014);
const sizes = Object.keys(s.teams).map(a => L.rosterOf(s, a, 2014).std.length);
ok(sizes.every(n => n >= rr.min && n <= rr.max), "13 to 15 standard players everywhere: " + sizes.join(" "));

// Second year: the 2013 rollover (top 4 protected through 2014) ends with two second-rounders if protected again
Object.keys(s.season.standings).forEach((a, i) => { const st = s.season.standings[a]; st.w = 20 + i; st.l = 82 - st.w; });
s.season.standings.TOR.w = 5; s.season.standings.TOR.l = 77;
s.season.phase = "done"; s.phase = "draftLottery";
L.nextPhase(s);
ok(holders(2014, 1, "TOR").length === 0, "last protected year: the pick is extinguished");
ok(s.draft.order.find(x => x.round === 1 && x.original === "TOR").team === "TOR", "TOR keeps its 2014 first");
// the swap: ATL takes the better of its own and BKN's 2014 firsts
const atl = s.draft.order.find(x => x.round === 1 && x.original === "ATL"), bkn = s.draft.order.find(x => x.round === 1 && x.original === "BKN");
const atlSlot = Math.min(atl.overall, bkn.overall);
ok(s.draft.order.find(x => x.round === 1 && x.overall === atlSlot).team === "ATL" && s.draft.order.find(x => x.round === 1 && x.overall === Math.max(atl.overall, bkn.overall)).team === "BKN", "ATL gets the better pick of the swap");
const seconds = s.teams.OKC.picks.filter(pk => pk.original === "TOR" && pk.round === 2).map(pk => pk.year).sort();
ok(seconds.join() === "2015,2016", "OKC gets TOR's 2015 and 2016 seconds, got " + seconds);

// Real retirements: Bynum's last season was 2013-14
const b = s.players.bynuman01;
ok(b && (b.retired || window.TARGETS.bynuman01.retire === 2015), "Bynum data");
const s2 = L.newLeague("OKC", { seed: 5 });
s2.phase = "freeAgency"; P.offseason(s2); s2.year = 2014; s2.phase = "regular";
const by = s2.players.bynuman01;
let retiredIn = null;
for (let seed = 1; seed <= 20; seed++) {
  const p = Object.assign({}, by, { retired: false, team: "IND", fate: "real", ovr: P.targetFor("bynuman01", 2014) });
  const ch = P.retireChance(p, 2014, false);
  if (seed === 1) retiredIn = ch;
}
ok(retiredIn >= 0.9, "Bynum retires after 2013-14 with chance " + retiredIn);
ok(P.retireChance(Object.assign({}, by, { fate: "real", ovr: 86 }), 2015, false) === 1, "nobody plays two seasons past his real retirement (injury-ended career)");

// LeBron follows his real arc closely
let maxGap = 0;
const s3 = L.newLeague("OKC", { seed: 9 });
for (let y = 2013; y < 2022; y++) {
  s3.phase = "freeAgency"; P.offseason(s3); s3.year = y + 1; s3.phase = "regular";
  const lb = s3.players.jamesle01; maxGap = Math.max(maxGap, Math.abs(lb.ovr - P.targetFor("jamesle01", y + 1)));
}
ok(maxGap <= 3, "LeBron within 3 of his real rating every year, max gap " + maxGap);


// Injury fates: once per save, about half healthy; healthy Bynum keeps playing as an 80+ center, healthy Rose stays 85+
let healthyBy = 0, healthyRose = 0, okBy = true, okRose = true;
for (let seed = 1; seed <= 10; seed++) {
  const sx = L.newLeague("OKC", { seed: 1000 + seed });
  const again = L.newLeague("OKC", { seed: 1000 + seed });
  ok(sx.players.rosede01.fate === again.players.rosede01.fate, "fate is fixed by the seed");
  if (sx.players.bynuman01.fate === "healthy") {
    healthyBy++;
    const t = P.targetsOf(sx, "bynuman01");
    if (!(t.retire > 2016 && t[2016] >= 80 && t[2017] >= 80)) okBy = false;
    if (sx.players.bynuman01.injury) okBy = false;
  }
  if (sx.players.rosede01.fate === "healthy") {
    healthyRose++;
    const t = P.targetsOf(sx, "rosede01");
    if (![2013, 2014, 2015, 2016, 2017].every(y => t[y] >= 85) || (t.out && t.out.indexOf(2013) >= 0)) okRose = false;
  }
}
ok(healthyBy >= 2 && healthyBy <= 8, "Bynum healthy in about half the saves (" + healthyBy + "/10)");
ok(healthyRose >= 2 && healthyRose <= 8, "Rose healthy in about half the saves (" + healthyRose + "/10)");
ok(okBy, "healthy Bynum: 80+ after 2015 and no early retirement");
ok(okRose, "healthy Rose: 85+ through 2017 and plays 2012-13");
// variety: drift is stored on the player, never in the progression report
const sv = L.newLeague("OKC", { seed: 4242 });
sv.phase = "freeAgency"; P.offseason(sv);
ok(sv.players.jamesle01.prog && typeof sv.players.jamesle01.prog.drift === "number", "history players carry a personal drift");
ok(Object.values(sv.progressReport.players).every(v => v.length === 3), "report still old, new and age only");
console.log(pass + " passed, " + fail + " failed");
process.exitCode = fail ? 1 : 0;
