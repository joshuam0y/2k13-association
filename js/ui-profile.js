// Accounts for the multiplayer modes (Supabase): email and password, a username that is unique across everyone and
// that you can change any time, and friends with online status and room invites.
// The page keeps the username in localStorage so UI.profile.name() stays instant; the account is the source of truth.
// The key below is the public (publishable) one. What each person can read or change is set by the table rules in Supabase.
(function () {
  const SB_URL = 'https://feozimahsjhnvlqlkwyh.supabase.co', SB_KEY = 'sb_publishable_IejaVhDl93-NonWwHdeeIA_zBRDGXv9';
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  const KEY = 'a13-profile', GUEST = 'a13-guest', OLD = 'a13-tn-name', ROOMS = ['a13-tn-host', 'a13-tn-room', 'a13-vs-room', 'a13-vs-host'];
  const rd = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const del = k => { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // usernames: 3 to 16 letters, numbers, underscore or hyphen. No spaces, no symbols.
  const OKNAME = /^[A-Za-z0-9_-]{3,16}$/;
  const hasToken = () => { try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^sb-.*-auth-token$/.test(k)) return true; } } catch (e) { /* none */ } return false; };
  const fire = () => { try { window.dispatchEvent(new Event('a13-profile')); } catch (e) { /* old browser */ } };

  const FRC = {};   // friend states looked up lately
  let sb = null, loading = null, USER = null, ONLINE = {}, PRES = null, INV = null;
  const WIRED = { fn: null };

  const P = {
    // your username, instantly: kept on this device while you are signed in to an account
    account() { return hasToken() ? String(rd(KEY) || '') : ''; },
    // the name you play under: your account's, or the guest name you typed (a room code is enough to play, no account needed)
    name() { return P.account() || String(rd(GUEST) || ''); },
    isGuest() { return !P.account() && !!P.name(); },
    signedIn() { return !!P.account(); },
    canPlay() { return !!P.name(); },
    setGuest(v) { v = String(v || '').trim(); const bad = P.check(v); if (bad) return bad; wr(GUEST, v); fire(); return ''; },
    email() { return USER ? USER.email : ''; },
    // '' when the name is allowed, else what is wrong with it
    check(v) {
      v = String(v || '').trim();
      if (!OKNAME.test(v)) return v ? '3 to 16 letters, numbers, _ or -. No spaces or symbols.' : 'Type a username first.';
      const flat = v.toLowerCase().replace(/[_-]/g, '').replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a').replace(/[5$]/g, 's');
      if (/(fuck|shit|bitch|cunt|nigg|fagg|slut|whore|rape|nazi|hitler|retard)/.test(flat)) return 'That username is not allowed. Pick another.';
      if (/(admin|moderator|support|staff|joshuamoy|joshuam0y|startingfive)/.test(flat)) return 'That username looks like an official one. Pick another.';
      return '';
    },
    isOnline(n) { return !!ONLINE[String(n || '').toLowerCase()]; },
    signOut() {
      del(KEY); del(OLD); ROOMS.forEach(del);
      const done = () => { USER = null; stopSocial(); fire(); };
      if (sb) sb.auth.signOut().then(done, done);
      else { try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k); } } catch (e) { /* none */ } done(); }
    },
    // the card for the top of a multiplayer screen
    bar() {
      const n = P.account(), g = P.name();
      if (n) return `<div class="ch-step pf-bar"><div class="ch-step-k">SIGNED IN</div><div class="pf-row"><span class="pf-who">${esc(n)}</span><button type="button" class="btn btn-small" data-pf="open">ACCOUNT AND FRIENDS</button></div></div>`;
      return `<div class="ch-step pf-bar"><div class="ch-step-k">${g ? 'PLAYING AS GUEST' : 'YOUR NAME FOR ONLINE PLAY'}</div><div class="pf-row"><label class="field"><span>NAME</span><input id="pfGuest" maxlength="16" placeholder="3 to 16 letters or numbers" value="${esc(g)}" autocomplete="off"></label><button type="button" class="btn btn-gold" id="pfGuestGo">${g ? 'RENAME' : 'PLAY AS GUEST'}</button></div><div class="pf-row"><span class="muted">No account needed to play with a room code. Sign in to keep your name and add friends.</span><button type="button" class="btn btn-small" data-pf="open">SIGN IN OR CREATE ACCOUNT</button></div><p class="muted pf-err" id="pfGuestErr" hidden></p></div>`;
    },
    // makes the bar work; onChange() runs after a sign in, a sign out or a rename
    wire(root, onChange) {
      const b = root.querySelector('[data-pf="open"]');
      root.querySelectorAll('[data-pf="open"]').forEach(x => x.addEventListener('click', () => openPanel()));
      const gi = root.querySelector('#pfGuest'), gb = root.querySelector('#pfGuestGo');
      if (gi && gb) {
        const go = () => { const bad = P.setGuest(gi.value); const e = root.querySelector('#pfGuestErr'); if (e) { e.hidden = !bad; e.textContent = bad; } };
        gb.addEventListener('click', go);
        gi.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      }
      if (WIRED.fn) window.removeEventListener('a13-profile', WIRED.fn);
      WIRED.fn = () => { if (onChange && root.isConnected) onChange(); };
      window.addEventListener('a13-profile', WIRED.fn);
    },
    open() { openPanel(); },
    // the account service, for the ranked pages: a client (null without a connection) and a call to a database function
    client() { return getClient().then(c => c, () => null); },
    async rpc(name, args) {
      const c = await getClient();
      const r = await c.rpc(name, args || {});
      if (r.error) throw r.error;
      return r.data;
    },
    userId() { return USER ? USER.id : null; },
    // how you stand with a player in a room, by username: 'guest' (no account), 'self', 'friends', 'sent', 'incoming' or 'none'
    async friendState(name) {
      if (!P.account() || !name) return 'guest';
      const key = String(name).toLowerCase(), hit = FRC[key];
      if (hit && Date.now() - hit.at < 20000) return hit.st;
      const c = await getClient();
      if (!USER) return 'guest';
      const f = await c.from('profiles').select('id,username').ilike('username', String(name).replace(/[_%\\]/g, '\\$&')).maybeSingle();
      let st = 'guest';
      if (f.data) {
        if (f.data.id === USER.id) st = 'self';
        else {
          const r = await c.from('friendships').select('requester,addressee,status');
          const row = (r.data || []).filter(x => (x.requester === f.data.id && x.addressee === USER.id) || (x.requester === USER.id && x.addressee === f.data.id))[0];
          st = !row ? 'none' : row.status === 'accepted' ? 'friends' : row.requester === USER.id ? 'sent' : 'incoming';
        }
      }
      FRC[key] = { st, at: Date.now() };
      return st;
    },
    // removes a friend, or cancels a request you sent (or declines theirs): the row between the two of you goes
    async removeFriend(name) {
      const c = await getClient(), key = String(name).toLowerCase();
      delete FRC[key];
      const f = await c.from('profiles').select('id').ilike('username', String(name).replace(/[_%\\]/g, '\\$&')).maybeSingle();
      if (!f.data || !USER) return false;
      const r = await c.from('friendships').select('id').or('and(requester.eq.' + USER.id + ',addressee.eq.' + f.data.id + '),and(requester.eq.' + f.data.id + ',addressee.eq.' + USER.id + ')').limit(1);
      if (r.error || !r.data || !r.data.length) return false;
      const d = await c.from('friendships').delete().eq('id', r.data[0].id);
      delete FRC[key];
      return !d.error;
    },
    // sends a friend request (or accepts theirs); returns the new state
    async addFriend(name) {
      const c = await getClient(), key = String(name).toLowerCase();
      delete FRC[key];
      const f = await c.from('profiles').select('id,username').ilike('username', String(name).replace(/[_%\\]/g, '\\$&')).maybeSingle();
      if (!f.data || !USER) return 'guest';
      const theirs = await c.from('friendships').select('id').eq('requester', f.data.id).eq('addressee', USER.id).maybeSingle();
      if (theirs.data) { await c.from('friendships').update({ status: 'accepted' }).eq('id', theirs.data.id); delete FRC[key]; return 'friends'; }
      const r = await c.from('friendships').insert({ requester: USER.id, addressee: f.data.id });
      delete FRC[key];
      return r.error && r.error.code !== '23505' ? 'none' : 'sent';
    }
  };
  window.UI = window.UI || {};
  UI.profile = P;

  // coming back from an email link (the address is in the page link until the account service reads it): say what just happened
  const ARR = (String(location.hash).match(/type=(signup|email_change)/) || [])[1] || '';
  let ARRSHOWN = false;
  function welcome() {
    if (!ARR || ARRSHOWN) return; ARRSHOWN = true;
    const nm = P.account() || '', chg = ARR === 'email_change';
    const ov = document.createElement('div'); ov.className = 'rk-tour';
    ov.innerHTML = `<div class="rk-tour-b"><small>STARTING FIVE</small><h2 class="rk-pop-n" style="font-size:40px !important">${chg ? 'EMAIL UPDATED' : 'EMAIL CONFIRMED'}</h2><p>${chg ? 'Your account now uses the new address.' : 'You are signed in' + (nm ? ' as <b>' + esc(nm) + '</b>' : '') + '. Welcome to Starting Five.'}</p><div class="rk-tour-go"><a class="btn btn-gold btn-big" href="#/daily" id="wlGo">${chg ? 'BACK TO THE GAME' : "PLAY TODAY'S DAILY"}</a><button type="button" class="btn" id="wlClose">CLOSE</button></div></div>`;
    document.body.appendChild(ov);
    const shut = () => ov.remove();
    ov.querySelector('#wlClose').addEventListener('click', shut); ov.querySelector('#wlGo').addEventListener('click', shut);
    if (window.SFX) try { window.SFX.play('chime'); } catch (e) { /* silent */ }
  }

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
            if (USER && (evt === 'SIGNED_IN' || evt === 'INITIAL_SESSION' || evt === 'USER_UPDATED')) setTimeout(() => syncProfile().then(startSocial).then(() => { if (ARR) welcome(); }), 0);
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
    const me = P.account();
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

    // a password box with a SHOW button; ac is the autocomplete hint so password managers fill and save it
    const pw = (id, label, ac) => `<label class="field"><span>${label}</span><span class="pf-pw"><input id="${id}" type="password" autocomplete="${ac}" autocapitalize="off" spellcheck="false"><button type="button" class="btn btn-small" data-show="${id}">SHOW</button></span></label>`;
    const wireShow = () => el.querySelectorAll('[data-show]').forEach(b => b.addEventListener('click', () => { const i = el.querySelector('#' + b.dataset.show), on = i.type === 'password'; i.type = on ? 'text' : 'password'; b.textContent = on ? 'HIDE' : 'SHOW'; }));
    const WEAK = /^(password|passw0rd|12345678|123456789|1234567890|qwertyui|qwerty123|iloveyou|11111111|00000000|abcd1234|basketball|nbanbanba)$/i;
    const pwBad = v => !v || v.length < 8 ? 'The password needs at least 8 characters.' : WEAK.test(v) ? 'That password is too easy to guess. Pick something else.' : '';
    // a button that counts down so nobody hammers the email limit
    const cool = (btn, label, secs) => {
      let n = secs; btn.disabled = true;
      const t = setInterval(() => { if (!btn.isConnected) { clearInterval(t); return; } n--; if (n <= 0) { clearInterval(t); btn.disabled = false; btn.textContent = label; } else btn.textContent = label + ' (' + n + 's)'; }, 1000);
      btn.textContent = label + ' (' + n + 's)';
    };
    const nice = e => { const m = String((e && e.message) || e);
      return /Invalid login/i.test(m) ? 'Wrong email or password.' : /not confirmed/i.test(m) ? 'Confirm your email first: open the link we sent you.' : /already registered|already been registered/i.test(m) ? 'That email already has an account. Sign in instead.' : /rate limit|too many|security purposes/i.test(m) ? 'Too many emails sent for now. Wait a minute or two and try again.' : /fetch|network|failed to/i.test(m) ? 'Could not reach the account service. Check your connection.' : /same.*password|different from the old/i.test(m) ? 'Pick a password you have not used before.' : /reauth|recently/i.test(m) ? 'For safety, sign out, sign in again, then change your password.' : m; };
    const back = '<button type="button" class="btn" data-t="in">BACK</button>';
    // after sign up: the email is on its way. Resend, fix a typo, or just wait: confirming in any tab signs you in here.
    function waiting(em, pw) {   // pw only lives in this closure: it signs this screen in once the link has been opened on any device
      card(`<div class="pf-card-k">CHECK YOUR EMAIL</div><p class="muted">We sent a link to <b>${esc(em)}</b>. Open it on any device: this screen signs you in by itself once you do. It can take a minute, and it may land in spam.</p>
        <div class="row-btns"><button type="button" class="btn btn-gold" id="pfResend">RESEND EMAIL</button><button type="button" class="btn" data-t="up">WRONG EMAIL</button>${closeBtn}</div>`);
      wireClose();
      el.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => auth(b.dataset.t)));
      const rs = el.querySelector('#pfResend');
      cool(rs, 'RESEND EMAIL', 60);
      rs.addEventListener('click', async () => {
        try {
          const c = await getClient();
          const r = await c.auth.resend({ type: 'signup', email: em, options: { emailRedirectTo: location.origin + location.pathname } });
          if (r.error) throw r.error;
          say('Sent again to ' + em + '.'); cool(rs, 'RESEND EMAIL', 60);
        } catch (e) { say(nice(e), true); rs.disabled = false; }
      });
      const done = () => { if (P.account() && el.isConnected && el.querySelector('#pfResend')) { window.removeEventListener('a13-profile', done); account(); } };
      window.addEventListener('a13-profile', done);
      if (pw) {   // the link may be opened on another device (the phone): keep trying to sign in here until the email counts as confirmed
        let tries = 0;
        const poll = setInterval(async () => {
          if (!el.isConnected || !el.querySelector('#pfResend') || P.account() || ++tries > 60) { clearInterval(poll); return; }
          try { const c = await getClient(); const r = await c.auth.signInWithPassword({ email: em, password: pw }); if (!r.error) { clearInterval(poll); const n = await syncProfile(); startSocial(); fire(); if (n) account(); } } catch (e) { /* not confirmed yet */ }
        }, 12000);
      }
    }
    function sentReset(em) {
      card(`<div class="pf-card-k">CHECK YOUR EMAIL</div><p class="muted">If an account uses <b>${esc(em)}</b>, a reset link is on its way. Open it on this device, then choose a new password. The link works once and expires in about an hour. Check spam too.</p>
        <div class="row-btns"><button type="button" class="btn btn-gold" id="pfResend">SEND AGAIN</button>${back}${closeBtn}</div>`);
      wireClose();
      el.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => auth(b.dataset.t)));
      const rs = el.querySelector('#pfResend');
      cool(rs, 'SEND AGAIN', 60);
      rs.addEventListener('click', async () => {
        try {
          const c = await getClient();
          const r = await c.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
          if (r.error) throw r.error;
          say('Sent again.'); cool(rs, 'SEND AGAIN', 60);
        } catch (e) { say(nice(e), true); rs.disabled = false; }
      });
    }

    function auth(tab, keep) {
      tab = tab || 'in'; keep = keep || {};
      const tabs = `<div class="ct-ptabs pf-tabs"><button type="button" class="ct-ptab${tab === 'in' ? ' on' : ''}" data-t="in">SIGN IN</button><button type="button" class="ct-ptab${tab === 'up' ? ' on' : ''}" data-t="up">CREATE ACCOUNT</button></div>`;
      const em0 = esc(keep.email || '');
      const emailF = `<label class="field"><span>EMAIL</span><input id="pfEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" value="${em0}"></label>`;
      if (tab === 'forgot') {
        card(`<div class="pf-card-k">RESET YOUR PASSWORD</div><p class="muted">Type the email you signed up with and we will send you a link to choose a new password.</p>${emailF}<div class="row-btns"><button type="button" class="btn btn-gold" id="pfGo">EMAIL ME A LINK</button>${back}${closeBtn}</div>`);
      } else {
        card(`${tabs}${emailF}${tab === 'up' ? field('pfName', 'USERNAME (3 TO 16 LETTERS, NUMBERS, _ OR -)', 'text', 'maxlength="16"') : ''}${pw('pfPass', 'PASSWORD' + (tab === 'up' ? ' (AT LEAST 8 CHARACTERS)' : ''), tab === 'up' ? 'new-password' : 'current-password')}
          <div class="row-btns"><button type="button" class="btn btn-gold" id="pfGo">${tab === 'up' ? 'CREATE ACCOUNT' : 'SIGN IN'}</button>${tab === 'in' ? '<button type="button" class="btn btn-small" data-t="forgot">FORGOT PASSWORD</button>' : ''}${closeBtn}</div><div id="pfExtra"></div><p class="muted pf-legal">By continuing you agree to the <a href="#/terms">Terms</a> and <a href="#/privacy">Privacy</a>.</p>`);
        wireShow();
      }
      wireClose();
      const go = el.querySelector('#pfGo'), email = el.querySelector('#pfEmail'), pass = el.querySelector('#pfPass'), name = el.querySelector('#pfName');
      el.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => auth(b.dataset.t, { email: email ? email.value.trim() : '' })));
      if (keep.msg) say(keep.msg, keep.bad);
      if (email) { if (email.value) { if (pass) pass.focus(); } else email.focus(); }
      const submit = async () => {
        const em = email.value.trim();
        if (!/^\S+@\S+\.\S+$/.test(em)) { say('Type a real email address.', true); return; }
        if (name) { const err = P.check(name.value.trim()); if (err) { say(err, true); return; } }
        if (pass) { const bad = tab === 'up' ? pwBad(pass.value) : (pass.value ? '' : 'Type your password.'); if (bad) { say(bad, true); return; } }
        busy(go, true); say('One moment...');
        try {
          const c = await getClient();
          if (tab === 'forgot') {
            const { error } = await c.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
            if (error) throw error;
            sentReset(em); return;
          }
          if (tab === 'up') {
            const un = name.value.trim();
            const ok = await c.rpc('username_available', { n: un });
            if (ok.error) throw ok.error;
            if (!ok.data) { say('That username is taken. Pick another.', true); busy(go, false); return; }
            const r = await c.auth.signUp({ email: em, password: pass.value, options: { data: { username: un }, emailRedirectTo: location.origin + location.pathname } });
            if (r.error) throw r.error;
            // a confirmed email signing up again comes back as a fake user with no identities
            if (r.data.user && Array.isArray(r.data.user.identities) && !r.data.user.identities.length) { auth('in', { email: em, msg: 'That email already has an account. Sign in, or tap Forgot password.', bad: true }); return; }
            if (!r.data.session) { waiting(em, pass.value); return; }
            USER = r.data.user; await syncProfile(); startSocial(); fire(); account(); return;
          }
          const r = await c.auth.signInWithPassword({ email: em, password: pass.value });
          if (r.error) throw r.error;
          USER = r.data.user;
          const n = await syncProfile(); startSocial(); fire();
          if (!n) { say('Signed in, but this account has no username yet. Contact the site owner.', true); busy(go, false); return; }
          account();
        } catch (e) {
          say(nice(e), true);
          busy(go, false);
          if (tab === 'in' && /not confirmed/i.test(String((e && e.message) || e))) { const x = el.querySelector('#pfExtra'); if (x) { x.innerHTML = '<button type="button" class="btn btn-small" id="pfRe2">RESEND THE CONFIRMATION EMAIL</button>'; x.querySelector('#pfRe2').addEventListener('click', () => waiting(email.value.trim())); } }
        }
      };
      if (go) go.addEventListener('click', submit);
      el.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') close(); }));
    }

    function recover() {
      card(`<div class="pf-card-k">CHOOSE A NEW PASSWORD</div>${pw('pfPass', 'NEW PASSWORD (AT LEAST 8 CHARACTERS)', 'new-password')}${pw('pfPass2', 'TYPE IT AGAIN', 'new-password')}<div class="row-btns"><button type="button" class="btn btn-gold" id="pfGo">SAVE PASSWORD</button>${closeBtn}</div>`);
      wireClose(); wireShow();
      const go = el.querySelector('#pfGo'), pass = el.querySelector('#pfPass'), p2 = el.querySelector('#pfPass2');
      pass.focus();
      const save = async () => {
        const bad = pwBad(pass.value);
        if (bad) { say(bad, true); return; }
        if (pass.value !== p2.value) { say('The two passwords do not match.', true); return; }
        busy(go, true); say('Saving...');
        const { error } = await sb.auth.updateUser({ password: pass.value });
        if (error) { say(nice(error), true); busy(go, false); return; }
        say('Password saved. You are signed in.'); setTimeout(() => account(), 900);
      };
      go.addEventListener('click', save);
      el.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') save(); }));
    }

    function account(tab) {
      tab = tab || 'me';
      const n = P.account();
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
        <div class="row-btns"><button type="button" class="btn btn-gold" id="pfSave">SAVE USERNAME</button><a class="btn" href="#/me" id="pfMe">MY PROFILE</a><a class="btn" href="#/ranked" id="pfRk">RANKED</a></div>
        <div class="pf-card-k">EMAIL</div><small class="muted">${esc(P.email())} | ${USER && USER.email_confirmed_at ? 'VERIFIED' : 'NOT VERIFIED YET'}</small>
        <label class="field"><span>NEW EMAIL</span><input id="pfNewEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false"></label>
        <div class="row-btns"><button type="button" class="btn" id="pfEm">CHANGE EMAIL</button></div><small class="muted">We send a link to the new address. The email changes once you open it.</small>
        <div class="pf-card-k">CHANGE PASSWORD</div>${pw('pfCur', 'CURRENT PASSWORD', 'current-password')}${pw('pfNew', 'NEW PASSWORD (AT LEAST 8 CHARACTERS)', 'new-password')}<div class="row-btns"><button type="button" class="btn" id="pfPw">CHANGE PASSWORD</button><button type="button" class="btn" id="pfOut">SIGN OUT</button>${closeBtn}</div>`);
      wireClose(); wireShow();
      el.querySelector('#pfPw').addEventListener('click', async e => {
        const nv = el.querySelector('#pfNew'), cu = el.querySelector('#pfCur'), bad = pwBad(nv.value), b = e.currentTarget;
        if (!cu.value) { say('Type your current password first.', true); return; }
        if (bad) { say(bad, true); return; }
        busy(b, true); say('Saving...');
        try {
          const c = await getClient();
          const chk = await c.auth.signInWithPassword({ email: P.email(), password: cu.value });   // the current password has to be right
          if (chk.error) throw new Error('That is not your current password.');
          const r = await c.auth.updateUser({ password: nv.value }); if (r.error) throw r.error; nv.value = ''; cu.value = ''; say('Password changed.');
        } catch (x) { say(nice(x), true); }
        busy(b, false);
      });
      el.querySelector('#pfEm').addEventListener('click', async e => {
        const ne = el.querySelector('#pfNewEmail'), em = ne.value.trim(), b = e.currentTarget;
        if (!/^\S+@\S+\.\S+$/.test(em)) { say('Type a real email address.', true); return; }
        if (em.toLowerCase() === String(P.email()).toLowerCase()) { say('That is already your email.', true); return; }
        busy(b, true); say('Sending...');
        try { const c = await getClient(); const r = await c.auth.updateUser({ email: em }, { emailRedirectTo: location.origin + location.pathname }); if (r.error) throw r.error; ne.value = ''; say('We sent a link to ' + em + '. Open it to finish the change.'); } catch (x) { say(nice(x), true); }
        busy(b, false);
      });
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
      ['#pfMe', '#pfRk'].forEach(q => { const a = el.querySelector(q); if (a) a.addEventListener('click', () => close()); });
    }

    if (view === 'recover') { getClient().then(recover); return; }
    if (view === 'linkbad') { auth('forgot', { msg: 'That link expired or was already used. Enter your email for a fresh one. If you just created your account, try signing in first: it may already be confirmed.', bad: true }); return; }
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
      const li = (x, btns) => `<li><i class="pf-dot ${P.isOnline(names[other(x)]) ? 'on' : ''}"></i><b>${UI.userLink && names[other(x)] ? UI.userLink(names[other(x)]) : esc(names[other(x)] || '?')}</b>${btns}</li>`;
      const room = roomNow();
      box.innerHTML = (inc.length ? `<div class="pf-h">REQUESTS</div><ul>${inc.map(x => li(x, `<button type="button" class="btn btn-small btn-gold" data-acc="${x.id}">ACCEPT</button><button type="button" class="btn btn-small" data-rm="${x.id}">DECLINE</button>`)).join('')}</ul>` : '')
        + `<div class="pf-h">FRIENDS (${fr.length})</div>${fr.length ? `<ul>${fr.sort((a, b) => P.isOnline(names[other(b)]) - P.isOnline(names[other(a)])).map(x => li(x, `${P.isOnline(names[other(x)]) ? '<small class="pf-on">ONLINE</small>' : '<small class="muted">offline</small>'}${room && P.isOnline(names[other(x)]) ? `<button type="button" class="btn btn-small btn-gold" data-inv="${esc(names[other(x)])}">INVITE</button>` : ''}<button type="button" class="btn btn-small" data-rm="${x.id}" title="Remove friend">UNFRIEND</button>`)).join('')}</ul>` : '<p class="muted">No friends yet. Add someone by their exact username.</p>'}`
        + (out.length ? `<div class="pf-h">SENT</div><ul>${out.map(x => li(x, `<small class="muted">waiting</small><button type="button" class="btn btn-small" data-rm="${x.id}">CANCEL</button>`)).join('')}</ul>` : '')
        + (room ? '' : '<p class="muted ch-small">To invite a friend, host a room online first (Head to Head or Tournament), then open this again.</p>');
      box.querySelectorAll('.u-link').forEach(a => a.addEventListener('click', () => { const pnl = document.getElementById('pfPanel'); if (pnl) pnl.remove(); }));
      box.querySelectorAll('[data-acc]').forEach(b => b.addEventListener('click', async () => { b.disabled = true; await c.from('friendships').update({ status: 'accepted' }).eq('id', b.dataset.acc); drawFriends(box); }));
      box.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', async () => {
        if (b.title === 'Remove friend' && !b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'SURE?'; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = 'UNFRIEND'; } }, 4000); return; }   // two taps, so a stray one does not unfriend
        b.disabled = true; await c.from('friendships').delete().eq('id', b.dataset.rm); drawFriends(box);
      }));
      box.querySelectorAll('[data-inv]').forEach(b => b.addEventListener('click', () => sendInvite(b.dataset.inv)));
    } catch (e) { box.textContent = 'Could not load friends: ' + String((e && e.message) || e); }
  }

  // ---------- the account chip in the top bar, on every screen ----------
  function chip() {
    const bar = document.querySelector('.topbar');
    if (!bar || document.getElementById('pfChip')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'pfChip'; b.className = 'pf-chip';
    const paint = () => { const n = P.account(); b.innerHTML = n ? '<small>SIGNED IN</small><b>' + esc(n) + '</b>' : '<b>SIGN IN</b>'; };
    paint();
    bar.insertBefore(b, document.getElementById('userchip') || null);
    window.addEventListener('a13-profile', paint);
    b.addEventListener('click', () => openPanel());
  }
  function boot() {
    chip();
    // an email link that expired or was already used comes back as #error=...&error_code=otp_expired
    const hh = location.hash.replace(/^#/, '');
    if (/error_code=|error_description=/.test(hh)) {
            history.replaceState(null, '', location.pathname + location.search + '#/home');
      setTimeout(() => { openPanel('linkbad'); }, 300);
    }
    // a saved session, or a link from an email (confirm, reset): connect now so it takes effect
    if (hasToken() || /type=(recovery|signup|magiclink)|access_token=/.test(location.hash)) getClient().catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
