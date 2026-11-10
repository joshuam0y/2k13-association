// Builds data/start-YYYY.js, an Association start for the seasons before 2003-04, from the Draft Challenge
// season files (data/era-YYYY.js, real rosters, records and champions, ratings on the 2K13 scale).
//   node tools/build-start.js 2003            (the 2002-03 season; several years: node tools/build-start.js 2003 2002 ...)
// What the era files do not have is made here, deterministically from the player id and the year:
//   contracts   a salary from the rating (a 95 about $22M, a 70 about $4M, the minimum $0.9M), scaled so each team's
//               payroll lands in the range the real 2004 start has ($35M to $75M), lengths by age; rookies on short deals
//   draft       the classes from the start on come from the next seasons' rookies (board by rating, potential from the
//               later seasons' peak); 2004 to 2012 are copied from data/start-2004.js (the real classes)
//   career      each player's earlier seasons, chained from the older era files
// Picks are left out (every team owns its own), as are the free agents, coaches and real pick trades (no data).
const fs = require('fs'), path = require('path'), vm = require('vm');
global.window = global;
const ROOT = path.join(__dirname, '..');
const run = f => vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
const FIRST = 1947, LAST = 2004;
run('data/targets.js');
// 2003-04 comes from the real 2004 start file (its first-year players are the ones with no career before it)
function era(y) {
  if (y === 2004) {
    if (!global.START_LEAGUES || !global.START_LEAGUES[2004]) run('data/start-2004.js');
    if (!global.__e2004) {
      const S = global.START_LEAGUES[2004], had = S.prior.career || {};
      global.__e2004 = { teams: S.teams.map(t => Object.assign({}, t, { record: S.real && S.real[t.abbr] || null })), players: S.players.filter(p => p.team !== 'FA').map(p => Object.assign({}, p, { rookie: !(had[p.id] && had[p.id].length) })) };
    }
    return global.__e2004;
  }
  if (!global.ERA_ROSTERS || !global.ERA_ROSTERS[y]) run('data/era-' + y + '.js');
  return global.ERA_ROSTERS[y];
}
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, n) => Math.round(v * n) / n;
const CAREER_KEYS = ['g', 'mpg', 'pts', 'reb', 'ast', 'stl', 'blk', 'fgp', 'tpp', 'ftp'];

