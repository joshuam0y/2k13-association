// Draft and lottery: window.DRAFT (and module.exports under Node).
// lottery(state, rng), order(state, year), aiPick(state, abbr), pick(state, abbr, prospectId),
// signRookies(state). Real classes come from window.DRAFTS (data/drafts.js); from 2027 on
// (or when a real class is missing) a fictional class of 70 prospects is generated.
(function (root) {
  'use strict';

  var FICTIONAL_FROM = 2027;
  var CLASS_SIZE = 70;
  var ROUNDS = 2;
  var REFORM_YEAR = 2019;
  // Chances (per 1000) of the number 1 pick for the 14 lottery teams, worst record first.
  var ODDS_1994 = [250, 199, 156, 119, 88, 63, 43, 28, 17, 11, 8, 7, 6, 5];
  var ODDS_2019 = [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5];
  var LOTTERY_TEAMS = 14;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function prog() {
    if (root && root.PROG) return root.PROG;
    if (typeof require === 'function') { try { return require('./progression.js'); } catch (e) { /* none */ } }
    return null;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function mulberry32(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261 >>> 0;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function gauss(rng) {
    var u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function seeded(state, salt) { return mulberry32(hashStr(((state && state.rngSeed) || 7) + ':' + salt)); }
  function teams(state) { return (state && state.teams) || {}; }
  function teamList(state) { return Object.keys(teams(state)); }
  function isTeam(state, abbr) { return !!teams(state)[abbr]; }
  function cbaRules(year) {
    var C = root && root.CBA;
    if (!C || typeof C.rules !== 'function') return null;
    try { return C.rules(year) || null; } catch (e) { return null; }
  }
  function primaryPos(pos) {
    var P = prog();
    if (P) return P.primaryPos(pos);
    return String(pos || 'SF').toUpperCase().split(/[-\/ ,]/)[0];
  }
  function posGroup(pos) {
    var p = primaryPos(pos);
    if (p === 'PG' || p === 'SG') return 'G';
    if (p === 'SF') return 'W';
    return 'B';
  }
  function addTx(state, year, type, text, ids) {
    (state.transactions = state.transactions || []).push({ year: year, day: state.day || 0, type: type, text: text, ids: ids || [] });
  }
  function addNews(state, year, headline, body, ids) {
    (state.news = state.news || []).push({ year: year, day: state.day || 0, headline: headline, body: body, ids: ids || [] });
  }
  function emptyContract() { return { salaries: [], option: null, rookie: false, twoWay: false, signedYear: null }; }
  function isStashed(p) { return !!(p && p.stashedUntil != null); }
  function teamName(state, abbr) {
    var t = teams(state)[abbr];
    return t ? ((t.city ? t.city + ' ' : '') + (t.name || abbr)) : abbr;
  }

  // ---------------------------------------------------------------------------
  // Records and lottery teams
  // ---------------------------------------------------------------------------
  function standingsOf(state) { return (state && state.season && state.season.standings) || {}; }
  function pct(state, abbr) {
    var s = standingsOf(state)[abbr];
    if (!s || !(s.w + s.l)) return null;
    return s.w / (s.w + s.l);
  }
  // Worst record first. Ties broken by a coin flip seeded on the year (like the real tiebreak drawing).
  function byRecordAsc(state, list, year) {
    var tieKey = {};
    list.forEach(function (a) { tieKey[a] = hashStr(year + ':tie:' + a + ':' + ((state && state.rngSeed) || 0)); });
    return list.slice().sort(function (a, b) {
      var pa = pct(state, a), pb = pct(state, b);
      if (pa == null) pa = (tieKey[a] % 1000) / 1000;
      if (pb == null) pb = (tieKey[b] % 1000) / 1000;
      if (Math.abs(pa - pb) > 1e-9) return pa - pb;
      var s = standingsOf(state), A = s[a], B = s[b];
      if (A && B) { var d = (A.pf - A.pa) - (B.pf - B.pa); if (d) return d; }
      return tieKey[a] - tieKey[b];
    });
  }
  function playoffTeams(state, year) {
    var season = state && state.season;
    var seeds = season && season.playoffs && season.playoffs.seeds;
    var set = {};
    if (seeds && (!season.year || season.year === year)) {
      Object.keys(seeds).forEach(function (c) { (seeds[c] || []).forEach(function (a) { set[typeof a === 'string' ? a : a.abbr] = true; }); });
      if (Object.keys(set).length) return set;
    }
    var byConf = {};
    teamList(state).forEach(function (a) { var c = teams(state)[a].conf || 'East'; (byConf[c] = byConf[c] || []).push(a); });
    Object.keys(byConf).forEach(function (c) {
      var ranked = byRecordAsc(state, byConf[c], year).reverse();
      ranked.slice(0, 8).forEach(function (a) { set[a] = true; });
    });
    return set;
  }
  function lotteryTeams(state, year) {
    var po = playoffTeams(state, year);
    var non = teamList(state).filter(function (a) { return !po[a]; });
    return byRecordAsc(state, non, year);
  }

  function eraOdds(year, n) {
    var rules = cbaRules(year), raw = null, draws = year >= REFORM_YEAR ? 4 : 3;
    if (rules && rules.lotteryOdds && rules.lotteryOdds.length) {
      raw = rules.lotteryOdds.map(function (x) { return Array.isArray(x) ? +x[0] : (x && typeof x === 'object' ? +(x.first || x.pick1 || x.odds || 0) : +x); });
      if (raw.some(function (x) { return !(x >= 0); })) raw = null;
      if (rules.lotteryDraws) draws = +rules.lotteryDraws;
    }
    if (!raw) raw = year >= REFORM_YEAR ? ODDS_2019 : ODDS_1994;
    var odds = [];
    for (var i = 0; i < n; i++) odds.push(raw[Math.min(i, raw.length - 1)]);
    var sum = odds.reduce(function (s, x) { return s + x; }, 0) || 1;
    return { odds: odds.map(function (x) { return x / sum; }), draws: Math.min(draws, n), era: year >= REFORM_YEAR ? '2019' : '1994' };
  }

  // Draws the lottery for state.year's draft. Stores the result in state.draft and returns it.
  function lottery(state, rng, opts) {
    opts = opts || {};
    var year = opts.year != null ? opts.year : state.year;
    rng = typeof rng === 'function' ? rng : seeded(state, 'lottery' + year);
    var lt = lotteryTeams(state, year);
    var eo = eraOdds(year, lt.length);
    var remaining = lt.map(function (a, i) { return { abbr: a, seed: i + 1, w: eo.odds[i] }; });
    var drawn = [];
    for (var d = 0; d < eo.draws && remaining.length; d++) {
      var tot = remaining.reduce(function (s, x) { return s + x.w; }, 0);
      var r = rng() * tot, k = 0;
      for (; k < remaining.length - 1; k++) { r -= remaining[k].w; if (r <= 0) break; }
      drawn.push(remaining.splice(k, 1)[0]);
    }
    var final = drawn.concat(remaining);
    var result = {
      year: year, era: eo.era, draws: eo.draws,
      order: final.map(function (x) { return x.abbr; }),
      teams: final.map(function (x, i) { return { abbr: x.abbr, seed: x.seed, chance: Math.round(eo.odds[x.seed - 1] * 1000) / 10, pick: i + 1, moved: x.seed - (i + 1) }; })
    };
    if (opts.dryRun) return result;
    // Retirements are announced now, before re-signing and free agency, so teams can replace them
    var P = prog();
    if (P && P.retirements && opts.retirements !== false) P.retirements(state, rng, { seasonDone: year });
    state.draft = { year: year, lottery: result, order: null, index: 0, done: false };
    var slots = order(state, year);
    result.teams.forEach(function (t) { var s = slots[t.pick - 1]; t.owner = s.team; t.protectedFor = s.protectedFor || null; });
    var top = result.teams[0];
    addNews(state, year, teamName(state, top.owner) + ' win the ' + year + ' draft lottery',
      'The ' + teamName(state, top.owner) + ' jumped from the number ' + top.seed + ' spot (' + top.chance + '% odds) to win the first pick' +
      (top.owner !== top.abbr ? ', via ' + top.abbr + '.' : '.'), []);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Order and pick ownership
  // ---------------------------------------------------------------------------
  function findPick(state, year, round, original) {
    var found = null;
    teamList(state).forEach(function (a) {
      (teams(state)[a].picks || []).forEach(function (pk) {
        if (+pk.year === year && +pk.round === round && pk.original === original) {
          if (!found || (found.holder === original && a !== original)) found = { holder: a, entry: pk };
        }
      });
    });
    return found;
  }
  function protectedNow(prot, year, overall, inRound, round) {
    if (!prot || prot.top == null) return false;
    if (prot.until != null && year > +prot.until) return false;
    var n = round === 1 ? overall : (+prot.top > 30 ? overall : inRound);
    return n <= +prot.top;
  }

  // The full order for a year's draft: lottery result (or projection by record), then the rest
  // by record; second round by record. Each slot carries the owner after trades and protections.
  function order(state, year) {
    year = year != null ? year : state.year;
    var all = teamList(state);
    var lot;
    if (state.draft && state.draft.year === year && state.draft.lottery) lot = state.draft.lottery.order.slice();
    else lot = lotteryTeams(state, year);
    var rest = byRecordAsc(state, all.filter(function (a) { return lot.indexOf(a) < 0; }), year);
    var r1 = lot.concat(rest), r2 = byRecordAsc(state, all, year);
    var slots = [], overall = 0;
    [r1, r2].slice(0, ROUNDS).forEach(function (list, ri) {
      var round = ri + 1;
      list.forEach(function (orig, i) {
        overall++;
        var slot = { year: year, overall: overall, round: round, pickInRound: i + 1, original: orig, team: orig, via: null, protectedFor: null, player: null };
        var f = findPick(state, year, round, orig);
        if (f && f.holder !== orig) {
          if (protectedNow(f.entry.protection, year, overall, i + 1, round)) slot.protectedFor = f.holder;
          else { slot.team = f.holder; slot.via = orig; }
        }
        slots.push(slot);
      });
    });
    return slots;
  }

  // Protected picks that did not convey roll to next year (unprotected once past "until").
  function applyRollovers(state, slots) {
    slots.forEach(function (s) {
      if (!s.protectedFor) return;
      var f = findPick(state, s.year, s.round, s.original);
      if (!f || f.holder !== s.protectedFor) return;
      var pk = f.entry, prot = pk.protection;
      pk.year = s.year + 1;
      if (!prot || prot.until == null || pk.year > +prot.until) pk.protection = null;
      addTx(state, s.year, 'draft', 'The ' + s.original + ' pick owed to ' + s.protectedFor + ' was protected (' + s.overall +
        ') and rolls over to ' + pk.year + (pk.protection ? ' (top ' + pk.protection.top + ' protected)' : ' unprotected') + '.', []);
    });
  }

  // Adds each team's own picks for the next `ahead` drafts when no team holds them yet.
  function ensurePicks(state, ahead, fromYear) {
    ahead = ahead || 7;
    var y0 = fromYear != null ? fromYear : state.year + 1;
    teamList(state).forEach(function (a) {
      for (var y = y0; y < y0 + ahead; y++) {
        for (var r = 1; r <= ROUNDS; r++) {
          if (findPick(state, y, r, a)) continue;
          (teams(state)[a].picks = teams(state)[a].picks || []).push({ year: y, round: r, original: a, protection: null });
        }
      }
    });
  }
  function ownPicksExplicit(state) {
    return teamList(state).some(function (a) { return (teams(state)[a].picks || []).some(function (pk) { return pk.original === a; }); });
  }

  // ---------------------------------------------------------------------------
  // Classes
  // ---------------------------------------------------------------------------
  var FIRST = ['James', 'Marcus', 'Jalen', 'Tyler', 'Jordan', 'Brandon', 'Isaiah', 'Malik', 'Darius', 'Caleb', 'Elijah',
    'Jaylen', 'Cameron', 'Devin', 'Andre', 'Xavier', 'Trey', 'Derrick', 'Kevin', 'Anthony', 'Michael', 'Chris', 'Justin',
    'Aaron', 'Zion', 'Jamal', 'Terrence', 'Damon', 'Kendall', 'Josh', 'Nick', 'Tre', 'Keegan', 'Jaden', 'Amari', 'Cole',
    'Miles', 'Evan', 'Reggie', 'Lamar', 'DeAndre', 'Tariq', 'Omari', 'Khalil', 'Bryce', 'Grant', 'Luke', 'Noah', 'Ethan',
    'Mason', 'Logan', 'Owen', 'Wyatt', 'Carter', 'Austin', 'Dylan', 'Max', 'Jack', 'Ben', 'Sam', 'Tristan', 'Corey', 'Rashad',
    'Desmond', 'Quentin', 'Darnell', 'Maurice', 'Cedric', 'Dwayne', 'Rodney', 'Ivan', 'Luka', 'Nikola', 'Dario', 'Mateo',
    'Lucas', 'Pascal', 'Moussa', 'Ousmane', 'Victor', 'Alperen', 'Killian', 'Bogdan', 'Marko', 'Domas', 'Jonas', 'Rui',
    'Yuki', 'Trevon', 'Jarrett', 'Keon', 'Kobe', 'Jabari', 'Kai', 'Ayo', 'Chet', 'Scoot', 'Brice', 'Gradey', 'Cason',
    'Dereck', 'Jett', 'Kyle', 'Paul', 'Shane', 'Ryan', 'Connor', 'Garrett', 'Wade', 'Dillon', 'Myles', 'Jaxson', 'Ty',
    'Reed', 'Nolan', 'Emmanuel', 'Adrian', 'Bruno', 'Felipe', 'Santiago', 'Andres', 'Tomas', 'Hugo', 'Theo', 'Rayan',
    'Samuel', 'Daniel', 'Christian', 'Julian', 'Sean', 'Patrick', 'Eric', 'Harrison', 'Spencer', 'Toby', 'Isaac', 'Micah',
    'Jahlil', 'Deonte', 'Kahlil', 'Jamir', 'Zaire', 'Dashawn', 'Tyrese', 'Jakobe', 'Keyonte', 'Ausar', 'Dalton', 'Zach'];
  var LAST = ['Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore',
    'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen',
    'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Hill', 'Campbell', 'Mitchell', 'Roberts', 'Carter',
    'Phillips', 'Evans', 'Turner', 'Parker', 'Collins', 'Edwards', 'Stewart', 'Morris', 'Murphy', 'Cook', 'Rogers',
    'Morgan', 'Cooper', 'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Cox', 'Ward', 'Richardson', 'Watson', 'Brooks',
    'Wood', 'James', 'Bennett', 'Gray', 'Hughes', 'Price', 'Sanders', 'Myers', 'Long', 'Ross', 'Foster', 'Powell', 'Jenkins',
    'Perry', 'Russell', 'Sullivan', 'Bell', 'Coleman', 'Butler', 'Henderson', 'Barnes', 'Fisher', 'Simmons', 'Patterson',
    'Jordan', 'Reynolds', 'Hamilton', 'Graham', 'Wallace', 'Hayes', 'Bryant', 'Gibson', 'Ellis', 'Stephens', 'Tucker',
    'Porter', 'Hunter', 'Hicks', 'Crawford', 'Boyd', 'Mason', 'Warren', 'Dixon', 'Burns', 'Gordon', 'Holmes', 'Rice',
    'Black', 'Daniels', 'Palmer', 'Mills', 'Grant', 'Knight', 'Ferguson', 'Stone', 'Hawkins', 'Dunn', 'Perkins', 'Hudson',
    'Spencer', 'Stevens', 'Pierce', 'Lawrence', 'Holland', 'Bishop', 'Dean', 'Carr', 'Fields', 'Freeman', 'Wells', 'Harper',
    'Banks', 'Webb', 'Mack', 'Greer', 'Tate', 'Moss', 'Lyons', 'Maxwell', 'Booker', 'Battle', 'Mayo', 'Whitfield', 'Okafor',
    'Okoro', 'Adebayo', 'Diallo', 'Traore', 'Ndiaye', 'Mensah', 'Achiuwa', 'Petrovic', 'Jovanovic', 'Markovic', 'Novak',
    'Kovac', 'Horvat', 'Nowak', 'Schroeder', 'Wagner', 'Becker', 'Hoffmann', 'Garcia', 'Martinez', 'Rodriguez', 'Lopez',
    'Fernandez', 'Silva', 'Santos', 'Costa', 'Moreau', 'Dubois', 'Laurent', 'Fontaine', 'Rossi', 'Bianchi', 'Kowalski',
    'Lindqvist', 'Jensen', 'Larsen', 'Sato', 'Tanaka', 'Hachimura', 'Kim', 'Okonkwo', 'Eze', 'Bamba', 'Sissoko', 'Fall',
    'Whitaker', 'Holloway', 'Prescott', 'Langford', 'Strickland', 'Merriweather', 'Blackwell', 'Pruitt', 'Haynes', 'Calloway',
    'Sutton', 'Cobb', 'McDaniels', 'McCoy', 'McBride', 'McKinney', 'Bridges', 'Holiday', 'Battles', 'Council', 'Shelton'];

  var POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
  var POS_SHARE = [0.18, 0.2, 0.2, 0.21, 0.21];
  var POS_BODY = { PG: [74, 1.8, 190, 10], SG: [77, 1.5, 205, 10], SF: [79, 1.4, 220, 10], PF: [81, 1.3, 235, 12], C: [83, 1.5, 250, 14] };

  var shapeCache = null;
  // Average attribute minus overall per position, and each player's typical calibration offset,
  // measured from the real league so fictional players have the same attribute shapes.
  function attrShapes() {
    if (shapeCache) return shapeCache;
    var P = prog(), keys = P ? P.ATTR_KEYS : [];
    var L = root && root.LEAGUE_2012, shapes = {};
    POSITIONS.forEach(function (pos) {
      var s = { d: {}, sd: {}, off: 6, n: 0 };
      keys.forEach(function (k) { s.d[k] = pos === 'C' || pos === 'PF' ? 0 : 0; s.sd[k] = 9; });
      shapes[pos] = s;
    });
    if (L && L.players && P) {
      var acc = {};
      L.players.forEach(function (p) {
        if (!p.attrs || p.ovr == null) return;
        var pos = primaryPos(p.pos); if (!shapes[pos]) return;
        var a = acc[pos] = acc[pos] || { n: 0, d: {}, d2: {}, off: 0 };
        a.n++;
        a.off += p.ovr - P.weightedOvr(p.attrs, p.pos);
        keys.forEach(function (k) { var x = (p.attrs[k] || 50) - p.ovr; a.d[k] = (a.d[k] || 0) + x; a.d2[k] = (a.d2[k] || 0) + x * x; });
      });
      Object.keys(acc).forEach(function (pos) {
        var a = acc[pos], s = shapes[pos];
        if (a.n < 5) return;
        s.n = a.n; s.off = a.off / a.n;
        keys.forEach(function (k) {
          var m = a.d[k] / a.n;
          s.d[k] = m; s.sd[k] = Math.sqrt(Math.max(1, a.d2[k] / a.n - m * m)) * 0.8;
        });
      });
    }
    shapeCache = shapes;
    return shapes;
  }

  var profileCache = null;
  // Mean ovr and pot by class rank, from the real classes when they exist.
  function classProfile() {
    if (profileCache) return profileCache;
    var D = root && root.DRAFTS, ranks = [];
    for (var i = 0; i < CLASS_SIZE; i++) ranks.push({ ovr: [], pot: [] });
    if (D) {
      Object.keys(D).forEach(function (y) {
        var cls = (D[y] || []).filter(function (p) { return p && p.ovr != null; });
        cls.sort(function (a, b) { return (0.62 * (b.pot || b.ovr) + 0.38 * b.ovr) - (0.62 * (a.pot || a.ovr) + 0.38 * a.ovr); });
        cls.slice(0, CLASS_SIZE).forEach(function (p, r) { ranks[r].ovr.push(+p.ovr); ranks[r].pot.push(+(p.pot || p.ovr)); });
      });
    }
    profileCache = ranks.map(function (r, i) {
      var x = i / (CLASS_SIZE - 1);
      var dOvr = 74 - 20 * Math.pow(x, 0.7), dPot = 90 - 30 * Math.pow(x, 0.55);
      function mean(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
      var w = Math.min(1, r.ovr.length / 4);
      return {
        ovr: r.ovr.length ? w * mean(r.ovr) + (1 - w) * dOvr : dOvr,
        pot: r.pot.length ? w * mean(r.pot) + (1 - w) * dPot : dPot
      };
    });
    return profileCache;
  }

  function randomPersonality(rng) {
    function v() { return Math.round(clamp(50 + gauss(rng) * 18, 0, 100)); }
    return { loyalty: v(), winning: v(), money: v(), market: v(), ego: v() };
  }

  function generateClass(state, year, rng) {
    rng = typeof rng === 'function' ? rng : seeded(state, 'class' + year);
    var P = prog(), shapes = attrShapes(), profile = classProfile();
    var used = {}, out = [];
    Object.keys((state && state.players) || {}).forEach(function (id) { var p = state.players[id]; if (p && p.name) used[p.name] = true; });
    for (var i = 0; i < CLASS_SIZE; i++) {
      var name, tries = 0;
      do { name = FIRST[Math.floor(rng() * FIRST.length)] + ' ' + LAST[Math.floor(rng() * LAST.length)]; } while (used[name] && ++tries < 50);
      used[name] = true;
      var r = rng(), pi = 0, acc = 0;
      for (; pi < POSITIONS.length - 1; pi++) { acc += POS_SHARE[pi]; if (r < acc) break; }
      var pos = POSITIONS[pi], body = POS_BODY[pos];
      var ar = rng(), age = ar < 0.25 ? 19 : ar < 0.55 ? 20 : ar < 0.8 ? 21 : 22;
      var prof = profile[i];
      var ovr = Math.round(clamp(prof.ovr + gauss(rng) * 2.5 + (age - 20.5) * 1.2, 40, 82));
      var pot = Math.round(clamp(prof.pot + gauss(rng) * 3 - (age - 20.5) * 1.5, 50, 97));
      if (pot < ovr + 1) pot = ovr + 1 + Math.floor(rng() * 3);
      var sh = shapes[pos], attrs = {};
      (P ? P.ATTR_KEYS : []).forEach(function (k) { attrs[k] = Math.round(clamp(ovr + sh.d[k] + gauss(rng) * sh.sd[k], 25, 99)); });
      var ht = Math.round(body[0] + gauss(rng) * body[1]);
      var p = {
        id: 'gen' + year + (i < 9 ? '0' : '') + (i + 1), name: name, team: 'DRAFT', pos: pos, age: age, ht: ht,
        wt: Math.round(body[2] + (ht - body[0]) * 6 + gauss(rng) * body[3]),
        ovr: ovr, pot: pot, nbaId: null, injury: null, attrs: attrs, face: null, fictional: true,
        stats: { g: 0, mpg: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgp: 0, tpp: 0, ftp: 0 },
        draftYear: year, realPick: null, arrivalYear: year + 1, undrafted: false,
        personality: randomPersonality(rng)
      };
      if (P) {
        p.ovr = P.weightedOvr(attrs, pos) + sh.off; // calibration like a real player
        P.setOvr(p, ovr, { keepPot: true });
        p.pot = pot;
      }
      out.push(p);
    }
    // Shuffle so ids do not reveal the rank
    for (var j = out.length - 1; j > 0; j--) { var k = Math.floor(rng() * (j + 1)), t = out[j]; out[j] = out[k]; out[k] = t; }
    return out;
  }

  function normalizeProspect(src, year, rng) {
    var p = JSON.parse(JSON.stringify(src));
    p.team = 'DRAFT';
    p.draftYear = year;
    if (p.arrivalYear == null) p.arrivalYear = year + 1;
    p.undrafted = !!p.undrafted;
    if (p.pot == null || p.pot < p.ovr) p.pot = p.ovr;
    p.contract = null;
    p.yearsPro = 0; p.yearsWithTeam = 0; p.draft = null;
    if (!p.personality) p.personality = randomPersonality(rng);
    if (p.mood == null) p.mood = 50;
    p.stashedUntil = null; p.gleague = false;
    p.careerStats = p.careerStats || []; p.awards = p.awards || [];
    p.retired = false; p.hof = false;
    if (p.injury === undefined) p.injury = null;
    return p;
  }

  // Puts the year's class into state.players (team "DRAFT"). Returns the prospect ids.
  function loadClass(state, year) {
    year = year != null ? year : state.year;
    state.players = state.players || {};
    state.draftClasses = state.draftClasses || {};
    if (state.draftClasses[year]) return state.draftClasses[year].slice();
    var rng = seeded(state, 'prospects' + year);
    var D = root && root.DRAFTS, real = year < FICTIONAL_FROM && D && D[year] && D[year].length ? D[year] : null;
    var list = real ? real.map(function (x) { return normalizeProspect(x, year, rng); }) : generateClass(state, year, rng).map(function (x) { return normalizeProspect(x, year, rng); });
    var ids = [];
    list.forEach(function (p) {
      var ex = state.players[p.id];
      if (ex && ex.team !== 'DRAFT') return; // already in the league
      if (ex) {
        // Loaded earlier (for example by LEAGUE.newLeague): keep it, fill what is missing
        Object.keys(p).forEach(function (k) { if (ex[k] === undefined || ex[k] === null && p[k] !== null && k !== 'contract' && k !== 'draft' && k !== 'stashedUntil') ex[k] = p[k]; });
        ex.draftYear = year;
        if (ex.arrivalYear == null) ex.arrivalYear = year + 1;
      } else state.players[p.id] = p;
      ids.push(p.id);
    });
    state.draftClasses[year] = ids;
    return ids.slice();
  }
  function pool(state, year) {
    var ids = loadClass(state, year);
    return ids.filter(function (id) { var p = state.players[id]; return p && p.team === 'DRAFT'; });
  }

  // ---------------------------------------------------------------------------
  // Scouting view: exact for the user, noisy for AI teams (scouting budget reduces the noise)
  // ---------------------------------------------------------------------------
  function scoutLevel(state, abbr) {
    var t = teams(state)[abbr];
    var v = t && t.budget && t.budget.scouting;
    if (v == null || isNaN(+v)) return 0.5;
    v = +v;
    if (v <= 1) return clamp(v, 0, 1);
    if (v <= 100) return clamp(v / 100, 0, 1);
    var tot = 0, n = 0;
    teamList(state).forEach(function (a) { var b = teams(state)[a].budget; if (b && +b.scouting > 0) { tot += +b.scouting; n++; } });
    return n ? clamp(0.5 * v / (tot / n), 0, 1) : 0.5;
  }
  function view(state, abbr, id) {
    var p = state.players[id];
    if (!p) return null;
    if (abbr === state.userTeam) return { ovr: p.ovr, pot: p.pot };
    var sd = 4 - 2.8 * scoutLevel(state, abbr);
    var r = mulberry32(hashStr(abbr + ':' + id + ':' + (state.rngSeed || 0)));
    return { ovr: Math.round(p.ovr + gauss(r) * sd * 0.5), pot: Math.round(p.pot + gauss(r) * sd) };
  }

  // ---------------------------------------------------------------------------
  // The draft
  // ---------------------------------------------------------------------------
  function startDraft(state, year) {
    year = year != null ? year : state.year;
    if (!state.draft || state.draft.year !== year) state.draft = { year: year, lottery: null, order: null, index: 0, done: false };
    if (!state.draft.order) {
      loadClass(state, year);
      var slots = order(state, year);
      applyRollovers(state, slots);
      state.draft.order = slots;
      state.draft.index = 0;
      state.draft.done = false;
    }
    return state.draft;
  }
  function current(state) {
    var d = state.draft;
    if (!d || !d.order || d.done) return null;
    return d.order[d.index] || null;
  }

  function needBonus(state, abbr) {
    var share = { G: 0, W: 0, B: 0 }, tot = 0;
    Object.keys(state.players).forEach(function (id) {
      var p = state.players[id];
      if (!p || p.team !== abbr || p.retired || isStashed(p)) return;
      var w = Math.max(0, p.ovr - 60);
      share[posGroup(p.pos)] += w; tot += w;
    });
    var ideal = { G: 0.4, W: 0.2, B: 0.4 }, out = {};
    Object.keys(ideal).forEach(function (g) { out[g] = tot ? clamp((ideal[g] - share[g] / tot) * 6, -1.5, 1.5) : 0; });
    return out;
  }

  function aiChoice(state, abbr, year) {
    var ids = pool(state, year);
    var isUser = abbr === state.userTeam;
    var need = needBonus(state, abbr);
    var rng = seeded(state, 'aipick' + year + ':' + (state.draft ? state.draft.index : 0) + ':' + abbr);
    var best = null, bestV = -1e9;
    ids.forEach(function (id) {
      var p = state.players[id];
      if (p.undrafted && !isUser) return; // real undrafted players go undrafted unless the user takes them
      var v = view(state, abbr, id);
      var val = 0.62 * v.pot + 0.38 * v.ovr + need[posGroup(p.pos)] + gauss(rng) * 0.8;
      if (val > bestV) { bestV = val; best = id; }
    });
    if (!best && ids.length) best = ids[0];
    return best;
  }

  // aiPick(state, abbr) makes the current pick for abbr. With a slot (from order()), it makes that
  // pick; any earlier picks still open (for example the user's, when the caller skipped it) are
  // made first by the same logic, so the draft always runs in order.
  function aiPick(state, abbr, slotArg) {
    var d = startDraft(state);
    var slot = current(state);
    if (!slot) return { ok: false, reason: 'The draft is over.' };
    if (slotArg && slotArg.overall != null) {
      var target = d.order[slotArg.overall - 1];
      if (!target || target.player) return { ok: false, reason: 'Pick ' + slotArg.overall + ' was already made.' };
      while (current(state) && current(state) !== target) {
        var c = current(state), cid = aiChoice(state, c.team, d.year);
        if (!cid) return { ok: false, reason: 'No prospects left.' };
        c.auto = true;
        pick(state, c.team, cid);
      }
      slot = current(state);
      if (!slot) return { ok: false, reason: 'The draft is over.' };
    }
    abbr = slot.team;
    var id = aiChoice(state, abbr, d.year);
    if (!id) return { ok: false, reason: 'No prospects left.' };
    return pick(state, abbr, id);
  }

  function pick(state, abbr, prospectId) {
    var d = startDraft(state);
    var slot = current(state);
    if (!slot) return { ok: false, reason: 'The draft is over.' };
    if (slot.team !== abbr) return { ok: false, reason: 'It is ' + slot.team + "'s pick, not " + abbr + "'s." };
    var p = state.players[prospectId];
    if (!p || p.team !== 'DRAFT' || p.draftYear !== d.year) return { ok: false, reason: 'That player is not in the ' + d.year + ' draft pool.' };
    p.team = abbr;
    p.draft = { year: d.year, round: slot.round, pick: slot.overall, team: abbr };
    p.yearsPro = 0; p.yearsWithTeam = 0;
    p.contract = emptyContract();
    p.undrafted = false;
    // arrivalYear is the season-ending year of his first NBA season (normally draft year + 1)
    if (p.arrivalYear != null && +p.arrivalYear > d.year + 1) {
      p.stashedUntil = +p.arrivalYear;
      p.injury = { type: 'Playing overseas', games: 999 };
    }
    slot.player = prospectId;
    addTx(state, d.year, 'draft', teamName(state, abbr) + ' select ' + p.name + ' (' + p.pos + ') with pick ' + slot.overall +
      (slot.via ? ' (from ' + slot.via + ')' : '') + (p.stashedUntil ? '; he stays overseas until ' + p.stashedUntil : '') + '.', [prospectId]);
    if (slot.overall === 1) addNews(state, d.year, p.name + ' goes first overall', 'The ' + teamName(state, abbr) + ' took ' + p.name + ' with the first pick of the ' + d.year + ' draft.', [prospectId]);
    d.index++;
    if (d.index >= d.order.length) finish(state);
    return { ok: true, id: prospectId, slot: slot };
  }

  // Runs AI picks until the user's turn (opts.stopAtUser, default true) or the end.
  function simPicks(state, opts) {
    opts = opts || {};
    var stop = opts.stopAtUser !== false, made = [], max = opts.count != null ? opts.count : 1e9;
    startDraft(state);
    while (made.length < max) {
      var slot = current(state);
      if (!slot) break;
      if (stop && slot.team === state.userTeam) break;
      var r = aiPick(state, slot.team);
      if (!r.ok) break;
      made.push(r);
    }
    return made;
  }

  // After the last pick: everyone left (and real undrafted players) becomes a free agent.
  function finish(state) {
    var d = state.draft;
    if (!d || d.done && d.finished) return;
    d.done = true; d.finished = true;
    var leftover = pool(state, d.year), named = [];
    leftover.forEach(function (id) {
      var p = state.players[id];
      p.team = 'FA';
      p.contract = emptyContract();
      p.draft = null;
      p.undraftedFA = true;
      if (p.undrafted) named.push(p.name);
    });
    if (leftover.length) addTx(state, d.year, 'sign', leftover.length + ' undrafted players became free agents' + (named.length ? ', including ' + named.slice(0, 6).join(', ') : '') + '.', leftover);
    var explicit = ownPicksExplicit(state);
    teamList(state).forEach(function (a) {
      var t = teams(state)[a];
      if (t.picks) t.picks = t.picks.filter(function (pk) { return +pk.year > d.year; });
    });
    if (explicit) ensurePicks(state, 7, d.year + 1);
  }

  // ---------------------------------------------------------------------------
  // Rookie contracts
  // ---------------------------------------------------------------------------
  function capRatio(year) {
    var r = cbaRules(year);
    if (r && r.cap) return r.cap / 58044000;
    return Math.pow(1.045, Math.max(0, year - 2013));
  }
  function rookieSalaries(pickNo, start) {
    var r = cbaRules(start), out = null;
    if (r && typeof r.rookieScale === 'function') {
      var v = null;
      try { v = r.rookieScale(pickNo); } catch (e) { v = null; }
      if (Array.isArray(v) && v.length) out = v.slice(0, 4).map(function (x) { return +(x && x.amount != null ? x.amount : x); });
      else if (v && typeof v === 'object' && v.salaries) out = v.salaries.slice(0, 4).map(function (x) { return +(x.amount != null ? x.amount : x); });
      else if (v && typeof v === 'object' && v.amount) v = +v.amount;
      if (!out && typeof v === 'number' && v > 0) out = [v, v * 1.047, v * 1.094, v * 1.094 * (1.26 + 0.35 * (pickNo - 1) / 29)];
    }
    if (!out || out.some(function (x) { return !(x > 0); })) {
      var base = 834000 + 2871000 * (0.5 * Math.exp(-(pickNo - 1) / 5) + 0.5 * (30 - pickNo) / 29);
      var a = base * 1.2 * capRatio(start);
      out = [a, a * 1.047, a * 1.094, a * 1.094 * (1.26 + 0.35 * (pickNo - 1) / 29)];
    }
    return out.map(function (x, i) { return { year: start + i, amount: Math.round(x) }; });
  }
  function minSalary(yearsPro, year) {
    var r = cbaRules(year);
    if (r && typeof r.minSalary === 'function') {
      try { var v = +r.minSalary(yearsPro); if (v > 0) return v; } catch (e) { /* fall back */ }
    }
    return Math.round((yearsPro <= 0 ? 490180 : 762195) * capRatio(year));
  }
  function signOne(state, p, signYear) {
    var start = signYear + 1, salaries;
    var c = { salaries: [], option: null, rookie: true, twoWay: false, signedYear: signYear };
    if (p.draft && p.draft.round === 1) {
      salaries = rookieSalaries(p.draft.pick, start);
      c.option = { year: start + salaries.length - 1, type: 'team' };
    } else {
      salaries = [{ year: start, amount: minSalary(0, start) }, { year: start + 1, amount: minSalary(1, start + 1) }];
      c.rookie = false;
    }
    c.salaries = salaries;
    p.contract = c;
    p.salary = salaries[0].amount;
    p.contractEnd = salaries[salaries.length - 1].year;
    addTx(state, signYear, 'sign', teamName(state, p.team) + ' signed ' + (p.draft && p.draft.round === 1 ? 'first-round pick ' : 'second-round pick ') + p.name +
      ' (' + salaries.length + ' years, $' + (salaries[0].amount / 1e6).toFixed(2) + 'M first season).', [p.id]);
  }

  // Signs this year's draftees on NBA teams and brings stashed players over when they arrive.
  function signRookies(state) {
    var year = state.draft && state.draft.year != null ? state.draft.year : state.year;
    var signed = [], arrived = [];
    // The draft is over once rookies sign: open picks (if the caller skipped any) are made now
    if (state.draft && state.draft.order && !state.draft.done) {
      while (current(state)) {
        var c = current(state), cid = aiChoice(state, c.team, year);
        if (!cid) break;
        c.auto = true;
        pick(state, c.team, cid);
      }
      if (!state.draft.done) finish(state);
    }
    Object.keys(state.players || {}).forEach(function (id) {
      var p = state.players[id];
      if (!p || p.retired || !p.draft || !isTeam(state, p.team)) return;
      var hasDeal = p.contract && p.contract.salaries && p.contract.salaries.length;
      if (p.stashedUntil != null) {
        if (+p.stashedUntil > year + 1) return; // still overseas next season
        p.stashedUntil = null;
        if (p.injury && p.injury.type === 'Playing overseas') p.injury = null;
        arrived.push(id);
        if (!hasDeal) { signOne(state, p, year); signed.push(id); }
        addTx(state, year, 'sign', p.name + ' arrives from overseas to join the ' + teamName(state, p.team) + '.', [id]);
        return;
      }
      // This year's picks, plus earlier picks who came over without a deal
      if (p.draft.year <= year && !hasDeal && (!p.contract || p.contract.signedYear == null)) { signOne(state, p, year); signed.push(id); }
    });
    return { signed: signed, arrived: arrived };
  }

  // Players who count against the roster (stashed players do not).
  function rosterCount(state, abbr) {
    var n = 0;
    Object.keys(state.players || {}).forEach(function (id) {
      var p = state.players[id];
      if (p && p.team === abbr && !p.retired && !isStashed(p)) n++;
    });
    return n;
  }

  var DRAFT = {
    lottery: lottery,
    order: order,
    aiPick: aiPick,
    pick: pick,
    signRookies: signRookies,
    startDraft: startDraft,
    current: current,
    simPicks: simPicks,
    finish: finish,
    loadClass: loadClass,
    generateClass: generateClass,
    view: view,
    ensurePicks: ensurePicks,
    rosterCount: rosterCount,
    isStashed: isStashed,
    lotteryTeams: lotteryTeams,
    eraOdds: eraOdds,
    FICTIONAL_FROM: FICTIONAL_FROM,
    ODDS_1994: ODDS_1994,
    ODDS_2019: ODDS_2019
  };

  if (root) root.DRAFT = DRAFT;
  if (typeof module !== 'undefined' && module.exports) module.exports = DRAFT;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
