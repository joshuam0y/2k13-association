// Simulation controls on top of window.LEAGUE: the sim runner with a progress overlay, the
// "are you sure" questions before a sim passes a key moment, the decisions modal for state.events
// (one decision per popup, big buttons) and offseason phase names.
// A sim that stops for a decision carries on by itself once the decision is made.
(function () {
  'use strict';
  const UI = window.UI;
  const esc = UI.esc;

  UI.PHASES = {
    preseason: 'Preseason', regular: 'Regular Season', playoffs: 'Playoffs',
    draftLottery: 'Draft Lottery', draft: 'NBA Draft', resign: 'Re-Signing', freeAgency: 'Free Agency', training: 'Training Camp'
  };
  UI.OFFSEASON = () => (UI.state.L && UI.state.L.OFFSEASON) || ['draftLottery', 'draft', 'resign', 'freeAgency', 'training'];
  UI.inOffseason = () => !!UI.state.game && UI.OFFSEASON().includes(UI.state.game.phase);
  UI.pendingEvents = () => {
    const g = UI.state.game;
    return g && Array.isArray(g.events) ? g.events.filter(e => e && !e.resolved && !e.quiet).length : 0;
  };
  // GM Assistant toggles (state.settings.auto); a missing key is its default
  const AUTO_DEFAULTS = { rotation: true, roster: false, resign: true, draft: true, tradeOffers: true, injuryAlerts: true, confirmations: true };
  UI.autoOn = key => {
    if (typeof UI.autoSetting === 'function') { try { const v = UI.autoSetting(key); if (typeof v === 'boolean') return v; } catch (e) { /* defaults below */ } }
    const a = UI.state.game && UI.state.game.settings && UI.state.game.settings.auto;
    return a && typeof a[key] === 'boolean' ? a[key] : AUTO_DEFAULTS[key];
  };
  UI.currentDate = () => (UI.state.game && UI.state.L && UI.state.L.currentDate ? UI.state.L.currentDate(UI.state.game) : null);

  // Save after any change made by another page (trades, signings, draft picks).
  UI.saveNow = async function () { UI.bump(); const ok = await UI.saves.write(); UI.updateChrome(); return ok; };

  const pause = ms => new Promise(res => setTimeout(res, ms || 0));
  const money = n => (UI.fmtMoney ? UI.fmtMoney(n) : '$' + (n / 1e6).toFixed(1) + 'M');
  const yrs = n => n + (n === 1 ? ' year' : ' years');
  const posLabel = p => {
    try { if (window.POSITIONS && window.POSITIONS.label) return window.POSITIONS.label(p) || p.pos || ''; } catch (e) { /* plain pos */ }
    return p.pos || '';
  };

  // ---------- 2K style dialogs ----------
  // UI.confirm({ title, text, yes, no }) -> Promise<boolean>. Uses the decisions modal box.
  UI.confirm = function (o) {
    o = o || {};
    return UI.choose({ title: o.title || 'ARE YOU SURE?', text: o.text, html: o.html,
      buttons: [{ value: 'yes', label: o.yes || 'YES', gold: true }, { value: 'no', label: o.no || 'NO' }] }).then(r => !!r && r.value === 'yes');
  };
  // UI.choose({ title, text, html, buttons: [{ value, label, gold, note }], check }) -> Promise<{ value, checked } | null>.
  // Escape or a click outside answers null. check: label of an optional checkbox.
  UI.choose = function (o) {
    o = o || {};
    const modal = document.getElementById('eventModal');
    const btns = o.buttons || [];
    return new Promise(resolve => {
      modal.innerHTML = `<div class="ev-box ev-confirm" role="alertdialog" aria-modal="true" aria-labelledby="cfTitle" aria-describedby="cfText">
        <div class="ev-head"><span id="cfTitle">${esc(o.title || 'ARE YOU SURE?')}</span><small></small></div>
        <div class="ev-body"><p class="ev-text" id="cfText">${esc(o.text || '')}</p>${o.html || ''}
          ${o.check ? `<label class="ev-check"><input type="checkbox" data-cf-check> ${esc(o.check)}</label>` : ''}</div>
        <div class="ev-actions ev-stack">${btns.map((b, k) => `<button type="button" class="btn ev-big ${b.gold ? 'btn-gold' : ''}" data-cf="${k}">${esc(b.label)}${b.note ? `<small>${esc(b.note)}</small>` : ''}</button>`).join('')}</div>
      </div>`;
      modal.hidden = false;
      const done = v => { modal.hidden = true; modal.onclick = null; document.removeEventListener('keydown', key, true); resolve(v); };
      const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
      document.addEventListener('keydown', key, true);
      modal.onclick = ev => {
        if (ev.target === modal) { done(null); return; }
        const b = ev.target.closest('[data-cf]');
        if (!b) return;
        const c = modal.querySelector('[data-cf-check]');
        done({ value: btns[+b.getAttribute('data-cf')].value, checked: !!(c && c.checked) });
      };
      const first = modal.querySelector('.btn-gold') || modal.querySelector('[data-cf]');
      if (first) first.focus();
    });
  };

  // ---------- key moments ----------
  // In-season moments a sim can run past: the All-Star Break, the Trade Deadline, the end of the
  // regular season. idx = the day index the sim stops on (that day not played yet).
  function seasonMoments(g) {
    const s = g.season;
    if (!s || !Array.isArray(s.days) || !s.days.length) return [];
    const firstOn = iso => s.days.findIndex(d => d && !d.playoff && d.date && d.date >= iso);
    const out = [];
    const as = firstOn(g.year + '-02-17'), td = firstOn(g.year + '-02-21'), end = UI.regularDays();
    if (as > 0) out.push({ key: 'allStar', name: 'the All-Star Break', idx: as, how: 'allStar', season: true });
    if (td > 0) out.push({ key: 'tradeDeadline', name: 'the Trade Deadline', idx: td, how: 'tradeDeadline', season: true, note: 'No more trades after it this season.' });
    if (end > 0) out.push({ key: 'endRegular', name: 'the end of the regular season', idx: end, how: 'endRegular' });
    return out.sort((a, b) => a.idx - b.idx);
  }
  function targetDay(g, how, moments) {
    const cur = g.season.day || 0;
    if (how && typeof how === 'object') return cur + (how.days || 0);
    const m = moments.find(x => x.how === how);
    if (m) return m.idx;
    return Infinity;   // endPlayoffs, nextPhase
  }
  // Asks about the first key moment the sim would pass. -> { how } to run, or null to cancel.
  async function askMoment(g, how) {
    if (!g.season || UI.inOffseason() || !UI.autoOn('confirmations')) return { how };
    const cur = g.season.day || 0, ms = seasonMoments(g), target = targetDay(g, how, ms);
    const skip = (g.simAsk && g.simAsk.year === g.year && g.simAsk.skip) || {};
    const m = ms.find(x => x.idx > cur && x.idx < target && !skip[x.key]);
    if (!m) return { how };
    const name = m.name.replace(/^the /, '');
    const r = await UI.choose({
      title: 'SIM PAST ' + name.toUpperCase() + '?',
      text: 'Are you sure you want to simulate past ' + m.name + '?' + (m.note ? ' ' + m.note : ''),
      buttons: [{ value: 'stop', label: 'Stop at ' + name, gold: true }, { value: 'past', label: 'Sim past it' }, { value: 'cancel', label: 'Cancel' }],
      check: m.season ? "Don't ask again this season" : null
    });
    if (r && r.checked && m.season) g.simAsk = { year: g.year, skip: Object.assign({}, skip, { [m.key]: true }) };
    if (!r || r.value === 'cancel') return null;
    if (r.value === 'stop') return { how: m.how, stopAt: m };
    return { how };
  }

  // Offseason steps where the user has choices. -> { go, opts, nav }; opts.auto lets the AI act for him.
  async function confirmPhase(g) {
    const L = UI.state.L;
    if (!UI.autoOn('confirmations')) {
      // no "are you sure" questions: the GM Assistant settings decide
      if (g.phase === 'draft') return { go: true, opts: UI.autoOn('draft') ? { auto: true } : {} };
      if (g.phase === 'resign') return UI.autoOn('resign') ? { go: true, opts: { auto: true } } : { go: false, nav: '#/fa' };
      if (g.phase === 'freeAgency' && g.fa && !g.fa.simMode && window.FA && window.FA.setSimMode) window.FA.setSimMode(g, 'ask');
      return { go: true, opts: {} };
    }
    if (g.phase === 'draft') {
      const left = L && L.userPicksLeft ? L.userPicksLeft(g) : [];
      if (!left.length) return { go: true, opts: {} };
      const r = await UI.choose({
        title: 'SIM PAST DRAFT DAY?',
        text: 'Are you sure you want to simulate past Draft Day? The AI will pick for you.',
        html: `<p class="ev-text"><small>Your picks still to make: ${left.map(x => '#' + esc(x.overall)).join(', ')}</small></p>`,
        buttons: [{ value: 'stop', label: 'Stop at Draft Day', gold: true, note: 'The draft runs to your pick' }, { value: 'past', label: 'Sim past it' }, { value: 'cancel', label: 'Cancel' }]
      });
      if (!r || r.value === 'cancel') return { go: false };
      return { go: true, opts: r.value === 'past' ? { auto: true } : {} };
    }
    if (g.phase === 'resign') {
      let players = [];
      try {
        const w = window.FA && typeof window.FA.resignWindow === 'function' ? window.FA.resignWindow(g) : null;
        players = w && Array.isArray(w.players) ? w.players : [];
      } catch (e) { console.warn('resignWindow', e); }
      if (!players.length) return { go: true, opts: {} };
      const r = await UI.choose({
        title: 'SIM PAST RE-SIGNING?',
        text: 'Are you sure you want to simulate past Re-Signing? The AI will re-sign the players worth keeping.',
        html: `<p class="ev-text"><small>Still unsigned: ${players.slice(0, 8).map(x => esc(x.name)).join(', ')}${players.length > 8 ? ' and ' + (players.length - 8) + ' more' : ''}</small></p>`,
        buttons: [{ value: 'stop', label: 'Stop at Re-Signing', gold: true, note: 'Re-sign them yourself' }, { value: 'past', label: 'Sim past it' }, { value: 'cancel', label: 'Cancel' }]
      });
      if (!r || r.value === 'cancel') return { go: false };
      if (r.value === 'stop') return { go: false, nav: '#/fa' };
      return { go: true, opts: { auto: true } };
    }
    if (g.phase === 'freeAgency' && g.fa && g.fa.stage !== 'done' && !g.fa.simMode) {
      const r = await UI.choose({
        title: 'SIM PAST FREE AGENCY?',
        text: 'Are you sure you want to simulate past Free Agency?',
        buttons: [{ value: 'stop', label: 'Stop at Free Agency', gold: true, note: 'Make your own offers' },
          { value: 'ask', label: 'Sim and ask me', note: 'Stops for good free agents and roster spots' },
          { value: 'past', label: 'Sim past it', note: 'The AI makes every move, you get a summary' },
          { value: 'cancel', label: 'Cancel' }]
      });
      if (!r || r.value === 'cancel') return { go: false };
      if (r.value === 'stop') return { go: false, nav: '#/fa' };
      if (window.FA && window.FA.setSimMode) window.FA.setSimMode(g, r.value === 'past' ? 'auto' : 'ask');
      return { go: true, opts: r.value === 'past' ? { auto: true } : {} };
    }
    return { go: true, opts: {} };
  }

  // A sim the user stopped or cancelled holds for a moment, so a button that sims in a loop
  // (SIM NEXT GAME) does not run straight past it.
  function hold(g) { UI._hold = { day: g.season ? g.season.day : null, phase: g.phase, t: Date.now() }; }
  function held(g) {
    const h = UI._hold;
    return !!h && Date.now() - h.t < 1500 && h.phase === g.phase && (g.season ? g.season.day : null) === h.day;
  }

  // how: { days: n } | "tradeDeadline" | "allStar" | "endRegular" | "endPlayoffs" | "nextPhase"
  // so.resume: carrying on after a decision (no questions again).
  UI.sim = async function (how, so) {
    so = so || {};
    const st = UI.state, L = st.L, g = st.game;
    if (UI.simming || !g || !L) return;
    if (!so.resume && held(g)) return { stopped: 'held' };
    if (UI.pendingEvents()) { UI.showEvents(); return; }
    let phaseOpts = {};
    const offseason = UI.inOffseason();
    if (!so.resume) {
      UI.simming = true;   // no second sim while the question is open
      let c;
      try {
        if (offseason) c = await confirmPhase(g);
        else { const m = await askMoment(g, how); c = m ? { go: true, opts: {}, how: m.how, stopAt: m.stopAt } : { go: false }; }
      } finally { UI.simming = false; }
      if (!c.go) {
        hold(g);
        if (c.nav && location.hash !== c.nav) location.hash = c.nav;
        return null;
      }
      phaseOpts = c.opts || {};
      if (c.how) how = c.how;
      if (c.stopAt) so.stopAt = c.stopAt;
    }
    UI._resume = null;
    const phaseBefore = g.phase;
    UI.simming = true;
    const overlay = document.getElementById('simOverlay');
    const fill = document.getElementById('simBarFill');
    const text = document.getElementById('simText');
    const title = overlay.querySelector('.sim-title');
    title.textContent = 'SIMULATING';
    overlay.hidden = false;
    fill.style.width = '0%';
    const say = () => {
      const d = UI.currentDate();
      text.textContent = (d ? UI.dateLabel(d) : 'Day ' + (UI.currentDay() + 1)) + ' | ' + (UI.PHASES[g.season.phase] || g.season.phase || '');
    };
    let result = null;
    try {
      if (offseason || how === 'nextPhase' && UI.inOffseason()) {
        title.textContent = 'OFFSEASON';
        text.textContent = (UI.PHASES[g.phase] || g.phase) + '...';
        await pause(40);
        result = L.advance(g, 'nextPhase', phaseOpts);
        UI.bump();
        if (result && result.stopped === 'event') UI._resume = { how: 'nextPhase' };
      } else if (how === 'tradeDeadline' || how === 'allStar') {
        say();
        text.textContent += ' | to the ' + (how === 'allStar' ? 'All-Star break' : 'trade deadline');
        fill.style.width = '50%';
        await pause(40);
        result = L.advance(g, how);
        UI.bump();
        if (result && result.stopped === 'event') UI._resume = { how };
      } else {
        const target = how && typeof how === 'object' ? how.days : Infinity;
        const regLeft = Math.max(1, UI.regularDays() - UI.currentDay());
        const total = isFinite(target) ? target : how === 'endRegular' ? regLeft : regLeft + 60;
        let n = 0;
        while (n < target && n < 420) {
          if (UI.pendingEvents()) break;
          if (UI.OFFSEASON().includes(g.phase)) break;
          if (how === 'endRegular' && g.season.phase !== 'regular') break;
          result = L.advance(g, { days: 1 });
          UI.bump();
          n++;
          fill.style.width = Math.min(100, Math.round(n / total * 100)) + '%';
          say();
          if (result && (result.stopped === 'event' || result.stopped === 'seasonOver' || result.stopped === 'limit')) break;
          await pause();
        }
        // stopped early by a decision: the rest of the sim runs once it is answered
        const reached = n >= target || UI.OFFSEASON().includes(g.phase) || (how === 'endRegular' && g.season.phase !== 'regular');
        if (UI.pendingEvents() && !reached && !(result && result.stopped === 'seasonOver')) UI._resume = { how: isFinite(target) ? { days: target - n } : how };
      }
    } catch (e) {
      console.warn('Sim failed', e);
      UI.toast('The sim stopped with an error: ' + (e && e.message ? e.message : e), 'error');
    }
    title.textContent = 'SAVING';
    await UI.saves.write();
    overlay.hidden = true;
    UI.simming = false;
    UI.updateChrome();
    const seasonJustEnded = !offseason && UI.inOffseason();
    // short notices (a player back from injury in an auto rotation): no stop needed
    if (Array.isArray(g.notices) && g.notices.length) {
      g.notices.slice(-3).forEach(x => UI.toast(x.text));
      g.notices = [];
    }
    if (so.stopAt && !UI.pendingEvents()) { hold(g); UI.toast('Stopped at ' + so.stopAt.name + '.'); }
    // Where the offseason takes the user next: the draft room after the lottery and on each of his
    // picks, the progression report once progression has run (before the new season starts).
    let go = null;
    if (result && result.stopped === 'userPick') { go = '#/draft'; UI.toast('You are on the clock with pick #' + result.pick + '.'); }
    else if (phaseBefore === 'draftLottery' && g.phase === 'draft' && UI.pages.draft) go = '#/draft';
    else if (phaseBefore === 'freeAgency' && g.phase === 'training' && UI.pages.progress && g.progressReport) go = '#/progress';
    else if (phaseBefore === 'training' && g.phase === 'regular') go = '#/season';
    if (go && location.hash !== go) location.hash = go;
    else if (seasonJustEnded && how === 'endPlayoffs' && location.hash !== '#/playoffs') location.hash = '#/playoffs';
    else UI.route();
    if (UI.pendingEvents()) UI.showEvents();
    return result;
  };

  // ---------- decisions modal ----------
  const TYPE_TITLES = { injury: 'INJURY REPORT', injuryReturn: 'BACK FROM INJURY', tradeOffer: 'TRADE OFFER', contractDecision: 'CONTRACT DECISION',
    complaint: 'PLAYER COMPLAINT', simSummary: 'WHILE YOU SIMMED' };
  const ROSTER_TITLES = { short: 'OPEN ROSTER SPOT', cut: 'TOO MANY PLAYERS', pitch: 'FREE AGENT' };
  const DEFAULT_OPTIONS = {
    injury: [['ok', 'OK']],
    tradeOffer: [['accept', 'Accept trade'], ['decline', 'Decline']],
    contractDecision: [['accept', 'Accept'], ['decline', 'Decline']],
    complaint: [['ok', 'Understood']],
    simSummary: [['ok', 'OK']]
  };
  function optionsFor(e) {
    const raw = e.options || e.choices || e.answers;
    if (Array.isArray(raw) && raw.length) {
      return raw.map(o => (o && typeof o === 'object') ? [o.value != null ? o.value : o.id, o.label || o.text || String(o.value)] : [o, String(o).replace(/^./, c => c.toUpperCase())]);
    }
    return DEFAULT_OPTIONS[e.type] || [['ok', 'OK']];
  }
  function playerChip(id) {
    const p = UI.player(id);
    if (!p) return `<li>${esc(id)}</li>`;
    return `<li><span class="ev-hs">${UI.headshot(p)}</span><span class="ev-pn"><a href="#/player/${esc(p.id)}">${esc(p.name)}</a><small>${esc(posLabel(p))} | ${esc(p.age)} yrs | ${UI.fmtMoney(UI.salaryOf(p))}</small></span><b class="${UI.ovrClass(p.ovr)}">${esc(p.ovr)}</b></li>`;
  }
  function pickText(pk) {
    if (!pk) return '';
    if (typeof pk === 'string') return pk;
    const prot = pk.protection && pk.protection.top ? ', top ' + pk.protection.top + ' protected' : '';
    return `${pk.year} ${pk.round === 1 ? '1st' : '2nd'} round pick${pk.original ? ' (' + esc(pk.original) + ')' : ''}${prot}`;
  }
  function tradeHtml(offer) {
    const t = (offer && (offer.trade || offer)) || {};
    const teams = Array.isArray(t.teams) ? t.teams : Object.keys(t.give || {});
    const sides = teams.map(abbr => {
      const give = (t.give && t.give[abbr]) || {};
      const players = (give.players || []).map(playerChip).join('');
      const picks = (give.picks || []).map(pk => `<li class="ev-pick">${pickText(pk)}</li>`).join('');
      return `<div class="ev-side"><div class="ev-side-h">${UI.logo(abbr, 28)}<span>${esc(UI.teamName(abbr).toUpperCase())} SEND</span></div><ul class="ev-list">${players}${picks || ''}${!players && !picks ? '<li class="muted">Nothing</li>' : ''}</ul></div>`;
    }).join('');
    return `<div class="ev-trade">${sides}</div>`;
  }
  const ans = v => esc(JSON.stringify(v));
  // A free agent card for the roster popups: OVR, age, position, asking salary and years (never potential).
  function signCard(s, withButton) {
    const p = UI.player(s.id) || s;
    const fit = s.fit ? `<span class="fa-fitb fit-${esc(s.fitKey || 'good')}">${esc(String(s.fit).toUpperCase())}${s.fitPos ? ' <small>' + esc(s.fitPos) + '</small>' : ''}</span>` : '';
    return `<li class="ev-card"><span class="ev-hs">${UI.headshot(p)}</span>
      <span class="ev-pn"><a href="#/player/${esc(s.id)}">${esc(s.name)}</a><small>${esc(posLabel(p))} | ${esc(s.age)} yrs ${fit}</small>
        <small class="ev-ask">Asks ${esc(money(s.amount))} a year for ${esc(yrs(s.years))}</small></span>
      <b class="${UI.ovrClass(s.ovr)}">${esc(s.ovr)}</b>
      ${withButton ? `<button type="button" class="btn btn-gold ev-sign" data-answer="${ans({ sign: s.id })}">SIGN</button>` : ''}</li>`;
  }
  function rosterBody(e) {
    if (e.kind === 'short') {
      const pre = e.preselect || [];
      const rows = (e.suggestions || []).map(s => `<li class="ev-card ev-cut"><label><input type="checkbox" data-pick="${esc(s.id)}" ${pre.indexOf(s.id) >= 0 ? 'checked' : ''}>
        ${signCard(s, false).replace(/^<li class="ev-card">|<\/li>$/g, '')}</label></li>`).join('');
      return { body: `<p class="ev-text">${esc(e.text)}</p>${rows ? `<p class="ev-sub">Best fits you can afford are checked.</p><ul class="ev-list">${rows}</ul><p class="ev-total" data-sign-total></p>` : ''}`,
        actions: `${rows ? `<button type="button" class="btn btn-gold ev-big" data-sign-go>SIGN CHECKED</button>` : ''}<button type="button" class="btn ev-big" data-answer="${ans('choose')}">CHOOSE MYSELF</button><button type="button" class="btn ev-big${rows ? '' : ' btn-gold'}" data-answer="${ans('ai')}">LET THE AI FILL IT</button>` };
    }
    if (e.kind === 'cut') {
      const pre = e.preselect || [];
      const rows = (e.suggestions || []).map(x => `<li class="ev-card ev-cut"><label><input type="checkbox" data-waive="${esc(x.id)}" ${pre.indexOf(x.id) >= 0 ? 'checked' : ''}>
        <span class="ev-pn"><b class="ev-nm">${esc(x.name)}</b><small>${esc(x.pos)} | ${esc(x.age)} yrs | ${x.salary ? esc(money(x.salary)) + (x.years > 1 ? ', ' + x.years + ' years left' : '') : 'minimum'}</small></span>
        <b class="${UI.ovrClass(x.ovr)}">${esc(x.ovr)}</b></label></li>`).join('');
      return { body: `<p class="ev-text">${esc(e.text)}</p><p class="ev-sub">Your lowest players are checked. Waived players are still paid.</p><ul class="ev-list">${rows}</ul>`,
        actions: `<button type="button" class="btn btn-gold ev-big" data-waive-go>WAIVE ${pre.length} ${pre.length === 1 ? 'PLAYER' : 'PLAYERS'}</button><button type="button" class="btn ev-big" data-answer="${ans('choose')}">CHOOSE MYSELF</button><button type="button" class="btn ev-big" data-answer="${ans('ai')}">LET THE AI PICK</button>` };
    }
    if (e.kind === 'pitch') {
      const o = e.offer || {};
      return { body: `<p class="ev-text">${esc(e.text)}</p><ul class="ev-list">${signCard(o, false)}</ul>`,
        actions: `<button type="button" class="btn btn-gold ev-big" data-answer="${ans({ sign: o.id })}">SIGN HIM<small>${esc(money(o.amount))} a year, ${esc(yrs(o.years))}</small></button><button type="button" class="btn ev-big" data-answer="${ans('negotiate')}">NEGOTIATE MYSELF</button><button type="button" class="btn ev-big" data-answer="${ans('pass')}">NO THANKS</button>` };
    }
    return null;
  }

  // opts.then: called once every decision is made (unless one opened another page).
  UI.showEvents = function (opts) {
    if (opts && typeof opts.then === 'function') UI._then = opts.then;
    const g = UI.state.game;
    const modal = document.getElementById('eventModal');
    const open = g && Array.isArray(g.events) ? g.events.map((e, i) => ({ e, i })).filter(x => x.e && !x.e.resolved && !x.e.quiet) : [];
    if (!open.length) { modal.hidden = true; return; }
    const { e, i } = open[0];
    const text = e.text || e.message || e.headline || (e.offer && e.offer.message) || '';
    let body = '', actions = '';
    const custom = e.type === 'roster' ? rosterBody(e) : null;
    if (custom) { body = custom.body; actions = custom.actions; }
    else if (e.type === 'simSummary') {
      body = `<p class="ev-text">${esc(text)}</p><ul class="ev-sum">${(e.items || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    } else {
      body = text ? `<p class="ev-text">${esc(text)}</p>` : '';
      if (e.type === 'tradeOffer') body += tradeHtml(e.offer);
      const ids = [].concat(e.playerId || [], e.ids || [], e.players || []).filter(x => typeof x === 'string');
      if (ids.length && e.type !== 'tradeOffer') body += `<ul class="ev-list">${ids.map(playerChip).join('')}</ul>`;
    }
    if (!actions) actions = optionsFor(e).map(([v, label], k) => `<button type="button" class="btn ev-big ${k === 0 ? 'btn-gold' : ''}" data-answer="${ans(v)}">${esc(label)}</button>`).join('');
    const title = e.type === 'roster' ? ROSTER_TITLES[e.kind] || 'ROSTER' : TYPE_TITLES[e.type] || String(e.type || 'DECISION').toUpperCase();
    modal.innerHTML = `<div class="ev-box ev-${esc(e.type)}" role="dialog" aria-modal="true" aria-labelledby="evTitle">
      <div class="ev-head"><span id="evTitle">${esc(title)}</span><small>${open.length > 1 ? '1 OF ' + open.length : ''}</small>
        <button type="button" class="ev-close" data-close aria-label="Decide later">&times;</button></div>
      <div class="ev-body">${body || '<p class="ev-text">A decision is waiting.</p>'}</div>
      <div class="ev-actions ev-stack">${actions}</div>
    </div>`;
    modal.hidden = false;
    const waiveBtn = modal.querySelector('[data-waive-go]');
    const checked = () => Array.from(modal.querySelectorAll('[data-waive]')).filter(c => c.checked).map(c => c.getAttribute('data-waive'));
    // short roster: the checked players' total salary, checked against the cap and exceptions as a group
    const signBtn = modal.querySelector('[data-sign-go]');
    const picks = () => Array.from(modal.querySelectorAll('[data-pick]')).filter(c => c.checked).map(c => c.getAttribute('data-pick'));
    const sumUp = () => {
      const box = modal.querySelector('[data-sign-total]');
      if (!signBtn || !box) return;
      const ids = picks();
      let chk = null;
      try { chk = window.FA && window.FA.checkGroup ? window.FA.checkGroup(g, g.userTeam, ids, e.suggestions || []) : null; } catch (x) { console.warn('checkGroup', x); }
      const total = (e.suggestions || []).filter(s => ids.indexOf(s.id) >= 0).reduce((a, s) => a + s.amount, 0);
      const miss = chk ? chk.misses.map(id => ((e.suggestions || []).find(s => s.id === id) || {}).name).filter(Boolean) : [];
      const after = e.count + ids.length;
      box.className = 'ev-total' + (miss.length ? ' bad' : '');
      box.innerHTML = `<b>${esc(money(total))}</b> a year for ${ids.length} ${ids.length === 1 ? 'player' : 'players'}. Roster ${after} of ${e.min}${chk ? ' | Payroll after ' + esc(money(chk.payroll)) + ' (cap ' + esc(money(chk.cap)) + ')' : ''}.`
        + (miss.length ? ` <span>Does not fit the cap rules together: ${esc(miss.join(', '))}.</span>` : after < e.min ? ' <span>Still short: sim again and you will be asked for the rest.</span>' : '');
      signBtn.textContent = 'SIGN ' + ids.length + ' CHECKED';
      signBtn.disabled = !ids.length || miss.length > 0;
    };
    sumUp();
    modal.onchange = () => {
      sumUp();
      if (!waiveBtn) return;
      const n = checked().length;
      waiveBtn.textContent = 'WAIVE ' + n + (n === 1 ? ' PLAYER' : ' PLAYERS');
      waiveBtn.disabled = !n;
    };
    modal.onclick = async ev => {
      if (ev.target === modal || ev.target.closest('[data-close]')) { closeLater(modal); return; }
      if (ev.target.closest('a')) { modal.hidden = true; UI._resume = null; UI._then = null; return; }
      if (ev.target.closest('label') && !ev.target.closest('button')) return;
      let answer;
      if (ev.target.closest('[data-waive-go]')) answer = { waive: checked() };
      else if (ev.target.closest('[data-sign-go]')) answer = { sign: picks() };
      else {
        const b = ev.target.closest('[data-answer]');
        if (!b) return;
        try { answer = JSON.parse(b.getAttribute('data-answer')); } catch (x) { answer = b.getAttribute('data-answer'); }
      }
      try { UI.state.L.resolveEvent(g, i, answer); } catch (x) { console.warn('resolveEvent failed', x); UI.toast('Could not apply that decision: ' + x.message, 'error'); }
      const r = e.result;
      if (r && r.message && !(e.type === 'contractDecision' && answer === 'accept')) UI.toast(r.message, r.ok === false ? 'error' : '');
      const nav = (r && r.navigate) || e.navigate || null;
      if (nav) UI._nav = nav;
      UI.bump();
      if (!UI.pendingEvents()) {
        try { UI.state.L.clearResolved(g); } catch (x) { console.warn(x); }
        modal.hidden = true;
        await UI.saveNow();
        afterDecisions();
      } else UI.showEvents();
    };
    const first = modal.querySelector('.btn-gold') || modal.querySelector('[data-answer]');
    if (first) first.focus();
  };
  // All decisions made: open the page one of them asked for, or carry on with the sim.
  function afterDecisions() {
    const nav = UI._nav, resume = UI._resume, then = UI._then;
    UI._nav = null; UI._resume = null; UI._then = null;
    if (nav) { if (location.hash !== nav) location.hash = nav; else UI.route(); return; }
    UI.route();
    if (resume) setTimeout(() => UI.sim(resume.how, { resume: true }), 30);
    else if (then) setTimeout(then, 30);
  }
  function closeLater(modal) {
    modal.hidden = true; UI._resume = null; UI._then = null; UI._nav = null;
    UI.route();
  }
  document.addEventListener('keydown', e => {
    const m = document.getElementById('eventModal');
    if (e.key === 'Escape' && m && !m.hidden && !m.querySelector('.ev-confirm')) closeLater(m);
  });
})();
