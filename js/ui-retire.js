/* Retirements page (#/retirements[/<year>]): the end of season retirement announcements, NBA 2K style.
   Retirements are decided at the draft lottery (DRAFT.lottery calls PROG.retirements right after the
   season, so teams can replace retirees in free agency); players who go unsigned can also retire at the
   end of free agency (FA retirements). Each summer the screen opens once after the lottery step
   (state.retireShown[year], via UI.retireDue in js/ui-sim.js), and the League page and the hub link here.
   Career = real seasons before 2012-13 (window.CAREER_PRIOR) + seasons in this save (player.careerStats).
   Awards = real awards (window.AWARDS_PRIOR) + awards won in the save (player.awards, titles from
   state.history). The Hall of Fame outlook uses AWARDS.hofScore on that full career. Potential is never shown. */
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI) return;
  const P = UI.pages = UI.pages || {};
  const esc = UI.esc;

  // ---------- teams across eras ----------
  // Old abbreviations in CAREER_PRIOR and the franchise they belong to now.
  const FRANCHISE = { PHO: 'PHX', NJN: 'BKN', SEA: 'OKC', NOK: 'NOH', VAN: 'MEM', WSB: 'WAS' };
  const OLD_NICK = { SEA: 'SuperSonics', NJN: 'Nets', VAN: 'Grizzlies', WSB: 'Bullets', NOK: 'Hornets', CHH: 'Hornets' };
  const OLD_CITY = { SEA: 'Seattle', NJN: 'New Jersey', VAN: 'Vancouver', WSB: 'Washington', NOK: 'New Orleans/Oklahoma City', CHH: 'Charlotte' };
  const franchiseOf = a => FRANCHISE[a] || a;
  const known = a => UI.teams().some(t => t.abbr === a);
  const nickOf = a => OLD_NICK[a] || (known(franchiseOf(a)) ? UI.team(franchiseOf(a)).name : a);
  const fullOf = a => (OLD_NICK[a] ? OLD_CITY[a] + ' ' + OLD_NICK[a] : known(franchiseOf(a)) ? UI.teamName(franchiseOf(a)) : a);

  // ---------- career ----------
  const priorOf = id => (window.CAREER_PRIOR && Array.isArray(window.CAREER_PRIOR[id]) ? window.CAREER_PRIOR[id] : []);
  const fmtInt = n => Math.round(n || 0).toLocaleString('en-US');

  // Season rows: { year, teams: [abbr], g, pts, reb, ast } with pts, reb, ast as totals.
  function seasons(p) {
    const rows = [];
    const seen = new Set();
    priorOf(p.id).forEach(c => {
      if (!c || !c.g || seen.has(c.year)) return;
      seen.add(c.year);
      const teams = c.team === 'TOT' && Array.isArray(c.teams) && c.teams.length ? c.teams.slice() : [c.team];
      rows.push({ year: c.year, teams, g: c.g, pts: (c.pts || 0) * c.g, reb: (c.reb || 0) * c.g, ast: (c.ast || 0) * c.g });
    });
    // A season played for two teams in the save has one row per team.
    const sim = {};
    (Array.isArray(p.careerStats) ? p.careerStats : []).forEach(c => {
      if (!c || !c.g || seen.has(c.year)) return;
      const totals = c.min != null && c.min / c.g > 4;
      const reb = c.reb != null ? c.reb : (c.oreb || 0) + (c.dreb || 0);
      const r = sim[c.year] || (sim[c.year] = { year: c.year, teams: [], g: 0, pts: 0, reb: 0, ast: 0 });
      if (c.team && r.teams.indexOf(c.team) < 0) r.teams.push(c.team);
      r.g += c.g;
      r.pts += totals ? (c.pts || 0) : (c.pts || 0) * c.g;
      r.reb += totals ? reb : reb * c.g;
      r.ast += totals ? (c.ast || 0) : (c.ast || 0) * c.g;
    });
    Object.keys(sim).forEach(y => rows.push(sim[y]));
    return rows.sort((a, b) => a.year - b.year);
  }

  // ---------- awards ----------
  function awardsOf(p) {
    const list = [];
    const seen = new Set();
    const add = (year, award) => {
      if (!award || award === 'COY') return;
      const k = year + '|' + award;
      if (seen.has(k)) return;
      seen.add(k);
      list.push({ year, award: String(award) });
    };
    const prior = window.AWARDS_PRIOR && Array.isArray(window.AWARDS_PRIOR[p.id]) ? window.AWARDS_PRIOR[p.id] : [];
    prior.forEach(a => add(a.year, a.award));
    (Array.isArray(p.awards) ? p.awards : []).forEach(a => { if (a && typeof a === 'object') add(a.year, a.award || a.name); });
    const g = UI.state.game;
    const idOf = x => (x && typeof x === 'object' ? x.id : x);
    if (g && g.history && Array.isArray(g.history.seasons)) {
      g.history.seasons.forEach(hs => {
        if (!hs || !hs.year) return;
        if (idOf(hs.finalsMvp) === p.id) add(hs.year, 'Finals MVP');
        const row = (p.careerStats || []).find(r => r && r.year === hs.year);
        if (row && hs.champion && row.team === hs.champion) add(hs.year, 'Champion');
      });
    }
    return list;
  }
  const BADGES = [['Champion', 'Champion', 1], ['MVP', 'MVP', 1], ['Finals MVP', 'Finals MVP', 1], ['DPOY', 'DPOY', 0], ['ROY', 'ROY', 0],
    ['6MOY', '6MOY', 0], ['MIP', 'MIP', 0], ['Scoring Champion', 'Scoring Champ', 0], [/^All-NBA/, 'All-NBA', 0], [/^All-Defensive/, 'All-Defense', 0], ['All-Star', 'All-Star', 0]];
  function badges(list) {
    const out = [];
    BADGES.forEach(([m, label, top]) => {
      const n = list.filter(a => (m instanceof RegExp ? m.test(a.award) : a.award === m)).length;
      if (n) out.push({ n, label, top: !!top });
    });
    return out;
  }
  const badgesHtml = b => (b.length ? `<div class="rt-badges">${b.map(x => `<span class="rt-badge${x.top ? ' top' : ''}">${x.n}x ${esc(x.label)}</span>`).join('')}</div>` : '');

  // ---------- Hall of Fame outlook ----------
  // AWARDS.hofScore over the whole career (real seasons plus this save). Calibrated on real careers:
  // Kobe, Duncan and Garnett are near 200 to 250, Kidd and Nash about 140, Ray Allen and Grant Hill
  // about 95, Billups 81, Tony Parker 74, Shawn Marion 66.
  function hofScoreOf(p, rows, awards) {
    const A = window.AWARDS;
    // totals rows (min per game above 4 tells hofScore these are totals)
    const careerStats = rows.map(r => ({ year: r.year, team: r.teams[0], g: r.g, min: r.g * 10, pts: r.pts, reb: r.reb, ast: r.ast }));
    if (A && typeof A.hofScore === 'function') {
      try { return A.hofScore({ careerStats, awards }); } catch (e) { console.warn('hofScore failed', e); }
    }
    const t = rows.reduce((s, r) => ({ pts: s.pts + r.pts, reb: s.reb + r.reb, ast: s.ast + r.ast }), { pts: 0, reb: 0, ast: 0 });
    return t.pts / 1000 * 2.2 + t.reb / 1000 * 1.1 + t.ast / 1000 * 1.6 + awards.length * 1.5;
  }
  function outlook(score, p) {
    if (p.hof) return { key: 'in', text: 'Hall of Famer' };
    if (score >= 85) return { key: 'first', text: 'First-ballot Hall of Famer' };
    if (score >= 65) return { key: 'cand', text: 'Hall of Fame candidate' };
    if (score >= 45) return { key: 'long', text: 'Hall of Fame long shot' };
    return null;
  }
  const LEGEND = 85;

  // ---------- one retiree ----------
  const cache = { ver: -1, by: {} };
  function profile(p) {
    if (cache.ver !== UI.state.ver || cache.game !== UI.state.game) { cache.ver = UI.state.ver; cache.game = UI.state.game; cache.by = {}; }
    if (cache.by[p.id]) return cache.by[p.id];
    const rows = seasons(p);
    const awards = awardsOf(p);
    const tot = rows.reduce((s, r) => ({ g: s.g + r.g, pts: s.pts + r.pts, reb: s.reb + r.reb, ast: s.ast + r.ast }), { g: 0, pts: 0, reb: 0, ast: 0 });
    // Teams in the order he played for them, one entry per franchise; seasons counted per franchise.
    const teams = [];
    rows.forEach(r => r.teams.forEach(a => {
      const f = franchiseOf(a);
      let t = teams.find(x => x.f === f);
      if (!t) teams.push(t = { f, abbr: a, years: [] });
      t.abbr = a;   // the latest name he played under
      if (t.years.indexOf(r.year) < 0) t.years.push(r.year);
    }));
    const score = hofScoreOf(p, rows, awards);
    const out = { p, rows, awards, badges: badges(awards), tot, teams, n: rows.length, score, outlook: outlook(score, p) };
    cache.by[p.id] = out;
    return out;
  }
  const per = (x, g) => (g ? (x / g).toFixed(1) : '-');
  const firstName = p => { const parts = String(p.name || '').split(' '); return parts.length > 1 ? parts.slice(0, -1).join(' ') : p.name; };
  const face = p => UI.headshot(Object.assign({}, p, { team: p.lastTeam && p.lastTeam !== 'RET' ? p.lastTeam : p.team }), 'rt-hs');

  function headline(x) {
    const p = x.p, n = x.n;
    if (!n) return p.name + ' retires';
    const s = n + ' season' + (n === 1 ? '' : 's');
    const main = x.teams.slice().sort((a, b) => b.years.length - a.years.length)[0];
    if (x.teams.length === 1) return `${p.name} retires after ${s} with the ${nickOf(main.abbr)}`;
    if (main && main.years.length >= n * 0.6) return `${p.name} retires after ${s}, ${main.years.length} with the ${nickOf(main.abbr)}`;
    return `${p.name} retires after ${s} with ${x.teams.length} teams`;
  }
  function thanks(x) {
    const u = UI.userTeam();
    if (!u || x.p.lastTeam !== u) return '';
    const t = x.teams.find(y => y.f === u);
    const k = t ? t.years.length : 1;
    return `<div class="rt-thanks"><b>THANK YOU, ${esc(String(firstName(x.p)).toUpperCase())}.</b> ${k} season${k === 1 ? '' : 's'} with the ${esc(UI.team(u).name)}. The franchise will not forget it.</div>`;
  }
  const teamChips = x => `<div class="rt-teams">${x.teams.map(t => `<span class="rt-team" title="${esc(fullOf(t.abbr))}, ${t.years.length} season${t.years.length === 1 ? '' : 's'}">${known(t.f) ? UI.logo(t.f, 18) : ''}<span>${esc(OLD_NICK[t.abbr] ? fullOf(t.abbr) : nickOf(t.abbr))}</span></span>`).join('')}</div>`;
  const outlookTag = (o, big) => (o ? `<span class="rt-hof rt-hof-${o.key}${big ? ' big' : ''}">${esc(o.text)}</span>` : '');
  const posOf = p => (UI.posLabel ? UI.posLabel(p) : p.pos || '');
  const href = p => '#/player/' + encodeURIComponent(p.id);

  function tributeHtml(x) {
    const p = x.p, t = x.tot, mine = !!thanks(x);
    const span = x.rows.length ? `${UI.seasonLabel(x.rows[0].year)} to ${UI.seasonLabel(x.rows[x.rows.length - 1].year)}` : '';
    const c = UI.teamColor(p.lastTeam && p.lastTeam !== 'RET' && p.lastTeam !== 'FA' ? p.lastTeam : (x.teams[x.teams.length - 1] && x.teams[x.teams.length - 1].f));
    return `<article class="rt-tribute${mine ? ' mine' : ''}" style="--c1:${esc(c)}">
      <a class="rt-tr-photo" href="${href(p)}" aria-label="${esc(p.name)} player card">${face(p)}</a>
      <div class="rt-tr-body">
        <div class="rt-kick">${mine ? 'YOUR TEAM | ' : ''}A LEGEND RETIRES</div>
        <h3 class="rt-tr-head"><a href="${href(p)}">${esc(headline(x))}</a></h3>
        <div class="rt-tr-sub">${esc(posOf(p))} | Age ${esc(p.age)} | ${esc(span)}</div>
        <div class="rt-tr-stats">
          <div><b>${per(t.pts, t.g)}</b><small>PTS</small></div>
          <div><b>${per(t.reb, t.g)}</b><small>REB</small></div>
          <div><b>${per(t.ast, t.g)}</b><small>AST</small></div>
          <div><b>${fmtInt(t.g)}</b><small>GAMES</small></div>
        </div>
        <div class="rt-totals">Career totals: ${fmtInt(t.pts)} points, ${fmtInt(t.reb)} rebounds, ${fmtInt(t.ast)} assists</div>
        ${badgesHtml(x.badges)}
        ${teamChips(x)}
        <div class="rt-tr-foot">${outlookTag(x.outlook, true)}<a class="btn btn-small" href="${href(p)}">PLAYER CARD</a></div>
        ${thanks(x)}
      </div>
    </article>`;
  }

  function rowHtml(x) {
    const p = x.p, t = x.tot, mine = !!thanks(x);
    const last = p.lastTeam === 'FA' ? ' | Free agent' : p.lastTeam && p.lastTeam !== 'RET' ? ' | Last with the ' + esc(UI.team(p.lastTeam).name) : '';
    return `<li class="rt-row${mine ? ' mine' : ''}">
      <a class="rt-row-hs" href="${href(p)}" aria-label="${esc(p.name)} player card">${face(p)}</a>
      <div class="rt-row-main">
        <div class="rt-row-top"><a class="rt-name" href="${href(p)}">${esc(p.name)}</a>${mine ? '<span class="rt-mine">YOUR TEAM</span>' : ''}${outlookTag(x.outlook)}</div>
        <div class="rt-row-bio">${esc(posOf(p))} | Age ${esc(p.age)} | ${x.n} season${x.n === 1 ? '' : 's'}${last}</div>
        ${x.teams.length ? teamChips(x) : ''}
        ${badgesHtml(x.badges)}
        ${thanks(x)}
      </div>
      <div class="rt-row-stats">
        <div class="rt-line"><span><b>${per(t.pts, t.g)}</b> PTS</span><span><b>${per(t.reb, t.g)}</b> REB</span><span><b>${per(t.ast, t.g)}</b> AST</span><span><b>${fmtInt(t.g)}</b> G</span></div>
        <div class="rt-totals">${fmtInt(t.pts)} PTS | ${fmtInt(t.reb)} REB | ${fmtInt(t.ast)} AST</div>
      </div>
    </li>`;
  }

  // ---------- who retired when ----------
  function retireesFor(year) {
    const g = UI.state.game;
    if (!g || !g.players) return [];
    return Object.keys(g.players).map(k => g.players[k]).filter(p => p && p.retired && p.retiredYear === year);
  }
  function retireYears() {
    const g = UI.state.game;
    if (!g || !g.players) return [];
    const ys = new Set();
    Object.keys(g.players).forEach(k => { const p = g.players[k]; if (p && p.retired && p.retiredYear) ys.add(p.retiredYear); });
    return Array.from(ys).sort((a, b) => b - a);
  }
  // Retirements for the summer after this season have been decided (the lottery ran).
  const decidedNow = g => !!(g && UI.inOffseason && UI.inOffseason() && g.prog && g.prog.lastRetire === g.year);
  UI.retireesFor = retireesFor;
  // Called by js/ui-sim.js after each sim: true once per summer, when the retirements screen should open.
  UI.retireDue = function () {
    const g = UI.state.game;
    if (!decidedNow(g) || (g.retireShown && g.retireShown[g.year])) return false;
    return retireesFor(g.year).length > 0;
  };
  function markShown(g, year) {
    if (!decidedNow(g) || year !== g.year) return;
    g.retireShown = g.retireShown || {};
    if (g.retireShown[year]) return;
    g.retireShown[year] = true;
    try { const w = UI.saves && UI.saves.write && UI.saves.write(); if (w && w.catch) w.catch(e => console.warn('Save failed', e)); } catch (e) { console.warn('Save failed', e); }
  }

  function hofClassHtml(year) {
    const g = UI.state.game;
    const ids = new Set();
    ((g.history && g.history.hallOfFame) || []).forEach(h => { if (h && h.year === year && h.id) ids.add(h.id); });
    Object.keys(g.players).forEach(k => { const p = g.players[k]; if (p && p.hof && (p.hofYear || p.hofInducted) === year) ids.add(p.id); });
    const list = Array.from(ids).map(id => g.players[id]).filter(Boolean);
    if (!list.length) return '';
    return `${UI.header('HALL OF FAME CLASS OF ' + year, 'Enshrined in the Naismith Memorial Basketball Hall of Fame this summer.')}
      <div class="rt-hofclass">${list.map(p => {
        const x = profile(p);
        return `<a class="rt-hofcard" href="${href(p)}">${face(p)}<span class="rt-hofcard-k">CLASS OF ${esc(year)}</span><span class="rt-hofcard-n">${esc(p.name)}</span><span class="rt-hofcard-s">${per(x.tot.pts, x.tot.g)} PTS | ${per(x.tot.reb, x.tot.g)} REB | ${per(x.tot.ast, x.tot.g)} AST</span></a>`;
      }).join('')}</div>`;
  }

  // ---------- page ----------
  P.retirements = function (app, arg) {
    const g = UI.state.game;
    if (!g || !g.players) {
      app.innerHTML = UI.header('RETIREMENTS') + UI.empty('NO LEAGUE LOADED', 'Start or load an Association to see who retires each summer.', '<div class="row-btns"><a class="btn btn-gold" href="#/new">NEW LEAGUE</a><a class="btn" href="#/saves">LOAD</a></div>');
      return;
    }
    const years = retireYears();
    const latest = decidedNow(g) ? g.year : (years[0] || null);
    const year = Number(arg) || latest;
    if (!year) {
      app.innerHTML = UI.header('RETIREMENTS') + UI.empty('NO RETIREMENTS YET', 'Players announce their retirements after the playoffs, when the draft lottery is held. Check back after the season.', '<div class="row-btns"><a class="btn" href="#/season">BACK TO THE SEASON</a></div>');
      return;
    }
    markShown(g, year);
    const all = retireesFor(year).map(profile).sort((a, b) => b.score - a.score || b.tot.pts - a.tot.pts);
    const legends = all.filter(x => x.score >= LEGEND);
    const rest = all.filter(x => x.score < LEGEND);
    // The notable ones first; deep bench and unsigned players fold away (the user's own always show).
    const isMine = x => x.p.lastTeam && x.p.lastTeam === UI.userTeam();
    const top = rest.filter((x, i) => i < 20 || isMine(x));
    const more = rest.filter(x => top.indexOf(x) < 0);
    const mine = all.filter(x => x.p.lastTeam && x.p.lastTeam === UI.userTeam());
    const current = decidedNow(g) && year === g.year;
    const cont = current ? (g.phase === 'draft' ? ['#/draft', 'CONTINUE TO THE DRAFT'] : ['#/season', 'BACK TO THE SEASON']) : null;
    const ys = Array.from(new Set([year].concat(years))).sort((a, b) => b - a);
    const tabs = ys.length > 1 ? `<div class="tabs year-tabs rt-years">${ys.map(y => `<a href="#/retirements/${y}" class="${y === year ? 'on' : ''}">${esc(UI.seasonLabel(y))}</a>`).join('')}</div>` : '';
    const sub = `After the ${esc(UI.seasonLabel(year))} season | ${all.length} player${all.length === 1 ? '' : 's'} announced ${all.length === 1 ? 'his' : 'their'} retirement${mine.length ? ` | ${mine.length} from your team` : ''}`;
    app.innerHTML = `<div class="rt">
      ${UI.header('RETIREMENTS', sub)}
      ${tabs}
      ${cont ? `<div class="rt-cta"><a class="btn btn-gold" href="${cont[0]}">${cont[1]}</a><a class="btn" href="#/league">LEAGUE</a></div>` : ''}
      ${hofClassHtml(year)}
      ${all.length ? '' : UI.empty('NOBODY RETIRED', 'No players retired after the ' + esc(UI.seasonLabel(year)) + ' season.')}
      ${legends.length ? `${UI.header(legends.length === 1 ? 'A LEGEND SAYS GOODBYE' : 'LEGENDS SAY GOODBYE')}<div class="rt-tributes">${legends.map(tributeHtml).join('')}</div>` : ''}
      ${rest.length ? `${UI.header(legends.length ? 'ALSO RETIRING' : 'RETIRING', 'Sorted by career value. Career averages and totals, regular season.')}<ul class="rt-list">${top.map(rowHtml).join('')}</ul>
        ${more.length ? `<details class="rt-more"><summary>SHOW ${more.length} MORE RETIREMENT${more.length === 1 ? '' : 'S'}</summary><ul class="rt-list">${more.map(rowHtml).join('')}</ul></details>` : ''}` : ''}
    </div>`;
  };
  P.retirements.navLabel = 'Retirements';
  P.retirements.navDesc = 'Who retired this summer, with career recaps and Hall of Fame outlooks.';

  // ---------- links from the League page and the hub ----------
  // Both pages belong to other files; their output gets one extra link after they draw.
  const baseLeague = P.league;
  if (typeof baseLeague === 'function') {
    P.league = function (app, arg) {
      baseLeague.call(this, app, arg);
      try {
        const grid = UI.$('.tile-grid', app);
        if (grid && UI.state.game && !UI.$('a[href="#/retirements"]', grid)) grid.insertAdjacentHTML('beforeend', UI.tile('#/retirements', 'roster', 'RETIREMENTS'));
      } catch (e) { console.warn('Retirements link failed', e); }
    };
    Object.keys(baseLeague).forEach(k => { P.league[k] = baseLeague[k]; });
  }
  const baseSeason = P.season;
  if (typeof baseSeason === 'function') {
    P.season = function (app, arg) {
      baseSeason.call(this, app, arg);
      try {
        const g = UI.state.game;
        const links = UI.$('.hub-links', app);
        if (!links || !decidedNow(g) || UI.$('a[href^="#/retirements"]', links)) return;
        const n = retireesFor(g.year).length;
        if (n) links.insertAdjacentHTML('afterbegin', `<a href="#/retirements" class="rt-hublink">RETIREMENTS (${n})</a>`);
      } catch (e) { console.warn('Retirements link failed', e); }
    };
    Object.keys(baseSeason).forEach(k => { P.season[k] = baseSeason[k]; });
  }
})();
