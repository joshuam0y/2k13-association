// Draft, lottery and progression test. Run: node tools/test-draft.js [--seed N] [--trials N]
// Uses data/league2012.js, plus data/drafts.js and data/targets.js when they exist.
// The 10-offseason progression check uses fake targets so it does not depend on the real file.
'use strict';
const fs = require('fs');
const path = require('path');

global.window = global;
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'data/league2012.js'));
const HAS_DRAFTS = fs.existsSync(path.join(ROOT, 'data/drafts.js'));
const HAS_TARGETS = fs.existsSync(path.join(ROOT, 'data/targets.js'));
if (HAS_DRAFTS) require(path.join(ROOT, 'data/drafts.js'));
if (HAS_TARGETS) require(path.join(ROOT, 'data/targets.js'));
const REAL_TARGETS = global.TARGETS || null;
const PROG = require(path.join(ROOT, 'js/progression.js'));
const DRAFT = require(path.join(ROOT, 'js/draft.js'));

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const SEED = argVal('--seed', 2013);
const TRIALS = argVal('--trials', 40000);

let failures = 0, checks = 0;
function check(ok, msg) {
  checks++;
  if (!ok) failures++;
  console.log((ok ? '  ok   ' : '  FAIL ') + msg);
}
const rng = PROG.mulberry32(SEED);
const L = window.LEAGUE_2012;
const clone = o => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------------------
// A league state shaped like contract-v2.md
// ---------------------------------------------------------------------------
function makeState(seed) {
  const state = { version: 1, year: 2013, phase: 'regular', userTeam: 'OKC', day: 0, rngSeed: seed,
    players: {}, teams: {}, season: null, history: { seasons: [] }, transactions: [], news: [], events: [], settings: {} };
  L.players.forEach(p0 => {
    const p = clone(p0);
    const end = Math.max(2013, p.contractEnd || 2013);
    const sal = [];
    for (let y = 2013; y <= end; y++) sal.push({ year: y, amount: p.salary || 1000000 });
    p.contract = p.team === 'FA' ? { salaries: [], option: null, rookie: false, twoWay: false, signedYear: null } :
      { salaries: sal, option: null, rookie: false, twoWay: false, signedYear: 2012 };
    p.yearsPro = Math.max(0, p.age - 21); p.yearsWithTeam = 1; p.draft = null; p.mood = 60;
    p.stashedUntil = null; p.careerStats = []; p.awards = []; p.retired = false; p.hof = false;
    state.players[p.id] = p;
  });
  L.teams.forEach(t0 => {
    const t = clone(t0);
    t.picks = [];
    for (let y = 2013; y <= 2019; y++) for (let r = 1; r <= 2; r++) t.picks.push({ year: y, round: r, original: t.abbr, protection: null });
    t.budget = { coaching: 50, facilities: 50, health: 50, scouting: 50 };
    state.teams[t.abbr] = t;
  });
  return state;
}
// Records: team i of the given order gets the i-th best record (worst first).
function setStandings(state, worstFirst) {
  const standings = {};
  worstFirst.forEach((a, i) => { const w = 15 + i * 2; standings[a] = { w, l: 82 - w, pf: 8000 + i, pa: 8000 }; });
  state.season = { year: state.year, standings, playoffs: null };
}
function strengthOrder(state, r) {
  const sum = {};
  Object.keys(state.teams).forEach(a => { sum[a] = 0; });
  Object.values(state.players).forEach(p => {
    if (!p.retired && sum[p.team] != null && !p.stashedUntil) sum[p.team] += Math.max(0, p.ovr - 60) ** 1.5;
  });
  return Object.keys(sum).map(a => [a, sum[a] * (0.8 + 0.4 * r())]).sort((x, y) => x[1] - y[1]).map(x => x[0]);
}
function movePick(state, year, round, from, to, protection) {
  const tf = state.teams[from], tt = state.teams[to];
  const i = tf.picks.findIndex(p => p.year === year && p.round === round && p.original === from);
  const pk = tf.picks.splice(i, 1)[0];
  pk.protection = protection || null;
  tt.picks.push(pk);
}

