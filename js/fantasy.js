// Fantasy draft start: window.FANTASY.newFantasyLeague(userTeam, opts) builds a league like
// LEAGUE.newLeague, then puts every 2012-13 player into a 30-team, 15-round snake draft.
// AI teams pick by a blend of overall, age and position need. Players keep their real contracts.
// The draft screen (#/fantasy, #/fantasy/new) is drawn when the UI is loaded.
(function (root) {
  'use strict';
  var W = root;
  var ROUNDS = 15;
  var POS = ['PG', 'SG', 'SF', 'PF', 'C'];
  var GROUP = { PG: 'G', SG: 'G', SF: 'W', PF: 'B', C: 'B' };
  var GROUP_TARGET = { G: 6, W: 3, B: 6 };

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function primaryPos(pos) { var p = String(pos || 'SF').toUpperCase().split(/[-\/ ,]/)[0]; return GROUP[p] ? p : 'SF'; }

  function newFantasyLeague(userTeam, opts) {
    opts = opts || {};
    var L = W.LEAGUE;
    if (!L || typeof L.newLeague !== 'function') throw new Error('The league module (js/league.js) is not loaded.');
    var seed = opts.seed || Math.floor(Math.random() * 2147483646) + 1;
    var state = L.newLeague(userTeam, Object.assign({}, opts, { seed: seed }));
    var rng = mulberry32((seed ^ 0x5f3759df) >>> 0);
    var order = Object.keys(state.teams).sort();
    for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = order[i]; order[i] = order[j]; order[j] = t; }
    var pool = [];
    Object.keys(state.players).forEach(function (id) {
      var p = state.players[id];
      if (!p || p.retired || p.team === 'DRAFT') return;
      if (p.stashedUntil && p.stashedUntil > state.year) return;
      if (p.team !== 'FA' && !state.teams[p.team]) return;
      p.realTeam = p.team;
      p.team = 'FA';
      p.gleague = false;
      pool.push(id);
    });
    pool.sort(function (a, b) { return (state.players[b].ovr || 0) - (state.players[a].ovr || 0); });
    order.forEach(function (a) { state.teams[a].rotation = null; });
    state.fantasy = { seed: seed, order: order, rounds: ROUNDS, picks: [], pool: pool, done: false };
    return state;
  }

  function total(state) { var f = state.fantasy; return f.order.length * f.rounds; }
  function slot(state, n) {
    var f = state.fantasy, N = f.order.length;
    var r = Math.floor(n / N), k = n % N;
    return { n: n, round: r + 1, pick: k + 1, team: r % 2 === 0 ? f.order[k] : f.order[N - 1 - k] };
  }
  function onClock(state) {
    var f = state && state.fantasy;
    if (!f || f.done) return null;
    var n = f.picks.length;
    if (n >= total(state) || !f.pool.length) return null;
    return slot(state, n);
  }
  function rosterOf(state, abbr) {
    return state.fantasy.picks.filter(function (x) { return x.team === abbr; }).map(function (x) { return state.players[x.id]; });
  }

  // How much a team wants a player right now.
  function score(state, abbr, p, rng, roster) {
    var f = state.fantasy;
    var ovr = p.ovr || 40, pot = p.pot || ovr, age = p.age || 27;
    var s = ovr;
    if (age <= 22) s += (pot - ovr) * 0.35;
    else if (age <= 25) s += (pot - ovr) * 0.2;
    else if (age >= 31) s -= (age - 30) * 1.1;
    var inj = p.injury && p.injury.games > 0 ? p.injury.games : 0;
    if (inj >= 60) s -= 9; else if (inj >= 25) s -= 4; else if (inj >= 10) s -= 1.5;
    roster = roster || rosterOf(state, abbr);
    var pos = primaryPos(p.pos), g = GROUP[pos];
    var gc = 0, pc = 0;
    roster.forEach(function (q) { var qp = primaryPos(q.pos); if (qp === pos) pc++; if (GROUP[qp] === g) gc++; });
    if (gc >= GROUP_TARGET[g]) s -= 7;
    else if (pc >= 4) s -= 4;
    var round = Math.floor(f.picks.length / f.order.length) + 1;
    if (round >= 3 && gc === 0) s += 3;
    if (round >= 5 && pc === 0) s += 2;
    s += (rng ? rng() : 0.5) * 2.5;
    return s;
  }
  function aiChoice(state, abbr) {
    var f = state.fantasy;
    var rng = mulberry32((f.seed + (f.picks.length + 1) * 7919) >>> 0);
    var roster = rosterOf(state, abbr);
    var best = null, bestS = -1e9;
    // the pool is sorted by overall, so only the top part can win
    var look = f.pool.slice(0, 60);
    look.forEach(function (id) {
      var v = score(state, abbr, state.players[id], rng, roster);
      if (v > bestS) { bestS = v; best = id; }
    });
    return best;
  }

  function pick(state, id) {
    var c = onClock(state);
    if (!c) return { ok: false, reason: 'The draft is over.' };
    var f = state.fantasy;
    var i = f.pool.indexOf(id);
    if (i < 0) return { ok: false, reason: 'That player is not available.' };
    var p = state.players[id];
    f.pool.splice(i, 1);
    p.team = c.team; p.yearsWithTeam = 0;
    f.picks.push({ n: c.n + 1, round: c.round, pick: c.pick, team: c.team, id: id });
    state.transactions = state.transactions || [];
    state.transactions.push({ year: state.year, day: 0, type: 'draft', text: 'Fantasy draft, round ' + c.round + ' pick ' + c.pick + ': ' + c.team + ' select ' + p.name + '.', ids: [id] });
    return { ok: true, slot: c, id: id };
  }
  function aiPick(state) {
    var c = onClock(state);
    if (!c) return null;
    var id = aiChoice(state, c.team);
    return id ? pick(state, id) : null;
  }
  // AI picks until it is the user's turn (or the draft ends). Returns how many picks were made.
  function simToUser(state) {
    var n = 0, c;
    while ((c = onClock(state)) && c.team !== state.userTeam) { aiPick(state); n++; }
    return n;
  }
  // Picks for everyone, the user included, to the end of the draft.
  function autoDraft(state) {
    var n = 0;
    while (onClock(state)) { aiPick(state); n++; }
    return n;
  }

  // After the last pick: undrafted players become free agents, rookies of the draft get contracts,
  // and the season is rebuilt for the new rosters.
  function finish(state) {
    var f = state.fantasy;
    if (!f || f.done) return state;
    var rules = null;
    try { rules = W.CBA && typeof W.CBA.rules === 'function' ? W.CBA.rules(state.year) : null; } catch (e) { rules = null; }
    f.pool.forEach(function (id) { var p = state.players[id]; p.team = 'FA'; p.contract = null; });
    f.picks.forEach(function (x) {
      var p = state.players[x.id];
      var min = 490180;
      try { if (rules && typeof rules.minSalary === 'function') min = rules.minSalary(p.yearsPro || 0) || min; } catch (e) { /* default */ }
      if (p.contract && Array.isArray(p.contract.salaries) && p.contract.salaries.length) {
        p.contract.salaries.forEach(function (s) { if (!(s.amount > 0)) s.amount = min; });
        return;
      }
      p.contract = { salaries: [{ year: state.year, amount: Math.max(p.salary || 0, min) }], option: null, rookie: false, twoWay: false, signedYear: state.year };
    });
    Object.keys(state.players).forEach(function (id) { delete state.players[id].realTeam; });
    var E = W.ENGINE;
    if (E && typeof E.newSeason === 'function' && W.LEAGUE && typeof W.LEAGUE.leagueView === 'function') {
      state.season = E.newSeason(W.LEAGUE.leagueView(state), { year: state.year, userTeam: state.userTeam, rules: rules });
      state.season.userTeam = state.userTeam;
    }
    state.phase = 'regular'; state.day = 0;
    f.done = true;
    f.pool = [];
    var first = f.picks.filter(function (x) { return x.team === state.userTeam; })[0];
    var t = state.teams[state.userTeam];
    state.news = state.news || [];
    state.news.unshift({ year: state.year, day: 0, headline: 'Fantasy draft complete',
      body: 'All 30 rosters were drafted from scratch.' + (first && t ? ' The ' + t.name + ' opened with ' + state.players[first.id].name + ' in round ' + first.round + '.' : ''), ids: first ? [first.id] : [] });
    return state;
  }

  // Rebuild a draft in progress from its seed and the picks made so far.
  function restore(meta) {
    var state = newFantasyLeague(meta.userTeam, { seed: meta.seed });
    (meta.picks || []).forEach(function (id) { pick(state, id); });
    return state;
  }

  var API = {
    ROUNDS: ROUNDS, newFantasyLeague: newFantasyLeague, onClock: onClock, slot: slot, total: total, pick: pick,
    aiPick: aiPick, aiChoice: aiChoice, simToUser: simToUser, autoDraft: autoDraft, finish: finish, restore: restore,
    rosterOf: rosterOf, score: score, current: null
  };
  W.FANTASY = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;

  // =====================================================================
  // Draft screen
  // =====================================================================
  var UI = W.UI;
  if (!UI || typeof document === 'undefined') return;
  var P = UI.pages = UI.pages || {};
  var esc = UI.esc;
  var KEY = W.__A13_STUB ? 'a13-fantasy-draft-stub' : 'a13-fantasy-draft';
  var view = { pos: '', q: '' };

  function lsGet() { try { var r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function lsSet(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* the draft still works in memory */ } }
  function lsDel() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function remember() {
    var c = API.current;
    if (!c) return;
    lsSet({ userTeam: c.state.userTeam, seed: c.state.fantasy.seed, name: c.name, slot: c.slot, picks: c.state.fantasy.picks.map(function (x) { return x.id; }) });
  }
  function missing(app) {
    if (!(W.LEAGUE && typeof W.LEAGUE.newLeague === 'function')) {
      app.innerHTML = UI.empty('LEAGUE MODULE NOT LOADED', 'The fantasy draft needs the league orchestrator (<code>js/league.js</code>), which did not load.', '<div class="row-btns"><a class="btn" href="#/home">HOME</a></div>');
      return true;
    }
    if (!(W.ENGINE && typeof W.ENGINE.newSeason === 'function')) {
      app.innerHTML = UI.empty('SIM ENGINE NOT LOADED', 'The fantasy draft needs the game engine (<code>js/engine.js</code>), which did not load.', '<div class="row-btns"><a class="btn" href="#/home">HOME</a></div>');
      return true;
    }
    return false;
  }

  P.fantasy = function (app, arg) {
    if (missing(app)) return;
    if (arg === 'new') { drawSetup(app); return; }
    if (!API.current) {
      var meta = lsGet();
      if (meta && meta.userTeam) {
        try { API.current = { state: restore(meta), name: meta.name, slot: meta.slot }; }
        catch (e) { console.warn('[fantasy] could not restore the draft', e); lsDel(); }
      }
    }
    if (!API.current) { drawSetup(app); return; }
    drawBoard(app);
  };
  P.fantasy.navLabel = 'Fantasy Draft';
  P.fantasy.navDesc = 'Every 2012-13 player back in one pool: a 30-team, 15-round snake draft';

  function drawSetup(app) {
    var teams = UI.teams();
    var confs = ['East', 'West'];
    var slots = UI.saves && typeof UI.saves.list === 'function' ? UI.saves.list() : [];
    var first = (UI.saves && typeof UI.saves.firstEmpty === 'function' && UI.saves.firstEmpty()) || 1;
    var inProgress = API.current || lsGet();
    app.innerHTML = UI.header('FANTASY DRAFT', 'Pick your franchise. Every 2012-13 player goes back into one pool for a 30-team, 15-round snake draft. Contracts stay real. The draft order is drawn at random.') +
      (inProgress ? '<div class="note">A fantasy draft is already in progress. <a href="#/fantasy">Go back to it</a>, or pick a team below to start over.</div>' : '') +
      confs.map(function (c) {
        return '<h3 class="conf-label">' + esc(c.toUpperCase()) + 'ERN CONFERENCE</h3><div class="team-grid">' +
          teams.filter(function (t) { return t.conf === c; }).sort(function (a, b) { return a.city.localeCompare(b.city); }).map(function (t) {
            return '<button type="button" class="team-tile" data-team="' + esc(t.abbr) + '" style="--c1:' + esc(t.colors[0]) + '">' + UI.logo(t.abbr, 64) +
              '<span class="tt-city">' + esc(t.city) + '</span><span class="tt-name">' + esc(t.name) + '</span><span class="tt-meta">EMPTY ROSTER</span></button>';
          }).join('') + '</div>';
      }).join('') +
      '<div class="confirm" id="fdConfirm" hidden><div class="confirm-inner"><div class="confirm-team" id="fdTeam"></div>' +
      '<label class="field"><span>SAVE NAME</span><input id="fdName" maxlength="40"></label>' +
      (slots.length ? '<label class="field"><span>SAVE SLOT</span><select id="fdSlot">' + slots.map(function (s) { return '<option value="' + s.slot + '"' + (s.slot === first ? ' selected' : '') + '>Slot ' + s.slot + ': ' + (s.meta ? esc(s.meta.name) + ' (overwrite)' : 'Empty') + '</option>'; }).join('') + '</select></label>' : '') +
      '<div class="confirm-actions"><button type="button" class="btn btn-gold" id="fdStart">START THE DRAFT</button><button type="button" class="btn" id="fdCancel">CANCEL</button></div></div></div>';
    var picked = null;
    var box = UI.$('#fdConfirm');
    app.querySelectorAll('.team-tile').forEach(function (b) {
      b.addEventListener('click', function () {
        picked = b.getAttribute('data-team');
        app.querySelectorAll('.team-tile').forEach(function (x) { x.classList.toggle('picked', x === b); });
        UI.$('#fdTeam').innerHTML = UI.logo(picked, 56) + '<div><div class="ct-k">YOU DRAFT FOR THE</div><div class="ct-t">' + esc(UI.teamName(picked)) + '</div></div>';
        UI.$('#fdName').value = UI.team(picked).name + ' Fantasy';
        box.hidden = false;
      });
    });
    UI.$('#fdCancel').addEventListener('click', function () { box.hidden = true; picked = null; app.querySelectorAll('.team-tile').forEach(function (x) { x.classList.remove('picked'); }); });
    UI.$('#fdStart').addEventListener('click', function () {
      if (!picked) return;
      var btn = UI.$('#fdStart');
      btn.disabled = true; btn.textContent = 'BUILDING THE POOL...';
      setTimeout(function () {
        try {
          var st = newFantasyLeague(picked, {});
          var sl = UI.$('#fdSlot');
          API.current = { state: st, name: (UI.$('#fdName').value || '').trim().slice(0, 40) || UI.team(picked).name + ' Fantasy', slot: sl ? Number(sl.value) : null };
          remember();
          location.hash = '#/fantasy';
        } catch (e) {
          console.warn('[fantasy] could not start', e);
          UI.toast('Could not start the fantasy draft: ' + (e && e.message ? e.message : e), 'error');
          btn.disabled = false; btn.textContent = 'START THE DRAFT';
        }
      }, 20);
    });
  }

  function money(d) { return UI.extras ? UI.extras.money(d) : UI.fmtMoney(d); }
  function salaryOf(state, p) {
    var c = p.contract;
    if (c && Array.isArray(c.salaries) && c.salaries.length) { var r = c.salaries.filter(function (s) { return s.year === state.year; })[0] || c.salaries[0]; return r.amount; }
    return p.salary || 0;
  }

  function drawBoard(app) {
    var cur = API.current, state = cur.state, f = state.fantasy;
    var user = state.userTeam;
    var c = onClock(state);
    var N = total(state);
    var done = !c;
    var youUp = c && c.team === user;
    var untilYou = null;
    if (c && !youUp) { for (var n = c.n; n < N; n++) if (slot(state, n).team === user) { untilYou = n - c.n; break; } }
    var tName = function (a) { var t = state.teams[a]; return t ? t.city + ' ' + t.name : a; };
    var clock = done
      ? '<div class="fd-done"><div class="fd-clock-k">ALL ' + f.picks.length + ' PICKS ARE IN</div><div class="fd-clock-n">DRAFT COMPLETE</div>' +
        '<div class="row-btns center"><button type="button" class="btn btn-gold" id="fdGo">START THE SEASON</button><a class="btn" href="#/fantasy/new">START OVER</a></div></div>'
      : '<section class="fd-clock' + (youUp ? ' you' : '') + '">' + UI.logo(c.team, 64) +
        '<div class="fd-clock-t"><div class="fd-clock-k">ROUND ' + c.round + ' | PICK ' + c.pick + ' | #' + (c.n + 1) + ' OF ' + N + '</div>' +
        '<div class="fd-clock-n">' + (youUp ? 'YOU ARE ON THE CLOCK' : esc(tName(c.team)) + ' ARE ON THE CLOCK') + '</div>' +
        '<div class="fd-clock-d">' + (youUp ? 'Pick a player from the board below.' : untilYou != null ? 'Your next pick comes in ' + untilYou + ' pick' + (untilYou === 1 ? '' : 's') + '.' : 'You have no picks left.') + '</div></div>' +
        '<div class="fd-actions"><button type="button" class="btn" id="fdSim"' + (youUp ? ' disabled' : '') + '>SIM TO MY PICK</button><button type="button" class="btn btn-gold" id="fdAuto">AUTO DRAFT FOR ME</button></div></section>';
    var mine = rosterOf(state, user);
    var counts = {};
    POS.forEach(function (p) { counts[p] = 0; });
    mine.forEach(function (p) { counts[primaryPos(p.pos)]++; });
    var q = view.q.trim().toLowerCase();
    var avail = f.pool.map(function (id) { return state.players[id]; })
      .filter(function (p) { return (!view.pos || primaryPos(p.pos) === view.pos) && (!q || p.name.toLowerCase().indexOf(q) >= 0); });
    var shown = avail.slice(0, 60);
    var recent = f.picks.slice(-12).reverse();
    app.innerHTML = UI.header('FANTASY DRAFT', esc(cur.name) + ' | You are the ' + esc(tName(user))) + clock +
      '<div class="fd-prog"><i style="width:' + (f.picks.length / N * 100).toFixed(1) + '%"></i></div>' +
      '<div class="fd-grid"><section>' +
      (done ? '' : UI.header('BEST AVAILABLE', f.pool.length + ' players left') +
        '<div class="fd-filters">' + [''].concat(POS).map(function (p) { return '<button type="button" class="btn fd-pos' + (view.pos === p ? ' on' : '') + '" data-pos="' + p + '">' + (p || 'ALL') + '</button>'; }).join('') +
        '<input id="fdQ" placeholder="Search players" value="' + esc(view.q) + '"></div>' +
        '<div class="tscroll"><table class="stats fd-pool"><thead><tr><th class="l">PLAYER</th><th>POS</th><th>AGE</th><th>OVR</th><th>SALARY</th><th></th></tr></thead><tbody>' +
        shown.map(function (p) {
          return '<tr><td class="l">' + UI.headshot(p) + '<a href="#/player/' + esc(p.id) + '">' + esc(p.name) + '</a>' + (p.injury && p.injury.games > 0 ? ' ' + UI.injuryBadge(p) : '') + '</td><td>' + esc(p.pos) + '</td><td>' + (p.age || '-') +
            '</td><td><b class="' + UI.ovrClass(p.ovr) + '">' + p.ovr + '</b></td><td>' + money(salaryOf(state, p)) + '</td>' +
            '<td>' + (youUp ? '<button type="button" class="btn btn-small btn-gold" data-draft="' + esc(p.id) + '">DRAFT</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' + (avail.length > shown.length ? '<p class="muted">Top ' + shown.length + ' of ' + avail.length + ' shown.</p>' : '')) +
      (done ? UI.header('YOUR ROSTER') + rosterTable(state, mine) : '') +
      '</section><aside class="fd-side">' +
      (done ? '' : '<section>' + UI.header('YOUR PICKS', mine.length + ' of ' + f.rounds) +
        '<div class="fd-counts">' + POS.map(function (p) { return '<span>' + p + ' ' + counts[p] + '</span>'; }).join('') + '</div>' +
        (mine.length ? '<ol class="pbp fd-mine">' + f.picks.filter(function (x) { return x.team === user; }).map(function (x) { var p = state.players[x.id]; return '<li><span class="fd-n">R' + x.round + ' #' + x.n + '</span>' + esc(p.name) + ' <small class="muted">' + esc(p.pos) + '</small><span class="fd-o">' + p.ovr + '</span></li>'; }).join('') + '</ol>' : '<p class="muted">No picks yet.</p>') + '</section>') +
      '<section>' + UI.header('LATEST PICKS') + (recent.length ? '<ol class="pbp fd-recent">' + recent.map(function (x) { var p = state.players[x.id]; return '<li><span class="fd-n">#' + x.n + '</span>' + UI.logo(x.team, 20) + esc(p.name) + ' <small class="muted">' + esc(p.pos) + ' ' + p.ovr + '</small></li>'; }).join('') + '</ol>' : '<p class="muted">The draft has not started.</p>') + '</section>' +
      '</aside></div>';

    var redraw = function () { remember(); drawBoard(app); };
    app.querySelectorAll('[data-pos]').forEach(function (b) { b.addEventListener('click', function () { view.pos = b.getAttribute('data-pos'); drawBoard(app); }); });
    var qi = UI.$('#fdQ');
    if (qi) qi.addEventListener('input', function () {
      view.q = qi.value;
      var pos = qi.selectionStart;
      drawBoard(app);
      var again = UI.$('#fdQ');
      if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }
    });
    app.querySelectorAll('[data-draft]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = pick(state, b.getAttribute('data-draft'));
        if (!r.ok) { UI.toast(r.reason, 'error'); return; }
        UI.toast('You drafted ' + state.players[r.id].name + '.');
        simToUser(state);
        redraw();
      });
    });
    var sim = UI.$('#fdSim');
    if (sim) sim.addEventListener('click', function () { simToUser(state); redraw(); });
    var auto = UI.$('#fdAuto');
    if (auto) auto.addEventListener('click', function () { autoDraft(state); redraw(); });
    var go = UI.$('#fdGo');
    if (go) go.addEventListener('click', function () {
      go.disabled = true; go.textContent = 'BUILDING THE SCHEDULE...';
      setTimeout(async function () {
        try {
          finish(state);
          var X = UI.extras;
          if (X) {
            X.setState(state, { name: cur.name, slot: cur.slot });
            X.log(state, 'draft', 'Fantasy draft complete: ' + f.picks.length + ' players drafted by 30 teams.', []);
            await X.persist();
          } else {
            UI.state.game = state; W.A13_STATE = state;
            if (UI.bump) UI.bump();
          }
          lsDel();
          API.current = null;
          if (UI.updateChrome) try { UI.updateChrome(); } catch (e) { /* ignore */ }
          UI.toast('Fantasy league ready. Good luck.');
          location.hash = '#/season';
        } catch (e) {
          console.warn('[fantasy] could not start the season', e);
          UI.toast('Could not start the season: ' + (e && e.message ? e.message : e), 'error');
          go.disabled = false; go.textContent = 'START THE SEASON';
        }
      }, 20);
    });
  }

  function rosterTable(state, list) {
    return '<div class="tscroll"><table class="stats"><thead><tr><th class="l">PLAYER</th><th>POS</th><th>AGE</th><th>OVR</th><th>SALARY</th></tr></thead><tbody>' +
      list.slice().sort(function (a, b) { return b.ovr - a.ovr; }).map(function (p) {
        return '<tr><td class="l"><a href="#/player/' + esc(p.id) + '">' + esc(p.name) + '</a></td><td>' + esc(p.pos) + '</td><td>' + (p.age || '-') + '</td><td><b>' + p.ovr + '</b></td><td>' + money(salaryOf(state, p)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
})(typeof window !== 'undefined' ? window : globalThis);
