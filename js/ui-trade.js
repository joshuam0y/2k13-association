// Trades page (#/trade, #/trade/<abbr>, #/trade/block, #/trade/offers) plus the small helpers shared by the
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
    let a = st.rngSeed >>> 0;
    return function () {   // mulberry32, as in js/league.js
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
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
  // "2013 1st (DAL, top 20 protected)"
  F.protText = function (pk) {
    const T = F.fn('TRADE', 'protectionText');
    if (T) return T.protectionText(pk && pk.protection, pk) || '';
    const pr = pk && pk.protection;
    if (!pr) return '';
    if (typeof pr === 'string') return pr;
    if (pr.top == null) return 'protected';
    return (+pr.top >= 30 ? 'fully protected' : 'top ' + pr.top + ' protected') + (pr.until != null ? ' through ' + pr.until : '');
  };
  F.pickLabel = function (pk) {
    if (!pk) return '';
    if (typeof pk === 'string') return pk;
    const T = F.fn('TRADE', 'pickText');
    if (T) return T.pickText(pk);
    const rd = pk.round === 1 ? '1st' : pk.round === 2 ? '2nd' : pk.round + 'th';
    const pr = F.protText(pk);
    return pk.year + ' ' + rd + ' (' + pk.original + (pr ? ', ' + pr : '') + ')';
  };

  F.mini = function (p, opts) {
    opts = opts || {};
    const ovr = p.ovr || 0;
    return `<span class="ft-hs">${UI.headshot(p)}</span>
      <span class="ft-main"><b class="ft-name">${esc(p.name)}</b>
        <span class="ft-meta">${opts.meta != null ? opts.meta : esc(p.pos || '') + ' | ' + esc(p.age || '-') + ' YRS'}</span></span>
      <span class="ft-ovr ${UI.ovrClass(ovr)}">${ovr}</span>`;
  };

  F.phaseName = ph => ({ preseason: 'Preseason', regular: 'Regular season', playoffs: 'Playoffs', draftLottery: 'Draft lottery',
    draft: 'Draft', resign: 'Re-signing', freeAgency: 'Free agency', training: 'Training camp' }[ph] || ph || '-');

  // ---------- trade page ----------
  // #/trade[/ABBR]: build a trade with one team. #/trade/block: the trading block and Find Trades.
  // #/trade/offers: offers AI teams have sent.
  let deal = { user: null, partner: null, sel: {} };
  let take = null;        // "what would it take" results: { pid, list, error }
  let done = null;        // last completed trade message
  let shopRes = null;     // trading block results: { key, list, error }

  function blankSel() { return { players: new Set(), picks: new Set() }; }
  function resetDeal(user, partner) { deal = { user, partner, sel: { [user]: blankSel(), [partner]: blankSel() } }; take = null; }

  function teamPicks(st, abbr) {
    const t = st.teams[abbr];
    const from = ['resign', 'freeAgency', 'training'].indexOf(st.phase) >= 0 ? st.year + 1 : st.year;   // the next draft
    return (t && Array.isArray(t.picks) ? t.picks : []).slice()
      .filter(pk => pk && (pk.year == null || pk.year >= from))
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
  const otherOf = (tr, a) => tr.teams.find(x => x !== a);

  function tradeClosed(st) {
    const playoffs = st.phase === 'playoffs' || (st.phase === 'regular' && st.season && st.season.phase === 'playoffs');
    if (playoffs) return 'Trades are closed during the playoffs.';
    const W = F.fn('TRADE', 'windowOpen');
    if (W && F.try('TRADE.windowOpen', () => W.windowOpen(st), true) === false) return 'The trade deadline has passed. Trades open again after the season.';
    return null;
  }

  // the CBA check and the salary numbers for each side
  function cbaCheck(st, tr) {
    if (!dealSize(tr)) return null;
    const C = F.fn('CBA', 'validateTrade'), V = F.fn('TRADE', 'validate');
    let r = null, v = null;
    try { if (C) r = C.validateTrade(st, tr); } catch (e) { r = { ok: false, reasons: ['Could not check this trade: ' + (e && e.message ? e.message : e)] }; }
    try { if (V) v = V.validate(st, tr); } catch (e) { v = null; }
    const reasons = [];
    [r, v].forEach(x => (x && x.reasons || []).forEach(m => { if (reasons.indexOf(m) < 0) reasons.push(m); }));
    const ok = (!r || r.ok) && (!v || v.ok);
    return { ok, reasons, teams: (r && r.teams) || {} };
  }

  function salaryHtml(st, tr, chk, yr) {
    const r = F.rules(yr);
    return `<div class="ftx-sal">${tr.teams.map(a => {
      const o = otherOf(tr, a);
      const info = chk && chk.teams && chk.teams[a];
      const out = info ? info.outgoing : tr.give[a].players.reduce((s, id) => s + F.salary(st.players[id], yr), 0);
      const inn = info ? info.incoming : tr.give[o].players.reduce((s, id) => s + F.salary(st.players[id], yr), 0);
      const after = info ? info.payrollAfter : F.payroll(st, a, yr) - out + inn;
      let allowed = info && info.allowed != null ? info.allowed : null;
      if (allowed == null && r && r.cap && after > r.cap && inn > out) allowed = out * 1.25 + 100000;
      const fits = allowed == null || inn <= allowed;
      const pct = allowed ? Math.min(100, Math.round(inn / Math.max(1, allowed) * 100)) : (inn ? 100 : 0);
      return `<div class="ftx-sal-team">
        <div class="ftx-sal-top">${UI.logo(a, 24)}<b>${esc(a)}</b><span class="ftx-ok ${fits ? 'win' : 'loss'}">${fits ? 'SALARY OK' : 'TOO MUCH SALARY'}</span></div>
        <div class="ftx-sal-row"><span>Sends</span><b>${F.money(out)}</b></div>
        <div class="ftx-sal-row"><span>Takes back</span><b>${F.money(inn)}</b></div>
        <div class="ftx-sal-row"><span>Can take back</span><b>${allowed == null ? (r && after <= r.cap ? 'Any (under the cap)' : 'Any') : F.money(allowed)}</b></div>
        ${allowed != null ? `<div class="ftx-meter"><i class="${fits ? '' : 'over'}" style="width:${pct}%"></i></div>` : ''}
        <div class="ftx-sal-row muted"><span>Payroll after</span><b>${F.money(after)}</b></div>
      </div>`;
    }).join('')}</div>`;
  }

  function assetList(st, tr, abbr, removable) {
    const g = tr.give[abbr] || { players: [], picks: [] };
    const items = [];
    (g.players || []).forEach(id => {
      const p = st.players[id];
      const x = removable ? `<button type="button" class="ftx-x" data-act="toggle" data-side="${esc(abbr)}" data-kind="player" data-id="${esc(id)}" aria-label="Remove">&times;</button>` : '';
      items.push(p ? `<li><b class="${UI.ovrClass(p.ovr || 0)}">${p.ovr || '-'}</b> <a href="#/player/${esc(p.id)}">${esc(p.name)}</a> <small>${esc(p.pos || '')} | ${esc(p.age || '-')} yrs | ${F.money(F.salary(p, F.capYear(st)))} | ${esc(F.contractText(p, st))}</small>${x}</li>` : `<li>${esc(id)}</li>`);
    });
    (g.picks || []).forEach(pk => {
      const x = removable ? `<button type="button" class="ftx-x" data-act="toggle" data-side="${esc(abbr)}" data-kind="pick" data-id="${esc(F.pickKey(pk))}" aria-label="Remove">&times;</button>` : '';
      items.push(`<li><b class="ft-pk">PICK</b> ${esc(F.pickLabel(pk))}${x}</li>`);
    });
    return items.length ? `<ul class="ft-assets">${items.join('')}</ul>` : '<p class="muted ft-nothing">Nothing yet</p>';
  }

  function tabs(st, on) {
    const n = offers(st).length;
    const blk = blockIds(st).length;
    return `<nav class="tabs"><a href="#/trade${deal.partner ? '/' + esc(deal.partner) : ''}" class="${on === 'build' ? 'on' : ''}">MAKE A TRADE</a>
      <a href="#/trade/block" class="${on === 'block' ? 'on' : ''}">TRADING BLOCK${blk ? ' (' + blk + ')' : ''}</a>
      <a href="#/trade/offers" class="${on === 'offers' ? 'on' : ''}">OFFERS${n ? ' (' + n + ')' : ''}</a></nav>`;
  }

  function doneHtml() {
    if (!done) return '';
    const h = `<div class="ft-answer ok"><div class="ft-k">TRADE COMPLETE</div><p>${esc(done)}</p>
      <div class="row-btns"><a class="btn btn-small" href="#/team/${esc(F.state() ? F.state().userTeam : '')}">SEE YOUR ROSTER</a><a class="btn btn-small" href="#/manage">ROTATION</a></div></div>`;
    done = null;
    return h;
  }

  // execute a trade after checking it again; returns an error message or null
  async function runTrade(st, tr) {
    if (!F.fn('TRADE', 'execute')) return 'The trade module has not loaded.';
    const closed = tradeClosed(st);
    if (closed) return closed;
    const chk = cbaCheck(st, tr);
    if (chk && !chk.ok) return 'This trade no longer works: ' + chk.reasons.join(' ');
    const E = F.fn('TRADE', 'evaluate');
    const ev = E ? F.try('TRADE.evaluate', () => E.evaluate(st, tr), null) : null;
    if (ev && !ev.accepts) return ev.message || 'They said no.';
    const r = F.try('TRADE.execute', () => window.TRADE.execute(st, tr), { ok: false, reason: 'The trade module failed.' });
    if (r && r.ok === false) return r.reason || 'The trade could not be completed.';
    const user = st.userTeam, partner = otherOf(tr, user);
    const got = (tr.give[partner].players || []).map(id => st.players[id] && st.players[id].name).filter(Boolean);
    const gone = (tr.give[user].players || []).map(id => st.players[id] && st.players[id].name).filter(Boolean);
    done = (gone.length ? gone.join(', ') + (gone.length > 1 ? ' are' : ' is') + ' headed to the ' + UI.team(partner).name + '. ' : '') +
      (got.length ? 'Welcome ' + got.join(', ') + ' to the ' + UI.team(user).name + '.' : 'The deal is done.');
    // the block drops anyone who left
    const t = st.teams[user];
    if (Array.isArray(t.tradeBlock)) t.tradeBlock = t.tradeBlock.filter(id => st.players[id] && st.players[id].team === user);
    shopRes = null; take = null;
    await F.save();
    UI.toast('Trade complete. Saved.');
    return null;
  }

  // ---------- make a trade ----------
  function sideColumn(st, abbr, yr) {
    const s = deal.sel[abbr];
    const players = F.teamPlayers(st, abbr);
    const picks = teamPicks(st, abbr);
    const isUser = abbr === deal.user;
    const rows = players.map(p => {
      const on = s.players.has(p.id);
      const stash = p.stashedUntil && p.stashedUntil > st.year ? ` | <span class="ft-stash">Overseas until ${p.stashedUntil}</span>` : '';
      const meta = `${esc(p.pos || '')} | ${esc(p.age || '-')} YRS | ${F.money(F.salary(p, yr))} | ${esc(F.contractText(p, st))}${stash} ${UI.injuryBadge(p)}`;
      const ask = isUser ? '' : `<button type="button" class="btn btn-small ftx-ask" data-act="take" data-id="${esc(p.id)}" title="Ask what the ${esc(UI.team(abbr).name)} want for him">WHAT WOULD IT TAKE</button>`;
      return `<div class="ftx-prow"><button type="button" class="ft-item${on ? ' on' : ''}" data-act="toggle" data-side="${esc(abbr)}" data-kind="player" data-id="${esc(p.id)}" aria-pressed="${on}">${F.mini(p, { meta })}</button>${ask}</div>`;
    }).join('');
    const prow = picks.map(pk => {
      const k = F.pickKey(pk), on = s.picks.has(k);
      const pr = F.protText(pk);
      return `<button type="button" class="ft-item ft-pick${on ? ' on' : ''}" data-act="toggle" data-side="${esc(abbr)}" data-kind="pick" data-id="${esc(k)}" aria-pressed="${on}">
        <span class="ft-pick-yr">${esc(pk.year)}<small>${pk.round === 1 ? '1ST' : '2ND'}</small></span>
        <span class="ft-main"><b class="ft-name">${esc(F.pickLabel(pk))}</b>
          <span class="ft-meta">${pk.original && pk.original !== abbr ? 'From ' + esc(UI.teamName(pk.original)) : 'Own pick'} | ${pr ? esc(pr) : 'Unprotected'}</span></span>
        ${UI.logo(pk.original || abbr, 28)}</button>`;
    }).join('');
    return `<section class="ft-side${isUser ? ' mine' : ''}">
      <div class="ft-side-head">${UI.logo(abbr, 44)}<div><div class="ft-k">${isUser ? 'YOUR TEAM' : 'THEIR TEAM'}</div>
        <div class="ft-t">${esc(UI.teamName(abbr))}</div>
        <div class="ft-sub">Payroll ${F.money(F.payroll(st, abbr, yr))} | ${players.length} players | ${esc(({ contend: 'Contending', rebuild: 'Rebuilding', neutral: 'Middle of the pack' })[st.teams[abbr].direction] || '')}</div></div></div>
      <div class="ft-group">PLAYERS</div>
      <div class="ft-list">${rows || '<p class="muted">No players.</p>'}</div>
      <div class="ft-group">DRAFT PICKS</div>
      <div class="ft-list">${prow || '<p class="muted">No tradable picks.</p>'}</div>
    </section>`;
  }

  function takeHtml(st) {
    if (!take) return '';
    const p = st.players[take.pid];
    const nm = p ? p.name : 'him';
    if (take.error) return `<div class="ft-answer bad"><div class="ft-k">WHAT WOULD IT TAKE</div><p>${esc(take.error)}</p></div>`;
    if (!take.list.length) return `<div class="ft-answer bad"><div class="ft-k">WHAT WOULD IT TAKE: ${esc(nm.toUpperCase())}</div><p>The ${esc(UI.team(deal.partner).name)} would not trade ${esc(nm)} for anything you have that fits the salary rules.</p></div>`;
    return `<div class="ftx-finds">${UI.header('WHAT WOULD IT TAKE: ' + esc(nm.toUpperCase()), 'Packages the ' + esc(UI.team(deal.partner).name) + ' would accept, cheapest for you first')}
      ${take.list.map((t, i) => offerCard(st, t, deal.partner, [`<button type="button" class="btn btn-gold btn-small" data-act="takeDo" data-i="${i}">MAKE THIS TRADE</button>`, `<button type="button" class="btn btn-small" data-act="takeLoad" data-i="${i}">EDIT IT</button>`])).join('')}</div>`;
  }

  function renderBuild(app, st, yr) {
    const user = st.userTeam, partner = deal.partner;
    const tr = buildTrade(st);
    const closed = tradeClosed(st);
    const chk = cbaCheck(st, tr);
    const E = F.fn('TRADE', 'evaluate');
    let ans = null;
    if (E && dealSize(tr) && !closed) ans = F.try('TRADE.evaluate', () => E.evaluate(st, tr), null);
    const who = UI.team(partner).name.toUpperCase();
    let verdict;
    if (!dealSize(tr)) verdict = `<div class="ftx-verdict"><div class="ft-k">${esc(who)}</div><p>Pick players or picks on both sides. Their answer shows up here as you go.</p></div>`;
    else if (closed) verdict = `<div class="ftx-verdict bad"><div class="ft-k">TRADES CLOSED</div><p>${esc(closed)}</p></div>`;
    else if (!ans) verdict = `<div class="ftx-verdict"><div class="ft-k">${esc(who)}</div><p>The trade AI has not loaded.</p></div>`;
    else verdict = `<div class="ftx-verdict ${ans.accepts ? 'ok' : 'bad'}"><div class="ftx-yes">${ans.accepts ? 'YES' : 'NO'}</div>
      <div><div class="ft-k">${esc(who)} ${ans.accepts ? 'WOULD ACCEPT' : 'SAY NO'}</div><p>${esc(ans.message || '')}</p></div>
      ${ans.accepts ? '<button type="button" class="btn btn-gold" data-act="execute">MAKE TRADE</button>' : ''}</div>`;
    const cbaHtml = chk ? (chk.ok ? '<div class="ft-cba ok"><b>CBA OK</b> Salaries and rosters work under the ' + esc(st.year - 1) + '-' + String(st.year).slice(2) + ' rules.</div>'
      : `<div class="ft-cba bad"><b>BREAKS THE RULES</b><ul>${chk.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`) : '';
    const teams = UI.teams().filter(t => t.abbr !== user && st.teams[t.abbr]);

    app.innerHTML = `${UI.header('TRADES', esc(F.phaseName(st.phase)) + ' ' + esc(UI.fmtSeasonEnd(st.year)) + '. Pick a team, click players and picks on both sides, and see their answer right away.')}
      ${tabs(st, 'build')}
      ${doneHtml()}
      ${closed ? `<div class="note">${esc(closed)}</div>` : ''}
      <div class="ft-bar">
        <label class="field ft-partner"><span>TRADE WITH</span>
          <select data-act="partner">${teams.map(t => `<option value="${esc(t.abbr)}" ${t.abbr === partner ? 'selected' : ''}>${esc(t.city + ' ' + t.name)}</option>`).join('')}</select></label>
        <div class="ft-bar-btns"><button type="button" class="btn" data-act="clear" ${dealSize(tr) ? '' : 'disabled'}>CLEAR</button></div>
      </div>
      <section class="ft-deal">
        <div class="ft-deal-cols"><div><div class="ft-k">YOU GIVE</div>${assetList(st, tr, user, true)}</div><div><div class="ft-k">YOU GET</div>${assetList(st, tr, partner, true)}</div></div>
        ${dealSize(tr) ? salaryHtml(st, tr, chk, yr) : ''}
        ${cbaHtml}
        ${verdict}
      </section>
      ${takeHtml(st)}
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
        renderBuild(app, st, yr);
      } else if (act === 'clear') {
        resetDeal(user, partner); renderBuild(app, st, yr);
      } else if (act === 'execute') {
        b.disabled = true;
        const err = await runTrade(st, buildTrade(st));
        if (err) UI.toast(err, 'error'); else resetDeal(user, partner);
        renderBuild(app, st, yr);
        window.scrollTo(0, 0);
      } else if (act === 'take') {
        const pid = b.getAttribute('data-id');
        const Fd = F.fn('TRADE', 'finder');
        if (!Fd) return;
        b.disabled = true; b.textContent = 'ASKING...';
        await new Promise(r => setTimeout(r, 20));
        try {
          const r = Fd.finder(st, user, partner, [pid]);
          const arr = Array.isArray(r) ? r : (r && Array.isArray(r.proposals) ? r.proposals : []);
          take = { pid, list: arr.map(x => (x && x.trade) || x).filter(x => x && x.give && Array.isArray(x.teams)).slice(0, 4) };
        } catch (e) { console.warn('TRADE.finder', e); take = { pid, list: [], error: 'Could not ask: ' + (e && e.message ? e.message : e) }; }
        renderBuild(app, st, yr);
        const el = app.querySelector('.ftx-finds, .ft-answer'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } else if (act === 'takeDo' || act === 'takeLoad') {
        const t = take && take.list[Number(b.getAttribute('data-i'))];
        if (!t) return;
        if (act === 'takeDo') {
          b.disabled = true;
          const err = await runTrade(st, t);
          if (err) UI.toast(err, 'error'); else resetDeal(user, partner);
        } else {
          deal.sel = { [user]: blankSel(), [partner]: blankSel() };
          [user, partner].forEach(a => { const g = t.give[a] || {}; (g.players || []).forEach(id => deal.sel[a].players.add(id)); (g.picks || []).forEach(pk => deal.sel[a].picks.add(F.pickKey(pk))); });
          take = null;
        }
        renderBuild(app, st, yr);
        window.scrollTo(0, 0);
      }
    };
  }

  // ---------- offer cards (trading block results, finder results, AI offers) ----------
  function offerCard(st, tr, from, buttons, note) {
    const user = st.userTeam;
    const chk = cbaCheck(st, tr);
    const yr = F.capYear(st);
    const sumOf = a => ((tr.give[a] && tr.give[a].players) || []).reduce((s, id) => s + F.salary(st.players[id], yr), 0);
    const out = sumOf(user), inn = sumOf(from);
    return `<article class="ft-offer">
      <div class="ft-offer-head">${UI.logo(from, 44)}<div><div class="ft-k">${note ? esc(note) : 'OFFER FROM'}</div><div class="ft-t">${esc(UI.teamName(from))}</div></div></div>
      <div class="ft-find-cols"><div><div class="ft-k">YOU GIVE</div>${assetList(st, tr, user)}</div><div><div class="ft-k">YOU GET</div>${assetList(st, tr, from)}</div></div>
      <p class="ftx-offer-sal">Salary: you send ${F.money(out)}, take back ${F.money(inn)}${chk ? (chk.ok ? ' | <span class="win">CBA OK</span>' : ' | <span class="loss">' + esc(chk.reasons[0] || 'breaks the rules') + '</span>') : ''}</p>
      <div class="row-btns">${buttons.join('')}</div></article>`;
  }

  // ---------- trading block ----------
  function blockIds(st) {
    const t = st.teams[st.userTeam];
    if (!t || !Array.isArray(t.tradeBlock)) return [];
    return t.tradeBlock.filter(id => st.players[id] && st.players[id].team === st.userTeam);
  }

  function renderBlock(app, st) {
    const user = st.userTeam, team = st.teams[user];
    const block = blockIds(st);
    const closed = tradeClosed(st);
    const canShop = !!F.fn('TRADE', 'shop');
    const yr = F.capYear(st);
    const key = block.slice().sort().join(',');
    if (shopRes && shopRes.key !== key) shopRes = null;
    const roster = F.teamPlayers(st, user).map(p => {
      const on = block.indexOf(p.id) >= 0;
      const meta = `${esc(p.pos || '')} | ${esc(p.age || '-')} YRS | ${F.money(F.salary(p, yr))} | ${esc(F.contractText(p, st))} ${UI.injuryBadge(p)}`;
      return `<button type="button" class="ft-item ftx-blk${on ? ' on' : ''}" data-act="block" data-id="${esc(p.id)}" aria-pressed="${on}">${F.mini(p, { meta })}<span class="ftx-tag">${on ? 'ON THE BLOCK' : 'ADD'}</span></button>`;
    }).join('');
    const names = block.map(id => st.players[id].name);
    let results = '';
    if (shopRes && shopRes.error) results = `<div class="ft-answer bad"><div class="ft-k">FIND TRADES</div><p>${esc(shopRes.error)}</p></div>`;
    else if (shopRes && !shopRes.list.length) results = `<div class="ft-answer bad"><div class="ft-k">NO OFFERS</div><p>No team wants to give anything for ${esc(names.join(' and '))} that fits the salary rules. Try a different player.</p></div>`;
    else if (shopRes) results = `${UI.header('OFFERS FOR ' + esc(names.join(', ').toUpperCase()), shopRes.list.length + ' teams answered, best offer for you first. Every one of these is legal and the other team will say yes.')}
      <div class="ft-offers">${shopRes.list.map((o, i) => offerCard(st, o.trade, o.from, [
        `<button type="button" class="btn btn-gold" data-act="shopDo" data-i="${i}">ACCEPT</button>`,
        `<button type="button" class="btn" data-act="shopEdit" data-i="${i}">EDIT IN TRADE SCREEN</button>`], i === 0 ? 'BEST OFFER' : 'OFFER ' + (i + 1))).join('')}</div>`;

    app.innerHTML = `${UI.header('TRADES', 'Put players on the block, then ask every team what they would give.')}
      ${tabs(st, 'block')}
      ${doneHtml()}
      ${closed ? `<div class="note">${esc(closed)}</div>` : ''}
      <section class="ft-deal ftx-blockbar">
        <div><div class="ft-k">ON THE BLOCK</div>
          <p class="ftx-blocknames">${block.length ? names.map(esc).join(', ') : '<span class="muted">Nobody yet. Click players below to add them.</span>'}</p></div>
        <div class="row-btns"><button type="button" class="btn btn-gold" data-act="shop" ${!block.length || closed || !canShop ? 'disabled' : ''}>FIND TRADES</button>
          ${block.length ? '<button type="button" class="btn" data-act="blockClear">CLEAR BLOCK</button>' : ''}</div>
      </section>
      <div id="ftxResults">${results}</div>
      ${UI.header('YOUR ROSTER', 'Click a player to put him on the block or take him off.')}
      <div class="ft-list ftx-blocklist">${roster}</div>`;
    app.onchange = null;
    app.onclick = async ev => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const act = b.getAttribute('data-act');
      if (act === 'block') {
        const id = b.getAttribute('data-id');
        const cur = blockIds(st);
        team.tradeBlock = cur.indexOf(id) >= 0 ? cur.filter(x => x !== id) : cur.concat([id]);
        F.save();
        renderBlock(app, st);
      } else if (act === 'blockClear') {
        team.tradeBlock = []; shopRes = null; F.save(); renderBlock(app, st);
      } else if (act === 'shop') {
        b.disabled = true; b.textContent = 'ASKING ALL 29 TEAMS...';
        await new Promise(r => setTimeout(r, 30));
        try {
          const list = window.TRADE.shop(st, user, blockIds(st)) || [];
          shopRes = { key, list: list.filter(o => o && o.trade && o.from) };
        } catch (e) { console.warn('TRADE.shop', e); shopRes = { key, list: [], error: 'Could not ask the other teams: ' + (e && e.message ? e.message : e) }; }
        renderBlock(app, st);
        const el = UI.$('#ftxResults', app); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } else if (act === 'shopDo' || act === 'shopEdit') {
        const o = shopRes && shopRes.list[Number(b.getAttribute('data-i'))];
        if (!o) return;
        if (act === 'shopEdit') {
          resetDeal(user, o.from);
          o.trade.teams.forEach(a => { const g = o.trade.give[a] || {}; (g.players || []).forEach(id => deal.sel[a].players.add(id)); (g.picks || []).forEach(pk => deal.sel[a].picks.add(F.pickKey(pk))); });
          deal.keep = true;
          location.hash = '#/trade/' + o.from;
          return;
        }
        b.disabled = true;
        const err = await runTrade(st, o.trade);
        if (err) { UI.toast(err, 'error'); shopRes = null; }
        renderBlock(app, st);
        window.scrollTo(0, 0);
      }
    };
  }

  // ---------- offers AI teams sent ----------
  function offers(st) {
    return (st.events || []).map((e, i) => ({ e, i })).filter(x => x.e && x.e.type === 'tradeOffer' && !x.e.resolved);
  }
  const offerTrade = e => (e.offer && (e.offer.trade || (e.offer.give ? e.offer : null))) || (e.trade || null);
  function offerValid(st, tr) {
    if (!tr || !Array.isArray(tr.teams) || !tr.give) return false;
    return tr.teams.every(a => (tr.give[a] && tr.give[a].players || []).every(id => st.players[id] && st.players[id].team === a));
  }

  function renderOffers(app, st) {
    const user = st.userTeam;
    const cards = offers(st).map(({ e, i }) => {
      const tr = offerTrade(e);
      const valid = offerValid(st, tr);
      const from = tr ? (tr.teams.find(a => a !== user) || tr.teams[0]) : (e.offer && e.offer.from) || '?';
      if (!tr || !valid) return `<article class="ft-offer"><div class="ft-offer-head">${UI.logo(from, 44)}<div><div class="ft-k">OFFER FROM</div><div class="ft-t">${esc(UI.teamName(from))}</div></div></div>
        <p class="ft-warn">This offer is no longer valid: a player in it has moved.</p><div class="row-btns"><button type="button" class="btn" data-act="decline" data-i="${i}">DISMISS</button></div></article>`;
      return offerCard(st, tr, from, [`<button type="button" class="btn btn-gold" data-act="accept" data-i="${i}">ACCEPT</button>`,
        `<button type="button" class="btn" data-act="decline" data-i="${i}">DECLINE</button>`,
        `<button type="button" class="btn" data-act="counter" data-i="${i}">EDIT IN TRADE SCREEN</button>`]);
    }).join('');
    app.innerHTML = `${UI.header('TRADES', 'Offers other teams have sent you during the season.')}
      ${tabs(st, 'offers')}
      ${doneHtml()}
      ${cards ? `<div class="ft-offers">${cards}</div>` : UI.empty('NO OFFERS RIGHT NOW', 'Teams send offers during the season, and the sim stops when one arrives. To shop a player yourself, use the trading block.', '<div class="row-btns"><a class="btn btn-gold" href="#/trade/block">TRADING BLOCK</a></div>')}`;
    app.onchange = null;
    app.onclick = async ev => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const act = b.getAttribute('data-act'), e = st.events[Number(b.getAttribute('data-i'))];
      if (!e) return;
      const tr = offerTrade(e);
      if (act === 'counter') {
        const from = tr.teams.find(a => a !== st.userTeam);
        resetDeal(st.userTeam, from);
        tr.teams.forEach(a => { const g = tr.give[a] || {}; (g.players || []).forEach(id => deal.sel[a].players.add(id)); (g.picks || []).forEach(pk => deal.sel[a].picks.add(F.pickKey(pk))); });
        deal.keep = true;
        e.resolved = true; e.answer = 'decline';
        clearEvents(st);
        await F.save();
        location.hash = '#/trade/' + from;
        return;
      }
      let err = null;
      if (act === 'accept') err = await runTrade(st, tr);
      e.resolved = true; e.answer = act === 'accept' ? (err ? 'failed' : 'accept') : 'decline';
      clearEvents(st);
      if (err) UI.toast('The trade could not be completed. ' + err, 'error');
      else if (act === 'decline') UI.toast('Offer declined.');
      await F.save();
      renderOffers(app, st);
    };
  }
  function clearEvents(st) {
    const C2 = F.fn('LEAGUE', 'clearResolved');
    if (C2) F.try('LEAGUE.clearResolved', () => C2.clearResolved(st));
    else st.events = st.events.filter(x => !x.resolved);
  }

  P.trade = function (app, arg) {
    app.onclick = null; app.onchange = null;
    const st = F.state();
    if (!st) { app.innerHTML = F.noLeague(); return; }
    const user = st.userTeam;
    if (deal.user !== user) resetDeal(user, null);
    if (arg === 'block') { renderBlock(app, st); return; }
    if (arg === 'offers') { renderOffers(app, st); return; }
    const want = arg && st.teams[arg.toUpperCase()] && arg.toUpperCase() !== user ? arg.toUpperCase() : null;
    let partner = want || deal.partner;
    if (!partner || !st.teams[partner] || partner === user) partner = Object.keys(st.teams).filter(a => a !== user).sort()[0];
    if (deal.keep && deal.partner === partner && deal.user === user) deal.keep = false;
    else if (deal.partner !== partner) resetDeal(user, partner);
    if (!deal.sel[partner]) deal.sel[partner] = blankSel();
    if (!deal.sel[user]) deal.sel[user] = blankSel();
    renderBuild(app, st, F.capYear(st));
  };
})();
