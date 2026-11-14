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
  // other hosts (headshots on cdn.nba.com) and plain resource-load lines are network noise, not app errors; the site's own files and thrown errors count
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console ' + m.text().slice(0, 160)); });
  p.on('requestfailed', r => { if (r.url().startsWith(BASE)) errs.push('reqfail ' + r.url().slice(0, 100)); });
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
    // every registered page, first with no league, then with a fresh one loaded: no thrown errors, no blank screen
    const names = await p.evaluate(() => Object.keys(UI.pages || {}).sort());
    const visit = async label => {
      let n = 0, blank = [], before = errs.length;
      for (const name of names) {
        const e0 = errs.length;
        await p.evaluate(n => { location.hash = '#/' + n; }, name); await sleep(120);
        const len = await p.evaluate(() => (document.getElementById('app') || {}).innerText ? document.getElementById('app').innerText.trim().length : 0);
        if (!len) blank.push(name);
        if (errs.length > e0) errs.splice(e0, errs.length - e0, ...errs.slice(e0).map(x => x + ' [page ' + name + ' ' + label + ']'));
        n++;
      }
      console.log(blank.length || errs.length > before ? 'FAIL' : 'ok  ', label + ':', n, 'pages' + (blank.length ? ', blank: ' + blank.join(',') : '') + (errs.length > before ? ', ' + (errs.length - before) + ' errors' : ''));
      if (blank.length) bad++;
    };
    await visit('no league');
    const made = await p.evaluate(() => { try { UI.state.game = window.LEAGUE.newLeague('OKC', { seed: 1 }); UI.state.slot = UI.state.slot || 1; return true; } catch (e) { return String(e); } });
    if (made === true) { await visit('with league'); await p.evaluate(() => { location.hash = '#/home'; }); }
    else { console.log('FAIL could not start a league:', made); bad++; }
  } catch (e) { console.log('FAIL', e.message); bad++; }
  await sleep(300);
  console.log(errs.length ? 'FAIL ' + errs.length + ' page errors' : 'ok   no page errors'); errs.slice(0, 8).forEach(e => console.log('  ', e));
  await b.close();
  process.exit(bad || errs.length ? 1 : 0);
})();
