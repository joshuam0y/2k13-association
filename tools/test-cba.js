// 2K13 Association: independent checker for js/cba.js and data/cap-history.js.
// Run: node tools/test-cba.js
// Every expected number below is worked out here with its own arithmetic or typed in from the sources
// (NBA.com cap releases, Larry Coon's CBA FAQ, Hoops Rumors). Nothing calls CBA helpers to build an
// expected value; CBA is only called to get the value being checked.
"use strict";
var path = require("path");
var ROOT = path.join(__dirname, "..");
global.window = global;
require(path.join(ROOT, "data/league2012.js"));
require(path.join(ROOT, "data/cap-history.js"));
var CBA = require(path.join(ROOT, "js/cba.js"));

var passes = 0, fails = 0;
function ok(cond, msg) {
  if (cond) { passes++; console.log("  ok    " + msg); }
  else { fails++; console.log("  FAIL  " + msg); }
}
function eq(got, want, msg) { ok(got === want, msg + " (got " + got + ", want " + want + ")"); }
function clone(x) { return JSON.parse(JSON.stringify(x)); }

// ---------------------------------------------------------------------------
// Test league: real 2012-13 players, contract built from salary and contractEnd
// ---------------------------------------------------------------------------
function buildState() {
  var L = window.LEAGUE_2012, year = L.season;
  var st = { version: 1, year: year, phase: "regular", userTeam: "OKC", day: 0, rngSeed: 1,
    players: {}, teams: {}, season: null, transactions: [], news: [], events: [], settings: {} };
  L.players.forEach(function (p0) {
    var p = clone(p0);
    if (p.team === "FA") p.contract = null;
    else {
      var sal = [];
      for (var y = year; y <= Math.max(year, p.contractEnd); y++) sal.push({ year: y, amount: p.salary });
      p.contract = { salaries: sal, option: null, rookie: false, twoWay: false, signedYear: year - 1 };
    }
    p.yearsPro = Math.max(0, p.age - 21); p.yearsWithTeam = 1; p.stashedUntil = null; p.retired = false;
    st.players[p.id] = p;
  });
  L.teams.forEach(function (t) {
    var tt = clone(t), picks = [];
    for (var y = 2013; y <= 2019; y++) { picks.push({ year: y, round: 1, original: t.abbr, protection: null }); picks.push({ year: y, round: 2, original: t.abbr, protection: null }); }
    tt.picks = picks; st.teams[t.abbr] = tt;
  });
  st.season = { year: year, day: 30, days: [], standings: {} };
  for (var i = 0; i < 170; i++) {
    var d = new Date(Date.UTC(2012, 9, 30 + i));
    st.season.days.push({ date: d.toISOString().slice(0, 10), games: [] });
  }
  return st;
}
function teamOf(st, abbr) { return Object.keys(st.players).map(function (k) { return st.players[k]; }).filter(function (p) { return p.team === abbr; }); }
function mySalary(p, y) { var s = (p.contract && p.contract.salaries || []).filter(function (x) { return x.year === y; })[0]; return s ? s.amount : 0; }
function myPayroll(st, abbr, y) { return teamOf(st, abbr).reduce(function (s, p) { return s + (p.contract && !p.contract.twoWay ? mySalary(p, y) : 0); }, 0); }
function setSalary(p, amount) { p.contract.salaries.forEach(function (s) { s.amount = amount; }); }
function trade2(a, b, aIds, bIds) { var t = { teams: [a, b], give: {} }; t.give[a] = { players: aIds, picks: [] }; t.give[b] = { players: bIds, picks: [] }; return t; }
// shift one filler player's salary so the team's payroll is exactly `target`
function forcePayroll(st, abbr, target, keepIds) {
  var y = st.year, filler = teamOf(st, abbr).filter(function (p) { return keepIds.indexOf(p.id) < 0; })[0];
  var cur = myPayroll(st, abbr, y), need = mySalary(filler, y) + (target - cur);
  if (need < 0) {
    // too much salary: zero out other players first
    teamOf(st, abbr).forEach(function (p) { if (keepIds.indexOf(p.id) < 0 && p !== filler) setSalary(p, 500000); });
    cur = myPayroll(st, abbr, y); need = mySalary(filler, y) + (target - cur);
  }
  setSalary(filler, need);
  return myPayroll(st, abbr, y);
}

