/* End of season awards show (#/awardshow[/year]), like NBA 2K's: one award at a time, the winner on a big
   card with his trophy, season line and vote totals, then the finalists. Rookie of the Year first, the
   All-NBA teams after the individual awards, the MVP last with a bigger reveal.
   The show reads the same result the league records: during the playoffs AWARDS.season(state) (locked
   when the regular season ends), after the season state.history.seasons[].awards. It opens by itself
   once per season when the regular season ends (state.awardsShown[year], see UI.awardShowDue). */
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI) return;
  const esc = UI.esc;
  const A = () => window.AWARDS || null;
  const game = () => UI.state.game;

  // ---------- era rules and real trophy names ----------
  // year = the season's ending year (2013 = 2012-13). The individual trophies got their legends' names in 2022-23.
  function trophy(key, year) {
    const modern = year >= 2023;
    switch (key) {
      case 'mvp': return modern ? 'Michael Jordan Trophy' : 'Maurice Podoloff Trophy';
      case 'roy': return modern ? 'Wilt Chamberlain Trophy' : 'Eddie Gottlieb Trophy';
      case 'dpoy': return modern ? 'Hakeem Olajuwon Trophy' : 'Defensive Player of the Year Award';
      case 'smoy': return modern ? 'John Havlicek Trophy' : 'Sixth Man of the Year Award';
      case 'mip': return modern ? 'George Mikan Trophy' : 'Most Improved Player Award';
      case 'coy': return 'Red Auerbach Trophy';
      case 'clutch': return 'Jerry West Trophy';
      default: return '';
    }
  }
  const TITLES = { roy: 'Rookie of the Year', mip: 'Most Improved Player', smoy: 'Sixth Man of the Year', dpoy: 'Defensive Player of the Year',
    coy: 'Coach of the Year', clutch: 'Clutch Player of the Year', mvp: 'Most Valuable Player' };
  const TEAM_TITLES = { allRookie: 'All-Rookie', allDefense: 'All-Defensive', allNba: 'All-NBA' };
  const NTH = ['First', 'Second', 'Third'];

  // ---------- where the awards come from ----------
  function historyOf(g, year) {
    const list = (g && g.history && Array.isArray(g.history.seasons)) ? g.history.seasons : [];
    return list.find(h => h && h.year === year && h.awards) || null;
  }
  // The regular season of the current year is over and its ballots are in.
  function liveReady(g) {
    return !!(g && g.season && g.season.phase && g.season.phase !== 'regular' && !historyOf(g, g.year) && A() &&
      g.season.playerStats && Object.keys(g.season.playerStats).length);
  }
  // -> { year, res, live, hist } or null
  function source(g, year) {
    if (!g) return null;
    const h = historyOf(g, year);
    if (h) {
      // seasons saved before voting existed get vote totals once, stored with the season
      const b = h.awards.ballots;
      if (A() && A().votes && (!b || !b.teamVotes || (Array.isArray(b.mvp) && b.mvp[0] && b.mvp[0].pts == null))) {
        try { A().votes(h.awards); UI.bump(); if (UI.saves && UI.saves.write) UI.saves.write(); } catch (e) { console.warn('award votes', e); }
      }
      return { year, res: h.awards, live: false, hist: h };
    }
    if (year === g.year && liveReady(g)) {
      let res = null;
      try { res = A().season(g); } catch (e) { console.warn('awards', e); }
      return res ? { year, res, live: true, hist: null } : null;
    }
    return null;
  }
  function defaultYear(g) {
    if (!g) return null;
    if (liveReady(g) || historyOf(g, g.year)) return g.year;
    const list = (g.history && g.history.seasons) || [];
    for (let i = list.length - 1; i >= 0; i--) if (list[i] && list[i].awards) return list[i].year;
    return null;
  }
  // Show it by itself when the regular season has just ended (once a season).
  UI.awardShowDue = function () {
    const g = game();
    if (!g || !g.season || (g.awardsShown && g.awardsShown[g.year])) return false;
    if (g.season.phase === 'regular') return false;
    return liveReady(g) || !!historyOf(g, g.year);
  };
  UI.awardShowAvailable = () => defaultYear(game()) != null;

  // ---------- players, teams, stat lines ----------
  const posLabel = p => {
    try { if (window.POSITIONS && window.POSITIONS.label) return window.POSITIONS.label(p) || p.pos || ''; } catch (e) { /* plain pos */ }
    return p.pos || '';
  };
  function seasonRow(g, src, id) {
    const p = g.players[id];
    if (src.live) return (g.season.playerStats || {})[id] || null;
    const rows = ((p && p.careerStats) || []).filter(r => r && r.year === src.year);
    if (!rows.length) return null;
    if (rows.length === 1) return rows[0];
    const t = { team: rows[rows.length - 1].team };
    rows.forEach(r => Object.keys(r).forEach(k => { if (typeof r[k] === 'number' && k !== 'year') t[k] = (t[k] || 0) + r[k]; }));
    return t;
  }
  function lineOf(g, src, id) {
    const row = seasonRow(g, src, id);
    const pg = row && A() && A().perGame ? A().perGame(row) : null;
    const p = g.players[id] || {};
    return { row, pg, team: src.live ? p.team : (row && row.team) || p.team };
  }
  const f1 = v => (v == null || isNaN(v) ? '-' : (Math.round(v * 10) / 10).toFixed(1));
  const fpct = v => (v == null || isNaN(v) ? '-' : (v * 100).toFixed(1));
  const num = n => Number(n || 0).toLocaleString('en-US');
  function statTiles(key, ln) {
    const pg = ln.pg;
    if (!pg) return '';
    let cols;
    if (key === 'dpoy') cols = [['PPG', f1(pg.ppg)], ['RPG', f1(pg.rpg)], ['SPG', f1(pg.spg)], ['BPG', f1(pg.bpg)], ['GP', pg.g]];
    else if (key === 'smoy') cols = [['PPG', f1(pg.ppg)], ['RPG', f1(pg.rpg)], ['APG', f1(pg.apg)], ['MPG', f1(pg.mpg)], ['GP', pg.g]];
    else cols = [['PPG', f1(pg.ppg)], ['RPG', f1(pg.rpg)], ['APG', f1(pg.apg)], ['FG%', fpct(pg.fgp)], ['GP', pg.g]];
    return `<div class="aw-stats">${cols.map(([k, v]) => `<div><b>${esc(v)}</b><small>${k}</small></div>`).join('')}</div>`;
  }
  const lineText = (pg, key) => {
    if (!pg) return '';
    if (key === 'allDefense') return `${f1(pg.rpg)} REB, ${f1(pg.spg)} STL, ${f1(pg.bpg)} BLK`;
    return `${f1(pg.ppg)} PTS, ${f1(pg.rpg)} REB, ${f1(pg.apg)} AST`;
  };
  // last season's scoring for the Most Improved card
  function lastPpg(g, id, year) {
    const p = g.players[id];
    if (!p) return null;
    const rows = (p.careerStats || []).filter(r => r && r.year === year - 1 && r.g);
    if (rows.length) {
      let gp = 0, pts = 0;
      rows.forEach(r => { gp += r.g; pts += r.min != null && r.min / r.g > 4 ? r.pts || 0 : (r.pts || 0) * r.g; });
      return gp ? pts / gp : null;
    }
    if (year === 2013 && p.stats && p.stats.g) return p.stats.pts || null;
    return null;
  }
  function standingsOf(g, src) { return src.live ? (g.season.standings || {}) : (src.hist.standings || {}); }
  function recordOf(g, src, abbr) {
    const r = standingsOf(g, src)[abbr];
    return r ? (r.w || 0) + '-' + (r.l || 0) : '';
  }
  function coachName(g, id) { const c = id && g.coaches && g.coaches[id]; return c ? c.name : null; }
  const mine = (g, abbr) => !!abbr && abbr === g.userTeam;
  const teamFull = abbr => (UI.teamName ? UI.teamName(abbr) : abbr);

  // ---------- slides ----------
  function slidesFor(g, src) {
    const res = src.res, b = res.ballots || {}, rules = b.rules || {};
    const year = src.year;
    const out = [];
    const single = key => {
      const win = res[key];
      if (win == null) return;
      let fin = Array.isArray(b[key]) ? b[key].slice() : [];
      if (key === 'coy') {
        const w = typeof win === 'object' ? win : { team: win };
        if (!w.team) return;
        const i = fin.findIndex(x => x && x.team === w.team);
        if (i > 0) fin.unshift(fin.splice(i, 1)[0]);
        if (!fin.length || fin[0].team !== w.team) fin.unshift({ team: w.team, coach: w.coach });
      } else {
        const i = fin.findIndex(x => x && x.id === win);
        if (i > 0) fin.unshift(fin.splice(i, 1)[0]);
        if (!fin.length || fin[0].id !== win) fin.unshift({ id: win });
      }
      fin = fin.filter((x, i) => i === 0 || x.pts == null || x.pts > 0).slice(0, 5);
      out.push({ kind: key === 'mvp' ? 'mvp' : 'single', key, title: TITLES[key], trophy: trophy(key, year), fin });
    };
    ['roy', 'mip', 'smoy', 'dpoy', 'coy'].forEach(single);
    if (year >= 2023 || res.clutch) single('clutch');
    [['allRookie', 2], ['allDefense', 2], ['allNba', 3]].forEach(([key, n]) => {
      const teams = Array.isArray(res[key]) ? res[key] : [];
      const tv = b.teamVotes && b.teamVotes[key];
      for (let i = 0; i < Math.min(n, teams.length); i++) {
        if (!teams[i] || !teams[i].length) continue;
        const votes = tv && tv.teams && tv.teams[i] ? tv.teams[i] : [];
        const members = teams[i].map(id => Object.assign({ id }, votes.find(v => v.id === id) || {}));
        // All-NBA and All-Defensive are positionless from 2023-24; the rookie teams always were
        const positional = key !== 'allRookie' && !(rules.positionless != null ? rules.positionless : year >= 2024);
        out.push({ kind: 'team', key, tier: i, positional, title: TEAM_TITLES[key] + ' ' + NTH[i] + ' Team', members, voters: tv && tv.voters });
      }
    });
    single('mvp');
    return out;
  }

  const GROUP = pos => { const p = String(pos || '').toUpperCase().split(/[-\/ ,]/)[0]; return p === 'PG' || p === 'SG' || p === 'G' ? 'G' : p === 'C' ? 'C' : 'F'; };
  const GROUP_NAME = { G: 'GUARD', F: 'FORWARD', C: 'CENTER' };

  function votesLine(x) {
    if (x.pts == null) return '';
    const voters = x.voters;
    const unanimous = voters && x.first === voters;
    return `<div class="aw-votes"><span><b>${num(x.pts)}</b> POINTS</span><span><b>${num(x.first)}</b>${voters ? ' OF ' + num(voters) : ''} FIRST PLACE VOTES</span>${unanimous ? '<span class="aw-unan">UNANIMOUS</span>' : ''}</div>`;
  }
  function finalistsHtml(g, src, s) {
    if (s.fin.length < 2) return '';
    const n = s.fin.length;
    const rows = s.fin.map((x, i) => {
      const fp = x.pts != null ? `<b>${num(x.pts)}</b><small>${num(x.first)} 1ST</small>` : '';
      if (s.key === 'coy') {
        const nm = coachName(g, x.coach) || teamFull(x.team);
        return `<li class="${mine(g, x.team) ? 'aw-mine' : ''}" style="--i:${n - i}"><span class="aw-rk">${i + 1}</span><span class="aw-fl">${UI.logo(x.team, 30)}</span>
          <span class="aw-fn"><b>${esc(nm)}</b><small>${esc(teamFull(x.team))} | ${esc(recordOf(g, src, x.team))}</small></span><span class="aw-fp">${fp}</span></li>`;
      }
      const p = g.players[x.id];
      if (!p) return '';
      const ln = lineOf(g, src, x.id);
      return `<li class="${mine(g, ln.team) ? 'aw-mine' : ''}" style="--i:${n - i}"><span class="aw-rk">${i + 1}</span><span class="aw-fh">${UI.headshot(p)}</span>
        <span class="aw-fn"><a href="#/player/${esc(p.id)}">${esc(p.name)}</a><small>${esc(ln.team)} | ${esc(lineText(ln.pg))}</small></span><span class="aw-fp">${fp}</span></li>`;
    }).join('');
    return `<div class="aw-fin"><div class="aw-fin-h"><span>${s.kind === 'mvp' ? 'THE VOTE' : 'FINALISTS'}</span><span>POINTS</span></div><ol>${rows}</ol></div>`;
  }
  function winnerCard(g, src, s) {
    const w = s.fin[0];
    const year = src.year;
    if (s.key === 'coy') {
      const team = w.team, nm = coachName(g, w.coach) || 'Head coach';
      const st = standingsOf(g, src)[team] || {};
      return `<div class="aw-win${mine(g, team) ? ' aw-mine' : ''}" style="--tc:${esc(UI.teamColor(team))}">
        <div class="aw-photo aw-photo-logo">${UI.logo(team, 140)}</div>
        <div class="aw-info">${mine(g, team) ? '<span class="aw-yours">YOUR TEAM</span>' : ''}
          <div class="aw-name">${esc(nm)}</div>
          <div class="aw-team">${UI.logo(team, 26)} <span>${esc(teamFull(team))} <small>Head coach</small></span></div>
          <div class="aw-stats"><div><b>${esc(st.w || 0)}</b><small>W</small></div><div><b>${esc(st.l || 0)}</b><small>L</small></div><div><b>${esc(UI.fmtWinPct(st.w || 0, st.l || 0))}</b><small>PCT</small></div></div>
          ${votesLine(w)}</div></div>`;
    }
    const p = g.players[w.id];
    if (!p) return '';
    const ln = lineOf(g, src, w.id);
    let extra = '';
    if (s.key === 'mip') { const lp = lastPpg(g, w.id, year); if (lp != null && ln.pg) extra = `<div class="aw-note">Up from ${f1(lp)} points a game in ${esc(UI.seasonLabel(year - 1))}.</div>`; }
    if (s.key === 'smoy' && ln.pg) extra = `<div class="aw-note">${esc(ln.pg.gs)} starts in ${esc(ln.pg.g)} games.</div>`;
    return `<div class="aw-win${mine(g, ln.team) ? ' aw-mine' : ''}" style="--tc:${esc(UI.teamColor(ln.team))}">
      <div class="aw-photo">${UI.headshot(p)}<span class="aw-plogo">${UI.logo(ln.team, 54)}</span></div>
      <div class="aw-info">${mine(g, ln.team) ? '<span class="aw-yours">YOUR TEAM</span>' : ''}
        <div class="aw-name"><a href="#/player/${esc(p.id)}">${esc(p.name)}</a></div>
        <div class="aw-team">${UI.logo(ln.team, 26)} <span>${esc(teamFull(ln.team))} <small>${esc(posLabel(p))} | ${esc(recordOf(g, src, ln.team))}</small></span></div>
        ${statTiles(s.key, ln)}${extra}${votesLine(w)}</div></div>`;
  }
  function ruleChips(src, s) {
    const rules = (src.res.ballots && src.res.ballots.rules) || {};
    const chips = [];
    if (src.year >= 2024 && ['mvp', 'dpoy', 'smoy', 'clutch', 'allNba', 'allDefense'].includes(s.key)) chips.push('65-GAME MINIMUM' + (rules.minGames && rules.teamGames && rules.teamGames < 82 ? ' (' + rules.minGames + ' OF ' + rules.teamGames + ')' : ''));
    if (s.kind === 'team' && s.key !== 'allRookie') chips.push(s.positional ? '2 GUARDS, 2 FORWARDS, 1 CENTER' : 'POSITIONLESS');
    if (s.key === 'clutch' && src.year === 2023) chips.push('FIRST YEAR OF THE AWARD');
    return chips.length ? `<div class="aw-chips">${chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : '';
  }
  function teamSlide(g, src, s) {
    const members = s.members.slice();
    if (s.positional) {
      const ord = { G: 0, F: 1, C: 2 };
      members.sort((a, b) => ord[GROUP((g.players[a.id] || {}).pos)] - ord[GROUP((g.players[b.id] || {}).pos)] || (b.pts || 0) - (a.pts || 0));
    } else members.sort((a, b) => (b.pts || 0) - (a.pts || 0));
    const cards = members.map((m, i) => {
      const p = g.players[m.id];
      if (!p) return '';
      const ln = lineOf(g, src, m.id);
      const slot = s.positional ? GROUP_NAME[GROUP(p.pos)] : posLabel(p);
      return `<div class="aw-tm${mine(g, ln.team) ? ' aw-mine' : ''}" style="--tc:${esc(UI.teamColor(ln.team))};--i:${i}">
        <div class="aw-tm-pos">${esc(slot)}</div>
        <div class="aw-tm-ph">${UI.headshot(p)}<span class="aw-plogo">${UI.logo(ln.team, 34)}</span></div>
        <div class="aw-tm-n"><a href="#/player/${esc(p.id)}">${esc(p.name)}</a><small>${esc(teamFull(ln.team))}${s.positional ? ' | ' + esc(posLabel(p)) : ''}</small></div>
        <div class="aw-tm-l">${esc(lineText(ln.pg, s.key))}</div>
        ${m.pts != null ? `<div class="aw-tm-v"><b>${num(m.pts)}</b> PTS<small>${num(m.first)} FIRST TEAM VOTES</small></div>` : ''}
        ${mine(g, ln.team) ? '<span class="aw-yours">YOUR TEAM</span>' : ''}</div>`;
    }).join('');
    return `<div class="aw-team-grid">${cards}</div>`;
  }

  // ---------- the page ----------
  const view = { year: null, idx: 0 };
  function render(app, g, src, slides) {
    const i = Math.max(0, Math.min(view.idx, slides.length - 1));
    view.idx = i;
    const s = slides[i];
    const last = i === slides.length - 1;
    const season = UI.seasonLabel(src.year);
    const body = s.kind === 'team' ? teamSlide(g, src, s) : winnerCard(g, src, s) + finalistsHtml(g, src, s);
    const kicker = s.kind === 'mvp' ? 'And the ' + season + ' Most Valuable Player is' : season + ' NBA Awards';
    const years = ((g.history && g.history.seasons) || []).filter(h => h && h.awards).map(h => h.year);
    if (liveReady(g) && !years.includes(g.year)) years.push(g.year);
    app.innerHTML = `<div class="aw-show aw-k-${esc(s.key)}${s.kind === 'mvp' ? ' aw-is-mvp' : ''}">
      <div class="aw-top"><span class="aw-brand">NBA AWARDS <b>${esc(season)}</b></span>
        <span class="aw-count">${s.kind === 'mvp' ? 'THE FINAL AWARD' : 'AWARD ' + (i + 1) + ' OF ' + slides.length}</span></div>
      <div class="aw-bar" aria-hidden="true"><i style="width:${Math.round((i + 1) / slides.length * 100)}%"></i></div>
      <section class="aw-card" aria-live="polite">
        <div class="aw-head"><div class="aw-kick">${esc(kicker)}</div>
          <h2 class="aw-title">${esc(s.title.toUpperCase())}</h2>
          ${s.trophy ? `<div class="aw-trophy"><span class="aw-cup" aria-hidden="true"></span>${esc(s.trophy)}</div>` : ''}
          ${s.kind === 'team' && s.voters ? `<div class="aw-trophy">Voted by ${esc(s.voters)} ${s.key !== 'allNba' && src.year <= 2014 ? 'head coaches' : 'media members'}</div>` : ''}
          ${ruleChips(src, s)}</div>
        <div class="aw-body">${body}</div>
      </section>
      <div class="aw-actions">
        ${last ? '' : '<button type="button" class="btn btn-gold aw-next" data-aw="next">NEXT AWARD</button>'}
        ${last ? '' : '<button type="button" class="btn" data-aw="mvp">SKIP TO MVP</button>'}
        <button type="button" class="btn${last ? ' btn-gold' : ''}" data-aw="finish">FINISH</button>
        ${i > 0 ? '<button type="button" class="btn aw-back" data-aw="back">BACK</button>' : ''}
      </div>
      ${years.length > 1 ? `<div class="aw-years"><span>PAST SHOWS</span>${years.sort((a, b) => b - a).map(y => `<a href="#/awardshow/${y}" class="${y === src.year ? 'on' : ''}">${esc(UI.seasonLabel(y))}</a>`).join('')}</div>` : ''}
    </div>`;
    app.querySelector('.aw-actions').addEventListener('click', e => {
      const b = e.target.closest('[data-aw]');
      if (!b) return;
      const a = b.getAttribute('data-aw');
      if (a === 'finish') { location.hash = '#/playoffs'; return; }
      view.idx = a === 'next' ? i + 1 : a === 'back' ? i - 1 : slides.length - 1;
      render(app, g, src, slides);
      const top = app.querySelector('.aw-show');
      if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start' });
      const nb = app.querySelector('.aw-next') || app.querySelector('[data-aw="finish"]');
      if (nb) nb.focus({ preventScroll: true });
    });
  }

  const P = UI.pages = UI.pages || {};
  P.awardshow = function (app, arg) {
    const g = game();
    if (!g) {
      app.innerHTML = UI.header('AWARDS SHOW') + UI.empty('NO LEAGUE LOADED', 'Start or load an Association to watch the season awards.', '<div class="row-btns center"><a class="btn btn-gold" href="#/home">HOME</a></div>');
      return;
    }
    const want = /^\d{4}$/.test(String(arg || '')) ? Number(arg) : defaultYear(g);
    const src = want != null ? source(g, want) : null;
    if (!src) {
      app.innerHTML = UI.header('AWARDS SHOW') + UI.empty('THE SHOW AIRS AFTER THE REGULAR SEASON',
        'Rookie of the Year, the All-NBA teams, the MVP and the rest are handed out once the last regular season game is played.',
        '<div class="row-btns center"><a class="btn" href="#/awards">AWARD RACE</a><a class="btn" href="#/season">SEASON</a></div>');
      return;
    }
    const slides = slidesFor(g, src);
    if (!slides.length) { app.innerHTML = UI.header('AWARDS SHOW') + UI.empty('NO AWARDS', 'No awards were handed out this season.'); return; }
    if (view.year !== src.year) { view.year = src.year; view.idx = 0; }
    // once a season: seeing it (by itself or from the menus) counts
    if (src.year === g.year && !(g.awardsShown && g.awardsShown[g.year])) {
      g.awardsShown = g.awardsShown || {};
      g.awardsShown[g.year] = true;
      view.idx = 0;
      if (UI.saveNow) UI.saveNow();
    }
    render(app, g, src, slides);
  };
  P.awardshow.navLabel = 'Awards Show';
  P.awardshow.navDesc = 'The end of season awards, one at a time.';

  // arrow keys step through the show
  document.addEventListener('keydown', e => {
    if (!/^#\/awardshow/.test(location.hash) || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
    const m = document.getElementById('eventModal');
    if (m && !m.hidden) return;
    const sel = e.key === 'ArrowRight' ? '.aw-actions [data-aw="next"]' : e.key === 'ArrowLeft' ? '.aw-actions [data-aw="back"]' : null;
    const b = sel && document.querySelector(sel);
    if (b) { e.preventDefault(); b.click(); }
  });

  // ---------- ways back in: the League menu and the awards page ----------
  function wrap(name, add) {
    const orig = P[name];
    if (typeof orig !== 'function' || orig.__aw) return;
    const fn = function (app, arg) {
      orig.call(this, app, arg);
      try { if (UI.awardShowAvailable()) add(app, arg); } catch (e) { console.warn('awards show link', e); }
    };
    Object.keys(orig).forEach(k => { fn[k] = orig[k]; });
    fn.__aw = true;
    P[name] = fn;
  }
  const showLink = () => `<a class="aw-link" href="#/awardshow"><span class="aw-cup" aria-hidden="true"></span><span><b>AWARDS SHOW</b><small>Watch the ${esc(UI.seasonLabel(defaultYear(game())))} awards, one at a time</small></span></a>`;
  wrap('league', app => {
    const grid = app.querySelector('.tile-grid');
    if (grid && UI.tile) grid.insertAdjacentHTML('beforeend', UI.tile('#/awardshow', 'awards', 'AWARDS SHOW'));
  });
  wrap('awards', (app, arg) => {
    if (arg === 'allstars') return;
    const head = app.querySelector('.sec-head');
    if (head) head.insertAdjacentHTML('afterend', showLink());
  });
})();
