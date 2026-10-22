// Node test for js/freeagency.js and js/mood.js.  Run: node tools/test-freeagency.js [--cba]
// Builds a league from data/league2012.js, runs two offseasons (2013 and 2014) with 30 free agency days each,
// and checks rosters, cap rules (with its own cap numbers and ledger), star money and mood reactions.
'use strict';
global.window = global;
var path = require('path');
var root = path.join(__dirname, '..');
require(path.join(root, 'data/league2012.js'));
require(path.join(root, 'data/personalities.js'));
if (process.argv.indexOf('--cba') >= 0) require(path.join(root, 'js/cba.js'));
var MOOD = require(path.join(root, 'js/mood.js'));
var FA = require(path.join(root, 'js/freeagency.js'));

var fails = 0, passes = 0;
function check(cond, msg) {
  if (cond) passes++;
  else { fails++; console.log('FAIL: ' + msg); }
}
function m(x) { return '$' + (x / 1e6).toFixed(2) + 'M'; }

// Independent cap numbers (real figures) for the checker.
var CAP = { 2014: 58679000, 2015: 63065000 };
var TAX = { 2014: 71748000, 2015: 76829000 };
var MLE_2013 = 5000000, TAXMLE_2013 = 3090000, ROOM_2013 = 2500000, BAE_2013 = 1957000, MAXMIN_2013 = 1352181;

