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
  const FRESH = () => ({ year: 2008, teams: ['BOS', 'LAL'], names: ['', ''], opts: { bestOf: 5, blind: false, timer: 30 }, cfg: null, shown: 0, page: 'setup', spin: null, spun: [], respins: [1, 1], turn: null, pos: '', q: '' });
  let VS = Object.assign(FRESH(), ls.get() || {});
  VS.opts = Object.assign({ bestOf: 5, blind: false, timer: 30 }, VS.opts || {});
  const POS = ['PG', 'SG', 'SF', 'PF', 'C'];
  const lbl = y => (y ? (y - 1) + '-' + String(y).slice(2) : 'EVERY SEASON');   // y 0: era spin, every season
  const logo = (t, n) => UI.logoFor(t || { abbr: '?' }, n);
  const tOf = (teams, a) => teams.find(t => t.abbr === a) || { abbr: a, city: a, name: '', colors: ['#333', '#777'] };
  const tName = t => ((t.city || '') + ' ' + (t.name || '')).trim();
  const who = i => VS.names[i] || ('PLAYER ' + (i + 1));
  const SHARED = ['year', 'teams', 'names', 'opts', 'cfg', 'shown', 'watch', 'page', 'spin', 'spun', 'respins', 'turn'];
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
  const NET = { role: null, code: '', status: '', err: '', client: null, key: null, me: '', peerSeen: 0, broker: 0, timers: [] };
  const me = () => (NET.role === 'host' ? 0 : NET.role === 'guest' ? 1 : null);   // null: same phone, both sides
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
    seal(Object.assign({ from: NET.me, role: NET.role }, obj)).then(txt => { try { NET.client.publish(topic(), txt, { qos: 1 }); } catch (e) { /* reconnecting */ } }).catch(() => {});
  }
  function push() {
    ls.set(VS);
    if (linked()) { const s = {}; SHARED.forEach(k => { s[k] = VS[k]; }); send({ t: 'state', s }); }
  }
  function seen() {
    NET.peerSeen = Date.now();
    if (NET.status !== 'connected') {
      NET.status = 'connected'; NET.err = '';
      if (NET.role === 'host') push(); else send({ t: 'hello', name: VS.names[1] || '' });
      route(); drawChat();
    }
  }
  function onMsg(m) {
    if (!m || typeof m !== 'object' || m.from === NET.me || m.role === NET.role) return;   // our own echo, or a third phone with our role
    if (m.t === 'ping') { seen(); return; }
    if (m.t === 'hello' && NET.role === 'host') { if (m.name) VS.names[1] = String(m.name).slice(0, 20); seen(); push(); route(); return; }
    if (m.t === 'state' && m.s && NET.role === 'guest' || m.t === 'state' && m.s && NET.role === 'host') {
      SHARED.forEach(k => { if (k in m.s) VS[k] = m.s[k]; }); ls.set(VS); seen(); route(); return;
    }
    seen();
    if (m.t === 'react' && REACTS.indexOf(m.r) >= 0) bubble(m.r, String(m.name || '').slice(0, 20), false);
    if (m.t === 'chat' && m.text) { addChat({ name: String(m.name || '').slice(0, 20), text: String(m.text).slice(0, 300), mine: false }); }
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
    Object.assign(NET, { role, code, status: role === 'host' ? 'starting' : 'connecting', err: '', client: null, peerSeen: 0, me: Math.random().toString(36).slice(2, 10) });
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
    const st = NET.status, other = NET.role === 'host' ? who(1) : who(0);
    const msg = st === 'connected' ? `Connected with <b>${esc(other)}</b>. You are ${esc(who(me()))}.`
      : st === 'waiting' ? `Room <b>${esc(NET.code)}</b>: send your friend the link, then wait here.`
      : st === 'connecting' || st === 'starting' ? 'Connecting...'
      : st === 'code' ? 'Type the room code your friend sees on his phone.'
      : st === 'lost' ? 'Lost the other phone. Reconnecting on its own when it is back...'
      : st === 'error-wait' ? esc(NET.err) : esc(NET.err || 'Not connected.');
    return `<div class="vs-net ${st}"><span class="vs-net-dot"></span><span>${msg}</span>
      ${st === 'waiting' ? `<button type="button" class="btn btn-small" id="vsCopy">COPY LINK</button>` : ''}
      ${st === 'lost' || st === 'error' ? `<button type="button" class="btn btn-small" id="vsRetry">${NET.role === 'host' ? 'NEW ROOM' : 'TRY AGAIN'}</button>` : ''}
      <button type="button" class="btn btn-small" id="vsLeave">LEAVE</button></div>`;
  }
  function bindNet(app) {
    const cp = UI.$('#vsCopy', app);
    if (cp) cp.addEventListener('click', async () => {
      const link = joinLink(), text = 'Draft me in the 2K13 Association. Room ' + NET.code + ': ' + link;
      if (navigator.share) { try { await navigator.share({ text, url: link }); return; } catch (e) { /* closed */ } }
      try { await navigator.clipboard.writeText(link); UI.toast('Link copied. Send it to your friend.'); } catch (e) { UI.toast(link); }
    });
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
      const boss = me() !== 1;   // the host (or the one phone) sets the season and the rules
      const dis = c => (c ? '' : ' disabled');
      const grid = i => `<div class="ch-teams">${teams.map(t => `<button type="button" class="ch-team${VS.teams[i] === t.abbr ? ' on' : ''}" data-side="${i}" data-team="${esc(t.abbr)}"${VS.teams[1 - i] === t.abbr || !canAct(i) ? ' disabled' : ''} style="--c1:${esc(t.colors[0])}">${logo(t, 30)}<span>${esc(t.name)}</span></button>`).join('')}</div>`;
      const ready = !online() || linked();
      app.innerHTML = `
        <section class="ch-hero"><div class="ch-hero-k">DRAFT CHALLENGE | TWO PLAYERS</div><h1 class="ch-hero-t">YOU VS ME.</h1>
          <p class="ch-hero-p">Take turns spinning the wheel and taking one player from the team it lands on, until you both have five. Then a series: nobody comes off the bench, all five play 48 minutes, so positions and fit matter.</p></section>
        ${netBar()}
        <div class="ch-setup">
          <div class="ch-step"><div class="ch-step-k">1 | HOW YOU PLAY</div>
            <div class="ch-seg vs-seg3"><button type="button" class="ch-seg-b${!online() ? ' on' : ''}" data-net="local"><b>SAME PHONE</b><small>Pass it back and forth</small></button>
              <button type="button" class="ch-seg-b${NET.role === 'host' ? ' on' : ''}" data-net="host"><b>HOST ONLINE</b><small>Get a room code for your friend</small></button>
              <button type="button" class="ch-seg-b${NET.role === 'guest' ? ' on' : ''}" data-net="join"><b>JOIN ONLINE</b><small>Enter your friend's code</small></button></div>
            ${NET.role === 'guest' && !linked() ? `<div class="vs-join"><label class="field"><span>ROOM CODE</span><input id="vsCode" maxlength="5" placeholder="ABCDE" value="${esc(NET.code)}" autocomplete="off" autocapitalize="characters"></label><button type="button" class="btn btn-gold" id="vsJoin">JOIN</button></div>` : ''}
          </div>
          <div class="ch-step"><div class="ch-step-k">2 | THE SEASON</div><div class="ch-chips ch-swipe"><button type="button" class="ch-chip vs-era${!VS.year ? ' on' : ''}" data-year="0"${dis(boss)}>EVERY SEASON</button>${C.SEASONS.map(s => `<button type="button" class="ch-chip${VS.year === s.year ? ' on' : ''}" data-year="${s.year}"${dis(boss)}>${esc(s.label)}</button>`).join('')}</div>
            ${!VS.year ? '<small class="muted">Era spin: every spin lands on a team and a season, from 2003-04 to 2025-26. Nobody can be drafted twice, even from different seasons.</small>' : ''}</div>
          <div class="ch-step"><div class="ch-step-k">3 | THE RULES</div>
            <div class="vs-rules"><div><span class="ts-start-k">SERIES</span><div class="ch-chips">${[3, 5, 7].map(n => `<button type="button" class="ch-chip${VS.opts.bestOf === n ? ' on' : ''}" data-bo="${n}"${dis(boss)}>BEST OF ${n}</button>`).join('')}</div></div>
              <div><span class="ts-start-k">PICK TIMER</span><div class="ch-chips">${[[30, '30 SEC'], [60, '60 SEC'], [0, 'OFF']].map(([v, l]) => `<button type="button" class="ch-chip${(VS.opts.timer || 0) === v ? ' on' : ''}" data-timer="${v}"${dis(boss)}>${l}</button>`).join('')}</div>
                <small class="muted">${VS.opts.timer ? 'Run out of time and the wheel spins for you, or you get the best player on its team.' : 'No clock.'}</small></div>
              <div><span class="ts-start-k">BLIND DRAFT</span><div class="ch-chips"><button type="button" class="ch-chip${!VS.opts.blind ? ' on' : ''}" data-blind="0"${dis(boss)}>OFF</button><button type="button" class="ch-chip${VS.opts.blind ? ' on' : ''}" data-blind="1"${dis(boss)}>ON</button></div>
                <small class="muted">${VS.opts.blind ? 'No ratings and no fit grades until the series is over: pick on what you know.' : 'Ratings and fit grades show while you draft.'}</small></div></div></div>
          ${[0, 1].map(i => `<div class="ch-step"><div class="ch-step-k">${i + 4} | PLAYER ${i + 1}${me() === i ? ' (YOU)' : ''}</div>
            <label class="field"><span>NAME</span><input data-name="${i}" maxlength="20" placeholder="Player ${i + 1}" value="${esc(VS.names[i] || '')}"${dis(canAct(i))}></label>${grid(i)}</div>`).join('')}
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
      app.querySelectorAll('[data-year]').forEach(b => b.addEventListener('click', () => { VS.year = +b.dataset.year; redraw(); }));
      app.querySelectorAll('[data-bo]').forEach(b => b.addEventListener('click', () => { VS.opts.bestOf = +b.dataset.bo; redraw(); }));
      app.querySelectorAll('[data-blind]').forEach(b => b.addEventListener('click', () => { VS.opts.blind = b.dataset.blind === '1'; redraw(); }));
      app.querySelectorAll('[data-timer]').forEach(b => b.addEventListener('click', () => { VS.opts.timer = +b.dataset.timer; redraw(); }));
      app.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', () => { VS.teams[+b.dataset.side] = b.dataset.team; redraw(); }));
      app.querySelectorAll('[data-name]').forEach(inp => inp.addEventListener('change', () => { VS.names[+inp.dataset.name] = inp.value.trim().slice(0, 20); push(); }));
      const bk = UI.$('#vsBack', app); if (bk) bk.addEventListener('click', () => go(C.vsOnClock(VS.cfg) >= 0 ? 'draft' : 'series'));
      const st = UI.$('#vsStart', app);
      if (st) st.addEventListener('click', () => {
        VS.names = [0, 1].map(i => { const el = app.querySelector('[data-name="' + i + '"]'); return el && canAct(i) ? el.value.trim().slice(0, 20) : VS.names[i]; });
        VS.cfg = { mode: 'versus', year: VS.year, bestOf: VS.opts.bestOf, blind: !!VS.opts.blind, timer: +VS.opts.timer || 0, injuries: false, seed: Math.floor(Math.random() * 2147483646) + 1,
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
    const players = era ? C.allTimePool().map(e => Object.assign({}, e, { id: e.key, team: e.from })) : d.players.slice();
    players.forEach(p => { byId[p.id] = p; });
    // every season: a landed season's full rosters join once its file is loaded (keys id@season)
    if (era) C.poolSeasons().forEach(y => {
      if (y !== 2013 && !C.loaded(y)) return;
      const sd = C.seasonData(y);
      if (sd) sd.players.forEach(q => { const k = q.id + '@' + y; if (byId[k]) return; const e = Object.assign({}, q, { id: k, key: k, base: q.id, from: q.team, season: y }); byId[k] = e; players.push(e); });
    });
    if (!era) d.free.forEach(p => { byId[p.id] = p; });
    const base = p => (era ? p.base : p.id);
    return { era, teams, byId, players, base,
      takenSet: ids => new Set(ids.map(id => (byId[id] ? base(byId[id]) : id))),
      teamFor: (abbr, year) => (era && C.eraTeam(year, abbr)) || tOf(teams, abbr),
      groupKey: p => (era ? p.season : cfg.year) + ':' + p.team };
  }
  const short = y => "'" + String(y - 1).slice(2) + "-'" + String(y).slice(2);
  function playerRow(p, B, btn, blind) {
    const t = B.teamFor(p.team, p.season);
    return `<li class="ch-pl"><span class="ch-pl-b"><b>${esc(p.name)}</b><small>${logo(t, 18)} ${esc(C.posLabel(p))}${B.era && p.season ? ' | ' + short(p.season) : p.age ? ' | ' + p.age : ''}</small></span>${ovrTag(p, blind)}${btn}</li>`;
  }
  function spinFor(cfg, B, taken, avoid) {
    const tk = B.takenSet(taken), groups = {};
    if (B.era && window.CHALLENGE_POOL && window.CHALLENGE_POOL.teams) Object.keys(window.CHALLENGE_POOL.teams).forEach(y => (window.CHALLENGE_POOL.teams[y] || []).forEach(t => { groups[y + ':' + t.abbr] = { abbr: t.abbr, year: +y, key: y + ':' + t.abbr }; }));
    else B.players.forEach(p => { if (tk.has(B.base(p))) return; const k = B.groupKey(p); if (!groups[k]) groups[k] = { abbr: p.team, year: B.era ? p.season : cfg.year, key: k }; });
    const keys = Object.keys(groups);
    let pool = keys.filter(k => VS.spun.indexOf(k) < 0 && k !== avoid);
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
    const cfg = VS.cfg;
    if (!cfg) { go('setup'); return; }
    loadThen(app, cfg.year, () => {
      const B = board(cfg), teams = B.teams, byId = B.byId;
      const blind = !!cfg.blind;
      const taken = cfg.sides[0].picks.concat(cfg.sides[1].picks), on = C.vsOnClock(cfg);
      const fives = cfg.sides.map((sd, i) => {
        const t = tOf(teams, sd.team), mine = sd.picks.map(id => byId[id]).filter(Boolean);
        return `<div class="vs-side${on === i ? ' on' : ''}" style="--c1:${esc(t.colors[0])}"><div class="vs-side-h">${logo(t, 36)}<div><small>${esc(who(i))}${me() === i ? ' (YOU)' : ''}</small><b>${esc(sd.name || tName(t))}</b></div></div>
          <ol>${[0, 1, 2, 3, 4].map(k => `<li>${mine[k] ? esc(mine[k].name) + ' <small class="muted">' + esc(C.posLabel(mine[k])) + (B.era && mine[k].season ? ' ' + short(mine[k].season) : '') + '</small>' + (blind ? '' : ' <b class="' + UI.ovrClass(mine[k].ovr) + '">' + esc(mine[k].ovr) + '</b>') : '<span class="muted">-</span>'}</li>`).join('')}</ol></div>`;
      }).join('');
      const fitCard = (sd, i) => {
        if (!sd.picks.length) return '';
        const f = C.lineupFit(sd.picks.map(id => byId[id]).filter(Boolean));
        if (blind) { f.parts = []; f.word = ''; }
        return UI.challengeFit(f, { compact: true, title: (who(i) + "'s lineup").toUpperCase() });
      };
      const spin = VS.spin && VS.spin.pick === taken.length ? VS.spin : null;
      const mine = on >= 0 && canAct(on);
      let body = '';
      if (on < 0) body = `<div class="ch-ready"><div><b>BOTH FIVES ARE SET.</b><span class="muted"> Best of ${cfg.bestOf || 5}, all five play 48 minutes.</span></div><button type="button" class="btn btn-gold btn-big" id="vsSim">TO THE SERIES</button></div>`;
      else if (!spin || !ANIM[spin.n]) {
        body = `<div class="vs-clock">ON THE CLOCK: <b>${esc(who(on))}</b> <span class="muted">(pick ${taken.length + 1} of 10)</span></div>
          <section class="ch-wheel">${UI.challengeWheel.strip(teams)}<div class="ch-wheel-k">${spin ? 'SPINNING...' : mine ? 'YOUR SPIN' : 'WAITING FOR ' + esc(who(on)).toUpperCase() + ' TO SPIN'}</div>
          ${mine && !spin ? '<button type="button" class="btn btn-gold btn-big" id="chSpin">SPIN THE WHEEL</button>' : ''}</section>`;
      } else if (B.era && spin.year !== 2013 && !C.loaded(spin.year)) {
        // the landed season's full rosters: load them, then draw again
        body = `<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING THE ${esc(lbl(spin.year))} ROSTER...</div></section>`;
        C.load(spin.year).then(() => { if (VS.spin && VS.spin.n === spin.n) draft(app); }).catch(() => UI.toast('That roster did not load. Try a re-spin.', 'error'));
      } else {
        const t = B.teamFor(spin.abbr, spin.year);
        const ros = UI.challengeAlpha(rosterOf(B, spin.key, taken));
        body = `<div class="vs-clock">ON THE CLOCK: <b>${esc(who(on))}</b> <span class="muted">(pick ${taken.length + 1} of 10)</span></div>
          <section class="ch-landed" style="--c1:${esc(t.colors[0])}">${logo(t, 64)}<div><div class="ch-wheel-k">THE WHEEL SAYS</div><div class="ch-landed-t">${B.era ? esc(lbl(spin.year)) + ' ' : ''}${esc(tName(t))}</div></div>
            ${mine && VS.respins[on] > 0 ? '<button type="button" class="btn btn-small" id="chRespin">RE-SPIN (1 LEFT)</button>' : ''}</section>
          ${mine ? '' : `<p class="muted">${esc(who(on))} is picking from the ${esc(t.name)}.</p>`}
          <ul class="ch-list">${ros.map(p => playerRow(p, B, mine ? `<button type="button" class="btn btn-small btn-gold" data-add="${esc(p.id)}">TAKE</button>` : '', blind)).join('')}</ul>`;
      }
      const turn = on >= 0 && VS.turn && VS.turn.pick === taken.length ? VS.turn : null;
      const clock = turn ? `<div class="vs-timer" id="vsTimer"><i style="--w:100%"></i><span>${Math.max(0, Math.ceil((turn.until - Date.now()) / 1000))}</span></div>` : '';
      app.innerHTML = `<div class="ch-top"><div><div class="ch-top-k">${esc(lbl(cfg.year))} | TWO PLAYERS | BEST OF ${cfg.bestOf || 5}${blind ? ' | BLIND' : ''}${cfg.timer ? ' | ' + cfg.timer + ' SEC CLOCK' : ''}</div><div class="ch-top-t">THE DRAFT</div></div>
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
            const pool = rosterOf(B, VS.spin.key, taken).sort((a, b) => b.ovr - a.ovr);
            if (pool[0]) { VS.cfg.sides[on].picks.push(pool[0].id); VS.spin = null; VS.turn = turnFor(cfg, taken.length + 1, 'spin'); push(); UI.toast('Time: ' + who(on) + ' gets ' + pool[0].name + '.'); draft(app); }
          }
        };
        TICK = setInterval(tick, 250);
        tick();
      }
      UI.$('#vsSetup', app).addEventListener('click', () => go('setup'));
      // a new spin on either phone: both animate it
      if (spin && !ANIM[spin.n]) {
        UI.challengeWheel.animate(app, teams, () => { ANIM[spin.n] = true; if (VS.spin && VS.spin.n === spin.n) draft(app); }, { year: spin.year, abbr: spin.abbr }, { mode: B.era ? 'alltime' : 'versus' });
      }
      const sp = UI.$('#chSpin', app);
      if (sp) sp.addEventListener('click', () => {
        const s = spinFor(cfg, B, taken, null);
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
        VS.cfg.sides[i].picks.push(b.dataset.add); VS.spin = null; VS.turn = turnFor(VS.cfg, taken.length + 1, 'spin'); push();
        draft(app); window.scrollTo(0, 0);
      }));
      const sim = UI.$('#vsSim', app);
      if (sim) sim.addEventListener('click', () => { VS.shown = 0; go('series'); });
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
        : `<section class="vs-next"><div class="ch-hero-k">BEST OF ${r.bestOf} | ${esc(lbl(cfg.year))}${cfg.blind ? ' | BLIND' : ''}</div><h1>${WATCH ? 'GAME ' + WATCH + ', LIVE' : shown ? 'GAME ' + (shown + 1) + ' IS NEXT' : 'THE SERIES'}</h1>
            <p class="muted">${esc(whoA(r.home))} has home court (${homeGames}). First to ${r.need}. All ten players go the full 48.</p></section>`;
      const games = r.games.slice(0, shown).map(g => {
        const t = g.top && PL[g.top.id];
        return `<li><span class="vs-g-n">GAME ${g.n}</span><span class="vs-g-s"><b class="${g.winner === g.away ? 'w' : ''}">${esc(whoA(g.away))} ${g.as}</b> @ <b class="${g.winner === g.home ? 'w' : ''}">${esc(whoA(g.home))} ${g.hs}</b>${g.ot ? ' <small>(' + (g.ot > 1 ? g.ot : '') + 'OT)</small>' : ''}</span>${t ? `<small class="muted">${esc(t.name)}: ${g.top.pts} pts, ${g.top.reb} reb, ${g.top.ast} ast</small>` : ''}
          <button type="button" class="btn btn-small vs-rewatch" data-rewatch="${g.n}">WATCH</button></li>`;
      }).join('');
      const box = done ? `<section class="vs-box">${UI.header('SERIES BOX', 'Per game')}<div class="vs-sides">${S.map((sd, i) => `<div class="vs-res" style="--c1:${esc((sd.team.colors || ['#333'])[0])}"><div class="vs-side-h">${logo(sd.team, 32)}<div><small>${esc(who(i))}</small><b>${esc(nm(i))}</b></div></div>
          <div class="vs-tbl-w"><table class="vs-tbl"><thead><tr><th class="l">PLAYER</th><th>SPOT</th><th>OVR</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>3PM</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead><tbody>${sd.five.slice().sort((a, b) => C.SLOTS.indexOf(a.slot) - C.SLOTS.indexOf(b.slot)).map(p => { const l = r.lines[p.id] || {}; return `<tr><td class="l">${esc(p.name)}${p.season && !cfg.year ? ' <small class="muted">' + esc(short(p.season)) + '</small>' : ''}</td><td>${esc(p.slot || '')}</td><td>${esc(p.ovr)}</td><td>${f1(l.pts)}</td><td>${f1(l.reb)}</td><td>${f1(l.ast)}</td><td>${f1(l.stl)}</td><td>${f1(l.blk)}</td><td>${f1(l.tov)}</td><td>${f1(l.tpm)}</td><td>${f1(l.fgp)}</td><td>${f1(l.tpp)}</td><td>${f1(l.ftp)}</td></tr>`; }).join('')}</tbody></table></div></div>`).join('')}</div></section>` : '';
      const next = shown + 1;
      const acts = done
        ? `<button type="button" class="btn btn-share" id="vsShare">${UI.shareIcon || ''}SEND THIS TO YOUR FRIENDS</button><button type="button" class="btn btn-gold" id="vsAgain">RUN IT BACK</button><button type="button" class="btn" id="vsNew">NEW MATCHUP</button>`
        : WATCH ? `<button type="button" class="btn btn-gold" id="vsFinal">SKIP TO THE FINAL</button>`
        : `<button type="button" class="btn btn-gold btn-big" id="vsWatch">WATCH GAME ${next}</button><button type="button" class="btn" id="vsNext">SIM GAME ${next}</button><button type="button" class="btn" id="vsAll">SIM THE REST</button>`;
      app.innerHTML = `${head}${netBar()}${score}
        ${WATCH ? '<div class="ct-host" id="vsCourt"></div>' : ''}
        <div class="row-btns center ch-acts vs-acts">${acts}</div>
        ${games ? `<ol class="vs-glist">${games}</ol>` : ''}
        ${box}
        ${done ? `<div class="vs-fits">${S.map((sd, i) => UI.challengeFit(sd.fit, { compact: true, title: (who(i) + "'s lineup").toUpperCase() })).join('')}</div>` : ''}${reactBar()}`;
      if (keep) { const ph = UI.$('#vsCourt', app); if (ph) ph.replaceWith(keep); }
      bindNet(app); bindReact(app);
      const reveal = n => { WATCH = 0; VS.watch = null; dropCourt(); VS.shown = Math.max(VS.shown || 0, n); push(); series(app); window.scrollTo(0, 0); };
      const watch = n => {
        WATCH = n; series(app);
        const el = UI.$('#vsCourt', app), g = r.games[n - 1];
        if (!el || !g || !g.res || !(window.COURT && window.COURT.available(g.res))) { if (el) el.innerHTML = '<p class="muted">The court view did not load.</p>'; return; }
        courtCtl = window.COURT.mount(el, { game: g.res, start: 0, autoplay: true, team: a => S[idx(a)].team, player: id => PL[id] || null,
          logo: (a, size) => logo(S[idx(a)].team, size), onEnd: () => { if (WATCH === n && n > (VS.shown || 0)) reveal(n); } });
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
        const spec = { kicker: 'VERSUS | BEST OF ' + r.bestOf + ' | ' + lbl(cfg.year), title: who(wi).toUpperCase() + ' WINS', big: ws, gold: true,
          banner: r.mvp ? 'SERIES MVP: ' + r.mvp.name.toUpperCase() : '', colors: S[wi].team.colors, logo: S[wi].team.logo,
          lines: [[who(0).slice(0, 8).toUpperCase(), S[0].five.map(p => p.name.split(' ').pop()).join(', ')], [who(1).slice(0, 8).toUpperCase(), S[1].five.map(p => p.name.split(' ').pop()).join(', ')]] };
        const mv = r.mvp ? ` ${r.mvp.name} was the MVP with ${f1(r.mvp.line.pts)} a game.` : '';
        const lost = r.wins[S[li].abbr], close = r.games.slice().sort((x, y) => Math.abs(x.hs - x.as) - Math.abs(y.hs - y.as))[0];
        const how = lost === 0 ? `🧹 ${who(wi)} swept ${who(li)} ${ws}` : r.games.length === r.bestOf ? `🏀 ${who(wi)} beat ${who(li)} ${ws}, all the way to a deciding game` : `🏀 ${who(wi)} beat ${who(li)} ${ws}`;
        const nail = close && Math.abs(close.hs - close.as) <= 3 ? ` Game ${close.n} came down to ${Math.abs(close.hs - close.as)}.` : '';
        const five = S[wi].five.map(p => p.name.split(' ').pop()).join(', ');
        const end = [`${who(li)} wants a rematch. Spin your own:`, `${who(li)} is already asking for game 2. Spin your own:`, `Think you can draft better? Spin your own:`][Math.floor(Math.random() * 3)];
        const text = `${how} in a ${lbl(cfg.year)} versus draft. Winning five: ${five}.${mv}${nail} ${end}`;
        UI.shareResult(spec, text, location.origin + location.pathname + '#/challenge/vs', 'versus');
      });
      if ($('#vsNew')) $('#vsNew').addEventListener('click', () => { VS.cfg = null; VS.shown = 0; VS.watch = null; go('setup'); });
      if (want && WATCH !== want) watch(want);   // the other phone pressed WATCH
    });
  }

  const base = P.challenge;
  P.challenge = function (app, arg) {
    const part = String(arg || '').split('/');
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
