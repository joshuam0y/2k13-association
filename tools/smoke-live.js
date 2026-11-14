// Browser smoke test: the page loads with no errors, and the daily answer key files match the day's real ten players.
// Serve the repo first (python3 -m http.server 8123). Needs puppeteer-core (NODE_PATH or npm i --no-save puppeteer-core) and Chrome (CHROME_PATH).
//   node tools/smoke-live.js [day ...]     default: today's key, a mid day and the last day on file
const fs = require('fs'), path = require('path');
const pp = require('puppeteer-core');
const ROOT = path.join(__dirname, '..') + '/', BASE = process.env.BASE || 'http://localhost:8123';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const have = fs.readdirSync(ROOT + 'data/reach').filter(f => /\.json$/.test(f)).map(f => f.slice(0, -5)).sort();
  const days = process.argv.length > 2 ? process.argv.slice(2) : [have[1], have[Math.floor(have.length / 2)], have[have.length - 1]];
  const b = await pp.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(), errs = [];
  p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 160)); });
  p.on('requestfailed', r => errs.push('reqfail ' + r.url().slice(0, 100)));
  let bad = 0;
  try {
    await p.goto(BASE + '/#/home', { waitUntil: 'load' }); await sleep(2500);
    await p.evaluate(() => { UI.profile.signedIn = () => false; UI.profile.rpc = async () => []; });
    for (const day of days) {
      const r = await p.evaluate(async d => { try { return await UI.ranked.reachFor(d); } catch (e) { return { err: String(e) }; } }, day);
      const f = JSON.parse(fs.readFileSync(ROOT + 'data/reach/' + day + '.json', 'utf8'));
      const ok = r && !r.err && JSON.stringify(r.names) === JSON.stringify(f.names) && r.best === f.best && r.names.length === 10;
      console.log(ok ? 'ok  ' : 'FAIL', 'key', day, ok ? 'best ' + f.best : JSON.stringify(r).slice(0, 120));
      if (!ok) bad++;
    }
  } catch (e) { console.log('FAIL', e.message); bad++; }
  await sleep(300);
  console.log(errs.length ? 'FAIL ' + errs.length + ' page errors' : 'ok   no page errors'); errs.slice(0, 8).forEach(e => console.log('  ', e));
  await b.close();
  process.exit(bad || errs.length ? 1 : 0);
})();
