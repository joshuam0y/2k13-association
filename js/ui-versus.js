// Draft Challenge, two players (#/challenge/vs): pick a season and a franchise each, then take turns: spin
// the wheel, take one player from the team it lands on (snake order A B B A A B B A A B), until both have
// five. The fives meet in a best-of-3, 5 or 7 series where all five play 48 minutes; positions and fit
// count; every game can be watched on the court. Blind draft hides the ratings until the series is over.
// Same phone, or online: the host gets a room code, the friend opens the link on his own phone (PeerJS,
// a direct connection between the two browsers; the public PeerJS server only introduces them).
// Logic in js/challenge.js (lineupFit, playVersus); the wheel and the lineup card come from js/ui-challenge.js.
(function () {
  'use strict';
  const P = UI.pages, esc = UI.esc, C = window.CHALLENGE;
  if (!C || typeof P.challenge !== 'function') return;
  const KEY = 'a13-ch-vs';
  const ls = {
    get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
    set(v) { if (typeof NET !== 'undefined' && NET.role === 'watch') return; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const FRESH = () => ({ year: 2008, teams: ['BOS', 'LAL'], names: ['', ''], tnames: ['', ''], opts: { bestOf: 5, blind: false, timer: 24, bench: 0, board: 0, dupes: 0, bans: 0, auction: 0, aBudget: 20, aStart: 1, aRaise: 1, aPool: 10, aQ: 'stars', aShow: 0, ranked: 0, pub: 0 }, cfg: null, auc: null, ready: [false, false], shown: 0, page: 'setup', spin: null, spun: [], respins: [1, 1], turn: null, pos: '', q: '', epoch: 0, hostSide: 0 });
  let VS = Object.assign(FRESH(), ls.get() || {});
  if (!VS.cfg || VS.page === 'setup') { VS.names = ['', '']; VS.tnames = ['', '']; }   // a new game starts as Player 1 and Player 2 again
  VS.opts = Object.assign({ bestOf: 5, blind: false, timer: 24, era: 2013, bench: 0, bans: 0, auction: 0, aBudget: 20, aStart: 1, aRaise: 1, aPool: 10, aQ: 'stars', aShow: 0, ranked: 0, pub: 0 }, VS.opts || {});
  if (VS.opts.timer) VS.opts.timer = 24;   // the pick clock is a shot clock: 24 seconds or off
  // the seasons in play: every season but the ones switched off (VS.skip). One season left is a one-season
  // draft (cfg.year); more is the era spin over just those (cfg.year 0, cfg.seasons)
  const ALL_YEARS = C.SEASONS.map(s => s.year);
  if (!Array.isArray(VS.skip)) VS.skip = VS.year ? ALL_YEARS.filter(y => y !== VS.year) : [];
  const chosen = () => ALL_YEARS.filter(y => VS.skip.indexOf(y) < 0);
  const decOf = y => (y - 1) - (y - 1) % 10, DECADES = () => [...new Set(ALL_YEARS.map(decOf))];
  const inPlay = (cfg, y) => !cfg.seasons || cfg.seasons.indexOf(+y) >= 0;
  const lblC = cfg => {
    if (cfg.year || !cfg.seasons) return lbl(cfg.year);
    const s = cfg.seasons.slice().sort((a, b) => a - b), run = s.every((y, i) => !i || y === s[i - 1] + 1);
    return run ? lbl(s[0]) + ' TO ' + lbl(s[s.length - 1]) : s.length + ' SEASONS';
  };
  const POS = ['PG', 'SG', 'SF', 'PF', 'C'];
  const ERAS = [[2013, 'MODERN'], [2003, '2000S'], [1993, '1990S'], [1985, '1980S'], [1975, '1970S'], [1965, '1960S'], [1955, '1950S']];   // the rules a mixed-seasons game plays by: pace, the three-point line (none before 1979-80), shooting
  const lbl = y => (y ? (y - 1) + '-' + String(y).slice(2) : 'EVERY SEASON');   // y 0: era spin, every season
  const logo = (t, n) => UI.logoFor(t || { abbr: '?' }, n);
  const tOf = (teams, a) => teams.find(t => t.abbr === a) || { abbr: a, city: a, name: '', colors: ['#333', '#777'] };
  const tName = t => ((t.city || '') + ' ' + (t.name || '')).trim();
  const myName = () => (online() ? UI.profile.name() : '') || (me() !== null && VS.names[me()]) || '';   // signed in: that is your name in the room
  // two people cannot share a name: the one who joined (or the second seat on one phone) gets a 2
  function uniqNames() {
    const a = String(VS.names[0] || '').trim(), b = String(VS.names[1] || '').trim();
    if (!a || a.toLowerCase() !== b.toLowerCase()) return false;
    const joiner = !NET.role ? 1 : NET.role === 'host' ? 1 - NET.side : NET.side;
    VS.names[joiner] = (b.slice(0, 18) + ' 2');
    return true;
  }
  window.addEventListener('a13-profile', () => {   // a username change from the top bar while in a room
    if (!NET.role || !UI.profile.name()) return;
    const i = me(); if (i === null) return;
    if (NET.role === 'guest') send({ t: 'hello', name: UI.profile.name() });
    else { VS.names[i] = UI.profile.name(); uniqNames(); push(); if (VS.page === 'setup' && APP) setup(APP); }
  });
  (UI.rooms = UI.rooms || {}).vs = () => (NET.role && NET.code ? NET.code : '');   // for friend invites
  const who = i => VS.names[i] || ('PLAYER ' + (i + 1));
  // ---------- the rivalry: every finished series between the same two names, kept on this phone ----------
  const RKEY = 'a13-vs-rivals';
  // a rivalry with a guest only lasts for this session (a guest has no account to remember it by); between accounts, and on one phone, it is kept
  const guestGame = () => online() && (!UI.profile.signedIn() || (NET.role === 'host' ? NET.peerAcct === false : NET.role === 'guest' ? VS.hostAcct === false : false));
  const rstore = () => (guestGame() ? window.sessionStorage : window.localStorage);
  const rivals = {
    all() { try { return JSON.parse(rstore().getItem(RKEY) || '{}') || {}; } catch (e) { return {}; } },
    save(v) { try { rstore().setItem(RKEY, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const norm = s => String(s || '').trim().toUpperCase();
  const pairKey = () => [norm(who(0)), norm(who(1))].sort().join('|');
  function rivalry() {
    const names = [norm(who(0)), norm(who(1))].sort();
    return Object.assign({ names, series: {}, games: {}, sweeps: {}, log: [], ids: [] }, rivals.all()[pairKey()] || {});
  }
  // counts a finished series once (by its seed and picks), on each phone
  function recordSeries(r, cfg) {
    const R = rivalry(), id = cfg.seed + ':' + cfg.sides.map(s => s.picks.join(',')).join('/');
    if (R.ids.indexOf(id) >= 0) return R;
    const S = r.sides, wi = S[0].abbr === r.winner ? 0 : 1, wn = norm(who(wi)), ln = norm(who(1 - wi));
    const ww = r.wins[r.winner], lw = r.wins[S[1 - wi].abbr];
    R.series[wn] = (R.series[wn] || 0) + 1;
    R.games[wn] = (R.games[wn] || 0) + ww; R.games[ln] = (R.games[ln] || 0) + lw;
    if (!lw) R.sweeps[wn] = (R.sweeps[wn] || 0) + 1;
    R.log.unshift({ w: wn, s: ww + '-' + lw, y: cfg.year || 0, at: Date.now() }); R.log = R.log.slice(0, 12);
    R.ids.unshift(id); R.ids = R.ids.slice(0, 60);
    // extra rivalry stats (older entries simply lack them): best games, the current streak, the last five series
    const nameOf = a => norm(who(S[0].abbr === a ? 0 : 1)), best = R.best || {};
    (r.games || []).forEach(g => {
      const win = g.winner, m = Math.abs(g.hs - g.as), hi = Math.max(g.hs, g.as), hiTeam = g.hs >= g.as ? g.home : g.away;
      if (!best.margin || m > best.margin.m) best.margin = { w: nameOf(win), m, s: Math.max(g.hs, g.as) + '-' + Math.min(g.hs, g.as), y: cfg.year || 0 };
      if (!best.high || hi > best.high.pts) best.high = { n: nameOf(hiTeam), pts: hi, s: g.hs + '-' + g.as, y: cfg.year || 0 };
    });
    R.best = best;
    let run = 0; while (run < R.log.length && R.log[run].w === R.log[0].w) run++;
    R.streak = { w: R.log[0].w, n: run };
    R.last5 = R.log.slice(0, 5).map(x => ({ w: x.w, s: x.s }));
    const all = rivals.all(); all[pairKey()] = R; rivals.save(all);
    return R;
  }
  function rivalLead(R) {
    const [a, b] = R.names, sa = R.series[a] || 0, sb = R.series[b] || 0;
    if (!sa && !sb) return '';
    return sa === sb ? `${a} and ${b} are tied ${sa}-${sb}` : `${sa > sb ? a : b} leads ${sa > sb ? b : a} ${Math.max(sa, sb)}-${Math.min(sa, sb)}`;
  }
  function rivalBox(R, compact) {
    const [a, b] = R.names, sa = R.series[a] || 0, sb = R.series[b] || 0;
    if (!sa && !sb) return '';
    if (compact) return `<p class="vs-rival-mini"><span>THE RIVALRY</span> ${esc(a)} <b>${sa}</b> | ${esc(b)} <b>${sb}</b></p>`;
    let run = 0; while (run < R.log.length && R.log[run].w === R.log[0].w) run++;
    const st = R.streak && R.streak.w ? R.streak : { w: (R.log[0] || {}).w, n: run };
    const streak = R.log.length ? (st.n >= 2 ? `${st.w} has won ${st.n} straight.` : `${st.w} won the last one.`) : '';
    const bt = R.best || {}, last5 = (R.last5 && R.last5.length ? R.last5 : R.log.slice(0, 5));
    const stats = `<div class="vs-rstats">
        <span><small>CURRENT STREAK</small><b>${esc(st.w || '-')} ${st.n || 0}</b></span>
        <span><small>SERIES RECORD</small><b>${esc(a.split(' ')[0])} ${sa}-${sb} ${esc(b.split(' ')[0])}</b></span>
        ${bt.margin ? `<span><small>BIGGEST WIN</small><b>${esc(bt.margin.w.split(' ')[0])} by ${bt.margin.m}</b><i>${esc(bt.margin.s)}</i></span>` : ''}
        ${bt.high ? `<span><small>HIGHEST SCORE</small><b>${esc(bt.high.n.split(' ')[0])} ${bt.high.pts}</b><i>${esc(bt.high.s)}</i></span>` : ''}
        <span class="vs-rlast"><small>LAST 5 SERIES</small><em>${last5.map(x => `<u class="${x.w === a ? 'a' : 'b'}">${esc(x.w.split(' ')[0].slice(0, 6))}<i>${esc(x.s)}</i></u>`).join('')}</em></span></div>`;
    const sw = [a, b].filter(n => R.sweeps[n]).map(n => `${n} ${R.sweeps[n]}`).join(', ');
    return `<section class="vs-rival"><div class="vs-rival-h"><div class="ch-hero-k">THE RIVALRY</div><button type="button" class="btn btn-small" id="vsRivalReset">RESET</button></div>
      <div class="vs-rival-row"><span class="${sa > sb ? 'up' : ''}"><b>${esc(a)}</b><strong>${sa}</strong></span><i>-</i><span class="${sb > sa ? 'up' : ''}"><strong>${sb}</strong><b>${esc(b)}</b></span></div>
      ${stats}
      <p class="muted">Series won. Games: ${esc(a)} ${R.games[a] || 0}, ${esc(b)} ${R.games[b] || 0}.${sw ? ' Sweeps: ' + esc(sw) + '.' : ''} ${esc(streak)}</p>
      <div class="vs-rival-log">${R.log.slice(0, 8).map(x => `<span class="${x.w === a ? 'a' : 'b'}">${esc(x.w.split(' ')[0])} ${esc(x.s)}<small>${esc(x.y ? short(x.y) : 'ALL')}</small></span>`).join('')}</div></section>`;
  }
  const SHARED = ['year', 'skip', 'teams', 'names', 'tnames', 'opts', 'cfg', 'shown', 'watch', 'page', 'spin', 'spun', 'respins', 'turn', 'epoch', 'hostSide', 'auc', 'ready', 'watching', 'hostAcct'];
  let APP = null;   // the page element the versus screens draw into

  // ---------- online (an encrypted relay) ----------
  const PEER_SRC = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  // Online: both phones join a room on a public MQTT relay over a secure WebSocket (works on any network,
  // phone data or Wi-Fi, no direct phone-to-phone link to fail), with a second and third relay to fall back
  // on. Every message is encrypted with a key made from the room code (AES-GCM). Both phones ping every
  // 4 seconds; 15 seconds of silence shows the connection as lost, and it heals by itself when the other
  // phone is back (the host then sends the whole state again).
  const MQTT_SRC = 'https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js';
  const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081'];
  const SPEC = {};   // spectators the host has heard from lately
  const watchers = () => Object.keys(SPEC).filter(k => Date.now() - SPEC[k] < 12000).length;
  const NET = { role: null, side: 0, code: '', status: '', err: '', client: null, key: null, me: '', peerSeen: 0, broker: 0, timers: [] };
  const me = () => (NET.role ? NET.side : null);   // null: same phone, both sides
  const canAct = side => me() === null || me() === side;
  const online = () => !!NET.role;
  const linked = () => NET.status === 'connected';
  function loadMqtt() {
    if (window.mqtt) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = MQTT_SRC; s.onload = res; s.onerror = () => rej(new Error('Could not load the online connection. Check the internet and try again.'));
      document.head.appendChild(s);
    });
  }
  const topic = () => 'a13vs/v1/' + NET.code;
  async function keyFor(code) {
    const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('2k13-association-versus:' + code));
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  async function seal(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12)), data = new TextEncoder().encode(JSON.stringify(obj));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, NET.key, data));
    const all = new Uint8Array(iv.length + ct.length); all.set(iv); all.set(ct, iv.length);
    let b = ''; all.forEach(x => { b += String.fromCharCode(x); });
    return btoa(b);
  }
  async function open64(txt) {
    const all = Uint8Array.from(atob(txt), c => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, NET.key, all.slice(12));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  function send(obj) {
    if (!NET.client || !NET.key) return;
    if (NET.role === 'watch' && obj.t !== 'watch') return;   // a spectator only listens
    if (obj.t === 'hello') obj = Object.assign({}, obj, { acct: UI.profile.signedIn() });   // the host needs to know whether you have an account (ranked)
    seal(Object.assign({ from: NET.me, role: NET.role, ep: VS.epoch || 0 }, obj)).then(txt => { try { NET.client.publish(topic(), txt, { qos: 1 }); } catch (e) { /* reconnecting */ } }).catch(() => {});
  }
  function push() {
    if (NET.role === 'host') VS.hostAcct = UI.profile.signedIn();
    ls.set(VS);
    if (linked()) { const s = {}; SHARED.forEach(k => { s[k] = VS[k]; }); send({ t: 'state', s }); }
  }
  function seen() {
    NET.peerSeen = Date.now();
    if (NET.status !== 'connected') {
      NET.status = 'connected'; NET.err = ''; if (DC.at && rkOn(VS.cfg) && !RKDONE[rkKey(VS.cfg)]) DC.res = { on: true, me: false, them: false, until: Date.now() + 60000 }; DC.at = 0; DC.claimed = false; dcTick();
      if (NET.role === 'host') push(); else send({ t: NET.role === 'watch' ? 'watch' : 'hello', name: myName() });
      saveRoom(); syncLobby();
      route(); drawChat();
    }
  }
  function onMsg(m) {
    if (!m || typeof m !== 'object' || m.from === NET.me) return;
    if (m.t === 'watch') { if (NET.role === 'host') { const fresh = !SPEC[m.from] || Date.now() - SPEC[m.from] > 12000; SPEC[m.from] = Date.now(); if (fresh) { VS.watching = watchers(); push(); route(); } } return; }
    if (m.role === NET.role) {   // a third phone with our role, or two hosts after a handover: the newer epoch keeps the room
      if (NET.role === 'host' && (m.ep || 0) !== undefined) {
        const mine = VS.epoch || 0, theirs = m.ep || 0;
        if (theirs > mine || (theirs === mine && m.from < NET.me && theirs > 0)) { NET.role = 'guest'; NET.status = 'connecting'; send({ t: 'hello', name: myName() }); route(); }
        else push();
      }
      return;
    }
    if (m.t === 'conceded' && VS.cfg && VS.cfg.ranked) { rkOver(rkKey(VS.cfg)); if (UI.ranked) UI.ranked.noteForfeit('win'); UI.toast(who(1 - me()) + ' forfeited. You win.'); const el = document.getElementById('vsDc'); if (el) el.remove(); location.hash = '#/ranked/result'; return; }
    if (m.t === 'rematch' && VS.cfg && VS.cfg.ranked && m.seed === VS.cfg.seed) { RM.seed = VS.cfg.seed; RM.them = true; maybeRematch(); route(); return; }
    if (m.t === 'rresume') { if (!DC.res.on && rkOn(VS.cfg) && !RKDONE[rkKey(VS.cfg)]) DC.res = { on: true, me: false, them: false, until: Date.now() + 60000 }; DC.res.them = true; seen(); dcTick(); return; }
    if (m.t === 'bye') {   // the other player left: no need to wait the whole grace time for them (in a ranked game they have fifteen seconds to come back)
      if (NET.status === 'connected') { NET.status = 'lost'; DC.at = Date.now() - (rkOn(VS.cfg) ? GRACE - 15000 : 0); route(); drawChat(); dcTick(); }
      return;
    }
    if (m.t === 'ping') { seen(); return; }
    if (m.t === 'hello' && NET.role === 'host') {
      NET.peerAcct = !!m.acct;
      if (VS.opts.ranked && VS.opts.auction && !NET.peerAcct && !VS.cfg) {   // ranked needs two accounts: a guest is turned away
        send({ t: 'rankedonly' });
        UI.toast((m.name ? String(m.name).slice(0, 16) : 'A guest') + ' is a guest, so they cannot play a ranked game. They were turned away.', 'error');
        return;
      }
      if (VS.opts.ranked && VS.opts.auction && m.name && UI.ranked && UI.ranked.prefetch) UI.ranked.prefetch(String(m.name).slice(0, 20));   // start loading their lobby card right away
      if (VS.opts.ranked && VS.opts.auction && !VS.cfg && !QUICK && m.name && UI.ranked && UI.ranked.playedBefore) {   // each ranked matchup counts once
        const nm = String(m.name).slice(0, 20);
        UI.ranked.playedBefore(nm).then(pb => {
          if (!pb || VS.cfg || NET.role !== 'host') return;
          send({ t: 'rankedonly', why: 'played' });
          NET.status = 'waiting'; NET.peerSeen = 0; VS.names[1 - NET.side] = ''; VS.ready = [false, false]; push(); route();
          UI.toast(nm + ' is someone you already played in ranked. Each matchup counts once, so they were turned away.', 'error');
        });
      }
      if (m.name) VS.names[1 - NET.side] = String(m.name).slice(0, 20); uniqNames(); seen(); push(); route(); return;
    }
    if (m.t === 'ready' && NET.role === 'host') { VS.ready = (VS.ready || [false, false]).slice(); VS.ready[+m.i === 0 ? 0 : 1] = !!m.v; seen(); push(); route(); return; }
    if (m.t === 'rankedonly' && NET.role === 'guest' && m.why === 'played') { UI.toast('You already played that player in ranked. Each ranked matchup counts once, so pick another opponent.', 'error'); QUICK = 0; hangUp(); route(); return; }
    if (m.t === 'rankedonly' && NET.role === 'guest') { UI.toast('That room is ranked, so both players need an account. Sign in to join it.', 'error'); hangUp(); route(); return; }
    if (m.t === 'state' && m.s && (m.s.epoch || 0) >= (VS.epoch || 0)) {
      const prevEp = VS.epoch;
      SHARED.forEach(k => { if (k in m.s) VS[k] = m.s[k]; }); ls.set(VS);
      // the host handed the room over to this phone (a newer epoch that names our side as host)
      if (NET.role === 'guest' && prevEp >= 0 && VS.epoch > prevEp && VS.hostSide === NET.side) { VS.epoch--; becomeHost(true); return; }
      if (NET.role === 'guest') NET.side = 1 - (VS.hostSide || 0);
      seen(); route(); return;
    }
    seen();
    if (m.t === 'react' && REACTS.indexOf(m.r) >= 0) bubble(m.r, String(m.name || '').slice(0, 20), false);
    if (m.t === 'court' && courtCtl && WATCH === m.n) {   // the other phone tapped pause, play, a speed or skip
      if (m.k === 'speed') courtCtl.setSpeed(+m.v || 1); else if (m.k === 'play') courtCtl.play(); else if (m.k === 'pause') courtCtl.pause(); else if (m.k === 'skip') courtCtl.skipQuarter();
    }
    if (m.t === 'csync' && courtCtl && WATCH === m.n && NET.role !== 'host') {   // the host's clock: catch up, wait, or follow its pause and speed
      const s = courtCtl.state();
      SYNC_SEEN = Date.now();
      if (m.cur - s.cur > 3) courtCtl.seek(m.cur);
      courtCtl.hold(m.cur + 3);
      if (m.speed && s.speed !== m.speed) courtCtl.setSpeed(m.speed);
      if (m.playing && !s.playing) courtCtl.play(); else if (!m.playing && s.playing) courtCtl.pause();
      setTimeout(() => { if (courtCtl && Date.now() - SYNC_SEEN > 5000) courtCtl.hold(null); }, 5200);   // the host went quiet: carry on alone
    }
    if (m.t === 'typing') { CHAT.typingUntil = Date.now() + 3500; CHAT.typingName = String(m.name || '').slice(0, 20); showTyping(); setTimeout(showTyping, 3600); }
    if (m.t === 'chat' && m.text) { CHAT.typingUntil = 0; addChat({ name: String(m.name || '').slice(0, 20), text: String(m.text).slice(0, 300), mine: false }); }
  }
  // the other player takes the room: by choice (the host presses MAKE HOST) or when the host drops for good
  function becomeHost(chosen) {
    VS.epoch = (VS.epoch || 0) + 1; VS.hostSide = NET.side; NET.role = 'host';
    NET.status = 'waiting'; NET.peerSeen = 0; NET.err = ''; ls.set(VS);
    if (!chosen) UI.toast('The host dropped. You are the host now.');
    route(); drawChat();
    send({ t: 'ping', name: myName() });
  }
  function handOver() {
    if (NET.role !== 'host' || !linked()) return;
    if (!window.confirm('Make ' + who(1 - NET.side) + ' the host? They set the rules and run the room from here.')) return;
    VS.epoch = (VS.epoch || 0) + 1; VS.hostSide = 1 - NET.side;
    push(); NET.role = 'guest'; NET.status = 'connecting'; NET.peerSeen = Date.now(); route();
  }
  function hangUp() {
    QUICK = 0;
    NET.timers.forEach(t => clearInterval(t)); NET.timers = [];
    if (UI.ranked) UI.ranked.lobbyStop();
    const c = NET.client, end = () => { try { if (c) c.end(true); } catch (e) { /* gone */ } };
    if (c && NET.key && linked() && NET.role !== 'watch') {   // tell the other phone we left on purpose, so it does not wait for us
      const tp = topic();
      seal({ from: NET.me, role: NET.role, ep: VS.epoch || 0, t: 'bye' }).then(txt => { try { c.publish(tp, txt, { qos: 1 }, end); } catch (e) { end(); } setTimeout(end, 1500); }).catch(end);
    } else end();
    Object.assign(NET, { role: null, code: '', status: '', err: '', client: null, key: null, peerSeen: 0, peerAcct: undefined });
  }
  // connects to a relay (falling back to the next if one will not answer), joins the room, starts the pings
  function connectRoom(role, code, opt) {
    NET.timers.forEach(t => clearInterval(t)); NET.timers = [];
    try { if (NET.client) NET.client.end(true); } catch (e) { /* gone */ }
    Object.assign(NET, { role, side: role === 'host' ? (opt && opt.side != null ? opt.side : 0) : role === 'watch' ? -1 : 1, code, status: role === 'host' ? 'starting' : 'connecting', err: '', client: null, peerSeen: 0, me: Math.random().toString(36).slice(2, 10) });
  if (role === 'host') { VS.epoch = opt && opt.keep ? (VS.epoch || 0) + 1 : 0; VS.hostSide = NET.side; } else VS.epoch = -1;
    route();
    Promise.all([loadMqtt(), keyFor(code)]).then(([, key]) => {
      NET.key = key;
      const tryBroker = i => {
        if (NET.code !== code) return;
        const url = BROKERS[i % BROKERS.length];
        const client = window.mqtt.connect(url, { clientId: 'a13vs_' + NET.me + '_' + i, clean: true, connectTimeout: 7000, reconnectPeriod: 2000, keepalive: 20 });
        NET.client = client; NET.broker = i;
        let up = false;
        const giveUp = setTimeout(() => { if (!up && NET.client === client && i < BROKERS.length * 2 - 1) { try { client.end(true); } catch (e) { /* gone */ } tryBroker(i + 1); } }, 9000);
        client.on('connect', () => {
          up = true; clearTimeout(giveUp);
          client.subscribe(topic(), { qos: 1 }, () => {
            if (NET.status === 'starting') { NET.status = 'waiting'; syncLobby(); }
            if (NET.role === 'guest' && NET.status !== 'connected') NET.status = 'connecting';
            send({ t: NET.role === 'guest' ? 'hello' : NET.role === 'watch' ? 'watch' : 'ping', name: myName() });
            route();
          });
        });
        client.on('message', (t, buf) => { open64(buf.toString()).then(onMsg).catch(() => {}); });
        client.on('error', () => { /* mqtt.js retries on its own; the timer above moves to another relay if it never connects */ });
      };
      tryBroker(0);
      // pings both ways; silence means lost, a ping back heals it
      NET.timers.push(setInterval(() => {
        if (!NET.client || NET.code !== code) return;
        send({ t: NET.role === 'watch' ? 'watch' : NET.role === 'guest' && NET.status !== 'connected' ? 'hello' : 'ping', name: myName() });
        if (NET.role === 'host') { const nw = watchers(); if ((VS.watching || 0) !== nw) { VS.watching = nw; push(); route(); } }   // everyone sees how many are watching
        if (NET.status === 'connected') saveRoom();   // when we were last in the game: the rejoin banner counts the grace time from here
        if (NET.status === 'connected' && Date.now() - NET.peerSeen > 15000) { NET.status = 'lost'; DC.at = Date.now(); route(); drawChat(); dcTick(); }
        else if (NET.role === 'guest' && NET.status === 'lost' && Date.now() - NET.peerSeen > 25000 && VS.cfg) becomeHost(false);
      }, 4000));
      NET.timers.push(setInterval(dcTick, 1000));
      NET.timers.push(setInterval(() => { if (rkOn(VS.cfg) && !RKDONE[rkKey(VS.cfg)] && NET.client && NET.client.connected) UI.profile.rpc('ranked_ping', { p_key: rkKey(VS.cfg) }).catch(() => {}); }, 10000));   // proof that this phone is still in the game
      // a guest whose host never answers: say so, but keep listening
      if (role === 'guest' || role === 'watch') setTimeout(() => { if (NET.code === code && NET.status === 'connecting') { NET.err = 'No answer from room ' + code + ' yet. Check the code, and that your friend still has the room open. Still trying...'; NET.status = 'error-wait'; route(); } }, 20000);
    }).catch(e => { NET.status = 'error'; NET.err = e.message || 'The connection failed.'; route(); });
  }
  const CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 5 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join('');
  function host() { connectRoom('host', newCode()); }
  function watchRoom(code) { const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length >= 4) connectRoom('watch', c); }
  // a phone that reloads or drops can get back into its room from the setup page
  const ROOMKEY = 'a13-vs-room';
  function saveRoom() { try { if (NET.role && NET.code) localStorage.setItem(ROOMKEY, JSON.stringify({ code: NET.code, role: NET.role, side: NET.side, at: Date.now() })); } catch (e) { /* private mode */ } }
  function savedRoom() { try { const r = JSON.parse(localStorage.getItem(ROOMKEY) || 'null'); return r && r.code && Date.now() - (r.at || 0) < 6 * 3600 * 1000 ? r : null; } catch (e) { return null; } }
  function forgetRoom() { try { localStorage.removeItem(ROOMKEY); } catch (e) { /* private mode */ } }
  function join(code) { const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length >= 4) connectRoom('guest', c); }
  const joinLink = () => location.origin + location.pathname + '#/challenge/vs/join/' + NET.code;
  const watchLink = () => location.origin + location.pathname + '#/challenge/vs/watch/' + NET.code;
  // ---------- ranked: the series is logged when the auction starts; a player who stays gone past the grace time forfeits ----------
  let FF = 0;   // the first tap on Forfeit is remembered here, because the page redraws and a flag on the button would be lost
  const RKDONE = {}, DC = { at: 0, claimed: false, res: { on: false, me: false, them: false, until: 0 } }, GRACE = 90000;
  const rkKey = cfg => NET.code + ':' + cfg.seed;
  const OVERKEY = 'a13-rk-over';
  function rkOver(key) { RKDONE[key] = 1; try { localStorage.setItem(OVERKEY, key); } catch (e) { /* private mode */ } }
  const rkOn = cfg => !!(cfg && cfg.ranked && online() && me() !== null && me() >= 0 && UI.ranked && UI.profile.signedIn() && NET.code);
  function rkStart(cfg) { if (rkOn(cfg)) UI.ranked.started({ key: rkKey(cfg), opp: who(1 - me()), era: UI.ranked.eraOf(cfg), style: 'auction', ranked: true, bestOf: cfg.bestOf || 7 }); }
  const resOn = () => !!(DC.res.on && rkOn(VS.cfg) && NET.status === 'connected' && !RKDONE[rkKey(VS.cfg)]);
  const paused = () => dcOn() || resOn();   // the shot clock waits while a player is gone or has just come back
  const dcOn = () => !!(rkOn(VS.cfg) && NET.status === 'lost' && DC.at && !RKDONE[rkKey(VS.cfg)]);
  async function claimForfeit() {
    DC.claimed = true;
    const cfg = VS.cfg, key = rkKey(cfg);
    const ok = await UI.ranked.forfeit({ key, opp: who(1 - me()), era: UI.ranked.eraOf(cfg), bestOf: cfg.bestOf || 7 });
    if (ok) { rkOver(key); const el = document.getElementById('vsDc'); if (el) el.remove(); location.hash = '#/ranked/result'; }
    else { DC.tries = (DC.tries || 0) + 1; if (DC.tries >= 2) { rkOver(key); const el = document.getElementById('vsDc'); if (el) el.remove(); location.hash = '#/ranked/result'; } else { DC.claimed = false; DC.at = Date.now() - GRACE + 15000; } }   // refused: the series may already be settled (they gave up), so the result screen checks
  }
  function dcTick() {
    let el = document.getElementById('vsDc');
    if (resOn()) {   // back after a drop: both press ready before the game goes on
      if ((DC.res.me && DC.res.them) || Date.now() > DC.res.until) { DC.res.on = false; if (el) el.remove(); return; }
      if (!el) { el = document.createElement('div'); el.id = 'vsDc'; el.className = 'vs-dc'; document.body.appendChild(el); }
      const other = who(1 - me());
      el.innerHTML = `<div class="vs-dc-box"><small>RANKED GAME PAUSED</small><h2>WELCOME BACK.</h2><p>Both players press ready and the game carries on where it stopped. ${esc(other)}: <b>${DC.res.them ? 'READY' : 'NOT YET'}</b>.</p><button type="button" class="btn btn-gold btn-big" id="vsRes"${DC.res.me ? ' disabled' : ''}>${DC.res.me ? 'WAITING...' : 'I AM READY'}</button></div>`;
      const b = el.querySelector('#vsRes'); if (b) b.addEventListener('click', () => { DC.res.me = true; send({ t: 'rresume' }); dcTick(); });
      return;
    }
    if (!dcOn()) { if (el) el.remove(); return; }
    const left = Math.max(0, DC.at + GRACE - Date.now()), mm = Math.floor(left / 60000), ss = String(Math.floor(left / 1000) % 60).padStart(2, '0');
    const onl = !!(NET.client && NET.client.connected), other = who(1 - me());
    if (!el) { el = document.createElement('div'); el.id = 'vsDc'; el.className = 'vs-dc'; document.body.appendChild(el); }
    el.innerHTML = onl
      ? `<div class="vs-dc-box"><small>RANKED GAME PAUSED</small><h2>${esc(other.toUpperCase())} DISCONNECTED.</h2><p>They have <b>${mm}:${ss}</b> to get back. If they do not, you win by forfeit and the rating points are yours.</p><div class="ch-spin-ring"></div></div>`
      : `<div class="vs-dc-box"><small>RANKED GAME PAUSED</small><h2>YOU ARE OFFLINE.</h2><p>Reconnecting on its own. Keep this page open. You can not play a ranked game while disconnected, and if you are not back in time you forfeit.</p><div class="ch-spin-ring"></div></div>`;
    if (left <= 0 && onl && !DC.claimed) claimForfeit();
  }
  function netBar() {
    if (!online()) return '';
    if (NET.role === 'watch') return `<div class="vs-net ${NET.status}"><span class="vs-net-dot"></span><span>${NET.status === 'connected' ? 'Watching room <b>' + esc(NET.code) + '</b>: <b>' + esc(who(0)) + '</b> vs <b>' + esc(who(1)) + '</b>. You see everything live.' + ((VS.watching || 0) ? ' <span class="vs-spec">&#128065; ' + VS.watching + ' WATCHING</span>' : '') : NET.status === 'error-wait' || NET.status === 'error' ? esc(NET.err) : 'Joining room <b>' + esc(NET.code) + '</b> to watch...'}</span><button type="button" class="btn btn-small" id="vsLeave">LEAVE</button></div>`;
    const st = NET.status, other = who(1 - NET.side);
    const msg = st === 'connected' ? `Connected with <b>${UI.userLink ? UI.userLink(other, true) : esc(other)}</b>. You are ${esc(who(me()))}.`
      : st === 'waiting' ? `Room <b>${esc(NET.code)}</b>: send your friend the link, then wait here.`
      : st === 'connecting' || st === 'starting' ? 'Connecting...'
      : st === 'code' ? 'Type the room code your friend sees on his phone.'
      : st === 'lost' ? 'Lost the other phone. Reconnecting on its own when it is back...'
      : st === 'error-wait' ? esc(NET.err) : esc(NET.err || 'Not connected.');
    return `<div class="vs-net ${st}"><span class="vs-net-dot"></span><span>${msg}</span>
      ${st === 'waiting' ? `<button type="button" class="btn btn-small" id="vsCopy">COPY LINK</button>` : ''}
      ${NET.role === 'host' && (st === 'waiting' || st === 'connected') ? `<button type="button" class="btn btn-small" id="vsCopyWatch">COPY WATCH LINK</button>` : ''}
      ${st === 'connected' && (VS.watching || 0) ? `<span class="vs-spec">&#128065; ${VS.watching} WATCHING</span>` : ''}
      ${NET.role === 'host' && st === 'connected' ? `<button type="button" class="btn btn-small" id="vsHand">MAKE ${esc(who(1 - NET.side).toUpperCase())} HOST</button>` : ''}
      ${st === 'connected' && me() !== null && me() >= 0 && UI.profile.signedIn() ? '<span class="vs-fr" id="vsFriend"></span>' : ''}
      ${st === 'lost' || st === 'error' ? `<button type="button" class="btn btn-small" id="vsRetry">${NET.role === 'host' ? 'NEW ROOM' : 'TRY AGAIN'}</button>` : ''}
      ${rkOn(VS.cfg) && !RKDONE[rkKey(VS.cfg)] ? '<button type="button" class="btn btn-small btn-danger" id="vsForfeit">' + (Date.now() < FF ? 'TAP AGAIN TO FORFEIT' : 'FORFEIT') + '</button>' : ''}
      ${rkOn(VS.cfg) && !RKDONE[rkKey(VS.cfg)] ? '' : '<button type="button" class="btn btn-small" id="vsLeave">LEAVE</button>'}</div>`;   // no Leave in a live ranked game: it would count as a forfeit, so only the two-tap Forfeit is there
  }
  // next to the other player: add as a friend, or that you already are
  function fillFriend(app) {
    const el = UI.$('#vsFriend', app);
    if (!el || me() === null || me() < 0 || !UI.profile.signedIn()) return;
    const name = who(1 - me());
    if (!name || /^PLAYER \d$/.test(name)) return;
    const paint = st => {
      const e = UI.$('#vsFriend', app); if (!e) return;
      if (st === 'friends') e.innerHTML = '<span class="vs-fr ok">&#10003; ' + esc(name.toUpperCase()) + ' IS YOUR FRIEND</span>';
      else if (st === 'sent') e.innerHTML = '<span class="muted">FRIEND REQUEST SENT</span>';
      else if (st === 'none' || st === 'incoming') { e.innerHTML = '<button type="button" class="btn btn-small btn-gold" id="vsAddFr">' + (st === 'incoming' ? 'ACCEPT FRIEND REQUEST' : 'ADD ' + esc(name.toUpperCase()) + ' AS FRIEND') + '</button>'; const b = UI.$('#vsAddFr', app); b.addEventListener('click', () => { b.disabled = true; UI.profile.addFriend(name).then(s2 => { paint(s2); UI.toast(s2 === 'friends' ? 'You are now friends with ' + name + '.' : 'Friend request sent to ' + name + '.'); }).catch(() => { b.disabled = false; UI.toast('Could not send the request.', 'error'); }); }); }
      else e.innerHTML = '';   // a guest or yourself: nothing to add
    };
    UI.profile.friendState(name).then(paint).catch(() => {});
  }
  function bindNet(app) {
    fillFriend(app);
    const rb = UI.$('#vsRules', app); if (rb) rb.addEventListener('click', () => { const bx = UI.$('#vsRulesBox', app); if (bx) bx.hidden = !bx.hidden; });
    const cp = UI.$('#vsCopy', app);
    if (cp) cp.addEventListener('click', async () => {
      const link = joinLink(), text = 'Draft me on Starting Five. Room ' + NET.code + ': ' + link;
      if (navigator.share) { try { await navigator.share({ text, url: link }); return; } catch (e) { /* closed */ } }
      try { await navigator.clipboard.writeText(link); UI.toast('Link copied. Send it to your friend.'); } catch (e) { UI.toast(link); }
    });
    const hd = UI.$('#vsHand', app); if (hd) hd.addEventListener('click', handOver);
    const rt = UI.$('#vsRetry', app); if (rt) rt.addEventListener('click', () => (NET.role === 'host' ? host() : join(NET.code)));
    const cw = UI.$('#vsCopyWatch', app);
    if (cw) cw.addEventListener('click', async () => { try { await navigator.clipboard.writeText(watchLink()); UI.toast('Watch link copied. Anyone with it can watch.'); } catch (e) { UI.toast(watchLink()); } });
    const lv = UI.$('#vsLeave', app); if (lv) lv.addEventListener('click', () => { forgetRoom(); hangUp(); route(); });
    const ff = UI.$('#vsForfeit', app); if (ff) ff.addEventListener('click', () => {   // two taps, so a stray tap never costs rating
      if (Date.now() < FF) { FF = 0; ff.textContent = 'FORFEITING...'; ff.disabled = true; concede().then(() => { if (ff.isConnected) { ff.disabled = false; ff.textContent = 'FORFEIT'; } }); return; }
      FF = Date.now() + 6000; ff.textContent = 'TAP AGAIN TO FORFEIT';
      setTimeout(() => { if (ff.isConnected && Date.now() >= FF) ff.textContent = 'FORFEIT'; }, 6100);
    });
  }

  // ---------- trash talk: quick reactions that pop up on both phones (online) ----------
  const REACTS = ['🔥', '😂', '😬', '👀', '🧱', '🐐', 'REACH', 'STEAL', 'COOKED', 'GG'];
  let lastReact = 0;
  function bubble(r, name, mine) {
    let host = document.getElementById('vsBubbles');
    if (!host) { host = document.createElement('div'); host.id = 'vsBubbles'; host.className = 'vs-bubbles'; document.body.appendChild(host); }
    const b = document.createElement('div');
    b.className = 'vs-bubble' + (mine ? ' mine' : '') + (/^[A-Z]/.test(r) ? ' word' : '');
    b.innerHTML = `<small>${esc(name)}</small><b>${esc(r)}</b>`;
    host.appendChild(b);
    setTimeout(() => b.classList.add('go'), 2400);
    setTimeout(() => b.remove(), 3000);
  }
  function reactBar() {
    if (!linked() || NET.role === 'watch') return '';
    return `<div class="vs-react" role="group" aria-label="Reactions">${REACTS.map(r => `<button type="button" data-react="${esc(r)}"${/^[A-Z]/.test(r) ? ' class="word"' : ''}>${esc(r)}</button>`).join('')}</div>`;
  }
  function bindReact(app) {
    app.querySelectorAll('[data-react]').forEach(b => b.addEventListener('click', () => {
      const now = Date.now();
      if (now - lastReact < 1200) return;
      lastReact = now;
      const r = b.dataset.react, name = who(me());
      bubble(r, name, true);
      if (linked()) send({ t: 'react', r, name });
    }));
  }

  // ---------- chat (online): a message panel on both phones ----------
  const CHAT = { list: [], open: false, unread: 0, typingUntil: 0, typingName: '', sentAt: 0 };
  // "X is typing": only the indicator is touched, so what you are typing yourself is never redrawn away
  function showTyping() {
    const on = Date.now() < CHAT.typingUntil, line = on ? esc(CHAT.typingName || who(me() === 0 ? 1 : 0)) + ' is typing...' : '';
    const el = document.getElementById('vsTyping'); if (el) el.innerHTML = line;
    const b = document.getElementById('vsChatTyping'); if (b) b.textContent = on ? ' | typing...' : '';
  }
  function addChat(msg) {
    CHAT.list.push(Object.assign({ at: Date.now() }, msg));
    if (CHAT.list.length > 100) CHAT.list.shift();
    if (!msg.mine && !CHAT.open) { CHAT.unread++; bubble('💬 ' + msg.text.slice(0, 40), msg.name, false); }
    drawChat();
  }
  function drawChat() {
    let box = document.getElementById('vsChat');
    if (!linked() || NET.role === 'watch' || !/^#\/challenge\/vs/.test(location.hash)) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div'); box.id = 'vsChat'; box.className = 'vs-chat';
      document.body.appendChild(box);
      box.addEventListener('click', e => {
        if (e.target.closest('[data-chat="toggle"]')) { CHAT.open = !CHAT.open; if (CHAT.open) CHAT.unread = 0; drawChat(); if (CHAT.open) { const i = box.querySelector('input'); if (i) i.focus(); } }
      });
      box.addEventListener('input', e => {
        if (e.target.tagName !== 'INPUT' || Date.now() - CHAT.sentAt < 2000) return;
        CHAT.sentAt = Date.now(); send({ t: 'typing', name: who(me()) });
      });
      box.addEventListener('submit', e => {
        e.preventDefault();
        const i = box.querySelector('input'), text = (i.value || '').trim().slice(0, 300);
        if (!text) return;
        i.value = '';
        const name = who(me());
        addChat({ name, text, mine: true });
        send({ t: 'chat', text, name });
        const again = box.querySelector('input'); if (again) again.focus();
      });
    }
    const msgs = CHAT.list.map(m => `<li class="${m.mine ? 'mine' : ''}"><small>${esc(m.name)}</small><span>${esc(m.text)}</span></li>`).join('');
    box.innerHTML = `<button type="button" class="vs-chat-btn" data-chat="toggle" aria-expanded="${CHAT.open}">💬 CHAT<small id="vsChatTyping"></small>${CHAT.unread ? `<b>${CHAT.unread}</b>` : ''}</button>
      ${CHAT.open ? `<div class="vs-chat-panel"><div class="vs-chat-h"><span>CHAT WITH ${esc(who(me() === 0 ? 1 : 0)).toUpperCase()}</span><button type="button" data-chat="toggle" aria-label="Close chat">&times;</button></div>
        <ol class="vs-chat-list">${msgs || '<li class="muted">Say something. Trash talk welcome.</li>'}</ol><div class="vs-typing" id="vsTyping" aria-live="polite"></div>
        <form class="vs-chat-form"><input maxlength="300" placeholder="Message" autocomplete="off" enterkeyhint="send"><button type="submit" class="btn btn-gold btn-small">SEND</button></form></div>` : ''}`;
    const list = box.querySelector('.vs-chat-list'); if (list) list.scrollTop = list.scrollHeight;
    showTyping();
  }
  window.addEventListener('hashchange', drawChat);

  // ---------- routing ----------
  function route() {
    if (!/^#\/challenge\/vs/.test(location.hash)) return;   // the user went elsewhere (the menu, another mode): a ping must not pull the page back
    const target = '#/challenge/vs' + (VS.page === 'draft' ? '/draft' : VS.page === 'series' ? '/result' : '');
    if (location.hash.split('?')[0] !== target) { location.hash = target; return; }
    if (!APP) return;
    if (VS.page === 'draft') draft(APP); else if (VS.page === 'series') series(APP); else setup(APP);
  }
  function go(page) { VS.page = page; push(); route(); window.scrollTo(0, 0); }

  // rosters would not load: stay in the game (the room is still open) and offer to try again
  function loadFail(app, e, retry) {
    app.innerHTML = UI.empty('ROSTERS DID NOT LOAD', esc((e && e.message) || e) + ' Your game is still here.', '<div class="row-btns"><button type="button" class="btn btn-gold" id="vsRetryLoad">TRY AGAIN</button>' + (online() ? '' : '<a class="btn" href="#/challenge">BACK</a>') + '</div>');
    const b = UI.$('#vsRetryLoad', app); if (b) b.addEventListener('click', () => { b.disabled = true; retry(); });
    setTimeout(() => { if (UI.$('#vsRetryLoad') && /^#\/challenge\/vs/.test(location.hash)) retry(); }, 8000);   // and it tries again by itself
  }
  function loadThen(app, year, fn) {
    if (!year) {   // every season: the all-time pool plus the 2012-13 franchises
      // players drafted from a landed season's full roster need that season's file, also after a reload
      const yrs = [...new Set([].concat(...((VS.cfg && VS.cfg.sides) || []).map(sd => sd.picks)).map(k => +String(k).split('@')[1]).filter(y => y && y !== 2013 && !C.loaded(y)))];
      if (C.loaded('pool') && C.loaded(2013) && !yrs.length) { fn(); return; }
      app.innerHTML = '<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING EVERY SEASON...</div></section>';
      Promise.all([C.load('pool'), C.load(2013)].concat(yrs.map(y => C.load(y)))).then(() => fn()).catch(e => loadFail(app, e, () => loadThen(app, year, fn)));
      return;
    }
    if (C.loaded(year)) { fn(); return; }
    app.innerHTML = `<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING THE ${esc(lbl(year))} ROSTERS...</div></section>`;
    C.load(year).then(fn).catch(e => loadFail(app, e, () => loadThen(app, year, fn)));
  }

  // ---------- setup ----------
  let KEEP = null;   // scroll position to restore after the next setup draw
  // the auction's options: pool size, money, opening price, raise, who is in the pool, whether it shows
  function aucSetup(boss) {
    const o = VS.opts, per = 5 + (+o.bench > 0 ? +o.bench : 0), dis = boss ? '' : ' disabled';
    const row = (k, label, key, list, note) => `<div><span class="ts-start-k">${label}</span><div class="ch-chips">${list.map(([v, l]) => `<button type="button" class="ch-chip${o[key] === v ? ' on' : ''}" data-a="${key}:${v}"${dis}>${l}</button>`).join('')}</div>${note ? `<small class="muted">${note}</small>` : ''}</div>`;
    const need = 2 * per;
    return `<div class="vs-auc-set">
      ${row('p', 'POOL SIZE', 'aPool', [[need, need + ' (EXACT)'], [10, '10'], [12, '12'], [16, '16'], [20, '20'], [30, '30']].filter(([v], i, a) => v >= need && a.findIndex(x => x[0] === v) === i), 'The pool is hidden. Players come up one at a time, and the draft ends when you both have ' + per + '. A bigger pool leaves some players unsold.')}
      ${row('b', 'MONEY EACH', 'aBudget', [[10, '$10'], [15, '$15'], [20, '$20'], [30, '$30'], [50, '$50']])}
      ${row('s', 'OPENING PRICE', 'aStart', [[1, '$1'], [2, '$2'], [3, '$3']], 'Each side must keep this much for every empty roster spot.')}
      ${row('r', 'EACH RAISE', 'aRaise', [[1, '+$1'], [2, '+$2'], [5, '+$5']])}
      ${row('q', 'WHO IS IN THE POOL', 'aQ', [['stars', 'STARS'], ['mixed', 'MIXED'], ['any', 'ANYONE']], o.aQ === 'stars' ? 'Drawn from the 60 best players in the seasons you picked.' : o.aQ === 'mixed' ? 'Drawn from the 200 best.' : 'Anyone who played, stars and role players.')}
      ${row('v', 'THE POOL', 'aShow', [[0, 'HIDDEN'], [1, 'VISIBLE']], o.aShow ? 'Everyone sees who is still to come.' : 'You only see the player who is up.')}
    </div>`;
  }
  // ranked (an auction between two signed-in players counts for the ladder) and listing the room as an open game
  function rankedSetup(boss) {
    if (!online() || !UI.profile.signedIn() || NET.role === 'watch') return '';
    const dis = boss ? '' : ' disabled';
    const guestPeer = linked() && NET.role === 'host' && NET.peerAcct === false;   // the other player is a guest: no ladder for this game
    return `<div><span class="ts-start-k">RANKED AND OPEN GAMES</span><div class="ch-chips"><a class="ch-chip" href="#/ranked">RANKED LADDER AND FIND A MATCH</a>
        ${VS.opts.ranked && VS.opts.auction ? '<span class="ch-chip on">RANKED GAME</span>' : ''}
        ${NET.role === 'host' ? `<button type="button" class="ch-chip${VS.opts.pub ? ' on' : ''}" data-rk="pub"${dis}>${VS.opts.pub ? 'OPEN GAME: LISTED' : 'OPEN GAME: PRIVATE'}</button>` : ''}</div>
      <small class="muted">${guestPeer ? 'The other player is a guest, so this game is casual.' : VS.opts.ranked && VS.opts.auction ? 'Ranked has one set of rules: best of 7, a blind draft, a 24 second shot clock, no duplicates, just the five. An auction with a hidden pool of ten mixed players, $20 each, $1 to open, raises of $1 or more. It moves your ladder rating for this era.' : 'This is a casual game and does not touch the ladder. To play ranked, use the Ranked tile on the main menu.'} ${VS.opts.pub ? 'Anyone can find this room under Ranked, Casual rooms, until someone joins.' : ''}</small></div>`;
  }
  function syncLobby() {
    if (!UI.ranked) return;
    if (NET.role === 'host' && NET.status === 'waiting' && VS.opts.pub && UI.profile.signedIn()) {
      const ch = chosen();
      UI.ranked.lobbyStart({ code: NET.code, era: UI.ranked.eraOf({ year: ch.length === 1 ? ch[0] : 0, seasons: ch.length > 1 && ch.length < ALL_YEARS.length ? ch : null }), style: VS.opts.auction ? 'auction' : VS.opts.board ? 'board' : 'wheel', ranked: !!(VS.opts.ranked && VS.opts.auction) });
    } else UI.ranked.lobbyStop();
  }
  function setup(app) {
    if (!QUICK && NET.role !== 'guest' && VS.opts.ranked) VS.opts.ranked = 0;   // ranked starts from the Ranked tile only
    stopTick();
    loadThen(app, VS.year, () => {
      const d = C.seasonData(VS.year || 2013), teams = d.teams.slice().sort((a, b) => tName(a).localeCompare(tName(b)));
      VS.teams = VS.teams.map((a, i) => teams.some(t => t.abbr === a) ? a : teams[i].abbr);
      if (VS.teams[0] === VS.teams[1]) VS.teams[1] = teams.find(t => t.abbr !== VS.teams[0]).abbr;
      const boss = NET.role !== 'guest' && NET.role !== 'watch';   // the host (or the one phone) sets the season and the rules
      const dis = c => (c ? '' : ' disabled');
      const grid = i => `<div class="ch-teams">${teams.map(t => `<button type="button" class="ch-team${VS.teams[i] === t.abbr ? ' on' : ''}" data-side="${i}" data-team="${esc(t.abbr)}"${VS.teams[1 - i] === t.abbr || !canAct(i) ? ' disabled' : ''} style="--c1:${esc(t.colors[0])}">${logo(t, 30)}<span>${esc(t.name)}</span></button>`).join('')}</div>`;
      // a carousel of teams for each player (swipe it, tap the arrows, or SPIN for a random one)
      const wheel = i => `<div class="tc" data-car="${i}"><button type="button" class="tc-ar" data-arrow="${i}:-1" aria-label="Earlier teams">&lsaquo;</button><div class="tc-strip">${teams.map(t => `<button type="button" class="tc-t${VS.teams[i] === t.abbr ? ' on' : ''}" data-side="${i}" data-team="${esc(t.abbr)}"${VS.teams[1 - i] === t.abbr || !canAct(i) ? ' disabled' : ''} style="--c1:${esc(t.colors[0])}">${logo(t, 44)}<span>${esc(t.abbr)}</span></button>`).join('')}</div><button type="button" class="tc-ar" data-arrow="${i}:1" aria-label="Later teams">&rsaquo;</button></div>
        <div class="tc-bar"><span class="tc-name">${esc(tName(tOf(teams, VS.teams[i])))}</span><button type="button" class="btn btn-small" data-spin="${i}"${canAct(i) ? '' : ' disabled'}>&#8635; SPIN</button></div>`;
      const ch0 = chosen(), seasonSum = !ch0.length ? 'NONE PICKED' : ch0.length === ALL_YEARS.length ? 'EVERY SEASON' : lblC({ year: ch0.length === 1 ? ch0[0] : 0, seasons: ch0.length > 1 ? ch0 : null });
      const rulesSum = ['BEST OF ' + VS.opts.bestOf, VS.opts.auction ? 'AUCTION' : VS.opts.board ? 'OPEN BOARD' : 'WHEEL', VS.opts.bench ? '8-MAN' : 'JUST THE FIVE'].concat(VS.opts.ranked && VS.opts.auction ? ['RANKED'] : [], VS.opts.cap && !VS.opts.auction ? ['$' + VS.opts.cap + 'M CAP'] : [], VS.opts.timer ? ['24 SEC CLOCK'] : [], VS.opts.bans && !VS.opts.auction ? [VS.opts.bans + ' BAN' + (VS.opts.bans > 1 ? 'S' : '') + ' EACH'] : []).join(' | ');
      const opened = k => (VS.det && VS.det[k] ? ' open' : '');
      const lockR = !!(VS.opts.ranked && VS.opts.auction && online());   // ranked has one set of rules: they cannot be changed, and the 24 second shot clock is always on
      if (me() !== null && me() >= 0 && UI.profile.name() && VS.names[me()] !== UI.profile.name()) { VS.names[me()] = UI.profile.name(); if (NET.role === 'guest') send({ t: 'hello', name: VS.names[me()] }); else { uniqNames(); push(); } }   // online, your name is your account
      const ready = !online() || linked();
      app.innerHTML = `
        <section class="ch-hero"><div class="ch-hero-k">DRAFT CHALLENGE | TWO PLAYERS</div><h1 class="ch-hero-t">YOU VS ME.</h1>
          <p class="ch-hero-p">Take turns spinning the wheel and taking one player from the team it lands on, until you both have five (or switch the wheel off and draft from an open board). Then a series: nobody comes off the bench, all five play 48 minutes, so positions and fit matter.</p></section>
        ${netBar()}
        <div class="ch-setup vs-setup">
          ${UI.profile.bar()}${PEND ? `<p class="muted">Pick a name below to join room <b>${esc(PEND)}</b>.</p>` : ''}
          <div class="ch-step"><div class="ch-step-k">1 | HOW YOU PLAY</div>
            <div class="ch-seg vs-seg3"><button type="button" class="ch-seg-b${!online() ? ' on' : ''}" data-net="local"><b>SAME PHONE</b><small>Pass it back and forth</small></button>
              <button type="button" class="ch-seg-b${NET.role === 'host' ? ' on' : ''}" data-net="host"><b>HOST ONLINE</b><small>Get a room code for your friend</small></button>
              <button type="button" class="ch-seg-b${NET.role === 'guest' ? ' on' : ''}" data-net="join"><b>JOIN ONLINE</b><small>Enter your friend's code</small></button></div>
            ${!online() && savedRoom() ? `<div class="vs-join"><button type="button" class="btn btn-gold" id="vsRejoin">REJOIN ROOM ${esc(savedRoom().code)}${savedRoom().role === 'watch' ? ' (WATCHING)' : ''}</button><button type="button" class="btn btn-small" id="vsForget">FORGET IT</button></div>` : ''}
            ${!online() || (NET.role === 'guest' && !linked()) ? '<div id="vsCasual" class="vs-casual"></div>' : ''}
            ${NET.role === 'guest' && !linked() ? `<div class="vs-join"><label class="field"><span>ROOM CODE</span><input id="vsCode" maxlength="5" placeholder="ABCDE" value="${esc(NET.code)}" autocomplete="off" autocapitalize="characters"></label><button type="button" class="btn btn-gold" id="vsJoin">JOIN</button><button type="button" class="btn" id="vsWatchBtn">WATCH INSTEAD</button></div>` : ''}
          </div>
          <details class="ch-step vs-det" data-det="s2"${opened('s2')}><summary class="ch-step-k">2 | THE SEASON <em>${esc(seasonSum)}</em></summary><div class="row-btns vs-seas-all"><button type="button" class="btn btn-small${!VS.skip.length ? ' on' : ''}" data-seas="all"${dis(boss)}>ALL</button><button type="button" class="btn btn-small" data-seas="none"${dis(boss)}>CLEAR</button>${DECADES().length > 1 ? DECADES().map(d => { const ys = ALL_YEARS.filter(y => decOf(y) === d), n = ys.filter(y => VS.skip.indexOf(y) < 0).length; return `<button type="button" class="btn btn-small${n === ys.length ? ' on' : n ? ' part' : ''}" data-dec="${d}"${dis(boss)}>${d}s</button>`; }).join('') : ''}<span class="muted">${chosen().length} of ${ALL_YEARS.length} on</span></div>
            <div class="vs-seas">${C.SEASONS.map(s => `<button type="button" class="ch-chip${VS.skip.indexOf(s.year) < 0 ? ' on' : ''}" data-yr="${s.year}"${dis(boss)}>${esc(s.label)}</button>`).join('')}</div>
            <small class="muted">${!chosen().length ? 'Pick at least one season.' : chosen().length === 1 ? 'One season: the whole ' + esc(lbl(chosen()[0])) + ' league.' : 'Every spin lands on a team and a season from the ones on. Nobody can be drafted twice, even from different seasons. Tap a season to switch it off.'}</small></details>
          <details class="ch-step vs-det" data-det="s3"${opened('s3')}><summary class="ch-step-k">3 | THE RULES <em>${esc(rulesSum)}</em></summary>
            <div class="vs-rules"><div><span class="ts-start-k">SERIES</span><div class="ch-chips">${[3, 5, 7].map(n => `<button type="button" class="ch-chip${VS.opts.bestOf === n ? ' on' : ''}" data-bo="${n}"${dis(boss && !lockR)}>BEST OF ${n}</button>`).join('')}</div></div>
              <div><span class="ts-start-k">SHOT CLOCK</span><div class="ch-chips">${(lockR ? [[24, '24 SEC']] : [[24, '24 SEC'], [0, 'OFF']]).map(([v, l]) => `<button type="button" class="ch-chip${(VS.opts.timer || 0) === v ? ' on' : ''}" data-timer="${v}"${dis(boss && !lockR)}>${l}</button>`).join('')}</div>
                <small class="muted">${VS.opts.timer ? 'Run out of time and the wheel spins for you, or you get the best player on its team.' : 'No clock.'}</small></div>
              ${chosen().length === 1 ? '' : `<div><span class="ts-start-k">GAME RULES</span><div class="ch-chips">${ERAS.map(([v, l]) => `<button type="button" class="ch-chip${(VS.opts.era || 2013) === v ? ' on' : ''}" data-era="${v}"${dis(boss && !lockR)}>${l}</button>`).join('')}</div></div>`}
              <div><span class="ts-start-k">BLIND DRAFT</span><div class="ch-chips"><button type="button" class="ch-chip${!VS.opts.blind ? ' on' : ''}" data-blind="0"${dis(boss && !lockR)}>OFF</button><button type="button" class="ch-chip${VS.opts.blind ? ' on' : ''}" data-blind="1"${dis(boss && !lockR)}>ON</button></div>
                <small class="muted">${VS.opts.cap ? 'Off with a salary cap: the prices give the ratings away.' : VS.opts.blind ? 'No ratings and no fit grades until the series is over: pick on what you know.' : 'Ratings and fit grades show while you draft.'}</small></div>
              ${chosen().length === 1 ? '' : `<div><span class="ts-start-k">SAME PLAYER TWICE</span><div class="ch-chips"><button type="button" class="ch-chip${!VS.opts.dupes ? ' on' : ''}" data-dupes="0"${dis(boss && !lockR)}>NO DUPLICATES</button><button type="button" class="ch-chip${VS.opts.dupes ? ' on' : ''}" data-dupes="1"${dis(boss && !lockR)}>DUPLICATES ON</button></div>
                <small class="muted">${VS.opts.dupes ? 'The same player can be drafted from different seasons, so you can stack every Giannis. Only that exact season is gone once taken.' : 'A player is gone for good once taken, whatever the season.'}</small></div>`}
              <div><span class="ts-start-k">DRAFT STYLE</span><div class="ch-chips"><button type="button" class="ch-chip${!VS.opts.board && !VS.opts.auction ? ' on' : ''}" data-board="0"${dis(boss && !lockR)}>THE WHEEL</button><button type="button" class="ch-chip${VS.opts.board && !VS.opts.auction ? ' on' : ''}" data-board="1"${dis(boss && !lockR)}>OPEN BOARD</button><button type="button" class="ch-chip${VS.opts.auction ? ' on' : ''}" data-board="2"${dis(boss && !lockR)}>AUCTION</button></div>
                <small class="muted">${VS.opts.auction ? 'A hidden pool of players goes up one at a time. Start at the opening price and take turns raising, or pass and let the other side have him. Everyone has the same money.' : VS.opts.board ? 'No wheel: take turns picking anyone left from the whole board. Drafted players come off it.' : 'Every pick comes from the team the wheel lands on.'}</small></div>
              ${rankedSetup(boss)}
              ${VS.opts.auction ? aucSetup(boss && !(VS.opts.ranked && online())) : `<div><span class="ts-start-k">BANS</span><div class="ch-chips">${[[0, 'NONE'], [1, '1 EACH'], [2, '2 EACH']].map(([v, l]) => `<button type="button" class="ch-chip${(VS.opts.bans || 0) === v ? ' on' : ''}" data-bans="${v}"${dis(boss && !lockR)}>${l}</button>`).join('')}</div>
                <small class="muted">${VS.opts.bans ? 'Before the draft you take turns banning players. A banned player is off the wheel and the board for both of you.' : 'Nobody is banned.'}</small></div>`}
              <div><span class="ts-start-k">BENCH</span><div class="ch-chips"><button type="button" class="ch-chip${!VS.opts.bench ? ' on' : ''}" data-bench="0"${dis(boss && !lockR)}>JUST THE FIVE</button><button type="button" class="ch-chip${VS.opts.bench ? ' on' : ''}" data-bench="3"${dis(boss && !lockR)}>8-MAN: +3 BENCH</button></div>
                <small class="muted">${VS.opts.bench ? 'Everyone drafts eight. The first five start, the last three come off the bench (with a salary cap the cap grows to cover all eight).' : 'Five players each, all 48 minutes.'}</small></div>
              ${VS.opts.auction ? '' : `<div><span class="ts-start-k">SALARY CAP</span><div class="ch-chips">${UI.challengeCap.CAPS.map(v => `<button type="button" class="ch-chip${(VS.opts.cap || 0) === v ? ' on' : ''}" data-cap="${v}"${dis(boss && !lockR)}>${v ? '$' + v + 'M' : 'OFF'}</button>`).join('')}</div>
                <small class="muted">${VS.opts.cap ? 'Every player has a price from his rating (a 99 is $45M, the minimum $1M). Both rosters must fit under $' + C.capFor(VS.opts.cap, VS.opts.bench) + 'M.' : 'No cap: take anyone.'}</small></div></div>`}</details>
          <div class="vs-players">${[0, 1].map(i => `<div class="ch-step vs-pl"><div class="ch-step-k">PLAYER ${i + 1}${me() === i ? ' (YOU)' : ''}</div>
            <label class="field"><span>NAME</span><input data-name="${i}" name="p${i}-${Date.now()}" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="20" placeholder="Player ${i + 1}" value="${esc(VS.names[i] || '')}"${online() ? ' readonly' : dis(canAct(i))}></label>
            <label class="field"><span>TEAM NAME</span><input data-tname="${i}" name="t${i}-${Date.now()}" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="24" placeholder="${esc(tName(tOf(teams, VS.teams[i])))}" value="${esc(VS.tnames[i] || '')}"${dis(canAct(i))}></label>${wheel(i)}</div>`).join('')}</div>
          <div class="ch-go"><button type="button" class="btn btn-small" id="vsResetNames">RESET NAMES</button></div>
          ${rivalBox(rivalry(), true)}
          <div class="vs-dock"><div class="vs-dock-in">
            ${online() && linked() ? `<div class="vs-ready">${[0, 1].map(i => `<button type="button" class="vs-rd${VS.ready && VS.ready[i] ? ' on' : ''}" data-ready="${i}"${canAct(i) ? '' : ' disabled'}><i></i><span>${esc(who(i))}</span><b>${VS.ready && VS.ready[i] ? 'READY' : canAct(i) ? 'TAP TO READY' : 'NOT READY'}</b></button>`).join('')}</div>` : ''}
            <div class="vs-dock-go">${boss ? `<button type="button" class="btn btn-gold btn-big" id="vsStart"${ready && (!online() || (VS.ready && VS.ready[0] && VS.ready[1])) ? '' : ' disabled'}>${!ready ? 'WAITING FOR PLAYER 2' : online() && !(VS.ready && VS.ready[0] && VS.ready[1]) ? 'WAITING FOR BOTH TO BE READY' : 'START THE DRAFT'}</button>` : '<span class="muted">Your friend starts the draft when you are both ready.</span>'}
              ${VS.cfg ? '<button type="button" class="btn" id="vsBack">BACK TO OUR DRAFT</button>' : ''}</div></div></div>
        </div>`;
      UI.centerChips(app);
      app.querySelectorAll('details[data-det]').forEach(d => d.addEventListener('toggle', () => { VS.det = Object.assign({}, VS.det, { [d.dataset.det]: d.open }); }));
      const centerOn = (strip, t) => { strip.scrollLeft = t.offsetLeft - strip.clientWidth / 2 + t.offsetWidth / 2; };
      app.querySelectorAll('.tc').forEach(car => { const strip = car.querySelector('.tc-strip'), on = strip.querySelector('.on'); if (on) centerOn(strip, on); });
      app.querySelectorAll('[data-arrow]').forEach(b => b.addEventListener('click', () => { const [i, d] = b.dataset.arrow.split(':'), strip = app.querySelector('.tc[data-car="' + i + '"] .tc-strip'); strip.scrollBy({ left: +d * strip.clientWidth * 0.7, behavior: 'smooth' }); }));
      app.querySelectorAll('[data-spin]').forEach(b => b.addEventListener('click', () => {   // the carousel spins through the teams and slows down onto one
        const i = +b.dataset.spin;
        if (!canAct(i)) return;
        const car = app.querySelector('.tc[data-car="' + i + '"]'), strip = car.querySelector('.tc-strip'), tiles = [...car.querySelectorAll('.tc-t:not([disabled])')];
        if (tiles.length < 2) return;
        app.querySelectorAll('[data-spin],[data-arrow]').forEach(x => { x.disabled = true; });
        const fi = Math.floor(Math.random() * tiles.length), final = tiles[fi];
        let k = Math.max(0, tiles.indexOf(strip.querySelector('.tc-t.on'))), n = 0;
        const total = tiles.length + ((fi - k + tiles.length) % tiles.length) || tiles.length;   // one full lap, then on to the team it lands on
        const tick = () => {
          tiles.forEach(t => t.classList.remove('spin'));
          k = (k + 1) % tiles.length; const t = tiles[k]; t.classList.add('spin'); n++;
          strip.scrollTo({ left: t.offsetLeft - strip.clientWidth / 2 + t.offsetWidth / 2 });
          if (n >= total) { if (window.SFX) window.SFX.play('chime'); setTimeout(() => { VS.teams[i] = final.dataset.team; redraw(); }, 500); return; }
          setTimeout(tick, 35 + 250 * Math.pow(n / total, 3));   // fast, then slowing down onto the pick
        };
        tick();
      }));
      if (lobbyOn()) lobbyDraw(app);   // a ranked game opens on the lobby, not on the setup page
      const cz = UI.$('#vsCasual', app); if (cz && UI.ranked && UI.ranked.casualRooms) UI.ranked.casualRooms(cz);
      bindNet(app);
      syncLobby();
      if (lobbyOn()) lobbyRun(app);
      const redraw = () => { KEEP = window.scrollY; push(); setup(app); };
      if (KEEP != null) { const y = KEEP; KEEP = null; window.scrollTo(0, y); requestAnimationFrame(() => window.scrollTo(0, y)); }   // a setup choice keeps your place, even when it had to load a season first
      app.querySelectorAll('[data-net]').forEach(b => b.addEventListener('click', () => {
        const v = b.dataset.net;
        if (v !== 'local' && !UI.profile.canPlay()) { UI.toast('Pick a guest name or sign in first.', 'error'); const bar = UI.$('.pf-bar', app); if (bar) bar.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
        if (v === 'local') hangUp();
        else if (v === 'host' && NET.role !== 'host') host();
        else if (v === 'join' && NET.role !== 'guest') { hangUp(); Object.assign(NET, { role: 'guest', code: '', status: 'code', err: '' }); }
        route();
      }));
      const wb = UI.$('#vsWatchBtn', app); if (wb) wb.addEventListener('click', () => { const v = UI.$('#vsCode', app).value; if (v.trim().length >= 4) watchRoom(v); });
      const rj = UI.$('#vsRejoin', app); if (rj) rj.addEventListener('click', () => { const r = savedRoom(); if (!r) return; if (r.role !== 'watch' && !UI.profile.canPlay()) { UI.toast('Pick a guest name or sign in first.', 'error'); return; } connectRoom(r.role, r.code, r.role === 'host' ? { side: r.side, keep: true } : null); });
      const fg = UI.$('#vsForget', app); if (fg) fg.addEventListener('click', () => { forgetRoom(); redraw(); });
      const jb = UI.$('#vsJoin', app); if (jb) jb.addEventListener('click', () => { const v = UI.$('#vsCode', app).value; if (v.trim().length >= 4) join(v); });
      const setYear = () => { const c = chosen(); VS.year = c.length === 1 ? c[0] : 0; };
      app.querySelectorAll('[data-yr]').forEach(b => b.addEventListener('click', () => { const y = +b.dataset.yr, i = VS.skip.indexOf(y); if (!VS.skip.length) VS.skip = ALL_YEARS.filter(x => x !== y); else if (i >= 0) VS.skip.splice(i, 1); else VS.skip.push(y); setYear(); redraw(); }));
      // a decade button switches its seasons all on, or all off when they already are
      app.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => {
        const ys = ALL_YEARS.filter(y => decOf(y) === +b.dataset.dec), allOn = ys.every(y => VS.skip.indexOf(y) < 0);
        VS.skip = !VS.skip.length ? ALL_YEARS.filter(y => ys.indexOf(y) < 0) : allOn ? [...new Set(VS.skip.concat(ys))] : VS.skip.filter(y => ys.indexOf(y) < 0); setYear(); redraw();
      }));
      app.querySelectorAll('[data-seas]').forEach(b => b.addEventListener('click', () => { VS.skip = b.dataset.seas === 'all' ? [] : ALL_YEARS.slice(); setYear(); redraw(); }));
      app.querySelectorAll('[data-bo]').forEach(b => b.addEventListener('click', () => { VS.opts.bestOf = +b.dataset.bo; redraw(); }));
      app.querySelectorAll('[data-era]').forEach(b => b.addEventListener('click', () => { VS.opts.era = +b.dataset.era; redraw(); }));
      app.querySelectorAll('[data-cap]').forEach(b => b.addEventListener('click', () => { VS.opts.cap = +b.dataset.cap; if (VS.opts.cap) VS.opts.blind = false; redraw(); }));
      app.querySelectorAll('[data-dupes]').forEach(b => b.addEventListener('click', () => { VS.opts.dupes = +b.dataset.dupes; redraw(); }));
      app.querySelectorAll('[data-board]').forEach(b => b.addEventListener('click', () => { const v = +b.dataset.board; VS.opts.board = v === 1 ? 1 : 0; VS.opts.auction = v === 2 ? 1 : 0; if (v === 2) VS.opts.cap = 0; redraw(); }));
      app.querySelectorAll('[data-rk]').forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.rk; VS.opts[k] = VS.opts[k] ? 0 : 1;
        if (k === 'ranked' && VS.opts.ranked) Object.assign(VS.opts, { aBudget: 20, aStart: 1, aRaise: 1, aPool: 10, aQ: 'mixed', aShow: 0, bench: 0, bestOf: 7, blind: true, cap: 0, timer: 24, dupes: 0 });
        redraw(); syncLobby();
      }));
      app.querySelectorAll('[data-bans]').forEach(b => b.addEventListener('click', () => { VS.opts.bans = +b.dataset.bans; redraw(); }));
      app.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => { const [k, v] = b.dataset.a.split(':'); VS.opts[k] = k === 'aQ' ? v : +v; redraw(); }));
      app.querySelectorAll('[data-ready]').forEach(b => b.addEventListener('click', () => {
        const i = +b.dataset.ready; if (!canAct(i)) return;
        const v = !(VS.ready && VS.ready[i]);
        VS.ready = (VS.ready || [false, false]).slice(); VS.ready[i] = v;
        if (NET.role === 'guest') { ls.set(VS); send({ t: 'ready', i, v }); setup(app); }   // the guest sends only its own tap, so it cannot overwrite the host's
        else redraw();
      }));
      app.querySelectorAll('[data-bench]').forEach(b => b.addEventListener('click', () => { VS.opts.bench = +b.dataset.bench; redraw(); }));
      app.querySelectorAll('[data-blind]').forEach(b => b.addEventListener('click', () => { VS.opts.blind = b.dataset.blind === '1'; redraw(); }));
      app.querySelectorAll('[data-timer]').forEach(b => b.addEventListener('click', () => { VS.opts.timer = +b.dataset.timer; redraw(); }));
      app.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', () => { VS.teams[+b.dataset.side] = b.dataset.team; redraw(); }));
      app.querySelectorAll('[data-tname]').forEach(inp => inp.addEventListener('change', () => { VS.tnames[+inp.dataset.tname] = inp.value.trim().slice(0, 24); push(); }));
      app.querySelectorAll('[data-name]').forEach(inp => inp.addEventListener('change', () => { VS.names[+inp.dataset.name] = inp.value.trim().slice(0, 20); if (NET.role === 'guest') send({ t: 'hello', name: VS.names[me()] || '' }); else { uniqNames(); push(); redraw(); } }));
      UI.profile.wire(app, () => {
        if (!UI.profile.canPlay() && NET.role) { hangUp(); route(); return; }
        if (UI.profile.canPlay() && PEND) { const c = PEND; PEND = null; join(c); route(); return; }
        const i = me(); if (i !== null && i >= 0) VS.names[i] = UI.profile.name();
        if (NET.role === 'guest') send({ t: 'hello', name: VS.names[i] || '' }); else { uniqNames(); push(); }
        redraw();
      });
      const rn = UI.$('#vsResetNames', app);
      if (rn) rn.addEventListener('click', () => { [0, 1].forEach(i => { if (canAct(i)) { if (!online()) VS.names[i] = ''; VS.tnames[i] = ''; } }); push(); redraw(); });
      const bk = UI.$('#vsBack', app); if (bk) bk.addEventListener('click', () => go(C.vsOnClock(VS.cfg) >= 0 ? 'draft' : 'series'));
      const st = UI.$('#vsStart', app);
      if (st) st.addEventListener('click', () => {
        VS.names = [0, 1].map(i => { const el = app.querySelector('[data-name="' + i + '"]'); return el && canAct(i) ? el.value.trim().slice(0, 20) : VS.names[i]; });
        uniqNames();
        const ch = chosen();
        if (!ch.length) { UI.toast('Switch on at least one season', 'error'); return; }
        if (VS.opts.ranked && VS.opts.auction && online()) Object.assign(VS.opts, { aBudget: 20, aStart: 1, aRaise: 1, aPool: 10, aQ: 'mixed', aShow: 0, bench: 0, bestOf: 7, blind: true, cap: 0, timer: 24, dupes: 0 });
        VS.year = ch.length === 1 ? ch[0] : 0;
        VS.cfg = { mode: 'versus', year: VS.year, seasons: ch.length > 1 && ch.length < ALL_YEARS.length ? ch : null, bestOf: VS.opts.bestOf, blind: !VS.opts.cap && !!VS.opts.blind, cap: VS.opts.auction ? 0 : C.capFor(+VS.opts.cap || 0, VS.opts.bench), bench: +VS.opts.bench || 0, first: Math.random() < 0.5 ? 1 : 0, board: VS.opts.board && !VS.opts.auction ? 1 : 0, ranked: !!(VS.opts.ranked && VS.opts.auction && online() && UI.profile.signedIn()), bansN: VS.opts.auction ? 0 : +VS.opts.bans || 0, bans: [], dupes: ch.length > 1 && VS.opts.dupes ? 1 : 0, timer: VS.opts.auction && VS.opts.ranked && online() ? 24 : +VS.opts.timer || 0, era: +VS.opts.era || 2013, injuries: false, seed: Math.floor(Math.random() * 2147483646) + 1,
          sides: [0, 1].map(i => ({ team: VS.teams[i], name: (VS.tnames[i] || '').trim() || (VS.names[i] ? VS.names[i] + "'s " + tOf(teams, VS.teams[i]).name : ''), picks: [] })) };
        VS.spin = null; VS.spun = []; VS.respins = [1, 1]; VS.shown = 0; VS.pos = ''; VS.q = ''; VS.season = ''; VS.sort = ''; VS.sw = null; VS.auc = null; VS.ready = [false, false];
        if (VS.opts.auction) {
          const per = C.vsPer(VS.cfg), o = VS.opts;
          if (o.aBudget < per * o.aStart) { UI.toast('$' + o.aBudget + ' is not enough to fill ' + per + ' spots at $' + o.aStart + ' each.', 'error'); VS.cfg = null; return; }
          VS.cfg.auction = { budget: o.aBudget, start: o.aStart, raise: o.aRaise, pool: Math.max(o.aPool, 2 * per), quality: o.aQ, show: o.aShow ? 1 : 0 };
          const B0 = board(VS.cfg);
          const best = {};   // one entry for each player, his best season (every season of him only with duplicates on)
          B0.players.concat(B0.extra || []).forEach(p => { const k = B0.base(p); if (!best[k] || p.ovr > best[k].ovr) best[k] = p; });
          VS.auc = C.auctionStart(VS.cfg, Object.keys(best).map(k => best[k]));
        }
        VS.turn = VS.opts.auction ? null : turnFor(VS.cfg, 0, 'spin');
        if (VS.auc && VS.cfg.timer) VS.auc.until = Date.now() + VS.cfg.timer * 1000;
        go('draft');
      });
    });
  }

  // ---------- the ranked lobby: both players' cards, the rosters load, then both press ready ----------
  const LB = { cards: {}, loaded: 0, loading: 0, cd: 0, t: null, err: '' };
  const RM = { seed: 0, me: false, them: false };
  const lobbyOn = () => !!(online() && linked() && !VS.cfg && VS.opts.ranked && VS.opts.auction && me() !== null && me() >= 0 && UI.ranked && UI.ranked.lobbyCard);
  const lobbyEra = () => { const ch = chosen(); return UI.ranked.eraOf({ year: ch.length === 1 ? ch[0] : 0, seasons: ch.length > 1 && ch.length < ALL_YEARS.length ? ch : null }); };
  function lobbyDraw(app) {
    const era = lobbyEra(), i0 = me(), a = who(i0), b = who(1 - i0), rdy = VS.ready || [false, false];
    const slot = (n, mine) => `<div class="lb-slot" data-lbn="${esc(n)}" data-mine="${mine ? 1 : 0}">${LB.cards[n] || `<div class="lb-card"><div class="lb-av">?</div><b class="lb-n">${esc(n)}</b><small class="muted">LOADING PROFILE...</small></div>`}</div>`;
    app.innerHTML = `${netBar()}
      <section class="ch-hero"><div class="ch-hero-k">RANKED | ${esc(UI.ranked.eraName(era))} | BEST OF 7</div><h1 class="ch-hero-t">MATCH FOUND.</h1><p class="ch-hero-p" id="lbMsg">Loading...</p></section>
      <div class="lb-cards">${slot(a, 1)}<div class="lb-vs">VS</div>${slot(b, 0)}</div>
      <div class="lb-ready"><button type="button" class="btn btn-gold btn-big" data-ready="${i0}">${rdy[i0] ? 'READY: TAP TO CANCEL' : 'I AM READY'}</button>
        <span class="muted">${esc(b)}: <b>${rdy[1 - i0] ? 'READY' : 'NOT YET'}</b></span></div>
      <p class="muted lb-note">An auction with a hidden pool of ten mixed players, $20 each, $1 to open, raises of $1 or more, a 24 second shot clock on every bid, then a best-of-7 series. Take a minute: nothing starts until you both press ready. Leaving before the auction costs nothing; leaving after it starts is a forfeit.</p>
      <button type="button" id="vsStart" hidden></button>`;
    [[a, 1], [b, 0]].forEach(([n, mine]) => {
      if (LB.cards[n]) return;
      UI.ranked.lobbyCard(n, era, mine).then(html => {
        const el = app.querySelector('[data-lbn="' + String(n).replace(/"/g, '\\"') + '"]');
        if (el) el.innerHTML = html;
        const rb = el && el.querySelector('[data-lbretry]');
        if (rb) rb.addEventListener('click', () => { delete LB.cards[n]; lobbyDraw(app); });   // it gave up: ask again
        else LB.cards[n] = html;
      }).catch(() => { const el = app.querySelector('[data-lbn="' + String(n).replace(/"/g, '\\"') + '"]'); if (el) el.innerHTML = '<div class="lb-card"><div class="lb-av">' + esc(String(n).slice(0, 1).toUpperCase()) + '</div><b class="lb-n">' + esc(n) + '</b><small class="muted">NO PROFILE NUMBERS</small></div>'; });
    });
    if (!LB.loaded && !LB.loading) {   // the rosters load now, so the auction does not have to
      LB.loading = 1; LB.err = '';
      const ch = chosen();
      Promise.all([C.load('pool')].concat(ch.length <= 12 ? ch.map(y => C.load(y)) : [])).then(() => { LB.loaded = 1; LB.loading = 0; }).catch(e => { LB.err = 'The rosters did not load (' + (e && e.message ? e.message : 'network') + '). Trying again...'; LB.loading = 0; });
    }
  }
  function lobbyRun(app) {
    if (LB.t) clearInterval(LB.t);
    LB.t = setInterval(() => {
      const el = document.getElementById('lbMsg');
      if (!el || !lobbyOn()) { clearInterval(LB.t); LB.t = null; LB.cd = 0; return; }
      const r = VS.ready || [false, false], both = r[0] && r[1], i0 = me();
      if (!LB.loaded) { el.textContent = LB.err || 'Loading the rosters. Stay on this screen...'; LB.cd = 0; return; }
      if (!both) { el.textContent = r[i0] ? 'Waiting for ' + who(1 - i0) + ' to press ready.' : 'Look at each other, then press ready. Nothing starts until you both do.'; LB.cd = 0; return; }
      if (!LB.cd) LB.cd = Date.now() + 4000;
      const n = Math.ceil((LB.cd - Date.now()) / 1000);
      el.textContent = 'Starting in ' + Math.max(n, 0) + '...';
      if (n <= 0 && NET.role === 'host') { clearInterval(LB.t); LB.t = null; const b = UI.$('#vsStart'); if (b) b.click(); }
    }, 250);
  }
  const rematchBtn = cfg => cfg && cfg.ranked && online() && linked() && me() !== null && me() >= 0 && RKDONE[rkKey(cfg)] !== 'x'
    ? `<button type="button" class="btn" id="vsRematch"${RM.seed === cfg.seed && RM.me ? ' disabled' : ''}>${RM.seed === cfg.seed && RM.me ? 'REMATCH ASKED: WAITING FOR ' + esc(who(1 - me()).toUpperCase()) : RM.seed === cfg.seed && RM.them ? esc(who(1 - me()).toUpperCase()) + ' WANTS A REMATCH: ACCEPT' : 'ASK FOR A RANKED REMATCH'}</button>` : '';
  function maybeRematch() { if (RM.me && RM.them && NET.role === 'host' && VS.cfg && RM.seed === VS.cfg.seed) { RM.me = RM.them = false; UI.vsQuick.rematch(); } }
  async function concede() {
    const cfg = VS.cfg, key = rkKey(cfg);
    const ok = await UI.ranked.concede({ key, opp: who(1 - me()), era: UI.ranked.eraOf(cfg), bestOf: cfg.bestOf || 7 });
    if (ok) { rkOver(key); send({ t: 'conceded' }); const el = document.getElementById('vsDc'); if (el) el.remove(); location.hash = '#/ranked/result'; }
    else UI.toast('Could not record the forfeit: ' + ((UI.ranked && UI.ranked.lastErr) || 'the server refused it') + '.', 'error');
  }

  // ---------- quick match: ranked with no code (the finder lives in js/ui-ranked.js) ----------
  let QUICK = 0;
  const decKeyY = y => ((y - 1) - (y - 1) % 10) + 's';
  let QERA = 'ALL';
  function quickPresets(era) {
    QERA = era;
    VS.skip = era === 'ALL' ? [] : ALL_YEARS.filter(y => decKeyY(y) !== era);
    const ch = chosen(); VS.year = ch.length === 1 ? ch[0] : 0;
    Object.assign(VS.opts, { auction: 1, board: 0, ranked: 1, pub: 1, aBudget: 20, aStart: 1, aRaise: 1, aPool: 10, aQ: 'mixed', aShow: 0, bench: 0, bestOf: 7, blind: true, cap: 0, bans: 0, timer: 24, dupes: 0 });
    VS.cfg = null; VS.auc = null; VS.page = 'setup'; VS.ready = [false, false]; VS.names = ['', '']; VS.tnames = ['', '']; VS.spin = null; VS.shown = 0;
  }
  UI.vsQuick = {
    host(era) { quickPresets(era); QUICK = 1; host(); },
    join(code, era) { quickPresets(era); QUICK = 1; join(code); },
    leave() { QUICK = 0; forgetRoom(); hangUp(); },
    // a ranked game you dropped out of: the room and how long you still have to get back in
    rejoinInfo() {
      const r = savedRoom(); let over = ''; try { over = localStorage.getItem(OVERKEY) || ''; } catch (e) { /* private mode */ }
      if (online() || !r || r.role === 'watch') return null;
      const live = VS.cfg ? VS.cfg.ranked && over !== r.code + ':' + VS.cfg.seed : VS.opts.ranked && VS.opts.auction;   // a game under way, or a match found and still in its lobby
      if (!live) return null;
      const left = GRACE - (Date.now() - (r.at || 0));
      return left > 0 ? { code: r.code, left, lobby: !VS.cfg } : null;
    },
    rejoin() { const r = savedRoom(); if (!r || !UI.profile.canPlay()) return; connectRoom(r.role, r.code, r.role === 'host' ? { side: r.side, keep: true } : null); location.hash = VS.cfg ? '#/challenge/vs/draft' : '#/challenge/vs'; },
    rematch() { quickPresets(QERA); QUICK = 1; LB.cards = {}; LB.cd = 0; go('setup'); },
    status() { return { role: NET.role, status: NET.status, code: NET.code }; },
    target() { return '#/challenge/vs' + (VS.page === 'draft' ? '/draft' : VS.page === 'series' ? '/result' : ''); }
  };

  // ---------- the draft: a spin for every pick ----------
  let BLIM = 60;
  const BG = { run: false, fill: null };
  // how the open board can be ordered: [key, label, value of a player or null]; attribute sorts need the ratings, so a blind draft only gets A-Z
  const A_ = (...k) => p => (p.attrs ? k.reduce((s, x) => s + (p.attrs[x] || 0), 0) / k.length : -1);
  const SORTS = [['ovr', 'BEST OVERALL', p => p.ovr], ['low', 'WORST OVERALL', p => -p.ovr], ['az', 'A TO Z', null],
    ['three', '3-POINT SHOOTING', A_('three')], ['mid', 'MID-RANGE', A_('mid')], ['fin', 'FINISHING AT THE RIM', A_('layup', 'dunk')], ['post', 'POST GAME', A_('post')], ['ft', 'FREE THROWS', A_('ft')],
    ['handle', 'BALL HANDLING', A_('handle')], ['pass', 'PASSING', A_('pass')], ['reb', 'REBOUNDING', A_('oreb', 'dreb')], ['perD', 'PERIMETER DEFENSE', A_('perD')], ['intD', 'INTERIOR DEFENSE', A_('intD')],
    ['steal', 'STEALS', A_('steal')], ['block', 'BLOCKS', A_('block')], ['speed', 'SPEED', A_('speed')], ['vert', 'VERTICAL', A_('vert')], ['str', 'STRENGTH', A_('strength')], ['iq', 'BASKETBALL IQ', A_('oiq', 'diq')],
    ['ppg', 'POINTS PER GAME', p => (p.stats && p.stats.pts != null ? p.stats.pts : -1)], ['rpg', 'REBOUNDS PER GAME', p => (p.stats && p.stats.reb != null ? p.stats.reb : -1)], ['apg', 'ASSISTS PER GAME', p => (p.stats && p.stats.ast != null ? p.stats.ast : -1)],
    ['cheap', 'CHEAPEST FIRST', p => -C.price(p), 'cap'], ['dear', 'MOST EXPENSIVE', p => C.price(p), 'cap'], ['value', 'BEST VALUE (OVR PER $)', p => p.ovr / C.price(p), 'cap']];   // the open board loads every season's roster in the background, one after another   // how many of the open board's players are listed
  UI.boardSorts = SORTS;   // the tournament's open board uses the same sorts
  const ANIM = {};   // spins already animated on this phone
  function ovrTag(p, blind) { return blind ? '' : `<b class="ch-ovr ${UI.ovrClass(p.ovr)}">${esc(p.ovr)}</b>`; }
  // the draft board: one season's league, or every season (era spin: the all-time pool, keys id@season,
  // nobody twice even from different seasons). A spin lands on a group: season:team.
  function board(cfg) {
    C.setCapSlots(C.vsPer(cfg));
    const era = !cfg.year, d = C.seasonData(era ? 2013 : cfg.year), teams = d.teams, byId = {};
    const players = era ? C.allTimePool().filter(e => inPlay(cfg, e.season)).map(e => Object.assign({}, e, { id: e.key, team: e.from })) : d.players.slice();
    players.forEach(p => { byId[p.id] = p; });
    // every season: a landed season's full rosters join once its file is loaded (keys id@season)
    if (era) ALL_YEARS.forEach(y => {
      if (!inPlay(cfg, y) || y !== 2013 && !C.loaded(y)) return;
      const sd = C.seasonData(y);
      if (sd) sd.players.forEach(q => { const k = q.id + '@' + y; if (byId[k]) return; const e = Object.assign({}, q, { id: k, key: k, base: q.id, from: q.team, season: y }); byId[k] = e; players.push(e); });
    });
    if (!era) d.free.forEach(p => { byId[p.id] = p; });
    const base = p => (era ? (cfg.dupes ? p.id : p.base) : p.id);   // duplicates on: the same player from another season is a different pick
    const extra = !era ? d.free.slice() : [];   // free agents can be drafted from the open board, but the wheel never lands on them
    return { era, teams, byId, players, extra, base, cap: +cfg.cap || 0,
      takenSet: ids => new Set(ids.map(id => (byId[id] ? base(byId[id]) : id))),
      teamFor: (abbr, year) => (era && C.eraTeam(year, abbr)) || tOf(teams, abbr),
      groupKey: p => (era ? p.season : cfg.year) + ':' + p.team };
  }
  const short = y => "'" + String(y - 1).slice(2) + "-'" + String(y).slice(2);
  function playerRow(p, B, btn, blind) {
    const t = B.teamFor(p.team, p.season);
    return `<li class="ch-pl">${UI.faceImg(p, (t.colors || ['#444'])[0])}<span class="ch-pl-b"><b>${esc(p.name)}</b><small>${logo(t, 18)} ${esc(C.posLabel(p))}${UI.heightStr && UI.heightStr(p) ? ' | ' + UI.heightStr(p) : ''}${B.era && p.season ? ' | ' + short(p.season) : p.age ? ' | ' + p.age : ''}</small>${blind || !UI.gradesHtml ? '' : UI.gradesHtml(p)}</span>${B.cap ? UI.challengeCap.priceTag(p) : ''}${ovrTag(p, blind)}${btn}</li>`;
  }
  function spinFor(cfg, B, taken, avoid) {
    const tk = B.takenSet(taken.concat(cfg.bans || [])), groups = {};
    const PT = window.CHALLENGE_POOL && window.CHALLENGE_POOL.teams;
    // a season the pool does not cover (the newest) spins on the teams of the one before it
    if (B.era && PT) (cfg.seasons || Object.keys(PT).map(Number)).forEach(y => (PT[y] || PT[y - 1] || []).forEach(t => { groups[y + ':' + t.abbr] = { abbr: t.abbr, year: +y, key: y + ':' + t.abbr }; }));
    else B.players.forEach(p => { if (tk.has(B.base(p))) return; const k = B.groupKey(p); if (!groups[k]) groups[k] = { abbr: p.team, year: B.era ? p.season : cfg.year, key: k }; });
    const keys = Object.keys(groups);
    let pool = keys.filter(k => VS.spun.indexOf(k) < 0 && k !== avoid);
    if (B.era) { const got = {}; VS.spun.forEach(k => { got[C.franchise(String(k).split(':')[1])] = 1; }); const fresh = pool.filter(k => !got[C.franchise(k.split(':')[1])]); if (fresh.length) pool = fresh; }   // never two years of one franchise while others are left
    if (!pool.length) pool = keys.filter(k => k !== avoid);
    if (!pool.length) pool = keys;
    const g = groups[pool[Math.floor(Math.random() * pool.length)]];
    return g ? { abbr: g.abbr, year: g.year, key: g.key, side: C.vsOnClock(cfg), pick: taken.length, n: Date.now() + '-' + Math.floor(Math.random() * 1e6) } : null;
  }
  const rosterOf = (B, key, taken) => { const tk = B.takenSet(taken); return B.players.filter(p => B.groupKey(p) === key && !tk.has(B.base(p))); };
  // the pick clock: { pick, phase: 'spin' | 'pick', until } shared by both phones. When it runs out the
  // player on the clock spins (or takes the best player on the team the wheel landed on); online, the
  // other phone steps in five seconds later if the first one is gone.
  const SPIN_MS = 8200;
  function turnFor(cfg, pick, phase) { if (cfg && cfg.board) phase = 'pick'; return cfg && cfg.timer ? { pick, phase, until: Date.now() + cfg.timer * 1000 + (phase === 'pick' && !cfg.board ? SPIN_MS : 0) } : null; }
  let TICK = null;
  function stopTick() { if (TICK) { clearInterval(TICK); TICK = null; } }
  // the rules of this game, for the RULES button on the draft pages
  function rulesBox(cfg) {
    const A = cfg.auction ? C.aucOpts(cfg.auction) : null, per = C.vsPer(cfg), m = n => '$' + n, li = t => '<li>' + t + '</li>';
    const rows = [];
    rows.push(li(`<b>The series:</b> best of ${cfg.bestOf || 5}. ${cfg.bench && !cfg.noBench ? 'Eight deep: the starters play about 34 minutes and the bench the rest.' : 'All five play the full 48 minutes, so positions and fit matter.'}${cfg.ranked ? ' You and the other player both report the score, and it counts for the ladder.' : ''}`));
    if (A) rows.push(li(`<b>Auction:</b> a hidden pool of ${Math.max(A.pool, 2 * per)} ${A.quality === 'stars' ? 'of the best players' : A.quality === 'mixed' ? 'good players' : 'players'} in the seasons you picked${A.show ? ' (the pool is visible)' : ''}. They come up one at a time, and you each have ${m(A.budget)}.`));
    if (A) rows.push(li(`<b>Bidding:</b> a player opens at ${m(A.start)} held by whoever opens that round (it alternates). The other side bids any amount ${m(A.raise)} or more above the price, or passes and lets the holder have him at that price. Then it flips.`));
    if (A) rows.push(li(`<b>Money:</b> you must keep ${m(A.start)} for every spot you still have to fill, so your top bid is your money minus that. When you cannot top the bid you can only pass. Once a side has its ${per}, the rest of the pool is auto-drafted to the other side for free.`));
    if (!A) rows.push(li(cfg.board ? '<b>Open board:</b> take turns picking anyone still left, in snake order (A, B, B, A, A, B...).' : '<b>The wheel:</b> take turns in snake order (A, B, B, A, A, B...). The wheel picks a team and a season, and you take one player from it. Each side gets one re-spin.'));
    rows.push(li(cfg.timer ? `<b>Shot clock:</b> ${cfg.timer} seconds a turn. ${A ? 'Run out and you pass.' : cfg.board ? 'Run out and you get the best player left.' : 'Run out and the wheel spins for you, or you get a random player from the team it landed on.'}` : '<b>No shot clock.</b>'));
    if (cfg.bansN) rows.push(li(`<b>Bans:</b> ${cfg.bansN} each, before the draft. Banned players are off the wheel and the board.`));
    if (cfg.cap) rows.push(li(`<b>Salary cap:</b> every player costs from ${m(1)} to ${m(45)} by rating. Your whole roster has to fit under ${m(cfg.cap)}M.`));
    if (cfg.blind) rows.push(li('<b>Blind draft:</b> no ratings or fit grades until the series is over.'));
    if (cfg.seasons && cfg.seasons.length > 1 || !cfg.year) rows.push(li(cfg.dupes ? '<b>Duplicates on:</b> the same player can be drafted from different seasons.' : '<b>No duplicates:</b> a player is gone once he is taken, whatever the season.'));
    if (cfg.ranked) rows.push(li('<b>Ranked:</b> one set of rules for every ranked game: an auction with a hidden pool of ten mixed players from one era, $20 each, bidding opens at $1 and goes up $1 or more, blind draft (no ratings until the series is over), 24 second shot clock, no duplicates, just the five, best of 7.'));
    return `<div class="vs-rulesbox" id="vsRulesBox" hidden><b>THE RULES</b><ul>${rows.join('')}</ul></div>`;
  }
  const RULES_BTN = '<button type="button" class="btn btn-small" id="vsRules">RULES</button>';
  // the players banned before the draft
  function bansStrip(cfg, byId) {
    const b = cfg.bans || [];
    if (!b.length) return '';
    return `<div class="vs-bans"><small>BANNED</small>${b.map((id, i) => `<span class="vs-ban">${esc(byId[id] ? byId[id].name : id)}<i>${esc(who(i % 2))}</i></span>`).join('')}</div>`;
  }
  // before the draft: take turns banning players, who are then off the wheel and the board
  function banPage(app, cfg, B) {
    const n = cfg.bansN, bans = cfg.bans || [], side = bans.length % 2, mine = canAct(side), blind = !!cfg.blind;
    const q = (VS.bq || '').trim().toLowerCase();
    const list = B.players.concat(B.extra || []).filter(p => bans.indexOf(p.id) < 0 && (!q || p.name.toLowerCase().indexOf(q) >= 0));
    if (blind) list.sort((a, b) => a.name.localeCompare(b.name)); else list.sort((a, b) => b.ovr - a.ovr);
    app.innerHTML = `<div class="ch-top"><div><div class="ch-top-k">${esc(lblC(cfg))} | TWO PLAYERS | BAN ROUND</div><div class="ch-top-t">${esc(who(side).toUpperCase())} BANS A PLAYER</div></div><span class="ch-top-acts">${RULES_BTN}<button type="button" class="btn btn-small" id="vsSetup">SETUP</button></span></div>
      ${netBar()}${rulesBox(cfg)}
      <div class="vs-clock">BAN ${bans.length + 1} OF ${2 * n}: <b>${esc(who(side))}</b> <span class="muted">${mine ? 'Pick a player nobody gets.' : 'is choosing.'}</span></div>
      ${bansStrip(cfg, B.byId)}
      <label class="field"><span>SEARCH</span><input id="vsBanQ" value="${esc(VS.bq || '')}" placeholder="Name" autocomplete="off"></label>
      <ul class="ch-list" id="vsBanList">${list.slice(0, 40).map(p => playerRow(p, B, mine ? `<button type="button" class="btn btn-small btn-gold" data-ban="${esc(p.id)}">BAN</button>` : '', blind)).join('')}</ul>
      <p class="muted">${list.length > 40 ? 'Showing 40 of ' + list.length + '. Search to find anyone.' : list.length + ' players.'}</p>${reactBar()}`;
    bindNet(app); bindReact(app);
    UI.$('#vsSetup', app).addEventListener('click', () => go('setup'));
    const qi = UI.$('#vsBanQ', app);
    qi.addEventListener('input', () => { VS.bq = qi.value; const pos = qi.selectionStart; draft(app); const n2 = UI.$('#vsBanQ', app); if (n2) { n2.focus(); n2.setSelectionRange(pos, pos); } });
    app.querySelectorAll('[data-ban]').forEach(b => b.addEventListener('click', () => {
      if (!canAct((VS.cfg.bans || []).length % 2)) return;
      VS.cfg.bans = (VS.cfg.bans || []).concat([b.dataset.ban]); VS.bq = '';
      if (window.SFX) window.SFX.play('chime');
      push(); draft(app); window.scrollTo(0, 0);
    }));
  }
  // the auction: the player who is up, the standing bid and your money. Bid any amount from one raise up to what you can spend.
  const AB = { i: -1, price: -1, amt: 0, key: null, seen: 0 };
  let REV = false;   // the auto-draft reveal is on screen   // the amount picked on this phone for the player who is up
  function auctionPage(app, cfg, B) {
    rkStart(cfg);
    stopTick();
    const st = VS.auc, A = st.o, per = st.per, byId = B.byId, blind = !!cfg.blind;
    const cur = byId[st.ids[st.i]], money = n => '$' + n, tm = B.teamFor(cur.team, cur.season);
    const yearOf = p => { const y = p && (p.season || cfg.year); return y ? ' <small class="auc-yr">' + esc(short(y)) + '</small>' : ''; };
    const left = st.ids.length - st.i - 1;
    const mineTurn = canAct(st.turn), canRaise = C.aucCanRaise(st, st.turn);
    const min = st.price + A.raise, max = C.aucMax(st, st.turn);
    if (AB.i !== st.i || AB.price !== st.price || AB.amt < min || AB.amt > max) { AB.i = st.i; AB.price = st.price; AB.amt = min; }
    const sideBox = (i, cls) => {
      const won = st.won[i].map(id => ({ p: byId[id], price: (st.log.filter(x => x.id === id)[0] || {}).price }));
      const slots = Array.from({ length: per }, (_, k) => won[k]
        ? `<li class="on"><span>${esc(won[k].p ? won[k].p.name : '?')}${yearOf(won[k].p)}</span><b>${money(won[k].price || 0)}</b></li>` : '<li class="empty"><span>OPEN</span></li>').join('');
      return `<aside class="auc-side ${cls}${st.turn === i ? ' turn' : ''}${st.holder === i ? ' holds' : ''}"><div class="auc-who"><small>${esc(who(i))}${me() === i ? ' (YOU)' : ''}</small><b class="auc-cash">${money(A.budget - st.spent[i])}</b><small>${st.won[i].length} OF ${per} SPOTS</small></div><ol class="auc-slots">${slots}</ol></aside>`;
    };
    const timed = cfg.timer > 0;
    if (timed && !st.until) st.until = Date.now() + cfg.timer * 1000;
    const dots = st.ids.map((id, k) => `<i class="${k < st.i ? 'sold' : k === st.i ? 'now' : ''}"></i>`).join('');
    const quick = [A.raise, 2, 5].filter((v, k, a2) => v >= A.raise && a2.indexOf(v) === k).map(v => ({ to: st.price + v, label: '+' + money(v) })).filter(x => x.to >= min && x.to <= max);
    const broke = !canRaise;   // cannot top the bid: pass is all that is left
    const reserve = Math.max(0, per - st.won[st.turn].length - 1) * A.start, have = A.budget - st.spent[st.turn];
    const whyBroke = who => `${who} ${who === 'You' ? 'have' : 'has'} ${money(have)}${reserve ? ' and must keep ' + money(reserve) + ' for the other open spot' + (reserve / A.start > 1 ? 's' : '') : ''}, so the most ${who === 'You' ? 'you' : 'they'} can bid is ${money(Math.max(0, max))}. The bid is ${money(st.price)}.`;
    const bid = mineTurn && broke
      ? `<div class="auc-bid"><div class="auc-broke"><b>YOU CAN'T TOP ${money(st.price)}</b><span>${whyBroke('You')} Pass, and ${esc(who(st.holder))} gets him.</span></div>
          <div class="auc-go"><button type="button" class="btn btn-big" disabled>BID<small>can't top ${money(st.price)}</small></button><button type="button" class="btn btn-gold btn-big" id="aucPass">PASS<small>${esc(who(st.holder))} gets him for ${money(st.price)}</small></button></div></div>`
      : mineTurn
      ? `<div class="auc-bid"><div class="auc-maxline">YOUR MAX BID IS <b>${money(max)}</b> <span>${money(have)} left${reserve ? ', keeping ' + money(reserve) + ' for your other ' + (reserve / A.start) + ' open spot' + (reserve / A.start > 1 ? 's' : '') : ''}</span></div><div class="auc-step"><button type="button" class="btn" id="aucDown" aria-label="Lower the bid"${AB.amt - A.raise < min ? ' disabled' : ''}>&minus;</button><div class="auc-amt"><small>YOUR BID</small><b id="aucAmt">${money(AB.amt)}</b></div><button type="button" class="btn" id="aucUp" aria-label="Raise the bid"${AB.amt + A.raise > max ? ' disabled' : ''}>+</button></div>
          <div class="auc-chips">${quick.map(x => `<button type="button" class="ch-chip${AB.amt === x.to ? ' on' : ''}" data-to="${x.to}">${x.label}</button>`).join('')}<button type="button" class="ch-chip${AB.amt === max ? ' on' : ''}" data-to="${max}"${canRaise ? '' : ' disabled'}>ALL IN ${money(max)}</button></div>
          <div class="auc-go"><button type="button" class="btn btn-gold btn-big" id="aucRaise"${canRaise ? '' : ' disabled'}>BID ${money(AB.amt)}</button><button type="button" class="btn btn-big" id="aucPass">PASS<small>${esc(who(st.holder))} gets him for ${money(st.price)}</small></button></div></div>`
      : `<div class="auc-wait"><b>${esc(who(st.turn))} ${broke ? "can't top the bid" : 'is deciding'}...</b><span>${broke ? whyBroke(esc(who(st.turn))) + ' They can only pass. ' : ''}${esc(who(st.holder))} holds the bid at ${money(st.price)}.</span></div>`;
    const sold = st.log.slice().reverse().map(x => `<li><b>${esc(byId[x.id] ? byId[x.id].name : x.id)}${yearOf(byId[x.id])}</b><span>${esc(who(x.side))}</span><i>${money(x.price)}</i></li>`).join('');
    // a visible pool: every player as a small card, the ones to come bright, the sold ones dimmed with who got them and for how much
    const pool = A.show ? `<div class="auc-poolrow" aria-label="The pool">${st.ids.map((id, k) => {
      const p = byId[id], sale = st.log.filter(x => x.id === id)[0], col = (B.teamFor(p.team, p.season).colors || ['#555'])[0], y = p.season || cfg.year;
      return `<div class="apc${k < st.i ? ' sold' : k === st.i ? ' now' : ''}" style="--c1:${esc(col)}"><div class="apc-f">${UI.faceImg(p, col)}</div><b>${esc(p.name)}</b><small>${y ? esc(short(y)) : ''}${blind ? '' : ' | ' + esc(p.ovr)}</small>${sale ? `<em>${esc(who(sale.side))} ${sale.price ? money(sale.price) : 'FREE'}</em>` : k === st.i ? '<em>UP NOW</em>' : ''}</div>`;
    }).join('')}</div>` : `<p class="auc-more">${left} MORE IN THE HIDDEN POOL</p>`;
    app.innerHTML = `<div class="ch-top auc-top"><div><div class="ch-top-k">${esc(lblC(cfg))} | AUCTION | ${money(A.budget)} EACH${cfg.ranked ? ' | RANKED' : ''} | COIN FLIP: ${esc(who(cfg.first ? 1 : 0).toUpperCase())} OPENS FIRST</div><div class="ch-top-t">PLAYER ${st.i + 1} OF ${st.ids.length}</div></div><span class="ch-top-acts">${RULES_BTN}<button type="button" class="btn btn-small" id="vsSetup">SETUP</button></span></div>
      ${netBar()}${rulesBox(cfg)}
      <div class="auc">
        ${sideBox(0, 'l')}
        <main class="auc-stage">
          ${timed ? `<div class="vs-timer" id="vsTimer"><i style="--w:100%"></i><span>${Math.max(0, Math.ceil((st.until - Date.now()) / 1000))}</span></div>` : ''}
          <section class="auc-card" style="--c1:${esc((tm.colors || ['#444'])[0])}">
            <div class="auc-face">${UI.faceImg(cur, (tm.colors || ['#444'])[0])}</div>
            <div class="auc-info"><small>UP FOR BID</small><h2>${esc(cur.name)}</h2><p>${esc(C.posLabel(cur))}${cur.season || cfg.year ? ' | ' + esc(short(cur.season || cfg.year)) : ''}${blind ? '' : ' | <b class="ch-ovr ' + UI.ovrClass(cur.ovr) + '">' + esc(cur.ovr) + '</b>'}</p></div>
            <div class="auc-price"><small>${esc(who(st.holder).toUpperCase())} HOLDS</small><b>${money(st.price)}</b></div>
          </section>
          ${bid}
          <div class="auc-dots" aria-label="Progress">${dots}</div>${pool}
        </main>
        ${sideBox(1, 'r')}
      </div>
      ${sold ? `<div class="auc-log"><small>SOLD SO FAR</small><ol>${sold}</ol></div>` : ''}${reactBar()}`;
    bindNet(app); bindReact(app);
    UI.$('#vsSetup', app).addEventListener('click', () => go('setup'));
    const fresh = () => { st.until = cfg.timer ? Date.now() + cfg.timer * 1000 : null; };
    const done = () => { cfg.sides[0].picks = st.won[0].slice(); cfg.sides[1].picks = st.won[1].slice(); fresh(); if (window.SFX) window.SFX.play('chime'); push(); draft(app); window.scrollTo(0, 0); };
    const setAmt = v => { AB.amt = Math.max(min, Math.min(max, Math.round(v))); auctionPage(app, cfg, B); };
    const dn = UI.$('#aucDown', app); if (dn) dn.addEventListener('click', () => setAmt(AB.amt - A.raise));
    const up = UI.$('#aucUp', app); if (up) up.addEventListener('click', () => setAmt(AB.amt + A.raise));
    app.querySelectorAll('[data-to]').forEach(b => b.addEventListener('click', () => setAmt(+b.dataset.to)));
    const rs = UI.$('#aucRaise', app); if (rs) rs.addEventListener('click', () => { if (C.auctionAct(st, st.turn, 'raise', AB.amt)) done(); });
    const ps = UI.$('#aucPass', app); if (ps) ps.addEventListener('click', () => { if (C.auctionAct(st, st.turn, 'pass')) done(); });
    // the shot clock: when it runs out the player on the clock passes; online, the other phone steps in five seconds later if his is gone
    if (timed) {
      const total = cfg.timer * 1000, actor = canAct(st.turn) ? 0 : online() ? 5000 : null;
      TICK = setInterval(() => {
        const el = UI.$('#vsTimer', app);
        if (!el || VS.auc !== st) { stopTick(); return; }
        if (paused()) st.until += 250;   // ranked and the other player is gone: the clock waits
        const lf = st.until - Date.now();
        el.querySelector('span').textContent = Math.max(0, Math.ceil(lf / 1000));
        el.querySelector('i').style.setProperty('--w', Math.max(0, Math.min(100, 100 * lf / total)) + '%');
        el.classList.toggle('low', lf < 8000);
        if (actor === null || lf > -actor) return;
        stopTick();
        if (C.auctionAct(st, st.turn, 'pass')) { UI.toast('Time: ' + who(st.holder) + ' gets ' + (byId[st.ids[st.i - 1]] ? byId[st.ids[st.i - 1]].name : 'him') + '.'); done(); }
      }, 250);
    }
  }
  function draft(app) {
    if (UI.challengeWheel.busy && UI.challengeWheel.busy()) return;   // a spin is running: its landing redraws the page
    const cfg = VS.cfg;
    if (!cfg) { go('setup'); return; }
    loadThen(app, cfg.year, () => {
      const B = board(cfg), teams = B.teams, byId = B.byId;
      const blind = !!cfg.blind;
      const taken = cfg.sides[0].picks.concat(cfg.sides[1].picks), on = C.vsOnClock(cfg), gone = taken.concat(cfg.bans || []);   // gone: drafted or banned
      if (cfg.auction && VS.auc) {
        if (REV) return;   // a reveal is playing: its end redraws the page
        if (AB.key !== cfg.seed) { AB.key = cfg.seed; AB.seen = VS.auc.log.length; }   // arrived late or reloaded: no replay of old sales
        const autos = VS.auc.log.slice(AB.seen).filter(x => x.auto);
        AB.seen = VS.auc.log.length;
        if (autos.length && UI.aucReveal) {
          REV = true; stopTick(); window.scrollTo(0, 0);
          UI.aucReveal(app, { entries: autos, byId, blind, name: i => who(i), color: p => (B.teamFor(p.team, p.season).colors || ['#555'])[0], onDone: () => { REV = false; if (VS.auc && VS.auc.until && cfg.timer) VS.auc.until = Date.now() + cfg.timer * 1000; if (/^#\/challenge\/vs/.test(location.hash)) route(); } });
          return;
        }
      }
      if (cfg.auction && VS.auc && !VS.auc.done) return auctionPage(app, cfg, B);
      if ((cfg.bansN || 0) > 0 && (cfg.bans || []).length < 2 * cfg.bansN) return banPage(app, cfg, B);
      const pay = sd => (cfg.cap ? ` <small class="vs-pay">${UI.challengeCap.money(C.capState(cfg.cap, sd.picks.map(id => byId[id]).filter(Boolean)).spent)} of $${cfg.cap}M</small>` : '');
      const fives = cfg.sides.map((sd, i) => {
        const t = tOf(teams, sd.team), mine = sd.picks.map(id => byId[id]).filter(Boolean);
        return `<div class="vs-side${on === i ? ' on' : ''}" style="--c1:${esc(t.colors[0])}"><div class="vs-side-h">${logo(t, 36)}<div><small>${esc(who(i))}${me() === i ? ' (YOU)' : ''}</small><b>${esc(sd.name || tName(t))}</b>${pay(sd)}</div></div>
          ${UI.swapOl(C.vsPer(cfg), k => (mine[k] ? esc(mine[k].name) + ' <small class="muted">' + esc(C.posLabel(mine[k])) + (B.era && mine[k].season ? ' ' + short(mine[k].season) : '') + '</small>' + (blind ? '' : ' <b class="' + UI.ovrClass(mine[k].ovr) + '">' + esc(mine[k].ovr) + '</b>') : '<span class="muted">-</span>'), VS.sw && VS.sw.s === i ? VS.sw.k : null, !!cfg.bench && canAct(i) && mine.length > 5)}</div>`;
      }).join('');
      const fitCard = (sd, i) => {
        if (!sd.picks.length) return '';
        const f = C.lineupFit(sd.picks.map(id => byId[id]).filter(Boolean).slice(0, 5));
        if (blind) { f.parts = []; f.word = ''; }
        return UI.challengeFit(f, { compact: true, title: (who(i) + "'s lineup").toUpperCase() });
      };
      const spin = VS.spin && VS.spin.pick === taken.length ? VS.spin : null;
      const mine = on >= 0 && canAct(on);
      let body = '';
      if (on < 0) body = `<div class="ch-ready"><div><b>BOTH FIVES ARE SET.</b><span class="muted"> Best of ${cfg.bestOf || 5}${cfg.bench ? ', eight deep with a three-man bench' : ', all five play 48 minutes'}.</span></div><button type="button" class="btn btn-gold btn-big" id="vsSim">TO THE SERIES</button></div>`;
      else if (cfg.board) {
        const five = cfg.sides[on].picks.map(id => byId[id]).filter(Boolean);
        body = `<div class="vs-clock">ON THE CLOCK: <b>${esc(who(on))}</b> <span class="muted">(pick ${taken.length + 1} of ${2 * C.vsPer(cfg)})</span></div>
          <div class="ch-filters">${[''].concat(POS).map(x => `<button type="button" class="ch-chip sm${(VS.pos || '') === x ? ' on' : ''}" data-bpos="${x}">${x || 'ALL'}</button>`).join('')}
            ${B.era ? `<select id="vsBSeason" aria-label="Season"><option value="">ALL SEASONS</option>${ALL_YEARS.filter(y => inPlay(cfg, y)).map(y => `<option value="${y}"${+VS.season === y ? ' selected' : ''}>${esc(lbl(y))}</option>`).join('')}</select>` : ''}
            <select id="vsBSort" aria-label="Sort players">${SORTS.filter(x => (!blind || x[0] === 'az') && (x[3] !== 'cap' || cfg.cap)).map(x => `<option value="${x[0]}"${(VS.sort || (blind ? 'az' : 'ovr')) === x[0] ? ' selected' : ''}>${x[1]}</option>`).join('')}</select>
            ${cfg.cap ? UI.challengeCap.budgetSel('vsBBud', VS.bud) : ''}
            <input id="vsBQ" placeholder="Search players" value="${esc(VS.q || '')}" autocomplete="off">
            </div>
          <p class="muted ch-small" id="vsLoadN"></p>
          ${cfg.cap ? UI.challengeCap.bar(cfg.cap, five) : ''}
          ${mine ? '' : `<p class="muted">${esc(who(on))} is picking. Everyone taken is already off the board.</p>`}
          <p class="muted ch-small" id="vsBN"></p><ul class="ch-list" id="vsBList"></ul>`;
      }
      else if (!spin || !ANIM[spin.n]) {
        body = `<div class="vs-clock">ON THE CLOCK: <b>${esc(who(on))}</b> <span class="muted">(pick ${taken.length + 1} of ${2 * C.vsPer(cfg)})</span></div>
          <section class="ch-wheel">${UI.challengeWheel.strip(teams, { mode: B.era ? 'alltime' : 'versus', seasons: cfg.seasons })}<div class="ch-wheel-k">${spin ? 'SPINNING...' : mine ? 'YOUR SPIN' : 'WAITING FOR ' + esc(who(on)).toUpperCase() + ' TO SPIN'}</div>
          ${mine && !spin ? '<button type="button" class="btn btn-gold btn-big" id="chSpin">SPIN THE WHEEL</button>' : ''}</section>`;
      } else if (B.era && spin.year !== 2013 && !C.loaded(spin.year)) {
        // the landed season's full rosters: load them, then draw again
        body = `<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING THE ${esc(lbl(spin.year))} ROSTER...</div></section>`;
        C.load(spin.year).then(() => { if (VS.spin && VS.spin.n === spin.n) draft(app); }).catch(() => UI.toast('That roster did not load. Try a re-spin.', 'error'));
      } else {
        const t = B.teamFor(spin.abbr, spin.year);
        const ros = UI.challengeAlpha(rosterOf(B, spin.key, gone)), five = cfg.sides[on].picks.map(id => byId[id]).filter(Boolean);
        const none = cfg.cap && !ros.some(p => C.capFits(cfg.cap, five, p));
        body = `<div class="vs-clock">ON THE CLOCK: <b>${esc(who(on))}</b> <span class="muted">(pick ${taken.length + 1} of ${2 * C.vsPer(cfg)})</span></div>
          <section class="ch-landed" style="--c1:${esc(t.colors[0])}">${logo(t, 64)}<div><div class="ch-wheel-k">THE WHEEL SAYS</div><div class="ch-landed-t">${B.era ? esc(lbl(spin.year)) + ' ' : ''}${esc(tName(t))}</div></div>
            ${mine && VS.respins[on] > 0 ? '<button type="button" class="btn btn-small" id="chRespin">RE-SPIN (1 LEFT)</button>' : ''}</section>
          ${mine ? '' : `<p class="muted">${esc(who(on))} is picking from the ${esc(t.name)}.</p>`}
          ${cfg.cap ? UI.challengeCap.bar(cfg.cap, five) : ''}
          ${none && mine ? '<div class="ch-ready"><div><b>NOBODY HERE FITS UNDER YOUR CAP.</b><span class="muted"> Spin again, on the house.</span></div><button type="button" class="btn btn-gold" id="vsFree">SPIN AGAIN</button></div>' : ''}
          <ul class="ch-list">${ros.map(p => playerRow(p, B, mine ? UI.challengeCap.btn(cfg.cap, five, p, `<button type="button" class="btn btn-small btn-gold" data-add="${esc(p.id)}">TAKE</button>`) : '', blind)).join('')}</ul>`;
      }
      const turn = on >= 0 && VS.turn && VS.turn.pick === taken.length ? VS.turn : null;
      const clock = turn ? `<div class="vs-timer" id="vsTimer"><i style="--w:100%"></i><span>${Math.max(0, Math.ceil((turn.until - Date.now()) / 1000))}</span></div>` : '';
      app.innerHTML = `<div class="ch-top"><div><div class="ch-top-k">${esc(lblC(cfg))} | TWO PLAYERS | BEST OF ${cfg.bestOf || 5}${blind ? ' | BLIND' : ''} | COIN FLIP: ${esc(who(cfg.first ? 1 : 0).toUpperCase())} FIRST${cfg.timer ? ' | ' + cfg.timer + ' SEC CLOCK' : ''}${cfg.cap ? ' | $' + cfg.cap + 'M CAP' : ''}</div><div class="ch-top-t">THE DRAFT</div></div>
          <span class="ch-top-acts">${RULES_BTN}<button type="button" class="btn btn-small" id="vsSetup">SETUP</button></span></div>
        ${netBar()}${rulesBox(cfg)}
        <div class="vs-sides vs-compact">${fives}</div>
        ${bansStrip(cfg, byId)}${clock}${body}${reactBar()}`;
      bindNet(app); bindReact(app);
      // the open board: the players still left, filtered; a pick from the list
      if (cfg.board && on >= 0) {
        const tkn = B.takenSet(gone), five = cfg.sides[on].picks.map(id => byId[id]).filter(Boolean);
        const fill = () => {
          const q = (VS.q || '').trim().toLowerCase();
          if (B.era) { const nb = board(cfg); if (nb.players.length !== B.players.length) { B.players = nb.players; Object.assign(B.byId, nb.byId); } }   // rosters that finished loading
          const all = B.players.concat(B.extra || []).filter(p => !tkn.has(B.base(p)) && (!VS.pos || C.primaryPos(p.pos) === VS.pos) && (!VS.season || p.season === +VS.season) && (!q || p.name.toLowerCase().indexOf(q) >= 0) && (!cfg.cap || UI.challengeCap.budgetOk(VS.bud, cfg.cap, five, p)));
          const so = SORTS.find(x => x[0] === (blind ? 'az' : (VS.sort || 'ovr')) && (x[3] !== 'cap' || cfg.cap)) || SORTS[0];
          if (so[2]) all.sort((a, b) => so[2](b) - so[2](a) || b.ovr - a.ovr); else all.sort((a, b) => a.name.localeCompare(b.name));
          const shown = p => (blind || !so[2] || so[0] === 'ovr' || so[0] === 'low' ? '' : '<span class="vs-sortv">' + esc(String(Math.round(so[3] === 'cap' ? (so[0] === 'cheap' ? -so[2](p) : so[2](p)) * 10 : so[2](p) * 10) / 10)) + '</span>');
          const L = UI.$('#vsBList', app), N = UI.$('#vsBN', app);
          if (!L) return;
          L.innerHTML = all.slice(0, BLIM).map(p => playerRow(p, B, shown(p) + (mine ? UI.challengeCap.btn(cfg.cap, five, p, `<button type="button" class="btn btn-small btn-gold" data-bpick="${esc(p.id)}">TAKE</button>`) : ''), blind)).join('');
          N.innerHTML = all.length ? (all.length > BLIM ? 'Showing ' + BLIM + ' of ' + all.length + '. <button type="button" class="btn btn-small" id="vsMore">SHOW 60 MORE</button> <button type="button" class="btn btn-small" id="vsMoreAll">SHOW ALL</button>' : all.length + ' left.') : 'Nobody matches.';
          const mo = UI.$('#vsMore', app), ma = UI.$('#vsMoreAll', app);
          if (mo) mo.addEventListener('click', () => { BLIM += 60; fill(); });
          if (ma) ma.addEventListener('click', () => { BLIM = 1e6; fill(); });
        };
        fill();
        app.querySelectorAll('[data-bpos]').forEach(b => b.addEventListener('click', () => { VS.pos = b.dataset.bpos; BLIM = 60; draft(app); }));
        const bs = UI.$('#vsBSeason', app);
        if (bs) bs.addEventListener('change', () => {
          VS.season = bs.value; BLIM = 60;
          const y = +bs.value;
          if (y && y !== 2013 && !C.loaded(y)) { UI.$('#vsLoadN', app).textContent = 'Loading the ' + lbl(y) + ' rosters...'; C.load(y).then(() => draft(app)).catch(() => { UI.toast('That roster did not load.', 'error'); draft(app); }); return; }
          draft(app);
        });
        BG.fill = fill;
        const need = () => ALL_YEARS.filter(y => inPlay(cfg, y) && y !== 2013 && !C.loaded(y) && (BG.skip || []).indexOf(y) < 0);
        const note = UI.$('#vsLoadN', app);
        if (B.era && need().length && !BG.run) {
          BG.run = true;
          const total = need().length; let k = 0;
          const step = () => {
            const left = need();
            if (!left.length || !/^#\/challenge\/vs/.test(location.hash)) { BG.run = false; const n2 = UI.$('#vsLoadN'); if (n2 && !left.length) n2.textContent = 'Every roster is loaded: anyone who ever played is on the board.'; return; }
            const n2 = UI.$('#vsLoadN'); if (n2) n2.textContent = 'Loading every roster: ' + (total - left.length) + ' of ' + total + '. The board fills up as they arrive.';
            C.load(left[0]).then(() => { if (BG.fill) BG.fill(); step(); }).catch(() => { BG.skip = (BG.skip || []).concat(left[0]); step(); });
          };
          step();
        } else if (note && B.era) note.textContent = need().length ? 'Loading every roster...' : 'Every roster is loaded: anyone who ever played is on the board.';
        const bbd = UI.$('#vsBBud', app); if (bbd) bbd.addEventListener('change', () => { VS.bud = bbd.value; BLIM = 60; fill(); });
        const bso = UI.$('#vsBSort', app); if (bso) bso.addEventListener('change', () => { VS.sort = bso.value; BLIM = 60; fill(); });
        const bq = UI.$('#vsBQ', app); if (bq) bq.addEventListener('input', () => { VS.q = bq.value; BLIM = 60; fill(); });
        const L = UI.$('#vsBList', app);
        if (L) L.addEventListener('click', e => { const b = e.target.closest('[data-bpick]'); if (b) takeP(b.dataset.bpick); });
      }
      // the clock
      stopTick();
      if (turn) {
        const total = (cfg.timer || 30) * 1000 + (turn.phase === 'pick' && !cfg.board ? SPIN_MS : 0);
        const tick = () => {
          const el = UI.$('#vsTimer', app);
          if (!el || !VS.turn || VS.turn !== turn) { stopTick(); return; }
          const left = turn.until - Date.now();
          el.querySelector('span').textContent = Math.max(0, Math.ceil(left / 1000));
          el.querySelector('i').style.setProperty('--w', Math.max(0, Math.min(100, 100 * left / total)) + '%');
          el.classList.toggle('low', left < 10000);
          const actor = canAct(on) ? 0 : online() ? 5000 : null;   // the player on the clock, else the other phone a bit later
          if (actor === null || left > -actor) return;
          stopTick();
          if (cfg.board) {
            const tkn = B.takenSet(gone), five = cfg.sides[on].picks.map(id => byId[id]).filter(Boolean);
            const rp = B.players.filter(p => !tkn.has(B.base(p)) && C.capFits(cfg.cap, five, p)).sort((a, b) => b.ovr - a.ovr)[0];
            if (rp) { VS.cfg.sides[on].picks.push(rp.id); VS.turn = turnFor(cfg, taken.length + 1, 'spin'); push(); UI.toast('Time: ' + who(on) + ' gets ' + rp.name + '.'); draft(app); }
            return;
          }
          if (turn.phase === 'spin' && !VS.spin) { const s2 = spinFor(cfg, B, taken, null); if (s2) { VS.spin = s2; VS.spun = VS.spun.concat([s2.key]); VS.turn = turnFor(cfg, taken.length, 'pick'); push(); draft(app); } }
          else if (turn.phase === 'pick' && VS.spin && VS.spin.pick === taken.length) {
            const five = cfg.sides[on].picks.map(id => byId[id]).filter(Boolean);
            const pool = rosterOf(B, VS.spin.key, gone).filter(p => C.capFits(cfg.cap, five, p));
            if (!pool[0]) { VS.spin = null; VS.turn = turnFor(cfg, taken.length, 'spin'); push(); draft(app); return; }
            const rp = pool[Math.floor(Math.random() * pool.length)];
            if (rp) { VS.cfg.sides[on].picks.push(rp.id); VS.spin = null; VS.turn = turnFor(cfg, taken.length + 1, 'spin'); push(); UI.toast('Time: ' + who(on) + ' gets ' + rp.name + '.'); draft(app); }
          }
        };
        TICK = setInterval(tick, 250);
        tick();
      }
      UI.$('#vsSetup', app).addEventListener('click', () => go('setup'));
      // a new spin on either phone: both animate it
      if (spin && !ANIM[spin.n]) {
        UI.challengeWheel.animate(app, teams, () => { ANIM[spin.n] = true; route(); }, { year: spin.year, abbr: spin.abbr }, { mode: B.era ? 'alltime' : 'versus', seasons: cfg.seasons });
      }
      const sp = UI.$('#chSpin', app);
      if (sp) sp.addEventListener('click', () => {
        const s = spinFor(cfg, B, taken, null);
        if (!s) return;
        VS.spin = s; VS.spun = VS.spun.concat([s.key]); VS.turn = turnFor(cfg, taken.length, 'pick'); push(); draft(app);
      });
      const fr = UI.$('#vsFree', app);
      if (fr) fr.addEventListener('click', () => {
        const s = spinFor(cfg, B, taken, spin && spin.key);
        if (!s) return;
        VS.spin = s; VS.spun = VS.spun.concat([s.key]); VS.turn = turnFor(cfg, taken.length, 'pick'); push(); draft(app);
      });
      const re = UI.$('#chRespin', app);
      if (re) re.addEventListener('click', () => {
        if (!(VS.respins[on] > 0)) return;
        const s = spinFor(cfg, B, taken, spin && spin.key);
        if (!s) return;
        VS.respins = VS.respins.slice(); VS.respins[on]--;
        VS.spin = s; VS.spun = VS.spun.concat([s.key]); VS.turn = turnFor(cfg, taken.length, 'pick'); push(); draft(app);
      });
      function takeP(id) {
        const i = C.vsOnClock(VS.cfg);
        if (i < 0 || !canAct(i)) return;
        const p = byId[id];
        if (VS.cfg.cap && p && !C.capFits(VS.cfg.cap, VS.cfg.sides[i].picks.map(x => byId[x]).filter(Boolean), p)) { UI.toast('That contract does not fit under the cap.', 'error'); return; }
        if (B.takenSet(gone).has(p ? B.base(p) : id)) { UI.toast('Already drafted.', 'error'); return; }
        VS.cfg.sides[i].picks.push(id);
        if (window.SFX) window.SFX.play('chime'); VS.spin = null; VS.turn = turnFor(VS.cfg, taken.length + 1, 'spin'); push();
        draft(app); window.scrollTo(0, 0);
      }
      app.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => takeP(b.dataset.add)));
      app.querySelectorAll('.vs-side').forEach((el, i) => UI.swapBind(el, k => {
        const sw = VS.sw, pk = VS.cfg.sides[i].picks;
        if (!sw || sw.s !== i) { VS.sw = { s: i, k }; }
        else if (sw.k === k) { VS.sw = null; }
        else { const t = pk[k]; pk[k] = pk[sw.k]; pk[sw.k] = t; VS.sw = null; push(); }
        draft(app);
      }));
      const sim = UI.$('#vsSim', app);
      if (sim) sim.addEventListener('click', () => {
        const go2 = () => { VS.shown = 0; go('series'); };
        if (!UI.slib || sim.dataset.busy) { go2(); return; }
        sim.dataset.busy = '1';
        const groups = [0, 1].map(i => ({ label: who(i).toUpperCase() + ' | ' + ((tOf(B.teams, VS.cfg.sides[i].team).name) || '').toUpperCase(), color: (tOf(B.teams, VS.cfg.sides[i].team).colors || ['#888'])[0],
          players: VS.cfg.sides[i].picks.map(id => byId[id]).filter(Boolean).map(p => (p.season || !VS.cfg.year ? p : Object.assign({}, p, { season: VS.cfg.year }))) }));
        UI.slib.intro(groups, { ratings: !(VS.cfg.blind || (VS.opts && VS.opts.blind)) }, () => { delete sim.dataset.busy; go2(); });
      });
    });
  }

  // ---------- the series: watch each game on the court, or sim it ----------
  let RUN = null;   // { key, r } the series with its play-by-play, from the seed
  let WATCH = 0;    // the game being watched on this phone (1-based), 0 = none
  let courtCtl = null;
  function runFor(cfg) {
    const key = JSON.stringify([cfg.seed, cfg.year, cfg.bestOf, cfg.noBench ? 1 : 0, cfg.sides.map(s => s.picks)]);
    if (!RUN || RUN.key !== key) RUN = { key, r: C.playVersus(cfg, { pbp: true }) };
    return RUN.r;
  }
  // a watch party runs on the host's clock: the host tells the other phone where the game is every moment, and that phone
  // catches up if it is behind and waits if it is ahead, so both see the same play, box score and subs, on any device
  let SYNCT = null, SYNC_SEEN = 0;
  let PEND = null;   // a room code from a join link, waiting for the sign in
  function stopSync() { if (SYNCT) { clearInterval(SYNCT); SYNCT = null; } }
  function startSync(n) {
    stopSync();
    if (!linked() || NET.role !== 'host') return;
    SYNCT = setInterval(() => {
      if (!courtCtl || WATCH !== n || !linked()) { stopSync(); return; }
      const s = courtCtl.state();
      send({ t: 'csync', n, cur: s.cur, playing: s.playing, speed: s.speed });
    }, 1000);
  }
  function dropCourt() { stopSync(); if (courtCtl) { try { courtCtl.destroy(); } catch (e) { /* gone */ } courtCtl = null; } }
  const f1 = v => v == null ? '-' : (+v).toFixed(1);   // per game: 8.0, not 8
  function series(app) {
    stopTick();
    const cfg = VS.cfg;
    if (!cfg || C.vsOnClock(cfg) >= 0) { go(cfg ? 'draft' : 'setup'); return; }
    if (!cfg.year) {   // every season: the seasons the picks came from
      const need = [...new Set(cfg.sides[0].picks.concat(cfg.sides[1].picks).map(k => +String(k).split('@')[1]).filter(y => y && y !== 2013 && !C.loaded(y)))];
      if (need.length) { app.innerHTML = '<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING THE ROSTERS...</div></section>'; Promise.all(need.map(y => C.load(y))).then(() => series(app)).catch(e => UI.toast(e.message || 'Rosters did not load', 'error')); return; }
    }
    rkStart(cfg);
    loadThen(app, cfg.year, () => {
      let r;
      try { r = runFor(cfg); } catch (e) { app.innerHTML = UI.empty('COULD NOT PLAY IT', esc(e.message || e), '<div class="row-btns"><a class="btn" href="#/challenge/vs">BACK</a></div>'); return; }
      const shown = Math.min(r.games.length, VS.shown || 0), done = shown >= r.games.length;
      if (WATCH && WATCH <= shown) WATCH = 0;
      // online, a WATCH on one phone starts the same game on the other (VS.watch); a redraw keeps the court playing
      const want = linked() && VS.watch && VS.watch.n > shown && Date.now() - (VS.watch.at || 0) < 9e5 ? VS.watch.n : 0;
      const keep = courtCtl && WATCH && WATCH > shown && (!want || want === WATCH) ? UI.$('#vsCourt', app) : null;
      if (!keep) dropCourt();
      const S = r.sides, idx = a => (a === S[0].abbr ? 0 : 1);
      const nm = i => cfg.sides[i].name || tName(S[i].team), whoA = a => who(idx(a));
      const w = shown ? r.games[shown - 1].wins : { [S[0].abbr]: 0, [S[1].abbr]: 0 };
      const PL = {}; S.forEach(sd => sd.five.forEach(p => { PL[p.id] = Object.assign({ team: sd.abbr }, p); }));
      const blindNow = cfg.blind && !done;
      const homeGames = { 3: 'games 1 and 3', 5: 'games 1, 2 and 5', 7: 'games 1, 2, 5 and 7' }[r.bestOf];
      const score = `<div class="vs-score">${S.map((sd, i) => `<div class="vs-score-t${done && r.winner === sd.abbr ? ' won' : ''}" style="--c1:${esc((sd.team.colors || ['#333'])[0])}">${logo(sd.team, 40)}<span><small>${esc(who(i))}</small><b>${esc(nm(i))}</b></span><strong>${w[sd.abbr]}</strong></div>`).join('<i>-</i>')}</div>`;
      const head = done
        ? `<section class="vs-win" style="--c1:${esc((S[idx(r.winner)].team.colors || ['#333'])[0])}">${logo(S[idx(r.winner)].team, 64)}<div><div class="ch-hero-k">BEST OF ${r.bestOf}</div>
            <h1>${esc(whoA(r.winner)).toUpperCase()} WINS ${r.wins[r.winner]}-${r.wins[r.winner === S[0].abbr ? S[1].abbr : S[0].abbr]}</h1>
            ${r.mvp ? `<p>Series MVP: <b>${esc(r.mvp.name)}</b> (${esc(f1(r.mvp.line.pts) + ' PTS, ' + f1(r.mvp.line.reb) + ' REB, ' + f1(r.mvp.line.ast) + ' AST')})</p>` : ''}</div></section>`
        : `<section class="vs-next"><div class="ch-hero-k">BEST OF ${r.bestOf} | ${esc(lblC(cfg))}${cfg.blind ? ' | BLIND' : ''}</div><h1>${WATCH ? 'GAME ' + WATCH + ', LIVE' : shown ? 'GAME ' + (shown + 1) + ' IS NEXT' : 'THE SERIES'}</h1>
            <p class="muted">${esc(whoA(r.home))} has home court (${homeGames}). First to ${r.need}. ${cfg.bench && !cfg.noBench ? 'Starters play about 34 minutes, the bench the rest.' : 'All ten players go the full 48.'}</p>${cfg.bench ? `<div class="ch-chips"><button type="button" class="ch-chip${!cfg.noBench ? ' on' : ''}" data-nb="0">WITH THE BENCH</button><button type="button" class="ch-chip${cfg.noBench ? ' on' : ''}" data-nb="1">STARTERS ONLY</button></div>` : ''}</section>`;
      const gameBox = side => {
        const i = idx(side.abbr), rows = side.box || [], sum = k => rows.reduce((s, x) => s + (+x[k] || 0), 0), ms = (m, a) => m + '-' + a;
        const tr = x => `<td>${x.min != null ? f1(x.min) : ''}</td><td>${x.pts}</td><td>${(x.oreb || 0) + (x.dreb || 0)}</td><td>${x.ast}</td><td>${x.stl}</td><td>${x.blk}</td><td>${x.tov}</td><td>${ms(x.fgm, x.fga)}</td><td>${ms(x.tpm, x.tpa)}</td><td>${ms(x.ftm, x.fta)}</td>`;
        return `<div class="vs-res" style="--c1:${esc((S[i].team.colors || ['#333'])[0])}"><div class="vs-side-h">${logo(S[i].team, 26)}<div><small>${esc(who(i))}</small><b>${esc(nm(i))} ${side.pts}</b></div></div>
          <div class="vs-tbl-w"><table class="vs-tbl"><thead><tr><th class="l">PLAYER</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FG</th><th>3P</th><th>FT</th><th>+/-</th></tr></thead>
          <tbody>${rows.map(x => `<tr><td class="l">${esc(x.name)}${PL[x.id] && PL[x.id].season && !cfg.year ? ' <small class="muted">' + esc(short(PL[x.id].season)) + '</small>' : ''}</td>${tr(x)}<td>${x.pm > 0 ? '+' : ''}${x.pm || 0}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td class="l">TOTALS</td>${tr({ min: sum('min'), pts: sum('pts'), oreb: sum('oreb'), dreb: sum('dreb'), ast: sum('ast'), stl: sum('stl'), blk: sum('blk'), tov: sum('tov'), fgm: sum('fgm'), fga: sum('fga'), tpm: sum('tpm'), tpa: sum('tpa'), ftm: sum('ftm'), fta: sum('fta') })}<td></td></tr></tfoot></table></div></div>`;
      };
      const R = done ? recordSeries(r, cfg) : null;
      if (done && online() && me() !== null && me() >= 0 && UI.ranked && UI.profile.signedIn() && NET.code) {   // both signed-in players report: the database counts it when the two agree
        const i = me(), sc = UI.ranked.lineupScore(S[i].five);
        if (cfg.ranked) { const k = rkKey(cfg); rkOver(k); let seenNav = false; try { seenNav = sessionStorage.getItem('a13-rk-nav-' + k); sessionStorage.setItem('a13-rk-nav-' + k, '1'); } catch (e) { /* private mode */ }
          if (!seenNav) setTimeout(() => { if (location.hash.indexOf('#/challenge/vs') === 0) location.hash = '#/ranked/result'; }, 4000); }
        UI.ranked.report({ key: NET.code + ':' + cfg.seed, opp: who(1 - i), myWins: r.wins[S[i].abbr] || 0, oppWins: r.wins[S[1 - i].abbr] || 0, era: UI.ranked.eraOf(cfg), style: cfg.auction ? 'auction' : cfg.board ? 'board' : 'wheel', ranked: !!cfg.ranked, bestOf: r.bestOf,
          lineup: { names: S[i].five.map(p => p.name), seasons: S[i].five.map(p => p.season || cfg.year || null), score: sc, era: UI.ranked.eraOf(cfg) }, score: sc });
      }
      const games = r.games.slice(0, shown).map(g => {
        const t = g.top && PL[g.top.id];
        return `<li><span class="vs-g-n">GAME ${g.n}</span><span class="vs-g-s"><b class="${g.winner === g.away ? 'w' : ''}">${esc(whoA(g.away))} ${g.as}</b> @ <b class="${g.winner === g.home ? 'w' : ''}">${esc(whoA(g.home))} ${g.hs}</b>${g.ot ? ' <small>(' + (g.ot > 1 ? g.ot : '') + 'OT)</small>' : ''}</span>${t ? `<small class="muted">${esc(t.name)}: ${g.top.pts} pts, ${g.top.reb} reb, ${g.top.ast} ast</small>` : ''}
          <button type="button" class="btn btn-small vs-rewatch" data-rewatch="${g.n}">WATCH</button>
          ${g.res ? `<details class="vs-gbox"><summary>BOX SCORE</summary>${['away', 'home'].map(k => gameBox(g.res[k])).join('')}</details>` : ''}</li>`;
      }).join('');
      const box = done ? `<section class="vs-box">${UI.header('SERIES BOX', 'Per game')}<div class="vs-sides">${S.map((sd, i) => `<div class="vs-res" style="--c1:${esc((sd.team.colors || ['#333'])[0])}"><div class="vs-side-h">${logo(sd.team, 32)}<div><small>${esc(who(i))}</small><b>${esc(nm(i))}</b></div></div>
          <div class="vs-tbl-w"><table class="vs-tbl"><thead><tr><th class="l">PLAYER</th><th>SPOT</th><th>OVR</th><th>MPG</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>3PM</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead><tbody>${(() => { const row = p => { const l = r.lines[p.id] || {}; return `<tr><td class="l">${esc(p.name)}${p.season && !cfg.year ? ' <small class="muted">' + esc(short(p.season)) + '</small>' : ''}</td><td>${esc(p.slot || '')}</td><td>${esc(p.ovr)}</td><td>${f1(l.mpg)}</td><td>${f1(l.pts)}</td><td>${f1(l.reb)}</td><td>${f1(l.ast)}</td><td>${f1(l.stl)}</td><td>${f1(l.blk)}</td><td>${f1(l.tov)}</td><td>${f1(l.tpm)}</td><td>${f1(l.fgp)}</td><td>${f1(l.tpp)}</td><td>${f1(l.ftp)}</td></tr>`; }; return sd.five.slice().sort((a, b) => C.SLOTS.indexOf(a.slot) - C.SLOTS.indexOf(b.slot)).map(row).join('') + (sd.bench && sd.bench.length ? '<tr class="vs-bench-row"><td class="l" colspan="14">BENCH</td></tr>' + sd.bench.map(row).join('') : ''); })()}</tbody></table></div></div>`).join('')}</div></section>` : '';
      const next = shown + 1;
      const acts = done
        ? `<button type="button" class="btn btn-share" id="vsShare">${UI.shareIcon || ''}SEND THIS TO YOUR FRIENDS</button><button type="button" class="btn sl-copy" id="vsCopy">COPY LINK</button><button type="button" class="btn" id="vsNew">NEW MATCHUP</button>${rematchBtn(cfg)}`
        : WATCH ? `<button type="button" class="btn btn-gold" id="vsFinal">SKIP TO THE FINAL</button>`
        : `<button type="button" class="btn btn-gold btn-big" id="vsWatch">WATCH GAME ${next}</button><button type="button" class="btn" id="vsNext">SIM GAME ${next}</button><button type="button" class="btn" id="vsAll">SIM THE REST</button>`;
      app.innerHTML = `${head}${netBar()}${score}
        ${WATCH ? '<div class="ct-host" id="vsCourt"></div>' : ''}
        <div class="row-btns center ch-acts vs-acts">${acts}</div>
        ${games ? `<ol class="vs-glist">${games}</ol>` : ''}
        ${R ? rivalBox(R) : ''}
        ${box}
        ${done ? `<div class="vs-fits">${S.map((sd, i) => UI.challengeFit(sd.fit, { compact: true, title: (who(i) + "'s lineup").toUpperCase() })).join('')}</div>` : ''}${reactBar()}`;
      if (keep) { const ph = UI.$('#vsCourt', app); if (ph) ph.replaceWith(keep); }
      bindNet(app); bindReact(app);
      const reveal = n => { if (n >= r.games.length && (VS.shown || 0) < n && window.SFX) window.SFX.play('crowd'); WATCH = 0; VS.watch = null; dropCourt(); VS.shown = Math.max(VS.shown || 0, n); push(); series(app); window.scrollTo(0, 0); };
      const watch = n => {
        WATCH = n; series(app);
        const el = UI.$('#vsCourt', app), g = r.games[n - 1];
        if (!el || !g || !g.res || !(window.COURT && window.COURT.available(g.res))) { if (el) el.innerHTML = '<p class="muted">The court view did not load.</p>'; return; }
        courtCtl = window.COURT.mount(el, { game: g.res, start: 0, autoplay: true, team: a => S[idx(a)].team, player: id => PL[id] || null,
          logo: (a, size) => logo(S[idx(a)].team, size), onEnd: () => { if (WATCH === n && n > (VS.shown || 0)) reveal(n); },
          onControl: (k, v) => { if (linked()) send({ t: 'court', n, k, v }); } });
        if (courtCtl) startSync(n);
        if (courtCtl && UI.extras && typeof UI.extras.onLeave === 'function') UI.extras.onLeave(dropCourt);
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      };
      const $ = id => UI.$(id, app);
      if ($('#vsWatch')) $('#vsWatch').addEventListener('click', () => { VS.watch = { n: next, at: Date.now() }; push(); watch(next); });
      if ($('#vsNext')) $('#vsNext').addEventListener('click', () => reveal(next));
      if ($('#vsAll')) $('#vsAll').addEventListener('click', () => reveal(r.games.length));
      if ($('#vsFinal')) $('#vsFinal').addEventListener('click', () => reveal(WATCH));
      app.querySelectorAll('[data-rewatch]').forEach(b => b.addEventListener('click', () => {
        const n = +b.dataset.rewatch, g = r.games[n - 1], el = document.createElement('div');
        dropCourt(); el.className = 'ct-host'; b.closest('li').after(el);
        courtCtl = window.COURT && window.COURT.available(g.res) ? window.COURT.mount(el, { game: g.res, start: 0, autoplay: true, team: a => S[idx(a)].team, player: id => PL[id] || null, logo: (a, size) => logo(S[idx(a)].team, size) }) : null;
        if (!courtCtl) el.innerHTML = '<p class="muted">The court view did not load.</p>';
      }));
      app.querySelectorAll('[data-nb]').forEach(b => b.addEventListener('click', () => { const v = +b.dataset.nb; if ((VS.cfg.noBench ? 1 : 0) === v) return; VS.cfg.noBench = v; VS.shown = 0; WATCH = 0; VS.watch = null; dropCourt(); push(); series(app); }));
      if ($('#vsShare')) $('#vsShare').addEventListener('click', () => {
        const wi = idx(r.winner), li = 1 - wi, ws = r.wins[r.winner] + '-' + r.wins[S[li].abbr];
        const spec = { kicker: 'VERSUS | BEST OF ' + r.bestOf + ' | ' + lblC(cfg), title: who(wi).toUpperCase() + ' WINS', big: ws, gold: true,
          banner: r.mvp ? 'SERIES MVP: ' + r.mvp.name.toUpperCase() : '', colors: S[wi].team.colors, logo: S[wi].team.logo,
          lines: [[who(0).slice(0, 8).toUpperCase(), S[0].five.map(p => p.name.split(' ').pop()).join(', ')], [who(1).slice(0, 8).toUpperCase(), S[1].five.map(p => p.name.split(' ').pop()).join(', ')]] };
        const mv = r.mvp ? ` ${r.mvp.name} was the MVP with ${f1(r.mvp.line.pts)} a game.` : '';
        const lost = r.wins[S[li].abbr], close = r.games.slice().sort((x, y) => Math.abs(x.hs - x.as) - Math.abs(y.hs - y.as))[0];
        const how = lost === 0 ? `🧹 ${who(wi)} swept ${who(li)} ${ws}` : r.games.length === r.bestOf ? `🏀 ${who(wi)} beat ${who(li)} ${ws}, all the way to a deciding game` : `🏀 ${who(wi)} beat ${who(li)} ${ws}`;
        const nail = close && Math.abs(close.hs - close.as) <= 3 ? ` Game ${close.n} came down to ${Math.abs(close.hs - close.as)}.` : '';
        const five = S[wi].five.map(p => p.name.split(' ').pop()).join(', ');
        const end = [`${who(li)} wants a rematch. Spin your own:`, `${who(li)} is already asking for game 2. Spin your own:`, `Think you can draft better? Spin your own:`][Math.floor(Math.random() * 3)];
        const riv = R && R.log.length > 1 ? ' ' + rivalLead(R) + ' in our rivalry.' : '';
        const text = `${how} in a ${lblC(cfg)} versus draft. Winning five: ${five}.${mv}${nail}${riv} ${end}`;
        UI.shareResult(spec, text, location.origin + location.pathname + '#/challenge/vs', 'versus');
      });
      if ($('#vsCopy')) $('#vsCopy').addEventListener('click', () => {
        const wi = idx(r.winner);
        const o = { v: 1, k: 'v', bo: r.bestOf, lb: lblC(cfg), wi: wi, n: [who(0), who(1)], r: cfg.blind || cfg.cap ? 0 : 1,
          tm: S.map((x, i) => [x.abbr, nm(i), (x.team.colors || ['#444'])[0]]), sc: S.map(x => r.wins[x.abbr] || 0),
          f: S.map(x => x.five.slice().sort((a, b) => C.SLOTS.indexOf(a.slot) - C.SLOTS.indexOf(b.slot)).map(p => [p.id, p.name, p.slot || C.primaryPos(p.pos), p.ovr, p.nbaId || 0, r.lines[p.id] ? f1(r.lines[p.id].pts) + ' PPG' : ''])),
          g: r.games.map(g => [g[S[0].abbr === g.home ? 'hs' : 'as'], g[S[0].abbr === g.home ? 'as' : 'hs'], g.ot ? 1 : 0]) };
        if (r.mvp) o.mv = [r.mvp.name, f1(r.mvp.line.pts), f1(r.mvp.line.reb), f1(r.mvp.line.ast)];
        UI.slib.copy(UI.slib.url('vs', o), 'Head to Head result', who(wi) + ' beat ' + who(1 - wi) + ' ' + o.sc[wi] + '-' + o.sc[1 - wi] + ' in a Head to Head draft. Spin your own:');
      });
      if ($('#vsRivalReset')) $('#vsRivalReset').addEventListener('click', () => {
        if (!window.confirm('Reset the record between ' + who(0) + ' and ' + who(1) + ' on this phone?')) return;
        const all = rivals.all(), k = pairKey(), ids = all[k] ? all[k].ids : []; all[k] = { ids }; rivals.save(all); series(app);   // keeps the ids so this series does not count again
      });
      if ($('#vsRematch')) $('#vsRematch').addEventListener('click', () => { RM.seed = cfg.seed; RM.me = true; send({ t: 'rematch', seed: cfg.seed }); maybeRematch(); series(app); });
      if ($('#vsNew')) $('#vsNew').addEventListener('click', () => { VS.cfg = null; VS.shown = 0; VS.watch = null; VS.names = ['', '']; VS.tnames = ['', '']; go('setup'); });
      if (want && WATCH !== want) watch(want);   // the other phone pressed WATCH
    });
  }

  const base = P.challenge;
  P.challenge = function (app, arg) {
    const part = String(arg || '').split('/');
    if (part[0] === 'vs' && part[1] === 'r') {   // a shared Head to Head result card (read only)
      dropCourt(); stopTick();
      const o = UI.slib && UI.slib.read(part.slice(2).join('/'));
      if (!o || o.k !== 'v') { UI.slib ? UI.slib.bad(app) : (location.hash = '#/challenge/vs'); return; }
      UI.slib.vsCard(app, o); return;
    }
    if (part[0] !== 'vs') { dropCourt(); stopTick(); return base.apply(this, arguments); }
    APP = app;
    if (part[1] === 'watch' && part[2]) {   // a spectator's link: no name needed
      VS.page = 'setup';
      if (!(NET.role === 'watch' && NET.code === part[2].toUpperCase())) watchRoom(part[2]);
      if (location.hash !== '#/challenge/vs') { history.replaceState(null, '', '#/challenge/vs'); }
      return setup(app);
    }
    if (part[1] === 'join' && part[2]) {
      VS.page = 'setup';
      if (!UI.profile.canPlay()) PEND = part[2].toUpperCase();
      else if (!(NET.role === 'guest' && NET.code === part[2].toUpperCase())) join(part[2]);
      if (location.hash !== '#/challenge/vs') { history.replaceState(null, '', '#/challenge/vs'); }
      return setup(app);
    }
    const page = part[1] === 'draft' ? 'draft' : part[1] === 'result' ? 'series' : 'setup';
    if (page !== 'setup' && !VS.cfg) { VS.page = 'setup'; return setup(app); }
    if (page === 'setup' && !VS.cfg && !NET.role) { VS.names = ['', '']; VS.tnames = ['', '']; }
    VS.page = page;
    if (page === 'draft') return draft(app);
    if (page === 'series') return series(app);
    return setup(app);
  };
  Object.keys(base).forEach(k => { P.challenge[k] = base[k]; });
})();
