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
// real salaries (tools/fetch-salaries.py, Basketball-Reference): { id: [[season, team, amount], ...] }
const SAL = fs.existsSync(path.join(ROOT, 'tools', 'salary-cache.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'salary-cache.json'), 'utf8')) : {};
const seasonLabel = y => (y - 1) + '-' + String(y).slice(2);
// a player's real contract at the start of season Y: his salary that season; it runs while the next seasons are the same
// team at the same or a modestly higher salary (a raise of 0 to 12%), the way a signed contract looks
function realContract(id, Y, team) {
  const rows = SAL[id];
  if (!rows || !rows.length) return null;
  const at = y => { const m = rows.filter(r => r[0] === seasonLabel(y)); return m.find(r => r[1] === team) || m.slice().sort((a, b) => b[2] - a[2])[0] || null; };
  const first = at(Y);
  if (!first || !(first[2] > 0)) return null;
  const sal = [{ year: Y, amount: first[2] }];
  let end = Y, prev = first;
  for (let y = Y + 1; y <= Y + 6; y++) {
    const r = at(y);
    if (!r || r[1] !== prev[1] || r[2] < prev[2] * 0.995 || r[2] > prev[2] * 1.12) break;
    sal.push({ year: y, amount: r[2] }); end = y; prev = r;
  }
  return { salaries: sal, contractEnd: end, salary: first[2] };
}
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
  let realN = 0;
  const players = d.players.map(p => {
    const h = hash(p.id + ':' + Y);
    const rookie = p.rookie || ((p.yearsPro || 9) <= 2 && p.age <= 22);
    const len = rookie ? Math.max(1, 3 - (p.yearsPro || 0)) : p.age <= 25 ? 2 + Math.floor(h * 4) : p.age <= 30 ? 1 + Math.floor(h * 5) : 1 + Math.floor(h * 3);
    const amount = Math.round(salary[p.id] * 1e6 / 1000) * 1000;
    const q = { id: p.id, name: p.name, team: ab(p.team), pos: p.pos, age: p.age, ht: p.ht, wt: p.wt, attrs: p.attrs, ovr: p.ovr, nbaId: p.nbaId || null,
      tend: p.tend, stats: p.stats ? CAREER_KEYS.reduce((o, k) => { if (p.stats[k] != null) o[k] = p.stats[k]; return o; }, {}) : null,
      injury: null, face: null, rated2k13: false, salaries: [{ year: Y, amount }], contractEnd: Y + len - 1, salary: amount };
    const rc = realContract(p.id, Y, p.team);
    if (rc) { q.salaries = rc.salaries; q.contractEnd = rc.contractEnd; q.salary = rc.salary; realN++; }
    if (p.yearsPro != null) q.yearsPro = p.yearsPro;
    return q;
  });
  // the opening free agents: veterans who sat out this season but played the next (really unsigned), the best twenty
  const have = new Set(d.players.map(p => p.id)), nextE = era(Y + 1), prevE = era(Y - 1);
  if (nextE && prevE) {
    const back = new Set(nextE.players.map(p => p.id));
    prevE.players.filter(p => !have.has(p.id) && back.has(p.id) && p.age <= 37).sort((a, b) => b.ovr - a.ovr).slice(0, 20).forEach(p => {
      players.push({ id: p.id, name: p.name, team: 'FA', pos: p.pos, age: p.age + 1, ht: p.ht, wt: p.wt, attrs: p.attrs, ovr: p.ovr, nbaId: p.nbaId || null, tend: p.tend, stats: null, injury: null, face: null, rated2k13: false, salary: 0 });
    });
  }
  const seasonStats = {}; players.forEach(p => { if (p.stats) seasonStats[p.id] = p.stats; });
  // ---- draft classes: every real pick (tools/fetch-drafts.py), with the real ratings where he played (his first season in any
  // era or start file), generated ones where he never did; then the real 2004 to 2012 classes ----
  const drafts = {}, rights = [];
  const DC = fs.existsSync(path.join(ROOT, 'tools', 'draft-cache.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'draft-cache.json'), 'utf8')) : {};
  run('js/draft-gen.js');
  const DG = global.DRAFTGEN;
  const seasonPlayers = y => { if (y <= 2004) { const e = era(y); return e ? e.players : []; } if (!global.START_LEAGUES[y]) run('data/start-' + y + '.js'); return global.START_LEAGUES[y].players; };
  const idxCache = {};
  const idx = y => idxCache[y] || (idxCache[y] = new Map(seasonPlayers(y).map(p => [p.id, p])));
  // the first season he appears after the draft (and his best rating in the seasons after), up to 2012
  function firstSeen(id, dy) {
    let first = null, peak = 0;
    for (let y = dy + 1; y <= 2012; y++) { const r = idx(y).get(id); if (r) { if (!first) first = { rec: r, year: y }; peak = Math.max(peak, r.ovr); } }
    return first ? Object.assign(first, { peak }) : null;
  }
  const mulberry = seed => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const gaussR = r => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const teamSet = new Set(teams.map(t => t.abbr));
  const prospect = (dy, row, nTeams) => {
    const [pick, tm, id, name, college] = row, seen = id && firstSeen(id, dy);
    const tg = global.TARGETS && id && global.TARGETS[id];
    let tp = 0; if (tg) Object.keys(tg).forEach(k => { if (/^\d{4}$/.test(k) && typeof tg[k] === 'number') tp = Math.max(tp, tg[k]); });
    if (seen) {
      const p = seen.rec, late = seen.year - dy - 1, ovr = Math.max(40, p.ovr - 4 - 2 * late);
      return { id, name: p.name, team: 'DRAFT', pos: p.pos, age: Math.max(18, p.age - (seen.year - dy)), ht: p.ht, wt: p.wt, ovr, pot: clamp(Math.max(ovr + 6, seen.peak, tp - 2) + Math.round(hash(id) * 3), ovr, 99),
        nbaId: p.nbaId || null, injury: null, attrs: p.attrs, stats: null, face: null, draftYear: dy, realPick: pick, arrivalYear: seen.year, undrafted: false, boardRank: pick, college: college || undefined, draftedBy: ab(tm) };
    }
    // never played in the NBA (or after 2012): a prospect from the slot he went in, a real name and a position by the dice
    const r = mulberry(Math.floor(hash(name + dy) * 4294967295)), pos = ['PG', 'SG', 'SF', 'PF', 'C'][Math.floor(r() * 5)];
    const ovr = clamp(Math.round(62 - pick * 0.22 + gaussR(r) * 2), 40, 64), pot = clamp(Math.round(ovr + 14 - pick * 0.1 + r() * 6), ovr + 2, 86);
    const bd = DG.body(pos, r), attrs = DG.buildAttrs(pos, ovr, r), delay = 1 + Math.floor(r() * 3);
    return { id: id || ('pr' + dy + '_' + String(pick).padStart(3, '0')), name, team: 'DRAFT', pos, age: 19 + Math.floor(r() * 4), ht: bd.ht, wt: bd.wt, ovr, pot, nbaId: null, injury: null, attrs, stats: null, face: null,
      draftYear: dy, realPick: pick, arrivalYear: dy + delay, undrafted: false, boardRank: pick, college: college || undefined, draftedBy: ab(tm) };
  };
  const cut = dy => 2 * ((era(dy) || { teams: teams }).teams.length) + 2;   // two rounds
  for (let dy = Y; dy <= 2003; dy++) {
    const rows = (DC[dy] || []).filter(r => r[0] <= cut(dy));
    if (!rows.length) continue;
    const cls = rows.map(r => prospect(dy, r, 0));
    // the real rookies of that season who were never drafted
    const used = new Set(cls.map(p => p.id)), e = era(dy + 1);
    (e ? e.players : []).filter(p => p.rookie && !ids.has(p.id) && !used.has(p.id) && p.ovr).sort((x, y) => y.ovr - x.ovr).slice(0, 12).forEach((p, i) => {
      cls.push({ id: p.id, name: p.name, team: 'DRAFT', pos: p.pos, age: Math.max(19, p.age - 1), ht: p.ht, wt: p.wt, ovr: Math.max(40, p.ovr - 4), pot: Math.min(99, p.ovr + 4), nbaId: p.nbaId || null, injury: null, attrs: p.attrs, stats: null, face: null,
        draftYear: dy, realPick: null, arrivalYear: dy + 1, undrafted: true, boardRank: rows.length + i + 1 });
    });
    drafts[dy] = cls.filter(p => !ids.has(p.id));
  }
  // drafted before this season but not here yet (overseas or still in college): their rights belong to the team that drafted them
  for (let dy = Y - 4; dy < Y; dy++) {
    (DC[dy] || []).filter(r => r[0] <= cut(dy)).forEach(r => {
      if (r[2] && ids.has(r[2])) return;
      const p = prospect(dy, r, 0);
      if (!(p.arrivalYear > Y) || !teamSet.has(ab(r[1]))) return;
      p.rights = { team: ab(r[1]), draftYear: dy, pick: r[0], draftedBy: ab(r[1]) };
      rights.push(p);
    });
  }
  const D04 = global.START_LEAGUES[2004].drafts || {};
  Object.keys(D04).forEach(y => { drafts[y] = D04[y]; });
  const prev = era(Y - 1), records = {};
  if (prev) { records[Y - 1] = {}; prev.teams.forEach(t => { if (t.record) records[Y - 1][ab(t.abbr)] = t.record.w + '-' + t.record.l; }); }
  // accolades and all-time totals as of the start: the real 2004 start file already carries them (awards to 2003, career totals
  // before 2003-04); cut back to what had happened before this season began
  era(2004);
  const P04 = global.START_LEAGUES[2004].prior, awards = {};
  Object.keys(P04.awards || {}).forEach(id => { const l = P04.awards[id].filter(x => x.year < Y); if (l.length) awards[id] = l; });
  // the full honors of everyone on the board: Basketball-Reference's per-season awards column (tools/awards-cache.json),
  // the champions and Finals MVPs (data/history.js), the scoring titles (the era files' per-game lines)
  const AWF = path.join(ROOT, 'tools', 'awards-cache.json'), AC = fs.existsSync(AWF) ? JSON.parse(fs.readFileSync(AWF, 'utf8')) : {};
  const TOK = { AS: 'All-Star', NBA1: 'All-NBA 1st Team', NBA2: 'All-NBA 2nd Team', NBA3: 'All-NBA 3rd Team', DEF1: 'All-Defensive 1st Team', DEF2: 'All-Defensive 2nd Team',
    'MVP-1': 'MVP', 'DPOY-1': 'DPOY', 'ROY-1': 'ROY', 'MIP-1': 'MIP', 'SMOY-1': '6MOY' };
  const addAward = (id, year, award) => { const l = awards[id] = awards[id] || []; if (!l.some(x => x.year === year && x.award === award)) l.push({ year, award }); };
  Object.keys(AC).forEach(id => { if (!ids.has(id)) return; AC[id].forEach(([yr, str]) => { if (yr >= Y) return; str.split(',').forEach(t => { const a = TOK[t.trim()]; if (a) addAward(id, yr, a); }); }); });
  run('data/history.js');
  const finalsMvp = {}; (global.HISTORY_PRIOR.champions || []).forEach(c => { if (c.finalsMvp) finalsMvp[c.year] = c.finalsMvp; });
  for (let y = FIRST; y < Y; y++) {
    const e = era(y); if (!e) continue;
    if (e.champion) e.players.forEach(p => { if (ids.has(p.id) && ab(p.team) === ab(e.champion)) addAward(p.id, y, 'Champion'); });
    const q = e.players.filter(p => p.stats && p.stats.g >= (y <= 1951 ? 40 : 58) && p.stats.pts != null).sort((p1, p2) => p2.stats.pts - p1.stats.pts)[0];
    if (q && ids.has(q.id)) addAward(q.id, y, 'Scoring Champion');
    if (finalsMvp[y]) { const f = e.players.find(p => p.name === finalsMvp[y]); if (f && ids.has(f.id)) addAward(f.id, y, 'Finals MVP'); }
  }
  Object.keys(awards).forEach(id => awards[id].sort((x, z) => x.year - z.year));
  const A04 = P04.alltime, alltime = { keys: A04.keys, cut: A04.cut, retired: A04.retired.filter(r => r[3] < Y), active: {}, games: (A04.games || []).filter(g => g[4] < seasonLabel(Y).slice(0, 4) + '-07-01') };
  const lineOf = {}; d.players.forEach(p => { if (p.stats) lineOf[p.id] = p.stats; });
  Object.keys(A04.active || {}).forEach(id => {
    const a = JSON.parse(JSON.stringify(A04.active[id])), ln = lineOf[id];
    if (ln && a[0]) { const g = ln.g || 0, sub = [g, ln.pts, ln.reb, ln.ast, ln.stl, ln.blk].map((v, i) => (i ? Math.round((v || 0) * g) : g)); sub.forEach((v, i) => { if (a[0][i] != null) a[0][i] = Math.max(0, a[0][i] - v); }); }
    alltime.active[id] = a;
  });
  // players who retired at the end of this season are still active at its start
  A04.retired.filter(r => r[3] >= Y).forEach(r => { if (!alltime.active[r[0]]) alltime.active[r[0]] = [r[5].map(v => v), r[6].map(v => v)]; });
  const out = { season: Y, label: (Y - 1) + '-' + String(Y).slice(2), teams, players, rights, drafts, targetsPrior: {}, prior: { career, awards, history: { champions: [], mvp: {}, records }, alltime }, real, champion: ab(d.champion || '') || null, seasonStats };
  console.log(Y, 'real contracts', realN, 'of', d.players.length, 'free agents', players.filter(p => p.team === 'FA').length);
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