// ---------------------------------------------------------------------------
console.log("Cap and tax figures");
var r13 = CBA.rules(2013), r17 = CBA.rules(2017), r18 = CBA.rules(2018), r24 = CBA.rules(2024), r27 = CBA.rules(2027);
eq(r13.cap, 58044000, "2012-13 cap");
eq(r13.tax, 70307000, "2012-13 tax line");
eq(r13.apron, 70307000 + 4000000, "2012-13 apron is tax + $4M");
eq(r13.minPayroll, Math.round(58044000 * 0.85 / 1000) * 1000, "2012-13 minimum payroll is 85% of the cap");
eq(r13.mle, 5000000, "2012-13 non-taxpayer MLE");
eq(r13.bae, 1957000, "2012-13 bi-annual");
eq(r17.cap, 94143000, "2016-17 cap");
eq(r17.tax, 113287000, "2016-17 tax line");
eq(r17.apron, 113287000 + 4000000, "2016-17 apron is tax + $4M");
eq(r17.minPayroll, Math.round(94143000 * 0.90 / 1000) * 1000, "2016-17 minimum payroll is 90% of the cap");
eq(r18.apron, 119266000 + 6000000, "2017-18 apron is tax + $6M");
eq(r24.cap, 136021000, "2023-24 cap");
eq(r24.tax, 165294000, "2023-24 tax line");
eq(r24.apron, 172346000, "2023-24 first apron");
eq(r24.apron2, 182794000, "2023-24 second apron");
eq(r24.mle, 12405000, "2023-24 non-taxpayer MLE");
eq(CBA.rules(2026).cap, 154647000, "2025-26 cap");
eq(r27.cap, 164961000, "2026-27 cap");
eq(r27.apron2, 221686000, "2026-27 second apron");
eq(CBA.rules(2028).cap, Math.round(164961000 * 1.045 / 1000) * 1000, "2027-28 projected cap (+4.5%)");
eq(CBA.rules(2030).tax, Math.round(200428000 * Math.pow(1.045, 3) / 1000) * 1000, "2029-30 projected tax (+4.5% a year)");
eq(CBA.rules(2021).cap, CBA.rules(2020).cap, "2020-21 cap held flat");
ok(CBA.rules(2017).cap / CBA.rules(2016).cap > 1.34, "2016 cap jump (+34%)");
var allYears = true;
for (var y = 2013; y <= 2027; y++) { var rr = CBA.rules(y); if (!(rr.cap > 0 && rr.tax > rr.cap && rr.apron > rr.tax && rr.minPayroll < rr.cap && rr.mle > 0 && rr.bae > 0 && !rr.projected)) allYears = false; }
ok(allYears, "every season 2013 to 2027 has real cap < tax < apron figures");
var floor90 = true;
for (var y2 = 2014; y2 <= 2027; y2++) if (Math.abs(CBA.rules(y2).minPayroll - CBA.rules(y2).cap * 0.9) > 1000) floor90 = false;
ok(floor90, "minimum payroll is 90% of the cap (within $1,000 of rounding) every season 2014 to 2027");

console.log("\nMinimum salaries");
eq(r13.minSalary(0), 473604, "2012-13 rookie minimum");
eq(r13.minSalary(10), 1352181, "2012-13 10+ year minimum");
eq(r13.minSalary(14), 1352181, "14 years uses the 10+ step");
eq(r18.minSalary(0), 815615, "2017-18 rookie minimum");
eq(r18.minSalary(10), 2328652, "2017-18 10+ year minimum");
eq(CBA.rules(2026).minSalary(0), 1272870, "2025-26 rookie minimum");
eq(r27.minSalary(10), 3876529, "2026-27 10+ year minimum");
var shape19 = Math.round(1312611 * 838464 / 815615);
ok(Math.abs(CBA.rules(2019).minSalary(1) - shape19) <= 1, "2018-19 one-year minimum follows the cap-indexed table");

