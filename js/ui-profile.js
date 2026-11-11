// Accounts for the multiplayer modes (Supabase): email and password, a username that is unique across everyone and
// that you can change any time, and friends with online status and room invites.
// The page keeps the username in localStorage so UI.profile.name() stays instant; the account is the source of truth.
// The key below is the public (publishable) one. What each person can read or change is set by the table rules in Supabase.
(function () {
  const SB_URL = 'https://feozimahsjhnvlqlkwyh.supabase.co', SB_KEY = 'sb_publishable_IejaVhDl93-NonWwHdeeIA_zBRDGXv9';
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  const KEY = 'a13-profile', OLD = 'a13-tn-name', ROOMS = ['a13-tn-host', 'a13-tn-room', 'a13-vs-room', 'a13-vs-host'];
  const rd = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const del = k => { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // usernames: 3 to 16 letters, numbers, underscore or hyphen. No spaces, no symbols.
  const OKNAME = /^[A-Za-z0-9_-]{3,16}$/;
  const hasToken = () => { try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^sb-.*-auth-token$/.test(k)) return true; } } catch (e) { /* none */ } return false; };
  const fire = () => { try { window.dispatchEvent(new Event('a13-profile')); } catch (e) { /* old browser */ } };

  let sb = null, loading = null, USER = null, ONLINE = {}, PRES = null, INV = null;
  const WIRED = { fn: null };

  const P = {
    // your username, instantly: kept on this device while you are signed in to an account
    name() { return hasToken() ? String(rd(KEY) || '') : ''; },
    signedIn() { return !!P.name(); },
    email() { return USER ? USER.email : ''; },
    // '' when the name is allowed, else what is wrong with it
    check(v) { v = String(v || '').trim(); return OKNAME.test(v) ? '' : v ? '3 to 16 letters, numbers, _ or -. No spaces or symbols.' : 'Type a username first.'; },
    isOnline(n) { return !!ONLINE[String(n || '').toLowerCase()]; },
    signOut() {
      del(KEY); del(OLD); ROOMS.forEach(del);
      const done = () => { USER = null; stopSocial(); fire(); };
      if (sb) sb.auth.signOut().then(done, done);
      else { try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k); } } catch (e) { /* none */ } done(); }
    },
    // the card for the top of a multiplayer screen
    bar() {
      const n = P.name();
      return `<div class="ch-step pf-bar">${n
        ? `<div class="ch-step-k">SIGNED IN</div><div class="pf-row"><span class="pf-who">${esc(n)}</span><button type="button" class="btn btn-small" data-pf="open">ACCOUNT AND FRIENDS</button></div>`
        : `<div class="ch-step-k">SIGN IN TO PLAY ONLINE</div><div class="pf-row"><span class="muted">Create a free account, or sign in. Your username is your name in every room.</span><button type="button" class="btn btn-gold" data-pf="open">SIGN IN OR CREATE ACCOUNT</button></div>`}</div>`;
    },
    // makes the bar work; onChange() runs after a sign in, a sign out or a rename
    wire(root, onChange) {
      const b = root.querySelector('[data-pf="open"]');
      if (b) b.addEventListener('click', () => openPanel());
      if (WIRED.fn) window.removeEventListener('a13-profile', WIRED.fn);
      WIRED.fn = () => { if (onChange && root.isConnected) onChange(); };
      window.addEventListener('a13-profile', WIRED.fn);
    },
    open() { openPanel(); }
  };
  window.UI = window.UI || {};
  UI.profile = P;

  // ---------- the connection ----------
  function getClient() {
    if (sb) return Promise.resolve(sb);
    if (loading) return loading;
    loading = new Promise((res, rej) => {
      const go = () => {
        try {
          sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
          sb.auth.onAuthStateChange((evt, session) => {
            USER = session ? session.user : null;
            if (evt === 'PASSWORD_RECOVERY') setTimeout(() => openPanel('recover'), 0);
            if (USER && (evt === 'SIGNED_IN' || evt === 'INITIAL_SESSION' || evt === 'USER_UPDATED')) setTimeout(() => syncProfile().then(startSocial), 0);
            if (!USER && evt === 'SIGNED_OUT') { del(KEY); del(OLD); stopSocial(); fire(); }
          });
          res(sb);
        } catch (e) { loading = null; rej(e); }
      };
      if (window.supabase && window.supabase.createClient) { go(); return; }
      const s = document.createElement('script');
      s.src = LIB; s.onload = go;
      s.onerror = () => { loading = null; rej(new Error('Could not reach the account service. Check the connection and try again.')); };
      document.head.appendChild(s);
    });
    return loading;
  }
  // the username on the account is the truth: copy it to this device
  async function syncProfile() {
    if (!USER) return '';
    const { data, error } = await sb.from('profiles').select('username').eq('id', USER.id).maybeSingle();
    if (error || !data) return '';
    if (rd(KEY) !== data.username) { wr(KEY, data.username); wr(OLD, data.username); fire(); }
    return data.username;
  }

  // ---------- friends: online status and invites ----------
  function startSocial() {
    const me = P.name();
    if (!sb || !me) return;
    if (!PRES) {
      PRES = sb.channel('sf-online', { config: { presence: { key: me } } });
      PRES.on('presence', { event: 'sync' }, () => { ONLINE = {}; Object.keys(PRES.presenceState()).forEach(k => { ONLINE[k.toLowerCase()] = true; }); const f = document.getElementById('pfFriends'); if (f) drawFriends(f); });
      PRES.subscribe(st => { if (st === 'SUBSCRIBED') PRES.track({ u: me, at: Date.now() }); });
    }
    if (!INV) {
      INV = sb.channel('sf-inv-' + me.toLowerCase());
      INV.on('broadcast', { event: 'invite' }, m => showInvite(m && m.payload));
      INV.subscribe();
    }
  }
  function stopSocial() {
    try { if (PRES) sb.removeChannel(PRES); if (INV) sb.removeChannel(INV); } catch (e) { /* gone */ }
    PRES = null; INV = null; ONLINE = {};
  }
  function roomNow() {
    const R = UI.rooms || {};
    for (const k of ['vs', 'tn']) { const c = R[k] && R[k](); if (c) return { mode: k, code: c }; }
    return null;
  }
  const joinHash = r => (r.mode === 'tn' ? '#/challenge/tournament/join/' : '#/challenge/vs/join/') + r.code;
  function sendInvite(to) {
    const r = roomNow();
    if (!r) { if (UI.toast) UI.toast('Open a room first (Head to Head or Tournament, host online), then invite.', 'error'); return; }
    const ch = sb.channel('sf-inv-' + String(to).toLowerCase());
    ch.subscribe(st => {
      if (st !== 'SUBSCRIBED') return;
      ch.send({ type: 'broadcast', event: 'invite', payload: { from: P.name(), mode: r.mode, code: r.code } }).then(() => { if (UI.toast) UI.toast('Invite sent to ' + to); setTimeout(() => sb.removeChannel(ch), 500); });
    });
  }
  function showInvite(p) {
    if (!p || !p.from || !/^[A-Z0-9]{4,8}$/.test(String(p.code || '')) || (p.mode !== 'vs' && p.mode !== 'tn')) return;
    const old = document.getElementById('pfInvite'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'pfInvite'; el.className = 'pf-invite';
    el.innerHTML = `<span><b>${esc(String(p.from).slice(0, 16))}</b> invites you to ${p.mode === 'tn' ? 'a tournament' : 'Head to Head'}.</span><button type="button" class="btn btn-small btn-gold" id="pfJoin">JOIN</button><button type="button" class="btn btn-small" id="pfNo">NO THANKS</button>`;
    document.body.appendChild(el);
    el.querySelector('#pfNo').addEventListener('click', () => el.remove());
    el.querySelector('#pfJoin').addEventListener('click', () => { el.remove(); location.hash = joinHash(p); });
    setTimeout(() => el.remove(), 60000);
  }

  // ---------- the panel ----------
  const field = (id, label, type, attrs) => `<label class="field"><span>${label}</span><input id="${id}" type="${type}" ${attrs || ''} autocomplete="off" autocapitalize="off" spellcheck="false"></label>`;
  function openPanel(view) {
    let el = document.getElementById('pfPanel');
    if (el) el.remove();
    el = document.createElement('div');
    el.id = 'pfPanel'; el.className = 'pf-panel'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Your account');
    document.body.appendChild(el);
    const onKey = e => { if (e.key === 'Escape') close(); };
    const close = () => { document.removeEventListener('keydown', onKey); el.remove(); };
    document.addEventListener('keydown', onKey);
    // only a click that starts and ends on the dark backdrop closes it: dragging to select text and letting go outside must not
    let down = null;
    el.addEventListener('pointerdown', e => { down = e.target; });
    el.addEventListener('click', e => { if (e.target === el && down === el) close(); down = null; });
    const say = (t, bad) => { const m = el.querySelector('#pfMsg'); if (m) { m.textContent = t; m.className = 'pf-msg' + (bad ? ' bad' : ''); } };
    const busy = (b, on) => { if (b) b.disabled = !!on; };
    const card = html => { el.innerHTML = `<div class="pf-card">${html}<small class="pf-msg" id="pfMsg"></small></div>`; };
    const closeBtn = '<button type="button" class="btn" id="pfClose">CLOSE</button>';
    const wireClose = () => { const c = el.querySelector('#pfClose'); if (c) c.addEventListener('click', close); };

    function auth(tab) {
      tab = tab || 'in';
      const tabs = `<div class="ct-ptabs pf-tabs"><button type="button" class="ct-ptab${tab === 'in' ? ' on' : ''}" data-t="in">SIGN IN</button><button type="button" class="ct-ptab${tab === 'up' ? ' on' : ''}" data-t="up">CREATE ACCOUNT</button></div>`;
      if (tab === 'forgot') {
        card(`<div class="pf-card-k">RESET YOUR PASSWORD</div>${field('pfEmail', 'EMAIL', 'email')}<div class="row-btns"><button type="button" class="btn btn-gold" id="pfGo">EMAIL ME A LINK</button><button type="button" class="btn" data-t="in">BACK</button>${closeBtn}</div>`);
      } else {
        card(`${tabs}${field('pfEmail', 'EMAIL', 'email')}${tab === 'up' ? field('pfName', 'USERNAME (3 TO 16 LETTERS, NUMBERS, _ OR -)', 'text', 'maxlength="16"') : ''}${field('pfPass', 'PASSWORD' + (tab === 'up' ? ' (AT LEAST 8 CHARACTERS)' : ''), 'password')}
          <div class="row-btns"><button type="button" class="btn btn-gold" id="pfGo">${tab === 'up' ? 'CREATE ACCOUNT' : 'SIGN IN'}</button>${tab === 'in' ? '<button type="button" class="btn btn-small" data-t="forgot">FORGOT PASSWORD</button>' : ''}${closeBtn}</div>`);
      }
      wireClose();
      el.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => auth(b.dataset.t)));
      const go = el.querySelector('#pfGo'), email = el.querySelector('#pfEmail'), pass = el.querySelector('#pfPass'), name = el.querySelector('#pfName');
      if (email) email.focus();
      const submit = async () => {
        const em = email.value.trim();
        if (!/^\S+@\S+\.\S+$/.test(em)) { say('Type a real email address.', true); return; }
        busy(go, true); say('One moment...');
        try {
          const c = await getClient();
          if (tab === 'forgot') {
            const { error } = await c.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
            if (error) throw error;
            say('Check your email for the reset link.'); busy(go, false); return;
          }
          if (!pass.value || pass.value.length < 8) { say('The password needs at least 8 characters.', true); busy(go, false); return; }
          if (tab === 'up') {
            const un = name.value.trim(), err = P.check(un);
            if (err) { say(err, true); busy(go, false); return; }
            const ok = await c.rpc('username_available', { n: un });
            if (ok.error) throw ok.error;
            if (!ok.data) { say('That username is taken. Pick another.', true); busy(go, false); return; }
            const r = await c.auth.signUp({ email: em, password: pass.value, options: { data: { username: un }, emailRedirectTo: location.origin + location.pathname } });
            if (r.error) throw r.error;
            if (!r.data.session) { say('Almost there: we emailed you a link. Open it, then sign in here.'); busy(go, false); return; }
            USER = r.data.user; await syncProfile(); startSocial(); fire(); account(); return;
          }
          const r = await c.auth.signInWithPassword({ email: em, password: pass.value });
          if (r.error) throw r.error;
          USER = r.data.user;
          const n = await syncProfile(); startSocial(); fire();
          if (!n) { say('Signed in, but this account has no username yet. Contact the site owner.', true); busy(go, false); return; }
          account();
        } catch (e) {
          const m = String((e && e.message) || e);
          say(/Invalid login/i.test(m) ? 'Wrong email or password.' : /not confirmed/i.test(m) ? 'Confirm your email first: open the link we sent you.' : /already registered|already been registered/i.test(m) ? 'That email already has an account. Sign in instead.' : /rate limit/i.test(m) ? 'Too many emails sent. Wait a few minutes and try again.' : m, true);
          busy(go, false);
        }
      };
      if (go) go.addEventListener('click', submit);
      el.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') close(); }));
    }

    function recover() {
      card(`<div class="pf-card-k">CHOOSE A NEW PASSWORD</div>${field('pfPass', 'NEW PASSWORD (AT LEAST 8 CHARACTERS)', 'password')}<div class="row-btns"><button type="button" class="btn btn-gold" id="pfGo">SAVE PASSWORD</button>${closeBtn}</div>`);
      wireClose();
      const go = el.querySelector('#pfGo'), pass = el.querySelector('#pfPass');
      go.addEventListener('click', async () => {
        if (pass.value.length < 8) { say('The password needs at least 8 characters.', true); return; }
        busy(go, true);
        const { error } = await sb.auth.updateUser({ password: pass.value });
        if (error) { say(error.message, true); busy(go, false); return; }
        say('Password saved.'); setTimeout(() => account(), 800);
      });
    }

    function account(tab) {
      tab = tab || 'me';
      const n = P.name();
      const tabs = `<div class="ct-ptabs pf-tabs"><button type="button" class="ct-ptab${tab === 'me' ? ' on' : ''}" data-t="me">ACCOUNT</button><button type="button" class="ct-ptab${tab === 'fr' ? ' on' : ''}" data-t="fr">FRIENDS</button></div>`;
      if (tab === 'fr') {
        card(`${tabs}<div class="pf-add"><input id="pfFind" maxlength="16" placeholder="Friend's username" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="button" class="btn btn-gold" id="pfAdd">ADD</button></div><div id="pfFriends" class="pf-friends">Loading...</div><div class="row-btns">${closeBtn}</div>`);
        wireClose();
        el.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => account(b.dataset.t)));
        drawFriends(el.querySelector('#pfFriends'));
        const add = el.querySelector('#pfAdd'), find = el.querySelector('#pfFind');
        const doAdd = async () => {
          const un = find.value.trim();
          if (P.check(un)) { say('Type their exact username.', true); return; }
          if (un.toLowerCase() === n.toLowerCase()) { say('That is you.', true); return; }
          busy(add, true);
          try {
            const c = await getClient();
            const f = await c.from('profiles').select('id,username').ilike('username', un.replace(/[_%\\]/g, '\\$&')).maybeSingle();
            if (f.error) throw f.error;
            if (!f.data) { say('Nobody has that username.', true); busy(add, false); return; }
            const theirs = await c.from('friendships').select('id,status').eq('requester', f.data.id).eq('addressee', USER.id).maybeSingle();
            if (theirs.data) { await c.from('friendships').update({ status: 'accepted' }).eq('id', theirs.data.id); say('You are now friends with ' + f.data.username + '.'); }
            else {
              const r = await c.from('friendships').insert({ requester: USER.id, addressee: f.data.id });
              if (r.error) { say(r.error.code === '23505' ? 'You already sent them a request.' : r.error.message, r.error.code !== '23505'); busy(add, false); return; }
              say('Request sent to ' + f.data.username + '.');
            }
            find.value = ''; drawFriends(el.querySelector('#pfFriends'));
          } catch (e) { say(String((e && e.message) || e), true); }
          busy(add, false);
        };
        add.addEventListener('click', doAdd);
        find.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
        return;
      }
      card(`${tabs}<div class="pf-card-k">YOUR USERNAME</div>${field('pfName', 'CHANGE IT ANY TIME', 'text', 'maxlength="16" value="' + esc(n) + '"')}<small class="muted">Signed in as ${esc(P.email())}. Letters, numbers, _ and - only. It has to be one nobody else has.</small>
        <div class="row-btns"><button type="button" class="btn btn-gold" id="pfSave">SAVE USERNAME</button><button type="button" class="btn" id="pfOut">SIGN OUT</button>${closeBtn}</div>`);
      wireClose();
      el.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => account(b.dataset.t)));
      const save = el.querySelector('#pfSave'), inp = el.querySelector('#pfName');
      const doSave = async () => {
        const v = inp.value.trim(), err = P.check(v);
        if (err) { say(err, true); return; }
        if (v === n) { say('That is already your username.'); return; }
        busy(save, true); say('Checking...');
        try {
          const c = await getClient();
          const r = await c.from('profiles').update({ username: v }).eq('id', USER.id);
          if (r.error) { say(r.error.code === '23505' ? 'That username is taken. Pick another.' : r.error.message, true); busy(save, false); return; }
          wr(KEY, v); wr(OLD, v);
          stopSocial(); startSocial();
          fire(); say('Username saved: ' + v + '.');
        } catch (e) { say(String((e && e.message) || e), true); }
        busy(save, false);
      };
      save.addEventListener('click', doSave);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') close(); });
      el.querySelector('#pfOut').addEventListener('click', () => { P.signOut(); close(); });
    }

    if (view === 'recover') { getClient().then(recover); return; }
    if (P.signedIn()) getClient().then(() => account(), () => account()); else auth('in');
  }

  async function drawFriends(box) {
    if (!box || !USER) return;
    try {
      const c = await getClient();
      const r = await c.from('friendships').select('id,requester,addressee,status');
      if (r.error) throw r.error;
      const ids = [...new Set((r.data || []).flatMap(x => [x.requester, x.addressee]))].filter(i => i !== USER.id);
      const names = {};
      if (ids.length) { const p = await c.from('profiles').select('id,username').in('id', ids); (p.data || []).forEach(x => { names[x.id] = x.username; }); }
      const rows = r.data || [], other = x => (x.requester === USER.id ? x.addressee : x.requester);
      const inc = rows.filter(x => x.status === 'pending' && x.addressee === USER.id), out = rows.filter(x => x.status === 'pending' && x.requester === USER.id), fr = rows.filter(x => x.status === 'accepted');
      const li = (x, btns) => `<li><i class="pf-dot ${P.isOnline(names[other(x)]) ? 'on' : ''}"></i><b>${esc(names[other(x)] || '?')}</b>${btns}</li>`;
      const room = roomNow();
      box.innerHTML = (inc.length ? `<div class="pf-h">REQUESTS</div><ul>${inc.map(x => li(x, `<button type="button" class="btn btn-small btn-gold" data-acc="${x.id}">ACCEPT</button><button type="button" class="btn btn-small" data-rm="${x.id}">DECLINE</button>`)).join('')}</ul>` : '')
        + `<div class="pf-h">FRIENDS (${fr.length})</div>${fr.length ? `<ul>${fr.sort((a, b) => P.isOnline(names[other(b)]) - P.isOnline(names[other(a)])).map(x => li(x, `${P.isOnline(names[other(x)]) ? '<small class="pf-on">ONLINE</small>' : '<small class="muted">offline</small>'}${room && P.isOnline(names[other(x)]) ? `<button type="button" class="btn btn-small btn-gold" data-inv="${esc(names[other(x)])}">INVITE</button>` : ''}<button type="button" class="btn btn-small" data-rm="${x.id}" title="Remove friend">REMOVE</button>`)).join('')}</ul>` : '<p class="muted">No friends yet. Add someone by their exact username.</p>'}`
        + (out.length ? `<div class="pf-h">SENT</div><ul>${out.map(x => li(x, `<small class="muted">waiting</small><button type="button" class="btn btn-small" data-rm="${x.id}">CANCEL</button>`)).join('')}</ul>` : '')
        + (room ? '' : '<p class="muted ch-small">To invite a friend, host a room online first (Head to Head or Tournament), then open this again.</p>');
      box.querySelectorAll('[data-acc]').forEach(b => b.addEventListener('click', async () => { b.disabled = true; await c.from('friendships').update({ status: 'accepted' }).eq('id', b.dataset.acc); drawFriends(box); }));
      box.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', async () => { b.disabled = true; await c.from('friendships').delete().eq('id', b.dataset.rm); drawFriends(box); }));
      box.querySelectorAll('[data-inv]').forEach(b => b.addEventListener('click', () => sendInvite(b.dataset.inv)));
    } catch (e) { box.textContent = 'Could not load friends: ' + String((e && e.message) || e); }
  }

  // ---------- the account chip in the top bar, on every screen ----------
  function chip() {
    const bar = document.querySelector('.topbar');
    if (!bar || document.getElementById('pfChip')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'pfChip'; b.className = 'pf-chip';
    const paint = () => { const n = P.name(); b.innerHTML = n ? '<small>SIGNED IN</small><b>' + esc(n) + '</b>' : '<b>SIGN IN</b>'; };
    paint();
    bar.insertBefore(b, document.getElementById('userchip') || null);
    window.addEventListener('a13-profile', paint);
    b.addEventListener('click', () => openPanel());
  }
  function boot() {
    chip();
    // a saved session, or a link from an email (confirm, reset): connect now so it takes effect
    if (hasToken() || /type=(recovery|signup|magiclink)|access_token=/.test(location.hash)) getClient().catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
