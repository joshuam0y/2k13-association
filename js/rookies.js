// Rookie signing: window.ROOKIES (and module.exports under Node).
// DRAFT.signRookies signs every pick when the draft ends (first round: rookie scale at 120%, team
// options in years 3 and 4; second round: two minimum seasons; picks with a later arrivalYear stay
// overseas unsigned). This step lets a team undo that for the players it just drafted, before the
// season starts:
//   list(state, abbr)                 this draft's picks the team holds: the deal, the cap hit, what it may do
//   decline(state, abbr, id)          he becomes a free agent with no contract (a stashed pick: his rights go)
//   stash(state, abbr, id)            a second-rounder's deal is dropped and he plays a season overseas
//   apply(state, abbr, choices)       { id: 'sign' | 'decline' | 'stash' } in one go, then marks the step done
//   preview(state, abbr, choices)     roster count, payroll and cap room after those choices
//   pending(state, abbr)              true while the team has picks to decide and has not been through the step
// Nothing changes unless one of these is called: skipping the step keeps every rookie signed.
// Draft rights overseas, all year (any draft year, rights players from before 2013 too):
//   rights(state, abbr)               every player the team holds abroad: drafted where, arrival season, the deal he would sign
//   canBringOver / bringOver(state, abbr, id)   offseason only (draft to training camp), with a roster spot:
//                                     he signs the deal DRAFT.signRookies gives an arriving stash and joins the roster
//   releaseRights(state, abbr, id)    he becomes a free agent, still overseas until his arrival season
(function (root) {
  'use strict';

  var OPEN = { resign: 1, freeAgency: 1, training: 1 };
  var MAX_ROSTER = 15;

  function mod(name) {
    if (root && root[name]) return root[name];
    return null;
  }
  function teamName(state, abbr) {
    var t = state.teams && state.teams[abbr];
    return t ? ((t.city ? t.city + ' ' : '') + (t.name || abbr)) : abbr;
  }
  function money(x) { return '$' + ((+x || 0) / 1e6).toFixed(2) + 'M'; }
  function ordinal(round) { return round === 1 ? 'first-round' : round === 2 ? 'second-round' : 'round ' + round; }
  // The draft whose picks are decided now (the offseason after it), and the season their deals start.
  function draftYear(state) { return state.draft && state.draft.year != null ? +state.draft.year : +state.year; }
  function dealYear(state) { return draftYear(state) + 1; }

  // Open from the end of the draft until the season starts.
  function windowOf(state) {
    if (!state || !state.players) return { open: false, reason: 'No league loaded.' };
    var ph = state.phase;
    if (OPEN[ph] && draftYear(state) === +state.year) return { open: true };
    if (ph === 'draftLottery' || ph === 'draft') return { open: false, reason: 'Rookie contracts are offered once the draft is over.' };
    return { open: false, reason: 'The rookie signing window closed when the season started.' };
  }

  function record(state) {
    var D = draftYear(state), r = state.rookieSigning;
    if (!r || r.year !== D) r = state.rookieSigning = { year: D, done: false, declined: [], stashed: [] };
    r.declined = r.declined || []; r.stashed = r.stashed || [];
    return r;
  }

  // The deal DRAFT.signRookies gave him for this draft, untouched since (no extension, no free agent deal).
  function freshDeal(p, D) {
    var c = p.contract;
    if (!c || !Array.isArray(c.salaries) || !c.salaries.length || c.twoWay || c.via) return false;
    if (c.signedYear !== D && c.signedYear !== D + 1) return false;
    return +c.salaries[0].year === D + 1;
  }
  function isAway(p, D) { return p.stashedUntil != null && +p.stashedUntil > D + 1; }

  // One row of the rookie signing screen. Potential is never part of it.
  function rowFor(state, p) {
    var D = draftYear(state);
    if (!p || p.retired || !p.draft || +p.draft.year !== D) return null;
    var away = isAway(p, D);
    if (!away && !freshDeal(p, D)) return null;
    var c = p.contract || {}, sal = away ? [] : c.salaries.map(function (s) { return { year: s.year, amount: s.amount }; });
    var opts = (c.options || (c.option ? [c.option] : [])).filter(function (o) { return o && o.type === 'team'; }).map(function (o) { return o.year; });
    var round = +p.draft.round || 2;
    return {
      id: p.id, name: p.name, pos: p.pos || '', age: p.age || null, ovr: p.ovr || 0,
      round: round, pick: +p.draft.pick || null, status: away ? 'stashed' : 'signed',
      salaries: sal, years: sal.length, first: sal.length ? sal[0].amount : 0,
      total: sal.reduce(function (t, s) { return t + s.amount; }, 0), teamOptions: away ? [] : opts, rookieScale: !away && !!c.rookie,
      capHit: away ? 0 : (sal[0] && sal[0].year === D + 1 ? sal[0].amount : 0),
      until: away ? +p.stashedUntil : null, away: away && p.injury ? p.injury.type || null : null,
      canStash: !away && round >= 2, firstRound: round === 1
    };
  }

  function list(state, abbr) {
    abbr = abbr || state.userTeam;
    var out = [];
    Object.keys(state.players || {}).forEach(function (id) {
      var p = state.players[id];
      if (!p || p.team !== abbr) return;
      var r = rowFor(state, p);
      if (r) out.push(r);
    });
    return out.sort(function (a, b) { return (a.pick || 99) - (b.pick || 99); });
  }

  // -> { ok, reason, row }
  function check(state, abbr, id) {
    var w = windowOf(state);
    if (!w.open) return { ok: false, reason: w.reason };
    var p = state.players[id];
    if (!p) return { ok: false, reason: 'No such player.' };
    if (p.team !== abbr) return { ok: false, reason: p.name + ' is not on the ' + teamName(state, abbr) + '.' };
    var row = rowFor(state, p);
    if (!row) return { ok: false, reason: p.name + ' is not one of your unsigned or newly signed ' + draftYear(state) + ' draft picks.' };
    return { ok: true, row: row };
  }
  function canDecline(state, abbr, id) { return check(state, abbr || state.userTeam, id); }

  function log(state, type, text, id) {
    state.transactions = state.transactions || [];
    state.transactions.push({ year: state.year, day: state.fa ? state.fa.day : (state.day || 0), type: type, text: text, ids: [id], offseason: state.fa ? state.fa.year : null });
  }
  // The "signed first-round pick" line DRAFT.signRookies wrote for him: the deal is off, so it goes.
  function dropSignLine(state, id) {
    var D = draftYear(state);
    state.transactions = (state.transactions || []).filter(function (t) {
      return !(t && t.type === 'sign' && t.year === D && t.ids && t.ids.length === 1 && t.ids[0] === id && /signed (first|second)-round pick /.test(t.text || ''));
    });
  }
  function clearDeal(p, contract) { p.contract = contract; p.salary = 0; p.contractEnd = null; }

  // He becomes a free agent with no contract and no dead money (the deal was never played).
  // A pick who is still overseas stays there: his rights go and he is a free agent when he comes over.
  function decline(state, abbr, id) {
    abbr = abbr || state.userTeam;
    var c = check(state, abbr, id);
    if (!c.ok) return c;
    var p = state.players[id], row = c.row;
    clearDeal(p, null);
    p.team = 'FA'; p.lastTeam = abbr; p.yearsWithTeam = 0;
    if (state.fa && state.fa.rights && state.fa.rights[id]) delete state.fa.rights[id];
    dropSignLine(state, id);
    var r = record(state);
    if (r.declined.indexOf(id) < 0) r.declined.push(id);
    r.stashed = r.stashed.filter(function (x) { return x !== id; });
    var pk = row.pick ? ' (pick ' + row.pick + ')' : '';
    log(state, 'release', row.status === 'stashed'
      ? teamName(state, abbr) + ' give up the draft rights to ' + ordinal(row.round) + ' pick ' + p.name + pk + '; he becomes a free agent when he comes over in ' + row.until + '.'
      : teamName(state, abbr) + ' decline to sign ' + ordinal(row.round) + ' pick ' + p.name + pk + '; he becomes a free agent.', id);
    return { ok: true, message: p.name + (row.status === 'stashed' ? ': draft rights released.' : ' is now a free agent.') };
  }

  // A second-rounder skips next season overseas: no contract now, DRAFT.signRookies signs him when he arrives.
  function stash(state, abbr, id) {
    abbr = abbr || state.userTeam;
    var c = check(state, abbr, id);
    if (!c.ok) return c;
    if (!c.row.canStash) return { ok: false, reason: c.row.status === 'stashed' ? c.row.name + ' is already overseas.' : 'Only second-round picks can be stashed overseas.' };
    var p = state.players[id], D = draftYear(state);
    clearDeal(p, { salaries: [], option: null, rookie: false, twoWay: false, signedYear: null });
    p.stashedUntil = D + 2;
    p.injury = { type: 'Playing overseas', games: 999 };
    dropSignLine(state, id);
    var r = record(state);
    if (r.stashed.indexOf(id) < 0) r.stashed.push(id);
    log(state, 'draft', teamName(state, abbr) + ' keep the draft rights to ' + ordinal(c.row.round) + ' pick ' + p.name + (c.row.pick ? ' (pick ' + c.row.pick + ')' : '') + ', who plays overseas until ' + (D + 2) + '.', id);
    return { ok: true, message: p.name + ' stays overseas for a season. You keep his rights.' };
  }

  // choices: { id: 'sign' | 'decline' | 'stash' }; ids left out are signed (nothing changes for them).
  function apply(state, abbr, choices) {
    abbr = abbr || state.userTeam;
    var w = windowOf(state);
    if (!w.open) return { ok: false, reason: w.reason, declined: [], stashed: [], errors: [] };
    var out = { ok: true, declined: [], stashed: [], errors: [] };
    Object.keys(choices || {}).forEach(function (id) {
      var what = choices[id];
      if (what !== 'decline' && what !== 'stash') return;
      var r = what === 'decline' ? decline(state, abbr, id) : stash(state, abbr, id);
      if (r.ok) out[what === 'decline' ? 'declined' : 'stashed'].push(id);
      else out.errors.push({ id: id, reason: r.reason });
    });
    if (abbr === state.userTeam) record(state).done = true;
    out.ok = !out.errors.length;
    return out;
  }
  function markDone(state) { if (windowOf(state).open) record(state).done = true; }

  function pending(state, abbr) {
    abbr = abbr || state.userTeam;
    if (!windowOf(state).open) return false;
    var r = state.rookieSigning;
    if (r && r.year === draftYear(state) && r.done) return false;
    return list(state, abbr).length > 0;
  }

  // This summer's declined picks (for the screen's "released" list).
  function released(state) {
    var r = state.rookieSigning;
    if (!r || r.year !== draftYear(state)) return [];
    return (r.declined || []).map(function (id) { return state.players[id]; }).filter(Boolean);
  }

  // Cap numbers for the season the deals start, FA first (it counts pending offer sheets), then CBA.
  function payroll(state, abbr, year) {
    var F = mod('FA'), C = mod('CBA');
    if (F && typeof F.payroll === 'function') return F.payroll(state, abbr, year);
    if (C && typeof C.payroll === 'function') return C.payroll(state, abbr, year);
    return 0;
  }
  function rosterCount(state, abbr, year) {
    var F = mod('FA'), C = mod('CBA');
    if (F && typeof F.rosterCount === 'function') return F.rosterCount(state, abbr);
    if (C && typeof C.rosterCount === 'function') return C.rosterCount(state, abbr, year);
    return 0;
  }
  function capFor(year) {
    var F = mod('FA'), C = mod('CBA'), r = null;
    try { r = F && F.rules ? F.rules(year) : C && C.rules ? C.rules(year) : null; } catch (e) { r = null; }
    return r && r.cap ? r.cap : 0;
  }

  function preview(state, abbr, choices) {
    abbr = abbr || state.userTeam;
    choices = choices || {};
    var Y = dealYear(state), rows = list(state, abbr);
    var roster = rosterCount(state, abbr, Y), pay = payroll(state, abbr, Y), cap = capFor(Y), off = 0;
    rows.forEach(function (r) {
      var what = choices[r.id];
      if (r.status !== 'signed' || (what !== 'decline' && what !== 'stash') || (what === 'stash' && !r.canStash)) return;
      roster--; pay -= r.capHit; off++;
    });
    return { year: Y, roster: roster, maxRoster: MAX_ROSTER, payroll: pay, cap: cap, room: Math.max(0, cap - pay), overCap: cap > 0 && pay > cap, removed: off };
  }

  // ---------------------------------------------------------------------------
  // Draft rights overseas
  // ---------------------------------------------------------------------------
  var OFFSEASON = { draftLottery: 1, draft: 1, resign: 1, freeAgency: 1, training: 1 };
  var BRING = { draft: 1, resign: 1, freeAgency: 1, training: 1 };
  function seasonLabel(y) { return (y - 1) + '-' + String(y).slice(-2); }
  // The next season to be played: the coming one in the offseason, the current one during the season.
  function nextSeason(state) { return OFFSEASON[state.phase] ? +state.year + 1 : +state.year; }
  function hasDeal(p) { return !!(p.contract && Array.isArray(p.contract.salaries) && p.contract.salaries.length); }
  // Abroad: stashedUntil (the season-ending year of his first NBA season) still ahead, no NBA deal.
  // A redshirt pick (hurt, not abroad) is not one of them.
  function isOverseas(state, p) {
    return !!(p && !p.retired && p.stashedUntil != null && +p.stashedUntil > +state.year && !hasDeal(p) &&
      (!p.injury || /overseas/i.test(p.injury.type || '')));
  }

  function cbaRules(year) {
    var C = mod('CBA');
    try { return C && typeof C.rules === 'function' ? C.rules(year) : null; } catch (e) { return null; }
  }
  function capRatio(year) {
    var r = cbaRules(year);
    return r && r.cap ? r.cap / 58044000 : Math.pow(1.045, Math.max(0, year - 2013));
  }
  function minFor(yearsPro, year) {
    var r = cbaRules(year);
    if (r && typeof r.minSalary === 'function') {
      try { var v = +r.minSalary(yearsPro); if (v > 0) return v; } catch (e) { /* fall back */ }
    }
    return Math.round((yearsPro <= 0 ? 490180 : 762195) * capRatio(year));
  }
  // The deal an arriving pick signs: DRAFT.signRookies' signOne, copied here because js/draft.js does
  // not export it (first round: the rookie scale at 120%; otherwise two minimum seasons).
  function arrivalDeal(p, signYear) {
    var start = signYear + 1, C = mod('CBA'), cc = null, first = p.draft && +p.draft.round === 1;
    if (first && C && typeof C.rookieContract === 'function') {
      try { cc = C.rookieContract(p.draft.pick, start, 1.2); } catch (e) { cc = null; }
      if (!cc || !cc.salaries || !cc.salaries.length || cc.salaries.some(function (x) { return !(x.amount > 0); })) cc = null;
    }
    if (cc) { cc.rookie = true; cc.twoWay = false; return cc; }
    if (first) {
      var pk = +p.draft.pick || 15, a = (834000 + 2871000 * (0.5 * Math.exp(-(pk - 1) / 5) + 0.5 * (30 - pk) / 29)) * 1.2 * capRatio(start);
      var sal = [a, a * 1.047, a * 1.094, a * 1.094 * (1.26 + 0.35 * (pk - 1) / 29)].map(function (x, i) { return { year: start + i, amount: Math.round(x) }; });
      return { salaries: sal, option: { year: start + 3, type: 'team' }, rookie: true, twoWay: false, signedYear: signYear };
    }
    return { salaries: [{ year: start, amount: minFor(0, start) }, { year: start + 1, amount: minFor(1, start + 1) }], option: null, rookie: false, twoWay: false, signedYear: signYear };
  }
  // What he signs if he comes over in signYear's offseason, without changing anything. Rights players
  // (drafted before 2013) sign DRAFT.signRights' market deal, worked out on a copy.
  function offerFor(state, p, signYear) {
    var D = mod('DRAFT');
    if (p.rights && D && typeof D.signRights === 'function') {
      var q = JSON.parse(JSON.stringify(p)), tmp = Object.assign({}, state, { transactions: [] });
      try { q.stashedUntil = null; D.signRights(tmp, q, signYear); return q.contract; } catch (e) { return null; }
    }
    return arrivalDeal(p, signYear);
  }

  function rosterLimit(state, abbr) {
    var F = mod('FA');
    try { if (F && typeof F.rosterLimit === 'function') return F.rosterLimit(state, abbr); } catch (e) { /* default */ }
    return MAX_ROSTER;
  }
  function rightsCheck(state, abbr, id) {
    var p = state.players && state.players[id];
    if (!p) return { ok: false, reason: 'No such player.' };
    if (p.team !== abbr) return { ok: false, reason: p.name + ' is not on the ' + teamName(state, abbr) + '.' };
    if (!isOverseas(state, p)) return { ok: false, reason: p.name + ' is not playing overseas on your draft rights.' };
    return { ok: true, p: p };
  }
  function canBringOver(state, abbr, id) {
    abbr = abbr || state.userTeam;
    var c = rightsCheck(state, abbr, id);
    if (!c.ok) return c;
    if (!BRING[state.phase]) return { ok: false, reason: 'Players overseas can only come over in the offseason, from the draft to training camp.' };
    var n = rosterCount(state, abbr, +state.year + 1), lim = rosterLimit(state, abbr);
    if (n >= lim) return { ok: false, reason: 'Your roster is full (' + n + ' of ' + lim + '). Waive or trade a player before bringing ' + c.p.name + ' over.' };
    return { ok: true, p: c.p, roster: n, limit: lim };
  }

  function rightsRow(state, p, abbr) {
    var d = p.draft || {}, until = +p.stashedUntil, now = BRING[state.phase];
    var sy = now ? +state.year : until - 1, c = offerFor(state, p, sy) || { salaries: [] };
    var sal = (c.salaries || []).map(function (s) { return { year: s.year, amount: s.amount }; });
    var can = canBringOver(state, abbr, p.id);
    return {
      id: p.id, name: p.name, pos: p.pos || '', age: p.age || null, ovr: p.ovr || 0,
      draftYear: d.year != null ? +d.year : (p.draftYear != null ? +p.draftYear : null), round: +d.round || null, pick: +d.pick || null,
      draftedBy: d.team || null, until: until, arrives: seasonLabel(until), seasonsLeft: Math.max(0, until - nextSeason(state)),
      deal: { salaries: sal, years: sal.length, first: sal.length ? sal[0].amount : 0, total: sal.reduce(function (t, s) { return t + s.amount; }, 0),
        kind: c.via === 'rights' ? 'rights' : c.rookie ? 'rookie' : 'minimum', now: !!now },
      canBring: can.ok, bringReason: can.ok ? null : can.reason
    };
  }
  function rights(state, abbr) {
    abbr = abbr || state.userTeam;
    var out = [];
    Object.keys(state.players || {}).forEach(function (id) {
      var p = state.players[id];
      if (p && p.team === abbr && isOverseas(state, p)) out.push(rightsRow(state, p, abbr));
    });
    return out.sort(function (a, b) { return a.until - b.until || String(a.name).localeCompare(String(b.name)); });
  }
  function rightsCount(state, abbr) {
    abbr = abbr || state.userTeam;
    var n = 0;
    Object.keys(state.players || {}).forEach(function (id) { var p = state.players[id]; if (p && p.team === abbr && isOverseas(state, p)) n++; });
    return n;
  }
  function draftedText(p) {
    var d = p.draft;
    return d ? ' (' + d.year + ' ' + ordinal(+d.round) + ' pick ' + d.pick + ')' : '';
  }

  // He comes over now: no longer stashed, he signs the arriving stash's deal and counts on the roster.
  function bringOver(state, abbr, id) {
    abbr = abbr || state.userTeam;
    var c = canBringOver(state, abbr, id);
    if (!c.ok) return c;
    var p = c.p, until = +p.stashedUntil, signYear = +state.year, D = mod('DRAFT');
    p.stashedUntil = null;
    if (p.injury && /overseas/i.test(p.injury.type || '')) p.injury = null;
    // the same two routes as DRAFT.signRookies for an arriving stash
    if (p.rights && D && typeof D.signRights === 'function') D.signRights(state, p, signYear);
    else {
      var deal = arrivalDeal(p, signYear), sal = deal.salaries;
      p.contract = deal; p.salary = sal[0].amount; p.contractEnd = sal[sal.length - 1].year;
      log(state, 'sign', teamName(state, abbr) + ' signed ' + (p.draft && +p.draft.round === 1 ? 'first-round pick ' : 'second-round pick ') + p.name +
        ' (' + sal.length + ' years, ' + money(sal[0].amount) + ' first season).', id);
    }
    log(state, 'sign', p.name + (until > signYear + 1 ? ' comes over from overseas early to join the ' + teamName(state, abbr) + ' (he was due in ' + seasonLabel(until) + ').'
      : ' arrives from overseas to join the ' + teamName(state, abbr) + '.'), id);
    var s0 = p.contract.salaries[0];
    return { ok: true, message: p.name + ' signs (' + p.contract.salaries.length + ' years, ' + money(s0 ? s0.amount : 0) + ' first season) and joins your roster.' };
  }

  // He becomes a free agent and stays overseas until his arrival season, like a released stashed pick.
  function releaseRights(state, abbr, id) {
    abbr = abbr || state.userTeam;
    var c = rightsCheck(state, abbr, id);
    if (!c.ok) return c;
    var p = c.p, until = +p.stashedUntil;
    clearDeal(p, null);
    p.team = 'FA'; p.lastTeam = abbr; p.yearsWithTeam = 0;
    if (state.fa && state.fa.rights && state.fa.rights[id]) delete state.fa.rights[id];
    if (p.draft && +p.draft.year === draftYear(state) && windowOf(state).open) {
      var r = record(state);
      if (r.declined.indexOf(id) < 0) r.declined.push(id);
      r.stashed = r.stashed.filter(function (x) { return x !== id; });
    }
    log(state, 'release', teamName(state, abbr) + ' give up the draft rights to ' + p.name + draftedText(p) + '; he becomes a free agent when he comes over for ' + seasonLabel(until) + '.', id);
    return { ok: true, message: p.name + ': draft rights released.' };
  }

  var ROOKIES = {
    windowOf: windowOf, list: list, rowFor: rowFor, canDecline: canDecline, decline: decline, stash: stash,
    apply: apply, markDone: markDone, pending: pending, released: released, preview: preview,
    draftYear: draftYear, dealYear: dealYear, money: money,
    rights: rights, rightsCount: rightsCount, isOverseas: isOverseas, canBringOver: canBringOver, bringOver: bringOver, releaseRights: releaseRights,
    arrivalDeal: arrivalDeal, seasonLabel: seasonLabel
  };

  if (root) root.ROOKIES = ROOKIES;
  if (typeof module !== 'undefined' && module.exports) module.exports = ROOKIES;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
