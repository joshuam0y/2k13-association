// Hub pages: main menu, new league team picker, rosters, team roster, player card, league menu,
// draft classes and soundtrack. Also the shared menu tiles and icons (UI.icon, UI.tile).
(function () {
  'use strict';
  const UI = window.UI;
  const P = UI.pages = UI.pages || {};
  const esc = UI.esc;

  const confs = () => {
    const seen = [];
    UI.teams().forEach(t => { if (t.conf && !seen.includes(t.conf)) seen.push(t.conf); });
    return seen.sort((a, b) => (a === 'East' ? -1 : b === 'East' ? 1 : a.localeCompare(b)));
  };

  // ---------- icons and tiles ----------
  // Simple line icons (24 by 24, drawn in currentColor) for the menu tiles.
  const ICONS = {
    ball: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM3 12h18M12 3v18M5.6 5.6c2.6 2.6 2.6 10.2 0 12.8M18.4 5.6c-2.6 2.6-2.6 10.2 0 12.8',
    play: 'M7 4l13 8-13 8z',
    roster: 'M8 3L3 6l2 5 2-1v11h10V10l2 1 2-5-5-3c0 2-2 3-4 3s-4-1-4-3z',
    rotation: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
    trade: 'M4 8h15l-4-4M20 16H5l4 4',
    fa: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
    standings: 'M9 6h11M9 12h11M9 18h11M4 6h1.5M4 12h1.5M4 18h1.5',
    stats: 'M5 20V11M11 20V5M17 20v-6M3 20h18',
    draft: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6',
    league: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 21h8M9 18h6',
    load: 'M3 6h6l2 2h10v11H3z',
    music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0a3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0a3 3 0 0 1 6 0z',
    news: 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 13h7M7 16h4',
    awards: 'M12 14a5 5 0 1 0 0-10a5 5 0 0 0 0 10zM8.5 13L7 21l5-3 5 3-1.5-8',
    history: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 7v5l3 3',
    classes: 'M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM2 21c0-4 3-7 7-7s7 3 7 7M16 3.5a4 4 0 0 1 0 7.5M22 21c0-3-2-5.5-4.5-6.5',
    playoffs: 'M3 5h5v4H3zM3 15h5v4H3zM8 7h3v10H8M11 12h4M15 10h6v4h-6z',
    moves: 'M4 7h16M4 12h11M4 17h7',
    live: 'M3 6h18v12H3zM8 21h8M10 9.5l5 2.5-5 2.5z',
    teams: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z'
  };
  UI.icon = (name, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name] || ICONS.ball}"/></svg>`;
  // A big menu tile: an icon and one label. opts: { sub, cls, disabled, attrs }
  UI.tile = function (href, icon, label, opts) {
    const o = opts || {};
    const dis = o.disabled;
    return `<a class="mtile${o.cls ? ' ' + o.cls : ''}${dis ? ' disabled' : ''}" href="${dis ? '#/home' : esc(href)}"${dis ? ' aria-disabled="true" tabindex="-1"' : ''}${o.attrs || ''}>
      ${icon ? `<span class="mt-ic">${UI.icon(icon)}</span>` : ''}<span class="mt-l">${esc(label)}</span>${o.sub ? `<span class="mt-s">${o.sub}</span>` : ''}</a>`;
  };

  // ---------- Main menu ----------
  // Four choices only: play a new Association, continue the last one, load a save, soundtrack.
  P.home = function (app) {
    const latest = UI.saves.latest();
    const engineOk = UI.canPlay();
    const m = latest && latest.meta;
    const cont = m
      ? UI.tile('#/continue', null, 'CONTINUE', { cls: 'mt-continue', sub: `<span class="mt-team">${UI.logo(m.userTeam, 44)}<span><b>${esc(UI.teamName(m.userTeam))}</b><small>${esc(m.record || '0-0')}${m.year ? ' | ' + esc(UI.seasonLabel(m.year)) : ''}</small></span></span>`, disabled: !engineOk })
      : UI.tile('#/continue', 'play', 'CONTINUE', { cls: 'mt-continue', sub: 'No saved league yet', disabled: true });
    app.innerHTML = `
      <section class="mm">
        <div class="mm-brand"><span class="mm-2k">2K13</span><span class="mm-a">ASSOCIATION</span></div>
        <div class="mm-k">THE 2012-13 NBA SEASON</div>
        <div class="mm-grid">
          ${UI.tile('#/new', 'ball', 'PLAY THE ASSOCIATION', { cls: 'mt-hero', disabled: !engineOk, sub: engineOk ? 'NEW LEAGUE' : 'SIM ENGINE NOT LOADED' })}
          ${cont}
          ${UI.tile('#/saves', 'load', 'LOAD')}
          ${UI.tile('#/soundtrack', 'music', 'SOUNDTRACK')}
        </div>
      </section>`;
  };

  // ---------- shared helpers: positions, best lineup, needs, payroll, player search ----------
  const SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'];
  const posLabel = p => (window.POSITIONS ? window.POSITIONS.label(p) : (p.pos || '-'));
  const posPair = p => { if (window.POSITIONS) { const o = window.POSITIONS.of(p); return [o.pos, o.pos2]; } return [p.pos, p.pos]; };
  UI.posLabel = posLabel;
  const available = p => !UI.injuryOf(p) && !p.gleague && !(p.stashedUntil && UI.state.game && p.stashedUntil > UI.state.game.year);
  const byOvr = (a, b) => (b.ovr || 0) - (a.ovr || 0);
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const W8 = [1.6, 1.4, 1.3, 1.2, 1.1, 0.8, 0.7, 0.6];
  // TEAM OVR from a sorted roster (same weights as UI.teamOvr).
  const ovrFrom = list => {
    const r = list.slice(0, 8);
    if (!r.length) return 0;
    let s = 0, ws = 0;
    r.forEach((p, i) => { s += (p.ovr || 0) * W8[i]; ws += W8[i]; });
    return Math.round(s / ws);
  };
  UI.teamTier = o => (o >= 81 ? 'Contender' : o >= 77 ? 'Playoff team' : 'Rebuild');

  // Best starting five: one player per slot, highest total OVR, small penalties for playing off
  // the listed positions (secondary 1, next door 6, further 12+). Healthy players only when possible.
  UI.bestLineup = function (players) {
    let pool = players.filter(available);
    if (pool.length < 5) pool = players.slice();
    pool = pool.slice().sort(byOvr).slice(0, 10);
    const fit = (p, slot) => {
      const [a, b] = posPair(p);
      if (a === slot) return 0;
      if (b === slot) return 1;
      const d = Math.abs(SLOTS.indexOf(a) - SLOTS.indexOf(slot));
      return d <= 1 ? 6 : 12 + d * 4;
    };
    let best = null, top = -Infinity;
    const used = pool.map(() => false), pick = [];
    (function dfs(i, score) {
      if (i === SLOTS.length || i === pool.length) {
        if (i === SLOTS.length && score > top) { top = score; best = pick.slice(); }
        return;
      }
      for (let j = 0; j < pool.length; j++) {
        if (used[j]) continue;
        used[j] = true; pick.push(pool[j]);
        dfs(i + 1, score + (pool[j].ovr || 0) - fit(pool[j], SLOTS[i]));
        pick.pop(); used[j] = false;
      }
    })(0, 0);
    if (!best) best = pool.slice(0, 5);
    return SLOTS.map((slot, i) => ({ slot, p: best[i] || null }));
  };

  // Thin spots by position: rotation minutes that cannot be covered (POSITIONS.coverage over a
  // ten-man rotation), how many rotation players can play the spot, then the weakest starter.
  UI.teamNeeds = function (players, lineup) {
    const rot = players.filter(available).sort(byOvr).slice(0, 10);
    const MIN = [36, 34, 33, 32, 30, 24, 20, 15, 10, 6];
    const minutes = {};
    rot.forEach((p, i) => { minutes[p.id] = MIN[i]; });
    let cov = null;
    try { cov = window.POSITIONS && window.POSITIONS.coverage ? window.POSITIONS.coverage(rot, minutes) : null; } catch (e) { cov = null; }
    const starters = lineup.filter(x => x.p).map(x => x.p.ovr || 0);
    const avgStart = starters.length ? starters.reduce((s, v) => s + v, 0) / starters.length : 0;
    const rows = SLOTS.map(k => {
      const who = rot.filter(p => posPair(p).includes(k));
      const min = cov ? Math.min(48, cov.by[k].min) : Math.min(48, who.length * 20);
      const st = lineup.find(x => x.slot === k);
      const so = st && st.p ? st.p.ovr || 0 : 0;
      const score = (48 - min) * 2 + (who.length <= 1 ? 30 : who.length === 2 ? 12 : 0) + Math.max(0, avgStart - so);
      let why;
      if (!who.length) why = 'Nobody in the rotation plays it';
      else if (min < 48) why = `Only ${min} of 48 minutes covered`;
      else if (who.length <= 2) why = `Only ${who.length} in the rotation can play it`;
      else why = `Weakest starter, OVR ${so}`;
      return { pos: k, depth: who.length, min, starter: so, score, thin: min < 48 || who.length <= 2, why };
    }).sort((a, b) => b.score - a.score);
    const thin = rows.filter(r => r.thin).slice(0, 3);
    return thin.length ? thin : rows.slice(0, 1).map(r => Object.assign({}, r, { why: `No thin spots. Weakest starter, OVR ${r.starter}` }));
  };

  // Payroll against the cap and tax line. fromGame: read the live league (CBA.capStatus).
  UI.payrollInfo = function (abbr, roster, fromGame) {
    const g = UI.state.game;
    let pay = null, year = UI.year();
    if (fromGame && g && g.teams && g.teams[abbr] && window.CBA && window.CBA.capStatus) {
      try { const st = window.CBA.capStatus(g, abbr); pay = st.payroll; year = st.year; } catch (e) { pay = null; }
    }
    if (!fromGame) year = (UI.state.league && UI.state.league.season) || 2013;
    if (pay == null) pay = roster.filter(p => !(p.contract && p.contract.twoWay)).reduce((s, p) => s + (Number(p.contract ? UI.salaryOf(p) : p.salary) || 0), 0);
    let rules = null;
    try { rules = window.CBA && window.CBA.rules ? window.CBA.rules(year) : null; } catch (e) { rules = null; }
    if (!rules && window.CAP_HISTORY && window.CAP_HISTORY.seasons) rules = window.CAP_HISTORY.seasons[year] || null;
    const cap = rules ? rules.cap : 0, tax = rules ? rules.tax : 0;
    const word = !cap ? '' : pay < cap ? 'Space' : tax && pay >= tax ? 'Taxed' : 'Capped';
    let line = UI.fmtMoney(pay) + ' payroll';
    if (cap) {
      line += ` vs ${UI.fmtMoney(cap)} cap: `;
      if (word === 'Space') line += `${UI.fmtMoney(cap - pay)} in cap space`;
      else if (word === 'Capped') line += `over the cap, ${UI.fmtMoney(tax - pay)} under the tax`;
      else line += `${UI.fmtMoney(pay - tax)} over the tax line`;
    }
    return { pay, cap, tax, word, line };
  };

  // Name search over every active player (accents and punctuation ignored).
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  UI.findPlayers = function (q, opts) {
    const o = opts || {};
    const n = norm(q);
    if (!n) return [];
    const toks = n.split(' ');
    const out = [];
    UI.allPlayers().forEach(p => {
      if (!p || p.retired || p.team === 'DRAFT' || p.id === o.exclude) return;
      const nm = norm(p.name);
      const words = nm.split(' ');
      let rank;
      if (nm.startsWith(n)) rank = 0;
      else if (toks.every(t => words.some(w => w.startsWith(t)))) rank = 1;
      else if (nm.includes(n)) rank = 2;
      else return;
      out.push({ p, rank });
    });
    return out.sort((a, b) => a.rank - b.rank || byOvr(a.p, b.p)).slice(0, o.limit || 8).map(x => x.p);
  };

  // A search box with a dropdown of matches (team logo, name, position, OVR).
  // opts: { placeholder, exclude, onPick(player), autofocus }. Without onPick a match opens the player card.
  UI.playerSearch = function (host, opts) {
    const o = opts || {};
    host.innerHTML = `<div class="psearch">
      <svg class="ps-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 0 0 0-13zM15.5 15.5L21 21"/></svg>
      <input type="search" class="ps-in" placeholder="${esc(o.placeholder || 'Search any player by name')}" aria-label="Search players by name" autocomplete="off" spellcheck="false">
      <ul class="ps-list" role="listbox" hidden></ul></div>`;
    const input = UI.$('.ps-in', host), list = UI.$('.ps-list', host);
    let hits = [], on = -1;
    const pick = p => {
      if (!p) return;
      list.hidden = true;
      if (o.onPick) { input.value = ''; o.onPick(p); } else location.hash = '#/player/' + encodeURIComponent(p.id);
    };
    const mark = () => UI.$$('li[data-i]', list).forEach(li => li.classList.toggle('on', Number(li.getAttribute('data-i')) === on));
    const draw = () => {
      hits = UI.findPlayers(input.value, { exclude: o.exclude });
      on = hits.length ? 0 : -1;
      if (!input.value.trim()) { list.hidden = true; list.innerHTML = ''; return; }
      const team = p => (p.team && p.team !== 'FA' ? p.team : 'FA');
      list.innerHTML = hits.length ? hits.map((p, i) => `<li data-i="${i}" role="option"><a href="#/player/${encodeURIComponent(p.id)}" data-id="${esc(p.id)}">
          ${UI.logo(team(p), 28)}<span class="ps-nm"><b>${esc(p.name)}</b><small>${esc(team(p) === 'FA' ? 'Free agent' : UI.teamName(p.team))} | ${esc(posLabel(p))}</small></span>
          <span class="ps-ovr ${UI.ovrClass(p.ovr)}">${esc(p.ovr == null ? '-' : p.ovr)}</span></a></li>`).join('')
        : '<li class="ps-none">No players match.</li>';
      list.hidden = false;
      mark();
    };
    input.addEventListener('input', draw);
    input.addEventListener('focus', () => { if (input.value.trim()) draw(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' && hits.length) { e.preventDefault(); on = (on + 1) % hits.length; mark(); }
      else if (e.key === 'ArrowUp' && hits.length) { e.preventDefault(); on = (on - 1 + hits.length) % hits.length; mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(hits[on < 0 ? 0 : on]); }
      else if (e.key === 'Escape') { list.hidden = true; }
    });
    // Keep focus in the input while clicking a match; hide the list when focus leaves.
    list.addEventListener('mousedown', e => e.preventDefault());
    list.addEventListener('click', e => {
      const a = e.target.closest('a[data-id]');
      if (!a) return;
      e.preventDefault();
      pick(hits.find(p => p.id === a.getAttribute('data-id')));
    });
    input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 120));
    if (o.autofocus) setTimeout(() => input.focus(), 0);
    return input;
  };

  // ---------- New league: pick a team (2K13 style cards) ----------
  P.new = function (app) {
    if (!UI.canPlay()) { app.innerHTML = UI.notBuilt('engine'); return; }
    // Always the opening-night data: a new league starts from LEAGUE_2012, whatever save is loaded.
    const L = UI.state.league;
    const rosters = {};
    L.players.forEach(p => { if (!p.retired && p.team && p.team !== 'FA' && p.team !== 'DRAFT') (rosters[p.team] = rosters[p.team] || []).push(p); });
    Object.keys(rosters).forEach(k => rosters[k].sort(byOvr));
    const H = window.HISTORY_PRIOR;
    const recOf = abbr => {
      const r = H && H.records && (H.records[2012] || H.records['2012']);
      const x = r && r[abbr];
      return x ? (typeof x === 'string' ? x : x.w != null ? x.w + '-' + x.l : '') : '';
    };
    const info = L.teams.map(t => {
      const r = rosters[t.abbr] || [];
      const ovr = ovrFrom(r);
      return { t, r, ovr, tier: UI.teamTier(ovr), cap: UI.payrollInfo(t.abbr, r, false), rec: recOf(t.abbr) };
    });
    const byAbbr = {};
    info.forEach(x => { byAbbr[x.t.abbr] = x; });
    const tierCls = s => 'tier-' + s.split(' ')[0].toLowerCase();

    const card = x => {
      const t = x.t, c1 = (t.colors && t.colors[0]) || '#333';
      return `<button type="button" class="team-tile ts-card" data-team="${esc(t.abbr)}" style="--c1:${esc(c1)}">
        <span class="ts-top">${UI.logo(t.abbr, 54)}
          <span class="ts-nm"><small>${esc(t.city)}</small><b>${esc(t.name)}</b></span>
          <span class="ts-ovr" title="Team overall rating"><small>TEAM OVR</small><b>${x.ovr || '-'}</b></span></span>
        <span class="ts-tags"><span class="ts-tag ${tierCls(x.tier)}">${esc(x.tier.toUpperCase())}</span>${x.cap.word ? `<span class="ts-tag cap-${x.cap.word.toLowerCase()}" title="${esc(x.cap.line)}">${esc(x.cap.word.toUpperCase())}</span>` : ''}${x.rec ? `<span class="ts-tag ts-rec" title="2011-12 record">2011-12: ${esc(x.rec)}</span>` : ''}</span>
        <span class="ts-stars">${x.r.slice(0, 3).map(p => `<span><i>${esc(p.name)}</i><b class="${UI.ovrClass(p.ovr)}">${esc(p.ovr)}</b></span>`).join('')}</span>
      </button>`;
    };
    const FILTERS = [['all', 'ALL'], ['East', 'EAST'], ['West', 'WEST'], ['Contender', 'CONTENDERS'], ['Rebuild', 'REBUILDS']];
    const visible = f => info.filter(x => f === 'all' || x.t.conf === f || x.tier === f);
    const slots = UI.saves.list();
    const first = UI.saves.firstEmpty() || 1;
    app.innerHTML = `${UI.header('SELECT YOUR TEAM', 'TEAM OVR rates the whole team from its top eight players. Contenders are 81 and up, rebuilds 76 and below.')}
      <div class="ts-bar">
        <div class="ts-filters" role="group" aria-label="Filter teams">${FILTERS.map(([k, l], i) => `<button type="button" data-f="${k}" class="${i ? '' : 'on'}" aria-pressed="${!i}">${l}</button>`).join('')}</div>
        <button type="button" class="btn btn-small ts-random" id="randomBtn">RANDOM TEAM</button>
      </div>
      <div id="tsGrid"></div>
      <div class="ts-modal" id="confirm" hidden role="dialog" aria-modal="true" aria-labelledby="confirmName">
        <div class="ts-box" id="confirmBox">
          <div class="ts-head" id="confirmTeam"></div>
          <div class="ts-roster" id="confirmRoster"></div>
          <div class="ts-form">
            <label class="field"><span>SAVE NAME</span><input id="saveName" maxlength="40"></label>
            <label class="field"><span>SAVE SLOT</span><select id="saveSlot">${slots.map(s => `<option value="${s.slot}" ${s.slot === first ? 'selected' : ''}>Slot ${s.slot}: ${s.meta ? esc(s.meta.name) + ' (overwrite)' : 'Empty'}</option>`).join('')}</select></label>
          </div>
          <div class="confirm-actions"><button type="button" class="btn btn-gold btn-big" id="startBtn">START</button><button type="button" class="btn" id="cancelBtn">CANCEL</button></div>
        </div>
      </div>`;
    let filter = 'all', picked = null;
    const grid = UI.$('#tsGrid', app);
    const drawGrid = () => {
      const list = visible(filter);
      if (filter === 'all' || filter === 'East' || filter === 'West') {
        grid.innerHTML = confs().filter(c => filter === 'all' || c === filter).map(c => `<h3 class="conf-label">${esc(c.toUpperCase())}</h3>
          <div class="ts-grid">${list.filter(x => x.t.conf === c).sort((a, b) => a.t.city.localeCompare(b.t.city) || a.t.name.localeCompare(b.t.name)).map(card).join('')}</div>`).join('');
      } else {
        grid.innerHTML = `<h3 class="conf-label">${esc(filter === 'Contender' ? 'CONTENDERS' : 'REBUILDS')} <small>${list.length} TEAMS, BEST FIRST</small></h3>
          <div class="ts-grid">${list.slice().sort((a, b) => b.ovr - a.ovr || a.t.city.localeCompare(b.t.city)).map(card).join('')}</div>`;
      }
      UI.$$('.ts-card', grid).forEach(b => {
        if (b.getAttribute('data-team') === picked) b.classList.add('picked');
        b.addEventListener('click', () => open(b.getAttribute('data-team')));
      });
    };
    const confirm = UI.$('#confirm', app);
    const close = () => {
      confirm.hidden = true; picked = null;
      document.body.classList.remove('ts-lock');
      UI.$$('.ts-card.picked', app).forEach(x => x.classList.remove('picked'));
    };
    const open = abbr => {
      const x = byAbbr[abbr];
      if (!x) return;
      picked = abbr;
      UI.$$('.ts-card', app).forEach(b => b.classList.toggle('picked', b.getAttribute('data-team') === abbr));
      const t = x.t;
      UI.$('#confirmBox', app).style.setProperty('--c1', (t.colors && t.colors[0]) || '#333');
      UI.$('#confirmTeam', app).innerHTML = `${UI.logo(abbr, 72)}
        <div class="ts-hinfo"><div class="ct-k">${esc(x.tier.toUpperCase())} | TEAM OVR ${x.ovr || '-'}${x.cap.word ? ' | ' + esc(x.cap.word.toUpperCase()) : ''}</div>
        <h2 class="ct-t" id="confirmName">${esc(t.city + ' ' + t.name)}</h2><div class="ts-pay">${esc(x.cap.line)}</div></div>
        <button type="button" class="ts-x" id="closeBtn" aria-label="Close">&times;</button>`;
      UI.$('#confirmRoster', app).innerHTML = `<table class="stats ts-rt"><thead><tr><th class="l">PLAYER</th><th>POS</th><th>AGE</th><th>OVR</th><th class="hide-sm">SALARY</th></tr></thead><tbody>${x.r.map(p => `<tr>
          <td class="l"><span class="ts-pn">${esc(p.name)}</span></td><td>${esc(posLabel(p))}</td><td>${esc(p.age)}</td><td class="${UI.ovrClass(p.ovr)}"><b>${esc(p.ovr)}</b></td><td class="hide-sm">${UI.fmtMoney(p.contract ? UI.salaryOf(p) : p.salary)}</td></tr>`).join('')}</tbody></table>`;
      UI.$('#closeBtn', app).addEventListener('click', close);
      UI.$('#saveName', app).value = t.name + ' Association';
      confirm.hidden = false;
      document.body.classList.add('ts-lock');
      UI.$('#confirmRoster', app).scrollTop = 0;
      setTimeout(() => { const s = UI.$('#startBtn', app); if (s) s.focus({ preventScroll: true }); }, 0);
    };
    UI.$$('.ts-filters button', app).forEach(b => b.addEventListener('click', () => {
      filter = b.getAttribute('data-f');
      UI.$$('.ts-filters button', app).forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      drawGrid();
    }));
    UI.$('#randomBtn', app).addEventListener('click', () => {
      const list = visible(filter);
      if (list.length) open(list[Math.floor(Math.random() * list.length)].t.abbr);
    });
    confirm.addEventListener('click', e => { if (e.target === confirm) close(); });
    const onKey = e => {
      if (!document.body.contains(confirm)) { document.removeEventListener('keydown', onKey); document.body.classList.remove('ts-lock'); return; }
      if (e.key === 'Escape' && !confirm.hidden) close();
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', () => document.body.classList.remove('ts-lock'), { once: true });
    drawGrid();
    UI.$('#cancelBtn', app).addEventListener('click', close);
    UI.$('#startBtn', app).addEventListener('click', async () => {
      if (!picked) return;
      const btn = UI.$('#startBtn');
      btn.disabled = true;
      btn.textContent = 'BUILDING THE LEAGUE...';
      await new Promise(r => setTimeout(r, 30));
      try {
        await UI.saves.create(Number(UI.$('#saveSlot').value), UI.$('#saveName').value.trim() || 'My Association', picked);
        UI.updateChrome();
        location.hash = '#/season';
      } catch (e) {
        console.warn(e);
        UI.toast('Could not start the league: ' + e.message, 'error');
        btn.disabled = false;
        btn.textContent = 'START';
      }
    });
  };

  // ---------- Rosters: all teams ----------
  P.teams = function (app) {
    const user = UI.userTeam();
    const hasSeason = !!UI.state.season;
    const card = t => `<a class="team-card${t.abbr === user ? ' mine' : ''}" href="#/team/${esc(t.abbr)}" style="--c1:${esc(t.colors[0])}">
        ${UI.logo(t.abbr, 48)}
        <span class="tc-name"><span class="tc-city">${esc(t.city)}${hasSeason ? ' | ' + esc(UI.record(t.abbr)) : ''}</span><span class="tc-team">${esc(t.name)}</span></span>
        <span class="tc-ovr"><b>${UI.teamOvr(t.abbr) || '-'}</b><small>TEAM OVR</small></span>
      </a>`;
    const fa = UI.roster('FA');
    const mine = user ? UI.teams().find(t => t.abbr === user) : null;
    app.innerHTML = UI.header('ROSTERS', 'Find any player by name, or open a team.') +
      '<div class="teams-search" id="teamsSearch"></div>' +
      (mine ? `<h3 class="conf-label">YOUR TEAM</h3><div class="team-cards">${card(mine)}${fa.length ? `<a class="team-card" href="#/team/FA" style="--c1:#55555c">${UI.logo('FA', 48)}<span class="tc-name"><span class="tc-city">Unsigned</span><span class="tc-team">Free Agents</span></span><span class="tc-ovr"><b>${fa.length}</b><small>PLAYERS</small></span></a>` : ''}</div>` : '') +
      confs().map(c => `<h3 class="conf-label">${esc(c.toUpperCase())}</h3><div class="team-cards">${UI.teams().filter(t => t.conf === c).sort((a, b) => a.city.localeCompare(b.city)).map(card).join('')}</div>`).join('') +
      (!mine && fa.length ? `<h3 class="conf-label">UNSIGNED</h3><div class="team-cards"><a class="team-card" href="#/team/FA" style="--c1:#55555c">${UI.logo('FA', 48)}<span class="tc-name"><span class="tc-city">Unsigned</span><span class="tc-team">Free Agents</span></span><span class="tc-ovr"><b>${fa.length}</b><small>PLAYERS</small></span></a></div>` : '');
    UI.playerSearch(UI.$('#teamsSearch', app), { placeholder: 'Search any player by name, like Kemba or Durant' });
  };

  // Team totals for the regular season from the stored box scores: points, rebounds, assists
  // and points allowed per game, with league ranks.
  let tsCache = { ver: -1 };
  UI.teamSeasonStats = function () {
    const s = UI.state.season;
    if (!s) return null;
    if (tsCache.ver === UI.state.ver && tsCache.season === s) return tsCache.out;
    const acc = {};
    const get = a => (acc[a] = acc[a] || { g: 0, pts: 0, opp: 0, reb: 0, ast: 0, bg: 0 });
    UI.games().forEach(g => {
      if (!g.played || g.playoff) return;
      const r = g.result;
      [['home', g.hs, g.as], ['away', g.as, g.hs]].forEach(([side, us, them]) => {
        const abbr = g[side];
        const x = get(abbr);
        x.g++; x.pts += Number(us) || 0; x.opp += Number(them) || 0;
        const box = r && r[side] && r[side].box;
        if (Array.isArray(box) && box.length) {
          x.bg++;
          box.forEach(b => { if (!b) return; x.reb += b.reb != null ? b.reb : (b.oreb || 0) + (b.dreb || 0); x.ast += b.ast || 0; });
        }
      });
    });
    const out = {};
    Object.keys(acc).forEach(a => {
      const x = acc[a];
      out[a] = { g: x.g, pts: x.pts / x.g, opp: x.opp / x.g, reb: x.bg ? x.reb / x.bg : null, ast: x.bg ? x.ast / x.bg : null, rank: {} };
    });
    const list = Object.keys(out);
    [['pts', -1], ['reb', -1], ['ast', -1], ['opp', 1]].forEach(([k, dir]) => {
      list.filter(a => out[a][k] != null).sort((a, b) => (out[a][k] - out[b][k]) * dir).forEach((a, i) => { out[a].rank[k] = i + 1; });
    });
    tsCache = { ver: UI.state.ver, season: s, out };
    return out;
  };

  // The summary block above a team's roster: best starting five, thin spots, payroll, team ranks.
  function teamSummary(abbr, roster) {
    if (abbr === 'FA' || !roster.length) return '';
    const five = UI.bestLineup(roster);
    const needs = UI.teamNeeds(roster, five);
    const pay = UI.payrollInfo(abbr, roster, !!UI.state.game);
    const ts = UI.teamSeasonStats();
    const me = ts && ts[abbr] && ts[abbr].g ? ts[abbr] : null;
    const n = me ? Object.keys(ts).length : 0;
    const rankCell = (k, label, v) => `<div class="tm-rk"><small>${label}</small><b>${UI.fmt1(v)}</b><em class="${me.rank[k] <= 5 ? 'good' : me.rank[k] > n - 5 ? 'bad' : ''}">${me.rank[k] ? ordinal(me.rank[k]) + ' of ' + n : '-'}</em></div>`;
    const pct = v => Math.max(0, Math.min(100, v));
    const scale = pay.tax ? Math.max(pay.pay, pay.tax) * 1.08 : pay.pay || 1;
    return `<section class="tm-sum">
      <div class="tm-box tm-five">
        <h3>STARTING FIVE <small>best lineup by OVR</small></h3>
        <ol>${five.map(({ slot, p }) => p ? `<li><span class="tm-slot">${slot}</span>
            <a class="tm-pl" href="#/player/${encodeURIComponent(p.id)}"><span class="tm-hs">${UI.headshot(p)}</span><span class="tm-nm"><b>${esc(p.name)}</b><small>${esc(posLabel(p))} | Age ${esc(p.age)}</small></span></a>
            <b class="tm-ovr ${UI.ovrClass(p.ovr)}">${esc(p.ovr)}</b></li>` : `<li><span class="tm-slot">${slot}</span><span class="muted">Nobody</span></li>`).join('')}</ol>
      </div>
      <div class="tm-side">
        <div class="tm-box tm-needs"><h3>TOP NEEDS</h3>
          <ul>${needs.map(x => `<li><b>${x.pos}</b><span>${esc(x.why)}</span></li>`).join('')}</ul></div>
        <div class="tm-box tm-pay"><h3>PAYROLL ${pay.word ? `<span class="ts-tag cap-${pay.word.toLowerCase()}">${esc(pay.word.toUpperCase())}</span>` : ''}</h3>
          <p>${esc(pay.line)}</p>
          ${pay.cap ? `<div class="tm-bar" aria-hidden="true"><i style="width:${pct(pay.pay / scale * 100)}%"></i><span class="tm-mk" style="left:${pct(pay.cap / scale * 100)}%"><em>CAP</em></span><span class="tm-mk" style="left:${pct(pay.tax / scale * 100)}%"><em>TAX</em></span></div>` : ''}
        </div>
        ${me ? `<div class="tm-box tm-ranks"><h3>TEAM STATS <small>per game, ${me.g} games</small></h3><div class="tm-rks">
          ${rankCell('pts', 'POINTS', me.pts)}${me.reb != null ? rankCell('reb', 'REBOUNDS', me.reb) : ''}${me.ast != null ? rankCell('ast', 'ASSISTS', me.ast) : ''}${rankCell('opp', 'DEFENSE', me.opp)}
        </div><p class="tm-note">Defense is points allowed.</p></div>` : ''}
      </div>
    </section>`;
  }

  // ---------- Team roster ----------
  P.team = function (app, abbr) {
    const t = UI.team(abbr);
    const known = abbr === 'FA' || UI.teams().some(x => x.abbr === abbr);
    if (!known) { app.innerHTML = UI.empty('TEAM NOT FOUND', 'There is no team with the code ' + esc(abbr) + '.', '<a class="btn" href="#/teams">ALL ROSTERS</a>'); return; }
    const roster = UI.roster(abbr);
    const tot = UI.seasonTotals();
    const hasSeason = !!UI.state.season;
    const c1 = (t.colors && t.colors[0]) || '#333', c2 = (t.colors && t.colors[1]) || c1;
    const rec = hasSeason && abbr !== 'FA' ? UI.record(abbr) : null;
    const rank = rec ? (UI.confTable(t.conf).find(r => r.abbr === abbr) || {}).rank : null;
    const isUser = abbr === UI.userTeam();

    // Sortable roster: click a header to sort, click again to flip. OVR, high to low, by default.
    const lastName = p => { const s = String(p.name || '').split(' '); return (s.length > 1 ? s.slice(1).join(' ') + ' ' + s[0] : s[0]).toLowerCase(); };
    const data = roster.map(p => {
      const pg = hasSeason ? UI.perGame(tot[p.id]) : null;
      const end = UI.contractEndOf(p);
      const pp = posPair(p);
      return { p, pg, end, v: {
        name: lastName(p), pos: SLOTS.indexOf(pp[0]) * 10 + SLOTS.indexOf(pp[1]), age: Number(p.age) || 0, ht: Number(p.ht) || 0, ovr: Number(p.ovr) || 0,
        g: pg ? pg.g : 0, pts: pg ? pg.pts : -1, reb: pg ? pg.reb : -1, ast: pg ? pg.ast : -1, salary: Number(UI.salaryOf(p)) || 0, thru: end || 0
      } };
    });
    const COLS = [['name', 'PLAYER', 'l'], ['pos', 'POS'], ['age', 'AGE'], ['ht', 'HT', 'hide-sm'], ['ovr', 'OVR']]
      .concat(hasSeason ? [['g', 'G', 'hide-sm'], ['pts', 'PTS'], ['reb', 'REB', 'hide-sm'], ['ast', 'AST', 'hide-sm']] : [])
      .concat([['salary', 'SALARY', 'hide-sm'], ['thru', 'THRU', 'hide-sm']]);
    const ASC = ['name', 'pos'];
    const sort = { key: 'ovr', dir: -1 };
    const rowHtml = ({ p, pg, end }) => `<tr>
        <td class="l"><a class="rt-name" href="#/player/${esc(p.id)}"><span class="rt-hs">${UI.headshot(p)}</span><span>${esc(p.name)} ${UI.injuryBadge(p)}</span></a></td>
        <td class="rt-pos">${esc(posLabel(p))}</td><td>${esc(p.age)}</td><td class="hide-sm">${UI.fmtHt(p.ht)}</td>
        <td class="rt-ovr ${UI.ovrClass(p.ovr)}">${esc(p.ovr)}</td>
        ${hasSeason ? `<td class="hide-sm">${pg ? pg.g : 0}</td><td>${pg ? UI.fmt1(pg.pts) : '-'}</td><td class="hide-sm">${pg ? UI.fmt1(pg.reb) : '-'}</td><td class="hide-sm">${pg ? UI.fmt1(pg.ast) : '-'}</td>` : ''}
        <td class="hide-sm">${UI.fmtMoney(UI.salaryOf(p))}</td><td class="hide-sm">${end ? UI.fmtSeasonEnd(end) : '-'}</td>
      </tr>`;
    const sorted = () => data.slice().sort((a, b) => {
      const x = a.v[sort.key], y = b.v[sort.key];
      const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return c * sort.dir || (b.v.ovr - a.v.ovr) || a.v.name.localeCompare(b.v.name);
    });
    const head = () => COLS.map(([k, l, cls]) => {
      const on = sort.key === k;
      return `<th class="${cls || ''} th-s${on ? ' on' : ''}" aria-sort="${on ? (sort.dir < 0 ? 'descending' : 'ascending') : 'none'}"><button type="button" class="th-sort" data-sort="${k}" title="Sort by ${esc(l.toLowerCase())}">${l}<i aria-hidden="true">${on ? (sort.dir < 0 ? '&#9660;' : '&#9650;') : ''}</i></button></th>`;
    }).join('');
    const table = data.length ? `<div class="tscroll"><table class="stats roster-t"><thead><tr id="rtHead">${head()}</tr></thead>
        <tbody id="rtBody">${sorted().map(rowHtml).join('')}</tbody></table></div>` : '<p class="muted">No players.</p>';

    let sched = '';
    if (hasSeason && abbr !== 'FA') {
      const games = UI.games().filter(g => g.home === abbr || g.away === abbr);
      const played = games.filter(g => g.played).slice(-5).reverse();
      const next = games.filter(g => !g.played).slice(0, 5);
      sched = `<div class="two-col">
        <section>${UI.header('LAST 5')}${played.length ? UI.gameList(played, abbr) : '<p class="muted">No games played yet.</p>'}</section>
        <section>${UI.header('NEXT 5')}${next.length ? UI.gameList(next, abbr) : '<p class="muted">No games left.</p>'}</section>
      </div>`;
    }
    const links = isUser ? `<div class="row-btns">${UI.pages.manage ? '<a class="btn" href="#/manage">ROTATION</a>' : ''}${UI.pages.trade ? '<a class="btn" href="#/trade">TRADES</a>' : ''}${UI.pages.fa ? '<a class="btn" href="#/fa">FREE AGENCY</a>' : ''}${UI.pages.gleague ? '<a class="btn" href="#/gleague">' + (window.GLEAGUE && GLEAGUE.leagueName ? esc(String(GLEAGUE.leagueName(UI.state.game.year)).replace(/^NBA /, '').toUpperCase()) : 'G LEAGUE') + '</a>' : ''}</div>`
      : (UI.state.game && UI.state.game.teams[abbr] && UI.pages.trade ? `<div class="row-btns"><a class="btn btn-gold" href="#/trade/with/${esc(abbr)}">TRADE WITH ${esc(t.name.toUpperCase())}</a></div>` : '');
    let summary = '';
    try { summary = teamSummary(abbr, roster); } catch (e) { console.warn('Team summary failed', e); }

    app.innerHTML = `
      <section class="team-hero" style="--c1:${esc(c1)};--c2:${esc(c2)}">
        ${UI.logo(abbr, 110)}
        <div class="th-info">
          <div class="th-kicker">${esc(t.conf ? t.conf.toUpperCase() : 'UNSIGNED PLAYERS')}${t.div ? ' | ' + esc(t.div.toUpperCase()) : ''}</div>
          <h1 class="th-name"><span>${esc(t.city)}</span> ${esc(t.name)}</h1>
          <div class="th-stats">
            ${rec ? `<div><b>${esc(rec)}</b><small>RECORD${rank ? ' | #' + rank + ' ' + esc(t.conf.toUpperCase()) : ''}</small></div>` : ''}
            ${abbr !== 'FA' ? `<div><b>${UI.teamOvr(abbr) || '-'}</b><small>TEAM OVR</small></div>` : ''}
            <div><b>${roster.length}</b><small>PLAYERS</small></div>
          </div>
        </div>
      </section>
      ${links}
      ${summary}
      ${UI.header('ROSTER', data.length > 1 ? 'Click a column to sort.' : '')}
      ${table}
      ${sched}`;
    const headRow = UI.$('#rtHead', app);
    if (headRow) headRow.addEventListener('click', e => {
      const b = e.target.closest('[data-sort]');
      if (!b) return;
      const k = b.getAttribute('data-sort');
      if (sort.key === k) sort.dir = -sort.dir;
      else { sort.key = k; sort.dir = ASC.includes(k) ? 1 : -1; }
      headRow.innerHTML = head();
      UI.$('#rtBody', app).innerHTML = sorted().map(rowHtml).join('');
    });
  };

  // A compact list of games with links to box scores.
  UI.gameList = function (games, focus) {
    return `<ul class="glist">${games.map(g => {
      const dayLbl = esc(UI.gameDay(g));
      if (!g.played) {
        const vs = focus ? (g.home === focus ? 'vs ' + g.away : '@ ' + g.home) : g.away + ' @ ' + g.home;
        const opp = focus ? (g.home === focus ? g.away : g.home) : null;
        return `<li><span class="gl-day">${dayLbl}</span>${opp ? UI.logo(opp, 26) : ''}<span class="gl-vs">${esc(vs)}</span></li>`;
      }
      const won = focus ? ((g.home === focus) === (g.hs > g.as)) : null;
      const label = focus
        ? `<span class="gl-wl ${won ? 'w' : 'l'}">${won ? 'W' : 'L'}</span>${UI.logo(g.home === focus ? g.away : g.home, 26)}<span class="gl-vs">${esc(g.home === focus ? 'vs ' + g.away : '@ ' + g.home)}</span>`
        : `${UI.logo(g.away, 26)}<span class="gl-vs">${esc(g.away)} ${g.as} <span class="muted">@</span> ${esc(g.home)} ${g.hs}</span>`;
      const score = focus ? `${g.home === focus ? g.hs : g.as}-${g.home === focus ? g.as : g.hs}` : '';
      return `<li><span class="gl-day">${dayLbl}</span>${label}<span class="gl-res">${score}</span><a class="gl-box" href="#/game/${encodeURIComponent(g.id)}">BOX</a></li>`;
    }).join('')}</ul>`;
  };

  // ---------- Player card ----------
  const GROUPS = [
    ['SHOOTING', [['close', 'Shot Close'], ['mid', 'Mid-Range'], ['three', 'Three-Point'], ['ft', 'Free Throw']]],
    ['FINISHING', [['layup', 'Layup'], ['dunk', 'Dunk'], ['post', 'Post Moves']]],
    ['PLAYMAKING', [['handle', 'Ball Handling'], ['pass', 'Passing']]],
    ['DEFENSE', [['perD', 'On-Ball Defense'], ['intD', 'Interior Defense'], ['steal', 'Steal'], ['block', 'Block']]],
    ['REBOUNDING', [['oreb', 'Offensive Rebound'], ['dreb', 'Defensive Rebound']]],
    ['ATHLETICISM', [['speed', 'Speed'], ['vert', 'Vertical'], ['strength', 'Strength'], ['stamina', 'Stamina'], ['durability', 'Durability']]],
    ['IQ', [['oiq', 'Offensive IQ'], ['diq', 'Defensive IQ']]]
  ];

  // One career table: real seasons before the save (window.CAREER_PRIOR), seasons played in the
  // save (player.careerStats, totals), the season in progress, then a career average row.
  function careerHtml(p) {
    const rows = [];
    const prior = window.CAREER_PRIOR && Array.isArray(window.CAREER_PRIOR[p.id]) ? window.CAREER_PRIOR[p.id] : [];
    prior.forEach(c => rows.push({ year: c.year, team: c.team === 'TOT' && Array.isArray(c.teams) && c.teams.length ? 'TOT (' + c.teams.join(', ') + ')' : c.team, s: c }));
    const seen = new Set(rows.map(r => r.year));
    (Array.isArray(p.careerStats) ? p.careerStats : []).forEach(c => {
      const pg = UI.perGame(c);
      if (!pg) return;
      rows.push({ year: c.year, team: c.team, s: pg, sim: true });
      seen.add(c.year);
    });
    const s = UI.state.season;
    if (s && UI.state.game && !seen.has(s.year)) {
      const pg = UI.perGame(UI.seasonTotals()[p.id]);
      if (pg) rows.push({ year: s.year, team: p.team, s: pg, sim: true, live: true });
    }
    if (!rows.length) return UI.header('CAREER') + '<p class="muted">No NBA games yet.</p>';
    rows.sort((a, b) => a.year - b.year);
    const G = rows.reduce((t, r) => t + (Number(r.s.g) || 0), 0);
    const avg = k => { let w = 0, v = 0; rows.forEach(r => { const x = r.s[k]; if (x == null || isNaN(x) || !r.s.g) return; const n = Number(x) > 1 && /p$/.test(k) ? Number(x) / 100 : Number(x); v += n * r.s.g; w += r.s.g; }); return w ? v / w : null; };
    const cells = st => `<td>${esc(st.g)}</td><td>${UI.fmt1(st.mpg)}</td><td><b>${UI.fmt1(st.pts)}</b></td><td>${UI.fmt1(st.reb)}</td><td>${UI.fmt1(st.ast)}</td><td>${UI.fmt1(st.stl)}</td><td>${UI.fmt1(st.blk)}</td><td>${UI.fmtPct(st.fgp)}</td><td>${UI.fmtPct(st.tpp)}</td><td>${UI.fmtPct(st.ftp)}</td>`;
    const total = { g: G, mpg: avg('mpg'), pts: avg('pts'), reb: avg('reb'), ast: avg('ast'), stl: avg('stl'), blk: avg('blk'), fgp: avg('fgp'), tpp: avg('tpp'), ftp: avg('ftp') };
    return `${UI.header('CAREER', 'Per game, season by season.')}<div class="tscroll"><table class="stats career"><thead><tr><th class="l">SEASON</th><th class="l">TEAM</th><th>G</th><th>MPG</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="${r.sim ? 'sim' : ''}"><td class="l">${esc(UI.seasonLabel(r.year))}${r.live ? ' <small class="muted">so far</small>' : ''}</td><td class="l">${esc(r.team || '')}</td>${cells(r.s)}</tr>`).join('')}</tbody>
      <tfoot><tr><td class="l">CAREER</td><td class="l">${rows.length} season${rows.length > 1 ? 's' : ''}</td>${cells(total)}</tr></tfoot></table></div>`;
  }

  P.player = function (app, id) {
    const p = UI.player(id);
    if (!p) { app.innerHTML = UI.empty('PLAYER NOT FOUND', 'No player with the id ' + esc(id) + '.', '<a class="btn" href="#/teams">ALL ROSTERS</a>'); return; }
    const t = UI.team(p.team);
    const parts = String(p.name).split(' ');
    const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
    const last = parts[parts.length - 1];
    const a = p.attrs || {};
    const groups = GROUPS.map(([title, keys]) => {
      const vals = keys.map(k => Number(a[k[0]]) || 0);
      const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
      return `<div class="agroup"><div class="ag-head"><span>${title}</span><b class="${UI.ovrClass(avg)}">${avg}</b></div>
        ${keys.map(([k, label]) => { const v = Number(a[k]) || 0; return `<div class="abar"><span class="ab-l">${label}</span><span class="ab-track"><i class="${UI.ovrClass(v)}" style="width:${Math.max(0, Math.min(100, v))}%"></i></span><span class="ab-v">${v || '-'}</span></div>`; }).join('')}
      </div>`;
    }).join('');

    const career = careerHtml(p);
    const awards = Array.isArray(p.awards) && p.awards.length
      ? `${UI.header('AWARDS')}<ul class="awards">${p.awards.map(a => `<li><b>${esc(a.year ? UI.seasonLabel(a.year) : '')}</b> ${esc(a.award || a.name || a)}</li>`).join('')}</ul>` : '';
    let seasonHtml = '';
    if (UI.state.season) {
      const log = UI.gameLog(p.id).slice(0, 10);
      seasonHtml = `        ${log.length ? `${UI.header('GAME LOG', 'Last 10 games')}<div class="tscroll"><table class="stats"><thead><tr><th class="l">GAME</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG</th><th>3P</th><th>FT</th><th></th></tr></thead><tbody>${log.map(({ game: g, side, row: r }) => {
          const opp = side === 'home' ? g.away : g.home;
          const won = side === 'home' ? g.hs > g.as : g.as > g.hs;
          return `<tr><td class="l">${esc(UI.gameDay(g))} ${side === 'home' ? 'vs' : '@'} ${esc(opp)} <span class="${won ? 'win' : 'loss'}">${won ? 'W' : 'L'}</span></td><td>${Math.round(r.min || 0)}</td><td><b>${r.pts || 0}</b></td><td>${(r.reb != null ? r.reb : (r.oreb || 0) + (r.dreb || 0))}</td><td>${r.ast || 0}</td><td>${r.stl || 0}</td><td>${r.blk || 0}</td><td>${r.fgm || 0}-${r.fga || 0}</td><td>${r.tpm || 0}-${r.tpa || 0}</td><td>${r.ftm || 0}-${r.fta || 0}</td><td><a href="#/game/${encodeURIComponent(g.id)}">BOX</a></td></tr>`;
        }).join('')}</tbody></table></div>` : ''}`;
    }

    const injury = UI.injuryOf(p);
    const inj = injury
      ? `<span class="inj-text">${esc(injury.type || 'Injured')}${injury.games && injury.games < 900 ? ', out ' + injury.games + ' games' : ''}</span>` : (p.retired ? 'Retired' : 'Healthy');
    const cEnd = UI.contractEndOf(p);
    const note = UI.contractNote(p);
    const draft = p.draft && p.draft.year ? `Drafted ${p.draft.year}${p.draft.round ? ', round ' + p.draft.round : ''}${p.draft.pick ? ', pick ' + p.draft.pick : ''}${p.draft.team ? ' by ' + p.draft.team : ''}` : '';
    app.innerHTML = `
      <section class="pcard" style="--c1:${esc((t.colors && t.colors[0]) || '#333')};--c2:${esc((t.colors && t.colors[1]) || '#777')}">
        <div class="pc-photo">${UI.headshot(p, 'hs-big')}</div>
        <div class="pc-info">
          <a class="pc-team" href="#/team/${esc(p.team)}">${UI.logo(p.team, 28)}<span>${esc(UI.teamName(p.team))}</span></a>
          <h1 class="pc-name">${first ? `<span>${esc(first)}</span>` : ''}${esc(last)}</h1>
          <div class="pc-bio">
            <div><small>POS</small><b>${esc(p.pos)}</b></div>
            <div><small>AGE</small><b>${esc(p.age)}</b></div>
            <div><small>HEIGHT</small><b>${UI.fmtHt(p.ht)}</b></div>
            <div><small>WEIGHT</small><b>${esc(p.wt || '-')}</b></div>
            <div><small>SALARY</small><b>${UI.fmtMoney(UI.salaryOf(p))}</b></div>
            <div><small>CONTRACT THRU</small><b>${cEnd ? UI.fmtSeasonEnd(cEnd) : '-'}</b></div>
          </div>
          <div class="pc-status"><small>STATUS</small> ${inj}${note ? ` <span class="muted">| ${esc(note)}</span>` : ''}${typeof p.mood === 'number' ? ` <span class="muted">| Mood ${Math.round(p.mood)}</span>` : ''}</div>
          ${draft ? `<div class="pc-status muted">${esc(draft)}</div>` : ''}
        </div>
        <div class="pc-ratings">
          <div class="pc-ovr"><b>${esc(p.ovr)}</b><small>OVERALL</small></div>
        </div>
      </section>
      ${UI.header('ATTRIBUTES', '2K13 scale, 25 to 99.')}
      <div class="agroups">${groups}</div>
      ${career}
      ${seasonHtml}
      ${awards}`;
  };

  // ---------- League menu ----------
  P.league = function (app) {
    const has = n => typeof UI.pages[n] === 'function';
    const tiles = [
      has('news') && UI.tile('#/news', 'news', 'NEWS'),
      has('news') && UI.tile('#/news/transactions', 'moves', 'TRANSACTIONS'),
      has('awards') && UI.tile('#/awards', 'awards', 'AWARDS'),
      has('history') && UI.tile('#/history', 'history', 'HISTORY'),
      UI.tile('#/playoffs', 'playoffs', 'PLAYOFFS'),
      has('draft') && UI.tile('#/draft', 'draft', 'DRAFT'),
      UI.tile('#/classes', 'classes', 'DRAFT CLASSES'),
      UI.tile('#/teams', 'teams', 'ALL TEAMS')
    ].filter(Boolean);
    app.innerHTML = UI.header('LEAGUE') + `<div class="tile-grid">${tiles.join('')}</div>`;
  };

  // ---------- Draft classes (hub browser over window.DRAFTS) ----------
  // Sortable columns: tap a header to sort, tap again to flip (draft order by default). The header
  // buttons are full-cell tap targets, at least 44 px tall (css/style.css .classes .th-sort).
  const classSort = { key: 'pick', dir: 1 };
  const CLASS_COLS = [['pick', 'PICK', ''], ['name', 'PLAYER', 'l'], ['pos', 'POS', ''], ['age', 'AGE', ''], ['ht', 'HT', 'hide-sm'], ['ovr', 'OVR', '']];
  const CLASS_ASC = ['pick', 'name', 'pos', 'age'];
  P.classes = function (app, arg) {
    const D = window.DRAFTS;
    if (!D || !Object.keys(D).length) { app.innerHTML = UI.header('DRAFT CLASSES') + UI.empty('DRAFT CLASSES NOT LOADED', 'The draft data file <code>data/drafts.js</code> has not loaded.'); return; }
    const years = Object.keys(D).map(Number).sort((a, b) => a - b);
    const year = years.includes(Number(arg)) ? Number(arg) : years[0];
    const pickOf = p => (p.undrafted ? 999 : p.realPick || 998);
    const val = (p, k) => (k === 'pick' ? pickOf(p) : k === 'name' ? String(p.name || '') : k === 'pos' ? String(p.pos || '') : Number(p[k]) || 0);
    const sorted = () => D[year].slice().sort((a, b) => {
      const x = val(a, classSort.key), y = val(b, classSort.key);
      const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return c * classSort.dir || pickOf(a) - pickOf(b) || (b.ovr || 0) - (a.ovr || 0);
    });
    const rowHtml = p => {
      const live = UI.player(p.id) || p;
      const stash = p.arrivalYear && p.arrivalYear > year + 1 ? `<span class="badge badge-dim">OVERSEAS</span>` : '';
      return `<tr><td>${p.undrafted ? '<span class="muted">UDFA</span>' : esc(p.realPick || '-')}</td>
        <td class="l"><a class="cl-name" href="#/player/${esc(p.id)}"><span class="cl-hs">${UI.headshot(live)}</span><span>${esc(p.name)} ${stash}</span></a></td>
        <td>${esc(p.pos)}</td><td>${esc(p.age)}</td><td class="hide-sm">${UI.fmtHt(p.ht)}</td><td class="${UI.ovrClass(p.ovr)}"><b>${esc(p.ovr)}</b></td></tr>`;
    };
    const head = () => CLASS_COLS.map(([k, l, cls]) => {
      const on = classSort.key === k;
      return `<th class="${cls} th-s${on ? ' on' : ''}" aria-sort="${on ? (classSort.dir < 0 ? 'descending' : 'ascending') : 'none'}"><button type="button" class="th-sort" data-csort="${k}" title="Sort by ${esc(l.toLowerCase())}">${l}<i aria-hidden="true">${on ? (classSort.dir < 0 ? '&#9660;' : '&#9650;') : ''}</i></button></th>`;
    }).join('');
    app.innerHTML = UI.header('DRAFT CLASSES', 'Draft-day ratings. Each class enters the league on its draft day. Tap a column to sort.') +
      `<div class="tabs year-tabs">${years.map(y => `<a href="#/classes/${y}" class="${y === year ? 'on' : ''}">${y}</a>`).join('')}</div>
      <div class="tscroll"><table class="stats classes"><thead><tr id="clHead">${head()}</tr></thead><tbody id="clBody">${sorted().map(rowHtml).join('')}</tbody></table></div>`;
    const thead = UI.$('#clHead', app);
    if (thead) thead.addEventListener('click', e => {
      const b = e.target.closest('[data-csort]');
      if (!b) return;
      const k = b.getAttribute('data-csort');
      if (classSort.key === k) classSort.dir = -classSort.dir;
      else { classSort.key = k; classSort.dir = CLASS_ASC.includes(k) ? 1 : -1; }
      thead.innerHTML = head();
      UI.$('#clBody', app).innerHTML = sorted().map(rowHtml).join('');
    });
  };

  // ---------- Soundtrack ----------
  P.soundtrack = function (app) {
    const list = Array.isArray(window.SOUNDTRACK) ? window.SOUNDTRACK : [];
    const ids = UI.music && UI.music.hasIds();
    app.innerHTML = `${UI.header('SOUNDTRACK', 'The official NBA 2K13 soundtrack.')}
      ${ids ? '' : '<div class="note">These songs cannot play yet.</div>'}
      <ol class="tracklist">${list.map((s, i) => `<li><span class="tl-n">${String(i + 1).padStart(2, '0')}</span><span class="tl-t"><b>${esc(s.title)}</b><small>${esc(s.artist)}</small></span>${s.yt ? `<button type="button" class="btn btn-small" data-play="${i}">PLAY</button>` : '<span class="tl-na">Soon</span>'}</li>`).join('')}</ol>`;
    app.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => UI.music.playTrack(Number(b.getAttribute('data-play')))));
  };
})();
