// Free agency page (#/fa): re-sign your own players in the "resign" phase, then bid on free
// agents in "freeAgency". Uses window.FA, window.CBA and window.MOOD when they are loaded.
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI || !UI.feat) return;
  const P = UI.pages = UI.pages || {};
  const F = UI.feat;
  const esc = UI.esc;

  const POS = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C'];
  const PAGE = 40;
  const view = { pos: 'ALL', sort: 'ovr', shown: PAGE, open: null };
  const replies = {};   // playerId -> { accepted, message }

  // What the player asks of the user's team (FA.demand with a team gives "required").
  function demandOf(st, id) {
    const D = F.fn('FA', 'demand');
    if (!D) return null;
    const d = F.try('FA.demand', () => D.demand(st, id, st.userTeam), null);
    if (!d || typeof d !== 'object') return null;
    const amount = Number(d.required != null ? d.required : d.amount != null ? d.amount : d.salary) || 0;
    const years = Math.max(1, Math.min(5, Math.round(Number(d.years) || 1)));
    return { amount, years };
  }
  function moodOf(st, id) {
    const M = F.fn('MOOD', 'of');
    if (!M) return null;
    const m = F.try('MOOD.of', () => M.of(st, id), null);
    return m && typeof m.score === 'number' ? m : null;
  }

  // The user's own expiring players. FA.resignWindow moves them to "FA" with the team's rights,
  // so they are matched by id, not by team. Returns [{ p, info }].
  function expiring(st, yr) {
    const user = st.userTeam;
    const R = F.fn('FA', 'resignWindow');
    if (R) {
      const r = F.try('FA.resignWindow', () => R.resignWindow(st), null);
      const arr = Array.isArray(r) ? r : r && Array.isArray(r.players) ? r.players : null;
      if (arr) return arr.map(x => {
        const id = typeof x === 'string' ? x : x && (x.id || x.playerId);
        const p = id && st.players[id];
        return p && !p.retired && (p.team === user || p.team === 'FA') ? { p, info: typeof x === 'object' ? x : null } : null;
      }).filter(Boolean);
    }
    return F.teamPlayers(st, user).filter(p => { const end = F.contractEnd(p); return end != null && end < yr; }).map(p => ({ p, info: null }));
  }
  const rightsOf = (st, id) => (st.fa && st.fa.rights && st.fa.rights[id]) || null;
  const faDay = st => (st.fa && typeof st.fa.day === 'number' ? st.fa.day : st.faDay || 0);
  function freeAgents(st) {
    const L = F.fn('FA', 'freeAgents');
    if (L) { const r = F.try('FA.freeAgents', () => L.freeAgents(st), null); if (Array.isArray(r)) return r.filter(p => p && !p.retired); }
    return Object.keys(st.players).map(id => st.players[id]).filter(p => p && p.team === 'FA' && !p.retired);
  }

  function offerForm(st, p, d, yr) {
    const amt = d ? (d.amount / 1e6).toFixed(2) : '';
    const yrs = d ? d.years : 2;
    const r = F.rules(yr);
    const minS = r && typeof r.minSalary === 'function' ? F.try('minSalary', () => r.minSalary(p.yearsPro || 0), null) : null;
    return `<form class="ft-offer-form" data-id="${esc(p.id)}">
      <label class="field"><span>SALARY PER YEAR ($M)</span><input name="amount" type="number" inputmode="decimal" min="0.1" step="0.05" value="${esc(amt)}" required></label>
      <label class="field"><span>YEARS</span><select name="years">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${n === yrs ? 'selected' : ''}>${n} ${n === 1 ? 'year' : 'years'} (thru ${UI.fmtSeasonEnd(yr + n - 1)})</option>`).join('')}</select></label>
      <label class="field"><span>OPTION IN FINAL YEAR</span><select name="option">
        <option value="">None</option><option value="player">Player option</option><option value="team">Team option</option><option value="eto">Early termination</option></select></label>
      <div class="ft-form-btns"><button type="submit" class="btn btn-gold">SUBMIT OFFER</button><button type="button" class="btn" data-act="close">CANCEL</button></div>
      ${minS ? `<p class="ft-hint">League minimum for him: ${F.money(minS)}.${d ? ' He is asking for ' + F.money(d.amount) + ' a year for ' + d.years + (d.years === 1 ? ' year.' : ' years.') : ''}</p>` : d ? `<p class="ft-hint">He is asking for ${F.money(d.amount)} a year for ${d.years} ${d.years === 1 ? 'year' : 'years'}.</p>` : ''}
    </form>`;
  }

  function row(st, p, yr, opts) {
    const d = demandOf(st, p.id);
    const reply = replies[p.id];
    const mood = opts.mood ? moodOf(st, p.id) : null;
    const moodN = mood ? mood.score : opts.info && typeof opts.info.mood === 'number' ? opts.info.mood : null;
    const tags = [];
    if (opts.info) {
      if (opts.info.bird) tags.push('<span class="badge badge-gold">' + (opts.info.bird === 'full' ? 'BIRD RIGHTS' : esc(String(opts.info.bird).toUpperCase()) + ' BIRD') + '</span>');
      if (opts.info.rfa) tags.push('<span class="badge ft-badge">RFA</span>');
      if (opts.info.willing === false) tags.push('<span class="badge badge-inj">WANTS OUT</span>');
    }
    if (opts.rights) tags.push(`<span class="badge ft-badge" title="Only ${esc(opts.rights)} can sign him until the market opens">${esc(opts.rights)} RIGHTS</span>`);
    const meta = `${esc(p.pos || '')} | ${esc(p.age || '-')} YRS | ${UI.fmtHt(p.ht)}${opts.current ? ' | Was ' + F.money(F.salary(p, st.year)) : ''}${moodN != null ? ' | Mood ' + Math.round(moodN) : ''} ${UI.injuryBadge(p)} ${tags.join(' ')}`;
    return `<article class="ft-farow${view.open === p.id ? ' open' : ''}">
      <a class="ft-farow-top" href="#/player/${esc(p.id)}">${F.mini(p, { meta, pot: true })}</a>
      <div class="ft-ask"><small>ASKING</small><b>${d ? F.money(d.amount) : '-'}</b><span>${d ? d.years + (d.years === 1 ? ' YR' : ' YRS') : 'Unknown'}</span></div>
      <div class="ft-act">${view.open === p.id ? '' : `<button type="button" class="btn btn-small${opts.gold ? ' btn-gold' : ''}" data-act="open" data-id="${esc(p.id)}" ${opts.disabled ? 'disabled' : ''}>${opts.label || 'MAKE OFFER'}</button>`}</div>
      ${opts.info && opts.info.message && !reply ? `<div class="ft-reply"><b>AGENT</b> ${esc(opts.info.message)}</div>` : ''}
      ${reply ? `<div class="ft-reply ${reply.accepted ? 'ok' : 'bad'}"><b>${reply.accepted ? 'SIGNED' : 'NO DEAL'}</b> ${esc(reply.message || '')}</div>` : ''}
      ${view.open === p.id ? offerForm(st, p, d, yr) : ''}
    </article>`;
  }

  function render(app, st) {
    const user = st.userTeam;
    const yr = F.capYear(st);
    const phase = st.phase;
    const space = F.capSpace(st, user, yr);
    const payroll = F.payroll(st, user, yr);
    const r = F.rules(yr);
    const signedNext = F.teamPlayers(st, user).filter(p => F.salary(p, yr) > 0).length;
    const canOffer = !!F.fn('FA', 'offer');
    const canSim = !!F.fn('FA', 'simDay') && phase === 'freeAgency' && !(st.fa && st.fa.stage === 'done');

    const cap = `<div class="ft-capbar">
      <div class="ft-cap-team">${UI.logo(user, 52)}<div><div class="ft-k">${esc(F.phaseName(phase).toUpperCase())} | ${esc(UI.fmtSeasonEnd(yr))} CAP</div><div class="ft-t">${esc(UI.teamName(user))}</div></div></div>
      <div class="ft-stat"><small>CAP SPACE</small><b class="${space != null && space < 0 ? 'loss' : ''}">${space != null ? F.money(space) : '-'}</b></div>
      <div class="ft-stat"><small>PAYROLL</small><b>${F.money(payroll)}</b></div>
      <div class="ft-stat"><small>SALARY CAP</small><b>${r && r.cap ? F.money(r.cap) : '-'}</b></div>
      <div class="ft-stat"><small>UNDER CONTRACT</small><b>${signedNext}</b></div>
      ${phase === 'freeAgency' ? `<div class="ft-stat"><small>FA DAY</small><b>${faDay(st)}${st.fa && st.fa.length ? ' / ' + st.fa.length : ''}</b></div>` : ''}
      ${canSim ? '<button type="button" class="btn btn-gold ft-simday" data-act="simday">SIM ONE FA DAY</button>' : ''}
    </div>${space == null ? '<p class="ft-hint">Cap space appears once the CBA module (<code>js/cba.js</code>) is built.</p>' : ''}`;

    let resign = '';
    const mine = new Set();
    if (phase === 'resign') {
      const list = expiring(st, yr);
      list.forEach(x => mine.add(x.p.id));
      resign = `${UI.header('RE-SIGN YOUR PLAYERS', 'Contracts that end after ' + esc(UI.fmtSeasonEnd(st.year)) + '. Anyone you do not re-sign hits the open market.')}
        <div class="ft-falist">${list.length ? list.map(x => row(st, x.p, yr, { info: x.info, mood: true, current: true, gold: true, label: 'RE-SIGN', disabled: !canOffer })).join('') : '<p class="muted">No expiring contracts on your roster.</p>'}</div>`;
    }
    const marketShut = !!(st.fa && st.fa.stage === 'resign');
    let note = '';
    if (phase === 'resign' || marketShut) note = '<div class="note">The open market has not started: only a player\'s own team can sign him. ' + (phase === 'freeAgency' ? 'Sim one FA day to open it.' : 'It opens in the free agency phase.') + '</div>';
    if (st.fa && st.fa.stage === 'done') note = '<div class="note">Free agency is over for this offseason. Unsigned players can still be signed to fill your roster.</div>';

    let pool = freeAgents(st).filter(p => !mine.has(p.id));
    if (view.pos !== 'ALL') pool = pool.filter(p => String(p.pos || '').toUpperCase().split(/[-/ ]/).indexOf(view.pos) >= 0);
    const dcache = {};
    const ask = p => (dcache[p.id] !== undefined ? dcache[p.id] : (dcache[p.id] = demandOf(st, p.id)));
    const sorters = {
      ovr: (a, b) => (b.ovr || 0) - (a.ovr || 0) || (b.pot || 0) - (a.pot || 0),
      pot: (a, b) => (b.pot || 0) - (a.pot || 0) || (b.ovr || 0) - (a.ovr || 0),
      age: (a, b) => (a.age || 0) - (b.age || 0) || (b.ovr || 0) - (a.ovr || 0),
      ask: (a, b) => ((ask(b) || {}).amount || 0) - ((ask(a) || {}).amount || 0)
    };
    pool.sort(sorters[view.sort] || sorters.ovr);
    const shown = pool.slice(0, view.shown);

    const recent = (st.transactions || []).filter(t => t && t.type === 'sign' && t.year === st.year).slice(-6).reverse();

    app.innerHTML = `${UI.header('FREE AGENCY', phase === 'resign' ? 'Re-sign your own players first. Free agency opens in the next phase.' : 'Make offers. Players weigh money, years, winning and market, then decide.')}
      ${cap}
      ${note}
      ${resign}
      ${UI.header('FREE AGENTS', pool.length + ' available' + (view.pos !== 'ALL' ? ' at ' + view.pos : ''))}
      <div class="ft-filters">
        <nav class="tabs">${POS.map(x => `<a href="#/fa" data-act="pos" data-pos="${x}" class="${view.pos === x ? 'on' : ''}">${x}</a>`).join('')}</nav>
        <label class="field ft-sort"><span>SORT BY</span><select data-act="sort">
          ${[['ovr', 'Overall'], ['pot', 'Potential'], ['age', 'Youngest'], ['ask', 'Asking salary']].map(([k, l]) => `<option value="${k}" ${view.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="ft-falist">${shown.length ? shown.map(p => {
        const r = rightsOf(st, p.id);
        const held = r && r.team && r.team !== user ? r.team : null;
        return row(st, p, yr, { rights: held, disabled: !canOffer || (held && (phase === 'resign' || marketShut)) });
      }).join('') : '<p class="muted">No free agents at this position.</p>'}</div>
      ${pool.length > shown.length ? `<div class="row-btns center"><button type="button" class="btn" data-act="more">SHOW MORE (${pool.length - shown.length} LEFT)</button></div>` : ''}
      ${recent.length ? `${UI.header('LATEST SIGNINGS')}<ul class="ft-news">${recent.map(t => `<li>${esc(t.text || '')}</li>`).join('')}</ul>` : ''}`;

    app.onclick = async ev => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled || b.tagName === 'SELECT') return;
      const act = b.getAttribute('data-act');
      if (act === 'pos') { ev.preventDefault(); view.pos = b.getAttribute('data-pos'); view.shown = PAGE; render(app, st); }
      else if (act === 'more') { view.shown += PAGE; render(app, st); }
      else if (act === 'open') { view.open = b.getAttribute('data-id'); render(app, st); const f = app.querySelector('.ft-offer-form input'); if (f) f.focus(); }
      else if (act === 'close') { view.open = null; render(app, st); }
      else if (act === 'simday') {
        const S = F.fn('FA', 'simDay');
        if (!S) return;
        const before = freeAgents(st).length;
        let out = null;
        try { out = S.simDay(st, F.rng(st)); } catch (e) { console.warn('FA.simDay', e); UI.toast('The free agency day failed: ' + (e && e.message ? e.message : e), 'error'); }
        if (!st.fa) st.faDay = (st.faDay || 0) + 1;
        else st.faDay = st.fa.day;
        const signed = out && Array.isArray(out.signings) ? out.signings.length : Math.max(0, before - freeAgents(st).length);
        await F.save();
        UI.toast((out && out.done ? 'Free agency is over. ' : 'FA day ' + faDay(st) + ' done. ') + (signed > 0 ? signed + ' signing' + (signed > 1 ? 's' : '') + ' around the league.' : 'No signings.'));
        render(app, st);
      }
    };
    app.onchange = ev => {
      const s = ev.target.closest('[data-act="sort"]');
      if (s) { view.sort = s.value; render(app, st); }
    };
    app.onsubmit = async ev => {
      const form = ev.target.closest('.ft-offer-form');
      if (!form) return;
      ev.preventDefault();
      const O = F.fn('FA', 'offer');
      if (!O) return;
      const id = form.getAttribute('data-id');
      const amount = Math.round(Number(form.amount.value) * 1e6);
      const years = Math.max(1, Math.min(5, Number(form.years.value) || 1));
      if (!(amount > 0)) { UI.toast('Enter a salary per year.', 'error'); return; }
      const salaries = [];
      for (let i = 0; i < years; i++) salaries.push({ year: yr + i, amount });
      const option = form.option.value ? { year: yr + years - 1, type: form.option.value } : null;
      let res;
      try { res = O.offer(st, user, id, { salaries, option }) || {}; } catch (e) { console.warn('FA.offer', e); res = { accepted: false, message: 'The offer could not be made: ' + (e && e.message ? e.message : e) }; }
      const p = st.players[id];
      replies[id] = { accepted: !!res.accepted, message: res.message || (res.accepted ? 'He signed.' : 'He turned it down.') };
      if (!res.accepted && res.required) replies[id].message += ' He wants about ' + F.money(res.required) + ' a year.';
      if (res.accepted) {
        view.open = null;
        await F.save();
        UI.toast((p ? p.name : 'The player') + ' signed with the ' + UI.team(user).name + '. Saved.');
        render(app, st);
        if (p && p.team !== 'FA') {
          // he is off the list now, so show the answer at the top
          const top = app.querySelector('.ft-capbar');
          if (top) top.insertAdjacentHTML('afterend', `<div class="ft-reply ok"><b>SIGNED</b> ${esc(p.name)}: ${esc(replies[id].message)}</div>`);
        }
      } else {
        render(app, st);
      }
    };
  }

  P.fa = function (app) {
    app.onclick = null; app.onchange = null; app.onsubmit = null;
    const st = F.state();
    if (!st) { app.innerHTML = F.noLeague(); return; }
    if (!F.mod('FA')) { app.innerHTML = UI.header('FREE AGENCY') + F.building('Free agency', 'js/freeagency.js'); return; }
    if (st.phase !== 'resign' && st.phase !== 'freeAgency') {
      const early = ['preseason', 'regular', 'playoffs', 'draftLottery', 'draft'].indexOf(st.phase) >= 0;
      app.innerHTML = UI.header('FREE AGENCY') + UI.empty('FREE AGENCY IS CLOSED',
        'It is the ' + esc(F.phaseName(st.phase).toLowerCase()) + ' phase. ' + (early
          ? 'Re-signing opens after the draft, and free agency right after it.'
          : 'Free agency is over for this offseason. It opens again after next season\'s draft.'),
        '<div class="row-btns"><a class="btn" href="#/season">SEASON</a><a class="btn" href="#/draft">DRAFT</a><a class="btn" href="#/trade">TRADES</a></div>');
      return;
    }
    render(app, st);
  };
})();
