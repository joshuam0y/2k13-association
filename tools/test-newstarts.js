// Checks for the older Association starts and the rules added with them: node tools/test-newstarts.js
// starts 1977 to 2003 (data/start-YYYY.js): teams, rosters, draft classes, draft records, honors; 82-game schedules for any league
// size; injuries cost rating while they last and come back; relative team tiers; franchise lineages for the wheel.
const fs = require('fs');
global.window = global;
const warnings = [];
console.warn = (...a) => { warnings.push(a.join(' ')); };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const files = ['data/league2012.js', 'data/drafts.js', 'data/draft-prior.js', 'data/targets.js', 'data/cap-history.js', 'data/coaches.js', 'data/coach-history.js', 'data/gleague.js', 'data/history.js', 'data/personalities.js', 'data/logos.js', 'data/world-events.js', 'data/career-prior.js', 'data/picks-2012.js', 'data/awards-prior.js', 'data/schedules.js', 'data/tendencies.js', 'data/tendency-history.js', 'data/defense-history.js', 'data/alltime-prior.js', 'data/pos-history.js',
  'js/engine.js', 'js/cba.js', 'js/coaches.js', 'js/draft.js', 'js/draft-gen.js', 'js/rookies.js', 'js/progression.js', 'js/gleague.js', 'js/awards.js', 'js/news.js', 'js/mood.js', 'js/trade.js', 'js/freeagency.js', 'js/expansion.js', 'js/league.js', 'js/challenge.js', 'js/positions.js', 'js/future.js', 'js/records.js', 'js/reallife.js'];
files.forEach(f => { if (fs.existsSync(f)) { try { require('../' + f); } catch (e) { /* optional */ } } });
const L = window.LEAGUE, E = window.ENGINE, C = window.CHALLENGE;

