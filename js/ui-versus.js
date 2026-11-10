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
  const lbl = y => (y - 1) + '-' + String(y).slice(2);
  const logo = (t, n) => UI.logoFor(t || { abbr: '?' }, n);
  const tOf = (teams, a) => teams.find(t => t.abbr === a) || { abbr: a, city: a, name: '', colors: ['#333', '#777'] };
  const tName = t => ((t.city || '') + ' ' + (t.name || '')).trim();
  const who = i => VS.names[i] || ('PLAYER ' + (i + 1));
  const SHARED = ['year', 'teams', 'names', 'opts', 'cfg', 'shown', 'page', 'spin', 'spun', 'respins', 'turn'];
  let APP = null;   // the page element the versus screens draw into

  // ---------- online (PeerJS) ----------
  const PEER_SRC = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const NET = { role: null, code: '', status: '', err: '', peer: null, conn: null };
  const me = () => (NET.role === 'host' ? 0 : NET.role === 'guest' ? 1 : null);   // null: same phone, both sides
  const canAct = side => me() === null || me() === side;
  const online = () => !!NET.role;
  const linked = () => !!(NET.conn && NET.conn.open);
  function loadPeer() {
    if (window.Peer) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = PEER_SRC; s.onload = res; s.onerror = () => rej(new Error('Could not load the online connection. Check the internet and try again.'));
      document.head.appendChild(s);
    });
  }
  function push() {
    ls.set(VS);
    if (linked()) { const s = {}; SHARED.forEach(k => { s[k] = VS[k]; }); try { NET.conn.send({ t: 'state', s }); } catch (e) { /* closed */ } }
  }
  function onMsg(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello' && NET.role === 'host') { if (m.name) VS.names[1] = String(m.name).slice(0, 20); push(); route(); return; }
    if (m.t === 'state' && m.s) { SHARED.forEach(k => { if (k in m.s) VS[k] = m.s[k]; }); ls.set(VS); route(); }
    if (m.t === 'react' && REACTS.indexOf(m.r) >= 0) bubble(m.r, String(m.name || '').slice(0, 20), false);
    if (m.t === 'chat' && m.text) { addChat({ name: String(m.name || '').slice(0, 20), text: String(m.text).slice(0, 300), mine: false }); }
  }
  function wire(c) {
    NET.conn = c;
    c.on('open', () => { NET.status = 'connected'; NET.err = ''; if (NET.role === 'guest') c.send({ t: 'hello', name: VS.names[1] || '' }); else push(); route(); drawChat(); });
    c.on('data', onMsg);
    c.on('close', () => { NET.status = 'lost'; route(); drawChat(); });
    c.on('error', () => { NET.status = 'lost'; route(); });
  }
  function hangUp() {
    try { if (NET.conn) NET.conn.close(); } catch (e) { /* gone */ }
    try { if (NET.peer) NET.peer.destroy(); } catch (e) { /* gone */ }
    Object.assign(NET, { role: null, code: '', status: '', err: '', peer: null, conn: null });
  }
  const CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 5 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join('');
  function host() {
    hangUp();
    Object.assign(NET, { role: 'host', code: newCode(), status: 'starting' });
    route();
    loadPeer().then(() => {
      const peer = new window.Peer('a13vs-' + NET.code);
      NET.peer = peer;
      peer.on('open', () => { NET.status = 'waiting'; route(); });
      peer.on('connection', c => { if (linked()) { c.close(); return; } wire(c); });
      peer.on('error', e => { if (e && e.type === 'unavailable-id') { host(); return; } NET.status = 'error'; NET.err = (e && e.message) || 'The connection failed.'; route(); });
    }).catch(e => { NET.status = 'error'; NET.err = e.message; route(); });
  }
  function join(code) {
    hangUp();
    Object.assign(NET, { role: 'guest', code: String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), status: 'connecting' });
    route();
    loadPeer().then(() => {
      const peer = new window.Peer();
      NET.peer = peer;
      peer.on('open', () => wire(peer.connect('a13vs-' + NET.code, { reliable: true })));
      peer.on('error', e => { NET.status = 'error'; NET.err = e && e.type === 'peer-unavailable' ? 'No game with that code. Check it with your friend.' : (e && e.message) || 'The connection failed.'; route(); });
    }).catch(e => { NET.status = 'error'; NET.err = e.message; route(); });
  }
  const joinLink = () => location.origin + location.pathname + '#/challenge/vs/join/' + NET.code;
  function netBar() {
    if (!online()) return '';
    const st = NET.status, other = NET.role === 'host' ? who(1) : who(0);
    const msg = st === 'connected' ? `Connected with <b>${esc(other)}</b>. You are ${esc(who(me()))}.`
      : st === 'waiting' ? `Room <b>${esc(NET.code)}</b>: send your friend the link, then wait here.`
      : st === 'connecting' || st === 'starting' ? 'Connecting...'
      : st === 'code' ? 'Type the room code your friend sees on his phone.'
      : st === 'lost' ? 'The connection dropped.' : esc(NET.err || 'Not connected.');
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
      if (linked()) try { NET.conn.send({ t: 'react', r, name }); } catch (e) { /* closed */ }
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
        try { NET.conn.send({ t: 'chat', text, name }); } catch (err) { /* closed */ }
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
    if (C.loaded(year)) { fn(); return; }
    app.innerHTML = `<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING THE ${esc(lbl(year))} ROSTERS...</div></section>`;
    C.load(year).then(fn).catch(e => { app.innerHTML = UI.empty('ROSTERS DID NOT LOAD', esc(e.message || e), '<div class="row-btns"><a class="btn" href="#/challenge">BACK</a></div>'); });
  }

  // ---------- setup ----------
  function setup(app) {
    stopTick();
    loadThen(app, VS.year, () => {
      const d = C.seasonData(VS.year), teams = d.teams.slice().sort((a, b) => tName(a).localeCompare(tName(b)));
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
          <div class="ch-step"><div class="ch-step-k">2 | THE SEASON</div><div class="ch-chips ch-swipe">${C.SEASONS.map(s => `<button type="button" class="ch-chip${VS.year === s.year ? ' on' : ''}" data-year="${s.year}"${dis(boss)}>${esc(s.label)}</button>`).join('')}</div></div>
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
  function playerRow(p, teams, btn, blind) {
    const t = tOf(teams, p.team);
    return `<li class="ch-pl"><span class="ch-pl-b"><b>${esc(p.name)}</b><small>${logo(t, 18)} ${esc(C.posLabel(p))}${p.age ? ' | ' + p.age : ''}</small></span>${ovrTag(p, blind)}${btn}</li>`;
  }
  function spinFor(cfg, d, taken, avoid) {
    const left = d.teams.filter(t => d.players.some(p => p.team === t.abbr && taken.indexOf(p.id) < 0));
    let pool = left.filter(t => VS.spun.indexOf(t.abbr) < 0 && t.abbr !== avoid);
    if (!pool.length) pool = left.filter(t => t.abbr !== avoid);
    if (!pool.length) pool = left;
    const t = pool[Math.floor(Math.random() * pool.length)];
    return t ? { abbr: t.abbr, year: cfg.year, key: cfg.year + ':' + t.abbr, side: C.vsOnClock(cfg), pick: taken.length, n: Date.now() + '-' + Math.floor(Math.random() * 1e6) } : null;
  }
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
      const d = C.seasonData(cfg.year), teams = d.teams, byId = {};
      d.players.concat(d.free).forEach(p => { byId[p.id] = p; });
      const blind = !!cfg.blind;
      const taken = cfg.sides[0].picks.concat(cfg.sides[1].picks), on = C.vsOnClock(cfg);
      const fives = cfg.sides.map((sd, i) => {
        const t = tOf(teams, sd.team), mine = sd.picks.map(id => byId[id]).filter(Boolean);
        return `<div class="vs-side${on === i ? ' on' : ''}" style="--c1:${esc(t.colors[0])}"><div class="vs-side-h">${logo(t, 36)}<div><small>${esc(who(i))}${me() === i ? ' (YOU)' : ''}</small><b>${esc(sd.name || tName(t))}</b></div></div>
          <ol>${[0, 1, 2, 3, 4].map(k => `<li>${mine[k] ? esc(mine[k].name) + ' <small class="muted">' + esc(C.posLabel(mine[k])) + '</small>' + (blind ? '' : ' <b class="' + UI.ovrClass(mine[k].ovr) + '">' + esc(mine[k].ovr) + '</b>') : '<span class="muted">-</span>'}</li>`).join('')}</ol></div>`;
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
      } else {
        const t = tOf(teams, spin.abbr);
        const ros = UI.challengeAlpha(d.players.filter(p => p.team === spin.abbr && taken.indexOf(p.id) < 0));
        body = `<div class="vs-clock">ON THE CLOCK: <b>${esc(who(on))}</b> <span class="muted">(pick ${taken.length + 1} of 10)</span></div>
          <section class="ch-landed" style="--c1:${esc(t.colors[0])}">${logo(t, 64)}<div><div class="ch-wheel-k">THE WHEEL SAYS</div><div class="ch-landed-t">${esc(tName(t))}</div></div>
            ${mine && VS.respins[on] > 0 ? '<button type="button" class="btn btn-small" id="chRespin">RE-SPIN (1 LEFT)</button>' : ''}</section>
          ${mine ? '' : `<p class="muted">${esc(who(on))} is picking from the ${esc(t.name)}.</p>`}
          <ul class="ch-list">${ros.map(p => playerRow(p, teams, mine ? `<button type="button" class="btn btn-small btn-gold" data-add="${esc(p.id)}">TAKE</button>` : '', blind)).join('')}</ul>`;
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
          if (turn.phase === 'spin' && !VS.spin) { const s2 = spinFor(cfg, d, taken, null); if (s2) { VS.spin = s2; VS.spun = VS.spun.concat([s2.abbr]); VS.turn = turnFor(cfg, taken.length, 'pick'); push(); draft(app); } }
          else if (turn.phase === 'pick' && VS.spin && VS.spin.pick === taken.length) {
            const pool = d.players.filter(p => p.team === VS.spin.abbr && taken.indexOf(p.id) < 0).sort((a, b) => b.ovr - a.ovr);
            if (pool[0]) { VS.cfg.sides[on].picks.push(pool[0].id); VS.spin = null; VS.turn = turnFor(cfg, taken.length + 1, 'spin'); push(); UI.toast('Time: ' + who(on) + ' gets ' + pool[0].name + '.'); draft(app); }
          }
        };
        TICK = setInterval(tick, 250);
        tick();
      }
      UI.$('#vsSetup', app).addEventListener('click', () => go('setup'));
      // a new spin on either phone: both animate it
      if (spin && !ANIM[spin.n]) {
        UI.challengeWheel.animate(app, teams, () => { ANIM[spin.n] = true; if (VS.spin && VS.spin.n === spin.n) draft(app); }, { year: spin.year, abbr: spin.abbr }, { mode: 'versus' });
      }
      const sp = UI.$('#chSpin', app);
      if (sp) sp.addEventListener('click', () => {
        const s = spinFor(cfg, d, taken, null);
        if (!s) return;
        VS.spin = s; VS.spun = VS.spun.concat([s.abbr]); VS.turn = turnFor(cfg, taken.length, 'pick'); push(); draft(app);
      });
      const re = UI.$('#chRespin', app);
      if (re) re.addEventListener('click', () => {
        if (!(VS.respins[on] > 0)) return;
        const s = spinFor(cfg, d, taken, spin && spin.abbr);
        if (!s) return;
        VS.respins = VS.respins.slice(); VS.respins[on]--;
        VS.spin = s; VS.spun = VS.spun.concat([s.abbr]); VS.turn = turnFor(cfg, taken.length, 'pick'); push(); draft(app);
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
  function series(app) {
    stopTick();
    const cfg = VS.cfg;
    if (!cfg || C.vsOnClock(cfg) >= 0) { go(cfg ? 'draft' : 'setup'); return; }
    loadThen(app, cfg.year, () => {
      let r;
      try { r = runFor(cfg); } catch (e) { app.innerHTML = UI.empty('COULD NOT PLAY IT', esc(e.message || e), '<div class="row-btns"><a class="btn" href="#/challenge/vs">BACK</a></div>'); return; }
      dropCourt();
      const shown = Math.min(r.games.length, VS.shown || 0), done = shown >= r.games.length;
      if (WATCH && WATCH <= shown) WATCH = 0;
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
            ${r.mvp ? `<p>Series MVP: <b>${esc(r.mvp.name)}</b> (${esc(r.mvp.line.pts + ' PTS, ' + r.mvp.line.reb + ' REB, ' + r.mvp.line.ast + ' AST')})</p>` : ''}</div></section>`
        : `<section class="vs-next"><div class="ch-hero-k">BEST OF ${r.bestOf} | ${esc(lbl(cfg.year))}${cfg.blind ? ' | BLIND' : ''}</div><h1>${WATCH ? 'GAME ' + WATCH + ', LIVE' : shown ? 'GAME ' + (shown + 1) + ' IS NEXT' : 'THE SERIES'}</h1>
            <p class="muted">${esc(whoA(r.home))} has home court (${homeGames}). First to ${r.need}. All ten players go the full 48.</p></section>`;
      const games = r.games.slice(0, shown).map(g => {
        const t = g.top && PL[g.top.id];
        return `<li><span class="vs-g-n">GAME ${g.n}</span><span class="vs-g-s"><b class="${g.winner === g.away ? 'w' : ''}">${esc(whoA(g.away))} ${g.as}</b> @ <b class="${g.winner === g.home ? 'w' : ''}">${esc(whoA(g.home))} ${g.hs}</b>${g.ot ? ' <small>(' + (g.ot > 1 ? g.ot : '') + 'OT)</small>' : ''}</span>${t ? `<small class="muted">${esc(t.name)}: ${g.top.pts} pts, ${g.top.reb} reb, ${g.top.ast} ast</small>` : ''}
          <button type="button" class="btn btn-small vs-rewatch" data-rewatch="${g.n}">WATCH</button></li>`;
      }).join('');
      const box = done ? `<section class="vs-box">${UI.header('SERIES BOX', 'Per game')}<div class="vs-sides">${S.map((sd, i) => `<div class="vs-res" style="--c1:${esc((sd.team.colors || ['#333'])[0])}"><div class="vs-side-h">${logo(sd.team, 32)}<div><small>${esc(who(i))}</small><b>${esc(nm(i))}</b></div></div>
          <table class="vs-tbl"><thead><tr><th class="l">PLAYER</th><th>SPOT</th><th>OVR</th><th>PTS</th><th>REB</th><th>AST</th><th>FG%</th></tr></thead><tbody>${sd.five.slice().sort((a, b) => C.SLOTS.indexOf(a.slot) - C.SLOTS.indexOf(b.slot)).map(p => { const l = r.lines[p.id] || {}; return `<tr><td class="l">${esc(p.name)}</td><td>${esc(p.slot || '')}</td><td>${esc(p.ovr)}</td><td>${l.pts != null ? l.pts : '-'}</td><td>${l.reb != null ? l.reb : '-'}</td><td>${l.ast != null ? l.ast : '-'}</td><td>${l.fgp != null ? l.fgp : '-'}</td></tr>`; }).join('')}</tbody></table></div>`).join('')}</div></section>` : '';
      const next = shown + 1;
      const acts = done
        ? `<button type="button" class="btn btn-share" id="vsShare">${UI.shareIcon || ''}SEND THIS TO YOUR FRIENDS</button><button type="button" class="btn btn-gold" id="vsAgain">RUN IT BACK</button><button type="button" class="btn" id="vsNew">NEW MATCHUP</button>`
        : WATCH ? `<button type="button" class="btn btn-gold" id="vsFinal">SKIP TO THE FINAL</button>`
        : `<button type="button" class="btn btn-gold btn-big" id="vsWatch">WATCH GAME ${next}</button><button type="button" class="btn" id="vsNext">SIM GAME ${next}</button><button type="button" class="btn" id="vsAll">SIM THE REST</button>`;
      app.innerHTML = `${head}${netBar()}${score}
        ${WATCH ? '<div class="ct-host" id="vsCourt"></div>' : ''}
        <div class="row-btns center ch-acts">${acts}</div>
        ${games ? `<ol class="vs-glist">${games}</ol>` : ''}
        ${box}
        ${done ? `<div class="vs-fits">${S.map((sd, i) => UI.challengeFit(sd.fit, { compact: true, title: (who(i) + "'s lineup").toUpperCase() })).join('')}</div>` : ''}${reactBar()}`;
      bindNet(app); bindReact(app);
      const reveal = n => { WATCH = 0; dropCourt(); VS.shown = Math.max(VS.shown || 0, n); push(); series(app); window.scrollTo(0, 0); };
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
      if ($('#vsWatch')) $('#vsWatch').addEventListener('click', () => watch(next));
      if ($('#vsNext')) $('#vsNext').addEventListener('click', () => reveal(next));
      if ($('#vsAll')) $('#vsAll').addEventListener('click', () => reveal(r.games.length));
      if ($('#vsFinal')) $('#vsFinal').addEventListener('click', () => reveal(WATCH));
      app.querySelectorAll('[data-rewatch]').forEach(b => b.addEventListener('click', () => {
        const n = +b.dataset.rewatch, g = r.games[n - 1], el = document.createElement('div');
        dropCourt(); el.className = 'ct-host'; b.closest('li').after(el);
        courtCtl = window.COURT && window.COURT.available(g.res) ? window.COURT.mount(el, { game: g.res, start: 0, autoplay: true, team: a => S[idx(a)].team, player: id => PL[id] || null, logo: (a, size) => logo(S[idx(a)].team, size) }) : null;
        if (!courtCtl) el.innerHTML = '<p class="muted">The court view did not load.</p>';
      }));
      if ($('#vsAgain')) $('#vsAgain').addEventListener('click', () => { VS.cfg.seed = Math.floor(Math.random() * 2147483646) + 1; VS.shown = 0; WATCH = 0; push(); series(app); window.scrollTo(0, 0); });
      if ($('#vsShare')) $('#vsShare').addEventListener('click', () => {
        const wi = idx(r.winner), li = 1 - wi, ws = r.wins[r.winner] + '-' + r.wins[S[li].abbr];
        const spec = { kicker: 'VERSUS | BEST OF ' + r.bestOf + ' | ' + lbl(cfg.year), title: who(wi).toUpperCase() + ' WINS', big: ws, gold: true,
          banner: r.mvp ? 'SERIES MVP: ' + r.mvp.name.toUpperCase() : '', colors: S[wi].team.colors, logo: S[wi].team.logo,
          lines: [[who(0).slice(0, 8).toUpperCase(), S[0].five.map(p => p.name.split(' ').pop()).join(', ')], [who(1).slice(0, 8).toUpperCase(), S[1].five.map(p => p.name.split(' ').pop()).join(', ')]] };
        const mv = r.mvp ? ` ${r.mvp.name} was the MVP with ${Math.round(r.mvp.line.pts)} a game.` : '';
        const lost = r.wins[S[li].abbr], close = r.games.slice().sort((x, y) => Math.abs(x.hs - x.as) - Math.abs(y.hs - y.as))[0];
        const how = lost === 0 ? `🧹 ${who(wi)} swept ${who(li)} ${ws}` : r.games.length === r.bestOf ? `🏀 ${who(wi)} beat ${who(li)} ${ws}, all the way to a deciding game` : `🏀 ${who(wi)} beat ${who(li)} ${ws}`;
        const nail = close && Math.abs(close.hs - close.as) <= 3 ? ` Game ${close.n} came down to ${Math.abs(close.hs - close.as)}.` : '';
        const five = S[wi].five.map(p => p.name.split(' ').pop()).join(', ');
        const end = [`${who(li)} wants a rematch. Spin your own:`, `${who(li)} is already asking for game 2. Spin your own:`, `Think you can draft better? Spin your own:`][Math.floor(Math.random() * 3)];
        const text = `${how} in a ${lbl(cfg.year)} versus draft. Winning five: ${five}.${mv}${nail} ${end}`;
        UI.shareResult(spec, text, location.origin + location.pathname + '#/challenge/vs', 'versus');
      });
      if ($('#vsNew')) $('#vsNew').addEventListener('click', () => { VS.cfg = null; VS.shown = 0; go('setup'); });
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
