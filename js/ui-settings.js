/* GM settings page (#/settings): GM Assistant toggles, Watch Live speed and difficulty.

   Stored in the league state, so they are saved with the game:

   state.settings.auto = {
     rotation:      true,   // Auto rotation: the coach sets the best lineup every game.
                            // Kept in sync with the real rotation: true means team.rotation is empty (auto).
     roster:        false,  // The AI fills or trims my roster to the legal size without asking.
     resign:        true,   // When I sim past re-signing, the AI handles my re-signings.
     draft:         true,   // When I sim past the draft, the AI makes my picks.
     tradeOffers:   true,   // Show me trade offers from AI teams.
     injuryAlerts:  true,   // Stop the sim when one of my players gets hurt or comes back.
     confirmations: true    // Ask before a sim passes a key date (deadline, draft, free agency).
   }
   state.settings.liveSpeed = 1 | 4 | 16   // starting speed for Watch Live (1 by default)
   state.settings.difficulty = "normal"    // shown only, fixed

   Read them with UI.autoSettings() (fills in missing keys with the defaults above and returns the
   object) or UI.autoSetting(key) (one boolean). UI.AUTO_DEFAULTS holds the defaults.
   Works without the UI too: window.AUTO_SETTINGS.get(state) does the same on any league state. */
