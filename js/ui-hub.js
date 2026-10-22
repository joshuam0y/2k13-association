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
  P.home = function (app) {
    const latest = UI.saves.latest();
    const engineOk = UI.canPlay();
    let cont = '';
    if (latest) {
      const m = latest.meta;
      cont = `<a class="tile tile-continue" href="#/continue">
        <span class="tile-k">CONTINUE</span>
        <span class="tile-team">${UI.logo(m.userTeam, 54)}<span><span class="tile-t">${esc(UI.teamName(m.userTeam))}</span>
        <span class="tile-d">${esc(m.name)} | ${esc(m.record || '0-0')}${m.year ? ' | ' + esc(UI.seasonLabel(m.year)) : ''}${m.date ? ' | ' + esc(UI.dateLabel(m.date)) : ''}</span></span></span>
      </a>`;
    }
    const tile = (href, k, t, d) => `<a class="tile" href="${href}"><span class="tile-k">${k}</span><span class="tile-t">${t}</span><span class="tile-d">${d}</span></a>`;
    app.innerHTML = `
      <section class="hero">
        <div class="hero-kicker">THE 2012-13 SEASON</div>
        <h1 class="hero-title"><span class="ht-2k">2K13</span> <span class="ht-a">ASSOCIATION</span></h1>
        <p class="hero-copy">Take over one of 30 franchises with the real launch rosters, 2K13 ratings and contracts, then sim the season one day or one month at a time.</p>
      </section>
      <div class="menu-grid">
        <a class="tile tile-main${engineOk ? '' : ' disabled'}" href="${engineOk ? '#/new' : '#/home'}" ${engineOk ? '' : 'aria-disabled="true"'}>
          <span class="tile-k">${engineOk ? 'NEW LEAGUE' : 'SIM ENGINE NOT BUILT YET'}</span>
          <span class="tile-t big">PLAY THE ASSOCIATION</span>
          <span class="tile-d">Choose your team from all 30 franchises and take it from opening night to the Finals.</span>
        </a>
        ${cont}
        ${tile('#/teams', '30 TEAMS', 'ROSTERS', 'Every team, every player card')}
        ${tile('#/standings', 'EAST AND WEST', 'STANDINGS', 'Conference tables and the playoff race')}
        ${tile('#/leaders', 'PER GAME', 'LEAGUE LEADERS', 'Points, rebounds, assists, steals, blocks')}
        ${tile('#/playoffs', '16 TEAMS', 'PLAYOFFS', 'The bracket to the Larry O\'Brien Trophy')}
        ${tile('#/soundtrack', '24 SONGS', 'SOUNDTRACK', 'The official 2K13 tracklist')}
        ${tile('#/saves', '5 SLOTS', 'SAVES', 'Load, rename, export and import leagues')}
      </div>
      ${UI.extraPages().length ? `${UI.header('FRONT OFFICE')}<div class="menu-grid">${UI.extraPages().map(x => tile('#/' + x.route, x.kicker || 'FRONT OFFICE', esc(x.label.toUpperCase()), x.desc || '')).join('')}</div>` : ''}`;
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
        <span class="tt-meta"><b>${UI.teamOvr(t.abbr) || '-'}</b> OVR${star ? ' | ' + esc(star.name) : ''}</span>
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

  function statTable(rows) {
    return `<div class="tscroll"><table class="stats"><thead><tr><th class="l">SEASON</th><th>G</th><th>MPG</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead>
      <tbody>${rows.map(([label, s]) => `<tr><td class="l">${esc(label)}</td><td>${esc(s.g)}</td><td>${UI.fmt1(s.mpg)}</td><td><b>${UI.fmt1(s.pts)}</b></td><td>${UI.fmt1(s.reb)}</td><td>${UI.fmt1(s.ast)}</td><td>${UI.fmt1(s.stl)}</td><td>${UI.fmt1(s.blk)}</td><td>${UI.fmtPct(s.fgp)}</td><td>${UI.fmtPct(s.tpp)}</td><td>${UI.fmtPct(s.ftp)}</td></tr>`).join('')}</tbody></table></div>`;
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

    const real = p.stats && p.stats.g ? statTable([[p.team === 'DRAFT' || p.draftYear ? 'Last season (real)' : '2012-13 (real)', p.stats]]) : '<p class="muted">No NBA stats on record.</p>';
    const career = Array.isArray(p.careerStats) && p.careerStats.length
      ? UI.header('CAREER IN THIS LEAGUE') + statTable(p.careerStats.map(c => [UI.seasonLabel(c.year) + ' ' + (c.team || ''), UI.perGame(c) || { g: 0 }])) : '';
    const awards = Array.isArray(p.awards) && p.awards.length
      ? `${UI.header('AWARDS')}<ul class="awards">${p.awards.map(a => `<li><b>${esc(a.year ? UI.seasonLabel(a.year) : '')}</b> ${esc(a.award || a.name || a)}</li>`).join('')}</ul>` : '';
    let seasonHtml = '';
    if (UI.state.season) {
      const pg = UI.perGame(UI.seasonTotals()[p.id]);
      const po = UI.perGame(UI.seasonTotals(true)[p.id]);
      const log = UI.gameLog(p.id).slice(0, 10);
      const lbl = UI.seasonLabel(UI.state.season.year || UI.year());
      seasonHtml = `${UI.header('THIS SEASON', esc(UI.state.save ? UI.state.save.name : ''))}
        ${pg || po ? statTable([].concat(pg ? [[lbl + ' (sim)', pg]] : [], po ? [[lbl + ' playoffs', po]] : [])) : '<p class="muted">He has not played this season.</p>'}
        ${log.length ? `${UI.header('GAME LOG', 'Last 10 games')}<div class="tscroll"><table class="stats"><thead><tr><th class="l">GAME</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG</th><th>3P</th><th>FT</th><th></th></tr></thead><tbody>${log.map(({ game: g, side, row: r }) => {
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
      ${seasonHtml}
      ${career}
      ${UI.header('REAL STATS')}
      ${real}
      ${awards}`;
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