function rngFrom(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function buildState(userTeam) {
  var L = window.LEAGUE_2012;
  var state = { version: 1, year: 2013, phase: 'regular', userTeam: userTeam || 'OKC', day: 0, rngSeed: 2013,
    players: {}, teams: {}, season: null, history: { seasons: [] }, transactions: [], news: [], events: [], settings: { difficulty: 'normal' } };
  L.teams.forEach(function (t) { state.teams[t.abbr] = JSON.parse(JSON.stringify(t)); });
  L.players.forEach(function (p) { state.players[p.id] = JSON.parse(JSON.stringify(p)); });
  FA.contractsFromSalary(state);
  MOOD.initPersonalities(state, state.rngSeed);
  // Real service time for the 2009 draftees the league file lists as expiring in 2013 (rookie scale, so restricted).
  ['curryst01', 'hardeja01', 'ibakase01', 'holidjr01', 'jennibr01', 'evansty01', 'lawsoty01'].forEach(function (id) {
    var p = state.players[id];
    if (p && p.contract) { p.yearsPro = 3; p.yearsWithTeam = 3; p.contract.rookie = true; p.contract.round = 1; p.contract.signedYear = 2010; }
  });
  // Real 2013 free agents whose contracts the league file lists as running longer.
  ['paulch01', 'howardw01'].forEach(function (id) {
    var p = state.players[id];
    if (p && p.contract) { p.contract.salaries = p.contract.salaries.filter(function (s) { return s.year <= 2013; }); p.contract.options = []; p.contract.option = null; }
  });
  // LeBron with a 2013 early termination option, to exercise the option logic.
  var lbj = state.players.jamesle01;
  if (lbj) { lbj.contract.option = { year: 2014, type: 'eto' }; lbj.contract.options = [lbj.contract.option]; }
  return state;
}

// A fake finished regular season: records from roster strength.
function fakeSeason(state, rng) {
  var ctx = MOOD.buildCtx(state), standings = {}, stats = {};
  Object.keys(state.teams).forEach(function (a) {
    var wp = Math.max(0.15, Math.min(0.85, 0.5 + (ctx.strength[a] - ctx.avgStrength) * 0.04 + (rng() - 0.5) * 0.1));
    var w = Math.round(82 * wp);
    standings[a] = { w: w, l: 82 - w };
    ctx.rosters[a].forEach(function (p, i) {
      var mpg = [35, 33, 31, 29, 27, 22, 20, 17, 14, 10, 7, 5, 4, 3, 3][Math.min(i, 14)];
      stats[p.id] = { g: 70, gs: i < 5 ? 70 : 0, min: 70 * mpg, pts: 70 * (p.stats ? p.stats.pts : 5), oreb: 70, dreb: 70 * 3, ast: 70 * (p.stats ? p.stats.ast : 1), stl: 50, blk: 30, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, tov: 0, pf: 0 };
    });
  });
  state.season = { year: state.year, standings: standings, playerStats: stats, injuries: {} };
}

function payrollLedger(state, Y) {
  var pay = {}, cnt = {};
  Object.keys(state.teams).forEach(function (a) {
    pay[a] = 0; cnt[a] = 0;
    (state.teams[a].deadMoney || []).forEach(function (d) { if (d.year === Y) pay[a] += d.amount; });
  });
  Object.keys(state.players).forEach(function (id) {
    var p = state.players[id];
    if (!state.teams[p.team] || p.retired || !p.contract || p.contract.twoWay) return;
    cnt[p.team]++;
    p.contract.salaries.forEach(function (s) { if (s.year === Y) pay[p.team] += s.amount; });
  });
  return { pay: pay, cnt: cnt };
}

function runOffseason(state, rng, label) {
  var Y = state.year + 1;
  fakeSeason(state, rng);
  var sum = FA.startOffseason(state);
  check(sum.year === Y, label + ': offseason year ' + Y);
  var rightsAtStart = JSON.parse(JSON.stringify(state.fa.rights));
  var ledger = payrollLedger(state, Y);
  var win = FA.resignWindow(state);
  check(Array.isArray(win.players), label + ': resign window lists players');

  var days = 0;
  while (state.fa.stage !== 'done' && days < 40) { FA.simDay(state, rng); days++; }
  check(state.fa.stage === 'done', label + ': free agency finishes');
  check(days === 30, label + ': free agency took ' + days + ' days (expected 30)');

  // Roster sizes
  var bad = [];
  Object.keys(state.teams).forEach(function (a) {
    var n = FA.rosterCount(state, a);
    if (n < 13 || n > 15) bad.push(a + ':' + n);
  });
  check(!bad.length, label + ': every team has 13 to 15 players ' + (bad.length ? bad.join(' ') : ''));

  // Cap rules, replayed with the checker's own ledger
  var ratio = CAP[Y] / 58044000, mleUses = {}, roomUses = {}, baeUses = {}, spaceUsed = {}, problems = [];
  var moves = state.fa.signings.concat(state.fa.released.map(function (r) { return { release: true, abbr: r.abbr, seq: r.seq }; }));
  moves.sort(function (x, y) { return x.seq - y.seq; });
  moves.forEach(function (s) {
    if (s.release) { ledger.cnt[s.abbr]--; return; }
    var a = s.abbr, first = s.salaries[0].amount, n = s.salaries.length, before = ledger.pay[a];
    var raiseCap = s.via === 'bird' ? 0.075 : 0.045;
    for (var i = 1; i < n; i++) {
      var step = s.salaries[i].amount - s.salaries[i - 1].amount;
      if (Math.abs(step) > first * raiseCap + 2) problems.push(s.name + ' raise too big');
    }
    var yp = s.yearsPro, maxPct = yp >= 10 ? 0.35 : yp >= 7 ? 0.30 : 0.25;
    if (first > Math.max(CAP[Y] * maxPct, 0) * 1.0 + 1 && s.via !== 'bird' && s.via !== 'qo') problems.push(s.name + ' above max ' + m(first));
    if (s.via !== 'twoWay' && s.via !== 'qo' && ledger.cnt[a] >= 15) problems.push(a + ' signed ' + s.name + ' with a full roster');
    if (s.via === 'space' && before + first > CAP[Y] + 1) problems.push(a + ' used cap space it did not have for ' + s.name + ' (' + m(before) + ' + ' + m(first) + ')');
    if (s.via === 'mle') {
      mleUses[a] = (mleUses[a] || 0) + 1;
      if (first > MLE_2013 * ratio * 1.04 || n > 4) problems.push(a + ' MLE too big for ' + s.name + ' ' + m(first));
      if (before + first > TAX[Y] + 4000000 * ratio + 1 && first > TAXMLE_2013 * ratio * 1.04) problems.push(a + ' full MLE above the apron for ' + s.name);
      if (spaceUsed[a]) problems.push(a + ' used the MLE after using cap space');
    }
    if (s.via === 'room') { roomUses[a] = (roomUses[a] || 0) + 1; if (first > ROOM_2013 * ratio * 1.04 || n > 2) problems.push(a + ' room exception too big'); }
    if (s.via === 'bae') { baeUses[a] = (baeUses[a] || 0) + 1; if (first > BAE_2013 * ratio * 1.04 || n > 2) problems.push(a + ' BAE too big'); }
    if (s.via === 'min' && (first > MAXMIN_2013 * ratio * 1.04 || n > 2)) problems.push(a + ' minimum deal too big for ' + s.name + ' ' + m(first));
    if ((s.via === 'bird' || s.via === 'qo') && !(rightsAtStart[s.id] && rightsAtStart[s.id].team === a)) problems.push(a + ' used Bird rights it does not hold on ' + s.name);
    if (s.via === 'qo' && n !== 1) problems.push(s.name + ' qualifying offer is not one year');
    if (s.via === 'twoWay' && Y < 2018) problems.push('two-way contract before 2017-18');
    if (s.via === 'space') spaceUsed[a] = true;
    if (s.via !== 'twoWay') { ledger.pay[a] += first; ledger.cnt[a]++; }
  });
  Object.keys(mleUses).forEach(function (a) { if (mleUses[a] > 1) problems.push(a + ' used the MLE ' + mleUses[a] + ' times'); });
  Object.keys(roomUses).forEach(function (a) { if (roomUses[a] > 1) problems.push(a + ' used the room exception twice'); });
  Object.keys(baeUses).forEach(function (a) { if (baeUses[a] > 1) problems.push(a + ' used the BAE twice'); });
  check(!problems.length, label + ': no cap rule broken (' + state.fa.signings.length + ' signings)' + (problems.length ? '\n  ' + problems.slice(0, 15).join('\n  ') : ''));

  // Stars get near-max money
  var starRows = [];
  state.fa.signings.forEach(function (s) {
    var p = state.players[s.id];
    var eff = p.ovr + Math.max(0, p.pot - p.ovr) * (p.age <= 25 ? 0.1 : 0);
    if (eff < 86 || p.age >= 33 || s.via === 'qo') return;
    var maxS = s.max, first = s.salaries[0].amount;
    starRows.push(p.name + ' ' + m(first) + ' first year, max ' + m(maxS));
    check(first >= maxS * 0.9, label + ': star ' + p.name + ' near max (' + m(first) + ' vs ' + m(maxS) + ')');
  });

  return { summary: sum, days: days, stars: starRows };
}

function printSignings(state, label) {
  var list = state.fa.signings.filter(function (s) { return s.via !== 'twoWay'; }).slice();
  list.sort(function (a, b) { return b.salaries[0].amount - a.salaries[0].amount; });
  console.log('\n' + label + ' top signings:');
  list.slice(0, 14).forEach(function (s) {
    var tot = s.salaries.reduce(function (a, x) { return a + x.amount; }, 0);
    console.log('  day ' + (s.day < 10 ? ' ' : '') + s.day + '  ' + s.abbr + (s.resign ? ' re-signs ' : ' signs ') + s.name + ' (' + s.ovr + ' ovr, age ' + s.age + '): ' +
      s.salaries.length + ' yrs, ' + m(tot) + ' via ' + s.via + (s.matched ? ' (matched offer sheet)' : s.offerSheet ? ' (offer sheet)' : ''));
  });
  var mins = state.fa.signings.filter(function (s) { return s.via === 'min'; }).length;
  var left = FA.freeAgents(state).length;
  var Y = state.fa.year, pays = Object.keys(state.teams).map(function (a) { return FA.payroll(state, a, Y); }).sort(function (a, b) { return a - b; });
  var overTax = pays.filter(function (x) { return x > FA.rules(Y).tax; }).length;
  console.log('  Payrolls ' + m(pays[0]) + ' to ' + m(pays[pays.length - 1]) + ' (median ' + m(pays[15]) + '), ' + overTax + ' teams over the tax');
  var byDay = {}; state.fa.signings.forEach(function (s) { byDay[s.day] = (byDay[s.day] || 0) + 1; });
  console.log('  Signings by day: ' + Object.keys(byDay).map(function (d) { return d + ':' + byDay[d]; }).join(' '));
  console.log('  Unsigned: ' + FA.freeAgents(state).slice(0, 10).map(function (p) { return p.name + ' (' + p.ovr + ', ' + p.age + ')'; }).join(', '));
  console.log('  ' + left + ' players still unsigned (waiting); ' + state.fa.signings.length + ' signings in all, ' + mins + ' minimum deals, ' + state.fa.retired.length + ' retirements, ' + state.fa.released.length + ' releases');
}

// ---------------------------------------------------------------------------
// 1. Demands and the offer function
// ---------------------------------------------------------------------------
(function () {
  var state = buildState('OKC');
  var rng = rngFrom(7);
  fakeSeason(state, rng);
  var r = FA.rules(2014);
  check(r.cap === 58679000 && FA.rules(2013).cap === 58044000 && FA.rules(2013).tax === 70307000, 'fallback cap and tax numbers');
  check(FA.rules(2013).minSalary(0) === 473604 && FA.rules(2013).minSalary(10) === 1352181 && FA.rules(2013).mle === 5000000, 'fallback minimum and MLE numbers');
  FA.startOffseason(state);
  check(state.fa.year === 2014, 'offseason opens for 2013-14 contracts');
  // LeBron opts out of his ETO when he is worth more
  check(state.players.jamesle01.team === 'FA', 'LeBron uses his early termination option to become a free agent');
  var d = FA.demand(state, 'jamesle01');
  check(d.max && d.amount === FA.maxSalary(state, state.players.jamesle01), 'LeBron asks for the max (' + m(d.amount) + ')');
  var cp = FA.demand(state, 'paulch01');
  check(cp.max, 'Chris Paul asks for the max (' + m(cp.amount) + ', ' + cp.years + ' years)');
  var kidd = state.players.kiddja01;
  if (kidd && kidd.team === 'FA') { var kd = FA.demand(state, 'kiddja01'); check(kd.years <= 2, 'old Jason Kidd wants a short deal (' + kd.years + ' years)'); }
  var curry = state.fa.rights.curryst01;
  check(curry && curry.rfa && curry.qo > 0, 'Stephen Curry is a restricted free agent with a qualifying offer');
  // Two-way rules
  var young = null, vet = null;
  Object.keys(state.players).forEach(function (id) { var p = state.players[id]; if (p.team === 'FA' && !p.retired) { if ((p.yearsPro || 0) <= 3 && !young) young = p; if ((p.yearsPro || 0) >= 6 && !vet) vet = p; } });
  check(!FA.canSign(state, 'BOS', young.id, [{ year: 2014, amount: 300000 }], { twoWay: true }).ok, 'no two-way contracts before 2017-18');
  check(FA.canSign(state, 'BOS', young.id, [{ year: 2018, amount: 400000 }], { twoWay: true }).ok, 'two-way contract for a young player in 2017-18');
  check(!FA.canSign(state, 'BOS', vet.id, [{ year: 2018, amount: 400000 }], { twoWay: true }).ok, 'no two-way contract for a veteran');
  // Free agency has not opened: other teams cannot talk to Curry yet
  var early = FA.offer(state, 'BOS', 'jamesle01', { salaries: [15000000, 15600000] });
  check(!early.accepted && /not opened/.test(early.message), 'no offers to other teams before free agency opens');
  // The user (OKC) re-signs Harden with Bird rights in the re-sign window
  var hd = FA.demand(state, 'hardeja01', 'OKC');
  var low = FA.offer(state, 'OKC', 'hardeja01', { salaries: FA.makeSalaries(2014, hd.required * 0.6, hd.years, 0.075) });
  check(!low.accepted && /short/.test(low.message), 'lowball rejected with a money reason: "' + low.message + '"');
  var ok = FA.offer(state, 'OKC', 'hardeja01', { salaries: FA.makeSalaries(2014, Math.min(hd.required * 1.02, FA.maxSalary(state, state.players.hardeja01)), Math.max(hd.years, 2), 0.075) });
  check(ok.accepted && state.players.hardeja01.team === 'OKC', 'Harden re-signs with OKC: "' + ok.message + '"');
  console.log('  Example messages:\n    ' + low.message + '\n    ' + ok.message);
  FA.simDay(state, rng);
  var deal = FA.offer(state, 'NYK', 'jamesle01', { salaries: [8000000, 8360000] });
  check(!deal.accepted, 'LeBron rejects an $8M offer: "' + deal.message + '"');
})();

// ---------------------------------------------------------------------------
// 2. Mood reacts to losing and benching
// ---------------------------------------------------------------------------
(function () {
  var state = buildState('OKC');
  var id = 'duranke01', p = state.players[id];
  function season(w, mpg) {
    var st = {}; Object.keys(state.teams).forEach(function (a) { st[a] = { w: 41, l: 41 }; });
    st.OKC = { w: w, l: 60 - w };
    var ps = {}; ps[id] = { g: 60, gs: 60, min: 60 * mpg, pts: 60 * 25, oreb: 60, dreb: 400, ast: 200, stl: 60, blk: 60 };
    state.season = { year: 2013, standings: st, playerStats: ps, injuries: {} };
  }
  season(48, 38); var good = MOOD.of(state, id).target;
  season(12, 38); var losing = MOOD.of(state, id).target;
  season(48, 9); var benched = MOOD.of(state, id).target;
  console.log('\n  Durant mood: winning ' + good + ', losing ' + losing + ', benched ' + benched);
  check(losing < good - 8, 'mood drops with losing (' + good + ' to ' + losing + ')');
  check(benched < good - 12, 'mood drops when benched (' + good + ' to ' + benched + ')');
  season(12, 9);
  p.mood = 28;
  state.events = [];
  MOOD.update(state);
  var c = state.events.filter(function (e) { return e.type === 'complaint' && e.playerId === id; })[0];
  check(!!c && p.mood < 30, 'unhappy star complains (mood ' + p.mood + ')' + (c ? ': ' + c.text : ''));
  check(c && c.tradeRequest, 'very unhappy star asks for a trade');
  // Unhappy players are more likely to leave: their price to stay goes up
  // (a role player, since a star's price is capped at the max either way)
  var role = Object.keys(state.players).map(function (k) { return state.players[k]; })
    .filter(function (x) { return x.team === 'OKC' && x.ovr >= 72 && x.ovr <= 79; })[0];
  state.fa = { year: 2014, day: 0, length: 30, stage: 'resign', rights: {}, offerSheets: [], signings: [], decisions: [], used: {}, released: [], retired: [] };
  role.team = 'FA'; role.lastTeam = 'OKC'; state.fa.rights[role.id] = { team: 'OKC', bird: 'full', prev: role.salary, rfa: false, qo: 0 };
  role.mood = 85; var happy = FA.demand(state, role.id, 'OKC').required;
  role.mood = 10; var sad = FA.demand(state, role.id, 'OKC').required;
  check(sad > happy * 1.1, 'unhappy ' + role.name + ' asks OKC for more to stay (' + m(happy) + ' happy, ' + m(sad) + ' unhappy)');
  // Loyal Duncan gives San Antonio a discount compared to another team
  var s2 = buildState('OKC');
  var td = s2.players.duncati01;
  s2.fa = { year: 2014, day: 0, length: 30, stage: 'open', rights: { duncati01: { team: 'SAS', bird: 'full', prev: 10000000, rfa: false, qo: 0 } }, offerSheets: [], signings: [], decisions: [], used: {}, released: [], retired: [] };
  td.team = 'FA'; td.lastTeam = 'SAS'; td.yearsWithTeam = 16; td.mood = 75;
  var sas = FA.demand(s2, 'duncati01', 'SAS').required, other = FA.demand(s2, 'duncati01', 'SAC').required;
  check(sas < other, 'Tim Duncan gives the Spurs a hometown discount (' + m(sas) + ' vs ' + m(other) + ' from SAC)');
})();

// ---------------------------------------------------------------------------
// 3. Two full offseasons with 30 free agency days each
// ---------------------------------------------------------------------------
(function () {
  var state = buildState('OKC');
  var rng = rngFrom(2013);
  var t0 = Date.now();
  var a = runOffseason(state, rng, '2013 offseason');
  printSignings(state, '2013 offseason');
  if (a.stars.length) console.log('  Stars: ' + a.stars.join('; '));
  console.log('  Options: ' + a.summary.optedOut.length + ' opted out, ' + a.summary.declined.length + ' team options declined, ' + a.summary.exercised.length + ' exercised; ' + a.summary.rfa.length + ' restricted free agents');
  var sheets = state.fa.signings.filter(function (s) { return s.matched || s.offerSheet; });
  sheets.forEach(function (s) { console.log('  Offer sheet: ' + s.name + ' -> ' + s.abbr + (s.matched ? ' (matched)' : ' (not matched)')); });
  var nameOf = function (id) { return state.players[id] ? state.players[id].name : id; };
  if (state.fa.retired.length) console.log('  Retired: ' + state.fa.retired.slice(0, 8).map(nameOf).join(', '));

  // Next season: bump the year and go again.
  state.year = 2014; state.phase = 'regular';
  var b = runOffseason(state, rng, '2014 offseason');
  printSignings(state, '2014 offseason');
  if (b.stars.length) console.log('  Stars: ' + b.stars.join('; '));
  // Nobody is on two teams, nobody retired is on a roster.
  var ok = true;
  Object.keys(state.players).forEach(function (id) { var p = state.players[id]; if (p.retired && state.teams[p.team]) ok = false; });
  check(ok, 'no retired player on a roster');
  console.log('\n  Two offseasons simulated in ' + (Date.now() - t0) + ' ms');
})();

console.log('\n' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
