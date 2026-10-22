// Engine calibration test. Run: node tools/engine-test.js [--fake] [--seed N] [--seasons K]
// Uses data/league2012.js when it exists (and defines window.LEAGUE_2012), else a fake 30-team league.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

global.window = global;
const ENGINE = require('../js/engine.js');

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEED = +argVal('--seed', 2013);
const SEASONS = +argVal('--seasons', 1);
const FORCE_FAKE = args.includes('--fake');

// ---------------------------------------------------------------------------
// Fake league
// ---------------------------------------------------------------------------
const TEAMS = [
  ['BOS', 'East', 'Atlantic', 76], ['BKN', 'East', 'Atlantic', 76], ['NYK', 'East', 'Atlantic', 77], ['PHI', 'East', 'Atlantic', 74], ['TOR', 'East', 'Atlantic', 72],
  ['CHI', 'East', 'Central', 75], ['CLE', 'East', 'Central', 71], ['DET', 'East', 'Central', 71], ['IND', 'East', 'Central', 76], ['MIL', 'East', 'Central', 73],
  ['ATL', 'East', 'Southeast', 74], ['CHA', 'East', 'Southeast', 68], ['MIA', 'East', 'Southeast', 81], ['ORL', 'East', 'Southeast', 70], ['WAS', 'East', 'Southeast', 71],
  ['DAL', 'West', 'Southwest', 74], ['HOU', 'West', 'Southwest', 74], ['MEM', 'West', 'Southwest', 77], ['NOH', 'West', 'Southwest', 70], ['SAS', 'West', 'Southwest', 79],
  ['DEN', 'West', 'Northwest', 77], ['MIN', 'West', 'Northwest', 74], ['OKC', 'West', 'Northwest', 80], ['POR', 'West', 'Northwest', 73], ['UTA', 'West', 'Northwest', 74],
  ['GSW', 'West', 'Pacific', 76], ['LAC', 'West', 'Pacific', 79], ['LAL', 'West', 'Pacific', 79], ['PHX', 'West', 'Pacific', 71], ['SAC', 'West', 'Pacific', 70]
];
const STARS = { MIA: [97, 'SF', 'scorer'], OKC: [96, 'SF', 'scorer'], LAL: [94, 'SG', 'scorer'], LAC: [93, 'PG', 'passer'], NYK: [91, 'SF', 'scorer'] };

const TEMPLATES = {
  PG: { close: 0, mid: 2, three: 3, ft: 8, layup: 3, dunk: -18, post: -25, handle: 14, pass: 14, oreb: -28, dreb: -16, steal: 6, block: -28, perD: 3, intD: -22, speed: 12, vert: 0, strength: -15, stamina: 8, durability: 0, oiq: 4, diq: 0 },
  SG: { close: 0, mid: 5, three: 6, ft: 6, layup: 3, dunk: -6, post: -18, handle: 4, pass: -2, oreb: -22, dreb: -13, steal: 3, block: -20, perD: 2, intD: -16, speed: 8, vert: 3, strength: -8, stamina: 6, durability: 0, oiq: 2, diq: 0 },
  SF: { close: 2, mid: 2, three: 0, ft: 2, layup: 3, dunk: 3, post: -8, handle: -2, pass: -4, oreb: -10, dreb: -3, steal: 1, block: -10, perD: 3, intD: -5, speed: 4, vert: 4, strength: 0, stamina: 5, durability: 0, oiq: 0, diq: 0 },
  PF: { close: 6, mid: 0, three: -14, ft: -4, layup: 0, dunk: 4, post: 3, handle: -16, pass: -12, oreb: 6, dreb: 9, steal: -10, block: 3, perD: -8, intD: 6, speed: -8, vert: 0, strength: 10, stamina: 2, durability: 0, oiq: 0, diq: 2 },
  C: { close: 7, mid: -12, three: -32, ft: -12, layup: -2, dunk: 8, post: 4, handle: -26, pass: -16, oreb: 12, dreb: 13, steal: -14, block: 12, perD: -16, intD: 12, speed: -16, vert: -2, strength: 16, stamina: 0, durability: -3, oiq: -2, diq: 3 }
};
const OFF_KEYS = ['close', 'mid', 'three', 'layup', 'dunk', 'post', 'handle', 'oiq'];
const DEF_KEYS = ['steal', 'block', 'perD', 'intD', 'diq'];

