// Trades page (#/trade, #/trade/<abbr>, #/trade/block) plus the small helpers shared by the
// trade, free agency and draft pages (UI.feat). Every module call is guarded: when a module
// has not loaded yet, a "still being built" panel is shown instead.
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI) return;
  const P = UI.pages = UI.pages || {};
  const esc = UI.esc;

  // ---------- shared helpers for the feature pages ----------
  const F = UI.feat = UI.feat || {};
  const OFFSEASON = ['draftLottery', 'draft', 'resign', 'freeAgency', 'training'];
  F.OFFSEASON = OFFSEASON;

  F.mod = name => (typeof window[name] !== 'undefined' && window[name]) ? window[name] : null;
  F.fn = (name, method) => { const m = F.mod(name); return m && typeof m[method] === 'function' ? m : null; };

  // The multi-season league state (contract-v2). The UI may keep it under any key, so look for
  // the first object that has the state's shape.
  const looksLikeState = s => !!(s && typeof s === 'object' && typeof s.phase === 'string' && s.players && typeof s.players === 'object' && !Array.isArray(s.players) && s.teams && typeof s.teams === 'object' && !Array.isArray(s.teams) && s.userTeam);
  F.state = function () {
    try {
      if (typeof UI.getState === 'function') { const s = UI.getState(); if (looksLikeState(s)) return s; }
      if (looksLikeState(UI.leagueState)) return UI.leagueState;
      const st = UI.state || {};
      const pref = ['lstate', 'game', 'franchise', 'leagueState', 'state', 'lg', 'gs'];
      for (const k of pref) if (looksLikeState(st[k])) return st[k];
      for (const k of Object.keys(st)) if (looksLikeState(st[k])) return st[k];
      if (looksLikeState(window.A13_STATE)) return window.A13_STATE;
    } catch (e) { /* fall through */ }
    return null;
  };

  F.noLeague = () => UI.empty('NO LEAGUE LOADED', 'Start a new Association or load one of your saves to use this page.',
    '<div class="row-btns"><a class="btn btn-gold" href="#/new">PLAY THE ASSOCIATION</a><a class="btn" href="#/saves">SAVES</a></div>');
  F.building = (what, file) => UI.empty('THIS FEATURE IS STILL BEING BUILT',
    esc(what) + ' needs <code>' + esc(file) + '</code>, which has not loaded yet. Check back soon: the rest of your league still works.',
    '<div class="row-btns"><a class="btn" href="#/season">SEASON</a><a class="btn" href="#/teams">ROSTERS</a></div>');

  F.try = function (label, fn, fallback) {
    try { return fn(); } catch (e) { console.warn('[' + label + ']', e); return fallback; }
  };

  // The season whose salaries count right now: next season once the offseason has started.
  F.capYear = st => (OFFSEASON.indexOf(st.phase) >= 0 ? st.year + 1 : st.year);

  F.salary = function (p, year) {
    const c = p && p.contract;
    if (c && Array.isArray(c.salaries)) { const s = c.salaries.find(x => x && x.year === year); return s ? Number(s.amount) || 0 : 0; }
    if (p && p.salary && (p.contractEnd || 0) >= year) return Number(p.salary) || 0;
    return 0;
  };
  F.contractEnd = function (p) {
    const c = p && p.contract;
    if (c && Array.isArray(c.salaries) && c.salaries.length) return Math.max.apply(null, c.salaries.map(x => x.year));
    return (p && p.contractEnd) || null;
  };
  F.contractText = function (p, st) {
    const end = F.contractEnd(p);
    if (!end) return 'No contract';
    const opt = p.contract && p.contract.option;
    const optT = opt && opt.type ? ' | ' + (opt.type === 'eto' ? 'ETO' : opt.type === 'player' ? 'PO' : 'TO') + ' ' + UI.fmtSeasonEnd(opt.year) : '';
    if (st && end < F.capYear(st)) return 'Expiring' + optT;
    return 'Thru ' + UI.fmtSeasonEnd(end) + optT;
  };
  F.teamPlayers = (st, abbr) => Object.keys(st.players).map(id => st.players[id])
    .filter(p => p && p.team === abbr && !p.retired).sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
  // Cap numbers: CBA first, then the free agency module's built-in rules, then a plain sum.
  F.payroll = function (st, abbr, year) {
    for (const m of ['CBA', 'FA']) {
      const M = F.fn(m, 'payroll');
      if (M) { const v = F.try(m + '.payroll', () => M.payroll(st, abbr, year), null); if (typeof v === 'number' && isFinite(v)) return v; }
    }
    return F.teamPlayers(st, abbr).reduce((s, p) => s + F.salary(p, year), 0);
  };
  F.rules = function (year) {
    for (const m of ['CBA', 'FA']) {
      const M = F.fn(m, 'rules');
      if (M) { const r = F.try(m + '.rules', () => M.rules(year), null); if (r) return r; }
    }
    return null;
  };
  F.capSpace = function (st, abbr, year) {
    const C = F.fn('CBA', 'capSpace');
    if (C) {
      const v = F.try('CBA.capSpace', () => C.capSpace(st, abbr, year), null);
      if (typeof v === 'number') return v;
      if (v && typeof v === 'object' && typeof v.space === 'number') return v.space;
    }
    const r = F.rules(year);
    return r && r.cap ? r.cap - F.payroll(st, abbr, year) : null;
  };
  F.money = n => {
    const v = Number(n) || 0;
    if (v < 0) return '-' + UI.fmtMoney(-v);
    return v === 0 ? '$0' : UI.fmtMoney(v);
  };

  // Advance the save's random seed the same way the orchestrator does.
  F.rng = function (st) {
    let seed = Number(st.rngSeed);
    if (!isFinite(seed) || seed <= 0) seed = 1 + Math.floor(Math.random() * 2147483646);
    st.rngSeed = (seed * 1103515245 + 12345) % 2147483647;
    return UI.rng(st.rngSeed);
  };

  // Autosave through the existing save helper.
  F.save = async function () {
    if (UI.bump) UI.bump();
    let ok = false;
    try {
      if (UI.saves && typeof UI.saves.write === 'function') ok = await UI.saves.write();
    } catch (e) {
      console.warn('Autosave failed', e);
      UI.toast('Autosave failed: ' + (e && e.message ? e.message : e), 'error');
    }
    try { if (UI.updateChrome) UI.updateChrome(); } catch (e) { /* ignore */ }
    return ok;
  };

  F.pickKey = pk => (typeof pk === 'string' ? pk : pk ? pk.year + '-' + pk.round + '-' + pk.original : '');
  F.pickLabel = function (pk, owner) {
    if (!pk) return '';
    if (typeof pk === 'string') return pk;
    const rd = pk.round === 1 ? '1st' : pk.round === 2 ? '2nd' : pk.round + 'th';
    let s = pk.year + ' ' + rd + ' round';
    if (pk.original && pk.original !== owner) s += ' (via ' + pk.original + ')';
    return s;
  };
  F.protText = function (pk) {
    const pr = pk && pk.protection;
    if (!pr) return 'Unprotected';
    if (typeof pr === 'string') return pr;
    let s = pr.top ? 'Top ' + pr.top + ' protected' : 'Protected';
    if (pr.until) s += ' thru ' + pr.until;
    return s;
  };

  F.mini = function (p, opts) {
    opts = opts || {};
    const ovr = p.ovr || 0;
    return `<span class="ft-hs">${UI.headshot(p)}</span>
      <span class="ft-main"><b class="ft-name">${esc(p.name)}</b>
        <span class="ft-meta">${opts.meta != null ? opts.meta : esc(p.pos || '') + ' | ' + esc(p.age || '-') + ' YRS'}</span></span>
      <span class="ft-ovr ${UI.ovrClass(ovr)}">${ovr}${opts.pot ? `<small>POT ${p.pot || '-'}</small>` : ''}</span>`;
  };

  F.phaseName = ph => ({ preseason: 'Preseason', regular: 'Regular season', playoffs: 'Playoffs', draftLottery: 'Draft lottery',
    draft: 'Draft', resign: 'Re-signing', freeAgency: 'Free agency', training: 'Training camp' }[ph] || ph || '-');

  // ---------- routing for the feature pages ----------
  // ui.js has a fixed route list; wrap the router so #/trade, #/fa and #/draft reach these pages.
  const MINE = { trade: 'trade', fa: 'fa', draft: 'draft' };
  if (!UI.__featRoute && typeof UI.route === 'function') {
    UI.__featRoute = true;
    const orig = UI.route;
    UI.route = function () {
      const parts = (location.hash || '#/home').replace(/^#\/?/, '').split('/');
      const page = parts[0];
      if (!MINE[page] || !P[page]) return orig.apply(this, arguments);
      const app = document.getElementById('app');
      UI.$$('#mainnav a').forEach(a => a.classList.toggle('on', a.getAttribute('data-nav') === page));
      if (!UI.state.league && UI.notBuilt) { app.innerHTML = UI.notBuilt('data'); return; }
      const arg = parts.slice(1).join('/');
      try { P[page](app, arg ? decodeURIComponent(arg) : ''); } catch (e) {
        console.warn('Page failed', page, e);
        app.innerHTML = UI.empty('SOMETHING WENT WRONG', 'This page could not be drawn: ' + esc(e && e.message ? e.message : e), '<a class="btn" href="#/home">HOME</a>');
      }
    };
  }
  // Add nav links once, before Saves, unless the header already has them.
  (function addNav() {
    const nav = document.getElementById('mainnav');
    if (!nav) { document.addEventListener('DOMContentLoaded', addNav, { once: true }); return; }
    const before = nav.querySelector('[data-nav="saves"]');
    [['trade', 'Trades'], ['fa', 'Free Agency'], ['draft', 'Draft']].forEach(([k, label]) => {
      if (nav.querySelector('[data-nav="' + k + '"]') || nav.querySelector('a[href="#/' + k + '"]')) return;
      const a = document.createElement('a');
      a.href = '#/' + k; a.setAttribute('data-nav', k); a.textContent = label;
      nav.insertBefore(a, before || null);
    });
  })();

  // ---------- trade page ----------
  let deal = { user: null, partner: null, sel: {} };
  let answer = null;      // { accepts, message, margin }
  let finds = null;       // { list: [trade], error }

  function blankSel() { return { players: new Set(), picks: new Set() }; }
  function resetDeal(user, partner) { deal = { user, partner, sel: { [user]: blankSel(), [partner]: blankSel() } }; answer = null; finds = null; }

  function teamPicks(st, abbr) {
    const t = st.teams[abbr];
    return (t && Array.isArray(t.picks) ? t.picks : []).slice()
      .filter(pk => pk && (pk.year == null || pk.year >= st.year))
      .sort((a, b) => (a.year - b.year) || (a.round - b.round) || String(a.original).localeCompare(String(b.original)));
  }
  function pickObj(st, abbr, key) { return teamPicks(st, abbr).find(pk => F.pickKey(pk) === key) || null; }

  function buildTrade(st) {
    const out = { teams: [deal.user, deal.partner], give: {} };
    [deal.user, deal.partner].forEach(a => {
      const s = deal.sel[a] || blankSel();
      out.give[a] = {
        players: Array.from(s.players).filter(id => st.players[id] && st.players[id].team === a),
        picks: Array.from(s.picks).map(k => pickObj(st, a, k)).filter(Boolean)
          .map(pk => ({ year: pk.year, round: pk.round, original: pk.original, protection: pk.protection || null }))
      };
    });
    return out;
  }
  const dealSize = tr => tr.teams.reduce((n, a) => n + tr.give[a].players.length + tr.give[a].picks.length, 0);

  function tradeClosed(st) {
    const playoffs = st.phase === 'playoffs' || (st.phase === 'regular' && st.season && st.season.phase === 'playoffs');
    if (playoffs) return 'Trades are closed during the playoffs.';
    const W = F.fn('TRADE', 'windowOpen');
    if (W && F.try('TRADE.windowOpen', () => W.windowOpen(st), true) === false) return 'The trade deadline has passed. Trades open again after the season.';
    if (st.phase !== 'regular') return null;
    const L = F.fn('LEAGUE', 'currentDate');
    const date = L ? F.try('currentDate', () => L.currentDate(st), null) : null;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(date)) return null;
    const r = F.rules(st.year);
    const dl = r && typeof r.tradeDeadline === 'string' ? r.tradeDeadline.slice(-5) : '02-21';
    const md = date.slice(5, 10);
    if (md >= dl && md < '07-01') return 'The trade deadline has passed. Trades open again after the season.';
    return null;
  }

  function assetList(st, tr, abbr) {
    const g = tr.give[abbr] || { players: [], picks: [] };
    const items = [];
    (g.players || []).forEach(id => {
      const p = st.players[id];
      items.push(p ? `<li><b class="${UI.ovrClass(p.ovr || 0)}">${p.ovr || '-'}</b> ${esc(p.name)} <small>${esc(p.pos || '')} | ${F.money(F.salary(p, F.capYear(st)))}</small></li>` : `<li>${esc(id)}</li>`);
    });
    (g.picks || []).forEach(pk => items.push(`<li><b class="ft-pk">PICK</b> ${esc(F.pickLabel(pk, abbr))} <small>${esc(F.protText(pk))}</small></li>`));
    return items.length ? `<ul class="ft-assets">${items.join('')}</ul>` : '<p class="muted ft-nothing">Nothing</p>';
  }

  function sideColumn(st, abbr, yr) {
    const s = deal.sel[abbr];
    const players = F.teamPlayers(st, abbr);
    const picks = teamPicks(st, abbr);
    const payroll = F.payroll(st, abbr, yr);
    const space = F.capSpace(st, abbr, yr);
    const isUser = abbr === deal.user;
    const rows = players.map(p => {
      const on = s.players.has(p.id);
      const stash = p.stashedUntil && p.stashedUntil > st.year ? ` | <span class="ft-stash">Overseas until ${p.stashedUntil}</span>` : '';
      const meta = `${esc(p.pos || '')} | ${esc(p.age || '-')} YRS | ${F.money(F.salary(p, yr))} | ${esc(F.contractText(p, st))}${stash} ${UI.injuryBadge(p)}`;
      return `<button type="button" class="ft-item${on ? ' on' : ''}" data-act="toggle" data-side="${esc(abbr)}" data-kind="player" data-id="${esc(p.id)}" aria-pressed="${on}">${F.mini(p, { meta })}</button>`;
    }).join('');
    const prow = picks.map(pk => {
      const k = F.pickKey(pk), on = s.picks.has(k);
      return `<button type="button" class="ft-item ft-pick${on ? ' on' : ''}" data-act="toggle" data-side="${esc(abbr)}" data-kind="pick" data-id="${esc(k)}" aria-pressed="${on}">
        <span class="ft-pick-yr">${esc(pk.year)}<small>RD ${esc(pk.round)}</small></span>
        <span class="ft-main"><b class="ft-name">${esc(pk.year)} ${pk.round === 1 ? '1st' : '2nd'} round</b>
          <span class="ft-meta">${pk.original && pk.original !== abbr ? 'Via ' + esc(pk.original) : 'Own pick'} | ${esc(F.protText(pk))}</span></span>
        ${UI.logo(pk.original || abbr, 28)}</button>`;
    }).join('');
    return `<section class="ft-side${isUser ? ' mine' : ''}">
      <div class="ft-side-head">${UI.logo(abbr, 44)}<div><div class="ft-k">${isUser ? 'YOU SEND' : 'THEY SEND'}</div>
        <div class="ft-t">${esc(UI.teamName(abbr))}</div>
        <div class="ft-sub">Payroll ${F.money(payroll)}${space != null ? ' | Cap space ' + F.money(space) : ''} | ${players.length} players</div></div></div>
      <div class="ft-group">PLAYERS</div>
      <div class="ft-list">${rows || '<p class="muted">No players.</p>'}</div>
      <div class="ft-group">DRAFT PICKS</div>
      <div class="ft-list">${prow || '<p class="muted">No tradable picks.</p>'}</div>
    </section>`;
  }

  function summary(st, tr, yr) {
    const out = {}, inn = {};
    tr.teams.forEach(a => { out[a] = tr.give[a].players.reduce((s, id) => s + F.salary(st.players[id], yr), 0); });
    inn[tr.teams[0]] = out[tr.teams[1]]; inn[tr.teams[1]] = out[tr.teams[0]];
    const count = a => F.teamPlayers(st, a).filter(p => !(p.stashedUntil && p.stashedUntil > st.year)).length;
    const sideSum = a => {
      const other = a === tr.teams[0] ? tr.teams[1] : tr.teams[0];
      const after = F.payroll(st, a, yr) - out[a] + inn[a];
      const roster = count(a) - tr.give[a].players.filter(id => !(st.players[id].stashedUntil > st.year)).length + tr.give[other].players.filter(id => !(st.players[id].stashedUntil > st.year)).length;
      return `<div class="ft-sum-team">${UI.logo(a, 28)}<div><b>${esc(a)}</b>
        <span>Sends ${F.money(out[a])} | Takes back ${F.money(inn[a])}</span>
        <span>Payroll after ${F.money(after)} | Roster after ${roster}</span></div></div>`;
    };
    let cba;
    const C = F.fn('CBA', 'validateTrade');
    const V = F.fn('TRADE', 'validate');   // the trade module's own 2012 CBA check, used until js/cba.js lands
    let cbaOk = true;
    if (!dealSize(tr)) cba = '<div class="ft-cba muted">Add players or picks to either side.</div>';
    else if (!C && !V) cba = '<div class="ft-cba muted">Salary rules check: the CBA module (<code>js/cba.js</code>) is still being built.</div>';
    else {
      let r;
      try { r = C ? C.validateTrade(st, tr) : V.validate(st, tr); } catch (e) { r = { ok: false, reasons: ['Could not check this trade: ' + (e && e.message ? e.message : e)] }; }
      r = r || { ok: true, reasons: [] };
      cbaOk = !!r.ok;
      cba = r.ok ? '<div class="ft-cba ok"><b>CBA CHECK PASSED</b> Salaries and rosters work under the ' + esc(st.year - 1) + '-' + String(st.year).slice(2) + ' rules.</div>'
        : `<div class="ft-cba bad"><b>CBA CHECK FAILED</b><ul>${(r.reasons || ['This trade breaks the salary rules.']).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
    }
    return { html: `<div class="ft-sum-teams">${sideSum(tr.teams[0])}${sideSum(tr.teams[1])}</div>${cba}`, cbaOk };
  }

  function answerHtml() {
    if (!answer) return '';
    if (answer.error) return `<div class="ft-answer bad"><div class="ft-k">NO ANSWER</div><p>${esc(answer.error)}</p></div>`;
    const who = esc(UI.teamName(deal.partner));
    if (answer.done) return `<div class="ft-answer ok"><div class="ft-k">TRADE COMPLETE</div><p>${esc(answer.message || 'The deal is done.')}</p></div>`;
    return `<div class="ft-answer ${answer.accepts ? 'ok' : 'bad'}">
      <div class="ft-k">${who} ${answer.accepts ? 'ACCEPT' : 'DECLINE'}</div>
      <p>${esc(answer.message || (answer.accepts ? 'You have a deal.' : 'Not interested.'))}</p>
      ${answer.accepts ? '<div class="row-btns"><button type="button" class="btn btn-gold" data-act="execute">COMPLETE TRADE</button><button type="button" class="btn" data-act="dismiss">KEEP TALKING</button></div>' : ''}
    </div>`;
  }

  function findsHtml(st) {
    if (!finds) return '';
    if (finds.error) return `<div class="ft-answer bad"><div class="ft-k">TRADE FINDER</div><p>${esc(finds.error)}</p></div>`;
    if (!finds.list.length) return '<div class="ft-answer"><div class="ft-k">TRADE FINDER</div><p>No deals found that both teams would take. Try asking for different players.</p></div>';
    return `<div class="ft-finds">${UI.header('TRADE FINDER', 'Deals the ' + esc(UI.teamName(deal.partner)) + ' would consider')}
      ${finds.list.map((t, i) => `<div class="ft-find">
        <div class="ft-find-cols"><div><div class="ft-k">YOU SEND</div>${assetList(st, t, deal.user)}</div>
        <div><div class="ft-k">YOU GET</div>${assetList(st, t, deal.partner)}</div></div>
        <button type="button" class="btn btn-small" data-act="load" data-i="${i}">LOAD THIS DEAL</button></div>`).join('')}</div>`;
  }

  function offers(st) {
    return (st.events || []).map((e, i) => ({ e, i })).filter(x => x.e && x.e.type === 'tradeOffer' && !x.e.resolved);
  }
  const offerTrade = e => (e.offer && (e.offer.trade || (e.offer.give ? e.offer : null))) || (e.trade || null);
  function offerValid(st, tr) {
    if (!tr || !Array.isArray(tr.teams) || !tr.give) return false;
    return tr.teams.every(a => (tr.give[a] && tr.give[a].players || []).every(id => st.players[id] && st.players[id].team === a));
  }

  function tabs(st, on) {
    const n = offers(st).length;
    return `<nav class="tabs"><a href="#/trade${deal.partner ? '/' + esc(deal.partner) : ''}" class="${on === 'build' ? 'on' : ''}">BUILD A TRADE</a>
      <a href="#/trade/block" class="${on === 'block' ? 'on' : ''}">TRADING BLOCK${n ? ' (' + n + ')' : ''}</a></nav>`;
  }

  function renderBlock(app, st) {
    const list = offers(st);
    const user = st.userTeam;
    const cards = list.map(({ e, i }) => {
      const tr = offerTrade(e);
      const valid = offerValid(st, tr);
      const from = tr ? (tr.teams.find(a => a !== user) || tr.teams[0]) : (e.offer && e.offer.from) || '?';
      const msg = (e.offer && (e.offer.message || e.offer.text)) || e.text || '';
      return `<article class="ft-offer">
        <div class="ft-offer-head">${UI.logo(from, 44)}<div><div class="ft-k">OFFER FROM</div><div class="ft-t">${esc(UI.teamName(from))}</div></div></div>
        ${msg ? `<p class="ft-offer-msg">${esc(msg)}</p>` : ''}
        ${tr ? `<div class="ft-find-cols"><div><div class="ft-k">YOU SEND</div>${assetList(st, tr, user)}</div><div><div class="ft-k">YOU GET</div>${assetList(st, tr, from)}</div></div>` : '<p class="muted">This offer has no details.</p>'}
        ${valid ? '' : '<p class="ft-warn">This offer is no longer valid: a player in it has moved.</p>'}
        <div class="row-btns">
          <button type="button" class="btn btn-gold" data-act="accept" data-i="${i}" ${valid ? '' : 'disabled'}>ACCEPT</button>
          <button type="button" class="btn" data-act="decline" data-i="${i}">DECLINE</button>
          ${tr && valid ? `<button type="button" class="btn" data-act="counter" data-i="${i}">OPEN IN TRADE BUILDER</button>` : ''}
        </div></article>`;
    }).join('');
    const canShop = !!F.fn('TRADE', 'aiOffers') && !tradeClosed(st);
    app.innerHTML = `${UI.header('TRADES', 'Offers other teams have made for your players.')}
      ${tabs(st, 'block')}
      ${cards ? `<div class="ft-offers">${cards}</div>` : UI.empty('NO OFFERS RIGHT NOW', 'Teams send offers during the season, and the sim stops when one arrives. You can also shop your roster to see what comes back.', '')}
      <div class="row-btns">${canShop ? '<button type="button" class="btn" data-act="shop">SHOP MY ROSTER FOR OFFERS</button>' : ''}<a class="btn" href="#/trade">BUILD A TRADE</a></div>`;

    app.onclick = async ev => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const act = b.getAttribute('data-act'), i = Number(b.getAttribute('data-i'));
      const e = st.events[i];
      if (act === 'shop') {
        const T = F.fn('TRADE', 'aiOffers');
        const got = T ? F.try('TRADE.aiOffers', () => T.aiOffers(st, F.rng(st)), []) : [];
        (Array.isArray(got) ? got : []).forEach(o => st.events.push({ type: 'tradeOffer', offer: o }));
        UI.toast(got && got.length ? got.length + ' new offer' + (got.length > 1 ? 's' : '') + ' on the block.' : 'No team made an offer this time.');
        await F.save();
        renderBlock(app, st);
        return;
      }
      if (!e) return;
      if (act === 'counter') {
        const tr = offerTrade(e);
        const from = tr.teams.find(a => a !== st.userTeam);
        resetDeal(st.userTeam, from);
        tr.teams.forEach(a => { const g = tr.give[a] || {}; (g.players || []).forEach(id => deal.sel[a].players.add(id)); (g.picks || []).forEach(pk => deal.sel[a].picks.add(F.pickKey(pk))); });
        deal.keep = true;
        location.hash = '#/trade/' + from;
        return;
      }
      if (act === 'accept' || act === 'decline') {
        const tr = offerTrade(e);
        if (act === 'accept') {
          if (!F.fn('TRADE', 'execute')) { UI.toast('Trades are still being built, so this offer cannot be accepted yet.', 'error'); return; }
          const C = F.fn('CBA', 'validateTrade');
          const chk = C && tr ? F.try('CBA.validateTrade', () => C.validateTrade(st, tr), null) : null;
          if (chk && !chk.ok) { UI.toast('This trade no longer passes the CBA: ' + (chk.reasons || []).join(' '), 'error'); return; }
        }
        let ok = true, why = '';
        if (act === 'accept') {
          // Execute here (not through LEAGUE.resolveEvent) so a stale offer reports why it failed.
          const r = F.try('TRADE.execute', () => window.TRADE.execute(st, tr), { ok: false, reason: 'The trade module failed.' });
          ok = !(r && r.ok === false); why = r && r.reason ? r.reason : '';
        }
        e.resolved = true; e.answer = act === 'accept' ? (ok ? 'accept' : 'failed') : 'decline';
        const C2 = F.fn('LEAGUE', 'clearResolved');
        if (C2) F.try('LEAGUE.clearResolved', () => C2.clearResolved(st));
        else st.events = st.events.filter(x => !x.resolved);
        UI.toast(act === 'accept' ? (ok ? 'Trade complete. Saved.' : 'The trade could not be completed. ' + why) : 'Offer declined.', ok ? '' : 'error');
        await F.save();
        renderBlock(app, st);
      }
    };
  }

  function renderBuild(app, st, yr) {
    const user = st.userTeam, partner = deal.partner;
    const tr = buildTrade(st);
    const closed = tradeClosed(st);
    const sum = summary(st, tr, yr);
    const T = F.mod('TRADE');
    const canEval = !!F.fn('TRADE', 'evaluate');
    const canFind = !!F.fn('TRADE', 'finder');
    const teams = UI.teams().filter(t => t.abbr !== user && st.teams[t.abbr]);
    const propDis = closed || !canEval || !dealSize(tr) || !sum.cbaOk;

    app.innerHTML = `${UI.header('TRADES', esc(F.phaseName(st.phase)) + ' ' + esc(UI.fmtSeasonEnd(st.year)) + '. Pick players and picks on both sides, then propose.')}
      ${tabs(st, 'build')}
      ${closed ? `<div class="note">${esc(closed)}</div>` : ''}
      ${!T ? `<div class="note">The trade AI (<code>js/trade.js</code>) is still being built: you can sketch a deal here, but teams cannot answer yet.</div>` : ''}
      <div class="ft-bar">
        <label class="field ft-partner"><span>TRADE PARTNER</span>
          <select data-act="partner">${teams.map(t => `<option value="${esc(t.abbr)}" ${t.abbr === partner ? 'selected' : ''}>${esc(t.city + ' ' + t.name)}</option>`).join('')}</select></label>
        <div class="ft-bar-btns">
          <button type="button" class="btn btn-gold" data-act="propose" ${propDis ? 'disabled' : ''}>PROPOSE TRADE</button>
          <button type="button" class="btn" data-act="find" ${closed || !canFind ? 'disabled' : ''} title="Ask the AI for deals that work for both teams">TRADE FINDER</button>
          <button type="button" class="btn" data-act="clear" ${dealSize(tr) ? '' : 'disabled'}>CLEAR</button>
        </div>
      </div>
      <section class="ft-deal">
        <div class="ft-deal-cols"><div><div class="ft-k">${esc(user)} SENDS</div>${assetList(st, tr, user)}</div><div><div class="ft-k">${esc(partner)} SENDS</div>${assetList(st, tr, partner)}</div></div>
        ${sum.html}
        ${answerHtml()}
      </section>
      ${findsHtml(st)}
      <div class="ft-cols">${sideColumn(st, user, yr)}${sideColumn(st, partner, yr)}</div>`;

    app.onchange = ev => {
      const s = ev.target.closest('[data-act="partner"]');
      if (s) location.hash = '#/trade/' + s.value;
    };
    app.onclick = async ev => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled || b.tagName === 'SELECT') return;
      const act = b.getAttribute('data-act');
      if (act === 'toggle') {
        const side = b.getAttribute('data-side'), kind = b.getAttribute('data-kind'), id = b.getAttribute('data-id');
        const set = deal.sel[side][kind === 'pick' ? 'picks' : 'players'];
        if (set.has(id)) set.delete(id); else set.add(id);
        answer = null;
        renderBuild(app, st, yr);
      } else if (act === 'clear') {
        resetDeal(user, partner); renderBuild(app, st, yr);
      } else if (act === 'dismiss') {
        answer = null; renderBuild(app, st, yr);
      } else if (act === 'propose') {
        const E = F.fn('TRADE', 'evaluate');
        if (!E) return;
        try {
          const r = E.evaluate(st, buildTrade(st)) || {};
          answer = { accepts: !!r.accepts, message: r.message || '', margin: r.margin };
        } catch (e) { console.warn('TRADE.evaluate', e); answer = { error: 'The other GM could not look at this deal: ' + (e && e.message ? e.message : e) }; }
        renderBuild(app, st, yr);
      } else if (act === 'execute') {
        const X = F.fn('TRADE', 'execute');
        if (!X || !answer || !answer.accepts) return;
        const t = buildTrade(st);
        try {
          const r = X.execute(st, t);
          if (r && r.ok === false) throw new Error(r.reason || 'the trade module refused it');
          const names = t.give[partner].players.map(id => st.players[id] && st.players[id].name).filter(Boolean);
          resetDeal(user, partner);
          answer = { done: true, message: names.length ? 'Welcome ' + names.join(', ') + ' to the ' + UI.team(user).name + '.' : 'The deal is done.' };
          await F.save();
          UI.toast('Trade complete. Saved.');
        } catch (e) { console.warn('TRADE.execute', e); answer = { error: 'The trade could not be completed: ' + (e && e.message ? e.message : e) }; }
        renderBuild(app, st, yr);
      } else if (act === 'find') {
        const Fd = F.fn('TRADE', 'finder');
        if (!Fd) return;
        if (!deal.sel[partner].players.size) { finds = { error: 'Pick at least one ' + UI.team(partner).name + ' player you want, then run the trade finder. It builds packages from your side.', list: [] }; renderBuild(app, st, yr); return; }
        try {
          const r = Fd.finder(st, user, partner, Array.from(deal.sel[partner].players));
          const arr = Array.isArray(r) ? r : (r && Array.isArray(r.proposals) ? r.proposals : []);
          finds = { list: arr.map(x => (x && x.trade) || x).filter(x => x && x.give && Array.isArray(x.teams)).slice(0, 6) };
        } catch (e) { console.warn('TRADE.finder', e); finds = { error: 'The trade finder failed: ' + (e && e.message ? e.message : e), list: [] }; }
        renderBuild(app, st, yr);
      } else if (act === 'load') {
        const t = finds && finds.list[Number(b.getAttribute('data-i'))];
        if (!t) return;
        deal.sel = { [user]: blankSel(), [partner]: blankSel() };
        [user, partner].forEach(a => { const g = t.give[a] || {}; (g.players || []).forEach(id => deal.sel[a].players.add(id)); (g.picks || []).forEach(pk => deal.sel[a].picks.add(F.pickKey(pk))); });
        answer = null;
        renderBuild(app, st, yr);
        window.scrollTo(0, 0);
      }
    };
  }

  P.trade = function (app, arg) {
    app.onclick = null; app.onchange = null;
    const st = F.state();
    if (!st) { app.innerHTML = F.noLeague(); return; }
    const user = st.userTeam;
    if (arg === 'block') { if (!deal.user) resetDeal(user, deal.partner || null); renderBlock(app, st); return; }
    const want = arg && st.teams[arg.toUpperCase()] && arg.toUpperCase() !== user ? arg.toUpperCase() : null;
    let partner = want || (deal.user === user ? deal.partner : null);
    if (!partner || !st.teams[partner] || partner === user) partner = Object.keys(st.teams).filter(a => a !== user).sort()[0];
    if (deal.keep && deal.partner === partner && deal.user === user) deal.keep = false;
    else if (deal.user !== user || deal.partner !== partner) resetDeal(user, partner);
    renderBuild(app, st, F.capYear(st));
  };
})();