(function () {
  'use strict';
  const DEFAULTS = { rotation: true, roster: false, resign: true, draft: true, tradeOffers: true, injuryAlerts: true, confirmations: true };
  const SPEEDS = [1, 4, 16];

  // Makes sure state.settings.auto exists with every key; returns it.
  function ensure(state) {
    if (!state || typeof state !== 'object') return Object.assign({}, DEFAULTS);
    if (!state.settings || typeof state.settings !== 'object') state.settings = { difficulty: 'normal' };
    const a = state.settings.auto && typeof state.settings.auto === 'object' ? state.settings.auto : (state.settings.auto = {});
    Object.keys(DEFAULTS).forEach(k => { if (typeof a[k] !== 'boolean') a[k] = DEFAULTS[k]; });
    return a;
  }
  const api = { DEFAULTS, get: ensure, is: (state, key) => { const a = ensure(state); return key in a ? !!a[key] : !!DEFAULTS[key]; } };
  if (typeof window !== 'undefined') window.AUTO_SETTINGS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  const UI = typeof window !== 'undefined' ? window.UI : null;
  if (!UI) return;
  const P = UI.pages = UI.pages || {};
  const esc = UI.esc;

  UI.AUTO_DEFAULTS = DEFAULTS;
  UI.autoSettings = () => (UI.state.game ? ensure(UI.state.game) : Object.assign({}, DEFAULTS));
  UI.autoSetting = key => (UI.state.game ? api.is(UI.state.game, key) : !!DEFAULTS[key]);
  UI.liveSpeedPref = () => {
    const g = UI.state.game;
    const v = g && g.settings ? Number(g.settings.liveSpeed) : 1;
    return SPEEDS.includes(v) ? v : 1;
  };

  // The real rotation decides the rotation toggle, so this page and the Rotation page agree.
  function rotationIsAuto(g) {
    const t = g && g.teams && g.teams[g.userTeam];
    return !(t && Array.isArray(t.rotation) && t.rotation.length);
  }
  function setRotationAuto(g, on) {
    const fr = UI.fr;
    if (!fr || typeof fr.applyRotation !== 'function') return;
    if (on) fr.applyRotation(g, null);
    else if (rotationIsAuto(g) && typeof fr.rotation === 'function') {
      // Manual, starting from today's best lineup, so nothing changes until he edits it.
      const rot = fr.rotation(g);
      if (rot) fr.applyRotation(g, rot);
    }
  }

  const ROWS = [
    ['rotation', 'Auto rotation', 'The coach picks the best healthy lineup and minutes before every game.'],
    ['roster', 'Fix my roster for me', 'The AI signs or waives players to keep my roster at a legal size without asking me.'],
    ['resign', 'Re-sign for me when I sim past', 'If I sim past re-signing, the front office decides who to keep and at what price.'],
    ['draft', 'Draft for me when I sim past', 'If I sim past the draft, the AI makes my picks for me.'],
    ['tradeOffers', 'Trade offers', 'Other teams can send me trade offers to accept or turn down.'],
    ['injuryAlerts', 'Injury alerts', 'The sim stops when one of my players gets hurt or is ready to return.'],
    ['confirmations', 'Ask before key dates', 'I get asked before a sim passes the trade deadline, the draft or free agency.']
  ];

  P.settings = function (app) {
    const g = UI.state.game;
    if (!g) {
      app.innerHTML = UI.header('SETTINGS') + UI.empty('NO LEAGUE LOADED', 'Start or load a league to change its settings. Settings are saved with each league.',
        '<div class="row-btns"><a class="btn btn-gold" href="#/new">NEW LEAGUE</a><a class="btn" href="#/saves">LOAD</a></div>');
      return;
    }
    const a = ensure(g);
    a.rotation = rotationIsAuto(g);
    const speed = UI.liveSpeedPref();
    const diff = String((g.settings && g.settings.difficulty) || 'normal');
    const row = ([key, title, text]) => `<li class="gs-row">
        <span class="gs-t"><b id="gs-l-${key}">${esc(title)}</b><small>${esc(text)}</small></span>
        <button type="button" class="gs-sw${a[key] ? ' on' : ''}" role="switch" aria-checked="${a[key] ? 'true' : 'false'}" aria-labelledby="gs-l-${key}" data-key="${key}"><i></i><span>${a[key] ? 'ON' : 'OFF'}</span></button>
      </li>`;
    app.innerHTML = `${UI.header('SETTINGS', 'Saved with this league.')}
      <section class="gs-card">
        <div class="gs-k">GM ASSISTANT</div>
        <p class="gs-intro">Choose what the front office handles for you.</p>
        <ul class="gs-list">${ROWS.map(row).join('')}</ul>
      </section>
      <section class="gs-card">
        <div class="gs-k">GAME</div>
        <ul class="gs-list">
          ${UI.pages.live ? `<li class="gs-row"><span class="gs-t"><b>Watch Live speed</b><small>The speed a live game starts at. You can still change it during the game.</small></span>
            <span class="gs-seg" role="radiogroup" aria-label="Watch Live speed">${SPEEDS.map(s => `<button type="button" role="radio" aria-checked="${s === speed}" class="${s === speed ? 'on' : ''}" data-speed="${s}">${s}X</button>`).join('')}</span></li>` : ''}
          <li class="gs-row"><span class="gs-t"><b>Difficulty</b><small>Every league plays on Normal, like a default 2K13 Association.</small></span><span class="gs-fixed">${esc(diff.toUpperCase())}</span></li>
          <li class="gs-row"><span class="gs-t"><b>First-time guide</b><small>Show the four step tour of the season hub again.</small></span><button type="button" class="btn btn-small" id="gsTour">SHOW TOUR</button></li>
        </ul>
      </section>`;

    app.querySelectorAll('.gs-sw').forEach(b => b.addEventListener('click', () => {
      const key = b.getAttribute('data-key');
      const on = !a[key];
      a[key] = on;
      if (key === 'rotation') { setRotationAuto(g, on); a.rotation = rotationIsAuto(g); }
      b.classList.toggle('on', a[key]);
      b.setAttribute('aria-checked', a[key] ? 'true' : 'false');
      b.querySelector('span').textContent = a[key] ? 'ON' : 'OFF';
      UI.saveNow();
      const title = (ROWS.find(r => r[0] === key) || [0, key])[1];
      UI.toast(title + (a[key] ? ' on.' : ' off.') + (key === 'rotation' && !a[key] ? ' Set your lineup on the Rotation page.' : ''));
    }));
    app.querySelectorAll('.gs-seg [data-speed]').forEach(b => b.addEventListener('click', () => {
      g.settings.liveSpeed = Number(b.getAttribute('data-speed'));
      app.querySelectorAll('.gs-seg [data-speed]').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
      UI.saveNow();
    }));
    const tour = UI.$('#gsTour', app);
    tour.addEventListener('click', () => { if (UI.guide) { location.hash = '#/season'; setTimeout(() => UI.guide.start(true), 60); } });
    if (!UI.guide) tour.disabled = true;
  };
  P.settings.navLabel = 'Settings';
  P.settings.navDesc = 'GM Assistant and game options';

  // Watch Live: each new live game starts at the chosen speed (its speed button is pressed once).
  // Coming back to a game already in progress keeps whatever speed it was on.
  const seen = typeof WeakSet === 'function' ? new WeakSet() : null;
  function applySpeed() {
    const ctl = document.getElementById('lvControls');
    const X = UI.extras && UI.extras.live;
    const cur = ctl && X && typeof X.current === 'function' ? X.current() : null;
    if (!cur || !seen || seen.has(cur)) return;
    seen.add(cur);
    const b = ctl.querySelector(`.lv-speed[data-speed="${UI.liveSpeedPref()}"]`);
    if (b && !b.classList.contains('on')) b.click();
  }
  function watch() {
    const app = document.getElementById('app');
    if (app && typeof MutationObserver === 'function') new MutationObserver(applySpeed).observe(app, { childList: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();
})();
