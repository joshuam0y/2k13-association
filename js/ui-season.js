// Season pages: the Association hub with sim controls, box score, standings, stats, playoffs, saves.
(function () {
  'use strict';
  const UI = window.UI;
  const P = UI.pages = UI.pages || {};
  const esc = UI.esc;

  const needSeason = app => {
    if (!UI.canPlay()) { app.innerHTML = UI.notBuilt('engine'); return true; }
    if (!UI.state.game) {
      app.innerHTML = UI.empty('NO LEAGUE LOADED', 'Start a new Association or load one of your saves.',
        '<div class="row-btns"><a class="btn btn-gold" href="#/new">PLAY THE ASSOCIATION</a><a class="btn" href="#/saves">LOAD</a></div>');
      return true;
    }
    return false;
  };
  // ---------- Association hub ----------
  // Built like the 2K13 Association hub: a team header, one big PLAY tile with the sim controls,
  // and eight menu tiles. Everything else is one click further in.
  function playOffseason(g) {
    const phases = UI.OFFSEASON();
    const idx = phases.indexOf(g.phase);
    const nextName = idx >= 0 && idx < phases.length - 1 ? UI.PHASES[phases[idx + 1]] : 'Opening Night';
    const last = g.history && Array.isArray(g.history.seasons) ? g.history.seasons[g.history.seasons.length - 1] : null;
    const champ = last && UI.abbrOf(last.champion);
    const link = {
      draftLottery: ['draft', 'DRAFT ORDER'], draft: ['draft', 'DRAFT ROOM'],
      resign: ['fa', 'RE-SIGN PLAYERS'], freeAgency: ['fa', 'FREE AGENCY'], training: ['manage', 'ROTATION']
    }[g.phase];
    return `<div class="mt-l">${esc((UI.PHASES[g.phase] || g.phase).toUpperCase())}</div>
      <ol class="os-dots" aria-label="Offseason steps">${phases.map((p, i) => `<li class="${i < idx ? 'done' : i === idx ? 'on' : ''}" title="${esc(UI.PHASES[p] || p)}"><span>${esc(UI.PHASES[p] || p)}</span></li>`).join('')}</ol>
      ${champ ? `<div class="play-note">${UI.logo(champ, 28)} <span>${esc(last.year)} CHAMPIONS: ${esc(UI.teamName(champ).toUpperCase())}</span></div>` : ''}
      <div class="play-btns">
        <button type="button" class="btn btn-gold btn-big" id="nextPhase">NEXT: ${esc(nextName.toUpperCase())}</button>
        ${link && UI.pages[link[0]] ? `<a class="btn btn-big" href="#/${link[0]}">${link[1]}</a>` : ''}
      </div>`;
  }

  function playSeason(g, next, user) {
    const sp = g.season.phase;
    const reg = sp === 'regular';
    const btn = (how, label, cls, dis) => `<button type="button" class="btn sim-btn ${cls || ''}" data-how="${esc(JSON.stringify(how))}"${dis ? ' disabled' : ''}>${label}</button>`;
    let match;
    if (next) {
      const home = next.home === user;
      const opp = home ? next.away : next.home;
      match = `<a class="play-next" href="#/team/${esc(opp)}">${UI.logo(opp, 56)}<span><small>${next.playoff ? 'PLAYOFFS GAME ' + esc(next.gameNum || '') : 'NEXT GAME'} | ${esc(UI.gameDay(next).toUpperCase())}</small><b>${home ? 'VS' : '@'} ${esc(UI.teamName(opp).toUpperCase())}</b><small>${esc(UI.record(opp))}</small></span></a>`;
    } else {
      match = `<div class="play-next"><span><small>${sp === 'playoffs' ? 'PLAYOFFS' : 'REGULAR SEASON'}</small><b>${sp === 'playoffs' ? 'NO GAME SCHEDULED' : 'COMPLETE'}</b></span></div>`;
    }
    return `<div class="mt-l">PLAY</div>
      ${match}
      <div class="sim-btns">
        ${btn({ days: 1 }, 'SIM DAY', 'btn-gold')}${btn({ days: 7 }, 'SIM WEEK')}${btn({ days: 30 }, 'SIM MONTH')}
        ${next && UI.pages.live ? `<a class="btn sim-btn lv-watch" href="#/live/next">WATCH LIVE</a>` : ''}
      </div>
      <details class="sim-more"><summary>SIM TO...</summary><div class="sim-more-list">
        ${btn('tradeDeadline', 'TRADE DEADLINE', '', !reg)}${btn('allStar', 'ALL-STAR BREAK', '', !reg)}${btn('endRegular', 'END OF REGULAR SEASON', '', !reg)}${btn('endPlayoffs', 'END OF PLAYOFFS')}
      </div></details>`;
  }

  P.season = function (app) {
    if (needSeason(app)) return;
    const g = UI.state.game;
    const user = g.userTeam;
    const t = UI.team(user);
    const s = g.season;
    const mine = UI.games().filter(x => x.home === user || x.away === user);
    const next = mine.find(x => !x.played);
    const last = mine.filter(x => x.played).slice(-1)[0];
    const off = UI.inOffseason();
    const row = UI.standings()[user] || { w: 0, l: 0, streakText: '-' };
    const confRow = UI.confTable(t.conf).find(r => r.abbr === user) || {};
    const date = UI.currentDate();
    const pending = UI.pendingEvents();
    const phaseName = (off ? UI.PHASES[g.phase] : UI.PHASES[s.phase] || s.phase) || '';

    let lastHtml = '';
    if (last) {
      const home = last.home === user;
      const won = home ? last.hs > last.as : last.as > last.hs;
      const opp = home ? last.away : last.home;
      lastHtml = `<a class="hh-last" href="#/game/${encodeURIComponent(last.id)}"><small>LAST GAME</small><b class="${won ? 'win' : 'loss'}">${won ? 'W' : 'L'} ${home ? last.hs : last.as}-${home ? last.as : last.hs}</b><span>${home ? 'vs' : '@'} ${esc(opp)}</span></a>`;
    }

    // The tile that matters most in this phase gets the gold edge.
    const hot = { draftLottery: 'draft', draft: 'draft', resign: 'fa', freeAgency: 'fa', training: 'manage' }[g.phase] || '';
    const tile = (key, href, icon, label) => UI.tile(href, icon, label, hot === key ? { cls: 'mt-hot', sub: 'NOW' } : null);
    const news = Array.isArray(g.news) ? g.news.filter(n => n && n.headline).slice(0, 3) : [];

    app.innerHTML = `
      <section class="hub-head" style="--c1:${esc(t.colors[0])};--c2:${esc(t.colors[1] || t.colors[0])}">
        ${UI.logo(user, 96)}
        <div class="hh-info">
          <div class="hh-k">${esc(UI.seasonLabel(g.year))} | ${esc(phaseName.toUpperCase())}${date && !off ? ' | ' + esc(UI.dateLabel(date).toUpperCase()) : ''}</div>
          <h1 class="hh-name">${esc(UI.teamName(user))}</h1>
          <div class="hh-stats">
            <div><b>${row.w}-${row.l}</b><small>RECORD</small></div>
            ${confRow.rank ? `<div><b>#${confRow.rank}</b><small>${esc(t.conf.toUpperCase())}</small></div>` : ''}
            <div><b>${esc(row.streakText)}</b><small>STREAK</small></div>
            <div><b>${UI.teamOvr(user) || '-'}</b><small>TEAM OVR</small></div>
          </div>
        </div>
        ${lastHtml}
      </section>
      ${pending ? `<div class="pending"><span><b>${pending}</b> decision${pending > 1 ? 's' : ''} waiting</span><button type="button" class="btn btn-gold btn-small" id="openEvents">DECIDE NOW</button></div>` : ''}
      <div class="hub-grid">
        <div class="mtile mt-play">${off ? playOffseason(g) : playSeason(g, next, user)}</div>
        ${tile('roster', '#/team/' + encodeURIComponent(user), 'roster', 'ROSTER')}
        ${tile('manage', '#/manage', 'rotation', 'ROTATION')}
        ${tile('trade', '#/trade', 'trade', 'TRADES')}
        ${tile('fa', '#/fa', 'fa', 'FREE AGENCY')}
        ${tile('standings', '#/standings', 'standings', 'STANDINGS')}
        ${tile('stats', '#/stats', 'stats', 'STATS')}
        ${tile('draft', '#/draft', 'draft', 'DRAFT')}
        ${tile('league', '#/league', 'league', 'LEAGUE')}
      </div>
      ${news.length ? `<a class="ticker" href="#/${UI.pages.news ? 'news' : 'league'}"><b>NEWS</b><span>${news.map(n => esc(n.headline)).join('<i>|</i>')}</span></a>` : ''}`;
    app.querySelectorAll('.sim-btn[data-how]').forEach(b => b.addEventListener('click', () => UI.sim(JSON.parse(b.getAttribute('data-how')))));
    const np = UI.$('#nextPhase');
    if (np) np.addEventListener('click', () => UI.sim('nextPhase'));
    const oe = UI.$('#openEvents');
    if (oe) oe.addEventListener('click', () => UI.showEvents());
    const more = UI.$('.sim-more', app);
    if (more) document.addEventListener('click', function close(e) {
      if (!document.body.contains(more)) { document.removeEventListener('click', close); return; }
      if (!more.contains(e.target)) more.open = false;
    });
  };

  // ---------- Box score ----------
  function boxTable(abbr, box) {
    const rows = (box || []).filter(Boolean);
    const sum = k => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const reb = r => (r.reb != null ? r.reb : (Number(r.oreb) || 0) + (Number(r.dreb) || 0));
    const pct = (m, a) => (a ? ' <small>' + (m / a * 100).toFixed(1) + '</small>' : '');
    const body = rows.map((r, i) => {
      const p = UI.player(r.id);
      const name = r.name || (p ? p.name : r.id);
      const dnp = !(r.min > 0);
      const benchStart = i > 0 && rows[i - 1].starter && !r.starter;
      return `<tr class="${dnp ? 'dnp' : ''}${benchStart ? ' bench-start' : ''}"><td class="l"><a href="#/player/${esc(r.id)}">${esc(name)}</a>${p ? ` <small class="muted">${esc(p.pos)}</small>` : ''}</td>
        ${dnp ? '<td colspan="13" class="l muted">Did not play</td>' : `<td>${Math.round(r.min)}</td><td><b>${r.pts || 0}</b></td><td>${r.fgm || 0}-${r.fga || 0}</td><td>${r.tpm || 0}-${r.tpa || 0}</td><td>${r.ftm || 0}-${r.fta || 0}</td><td>${r.oreb || 0}</td><td>${r.dreb || 0}</td><td>${reb(r)}</td><td>${r.ast || 0}</td><td>${r.stl || 0}</td><td>${r.blk || 0}</td><td>${r.tov || 0}</td><td>${r.pf || 0}</td>`}</tr>`;
    }).join('');
    const fgm = sum('fgm'), fga = sum('fga'), tpm = sum('tpm'), tpa = sum('tpa'), ftm = sum('ftm'), fta = sum('fta');
    return `<div class="box-team">${UI.header(UI.teamName(abbr).toUpperCase())}
      <div class="tscroll"><table class="stats box"><thead><tr><th class="l">PLAYER</th><th>MIN</th><th>PTS</th><th>FG</th><th>3P</th><th>FT</th><th>OREB</th><th>DREB</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>PF</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td class="l">TOTALS</td><td>${Math.round(sum('min'))}</td><td><b>${sum('pts')}</b></td><td>${fgm}-${fga}${pct(fgm, fga)}</td><td>${tpm}-${tpa}${pct(tpm, tpa)}</td><td>${ftm}-${fta}${pct(ftm, fta)}</td><td>${sum('oreb')}</td><td>${sum('dreb')}</td><td>${rows.reduce((s, r) => s + reb(r), 0)}</td><td>${sum('ast')}</td><td>${sum('stl')}</td><td>${sum('blk')}</td><td>${sum('tov')}</td><td>${sum('pf')}</td></tr></tfoot>
      </table></div></div>`;
  }

  P.game = function (app, id) {
    if (needSeason(app)) return;
    const g = UI.game(id || '');
    if (!g) { app.innerHTML = UI.empty('GAME NOT FOUND', 'There is no game with the id ' + esc(id) + ' in this season.', '<a class="btn" href="#/season">SEASON</a>'); return; }
    const head = score => `<section class="scoreboard">
        <a class="sb-team" href="#/team/${esc(g.away)}">${UI.logo(g.away, 72)}<span class="sb-name">${esc(UI.teamName(g.away))}</span><small>${esc(UI.record(g.away))}</small></a>
        <div class="sb-mid">${score}</div>
        <a class="sb-team" href="#/team/${esc(g.home)}">${UI.logo(g.home, 72)}<span class="sb-name">${esc(UI.teamName(g.home))}</span><small>${esc(UI.record(g.home))}</small></a>
      </section>`;
    const dayLbl = esc(g.date ? UI.dateLabel(g.date).toUpperCase() : 'DAY ' + (g.day + 1)) + (g.playoff ? ' | PLAYOFFS GAME ' + esc(g.gameNum || '') : '');
    const r = g.result;
    if (!g.played || !r) {
      app.innerHTML = head(`<div class="sb-k">${dayLbl}</div>${g.played ? `<div class="sb-score"><span class="${g.as > g.hs ? 'win' : ''}">${g.as}</span><i>-</i><span class="${g.hs > g.as ? 'win' : ''}">${g.hs}</span></div><div class="sb-k">BOX SCORE NOT KEPT</div>` : '<div class="sb-at">@</div><div class="sb-k">NOT PLAYED YET</div>'}`) +
        '<div class="row-btns center"><a class="btn" href="#/season">BACK TO SEASON</a></div>';
      return;
    }
    const q = Array.isArray(r.quarters) ? r.quarters : [];
    const qLabel = i => (i < 4 ? 'Q' + (i + 1) : 'OT' + (q.length > 5 ? i - 3 : ''));
    const qtable = q.length ? `<div class="tscroll"><table class="stats qtable"><thead><tr><th class="l">TEAM</th>${q.map((_, i) => `<th>${qLabel(i)}</th>`).join('')}<th>T</th></tr></thead><tbody>
        <tr><td class="l">${UI.logo(g.away, 20)} ${esc(g.away)}</td>${q.map(x => `<td>${esc(x[1])}</td>`).join('')}<td><b>${g.as}</b></td></tr>
        <tr><td class="l">${UI.logo(g.home, 20)} ${esc(g.home)}</td>${q.map(x => `<td>${esc(x[0])}</td>`).join('')}<td><b>${g.hs}</b></td></tr>
      </tbody></table></div>` : '';
    const pbp = Array.isArray(r.pbp) ? r.pbp : [];
    const LIMIT = 80;
    const line = x => `<li>${esc(typeof x === 'string' ? x : x && (x.text || JSON.stringify(x)))}</li>`;
    const pbpHtml = pbp.length ? `${UI.header('PLAY-BY-PLAY', pbp.length + ' plays')}
      <ol class="pbp" id="pbp">${pbp.slice(0, LIMIT).map(line).join('')}</ol>
      ${pbp.length > LIMIT ? `<button type="button" class="btn" id="pbpMore">SHOW ALL ${pbp.length} PLAYS</button>` : ''}`
      : `${UI.header('PLAY-BY-PLAY')}<p class="muted">Play-by-play is kept for the most recent games only.</p>`;
    const awayWon = g.as > g.hs;
    const ot = q.length > 4 ? (q.length > 5 ? '/' + (q.length - 4) + 'OT' : '/OT') : '';
    app.innerHTML = head(`<div class="sb-k">FINAL${ot}</div>
        <div class="sb-score"><span class="${awayWon ? 'win' : ''}">${g.as}</span><i>-</i><span class="${awayWon ? '' : 'win'}">${g.hs}</span></div><div class="sb-k">${dayLbl}</div>`) +
      qtable + boxTable(g.away, r.away && r.away.box) + boxTable(g.home, r.home && r.home.box) + pbpHtml;
    const more = UI.$('#pbpMore');
    if (more) more.addEventListener('click', () => { UI.$('#pbp').innerHTML = pbp.map(line).join(''); more.remove(); });
  };

  // ---------- Standings ----------
  P.standings = function (app) {
    const user = UI.userTeam();
    const confList = [];
    UI.teams().forEach(t => { if (t.conf && !confList.includes(t.conf)) confList.push(t.conf); });
    confList.sort((a, b) => (a === 'East' ? -1 : b === 'East' ? 1 : 0));
    const tables = confList.map(c => {
      const rows = UI.confTable(c);
      return `<section class="stand-wrap">${UI.header(c.toUpperCase())}
        <div class="tscroll"><table class="stand"><thead><tr><th>#</th><th class="l">TEAM</th><th>W</th><th>L</th><th>PCT</th><th>GB</th><th class="hide-sm">HOME</th><th class="hide-sm">AWAY</th><th class="hide-sm">L10</th><th>STRK</th></tr></thead>
        <tbody>${rows.map(r => `<tr class="${r.abbr === user ? 'mine' : ''}${r.rank === 8 ? ' cut' : ''}">
          <td>${r.rank}</td><td class="l"><a href="#/team/${esc(r.abbr)}">${UI.logo(r.abbr, 28)}<span class="full">${esc(UI.teamName(r.abbr))}</span><span class="short">${esc(r.abbr)}</span></a></td>
          <td><b>${r.w}</b></td><td>${r.l}</td><td>${UI.fmtWinPct(r.w, r.l)}</td><td>${r.gb}</td>
          <td class="hide-sm">${r.hw}-${r.hl}</td><td class="hide-sm">${r.aw}-${r.al}</td><td class="hide-sm">${r.l10}</td><td>${esc(r.streakText)}</td></tr>`).join('')}</tbody></table></div></section>`;
    }).join('');
    const sub = UI.state.game ? esc(UI.seasonLabel(UI.year())) + '. The top 8 in each conference make the playoffs.' : 'No league loaded, so every team is 0-0.';
    app.innerHTML = UI.header('STANDINGS', sub) + `<div class="two-col tight">${tables}</div>`;
  };

  // ---------- Stats: league leaders and the full player table ----------
  // Only stats played in this save. Nothing from outside the league is shown here.
  const CATS = [['pts', 'POINTS'], ['reb', 'REBOUNDS'], ['ast', 'ASSISTS'], ['stl', 'STEALS'], ['blk', 'BLOCKS']];
  const MIN_G = 20;
  const COLS = [['g', 'G'], ['mpg', 'MIN'], ['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK'], ['fgp', 'FG%'], ['tpp', '3P%'], ['ftp', 'FT%']];
  const statView = { sort: 'pts', dir: -1, team: '', shown: 60 };

  P.stats = function (app, arg) {
    const parts = String(arg || '').split('/');
    const view = parts[0] === 'players' ? 'players' : 'leaders';
    const po = parts.includes('playoffs');
    const hasSeason = !!(UI.state.game && UI.state.season);
    if (!hasSeason) {
      app.innerHTML = UI.header('STATS') + UI.empty('NO SEASON YET', 'Stats come from the games played in your league. Start or load an Association first.',
        `<div class="row-btns">${UI.canPlay() ? '<a class="btn btn-gold" href="#/new">PLAY THE ASSOCIATION</a>' : ''}<a class="btn" href="#/saves">LOAD</a></div>`);
      return;
    }
    const tot = UI.seasonTotals(po);
    const hasPo = Object.keys(UI.seasonTotals(true)).length > 0;
    const pool = Object.keys(tot).map(id => ({ p: UI.player(id), s: UI.perGame(tot[id]) })).filter(x => x.p && x.s && x.s.g > 0);
    const base = view === 'players' ? '#/stats/players' : '#/stats';
    const tabs = `<div class="tabs">
        <a href="#/stats${po ? '/playoffs' : ''}" class="${view === 'leaders' ? 'on' : ''}">LEADERS</a>
        <a href="#/stats/players${po ? '/playoffs' : ''}" class="${view === 'players' ? 'on' : ''}">ALL PLAYERS</a>
        ${hasPo ? `<span class="tabs-gap"></span><a href="${base}" class="${po ? '' : 'on'}">SEASON</a><a href="${base}/playoffs" class="${po ? 'on' : ''}">PLAYOFFS</a>` : ''}
      </div>`;
    const title = UI.seasonLabel(UI.year()) + (po ? ' PLAYOFFS' : ' SEASON');
    if (!pool.length) {
      app.innerHTML = UI.header('STATS', esc(title)) + tabs + UI.empty('NO GAMES PLAYED YET', 'Sim a few days and the numbers will show up here.', '<div class="row-btns"><a class="btn btn-gold" href="#/season">BACK TO THE HUB</a></div>');
      return;
    }
    if (view === 'leaders') {
      const maxG = pool.reduce((m, x) => Math.max(m, x.s.g), 0);
      const minG = po ? 1 : Math.min(MIN_G, Math.max(1, Math.ceil(maxG * 0.6)));
      const q = pool.filter(x => x.s.g >= minG);
      const body = `<div class="leader-grid">${CATS.map(([k, label]) => {
        const top = q.filter(x => x.s[k] != null).sort((a, b) => b.s[k] - a.s[k]).slice(0, 10);
        if (!top.length) return '';
        const lead = top[0];
        return `<section class="leader-card">
          <div class="lc-head"><span>${label}</span><small>PER GAME</small></div>
          <a class="lc-top" href="#/player/${esc(lead.p.id)}" style="--c1:${esc(UI.teamColor(lead.p.team))}">${UI.headshot(lead.p)}<span class="lc-top-name"><b>${esc(lead.p.name)}</b><small>${esc(lead.p.team)} | ${esc(lead.p.pos)}</small></span><span class="lc-top-v">${UI.fmt1(lead.s[k])}</span></a>
          <ol class="lc-list">${top.slice(1).map((x, i) => `<li><span class="lc-n">${i + 2}</span><a href="#/player/${esc(x.p.id)}">${esc(x.p.name)}</a><span class="lc-t">${esc(x.p.team)}</span><b>${UI.fmt1(x.s[k])}</b></li>`).join('')}</ol>
        </section>`;
      }).join('')}</div>`;
      app.innerHTML = UI.header('STATS', esc(title) + '. Per game, at least ' + minG + ' game' + (minG > 1 ? 's' : '') + '.') + tabs + body;
      return;
    }
    // full table
    const user = UI.userTeam();
    const draw = () => {
      const k = statView.sort;
      let list = pool.filter(x => !statView.team || x.p.team === statView.team);
      list.sort((a, b) => {
        if (k === 'name') return statView.dir * -1 * String(a.p.name).localeCompare(String(b.p.name));
        const av = a.s[k] == null ? -1 : a.s[k], bv = b.s[k] == null ? -1 : b.s[k];
        return (bv - av) * (statView.dir === -1 ? 1 : -1) || b.s.pts - a.s.pts;
      });
      const shown = list.slice(0, statView.shown);
      const fmt = (key, v) => (key === 'g' ? v : /p$/.test(key) ? UI.fmtPct(v) : UI.fmt1(v));
      const teams = UI.teams().slice().sort((a, b) => a.city.localeCompare(b.city));
      app.innerHTML = UI.header('STATS', esc(title) + '. Per game. Tap a column to sort.') + tabs +
        `<div class="stat-filters"><label class="field"><span>TEAM</span><select id="stTeam">
          <option value="">All teams</option>${user ? `<option value="${esc(user)}" ${statView.team === user ? 'selected' : ''}>My team (${esc(user)})</option>` : ''}
          ${teams.map(t => `<option value="${esc(t.abbr)}" ${statView.team === t.abbr && t.abbr !== user ? 'selected' : ''}>${esc(t.city + ' ' + t.name)}</option>`).join('')}
        </select></label><span class="muted">${list.length} players</span></div>
        <div class="tscroll"><table class="stats stat-table"><thead><tr><th>#</th><th class="l sortable${k === 'name' ? ' on' : ''}" data-sort="name">PLAYER</th><th class="l hide-sm">TEAM</th>
          ${COLS.map(([c, l]) => `<th class="sortable${k === c ? ' on' : ''}" data-sort="${c}">${l}</th>`).join('')}</tr></thead>
        <tbody>${shown.map((x, i) => `<tr class="${x.p.team === user ? 'mine' : ''}"><td class="muted">${i + 1}</td>
          <td class="l"><a href="#/player/${esc(x.p.id)}">${esc(x.p.name)}</a> <small class="muted">${esc(x.p.pos)}</small></td><td class="l hide-sm">${UI.logo(x.p.team, 22)} ${esc(x.p.team)}</td>
          ${COLS.map(([c]) => `<td class="${k === c ? 'on' : ''}">${c === 'pts' ? '<b>' + fmt(c, x.s[c]) + '</b>' : fmt(c, x.s[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        ${list.length > shown.length ? `<div class="row-btns center"><button type="button" class="btn" id="stMore">SHOW MORE</button></div>` : ''}`;
      UI.$('#stTeam').addEventListener('change', e => { statView.team = e.target.value; statView.shown = 60; draw(); });
      app.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
        const c = th.getAttribute('data-sort');
        if (statView.sort === c) statView.dir = -statView.dir; else { statView.sort = c; statView.dir = -1; }
        draw();
      }));
      const more = UI.$('#stMore');
      if (more) more.addEventListener('click', () => { statView.shown += 100; const y = window.scrollY; draw(); window.scrollTo(0, y); });
    };
    draw();
  };
  // The old leaders route opens the same page.
  P.leaders = function (app, arg) { P.stats(app, arg === 'playoffs' ? 'leaders/playoffs' : ''); };

  // ---------- Playoffs ----------
  const ROUND_NAMES = ['FIRST ROUND', 'CONFERENCE SEMIFINALS', 'CONFERENCE FINALS', 'NBA FINALS'];
  function normSeries(s) {
    return {
      a: UI.abbrOf(s.hi || s.high || s.a), b: UI.abbrOf(s.lo || s.low || s.b),
      aSeed: s.hiSeed != null ? s.hiSeed : s.highSeed, bSeed: s.loSeed != null ? s.loSeed : s.lowSeed,
      aw: s.hw != null ? s.hw : s.wins ? s.wins[0] : null, bw: s.lw != null ? s.lw : s.wins ? s.wins[1] : null,
      winner: UI.abbrOf(s.winner), conf: s.conf || null
    };
  }
  UI.normBracket = function (b) {
    if (!b || !Array.isArray(b.rounds)) return null;
    const rounds = b.rounds.map((r, i) => {
      const list = Array.isArray(r) ? r : (r.series || []);
      const order = x => (x.conf === 'West' ? 0 : x.conf === 'East' ? 1 : 2);
      return { name: (r && r.name) || ROUND_NAMES[i] || 'ROUND ' + (i + 1), series: list.map(normSeries).sort((x, y) => order(x) - order(y)) };
    });
    // Placeholders for rounds not drawn yet.
    for (let i = rounds.length; i < 4; i++) rounds.push({ name: ROUND_NAMES[i], series: Array.from({ length: 8 >> i }, () => ({ a: null, b: null })) });
    return { rounds, champion: UI.abbrOf(b.champion), finalsMvp: b.finalsMvp || null };
  };

  function seriesHtml(s) {
    const line = (abbr, seed, w, isWin) => abbr
      ? `<a class="sr-team${isWin ? ' win' : ''}${s.winner && !isWin ? ' out' : ''}" href="#/team/${esc(abbr)}">${seed != null ? `<span class="sr-seed">${esc(seed)}</span>` : ''}${UI.logo(abbr, 26)}<span class="sr-abbr">${esc(abbr)}</span><b>${w != null ? esc(w) : ''}</b></a>`
      : '<span class="sr-team tbd"><span class="sr-abbr">TBD</span></span>';
    const user = UI.userTeam();
    return `<div class="series${user && (s.a === user || s.b === user) ? ' mine' : ''}">${line(s.a, s.aSeed, s.aw, s.winner && s.winner === s.a)}${line(s.b, s.bSeed, s.bw, s.winner && s.winner === s.b)}</div>`;
  }
  const bracketHtml = br => `<div class="bracket">${br.rounds.map(r => `<div class="b-round"><div class="b-round-name">${esc(r.name)}</div>${r.series.map(seriesHtml).join('')}</div>`).join('')}</div>`;

  // Seeds 1 to 8 per conference: from standings when a league is loaded, else by team overall.
  function projected() {
    const r1 = [];
    ['West', 'East'].filter(c => UI.teams().some(t => t.conf === c)).forEach(c => {
      let seeds = UI.state.season ? UI.confTable(c).map(r => r.abbr)
        : UI.teams().filter(t => t.conf === c).map(t => t.abbr).sort((a, b) => UI.teamOvr(b) - UI.teamOvr(a));
      seeds = seeds.slice(0, 8);
      [[1, 8], [4, 5], [3, 6], [2, 7]].forEach(([x, y]) => r1.push({ hi: seeds[x - 1] || null, lo: seeds[y - 1] || null, hiSeed: x, loSeed: y, conf: c }));
    });
    return UI.normBracket({ rounds: [r1], champion: null });
  }

  P.playoffs = function (app) {
    const s = UI.state.season;
    const br = s && s.playoffs ? UI.normBracket(s.playoffs) : null;
    const yr = s ? s.year : UI.year();
    if (br) {
      const champ = br.champion;
      const mvp = br.finalsMvp && UI.player(br.finalsMvp);
      const canSim = UI.canPlay() && !UI.inOffseason();
      app.innerHTML = UI.header(yr + ' PLAYOFFS', 'Best of seven, 16 teams.') +
        (champ ? `<section class="champ" style="--c1:${esc(UI.teamColor(champ))}">${UI.logo(champ, 96)}<div><div class="ch-k">${esc(yr)} NBA CHAMPIONS</div><div class="ch-t">${esc(UI.teamName(champ))}</div>${mvp ? `<div class="ch-mvp">FINALS MVP: <a href="#/player/${esc(mvp.id)}">${esc(mvp.name)}</a></div>` : ''}${champ === UI.userTeam() ? '<div class="ch-you">YOUR TEAM WON THE TITLE</div>' : ''}</div></section>` : '') +
        (canSim && !champ ? `<div class="row-btns"><button type="button" class="btn btn-gold" id="simPo">SIM TO PLAYOFFS END</button><button type="button" class="btn" id="simDay">SIM 1 DAY</button></div>` : '') +
        bracketHtml(br);
    } else {
      const canSim = UI.canPlay() && UI.state.game && !UI.inOffseason();
      const sub = !UI.state.game ? 'Projected by team overall. Start the Association to play it out.' : 'If the season ended today.';
      app.innerHTML = UI.header(yr + ' PLAYOFFS', sub) +
        (canSim ? `<div class="row-btns"><button type="button" class="btn btn-gold" id="simPo">SIM TO PLAYOFFS END</button></div>` : '') +
        bracketHtml(projected());
    }
    const b = UI.$('#simPo');
    if (b) b.addEventListener('click', () => UI.sim('endPlayoffs'));
    const d = UI.$('#simDay');
    if (d) d.addEventListener('click', () => UI.sim({ days: 1 }));
  };

  // ---------- Saves ----------
  P.saves = function (app) {
    const list = UI.saves.list();
    const active = UI.state.slot;
    const card = ({ slot, meta }) => {
      if (!meta) {
        return `<div class="slot empty-slot"><div class="slot-n">SLOT ${slot}</div><div class="slot-body"><div class="slot-name muted">Empty</div></div>
          <div class="slot-actions">${UI.canPlay() ? `<a class="btn btn-small" href="#/new">NEW LEAGUE</a>` : ''}<button type="button" class="btn btn-small" data-act="import" data-slot="${slot}">IMPORT</button></div></div>`;
      }
      if (meta.broken) {
        return `<div class="slot"><div class="slot-n">SLOT ${slot}</div><div class="slot-body"><div class="slot-name">Unreadable save</div></div>
          <div class="slot-actions"><button type="button" class="btn btn-small btn-danger" data-act="delete" data-slot="${slot}">DELETE</button></div></div>`;
      }
      const when = meta.updated ? new Date(meta.updated).toLocaleString() : '';
      const where = [meta.year ? UI.seasonLabel(meta.year) : '', UI.PHASES[meta.phase === 'regular' ? meta.seasonPhase || 'regular' : meta.phase] || '', meta.date ? UI.dateLabel(meta.date) : ''].filter(Boolean).join(' | ');
      return `<div class="slot${slot === active ? ' active' : ''}" data-slot="${slot}">
        <div class="slot-n">SLOT ${slot}${slot === active ? ' <span class="badge badge-gold">LOADED</span>' : ''}</div>
        <div class="slot-body">${UI.logo(meta.userTeam, 48)}<div>
          <div class="slot-name" data-name>${esc(meta.name)}</div>
          <div class="slot-meta">${esc(UI.teamName(meta.userTeam))} | ${esc(meta.record || '0-0')}${where ? ' | ' + esc(where) : ''}</div>
          <div class="slot-meta muted">${esc(when)}</div>
        </div></div>
        <div class="slot-actions">
          ${slot === active ? `<a class="btn btn-small btn-gold" href="#/season">PLAY</a>` : `<button type="button" class="btn btn-small btn-gold" data-act="load" data-slot="${slot}" ${UI.canPlay() ? '' : 'disabled'}>LOAD</button>`}
          <details class="slot-more"><summary class="btn btn-small">MORE</summary><div class="slot-more-list">
            <button type="button" class="btn btn-small" data-act="rename" data-slot="${slot}">RENAME</button>
            <button type="button" class="btn btn-small" data-act="export" data-slot="${slot}">EXPORT</button>
            <button type="button" class="btn btn-small" data-act="import" data-slot="${slot}">IMPORT</button>
            <button type="button" class="btn btn-small btn-danger" data-act="delete" data-slot="${slot}">DELETE</button>
          </div></details>
        </div>
      </div>`;
    };
    app.innerHTML = UI.header('LOAD', 'Your leagues save in this browser after every sim. Use Export to keep a copy.') +
      `<div class="slots">${list.map(card).join('')}</div><input type="file" id="importFile" accept=".json,application/json" hidden>`;

    const fileInput = UI.$('#importFile');
    let importSlot = null;
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!f || importSlot == null) return;
      try {
        await UI.saves.importFile(f, importSlot);
        UI.toast('Imported into slot ' + importSlot + '.');
        UI.updateChrome();
        UI.route();
      } catch (e) { UI.toast('Import failed: ' + e.message, 'error'); }
    });

    app.querySelector('.slots').addEventListener('click', async e => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const slot = Number(b.getAttribute('data-slot'));
      const act = b.getAttribute('data-act');
      const info = list.find(x => x.slot === slot);
      try {
        if (act === 'load') {
          b.disabled = true;
          b.textContent = 'LOADING...';
          await UI.saves.load(slot);
          UI.updateChrome();
          location.hash = '#/season';
        } else if (act === 'export') {
          await UI.saves.exportFile(slot);
        } else if (act === 'import') {
          if (info && info.meta && b.getAttribute('data-confirm') !== '1') {
            b.setAttribute('data-confirm', '1');
            b.textContent = 'OVERWRITE?';
            return;
          }
          importSlot = slot;
          fileInput.click();
        } else if (act === 'delete') {
          if (b.getAttribute('data-confirm') !== '1') {
            b.setAttribute('data-confirm', '1');
            b.textContent = 'CONFIRM DELETE';
            return;
          }
          await UI.saves.remove(slot);
          UI.updateChrome();
          UI.toast('Slot ' + slot + ' deleted.');
          UI.route();
        } else if (act === 'rename') {
          const nameEl = b.closest('.slot').querySelector('[data-name]');
          nameEl.innerHTML = `<form class="rename"><input maxlength="40" value="${esc(info.meta.name)}" aria-label="Save name"><button class="btn btn-small btn-gold" type="submit">OK</button></form>`;
          const form = nameEl.querySelector('form');
          const input = form.querySelector('input');
          input.focus();
          input.select();
          form.addEventListener('submit', async ev => {
            ev.preventDefault();
            await UI.saves.rename(slot, input.value);
            UI.updateChrome();
            UI.route();
          });
        }
      } catch (err) {
        console.warn(err);
        UI.toast(err.message || String(err), 'error');
        if (act === 'load') UI.route();
      }
    });
  };
})();
