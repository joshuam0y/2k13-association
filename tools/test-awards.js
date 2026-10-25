// Award consistency tests (js/awards.js). Run: node tools/test-awards.js
// The MVP is always on the All-NBA First Team (in his position slot until 2022-23, positionless from
// 2023-24), the DPOY on the All-Defensive First Team, the ROY on the All-Rookie First Team, and the
// Finals MVP comes from the champion.
'use strict';
const path = require('path');
global.window = global;
const AWARDS = require(path.join(__dirname, '..', 'js', 'awards.js'));

let pass = 0, fail = 0;
function check(ok, msg) { if (ok) pass++; else { fail++; console.log('  FAIL ' + msg); } }

const TEAMS = ['BOS', 'BKN', 'NYK', 'PHI', 'TOR', 'CHI', 'CLE', 'DET', 'IND', 'MIL', 'ATL', 'CHA', 'MIA', 'ORL', 'WAS',
  'DAL', 'HOU', 'MEM', 'NOH', 'SAS', 'DEN', 'MIN', 'OKC', 'POR', 'UTA', 'GSW', 'LAC', 'LAL', 'PHX', 'SAC'];
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// A season with ordinary players plus hand-made stars: g games, per-game line -> totals.
function line(g, ppg, rpg, apg, spg, bpg, mpg, gs) {
  return { g, gs: gs == null ? g : gs, min: mpg * g, pts: ppg * g, fgm: ppg * 0.38 * g, fga: ppg * 0.8 * g, ftm: ppg * 0.15 * g, fta: ppg * 0.2 * g,
    tpm: 0, tpa: 0, oreb: rpg * 0.25 * g, dreb: rpg * 0.75 * g, ast: apg * g, stl: spg * g, blk: bpg * g, tov: 2 * g, pf: 2 * g };
}
function makeState(year, seed, stars) {
  const r = rng(seed);
  const state = { year, players: {}, teams: {}, season: { year, phase: 'playoffs', playerStats: {}, standings: {} } };
  TEAMS.forEach((a, i) => {
    state.teams[a] = { abbr: a, conf: i < 15 ? 'East' : 'West' };
    const w = 20 + Math.round(r() * 40);
    state.season.standings[a] = { w, l: 82 - w, pf: 8000 + r() * 400, pa: 8000 + r() * 400 };
    ['PG', 'SG', 'SF', 'PF', 'C', 'PG', 'SF', 'C'].forEach((pos, k) => {
      const id = a + k;
      state.players[id] = { id, name: id, team: a, pos, ovr: 70 + Math.round(r() * 10), yearsPro: k === 7 ? 0 : 4, attrs: {} };
      state.season.playerStats[id] = line(70, 8 + r() * 10, 3 + r() * 6, 1 + r() * 4, 0.5 + r(), 0.3 + r(), k < 5 ? 30 : 18, k < 5 ? 70 : 5);
    });
  });
  (stars || []).forEach(s => {
    state.players[s.id] = { id: s.id, name: s.id, team: s.team, pos: s.pos, ovr: s.ovr || 88, yearsPro: s.rookie ? 0 : 6, attrs: s.attrs || {} };
    state.season.playerStats[s.id] = line(78, s.ppg, s.rpg, s.apg, s.spg || 1, s.bpg || 0.5, s.mpg || 36);
    if (s.w != null) state.season.standings[s.team] = { w: s.w, l: 82 - s.w, pf: 8400, pa: 8000 };
  });
  return state;
}
const groupOf = (state, id) => { const p = String(state.players[id].pos).split('-')[0]; return p === 'PG' || p === 'SG' ? 'G' : p === 'C' ? 'C' : 'F'; };
function checkSeason(state, label) {
  const res = AWARDS.season(state);
  check(res.mvp && res.allNba[0].indexOf(res.mvp) >= 0, label + ': MVP ' + res.mvp + ' is on the All-NBA First Team ' + JSON.stringify(res.allNba[0]));
  check(!res.dpoy || res.allDefense[0].indexOf(res.dpoy) >= 0, label + ': DPOY on the All-Defensive First Team');
  check(!res.roy || res.allRookie[0].indexOf(res.roy) >= 0, label + ': ROY on the All-Rookie First Team');
  const flat = [].concat.apply([], res.allNba);
  check(flat.length === new Set(flat).size, label + ': nobody on two All-NBA teams');
  check(res.allNba.every(t => t.length === 5), label + ': three All-NBA teams of five');
  if (state.year < 2024) {
    res.allNba.forEach((t, i) => {
      const n = { G: 0, F: 0, C: 0 };
      t.forEach(id => { n[groupOf(state, id)]++; });
      check(n.G === 2 && n.F === 2 && n.C === 1, label + ': All-NBA team ' + (i + 1) + ' is 2 G, 2 F, 1 C (' + JSON.stringify(n) + ')');
    });
  }
  const tv = res.ballots.teamVotes && res.ballots.teamVotes.allNba;
  check(tv && tv.teams[0].some(x => x.id === res.mvp), label + ': the team vote totals list the MVP on the first team');
  return res;
}

