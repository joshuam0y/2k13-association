// Rookie signing (js/rookies.js): node tools/test-rookies.js [seed]
// Runs one real draft with every league module loaded, then checks that declining a pick makes him a
// free agent with no contract (roster and payroll drop, a transaction is logged), that signing keeps his
// deal, that stashing a second-rounder keeps his rights, and that nothing can be declined for another
// team or once the regular season starts.
'use strict';
const fs = require('fs');
const path = require('path');
global.window = global;
const root = path.join(__dirname, '..');
const warnings = [];
const origWarn = console.warn;
console.warn = (...a) => { warnings.push(a.join(' ')); };
const files = ['data/league2012.js', 'data/drafts.js', 'data/targets.js', 'data/cap-history.js', 'data/coaches.js', 'data/gleague.js',
  'data/history.js', 'data/personalities.js', 'data/picks-2012.js', 'js/engine.js', 'js/cba.js', 'js/trade.js', 'js/freeagency.js', 'js/mood.js',
  'js/draft.js', 'js/draft-gen.js', 'js/progression.js', 'js/coaches.js', 'js/gleague.js', 'js/awards.js', 'js/news.js', 'js/league.js'];
for (const f of files) if (fs.existsSync(path.join(root, f))) require(path.join(root, f));
const R = require(path.join(root, 'js/rookies.js'));
const L = window.LEAGUE, FA = window.FA, CBA = window.CBA, DRAFT = window.DRAFT;
const seed = Number(process.argv[2] || 2013);

let fails = 0, passes = 0;
function check(cond, msg) { if (cond) passes++; else fails++; console.log((cond ? '  ok   ' : '  FAIL ') + msg); }
const clone = o => JSON.parse(JSON.stringify(o));

// A league just past the draft (no season played: the lottery runs on empty standings).
const base = L.newLeague('OKC', { seed });
base.phase = 'draftLottery';
L.advance(base, 'nextPhase');                    // lottery
check(base.phase === 'draft', 'the lottery opens the draft');
check(!R.windowOf(base).open, 'no rookie signing before the draft is over');
L.advance(base, 'nextPhase', { auto: true });    // the whole draft, rookies signed, re-signing opens
check(base.phase === 'resign', 'the draft ends in the re-signing phase');
const D = base.year, Y = D + 1;
check(R.windowOf(base).open, 'rookie signing is open during re-signing');

// The test team: one that drafted a first-rounder and a second-rounder who both signed.
const picksOf = (s, abbr) => R.list(s, abbr);
const teams = Object.keys(base.teams);
const user = teams.find(a => { const l = picksOf(base, a); return l.some(r => r.firstRound && r.status === 'signed') && l.some(r => r.round === 2 && r.status === 'signed'); });
check(!!user, 'some team has a signed first-rounder and a signed second-rounder (' + user + ')');
base.userTeam = user;
const rows = picksOf(base, user);
console.log('  ' + user + ' picks: ' + rows.map(r => '#' + r.pick + ' ' + r.name + ' ' + r.status + ' ' + r.years + 'y ' + (r.first / 1e6).toFixed(2) + 'M').join('; '));
check(rows.every(r => !('pot' in r) && !('potential' in r)), 'the rows never carry potential');
const r1 = rows.find(r => r.firstRound && r.status === 'signed');
const r2 = rows.find(r => r.round === 2 && r.status === 'signed');
check(r1.rookieScale && r1.years === 4 && r1.teamOptions.length === 2, 'the first-rounder is on a 4 year rookie scale deal with two team options');
check(r2.years === 2 && !r2.rookieScale && r2.canStash && !r1.canStash, 'the second-rounder has a 2 year minimum deal and can be stashed; the first-rounder cannot');
check(r1.capHit === base.players[r1.id].contract.salaries[0].amount && r1.capHit > 0, 'cap hit is the first season of the deal');
check(R.pending(base, user), 'the step is pending until the user goes through it');