function fakeLeague(seed) {
  const r = ENGINE.rng(seed);
  const gauss = () => (r() + r() + r() + r() - 2) * 1.7;
  const cl = v => Math.max(25, Math.min(99, Math.round(v)));
  const players = [];
  let pid = 0;
  function make(team, ovr, pos, style) {
    const t = TEMPLATES[pos];
    const bias = style === 'scorer' ? 7 : style === 'passer' ? 3 : gauss() * 3;
    const attrs = {};
    Object.keys(t).forEach(k => {
      let v = ovr - 6 + t[k] + gauss() * 4;
      if (OFF_KEYS.includes(k)) v += bias;
      if (DEF_KEYS.includes(k)) v -= bias * 0.8;
      if (k === 'pass' && style === 'passer') v += 12;
      if (k === 'durability') v = 55 + r() * 40;
      if (k === 'stamina') v = 65 + r() * 25 + (ovr - 70) * 0.4;
      attrs[k] = cl(v);
    });
    pid++;
    players.push({ id: 'p' + pid, name: team + ' ' + pos + ' ' + pid, team, pos, age: 22 + Math.floor(r() * 12), ovr: Math.round(ovr), attrs, injury: null });
  }
  const order = ['PG', 'SG', 'SF', 'PF', 'C', 'SG', 'PF', 'PG', 'SF', 'C', 'SG', 'PF', 'SF', 'C'];
  TEAMS.forEach(([abbr, , , q]) => {
    const star = STARS[abbr];
    // spread of a roster around its top-8 average q
    const offs = [8, 5, 3, 1, -1, -3, -5, -8, -11, -13, -15, -17, -19, -21];
    const positions = order.slice();
    offs.forEach((o, i) => {
      let ovr = q + o + gauss() * 1.5;
      let pos = positions[i];
      let style = null;
      if (i === 0 && star) { ovr = star[0]; pos = star[1]; style = star[2]; }
      make(abbr, Math.max(45, ovr), pos, style);
    });
  });
  for (let i = 0; i < 25; i++) make('FA', 55 + r() * 12, order[i % 5], null);
  // a starting injury like Derrick Rose's ACL
  const chi = players.filter(p => p.team === 'CHI').sort((a, b) => b.ovr - a.ovr)[0];
  chi.injury = { type: 'Torn ACL', games: 82 };
  return {
    season: 2013,
    teams: TEAMS.map(([abbr, conf, div]) => ({ abbr, city: abbr, name: abbr, conf, div })),
    players
  };
}