// --- the starts
for (let y = 1977; y <= 2003; y++) {
  require('../data/start-' + y + '.js');
  const S = window.START_LEAGUES[y], teams = S.teams.map(t => t.abbr);
  const per = {}; S.players.forEach(p => { if (p.team !== 'FA') per[p.team] = (per[p.team] || 0) + 1; });
  ok(S.season === y && teams.length >= 22 && teams.length <= 29, y + ': ' + teams.length + ' teams');
  ok(teams.every(a => (per[a] || 0) >= 10 && per[a] <= 15) && S.players.every(p => p.team === 'FA' || teams.includes(p.team)), y + ': every team has 10 to 15 players and nobody is on a missing team');
  const ids = new Set(S.players.map(p => p.id));
  ok(ids.size === S.players.length, y + ': no player twice');
  const cls = S.drafts[y] || [];
  ok(cls.length >= 2 * teams.length - 8 && !cls.some(p => ids.has(p.id)), y + ': a full draft class (' + cls.length + '), nobody also on a roster');
  ok(cls.filter(p => p.realPick).length >= 2 * teams.length - 8, y + ': the real picks are in the class with their pick numbers');
  const rostered = S.players.filter(p => p.team !== 'FA');
  ok(rostered.filter(p => p.draft).length / rostered.length > 0.8, y + ': most players carry a real draft record (' + Math.round(100 * rostered.filter(p => p.draft).length / rostered.length) + '%)');
  ok(rostered.every(p => !p.draft || p.draft.year < y), y + ': no draft record from after the start');
  ok(Object.keys(S.prior.awards).length > 40 && Object.keys(S.prior.alltime.active).length > 100, y + ': honors and all-time totals as of the start');
  ok(Object.values(S.prior.awards).every(l => l.every(x => x.year < y)), y + ': no honor from after the start');
  ok(S.players.every(p => p.team === 'FA' || (p.salary > 0 && p.contractEnd >= y)), y + ': every contract runs this season or longer');
}
// --- schedules for any league size
for (const n of [22, 23, 25, 27, 28]) {
  const t = Array.from({ length: n }, (_, i) => ({ abbr: 'T' + i, conf: i % 2 ? 'East' : 'West', div: 'D' + (i % 4) }));
  const s = E.buildSchedule(t, Math.random, '2000-10-30', '2001-04-16'), c = {};
  s.forEach(d => d.games.forEach(g => { c[g.home] = (c[g.home] || 0) + 1; c[g.away] = (c[g.away] || 0) + 1; }));
  ok(Object.values(c).every(v => v === 82), n + ' teams: everyone plays 82 (' + [...new Set(Object.values(c))].join('/') + ')');
}
// --- franchise lineages
ok(C.franchise('WSB') === 'WAS' && C.franchise('NJN') === 'BKN' && C.franchise('SEA') === 'OKC' && C.franchise('CHI') === 'CHI' && C.franchise('KCK') === 'SAC', 'franchise lineages');
// --- a league from an older start: injuries cost rating while they last and come back, expansions arrive
{
  require('../data/start-1988.js');
  const s = L.newLeague('BOS', { seed: 9, start: 1988 });
  ok(Object.keys(s.teams).length === 23, '1988 start: 23 teams');
  const star = Object.values(s.players).filter(p => p.team !== 'FA' && p.team !== 'DRAFT').sort((a, b) => b.ovr - a.ovr)[0], before = star.ovr;
  const orig = E.simDays; let n = 0;
  E.simDays = function () { const r = orig.apply(this, arguments); if (++n === 1) { s.season.injuries = s.season.injuries || {}; s.season.injuries[star.id] = { type: 'Sprained ankle', games: 12 }; } return r; };
  L.advance(s, { days: 2 });
  ok(star.ovr <= before - Math.round(before * 0.2) && star.injPen > 0, 'out: ' + before + ' to ' + star.ovr + ' (a quarter off)');
  for (let i = 0; i < 12 && s.season.injuries[star.id] && s.season.injuries[star.id].games > 0; i++) { L.advance(s, { days: 3 }); s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); }
  ok(star.ovr === before - (star.moodAdj || 0) + 0 || Math.abs(star.ovr - before) <= 3, 'healed: back to ' + star.ovr + ' (was ' + before + ')');
  E.simDays = orig;
  let g = 0, r;
  do { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); r = L.advance(s, 'endPlayoffs'); } while (r.stopped !== 'seasonOver' && ++g < 400);
  let steps = 0;
  while (s.phase !== 'regular' && steps++ < 120) { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); const r2 = L.advance(s, 'nextPhase'); if (r2 && r2.stopped === 'userPick') { const D = window.DRAFT, pool = Object.values(s.players).filter(p => p.team === 'DRAFT' && +p.draftYear === s.year).sort((a, b) => b.ovr - a.ovr); if (pool[0]) D.pick(s, s.userTeam, pool[0].id); } }
  ok(s.year === 1989 && Object.keys(s.teams).length === 25, 'Charlotte and Miami join for 1988-89 (' + Object.keys(s.teams).length + ' teams)');
}
// --- relative tiers (ui-hub.js)
{
  global.UI = {};
  const src = fs.readFileSync('js/ui-hub.js', 'utf8');
  eval(src.slice(src.indexOf('UI.teamTiers = function'), src.indexOf('UI.teamTier = o')));
  const mk = (o, a, s) => ({ abbr: o + '_' + a, ovr: o, age: a, star: s });
  const strong = [mk(84, 27, 95), mk(82, 28, 90), mk(80, 26, 88), mk(79, 28, 85), mk(78, 25, 84), mk(77, 27, 83), mk(76, 24, 82), mk(75, 29, 80), mk(74, 26, 80), mk(73, 27, 79), mk(72, 30, 78), mk(71, 25, 77)];
  const weak = strong.map(x => mk(x.ovr - 12, x.age, x.star - 15));
  const a = UI.teamTiers(strong), b = UI.teamTiers(weak);
  ok(a['84_27'].dir === 'contend' && a['71_25'].dir !== 'contend', 'a team rated 84 contends in the strong league');
  ok(b['72_27'].dir === 'contend' && b['72_27'].tier !== 'Rebuild', 'the same kind of team (72 here, 12 lower league-wide) still contends: it is relative');
  ok(Object.keys(a).length === strong.length && new Set(Object.values(a).map(x => x.tier)).size >= 5, 'several different tiers come out');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed' + (warnings.length ? ' (' + warnings.length + ' warnings)' : ''));
process.exit(fail ? 1 : 0);
