// Free agency page (#/fa). Everything about signing happens here, without the team tab:
// the cap panel (payroll, cap, cap room, tax line, roster spots, exceptions left), the re-sign
// screen in the "resign" phase, the free agent list with what you can afford, the offer panel
// with salary and years sliders, and the team salary table.
// Uses window.FA (js/freeagency.js) and window.CBA through UI.feat. Potential is never shown.
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI || !UI.feat) return;
  const P = UI.pages = UI.pages || {};
  const F = UI.feat;
  const esc = UI.esc;

  const POS = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C'];
  const PAGE = 40;
  const OPEN_PHASES = { preseason: 1, regular: 1, resign: 1, freeAgency: 1, training: 1 };
  const view = { tab: null, tabPhase: null, pos: 'ALL', sort: 'ovr', shown: PAGE, open: null, afford: false, q: '', cut: null, auto: null };
  const offers = {};    // playerId -> { amount, years, opt }
  const replies = {};   // playerId -> { accepted, message }
  let zone = null;      // the open offer panel's zone (FA.offerZone)

  const FAX = () => window.FA;

  // Contract decision popups (team options, qualifying offers, offer sheets) carry their own
  // buttons; the answer is applied through FA.applyDecision unless the league already does it.
  (function wireDecisions() {
    const L = window.LEAGUE;
    if (!L || typeof L.resolveEvent !== 'function' || L.resolveEvent.faWired || L.handlesContractDecisions) return;
    const orig = L.resolveEvent;
    const wrapped = function (state, index, answer) {
      const e = state && state.events ? state.events[index] : null;
      const out = orig.apply(this, arguments);
      if (e && e.type === 'contractDecision' && window.FA && typeof window.FA.applyDecision === 'function') {
        const r = F.try('FA.applyDecision', () => window.FA.applyDecision(state, e, answer), null);
        if (r && r.message && r.ok !== false && answer !== 'accept') UI.toast(r.message);
        else if (r && r.ok === false) UI.toast(r.message, 'error');
      }
      return out;
    };
    wrapped.faWired = true;
    L.resolveEvent = wrapped;
  })();
  const FAok = () => !!(F.fn('FA', 'offerZone') && F.fn('FA', 'capSummary') && F.fn('FA', 'market'));
  const money = n => F.money(n);
  const m2 = n => '$' + ((Number(n) || 0) / 1e6).toFixed(2) + 'M';
  const yrs = n => n + (n === 1 ? ' year' : ' years');
  const season = y => UI.fmtSeasonEnd(y);
  const zoneText = z => (z.atMin ? 'He will sign for the minimum.'
    : z.impossible ? 'No salary is enough at this length.'
      : 'He would likely sign for ' + m2(z.low) + ' to ' + m2(z.high) + ' a year (an estimate, not his exact number).');

  function phaseNote(st) {
    const ph = st.phase, fa = st.fa;
    if (ph === 'resign') return 'Re-signing window: only your own free agents can sign with you now. The open market starts when free agency opens.';
    if (ph === 'freeAgency' && fa && fa.stage === 'done') return 'Free agency is over. Unsigned players can still join you on the terms they accept.';
    if (ph === 'freeAgency') return 'The market is open. Stars sign in the first days, so move fast.';
    if (ph === 'playoffs' || ph === 'draftLottery' || ph === 'draft') return 'Signings are closed until the re-signing window opens after the draft. You can still browse and plan.';
    return 'Players still on the market sign for the rest of the season on terms they accept.';
  }

  // ---------- cap panel ----------
  function capPanel(st, cs) {
    const user = st.userTeam, fa = st.fa, ph = st.phase;
    const scale = Math.max(cs.tax * 1.12, cs.payroll * 1.04, cs.cap * 1.3);
    const pct = v => Math.max(0, Math.min(100, v / scale * 100)).toFixed(2);
    const over = cs.roster > cs.maxRoster;
    const btns = [];
    if (ph === 'resign') {
      btns.push('<button type="button" class="btn" data-act="auto">AUTO RE-SIGN</button>');
      btns.push('<button type="button" class="btn btn-gold" data-act="openfa">DONE: OPEN FREE AGENCY</button>');
    } else if (ph === 'freeAgency' && !(fa && fa.stage === 'done')) {
      btns.push('<button type="button" class="btn btn-gold" data-act="simday">SIM ONE FA DAY</button>');
      btns.push('<button type="button" class="btn" data-act="simall">SIM TO END OF FREE AGENCY</button>');
    } else if (ph === 'freeAgency') {
      btns.push('<button type="button" class="btn btn-gold" data-act="camp">GO TO TRAINING CAMP</button>');
    }
    const day = ph === 'freeAgency' && fa ? (fa.stage === 'resign' ? 'OPENING' : fa.stage === 'done' ? 'FINISHED' : 'DAY ' + fa.day + ' OF ' + fa.length) : '';
    const ex = cs.exceptions.map(e => `<li class="fa-chip ${e.available ? 'on' : 'off'}" title="${esc(e.note)}">
        <b>${esc(e.label.toUpperCase())}</b><span>${e.key === 'min' ? m2(cs.minSalary) + ' to ' + m2(cs.maxMinSalary) : money(e.amount)}</span>
        <small>${e.available ? esc(e.note) : 'Not available: ' + esc(e.note.charAt(0).toLowerCase() + e.note.slice(1))}</small></li>`).join('');
    return `<section class="fa-cap" aria-label="Cap room">
      <div class="fa-cap-top">
        <div class="fa-cap-team">${UI.logo(user, 48)}<div><div class="ft-k">${esc(F.phaseName(ph).toUpperCase())}${day ? ' | ' + day : ''}</div>
          <div class="ft-t">${esc(UI.teamName(user))}</div><div class="fa-cap-yr">${esc(season(cs.year))} salaries</div></div></div>
        ${btns.length ? `<div class="fa-cap-btns">${btns.join('')}</div>` : ''}
      </div>
      <div class="fa-cap-stats">
        <div class="fa-big ${cs.room > 0 ? 'good' : 'none'}"><small>CAP ROOM</small><b>${money(cs.room)}</b>
          <span>${cs.room > 0 ? 'Sign anyone up to this' : 'Over the cap by ' + money(cs.payroll - cs.cap) + ': use exceptions'}</span></div>
        <div class="fa-stat"><small>PAYROLL</small><b>${money(cs.payroll)}</b></div>
        <div class="fa-stat"><small>SALARY CAP</small><b>${money(cs.cap)}</b></div>
        <div class="fa-stat ${cs.overTax ? 'bad' : ''}"><small>TAX LINE</small><b>${money(cs.tax)}</b>
          <span>${cs.overTax ? money(-cs.taxRoom) + ' over: paying tax' : money(cs.taxRoom) + ' below'}</span></div>
        <div class="fa-stat ${over ? 'bad' : ''}"><small>ROSTER</small><b>${cs.roster} / ${cs.maxRoster}</b>
          <span>${over ? (cs.roster - cs.maxRoster) + ' over 15: your lowest players are waived when free agency ends' : cs.openSpots + (cs.openSpots === 1 ? ' open spot' : ' open spots')}${cs.signLimit > cs.maxRoster && !over ? ' (up to ' + cs.signLimit + ' this summer)' : ''}${cs.twoWaySlots ? ' | two-way ' + cs.twoWay + '/' + cs.twoWaySlots : ''}</span></div>
      </div>
      <div class="fa-meter" role="img" aria-label="Payroll ${esc(money(cs.payroll))}, cap ${esc(money(cs.cap))}, tax ${esc(money(cs.tax))}">
        <div class="fa-meter-fill ${cs.overTax ? 'tax' : cs.overCap ? 'over' : ''}" style="width:${pct(cs.payroll)}%"></div>
        <i class="fa-mark" style="left:${pct(cs.cap)}%"><span>CAP</span></i>
        <i class="fa-mark tax" style="left:${pct(cs.tax)}%"><span>TAX</span></i>
      </div>
      <ul class="fa-chips">${ex}</ul>
    </section>`;
  }

  // ---------- offer panel ----------
  function offerState(id, z) {
    let o = offers[id];
    if (!o) {
      const start = Math.min(z.max, Math.max(z.min, z.atMin ? z.min : z.center));
      o = offers[id] = { amount: Math.round(start / 10000) * 10000, years: Math.min(z.yearsCap, z.wantYears), opt: '' };
    }
    o.years = Math.max(1, Math.min(z.yearsCap, o.years));
    o.amount = Math.max(z.min, Math.min(z.max, o.amount));
    return o;
  }
  function loadZone(st, id) {
    const o = offers[id];
    const opt = o && o.opt ? { type: o.opt } : null;
    zone = F.try('FA.offerZone', () => FAX().offerZone(st, st.userTeam, id, o ? o.years : null, opt), null);
    return zone;
  }
  function capNote(z, o) {
    const L = FAX().ROUTE_LABEL;
    if (z.locked) return { bad: true, text: z.locked + '.' };
    if (z.rosterFull) return { bad: true, text: 'Your roster is full (' + z.rosterLimit + '). Waive someone in the Team Salary tab first.' };
    const extra = z.roster >= 15 && !z.rosterFull ? ' Your roster goes to ' + (z.roster + 1) + ': get back to 15 before free agency ends.' : '';
    const minRt = z.routes.find(r => r.via === 'min');
    const fit = (minRt && o.amount <= minRt.max + 1 && o.years <= minRt.years ? minRt : null) || z.routes.find(r => o.amount <= r.max + 1 && o.years <= r.years);
    if (fit) return { bad: false, text: 'Fits: ' + L[fit.via] + (fit.via === 'space' ? ' (' + money(fit.max) + ' of room)' : fit.via === 'min' ? ' contract' : ' (up to ' + money(fit.max) + ', ' + yrs(fit.years) + ')') + '.' + extra };
    const shorter = z.routes.find(r => o.amount <= r.max + 1);
    if (shorter) return { bad: true, text: 'Too many years for the ' + L[shorter.via] + ': ' + yrs(shorter.years) + ' at most.' };
    const best = z.routes.reduce((a, r) => (!a || r.max > a.max ? r : a), null);
    return { bad: true, text: 'More than you can pay. The most you can offer is ' + money(best.max) + ' a year (' + L[best.via] + ', ' + yrs(best.years) + ').' };
  }
  function bandStyle(z) {
    const span = Math.max(1, z.max - z.min);
    const at = x => Math.max(0, Math.min(100, (x - z.min) / span * 100)).toFixed(2) + '%';
    if (z.impossible || z.unwilling) return 'background:var(--fa-no)';
    const L = at(z.low), C = at(z.center), H = at(z.high);
    return `background:linear-gradient(90deg,var(--fa-no) 0 ${L},var(--fa-close) ${L} ${C},var(--fa-likely) ${C} ${H},var(--fa-yes) ${H} 100%)`;
  }
  function offerPanel(st, p) {
    const z = loadZone(st, p.id);
    if (!z) return '<div class="fa-offer"><p class="muted">No offer can be made right now.</p></div>';
    const o = offerState(p.id, z);
    const span = Math.max(1, z.max - z.min);
    const limitPct = Math.max(0, Math.min(100, (Math.max(z.limit, z.min) - z.min) / span * 100));
    const v = FAX().verdict(z, o.amount), cn = capNote(z, o);
    const disabled = !!(z.locked || z.rosterFull);
    const subOff = disabled || cn.bad;
    const rights = z.own ? ' | You hold his ' + (z.bird === 'full' ? 'full' : z.bird === 'early' ? 'early' : 'non') + ' Bird rights' : '';
    return `<div class="fa-offer" data-id="${esc(p.id)}">
      <div class="fa-offer-head"><b>OFFER TO ${esc(p.name.toUpperCase())}</b><span>His agent asks ${money(z.ask)} a year for ${yrs(z.wantYears)}${rights}</span></div>
      <div class="fa-sl">
        <div class="fa-sl-label"><span>SALARY PER YEAR</span><output data-out="amount">${m2(o.amount)}</output></div>
        <div class="fa-slider">
          <div class="fa-track" style="${bandStyle(z)}"></div>
          ${limitPct < 99.9 ? `<div class="fa-cant" style="left:${limitPct.toFixed(2)}%" title="More than you can pay"></div>` : ''}
          <input type="range" class="fa-range" data-role="amount" aria-label="Salary per year" min="${z.min}" max="${z.max}" step="10000" value="${o.amount}" ${disabled ? 'disabled' : ''}>
        </div>
        <div class="fa-scale"><span>MIN ${m2(z.min)}</span><span>MAX ${m2(z.max)}</span></div>
        <p class="fa-legend"><i class="k-no"></i>Declines <i class="k-close"></i>Close <i class="k-likely"></i>Good chance <i class="k-yes"></i>Accepts${limitPct < 99.9 ? ' <i class="k-cant"></i>Over your limit' : ''}</p>
        <p class="fa-zone-txt">${esc(zoneText(z))}</p>
      </div>
      <div class="fa-sl">
        <div class="fa-sl-label"><span>YEARS</span><output data-out="years">${yrs(o.years)}, thru ${esc(season(z.year + o.years - 1))}</output></div>
        <input type="range" class="fa-range fa-years" data-role="years" aria-label="Contract years" min="1" max="${z.yearsCap}" step="1" value="${o.years}" ${disabled ? 'disabled' : ''}>
        <div class="fa-scale">${Array.from({ length: z.yearsCap }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>
      </div>
      <label class="field fa-opt"><span>OPTION IN THE FINAL YEAR</span><select data-role="opt" ${disabled ? 'disabled' : ''}>
        ${[['', 'None'], ['player', 'Player option (he likes it)'], ['team', 'Team option (he wants more)'], ['eto', 'Early termination']].map(([k, l]) => `<option value="${k}" ${o.opt === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="fa-verdict lvl-${v.level}" data-out="verdict" aria-live="polite">${esc(v.text)}</div>
      <div class="fa-capnote ${cn.bad ? 'bad' : ''}" data-out="capnote">${esc(cn.text)}</div>
      <div class="fa-total"><small>TOTAL VALUE</small><b data-out="total">${money(o.amount * o.years)}</b><span data-out="totalsub">${yrs(o.years)} at ${m2(o.amount)}</span></div>
      <div class="fa-offer-btns"><button type="button" class="btn btn-gold" data-act="submit" data-id="${esc(p.id)}" ${subOff ? 'disabled' : ''}>SUBMIT OFFER</button><button type="button" class="btn" data-act="close">CANCEL</button></div>
    </div>`;
  }
  // Live update while a slider moves: no re-render, just the numbers and the verdict.
  function updatePanel(panel) {
    const id = panel.getAttribute('data-id'), o = offers[id];
    if (!o || !zone || zone.id !== id) return;
    const v = FAX().verdict(zone, o.amount), cn = capNote(zone, o);
    const set = (k, html, cls) => { const el = panel.querySelector('[data-out="' + k + '"]'); if (!el) return; el.innerHTML = html; if (cls != null) el.className = cls; };
    set('amount', m2(o.amount));
    set('years', yrs(o.years) + ', thru ' + esc(season(zone.year + o.years - 1)));
    set('verdict', esc(v.text), 'fa-verdict lvl-' + v.level);
    set('capnote', esc(cn.text), 'fa-capnote' + (cn.bad ? ' bad' : ''));
    set('total', money(o.amount * o.years));
    set('totalsub', yrs(o.years) + ' at ' + m2(o.amount));
    const sub = panel.querySelector('[data-act="submit"]');
    if (sub) sub.disabled = !!(cn.bad || zone.locked || zone.rosterFull);
  }

  // ---------- rows ----------
  const FIT_CLASS = { bird: 't-bird', space: 't-space', mle: 't-mle', exception: 't-mle', min: 't-min', none: 't-none', roster: 't-none' };
  function replyHtml(id) {
    const r = replies[id];
    return r ? `<div class="fa-reply ${r.accepted ? 'ok' : 'bad'}"><b>${r.accepted ? (r.sheet ? 'OFFER SHEET' : 'SIGNED') : 'NO DEAL'}</b> ${esc(r.message || '')}</div>` : '';
  }
  function faRow(st, p, m, phaseOpen) {
    const tags = [];
    if (m.own) tags.push('<span class="badge badge-gold">YOUR FREE AGENT</span>');
    else if (m.rights) tags.push(`<span class="badge ft-badge" title="${esc(m.rights)} holds his Bird rights">${esc(m.rights)}${m.rfa ? ' | RFA' : ''}</span>`);
    if (m.offerSheet) tags.push(`<span class="badge badge-dim">OFFER SHEET: ${esc(m.offerSheet)}</span>`);
    const meta = `${esc(p.pos || '')} | ${esc(p.age || '-')} YRS | ${UI.fmtHt(p.ht)} ${UI.injuryBadge(p)} ${tags.join(' ')}`;
    const open = view.open === p.id;
    const canOpen = phaseOpen && !m.locked && !m.offerSheet;
    return `<article class="fa-row${open ? ' open' : ''}" data-row="${esc(p.id)}">
      <a class="fa-who" href="#/player/${esc(p.id)}">${F.mini(p, { meta })}</a>
      <div class="fa-ask"><small>ASKING</small><b>${money(m.ask)}</b><span>${yrs(m.years)}</span></div>
      <div class="fa-fit"><span class="fa-tag ${FIT_CLASS[m.afford] || ''}" title="${m.via ? 'Estimated price about ' + esc(m2(m.estimate)) : 'More than any route you have'}">${esc(m.label)}</span>
        ${m.locked ? `<small>${esc(m.locked.split(':')[0])}</small>` : ''}</div>
      <div class="fa-act">${open ? '' : `<button type="button" class="btn btn-small${m.affordable && canOpen ? ' btn-gold' : ''}" data-act="open" data-id="${esc(p.id)}" ${canOpen ? '' : 'disabled'}>${m.own ? 'RE-SIGN' : 'MAKE OFFER'}</button>`}</div>
      ${replyHtml(p.id)}
      ${open ? offerPanel(st, p) : ''}
    </article>`;
  }

  // ---------- re-sign tab ----------
  function resignTab(st, info) {
    const user = st.userTeam, fa = st.fa, inWindow = !!(fa && fa.stage === 'resign');
    const parts = [];
    if (view.auto) {
      const done = view.auto.filter(x => x.action === 'resigned');
      parts.push(`<div class="fa-auto"><b>AUTO RE-SIGN</b> ${done.length ? done.map(x => esc(x.name) + ' (' + yrs(x.salaries.length) + ', ' + money(x.total) + ')').join(', ') + ' re-signed.' : 'Nobody re-signed.'}
        ${view.auto.filter(x => x.action !== 'resigned').map(x => `<div class="fa-auto-x">${esc(x.name)}: ${esc(x.reason || x.action)}</div>`).join('')}</div>`);
    }
    // team options and qualifying offers
    const dec = [];
    if (fa && inWindow) {
      (fa.decisions || []).filter(d => d.team === user && d.type === 'team').forEach(d => {
        const p = st.players[d.id]; if (!p) return;
        const ex = d.decision === 'exercised';
        dec.push(`<li><span><b>${esc(p.name)}</b> team option, ${money(d.amount)} for ${esc(season(d.year))}: <em class="${ex ? 'yes' : 'no'}">${ex ? 'EXERCISED' : 'DECLINED'}</em></span>
          <button type="button" class="btn btn-small" data-act="option" data-id="${esc(d.id)}" data-v="${ex ? 0 : 1}">${ex ? 'DECLINE IT' : 'EXERCISE IT'}</button></li>`);
      });
      Object.keys(fa.rights).forEach(id => {
        const r = fa.rights[id], p = st.players[id];
        if (r.team !== user || !r.qo || r.renounced || !p || p.team !== 'FA') return;
        dec.push(`<li><span><b>${esc(p.name)}</b> qualifying offer ${money(r.qo)}: <em class="${r.rfa ? 'yes' : 'no'}">${r.rfa ? 'EXTENDED (restricted, you can match offers)' : 'NOT EXTENDED (unrestricted)'}</em></span>
          <button type="button" class="btn btn-small" data-act="qo" data-id="${esc(id)}" data-v="${r.rfa ? 0 : 1}">${r.rfa ? 'WITHDRAW' : 'EXTEND'}</button></li>`);
      });
    }
    if (dec.length) parts.push(`<h3 class="fa-h3">DECISIONS BEFORE FREE AGENCY</h3><ul class="fa-dec">${dec.join('')}</ul>`);
    const list = info.players.filter(m => m.own);
    const ids = list.map(m => m.id);
    const win = F.try('FA.resignWindow', () => FAX().resignWindow(st, { all: true }), null);
    const wmap = {};
    ((win && win.players) || []).forEach(x => { wmap[x.id] = x; });
    parts.push('<h3 class="fa-h3">YOUR EXPIRING PLAYERS</h3>');
    if (!list.length) parts.push('<p class="muted">No unsigned free agents with your Bird rights.</p>');
    else parts.push('<div class="fa-list">' + list.map(m => {
      const p = st.players[m.id], w = wmap[m.id] || {};
      const open = view.open === p.id;
      const lc = p.lastContract && p.lastContract.salaries;
      const prev = lc && lc.length ? lc[lc.length - 1].amount : 0;
      const tags = [`<span class="badge badge-gold">${w.bird === 'full' ? 'FULL BIRD' : w.bird === 'early' ? 'EARLY BIRD' : 'NON-BIRD'}</span>`];
      if (w.rfa) tags.push('<span class="badge ft-badge">RESTRICTED</span>');
      if (w.willing === false) tags.push('<span class="badge badge-inj">WANTS OUT</span>');
      const meta = `${esc(p.pos || '')} | ${esc(p.age || '-')} YRS | Mood ${Math.round(typeof p.mood === 'number' ? p.mood : 55)}${prev ? ' | Was ' + money(prev) : ''} ${tags.join(' ')}`;
      return `<article class="fa-row fa-own${open ? ' open' : ''}" data-row="${esc(p.id)}">
        <a class="fa-who" href="#/player/${esc(p.id)}">${F.mini(p, { meta })}</a>
        <div class="fa-ask"><small>ASKING</small><b>${money(m.ask)}</b><span>${yrs(m.years)}</span></div>
        <div class="fa-fit"><span class="fa-tag ${FIT_CLASS[m.afford] || ''}">${esc(m.label)}</span></div>
        <div class="fa-act">${open ? '' : `<button type="button" class="btn btn-small btn-gold" data-act="open" data-id="${esc(p.id)}">NEGOTIATE</button>
          <button type="button" class="btn btn-small btn-danger" data-act="letgo" data-id="${esc(p.id)}">LET GO</button>`}</div>
        ${w.willing === false && !replies[p.id] ? `<div class="fa-reply bad"><b>AGENT</b> ${esc(w.message)}</div>` : ''}
        ${replyHtml(p.id)}
        ${open ? offerPanel(st, p) : ''}
      </article>`;
    }).join('') + '</div>');
    const re = ((fa && fa.signings) || []).filter(s => s.abbr === user && s.resign && s.year === fa.year && !ids.includes(s.id));
    if (re.length) parts.push(`<h3 class="fa-h3">RE-SIGNED THIS OFFSEASON</h3><ul class="fa-news">${re.map(s => `<li><b>${esc(s.name)}</b>: ${yrs(s.salaries.length)}, ${money(s.salaries.reduce((a, x) => a + x.amount, 0))} (${esc(FAX().ROUTE_LABEL[s.via] || s.via)})</li>`).join('')}</ul>`);
    return parts.join('');
  }

  // ---------- free agents tab ----------
  function sortedPool(st, info) {
    let list = info.players.filter(m => !m.own || st.phase !== 'resign');
    if (view.pos !== 'ALL') list = list.filter(m => String(st.players[m.id].pos || '').toUpperCase().split(/[-/ ]/).indexOf(view.pos) >= 0);
    if (view.afford) list = list.filter(m => m.affordable && !m.locked);
    if (view.q) { const q = view.q.toLowerCase(); list = list.filter(m => String(st.players[m.id].name).toLowerCase().indexOf(q) >= 0); }
    const pl = id => st.players[id];
    const sorters = {
      ovr: (a, b) => (pl(b.id).ovr || 0) - (pl(a.id).ovr || 0) || (pl(a.id).age || 0) - (pl(b.id).age || 0),
      age: (a, b) => (pl(a.id).age || 0) - (pl(b.id).age || 0) || (pl(b.id).ovr || 0) - (pl(a.id).ovr || 0),
      ask: (a, b) => b.ask - a.ask,
      cheap: (a, b) => a.estimate - b.estimate || (pl(b.id).ovr || 0) - (pl(a.id).ovr || 0)
    };
    return list.sort(sorters[view.sort] || sorters.ovr);
  }
  function listHtml(st, info, phaseOpen) {
    const pool = sortedPool(st, info);
    const shown = pool.slice(0, view.shown);
    return `<p class="fa-count">${pool.length} ${pool.length === 1 ? 'player' : 'players'}${view.afford ? ' you can afford' : ''}${view.pos !== 'ALL' ? ' at ' + view.pos : ''}</p>
      <div class="fa-list">${shown.length ? shown.map(m => faRow(st, st.players[m.id], m, phaseOpen)).join('') : `<p class="muted">${view.afford ? 'Nobody fits your cap right now. Clear room in Team Salary, or wait: asking prices drop as free agency goes on.' : 'No free agents here.'}</p>`}</div>
      ${pool.length > shown.length ? `<div class="row-btns center"><button type="button" class="btn" data-act="more">SHOW MORE (${pool.length - shown.length} LEFT)</button></div>` : ''}`;
  }
  function faTab(st, info, phaseOpen) {
    const recent = (st.transactions || []).filter(t => t && t.type === 'sign' && t.year === st.year).slice(-8).reverse();
    return `<div class="fa-filters">
        <nav class="tabs" aria-label="Position">${POS.map(x => `<a href="#/fa" data-act="pos" data-pos="${x}" class="${view.pos === x ? 'on' : ''}">${x}</a>`).join('')}</nav>
        <label class="fa-check"><input type="checkbox" data-act="afford" ${view.afford ? 'checked' : ''}> Only players I can afford</label>
        <label class="field fa-search"><span>SEARCH</span><input type="search" data-act="q" value="${esc(view.q)}" placeholder="Player name"></label>
        <label class="field fa-sort"><span>SORT BY</span><select data-act="sort">
          ${[['ovr', 'Overall'], ['age', 'Youngest'], ['ask', 'Asking salary'], ['cheap', 'Cheapest']].map(([k, l]) => `<option value="${k}" ${view.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div id="fa-listbox">${listHtml(st, info, phaseOpen)}</div>
      ${recent.length ? `<h3 class="fa-h3">LATEST SIGNINGS</h3><ul class="fa-news">${recent.map(t => `<li>${esc(t.text || '')}</li>`).join('')}</ul>` : ''}`;
  }

  // ---------- team salary tab ----------
  function salaryTab(st, cs, phaseOpen) {
    const user = st.userTeam, Y = cs.year;
    const rows = F.teamPlayers(st, user).map(p => {
      const c = p.contract;
      const sal = c && c.salaries ? c.salaries.filter(s => s.year >= Y) : [];
      const opts = c ? (c.options && c.options.length ? c.options : c.option ? [c.option] : []).filter(o => o.year >= Y) : [];
      return { p, now: F.salary(p, Y), left: sal.length, thru: sal.length ? sal[sal.length - 1].year : null, guaranteed: sal.reduce((a, s) => a + s.amount, 0),
        optT: opts.map(o => (o.type === 'player' ? 'Player' : o.type === 'team' ? 'Team' : 'ETO') + ' ' + season(o.year)).join(', '),
        stashed: FAX().isStashed(p), two: !!(c && c.twoWay), rookie: !!(c && c.rookie) };
    }).sort((a, b) => (a.stashed - b.stashed) || b.now - a.now || (b.p.ovr || 0) - (a.p.ovr || 0));
    const deadSum = ((st.teams[user] && st.teams[user].deadMoney) || []).filter(d => d.year === Y).reduce((a, d) => a + d.amount, 0);
    const body = rows.map(r => {
      const p = r.p, cut = view.cut === p.id;
      const act = r.stashed ? '<span class="muted">Rights kept</span>'
        : !phaseOpen ? '' : `<button type="button" class="btn btn-small btn-danger" data-act="cut" data-id="${esc(p.id)}">${cut ? 'CONFIRM: ' + money(r.guaranteed) + ' DEAD' : 'WAIVE'}</button>${cut ? ' <button type="button" class="btn btn-small" data-act="nocut">KEEP</button>' : ''}`;
      return `<tr class="${r.stashed ? 'fa-stash' : ''}">
        <td class="fa-tl"><a href="#/player/${esc(p.id)}">${esc(p.name)}</a><small>${esc(p.pos || '')} | ${esc(p.age || '-')} yrs | <span class="${UI.ovrClass(p.ovr)}">${p.ovr}</span></small></td>
        <td class="num">${r.stashed ? '<span class="muted">Overseas until ' + esc(p.stashedUntil) + '</span>' : r.now ? money(r.now) + (r.two ? ' <small>two-way</small>' : '') : '<span class="muted">-</span>'}</td>
        <td class="num">${r.stashed ? '-' : r.left}</td>
        <td>${r.thru ? esc(season(r.thru)) : '-'}${r.rookie ? ' <small>rookie</small>' : ''}</td>
        <td>${r.optT ? esc(r.optT) : '<span class="muted">None</span>'}</td>
        <td class="fa-tact">${act}</td></tr>`;
    }).join('');
    return `<div class="fa-tablewrap"><table class="stats fa-table">
      <thead><tr><th>PLAYER</th><th class="num">${esc(season(Y))}</th><th class="num">YEARS LEFT</th><th>THROUGH</th><th>OPTIONS</th><th></th></tr></thead>
      <tbody>${body}${deadSum ? `<tr class="fa-dead"><td>Dead money (waived players)</td><td class="num">${money(deadSum)}</td><td colspan="4"></td></tr>` : ''}</tbody>
      <tfoot><tr><td>TEAM PAYROLL</td><td class="num">${money(cs.payroll)}</td><td colspan="4">Cap ${money(cs.cap)} | ${cs.room > 0 ? 'Room ' + money(cs.room) : 'Over the cap by ' + money(cs.payroll - cs.cap)} | Tax line ${money(cs.tax)}</td></tr></tfoot>
    </table></div>
    <p class="ft-hint">Waived players stay on the books as dead money. Draft picks playing overseas keep their rights, do not count against the roster and cannot be waived.</p>`;
  }

  // ---------- page ----------
  function render(app, st) {
    const user = st.userTeam;
    const cs = FAX().capSummary(st, user);
    const info = FAX().market(st, user);
    const ph = st.phase, phaseOpen = !!OPEN_PHASES[ph];
    const ownCount = info.players.filter(m => m.own).length;
    const showResign = ph === 'resign' || ownCount > 0;
    if (view.tabPhase !== ph) { view.tab = ph === 'resign' ? 'resign' : 'fa'; view.tabPhase = ph; }
    if (view.tab === 'resign' && !showResign) view.tab = 'fa';
    const tabs = [];
    if (showResign) tabs.push(['resign', 'RE-SIGN' + (ownCount ? ' (' + ownCount + ')' : '')]);
    tabs.push(['fa', 'FREE AGENTS (' + info.players.filter(m => !m.own || ph !== 'resign').length + ')']);
    tabs.push(['salary', 'TEAM SALARY']);
    const body = view.tab === 'resign' ? resignTab(st, info) : view.tab === 'salary' ? salaryTab(st, cs, phaseOpen) : faTab(st, info, phaseOpen);
    app.innerHTML = `${UI.header('FREE AGENCY', esc(phaseNote(st)))}
      ${capPanel(st, cs)}
      <nav class="tabs fa-tabs" aria-label="Free agency sections">${tabs.map(([k, l]) => `<a href="#/fa" data-act="tab" data-tab="${k}" class="${view.tab === k ? 'on' : ''}">${esc(l)}</a>`).join('')}</nav>
      <div class="fa-body">${body}</div>`;
  }

  function refreshList(app, st) {
    const box = app.querySelector('#fa-listbox');
    if (!box) { render(app, st); return; }
    box.innerHTML = listHtml(st, FAX().market(st, st.userTeam), !!OPEN_PHASES[st.phase]);
  }

  async function submit(app, st, id) {
    const o = offers[id];
    if (!o) return;
    const user = st.userTeam;
    const Y = zone && zone.id === id ? zone.year : FAX().contractYear(st);
    const salaries = [];
    for (let i = 0; i < o.years; i++) salaries.push({ year: Y + i, amount: o.amount });
    const option = o.opt ? { year: Y + o.years - 1, type: o.opt } : null;
    let res;
    try { res = FAX().offer(st, user, id, { salaries, option }) || {}; } catch (e) { console.warn('FA.offer', e); res = { accepted: false, message: 'The offer could not be made: ' + (e && e.message ? e.message : e) }; }
    const p = st.players[id];
    replies[id] = { accepted: !!res.accepted, sheet: !!res.offerSheet, message: res.message || (res.accepted ? 'He signed.' : 'He turned it down.') };
    if (res.accepted) {
      view.open = null; delete offers[id];
      await F.save();
      UI.toast((p ? p.name : 'The player') + (res.offerSheet ? ' signed your offer sheet.' : ' signed with the ' + UI.team(user).name + '. Saved.'));
      render(app, st);
      const top = app.querySelector('.fa-cap');
      if (top) top.insertAdjacentHTML('afterend', `<div class="fa-reply ok fa-banner"><b>${res.offerSheet ? 'OFFER SHEET' : 'SIGNED'}</b> ${esc(replies[id].message)}</div>`);
    } else {
      render(app, st);
      const row = app.querySelector(`[data-row="${CSS.escape(id)}"] .fa-reply`);
      if (row) row.scrollIntoView({ block: 'nearest' });
    }
  }

  function bind(app, st) {
    app.onclick = async ev => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
      const act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
      if (b.tagName === 'A') ev.preventDefault();
      if (act === 'tab') { view.tab = b.getAttribute('data-tab'); view.open = null; render(app, st); }
      else if (act === 'pos') { view.pos = b.getAttribute('data-pos'); view.shown = PAGE; render(app, st); }
      else if (act === 'more') { view.shown += PAGE; refreshList(app, st); }
      else if (act === 'open') {
        view.open = id; render(app, st);
        const panel = app.querySelector('.fa-offer');
        if (panel) { panel.scrollIntoView({ block: 'nearest' }); const r = panel.querySelector('.fa-range'); if (r) r.focus({ preventScroll: true }); }
      }
      else if (act === 'close') { view.open = null; render(app, st); }
      else if (act === 'submit') await submit(app, st, id);
      else if (act === 'letgo') {
        const r = FAX().letGo(st, st.userTeam, id);
        delete replies[id];
        await F.save(); UI.toast(r.message, r.ok ? '' : 'error'); render(app, st);
      }
      else if (act === 'option') {
        const r = FAX().decideOption(st, id, b.getAttribute('data-v') === '1');
        await F.save(); UI.toast(r.message, r.ok ? '' : 'error'); render(app, st);
      }
      else if (act === 'qo') {
        const r = FAX().setQualifyingOffer(st, id, b.getAttribute('data-v') === '1');
        await F.save(); UI.toast(r.message, r.ok ? '' : 'error'); render(app, st);
      }
      else if (act === 'auto') {
        view.auto = F.try('FA.autoResign', () => FAX().autoResign(st, st.userTeam, { force: true }), []) || [];
        const n = view.auto.filter(x => x.action === 'resigned').length;
        await F.save();
        UI.toast(n ? n + ' player' + (n > 1 ? 's' : '') + ' re-signed.' : 'Nobody was worth re-signing at his price.');
        view.tab = 'resign'; render(app, st);
      }
      else if (act === 'openfa') {
        // the user made his own re-signing choices: simming on must not auto re-sign anyone else
        if (st.fa) st.fa.userReviewed = true;
        view.auto = null;
        if (UI.sim) await UI.sim('nextPhase');
      }
      else if (act === 'camp') { if (UI.sim) await UI.sim('nextPhase'); }
      else if (act === 'simday' || act === 'simall') {
        const before = (st.fa && st.fa.signings.length) || 0;
        try {
          if (act === 'simday') FAX().simDay(st, F.rng(st));
          else FAX().finish(st, F.rng(st));
        } catch (e) { console.warn('FA sim', e); UI.toast('The free agency day failed: ' + (e && e.message ? e.message : e), 'error'); }
        if (st.fa) st.faDay = st.fa.day;
        const signed = ((st.fa && st.fa.signings.length) || 0) - before;
        await F.save();
        UI.toast((st.fa && st.fa.stage === 'done' ? 'Free agency is over. ' : 'Day ' + (st.fa ? st.fa.day : '') + ' done. ') + (signed > 0 ? signed + ' signing' + (signed > 1 ? 's' : '') + ' around the league.' : 'No signings.'));
        if (view.open && !(st.players[view.open] && st.players[view.open].team === 'FA')) view.open = null;
        render(app, st);
        if (UI.pendingEvents && UI.pendingEvents() && UI.showEvents) UI.showEvents();
      }
      else if (act === 'cut') {
        if (view.cut !== id) { view.cut = id; render(app, st); return; }
        const r = FAX().release(st, st.userTeam, id);
        view.cut = null;
        if (r.ok) await F.save();
        UI.toast(r.message, r.ok ? '' : 'error'); render(app, st);
      }
      else if (act === 'nocut') { view.cut = null; render(app, st); }
    };
    app.oninput = ev => {
      const t = ev.target;
      if (t.matches('[data-act="q"]')) { view.q = t.value; view.shown = PAGE; refreshList(app, st); return; }
      const role = t.getAttribute('data-role');
      if (!role || role === 'opt') return;
      const panel = t.closest('.fa-offer'); if (!panel) return;
      const id = panel.getAttribute('data-id'), o = offers[id]; if (!o) return;
      if (role === 'amount') { o.amount = Number(t.value) || o.amount; updatePanel(panel); }
      else if (role === 'years') {
        o.years = Number(t.value) || o.years;
        loadZone(st, id);
        if (!zone) return;
        const tr = panel.querySelector('.fa-track'); if (tr) tr.setAttribute('style', bandStyle(zone));
        const zt = panel.querySelector('.fa-zone-txt'); if (zt) zt.textContent = zoneText(zone);
        updatePanel(panel);
      }
    };
    app.onchange = ev => {
      const t = ev.target;
      if (t.matches('[data-act="sort"]')) { view.sort = t.value; refreshList(app, st); }
      else if (t.matches('[data-act="afford"]')) { view.afford = t.checked; view.shown = PAGE; refreshList(app, st); }
      else if (t.matches('[data-role="opt"]')) {
        const panel = t.closest('.fa-offer'), id = panel && panel.getAttribute('data-id');
        if (id && offers[id]) { offers[id].opt = t.value; render(app, st); }
      }
    };
    app.onsubmit = ev => ev.preventDefault();
  }

  P.fa = function (app) {
    app.onclick = null; app.onchange = null; app.onsubmit = null; app.oninput = null;
    const st = F.state();
    if (!st) { app.innerHTML = F.noLeague(); return; }
    if (!F.mod('FA')) { app.innerHTML = UI.header('FREE AGENCY') + F.building('Free agency', 'js/freeagency.js'); return; }
    if (!FAok()) { app.innerHTML = UI.header('FREE AGENCY') + F.building('The free agency screen', 'js/freeagency.js'); return; }
    // the re-signing window opens with the resign phase; the market opens with the free agency phase
    if (st.phase === 'resign' && (!st.fa || st.fa.year <= st.year)) F.try('FA.startOffseason', () => FAX().startOffseason(st), null);
    if (st.phase === 'freeAgency' && st.fa && st.fa.stage === 'resign' && FAX().openMarket) {
      F.try('FA.openMarket', () => FAX().openMarket(st, F.rng(st)), null);
      F.save();
    }
    if (view.open && !(st.players[view.open] && st.players[view.open].team === 'FA')) view.open = null;
    bind(app, st);
    try { render(app, st); } catch (e) {
      console.warn('[fa page]', e);
      app.innerHTML = UI.header('FREE AGENCY') + UI.empty('SOMETHING WENT WRONG', 'The free agency page could not be drawn: ' + esc(e && e.message ? e.message : e), '');
    }
  };
})();
