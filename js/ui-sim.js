// Simulation controls on top of window.LEAGUE: the sim runner with a progress overlay,
// the decisions modal for state.events, and offseason phase names.
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
    return g && Array.isArray(g.events) ? g.events.filter(e => e && !e.resolved).length : 0;
  };
  UI.currentDate = () => (UI.state.game && UI.state.L && UI.state.L.currentDate ? UI.state.L.currentDate(UI.state.game) : null);

  // Save after any change made by another page (trades, signings, draft picks).
  UI.saveNow = async function () { UI.bump(); const ok = await UI.saves.write(); UI.updateChrome(); return ok; };

  const pause = ms => new Promise(res => setTimeout(res, ms || 0));

  // how: { days: n } | "tradeDeadline" | "allStar" | "endRegular" | "endPlayoffs" | "nextPhase"
  UI.sim = async function (how) {
    const st = UI.state, L = st.L, g = st.game;
    if (UI.simming || !g || !L) return;
    if (UI.pendingEvents()) { UI.showEvents(); return; }
    UI.simming = true;
    const overlay = document.getElementById('simOverlay');
    const fill = document.getElementById('simBarFill');
    const text = document.getElementById('simText');
    const title = overlay.querySelector('.sim-title');
    title.textContent = 'SIMULATING';
    overlay.hidden = false;
    fill.style.width = '0%';
    const seasonEndedBefore = UI.inOffseason();
    const say = () => {
      const d = UI.currentDate();
      text.textContent = (d ? UI.dateLabel(d) : 'Day ' + (UI.currentDay() + 1)) + ' | ' + (UI.PHASES[g.season.phase] || g.season.phase || '');
    };
    let result = null;
    try {
      if (how === 'nextPhase' || UI.inOffseason()) {
        title.textContent = 'OFFSEASON';
        text.textContent = (UI.PHASES[g.phase] || g.phase) + '...';
        await pause(40);
        result = L.advance(g, 'nextPhase');
        UI.bump();
      } else if (how === 'tradeDeadline' || how === 'allStar') {
        say();
        text.textContent += ' | to the ' + (how === 'allStar' ? 'All-Star break' : 'trade deadline');
        fill.style.width = '50%';
        await pause(40);
        result = L.advance(g, how);
        UI.bump();
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
    const seasonJustEnded = !seasonEndedBefore && UI.inOffseason();
    if (seasonJustEnded && how === 'endPlayoffs' && location.hash !== '#/playoffs') location.hash = '#/playoffs';
    else UI.route();
    if (UI.pendingEvents()) UI.showEvents();
    return result;
  };

  // ---------- decisions modal ----------
  const TYPE_TITLES = { injury: 'INJURY REPORT', tradeOffer: 'TRADE OFFER', contractDecision: 'CONTRACT DECISION', complaint: 'PLAYER COMPLAINT' };
  const DEFAULT_OPTIONS = {
    injury: [['ok', 'OK']],
    tradeOffer: [['accept', 'Accept trade'], ['decline', 'Decline']],
    contractDecision: [['accept', 'Accept'], ['decline', 'Decline']],
    complaint: [['ok', 'Understood']]
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
    return `<li><span class="ev-hs">${UI.headshot(p)}</span><span class="ev-pn"><a href="#/player/${esc(p.id)}">${esc(p.name)}</a><small>${esc(p.pos)} | ${esc(p.age)} yrs | ${UI.fmtMoney(UI.salaryOf(p))}</small></span><b class="${UI.ovrClass(p.ovr)}">${esc(p.ovr)}</b></li>`;
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

  UI.showEvents = function () {
    const g = UI.state.game;
    const modal = document.getElementById('eventModal');
    const open = g && Array.isArray(g.events) ? g.events.map((e, i) => ({ e, i })).filter(x => x.e && !x.e.resolved) : [];
    if (!open.length) { modal.hidden = true; return; }
    const { e, i } = open[0];
    const text = e.text || e.message || e.headline || (e.offer && e.offer.message) || '';
    let body = text ? `<p class="ev-text">${esc(text)}</p>` : '';
    if (e.type === 'tradeOffer') body += tradeHtml(e.offer);
    const ids = [].concat(e.playerId || [], e.ids || [], e.players || []).filter(x => typeof x === 'string');
    if (ids.length && e.type !== 'tradeOffer') body += `<ul class="ev-list">${ids.map(playerChip).join('')}</ul>`;
    const opts = optionsFor(e);
    modal.innerHTML = `<div class="ev-box" role="dialog" aria-modal="true" aria-labelledby="evTitle">
      <div class="ev-head"><span id="evTitle">${esc(TYPE_TITLES[e.type] || String(e.type || 'DECISION').toUpperCase())}</span><small>${open.length > 1 ? '1 OF ' + open.length : ''}</small>
        <button type="button" class="ev-close" data-close aria-label="Decide later">&times;</button></div>
      <div class="ev-body">${body || '<p class="ev-text">A decision is waiting.</p>'}</div>
      <div class="ev-actions">${opts.map(([v, label], k) => `<button type="button" class="btn ${k === 0 ? 'btn-gold' : ''}" data-answer="${esc(JSON.stringify(v))}">${esc(label)}</button>`).join('')}</div>
    </div>`;
    modal.hidden = false;
    modal.onclick = async ev => {
      if (ev.target === modal || ev.target.closest('[data-close]')) { modal.hidden = true; UI.route(); return; }
      if (ev.target.closest('a')) { modal.hidden = true; return; }
      const b = ev.target.closest('[data-answer]');
      if (!b) return;
      let answer;
      try { answer = JSON.parse(b.getAttribute('data-answer')); } catch (x) { answer = b.getAttribute('data-answer'); }
      try { UI.state.L.resolveEvent(g, i, answer); } catch (x) { console.warn('resolveEvent failed', x); UI.toast('Could not apply that decision: ' + x.message, 'error'); }
      UI.bump();
      if (!UI.pendingEvents()) {
        try { UI.state.L.clearResolved(g); } catch (x) { console.warn(x); }
        modal.hidden = true;
        await UI.saveNow();
        UI.route();
      } else UI.showEvents();
    };
    const first = modal.querySelector('[data-answer]');
    if (first) first.focus();
  };
  document.addEventListener('keydown', e => {
    const m = document.getElementById('eventModal');
    if (e.key === 'Escape' && m && !m.hidden) { m.hidden = true; UI.route(); }
  });
})();
