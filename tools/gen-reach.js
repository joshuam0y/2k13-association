// Writes the daily answer key for a run of days: data/reach/<day>.json (the ten players and every score the auction can reach, for the rank stamp)
// and supabase/daily_key.sql (the same ten and the best score, for the server check). Run it again whenever ratings change.
//   Serve the repo (python3 -m http.server 8123), then:  node tools/gen-reach.js 2026-11-18 60
// needs puppeteer-core and Chrome (CHROME_PATH, default the Mac one).
const fs = require('fs'), path = require('path');
const pp = require('puppeteer-core');
const ROOT = path.join(__dirname, '..') + '/', BASE = process.env.BASE || 'http://localhost:8123';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const start = process.argv[2], N = +(process.argv[3] || 60);
if (!/^\d{4}-\d\d-\d\d$/.test(start || '')) { console.log('usage: node tools/gen-reach.js YYYY-MM-DD [days]'); process.exit(1); }
const days = []; for (let i = 0; i < N; i++) { const d = new Date(start + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i); days.push(d.toISOString().slice(0, 10)); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await pp.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.goto(BASE + '/#/home'); await sleep(2500);
  await p.evaluate(() => { UI.profile.signedIn = () => false; UI.profile.rpc = async () => []; });
  const rows = [];
  for (const day of days) {
    const r = await p.evaluate(async d => { try { return await UI.ranked.reachFor(d); } catch (e) { return { err: String(e) }; } }, day);
    if (!r || r.err || !r.names || r.names.length < 5 || !r.s || !r.s.length) { console.log(day, 'FAILED', JSON.stringify(r).slice(0, 120)); process.exitCode = 1; continue; }
    fs.mkdirSync(ROOT + 'data/reach', { recursive: true });
    fs.writeFileSync(ROOT + 'data/reach/' + day + '.json', JSON.stringify({ names: r.names, best: r.best, s: r.s }));
    rows.push({ day, names: r.names, best: r.best });
    console.log(day, 'results', r.s.length, 'best', r.best.toFixed(2));
  }
  const q = s => "'" + String(s).replace(/'/g, "''") + "'";
  const sql = "-- answer key for the daily: the ten players and the best score the auction can reach, one row a day. Run once in the Supabase SQL editor (after community.sql).\n-- Regenerate before the last day here passes, and after every ratings update; a day with no row is simply not checked.\ninsert into public.daily_key (day, names, best) values\n" +
    rows.map(r => '  (' + q(r.day) + ', array[' + r.names.map(q).join(', ') + '], ' + r.best.toFixed(2) + ')').join(',\n') + "\non conflict (day) do update set names = excluded.names, best = excluded.best;\n";
  if (rows.length) fs.writeFileSync(ROOT + 'supabase/daily_key.sql', sql);
  console.log('DONE', rows.length);
  await b.close();
})();