// ---------------------------------------------------------------------------
// 1. Lottery odds, both eras
// ---------------------------------------------------------------------------
console.log('\n1. Lottery odds (' + TRIALS + ' draws per era)');
const measured = {};
[[2015, DRAFT.ODDS_1994, 3, 4], [2020, DRAFT.ODDS_2019, 4, 5]].forEach(([year, real, draws, worstFloor]) => {
  const state = makeState(SEED);
  state.year = year;
  const abbrs = Object.keys(state.teams);
  setStandings(state, abbrs);
  const lt = DRAFT.lotteryTeams(state, year);
  check(lt.length === 14, year + ': 14 lottery teams (' + lt.length + ')');
  const first = new Array(14).fill(0), worstPick = new Array(15).fill(0), topN = new Array(14).fill(0);
  let maxDrop = 0, orderOk = true;
  for (let t = 0; t < TRIALS; t++) {
    const res = DRAFT.lottery(state, rng, { dryRun: true });
    first[res.teams[0].seed - 1]++;
    res.teams.forEach(x => {
      if (x.seed === 1) worstPick[x.pick]++;
      if (x.pick <= draws) topN[x.seed - 1]++;
      maxDrop = Math.max(maxDrop, x.pick - x.seed);
    });
    // Teams not drawn stay in record order
    const rest = res.teams.slice(draws).map(x => x.seed);
    for (let i = 1; i < rest.length; i++) if (rest[i] < rest[i - 1]) orderOk = false;
  }
  const pctOf = n => Math.round(1000 * n / TRIALS) / 10;
  const meas = first.map(pctOf);
  measured[year < 2019 ? '2013 to 2018' : '2019 on'] = meas;
  console.log('   seed:      ' + real.map((_, i) => String(i + 1).padStart(5)).join(''));
  console.log('   real %:    ' + real.map(x => (x / 10).toFixed(1).padStart(5)).join(''));
  console.log('   measured %:' + meas.map(x => x.toFixed(1).padStart(5)).join(''));
  console.log('   in top ' + draws + ' %: ' + topN.map(n => pctOf(n).toFixed(1).padStart(5)).join(''));
  let worstErr = 0;
  meas.forEach((m, i) => { worstErr = Math.max(worstErr, Math.abs(m - real[i] / 10)); });
  check(worstErr < 1.0, year + ': every pick 1 chance within 1 point of the real odds (largest gap ' + worstErr.toFixed(2) + ')');
  check(maxDrop === draws, year + ': a team falls at most ' + draws + ' spots (measured ' + maxDrop + ')');
  check(worstPick.slice(worstFloor + 1).every(n => n === 0), year + ': the worst team picks no lower than ' + worstFloor);
  check(orderOk, year + ': teams not drawn keep record order');
});

