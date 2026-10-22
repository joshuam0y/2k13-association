// Hub pages: home, new league team picker, rosters, team roster, player card, soundtrack.
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

  // ---------- Home ----------
  // One big primary action, a small secondary row, and four tiles. Everything else is in the header.
  P.home = function (app) {
    const latest = UI.saves.latest();
    const engineOk = UI.canPlay();
    let primary;
    if (latest) {
      const m = latest.meta;
      primary = `<a class="tile tile-main tile-continue" href="#/continue">
        <span class="tile-k">CONTINUE</span>
        <span class="tile-team">${UI.logo(m.userTeam, 88)}<span><span class="tile-t big">${esc(UI.teamName(m.userTeam))}</span>
        <span class="tile-d">${esc(m.name)} | ${esc(m.record || '0-0')}${m.year ? ' | ' + esc(UI.seasonLabel(m.year)) : ''}${m.date ? ' | ' + esc(UI.dateLabel(m.date)) : ''}</span></span></span>
      </a>`;
    } else {
      primary = `<a class="tile tile-main${engineOk ? '' : ' disabled'}" href="${engineOk ? '#/new' : '#/home'}" ${engineOk ? '' : 'aria-disabled="true"'}>
        <span class="tile-k">${engineOk ? 'NEW LEAGUE' : 'SIM ENGINE NOT BUILT YET'}</span>
        <span class="tile-t big">PLAY THE ASSOCIATION</span>
        <span class="tile-d">Choose your team from all 30 franchises and take it from opening night to the Finals.</span>
      </a>`;
    }
    const sec = [];
    if (latest && engineOk) sec.push(['#/new', 'NEW LEAGUE']);
    sec.push(['#/saves', 'LOAD SAVE']);
    if (typeof UI.pages.fantasy === 'function' && engineOk) sec.push(['#/fantasy/new', 'FANTASY DRAFT']);
    const tile = (href, k, t, d) => `<a class="tile" href="${href}"><span class="tile-k">${k}</span><span class="tile-t">${t}</span><span class="tile-d">${d}</span></a>`;
    app.innerHTML = `
      <section class="hero">
        <div class="hero-kicker">THE 2012-13 SEASON</div>
        <h1 class="hero-title"><span class="ht-2k">2K13</span> <span class="ht-a">ASSOCIATION</span></h1>
      </section>
      <div class="home-primary">${primary}</div>
      <div class="home-secondary">${sec.map(([h, l]) => `<a class="btn" href="${h}">${l}</a>`).join('')}</div>
      <div class="home-tiles">
        ${tile('#/teams', '30 TEAMS', 'ROSTERS', 'Every team, every player card')}
        ${tile('#/standings', 'EAST AND WEST', 'STANDINGS', 'Conference tables and the playoff race')}
        ${tile('#/classes', '2013 TO 2026', 'DRAFT CLASSES', 'Every real class, pick by pick')}
        ${tile('#/soundtrack', '24 SONGS', 'SOUNDTRACK', 'The official 2K13 tracklist')}
      </div>`;
  };

  // ---------- New league: pick a team ----------
  P.new = function (app) {
    if (!UI.canPlay()) { app.innerHTML = UI.notBuilt('engine'); return; }
    const teamTile = t => {
      const star = UI.roster(t.abbr)[0];
      const c1 = (t.colors && t.colors[0]) || '#333';
      return `<button type="button" class="team-tile" data-team="${esc(t.abbr)}" style="--c1:${esc(c1)}">
        ${UI.logo(t.abbr, 64)}
        <span class="tt-city">${esc(t.city)}</span><span class="tt-name">${esc(t.name)}</span>
        <span class="tt-meta"><b>${UI.teamOvr(t.abbr) || '-'}</b> TEAM OVR</span>
        ${star ? `<span class="tt-star">Star: ${esc(star.name)} <b>${esc(star.ovr)}</b></span>` : ''}
      </button>`;
    };
    const groups = confs().map(c => `<h3 class="conf-label">${esc(c.toUpperCase())}ERN CONFERENCE</h3>
      <div class="team-grid">${UI.teams().filter(t => t.conf === c).sort((a, b) => a.city.localeCompare(b.city)).map(teamTile).join('')}</div>`).join('');
    const slots = UI.saves.list();
    const first = UI.saves.firstEmpty() || 1;
    app.innerHTML = `${UI.header('SELECT YOUR TEAM', 'Pick the franchise you will run. Rosters are as of opening night 2012.')}
      ${groups}
      <div class="confirm" id="confirm" hidden>
        <div class="confirm-inner">
          <div class="confirm-team" id="confirmTeam"></div>
          <label class="field"><span>SAVE NAME</span><input id="saveName" maxlength="40"></label>
          <label class="field"><span>SAVE SLOT</span><select id="saveSlot">${slots.map(s => `<option value="${s.slot}" ${s.slot === first ? 'selected' : ''}>Slot ${s.slot}: ${s.meta ? esc(s.meta.name) + ' (overwrite)' : 'Empty'}</option>`).join('')}</select></label>
          <div class="confirm-actions"><button type="button" class="btn btn-gold" id="startBtn">START ASSOCIATION</button><button type="button" class="btn" id="cancelBtn">CANCEL</button></div>
        </div>
      </div>`;
    let picked = null;
    const confirm = UI.$('#confirm');
    app.querySelectorAll('.team-tile').forEach(b => b.addEventListener('click', () => {
      picked = b.getAttribute('data-team');
      app.querySelectorAll('.team-tile').forEach(x => x.classList.toggle('picked', x === b));
      UI.$('#confirmTeam').innerHTML = `${UI.logo(picked, 56)}<div><div class="ct-k">YOU ARE THE GM OF THE</div><div class="ct-t">${esc(UI.teamName(picked))}</div></div>`;
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
        btn.textContent = 'START ASSOCIATION';
      }
    });
  };

  // ---------- Rosters: all teams ----------
  P.teams = function (app) {
    const user = UI.userTeam();
    const card = t => `<a class="team-card${t.abbr === user ? ' mine' : ''}" href="#/team/${esc(t.abbr)}" style="--c1:${esc(t.colors[0])}">
        ${UI.logo(t.abbr, 48)}
        <span class="tc-name"><span class="tc-city">${esc(t.city)}</span><span class="tc-team">${esc(t.name)}</span></span>
        <span class="tc-ovr"><b>${UI.teamOvr(t.abbr) || '-'}</b><small>${UI.state.season ? esc(UI.record(t.abbr)) : 'OVR'}</small></span>
      </a>`;
    const fa = UI.roster('FA');
    app.innerHTML = UI.header('ROSTERS', 'Team overall is a weighted average of the top eight players.') +
      confs().map(c => `<h3 class="conf-label">${esc(c.toUpperCase())}ERN CONFERENCE</h3><div class="team-cards">${UI.teams().filter(t => t.conf === c).sort((a, b) => a.city.localeCompare(b.city)).map(card).join('')}</div>`).join('') +
      (fa.length ? `<h3 class="conf-label">UNSIGNED</h3><div class="team-cards"><a class="team-card" href="#/team/FA" style="--c1:#55555c">${UI.logo('FA', 48)}<span class="tc-name"><span class="tc-city">Free</span><span class="tc-team">Agents</span></span><span class="tc-ovr"><b>${fa.length}</b><small>PLAYERS</small></span></a></div>` : '');
  };

  // ---------- Team roster ----------
  P.team = function (app, abbr) {
    const t = UI.team(abbr);
    const known = abbr === 'FA' || UI.teams().some(x => x.abbr === abbr);
    if (!known) { app.innerHTML = UI.empty('TEAM NOT FOUND', 'There is no team with the code ' + esc(abbr) + '.', '<a class="btn" href="#/teams">ALL ROSTERS</a>'); return; }
    const roster = UI.roster(abbr);
    const payroll = roster.reduce((s, p) => s + (Number(UI.salaryOf(p)) || 0), 0);
    const tot = UI.seasonTotals();
    const hasSeason = !!UI.state.season;
    const c1 = (t.colors && t.colors[0]) || '#333', c2 = (t.colors && t.colors[1]) || c1;
    const rec = hasSeason && abbr !== 'FA' ? UI.record(abbr) : null;
    const rank = rec ? (UI.confTable(t.conf).find(r => r.abbr === abbr) || {}).rank : null;

    const rows = roster.map(p => {
      const pg = hasSeason ? UI.perGame(tot[p.id]) : null;
      return `<a class="prow" href="#/player/${esc(p.id)}">
        <span class="prow-hs">${UI.headshot(p)}</span>
        <span class="prow-main"><span class="prow-name">${esc(p.name)} ${UI.injuryBadge(p)}</span>
          <span class="prow-meta"><b>${esc(p.pos)}</b><span>Age ${esc(p.age)}</span><span>${UI.fmtHt(p.ht)}</span><span>${esc(p.wt || '-')} lbs</span></span></span>
        <span class="prow-money"><span>${UI.fmtMoney(UI.salaryOf(p))}</span><small>${UI.contractEndOf(p) ? 'thru ' + UI.fmtSeasonEnd(UI.contractEndOf(p)) : 'Unsigned'}</small></span>
        ${hasSeason ? `<span class="prow-season">${pg ? `<b>${UI.fmt1(pg.pts)}</b> PTS <b>${UI.fmt1(pg.reb)}</b> REB <b>${UI.fmt1(pg.ast)}</b> AST` : '<small>No games yet</small>'}</span>` : ''}
        <span class="prow-ovr ${UI.ovrClass(p.ovr)}">${esc(p.ovr)}</span>
      </a>`;
    }).join('');

    let sched = '';
    if (hasSeason && abbr !== 'FA') {
      const games = UI.games().filter(g => g.home === abbr || g.away === abbr);
      const played = games.filter(g => g.played).slice(-5).reverse();
      const next = games.filter(g => !g.played).slice(0, 5);
      sched = `<div class="two-col">
        <section>${UI.header('LAST GAMES')}${played.length ? UI.gameList(played, abbr) : '<p class="muted">No games played yet.</p>'}</section>
        <section>${UI.header('UPCOMING')}${next.length ? UI.gameList(next, abbr) : '<p class="muted">No games left.</p>'}</section>
      </div>`;
    }

    app.innerHTML = `
      <section class="team-hero" style="--c1:${esc(c1)};--c2:${esc(c2)}">
        ${UI.logo(abbr, 120)}
        <div class="th-info">
          <div class="th-kicker">${esc(t.conf ? t.conf.toUpperCase() + 'ERN CONFERENCE' : 'UNSIGNED PLAYERS')}${t.div ? ' | ' + esc(t.div.toUpperCase()) : ''}</div>
          <h1 class="th-name"><span>${esc(t.city)}</span> ${esc(t.name)}</h1>
          <div class="th-stats">
            ${rec ? `<div><b>${esc(rec)}</b><small>RECORD${rank ? ' | #' + rank + ' ' + esc(t.conf.toUpperCase()) : ''}</small></div>` : ''}
            ${abbr !== 'FA' ? `<div><b>${UI.teamOvr(abbr) || '-'}</b><small>TEAM OVR</small></div>` : ''}
            <div><b>${roster.length}</b><small>PLAYERS</small></div>
            ${abbr !== 'FA' ? `<div><b>${UI.fmtMoney(payroll)}</b><small>PAYROLL</small></div>` : ''}
          </div>
        </div>
      </section>
      ${UI.header('ROSTER', 'Sorted by overall rating.')}
      <div class="roster">${rows || '<p class="muted">No players.</p>'}</div>
      ${sched}`;
  };

  // A compact list of games with links to box scores.
  UI.gameList = function (games, focus) {
    return `<ul class="glist">${games.map(g => {
      const dayLbl = esc(UI.gameDay(g));
      if (!g.played) {
        const vs = focus ? (g.home === focus ? 'vs ' + g.away : '@ ' + g.home) : g.away + ' @ ' + g.home;
        const opp = focus ? (g.home === focus ? g.away : g.home) : null;
        return `<li><span class="gl-day">${dayLbl}</span>${opp ? UI.logo(opp, 24) : ''}<span class="gl-vs">${esc(vs)}</span><span class="gl-res muted">Upcoming</span></li>`;
      }
      const won = focus ? ((g.home === focus) === (g.hs > g.as)) : null;
      const label = focus
        ? `<span class="gl-wl ${won ? 'w' : 'l'}">${won ? 'W' : 'L'}</span>${UI.logo(g.home === focus ? g.away : g.home, 24)}<span class="gl-vs">${esc(g.home === focus ? 'vs ' + g.away : '@ ' + g.home)}</span>`
        : `${UI.logo(g.away, 24)}<span class="gl-vs">${esc(g.away)} ${g.as} <span class="muted">@</span> ${esc(g.home)} ${g.hs}</span>`;
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

  // ---------- Draft classes (hub browser over window.DRAFTS) ----------
  P.classes = function (app, arg) {
    const D = window.DRAFTS;
    if (!D || !Object.keys(D).length) { app.innerHTML = UI.header('DRAFT CLASSES') + UI.empty('DRAFT CLASSES NOT BUILT YET', 'The draft data file <code>data/drafts.js</code> has not loaded yet.'); return; }
    const years = Object.keys(D).map(Number).sort((a, b) => a - b);
    const year = years.includes(Number(arg)) ? Number(arg) : years[0];
    const list = D[year].slice().sort((a, b) => (a.undrafted ? 999 : a.realPick || 998) - (b.undrafted ? 999 : b.realPick || 998) || (b.pot || 0) - (a.pot || 0));
    const rows = list.map(p => {
      const live = UI.player(p.id) || p;
      const stash = p.arrivalYear && p.arrivalYear > year + 1 ? `<span class="badge badge-dim">STASH, ARRIVES ${esc(UI.seasonLabel(p.arrivalYear))}</span>` : '';
      return `<tr><td>${p.undrafted ? '<span class="muted">UDFA</span>' : esc(p.realPick || '-')}</td>
        <td class="l"><a class="cl-name" href="#/player/${esc(p.id)}"><span class="cl-hs">${UI.headshot(live)}</span><span>${esc(p.name)} ${stash}</span></a></td>
        <td>${esc(p.pos)}</td><td>${esc(p.age)}</td><td>${UI.fmtHt(p.ht)}</td><td class="${UI.ovrClass(p.ovr)}"><b>${esc(p.ovr)}</b></td><td class="${UI.ovrClass(p.pot)}"><b>${esc(p.pot)}</b></td></tr>`;
    }).join('');
    app.innerHTML = UI.header('DRAFT CLASSES', 'The real classes, with draft-day rating (OVR) and real career peak (POT) on the 2K scale. In a league, each class enters on its draft day.') +
      `<div class="tabs year-tabs">${years.map(y => `<a href="#/classes/${y}" class="${y === year ? 'on' : ''}">${y}</a>`).join('')}</div>
      <div class="tscroll"><table class="stats classes"><thead><tr><th>PICK</th><th class="l">PLAYER</th><th>POS</th><th>AGE</th><th>HT</th><th>OVR</th><th>POT</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };

  // ---------- Soundtrack ----------
  P.soundtrack = function (app) {
    const list = Array.isArray(window.SOUNDTRACK) ? window.SOUNDTRACK : [];
    const ids = UI.music && UI.music.hasIds();
    app.innerHTML = `${UI.header('SOUNDTRACK', 'The official NBA 2K13 soundtrack, in order. It plays in the bar at the bottom of every page.')}
      ${ids ? '' : '<div class="note">Video IDs are being added, so these songs cannot play yet.</div>'}
      <ol class="tracklist">${list.map((s, i) => `<li><span class="tl-n">${String(i + 1).padStart(2, '0')}</span><span class="tl-t"><b>${esc(s.title)}</b><small>${esc(s.artist)}</small></span>${s.yt ? `<button type="button" class="btn btn-small" data-play="${i}">PLAY</button>` : '<span class="tl-na">Coming soon</span>'}</li>`).join('')}</ol>`;
    app.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => UI.music.playTrack(Number(b.getAttribute('data-play')))));
  };
})();
