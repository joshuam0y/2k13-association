// Free agency over several full offseasons with every module loaded: node tools/test-fa-league.js [seasons] [seed]
// Checks that no player 85+ is left unsigned after free agency, that stars with Bird rights mostly stay,
// that stashed draft picks are never waived, and that teams end free agency at 15 or fewer.
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
  'js/draft.js', 'js/progression.js', 'js/coaches.js', 'js/gleague.js', 'js/awards.js', 'js/news.js', 'js/league.js'];
for (const f of files) if (fs.existsSync(path.join(root, f))) require(path.join(root, f));
const L = window.LEAGUE, FA = window.FA;
const seasons = Number(process.argv[2] || 4), seed = Number(process.argv[3] || 77);

let fails = 0, passes = 0;
function check(cond, msg) { if (cond) passes++; else { fails++; console.log('FAIL: ' + msg); } }
const m = x => '$' + (x / 1e6).toFixed(1) + 'M';

const s = L.newLeague('MIA', { seed });
let starsHeld = 0, starsStayed = 0;
const left = [];
for (let n = 0; n < seasons; n++) {
  let r, g = 0;
  do { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); r = L.advance(s, 'endPlayoffs'); } while (r.stopped !== 'seasonOver' && ++g < 400);
  g = 0;
  while (s.phase !== 'resign' && g++ < 10) L.advance(s, 'nextPhase', { auto: true });
  if (!s.fa || s.fa.year <= s.year) FA.startOffseason(s);
  const Y = s.fa.year;
  const stashed = Object.values(s.players).filter(p => p.stashedUntil != null && s.teams[p.team]).map(p => [p.id, p.team]);
  const held = Object.keys(s.fa.rights).filter(id => s.players[id].ovr >= 85 && !s.players[id].retired).map(id => [id, s.fa.rights[id].team]);
  L.advance(s, 'nextPhase', { auto: true });   // resign -> freeAgency (the user's team is auto re-signed)
  FA.setSimMode(s, 'auto');                     // simming past free agency: no popups, the front office decides
  const fa = s.fa;
  for (let d = 0; d < 40 && fa.stage !== 'done'; d++) FA.simDay(s);
  check(fa.stage === 'done', Y + ': free agency finished');
  const unsigned = FA.freeAgents(s).filter(p => p.ovr >= 85);
  check(!unsigned.length, Y + ': no player 85+ left unsigned ' + unsigned.map(p => p.name + ' ' + p.ovr).join(', '));
  const starSign = fa.signings.filter(x => x.ovr >= 85 && !x.resign);
  starSign.forEach(x => check(x.day <= 10, Y + ': star ' + x.name + ' found a team in the first days (day ' + x.day + ')'));
  const lost = stashed.filter(([id]) => !s.teams[s.players[id].team]);   // traded is fine, waived is not
  check(!lost.length, Y + ': stashed picks kept (' + stashed.length + ' overseas) ' + lost.map(([id]) => s.players[id].name).join(', '));
  check(!fa.released.some(x => stashed.some(([id]) => id === x.id)), Y + ': no stashed pick in the release list');
  const big = Object.keys(s.teams).filter(a => FA.rosterCount(s, a) > 15);
  check(!big.length, Y + ': no roster above 15 after free agency ' + big.join(' '));
  held.forEach(([id, t]) => { starsHeld++; if (s.players[id].team === t) starsStayed++; else left.push(Y + ' ' + s.players[id].name + ' ' + t + '->' + s.players[id].team); });
  const top = fa.signings.filter(x => x.ovr >= 85).map(x => x.name + ' ' + x.ovr + ' ' + x.abbr + (x.resign ? ' re-signs' : ' signs') + ' day ' + x.day + ' ' + x.salaries.length + 'y ' + m(x.salaries.reduce((a, y) => a + y.amount, 0)));
  console.log(Y + ' offseason: ' + (top.join('; ') || 'no 85+ free agents'));
  L.advance(s, 'nextPhase', { auto: true });   // freeAgency -> training
  L.advance(s, 'nextPhase', { auto: true });   // training -> new season
}
console.log('stars with Bird rights who stayed: ' + starsStayed + ' of ' + starsHeld + (left.length ? ' (left: ' + left.join('; ') + ')' : ''));
check(starsHeld === 0 || starsStayed / starsHeld >= 0.7, 'stars mostly stay with their teams (' + starsStayed + '/' + starsHeld + ')');

