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

  // a ranked series that both phones started: if one player then leaves without reporting, the other player's result still counts after a while
  const STARTED = {};
  async function started(info) {
    if (!UI.profile.signedIn() || STARTED[info.key]) return;
    STARTED[info.key] = 1;
    rememberBefore(info); faced(info.opp);
    try { await UI.profile.rpc('start_series', { p_key: info.key, p_opp: info.opp, p_era: info.era, p_style: info.style, p_ranked: !!info.ranked, p_best_of: info.bestOf }); }
    catch (e) { STARTED[info.key] = 0; console.warn('[ranked] could not log the start:', failMsg(e)); }
  }


  // ---------- the rating change screen (#/ranked/result) ----------
  const LASTKEY = 'a13-rk-last';
  const lastGet = () => { try { return JSON.parse(sessionStorage.getItem(LASTKEY) || 'null'); } catch (e) { return null; } };
  const lastSet = o => { try { sessionStorage.setItem(LASTKEY, JSON.stringify(o)); } catch (e) { /* private mode */ } };
  async function ratingNow(era) {
    const c = await UI.profile.client(), id = UI.profile.userId();
    if (!c || !id) return null;
    const r = await c.from('ratings').select('rating,games,wins,losses').eq('user_id', id).eq('era', era).maybeSingle();
    if (r.error) throw r.error;
    const row = r.data || { rating: 1200, games: 0, wins: 0, losses: 0 };
    const above = await c.from('ratings').select('user_id', { count: 'exact', head: true }).eq('era', era).gt('games', 0).gt('rating', row.rating);
    const all = await c.from('ratings').select('user_id', { count: 'exact', head: true }).eq('era', era).gt('games', 0);
    return Object.assign({}, row, { rank: (above.count || 0) + 1, of: Math.max(all.count || 0, row.games ? 1 : 0) });
  }
  async function rememberBefore(info) {
    const cur = lastGet();
    if (cur && cur.key === info.key) return;
    let before = { rating: 1200, games: 0, rank: 0, of: 0 };
    try { before = (await ratingNow(info.era)) || before; } catch (e) { /* the result screen copes without it */ }
    const again = lastGet();
    if (again && again.key === info.key) return;
    lastSet({ key: info.key, era: info.era, opp: info.opp, bestOf: info.bestOf, before: { rating: before.rating, games: before.games, rank: before.rank, of: before.of }, at: Date.now() });
  }
  // the other player stayed gone: the series is recorded as a forfeit win for this phone
  async function forfeit(info) {
    if (!UI.profile.signedIn()) return false;
    try {
      const ok = await UI.profile.rpc('forfeit_series', { p_key: info.key });
      if (ok) { const cur = lastGet() || { key: info.key, era: info.era, opp: info.opp, bestOf: info.bestOf, before: { rating: 1200, games: 0 }, at: Date.now() }; cur.forfeit = 'win'; lastSet(cur); }
      return !!ok;
    } catch (e) { console.warn('[ranked] could not record the forfeit:', failMsg(e)); return false; }
  }
  function resultPage(app) {
    stopRefresh();
    const last = lastGet();
    if (!last) { app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">RANKED</div><h1 class="ch-hero-t">NO RANKED RESULT YET.</h1></section><div class="ch-go"><a class="btn btn-gold" href="#/ranked">RANKED</a></div>`; return; }
    const back = UI.vsQuick && /^#\/challenge\/vs/.test(UI.vsQuick.target()) && UI.vsQuick.status().role ? `<a class="btn" href="${UI.vsQuick.target()}">BACK TO THE SERIES</a>` : '';
    const acts = `<div class="ch-go">${back}<a class="btn btn-gold" href="#/ranked">RANKED</a><a class="btn" href="#/me">MY PROFILE</a></div>`;
    const wait = () => `<section class="ch-hero"><div class="ch-hero-k">RANKED | ${esc(eraName(last.era))} | VS ${esc(last.opp || '')}</div><h1 class="ch-hero-t">${last.forfeit === 'win' ? 'WIN BY FORFEIT.' : last.forfeit === 'loss' ? 'YOU FORFEITED.' : 'COUNTING THE RESULT.'}</h1>
      <p class="ch-hero-p">${last.forfeit === 'win' ? 'Your opponent did not come back in time. Recording it...' : 'Waiting for both phones to report the same score. This updates on its own.'}</p></section>
      <div class="ch-load"><div class="ch-spin-ring"></div></div>${acts}`;
    app.innerHTML = wait();
    let tries = 0, stopped = false;
    const stop = () => { stopped = true; };
    window.addEventListener('hashchange', stop, { once: true });
    const tick = async () => {
      if (stopped || !/^#\/ranked\/result/.test(location.hash)) return;
      tries++;
      let now = null;
      try { now = await ratingNow(last.era); } catch (e) { /* retry */ }
      if (stopped) return;
      if (now && now.games > (last.before ? last.before.games : 0)) return show(now);
      if (tries > 60) { app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">RANKED | ${esc(eraName(last.era))}</div><h1 class="ch-hero-t">STILL WAITING.</h1><p class="ch-hero-p">${esc(last.opp || 'The other player')} has not reported the score yet. It counts as soon as they do, or about fifteen minutes after the series if they never do. Check your profile later.</p></section>${acts}`; return; }
      setTimeout(tick, 2500);
    };
    const show = now => {
      const b = last.before || { rating: 1200 }, d = now.rating - b.rating, won = d > 0 || (d === 0 && now.wins > (b.wins || 0));
      const rk = now.of ? `#${now.rank} of ${now.of} in ${esc(eraName(last.era))}` : '';
      app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">RANKED | ${esc(eraName(last.era))} | VS ${esc(last.opp || '')}</div><h1 class="ch-hero-t">${last.forfeit === 'win' ? 'WIN BY FORFEIT.' : last.forfeit === 'loss' ? 'YOU FORFEITED.' : won ? 'YOU WON.' : 'YOU LOST.'}</h1></section>
        <section class="rk-elo ${won ? 'up' : 'down'}"><small>RATING</small>
          <div class="rk-elo-n"><span class="rk-elo-from">${b.rating}</span><span class="rk-elo-arrow">${won ? '&#9650;' : '&#9660;'}</span><b id="rkEloNow">${b.rating}</b></div>
          <div class="rk-elo-d">${d > 0 ? '+' : ''}${d}</div>
          <div class="rk-elo-meta"><span>${now.wins}-${now.losses} ranked this era</span>${rk ? `<span>${rk}</span>` : ''}${b.rank && now.rank !== b.rank ? `<span>${now.rank < b.rank ? 'UP' : 'DOWN'} ${Math.abs(b.rank - now.rank)} PLACE${Math.abs(b.rank - now.rank) > 1 ? 'S' : ''}</span>` : ''}</div></section>${acts}`;
      const el = UI.$('#rkEloNow', app), t0 = Date.now(), from = b.rating, to = now.rating;
      const step = () => { if (!el.isConnected) return; const k = Math.min(1, (Date.now() - t0) / 1400); el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
      if (window.SFX) window.SFX.play(won ? 'chime' : 'buzzer');
    };
    tick();
  }


  // ---------- players you already met in ranked: each matchup counts once unless you both agree to a rematch ----------
  const PB = {}, FACED = 'a13-rk-faced';
  const facedGet = () => { try { return JSON.parse(localStorage.getItem(FACED) || '[]'); } catch (e) { return []; } };
  function faced(name) { const k = String(name).toLowerCase(), l = facedGet(); if (l.indexOf(k) < 0) { l.push(k); try { localStorage.setItem(FACED, JSON.stringify(l.slice(-200))); } catch (e) { /* private mode */ } } PB[k] = true; }
  async function playedBefore(name) {
    const k = String(name || '').toLowerCase();
    if (!k) return false;
    if (facedGet().indexOf(k) >= 0 || PB[k]) return true;
    try {
      const c = await UI.profile.client(), id = UI.profile.userId();
      if (!c || !id) return false;
      const f = await c.from('profiles').select('id').ilike('username', k.replace(/[_%\\]/g, '\\$&')).maybeSingle();
      if (!f.data) return false;
      const r = await c.from('series').select('id').eq('ranked', true).or(`and(p1.eq.${id},p2.eq.${f.data.id}),and(p1.eq.${f.data.id},p2.eq.${id})`).limit(1);
      if (r.data && r.data.length) { PB[k] = true; return true; }
    } catch (e) { /* cannot check: let them play */ }
    return false;
  }
  // you give up a ranked series: it counts as a loss for you and a win for the other player
  async function concede(info) {
    if (!UI.profile.signedIn()) return false;
    try {
      const ok = await UI.profile.rpc('concede_series', { p_key: info.key });
      if (ok) { const cur = lastGet() || { key: info.key, era: info.era, opp: info.opp, bestOf: info.bestOf, before: { rating: 1200, games: 0 }, at: Date.now() }; cur.forfeit = 'loss'; lastSet(cur); }
      return !!ok;
    } catch (e) { console.warn('[ranked] could not record the forfeit:', failMsg(e)); return false; }
  }
  function noteForfeit(v) { const cur = lastGet(); if (cur) { cur.forfeit = v; lastSet(cur); } }
  // the lobby card of one player: rating and place on this era's ladder, records, friends, most used player, your record against them
  // a profile is fetched once and kept for a minute, and it is started early (while searching, or the moment an opponent connects) so the lobby cards are already there
  const CARDS = {};
  function cardData(name) {
    const k = String(name).toLowerCase(), c = CARDS[k];
    if (c && Date.now() - c.at < 60000) return c.p;
    const p = Promise.resolve(UI.profile.rpc('public_profile', { p_name: name })).catch(() => null);
    CARDS[k] = { at: Date.now(), p };
    return p;
  }
  const prefetch = name => { if (name && UI.profile.signedIn()) cardData(name); };
  async function lobbyCard(name, era, mine) {
    let d = null;
    let slow = false;
    try { d = await Promise.race([cardData(name), new Promise(r => setTimeout(() => { slow = true; r(null); }, 6000))]); } catch (e) { /* shown without the numbers */ }
    if (slow) delete CARDS[String(name).toLowerCase()];   // gave up waiting: the retry button asks again
    if (!d) return `<div class="lb-card${mine ? ' me' : ''}"><div class="lb-av">${esc(String(name).slice(0, 1).toUpperCase())}</div><b class="lb-n">${esc(name)}</b><small class="lb-sub">${mine ? 'YOU' : 'OPPONENT'}</small><small class="muted">${slow ? 'COULD NOT LOAD THE STATS.' : 'NO PROFILE NUMBERS YET'}</small>${slow ? '<button type="button" class="btn btn-small" data-lbretry="1">TRY AGAIN</button>' : ''}</div>`;
    const r = (d.ratings || []).find(x => x.era === era), m = d.most && d.most[0];
    return `<div class="lb-card${mine ? ' me' : ''}"><div class="lb-av">${esc(String(d.username || name).slice(0, 1).toUpperCase())}</div><b class="lb-n">${esc(d.username || name)}</b>
      <small class="lb-sub">${mine ? 'YOU' : 'OPPONENT'}${d.region ? ' | ' + esc(regionName(d.region)) : ''}</small>
      <div class="lb-elo"><small>${esc(eraName(era))} RATING</small><b>${r ? r.rating : 1200}</b><small>${r && r.of ? '#' + r.rank + ' of ' + r.of : 'NOT RANKED YET'}</small></div>
      <div class="lb-st"><span><b>${r ? r.wins + '-' + r.losses : '0-0'}</b><small>RANKED</small></span><span><b>${(d.wins || 0) + '-' + (d.losses || 0)}</b><small>ALL SERIES</small></span><span><b>${d.friends || 0}</b><small>FRIENDS</small></span></div>
      ${m ? `<div class="lb-most"><small>MOST USED PLAYER</small><b>${esc(m.name)}</b><small>${esc(yr(m.season) || '')}</small></div>` : ''}
      ${!mine && d.vs ? `<div class="lb-h2h">YOU ${d.vs.me} - ${d.vs.them} THEM</div>` : ''}</div>`;
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

  // the auto-draft reveal: when a side has its five (or no money left), the rest of the pool goes to the other side as face-down cards that flip one by one
  UI.aucReveal = function (app, o) {
    const es = o.entries, name = o.name, money = n => (n ? '$' + n : 'FREE');
    const card = (e, k) => {
      const p = o.byId[e.id], col = (o.color && o.color(p)) || '#555';
      return `<div class="rv-card" data-k="${k}" style="--c1:${esc(col)}"><div class="rv-in"><div class="rv-back"><span>?</span></div>
        <div class="rv-front"><div class="auc-face">${UI.faceImg(p, col)}</div><b class="rv-n">${esc(p.name)}</b><small>${esc(C.posLabel(p))}${p.season ? ' | ' + esc("'" + String(p.season - 1).slice(2) + "-'" + String(p.season).slice(2)) : ''}${p.ovr && !o.blind ? ' | ' + esc(p.ovr) + ' OVR' : ''}</small><div class="rv-to${e.side === 0 ? ' a' : ' b'}"><i>${esc(name(e.side))}</i><em>${money(e.price)}</em></div></div></div></div>`;
    };
    const to = es[0] ? name(es[0].side) : '';
    const free = es.every(e => e.auto === 'free');
    app.innerHTML = `<section class="rv"><small class="rv-k">${free ? 'ROSTER FULL' : 'NO ONE LEFT TO BID'}</small><h2>${free ? esc(name(1 - es[0].side).toUpperCase()) + ' IS DONE. THE REST ARE AUTO-DRAFTED.' : 'THEY CAN NOT TOP IT.'}</h2>
      <p class="muted">${esc(to)} takes ${es.length === 1 ? 'the last player' : 'the last ' + es.length + ' players'}${free ? ' for free' : ''}.</p>
      <div class="rv-grid n${es.length}">${es.map(card).join('')}</div>
      <div class="ch-go"><button type="button" class="btn btn-gold" id="rvGo">SKIP</button></div></section>`;
    let finished = false, timers = [];
    const finish = () => { if (finished) return; finished = true; timers.forEach(clearTimeout); app.querySelectorAll('.rv-card').forEach(c => c.classList.add('flip')); setTimeout(() => o.onDone && o.onDone(), 350); };
    es.forEach((e, k) => timers.push(setTimeout(() => { const c = app.querySelector('.rv-card[data-k="' + k + '"]'); if (c) c.classList.add('flip', 'pop'); if (window.SFX) window.SFX.play('chime'); }, 600 + k * 850)));
    timers.push(setTimeout(() => { const b = UI.$('#rvGo', app); if (b) b.textContent = 'CONTINUE'; }, 600 + es.length * 850));
    timers.push(setTimeout(finish, 600 + es.length * 850 + 2600));
    UI.$('#rvGo', app).addEventListener('click', finish);
  };

  UI.userLink = (name, tab) => `<a class="u-link" href="#/u/${encodeURIComponent(name)}"${tab ? ' target="_blank" rel="noopener"' : ''}>${esc(name)}</a>`;   // a name you can click to see that player's profile
  UI.ranked = { eraOf, lineupScore, report, started, forfeit, concede, noteForfeit, playedBefore, lobbyCard, prefetch, lobbyStart, lobbyStop, ERAS, eraName, regionName, REGIONS };

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
  const RK = { open: ls.get('a13-rk-open', 'all'), era: ls.get('a13-rk-era', 'ALL'), mine: !!ls.get('a13-rk-mine', false), tab: ls.get('a13-rk-tab', 'ladder') };
  let REFRESH = null;
  let CNT = null;
  function stopRefresh() { if (REFRESH) { clearInterval(REFRESH); REFRESH = null; } if (CNT) { clearInterval(CNT); CNT = null; } }
  function rankedPage(app) {
    stopRefresh();
    if (RK.tab === 'games') RK.tab = 'ladder';   // casual rooms live in Head to Head now
    const signed = UI.profile.signedIn();
    app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">RANKED</div><h1 class="ch-hero-t">THE BOARDS.</h1>
        <p class="ch-hero-p">Every era has its own ladder. Win ranked Head to Head auctions to climb it, or play today's daily auction (the same pool for everyone) and see where your lineup lands.</p></section>
      ${signed ? '' : signInBox('PLAY RANKED')}
      <div class="rk-ctl"><label class="field"><span>ERA</span><select id="rkEra">${eraOpts(RK.era)}</select></label>
        <div class="ch-chips rk-scope"><button type="button" class="ch-chip${!RK.mine ? ' on' : ''}" data-scope="0">GLOBAL</button><button type="button" class="ch-chip${RK.mine ? ' on' : ''}" data-scope="1">MY REGION</button></div></div>
      <section class="rk-how"><div class="rk-how-t"><b>PLAY A RANKED MATCH</b><span class="muted">No code, no friend needed. You are paired with whoever is online and searching, the closest rating first. All-time pool.</span><span class="rk-cnt" id="rkCnt"></span></div>
        <div class="rk-find"><button type="button" class="btn btn-gold btn-big" id="rkFind"${signed ? '' : ' disabled'}>FIND A MATCH</button></div>
        <details class="rk-det"><summary>HOW RANKED WORKS</summary><ol>
          <li>You and one other signed-in player bid on a hidden pool of ten players from that era, a mix of stars and role players. It is a blind draft: no ratings until the series is over. You each get $20, bidding opens at $1 and goes up by $1 or more. Whoever passes lets the other have the player. Each of you ends with five, and every pick has a 24 second shot clock.</li>
          <li>Your five play a best-of-7 series, all five on the floor for 48 minutes. No duplicates: a player is gone once taken.</li>
          <li>The winner climbs that era's ladder and the loser drops (everyone starts at 1200; beating a higher rated player is worth more).</li>
          <li>The result only counts when both phones report the same score, so nobody can fake a win.</li>
          <li>Want to play a friend instead? Use Head to Head: it is casual and never touches the ladder.</li></ol></details></section>
      <div class="ch-chips rk-tabs"><button type="button" class="ch-chip${RK.tab === 'ladder' ? ' on' : ''}" data-tab="ladder">LADDER</button><button type="button" class="ch-chip${RK.tab === 'daily' ? ' on' : ''}" data-tab="daily">DAILY AUCTION</button></div>
      <div id="rkBody" class="rk-body"><p class="muted">Loading...</p></div>
      <div class="ch-go"><a class="btn" href="#/me">MY PROFILE</a><a class="btn" href="#/challenge/vs">HEAD TO HEAD</a></div>`;
    UI.profile.wire(app, () => rankedPage(app));
    const fb = UI.$('#rkFind', app); if (fb) fb.addEventListener('click', () => { location.hash = '#/ranked/find/' + 'ALL'; });
    const era = UI.$('#rkEra', app); era.addEventListener('change', () => { RK.era = era.value; ls.set('a13-rk-era', RK.era); rankedPage(app); });
    app.querySelectorAll('[data-scope]').forEach(b => b.addEventListener('click', () => { RK.mine = b.dataset.scope === '1'; ls.set('a13-rk-mine', RK.mine); rankedPage(app); }));
    app.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { RK.tab = b.dataset.tab; ls.set('a13-rk-tab', RK.tab); rankedPage(app); }));
    fill(app);
    const counts = async () => {   // how many are online in each mode
      const el = UI.$('#rkCnt', app);
      if (!el || !/^#\/ranked$/.test(location.hash)) { if (CNT) { clearInterval(CNT); CNT = null; } return; }
      try { const d = await UI.profile.rpc('online_counts'); el.textContent = d ? 'ONLINE NOW: ' + d.searching + ' SEARCHING FOR RANKED | ' + d.ranked + ' IN RANKED GAMES | ' + d.casual + ' CASUAL ROOMS OPEN' : ''; } catch (e) { /* the SQL is not run yet */ }
    };
    counts(); CNT = setInterval(counts, 10000);
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
      }
    } catch (e) { body.innerHTML = '<p class="rk-err">' + esc(failMsg(e)) + '</p>'; }
  }
  const nameCell = (r, me) => `<b>${UI.userLink(r.username)}</b>${me && r.username === me ? ' <span class="rk-tag">YOU</span>' : ''}${r.region ? ` <small class="muted">${esc(regionName(r.region))}</small>` : ''}`;
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
    era = ERAS.indexOf(era) >= 0 ? era : 'ALL';
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
      stopClock();
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
    const min = st.price + A.raise, max = C.aucMax(st, 0);
    if (DB.i !== st.i || DB.price !== st.price || DB.amt < min || DB.amt > max) { DB.i = st.i; DB.price = st.price; DB.amt = min; }
    const slots = i => Array.from({ length: per }, (_, k) => { const id = st.won[i][k]; const x = id && st.log.filter(l => l.id === id)[0]; return id ? `<li class="on"><span>${esc(byId[id] ? byId[id].name : '?')}${byId[id] && byId[id].season ? ' <small class="auc-yr">' + esc("'" + String(byId[id].season - 1).slice(2) + "-'" + String(byId[id].season).slice(2)) + '</small>' : ''}</span><b>${money(x ? x.price : 0)}</b></li>` : '<li class="empty"><span>OPEN</span></li>'; }).join('');
    const side = (i, cls, name) => `<aside class="auc-side ${cls}${st.turn === i ? ' turn' : ''}${st.holder === i ? ' holds' : ''}"><div class="auc-who"><small>${name}</small><b class="auc-cash">${money(A.budget - st.spent[i])}</b><small>${st.won[i].length} OF ${per} SPOTS</small></div><ol class="auc-slots">${slots(i)}</ol></aside>`;
    if (!st.until) st.until = Date.now() + DAILY_CLOCK * 1000;
    const quick = [A.raise, 2, 5].filter((v, k, a2) => a2.indexOf(v) === k && v >= A.raise).map(v => ({ to: st.price + v, label: '+' + money(v) })).filter(x => x.to >= min && x.to <= max);
    const tm = cur.colors || null;
    app.innerHTML = `${hdr}
      <div class="auc">${side(0, 'l', 'YOU')}
        <main class="auc-stage">
          <div class="vs-timer" id="vsTimer"><i style="--w:100%"></i><span>${Math.max(0, Math.ceil((st.until - Date.now()) / 1000))}</span></div>
          <section class="auc-card"><div class="auc-face">${UI.faceImg(cur, '#555')}</div>
            <div class="auc-info"><small>UP FOR BID</small><h2>${esc(cur.name)}</h2><p>${esc(C.posLabel(cur))}${cur.season ? ' | \'' + String(cur.season - 1).slice(2) + '-\'' + String(cur.season).slice(2) : ''} | <b class="ch-ovr ${UI.ovrClass(cur.ovr)}">${esc(cur.ovr)}</b></p></div>
            <div class="auc-price"><small>${st.holder === 0 ? 'YOU HOLD' : 'THE HOUSE HOLDS'}</small><b>${money(st.price)}</b></div></section>
          ${mine && !canRaise ? `<div class="auc-bid"><div class="auc-broke"><b>YOU CAN'T TOP ${money(st.price)}</b><span>You have ${money(A.budget - st.spent[0])}${per - st.won[0].length > 1 ? ' and must keep ' + money((per - st.won[0].length - 1) * A.start) + ' for your other open spots' : ''}, so the most you can bid is ${money(Math.max(0, max))}.</span></div><div class="auc-go"><button type="button" class="btn btn-big" disabled>BID<small>can't top ${money(st.price)}</small></button><button type="button" class="btn btn-gold btn-big" id="aucPass">PASS<small>${st.holder === 0 ? 'You get him' : 'The house gets him'} for ${money(st.price)}</small></button></div></div>` : `
          <div class="auc-bid"><div class="auc-maxline">YOUR MAX BID IS <b>${money(max)}</b> <span>${money(A.budget - st.spent[0])} left${per - st.won[0].length > 1 ? ', keeping ' + money((per - st.won[0].length - 1) * A.start) + ' for your other ' + (per - st.won[0].length - 1) + ' open spot' + (per - st.won[0].length - 1 > 1 ? 's' : '') : ''}</span></div><div class="auc-step"><button type="button" class="btn" id="aucDown"${DB.amt - A.raise < min ? ' disabled' : ''}>&minus;</button><div class="auc-amt"><small>YOUR BID</small><b>${money(DB.amt)}</b></div><button type="button" class="btn" id="aucUp"${DB.amt + A.raise > max ? ' disabled' : ''}>+</button></div>
            <div class="auc-chips">${quick.map(x => `<button type="button" class="ch-chip${DB.amt === x.to ? ' on' : ''}" data-to="${x.to}">${x.label}</button>`).join('')}<button type="button" class="ch-chip${DB.amt === max ? ' on' : ''}" data-to="${max}"${canRaise ? '' : ' disabled'}>ALL IN ${money(max)}</button></div>
            <div class="auc-go"><button type="button" class="btn btn-gold btn-big" id="aucRaise"${mine && canRaise ? '' : ' disabled'}>BID ${money(DB.amt)}</button><button type="button" class="btn btn-big" id="aucPass"${mine ? '' : ' disabled'}>PASS<small>${st.holder === 0 ? 'You get him' : 'The house gets him'} for ${money(st.price)}</small></button></div></div>`}
          <div class="auc-dots">${st.ids.map((id, k) => `<i class="${k < st.i ? 'sold' : k === st.i ? 'now' : ''}"></i>`).join('')}</div><p class="auc-more">${left} MORE IN THE HIDDEN POOL | ONE TRY A DAY</p>
        </main>${side(1, 'r', 'THE HOUSE')}</div>`;
    const go = (a, to) => {
      const before = st.log.length;
      if (!C.auctionAct(st, 0, a, to)) return;
      house(); st.until = Date.now() + DAILY_CLOCK * 1000; save(st.done); stopClock();
      const autos = st.log.slice(before).filter(x => x.auto);
      window.scrollTo(0, 0);
      if (autos.length) { stopClock(); UI.aucReveal(app, { entries: autos, byId, name: i => (i === 0 ? 'YOU' : 'THE HOUSE'), onDone: () => { st.until = Date.now() + DAILY_CLOCK * 1000; draw(app, era, day, st, byId, key, house, save); } }); return; }
      draw(app, era, day, st, byId, key, house, save);
    };
    const setAmt = v => { DB.amt = Math.max(min, Math.min(max, Math.round(v))); draw(app, era, day, st, byId, key, house, save); };
    const dn = UI.$('#aucDown', app); if (dn) dn.addEventListener('click', () => setAmt(DB.amt - A.raise));
    const up = UI.$('#aucUp', app); if (up) up.addEventListener('click', () => setAmt(DB.amt + A.raise));
    app.querySelectorAll('[data-to]').forEach(b => b.addEventListener('click', () => setAmt(+b.dataset.to)));
    const r = UI.$('#aucRaise', app); if (r) r.addEventListener('click', () => go('raise', DB.amt));
    const p = UI.$('#aucPass', app); if (p) p.addEventListener('click', () => go('pass'));
    // the shot clock: out of time means you pass
    stopClock();
    CLOCK = setInterval(() => {
      const el = UI.$('#vsTimer', app);
      if (!el || !/^#\/ranked\/daily/.test(location.hash)) { stopClock(); return; }
      const lf = st.until - Date.now();
      el.querySelector('span').textContent = Math.max(0, Math.ceil(lf / 1000));
      el.querySelector('i').style.setProperty('--w', Math.max(0, Math.min(100, 100 * lf / (DAILY_CLOCK * 1000))) + '%');
      el.classList.toggle('low', lf < 8000);
      if (lf <= 0 && mine) { stopClock(); UI.toast('Time. You pass.'); go('pass'); }
    }, 250);
  }
  const DB = { i: -1, price: -1, amt: 0 };
  const DAILY_CLOCK = 24;
  let CLOCK = null;
  function stopClock() { if (CLOCK) { clearInterval(CLOCK); CLOCK = null; } }

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
      const rep = await c.from('series_reports').select('lineup').order('created_at', { ascending: false }).limit(500);   // your own reports: the lineups you drafted
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
      const bl = row.best_lineup, tally = {};
      (rep.data || []).forEach(x => { const l = x.lineup; if (!l || !Array.isArray(l.names)) return; l.names.forEach((n, k) => { const se = l.seasons && l.seasons[k] || 0, key = n + '|' + se; tally[key] = (tally[key] || 0) + 1; }); });
      const most = Object.keys(tally).map(k => { const [n, se] = k.split('|'); return { n, se: +se, c: tally[k] }; }).sort((x, y) => y.c - x.c || x.n.localeCompare(y.n)).slice(0, 5);
      const yr = se => (se ? "'" + String(se - 1).slice(2) + "-'" + String(se).slice(2) : '');
      app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">PROFILE</div><h1 class="ch-hero-t">${esc(row.username || UI.profile.account()).toUpperCase()}</h1>
          <p class="ch-hero-p">${games.length ? W + '-' + L + ' in Head to Head series' + (streak > 1 ? ', ' + streak + ' ' + (games[0].won ? 'wins' : 'losses') + ' in a row' : '') + '.' : 'No series on your account yet. Play a friend in Head to Head while you are both signed in.'}</p></section>
        <div class="rk-cards"><div class="rk-card"><small>RECORD</small><b>${W}-${L}</b></div><div class="rk-card"><small>FAVORITE ERA</small><b>${fav ? esc(eraName(fav)) : '-'}</b></div><div class="rk-card pl"><small>MOST USED PLAYER</small>${most[0] ? `<b>${esc(most[0].n)}</b><span>${esc(yr(most[0].se) || 'ANY SEASON')} | ${most[0].c}x</span>` : '<b>-</b>'}</div></div>
        <div class="ch-step"><div class="ch-step-k">ABOUT YOU</div>
          <label class="field"><span>REGION (FOR THE REGION BOARDS)</span><select id="meRegion">${regionOpts(row.region)}</select></label>
          <label class="field"><span>FAVORITE ERA</span><select id="meFav"><option value="">${auto ? 'THE ERA I PLAY MOST (' + esc(eraName(auto)) + ')' : 'THE ERA I PLAY MOST'}</option>${eraOpts(row.fav_era || '___')}</select></label>
          <small class="muted">Your region is only what you pick here. Nothing reads your location.</small>
          <div class="ch-go"><button type="button" class="btn btn-gold" id="meSave">SAVE</button><span class="pf-msg" id="meMsg"></span></div></div>
        ${most.length ? `<div class="ch-step"><div class="ch-step-k">MOST DRAFTED</div>${table(['PLAYER', 'SEASON', 'TIMES'], most.map(m => [esc(m.n), esc(yr(m.se) || 'ANY'), '<b>' + m.c + '</b>']), true)}</div>` : ''}
        ${rat.data && rat.data.length ? `<div class="ch-step"><div class="ch-step-k">YOUR LADDER RATINGS</div>${table(['ERA', 'RATING', 'W-L'], rat.data.slice().sort((x, y) => y.rating - x.rating).map(r => [esc(eraName(r.era)), '<b>' + r.rating + '</b>', wl(r.wins, r.losses)]), true)}</div>` : ''}
        <div class="ch-step"><div class="ch-step-k">RIVALRIES</div>${rivals.length ? table(['VS', 'RECORD', ''], rivals.map(r => [UI.userLink(r.name), '<b>' + r.me + '-' + r.them + '</b>', r.me > r.them ? 'YOU LEAD' : r.me < r.them ? 'THEY LEAD' : 'TIED']), true) : '<p class="muted">Your rivalries show up here: one record for each friend you play, and one series counts for each draft.</p>'}</div>
        <div class="ch-go"><a class="btn btn-gold" href="#/ranked">RANKED</a><a class="btn" href="#/challenge/vs">HEAD TO HEAD</a></div>`;
      const save = UI.$('#meSave', app), msg = UI.$('#meMsg', app);
      save.addEventListener('click', async () => {
        save.disabled = true; msg.textContent = 'Saving...';
        const u = await c.from('profiles').update({ region: UI.$('#meRegion', app).value || null, fav_era: UI.$('#meFav', app).value || null }).eq('id', id);
        msg.textContent = u.error ? failMsg(u.error) : 'Saved.'; msg.className = 'pf-msg' + (u.error ? ' bad' : ''); save.disabled = false;
      });
    } catch (e) { app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">PROFILE</div><h1 class="ch-hero-t">YOUR PROFILE.</h1></section><p class="rk-err">${esc(failMsg(e))}</p>`; }
  }

  // ---------- #/ranked/find/ERA: a ranked match with no code ----------
  let FIND = null;
  function stopFind() { if (FIND) { clearInterval(FIND.t); clearInterval(FIND.t2); FIND = null; } }
  function findPage(app, era) {
    stopFind(); stopRefresh();
    era = ERAS.indexOf(era) >= 0 ? era : 'ALL';
    if (!UI.profile.signedIn()) { app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">RANKED MATCH | ${esc(eraName(era))}</div><h1 class="ch-hero-t">SIGN IN FIRST.</h1></section>${signInBox('PLAY RANKED')}<div class="ch-go"><a class="btn" href="#/ranked">BACK</a></div>`; UI.profile.wire(app, () => findPage(app, era)); return; }
    if (!UI.vsQuick) { app.innerHTML = '<p class="rk-err">Head to Head did not load.</p>'; return; }
    app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">RANKED MATCH | ${esc(eraName(era))}</div><h1 class="ch-hero-t" id="fgT">LOOKING FOR AN OPPONENT.</h1>
        <p class="ch-hero-p" id="fgP">Stay on this screen. When someone else looks for a ${esc(eraName(era))} ranked match, you are paired and the auction starts on its own. You never type a code.</p></section>
      <div class="ch-load"><div class="ch-spin-ring"></div></div>
      <p class="center rk-wait" id="fgInfo"></p>
      <div class="ch-go"><button type="button" class="btn" id="fgCancel">CANCEL</button></div>`;
    const me = UI.profile.account(), st0 = UI.vsQuick.status();
    if (st0.role) UI.vsQuick.leave();
    const F = FIND = { era, joinedAt: 0, t: null, t2: null, busy: false, rating: null, start: Date.now(), others: null, countAt: 0 };
    const WAITS = 'a13-rk-waits', waits = () => { try { return JSON.parse(localStorage.getItem(WAITS) || '[]'); } catch (e) { return []; } };
    const mmss = ms => Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0');
    const paint = () => {   // how long you have been looking, how many others are, and how long it usually takes
      const el = UI.$('#fgInfo', app); if (!el || FIND !== F) return;
      const w = waits(), avg = w.length ? Math.round(w.reduce((a, b) => a + b, 0) / w.length / 1000) : 0;
      el.innerHTML = 'WAITING <b>' + mmss(Date.now() - F.start) + '</b>' + (F.others == null ? '' : ' | <b>' + F.others + '</b> OTHER' + (F.others === 1 ? '' : 'S') + ' SEARCHING NOW') + (avg ? ' | USUALLY ABOUT <b>' + (avg < 60 ? avg + ' SEC' : Math.round(avg / 60) + ' MIN') + '</b>' : ' | NO ESTIMATE YET');
    };
    F.t2 = setInterval(paint, 1000); paint();
    const say = (t, p) => { const a = UI.$('#fgT', app), b = UI.$('#fgP', app); if (a) a.textContent = t; if (b && p) b.textContent = p; };
    UI.$('#fgCancel', app).addEventListener('click', () => { stopFind(); UI.vsQuick.leave(); location.hash = '#/ranked'; });
    const tick = async () => {
      if (FIND !== F || F.busy) return;
      if (!/^#\/ranked\/find/.test(location.hash)) { stopFind(); return; }
      F.busy = true;
      try {
        const st = UI.vsQuick.status();
        if (st.status === 'connected') { try { const w = waits(); w.push(Date.now() - F.start); localStorage.setItem(WAITS, JSON.stringify(w.slice(-8))); } catch (e) { /* private mode */ } stopFind(); location.hash = UI.vsQuick.target(); return; }
        UI.profile.rpc('queue_ping').catch(() => {});   // counts you as searching
        if (!F.warm) { F.warm = 1; prefetch(me); }
        if (Date.now() - F.countAt > 6000) { F.countAt = Date.now(); UI.profile.rpc('online_counts').then(d => { if (d) F.others = Math.max(0, (d.searching || 0) - 1); }).catch(() => {}); }
        const rows = await UI.profile.rpc('lobby_list');
        const cand = [];
        const all = (rows || []).filter(r => r.ranked && r.era === era && r.host_name !== me);
        for (const r of all) { if (!(await playedBefore(r.host_name))) cand.push(r); }   // new opponents first
        if (!cand.length) all.forEach(r => cand.push(r));   // nobody new is searching: you both searched, so a rematch is fine
        if (F.rating == null) { try { F.rating = (await ratingNow(era)).rating; } catch (e) { F.rating = 1200; } }
        all.slice(0, 4).forEach(r => prefetch(r.host_name));   // their cards are ready before the match
        cand.sort((a, b) => Math.abs((a.rating || 1200) - F.rating) - Math.abs((b.rating || 1200) - F.rating));   // whoever is online, the closest rating first
        if (!st.role) {
          if (cand[0]) { UI.vsQuick.join(cand[0].code, era); F.joinedAt = Date.now(); say('OPPONENT FOUND.', 'Connecting to ' + cand[0].host_name + '...'); }
          else { UI.vsQuick.host(era); say('WAITING FOR AN OPPONENT.', 'You are listed for a ranked ' + eraName(era) + ' match. This screen pairs you the moment someone else looks.'); }
        } else if (st.role === 'host' && st.status === 'waiting') {
          const other = cand.filter(r => r.code < st.code)[0];   // two people searching at once: the lower room code is the one that stays
          if (other) { UI.vsQuick.leave(); UI.vsQuick.join(other.code, era); F.joinedAt = Date.now(); say('OPPONENT FOUND.', 'Connecting to ' + other.host_name + '...'); }
        } else if (st.role === 'guest' && F.joinedAt && Date.now() - F.joinedAt > 25000) {
          UI.vsQuick.leave(); F.joinedAt = 0; say('LOOKING FOR AN OPPONENT.', 'That room did not answer. Looking again...');
        }
      } catch (e) { say('COULD NOT SEARCH.', failMsg(e)); stopFind(); }
      F.busy = false;
    };
    F.t = setInterval(tick, 2000);
    tick();
  }

  // ---------- #/u/NAME: another player's profile ----------
  async function userPage(app, name) {
    stopRefresh(); stopFind();
    if (!name) { location.hash = '#/ranked'; return; }
    app.innerHTML = '<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING ' + esc(name.toUpperCase()) + '...</div></section>';
    try {
      const d = await UI.profile.rpc('public_profile', { p_name: name });
      if (!d) { app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">PROFILE</div><h1 class="ch-hero-t">${esc(name.toUpperCase())}</h1></section><div class="rk-note"><b>${esc(name.toUpperCase())} IS A GUEST.</b><span class="muted">Guests play with a room code and a name, so they have no profile, no ladder rating and no friends list. They can make an account any time.</span></div><div class="ch-go"><a class="btn" href="#/ranked">RANKED</a><a class="btn" href="#/me">MY PROFILE</a></div>`; return; }
      if (d.self) { location.replace('#/me'); return; }
      const fav = d.fav_era || d.auto_era, bl = d.best_lineup, yr = se => (se ? "'" + String(se - 1).slice(2) + "-'" + String(se).slice(2) : '');
      const total = d.wins + d.losses, signed = UI.profile.signedIn();
      const fr = !signed ? '' : d.friend === 'friends' ? '<span class="vs-fr ok">&#10003; FRIENDS</span>' : d.friend === 'sent' ? '<span class="muted">REQUEST SENT</span>' : `<button type="button" class="btn btn-gold" id="uAdd">${d.friend === 'incoming' ? 'ACCEPT FRIEND REQUEST' : 'ADD AS FRIEND'}</button>`;
      app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">PROFILE${d.region ? ' | ' + esc(regionName(d.region).toUpperCase()) : ''}</div><h1 class="ch-hero-t">${esc(d.username).toUpperCase()}</h1>
          <p class="ch-hero-p">${total ? d.wins + '-' + d.losses + ' in Head to Head series.' : 'No series on this account yet.'}</p></section>
        <div class="ch-go u-act">${fr}${signed ? `<a class="btn" href="#/ranked/find/ALL">PLAY RANKED</a>` : ''}</div>
        <div class="rk-cards"><div class="rk-card"><small>RECORD</small><b>${d.wins}-${d.losses}</b></div><div class="rk-card"><small>FAVORITE ERA</small><b>${fav ? esc(eraName(fav)) : '-'}</b></div><div class="rk-card pl"><small>MOST USED PLAYER</small>${d.most && d.most[0] ? `<b>${esc(d.most[0].name)}</b><span>${esc(yr(d.most[0].season) || 'ANY SEASON')} | ${d.most[0].count}x</span>` : '<b>-</b>'}</div></div>
        <div class="rk-cards two"><div class="rk-card"><small>FRIENDS</small><b>${d.friends || 0}</b></div><div class="rk-card"><small>MUTUAL FRIENDS</small><b>${signed ? d.mutual_count || 0 : '-'}</b></div></div>
        ${d.mutual && d.mutual.length ? `<div class="ch-step"><div class="ch-step-k">FRIENDS YOU SHARE</div><p class="rk-lineup">${d.mutual.map(n => `<span>${UI.userLink(n)}</span>`).join('')}</p></div>` : ''}
        ${d.vs ? `<div class="ch-step"><div class="ch-step-k">YOU VS ${esc(d.username.toUpperCase())}</div><p class="rk-vs"><b>${d.vs.me}</b><span>-</span><b>${d.vs.them}</b></p><small class="muted">${d.vs.me > d.vs.them ? 'You lead the rivalry.' : d.vs.me < d.vs.them ? 'They lead the rivalry.' : 'Tied.'} One series counts for each draft.</small></div>` : ''}
        ${d.ratings && d.ratings.length ? `<div class="ch-step"><div class="ch-step-k">LADDER RATINGS</div>${table(['ERA', 'RATING', 'RANK', 'W-L'], d.ratings.map(r => [esc(eraName(r.era)), '<b>' + r.rating + '</b>', '#' + r.rank + (r.of ? ' of ' + r.of : ''), wl(r.wins, r.losses)]), true)}</div>` : ''}
        ${d.most && d.most.length ? `<div class="ch-step"><div class="ch-step-k">MOST DRAFTED</div>${table(['PLAYER', 'SEASON', 'TIMES'], d.most.map(m => [esc(m.name), esc(yr(m.season) || 'ANY'), '<b>' + m.count + '</b>']), true)}</div>` : ''}
        <div class="ch-go"><a class="btn" href="#/ranked">RANKED</a><a class="btn" href="#/me">MY PROFILE</a></div>`;
      const add = UI.$('#uAdd', app);
      if (add) add.addEventListener('click', () => { add.disabled = true; UI.profile.addFriend(d.username).then(st => { UI.toast(st === 'friends' ? 'You are now friends with ' + d.username + '.' : 'Friend request sent to ' + d.username + '.'); userPage(app, name); }).catch(() => { add.disabled = false; UI.toast('Could not send the request.', 'error'); }); });
    } catch (e) { app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">PROFILE</div><h1 class="ch-hero-t">${esc(name.toUpperCase())}</h1></section><p class="rk-err">${esc(failMsg(e))}</p>`; }
  }

  // the casual rooms list, shown on the Head to Head page: open games waiting for a second player (ranked searches are never listed)
  UI.ranked.casualRooms = function (box) {
    let t = null;
    const draw = async () => {
      if (!box.isConnected) { clearInterval(t); return; }
      try {
        const rows = ((await UI.profile.rpc('lobby_list')) || []).filter(r => !r.ranked), mine = UI.profile.account();
        box.innerHTML = '<div class="ts-start-k">CASUAL ROOMS</div><small class="muted">Open games waiting for a second player. They never touch the ladder, and guests can join.</small>' +
          (rows.length ? table(['HOST', 'ERA', 'STYLE', ''], rows.map(r => [UI.userLink(r.host_name), esc(eraName(r.era)), esc(String(r.style).toUpperCase()), r.host_name === mine ? '<span class="muted">YOU</span>' : `<a class="btn btn-small btn-gold" href="#/challenge/vs/join/${esc(r.code)}">JOIN</a>`]), true) : '<p class="muted">No casual rooms open right now. Host online and tick Open game to list yours here.</p>');
      } catch (e) { box.innerHTML = ''; }
    };
    draw(); t = setInterval(draw, 10000);
  };
  P.u = function (app, arg) { return userPage(app, decodeURIComponent(String(arg || '').split('/')[0])); };

  P.ranked = function (app, arg) {
    const part = String(arg || '').split('/');
    if (part[0] === 'find') return findPage(app, part[1] ? decodeURIComponent(part[1]) : RK.era);
    if (part[0] === 'result') return resultPage(app);
    if (part[0] === 'daily') return dailyPage(app, part[1] ? decodeURIComponent(part[1]) : RK.era);
    return rankedPage(app);
  };
  P.me = function (app) { return mePage(app); };
  window.addEventListener('hashchange', () => { if (!/^#\/ranked/.test(location.hash)) { stopRefresh(); stopFind(); } });
})();