// ---------------------------------------------------------------------------
// 2. Order, traded and protected picks
// ---------------------------------------------------------------------------
console.log('\n2. Order and protections');
{
  const state = makeState(SEED);
  const abbrs = Object.keys(state.teams);
  // CHA worst, then WAS, ...; MIA best
  const worstFirst = ['CHA', 'WAS', 'ORL'].concat(abbrs.filter(a => ['CHA', 'WAS', 'ORL', 'MIA'].indexOf(a) < 0), ['MIA']);
  setStandings(state, worstFirst);
  movePick(state, 2013, 1, 'CHA', 'OKC', { top: 10, until: 2014 });  // protected: stays with CHA, rolls to 2014
  movePick(state, 2013, 1, 'WAS', 'HOU', null);                      // unprotected: conveys
  movePick(state, 2013, 2, 'ORL', 'BOS', null);                      // second-rounder conveys
  movePick(state, 2013, 1, 'MIA', 'PHX', { top: 5, until: 2013 });   // late pick: conveys
  const ord = DRAFT.order(state, 2013);
  check(ord.length === 60, '60 picks (' + ord.length + ')');
  const playoff = new Set();
  ['East', 'West'].forEach(c => worstFirst.filter(a => state.teams[a].conf === c).reverse().slice(0, 8).forEach(a => playoff.add(a)));
  check(ord.slice(0, 14).every(s => !playoff.has(s.original)) && ord.slice(14, 30).every(s => playoff.has(s.original)), 'first 14 are the non-playoff teams, then the playoff teams');
  const rest = ord.slice(14, 30).map(s => worstFirst.indexOf(s.original));
  check(rest.every((x, i) => i === 0 || x > rest[i - 1]), 'playoff teams pick by record, worst first');
  const r2 = ord.slice(30).map(s => s.original);
  check(r2.join() === worstFirst.join(), 'second round is by record, worst first');
  const cha = ord.find(s => s.round === 1 && s.original === 'CHA');
  check(cha.team === 'CHA' && cha.protectedFor === 'OKC', 'top-10 protected CHA pick stays with CHA (pick ' + cha.overall + ')');
  check(ord.find(s => s.round === 1 && s.original === 'WAS').team === 'HOU', 'unprotected WAS pick goes to HOU');
  check(ord.find(s => s.round === 2 && s.original === 'ORL').team === 'BOS', 'ORL second-rounder goes to BOS');
  check(ord.find(s => s.round === 1 && s.original === 'MIA').team === 'PHX', 'MIA pick (30th, top-5 protected) conveys to PHX');
  state.phase = 'draftLottery';
  DRAFT.lottery(state, rng);
  DRAFT.simPicks(state, { stopAtUser: false });
  DRAFT.signRookies(state);
  const rolled = state.teams.OKC.picks.find(p => p.original === 'CHA' && p.round === 1);
  check(rolled && rolled.year === 2014 && rolled.protection && rolled.protection.top === 10, 'CHA pick rolled to 2014, still top-10 protected');
  check(state.teams.HOU.picks.every(p => p.year > 2013), 'used picks removed after the draft');
  check(state.teams.CHA.picks.some(p => p.year === 2020 && p.original === 'CHA'), 'next own picks added (2020)');
  // 2014: CHA worst again, protection still on (until 2014): stays; 2015 it conveys unprotected
  state.year = 2014; setStandings(state, worstFirst);
  const o14 = DRAFT.order(state, 2014);
  check(o14.find(s => s.round === 1 && s.original === 'CHA').team === 'CHA', '2014: CHA pick protected again');
  DRAFT.startDraft(state, 2014);
  const r15 = state.teams.OKC.picks.find(p => p.original === 'CHA' && p.round === 1);
  check(r15 && r15.year === 2015 && r15.protection === null, 'after 2014 the CHA pick rolls to 2015 unprotected');
}

