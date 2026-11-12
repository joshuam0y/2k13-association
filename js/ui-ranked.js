// Ranked play and the profile (#/ranked, #/me): era leaderboards for the Head to Head ladder and the daily auction, open games to join,
// and your own record, rivalries and best lineup. Results are reported by both players after a series (UI.ranked.report) and counted by
// the database only when the two reports agree (supabase/community.sql). Everything here needs an account; without the tables in
// Supabase the pages say so instead of breaking.
(function () {
  'use strict';
  const P = UI.pages = UI.pages || {}, esc = UI.esc, C = window.CHALLENGE;
  if (!C) return;
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const DECADES = [1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
  const ERAS = DECADES.map(d => d + 's').concat(['ALL']);
  const eraName = e => (e === 'ALL' ? 'ALL-TIME' : e);
  const decKey = y => ((y - 1) - (y - 1) % 10) + 's';
  // the era a game belongs to: its decade when every season in it is from one decade, else all-time
  function eraOf(cfg) {
    const ys = cfg.year ? [cfg.year] : (cfg.seasons && cfg.seasons.length ? cfg.seasons : null);
    if (!ys) return 'ALL';
    const ks = [...new Set(ys.map(decKey))];
    return ks.length === 1 ? ks[0] : 'ALL';
  }
  // the score of a lineup: its average rating plus what the fit adds (the same bump the series gives them)
  function lineupScore(five) {
    five = five.filter(Boolean).slice(0, 5);
    if (five.length < 5) return null;
    const f = C.lineupFit(five), avg = five.reduce((s, p) => s + (p.baseOvr != null ? p.baseOvr : (p.ovr || 0)), 0) / five.length;
    return Math.round((avg + (f.team || 0) * 0.6) * 10) / 10;
  }
  const today = () => new Date().toISOString().slice(0, 10);
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 1; };
  const REGIONS = [['', 'NOT SET'], ['US', 'United States']].concat(
    [['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'Washington DC'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming']].map(([c, n]) => ['US-' + c, '   ' + n]),
    [['CA', 'Canada'], ['MX', 'Mexico'], ['GB', 'United Kingdom'], ['IE', 'Ireland'], ['FR', 'France'], ['DE', 'Germany'], ['ES', 'Spain'], ['IT', 'Italy'], ['PT', 'Portugal'], ['NL', 'Netherlands'], ['BE', 'Belgium'], ['CH', 'Switzerland'], ['SE', 'Sweden'], ['NO', 'Norway'], ['DK', 'Denmark'], ['FI', 'Finland'], ['PL', 'Poland'], ['GR', 'Greece'], ['TR', 'Turkey'], ['RS', 'Serbia'], ['HR', 'Croatia'], ['SI', 'Slovenia'], ['LT', 'Lithuania'], ['NG', 'Nigeria'], ['GH', 'Ghana'], ['ZA', 'South Africa'], ['EG', 'Egypt'], ['IL', 'Israel'], ['AE', 'United Arab Emirates'], ['IN', 'India'], ['PH', 'Philippines'], ['CN', 'China'], ['JP', 'Japan'], ['KR', 'South Korea'], ['AU', 'Australia'], ['NZ', 'New Zealand'], ['BR', 'Brazil'], ['AR', 'Argentina'], ['DO', 'Dominican Republic'], ['PR', 'Puerto Rico'], ['JM', 'Jamaica'], ['OTHER', 'Somewhere else']]);
  const regionName = r => { const x = REGIONS.find(y => y[0] === r); return x ? x[1].trim() : (r || ''); };
  const NOT_SET_UP = 'The ranked boards are not switched on yet. The site owner needs to run supabase/community.sql once in the Supabase SQL editor.';
  const failMsg = e => { const m = String((e && e.message) || e); return /does not exist|schema cache|Could not find|relation .* does not exist|PGRST20/i.test(m) ? NOT_SET_UP : m; };

  // ---------- reporting a finished series (called by Head to Head) ----------
  const REPORTED = {};
  async function report(info) {
    if (!UI.profile.signedIn() || REPORTED[info.key]) return;
    REPORTED[info.key] = 1;
    try {
      await UI.profile.rpc('report_series', { p_key: info.key, p_opp: info.opp, p_my_wins: info.myWins, p_opp_wins: info.oppWins, p_era: info.era, p_style: info.style, p_ranked: !!info.ranked, p_best_of: info.bestOf, p_lineup: info.lineup || null, p_score: info.score == null ? null : info.score });
    } catch (e) { REPORTED[info.key] = 0; console.warn('[ranked] could not report the series:', failMsg(e)); }
  }

  // ---------- an open game: listed while the room waits ----------
  let LOB = null;
  function lobbyStop() {
    if (!LOB) return;
    clearInterval(LOB.t); const c = LOB.code; LOB = null;
    UI.profile.rpc('lobby_down', { p_code: c }).catch(() => {});
  }
  function lobbyStart(info) {
    lobbyStop();
    if (!UI.profile.signedIn()) return;
    const up = () => UI.profile.rpc('lobby_up', { p_code: info.code, p_era: info.era, p_style: info.style, p_ranked: !!info.ranked }).catch(() => {});
    up();
    LOB = { code: info.code, t: setInterval(up, 30000) };
  }

  UI.ranked = { eraOf, lineupScore, report, lobbyStart, lobbyStop, ERAS, eraName, regionName, REGIONS };

  // ---------- helpers for the pages ----------
  const eraOpts = cur => ERAS.map(e => `<option value="${e}"${e === cur ? ' selected' : ''}>${esc(eraName(e))}</option>`).join('');
  const regionOpts = cur => REGIONS.map(([v, n]) => `<option value="${esc(v)}"${v === (cur || '') ? ' selected' : ''}>${esc(n.replace(/^ +/, '    '))}</option>`).join('');
  async function myRow() {
    const c = await UI.profile.client(), id = UI.profile.userId();
    if (!c || !id) return null;
    const r = await c.from('profiles').select('username,region,fav_era,best_lineup,best_score').eq('id', id).maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  }
  const signInBox = what => `<div class="rk-note"><b>SIGN IN TO ${what}.</b><span class="muted"> Ranked results, rivalries and your profile live on your account.</span><button type="button" class="btn btn-gold" data-pf="open">SIGN IN OR CREATE ACCOUNT</button></div>`;

  // ---------- #/ranked ----------
  const RK = { era: ls.get('a13-rk-era', '1990s'), mine: !!ls.get('a13-rk-mine', false), tab: ls.get('a13-rk-tab', 'ladder') };
  let REFRESH = null;
  function stopRefresh() { if (REFRESH) { clearInterval(REFRESH); REFRESH = null; } }
  function rankedPage(app) {
    stopRefresh();
    const signed = UI.profile.signedIn();
    app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">RANKED</div><h1 class="ch-hero-t">THE BOARDS.</h1>
        <p class="ch-hero-p">Every era has its own ladder. Win ranked Head to Head auctions to climb it, or play today's daily auction (the same pool for everyone) and see where your lineup lands.</p></section>
      ${signed ? '' : signInBox('PLAY RANKED')}
      <div class="rk-ctl"><label class="field"><span>ERA</span><select id="rkEra">${eraOpts(RK.era)}</select></label>
        <div class="ch-chips rk-scope"><button type="button" class="ch-chip${!RK.mine ? ' on' : ''}" data-scope="0">GLOBAL</button><button type="button" class="ch-chip${RK.mine ? ' on' : ''}" data-scope="1">MY REGION</button></div></div>
      <div class="ch-chips rk-tabs"><button type="button" class="ch-chip${RK.tab === 'ladder' ? ' on' : ''}" data-tab="ladder">LADDER</button><button type="button" class="ch-chip${RK.tab === 'daily' ? ' on' : ''}" data-tab="daily">DAILY AUCTION</button><button type="button" class="ch-chip${RK.tab === 'games' ? ' on' : ''}" data-tab="games">OPEN GAMES</button></div>
      <div id="rkBody" class="rk-body"><p class="muted">Loading...</p></div>
      <div class="ch-go"><a class="btn" href="#/me">MY PROFILE</a><a class="btn" href="#/challenge/vs">HEAD TO HEAD</a></div>`;
    UI.profile.wire(app, () => rankedPage(app));
    const era = UI.$('#rkEra', app); era.addEventListener('change', () => { RK.era = era.value; ls.set('a13-rk-era', RK.era); rankedPage(app); });
    app.querySelectorAll('[data-scope]').forEach(b => b.addEventListener('click', () => { RK.mine = b.dataset.scope === '1'; ls.set('a13-rk-mine', RK.mine); rankedPage(app); }));
    app.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { RK.tab = b.dataset.tab; ls.set('a13-rk-tab', RK.tab); rankedPage(app); }));
    fill(app);
  }
  const wl = (w, l) => w + '-' + l;
  async function fill(app) {
    const body = UI.$('#rkBody', app);
    if (!body) return;
    try {
      let region = '';
      if (RK.mine) {
        const me = UI.profile.signedIn() ? await myRow() : null;
        region = (me && me.region) || '';
        if (!region) { body.innerHTML = '<div class="rk-note"><b>NO REGION SET.</b><span class="muted"> Pick your country (or US state) on your profile to see your region.</span><a class="btn btn-gold" href="#/me">MY PROFILE</a></div>'; return; }
      }
      const scope = RK.mine ? ' in ' + regionName(region) : '';
      if (RK.tab === 'ladder') {
        const rows = await UI.profile.rpc('lb_ratings', { p_era: RK.era, p_region: region || null, p_limit: 50 });
        body.innerHTML = `<p class="muted rk-sub">${esc(eraName(RK.era))} ranked Head to Head ladder${esc(scope)}. Everyone starts at 1200.</p>` + (rows.length ? table(['#', 'PLAYER', 'RATING', 'W-L'], rows.map((r, i) => [i + 1, nameCell(r), '<b>' + r.rating + '</b>', wl(r.wins, r.losses)])) : '<p class="muted">Nobody is on this ladder yet. Win a ranked auction against a friend to be the first.</p>');
      } else if (RK.tab === 'daily') {
        const day = today(), rows = await UI.profile.rpc('lb_daily', { p_day: day, p_era: RK.era, p_region: region || null, p_limit: 50 });
        const me = UI.profile.account(), done = ls.get('a13-rk-d-' + day + '-' + RK.era, null);
        const played = done && done.fin;
        body.innerHTML = `<p class="muted rk-sub">${esc(day)} (UTC) | ${esc(eraName(RK.era))} | ten hidden players, $20 each, you against the house. Your score is your lineup rating.</p>
          <div class="ch-go">${UI.profile.signedIn() ? `<a class="btn btn-gold btn-big" href="#/ranked/daily/${esc(RK.era)}">${played ? 'SEE TODAY\'S RESULT' : done ? 'FINISH TODAY\'S AUCTION' : 'PLAY TODAY\'S AUCTION'}</a>` : ''}</div>` +
          (rows.length ? table(['#', 'PLAYER', 'SCORE'], rows.map((r, i) => [i + 1, nameCell(r, me), '<b>' + Number(r.score).toFixed(1) + '</b>'])) : '<p class="muted">No scores yet today' + esc(scope) + '.</p>');
      } else {
        const rows = await UI.profile.rpc('lobby_list');
        const mine = UI.profile.account();
        body.innerHTML = `<p class="muted rk-sub">Rooms waiting for a second player right now. They update every few seconds.</p>` + (rows.length ? table(['HOST', 'ERA', 'STYLE', ''], rows.map(r => [esc(r.host_name), esc(eraName(r.era)), esc(String(r.style).toUpperCase()) + (r.ranked ? ' <span class="rk-tag">RANKED</span>' : ''), r.host_name === mine ? '<span class="muted">YOU</span>' : `<a class="btn btn-small btn-gold" href="#/challenge/vs/join/${esc(r.code)}">JOIN</a>`]), true) : '<p class="muted">No open games. Host one from Head to Head and tick "Open game" to list it here.</p>');
        if (!REFRESH) REFRESH = setInterval(() => { if (!/^#\/ranked/.test(location.hash) || RK.tab !== 'games') { stopRefresh(); return; } fill(app); }, 10000);
      }
    } catch (e) { body.innerHTML = '<p class="rk-err">' + esc(failMsg(e)) + '</p>'; }
  }
  const nameCell = (r, me) => `<b>${esc(r.username)}</b>${me && r.username === me ? ' <span class="rk-tag">YOU</span>' : ''}${r.region ? ` <small class="muted">${esc(regionName(r.region))}</small>` : ''}`;
  function table(head, rows, raw) {
    return `<div class="rk-tbl-w"><table class="rk-tbl"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i === 0 && !raw ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  // ---------- #/ranked/daily/ERA: today's auction against the house ----------
  const mulberry = seed => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const DAILY = { budget: 20, start: 1, raise: 1, pool: 10, quality: 'stars', show: 0 };
  function poolFor(era) {
    const inEra = s => era === 'ALL' || decKey(s) === era;
    const best = {};   // one season of each player: his best in the era
    C.allTimePool().filter(e => inEra(e.season)).forEach(e => { if (!best[e.base] || e.ovr > best[e.base].ovr) best[e.base] = e; });
    return Object.keys(best).map(k => Object.assign({}, best[k], { id: best[k].key, team: best[k].from }));
  }
  // the house bids for what it thinks a player is worth: more for the best of the pool, a little different every time
  function houseMove(st, byId, rng) {
    const ids = st.ids.map(id => byId[id].ovr), hi = Math.max.apply(null, ids), lo = Math.min.apply(null, ids);
    const p = byId[st.ids[st.i]], w = Math.pow(Math.max(0, p.ovr - lo) / Math.max(1, hi - lo), 1.5);
    const avg = (st.o.budget - st.spent[1]) / Math.max(1, st.per - st.won[1].length);   // what he has to spend on each spot still open
    const target = st.o.start + Math.round(avg * (0.4 + 1.6 * w) - st.o.start + (rng() - 0.5) * 1.5);
    return st.price + st.o.raise <= target && C.aucCanRaise(st, 1) ? 'raise' : 'pass';
  }
  function dailyPage(app, era) {
    stopRefresh();
    era = ERAS.indexOf(era) >= 0 ? era : '1990s';
    if (!UI.profile.signedIn()) { app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">DAILY AUCTION | ${esc(eraName(era))}</div><h1 class="ch-hero-t">SIGN IN FIRST.</h1></section>${signInBox('PLAY THE DAILY AUCTION')}<div class="ch-go"><a class="btn" href="#/ranked">BACK</a></div>`; UI.profile.wire(app, () => dailyPage(app, era)); return; }
    const day = today(), key = 'a13-rk-d-' + day + '-' + era;
    if (!C.loaded('pool')) {   // the all-time pool loads on demand
      app.innerHTML = '<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING THE PLAYERS...</div></section>';
      C.load('pool').then(() => { if (/^#\/ranked\/daily/.test(location.hash)) dailyPage(app, era); }).catch(e => { app.innerHTML = '<p class="rk-err">' + esc(e.message || e) + '</p>'; });
      return;
    }
    const pool = poolFor(era), byId = {};
    pool.forEach(p => { byId[p.id] = p; });
    if (pool.length < 40) { app.innerHTML = '<p class="rk-err">That era has too few players for an auction.</p>'; return; }
    const cfg = { bench: 0, seed: hash(day + '|' + era), auction: DAILY };
    let saved = ls.get(key, null), st;
    if (saved && saved.st) st = saved.st;
    else { st = C.auctionStart(cfg, pool); }
    const rng = mulberry(hash(day + era + 'house'));
    const house = () => { let n = 0; while (!st.done && st.turn === 1 && n++ < 50) C.auctionAct(st, 1, houseMove(st, byId, rng)); };
    house();
    const save = fin => ls.set(key, { st, fin: !!fin, score: saved && saved.score });
    save(st.done);
    draw(app, era, day, st, byId, key, house, save);
  }
  function draw(app, era, day, st, byId, key, house, save) {
    const A = st.o, per = st.per, money = n => '$' + n;
    const sideBox = (i, name) => {
      const won = st.won[i].map(id => ({ p: byId[id], price: (st.log.filter(x => x.id === id)[0] || {}).price }));
      return `<div class="vs-side${st.turn === i ? ' on' : ''}"><div class="vs-side-h"><div><small>${name}</small><b>${money(A.budget - st.spent[i])} left</b><small class="vs-pay">${st.won[i].length} of ${per} spots</small></div></div>
        <ol class="vs-auc-won">${won.map(w => `<li>${esc(w.p ? w.p.name : '?')} <small class="muted">${money(w.price || 0)}</small></li>`).join('') || '<li class="muted">Nobody yet</li>'}</ol></div>`;
    };
    const hdr = `<div class="ch-top"><div><div class="ch-top-k">DAILY AUCTION | ${esc(day)} | ${esc(eraName(era))}</div><div class="ch-top-t">${st.done ? 'YOUR FIVE IS SET' : 'PLAYER ' + (st.i + 1) + ' OF ' + st.ids.length}</div></div><a class="btn btn-small" href="#/ranked">BACK</a></div>`;
    if (st.done) {
      const five = st.won[0].map(id => byId[id]), score = UI.ranked.lineupScore(five), houseFive = st.won[1].map(id => byId[id]), hs = UI.ranked.lineupScore(houseFive);
      app.innerHTML = `${hdr}<div class="vs-sides vs-compact">${sideBox(0, 'YOU')}${sideBox(1, 'THE HOUSE')}</div>
        <section class="rk-score"><small>YOUR LINEUP SCORE</small><b>${score == null ? '-' : score.toFixed(1)}</b><span class="muted">The house scored ${hs == null ? '-' : hs.toFixed(1)}. ${score != null && hs != null ? (score > hs ? 'You beat the house.' : score < hs ? 'The house won this one.' : 'A tie.') : ''}</span></section>
        <div id="rkSub" class="rk-note"><span class="muted">Sending your score...</span></div>
        <div class="ch-go"><a class="btn btn-gold" href="#/ranked">SEE THE BOARD</a></div>`;
      const sub = UI.$('#rkSub', app);
      const cur = ls.get(key, {});
      if (cur.sent) { sub.innerHTML = `<b>SCORE SENT.</b> <span class="muted">One try a day for each era.</span>`; return; }
      UI.profile.rpc('submit_daily', { p_day: day, p_era: era, p_score: score, p_lineup: { names: five.map(p => p.name), seasons: five.map(p => p.season || null), score, era } })
        .then(ok => { ls.set(key, Object.assign(cur, { st, fin: true, sent: true, score })); sub.innerHTML = ok ? '<b>SCORE SENT.</b> <span class="muted">You are on today\'s board.</span>' : '<b>ALREADY ON THE BOARD.</b> <span class="muted">One score a day for each era.</span>'; })
        .catch(e => { sub.innerHTML = '<span class="rk-err">' + esc(failMsg(e)) + '</span>'; });
      return;
    }
    const cur = byId[st.ids[st.i]], mine = st.turn === 0, canRaise = C.aucCanRaise(st, 0), left = st.ids.length - st.i - 1;
    app.innerHTML = `${hdr}<div class="vs-sides vs-compact">${sideBox(0, 'YOU')}${sideBox(1, 'THE HOUSE')}</div>
      <section class="ch-landed vs-auc-cur">${UI.faceImg(cur, '#555')}<div><div class="ch-wheel-k">UP FOR BID</div><div class="ch-landed-t">${esc(cur.name)}</div><small class="muted">${esc(C.posLabel(cur))}${cur.season ? ' | \'' + String(cur.season - 1).slice(2) + '-\'' + String(cur.season).slice(2) : ''}</small></div>
        <div class="vs-auc-bid"><small>${st.holder === 0 ? 'YOU HOLD' : 'THE HOUSE HOLDS'}</small><b>${money(st.price)}</b></div></section>
      <div class="vs-auc-act"><button type="button" class="btn btn-gold btn-big" id="aucRaise"${mine && canRaise ? '' : ' disabled'}>RAISE TO ${money(st.price + A.raise)}</button><button type="button" class="btn btn-big" id="aucPass"${mine ? '' : ' disabled'}>PASS: ${st.holder === 0 ? 'YOU GET HIM' : 'THE HOUSE GETS HIM'} FOR ${money(st.price)}</button></div>
      <p class="muted">${left} more in the hidden pool. One try a day.</p>`;
    const go = a => { if (C.auctionAct(st, 0, a)) { house(); save(st.done); draw(app, era, day, st, byId, key, house, save); window.scrollTo(0, 0); } };
    const r = UI.$('#aucRaise', app); if (r) r.addEventListener('click', () => go('raise'));
    const p = UI.$('#aucPass', app); if (p) p.addEventListener('click', () => go('pass'));
  }

  // ---------- #/me ----------
  async function mePage(app) {
    stopRefresh();
    if (!UI.profile.signedIn()) { app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">PROFILE</div><h1 class="ch-hero-t">YOUR PROFILE.</h1></section>${signInBox('SEE YOUR PROFILE')}`; UI.profile.wire(app, () => mePage(app)); return; }
    app.innerHTML = '<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING YOUR PROFILE...</div></section>';
    try {
      const c = await UI.profile.client(), id = UI.profile.userId();
      if (!c || !id) throw new Error('Could not reach the account service.');
      const row = await myRow();
      const ser = await c.from('series').select('p1,p2,w1,w2,era,style,ranked,created_at').order('created_at', { ascending: false }).limit(300);
      const rat = await c.from('ratings').select('era,rating,games,wins,losses').eq('user_id', id);
      const riv = await c.from('rivalries').select('a,b,a_wins,b_wins,last_at');
      const missing = [ser, rat, riv].find(x => x.error);
      if (missing) throw missing.error;
      const games = (ser.data || []).map(s => ({ won: (s.p1 === id ? s.w1 > s.w2 : s.w2 > s.w1), era: s.era, at: s.created_at, ranked: s.ranked }));
      const W = games.filter(g => g.won).length, L = games.length - W;
      let streak = 0; for (const g of games) { if (g.won === games[0].won) streak++; else break; }
      const count = {}; games.forEach(g => { count[g.era] = (count[g.era] || 0) + 1; });
      const auto = Object.keys(count).sort((a, b) => count[b] - count[a])[0] || null;
      const fav = row.fav_era || auto;
      const oppIds = (riv.data || []).map(r => (r.a === id ? r.b : r.a));
      const names = {};
      if (oppIds.length) { const p = await c.from('profiles').select('id,username').in('id', oppIds); (p.data || []).forEach(x => { names[x.id] = x.username; }); }
      const rivals = (riv.data || []).map(r => ({ name: names[r.a === id ? r.b : r.a] || '?', me: r.a === id ? r.a_wins : r.b_wins, them: r.a === id ? r.b_wins : r.a_wins, at: r.last_at })).sort((x, y) => (y.me + y.them) - (x.me + x.them));
      const bl = row.best_lineup;
      app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">PROFILE</div><h1 class="ch-hero-t">${esc(row.username || UI.profile.account()).toUpperCase()}</h1>
          <p class="ch-hero-p">${games.length ? W + '-' + L + ' in Head to Head series' + (streak > 1 ? ', ' + streak + ' ' + (games[0].won ? 'wins' : 'losses') + ' in a row' : '') + '.' : 'No series on your account yet. Play a friend in Head to Head while you are both signed in.'}</p></section>
        <div class="rk-cards"><div class="rk-card"><small>RECORD</small><b>${W}-${L}</b></div><div class="rk-card"><small>FAVORITE ERA</small><b>${fav ? esc(eraName(fav)) : '-'}</b></div><div class="rk-card"><small>BEST LINEUP</small><b>${row.best_score != null ? Number(row.best_score).toFixed(1) : '-'}</b></div></div>
        <div class="ch-step"><div class="ch-step-k">ABOUT YOU</div>
          <label class="field"><span>REGION (FOR THE REGION BOARDS)</span><select id="meRegion">${regionOpts(row.region)}</select></label>
          <label class="field"><span>FAVORITE ERA</span><select id="meFav"><option value="">${auto ? 'THE ERA I PLAY MOST (' + esc(eraName(auto)) + ')' : 'THE ERA I PLAY MOST'}</option>${eraOpts(row.fav_era || '___')}</select></label>
          <small class="muted">Your region is only what you pick here. Nothing reads your location.</small>
          <div class="ch-go"><button type="button" class="btn btn-gold" id="meSave">SAVE</button><span class="pf-msg" id="meMsg"></span></div></div>
        ${bl && bl.names ? `<div class="ch-step"><div class="ch-step-k">BEST LINEUP</div><p class="rk-lineup">${bl.names.map(n => `<span>${esc(n)}</span>`).join('')}</p><small class="muted">Score ${Number(bl.score || row.best_score).toFixed(1)}${bl.era ? ' | ' + esc(eraName(bl.era)) : ''}</small></div>` : ''}
        ${rat.data && rat.data.length ? `<div class="ch-step"><div class="ch-step-k">YOUR LADDER RATINGS</div>${table(['ERA', 'RATING', 'W-L'], rat.data.slice().sort((x, y) => y.rating - x.rating).map(r => [esc(eraName(r.era)), '<b>' + r.rating + '</b>', wl(r.wins, r.losses)]), true)}</div>` : ''}
        <div class="ch-step"><div class="ch-step-k">RIVALRIES</div>${rivals.length ? table(['VS', 'RECORD', ''], rivals.map(r => [esc(r.name), '<b>' + r.me + '-' + r.them + '</b>', r.me > r.them ? 'YOU LEAD' : r.me < r.them ? 'THEY LEAD' : 'TIED']), true) : '<p class="muted">Your rivalries show up here: one record for each friend you play, and one series counts for each draft.</p>'}</div>
        <div class="ch-go"><a class="btn btn-gold" href="#/ranked">RANKED</a><a class="btn" href="#/challenge/vs">HEAD TO HEAD</a></div>`;
      const save = UI.$('#meSave', app), msg = UI.$('#meMsg', app);
      save.addEventListener('click', async () => {
        save.disabled = true; msg.textContent = 'Saving...';
        const u = await c.from('profiles').update({ region: UI.$('#meRegion', app).value || null, fav_era: UI.$('#meFav', app).value || null }).eq('id', id);
        msg.textContent = u.error ? failMsg(u.error) : 'Saved.'; msg.className = 'pf-msg' + (u.error ? ' bad' : ''); save.disabled = false;
      });
    } catch (e) { app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">PROFILE</div><h1 class="ch-hero-t">YOUR PROFILE.</h1></section><p class="rk-err">${esc(failMsg(e))}</p>`; }
  }

  P.ranked = function (app, arg) {
    const part = String(arg || '').split('/');
    if (part[0] === 'daily') return dailyPage(app, part[1] ? decodeURIComponent(part[1]) : RK.era);
    return rankedPage(app);
  };
  P.me = function (app) { return mePage(app); };
  window.addEventListener('hashchange', () => { if (!/^#\/ranked/.test(location.hash)) stopRefresh(); });
})();