console.log("\nMaximum salaries");
eq(r13.maxSalary(3), 13668750, "2012-13 max, 3 years of service (2011 CBA BRI-based 25%)");
eq(r13.maxSalary(11), 19136250, "2012-13 max, 11 years of service (35%)");
eq(r13.maxSalary(8), 16402500, "2012-13 max, 8 years of service (30%)");
eq(r18.maxSalary(3), 99093000 * 25 / 100, "2017-18 max, 3 years = 25% of $99.093M");
eq(r18.maxSalary(11), Math.round(99093000 * 35 / 100), "2017-18 max, 11 years = 35% of $99.093M");
eq(r18.maxSalary(8, { supermax: true }), Math.round(99093000 * 0.35), "2017-18 supermax for an 8-year player");
eq(r17.maxSalary(8, { supermax: true }), 26540100, "no supermax before 2017-18");
eq(r13.maxSalary(11, { prevSalary: 25000000 }), 26250000, "max is at least 105% of last salary");

console.log("\nRookie scale");
var rs1 = CBA.rookieScale(1, 2013), rs30 = CBA.rookieScale(30, 2013);
eq(rs1.amount, 4286900, "2012-13 pick 1 scale");
eq(rs1.salaries[1], 4479800, "pick 1 year 2");
eq(rs1.salaries[2], 4672700, "pick 1 year 3 (team option)");
eq(rs1.salaries[3], Math.round(4672700 * 1.261), "pick 1 year 4 = year 3 + 26.1%");
eq(rs30.amount, 850800, "2012-13 pick 30 scale");
eq(rs30.salaries[3], Math.round(927400 * 1.805), "pick 30 year 4 = year 3 + 80.5%");
eq(rs1.guaranteedYears, 2, "2 guaranteed years");
ok(rs1.teamOptionYears[0] === 2015 && rs1.teamOptionYears[1] === 2016, "team options in years 3 and 4");
eq(r13.rookieScale(1), 4286900, "rules(2013).rookieScale(1)");
var rc = CBA.rookieContract(1, 2013);
eq(rc.salaries[0].amount, Math.round(4286900 * 1.2), "rookie contract at 120% (Anthony Davis got $5,144,280)");
eq(window.LEAGUE_2012.players.filter(function (p) { return p.name === "Anthony Davis"; })[0].salary, 5144280, "data file: Davis 2012-13 salary is 120% of pick 1");
var want26 = Math.round(4286900 * 154647000 / 58044000 / 100) * 100;
eq(CBA.rookieScale(1, 2026).amount, want26, "2025-26 pick 1 scale grows with the cap");

console.log("\nEra flags and lottery");
ok(!CBA.rules(2017).twoWay && CBA.rules(2018).twoWay, "two-way contracts from 2017-18");
ok(CBA.rules(2023).maxTwoWay === 2 && CBA.rules(2024).maxTwoWay === 3 && CBA.rules(2016).maxTwoWay === 0, "two-way slots 0, then 2, then 3 from 2023-24");
ok(!CBA.rules(2020).playIn && CBA.rules(2021).playIn, "play-in from 2020-21");
ok(!CBA.rules(2023).nbaCup && CBA.rules(2024).nbaCup, "NBA Cup from 2023-24");
ok(CBA.rules(2013).seasonGames === 82 && CBA.rules(2021).seasonGames === 72 && CBA.rules(2020).seasonGames === 72 && CBA.rules(2022).seasonGames === 82, "82 games, except 2019-20 (bubble, ~72) and 2020-21 (72)");
ok(!!CBA.rules(2020).seasonNote, "2019-20 has a note");
function sum(a) { return Math.round(a.reduce(function (s, x) { return s + x; }, 0) * 10) / 10; }
var lo18 = CBA.rules(2018).lotteryOdds, lo19 = CBA.rules(2019).lotteryOdds;
ok(lo18[0] === 25 && lo18[1] === 19.9 && lo18[2] === 15.6 && lo18.length === 14 && sum(lo18) === 100, "2013 to 2018 odds 25, 19.9, 15.6 ... (sum 100)");
ok(lo19[0] === 14 && lo19[2] === 14 && lo19[3] === 12.5 && sum(lo19) === 100, "2019 reform odds 14, 14, 14, 12.5 ... (sum 100)");
ok(CBA.rules(2018).lotteryDraws === 3 && CBA.rules(2019).lotteryDraws === 4, "3 picks drawn, 4 from 2019");

