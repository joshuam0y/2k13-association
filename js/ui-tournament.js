// Tournament (#/challenge/tournament): 4 or 8 friends on ONE device (hot seat). Everyone drafts five with
// the wheel (pass the phone between players), then a single-elimination bracket of best-of-1 or best-of-3
// series, simmed with CHALLENGE.playVersus (all five play 48 minutes). Every game can be watched on the
// court, with box scores, and the last one standing gets the champion screen. The tournament in progress
// is kept in localStorage ('a13-tournament'), so a reload picks up where it was.
// Logic lives in js/challenge.js; the wheel and the lineup card come from js/ui-challenge.js.
(function () {
  'use strict';
  const P = UI.pages, esc = UI.esc, C = window.CHALLENGE;
  if (!C || typeof P.challenge !== 'function') return;
  const KEY = 'a13-tournament';
  const ls = {
    get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del() { try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ } }
  };
  const ALL_YEARS = C.SEASONS.map(s => s.year);
  const FRESH = () => ({ v: 1, page: 'setup', n: 4, humans: 0, ai: [], cpu: false, names: [], skip: [], opts: { timer: 24, cap: 0, bestOf: 1, seeding: 'random', ratings: true },
    cfg: null, teams: [], picks: [], who: 0, hand: false, spin: null, spun: [], respins: [], seeds: [], rounds: [], cur: null, champ: -1 });
  let TN = Object.assign(FRESH(), ls.get() || {});
  TN.opts = Object.assign({ timer: 24, cap: 0, bestOf: 1, seeding: 'random', ratings: true }, TN.opts || {});
  const HOOK = { pages: {} };   // filled in by the online tournament (js/ui-tournament-online.js)
  const save = () => { if (HOOK.on) { if (HOOK.save) HOOK.save(TN); } else ls.set(TN); };
  const ctl = () => !HOOK.on || !!HOOK.host;   // online, only the host runs the bracket
  let APP = null;

  // ---------- small helpers ----------
  const decOf = y => (y - 1) - (y - 1) % 10;
  const lbl = y => (y ? (y - 1) + '-' + String(y).slice(2) : 'EVERY SEASON');
  const short = y => "'" + String(y - 1).slice(2) + "-'" + String(y).slice(2);
  const chosen = () => ALL_YEARS.filter(y => TN.skip.indexOf(y) < 0);
  const inPlay = (cfg, y) => !cfg.seasons || cfg.seasons.indexOf(+y) >= 0;
  const lblC = cfg => {
    if (cfg.year || !cfg.seasons) return lbl(cfg.year);
    const s = cfg.seasons.slice().sort((a, b) => a - b), run = s.every((y, i) => !i || y === s[i - 1] + 1);
    return run ? lbl(s[0]) + ' TO ' + lbl(s[s.length - 1]) : s.length + ' SEASONS';
  };
  const logo = (t, n) => UI.logoFor(t || { abbr: '?' }, n);
  const tOf = (teams, a) => teams.find(t => t.abbr === a) || { abbr: a, city: a, name: '', colors: ['#333', '#777'] };
  const tName = t => ((t.city || '') + ' ' + (t.name || '')).trim();
  const nm = i => (i >= 0 && TN.names[i]) || (i >= 0 ? 'PLAYER ' + (i + 1) : 'TBD');
  // AI slots: old saved tournaments have no ai flags, so everyone there is human
  const isAI = i => i >= 0 && !!(TN.ai && TN.ai[i]);
  const hum = () => (TN.humans > 0 ? Math.min(TN.humans, TN.n) : TN.n);
  const humDone = () => (TN.ai && TN.ai.length ? TN.ai.filter(a => !a).length : TN.n);
  const aiTag = i => (isAI(i) ? ' <i class="tn-ai">AI</i>' : '');
  const CPU_NAMES = ['CPU LeBron', 'CPU Jordan', 'CPU Kobe', 'CPU Curry', 'CPU Magic', 'CPU Bird', 'CPU Shaq', 'CPU Kareem', 'CPU Wilt', 'CPU Russell', 'CPU Duncan', 'CPU Dirk', 'CPU Durant', 'CPU Jokic', 'CPU Giannis', 'CPU Luka', 'CPU Wemby', 'CPU Hakeem', 'CPU Iverson', 'CPU Kawhi'];
  const grpOf = p => { const x = String(p.pos || 'SF').toUpperCase().split(/[-\/ ,]/)[0]; return x === 'PG' || x === 'SG' || x === 'G' ? 'G' : x === 'C' || x === 'PF' || x === 'F' ? 'B' : 'W'; };
  // best fit with a little randomness: rating, a nudge for a missing position group, a penalty for a crowded one, price weighed under a cap
  function aiChoose(cap, five, ros, rnd) {
    const cnt = { G: 0, W: 0, B: 0 }; five.forEach(q => { cnt[grpOf(q)]++; });
    let best = null, bs = -1e9;
    ros.forEach(p => {
      if (cap && !C.capFits(cap, five, p)) return;
      const g = grpOf(p);
      let sc = (+p.ovr || 0) + (rnd || Math.random)() * 4;
      if (cnt[g] >= 2) sc -= 6 * (cnt[g] - 1);
      if (five.length >= 2 && cnt[g] === 0) sc += 3;
      if ((p.age || 27) >= 35) sc -= 2;
      if (cap && C.capState) sc -= 0.1 * (C.capState(cap, five.concat([p])).spent - C.capState(cap, five).spent);
      if (sc > bs) { bs = sc; best = p; }
    });
    return best;
  }
  const f1 = v => (v == null ? '-' : (+v).toFixed(1));
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rounds = () => (TN.n === 8 ? 3 : 2);
  const roundName = r => { const left = rounds() - r; return left === 1 ? 'FINAL' : left === 2 ? 'SEMIFINALS' : 'QUARTERFINALS'; };
  const baseYear = cfg => (cfg && cfg.year) || 2013;
  const teamsOf = () => (C.seasonData(baseYear(TN.cfg)) || { teams: [] }).teams;
  const teamOf = i => tOf(teamsOf(), TN.teams[i]);

  // loads what a page needs (the season, or the all-time pool plus every season a pick came from), then fn()
  function ensure(app, cfg, fn) {
    const years = [];
    if (!cfg || !cfg.year) {
      years.push('pool', 2013);
      (TN.picks || []).forEach(l => l.forEach(k => { const y = +String(k).split('@')[1]; if (y && y !== 2013 && years.indexOf(y) < 0) years.push(y); }));
    } else years.push(cfg.year);
    const todo = years.filter(y => !C.loaded(y));
    if (!todo.length) { fn(); return; }
    app.innerHTML = `<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING THE ROSTERS...</div></section>`;
    Promise.all(todo.map(y => C.load(y))).then(fn).catch(e => { app.innerHTML = UI.empty('ROSTERS DID NOT LOAD', esc(e.message || e), '<div class="row-btns"><a class="btn" href="#/home">BACK</a></div>'); });
  }

  // the draft board: one season's league, or the all-time pool (keys id@season, nobody twice)
  function board(cfg) {
    const era = !cfg.year, d = C.seasonData(era ? 2013 : cfg.year), teams = d.teams, byId = {};
    const players = era ? C.allTimePool().filter(e => inPlay(cfg, e.season)).map(e => Object.assign({}, e, { id: e.key, team: e.from })) : d.players.slice();
    players.forEach(p => { byId[p.id] = p; });
    if (era) ALL_YEARS.forEach(y => {
      if (!inPlay(cfg, y) || y !== 2013 && !C.loaded(y)) return;
      const sd = C.seasonData(y);
      if (sd) sd.players.forEach(q => { const k = q.id + '@' + y; if (byId[k]) return; const e = Object.assign({}, q, { id: k, key: k, base: q.id, from: q.team, season: y }); byId[k] = e; players.push(e); });
    });
    if (!era) d.free.forEach(p => { byId[p.id] = p; });
    const base = p => (era ? p.base : p.id);
    return { era, teams, byId, players, base, cap: +cfg.cap || 0,
      takenSet: ids => new Set(ids.map(id => (byId[id] ? base(byId[id]) : id))),
      teamFor: (abbr, year) => (era && C.eraTeam(year, abbr)) || tOf(teams, abbr),
      groupKey: p => (era ? p.season : cfg.year) + ':' + p.team };
  }
  const flat = () => [].concat.apply([], TN.picks);
  const rosterOf = (B, key, taken) => { const tk = B.takenSet(taken); return B.players.filter(p => B.groupKey(p) === key && !tk.has(B.base(p))); };
  function spinFor(cfg, B, taken, avoid) {
    const tk = B.takenSet(taken), groups = {};
    const PT = window.CHALLENGE_POOL && window.CHALLENGE_POOL.teams;
    if (B.era && PT) (cfg.seasons || Object.keys(PT).map(Number)).forEach(y => (PT[y] || PT[y - 1] || []).forEach(t => { groups[y + ':' + t.abbr] = { abbr: t.abbr, year: +y, key: y + ':' + t.abbr }; }));
    else B.players.forEach(p => { if (tk.has(B.base(p))) return; const k = B.groupKey(p); if (!groups[k]) groups[k] = { abbr: p.team, year: B.era ? p.season : cfg.year, key: k }; });
    const keys = Object.keys(groups);
    let pool = keys.filter(k => TN.spun.indexOf(k) < 0 && k !== avoid);
    if (!pool.length) pool = keys.filter(k => k !== avoid);
    if (!pool.length) pool = keys;
    const g = groups[pool[Math.floor(Math.random() * pool.length)]];
    return g ? { abbr: g.abbr, year: g.year, key: g.key, who: TN.who, pick: TN.picks[TN.who].length, n: Date.now() + '-' + Math.floor(Math.random() * 1e6) } : null;
  }
  const ovrTag = p => `<b class="ch-ovr ${UI.ovrClass(p.ovr)}">${esc(p.ovr)}</b>`;
  function playerRow(p, B, btn) {
    const t = B.teamFor(p.team, p.season);
    return `<li class="ch-pl">${UI.faceImg(p, (t.colors || ['#444'])[0])}<span class="ch-pl-b"><b>${esc(p.name)}</b><small>${logo(t, 18)} ${esc(C.posLabel(p))}${B.era && p.season ? ' | ' + short(p.season) : p.age ? ' | ' + p.age : ''}</small></span>${B.cap ? UI.challengeCap.priceTag(p) : ''}${ovrTag(p)}${btn}</li>`;
  }

  // ---------- bracket logic (pure, no DOM) ----------
  // seeds: player indexes best to worst. 4 players: 1v4, 2v3. 8 players: 1v8, 4v5, 2v7, 3v6.
  function buildBracket(seeds, bestOf) {
    const n = seeds.length, order = n === 8 ? [[0, 7], [3, 4], [1, 6], [2, 5]] : [[0, 3], [1, 2]];
    const mk = (a, b) => ({ a, b, seed: Math.floor(Math.random() * 2147483646) + 1, shown: 0, done: false, winner: -1, wins: [0, 0], bestOf });
    const out = [order.map(([x, y]) => mk(seeds[x], seeds[y]))];
    for (let size = order.length / 2; size >= 1; size /= 2) out.push(Array.from({ length: size }, () => mk(-1, -1)));
    return out;
  }
  // puts a finished match's winner into the next round
  function advance(r, i, winner) {
    if (r + 1 >= TN.rounds.length) { TN.champ = winner; return; }
    const nx = TN.rounds[r + 1][i >> 1];
    if (i % 2 === 0) nx.a = winner; else nx.b = winner;
  }
  const ready = m => m.a >= 0 && m.b >= 0;
  function curRound() { for (let r = 0; r < TN.rounds.length; r++) if (TN.rounds[r].some(m => !m.done)) return r; return TN.rounds.length - 1; }
  const matchCfg = m => ({ mode: 'versus', year: TN.cfg.year, seasons: TN.cfg.seasons, bestOf: m.bestOf, blind: false, cap: TN.cfg.cap, timer: 0, injuries: false, seed: m.seed,
    sides: [m.a, m.b].map(i => ({ team: TN.teams[i], name: nm(i), picks: TN.picks[i] })) });
  const RUNS = {};   // match key -> the series with its play-by-play (deterministic from the seed)
  function run(m) {
    const k = [m.seed, m.a, m.b, m.bestOf].join(':');
    if (!RUNS[k]) RUNS[k] = C.playVersus(matchCfg(m), { pbp: true });
    return RUNS[k];
  }
  // a series that has been fully shown: record the winner and move him on
  function finish(r, i) {
    const m = TN.rounds[r][i];
    if (m.done) return;
    const res = run(m);
    m.shown = res.games.length; m.done = true;
    m.wins = [res.wins[TN.teams[m.a]], res.wins[TN.teams[m.b]]];
    m.winner = res.winner === TN.teams[m.a] ? m.a : m.b;
    advance(r, i, m.winner);
    if (TN.champ >= 0 && r === TN.rounds.length - 1) TN.champ = m.winner;
  }
  function simMatch(r, i) { const m = TN.rounds[r][i]; if (m.done || !ready(m)) return; m.shown = run(m).games.length; finish(r, i); }
  window.TOURNAMENT = { buildBracket, advance, seedOrder: n => (n === 8 ? [[0, 7], [3, 4], [1, 6], [2, 5]] : [[0, 3], [1, 2]]) };

  // ---------- routing ----------
  function render() {
    if (APP) APP.classList.toggle('tn-noR', TN.opts && TN.opts.ratings === false);
    if (!APP) return;
    const app = APP;
    stopTick(); dropCourt();
    window.scrollTo(0, 0);
    if (HOOK.on && HOOK.pages[TN.page]) { HOOK.pages[TN.page](app); return; }
    if (TN.page === 'draft' && TN.cfg) draft(app);
    else if (TN.page === 'bracket' && TN.rounds.length) bracketPage(app);
    else if (TN.page === 'match' && TN.cur) matchPage(app);
    else if (TN.page === 'champ' && TN.champ >= 0) champPage(app);
    else { TN.page = 'setup'; setup(app); }
  }
  function go(page) { TN.page = page; if (page !== 'match') TN.watch = null; save(); render(); }

  // ---------- setup ----------
  function setup(app) {
    const o = TN.opts, n = TN.n;
    const names = Array.from({ length: n }, (_, i) => TN.names[i] || '');
    const decs = [...new Set(ALL_YEARS.map(decOf))];
    const chips = (list, cur, attr) => list.map(([v, l]) => `<button type="button" class="ch-chip${cur === v ? ' on' : ''}" data-${attr}="${v}">${l}</button>`).join('');
    const ch = chosen();
    app.innerHTML = `
      <section class="ch-hero"><div class="ch-hero-k">DRAFT CHALLENGE | TOURNAMENT</div><h1 class="ch-hero-t">LAST FIVE STANDING.</h1>
        <p class="ch-hero-p">Four or eight teams, one phone. Humans draft five with the wheel, passing the phone along, and AI teams can fill any empty seats. Then a bracket: winner moves on, all five play 48 minutes, and every game can be watched on the court.</p></section>
      <div class="ch-setup tn-setup">
        <div class="ch-step"><div class="ch-step-k">1 | PLAYERS</div>
          <div class="ch-chips">${chips([[4, '4 TEAMS'], [8, '8 TEAMS']], n, 'n')}</div>
          <div class="ts-start-k tn-hk">HUMAN PLAYERS</div>
          <div class="ch-chips">${chips(Array.from({ length: n }, (_, i) => [i + 1, String(i + 1)]), hum(), 'hum')}</div>
          <small class="muted">${hum() < n ? (n - hum()) + ' AI team' + (n - hum() > 1 ? 's' : '') + ' fill the rest of the bracket and draft on their own.' : 'Everyone is human. Pick fewer to add AI teams.'}</small>
          <div class="tn-names">${names.slice(0, hum()).map((v, i) => `<label class="field"><span>PLAYER ${i + 1}</span><input data-name="${i}" maxlength="20" placeholder="Player ${i + 1}" value="${esc(v)}" autocomplete="off"></label>`).join('')}</div></div>
        <div class="ch-step"><div class="ch-step-k">2 | THE SEASON</div>
          <div class="row-btns vs-seas-all"><button type="button" class="btn btn-small${!TN.skip.length ? ' on' : ''}" data-seas="all">ALL</button><button type="button" class="btn btn-small" data-seas="none">CLEAR</button>
            ${decs.map(d => `<button type="button" class="btn btn-small${ALL_YEARS.filter(y => decOf(y) === d).every(y => TN.skip.indexOf(y) < 0) ? ' on' : ''}" data-dec="${d}">${d + 1}S</button>`).join('')}</div>
          <div class="vs-seas">${C.SEASONS.map(s => `<button type="button" class="ch-chip${TN.skip.indexOf(s.year) < 0 ? ' on' : ''}" data-yr="${s.year}">${esc(s.label)}</button>`).join('')}</div>
          <small class="muted">${!ch.length ? 'Pick at least one season.' : ch.length === 1 ? 'One season: the whole ' + esc(lbl(ch[0])) + ' league.' : 'Every spin lands on a team and a season from the ones on. Nobody can be drafted twice, even from different seasons.'}</small></div>
        <div class="ch-step"><div class="ch-step-k">3 | THE RULES</div>
          <div class="tn-rules">
            <div><span class="ts-start-k">EACH ROUND</span><div class="ch-chips">${chips([[1, 'BEST OF 1'], [3, 'BEST OF 3']], o.bestOf, 'bo')}</div></div>
            <div><span class="ts-start-k">SEEDING</span><div class="ch-chips">${chips([['random', 'RANDOM'], ['rating', 'BY TEAM RATING']], o.seeding, 'seed')}</div></div>
            <div><span class="ts-start-k">SHOT CLOCK</span><div class="ch-chips">${chips([[24, '24 SEC'], [0, 'OFF']], o.timer ? 24 : 0, 'timer')}</div></div>
            <div><span class="ts-start-k">RATINGS</span><div class="ch-chips">${[[true, 'ON'], [false, 'OFF']].map(([v, l]) => `<button type="button" class="ch-chip${(o.ratings !== false) === v ? ' on' : ''}" data-rate="${v}">${l}</button>`).join('')}</div></div>
            <div><span class="ts-start-k">SALARY CAP</span><div class="ch-chips">${UI.challengeCap.CAPS.map(v => `<button type="button" class="ch-chip${(o.cap || 0) === v ? ' on' : ''}" data-cap="${v}">${v ? '$' + v + 'M' : 'OFF'}</button>`).join('')}</div></div>
          </div></div>
        <div class="ch-go"><button type="button" class="btn btn-gold btn-big" id="tnStart">START THE DRAFT</button><a class="btn" href="#/challenge/tournament/online">PLAY ONLINE</a><a class="btn" href="#/home">HOME</a></div>
      </div>`;
    UI.centerChips(app);
    const readNames = () => { app.querySelectorAll('[data-name]').forEach(inp => { TN.names[+inp.dataset.name] = inp.value.trim().slice(0, 20); }); };
    const redraw = () => { readNames(); save(); setup(app); };
    app.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => { const was = hum() === TN.n; TN.n = +b.dataset.n; TN.humans = was ? TN.n : Math.min(hum(), TN.n); redraw(); }));
    app.querySelectorAll('[data-hum]').forEach(b => b.addEventListener('click', () => { TN.humans = +b.dataset.hum; redraw(); }));
    app.querySelectorAll('[data-name]').forEach(inp => inp.addEventListener('change', () => { readNames(); save(); }));
    app.querySelectorAll('[data-yr]').forEach(b => b.addEventListener('click', () => { const y = +b.dataset.yr, i = TN.skip.indexOf(y); if (!TN.skip.length) TN.skip = ALL_YEARS.filter(x => x !== y); else if (i >= 0) TN.skip.splice(i, 1); else TN.skip.push(y); redraw(); }));
    app.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => {
      const ys = ALL_YEARS.filter(y => decOf(y) === +b.dataset.dec), allOn = ys.every(y => TN.skip.indexOf(y) < 0);
      TN.skip = !TN.skip.length ? ALL_YEARS.filter(y => ys.indexOf(y) < 0) : allOn ? [...new Set(TN.skip.concat(ys))] : TN.skip.filter(y => ys.indexOf(y) < 0); redraw();
    }));
    app.querySelectorAll('[data-seas]').forEach(b => b.addEventListener('click', () => { TN.skip = b.dataset.seas === 'all' ? [] : ALL_YEARS.slice(); redraw(); }));
    app.querySelectorAll('[data-bo]').forEach(b => b.addEventListener('click', () => { o.bestOf = +b.dataset.bo; redraw(); }));
    app.querySelectorAll('[data-seed]').forEach(b => b.addEventListener('click', () => { o.seeding = b.dataset.seed; redraw(); }));
    app.querySelectorAll('[data-timer]').forEach(b => b.addEventListener('click', () => { o.timer = +b.dataset.timer; redraw(); }));
    app.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => { o.ratings = b.dataset.rate === 'true'; redraw(); }));
    app.querySelectorAll('[data-cap]').forEach(b => b.addEventListener('click', () => { o.cap = +b.dataset.cap; redraw(); }));
    UI.$('#tnStart', app).addEventListener('click', () => {
      readNames();
      const c = chosen();
      if (!c.length) { UI.toast('Switch on at least one season', 'error'); return; }
      const year = c.length === 1 ? c[0] : 0;
      const cfg = { mode: 'versus', year, seasons: c.length > 1 && c.length < ALL_YEARS.length ? c : null, bestOf: o.bestOf, blind: false, cap: +o.cap || 0, timer: o.timer ? 24 : 0, injuries: false, seed: Math.floor(Math.random() * 2147483646) + 1 };
      ensure(app, cfg, () => {
        const d = C.seasonData(year || 2013);
        TN.cfg = cfg;
        const hn = hum(), bots = shuffle(CPU_NAMES.slice());
        TN.names = Array.from({ length: TN.n }, (_, i) => (i < hn ? (TN.names[i] || ('PLAYER ' + (i + 1))) : bots[i - hn]));
        TN.ai = TN.names.map((_, i) => i >= hn); TN.cpu = false;
        TN.teams = shuffle(d.teams.map(t => t.abbr)).slice(0, TN.n);
        TN.picks = TN.names.map(() => []);
        TN.respins = TN.names.map(() => 1);
        TN.who = 0; TN.hand = true; TN.spin = null; TN.spun = []; TN.rounds = []; TN.seeds = []; TN.cur = null; TN.champ = -1;
        go('draft');
      });
    });
  }

  // ---------- the draft: pass the phone, one player at a time ----------
  const ANIM = {};   // spins already animated on this page load
  let TICK = null, CLOCK = null;
  function stopTick() { if (TICK) { clearInterval(TICK); TICK = null; } }
  function draft(app) {
    const cfg = TN.cfg;
    ensure(app, cfg, () => {
      const B = board(cfg), teams = B.teams, byId = B.byId, w = TN.who, mineIds = TN.picks[w], k = mineIds.length;
      const t = teamOf(w), five = mineIds.map(id => byId[id]).filter(Boolean);
      const meta = `${esc(lblC(cfg))} | ${TN.n} TEAMS | BEST OF ${TN.opts.bestOf}${cfg.timer ? ' | ' + cfg.timer + ' SEC CLOCK' : ''}${cfg.cap ? ' | $' + cfg.cap + 'M CAP' : ''}`;
      if (TN.cpu) { cpuPage(app, B); return; }
      if (TN.hand) {
        const done = TN.picks.map((l, i) => i < w ? `<li><b>${esc(nm(i))}</b><small class="muted">locked in</small></li>` : '').join('');
        app.innerHTML = `<section class="tn-pass" style="--c1:${esc(t.colors[0])}">
            <div class="ch-hero-k">${meta}</div>${logo(t, 84)}
            <div class="tn-pass-k">PASS THE PHONE TO</div><h1 class="tn-pass-n">${esc(nm(w)).toUpperCase()}</h1>
            <p class="muted">${esc(tName(t))}. Player ${w + 1} of ${humDone()}. Five spins, one re-spin. Everyone else look away.</p>
            <button type="button" class="btn btn-gold btn-big" id="tnReady">I AM ${esc(nm(w)).toUpperCase()}, LET'S GO</button>
            ${done ? `<ul class="tn-locked">${done}</ul>` : ''}
            <button type="button" class="btn btn-small" id="tnQuit">QUIT TOURNAMENT</button></section>`;
        UI.$('#tnReady', app).addEventListener('click', () => { TN.hand = false; save(); draft(app); });
        UI.$('#tnQuit', app).addEventListener('click', quit);
        return;
      }
      const spin = TN.spin && TN.spin.who === w && TN.spin.pick === k ? TN.spin : null;
      const mine = ids => ids.map(id => byId[id]).filter(Boolean);
      let body = '';
      if (!spin || !ANIM[spin.n]) {
        body = `<section class="ch-wheel">${UI.challengeWheel.strip(teams)}<div class="ch-wheel-k">${spin ? 'SPINNING...' : 'YOUR SPIN'}</div>
          ${spin ? '' : '<button type="button" class="btn btn-gold btn-big" id="chSpin">SPIN THE WHEEL</button>'}</section>`;
      } else if (B.era && spin.year !== 2013 && !C.loaded(spin.year)) {
        body = `<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING THE ${esc(lbl(spin.year))} ROSTER...</div></section>`;
        C.load(spin.year).then(() => { if (TN.spin && TN.spin.n === spin.n) draft(app); }).catch(() => UI.toast('That roster did not load. Try a re-spin.', 'error'));
      } else {
        const st = B.teamFor(spin.abbr, spin.year), ros = UI.challengeAlpha(rosterOf(B, spin.key, flat()));
        const none = cfg.cap && !ros.some(p => C.capFits(cfg.cap, five, p));
        body = `<section class="ch-landed" style="--c1:${esc(st.colors[0])}">${logo(st, 64)}<div><div class="ch-wheel-k">THE WHEEL SAYS</div><div class="ch-landed-t">${B.era ? esc(lbl(spin.year)) + ' ' : ''}${esc(tName(st))}</div></div>
            ${TN.respins[w] > 0 ? '<button type="button" class="btn btn-small" id="chRespin">RE-SPIN (1 LEFT)</button>' : ''}</section>
          ${cfg.cap ? UI.challengeCap.bar(cfg.cap, five) : ''}
          ${none ? '<div class="ch-ready"><div><b>NOBODY HERE FITS UNDER YOUR CAP.</b><span class="muted"> Spin again, on the house.</span></div><button type="button" class="btn btn-gold" id="tnFree">SPIN AGAIN</button></div>' : ''}
          <ul class="ch-list">${ros.map(p => playerRow(p, B, UI.challengeCap.btn(cfg.cap, five, p, `<button type="button" class="btn btn-small btn-gold" data-add="${esc(p.id)}">TAKE</button>`))).join('')}</ul>`;
      }
      const fit = five.length ? UI.challengeFit(C.lineupFit(five), { compact: true, title: (nm(w) + "'s lineup").toUpperCase() }) : '';
      app.innerHTML = `<div class="ch-top"><div><div class="ch-top-k">${meta}</div><div class="ch-top-t">THE DRAFT</div></div><button type="button" class="btn btn-small" id="tnQuit">QUIT</button></div>
        <div class="tn-dots">${TN.names.slice(0, humDone()).map((_, i) => `<i class="${i < w ? 'done' : i === w ? 'on' : ''}" title="${esc(nm(i))}"></i>`).join('')}</div>
        <div class="vs-side tn-me" style="--c1:${esc(t.colors[0])}"><div class="vs-side-h">${logo(t, 36)}<div><small>${esc(nm(w))} | PLAYER ${w + 1} OF ${humDone()}</small><b>${esc(tName(t))}</b>${cfg.cap ? ' <small class="vs-pay">' + UI.challengeCap.money(C.capState(cfg.cap, five).spent) + ' of $' + cfg.cap + 'M</small>' : ''}</div></div>
          <ol>${[0, 1, 2, 3, 4].map(i => `<li>${five[i] ? esc(five[i].name) + ' <small class="muted">' + esc(C.posLabel(five[i])) + (B.era && five[i].season ? ' ' + short(five[i].season) : '') + '</small> <b class="' + UI.ovrClass(five[i].ovr) + '">' + esc(five[i].ovr) + '</b>' : '<span class="muted">-</span>'}</li>`).join('')}</ol></div>
        <div class="vs-clock">PICK <b>${k + 1}</b> OF 5</div>
        ${cfg.timer ? `<div class="vs-timer" id="vsTimer"><i style="--w:100%"></i><span>${cfg.timer}</span></div>` : ''}
        ${body}${fit}`;
      UI.$('#tnQuit', app).addEventListener('click', quit);
      const doSpin = avoid => {
        const s = spinFor(cfg, B, flat(), avoid);
        if (!s) return null;
        TN.spin = s; TN.spun = TN.spun.concat([s.key]); save(); draft(app); return s;
      };
      if (spin && !ANIM[spin.n]) UI.challengeWheel.animate(app, teams, () => { ANIM[spin.n] = true; if (TN.spin && TN.spin.n === spin.n) draft(app); }, { year: spin.year, abbr: spin.abbr }, { mode: B.era ? 'alltime' : 'versus', seasons: cfg.seasons });
      const sp = UI.$('#chSpin', app); if (sp) sp.addEventListener('click', () => doSpin(null));
      const fr = UI.$('#tnFree', app); if (fr) fr.addEventListener('click', () => doSpin(spin && spin.key));
      const re = UI.$('#chRespin', app);
      if (re) re.addEventListener('click', () => { if (TN.respins[w] > 0) { TN.respins[w]--; doSpin(spin && spin.key); } });
      const take = id => {
        TN.picks[w].push(id); TN.spin = null;
        if (window.SFX) window.SFX.play('chime');
        if (TN.picks[w].length >= 5) {
          if (w + 1 < humDone()) { TN.who = w + 1; TN.hand = true; UI.toast(nm(w) + ' is locked in. Pass the phone.'); save(); draft(app); }
          else if (humDone() < TN.n) { runAI(B); TN.cpu = true; TN.spin = null; save(); draft(app); }
          else startBracket(B);
          return;
        }
        save(); draft(app); window.scrollTo(0, 0);
      };
      app.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
        const p = byId[b.dataset.add];
        if (cfg.cap && p && !C.capFits(cfg.cap, five, p)) { UI.toast('That contract does not fit under the cap.', 'error'); return; }
        take(b.dataset.add);
      }));
      // the shot clock: runs out, the wheel spins itself, then the best player that fits is taken
      stopTick();
      if (cfg.timer) {
        const phase = spin && ANIM[spin.n] ? 'pick' : 'spin', ck = w + ':' + k + ':' + phase;
        if (!CLOCK || CLOCK.key !== ck) CLOCK = { key: ck, until: Date.now() + cfg.timer * 1000 };
        const clk = CLOCK, total = cfg.timer * 1000;
        const tick = () => {
          const el = UI.$('#vsTimer', app);
          if (!el || CLOCK !== clk) { stopTick(); return; }
          const left = clk.until - Date.now();
          el.querySelector('span').textContent = Math.max(0, Math.ceil(left / 1000));
          el.querySelector('i').style.setProperty('--w', Math.max(0, Math.min(100, 100 * left / total)) + '%');
          el.classList.toggle('low', left < 10000);
          if (left > 0) return;
          stopTick();
          if (phase === 'spin') { if (!TN.spin || TN.spin.pick !== k) doSpin(null); return; }
          const pool = rosterOf(B, spin.key, flat()).filter(p => C.capFits(cfg.cap, five, p));
          if (!pool[0]) { doSpin(spin.key); return; }
          const rp = pool[Math.floor(Math.random() * pool.length)];
          UI.toast('Time: ' + nm(w) + ' gets ' + rp.name + '.');
          take(rp.id);
        };
        TICK = setInterval(tick, 250); tick();
      }
    });
  }
  // the AI teams draft with the same wheel, pool, cap and season rules, no pass-the-phone screen
  function runAI(B) {
    const cfg = TN.cfg, keepWho = TN.who;
    for (let i = humDone(); i < TN.n; i++) {
      TN.who = i;
      let tries = 0;
      while (TN.picks[i].length < 5 && tries++ < 80) {
        const five = TN.picks[i].map(id => B.byId[id]).filter(Boolean);
        const s = spinFor(cfg, B, flat(), null);
        if (s) TN.spun.push(s.key);
        let pick = s && aiChoose(cfg.cap, five, rosterOf(B, s.key, flat()));
        if (!pick && tries > 40) pick = aiChoose(cfg.cap, five, B.players.filter(p => !B.takenSet(flat()).has(B.base(p))).slice(0, 400));
        if (pick) TN.picks[i].push(pick.id);
      }
    }
    TN.who = keepWho;
  }
  function cpuPage(app, B) {
    const cards = [];
    for (let i = humDone(); i < TN.n; i++) {
      const t = teamOf(i), five = TN.picks[i].map(id => B.byId[id]).filter(Boolean);
      cards.push(`<li class="tn-cpu-c" style="--c1:${esc((t.colors || ['#333'])[0])};--d:${cards.length * 0.35}s"><div class="tn-cpu-h">${logo(t, 30)}<b>${esc(nm(i))}${aiTag(i)}</b><small>${esc(t.name)}</small></div>
        <ol>${five.map(q => `<li>${esc(q.name)} <small class="muted">${esc(C.posLabel(q))}${B.era && q.season ? ' ' + short(q.season) : ''}</small> ${ovrTag(q)}</li>`).join('')}</ol></li>`);
    }
    app.innerHTML = `<section class="tn-cpu"><div class="ch-hero-k">${esc(lblC(TN.cfg))} | ${TN.n} TEAMS</div><h1 class="tn-cpu-t">CPU DRAFTING<span class="tn-dotsa"><i>.</i><i>.</i><i>.</i></span></h1>
      <p class="muted">The AI teams spun the wheel and picked their fives${TN.cfg.cap ? ' under the $' + TN.cfg.cap + 'M cap' : ''}.</p>
      <ul class="tn-cpu-l">${cards.join('')}</ul>
      <button type="button" class="btn btn-gold btn-big" id="tnCpuGo">TO THE BRACKET</button></section>`;
    UI.$('#tnCpuGo', app).addEventListener('click', () => { TN.cpu = false; startBracket(B); });
  }
  function quit() {
    if (HOOK.on) { HOOK.quit(); return; }
    if (!window.confirm('Quit this tournament? Everything drafted so far is lost.')) return;
    ls.del(); TN = FRESH(); RUNS_CLEAR(); render();
  }
  function RUNS_CLEAR() { Object.keys(RUNS).forEach(k => { delete RUNS[k]; }); CLOCK = null; }

  // all five picked: rate each team, seed, build the bracket
  function startBracket(B) {
    const rating = TN.picks.map(l => { const v = l.map(id => (B.byId[id] ? B.byId[id].ovr : 0)); return v.reduce((s, x) => s + x, 0) / (v.length || 1); });
    TN.rating = rating.map(x => Math.round(x * 10) / 10);
    const idx = TN.picks.map((_, i) => i);
    TN.seeds = TN.opts.seeding === 'rating' ? idx.sort((a, b) => rating[b] - rating[a]) : shuffle(idx);
    TN.rounds = buildBracket(TN.seeds, TN.opts.bestOf);
    TN.champ = -1; TN.cur = null; TN.spin = null;
    go('bracket');
  }

  // ---------- the bracket ----------
  function slot(m, side, r) {
    const i = side ? m.b : m.a;
    if (i < 0) return `<div class="tn-slot tbd"><span class="tn-seed">-</span><span class="tn-nm">TBD</span><b class="tn-w"></b></div>`;
    const t = teamOf(i), win = m.done && m.winner === i, lose = m.done && m.winner !== i;
    return `<div class="tn-slot${win ? ' won' : ''}${lose ? ' lost' : ''}" style="--c1:${esc((t.colors || ['#333'])[0])}"><span class="tn-seed">${TN.seeds.indexOf(i) + 1}</span>${logo(t, 24)}<span class="tn-nm"><b>${esc(nm(i))}${aiTag(i)}</b><small>${esc(t.name)}</small></span><b class="tn-w">${m.done ? m.wins[side] : ''}</b></div>`;
  }
  function bracketPage(app) {
    ensure(app, TN.cfg, () => {
      const B = board(TN.cfg), cr = curRound();
      const cols = TN.rounds.map((round, r) => `<div class="tn-col"><div class="tn-col-k">${roundName(r)}<small>BEST OF ${round[0].bestOf}</small></div>
        <div class="tn-col-b">${round.map((m, i) => `<div class="tn-match${m.done ? ' done' : ''}${ready(m) && !m.done ? ' live' : ''}">${slot(m, 0, r)}${slot(m, 1, r)}
          <div class="tn-match-a">${ready(m) && !m.done && !ctl() ? '<span class="muted">UP NEXT</span>' : ready(m) && !m.done ? `<button type="button" class="btn btn-small btn-gold" data-watch="${r}:${i}">WATCH</button><button type="button" class="btn btn-small" data-sim="${r}:${i}">SIM</button>`
            : m.done ? `<button type="button" class="btn btn-small" data-open="${r}:${i}">BOX SCORES</button>` : '<span class="muted">WAITING</span>'}</div></div>`).join('')}</div></div>`).join('');
      const rosters = TN.seeds.map((p, s) => {
        const t = teamOf(p), five = TN.picks[p].map(id => B.byId[id]).filter(Boolean);
        return `<details class="tn-roster" style="--c1:${esc((t.colors || ['#333'])[0])}"><summary>${logo(t, 24)}<b>#${s + 1} ${esc(nm(p))}${aiTag(p)}</b><small>${esc(t.name)} | ${f1(TN.rating && TN.rating[p])} AVG</small></summary>
          <ul>${five.map(q => `<li>${esc(q.name)} <small class="muted">${esc(C.posLabel(q))}${B.era && q.season ? ' ' + short(q.season) : ''}</small> <b class="tn-ovr ${UI.ovrClass(q.ovr)}">${esc(q.ovr)}</b></li>`).join('')}</ul></details>`;
      }).join('');
      const over = TN.champ >= 0;
      app.innerHTML = `<div class="ch-top"><div><div class="ch-top-k">${esc(lblC(TN.cfg))} | ${TN.n} TEAMS | BEST OF ${TN.opts.bestOf}${TN.cfg.cap ? ' | $' + TN.cfg.cap + 'M CAP' : ''}</div><div class="ch-top-t">THE BRACKET</div></div>
          <button type="button" class="btn btn-small" id="tnQuit">NEW</button></div>
        <div class="row-btns center ch-acts tn-acts">${over ? '<button type="button" class="btn btn-gold btn-big" id="tnCrown">THE CHAMPION</button>'
          : !ctl() ? '<p class="muted">The host runs the bracket. Everyone watches the same games.</p>'
          : `<button type="button" class="btn btn-gold" id="tnRound">SIM ${esc(roundName(cr))}</button><button type="button" class="btn" id="tnAll">SIM THE WHOLE THING</button>`}</div>
        <div class="tn-bracket" style="--rounds:${TN.rounds.length}">${cols}</div>
        <section class="tn-rosters">${UI.header('THE FIVES', 'Tap to open')}${rosters}</section>`;
      UI.$('#tnQuit', app).addEventListener('click', quit);
      const crown = UI.$('#tnCrown', app); if (crown) crown.addEventListener('click', () => go('champ'));
      const simRound = () => { TN.rounds[curRound()].forEach((m, i) => simMatch(curRound(), i)); };
      const after = () => { save(); if (TN.champ >= 0) { if (window.SFX) window.SFX.play('crowd'); go('champ'); } else bracketPage(app); };
      const rd = UI.$('#tnRound', app); if (rd) rd.addEventListener('click', () => { const r = curRound(); TN.rounds[r].forEach((m, i) => simMatch(r, i)); after(); });
      const al = UI.$('#tnAll', app); if (al) al.addEventListener('click', () => { let g = 0; while (TN.champ < 0 && g++ < 10) simRound(); after(); });
      const pr = s => s.split(':').map(Number);
      app.querySelectorAll('[data-sim]').forEach(b => b.addEventListener('click', () => { const [r, i] = pr(b.dataset.sim); simMatch(r, i); after(); }));
      app.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { const [r, i] = pr(b.dataset.open); TN.cur = { r, i }; WATCH = 0; go('match'); }));
      app.querySelectorAll('[data-watch]').forEach(b => b.addEventListener('click', () => {
        const [r, i] = pr(b.dataset.watch); TN.cur = { r, i }; WATCH = (TN.rounds[r][i].shown || 0) + 1; AUTO = true; TN.watch = { r, i, n: WATCH }; go('match');
      }));
    });
  }

  // ---------- one series: watch each game on the court, or sim it, with box scores ----------
  let AUTO = false;   // a WATCH pressed on the bracket: start the court as soon as the page is up
  let WATCH = 0;   // the game being watched (1-based), 0 = none
  let courtCtl = null;
  function dropCourt() { if (courtCtl) { try { courtCtl.destroy(); } catch (e) { /* gone */ } courtCtl = null; } }
  function gameBox(S, side, pts) {
    const i = S.findIndex(s => s.abbr === side.abbr), rows = side.box || [], sum = k => rows.reduce((s, x) => s + (+x[k] || 0), 0), ms = (a, b) => a + '-' + b;
    const tr = x => `<td>${x.pts}</td><td>${(x.oreb || 0) + (x.dreb || 0)}</td><td>${x.ast}</td><td>${x.stl}</td><td>${x.blk}</td><td>${x.tov}</td><td>${ms(x.fgm, x.fga)}</td><td>${ms(x.tpm, x.tpa)}</td><td>${ms(x.ftm, x.fta)}</td>`;
    return `<div class="vs-res" style="--c1:${esc(((S[i] || S[0]).team.colors || ['#333'])[0])}"><div class="vs-side-h">${logo(S[i].team, 26)}<div><small>${esc(pts.who)}</small><b>${esc(pts.name)} ${side.pts}</b></div></div>
      <div class="vs-tbl-w"><table class="vs-tbl"><thead><tr><th class="l">PLAYER</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FG</th><th>3P</th><th>FT</th><th>+/-</th></tr></thead>
      <tbody>${rows.map(x => `<tr><td class="l">${esc(x.name)}</td>${tr(x)}<td>${x.pm > 0 ? '+' : ''}${x.pm || 0}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td class="l">TOTALS</td>${tr({ pts: sum('pts'), oreb: sum('oreb'), dreb: sum('dreb'), ast: sum('ast'), stl: sum('stl'), blk: sum('blk'), tov: sum('tov'), fgm: sum('fgm'), fga: sum('fga'), tpm: sum('tpm'), tpa: sum('tpa'), ftm: sum('ftm'), fta: sum('fta') })}<td></td></tr></tfoot></table></div></div>`;
  }
  function matchPage(app) {
    const { r: ri, i: mi } = TN.cur, m = TN.rounds[ri] && TN.rounds[ri][mi];
    if (!m || !ready(m)) { go('bracket'); return; }
    ensure(app, TN.cfg, () => {
      let res;
      try { res = run(m); } catch (e) { app.innerHTML = UI.empty('COULD NOT PLAY IT', esc(e.message || e), '<div class="row-btns"><button type="button" class="btn" id="tnBk">BACK</button></div>'); UI.$('#tnBk', app).addEventListener('click', () => go('bracket')); return; }
      const shown = Math.min(res.games.length, m.shown || 0), done = shown >= res.games.length;
      if (WATCH && (WATCH <= shown || done)) WATCH = 0;
      const S = res.sides, A = TN.teams[m.a], Bt = TN.teams[m.b];
      const pOf = abbr => (abbr === A ? m.a : m.b);
      const w = shown ? res.games[shown - 1].wins : { [A]: 0, [Bt]: 0 };
      const PL = {}; S.forEach(sd => sd.five.forEach(p => { PL[p.id] = Object.assign({ team: sd.abbr }, p); }));
      const tm = abbr => S.find(s => s.abbr === abbr).team;
      const score = `<div class="vs-score">${[m.a, m.b].map((p, k) => `<div class="vs-score-t${done && m.winner === p ? ' won' : ''}" style="--c1:${esc((teamOf(p).colors || ['#333'])[0])}">${logo(teamOf(p), 40)}<span><small>#${TN.seeds.indexOf(p) + 1} SEED</small><b>${esc(nm(p))}${aiTag(p)}</b></span><strong>${w[TN.teams[p]]}</strong></div>`).join('<i>-</i>')}</div>`;
      const final = ri === TN.rounds.length - 1;
      const head = done
        ? `<section class="vs-win" style="--c1:${esc((teamOf(m.winner).colors || ['#333'])[0])}">${logo(teamOf(m.winner), 64)}<div><div class="ch-hero-k">${roundName(ri)} | BEST OF ${res.bestOf}</div>
            <h1>${esc(nm(m.winner)).toUpperCase()} ${final ? 'IS THE CHAMPION' : 'ADVANCES'}</h1>
            ${res.mvp ? `<p>Series MVP: <b>${esc(res.mvp.name)}</b> (${esc(f1(res.mvp.line.pts) + ' PTS, ' + f1(res.mvp.line.reb) + ' REB, ' + f1(res.mvp.line.ast) + ' AST')})</p>` : ''}</div></section>`
        : `<section class="vs-next"><div class="ch-hero-k">${roundName(ri)} | BEST OF ${res.bestOf}</div><h1>${WATCH ? 'GAME ' + WATCH + ', LIVE' : res.bestOf === 1 ? 'ONE GAME, WINNER MOVES ON' : shown ? 'GAME ' + (shown + 1) + ' IS NEXT' : 'THE SERIES'}</h1>
            <p class="muted">${esc(nm(pOf(res.home)))} has home court. First to ${res.need}. All ten players go the full 48.</p></section>`;
      const games = res.games.slice(0, shown).map(g => {
        const t = g.top && PL[g.top.id];
        return `<li><span class="vs-g-n">GAME ${g.n}</span><span class="vs-g-s"><b class="${g.winner === g.away ? 'w' : ''}">${esc(nm(pOf(g.away)))} ${g.as}</b> @ <b class="${g.winner === g.home ? 'w' : ''}">${esc(nm(pOf(g.home)))} ${g.hs}</b>${g.ot ? ' <small>(' + (g.ot > 1 ? g.ot : '') + 'OT)</small>' : ''}</span>${t ? `<small class="muted">${esc(t.name)}: ${g.top.pts} pts, ${g.top.reb} reb, ${g.top.ast} ast</small>` : ''}
          <button type="button" class="btn btn-small vs-rewatch" data-rewatch="${g.n}">WATCH</button>
          ${g.res ? `<details class="vs-gbox"><summary>BOX SCORE</summary>${['away', 'home'].map(k => gameBox(S, g.res[k], { who: 'PLAYER ' + (pOf(g.res[k].abbr) + 1), name: nm(pOf(g.res[k].abbr)) })).join('')}</details>` : ''}</li>`;
      }).join('');
      const next = shown + 1;
      const acts = !ctl() && !done ? '<p class="muted">The host runs the games. Everyone watches together.</p>'
        : done
        ? `<button type="button" class="btn btn-gold btn-big" id="tnBack">${final ? 'THE CHAMPION' : 'BACK TO THE BRACKET'}</button>`
        : WATCH ? '<button type="button" class="btn btn-gold" id="tnFinal">SKIP TO THE END OF THIS GAME</button>'
        : `<button type="button" class="btn btn-gold btn-big" id="tnWatch">WATCH GAME ${next}</button><button type="button" class="btn" id="tnNext">SIM GAME ${next}</button>${res.bestOf > 1 ? '<button type="button" class="btn" id="tnRest">SIM THE REST</button>' : ''}<button type="button" class="btn" id="tnBack">BRACKET</button>`;
      const lines = done ? `<section class="vs-box">${UI.header('SERIES BOX', 'Per game')}<div class="vs-sides">${S.map(sd => { const p = pOf(sd.abbr); return `<div class="vs-res" style="--c1:${esc((sd.team.colors || ['#333'])[0])}"><div class="vs-side-h">${logo(sd.team, 32)}<div><small>${esc(nm(p))}</small><b>${esc(sd.team.name)}</b></div></div>
          <div class="vs-tbl-w"><table class="vs-tbl"><thead><tr><th class="l">PLAYER</th><th>SPOT</th><th class="tn-ovr">OVR</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>3PM</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead><tbody>${sd.five.slice().sort((a, b) => C.SLOTS.indexOf(a.slot) - C.SLOTS.indexOf(b.slot)).map(q => { const l = res.lines[q.id] || {}; return `<tr><td class="l">${esc(q.name)}${q.season && !TN.cfg.year ? ' <small class="muted">' + esc(short(q.season)) + '</small>' : ''}</td><td>${esc(q.slot || '')}</td><td class="tn-ovr">${esc(q.ovr)}</td><td>${f1(l.pts)}</td><td>${f1(l.reb)}</td><td>${f1(l.ast)}</td><td>${f1(l.stl)}</td><td>${f1(l.blk)}</td><td>${f1(l.tov)}</td><td>${f1(l.tpm)}</td><td>${f1(l.fgp)}</td><td>${f1(l.tpp)}</td><td>${f1(l.ftp)}</td></tr>`; }).join('')}</tbody></table></div></div>`; }).join('')}</div></section>` : '';
      app.innerHTML = `${head}${score}${WATCH ? '<div class="ct-host" id="vsCourt"></div>' : ''}
        <div class="row-btns center ch-acts vs-acts">${acts}</div>
        ${games ? `<ol class="vs-glist">${games}</ol>` : ''}${lines}`;
      const $ = id => UI.$(id, app);
      const mountCourt = (el, g, onEnd) => {
        if (!el || !g || !g.res || !(window.COURT && window.COURT.available(g.res))) { if (el) el.innerHTML = '<p class="muted">The court view did not load.</p>'; return null; }
        return window.COURT.mount(el, { game: g.res, start: 0, autoplay: true, team: a => tm(a), player: id => PL[id] || null, logo: (a, size) => logo(tm(a), size), onEnd, onControl: (k, v) => { if (HOOK.on && HOOK.court) HOOK.court(WATCH, k, v); } });
      };
      // reveals up to game n; the last one closes the series and moves the winner on
      const reveal = n => {
        WATCH = 0; dropCourt(); TN.watch = null;
        m.shown = Math.max(m.shown || 0, n);
        if (m.shown >= res.games.length) { if (window.SFX) window.SFX.play('crowd'); finish(ri, mi); }
        save(); matchPage(app); window.scrollTo(0, 0);
      };
      const watch = n => {
        WATCH = n; if (ctl()) { TN.watch = { r: ri, i: mi, n }; save(); }
        matchPage(app);
        const el = UI.$('#vsCourt', app);
        courtCtl = mountCourt(el, res.games[n - 1], () => { if (WATCH === n && n > (m.shown || 0) && ctl()) reveal(n); });
        if (courtCtl && UI.extras && typeof UI.extras.onLeave === 'function') UI.extras.onLeave(dropCourt);
        if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      };
      if ($('#tnWatch')) $('#tnWatch').addEventListener('click', () => watch(next));
      if ($('#tnNext')) $('#tnNext').addEventListener('click', () => reveal(next));
      if ($('#tnRest')) $('#tnRest').addEventListener('click', () => reveal(res.games.length));
      if ($('#tnFinal')) $('#tnFinal').addEventListener('click', () => reveal(WATCH));
      if ($('#tnBack')) $('#tnBack').addEventListener('click', () => { WATCH = 0; go(done && final && TN.champ >= 0 ? 'champ' : 'bracket'); });
      app.querySelectorAll('[data-rewatch]').forEach(b => b.addEventListener('click', () => {
        const g = res.games[+b.dataset.rewatch - 1], el = document.createElement('div');
        dropCourt(); el.className = 'ct-host'; b.closest('li').after(el);
        courtCtl = mountCourt(el, g, null);
      }));
      // a WATCH from the bracket: start the court right away
      if (AUTO) { AUTO = false; if (WATCH && WATCH === shown + 1) watch(WATCH); }
    });
  }

  // ---------- the champion ----------
  function champPage(app) {
    ensure(app, TN.cfg, () => {
      const B = board(TN.cfg), c = TN.champ, t = teamOf(c), five = TN.picks[c].map(id => B.byId[id]).filter(Boolean);
      const path = TN.rounds.map((round, r) => { const m = round.find(x => x.done && (x.a === c || x.b === c)); if (!m) return ''; const o = m.a === c ? m.b : m.a, k = m.a === c ? 0 : 1; return `<li><span>${roundName(r)}</span><b>beat ${esc(nm(o))}</b><strong>${m.wins[k]}-${m.wins[1 - k]}</strong></li>`; }).join('');
      const final = TN.rounds[TN.rounds.length - 1][0], runnerUp = final.a === c ? final.b : final.a;
      app.innerHTML = `<section class="tn-champ" style="--c1:${esc((t.colors || ['#d4af37'])[0])}">
          <div class="ch-hero-k">${esc(lblC(TN.cfg))} | ${TN.n} PLAYER TOURNAMENT</div>${logo(t, 110)}
          <div class="tn-champ-k">CHAMPION</div><h1 class="tn-champ-n">${esc(nm(c)).toUpperCase()}${aiTag(c)}</h1>
          <p class="muted">${esc(tName(t))}. Runner-up: ${esc(nm(runnerUp))}.</p>
          <ol class="tn-champ-five">${five.map(q => `<li><b>${esc(q.name)}</b><small>${esc(C.posLabel(q))}${B.era && q.season ? ' | ' + short(q.season) : ''}</small>${ovrTag(q)}</li>`).join('')}</ol>
          <ul class="tn-path">${path}</ul>
          <div class="row-btns center ch-acts">${ctl() ? '<button type="button" class="btn btn-gold btn-big" id="tnNew">NEW TOURNAMENT</button>' : '<button type="button" class="btn btn-gold btn-big" id="tnLeave">LEAVE ROOM</button>'}<button type="button" class="btn" id="tnBracket">SEE THE BRACKET</button><button type="button" class="btn" id="tnFinalBox">FINAL BOX SCORES</button></div></section>`;
      if (window.SFX) { try { window.SFX.play('crowd'); } catch (e) { /* no sound */ } }
      const nw = UI.$('#tnNew', app); if (nw) nw.addEventListener('click', () => { if (HOOK.on) { HOOK.again(); return; } ls.del(); TN = FRESH(); RUNS_CLEAR(); render(); });
      const lv = UI.$('#tnLeave', app); if (lv) lv.addEventListener('click', quit);
      UI.$('#tnBracket', app).addEventListener('click', () => go('bracket'));
      UI.$('#tnFinalBox', app).addEventListener('click', () => { TN.cur = { r: TN.rounds.length - 1, i: 0 }; WATCH = 0; go('match'); });
    });
  }

  // what the online tournament drives: the same bracket, match and champion screens on every phone
  window.TOURNAMENT.api = { hook: HOOK, get: () => TN, render, save, ensure, board, rosterOf, spinFor, aiChoose, ovrTag, startBracket, teamOf, tName, logo, lblC, short, lbl,
    ALL_YEARS, decOf, shuffle, CPU_NAMES, clearRuns: RUNS_CLEAR, nm, f1,
    nm2: nm, mount(app) { APP = app; render(); },
    swap(obj) { TN = Object.assign(FRESH(), obj || ls.get() || {}); TN.opts = Object.assign({ timer: 24, cap: 0, bestOf: 1, seeding: 'random', ratings: true }, TN.opts || {}); RUNS_CLEAR(); WATCH = 0; AUTO = false; dropCourt(); },
    setWatch(n) { WATCH = n; AUTO = true; }, court: () => courtCtl, watchN: () => WATCH };

  const prev = P.challenge;
  P.challenge = function (app, arg) {
    const part = String(arg || '').split('/');
    if (part[0] !== 'tournament') { app.classList.remove('tn-noR'); stopTick(); if (APP) dropCourt(); return prev.apply(this, arguments); }
    APP = app;
    return render();
  };
  Object.keys(prev).forEach(k => { P.challenge[k] = prev[k]; });
})();