// ---------- sign keeps the contract ----------
{
  const s = clone(base);
  const before = clone(s.players[r1.id].contract), roster = FA.rosterCount(s, user), pay = FA.payroll(s, user, Y);
  const res = R.apply(s, user, { [r1.id]: 'sign', [r2.id]: 'sign' });
  check(res.ok && !res.declined.length && !res.stashed.length, 'SIGN for everyone changes nothing');
  check(JSON.stringify(s.players[r1.id].contract) === JSON.stringify(before) && s.players[r1.id].team === user, 'a signed pick keeps his team and his exact contract');
  check(FA.rosterCount(s, user) === roster && FA.payroll(s, user, Y) === pay, 'roster and payroll unchanged after SIGN ALL');
  check(!R.pending(s, user), 'the step is done after continuing');
}

// ---------- decline: free agent, no contract ----------
{
  const s = clone(base);
  const roster = FA.rosterCount(s, user), pay = FA.payroll(s, user, Y), cbaPay = CBA.payroll(s, user, Y);
  const pv = R.preview(s, user, { [r2.id]: 'decline' });
  check(pv.roster === roster - 1 && pv.payroll === pay - r2.capHit, 'the preview shows one player and his cap hit off the books');
  const txBefore = s.transactions.length;
  const res = R.decline(s, user, r2.id);
  const p = s.players[r2.id];
  check(res.ok, 'declining the second-rounder works');
  check(p.team === 'FA' && p.contract === null && !p.salary, 'he is a free agent with no contract');
  check(p.draft && p.draft.team === user && p.draft.pick === r2.pick, 'his draft record stays');
  check(FA.rosterCount(s, user) === roster - 1, 'the roster drops by one');
  check(FA.payroll(s, user, Y) === pay - r2.capHit && CBA.payroll(s, user, Y) === cbaPay - r2.capHit, 'payroll drops by his cap hit, with no dead money');
  check(FA.rosterCount(s, user) === pv.roster && FA.payroll(s, user, Y) === pv.payroll, 'the preview matched the result');
  check(FA.freeAgents(s).some(x => x.id === r2.id), 'he is on the free agent list');
  const tx = s.transactions[s.transactions.length - 1];
  check(tx && tx.type === 'release' && tx.ids[0] === r2.id && tx.text.indexOf(p.name) >= 0 && /decline to sign second-round pick/.test(tx.text), 'a transaction line is logged: ' + (tx && tx.text));
  check(!s.transactions.some(t => t.type === 'sign' && t.ids && t.ids[0] === r2.id && /signed second-round pick/.test(t.text)), 'the automatic "signed" line for him is gone');
  check(s.transactions.length === txBefore, 'one line replaces the other');
  check(!R.list(s, user).some(r => r.id === r2.id) && R.released(s).some(x => x.id === r2.id), 'he leaves the list and shows as released this summer');
  const again = R.decline(s, user, r2.id);
  check(!again.ok, 'he cannot be declined twice (' + again.reason + ')');
  // a first-rounder can go too (the page warns first)
  const res1 = R.decline(s, user, r1.id);
  check(res1.ok && s.players[r1.id].team === 'FA' && s.players[r1.id].contract === null, 'a first-rounder can be declined');
  // signRookies (run again on a later step) does not hand him a deal back
  DRAFT.signRookies(s);
  check(s.players[r1.id].team === 'FA' && s.players[r1.id].contract === null, 'a declined pick is not signed again by DRAFT.signRookies');
}