console.log("\nPayroll");
var st = buildState();
var okc = teamOf(st, "OKC"), okcSum = 0;
okc.forEach(function (p) { okcSum += p.salary; });
eq(CBA.payroll(st, "OKC", 2013), okcSum, "OKC 2012-13 payroll = sum of real salaries");
eq(CBA.capSpace(st, "OKC", 2013), Math.max(0, 58044000 - okcSum), "OKC cap space");
var okc14 = 0; okc.forEach(function (p) { if (p.contractEnd >= 2014) okc14 += p.salary; });
eq(CBA.payroll(st, "OKC", 2014), okc14, "OKC 2013-14 payroll counts only contracts running through 2014");
var st2 = clone(st); st2.teams.OKC.deadMoney = [{ year: 2013, amount: 1000000, id: "x" }];
eq(CBA.payroll(st2, "OKC", 2013), okcSum + 1000000, "dead money counts");
var harden = st2.players.hardeja01; harden.contract.twoWay = true;
eq(CBA.payroll(st2, "OKC", 2013), okcSum + 1000000 - 5820417, "two-way salary does not count");

console.log("\nTrade salary matching, 2012-13 (2011 CBA)");
// A taxpaying team (over the tax after the trade) sending $10M: 125% + $100K = $12.6M
var t = buildState(), A = "MIA", B = "CHA";
var outP = teamOf(t, A)[0], inP = teamOf(t, B)[0];
setSalary(outP, 10000000); setSalary(inP, 12600000);
forcePayroll(t, A, 80000000, [outP.id]);
var allowTax = 10000000 * 125 / 100 + 100000;
eq(allowTax, 12600000, "independent: 125% of $10M + $100K = $12.6M");
var v = CBA.validateTrade(t, trade2(A, B, [outP.id], [inP.id]));
ok(v.ok, "taxpaying team sends $10M, takes back $12.6M: allowed" + (v.ok ? "" : " " + v.reasons.join(" ")));
setSalary(inP, 12700000);
v = CBA.validateTrade(t, trade2(A, B, [outP.id], [inP.id]));
ok(!v.ok, "taxpaying team sends $10M, takes back $12.7M: blocked");
ok(v.reasons.some(function (s) { return /125%/.test(s); }), "reason names the 125% + $100,000 rule");
// Over the cap but under the tax: real 2011 CBA bands ($9.8M to $19.6M outgoing: outgoing + $5M)
var t2 = buildState(), A2 = "HOU", B2 = "CHA";
var o2 = teamOf(t2, A2)[0], i2 = teamOf(t2, B2)[0];
setSalary(o2, 10000000); setSalary(i2, 15000000);
forcePayroll(t2, A2, 60000000, [o2.id]);
ok(CBA.validateTrade(t2, trade2(A2, B2, [o2.id], [i2.id])).ok, "non-taxpayer over the cap: $10M out, $15M back (outgoing + $5M) allowed");
setSalary(i2, 15000001);
ok(!CBA.validateTrade(t2, trade2(A2, B2, [o2.id], [i2.id])).ok, "non-taxpayer: $15,000,001 back blocked");
setSalary(o2, 4000000); setSalary(i2, 4000000 * 1.5 + 100000);
forcePayroll(t2, A2, 60000000, [o2.id]);
ok(CBA.validateTrade(t2, trade2(A2, B2, [o2.id], [i2.id])).ok, "non-taxpayer: $4M out, $6.1M back (150% + $100K) allowed");
// Under the cap: $5M of room absorbs a $5M player for nothing but a pick
var t3 = buildState(), A3 = "CHA", B3 = "LAL";
var i3 = teamOf(t3, B3)[0];
setSalary(i3, 5000000);
var paid = forcePayroll(t3, A3, 58044000 - 5000000, []);
eq(58044000 - paid, 5000000, "independent: CHA has exactly $5M of room");
var tr3 = { teams: [A3, B3], give: {} };
tr3.give[A3] = { players: [], picks: [{ year: 2014, round: 2, original: A3 }] };
tr3.give[B3] = { players: [i3.id], picks: [] };
v = CBA.validateTrade(t3, tr3);
ok(v.ok, "team with $5M space absorbs a $5M player" + (v.ok ? "" : " " + v.reasons.join(" ")));
setSalary(i3, 5200000);
ok(!CBA.validateTrade(t3, tr3).ok, "the same team cannot absorb $5.2M for nothing");
// pick ownership
var tr4 = { teams: [A3, B3], give: {} };
tr4.give[A3] = { players: [], picks: [{ year: 2014, round: 1, original: "OKC" }] };
tr4.give[B3] = { players: [], picks: [{ year: 2015, round: 2, original: B3 }] };
ok(!CBA.validateTrade(t3, tr4).ok, "cannot trade a pick the team does not own");

