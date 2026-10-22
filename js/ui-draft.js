// Draft page (#/draft): the year's class, the draft order with lottery results, and the
// user's picks. Uses window.DRAFT (order, pick, aiPick) and window.DRAFTS when loaded.
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI || !UI.feat) return;
  const P = UI.pages = UI.pages || {};
  const F = UI.feat;
  const esc = UI.esc;

  const view = { sort: 'ovr', dir: -1, pos: 'ALL' };
  let last = null;    // text of the last pick made from this page

  // ---------- data ----------
  function prospects(st, year) {
    const list = Object.keys(st.players).map(id => st.players[id])
      .filter(p => p && p.team === 'DRAFT' && !p.retired && Number(p.draftYear) === year);
    if (list.length) return list;
    const D = F.mod('DRAFTS');
    // Fall back to the raw class only when the league state does not carry it at all.
    if (D && Array.isArray(D[year]) && !Object.keys(st.players).some(id => Number(st.players[id].draftYear) === year)) return D[year].slice();
    return [];
  }
  function drafted(st, year) {
    return Object.keys(st.players).map(id => st.players[id]).filter(p => p && p.draft && Number(p.draft.year) === year && p.team !== 'DRAFT');
  }

  // The live slots once the draft has started (they carry the pick made), else DRAFT.order.
  function order(st, year) {
    let r = st.draft && Number(st.draft.year) === year && Array.isArray(st.draft.order) ? st.draft.order : null;
    if (!r) {
      const D = F.fn('DRAFT', 'order');
      if (!D) return null;
      r = F.try('DRAFT.order', () => D.order(st, year), null);
    }
    const arr = Array.isArray(r) ? r : r && Array.isArray(r.order) ? r.order : r && Array.isArray(r.slots) ? r.slots : null;
    if (!arr) return null;
    let n1 = 0, n2 = 0;
    return arr.map((s, i) => {
      const slot = typeof s === 'string' ? { team: s } : s || {};
      const round = Number(slot.round) || (i < 30 ? 1 : 2);
      const inRound = Number(slot.pickInRound) || (round === 1 ? ++n1 : ++n2);
      const overall = Number(slot.overall) || i + 1;
      const team = slot.team || slot.abbr;
      const via = slot.via || (slot.original && slot.original !== team ? slot.original : null);
      return { raw: slot, team, round, overall, inRound, original: via };
    });
  }
  // Which player went with this slot, if any.
  function takenBy(st, slot, picks) {
    const r = slot.raw;
    const direct = r.playerId || r.prospectId || r.pid || (r.player && (typeof r.player === 'string' ? r.player : r.player.id)) || (typeof r.selected === 'string' ? r.selected : r.selected && r.selected.id);
    if (direct && st.players[direct]) return st.players[direct];
    // player.draft.pick may be overall or within the round; the round (when set) tells them apart.
    return picks.find(p => {
      const d = p.draft, pk = Number(d.pick);
      if (d.round != null && Number(d.round) !== slot.round) return false;
      if (d.team && slot.team && d.team !== slot.team) return false;
      return pk === slot.overall || (d.round != null && pk === slot.inRound);
    }) || null;
  }
  function slotsWithPicks(st, year) {
    const ord = order(st, year);
    if (!ord) return null;
    const picks = drafted(st, year);
    const used = new Set();
    ord.forEach(s => {
      const p = takenBy(st, s, picks.filter(x => !used.has(x.id)));
      s.player = p; if (p) used.add(p.id);
    });
    return ord;
  }

  // Lottery result for a first-round slot: state.draft.lottery.teams = [{ abbr, seed, chance, pick, moved }].
  function lotteryOf(st, year) {
    const d = st.draft;
    return d && Number(d.year) === year && d.lottery && Array.isArray(d.lottery.teams) ? d.lottery.teams : null;
  }
  // Protection and swap text for a traded pick (DRAFT.protectionText), shown under the team.
  function protNote(st, year, s) {
    const r = s.raw || {}, out = [];
    const T = F.fn('DRAFT', 'protectionText');
    const txt = r.protection && T ? F.try('DRAFT.protectionText', () => T.protectionText(r.protection, year), '') : '';
    const short = String(txt || '').split('. ')[0];
    if (r.protectedFor) out.push(`<small class="ft-prot" title="${esc(txt)}">Protected, stays home. Owed to ${esc(r.protectedFor)}${short ? ': ' + esc(short) : ''}</small>`);
    else if (txt) out.push(`<small class="ft-prot" title="${esc(txt)}">${esc(short)}</small>`);
    if (r.swapped) out.push(`<small class="ft-prot">Pick swap exercised by ${esc(r.swapped)}</small>`);
    return out.join(' ');
  }
  function lotteryNote(st, year, s) {
    const lot = lotteryOf(st, year);
    if (s.round !== 1 || !lot) return protNote(st, year, s);
    const t = lot.find(x => Number(x.pick) === s.overall);
    if (!t) return protNote(st, year, s);
    const mv = Number(t.moved) || 0;
    return [mv > 0 ? `<span class="ft-up">UP ${mv}</span>` : mv < 0 ? `<span class="ft-down">DOWN ${-mv}</span>` : '',
      `<small>#${esc(t.seed)} seed${t.chance != null ? ', ' + esc(t.chance) + '%' : ''}</small>`,
      protNote(st, year, s)].filter(Boolean).join(' ');
  }

  // A stash: drafted players carry stashedUntil; prospects whose first NBA season (arrivalYear,
  // a season-ending year) comes after draft year + 1 will stay overseas.
  function arrival(st, p, year) {
    if (p.stashedUntil) return Number(p.stashedUntil) > st.year ? Number(p.stashedUntil) : null;
    const a = Number(p.arrivalYear) || null;
    return p.team === 'DRAFT' && a && a > year + 1 ? a : null;
  }

  // The user's own scouting view of a prospect (DRAFT.view). Potential is never shown.
  function scoutOvr(st, p) {
    const V = F.fn('DRAFT', 'view');
    if (V && p && p.team === 'DRAFT') {
      const v = F.try('DRAFT.view', () => V.view(st, st.userTeam, p.id), null);
      if (v && v.ovr != null) return Number(v.ovr);
    }
    return Number(p && p.ovr) || 0;
  }

  // ---------- render ----------
  function render(app, st) {
    const user = st.userTeam;
    const year = st.year;
    const phase = st.phase;
    const live = phase === 'draft';
    const done = ['resign', 'freeAgency', 'training'].indexOf(phase) >= 0;
    const canPick = !!F.fn('DRAFT', 'pick');
    const canAi = !!F.fn('DRAFT', 'aiPick');
    const slots = slotsWithPicks(st, year);
    const finished = !!(st.draft && Number(st.draft.year) === year && st.draft.done);
    const next = slots && !finished ? slots.find(s => !s.player) : null;
    const myNext = slots ? slots.find(s => !s.player && s.team === user) : null;
    const onClock = live && next && next.team === user;

    let pool = prospects(st, year);
    if (view.pos !== 'ALL') pool = pool.filter(p => String(p.pos || '').toUpperCase().split(/[-/ ]/).indexOf(view.pos) >= 0);
    const key = view.sort;
    const POSORD = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };
    const so = new Map(pool.map(p => [p.id, scoutOvr(st, p)]));
    const val = (p, k) => (k === 'ovr' ? so.get(p.id) : Number(p[k]) || 0);
    pool.sort((a, b) => {
      let x, y;
      if (key === 'pos') { x = POSORD[String(a.pos).split(/[-/]/)[0]] || 9; y = POSORD[String(b.pos).split(/[-/]/)[0]] || 9; return (x - y) * -view.dir || so.get(b.id) - so.get(a.id); }
      if (key === 'name') return String(a.name).localeCompare(String(b.name)) * -view.dir;
      x = val(a, key); y = val(b, key);
      return (x - y) * view.dir || so.get(b.id) - so.get(a.id) || String(a.name).localeCompare(String(b.name));
    });
    // view.dir: -1 sorts high to low (ovr), age defaults low to high
    const head = (k, label, cls) => `<th class="${cls || ''}"><button type="button" class="ft-sorth${view.sort === k ? ' on' : ''}" data-act="sort" data-k="${k}">${label}${view.sort === k ? (view.dir < 0 ? ' &#9660;' : ' &#9650;') : ''}</button></th>`;
    const rows = pool.map((p, i) => {
      const arr = arrival(st, p, year);
      return `<tr>
        <td>${i + 1}</td>
        <td class="l"><span class="ft-cell-p"><span class="ft-hs ft-hs-sm">${UI.headshot(p)}</span><span><b>${esc(p.name)}</b>${arr ? `<small class="ft-stash">Playing overseas until ${arr}</small>` : p.college || p.school ? `<small>${esc(p.college || p.school)}</small>` : ''}</span></span></td>
        <td>${esc(p.pos || '-')}</td><td>${esc(p.age || '-')}</td><td class="hide-sm">${UI.fmtHt(p.ht)}</td>
        <td><b class="${UI.ovrClass(so.get(p.id))}">${so.get(p.id) || '-'}</b></td>
        <td>${onClock && canPick ? `<button type="button" class="btn btn-small btn-gold" data-act="pick" data-id="${esc(p.id)}">DRAFT</button>` : ''}</td>
      </tr>`;
    }).join('');

    let orderHtml;
    if (!slots) orderHtml = `<p class="muted">The draft order appears once the draft module (<code>js/draft.js</code>) is built.</p>`;
    else {
      const rounds = [1, 2].map(rd => {
        const list = slots.filter(s => s.round === rd);
        if (!list.length) return '';
        return `<div class="ft-round"><div class="ft-group">ROUND ${rd}</div><ol class="ft-order">${list.map(s => {
          const cur = next && s === next && live;
          const p = s.player;
          return `<li class="${s.team === user ? 'mine' : ''}${cur ? ' cur' : ''}${p ? ' done' : ''}">
            <span class="ft-ord-n">${s.overall}</span>${UI.logo(s.team, 26)}
            <span class="ft-ord-t"><b>${esc(s.team)}</b>${s.original && s.original !== s.team ? `<small>via ${esc(s.original)}</small>` : ''} ${lotteryNote(st, year, s)}</span>
            <span class="ft-ord-p">${p ? `<a href="#/player/${esc(p.id)}">${esc(p.name)}</a><small>${esc(p.pos || '')} | ${p.ovr || '-'} OVR${arrival(st, p, year) ? ' | Overseas until ' + arrival(st, p, year) : ''}</small>` : cur ? '<em>ON THE CLOCK</em>' : ''}</span>
          </li>`;
        }).join('')}</ol></div>`;
      }).join('');
      orderHtml = `<div class="ft-rounds">${rounds}</div>`;
    }

    const stash = F.teamPlayers(st, user).filter(p => p.stashedUntil && p.stashedUntil > year);
    const stashHtml = stash.length ? `${UI.header('YOUR DRAFT RIGHTS', 'Players you hold who are still overseas. Their contracts start when they arrive.')}
      <div class="ft-falist">${stash.map(p => `<a class="ft-item ft-static" href="#/player/${esc(p.id)}">${F.mini(p, { meta: `${esc(p.pos || '')} | ${esc(p.age || '-')} YRS | <span class="ft-stash">Playing overseas until ${p.stashedUntil}</span>`, pot: false })}</a>`).join('')}</div>` : '';

    let status, actions = '';
    if (phase === 'draftLottery') status = 'The lottery has not been drawn yet. The order below is before the lottery.';
    else if (live && !next) status = 'All picks are in. The draft is complete: move on to re-signing.';
    else if (onClock) status = `You are on the clock with pick #${next.overall}${next.original && next.original !== user ? ' (from ' + esc(next.original) + ')' : ''}. Pick a player from the class, or let the AI pick for you.`;
    else if (live && myNext) status = `Pick #${next.overall} belongs to ${esc(UI.teamName(next.team))}. Your next pick is #${myNext.overall}.`;
    else if (live) status = 'You have no picks left in this draft.';
    else if (done) status = 'The ' + year + ' draft is over. Here is how it went.';
    else status = 'The ' + year + ' draft is held after the ' + esc(UI.fmtSeasonEnd(year)) + ' season. Scout the class now.';
    if (live && next && !onClock && canAi) actions = `<button type="button" class="btn btn-gold" data-act="sim">${myNext ? 'SIM TO MY PICK' : 'SIM REST OF DRAFT'}</button>`;
    if (live && onClock && canAi) actions = `<button type="button" class="btn" data-act="autopick">AUTO PICK</button>`;
    if (live && !next && UI.sim) actions = `<button type="button" class="btn btn-gold" data-act="finish">NEXT: RE-SIGNING</button>`;
    if (live && next && !onClock && !canAi) actions = '<span class="muted">AI picks are still being built.</span>';

    const myPicks = slots ? slots.filter(s => s.team === user) : [];
    app.innerHTML = `${UI.header(year + ' NBA DRAFT', esc(F.phaseName(phase)) + (myPicks.length ? ' | Your picks: ' + myPicks.map(s => '#' + s.overall).join(', ') : ''))}
      <div class="ft-clock${onClock ? ' on' : ''}">${UI.logo(onClock ? user : next ? next.team : user, 48)}<div><div class="ft-k">${onClock ? 'ON THE CLOCK' : live ? 'DRAFT IN PROGRESS' : 'DRAFT CENTRAL'}</div><p>${status}</p></div>${actions ? `<div class="ft-clock-btns">${actions}</div>` : ''}</div>
      ${last ? `<div class="note">${esc(last)}</div>` : ''}
      ${!F.mod('DRAFT') ? '<div class="note">The draft module (<code>js/draft.js</code>) is still being built: you can scout the class, but picks are not available yet.</div>' : ''}
      <div class="ft-draft">
        <section class="ft-class">
          ${UI.header('THE CLASS', pool.length + ' prospects' + (view.pos !== 'ALL' ? ' at ' + view.pos : '') + ' available')}
          <nav class="tabs">${['ALL', 'PG', 'SG', 'SF', 'PF', 'C'].map(x => `<a href="#/draft" data-act="pos" data-pos="${x}" class="${view.pos === x ? 'on' : ''}">${x}</a>`).join('')}</nav>
          ${pool.length ? `<div class="tscroll"><table class="stats ft-classt"><thead><tr><th>#</th>${head('name', 'PLAYER', 'l')}${head('pos', 'POS')}${head('age', 'AGE')}<th class="hide-sm">HT</th>${head('ovr', 'OVR')}<th></th></tr></thead><tbody>${rows}</tbody></table></div>`
            : `<p class="muted">${done ? 'Every prospect from this class has been drafted or signed.' : 'No prospects found for this draft year.'}</p>`}
        </section>
        <section class="ft-ordersec">${UI.header('DRAFT ORDER', phase === 'draftLottery' ? 'Before the lottery' : slots ? 'After the lottery' : '')}${orderHtml}</section>
      </div>
      ${stashHtml}`;

    app.onclick = async ev => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const act = b.getAttribute('data-act');
      if (act === 'pos') { ev.preventDefault(); view.pos = b.getAttribute('data-pos'); render(app, st); }
      else if (act === 'sort') {
        const k = b.getAttribute('data-k');
        if (view.sort === k) view.dir = -view.dir; else { view.sort = k; view.dir = (k === 'age' || k === 'name' || k === 'pos') ? 1 : -1; }
        render(app, st);
      } else if (act === 'pick') {
        const D = F.fn('DRAFT', 'pick');
        if (!D || !next) return;
        const id = b.getAttribute('data-id');
        const p = st.players[id];
        try {
          const r = D.pick(st, user, id, next.raw);
          if (r && r.ok === false) throw new Error(r.reason || 'the pick was refused');
          last = 'With pick #' + next.overall + ', the ' + UI.teamName(user) + ' select ' + (p ? p.name : id) + '.';
          await F.save();
          UI.toast('You drafted ' + (p ? p.name : id) + '. Saved.');
        } catch (e) { console.warn('DRAFT.pick', e); UI.toast('The pick failed: ' + (e && e.message ? e.message : e), 'error'); }
        render(app, st);
      } else if (act === 'autopick') {
        const A = F.fn('DRAFT', 'aiPick');
        if (!A || !next) return;
        try {
          const r = A.aiPick(st, user, next.raw);
          if (r && r.ok === false) throw new Error(r.reason || 'no pick made');
          const p = r && r.id ? st.players[r.id] : null;
          last = 'With pick #' + next.overall + ', the AI took ' + (p ? p.name : 'a player') + ' for the ' + UI.teamName(user) + '.';
          await F.save();
        } catch (e) { console.warn('DRAFT.aiPick', e); UI.toast('The auto pick failed: ' + (e && e.message ? e.message : e), 'error'); }
        render(app, st);
      } else if (act === 'finish') {
        UI.sim('nextPhase');
      } else if (act === 'sim') {
        const A = F.fn('DRAFT', 'aiPick');
        if (!A) return;
        let n = 0, guard = 0;
        // Re-read the order after every pick, so trades or skipped slots never loop forever.
        for (;;) {
          if (st.draft && Number(st.draft.year) === year && st.draft.done) break;
          const s2 = slotsWithPicks(st, year) || [];
          const nx = s2.find(s => !s.player);
          if (!nx || nx.team === user || guard++ > 80) break;
          const before = drafted(st, year).length;
          let r;
          try { r = A.aiPick(st, nx.team, nx.raw); } catch (e) { console.warn('DRAFT.aiPick', e); UI.toast('An AI pick failed: ' + (e && e.message ? e.message : e), 'error'); break; }
          if (r && r.ok === false) { if (!/over/i.test(r.reason || '')) UI.toast('AI pick stopped: ' + (r.reason || 'no pick made'), 'error'); break; }
          if (drafted(st, year).length === before && !(slotsWithPicks(st, year) || []).find(s => s.overall === nx.overall && s.player)) break;
          n++;
        }
        last = n ? n + ' pick' + (n > 1 ? 's' : '') + ' made by the AI.' : last;
        await F.save();
        render(app, st);
      }
    };
  }

  P.draft = function (app) {
    app.onclick = null; app.onchange = null; app.onsubmit = null;
    const st = F.state();
    if (!st) { app.innerHTML = F.noLeague(); return; }
    // Make sure the year's class is in the league state (real class, or generated from 2027).
    const LC = F.fn('DRAFT', 'loadClass');
    if (LC && !Object.keys(st.players).some(id => st.players[id] && Number(st.players[id].draftYear) === st.year)) F.try('DRAFT.loadClass', () => LC.loadClass(st, st.year));
    if (!F.mod('DRAFT') && !F.mod('DRAFTS') && !Object.keys(st.players).some(id => st.players[id].team === 'DRAFT')) {
      app.innerHTML = UI.header(st.year + ' NBA DRAFT') + F.building('The draft', 'js/draft.js and data/drafts.js');
      return;
    }
    render(app, st);
  };
})();
