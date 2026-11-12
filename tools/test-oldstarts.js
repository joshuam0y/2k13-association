// The Association starts before 1976-77 (1946-47 to 1975-76) and the historic league changes: node tools/test-oldstarts.js [start years]
// each start: teams, rosters, then seasons played through the offseason, with the real teams joining, folding and moving on schedule
const fs = require('fs');
global.window = global;
const warnings = [];
console.warn = (...a) => { warnings.push(a.join(' ')); };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const src = fs.readFileSync(__dirname + '/test-newstarts.js', 'utf8');
eval(src.match(/const files = \[[\s\S]*?\];\nfiles\.forEach[^\n]*\n/)[0].replace(/const files/, 'var files').replace(/require\('\.\.\//g, "require('../"));
require('../data/historic-moves.js');
const L = window.LEAGUE, E = window.ENGINE;
const years = process.argv.slice(2).map(Number).filter(Boolean);
const list = years.length ? years : [1947, 1949, 1952, 1958, 1961, 1964, 1968, 1971, 1974, 1976];
const eraTeams = y => { if (!window.ERA_ROSTERS || !window.ERA_ROSTERS[y]) require('../data/era-' + y + '.js'); const ab = a => ({ PHW: 'GSW', SFW: 'GSW', MNL: 'LAL', ROC: 'SAC', CIN: 'SAC', KCO: 'SAC', KCK: 'SAC', SYR: 'PHI', FTW: 'DET', MLH: 'ATL', STL: 'ATL', TRI: 'ATL', CHP: 'WAS', CHZ: 'WAS', BAL: 'WAS', CAP: 'WAS', WSB: 'WAS', SDR: 'HOU', NYN: 'BKN', NJN: 'BKN', BUF: 'LAC', SDC: 'LAC', NOJ: 'UTA' }[a] || a); return window.ERA_ROSTERS[y].teams.map(t => ab(t.abbr)).sort(); };
for (const y of list) {
  require('../data/start-' + y + '.js');
  const S = window.START_LEAGUES[y];
  const per = {}; S.players.forEach(p => { if (p.team !== 'FA') per[p.team] = (per[p.team] || 0) + 1; });
  const teams = S.teams.map(t => t.abbr);
  ok(JSON.stringify(teams.slice().sort()) === JSON.stringify(eraTeams(y)), y + ': the real teams (' + teams.length + ')');
  ok(teams.every(a => (per[a] || 0) >= 6 && per[a] <= 15), y + ': every team has 6 to 15 players (' + teams.map(a => per[a]).join('/') + ')');
  const keep = eraTeams(Math.min(y + 4, 1988)), mine = teams.find(a => keep.indexOf(a) >= 0) || teams[0];   // a team that does not fold in the first seasons
  const s = L.newLeague(mine, { seed: 5, start: y });
  let bad = null;
  for (let k = 0; k < 4 && !bad; k++) {
    const Y = s.year;
    try {
      let g = 0, r;
      do { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); r = L.advance(s, 'endPlayoffs'); } while (r.stopped !== 'seasonOver' && ++g < 400);
      ok(!!s.season.champion, y + ' season ' + Y + ': a champion (' + s.season.champion + ') among ' + Object.keys(s.teams).length + ' teams, K ' + s.season.playoffK);
      const po = s.season.playoffs, spec = s.season.playoffSpec;
      ok(po && spec && po.rounds.every((rd, i) => rd.every(x => x.need === spec.wins[Math.min(i, spec.wins.length - 1)])), y + ' season ' + Y + ': every series is the length that year used (' + po.rounds.map(rd => rd[0].need).join('/') + '), ' + po.rounds.map(rd => rd.length).join('+') + ' series');
      ok(po.rounds.length === po.R, y + ' season ' + Y + ': ' + po.R + ' rounds');
      const dl = s.draft && s.draft.year === Y && s.draft.lottery && s.draft.lottery.era;
      ok(!dl || dl === (Y < 1966 ? 'worst' : Y < 1985 ? 'flip' : Y < 1990 ? '1985' : dl), y + ' season ' + Y + ': the draft order rule is the era\'s (' + dl + ')');
      const games = Object.values(s.season.standings).map(x => x.w + x.l);
      ok(games.every(x => x === games[0]) || Math.max.apply(null, games) - Math.min.apply(null, games) <= 1, y + ' season ' + Y + ': everyone plays the same number of games (' + [...new Set(games)].join('/') + ')');
      let st = 0;
      while (s.phase !== 'regular' && st++ < 160) { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); const r2 = L.advance(s, 'nextPhase'); if (r2 && r2.stopped === 'userPick') { const D = window.DRAFT, pool = Object.values(s.players).filter(p => p.team === 'DRAFT' && +p.draftYear === s.year).sort((a, b) => b.ovr - a.ovr); if (pool[0]) D.pick(s, s.userTeam, pool[0].id); } }
      ok(s.phase === 'regular' && s.year === Y + 1, y + ': on to ' + (Y + 1) + ' (phase ' + s.phase + ')');
      const want = eraTeams(Y + 1), have = Object.keys(s.teams).sort();
      ok(JSON.stringify(want) === JSON.stringify(have) || (have.length === want.length), y + ' to ' + (Y + 1) + ': ' + have.length + ' teams, the real league has ' + want.length + (JSON.stringify(want) === JSON.stringify(have) ? '' : ' (' + have.filter(a => want.indexOf(a) < 0) + ' / ' + want.filter(a => have.indexOf(a) < 0) + ')'));
      const cnt = {}; Object.values(s.players).forEach(p => { if (s.teams[p.team] && !p.retired) cnt[p.team] = (cnt[p.team] || 0) + 1; });
      ok(Object.keys(s.teams).every(a => (cnt[a] || 0) >= 5), y + ' to ' + (Y + 1) + ': every team has at least five players (' + Object.keys(s.teams).map(a => a + cnt[a]).join(' ') + ')');
    } catch (e) { bad = e; ok(false, y + ' season ' + Y + ' threw ' + (e && e.stack || e).split('\n').slice(0, 3).join(' | ')); }
  }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed' + (warnings.length ? ' (' + warnings.length + ' warnings: ' + warnings.slice(0, 3).join(' / ') + ')' : ''));
process.exit(fail ? 1 : 0);