console.log("\nTrade salary matching, later eras");
var t5 = buildState(); t5.year = 2018;
Object.keys(t5.players).forEach(function (k) { var p = t5.players[k]; if (p.contract) p.contract.salaries.forEach(function (s) { s.year += 5; }); });
var A5 = "SAS", B5 = "DEN", o5 = teamOf(t5, A5)[0], i5 = teamOf(t5, B5)[0];
function setSal18(p, amt) { p.contract.salaries.forEach(function (s) { s.amount = amt; }); }
setSal18(o5, 5000000); setSal18(i5, 5000000 * 1.75 + 100000);
var pay5 = 0; teamOf(t5, A5).forEach(function (p) { pay5 += mySalary(p, 2018); });
var filler5 = teamOf(t5, A5)[1]; setSal18(filler5, mySalary(filler5, 2018) + (105000000 - pay5));
ok(CBA.validateTrade(t5, trade2(A5, B5, [o5.id], [i5.id])).ok, "2017-18 non-taxpayer: $5M out, $8.85M back (175% + $100K) allowed");
setSal18(i5, 5000000 * 1.75 + 100001);
ok(!CBA.validateTrade(t5, trade2(A5, B5, [o5.id], [i5.id])).ok, "2017-18: $8,850,001 back blocked");
// 2024-25: over the first apron after the trade, may not take back more than sent
var t6 = clone(t5); t6.year = 2025;
Object.keys(t6.players).forEach(function (k) { var p = t6.players[k]; if (p.contract) p.contract.salaries.forEach(function (s) { s.year += 7; }); });
var o6 = t6.players[o5.id], i6 = t6.players[i5.id], f6 = t6.players[filler5.id];
setSal18(o6, 10000000); setSal18(i6, 10100000);
var pay6 = 0; teamOf(t6, A5).forEach(function (p) { pay6 += mySalary(p, 2025); });
setSal18(f6, mySalary(f6, 2025) + (185000000 - pay6));
ok(!CBA.validateTrade(t6, trade2(A5, B5, [o6.id], [i6.id])).ok, "2024-25 first-apron team: $10M out, $10.1M back blocked");
setSal18(i6, 10000000);
ok(CBA.validateTrade(t6, trade2(A5, B5, [o6.id], [i6.id])).ok, "2024-25 first-apron team: $10M out, $10M back allowed");
// second apron: cannot aggregate
var o6b = teamOf(t6, A5)[2]; setSal18(o6b, 6000000); setSal18(o6, 6000000); setSal18(i6, 11000000);
pay6 = 0; teamOf(t6, A5).forEach(function (p) { pay6 += mySalary(p, 2025); });
setSal18(f6, mySalary(f6, 2025) + (200000000 - pay6));
var ag = CBA.validateTrade(t6, trade2(A5, B5, [o6.id, o6b.id], [i6.id]));
ok(!ag.ok && ag.reasons.some(function (s) { return /second apron/.test(s); }), "2024-25 second-apron team cannot combine two $6M players for $11M");
// 2025-26 under the apron: 200% + $250K for small salaries
var t7 = clone(t6); t7.year = 2026;
Object.keys(t7.players).forEach(function (k) { var p = t7.players[k]; if (p.contract) p.contract.salaries.forEach(function (s) { s.year += 1; }); });
var o7 = t7.players[o5.id], i7 = t7.players[i5.id], f7 = t7.players[filler5.id];
setSal18(o7, 3000000); setSal18(i7, 6250000); setSal18(t7.players[o6b.id], 1000000);
var pay7 = 0; teamOf(t7, A5).forEach(function (p) { pay7 += mySalary(p, 2026); });
setSal18(f7, mySalary(f7, 2026) + (160000000 - pay7));
ok(CBA.validateTrade(t7, trade2(A5, B5, [o7.id], [i7.id])).ok, "2025-26 team under the aprons: $3M out, $6.25M back (200% + $250K) allowed");

