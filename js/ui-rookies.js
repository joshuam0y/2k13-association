// Rookie signing page (#/rookies): right after the draft, the user's new picks with the deal each
// one signs (DRAFT.signRookies already signed them), and a choice per player: SIGN (the default),
// STASH a second-rounder overseas for a season, or RELEASE him to free agency. Choices are kept on the
// page until CONTINUE applies them through window.ROOKIES (js/rookies.js); leaving the page changes nothing.
// Also wires NEXT (resign phase) and the hub's offseason buttons to this page. Potential is never shown.
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI || !UI.feat) return;
  const P = UI.pages = UI.pages || {};
  const F = UI.feat;
  const esc = UI.esc;

  const RK = () => window.ROOKIES || null;
  const view = { key: null, choices: {} };   // choices: playerId -> 'decline' | 'stash' (missing means sign)
  let current = null;                        // { app, st } while the page is open, for NEXT
  const m2 = n => '$' + ((Number(n) || 0) / 1e6).toFixed(2) + 'M';
  const yrs = n => n + (n === 1 ? ' YR' : ' YRS');
  const season = y => UI.fmtSeasonEnd(y);
  function goTo(h) { if (location.hash !== h) location.hash = h; else UI.route(); window.scrollTo(0, 0); }

  // Where CONTINUE goes, by phase.
  function exitFor(st) {
    if (st.phase === 'resign') return { label: 'CONTINUE TO RE-SIGNING', href: '#/fa' };
    if (st.phase === 'freeAgency') return { label: 'CONFIRM: BACK TO FREE AGENCY', href: '#/fa' };
    return { label: 'CONFIRM: BACK TO THE SEASON', href: '#/season' };
  }

  function rowsOf(st) { const R = RK(); return R ? F.try('ROOKIES.list', () => R.list(st, st.userTeam), []) : []; }
  function choiceOf(r) {
    const c = view.choices[r.id];
    return c === 'decline' || (c === 'stash' && r.canStash) ? c : 'sign';
  }

  function dealCells(st, r, choice) {
    if (r.status === 'stashed') {
      const abroad = !r.away || /overseas/i.test(r.away);
      return `<div class="rk-deal"><small>CONTRACT</small><b class="rk-away">${abroad ? 'OVERSEAS' : 'SITS OUT'}</b><span>${abroad ? 'Until ' + esc(r.until) + '. His deal starts when he comes over' : esc(r.away) + ' until ' + esc(r.until) + '. His deal starts then'}</span></div>
        <div class="rk-hit"><small>CAP HIT ${esc(season(RK().dealYear(st)))}</small><b>$0</b><span>Rights only</span></div>`;
    }
    const opts = r.teamOptions.length ? ', team option' + (r.teamOptions.length > 1 ? 's ' : ' ') + r.teamOptions.map(season).join(' and ') : '';
    return `<div class="rk-deal"><small>CONTRACT</small><b>${yrs(r.years)} | ${m2(r.first)}</b><span>${r.rookieScale ? 'Rookie scale' : 'Minimum deal'}: ${m2(r.total)} total${esc(opts)}</span></div>
      <div class="rk-hit"><small>CAP HIT ${esc(season(r.salaries[0] ? r.salaries[0].year : RK().dealYear(st)))}</small><b>${m2(r.capHit)}</b><span>${choice === 'sign' ? 'Counts this season' : 'Off the books'}</span></div>`;
  }
  function noteFor(r, choice, D) {
    if (choice === 'decline' && r.status === 'stashed') return ['warn', 'You give up his rights. He becomes a free agent when he comes over in ' + r.until + '.'];
    if (choice === 'decline' && r.firstRound) return ['warn', 'Teams almost never let a first-round pick go. He leaves for nothing and any team can sign him.'];
    if (choice === 'decline') return ['', 'He becomes a free agent. No dead money: his deal was never played.'];
    if (choice === 'stash') return ['', 'He plays overseas until ' + (D + 2) + '. You keep his rights, and he signs when he comes over. He does not count against the roster or the cap.'];
    if (r.status === 'stashed') return ['', 'He does not count against your roster or cap while he is away.'];
    return ['', ''];
  }
  function rowHtml(st, r) {
    const p = st.players[r.id], choice = choiceOf(r), D = RK().draftYear(st);
    const btn = (v, label) => `<button type="button" class="k-${v}" data-act="choose" data-id="${esc(r.id)}" data-v="${v}" aria-pressed="${choice === v}">${label}</button>`;
    const btns = r.status === 'stashed' ? btn('sign', 'KEEP RIGHTS') + btn('decline', 'RELEASE')
      : btn('sign', 'SIGN') + (r.canStash ? btn('stash', 'STASH') : '') + btn('decline', 'RELEASE');
    const note = noteFor(r, choice, D);
    return `<li class="rk-row c-${choice}">
      <a class="rk-who" href="#/player/${esc(r.id)}"><span class="ft-hs">${UI.headshot(p)}</span>
        <span class="ft-main"><b class="ft-name">${esc(r.name)}</b><span class="ft-meta"><span class="rk-pk${r.firstRound ? ' r1' : ''}">PICK #${esc(r.pick || '-')}</span>ROUND ${esc(r.round)} | ${esc(r.pos || '-')} | ${esc(r.age || '-')} YRS</span></span>
        <span class="ft-ovr ${UI.ovrClass(r.ovr)}">${esc(r.ovr || '-')}<small>OVR</small></span></a>
      ${dealCells(st, r, choice)}
      <div class="rk-act" role="group" aria-label="${esc('Contract choice for ' + r.name)}">${btns}</div>
      <p class="rk-note${note[0] ? ' ' + note[0] : ''}">${esc(note[1])}</p>
    </li>`;
  }

  function summaryHtml(st, rows) {
    const R = RK(), pv = F.try('ROOKIES.preview', () => R.preview(st, st.userTeam, view.choices), null);
    if (!pv) return '';
    const n = { sign: 0, keep: 0, stash: 0, decline: 0 };
    rows.forEach(r => { const c = choiceOf(r); n[c === 'sign' && r.status === 'stashed' ? 'keep' : c]++; });
    const parts = [n.sign + ' signed'];
    if (n.keep) parts.push(n.keep + ' kept on draft rights');
    if (n.stash) parts.push(n.stash + ' stashed overseas');
    if (n.decline) parts.push(n.decline + ' released');
    const over = pv.roster > pv.maxRoster;
    return `<div class="rk-sum">
        <div class="${over ? 'bad' : ''}"><small>ROSTER</small><b>${pv.roster} / ${pv.maxRoster}</b></div>
        <div><small>PAYROLL</small><b>${m2(pv.payroll)}</b></div>
        <div class="${pv.room > 0 ? 'good' : ''}"><small>CAP ROOM</small><b>${pv.room > 0 ? m2(pv.room) : 'OVER'}</b></div>
      </div>
      <p class="rk-line" aria-live="polite"><b>AFTER YOUR CHOICES:</b> ${esc(parts.join(', '))}. ${pv.roster} player${pv.roster === 1 ? '' : 's'} under contract for ${esc(season(pv.year))}${over ? ' (over 15: you can carry up to 20 this summer)' : ''}, ${pv.room > 0 ? m2(pv.room) + ' in cap room' : m2(pv.payroll - pv.cap) + ' over the cap'}.</p>`;
  }

  function render(app, st) {
    const R = RK(), user = st.userTeam;
    current = { app, st };
    const w = R.windowOf(st), D = R.draftYear(st);
    const key = user + ':' + D;
    if (view.key !== key) { view.key = key; view.choices = {}; }
    const head = UI.header('ROOKIE SIGNING', esc(D + ' draft') + ' | ' + esc(F.phaseName(st.phase)));
    if (!w.open) {
      app.innerHTML = head + UI.empty('ROOKIE SIGNING IS CLOSED', esc(w.reason), `<div class="row-btns center">${UI.pages.draft ? '<a class="btn btn-gold" href="#/draft">DRAFT ROOM</a>' : ''}<a class="btn" href="#/season">SEASON</a></div>`);
      return;
    }
    const rows = rowsOf(st), gone = R.released(st), ex = exitFor(st);
    if (!rows.length) {
      app.innerHTML = head + UI.empty('NO ROOKIES TO SIGN', gone.length ? 'You released every pick you had in this draft.' : 'You did not draft anyone you still hold in the ' + esc(D) + ' draft.',
        `<div class="row-btns center"><button type="button" class="btn btn-gold" data-act="continue">${esc(ex.label)}</button></div>`) + releasedHtml(gone);
    } else {
      app.innerHTML = `${head}
        <section class="rk-head" aria-label="Rookie contracts">
          <div class="rk-team">${UI.logo(user, 48)}<div><div class="ft-k">YOUR ${esc(D)} DRAFT PICKS</div><div class="ft-t">${esc(UI.teamName(user))}</div>
            <p>Every pick signs the deal below unless you release him. Second-round picks can also stay overseas for a season while you keep their rights.</p></div></div>
          ${summaryHtml(st, rows)}
          <div class="rk-btns"><button type="button" class="btn btn-gold" data-act="continue">${esc(ex.label)}</button><button type="button" class="btn" data-act="signall">SIGN ALL</button></div>
        </section>
        <ul class="rk-list">${rows.map(r => rowHtml(st, r)).join('')}</ul>
        ${releasedHtml(gone)}`;
    }

    app.onclick = async ev => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const act = b.getAttribute('data-act');
      if (act === 'choose') {
        const id = b.getAttribute('data-id'), v = b.getAttribute('data-v');
        const r = rowsOf(st).find(x => x.id === id);
        if (!r || choiceOf(r) === v) return;
        if (v === 'decline' && r.firstRound && r.status !== 'stashed') {
          const ans = await UI.choose({ title: 'RELEASE A FIRST-ROUND PICK?', text: 'NBA teams almost never let a first-round pick go. ' + r.name + ' (pick #' + r.pick + ') would become a free agent that any team can sign, and you get nothing back.',
            buttons: [{ value: 'keep', label: 'Keep him', gold: true, note: 'He signs his rookie scale deal' }, { value: 'release', label: 'Release him anyway' }] });
          if (!ans || ans.value !== 'release') return;
        }
        if (v === 'sign') delete view.choices[id]; else view.choices[id] = v;
        render(app, st);
      } else if (act === 'signall') {
        view.choices = {};
        render(app, st);
        UI.toast('Every pick keeps his deal.');
      } else if (act === 'continue') await finish();
    };
  }

  function releasedHtml(gone) {
    if (!gone.length) return '';
    return `${UI.header('RELEASED THIS SUMMER', 'Free agents now. You can still sign them once free agency opens.')}
      <ul class="rk-done">${gone.map(p => `<li><a href="#/player/${esc(p.id)}">${esc(p.name)}</a> | ${esc(p.pos || '')} | ${esc(p.ovr || '-')} OVR${p.draft ? ' | pick #' + esc(p.draft.pick) : ''}</li>`).join('')}</ul>`;
  }

  // Applies the choices on the page (after a confirm when anyone leaves), saves, and moves on.
  async function finish() {
    const R = RK(), st = (current && current.st) || F.state();
    if (!R || !st) return;
    const rows = rowsOf(st), moves = rows.filter(r => choiceOf(r) !== 'sign');
    if (moves.length) {
      const html = `<ul class="ev-sum">${moves.map(r => `<li>${esc(r.name)} (pick #${esc(r.pick)}): ${choiceOf(r) === 'stash' ? 'stays overseas, you keep his rights' : r.status === 'stashed' ? 'draft rights released' : 'released to free agency'}</li>`).join('')}</ul>`;
      const ok = await UI.confirm({ title: 'CONFIRM ROOKIE MOVES', text: 'Everyone else signs his deal. A released player can only come back as a free agent.', html, yes: 'Confirm', no: 'Go back' });
      if (!ok) return;
    }
    const choices = {};
    moves.forEach(r => { choices[r.id] = choiceOf(r); });
    const res = F.try('ROOKIES.apply', () => R.apply(st, st.userTeam, choices), null);
    view.choices = {};
    await F.save();
    if (!res) UI.toast('The rookie moves failed.', 'error');
    else if (res.errors && res.errors.length) UI.toast(res.errors.map(x => x.reason).join(' '), 'error');
    else {
      const said = [res.declined.length && res.declined.length + ' released', res.stashed.length && res.stashed.length + ' stashed overseas'].filter(Boolean);
      UI.toast(said.length ? 'Rookie moves done: ' + said.join(', ') + '. Saved.' : 'Your rookies are signed. Saved.');
    }
    goTo(exitFor(st).href);
  }

  P.rookies = function (app) {
    app.onclick = null; app.onchange = null; app.onsubmit = null;
    current = null;
    const st = F.state();
    if (!st) { app.innerHTML = F.noLeague(); return; }
    if (!RK()) { app.innerHTML = UI.header('ROOKIE SIGNING') + F.building('Rookie signing', 'js/rookies.js'); return; }
    render(app, st);
  };
  P.rookies.hidden = true;   // reached from the draft room, the hub and NEXT, not the menu

  // True when the user holds picks from this draft that this page can still change.
  UI.rookiesDue = function (g, any) {
    const R = RK();
    if (!R || !g || !g.userTeam) return false;
    return !!F.try('ROOKIES.due', () => (any ? R.windowOf(g).open && R.list(g, g.userTeam).length > 0 : R.pending(g, g.userTeam)), false);
  };
  // The hub's offseason buttons (js/ui-season.js) add this link while the page can change anything.
  UI.rookieLink = g => (UI.rookiesDue(g, true) ? `<a class="btn btn-big" href="#/rookies">ROOKIE SIGNING</a>` : '');

  // NEXT in the re-signing phase: the rookie step first (once a summer), then the normal next step.
  const baseNext = UI.nextAction;
  if (typeof baseNext === 'function' && !baseNext.rookiesWired) {
    const wrapped = function () {
      const a = baseNext.apply(this, arguments);
      const g = UI.state && UI.state.game;
      if (!a || a.kind === 'decide' || !g || g.phase !== 'resign' || !UI.rookiesDue(g)) return a;
      if (/^#\/rookies/.test(location.hash)) return { label: 'CONTINUE TO RE-SIGNING', title: 'Confirm your rookie contracts and go to re-signing', kind: 'go', run: () => finish() };
      return { label: 'ROOKIE SIGNING', title: 'Sign, stash or release the players you just drafted', kind: 'go', run: () => goTo('#/rookies') };
    };
    wrapped.rookiesWired = true;
    UI.nextAction = wrapped;
  }
})();
