// Sign in for the multiplayer modes: one name, kept on this device, used as your name in every room.
// There is no server, so "signing in" is picking your name once; signing out clears it and the saved rooms.
(function () {
  const KEY = 'a13-profile', OLD = 'a13-tn-name', ROOMS = ['a13-tn-host', 'a13-tn-room', 'a13-vs-room', 'a13-vs-host'];
  const rd = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const del = k => { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clean = v => String(v || '').trim().slice(0, 20);
  // usernames: 3 to 16 letters, numbers, underscore or hyphen. No spaces, no symbols.
  const OKNAME = /^[A-Za-z0-9_-]{3,16}$/;

  const P = {
    name() { return clean(rd(KEY) || rd(OLD) || ''); },
    signedIn() { return !!P.name(); },
    // '' when the name is allowed, else what is wrong with it
    check(v) { v = String(v || '').trim(); return OKNAME.test(v) ? '' : v ? '3 to 16 letters, numbers, _ or -. No spaces or symbols.' : 'Type a username first.'; },
    set(v) { v = String(v || '').trim(); if (P.check(v)) return ''; const was = P.name(); wr(KEY, v); wr(OLD, v); if (was !== v) { try { window.dispatchEvent(new Event('a13-profile')); } catch (e) { /* old browser */ } } return v; },
    // sign out: forget the name and every saved room, so the next person starts clean
    signOut() { del(KEY); del(OLD); ROOMS.forEach(del); try { window.dispatchEvent(new Event('a13-profile')); } catch (e) { /* old browser */ } },
    // the card for the top of a multiplayer screen; wire() makes it work and calls onChange() after a sign in or out
    bar() {
      const n = P.name();
      return `<div class="ch-step pf-bar">${n
        ? `<div class="ch-step-k">SIGNED IN</div><div class="pf-row"><span class="pf-who">${esc(n)}</span><button type="button" class="btn btn-small" data-pf="out">SIGN OUT</button></div>`
        : `<div class="ch-step-k">SIGN IN</div><div class="pf-row"><label class="field"><span>YOUR NAME</span><input data-pf-name maxlength="20" placeholder="Pick a name" autocomplete="off"></label><button type="button" class="btn btn-gold" data-pf="in">SIGN IN</button></div>`}</div>`;
    },
    wire(root, onChange) {
      const inn = root.querySelector('[data-pf="in"]'), out = root.querySelector('[data-pf="out"]'), nm = root.querySelector('[data-pf-name]');
      const go = () => { const err = P.check(nm.value); if (err) { if (UI.toast) UI.toast(err, 'error'); return; } P.set(nm.value); onChange && onChange(); };
      if (inn && nm) { inn.addEventListener('click', go); nm.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); }
      if (out) out.addEventListener('click', () => { P.signOut(); onChange && onChange(); });
    }
  };
  window.UI = window.UI || {};
  UI.profile = P;

  // the account chip in the top bar, on every screen: shows your username, change it or sign out from anywhere
  function chip() {
    const bar = document.querySelector('.topbar');
    if (!bar || document.getElementById('pfChip')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'pfChip'; b.className = 'pf-chip';
    const paint = () => { const n = P.name(); b.innerHTML = n ? '<small>SIGNED IN</small><b>' + esc(n) + '</b>' : '<b>SIGN IN</b>'; };
    paint();
    const anchor = document.getElementById('userchip');
    bar.insertBefore(b, anchor || null);
    window.addEventListener('a13-profile', paint);
    b.addEventListener('click', () => {
      if (document.getElementById('pfPanel')) return;
      const n = P.name(), el = document.createElement('div');
      el.id = 'pfPanel'; el.className = 'pf-panel'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Your account');
      el.innerHTML = '<div class="pf-card"><div class="pf-card-k">' + (n ? 'YOUR USERNAME' : 'SIGN IN') + '</div>'
        + '<label class="field"><span>' + (n ? 'CHANGE IT ANY TIME' : 'PICK A USERNAME') + '</span><input id="pfIn" maxlength="16" value="' + esc(n) + '" placeholder="3 to 16 letters or numbers" autocomplete="off" autocapitalize="off" spellcheck="false"></label>'
        + '<small class="muted" id="pfMsg">Letters, numbers, _ and - only. No spaces.</small>'
        + '<div class="row-btns"><button type="button" class="btn btn-gold" id="pfSave">' + (n ? 'SAVE USERNAME' : 'SIGN IN') + '</button>' + (n ? '<button type="button" class="btn" id="pfOut">SIGN OUT</button>' : '') + '<button type="button" class="btn" id="pfClose">CLOSE</button></div></div>';
      document.body.appendChild(el);
      const close = () => el.remove(), inp = el.querySelector('#pfIn'), msg = el.querySelector('#pfMsg');
      inp.focus(); inp.select();
      const save = () => { const err = P.check(inp.value); if (err) { msg.textContent = err; msg.classList.add('bad'); return; } P.set(inp.value); close(); if (UI.toast) UI.toast('Username: ' + P.name()); window.dispatchEvent(new Event('a13-profile')); };
      el.querySelector('#pfSave').addEventListener('click', save);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') close(); });
      const out = el.querySelector('#pfOut'); if (out) out.addEventListener('click', () => { P.signOut(); close(); });
      el.querySelector('#pfClose').addEventListener('click', close);
      el.addEventListener('click', e => { if (e.target === el) close(); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', chip); else chip();
})();