console.log("\nRoster limits");
var t8 = buildState(), A8 = "OKC", B8 = "DAL";
eq(teamOf(t8, A8).length, 15, "OKC carries 15");
var b8 = teamOf(t8, B8).slice(0, 2), a8 = teamOf(t8, A8)[0];
setSalary(a8, 6000000); setSalary(b8[0], 2000000); setSalary(b8[1], 2000000);
var r8 = CBA.validateTrade(t8, trade2(A8, B8, [a8.id], [b8[0].id, b8[1].id]));
ok(!r8.ok && r8.reasons.some(function (s) { return /16 NBA contracts/.test(s); }), "15-man team cannot take 2 for 1 in season");

console.log("\nSigning: space, MLE, minimum, Bird rights");
var s9 = buildState(), fa = Object.keys(s9.players).map(function (k) { return s9.players[k]; }).filter(function (p) { return p.team === "FA"; })[0];
fa.yearsPro = 3;
forcePayroll(s9, "CHA", 50000000, []);
// signing checks need a roster spot (15 max): CHA and the over-cap test team must have room
ok(teamOf(s9, "CHA").length < 15, "CHA has a free roster spot (" + teamOf(s9, "CHA").length + " players)");
var M9 = Object.keys(s9.teams).sort().filter(function (a) { return a !== "CHA" && teamOf(s9, a).length < 15; })[0];
ok(!!M9, "found an over-cap test team with a free roster spot (" + M9 + ", " + (M9 ? teamOf(s9, M9).length : 0) + " players)");
var c1 = CBA.canSign(s9, "CHA", fa.id, [{ year: 2013, amount: 8044000 }]);
ok(c1.ok && c1.via === "space", "CHA with $8.044M room signs a $8.044M player with space (" + c1.via + ")");
var c2 = CBA.canSign(s9, "CHA", fa.id, [{ year: 2013, amount: 8044001 }]);
ok(!(c2.ok && c2.via === "space"), "one dollar over the room is not a space signing");
forcePayroll(s9, M9, 66000000, []);
var c3 = CBA.canSign(s9, M9, fa.id, [{ year: 2013, amount: 5000000 }]);
ok(c3.ok && c3.via === "mle" && !c3.tax, "over-cap team below the apron: $5M via the non-taxpayer MLE");
var c4 = CBA.canSign(s9, M9, fa.id, [{ year: 2013, amount: 5100000 }]);
ok(!c4.ok, "$5.1M is more than the 2012-13 MLE");
forcePayroll(s9, M9, 74000000, []);
var c5 = CBA.canSign(s9, M9, fa.id, [{ year: 2013, amount: 3000000 }]);
ok(c5.ok && c5.via === "mle" && c5.tax, "team near the apron gets the $3.09M taxpayer MLE");
var c6 = CBA.canSign(s9, M9, fa.id, [{ year: 2013, amount: 885120 }]);
ok(c6.ok && c6.via === "min", "3-year veteran at $885,120 via the minimum");
// Bird rights: an over-cap team re-signs its own player with 3 seasons
var kobe = s9.players.bryanko01;
forcePayroll(s9, "LAL", 90000000, [kobe.id]);
eq(mySalary(kobe, 2013), 27849149, "Kobe's real 2012-13 salary");
kobe.yearsWithTeam = 16; kobe.yearsPro = 16;
var k1 = CBA.canSign(s9, "LAL", kobe.id, [{ year: 2014, amount: 19000000 }, { year: 2015, amount: 19000000 }]);
ok(k1.ok && k1.via === "bird", "Kobe (16 seasons with LAL) re-signs over the cap with Bird rights");
var other = teamOf(s9, "LAL").filter(function (p) { return p.id !== kobe.id; })[0];
other.yearsWithTeam = 1; other.yearsPro = 5; setSalary(other, 2000000);
var k2 = CBA.canSign(s9, "LAL", other.id, [{ year: 2014, amount: 12000000 }]);
ok(!k2.ok, "1 season with the team: no Bird rights for a $12M deal over the cap");
other.yearsWithTeam = 0; other.contract.signedYear = 2010;
var k3 = CBA.canSign(s9, "LAL", other.id, [{ year: 2014, amount: 12000000 }]);
ok(k3.ok && k3.via === "bird", "Bird rights from contract history (signed 2010, 3+ seasons)");
eq(CBA.birdRights(s9, "LAL", other.id, 2013), "full", "birdRights says full");
other.contract.signedYear = 2012; other.yearsWithTeam = 1;
eq(CBA.birdRights(s9, "LAL", other.id, 2014), "early", "two seasons is Early Bird");
var k4 = CBA.canSign(s9, "LAL", other.id, [{ year: 2014, amount: 2000000 * 1.75 }]);
ok(k4.ok && k4.via === "bird", "Early Bird up to 175% of last salary");
eq(CBA.birdRights(s9, "HOU", other.id, 2014), null, "another team has no Bird rights");
var kobe105 = Math.round(27849149 * 1.05);
var k5 = CBA.canSign(s9, "LAL", kobe.id, [{ year: 2014, amount: kobe105 }]);
ok(k5.ok && k5.via === "bird", "Kobe can get 105% of his $27,849,149 (above the 35% max)");
var k6 = CBA.canSign(s9, "LAL", kobe.id, [{ year: 2014, amount: kobe105 + 1000 }]);
ok(!k6.ok, "but not more: Bird rights still stop at the max");