// ---------------------------------------------------------------------------
// 3. A full draft (real 2013 class when data/drafts.js exists)
// ---------------------------------------------------------------------------
console.log('\n3. Draft ' + (HAS_DRAFTS ? '(real 2013 class from data/drafts.js)' : '(no data/drafts.js: generated class)'));
{
  const state = makeState(SEED + 1);
  setStandings(state, strengthOrder(state, rng));
  state.phase = 'draftLottery';
  const lot = DRAFT.lottery(state, rng);
  console.log('   lottery winner: ' + lot.teams[0].abbr + ' (seed ' + lot.teams[0].seed + ', ' + lot.teams[0].chance + '%)');
  const ids = DRAFT.loadClass(state, 2013);
  check(ids.length >= 60, 'class has at least 60 prospects (' + ids.length + ')');
  const made = DRAFT.simPicks(state);
  const cur = DRAFT.current(state);
  if (cur) {
    check(cur.team === 'OKC', 'sim stops at the user pick (' + cur.overall + ')');
    const bad = DRAFT.pick(state, 'HOU', ids[0]);
    check(!bad.ok, 'out-of-turn pick refused');
    const best = ids.filter(id => state.players[id].team === 'DRAFT').sort((a, b) => state.players[b].pot - state.players[a].pot)[0];
    const v = DRAFT.view(state, 'OKC', best), p = state.players[best];
    check(v.ovr === p.ovr && v.pot === p.pot, 'user sees exact ratings');
    const r = DRAFT.pick(state, 'OKC', best);
    check(r.ok, 'user picks ' + p.name + ' at ' + cur.overall);
  }
  // Let the orchestrator style call (aiPick per slot, skipping the user) finish the draft
  DRAFT.order(state, 2013).forEach(s => { if (s.team !== 'OKC') DRAFT.aiPick(state, s.team, s); });
  const res = DRAFT.signRookies(state);
  check(state.draft.done, 'draft complete');
  const drafted = Object.values(state.players).filter(p => p.draft && p.draft.year === 2013);
  check(drafted.length === 60, '60 players drafted (' + drafted.length + ')');
  check(new Set(drafted.map(p => p.draft.pick)).size === 60, 'every pick number used once');
  const r1 = drafted.filter(p => p.draft.round === 1 && !p.stashedUntil);
  const r2 = drafted.filter(p => p.draft.round === 2 && !p.stashedUntil);
  check(r1.every(p => p.contract.rookie && p.contract.salaries.length === 4 && p.contract.salaries[0].year === 2014 && p.contract.option && p.contract.option.type === 'team'),
    'first-rounders on 4-year rookie scale deals with a team option');
  const top = drafted.find(p => p.draft.pick === 1), last1 = drafted.find(p => p.draft.pick === 30);
  if (top && last1 && !top.stashedUntil && !last1.stashedUntil) check(top.contract.salaries[0].amount > 3 * last1.contract.salaries[0].amount, 'pick 1 earns far more than pick 30 ($' + (top.contract.salaries[0].amount / 1e6).toFixed(2) + 'M vs $' + (last1.contract.salaries[0].amount / 1e6).toFixed(2) + 'M)');
  check(r2.every(p => p.contract.salaries.length === 2 && p.contract.salaries[0].amount < 1e6), 'second-rounders on 2-year minimum deals');
  const stashed = drafted.filter(p => p.stashedUntil);
  check(stashed.every(p => p.injury && p.injury.type === 'Playing overseas' && p.injury.games === 999 && p.contract.salaries.length === 0),
    stashed.length + ' stashed players overseas with no contract yet');
  const teamsCount = {};
  Object.keys(state.teams).forEach(a => { teamsCount[a] = DRAFT.rosterCount(state, a); });
  console.log('   roster counts after the draft (stashed excluded): ' + Object.values(teamsCount).join(' '));
  const left = Object.values(state.players).filter(p => p.team === 'DRAFT' && p.draftYear === 2013);
  check(left.length === 0, 'no 2013 prospects left in the pool');
  const und = Object.values(state.players).filter(p => p.draftYear === 2013 && p.undraftedFA);
  check(und.every(p => p.team === 'FA'), und.length + ' undrafted players are free agents');
  if (HAS_DRAFTS) {
    const realUnd = (window.DRAFTS[2013] || []).filter(p => p.undrafted);
    check(realUnd.every(p => state.players[p.id].team === 'FA' || state.players[p.id].draft), 'real undrafted players are free agents (' + realUnd.length + ')');
    const realStash = (window.DRAFTS[2013] || []).filter(p => p.arrivalYear > 2014).map(p => p.id);
    check(stashed.length === realStash.filter(id => state.players[id].draft).length, 'stashed players are the drafted ones arriving after 2013-14 (' + stashed.length + ')');
    check(drafted.filter(p => !p.stashedUntil).every(p => !p.injury || p.injury.type !== 'Playing overseas'), 'everyone else is not overseas');
  }
  const first5 = drafted.sort((a, b) => a.draft.pick - b.draft.pick).slice(0, 5).map(p => p.draft.pick + '. ' + p.draft.team + ' ' + p.name + ' ' + p.ovr + '/' + p.pot);
  console.log('   ' + first5.join('; '));
  // Arrival of a stashed player: sign once he arrives
  if (stashed.length) {
    const s = stashed[0];
    const arrive = s.stashedUntil;
    state.year = arrive - 2; state.draft = null;
    DRAFT.signRookies(state);
    check(s.stashedUntil === arrive && s.contract.salaries.length === 0, s.name + ' still overseas in the ' + state.year + ' offseason');
    state.year = arrive - 1;
    DRAFT.signRookies(state);
    check(!s.stashedUntil && !s.injury && s.contract.salaries.length && s.contract.salaries[0].year === arrive,
      s.name + ' arrives for the ' + arrive + ' season and his contract starts then');
  }
}

