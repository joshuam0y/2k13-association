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
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const FRESH = () => ({ year: 2008, teams: ['BOS', 'LAL'], names: ['', ''], opts: { bestOf: 5, blind: false, timer: 24, bench: 0 }, cfg: null, shown: 0, page: 'setup', spin: null, spun: [], respins: [1, 1], turn: null, pos: '', q: '', epoch: 0, hostSide: 0 });
  let VS = Object.assign(FRESH(), ls.get() || {});
  VS.opts = Object.assign({ bestOf: 5, blind: false, timer: 24, era: 2013, bench: 0 }, VS.opts || {});
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
  const who = i => VS.names[i] || ('PLAYER ' + (i + 1));
  // ---------- the rivalry: every finished series between the same two names, kept on this phone ----------
  const RKEY = 'a13-vs-rivals';
  const rivals = {
    all() { try { return JSON.parse(localStorage.getItem(RKEY) || '{}') || {}; } catch (e) { return {}; } },
    save(v) { try { localStorage.setItem(RKEY, JSON.stringify(v)); } catch (e) { /* private mode */ } }
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
  const SHARED = ['year', 'skip', 'teams', 'names', 'opts', 'cfg', 'shown', 'watch', 'page', 'spin', 'spun', 'respins', 'turn', 'epoch', 'hostSide'];
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
    seal(Object.assign({ from: NET.me, role: NET.role, ep: VS.epoch || 0 }, obj)).then(txt => { try { NET.client.publish(topic(), txt, { qos: 1 }); } catch (e) { /* reconnecting */ } }).catch(() => {});
  }
  function push() {
    ls.set(VS);
    if (linked()) { const s = {}; SHARED.forEach(k => { s[k] = VS[k]; }); send({ t: 'state', s }); }
  }
  function seen() {
    NET.peerSeen = Date.now();
    if (NET.status !== 'connected') {
      NET.status = 'connected'; NET.err = '';
      if (NET.role === 'host') push(); else send({ t: 'hello', name: VS.names[NET.side] || '' });
      route(); drawChat();
    }
  }
  function onMsg(m) {
    if (!m || typeof m !== 'object' || m.from === NET.me) return;
    if (m.role === NET.role) {   // a third phone with our role, or two hosts after a handover: the newer epoch keeps the room
      if (NET.role === 'host' && (m.ep || 0) !== undefined) {
        const mine = VS.epoch || 0, theirs = m.ep || 0;
        if (theirs > mine || (theirs === mine && m.from < NET.me && theirs > 0)) { NET.role = 'guest'; NET.status = 'connecting'; send({ t: 'hello', name: VS.names[NET.side] || '' }); route(); }
        else push();
      }
      return;
    }
    if (m.t === 'ping') { seen(); return; }
    if (m.t === 'hello' && NET.role === 'host') { if (m.name) VS.names[1 - NET.side] = String(m.name).slice(0, 20); seen(); push(); route(); return; }
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
    if (m.t === 'chat' && m.text) { addChat({ name: String(m.name || '').slice(0, 20), text: String(m.text).slice(0, 300), mine: false }); }
  }
  // the other player takes the room: by choice (the host presses MAKE HOST) or when the host drops for good
  function becomeHost(chosen) {
    VS.epoch = (VS.epoch || 0) + 1; VS.hostSide = NET.side; NET.role = 'host';
    NET.status = 'waiting'; NET.peerSeen = 0; NET.err = ''; ls.set(VS);
    if (!chosen) UI.toast('The host dropped. You are the host now.');
    route(); drawChat();
    send({ t: 'ping', name: VS.names[NET.side] || '' });
  }
  function handOver() {
    if (NET.role !== 'host' || !linked()) return;
    if (!window.confirm('Make ' + who(1 - NET.side) + ' the host? They set the rules and run the room from here.')) return;
    VS.epoch = (VS.epoch || 0) + 1; VS.hostSide = 1 - NET.side;
    push(); NET.role = 'guest'; NET.status = 'connecting'; NET.peerSeen = Date.now(); route();
  }
  function hangUp() {
    NET.timers.forEach(t => clearInterval(t)); NET.timers = [];
    try { if (NET.client) NET.client.end(true); } catch (e) { /* gone */ }
    Object.assign(NET, { role: null, code: '', status: '', err: '', client: null, key: null, peerSeen: 0 });
  }
  // connects to a relay (falling back to the next if one will not answer), joins the room, starts the pings
  function connectRoom(role, code) {
    NET.timers.forEach(t => clearInterval(t)); NET.timers = [];
    try { if (NET.client) NET.client.end(true); } catch (e) { /* gone */ }
    Object.assign(NET, { role, side: role === 'host' ? 0 : 1, code, status: role === 'host' ? 'starting' : 'connecting', err: '', client: null, peerSeen: 0, me: Math.random().toString(36).slice(2, 10) });
  if (role === 'host') { VS.epoch = 0; VS.hostSide = 0; } else VS.epoch = -1;
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
            if (NET.status === 'starting') NET.status = 'waiting';
            if (NET.role === 'guest' && NET.status !== 'connected') NET.status = 'connecting';
            send({ t: NET.role === 'guest' ? 'hello' : 'ping', name: VS.names[me()] || '' });
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
        send({ t: NET.role === 'guest' && NET.status !== 'connected' ? 'hello' : 'ping', name: VS.names[me()] || '' });
        if (NET.status === 'connected' && Date.now() - NET.peerSeen > 15000) { NET.status = 'lost'; route(); drawChat(); }
        else if (NET.role === 'guest' && NET.status === 'lost' && Date.now() - NET.peerSeen > 25000 && VS.cfg) becomeHost(false);
      }, 4000));
      // a guest whose host never answers: say so, but keep listening
      if (role === 'guest') setTimeout(() => { if (NET.code === code && NET.status === 'connecting') { NET.err = 'No answer from room ' + code + ' yet. Check the code, and that your friend still has the room open. Still trying...'; NET.status = 'error-wait'; route(); } }, 20000);
    }).catch(e => { NET.status = 'error'; NET.err = e.message || 'The connection failed.'; route(); });
  }
  const CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 5 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join('');
  function host() { connectRoom('host', newCode()); }
  function join(code) { const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length >= 4) connectRoom('guest', c); }
  const joinLink = () => location.origin + location.pathname + '#/challenge/vs/join/' + NET.code;
  function netBar() {
    if (!online()) return '';
    const st = NET.status, other = who(1 - NET.side);
    const msg = st === 'connected' ? `Connected with <b>${esc(other)}</b>. You are ${esc(who(me()))}.`
      : st === 'waiting' ? `Room <b>${esc(NET.code)}</b>: send your friend the link, then wait here.`
      : st === 'connecting' || st === 'starting' ? 'Connecting...'
      : st === 'code' ? 'Type the room code your friend sees on his phone.'
      : st === 'lost' ? 'Lost the other phone. Reconnecting on its own when it is back...'
      : st === 'error-wait' ? esc(NET.err) : esc(NET.err || 'Not connected.');
    return `<div class="vs-net ${st}"><span class="vs-net-dot"></span><span>${msg}</span>
      ${st === 'waiting' ? `<button type="button" class="btn btn-small" id="vsCopy">COPY LINK</button>` : ''}
      ${NET.role === 'host' && st === 'connected' ? `<button type="button" class="btn btn-small" id="vsHand">MAKE ${esc(who(1 - NET.side).toUpperCase())} HOST</button>` : ''}
      ${st === 'lost' || st === 'error' ? `<button type="button" class="btn btn-small" id="vsRetry">${NET.role === 'host' ? 'NEW ROOM' : 'TRY AGAIN'}</button>` : ''}
      <button type="button" class="btn btn-small" id="vsLeave">LEAVE</button></div>`;
  }
  function bindNet(app) {
    const cp = UI.$('#vsCopy', app);
    if (cp) cp.addEventListener('click', async () => {
      const link = joinLink(), text = 'Draft me on Starting Five. Room ' + NET.code + ': ' + link;
      if (navigator.share) { try { await navigator.share({ text, url: link }); return; } catch (e) { /* closed */ } }
      try { await navigator.clipboard.writeText(link); UI.toast('Link copied. Send it to your friend.'); } catch (e) { UI.toast(link); }
    });
    const hd = UI.$('#vsHand', app); if (hd) hd.addEventListener('click', handOver);
    const rt = UI.$('#vsRetry', app); if (rt) rt.addEventListener('click', () => (NET.role === 'host' ? host() : join(NET.code)));
    const lv = UI.$('#vsLeave', app); if (lv) lv.addEventListener('click', () => { hangUp(); route(); });
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
    if (!linked()) return '';
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
  const CHAT = { list: [], open: false, unread: 0 };
  function addChat(msg) {
    CHAT.list.push(Object.assign({ at: Date.now() }, msg));
    if (CHAT.list.length > 100) CHAT.list.shift();
    if (!msg.mine && !CHAT.open) { CHAT.unread++; bubble('💬 ' + msg.text.slice(0, 40), msg.name, false); }
    drawChat();
  }
  function drawChat() {
    let box = document.getElementById('vsChat');
    if (!linked() || !/^#\/challenge\/vs/.test(location.hash)) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div'); box.id = 'vsChat'; box.className = 'vs-chat';
      document.body.appendChild(box);
      box.addEventListener('click', e => {
        if (e.target.closest('[data-chat="toggle"]')) { CHAT.open = !CHAT.open; if (CHAT.open) CHAT.unread = 0; drawChat(); if (CHAT.open) { const i = box.querySelector('input'); if (i) i.focus(); } }
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
    box.innerHTML = `<button type="button" class="vs-chat-btn" data-chat="toggle" aria-expanded="${CHAT.open}">💬 CHAT${CHAT.unread ? `<b>${CHAT.unread}</b>` : ''}</button>
      ${CHAT.open ? `<div class="vs-chat-panel"><div class="vs-chat-h"><span>CHAT WITH ${esc(who(me() === 0 ? 1 : 0)).toUpperCase()}</span><button type="button" data-chat="toggle" aria-label="Close chat">&times;</button></div>
        <ol class="vs-chat-list">${msgs || '<li class="muted">Say something. Trash talk welcome.</li>'}</ol>
        <form class="vs-chat-form"><input maxlength="300" placeholder="Message" autocomplete="off" enterkeyhint="send"><button type="submit" class="btn btn-gold btn-small">SEND</button></form></div>` : ''}`;
    const list = box.querySelector('.vs-chat-list'); if (list) list.scrollTop = list.scrollHeight;
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

  function loadThen(app, year, fn) {
    if (!year) {   // every season: the all-time pool plus the 2012-13 franchises
      if (C.loaded('pool') && C.loaded(2013)) { fn(); return; }
      app.innerHTML = '<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING EVERY SEASON...</div></section>';
      Promise.all([C.load('pool'), C.load(2013)]).then(fn).catch(e => { app.innerHTML = UI.empty('ROSTERS DID NOT LOAD', esc(e.message || e), '<div class="row-btns"><a class="btn" href="#/challenge">BACK</a></div>'); });
      return;
    }
    if (C.loaded(year)) { fn(); return; }
    app.innerHTML = `<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING THE ${esc(lbl(year))} ROSTERS...</div></section>`;
    C.load(year).then(fn).catch(e => { app.innerHTML = UI.empty('ROSTERS DID NOT LOAD', esc(e.message || e), '<div class="row-btns"><a class="btn" href="#/challenge">BACK</a></div>'); });
  }

  // ---------- setup ----------
  function setup(app) {
    stopTick();
    loadThen(app, VS.year, () => {
      const d = C.seasonData(VS.year || 2013), teams = d.teams.slice().sort((a, b) => tName(a).localeCompare(tName(b)));
      VS.teams = VS.teams.map((a, i) => teams.some(t => t.abbr === a) ? a : teams[i].abbr);
      if (VS.teams[0] === VS.teams[1]) VS.teams[1] = teams.find(t => t.abbr !== VS.teams[0]).abbr;
      const boss = NET.role !== 'guest';   // the host (or the one phone) sets the season and the rules
      const dis = c => (c ? '' : ' disabled');
      const grid = i => `<div class="ch-teams">${teams.map(t => `<button type="button" class="ch-team${VS.teams[i] === t.abbr ? ' on' : ''}" data-side="${i}" data-team="${esc(t.abbr)}"${VS.teams[1 - i] === t.abbr || !canAct(i) ? ' disabled' : ''} style="--c1:${esc(t.colors[0])}">${logo(t, 30)}<span>${esc(t.name)}</span></button>`).join('')}</div>`;
      if (me() !== null && !VS.names[me()] && UI.profile.name()) VS.names[me()] = UI.profile.name();
      const ready = !online() || linked();
      app.innerHTML = `
        <section class="ch-hero"><div class="ch-hero-k">DRAFT CHALLENGE | TWO PLAYERS</div><h1 class="ch-hero-t">YOU VS ME.</h1>
          <p class="ch-hero-p">Take turns spinning the wheel and taking one player from the team it lands on, until you both have five. Then a series: nobody comes off the bench, all five play 48 minutes, so positions and fit matter.</p></section>
        ${netBar()}
        <div class="ch-setup">
          ${NET.role ? UI.profile.bar() : ''}
          <div class="ch-step"><div class="ch-step-k">1 | HOW YOU PLAY</div>
            <div class="ch-seg vs-seg3"><button type="button" class="ch-seg-b${!online() ? ' on' : ''}" data-net="local"><b>SAME PHONE</b><small>Pass it back and forth</small></button>
              <button type="button" class="ch-seg-b${NET.role === 'host' ? ' on' : ''}" data-net="host"><b>HOST ONLINE</b><small>Get a room code for your friend</small></button>
              <button type="button" class="ch-seg-b${NET.role === 'guest' ? ' on' : ''}" data-net="join"><b>JOIN ONLINE</b><small>Enter your friend's code</small></button></div>
            ${NET.role === 'guest' && !linked() ? `<div class="vs-join"><label class="field"><span>ROOM CODE</span><input id="vsCode" maxlength="5" placeholder="ABCDE" value="${esc(NET.code)}" autocomplete="off" autocapitalize="characters"></label><button type="button" class="btn btn-gold" id="vsJoin">JOIN</button></div>` : ''}
          </div>
          <div class="ch-step"><div class="ch-step-k">2 | THE SEASON</div><div class="row-btns vs-seas-all"><button type="button" class="btn btn-small${!VS.skip.length ? ' on' : ''}" data-seas="all"${dis(boss)}>ALL</button><button type="button" class="btn btn-small" data-seas="none"${dis(boss)}>CLEAR</button>${DECADES().length > 1 ? DECADES().map(d => { const ys = ALL_YEARS.filter(y => decOf(y) === d), n = ys.filter(y => VS.skip.indexOf(y) < 0).length; return `<button type="button" class="btn btn-small${n === ys.length ? ' on' : n ? ' part' : ''}" data-dec="${d}"${dis(boss)}>${d}s</button>`; }).join('') : ''}<span class="muted">${chosen().length} of ${ALL_YEARS.length} on</span></div>
            <div class="vs-seas">${C.SEASONS.map(s => `<button type="button" class="ch-chip${VS.skip.indexOf(s.year) < 0 ? ' on' : ''}" data-yr="${s.year}"${dis(boss)}>${esc(s.label)}</button>`).join('')}</div>
            <small class="muted">${!chosen().length ? 'Pick at least one season.' : chosen().length === 1 ? 'One season: the whole ' + esc(lbl(chosen()[0])) + ' league.' : 'Every spin lands on a team and a season from the ones on. Nobody can be drafted twice, even from different seasons. Tap a season to switch it off.'}</small></div>
          <div class="ch-step"><div class="ch-step-k">3 | THE RULES</div>
            <div class="vs-rules"><div><span class="ts-start-k">SERIES</span><div class="ch-chips">${[3, 5, 7].map(n => `<button type="button" class="ch-chip${VS.opts.bestOf === n ? ' on' : ''}" data-bo="${n}"${dis(boss)}>BEST OF ${n}</button>`).join('')}</div></div>
              <div><span class="ts-start-k">SHOT CLOCK</span><div class="ch-chips">${[[24, '24 SEC'], [0, 'OFF']].map(([v, l]) => `<button type="button" class="ch-chip${(VS.opts.timer || 0) === v ? ' on' : ''}" data-timer="${v}"${dis(boss)}>${l}</button>`).join('')}</div>
                <small class="muted">${VS.opts.timer ? 'Run out of time and the wheel spins for you, or you get the best player on its team.' : 'No clock.'}</small></div>
              ${chosen().length === 1 ? '' : `<div><span class="ts-start-k">GAME RULES</span><div class="ch-chips">${ERAS.map(([v, l]) => `<button type="button" class="ch-chip${(VS.opts.era || 2013) === v ? ' on' : ''}" data-era="${v}"${dis(boss)}>${l}</button>`).join('')}</div></div>`}
              <div><span class="ts-start-k">BLIND DRAFT</span><div class="ch-chips"><button type="button" class="ch-chip${!VS.opts.blind ? ' on' : ''}" data-blind="0"${dis(boss)}>OFF</button><button type="button" class="ch-chip${VS.opts.blind ? ' on' : ''}" data-blind="1"${dis(boss)}>ON</button></div>
                <small class="muted">${VS.opts.cap ? 'Off with a salary cap: the prices give the ratings away.' : VS.opts.blind ? 'No ratings and no fit grades until the series is over: pick on what you know.' : 'Ratings and fit grades show while you draft.'}</small></div>
              <div><span class="ts-start-k">BENCH</span><div class="ch-chips"><button type="button" class="ch-chip${!VS.opts.bench ? ' on' : ''}" data-bench="0"${dis(boss)}>JUST THE FIVE</button><button type="button" class="ch-chip${VS.opts.bench ? ' on' : ''}" data-bench="3"${dis(boss)}>8-MAN: +3 BENCH</button></div>
                <small class="muted">${VS.opts.bench ? 'Everyone drafts eight. The first five start, the last three come off the bench (not with a salary cap).' : 'Five players each, all 48 minutes.'}</small></div>
              <div><span class="ts-start-k">SALARY CAP</span><div class="ch-chips">${UI.challengeCap.CAPS.map(v => `<button type="button" class="ch-chip${(VS.opts.cap || 0) === v ? ' on' : ''}" data-cap="${v}"${dis(boss)}>${v ? '$' + v + 'M' : 'OFF'}</button>`).join('')}</div>
                <small class="muted">${VS.opts.cap ? 'Every player has a price from his rating (a 99 is $45M, the minimum $1M). Both fives must fit under $' + VS.opts.cap + 'M.' : 'No cap: take anyone.'}</small></div></div></div>
          ${[0, 1].map(i => `<div class="ch-step"><div class="ch-step-k">${i + 4} | PLAYER ${i + 1}${me() === i ? ' (YOU)' : ''}</div>
            <label class="field"><span>NAME</span><input data-name="${i}" maxlength="20" placeholder="Player ${i + 1}" value="${esc(VS.names[i] || '')}"${dis(canAct(i))}></label>${grid(i)}</div>`).join('')}
          <div class="ch-go"><button type="button" class="btn btn-small" id="vsResetNames">RESET NAMES</button></div>
          ${rivalBox(rivalry(), true)}
          <div class="ch-go">${boss ? `<button type="button" class="btn btn-gold btn-big" id="vsStart"${ready ? '' : ' disabled'}>${ready ? 'START THE DRAFT' : 'WAITING FOR PLAYER 2'}</button>` : '<p class="muted">Your friend starts the draft when you are both set.</p>'}
            ${VS.cfg ? '<button type="button" class="btn" id="vsBack">BACK TO OUR DRAFT</button>' : ''}<a class="btn" href="#/challenge">ONE PLAYER</a></div>
        </div>`;
      UI.centerChips(app);
      bindNet(app);
      const redraw = () => { push(); setup(app); };
      app.querySelectorAll('[data-net]').forEach(b => b.addEventListener('click', () => {
        const v = b.dataset.net;
        if (v === 'local') hangUp();
        else if (v === 'host' && NET.role !== 'host') host();
        else if (v === 'join' && NET.role !== 'guest') { hangUp(); Object.assign(NET, { role: 'guest', code: '', status: 'code', err: '' }); }
        route();
      }));
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
      app.querySelectorAll('[data-cap]').forEach(b => b.addEventListener('click', () => { VS.opts.cap = +b.dataset.cap; if (VS.opts.cap) { VS.opts.blind = false; VS.opts.bench = 0; } redraw(); }));
      app.querySelectorAll('[data-bench]').forEach(b => b.addEventListener('click', () => { VS.opts.bench = +b.dataset.bench; if (VS.opts.bench) VS.opts.cap = 0; redraw(); }));
      app.querySelectorAll('[data-blind]').forEach(b => b.addEventListener('click', () => { VS.opts.blind = b.dataset.blind === '1'; redraw(); }));
      app.querySelectorAll('[data-timer]').forEach(b => b.addEventListener('click', () => { VS.opts.timer = +b.dataset.timer; redraw(); }));
      app.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', () => { VS.teams[+b.dataset.side] = b.dataset.team; redraw(); }));
      app.querySelectorAll('[data-name]').forEach(inp => inp.addEventListener('change', () => { VS.names[+inp.dataset.name] = inp.value.trim().slice(0, 20); if (me() === +inp.dataset.name && VS.names[+inp.dataset.name]) UI.profile.set(VS.names[+inp.dataset.name]); push(); }));
      UI.profile.wire(app, () => { const i = me(); if (i !== null) VS.names[i] = UI.profile.name(); push(); redraw(); });
      const rn = UI.$('#vsResetNames', app);
      if (rn) rn.addEventListener('click', () => { [0, 1].forEach(i => { if (canAct(i)) VS.names[i] = ''; }); push(); redraw(); });
      const bk = UI.$('#vsBack', app); if (bk) bk.addEventListener('click', () => go(C.vsOnClock(VS.cfg) >= 0 ? 'draft' : 'series'));
      const st = UI.$('#vsStart', app);
      if (st) st.addEventListener('click', () => {
        VS.names = [0, 1].map(i => { const el = app.querySelector('[data-name="' + i + '"]'); return el && canAct(i) ? el.value.trim().slice(0, 20) : VS.names[i]; });
        const ch = chosen();
        if (!ch.length) { UI.toast('Switch on at least one season', 'error'); return; }
        VS.year = ch.length === 1 ? ch[0] : 0;
        VS.cfg = { mode: 'versus', year: VS.year, seasons: ch.length > 1 && ch.length < ALL_YEARS.length ? ch : null, bestOf: VS.opts.bestOf, blind: !VS.opts.cap && !!VS.opts.blind, cap: +VS.opts.cap || 0, bench: VS.opts.cap ? 0 : (+VS.opts.bench || 0), timer: +VS.opts.timer || 0, era: +VS.opts.era || 2013, injuries: false, seed: Math.floor(Math.random() * 2147483646) + 1,
          sides: [0, 1].map(i => ({ team: VS.teams[i], name: VS.names[i] ? VS.names[i] + "'s " + tOf(teams, VS.teams[i]).name : '', picks: [] })) };
        VS.spin = null; VS.spun = []; VS.respins = [1, 1]; VS.shown = 0; VS.pos = ''; VS.q = '';
        VS.turn = turnFor(VS.cfg, 0, 'spin');
        go('draft');
      });
    });
  }

  // ---------- the draft: a spin for every pick ----------
  const ANIM = {};   // spins already animated on this phone
  function ovrTag(p, blind) { return blind ? '' : `<b class="ch-ovr ${UI.ovrClass(p.ovr)}">${esc(p.ovr)}</b>`; }
  // the draft board: one season's league, or every season (era spin: the all-time pool, keys id@season,
  // nobody twice even from different seasons). A spin lands on a group: season:team.
  function board(cfg) {
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
    const base = p => (era ? p.base : p.id);
    return { era, teams, byId, players, base, cap: +cfg.cap || 0,
      takenSet: ids => new Set(ids.map(id => (byId[id] ? base(byId[id]) : id))),
      teamFor: (abbr, year) => (era && C.eraTeam(year, abbr)) || tOf(teams, abbr),
      groupKey: p => (era ? p.season : cfg.year) + ':' + p.team };
  }
  const short = y => "'" + String(y - 1).slice(2) + "-'" + String(y).slice(2);
  function playerRow(p, B, btn, blind) {
    const t = B.teamFor(p.team, p.season);
    return `<li class="ch-pl">${UI.faceImg(p, (t.colors || ['#444'])[0])}<span class="ch-pl-b"><b>${esc(p.name)}</b><small>${logo(t, 18)} ${esc(C.posLabel(p))}${B.era && p.season ? ' | ' + short(p.season) : p.age ? ' | ' + p.age : ''}</small></span>${B.cap ? UI.challengeCap.priceTag(p) : ''}${ovrTag(p, blind)}${btn}</li>`;
  }
  function spinFor(cfg, B, taken, avoid) {
    const tk = B.takenSet(taken), groups = {};
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
  const SPIN_MS = 4700;
  function turnFor(cfg, pick, phase) { return cfg && cfg.timer ? { pick, phase, until: Date.now() + cfg.timer * 1000 + (phase === 'pick' ? SPIN_MS : 0) } : null; }
  let TICK = null;
  function stopTick() { if (TICK) { clearInterval(TICK); TICK = null; } }
  function draft(app) {
    if (UI.challengeWheel.busy && UI.challengeWheel.busy()) return;   // a spin is running: its landing redraws the page
    const cfg = VS.cfg;
    if (!cfg) { go('setup'); return; }
    loadThen(app, cfg.year, () => {
      const B = board(cfg), teams = B.teams, byId = B.byId;
      const blind = !!cfg.blind;
      const taken = cfg.sides[0].picks.concat(cfg.sides[1].picks), on = C.vsOnClock(cfg);
      const pay = sd => (cfg.cap ? ` <small class="vs-pay">${UI.challengeCap.money(C.capState(cfg.cap, sd.picks.map(id => byId[id]).filter(Boolean)).spent)} of $${cfg.cap}M</small>` : '');
      const fives = cfg.sides.map((sd, i) => {
        const t = tOf(teams, sd.team), mine = sd.picks.map(id => byId[id]).filter(Boolean);
        return `<div class="vs-side${on === i ? ' on' : ''}" style="--c1:${esc(t.colors[0])}"><div class="vs-side-h">${logo(t, 36)}<div><small>${esc(who(i))}${me() === i ? ' (YOU)' : ''}</small><b>${esc(sd.name || tName(t))}</b>${pay(sd)}</div></div>
          <ol>${Array.from({ length: C.vsPer(cfg) }, (_, k) => k).map(k => `<li${k === 5 ? ' class="vs-bench-1"' : ''}>${mine[k] ? esc(mine[k].name) + ' <small class="muted">' + esc(C.posLabel(mine[k])) + (B.era && mine[k].season ? ' ' + short(mine[k].season) : '') + '</small>' + (blind ? '' : ' <b class="' + UI.ovrClass(mine[k].ovr) + '">' + esc(mine[k].ovr) + '</b>') : '<span class="muted">-</span>'}</li>`).join('')}</ol></div>`;
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
        const ros = UI.challengeAlpha(rosterOf(B, spin.key, taken)), five = cfg.sides[on].picks.map(id => byId[id]).filter(Boolean);
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
      app.innerHTML = `<div class="ch-top"><div><div class="ch-top-k">${esc(lblC(cfg))} | TWO PLAYERS | BEST OF ${cfg.bestOf || 5}${blind ? ' | BLIND' : ''}${cfg.timer ? ' | ' + cfg.timer + ' SEC CLOCK' : ''}${cfg.cap ? ' | $' + cfg.cap + 'M CAP' : ''}</div><div class="ch-top-t">THE DRAFT</div></div>
          <button type="button" class="btn btn-small" id="vsSetup">SETUP</button></div>
        ${netBar()}
        <div class="vs-sides vs-compact">${fives}</div>
        ${clock}${body}${reactBar()}`;
      bindNet(app); bindReact(app);
      // the clock
      stopTick();
      if (turn) {
        const total = (cfg.timer || 30) * 1000 + (turn.phase === 'pick' ? SPIN_MS : 0);
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
          if (turn.phase === 'spin' && !VS.spin) { const s2 = spinFor(cfg, B, taken, null); if (s2) { VS.spin = s2; VS.spun = VS.spun.concat([s2.key]); VS.turn = turnFor(cfg, taken.length, 'pick'); push(); draft(app); } }
          else if (turn.phase === 'pick' && VS.spin && VS.spin.pick === taken.length) {
            const five = cfg.sides[on].picks.map(id => byId[id]).filter(Boolean);
            const pool = rosterOf(B, VS.spin.key, taken).filter(p => C.capFits(cfg.cap, five, p));
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
        UI.challengeWheel.animate(app, teams, () => { ANIM[spin.n] = true; if (VS.spin && VS.spin.n === spin.n) draft(app); }, { year: spin.year, abbr: spin.abbr }, { mode: B.era ? 'alltime' : 'versus', seasons: cfg.seasons });
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
      app.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
        const i = C.vsOnClock(VS.cfg);
        if (i < 0 || !canAct(i)) return;
        const p = byId[b.dataset.add];
        if (VS.cfg.cap && p && !C.capFits(VS.cfg.cap, VS.cfg.sides[i].picks.map(id => byId[id]).filter(Boolean), p)) { UI.toast('That contract does not fit under the cap.', 'error'); return; }
        VS.cfg.sides[i].picks.push(b.dataset.add);
        if (window.SFX) window.SFX.play('chime'); VS.spin = null; VS.turn = turnFor(VS.cfg, taken.length + 1, 'spin'); push();
        draft(app); window.scrollTo(0, 0);
      }));
      const sim = UI.$('#vsSim', app);
      if (sim) sim.addEventListener('click', () => {
        const go2 = () => { VS.shown = 0; go('series'); };
        if (!UI.slib || sim.dataset.busy) { go2(); return; }
        sim.dataset.busy = '1';
        const groups = [0, 1].map(i => ({ label: who(i).toUpperCase() + ' | ' + ((tOf(B.teams, VS.cfg.sides[i].team).name) || '').toUpperCase(), color: (tOf(B.teams, VS.cfg.sides[i].team).colors || ['#888'])[0],
          players: VS.cfg.sides[i].picks.map(id => byId[id]).filter(Boolean) }));
        UI.slib.intro(groups, { ratings: !(VS.cfg.blind || (VS.opts && VS.opts.blind)) }, () => { delete sim.dataset.busy; go2(); });
      });
    });
  }

  // ---------- the series: watch each game on the court, or sim it ----------
  let RUN = null;   // { key, r } the series with its play-by-play, from the seed
  let WATCH = 0;    // the game being watched on this phone (1-based), 0 = none
  let courtCtl = null;
  function runFor(cfg) {
    const key = JSON.stringify([cfg.seed, cfg.year, cfg.bestOf, cfg.sides.map(s => s.picks)]);
    if (!RUN || RUN.key !== key) RUN = { key, r: C.playVersus(cfg, { pbp: true }) };
    return RUN.r;
  }
  function dropCourt() { if (courtCtl) { try { courtCtl.destroy(); } catch (e) { /* gone */ } courtCtl = null; } }
  const f1 = v => v == null ? '-' : (+v).toFixed(1);   // per game: 8.0, not 8
  function series(app) {
    stopTick();
    const cfg = VS.cfg;
    if (!cfg || C.vsOnClock(cfg) >= 0) { go(cfg ? 'draft' : 'setup'); return; }
    if (!cfg.year) {   // every season: the seasons the picks came from
      const need = [...new Set(cfg.sides[0].picks.concat(cfg.sides[1].picks).map(k => +String(k).split('@')[1]).filter(y => y && y !== 2013 && !C.loaded(y)))];
      if (need.length) { app.innerHTML = '<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING THE ROSTERS...</div></section>'; Promise.all(need.map(y => C.load(y))).then(() => series(app)).catch(e => UI.toast(e.message || 'Rosters did not load', 'error')); return; }
    }
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
            <p class="muted">${esc(whoA(r.home))} has home court (${homeGames}). First to ${r.need}. All ten players go the full 48.</p></section>`;
      const gameBox = side => {
        const i = idx(side.abbr), rows = side.box || [], sum = k => rows.reduce((s, x) => s + (+x[k] || 0), 0), ms = (m, a) => m + '-' + a;
        const tr = x => `<td>${x.pts}</td><td>${(x.oreb || 0) + (x.dreb || 0)}</td><td>${x.ast}</td><td>${x.stl}</td><td>${x.blk}</td><td>${x.tov}</td><td>${ms(x.fgm, x.fga)}</td><td>${ms(x.tpm, x.tpa)}</td><td>${ms(x.ftm, x.fta)}</td>`;
        return `<div class="vs-res" style="--c1:${esc((S[i].team.colors || ['#333'])[0])}"><div class="vs-side-h">${logo(S[i].team, 26)}<div><small>${esc(who(i))}</small><b>${esc(nm(i))} ${side.pts}</b></div></div>
          <div class="vs-tbl-w"><table class="vs-tbl"><thead><tr><th class="l">PLAYER</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FG</th><th>3P</th><th>FT</th><th>+/-</th></tr></thead>
          <tbody>${rows.map(x => `<tr><td class="l">${esc(x.name)}</td>${tr(x)}<td>${x.pm > 0 ? '+' : ''}${x.pm || 0}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td class="l">TOTALS</td>${tr({ pts: sum('pts'), oreb: sum('oreb'), dreb: sum('dreb'), ast: sum('ast'), stl: sum('stl'), blk: sum('blk'), tov: sum('tov'), fgm: sum('fgm'), fga: sum('fga'), tpm: sum('tpm'), tpa: sum('tpa'), ftm: sum('ftm'), fta: sum('fta') })}<td></td></tr></tfoot></table></div></div>`;
      };
      const R = done ? recordSeries(r, cfg) : null;
      const games = r.games.slice(0, shown).map(g => {
        const t = g.top && PL[g.top.id];
        return `<li><span class="vs-g-n">GAME ${g.n}</span><span class="vs-g-s"><b class="${g.winner === g.away ? 'w' : ''}">${esc(whoA(g.away))} ${g.as}</b> @ <b class="${g.winner === g.home ? 'w' : ''}">${esc(whoA(g.home))} ${g.hs}</b>${g.ot ? ' <small>(' + (g.ot > 1 ? g.ot : '') + 'OT)</small>' : ''}</span>${t ? `<small class="muted">${esc(t.name)}: ${g.top.pts} pts, ${g.top.reb} reb, ${g.top.ast} ast</small>` : ''}
          <button type="button" class="btn btn-small vs-rewatch" data-rewatch="${g.n}">WATCH</button>
          ${g.res ? `<details class="vs-gbox"><summary>BOX SCORE</summary>${['away', 'home'].map(k => gameBox(g.res[k])).join('')}</details>` : ''}</li>`;
      }).join('');
      const box = done ? `<section class="vs-box">${UI.header('SERIES BOX', 'Per game')}<div class="vs-sides">${S.map((sd, i) => `<div class="vs-res" style="--c1:${esc((sd.team.colors || ['#333'])[0])}"><div class="vs-side-h">${logo(sd.team, 32)}<div><small>${esc(who(i))}</small><b>${esc(nm(i))}</b></div></div>
          <div class="vs-tbl-w"><table class="vs-tbl"><thead><tr><th class="l">PLAYER</th><th>SPOT</th><th>OVR</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>3PM</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead><tbody>${sd.five.slice().sort((a, b) => C.SLOTS.indexOf(a.slot) - C.SLOTS.indexOf(b.slot)).map(p => { const l = r.lines[p.id] || {}; return `<tr><td class="l">${esc(p.name)}${p.season && !cfg.year ? ' <small class="muted">' + esc(short(p.season)) + '</small>' : ''}</td><td>${esc(p.slot || '')}</td><td>${esc(p.ovr)}</td><td>${f1(l.pts)}</td><td>${f1(l.reb)}</td><td>${f1(l.ast)}</td><td>${f1(l.stl)}</td><td>${f1(l.blk)}</td><td>${f1(l.tov)}</td><td>${f1(l.tpm)}</td><td>${f1(l.fgp)}</td><td>${f1(l.tpp)}</td><td>${f1(l.ftp)}</td></tr>`; }).join('')}</tbody></table></div></div>`).join('')}</div></section>` : '';
      const next = shown + 1;
      const acts = done
        ? `<button type="button" class="btn btn-share" id="vsShare">${UI.shareIcon || ''}SEND THIS TO YOUR FRIENDS</button><button type="button" class="btn sl-copy" id="vsCopy">COPY LINK</button><button type="button" class="btn btn-gold" id="vsAgain">RUN IT BACK</button><button type="button" class="btn" id="vsNew">NEW MATCHUP</button>`
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
      if ($('#vsAgain')) $('#vsAgain').addEventListener('click', () => { VS.cfg.seed = Math.floor(Math.random() * 2147483646) + 1; VS.shown = 0; WATCH = 0; VS.watch = null; push(); series(app); window.scrollTo(0, 0); });
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
      if ($('#vsNew')) $('#vsNew').addEventListener('click', () => { VS.cfg = null; VS.shown = 0; VS.watch = null; go('setup'); });
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
    if (part[1] === 'join' && part[2]) {
      VS.page = 'setup';
      if (!(NET.role === 'guest' && NET.code === part[2].toUpperCase())) join(part[2]);
      if (location.hash !== '#/challenge/vs') { history.replaceState(null, '', '#/challenge/vs'); }
      return setup(app);
    }
    const page = part[1] === 'draft' ? 'draft' : part[1] === 'result' ? 'series' : 'setup';
    if (page !== 'setup' && !VS.cfg) { VS.page = 'setup'; return setup(app); }
    VS.page = page;
    if (page === 'draft') return draft(app);
    if (page === 'series') return series(app);
    return setup(app);
  };
  Object.keys(base).forEach(k => { P.challenge[k] = base[k]; });
})();
