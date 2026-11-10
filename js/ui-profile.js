// Sign in for the multiplayer modes: one name, kept on this device, used as your name in every room.
// There is no server, so "signing in" is picking your name once; signing out clears it and the saved rooms.
(function () {
  const KEY = 'a13-profile', OLD = 'a13-tn-name', ROOMS = ['a13-tn-host', 'a13-tn-room', 'a13-vs-room', 'a13-vs-host'];
  const rd = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const del = k => { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clean = v => String(v || '').trim().slice(0, 20);

  const P = {
    name() { return clean(rd(KEY) || rd(OLD) || ''); },
    signedIn() { return !!P.name(); },
    set(v) { v = clean(v); if (v) { wr(KEY, v); wr(OLD, v); } return v; },
    // sign out: forget the name and every saved room, so the next person starts clean
    signOut() { del(KEY); del(OLD); ROOMS.forEach(del); },
    // the card for the top of a multiplayer screen; wire() makes it work and calls onChange() after a sign in or out
    bar() {
      const n = P.name();
      return `<div class="ch-step pf-bar">${n
        ? `<div class="ch-step-k">SIGNED IN</div><div class="pf-row"><span class="pf-who">${esc(n)}</span><button type="button" class="btn btn-small" data-pf="out">SIGN OUT</button></div>`
        : `<div class="ch-step-k">SIGN IN</div><div class="pf-row"><label class="field"><span>YOUR NAME</span><input data-pf-name maxlength="20" placeholder="Pick a name" autocomplete="off"></label><button type="button" class="btn btn-gold" data-pf="in">SIGN IN</button></div>`}</div>`;
    },
    wire(root, onChange) {
      const inn = root.querySelector('[data-pf="in"]'), out = root.querySelector('[data-pf="out"]'), nm = root.querySelector('[data-pf-name]');
      const go = () => { if (!P.set(nm.value)) { if (UI.toast) UI.toast('Type a name first', 'error'); return; } onChange && onChange(); };
      if (inn && nm) { inn.addEventListener('click', go); nm.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); }
      if (out) out.addEventListener('click', () => { P.signOut(); onChange && onChange(); });
    }
  };
  window.UI = window.UI || {};
  UI.profile = P;
})();