// ---------------------------------------------------------------------------
// 4. Fictional classes (2027 on)
// ---------------------------------------------------------------------------
console.log('\n4. Fictional class 2027');
{
  const state = makeState(SEED + 2);
  const ids = DRAFT.loadClass(state, 2027);
  const cls = ids.map(id => state.players[id]);
  check(cls.length === 70, '70 prospects (' + cls.length + ')');
  check(cls.every(p => p.age >= 19 && p.age <= 22), 'ages 19 to 22');
  check(new Set(cls.map(p => p.name)).size === 70, 'names unique');
  check(cls.every(p => p.fictional && !p.nbaId && p.attrs && Object.keys(p.attrs).length === 22), 'fictional, 22 attributes each');
  const ovr = cls.map(p => p.ovr).sort((a, b) => b - a), pot = cls.map(p => p.pot).sort((a, b) => b - a);
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  console.log('   ovr top/median/low ' + ovr[0] + '/' + ovr[35] + '/' + ovr[69] + '; pot ' + pot[0] + '/' + pot[35] + '/' + pot[69]);
  check(ovr[0] >= 70 && ovr[0] <= 86 && ovr[69] >= 45 && ovr[69] <= 66, 'ovr range like real rookies');
  check(pot[0] >= 82 && pot[0] <= 97 && mean(pot) > mean(ovr) + 5, 'potential range like real classes');
  if (HAS_DRAFTS) {
    const real = [].concat(...Object.values(window.DRAFTS)).filter(p => p.ovr != null);
    console.log('   real classes: mean ovr ' + mean(real.map(p => p.ovr)).toFixed(1) + ', pot ' + mean(real.map(p => p.pot || p.ovr)).toFixed(1) +
      '; fictional: ' + mean(ovr).toFixed(1) + ', ' + mean(pot).toFixed(1));
  }
  const pos = {}; cls.forEach(p => { pos[p.pos] = (pos[p.pos] || 0) + 1; });
  console.log('   positions ' + JSON.stringify(pos) + '; e.g. ' + cls.slice(0, 4).map(p => p.name + ' ' + p.pos + ' ' + p.age + ' ' + p.ovr + '/' + p.pot).join('; '));
  // weighted overall stays consistent after scaling
  const p = clone(cls[0]); const w0 = p.ovr - PROG.weightedOvr(p.attrs, p.pos);
  PROG.setOvr(p, p.ovr + 6);
  const w1 = p.ovr - PROG.weightedOvr(p.attrs, p.pos);
  check(Math.abs(w1 - w0) < 0.6, 'setOvr keeps the attribute calibration (offset ' + w0.toFixed(2) + ' then ' + w1.toFixed(2) + ')');
}

