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
  // holder: the team that holds the pick. Current-draft picks read "2013 #7 (from DET)" once the order is known.
  F.pickLabel = function (pk, holder) {
    if (!pk) return '';
    if (typeof pk === 'string') return pk;
    const L = F.fn('TRADE', 'pickLabel'), st = L ? F.state() : null;
    if (L && st) { const t = F.try('TRADE.pickLabel', () => L.pickLabel(st, pk, holder), ''); if (t) return t; }
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

  // styles for the pieces this file and the draft room add (kept here: no CSS file of our own)
  F.css = function (id, text) {
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id; el.textContent = text;
    document.head.appendChild(el);
  };
  F.css('ftx-extra-css', `
    .ftx-dl { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 10px 14px; margin: 0 0 14px; border: 1px solid var(--line2); border-left: 3px solid var(--gold); background: var(--bg2); font-size: 13px; }
    .ftx-dl b { font-family: var(--display); letter-spacing: .08em; color: var(--gold2); }
    .ftx-dl.closed { border-left-color: #b24a4a; }
    .ftx-dl.closed b { color: #ff9b9b; }
    .ftx-dl.hot b { color: #fff; }
    .ftx-dl small { color: var(--muted); }
    .ftx-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; margin-left: 6px; border-radius: 9px; background: var(--gold); color: #000; font-size: 11px; font-weight: 700; line-height: 1; vertical-align: middle; }
    .ftx-ba { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 12px 0; }
    .ftx-ba-team { border: 1px solid var(--line); background: var(--bg2); padding: 10px 12px; min-width: 0; }
    .ftx-ba-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-family: var(--display); letter-spacing: .06em; }
    .ftx-ba table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .ftx-ba th { text-align: right; color: var(--muted); font-weight: 400; font-size: 11px; letter-spacing: .08em; padding: 2px 4px; }
    .ftx-ba th:first-child, .ftx-ba td:first-child { text-align: left; }
    .ftx-ba td { text-align: right; padding: 3px 4px; border-top: 1px solid var(--line); white-space: nowrap; }
    .ftx-ba td.up { color: #ff9b9b; } .ftx-ba td.down { color: #7fd99a; }
    .ftx-ba td.bad { color: #ff9b9b; font-weight: 700; }
    .ftx-tag2 { display: inline-block; font-size: 10px; letter-spacing: .08em; padding: 1px 5px; border: 1px solid var(--line2); color: var(--text2); margin-left: 4px; white-space: nowrap; }
    .ftx-tradebtn { display: inline-block; margin-left: 6px; padding: 1px 7px; border: 1px solid var(--gold-dim); color: var(--gold2); font-family: var(--display); font-size: 11px; letter-spacing: .1em; text-decoration: none; white-space: nowrap; }
    .ftx-tradebtn:hover { background: var(--gold); color: #000; }
    .ftx-pkrow { display: flex; gap: 6px; align-items: stretch; }
    .ftx-pkrow > .ft-item { flex: 1 1 auto; min-width: 0; }
    .ftx-more { margin-top: 6px; font-size: 13px; }
    .ftx-also { margin: 10px 0 0; padding: 6px 10px; border-left: 3px solid var(--gold); background: rgba(212, 175, 55, .08); font-size: 13px; color: var(--text2); }
    .ftx-also b { color: #fff; }
    .ftx-addtag { display: inline-block; margin-left: 6px; padding: 0 5px; background: var(--gold); color: #000; font-family: var(--display); font-size: 10px; letter-spacing: .1em; white-space: nowrap; }
    .ftx-kind { display: inline-block; margin-left: 8px; padding: 1px 6px; border: 1px solid var(--line2); color: var(--text2); font-size: 10px; letter-spacing: .1em; font-family: var(--display); vertical-align: middle; }
    @media (max-width: 700px) { .ftx-ba { grid-template-columns: minmax(0, 1fr); } }
  `);

  F.phaseName = ph => ({ preseason: 'Preseason', regular: 'Regular season', playoffs: 'Playoffs', draftLottery: 'Draft lottery',
    draft: 'Draft', resign: 'Re-signing', freeAgency: 'Free agency', training: 'Training camp' }[ph] || ph || '-');

  // ---------- trade page ----------
  // #/trade[/ABBR]: build a trade with one team. #/trade/block: the trading block and Find Trades.
  // #/trade/offers: offers AI teams have sent.
  let deal = { user: null, partner: null, sel: {} };
  let take = null;        // "what would it take" results: { pid, list, error }
  let done = null;        // last completed trade message
  let shopRes = null;     // trading block results: { key, list, error }
  let noTradeLink = false; // finder results: the player is already the target, no extra TRADE link

  function blankSel() { return { players: new Set(), picks: new Set() }; }
  function resetDeal(user, partner) { deal = { user, partner, sel: { [user]: blankSel(), [partner]: blankSel() } }; take = null; }

  // the live draft slot a pick stands for (draft night), or null
  function liveSlot(st, pk, abbr) {
    const S = F.fn('TRADE', 'slotForEntry');
    return S ? F.try('TRADE.slotForEntry', () => S.slotForEntry(st, pk, abbr), null) : null;
  }
  function teamPicks(st, abbr) {
    const t = st.teams[abbr];
    const from = ['resign', 'freeAgency', 'training'].indexOf(st.phase) >= 0 ? st.year + 1 : st.year;   // the next draft
    const U = F.fn('TRADE', 'pickUsed');
    const no = pk => { const s = liveSlot(st, pk, abbr); return s ? s.overall : 999; };
    return (t && Array.isArray(t.picks) ? t.picks : []).slice()
      .filter(pk => pk && (pk.year == null || pk.year >= from))
      .filter(pk => !(U && F.try('TRADE.pickUsed', () => U.pickUsed(st, pk, abbr), false)))   // picks already made tonight
      .sort((a, b) => (a.year - b.year) || (a.round - b.round) || (no(a) - no(b)) || String(a.original).localeCompare(String(b.original)));
  }
  function pickHolder(st, key) {
    return Object.keys(st.teams).find(a => (st.teams[a].picks || []).some(pk => F.pickKey(pk) === key)) || null;
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

  function deadlineInfo(st) {
    const D = F.fn('TRADE', 'deadline');
    return D ? F.try('TRADE.deadline', () => D.deadline(st), null) : null;
  }
  // real NBA rule: no trades from the deadline until the playoffs are over
  function tradeClosed(st) {
    const dl = deadlineInfo(st);
    if (dl && !dl.open) return 'The trade deadline (' + dl.label + ') has passed. Trades reopen after the playoffs.';
    const playoffs = st.phase === 'playoffs' || (st.phase === 'regular' && st.season && st.season.phase === 'playoffs');
    if (playoffs) return 'Trades reopen after the playoffs.';
    const W = F.fn('TRADE', 'windowOpen');
    if (W && F.try('TRADE.windowOpen', () => W.windowOpen(st), true) === false) return 'The trade deadline has passed. Trades reopen after the playoffs.';
    return null;
  }
  const liveDraftOn = st => { const L = F.fn('TRADE', 'liveDraft'); return !!(L && st.phase === 'draft' && F.try('TRADE.liveDraft', () => L.liveDraft(st), null)); };
  function deadlineBar(st) {
    const dl = deadlineInfo(st);
    const closed = tradeClosed(st);
    if (closed) return `<div class="ftx-dl closed" id="ftxDeadline"><b>TRADES CLOSED</b><span>${esc(closed)}</span></div>`;
    if (!dl) return '';
    const hot = dl.status === 'deadline' || (dl.daysLeft != null && dl.daysLeft <= 14);
    const extra = liveDraftOn(st) ? '<small>Draft night: tonight\'s picks show their slot. Trade up, trade down, or deal a rookie right after you pick him. <a href="#/draft">Back to the draft room</a></small>' : '';
    return `<div class="ftx-dl${hot ? ' hot' : ''}" id="ftxDeadline"><b>${esc(dl.text)}</b>${extra}</div>`;
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

  function rosterNow(st, abbr, yr) {
    const C = F.fn('CBA', 'rosterCount');
    if (C) { const v = F.try('CBA.rosterCount', () => C.rosterCount(st, abbr, yr), null); if (typeof v === 'number') return v; }
    return F.teamPlayers(st, abbr).filter(p => !(p.stashedUntil && p.stashedUntil > st.year) && !(p.contract && p.contract.twoWay)).length;
  }
  const countsOnRoster = (st, p) => p && !(p.stashedUntil && p.stashedUntil > st.year) && !(p.contract && p.contract.twoWay);
  // both teams' cap situation and roster count, before and after the trade
  function beforeAfterHtml(st, tr, chk, yr) {
    const r = F.rules(yr) || {};
    const inSeason = OFFSEASON.indexOf(st.phase) < 0;
    const maxR = inSeason ? (r.rosterMax || 15) : (r.offseasonRosterMax || 20), minR = inSeason ? (r.rosterMin || 13) : 0;
    const capTxt = pay => !r.cap ? '-' : pay <= r.cap ? F.money(r.cap - pay) + ' room' : F.money(pay - r.cap) + ' over';
    const taxTxt = pay => !r.tax ? '-' : pay <= r.tax ? F.money(r.tax - pay) + ' under' : F.money(pay - r.tax) + ' over';
    return `<div class="ftx-ba" id="ftxBA">${tr.teams.map(a => {
      const o = otherOf(tr, a), info = chk && chk.teams && chk.teams[a];
      const out = tr.give[a].players.reduce((s, id) => s + F.salary(st.players[id], yr), 0);
      const inn = tr.give[o].players.reduce((s, id) => s + F.salary(st.players[id], yr), 0);
      const before = info && info.payrollBefore != null ? info.payrollBefore : F.payroll(st, a, yr);
      const after = info && info.payrollAfter != null ? info.payrollAfter : before - out + inn;
      const rb = rosterNow(st, a, yr);
      const ra = info && info.rosterAfter != null ? info.rosterAfter
        : rb - tr.give[a].players.filter(id => countsOnRoster(st, st.players[id])).length + tr.give[o].players.filter(id => countsOnRoster(st, st.players[id])).length;
      const dir = after > before ? 'up' : after < before ? 'down' : '';
      const rBad = (ra > maxR && ra > rb) || (inSeason && ra < minR && ra < rb);
      return `<div class="ftx-ba-team">
        <div class="ftx-ba-top">${UI.logo(a, 22)}<b>${esc(a)}</b>${a === st.userTeam ? '<span class="ftx-tag2">YOU</span>' : ''}</div>
        <table><thead><tr><th></th><th>BEFORE</th><th>AFTER</th></tr></thead><tbody>
          <tr><td>Payroll</td><td>${F.money(before)}</td><td class="${dir}">${F.money(after)}</td></tr>
          <tr><td>Salary cap</td><td>${capTxt(before)}</td><td>${capTxt(after)}</td></tr>
          <tr><td>Luxury tax</td><td>${taxTxt(before)}</td><td class="${r.tax && after > r.tax && before <= r.tax ? 'bad' : ''}">${taxTxt(after)}</td></tr>
          <tr><td>Roster</td><td>${rb}</td><td class="${rBad ? 'bad' : ''}">${ra}${inSeason ? ' of ' + maxR : ''}</td></tr>
        </tbody></table></div>`;
    }).join('')}</div>`;
  }

  function assetList(st, tr, abbr, removable, mark) {
    const g = tr.give[abbr] || { players: [], picks: [] };
    const items = [];
    (g.players || []).forEach(id => {
      const p = st.players[id];
      const x = removable ? `<button type="button" class="ftx-x" data-act="toggle" data-side="${esc(abbr)}" data-kind="player" data-id="${esc(id)}" aria-label="Remove">&times;</button>` : '';
      const tb = !removable && !noTradeLink && p && p.team !== st.userTeam && st.teams[p.team] ? `<a class="ftx-tradebtn" href="#/trade/for/${esc(p.id)}" title="Build a new trade for him">TRADE</a>` : '';
      const add = mark && mark === id ? '<span class="ftx-addtag">THEY ALSO WANT</span>' : '';
      items.push(p ? `<li><b class="${UI.ovrClass(p.ovr || 0)}">${p.ovr || '-'}</b> <a href="#/player/${esc(p.id)}">${esc(p.name)}</a>${add} <small>${esc(p.pos || '')} | ${esc(p.age || '-')} yrs | ${F.money(F.salary(p, F.capYear(st)))} | ${esc(F.contractText(p, st))}</small>${tb}${x}</li>` : `<li>${esc(id)}</li>`);
    });
    (g.picks || []).forEach(pk => {
      const x = removable ? `<button type="button" class="ftx-x" data-act="toggle" data-side="${esc(abbr)}" data-kind="pick" data-id="${esc(F.pickKey(pk))}" aria-label="Remove">&times;</button>` : '';
      items.push(`<li><b class="ft-pk">PICK</b> ${esc(F.pickLabel(pk, abbr))}${mark && mark === F.pickKey(pk) ? '<span class="ftx-addtag">THEY ALSO WANT</span>' : ''}${x}</li>`);
    });
    return items.length ? `<ul class="ft-assets">${items.join('')}</ul>` : '<p class="muted ft-nothing">Nothing yet</p>';
  }

  function tabs(st, on) {
    const n = offers(st).length;
    const blk = blockIds(st).length;
    return `<nav class="tabs"><a href="#/trade${deal.partner ? '/' + esc(deal.partner) : ''}" class="${on === 'build' ? 'on' : ''}">MAKE A TRADE</a>
      <a href="#/trade/block" class="${on === 'block' ? 'on' : ''}">TRADING BLOCK${blk ? ' (' + blk + ')' : ''}</a>
      <a href="#/trade/offers" class="${on === 'offers' ? 'on' : ''}">OFFERS${n ? '<span class="ftx-badge" id="ftxOfferBadge">' + n + '</span>' : ''}</a></nav>`;
  }

  function doneHtml() {
    if (!done) return '';
    const h = `<div class="ft-answer ok"><div class="ft-k">TRADE COMPLETE</div><p>${esc(done)}</p>
      <div class="row-btns">${F.state() && F.state().phase === 'draft' ? '<a class="btn btn-small btn-gold" href="#/draft">BACK TO THE DRAFT</a>' : ''}<a class="btn btn-small" href="#/team/${esc(F.state() ? F.state().userTeam : '')}">SEE YOUR ROSTER</a><a class="btn btn-small" href="#/manage">ROTATION</a></div></div>`;
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
    {
      const u = st.userTeam, pt = otherOf(tr, u);
      const sideList = a => [].concat((tr.give[a].players || []).map(id => st.players[id] ? st.players[id].name + ' (' + st.players[id].ovr + ')' : null),
        (tr.give[a].picks || []).map(pk => (pk && pk.year ? F.pickLabel(pk, a) : 'a draft pick') + ' pick')).filter(Boolean);
      const give = sideList(u), get = sideList(pt);
      if (give.length && !get.length) return 'You would get nothing back. Add a player or pick from the ' + UI.team(pt).name + ' side.';
      if (typeof UI.choose === 'function') {
        const c = await UI.choose({ title: 'CONFIRM TRADE', text: 'You give: ' + (give.join(', ') || 'nothing') + '. You get: ' + (get.join(', ') || 'nothing') + '.',
          buttons: [{ value: 'yes', label: 'Make the trade', gold: true }, { value: 'no', label: 'Cancel' }] });
        if (!c || c.value !== 'yes') return 'Trade cancelled.';
      }
    }
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
      const ls = liveSlot(st, pk, abbr);
      const meta = ls ? `${ls.round === 1 ? 'Round 1' : 'Round 2'}, pick ${ls.overall} tonight${ls.original && ls.original !== abbr ? ' | From ' + esc(UI.teamName(ls.original)) : ''}`
        : `${pk.original && pk.original !== abbr ? 'From ' + esc(UI.teamName(pk.original)) : 'Own pick'} | ${pr ? esc(pr) : 'Unprotected'}`;
      const ask = isUser ? '' : `<button type="button" class="btn btn-small ftx-ask" data-act="takePick" data-id="${esc(k)}" title="Ask what the ${esc(UI.team(abbr).name)} want for this pick">WHAT WOULD IT TAKE</button>`;
      return `<div class="ftx-prow"><button type="button" class="ft-item ft-pick${on ? ' on' : ''}" data-act="toggle" data-side="${esc(abbr)}" data-kind="pick" data-id="${esc(k)}" aria-pressed="${on}">
        <span class="ft-pick-yr">${ls ? '#' + esc(ls.overall) : esc(pk.year)}<small>${ls ? esc(pk.year) : pk.round === 1 ? '1ST' : '2ND'}</small></span>
        <span class="ft-main"><b class="ft-name">${esc(F.pickLabel(pk, abbr))}</b>
          <span class="ft-meta">${meta}</span></span>
        ${UI.logo(pk.original || abbr, 28)}</button>${ask}</div>`;
    }).join('');
    return `<section class="ft-side${isUser ? ' mine' : ''}">
      <div class="ft-side-head">${UI.logo(abbr, 44)}<div><div class="ft-k">${isUser ? 'YOUR TEAM' : 'THEIR TEAM'}</div>
        <div class="ft-t">${esc(UI.teamName(abbr))}</div>
        <div class="ft-sub">Payroll ${F.money(F.payroll(st, abbr, yr))} | ${rosterNow(st, abbr, yr)} on the roster | ${esc(({ contend: 'Contending', rebuild: 'Rebuilding', neutral: 'Middle of the pack' })[st.teams[abbr].direction] || '')}</div></div></div>
      <div class="ft-group">PLAYERS</div>
      <div class="ft-list">${rows || '<p class="muted">No players.</p>'}</div>
      <div class="ft-group">DRAFT PICKS</div>
      <div class="ft-list">${prow || '<p class="muted">No tradable picks.</p>'}</div>
    </section>`;
  }

  function takeHtml(st) {
    if (!take) return '';
    const p = take.pid ? st.players[take.pid] : null;
    const pk = take.pick ? pickObj(st, deal.partner, take.pick) : null;
    const nm = p ? p.name : pk ? 'the ' + F.pickLabel(pk, deal.partner) + ' pick' : take.pick ? 'that pick' : 'him';
    if (take.error) return `<div class="ft-answer bad"><div class="ft-k">WHAT WOULD IT TAKE</div><p>${esc(take.error)}</p></div>`;
    if (!take.list.length) return `<div class="ft-answer bad"><div class="ft-k">WHAT WOULD IT TAKE: ${esc(nm.toUpperCase())}</div><p>The ${esc(UI.team(deal.partner).name)} would not trade ${esc(nm)} for anything you have that fits the salary rules.</p></div>`;
    noTradeLink = true;
    const cards = take.list.map((t, i) => offerCard(st, t, deal.partner, [`<button type="button" class="btn btn-gold btn-small" data-act="takeDo" data-i="${i}">MAKE THIS TRADE</button>`, `<button type="button" class="btn btn-small" data-act="takeLoad" data-i="${i}">EDIT IT</button>`], 'PACKAGE ' + (i + 1), (take.meta && take.meta[i]) || {})).join('');
    noTradeLink = false;
    return `<div class="ftx-finds">${UI.header('WHAT WOULD IT TAKE: ' + esc(nm.toUpperCase()), 'Packages the ' + esc(UI.team(deal.partner).name) + ' would accept')}
      ${cards}</div>`;
  }

  // after a deep link (#/trade/for/<id>, #/trade/pick/<key>): the target, one click from the finder
  function focusHtml(st) {
    const f = deal.focus;
    if (!f || take || tradeClosed(st)) return '';
    let what = '', act = '';
    if (f.kind === 'player') {
      const p = st.players[f.id];
      if (!p || p.team !== deal.partner) return '';
      what = p.name; act = `data-act="take" data-id="${esc(p.id)}"`;
    } else if (f.kind === 'pick') {
      const pk = pickObj(st, deal.partner, f.id);
      if (!pk) return '';
      what = 'the ' + F.pickLabel(pk, deal.partner) + ' pick'; act = `data-act="takePick" data-id="${esc(f.id)}"`;
    } else return '';
    return `<div class="ftx-verdict" id="ftxFocus"><div><div class="ft-k">TARGET: ${esc(what.toUpperCase())}</div><p>Already in the deal. Add what you would give, or ask the ${esc(UI.team(deal.partner).name)} what it would take.</p></div>
      <button type="button" class="btn btn-gold" ${act}>WHAT WOULD IT TAKE</button></div>`;
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
    const youGet = tr.give[partner] ? (tr.give[partner].players || []).length + (tr.give[partner].picks || []).length : 0;
    const youGive = tr.give[user] ? (tr.give[user].players || []).length + (tr.give[user].picks || []).length : 0;
    if (!dealSize(tr)) verdict = `<div class="ftx-verdict"><div class="ft-k">${esc(who)}</div><p>Pick players or picks on both sides. Their answer shows up here as you go.</p></div>`;
    else if (youGive && !youGet) verdict = `<div class="ftx-verdict bad"><div class="ft-k">YOU GET NOTHING BACK</div><p>Add at least one player or pick from the ${esc(UI.team(partner).name)} side. Trades that give players away for nothing are blocked.</p></div>`;
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
      ${deadlineBar(st)}
      ${doneHtml()}
      ${focusHtml(st)}
      <div class="ft-bar">
        <label class="field ft-partner"><span>TRADE WITH</span>
          <select data-act="partner">${teams.map(t => `<option value="${esc(t.abbr)}" ${t.abbr === partner ? 'selected' : ''}>${esc(t.city + ' ' + t.name)}</option>`).join('')}</select></label>
        <div class="ft-bar-btns"><button type="button" class="btn" data-act="clear" ${dealSize(tr) ? '' : 'disabled'}>CLEAR</button></div>
      </div>
      <section class="ft-deal">
        <div class="ft-deal-cols"><div><div class="ft-k">YOU GIVE</div>${assetList(st, tr, user, true)}</div><div><div class="ft-k">YOU GET</div>${assetList(st, tr, partner, true)}</div></div>
        ${dealSize(tr) ? beforeAfterHtml(st, tr, chk, yr) + salaryHtml(st, tr, chk, yr) : ''}
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
      } else if (act === 'take' || act === 'takePick') {
        const id = b.getAttribute('data-id');
        const pid = act === 'take' ? id : null, pkey = act === 'takePick' ? id : null;
        const Fd = F.fn('TRADE', 'finder');
        if (!Fd) return;
        b.disabled = true; b.textContent = 'ASKING...';
        await new Promise(r => setTimeout(r, 20));
        try {
          const pk = pkey ? pickObj(st, partner, pkey) : null;
          const r = pid ? Fd.finder(st, user, partner, [pid]) : pk ? Fd.finder(st, user, partner, [], { wantPicks: [pk] }) : [];
          const arr = Array.isArray(r) ? r : (r && Array.isArray(r.proposals) ? r.proposals : []);
          const ok = arr.filter(x => { const t = (x && x.trade) || x; return t && t.give && Array.isArray(t.teams); }).slice(0, 5);
          take = { pid, pick: pkey, list: ok.map(x => x.trade || x), meta: ok.map(x => (x && x.trade ? { kindLabel: x.kindLabel, fair: x.fair } : {})) };
        } catch (e) { console.warn('TRADE.finder', e); take = { pid, pick: pkey, list: [], error: 'Could not ask: ' + (e && e.message ? e.message : e) }; }
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
  function offerCard(st, tr, from, buttons, note, meta) {
    meta = meta || {};
    const user = st.userTeam;
    const chk = cbaCheck(st, tr);
    const yr = F.capYear(st);
    const sumOf = a => ((tr.give[a] && tr.give[a].players) || []).reduce((s, id) => s + F.salary(st.players[id], yr), 0);
    const out = sumOf(user), inn = sumOf(from);
    const ex = meta.extra || null;
    const mark = ex ? (ex.kind === 'player' ? ex.id : F.pickKey(ex.pick)) : null;
    const also = ex ? `<p class="ftx-also">They also want: <b>${esc(ex.name)}</b>. This bigger deal needs one more of your assets, not only the block.</p>` : '';
    return `<article class="ft-offer${ex ? ' ftx-bigger' : ''}">
      <div class="ft-offer-head">${UI.logo(from, 44)}<div><div class="ft-k">${note ? esc(note) : 'OFFER FROM'}${meta.kindLabel ? `<span class="ftx-kind">${esc(String(meta.kindLabel).toUpperCase())}</span>` : ''}</div><div class="ft-t">${esc(UI.teamName(from))}</div></div></div>
      <div class="ft-find-cols"><div><div class="ft-k">YOU GIVE</div>${assetList(st, tr, user, false, mark)}</div><div><div class="ft-k">YOU GET</div>${assetList(st, tr, from)}</div></div>
      ${also}
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
    else if (shopRes) results = `${UI.header('OFFERS FOR ' + esc(names.join(', ').toUpperCase()), shopRes.list.length + ' offers from ' + new Set(shopRes.list.map(o => o.from)).size + ' teams, by team. Some build a bigger deal and ask for one more of your players or picks. Each is legal and the other team will say yes: the rest is up to you.')}
      <div class="ft-offers">${shopRes.list.map((o, i) => offerCard(st, o.trade, o.from, [
        `<button type="button" class="btn btn-gold" data-act="shopDo" data-i="${i}">ACCEPT</button>`,
        `<button type="button" class="btn" data-act="shopEdit" data-i="${i}">EDIT IN TRADE SCREEN</button>`], o.extra ? 'BIGGER DEAL' : 'OFFER FROM', { kindLabel: o.kindLabel, extra: o.extra })).join('')}</div>`;

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
          // shown by team (no ranking, so the offers keep their suspense), plain offers before bigger deals
          const nm = a => UI.teamName(a);
          shopRes = { key, list: list.filter(o => o && o.trade && o.from).sort((a, b) => nm(a.from).localeCompare(nm(b.from)) || (!!a.extra - !!b.extra)) };
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
      const o = e.offer || {};
      const asked = !!o.askedMore;
      const note = o.improved ? 'IMPROVED OFFER: THEY ADDED ' + String(o.improved).toUpperCase() : asked ? 'THEIR BEST OFFER' : 'OFFER FROM';
      const more = F.fn('TRADE', 'askForMore') ? `<button type="button" class="btn" data-act="more" data-i="${i}" ${asked || tradeClosed(st) ? 'disabled' : ''} title="Ask them to add a pick or a player">${asked ? 'ASKED FOR MORE' : 'ASK FOR MORE'}</button>` : '';
      return offerCard(st, tr, from, [`<button type="button" class="btn btn-gold" data-act="accept" data-i="${i}">ACCEPT</button>`,
        more,
        `<button type="button" class="btn" data-act="decline" data-i="${i}">DECLINE</button>`,
        `<button type="button" class="btn" data-act="counter" data-i="${i}">EDIT IN TRADE SCREEN</button>`], note, { kindLabel: o.kindLabel });
    }).join('');
    app.innerHTML = `${UI.header('TRADES', 'Offers other teams have sent you. Accept, ask for more (once per offer), or decline.')}
      ${tabs(st, 'offers')}
      ${deadlineBar(st)}
      ${doneHtml()}
      ${cards ? `<div class="ft-offers">${cards}</div>` : UI.empty('NO OFFERS RIGHT NOW', 'Teams send offers during the season, and the sim stops when one arrives. To shop a player yourself, use the trading block.', '<div class="row-btns"><a class="btn btn-gold" href="#/trade/block">TRADING BLOCK</a></div>')}`;
    app.onchange = null;
    app.onclick = async ev => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const act = b.getAttribute('data-act'), e = st.events[Number(b.getAttribute('data-i'))];
      if (!e) return;
      const tr = offerTrade(e);
      if (act === 'more') {
        const A = F.fn('TRADE', 'askForMore');
        if (!A || !tr) return;
        const from = tr.teams.find(a => a !== st.userTeam);
        b.disabled = true; b.textContent = 'ASKING...';
        await new Promise(r => setTimeout(r, 20));
        const r = F.try('TRADE.askForMore', () => A.askForMore(st, tr, from), null);
        if (!e.offer || typeof e.offer !== 'object') e.offer = { trade: tr };
        e.offer.askedMore = true;
        if (r && r.trade) {
          if (e.offer.trade || !e.offer.give) e.offer.trade = r.trade; else e.offer = { trade: r.trade, askedMore: true, from };
          if (e.trade) e.trade = r.trade;
          e.offer.improved = r.addedText;
          e.offer.text = r.text;
          e.offer.message = 'The ' + UI.team(from).name + ' added ' + r.addedText + '. ' + r.text;
          UI.toast(r.message || 'They added more.');
        } else UI.toast('The ' + UI.team(from).name + ' say this is their best offer.');
        await F.save();
        renderOffers(app, st);
        return;
      }
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

  // Deep links: #/trade/with/<ABBR>, #/trade/for/<playerId>, #/trade/pick/<year-round-original>
  // (someone else's pick) and #/trade/give/<year-round-original>[/<ABBR>] (one of yours). Each one
  // preloads the deal and returns the partner abbr, or null when the link is not one of these.
  function deepLink(st, arg) {
    const parts = arg.split('/'), kind = parts[0], val = parts[1];
    if (['with', 'for', 'pick', 'give'].indexOf(kind) < 0 || !val) return null;
    const user = st.userTeam;
    const firstOther = () => (deal.partner && deal.partner !== user && st.teams[deal.partner]) ? deal.partner : Object.keys(st.teams).filter(a => a !== user).sort()[0];
    let partner = null;
    if (kind === 'with') {
      partner = val.toUpperCase();
      if (!st.teams[partner] || partner === user) return null;
      if (deal.partner !== partner) resetDeal(user, partner);
    } else if (kind === 'for') {
      const p = st.players[val];
      if (!p || p.retired || !st.teams[p.team]) { UI.toast((p ? p.name : 'That player') + ' is not on an NBA team.', 'error'); return null; }
      if (p.team === user) {
        partner = firstOther();
        if (deal.partner !== partner) resetDeal(user, partner);
        deal.sel[user].players.add(p.id);
      } else {
        partner = p.team;
        resetDeal(user, partner);
        deal.sel[partner].players.add(p.id);
        deal.focus = { kind: 'player', id: p.id };
      }
    } else if (kind === 'pick') {
      const holder = pickHolder(st, val);
      if (!holder) { UI.toast('Nobody holds that pick any more.', 'error'); return null; }
      if (holder === user) return deepLink(st, 'give/' + val);
      partner = holder;
      resetDeal(user, partner);
      deal.sel[partner].picks.add(val);
      deal.focus = { kind: 'pick', id: val };
    } else if (kind === 'give') {
      if (!pickObj(st, user, val)) { UI.toast('You no longer hold that pick.', 'error'); return null; }
      const to = parts[2] && st.teams[parts[2].toUpperCase()] && parts[2].toUpperCase() !== user ? parts[2].toUpperCase() : firstOther();
      partner = to;
      if (deal.partner !== partner) resetDeal(user, partner);
      deal.sel[user].picks.add(val);
    }
    deal.keep = true;
    return partner;
  }

  P.trade = function (app, arg) {
    app.onclick = null; app.onchange = null;
    const st = F.state();
    if (!st) { app.innerHTML = F.noLeague(); return; }
    const user = st.userTeam;
    if (deal.user !== user) resetDeal(user, null);
    if (arg === 'block') { renderBlock(app, st); return; }
    if (arg === 'offers') { renderOffers(app, st); return; }
    const link = deepLink(st, String(arg || ''));
    if (link) {
      // the deep link has done its job: the plain team route stays in the address bar
      try { history.replaceState(null, '', location.pathname + location.search + '#/trade/' + link); } catch (e) { /* ignore */ }
      arg = link;
    }
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
