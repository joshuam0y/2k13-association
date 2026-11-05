// Rookie signing page (#/rookies): right after the draft, the user's new picks with the deal each
// one signs (DRAFT.signRookies already signed them), and a choice per player: SIGN (the default),
// STASH a second-rounder overseas for a season, or RELEASE him to free agency. Choices are kept on the
// page until CONTINUE applies them through window.ROOKIES (js/rookies.js); leaving the page changes nothing.
// Under the picks, and all year on #/rights: DRAFT RIGHTS OVERSEAS, every player the user holds abroad,
// to bring over now (offseason only), keep overseas (the default) or release. Those act right away.
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

  // the picks who signed; this draft's picks who are overseas are in the draft rights section
  function rowsOf(st) { const R = RK(); return R ? F.try('ROOKIES.list', () => R.list(st, st.userTeam), []).filter(r => r.status === 'signed') : []; }
  function choiceOf(r) {
    const c = view.choices[r.id];
    return c === 'decline' || (c === 'stash' && r.canStash) ? c : 'sign';
  }

  function dealCells(st, r, choice) {
    const opts = r.teamOptions.length ? ', team option' + (r.teamOptions.length > 1 ? 's ' : ' ') + r.teamOptions.map(season).join(' and ') : '';
    return `<div class="rk-deal"><small>CONTRACT</small><b>${yrs(r.years)} | ${m2(r.first)}</b><span>${r.rookieScale ? 'Rookie scale' : 'Minimum deal'}: ${m2(r.total)} total${esc(opts)}</span></div>
      <div class="rk-hit"><small>CAP HIT ${esc(season(r.salaries[0] ? r.salaries[0].year : RK().dealYear(st)))}</small><b>${m2(r.capHit)}</b><span>${choice === 'sign' ? 'Counts this season' : 'Off the books'}</span></div>`;
  }
  function noteFor(r, choice, D) {
    if (choice === 'decline' && r.firstRound) return ['warn', 'Teams almost never let a first-round pick go. He leaves for nothing and any team can sign him.'];
    if (choice === 'decline') return ['', 'He becomes a free agent. No dead money: his deal was never played.'];
    if (choice === 'stash') return ['', 'He plays overseas until ' + (D + 2) + '. You keep his rights, and he signs when he comes over. He does not count against the roster or the cap.'];
    return ['', ''];
  }
  function rowHtml(st, r) {
    const p = st.players[r.id], choice = choiceOf(r), D = RK().draftYear(st);
    const btn = (v, label) => `<button type="button" class="k-${v}" data-act="choose" data-id="${esc(r.id)}" data-v="${v}" aria-pressed="${choice === v}">${label}</button>`;
    const btns = btn('sign', 'SIGN') + (r.canStash ? btn('stash', 'STASH') : '') + btn('decline', 'RELEASE');
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
    const n = { sign: 0, stash: 0, decline: 0 };
    rows.forEach(r => { n[choiceOf(r)]++; });
    const parts = [n.sign + ' signed'];
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
      app.innerHTML = head + UI.empty('ROOKIE SIGNING IS CLOSED', esc(w.reason), `<div class="row-btns center">${UI.pages.draft ? '<a class="btn btn-gold" href="#/draft">DRAFT ROOM</a>' : ''}<a class="btn" href="#/season">SEASON</a></div>`) + rightsHtml(st, true);
      app.onclick = ev => rightsClick(ev, () => render(app, st), st);
      return;
    }
    const rows = rowsOf(st), gone = R.released(st), ex = exitFor(st), away = rightsOf(st).some(x => x.draftYear === D);
    if (!rows.length) {
      app.innerHTML = head + UI.empty('NO ROOKIES TO SIGN', away ? 'Your new picks are playing overseas: manage them under draft rights below.' : gone.length ? 'You released every pick you had in this draft.' : 'You did not draft anyone you still hold in the ' + esc(D) + ' draft.',
        `<div class="row-btns center"><button type="button" class="btn btn-gold" data-act="continue">${esc(ex.label)}</button></div>`) + releasedHtml(gone) + rightsHtml(st, true);
    } else {
      app.innerHTML = `${head}
        <section class="rk-head" aria-label="Rookie contracts">
          <div class="rk-team">${UI.logo(user, 48)}<div><div class="ft-k">YOUR ${esc(D)} DRAFT PICKS</div><div class="ft-t">${esc(UI.teamName(user))}</div>
            <p>Every pick signs the deal below unless you release him. Second-round picks can also stay overseas for a season while you keep their rights.</p></div></div>
          ${summaryHtml(st, rows)}
          <div class="rk-btns"><button type="button" class="btn btn-gold" data-act="continue">${esc(ex.label)}</button><button type="button" class="btn" data-act="signall">SIGN ALL</button></div>
        </section>
        <ul class="rk-list">${rows.map(r => rowHtml(st, r)).join('')}</ul>
        ${releasedHtml(gone)}
        ${rightsHtml(st, true)}`;
    }

    app.onclick = async ev => {
      if (await rightsClick(ev, () => render(app, st), st)) return;
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const act = b.getAttribute('data-act');
      if (act === 'choose') {
        const id = b.getAttribute('data-id'), v = b.getAttribute('data-v');
        const r = rowsOf(st).find(x => x.id === id);
        if (!r || choiceOf(r) === v) return;
        if (v === 'decline' && r.firstRound) {
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
      const html = `<ul class="ev-sum">${moves.map(r => `<li>${esc(r.name)} (pick #${esc(r.pick)}): ${choiceOf(r) === 'stash' ? 'stays overseas, you keep his rights' : 'released to free agency'}</li>`).join('')}</ul>`;
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

  // ---------- draft rights overseas (on this page and #/rights, all year) ----------
  function rightsOf(st) { const R = RK(); return R && R.rights ? F.try('ROOKIES.rights', () => R.rights(st, st.userTeam), []) : []; }
  const dealKind = { rookie: 'Rookie scale', minimum: 'Second-round deal', rights: 'Rights deal' };
  function rightsRowHtml(st, r) {
    const p = st.players[r.id], d = r.deal;
    const drafted = r.draftYear ? `${esc(r.draftYear)} R${esc(r.round || '-')} #${esc(r.pick || '-')}` : 'DRAFT RIGHTS';
    const by = r.draftedBy && r.draftedBy !== st.userTeam ? ' | drafted by ' + esc(r.draftedBy) : '';
    const left = r.seasonsLeft === 0 ? 'Comes over this summer' : r.seasonsLeft + (r.seasonsLeft === 1 ? ' season' : ' seasons') + ' overseas left';
    const note = r.canBring ? 'He does not count against your roster or cap while he is away.' : r.bringReason;
    return `<li class="rk-row rk-ov">
      <a class="rk-who" href="#/player/${esc(r.id)}"><span class="ft-hs">${UI.headshot(p)}</span>
        <span class="ft-main"><b class="ft-name">${esc(r.name)}</b><span class="ft-meta"><span class="rk-pk${r.round === 1 ? ' r1' : ''}">${drafted}</span>${esc(r.pos || '-')} | ${esc(r.age || '-')} YRS${by}</span></span>
        <span class="ft-ovr ${UI.ovrClass(r.ovr)}">${esc(r.ovr || '-')}<small>OVR</small></span></a>
      <div class="rk-deal"><small>ARRIVES</small><b class="rk-away">${esc(r.arrives)}</b><span>${esc(left)}</span></div>
      <div class="rk-hit"><small>${d.now ? 'SIGNS NOW FOR' : 'SIGNS ON ARRIVAL'}</small><b>${d.years ? yrs(d.years) + ' | ' + m2(d.first) : '-'}</b><span>${esc(dealKind[d.kind] || 'Contract')}${d.years ? ', ' + m2(d.total) + ' total' : ''}</span></div>
      <div class="rk-act rk-act3" role="group" aria-label="${esc('Draft rights choice for ' + r.name)}">
        <button type="button" class="k-sign" aria-pressed="true" data-ract="keep" data-id="${esc(r.id)}">KEEP OVERSEAS</button>
        <button type="button" class="k-bring" aria-pressed="false" aria-disabled="${!r.canBring}" data-ract="bring" data-id="${esc(r.id)}">BRING OVER NOW</button>
        <button type="button" class="k-decline" aria-pressed="false" data-ract="release" data-id="${esc(r.id)}">RELEASE RIGHTS</button>
      </div>
      <p class="rk-note${r.canBring ? '' : ' warn'}">${esc(note)}</p>
    </li>`;
  }
  // sub: a header for the section (on the rookie page) or not (the #/rights page has its own)
  function rightsHtml(st, sub) {
    const list = rightsOf(st);
    if (!list.length) return sub ? '' : UI.empty('NOBODY OVERSEAS', 'You hold no draft rights to players abroad right now. Second-round picks can be stashed overseas on the rookie signing page after the draft.',
      '<div class="row-btns center"><a class="btn" href="#/season">SEASON</a></div>');
    const n = list.length;
    return `${sub ? UI.header('DRAFT RIGHTS OVERSEAS', n + (n === 1 ? ' player you hold plays' : ' players you hold play') + ' abroad. Keeping ' + (n === 1 ? 'him' : 'them') + ' costs nothing.') : ''}
      <ul class="rk-list">${list.map(r => rightsRowHtml(st, r)).join('')}</ul>`;
  }
  // -> true when the click was one of the draft rights buttons
  async function rightsClick(ev, redraw, st) {
    const b = ev.target.closest('[data-ract]');
    if (!b) return false;
    const R = RK(), id = b.getAttribute('data-id'), act = b.getAttribute('data-ract');
    const r = rightsOf(st).find(x => x.id === id);
    if (!R || !r) return true;
    if (act === 'keep') { UI.toast(r.name + ' stays overseas. You keep his rights.'); return true; }
    if (act === 'bring') {
      if (!r.canBring) { await UI.choose({ title: 'NOT NOW', text: r.bringReason, buttons: [{ value: 'ok', label: 'OK', gold: true }] }); return true; }
      const d = r.deal;
      const ok = await UI.confirm({ title: 'BRING HIM OVER NOW?', text: r.name + ' leaves his team abroad and signs with you: ' + yrs(d.years).toLowerCase() + ', ' + m2(d.first) + ' first season (' + (dealKind[d.kind] || 'contract').toLowerCase() + '). He counts on your roster and cap right away.', yes: 'Bring him over', no: 'Keep him overseas' });
      if (!ok) return true;
      const res = F.try('ROOKIES.bringOver', () => R.bringOver(st, st.userTeam, id), null);
      await F.save();
      UI.toast(res && res.ok ? res.message + ' Saved.' : (res && res.reason) || 'He could not come over.', res && res.ok ? '' : 'error');
    } else if (act === 'release') {
      const ok = await UI.confirm({ title: 'RELEASE HIS RIGHTS?', text: 'You give up ' + r.name + '. He becomes a free agent when he comes over for ' + r.arrives + ', and any team can sign him then.', yes: 'Release his rights', no: 'Keep him' });
      if (!ok) return true;
      const res = F.try('ROOKIES.releaseRights', () => R.releaseRights(st, st.userTeam, id), null);
      await F.save();
      UI.toast(res && res.ok ? res.message + ' Saved.' : (res && res.reason) || 'That did not work.', res && res.ok ? '' : 'error');
    }
    redraw();
    return true;
  }

  P.rights = function (app) {
    app.onclick = null; app.onchange = null; app.onsubmit = null;
    const st = F.state();
    if (!st) { app.innerHTML = F.noLeague(); return; }
    if (!RK() || !RK().rights) { app.innerHTML = UI.header('DRAFT RIGHTS OVERSEAS') + F.building('Draft rights', 'js/rookies.js'); return; }
    const draw = () => {
      const n = rightsOf(st).length;
      app.innerHTML = UI.header('DRAFT RIGHTS OVERSEAS', esc(UI.teamName(st.userTeam)) + ' | ' + esc(F.phaseName(st.phase)) + (n ? ' | Players abroad do not count against your roster or cap. They can come over in the offseason.' : '')) +
        rightsHtml(st, false) + (UI.rookiesDue(st, true) ? '<div class="row-btns"><a class="btn" href="#/rookies">ROOKIE SIGNING</a></div>' : '');
    };
    draw();
    app.onclick = ev => rightsClick(ev, draw, st);
  };
  P.rights.hidden = true;   // reached from the rookie page, the team roster page and the hub

  // "3 PLAYERS OVERSEAS" for the hub's offseason area and the user's roster page, or '' when nobody is abroad.
  const overseasN = g => { const R = RK(); return R && R.rightsCount && g && g.userTeam ? F.try('ROOKIES.rightsCount', () => R.rightsCount(g, g.userTeam), 0) : 0; };
  UI.rightsLine = g => { const n = overseasN(g); return n ? `<a class="rk-ovl" href="#/rights">${n} PLAYER${n === 1 ? '' : 'S'} OVERSEAS<small>MANAGE DRAFT RIGHTS</small></a>` : ''; };
  UI.rightsLink = g => { const n = overseasN(g); return n ? `<a class="btn" href="#/rights">${n} OVERSEAS</a>` : ''; };

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
