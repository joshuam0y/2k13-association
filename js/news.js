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

  var GEN = { trade: trade, signing: signing, release: release, injury: injury, game: game, milestone: milestone,
    awards: awards, allStars: allStars, series: series, champion: champion, coach: coach, hallOfFame: hallOfFame,
    jersey: jersey, retire: retire, draftPick: draftPick };

  function publish(state, type) {
    var fn = GEN[type];
    if (!fn) return null;
    var it = fn.apply(null, [state].concat(Array.prototype.slice.call(arguments, 2)));
    return post(state, it);
  }

  var NEWS = { post: post, publish: publish, clean: clean, money: money, worldFor: worldFor };
  Object.keys(GEN).forEach(function (k) { NEWS[k] = GEN[k]; });

  if (typeof window !== 'undefined') window.NEWS = NEWS;
  else if (root) root.NEWS = NEWS;
  if (typeof module !== 'undefined' && module.exports) module.exports = NEWS;
})(typeof self !== 'undefined' ? self : this);