// 1. Positional era: the MVP is a center on the best team while two centers on bad teams put up bigger
//    numbers (they rank above him for All-NBA). He still takes the first team center slot.
{
  const stars = [
    { id: 'mvpC', team: 'MIA', pos: 'C', ppg: 24, rpg: 12, apg: 3, w: 66 },
    { id: 'bigA', team: 'SAC', pos: 'C', ppg: 31, rpg: 15, apg: 4, w: 18 },
    { id: 'bigB', team: 'CHA', pos: 'C', ppg: 30, rpg: 14, apg: 4, w: 17 }
  ];
  for (let seed = 1; seed <= 25; seed++) {
    const st = makeState(2013, seed, stars);
    const res = checkSeason(st, '2013 seed ' + seed);
    if (seed === 1) {
      check(res.mvp === 'mvpC', 'the 1-seed center wins MVP (' + res.mvp + ')');
      check(res.allNba[0].indexOf('mvpC') >= 0 && res.allNba[0].indexOf('bigA') < 0, 'the MVP takes the center slot, the other center moves down');
      check(res.allNba[1].indexOf('bigA') >= 0 && res.allNba[2].indexOf('bigB') >= 0, 'the bumped centers go to the second and third teams');
    }
  }
}
// 2. Positionless era (2023-24 on): five players with bigger numbers on bad teams, MVP on the top seed
{
  const stars = [{ id: 'mvpG', team: 'DEN', pos: 'PG', ppg: 26, rpg: 6, apg: 9, w: 64 }];
  ['SAC', 'CHA', 'DET', 'POR', 'WAS', 'ORL'].forEach((t, i) => stars.push({ id: 'num' + i, team: t, pos: ['SF', 'PF', 'C', 'SG', 'PG', 'C'][i], ppg: 33 - i * 0.3, rpg: 10, apg: 6, w: 16 }));
  for (let seed = 1; seed <= 25; seed++) {
    const st = makeState(2025, seed, stars);
    const res = checkSeason(st, '2025 seed ' + seed);
    if (seed === 1) check(res.mvp === 'mvpG' && res.allNba[0][0] === 'mvpG', 'positionless: the MVP heads the first team');
  }
}
// 3. Random seasons in both eras
for (let seed = 100; seed < 160; seed++) checkSeason(makeState(seed % 2 ? 2016 : 2024, seed), 'random ' + seed);

// 4. A vote stored before the rule (MVP on the second team) is repaired when read back
{
  const st = makeState(2014, 7);
  const res = AWARDS.season(st);
  const v = st.season.awardVote;
  check(!!v, 'the vote is stored once the regular season is over');
  const mvp = v.mvp, t0 = v.allNba[0], t1 = v.allNba[1];
  // put him on the second team, swapping with a player of his position group
  const g = groupOf(st, mvp), swap = t1.find(id => groupOf(st, id) === g);
  t0.splice(t0.indexOf(mvp), 1, swap); t1.splice(t1.indexOf(swap), 1, mvp);
  delete v.ballots.teamVotes;
  const again = AWARDS.season(st);
  const before = [].concat.apply([], v.allNba).sort().join(), after = [].concat.apply([], again.allNba).sort().join();
  check(again.allNba[0][0] === mvp && again.allNba.every(t => t.length === 5), 'stored vote repaired: MVP back at the top of the first team');
  check(before === after, 'nobody added or dropped by the repair');
  check(again.allNba[1].filter(id => groupOf(st, id) === g).length === (g === 'C' ? 1 : 2), 'a player at his position moved down to the second team');
  check(res.mvp === again.mvp, 'the MVP itself does not change');
}

// 5. Finals MVP comes from the champion
{
  const st = makeState(2013, 3);
  const mk = (abbr, rows) => ({ abbr, pts: 100, box: rows.map(([id, pts]) => ({ id, name: id, pts, oreb: 1, dreb: 4, ast: 3, stl: 1, blk: 0, tov: 2, fgm: pts / 2.5, fga: pts / 1.2 })) });
  const boxes = [1, 2, 3, 4, 5].map(i => ({ home: mk('MIA', [['MIA0', 22], ['MIA1', 18]]), away: mk('SAS', [['SAS0', 40], ['SAS1', 10]]), winner: i < 5 ? 'MIA' : 'SAS' }));
  const fm = AWARDS.finalsMvp(st, boxes, 'MIA');
  check(fm && fm.team === 'MIA' && fm.id === 'MIA0', 'Finals MVP is the champion\'s best player even when a loser scored more (' + (fm && fm.id) + ')');
  const fm2 = AWARDS.finalsMvp(st, boxes);
  check(fm2 && fm2.team === 'MIA', 'without a champion given, the team with the most Finals wins');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
