// Node test for js/trade.js: node tools/test-trade.js
"use strict";
global.window = global;
var fs = require("fs");
var path = require("path");
var ROOT = path.join(__dirname, "..");
require(path.join(ROOT, "data/league2012.js"));
var usingCBA = false;
if (fs.existsSync(path.join(ROOT, "js/cba.js"))) {
  try {
    if (fs.existsSync(path.join(ROOT, "data/cap-history.js"))) require(path.join(ROOT, "data/cap-history.js"));
    require(path.join(ROOT, "js/cba.js"));
    usingCBA = !!(window.CBA && window.CBA.validateTrade);
  } catch (e) { console.log("js/cba.js failed to load, using the internal check: " + e.message); }
}
var TRADE = require(path.join(ROOT, "js/trade.js"));

var fails = 0, passes = 0;
function ok(cond, msg) {
  if (cond) { passes++; console.log("  ok    " + msg); }
  else { fails++; console.log("  FAIL  " + msg); }
}
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }

// ---------------------------------------------------------------------------
// Build a league state the way js/league.js does
// ---------------------------------------------------------------------------
function addDays(date, n) {
  var d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function buildState(userTeam) {
  var L = window.LEAGUE_2012, year = L.season;
  var state = { version: 1, year: year, phase: "regular", userTeam: userTeam, day: 0, rngSeed: 7,
    players: {}, teams: {}, season: null, history: { seasons: [] }, transactions: [], news: [], events: [],
    settings: { difficulty: "normal" } };
  L.players.forEach(function (p0) {
    var p = clone(p0);
    if (p.team === "FA") p.contract = null;
    else {
      var end = Math.max(year, p.contractEnd || year), sal = [];
      for (var y = year; y <= end; y++) sal.push({ year: y, amount: Math.round((p.salary || 0) * Math.pow(1.045, y - year)) });
      p.contract = { salaries: sal, option: null, rookie: p.age <= 24 && end - year <= 3 && p.salary < 6000000, twoWay: false, signedYear: year - 1 };
    }
    p.yearsPro = Math.max(0, p.age - 21); p.yearsWithTeam = 2; p.stashedUntil = null; p.gleague = false; p.retired = false;
    state.players[p.id] = p;
  });
  L.teams.forEach(function (t0) {
    var t = clone(t0), picks = [];
    for (var y = 2013; y <= 2019; y++) for (var rd = 1; rd <= 2; rd++) picks.push({ year: y, round: rd, original: t.abbr, protection: null });
    t.picks = picks; t.direction = "neutral"; t.rotation = null;
    state.teams[t.abbr] = t;
  });
  var days = [], d = "2012-10-30";
  while (d <= "2013-04-17") { days.push({ date: d, games: [] }); d = addDays(d, 1); }
  var standings = {};
  L.teams.forEach(function (t) { standings[t.abbr] = { w: 0, l: 0 }; });
  state.season = { year: year, day: 0, days: days, standings: standings, injuries: {}, phase: "regular" };
  return state;
}
function teamRating(state, a) {
  var ovr = Object.keys(state.players).map(function (k) { return state.players[k]; })
    .filter(function (p) { return p.team === a && !p.retired; }).map(function (p) { return p.ovr; })
    .sort(function (x, y) { return y - x; }).slice(0, 8);
  return ovr.reduce(function (s, x) { return s + x; }, 0) / Math.max(1, ovr.length);
}
// cheap fake games: every team plays about every other day, stronger teams win more
function fakeDay(state, rng) {
  var abbrs = Object.keys(state.teams), r = {};
  abbrs.forEach(function (a) { r[a] = teamRating(state, a); });
  abbrs.sort(function () { return rng() - 0.5; });
  for (var i = 0; i + 1 < abbrs.length; i += 2) {
    if (rng() < 0.5) continue;
    var a = abbrs[i], b = abbrs[i + 1];
    var pa = 1 / (1 + Math.exp(-(r[a] - r[b]) / 3));
    var win = rng() < pa ? a : b, lose = win === a ? b : a;
    state.season.standings[win].w++; state.season.standings[lose].l++;
  }
}
function rosterCount(state, a) {
  var n = 0;
  for (var id in state.players) { var p = state.players[id]; if (p.team === a && !p.retired && !(p.contract && p.contract.twoWay)) n++; }
  return n;
}
function playersOf(state, a) {
  return Object.keys(state.players).map(function (k) { return state.players[k]; }).filter(function (p) { return p.team === a && !p.retired; });
}
function salary(p, y) { var s = (p.contract && p.contract.salaries || []).filter(function (x) { return x.year === y; })[0]; return s ? s.amount : 0; }
function byName(state, name) { for (var id in state.players) if (state.players[id].name === name) return state.players[id]; return null; }
function T2(a, b, aPlayers, bPlayers, aPicks, bPicks) {
  var t = { teams: [a, b], give: {} };
  t.give[a] = { players: aPlayers || [], picks: aPicks || [] };
  t.give[b] = { players: bPlayers || [], picks: bPicks || [] };
  return t;
}

console.log("TRADE test (" + (usingCBA ? "using js/cba.js" : "js/cba.js not loaded, internal 125% + $100,000 check") + ")");

// ---------------------------------------------------------------------------
console.log("\nValues");
var st = buildState("OKC");
var lebron = byName(st, "LeBron James");
var vLeb = TRADE.value(st, lebron.id, "MIA");
var all = Object.keys(st.players).map(function (k) { return st.players[k]; }).filter(function (p) { return p.team !== "FA"; });
var p90 = all.filter(function (p) { return p.ovr >= 89 && p.ovr <= 91; })[0];
var p75s = all.filter(function (p) { return p.ovr === 75; }).slice(0, 2);
var v90 = TRADE.value(st, p90.id, p90.team), v75 = p75s.reduce(function (s, p) { return s + TRADE.value(st, p.id, p.team); }, 0);
console.log("  LeBron " + vLeb + ", " + p90.name + " (" + p90.ovr + ") " + v90 + ", two 75s " + v75.toFixed(2));
ok(vLeb > 60, "LeBron is worth a lot");
ok(v90 > 3 * v75, "a 90 is worth far more than two 75s");
var young = all.filter(function (p) { return p.age <= 22 && p.pot - p.ovr >= 12 && p.ovr >= 68; })[0];
TRADE.updateDirections(st);
var dirs = {}; Object.keys(st.teams).forEach(function (a) { dirs[st.teams[a].direction] = (dirs[st.teams[a].direction] || 0) + 1; });
console.log("  directions: " + JSON.stringify(dirs));
ok(dirs.contend >= 5 && dirs.rebuild >= 5, "teams split into contenders and rebuilders");
var reb = Object.keys(st.teams).filter(function (a) { return st.teams[a].direction === "rebuild"; })[0];
var con = Object.keys(st.teams).filter(function (a) { return st.teams[a].direction === "contend"; })[0];
console.log("  " + young.name + " (" + young.age + ", " + young.ovr + "/" + young.pot + "): rebuilder " + TRADE.value(st, young.id, reb) + ", contender " + TRADE.value(st, young.id, con));
ok(TRADE.value(st, young.id, reb) > TRADE.value(st, young.id, con), "young high-potential player is worth more to a rebuilder");
var vet = all.filter(function (p) { return p.age >= 33 && p.ovr >= 78; })[0];
console.log("  " + vet.name + " (" + vet.age + ", " + vet.ovr + "): rebuilder " + TRADE.value(st, vet.id, reb) + ", contender " + TRADE.value(st, vet.id, con));
ok(TRADE.value(st, vet.id, con) > TRADE.value(st, vet.id, reb), "old veteran is worth more to a contender");
var rose = byName(st, "Derrick Rose");
var roseHealthy = clone(st); roseHealthy.players[rose.id].injury = null;
ok(TRADE.value(st, rose.id, "CHI") < TRADE.value(roseHealthy, rose.id, "CHI"), "a long injury lowers value (Rose " + TRADE.value(st, rose.id, "CHI") + " vs healthy " + TRADE.value(roseHealthy, rose.id, "CHI") + ")");
var overpaid = all.filter(function (p) { return p.ovr <= 75 && p.salary >= 10000000 && p.contractEnd >= 2014; })[0];
if (overpaid) {
  console.log("  overpaid: " + overpaid.name + " (" + overpaid.ovr + ", $" + (overpaid.salary / 1e6).toFixed(1) + "M through " + overpaid.contractEnd + ") " + TRADE.value(st, overpaid.id, overpaid.team));
  ok(TRADE.value(st, overpaid.id, overpaid.team) < 0, "an overpaid player has negative value");
}

console.log("\nPick values");
var order = Object.keys(st.teams).sort(function (a, b) { return teamRating(st, a) - teamRating(st, b); });
var worst = order[0], best = order[order.length - 1];
var pw = TRADE.pickValue(st, { year: 2013, round: 1, original: worst }, reb);
var pb = TRADE.pickValue(st, { year: 2013, round: 1, original: best }, reb);
var pw19 = TRADE.pickValue(st, { year: 2019, round: 1, original: worst }, reb);
var pw2 = TRADE.pickValue(st, { year: 2013, round: 2, original: worst }, reb);
var pwProt = TRADE.pickValue(st, { year: 2013, round: 1, original: worst, protection: { top: 10, until: 2014 } }, reb);
console.log("  2013 1st " + worst + " " + pw + ", " + best + " " + pb + "; 2019 1st " + worst + " " + pw19 + "; 2013 2nd " + pw2 + "; top-10 protected " + pwProt);
ok(pw > pb, "a bad team's pick is worth more than a good team's");
ok(pw > pw19, "far future picks are worth less (more uncertain)");
ok(pw2 < pb, "second round picks are worth little");
ok(pwProt < pw, "protection lowers value");
ok(TRADE.pickValue(st, { year: 2014, round: 1, original: worst }, reb) > TRADE.pickValue(st, { year: 2014, round: 1, original: worst }, con), "rebuilders value picks more than contenders");

// ---------------------------------------------------------------------------
console.log("\nEvaluate");
// LeBron for a bench player (salaries matched so only value decides)
var bench = all.filter(function (p) { return p.team !== "MIA" && p.ovr <= 78 && p.salary >= 14000000; }).sort(function (a, b) { return a.ovr - b.ovr; })[0];
var st2 = buildState(bench.team);
var r1 = TRADE.evaluate(st2, T2(bench.team, "MIA", [bench.id], [lebron.id]));
console.log("  " + bench.name + " (" + bench.ovr + ") for LeBron: " + JSON.stringify({ accepts: r1.accepts, margin: r1.margin, message: r1.message }));
ok(!r1.accepts && r1.legal, "AI rejects LeBron for a bench player");
var st2b = buildState("OKC");
var thabeet = byName(st2b, "Hasheem Thabeet") || playersOf(st2b, "OKC").sort(function (a, b) { return a.ovr - b.ovr; })[0];
var r1b = TRADE.evaluate(st2b, T2("OKC", "MIA", [thabeet.id], [lebron.id]));
console.log("  " + thabeet.name + " for LeBron: " + r1b.message);
ok(!r1b.accepts, "AI rejects LeBron for a minimum salary bench player");

// a fair deal: user gives a slightly better similar player with matching salary
var st3 = buildState("OKC");
TRADE.updateDirections(st3);
var fair = null;
var okc = playersOf(st3, "OKC");
outer:
for (var i = 0; i < okc.length; i++) {
  var x = okc[i];
  if (x.ovr < 72 || x.ovr > 84) continue;
  var others = all.filter(function (p) { return p.team !== "OKC" && st3.players[p.id].team !== "FA"; });
  for (var j = 0; j < others.length; j++) {
    var y = st3.players[others[j].id];
    if (y.ovr > x.ovr - 1 || y.ovr < x.ovr - 3 || Math.abs(y.age - x.age) > 3) continue;
    var sx = salary(x, 2013), sy = salary(y, 2013);
    if (sy > sx * 1.25 + 100000 || sx > sy * 1.25 + 100000) continue;
    var t = T2("OKC", y.team, [x.id], [y.id]);
    if (!TRADE.validate(st3, t).ok) continue;
    fair = { t: t, x: x, y: y }; break outer;
  }
}
ok(!!fair, "found a like-for-like pair to test");
if (fair) {
  var r2 = TRADE.evaluate(st3, fair.t);
  console.log("  " + fair.x.name + " (" + fair.x.ovr + ", " + fair.x.age + ") for " + fair.y.name + " (" + fair.y.ovr + ", " + fair.y.age + ", " + fair.y.team + "): " + JSON.stringify({ accepts: r2.accepts, margin: r2.margin, message: r2.message }));
  ok(r2.accepts, "AI accepts a fair deal that helps it");
  // lopsided the other way: the same OKC player for a clearly better one
  var better = null, worse = null;
  okc.some(function (w) {
    better = all.map(function (p) { return st3.players[p.id]; }).filter(function (z) {
      if (z.team === "OKC" || z.team === "FA" || z.ovr < w.ovr + 8 || z.age > w.age + 4) return false;
      var sx = salary(w, 2013), sz = salary(z, 2013);
      return sz <= sx * 1.25 + 100000 && sx <= sz * 1.25 + 100000 && TRADE.validate(st3, T2("OKC", z.team, [w.id], [z.id])).ok;
    })[0];
    worse = w;
    return !!better;
  });
  ok(!!better, "found a clearly better player to test a lopsided deal");
  if (better) {
    var r2b = TRADE.evaluate(st3, T2("OKC", better.team, [worse.id], [better.id]));
    console.log("  " + worse.name + " (" + worse.ovr + ") for " + better.name + " (" + better.ovr + ", " + better.team + "): " + r2b.message);
    ok(!r2b.accepts, "AI rejects a clearly lopsided deal");
  }
}

// salary-illegal: OKC is over the cap and takes back far more salary than it sends
var st4 = buildState("OKC");
var big = all.filter(function (p) { return p.team !== "OKC" && p.salary >= 10000000 && p.ovr <= 82; })[0];
var picks = [2014, 2016, 2018].map(function (y) { return { year: y, round: 1, original: "OKC" }; });
var r3 = TRADE.evaluate(st4, T2("OKC", big.team, [thabeet.id], [big.id], picks));
console.log("  " + thabeet.name + " + three firsts for " + big.name + " ($" + (big.salary / 1e6).toFixed(1) + "M): " + r3.message);
ok(!r3.accepts && r3.legal === false && /salary/i.test(r3.message), "AI refuses a salary-illegal deal with a salary message");
// the AI side over the cap cannot absorb salary
var miaMin = playersOf(st4, "MIA").sort(function (a, b) { return salary(a, 2013) - salary(b, 2013); })[0];
var perk = byName(st4, "Kendrick Perkins");
var r3b = TRADE.evaluate(st4, T2("OKC", "MIA", [perk.id], [miaMin.id], [{ year: 2014, round: 1, original: "OKC" }]));
console.log("  Perkins + a first for " + miaMin.name + ": " + r3b.message);
ok(!r3b.accepts && /shed salary/.test(r3b.message), "AI over the cap says it needs to shed salary");
// roster limit: 3 for 1 into a full roster
var full = Object.keys(st4.teams).filter(function (a) { return a !== "OKC" && rosterCount(st4, a) === 15; })[0];
var three = playersOf(st4, "OKC").sort(function (a, b) { return a.ovr - b.ovr; }).slice(0, 3).map(function (p) { return p.id; });
var fullStar = playersOf(st4, full).sort(function (a, b) { return a.ovr - b.ovr; })[0];
var r4 = TRADE.evaluate(st4, T2("OKC", full, three, [fullStar.id]));
console.log("  three bench players into full " + full + ": " + r4.message);
ok(!r4.accepts && r4.legal === false, "AI refuses a deal that breaks roster limits");
// Stepien rule
var r5 = TRADE.evaluate(st4, T2("OKC", "CHA", [], [], [{ year: 2014, round: 1, original: "OKC" }, { year: 2015, round: 1, original: "OKC" }]));
ok(!r5.accepts && r5.legal === false, "two straight firsts cannot leave (Stepien rule): " + r5.message);

// ---------------------------------------------------------------------------
console.log("\nFinder");
var st5 = buildState("OKC");
TRADE.updateDirections(st5);
var finderTargets = [];
Object.keys(st5.teams).forEach(function (a) {
  if (a === "OKC") return;
  var p = playersOf(st5, a).filter(function (q) { return q.ovr >= 76 && q.ovr <= 82; })[0];
  if (p && finderTargets.length < 4) finderTargets.push(p);
});
var finderOk = 0, finderAll = true;
finderTargets.forEach(function (p) {
  var props = TRADE.finder(st5, "OKC", p.team, [p.id]);
  console.log("  for " + p.name + " (" + p.ovr + ", " + p.team + "): " + props.length + " packages");
  props.forEach(function (pr) {
    var e = TRADE.evaluate(st5, pr.trade);
    console.log("    " + pr.text + "  [" + (e.accepts ? "accepts" : "REJECTS") + ", margin " + e.margin + "]");
    if (!e.accepts) finderAll = false;
  });
  if (props.length >= 1 && props.length <= 3) finderOk++;
});
ok(finderOk >= 3, "finder returns 1 to 3 packages for most targets (" + finderOk + " of " + finderTargets.length + ")");
ok(finderAll, "every finder package is accepted by evaluate");
ok(TRADE.finder(st5, "OKC", "MIA", [lebron.id]).every(function (pr) { return TRADE.evaluate(st5, pr.trade).accepts; }), "finder for LeBron returns only acceptable packages (or none)");

// ---------------------------------------------------------------------------
console.log("\nExecute");
var st6 = buildState("OKC");
if (fair) {
  var t6 = T2("OKC", fair.y.team, [fair.x.id], [fair.y.id], [{ year: 2015, round: 2, original: "OKC" }]);
  var ex = TRADE.execute(st6, t6);
  ok(ex.ok && st6.players[fair.x.id].team === fair.y.team && st6.players[fair.y.id].team === "OKC", "execute moves players");
  ok(st6.players[fair.x.id].yearsWithTeam === 0, "yearsWithTeam reset");
  ok(st6.teams[fair.y.team].picks.some(function (k) { return k.original === "OKC" && k.year === 2015 && k.round === 2; }) &&
     !st6.teams.OKC.picks.some(function (k) { return k.year === 2015 && k.round === 2; }), "execute moves picks");
  ok(st6.transactions.length === 1 && st6.transactions[0].type === "trade" && st6.news.length === 1, "transaction and news logged: " + st6.news[0].headline);
  ok(!TRADE.execute(st6, t6).ok, "a stale trade does not execute twice");
}

// ---------------------------------------------------------------------------
console.log("\nSimulated season (aiTrades daily, aiOffers like js/league.js)");
function simSeason(seed, verbose) {
  var s = buildState("OKC"), rng = mulberry32(seed);
  var start = {}, bad = [];
  Object.keys(s.teams).forEach(function (a) { start[a] = rosterCount(s, a); });
  var trades = [], offers = [], offersBad = 0;
  function check(label) {
    Object.keys(s.teams).forEach(function (a) {
      var n = rosterCount(s, a), min = Math.min(13, start[a]);
      if (n > 15 || n < min) bad.push(label + " " + a + " " + n);
    });
  }
  for (var d = 0; d < s.season.days.length; d++) {
    fakeDay(s, rng);
    s.season.day = d + 1; s.day = d + 1;
    var done = TRADE.aiTrades(s, rng);
    done.forEach(function (x) { trades.push({ date: s.season.days[Math.min(d + 1, s.season.days.length - 1)].date, text: x.text, trade: x.trade, dirs: x.trade.teams.map(function (a) { return s.teams[a].direction; }) }); });
    if (done.length) check("day " + d);
    if (rng() < 0.08) {
      var o = TRADE.aiOffers(s, rng);
      o.forEach(function (x) {
        var e = TRADE.evaluate(s, x.trade);
        if (!e.accepts) offersBad++;
        offers.push(x);
      });
    }
  }
  var regular = trades.length;
  s.season.phase = "playoffs"; s.phase = "playoffs";
  var po = TRADE.aiTrades(s, rng).length;
  // offseason steps
  ["draftLottery", "draft", "resign"].forEach(function (ph) { s.phase = ph; TRADE.aiTrades(s, rng).forEach(function (x) { trades.push({ date: ph, text: x.text, trade: x.trade, dirs: x.trade.teams.map(function (a) { return s.teams[a].direction; }) }); }); check(ph); });
  s.phase = "freeAgency";
  for (var f = 0; f < 30; f++) { s.day = 200 + f; TRADE.aiTrades(s, rng).forEach(function (x) { trades.push({ date: "freeAgency", text: x.text, trade: x.trade, dirs: x.trade.teams.map(function (a) { return s.teams[a].direction; }) }); }); }
  check("freeAgency");
  s.phase = "training"; TRADE.aiTrades(s, rng).forEach(function (x) { trades.push({ date: "training", text: x.text, trade: x.trade, dirs: x.trade.teams.map(function (a) { return s.teams[a].direction; }) }); });
  check("training");
  return { s: s, trades: trades, regular: regular, playoffs: po, offers: offers, offersBad: offersBad, bad: bad };
}
var seasons = [11, 22, 33, 44, 55].map(function (seed) { return simSeason(seed); });
seasons.forEach(function (r, i) {
  var deadline = r.trades.filter(function (t) { return t.date >= "2013-02-01" && t.date <= "2013-02-21"; }).length;
  console.log("  season " + (i + 1) + ": " + r.trades.length + " AI trades (" + r.regular + " in season, " + deadline + " near the deadline, " +
    (r.trades.length - r.regular) + " offseason), " + r.offers.length + " offers to the user, roster problems " + r.bad.length);
});
var avgReg = seasons.reduce(function (s, r) { return s + r.regular; }, 0) / seasons.length;
ok(seasons.every(function (r) { return r.trades.length >= 5 && r.trades.length <= 16; }), "every season has 5 to 15ish AI trades (in season plus offseason)");
ok(avgReg >= 3 && avgReg <= 12, "in-season AI trades average " + avgReg.toFixed(1));
ok(seasons.every(function (r) { return r.playoffs === 0; }), "no trades during the playoffs");
ok(seasons.every(function (r) { return r.trades.filter(function (t) { return t.date > "2013-02-21" && t.date < "2013-07"; }).length === 0; }), "no in-season trades after the deadline");
var nearDeadline = seasons.reduce(function (s, r) { return s + r.trades.filter(function (t) { return t.date >= "2013-02-01" && t.date <= "2013-02-21"; }).length; }, 0);
var inSeasonAll = seasons.reduce(function (s, r) { return s + r.regular; }, 0);
ok(nearDeadline >= inSeasonAll * 0.5, "most in-season trades come in February before the deadline (" + nearDeadline + " of " + inSeasonAll + ")");
ok(seasons.every(function (r) { return r.bad.length === 0; }), "AI trades never break roster limits (13 to 15)");
ok(seasons.every(function (r) { return r.offers.length >= 1 && r.offers.length <= 6; }), "a few AI offers to the user each season");
ok(seasons.every(function (r) { return r.offersBad === 0; }), "AI offers are acceptable to the AI that makes them");
// sensible: in most trades the higher-overall player goes to the team that is more of a contender
var rankDir = { contend: 2, neutral: 1, rebuild: 0 }, sensible = 0, judged = 0;
seasons.forEach(function (r) {
  r.trades.forEach(function (t) {
    var a = t.trade.teams[0], b = t.trade.teams[1];
    if (rankDir[t.dirs[0]] === rankDir[t.dirs[1]]) return;
    judged++;
    var bestA = 0, bestB = 0;
    t.trade.give[a].players.forEach(function (id) { bestA = Math.max(bestA, r.s.players[id].ovr); });
    t.trade.give[b].players.forEach(function (id) { bestB = Math.max(bestB, r.s.players[id].ovr); });
    var buyer = rankDir[t.dirs[0]] > rankDir[t.dirs[1]] ? a : b;
    if ((buyer === a && bestB >= bestA) || (buyer === b && bestA >= bestB)) sensible++;
  });
});
ok(judged === 0 || sensible / judged >= 0.7, "contenders buy, rebuilders sell (" + sensible + " of " + judged + " trades)");

console.log("\nExample AI trades (season 1)");
seasons[0].trades.slice(0, 8).forEach(function (t) { console.log("  [" + t.date + "] (" + t.trade.teams[0] + " " + t.dirs[0] + ", " + t.trade.teams[1] + " " + t.dirs[1] + ") " + t.text); });
console.log("\nExample AI offers to the user (season 1)");
seasons[0].offers.slice(0, 3).forEach(function (o) { console.log("  " + o.message); });

console.log("\n" + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
