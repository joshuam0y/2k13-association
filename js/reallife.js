// Real-life mode: the real trades, signings, releases and waiver claims (data/real-moves.js) happen on their
// real dates, as long as the players involved are where real life had them. A trade goes through only when
// every player in it is still on the team that traded him; a signing only when the player is a free agent.
// Moves that touch the user's team are left to the user. window.REALLIFE (module.exports under Node).
//   REALLIFE.applyUntil(state, date)   plays every real move after state.realCursor up to date (inclusive)
//   REALLIFE.dayBefore(date)           the ISO date one day earlier
(function (root) {
  'use strict';
  var W = root;
  function moves() { return (W && W.REAL_MOVES) || null; }
  function dayBefore(d) { var t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); }
  function seasonOf(d) { return +d.slice(0, 4) + (+d.slice(5, 7) >= 7 ? 1 : 0); }
  function teamName(state, a) { var t = state.teams[a]; return t ? (t.city + ' ' + t.name).trim() : a; }
  function onTeam(state, a) {
    var out = [];
    for (var id in state.players) { var p = state.players[id]; if (p.team === a && !p.retired && !(p.stashedUntil > state.year)) out.push(p); }
    return out;
  }
  function minFor(state, p, year) {
    var r = W.CBA && W.CBA.rules ? W.CBA.rules(year) : null;
    return (r && r.minSalary && r.minSalary(p.yearsPro || 0)) || 1100000;
  }
  function release(state, p, why) {
    p.team = 'FA'; p.yearsWithTeam = 0;
    p.contract = { salaries: [], option: null, options: [], rookie: false, twoWay: false, signedYear: null };
    if (why) log(state, 'release', why, [p.id]);
  }
  // keeps a team at 15: the lowest rated player who did not just arrive goes to free agency
  function trim(state, a, keep) {
    var list = onTeam(state, a);
    while (list.length > 15) {
      list.sort(function (x, y) { return (keep[x.id] ? 1 : 0) - (keep[y.id] ? 1 : 0) || x.ovr - y.ovr; });
      var p = list.shift();
      release(state, p, teamName(state, a) + ' release ' + p.name + ' to make room.');
    }
  }
  function log(state, type, text, ids) {
    if (state.transactions) state.transactions.push({ year: state.year, day: state.day || 0, type: type, text: text, ids: ids || [], real: true });
  }
  function news(state, head, body, ids) {
    if (W.NEWS && W.NEWS.item) { try { W.NEWS.item(state, 'trade', head, body, ids); return; } catch (e) { /* fall through */ } }
    if (state.news) state.news.unshift({ year: state.year, day: state.day || 0, headline: head, body: body || '', ids: ids || [] });
  }
  function sign(state, p, team, amounts, kind, date) {
    var first = seasonOf(date), sal = [];
    if (kind !== 1) (amounts || []).forEach(function (a, i) { sal.push({ year: first + i, amount: a }); });
    if (!sal.length) sal.push({ year: first, amount: minFor(state, p, first) });
    p.team = team; p.yearsWithTeam = 0; p.injury = p.injury && p.injury.type === 'Playing overseas' ? null : p.injury;
    p.contract = { salaries: sal, option: null, options: [], rookie: false, twoWay: kind === 2, signedYear: first, via: 'real' };
  }
  var usable = function (p) { return p && !p.retired && !p.gleague; };

  function applyOne(state, e) {
    var u = state.userTeam, P = state.players, kind = e[1];
    if (kind === 'T') {
      if (e[2].some(function (m) { return m[1] === u || m[2] === u || !state.teams[m[2]] && P[m[0]]; })) return false;
      // a player this league has moved somewhere else stops the trade; ones it no longer has (retired, out of
      // the league, a free agent who is not part of a sign-and-trade) just drop out of it
      var sat = seasonOf(e[0]) > state.year;
      // this year's draft picks went to other teams in this league: they drop out instead of stopping the trade
      var fresh = function (p) { return p && +p.draftYear >= seasonOf(e[0]) - 1 && !(p.yearsPro > 0); };
      if (e[2].some(function (m) { var p = P[m[0]]; return usable(p) && !fresh(p) && p.team !== m[1] && p.team !== m[2] && p.team !== 'FA' && p.team !== 'RET' && p.team !== 'DRAFT'; })) return false;
      var list = e[2].filter(function (m) { var p = P[m[0]]; return usable(p) && (p.team === m[1] || p.team === 'FA' && sat); });
      if (!list.some(function (m) { return !fresh(P[m[0]]); })) return false;   // only this summer's rookies left: not the real trade
      if (!list.length) return false;
      var keep = {}, teams = {};
      list.forEach(function (m) {
        var p = P[m[0]];
        if (p.team === 'FA') sign(state, p, m[2], null, 0, e[0]);   // sign-and-trade: a one-year deal at the least
        p.team = m[2]; p.yearsWithTeam = 0; keep[p.id] = true; teams[m[1]] = teams[m[2]] = true;
      });
      var names = Object.keys(teams);
      var text = list.map(function (m) { return P[m[0]].name + ' to ' + teamName(state, m[2]); }).join(', ');
      log(state, 'trade', 'Trade (real life): ' + text + '.', list.map(function (m) { return m[0]; }));
      news(state, 'Trade: ' + list.map(function (m) { return P[m[0]].name; }).slice(0, 3).join(', ') + (list.length > 3 ? ' and more' : '') + ' on the move', 'Real life: ' + text + '.', list.map(function (m) { return m[0]; }));
      names.forEach(function (a) { trim(state, a, keep); });
      return true;
    }
    if (kind === 'C') {
      var c = P[e[2]];
      if (!usable(c) || e[3] === u || e[4] === u || !state.teams[e[4]] || c.team !== e[3] && c.team !== 'FA') return false;
      c.team = e[4]; c.yearsWithTeam = 0;
      log(state, 'sign', teamName(state, e[4]) + ' claim ' + c.name + ' off waivers (real life).', [c.id]);
      var kc = {}; kc[c.id] = true; trim(state, e[4], kc);
      return true;
    }
    if (kind === 'W') {
      var w = P[e[2]];
      if (!usable(w) || e[3] === u || w.team !== e[3]) return false;
      release(state, w, teamName(state, e[3]) + ' waive ' + w.name + ' (real life).');
      return true;
    }
    if (kind === 'S') {
      var s = P[e[2]];
      if (!usable(s) || e[3] === u || !state.teams[e[3]] || s.team !== 'FA' || (s.stashedUntil && s.stashedUntil > seasonOf(e[0]))) return false;
      sign(state, s, e[3], e[4], e[5], e[0]);
      var big = s.contract.salaries.reduce(function (t, x) { return t + x.amount; }, 0);
      log(state, 'sign', teamName(state, e[3]) + ' sign ' + s.name + (e[5] === 1 ? ' to a 10-day contract' : e[5] === 2 ? ' to a two-way contract' : '') + ' (real life).', [s.id]);
      if (big >= 40e6) news(state, s.name + ' Signs With The ' + state.teams[e[3]].name, 'Real life: ' + s.contract.salaries.length + ' years, $' + Math.round(big / 1e6) + ' million.', [s.id]);
      var ks = {}; ks[s.id] = true; trim(state, e[3], ks);
      return true;
    }
    return false;
  }

  function applyUntil(state, date) {
    var R = moves();
    if (!state || !state.realLife || !R || !date) return 0;
    var from = state.realCursor || '0000-00-00';
    if (date <= from) return 0;
    var n = 0;
    // the moves are in date order: find the first after the cursor
    var lo = 0, hi = R.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (R[mid][0] <= from) lo = mid + 1; else hi = mid; }
    for (var i = lo; i < R.length && R[i][0] <= date; i++) { try { if (applyOne(state, R[i])) n++; } catch (err) { /* a bad row never stops the sim */ } }
    state.realCursor = date;
    state.realApplied = (state.realApplied || 0) + n;
    return n;
  }

  var REALLIFE = { applyUntil: applyUntil, dayBefore: dayBefore, seasonOf: seasonOf };
  if (W) W.REALLIFE = REALLIFE;
  if (typeof module !== 'undefined' && module.exports) module.exports = REALLIFE;
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
