/* Player card page (overrides the one in ui-hub.js): NBA 2K13 style header, then tabs for
   ratings, career stats, awards and (during a season) the game log. Route: #/player/<id>[/<tab>].
   Career = real seasons before 2012-13 (window.CAREER_PRIOR) + seasons played in this save
   (player.careerStats) + the season in progress. Awards = real awards (window.AWARDS_PRIOR) +
   awards won in the save (player.awards, titles from state.history). Potential is never shown. */
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI) return;
  const P = UI.pages = UI.pages || {};
  const esc = UI.esc;

  // ---------- ratings ----------
  const GROUPS = [
    ['SHOOTING', [['close', 'Shot Close'], ['mid', 'Mid-Range'], ['three', 'Three-Point'], ['ft', 'Free Throw']]],
    ['INSIDE', [['layup', 'Layup'], ['dunk', 'Dunk'], ['post', 'Post Control']]],
    ['PLAYMAKING', [['handle', 'Ball Handling'], ['pass', 'Passing']]],
    ['DEFENSE', [['perD', 'On-Ball Defense'], ['intD', 'Interior Defense'], ['steal', 'Steal'], ['block', 'Block']]],
    ['REBOUNDING', [['oreb', 'Offensive Rebound'], ['dreb', 'Defensive Rebound']]],
    ['ATHLETICISM', [['speed', 'Speed'], ['vert', 'Vertical'], ['strength', 'Strength'], ['stamina', 'Stamina'], ['durability', 'Durability']]],
    ['IQ', [['oiq', 'Offensive IQ'], ['diq', 'Defensive IQ']]]
  ];
  const num = v => (typeof v === 'number' && !isNaN(v) ? v : Number(v) || 0);

  function ratingsHtml(p) {
    const a = p.attrs || {};
    const groups = GROUPS.map(([title, keys]) => {
      const vals = keys.map(k => num(a[k[0]]));
      const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
      return { title, keys, avg };
    });
    const strip = groups.map(g => `<div class="pk-gsum"><b class="${UI.ovrClass(g.avg)}">${g.avg || '-'}</b><small>${esc(g.title)}</small></div>`).join('');
    const cards = groups.map(g => `<div class="pk-group">
        <div class="pk-ghead"><span>${esc(g.title)}</span><b class="${UI.ovrClass(g.avg)}">${g.avg || '-'}</b></div>
        ${g.keys.map(([k, label]) => {
          const v = num(a[k]);
          return `<div class="pk-attr"><span class="pk-al">${esc(label)}</span><span class="pk-track"><i class="${UI.ovrClass(v)}" style="width:${Math.max(0, Math.min(100, v))}%"></i></span><span class="pk-av ${UI.ovrClass(v)}">${v || '-'}</span></div>`;
        }).join('')}
      </div>`).join('');
    return `<div class="pk-gstrip">${strip}</div><div class="pk-groups">${cards}</div>`;
  }

  // ---------- career ----------
  const priorOf = id => (window.CAREER_PRIOR && Array.isArray(window.CAREER_PRIOR[id]) ? window.CAREER_PRIOR[id] : []);
  const pct = v => (v == null || isNaN(v) ? null : Number(v) > 1 ? Number(v) / 100 : Number(v));

  function careerRows(p) {
    const rows = [];
    priorOf(p.id).forEach(c => {
      const team = c.team === 'TOT' && Array.isArray(c.teams) && c.teams.length ? c.teams.join('/') : c.team;
      rows.push({ year: c.year, team, s: { g: c.g, mpg: c.mpg, pts: c.pts, reb: c.reb, ast: c.ast, stl: c.stl, blk: c.blk, fgp: pct(c.fgp), tpp: pct(c.tpp), ftp: pct(c.ftp) } });
    });
    const seen = new Set(rows.map(r => r.year));
    (Array.isArray(p.careerStats) ? p.careerStats : []).forEach(c => {
      if (!c || seen.has(c.year)) return;
      const pg = UI.perGame(c);
      if (!pg) return;
      rows.push({ year: c.year, team: c.team, s: pg });
      seen.add(c.year);
    });
    const g = UI.state.game, s = UI.state.season;
    if (g && s && !seen.has(g.year) && (g.phase === 'regular' || g.phase === 'playoffs' || g.phase === 'preseason')) {
      const pg = UI.perGame(UI.seasonTotals()[p.id]);
      if (pg) rows.push({ year: g.year, team: p.team, s: pg, live: true });
    }
    return rows.sort((a, b) => a.year - b.year);
  }

  function careerHtml(p) {
    const rows = careerRows(p);
    if (!rows.length) return UI.empty('NO NBA GAMES YET', esc(p.name) + ' has not played an NBA game.');
    // Career line weighted by games (percentages skip seasons with no attempts).
    const avg = k => {
      let w = 0, v = 0;
      rows.forEach(r => { const x = r.s[k], n = Number(r.s.g) || 0; if (x == null || isNaN(x) || !n) return; v += Number(x) * n; w += n; });
      return w ? v / w : null;
    };
    const G = rows.reduce((t, r) => t + (Number(r.s.g) || 0), 0);
    const total = { g: G, mpg: avg('mpg'), pts: avg('pts'), reb: avg('reb'), ast: avg('ast'), stl: avg('stl'), blk: avg('blk'), fgp: avg('fgp'), tpp: avg('tpp'), ftp: avg('ftp') };
    const best = {};
    ['pts', 'reb', 'ast', 'stl', 'blk'].forEach(k => { best[k] = Math.max.apply(null, rows.map(r => Number(UI.fmt1(r.s[k])) || 0)); });
    const hi = (r, k) => (rows.length > 1 && best[k] > 0 && Number(UI.fmt1(r.s[k])) === best[k] ? ' class="pk-hi"' : '');
    const cells = (st, r) => `<td>${esc(st.g == null ? '-' : st.g)}</td><td>${UI.fmt1(st.mpg)}</td><td${r ? hi(r, 'pts') : ''}><b>${UI.fmt1(st.pts)}</b></td><td${r ? hi(r, 'reb') : ''}>${UI.fmt1(st.reb)}</td><td${r ? hi(r, 'ast') : ''}>${UI.fmt1(st.ast)}</td><td${r ? hi(r, 'stl') : ''}>${UI.fmt1(st.stl)}</td><td${r ? hi(r, 'blk') : ''}>${UI.fmt1(st.blk)}</td><td>${UI.fmtPct(st.fgp)}</td><td>${UI.fmtPct(st.tpp)}</td><td>${UI.fmtPct(st.ftp)}</td>`;
    const known = abbr => UI.teams().some(t => t.abbr === abbr);
    const teamCell = abbr => {
      const parts = String(abbr || '').split('/');
      return parts.length > 1 ? `<span class="pk-tot">${esc(parts.join(', '))}</span>` : `<span class="pk-tm">${known(abbr) ? UI.logo(abbr, 18) : ''}${esc(abbr || '')}</span>`;
    };
    return `<div class="tscroll"><table class="stats pk-career"><thead><tr><th class="l">SEASON</th><th class="l">TEAM</th><th>G</th><th>MPG</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead>
      <tbody>${rows.map(r => `<tr${r.live ? ' class="pk-live"' : ''}><td class="l">${esc(UI.seasonLabel(r.year))}${r.live ? ' <small>so far</small>' : ''}</td><td class="l">${teamCell(r.team)}</td>${cells(r.s, r)}</tr>`).join('')}</tbody>
      <tfoot><tr><td class="l">CAREER</td><td class="l">${rows.length} season${rows.length > 1 ? 's' : ''}</td>${cells(total)}</tr></tfoot></table></div>
      <p class="pk-note">Regular season, per game. Gold marks a career high.</p>`;
  }

  // Seasons played before the current one: real seasons plus completed seasons in the save.
  function yearsPro(p) {
    const cur = UI.year();
    const yrs = new Set();
    priorOf(p.id).forEach(c => { if (c.year < cur) yrs.add(c.year); });
    (Array.isArray(p.careerStats) ? p.careerStats : []).forEach(c => { if (c && c.year < cur && c.g) yrs.add(c.year); });
    return yrs.size;
  }

  // ---------- awards ----------
  const ORDER = ['Champion', 'MVP', 'Finals MVP', 'DPOY', 'ROY', '6MOY', 'MIP', 'Scoring Champion',
    'All-NBA 1st Team', 'All-NBA 2nd Team', 'All-NBA 3rd Team', 'All-Defensive 1st Team', 'All-Defensive 2nd Team',
    'All-Defensive 3rd Team', 'All-Rookie 1st Team', 'All-Rookie 2nd Team', 'All-Rookie 3rd Team', 'All-Star'];
  const FULL = {
    Champion: 'NBA Champion', MVP: 'Most Valuable Player', 'Finals MVP': 'Finals MVP', DPOY: 'Defensive Player of the Year',
    ROY: 'Rookie of the Year', '6MOY': 'Sixth Man of the Year', MIP: 'Most Improved Player', 'Scoring Champion': 'Scoring Champion'
  };
  // Header badges: short label per award family (All-NBA and All-Defensive teams count together).
  const BADGE = [['Champion', 'Champion'], ['MVP', 'MVP'], ['Finals MVP', 'Finals MVP'], ['DPOY', 'DPOY'], ['ROY', 'ROY'],
    ['6MOY', '6MOY'], ['MIP', 'MIP'], ['Scoring Champion', 'Scoring Champ'], [/^All-NBA/, 'All-NBA'], [/^All-Defensive/, 'All-Defense'], ['All-Star', 'All-Star']];
  const rankOf = a => { const i = ORDER.indexOf(a); return i < 0 ? ORDER.length : i; };
  const major = a => rankOf(a) <= 7;

  // Scoring champion of a season in the save: best points per game with 58 games or 1400 points.
  const scoringCache = new WeakMap();
  function scoringChamp(year) {
    const g = UI.state.game;
    if (!g || !g.players) return null;
    let c = scoringCache.get(g);
    if (!c || c.ver !== UI.state.ver) { c = { ver: UI.state.ver, by: {} }; scoringCache.set(g, c); }
    if (year in c.by) return c.by[year];
    let best = null;
    for (const id in g.players) {
      (g.players[id].careerStats || []).forEach(r => {
        if (!r || r.year !== year || !r.g) return;
        if (r.g < 58 && (r.pts || 0) < 1400) return;
        const ppg = (r.pts || 0) / r.g;
        if (!best || ppg > best.ppg) best = { id, ppg };
      });
    }
    c.by[year] = best ? best.id : null;
    return c.by[year];
  }

  function awardsOf(p) {
    const list = [];
    const seen = new Set();
    const add = (year, award) => {
      if (!award || award === 'COY') return;
      const k = year + '|' + award;
      if (seen.has(k)) return;
      seen.add(k);
      list.push({ year: year == null ? null : year, award: String(award) });
    };
    const prior = window.AWARDS_PRIOR && Array.isArray(window.AWARDS_PRIOR[p.id]) ? window.AWARDS_PRIOR[p.id] : [];
    prior.forEach(a => add(a.year, a.award));
    (Array.isArray(p.awards) ? p.awards : []).forEach(a => {
      if (a && typeof a === 'object') add(a.year, a.award || a.name);
      else if (typeof a === 'string') add(null, a);
    });
    // Seasons finished in this save: state.history.seasons[].awards (js/awards.js season() result),
    // the champion, the Finals MVP and the scoring title.
    const g = UI.state.game;
    const idOf = x => (x && typeof x === 'object' ? x.id : x);
    if (g && g.history && Array.isArray(g.history.seasons)) {
      const nth = ['1st', '2nd', '3rd'];
      g.history.seasons.forEach(hs => {
        if (!hs || !hs.year) return;
        const y = hs.year, aw = hs.awards || {};
        [['mvp', 'MVP'], ['dpoy', 'DPOY'], ['roy', 'ROY'], ['smoy', '6MOY'], ['mip', 'MIP'], ['finalsMvp', 'Finals MVP']].forEach(([k, name]) => {
          if (idOf(aw[k]) === p.id) add(y, name);
        });
        [['allNba', 'All-NBA'], ['allDefense', 'All-Defensive'], ['allRookie', 'All-Rookie']].forEach(([k, name]) => {
          (Array.isArray(aw[k]) ? aw[k] : []).forEach((team, i) => {
            if (Array.isArray(team) && team.some(x => idOf(x) === p.id)) add(y, name + ' ' + (nth[i] || (i + 1) + 'th') + ' Team');
          });
        });
        let fm = idOf(hs.finalsMvp);
        if (!fm && g.season && g.season.playoffs && y === g.year) fm = idOf(g.season.playoffs.finalsMvp);
        if (fm === p.id) add(y, 'Finals MVP');
        const row = (p.careerStats || []).find(r => r && r.year === y);
        if (!row) return;
        if (hs.champion && row.team === hs.champion) add(y, 'Champion');
        if (scoringChamp(y) === p.id) add(y, 'Scoring Champion');
      });
    }
    return list.sort((a, b) => (a.year || 0) - (b.year || 0) || rankOf(a.award) - rankOf(b.award));
  }

  function badgeCounts(list) {
    const out = [];
    BADGE.forEach(([m, label]) => {
      const n = list.filter(a => (m instanceof RegExp ? m.test(a.award) : a.award === m)).length;
      if (n) out.push({ n, label, top: label === 'Champion' || label === 'MVP' || label === 'Finals MVP' });
    });
    return out;
  }

  function awardsHtml(p, list) {
    if (!list.length) return UI.empty('NO AWARDS YET', esc(p.name) + ' has not won an NBA award yet.');
    const groups = {};
    list.forEach(a => { (groups[a.award] = groups[a.award] || []).push(a.year); });
    const keys = Object.keys(groups).sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b));
    const cards = keys.map(k => {
      const yrs = groups[k].filter(y => y != null).sort((a, b) => a - b);
      return `<div class="pk-trophy${major(k) ? ' major' : ''}">
        <div class="pk-tcount">${groups[k].length}<small>x</small></div>
        <div class="pk-tbody"><div class="pk-tname">${esc(FULL[k] || k)}</div>
        <div class="pk-tyears">${yrs.map(y => `<span>${esc(UI.seasonLabel(y))}</span>`).join('')}</div></div>
      </div>`;
    }).join('');
    const byYear = {};
    list.forEach(a => { if (a.year != null) (byYear[a.year] = byYear[a.year] || []).push(a.award); });
    const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
    const timeline = years.map(y => `<tr><td class="l">${esc(UI.seasonLabel(y))}</td><td class="l pk-chips">${byYear[y].map(a => `<span class="pk-chip${major(a) ? ' major' : ''}">${esc(a)}</span>`).join('')}</td></tr>`).join('');
    return `<div class="pk-trophies">${cards}</div>
      ${years.length ? `${UI.header('BY SEASON')}<div class="tscroll"><table class="stats pk-timeline"><thead><tr><th class="l">SEASON</th><th class="l">AWARDS</th></tr></thead><tbody>${timeline}</tbody></table></div>` : ''}`;
  }

  // ---------- game log ----------
  function gameLogHtml(p) {
    const log = UI.gameLog(p.id);
    if (!log.length) return UI.empty('NO GAMES THIS SEASON', esc(p.name) + ' has not played a game this season.');
    return `<div class="tscroll"><table class="stats"><thead><tr><th class="l">GAME</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG</th><th>3P</th><th>FT</th><th></th></tr></thead><tbody>${log.map(({ game: g, side, row: r }) => {
      const opp = side === 'home' ? g.away : g.home;
      const won = side === 'home' ? g.hs > g.as : g.as > g.hs;
      return `<tr><td class="l">${esc(UI.gameDay(g))} ${side === 'home' ? 'vs' : '@'} ${esc(opp)} <span class="${won ? 'win' : 'loss'}">${won ? 'W' : 'L'}</span>${g.playoff ? ' <small>PO</small>' : ''}</td><td>${Math.round(r.min || 0)}</td><td><b>${r.pts || 0}</b></td><td>${r.reb != null ? r.reb : (r.oreb || 0) + (r.dreb || 0)}</td><td>${r.ast || 0}</td><td>${r.stl || 0}</td><td>${r.blk || 0}</td><td>${r.fgm || 0}-${r.fga || 0}</td><td>${r.tpm || 0}-${r.tpa || 0}</td><td>${r.ftm || 0}-${r.fta || 0}</td><td><a href="#/game/${encodeURIComponent(g.id)}">BOX</a></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  // ---------- header pieces ----------
  function contractInfo(p) {
    const c = p.contract;
    const y = UI.year();
    if (p.retired) return { main: 'Retired', sub: '' };
    if (p.team === 'DRAFT') return { main: 'Draft prospect', sub: '' };
    if (c && Array.isArray(c.salaries) && c.salaries.length) {
      const left = c.salaries.filter(s => s.year >= y);
      const cur = c.salaries.find(s => s.year === y) || left[0] || c.salaries[0];
      const n = left.length || 1;
      return { main: UI.fmtMoney(cur.amount), sub: n + (n === 1 ? ' yr left' : ' yrs left') + ', thru ' + UI.fmtSeasonEnd(c.salaries[c.salaries.length - 1].year), note: UI.contractNote(p) };
    }
    if (p.team === 'FA' || !p.team) return { main: 'Unsigned', sub: 'Free agent' };
    if (p.salary) {
      const n = p.contractEnd ? Math.max(1, p.contractEnd - y + 1) : null;
      return { main: UI.fmtMoney(p.salary), sub: n ? n + (n === 1 ? ' yr left' : ' yrs left') + ', thru ' + UI.fmtSeasonEnd(p.contractEnd) : '' };
    }
    return { main: '-', sub: '' };
  }

  function moodInfo(p) {
    const g = UI.state.game;
    if (!g || !g.players || !window.MOOD || typeof window.MOOD.of !== 'function' || p.retired || !g.teams || !g.teams[p.team] || !g.players[p.id]) return null;
    let m = null;
    try { m = window.MOOD.of(g, p.id); } catch (e) { m = null; }
    let score = m && typeof m.score === 'number' ? m.score : (typeof p.mood === 'number' ? p.mood : null);
    if (score == null || isNaN(score)) return null;
    score = Math.round(score);
    const label = score >= 75 ? 'Happy' : score >= 58 ? 'Content' : score >= 42 ? 'Restless' : 'Unhappy';
    return { score, label, cls: score >= 58 ? 'good' : score >= 42 ? 'mid' : 'bad', reasons: (m && Array.isArray(m.reasons) && m.reasons) || [] };
  }

  const TABS = [['ratings', 'RATINGS'], ['career', 'CAREER STATS'], ['awards', 'AWARDS'], ['log', 'GAME LOG']];

  P.player = function (app, arg) {
    const parts = String(arg || '').split('/');
    const id = parts[0];
    const p = UI.player(id);
    if (!p) { app.innerHTML = UI.empty('PLAYER NOT FOUND', 'No player with the id ' + esc(id) + '.', '<a class="btn" href="#/teams">ALL ROSTERS</a>'); return; }
    const hasLog = !!UI.state.season && UI.gameLog(p.id).length > 0;
    const tabs = TABS.filter(t => t[0] !== 'log' || hasLog);
    let tab = tabs.some(t => t[0] === parts[1]) ? parts[1] : 'ratings';

    const onTeam = p.team && p.team !== 'FA' && p.team !== 'DRAFT' && !p.retired;
    const team = onTeam ? p.team : 'FA';
    const t = UI.team(team);
    const c1 = (t.colors && t.colors[0]) || '#333', c2 = (t.colors && t.colors[1]) || '#777';
    const nm = String(p.name || '').split(' ');
    const first = nm.length > 1 ? nm.slice(0, -1).join(' ') : '';
    const last = nm[nm.length - 1];
    const awards = awardsOf(p);
    const badges = badgeCounts(awards);
    const ctr = contractInfo(p);
    const mood = moodInfo(p);
    const injury = UI.injuryOf(p);
    const yp = yearsPro(p);
    const teamLabel = p.retired ? 'Retired' : p.team === 'DRAFT' ? 'Draft prospect' : onTeam ? UI.teamName(p.team) : 'Free Agent';
    const draft = p.draft && p.draft.year ? `${p.draft.year} draft${p.draft.round ? ', round ' + p.draft.round : ''}${p.draft.pick ? ', pick ' + p.draft.pick : ''}${p.draft.team ? ' (' + p.draft.team + ')' : ''}` : '';

    const status = [];
    if (injury) status.push(`<span class="pk-st bad"><i></i>${esc(injury.type || 'Injured')}${injury.games && injury.games < 900 ? ', out ' + esc(injury.games) + (injury.games === 1 ? ' game' : ' games') : ''}</span>`);
    else if (!p.retired && p.team !== 'DRAFT') status.push('<span class="pk-st good"><i></i>Healthy</span>');
    if (mood) status.push(`<span class="pk-st ${mood.cls}" title="${esc(mood.reasons.join('. '))}"><i></i>Mood: ${esc(mood.label)} (${mood.score})</span>`);
    if (p.gleague) status.push('<span class="pk-st mid"><i></i>G League assignment</span>');
    if (draft) status.push(`<span class="pk-st plain">${esc(draft)}</span>`);

    const cell = (k, v, sub, cls) => `<div class="pk-cell${cls ? ' ' + cls : ''}"><small>${k}</small><b>${v}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;

    app.innerHTML = `
      <section class="pk-card" style="--c1:${esc(c1)};--c2:${esc(c2)}">
        <div class="pk-photo">${UI.headshot(p, 'hs-big pk-hs')}</div>
        <div class="pk-main">
          ${onTeam
            ? `<a class="pk-team" href="#/team/${esc(p.team)}">${UI.logo(p.team, 30)}<span>${esc(teamLabel)}</span></a>`
            : `<span class="pk-team">${UI.logo('FA', 30)}<span>${esc(teamLabel)}</span></span>`}
          <h1 class="pk-name">${first ? `<span>${esc(first)}</span>` : ''}${esc(last)}</h1>
          <div class="pk-cells">
            ${cell('POS', esc(p.pos || '-'))}
            ${cell('AGE', esc(p.age == null ? '-' : p.age))}
            ${cell('HEIGHT', UI.fmtHt(p.ht))}
            ${cell('WEIGHT', p.wt ? esc(p.wt) + ' <span>lbs</span>' : '-')}
            ${cell('YEARS PRO', yp ? esc(yp) : 'Rookie')}
            ${cell('CONTRACT', esc(ctr.main), esc([ctr.sub, ctr.note].filter(Boolean).join(' | ')), 'wide')}
          </div>
          <div class="pk-status">${status.join('')}</div>
          ${badges.length ? `<div class="pk-badges">${badges.map(b => `<span class="pk-badge${b.top ? ' top' : ''}"><b>${b.n}x</b> ${esc(b.label)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="pk-ovr"><b>${esc(p.ovr == null ? '-' : p.ovr)}</b><small>OVERALL</small></div>
      </section>
      <nav class="pk-tabs" role="tablist">${tabs.map(([k, l]) => `<a href="#/player/${encodeURIComponent(p.id)}/${k}" data-tab="${k}" role="tab" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab}">${l}</a>`).join('')}</nav>
      <div class="pk-panel" id="pkPanel"></div>`;

    const panel = UI.$('#pkPanel', app);
    const draw = k => {
      if (k === 'career') panel.innerHTML = careerHtml(p);
      else if (k === 'awards') panel.innerHTML = awardsHtml(p, awards);
      else if (k === 'log') panel.innerHTML = gameLogHtml(p);
      else panel.innerHTML = ratingsHtml(p);
    };
    draw(tab);
    // Switch tabs in place (no re-render or scroll jump); the hash still records the tab.
    UI.$$('.pk-tabs a', app).forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      tab = a.getAttribute('data-tab');
      UI.$$('.pk-tabs a', app).forEach(x => { const on = x === a; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); });
      draw(tab);
      try { history.replaceState(null, '', a.getAttribute('href')); } catch (err) { /* sandboxed */ }
    }));
  };
})();
