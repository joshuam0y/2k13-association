// Draft Challenge pages (#/challenge): setup, the pick board (free pick or the wheel), the all-time snake
// draft, the season sim with a live record, and the results card. Logic lives in js/challenge.js.
// Results stay in this browser (localStorage), apart from the Association saves.
(function () {
  'use strict';
  const UI = window.UI;
  const C = window.CHALLENGE;
  if (!UI || !C) return;
  const P = UI.pages = UI.pages || {};
  const esc = UI.esc;
  const KEY_SETUP = 'a13-ch-setup', KEY_CUR = 'a13-ch-cur', KEY_RES = 'a13-ch-results';
  const POS = ['PG', 'SG', 'SF', 'PF', 'C'];
  const BUILD = {
    free: { label: 'PICK ANY FIVE', note: 'Search the whole league and take whoever you want.' },
    wheel: { label: 'SPIN THE WHEEL', note: 'Five spins. Take one player from each team the wheel lands on. One re-spin.' }
  };

  const ls = {
    get(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  let SETUP = Object.assign({ mode: 'year', year: 2013, build: 'free', team: '', name: '', injuries: true, era: 2013 }, ls.get(KEY_SETUP) || {});
  let CUR = null;        // { cfg, used: [], respins, spin, dr }
  let RUN = null;        // the season being simmed { ch, fast, paused }
  let VIEW = { pos: '', q: '', team: '', season: '', letter: '' };
  let ODDS = null;       // run it back 10 times

  // ---------- small helpers ----------
  const seasonLabel = y => (C.seasonInfo(y) || {}).label || String(y);
  const short = y => "'" + String(y - 1).slice(2) + '-' + String(y).slice(2);
  function teamOf(list, abbr) { return (list || []).find(t => t.abbr === abbr) || { abbr, city: abbr, name: '', colors: ['#333', '#777'], logo: null }; }
  function tName(t) { return ((t.city || '') + ' ' + (t.name || '')).trim(); }
  function logo(t, size) {
    const c1 = (t.colors && t.colors[0]) || '#333', c2 = (t.colors && t.colors[1]) || '#999';
    const img = t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy"${t.logoNoRef ? ' referrerpolicy="no-referrer"' : ''} onerror="this.parentNode.classList.add('nologo');this.remove()">` : '';
    return `<span class="logo${t.logo ? '' : ' nologo'}" style="--c1:${esc(c1)};--c2:${esc(c2)};--sz:${size || 40}px" title="${esc(tName(t))}">${img}<b>${esc(t.abbr)}</b></span>`;
  }
  function face(p, color, cls) {
    const k = 'hs ' + (cls || '');
    if (!p || !p.nbaId) return `<img class="${k} hs-fallback" src="${UI.faceSvg(color || '#444')}" alt="">`;
    return `<img class="${k}" src="https://cdn.nba.com/headshots/nba/latest/260x190/${esc(p.nbaId)}.png" data-c="${esc(color || '#444')}" alt="" loading="lazy" onerror="UI.faceFallback(this)">`;
  }
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const pct = v => v == null ? '-' : v.toFixed(1);
  function saveCur() {
    if (!CUR) { ls.del(KEY_CUR); return; }
    ls.set(KEY_CUR, { cfg: CUR.cfg, used: CUR.used, respins: CUR.respins, spin: CUR.spin, draft: CUR.dr ? CUR.dr.picks.map(x => x.key) : null });
  }
  function results() { return ls.get(KEY_RES) || []; }
  function keepResult(r) {
    const list = results();
    list.unshift(r);
    while (list.length > 8) list.pop();
    // a full browser storage: drop the oldest until it fits
    while (list.length && !ls.set(KEY_RES, list)) list.pop();
  }
  function seasonTeams(cfg) { const d = C.seasonData(cfg.mode === 'alltime' ? 2013 : cfg.year); return d ? d.teams : []; }

  // Restores a challenge in progress after a reload.
  function restore() {
    if (CUR) return true;
    const s = ls.get(KEY_CUR);
    if (!s || !s.cfg) return false;
    if (s.cfg.mode === 'alltime' && !C.loaded(2013)) return false;
    if (s.cfg.mode !== 'alltime' && !C.loaded(s.cfg.year)) return false;
    try {
      CUR = { cfg: s.cfg, used: s.used || [], respins: s.respins != null ? s.respins : 1, spin: s.spin || null, dr: null };
      if (s.cfg.mode === 'alltime') {
        CUR.dr = C.newDraft(s.cfg);
        (s.draft || []).forEach(k => C.draftPick(CUR.dr, k));
      }
      return true;
    } catch (e) { console.warn('[challenge] could not restore', e); CUR = null; ls.del(KEY_CUR); return false; }
  }

  const needYears = cfg => cfg.mode === 'alltime' ? ['pool', 2013] : [cfg.year];
  const loadFor = cfg => Promise.all(needYears(cfg).map(y => C.load(y)));
  function ensureData(cfg, app, then) {
    if (needYears(cfg).every(y => C.loaded(y))) { then(); return; }
    app.innerHTML = `<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING THE ${cfg.mode === 'alltime' ? 'ALL-TIME POOL' : esc(seasonLabel(cfg.year)) + ' ROSTERS'}...</div></section>`;
    loadFor(cfg)
      .then(then)
      .catch(e => { app.innerHTML = UI.empty('ROSTERS DID NOT LOAD', esc(e && e.message ? e.message : e), '<div class="row-btns"><a class="btn" href="#/challenge">BACK</a></div>'); });
  }

  // =====================================================================
  // Setup
  // =====================================================================
  P.challenge = function (app, arg) {
    if (!(window.ENGINE && typeof window.ENGINE.newSeason === 'function')) {
      app.innerHTML = UI.empty('SIM ENGINE NOT LOADED', 'The Draft Challenge needs the game engine (<code>js/engine.js</code>), which did not load.', '<div class="row-btns"><a class="btn" href="#/home">HOME</a></div>');
      return;
    }
    const part = String(arg || '').split('/');
    if (part[0] === 'pick') {
      if (!restore()) { const s = ls.get(KEY_CUR); if (s && s.cfg) { ensureData(s.cfg, app, () => P.challenge(app, 'pick')); return; } location.hash = '#/challenge'; return; }
      ensureData(CUR.cfg, app, () => (CUR.cfg.mode === 'alltime' ? drawDraft(app) : drawPick(app)));
      return;
    }
    if (part[0] === 'sim') { drawSim(app); return; }
    if (part[0] === 'game') { drawGame(app, +part[1] || 0, part[2] || ''); return; }
    if (part[0] === 's') { openShared(app, part.slice(1).join('/')); return; }
    if (part[0] === 'result') { drawResult(app, part[1] != null && part[1] !== '' ? +part[1] : 0); return; }
    drawSetup(app);
  };
  P.challenge.navLabel = 'Draft Challenge';
  P.challenge.navDesc = 'Pick a starting five from any season and sim it';

  function drawSetup(app) {
    const s = SETUP;
    const isAll = s.mode === 'alltime';
    const year = isAll ? 2013 : s.year;
    const ready = C.loaded(year);
    const teams = ready ? C.seasonData(year).teams.slice().sort((a, b) => tName(a).localeCompare(tName(b))) : [];
    if (s.team && ready && !teams.some(t => t.abbr === s.team)) s.team = '';
    const past = results();
    const seasonBtns = C.SEASONS.map(x => {
      const off = x.ready === false;
      return `<button type="button" class="ch-chip${!isAll && s.year === x.year ? ' on' : ''}" data-year="${x.year}"${off ? ' disabled' : ''}>${esc(x.label)}${off ? '<small>SOON</small>' : ''}</button>`;
    }).join('');
    const eraBtns = C.SEASONS.filter(x => x.ready !== false).map(x => `<button type="button" class="ch-chip${+s.era === x.year ? ' on' : ''}" data-era="${x.year}">${esc(x.label)}</button>`).join('');
    app.innerHTML = `
      <section class="ch-hero">
        <div class="ch-hero-k">DRAFT CHALLENGE</div>
        <h1 class="ch-hero-t">PICK FIVE. SIM A SEASON.</h1>
        <p class="ch-hero-p">Build a starting five, drop them on a franchise with a bench of scrubs and see how far they go. Your five play 38 to 40 minutes a night. Separate from your Association saves.</p>
      </section>
      <div class="ch-setup">
        <div class="ch-step"><div class="ch-step-k">1 | THE POOL</div>
          <div class="ch-seg">
            <button type="button" class="ch-seg-b${!isAll ? ' on' : ''}" data-mode="year"><b>ONE SEASON</b><small>The real league of one year</small></button>
            <button type="button" class="ch-seg-b${isAll ? ' on' : ''}" data-mode="alltime"><b>ALL-TIME</b><small>Vets from every season, 30 teams draft</small></button>
            <a class="ch-seg-b" href="#/challenge/vs"><b>VERSUS</b><small>Two players, one phone, then a showdown</small></a>
          </div>
          ${isAll ? `<div class="ch-sub">ERA RULES (PACE AND THREES)</div><div class="ch-chips ch-swipe">${eraBtns}</div>` : `<div class="ch-chips ch-swipe">${seasonBtns}</div>`}
        </div>
        <div class="ch-step"><div class="ch-step-k">2 | HOW YOU BUILD</div>
          <div class="ch-seg">${Object.keys(BUILD).map(k => `<button type="button" class="ch-seg-b${s.build === k ? ' on' : ''}" data-build="${k}"><b>${BUILD[k].label}</b><small>${esc(isAll && k === 'free' ? 'Snake draft: take anyone left when you are up.' : isAll ? 'When you are up, the wheel picks a team and season.' : BUILD[k].note)}</small></button>`).join('')}</div>
        </div>
        <div class="ch-step"><div class="ch-step-k">3 | YOUR FRANCHISE</div>
          <p class="muted ch-small">${isAll ? 'Every team drafts five. You get this franchise\'s name and court.' : 'You take over this team. Its real roster leaves, and your five plus the scrubs take its place.'}</p>
          ${ready ? `<div class="ch-teams">${teams.map(t => `<button type="button" class="ch-team${s.team === t.abbr ? ' on' : ''}" data-team="${esc(t.abbr)}" style="--c1:${esc(t.colors[0])}">${logo(t, 34)}<span>${esc(t.name)}</span></button>`).join('')}</div>` : '<p class="muted">Loading teams...</p>'}
          <div class="ch-row">
            <label class="field"><span>TEAM NAME (OPTIONAL)</span><input id="chName" maxlength="32" placeholder="${esc(s.team ? tName(teamOf(teams, s.team)) : 'Keep the real name')}" value="${esc(s.name || '')}"></label>
            <div class="field"><span>INJURIES</span><div class="ch-seg ch-seg-sm"><button type="button" class="ch-seg-b${s.injuries ? ' on' : ''}" data-inj="1"><b>ON</b></button><button type="button" class="ch-seg-b${!s.injuries ? ' on' : ''}" data-inj="0"><b>OFF</b></button></div></div>
          </div>
        </div>
        <div class="ch-go"><button type="button" class="btn btn-gold btn-big" id="chStart"${s.team ? '' : ' disabled'}>${s.team ? 'START THE DRAFT' : 'PICK A FRANCHISE'}</button>
          ${ls.get(KEY_CUR) ? '<a class="btn" href="#/challenge/pick">BACK TO MY DRAFT</a>' : ''}</div>
      </div>
      ${past.length ? `<section class="ch-past">${UI.header('YOUR RESULTS', 'Saved in this browser')}<div class="ch-past-list">${past.map((r, i) => `<a class="ch-past-i${r.exit === 'champion' ? ' champ' : ''}" href="#/challenge/result/${i}">${logo(r.team, 30)}<span><b>${esc(tName(r.team))}</b><small>${esc(r.label)} | ${esc(r.five.map(x => x.name.split(' ').slice(-1)[0]).join(', '))}</small></span><span class="ch-past-r"><b>${r.w}-${r.l}</b><small>${esc(r.exit === 'champion' ? 'CHAMPIONS' : r.result)}</small></span></a>`).join('')}</div></section>` : ''}`;

    UI.centerChips(app);
    const redraw = () => { ls.set(KEY_SETUP, SETUP); drawSetup(app); };
    app.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { SETUP.mode = b.dataset.mode; SETUP.team = ''; redraw(); }));
    app.querySelectorAll('[data-year]').forEach(b => b.addEventListener('click', () => {
      SETUP.year = +b.dataset.year; SETUP.team = '';
      if (!C.loaded(SETUP.year)) C.load(SETUP.year).then(() => drawSetup(app)).catch(e => UI.toast(e.message, 'error'));
      redraw();
    }));
    app.querySelectorAll('[data-era]').forEach(b => b.addEventListener('click', () => { SETUP.era = +b.dataset.era; redraw(); }));
    app.querySelectorAll('[data-build]').forEach(b => b.addEventListener('click', () => { SETUP.build = b.dataset.build; redraw(); }));
    app.querySelectorAll('[data-inj]').forEach(b => b.addEventListener('click', () => { SETUP.injuries = b.dataset.inj === '1'; redraw(); }));
    app.querySelectorAll('[data-team]').forEach(b => b.addEventListener('click', () => { SETUP.team = b.dataset.team; redraw(); }));
    const nm = UI.$('#chName');
    nm.addEventListener('input', () => { SETUP.name = nm.value; ls.set(KEY_SETUP, SETUP); });
    if (!ready) C.load(year).then(() => drawSetup(app)).catch(e => UI.toast(e.message, 'error'));
    UI.$('#chStart').addEventListener('click', () => {
      if (!SETUP.team) return;
      const cfg = { mode: SETUP.mode, year: isAll ? 2013 : SETUP.year, build: SETUP.build, team: SETUP.team, name: (SETUP.name || '').trim(),
        injuries: SETUP.injuries, era: SETUP.era || 2013, seed: Math.floor(Math.random() * 2147483646) + 1, picks: [] };
      ensureData(cfg, app, () => {
        try {
          CUR = { cfg, used: [], respins: 1, spin: null, dr: isAll ? C.newDraft(cfg) : null };
          VIEW = { pos: '', q: '', team: '', season: '', letter: '' };
          saveCur();
          location.hash = '#/challenge/pick';
        } catch (e) { UI.toast('Could not start: ' + (e && e.message ? e.message : e), 'error'); }
      });
    });
  }

  // =====================================================================
  // One season: pick five
  // =====================================================================
  // The lineup card: where each pick plays and how the five fit (js/challenge.js lineupFit). Shared with js/ui-versus.js.
  const lastName = n => { const w = String(n || '').split(' '); return w.length > 1 && /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w[w.length - 1]) ? w[w.length - 2] : w[w.length - 1]; };
  const FIT_CLS = v => (v > 0 ? 'up' : v < 0 ? 'down' : 'ok');
  function fitHtml(fit, opts) {
    if (!fit) return '';
    opts = opts || {};
    const slots = fit.slots.map(x => x.id
      ? `<li class="${x.pen >= 1.5 ? 'off' : ''}" title="${esc(x.name)}"><i>${x.slot}</i><b>${esc(lastName(x.name))}</b>${x.pen >= 1.5 ? `<small>natural ${esc(x.pos)}</small>` : ''}</li>`
      : `<li class="open"><i>${x.slot}</i><b class="muted">open</b></li>`).join('');
    const parts = fit.parts.map(x => `<li class="${FIT_CLS(x.v)}"><span>${esc(x.k)}</span><b>${esc(x.word)}</b></li>`).join('');
    return `<section class="ch-fit${opts.compact ? ' compact' : ''}"><div class="ch-fit-h"><span class="ch-fit-k">${esc(opts.title || 'LINEUP')}</span>${fit.word ? `<b class="ch-fit-w ${fit.team >= 0.5 && !/BAD|HOLES/.test(fit.word) ? 'up' : /BAD/.test(fit.word) ? 'down' : 'ok'}">${esc(fit.word)}</b>` : '<span class="muted ch-small">Pick five to see how they fit</span>'}</div>
      <ul class="ch-fit-slots">${slots}</ul>${parts ? `<ul class="ch-fit-parts">${parts}</ul>` : ''}</section>`;
  }
  UI.challengeFit = fitHtml;
  // the wheel, for js/ui-versus.js: UI.challengeWheel.strip(teams) and .animate(app, teams, done, spin, cfg)
  UI.challengeWheel = { strip: teams => wheelStrip(teams), animate: (app, teams, done, s, cfg) => animateSpin(app, teams, done, s, cfg) };
  // Draft lists go A to Z by last name, never by rating (the order would give the ratings away). A long list
  // shows one letter at a time (the letter bar) unless a search or a team narrows it.
  const sortKey = n => { const w = String(n || '').split(' '); const last = w.length > 1 && /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w[w.length - 1]) ? w[w.length - 2] : w[w.length - 1]; return (last + ' ' + w.join(' ')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); };
  const alpha = list => list.slice().sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)));
  UI.challengeAlpha = alpha;
  function byLetter(list, narrowed) {
    const sorted = alpha(list);
    if (narrowed || sorted.length <= 60) return { rows: sorted, bar: '' };
    const letter = p => sortKey(p.name).charAt(0).toUpperCase();
    const letters = [...new Set(sorted.map(letter))];
    if (!letters.includes(VIEW.letter)) VIEW.letter = letters[0];
    const bar = `<div class="ch-letters ch-swipe">${letters.map(l => `<button type="button" class="ch-chip sm${l === VIEW.letter ? ' on' : ''}" data-letter="${l}">${l}</button>`).join('')}</div>`;
    return { rows: sorted.filter(p => letter(p) === VIEW.letter), bar };
  }
  function slotsHtml(list, teams, removable) {
    const out = [];
    for (let i = 0; i < 5; i++) {
      const p = list[i];
      if (!p) { out.push(`<div class="ch-slot empty"><span class="ch-slot-n">${i + 1}</span><span class="ch-slot-e">PICK ${i + 1}</span></div>`); continue; }
      const from = p.from || p.team;
      const t = p.season && p.season !== 2013 && C.eraTeam(p.season, from) || teamOf(teams, from);
      out.push(`<div class="ch-slot" style="--c1:${esc((t.colors || ['#333'])[0])}">${face(p, (t.colors || ['#444'])[0], 'ch-slot-hs')}
        <span class="ch-slot-b"><b>${esc(p.name)}</b><small>${esc(C.primaryPos(p.pos))} | ${p.label ? esc(short(p.season)) + ' ' : ''}${esc(t.abbr)}</small></span><span class="ch-ovr ${UI.ovrClass(p.ovr)}">${p.ovr}</span>
        ${removable ? `<button type="button" class="ch-x" data-drop="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">&times;</button>` : ''}</div>`);
    }
    return `<div class="ch-slots">${out.join('')}</div>`;
  }
  function playerRow(p, teams, btn) {
    const from = p.from || p.team;
    const t = p.season && p.season !== 2013 && C.eraTeam(p.season, from) || teamOf(teams, from);
    return `<li class="ch-pl">${face(p, (t.colors || ['#444'])[0])}<span class="ch-pl-b"><b>${esc(p.name)}</b><small>${logo(t, 18)} ${esc(String(p.pos || '').replace(/-/g, '/'))}${p.age ? ' | ' + p.age : ''}${p.label ? ' | ' + esc(p.label) : ''}</small></span>
      <span class="ch-ovr ${UI.ovrClass(p.ovr)}">${p.ovr}</span>${btn || ''}</li>`;
  }

  function drawPick(app) {
    const cfg = CUR.cfg, d = C.seasonData(cfg.year), teams = d.teams;
    const me = teamOf(teams, cfg.team);
    const byId = {};
    d.players.concat(d.free).forEach(p => { byId[p.id] = p; });
    const mine = cfg.picks.map(id => byId[id]).filter(Boolean);
    const full = mine.length >= 5;
    let body = '';
    if (cfg.build === 'wheel') body = wheelHtml(cfg, teams, full);
    else if (!full) {
      const q = VIEW.q.trim().toLowerCase();
      const list = d.players.filter(p => cfg.picks.indexOf(p.id) < 0 && (!VIEW.pos || C.primaryPos(p.pos) === VIEW.pos) && (!VIEW.team || p.team === VIEW.team) && (!q || p.name.toLowerCase().indexOf(q) >= 0));
      body = `<div class="ch-filters">${[''].concat(POS).map(x => `<button type="button" class="ch-chip sm${VIEW.pos === x ? ' on' : ''}" data-pos="${x}">${x || 'ALL'}</button>`).join('')}
          <select id="chTeamF" aria-label="Team"><option value="">ALL TEAMS</option>${teams.slice().sort((a, b) => tName(a).localeCompare(tName(b))).map(t => `<option value="${esc(t.abbr)}"${VIEW.team === t.abbr ? ' selected' : ''}>${esc(tName(t))}</option>`).join('')}</select>
          <input id="chQ" placeholder="Search players" value="${esc(VIEW.q)}" autocomplete="off"></div>
        ${(() => { const L = byLetter(list, !!(q || VIEW.team)); return L.bar + `<ul class="ch-list">${L.rows.map(p => playerRow(p, teams, `<button type="button" class="btn btn-small btn-gold" data-add="${esc(p.id)}">ADD</button>`)).join('')}</ul>`; })()}
        ${list.length ? '' : '<p class="muted">Nobody matches.</p>'}`;
    }
    app.innerHTML = `
      <div class="ch-top">${logo(me, 48)}<div><div class="ch-top-k">${esc(seasonLabel(cfg.year))} | ${esc(BUILD[cfg.build].label)}</div><div class="ch-top-t">${esc(cfg.name || tName(me))}</div></div>
        <a class="btn btn-small" href="#/challenge">SETUP</a></div>
      ${slotsHtml(mine, teams, cfg.build === 'free')}
      ${mine.length ? fitHtml(C.lineupFit(mine)) : ''}
      ${full ? `<div class="ch-ready"><div><b>YOUR FIVE IS SET.</b><span class="muted"> Eight scrubs fill the bench.</span></div><button type="button" class="btn btn-gold btn-big" id="chSim">SIM THE SEASON</button></div>` : ''}
      ${body}`;
    bindPick(app);
  }

  function wheelHtml(cfg, teams, full) {
    const left = 5 - cfg.picks.length;
    if (full) return '';
    if (!CUR.spin) {
      return `<section class="ch-wheel">${wheelStrip(teams)}<div class="ch-wheel-k">SPIN ${cfg.picks.length + 1} OF 5</div>
        <button type="button" class="btn btn-gold btn-big" id="chSpin">SPIN THE WHEEL</button><p class="muted ch-small">${left} spin${left === 1 ? '' : 's'} left${CUR.respins ? ', one re-spin saved' : ''}.</p></section>`;
    }
    const s = CUR.spin, t = cfg.mode === 'alltime' ? (C.eraTeam(s.year, s.abbr) || teamOf(teams, s.abbr)) : teamOf(teams, s.abbr);
    const ros = alpha(C.spinRoster(cfg, s, CUR.dr));
    return `<section class="ch-landed" style="--c1:${esc(t.colors[0])}">${logo(t, 64)}<div><div class="ch-wheel-k">THE WHEEL SAYS</div><div class="ch-landed-t">${cfg.mode === 'alltime' ? esc(seasonLabel(s.year)) + ' ' : ''}${esc(tName(t))}</div></div>
        ${CUR.respins ? '<button type="button" class="btn btn-small" id="chRespin">RE-SPIN (1 LEFT)</button>' : ''}</section>
      <ul class="ch-list">${ros.map(p => playerRow(p, teams, `<button type="button" class="btn btn-small btn-gold" data-take="${esc(p.key || p.id)}">TAKE</button>`)).join('')}</ul>`;
  }
  // The wheel: a reel of team cards that speeds past and slows to a stop exactly on the team you got.
  const REEL_W = 132, REEL_GAP = 10, REEL_AT = 32, REEL_N = 38;
  function reelCard(t, season, cls) {
    const c1 = (t.colors && t.colors[0]) || '#333', c2 = (t.colors && t.colors[1]) || '#777';
    return `<div class="ch-rcard${cls ? ' ' + cls : ''}" style="--c1:${esc(c1)};--c2:${esc(c2)}">${logo(t, 58)}<b>${esc(t.name || t.abbr)}</b>${season ? `<small>${esc(seasonLabel(season))}</small>` : ''}</div>`;
  }
  function wheelStrip(teams) {
    const list = teams.slice(0, 9);
    return `<div class="ch-reel" aria-hidden="true"><div class="ch-reel-in">${list.concat(list).map(t => reelCard(t)).join('')}</div><i class="ch-reel-mark"></i></div>`;
  }
  // lands on spin s (a { year, abbr } from C.spin); done() runs once the winning card has lit up
  function animateSpin(app, teams, done, s, cfg) {
    const btn = UI.$('#chSpin') || UI.$('#chRespin');
    if (btn) btn.disabled = true;
    let reel = app.querySelector('.ch-reel');
    if (!reel) {
      // a re-spin from the landed card: put a reel in its place
      const host = app.querySelector('.ch-landed');
      if (!host) { done(); return; }
      host.insertAdjacentHTML('beforebegin', '<section class="ch-wheel">' + wheelStrip(teams) + '</section>');
      reel = app.querySelector('.ch-reel');
    }
    const strip = reel.querySelector('.ch-reel-in');
    const alltime = cfg && cfg.mode === 'alltime';
    const winner = s ? (alltime ? C.eraTeam(s.year, s.abbr) : null) || teams.find(t => t.abbr === s.abbr) : null;
    if (!strip || !winner) { done(); return; }
    // the reel deals teams like a shuffled deck: every team once per pass, never the same one twice in a row
    const deck = [];
    while (deck.length < REEL_N + 2) {
      const sh = teams.slice();
      for (let k = sh.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [sh[k], sh[j]] = [sh[j], sh[k]]; }
      if (deck.length && sh[0].abbr === deck[deck.length - 1].abbr) sh.push(sh.shift());
      deck.push(...sh);
    }
    [REEL_AT - 1, REEL_AT + 1].forEach(k => { if (deck[k] && deck[k].abbr === winner.abbr) { const j = k + 3; [deck[k], deck[j]] = [deck[j], deck[k]]; } });
    const cards = [];
    for (let i = 0; i < REEL_N; i++) {
      if (i === REEL_AT) { cards.push(reelCard(winner, alltime ? s.year : null, 'win')); continue; }
      const t = deck[i];
      const yr = alltime ? C.poolSeasons()[Math.floor(Math.random() * C.poolSeasons().length)] : null;
      cards.push(reelCard(t, yr));
    }
    strip.innerHTML = cards.join('');
    strip.style.transition = 'none';
    strip.style.transform = 'translateX(0px)';
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const view = reel.clientWidth, jitter = (Math.random() - 0.5) * REEL_W * 0.6;
    const target = REEL_AT * (REEL_W + REEL_GAP) + REEL_W / 2 - view / 2 + jitter;
    const land = () => {
      const w = strip.querySelector('.ch-rcard.win');
      if (w) w.classList.add('lit');
      reel.classList.add('landed');
      setTimeout(done, reduce ? 150 : 900);
    };
    if (reduce) { strip.style.transform = `translateX(${-target}px)`; land(); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      strip.style.transition = 'transform 4.2s cubic-bezier(.08,.72,.12,1)';
      strip.style.transform = `translateX(${-target}px)`;
    }));
    let fired = false;
    const end = () => { if (fired) return; fired = true; land(); };
    strip.addEventListener('transitionend', end, { once: true });
    setTimeout(end, 4600);
  }

  function bindPick(app) {
    const cfg = CUR.cfg;
    const redraw = () => { saveCur(); cfg.mode === 'alltime' ? drawDraft(app) : drawPick(app); };
    app.querySelectorAll('[data-pos]').forEach(b => b.addEventListener('click', () => { VIEW.pos = b.dataset.pos; redraw(); }));
    app.querySelectorAll('[data-letter]').forEach(b => b.addEventListener('click', () => { VIEW.letter = b.dataset.letter; redraw(); }));
    UI.centerChips(app);
    const tf = UI.$('#chTeamF');
    if (tf) tf.addEventListener('change', () => { VIEW.team = tf.value; redraw(); });
    const sf = UI.$('#chSeasonF');
    if (sf) sf.addEventListener('change', () => { VIEW.season = sf.value; redraw(); });
    const qi = UI.$('#chQ');
    if (qi) qi.addEventListener('input', () => {
      VIEW.q = qi.value;
      const at = qi.selectionStart;
      redraw();
      const again = UI.$('#chQ');
      if (again) { again.focus(); try { again.setSelectionRange(at, at); } catch (e) { /* ignore */ } }
    });
    app.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
      if (cfg.picks.length >= 5) return;
      cfg.picks.push(b.dataset.add);
      redraw();
      if (cfg.picks.length === 5) window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    app.querySelectorAll('[data-drop]').forEach(b => b.addEventListener('click', () => { cfg.picks = cfg.picks.filter(id => id !== b.dataset.drop); redraw(); }));
    const spinBtn = UI.$('#chSpin');
    if (spinBtn) spinBtn.addEventListener('click', () => {
      const s = C.spin(cfg, CUR.used, Math.random, CUR.dr);
      if (!s) { UI.toast('No teams left to spin.', 'error'); return; }
      animateSpin(app, seasonTeams(cfg), () => { CUR.spin = s; CUR.used.push(s.key); redraw(); }, s, cfg);
    });
    const re = UI.$('#chRespin');
    if (re) re.addEventListener('click', () => {
      if (!CUR.respins) return;
      const s = C.spin(cfg, CUR.used, Math.random, CUR.dr);
      if (!s) { UI.toast('No other teams left.', 'error'); return; }
      CUR.respins--;
      animateSpin(app, seasonTeams(cfg), () => { CUR.spin = s; CUR.used.push(s.key); redraw(); }, s, cfg);
    });
    app.querySelectorAll('[data-take]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.take;
      if (cfg.mode === 'alltime') {
        const r = C.draftPick(CUR.dr, id);
        if (!r.ok) { UI.toast(r.reason, 'error'); return; }
        CUR.spin = null;
        C.simToUser(CUR.dr);
        cfg.picks = C.teamPicks(CUR.dr, cfg.team).map(e => e.key);
      } else { cfg.picks.push(id); CUR.spin = null; }
      redraw();
    }));
    const sim = UI.$('#chSim');
    if (sim) sim.addEventListener('click', () => startSim(app));
  }

  // =====================================================================
  // All-time snake draft
  // =====================================================================
  function drawDraft(app) {
    const cfg = CUR.cfg, dr = CUR.dr, base = C.seasonData(2013), teams = base.teams;
    const me = teamOf(teams, cfg.team);
    const c = C.onClock(dr);
    const youUp = c && c.team === cfg.team;
    const mine = C.teamPicks(dr, cfg.team);
    cfg.picks = mine.map(e => e.key);
    const full = mine.length >= 5;
    const N = dr.order.length;
    let untilYou = null;
    if (c && !youUp) for (let n = c.n; n < N * C.ROUNDS; n++) if (C.draftSlot(dr, n).team === cfg.team) { untilYou = n - c.n; break; }
    const ct = c ? teamOf(teams, c.team) : null;
    const clock = !c ? '' : `<section class="ch-clock${youUp ? ' you' : ''}">${logo(ct, 46)}<div class="ch-clock-t"><div class="ch-top-k">ROUND ${c.round} | PICK ${c.pick} | #${c.n + 1} OF ${N * C.ROUNDS}</div>
        <div class="ch-clock-n">${youUp ? 'YOU ARE ON THE CLOCK' : esc(tName(ct)).toUpperCase() + ' ARE UP'}</div>
        <div class="muted ch-small">${youUp ? (cfg.build === 'wheel' ? 'Spin, then take one player from that team and season.' : 'Take anyone left on the board.') : untilYou != null ? 'Your next pick comes in ' + untilYou + '.' : ''}</div></div>
        ${youUp ? '' : '<button type="button" class="btn btn-gold" id="chToMe">SIM TO MY PICK</button>'}</section>`;
    let board = '';
    if (youUp && cfg.build === 'wheel') board = wheelHtml(cfg, teams, false);
    else if (youUp) {
      const q = VIEW.q.trim().toLowerCase();
      const list = C.available(dr).filter(e => (!VIEW.pos || C.primaryPos(e.pos) === VIEW.pos) && (!VIEW.season || e.season === +VIEW.season) && (!q || e.name.toLowerCase().indexOf(q) >= 0));
      board = `<div class="ch-filters">${[''].concat(POS).map(x => `<button type="button" class="ch-chip sm${VIEW.pos === x ? ' on' : ''}" data-pos="${x}">${x || 'ALL'}</button>`).join('')}
          <select id="chSeasonF" aria-label="Season"><option value="">ALL SEASONS</option>${C.SEASONS.filter(s => C.poolSeasons().indexOf(s.year) >= 0).map(s => `<option value="${s.year}"${+VIEW.season === s.year ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
          <input id="chQ" placeholder="Search players" value="${esc(VIEW.q)}" autocomplete="off"></div>
        ${(() => { const L = byLetter(list, !!q); return L.bar + `<ul class="ch-list">${L.rows.map(e => playerRow(e, teams, `<button type="button" class="btn btn-small btn-gold" data-take="${esc(e.key)}">DRAFT</button>`)).join('')}</ul>`; })()}
        ${list.length ? '' : '<p class="muted">Nobody matches.</p>'}`;
    }
    const recent = dr.picks.slice(-10).reverse();
    app.innerHTML = `
      <div class="ch-top">${logo(me, 48)}<div><div class="ch-top-k">ALL-TIME | ${esc(BUILD[cfg.build].label)} | ${esc(seasonLabel(cfg.era))} RULES</div><div class="ch-top-t">${esc(cfg.name || tName(me))}</div></div>
        <a class="btn btn-small" href="#/challenge">SETUP</a></div>
      ${slotsHtml(mine, teams, false)}
      ${mine.length ? fitHtml(C.lineupFit(mine)) : ''}
      ${full ? `<div class="ch-ready"><div><b>THE DRAFT IS DONE.</b><span class="muted"> 30 teams, five each, scrub benches everywhere.</span></div><button type="button" class="btn btn-gold btn-big" id="chSim">SIM THE SEASON</button></div>` : clock}
      ${board}
      ${full ? leagueBoard(dr, teams) : recent.length ? `<section>${UI.header('LATEST PICKS')}<ol class="ch-feed">${recent.map(x => { const e = dr.pool.find(q => q.key === x.key); const t = teamOf(teams, x.team); return `<li><span class="ch-feed-n">#${x.n}</span>${logo(t, 22)}<b>${esc(e.name)}</b><small class="muted">${esc(short(e.season))} | ${e.ovr}</small></li>`; }).join('')}</ol></section>` : ''}`;
    bindPick(app);
    const toMe = UI.$('#chToMe');
    if (toMe) toMe.addEventListener('click', () => { C.simToUser(dr); saveCur(); drawDraft(app); });
  }
  function leagueBoard(dr, teams) {
    const rows = dr.order.map(a => {
      const list = C.teamPicks(dr, a);
      const avg = list.length ? list.reduce((s, e) => s + e.ovr, 0) / list.length : 0;
      return { a, list, avg };
    }).sort((x, y) => y.avg - x.avg);
    return `<section>${UI.header('EVERY FIVE', 'Ranked by average overall')}<ol class="ch-board">${rows.map((r, i) => {
      const t = teamOf(teams, r.a);
      return `<li class="${r.a === CUR.cfg.team ? 'me' : ''}"><span class="ch-feed-n">${i + 1}</span>${logo(t, 26)}<span class="ch-board-b"><b>${esc(r.a === CUR.cfg.team && CUR.cfg.name ? CUR.cfg.name : t.name)}</b><small>${r.list.map(e => esc(e.name.split(' ').slice(-1)[0]) + ' ' + esc(short(e.season))).join(', ')}</small></span><span class="ch-ovr ${UI.ovrClass(Math.round(r.avg))}">${r.avg.toFixed(1)}</span></li>`;
    }).join('')}</ol></section>`;
  }

  // =====================================================================
  // The season
  // =====================================================================
  function buildChallenge(cfg, dr) {
    const ch = cfg.mode === 'alltime' ? C.buildAllTime(cfg, dr) : C.buildYear(cfg);
    C.start(ch);
    return ch;
  }
  function startSim(app) {
    try {
      RUN = { ch: buildChallenge(CUR.cfg, CUR.dr), fast: false, paused: false, ticker: [] };
    } catch (e) { UI.toast('Could not start the season: ' + (e && e.message ? e.message : e), 'error'); return; }
    location.hash = '#/challenge/sim';
  }
  const onSim = () => /^#\/challenge\/sim/.test(location.hash);
  function drawSim(app) {
    if (!RUN) { location.hash = results().length ? '#/challenge/result' : '#/challenge'; return; }
    const ch = RUN.ch, me = teamOf(ch.teams, ch.user);
    app.innerHTML = `<section class="ch-sim" style="--c1:${esc(me.colors[0])}">
        ${logo(me, 84)}<div class="ch-sim-t">${esc(tName(me))}</div>
        <div class="ch-sim-k" id="chPhase">REGULAR SEASON</div>
        <div class="ch-sim-rec" id="chRec">0-0</div>
        <div class="ch-bar"><i id="chBar"></i></div>
        <ol class="ch-tick" id="chTick"></ol>
        <div class="row-btns center"><button type="button" class="btn btn-gold" id="chWatch"${RUN.fast ? ' disabled' : ''}>WATCH THE NEXT GAME</button><button type="button" class="btn" id="chFast"${RUN.fast ? ' disabled' : ''}>SKIP TO THE END</button></div>
      </section>`;
    UI.$('#chFast').addEventListener('click', () => { RUN.fast = true; RUN.watch = false; UI.$('#chFast').disabled = true; UI.$('#chWatch').disabled = true; });
    UI.$('#chWatch').addEventListener('click', () => { RUN.watch = true; UI.$('#chWatch').textContent = 'FINDING YOUR NEXT GAME...'; UI.$('#chWatch').disabled = true; });
    if (RUN.seen == null) RUN.seen = ch.season.order.length;
    RUN.paused = false;
    RUN.watching = null;
    tick();
  }
  function tick() {
    if (!RUN) return;
    if (!onSim()) { RUN.paused = true; return; }
    const ch = RUN.ch, s = ch.season;
    if (RUN.watching) return;
    const beforeGames = Object.keys(s.boxScores).length;
    const done = C.step(ch, RUN.fast ? 30 : RUN.watch ? 1 : 3);
    // the user's game that was just played, kept whole for the court view
    let mine = null;
    while (RUN.seen < s.order.length) {
      const id = s.order[RUN.seen++], b = s.boxScores[id];
      if (b && b.home && typeof b.home === 'object' && (b.home.abbr === ch.user || b.away.abbr === ch.user) && b.pbx) mine = b;
    }
    if (RUN.watch && mine && !done) { RUN.watch = false; RUN.watching = JSON.parse(JSON.stringify(mine)); drawWatch(document.getElementById('app'), RUN.watching); return; }
    const pr = C.progress(ch);
    const rec = UI.$('#chRec'), bar = UI.$('#chBar'), ph = UI.$('#chPhase'), tk = UI.$('#chTick');
    if (rec) rec.textContent = pr.w + '-' + pr.l;
    if (bar) bar.style.width = (pr.frac * 100).toFixed(1) + '%';
    if (ph) ph.textContent = s.phase === 'regular' ? 'REGULAR SEASON' : s.phase === 'done' ? 'FINAL' : 'PLAYOFFS | ' + (['FIRST ROUND', 'CONFERENCE SEMIFINALS', 'CONFERENCE FINALS', 'NBA FINALS'][(s.playoffs && s.playoffs.round || 1) - 1] || '');
    if (tk && !RUN.fast && Object.keys(s.boxScores).length > beforeGames) {
      const ids = Object.keys(s.boxScores).slice(beforeGames);
      ids.forEach(id => {
        const b = s.boxScores[id];
        if (!b || !b.home || typeof b.home !== 'object') return;
        const side = b.home.abbr === ch.user ? 'home' : b.away.abbr === ch.user ? 'away' : null;
        if (!side) return;
        const us = b[side], them = b[side === 'home' ? 'away' : 'home'];
        let top = null;
        us.box.forEach(r => { if (!top || r.pts > top.pts) top = r; });
        RUN.ticker.unshift(`<li class="${us.pts > them.pts ? 'w' : 'l'}"><b>${us.pts > them.pts ? 'W' : 'L'}</b> ${us.pts}-${them.pts} ${side === 'home' ? 'vs' : 'at'} ${esc(them.abbr)}<small>${top && ch.players[top.id] ? esc(ch.players[top.id].name) + ' ' + top.pts : ''}</small></li>`);
      });
      RUN.ticker.length = Math.min(RUN.ticker.length, 5);
      tk.innerHTML = RUN.ticker.join('');
    }
    if (done) { finish(); return; }
    setTimeout(tick, RUN.fast ? 0 : 16);
  }
  function finish() {
    const ch = RUN.ch;
    const r = C.summary(ch);
    if (RUN.shared) r.sharedFrom = RUN.shared;
    RUN = null;
    keepResult(r);
    ls.del(KEY_CUR);
    CUR = null;
    ODDS = null;
    location.hash = '#/challenge/result/0';
  }

  // A challenge game on the court: lookups from the challenge, not the save
  function courtOpts(teams, names, game) {
    return { game, start: 0, autoplay: true, team: a => teamOf(teams, a), player: id => names(id),
      logo: (a, size) => logo(teamOf(teams, a), size) };
  }
  let courtCtl = null;
  function mountCourt(el, opts) {
    if (courtCtl) { try { courtCtl.destroy(); } catch (e) { /* gone */ } courtCtl = null; }
    if (!(window.COURT && typeof window.COURT.mount === 'function' && window.COURT.available(opts.game))) { el.innerHTML = '<p class="muted">The court view needs the play-by-play of this game, which is not kept.</p>'; return; }
    courtCtl = window.COURT.mount(el, opts);
    if (courtCtl && UI.extras && typeof UI.extras.onLeave === 'function') UI.extras.onLeave(() => { if (courtCtl) { courtCtl.destroy(); courtCtl = null; } });
  }
  function drawWatch(app, b) {
    const ch = RUN.ch, teams = ch.teams, s = ch.season, st = s.standings[ch.user] || { w: 0, l: 0 };
    const opp = b.home.abbr === ch.user ? b.away.abbr : b.home.abbr, home = b.home.abbr === ch.user;
    app.innerHTML = `<div class="ch-top">${logo(teamOf(teams, ch.user), 40)}<div><div class="ch-top-k">${b.playoff ? 'PLAYOFFS' : 'GAME ' + (st.w + st.l)} | ${esc(UI.dateLabel ? UI.dateLabel(b.date) : b.date)}</div>
        <div class="ch-top-t">${home ? 'vs' : 'at'} ${esc(tName(teamOf(teams, opp)))}</div></div></div>
      <div class="ct-host" id="chCourt"></div>
      <div class="row-btns center"><button type="button" class="btn btn-gold" id="chGoOn">BACK TO THE SEASON</button><button type="button" class="btn" id="chAgainW">WATCH THE NEXT ONE TOO</button></div>`;
    mountCourt(UI.$('#chCourt'), courtOpts(teams, id => ch.players[id] || null, b));
    UI.$('#chGoOn').addEventListener('click', () => drawSim(app));
    UI.$('#chAgainW').addEventListener('click', () => { drawSim(app); RUN.watch = true; const w = UI.$('#chWatch'); if (w) { w.disabled = true; w.textContent = 'FINDING YOUR NEXT GAME...'; } });
  }

  // ---------- replays: the season again from its seed, so any game of it can be opened ----------
  let REPLAY = null;   // { when, boxes: { gid: box }, names: { id: player }, done }
  function chFromResult(r) {
    const cfg = Object.assign({}, r.cfg);
    return buildChallenge(cfg, cfg.mode === 'alltime' ? draftFromResult(r, cfg) : null);
  }
  function replay(r, onProgress) {
    if (REPLAY && REPLAY.when === r.when && REPLAY.done) return Promise.resolve(REPLAY);
    return loadFor(r.cfg).then(() => new Promise((res, rej) => {
      let ch;
      try { ch = chFromResult(r); } catch (e) { rej(e); return; }
      const rp = { when: r.when, boxes: {}, names: {}, done: false, seen: 0 };
      Object.keys(ch.players).forEach(id => { const p = ch.players[id]; rp.names[id] = { name: p.name, pos: p.pos, nbaId: p.nbaId || null, team: p.team }; });
      REPLAY = rp;
      const go = () => {
        if (REPLAY !== rp) return;
        let fin = false;
        try {
          for (let i = 0; i < 12 && !fin; i++) {
            fin = C.step(ch, 1);
            const sn = ch.season;
            while (rp.seen < sn.order.length) {
              const id = sn.order[rp.seen++], b = sn.boxScores[id];
              if (b && b.home && typeof b.home === 'object' && (b.home.abbr === ch.user || b.away.abbr === ch.user)) rp.boxes[id] = JSON.parse(JSON.stringify(b));
            }
          }
        } catch (e) { rej(e); return; }
        if (onProgress) onProgress(C.progress(ch).frac);
        if (fin) { rp.done = true; res(rp); } else setTimeout(go, 0);
      };
      go();
    }));
  }
  function drawGame(app, idx, gid) {
    const r = results()[idx];
    if (!r) { location.hash = '#/challenge'; return; }
    const back = `<div class="row-btns"><a class="btn" href="#/challenge/result/${idx}">BACK TO THE RESULTS</a></div>`;
    const show = rp => {
      if (location.hash.indexOf('#/challenge/game/' + idx + '/' + gid) !== 0) return;
      const b = rp.boxes[gid];
      if (!b) { app.innerHTML = UI.empty('GAME NOT FOUND', 'That game is not in this season.', back); return; }
      gamePage(app, r, idx, b, rp);
    };
    if (REPLAY && REPLAY.when === r.when && REPLAY.done) { show(REPLAY); return; }
    app.innerHTML = `<section class="ch-load"><div class="ch-spin-ring"></div><div>REPLAYING THE SEASON...</div><div class="ch-bar ch-load-bar"><i id="chRpBar"></i></div><p class="muted ch-small">Same seed, same luck. Only the first game you open takes a moment.</p></section>`;
    replay(r, f => { const el = UI.$('#chRpBar'); if (el) el.style.width = (f * 100).toFixed(0) + '%'; })
      .then(show)
      .catch(e => { app.innerHTML = UI.empty('COULD NOT REPLAY', esc(e && e.message ? e.message : e), back); });
  }
  function gamePage(app, r, idx, b, rp) {
    const teams = r.teams, me = r.team.abbr;
    const nm = id => (rp.names[id] || {}).name || id;
    const pm = v => (v > 0 ? '+' : '') + (v || 0);
    const table = side => {
      const t = teamOf(teams, b[side].abbr);
      const rows = b[side].box.filter(x => x.min > 0).sort((x, y) => (y.starter ? 1 : 0) - (x.starter ? 1 : 0) || y.min - x.min);
      return `<h3 class="ch-bx-h">${logo(t, 26)}<span>${esc(b[side].abbr === me ? tName(r.team) : tName(t))}</span><b>${b[side].pts}</b></h3>
        <div class="tscroll"><table class="stats ch-bx"><thead><tr><th class="l">PLAYER</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG</th><th>3P</th><th>FT</th><th>TO</th><th>+/-</th></tr></thead><tbody>${rows.map(x =>
          `<tr${x.starter ? ' class="ch-st"' : ''}><td class="l">${esc(nm(x.id))}</td><td>${Math.round(x.min || 0)}</td><td><b>${x.pts || 0}</b></td><td>${(x.oreb || 0) + (x.dreb || 0)}</td><td>${x.ast || 0}</td><td>${x.stl || 0}</td><td>${x.blk || 0}</td><td>${x.fgm || 0}-${x.fga || 0}</td><td>${x.tpm || 0}-${x.tpa || 0}</td><td>${x.ftm || 0}-${x.fta || 0}</td><td>${x.tov || 0}</td><td>${pm(x.pm)}</td></tr>`).join('')}</tbody></table></div>`;
    };
    const q = Array.isArray(b.quarters) ? b.quarters : [];
    const qh = q.map((x, i) => `<th>${i < 4 ? 'Q' + (i + 1) : 'OT' + (i - 3)}</th>`).join('');
    const qr = side => q.map(x => `<td>${x[side === 'home' ? 0 : 1]}</td>`).join('');
    const A = teamOf(teams, b.away.abbr), H = teamOf(teams, b.home.abbr);
    const won = (b.home.abbr === me) === (b.home.pts > b.away.pts);
    app.innerHTML = `<div class="ch-top"><div><div class="ch-top-k">${esc(r.label)} | ${b.playoff ? 'PLAYOFFS | ' : ''}${esc(UI.dateLabel ? UI.dateLabel(b.date) : b.date)}</div>
        <div class="ch-top-t">${won ? 'WIN' : 'LOSS'} ${Math.max(b.home.pts, b.away.pts)}-${Math.min(b.home.pts, b.away.pts)}</div></div><a class="btn btn-small" href="#/challenge/result/${idx}">RESULTS</a></div>
      <div class="ch-score"><span>${logo(A, 44)}<b>${b.away.pts}</b></span><small>FINAL${b.ot ? ' / ' + (b.ot > 1 ? b.ot : '') + 'OT' : ''}</small><span><b>${b.home.pts}</b>${logo(H, 44)}</span></div>
      ${q.length ? `<div class="tscroll"><table class="stats ch-q"><thead><tr><th class="l"></th>${qh}<th>T</th></tr></thead><tbody><tr><td class="l">${esc(A.abbr)}</td>${qr('away')}<td><b>${b.away.pts}</b></td></tr><tr><td class="l">${esc(H.abbr)}</td>${qr('home')}<td><b>${b.home.pts}</b></td></tr></tbody></table></div>` : ''}
      <div class="row-btns center"><button type="button" class="btn btn-gold" id="chCourtGo"${b.pbx ? '' : ' disabled'}>WATCH ON THE COURT</button></div>
      <div class="ct-host" id="chCourt"></div>
      ${table('away')}${table('home')}
      <div class="row-btns"><a class="btn" href="#/challenge/result/${idx}">BACK TO THE RESULTS</a></div>`;
    const go = UI.$('#chCourtGo');
    go.addEventListener('click', () => { go.hidden = true; mountCourt(UI.$('#chCourt'), courtOpts(teams, id => rp.names[id] || null, b)); UI.$('#chCourt').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }

  // ---------- share links: the setup and the seed, so the same season plays on any device ----------
  function b64(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64(code) { const t = code.replace(/-/g, '+').replace(/_/g, '/'); return decodeURIComponent(escape(atob(t + '==='.slice((t.length + 3) % 4)))); }
  function shareCode(r) {
    const c = r.cfg, o = { v: 1, m: c.mode === 'alltime' ? 'a' : 'y', y: c.year, b: c.build === 'wheel' ? 'w' : 'f', t: c.team, n: c.name || '', s: c.seed,
      i: c.injuries === false ? 0 : 1, e: c.era || 2013, w: r.w, l: r.l };
    if (c.mode === 'alltime') { const ix = {}; C.allTimePool().forEach((e, k) => { ix[e.key] = k; }); o.d = (r.draft || []).map(x => ix[x.key]); }
    else o.p = c.picks;
    return b64(JSON.stringify(o));
  }
  function openShared(app, code) {
    let o;
    try { o = JSON.parse(unb64(code)); } catch (e) { app.innerHTML = UI.empty('LINK NOT READABLE', 'This challenge link is broken or cut off.', '<div class="row-btns"><a class="btn" href="#/challenge">DRAFT CHALLENGE</a></div>'); return; }
    const cfg = { mode: o.m === 'a' ? 'alltime' : 'year', year: +o.y || 2013, build: o.b === 'w' ? 'wheel' : 'free', team: o.t, name: o.n || '', seed: +o.s,
      injuries: o.i !== 0, era: +o.e || 2013, picks: o.p || [] };
    ensureData(cfg, app, () => {
      try {
        let dr = null;
        if (cfg.mode === 'alltime') {
          dr = C.newDraft(cfg);
          (o.d || []).forEach(k => { const e = dr.pool[k]; if (e) C.draftPick(dr, e.key); });
        }
        RUN = { ch: buildChallenge(cfg, dr), fast: false, paused: false, ticker: [], shared: { w: o.w, l: o.l } };
        location.hash = '#/challenge/sim';
      } catch (e) { app.innerHTML = UI.empty('COULD NOT OPEN THE CHALLENGE', esc(e && e.message ? e.message : e), '<div class="row-btns"><a class="btn" href="#/challenge">DRAFT CHALLENGE</a></div>'); }
    });
  }

  // =====================================================================
  // Results
  // =====================================================================
  const EXIT = { champion: 'NBA CHAMPIONS', finals: 'LOST IN THE FINALS', conf: 'CONFERENCE FINALS', semis: 'SECOND ROUND', first: 'FIRST ROUND EXIT', missed: 'MISSED THE PLAYOFFS' };
  function drawResult(app, idx) {
    const list = results();
    const r = list[idx];
    if (!r) { location.hash = '#/challenge'; return; }
    const teams = r.teams, me = r.team;
    const realT = r.mode === 'year' && me.real;
    const conf = me.conf;
    const seedTxt = r.confRank ? ord(r.confRank) + ' in the ' + conf : '';
    const line = x => x ? `<div class="ch-line">${[['PTS', x.pts], ['REB', x.reb], ['AST', x.ast], ['STL', x.stl], ['BLK', x.blk], ['FG%', pct(x.fgp)], ['3P%', pct(x.tpp)], ['MIN', x.mpg]].map(([k, v]) => `<span><b>${v}</b><small>${k}</small></span>`).join('')}</div>` : '<div class="muted ch-small">Did not play.</div>';
    const fiveCards = r.five.map(x => {
      const from = x.from;
      const t = x.fromTeam || teamOf(teams, from);
      return `<article class="ch-card" style="--c1:${esc(((t.colors) || ['#444'])[0])}">
        <header>${face(x, (t.colors || ['#444'])[0], 'ch-card-hs')}<div><b>${esc(x.name)}</b><small>${esc(C.primaryPos(x.pos))} | ${x.ovr} OVR | ${x.label ? esc(x.label) + ' ' : ''}via ${esc(tName(t) || from || '')}</small>
          ${x.tags.length ? `<div class="ch-tags">${x.tags.map(g => `<span class="ch-tag${/MVP/.test(g) ? ' gold' : ''}">${esc(g)}</span>`).join('')}</div>` : ''}</div></header>
        ${line(x.line)}
        ${x.po ? `<div class="ch-po"><small>PLAYOFFS</small> ${x.po.pts} pts | ${x.po.reb} reb | ${x.po.ast} ast in ${x.po.g} games</div>` : ''}

      </article>`;
    }).join('');
    const series = r.series.map(s => { const t = teamOf(teams, s.opp); return `<li class="${s.won ? 'w' : 'l'}"><small>${esc(s.name.toUpperCase())}</small>${logo(t, 24)}<b>${s.won ? 'W' : 'L'} ${s.w}-${s.l}</b><span>${esc(t.name)}</span></li>`; }).join('');
    const aw = r.awards || {};
    const awardRow = (k, label) => { const a = aw[k]; if (!a) return ''; const t = teamOf(teams, a.team); return `<li class="${a.mine ? 'me' : ''}"><small>${label}</small>${logo(t, 22)}<b>${esc(a.name)}</b>${a.season ? `<span class="muted">${esc(short(a.season))}</span>` : ''}${a.line ? `<span class="muted">${a.line.pts} / ${a.line.reb} / ${a.line.ast}</span>` : ''}</li>`; };
    const stand = c => `<div class="ch-stand"><h4>${c.toUpperCase()}</h4><ol>${r.standings[c].map((x, i) => `<li class="${x.abbr === me.abbr ? 'me' : ''}${i === 7 ? ' cut' : ''}"><span class="ch-feed-n">${i + 1}</span>${logo(teamOf(teams, x.abbr), 20)}<span class="ch-stand-n">${esc(x.abbr === me.abbr ? tName(me) : x.name)}</span><b>${x.w}-${x.l}</b>${r.mode === 'year' && x.real ? `<small class="muted" title="Real record">${x.real.w}-${x.real.l}</small>` : ''}</li>`).join('')}</ol></div>`;
    const benchRows = r.bench.filter(b => b.line && b.line.g).map(b => `<tr><td class="l">${esc(b.name)}</td><td>${esc(b.pos)}</td><td>${b.ovr}</td><td>${b.line.g}</td><td>${b.line.mpg}</td><td>${b.line.pts}</td><td>${b.line.reb}</td><td>${b.line.ast}</td></tr>`).join('');
    const log = r.log.map(g => `<li class="${g.won ? 'w' : 'l'}${g.playoff ? ' po' : ''}"><a href="#/challenge/game/${idx}/${esc(g.id)}"><span class="ch-log-d">${esc(UI.dateLabel ? UI.dateLabel(g.date) : g.date)}</span><b>${g.won ? 'W' : 'L'}</b><span>${g.us}-${g.them}</span><span>${g.home ? 'vs' : 'at'} ${esc(g.opp)}</span><small class="muted">${esc(g.top)}</small></a></li>`).join('');
    app.innerHTML = `
      <section class="ch-res ${r.exit === 'champion' ? 'champ' : ''}" style="--c1:${esc(me.colors[0])};--c2:${esc(me.colors[1] || me.colors[0])}">
        <div class="ch-res-k">${esc(r.label)} DRAFT CHALLENGE | ${esc(BUILD[r.build] ? BUILD[r.build].label : '')}</div>
        <div class="ch-res-main">${logo(me, 92)}<div><div class="ch-res-t">${esc(tName(me))}</div><div class="ch-res-rec">${r.w}-${r.l}</div><div class="ch-res-seed">${esc(seedTxt)}${r.injuries ? '' : ' | injuries off'}</div></div></div>
        <div class="ch-res-banner">${r.exit === 'champion' ? '<span class="ch-trophy" aria-hidden="true"></span>' : ''}<b>${esc(EXIT[r.exit] || '')}</b><span>${esc(r.exit === 'champion' ? (r.series.length ? 'Beat the ' + r.series[r.series.length - 1].oppName + ' ' + r.series[r.series.length - 1].w + '-' + r.series[r.series.length - 1].l + ' in the Finals' : '') : r.result)}</span></div>
        ${realT ? `<div class="ch-res-real">The real ${esc(seasonLabel(r.year))} ${esc(tName(me.orig || me))} went ${realT.w}-${realT.l}.</div>` : ''}
        ${series ? `<ol class="ch-series">${series}</ol>` : ''}
      </section>
      ${r.sharedFrom ? `<div class="note">${r.sharedFrom.w === r.w && r.sharedFrom.l === r.l ? 'Shared challenge: the same season your friend simmed.' : 'Shared challenge: the original run went ' + r.sharedFrom.w + '-' + r.sharedFrom.l + '. A different browser rolled the luck a little differently.'}</div>` : ''}
      <button type="button" class="btn btn-share" id="chShare">${UI.shareIcon || ''}SEND THIS TO YOUR FRIENDS</button>
      <div class="row-btns center ch-acts"><button type="button" class="btn btn-gold" id="chAgain">RUN IT BACK</button><button type="button" class="btn" id="chOdds">SIM 10 MORE SEASONS</button><a class="btn" href="#/challenge">NEW CHALLENGE</a></div>
      <div id="chOddsBox">${oddsHtml(r)}</div>
      ${UI.header('YOUR FIVE')}${r.fit ? fitHtml(r.fit) : ''}<div class="ch-cards">${fiveCards}</div>
      ${r.poBest && r.poBest.length ? `${UI.header('PLAYOFF HIGHS', 'Your five in the postseason')}<ol class="ch-best">${r.poBest.map(b => `<li><a href="#/challenge/game/${idx}/${esc(b.gid)}"><b>${b.pts}</b><span><b>${esc(b.name)}</b><small>${b.reb} reb | ${b.ast} ast | vs ${esc(b.opp)}, ${esc(UI.dateLabel ? UI.dateLabel(b.date) : b.date)}</small></span><i class="ch-go-i">BOX</i></a></li>`).join('')}</ol>` : ''}
      ${r.best.length ? `${UI.header('BEST NIGHTS', 'Regular season')}<ol class="ch-best">${r.best.map(b => `<li>${b.gid ? `<a href="#/challenge/game/${idx}/${esc(b.gid)}">` : '<span class="ch-best-a">'}<b>${b.pts}</b><span><b>${esc(b.name)}</b><small>${b.reb} reb | ${b.ast} ast | ${b.playoff ? 'playoffs ' : ''}vs ${esc(b.opp)}, ${esc(UI.dateLabel ? UI.dateLabel(b.date) : b.date)}</small></span>${b.gid ? '<i class="ch-go-i">BOX</i></a>' : '</span>'}</li>`).join('')}</ol>` : ''}
      ${UI.header('AROUND THE LEAGUE')}
      <div class="ch-league">
        <ul class="ch-awards"><li class="${r.champion && r.champion.abbr === me.abbr ? 'me' : ''}"><small>CHAMPION</small>${r.champion ? logo(teamOf(teams, r.champion.abbr), 22) + '<b>' + esc(tName(r.champion)) + '</b>' : '<b>-</b>'}</li>
          ${awardRow('fmvp', 'FINALS MVP')}${awardRow('mvp', 'MVP')}${awardRow('dpoy', 'DEFENSIVE POY')}${awardRow('roy', 'ROOKIE OF THE YEAR')}${awardRow('smoy', 'SIXTH MAN')}</ul>
        <div class="ch-leaders">${[['pts', 'POINTS'], ['reb', 'REBOUNDS'], ['ast', 'ASSISTS']].map(([k, l]) => `<div><h4>${l}</h4><ol>${(r.leaders[k] || []).map(x => `<li class="${x.mine ? 'me' : ''}"><span>${esc(x.name)}${x.season ? ' <small class="muted">' + esc(short(x.season)) + '</small>' : ''}</span><b>${x.v}</b></li>`).join('')}</ol></div>`).join('')}</div>
      </div>
      ${UI.header('STANDINGS', r.mode === 'year' ? 'Gray number: the real record' : '')}<div class="ch-stands">${stand('East')}${stand('West')}</div>
      ${r.moves && r.moves.length ? `${UI.header('WHO REPLACED YOUR PICKS')}<ul class="ch-moves">${r.moves.map(m => `<li>${logo(teamOf(teams, m.team), 22)}<span>Lost <b>${esc(m.outName)}</b>, signed <b>${esc(m.inName)}</b> (${m.inOvr})</span></li>`).join('')}</ul>` : ''}
      ${benchRows ? `${UI.header('THE SCRUBS')}<div class="tscroll"><table class="stats"><thead><tr><th class="l">PLAYER</th><th>POS</th><th>OVR</th><th>G</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead><tbody>${benchRows}</tbody></table></div>` : ''}
      <details class="ch-logbox"><summary>GAME LOG (${r.log.length} GAMES) | TAP A GAME FOR THE BOX SCORE</summary><ol class="ch-log">${log}</ol></details>`;
    UI.$('#chAgain').addEventListener('click', () => rerun(r));
    UI.$('#chShare').addEventListener('click', () => share(r));
    UI.$('#chOdds').addEventListener('click', () => runOdds(r));
  }

  function cfgFromResult(r) { return Object.assign({}, r.cfg, { seed: Math.floor(Math.random() * 2147483646) + 1 }); }
  function draftFromResult(r, cfg) {
    const dr = C.newDraft(r.cfg);
    (r.draft || []).forEach(x => C.draftPick(dr, x.key));
    dr.cfg = cfg;
    return dr;
  }
  function rerun(r) {
    const cfg = cfgFromResult(r);
    ensureData(cfg, document.getElementById('app'), () => {
      try {
        const dr = cfg.mode === 'alltime' ? draftFromResult(r, cfg) : null;
        RUN = { ch: buildChallenge(cfg, dr), fast: false, paused: false, ticker: [] };
        location.hash = '#/challenge/sim';
      } catch (e) { UI.toast('Could not run it back: ' + (e && e.message ? e.message : e), 'error'); }
    });
  }

  // Ten more seasons with the same five: how often they win it all
  function oddsHtml(r) {
    if (!ODDS || ODDS.key !== r.when) return '';
    const o = ODDS, n = o.rows.length;
    const avgW = n ? o.rows.reduce((s, x) => s + x.w, 0) / n : 0;
    const best = n ? o.rows.slice().sort((a, b) => b.w - a.w)[0] : null, worst = n ? o.rows.slice().sort((a, b) => a.w - b.w)[0] : null;
    const titles = o.rows.filter(x => x.exit === 'champion').length;
    const counts = {};
    o.rows.forEach(x => { counts[x.exit] = (counts[x.exit] || 0) + 1; });
    return `<section class="ch-odds">${UI.header('TEN MORE SEASONS', n < o.total ? 'Simming ' + (n + 1) + ' of ' + o.total + '...' : 'Same five, new luck')}
      <div class="ch-odds-g"><span><b>${titles}</b><small>TITLES</small></span><span><b>${n ? Math.round(avgW) + '-' + (82 - Math.round(avgW)) : '-'}</b><small>AVERAGE</small></span>
        <span><b>${best ? best.w + '-' + best.l : '-'}</b><small>BEST</small></span><span><b>${worst ? worst.w + '-' + worst.l : '-'}</b><small>WORST</small></span></div>
      <div class="ch-bar"><i style="width:${(n / o.total * 100).toFixed(0)}%"></i></div>
      <ul class="ch-odds-l">${['champion', 'finals', 'conf', 'semis', 'first', 'missed'].filter(k => counts[k]).map(k => `<li><b>${counts[k]}</b> ${esc(EXIT[k].toLowerCase())}</li>`).join('')}</ul></section>`;
  }
  function runOdds(r) {
    if (ODDS && ODDS.key === r.when && ODDS.rows.length < ODDS.total) return;
    ODDS = { key: r.when, total: 10, rows: [], ch: null, r };
    const btn = UI.$('#chOdds');
    if (btn) btn.disabled = true;
    loadFor(r.cfg).then(oddsTick).catch(e => { ODDS = null; if (btn) btn.disabled = false; UI.toast(e && e.message ? e.message : String(e), 'error'); });
  }
  function oddsTick() {
    const o = ODDS;
    if (!o || !/^#\/challenge\/result/.test(location.hash)) { if (o) o.ch = null; ODDS = o && o.rows.length === o.total ? o : null; return; }
    try {
      if (!o.ch) { const cfg = cfgFromResult(o.r); o.ch = buildChallenge(cfg, cfg.mode === 'alltime' ? draftFromResult(o.r, cfg) : null); }
      if (C.step(o.ch, 25)) {
        const s = o.ch.season, st = s.standings[o.ch.user];
        const sum = C.summary(o.ch);
        o.rows.push({ w: st.w, l: st.l, exit: sum.exit });
        o.ch = null;
      }
    } catch (e) { console.warn('[challenge] odds failed', e); ODDS = null; return; }
    const box = UI.$('#chOddsBox');
    if (box) box.innerHTML = oddsHtml(o.r);
    if (o.rows.length < o.total) setTimeout(oddsTick, 0);
    else { const btn = UI.$('#chOdds'); if (btn) btn.disabled = false; }
  }

  function share(r) {
    loadFor(r.cfg).then(() => shareNow(r)).catch(() => shareNow(r, true));
  }
  function shareNow(r, plain) {
    const last = n => String(n || '').split(' ').filter(w => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w)).pop();
    const ns = r.five.map(x => last(x.name)), names = ns.slice(0, -1).join(', ') + ' and ' + ns[ns.length - 1];
    // the details that make it a story: playoff record, the five's top scorer, the biggest night
    const po = (r.series || []).reduce((t, x) => [t[0] + (x.w || 0), t[1] + (x.l || 0)], [0, 0]);
    const top = r.five.filter(x => x.line).sort((x, y) => y.line.pts - x.line.pts)[0];
    const big = (r.best || [])[0];
    const lastSeries = (r.series || [])[r.series ? r.series.length - 1 : 0];
    const extra = [top ? `${last(top.name)} put up ${Math.round(top.line.pts)} a night` : '', big && big.pts >= 45 ? `${last(big.name)} dropped ${big.pts} on ${big.opp}` : ''].filter(Boolean).join(', ');
    let text;
    if (r.exit === 'champion') text = `🏆 Built a title team out of ${r.label}: ${names}. ${r.w}-${r.l}, then ${po[0]}-${po[1]} in the playoffs.${extra ? ' ' + extra + '.' : ''} Your five vs mine?`;
    else if (r.exit === 'missed') text = `Drafted ${names} out of ${r.label} and somehow went ${r.w}-${r.l} and missed the playoffs. 😬${extra ? ' At least ' + extra + '.' : ''} Your five can't do worse. Prove it:`;
    else text = `Drafted ${names} out of ${r.label}. ${r.w}-${r.l}, then ${lastSeries && lastSeries.oppName ? 'the ' + lastSeries.oppName + ' sent us home in the ' + String(lastSeries.name || 'playoffs').toLowerCase() + ' (' + lastSeries.w + '-' + lastSeries.l + ')' : String(r.result || '').toLowerCase()}.${extra ? ' ' + extra + '.' : ''} Run it back with your five:`;
    let url = location.origin + location.pathname + '#/challenge';
    if (!plain) { try { url += '/s/' + shareCode(r); } catch (e) { /* plain link */ } }
    const me = r.team && typeof r.team === 'object' ? r.team : {};
    const spec = { kicker: (r.label || '') + ' DRAFT CHALLENGE', title: tName(me) || 'MY FIVE', big: r.w + '-' + r.l, gold: r.exit === 'champion',
      banner: r.exit === 'champion' ? 'NBA CHAMPIONS' : String(r.result || '').toUpperCase(), colors: me.colors, logo: me.logo,
      lines: r.five.map(x => [C.primaryPos(x.pos), x.name + (x.line ? '   ' + x.line.pts + ' PTS' : '')]) };
    if (UI.shareResult) { UI.shareResult(spec, text, url, 'draft-challenge'); return; }
    if (navigator.share) navigator.share({ title: 'Draft Challenge', text, url }).catch(() => {});
  }
})();
