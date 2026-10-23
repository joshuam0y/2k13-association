/* First-time guide, help sheet and keyboard shortcuts.

   Tour: the first time a new league opens the season hub (day 0 of the first regular season,
   state.settings.guideDone not set), four coach marks point at the real hub tiles. Skip or Done
   sets state.settings.guideDone = true and saves, so it never shows on its own again.
   Help: the "?" button in the top bar (or the ? key) opens a short help sheet that can replay the tour.
   Keys (laptop, ignored while typing): N next game, W week, M month (they press the hub's own sim
   buttons, so every question before a key date still comes up), R roster, T trades, F free agency,
   S standings, ? help. UI.guide = { start(force), help(), close() }. */
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI) return;
  const P = UI.pages = UI.pages || {};
  const esc = UI.esc;

  const STEPS = [
    { sel: ['.hub-grid .mt-play'], title: 'PLAY', text: 'Sim one game, a week, or to a key date. SIM TO... jumps to the trade deadline, the All-Star break or the end of the season.' },
    { sel: ['.hub-grid a.mtile[href^="#/team/"]', '.hub-grid a.mtile[href="#/manage"]'], title: 'ROSTER AND ROTATION', text: 'See your players and their ratings, then set starters, bench order and minutes. Auto rotation picks the best lineup for you.' },
    { sel: ['.hub-grid a.mtile[href="#/trade"]', '.hub-grid a.mtile[href="#/fa"]'], title: 'TRADES AND FREE AGENCY', text: 'Build trades with any team and sign unsigned players. Salaries have to fit the cap rules of the era.' },
    { sel: ['.cal', '.hub-news'], first: true, title: 'CALENDAR AND NEWS', text: 'The calendar counts down to the next key dates. League news and your team\'s headlines are at the bottom of this page.' }
  ];

  const g = () => UI.state.game;
  const settings = () => { const s = g(); if (!s) return null; if (!s.settings || typeof s.settings !== 'object') s.settings = { difficulty: 'normal' }; return s.settings; };
  const onHub = () => /^#\/season\/?$/.test(location.hash || '') && !!document.querySelector('#app .hub-grid');
  const modalOpen = () => { const m = document.getElementById('eventModal'); return !!m && !m.hidden; };
  const simBusy = () => { const o = document.getElementById('simOverlay'); return !!UI.simming || (!!o && !o.hidden); };

  // ---------- tour ----------
  let tour = null;   // { i, layer, spot, card }

  // The box around a step's tiles: all of them, or the first one found for a "first" step.
  function rectOf(step) {
    let r = null;
    for (const sel of step.sel) {
      const el = document.querySelector('#app ' + sel);
      const b = el && el.getBoundingClientRect();
      if (!b || (!b.width && !b.height)) continue;
      r = r ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) }
        : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      if (step.first) break;
    }
    return r;
  }
  const topH = () => { const t = document.querySelector('.topbar'); return t ? Math.max(0, t.getBoundingClientRect().bottom) : 0; };

  // Scrolls the step into view: the target near the top when the card fits under it, else centered.
  function scrollTo(step) {
    const r = rectOf(step);
    if (!r) return;
    const head = topH() + 12;
    const cardH = tour.card.offsetHeight || 200;
    const h = r.bottom - r.top;
    const room = window.innerHeight - head;
    let y = window.scrollY + r.top - head;
    if (h + cardH + 24 > room) y = window.scrollY + r.top - head - Math.max(0, (room - h) / 2);
    if (h > room) y = window.scrollY + r.top - head;
    window.scrollTo(0, Math.max(0, y));
  }

  function layout() {
    if (!tour) return;
    const step = STEPS[tour.i];
    const r = rectOf(step);
    const card = tour.card, spot = tour.spot;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    if (!r) { spot.hidden = true; card.style.left = Math.max(16, (vw - cw) / 2) + 'px'; card.style.top = Math.max(16, (vh - ch) / 2) + 'px'; return; }
    const pad = 6;
    const box = { left: Math.max(4, r.left - pad), top: Math.max(4, r.top - pad), right: Math.min(vw - 4, r.right + pad), bottom: Math.min(vh - 4, r.bottom + pad) };
    spot.hidden = false;
    Object.assign(spot.style, { left: box.left + 'px', top: box.top + 'px', width: Math.max(0, box.right - box.left) + 'px', height: Math.max(0, box.bottom - box.top) + 'px' });
    const head = topH();
    let top;
    if (vh - box.bottom >= ch + 24) top = box.bottom + 12;
    else if (box.top - head >= ch + 24) top = box.top - ch - 12;
    else top = vh - ch - 16;
    top = Math.max(Math.min(top, vh - ch - 12), 12);
    let left = (box.left + box.right) / 2 - cw / 2;
    left = Math.max(16, Math.min(left, vw - cw - 16));
    card.style.left = left + 'px';
    card.style.top = top + 'px';
    card.classList.toggle('gd-below', top > box.top);
  }

  function show(i) {
    if (!tour) return;
    // Skip steps whose tiles are not on the page.
    while (i < STEPS.length && !rectOf(STEPS[i]) && i < STEPS.length - 1) i++;
    tour.i = i;
    const step = STEPS[i];
    const last = i === STEPS.length - 1;
    tour.card.innerHTML = `<div class="gd-k">GETTING STARTED <span>${i + 1} OF ${STEPS.length}</span></div>
      <div class="gd-t" id="gdTitle">${esc(step.title)}</div>
      <p class="gd-p" id="gdText">${esc(step.text)}</p>
      ${last ? '<p class="gd-p gd-tip">Press the ? button at the top any time for help and keyboard shortcuts.</p>' : ''}
      <div class="gd-btns">${last ? '' : '<button type="button" class="btn btn-small" data-gd="skip">SKIP</button>'}<button type="button" class="btn btn-gold btn-small" data-gd="next">${last ? 'DONE' : 'NEXT'}</button></div>`;
    scrollTo(step);
    layout();
    requestAnimationFrame(layout);
    const nb = tour.card.querySelector('[data-gd="next"]');
    if (nb) nb.focus({ preventScroll: true });
  }

  function finish() {
    if (!tour) return;
    tour.layer.remove();
    window.removeEventListener('resize', onMove);
    window.removeEventListener('scroll', onMove, true);
    tour = null;
    const s = settings();
    if (s && !s.guideDone) { s.guideDone = true; if (UI.saveNow) UI.saveNow(); }
  }
  let raf = 0;
  function onMove() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; layout(); }); }

  function start(force) {
    if (tour) return;
    if (!g() || !g().season) return;
    if (!onHub()) { if (force) { location.hash = '#/season'; setTimeout(() => start(true), 120); } return; }
    closeHelp();
    const layer = document.createElement('div');
    layer.className = 'gd-layer';
    layer.innerHTML = '<div class="gd-spot"></div><div class="gd-card" role="dialog" aria-modal="true" aria-labelledby="gdTitle" aria-describedby="gdText"></div>';
    document.body.appendChild(layer);
    tour = { i: 0, layer, spot: layer.querySelector('.gd-spot'), card: layer.querySelector('.gd-card') };
    layer.addEventListener('click', e => {
      const b = e.target.closest('[data-gd]');
      if (!b) return;
      if (b.getAttribute('data-gd') === 'skip') finish();
      else if (tour.i >= STEPS.length - 1) finish();
      else show(tour.i + 1);
    });
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    show(0);
  }

  // First visit: a brand new league on the hub. Waits for any decision popup or sim to finish.
  function maybeAuto() {
    const s = settings();
    const st = g();
    if (!s || s.guideDone || tour || !st || !st.season) return;
    if (UI.inOffseason && UI.inOffseason()) return;
    if (UI.currentDay() !== 0 || (st.history && Array.isArray(st.history.seasons) && st.history.seasons.length)) return;
    let tries = 0;
    (function wait() {
      if (tour || s.guideDone || !onHub()) return;
      if ((modalOpen() || simBusy() || helpEl) && tries++ < 600) { setTimeout(wait, 300); return; }
      if (modalOpen() || simBusy()) return;
      start(false);
    })();
  }

  // The hub keeps its own drawing; the guide runs after it, and follows it when it redraws.
  if (typeof P.season === 'function' && !P.season.__guide) {
    const draw = P.season;
    const wrapped = function (app, arg) {
      const out = draw.apply(this, arguments);
      if (tour) requestAnimationFrame(layout);
      else setTimeout(maybeAuto, 350);
      return out;
    };
    Object.keys(draw).forEach(k => { wrapped[k] = draw[k]; });
    wrapped.__guide = true;
    P.season = wrapped;
  }
  // Leaving the hub ends the tour (without marking it done when it was started by hand).
  window.addEventListener('hashchange', () => { if (tour && !/^#\/season\/?$/.test(location.hash)) finish(); });

  // ---------- help sheet ----------
  const KEYS = [['N', 'Sim to your next game'], ['W', 'Sim a week'], ['M', 'Sim a month'], ['R', 'Your roster'], ['T', 'Trades'], ['F', 'Free agency'], ['S', 'Standings'], ['?', 'This help']];
  let helpEl = null;
  function closeHelp() {
    if (!helpEl) return;
    helpEl.remove();
    helpEl = null;
    const b = document.getElementById('gdHelpBtn');
    if (b) b.setAttribute('aria-expanded', 'false');
  }
  function help() {
    if (helpEl) { closeHelp(); return; }
    if (tour) finish();
    const el = document.createElement('div');
    el.className = 'gd-sheet';
    el.innerHTML = `<div class="gd-box" role="dialog" aria-modal="true" aria-labelledby="gdHelpTitle">
      <div class="gd-head"><span id="gdHelpTitle">HOW TO PLAY</span><button type="button" class="gd-x" data-gh="close" aria-label="Close help">&times;</button></div>
      <div class="gd-body">
        <p>You run one NBA team. Sim games from the PLAY tile on the Season page, make trades and signings, and set your rotation. The sim stops for decisions that need you.</p>
        <h3>THE OFFSEASON</h3>
        <ol class="gd-steps">
          <li><b>Draft Lottery.</b> The teams that missed the playoffs draw for the top picks, with the real odds of the era.</li>
          <li><b>NBA Draft.</b> Two rounds. Make your picks, or sim past and the AI picks for you.</li>
          <li><b>Re-Signing.</b> Offer new deals to your players whose contracts are ending before they hit the market.</li>
          <li><b>Free Agency.</b> Sign unsigned players with your cap space and exceptions. Other teams bid too.</li>
          <li><b>Training Camp.</b> The last stop before opening night. Set your rotation for the new season.</li>
        </ol>
        <p class="muted">Press NEXT on the PLAY tile to move to the next step.</p>
        <h3>RATINGS</h3>
        <dl class="gd-dl">
          <dt>OVR</dt><dd>A player's overall rating today on the 2K13 scale, from 25 to 99. 80 and up is a star, 70s are starters and rotation players.</dd>
          <dt>TEAM OVR</dt><dd>The rating of the whole team, from its top eight players. The best players count the most. G League and overseas players are left out.</dd>
        </dl>
        <h3>KEYBOARD SHORTCUTS</h3>
        <ul class="gd-keys">${KEYS.map(([k, t]) => `<li><kbd>${esc(k)}</kbd><span>${esc(t)}</span></li>`).join('')}</ul>
        <p class="muted">N, W and M work on the Season page and still ask before a key date. Keys do nothing while you type in a box.</p>
      </div>
      <div class="gd-foot">${g() && g().season ? '<button type="button" class="btn btn-small" data-gh="tour">SHOW TOUR</button>' : ''}${P.settings ? '<a class="btn btn-small" href="#/settings" data-gh="settings">SETTINGS</a>' : ''}<button type="button" class="btn btn-gold btn-small" data-gh="close">CLOSE</button></div>
    </div>`;
    document.body.appendChild(el);
    helpEl = el;
    const b = document.getElementById('gdHelpBtn');
    if (b) b.setAttribute('aria-expanded', 'true');
    el.addEventListener('click', e => {
      if (e.target === el) { closeHelp(); return; }
      const x = e.target.closest('[data-gh]');
      if (!x) return;
      const what = x.getAttribute('data-gh');
      closeHelp();
      if (what === 'tour') start(true);
    });
    const c = el.querySelector('.gd-foot [data-gh="close"]');
    if (c) c.focus({ preventScroll: true });
  }

  // "?" in the top bar, next to the team chip.
  function addButton() {
    if (document.getElementById('gdHelpBtn')) return;
    const bar = document.querySelector('.topbar');
    if (!bar) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'gdHelpBtn';
    b.className = 'gd-help-btn';
    b.setAttribute('aria-label', 'Help and keyboard shortcuts');
    b.setAttribute('aria-haspopup', 'dialog');
    b.setAttribute('aria-expanded', 'false');
    b.title = 'Help and shortcuts (?)';
    b.textContent = '?';
    b.addEventListener('click', help);
    bar.insertBefore(b, document.getElementById('userchip'));
  }
  addButton();

  // ---------- keyboard ----------
  function hubButton(how) {
    const want = JSON.stringify(how);
    return Array.from(document.querySelectorAll('#app .mt-play .sim-btn[data-how]')).find(b => b.getAttribute('data-how') === want && !b.disabled) || null;
  }
  function press(b) { if (b && !b.disabled) { b.click(); return true; } return false; }
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
    const key = e.key;
    if (tour) {
      if (key === 'Escape') { e.preventDefault(); finish(); }
      else if (key === 'ArrowRight' && !e.repeat) { e.preventDefault(); if (tour.i >= STEPS.length - 1) finish(); else show(tour.i + 1); }
      return;
    }
    if (helpEl) {
      if (key === 'Escape' || key === '?') { e.preventDefault(); closeHelp(); }
      return;
    }
    if (e.repeat || modalOpen()) return;
    if (key === '?') { e.preventDefault(); help(); return; }
    if (e.shiftKey || simBusy() || !g()) return;
    const k = key.length === 1 ? key.toLowerCase() : '';
    const go = h => { e.preventDefault(); if (location.hash !== h) location.hash = h; };
    if (k === 'n' || k === 'w' || k === 'm') {
      if (!onHub()) return;
      e.preventDefault();
      if (k === 'n') { if (!press(document.querySelector('#app .mt-play .sim-next')) && !press(document.getElementById('nextPhase'))) UI.toast('No game left for your team. Use SIM DAY or SIM TO...'); }
      else if (!press(hubButton({ days: k === 'w' ? 7 : 30 }))) UI.toast(UI.inOffseason && UI.inOffseason() ? 'It is the offseason. Press NEXT on the PLAY tile.' : 'That sim is not available right now.');
      return;
    }
    if (k === 'r' && g().userTeam) go('#/team/' + encodeURIComponent(g().userTeam));
    else if (k === 't' && P.trade) go('#/trade');
    else if (k === 'f' && P.fa) go('#/fa');
    else if (k === 's' && P.standings) go('#/standings');
  });

  UI.guide = { start, help, close: () => { finish(); closeHelp(); } };
})();
