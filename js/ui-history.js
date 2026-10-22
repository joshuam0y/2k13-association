// League pages: news feed and transactions (#/news), the award race and past winners (#/awards),
// and league history (#/history): past seasons, records, Hall of Fame, retired jerseys, pre-2012 history.
// Uses the franchise helpers from js/ui-team.js (UI.fr).
(function () {
  'use strict';
  const UI = window.UI = window.UI || {};
  const P = UI.pages = UI.pages || {};
  const esc = UI.esc;
  const fr = UI.fr;
  if (!fr) { console.warn('[ui-history] js/ui-team.js must load first'); return; }

  const num = v => (v == null || v === '' || isNaN(v) ? null : Number(v));
  const f1 = v => (v == null || isNaN(v) ? '-' : Number(v).toFixed(1));
  const playerOf = (s, id) => (s && s.players && s.players[id]) || null;

  // ---------- references (a player, team or coach id) ----------
  function coachById(s, id) {
    if (s && s.coaches && s.coaches[id]) return s.coaches[id];
    const D = window.COACHES;
    return D ? [].concat(D.start || [], D.pool || []).find(c => c.id === id) || null : null;
  }
  function ref(s, x) {
    if (x == null) return null;
    if (typeof x === 'string' || typeof x === 'number') {
      const id = String(x);
      const p = playerOf(s, id);
      if (p) return { kind: 'player', id, p, name: p.name };
      if (s && s.teams && s.teams[id]) return { kind: 'team', abbr: id, name: fr.teamName(s, id) };
      const c = coachById(s, id);
      if (c) return { kind: 'coach', id, name: c.name, team: c.team };
      return { kind: 'text', name: id };
    }
    if (Array.isArray(x) || typeof x !== 'object') return null;
    const pid = x.id || x.playerId || x.pid || (typeof x.player === 'string' ? x.player : null);
    let r = null;
    if (pid) r = ref(s, pid);
    else if (x.coach || x.coachId) r = ref(s, x.coach || x.coachId);
    else if (x.team || x.abbr) r = ref(s, x.team || x.abbr);
    if (!r || (r.kind === 'text' && x.name)) r = { kind: 'text', name: x.name || (r && r.name) || '?' };
    if (r.kind === 'coach' && (x.team || x.abbr)) r.team = x.team || x.abbr;
    if (r.kind === 'player' && (x.team || x.abbr)) r.team = x.team || x.abbr;
    const sc = x.score != null ? x.score : x.votes != null ? x.votes : x.points != null ? x.points : x.share;
    if (sc != null) r.score = sc;
    if (typeof x.line === 'string') r.line = x.line;
    else if (typeof x.stats === 'string') r.line = x.stats;
    return r;
  }
  function refName(r) {
    if (!r) return '-';
    if (r.kind === 'player') return fr.plink(r.p);
    if (r.kind === 'team') return `<a href="#/team/${encodeURIComponent(r.abbr)}">${esc(r.name)}</a>`;
    return esc(r.name);
  }
  function refTeam(r) {
    if (!r) return null;
    if (r.kind === 'team') return r.abbr;
    if (r.team) return r.team;
    if (r.kind === 'player') return r.p.team;
    return null;
  }

  // a player's per game line for a season, from the live season or his career stats
  function lineFor(s, id, year) {
    let st = null;
    if (s.season && s.year === year && s.season.playerStats) st = s.season.playerStats[id];
    if (!st) {
      const p = playerOf(s, id);
      const rows = p && Array.isArray(p.careerStats) ? p.careerStats.filter(r => r.year === year) : [];
      if (rows.length) st = sumRows(rows);
    }
    if (!st || !st.g) return '';
    const reb = st.reb != null ? st.reb : (st.oreb || 0) + (st.dreb || 0);
    return `${f1(st.pts / st.g)} PTS | ${f1(reb / st.g)} REB | ${f1(st.ast / st.g)} AST`;
  }
  function sumRows(rows) {
    const t = {};
    rows.forEach(r => Object.keys(r).forEach(k => { if (typeof r[k] === 'number' && k !== 'year') t[k] = (t[k] || 0) + r[k]; }));
    return t;
  }

  // ---------- awards (tolerant of the AWARDS module's shape) ----------
  const AWARD_ORDER = [
    ['mvp', 'Most Valuable Player'], ['finalsMvp', 'Finals MVP'], ['fmvp', 'Finals MVP'], ['dpoy', 'Defensive Player of the Year'],
    ['roy', 'Rookie of the Year'], ['smoy', 'Sixth Man of the Year'], ['sixthMan', 'Sixth Man of the Year'], ['6moy', 'Sixth Man of the Year'],
    ['mip', 'Most Improved Player'], ['coy', 'Coach of the Year'], ['allNba', 'All-NBA'], ['allDefense', 'All-Defensive'], ['allDef', 'All-Defensive'],
    ['allRookie', 'All-Rookie'], ['allStar', 'All-Stars'], ['allStars', 'All-Stars']
  ];
  const SHORT = { mvp: 'MVP', finalsMvp: 'FINALS MVP', fmvp: 'FINALS MVP', dpoy: 'DPOY', roy: 'ROY', smoy: '6MOY', sixthMan: '6MOY', '6moy': '6MOY', mip: 'MIP', coy: 'COY' };
  const labelOf = k => { const x = AWARD_ORDER.find(a => a[0] === k); return x ? x[1] : String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase()); };
  const TEAM_KEYS = ['first', 'second', 'third', '1', '2', '3', '1st', '2nd', '3rd'];
  const ORD = ['FIRST TEAM', 'SECOND TEAM', 'THIRD TEAM'];

  // -> { kind: 'single' | 'race' | 'teams', items, groups: [{ name, items }] }
  function normAward(s, v) {
    if (v == null) return null;
    if (Array.isArray(v)) {
      if (!v.length) return null;
      if (v.every(Array.isArray)) return { kind: 'teams', groups: v.map((g, i) => ({ name: ORD[i] || 'TEAM ' + (i + 1), items: g.map(x => ref(s, x)).filter(Boolean) })) };
      return { kind: 'race', items: v.map(x => ref(s, x)).filter(Boolean) };
    }
    if (typeof v === 'object') {
      const race = v.race || v.candidates || v.top || v.finalists || v.ladder;
      if (v.winner != null || Array.isArray(race)) {
        const items = Array.isArray(race) ? race.map(x => ref(s, x)).filter(Boolean) : [];
        const w = v.winner != null ? ref(s, v.winner) : null;
        if (w && !(items[0] && items[0].name === w.name)) items.unshift(w);
        return items.length ? { kind: items.length > 1 ? 'race' : 'single', items } : null;
      }
      const keys = Object.keys(v);
      const groupKeys = keys.filter(k => Array.isArray(v[k]));
      if (groupKeys.length && groupKeys.length === keys.length) {
        groupKeys.sort((a, b) => (TEAM_KEYS.indexOf(a) + 1 || 99) - (TEAM_KEYS.indexOf(b) + 1 || 99));
        return { kind: 'teams', groups: groupKeys.map((k, i) => ({ name: TEAM_KEYS.includes(k) ? ORD[Math.floor(TEAM_KEYS.indexOf(k) % 3)] : String(k).toUpperCase(), items: v[k].map(x => ref(s, x)).filter(Boolean) })) };
      }
    }
    const r = ref(s, v);
    return r ? { kind: 'single', items: [r] } : null;
  }
  function awardKeys(a) {
    const keys = Object.keys(a || {}).filter(k => a[k] != null && typeof a[k] !== 'function' && k !== 'year' && k !== 'ballots');
    const known = AWARD_ORDER.map(x => x[0]).filter(k => keys.includes(k));
    return known.concat(keys.filter(k => !known.includes(k)));
  }
  function winnerOf(s, awards, keys) {
    if (!awards) return null;
    for (const k of keys) if (awards[k] != null) { const n = normAward(s, awards[k]); if (n && n.items && n.items[0]) return n.items[0]; }
    return null;
  }

  // Coach of the Year items can carry only a team: find who coached it that season.
  function coachForTeam(s, abbr, year) {
    const cs = (s && s.coaches) || {};
    const ids = Object.keys(cs);
    let c = ids.map(k => cs[k]).find(x => Array.isArray(x.seasons) && x.seasons.some(z => z.year === year && z.team === abbr));
    if (!c) c = ids.map(k => cs[k]).find(x => x.team === abbr && x.status === 'employed' && (x.hiredYear || 0) <= year);
    if (!c && year === 2013 && window.COACHES && window.COACHES.startByTeam) c = coachById(s, window.COACHES.startByTeam[abbr]);
    return c || null;
  }
  function awardCard(s, key, v, year, opts) {
    const n = normAward(s, v);
    if (!n) return '';
    if (key === 'coy' && n.items) n.items = n.items.map(r => {
      if (r.kind !== 'team') return r;
      const c = coachForTeam(s, r.abbr, year);
      return c ? Object.assign({}, r, { kind: 'coach', name: c.name, team: r.abbr }) : r;
    });
    const showLine = r => (r.kind === 'player' ? (r.line || lineFor(s, r.id, year)) : r.kind === 'coach' && r.team ? fr.teamName(s, r.team) : r.line || '');
    const face = r => (r.kind === 'player' ? fr.head(r.p) : r.kind === 'team' ? fr.logo(r.abbr, 44) : refTeam(r) ? fr.logo(refTeam(r), 44) : '');
    let inner = '';
    if (n.kind === 'teams') {
      inner = n.groups.map(g => `<div class="fr-aw-group"><div class="fr-aw-gname">${esc(g.name)}</div><div class="fr-aw-chips">${g.items.map(r =>
        `<span class="fr-aw-chip">${r.kind === 'player' ? fr.head(r.p) : ''}<span>${refName(r)}${refTeam(r) ? ` <small>${esc(refTeam(r))}</small>` : ''}</span></span>`).join('')}</div></div>`).join('');
    } else {
      const w = n.items[0];
      const rest = n.kind === 'race' ? n.items.slice(1, opts && opts.race ? 5 : 3) : [];
      inner = `<div class="fr-aw-win"><span class="fr-aw-face">${face(w)}</span><div><div class="fr-aw-name">${refName(w)}</div>
        <div class="fr-aw-line">${esc(showLine(w))}${w.score != null ? ` <span class="fr-aw-score">${esc(typeof w.score === 'number' ? (w.score % 1 ? w.score.toFixed(2) : w.score) : w.score)}</span>` : ''}</div></div>
        ${refTeam(w) && w.kind === 'player' ? fr.logo(refTeam(w), 34) : ''}</div>
        ${rest.length ? `<ol class="fr-aw-race" start="2">${rest.map(r => `<li><span>${refName(r)}${refTeam(r) ? ` <small>${esc(refTeam(r))}</small>` : ''}</span><em>${r.score != null ? esc(typeof r.score === 'number' ? (r.score % 1 ? r.score.toFixed(2) : r.score) : r.score) : ''}</em></li>`).join('')}</ol>` : ''}`;
    }
    return `<div class="fr-aw${n.kind === 'teams' ? ' wide' : ''}"><div class="fr-aw-k">${esc(labelOf(key).toUpperCase())}${opts && opts.race && n.kind === 'race' ? ' <small>LEADER</small>' : ''}</div>${inner}</div>`;
  }
  function awardsGrid(s, awards, year, opts) {
    const keys = awardKeys(awards);
    const ballots = awards && awards.ballots && typeof awards.ballots === 'object' ? awards.ballots : {};
    // a ballot (the full race) wins over the bare winner id when the module provides one
    const valueOf = k => (Array.isArray(ballots[k]) && ballots[k].length ? ballots[k] : awards[k]);
    const html = keys.map(k => awardCard(s, k, valueOf(k), year, opts)).join('');
    return html ? `<div class="fr-awards">${html}</div>` : '';
  }

  // ---------- pre-2012 history (tolerant of data/history.js shape) ----------
  function yearList(x) {
    if (!x) return [];
    if (Array.isArray(x)) return x.map(it => (it && typeof it === 'object' && !Array.isArray(it) ? it : { value: it }));
    if (typeof x === 'object') return Object.keys(x).map(k => {
      const v = x[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) return Object.assign({ year: num(k) }, v);
      return { year: num(k), value: v };
    });
    return [];
  }
  function priorChampions(H) {
    let list = yearList(H.champions || H.titles || H.finals || H.championsByYear).map(it => {
      const v = Array.isArray(it.value) ? it.value : null;
      return {
        year: num(it.year || it.season),
        team: it.champion || it.team || it.winner || it.abbr || (v ? v[0] : it.value),
        abbr: it.abbr || null,
        runner: it.runnerUp || it.runnerup || it.loser || it.opponent || (v ? v[1] : null),
        runnerAbbr: it.runnerUpAbbr || null,
        fmvp: it.finalsMvp || it.fmvp || null,
        series: it.series || it.result || null
      };
    });
    if (!list.length && H.teams && typeof H.teams === 'object') {
      Object.keys(H.teams).forEach(abbr => {
        const t = H.teams[abbr] || {};
        (t.titles || t.championships || []).forEach(y => list.push({ year: num(typeof y === 'object' ? y.year : y), team: abbr }));
      });
    }
    return list.filter(x => x.year && x.team).sort((a, b) => b.year - a.year);
  }
  function priorMvps(H) {
    const src = H.mvps || H.mvp || (H.awards && (H.awards.mvp || H.awards.MVP)) || null;
    return yearList(src).map(it => ({
      year: num(it.year || it.season),
      name: it.name || (typeof it.player === 'string' ? it.player : it.player && it.player.name) || it.value || '',
      id: it.id || it.playerId || null,
      team: it.team || it.abbr || null,
      abbr: it.abbr || null
    })).filter(x => x.year && x.name).sort((a, b) => b.year - a.year);
  }
  function priorRetired(H) {
    const out = [];
    const src = H.retired || H.retiredNumbers || H.retiredJerseys || H.jerseys || null;
    const push = (team, it) => {
      if (it == null) return;
      if (typeof it === 'string' || typeof it === 'number') {
        const m = String(it).match(/^\s*#?(\d+)\s+(.+)$/);
        out.push(m ? { team, number: m[1], name: m[2] } : { team, number: '', name: String(it) });
      } else out.push({ team: it.team || team, number: it.number != null ? it.number : it.no != null ? it.no : it.num != null ? it.num : '', name: it.name || it.player || '', year: it.year || null });
    };
    if (Array.isArray(src)) src.forEach(it => push(it && it.team, it));
    else if (src && typeof src === 'object') Object.keys(src).forEach(t => (Array.isArray(src[t]) ? src[t] : [src[t]]).forEach(it => push(t, it)));
    if (!out.length && H.teams && typeof H.teams === 'object') Object.keys(H.teams).forEach(t => ((H.teams[t] || {}).retired || []).forEach(it => push(t, it)));
    return out.filter(x => x.team && (x.name || x.number));
  }
  const prior = s => (s && s.history && s.history.prior) || window.HISTORY_PRIOR || null;

  // =====================================================================
  // NEWS
  // =====================================================================
  const TX_FILTERS = [['', 'ALL'], ['trade', 'TRADES'], ['sign', 'SIGNINGS'], ['injury', 'INJURIES'], ['draft', 'DRAFT'], ['other', 'OTHER']];
  const TX_GROUP = { trade: 'trade', sign: 'sign', release: 'sign', option: 'sign', resign: 'sign', extension: 'sign', offerSheet: 'sign', injury: 'injury', draft: 'draft' };
  const TX_LABEL = { trade: 'TRADE', sign: 'SIGNING', release: 'RELEASED', option: 'OPTION', injury: 'INJURY', draft: 'DRAFT', retire: 'RETIRED', assign: 'G LEAGUE', coach: 'COACH' };
  const byDate = list => list.map((x, i) => ({ x, i })).sort((a, b) =>
    ((b.x.year || 0) - (a.x.year || 0)) || ((b.x.day || 0) - (a.x.day || 0)) || (a.i - b.i)).map(o => o.x);

  P.news = function (app, arg) {
    const s = fr.state();
    if (!s) { fr.needState(app, 'news'); return; }
    const parts = String(arg || '').split('/');
    const mode = parts[0] === 'transactions' ? 'transactions' : 'news';
    const tabs = fr.tabs('news', [['', 'NEWS FEED'], ['transactions', 'TRANSACTIONS']], mode === 'news' ? '' : 'transactions');
    if (mode === 'news') {
      const items = byDate((s.news || []).filter(n => n && (n.headline || n.body)));
      let shown = 30;
      const card = (n, i) => {
        const ps = (n.ids || []).map(id => playerOf(s, id)).filter(Boolean).slice(0, 4);
        const teamTag = ps[0] && s.teams[ps[0].team] ? ps[0].team : null;
        return `<article class="fr-news${i === 0 ? ' lead' : ''}">
          ${ps.length ? `<div class="fr-news-hs n${ps.length}">${ps.map(p => `<a href="#/player/${encodeURIComponent(p.id)}" title="${esc(p.name)}">${fr.head(p)}</a>`).join('')}</div>` : `<div class="fr-news-hs none">${teamTag ? fr.logo(teamTag, 54) : '<span class="fr-news-mark">2K13</span>'}</div>`}
          <div class="fr-news-body"><div class="fr-news-date">${esc(fr.dateOf(s, n.year, n.day))}</div>
            <h3 class="fr-news-h">${esc(n.headline || '')}</h3>
            ${n.body ? `<p>${esc(n.body)}</p>` : ''}
            ${ps.length ? `<div class="fr-news-tags">${ps.map(p => fr.plink(p)).join('<span>|</span>')}</div>` : ''}</div>
        </article>`;
      };
      const draw = () => {
        app.innerHTML = `${fr.subnav('news')}${UI.header('NEWS', 'Around the league: headlines from trades, signings, injuries, awards and milestones.')}${tabs}
          ${items.length ? `<div class="fr-feed">${items.slice(0, shown).map(card).join('')}</div>` : UI.empty('NO NEWS YET', 'Sim some days and the stories will start rolling in.', '')}
          ${items.length > shown ? '<div class="row-btns center"><button type="button" class="btn" id="frMore">MORE STORIES</button></div>' : ''}
          ${window.NEWS ? '' : `<p class="muted fr-small">The league's own headlines show here. The full news writer (<code>js/news.js</code>) is still being built, so stories are short for now.</p>`}`;
        const more = UI.$('#frMore', app);
        if (more) more.addEventListener('click', () => { shown += 30; const y = window.scrollY; draw(); window.scrollTo(0, y); });
      };
      draw();
      return;
    }
    const filter = TX_FILTERS.some(f => f[0] === parts[1]) ? parts[1] || '' : '';
    const all = byDate((s.transactions || []).filter(Boolean));
    const grp = t => TX_GROUP[t.type] || 'other';
    const counts = {};
    all.forEach(t => { counts[grp(t)] = (counts[grp(t)] || 0) + 1; });
    const list = filter ? all.filter(t => grp(t) === filter) : all;
    let shown = 60;
    const row = t => {
      const ps = (t.ids || []).map(id => playerOf(s, id)).filter(Boolean).slice(0, 3);
      return `<li class="fr-tx"><span class="fr-tx-date">${esc(fr.dateOf(s, t.year, t.day))}</span>
        <span class="badge fr-tx-type t-${esc(grp(t))}">${esc(TX_LABEL[t.type] || String(t.type || 'MOVE').toUpperCase())}</span>
        <span class="fr-tx-text">${esc(t.text || '')}</span>
        <span class="fr-tx-hs">${ps.map(p => `<a href="#/player/${encodeURIComponent(p.id)}" title="${esc(p.name)}">${fr.head(p)}</a>`).join('')}</span></li>`;
    };
    const draw = () => {
      app.innerHTML = `${fr.subnav('news')}${UI.header('TRANSACTIONS', 'Every move in the league, newest first.')}${tabs}
        <div class="fr-chips" role="group" aria-label="Filter transactions">${TX_FILTERS.map(([k, t]) =>
          `<a href="#/news/transactions${k ? '/' + k : ''}" class="${k === filter ? 'on' : ''}">${t} <small>${k ? counts[k] || 0 : all.length}</small></a>`).join('')}</div>
        ${list.length ? `<ul class="fr-txlist">${list.slice(0, shown).map(row).join('')}</ul>` : UI.empty('NOTHING HERE YET', filter ? 'No moves of this kind so far.' : 'No transactions yet. Trades, signings and the draft will show up here.', '')}
        ${list.length > shown ? '<div class="row-btns center"><button type="button" class="btn" id="frMore">SHOW MORE</button></div>' : ''}`;
      const more = UI.$('#frMore', app);
      if (more) more.addEventListener('click', () => { shown += 60; const y = window.scrollY; draw(); window.scrollTo(0, y); });
    };
    draw();
  };

  // =====================================================================
  // AWARDS
  // =====================================================================
  P.awards = function (app) {
    const s = fr.state();
    if (!s) { fr.needState(app, 'awards'); return; }
    const A = window.AWARDS;
    let race = '';
    if (A && typeof A.season === 'function') {
      const inSeason = s.phase === 'regular' || s.phase === 'playoffs' || s.phase === 'preseason';
      const cur = inSeason ? fr.call('awards race', () => A.season(s), null) : null;
      const played = s.season && s.season.playerStats ? Object.keys(s.season.playerStats).length : 0;
      if (!inSeason) race = UI.empty('THE RACE IS OVER', 'This season\'s awards are in. The next race starts on opening night.', '<div class="row-btns center"><a class="btn" href="#/history/' + esc(s.history && s.history.seasons && s.history.seasons.length ? s.history.seasons[s.history.seasons.length - 1].year : s.year) + '">SEE THE WINNERS</a></div>');
      else if (!played) race = UI.empty('NO GAMES PLAYED YET', 'The award race starts once the season tips off.', '');
      else if (cur && typeof cur === 'object') race = `<div class="note">If the season ended today. ${esc(fr.seasonLabel(s.year))}, through ${esc(fr.dateOf(s, s.year, Math.max(0, (s.day || 1) - 1)))}.</div>` + (awardsGrid(s, cur, s.year, { race: true }) || '<p class="muted">No candidates yet.</p>');
      else race = '<p class="muted">The award race could not be worked out right now.</p>';
    } else {
      race = fr.building('The award race', 'The awards module (<code>js/awards.js</code>) has not loaded, so MVP, DPOY, ROY and the rest cannot be projected yet. Past winners appear below once seasons finish.');
    }
    const seasons = ((s.history && s.history.seasons) || []).slice().sort((a, b) => b.year - a.year);
    const cols = [['mvp'], ['finalsMvp', 'fmvp'], ['dpoy'], ['roy'], ['smoy', 'sixthMan', '6moy'], ['mip'], ['coy']];
    const past = seasons.map(h => {
      const a = h.awards || {};
      const fm = h.finalsMvp != null ? ref(s, h.finalsMvp) : null;
      return `<tr><td class="l"><a href="#/history/${esc(h.year)}">${esc(fr.seasonLabel(h.year))}</a></td>${cols.map((keys, i) => {
        const w = i === 1 && fm ? fm : winnerOf(s, a, keys);
        return `<td class="l${i > 1 ? ' hide-sm' : ''}">${w ? refName(w) : '<span class="muted">-</span>'}</td>`;
      }).join('')}</tr>`;
    }).join('');
    const H = prior(s);
    const mv = H ? priorMvps(H) : [];
    app.innerHTML = `${fr.subnav('awards')}${UI.header('AWARD RACE', esc(fr.seasonLabel(s.year)) + ' season')}${race}
      ${UI.header('PAST WINNERS', 'Seasons played in this Association.')}
      ${past ? `<div class="tscroll"><table class="stats fr-past"><thead><tr><th class="l">SEASON</th>${cols.map((k, i) => `<th class="l${i > 1 ? ' hide-sm' : ''}">${SHORT[k[0]]}</th>`).join('')}</tr></thead><tbody>${past}</tbody></table></div>`
        : '<p class="muted">No seasons finished yet. Winners are added at the end of every season.</p>'}
      ${mv.length ? `${UI.header('MVPS BEFORE 2012', 'The real winners, from the league\'s history.')}
        <div class="tscroll fr-short"><table class="stats"><thead><tr><th class="l">SEASON</th><th class="l">MVP</th><th class="l">TEAM</th></tr></thead><tbody>${mv.slice(0, 15).map(m =>
          `<tr><td class="l">${esc(fr.seasonLabel(m.year))}</td><td class="l">${m.id && playerOf(s, m.id) ? fr.plink(playerOf(s, m.id)) : esc(m.name)}</td><td class="l">${m.abbr && s.teams[m.abbr] ? `<span class="fr-st-team">${fr.logo(m.abbr, 22)} ${esc(m.team || m.abbr)}</span>` : esc(m.team || '')}</td></tr>`).join('')}</tbody></table></div>
        <a class="more" href="#/history/prior">ALL PAST MVPS AND CHAMPIONS</a>` : ''}`;
  };

  // =====================================================================
  // HISTORY
  // =====================================================================
  const HTABS = [['', 'SEASONS'], ['records', 'RECORDS'], ['hof', 'HALL OF FAME'], ['jerseys', 'RETIRED JERSEYS'], ['prior', 'BEFORE 2012']];

  P.history = function (app, arg) {
    const s = fr.state();
    if (!s) { fr.needState(app, 'history'); return; }
    const a = String(arg || '');
    if (/^\d{4}$/.test(a)) { seasonDetail(app, s, Number(a)); return; }
    const tab = HTABS.some(t => t[0] === a) ? a : '';
    const content = { '': seasonsTab, records: recordsTab, hof: hofTab, jerseys: jerseysTab, prior: priorTab }[tab](s);
    app.innerHTML = `${fr.subnav('history')}${UI.header('LEAGUE HISTORY', 'Champions, records and legends of this Association and the years before it.')}${fr.tabs('history', HTABS, tab)}${content}`;
  };

  function champOf(h) { return UI.abbrOf ? UI.abbrOf(h.champion) : h.champion; }
  function fmvpOf(s, h) {
    if (h.finalsMvp != null) return ref(s, h.finalsMvp);
    return winnerOf(s, h.awards, ['finalsMvp', 'fmvp']);
  }

  function seasonsTab(s) {
    const seasons = ((s.history && s.history.seasons) || []).slice().sort((a, b) => b.year - a.year);
    if (!seasons.length) return UI.empty('NO SEASONS FINISHED YET', 'When a season ends, its champion, Finals MVP, award winners and final standings are kept here.', '<div class="row-btns center"><a class="btn" href="#/history/prior">HISTORY BEFORE 2012</a></div>');
    const titles = {};
    seasons.forEach(h => { const c = champOf(h); if (c) titles[c] = (titles[c] || 0) + 1; });
    const cards = seasons.map(h => {
      const c = champOf(h), fm = fmvpOf(s, h), mvp = winnerOf(s, h.awards, ['mvp']);
      return `<a class="fr-season" href="#/history/${esc(h.year)}" style="--c1:${esc(c ? UI.teamColor(c) : '#333')}">
        <span class="fr-season-y">${esc(fr.seasonLabel(h.year))}</span>
        <span class="fr-season-c">${c ? fr.logo(c, 46) : ''}<span><small>CHAMPION</small><b>${esc(c ? fr.teamName(s, c) : 'Not decided')}</b></span></span>
        <span class="fr-season-a"><span><small>FINALS MVP</small>${fm ? esc(fm.name) : '-'}</span><span><small>MVP</small>${mvp ? esc(mvp.name) : '-'}</span></span>
        <span class="fr-season-go">STANDINGS AND AWARDS &#8250;</span></a>`;
    }).join('');
    const tl = Object.keys(titles).sort((a, b) => titles[b] - titles[a]);
    return `<div class="fr-seasons">${cards}</div>
      ${tl.length ? `${UI.header('TITLES IN THIS ASSOCIATION', '')}<div class="fr-titles">${tl.map(t => `<span>${fr.logo(t, 30)}<b>${titles[t]}</b><small>${esc(t)}</small></span>`).join('')}</div>` : ''}`;
  }

  function seasonDetail(app, s, year) {
    const h = ((s.history && s.history.seasons) || []).find(x => x.year === year);
    if (!h) {
      app.innerHTML = `${fr.subnav('history')}${UI.empty('SEASON NOT FOUND', 'There is no finished ' + esc(fr.seasonLabel(year)) + ' season in this Association.', '<div class="row-btns center"><a class="btn" href="#/history">ALL SEASONS</a></div>')}`;
      return;
    }
    const c = champOf(h), fm = fmvpOf(s, h);
    const st = h.standings || {};
    const rows = (Array.isArray(st) ? st.map(x => Object.assign({}, x, { abbr: UI.abbrOf(x.abbr || x.team) })) : Object.keys(st).map(k => Object.assign({ abbr: k }, st[k])))
      .map(r => Object.assign(r, { w: num(r.w != null ? r.w : r.wins) || 0, l: num(r.l != null ? r.l : r.losses) || 0, conf: (s.teams[r.abbr] && s.teams[r.abbr].conf) || r.conf || 'League' }));
    const confs = Array.from(new Set(rows.map(r => r.conf))).sort((a, b) => (a === 'East' ? -1 : b === 'East' ? 1 : a.localeCompare(b)));
    const table = conf => {
      const list = rows.filter(r => r.conf === conf).sort((a, b) => (b.w / Math.max(1, b.w + b.l)) - (a.w / Math.max(1, a.w + a.l)) || b.w - a.w);
      const lead = list[0];
      return `<section>${UI.header(conf === 'League' ? 'STANDINGS' : conf.toUpperCase() + 'ERN CONFERENCE', '')}<div class="tscroll"><table class="stand"><thead><tr><th>#</th><th class="l">TEAM</th><th>W</th><th>L</th><th>PCT</th><th>GB</th></tr></thead><tbody>${list.map((r, i) => {
        const gb = lead ? ((lead.w - r.w) + (r.l - lead.l)) / 2 : 0;
        return `<tr class="${r.abbr === c ? 'fr-champ-row' : ''}${r.abbr === s.userTeam ? ' fr-user-row' : ''}"><td>${i + 1}</td><td class="l"><span class="fr-st-team">${fr.logo(r.abbr, 22)} <a href="#/team/${encodeURIComponent(r.abbr)}">${esc(fr.teamName(s, r.abbr))}</a>${r.abbr === c ? ' <span class="badge badge-gold">CHAMPS</span>' : ''}</span></td>
          <td>${r.w}</td><td>${r.l}</td><td>${UI.fmtWinPct(r.w, r.l)}</td><td>${gb === 0 ? '-' : gb % 1 ? gb.toFixed(1) : gb}</td></tr>`;
      }).join('')}</tbody></table></div></section>`;
    };
    app.innerHTML = `${fr.subnav('history')}<a class="more fr-back" href="#/history">&#8249; ALL SEASONS</a>
      <div class="fr-hero fr-hero-champ" style="--c1:${esc(c ? UI.teamColor(c) : '#333')}">${c ? fr.logo(c, 72) : ''}
        <div class="fr-hero-info"><div class="fr-hero-k">${esc(fr.seasonLabel(year))} NBA CHAMPIONS</div><div class="fr-hero-t">${esc(c ? fr.teamName(s, c) : 'Not decided')}</div>
        <div class="fr-hero-d">${fm ? 'Finals MVP: ' + refName(fm) : ''}</div></div></div>
      ${h.awards ? UI.header('AWARDS', '') + (awardsGrid(s, h.awards, year) || '<p class="muted">No awards recorded.</p>') : `<p class="muted">No awards were recorded for this season${window.AWARDS ? '' : ' (the awards module was still being built)'}.</p>`}
      ${rows.length ? `<div class="two-col">${confs.map(table).join('')}</div>` : '<p class="muted">No standings were saved for this season.</p>'}`;
  }

  // ---------- records and career leaders ----------
  function careerRows(s) {
    const out = [];
    Object.keys(s.players || {}).forEach(id => {
      const p = s.players[id];
      if (!p || !Array.isArray(p.careerStats) || !p.careerStats.length) return;
      const seasons = {};
      p.careerStats.forEach(r => {
        if (!r || !r.year) return;
        const t = seasons[r.year] || (seasons[r.year] = { year: r.year, teams: [] });
        if (r.team && !t.teams.includes(r.team)) t.teams.push(r.team);
        ['g', 'min', 'pts', 'oreb', 'dreb', 'reb', 'ast', 'stl', 'blk', 'tpm', 'fgm', 'fga'].forEach(k => { if (typeof r[k] === 'number') t[k] = (t[k] || 0) + r[k]; });
      });
      const list = Object.keys(seasons).map(y => seasons[y]);
      list.forEach(t => { if (t.reb == null) t.reb = (t.oreb || 0) + (t.dreb || 0); });
      const car = { g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tpm: 0 };
      list.forEach(t => Object.keys(car).forEach(k => { car[k] += t[k] || 0; }));
      out.push({ p, seasons: list, car });
    });
    return out;
  }
  function leaderTable(title, items, fmt, sub) {
    return `<div class="fr-lead"><div class="fr-lead-k">${esc(title)}</div>${sub ? `<div class="fr-lead-sub">${esc(sub)}</div>` : ''}<ol>${items.map((x, i) =>
      `<li class="${i === 0 ? 'top' : ''}">${i === 0 ? fr.head(x.p) : ''}<span class="fr-lead-n">${fr.plink(x.p)}${x.note ? ` <small>${esc(x.note)}</small>` : ''}</span><b>${fmt(x.v)}</b></li>`).join('')}</ol></div>`;
  }
  function recordsTab(s) {
    const rows = careerRows(s);
    if (!rows.length) return UI.empty('NO RECORDS YET', 'Career stats are added when each season ends. Finish a season and the record book opens.', '');
    const int = v => Math.round(v).toLocaleString('en-US');
    const top = (arr, n) => arr.filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, n || 10);
    const cats = [['POINTS', 'pts'], ['REBOUNDS', 'reb'], ['ASSISTS', 'ast'], ['STEALS', 'stl'], ['BLOCKS', 'blk'], ['THREES MADE', 'tpm'], ['GAMES', 'g']];
    const career = cats.map(([t, k]) => leaderTable(t, top(rows.map(r => ({ p: r.p, v: r.car[k] || 0, note: r.p.retired ? 'retired' : '' }))), int)).join('');
    const minG = Math.min(200, Math.max(40, Math.round(Math.max.apply(null, rows.map(r => r.car.g)) * 0.4)));
    const perG = [['POINTS PER GAME', 'pts'], ['REBOUNDS PER GAME', 'reb'], ['ASSISTS PER GAME', 'ast']].map(([t, k]) =>
      leaderTable(t, top(rows.filter(r => r.car.g >= minG).map(r => ({ p: r.p, v: r.car[k] / r.car.g }))), f1, 'Minimum ' + minG + ' games')).join('');
    const single = [['POINTS PER GAME', 'pts'], ['REBOUNDS PER GAME', 'reb'], ['ASSISTS PER GAME', 'ast'], ['STEALS PER GAME', 'stl'], ['BLOCKS PER GAME', 'blk']].map(([t, k]) => {
      const list = [];
      rows.forEach(r => r.seasons.forEach(sz => { if ((sz.g || 0) >= 40) list.push({ p: r.p, v: (sz[k] || 0) / sz.g, note: fr.seasonLabel(sz.year) }); }));
      return leaderTable(t, top(list, 5), f1, 'Minimum 40 games');
    }).join('');
    const singleTot = [['POINTS IN A SEASON', 'pts'], ['THREES IN A SEASON', 'tpm']].map(([t, k]) => {
      const list = [];
      rows.forEach(r => r.seasons.forEach(sz => list.push({ p: r.p, v: sz[k] || 0, note: fr.seasonLabel(sz.year) })));
      return leaderTable(t, top(list, 5), int);
    }).join('');
    return `${UI.header('CAREER LEADERS', 'Totals in this Association, regular season.')}<div class="fr-leads">${career}</div>
      ${UI.header('CAREER AVERAGES', '')}<div class="fr-leads">${perG}</div>
      ${UI.header('SINGLE-SEASON RECORDS', '')}<div class="fr-leads">${single}${singleTot}</div>`;
  }

  function hofTab(s) {
    const list = Object.keys(s.players || {}).map(id => s.players[id]).filter(p => p && p.hof)
      .sort((a, b) => (b.hofYear || b.hofInducted || 0) - (a.hofYear || a.hofInducted || 0) || (b.pot || 0) - (a.pot || 0));
    if (!list.length) return UI.empty('THE HALL IS EMPTY', 'Players are voted into the Hall of Fame a few years after they retire. Legends of this Association will be enshrined here.', '');
    return `<div class="fr-hof">${list.map(p => {
      const cs = Array.isArray(p.careerStats) ? p.careerStats : [];
      const t = sumRows(cs);
      const g = t.g || 0, reb = t.reb != null ? t.reb : (t.oreb || 0) + (t.dreb || 0);
      const years = cs.map(r => r.year).filter(Boolean);
      const aw = (p.awards || []).reduce((m, a) => { const k = String(a.award || a.type || a).toUpperCase(); m[k] = (m[k] || 0) + 1; return m; }, {});
      const awTxt = Object.keys(aw).slice(0, 4).map(k => (aw[k] > 1 ? aw[k] + 'x ' : '') + k).join(' | ');
      return `<a class="fr-hof-card" href="#/player/${encodeURIComponent(p.id)}">${fr.head(p)}
        <span class="fr-hof-k">${p.hofYear || p.hofInducted ? 'CLASS OF ' + esc(p.hofYear || p.hofInducted) : 'HALL OF FAME'}</span>
        <span class="fr-hof-n">${esc(p.name)}</span>
        <span class="fr-hof-d">${esc(p.pos || '')}${years.length ? ' | ' + esc(Math.min.apply(null, years) - 1) + '-' + esc(Math.max.apply(null, years)) : ''}</span>
        ${g ? `<span class="fr-hof-s">${f1(t.pts / g)} PTS | ${f1(reb / g)} REB | ${f1(t.ast / g)} AST</span>` : ''}
        ${awTxt ? `<span class="fr-hof-a">${esc(awTxt)}</span>` : ''}</a>`;
    }).join('')}</div>`;
  }

  function jerseysTab(s) {
    const H = prior(s);
    const book = s.history && s.history.retiredJerseys;
    let all;
    if (book && typeof book === 'object') {
      all = [];
      Object.keys(book).forEach(t => (book[t] || []).forEach(x => {
        const p = x && x.id ? playerOf(s, x.id) : null;
        all.push({ team: t, number: x.number != null ? x.number : '', name: x.name || (p && p.name) || '', year: x.year || null, p, before: !x.id && !(x.year && x.year >= 2013) });
      }));
    } else all = H ? priorRetired(H).map(x => Object.assign({ before: true }, x)) : [];
    const dup = (team, name, number) => all.some(a => a.team === team && (a.name === name || (number != null && number !== '' && String(a.number) === String(number) && a.name === name)));
    // jerseys retired during this Association
    Object.keys(s.teams || {}).forEach(abbr => {
      const t = s.teams[abbr];
      (t.retired || t.retiredJerseys || t.retiredNumbers || []).forEach(it => {
        const p = it && (it.id || it.playerId) ? playerOf(s, it.id || it.playerId) : null;
        if (dup(abbr, p ? p.name : it.name, it.number)) return;
        all.push({ team: abbr, number: it.number != null ? it.number : it.no || '', name: p ? p.name : it.name || '', year: it.year || null, p });
      });
    });
    Object.keys(s.players || {}).forEach(id => {
      const p = s.players[id];
      const jr = p && (p.jerseysRetired || p.jerseyRetired || p.retiredJersey);
      if (!jr) return;
      (Array.isArray(jr) ? jr : [jr]).forEach(x => {
        const team = typeof x === 'string' ? x : x && x.team;
        if (team && !dup(team, p.name)) all.push({ team, number: (x && x.number) || p.jersey || p.number || '', name: p.name, year: (x && x.year) || null, p });
      });
    });
    if (!all.length) {
      return (H ? '' : fr.building('Retired jerseys before 2012', 'The franchise history file (<code>data/history.js</code>) has not loaded yet, so the real retired numbers are not shown.'))
        + UI.empty('NO JERSEYS RETIRED YET', 'When a franchise great retires, his team may hang his number in the rafters. They will be listed here.', '');
    }
    const teams = Array.from(new Set(all.map(x => x.team))).sort((a, b) => fr.teamName(s, a).localeCompare(fr.teamName(s, b)));
    return `${H ? '' : fr.building('Retired jerseys before 2012', 'The franchise history file (<code>data/history.js</code>) has not loaded yet, so only jerseys retired in this Association are shown.')}
      <div class="fr-jerseys">${teams.map(t => `<section class="fr-jt" style="--c1:${esc(UI.teamColor(t))}">
        <div class="fr-jt-h">${fr.logo(t, 34)}<b>${esc(fr.teamName(s, t))}</b></div>
        <div class="fr-jt-list">${all.filter(x => x.team === t).sort((a, b) => (num(a.number) || 0) - (num(b.number) || 0)).map(x =>
          `<span class="fr-jersey${x.before ? '' : ' new'}${String(x.number).length > 3 ? ' long' : ''}" title="${esc(x.name)}${x.year ? ', ' + esc(x.year) : ''}"><b>${esc(x.number !== '' && x.number != null ? x.number : '?')}</b><small>${x.p ? fr.plink(x.p) : esc(x.name)}</small></span>`).join('')}</div></section>`).join('')}</div>`;
  }

  function priorTab(s) {
    const H = prior(s);
    if (!H) return fr.building('History before 2012', 'The franchise history file (<code>data/history.js</code>, <code>window.HISTORY_PRIOR</code>) has not loaded yet, so the real champions and MVPs from before this Association are not available.');
    const champs = priorChampions(H), mvps = priorMvps(H);
    const mvpBy = {};
    mvps.forEach(m => { mvpBy[m.year] = m; });
    let titles = H.titles && typeof H.titles === 'object' && !Array.isArray(H.titles) ? H.titles : null;
    if (!titles) { titles = {}; champs.forEach(c => { const k = c.abbr || c.team; titles[k] = (titles[k] || 0) + 1; }); }
    const known = abbr => !!(abbr && s.teams[abbr]);
    const label = (name, abbr) => known(abbr) ? `${fr.logo(abbr, 22)} ${esc(name && name !== abbr ? name : fr.teamName(s, abbr))}` : known(name) ? `${fr.logo(name, 22)} ${esc(fr.teamName(s, name))}` : esc(name);
    const years = Array.from(new Set(champs.map(c => c.year).concat(mvps.map(m => m.year)))).sort((a, b) => b - a);
    const rows = years.map(y => {
      const c = champs.find(x => x.year === y), m = mvpBy[y];
      return `<tr><td class="l">${esc(fr.seasonLabel(y))}</td><td class="l"><span class="fr-st-team">${c ? label(c.team, c.abbr) : '-'}</span></td>
        <td class="l hide-sm">${c && c.runner ? `<span class="fr-st-team">${label(c.runner, c.runnerAbbr)}</span>` : '<span class="muted">-</span>'}</td>
        <td class="l hide-sm">${c && c.fmvp ? esc(c.fmvp) : '<span class="muted">-</span>'}</td>
        <td class="l">${m ? esc(m.name) + (m.team ? ` <small class="muted">${esc(m.abbr || m.team)}</small>` : '') : '<span class="muted">-</span>'}</td></tr>`;
    }).join('');
    const tl = Object.keys(titles).sort((a, b) => titles[b] - titles[a]).slice(0, 12);
    return `${tl.length ? `${UI.header('MOST TITLES', 'Before the 2012-13 season')}<div class="fr-titles">${tl.map(t => `<span>${known(t) ? fr.logo(t, 30) : ''}<b>${titles[t]}</b><small>${esc(t)}</small></span>`).join('')}</div>` : ''}
      ${UI.header('CHAMPIONS AND MVPS', 'The real NBA, year by year.')}
      ${rows ? `<div class="tscroll"><table class="stats"><thead><tr><th class="l">SEASON</th><th class="l">CHAMPION</th><th class="l hide-sm">RUNNER-UP</th><th class="l hide-sm">FINALS MVP</th><th class="l">MVP</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">The history file has no champions or MVPs listed.</p>'}`;
  }

  P.news.navLabel = 'News';
  P.awards.navLabel = 'Awards';
  P.history.navLabel = 'History';
  fr.awards = { normAward, awardsGrid, ref };
})();
