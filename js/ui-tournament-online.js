// Online Tournament (#/challenge/tournament/online): 4 or 8 teams, every human drafts on their own phone at
// the same time, the host phone runs the bracket and everyone watches the same games. The host is the
// authority: guests send actions (spin, take), the host checks them, changes the state and sends the whole
// state back. Messages travel over the same encrypted MQTT relay as Head to Head (key made from the room
// code). A guest keeps an id on the phone, so reopening the link takes the same seat back; the host keeps
// the room on the phone and can resume it. The bracket, match and champion screens are the hot-seat ones
// from js/ui-tournament.js (api hook), with the buttons only on the host phone.
(function () {
  'use strict';
  const P = UI.pages, esc = UI.esc, C = window.CHALLENGE;
  const T = window.TOURNAMENT, A = T && T.api;
  if (!C || !A || typeof P.challenge !== 'function') return;
  const HOOK = A.hook, TN = () => A.get();
  const MQTT_SRC = 'https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js';
  const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081'];
  const SPIN_MS = 4700;
  const ERAS = [[2013, 'MODERN'], [2003, '2000S'], [1993, '1990S'], [1985, '1980S'], [1975, '1970S'], [1965, '1960S'], [1955, '1950S']];   // the rules a mixed-seasons game plays by: pace, the three-point line (none before 1979-80), shooting
  const SHARED = ['page', 'n', 'humans', 'names', 'ai', 'seats', 'live', 'opts', 'skip', 'cfg', 'teams', 'picks', 'seeds', 'rounds', 'cur', 'champ', 'rating', 'watch', 'spins', 'respins', 'spun', 'clk', 'lock', 'hnow', 'epoch', 'hostCid'];
  const store = k => ({
    get() { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del() { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } }
  });
  const lsHost = store('a13-tn-host'), lsRoom = store('a13-tn-room'), lsName = { get: () => UI.profile.name(), set: v => UI.profile.set(v) };
  const CID = (() => { try { let c = localStorage.getItem('a13-tn-cid'); if (!c) { c = Math.random().toString(36).slice(2, 12); localStorage.setItem('a13-tn-cid', c); } return c; } catch (e) { return Math.random().toString(36).slice(2, 12); } })();
  const NET = { role: null, code: '', status: '', err: '', client: null, key: null, me: '', peerSeen: 0, timers: [] };
  const SEEN = {};
  let APP = null, OFF = 0, SIG = '', LAST = { page: '', mine: '' }, PEND = '', TICK = null, ON = false;
  const ANIM = {};
  let SW = null;   // 8-man: the roster spot tapped first, waiting for its swap partner
  const per = t => 5 + ((t || TN()).cfg && +(t || TN()).cfg.bench > 0 ? +(t || TN()).cfg.bench : 0);   // picks each: five, plus the bench (8-man)
  (UI.rooms = UI.rooms || {}).tn = () => (NET.role && NET.code ? NET.code : '');   // for friend invites
  const mySeat = () => ((TN() || {}).seats || []).indexOf(CID);
  const flat = () => [].concat.apply([], TN().picks);
  const cleanName = (v, i) => String(v || '').trim().slice(0, 20) || 'PLAYER ' + (i + 1);
  const fresh = (name) => ({ page: 'lobby', n: 4, humans: 0, ai: [], names: [name], seats: [CID], live: [true], opts: { timer: 24, cap: 0, bestOf: 1, seeding: 'random', ratings: true, order: 'turns', board: 0, dupes: 0, bench: 0 }, skip: [], cfg: null, teams: [], picks: [], seeds: [], rounds: [], cur: null, champ: -1, rating: null, watch: null, spins: [], respins: [], spun: [], clk: [], hnow: 0, epoch: 0, hostCid: CID });

  // ---------- the relay ----------
  function loadMqtt() {
    if (window.mqtt) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = MQTT_SRC; s.onload = res; s.onerror = () => rej(new Error('Could not load the online connection. Check the internet and try again.'));
      document.head.appendChild(s);
    });
  }
  const topic = () => 'a13tn/v1/' + NET.code;
  async function keyFor(code) {
    const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('2k13-association-tournament:' + code));
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
    seal(Object.assign({ from: NET.me, role: NET.role, cid: CID }, obj)).then(txt => { try { NET.client.publish(topic(), txt, { qos: 1 }); } catch (e) { /* reconnecting */ } }).catch(() => {});
  }
  function push() {
    if (NET.role !== 'host' || !NET.client) return;
    const t = TN(); t.hnow = Date.now();
    const s = {}; SHARED.forEach(k => { s[k] = t[k]; });
    send({ t: 'state', s });
  }
  function saveHost() {
    const t = TN(), s = {}; SHARED.forEach(k => { s[k] = t[k]; });
    lsHost.set({ code: NET.code, s });
  }
  function hangUp() {
    NET.timers.forEach(t => clearInterval(t)); NET.timers = [];
    try { if (NET.client) NET.client.end(true); } catch (e) { /* gone */ }
    Object.assign(NET, { role: null, code: '', status: '', err: '', client: null, key: null, peerSeen: 0 });
    stopTick(); HOOK.host = false;
  }
  function connect(role, code) {
    NET.timers.forEach(t => clearInterval(t)); NET.timers = [];
    try { if (NET.client) NET.client.end(true); } catch (e) { /* gone */ }
    Object.assign(NET, { role, code, status: 'connecting', err: '', client: null, peerSeen: 0, me: Math.random().toString(36).slice(2, 10) });
    HOOK.host = role === 'host';
    refreshNet();
    Promise.all([loadMqtt(), keyFor(code)]).then(([, key]) => {
      NET.key = key;
      const tryBroker = i => {
        if (NET.code !== code) return;
        const client = window.mqtt.connect(BROKERS[i % BROKERS.length], { clientId: 'a13tn_' + NET.me + '_' + i, clean: true, connectTimeout: 7000, reconnectPeriod: 2000, keepalive: 20 });
        NET.client = client;
        let up = false;
        const giveUp = setTimeout(() => { if (!up && NET.client === client && i < BROKERS.length * 2 - 1) { try { client.end(true); } catch (e) { /* gone */ } tryBroker(i + 1); } }, 9000);
        client.on('connect', () => {
          up = true; clearTimeout(giveUp);
          client.subscribe(topic(), { qos: 1 }, () => {
            if (NET.role === 'host') { NET.status = 'ready'; push(); } else { NET.status = NET.status === 'connected' ? 'connected' : 'connecting'; hello(); }
            refreshNet();
          });
        });
        client.on('message', (t, buf) => { open64(buf.toString()).then(onMsg).catch(() => {}); });
        client.on('error', () => { /* mqtt.js retries on its own */ });
      };
      tryBroker(0);
      let beat = 0;
      NET.timers.push(setInterval(() => {
        if (!NET.client || NET.code !== code) return;
        if (NET.role === 'host') {
          send({ t: 'ping', hn: Date.now() });
          beat++; if (beat % 5 === 0) push();
          const t = TN(), live = t.seats.map((c, i) => c === CID || Date.now() - (SEEN[c] || 0) < 15000);
          if (JSON.stringify(live) !== JSON.stringify(t.live)) { t.live = live; push(); soft(); }
        } else {
          if (NET.status !== 'connected') hello(); else send({ t: 'ping' });
          const quiet = Date.now() - NET.peerSeen;
          if (NET.status === 'connected' && quiet > 15000) { NET.status = 'lost'; refreshNet(); }
          // the host is gone: the lowest seat still here takes the room over (each seat waits a little longer than the one before)
          const seat = mySeat();
          if (SIG && seat >= 0 && NET.peerSeen && quiet > 20000 + 8000 * seat && TN() && TN().page !== 'entry') takeOver(false);
        }
      }, 4000));
      NET.timers.push(setInterval(clockCheck, 500));
      if (role === 'guest') setTimeout(() => { if (NET.code === code && NET.status === 'connecting') { NET.err = 'No answer from room ' + code + ' yet. Check the code, and that the host still has the room open. Still trying...'; refreshNet(); } }, 20000);
    }).catch(e => { NET.status = 'error'; NET.err = e.message || 'The connection failed.'; refreshNet(); });
  }
  window.addEventListener('a13-profile', () => {   // a username change from the top bar, mid room
    if (!NET.role && PEND && PEND.length >= 4 && UI.profile.name() && ON) { SIG = ''; A.swap({ page: 'entry' }); connect('guest', PEND); return; }   // a join link was waiting for a name
    const t = TN(); if (!t || !NET.role || !NET.client) return;
    const n = UI.profile.name(); if (!n) return;
    if (NET.role === 'host') { const i = mySeat(); if (i >= 0 && t.page === 'lobby' && !t.names.some((x, j) => j !== i && String(x).toLowerCase() === n.toLowerCase())) { t.names[i] = n; A.save(); push(); changed(); } }
    else send({ t: 'hello', name: n });
  });
  const hello = () => send({ t: 'hello', name: lsName.get() || '' });
  const CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 5 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join('');
  const joinLink = () => location.origin + location.pathname + '#/challenge/tournament/join/' + NET.code;

  // ---------- trash talk and chat for the whole room: reactions pop up on every phone, a message panel ----------
  const REACTS = ['🔥', '😂', '😬', '👀', '🧱', '🐐', 'REACH', 'STEAL', 'COOKED', 'GG'];
  const CHAT = { list: [], open: false, unread: 0, typingUntil: 0, typingName: '', sentAt: 0, lastReact: 0 };
  const chatName = () => UI.profile.name() || (TN() && TN().names[mySeat()]) || 'PLAYER';
  const chatOn = () => !!(NET.role && NET.client && NET.status === 'connected' && /tournament\/online/.test(location.hash) && TN() && TN().page !== 'entry');
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
  function showTyping() {
    const on = Date.now() < CHAT.typingUntil, line = on ? esc(CHAT.typingName || 'Someone') + ' is typing...' : '';
    const el = document.getElementById('tnTyping'); if (el) el.innerHTML = line;
    const b = document.getElementById('tnChatTyping'); if (b) b.textContent = on ? ' | typing...' : '';
  }
  function addChat(msg) {
    CHAT.list.push(Object.assign({ at: Date.now() }, msg));
    if (CHAT.list.length > 100) CHAT.list.shift();
    if (!msg.mine && !CHAT.open) { CHAT.unread++; bubble('💬 ' + msg.text.slice(0, 40), msg.name, false); }
    drawChat();
  }
  function syncChat() { const box = document.getElementById('tnChat'); if (!chatOn()) { if (box) box.remove(); } else if (!box) drawChat(); }
  function drawChat() {
    let box = document.getElementById('tnChat');
    if (!chatOn()) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div'); box.id = 'tnChat'; box.className = 'vs-chat';
      document.body.appendChild(box);
      box.addEventListener('click', e => {
        if (e.target.closest('[data-chat="toggle"]')) { CHAT.open = !CHAT.open; if (CHAT.open) CHAT.unread = 0; drawChat(); if (CHAT.open) { const i = box.querySelector('input'); if (i) i.focus(); } return; }
        const rb = e.target.closest('[data-react]');
        if (rb) {
          const now = Date.now();
          if (now - CHAT.lastReact < 1200) return;
          CHAT.lastReact = now;
          bubble(rb.dataset.react, chatName(), true); send({ t: 'react', r: rb.dataset.react, name: chatName() });
        }
      });
      box.addEventListener('input', e => {
        if (e.target.tagName !== 'INPUT' || Date.now() - CHAT.sentAt < 2000) return;
        CHAT.sentAt = Date.now(); send({ t: 'typing', name: chatName() });
      });
      box.addEventListener('submit', e => {
        e.preventDefault();
        const i = box.querySelector('input'), text = (i.value || '').trim().slice(0, 300);
        if (!text) return;
        i.value = '';
        addChat({ name: chatName(), text, mine: true });
        send({ t: 'chat', text, name: chatName() });
        const again = box.querySelector('input'); if (again) again.focus();
      });
    }
    const msgs = CHAT.list.map(m => `<li class="${m.mine ? 'mine' : ''}"><small>${esc(m.name)}</small><span>${esc(m.text)}</span></li>`).join('');
    box.innerHTML = `<button type="button" class="vs-chat-btn" data-chat="toggle" aria-expanded="${CHAT.open}">💬 CHAT<small id="tnChatTyping"></small>${CHAT.unread ? `<b>${CHAT.unread}</b>` : ''}</button>
      ${CHAT.open ? `<div class="vs-chat-panel"><div class="vs-chat-h"><span>ROOM ${esc(NET.code)} CHAT</span><button type="button" data-chat="toggle" aria-label="Close chat">&times;</button></div>
        <div class="vs-react" role="group" aria-label="Reactions" style="position:static;margin:0 0 6px">${REACTS.map(r => `<button type="button" data-react="${esc(r)}"${/^[A-Z]/.test(r) ? ' class="word"' : ''}>${esc(r)}</button>`).join('')}</div>
        <ol class="vs-chat-list">${msgs || '<li class="muted">Say something. Trash talk welcome.</li>'}</ol><div class="vs-typing" id="tnTyping" aria-live="polite"></div>
        <form class="vs-chat-form"><input maxlength="300" placeholder="Message" autocomplete="off" enterkeyhint="send"><button type="submit" class="btn btn-gold btn-small">SEND</button></form></div>` : ''}`;
    const list = box.querySelector('.vs-chat-list'); if (list) list.scrollTop = list.scrollHeight;
    showTyping();
  }
  window.addEventListener('hashchange', syncChat);
  setInterval(syncChat, 1500);

  function onMsg(m) {
    if (!m || typeof m !== 'object' || m.from === NET.me) return;
    if (m.t === 'react' && REACTS.indexOf(m.r) >= 0) { bubble(m.r, String(m.name || '').slice(0, 20), false); return; }
    if (m.t === 'typing') { CHAT.typingUntil = Date.now() + 3500; CHAT.typingName = String(m.name || '').slice(0, 20); showTyping(); setTimeout(showTyping, 3600); return; }
    if (m.t === 'chat' && m.text) { CHAT.typingUntil = 0; addChat({ name: String(m.name || '').slice(0, 20), text: String(m.text).slice(0, 300), mine: false }); return; }
    if (m.t === 'court') {
      const c = A.court();
      if (c && A.watchN() === m.n) { if (m.k === 'speed') c.setSpeed(+m.v || 1); else if (m.k === 'play') c.play(); else if (m.k === 'pause') c.pause(); else if (m.k === 'skip') c.skipQuarter(); }
      return;
    }
    if (NET.role === 'host') {
      if (m.role === 'host') {   // a second host: the one with the newer epoch keeps the room
        if (m.t !== 'state' || !m.s) return;
        const ne = m.s.epoch || 0, me0 = TN().epoch || 0;
        if (ne > me0 || (ne === me0 && String(m.s.hostCid) < CID)) { become('guest'); NET.peerSeen = Date.now(); NET.status = 'connected'; onState(m.s); refreshNet(); }
        else push();
        return;
      }
      if (m.role !== 'guest' || !m.cid) return;
      SEEN[m.cid] = Date.now();
      if (m.t === 'hello') onHello(m);
      else if (m.t === 'act') { const seat = TN().seats.indexOf(m.cid); if (seat >= 0 && m.a) hostAct(seat, m.a); }
      return;
    }
    if (m.role !== 'host') return;
    NET.peerSeen = Date.now();
    if (NET.status !== 'connected') { NET.status = 'connected'; NET.err = ''; lsRoom.set({ code: NET.code, at: Date.now() }); refreshNet(); }
    if (m.t === 'ping' && m.hn) OFF = m.hn - Date.now();
    else if (m.t === 'dupe' && m.to === CID) { NET.status = 'error'; NET.err = 'Someone in this room already has your username. Change it with the account button at the top, then join again.'; refreshNet(); }
    else if (m.t === 'full' && m.to === CID) { NET.status = 'error'; NET.err = 'That room is full, or the draft already started. Ask the host.'; refreshNet(); }
    else if (m.t === 'state' && m.s) { if ((m.s.epoch || 0) >= (TN().epoch || 0)) onState(m.s); }
  }
  // roles can change in a room: the host hands over (by choice) or drops and a guest takes over
  function become(role) {
    NET.role = role; HOOK.host = role === 'host';
    if (role === 'host') { NET.status = 'ready'; NET.err = ''; SEEN[CID] = Date.now(); }
    else { NET.status = 'connecting'; NET.peerSeen = Date.now(); }
  }
  function takeOver(chosen) {
    const t = TN();
    if (NET.role === 'host') return;
    t.epoch = (t.epoch || 0) + 1; t.hostCid = CID;
    become('host'); t.seats.forEach(c => { SEEN[c] = Date.now(); });
    if (!chosen) UI.toast('The host dropped. You are the host now.');
    A.save(); push(); changed(); refreshNet();
  }
  function handOver(i) {
    const t = TN(), c = t.seats[i];
    if (NET.role !== 'host' || !c || c === CID) return;
    if (!window.confirm('Make ' + t.names[i] + ' the host? They run the bracket from here, and you become a regular player.')) return;
    t.epoch = (t.epoch || 0) + 1; t.hostCid = c;
    push(); lsHost.del(); become('guest'); refreshNet(); changed();
  }
  function onHello(m) {
    const t = TN();
    SEEN[m.cid] = Date.now();
    let i = t.seats.indexOf(m.cid);
    if (i < 0) {
      if (t.page !== 'lobby' || t.seats.length >= t.n) { send({ t: 'full', to: m.cid }); return; }
      if (m.name && t.names.slice(0, t.seats.length).some(n => String(n).toLowerCase() === String(m.name).trim().toLowerCase())) { send({ t: 'dupe', to: m.cid }); return; }   // two people cannot share a username in a room
      t.seats.push(m.cid); i = t.seats.length - 1; t.names[i] = cleanName(m.name, i); t.live[i] = true;
    } else if (t.page === 'lobby' && m.name) t.names[i] = cleanName(m.name, i);
    A.save(); changed();
  }

  // ---------- state coming in (guests) and redrawing without disturbing what is playing ----------
  // take-turns drafts: snake order over the human seats, one pick each, skipping seats the CPU has already filled
  function onClockSeat(t) {
    if (!t.cfg || !t.cfg.turns || !t.seats.length) return -1;
    const H = t.seats.length, c = t.seats.map(() => 0);
    for (let j = 0; j < H * per(t); j++) {
      const r = Math.floor(j / H), i = j % H, sd = r % 2 === 0 ? i : H - 1 - i;
      if (t.picks[sd].length > c[sd]) { c[sd]++; continue; }
      return sd;
    }
    return -1;
  }
  function mySig() { const t = TN(), w = mySeat(), on = t.cfg && t.cfg.turns ? onClockSeat(t) : w; return JSON.stringify([t.lock, t.picks[w], t.spins[w], t.respins[w], t.clk[w], on, t.picks[on], t.spins[on], t.clk[on]]); }
  const onPage = () => /#\/challenge\/tournament\/online/.test(location.hash);
  function changed() {
    const t = TN(), mine = mySig();
    if (!APP || !onPage()) return;
    if (t.page === 'draft' && LAST.page === 'draft' && mine === LAST.mine) updateProg();
    else if (t.page === 'lobby' && LAST.page === 'lobby') lobby(APP);
    else if (t.page === 'entry') entry(APP);
    else A.render();
    LAST = { page: t.page, mine };
    pill();
  }
  function soft() { if (!APP || !onPage()) return; const t = TN(); if (t.page === 'lobby') lobby(APP); else if (t.page === 'draft') updateProg(); }
  function onState(s) {
    const t = TN();
    if (s.hnow) OFF = s.hnow - Date.now();
    const sig = JSON.stringify(s, (k, v) => (k === 'hnow' || k === 'live' ? undefined : v));
    SHARED.forEach(k => { if (k in s) t[k] = s[k]; });
    if (t.hostCid === CID && NET.role === 'guest') { SIG = sig; takeOver(true); return; }
    if (sig === SIG) { soft(); return; }
    SIG = sig;
    if (t.page === 'match' && t.watch && t.cur && t.watch.r === t.cur.r && t.watch.i === t.cur.i) A.setWatch(t.watch.n);
    changed();
  }

  // ---------- host: the draft rules ----------
  const load = (years, fn) => {
    const todo = years.filter(y => y && !C.loaded(y));
    if (!todo.length) { fn(); return; }
    Promise.all(todo.map(y => C.load(y))).then(fn).catch(() => {});
  };
  const setClk = (seat, phase) => { const t = TN(); if (t.cfg && t.cfg.board) phase = 'pick'; t.clk[seat] = t.cfg && t.cfg.timer ? { phase, until: Date.now() + t.cfg.timer * 1000 + (phase === 'pick' && !t.cfg.board ? SPIN_MS : 0) } : null; };
  function newSpin(seat, avoid) {
    const t = TN(); t.who = seat;
    const s = A.spinFor(t.cfg, A.board(t.cfg), flat(), avoid);
    if (s) { t.spins[seat] = s; t.spun.push(s.key); setClk(seat, 'pick'); }
  }
  function humansDone() { const t = TN(); return t.seats.every((_, i) => t.picks[i].length >= per(t)); }
  // 8-man: after the last pick each player sets and locks their starters; the bracket waits for everyone (the host can start anyway)
  function lockedAll() { const t = TN(); return !(t.cfg && t.cfg.bench) || t.seats.every((_, i) => t.lock && t.lock[i]); }
  function fill(seat) {
    const t = TN(), cfg = t.cfg, B = A.board(cfg);
    let tries = 0; t.who = seat;
    while (t.picks[seat].length < per(t) && tries++ < 80) {
      const five = t.picks[seat].map(id => B.byId[id]).filter(Boolean);
      if (cfg.board) {
        const tk = B.takenSet(flat()), cands = B.players.filter(p => !tk.has(B.base(p)) && (!cfg.cap || C.capFits(cfg.cap, five, p))).sort((a, b) => b.ovr - a.ovr).slice(0, 300);
        const bp = A.aiChoose(cfg.cap, five, cands);
        if (bp) t.picks[seat].push(bp.id);
        continue;
      }
      const s = A.spinFor(cfg, B, flat(), null);
      if (s) t.spun.push(s.key);
      let pick = s && A.aiChoose(cfg.cap, five, A.rosterOf(B, s.key, flat()));
      if (!pick && tries > 40) pick = A.aiChoose(cfg.cap, five, B.players.concat(B.extra || []).filter(p => !B.takenSet(flat()).has(B.base(p))).sort((x, y) => (cfg.cap ? C.price(x) - C.price(y) : 0)).slice(0, 400))   // under a cap the cheapest players are the ones that still fit;
      if (pick) t.picks[seat].push(pick.id);
    }
    t.spins[seat] = null; t.clk[seat] = null;
  }
  function afterChange() {
    const t = TN();
    if (t.page === 'draft' && humansDone() && lockedAll()) {
      for (let i = t.seats.length; i < t.n; i++) fill(i);
      A.startBracket(A.board(t.cfg));
      LAST = { page: t.page, mine: mySig() };
      return;
    }
    if (t.cfg && t.cfg.turns) {
      const on = onClockSeat(t);
      t.seats.forEach((_, i) => { if (i !== on) t.clk[i] = null; });
      if (on >= 0 && !t.clk[on]) setClk(on, t.spins[on] ? 'pick' : 'spin');
    }
    A.save(); changed();
  }
  function hostAct(seat, a) {
    const t = TN(), cfg = t.cfg;
    if (a && a.k === 'lock') {   // 8-man: starters are set
      if (t.page === 'draft' && cfg && cfg.bench && seat >= 0 && seat < t.seats.length && t.picks[seat].length >= per(t)) { t.lock = t.lock || []; t.lock[seat] = true; afterChange(); push(); }
      return;
    }
    if (a && a.k === 'force') {   // the host starts the bracket without waiting for a slow player
      if (t.page === 'draft' && cfg && cfg.bench && t.seats[seat] === t.hostCid && humansDone()) { t.lock = t.seats.map(() => true); afterChange(); push(); }
      return;
    }
    if (a && a.k === 'swap') {   // 8-man: trade a starter and a bench player
      const pk = t.picks[seat], i = +a.i, j = +a.j;
      if (t.page === 'draft' && cfg && cfg.bench && seat >= 0 && seat < t.seats.length && !(t.lock && t.lock[seat]) && i !== j && pk[i] != null && pk[j] != null) { const x = pk[i]; pk[i] = pk[j]; pk[j] = x; A.save(); push(); changed(); }
      return;
    }
    if (t.page !== 'draft' || !cfg || seat < 0 || seat >= t.seats.length || t.picks[seat].length >= per(t)) return;
    if (cfg.turns && seat !== onClockSeat(t)) return;
    if (cfg.board) {   // the open board: no wheel, just take anyone who is left
      if (a.k !== 'take') return;
      const y = +String(a.id).split('@')[1];
      load(!cfg.year && y && y !== 2013 ? [y] : [], () => {
        if (t.picks[seat].length >= per(t) || (cfg.turns && seat !== onClockSeat(t))) return;
        const B = A.board(cfg), p = B.byId[a.id];
        if (!p || B.takenSet(flat()).has(B.base(p))) return;
        const five = t.picks[seat].map(id => B.byId[id]).filter(Boolean);
        if (cfg.cap && !C.capFits(cfg.cap, five, p)) return;
        t.picks[seat].push(a.id); if (cfg.turns) t.clk[seat] = null; else setClk(seat, 'pick');
        afterChange();
      });
      return;
    }
    const s = t.spins[seat];
    if (a.k === 'spin') { if (s) return; newSpin(seat, null); }
    else if (a.k === 'respin' || a.k === 'free') {
      if (!s) return;
      if (a.k === 'respin') { if (!(t.respins[seat] > 0)) return; t.respins[seat]--; }
      newSpin(seat, s.key);
    } else if (a.k === 'take') {
      if (!s) return;
      load(!cfg.year && s.year !== 2013 ? [s.year] : [], () => {
        const cur = t.spins[seat]; if (!cur || cur.n !== s.n) return;
        const B = A.board(cfg), p = B.byId[a.id];
        if (!p || !A.rosterOf(B, cur.key, flat()).some(x => x.id === a.id)) return;
        const five = t.picks[seat].map(id => B.byId[id]).filter(Boolean);
        if (cfg.cap && !C.capFits(cfg.cap, five, p)) return;
        t.picks[seat].push(a.id); t.spins[seat] = null; if (cfg.turns) t.clk[seat] = null; else setClk(seat, 'spin');
        afterChange();
      });
      return;
    } else return;
    afterChange();
  }
  // the shot clock runs on the host: when it runs out the wheel spins itself, then the best fit is taken
  function clockCheck() {
    const t = TN();
    if (NET.role !== 'host' || t.page !== 'draft' || !t.cfg || !t.cfg.timer) return;
    t.seats.forEach((_, seat) => {
      const c = t.clk[seat];
      if (!c || t.picks[seat].length >= per(t) || c.until > Date.now()) return;
      c.until = Date.now() + 3000;   // guard while a roster loads
      if (t.cfg.board) {
        const B = A.board(t.cfg), five = t.picks[seat].map(id => B.byId[id]).filter(Boolean), tk = B.takenSet(flat());
        const rp = B.players.filter(p => !tk.has(B.base(p)) && C.capFits(t.cfg.cap, five, p)).sort((a, b) => b.ovr - a.ovr)[0];
        if (rp) hostAct(seat, { k: 'take', id: rp.id });
        return;
      }
      const s = t.spins[seat];
      if (!s) { hostAct(seat, { k: 'spin' }); return; }
      load(!t.cfg.year && s.year !== 2013 ? [s.year] : [], () => {
        const B = A.board(t.cfg), five = t.picks[seat].map(id => B.byId[id]).filter(Boolean);
        const pool = A.rosterOf(B, s.key, flat()).filter(p => C.capFits(t.cfg.cap, five, p));
        hostAct(seat, pool[0] ? { k: 'take', id: pool[Math.floor(Math.random() * pool.length)].id } : { k: 'free' });
      });
    });
  }
  function act(a) { if (NET.role === 'host') hostAct(mySeat(), a); else send({ t: 'act', a }); }

  // ---------- pages ----------
  const netBar = () => {
    if (!NET.role) return '';
    const st = NET.status, host = NET.role === 'host';
    const msg = st === 'connected' ? 'Connected to the host.'
      : st === 'ready' ? `Room <b>${esc(NET.code)}</b>: send the link to your friends.`
      : st === 'lost' ? 'Lost the host. Reconnecting on its own when they are back...'
      : st === 'error' ? esc(NET.err || 'Not connected.') : (NET.err ? esc(NET.err) : 'Connecting...');
    return `<div class="vs-net ${st === 'ready' ? 'waiting' : st}"><span class="vs-net-dot"></span><span>${msg}</span>
      ${host && NET.code ? '<button type="button" class="btn btn-small" id="tnCopy">COPY LINK</button>' : ''}
      ${st === 'lost' || st === 'error' ? '<button type="button" class="btn btn-small" id="tnRetry">TRY AGAIN</button>' : ''}
      <button type="button" class="btn btn-small" id="tnLeaveRoom">LEAVE</button></div>`;
  };
  // a small pill on the bracket, match and champion screens: who is host, hand the room over, leave
  function pill() {
    let el = document.getElementById('tnPill');
    const t = TN(), show = ON && NET.role && ['bracket', 'match', 'champ'].indexOf(t.page) >= 0 && /tournament\/online/.test(location.hash);
    if (!show) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'tnPill'; el.className = 'tn-pill'; document.body.appendChild(el); }
    const host = NET.role === 'host', hi = t.seats.indexOf(t.hostCid);
    const others = t.seats.map((c, i) => (c === CID ? '' : `<option value="${i}">${esc(t.names[i])}</option>`)).join('');
    el.innerHTML = `<span class="vs-net-dot ${NET.status}"></span><span>${NET.status === 'lost' ? 'HOST LOST, A PLAYER TAKES OVER SOON' : host ? 'YOU ARE THE HOST' : 'HOST: ' + esc(t.names[hi] || '?')}</span>
      ${host && others ? `<select id="tnHandTo">${others}</select><button type="button" class="btn btn-small" id="tnHand">MAKE HOST</button>` : ''}<button type="button" class="btn btn-small" id="tnPillLeave">LEAVE</button>`;
    const h = el.querySelector('#tnHand'); if (h) h.addEventListener('click', () => handOver(+el.querySelector('#tnHandTo').value));
    el.querySelector('#tnPillLeave').addEventListener('click', () => HOOK.quit());
  }
  function refreshNet() {
    pill();
    const el = document.getElementById('tnNet');
    if (!el) return;
    el.innerHTML = netBar();
    const cp = el.querySelector('#tnCopy');
    if (cp) cp.addEventListener('click', async () => {
      const link = joinLink(), text = 'Join my tournament on Starting Five. Room ' + NET.code + ': ' + link;
      if (navigator.share) { try { await navigator.share({ text, url: link }); return; } catch (e) { /* closed */ } }
      try { await navigator.clipboard.writeText(link); UI.toast('Link copied. Send it around.'); } catch (e) { UI.toast(link); }
    });
    const rt = el.querySelector('#tnRetry'); if (rt) rt.addEventListener('click', () => connect(NET.role, NET.code));
    const lv = el.querySelector('#tnLeaveRoom'); if (lv) lv.addEventListener('click', () => HOOK.quit());
  }
  window.addEventListener('hashchange', () => pill());
  function leave() {
    hangUp(); pill(); SIG = ''; LAST = { page: '', mine: '' };
    A.swap({ page: 'entry' });
    if (APP) A.render();
  }
  HOOK.quit = () => {
    if (!window.confirm(NET.role === 'host' ? 'Close the room? Everyone is dropped. You can resume it from the online screen.' : 'Leave the room? You can rejoin with the same link.')) return;
    leave();
  };
  HOOK.again = () => {
    const t = TN();
    Object.assign(t, { page: 'lobby', cfg: null, teams: [], picks: [], seeds: [], rounds: [], cur: null, champ: -1, rating: null, watch: null, spins: [], respins: [], spun: [], clk: [], ai: [], humans: 0 });
    t.names = t.names.slice(0, t.seats.length); A.clearRuns();
    A.save(); changed();
  };
  HOOK.save = () => { if (NET.role === 'host') { saveHost(); push(); } };
  HOOK.court = (n, k, v) => send({ t: 'court', n, k, v });
  HOOK.pages.entry = app => entry(app);
  HOOK.pages.lobby = app => lobby(app);
  HOOK.pages.draft = app => draft(app);

  function entry(app) {
    const saved = lsHost.get(), room = lsRoom.get(), name = lsName.get() || '';
    app.innerHTML = `
      <section class="ch-hero"><div class="ch-hero-k">DRAFT CHALLENGE | ONLINE TOURNAMENT</div><h1 class="ch-hero-t">EVERYONE, YOUR OWN PHONE.</h1>
        <p class="ch-hero-p">Four or eight teams. One phone hosts and runs the bracket, everyone else joins with a room code. You all draft at the same time on your own phones, then watch every game together.</p></section>
      <div id="tnNet">${netBar()}</div>
      <div class="ch-setup tn-setup">
        ${UI.profile.bar()}
        <div class="ch-step"><div class="ch-step-k">2 | HOST A ROOM</div>
          <div class="ch-go"><button type="button" class="btn btn-gold btn-big" id="tnHost"${name ? '' : ' disabled'}>HOST A ROOM</button>${saved && saved.code ? '<button type="button" class="btn" id="tnResume">RESUME YOUR ROOM ' + esc(saved.code) + '</button>' : ''}</div></div>
        <div class="ch-step"><div class="ch-step-k">3 | OR JOIN ONE</div>
          <div class="vs-join"><label class="field"><span>ROOM CODE</span><input id="tnCode" maxlength="5" placeholder="ABCDE" value="${esc(PEND || '')}" autocomplete="off" autocapitalize="characters"></label><button type="button" class="btn btn-gold" id="tnJoin"${name ? '' : ' disabled'}>JOIN</button></div>
          ${room && room.code ? '<div class="ch-go"><button type="button" class="btn" id="tnRejoin">REJOIN ROOM ' + esc(room.code) + '</button></div>' : ''}</div>
        <div class="ch-go"><a class="btn" href="#/challenge/tournament">ONE PHONE INSTEAD</a><a class="btn" href="#/home">HOME</a></div>
      </div>`;
    refreshNet();
    UI.profile.wire(app, () => entry(app));
    const nm = () => UI.profile.name();
    UI.$('#tnHost', app).addEventListener('click', () => {
      const v = nm() || 'HOST';
      A.swap(fresh(v)); LAST = { page: '', mine: '' }; SIG = '';
      connect('host', newCode()); A.render();
    });
    const rs = UI.$('#tnResume', app);
    if (rs) rs.addEventListener('click', () => { A.swap(saved.s); LAST = { page: '', mine: '' }; connect('host', saved.code); A.render(); });
    const go = code => {
      const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (c.length < 4) { UI.toast('Type the room code', 'error'); return; }
      if (!nm()) { UI.toast('Type your name first', 'error'); return; }
      SIG = ''; connect('guest', c);
    };
    UI.$('#tnJoin', app).addEventListener('click', () => go(UI.$('#tnCode', app).value));
    const rj = UI.$('#tnRejoin', app); if (rj) rj.addEventListener('click', () => go(room.code));
  }

  function lobby(app) {
    const t = TN(), o = t.opts, host = NET.role === 'host', n = t.n, me = mySeat();
    const ds = host ? '' : ' disabled';
    const chips = (list, cur, attr, dis) => list.map(([v, l]) => `<button type="button" class="ch-chip${cur === v ? ' on' : ''}" data-${attr}="${v}"${host && !(dis && dis(v)) ? '' : ' disabled'}>${l}</button>`).join('');
    const decs = [...new Set(A.ALL_YEARS.map(A.decOf))], ch = A.ALL_YEARS.filter(y => t.skip.indexOf(y) < 0);
    const seats = Array.from({ length: n }, (_, i) => t.seats[i]
      ? `<li class="tn-seat on"><i class="tn-live ${t.live[i] === false ? 'off' : 'on'}"></i><b>${esc(t.names[i] || 'PLAYER ' + (i + 1))}</b>${i === me ? '<small>YOU</small>' : ''}${host && t.seats[i] !== CID ? `<button type="button" class="btn btn-small" data-host="${i}">MAKE HOST</button><button type="button" class="btn btn-small" data-kick="${i}">REMOVE</button>` : ''}</li>`
      : `<li class="tn-seat"><span class="muted">${i < 2 ? 'WAITING FOR A PLAYER' : 'OPEN (an AI team if nobody joins)'}</span></li>`).join('');
    const scroll = window.scrollY;
    app.innerHTML = `
      <section class="ch-hero"><div class="ch-hero-k">ONLINE TOURNAMENT | ROOM ${esc(NET.code)}</div><h1 class="ch-hero-t">THE LOBBY.</h1>
        <p class="ch-hero-p">${host ? 'Send the link to your friends. When everyone is in, set the rules and start the draft. Empty seats become AI teams.' : 'You are in. The host sets the rules and starts the draft.'}</p></section>
      <div id="tnNet">${netBar()}</div>
      <div class="ch-setup tn-setup">
        <div class="ch-step"><div class="ch-step-k">1 | WHO IS IN (${t.seats.length} OF ${n})</div><ul class="tn-seats">${seats}</ul>
          <div class="ch-chips">${chips([[4, '4 TEAMS'], [8, '8 TEAMS']], n, 'n', v => t.seats.length > v)}</div></div>
        <div class="ch-step"><div class="ch-step-k">2 | THE SEASON</div>
          ${host ? `<div class="row-btns vs-seas-all"><button type="button" class="btn btn-small${!t.skip.length ? ' on' : ''}" data-seas="all">ALL</button><button type="button" class="btn btn-small" data-seas="none">CLEAR</button>
            ${decs.map(d => `<button type="button" class="btn btn-small${A.ALL_YEARS.filter(y => A.decOf(y) === d).every(y => t.skip.indexOf(y) < 0) ? ' on' : ''}" data-dec="${d}">${d + 1}S</button>`).join('')}</div>
          <div class="vs-seas">${C.SEASONS.map(s => `<button type="button" class="ch-chip${t.skip.indexOf(s.year) < 0 ? ' on' : ''}" data-yr="${s.year}">${esc(s.label)}</button>`).join('')}</div>` : ''}
          <small class="muted">${!ch.length ? 'Pick at least one season.' : ch.length === 1 ? 'One season: the whole ' + esc(A.lbl(ch[0])) + ' league.' : ch.length + ' seasons on. Every spin lands on a team and a season from them. Nobody can be drafted twice.'}</small></div>
        <div class="ch-step"><div class="ch-step-k">3 | THE RULES</div>
          <div class="tn-rules">
            <div><span class="ts-start-k">EACH ROUND</span><div class="ch-chips">${chips([[1, 'BEST OF 1'], [3, 'BEST OF 3']], o.bestOf, 'bo')}</div></div>
            ${ch.length === 1 ? '' : `<div><span class="ts-start-k">GAME RULES</span><div class="ch-chips">${chips(ERAS, o.era || 2013, 'era')}</div></div>`}
            <div><span class="ts-start-k">DRAFT ORDER</span><div class="ch-chips">${chips([['all', 'ALL AT ONCE'], ['turns', 'TAKE TURNS']], o.order || 'turns', 'order')}</div>
              <small class="muted">${(o.order || 'turns') === 'turns' ? 'One pick each, snake order, everyone watches every spin.' : 'Everyone drafts their five at the same time.'}</small></div>
            ${ch.length === 1 ? '' : `<div><span class="ts-start-k">SAME PLAYER TWICE</span><div class="ch-chips">${chips([[0, 'NO DUPLICATES'], [1, 'DUPLICATES ON']], o.dupes ? 1 : 0, 'dupes')}</div>
              <small class="muted">${o.dupes ? 'The same player can be drafted from different seasons. Only that exact season is gone once taken.' : 'A player is gone for good once taken, whatever the season.'}</small></div>`}
            <div><span class="ts-start-k">DRAFT STYLE</span><div class="ch-chips">${chips([[0, 'THE WHEEL'], [1, 'OPEN BOARD']], o.board ? 1 : 0, 'board')}</div>
              <small class="muted">${o.board ? 'No wheel: pick anyone left on the board. Every season you picked loads in on each phone.' : 'Every pick comes from the team the wheel lands on.'}</small></div>
            <div><span class="ts-start-k">BENCH</span><div class="ch-chips">${chips([[0, 'JUST THE FIVE'], [3, '8-MAN: +3 BENCH']], o.bench ? 3 : 0, 'bench')}</div>
              <small class="muted">${o.bench ? 'Everyone drafts eight. The first five start, the last three come off the bench.' + (o.cap ? ' The cap grows to $' + C.capFor(o.cap, o.bench) + 'M to cover all eight.' : '') : 'Five players each, all 48 minutes.'}</small></div>
            ${o.bench ? `<div><span class="ts-start-k">IN THE GAMES</span><div class="ch-chips">${chips([[0, 'BENCH PLAYS'], [1, 'STARTERS ONLY']], o.noBench ? 1 : 0, 'nb')}</div>
              <small class="muted">${o.noBench ? 'All eight are drafted, but only the five starters play, all 48 minutes.' : 'The bench subs in during the games.'}</small></div>` : ''}
            <div><span class="ts-start-k">SEEDING</span><div class="ch-chips">${chips([['random', 'RANDOM'], ['rating', 'BY TEAM RATING']], o.seeding, 'seed')}</div></div>
            <div><span class="ts-start-k">SHOT CLOCK</span><div class="ch-chips">${chips([[24, '24 SEC'], [0, 'OFF']], o.timer ? 24 : 0, 'timer')}</div></div>
            <div><span class="ts-start-k">RATINGS</span><div class="ch-chips">${[[true, 'ON'], [false, 'OFF']].map(([v, l]) => `<button type="button" class="ch-chip${(o.ratings !== false) === v ? ' on' : ''}" data-rate="${v}"${ds}>${l}</button>`).join('')}</div></div>
            <div><span class="ts-start-k">SALARY CAP</span><div class="ch-chips">${UI.challengeCap.CAPS.map(v => `<button type="button" class="ch-chip${(o.cap || 0) === v ? ' on' : ''}" data-cap="${v}"${ds}>${v ? '$' + v + 'M' : 'OFF'}</button>`).join('')}</div></div>
          </div></div>
        <div class="ch-go">${host ? `<button type="button" class="btn btn-gold btn-big" id="tnGo"${t.seats.length >= 2 && NET.status === 'ready' ? '' : ' disabled'}>${t.seats.length >= 2 ? 'START THE DRAFT' : 'WAITING FOR A FRIEND'}</button>` : '<p class="muted">Waiting for the host to start.</p>'}<a class="btn" href="#/home">HOME</a></div>
      </div>`;
    window.scrollTo(0, scroll);
    UI.centerChips(app); refreshNet();
    if (!host) return;
    const edit = fn => { fn(); A.save(); lobby(app); };
    app.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => edit(() => { t.n = +b.dataset.n; })));
    app.querySelectorAll('[data-host]').forEach(b => b.addEventListener('click', () => handOver(+b.dataset.host)));
    app.querySelectorAll('[data-kick]').forEach(b => b.addEventListener('click', () => edit(() => { const i = +b.dataset.kick; t.seats.splice(i, 1); t.names.splice(i, 1); t.live.splice(i, 1); })));
    app.querySelectorAll('[data-yr]').forEach(b => b.addEventListener('click', () => edit(() => { const y = +b.dataset.yr, i = t.skip.indexOf(y); if (!t.skip.length) t.skip = A.ALL_YEARS.filter(x => x !== y); else if (i >= 0) t.skip.splice(i, 1); else t.skip.push(y); })));
    app.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => edit(() => {
      const ys = A.ALL_YEARS.filter(y => A.decOf(y) === +b.dataset.dec), allOn = ys.every(y => t.skip.indexOf(y) < 0);
      t.skip = !t.skip.length ? A.ALL_YEARS.filter(y => ys.indexOf(y) < 0) : allOn ? [...new Set(t.skip.concat(ys))] : t.skip.filter(y => ys.indexOf(y) < 0);
    })));
    app.querySelectorAll('[data-seas]').forEach(b => b.addEventListener('click', () => edit(() => { t.skip = b.dataset.seas === 'all' ? [] : A.ALL_YEARS.slice(); })));
    app.querySelectorAll('[data-order]').forEach(b => b.addEventListener('click', () => edit(() => { o.order = b.dataset.order; })));
    app.querySelectorAll('[data-era]').forEach(b => b.addEventListener('click', () => edit(() => { o.era = +b.dataset.era; })));
    app.querySelectorAll('[data-bo]').forEach(b => b.addEventListener('click', () => edit(() => { o.bestOf = +b.dataset.bo; })));
    app.querySelectorAll('[data-seed]').forEach(b => b.addEventListener('click', () => edit(() => { o.seeding = b.dataset.seed; })));
    app.querySelectorAll('[data-timer]').forEach(b => b.addEventListener('click', () => edit(() => { o.timer = +b.dataset.timer; })));
    app.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => edit(() => { o.ratings = b.dataset.rate === 'true'; })));
    app.querySelectorAll('[data-cap]').forEach(b => b.addEventListener('click', () => edit(() => { o.cap = +b.dataset.cap; })));
    app.querySelectorAll('[data-dupes]').forEach(b => b.addEventListener('click', () => edit(() => { o.dupes = +b.dataset.dupes; })));
    app.querySelectorAll('[data-board]').forEach(b => b.addEventListener('click', () => edit(() => { o.board = +b.dataset.board; })));
    app.querySelectorAll('[data-bench]').forEach(b => b.addEventListener('click', () => edit(() => { o.bench = +b.dataset.bench; })));
    app.querySelectorAll('[data-nb]').forEach(b => b.addEventListener('click', () => edit(() => { o.noBench = +b.dataset.nb; })));
    const go = UI.$('#tnGo', app);
    if (go) go.addEventListener('click', () => {
      const c = A.ALL_YEARS.filter(y => t.skip.indexOf(y) < 0);
      if (!c.length) { UI.toast('Switch on at least one season', 'error'); return; }
      const year = c.length === 1 ? c[0] : 0;
      const cfg = { mode: 'versus', year, seasons: c.length > 1 && c.length < A.ALL_YEARS.length ? c : null, bestOf: o.bestOf, blind: false, cap: C.capFor(+o.cap || 0, o.bench), timer: o.timer ? 24 : 0, turns: (o.order || 'turns') === 'turns', era: +o.era || 2013, injuries: false, board: o.board ? 1 : 0, dupes: year === 0 && o.dupes ? 1 : 0, bench: +o.bench || 0, noBench: !!(o.bench && o.noBench), seed: Math.floor(Math.random() * 2147483646) + 1 };
      A.ensure(app, cfg, () => {
        const d = C.seasonData(year || 2013), hn = t.seats.length, bots = A.shuffle(A.CPU_NAMES.slice());
        t.cfg = cfg;
        t.names = Array.from({ length: t.n }, (_, i) => (i < hn ? cleanName(t.names[i], i) : bots[i - hn]));
        t.ai = t.names.map((_, i) => i >= hn); t.humans = hn;
        t.teams = A.shuffle(d.teams.map(x => x.abbr)).slice(0, t.n);
        t.picks = t.names.map(() => []); t.respins = t.names.map(() => 1); t.spins = t.names.map(() => null); t.spun = [];
        t.clk = t.names.map(() => null); if (cfg.turns) setClk(onClockSeat(t), 'spin'); else t.seats.forEach((_, i) => setClk(i, 'spin'));
        t.rounds = []; t.seeds = []; t.cur = null; t.champ = -1; t.watch = null; t.lock = t.names.map(() => false); t.page = 'draft';
        A.clearRuns(); A.save(); LAST = { page: '', mine: '' }; A.render(); LAST = { page: 'draft', mine: mySig() };
      });
    });
  }

  // ---------- the draft: every human spins and picks on their own phone ----------
  function stopTick() { if (TICK) { clearInterval(TICK); TICK = null; } }
  function progHtml() {
    const t = TN(), host = NET.role === 'host', me = mySeat();
    return `<ul class="tn-seats tn-prog">${t.seats.map((c, i) => {
      const k = t.picks[i].length;
      return `<li class="tn-seat on${i === me ? ' me' : ''}"><i class="tn-live ${t.live[i] === false ? 'off' : 'on'}"></i><b>${esc(t.names[i])}</b><span class="tn-pips">${Array.from({ length: per(t) }, (_, j) => j).map(j => `<u class="${j < k ? 'on' : ''}"></u>`).join('')}</span>${k >= per(t) ? '<small>LOCKED IN</small>' : host && i !== me ? `<button type="button" class="btn btn-small" data-fill="${i}">CPU TAKES OVER</button>` : ''}${host && i !== me && k < 5 ? `<button type="button" class="btn btn-small" data-host="${i}">MAKE HOST</button>` : ''}</li>`;
    }).join('')}</ul>`;
  }
  function updateProg() {
    const el = document.getElementById('tnProg');
    if (!el) return;
    el.innerHTML = progHtml(); bindProg(el);
  }
  function bindProg(el) {
    el.querySelectorAll('[data-host]').forEach(b => b.addEventListener('click', () => handOver(+b.dataset.host)));
    el.querySelectorAll('[data-fill]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.fill;
      if (!window.confirm('Let the CPU finish the draft for ' + TN().names[i] + '?')) return;
      fill(i); afterChange();
    }));
  }
  function draft(app) {
    if (UI.challengeWheel.busy && UI.challengeWheel.busy()) return;   // a spin is running: its landing redraws the page
    stopTick();
    const t = TN(), cfg = t.cfg, w = mySeat();
    if (!cfg) return;
    A.ensure(app, cfg, () => {
      const B = A.board(cfg), teams = B.teams, byId = B.byId;
      if (w < 0) { app.innerHTML = UI.empty('YOU ARE NOT IN THIS DRAFT', 'Ask the host for the link to the next one.', '<div class="row-btns"><button type="button" class="btn" id="tnOut">LEAVE</button></div>'); UI.$('#tnOut', app).addEventListener('click', leave); return; }
      const k = t.picks[w].length, tm = A.teamOf(w), five = t.picks[w].map(id => byId[id]).filter(Boolean);
      const on = cfg.turns ? onClockSeat(t) : w, mineTurn = on === w;
      const onK = on >= 0 ? t.picks[on].length : per(t);
      const spin = on >= 0 && t.spins[on] && t.spins[on].pick === onK ? t.spins[on] : null;
      const onName = on >= 0 ? esc(t.names[on]) : '';
      const meta = `${esc(A.lblC(cfg))} | ${t.n} TEAMS | BEST OF ${t.opts.bestOf}${cfg.timer ? ' | ' + cfg.timer + ' SEC CLOCK' : ''}${cfg.cap ? ' | $' + cfg.cap + 'M CAP' : ''}`;
      let body = '';
      const lockBox = () => {
        const mine = t.lock && t.lock[w], doneAll = humansDone(), host = NET.role === 'host';
        if (!mine) return '<div class="ch-ready"><div><b>YOUR ' + per(t) + ' ARE IN.</b><span class="muted"> Tap a starter, then a bench player, to swap who starts. The first five start.</span></div><button type="button" class="btn btn-gold btn-big" id="tnLock">LOCK IN MY LINEUP</button></div>';
        return '<div class="ch-ready"><div><b>LINEUP LOCKED.</b><span class="muted"> The bracket starts when everyone has locked in.</span></div>' + (host && doneAll ? '<button type="button" class="btn" id="tnForce">START ANYWAY</button>' : '') + '</div>';
      };
      if (cfg.bench && k >= per(t) && (cfg.turns ? on < 0 : true)) body = lockBox();
      else if (cfg.turns && on < 0) body = '<div class="ch-ready"><div><b>THE DRAFT IS DONE.</b><span class="muted"> The bracket is coming up.</span></div></div>';
      else if (k >= per(t) && !cfg.turns) body = '<div class="ch-ready"><div><b>YOU ARE LOCKED IN.</b><span class="muted"> The bracket starts when everyone is done.</span></div></div>';
      else if (cfg.board) body = A.boardHtml(cfg, B, cfg.turns && on >= 0 ? t.picks[on].map(id => byId[id]).filter(Boolean) : five) + (mineTurn || !cfg.turns ? '' : `<p class="muted">${onName} is picking.</p>`);
      else if (!spin || !ANIM[spin.n]) {
        body = `<section class="ch-wheel">${UI.challengeWheel.strip(teams, { mode: B.era ? 'alltime' : 'versus', seasons: cfg.seasons })}<div class="ch-wheel-k">${spin ? 'SPINNING...' : mineTurn ? 'YOUR SPIN' : 'WAITING FOR ' + onName.toUpperCase() + ' TO SPIN'}</div>${spin || !mineTurn ? '' : '<button type="button" class="btn btn-gold btn-big" id="chSpin">SPIN THE WHEEL</button>'}</section>`;
      } else if (B.era && spin.year !== 2013 && !C.loaded(spin.year)) {
        body = `<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING THE ${esc(A.lbl(spin.year))} ROSTER...</div></section>`;
        C.load(spin.year).then(() => { const cs = TN().spins[on]; if (cs && cs.n === spin.n) draft(app); }).catch(() => UI.toast('That roster did not load. Try a re-spin.', 'error'));
      } else {
        const st = B.teamFor(spin.abbr, spin.year), ros = UI.challengeAlpha(A.rosterOf(B, spin.key, flat()));
        const onFive = on >= 0 ? t.picks[on].map(id => byId[id]).filter(Boolean) : five;
        const none = mineTurn && cfg.cap && !ros.some(p => C.capFits(cfg.cap, onFive, p));
        const row = p => { const pt = B.teamFor(p.team, p.season); return `<li class="ch-pl">${UI.faceImg(p, (pt.colors || ['#444'])[0])}<span class="ch-pl-b"><b>${esc(p.name)}</b><small>${A.logo(pt, 18)} ${esc(C.posLabel(p))}${B.era && p.season ? ' | ' + A.short(p.season) : p.age ? ' | ' + p.age : ''}</small></span>${cfg.cap ? UI.challengeCap.priceTag(p) : ''}${A.ovrTag(p)}${mineTurn ? UI.challengeCap.btn(cfg.cap, five, p, `<button type="button" class="btn btn-small btn-gold" data-add="${esc(p.id)}">TAKE</button>`) : ''}</li>`; };
        body = `<section class="ch-landed" style="--c1:${esc(st.colors[0])}">${A.logo(st, 64)}<div><div class="ch-wheel-k">THE WHEEL SAYS</div><div class="ch-landed-t">${B.era ? esc(A.lbl(spin.year)) + ' ' : ''}${esc(A.tName(st))}</div></div>
            ${mineTurn && t.respins[w] > 0 ? '<button type="button" class="btn btn-small" id="chRespin">RE-SPIN (1 LEFT)</button>' : ''}</section>
          ${mineTurn ? '' : '<p class="muted">' + onName + ' is picking from this roster.</p>'}
          ${cfg.cap && mineTurn ? UI.challengeCap.bar(cfg.cap, five) : ''}
          ${none ? '<div class="ch-ready"><div><b>NOBODY HERE FITS UNDER YOUR CAP.</b><span class="muted"> Spin again, on the house.</span></div><button type="button" class="btn btn-gold" id="tnFree">SPIN AGAIN</button></div>' : ''}
          <ul class="ch-list">${ros.map(row).join('')}</ul>`;
      }
      const fit = five.length ? UI.challengeFit(C.lineupFit(five.slice(0, 5)), { compact: true, title: (t.names[w] + "'s lineup").toUpperCase() }) : '';
      const clk = on >= 0 && t.clk[on] && onK < per(t);
      app.innerHTML = `<div class="ch-top"><div><div class="ch-top-k">${meta}</div><div class="ch-top-t">THE DRAFT</div></div><button type="button" class="btn btn-small" id="tnQuit">LEAVE</button></div>
        <div id="tnNet">${netBar()}</div>
        <div id="tnProg">${progHtml()}</div>
        <div class="vs-side tn-me" style="--c1:${esc(tm.colors[0])}"><div class="vs-side-h">${A.logo(tm, 36)}<div><small>${esc(t.names[w])} | YOU</small><b>${esc(A.tName(tm))}</b>${cfg.cap ? ' <small class="vs-pay">' + UI.challengeCap.money(C.capState(cfg.cap, five).spent) + ' of $' + cfg.cap + 'M</small>' : ''}</div></div>
          ${UI.swapOl(per(t), i => (five[i] ? esc(five[i].name) + ' <small class="muted">' + esc(C.posLabel(five[i])) + (B.era && five[i].season ? ' ' + A.short(five[i].season) : '') + '</small> <b class="ch-ovr ' + UI.ovrClass(five[i].ovr) + '">' + esc(five[i].ovr) + '</b>' : '<span class="muted">-</span>'), SW, !!cfg.bench && five.length > 5 && !(t.lock && t.lock[w]))}</div>
        ${on >= 0 ? `<div class="vs-clock">${cfg.turns ? (mineTurn ? 'YOU ARE ON THE CLOCK' : 'ON THE CLOCK: <b>' + onName + '</b>') + ' | ' : ''}PICK <b>${onK + 1}</b> OF ${per(t)}</div>` : ''}
        ${clk ? `<div class="vs-timer" id="vsTimer"><i style="--w:100%"></i><span>${cfg.timer}</span></div>` : ''}
        ${body}${fit}`;
      refreshNet(); bindProg(UI.$('#tnProg', app));
      const lk = UI.$('#tnLock', app); if (lk) lk.addEventListener('click', () => { SW = null; act({ k: 'lock' }); });
      const fc = UI.$('#tnForce', app); if (fc) fc.addEventListener('click', () => act({ k: 'force' }));
      UI.swapBind(app, i => {
        if (SW == null) SW = i;
        else if (SW === i) SW = null;
        else { const a = SW; SW = null; act({ k: 'swap', i: a, j: i }); }
        draft(app);
      });
      UI.$('#tnQuit', app).addEventListener('click', () => HOOK.quit());
      if (spin && !ANIM[spin.n]) UI.challengeWheel.animate(app, teams, () => { ANIM[spin.n] = true; const cs = TN().spins[on]; if (cs && cs.n === spin.n) draft(app); }, { year: spin.year, abbr: spin.abbr }, { mode: B.era ? 'alltime' : 'versus', seasons: cfg.seasons });
      const once = (id, a) => { const b = UI.$(id, app); if (b) b.addEventListener('click', () => { b.disabled = true; act(a); }); };
      if (cfg.board && (cfg.turns ? mineTurn : k < per(t))) {
        const onFive = cfg.turns && on >= 0 ? t.picks[on].map(id => byId[id]).filter(Boolean) : five;
        A.boardBind(app, cfg, B, onFive, id => {
          const p = byId[id];
          if (cfg.cap && p && !C.capFits(cfg.cap, onFive, p)) { UI.toast('That contract does not fit under the cap.', 'error'); return; }
          if (B.takenSet(flat()).has(p ? B.base(p) : id)) { UI.toast('Already drafted.', 'error'); return; }
          if (window.SFX) window.SFX.play('chime');
          act({ k: 'take', id });
          window.scrollTo(0, 0);
        }, true);
      } else if (cfg.board) A.boardBind(app, cfg, B, five, () => {}, false);
      once('#chSpin', { k: 'spin' }); once('#chRespin', { k: 'respin' }); once('#tnFree', { k: 'free' });
      app.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
        const p = byId[b.dataset.add];
        if (cfg.cap && p && !C.capFits(cfg.cap, five, p)) { UI.toast('That contract does not fit under the cap.', 'error'); return; }
        app.querySelectorAll('[data-add]').forEach(x => { x.disabled = true; });
        if (window.SFX) window.SFX.play('chime');
        act({ k: 'take', id: b.dataset.add });
        window.scrollTo(0, 0);
      }));
      if (clk) {
        const total = cfg.timer * 1000 + (t.clk[on].phase === 'pick' && !cfg.board ? SPIN_MS : 0);
        TICK = setInterval(() => {
          const el = UI.$('#vsTimer', app), c = TN().clk[on];
          if (!el || !c) { stopTick(); return; }
          const left = c.until - (Date.now() + OFF);
          el.querySelector('span').textContent = Math.max(0, Math.ceil(left / 1000));
          el.querySelector('i').style.setProperty('--w', Math.max(0, Math.min(100, 100 * left / total)) + '%');
          el.classList.toggle('low', left < 10000);
        }, 250);
      }
    });
  }

  // ---------- routing ----------
  function enter(app, part) {
    APP = app;
    if (!ON) { ON = true; HOOK.on = true; A.swap({ page: 'entry' }); SIG = ''; LAST = { page: '', mine: '' }; }
    if (part[1] === 'join' && part[2]) {
      PEND = part[2].toUpperCase().replace(/[^A-Z0-9]/g, '');
      history.replaceState(null, '', '#/challenge/tournament/online');
      if (!(NET.role === 'guest' && NET.code === PEND) && lsName.get() && PEND.length >= 4) { SIG = ''; A.swap({ page: 'entry' }); connect('guest', PEND); }
    }
    A.mount(app);
  }
  const prev = P.challenge;
  P.challenge = function (app, arg) {
    const part = String(arg || '').split('/');
    if (part[0] === 'tournament' && (part[1] === 'online' || part[1] === 'join')) return enter(app, part);
    if (ON) { ON = false; hangUp(); pill(); HOOK.on = false; HOOK.host = false; A.swap(null); }
    return prev.apply(this, arguments);
  };
  Object.keys(prev).forEach(k => { P.challenge[k] = prev[k]; });
})();