function loadLeague() {
  const file = path.join(__dirname, '..', 'data', 'league2012.js');
  if (!FORCE_FAKE && fs.existsSync(file)) {
    try {
      require(file);
      if (global.LEAGUE_2012 && global.LEAGUE_2012.teams && global.LEAGUE_2012.teams.length >= 30) {
        return { league: global.LEAGUE_2012, source: 'data/league2012.js' };
      }
    } catch (e) { console.log('Could not load data/league2012.js: ' + e.message); }
  }
  return { league: fakeLeague(SEED), source: 'fake league' };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const { league, source } = loadLeague();
console.log('League: ' + source + ', ' + league.teams.length + ' teams, ' +
  league.players.filter(p => p.team !== 'FA').length + ' rostered players');

const TARGET = { pts: 98.1, fgp: 45.0, tpp: 35.9, tpa: 20.0, ftp: 75.3, fta: 22.2, reb: 42.0, oreb: 11.2, ast: 22.1, tov: 14.6, stl: 7.8, blk: 5.1, pf: 19.5, pace: 92.0 };

function top8(abbr) {
  const ovrs = league.players.filter(p => p.team === abbr).map(p => p.ovr).sort((a, b) => b - a).slice(0, 8);
  return ovrs.reduce((s, v) => s + v, 0) / Math.max(1, ovrs.length);
}

const allSeasons = [];
const allResults = [];
const t0 = Date.now();
for (let k = 0; k < SEASONS; k++) {
  const rng = ENGINE.rng(SEED + k * 7919);
  const season = ENGINE.newSeason(league, { rng, userTeam: league.teams[0].abbr });
  if (k === 0) checkSchedule(season);
  let guard = 0;
  let phaseChanges = 0;
  while (season.phase !== 'done' && guard++ < 500) {
    const res = ENGINE.simDays(season, 7, rng, league);
    if (res.phaseChanged) phaseChanges++;
    res.gamesPlayed.forEach(r => allResults.push({ season: k, r }));
  }
  allSeasons.push(season);
  if (k === 0) console.log('Phase changes seen: ' + phaseChanges + ', final phase: ' + season.phase);
}
const elapsed = (Date.now() - t0) / 1000;

function checkSchedule(season) {
  const games = [];
  season.days.forEach(d => d.games.forEach(g => games.push(Object.assign({ date: d.date }, g))));
  const per = {}, home = {}, pairs = {}, perDay = {};
  const confOf = {}, divOf = {};
  season.teams.forEach(t => { confOf[t.abbr] = t.conf; divOf[t.abbr] = t.div; per[t.abbr] = []; home[t.abbr] = 0; });
  let doubleBooked = 0;
  games.forEach(g => {
    per[g.home].push(g.date); per[g.away].push(g.date); home[g.home]++;
    const key = [g.home, g.away].sort().join('-');
    pairs[key] = (pairs[key] || 0) + 1;
    const dk = g.date;
    perDay[dk] = perDay[dk] || {};
    [g.home, g.away].forEach(t => { if (perDay[dk][t]) doubleBooked++; perDay[dk][t] = 1; });
  });
  const counts = Object.values(per).map(a => a.length);
  const homes = Object.values(home);
  let b2b = 0, threeIn3 = 0;
  Object.values(per).forEach(dates => {
    const ts = dates.map(d => Date.parse(d + 'T00:00:00Z')).sort((a, b) => a - b);
    for (let i = 1; i < ts.length; i++) {
      if (ts[i] - ts[i - 1] === 86400000) b2b++;
      if (i >= 2 && ts[i] - ts[i - 2] === 2 * 86400000) threeIn3++;
    }
  });
  const bad = { div: 0, conf: 0, other: 0 };
  Object.keys(pairs).forEach(k => {
    const [a, b] = k.split('-');
    const n = pairs[k];
    if (divOf[a] === divOf[b]) { if (n !== 4) bad.div++; }
    else if (confOf[a] === confOf[b]) { if (n !== 3 && n !== 4) bad.conf++; }
    else if (n !== 2) bad.other++;
  });
  const dayCounts = season.days.map(d => d.games.length);
  console.log('\nSCHEDULE');
  console.log('  games: ' + games.length + ', game days: ' + season.days.length + ', ' + season.days[0].date + ' to ' + season.days[season.days.length - 1].date);
  console.log('  games per team: ' + Math.min(...counts) + ' to ' + Math.max(...counts) + ', home games: ' + Math.min(...homes) + ' to ' + Math.max(...homes));
  console.log('  bad pair counts (div/conf/other): ' + bad.div + '/' + bad.conf + '/' + bad.other + ', double-booked team-days: ' + doubleBooked);
  console.log('  back-to-backs per team: ' + (b2b / 30).toFixed(1) + ', three-in-three-nights: ' + threeIn3);
  console.log('  games per day: ' + Math.min(...dayCounts) + ' to ' + Math.max(...dayCounts));
}

// League averages from regular season box scores
const acc = { games: 0, teamGames: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, min: 0, homeW: 0, ot: 0, margin: 0 };
[0].forEach(() => {
  allResults.forEach(({ r }) => {
    if (r.playoff) return;
    acc.games++;
    if (r.home.pts > r.away.pts) acc.homeW++;
    if (r.ot) acc.ot++;
    acc.margin += r.home.pts - r.away.pts;
    [r.home, r.away].forEach(side => {
      acc.teamGames++;
      side.box.forEach(row => ['pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'min'].forEach(k => { acc[k] += row[k]; }));
    });
  });
});
const per = k => acc[k] / acc.teamGames;
const sdOf = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
const regRes = allResults.filter(x => !x.r.playoff).map(x => x.r);
const ptsSd = sdOf(regRes.flatMap(r => [r.home.pts, r.away.pts])), marginSd = sdOf(regRes.map(r => r.home.pts - r.away.pts));
const got = {
  pts: per('pts'), fgp: 100 * acc.fgm / acc.fga, tpp: 100 * acc.tpm / acc.tpa, tpa: per('tpa'), ftp: 100 * acc.ftm / acc.fta, fta: per('fta'),
  reb: per('oreb') + per('dreb'), oreb: per('oreb'), ast: per('ast'), tov: per('tov'), stl: per('stl'), blk: per('blk'), pf: per('pf'),
  pace: (per('fga') + 0.44 * per('fta') - per('oreb') + per('tov')) * 240 / per('min') * 0.96
};
console.log('\nLEAGUE AVERAGES per team per game (' + acc.games + ' regular season games, ' + SEASONS + ' season(s))');
console.log('  stat     sim    target   diff');
Object.keys(TARGET).forEach(k => {
  const d = (got[k] - TARGET[k]) / TARGET[k] * 100;
  console.log('  ' + k.padEnd(6) + String(got[k].toFixed(1)).padStart(7) + String(TARGET[k].toFixed(1)).padStart(8) + String((d >= 0 ? '+' : '') + d.toFixed(1) + '%').padStart(8) + (Math.abs(d) > 5 ? '  <-- off' : ''));
});
console.log('  FGA ' + per('fga').toFixed(1) + ', DREB ' + per('dreb').toFixed(1) + ', minutes ' + per('min').toFixed(1) +
  ', home win ' + (100 * acc.homeW / acc.games).toFixed(1) + '%, home margin ' + (acc.margin / acc.games).toFixed(2) + ', OT games ' + (100 * acc.ot / acc.games).toFixed(1) + '%');
console.log('  team points SD ' + ptsSd.toFixed(1) + ' (real about 12), game margin SD ' + marginSd.toFixed(1) + ' (real about 14)');

// Records
const season = allSeasons[0];
const recs = season.teams.map(t => {
  const s = season.standings[t.abbr];
  return { abbr: t.abbr, conf: t.conf, w: s.w, l: s.l, q: top8(t.abbr), diff: (s.pf - s.pa) / (s.w + s.l) };
}).sort((a, b) => b.w - a.w);
console.log('\nRECORDS (season 1), sorted by wins: team W-L (top-8 avg ovr, point diff)');
recs.forEach((r, i) => { if (i < 5 || i >= recs.length - 5) console.log('  ' + r.abbr + ' ' + r.w + '-' + r.l + ' (' + r.q.toFixed(1) + ', ' + (r.diff >= 0 ? '+' : '') + r.diff.toFixed(1) + ')'); });
// Wins by strength across all seasons
const byQ = [];
allSeasons.forEach(se => se.teams.forEach(t => byQ.push({ q: top8(t.abbr), w: se.standings[t.abbr].w })));
byQ.sort((a, b) => b.q - a.q);
const avgW = list => (list.reduce((s, x) => s + x.w, 0) / list.length).toFixed(1);
console.log('  wins of the 3 strongest teams by top-8 ovr (avg over seasons): ' + avgW(byQ.slice(0, 3 * SEASONS)) +
  ', 3 weakest: ' + avgW(byQ.slice(-3 * SEASONS)));
const bestW = allSeasons.map(se => Math.max(...Object.values(se.standings).map(s => s.w)));
const worstW = allSeasons.map(se => Math.min(...Object.values(se.standings).map(s => s.w)));
console.log('  best record per season: ' + bestW.join(' ') + ' (avg ' + (bestW.reduce((a, b) => a + b, 0) / bestW.length).toFixed(1) +
  '), worst: ' + worstW.join(' ') + ' (avg ' + (worstW.reduce((a, b) => a + b, 0) / worstW.length).toFixed(1) + ')');
const qs = byQ.map(x => x.q), ws = byQ.map(x => x.w);
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const mq = mean(qs), mw = mean(ws);
let cov = 0, vq = 0, vw = 0;
qs.forEach((q, i) => { cov += (q - mq) * (ws[i] - mw); vq += (q - mq) ** 2; vw += (ws[i] - mw) ** 2; });
console.log('  correlation of wins with top-8 ovr: ' + (cov / Math.sqrt(vq * vw)).toFixed(2) + ', wins per ovr point: ' + (cov / vq).toFixed(1));

// Scorers
const nameOf = {}, ovrOf = {}, teamOf = {};
league.players.forEach(p => { nameOf[p.id] = p.name; ovrOf[p.id] = p.ovr; teamOf[p.id] = p.team; });
const lines = Object.entries(season.playerStats).filter(([, s]) => s.g >= 50).map(([id, s]) => ({
  id, g: s.g, ppg: s.pts / s.g, mpg: s.min / s.g, rpg: (s.oreb + s.dreb) / s.g, apg: s.ast / s.g, spg: s.stl / s.g, bpg: s.blk / s.g,
  fgp: s.fga ? 100 * s.fgm / s.fga : 0, tpp: s.tpa ? 100 * s.tpm / s.tpa : 0, ftp: s.fta ? 100 * s.ftm / s.fta : 0, fga: s.fga / s.g, fta: s.fta / s.g
}));
const fmtLine = l => ('  ' + (nameOf[l.id] + ' (' + teamOf[l.id] + ', ' + ovrOf[l.id] + ')').padEnd(34) + l.ppg.toFixed(1) + ' pts ' + l.rpg.toFixed(1) + ' reb ' + l.apg.toFixed(1) + ' ast ' +
  l.mpg.toFixed(1) + ' min ' + l.fgp.toFixed(1) + ' fg% ' + l.tpp.toFixed(1) + ' 3p% ' + l.fga.toFixed(1) + ' fga ' + l.fta.toFixed(1) + ' fta (' + l.g + ' g)');
console.log('\nTOP 5 SCORERS (season 1, min 50 games)');
lines.slice().sort((a, b) => b.ppg - a.ppg).slice(0, 5).forEach(l => console.log(fmtLine(l)));
console.log('TOP 3 REBOUNDERS / PASSERS');
lines.slice().sort((a, b) => b.rpg - a.rpg).slice(0, 3).forEach(l => console.log(fmtLine(l)));
lines.slice().sort((a, b) => b.apg - a.apg).slice(0, 3).forEach(l => console.log(fmtLine(l)));
const stars = lines.filter(l => ovrOf[l.id] >= 90).sort((a, b) => ovrOf[b.id] - ovrOf[a.id]);
if (stars.length) { console.log('PLAYERS 90+ OVR'); stars.slice(0, 10).forEach(l => console.log(fmtLine(l))); }

// Minutes distribution sanity
const mpg = lines.map(l => l.mpg).sort((a, b) => b - a);
console.log('  max mpg ' + mpg[0].toFixed(1) + ', players at 30+ mpg: ' + mpg.filter(m => m >= 30).length + ', 20+ mpg: ' + mpg.filter(m => m >= 20).length);

// Injuries
let injEvents = 0;
const injTypes = {};
allResults.filter(x => x.season === 0).forEach(({ r }) => (r.injuries || []).forEach(i => { injEvents++; injTypes[i.type] = (injTypes[i.type] || 0) + 1; }));
console.log('\nINJURIES (season 1): ' + injEvents + ' in-game injuries; ' + Object.entries(injTypes).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => t + ' ' + n).join(', '));
console.log('  still injured at season end: ' + Object.keys(season.injuries).length);

// Playoffs
const b = season.playoffs;
console.log('\nPLAYOFFS');
console.log('  East seeds: ' + b.seeds.East.join(' ') + ' | West seeds: ' + b.seeds.West.join(' '));
b.rounds.forEach((round, i) => console.log('  Round ' + (i + 1) + ': ' + round.map(s => s.hi + ' ' + s.hw + '-' + s.lw + ' ' + s.lo).join(', ')));
const fm = b.finalsMvp;
console.log('  CHAMPION: ' + b.champion + ' (' + season.standings[b.champion].w + '-' + season.standings[b.champion].l + '), Finals MVP: ' + (fm ? nameOf[fm] : 'n/a'));
if (SEASONS > 1) console.log('  champions over ' + SEASONS + ' seasons: ' + allSeasons.map(s => s.champion).join(' '));
const poDays = season.days.filter(d => d.playoff);
console.log('  playoff days: ' + poDays.length + ', ' + poDays[0].date + ' to ' + poDays[poDays.length - 1].date + ', playoff games: ' + poDays.reduce((s, d) => s + d.games.length, 0));

// Size
const json = JSON.stringify(season);
const gz = zlib.gzipSync(json);
const bsv = Object.values(season.boxScores);
const withPbp = bsv.filter(r => r.pbp).length, full = bsv.filter(r => r.home && typeof r.home === 'object').length;
console.log('\nSAVE SIZE: ' + (json.length / 1048576).toFixed(2) + ' MB JSON, ' + (gz.length / 1048576).toFixed(2) + ' MB gzipped; box scores ' + bsv.length + ' (full ' + full + ', with play-by-play ' + withPbp + ')');
const part = {};
Object.keys(season).forEach(k => { part[k] = JSON.stringify(season[k] === undefined ? null : season[k]).length; });
console.log('  by key (KB): ' + Object.entries(part).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, v]) => k + ' ' + (v / 1024).toFixed(0)).join(', '));
console.log('Sim time: ' + elapsed.toFixed(1) + ' s for ' + SEASONS + ' season(s)');
const last = Object.values(season.boxScores).filter(r => r.pbp).pop();
console.log('\nSample play-by-play (last game, first 8 lines):');
last.pbp.slice(0, 8).forEach(l => console.log('  ' + l));
