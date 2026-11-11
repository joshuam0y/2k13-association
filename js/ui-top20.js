// Top 20 By Season (#/top20): the 20 highest rated players of every season in the all-time pool, newest first.
// Public: needs no save. The pool loads on demand.
(function () {
  'use strict';
  const P = UI.pages, esc = UI.esc, C = window.CHALLENGE;
  const lbl = y => (y - 1) + '-' + String(y).slice(2);
  const tier = o => (o >= 95 ? 'g' : o >= 90 ? 'a' : o >= 85 ? 'b' : '');

  function draw(app, pool) {
    const by = {};
    pool.players.forEach(p => { (by[p.season] = by[p.season] || []).push(p); });
    const ys = Object.keys(by).map(Number).sort((a, b) => b - a);
    const decs = [...new Set(ys.map(y => Math.floor((y - 1) / 10) * 10))];
    app.innerHTML = `${UI.header('TOP 20 BY SEASON', 'The 20 highest rated players of every season, newest first. Seasons before the 1970s have fewer than 20 players in the pool.')}
      <div class="t20-nav">${decs.map(d => `<a class="ch-chip sm" href="#/top20/${d + 10}">${d}s</a>`).join('')}</div>
      <div class="t20-grid">${ys.map(y => {
        const l = by[y].slice().sort((a, b) => b.ovr - a.ovr).slice(0, 20);
        return `<section class="t20-yr" id="t20-${y}"><h3>${esc(lbl(y))}${l.length < 20 ? ' <small>only ' + l.length + ' in the pool</small>' : ''}</h3><ol>${l.map(p => `<li><span class="n">${esc(p.name)}</span><span class="t">${esc(p.team)}</span><b class="${tier(p.ovr)}">${p.ovr}</b></li>`).join('')}</ol></section>`;
      }).join('')}</div>`;
  }

  P.top20 = function (app, arg) {
    const go = () => { const el = arg && document.getElementById('t20-' + arg); if (el) el.scrollIntoView(); };
    if (window.CHALLENGE_POOL) { draw(app, window.CHALLENGE_POOL); go(); return; }
    app.innerHTML = '<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING THE ALL-TIME POOL...</div></section>';
    C.load('pool').then(pool => { if (/^#\/top20/.test(location.hash)) { draw(app, pool); go(); } })
      .catch(e => { app.innerHTML = UI.empty('THE POOL DID NOT LOAD', esc(e.message || ''), '<div class="row-btns"><a class="btn" href="#/top20">TRY AGAIN</a></div>'); });
  };
  P.top20.navLabel = 'Top 20 By Season';
  P.top20.navDesc = 'The 20 best rated players of every season, 1946-47 to now';
})();
