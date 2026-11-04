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

  var ROOKIES = {
    windowOf: windowOf, list: list, rowFor: rowFor, canDecline: canDecline, decline: decline, stash: stash,
    apply: apply, markDone: markDone, pending: pending, released: released, preview: preview,
    draftYear: draftYear, dealYear: dealYear, money: money
  };

  if (root) root.ROOKIES = ROOKIES;
  if (typeof module !== 'undefined' && module.exports) module.exports = ROOKIES;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
