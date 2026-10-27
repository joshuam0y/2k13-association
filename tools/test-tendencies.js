// Player tendencies test (data/tendencies.js, js/engine.js, js/progression.js). Run: node tools/test-tendencies.js
// Style separate from skill, like NBA 2K13: J.R. Smith chucks threes, Rondo passes up shots, Dwight posts up.
'use strict';
const path = require('path');
global.window = global;
const R = f => require(path.join(__dirname, '..', f));
['data/league2012.js', 'data/drafts.js', 'data/tendencies.js'].forEach(R);
const ENGINE = R('js/engine.js');
const PROG = R('js/progression.js');

let pass = 0, fail = 0;
function check(ok, msg) { if (ok) pass++; else fail++; console.log((ok ? '  ok   ' : '  FAIL ') + msg); }
const L = window.LEAGUE_2012, T = window.TENDENCIES, K = ENGINE.TEND_KEYS;
const byName = n => L.players.find(p => p.name === n);
const td = n => T[byName(n).id];

// 1. Data: every league player and real prospect, every key on 0 to 100
const missing = L.players.filter(p => !T[p.id]).map(p => p.name);
Object.keys(window.DRAFTS).forEach(y => window.DRAFTS[y].forEach(p => { if (!T[p.id]) missing.push(p.name + ' ' + y); }));
check(!missing.length, 'tendencies for every league2012 player and every real prospect' + (missing.length ? ': ' + missing.slice(0, 5).join(', ') : ''));
const bad = Object.keys(T).filter(id => K.some(k => !(T[id][k] >= 0 && T[id][k] <= 100)));
check(!bad.length, 'every value between 0 and 100 (' + bad.length + ' bad)');
const avg = k => { const v = L.players.filter(p => p.stats && p.stats.mpg >= 20).map(p => T[p.id][k]); return v.reduce((a, b) => a + b, 0) / v.length; };
check(['usage', 'three', 'pass', 'drawFoul'].every(k => Math.abs(avg(k) - 50) < 14), 'rotation players average near 50: ' + ['usage', 'three', 'pass', 'drawFoul'].map(k => k + ' ' + avg(k).toFixed(0)).join(', '));

// 2. Real styles
check(td('J.R. Smith').three >= 55 && td('J.R. Smith').usage >= 60, 'J.R. Smith shoots threes and a lot of shots ' + JSON.stringify(td('J.R. Smith')));
check(td('Steve Novak').three >= 85 && td('Kyle Korver').three >= 80, 'Novak and Korver live behind the arc');
check(td('Rajon Rondo').pass >= 85 && td('Rajon Rondo').usage < td('Kobe Bryant').usage - 20, 'Rondo passes first, Kobe looks for his shot');
check(td('Kobe Bryant').mid >= 55, 'Kobe takes mid-range shots (' + td('Kobe Bryant').mid + ')');
check(td('Dwight Howard').post >= 60 && td('Dwight Howard').three <= 5 && td('Dwight Howard').drawFoul >= 90, 'Dwight posts up, never shoots threes, lives at the line');
check(td('Tony Allen').three <= 25 && td('Tony Allen').usage < 50, 'Tony Allen rarely shoots threes and is not a volume scorer');
check(td('Chris Paul').pass >= 85 && td('LeBron James').pass >= 60, 'Paul and LeBron set up teammates');

// 3. Generated tendencies for a made-up player follow his ratings
{
  const shooter = JSON.parse(JSON.stringify(byName('Kyle Korver'))); shooter.id = 'fake01';
  const big = JSON.parse(JSON.stringify(byName('Dwight Howard'))); big.id = 'fake02';
  const a = ENGINE.tendencyOf(shooter), b = ENGINE.tendencyOf(big);
  check(a.generated && b.generated, 'players without real tendencies get generated ones');
  check(a.three > b.three + 30 && b.post > a.post + 20 && b.rim > a.rim, 'a shooter gets threes, a big man gets post-ups and rim attempts');
}

