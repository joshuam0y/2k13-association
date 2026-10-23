/* All-Star Weekend events: All-Star Game, Rising Stars, Skills Challenge, Three-Point Contest, Slam Dunk Contest.
   window.ALLSTAR.weekend(state) builds the weekend once per season, after the All-Star rosters are named
   (state.allStars, from AWARDS.allStars at the break), and stores it in state.allStarWeekend[year].
   Everything is seeded (state.rngSeed + year), games are played with ENGINE.simGame on the picked rosters,
   and the winners go onto player.awards and into the news feed once.
   Formats follow the real event by season (season-ending year):
     Rising Stars: 2013-2014 Team Chuck vs Team Shaq (rookies and sophomores, drafted by the captains),
       2015-2020 USA vs World, 2021 not held, 2022 on a four-team mini tournament with a G League team.
     All-Star Game: East vs West through 2017, captains' draft 2018 to 2023, East vs West 2024,
       four-team tournament 2025 on (the Rising Stars winner is the fourth team).
   Classic script, plain JS. Also module.exports under Node. */
(function (root) {
  'use strict';
  var W = root;

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  function hashStr(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function gauss(rng) { var u = rng() || 1e-9, v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function r1(x) { return Math.round(x * 10) / 10; }
  function attr(p, k) { var a = p && p.attrs; return a && typeof a[k] === 'number' ? a[k] : ((p && p.ovr) || 60); }
  function lastName(name) { var parts = String(name || '').replace(/ (Jr\.|Sr\.|II|III|IV)$/, '').split(' '); return parts[parts.length - 1] || name; }
  function plain(s) { s = String(s || ''); return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s; }
  function mod(name) { return W[name] || null; }

  var ALL_STAR_MD = { 2013: '02-17', 2014: '02-16', 2015: '02-15', 2016: '02-14', 2017: '02-19', 2018: '02-18', 2019: '02-17',
    2020: '02-16', 2021: '03-07', 2022: '02-20', 2023: '02-19', 2024: '02-18', 2025: '02-16', 2026: '02-15' };
  function dateOf(year) {
    var L = mod('LEAGUE');
    var md = L && L.KEY_DATES && L.KEY_DATES.allStar ? L.KEY_DATES.allStar(year) : (ALL_STAR_MD[year] || '02-15');
    return year + '-' + md;
  }
  // Real host cities (season-ending year)
  var HOSTS = { 2013: 'Houston', 2014: 'New Orleans', 2015: 'New York', 2016: 'Toronto', 2017: 'New Orleans', 2018: 'Los Angeles',
    2019: 'Charlotte', 2020: 'Chicago', 2021: 'Atlanta', 2022: 'Cleveland', 2023: 'Salt Lake City', 2024: 'Indianapolis',
    2025: 'San Francisco', 2026: 'Los Angeles', 2027: 'Phoenix' };

  // Players born outside the United States (real players; generated prospects carry p.country)
  var INTL = ['Jonas Valanciunas', 'Enes Kanter', 'Bismack Biyombo', 'Nikola Vucevic', 'Jan Vesely', 'Donatas Motiejunas', 'Evan Fournier',
    'Andrew Nicholson', 'Tristan Thompson', 'Cory Joseph', 'Kelly Olynyk', 'Anthony Bennett', 'Giannis Antetokounmpo', 'Dennis Schroder',
    'Rudy Gobert', 'Steven Adams', 'Sergey Karasev', 'Nemanja Nedovic', 'Lucas Nogueira', 'Gorgui Dieng', 'Andrew Wiggins', 'Dante Exum',
    'Jusuf Nurkic', 'Clint Capela', 'Bojan Bogdanovic', 'Nik Stauskas', 'Tyler Ennis', 'Dario Saric', 'Kristaps Porzingis', 'Mario Hezonja',
    'Emmanuel Mudiay', 'Trey Lyles', 'Nikola Jokic', 'Raul Neto', 'Joel Embiid', 'Ben Simmons', 'Buddy Hield', 'Jamal Murray', 'Jakob Poeltl',
    'Domantas Sabonis', 'Dragan Bender', 'Juancho Hernangomez', 'Willy Hernangomez', 'Timothe Luwawu-Cabarrot', 'Thon Maker', 'Ivica Zubac',
    'Furkan Korkmaz', 'Lauri Markkanen', 'Frank Ntilikina', 'Bogdan Bogdanovic', 'Dillon Brooks', 'OG Anunoby', 'Luka Doncic',
    'Shai Gilgeous-Alexander', 'Deandre Ayton', 'Rodions Kurucs', 'Josh Okogie', 'RJ Barrett', 'Rui Hachimura', 'Brandon Clarke',
    'Nickeil Alexander-Walker', 'Goga Bitadze', 'Sekou Doumbouya', 'Luguentz Dort', 'Deni Avdija', 'Killian Hayes', 'Theo Maledon',
    'Aleksej Pokusevski', 'Victor Wembanyama', 'Josh Giddey', 'Franz Wagner', 'Alperen Sengun', 'Bennedict Mathurin', 'Dyson Daniels',
    'Andrew Nembhard', 'Pascal Siakam', 'Jonas Jerebko', 'Tomas Satoransky', 'Marc Gasol', 'Pau Gasol', 'Tony Parker', 'Manu Ginobili',
    'Dirk Nowitzki', 'Serge Ibaka', 'Luol Deng', 'Al Horford', 'Nicolas Batum', 'Boris Diaw', 'Danilo Gallinari', 'Marcin Gortat',
    'Goran Dragic', 'Nene', 'Andrew Bogut', 'Patty Mills', 'Ricky Rubio', 'Jose Calderon', 'Omer Asik', 'Hedo Turkoglu', 'Tiago Splitter',
    'Alexey Shved', 'Kevin Seraphin', 'Ersan Ilyasova', 'Marco Belinelli', 'Andrea Bargnani', 'Nikola Pekovic', 'Timofey Mozgov',
    'Mirza Teletovic', 'Ognjen Kuzmic', 'Joe Ingles', 'Matthew Dellavedova', 'Aron Baynes', 'Jock Landale', 'Josh Green', 'Dalano Banton',
    'Zach Edey', 'Shaedon Sharpe', 'Ousmane Dieng', 'Usman Garuba', 'Santi Aldama', 'Bilal Coulibaly', 'Alexandre Sarr',
    'Zaccharie Risacher', 'Tidjane Salaun', 'Nikola Topic', 'Kyrie Irving'];
  var INTL_SET = {};
  // Kyrie Irving was born in Australia but plays for the United States
  INTL.forEach(function (n) { if (n !== 'Kyrie Irving') INTL_SET[plain(n).toLowerCase()] = true; });
  function isIntl(p) {
    if (!p) return false;
    if (p.country) return p.country !== 'USA';
    return !!INTL_SET[plain(p.name).toLowerCase()];
  }

  // ---------------------------------------------------------------------------
  // League reads
  // ---------------------------------------------------------------------------
  function yearOf(state) { return (state && state.year) || 2013; }
  function statsOf(state, id) { var m = state.season && (state.season.playerStats || state.season.stats); return (m && m[id]) || null; }
  function perGame(t) {
    if (!t || !t.g) return null;
    var A = mod('AWARDS');
    if (A && A.perGame) return A.perGame(t);
    var g = t.g;
    return { g: g, ppg: (t.pts || 0) / g, rpg: ((t.oreb || 0) + (t.dreb || 0)) / g, apg: (t.ast || 0) / g, gmsc: (t.pts || 0) / g, mpg: (t.min || 0) / g };
  }
  function teamGames(state) {
    var m = 0, st = (state.season && state.season.standings) || {};
    Object.keys(st).forEach(function (a) { m = Math.max(m, (st[a].w || 0) + (st[a].l || 0)); });
    return m;
  }
  function injured(state, id) {
    var map = state.season && state.season.injuries;
    if (map) { var e = map[id]; return !!(e && e.games > 0); }
    var p = state.players[id];
    return !!(p && p.injury && p.injury.games > 0);
  }
  function nbaPlayers(state) {
    var out = [];
    for (var id in state.players) {
      var p = state.players[id];
      if (!p || p.retired || p.gleague || !state.teams[p.team]) continue;
      if (p.stashedUntil && p.stashedUntil > state.year) continue;
      out.push(p);
    }
    return out;
  }
  function lineOf(state, p) { return perGame(statsOf(state, p.id)) || { g: 0, ppg: 0, rpg: 0, apg: 0, gmsc: 0, mpg: 0 }; }
  function fanScore(state, p) {
    var l = lineOf(state, p);
    return l.gmsc + 0.6 * l.ppg + 0.2 * l.apg + 0.3 * ((p.ovr || 70) - 75);
  }

  // ---------------------------------------------------------------------------
  // Games: ENGINE.simGame on picked rosters, then scaled to All-Star scoring
  // ---------------------------------------------------------------------------
  function minutesFor(ids) {
    var w = ids.map(function (_, i) { return (i < 5 ? 1.25 : 1) - 0.03 * i; });
    var tot = w.reduce(function (s, x) { return s + x; }, 0), out = {};
    ids.forEach(function (id, i) { out[id] = Math.min(40, Math.round(w[i] * 240 / tot)); });
    return out;
  }
  function engineTeam(state, t) {
    var order = t.starters.concat(t.ids.filter(function (id) { return t.starters.indexOf(id) < 0; }));
    return { abbr: t.short, players: order.map(function (id) { return state.players[id]; }).filter(Boolean), starters: t.starters.slice(),
      minutes: minutesFor(order), strategy: { pace: 100, three: 85, defense: 'man', crash: 25 } };
  }
  // stochastic rounding keeps the totals right on average
  function sr(x, rng) { var f = Math.floor(x); return f + (rng() < x - f ? 1 : 0); }
  function rowPts(r) { return 2 * (r.fgm - r.tpm) + 3 * r.tpm + r.ftm; }
  // All-Star ball: more threes, few free throws, little defense
  var STYLE = { three: 1.3, ft: 0.45, stl: 0.75, blk: 0.6, pf: 0.35 };
  function basePts(box) {
    var s = 0;
    box.forEach(function (r) { s += 2 * (r.fgm - r.tpm) + 3 * STYLE.three * r.tpm + STYLE.ft * r.ftm; });
    return Math.max(1, s);
  }
  function scaleBox(box, f, minF, rng) {
    return box.map(function (r) {
      var twoA = sr((r.fga - r.tpa) * f, rng), twoM = Math.min(twoA, sr((r.fgm - r.tpm) * f, rng));
      var tpa = sr(r.tpa * f * STYLE.three, rng), tpm = Math.min(tpa, sr(r.tpm * f * STYLE.three, rng));
      var fta = sr(r.fta * f * STYLE.ft, rng), ftm = Math.min(fta, sr(r.ftm * f * STYLE.ft, rng));
      var o = { id: r.id, name: r.name, min: r1(r.min * minF), fgm: twoM + tpm, fga: twoA + tpa, tpm: tpm, tpa: tpa, ftm: ftm, fta: fta,
        oreb: sr(r.oreb * f, rng), dreb: sr(r.dreb * f, rng), ast: sr(r.ast * f, rng), stl: sr(r.stl * f * STYLE.stl, rng),
        blk: sr(r.blk * f * STYLE.blk, rng), tov: sr(r.tov * f * 0.8, rng), pf: sr(r.pf * f * STYLE.pf, rng), starter: !!r.starter };
      o.pts = rowPts(o);
      return o;
    });
  }
  function total(box) { return box.reduce(function (s, r) { return s + r.pts; }, 0); }
  function pickRow(box, rng, need) {
    var cands = box.filter(need);
    if (!cands.length) return null;
    var w = cands.map(function (r) { return 1 + r.fga; }), sum = w.reduce(function (s, x) { return s + x; }, 0), x = rng() * sum;
    for (var i = 0; i < cands.length; i++) { x -= w[i]; if (x <= 0) return cands[i]; }
    return cands[cands.length - 1];
  }
  // add or take away buckets so a side lands on an exact score
  function addPoints(box, n, rng) {
    var guard = 0;
    while (n > 0 && guard++ < 200) {
      var r = pickRow(box, rng, function (x) { return x.min > 0; }) || box[0];
      if (!r) return;
      if (n === 1) { r.ftm++; r.fta++; n -= 1; }
      else if (n >= 3 && rng() < 0.4) { r.fgm++; r.fga++; r.tpm++; r.tpa++; n -= 3; }
      else { r.fgm++; r.fga++; n -= 2; }
      r.pts = rowPts(r);
    }
  }
  function removePoints(box, n, rng) {
    var guard = 0;
    while (n > 0 && guard++ < 300) {
      var r;
      if (n === 1 && (r = pickRow(box, rng, function (x) { return x.ftm > 0; }))) { r.ftm--; n -= 1; }
      else if (n >= 3 && (r = pickRow(box, rng, function (x) { return x.tpm > 0; }))) { r.tpm--; r.fgm--; n -= 3; }
      else if ((r = pickRow(box, rng, function (x) { return x.fgm - x.tpm > 0; }))) { r.fgm--; n -= 2; }
      else if ((r = pickRow(box, rng, function (x) { return x.tpm > 0; }))) { r.tpm--; r.fgm--; n -= 3; }
      else return;
      r.pts = rowPts(r);
    }
  }
  function scaleQuarters(q, hs, as) {
    if (!q || !q.length) return [];
    var th = 0, ta = 0;
    q.forEach(function (x) { th += x[0]; ta += x[1]; });
    var out = q.map(function (x) { return [Math.round(x[0] * hs / Math.max(1, th)), Math.round(x[1] * as / Math.max(1, ta))]; });
    var sh = 0, sa = 0;
    out.forEach(function (x) { sh += x[0]; sa += x[1]; });
    var last = out[out.length - 1];
    last[0] = Math.max(0, last[0] + hs - sh); last[1] = Math.max(0, last[1] + as - sa);
    return out;
  }
  // mode: { target } a full game whose winner scores about target; { elam } first to elam points
  function playGame(state, label, home, away, rng, mode) {
    var E = mod('ENGINE');
    var res = E.simGame(engineTeam(state, home), engineTeam(state, away), rng,
      { neutral: true, pbp: false, injuries: {}, norms: state.season && state.season.norms });
    var hb = res.home.box, ab = res.away.box;
    var homeWon = res.home.pts > res.away.pts;
    var target = mode.elam || mode.target;
    var f = target / basePts(homeWon ? hb : ab);
    var minF = mode.elam ? clamp(f * 1.15, 0.15, 1) : 1;
    var H = scaleBox(hb, f, minF, rng), A = scaleBox(ab, f, minF, rng);
    var wb = homeWon ? H : A, lb = homeWon ? A : H;
    if (mode.elam) {
      var wt = total(wb);
      if (wt < target) addPoints(wb, target - wt + (rng() < 0.35 ? 1 : 0), rng);
      else if (wt > target + 2) removePoints(wb, wt - target - (rng() < 0.5 ? 1 : 0), rng);
      var lt = total(lb);
      if (lt >= target) removePoints(lb, lt - target + 1 + Math.floor(rng() * 6), rng);
    } else {
      if (total(wb) < target - 2) addPoints(wb, target - 2 - total(wb) + Math.floor(rng() * 4), rng);
      var d = total(wb) - total(lb);
      if (d <= 0) addPoints(wb, 1 - d + Math.floor(rng() * 4), rng);
    }
    var hs = total(H), as = total(A);
    return {
      label: label, elam: mode.elam || null,
      home: { key: home.key, name: home.name, pts: hs, box: H },
      away: { key: away.key, name: away.name, pts: as, box: A },
      quarters: mode.elam ? [] : scaleQuarters(res.quarters, hs, as),
      winner: hs > as ? home.key : away.key
    };
  }
  function gameValue(r) { return r.pts + 0.45 * (r.oreb + r.dreb) + 0.6 * r.ast + r.stl + r.blk - 0.5 * r.tov - 0.2 * (r.fga - r.fgm); }
  // MVP: the best line on the winning team over the games it played
  function mvpOf(state, games, teamKey) {
    var tot = {};
    games.forEach(function (g) {
      [g.home, g.away].forEach(function (side) {
        if (side.key !== teamKey) return;
        side.box.forEach(function (r) {
          var t = tot[r.id] || (tot[r.id] = { id: r.id, name: r.name, g: 0, pts: 0, reb: 0, ast: 0, tpm: 0, v: 0 });
          t.g++; t.pts += r.pts; t.reb += r.oreb + r.dreb; t.ast += r.ast; t.tpm += r.tpm; t.v += gameValue(r);
        });
      });
    });
    var best = null;
    Object.keys(tot).forEach(function (id) { if (!best || tot[id].v > best.v) best = tot[id]; });
    if (!best) return null;
    var p = state.players[best.id];
    return { id: best.id, name: (p && p.name) || best.name, team: teamKey, g: best.g, pts: best.pts, reb: best.reb, ast: best.ast, tpm: best.tpm };
  }
  function makeTeam(key, name, short, color, ids, extra) {
    var t = { key: key, name: name, short: short, color: color, ids: ids.slice(), starters: ids.slice(0, 5) };
    for (var k in extra || {}) t[k] = extra[k];
    return t;
  }

  // ---------------------------------------------------------------------------
  // Rising Stars
  // ---------------------------------------------------------------------------
  function rsFormat(year) { return year <= 2014 ? 'chuckShaq' : year === 2021 ? 'none' : year <= 2021 ? 'usaWorld' : 'tournament'; }
  var RS_NAMES = {
    2022: ['Team Barry', 'Team Isiah', 'Team Worthy', 'Team Payton'],
    2023: ['Team Jason', 'Team Joakim', 'Team Pau', 'Team Deron'],
    2024: ['Team Jalen', 'Team Detlef', 'Team Tamika', 'Team Pau'],
    2025: ['Team C-Webb', 'Team G-Hill', 'Team Mitch', 'Team T']
  };
  var COLORS = ['#c9a227', '#1d428a', '#c8102e', '#2e7d4f', '#6b3fa0', '#d0702c'];
  function rsScore(state, p) { var l = lineOf(state, p); return l.gmsc + 0.25 * l.ppg + 0.08 * (p.ovr || 60) + Math.min(l.mpg || 0, 34) * 0.08; }
  function rsPool(state) {
    var G = teamGames(state);
    return nbaPlayers(state).filter(function (p) {
      var l = perGame(statsOf(state, p.id));
      return (p.yearsPro === 0 || p.yearsPro === 1) && l && l.g >= Math.max(3, Math.floor(G * 0.35)) && !injured(state, p.id);
    }).sort(function (a, b) { return rsScore(state, b) - rsScore(state, a); });
  }
  // captains (or coaches) take turns picking the best player left, with a little personal taste
  function draftTeams(state, pool, n, perTeam, rng, snake) {
    var picks = pool.map(function (p) { return { p: p, s: rsScore(state, p) + gauss(rng) * 1.2 }; }).sort(function (a, b) { return b.s - a.s; });
    var teams = [], k = 0;
    for (var i = 0; i < n; i++) teams.push([]);
    for (var r = 0; r < perTeam; r++) for (var j = 0; j < n; j++) { if (k < picks.length) teams[snake && r % 2 ? n - 1 - j : j].push(picks[k++].p.id); }
    return teams;
  }
  function sortStarters(state, ids) {
    return ids.slice().sort(function (a, b) { return rsScore(state, state.players[b]) - rsScore(state, state.players[a]); });
  }
  function gleaguePool(state) {
    var list = [];
    for (var id in state.players) {
      var p = state.players[id];
      if (p && !p.retired && p.gleague && !injured(state, id)) list.push(p);
    }
    list.sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0); });
    if (list.length < 7) {
      var fa = [];
      for (var fid in state.players) { var q = state.players[fid]; if (q && !q.retired && q.team === 'FA' && (q.age || 30) <= 25 && list.indexOf(q) < 0) fa.push(q); }
      fa.sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0); });
      list = list.concat(fa.slice(0, 7 - list.length));
    }
    return list.slice(0, 7);
  }
  function risingStars(state, rng) {
    var year = yearOf(state), fmt = rsFormat(year);
    var out = { format: fmt, teams: [], games: [], champion: null, mvp: null };
    if (fmt === 'none') { out.note = 'Not held this season: the league skipped the Rising Stars game under its health and safety protocols.'; return out; }
    var pool = rsPool(state);
    if (pool.length < 10) { out.note = 'Not enough first and second year players for a game.'; out.format = 'none'; return out; }
    if (fmt === 'chuckShaq') {
      var shaqFirst = rng() < 0.5;
      var two = draftTeams(state, pool.slice(0, 20), 2, 10, rng, false);
      var shaqIds = shaqFirst ? two[0] : two[1], chuckIds = shaqFirst ? two[1] : two[0];
      var chuck = makeTeam('chuck', 'Team Chuck', 'CHUCK', '#1d428a', sortStarters(state, chuckIds), { coach: 'Charles Barkley' });
      var shaq = makeTeam('shaq', 'Team Shaq', 'SHAQ', '#c8102e', sortStarters(state, shaqIds), { coach: "Shaquille O'Neal" });
      out.teams = [chuck, shaq];
      out.draftNote = (shaqFirst ? "Shaquille O'Neal" : 'Charles Barkley') + ' won the coin toss and picked first.';
      out.games.push(playGame(state, 'Rising Stars Challenge', chuck, shaq, rng, { target: clamp(Math.round(145 + gauss(rng) * 9), 128, 168) }));
    } else if (fmt === 'usaWorld') {
      var world = pool.filter(isIntl), usa = pool.filter(function (p) { return !isIntl(p); });
      if (world.length < 8) {
        // short on international first and second year players: third-year internationals fill in
        var G = teamGames(state);
        var third = nbaPlayers(state).filter(function (p) { var l = perGame(statsOf(state, p.id)); return p.yearsPro === 2 && isIntl(p) && l && l.g >= Math.floor(G * 0.35) && !injured(state, p.id); })
          .sort(function (a, b) { return rsScore(state, b) - rsScore(state, a); });
        world = world.concat(third.slice(0, 8 - world.length));
      }
      var worldIds = world.slice(0, 10).map(function (p) { return p.id; });
      var usaIds = usa.slice(0, 10).map(function (p) { return p.id; });
      var extra = usa.slice(10).map(function (p) { return p.id; });
      while (worldIds.length < 7 && extra.length) worldIds.push(extra.shift());
      var tu = makeTeam('usa', 'Team USA', 'USA', '#1d428a', sortStarters(state, usaIds));
      var tw = makeTeam('world', 'Team World', 'WORLD', '#2e7d4f', sortStarters(state, worldIds));
      out.teams = [tu, tw];
      out.games.push(playGame(state, 'Rising Stars Challenge', tu, tw, rng, { target: clamp(Math.round(148 + gauss(rng) * 10), 125, 170) }));
    } else {
      var names = RS_NAMES[year] || ['Team Vince', 'Team Melo', 'Team Dirk', 'Team Tim'];
      var three = draftTeams(state, pool.slice(0, 21), 3, 7, rng, true);
      var gl = gleaguePool(state).map(function (p) { return p.id; });
      out.teams = three.map(function (ids, i) { return makeTeam('rs' + i, names[i], names[i].replace(/^Team /, '').toUpperCase().slice(0, 6), COLORS[i], sortStarters(state, ids)); });
      if (gl.length >= 5) out.teams.push(makeTeam('glg', names[3], 'GLG', '#6b3fa0', gl, { gleague: true }));
      var T = out.teams;
      var byKey = function (k) { return T.filter(function (t) { return t.key === k; })[0]; };
      if (T.length === 4) {
        var s1 = playGame(state, 'Semifinal 1', T[0], T[3], rng, { elam: 40 });
        var s2 = playGame(state, 'Semifinal 2', T[1], T[2], rng, { elam: 40 });
        out.games = [s1, s2, playGame(state, 'Championship', byKey(s1.winner), byKey(s2.winner), rng, { elam: 25 })];
      } else {
        var a = playGame(state, 'Semifinal', T[1], T[2], rng, { elam: 40 });
        out.games = [a, playGame(state, 'Championship', T[0], byKey(a.winner), rng, { elam: 25 })];
      }
    }
    out.champion = out.games[out.games.length - 1].winner;
    out.mvp = mvpOf(state, out.games, out.champion);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Three-Point Contest
  // ---------------------------------------------------------------------------
  var SPOTS = ['Left corner', 'Left wing', 'Top of the key', 'Right wing', 'Right corner'];
  function threeCount(year) { return { 2013: 6, 2014: 6, 2019: 10, 2021: 6, 2023: 7 }[year] || 8; }
  function threeRules(year) { return { moneyRack: year >= 2014, deep: year >= 2020, finalists: year <= 2014 ? 2 : 3, max: year >= 2020 ? 40 : year >= 2014 ? 34 : 30, balls: year >= 2020 ? 27 : 25 }; }
  function shooterPool(state) {
    var G = teamGames(state);
    return nbaPlayers(state).map(function (p) {
      var t = statsOf(state, p.id);
      if (!t || !t.g || t.g < Math.max(3, Math.floor(G * 0.4)) || injured(state, p.id)) return null;
      if ((t.tpa || 0) / t.g < 2.5) return null;
      var tpg = (t.tpm || 0) / t.g, pct = t.tpa ? t.tpm / t.tpa : 0;
      return { p: p, tpg: tpg, pct: pct, s: tpg * 1.6 + (pct - 0.33) * 30 + (attr(p, 'three') - 70) * 0.08 };
    }).filter(Boolean).sort(function (a, b) { return b.s - a.s; });
  }
  function shootRound(c, rules, rng) {
    var base = clamp(0.4 + (attr(c.p, 'three') - 75) * 0.011 + (c.pct - 0.36) * 0.7, 0.3, 0.72) + gauss(rng) * 0.045;
    var moneyAt = rules.moneyRack ? [0, 4, 0, 4, 1, 3, 2][Math.floor(rng() * 7)] : -1;
    var racks = [], deep = [], pts = 0;
    function shot(p, v) { var m = rng() < clamp(p, 0.05, 0.9) ? 1 : 0; pts += m * v; return { m: m, v: v }; }
    for (var i = 0; i < 5; i++) {
      var balls = [], rp = 0;
      for (var b = 0; b < 5; b++) {
        var money = i === moneyAt || b === 4;
        var s = shot(base - (i === 4 ? 0.03 : 0) - (money ? 0.03 : 0), money ? 2 : 1);
        balls.push(s); rp += s.m * s.v;
      }
      racks.push({ spot: SPOTS[i], money: i === moneyAt, balls: balls, pts: rp });
      // the two deep shots sit between the wing and top racks on each side (2020 on)
      if (rules.deep && (i === 1 || i === 2)) deep.push(shot(base - 0.17, 3));
    }
    return { racks: racks, deep: deep, pts: pts };
  }
  function threePoint(state, rng) {
    var year = yearOf(state), rules = threeRules(year), n = threeCount(year);
    var pool = shooterPool(state).slice(0, n);
    var out = { rules: rules, field: pool.map(function (c) { return { id: c.p.id, tpm: r1(c.tpg), pct: r1(c.pct * 100) }; }), rounds: [], winner: null };
    if (pool.length < 3) return out;
    var cOf = function (id) { return pool.filter(function (c) { return c.p.id === id; })[0]; };
    function roundOf(name, ids) {
      var rows = ids.map(function (id) { var r = shootRound(cOf(id), rules, rng); return { id: id, score: r.pts, racks: r.racks, deep: r.deep }; });
      out.rounds.push({ name: name, rows: rows });
      return rows;
    }
    // ties are broken with another full round between the tied shooters
    function shootOff(ids, name) {
      var guard = 0;
      while (ids.length > 1 && guard++ < 6) {
        var rows = roundOf(name + (guard > 1 ? ' ' + guard : ''), ids);
        var best = Math.max.apply(null, rows.map(function (r) { return r.score; }));
        ids = rows.filter(function (r) { return r.score === best; }).map(function (r) { return r.id; });
      }
      return ids[0];
    }
    var first = roundOf('First round', pool.map(function (c) { return c.p.id; }));
    var ranked = first.slice().sort(function (a, b) { return b.score - a.score; });
    var k = Math.min(rules.finalists, ranked.length), cut = ranked[k - 1].score;
    var finalists = ranked.filter(function (r) { return r.score > cut; }).map(function (r) { return r.id; });
    var onCut = ranked.filter(function (r) { return r.score === cut; }).map(function (r) { return r.id; });
    while (finalists.length < k && onCut.length) {
      if (finalists.length + onCut.length <= k) { finalists = finalists.concat(onCut); break; }
      var w = shootOff(onCut.slice(), 'Tiebreaker');
      finalists.push(w); onCut = onCut.filter(function (id) { return id !== w; });
    }
    first.forEach(function (r) { r.adv = finalists.indexOf(r.id) >= 0; });
    var fin = roundOf('Final', finalists);
    var top = Math.max.apply(null, fin.map(function (r) { return r.score; }));
    var leaders = fin.filter(function (r) { return r.score === top; }).map(function (r) { return r.id; });
    out.winner = leaders.length === 1 ? leaders[0] : shootOff(leaders, 'Final shoot-off');
    out.winScore = top;
    return out;
  }

  // ---------------------------------------------------------------------------
  // Slam Dunk Contest
  // ---------------------------------------------------------------------------
  // [description, difficulty 1 to 5, vertical needed]
  var DUNKS = [
    ['Two-handed reverse with a cuff', 1, 0], ['One-handed tomahawk off one foot', 1, 0], ['Windmill on the baseline', 2, 70],
    ['Double-pump reverse', 2, 70], ['Between-the-legs off a bounce', 3, 78], ['360 windmill', 3, 80], ['Off the backboard, behind the back', 4, 82],
    ['Over a seated teammate', 3, 78], ['Free-throw line takeoff', 4, 86], ['Reverse 360 with a cradle', 4, 84],
    ['Between the legs, off the glass, two hands', 5, 88], ['Over the mascot, through the legs', 4, 85],
    ['Elbow in the rim', 4, 86], ['Lob off the side of the backboard, 360', 4, 84], ['East Bay Funk windmill', 3, 80],
    ['Under-the-legs off a teammate lob', 5, 88], ['Jumps over a car hood, two hands', 3, 82], ['Blindfolded one-hander', 3, 76],
    ['Honey dip, arm through the rim', 5, 90], ['540 off a self-lob', 5, 92], ['Rock-the-cradle from a teammate pass', 2, 72],
    ['Behind-the-back windmill', 4, 84], ['Hurdling three teammates', 5, 90], ['Statue of Liberty from the dotted line', 3, 80]
  ];
  function dunkCount(year) { return year <= 2014 ? 6 : 4; }
  function dunkPool(state) {
    return nbaPlayers(state).map(function (p) {
      var l = perGame(statsOf(state, p.id));
      if (!l || l.g < 3 || injured(state, p.id) || /^C/.test(String(p.pos || ''))) return null;
      var age = p.age || 30;
      var s = attr(p, 'dunk') * 0.45 + attr(p, 'vert') * 0.4 + attr(p, 'speed') * 0.15 + (age <= 25 ? 3 : age >= 30 ? -4 : 0) - Math.max(0, (p.ovr || 70) - 86) * 0.6;
      return { p: p, s: s };
    }).filter(Boolean).sort(function (a, b) { return b.s - a.s; });
  }
  function doDunk(p, rng, used) {
    var vert = attr(p, 'vert'), q = attr(p, 'dunk') * 0.5 + vert * 0.35 + attr(p, 'speed') * 0.15;
    var opts = DUNKS.filter(function (d) { return vert >= d[2] - 4 && used.indexOf(d[0]) < 0; });
    if (!opts.length) opts = DUNKS.filter(function (d) { return used.indexOf(d[0]) < 0; });
    // harder ideas are a bit more likely: nobody comes to the contest to cuff a reverse
    var w = opts.map(function (d) { return 1 + d[1] * 0.5; }), sum = w.reduce(function (s, x) { return s + x; }, 0), x = rng() * sum, pick = opts[0];
    for (var i = 0; i < opts.length; i++) { x -= w[i]; if (x <= 0) { pick = opts[i]; break; } }
    used.push(pick[0]);
    var makeP = clamp(0.9 - pick[1] * 0.08 + (q - 85) * 0.012, 0.35, 0.96), attempt = 0;
    for (var a = 1; a <= 3; a++) if (rng() < makeP) { attempt = a; break; }
    var mean = attempt ? 7.1 + (q - 85) * 0.09 + pick[1] * 0.38 - 0.35 * (attempt - 1) + gauss(rng) * 0.55 : 6.2;
    var judges = [];
    for (var j = 0; j < 5; j++) judges.push(clamp(Math.round(mean + gauss(rng) * (attempt ? 0.55 : 0.35)), 6, 10));
    return { dunk: pick[0], attempts: attempt || 3, made: !!attempt, judges: judges, score: judges.reduce(function (s, v) { return s + v; }, 0) };
  }
  function dunkContest(state, rng) {
    var year = yearOf(state);
    var pool = dunkPool(state).slice(0, dunkCount(year));
    var out = { field: pool.map(function (c) { return c.p.id; }), rounds: [], winner: null };
    if (pool.length < 2) return out;
    var used = {};
    function round(name, ids, dunks) {
      var rows = ids.map(function (id) {
        var u = used[id] || (used[id] = []), ds = [];
        for (var d = 0; d < dunks; d++) ds.push(doDunk(state.players[id], rng, u));
        return { id: id, dunks: ds, score: ds.reduce(function (s, x) { return s + x.score; }, 0) };
      });
      out.rounds.push({ name: name, rows: rows });
      return rows;
    }
    var first = round('First round', out.field, 2).slice().sort(function (a, b) { return b.score - a.score; });
    var finalists = first.slice(0, 2).map(function (r) { return r.id; });
    // a tie for the last spot in the final: the better single dunk goes through
    var best = function (r) { return Math.max.apply(null, r.dunks.map(function (d) { return d.score; })); };
    if (first.length > 2 && first[1].score === first[2].score && best(first[2]) > best(first[1])) finalists[1] = first[2].id;
    out.rounds[0].rows.forEach(function (r) { r.adv = finalists.indexOf(r.id) >= 0; });
    var fin = round('Final', finalists, 2), guard = 0;
    while (fin[0].score === fin[1].score && guard++ < 5) fin = round('Dunk-off' + (guard > 1 ? ' ' + guard : ''), finalists, 1);
    if (fin[0].score === fin[1].score) fin[0].score++;
    out.winner = fin[0].score > fin[1].score ? fin[0].id : fin[1].id;
    return out;
  }

  // ---------------------------------------------------------------------------
  // Skills Challenge
  // ---------------------------------------------------------------------------
  function skillScore(p) { return attr(p, 'handle') * 0.35 + attr(p, 'pass') * 0.3 + attr(p, 'speed') * 0.2 + attr(p, 'three') * 0.15; }
  function isGuard(p) { return /^(PG|SG|G)\b/.test(String(p.pos || '')); }
  function isBig(p) { return /^(PF|C|FC)\b/.test(String(p.pos || '')); }
  function skillPool(state, filter) {
    var G = teamGames(state);
    return nbaPlayers(state).filter(function (p) {
      var l = perGame(statsOf(state, p.id));
      return l && l.g >= Math.max(3, Math.floor(G * 0.4)) && l.mpg >= 18 && !injured(state, p.id) && filter(p);
    }).map(function (p) { var l = lineOf(state, p); return { p: p, s: skillScore(p) + 0.12 * l.ppg + 0.25 * l.apg + ((p.yearsPro || 0) <= 1 ? 2 : 0) }; })
      .sort(function (a, b) { return b.s - a.s; });
  }
  // one run through the course: dribble the cones, chest pass, bounce pass, layup, then the jumper (a three from 2016)
  function courseTime(p, year, rng) {
    var t = 26.5 + (88 - skillScore(p)) * 0.32 + gauss(rng) * 1.1;
    var passP = clamp(0.72 + (attr(p, 'pass') - 75) * 0.008, 0.45, 0.95), passMiss = 0;
    for (var i = 0; i < 2; i++) while (rng() > passP && passMiss < 4) { passMiss++; t += 1.6; }
    var shot = year >= 2016 ? attr(p, 'three') : attr(p, 'mid'), shotP = clamp(0.3 + (shot - 70) * 0.013, 0.12, 0.7), shotMiss = 0;
    while (rng() > shotP && shotMiss < 6) { shotMiss++; t += 1.7; }
    return { time: r1(Math.max(22, t)), miss: passMiss + shotMiss };
  }
  function fastest(rows) { return rows.slice().sort(function (a, b) { return a.time - b.time; }); }
  function skills(state, rng) {
    var year = yearOf(state), out = { format: null, rounds: [], winner: [], winnerName: '' };
    var ids = function (list) { return list.map(function (c) { return c.p.id; }); };
    if (year <= 2014) {
      var guards = ids(skillPool(state, isGuard).slice(0, 6));
      if (guards.length < 4) return out;
      var runOf, entries;
      if (year === 2013) {
        out.format = 'individual';
        entries = guards.map(function (id) { return [id]; });
      } else {
        // 2014: three teams of two, a relay (the best guard with the sixth, and so on)
        out.format = 'pairs';
        entries = [];
        for (var i = 0; i < Math.floor(guards.length / 2); i++) entries.push([guards[i], guards[guards.length - 1 - i]]);
      }
      runOf = function (entry) { var t = 0, m = 0; entry.forEach(function (id) { var x = courseTime(state.players[id], year, rng); t += x.time; m += x.miss; }); return { ids: entry, time: r1(t), miss: m }; };
      var rr = entries.map(runOf), top2 = fastest(rr).slice(0, 2);
      top2.forEach(function (r) { r.adv = true; });
      out.rounds.push({ name: year === 2013 ? 'First round' : 'First round (relay)', rows: rr });
      var fr = top2.map(function (r) { return runOf(r.ids); });
      if (fr[0].time === fr[1].time) fr[1].time = r1(fr[1].time + 0.1);
      out.rounds.push({ name: year === 2013 ? 'Final' : 'Final (relay)', rows: fr });
      out.winner = fastest(fr)[0].ids;
    } else if (year <= 2021) {
      // head-to-head bracket; from 2016 four guards and four bigs, the bracket sides meet in the final
      out.format = 'bracket';
      var field;
      if (year >= 2016) {
        var g = ids(skillPool(state, isGuard).slice(0, 4)), b = ids(skillPool(state, isBig).slice(0, 4));
        field = g.length === 4 && b.length === 4 ? [g[0], g[3], g[1], g[2], b[0], b[3], b[1], b[2]] : null;
        out.bigs = b;
      }
      if (!field) {
        var e = ids(skillPool(state, isGuard).slice(0, 8));
        if (e.length < 2) return out;
        field = e.length === 8 ? [e[0], e[7], e[3], e[4], e[1], e[6], e[2], e[5]] : e.slice(0, e.length >= 4 ? 4 : 2);
      }
      var race = function (a, b2) {
        var ta = courseTime(state.players[a], year, rng), tb = courseTime(state.players[b2], year, rng);
        if (ta.time === tb.time) tb.time = r1(tb.time + 0.1);
        return { a: { ids: [a], time: ta.time }, b: { ids: [b2], time: tb.time }, win: ta.time < tb.time ? a : b2 };
      };
      var cur = field, label = { 4: 'First round', 2: 'Semifinals', 1: 'Final' };
      while (cur.length > 1) {
        var ms = [];
        for (var k = 0; k + 1 < cur.length; k += 2) ms.push(race(cur[k], cur[k + 1]));
        out.rounds.push({ name: label[ms.length] || 'Round', matches: ms });
        cur = ms.map(function (m) { return m.win; });
      }
      out.winner = [cur[0]];
    } else {
      // teams: Team Rookies plus NBA teams' trios (pairs and four teams from 2025)
      out.format = 'teams';
      var per = year >= 2025 ? 2 : 3, nTeams = year >= 2025 ? 4 : 3;
      var all = skillPool(state, function () { return true; });
      var rook = all.filter(function (c) { return c.p.yearsPro === 0; }).slice(0, per);
      var used = {}, teams = [];
      rook.forEach(function (c) { used[c.p.id] = 1; });
      if (rook.length === per) teams.push({ name: 'Team Rookies', ids: ids(rook) });
      var byTeam = {};
      all.forEach(function (c) { if (!used[c.p.id]) (byTeam[c.p.team] = byTeam[c.p.team] || []).push(c); });
      Object.keys(byTeam).filter(function (a) { return byTeam[a].length >= per; }).map(function (a) {
        var top = byTeam[a].slice(0, per);
        return { abbr: a, ids: ids(top), s: top.reduce(function (s, c) { return s + c.s; }, 0) + gauss(rng) * 3 };
      }).sort(function (a, b) { return b.s - a.s; }).slice(0, nTeams - teams.length).forEach(function (c) {
        var t = state.teams[c.abbr]; teams.push({ name: 'Team ' + (t ? t.name : c.abbr), ids: c.ids, team: c.abbr });
      });
      if (teams.length < 2) return out;
      var pts = teams.map(function () { return 0; });
      ['Shooting', 'Passing', 'Dribbling'].forEach(function (ev) {
        var rows = teams.map(function (t, ti) {
          var tm = 0;
          t.ids.forEach(function (id) {
            var p = state.players[id];
            var sk = ev === 'Shooting' ? attr(p, 'three') * 0.7 + attr(p, 'mid') * 0.3 : ev === 'Passing' ? attr(p, 'pass') : attr(p, 'handle') * 0.6 + attr(p, 'speed') * 0.4;
            tm += 30 - (sk - 75) * 0.22 + gauss(rng) * 1.6;
          });
          return { ti: ti, ids: t.ids, label: t.name, time: r1(tm / t.ids.length) };
        });
        fastest(rows).forEach(function (r, k2) { r.pts = k2 === 0 ? 100 : k2 === 1 ? 50 : 0; pts[r.ti] += r.pts; });
        out.rounds.push({ name: ev, rows: rows });
      });
      out.standings = teams.map(function (t, ti) { return { label: t.name, ids: t.ids, pts: pts[ti] }; });
      var two = teams.map(function (t, ti) { return { t: t, pts: pts[ti] + rng() * 0.1 }; }).sort(function (a, b) { return b.pts - a.pts; }).slice(0, 2).map(function (x) { return x.t; });
      // final: the top two take turns from half court, first make wins
      var shots = [0, 0], made = -1;
      for (var s = 0; s < 60 && made < 0; s++) {
        var side = s % 2, shooter = state.players[two[side].ids[Math.floor(s / 2) % two[side].ids.length]];
        shots[side]++;
        if (rng() < clamp(0.06 + (attr(shooter, 'three') - 75) * 0.003, 0.03, 0.14)) made = side;
      }
      if (made < 0) made = 0;
      out.rounds.push({ name: 'Final: half-court shot', rows: two.map(function (t, k3) { return { ids: t.ids, label: t.name, attempts: shots[k3], made: k3 === made }; }) });
      out.winner = two[made].ids.slice();
      out.winnerName = two[made].name;
    }
    if (!out.winnerName) out.winnerName = out.winner.map(function (id) { return state.players[id] ? state.players[id].name : id; }).join(' and ');
    return out;
  }

  // ---------------------------------------------------------------------------
  // All-Star Game
  // ---------------------------------------------------------------------------
  function asgFormat(year) { return year >= 2025 ? 'tournament' : (year === 2024 || year <= 2017) ? 'eastWest' : 'captains'; }
  function allStarGame(state, as, rs, rng) {
    var year = yearOf(state), fmt = asgFormat(year);
    var out = { format: fmt, teams: [], games: [], champion: null, mvp: null, trophy: year >= 2020 ? 'Kobe Bryant Trophy' : null };
    var fanSort = function (list) { return list.slice().sort(function (a, b) { return fanScore(state, state.players[b]) - fanScore(state, state.players[a]); }); };
    var valid = function (list) { return (list || []).filter(function (id) { return state.players[id] && !state.players[id].retired; }); };
    var E = as.East || {}, Wc = as.West || {};
    var eS = valid(E.starters), eR = valid(E.reserves), wS = valid(Wc.starters), wR = valid(Wc.reserves);
    var target = function () { return clamp(Math.round(150 + (year - 2013) * 3 + gauss(rng) * 9), 150, 215); };
    if (eS.length + eR.length < 5 || wS.length + wR.length < 5) return out;
    if (fmt === 'eastWest') {
      var east = makeTeam('east', 'East', 'EAST', '#1d428a', eS.concat(eR));
      var west = makeTeam('west', 'West', 'WEST', '#c8102e', wS.concat(wR));
      out.teams = [east, west];
      out.games.push(playGame(state, 'All-Star Game', east, west, rng, { target: target() }));
    } else if (fmt === 'captains') {
      // the leading vote getter in each conference is a captain; the top one picks first, starters then reserves
      var capE = fanSort(eS)[0], capW = fanSort(wS)[0];
      if (!capE || !capW) return out;
      var first = fanScore(state, state.players[capE]) >= fanScore(state, state.players[capW]) ? capE : capW, second = first === capE ? capW : capE;
      var A = [first], B = [second], picks = [];
      var pickFrom = function (list) {
        var left = fanSort(list.filter(function (id) { return id !== capE && id !== capW; })), turn = 0;
        while (left.length) {
          // captains mostly take the best player left, with a friend or teammate now and then
          var id = left.splice(Math.min(left.length - 1, rng() < 0.25 ? 1 : 0), 1)[0];
          (turn % 2 ? B : A).push(id);
          picks.push({ by: turn % 2 ? second : first, id: id });
          turn++;
        }
      };
      pickFrom(eS.concat(wS)); pickFrom(eR.concat(wR));
      var nm = function (id) { return lastName(state.players[id].name); };
      var ta = makeTeam('capA', 'Team ' + nm(first), nm(first).toUpperCase().slice(0, 7), '#c9a227', A, { captain: first });
      var tb = makeTeam('capB', 'Team ' + nm(second), nm(second).toUpperCase().slice(0, 7), '#1d428a', B, { captain: second });
      out.teams = [ta, tb];
      out.draft = picks;
      out.games.push(playGame(state, 'All-Star Game', ta, tb, rng, { target: target() }));
      if (year >= 2020) out.elamNote = 'Elam Ending: the fourth quarter is untimed and played to a target score.';
    } else {
      // three teams of eight All-Stars picked by the TNT crew, plus the Rising Stars winner; games to 40
      var everyone = eS.concat(eR, wS, wR);
      var global = everyone.filter(function (id) { return isIntl(state.players[id]); }).slice(0, 8);
      var rest = everyone.filter(function (id) { return global.indexOf(id) < 0; }).sort(function (a, b) { return (state.players[b].age || 0) - (state.players[a].age || 0); });
      var ogs = rest.slice(0, 8), young = rest.slice(8).slice(-8);
      var spare = rest.slice(8).filter(function (id) { return young.indexOf(id) < 0; });
      while (global.length < 8 && spare.length) global.push(spare.shift());
      var T = [
        makeTeam('ogs', "Shaq's OGs", 'OGS', '#c8102e', fanSort(ogs), { coach: "Shaquille O'Neal" }),
        makeTeam('global', "Chuck's Global Stars", 'GLOBAL', '#2e7d4f', fanSort(global), { coach: 'Charles Barkley' }),
        makeTeam('young', "Kenny's Young Stars", 'YOUNG', '#1d428a', fanSort(young), { coach: 'Kenny Smith' })
      ];
      var rsChamp = rs && rs.champion && rs.teams.filter(function (t) { return t.key === rs.champion; })[0];
      if (rsChamp) T.push(makeTeam('rising', "Candace's Rising Stars", 'RISING', '#c9a227', rsChamp.ids, { coach: 'Candace Parker', from: rsChamp.name }));
      T = T.filter(function (t) { return t.ids.length >= 5; });
      out.teams = T;
      var byKey = function (k) { return T.filter(function (t) { return t.key === k; })[0]; };
      if (T.length === 4) {
        var s1 = playGame(state, 'Semifinal 1', T[0], T[3], rng, { elam: 40 });
        var s2 = playGame(state, 'Semifinal 2', T[1], T[2], rng, { elam: 40 });
        out.games = [s1, s2, playGame(state, 'Championship', byKey(s1.winner), byKey(s2.winner), rng, { elam: 40 })];
      } else if (T.length >= 2) out.games = [playGame(state, 'Championship', T[0], T[1], rng, { elam: 40 })];
      else return out;
    }
    out.champion = out.games[out.games.length - 1].winner;
    out.mvp = mvpOf(state, out.games, out.champion);
    return out;
  }

  // ---------------------------------------------------------------------------
  // The weekend
  // ---------------------------------------------------------------------------
  function breakPassed(state) {
    if (!state || !state.season) return false;
    if (state.season.phase && state.season.phase !== 'regular') return true;
    if (state.phase && state.phase !== 'regular') return true;
    var L = mod('LEAGUE'), d = L && L.currentDate ? L.currentDate(state) : null;
    return !!(d && d >= dateOf(yearOf(state)));
  }
  function rosters(state) {
    var y = yearOf(state);
    if (state.allStars && state.allStars.year === y) return state.allStars;
    // the break has passed but the rosters were never named (an older save): name them now, the way league.js does
    var A = mod('AWARDS');
    if (!breakPassed(state) || state.allStarsYear === y || !A || !A.allStars || !state.season || !state.season.playerStats) return null;
    var as = A.allStars(state);
    if (!as) return null;
    if (A.recordAllStars) A.recordAllStars(state, as);
    state.allStarsYear = y; state.allStars = as;
    return as;
  }
  function news(state, headline, body, ids) {
    state.news = state.news || [];
    if (state.news.some(function (n) { return n && n.year === state.year && n.headline === headline; })) return;
    state.news.unshift({ year: state.year, day: state.day, headline: headline, body: body || '', ids: ids || [], type: 'allStars' });
    if (state.news.length > 300) state.news.length = 300;
  }
  function give(state, id, year, award) {
    var p = state.players[id];
    if (!p) return;
    p.awards = p.awards || [];
    if (p.awards.some(function (a) { return a.year === year && a.award === award; })) return;
    p.awards.push({ year: year, award: award });
  }
  function nameOf(state, id) { return state.players[id] ? state.players[id].name : id; }
  function score(g) { return Math.max(g.home.pts, g.away.pts) + '-' + Math.min(g.home.pts, g.away.pts); }
  function teamName(ev, key) { var t = (ev.teams || []).filter(function (x) { return x.key === key; })[0]; return t ? t.name : key; }
  function recordWinners(state, wk) {
    var y = wk.year;
    if (wk.game && wk.game.mvp) give(state, wk.game.mvp.id, y, 'All-Star MVP');
    if (wk.three && wk.three.winner) give(state, wk.three.winner, y, 'Three-Point Contest');
    if (wk.dunk && wk.dunk.winner) give(state, wk.dunk.winner, y, 'Slam Dunk Contest');
    if (wk.skills && wk.skills.winner) wk.skills.winner.forEach(function (id) { give(state, id, y, 'Skills Challenge'); });
    if (wk.rising && wk.rising.mvp) give(state, wk.rising.mvp.id, y, 'Rising Stars MVP');
    wk.recorded = true;
    if (wk.newsDone) return;
    wk.newsDone = true;
    var rs = wk.rising, sk = wk.skills, th = wk.three, dk = wk.dunk, gm = wk.game;
    if (rs && rs.mvp) news(state, nameOf(state, rs.mvp.id) + ' named Rising Stars MVP',
      teamName(rs, rs.champion) + ' won the Rising Stars ' + (rs.format === 'tournament' ? 'tournament, ' : 'game ') + score(rs.games[rs.games.length - 1]) + '. ' + nameOf(state, rs.mvp.id) + ' had ' + rs.mvp.pts + ' points.', [rs.mvp.id]);
    if (sk && sk.winner && sk.winner.length) news(state, sk.winnerName + (sk.winner.length > 1 ? ' win' : ' wins') + ' the Skills Challenge', '', sk.winner.slice());
    if (th && th.winner) news(state, nameOf(state, th.winner) + ' wins the Three-Point Contest', 'He scored ' + th.winScore + ' in the final round.', [th.winner]);
    if (dk && dk.winner) news(state, nameOf(state, dk.winner) + ' wins the Slam Dunk Contest', '', [dk.winner]);
    if (gm && gm.mvp) news(state, nameOf(state, gm.mvp.id) + ' named All-Star MVP',
      teamName(gm, gm.champion) + ' won the ' + (gm.format === 'tournament' ? 'All-Star tournament, ' : 'All-Star Game ') + score(gm.games[gm.games.length - 1]) + '. ' +
      nameOf(state, gm.mvp.id) + ' scored ' + gm.mvp.pts + (gm.trophy ? ' and takes home the ' + gm.trophy + '.' : '.'), [gm.mvp.id]);
  }
  // Older weekends keep their results and MVPs; their box scores go after three seasons (save size)
  function prune(state) {
    var book = state.allStarWeekend || {};
    Object.keys(book).forEach(function (y) {
      if (+y > state.year - 3) return;
      [book[y].rising, book[y].game].forEach(function (ev) {
        (ev && ev.games || []).forEach(function (g) { if (g.home.box) { g.home.box = null; g.away.box = null; g.slim = true; } });
      });
    });
  }
  function weekend(state, opts) {
    if (!state || !state.season || !state.players) return null;
    var y = yearOf(state);
    var have = state.allStarWeekend && state.allStarWeekend[y];
    if (have) { if (!have.recorded) recordWinners(state, have); return have; }
    if (!mod('ENGINE') || !W.ENGINE.simGame) return null;
    var as = rosters(state);
    if (!as) return null;
    var seed = hashStr(String(state.rngSeed) + ':' + y + ':allstar');
    var rng = function (tag) { return mulberry32(hashStr(seed + ':' + tag)); };
    var wk = { year: y, seed: seed, date: dateOf(y), host: HOSTS[y] || null, day: state.day };
    wk.rising = risingStars(state, rng('rising'));
    wk.skills = skills(state, rng('skills'));
    wk.three = threePoint(state, rng('three'));
    wk.dunk = dunkContest(state, rng('dunk'));
    wk.game = allStarGame(state, as, wk.rising, rng('game'));
    state.allStarWeekend = state.allStarWeekend || {};
    state.allStarWeekend[y] = wk;
    if (!(opts && opts.record === false)) recordWinners(state, wk);
    prune(state);
    return wk;
  }
  function status(state) {
    if (!state || !state.season) return { ready: false };
    var y = yearOf(state);
    return { year: y, date: dateOf(y), passed: breakPassed(state), named: !!(state.allStars && state.allStars.year === y),
      weekend: state.allStarWeekend ? state.allStarWeekend[y] || null : null };
  }

  // Builds the weekend right after the break, so the contests use the stats from that day
  (function hookAdvance() {
    var L = mod('LEAGUE');
    if (!L || typeof L.advance !== 'function' || L.advance.__allstar) return;
    var orig = L.advance;
    var wrapped = function (state) {
      var r = orig.apply(this, arguments);
      try {
        if (state && state.season && state.allStars && state.allStars.year === state.year && !(state.allStarWeekend && state.allStarWeekend[state.year])) weekend(state);
      } catch (e) { if (W.console) console.warn('[allstar] weekend failed', e && e.message); }
      return r;
    };
    for (var k in orig) wrapped[k] = orig[k];
    wrapped.__allstar = true;
    L.advance = wrapped;
  })();

  var ALLSTAR = {
    weekend: weekend,
    status: status,
    dateOf: dateOf,
    hostOf: function (y) { return HOSTS[y] || null; },
    rsFormat: rsFormat,
    asgFormat: asgFormat,
    threeRules: threeRules,
    isIntl: isIntl,
    AWARDS: ['All-Star MVP', 'Three-Point Contest', 'Slam Dunk Contest', 'Skills Challenge', 'Rising Stars MVP']
  };
  W.ALLSTAR = ALLSTAR;
  if (typeof module !== 'undefined' && module.exports) module.exports = ALLSTAR;
})(typeof window !== 'undefined' ? window : globalThis);
