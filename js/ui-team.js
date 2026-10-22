// Front office pages: team management (#/manage) with rotation, strategy, coaching staff,
// G League, payroll and player mood. Shared franchise helpers live on UI.fr
// so js/ui-history.js (news, awards, history) can use them.
(function () {
  'use strict';
  const UI = window.UI = window.UI || {};
  const P = UI.pages = UI.pages || {};
  const esc = UI.esc || (s => String(s == null ? '' : s));
  const fr = UI.fr = UI.fr || {};
  const f1 = v => (v == null || isNaN(v) ? '-' : Number(v).toFixed(1));

  // ---------- the league state (contract-v2), found wherever the UI keeps it ----------
  const isLeagueState = x => !!(x && typeof x === 'object' && x.players && typeof x.players === 'object' && !Array.isArray(x.players)
    && x.teams && typeof x.teams === 'object' && !Array.isArray(x.teams) && x.userTeam);
  fr.state = function () {
    const st = UI.state || {};
    if (isLeagueState(st.game)) return st.game;
    if (typeof UI.getState === 'function') { try { const g = UI.getState(); if (isLeagueState(g)) return g; } catch (e) { /* ignore */ } }
    return null;
  };

  let saveTimer = null;
  fr.persist = function () {
    if (typeof UI.bump === 'function') UI.bump();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        let r = null;
        if (typeof UI.saveNow === 'function') r = UI.saveNow();
        else if (UI.saves && typeof UI.saves.write === 'function') r = UI.saves.write();
        if (r && typeof r.catch === 'function') r.catch(e => console.warn('[ui-team] save failed', e));
      } catch (e) { console.warn('[ui-team] save failed', e); }
    }, 350);
  };

  fr.mod = name => window[name] || null;
  fr.call = function (label, fn, fallback) {
    try { return fn(); } catch (e) { console.warn('[ui-team] ' + label + ' failed', e); return fallback; }
  };

  fr.building = (title, what, extra) => `<div class="fr-building"><div class="fr-building-k">STILL BEING BUILT</div>
    <div class="fr-building-t">${esc(title)}</div><p>${what}</p>${extra || ''}</div>`;

  fr.needState = function (app, page) {
    app.innerHTML = fr.subnav(page) + UI.empty('NO ASSOCIATION LOADED',
      'Start a new Association or continue a saved one, and the front office opens here.',
      '<div class="row-btns center"><a class="btn btn-gold" href="#/new">NEW LEAGUE</a><a class="btn" href="#/continue">CONTINUE</a><a class="btn" href="#/saves">SAVES</a></div>');
  };

  const SUBNAV = [['manage', 'FRONT OFFICE'], ['news', 'NEWS'], ['awards', 'AWARDS'], ['history', 'HISTORY']];
  fr.subnav = cur => `<nav class="fr-subnav" aria-label="Franchise">${SUBNAV.map(([k, t]) =>
    `<a href="#/${k}" class="${k === cur ? 'on' : ''}">${t}</a>`).join('')}</nav>`;

  fr.tabs = (base, list, cur) => `<div class="tabs fr-tabs">${list.map(([k, t]) =>
    `<a href="#/${base}${k ? '/' + k : ''}" class="${k === cur ? 'on' : ''}">${t}</a>`).join('')}</div>`;

  fr.teamName = function (s, abbr) {
    const t = s && s.teams && s.teams[abbr];
    if (t && t.name) return ((t.city || '') + ' ' + t.name).trim();
    return UI.teamName ? UI.teamName(abbr) : abbr;
  };
  fr.logo = (abbr, size) => (UI.logo ? UI.logo(abbr, size) : `<b>${esc(abbr)}</b>`);
  fr.head = (p, cls) => (UI.headshot && p ? UI.headshot(p, cls) : '');
  fr.plink = (p, label) => p ? `<a href="#/player/${encodeURIComponent(p.id)}">${esc(label || p.name)}</a>` : '-';
  fr.money = n => (UI.fmtMoney ? UI.fmtMoney(n) : '$' + Math.round(n || 0));
  fr.seasonLabel = y => (UI.fmtSeasonEnd ? UI.fmtSeasonEnd(y) : String(y));
  fr.salary = function (p, year) {
    const c = p && p.contract;
    if (c && Array.isArray(c.salaries)) {
      const x = c.salaries.find(v => v && v.year === year);
      return x ? Number(x.amount) || 0 : 0;
    }
    return p && p.salary && (!p.contractEnd || p.contractEnd >= year) ? p.salary : 0;
  };
  fr.contractEnd = function (p) {
    const c = p && p.contract;
    if (c && Array.isArray(c.salaries) && c.salaries.length) return Math.max.apply(null, c.salaries.map(v => v.year));
    return p && p.contractEnd || null;
  };
  fr.dateOf = function (s, year, day) {
    if (s && s.season && s.year === year && Array.isArray(s.season.days) && (day || 0) < s.season.days.length) {
      const d = s.season.days[Math.max(0, day || 0)];
      if (d && d.date) {
        const dt = new Date(d.date + 'T12:00:00');
        if (!isNaN(dt)) return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }
    return fr.seasonLabel(year) + ', day ' + ((day || 0) + 1);
  };
  fr.record = function (s, abbr) {
    const st = s && s.season && s.season.standings && s.season.standings[abbr];
    if (st) return (st.w || 0) + '-' + (st.l || 0);
    return UI.record ? UI.record(abbr) : '0-0';
  };
  fr.badges = function (p) {
    let b = UI.injuryBadge ? UI.injuryBadge(p) : '';
    if (p.contract && p.contract.twoWay) b += ' <span class="badge fr-b-2w" title="Two-way contract">2-WAY</span>';
    if (p.gleague) b += ' <span class="badge fr-b-gl" title="Assigned to the G League">G LEAGUE</span>';
    if (p.tradeRequest) b += ' <span class="badge fr-b-tr" title="Has asked for a trade">TRADE REQ</span>';
    return b;
  };
  fr.ovr = p => `<span class="fr-ovr ${UI.ovrClass ? UI.ovrClass(p.ovr || 0) : ''}">${esc(p.ovr || '-')}</span>`;

  // ---------- user roster helpers ----------
  function injuryOf(s, p) {
    const inj = s.season && s.season.injuries && s.season.injuries[p.id];
    if (inj && inj.games > 0) return inj;
    return p.injury && p.injury.games > 0 ? p.injury : null;
  }
  function userRoster(s, opts) {
    const abbr = s.userTeam;
    return Object.keys(s.players).map(id => s.players[id]).filter(p => p && p.team === abbr && !p.retired
      && !(p.stashedUntil && p.stashedUntil > s.year) && (opts && opts.withGleague ? true : !p.gleague))
      .map(p => { const inj = injuryOf(s, p); return inj && inj !== p.injury ? Object.assign({}, p, { injury: inj }) : p; });
  }
  // the same minute targets the game engine uses
  const STARTER_MIN = [36, 34, 32, 30, 30];
  const BENCH_MIN5 = [22, 18, 16, 12, 10];
  const BENCH_MIN4 = [24, 22, 18, 14];
  const SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'];
  const POS_RANK = { PG: 1, G: 1.5, SG: 2, GF: 2.5, SF: 3, F: 3.5, PF: 4, FC: 4.5, C: 5 };
  const primaryPos = pos => String(pos || 'SF').toUpperCase().split(/[-\/ ,]/)[0];
  const posRank = pos => (POS_RANK[primaryPos(pos)] == null ? 3 : POS_RANK[primaryPos(pos)]);
  const posGroup = pos => { const p = primaryPos(pos); return p === 'PG' || p === 'SG' || p === 'G' ? 'G' : p === 'PF' || p === 'C' || p === 'FC' ? 'B' : 'W'; };
  const benchMinutes = (i, bench) => {
    const five = bench.length >= 5 && (bench[4].ovr || 0) >= (bench[0].ovr || 0) - 12;
    return (five ? BENCH_MIN5 : BENCH_MIN4)[i] || 0;
  };
  // put five starters in PG, SG, SF, PF, C order
  const slotOrder = list => list.slice().sort((a, b) => posRank(a.pos) - posRank(b.pos) || (b.ovr || 0) - (a.ovr || 0));

  // The lineup the engine picks on its own: the best five of the top eight healthy players,
  // with at least one guard and one big, then the bench by overall. Injured players sit.
  function autoLineup(s) {
    const roster = userRoster(s);
    const healthy = roster.filter(p => !injuryOf(s, p)).sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
    const hurt = roster.filter(p => injuryOf(s, p)).sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
    const top = healthy.slice(0, Math.min(8, healthy.length));
    let best = top.slice(0, 5), bestScore = -1e9;
    if (top.length > 5) {
      const k = top.length;
      for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) for (let c = b + 1; c < k; c++)
        for (let d = c + 1; d < k; d++) for (let e = d + 1; e < k; e++) {
          const set = [top[a], top[b], top[c], top[d], top[e]];
          let g = 0, bg = 0, score = 0;
          set.forEach(p => { score += p.ovr || 0; const gr = posGroup(p.pos); if (gr === 'G') g++; if (gr === 'B') bg++; });
          if (g === 0) score -= 14;
          if (bg === 0) score -= 14;
          if (g > 2) score -= 4 * (g - 2);
          if (bg > 2) score -= 4 * (bg - 2);
          if (score > bestScore) { bestScore = score; best = set; }
        }
    }
    const starters = slotOrder(best);
    const bench = healthy.filter(p => best.indexOf(p) < 0);
    const minutes = {};
    best.slice().sort((a, b) => (b.ovr || 0) - (a.ovr || 0)).forEach((p, i) => { minutes[p.id] = STARTER_MIN[i]; });
    bench.forEach((p, i) => { minutes[p.id] = benchMinutes(i, bench); });
    hurt.forEach(p => { minutes[p.id] = 0; });
    return { active: starters.concat(bench).map(p => p.id), inactive: hurt.map(p => p.id), minutes };
  }

  // The rotation as the page shows it: { active: [ids: 5 starters then bench], inactive: [ids], minutes, auto }
  function currentRotation(s, team) {
    const roster = userRoster(s);
    const byId = new Map(roster.map(p => [p.id, p]));
    if (!Array.isArray(team.rotation) || !team.rotation.length) return Object.assign(autoLineup(s), { auto: true, byId });
    const inactive = (Array.isArray(team.inactive) ? team.inactive : []).filter(id => byId.has(id));
    const active = team.rotation.filter(id => byId.has(id) && inactive.indexOf(id) < 0);
    // players who joined since the rotation was saved go to the end of the bench
    roster.filter(p => active.indexOf(p.id) < 0 && inactive.indexOf(p.id) < 0)
      .sort((a, b) => (b.ovr || 0) - (a.ovr || 0)).forEach(p => active.push(p.id));
    const minutes = {};
    active.concat(inactive).forEach((id, i) => {
      const m = team.minutes && team.minutes[id];
      minutes[id] = inactive.indexOf(id) >= 0 ? 0 : m != null ? Math.max(0, Math.min(48, +m || 0)) : (i < 5 ? STARTER_MIN[i] : 0);
    });
    return { active, inactive, minutes, auto: false, byId };
  }
  fr.rotation = (s) => s && s.teams[s.userTeam] ? currentRotation(s, s.teams[s.userTeam]) : null;

  // Save a manual rotation, or null to go back to auto. The engine reads
  // state.season.lineups[abbr] = { starters, minutes } for every game.
  function applyRotation(s, rot) {
    const team = s.teams[s.userTeam];
    if (rot) {
      const minutes = {};
      rot.active.forEach(id => { minutes[id] = Math.max(0, Math.min(48, Math.round(+rot.minutes[id] || 0))); });
      rot.inactive.forEach(id => { minutes[id] = 0; });
      team.rotation = rot.active.slice();
      team.inactive = rot.inactive.slice();
      team.minutes = minutes;
    } else {
      team.rotation = null; team.minutes = null; team.inactive = null;
    }
    if (s.season && typeof s.season === 'object') {
      s.season.lineups = s.season.lineups || {};
      if (rot) s.season.lineups[s.userTeam] = { starters: team.rotation.slice(0, 5), minutes: Object.assign({}, team.minutes) };
      else delete s.season.lineups[s.userTeam];
    }
    fr.persist();
  }
  fr.applyRotation = applyRotation;

  // ---------- page ----------
  const TABS = [['', 'ROTATION'], ['strategy', 'STRATEGY'], ['staff', 'COACHING'], ['mood', 'LOCKER ROOM'],
    ['gleague', 'G LEAGUE'], ['payroll', 'PAYROLL']];

  P.manage = function (app, arg) {
    const s = fr.state();
    if (!s || !s.teams[s.userTeam]) { fr.needState(app, 'manage'); return; }
    const tab = TABS.some(t => t[0] === arg) ? arg : '';
    const abbr = s.userTeam;
    const team = s.teams[abbr];
    app.innerHTML = `${fr.subnav('manage')}
      <div class="fr-hero" style="--c1:${esc((team.colors && team.colors[0]) || '#333')}">
        ${fr.logo(abbr, 64)}
        <div class="fr-hero-info"><div class="fr-hero-k">FRONT OFFICE | ${esc(fr.seasonLabel(s.year))}</div>
        <div class="fr-hero-t">${esc(fr.teamName(s, abbr))}</div>
        <div class="fr-hero-d">${esc(fr.record(s, abbr))}${s.phase ? ' | ' + esc(((UI.PHASES && UI.PHASES[s.phase]) || String(s.phase).replace(/([A-Z])/g, ' $1')).toUpperCase()) : ''}</div></div>
      </div>
      ${fr.tabs('manage', TABS, tab)}
      <div id="frBody"></div>`;
    const body = UI.$('#frBody', app);
    const draw = { '': rotationTab, strategy: strategyTab, staff: staffTab, mood: moodTab, gleague: gleagueTab, payroll: payrollTab }[tab];
    draw(body, s, team);
  };

  // ---------- rotation (2K13 style: five slots, bench, inactive) ----------
  function rotationTab(body, s, team) {
    let rot = currentRotation(s, team);
    let picked = null;          // { list: 'active'|'inactive', i } waiting for a second click

    const where = id => rot.active.indexOf(id) >= 0 ? { list: 'active', i: rot.active.indexOf(id) } : { list: 'inactive', i: rot.inactive.indexOf(id) };
    const idAt = loc => (loc.list === 'active' ? rot.active : rot.inactive)[loc.i];

    function row(id, list, i) {
      const p = rot.byId.get(id);
      if (!p) return '';
      const starter = list === 'active' && i < 5;
      const label = list === 'inactive' ? 'INA' : starter ? SLOTS[i] : (i + 1) + 'TH';
      const off = starter && primaryPos(p.pos) !== SLOTS[i];
      const inj = injuryOf(s, p);
      const sel = picked && picked.list === list && picked.i === i;
      const min = Math.round(rot.minutes[id] || 0);
      const minCell = list === 'inactive' ? '<span class="frr-dnp">INACTIVE</span>'
        : `<span class="frr-min"><button type="button" class="frr-step" data-step="-2" data-id="${esc(id)}" aria-label="Fewer minutes for ${esc(p.name)}">&minus;</button>
            <input type="number" inputmode="numeric" min="0" max="48" step="1" value="${min}" data-min="${esc(id)}" aria-label="Minutes for ${esc(p.name)}">
            <button type="button" class="frr-step" data-step="2" data-id="${esc(id)}" aria-label="More minutes for ${esc(p.name)}">+</button></span>`;
      return `<li class="frr-row${starter ? ' starter' : ''}${list === 'inactive' ? ' ina' : ''}${sel ? ' sel' : ''}${inj ? ' hurt' : ''}" draggable="true" data-list="${list}" data-i="${i}" data-id="${esc(id)}" tabindex="0" aria-label="${esc(label + ' ' + p.name)}">
        <span class="frr-slot">${label}</span>
        <span class="frr-hs">${fr.head(p)}</span>
        <span class="frr-main"><span class="frr-name">${esc(p.name)}</span>
          <span class="frr-meta">${esc(p.age || '-')} yrs ${fr.badges(p)}${inj && starter && !rot.auto ? ' <span class="loss">Hurt: the best healthy player starts</span>' : ''}</span></span>
        <span class="frr-pos${off ? ' off' : ''}" title="${off ? 'Playing out of position' : 'Position'}">${esc(p.pos || '-')}</span>
        ${fr.ovr(p)}
        ${minCell}
      </li>`;
    }
    function dropRow(list, label) {
      return `<li class="frr-row frr-drop" data-drop="${list}">${label}</li>`;
    }
    function render() {
      const total = rot.active.reduce((a, id) => a + (Number(rot.minutes[id]) || 0), 0);
      const starters = rot.active.slice(0, 5), bench = rot.active.slice(5);
      const hint = picked ? `<b>${esc(rot.byId.get(idAt(picked)).name)}</b> picked. Click another player to swap them, or click him again to cancel.`
        : 'Click two players to swap them, or drag one onto another.';
      body.innerHTML = `
        <div class="frr-top">
          <div class="frr-toggle" role="radiogroup" aria-label="Rotation mode">
            <button type="button" role="radio" aria-checked="${rot.auto}" class="${rot.auto ? 'on' : ''}" data-mode="auto"><b>AUTO</b><small>Best lineup every game</small></button>
            <button type="button" role="radio" aria-checked="${!rot.auto}" class="${!rot.auto ? 'on' : ''}" data-mode="manual"><b>MANUAL</b><small>You set it</small></button>
          </div>
          <div class="frr-state">${rot.auto
            ? '<b>AUTO ROTATION IS ON.</b> Your coach starts the best healthy five and sets the minutes before every game. This is what he would play right now. Change anything and you switch to manual.'
            : '<b>MANUAL ROTATION.</b> Your starters and minutes are used every game. Hurt starters are replaced by the best healthy player.'}</div>
        </div>
        <div class="frr-bar">
          <div class="fr-mintotal ${Math.abs(total - 240) <= 2 ? 'ok' : 'off'}"><b>${total}</b> / 240 MIN</div>
          <span class="frr-hint">${hint}</span>
          ${rot.auto ? '' : `<span class="fr-rot-btns"><button type="button" class="btn btn-small" id="frAutoMin">DEFAULT MINUTES</button>
            <button type="button" class="btn btn-small" id="frBalance">FIT TO 240</button></span>`}
        </div>
        ${!rot.auto && Math.abs(total - 240) > 2 ? '<div class="note">A game has 240 player minutes (5 spots x 48). The engine scales your targets to fit, or use FIT TO 240.</div>' : ''}
        <div class="frr-head" aria-hidden="true"><span>SLOT</span><span></span><span>PLAYER</span><span>POS</span><span>OVR</span><span>MIN</span></div>
        <div class="frr-sec">STARTERS</div>
        <ol class="frr-list">${starters.map((id, i) => row(id, 'active', i)).join('')}</ol>
        <div class="frr-sec">BENCH</div>
        <ol class="frr-list">${bench.map((id, i) => row(id, 'active', i + 5)).join('')}${dropRow('bench', picked ? 'Click here to move him to the end of the bench' : 'End of the bench')}</ol>
        <div class="frr-sec">INACTIVE</div>
        <ol class="frr-list">${rot.inactive.map((id, i) => row(id, 'inactive', i)).join('')}${dropRow('inactive', picked ? 'Click here to make him inactive' : (rot.inactive.length ? 'Drop a player here to make him inactive' : 'Nobody inactive. Drop a player here to sit him.'))}</ol>
        <p class="muted fr-small">Inactive players do not play. Players assigned to the G League are not listed here.</p>`;
      bind();
    }
    // any change in auto mode turns manual on, starting from the auto lineup
    function commit(msg) {
      const wasAuto = rot.auto;
      rot.auto = false;
      applyRotation(s, rot);
      render();
      if (wasAuto && UI.toast) UI.toast('Manual rotation on. ' + (msg || ''));
    }
    function swap(a, b) {
      if (a.list === b.list && a.i === b.i) return;
      const A = a.list === 'active' ? rot.active : rot.inactive, B = b.list === 'active' ? rot.active : rot.inactive;
      const ida = A[a.i], idb = B[b.i];
      A[a.i] = idb; B[b.i] = ida;
      // minutes stay with the slot
      const ma = rot.minutes[ida] || 0, mb = rot.minutes[idb] || 0;
      rot.minutes[ida] = b.list === 'inactive' ? 0 : mb;
      rot.minutes[idb] = a.list === 'inactive' ? 0 : ma;
      commit();
    }
    function moveTo(loc, list) {
      const id = idAt(loc);
      if (list === 'inactive' && loc.list === 'active' && rot.active.length <= 5) { UI.toast && UI.toast('You need five players who can play.', 'error'); return; }
      (loc.list === 'active' ? rot.active : rot.inactive).splice(loc.i, 1);
      if (list === 'inactive') { rot.inactive.push(id); rot.minutes[id] = 0; }
      else { rot.active.push(id); }
      commit();
    }
    function clickRow(loc) {
      if (!picked) { picked = loc; render(); return; }
      const a = picked; picked = null;
      if (a.list === loc.list && a.i === loc.i) { render(); return; }
      swap(a, loc);
    }
    function setMin(id, v) {
      rot.minutes[id] = Math.max(0, Math.min(48, Math.round(Number(v) || 0)));
      commit();
    }
    function bind() {
      UI.$$('[data-mode]', body).forEach(b => b.addEventListener('click', () => {
        const mode = b.getAttribute('data-mode');
        picked = null;
        if (mode === 'auto' && !rot.auto) { applyRotation(s, null); rot = currentRotation(s, team); render(); UI.toast && UI.toast('Auto rotation on: the best lineup plays every game.'); }
        else if (mode === 'manual' && rot.auto) commit('Your current lineup is saved.');
      }));
      UI.$$('.frr-row[data-id]', body).forEach(li => {
        const loc = () => ({ list: li.getAttribute('data-list'), i: +li.getAttribute('data-i') });
        li.addEventListener('click', e => { if (e.target.closest('input,button,a')) return; clickRow(loc()); });
        li.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === li) { e.preventDefault(); clickRow(loc()); } });
        li.addEventListener('dragstart', e => {
          if (e.target && e.target.closest && e.target.closest('input,button')) { e.preventDefault(); return; }
          picked = null; dragFrom = loc(); li.classList.add('dragging');
          try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', li.getAttribute('data-id')); } catch (x) { /* ignore */ }
        });
        li.addEventListener('dragend', () => { li.classList.remove('dragging'); UI.$$('.frr-row.over', body).forEach(x => x.classList.remove('over')); });
      });
      UI.$$('.frr-row', body).forEach(li => {
        li.addEventListener('dragover', e => { if (!dragFrom) return; e.preventDefault(); li.classList.add('over'); });
        li.addEventListener('dragleave', () => li.classList.remove('over'));
        li.addEventListener('drop', e => {
          e.preventDefault();
          const f = dragFrom; dragFrom = null;
          if (!f) return;
          const drop = li.getAttribute('data-drop');
          if (drop) moveTo(f, drop === 'inactive' ? 'inactive' : 'active');
          else swap(f, { list: li.getAttribute('data-list'), i: +li.getAttribute('data-i') });
        });
      });
      UI.$$('.frr-drop', body).forEach(li => li.addEventListener('click', () => {
        if (!picked) return;
        const a = picked; picked = null;
        moveTo(a, li.getAttribute('data-drop') === 'inactive' ? 'inactive' : 'active');
      }));
      UI.$$('[data-min]', body).forEach(inp => inp.addEventListener('change', () => setMin(inp.getAttribute('data-min'), inp.value)));
      UI.$$('[data-step]', body).forEach(b => b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        setMin(id, (rot.minutes[id] || 0) + Number(b.getAttribute('data-step')));
      }));
      const am = UI.$('#frAutoMin', body);
      if (am) am.addEventListener('click', () => {
        const bench = rot.active.slice(5).map(id => rot.byId.get(id));
        rot.active.forEach((id, i) => { rot.minutes[id] = i < 5 ? STARTER_MIN[i] : benchMinutes(i - 5, bench); });
        commit(); UI.toast && UI.toast('Minutes set to the default targets.');
      });
      const bal = UI.$('#frBalance', body);
      if (bal) bal.addEventListener('click', () => {
        const ids = rot.active;
        const tot = ids.reduce((a, id) => a + (Number(rot.minutes[id]) || 0), 0);
        if (!tot) return;
        ids.forEach(id => { rot.minutes[id] = Math.min(48, Math.round((rot.minutes[id] || 0) * 240 / tot)); });
        let diff = 240 - ids.reduce((a, id) => a + rot.minutes[id], 0);
        for (let i = 0; diff !== 0 && i < ids.length * 4; i++) {
          const id = ids[i % ids.length];
          if (diff > 0 && rot.minutes[id] > 0 && rot.minutes[id] < 48) { rot.minutes[id]++; diff--; } else if (diff < 0 && rot.minutes[id] > 0) { rot.minutes[id]--; diff++; }
        }
        commit();
      });
    }
    let dragFrom = null;
    render();
  }

  // ---------- strategy ----------
  function strategyTab(body, s, team) {
    const st = team.strategy = Object.assign({ pace: 50, three: 50, defense: 'man', crash: 50 }, team.strategy || {});
    const slider = (key, label, lo, hi, help) => `<div class="fr-slider">
      <div class="fr-slider-top"><span class="fr-slider-l">${label}</span><b id="frv-${key}">${st[key]}</b></div>
      <input type="range" min="0" max="100" step="1" value="${Number(st[key]) || 0}" data-strat="${key}" aria-label="${label}">
      <div class="fr-slider-ends"><span>${lo}</span><span>${hi}</span></div>
      <p class="muted fr-small">${help}</p></div>`;
    const DEF = [['man', 'MAN', 'Stay with your man. The standard.'], ['zone', 'ZONE', 'Pack the paint, give up some threes.'], ['switch', 'SWITCH', 'Switch every screen. Needs versatile defenders.']];
    body.innerHTML = `${UI.header('TEAM STRATEGY', 'Coaching sliders for every game your team plays. Changes save right away.')}
      <div class="fr-panel fr-grid2">
        ${slider('pace', 'PACE', 'Grind it out', 'Run and gun', 'How fast your team plays: more possessions per game at the top end.')}
        ${slider('three', 'THREE-POINT EMPHASIS', 'Attack the paint', 'Let it fly', 'How often your offense looks for the three instead of the drive or the post.')}
        ${slider('crash', 'OFFENSIVE REBOUNDING', 'Get back on D', 'Crash the glass', 'Send more players to the glass for second chances, at the cost of transition defense.')}
        <div class="fr-slider"><div class="fr-slider-top"><span class="fr-slider-l">DEFENSIVE STYLE</span><b id="frv-defense">${esc(String(st.defense).toUpperCase())}</b></div>
          <div class="fr-seg" role="radiogroup" aria-label="Defensive style">${DEF.map(([k, t]) =>
            `<button type="button" role="radio" aria-checked="${st.defense === k}" class="${st.defense === k ? 'on' : ''}" data-def="${k}">${t}</button>`).join('')}</div>
          <p class="muted fr-small" id="frDefHelp">${esc((DEF.find(d => d[0] === st.defense) || DEF[0])[2])}</p></div>
      </div>
      <div class="row-btns"><button type="button" class="btn btn-small" id="frStratReset">RESET TO DEFAULTS</button></div>`;
    UI.$$('[data-strat]', body).forEach(r => r.addEventListener('input', () => {
      const k = r.getAttribute('data-strat');
      st[k] = Number(r.value);
      UI.$('#frv-' + k, body).textContent = r.value;
      fr.persist();
    }));
    UI.$$('[data-def]', body).forEach(b => b.addEventListener('click', () => {
      st.defense = b.getAttribute('data-def');
      UI.$$('[data-def]', body).forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
      UI.$('#frv-defense', body).textContent = st.defense.toUpperCase();
      UI.$('#frDefHelp', body).textContent = (DEF.find(d => d[0] === st.defense) || DEF[0])[2];
      fr.persist();
    }));
    UI.$('#frStratReset', body).addEventListener('click', () => {
      team.strategy = { pace: 50, three: 50, defense: 'man', crash: 50 };
      fr.persist(); strategyTab(body, s, team);
    });
  }

  // ---------- coaching staff (names only) ----------
  function coachFromData(id, abbr) {
    const D = window.COACHES;
    if (!D) return null;
    const all = [].concat(D.start || [], D.pool || []);
    const cid = id || (D.startByTeam && D.startByTeam[abbr]);
    return all.find(c => c.id === cid) || null;
  }
  function coachCard(s, c, abbr) {
    const age = c.born ? s.year - c.born : null;
    let rec = '';
    if (window.COACH && typeof window.COACH.record === 'function') {
      const r = fr.call('coach record', () => window.COACH.record(c), null);
      if (r && (r.w || r.l)) rec = `${r.w}-${r.l} in this league`;
    }
    const since = c.hiredYear || c.since;
    return `<div class="fr-coach frr-coach">
      <div class="fr-coach-id"><div>
        <div class="fr-coach-k">HEAD COACH${abbr ? ' | ' + esc(abbr) : ''}</div><div class="fr-coach-n">${esc(c.name)}</div>
        <div class="fr-coach-d">${age ? esc(age) + ' years old' : ''}${since ? ' | since ' + esc(fr.seasonLabel(since)) : ''}${c.titles ? ' | ' + esc(c.titles) + ' title' + (c.titles > 1 ? 's' : '') : ''}${rec ? ' | ' + esc(rec) : ''}</div></div></div>
    </div>`;
  }
  function staffTab(body, s, team) {
    const C = window.COACH;
    if (!C) {
      const c = coachFromData(team.coach, s.userTeam);
      body.innerHTML = UI.header('COACHING STAFF', 'Your head coach.') + (c ? coachCard(s, c, s.userTeam) : '<p class="muted">No coach on record.</p>');
      return;
    }
    if (!s.coaches && typeof C.init === 'function') { fr.call('coach init', () => C.init(s)); fr.persist(); }
    const cur = fr.call('coach of', () => C.of(s, s.userTeam), null);
    const pool = fr.call('available coaches', () => C.available(s, s.year), []) || [];
    const rows = pool.slice(0, 25).map(c => `<tr>
      <td class="l"><b>${esc(c.name)}</b></td>
      <td>${c.born ? esc(s.year - c.born) : '-'}</td>
      <td><button type="button" class="btn btn-small btn-gold" data-hire="${esc(c.id)}">HIRE</button></td></tr>`).join('');
    body.innerHTML = `${UI.header('COACHING STAFF', 'Your head coach. You can fire him and hire someone from the market.')}
      ${cur ? coachCard(s, cur, s.userTeam) + `<div class="row-btns"><button type="button" class="btn btn-small btn-danger" id="frFire">FIRE ${esc(cur.name.toUpperCase())}</button></div>`
        : '<div class="note">You have no head coach. Hire one from the list below before the next game.</div>'}
      ${UI.header('AVAILABLE COACHES', pool.length ? pool.length + ' coaches on the market in ' + esc(fr.seasonLabel(s.year)) + '.' : 'Nobody is on the market right now.')}
      ${rows ? `<div class="tscroll"><table class="stats fr-short"><thead><tr><th class="l">COACH</th><th>AGE</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}`;
    const fire = UI.$('#frFire', body);
    if (fire) fire.addEventListener('click', () => {
      if (!window.confirm('Fire ' + cur.name + '? He will join the coaching market.')) return;
      const r = fr.call('fire', () => C.fire(s, s.userTeam), null);
      if (r && r.ok) { UI.toast && UI.toast(cur.name + ' has been fired.'); fr.persist(); } else UI.toast && UI.toast((r && r.reason) || 'Could not fire the coach.', 'error');
      staffTab(body, s, team);
    });
    UI.$$('[data-hire]', body).forEach(b => b.addEventListener('click', () => {
      const id = b.getAttribute('data-hire');
      const c = s.coaches && s.coaches[id];
      if (cur && !window.confirm('Hire ' + (c ? c.name : 'this coach') + '? ' + cur.name + ' will be let go.')) return;
      const r = fr.call('hire', () => C.hire(s, s.userTeam, id), null);
      if (r && r.ok) { UI.toast && UI.toast((c ? c.name : 'The coach') + ' is your new head coach.'); fr.persist(); } else UI.toast && UI.toast((r && r.reason) || 'Could not hire that coach.', 'error');
      staffTab(body, s, team);
    }));
  }

  // ---------- mood ----------
  const moodClass = v => (v >= 75 ? 'm-great' : v >= 55 ? 'm-good' : v >= 40 ? 'm-ok' : v >= 25 ? 'm-bad' : 'm-angry');
  const moodWord = v => (v >= 80 ? 'ECSTATIC' : v >= 65 ? 'HAPPY' : v >= 50 ? 'CONTENT' : v >= 35 ? 'UNHAPPY' : v >= 20 ? 'UPSET' : 'FURIOUS');
  fr.moodClass = moodClass;
  function moodTab(body, s) {
    const M = window.MOOD;
    if (!M || typeof M.of !== 'function') {
      body.innerHTML = UI.header('LOCKER ROOM', 'How your players feel.') +
        fr.building('Player mood', 'The mood module (<code>js/mood.js</code>) has not loaded, so the reasons behind each player\'s mood are not available yet.');
      return;
    }
    const ctx = typeof M.buildCtx === 'function' ? fr.call('mood ctx', () => M.buildCtx(s), undefined) : undefined;
    const team = s.teams[s.userTeam];
    const rotNow = currentRotation(s, team), ids = rotNow.active.concat(rotNow.inactive), byId = rotNow.byId;
    const gl = userRoster(s, { withGleague: true }).filter(p => p.gleague);
    const list = ids.map(id => byId.get(id)).concat(gl).map(p => ({ p, m: fr.call('mood of', () => M.of(s, p.id, ctx), null) || { score: p.mood || 50, reasons: [] } }));
    const avg = list.length ? Math.round(list.reduce((a, x) => a + (Number(x.m.score) || 0), 0) / list.length) : 0;
    const unhappy = list.filter(x => x.m.score < 40).length;
    const cards = list.map(({ p, m }) => {
      const sc = Math.round(Number(m.score) || 0);
      const tgt = m.target != null && Math.round(m.target) !== sc ? `<span class="fr-mood-trend ${m.target > sc ? 'win' : 'loss'}">${m.target > sc ? '&#9650;' : '&#9660;'} heading to ${Math.round(m.target)}</span>` : '';
      return `<div class="fr-mood">
        <div class="fr-mood-hs">${fr.head(p)}</div>
        <div class="fr-mood-main"><div class="fr-mood-name">${fr.plink(p)} ${fr.badges(p)}</div>
          <div class="fr-mood-bar"><i class="${moodClass(sc)}" style="width:${Math.max(3, Math.min(100, sc))}%"></i></div>
          <div class="fr-mood-word"><b class="${moodClass(sc)}">${moodWord(sc)}</b> <span>${sc}/100</span> ${tgt}</div>
          <ul class="fr-mood-why">${(m.reasons || []).length ? m.reasons.map(r => `<li>${esc(r)}</li>`).join('') : '<li class="muted">No strong feelings either way</li>'}</ul>
        </div></div>`;
    }).join('');
    body.innerHTML = `${UI.header('LOCKER ROOM', 'Mood comes from winning, playing time, money, market size, loyalty and the coach. Unhappy stars complain and may ask for a trade.')}
      <div class="fr-stats3"><div><small>TEAM MOOD</small><b class="${moodClass(avg)}">${avg}</b></div><div><small>UNHAPPY</small><b>${unhappy}</b></div><div><small>TRADE REQUESTS</small><b>${list.filter(x => x.p.tradeRequest).length}</b></div></div>
      <div class="fr-moods">${cards || '<p class="muted">No players on the roster.</p>'}</div>`;
  }

  // ---------- G League ----------
  function affiliate(s, abbr) {
    const G = window.GLEAGUE;
    if (G && typeof G.affiliateOf === 'function') {
      const id = fr.call('affiliateOf', () => G.affiliateOf(abbr, s.year), null);
      if (!id) return 'Flexible assignment (no affiliate this season)';
      return typeof G.clubName === 'function' ? fr.call('clubName', () => G.clubName(id, s.year), id) : id;
    }
    if (G && typeof G.affiliate === 'function') {
      const a = fr.call('affiliate', () => G.affiliate(s, abbr, s.year), null);
      if (a) return typeof a === 'string' ? a : ((a.city ? a.city + ' ' : '') + (a.name || a.id || '')).trim();
    }
    const D = window.GLEAGUE_DATA;
    if (!D || !D.affiliates) return null;
    const ranges = D.affiliates[abbr] || [];
    const r = ranges.find(x => x[0] <= s.year && (x[1] == null || x[1] >= s.year));
    if (!r) return 'Flexible assignment (no affiliate this season)';
    const club = (D.clubs || []).find(c => c.id === r[2]);
    if (!club) return r[2];
    const nm = (club.names || []).filter(n => n.from <= s.year).pop() || (club.names || [])[0];
    return nm ? nm.city + ' ' + nm.name : club.id;
  }
  // GLEAGUE.assign(state, playerId, opts) and GLEAGUE.recall(state, playerId)
  function gleagueCall(fnName, s, p, opts) {
    const G = window.GLEAGUE;
    const fn = G && G[fnName];
    if (typeof fn !== 'function') return { ok: false, reason: 'not built' };
    const r = opts ? fn.call(G, s, p.id, opts) : fn.call(G, s, p.id);
    if (r && typeof r === 'object' && 'ok' in r) return r;
    return { ok: r !== false };
  }
  function gleagueTab(body, s) {
    const G = window.GLEAGUE;
    const all = userRoster(s, { withGleague: true }).sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
    const free = p => (p.yearsPro || 0) < 3 || !!(p.contract && p.contract.twoWay);
    const up = all.filter(p => !p.gleague).sort((a, b) => (free(b) - free(a)) || (b.ovr || 0) - (a.ovr || 0)), down = all.filter(p => p.gleague);
    const aff = affiliate(s, s.userTeam);
    const can = G && typeof G.assign === 'function' && typeof G.recall === 'function';
    const twoWays = all.filter(p => p.contract && p.contract.twoWay).length;
    const extra = p => {
      const bits = [];
      if (G && typeof G.playerStats === 'function') {
        const st = fr.call('gl stats', () => G.playerStats(s, p.id), null);
        if (st && st.g) bits.push(`${st.g} G | ${f1(st.pts)} PTS | ${f1(st.reb)} REB | ${f1(st.ast)} AST`);
      }
      if (p.contract && p.contract.twoWay && tw && tw.allowed && G && typeof G.usage === 'function') {
        const u = fr.call('gl usage', () => G.usage(s, p.id), null);
        if (u) bits.push(`NBA ${esc(tw.limitType)} used: ${esc(u[tw.limitType] || 0)} of ${esc(tw.limit)}`);
      }
      return bits.length ? `<span class="fr-rot-meta fr-gl-stats">${bits.join(' | ')}</span>` : '';
    };
    const line = (p, act) => `<li class="fr-gl-row">
      <span class="fr-rot-hs">${fr.head(p)}</span>
      <span class="fr-rot-main"><span class="fr-rot-name">${fr.plink(p)}</span><span class="fr-rot-meta">${esc(p.pos || '')} | ${esc(p.age || '-')} yrs | ${esc(p.yearsPro != null ? p.yearsPro + ' yrs pro' : '')} ${fr.badges(p)}</span>${extra(p)}</span>
      ${fr.ovr(p)}
      ${can ? `<button type="button" class="btn btn-small${act === 'recall' ? ' btn-gold' : ''}" data-${act}="${esc(p.id)}">${act === 'recall' ? 'RECALL' : 'ASSIGN'}</button>` : '<span></span>'}
    </li>`;
    const eligible = up.filter(free);
    const lname = G && typeof G.leagueName === 'function' ? fr.call('leagueName', () => G.leagueName(s.year), 'G League') : 'G League';
    const tw = G && typeof G.twoWayRules === 'function' ? fr.call('twoWayRules', () => G.twoWayRules(s.year), null) : null;
    body.innerHTML = `${UI.header(String(lname).replace(/^NBA /, '').toUpperCase(), (aff ? 'Affiliate: <b>' + esc(aff) + '</b>. ' : '') + 'Assign players to get them minutes, then recall them.' + (tw ? (tw.allowed ? ' Two-way slots: ' + esc(tw.slots) + ', limit ' + esc(tw.limit) + ' NBA ' + esc(tw.limitType) + '.' : ' Two-way contracts start in 2017-18.') : ''))}
      ${can ? '' : fr.building('G League assignments', 'The G League module (<code>js/gleague.js</code>) has not loaded, so assignments, recalls and G League games are not available yet. Your roster is shown with two-way players marked.')}
      <div class="fr-stats3"><div><small>IN THE G LEAGUE</small><b>${down.length}</b></div><div><small>TWO-WAY CONTRACTS</small><b>${twoWays}</b></div><div><small>ELIGIBLE TO ASSIGN</small><b>${eligible.length}</b></div></div>
      <div class="two-col fr-gl">
        <section>${UI.header('ASSIGNED', 'Playing for the affiliate')}<ul class="fr-gl-list">${down.map(p => line(p, 'recall')).join('') || '<li class="muted fr-gl-none">Nobody is on assignment.</li>'}</ul></section>
        <section>${UI.header('NBA ROSTER', 'Two-way players and players with under three years of service go down freely; veterans must agree')}<ul class="fr-gl-list">${up.map(p => line(p, 'assign')).join('') || '<li class="muted fr-gl-none">No players.</li>'}</ul></section>
      </div>`;
    const act = (kind, id) => {
      const p = s.players[id];
      let r = fr.call(kind, () => gleagueCall(kind, s, p), { ok: false, reason: 'error' });
      if (!r.ok && kind === 'assign' && /agree/i.test(r.reason || '') && window.confirm((r.reason || '') + ' Ask him to accept the assignment?')) {
        r = fr.call(kind, () => gleagueCall(kind, s, p, { consent: true }), { ok: false, reason: 'error' });
      }
      if (r.ok) { UI.toast && UI.toast(p.name + (kind === 'assign' ? ' assigned to the G League.' : ' recalled.')); fr.persist(); }
      else UI.toast && UI.toast(r.reason || r.message || 'That move is not allowed.', 'error');
      gleagueTab(body, s);
    };
    UI.$$('[data-assign]', body).forEach(b => b.addEventListener('click', () => act('assign', b.getAttribute('data-assign'))));
    UI.$$('[data-recall]', body).forEach(b => b.addEventListener('click', () => act('recall', b.getAttribute('data-recall'))));
  }

  // ---------- payroll ----------
  function payrollTotal(s, abbr, year) {
    const C = window.CBA;
    if (C && typeof C.payroll === 'function') {
      const v = fr.call('payroll', () => C.payroll(s, abbr, year), null);
      if (typeof v === 'number' && !isNaN(v)) return v;
      if (v && typeof v === 'object' && typeof v.total === 'number') return v.total;
    }
    return Object.keys(s.players).reduce((a, id) => {
      const p = s.players[id];
      return a + (p && p.team === abbr && !p.retired && !(p.contract && p.contract.twoWay) ? fr.salary(p, year) : 0);
    }, 0);
  }
  fr.payroll = payrollTotal;
  function payrollTab(body, s) {
    const abbr = s.userTeam, y = s.year;
    const C = window.CBA;
    const rules = C && typeof C.rules === 'function' ? fr.call('rules', () => C.rules(y), null) : null;
    const list = Object.keys(s.players).map(id => s.players[id])
      .filter(p => p && p.team === abbr && !p.retired && (fr.salary(p, y) || (p.contract && p.contract.twoWay)))
      .sort((a, b) => fr.salary(b, y) - fr.salary(a, y));
    const total = payrollTotal(s, abbr, y);
    const yrs = [y, y + 1, y + 2, y + 3];
    const futTotals = yrs.map(yr => list.reduce((a, p) => a + (p.contract && p.contract.twoWay ? 0 : fr.salary(p, yr)), 0));
    const opt = p => {
      const o = p.contract && p.contract.option;
      if (!o) return '';
      const t = o.type === 'player' ? 'PO' : o.type === 'team' ? 'TO' : 'ETO';
      return ` <span class="badge fr-b-opt" title="${esc(o.type)} option, ${esc(fr.seasonLabel(o.year))}">${t} ${esc(String(o.year).slice(2))}</span>`;
    };
    const rows = list.map(p => `<tr>
      <td class="l">${fr.plink(p)}${p.contract && p.contract.rookie ? ' <small>rookie scale</small>' : ''}${p.contract && p.contract.twoWay ? ' <span class="badge fr-b-2w">2-WAY</span>' : ''}${p.gleague ? ' <span class="badge fr-b-gl">GL</span>' : ''}${opt(p)}</td>
      <td class="hide-sm">${esc(p.pos || '')}</td><td class="hide-sm">${esc(p.age || '')}</td>
      ${yrs.map((yr, i) => `<td class="${i ? 'hide-sm' : ''}">${fr.salary(p, yr) ? fr.money(fr.salary(p, yr)) : '<span class="muted">-</span>'}</td>`).join('')}
      <td>${esc(fr.seasonLabel(fr.contractEnd(p)))}</td></tr>`).join('');

    let capHtml;
    if (rules && rules.cap) {
      const marks = [['CAP', rules.cap], ['TAX', rules.tax], ['APRON', rules.apron], ['2ND APRON', rules.apron2 || rules.secondApron]].filter(m => m[1]);
      const minP = rules.minPayroll;
      const top = Math.max(total, ...marks.map(m => m[1])) * 1.08;
      const pct = v => Math.max(0, Math.min(100, v / top * 100));
      let status;
      if (total < rules.cap) status = `<b class="win">${fr.money(rules.cap - total)}</b> under the cap: room to sign free agents outright.`;
      else if (rules.tax && total < rules.tax) status = `Over the cap by ${fr.money(total - rules.cap)}, <b class="win">${fr.money(rules.tax - total)}</b> under the luxury tax.`;
      else if (rules.tax) status = `<b class="loss">${fr.money(total - rules.tax)}</b> over the luxury tax line.${rules.apron && total > rules.apron ? ' Above the apron: some exceptions are off limits.' : ''}`;
      else status = `Over the cap by ${fr.money(total - rules.cap)}.`;
      if (minP && total < minP) status += ` Below the salary floor (${fr.money(minP)}).`;
      capHtml = `<div class="fr-cap">
        <div class="fr-cap-track"><i class="${rules.tax && total > rules.tax ? 'over' : total > rules.cap ? 'mid' : ''}" style="width:${pct(total)}%"></i>
          ${marks.map((m, i) => `<span class="fr-cap-mark${i % 2 ? ' below' : ''}" style="left:${pct(m[1])}%"><em>${m[0]}</em><small>${fr.money(m[1])}</small></span>`).join('')}</div>
        <p class="fr-cap-status">${status}</p></div>`;
    } else {
      capHtml = fr.building('Cap, tax and apron lines', 'The CBA module (<code>js/cba.js</code>) has not loaded, so the salary cap, luxury tax and apron for this season are not known yet. The payroll below is added up from the contracts.');
    }
    body.innerHTML = `${UI.header('PAYROLL', esc(fr.seasonLabel(y)) + ' salaries and future commitments. Two-way deals do not count against the cap.')}
      <div class="fr-stats3 fr-money"><div><small>PAYROLL</small><b>${fr.money(total)}</b></div>
        <div><small>CAP SPACE</small><b>${rules && rules.cap ? (total < rules.cap ? fr.money(rules.cap - total) : '$0') : '-'}</b></div>
        <div><small>CONTRACTS</small><b>${list.length}</b></div></div>
      ${capHtml}
      <div class="tscroll"><table class="stats fr-paytable"><thead><tr><th class="l">PLAYER</th><th class="hide-sm">POS</th><th class="hide-sm">AGE</th>
        ${yrs.map((yr, i) => `<th class="${i ? 'hide-sm' : ''}">${esc(fr.seasonLabel(yr))}</th>`).join('')}<th>THROUGH</th></tr></thead>
        <tbody>${rows || '<tr><td class="l muted" colspan="8">No contracts on the books.</td></tr>'}</tbody>
        <tfoot><tr><td class="l">TOTAL</td><td class="hide-sm"></td><td class="hide-sm"></td>${futTotals.map((v, i) => `<td class="${i ? 'hide-sm' : ''}">${fr.money(i ? v : total)}</td>`).join('')}<td></td></tr></tfoot></table></div>`;
  }

  P.manage.navLabel = 'Team';
  P.manage.navDesc = 'Rotation, strategy, coaches, G League and payroll';
})();