// ---------- not another team's player ----------
{
  const s = clone(base);
  const other = teams.find(a => a !== user && picksOf(s, a).some(r => r.status === 'signed'));
  const op = picksOf(s, other).find(r => r.status === 'signed');
  const before = clone(s.players[op.id]);
  const res = R.decline(s, user, op.id);
  check(!res.ok && /not on the/.test(res.reason), 'cannot decline another team\'s pick (' + res.reason + ')');
  check(JSON.stringify(s.players[op.id]) === JSON.stringify(before), 'his player record is untouched');
  const ap = R.apply(s, user, { [op.id]: 'decline' });
  check(!ap.ok && ap.errors.length === 1 && s.players[op.id].team === other, 'apply refuses it too');
  const vet = Object.values(s.players).find(p => p.team === user && !p.draft && p.contract && p.contract.salaries.length);
  check(vet && !R.decline(s, user, vet.id).ok && s.players[vet.id].team === user, 'cannot use it on a veteran of his own team');
}

// ---------- stash a second-rounder, release a stashed pick's rights ----------
{
  const s = clone(base);
  const roster = FA.rosterCount(s, user), pay = FA.payroll(s, user, Y);
  check(!R.stash(s, user, r1.id).ok, 'a first-rounder cannot be stashed');
  const res = R.stash(s, user, r2.id);
  const p = s.players[r2.id];
  check(res.ok && p.team === user && p.stashedUntil === D + 2 && !(p.contract && p.contract.salaries.length), 'a stashed second-rounder keeps his team, has no deal and is overseas until ' + (D + 2));
  check(FA.rosterCount(s, user) === roster - 1 && FA.payroll(s, user, Y) === pay - r2.capHit && CBA.rosterCount(s, user, Y) === roster - 1, 'he leaves the roster and the cap');
  const row = R.list(s, user).find(r => r.id === r2.id);
  check(row && row.status === 'stashed' && row.capHit === 0, 'he shows as stashed with no cap hit');
  // next summer's signRookies brings him over on a second-round deal
  const n = clone(s);
  n.year = D + 1; n.draft = { year: D + 1, done: true, order: [] };
  DRAFT.signRookies(n);
  const q = n.players[r2.id];
  check(q.stashedUntil == null && q.contract && q.contract.salaries.length === 2 && q.contract.salaries[0].year === D + 2, 'a year later he arrives and signs his deal');
  // a pick who was already overseas at the draft: his rights can be released
  const st2 = clone(base);
  const holder = teams.find(a => picksOf(st2, a).some(r => r.status === 'stashed'));
  if (holder) {
    const sr = picksOf(st2, holder).find(r => r.status === 'stashed');
    const rr = R.decline(st2, holder, sr.id), sp = st2.players[sr.id];
    check(rr.ok && sp.team === 'FA' && sp.contract === null && sp.stashedUntil === sr.until, 'releasing a stashed pick\'s rights: a free agent, still overseas until ' + sr.until + ' (' + sr.name + ')');
    check(!FA.freeAgents(st2).some(x => x.id === sr.id), 'he is not on the market before he comes over');
  } else console.log('  (no stashed pick in this draft)');
}

// ---------- closed once the regular season starts ----------
{
  const s = clone(base);
  // the rest of the offseason as the user who skipped the page: his rookies stay signed
  let g = 0;
  while (s.phase !== 'regular' && g++ < 12) { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); L.advance(s, 'nextPhase', { auto: true }); }
  check(s.phase === 'regular' && s.year === D + 1, 'the new season starts');
  check(!R.windowOf(s).open && !R.pending(s, user), 'the window is closed in the regular season');
  const p = s.players[r1.id];
  check(p.team !== 'FA' && p.contract && p.contract.rookie, 'skipping the page kept the first-rounder signed');
  const res = R.decline(s, p.team, r1.id);
  check(!res.ok && /season started/.test(res.reason) && s.players[r1.id].contract && s.players[r1.id].team === p.team, 'no decline after the season starts (' + res.reason + ')');
  check(!R.apply(s, p.team, { [r1.id]: 'decline' }).ok, 'apply is refused too');
}

console.warn = origWarn;
const uniq = [...new Set(warnings.map(w => w.replace(/\d+/g, '#')))];
if (uniq.length) console.log('module warnings:', uniq.slice(0, 10));
console.log(passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
