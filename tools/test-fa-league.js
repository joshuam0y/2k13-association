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
const uniq = [...new Set(warnings.filter(w => /freeagency|FA\.|faDay|autoResign|startOffseason/.test(w)))];
check(!uniq.length, 'no free agency warnings ' + uniq.slice(0, 5).join(' | '));
console.warn = origWarn;
console.log('\n' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
