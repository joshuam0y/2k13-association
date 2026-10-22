// 2K13 Association: player mood and personalities.
// Classic script: attaches window.MOOD (and module.exports under Node).
//
// MOOD.of(state, id)        -> { score, target, reasons: [strings], parts: { winning, minutes, money, market, coach, loyalty } }
// MOOD.update(state, opts)  -> monthly (or opts.offseason) mood update for every NBA player; unhappy stars
//                              create state.events complaints (user team) or news (AI teams) and may request trades.
// MOOD.initPersonalities(state, seed) -> real traits from window.PERSONALITIES, seeded random traits for everyone else.
(function () {
  'use strict';

  var MARKET = {
    NYK: 1.0, LAL: 1.0, CHI: 0.9, LAC: 0.88, BOS: 0.86, MIA: 0.86, BKN: 0.86, BRK: 0.86,
    GSW: 0.7, HOU: 0.66, DAL: 0.66, PHI: 0.62, TOR: 0.6, WAS: 0.56, ATL: 0.56, PHX: 0.5, PHO: 0.5,
    DEN: 0.45, DET: 0.45, ORL: 0.45, MIN: 0.4, POR: 0.4, CLE: 0.4, SAC: 0.36, IND: 0.35, SAS: 0.35,
    CHA: 0.34, CHO: 0.34, UTA: 0.3, OKC: 0.3, MEM: 0.3, MIL: 0.3, NOH: 0.3, NOP: 0.3
  };

  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function isNum(x) { return typeof x === 'number' && !isNaN(x); }

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function marketSize(abbr) { return MARKET[abbr] != null ? MARKET[abbr] : 0.45; }

  function personalities() {
    var g = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});
    return g.PERSONALITIES || {};
  }

  // Seeded random personality: most players sit near the middle, a few are extreme.
  function randomPersonality(id, seed) {
    var r = mulberry32(hashStr(String(id)) ^ (seed >>> 0));
    function trait() { var v = (r() + r() + r()) / 3; return Math.round(clamp(10 + v * 80 + (r() - 0.5) * 20, 1, 99)); }
    return { loyalty: trait(), winning: trait(), money: trait(), market: trait(), ego: trait() };
  }

  function personalityFor(id, seed) {
    var real = personalities()[id];
    if (real) return { loyalty: real.loyalty, winning: real.winning, money: real.money, market: real.market, ego: real.ego };
    return randomPersonality(id, seed || 0);
  }

  function initPersonalities(state, seed) {
    if (seed == null) seed = state.rngSeed || 1;
    var n = 0;
    Object.keys(state.players || {}).forEach(function (id) {
      var p = state.players[id];
      if (!p.personality) { p.personality = personalityFor(id, seed); n++; }
    });
    return n;
  }

  function pers(p) { return p.personality || { loyalty: 50, winning: 50, money: 50, market: 50, ego: 50 }; }

  // ---------------------------------------------------------------------------
  // Team context (rosters, strength, win percentage), built once per update
  // ---------------------------------------------------------------------------
  function isStandard(p) { return p && !p.retired && !(p.contract && p.contract.twoWay); }

  function buildCtx(state) {
    var rosters = {};
    Object.keys(state.teams || {}).forEach(function (a) { rosters[a] = []; });
    Object.keys(state.players || {}).forEach(function (id) {
      var p = state.players[id];
      if (p.retired || !rosters[p.team]) return;
      rosters[p.team].push(p);
    });
    Object.keys(rosters).forEach(function (a) { rosters[a].sort(function (x, y) { return y.ovr - x.ovr; }); });
    var strength = {}, sum = 0, n = 0;
    Object.keys(rosters).forEach(function (a) {
      var top = rosters[a].filter(isStandard).slice(0, 8), s = 0;
      top.forEach(function (p) { s += p.ovr; });
      strength[a] = top.length ? s / Math.max(8, top.length) : 60;
      sum += strength[a]; n++;
    });
    return { rosters: rosters, strength: strength, avgStrength: n ? sum / n : 70 };
  }

  function standingFor(state, abbr) {
    var s = state.season && state.season.standings && state.season.standings[abbr];
    if (s && s.w + s.l >= 10) return s;
    var hist = state.history && state.history.seasons;
    if (hist && hist.length) {
      var last = hist[hist.length - 1];
      var h = last && last.standings && last.standings[abbr];
      if (h && isNum(h.w) && h.w + h.l > 0) return h;
    }
    return null;
  }

  // Win percentage: real record when there is one, blended with roster strength.
  function teamWinPct(state, abbr, ctx) {
    ctx = ctx || buildCtx(state);
    var est = clamp(0.5 + ((ctx.strength[abbr] || ctx.avgStrength) - ctx.avgStrength) * 0.035, 0.12, 0.88);
    var s = standingFor(state, abbr);
    if (!s) return est;
    var g = s.w + s.l, w = clamp(g / 82, 0, 1) * 0.75;
    return (s.w / g) * w + est * (1 - w);
  }

  function coachRating(state, abbr) {
    var t = state.teams && state.teams[abbr];
    if (!t || t.coach == null) return null;
    var c = t.coach;
    if (typeof c !== 'object') {
      var g = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});
      var pool = state.coaches || g.COACHES || null;
      if (Array.isArray(pool)) { var f = null; pool.forEach(function (x) { if (x && x.id === c) f = x; }); c = f; }
      else c = pool ? pool[c] : null;
    }
    if (!c) return null;
    var r = c.ovr != null ? c.ovr : c.rating != null ? c.rating : c.overall;
    return isNum(r) ? r : null;
  }

  // Expected minutes from the player's rank on his team and his overall.
  function expectedMinutes(p, rank) {
    var byRank = [35, 33, 31, 29, 27, 22, 20, 17, 14, 10, 7, 5, 4, 3, 3];
    var r = byRank[Math.min(rank, byRank.length - 1)];
    var abs = p.ovr >= 85 ? 34 : p.ovr >= 80 ? 29 : p.ovr >= 76 ? 22 : p.ovr >= 72 ? 14 : 6;
    return Math.max(r, abs);
  }

  function actualMinutes(state, p) {
    var s = state.season && state.season.playerStats && state.season.playerStats[p.id];
    if (!s || !s.g) return null;
    var teamGames = 0, st = state.season.standings && state.season.standings[p.team];
    if (st) teamGames = st.w + st.l;
    if (Math.max(s.g, teamGames) < 5) return null;
    // Games missed while healthy count as zero minutes (benched); injuries are excused.
    var g = s.g;
    var inj = (state.season.injuries && state.season.injuries[p.id]) || p.injury;
    if (teamGames > g && !inj) g = Math.min(teamGames, g + (teamGames - g) * 0.5);
    return s.min / g;
  }

  function marketValueOf(state, p) {
    var g = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});
    var FA = g.FA || (typeof require === 'function' ? safeRequire('./freeagency.js') : null);
    if (FA && FA.marketValue) return FA.marketValue(state, p.id);
    return null;
  }
  function safeRequire(path) { try { return require(path); } catch (e) { return null; } }

  function currentSalary(state, p) {
    if (!p.contract || !p.contract.salaries) return null;
    var y = state.fa && state.fa.year > state.year ? state.fa.year : state.year;
    var s = p.contract.salaries;
    for (var i = 0; i < s.length; i++) if (s[i].year === y) return s[i].amount;
    return s.length ? s[0].amount : null;
  }

  function of(state, id, ctx) {
    var p = state.players[id];
    if (!p) return { score: 50, target: 50, reasons: [], parts: {} };
    ctx = ctx || buildCtx(state);
    var t = pers(p), parts = {}, reasons = [];
    var onTeam = !!(state.teams && state.teams[p.team]);
    var score = 55;

    if (onTeam) {
      // Winning. Older players care more about rings.
      var wp = teamWinPct(state, p.team, ctx);
      var wWeight = 0.4 + 1.2 * t.winning / 100;
      if (p.age >= 30) wWeight *= 1.25;
      parts.winning = Math.round(clamp((wp - 0.5) * 2 * 18 * wWeight, -24, 16));
      if (parts.winning <= -6) reasons.push('Frustrated with losing');
      else if (parts.winning >= 6) reasons.push('Enjoys winning');

      // Playing time against expectation.
      var roster = (ctx.rosters[p.team] || []).filter(isStandard);
      var rank = roster.indexOf(p);
      if (rank < 0) rank = roster.length;
      var exp = expectedMinutes(p, rank), act = actualMinutes(state, p);
      parts.minutes = 0;
      if (act != null) {
        var ratio = act / exp;
        if (ratio < 0.9) parts.minutes = -Math.round(clamp((0.9 - ratio) * 45 * (0.6 + t.ego / 100 * 0.8), 0, 32));
        else if (ratio > 1.1) parts.minutes = 3;
        if (parts.minutes <= -6) reasons.push('Unhappy with his playing time (' + act.toFixed(1) + ' mpg, expects ' + exp + ')');
        else if (parts.minutes > 0) reasons.push('Happy with his role');
      }

      // Contract fairness.
      parts.money = 0;
      var sal = currentSalary(state, p), val = marketValueOf(state, p);
      if (sal != null && val) {
        var r2 = sal / val;
        if (r2 < 0.7) parts.money = -Math.round(clamp((0.7 - r2) * 20 * (0.5 + t.money / 100), 0, 10));
        else if (r2 > 1.1) parts.money = 3;
        if (parts.money <= -4) reasons.push('Feels underpaid');
      }

      // Market size.
      parts.market = Math.round((marketSize(p.team) - 0.5) * 24 * t.market / 100);
      if (parts.market >= 4) reasons.push('Loves the big market');
      else if (parts.market <= -4) reasons.push('Wants a bigger market');

      // Coach.
      var cr = coachRating(state, p.team);
      parts.coach = cr == null ? 0 : Math.round(clamp((cr - 70) / 30 * 6, -6, 6));
      if (parts.coach >= 3) reasons.push('Respects his coach');
      else if (parts.coach <= -3) reasons.push('Does not trust the coach');

      // Loyalty and years with the team.
      parts.loyalty = Math.round(t.loyalty / 100 * Math.min(p.yearsWithTeam || 0, 8) / 8 * 10);
      if (parts.loyalty >= 5) reasons.push('Loyal to the franchise');

      Object.keys(parts).forEach(function (k) { score += parts[k]; });
    }
    var target = Math.round(clamp(score, 0, 100));
    return { score: isNum(p.mood) ? Math.round(p.mood) : target, target: target, reasons: reasons, parts: parts };
  }

  function dayKey(state) { return (state.year || 0) * 1000 + (state.day || (state.season && state.season.day) || 0); }

  function update(state, opts) {
    opts = opts || {};
    var ctx = buildCtx(state), out = { complaints: [], tradeRequests: [] };
    state.events = state.events || [];
    state.news = state.news || [];
    var rate = opts.offseason ? 0.6 : (opts.rate || 0.35);
    var now = dayKey(state);
    Object.keys(state.players || {}).forEach(function (id) {
      var p = state.players[id];
      if (p.retired || !state.teams[p.team]) return;
      if (!p.personality) p.personality = personalityFor(id, state.rngSeed || 1);
      var m = of(state, id, ctx);
      p.mood = isNum(p.mood) ? Math.round(clamp(p.mood + (m.target - p.mood) * rate, 0, 100)) : m.target;
      if (p.tradeRequest && p.mood >= 45) p.tradeRequest = false;
      var roster = ctx.rosters[p.team].filter(isStandard);
      var star = p.ovr >= 80 || roster.indexOf(p) < 3;
      if (!star || p.mood >= 30) return;
      if (p.lastComplaint != null && now - p.lastComplaint < 30) return;
      p.lastComplaint = now;
      var t = pers(p);
      var wantsTrade = p.mood < 20 || (p.mood < 30 && t.ego >= 70);
      if (wantsTrade && !p.tradeRequest) { p.tradeRequest = true; out.tradeRequests.push(id); }
      var why = m.reasons.length ? m.reasons.join('; ') : 'Unhappy with his situation';
      var text = p.name + ' is unhappy (mood ' + p.mood + '). ' + why + '.' + (wantsTrade ? ' He wants to be traded.' : '');
      var c = { type: 'complaint', playerId: id, team: p.team, mood: p.mood, reasons: m.reasons, tradeRequest: wantsTrade, text: text, year: state.year };
      out.complaints.push(c);
      if (p.team === state.userTeam) state.events.push(c);
      else if (wantsTrade) state.news.push({ year: state.year, day: state.day || 0, headline: p.name + ' requests a trade from ' + p.team, body: text, ids: [id] });
    });
    return out;
  }

  var MOOD = {
    MARKET: MARKET,
    marketSize: marketSize,
    of: of,
    update: update,
    initPersonalities: initPersonalities,
    personalityFor: personalityFor,
    randomPersonality: randomPersonality,
    teamWinPct: teamWinPct,
    coachRating: coachRating,
    expectedMinutes: expectedMinutes,
    actualMinutes: actualMinutes,
    buildCtx: buildCtx,
    rng: mulberry32,
    hash: hashStr
  };

  if (typeof window !== 'undefined') window.MOOD = MOOD;
  if (typeof module !== 'undefined' && module.exports) module.exports = MOOD;
})();