const AB = { NJN: 'BKN' };
const ab = a => AB[a] || a;
function build(Y) {
  const d = era(Y);
  if (!d) throw new Error('No era file for ' + Y);
  // ---- teams, records ----
  const teams = d.teams.map(t => ({ abbr: ab(t.abbr), city: t.city, name: t.name, conf: t.conf, div: t.div, colors: t.colors, logo: t.logo || null, logoNoRef: !!t.logoNoRef }));
  const real = {}; d.teams.forEach(t => { if (t.record) real[ab(t.abbr)] = { w: t.record.w, l: t.record.l }; });
  // ---- career chains: every earlier season of every player on the board ----
  const ids = new Set(d.players.map(p => p.id));
  const career = {}, ovrByYear = {};
  for (let y = FIRST; y < Y; y++) {
    const e = era(y); if (!e) continue;
    e.players.forEach(p => {
      if (!ids.has(p.id) || !p.stats) return;
      const row = { year: y, team: ab(p.team) };
      CAREER_KEYS.forEach(k => { if (p.stats[k] != null) row[k] = p.stats[k]; });
      (career[p.id] = career[p.id] || []).push(row);
    });
  }
  // ---- contracts ----
  const byTeam = {};
  d.players.forEach(p => { (byTeam[p.team] = byTeam[p.team] || []).push(p); });
  const salary = {};
  Object.keys(byTeam).forEach(a => {
    const list = byTeam[a].slice().sort((x, y) => y.ovr - x.ovr);
    const raw = list.map(p => {
      const rookie = p.rookie || ((p.yearsPro || 9) <= 2 && p.age <= 22);
      let s = 0.9 + 21 * Math.pow(Math.max(0, (p.ovr - 50) / 45), 2.2);
      if (rookie) s = Math.min(s * 0.7, 5.5);
      return s;
    });
    const sum = raw.reduce((x, y) => x + y, 0);
    const target = 40 + 26 * hash(a + Y);   // $40M to $66M of the top fifteen
    const k = clamp(target / sum, 0.7, 1.45);
    list.forEach((p, i) => { salary[p.id] = Math.max(0.9, round(raw[i] * k, 100)); });
  });
  const players = d.players.map(p => {
    const h = hash(p.id + ':' + Y);
    const rookie = p.rookie || ((p.yearsPro || 9) <= 2 && p.age <= 22);
    const len = rookie ? Math.max(1, 3 - (p.yearsPro || 0)) : p.age <= 25 ? 2 + Math.floor(h * 4) : p.age <= 30 ? 1 + Math.floor(h * 5) : 1 + Math.floor(h * 3);
    const amount = Math.round(salary[p.id] * 1e6 / 1000) * 1000;
    const q = { id: p.id, name: p.name, team: ab(p.team), pos: p.pos, age: p.age, ht: p.ht, wt: p.wt, attrs: p.attrs, ovr: p.ovr, nbaId: p.nbaId || null,
      tend: p.tend, stats: p.stats ? CAREER_KEYS.reduce((o, k) => { if (p.stats[k] != null) o[k] = p.stats[k]; return o; }, {}) : null,
      injury: null, face: null, rated2k13: false, salaries: [{ year: Y, amount }], contractEnd: Y + len - 1, salary: amount };
    if (p.yearsPro != null) q.yearsPro = p.yearsPro;
    return q;
  });
  const seasonStats = {}; players.forEach(p => { if (p.stats) seasonStats[p.id] = p.stats; });
  // ---- draft classes: the next summers' rookies, then the real 2004 to 2012 classes ----
  const drafts = {};
  const peak = {};
  for (let y = Y + 1; y <= 2003; y++) { const e = era(y); (e ? e.players : []).forEach(p => { peak[p.id] = Math.max(peak[p.id] || 0, p.ovr); }); }
  for (let dy = Y; dy <= 2003; dy++) {
    const e = era(dy + 1); if (!e) continue;
    const rk = e.players.filter(p => p.rookie && !ids.has(p.id)).sort((a, b) => b.ovr - a.ovr);
    drafts[dy] = rk.map((p, i) => {
      const tg = global.TARGETS && global.TARGETS[p.id];
      let tp = 0; if (tg) Object.keys(tg).forEach(k => { if (/^\d{4}$/.test(k) && typeof tg[k] === 'number') tp = Math.max(tp, tg[k]); });
      const pot = clamp(Math.max(p.ovr + 6, peak[p.id] || 0, tp - 2) + Math.round(hash(p.id) * 3), p.ovr, 99);
      return { id: p.id, name: p.name, team: 'DRAFT', pos: p.pos, age: Math.max(18, p.age - 1), ht: p.ht, wt: p.wt, ovr: Math.max(40, p.ovr - 4), pot, nbaId: p.nbaId || null,
        injury: null, attrs: p.attrs, stats: null, face: null, draftYear: dy, realPick: i + 1, arrivalYear: dy + 1, undrafted: false, boardRank: i + 1 };
    });
  }
  const D04 = global.START_LEAGUES[2004].drafts || {};
  Object.keys(D04).forEach(y => { drafts[y] = D04[y]; });
  const prev = era(Y - 1), records = {};
  if (prev) { records[Y - 1] = {}; prev.teams.forEach(t => { if (t.record) records[Y - 1][ab(t.abbr)] = t.record.w + '-' + t.record.l; }); }
  const out = { season: Y, label: (Y - 1) + '-' + String(Y).slice(2), teams, players, rights: [], drafts, targetsPrior: {}, prior: { career, awards: {}, history: { champions: [], mvp: {}, records }, alltime: null }, real, champion: ab(d.champion || '') || null, seasonStats };
  delete out.prior.alltime;
  return out;
}

const years = process.argv.slice(2).map(Number).filter(Boolean);
if (!years.length) { console.log('usage: node tools/build-start.js YEAR [YEAR ...]'); process.exit(1); }
years.forEach(Y => {
  const out = build(Y);
  const file = path.join(ROOT, 'data', 'start-' + Y + '.js');
  const head = '/* ' + out.label + ' Association start, built by tools/build-start.js from data/era-' + Y + '.js: real rosters, ratings, records and champion; contracts, picks and the free agents are generated. */\n';
  fs.writeFileSync(file, head + 'window.START_LEAGUES = window.START_LEAGUES || {};\nwindow.START_LEAGUES[' + Y + '] = ' + JSON.stringify(out) + ';\n');
  const pay = {}; out.players.forEach(p => { pay[p.team] = (pay[p.team] || 0) + p.salary; });
  const v = Object.values(pay).map(x => Math.round(x / 1e6));
  console.log(Y, 'teams', out.teams.length, 'players', out.players.length, 'payroll $M', Math.min(...v), '-', Math.max(...v), 'draft classes', Object.keys(out.drafts).join(','), 'size KB', Math.round(fs.statSync(file).size / 1024));
});
