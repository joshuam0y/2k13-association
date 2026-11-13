// Moves the 2026-27 ratings a little toward what players are really doing this season (ESPN's public player stats), capped, weekly.
// Every move is measured from the ratings at the start of the season (data/ratings-baseline-2027.json), so nothing drifts and the cap holds.
//   node tools/update-ratings.js            dry run: prints who would move
//   node tools/update-ratings.js --write    writes data/start-2027.js and data/challenge-pool.js (and the baseline the first time)
// Safety: if ESPN's answer looks wrong (too few players, too few matched, no games yet) it stops and writes nothing.
const fs = require('fs'), https = require('https');
global.window = global; console.warn = () => {};
require('../js/progression.js'); const P = window.PROG;
const WRITE = process.argv.includes('--write');
const MAXMOVE = 6, K = 12, FULL_GP = 30, MIN_MPG = 15, MIN_GP = 5;
const key = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');
const get = url => new Promise((res, rej) => https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(new Error('ESPN did not return JSON')); } }); }).on('error', rej));
const ESPN = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&limit=500&sort=offensive.avgPoints%3Adesc&season=2027&seasontype=2';

function load(f, marker, tail) {
  const s = fs.readFileSync(f, 'utf8'), a = s.indexOf(marker) + marker.length, b = s.lastIndexOf(tail);
  return { s, a, b, obj: JSON.parse(s.slice(a, b + 1)) };
}
(async () => {
  const d = await get(ESPN);
  const rows = (d.athletes || []).map(x => {
    const g = {}; (x.categories || []).forEach((c, ci) => ((((d.categories || [])[ci]) || {}).names || []).forEach((n, i) => { g[n] = c.values[i]; }));
    return { name: x.athlete.displayName, gp: g.gamesPlayed, mpg: g.avgMinutes, pts: g.avgPoints, reb: g.avgRebounds, ast: g.avgAssists, stl: g.avgSteals, blk: g.avgBlocks, tov: g.avgTurnovers, fgm: g.avgFieldGoalsMade, fga: g.avgFieldGoalsAttempted, ftm: g.avgFreeThrowsMade, fta: g.avgFreeThrowsAttempted };
  }).filter(r => r.name && r.gp != null);
  if (rows.length < 150 || Math.max.apply(null, rows.map(r => r.gp)) < 3) { console.log('ESPN looks wrong (' + rows.length + ' players), nothing written.'); process.exit(1); }
  const espn = {}; rows.forEach(r => { espn[key(r.name)] = r; });

  const st = load('data/start-2027.js', 'window.START_LEAGUES[2027] = ', '};\nif (typeof module');
  const pl = load('data/challenge-pool.js', 'window.CHALLENGE_POOL = ', '};');
  const players = st.obj.players, cards = pl.obj.players.filter(p => p.season === 2027);
  // the ratings the season opened with
  const BF = 'data/ratings-baseline-2027.json';
  let base = {}; if (fs.existsSync(BF)) base = JSON.parse(fs.readFileSync(BF, 'utf8'));
  else { players.forEach(p => { base[p.id] = p.ovr; }); cards.forEach(p => { if (base[p.id] == null) base[p.id] = p.ovr; }); }
  const b0 = p => (base[p.id] != null ? base[p.id] : p.ovr);

  const eff = r => r.pts + r.reb + r.ast + r.stl + r.blk - r.tov - (r.fga - r.fgm) - (r.fta - r.ftm);
  const q = [];   // qualified: matched, enough games and minutes
  players.forEach(p => { const r = espn[key(p.name)]; if (r && r.gp >= MIN_GP && r.mpg >= MIN_MPG) q.push({ p, r, perf: eff(r) / Math.max(r.mpg, 1) * 36 }); });
  const pct = (arr, f) => { const s = arr.map(f).sort((a, b) => a - b); return v => { let lo = 0; while (lo < s.length && s[lo] < v) lo++; let hi = lo; while (hi < s.length && s[hi] === v) hi++; return (lo + hi) / 2 / s.length; }; };
  // compared within position (bigs pile up rebounds and blocks, guards do not), so the update never favours a position
  const grp = p => { const t = String(p.pos || '').toUpperCase(); return /C/.test(t) ? 'B' : /^(PG|SG|G)/.test(t) ? 'G' : 'F'; };
  const byG = {}; q.forEach(x => { (byG[grp(x.p)] = byG[grp(x.p)] || []).push(x); });
  const pp = {}, rp = {}; Object.keys(byG).forEach(g => { pp[g] = pct(byG[g], x => x.perf); rp[g] = pct(byG[g], x => b0(x.p)); });
  const perfPct = (v, p) => pp[grp(p)](v), ratePct = (v, p) => rp[grp(p)](v);
  const move = {};
  q.forEach(x => { const w = Math.min(1, x.r.gp / FULL_GP); const dlt = Math.round(K * (perfPct(x.perf, x.p) - ratePct(b0(x.p), x.p)) * w); move[x.p.id] = Math.max(-MAXMOVE, Math.min(MAXMOVE, dlt)); });
  const matched = players.filter(p => espn[key(p.name)]).length;
  console.log('ESPN players', rows.length, '| league players', players.length, '| matched', matched, '| qualified', q.length, '| most games', Math.max.apply(null, rows.map(r => r.gp)));
  if (matched < 150) { console.log('too few matched, nothing written.'); process.exit(1); }
  const list = q.map(x => ({ n: x.p.name, from: b0(x.p), to: b0(x.p) + move[x.p.id], gp: x.r.gp })).filter(x => x.to !== x.from).sort((a, b) => (b.to - b.from) - (a.to - a.from));
  console.log('moves:', list.length, 'up', list.filter(x => x.to > x.from).length, 'down', list.filter(x => x.to < x.from).length);
  console.log('UP  ', list.slice(0, 10).map(x => x.n + ' ' + x.from + '>' + x.to + ' (' + x.gp + 'g)').join(', '));
  console.log('DOWN', list.slice(-10).reverse().map(x => x.n + ' ' + x.from + '>' + x.to + ' (' + x.gp + 'g)').join(', '));
  const jt = q.find(x => /ty jerome/i.test(x.p.name)); if (jt) console.log('Ty Jerome', b0(jt.p), '>', b0(jt.p) + move[jt.p.id], '(' + jt.r.gp + ' games, ' + jt.r.pts + ' ppg)');
  if (!WRITE) { console.log('dry run: nothing written (use --write).'); return; }
  const set = (p, t) => { if (p.ovr === t) return; if (p.attrs) P.setOvr(p, t, { keepPot: true }); else p.ovr = t; p.ovr = t; };
  let n = 0;
  players.forEach(p => { const t = b0(p) + (move[p.id] || 0); if (p.ovr !== t) { set(p, t); n++; } });
  cards.forEach(p => { const t = b0(p) + (move[p.id] || 0); if (p.ovr !== t) { set(p, t); n++; } });
  if (!fs.existsSync(BF)) fs.writeFileSync(BF, JSON.stringify(base));
  fs.writeFileSync('data/start-2027.js', st.s.slice(0, st.a) + JSON.stringify(st.obj) + st.s.slice(st.b + 1));
  fs.writeFileSync('data/challenge-pool.js', pl.s.slice(0, pl.a) + JSON.stringify(pl.obj) + pl.s.slice(pl.b + 1));
  console.log('written:', n, 'ratings changed');
})().catch(e => { console.log('failed:', e.message); process.exit(1); });
