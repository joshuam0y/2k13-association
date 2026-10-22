// Front office pages: team management (#/manage) with rotation, strategy, coaching staff,
// G League, finances, payroll and player mood. Shared franchise helpers live on UI.fr
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
    if (s && s.season && s.year === year && Array.isArray(s.season.days)) {
      const d = s.season.days[Math.max(0, Math.min(day || 0, s.season.days.length - 1))];
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
  const STARTER_MIN = [36, 34, 32, 30, 30];
  const BENCH_MIN = [22, 18, 16, 12, 10];
  const defaultMinutes = i => (i < 5 ? STARTER_MIN[i] : BENCH_MIN[i - 5] || 0);

  function orderedRotation(s, team) {
    const roster = userRoster(s);
    const byId = new Map(roster.map(p => [p.id, p]));
    const saved = Array.isArray(team.rotation) ? team.rotation.filter(id => byId.has(id)) : [];
    const rest = roster.filter(p => !saved.includes(p.id)).sort((a, b) => (b.ovr || 0) - (a.ovr || 0)).map(p => p.id);
    return { ids: saved.concat(rest), byId };
  }

  function applyRotation(s, ids, minutes) {
    const team = s.teams[s.userTeam];
    team.rotation = ids ? ids.slice() : null;
    team.minutes = minutes ? Object.assign({}, minutes) : null;
    // the engine reads season.lineups[abbr] = { starters, minutes } for each game
    if (s.season && typeof s.season === 'object') {
      s.season.lineups = s.season.lineups || {};
      if (ids) s.season.lineups[s.userTeam] = { starters: ids.slice(0, 5), minutes: team.minutes };
      else delete s.season.lineups[s.userTeam];
    }
    fr.persist();
  }

  // ---------- page ----------
  const TABS = [['', 'ROTATION'], ['strategy', 'STRATEGY'], ['staff', 'COACHING'], ['mood', 'LOCKER ROOM'],
    ['gleague', 'G LEAGUE'], ['finances', 'FINANCES'], ['payroll', 'PAYROLL']];

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
    const draw = { '': rotationTab, strategy: strategyTab, staff: staffTab, mood: moodTab, gleague: gleagueTab, finances: financesTab, payroll: payrollTab }[tab];
    draw(body, s, team);
  };

  // ---------- rotation ----------
  function rotationTab(body, s, team) {
    let { ids, byId } = orderedRotation(s, team);
    let minutes = {};
    ids.forEach((id, i) => { minutes[id] = team.minutes && team.minutes[id] != null ? +team.minutes[id] : defaultMinutes(i); });
    const custom = !!team.rotation;

    function row(id, i) {
      const p = byId.get(id);
      const slot = String(i + 1);
      const mood = typeof p.mood === 'number' ? `<span class="fr-moodchip ${moodClass(p.mood)}" title="Mood ${Math.round(p.mood)}">${Math.round(p.mood)}</span>` : '<span></span>';
      return `<li class="fr-rot-row${i < 5 ? ' starter' : ''}" draggable="true" data-id="${esc(id)}" data-i="${i}">
        <span class="fr-grip" aria-hidden="true">&#8942;&#8942;</span>
        <span class="fr-slot">${slot}</span>
        <span class="fr-rot-hs">${fr.head(p)}</span>
        <span class="fr-rot-main"><span class="fr-rot-name">${fr.plink(p)}</span>
          <span class="fr-rot-meta">${esc(p.pos || '')} | ${esc(p.age || '-')} yrs ${fr.badges(p)}</span></span>
        ${mood}
        ${fr.ovr(p)}
        <label class="fr-min"><span>MIN</span><input type="number" inputmode="numeric" min="0" max="48" step="1" value="${Math.round(minutes[id] || 0)}" data-min="${esc(id)}" aria-label="Minutes for ${esc(p.name)}"></label>
        <span class="fr-move"><button type="button" class="fr-mv" data-up="${i}" aria-label="Move ${esc(p.name)} up" ${i === 0 ? 'disabled' : ''}>&#9650;</button><button type="button" class="fr-mv" data-down="${i}" aria-label="Move ${esc(p.name)} down" ${i === ids.length - 1 ? 'disabled' : ''}>&#9660;</button></span>
      </li>`;
    }
    function render() {
      const total = ids.reduce((a, id) => a + (Number(minutes[id]) || 0), 0);
      const items = ids.map((id, i) => (i === 5 ? '<li class="fr-rot-div">BENCH</li>' : '') + row(id, i)).join('');
      body.innerHTML = `${UI.header('ROTATION', 'Drag players, or use the arrows, to set the starting five and the bench order. Minutes are per game targets.')}
        <div class="fr-rot-bar">
          <div class="fr-mintotal ${Math.abs(total - 240) <= 2 ? 'ok' : 'off'}"><b>${total}</b> / 240 MIN</div>
          <span class="fr-rot-state">${team.rotation ? 'Custom rotation saved' : 'Automatic rotation (best players start)'}</span>
          <span class="fr-rot-btns"><button type="button" class="btn btn-small" id="frAutoMin">AUTO MINUTES</button>
          <button type="button" class="btn btn-small" id="frBalance">FIT TO 240</button>
          <button type="button" class="btn btn-small btn-danger" id="frReset">RESET TO AUTO</button></span>
        </div>
        ${Math.abs(total - 240) > 2 ? '<div class="note">A game has 240 player minutes (48 per spot). Use FIT TO 240 to scale the targets.</div>' : ''}
        <div class="fr-rot-head" aria-hidden="true"><span></span><span>#</span><span class="fr-rot-hs"></span><span>PLAYER</span><span>MOOD</span><span>OVR</span><span>MIN</span><span></span></div>
        <ol class="fr-rot" id="frRot">${items || '<li class="fr-rot-div">No players on the roster</li>'}</ol>
        <p class="muted fr-small">The first five are your starters. Two-way and G League players are marked; players assigned to the G League do not appear here.</p>`;
      bind();
    }
    function save() { applyRotation(s, ids, minutes); }
    function move(from, to) {
      if (to < 0 || to >= ids.length || from === to) return;
      const [x] = ids.splice(from, 1);
      ids.splice(to, 0, x);
      save(); render();
      const el = UI.$(`.fr-rot-row[data-i="${to}"] .fr-mv`, body);
      if (el) el.focus();
    }
    function bind() {
      UI.$$('[data-up]', body).forEach(b => b.addEventListener('click', () => { const i = +b.getAttribute('data-up'); move(i, i - 1); }));
      UI.$$('[data-down]', body).forEach(b => b.addEventListener('click', () => { const i = +b.getAttribute('data-down'); move(i, i + 1); }));
      UI.$$('[data-min]', body).forEach(inp => inp.addEventListener('change', () => {
        const v = Math.max(0, Math.min(48, Math.round(Number(inp.value) || 0)));
        minutes[inp.getAttribute('data-min')] = v;
        save(); render();
      }));
      UI.$('#frAutoMin', body).addEventListener('click', () => { ids.forEach((id, i) => { minutes[id] = defaultMinutes(i); }); save(); render(); UI.toast && UI.toast('Minutes reset to the default targets.'); });
      UI.$('#frBalance', body).addEventListener('click', () => {
        const tot = ids.reduce((a, id) => a + (Number(minutes[id]) || 0), 0);
        if (!tot) return;
        ids.forEach(id => { minutes[id] = Math.min(48, Math.round((minutes[id] || 0) * 240 / tot)); });
        let diff = 240 - ids.reduce((a, id) => a + minutes[id], 0);
        for (let i = 0; diff !== 0 && i < ids.length * 2; i++) {
          const id = ids[i % ids.length];
          if (diff > 0 && minutes[id] > 0 && minutes[id] < 48) { minutes[id]++; diff--; } else if (diff < 0 && minutes[id] > 0) { minutes[id]--; diff++; }
        }
        save(); render();
      });
      UI.$('#frReset', body).addEventListener('click', () => {
        applyRotation(s, null, null);
        const o = orderedRotation(s, team); ids = o.ids; byId = o.byId;
        minutes = {}; ids.forEach((id, i) => { minutes[id] = defaultMinutes(i); });
        render(); UI.toast && UI.toast('Back to the automatic rotation.');
      });
      // drag and drop
      let dragFrom = null;
      UI.$$('.fr-rot-row', body).forEach(li => {
        li.addEventListener('dragstart', e => {
          if (e.target && e.target.closest && e.target.closest('input,button,a')) { e.preventDefault(); return; }
          dragFrom = +li.getAttribute('data-i'); li.classList.add('dragging');
          try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', li.getAttribute('data-id')); } catch (x) { /* ignore */ }
        });
        li.addEventListener('dragend', () => { li.classList.remove('dragging'); UI.$$('.fr-rot-row.over', body).forEach(x => x.classList.remove('over')); });
        li.addEventListener('dragover', e => { if (dragFrom == null) return; e.preventDefault(); li.classList.add('over'); });
        li.addEventListener('dragleave', () => li.classList.remove('over'));
        li.addEventListener('drop', e => { e.preventDefault(); const to = +li.getAttribute('data-i'); const f = dragFrom; dragFrom = null; if (f != null) move(f, to); });
      });
    }
    if (!custom && !ids.length) { render(); return; }
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

  // ---------- coaching staff ----------
  function coachFromData(id, abbr) {
    const D = window.COACHES;
    if (!D) return null;
    const all = [].concat(D.start || [], D.pool || []);
    const cid = id || (D.startByTeam && D.startByTeam[abbr]);
    return all.find(c => c.id === cid) || null;
  }
  const coachOvr = c => (window.COACH && typeof window.COACH.ovr === 'function' ? window.COACH.ovr(c)
    : Math.round(0.3 * c.offense + 0.3 * c.defense + 0.2 * c.development + 0.2 * c.motivation));
  function rbar(label, v) {
    const n = Number(v) || 0;
    return `<div class="fr-rbar"><span>${label}</span><i><em style="width:${Math.max(0, Math.min(100, n))}%"></em></i><b>${n || '-'}</b></div>`;
  }
  function coachCard(s, c, abbr) {
    const age = c.born ? s.year - c.born : null;
    let rec = '';
    if (window.COACH && typeof window.COACH.record === 'function') {
      const r = fr.call('coach record', () => window.COACH.record(c), null);
      if (r && (r.w || r.l)) rec = `${r.w}-${r.l} in this league`;
    }
    const since = c.hiredYear || c.since;
    return `<div class="fr-coach">
      <div class="fr-coach-id"><div class="fr-coach-ovr"><b>${coachOvr(c)}</b><span>OVR</span></div>
        <div><div class="fr-coach-k">HEAD COACH${abbr ? ' | ' + esc(abbr) : ''}</div><div class="fr-coach-n">${esc(c.name)}</div>
        <div class="fr-coach-d">${age ? esc(age) + ' years old' : ''}${since ? ' | since ' + esc(fr.seasonLabel(since)) : ''}${c.titles ? ' | ' + esc(c.titles) + ' title' + (c.titles > 1 ? 's' : '') : ''}${rec ? ' | ' + esc(rec) : ''}</div></div></div>
      <div class="fr-coach-r">${rbar('OFFENSE', c.offense)}${rbar('DEFENSE', c.defense)}${rbar('DEVELOPMENT', c.development)}${rbar('MOTIVATION', c.motivation)}</div>
    </div>`;
  }
  function staffTab(body, s, team) {
    const C = window.COACH;
    if (!C) {
      const c = coachFromData(team.coach, s.userTeam);
      body.innerHTML = UI.header('COACHING STAFF', 'Your head coach and his ratings.') +
        (c ? coachCard(s, c, s.userTeam) : '') +
        fr.building('Hiring and firing coaches', 'The coaching module (<code>js/coaches.js</code>) has not loaded, so the coaching market is not open yet.' + (c ? ' The ratings above come from the coach data file.' : ''));
      return;
    }
    if (!s.coaches && typeof C.init === 'function') { fr.call('coach init', () => C.init(s)); fr.persist(); }
    const cur = fr.call('coach of', () => C.of(s, s.userTeam), null);
    const pool = fr.call('available coaches', () => C.available(s, s.year), []) || [];
    const eff = cur && typeof C.effect === 'function' ? fr.call('coach effect', () => C.effect(s, s.userTeam), null) : null;
    const pct = v => (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
    const effHtml = eff ? `<div class="fr-effects">${['offense', 'defense', 'development', 'morale'].map(k =>
      `<span><small>${k.toUpperCase()}</small><b class="${eff[k] > 0 ? 'win' : eff[k] < 0 ? 'loss' : ''}">${pct(eff[k] || 0)}</b></span>`).join('')}</div>` : '';
    const rows = pool.slice(0, 25).map(c => `<tr>
      <td class="l"><b>${esc(c.name)}</b>${c.fictional ? ' <small>new</small>' : ''}</td>
      <td>${coachOvr(c)}</td><td>${esc(c.offense)}</td><td>${esc(c.defense)}</td><td class="hide-sm">${esc(c.development)}</td><td class="hide-sm">${esc(c.motivation)}</td>
      <td class="hide-sm">${c.born ? esc(s.year - c.born) : '-'}</td>
      <td><button type="button" class="btn btn-small btn-gold" data-hire="${esc(c.id)}">HIRE</button></td></tr>`).join('');
    body.innerHTML = `${UI.header('COACHING STAFF', 'Coaches change player development, game decisions and morale a little: at most 3 percent either way.')}
      ${cur ? coachCard(s, cur, s.userTeam) + effHtml + `<div class="row-btns"><button type="button" class="btn btn-small btn-danger" id="frFire">FIRE ${esc(cur.name.toUpperCase())}</button></div>`
        : '<div class="note">You have no head coach. Hire one from the list below before the next game.</div>'}
      ${UI.header('AVAILABLE COACHES', pool.length ? pool.length + ' coaches on the market in ' + esc(fr.seasonLabel(s.year)) + ', best first.' : 'Nobody is on the market right now.')}
      ${rows ? `<div class="tscroll"><table class="stats"><thead><tr><th class="l">COACH</th><th>OVR</th><th>OFF</th><th>DEF</th><th class="hide-sm">DEV</th><th class="hide-sm">MOT</th><th class="hide-sm">AGE</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}`;
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
    const { ids, byId } = orderedRotation(s, team);
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

  // ---------- finances ----------
  function financesTab(body, s, team) {
    const f = team.finances = Object.assign({ revenue: 0, expenses: 0, ticketPrice: 50 }, team.finances || {});
    const b = team.budget = Object.assign({ coaching: 50, facilities: 50, health: 50, scouting: 50 }, team.budget || {});
    const rev = Number(f.revenue) || 0, exp = Number(f.expenses) || 0;
    const profit = rev - exp;
    const BUD = [['coaching', 'COACHING', 'Better assistants: a little more player development.'],
      ['facilities', 'FACILITIES', 'Arena and practice facility: attendance and free agent appeal over time.'],
      ['health', 'HEALTH', 'Training staff: fewer injuries and quicker recoveries.'],
      ['scouting', 'SCOUTING', 'Sharper draft prospect ratings before the draft.']];
    const lvl = v => (v >= 80 ? 'TOP OF THE LEAGUE' : v >= 60 ? 'ABOVE AVERAGE' : v >= 40 ? 'AVERAGE' : v >= 20 ? 'BELOW AVERAGE' : 'BARE BONES');
    const pay = payrollTotal(s, s.userTeam, s.year);
    const lines = [
      ['Ticket sales and gate', f.ticketRevenue], ['Merchandise', f.merch], ['TV and media', f.tv || f.media], ['Sponsorship', f.sponsors],
      ['Player salaries', f.salaries], ['Budget items', f.budgetExpenses], ['Luxury tax', f.tax]
    ].filter(x => x[1]);
    body.innerHTML = `${UI.header('FINANCES', 'Set ticket prices and department budgets. The owner watches the bottom line.')}
      <div class="fr-stats3 fr-money">
        <div><small>REVENUE</small><b>${rev ? fr.money(rev) : '$0'}</b></div>
        <div><small>EXPENSES</small><b>${exp ? fr.money(exp) : '$0'}</b></div>
        <div><small>PROFIT</small><b class="${profit > 0 ? 'win' : profit < 0 ? 'loss' : ''}">${profit < 0 ? '-' : ''}${profit ? fr.money(Math.abs(profit)) : '$0'}</b></div>
      </div>
      ${!rev && !exp ? '<p class="muted fr-small">Revenue and expenses add up as home games are played. This season has nothing on the books yet.</p>' : ''}
      ${lines.length ? `<div class="tscroll"><table class="stats"><tbody>${lines.map(x => `<tr><td class="l">${esc(x[0])}</td><td>${fr.money(x[1])}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="fr-panel">
        <div class="fr-slider"><div class="fr-slider-top"><span class="fr-slider-l">TICKET PRICE</span><b id="frv-ticket">$${esc(f.ticketPrice)}</b></div>
          <input type="range" min="10" max="250" step="1" value="${Number(f.ticketPrice) || 50}" id="frTicket" aria-label="Ticket price">
          <div class="fr-slider-ends"><span>$10, packed house</span><span>$250, premium</span></div>
          <p class="muted fr-small">Average ticket price. Higher prices bring more per seat but fewer fans, and fans care more when the team is losing.</p></div>
      </div>
      ${UI.header('BUDGET', 'Each department from 0 to 100. 50 is the league average.')}
      <div class="fr-panel fr-grid2">${BUD.map(([k, t, h]) => `<div class="fr-slider">
        <div class="fr-slider-top"><span class="fr-slider-l">${t}</span><b id="frv-b-${k}">${esc(b[k])}</b></div>
        <input type="range" min="0" max="100" step="1" value="${Number(b[k]) || 0}" data-bud="${k}" aria-label="${t} budget">
        <div class="fr-slider-ends"><span id="frl-b-${k}">${lvl(b[k])}</span><span></span></div>
        <p class="muted fr-small">${h}</p></div>`).join('')}</div>
      <p class="muted fr-small">Payroll this season: <b>${fr.money(pay)}</b>. See the PAYROLL tab for the cap and tax lines.</p>`;
    UI.$('#frTicket', body).addEventListener('input', e => { f.ticketPrice = Number(e.target.value); UI.$('#frv-ticket', body).textContent = '$' + f.ticketPrice; fr.persist(); });
    UI.$$('[data-bud]', body).forEach(r => r.addEventListener('input', () => {
      const k = r.getAttribute('data-bud');
      b[k] = Number(r.value);
      UI.$('#frv-b-' + k, body).textContent = r.value;
      UI.$('#frl-b-' + k, body).textContent = lvl(b[k]);
      fr.persist();
    }));
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
          ${marks.map(m => `<span class="fr-cap-mark" style="left:${pct(m[1])}%"><em>${m[0]}</em><small>${fr.money(m[1])}</small></span>`).join('')}</div>
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
  P.manage.navDesc = 'Rotation, strategy, coaches, G League, finances and payroll';
})();