// ---------------------------------------------------------------------------
// Part 2: the user's roster only changes through his popups. Three seasons as CHA in "ask me" mode:
// every player who joins or leaves the user's team during a sim must come from a decision he answered,
// a "While you simmed" summary he saw, a contract running out, a retirement or his own draft pick.
// AI teams still fill their rosters to 13 to 15 on their own.
// ---------------------------------------------------------------------------
{
  const u = L.newLeague('CHA', { seed: seed + 5 });
  const mine = () => new Set(Object.values(u.players).filter(p => p.team === u.userTeam && !p.retired).map(p => p.id));
  const seen = { short: 0, cut: 0, pitch: 0, summary: 0, offerSheet: 0, injury: 0, injuryReturn: 0, restored: 0, notices: 0 };
  let unexplained = [], k = 0, injuredPlayed = [];
  const answer = e => {
    if (e.type === 'roster' && e.kind === 'short') { seen.short++; return k++ % 3 === 2 || !(e.preselect || []).length ? 'ai' : { sign: e.preselect }; }
    if (e.type === 'roster' && e.kind === 'cut') { seen.cut++; return k++ % 2 ? 'ai' : { waive: e.preselect }; }
    if (e.type === 'roster' && e.kind === 'pitch') { seen.pitch++; return k++ % 2 ? 'pass' : { sign: e.playerId }; }
    if (e.type === 'contractDecision' && e.kind === 'offerSheet') { seen.offerSheet++; return k++ % 2 ? 'match' : 'letgo'; }
    if (e.type === 'contractDecision') return e.options && e.options[0] ? e.options[0].value : 'ok';
    if (e.type === 'simSummary') { seen.summary++; return 'ok'; }
    if (e.type === 'tradeOffer') return 'decline';
    if (e.type === 'injury') { seen.injury++; return 'ok'; }
    if (e.type === 'injuryReturn') { seen.injuryReturn++; return 'restore'; }
    return 'ok';
  };
  // a step of the sim: what changed on the user's team must be explained
  const step = (fn, label) => {
    const before = mine(), evBefore = new Set(u.events), expBefore = u.fa && u.fa.summary ? u.fa.summary.expiring.length : 0;
    const r = fn();
    const after = mine(), newEvents = u.events.filter(e => !evBefore.has(e));
    const told = new Set();
    newEvents.filter(e => e.type === 'simSummary').forEach(e => (e.moved || []).forEach(id => told.add(id)));
    const expiring = new Set(u.fa && u.fa.summary ? u.fa.summary.expiring : []);
    const ok = (id, inOut) => told.has(id) || u.players[id].retired || (inOut === 'out' && expiring.has(id)) ||
      (inOut === 'in' && u.players[id].draft && u.players[id].draft.team === u.userTeam && u.players[id].draft.year === u.year);
    after.forEach(id => { if (!before.has(id) && !ok(id, 'in')) unexplained.push(label + ': ' + u.players[id].name + ' joined'); });
    before.forEach(id => { if (!after.has(id) && !ok(id, 'out')) unexplained.push(label + ': ' + u.players[id].name + ' left (' + u.players[id].team + ')'); });
    void expBefore;
    return r;
  };
  const resolveAll = () => {
    let g = 0;
    while (u.events.some(e => !e.resolved) && g++ < 50) {
      const i = u.events.findIndex(e => !e.resolved);
      L.resolveEvent(u, i, answer(u.events[i]));   // the user's answer: any roster change here is his choice
      if (u.events[i] && u.events[i].type === 'injuryReturn' && u.events[i].answer === 'restore') {
        const t = u.teams[u.userTeam];
        if (t.rotation.indexOf(u.events[i].playerId) >= 0 && t.rotation.indexOf(u.events[i].playerId) < 5) seen.restored++;
      }
    }
    L.clearResolved(u);
  };
  // a manual rotation for the user: his top 10 by overall, starters 34 minutes, bench 14
  const manual = () => {
    const t = u.teams[u.userTeam], ids = L.leagueView(u).players.filter(p => p.team === u.userTeam).sort((a, b) => b.ovr - a.ovr).map(p => p.id).slice(0, 10);
    t.rotation = ids; t.minutes = {}; ids.forEach((id, i) => { t.minutes[id] = i < 5 ? 34 : 14; });
    u.season.lineups = u.season.lineups || {}; u.season.lineups[u.userTeam] = { starters: ids.slice(0, 5), minutes: Object.assign({}, t.minutes) };
  };
  // one sure injury to the user's best starter a month into each season (the engine also adds its own)
  const E = window.ENGINE, simDays0 = E.simDays;
  E.simDays = function (season) {
    const out = simDays0.apply(this, arguments);
    if (season === u.season && season.day >= 30 && u._hurtYear !== u.year && season.phase === 'regular') {
      u._hurtYear = u.year;
      const t = u.teams[u.userTeam], id = t.rotation ? t.rotation[0] : L.leagueView(u).players.filter(p => p.team === u.userTeam).sort((a, b) => b.ovr - a.ovr)[0].id;
      if (!season.injuries[id]) season.injuries[id] = { type: 'Sprained ankle', games: 3 };
    }
    return out;
  };
  for (let n = 0; n < 3; n++) {
    if (n !== 1) manual(); else { u.teams[u.userTeam].rotation = null; u.teams[u.userTeam].minutes = null; if (u.season.lineups) delete u.season.lineups[u.userTeam]; }
    let r, g = 0;
    do {
      resolveAll();
      const hurt = Object.keys(u.season.injuries || {}).filter(id => u.players[id] && u.players[id].team === u.userTeam && u.season.injuries[id].games > 0 && u.season.injuries[id].games < 900);
      const gp = {}; hurt.forEach(id => { gp[id] = (u.season.playerStats[id] || {}).g || 0; });
      r = step(() => L.advance(u, { days: 3 }), 'season ' + u.year);
      hurt.forEach(id => { const now = (u.season.playerStats[id] || {}).g || 0; if (now > gp[id] && u.season.injuries[id] && u.season.injuries[id].games > 2) injuredPlayed.push(u.players[id].name); });
      if (Array.isArray(u.notices) && u.notices.length) { seen.notices += u.notices.length; u.notices = []; }
    } while (r.stopped !== 'seasonOver' && ++g < 400);
    // the offseason the way a user plays it: sim past the draft, re-sign by hand (nobody), free agency in ask mode
    g = 0;
    while (u.phase !== 'regular' && g++ < 200) {
      resolveAll();
      if (u.phase === 'resign' && n === 0 && !u._cut) {
        // let several players go so the team ends up short when free agency ends
        u._cut = true;
        Object.values(u.players).filter(p => p.team === u.userTeam && !p.retired && !FA.isStashed(p)).sort((a, b) => a.ovr - b.ovr).slice(0, 4).forEach(p => FA.release(u, u.userTeam, p.id));
        Object.keys(u.fa.rights).forEach(id => { if (u.fa.rights[id].team === u.userTeam) FA.letGo(u, u.userTeam, id); });
      }
      if (u.phase === 'freeAgency' && n === 1 && u.fa && u.fa.day >= 25 && !u._fill) {
        // the user signs camp bodies himself until he is over 15, so the end of free agency asks him to waive
        u._fill = true;
        FA.freeAgents(u).sort((a, b) => a.ovr - b.ovr).forEach(p => {
          if (FA.rosterCount(u, u.userTeam) >= 17) return;
          const d = FA.demand(u, p.id, u.userTeam);
          const res = FA.offer(u, u.userTeam, p.id, { salaries: [{ year: u.fa.year, amount: d.min }] });
          // a camp body who turns the minimum down: the user signs him anyway (his own move, not the sim's)
          if (!res.accepted && p.team === 'FA') { p.team = u.userTeam; p.contract = { salaries: [{ year: u.fa.year, amount: d.min }], option: null, rookie: false, twoWay: false, signedYear: u.fa.year, via: 'min' }; }
        });
      }
      const opts = u.phase === 'draft' || u.phase === 'resign' ? { auto: true } : {};
      if (u.phase === 'freeAgency' && n === 1 && u.fa && u.fa.day < 25) {
        step(() => { for (let d = 0; d < 30 && u.fa.day < 25 && !u.events.some(e => !e.resolved); d++) FA.simDay(u); }, 'fa days ' + u.year);
        continue;
      }
      step(() => L.advance(u, 'nextPhase', opts), u.phase + ' ' + u.year);
    }
    check(u.phase === 'regular', 'user run: offseason ' + (u.year - 1) + ' finished');
    resolveAll();
    const rr = L.rosterRules(u.year), bad = [];
    for (const abbr in u.teams) { const c = L.rosterOf(u, abbr, u.year).std.length; if (c < rr.min || c > rr.max) bad.push(abbr + ' ' + c); }
    check(!bad.length, 'user run ' + u.year + ': every team has 13 to 15 players ' + bad.join(', '));
  }
  check(!unexplained.length, 'user run: the user team never gained or lost a player without a decision or a summary (' + unexplained.length + ') ' + unexplained.slice(0, 6).join('; '));
  check(seen.short > 0, 'user run: a short roster asked "sign one?" (' + seen.short + ')');
  check(seen.cut > 0, 'user run: a roster over 15 asked who to waive (' + seen.cut + ')');
  check(seen.pitch > 0 && seen.pitch <= 9, 'user run: a few free agent pitches, never spammy (' + seen.pitch + ' in 3 summers)');
  check(seen.summary > 0, 'user run: "While you simmed" summaries after simming past steps (' + seen.summary + ')');
  check(seen.injury > 0, 'user run: injury popups (' + seen.injury + ')');
  check(seen.injuryReturn > 0 && seen.restored > 0, 'user run: back from injury popups put manual starters back (' + seen.injuryReturn + ' asked, ' + seen.restored + ' restored)');
  check(seen.notices > 0, 'user run: auto rotation returns are short notices (' + seen.notices + ')');
  check(!injuredPlayed.length, 'user run: hurt players never play ' + injuredPlayed.slice(0, 5).join(', '));
  console.log('user run: ' + JSON.stringify(seen));
  E.simDays = simDays0;
}

const uniq = [...new Set(warnings.filter(w => /freeagency|FA\.|faDay|autoResign|startOffseason/.test(w)))];
check(!uniq.length, 'no free agency warnings ' + uniq.slice(0, 5).join(' | '));
console.warn = origWarn;
console.log('\n' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
