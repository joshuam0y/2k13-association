// 2K13 Association: news feed headlines in a 2K style (window.NEWS).
// Classic script, plain JS, no libraries. Also module.exports under Node.
// Every generator returns a news item { year, day, type, headline, body, ids } and does not touch state;
// NEWS.post(state, item) appends it to state.news. NEWS.publish(state, type, ...args) does both.
(function (root) {
  'use strict';

  var MAX_NEWS = 600;
  // figure dash, en dash, em dash, horizontal bar (built from char codes so this file holds none of them)
  var DASHES = new RegExp('[' + String.fromCharCode(0x2012, 0x2013, 0x2014, 0x2015) + ']', 'g');

  function yearOf(state) { return (state && state.year) || 2013; }
  function clean(s) { return String(s == null ? '' : s).replace(DASHES, '-'); }
  function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function pick(list, seed) { return list[hash(seed) % list.length]; }
  function comma(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function money(n) {
    if (!n) return '$0';
    if (n >= 1e6) return '$' + (Math.round(n / 1e5) / 10) + ' million';
    return '$' + comma(n);
  }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  function player(state, id) { return (state && state.players && state.players[id]) || { id: id, name: id }; }
  function pname(state, id) { return player(state, id).name || id; }
  function team(state, abbr) {
    var t = state && state.teams && state.teams[abbr];
    if (t) return t;
    var L = (typeof window !== 'undefined' && window.LEAGUE_2012) || (root && root.LEAGUE_2012);
    if (L) for (var i = 0; i < L.teams.length; i++) if (L.teams[i].abbr === abbr) return L.teams[i];
    return { abbr: abbr, city: abbr, name: abbr };
  }
  function nick(state, abbr) { return team(state, abbr).name || abbr; }
  function full(state, abbr) { var t = team(state, abbr); return (t.city ? t.city + ' ' : '') + (t.name || abbr); }
  function title(s) { return s.replace(/(^|[\s(])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }); }

  function item(state, type, headline, body, ids) {
    return { year: yearOf(state), day: (state && state.day) || 0, type: type, headline: clean(headline), body: clean(body), ids: ids || [] };
  }

  function post(state, it) {
    if (!state || !it) return it;
    var list = Array.isArray(it) ? it : [it];
    state.news = state.news || [];
    list.forEach(function (x) { if (x) state.news.push(x); });
    if (state.news.length > MAX_NEWS) state.news.splice(0, state.news.length - MAX_NEWS);
    return it;
  }

  // ---------------------------------------------------------------------------
  // Transactions
  // ---------------------------------------------------------------------------
  // trade = { teams: [A, B], give: { A: { players: [ids], picks: [{ year, round, original }] }, B: {...} } }
  function trade(state, tr) {
    var teams = tr.teams || Object.keys(tr.give || {});
    var ids = [], best = null;
    teams.forEach(function (a) {
      ((tr.give[a] && tr.give[a].players) || []).forEach(function (id) {
        ids.push(id);
        var p = player(state, id);
        if (!best || (p.ovr || 0) > (best.p.ovr || 0)) best = { p: p, from: a };
      });
    });
    function pickText(pk) { return pk.year + ' ' + (pk.round === 1 ? 'first' : 'second') + ' round pick' + (pk.original && pk.original !== pk.owner ? ' (via ' + pk.original + ')' : ''); }
    function receiver(a) { return teams.length === 2 ? teams[0] === a ? teams[1] : teams[0] : null; }
    var parts = teams.map(function (a) {
      var g = tr.give[a] || {};
      var what = ((g.players || []).map(function (id) { return pname(state, id); })).concat((g.picks || []).map(pickText));
      var to = receiver(a);
      return 'The ' + nick(state, a) + ' send ' + (what.length ? what.join(', ') : 'nothing') + (to ? ' to the ' + nick(state, to) : '') + '.';
    });
    var headline;
    if (best && teams.length === 2) {
      var to = receiver(best.from);
      if ((best.p.ovr || 0) >= 84 || (best.p.ovr || 0) >= 80 && (best.p.age || 30) <= 24) headline = pick(['BLOCKBUSTER: ' + nick(state, to) + ' Land ' + best.p.name,
        best.p.name + ' Traded To ' + full(state, to) + ' In Stunning Deal',
        'Shockwaves: ' + nick(state, best.from) + ' Ship ' + best.p.name + ' To ' + team(state, to).city], ids.join());
      else if ((best.p.ovr || 0) >= 76) headline = pick([nick(state, to) + ' Acquire ' + best.p.name + ' From ' + nick(state, best.from),
        best.p.name + ' Headed To ' + team(state, to).city], ids.join());
      else headline = nick(state, teams[0]) + ' And ' + nick(state, teams[1]) + ' Complete Trade';
    } else if (teams.length > 2) {
      headline = teams.length + '-Team Deal Shakes Up The League';
    } else {
      headline = nick(state, teams[0]) + ' And ' + nick(state, teams[1] || teams[0]) + ' Swap Draft Picks';
    }
    return item(state, 'trade', headline, parts.join(' '), ids);
  }

  // info: { salaries: [{ year, amount }] } or { amount, years }, plus resign: bool, twoWay: bool, option
  function signing(state, abbr, playerId, info) {
    info = info || {};
    var p = player(state, playerId);
    var sal = info.salaries || (info.amount ? [] : (p.contract && p.contract.salaries) || []);
    var years = info.years || sal.length || 1;
    var total = info.total || (info.amount ? info.amount * years : sal.reduce(function (s, x) { return s + (x.amount || 0); }, 0));
    if (!sal.length && info.amount) sal = [{ amount: info.amount }];
    var twoWay = info.twoWay || (p.contract && p.contract.twoWay);
    var headline, body;
    if (twoWay) {
      headline = nick(state, abbr) + ' Sign ' + p.name + ' To Two-Way Deal';
      body = p.name + ' will split time between the ' + full(state, abbr) + ' and their G League affiliate.';
    } else if (info.resign) {
      headline = total >= 6e7 ? p.name + ' Stays Put: ' + nick(state, abbr) + ' Lock Up Star With ' + money(total) + ' Deal'
        : nick(state, abbr) + ' Re-Sign ' + p.name;
      body = p.name + ' agreed to a ' + years + '-year, ' + money(total) + ' contract to stay with the ' + full(state, abbr) + '.';
    } else if (info.minimum || (sal[0] && sal[0].amount < 1.6e6 && total < 3e6)) {
      headline = nick(state, abbr) + ' Add ' + p.name + ' On Minimum Deal';
      body = 'The ' + full(state, abbr) + ' signed ' + p.name + ' to a ' + years + '-year minimum contract.';
    } else {
      headline = total >= 8e7 ? 'Big Splash: ' + p.name + ' Agrees To Join ' + nick(state, abbr)
        : nick(state, abbr) + ' Ink ' + p.name + ' To ' + years + '-Year, ' + money(total).replace(' million', 'M') + ' Deal';
      body = p.name + ' signed a ' + years + '-year, ' + money(total) + ' contract with the ' + full(state, abbr) +
        (info.option ? ' that includes a ' + info.option.type + ' option' : '') + '.';
    }
    return item(state, 'sign', title(headline), body, [playerId]);
  }

  function release(state, abbr, playerId) {
    var p = player(state, playerId);
    return item(state, 'release', nick(state, abbr) + ' Waive ' + p.name, 'The ' + full(state, abbr) + ' have released ' + p.name + '.', [playerId]);
  }

  function injury(state, playerId, inj) {
    var p = player(state, playerId);
    inj = inj || p.injury || { type: 'Injury', games: 1 };
    var raw = String(inj.type || 'Injury');
    var type = raw.split(' ').map(function (w) { return w === w.toUpperCase() ? w : w.toLowerCase(); }).join(' ');
    var Type = title(type);
    var t = p.team ? nick(state, p.team) : '';
    var headline, body;
    if (inj.games >= 999 || inj.games >= 70) {
      headline = 'Devastating: ' + p.name + ' Out For Season With ' + Type;
      body = (t ? 'The ' + t + ' announced that ' : '') + p.name + ' will miss the rest of the season with a ' + type + '.';
    } else if (inj.games >= 15) {
      var weeks = Math.max(2, Math.round(inj.games / 3.5));
      headline = p.name + ' Sidelined ' + weeks + ' Weeks With ' + Type;
      body = p.name + ' is expected to miss about ' + inj.games + ' games with a ' + type + '.';
    } else if (inj.games >= 4) {
      headline = p.name + ' To Miss Time With ' + Type;
      body = p.name + ' is out for about ' + inj.games + ' games with a ' + type + '.';
    } else {
      headline = p.name + ' Day-To-Day With ' + Type;
      body = p.name + ' suffered a ' + type + ' and is listed as day-to-day.';
    }
    return item(state, 'injury', headline, body, [playerId]);
  }

  // ---------------------------------------------------------------------------
  // Games and milestones
  // ---------------------------------------------------------------------------
  // Scans an ENGINE.simGame result for big nights: 50-point games, triple-doubles, career highs.
  // Updates player.highs = { pts, reb, ast } so later career highs are measured against it.
  function game(state, res, opts) {
    opts = opts || {};
    var out = [];
    if (!res || !res.home || !res.away) return out;
    [res.home, res.away].forEach(function (side) {
      var other = side === res.home ? res.away : res.home;
      var won = side.pts > other.pts;
      side.box.forEach(function (row) {
        var p = player(state, row.id);
        var name = p.name || row.name || row.id;
        var reb = (row.oreb || 0) + (row.dreb || 0);
        var hi = p.highs || { pts: 0, reb: 0, ast: 0 };
        var vs = nick(state, other.abbr);
        var result = (won ? 'win over the ' : 'loss to the ') + vs;
        if (row.pts >= 60) {
          out.push(item(state, 'milestone', 'HISTORIC: ' + name + ' Pours In ' + row.pts + ' Points',
            name + ' scored ' + row.pts + ' points (' + row.fgm + ' of ' + row.fga + ' shooting) in a ' + result + '.', [row.id]));
        } else if (row.pts >= 50) {
          out.push(item(state, 'milestone', pick([name + ' Erupts For ' + row.pts, name + ' Drops ' + row.pts + ' On The ' + vs,
            row.pts + '-Point Explosion For ' + name], row.id + row.pts + (res.id || '')),
            name + ' scored ' + row.pts + ' points in a ' + result + '.', [row.id]));
        }
        var dbl = (row.pts >= 10) + (reb >= 10) + (row.ast >= 10) + ((row.stl || 0) >= 10) + ((row.blk || 0) >= 10);
        if (dbl >= 3 && row.pts < 50) {
          out.push(item(state, 'milestone', name + ' Records Triple-Double In ' + (won ? 'Win' : 'Loss'),
            name + ' finished with ' + row.pts + ' points, ' + reb + ' rebounds and ' + row.ast + ' assists against the ' + vs + '.', [row.id]));
        }
        if (row.pts > hi.pts && hi.pts >= 15 && row.pts >= 25 && row.pts < 50) {
          out.push(item(state, 'milestone', name + ' Sets Career High With ' + row.pts + ' Points',
            name + ' topped his previous best of ' + hi.pts + ' in a ' + result + '.', [row.id]));
        }
        if (reb >= 20 && reb > hi.reb) {
          out.push(item(state, 'milestone', name + ' Grabs ' + reb + ' Boards', name + ' pulled down ' + reb + ' rebounds in a ' + result + '.', [row.id]));
        }
        if (opts.update !== false && state && state.players && state.players[row.id]) {
          p.highs = { pts: Math.max(hi.pts, row.pts), reb: Math.max(hi.reb, reb), ast: Math.max(hi.ast, row.ast) };
        }
      });
    });
    return out;
  }

  var MILESTONES = { pts: [10000, 15000, 20000, 25000, 30000, 35000, 40000], reb: [5000, 10000, 12500, 15000],
    ast: [5000, 7500, 10000, 12500], tpm: [1000, 1500, 2000, 2500, 3000], g: [1000, 1200, 1500] };
  var STAT_WORD = { pts: 'Point', reb: 'Rebound', ast: 'Assist', tpm: 'Three-Pointer', g: 'Game' };

  // Career milestone crossed between two totals. Returns an item or null.
  function milestone(state, playerId, stat, before, after) {
    var marks = MILESTONES[stat] || [];
    var hit = null;
    marks.forEach(function (m) { if (before < m && after >= m) hit = m; });
    if (!hit) return null;
    var p = player(state, playerId);
    var headline = stat === 'g' ? p.name + ' Plays Career Game No. ' + comma(hit)
      : p.name + ' Joins ' + comma(hit) + '-' + STAT_WORD[stat] + ' Club';
    return item(state, 'milestone', headline, p.name + ' reached ' + comma(hit) + ' career ' + (stat === 'g' ? 'games' : STAT_WORD[stat].toLowerCase() + 's') + '.', [playerId]);
  }

  // ---------------------------------------------------------------------------
  // Awards and playoffs
  // ---------------------------------------------------------------------------
  var AWARD_NAMES = { mvp: 'MVP', dpoy: 'Defensive Player Of The Year', roy: 'Rookie Of The Year', smoy: 'Sixth Man Of The Year',
    mip: 'Most Improved Player' };

  function awards(state, res) {
    var out = [];
    if (!res) return out;
    var y = res.year || yearOf(state);
    Object.keys(AWARD_NAMES).forEach(function (k) {
      var id = res[k];
      if (!id) return;
      var p = player(state, id);
      var t = p.team ? ' of the ' + full(state, p.team) : '';
      var head = k === 'mvp' ? pick([p.name + ' Named ' + y + ' MVP', p.name + ' Wins ' + y + ' MVP', 'The Verdict Is In: ' + p.name + ' Is MVP'], id + y)
        : p.name + ' Wins ' + AWARD_NAMES[k];
      out.push(item(state, 'award', head, p.name + t + ' is the ' + (y - 1) + '-' + String(y).slice(2) + ' ' + AWARD_NAMES[k] + '.', [id]));
    });
    if (res.coy && res.coy.team) {
      var c = state && state.coaches && state.coaches[res.coy.coach];
      var cn = c ? c.name : 'The ' + nick(state, res.coy.team) + ' head coach';
      out.push(item(state, 'award', cn + ' Named Coach Of The Year', cn + ' led the ' + full(state, res.coy.team) + ' to the award.', res.coy.coach ? [res.coy.coach] : []));
    }
    if (res.allNba && res.allNba[0] && res.allNba[0].length) {
      out.push(item(state, 'award', 'All-NBA Teams Announced', 'First Team: ' + res.allNba[0].map(function (id) { return pname(state, id); }).join(', ') + '.', res.allNba[0].slice()));
    }
    return out;
  }

  function allStars(state, res) {
    if (!res || !res.East) return null;
    var starters = res.East.starters.concat(res.West.starters);
    return item(state, 'award', 'All-Star Starters Revealed',
      'East: ' + res.East.starters.map(function (id) { return pname(state, id); }).join(', ') + '. West: ' +
      res.West.starters.map(function (id) { return pname(state, id); }).join(', ') + '.', starters);
  }

  var ROUND_NAMES = { 1: 'First Round', 2: 'Conference Semifinals', 3: 'Conference Finals', 4: 'NBA Finals' };

  // series: an ENGINE playoff series { hi, lo, hw, lw, winner, round, conf }
  function series(state, s) {
    if (!s || !s.winner) return null;
    var w = s.winner, l = s.winner === s.hi ? s.lo : s.hi;
    var ww = Math.max(s.hw, s.lw), lw = Math.min(s.hw, s.lw);
    var games = ww + lw;
    var upset = s.winner === s.lo;
    var round = ROUND_NAMES[s.round] || (s.conf === 'Finals' ? 'NBA Finals' : 'Playoffs');
    var W = nick(state, w), L = nick(state, l);
    var headline;
    if (s.round === 4 || s.conf === 'Finals') headline = 'CHAMPIONS! ' + full(state, w) + ' Win The ' + yearOf(state) + ' NBA Title';
    else if (lw === 0) headline = W + ' Sweep ' + L;
    else if (games === 7) headline = upset ? 'Upset! ' + W + ' Stun ' + L + ' In Game 7' : W + ' Survive ' + L + ' In Seven';
    else if (upset) headline = 'Upset Alert: ' + W + ' Knock Out ' + L;
    else headline = W + ' Eliminate ' + L + ' In ' + (games === 5 ? 'Five' : 'Six');
    var body = 'The ' + full(state, w) + ' beat the ' + full(state, l) + ' ' + ww + '-' + lw + ' in the ' + round + '.';
    return item(state, 'playoffs', headline, body, []);
  }

  function champion(state, abbr, finalsMvp) {
    var id = finalsMvp && finalsMvp.id ? finalsMvp.id : finalsMvp;
    var name = id ? pname(state, id) : null;
    return item(state, 'playoffs', 'CHAMPIONS! ' + full(state, abbr) + ' Win The ' + yearOf(state) + ' NBA Title',
      'The ' + full(state, abbr) + ' are NBA champions.' + (name ? ' ' + name + ' was named Finals MVP.' : ''), id ? [id] : []);
  }

  function coach(state, change) {
    var c = state && state.coaches || {};
    var fired = change.fired && c[change.fired], hired = change.hired && c[change.hired];
    if (fired && hired) return item(state, 'coach', nick(state, change.team) + ' Fire ' + fired.name + ', Hire ' + hired.name,
      'The ' + full(state, change.team) + ' replaced ' + fired.name + ' with ' + hired.name + '.', [change.fired, change.hired]);
    if (hired) return item(state, 'coach', nick(state, change.team) + ' Name ' + hired.name + ' Head Coach',
      hired.name + ' takes over the ' + full(state, change.team) + '.', [change.hired]);
    if (fired) return item(state, 'coach', nick(state, change.team) + ' Part Ways With ' + fired.name,
      'The ' + full(state, change.team) + ' fired head coach ' + fired.name + '.', [change.fired]);
    return null;
  }

  function hallOfFame(state, inductees) {
    if (!inductees || !inductees.length) return null;
    var names = inductees.map(function (x) { return x.name || pname(state, x.id); });
    return item(state, 'award', names.length === 1 ? names[0] + ' Headed To The Hall Of Fame' : 'Hall Of Fame Class Of ' + yearOf(state) + ' Announced',
      'The Naismith Hall of Fame inducts ' + names.join(', ') + '.', inductees.map(function (x) { return x.id; }));
  }

  function jersey(state, r) {
    return item(state, 'award', nick(state, r.team) + ' To Retire ' + r.name + (r.number != null ? "'s No. " + r.number : "'s Jersey"),
      r.name + ' will have his number raised to the rafters by the ' + full(state, r.team) + '.', [r.id]);
  }

  function retire(state, playerId) {
    var p = player(state, playerId);
    return item(state, 'retire', p.name + ' Announces Retirement', p.name + ' has retired after ' + (p.yearsPro || 'several') + ' seasons.', [playerId]);
  }

  function draftPick(state, abbr, playerId, pickNo) {
    var p = player(state, playerId);
    return item(state, 'draft', (pickNo === 1 ? 'No. 1 Pick: ' : '') + nick(state, abbr) + ' Select ' + p.name + (pickNo > 1 ? ' At No. ' + pickNo : ''),
      'The ' + full(state, abbr) + ' drafted ' + p.name + ' with the ' + ord(pickNo) + ' pick.', [playerId]);
  }

  // ---------------------------------------------------------------------------
  // Real-world events (data/world-events.js)
  // ---------------------------------------------------------------------------
  function worldList() {
    if (typeof window !== 'undefined' && window.WORLD_EVENTS) return window.WORLD_EVENTS;
    if (root && root.WORLD_EVENTS) return root.WORLD_EVENTS;
    if (typeof require === 'function') { try { return require('../data/world-events.js'); } catch (e) { /* ignore */ } }
    return [];
  }

  // Events with dateFrom <= date <= dateTo ("YYYY-MM-DD" strings, both ends inclusive), oldest first.
  // Each comes back as a news item ready for NEWS.post, with type "world" and the real date.
  function worldFor(dateFrom, dateTo) {
    var from = String(dateFrom || '0000-00-00'), to = String(dateTo || dateFrom || '9999-12-31');
    return worldList().filter(function (e) { return e.date >= from && e.date <= to; }).map(function (e) {
      return { year: +e.date.slice(0, 4) + (+e.date.slice(5, 7) >= 7 ? 1 : 0), day: null, date: e.date, type: 'world',
        tag: e.tag || null, headline: clean(e.headline), body: clean(e.body), ids: [] };
    });
  }

  // ---------------------------------------------------------------------------
  // In-season stories: NEWS.tick(state)
  // ---------------------------------------------------------------------------
  // Call after every simmed day (LEAGUE.simChunk). It reads only what the sim already keeps
  // (season.days, season.boxScores, season.teams, players, CAREER_PRIOR, careerStats) and walks
  // every finished day since the last call, so calling it late or twice is safe. It writes stories
  // to the front of state.news (newest first, like js/league.js) and injury moves to
  // state.transactions (type "injury"). Its bookkeeping lives in state.newsGen.
  //   weekly: Players of the Week (East and West) | monthly: Rookies of the Month (from December)
  //   daily: big games (40+ points, triple-doubles, 20-20s), win and losing streaks of 6+, career
  //   milestones, injuries to stars, clinches and eliminations, trade rumors before the deadline.
  var BIG_PER_WEEK = 2, USER_BIG_PER_WEEK = 2, STAR_INJ_PER_WEEK = 2, STREAKS_PER_WEEK = 2;
  function poss(s) { return /s$/.test(s) ? s + "'" : s + "'s"; }
  // all-time scorers already retired in 2012 (career regular season points), for "passes" stories
  var ALL_TIME = [['Kareem Abdul-Jabbar', 38387], ['Karl Malone', 36928], ['Michael Jordan', 32292], ['Wilt Chamberlain', 31419],
    ["Shaquille O'Neal", 28596], ['Moses Malone', 27409], ['Elvin Hayes', 27313], ['Hakeem Olajuwon', 26946], ['Oscar Robertson', 26710],
    ['Dominique Wilkins', 26668], ['John Havlicek', 26395], ['Alex English', 25613], ['Reggie Miller', 25279], ['Jerry West', 25192]];
  var MILE = { pts: [15000, 20000, 25000, 30000, 35000, 40000], reb: [10000, 12500, 15000], ast: [7500, 10000, 12500] };
  var MILE_WORD = { pts: 'point', reb: 'rebound', ast: 'assist' };

  function glob(name) {
    if (typeof window !== 'undefined' && window[name]) return window[name];
    if (typeof globalThis !== 'undefined' && globalThis[name]) return globalThis[name];
    return root && root[name] || null;
  }
  function ymd(s) { var a = String(s).split('-'); return Date.UTC(+a[0], +a[1] - 1, +a[2]); }
  function weekKey(date) { var t = ymd(date), dow = (new Date(t).getUTCDay() + 6) % 7; return new Date(t - dow * 864e5).toISOString().slice(0, 10); }
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function niceDate(date) { var a = String(date).split('-'); return MONTHS[+a[1] - 1] + ' ' + (+a[2]); }
  function rebOf(r) { return r.reb != null ? r.reb : (r.oreb || 0) + (r.dreb || 0); }
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function confOf(season, abbr) {
    var ts = season.teams || [];
    for (var i = 0; i < ts.length; i++) if (ts[i].abbr === abbr) return ts[i].conf || 'East';
    return 'East';
  }
  function divOf(season, abbr) {
    var ts = season.teams || [];
    for (var i = 0; i < ts.length; i++) if (ts[i].abbr === abbr) return ts[i].div || null;
    return null;
  }
  function isRookie(p, year) {
    if (!p) return false;
    if (p.yearsPro != null) return p.yearsPro === 0;
    return !!(p.draft && p.draft.year === year - 1);
  }

  // career totals before this season: real seasons (CAREER_PRIOR, per game averages) plus seasons simmed in this save
  var priorCache = {};
  function careerBase(state, id) {
    var p = player(state, id), out = { pts: 0, reb: 0, ast: 0 };
    var CP = glob('CAREER_PRIOR');
    var key = id;
    if (!priorCache[key]) {
      var pc = { pts: 0, reb: 0, ast: 0 };
      ((CP && CP[id]) || []).forEach(function (x) {
        if (!x || !x.g) return;
        pc.pts += Math.round(x.g * (x.pts || 0)); pc.reb += Math.round(x.g * (x.reb || 0)); pc.ast += Math.round(x.g * (x.ast || 0));
      });
      priorCache[key] = pc;
    }
    out.pts = priorCache[key].pts; out.reb = priorCache[key].reb; out.ast = priorCache[key].ast;
    (p.careerStats || []).forEach(function (r) {
      if (!r || r.year >= yearOf(state)) return;
      out.pts += r.pts || 0; out.reb += rebOf(r); out.ast += r.ast || 0;
    });
    return out;
  }

  function teamGames(season) {
    var n = {};
    (season.days || []).forEach(function (d) {
      if (d.playoff) return;
      (d.games || []).forEach(function (g) { n[g.home] = (n[g.home] || 0) + 1; n[g.away] = (n[g.away] || 0) + 1; });
    });
    return n;
  }

  function freshGen(state, season) {
    var tm = {}, late = (season.day || 0) > 0;
    (season.teams || []).forEach(function (t) {
      var st = late && season.standings && season.standings[t.abbr] || {};
      tm[t.abbr] = { w: st.w || 0, l: st.l || 0, s: st.streak || 0, said: st.streak || 0 };
    });
    // an older save picks up from today without back-filling the season
    return { year: yearOf(state), day: season.day || 0, tm: tm, wk: null, mo: null, cl: {}, rum: {}, big: {}, inj: {}, ms: {}, dl: false };
  }

  function tick(state) {
    var season = state && state.season;
    if (!season || !Array.isArray(season.days) || !state.players) return [];
    var g = state.newsGen;
    if (!g || g.year !== yearOf(state) || g.day > (season.day || 0)) g = state.newsGen = freshGen(state, season);
    var out = [];
    var games = null;
    var stop = Math.min(season.day || 0, season.days.length);
    // regular season lines in the days this call walks (for career totals before each game)
    var pend = {};
    for (var j = g.day; j < stop; j++) {
      var dj = season.days[j];
      if (!dj || dj.playoff) continue;
      (dj.games || []).forEach(function (gm) {
        var b = gm.played && season.boxScores && season.boxScores[gm.id];
        if (!b || !b.home || typeof b.home !== 'object') return;
        [].concat(b.home.box || [], b.away.box || []).forEach(function (r) {
          var x = pend[r.id] || (pend[r.id] = { pts: 0, reb: 0, ast: 0 });
          x.pts += r.pts || 0; x.reb += rebOf(r); x.ast += r.ast || 0;
        });
      });
    }
    Object.defineProperty(g, '_run', { value: { pend: pend, cur: {} }, configurable: true, enumerable: false, writable: true });
    for (var i = g.day; i < stop; i++) {
      var d = season.days[i];
      if (!d) continue;
      var played = (d.games || []).filter(function (x) { return x.played; });
      if (!d.playoff) {
        if (!games) games = teamGames(season);
        rollPeriods(state, g, d, i, out);
      }
      played.forEach(function (gm) { gameDay(state, g, gm, d, i, out); });
      if (!d.playoff) {
        streaks(state, g, played, d, i, out);
        standingsNews(state, g, d, i, games, out);
        rumors(state, g, d, i, out);
      }
      g.day = i + 1;
    }
    // newest first at the front of the feed, like js/league.js
    if (out.length) {
      state.news = state.news || [];
      out.forEach(function (it) { state.news.unshift(it); });
      if (state.news.length > 300) state.news.length = 300;
    }
    return out;
  }

  function dayItem(state, d, i, type, headline, body, ids, extra) {
    var it = item(state, type, headline, body, ids);
    it.day = i; it.date = d.date; it.gen = 'season';
    if (extra) for (var k in extra) it[k] = extra[k];
    return it;
  }
  function mineTeam(state, abbr) { return abbr && abbr === state.userTeam; }

  // ---- weekly and monthly awards ----
  function addLine(map, r, won, team) {
    var x = map[r.id] || (map[r.id] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, team]);
    x[0]++; x[1] += r.pts || 0; x[2] += rebOf(r); x[3] += r.ast || 0; x[4] += r.stl || 0; x[5] += r.blk || 0;
    x[6] += r.tov || 0; x[7] += r.fgm || 0; x[8] += r.fga || 0; x[9] += won ? 1 : 0; x[10] = team;
  }
  function rollPeriods(state, g, d, i, out) {
    var wk = weekKey(d.date), mo = String(d.date).slice(0, 7);
    if (g.wk && g.wk.key !== wk) { weekly(state, g.wk, d, i, out); g.wk = null; g.big = {}; g.inj = {}; }
    if (!g.wk) g.wk = { key: wk, p: {} };
    // the first Rookie of the Month covers October and November together (as the NBA does)
    if (g.mo && g.mo.key !== mo && !/-10$/.test(g.mo.key)) { monthly(state, g.mo, d, i, out); g.mo = null; }
    if (!g.mo) g.mo = { key: mo, from: mo, p: {} };
    else if (g.mo.key !== mo) g.mo.key = mo;
  }
  function score(x) {
    var gp = x[0] || 1;
    return (x[1] + 0.4 * x[7] - 0.7 * x[8] + 0.6 * x[2] + 0.7 * x[3] + x[4] + 0.8 * x[5] - x[6]) / gp + 2.5 * (x[9] / gp) + 0.6 * Math.min(gp, 4);
  }
  function lineText(x) {
    var gp = x[0] || 1;
    return f1(x[1] / gp) + ' points, ' + f1(x[2] / gp) + ' rebounds and ' + f1(x[3] / gp) + ' assists';
  }
  function bestBy(state, map, filter, minG) {
    var best = {};
    Object.keys(map).forEach(function (id) {
      var x = map[id], p = state.players[id];
      if (!p || x[0] < minG || (filter && !filter(p, x))) return;
      var c = confOf(state.season, x[10]), sc = score(x);
      if (!best[c] || sc > best[c].sc) best[c] = { id: id, x: x, sc: sc, team: x[10] };
    });
    return best;
  }
  function weekly(state, wk, d, i, out) {
    var maxG = 0;
    Object.keys(wk.p).forEach(function (id) { maxG = Math.max(maxG, wk.p[id][0]); });
    if (maxG < 2) return;
    // last week's winners sit this one out (back to back awards are rare)
    var last = state.newsGen && state.newsGen.pow || [];
    var best = bestBy(state, wk.p, function (p) { return last.indexOf(p.id) < 0; }, Math.max(2, maxG - 1));
    if (!best.East || !best.West) return;
    if (state.newsGen) state.newsGen.pow = [best.East.id, best.West.id];
    var e = best.East, w = best.West, en = pname(state, e.id), wn = pname(state, w.id);
    var userWin = mineTeam(state, e.team) ? e : mineTeam(state, w.team) ? w : null;
    var head = userWin ? pname(state, userWin.id) + ' Named ' + (userWin === e ? 'Eastern' : 'Western') + ' Conference Player Of The Week'
      : pick(['Players Of The Week: ' + en + ' And ' + wn, en + ', ' + wn + ' Earn Player Of The Week Honors'], wk.key);
    var line = function (b, conf) {
      var gp = b.x[0];
      return pname(state, b.id) + ' (' + nick(state, b.team) + ') is the ' + conf + ' Player of the Week after averaging ' + lineText(b.x) +
        ' as the ' + nick(state, b.team) + ' went ' + b.x[9] + '-' + (gp - b.x[9]) + '.';
    };
    out.push(dayItem(state, d, i, 'award', head, line(e, 'East') + ' ' + line(w, 'West') + ' (Week of ' + niceDate(wk.key) + '.)', [e.id, w.id], { pow: wk.key }));
  }
  function monthly(state, mo, d, i, out) {
    var year = yearOf(state);
    var best = bestBy(state, mo.p, function (p) { return isRookie(p, year); }, 5);
    if (!best.East || !best.West) return;
    var e = best.East, w = best.West;
    var a = mo.from.split('-'), b = mo.key.split('-');
    var span = mo.from === mo.key ? MONTHS[+a[1] - 1] : MONTHS[+a[1] - 1] + ' and ' + MONTHS[+b[1] - 1];
    var line = function (x, conf) { return pname(state, x.id) + ' (' + nick(state, x.team) + ') takes the ' + conf + ' award after averaging ' + lineText(x.x) + ' in ' + x.x[0] + ' games.'; };
    var userWin = mineTeam(state, e.team) ? e : mineTeam(state, w.team) ? w : null;
    var head = userWin ? pname(state, userWin.id) + ' Named ' + (userWin === e ? 'East' : 'West') + ' Rookie Of The Month'
      : pname(state, e.id) + ' And ' + pname(state, w.id) + ' Named Rookies Of The Month';
    out.push(dayItem(state, d, i, 'award', head, 'Rookies of the Month for ' + span + ': ' + line(e, 'East') + ' ' + line(w, 'West'), [e.id, w.id], { rom: mo.key }));
  }

  // ---- one game: big lines, milestones, injuries ----
  function gameDay(state, g, gm, d, i, out) {
    var box = state.season.boxScores && state.season.boxScores[gm.id];
    var full = box && box.home && typeof box.home === 'object' && Array.isArray(box.home.box);
    var hs = gm.hs, as = gm.as;
    if (full) {
      [box.home, box.away].forEach(function (side) {
        var won = side === box.home ? hs > as : as > hs;
        var opp = side === box.home ? box.away.abbr : box.home.abbr;
        side.box.forEach(function (r) {
          if (!r || !(r.min > 0)) return;
          if (!d.playoff) { addLine(g.wk.p, r, won, side.abbr); if (g.mo && isRookie(state.players[r.id], yearOf(state))) addLine(g.mo.p, r, won, side.abbr); }
          bigLine(state, g, r, side.abbr, opp, won, side === box.home ? hs : as, side === box.home ? as : hs, d, i, out);
          if (!d.playoff) milestones(state, g, r, side.abbr, d, i, out);
        });
      });
      (box.injuries || []).forEach(function (inj) { injured(state, g, inj, d, i, out); });
    }
  }

  function bigLine(state, g, r, abbr, opp, won, pf, pa, d, i, out) {
    var reb = rebOf(r), pts = r.pts || 0, ast = r.ast || 0;
    var dbl = (pts >= 10) + (reb >= 10) + (ast >= 10) + ((r.stl || 0) >= 10) + ((r.blk || 0) >= 10);
    var what = null, rank = 0;
    if (pts >= 40) { what = 'pts'; rank = pts; }
    if (dbl >= 3 && rank < 45) { what = 'td'; rank = 40 + Math.min(pts, 30) / 3; }
    if (pts >= 20 && reb >= 20 && rank < 46) { what = 'tt'; rank = 44; }
    if (!what) return;
    var mine = mineTeam(state, abbr);
    var wk = g.big || (g.big = {});
    var huge = pts >= 50 || (dbl >= 3 && pts >= 30) || (pts >= 25 && reb >= 25) || d.playoff && pts >= 45;
    if (mine) { if ((wk.u || 0) >= USER_BIG_PER_WEEK && !huge) return; wk.u = (wk.u || 0) + 1; }
    else { if ((wk.n || 0) >= BIG_PER_WEEK && !huge) return; if (!huge && pts < 42 && what === 'pts' && (wk.n || 0) >= 1) return; wk.n = (wk.n || 0) + 1; }
    var name = pname(state, r.id), T = nick(state, abbr), O = nick(state, opp);
    var res = (won ? 'a ' + pf + '-' + pa + ' win over the ' : 'a ' + pa + '-' + pf + ' loss to the ') + O;
    var line = pts + ' points, ' + reb + ' rebounds and ' + ast + ' assists';
    var pre = d.playoff ? 'Playoffs: ' : '';
    var head, body;
    if (what === 'pts') {
      head = pts >= 50 ? pick([name + ' Erupts For ' + pts + ' Points', pts + '-Point Explosion For ' + name, name + ' Drops ' + pts + ' On The ' + O], r.id + d.date)
        : pick([name + ' Scores ' + pts + ' As ' + T + (won ? ' Top ' : ' Fall To ') + O, name + ' Pours In ' + pts + ' Against The ' + O, name + ' Goes For ' + pts + (won ? ' In ' + T + ' Win' : ' In Losing Effort')], r.id + d.date);
      body = name + ' scored ' + pts + ' points on ' + (r.fgm || 0) + '-of-' + (r.fga || 0) + ' shooting' + ((r.tpm || 0) >= 4 ? ', with ' + r.tpm + ' threes,' : '') + ' in ' + res + '.';
    } else if (what === 'td') {
      head = name + ' Posts Triple-Double ' + (won ? 'In Win Over ' : 'In Loss To ') + O;
      body = name + ' finished with ' + line + (r.stl >= 10 ? ' and ' + r.stl + ' steals' : r.blk >= 10 ? ' and ' + r.blk + ' blocks' : '') + ' in ' + res + '.';
    } else {
      head = name + ' Goes For ' + pts + ' And ' + reb + ' Against The ' + O;
      body = name + ' piled up ' + pts + ' points and ' + reb + ' rebounds in ' + res + '.';
    }
    out.push(dayItem(state, d, i, 'milestone', pre + head, body, [r.id], { team: abbr }));
  }

  function milestones(state, g, r, abbr, d, i, out) {
    var p = state.players[r.id];
    if (!p) return;
    // career totals before this game: the season line holds every game simmed so far, so the games
    // of this tick not yet walked (run.pend) come off it
    var ps = state.season.playerStats && state.season.playerStats[r.id];
    var run = g._run;
    if (!ps || !run) return;
    var c = run.cur[r.id];
    if (!c) {
      var base = careerBase(state, r.id), pd = run.pend[r.id] || { pts: 0, reb: 0, ast: 0 };
      c = run.cur[r.id] = { pts: base.pts + (ps.pts || 0) - pd.pts, reb: base.reb + rebOf(ps) - pd.reb, ast: base.ast + (ps.ast || 0) - pd.ast };
    }
    var stat = { pts: r.pts || 0, reb: rebOf(r), ast: r.ast || 0 };
    Object.keys(MILE).forEach(function (k) {
      var before = c[k], after = before + stat[k];
      c[k] += stat[k];
      var hit = null;
      MILE[k].forEach(function (m) { if (before < m && after >= m) hit = m; });
      var name = p.name;
      if (hit && !g.ms[r.id + k + hit]) {
        g.ms[r.id + k + hit] = 1;
        out.push(dayItem(state, d, i, 'milestone', name + ' Reaches ' + comma(hit) + ' Career ' + title(MILE_WORD[k]) + 's',
          name + ' became the latest member of the ' + comma(hit) + '-' + MILE_WORD[k] + ' club with ' + stat[k] + ' ' + MILE_WORD[k] + 's against the ' +
          nick(state, gameOpp(state, r, abbr, d)) + '. He has ' + comma(after) + ' for his career.', [r.id], { team: abbr }));
      }
      if (k === 'pts') ALL_TIME.forEach(function (x, rank) {
        if (before < x[1] && after >= x[1] && !g.ms[r.id + 'at' + rank]) {
          g.ms[r.id + 'at' + rank] = 1;
          out.push(dayItem(state, d, i, 'milestone', name + ' Passes ' + x[0] + ' On All-Time Scoring List',
            name + ' moved past ' + x[0] + ' (' + comma(x[1]) + ') and now has ' + comma(after) + ' career points.', [r.id], { team: abbr }));
        }
      });
    });
  }
  function gameOpp(state, r, abbr, d) {
    var gm = (d.games || []).filter(function (x) { return x.home === abbr || x.away === abbr; })[0];
    return gm ? gm.home === abbr ? gm.away : gm.home : abbr;
  }

  function injured(state, g, inj, d, i, out) {
    var p = state.players[inj.id];
    if (!p) return;
    var abbr = inj.team || p.team, games = inj.games || 1;
    var long = inj.seasonEnding || games >= 999;
    if (games >= 3 || long || mineTeam(state, abbr)) {
      state.transactions = state.transactions || [];
      state.transactions.push({ year: yearOf(state), day: i, type: 'injury', text: nick(state, abbr) + ': ' + p.name + ' (' + String(inj.type || 'injury').split(' ').map(function (w) { return w === w.toUpperCase() ? w : w.toLowerCase(); }).join(' ') + '), ' +
        (long ? 'out for the season.' : 'out about ' + games + (games === 1 ? ' game.' : ' games.')), ids: [inj.id], team: abbr });
    }
    // stories for stars on other teams (the user's own injuries already get one from js/league.js)
    if (mineTeam(state, abbr)) return;
    var ovr = p.ovr || 0;
    if (!(long && ovr >= 76 || ovr >= 80 && games >= 5)) return;
    var wk = g.inj || (g.inj = {});
    if ((wk.n || 0) >= STAR_INJ_PER_WEEK && !(long && ovr >= 80)) return;
    wk.n = (wk.n || 0) + 1;
    var it = injury(state, inj.id, { type: inj.type, games: long ? 999 : games });
    it.day = i; it.date = d.date; it.gen = 'season'; it.team = abbr;
    out.push(it);
  }

  // ---- streaks ----
  function streaks(state, g, played, d, i, out) {
    played.forEach(function (gm) {
      [[gm.home, gm.hs > gm.as, gm.away], [gm.away, gm.as > gm.hs, gm.home]].forEach(function (x) {
        var t = g.tm[x[0]] || (g.tm[x[0]] = { w: 0, l: 0, s: 0, said: 0 });
        var prev = t.s;
        if (x[1] !== (prev > 0) || !prev) t.said = 0;
        if (x[1]) { t.w++; t.s = t.s > 0 ? t.s + 1 : 1; } else { t.l++; t.s = t.s < 0 ? t.s - 1 : -1; }
        var T = nick(state, x[0]), O = nick(state, x[2]), n = Math.abs(t.s), rec = ' (' + t.w + '-' + t.l + ')';
        // a long streak ends
        var mine = mineTeam(state, x[0]) || mineTeam(state, x[2]);
        var wk = g.big || (g.big = {});
        // at most two streak stories a week from other teams, one of them a new 6-game run
        var room = mine || (wk.s || 0) < STREAKS_PER_WEEK;
        if ((Math.abs(prev) >= 10 || mine && Math.abs(prev) >= 6) && (prev > 0) !== (t.s > 0) && room) {
          if (!mine) wk.s = (wk.s || 0) + 1;
          out.push(dayItem(state, d, i, 'streak', prev > 0 ? O + ' Snap ' + poss(T) + ' ' + prev + '-Game Win Streak' : T + ' End ' + Math.abs(prev) + '-Game Skid Against The ' + O,
            prev > 0 ? 'The ' + full(state, x[2]) + ' ended the ' + poss(full(state, x[0])) + ' run at ' + prev + ' straight wins.' : 'The ' + full(state, x[0]) + ' beat the ' + O + ' to stop a ' + Math.abs(prev) + '-game losing streak' + rec + '.', [], { team: x[0] }));
        }
        if (n >= 6 && (n === 6 || n === 10 || (n > 10 && n % 5 === 0)) && Math.abs(t.said) < n) {
          t.said = t.s;
          if (!mineTeam(state, x[0])) { if ((wk.s || 0) >= (n < 10 ? 1 : STREAKS_PER_WEEK)) return; wk.s = (wk.s || 0) + 1; }
          var head = t.s > 0 ? pick([T + ' Win ' + n + ' Straight', T + ' Stretch Win Streak To ' + n, 'Red Hot: ' + T + ' Have Won ' + n + ' In A Row'], x[0] + d.date)
            : pick([T + ' Drop ' + n + ' Straight', T + ' Losing Streak Hits ' + n, 'Skid Continues: ' + T + ' Lose ' + n + ' In A Row'], x[0] + d.date);
          out.push(dayItem(state, d, i, 'streak', head, 'The ' + full(state, x[0]) + (t.s > 0 ? ' beat the ' + O + ' for their ' + ord(n) + ' straight win' : ' fell to the ' + O + ' for their ' + ord(n) + ' straight loss') + rec + '.', [], { team: x[0] }));
        }
      });
    });
  }

  // ---- standings: clinches and eliminations ----
  function standingsNews(state, g, d, i, games, out) {
    if (String(d.date).slice(5, 7) !== '03' && String(d.date).slice(5, 7) !== '04') return;
    var season = state.season, confs = { East: [], West: [] };
    Object.keys(g.tm).forEach(function (a) {
      var t = g.tm[a], left = Math.max(0, (games[a] || 82) - t.w - t.l);
      (confs[confOf(season, a)] || confs.East).push({ a: a, w: t.w, l: t.l, max: t.w + left });
    });
    Object.keys(confs).forEach(function (c) {
      var list = confs[c];
      list.forEach(function (t) {
        var cl = g.cl[t.a] || (g.cl[t.a] = {});
        var others = list.filter(function (o) { return o.a !== t.a; });
        var T = nick(state, t.a), rec = ' (' + t.w + '-' + t.l + ')';
        var said = function (k, head, body) { cl[k] = 1; out.push(dayItem(state, d, i, 'standings', head, body, [], { team: t.a })); };
        if (!cl.po && others.filter(function (o) { return o.max >= t.w; }).length <= 7) {
          said('po', pick([T + ' Clinch A Playoff Spot', T + ' Punch Their Playoff Ticket', T + ' Are Playoff Bound'], t.a + state.year), 'The ' + full(state, t.a) + rec + ' have clinched a spot in the ' + state.year + ' ' + c + 'ern Conference playoffs.');
        }
        var dv = divOf(season, t.a);
        if (cl.po && !cl.div && dv && others.filter(function (o) { return divOf(season, o.a) === dv && o.max >= t.w; }).length === 0) {
          said('div', T + ' Clinch The ' + dv + ' Division', 'The ' + full(state, t.a) + rec + ' have wrapped up the ' + dv + ' Division title.');
        }
        if (cl.po && !cl.top && others.every(function (o) { return o.max < t.w; })) {
          said('top', T + ' Lock Up No. 1 Seed In The ' + c, 'The ' + full(state, t.a) + rec + ' will have home court advantage throughout the ' + c + 'ern Conference playoffs.');
        }
        if (!cl.out && others.filter(function (o) { return o.w > t.max; }).length >= 8) {
          cl.out = 1;
          // eliminations are news for the user's team and for teams that were in the race
          if (mineTeam(state, t.a) || t.w / Math.max(1, t.w + t.l) >= 0.42) out.push(dayItem(state, d, i, 'standings', T + ' Eliminated From Playoff Contention',
            'The ' + full(state, t.a) + rec + ' will miss the playoffs this season.', [], { team: t.a }));
        }
      });
    });
  }

  // ---- trade rumors in the three weeks before the deadline ----
  function deadlineMD(year) {
    var T = glob('TRADE'), L = glob('LEAGUE');
    if (T && typeof T.deadlineMD === 'function') return T.deadlineMD(year);
    if (L && L.KEY_DATES && L.KEY_DATES.tradeDeadline) return L.KEY_DATES.tradeDeadline(year);
    return '02-21';
  }
  function rumors(state, g, d, i, out) {
    var year = yearOf(state), dl = year + '-' + deadlineMD(year), date = String(d.date);
    var gap = Math.round((ymd(dl) - ymd(date)) / 864e5);
    if (gap < 0) {
      if (gap < -4) return;
      if (!g.dl) {
        g.dl = true;
        var deals = (state.transactions || []).filter(function (t) { return t && t.type === 'trade' && t.year === year && t.day >= i - 4; }).length;
        out.push(dayItem(state, d, i, 'trade', deals ? 'Trade Deadline Passes After ' + deals + ' Late Deal' + (deals === 1 ? '' : 's') : 'Quiet Deadline: No Deals In The Final Days',
          'The ' + (year - 1) + '-' + String(year).slice(2) + ' trade deadline has passed. Rosters are set for the stretch run.', []));
      }
      return;
    }
    if (gap < 1 || gap > 21 || hash(date + 'rumor') % 4 !== 0 && gap > 1) return;
    var st = g.tm, players = state.players, pool = [];
    var pct = function (a) { var t = st[a] || { w: 0, l: 0 }; return t.w / Math.max(1, t.w + t.l); };
    Object.keys(players).forEach(function (id) {
      var p = players[id];
      if (!p || p.retired || !st[p.team] || g.rum[id] || (p.ovr || 0) < 74) return;
      if ((p.contract && p.contract.twoWay) || (state.season.injuries && state.season.injuries[id] && state.season.injuries[id].games > 20)) return;
      var w = pct(p.team);
      if (w > 0.47) return;
      var last = p.contract && p.contract.salaries ? p.contract.salaries[p.contract.salaries.length - 1] : null;
      var expiring = !last || last.year <= year;
      pool.push({ p: p, rank: (p.ovr || 0) + (expiring ? 4 : 0) + ((p.age || 25) >= 28 ? 2 : 0) - w * 10 + (hash(id + date) % 5) });
    });
    if (!pool.length) return;
    pool.sort(function (a, b) { return b.rank - a.rank; });
    var c = pool[hash(date) % Math.min(4, pool.length)].p;
    var buyers = Object.keys(st).filter(function (a) { return a !== c.team && pct(a) >= 0.55; })
      .sort(function (a, b) { return pct(b) - pct(a); });
    var bu = buyers.length ? buyers[hash(c.id + date) % Math.min(5, buyers.length)] : null;
    g.rum[c.id] = 1;
    var T = nick(state, c.team), rec = st[c.team] ? st[c.team].w + '-' + st[c.team].l : '';
    var s = state.season.playerStats && state.season.playerStats[c.id];
    var line = s && s.g ? ' He is averaging ' + f1(s.pts / s.g) + ' points and ' + f1(rebOf(s) / s.g) + ' rebounds.' : '';
    var head = pick(['Rumor: ' + T + ' Listening To Offers For ' + c.name, 'Sources: ' + c.name + ' Available As Deadline Nears',
      'Trade Buzz: ' + (bu ? nick(state, bu) + ' Interested In ' : 'Contenders Circle ') + c.name], c.id + date);
    var body = 'With the ' + full(state, c.team) + ' at ' + rec + ' and the deadline ' + (gap === 1 ? 'tomorrow' : gap + ' days away') + ', league sources say ' + c.name +
      ' could be on the move' + (bu ? ', and the ' + full(state, bu) + ' are among the teams that have called' : '') + '.' + line;
    out.push(dayItem(state, d, i, 'rumor', head, body, [c.id], { team: c.team, rumor: true }));
  }

  var GEN = { trade: trade, signing: signing, release: release, injury: injury, game: game, milestone: milestone,
    awards: awards, allStars: allStars, series: series, champion: champion, coach: coach, hallOfFame: hallOfFame,
    jersey: jersey, retire: retire, draftPick: draftPick };

  function publish(state, type) {
    var fn = GEN[type];
    if (!fn) return null;
    var it = fn.apply(null, [state].concat(Array.prototype.slice.call(arguments, 2)));
    return post(state, it);
  }

  var NEWS = { post: post, publish: publish, clean: clean, money: money, worldFor: worldFor, tick: tick, weekKey: weekKey };
  Object.keys(GEN).forEach(function (k) { NEWS[k] = GEN[k]; });

  if (typeof window !== 'undefined') window.NEWS = NEWS;
  else if (root) root.NEWS = NEWS;
  if (typeof module !== 'undefined' && module.exports) module.exports = NEWS;
})(typeof self !== 'undefined' ? self : this);
