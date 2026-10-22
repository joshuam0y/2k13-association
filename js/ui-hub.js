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

  // ---------- New league: pick a team ----------
  P.new = function (app) {
    if (!UI.canPlay()) { app.innerHTML = UI.notBuilt('engine'); return; }
    const teamTile = t => {
      const c1 = (t.colors && t.colors[0]) || '#333';
      return `<button type="button" class="team-tile" data-team="${esc(t.abbr)}" style="--c1:${esc(c1)}">
        ${UI.logo(t.abbr, 64)}
        <span class="tt-city">${esc(t.city)}</span><span class="tt-name">${esc(t.name)}</span>
        <span class="tt-ovr" title="Team overall rating"><small>TEAM OVR</small><b>${UI.teamOvr(t.abbr) || '-'}</b></span>
      </button>`;
    };
    const groups = confs().map(c => `<h3 class="conf-label">${esc(c.toUpperCase())}</h3>
      <div class="team-grid">${UI.teams().filter(t => t.conf === c).sort((a, b) => a.city.localeCompare(b.city)).map(teamTile).join('')}</div>`).join('');
    const slots = UI.saves.list();
    const first = UI.saves.firstEmpty() || 1;
    app.innerHTML = `${UI.header('SELECT YOUR TEAM', 'TEAM OVR is the rating of the whole team, from its top eight players.')}
      ${groups}
      <div class="confirm" id="confirm" hidden>
        <div class="confirm-inner">
          <div class="confirm-team" id="confirmTeam"></div>
          <label class="field"><span>SAVE NAME</span><input id="saveName" maxlength="40"></label>
          <label class="field"><span>SAVE SLOT</span><select id="saveSlot">${slots.map(s => `<option value="${s.slot}" ${s.slot === first ? 'selected' : ''}>Slot ${s.slot}: ${s.meta ? esc(s.meta.name) + ' (overwrite)' : 'Empty'}</option>`).join('')}</select></label>
          <div class="confirm-actions"><button type="button" class="btn btn-gold" id="startBtn">START</button><button type="button" class="btn" id="cancelBtn">CANCEL</button></div>
        </div>
      </div>`;
    let picked = null;
    const confirm = UI.$('#confirm');
    app.querySelectorAll('.team-tile').forEach(b => b.addEventListener('click', () => {
      picked = b.getAttribute('data-team');
      app.querySelectorAll('.team-tile').forEach(x => x.classList.toggle('picked', x === b));
      UI.$('#confirmTeam').innerHTML = `${UI.logo(picked, 56)}<div><div class="ct-k">TEAM OVR ${UI.teamOvr(picked) || '-'}</div><div class="ct-t">${esc(UI.teamName(picked))}</div></div>`;
      UI.$('#saveName').value = UI.team(picked).name + ' Association';
      confirm.hidden = false;
    }));
    UI.$('#cancelBtn').addEventListener('click', () => { confirm.hidden = true; picked = null; app.querySelectorAll('.team-tile.picked').forEach(x => x.classList.remove('picked')); });
    UI.$('#startBtn').addEventListener('click', async () => {
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
    app.innerHTML = UI.header('ROSTERS') +
      (mine ? `<h3 class="conf-label">YOUR TEAM</h3><div class="team-cards">${card(mine)}${fa.length ? `<a class="team-card" href="#/team/FA" style="--c1:#55555c">${UI.logo('FA', 48)}<span class="tc-name"><span class="tc-city">Unsigned</span><span class="tc-team">Free Agents</span></span><span class="tc-ovr"><b>${fa.length}</b><small>PLAYERS</small></span></a>` : ''}</div>` : '') +
      confs().map(c => `<h3 class="conf-label">${esc(c.toUpperCase())}</h3><div class="team-cards">${UI.teams().filter(t => t.conf === c).sort((a, b) => a.city.localeCompare(b.city)).map(card).join('')}</div>`).join('') +
      (!mine && fa.length ? `<h3 class="conf-label">UNSIGNED</h3><div class="team-cards"><a class="team-card" href="#/team/FA" style="--c1:#55555c">${UI.logo('FA', 48)}<span class="tc-name"><span class="tc-city">Unsigned</span><span class="tc-team">Free Agents</span></span><span class="tc-ovr"><b>${fa.length}</b><small>PLAYERS</small></span></a></div>` : '');
  };

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

    const rows = roster.map(p => {
      const pg = hasSeason ? UI.perGame(tot[p.id]) : null;
      const end = UI.contractEndOf(p);
      return `<tr>
        <td class="l"><a class="rt-name" href="#/player/${esc(p.id)}"><span class="rt-hs">${UI.headshot(p)}</span><span>${esc(p.name)} ${UI.injuryBadge(p)}</span></a></td>
        <td>${esc(p.pos)}</td><td>${esc(p.age)}</td><td class="hide-sm">${UI.fmtHt(p.ht)}</td>
        <td class="rt-ovr ${UI.ovrClass(p.ovr)}">${esc(p.ovr)}</td>
        ${hasSeason ? `<td class="hide-sm">${pg ? pg.g : 0}</td><td>${pg ? UI.fmt1(pg.pts) : '-'}</td><td class="hide-sm">${pg ? UI.fmt1(pg.reb) : '-'}</td><td class="hide-sm">${pg ? UI.fmt1(pg.ast) : '-'}</td>` : ''}
        <td class="hide-sm">${UI.fmtMoney(UI.salaryOf(p))}</td><td class="hide-sm">${end ? UI.fmtSeasonEnd(end) : '-'}</td>
      </tr>`;
    }).join('');
    const table = rows ? `<div class="tscroll"><table class="stats roster-t"><thead><tr><th class="l">PLAYER</th><th>POS</th><th>AGE</th><th class="hide-sm">HT</th><th>OVR</th>
        ${hasSeason ? '<th class="hide-sm">G</th><th>PTS</th><th class="hide-sm">REB</th><th class="hide-sm">AST</th>' : ''}<th class="hide-sm">SALARY</th><th class="hide-sm">THRU</th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : '<p class="muted">No players.</p>';

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
    const links = isUser ? `<div class="row-btns">${UI.pages.manage ? '<a class="btn" href="#/manage">ROTATION</a>' : ''}${UI.pages.trade ? '<a class="btn" href="#/trade">TRADES</a>' : ''}${UI.pages.fa ? '<a class="btn" href="#/fa">FREE AGENCY</a>' : ''}</div>` : '';

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
      ${UI.header('ROSTER')}
      ${table}
      ${sched}`;
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
          <div class="pc-pot"><b>${esc(p.pot || '-')}</b><small>POTENTIAL</small></div>
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
  P.classes = function (app, arg) {
    const D = window.DRAFTS;
    if (!D || !Object.keys(D).length) { app.innerHTML = UI.header('DRAFT CLASSES') + UI.empty('DRAFT CLASSES NOT LOADED', 'The draft data file <code>data/drafts.js</code> has not loaded.'); return; }
    const years = Object.keys(D).map(Number).sort((a, b) => a - b);
    const year = years.includes(Number(arg)) ? Number(arg) : years[0];
    const list = D[year].slice().sort((a, b) => (a.undrafted ? 999 : a.realPick || 998) - (b.undrafted ? 999 : b.realPick || 998) || (b.ovr || 0) - (a.ovr || 0));
    const rows = list.map(p => {
      const live = UI.player(p.id) || p;
      const stash = p.arrivalYear && p.arrivalYear > year + 1 ? `<span class="badge badge-dim">OVERSEAS</span>` : '';
      return `<tr><td>${p.undrafted ? '<span class="muted">UDFA</span>' : esc(p.realPick || '-')}</td>
        <td class="l"><a class="cl-name" href="#/player/${esc(p.id)}"><span class="cl-hs">${UI.headshot(live)}</span><span>${esc(p.name)} ${stash}</span></a></td>
        <td>${esc(p.pos)}</td><td>${esc(p.age)}</td><td class="hide-sm">${UI.fmtHt(p.ht)}</td><td class="${UI.ovrClass(p.ovr)}"><b>${esc(p.ovr)}</b></td></tr>`;
    }).join('');
    app.innerHTML = UI.header('DRAFT CLASSES', 'Draft-day ratings. Each class enters the league on its draft day.') +
      `<div class="tabs year-tabs">${years.map(y => `<a href="#/classes/${y}" class="${y === year ? 'on' : ''}">${y}</a>`).join('')}</div>
      <div class="tscroll"><table class="stats classes"><thead><tr><th>PICK</th><th class="l">PLAYER</th><th>POS</th><th>AGE</th><th class="hide-sm">HT</th><th>OVR</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