// ---------------------------------------------------------------------------
// 5. Ten offseasons with fake targets
// ---------------------------------------------------------------------------
console.log('\n5. Ten offseasons (fake targets)');
function fakeTargets(r) {
  const T = {};
  L.players.forEach(p => {
    const t = { 2013: p.ovr };
    let ovr = p.ovr, age = p.age;
    const peakAge = 26 + Math.floor(r() * 5);
    for (let y = 2014; y <= 2030; y++) {
      if ((ovr < 60 && age > 28) || age >= 39 || (age >= 34 && r() < 0.25)) break;
      age++;
      const d = age <= peakAge ? Math.max(0, (p.pot - ovr) * 0.35) + 0.5 : (age <= 31 ? -1 : age <= 34 ? -2.5 : -4);
      ovr = Math.max(40, Math.min(99, ovr + d + (r() - 0.5) * 3));
      t[y] = Math.round(ovr);
    }
    const years = Object.keys(t).map(Number);
    t.retire = years[years.length - 1] + 1; // first season not played, like data/targets.js
    T[p.id] = t;
  });
  return T;
}
function refill(state, minSize, maxSize) {
  // stand-in for the free agency module: cut down to maxSize, then sign the best free agents
  Object.keys(state.teams).forEach(a => {
    const roster = Object.values(state.players).filter(p => p.team === a && !p.retired && !p.stashedUntil).sort((x, y) => x.ovr - y.ovr);
    while (roster.length > maxSize) { const p = roster.shift(); p.team = 'FA'; p.contract = { salaries: [], option: null, rookie: false, twoWay: false, signedYear: null }; }
  });
  const fas = Object.values(state.players).filter(p => p.team === 'FA' && !p.retired).sort((a, b) => b.ovr - a.ovr);
  let short = 0;
  Object.keys(state.teams).forEach(a => {
    while (DRAFT.rosterCount(state, a) < minSize) {
      const p = fas.shift();
      if (!p) { short++; break; }
      p.team = a;
      p.contract = { salaries: [{ year: state.year + 1, amount: 1000000 }], option: null, rookie: false, twoWay: false, signedYear: state.year };
    }
  });
  return short;
}
{
  global.TARGETS = fakeTargets(PROG.mulberry32(SEED + 9));
  const T = global.TARGETS;
  const state = makeState(SEED + 3);
  const r = PROG.mulberry32(SEED + 4);
  const devs = [], retireGaps = [], perYear = [], minRoster = [], shortages = [];
  let streakOk = true, everDrafted = [];
  const startAge = {}; Object.values(state.players).forEach(p => { startAge[p.id] = p.age; });
  for (let n = 0; n < 10; n++) {
    const y = state.year;
    // in-season streaks (six months)
    state.phase = 'regular';
    for (let m = 0; m < 6; m++) {
      PROG.inSeason(state, r);
      Object.values(state.players).forEach(p => { if (p.form && Math.abs(p.form) > 3) streakOk = false; });
    }
    setStandings(state, strengthOrder(state, r));
    state.phase = 'draftLottery'; DRAFT.lottery(state, r);
    if (n === 0) {
      const early = Object.values(state.players).filter(p => p.retired && p.retiredYear === y).length;
      check(early > 0, 'retirements are announced at the lottery, before free agency (' + early + ')');
    }
    state.phase = 'draft'; DRAFT.simPicks(state, { stopAtUser: false }); DRAFT.signRookies(state);
    everDrafted = everDrafted.concat(Object.values(state.players).filter(p => p.draft && p.draft.year === y).map(p => [p.id, p.ovr, p.age]));
    state.phase = 'training';
    const out = PROG.offseason(state, r);
    const again = PROG.offseason(state, r);
    if (n === 0) check(again.changes.length === 0 && again.retired.length === 0, 'a second offseason call in the same summer does nothing');
    const retiredNow = Object.keys(state.players).filter(id => state.players[id].retired && state.players[id].retiredYear === y);
    perYear.push(retiredNow.length);
    retiredNow.forEach(id => {
      const p = state.players[id];
      if (T[id] && p.ovr < 80) retireGaps.push(y - (T[id].retire - 1));
    });
    state.year++;
    Object.values(state.players).forEach(p => {
      if (p.retired || !T[p.id] || T[p.id][state.year] == null) return;
      devs.push(p.ovr - T[p.id][state.year]);
    });
    let mn = 99;
    Object.keys(state.teams).forEach(a => { mn = Math.min(mn, DRAFT.rosterCount(state, a)); });
    minRoster.push(mn);
    shortages.push(refill(state, 13, 15));
  }
  const abs = devs.map(Math.abs);
  const meanAbs = abs.reduce((s, x) => s + x, 0) / abs.length;
  const within3 = abs.filter(x => x <= 3).length / abs.length;
  const within5 = abs.filter(x => x <= 5).length / abs.length;
  console.log('   history players: ' + devs.length + ' player-seasons, mean |ovr - target| ' + meanAbs.toFixed(2) +
    ', within 3: ' + (100 * within3).toFixed(1) + '%, within 5: ' + (100 * within5).toFixed(1) + '%');
  check(meanAbs <= 2.5, 'history players follow their targets (mean gap ' + meanAbs.toFixed(2) + ')');
  check(within3 >= 0.8 && within5 >= 0.97, 'gaps are typically within 2 to 3 points');
  console.log('   retirements per offseason: ' + perYear.join(' '));
  check(perYear.every(n => n >= 5) && perYear.reduce((s, x) => s + x, 0) > 150, 'retirements happen every year');
  const near = retireGaps.filter(g => Math.abs(g) <= 1).length / Math.max(1, retireGaps.length);
  check(retireGaps.length > 30 && near >= 0.9, 'history players under 80 retire within a year of their real year (' + (100 * near).toFixed(1) + '% of ' + retireGaps.length + ')');
  const stillActive = Object.values(state.players).filter(p => !p.retired && T[p.id] && T[p.id].retire < state.year - 1);
  check(stillActive.every(p => p.ovr >= 76), 'players past their real retirement are only those the sim kept good (' + stillActive.length + ')');
  console.log('   smallest roster after each offseason (before refill): ' + minRoster.join(' '));
  check(minRoster.every(n => n >= 8), 'no roster collapses (min ' + Math.min(...minRoster) + ')');
  check(shortages.every(n => n === 0), 'free agent pool always refills rosters to 13');
  check(streakOk, 'in-season streaks stay within 3 points');
  // Age curve for draftees without targets: young players grow
  const grown = everDrafted.filter(([id, o, a]) => a <= 21 && state.players[id] && !state.players[id].retired && state.year - state.players[id].draft.year >= 4)
    .map(([id, o]) => state.players[id].ovr - o);
  const meanGrow = grown.reduce((s, x) => s + x, 0) / Math.max(1, grown.length);
  console.log('   draftees aged 21 or less, 4+ years later: mean change +' + meanGrow.toFixed(1) + ' (' + grown.length + ' players)');
  check(grown.length > 20 && meanGrow > 4, 'young players develop toward potential');
  const vets = Object.values(state.players).filter(p => !T[p.id] && !p.retired && p.age >= 33);
  console.log('   non-history players 33 and older still active: ' + vets.length);
  const nRet = Object.values(state.players).filter(p => p.retired).length;
  console.log('   total retired after 10 offseasons: ' + nRet);
  const sample = ['jamesle01', 'duranke01', 'bryanko01', 'duncati01', 'davisan02', 'irvinky01'].filter(id => state.players[id]);
  sample.forEach(id => {
    const p = state.players[id];
    console.log('   ' + p.name + ': ' + (p.retired ? 'retired ' + p.retiredYear : 'age ' + p.age + ' ovr ' + p.ovr) + ', target ' + T[id][state.year] + ', real retire ' + T[id].retire);
  });
}

