// Assist distribution test (js/engine.js). Run: node tools/test-assists.js [--seed N]
// Simulates the 2012-13 regular season and compares assists with the real 2012-13 season:
// about 22.1 per team game, point guards leading (Rondo 11.1, Paul 9.7, Vasquez 9.0, Williams 7.7),
// about 14 players at 7 or more per game, centers mostly 1 to 2.
'use strict';
const path = require('path');
global.window = global;
const ENGINE = require(path.join(__dirname, '..', 'js', 'engine.js'));
require(path.join(__dirname, '..', 'data', 'league2012.js'));
const args = process.argv.slice(2);
const seed = +(args[args.indexOf('--seed') + 1] || 0) || 2013;
const league = window.LEAGUE_2012;

let pass = 0, fail = 0;
function check(ok, msg) { if (ok) pass++; else fail++; console.log((ok ? '  ok   ' : '  FAIL ') + msg); }

const rng = ENGINE.rng(seed);
const season = ENGINE.newSeason(league, { rng, userTeam: league.teams[0].abbr });
const games = [];
let guard = 0;
while (season.phase !== 'done' && guard++ < 500) ENGINE.simDays(season, 7, rng, league).gamesPlayed.forEach(r => { if (!r.playoff) games.push(r); });
const P = {};
league.players.forEach(p => { P[p.id] = p; });

// box scores: team totals, assists never above made shots, rows on the right team, sums match the season
let teamAst = 0, sides = 0, overFgm = 0, wrongTeam = 0, ownShots = 0;
const boxSum = {};
games.forEach(r => [r.home, r.away].forEach(side => {
  sides++;
  let a = 0, fgm = 0;
  side.box.forEach(row => { fgm += row.fgm; });
  side.box.forEach(row => {
    a += row.ast;
    if (row.ast > fgm - row.fgm) ownShots++;
    const p = P[row.id];
    if (p && p.team !== side.abbr && p.team !== 'FA') wrongTeam++;
    boxSum[row.id] = (boxSum[row.id] || 0) + row.ast;
  });
  teamAst += a;
  if (a > fgm) overFgm++;
}));
const apg = teamAst / sides;
check(Math.abs(apg - 22.1) / 22.1 < 0.03, 'team assists per game ' + apg.toFixed(2) + ' (real 22.1)');
check(overFgm === 0, 'no team has more assists than made shots in a game (' + overFgm + ')');
check(wrongTeam === 0, 'every box score row belongs to the team it is listed under (' + wrongTeam + ')');
check(ownShots === 0, 'nobody has more assists than his teammates made shots (' + ownShots + ')');
const mism = Object.keys(season.playerStats).filter(id => (boxSum[id] || 0) !== season.playerStats[id].ast);
check(mism.length === 0, 'season assist totals match the box scores (' + mism.length + ' mismatches)');

// distribution
const lines = Object.entries(season.playerStats).filter(([, s]) => s.g >= 40).map(([id, s]) => ({ p: P[id], apg: s.ast / s.g, real: P[id] && P[id].stats ? P[id].stats.ast : null }));
lines.sort((a, b) => b.apg - a.apg);
console.log('  leaders: ' + lines.slice(0, 8).map(l => l.p.name + ' ' + l.apg.toFixed(1) + ' (' + l.real + ')').join(', '));
const pos = l => String(l.p.pos).split(/[-\/]/)[0];
check(lines.slice(0, 10).filter(l => pos(l) === 'PG').length >= 8, 'point guards lead the league (' + lines.slice(0, 10).map(pos).join(' ') + ')');
const seven = lines.filter(l => l.apg >= 7).length;
check(seven >= 9 && seven <= 20, seven + ' players at 7+ assists per game (real 14)');
check(lines[0].apg >= 8.5 && lines[0].apg <= 12.5, 'the leader averages ' + lines[0].apg.toFixed(1) + ' (real 11.1)');
const avg = list => list.reduce((s, l) => s + l.apg, 0) / Math.max(1, list.length);
const C = lines.filter(l => pos(l) === 'C'), PG = lines.filter(l => pos(l) === 'PG');
check(avg(C) >= 0.8 && avg(C) <= 2, 'centers average ' + avg(C).toFixed(2) + ' (real 1.3)');
check(C.filter(l => l.apg > 4).length <= 2, 'at most two centers above 4 per game (' + C.filter(l => l.apg > 4).map(l => l.p.name).join(', ') + ')');
check(avg(PG) >= 4 && avg(PG) <= 5.4, 'point guards average ' + avg(PG).toFixed(2) + ' (real 4.7)');
const named = ['Rajon Rondo', 'Chris Paul', 'Deron Williams', 'Russell Westbrook', 'Tony Parker'].map(n => lines.find(l => l.p.name === n)).filter(Boolean);
check(named.every(l => l.apg >= 6.5), 'the elite passers set up 6.5+ per game: ' + named.map(l => l.p.name + ' ' + l.apg.toFixed(1)).join(', '));
let err = 0, n = 0;
lines.forEach(l => { if (l.real != null) { err += Math.abs(l.apg - l.real); n++; } });
check(err / n < 0.85, 'mean absolute error against real 2012-13 assists ' + (err / n).toFixed(2) + ' per game');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