console.log("\nRookie and two-way signings");
var s10 = buildState(), rook = teamOf(s10, "CHA")[0];
var rk = CBA.canSign(s10, "CHA", rook.id, [{ year: 2013, amount: Math.round(4286900 * 1.2) }], { rookie: true, pick: 1, ignoreRoster: true });
ok(rk.ok && rk.via === "rookie", "pick 1 at 120% of scale via the rookie exception");
var rk2 = CBA.canSign(s10, "CHA", rook.id, [{ year: 2013, amount: Math.round(4286900 * 1.2) + 100 }], { rookie: true, pick: 1, ignoreRoster: true });
ok(!rk2.ok, "more than 120% of scale blocked");
var young = teamOf(s10, "OKC").filter(function (p) { return p.age <= 22; })[0];
young.yearsPro = 1;
ok(!CBA.canSign(s10, "OKC", young.id, [{ year: 2013, amount: 75000 }], { twoWay: true }).ok, "no two-way contracts in 2012-13");
var s11 = clone(s10); s11.year = 2018;
Object.keys(s11.players).forEach(function (k) { var p = s11.players[k]; if (p.contract) p.contract.salaries.forEach(function (x) { x.year += 5; }); });
var tw = CBA.canSign(s11, "OKC", young.id, [{ year: 2018, amount: 77250 }], { twoWay: true });
ok(tw.ok && tw.via === "twoWay", "two-way in 2017-18");

console.log("\nLuxury tax");
eq(CBA.taxBill(3000000, 2013), 3000000, "2012-13 tax is $1 per $1");
eq(CBA.taxBill(7000000, 2014), 5000000 * 1.5 + 2000000 * 1.75, "2013-14 graduated tax on $7M over");

console.log("\n" + passes + " passed, " + fails + " failed");
if (fails) process.exit(1);