// 4. The sim plays the styles and stays calibrated (2012-13 league averages within 3%)
{
  const rng = ENGINE.rng(2013);
  const season = ENGINE.newSeason(L, { rng, userTeam: L.teams[0].abbr });
  const tot = { g: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, fta: 0, reb: 0, ast: 0 };
  let guard = 0;
  while (season.phase !== 'done' && guard++ < 500) ENGINE.simDays(season, 7, rng, L).gamesPlayed.forEach(r => {
    if (r.playoff) return;
    [r.home, r.away].forEach(sd => { tot.g++; sd.box.forEach(x => { tot.pts += x.pts; tot.fgm += x.fgm; tot.fga += x.fga; tot.tpm += x.tpm; tot.tpa += x.tpa; tot.fta += x.fta; tot.reb += x.oreb + x.dreb; tot.ast += x.ast; }); });
  });
  const got = { pts: tot.pts / tot.g, fgp: 100 * tot.fgm / tot.fga, tpp: 100 * tot.tpm / tot.tpa, tpa: tot.tpa / tot.g, fta: tot.fta / tot.g, reb: tot.reb / tot.g, ast: tot.ast / tot.g };
  const want = { pts: 98.1, fgp: 45.0, tpp: 35.9, tpa: 20.0, fta: 22.2, reb: 42.0, ast: 22.1 };
  Object.keys(want).forEach(k => check(Math.abs(got[k] - want[k]) / want[k] <= 0.03, k + ' ' + got[k].toFixed(1) + ' (real ' + want[k] + ')'));
  const s = id => season.playerStats[id], per36 = (id, k) => s(id)[k] / s(id).min * 36;
  const jr = byName('J.R. Smith').id, ro = byName('Rajon Rondo').id, kb = byName('Kobe Bryant').id, ta = byName('Tony Allen').id, nv = byName('Steve Novak').id;
  check(per36(jr, 'tpa') >= 4.5, 'J.R. Smith 3PA per 36 ' + per36(jr, 'tpa').toFixed(1) + ' (real 5.9)');
  check(per36(ro, 'fga') < per36(kb, 'fga') - 3, 'Rondo shoots far less than Kobe per 36 (' + per36(ro, 'fga').toFixed(1) + ' vs ' + per36(kb, 'fga').toFixed(1) + ')');
  check(per36(ro, 'ast') >= 8.5, 'Rondo assists per 36 ' + per36(ro, 'ast').toFixed(1));
  check(per36(ta, 'tpa') < 1.5, 'Tony Allen 3PA per 36 ' + per36(ta, 'tpa').toFixed(1));
  check(s(nv).tpa / s(nv).fga >= 0.6, 'Steve Novak takes mostly threes (' + (100 * s(nv).tpa / s(nv).fga).toFixed(0) + '% of his shots)');
}

// 5. Aging in the offseason: threes up, rim attempts down after 30, once per offseason
{
  const st = { year: 2013, players: {}, season: { playerStats: {} } };
  ['J.R. Smith', 'Tim Duncan', 'Dwight Howard'].forEach(n => { const p = JSON.parse(JSON.stringify(byName(n))); st.players[p.id] = p; st.season.playerStats[p.id] = { g: 80, min: 80 * 32 }; });
  const jr = st.players.smithjr01, td0 = Object.assign({}, T.duncati01);
  const n1 = PROG.ageTendencies(st, 2014, 2013);
  check(n1 === 3 && jr.tend && jr.tend.three === Math.min(100, T.smithjr01.three + 2), 'threes rise about 2 a season (' + T.smithjr01.three + ' to ' + jr.tend.three + ')');
  check(st.players.duncati01.tend.rim < td0.rim, 'Tim Duncan (36) attacks the rim a bit less (' + td0.rim + ' to ' + st.players.duncati01.tend.rim + ')');
  check(PROG.ageTendencies(st, 2014, 2013) === 0, 'aging runs once per offseason');
  const before = jr.tend.usage; jr.ovr += 6;
  PROG.ageTendencies(st, 2015, 2014);
  check(jr.tend.usage > before, 'usage follows a rise in overall (' + before + ' to ' + jr.tend.usage + ')');
  check(ENGINE.tendencyOf(jr) === jr.tend, 'the engine plays the aged save copy');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
