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
  // the daily turns over at midnight Pacific for everyone
  const PT = { timeZone: 'America/Los_Angeles' };
  const today = () => new Date().toLocaleDateString('en-CA', PT);
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 1; };
  const REGIONS = [['', 'NOT SET'], ['US', 'United States']].concat(
    [['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'Washington DC'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming']].map(([c, n]) => ['US-' + c, '   ' + n]),
    [['CA', 'Canada'], ['MX', 'Mexico'], ['GB', 'United Kingdom'], ['IE', 'Ireland'], ['FR', 'France'], ['DE', 'Germany'], ['ES', 'Spain'], ['IT', 'Italy'], ['PT', 'Portugal'], ['NL', 'Netherlands'], ['BE', 'Belgium'], ['CH', 'Switzerland'], ['SE', 'Sweden'], ['NO', 'Norway'], ['DK', 'Denmark'], ['FI', 'Finland'], ['PL', 'Poland'], ['GR', 'Greece'], ['TR', 'Turkey'], ['RS', 'Serbia'], ['HR', 'Croatia'], ['SI', 'Slovenia'], ['LT', 'Lithuania'], ['NG', 'Nigeria'], ['GH', 'Ghana'], ['ZA', 'South Africa'], ['EG', 'Egypt'], ['IL', 'Israel'], ['AE', 'United Arab Emirates'], ['IN', 'India'], ['PH', 'Philippines'], ['CN', 'China'], ['JP', 'Japan'], ['KR', 'South Korea'], ['AU', 'Australia'], ['NZ', 'New Zealand'], ['BR', 'Brazil'], ['AR', 'Argentina'], ['DO', 'Dominican Republic'], ['PR', 'Puerto Rico'], ['JM', 'Jamaica'], ['OTHER', 'Somewhere else']]);
  const seasonTag = se => (se ? "'" + String(se - 1).slice(2) + "-'" + String(se).slice(2) : '');

  // ---------- rank tiers: Bronze to Legend, three divisions each up to Diamond (III is the lowest, I the highest). Everyone starts at 1200. ----------
  const TIER_DEF = [['BRONZE', '#cd7f32', [0, 1100, 1150]], ['SILVER', '#c4ccd6', [1200, 1250, 1300]], ['GOLD', '#f2c230', [1350, 1400, 1450]], ['PLATINUM', '#4fd6c7', [1500, 1550, 1600]], ['DIAMOND', '#5eb8ff', [1650, 1700, 1750]]];
  const TIER_TOP = [['MASTER', '#c47bff', 1800], ['GRANDMASTER', '#ff5d5d', 1900], ['LEGEND', '#ffb347', 2000]];
  const ROMAN = ['III', 'II', 'I'];
  const TIERS = [];
  TIER_DEF.forEach(t => t[2].forEach((f, i) => TIERS.push({ name: t[0] + ' ' + ROMAN[i], base: t[0], color: t[1], floor: f })));
  TIER_TOP.forEach(t => TIERS.push({ name: t[0], base: t[0], color: t[1], floor: t[2] }));
  function tierOf(r) {
    r = +r || 0;
    let k = 0; for (let i = 0; i < TIERS.length; i++) if (r >= TIERS[i].floor) k = i;
    const cur = TIERS[k], nxt = TIERS[k + 1] || null;
    return Object.assign({}, cur, { idx: k, next: nxt, pct: nxt ? Math.round(100 * (r - cur.floor) / (nxt.floor - cur.floor)) : 100 });
  }

  // ---------- rank icons: a shield for Bronze to Gold, a gem for Platinum and Diamond, a star for Master, a ringed star for Grandmaster and a crown for Legend; pips show the division ----------
  let ICN = 0;
  const mix = (hex, to, k) => { const n = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), a = n(hex), b = n(to); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
  function iconSvg(t, size) {
    const id = 'ti' + (++ICN), c = t.color, hi = mix(c, '#ffffff', 0.45), lo = mix(c, '#000000', 0.45);
    const shape = t.base === 'BRONZE' || t.base === 'SILVER' || t.base === 'GOLD' ? '<path d="M32 4 L56 12 V32 C56 46 46 56 32 61 C18 56 8 46 8 32 V12 Z"/><path d="M32 12 L49 18 V32 C49 42 42 49 32 53 C22 49 15 42 15 32 V18 Z" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="2"/>'
      : t.base === 'PLATINUM' || t.base === 'DIAMOND' ? '<path d="M32 4 L58 24 L32 60 L6 24 Z"/><path d="M6 24 H58 M32 4 L22 24 L32 60 L42 24 Z" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="2"/>'
      : t.base === 'MASTER' ? '<path d="M32 3 L40 24 L62 25 L45 39 L51 61 L32 49 L13 61 L19 39 L2 25 L24 24 Z"/>'
      : t.base === 'GRANDMASTER' ? '<circle cx="32" cy="32" r="29" fill="none" stroke="url(#' + id + ')" stroke-width="4"/><path d="M32 9 L38 26 L56 27 L42 38 L47 55 L32 45 L17 55 L22 38 L8 27 L26 26 Z"/>'
      : '<path d="M5 50 L9 18 L23 33 L32 10 L41 33 L55 18 L59 50 Z"/><rect x="5" y="52" width="54" height="6"/>';
    const div = t.name.endsWith(' III') ? 1 : t.name.endsWith(' II') ? 2 : t.name.endsWith(' I') ? 3 : 0;
    const pips = div ? Array.from({ length: div }, (_, i) => '<circle cx="' + (32 + (i - (div - 1) / 2) * 9) + '" cy="36" r="3.2" fill="#fff" stroke="#000" stroke-opacity=".35"/>').join('') : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="' + size + '" height="' + size + '" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + hi + '"/><stop offset=".55" stop-color="' + c + '"/><stop offset="1" stop-color="' + lo + '"/></linearGradient></defs><g fill="url(#' + id + ')" stroke="' + lo + '" stroke-width="1.5" stroke-linejoin="round">' + shape + '</g>' + pips + '</svg>';
  }
  const tierIcon = (r, size) => '<span class="tier-ic">' + iconSvg(tierOf(r), size || 20) + '</span>';
  const tierBadge = r => { const t = tierOf(r); return `<span class="tier" style="--tc:${t.color}">${iconSvg(t, 16)}${esc(t.name)}</span>`; };
  // a profile picture is a team logo the player picked, or the first letter of the name
  // a profile picture is a rank icon (your current rank by default, or any rank you have reached) or a team logo
  const avatarHtml = (val, name, size, rating) => {
    if (val && val.indexOf('rank:') !== 0) return `<span class="pf-av logo" style="--sz:${size}px">${UI.logo(val, size)}</span>`;
    const k = val ? val.slice(5) : 'auto', t = k === 'auto' ? tierOf(rating || 1200) : (TIERS.find(x => x.name === k) || tierOf(1200));
    return `<span class="pf-av rank" style="width:${size}px;height:${size}px" title="${esc(t.name)}">${iconSvg(t, Math.round(size * 0.82))}</span>`;
  };

  // ---------- seasons: no end date yet (the game has not launched), so the ladder just keeps going. When a season ends, supabase/community.sql has reset_season() to pull ratings back toward 1200. ----------
  const SEASON = { n: 1, name: 'SEASON 1', ends: null };
  const seasonLine = () => SEASON.ends ? SEASON.name + ' ENDS ' + SEASON.ends : SEASON.name;

  // ---------- share cards: a picture of a rank, a result or a daily score ----------
  function cardCanvas(o) {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
    const g = c.getContext('2d'), F = 'Oswald, Impact, "Arial Narrow", sans-serif', col = o.color || '#d4af37';
    g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, 1080, 1350);
    const rg = g.createRadialGradient(540, 620, 40, 540, 620, 760); rg.addColorStop(0, col + '66'); rg.addColorStop(1, '#0a0a0a00'); g.fillStyle = rg; g.fillRect(0, 0, 1080, 1350);
    g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(40, 40, 1000, 1270);
    g.textAlign = 'center';
    g.fillStyle = '#d4af37'; g.font = '700 56px ' + F; g.fillText('STARTING FIVE', 540, 140);
    g.fillStyle = '#9a9a9a'; g.font = '500 40px ' + F; g.fillText(o.k || '', 540, 240);
    const dy = o.iconImg ? 90 : 0;
    if (o.iconImg) g.drawImage(o.iconImg, 430, 270, 220, 220);
    g.fillStyle = col; g.font = '700 118px ' + F; g.fillText(o.title || '', 540, 520 + dy);
    g.fillStyle = '#ffffff'; g.font = '700 230px ' + F; g.fillText(o.big || '', 540, 810 + dy);
    g.fillStyle = '#bdbdbd'; g.font = '500 48px ' + F; g.fillText(o.sub || '', 540, 905 + dy);
    g.fillStyle = '#ffffff'; g.font = '700 64px ' + F; g.fillText(String(o.name || '').toUpperCase(), 540, 1070);
    g.fillStyle = '#7a7a7a'; g.font = '500 36px ' + F; g.fillText(location.host + location.pathname.replace(/index\.html$/, ''), 540, 1250);
    return c;
  }
  // sharing is just the text and link, copied (no picture)
  async function shareCard(o, text, hash) {
    const all = text + '\n' + location.origin + location.pathname + (hash || '');
    try { await navigator.clipboard.writeText(all); UI.toast('Copied. Paste it anywhere.'); }
    catch (e) {
      const t = document.createElement('textarea'); t.value = all; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (x) { /* no copy */ } t.remove();
      UI.toast(ok ? 'Copied. Paste it anywhere.' : all);
    }
    return 'copied';
  }

  // ---------- the daily streak: counted from the daily auctions you finished on this device (so earlier plays count too) ----------
  const dayBefore = d => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
  function dailyDays() {
    const days = new Set();
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i), m = /^a13-rk-d-(\d{4}-\d\d-\d\d)-T$/.exec(k || ''); if (m) { const v = JSON.parse(localStorage.getItem(k) || 'null'); if (v && (v.fin || v.sent)) days.add(m[1]); } } } catch (e) { /* private mode */ }
    return days;
  }
  const streakBump = () => {};   // nothing to store: the finished auctions are the record
  function streakNow() {
    const days = dailyDays(), d = today(), done = days.has(d);
    let n = 0, x = done ? d : dayBefore(d);
    while (days.has(x)) { n++; x = dayBefore(x); }
    let best = 0, run = 0, prev = '';
    [...days].sort().forEach(k => { run = prev && dayBefore(k) === prev ? run + 1 : 1; best = Math.max(best, run); prev = k; });
    return { n, done, best: Math.max(best, n) };
  }
  // the daily record on a profile: how many played, the average and best percentage of a perfect five, and the streaks
  const dailyBlock = dd => !dd || !dd.played ? '' : `<div class="ch-step"><div class="ch-step-k">DAILY AUCTION</div>
      <div class="rk-cards"><div class="rk-card"><small>PLAYED</small><b>${dd.played}</b></div><div class="rk-card"><small>AVERAGE</small><b>${dd.avg_pct != null ? dd.avg_pct + '%' : '-'}</b></div><div class="rk-card"><small>BEST</small><b>${dd.best_pct != null ? dd.best_pct + '%' : '-'}</b></div></div>
      <div class="rk-cards two"><div class="rk-card"><small>STREAK</small><b>${dd.streak || 0}</b></div><div class="rk-card"><small>BEST STREAK</small><b>${dd.best_streak || 0}</b></div></div></div>`;
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
      <p class="ch-hero-p">${last.forfeit === 'win' ? 'They did not return in time. Recording it...' : 'Waiting for both scores...'}</p></section>
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
      const tb = tierOf(b.rating), ta = tierOf(now.rating);
      const rk = now.of ? `#${now.rank} of ${now.of} in ${esc(eraName(last.era))}` : '';
      app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">RANKED | ${esc(eraName(last.era))} | VS ${esc(last.opp || '')}</div><h1 class="ch-hero-t">${last.forfeit === 'win' ? 'WIN BY FORFEIT.' : last.forfeit === 'loss' ? 'YOU FORFEITED.' : won ? 'YOU WON.' : 'YOU LOST.'}</h1></section>
        <section class="rk-elo ${won ? 'up' : 'down'}"><small>RATING</small>
          <div class="rk-elo-n"><span class="rk-elo-from">${b.rating}</span><span class="rk-elo-arrow">${won ? '&#9650;' : '&#9660;'}</span><b id="rkEloNow">${b.rating}</b></div>
          <div class="rk-elo-d">${d > 0 ? '+' : ''}${d}</div>
          <div class="rk-tier">${tierIcon(now.rating, 96)}${tierBadge(now.rating)}${ta.next ? `<div class="rk-bar"><i style="--w:${ta.pct}%"></i></div><small class="muted">${ta.next.floor - now.rating} POINTS TO ${esc(ta.next.name)}</small>` : '<small class="muted">THE TOP RANK</small>'}</div>
          ${ta.idx !== tb.idx ? `<div class="rk-promo ${ta.idx > tb.idx ? 'up' : 'down'}">${ta.idx > tb.idx ? 'RANK UNLOCKED: ' : 'DROPPED TO '}${esc(ta.name)}</div>` : ''}
          <button type="button" class="btn btn-small${ta.idx > tb.idx ? ' btn-gold' : ''}" id="rkShare">${ta.idx > tb.idx ? 'SHARE YOUR NEW RANK' : 'SHARE THIS RESULT'}</button>
          <div class="rk-elo-meta"><span>${now.wins}-${now.losses} ranked this era</span>${rk ? `<span>${rk}</span>` : ''}${b.rank && now.rank !== b.rank ? `<span>${now.rank < b.rank ? 'UP' : 'DOWN'} ${Math.abs(b.rank - now.rank)} PLACE${Math.abs(b.rank - now.rank) > 1 ? 'S' : ''}</span>` : ''}</div></section>${acts}`;
      if (ta.idx > tb.idx && window.SFX) setTimeout(() => window.SFX.play('crowd'), 500);
      const shareBtn = UI.$('#rkShare', app);
      if (shareBtn) shareBtn.addEventListener('click', async () => {
        const up = ta.idx > tb.idx, me0 = UI.profile.account() || '';
        const o = up ? { tier: ta, k: 'RANK UNLOCKED', title: ta.name, color: ta.color, big: String(now.rating), sub: 'RATING | ' + eraName(last.era).toUpperCase(), name: me0 }
          : { tier: ta, k: (won ? 'RANKED WIN' : 'RANKED RESULT') + ' | VS ' + String(last.opp || '').toUpperCase(), title: ta.name, color: ta.color, big: (d > 0 ? '+' : '') + d, sub: 'NOW ' + now.rating + ' RATING', name: me0 };
        shareBtn.disabled = true;
        const r = await shareCard(o, 'Starting Five Ranked \u{1F3C0}\n' + (up ? 'Reached ' + ta.name + ' | ' + now.rating : ta.name + ' | ' + now.rating + ' (' + (d > 0 ? '+' : '') + d + ')'), '#/ranked');
        shareBtn.disabled = false; 
      });
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
      UI.ranked.lastErr = '';
      const ok = await UI.profile.rpc('concede_series', { p_key: info.key });
      if (!ok) UI.ranked.lastErr = 'both phones need to have logged the game start (it starts when the auction opens)';
      if (ok) { const cur = lastGet() || { key: info.key, era: info.era, opp: info.opp, bestOf: info.bestOf, before: { rating: 1200, games: 0 }, at: Date.now() }; cur.forfeit = 'loss'; lastSet(cur); }
      return !!ok;
    } catch (e) { UI.ranked.lastErr = failMsg(e); console.warn('[ranked] could not record the forfeit:', failMsg(e)); return false; }
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
  const RATINGS = {};
  async function lobbyCard(name, era, mine) {
    let d = null;
    let slow = false;
    try { d = await Promise.race([cardData(name), new Promise(r => setTimeout(() => { slow = true; r(null); }, 6000))]); } catch (e) { /* shown without the numbers */ }
    if (slow) delete CARDS[String(name).toLowerCase()];   // gave up waiting: the retry button asks again
    if (!d) return `<div class="lb-card${mine ? ' me' : ''}"><div class="lb-av">${esc(String(name).slice(0, 1).toUpperCase())}</div><b class="lb-n">${esc(name)}</b><small class="lb-sub">${mine ? 'YOU' : 'OPPONENT'}</small><small class="muted">${slow ? 'COULD NOT LOAD THE STATS.' : 'NO PROFILE NUMBERS YET'}</small>${slow ? '<button type="button" class="btn btn-small" data-lbretry="1">TRY AGAIN</button>' : ''}</div>`;
    const r = (d.ratings || []).find(x => x.era === era), m = d.most && d.most[0];
    RATINGS[String(name).toLowerCase()] = r ? r.rating : 1200;
    return `<div class="lb-card${mine ? ' me' : ''}">${avatarHtml(d.avatar, d.username || name, 56, r ? r.rating : 1200)}<b class="lb-n">${esc(d.username || name)}</b>
      <small class="lb-sub">${mine ? 'YOU' : 'OPPONENT'}${d.region ? ' | ' + esc(regionName(d.region)) : ''}</small>
      <div class="lb-elo"><small>${esc(eraName(era))} RATING</small>${tierIcon(r ? r.rating : 1200, 44)}<b>${r ? r.rating : 1200}</b>${tierBadge(r ? r.rating : 1200)}<small>${r && r.of ? '#' + r.rank + ' of ' + r.of : 'NOT RANKED YET'}</small></div>
      <div class="lb-st"><span><b>${r ? r.wins + '-' + r.losses : '0-0'}</b><small>RANKED</small></span><span><b>${(d.wins || 0) + '-' + (d.losses || 0)}</b><small>ALL SERIES</small></span><span><b>${d.friends || 0}</b><small>FRIENDS</small></span></div>
      ${m ? `<div class="lb-most"><small>MOST USED PLAYER</small><b>${esc(m.name)}</b><small>${esc(seasonTag(m.season))}</small></div>` : ''}
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
  UI.ranked = { tierIcon, ratingOf: n => RATINGS[String(n).toLowerCase()], streak: streakNow, tierOf, tierBadge, avatarHtml, eraOf, lineupScore, report, started, forfeit, concede, noteForfeit, playedBefore, lobbyCard, prefetch, lobbyStart, lobbyStop, ERAS, eraName, regionName, REGIONS };

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
  const signInBox = what => `<div class="rkn"><b>SIGN IN TO ${what}.</b><span class="muted"> Ranked results, rivalries and your profile live on your account.</span><button type="button" class="btn btn-gold" data-pf="open">SIGN IN OR CREATE ACCOUNT</button></div>`;

  // ---------- #/ranked ----------
  const RK = { open: ls.get('a13-rk-open', 'all'), era: ls.get('a13-rk-era', 'ALL'), mine: !!ls.get('a13-rk-mine', false) };
  let REFRESH = null;
  let CNT = null;
  function stopRefresh() { if (REFRESH) { clearInterval(REFRESH); REFRESH = null; } if (CNT) { clearInterval(CNT); CNT = null; } }
  function rankedPage(app) {
    stopRefresh();
    const signed = UI.profile.signedIn();
    app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">RANKED | ${esc(seasonLine())}</div><h1 class="ch-hero-t">THE BOARDS.</h1>
        <p class="ch-hero-p">Win ranked auctions to climb. Play the daily for a score.</p><p class="muted rk-legal"><a href="#/terms">Fair play and Terms</a> | <a href="#/privacy">Privacy</a></p></section>
      ${signed ? '<section class="rk-mine" id="rkMine"></section>' : signInBox('PLAY RANKED')}
      <section class="rk-how"><div class="rk-how-t"><b>PLAY A RANKED MATCH</b><span class="muted">Paired with the closest rating searching now.</span><span class="rk-cnt" id="rkCnt"></span></div>
        <div class="rk-find"><button type="button" class="btn btn-gold btn-big" id="rkFind"${signed ? '' : ' disabled'}>FIND A MATCH</button></div>
        <div class="rk-notify" id="rkNotify"></div>
        <button type="button" class="btn btn-small" id="rkTourBtn">TAKE THE TOUR</button>
        <details class="rk-det"><summary>HOW RANKED WORKS</summary><ol>
          <li>Bid on ten hidden players. $20 each, bids start at $1, 24 seconds a bid, five players each. Ratings stay hidden until the series ends.</li>
          <li>Best of 7. All five play every minute.</li>
          <li>Win to climb, lose to drop. Beating higher ratings pays more.</li>
          <li>Both phones must report the same score.</li>
          <li>Friends? Use Head to Head (casual).</li></ol></details></section>
      <div class="rk-ctl"><label class="field"><span>ERA</span><select id="rkEra">${eraOpts(RK.era)}</select></label>
        <div class="ch-chips rk-scope"><button type="button" class="ch-chip${!RK.mine ? ' on' : ''}" data-scope="0">GLOBAL</button><button type="button" class="ch-chip${RK.mine ? ' on' : ''}" data-scope="1">MY REGION</button></div></div>
      <details class="rk-det rk-ranks"><summary>THE RANKS</summary>
        <p class="muted">Everyone starts at 1200, the bottom of Silver. Divisions run III (lowest) to I. ${esc(seasonLine())}.</p>
        <div class="rk-rk">${TIERS.map((t, i) => `<span class="rk-rk-i"><span class="tier" style="--tc:${t.color}">${iconSvg(t, 16)}${esc(t.name)}</span><small>${t.floor ? t.floor + (TIERS[i + 1] ? ' TO ' + (TIERS[i + 1].floor - 1) : ' AND UP') : 'UNDER ' + TIERS[i + 1].floor}</small></span>`).join('')}</div></details>
      <div id="rkBody" class="rk-body"><p class="muted">Loading...</p></div>
      <div class="ch-go"><a class="btn" href="#/me">MY PROFILE</a><a class="btn" href="#/challenge/vs">HEAD TO HEAD</a></div>`;
    UI.profile.wire(app, () => rankedPage(app));
    const fb = UI.$('#rkFind', app); if (fb) fb.addEventListener('click', () => { location.hash = '#/ranked/find/' + 'ALL'; });
    const era = UI.$('#rkEra', app); era.addEventListener('change', () => { RK.era = era.value; ls.set('a13-rk-era', RK.era); rankedPage(app); });
    app.querySelectorAll('[data-scope]').forEach(b => b.addEventListener('click', () => { RK.mine = b.dataset.scope === '1'; ls.set('a13-rk-mine', RK.mine); rankedPage(app); }));
    fill(app);
    const counts = async () => {   // how many are online in each mode
      const el = UI.$('#rkCnt', app);
      if (!el || !/^#\/ranked$/.test(location.hash)) { if (CNT) { clearInterval(CNT); CNT = null; } return; }
      try { const d = await UI.profile.rpc('online_counts'); el.textContent = d ? d.searching + ' SEARCHING | ' + d.ranked + ' PLAYING | ' + d.casual + ' CASUAL ROOMS' : ''; } catch (e) { /* the SQL is not run yet */ }
    };
    counts(); CNT = setInterval(counts, 10000);
    const tb = UI.$('#rkTourBtn', app); if (tb) tb.addEventListener('click', () => openTour());
    if (signed) { let seen = false; try { seen = localStorage.getItem(TOURKEY) === '1'; } catch (e) { seen = true; } if (!seen) setTimeout(() => { if (/^#\/ranked$/.test(location.hash)) openTour(); }, 700); }
    const nt = UI.$('#rkNotify', app);
    if (nt && 'Notification' in window) {
      const paintN = () => {
        const on = UI.ranked.notify.enabled();
        nt.innerHTML = `<button type="button" class="btn btn-small${on ? ' btn-gold' : ''}" id="rkNote">${on ? 'NOTIFICATIONS ON' : 'NOTIFY ME'}</button>`;
        UI.$('#rkNote', nt).addEventListener('click', async () => {
          if (UI.ranked.notify.enabled()) UI.ranked.notify.disable(); else { const r = await UI.ranked.notify.enable(); if (r !== 'granted') UI.toast('Allow notifications in your browser to turn this on.', 'error'); }
          paintN();
        });
      };
      paintN();
    }
    const mine = UI.$('#rkMine', app);
    if (mine) ratingNow('ALL').then(r => {   // your rank, how far to the next one, and your streak
      const t = tierOf(r.rating), sk = streakNow();
      mine.innerHTML = `<div class="rk-mine-t">${tierIcon(r.rating, 56)}${tierBadge(r.rating)}<b>${r.rating}</b><small>${r.games ? r.wins + '-' + r.losses + ' RANKED' : 'NO RANKED GAMES YET'}${r.of ? ' | #' + r.rank + ' OF ' + r.of : ''}</small></div>
        ${t.next ? `<div class="rk-bar wide"><i style="--w:${t.pct}%"></i></div><small class="muted">${t.next.floor - r.rating} POINTS TO ${esc(t.next.name)}</small>` : '<small class="muted">THE TOP RANK</small>'}`;
    }).catch(() => { mine.remove(); });
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
        if (!region) { body.innerHTML = '<div class="rkn"><b>NO REGION SET.</b><span class="muted"> Pick your country (or US state) on your profile to see your region.</span><a class="btn btn-gold" href="#/me">MY PROFILE</a></div>'; return; }
      }
      const scope = RK.mine ? ' in ' + regionName(region) : '';
      {
        const rows = await UI.profile.rpc('lb_ratings', { p_era: RK.era, p_region: region || null, p_limit: 100 }), meName = UI.profile.account();
        const tbl = f => { const l = rows.map((r, i) => [i + 1, r]).filter(x => !f || x[1].username.toLowerCase().indexOf(f) >= 0); return l.length ? table(['#', 'PLAYER', 'RANK', 'RATING', 'W-L'], l.map(([i, r]) => [i, nameCell(r, meName), tierBadge(r.rating), '<b>' + r.rating + '</b>', wl(r.wins, r.losses)])) : '<p class="muted">Nobody by that name on this ladder.</p>'; };
        body.innerHTML = `<p class="muted rk-sub">${esc(eraName(RK.era))} ladder${esc(scope)}. Everyone starts at 1200.</p>` + (rows.length ? `<div class="rk-search"><input id="rkSearch" maxlength="16" placeholder="FIND A PLAYER" autocomplete="off" autocapitalize="off" spellcheck="false">${meName && rows.some(r => r.username === meName) ? '<button type="button" class="btn btn-small" id="rkFindMe">FIND ME</button>' : ''}</div><div id="rkLadder">${tbl('')}</div>` : '<p class="muted">Nobody is on this ladder yet. Win a ranked auction to be the first.</p>');
        const se = UI.$('#rkSearch', body), lad = UI.$('#rkLadder', body);
        if (se) se.addEventListener('input', () => { lad.innerHTML = tbl(se.value.trim().toLowerCase()); });
        const fm = UI.$('#rkFindMe', body); if (fm) fm.addEventListener('click', () => { se.value = ''; lad.innerHTML = tbl(''); const row = [...lad.querySelectorAll('tr')].find(t => t.innerText.indexOf('YOU') >= 0); if (row) { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); row.classList.add('rk-me'); } });
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
  // the best lineup score from any five of the day's ten players (every player free): the 100% mark of the daily
  function perfectOf(ten, per) {
    let best = -1;
    const pick = (from, chosen) => {
      if (chosen.length === per) { const sc = UI.ranked.lineupScore(chosen); if (sc != null && sc > best) best = sc; return; }
      for (let k = from; k <= ten.length - (per - chosen.length); k++) { chosen.push(ten[k]); pick(k + 1, chosen); chosen.pop(); }
    };
    pick(0, []);
    return best;
  }
  const PERF = {};

  // ---------- daily themes: every day is one theme, strictly (all ten players come from it): a current team, a famous season, a franchise's best ever, a decade, or a type of player ----------
  const FAMOUS = [
    ['CHI', 1996, 'The 72 win team'], ['GSW', 2016, '73 wins and a Finals heartbreak'], ['BOS', 1986, 'Bird, McHale and Parish'], ['LAL', 2001, 'Shaq, Kobe and a 15-1 playoff run'],
    ['SAS', 2014, 'Beautiful basketball'], ['MIA', 2013, '27 wins in a row'], ['CLE', 2016, 'Down 3-1 and back'], ['ATL', 2015, '60 wins and no superstar'],
    ['DET', 2004, 'Five starters, one ring'], ['PHI', 2001, 'Iverson carries a city'], ['DAL', 2011, "Dirk's ring"], ['BOS', 2008, 'The Big Three'],
    ['MIL', 2021, 'Giannis closes it out'], ['DEN', 2023, 'Jokic wins it all'], ['TOR', 2019, 'Kawhi and the shot'], ['SAC', 2002, 'So close'],
    ['PHX', 2005, 'Seven seconds or less'], ['UTA', 1998, 'Stockton to Malone'], ['HOU', 1995, 'Clutch City'], ['IND', 2000, 'Reggie reaches the Finals'],
    ['SEA', 1996, 'The Glove and the Reign Man'], ['ORL', 1995, 'Shaq and Penny'], ['OKC', 2012, 'Durant, Westbrook and Harden'], ['POR', 2000, 'Almost'], ['NYK', 1999, 'The eighth seed in the Finals']
  ];
  const FRANCH = { BOS: 'Boston Celtics', LAL: 'Los Angeles Lakers', CHI: 'Chicago Bulls', GSW: 'Golden State Warriors', NYK: 'New York Knicks', PHI: 'Philadelphia 76ers', DET: 'Detroit Pistons', SAS: 'San Antonio Spurs', HOU: 'Houston Rockets', MIA: 'Miami Heat', DAL: 'Dallas Mavericks', DEN: 'Denver Nuggets', MIL: 'Milwaukee Bucks', POR: 'Portland Trail Blazers', UTA: 'Utah Jazz', ATL: 'Atlanta Hawks', IND: 'Indiana Pacers', CLE: 'Cleveland Cavaliers', PHX: 'Phoenix Suns', SEA: 'Seattle SuperSonics' };
  const MODERN = ['ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOH', 'NYK', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS'];
  const STYLES = [
    ['PG', 'POINT GUARDS', 'Run the show', e => String(e.pos).split('-')[0] === 'PG', e => e.ovr],
    ['SG', 'SHOOTING GUARDS', 'Buckets', e => String(e.pos).split('-')[0] === 'SG', e => e.ovr],
    ['SF', 'WINGS', 'Do it all', e => String(e.pos).split('-')[0] === 'SF', e => e.ovr],
    ['PF', 'POWER FORWARDS', 'Bruisers and stretch bigs', e => String(e.pos).split('-')[0] === 'PF', e => e.ovr],
    ['C', 'CENTERS', 'Own the paint', e => String(e.pos).split('-')[0] === 'C', e => e.ovr],
    ['SNIPE', 'SNIPERS', 'The best pure shooters ever', e => e.ovr >= 85 && e.attrs, e => (e.attrs.three || 0) * 2 + (e.attrs.ft || 0) + e.ovr * 0.2],
    ['BLOCK', 'RIM PROTECTORS', 'Nothing comes through', e => e.ovr >= 85 && e.attrs, e => (e.attrs.block || 0) * 2 + (e.attrs.intD || 0) + e.ovr * 0.2],
    ['SMALL', 'SMALL BALL', 'Six foot four and under', e => e.ht && e.ht <= 76 && e.ovr >= 80, e => e.ovr],
    ['TALL', 'THE TALL ONES', 'Seven feet and up', e => e.ht && e.ht >= 84 && e.ovr >= 80, e => e.ovr]
  ];
  const DRAFTYRS = [[1996, 'Kobe, Iverson and Nash'], [1999, 'Brand, Francis, Odom and Marion'], [2003, 'LeBron, Melo, Bosh and Wade'], [2008, 'Rose, Westbrook and Love'], [2009, 'Harden, Curry and DeRozan'], [2011, 'Kyrie, Kawhi and Klay'], [2016, 'Simmons, Ingram, Murray and Siakam'], [2017, 'Tatum, Mitchell, Fox and Adebayo']];
  const ROOKIES = [[1985, 'Jordan, Olajuwon and Barkley arrive'], [1997, "Iverson's first year"], [2000, 'Brand and Francis share the award'], [2004, "LeBron's first year"], [2010, 'Curry and Tyreke Evans'], [2011, 'Griffin and Wall'], [2013, 'Lillard and Anthony Davis'], [2018, 'Simmons, Mitchell and Tatum'], [2019, 'Luka and Trae'], [2020, 'Ja and Zion']];
  const RINGLESS = ['Charles Barkley', 'Karl Malone', 'John Stockton', 'Patrick Ewing', 'Steve Nash', 'Allen Iverson', 'Reggie Miller', 'Chris Paul', 'Carmelo Anthony', 'Tracy McGrady', 'Vince Carter', 'Dominique Wilkins', 'Elgin Baylor', 'George Gervin', 'Alex English', 'Chris Webber', 'Anfernee Hardaway', 'Tim Hardaway', 'Mitch Richmond', 'Bob Lanier', 'Pete Maravich', 'Dikembe Mutombo', 'Sidney Moncrief', 'Bernard King', 'Damian Lillard', 'Paul George', 'Elvin Hayes', 'Nate Thurmond'];
  const DECS = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
  const labelOf = y => (y - 1) + '-' + String(y).slice(2);
  // every theme as plain data, so a day, the archive and the casual picker all name them the same way
  const mk = (kind, title, tag, spec) => ({ kind, title, tag, spec, key: Object.keys(spec).map(k => spec[k]).join(':') });
  const T_CURRENT = a => mk('CURRENT TEAM', labelOf(2027) + ' ' + UI.teamName(a).toUpperCase(), 'The current roster', { t: 'season', abbr: a, year: 2027 });
  const T_FAMOUS = f => mk('FAMOUS SEASON', labelOf(f[1]) + ' ' + (FRANCH[f[0]] || UI.teamName(f[0])).toUpperCase(), f[2], { t: 'season', abbr: f[0], year: f[1] });
  const T_FRANCH = a => mk('ALL-TIME FRANCHISE', 'THE BEST ' + FRANCH[a].toUpperCase() + ' EVER', 'Every season counts', { t: 'franchise', abbr: a });
  const T_DECADE = d => mk('ERA', 'THE ' + d.toUpperCase(), 'The best of one decade', { t: 'decade', d });
  const T_STYLE = st => mk('STYLE', st[1], st[2], { t: 'style', k: st[0] });
  const T_DRAFT = d => mk('DRAFT CLASS', 'THE CLASS OF ' + d[0], d[1], { t: 'draft', y: d[0] });
  const T_ROOKIE = r => mk('ROOKIE YEAR', 'THE ' + labelOf(r[0]) + ' ROOKIES', r[1], { t: 'rookie', year: r[0] });
  const T_U25 = () => mk('UNDER 25', 'THE YOUNG GUNS', 'Current players under 25', { t: 'u25' });
  const T_RING = () => mk('RINGLESS', 'NO RING', 'The best never to win it all', { t: 'ringless' });
  const themeCatalog = () => [].concat(MODERN.map(T_CURRENT), FAMOUS.map(T_FAMOUS), Object.keys(FRANCH).map(T_FRANCH), DECS.map(T_DECADE), STYLES.map(T_STYLE), DRAFTYRS.map(T_DRAFT), ROOKIES.map(T_ROOKIE), [T_U25(), T_RING()]);
  // what today is, from the date alone (no data needed): the kind rotates daily, the pick inside it comes from the date
  function dailyThemeInfo(day) {
    const idx = Math.floor(Date.parse(day + 'T00:00:00Z') / 86400000), kind = ((idx % 9) + 9) % 9, h = hash(day);
    if (kind === 0) return T_CURRENT(MODERN[h % MODERN.length]);
    if (kind === 1) return T_FAMOUS(FAMOUS[h % FAMOUS.length]);
    if (kind === 2) { const ks = Object.keys(FRANCH); return T_FRANCH(ks[h % ks.length]); }
    if (kind === 3) return T_DECADE(DECS[h % DECS.length]);
    if (kind === 4) return T_STYLE(STYLES[h % STYLES.length]);
    if (kind === 5) return T_DRAFT(DRAFTYRS[h % DRAFTYRS.length]);
    if (kind === 6) return T_ROOKIE(ROOKIES[h % ROOKIES.length]);
    if (kind === 7) return T_U25();
    return T_RING();
  }
  // the first day of the daily: the archive and the casual picker only ever show themes from days that are over
  const DAILY_START = '2026-11-12';
  const dayNo = d => Math.max(1, Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(DAILY_START + 'T00:00:00Z')) / 86400000) + 1);
  function themePast() {
    const out = [], seen = new Set(), t0 = Date.parse(DAILY_START + 'T00:00:00Z'), t1 = Date.parse(today() + 'T00:00:00Z');
    for (let t = t1 - 86400000; t >= t0; t -= 86400000) { const day = new Date(t).toISOString().slice(0, 10), info = dailyThemeInfo(day); if (!seen.has(info.key)) { seen.add(info.key); out.push(Object.assign({}, info, { day })); } }
    return out;   // newest first
  }
  const themeLocked = key => dailyThemeInfo(today()).key === key;   // today's theme stays out of practice and the casual picker until tomorrow
  const THEME = {};
  const BUILT = {};
  async function buildTheme(info) {
    if (BUILT[info.key]) return BUILT[info.key];
    const sp = info.spec, top = l => l.sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1)).slice(0, 12);
    let pool = [];
    const allTime = () => { const best = {}; C.allTimePool().forEach(e => { if (!best[e.base] || e.ovr > best[e.base].ovr) best[e.base] = e; }); return Object.keys(best).map(k => Object.assign({}, best[k], { id: best[k].key, team: best[k].from })); };
    if (sp.t === 'rookie') { await C.load(sp.year); pool = C.seasonData(sp.year).players.filter(x => x.rookie).map(x => Object.assign({}, x, { season: sp.year })); }
    else if (sp.t === 'u25') { await C.load(2027); pool = C.seasonData(2027).players.filter(x => x.age < 25).map(x => Object.assign({}, x, { season: 2027 })); }
    else if (sp.t === 'season') { await C.load(sp.year); pool = C.seasonData(sp.year).players.filter(x => x.team === sp.abbr).map(x => Object.assign({}, x, { season: sp.year })); }
    else {
      await C.load('pool');
      if (sp.t === 'franchise') { const best = {}; C.allTimePool().filter(e => e.from === sp.abbr).forEach(e => { if (!best[e.base] || e.ovr > best[e.base].ovr) best[e.base] = e; }); pool = Object.keys(best).map(k => Object.assign({}, best[k], { id: best[k].key, team: best[k].from })); }
      else if (sp.t === 'decade') pool = allTime().filter(e => decKey(e.season) === sp.d);
      else if (sp.t === 'draft') { const R = (window.DRAFT_RESULTS || {})[sp.y], D = (window.DRAFTS || {})[sp.y], ids = new Set(R ? R.map(r => r[1]) : (D || []).map(r => r.id)); pool = allTime().filter(e => ids.has(e.base)); }
      else if (sp.t === 'ringless') { const names = new Set(RINGLESS); pool = allTime().filter(e => names.has(e.name)); }
      else { const def = STYLES.find(x => x[0] === sp.k); pool = allTime().filter(def[3]).sort((a, b) => def[4](b) - def[4](a)).slice(0, 30); }
    }
    pool = sp.t === 'style' ? pool.slice(0, 12) : top(pool);
    const years = sp.t === 'season' || sp.t === 'rookie' ? [sp.year] : sp.t === 'u25' ? [2027] : [];
    return (BUILT[info.key] = { info, pool, years });
  }
  async function dailyTheme(day) {
    if (THEME[day]) return THEME[day];
    let t = await buildTheme(dailyThemeInfo(day));
    if (t.pool.length < 10) { await C.load('pool'); const best = {}; C.allTimePool().forEach(e => { if (!best[e.base] || e.ovr > best[e.base].ovr) best[e.base] = e; }); t = { info: Object.assign({}, t.info, { title: 'THE ALL-TIME GREATS', tag: 'Today\'s theme had too few players' }), pool: Object.keys(best).map(k => Object.assign({}, best[k], { id: best[k].key, team: best[k].from })).sort((a, b) => b.ovr - a.ovr).slice(0, 12), years: [] }; }
    return (THEME[day] = t);
  }
  function dailyPerfect(era, day) {   // the same ten players for everyone, so one number per day
    const k = day;
    if (PERF[k] != null) return PERF[k];
    const T = THEME[day];
    if (!T) return 0;
    const st = C.auctionStart({ bench: 0, seed: hash(day + '|ALL'), auction: DAILY }, T.pool), byId = {};
    T.pool.forEach(p => { byId[p.id] = p; });
    return (PERF[k] = perfectOf(st.ids.map(id => byId[id]).filter(Boolean), st.per));
  }
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
  function dailyPage(app, era, pr) {   // pr: a practice round of any theme {info, n}: no board, no streak
    stopRefresh();
    era = ERAS.indexOf(era) >= 0 ? era : 'ALL';
    era = 'ALL';   // the daily is one theme a day, whatever era is picked above
    const day = pr ? 'practice:' + pr.info.key + ':' + pr.n : today(), key = 'a13-rk-d-' + day + '-T';
    if (!THEME[day]) {
      app.innerHTML = '<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING THE THEME...</div></section>';
      (pr ? buildTheme(pr.info).then(t => { THEME[day] = t; }) : dailyTheme(day)).then(() => { if (/^#\/daily/.test(location.hash)) dailyPage(app, era, pr); }).catch(e => { app.innerHTML = '<p class="rk-err">' + esc(e.message || e) + '</p>'; });
      return;
    }
    const pool = THEME[day].pool, byId = {};
    pool.forEach(p => { byId[p.id] = p; });
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
    const TH = (THEME[day] || {}).info || { title: eraName(era), kind: '' }, isPr = day.indexOf('practice:') === 0, prKey = isPr ? day.slice(9, day.lastIndexOf(':')) : '';
    const hdr = `<div class="ch-top"><div><div class="ch-top-k">${isPr ? 'PRACTICE' : 'DAILY #' + dayNo(day) + ' | ' + esc(day)} | ${esc(TH.title)}</div><div class="ch-top-t">${st.done ? 'YOUR FIVE IS SET' : 'PLAYER ' + (st.i + 1) + ' OF ' + st.ids.length}</div></div><a class="btn btn-small" href="${isPr ? '#/daily/practice' : '#/daily'}">BACK</a></div>`;
    if (st.done) {
      stopClock();
      const five = st.won[0].map(id => byId[id]), score = UI.ranked.lineupScore(five), houseFive = st.won[1].map(id => byId[id]), hs = UI.ranked.lineupScore(houseFive);
      const perfectScore = dailyPerfect(era, day);
      const pct = score != null && perfectScore > 0 ? Math.min(100, 100 * score / perfectScore) : null;
      app.innerHTML = `${hdr}<div class="vs-sides vs-compact">${sideBox(0, 'YOU')}${sideBox(1, 'THE HOUSE')}</div>
        <section class="rk-score"><small>YOUR LINEUP SCORE</small><b>${score == null ? '-' : score.toFixed(1)}</b>${pct == null ? '' : `<div class="rk-pct"><b>${pct.toFixed(1)}%</b> OF A PERFECT FIVE</div>`}<div class="rk-streak" id="rkStreak"></div><span class="muted">The house scored ${hs == null ? '-' : hs.toFixed(1)}. ${score != null && hs != null ? (score > hs ? 'You beat the house.' : score < hs ? 'The house won this one.' : 'A tie.') : ''}</span></section>
        <div id="rkSub" class="rkn"><span class="muted">Sending your score...</span></div>
        <div class="ch-go">${isPr ? `<a class="btn btn-gold" href="#/daily/practice/${esc(prKey)}/${Date.now()}">PLAY AGAIN</a><a class="btn" href="#/daily/practice">ARCHIVE</a>` : `<a class="btn btn-gold" href="#/daily">SEE THE BOARD</a>${pct == null ? '' : '<button type="button" class="btn" id="dlShare">SHARE YOUR SCORE</button>'}`}</div>`;
      const dsh = UI.$('#dlShare', app);
      const doShare = async btn => { btn.disabled = true; const r = await shareCard({ k: 'DAILY #' + dayNo(day), title: 'OF A PERFECT FIVE', color: '#d4af37', big: pct.toFixed(1) + '%', sub: TH.title, name: UI.profile.account() || '' }, 'Starting Five Daily #' + dayNo(day) + ' \u{1F3C0}\n' + five.map(p => { const o = p.baseOvr != null ? p.baseOvr : (p.ovr || 0); return o >= 90 ? '\u{1F7EA}' : o >= 80 ? '\u{1F7E6}' : o >= 70 ? '\u{1F7E9}' : o >= 60 ? '\u{1F7E8}' : '\u{1F7E5}'; }).join('') + '\n' + pct.toFixed(1) + '% of a perfect five', '#/daily'); btn.disabled = false;  };
      if (dsh) dsh.addEventListener('click', () => doShare(dsh));
      if (!isPr && pct != null) {   // the result pops up with the share button every time this screen opens
        const ov = document.createElement('div'); ov.className = 'rk-tour';
        ov.innerHTML = `<div class="rk-tour-b"><small>DAILY #${dayNo(day)} | ${esc(TH.title)}</small><h2 class="rk-pop-n">${pct.toFixed(1)}%</h2><p>OF A PERFECT FIVE | LINEUP SCORE ${score.toFixed(1)}</p><div class="rk-tour-go"><button type="button" class="btn btn-gold btn-big" id="popShare">SHARE YOUR SCORE</button><button type="button" class="btn" id="popClose">CLOSE</button></div></div>`;
        document.body.appendChild(ov);
        const shut = () => { ov.remove(); window.removeEventListener('hashchange', shut); };
        window.addEventListener('hashchange', shut);
        ov.querySelector('#popClose').addEventListener('click', shut);
        ov.querySelector('#popShare').addEventListener('click', () => doShare(ov.querySelector('#popShare')));
      }
      const paintStreak = () => { const sk = UI.$('#rkStreak', app), n = streakNow(); if (sk && n.n) sk.innerHTML = '<b>' + n.n + '</b> DAY DAILY STREAK' + (n.best > n.n ? ' | BEST ' + n.best : ''); };
      paintStreak();
      const sub = UI.$('#rkSub', app);
      if (isPr) { sub.innerHTML = '<b>PRACTICE.</b> <span class="muted">Not on the board, no streak.</span>'; return; }
      if (!UI.profile.signedIn()) {   // anyone can play; an account only puts the score on the board
        sub.innerHTML = '<b>YOUR SCORE IS SAVED ON THIS DEVICE.</b> <span class="muted">Sign in to put it on the board.</span><button type="button" class="btn btn-gold" data-pf="open">SIGN IN</button>';
        UI.profile.wire(app, () => dailyPage(app, era));
        return;
      }
      const cur = ls.get(key, {});
      if (cur.sent) { sub.innerHTML = `<b>SCORE SENT.</b> <span class="muted">One try a day for each era.</span>`; return; }
      UI.profile.rpc('submit_daily', { p_day: day, p_era: era, p_score: score, p_lineup: { names: five.map(p => p.name), seasons: five.map(p => p.season || null), score, era }, p_pct: pct == null ? null : Math.round(pct * 100) / 100 })
        .then(ok => { streakBump(day); paintStreak(); ls.set(key, Object.assign(cur, { st, fin: true, sent: true, score })); sub.innerHTML = ok ? '<b>SCORE SENT.</b> <span class="muted">You are on today\'s board.</span>' : '<b>ALREADY ON THE BOARD.</b> <span class="muted">One score a day for each era.</span>'; })
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
          <div class="auc-dots">${st.ids.map((id, k) => `<i class="${k < st.i ? 'sold' : k === st.i ? 'now' : ''}"></i>`).join('')}</div><p class="auc-more">${left} MORE IN THE HIDDEN POOL | ${isPr ? 'PRACTICE' : 'ONE TRY A DAY'}</p>
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
      let ser = await c.from('series').select('key,p1,p2,w1,w2,d1,d2,era,style,ranked,created_at').order('created_at', { ascending: false }).limit(300);
      if (ser.error) ser = await c.from('series').select('p1,p2,w1,w2,era,style,ranked,created_at').order('created_at', { ascending: false }).limit(300);   // before the rating change columns exist
      let rat = await c.from('ratings').select('era,rating,peak,games,wins,losses').eq('user_id', id);
      if (rat.error) rat = await c.from('ratings').select('era,rating,games,wins,losses').eq('user_id', id);   // before the peak column exists
      const riv = await c.from('rivalries').select('a,b,a_wins,b_wins,last_at');
      const rep = await c.from('series_reports').select('key,lineup').order('created_at', { ascending: false }).limit(500);   // your own reports: the lineups you drafted
      const missing = [ser, rat, riv].find(x => x.error);
      if (missing) throw missing.error;
      const games = (ser.data || []).map(s => ({ won: (s.p1 === id ? s.w1 > s.w2 : s.w2 > s.w1), era: s.era, at: s.created_at, ranked: s.ranked }));
      const W = games.filter(g => g.won).length, L = games.length - W;
      let streak = 0; for (const g of games) { if (g.won === games[0].won) streak++; else break; }
      const count = {}; games.forEach(g => { count[g.era] = (count[g.era] || 0) + 1; });
      const auto = Object.keys(count).sort((a, b) => count[b] - count[a])[0] || null;
      const fav = row.fav_era || auto;
      const oppIds = [...new Set((riv.data || []).map(r => (r.a === id ? r.b : r.a)).concat((ser.data || []).map(x => (x.p1 === id ? x.p2 : x.p1))))];
      const names = {};
      if (oppIds.length) { const p = await c.from('profiles').select('id,username').in('id', oppIds); (p.data || []).forEach(x => { names[x.id] = x.username; }); }
      const rivals = (riv.data || []).map(r => ({ name: names[r.a === id ? r.b : r.a] || '?', me: r.a === id ? r.a_wins : r.b_wins, them: r.a === id ? r.b_wins : r.a_wins, at: r.last_at })).sort((x, y) => (y.me + y.them) - (x.me + x.them));
      const curRating = Math.max(1200, ...(rat.data || []).map(r => r.rating)), peakRating = Math.max(curRating, ...(rat.data || []).map(r => r.peak || 0));
      let myDaily = null;
      try { const pp = await UI.profile.rpc('public_profile', { p_name: row.username || UI.profile.account() }); myDaily = pp && pp.daily; } catch (e) { /* before the latest SQL */ }
      let avatar = null;
      try { const av = await c.from('profiles').select('avatar').eq('id', id).maybeSingle(); avatar = av.data && av.data.avatar || null; } catch (e) { /* the column arrives with the SQL */ }
      const bl = row.best_lineup, tally = {};
      (rep.data || []).forEach(x => { const l = x.lineup; if (!l || !Array.isArray(l.names)) return; l.names.forEach((n, k) => { const se = l.seasons && l.seasons[k] || 0, key = n + '|' + se; tally[key] = (tally[key] || 0) + 1; }); });
      const most = Object.keys(tally).map(k => { const [n, se] = k.split('|'); return { n, se: +se, c: tally[k] }; }).sort((x, y) => y.c - x.c || x.n.localeCompare(y.n)).slice(0, 5);
      const yr = se => (se ? "'" + String(se - 1).slice(2) + "-'" + String(se).slice(2) : '');
      app.innerHTML = `<div class="pf-head">${avatarHtml(avatar, row.username || UI.profile.account(), 72, curRating)}<section class="ch-hero"><div class="ch-hero-k">PROFILE</div><h1 class="ch-hero-t">${esc(row.username || UI.profile.account()).toUpperCase()}</h1>
          <p class="ch-hero-p">${games.length ? W + '-' + L + ' in Head to Head series' + (streak > 1 ? ', ' + streak + ' ' + (games[0].won ? 'wins' : 'losses') + ' in a row' : '') + '.' : 'No series on your account yet. Play a friend in Head to Head while you are both signed in.'}</p></section></div>
        <div class="rk-cards"><div class="rk-card"><small>RECORD</small><b>${W}-${L}</b></div><div class="rk-card"><small>FAVORITE ERA</small><b>${fav ? esc(eraName(fav)) : '-'}</b></div><div class="rk-card pl"><small>MOST USED PLAYER</small>${most[0] ? `<b>${esc(most[0].n)}</b><span>${esc(yr(most[0].se) || 'ANY SEASON')} | ${most[0].c}x</span>` : '<b>-</b>'}</div></div>
        <details class="ch-step rk-det"><summary>CHANGE PROFILE PICTURE</summary>
          <div class="ch-step-k">RANK ICONS</div>
          <div class="pf-picks"><button type="button" class="pf-pick wide${!avatar || avatar === 'rank:auto' ? ' on' : ''}" data-av="rank:auto">${iconSvg(tierOf(curRating), 38)}<small>MY RANK</small></button>${TIERS.map(t => { const lock = t.floor > peakRating; return `<button type="button" class="pf-pick${avatar === 'rank:' + t.name ? ' on' : ''}${lock ? ' lock' : ''}" data-av="rank:${esc(t.name)}"${lock ? ' disabled' : ''} title="${esc(t.name)}${lock ? ' (reach ' + t.floor + ' to unlock)' : ''}">${iconSvg(t, 38)}</button>`; }).join('')}</div>
          <div class="ch-step-k">TEAM LOGOS</div>
          <div class="pf-picks">${UI.teams().map(t => `<button type="button" class="pf-pick${avatar === t.abbr ? ' on' : ''}" data-av="${esc(t.abbr)}" title="${esc(UI.teamName(t.abbr))}">${UI.logo(t.abbr, 38)}</button>`).join('')}</div>
          <span class="pf-msg" id="avMsg"></span></details>
        <div class="ch-step"><div class="ch-step-k">ABOUT YOU</div>
          <label class="field"><span>REGION (FOR THE REGION BOARDS)</span><select id="meRegion">${regionOpts(row.region)}</select></label>
          <label class="field"><span>FAVORITE ERA</span><select id="meFav"><option value="">${auto ? 'THE ERA I PLAY MOST (' + esc(eraName(auto)) + ')' : 'THE ERA I PLAY MOST'}</option>${eraOpts(row.fav_era || '___')}</select></label>
          <small class="muted">Region is only what you pick. Nothing reads your location.</small>
          <div class="ch-go"><button type="button" class="btn btn-gold" id="meSave">SAVE</button><span class="pf-msg" id="meMsg"></span></div></div>
        ${most.length ? `<div class="ch-step"><div class="ch-step-k">MOST DRAFTED</div>${table(['PLAYER', 'SEASON', 'TIMES'], most.map(m => [esc(m.n), esc(yr(m.se) || 'ANY'), '<b>' + m.c + '</b>']), true)}</div>` : ''}
        ${dailyBlock(myDaily)}
        ${rat.data && rat.data.length ? `<div class="ch-step"><div class="ch-step-k">YOUR LADDER RATINGS</div>${table(['ERA', 'RATING', 'W-L'], rat.data.slice().sort((x, y) => y.rating - x.rating).map(r => [esc(eraName(r.era)), '<b>' + r.rating + '</b> ' + tierBadge(r.rating), wl(r.wins, r.losses)]), true)}</div>` : ''}
        ${(ser.data || []).length ? `<div class="ch-step"><div class="ch-step-k">MATCH HISTORY</div><div class="hist-l">${(ser.data || []).slice(0, 15).map(x => {
          const mine = x.p1 === id, mw = mine ? x.w1 : x.w2, tw = mine ? x.w2 : x.w1, won = mw > tw, dd = mine ? x.d1 : x.d2, who = names[mine ? x.p2 : x.p1] || '?';
          const lu = ((rep.data || []).find(r => r.key && r.key === x.key) || {}).lineup;
          return `<details class="hist"><summary><span class="hist-r ${won ? 'w' : 'l'}">${won ? 'W' : 'L'}</span><b>${mw}-${tw}</b><span class="hist-v">${UI.userLink(who)}</span>${x.ranked ? '<span class="rk-tag">RANKED</span>' : '<span class="rk-tag dim">CASUAL</span>'}${dd != null ? `<span class="hist-d ${dd >= 0 ? 'w' : 'l'}">${dd > 0 ? '+' : ''}${dd}</span>` : ''}<small>${esc(String(x.created_at || '').slice(0, 10))}</small></summary>${lu && Array.isArray(lu.names) ? `<p class="muted">${esc(lu.names.join(', '))}</p>` : '<p class="muted">No lineup saved for this one.</p>'}</details>`;
        }).join('')}</div></div>` : ''}
        <div class="ch-step"><div class="ch-step-k">RIVALRIES</div>${rivals.length ? table(['VS', 'RECORD', ''], rivals.map(r => [UI.userLink(r.name), '<b>' + r.me + '-' + r.them + '</b>', r.me > r.them ? 'YOU LEAD' : r.me < r.them ? 'THEY LEAD' : 'TIED']), true) : '<p class="muted">Your rivalries show up here: one record for each friend you play, and one series counts for each draft.</p>'}</div>
        <div class="ch-go"><a class="btn btn-gold" href="#/ranked">RANKED</a><a class="btn" href="#/challenge/vs">HEAD TO HEAD</a></div>`;
      const setAv = async v => {
        const m = UI.$('#avMsg', app); if (m) m.textContent = 'Saving...';
        const u = await c.from('profiles').update({ avatar: v }).eq('id', id);
        if (u.error) { if (m) { m.textContent = /avatar|schema cache|column/i.test(u.error.message || '') ? 'Run the latest SQL first, then this works.' : failMsg(u.error); m.className = 'pf-msg bad'; } return; }
        mePage(app);
      };
      app.querySelectorAll('[data-av]').forEach(b => b.addEventListener('click', () => setAv(b.dataset.av)));
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
        <p class="ch-hero-p" id="fgP">Stay here. You are paired as soon as someone searches.</p></section>
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
      el.innerHTML = 'WAITING <b>' + mmss(Date.now() - F.start) + '</b>' + (F.others == null ? '' : ' | <b>' + F.others + '</b> OTHER' + (F.others === 1 ? '' : 'S') + ' SEARCHING NOW') + (F.win == null ? '' : F.win === Infinity ? ' | <b>ANY RATING</b>' : ' | WITHIN <b>' + F.win + '</b> RATING POINTS') + (avg ? ' | USUALLY ABOUT <b>' + (avg < 60 ? avg + ' SEC' : Math.round(avg / 60) + ' MIN') + '</b>' : ' | NO ESTIMATE YET');
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
        const waited = Date.now() - F.start, win = waited > 60000 ? Infinity : 150 + 100 * Math.floor(waited / 10000);   // starts within 150 rating points and widens every ten seconds; after a minute anyone will do
        F.win = win;
        cand.sort((a, b) => Math.abs((a.rating || 1200) - F.rating) - Math.abs((b.rating || 1200) - F.rating));   // whoever is online, the closest rating first
        for (let i = cand.length - 1; i >= 0; i--) if (Math.abs((cand[i].rating || 1200) - F.rating) > win) cand.splice(i, 1);   // outside the window for now
        if (!st.role) {
          if (cand[0]) { UI.vsQuick.join(cand[0].code, era); F.joinedAt = Date.now(); say('OPPONENT FOUND.', 'Connecting to ' + cand[0].host_name + '...'); }
          else { UI.vsQuick.host(era); say('WAITING FOR AN OPPONENT.', 'Stay here. You are paired as soon as someone searches.'); }
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
      if (!d) { app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">PROFILE</div><h1 class="ch-hero-t">${esc(name.toUpperCase())}</h1></section><div class="rkn"><b>${esc(name.toUpperCase())} IS A GUEST.</b><span class="muted">Guests play with a room code and a name, so they have no profile, no ladder rating and no friends list. They can make an account any time.</span></div><div class="ch-go"><a class="btn" href="#/ranked">RANKED</a><a class="btn" href="#/me">MY PROFILE</a></div>`; return; }
      if (d.self) { location.replace('#/me'); return; }
      const fav = d.fav_era || d.auto_era, bl = d.best_lineup, yr = se => (se ? "'" + String(se - 1).slice(2) + "-'" + String(se).slice(2) : '');
      const total = d.wins + d.losses, signed = UI.profile.signedIn();
      const fr = !signed ? '' : d.friend === 'friends' ? '<span class="vs-fr ok">&#10003; YOU ARE FRIENDS</span><button type="button" class="btn btn-small" id="uRm">UNFRIEND</button>' : d.friend === 'sent' ? '<span class="muted">REQUEST SENT</span><button type="button" class="btn btn-small" id="uRm">CANCEL REQUEST</button>' : `<button type="button" class="btn btn-gold" id="uAdd">${d.friend === 'incoming' ? 'ACCEPT FRIEND REQUEST' : 'ADD AS FRIEND'}</button>`;
      app.innerHTML = `<div class="pf-head">${avatarHtml(d.avatar, d.username, 72, Math.max(1200, ...(d.ratings || []).map(r => r.rating)))}<section class="ch-hero"><div class="ch-hero-k">PROFILE${d.region ? ' | ' + esc(regionName(d.region).toUpperCase()) : ''}</div><h1 class="ch-hero-t">${esc(d.username).toUpperCase()}</h1>
          <p class="ch-hero-p">${total ? d.wins + '-' + d.losses + ' in Head to Head series.' : 'No series on this account yet.'}</p></section></div>
        ${fr ? `<div class="ch-go u-act">${fr}</div>` : ''}
        ${signed && !d.self ? `<details class="rk-det rk-report"><summary>REPORT THIS PLAYER</summary><div class="rk-report-b"><select id="rpWhy"><option>OFFENSIVE NAME OR PICTURE</option><option>CHEATING OR WIN TRADING</option><option>HARASSMENT</option><option>OTHER</option></select><button type="button" class="btn btn-small" id="rpSend">SEND REPORT</button><span class="pf-msg" id="rpMsg"></span></div></details>` : ''}
        <div class="rk-cards"><div class="rk-card"><small>RECORD</small><b>${d.wins}-${d.losses}</b></div><div class="rk-card"><small>FAVORITE ERA</small><b>${fav ? esc(eraName(fav)) : '-'}</b></div><div class="rk-card pl"><small>MOST USED PLAYER</small>${d.most && d.most[0] ? `<b>${esc(d.most[0].name)}</b><span>${esc(yr(d.most[0].season) || 'ANY SEASON')} | ${d.most[0].count}x</span>` : '<b>-</b>'}</div></div>
        <div class="rk-cards two"><div class="rk-card"><small>FRIENDS</small><b>${d.friends || 0}</b></div><div class="rk-card"><small>MUTUAL FRIENDS</small><b>${signed ? d.mutual_count || 0 : '-'}</b></div></div>
        ${d.mutual && d.mutual.length ? `<div class="ch-step"><div class="ch-step-k">FRIENDS YOU SHARE</div><p class="rk-lineup">${d.mutual.map(n => `<span>${UI.userLink(n)}</span>`).join('')}</p></div>` : ''}
        ${d.vs ? `<div class="ch-step"><div class="ch-step-k">YOU VS ${esc(d.username.toUpperCase())}</div><p class="rk-vs"><b>${d.vs.me}</b><span>-</span><b>${d.vs.them}</b></p><small class="muted">${d.vs.me > d.vs.them ? 'You lead the rivalry.' : d.vs.me < d.vs.them ? 'They lead the rivalry.' : 'Tied.'} One series counts for each draft.</small></div>` : ''}
        ${dailyBlock(d.daily)}
        ${d.ratings && d.ratings.length ? `<div class="ch-step"><div class="ch-step-k">LADDER RATINGS</div>${table(['ERA', 'RATING', 'RANK', 'W-L'], d.ratings.map(r => [esc(eraName(r.era)), '<b>' + r.rating + '</b> ' + tierBadge(r.rating), '#' + r.rank + (r.of ? ' of ' + r.of : ''), wl(r.wins, r.losses)]), true)}</div>` : ''}
        ${d.most && d.most.length ? `<div class="ch-step"><div class="ch-step-k">MOST DRAFTED</div>${table(['PLAYER', 'SEASON', 'TIMES'], d.most.map(m => [esc(m.name), esc(yr(m.season) || 'ANY'), '<b>' + m.count + '</b>']), true)}</div>` : ''}
        <div class="ch-go"><a class="btn" href="#/ranked">RANKED</a><a class="btn" href="#/me">MY PROFILE</a></div>`;
      const urm = UI.$('#uRm', app);
      if (urm) urm.addEventListener('click', async () => {   // two taps to unfriend (one to cancel a request)
        const unf = d.friend === 'friends';
        if (unf && !urm.dataset.sure) { urm.dataset.sure = '1'; urm.textContent = 'TAP AGAIN TO UNFRIEND'; setTimeout(() => { if (urm.isConnected) { delete urm.dataset.sure; urm.textContent = 'UNFRIEND'; } }, 4000); return; }
        urm.disabled = true;
        const ok = await UI.profile.removeFriend(d.username);
        UI.toast(ok ? (unf ? 'Unfriended ' + d.username + '.' : 'Request cancelled.') : 'Could not do that. Try again.', ok ? undefined : 'error');
        userPage(app, name);
      });
      const rps = UI.$('#rpSend', app);
      if (rps) rps.addEventListener('click', async () => {
        const m = UI.$('#rpMsg', app); rps.disabled = true; m.textContent = 'Sending...';
        try { const ok = await UI.profile.rpc('report_user', { p_name: d.username, p_reason: UI.$('#rpWhy', app).value }); m.textContent = ok ? 'Thanks. The report was sent.' : 'You already reported this player today.'; }
        catch (e) { m.textContent = failMsg(e); m.className = 'pf-msg bad'; }
      });
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
        box.innerHTML = '<div class="ts-start-k">CASUAL ROOMS</div><small class="muted">Casual: no rating, guests welcome.</small>' +
          (rows.length ? table(['HOST', 'ERA', 'STYLE', 'OPEN', ''], rows.map(r => [UI.userLink(r.host_name), esc(eraName(r.era)), esc(String(r.style).toUpperCase()), r.age == null ? '' : Math.floor(r.age / 60) + ':' + String(r.age % 60).padStart(2, '0'), r.host_name === mine ? '<span class="muted">YOU</span>' : `<a class="btn btn-small btn-gold" href="#/challenge/vs/join/${esc(r.code)}">JOIN</a>`]), true) : '<p class="muted">No open rooms. Host one and tick Open game.</p>');
      } catch (e) { box.innerHTML = ''; }
    };
    draw(); t = setInterval(draw, 10000);
  };

  // a ranked game you dropped out of: a banner on every page counts down the time left to get back in
  setInterval(() => {
    let el = document.getElementById('rkRejoin');
    const i = UI.vsQuick && UI.vsQuick.rejoinInfo ? UI.vsQuick.rejoinInfo() : null;
    if (!i || !UI.profile.signedIn()) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'rkRejoin'; el.className = 'rk-rejoin'; document.body.appendChild(el); }
    const sec = Math.ceil(i.left / 1000);
    el.innerHTML = '<span>' + (i.lobby ? 'RANKED MATCH FOUND. GET BACK IN <b>' : 'RANKED GAME IN PROGRESS. GET BACK IN <b>') + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') + (i.lobby ? '</b> OR YOU LOSE YOUR SPOT.</span>' : '</b> OR YOU FORFEIT.</span>') + '<button type="button" class="btn btn-small btn-gold" id="rkRejoinBtn">REJOIN NOW</button>';
    const b = el.querySelector('#rkRejoinBtn'); if (b) b.addEventListener('click', () => { UI.vsQuick.rejoin(); el.remove(); });
  }, 1000);




  // ---------- offline notice: a red banner on every page while the connection is down ----------
  (function () {
    const set = on => {
      let el = document.getElementById('rkOffline');
      document.body.classList.toggle('is-offline', on);
      if (on && !el) { el = document.createElement('div'); el.id = 'rkOffline'; el.className = 'rk-offline'; el.innerHTML = '<b>OFFLINE.</b> Reconnecting when you are back.'; document.body.appendChild(el); }
      else if (!on && el) { el.remove(); if (UI.toast) UI.toast('Back online.'); }
    };
    window.addEventListener('offline', () => set(true));
    window.addEventListener('online', () => set(false));
    if (navigator.onLine === false) set(true);
  })();

  // ---------- the first-time tour of ranked ----------
  const TOURKEY = 'a13-rk-tour';
  const TOUR = [
    ['FIND A MATCH', 'Tap Find a match. You get the closest rating searching now. The range widens every ten seconds.'],
    ['THE LOBBY', 'See both ranks and your win chance. Press Ready. Nothing starts until you both do. Leaving here is free.'],
    ['THE AUCTION', 'Ten hidden players, $20 each, five spots each. Bids start at $1, 24 seconds a bid. Pass and your opponent gets the player. Keep $1 for every open spot.'],
    ['THE SERIES', 'Best of 7, no bench. To watch or sim the next game, one asks and the other agrees. Both phones report the score.'],
    ['RANKS', 'Start at 1200, the bottom of Silver. Climb through Bronze, Silver, Gold, Platinum, Diamond, Master, Grandmaster, Legend. You can drop too.'],
    ['IF YOU DROP', 'The game pauses. A banner gives you 90 seconds to rejoin. Miss it and you forfeit. The Forfeit button ends a game at once.']
  ];
  function openTour(done) {
    let i = 0, el = document.getElementById('rkTour');
    if (el) el.remove();
    el = document.createElement('div'); el.id = 'rkTour'; el.className = 'rk-tour'; document.body.appendChild(el);
    const close = () => { try { localStorage.setItem(TOURKEY, '1'); } catch (e) { /* private mode */ } el.remove(); if (done) done(); };
    const draw = () => {
      const [t, p] = TOUR[i], last = i === TOUR.length - 1;
      el.innerHTML = `<div class="rk-tour-b"><small>RANKED TOUR | ${i + 1} OF ${TOUR.length}</small>
        ${i === 4 ? `<div class="rk-tour-ic">${[0, 3, 6, 9, 12, 13, 14, 15, 16, 17].map(k => iconSvg(TIERS[k] || TIERS[TIERS.length - 1], 36)).join('')}</div>` : ''}
        <h2>${esc(t)}</h2><p>${esc(p)}</p>
        <div class="rk-tour-dots">${TOUR.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="rk-tour-go">${i ? '<button type="button" class="btn" id="tBack">BACK</button>' : '<button type="button" class="btn" id="tSkip">SKIP</button>'}<button type="button" class="btn btn-gold btn-big" id="tNext">${last ? 'GOT IT' : 'NEXT'}</button></div></div>`;
      const nx = el.querySelector('#tNext'), bk = el.querySelector('#tBack'), sk = el.querySelector('#tSkip');
      nx.addEventListener('click', () => { if (last) close(); else { i++; draw(); } });
      if (bk) bk.addEventListener('click', () => { i--; draw(); });
      if (sk) sk.addEventListener('click', close);
    };
    draw();
  }
  UI.ranked.tour = openTour;
  UI.ranked.theme = dailyTheme; UI.ranked.themeInfo = dailyThemeInfo;
  UI.ranked.dailyToday = () => Object.assign({ info: dailyThemeInfo(today()) }, streakNow());
  UI.ranked.themePast = themePast; UI.ranked.themeCatalog = themeCatalog; UI.ranked.themeLocked = themeLocked; UI.ranked.themeBuild = key => buildTheme(themeCatalog().find(t => t.key === key));   // for the theme list and checks

  // ---------- nudges: a friend or other players searching for a ranked match ----------
  const NOTE = 'a13-rk-notify';
  UI.ranked.notify = {
    enabled() { try { return localStorage.getItem(NOTE) === '1' && 'Notification' in window && Notification.permission === 'granted'; } catch (e) { return false; } },
    async enable() { if (!('Notification' in window)) return 'unsupported'; const p = await Notification.requestPermission(); try { localStorage.setItem(NOTE, p === 'granted' ? '1' : '0'); } catch (e) { /* private mode */ } return p; },
    disable() { try { localStorage.setItem(NOTE, '0'); } catch (e) { /* private mode */ } }
  };
  let LASTNUDGE = { key: '', at: 0 };
  setInterval(async () => {
    if (!UI.profile.signedIn() || FIND) return;
    if (document.hidden && !UI.ranked.notify.enabled()) return;
    let fr = [], d = null;
    try { fr = (await UI.profile.rpc('friends_searching')) || []; d = await UI.profile.rpc('online_counts'); } catch (e) { return; }
    const names = fr.map(x => x.username), others = d ? (d.searching || 0) : 0;
    const key = names.length ? 'f:' + names.join(',') : others ? 'o' : '';
    if (!key || (LASTNUDGE.key === key && Date.now() - LASTNUDGE.at < 10 * 60000)) return;
    LASTNUDGE = { key, at: Date.now() };
    const msg = names.length ? names.join(', ') + (names.length > 1 ? ' are' : ' is') + ' searching for a ranked match.' : others + (others > 1 ? ' players are' : ' player is') + ' searching for a ranked match.';
    if (document.hidden && UI.ranked.notify.enabled()) {
      try { const n = new Notification('Starting Five', { body: msg + ' Tap to join.' }); n.onclick = () => { window.focus(); location.hash = '#/ranked/find/ALL'; n.close(); }; } catch (e) { /* the browser refused */ }
    } else if (!document.hidden && names.length) UI.toast(msg + ' Open Ranked to join.');
  }, 20000);

  // ---------- the practice archive: any theme, no board, no streak. Today's theme stays locked until tomorrow. ----------
  function practicePage(app) {
    stopRefresh();
    const past = themePast(), day0 = d => new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase();
    app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">PRACTICE</div><h1 class="ch-hero-t">THE ARCHIVE.</h1>
        <p class="ch-hero-p">Past dailies only. No board, no streak.</p></section>
      <div class="ch-go">${past.length ? `<a class="btn btn-gold btn-big" href="#/daily/practice/${esc(past[Math.floor(Math.random() * past.length)].key)}/${Date.now()}">RANDOM THEME</a>` : ''}<a class="btn" href="#/daily">BACK</a></div>
      <div class="pr-list">
        <span class="pr-i lock"><b>TODAY: ???</b><small>OPENS TOMORROW</small></span>
        ${past.map(t => `<a class="pr-i" href="#/daily/practice/${esc(t.key)}/${Date.now()}"><b>${esc(t.title)}</b><small>DAILY #${dayNo(t.day)} | ${esc(t.kind)} | ${esc(day0(t.day))}${t.tag ? ' | ' + esc(t.tag) : ''}</small></a>`).join('')}
      </div>
      ${past.length ? '' : '<p class="muted">Nothing here yet. A theme shows up the day after it runs.</p>'}`;
  }
  function practicePlay(app, key, n) {
    const info = themePast().find(t => t.key === key) || (themeLocked(key) ? themeCatalog().find(t => t.key === key) : null);
    if (!info) { location.hash = '#/daily/practice'; return; }
    if (themeLocked(key)) { app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">PRACTICE</div><h1 class="ch-hero-t">OPENS TOMORROW.</h1><p class="ch-hero-p">This is today's daily. Play it there, then practice it tomorrow.</p></section><div class="ch-go"><a class="btn btn-gold" href="#/daily/play">PLAY THE DAILY</a><a class="btn" href="#/daily/practice">ARCHIVE</a></div>`; return; }
    if (!n) { location.hash = '#/daily/practice/' + key + '/' + Date.now(); return; }
    return dailyPage(app, 'ALL', { info, n });
  }

  // ---------- #/daily: today's theme, the board and the practice archive. No account needed to play; an account puts the score on the board. ----------
  async function dailyHub(app) {
    stopRefresh();
    const day = today(), signed = UI.profile.signedIn();
    app.innerHTML = `<section class="ch-hero"><div class="ch-hero-k">DAILY #${dayNo(day)} | ${esc(day)}</div><h1 class="ch-hero-t">TODAY'S AUCTION.</h1>
        <p class="ch-hero-p">One theme a day. The same ten players for everyone.</p></section><div id="dyBody"><p class="muted">Loading...</p></div>`;
    const body = UI.$('#dyBody', app);
    try {
      let TH = null; try { await dailyTheme(day); TH = THEME[day].info; } catch (e) { /* the theme card stays out */ }
      let rows = []; try { rows = (await UI.profile.rpc('lb_daily', { p_day: day, p_era: 'ALL', p_region: null, p_limit: 100 })) || []; } catch (e) { rows = null; }
      const perf = TH ? dailyPerfect('ALL', day) : 0, pctOf = sc => (perf > 0 ? Math.min(100, 100 * Number(sc) / perf).toFixed(1) + '%' : '');
      const me = UI.profile.account(), done = ls.get('a13-rk-d-' + day + '-T', null), played = done && done.fin, sk = streakNow();
      const left = (() => { const t = new Date().toLocaleTimeString('en-GB', Object.assign({ hour12: false }, PT)).split(':'), ms = 86400000 - ((+t[0]) * 3600 + (+t[1]) * 60 + (+t[2])) * 1000; return Math.floor(ms / 3600000) + 'H ' + (Math.floor(ms / 60000) % 60) + 'M'; })();
      body.innerHTML = `${TH ? `<div class="rk-theme"><small>DAILY #${dayNo(day)} | ${esc(TH.kind)}</small><b>${esc(TH.title)}</b><span class="muted">${esc(TH.tag)}</span></div>` : ''}
        <p class="rk-streak">${sk.n ? '<b>' + sk.n + '</b> DAY STREAK' + (sk.done ? ' | TODAY DONE' : ' | PLAY TODAY TO KEEP IT') : 'START A STREAK: PLAY ONE A DAY'}</p>
        <div class="ch-go"><a class="btn btn-gold btn-big" href="#/daily/play">${played ? "SEE TODAY'S RESULT" : done ? "FINISH TODAY'S AUCTION" : "PLAY TODAY'S AUCTION"}</a><a class="btn" href="#/daily/practice">PRACTICE ARCHIVE</a></div>
        ${signed ? '' : '<p class="muted rk-sub">No account needed. Sign in to put your score on the board.</p>'}
        <div class="rk-theme lock"><small>TOMORROW</small><b>???</b><span class="muted">Opens in ${left}</span></div>
        <div class="ch-step-k">TODAY'S BOARD</div>` +
        (rows && rows.length ? table(perf > 0 ? ['#', 'PLAYER', 'SCORE', 'OF PERFECT'] : ['#', 'PLAYER', 'SCORE'], rows.map((x, i) => [i + 1, nameCell(x, me), '<b>' + Number(x.score).toFixed(1) + '</b>'].concat(perf > 0 ? [pctOf(x.score)] : []))) : '<p class="muted">No scores yet today.</p>') +
        '<div class="ch-go"><a class="btn" href="#/ranked">RANKED</a></div>';
    } catch (e) { body.innerHTML = '<p class="rk-err">' + esc(failMsg(e)) + '</p>'; }
  }
  P.daily = function (app, arg) {
    const part = String(arg || '').split('/');
    if (part[0] === 'play') return dailyPage(app, 'ALL');
    if (part[0] === 'practice') return part[1] ? practicePlay(app, decodeURIComponent(part[1]), part[2] || '') : practicePage(app);
    return dailyHub(app);
  };
  P.u = function (app, arg) { return userPage(app, decodeURIComponent(String(arg || '').split('/')[0])); };

  P.ranked = function (app, arg) {
    const part = String(arg || '').split('/');
    if (part[0] === 'find') return findPage(app, part[1] ? decodeURIComponent(part[1]) : RK.era);
    if (part[0] === 'result') return resultPage(app);
    if (part[0] === 'practice') { location.hash = '#/daily/' + part.join('/'); return; }
    if (part[0] === 'daily') { location.hash = '#/daily/play'; return; }
    return rankedPage(app);
  };
  P.me = function (app) { return mePage(app); };
  window.addEventListener('hashchange', () => { if (!/^#\/ranked/.test(location.hash)) { stopRefresh(); stopFind(); } });
})();