// ---------------------------------------------------------------------------
// 6. Real targets (when data/targets.js exists): three offseasons
// ---------------------------------------------------------------------------
if (REAL_TARGETS) {
  console.log('\n6. Real targets from data/targets.js (3 offseasons)');
  global.TARGETS = REAL_TARGETS;
  const state = makeState(SEED + 5);
  const r = PROG.mulberry32(SEED + 6);
  const devs = [];
  for (let n = 0; n < 3; n++) {
    state.phase = 'training';
    PROG.offseason(state, r);
    state.year++;
    Object.values(state.players).forEach(p => {
      const t = REAL_TARGETS[p.id];
      if (!p.retired && t && t[state.year] != null) devs.push(Math.abs(p.ovr - t[state.year]));
    });
  }
  const m = devs.reduce((s, x) => s + x, 0) / Math.max(1, devs.length);
  console.log('   ' + devs.length + ' player-seasons, mean gap ' + m.toFixed(2));
  check(devs.length === 0 || m <= 3, 'real targets followed (mean gap ' + m.toFixed(2) + ')');
}

console.log('\nLottery pick 1 odds measured: ' + JSON.stringify(measured));
console.log('\n' + (checks - failures) + '/' + checks + ' checks passed');
process.exit(failures ? 1 : 0);
