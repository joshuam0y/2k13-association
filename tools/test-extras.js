// Tests for coaches, D-League / G League, awards, news, history and world events.
// Run: node tools/test-extras.js
'use strict';
const fs = require('fs');
const path = require('path');

global.window = global;
require('../data/league2012.js');
require('../data/coaches.js');
require('../data/gleague.js');
require('../data/history.js');
require('../data/world-events.js');
const COACH = require('../js/coaches.js');
const GLEAGUE = require('../js/gleague.js');
const AWARDS = require('../js/awards.js');
const NEWS = require('../js/news.js');
const L = window.LEAGUE_2012;
const H = window.HISTORY_PRIOR;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.log('FAIL: ' + msg); }
}
function rng(seed) {
  let s = seed >>> 0;
  return function () { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DASH = new RegExp('[' + String.fromCharCode(0x2012, 0x2013, 0x2014, 0x2015) + ']');

// ---------------------------------------------------------------------------
// A state built from the 2012 data, with real 2012-13 lines as the fake season
// ---------------------------------------------------------------------------
const RECORDS = { MIA: [66, 16], OKC: [60, 22], SAS: [58, 24], DEN: [57, 25], LAC: [56, 26], MEM: [56, 26], NYK: [54, 28],
  BKN: [49, 33], IND: [49, 33], GSW: [47, 35], CHI: [45, 37], HOU: [45, 37], LAL: [45, 37], ATL: [44, 38], UTA: [43, 39],
  DAL: [41, 41], BOS: [41, 41], MIL: [38, 44], PHI: [34, 48], TOR: [34, 48], POR: [33, 49], MIN: [31, 51], DET: [29, 53],
  WAS: [29, 53], SAC: [28, 54], NOH: [27, 55], PHX: [25, 57], CLE: [24, 58], CHA: [21, 61], ORL: [20, 62] };
const ROOKIES = ['davisan02', 'lillada01', 'bealbr01', 'barneha02', 'sullija01', 'kiddgmi01', 'harklma01', 'riverau01',
  'waitedi01', 'robinth01', 'drumman01', 'leoname01', 'lambje01', 'harrito02', 'millequ01', 'teaguma01', 'wroteto01', 'fournev01'];
const BENCH = ['smithjr01', 'crawfja01', 'ginobma01', 'terryja01', 'jamisan01', 'martike02', 'gordoer01', 'thornmar01', 'greenje02'];
const PREV = { georgpa01: [66, 12.1, 5.6, 2.4], holidjr01: [65, 13.5, 3.3, 4.5], sandela01: [52, 3.6, 3.0, 0.4],
  vasqugr01: [66, 8.9, 2.6, 5.4], jamesle01: [62, 27.1, 7.9, 6.2], duranke01: [66, 28.0, 8.0, 3.5], bryanko01: [58, 27.9, 5.4, 4.6] };

function buildState(year) {
  const state = { version: 1, year: year || 2013, phase: 'regular', userTeam: 'OKC', day: 0, players: {}, teams: {},
    history: { seasons: [] }, transactions: [], news: [], events: [] };
  L.teams.forEach(t => { state.teams[t.abbr] = Object.assign({}, t, { direction: 'neutral', budget: { coaching: 50 } }); });
  L.players.forEach(p => {
    const q = JSON.parse(JSON.stringify(p));
    q.yearsPro = ROOKIES.includes(p.id) ? 0 : Math.max(1, p.age - 21);
    q.contract = { salaries: [{ year: 2013, amount: p.salary || 0 }], option: null, rookie: false, twoWay: false, signedYear: 2012 };
    q.awards = []; q.careerStats = [];
    if (PREV[p.id]) { const v = PREV[p.id]; q.careerStats.push({ year: 2012, team: p.team, g: v[0], pts: v[1], reb: v[2], ast: v[3] }); }
    state.players[p.id] = q;
  });
  const standings = {};
  Object.keys(RECORDS).forEach(a => {
    const [w, l] = RECORDS[a], g = w + l, x = w / g - 0.5;
    standings[a] = { w, l, pf: Math.round(g * (98 + 10 * x)), pa: Math.round(g * (98 - 10 * x)) };
  });
  const playerStats = {};
  L.players.forEach(p => {
    const s = p.stats;
    if (p.team === 'FA' || !s || !s.g) return;
    const g = s.g, ftm = s.pts * 0.18, tpm = s.tpp > 0 ? s.pts * 0.08 : 0, fgm = (s.pts - ftm - tpm) / 2;
    const starter = !BENCH.includes(p.id) && s.mpg >= 26;
    playerStats[p.id] = {
      g, gs: starter ? g : 0, min: s.mpg * g, pts: s.pts * g, fgm: fgm * g, fga: fgm / ((s.fgp || 45) / 100) * g,
      tpm: tpm * g, tpa: tpm / ((s.tpp || 35) / 100) * g, ftm: ftm * g, fta: ftm / ((s.ftp || 75) / 100) * g,
      oreb: s.reb * 0.25 * g, dreb: s.reb * 0.75 * g, ast: s.ast * g, stl: s.stl * g, blk: s.blk * g,
      tov: (1 + s.ast * 0.3) * g, pf: 2.2 * g
    };
  });
  state.season = { year: state.year, standings, playerStats, playoffStats: {}, injuries: {}, teams: L.teams.map(t => ({ abbr: t.abbr, conf: t.conf, div: t.div })) };
  return state;
}

// ---------------------------------------------------------------------------
// Coaches
// ---------------------------------------------------------------------------
(function testCoaches() {
  const D = window.COACHES;
  ok(D.start.length === 30, 'thirty opening-night coaches, got ' + D.start.length);
  ok(Object.keys(D.startByTeam).length === 30, 'every team has a coach');
  L.teams.forEach(t => ok(!!D.startByTeam[t.abbr], 'coach for ' + t.abbr));
  ok(D.pool.length >= 40, 'pool of about forty later coaches, got ' + D.pool.length);
  D.start.concat(D.pool).forEach(c => ['offense', 'defense', 'development', 'motivation'].forEach(k =>
    ok(c[k] >= 40 && c[k] <= 99, c.name + ' ' + k + ' in 40 to 99')));
  ok(D.start.find(c => c.team === 'SAS').name === 'Gregg Popovich', 'Popovich coaches San Antonio');
  ok(D.pool.find(c => c.name === 'Steve Kerr').available === 2015, 'Kerr available from 2014-15');

  const state = buildState();
  COACH.init(state);
  ok(state.teams.SAS.coach === 'popovgr99', 'team.coach set for SAS');
  let maxAbs = 0;
  Object.keys(state.teams).forEach(a => {
    const e = COACH.effect(state, a);
    ['offense', 'defense', 'development', 'morale'].forEach(k => { maxAbs = Math.max(maxAbs, Math.abs(e[k])); });
  });
  ok(maxAbs <= 0.03 + 1e-9, 'coach effects stay within 3 percent, max ' + maxAbs);
  ok(maxAbs > 0, 'coach effects are not all zero');
  const pop = COACH.effect(state, 'SAS'), dun = COACH.effect(state, 'CHA');
  ok(pop.defense > dun.defense && pop.development > dun.development, 'Popovich helps more than Dunlap');
  ok(COACH.available(state, 2013).every(c => c.available <= 2013), 'no future coaches available in 2013');
  ok(!COACH.available(state, 2013).some(c => c.name === 'Brad Stevens'), 'Stevens not available in 2013');
  ok(COACH.hire(state, 'CHA', 'stevebr99').ok === false, 'cannot hire Stevens in 2013');

  const before = state.teams.OKC.coach;
  let changes = [];
  for (let i = 0; i < 3; i++) changes = changes.concat(COACH.aiChanges(state, rng(7 + i)));
  ok(state.teams.OKC.coach === before, 'user team coach untouched by AI changes');
  ok(changes.length >= 1 && changes.length <= 15, 'some AI coaching changes after bad seasons, got ' + changes.length);
  ok(changes.every(c => RECORDS[c.team][0] < 50), 'only teams under 50 wins changed coaches');
  Object.keys(state.teams).forEach(a => ok(!!COACH.of(state, a), a + ' still has a head coach'));
  ok(COACH.record(state.coaches.popovgr99).w === 58, 'coach season record stored');

  const s2 = buildState(2027);
  COACH.init(s2);
  COACH.offseason(s2, rng(3));
  ok(COACH.available(s2, 2028).some(c => c.fictional), 'fictional coaches appear after 2026');
})();

// ---------------------------------------------------------------------------
// D-League and G League
// ---------------------------------------------------------------------------
(function testGLeague() {
  const c13 = GLEAGUE.clubs(2013);
  ok(c13.length === 16, 'D-League has 16 teams in 2012-13, got ' + c13.length);
  ok(GLEAGUE.leagueName(2013) === 'NBA D-League' && GLEAGUE.leagueName(2018) === 'NBA G League', 'renamed G League in 2017-18');
  const byId = {};
  c13.forEach(c => { byId[c.id] = c; });
  ok(byId.RGV.affiliates.join() === 'HOU', 'Rio Grande Valley with Houston');
  ok(byId.AUS.affiliates.join() === 'SAS', 'Austin with San Antonio');
  ok(byId.TUL.affiliates.join() === 'OKC', 'Tulsa with Oklahoma City');
  ok(byId.IOW.affiliates.sort().join() === 'CHI,DEN,NOH,WAS', 'Iowa shared by CHI, DEN, NOH, WAS');
  ok(byId.FWA.affiliates.sort().join() === 'CHA,DET,IND,MIL', 'Fort Wayne shared by CHA, DET, IND, MIL');
  ok(c13.filter(c => c.affiliates.length === 1).length === 11, 'eleven single affiliations in 2012-13');
  L.teams.forEach(t => ok(!!GLEAGUE.affiliateOf(t.abbr, 2013), t.abbr + ' has a 2012-13 affiliate'));
  [2025, 2026].forEach(y => {
    const seen = {};
    L.teams.forEach(t => { const a = GLEAGUE.affiliateOf(t.abbr, y); ok(!!a, t.abbr + ' has an affiliate in ' + y); seen[a] = (seen[a] || 0) + 1; });
    ok(Object.keys(seen).every(k => seen[k] === 1), 'one-to-one affiliates in ' + y);
  });
  ok(GLEAGUE.clubs(2014).length === 17, '17 clubs in 2013-14');

  const state = buildState();
  const r1 = GLEAGUE.assign(state, 'lillada01');
  ok(r1.ok && r1.club === 'IDA', 'rookie Lillard assigned to Idaho');
  ok(!GLEAGUE.nbaAvailable(state, 'lillada01'), 'assigned player not available to the NBA team');
  ok(!GLEAGUE.assign(state, 'duranke01').ok, 'veteran cannot be assigned without consent');
  ok(GLEAGUE.assign(state, 'duranke01', { consent: true }).ok, 'veteran can be assigned with consent');
  const wk = GLEAGUE.simWeek(state, rng(1));
  ok(wk.games.length >= 16, 'a week of games, got ' + wk.games.length);
  const lines = wk.lines.filter(l => l.id === 'lillada01');
  ok(lines.length >= 1, 'assigned player gets stat lines');
  for (let i = 0; i < 10; i++) GLEAGUE.simWeek(state, rng(2 + i));
  const ls = GLEAGUE.playerStats(state, 'lillada01'), ds = GLEAGUE.playerStats(state, 'duranke01');
  ok(ls && ls.pts > 10 && ls.pts < 35, 'Lillard scores like an NBA player in the minors: ' + (ls && ls.pts));
  ok(ds && ds.pts > ls.pts, 'Durant outscores Lillard in the minors');
  ok(GLEAGUE.recall(state, 'lillada01').ok && GLEAGUE.nbaAvailable(state, 'lillada01'), 'recall works');
  const st = GLEAGUE.standings(state);
  ok(st.length === 16 && st.every(s => s.w + s.l <= 50), 'standings for 16 clubs, at most 50 games');

  // two-way contracts
  ok(!GLEAGUE.twoWayRules(2017).allowed && GLEAGUE.twoWayRules(2018).allowed, 'two-way contracts from 2017-18');
  ok(GLEAGUE.twoWayRules(2020).limitType === 'days' && GLEAGUE.twoWayRules(2020).limit === 45, '45 days through 2019-20');
  ok(GLEAGUE.twoWayRules(2022).limitType === 'games' && GLEAGUE.twoWayRules(2022).limit === 50, '50 games from 2021-22');
  ok(GLEAGUE.twoWayRules(2024).slots === 3, 'three two-way slots from 2023-24');
  const s18 = buildState(2018);
  s18.players.teaguma01.contract.twoWay = true;
  let weeks = 0;
  while (GLEAGUE.nbaAvailable(s18, 'teaguma01') && weeks < 40) { GLEAGUE.simWeek(s18, rng(100 + weeks)); weeks++; }
  ok(weeks >= 10 && weeks <= 20, 'two-way player hits the 45-day limit mid-season (week ' + weeks + ')');
  ok(s18.players.teaguma01.gleague === true, 'two-way player then stays in the G League');
  ok(GLEAGUE.playerStats(s18, 'teaguma01').g > 0, 'two-way player has G League stats');
  ok(!GLEAGUE.recall(s18, 'teaguma01').ok, 'cannot recall a two-way player past his limit');
})();

// ---------------------------------------------------------------------------
// Awards
// ---------------------------------------------------------------------------
(function testAwards() {
  const state = buildState();
  COACH.init(state);
  const res = AWARDS.season(state);
  const name = id => (state.players[id] || {}).name;
  console.log('MVP ' + name(res.mvp) + ', DPOY ' + name(res.dpoy) + ', ROY ' + name(res.roy) + ', 6MOY ' + name(res.smoy) +
    ', MIP ' + name(res.mip) + ', COY ' + (state.coaches[res.coy.coach] || {}).name + ' (' + res.coy.team + ')');
  console.log('All-NBA 1st: ' + res.allNba[0].map(name).join(', '));
  ok(res.mvp === 'jamesle01', 'LeBron is MVP');
  ok(['duranke01', 'bryanko01', 'paulch01', 'anthoca01'].includes(res.ballots.mvp[1].id), 'MVP runner-up is a star: ' + name(res.ballots.mvp[1].id));
  ok(['gasolma01', 'ibakase01', 'howardw01', 'noahjo01', 'sandela01', 'chandty01', 'duncati01', 'hibbero01', 'jamesle01', 'georgpa01'].includes(res.dpoy),
    'DPOY is a real defensive star: ' + name(res.dpoy));
  ok(res.roy === 'lillada01', 'Lillard is ROY');
  ok(state.players[res.smoy] && BENCH.includes(res.smoy), '6MOY comes off the bench: ' + name(res.smoy));
  ok(['georgpa01', 'holidjr01', 'sandela01', 'vasqugr01'].includes(res.mip), 'MIP is a breakout player: ' + name(res.mip));
  // HOU counts: in the 2K13 launch data Harden is still on the Thunder, so a 45-win Rockets team overachieves
  ok(['MIA', 'DEN', 'MEM', 'NYK', 'OKC', 'SAS', 'LAC', 'GSW', 'IND', 'HOU'].includes(res.coy.team), 'COY from an overachiever: ' + res.coy.team);
  ok(res.allNba.length === 3 && res.allNba.every(t => t.length === 5), 'three All-NBA teams of five');
  const allIds = [].concat(...res.allNba);
  ok(new Set(allIds).size === 15, 'no player on two All-NBA teams');
  ok(allIds.includes('duranke01') && allIds.includes('bryanko01') && allIds.includes('paulch01'), 'Durant, Kobe, Paul make All-NBA');
  const groups = res.allNba[0].map(id => { const p = state.players[id].pos.split(/[-\/]/)[0]; return p === 'C' ? 'C' : (p === 'PG' || p === 'SG') ? 'G' : 'F'; });
  ok(groups.filter(g => g === 'G').length === 2 && groups.filter(g => g === 'C').length === 1, 'All-NBA is positional before 2024');
  ok(res.allDefense.length === 2 && res.allDefense.every(t => t.length === 5), 'two All-Defense teams');
  ok(res.allRookie.length === 2 && res.allRookie[0].includes('lillada01') && res.allRookie[0].includes('davisan02'), 'All-Rookie first team has Lillard and Davis');
  ok([].concat(...res.allRookie).every(id => state.players[id].yearsPro === 0), 'All-Rookie only rookies');

  // minimum games: a great line in 30 games does not win MVP
  const s2 = buildState();
  s2.season.playerStats.jamesle01.g = 30; s2.season.playerStats.jamesle01.min = 30 * 38;
  ['pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf'].forEach(k => { s2.season.playerStats.jamesle01[k] *= 30 / 76; });
  ok(AWARDS.season(s2).mvp !== 'jamesle01', 'minimum games rule keeps a 30-game player from MVP');

  AWARDS.record(state, res);
  ok(state.players.jamesle01.awards.some(a => a.award === 'MVP' && a.year === 2013), 'MVP recorded on the player');

  // All-Stars
  const as = AWARDS.allStars(state);
  ['East', 'West'].forEach(c => {
    const ids = as[c].starters.concat(as[c].reserves);
    ok(as[c].starters.length === 5 && ids.length === 12 && new Set(ids).size === 12, c + ' has 12 All-Stars');
    ok(ids.every(id => state.teams[state.players[id].team].conf === c), c + ' All-Stars are from the ' + c);
  });
  ok(as.East.starters.includes('jamesle01') && as.West.starters.includes('duranke01'), 'LeBron and Durant start the All-Star Game');
  ok(AWARDS.allStarFormat(2019) === 'Captains draft' && AWARDS.allStarFormat(2013) === 'East vs West', 'All-Star format by era');

  // Finals MVP from box scores
  const row = (id, pts, reb, ast) => ({ id, name: name(id), min: 40, pts, fgm: Math.round(pts / 2.4), fga: Math.round(pts / 1.1), tpm: 1, tpa: 3, ftm: 4, fta: 5, oreb: 1, dreb: reb - 1, ast, stl: 1, blk: 1, tov: 3, pf: 2 });
  const boxes = [];
  for (let i = 0; i < 5; i++) {
    const miaWins = i !== 1;
    boxes.push({ home: { abbr: 'MIA', pts: miaWins ? 105 : 95, box: [row('jamesle01', 28, 10, 8), row('wadedw01', 22, 5, 5), row('boshch01', 16, 9, 1)] },
      away: { abbr: 'OKC', pts: miaWins ? 98 : 101, box: [row('duranke01', 31, 7, 4), row('westbru01', 24, 6, 7)] }, winner: miaWins ? 'MIA' : 'OKC' });
  }
  const fm = AWARDS.finalsMvp(state, boxes);
  ok(fm && fm.id === 'jamesle01' && fm.team === 'MIA', 'Finals MVP is the champion star');

  // Hall of Fame and jersey retirement
  const legend = state.players.duncati01, scrub = state.players.teaguma01;
  legend.retired = true; legend.jersey = 21; legend.retiredYear = 2016;
  legend.careerStats = []; for (let y = 1998; y <= 2016; y++) legend.careerStats.push({ year: y, team: 'SAS', g: 76, pts: 19, reb: 10.8, ast: 3 });
  for (let y = 0; y < 5; y++) legend.awards.push({ year: 2000 + y, award: 'All-NBA 1st Team' }, { year: 2000 + y, award: 'All-Star' });
  legend.awards.push({ year: 2002, award: 'MVP' }, { year: 2003, award: 'MVP' });
  scrub.retired = true; scrub.retiredYear = 2016; scrub.careerStats = [{ year: 2014, team: 'PHI', g: 40, pts: 3, reb: 1, ast: 1 }];
  ok(AWARDS.hallOfFame(state, 2019).length === 0, 'not inducted before four seasons pass');
  const hof = AWARDS.hallOfFame(state, 2020);
  ok(hof.length === 1 && hof[0].id === 'duncati01' && legend.hof, 'great career goes to the Hall of Fame');
  ok(!scrub.hof, 'short career does not');
  const jr = AWARDS.retireJerseys(state, 2017);
  ok(jr.length === 1 && jr[0].team === 'SAS' && jr[0].number === 21, 'Spurs retire the No. 21');
  ok(state.history.retiredJerseys.LAL.some(x => x.number === '44'), 'prior retired numbers seeded from history');
})();

// ---------------------------------------------------------------------------
// News, history and world events
// ---------------------------------------------------------------------------
(function testNews() {
  const state = buildState();
  COACH.init(state);
  const items = [];
  const push = x => { if (Array.isArray(x)) x.forEach(y => y && items.push(y)); else if (x) items.push(x); };
  push(NEWS.trade(state, { teams: ['OKC', 'HOU'], give: { OKC: { players: ['hardeja01'], picks: [] }, HOU: { players: ['martike02'], picks: [{ year: 2013, round: 1, original: 'TOR' }] } } }));
  push(NEWS.trade(state, { teams: ['ATL', 'BOS'], give: { ATL: { players: [], picks: [{ year: 2014, round: 2, original: 'ATL' }] }, BOS: { players: [], picks: [{ year: 2015, round: 2, original: 'BOS' }] } } }));
  push(NEWS.signing(state, 'NYK', 'smithjr01', { salaries: [{ year: 2014, amount: 6e6 }, { year: 2015, amount: 6.4e6 }], resign: true }));
  push(NEWS.signing(state, 'LAL', 'howardw01', { amount: 2.2e7, years: 5 }));
  push(NEWS.signing(state, 'MIA', 'teaguma01', { amount: 1e6, years: 1 }));
  push(NEWS.signing(state, 'MIA', 'teaguma01', { twoWay: true }));
  push(NEWS.release(state, 'ORL', 'teaguma01'));
  push(NEWS.injury(state, 'rosede01', { type: 'Torn ACL', games: 999 }));
  push(NEWS.injury(state, 'duranke01', { type: 'Sprained ankle', games: 2 }));
  push(NEWS.injury(state, 'bryanko01', { type: 'Broken hand', games: 20 }));
  const big = NEWS.game(state, { id: 'g1', home: { abbr: 'OKC', pts: 120, box: [{ id: 'duranke01', name: 'Kevin Durant', pts: 52, fgm: 17, fga: 28, oreb: 1, dreb: 8, ast: 5, stl: 1, blk: 1 },
    { id: 'westbru01', name: 'Russell Westbrook', pts: 20, fgm: 8, fga: 18, oreb: 2, dreb: 9, ast: 12, stl: 2, blk: 0 }] },
    away: { abbr: 'DAL', pts: 110, box: [{ id: 'nowitdi01', name: 'Dirk Nowitzki', pts: 30, fgm: 11, fga: 20, oreb: 0, dreb: 7, ast: 2 }] } });
  ok(big.some(x => /52/.test(x.headline)), '50-point game makes the news');
  ok(big.some(x => /Triple-Double/.test(x.headline)), 'triple-double makes the news');
  push(big);
  state.players.nowitdi01.highs = { pts: 25, reb: 10, ast: 5 };
  const hi = NEWS.game(state, { home: { abbr: 'DAL', pts: 100, box: [{ id: 'nowitdi01', pts: 31, fgm: 11, fga: 20, oreb: 0, dreb: 7, ast: 2 }] }, away: { abbr: 'OKC', pts: 90, box: [] } });
  ok(hi.some(x => /Career High/.test(x.headline)), 'career high makes the news');
  push(hi);
  const ms = NEWS.milestone(state, 'nowitdi01', 'pts', 24900, 25010);
  ok(ms && /25,000/.test(ms.headline), 'milestone headline');
  push(ms);
  push(NEWS.awards(state, AWARDS.season(state)));
  push(NEWS.allStars(state, AWARDS.allStars(state)));
  push(NEWS.series(state, { hi: 'MIA', lo: 'MIL', hw: 4, lw: 0, winner: 'MIA', round: 1, conf: 'East' }));
  push(NEWS.series(state, { hi: 'OKC', lo: 'MEM', hw: 3, lw: 4, winner: 'MEM', round: 2, conf: 'West' }));
  push(NEWS.series(state, { hi: 'SAS', lo: 'GSW', hw: 4, lw: 2, winner: 'SAS', round: 2, conf: 'West' }));
  push(NEWS.series(state, { hi: 'MIA', lo: 'SAS', hw: 4, lw: 3, winner: 'MIA', round: 4, conf: 'Finals' }));
  push(NEWS.champion(state, 'MIA', { id: 'jamesle01' }));
  push(NEWS.coach(state, { team: 'CHA', fired: 'dunlami99', hired: 'cliffst99' }));
  push(NEWS.hallOfFame(state, [{ id: 'duncati01', name: 'Tim Duncan' }]));
  push(NEWS.jersey(state, { team: 'SAS', id: 'duncati01', name: 'Tim Duncan', number: 21 }));
  push(NEWS.retire(state, 'duncati01'));
  push(NEWS.draftPick(state, 'NOH', 'davisan02', 1));
  const world = NEWS.worldFor('2012-07-01', '2026-12-31');
  push(world);
  ok(items.length >= 30, 'many news items generated: ' + items.length);
  items.forEach(it => {
    ok(!DASH.test(it.headline) && !DASH.test(it.body), 'no em or en dash: ' + it.headline);
    ok(typeof it.headline === 'string' && it.headline.length > 5 && !/undefined|NaN|null/.test(it.headline + it.body), 'clean text: ' + it.headline);
  });
  ok(/BLOCKBUSTER|Traded|Shockwaves/.test(items[0].headline), 'star trade gets a blockbuster headline: ' + items[0].headline);
  console.log('Sample headlines:\n  ' + items.slice(0, 14).map(x => x.headline).join('\n  '));
  NEWS.publish(state, 'injury', 'rosede01', { type: 'Torn ACL', games: 999 });
  ok(state.news.length === 1 && state.news[0].type === 'injury', 'publish posts to state.news');

  // world events
  const W = window.WORLD_EVENTS;
  ok(W.length >= 40 && W.length <= 90, 'world events count ' + W.length);
  ok(W.every(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date >= '2012-01-01' && e.date <= '2026-12-31'), 'world event dates 2012 to 2026');
  const mar20 = NEWS.worldFor('2020-03-01', '2020-03-31').map(e => e.headline).join(' | ');
  ok(/Pandemic/.test(mar20) && /Suspends/.test(mar20), 'March 2020 has the pandemic and NBA suspension');
  ok(NEWS.worldFor('2012-11-06', '2012-11-06').length === 1, 'single-day range is inclusive');
  ok(NEWS.worldFor('2016-11-08', '2016-11-08')[0].year === 2017, 'world item gets the season-ending year');
  ok(world.length === W.length, 'full range returns every event');

  // history
  ok(H.champions.length === 66 && H.champions[0].year === 1947 && H.champions[65].year === 2012, 'champions 1947 to 2012');
  ok(H.champions[65].abbr === 'MIA' && H.champions[65].finalsMvp === 'LeBron James', '2012 Heat, LeBron Finals MVP');
  ok(H.champions.filter(c => c.year >= 1969).every(c => c.finalsMvp), 'Finals MVP for every year from 1969');
  ok(Object.keys(H.mvp).length === 57 && H.mvp[2011].name === 'Derrick Rose', 'MVP 1956 to 2012');
  ok(H.titles.BOS === 17 && H.titles.LAL === 16 && H.titles.CHI === 6, 'title counts');
  L.teams.forEach(t => ok(Array.isArray(H.retiredNumbers[t.abbr]), 'retired numbers listed for ' + t.abbr));
  ok(!H.retiredNumbers.LAL.some(x => x.number === '34' || x.number === '52'), 'no numbers retired after October 2012');
})();

// ---------------------------------------------------------------------------
// Source files: no em or en dashes
// ---------------------------------------------------------------------------
['js/coaches.js', 'data/coaches.js', 'js/gleague.js', 'data/gleague.js', 'js/awards.js', 'js/news.js', 'data/history.js',
  'data/world-events.js', 'tools/test-extras.js'].forEach(f => {
  const text = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  ok(!DASH.test(text), f + ' has no em or en dashes');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
