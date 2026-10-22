// UI entry point: boot, hash router, header chrome and "not built yet" messages.
// Other modules add pages with UI.pages[name] = function (app, arg) { ... } in files loaded
// after this one; they get a route (#/name/arg) and a nav entry automatically.
(function () {
  'use strict';
  const UI = window.UI;
  const esc = UI.esc;

  UI.notBuilt = function (what) {
    if (what === 'data') {
      return UI.empty('LEAGUE DATA NOT BUILT YET',
        'The league file <code>data/league2012.js</code> has not loaded, so there are no teams or players to show yet. It is still being built. Try again soon, or open the site with <code>?stub=1</code> to use a small test league.',
        '<div class="row-btns"><a class="btn btn-gold" href="?stub=1#/home">OPEN WITH TEST DATA</a></div>');
    }
    const missing = [!UI.state.engine && 'js/engine.js', !UI.state.L && 'js/league.js'].filter(Boolean).map(f => '<code>' + f + '</code>').join(' and ');
    return UI.empty('SIM ENGINE NOT BUILT YET',
      'The game files ' + missing + ' have not loaded, so seasons cannot be played yet. Rosters and player cards still work.',
      '<div class="row-btns"><a class="btn" href="#/teams">ROSTERS</a><a class="btn" href="?stub=1#/home">OPEN WITH TEST DATA</a></div>');
  };

  // ---------- pages added by other modules ----------
  const CORE = ['home', 'new', 'continue', 'teams', 'team', 'player', 'season', 'game', 'standings', 'leaders', 'playoffs', 'saves', 'soundtrack'];
  const KNOWN = [
    ['myteam', 'Team'], ['manage', 'Team'], ['gm', 'Team'], ['trade', 'Trades'], ['trades', 'Trades'],
    ['fa', 'Free Agency'], ['freeagency', 'Free Agency'], ['draft', 'Draft'], ['history', 'History'],
    ['news', 'News'], ['live', 'Watch Live'], ['commish', 'Commissioner'], ['commissioner', 'Commissioner']
  ];
  UI.extraPages = function () {
    const pages = UI.pages || {};
    const out = [];
    const seen = new Set();
    KNOWN.forEach(([route, label]) => {
      if (typeof pages[route] === 'function' && !seen.has(label)) { seen.add(label); out.push({ route, label: pages[route].navLabel || label, desc: pages[route].navDesc || '' }); }
    });
    Object.keys(pages).forEach(route => {
      if (CORE.includes(route) || out.some(x => x.route === route) || KNOWN.some(k => k[0] === route) || typeof pages[route] !== 'function' || pages[route].hidden) return;
      out.push({ route, label: pages[route].navLabel || route.replace(/^./, c => c.toUpperCase()), desc: pages[route].navDesc || '' });
    });
    return out;
  };
  function buildExtraNav() {
    const nav = document.getElementById('mainnav');
    nav.querySelectorAll('.nav-extra, .navmore').forEach(x => x.remove());
    const extra = UI.extraPages();
    if (!extra.length) return;
    // Phones: extra links inline in the scrolling nav. Laptops: a "More" dropdown.
    extra.forEach(x => {
      const a = document.createElement('a');
      a.href = '#/' + x.route;
      a.className = 'nav-extra';
      a.setAttribute('data-nav', x.route);
      a.textContent = x.label;
      nav.appendChild(a);
    });
    const more = document.createElement('details');
    more.className = 'navmore';
    more.innerHTML = `<summary>More</summary><div class="navmore-list">${extra.map(x => `<a href="#/${esc(x.route)}" data-nav="${esc(x.route)}">${esc(x.label)}</a>`).join('')}</div>`;
    nav.appendChild(more);
    more.addEventListener('click', e => { if (e.target.closest('a')) more.open = false; });
    document.addEventListener('click', e => { if (!more.contains(e.target)) more.open = false; });
  }

  UI.updateChrome = function () {
    const chip = document.getElementById('userchip');
    const user = UI.userTeam();
    if (user && UI.state.season) {
      const d = UI.currentDate ? UI.currentDate() : null;
      const sub = UI.inOffseason && UI.inOffseason() ? (UI.PHASES[UI.state.game.phase] || '').toUpperCase() : d ? UI.dateLabel(d).toUpperCase() : 'DAY ' + (UI.currentDay() + 1);
      const pend = UI.pendingEvents ? UI.pendingEvents() : 0;
      chip.innerHTML = `<a href="#/season" title="Back to your season">${UI.logo(user, 30)}<span><b>${esc(user)} ${esc(UI.record(user))}</b><small>${esc(sub)}</small></span>${pend ? `<i class="chip-dot" title="${pend} decisions waiting">${pend}</i>` : ''}</a>`;
    } else chip.innerHTML = '';
  };

  function setBanner() {
    const b = document.getElementById('banner');
    const msgs = [];
    if (window.__A13_STUB) msgs.push('Test mode: a two-team stub league and a fake engine are loaded (?stub=1).');
    else if (UI.state.league && !UI.canPlay()) msgs.push('The sim engine is not built yet. Rosters and player cards work; season play is waiting on it.');
    b.hidden = !msgs.length;
    b.textContent = msgs.join(' ');
  }

  const NAV = { new: 'home', continue: 'home', team: 'teams', player: 'teams', game: 'season', soundtrack: 'home' };

  UI.route = function () {
    const app = document.getElementById('app');
    const parts = (location.hash || '#/home').replace(/^#\/?/, '').split('/');
    let page = parts[0] || 'home';
    const arg = parts.slice(1).join('/');
    if (page !== 'continue' && typeof (UI.pages || {})[page] !== 'function') page = 'home';
    const navKey = NAV[page] || page;
    UI.$$('#mainnav a').forEach(a => a.classList.toggle('on', a.getAttribute('data-nav') === navKey));
    const more = UI.$('#mainnav .navmore');
    if (more) more.classList.toggle('on', !!more.querySelector(`a[data-nav="${navKey}"]`));

    if (!UI.state.league && page !== 'soundtrack') { app.innerHTML = UI.notBuilt('data'); return; }
    if (page === 'continue') { continueLatest(); return; }
    let decoded = arg;
    try { decoded = decodeURIComponent(arg); } catch (e) { /* keep raw */ }
    try {
      UI.pages[page](app, decoded);
    } catch (e) {
      console.warn('Page failed', page, e);
      app.innerHTML = UI.empty('SOMETHING WENT WRONG', 'This page could not be drawn: ' + esc(e && e.message ? e.message : e), '<a class="btn" href="#/home">HOME</a>');
    }
  };

  async function continueLatest() {
    const latest = UI.saves.latest();
    if (!latest) { location.replace('#/home'); return; }
    if (UI.state.slot !== latest.slot || !UI.state.game) {
      document.getElementById('app').innerHTML = '<div class="loading">Loading your league...</div>';
      try { await UI.saves.load(latest.slot); } catch (e) { UI.toast('Could not load the save: ' + e.message, 'error'); location.replace('#/saves'); return; }
    }
    UI.updateChrome();
    location.replace('#/season');
  }

  let lastPage = null;
  function onHash() {
    const page = (location.hash || '#/home').replace(/^#\/?/, '').split('/')[0];
    UI.route();
    if (page !== lastPage || page === 'player' || page === 'team' || page === 'game') window.scrollTo(0, 0);
    lastPage = page;
  }

  async function boot() {
    UI.state.league = window.LEAGUE_2012 && Array.isArray(window.LEAGUE_2012.teams) ? window.LEAGUE_2012 : null;
    UI.state.engine = window.ENGINE && typeof window.ENGINE.simDays === 'function' ? window.ENGINE : null;
    UI.state.L = window.LEAGUE && typeof window.LEAGUE.newLeague === 'function' ? window.LEAGUE : null;
    setBanner();
    buildExtraNav();
    try { UI.music.init(); } catch (e) { console.warn('Soundtrack bar failed', e); }
    if (UI.state.league && UI.canPlay()) {
      const slot = UI.saves.activeSlot();
      if (slot && UI.saves.list().some(x => x.slot === slot && x.meta)) {
        document.getElementById('app').innerHTML = '<div class="loading">Loading your league...</div>';
        try { await UI.saves.load(slot); } catch (e) { console.warn('Could not restore the active save', e); }
      }
    }
    UI.updateChrome();
    window.addEventListener('hashchange', onHash);
    if (!location.hash) history.replaceState(null, '', location.pathname + location.search + '#/home');
    onHash();
    if (UI.pendingEvents && UI.pendingEvents() && /^#\/season/.test(location.hash)) UI.showEvents();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
