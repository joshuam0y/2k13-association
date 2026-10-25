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
  // Protection for one draft: { top, until, byYear: { year: topN }, range: [lo, hi], extinguish, then }.
  // top (or byYear[year]) protects picks 1..N; range protects lo..hi as well (second round: overall picks
  // when N is above 30). Nothing is protected after "until".
  function topFor(prot, year) {
    if (!prot) return null;
    if (prot.byYear && prot.byYear[year] != null) return +prot.byYear[year];
    return prot.top != null ? +prot.top : null;
  }
  function protectedNow(prot, year, overall, inRound, round) {
    if (!prot) return false;
    if (prot.until != null && year > +prot.until) return false;
    var top = topFor(prot, year), rg = Array.isArray(prot.range) && prot.range.length === 2 ? prot.range : null;
    if (top == null && !rg) return false;
    var big = (top != null && top > 30) || (rg && +rg[1] > 30);
    var n = round === 1 ? overall : (big ? overall : inRound);
    if (top != null && n <= top) return true;
    return !!(rg && n >= +rg[0] && n <= +rg[1]);
  }
  // Plain text for a protection, for the draft order and trade screens.
  function protectionText(prot, year) {
    if (!prot) return '';
    var top = topFor(prot, year), rg = Array.isArray(prot.range) ? prot.range : null, parts = [];
    if (prot.until != null && year != null && year > +prot.until) return prot.extinguish ? 'Protection ended' : 'Unprotected';
    if (top != null) parts.push(top === 1 ? 'Top 1 protected' : 'Top ' + top + ' protected');
    if (rg) parts.push((parts.length ? 'and ' : 'Protected ') + rg[0] + '-' + rg[1]);
    var txt = parts.join(' ');
    if (prot.until != null && (year == null || +prot.until > year)) txt += ' (through ' + prot.until + ')';
    if (prot.then) txt += '. ' + String(prot.then).replace(/^./, function (c) { return c.toUpperCase(); });
    return txt;
  }

  // The full order for a year's draft: lottery result (or projection by record), then the rest
  // by record; second round by record. Each slot carries the owner after trades and protections.
  function order(state, year) {
    year = year != null ? year : state.year;
    cleanClasses(state); // the draft page lists the class right after the order: no duplicates or NBA veterans in it
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
          slot.protection = f.entry.protection || null;
          if (protectedNow(f.entry.protection, year, overall, i + 1, round)) slot.protectedFor = f.holder;
          else { slot.team = f.holder; slot.via = orig; }
        }
        slots.push(slot);
      });
    });
    applySwaps(state, year, slots);
    return slots;
  }

  // Pick swaps: a pick entry with swap: "ATL" lets ATL trade its least favorable pick of that round
  // for this one when this one is better (the owner of the swap right gets the better pick).
  function applySwaps(state, year, slots) {
    teamList(state).forEach(function (a) {
      (teams(state)[a].picks || []).forEach(function (pk) {
        if (!pk.swap || +pk.year !== year || !isTeam(state, pk.swap)) return;
        var sw = pk.swap, round = +pk.round;
        var target = null, mine = null;
        slots.forEach(function (sl) {
          if (sl.round !== round) return;
          if (sl.original === pk.original && !target) target = sl;
          if (sl.team === sw && (!mine || sl.overall > mine.overall)) mine = sl;
        });
        if (!target || !mine || target === mine || target.team === sw || target.overall >= mine.overall) return;
        var other = target.team;
        target.team = sw; target.via = target.original !== sw ? target.original : null; target.swapped = sw;
        mine.team = other; mine.via = mine.original !== other ? mine.original : null; mine.swapped = sw;
      });
    });
  }

  // Protected picks that did not convey stay with the original team and roll to next year, still
  // protected through "until". After the last protected year the pick conveys unprotected, unless
  // protection.then says it turns into second-round picks.
  function removeOwn(state, year, round, original) {
    var t = teams(state)[original];
    if (!t || !t.picks) return;
    t.picks = t.picks.filter(function (pk) { return !(+pk.year === year && +pk.round === round && pk.original === original); });
  }
  // Second-round picks named in an extinguished pick's "then" text ("becomes PHI 2015 and 2016 2nd round picks").
  function thenSeconds(then, fromYear) {
    var t = String(then || '');
    if (!/2nd|second/i.test(t)) return [];
    var cut = Math.max(t.toLowerCase().lastIndexOf('becomes'), t.toLowerCase().lastIndexOf('else'));
    var part = cut >= 0 ? t.slice(cut) : t, years = [];
    (part.match(/\b20\d\d\b/g) || []).forEach(function (y) { y = +y; if (y >= fromYear && years.indexOf(y) < 0) years.push(y); });
    return years.length ? years : [fromYear + 1];
  }
  function giveSecond(state, slots, holderAbbr, original, y) {
    var holder = teams(state)[holderAbbr], own = findPick(state, y, 2, original);
    if (own && own.holder !== original) return false; // already owed elsewhere
    if (own) {
      teams(state)[original].picks = teams(state)[original].picks.filter(function (x) { return x !== own.entry; });
      own.entry.protection = null;
      holder.picks.push(own.entry);
    } else holder.picks.push({ year: y, round: 2, original: original, protection: null });
    slots.forEach(function (sl) { if (sl.year === y && sl.round === 2 && sl.original === original && sl.team === original) { sl.team = holderAbbr; sl.via = original; } });
    return true;
  }
  function applyRollovers(state, slots) {
    slots.forEach(function (s) {
      if (!s.protectedFor) return;
      var f = findPick(state, s.year, s.round, s.original);
      if (!f || f.holder !== s.protectedFor) return;
      var pk = f.entry, prot = pk.protection || {};
      var last = prot.until == null || s.year >= +prot.until;
      if (last && prot.extinguish) {
        // The pick is gone: it stays with the original team, and the holder gets what "then" names
        var holder = teams(state)[f.holder];
        holder.picks = holder.picks.filter(function (x) { return x !== pk; });
        var given = s.round === 1 ? thenSeconds(prot.then, s.year).filter(function (y) { return giveSecond(state, slots, f.holder, s.original, y); }) : [];
        addTx(state, s.year, 'draft', 'The ' + s.original + ' pick owed to ' + s.protectedFor + ' was protected (' + s.overall +
          ') and is extinguished' + (given.length ? '; ' + s.protectedFor + ' gets ' + s.original + ' second-round picks (' + given.join(', ') + ') instead.' : '.'), []);
        return;
      }
      pk.year = s.year + 1;
      if (prot.until == null || pk.year > +prot.until) pk.protection = null;
      // The original team no longer owns its own pick that year: it now belongs to the holder
      removeOwn(state, pk.year, s.round, s.original);
      addTx(state, s.year, 'draft', 'The ' + s.original + ' pick owed to ' + s.protectedFor + ' was protected (' + s.overall +
        ') and rolls over to ' + pk.year + (pk.protection ? ' (' + protectionText(pk.protection, pk.year).split('.')[0].toLowerCase() + ')' : ' unprotected') + '.', []);
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
    migrateRights(state);
    cleanClasses(state);
    if (state.draftClasses[year]) return state.draftClasses[year].slice();
    var rng = seeded(state, 'prospects' + year);
    var D = root && root.DRAFTS, real = year < FICTIONAL_FROM && D && D[year] && D[year].length ? D[year] : null;
    var list;
    // players whose NBA rights a team already holds (drafted before 2013) are never in a class
    if (real) list = real.filter(function (x) { return x && !x.rights; }).map(function (x) { return normalizeProspect(x, year, rng); });
    else {
      // fictional classes from js/draft-gen.js (window.DRAFTGEN), with the built-in generator as the fallback
      var G = (root && root.DRAFTGEN) || null;
      if (!G && typeof require === 'function') { try { G = require('./draft-gen.js'); } catch (e) { G = null; } }
      var gen = null;
      if (G && typeof G.generate === 'function') { try { gen = G.generate(year, rng, { used: state }); } catch (e) { gen = null; } }
      if (!gen || !gen.length) gen = generateClass(state, year, rng);
      list = gen.map(function (x) { return normalizeProspect(x, year, rng); });
    }
    var ids = [], idx = leagueIndex(state);
    list.forEach(function (p) {
      var ex = state.players[p.id];
      if (ex && ex.team !== 'DRAFT') return; // already in the league
      var dup = ex ? null : alreadyInLeague(state, p, idx);
      if (dup === true) { returnToFreeAgency(state, p); state.players[p.id] = p; return; } // a former NBA player: free agency
      if (dup) return; // the same person under another id
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
    var idx = leagueIndex(state);
    return ids.filter(function (id) { var p = state.players[id]; return p && p.team === 'DRAFT' && !p.rights && !alreadyInLeague(state, p, idx); });
  }

  // ---------------------------------------------------------------------------
  // Nobody already in the league can be drafted: a prospect is skipped when a player who is not a
  // prospect (on a roster, a free agent, stashed or retired) has his id, his NBA.com id, or his exact
  // name and birth year, or when he already played in the NBA (data flag returning, or real seasons
  // before 2012-13).
  // ---------------------------------------------------------------------------
  function foldName(s) {
    s = String(s || '');
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function birthYear(state, p) {
    if (!p || p.age == null) return null;
    if (p.team === 'DRAFT' && p.draftYear != null) return +p.draftYear - p.age;
    if (p.retired && p.retiredYear) return +p.retiredYear - p.age;
    return (state.year || 2013) - p.age;
  }
  // { names: { foldedName: [{ id, by }] }, nba: { nbaId: id } } of every player who is not a prospect
  function leagueIndex(state) {
    var idx = { names: {}, nba: {} }, ps = state.players || {};
    Object.keys(ps).forEach(function (id) {
      var q = ps[id];
      if (!q || q.team === 'DRAFT' || !q.name) return;
      var k = foldName(q.name);
      (idx.names[k] = idx.names[k] || []).push({ id: id, by: birthYear(state, q) });
      if (q.nbaId) idx.nba[q.nbaId] = id;
    });
    return idx;
  }
  function playedBefore(p) {
    if (!p) return false;
    if (p.returning) return true;
    var CP = root && root.CAREER_PRIOR;
    return !!(CP && CP[p.id] && CP[p.id].length);
  }
  // The player already in the league that this prospect duplicates, true when he played in the NBA
  // before his class, or null when he is a genuine prospect.
  function alreadyInLeague(state, p, idx) {
    if (!p) return null;
    if (playedBefore(p)) return true;
    var ex = state.players && state.players[p.id];
    if (ex && ex !== p && ex.team !== 'DRAFT') return ex;
    idx = idx || leagueIndex(state);
    if (p.nbaId && idx.nba[p.nbaId] && idx.nba[p.nbaId] !== p.id) return state.players[idx.nba[p.nbaId]];
    var by = birthYear(state, p), list = idx.names[foldName(p.name)] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== p.id && by != null && list[i].by === by) return state.players[list[i].id];
    }
    return null;
  }
  // A former NBA player listed with a class (back from overseas): a free agent with his real NBA past
  // (data priorNba: { yearsPro, draft }), overseas until his return season.
  function returnToFreeAgency(state, p) {
    var pr = p.priorNba || {};
    p.team = 'FA';
    p.contract = emptyContract();
    p.undrafted = !pr.draft;
    p.draft = pr.draft ? JSON.parse(JSON.stringify(pr.draft)) : null;
    if (pr.draft) { p.draftYear = pr.draft.year; p.realPick = pr.draft.pick; }
    p.yearsPro = pr.yearsPro != null ? +pr.yearsPro : Math.max(1, p.yearsPro || 0);
    p.yearsWithTeam = 0;
    var now = state.year || 2013;
    if (p.arrivalYear != null && +p.arrivalYear > now) {
      p.stashedUntil = +p.arrivalYear;
      p.injury = { type: 'Playing overseas', games: 999 };
    }
  }
  // Takes duplicates and former NBA players out of every class in the save (the prospects that
  // LEAGUE.newLeague loaded included). Cheap to call again: it reruns only when the player count changes.
  var cleaned = typeof WeakMap === 'function' ? new WeakMap() : null;
  function cleanClasses(state) {
    if (!state || !state.players) return [];
    var sig = Object.keys(state.players).length + ':' + (state.year || 0);
    if (cleaned && cleaned.get(state) === sig) return [];
    var idx = leagueIndex(state), out = [];
    Object.keys(state.players).forEach(function (id) {
      var p = state.players[id];
      if (!p || p.team !== 'DRAFT') return;
      var dup = alreadyInLeague(state, p, idx);
      if (!dup) return;
      if (dup === true) returnToFreeAgency(state, p);
      else if (!(p.careerStats && p.careerStats.length)) delete state.players[id];
      else return;
      out.push({ id: id, name: p.name, reason: dup === true ? 'played in the NBA before' : 'same player as ' + dup.id });
      Object.keys(state.draftClasses || {}).forEach(function (y) {
        state.draftClasses[y] = state.draftClasses[y].filter(function (x) { return x !== id; });
      });
    });
    if (cleaned) cleaned.set(state, Object.keys(state.players).length + ':' + (state.year || 0));
    return out;
  }

  // ---------------------------------------------------------------------------
  // Draft rights held before 2013 (window.DRAFT_RIGHTS, data/drafts.js): players drafted in 2012 or
  // earlier who were still overseas in October 2012. LEAGUE.newLeague puts them on the rights team
  // as stash players; signRookies signs them when they arrive.
  // ---------------------------------------------------------------------------
  function rightsList() {
    var R = root && root.DRAFT_RIGHTS;
    return Array.isArray(R) ? R : [];
  }
  // Saves made before the rights fix carry these players as prospects (team DRAFT) of their arrival
  // summer: they go to the rights team now, so nobody can draft them again.
  function migrateRights(state) {
    var players = (state && state.players) || {};
    rightsList().forEach(function (src) {
      var p = players[src.id], r = src.rights;
      if (!p || p.team !== 'DRAFT' || !r || !isTeam(state, r.team)) return;
      p.team = r.team;
      p.rights = JSON.parse(JSON.stringify(r));
      p.draftYear = r.draftYear; p.realPick = r.pick; p.undrafted = false;
      p.draft = { year: r.draftYear, round: r.pick <= 30 ? 1 : 2, pick: r.pick, team: r.draftedBy || r.team };
      p.contract = emptyContract();
      var now = state.year || 2013;
      if (src.arrivalYear != null && +src.arrivalYear > now) {
        p.stashedUntil = +src.arrivalYear;
        p.injury = { type: 'Playing overseas', games: 999 };
      }
      Object.keys(state.draftClasses || {}).forEach(function (y) {
        state.draftClasses[y] = state.draftClasses[y].filter(function (id) { return id !== src.id; });
      });
    });
  }

  // Contract for a rights player who comes over: not a rookie scale deal (he was drafted years
  // earlier), but a market deal at his arrival level, a little below the open market because the
  // team holds his rights. 3 years (2 for older or minimum players), 4.5% raises.
  function rightsSalaries(state, p, start) {
    var T = root && root.TARGETS && root.TARGETS[p.id];
    var lvl = T && T[start] != null ? +T[start] : p.ovr;
    var min = minSalary(0, start), r = cbaRules(start);
    var cap = (r && r.cap) || Math.round(58044000 * capRatio(start));
    var F = root && root.FA, amount = null;
    if (F && typeof F.marketValue === 'function') {
      var q = JSON.parse(JSON.stringify(p));
      q.ovr = lvl; q.injury = null; q.stats = null; q.stashedUntil = null; q.team = 'FA';
      try { amount = +F.marketValue(state, q, start); } catch (e) { amount = null; }
    }
    if (!(amount > 0)) amount = cap * clamp(0.012 + 0.006 * (lvl - 65), 0.015, 0.25);
    amount = Math.max(min, Math.round(amount * 0.85 / 10000) * 10000);
    var years = (p.age || 25) <= 27 ? 3 : 2;
    if (amount <= min * 1.5) years = 2;
    var out = [];
    for (var i = 0; i < years; i++) out.push({ year: start + i, amount: Math.round(amount * (1 + 0.045 * i)) });
    return out;
  }
  function signRights(state, p, signYear) {
    var start = signYear + 1, salaries = rightsSalaries(state, p, start);
    p.contract = { salaries: salaries, option: null, rookie: false, twoWay: false, signedYear: signYear, via: 'rights' };
    p.salary = salaries[0].amount;
    p.contractEnd = salaries[salaries.length - 1].year;
    p.yearsWithTeam = 0;
    addTx(state, signYear, 'sign', teamName(state, p.team) + ' signed ' + p.name + ', whose draft rights they held (' + salaries.length + ' years, $' +
      (salaries[0].amount / 1e6).toFixed(2) + 'M first season).', [p.id]);
  }

  // ---------------------------------------------------------------------------
  // Scouting view: exact for the user, a fixed amount of noise for AI teams (no budget effect)
  // ---------------------------------------------------------------------------
  var AI_SCOUT_SD = 2.6;
  function view(state, abbr, id) {
    var p = state.players[id];
    if (!p) return null;
    if (abbr === state.userTeam) return { ovr: p.ovr, pot: p.pot };
    var r = mulberry32(hashStr(abbr + ':' + id + ':' + (state.rngSeed || 0)));
    return { ovr: Math.round(p.ovr + gauss(r) * AI_SCOUT_SD * 0.5), pot: Math.round(p.pot + gauss(r) * AI_SCOUT_SD) };
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
      // protected picks in their last protected year that are extinguished: no pick entry is made for them
      var gone = {};
      slots.forEach(function (s) {
        if (!s.protectedFor) return;
        var f = findPick(state, s.year, s.round, s.original), pr = f && f.entry.protection;
        if (pr && pr.extinguish && (pr.until == null || s.year >= +pr.until)) gone[s.overall] = true;
      });
      applyRollovers(state, slots);
      // draft night trades: a protected pick that rolled over stays home tonight as the original team's
      // pick, so it gets a pick entry it can trade (entries for this draft are cleared in finish())
      slots.forEach(function (s) {
        if (gone[s.overall] || findPick(state, year, s.round, s.original) || !isTeam(state, s.team)) return;
        (teams(state)[s.team].picks = teams(state)[s.team].picks || []).push({ year: year, round: s.round, original: s.original, protection: null });
      });
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

  // How much need counts at this pick: teams take the best player available early (need only breaks
  // ties in the top 10), lean on it more from 11 to 30 and most in the second round. Contenders weigh
  // need a bit more than rebuilders.
  function needWeight(state, abbr) {
    var d = state.draft, slot = d && d.order ? d.order[d.index || 0] : null, n = slot ? slot.overall : 15;
    var w = n <= 10 ? 1 : n <= 30 ? 1.3 : 1.8;
    var dir = teams(state)[abbr] && teams(state)[abbr].direction;
    return w * (dir === 'contend' ? 1.25 : dir === 'rebuild' ? 0.8 : 1);
  }
  var lastReason = null;   // why the last AI pick was made, for the draft log
  function aiChoice(state, abbr, year) {
    var ids = pool(state, year);
    var isUser = abbr === state.userTeam;
    var need = needBonus(state, abbr), nw = needWeight(state, abbr);
    Object.keys(need).forEach(function (g) { need[g] *= nw; });
    var rng = seeded(state, 'aipick' + year + ':' + (state.draft ? state.draft.index : 0) + ':' + abbr);
    var best = null, bestV = -1e9;
    // Team profile: rebuilding or aging teams chase young upside, contenders want players who help now
    var tdir = teams(state)[abbr] && teams(state)[abbr].direction;
    var core = Object.keys(state.players).map(function (k) { return state.players[k]; })
      .filter(function (q) { return q && q.team === abbr && !q.retired && !isStashed(q); })
      .sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0); }).slice(0, 8);
    var coreAge = core.length ? core.reduce(function (t, q) { return t + (q.age || 26); }, 0) / core.length : 26;
    var youthWant = (tdir === 'rebuild' ? 1 : tdir === 'contend' ? 0.2 : 0.5) + (coreAge >= 29 ? 0.4 : coreAge >= 27.5 ? 0.2 : 0);
    var nowWant = tdir === 'contend' ? 1 : tdir === 'rebuild' ? 0 : 0.4;
    function fitBonus(q, v) {
      var youth = Math.max(0, 21 - (q.age || 21)) * 1.6 + Math.max(0, (v.pot || 0) - 80) * 0.12;
      var ready = Math.max(0, (v.ovr || 0) - 70) * 0.25;
      return youthWant * youth + nowWant * ready + need[posGroup(q.pos)] * 2.5;
    }
    ids.forEach(function (id) {
      var p = state.players[id];
      if (p.undrafted && !isUser) return; // real undrafted players go undrafted unless the user takes them
      var v = view(state, abbr, id);
      var val = 0.62 * v.pot + 0.38 * v.ovr + fitBonus(p, v) * 0.5 + gauss(rng) * 0.8;
      // Real classes: teams only know what scouts knew on draft night, so the real draft order is the
      // big board (Bennett goes high, Giannis around the middle of the first round). Hindsight counts a
      // little, plus noise, so the order is close to history but never exactly the same.
      // The stock comes from the pre-draft consensus board (boardRank) when known, else the real pick.
      var rank = p.boardRank || p.realPick;
      if (rank) {
        var stock = 95 - 14 * Math.log(Math.max(1, +rank));
        val = 0.75 * stock + 0.25 * (0.62 * v.pot + 0.38 * v.ovr) + fitBonus(p, v) + gauss(rng) * 2.5;
      }
      if (val > bestV) { bestV = val; best = id; }
    });
    if (!best && ids.length) best = ids[0];
    var bp = best && state.players[best];
    lastReason = bp && need[posGroup(bp.pos)] >= 0.9 ? { id: best, text: 'fills a need at ' + primaryPos(bp.pos) }
      : bp && youthWant >= 0.9 && (bp.age || 21) <= 19 ? { id: best, text: 'a young prospect for the rebuild' } : null;
    return best;
  }

  // aiPick(state, abbr) makes the current pick for abbr. With a slot (from order()), it makes that
  // pick; any earlier picks still open (for example the user's, when the caller skipped it) are
  // made first by the same logic, so the draft always runs in order.
  // Draft night trades between AI teams (js/trade.js, when loaded): checked once per AI pick on the
  // clock. A trade moves the slot to its new owner, who then makes the pick. Off with
  // state.settings.draftTrades === false.
  function draftNightTrade(state, d, slot) {
    var T = root && root.TRADE;
    if (!T || typeof T.draftNightTrade !== 'function' || slot.dntChecked || slot.team === state.userTeam) return;
    if (state.settings && state.settings.draftTrades === false) return;
    slot.dntChecked = true;
    try { T.draftNightTrade(state, seeded(state, 'dnt' + d.year + ':' + slot.overall)); } catch (e) { /* no trade */ }
  }

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
    draftNightTrade(state, d, slot);
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
    if (!p || p.team !== 'DRAFT' || p.draftYear !== d.year || p.rights) return { ok: false, reason: 'That player is not in the ' + d.year + ' draft pool.' };
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
    var why = lastReason && lastReason.id === prospectId && abbr !== state.userTeam ? lastReason.text : null;
    lastReason = null;
    if (why) slot.reason = why.charAt(0).toUpperCase() + why.slice(1);
    addTx(state, d.year, 'draft', teamName(state, abbr) + ' select ' + p.name + ' (' + p.pos + ') with pick ' + slot.overall +
      (slot.via ? ' (from ' + slot.via + ')' : '') + (p.stashedUntil ? '; he stays overseas until ' + p.stashedUntil : '') + (why ? '. ' + slot.reason : '') + '.', [prospectId]);
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
      // a real undrafted player who first played in the NBA later (overseas first) stays out of
      // free agency until his arrival season
      if (p.arrivalYear != null && +p.arrivalYear > d.year + 1) {
        p.stashedUntil = +p.arrivalYear;
        p.injury = { type: 'Playing overseas', games: 999 };
      }
      if (p.undrafted && !p.stashedUntil) named.push(p.name);
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
    var C = root && root.CBA, cc = null;
    if (p.draft && p.draft.round === 1 && C && typeof C.rookieContract === 'function') {
      // First-round picks sign at 120% of the rookie scale, like almost every real first-rounder
      try { cc = C.rookieContract(p.draft.pick, start, 1.2); } catch (e) { cc = null; }
      if (!cc || !cc.salaries || !cc.salaries.length || cc.salaries.some(function (x) { return !(x.amount > 0); })) cc = null;
    }
    if (cc) {
      c = cc; c.rookie = true; c.twoWay = false;
      salaries = cc.salaries;
    } else if (p.draft && p.draft.round === 1) {
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
        // he signs with whoever holds his rights now (stashed players can be traded)
        if (!hasDeal) { if (p.rights) signRights(state, p, year); else signOne(state, p, year); signed.push(id); }
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
    signRights: signRights,
    migrateRights: migrateRights,
    startDraft: startDraft,
    current: current,
    simPicks: simPicks,
    finish: finish,
    loadClass: loadClass,
    pool: pool,
    cleanClasses: cleanClasses,
    alreadyInLeague: alreadyInLeague,
    generateClass: generateClass,
    view: view,
    protectedNow: protectedNow,
    protectionText: protectionText,
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
