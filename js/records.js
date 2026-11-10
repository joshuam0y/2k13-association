// 2K13 Association: all-time records (window.RECORDS). Classic script, plain JS; module.exports under Node.
// Single-game highs come from the engine (season.gh and season.gtop, js/engine.js trackGameHighs) and are
// archived here when a season ends: player.gh (career highs), player.careerPO (playoff totals by season) and
// state.records (league single-game records and each season's best games). Career totals add the real
// NBA careers before 2012-13 (data/alltime-prior.js, CAREER_PRIOR as the fallback) to what happens in the save,
// and the all-time boards add the real greats who retired before 2012-13.
(function (root) {
  'use strict';

  var HI = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm'];          // single-game stats
  var TOT = ['g', 'pts', 'reb', 'ast', 'stl', 'blk', 'tpm'];    // career totals (data/alltime-prior.js keys)
  var LABEL = { g: 'GAMES', pts: 'POINTS', reb: 'REBOUNDS', ast: 'ASSISTS', stl: 'STEALS', blk: 'BLOCKS', tpm: 'THREES MADE' };
  var SHORT = { g: 'G', pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', tpm: '3PM' };
  // when the NBA started counting it (season-ending year)
  var SINCE = { stl: 1974, blk: 1974, tpm: 1980 };
  var LG_N = 10, SEASON_KEEP = { r: 3, p: 2 }, TIE_CAP = 5;
  // player.careerPO rows: [year, team, g, min, pts, reb, ast, stl, blk, tpm]
  var PO_KEYS = ['year', 'team', 'g', 'min', 'pts', 'reb', 'ast', 'stl', 'blk', 'tpm'];

  function glob(name) {
    if (typeof window !== 'undefined' && window[name]) return window[name];
    if (typeof globalThis !== 'undefined' && globalThis[name]) return globalThis[name];
    return root && root[name] || null;
  }
  function rebOf(r) { return r.reb != null ? r.reb : (r.oreb || 0) + (r.dreb || 0); }
  function comma(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  // ---------------------------------------------------------------------------
  // Archiving a finished season (LEAGUE endSeason calls this once per season)
  // ---------------------------------------------------------------------------
  function mergeHigh(cur, add) {
    if (!add) return cur;
    if (!cur || add[0] > cur[0]) return add.slice(0, 5);
    if (add[0] === cur[0]) cur[1] += add[1];
    return cur;
  }
  // best games, value first, ties in date order, TIE_CAP games at most at the last value kept
  function keepTop(list, n) {
    list.sort(function (a, b) { return b[0] - a[0] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0); });
    var out = [];
    list.forEach(function (x) {
      if (out.length < n) { out.push(x); return; }
      var last = out[out.length - 1][0], tied = out.filter(function (y) { return y[0] === x[0]; }).length;
      if (x[0] === last && tied < TIE_CAP && out.length < n + TIE_CAP) out.push(x);
    });
    return out;
  }
  function archive(state) {
    var s = state && state.season;
    if (!s) return false;
    var R = state.records || (state.records = { since: s.year, lg: { r: {}, p: {} }, seasons: {} });
    if (R.done === s.year) return false;
    R.done = s.year;
    var gh = s.gh || { r: {}, p: {} }, top = s.gtop || { r: {}, p: {} };
    ['r', 'p'].forEach(function (ph) {
      Object.keys(gh[ph] || {}).forEach(function (id) {
        var p = state.players[id];
        if (!p) return;
        var mine = p.gh || (p.gh = {}), box = mine[ph] || (mine[ph] = {});
        HI.forEach(function (k) { if (gh[ph][id][k]) box[k] = mergeHigh(box[k], gh[ph][id][k]); });
      });
      HI.forEach(function (k) {
        var list = (top[ph] && top[ph][k]) || [];
        if (!list.length) return;
        R.lg[ph][k] = keepTop((R.lg[ph][k] || []).concat(list.map(function (x) { return x.slice(); })), LG_N);
      });
    });
    var keep = {};
    ['r', 'p'].forEach(function (ph) {
      keep[ph] = {};
      HI.forEach(function (k) { var l = top[ph] && top[ph][k]; if (l && l.length) keep[ph][k] = keepTop(l.slice(), SEASON_KEEP[ph]); });
    });
    R.seasons[s.year] = keep;
    delete s.gh;   // now on the players (the offseason save stays small)
    // playoff totals by season (careerStats holds the regular season only)
    var po = s.playoffStats || {};
    Object.keys(po).forEach(function (id) {
      var p = state.players[id], x = po[id];
      if (!p || !x || !x.g) return;
      var rows = p.careerPO || (p.careerPO = []);
      if (rows.some(function (r) { return r[0] === s.year; })) return;
      rows.push([s.year, p.team, x.g, Math.round(x.min || 0), x.pts || 0, rebOf(x), x.ast || 0, x.stl || 0, x.blk || 0, x.tpm || 0]);
    });
    return true;
  }
  // the season in progress, until it is archived
  function liveSeason(state) {
    var s = state && state.season;
    if (!s || (state.records && state.records.done === s.year)) return null;
    return s;
  }
  function trackingSince(state) {
    if (state && state.records && state.records.since) return state.records.since;
    var s = state && state.season;
    return s && s.gh ? s.year : null;
  }

  // ---------------------------------------------------------------------------
  // Career highs
  // ---------------------------------------------------------------------------
  // -> { r: { pts: [value, times, date, opp, game id] ... }, p: {...} } (career, the live season included)
  function careerHighs(state, p) {
    var out = { r: {}, p: {} };
    if (!p) return out;
    var s = liveSeason(state);
    ['r', 'p'].forEach(function (ph) {
      var a = (p.gh && p.gh[ph]) || {}, b = (s && s.gh && s.gh[ph] && s.gh[ph][p.id]) || {};
      HI.forEach(function (k) {
        var v = a[k] ? a[k].slice() : null;
        v = mergeHigh(v, b[k]);
        if (v) out[ph][k] = v;
      });
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Career totals: real seasons before 2012-13 plus the save
  // ---------------------------------------------------------------------------
  var priorCache = {}, priorSrc = null;
  function prior(id) {
    var A = glob('ALLTIME_PRIOR');
    if (A !== priorSrc) { priorCache = {}; priorSrc = A; }   // another start year swapped the table in (LEAGUE.useStart)
    if (priorCache[id]) return priorCache[id];
    var a = A && A.active && A.active[id];
    var out;
    if (a) out = { r: a[0].slice(), p: a[1].slice(), exact: true };
    else {
      // fallback: CAREER_PRIOR per game averages times games (no threes or playoffs there)
      out = { r: [0, 0, 0, 0, 0, 0, 0], p: [0, 0, 0, 0, 0, 0, 0], exact: false };
      var CP = glob('CAREER_PRIOR');
      ((CP && CP[id]) || []).forEach(function (x) {
        if (!x || !x.g) return;
        out.r[0] += x.g;
        ['pts', 'reb', 'ast', 'stl', 'blk'].forEach(function (k, i) { out.r[i + 1] += Math.round(x.g * (x[k] || 0)); });
      });
    }
    priorCache[id] = out;
    return out;
  }
  function blank() { var o = {}; TOT.forEach(function (k) { o[k] = 0; }); return o; }
  // -> { g, pts, reb, ast, stl, blk, tpm } for ph 'r' (regular season) or 'p' (playoffs)
  function totals(state, p, ph) {
    ph = ph || 'r';
    var t = blank();
    if (!p) return t;
    var pr = prior(p.id)[ph];
    TOT.forEach(function (k, i) { t[k] += pr[i] || 0; });
    var s = liveSeason(state), cur = s && (ph === 'p' ? s.playoffStats : s.playerStats);
    var add = function (x) { t.g += x.g || 0; t.pts += x.pts || 0; t.reb += rebOf(x); t.ast += x.ast || 0; t.stl += x.stl || 0; t.blk += x.blk || 0; t.tpm += x.tpm || 0; };
    if (ph === 'r') (p.careerStats || []).forEach(function (x) { if (x && !(s && x.year === s.year)) add(x); });
    else (p.careerPO || []).forEach(function (x) { if (!(s && x[0] === s.year)) add({ g: x[2], pts: x[4], reb: x[5], ast: x[6], stl: x[7], blk: x[8], tpm: x[9] }); });
    if (cur && cur[p.id]) add(cur[p.id]);
    return t;
  }

  // ---------------------------------------------------------------------------
  // All-time boards
  // ---------------------------------------------------------------------------
  // every name with a total: the real greats who retired before 2012-13, then everyone in the save
  // -> [{ id, name, v, p (save player or null), real: true for a retired great, active }]
  function board(state, ph, stat, opts) {
    opts = opts || {};
    ph = ph || 'r'; stat = stat || 'pts';
    var ki = TOT.indexOf(stat), out = [];
    var A = glob('ALLTIME_PRIOR');
    if (!opts.activeOnly && A && A.retired) A.retired.forEach(function (x) {
      var v = (ph === 'p' ? x[6] : x[5])[ki];
      if (v > 0) out.push({ id: x[0], name: x[1], v: v, p: null, real: true, from: x[2], to: x[3], hof: !!x[4] });
    });
    var players = (state && state.players) || {};
    Object.keys(players).forEach(function (id) {
      var p = players[id];
      if (!p || p.team === 'DRAFT') return;
      if (opts.activeOnly && p.retired) return;
      var v = totals(state, p, ph)[stat];
      if (v > 0) out.push({ id: id, name: p.name, v: v, p: p, real: false, active: !p.retired });
    });
    out.sort(function (a, b) { return b.v - a.v || (a.name < b.name ? -1 : 1); });
    return opts.limit ? out.slice(0, opts.limit) : out;
  }
  // the smallest total on the real top 250 list: below it an all-time rank is not known
  function cutoff(ph, stat) {
    var A = glob('ALLTIME_PRIOR');
    return A && A.cut && A.cut[ph || 'r'] ? A.cut[ph || 'r'][stat] || 0 : 0;
  }
  // -> { v, rank (null when below the known list) } of a player on the all-time board
  function rankOf(state, p, ph, stat, list) {
    var v = totals(state, p, ph)[stat];
    if (!(v > 0) || v < cutoff(ph, stat)) return { v: v, rank: null };
    list = list || board(state, ph, stat);
    var n = 1;
    for (var i = 0; i < list.length; i++) if (list[i].v > v) n++;
    return { v: v, rank: n };
  }

  // ---------------------------------------------------------------------------
  // Single-game boards
  // ---------------------------------------------------------------------------
  // league records in this save, the live season included -> [{ v, id, date, team, opp, gid }]
  function singleGame(state, ph, stat, n) {
    ph = ph || 'r';
    var R = state && state.records, s = liveSeason(state);
    var list = ((R && R.lg[ph] && R.lg[ph][stat]) || []).slice();
    if (s && s.gtop && s.gtop[ph] && s.gtop[ph][stat]) list = list.concat(s.gtop[ph][stat]);
    return keepTop(list.map(function (x) { return x.slice(); }), n || LG_N).map(entry);
  }
  function entry(x) { return { v: x[0], id: x[1], date: x[2], team: x[3], opp: x[4], gid: x[5] }; }
  // the day the real record book stops for this save: the opening of its first season (or the day a league
  // started in the middle of a season), so a 2003-04 league never shows Kobe's 81 or Bam Adebayo's 83
  function realCut(state) {
    if (state && state.startDate) return String(state.startDate);
    var y = state && +state.startYear || 2013;
    return (y - 1) + '-10-01';
  }
  // "2012-13" style label of the season the real record book runs up to
  function realLabel(state) {
    var y = state && +state.startYear || 2013;
    return (y - 1) + '-' + String(y).slice(2);
  }
  // the real NBA's best single games before this save started: data/real-games.js (every era, regular season
  // and playoffs), the 2012-13 list in data/alltime-prior.js when that file is missing. Up to 6 games, plus
  // ties at the 6th value (10 at most). -> [{ v, id, name, date, team, opp, real: true }]
  function realGames(stat, ph, state) {
    ph = ph || 'r';
    var cut = realCut(state), out = [];
    var G = glob('REAL_GAMES');
    if (G) G.forEach(function (g) { if (g[0] === ph && g[1] === stat && g[5] < cut) out.push({ v: g[2], id: g[3] || null, name: g[4], date: g[5], team: g[6], opp: g[7], real: true }); });
    else if (ph === 'r') {
      var A = glob('ALLTIME_PRIOR');
      ((A && A.games) || []).forEach(function (g) { if (g[0] === stat && g[4] < cut) out.push({ v: g[1], id: g[2] || null, name: g[3], date: g[4], team: g[5], opp: g[6], real: true }); });
    }
    out.sort(function (a, b) { return b.v - a.v || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0); });
    if (out.length <= 6) return out;
    var sixth = out[5].v;
    return out.filter(function (x, i) { return i < 6 || x.v === sixth; }).slice(0, 10);
  }
  // this season's best games (or a finished season's top games from the archive)
  function seasonHighs(state, ph, stat, year) {
    var s = state && state.season;
    if (s && (year == null || year === s.year) && s.gtop) return ((s.gtop[ph] && s.gtop[ph][stat]) || []).map(entry);
    var R = state && state.records, y = R && R.seasons[year];
    return y && y[ph] && y[ph][stat] ? y[ph][stat].map(entry) : [];
  }

  // ---------------------------------------------------------------------------
  // Milestones: called by NEWS.tick for each regular season line, with the career totals before it.
  // Returns [{ headline, body }] for passing a real all-time leader or the next name on the board.
  // ---------------------------------------------------------------------------
  var PASS_TOP = { pts: 25, reb: 20, ast: 20, stl: 10, blk: 10, tpm: 10 };
  var boardCache = null;
  function passes(state, p, stat, before, after) {
    if (!(after > before) || !PASS_TOP[stat]) return [];
    // the board is built once a season (it is a long sort over every career), and nobody below its
    // last name can pass anyone, so almost every call returns right away
    var key = state && state.year;
    if (!boardCache || boardCache.key !== key || boardCache.state !== state) boardCache = { key: key, state: state, lists: {} };
    var list = boardCache.lists[stat] || (boardCache.lists[stat] = board(state, 'r', stat, { limit: PASS_TOP[stat] + 1 }));
    if (!list.length || after <= list[list.length - 1].v) return [];
    var others = list.filter(function (x) { return x.id !== p.id; }).slice(0, PASS_TOP[stat]);
    var rank = 1 + others.filter(function (x) { return x.v >= after; }).length;
    var word = stat === 'tpm' ? 'Threes' : LABEL[stat].charAt(0) + LABEL[stat].slice(1).toLowerCase();
    var out = [];
    others.forEach(function (x) {
      if (!(before <= x.v && after > x.v)) return;
      var top = rank === 1;
      out.push({
        top: top, who: x, rank: rank,
        headline: p.name + ' Passes ' + x.name + (top ? ' For Most ' + word + ' In NBA History' : ' On All-Time ' + word + ' List'),
        body: p.name + ' moved past ' + x.name + ' (' + comma(x.v) + ') and now has ' + comma(after) + ' career ' + LABEL[stat].toLowerCase() +
          (top ? ', the most in NBA history.' : ', ' + ord(rank) + ' all-time.')
      });
    });
    return out;
  }

  var RECORDS = {
    HI: HI, TOT: TOT, LABEL: LABEL, SHORT: SHORT, SINCE: SINCE, PO_KEYS: PO_KEYS,
    archive: archive, careerHighs: careerHighs, totals: totals, prior: prior, board: board, cutoff: cutoff, rankOf: rankOf,
    singleGame: singleGame, realGames: realGames, realCut: realCut, realLabel: realLabel, seasonHighs: seasonHighs, trackingSince: trackingSince, passes: passes,
    comma: comma, ord: ord
  };
  if (typeof window !== 'undefined') window.RECORDS = RECORDS;
  else if (root) root.RECORDS = RECORDS;
  if (typeof module !== 'undefined' && module.exports) module.exports = RECORDS;
})(typeof self !== 'undefined' ? self : this);
