/* Stats center (overrides the stats page in ui-season.js): #/stats and #/leaders.
   Tabs: LEADERS, PLAYERS, ROOKIES, TEAMS, MY TEAM. Routes: #/stats/<tab>[/<year>][/playoffs].
   Reads season.playerStats / playoffStats (current season) and player.careerStats (past seasons).
   Double-doubles and team totals are not kept by the engine, so ENGINE.simDays is wrapped here to
   count them from each game's full box score: dd and td go onto the season stat lines (and so into
   careerStats at season end), team and opponent totals into state.xstats[year]. Games recorded
   another way (watch live) are picked up from the stored box scores when this page opens.
   Never shows potential. */
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI) return;
  const P = UI.pages = UI.pages || {};
  const esc = UI.esc;

  // ---------- real draft picks of the 2012-13 rookies (Basketball-Reference draft pages) ----------
  // The league file has no draft data for players already in the league in October 2012.
  const PICK_SRC = 'freeljo01:2006:30:POR clavevi01:2009:22:POR beverpa01:2009:42:LAL decolna01:2009:53:SAS bjeline01:2010:35:WAS ' +
    'varnaja01:2010:41:MIA valanjo01:2011:5:TOR motiedo01:2011:20:MIN mirotni01:2011:23:HOU bogdabo02:2011:31:MIA singlky01:2011:33:DET ' +
    'bertada01:2011:42:IND davisan02:2012:1:NOH kiddgmi01:2012:2:CHA bealbr01:2012:3:WAS waitedi01:2012:4:CLE robinth01:2012:5:SAC ' +
    'lillada01:2012:6:POR barneha02:2012:7:GSW rosste01:2012:8:TOR drumman01:2012:9:DET riverau01:2012:10:NOH leoname01:2012:11:POR ' +
    'lambje01:2012:12:HOU marshke01:2012:13:PHX hensojo01:2012:14:MIL harklma01:2012:15:PHI whitero03:2012:16:HOU zellety01:2012:17:DAL ' +
    'joneste01:2012:18:HOU nichoan01:2012:19:ORL fournev01:2012:20:DEN sullija01:2012:21:BOS melofa01:2012:22:BOS jenkijo01:2012:23:ATL ' +
    'cunnija01:2012:24:CLE wroteto01:2012:25:MEM plumlmi01:2012:26:IND moultar01:2012:27:MIA jonespe01:2012:28:OKC teaguma01:2012:29:CHI ' +
    'ezelife01:2012:30:GSW tayloje03:2012:31:CHA satorto01:2012:32:WAS jamesbe01:2012:33:CLE crowdja01:2012:34:CLE greendr01:2012:35:GSW ' +
    'johnsor01:2012:36:SAC acyqu01:2012:37:TOR millequ01:2012:38:DEN middlkh01:2012:39:DET bartowi01:2012:40:POR tayloty01:2012:41:POR ' +
    'lambdo01:2012:42:MIL scottmi01:2012:43:ATL engliki01:2012:44:DET milleda01:2012:46:NOH murphke01:2012:47:UTA oquinky01:2012:49:ORL ' +
    'josepkr01:2012:51:BOS shengto01:2012:54:PHI johnsda03:2012:55:DAL sacrero01:2012:60:LAL';
  const PICKS = {};
  PICK_SRC.split(' ').forEach(s => { const a = s.split(':'); PICKS[a[0]] = { year: +a[1], pick: +a[2], round: +a[2] <= 30 ? 1 : 2, team: a[3] }; });

  const K = ['min', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf'];
  const PCT = { fgp: 1, tpp: 1, ftp: 1, tsp: 1 };
  const INT = { g: 1, gs: 1, dd: 1, td: 1, seasons: 1 };
  const game = () => UI.state.game;

  // ---------- counting double-doubles and team totals from full box scores ----------
  function xstore(state, year) {
    state.xstats = state.xstats || {};
    return state.xstats[year] || (state.xstats[year] = { t: {}, pt: {} });
  }
  function addSide(T, abbr, own, opp) {
    const x = T[abbr] || (T[abbr] = { g: 0, f: {}, o: {} });
    x.g++;
    const sum = (box, into) => box.forEach(r => { if (r) K.forEach(k => { into[k] = (into[k] || 0) + (Number(r[k]) || 0); }); });
    sum(own, x.f); sum(opp, x.o);
    x.f.min = Math.round(x.f.min * 10) / 10; x.o.min = Math.round(x.o.min * 10) / 10;
  }
  const ddCats = row => [row.pts, (Number(row.oreb) || 0) + (Number(row.dreb) || 0), row.ast, row.stl, row.blk].filter(v => (Number(v) || 0) >= 10).length;
  function countGame(season, state, r) {
    if (!season || !r || r.id == null) return;
    const hb = r.home && r.home.box, ab = r.away && r.away.box;
    if (!Array.isArray(hb) || !Array.isArray(ab)) return;
    const seen = season.xseen || (season.xseen = {});
    const id = String(r.id);
    if (seen[id]) return;
    seen[id] = 1;
    const map = r.playoff ? season.playoffStats : season.playerStats;
    if (map) [hb, ab].forEach(box => box.forEach(row => {
      if (!row || !(row.min > 0)) return;
      const line = map[row.id];
      if (!line) return;
      const cats = ddCats(row);
      if (cats >= 2) line.dd = (line.dd || 0) + 1;
      if (cats >= 3) line.td = (line.td || 0) + 1;
    }));
    const ha = r.home.abbr, aa = r.away.abbr;
    if (state && ha && aa) {
      const X = xstore(state, season.year || state.year);
      const T = r.playoff ? X.pt : X.t;
      addSide(T, ha, hb, ab); addSide(T, aa, ab, hb);
    }
  }
  const stateFor = season => { const g = game(); return g && g.season === season ? g : null; };
  function install() {
    const E = window.ENGINE;
    if (!E || typeof E.simDays !== 'function' || E.simDays.__sc) return;
    const orig = E.simDays;
    const wrapped = function (season) {
      const out = orig.apply(this, arguments);
      try {
        const st = stateFor(season);
        ((out && out.gamesPlayed) || []).forEach(res => countGame(season, st, res));
      } catch (e) { console.warn('Stats center tally failed', e); }
      return out;
    };
    wrapped.__sc = true;
    E.simDays = wrapped;
  }
  install();
  // Games stored without passing through simDays (watch live, or saves from before this page).
  function sync() {
    const s = UI.state.season, g = game();
    if (!s || !s.boxScores || !g) return;
    (s.order || Object.keys(s.boxScores)).forEach(id => {
      if (s.xseen && s.xseen[id]) return;
      const b = s.boxScores[id];
      if (b && b.home && typeof b.home === 'object') countGame(s, g, b);
    });
  }
  function coverage() {
    const s = UI.state.season;
    if (!s) return { played: 0, counted: 0 };
    return { played: (s.order || []).length, counted: s.xseen ? Object.keys(s.xseen).length : 0 };
  }

  // ---------- seasons and stat lines ----------
  const curYear = () => { const s = UI.state.season, g = game(); return (s && s.year) || (g && g.year) || UI.year(); };
  const inOffseason = () => { const g = game(); return !!g && ['regular', 'playoffs', 'preseason'].indexOf(g.phase) < 0; };
  function seasonYears() {
    const g = game(), cur = curYear(), set = new Set([cur]);
    if (g) {
      Object.keys(g.players).forEach(id => (g.players[id].careerStats || []).forEach(r => { if (r && r.year < cur && r.g > 0) set.add(r.year); }));
      ((g.history && g.history.seasons) || []).forEach(h => { if (h && h.year < cur) set.add(h.year); });
    }
    return Array.from(set).sort((a, b) => b - a);
  }
  const hasPlayoffs = year => year === curYear() && !!UI.state.season && Object.keys(UI.state.season.playoffStats || {}).length > 0;

  function derive(t, ddOn) {
    const n = k => Number(t[k]) || 0;
    const s = { g: n('g'), gs: n('gs') };
    K.forEach(k => { s[k] = n(k); });
    s.reb = t.reb != null ? n('reb') : s.oreb + s.dreb;
    s.dd = typeof t.dd === 'number' ? t.dd : ddOn ? 0 : null;
    s.td = typeof t.td === 'number' ? t.td : ddOn ? 0 : null;
    s.fgp = s.fga ? s.fgm / s.fga : null;
    s.tpp = s.tpa ? s.tpm / s.tpa : null;
    s.ftp = s.fta ? s.ftm / s.fta : null;
    const tsa = s.fga + 0.44 * s.fta;
    s.tsp = tsa ? s.pts / (2 * tsa) : null;
    s.eff = s.pts + s.reb + s.ast + s.stl + s.blk - (s.fga - s.fgm) - (s.fta - s.ftm) - s.tov;
    return s;
  }
  function addInto(a, t) {
    a.g = (a.g || 0) + (Number(t.g) || 0); a.gs = (a.gs || 0) + (Number(t.gs) || 0);
    K.forEach(k => { a[k] = (a[k] || 0) + (Number(t[k]) || 0); });
    if (typeof t.dd === 'number') a.dd = (a.dd || 0) + t.dd;
    if (typeof t.td === 'number') a.td = (a.td || 0) + t.td;
    return a;
  }
  const careerRow = (p, year) => (p.careerStats || []).find(r => r && r.year === year) || null;

  // Every player with a line in the season: { p, team, s }.
  let poolCache = { key: '' };
  function pool(year, po) {
    const g = game(), s = UI.state.season, cur = curYear();
    const key = [year, po ? 1 : 0, UI.state.ver, s ? (s.order || []).length : 0, s ? s.day : 0, g ? g.phase : '', g ? Object.keys(g.players).length : 0].join('|');
    if (poolCache.key === key && poolCache.g === g) return poolCache.list;
    const out = [];
    if (g && year === cur && s) {
      const map = (po ? s.playoffStats : s.playerStats) || {};
      const ddOn = !!s.xseen, off = inOffseason();
      Object.keys(map).forEach(id => {
        const p = g.players[id], t = map[id];
        if (!p || !t || !(t.g > 0)) return;
        let team = p.team;
        if (off || p.retired || !isTeam(team)) { const r = careerRow(p, year); if (r && r.team) team = r.team; }
        out.push({ p, team, s: derive(t, ddOn) });
      });
    } else if (g) {
      const rows = [];
      let ddOn = false;
      Object.keys(g.players).forEach(id => {
        const p = g.players[id], r = careerRow(p, year);
        if (r && r.g > 0) { rows.push([p, r]); if (typeof r.dd === 'number') ddOn = true; }
      });
      rows.forEach(([p, r]) => out.push({ p, team: r.team || p.team, s: derive(r, ddOn) }));
    }
    poolCache = { key, g, list: out };
    return out;
  }

  function standingsFor(year) {
    const g = game();
    if (year === curYear()) return (UI.state.season && UI.state.season.standings) || {};
    const h = ((g && g.history && g.history.seasons) || []).find(x => x && x.year === year);
    return (h && h.standings) || {};
  }
  // Games each team has played, for scaling the qualification minimums.
  function teamGames(year, po, list) {
    if (po) return list.reduce((m, x) => Math.max(m, x.s.g), 0);
    const st = standingsFor(year);
    let m = 0;
    Object.keys(st).forEach(a => { const x = st[a] || {}; m = Math.max(m, (x.w || 0) + (x.l || 0)); });
    return m || list.reduce((mx, x) => Math.max(mx, x.s.g), 0) || 82;
  }

  // ---------- values, formatting, sorting ----------
  function value(s, k, mode) {
    if (!s) return null;
    if (PCT[k] || INT[k]) return s[k] == null ? null : s[k];
    const v = s[k];
    if (v == null) return null;
    if (mode === 'tot') return v;
    if (mode === 'p36') { if (k === 'min') return s.g ? v / s.g : null; return s.min > 0 ? v * 36 / s.min : null; }
    return s.g ? v / s.g : null;
  }
  function fmt(k, v, mode) {
    if (v == null || isNaN(v)) return '-';
    if (PCT[k]) return (v * 100).toFixed(1);
    if (INT[k] || mode === 'tot') return Math.round(v).toLocaleString('en-US');
    return Number(v).toFixed(1);
  }
  function sortList(list, key, dir, get) {
    return list.slice().sort((a, b) => {
      const av = get(a, key), bv = get(b, key);
      if (typeof av === 'string' || typeof bv === 'string') return String(av || '').localeCompare(String(bv || '')) * dir;
      const an = av == null || isNaN(av), bn = bv == null || isNaN(bv);
      if (an || bn) return an && bn ? 0 : an ? 1 : -1;
      return (av - bv) * dir;
    });
  }
  function th(key, label, st, cls, title) {
    const on = st.sort === key;
    return `<th class="sortable${cls ? ' ' + cls : ''}${on ? ' on' : ''}"${on ? ` aria-sort="${st.dir < 0 ? 'descending' : 'ascending'}"` : ''}${title ? ` title="${esc(title)}"` : ''}><button type="button" class="sc-sort" data-sc-sort="${esc(key)}">${label}${on ? `<i aria-hidden="true">${st.dir < 0 ? '&#9660;' : '&#9650;'}</i>` : ''}</button></th>`;
  }
  const ASC = ['name', 'team', 'draft'];
  const ordinal = n => { const t = n % 100; return n + (t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); };
  const posLabel = p => (window.POSITIONS && typeof window.POSITIONS.label === 'function' ? window.POSITIONS.label(p) : p.pos || '');
  const posPlays = (p, slot) => (window.POSITIONS && typeof window.POSITIONS.plays === 'function' ? window.POSITIONS.plays(p, slot) : String(p.pos || '').indexOf(slot) >= 0);
  const isTeam = abbr => { const g = game(); return !!(g && g.teams && g.teams[abbr]); };
  function teamCell(abbr, size) {
    if (!abbr) return '-';
    if (!isTeam(abbr)) return `<span class="sc-tm"><b>${esc(abbr)}</b></span>`;
    return `<a class="sc-tm" href="#/team/${esc(abbr)}" title="${esc(UI.teamName(abbr))}">${UI.logo(abbr, size || 22)}<b>${esc(abbr)}</b></a>`;
  }
  const nameLink = p => `<a class="sc-pn" href="#/player/${esc(p.id)}">${esc(p.name)}</a>`;
  const seasonName = y => UI.seasonLabel(y);
  const opt = (v, l, on) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(l)}</option>`;

  // ---------- view state (kept while the site is open) ----------
  const V = {
    mode: 'pg',
    pl: { sort: 'pts', dir: -1, page: 0, q: '', conf: '', team: '', pos: '', minG: 0 },
    rk: { sort: 'pts', dir: -1, round: '', cls: null, view: 'season' },
    tm: { sort: 'net', dir: -1, side: 'own' },
    my: { sort: 'pts', dir: -1, split: 'season' }
  };
  const PAGE = 50;

  // ---------- routing ----------
  const TABS = [['leaders', 'LEADERS'], ['players', 'PLAYERS'], ['rookies', 'ROOKIES'], ['teams', 'TEAMS'], ['myteam', 'MY TEAM']];
  function parseArg(arg) {
    const out = { tab: 'leaders', year: null, po: false };
    String(arg || '').split('/').filter(Boolean).forEach(x => {
      if (TABS.some(t => t[0] === x)) out.tab = x;
      else if (x === 'playoffs') out.po = true;
      else if (/^\d{4}$/.test(x)) out.year = +x;
      else if (x === 'all') out.tab = 'players';
    });
    return out;
  }
  function argOf(tab, year, po) {
    const parts = [];
    if (tab !== 'leaders' || (year && year !== curYear()) || po) parts.push(tab);
    if (year && year !== curYear()) parts.push(year);
    if (po) parts.push('playoffs');
    return parts.join('/');
  }
  const href = (tab, year, po) => { const a = argOf(tab, year, po); return '#/stats' + (a ? '/' + a : ''); };

  // ---------- LEADERS ----------
  const LEADS = [
    { k: 'pts', label: 'POINTS', unit: 'PPG', q: 'pts', n: 1400, ab: 'PTS' },
    { k: 'reb', label: 'REBOUNDS', unit: 'RPG', q: 'reb', n: 800, ab: 'REB' },
    { k: 'ast', label: 'ASSISTS', unit: 'APG', q: 'ast', n: 400, ab: 'AST' },
    { k: 'stl', label: 'STEALS', unit: 'SPG', q: 'stl', n: 125, ab: 'STL' },
    { k: 'blk', label: 'BLOCKS', unit: 'BPG', q: 'blk', n: 100, ab: 'BLK' },
    { k: 'fgp', label: 'FIELD GOAL %', unit: 'FG%', q: 'fgm', n: 300, only: true, ab: 'FGM' },
    { k: 'tpp', label: '3-POINT %', unit: '3P%', q: 'tpm', n: 82, only: true, ab: '3PM' },
    { k: 'ftp', label: 'FREE THROW %', unit: 'FT%', q: 'ftm', n: 125, only: true, ab: 'FTM' },
    { k: 'tpm', label: '3-POINTERS MADE', unit: 'TOTAL', total: true },
    { k: 'dd', label: 'DOUBLE-DOUBLES', unit: 'TOTAL', total: true },
    { k: 'min', label: 'MINUTES', unit: 'MPG', q: 'min', n: 2000, ab: 'MIN' },
    { k: 'eff', label: 'EFFICIENCY', unit: 'EFF', q: 'min', n: 2000, ab: 'MIN', note: 'PTS + REB + AST + STL + BLK, minus missed shots and turnovers, per game' }
  ];
  function leadersHtml(ctx) {
    const list = ctx.list, po = ctx.po;
    const tg = teamGames(ctx.year, po, list);
    const f = Math.min(1, tg / 82);
    const minGpo = Math.min(4, Math.max(1, tg));
    const cov = coverage();
    const cards = LEADS.map(L => {
      if (L.k === 'dd' && !list.some(x => x.s.dd != null)) return '';
      let need = '', ok;
      if (L.total) { ok = x => x.s.g > 0; need = po ? 'Playoff total' : 'Season total'; }
      else if (L.only) {
        const n = po ? Math.ceil(L.n / 82 * minGpo) : Math.max(1, Math.ceil(L.n * f));
        ok = x => x.s[L.q] >= n;
        need = 'Min ' + n.toLocaleString('en-US') + ' ' + L.ab;
      } else if (po) {
        ok = x => x.s.g >= minGpo; need = 'Min ' + minGpo + ' G';
      } else {
        const gn = Math.max(1, Math.ceil(70 * f)), tn = Math.max(1, Math.ceil(L.n * f));
        ok = x => x.s.g >= gn || x.s[L.q] >= tn;
        need = 'Min ' + gn + ' G or ' + tn.toLocaleString('en-US') + ' ' + L.ab;
      }
      const mode = L.total ? 'tot' : 'pg';
      const top = list.filter(x => ok(x) && value(x.s, L.k, mode) != null)
        .sort((a, b) => value(b.s, L.k, mode) - value(a.s, L.k, mode) || b.s.g - a.s.g || a.p.name.localeCompare(b.p.name)).slice(0, 5);
      const v = x => fmt(L.k, value(x.s, L.k, mode), mode);
      if (L.k === 'dd' && ctx.year === curYear() && cov.counted < cov.played) need += ', counted over ' + cov.counted + ' of ' + cov.played + ' games';
      const head = `<header class="sc-lc-h"><span>${L.label}</span><small>${L.unit}</small></header>`;
      if (!top.length) return `<section class="sc-lc">${head}<p class="muted sc-lc-none">Nobody qualifies yet.</p><footer class="sc-q">${esc(need)}</footer></section>`;
      const lead = top[0];
      return `<section class="sc-lc"${L.note ? ` title="${esc(L.note)}"` : ''}>${head}
        <div class="sc-lc-top" style="--c1:${esc(UI.teamColor(lead.team))}">
          <a class="sc-lc-hs" href="#/player/${esc(lead.p.id)}" tabindex="-1" aria-hidden="true">${UI.headshot(lead.p)}</a>
          <div class="sc-lc-who"><a class="sc-lc-name" href="#/player/${esc(lead.p.id)}">${esc(lead.p.name)}</a>${teamCell(lead.team, 20)}</div>
          <b class="sc-lc-v">${v(lead)}</b>
        </div>
        <ol class="sc-lc-list">${top.slice(1).map((x, i) => `<li><span class="sc-n">${i + 2}</span>${isTeam(x.team) ? `<a href="#/team/${esc(x.team)}" class="sc-lg" title="${esc(UI.teamName(x.team))}">${UI.logo(x.team, 22)}</a>` : '<span class="sc-lg"></span>'}<a class="sc-pn" href="#/player/${esc(x.p.id)}">${esc(x.p.name)}</a><b>${v(x)}</b></li>`).join('')}</ol>
        <footer class="sc-q">${esc(need)}</footer>
      </section>`;
    }).join('');
    return `<p class="sc-note">Per game unless marked. Percentage and per game leaders use the NBA's qualifying minimums, scaled to ${tg} game${tg === 1 ? '' : 's'} played.</p><div class="sc-lgrid">${cards}</div>`;
  }

  // ---------- PLAYERS ----------
  const PCOLS = [['g', 'G'], ['gs', 'GS'], ['min', 'MIN'], ['pts', 'PTS'], ['reb', 'REB'], ['oreb', 'OREB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK'], ['tov', 'TOV'],
    ['fgm', 'FGM'], ['fga', 'FGA'], ['fgp', 'FG%'], ['tpm', '3PM'], ['tpa', '3PA'], ['tpp', '3P%'], ['ftm', 'FTM'], ['fta', 'FTA'], ['ftp', 'FT%'], ['tsp', 'TS%'], ['dd', 'DD'], ['eff', 'EFF']];
  const MODES = [['pg', 'PER GAME'], ['tot', 'TOTALS'], ['p36', 'PER 36']];
  const seg = (name, opts, on) => `<div class="sc-seg" role="group">${opts.map(([v, l]) => `<button type="button" data-sc-${name}="${esc(v)}" class="${v === on ? 'on' : ''}" aria-pressed="${v === on}">${l}</button>`).join('')}</div>`;

  function playersFiltered(ctx) {
    const st = V.pl, q = st.q.trim().toLowerCase();
    return ctx.list.filter(x => {
      if (st.team && x.team !== st.team) return false;
      if (st.conf && UI.team(x.team).conf !== st.conf) return false;
      if (st.pos && !posPlays(x.p, st.pos)) return false;
      if (st.minG && x.s.g < st.minG) return false;
      if (q && String(x.p.name).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  const getPl = (x, k) => (k === 'name' ? x.p.name : k === 'team' ? x.team : value(x.s, k, V.mode));
  const statCell = (k, s, mode, sortKey) => `<td class="${sortKey === k ? 'on' : ''}">${s ? (k === 'pts' ? '<b>' + fmt(k, value(s, k, mode), mode) + '</b>' : fmt(k, value(s, k, mode), mode)) : '-'}</td>`;
  function playersTable(ctx) {
    const st = V.pl, user = UI.userTeam();
    const list = sortList(playersFiltered(ctx), st.sort, st.dir, getPl);
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (st.page >= pages) st.page = pages - 1;
    const from = st.page * PAGE, shown = list.slice(from, from + PAGE);
    const head = `<tr><th class="sc-rk">#</th>${th('name', 'PLAYER', st, 'l sc-name')}${th('team', 'TEAM', st, 'l')}${PCOLS.map(([k, l]) => th(k, k === 'min' && V.mode === 'p36' ? 'MPG' : l, st)).join('')}</tr>`;
    const body = shown.length ? shown.map((x, i) => `<tr class="${x.team === user ? 'mine' : ''}"><td class="sc-rk muted">${from + i + 1}</td>
        <td class="l sc-name">${nameLink(x.p)} <small>${esc(posLabel(x.p))}</small></td><td class="l">${teamCell(x.team)}</td>
        ${PCOLS.map(([k]) => statCell(k, x.s, V.mode, st.sort)).join('')}</tr>`).join('')
      : `<tr><td colspan="${PCOLS.length + 3}" class="l muted">No players match these filters.</td></tr>`;
    const pager = `<span class="sc-count">${list.length ? (from + 1) + '-' + (from + shown.length) + ' of ' + list.length : '0'} players</span>
      <span class="sc-pgb"><button type="button" class="btn sc-pg" data-sc-page="-1" ${st.page <= 0 ? 'disabled' : ''}>PREV</button>
      <span class="sc-pgn">PAGE ${st.page + 1} / ${pages}</span>
      <button type="button" class="btn sc-pg" data-sc-page="1" ${st.page >= pages - 1 ? 'disabled' : ''}>NEXT</button></span>`;
    return { head, body, pager };
  }
  function playersHtml(ctx) {
    const st = V.pl, user = UI.userTeam();
    const teams = UI.teams().slice().sort((a, b) => (a.city + a.name).localeCompare(b.city + b.name));
    const confs = [];
    UI.teams().forEach(t => { if (t.conf && confs.indexOf(t.conf) < 0) confs.push(t.conf); });
    confs.sort((a, b) => (a === 'East' ? -1 : b === 'East' ? 1 : a.localeCompare(b)));
    const t = playersTable(ctx);
    return `<div class="sc-bar">
        <label class="sc-f sc-f-q"><span>SEARCH</span><input type="search" id="scQ" placeholder="Player name" value="${esc(st.q)}" autocomplete="off"></label>
        <label class="sc-f"><span>CONFERENCE</span><select data-sc-f="conf">${opt('', 'All', !st.conf)}${confs.map(c => opt(c, c, st.conf === c)).join('')}</select></label>
        <label class="sc-f"><span>TEAM</span><select data-sc-f="team">${opt('', 'All teams', !st.team)}${user ? opt(user, 'My team (' + user + ')', st.team === user) : ''}${teams.filter(x => x.abbr !== user).map(x => opt(x.abbr, x.city + ' ' + x.name, st.team === x.abbr)).join('')}</select></label>
        <label class="sc-f"><span>POSITION</span><select data-sc-f="pos">${opt('', 'All', !st.pos)}${['PG', 'SG', 'SF', 'PF', 'C'].map(p => opt(p, p, st.pos === p)).join('')}</select></label>
        <label class="sc-f"><span>MIN GAMES</span><select data-sc-f="minG">${[0, 1, 5, 10, 20, 30, 41, 58, 70].map(n => opt(n, n ? n + '+' : 'Any', st.minG === n)).join('')}</select></label>
        ${seg('mode', MODES, V.mode)}
      </div>
      <div class="tscroll sc-scroll"><table class="stats sc-table" data-sc-t="pl"><thead>${t.head}</thead><tbody>${t.body}</tbody></table></div>
      <div class="sc-pager" id="scPager">${t.pager}</div>`;
  }

  // ---------- ROOKIES ----------
  let baseMap = null;
  function baseOf(id) {
    if (!baseMap) { baseMap = {}; ((UI.state.league && UI.state.league.players) || []).forEach(p => { baseMap[p.id] = p; }); }
    return baseMap[id] || null;
  }
  const startYear = () => (UI.state.league && UI.state.league.season) || 2013;
  // A rookie in the first season of the save: in the October 2012 league with no NBA seasons before.
  function initialRookie(p) {
    const b = baseOf(p.id);
    if (!b) return false;
    const CP = window.CAREER_PRIOR;
    if (CP) {
      const yrs = {};
      (CP[p.id] || []).forEach(x => { if (x && x.year != null) yrs[x.year] = 1; });
      return !Object.keys(yrs).length && !(b.yearsPro > 0);
    }
    if (b.yearsPro != null) return b.yearsPro === 0;
    return (b.age || 22) <= 21;
  }
  // Season-ending year of the player's first NBA season, or null when unknown.
  function rookieYear(p) {
    if (!p || p.team === 'DRAFT') return null;
    if (initialRookie(p)) return startYear();
    const dy = p.draft && p.draft.year != null ? +p.draft.year : p.draftYear != null ? +p.draftYear : null;
    if (dy != null) {
      const ry = p.arrivalYear != null && +p.arrivalYear > dy ? +p.arrivalYear : dy + 1;
      return ry < startYear() ? null : ry;
    }
    if (p.generated) {
      const ys = (p.careerStats || []).filter(r => r && r.g > 0).map(r => r.year);
      const s = UI.state.season;
      if (s && s.playerStats && s.playerStats[p.id] && s.playerStats[p.id].g > 0) ys.push(curYear());
      if (ys.length) return Math.min.apply(null, ys);
      return p.yearsPro === 0 ? curYear() + (inOffseason() ? 1 : 0) : null;
    }
    return null;
  }
  function draftInfo(p) {
    if (p.draft && p.draft.year != null && p.draft.pick) {
      const d = p.draft;
      return { year: +d.year, pick: +d.pick, round: d.round || (+d.pick <= 30 ? 1 : 2), team: d.team || '' };
    }
    if (PICKS[p.id]) return PICKS[p.id];
    return { undrafted: true, year: p.draftYear != null ? +p.draftYear : null, round: 0, pick: 999 };
  }
  const draftText = d => (d.undrafted ? 'UNDRAFTED' : d.year + ' #' + d.pick + (d.team ? ' ' + d.team : ''));
  let draftOvrMap = null;
  function draftOvr(p, ry) {
    if (initialRookie(p)) { const b = baseOf(p.id); if (b && b.ovr) return b.ovr; }
    if (!draftOvrMap) {
      draftOvrMap = {};
      const D = window.DRAFTS || {};
      Object.keys(D).forEach(y => (D[y] || []).forEach(x => { if (x && x.id && x.ovr) draftOvrMap[x.id] = x.ovr; }));
      (window.DRAFT_RIGHTS || []).forEach(x => { if (x && x.id && x.ovr && !draftOvrMap[x.id]) draftOvrMap[x.id] = x.ovr; });
    }
    if (draftOvrMap[p.id]) return draftOvrMap[p.id];
    const rep = game() && game().progressReport;
    const v = rep && rep.year === ry && rep.players && rep.players[p.id];
    return Array.isArray(v) && v[0] ? Number(v[0]) : null;
  }
  // Rookie classes in the save, by season-ending year of the rookie season.
  function classYears() {
    const g = game(), set = new Set();
    if (!g) return [];
    // next season's rookies show up once this year's draft has started
    const last = curYear() + (inOffseason() && g.phase !== 'draftLottery' ? 1 : 0);
    Object.keys(g.players).forEach(id => {
      const p = g.players[id];
      if (p.team === 'DRAFT') return;
      const ry = rookieYear(p);
      if (ry != null && ry <= last) set.add(ry);
    });
    return Array.from(set).sort((a, b) => b - a);
  }
  function classRows(cls, ctx) {
    const g = game(), cur = curYear(), live = UI.state.season;
    const byId = {};
    ctx.list.forEach(x => { byId[x.p.id] = x; });
    const out = [];
    Object.keys(g.players).forEach(id => {
      const p = g.players[id];
      if (p.team === 'DRAFT' || rookieYear(p) !== cls) return;
      const d = draftInfo(p);
      if (V.rk.round === '1' && d.round !== 1) return;
      if (V.rk.round === '2' && d.round !== 2) return;
      if (V.rk.round === 'u' && !d.undrafted) return;
      let line = null, team = p.team, seasons = 0;
      const played = (p.careerStats || []).filter(r => r && r.year >= cls && r.g > 0);
      const liveLine = live && live.playerStats && live.playerStats[id];
      if (V.rk.view === 'career') {
        const acc = {};
        let ddOn = false;
        played.forEach(r => { addInto(acc, r); if (typeof r.dd === 'number') ddOn = true; });
        seasons = played.length;
        if (liveLine && liveLine.g > 0 && !played.some(r => r.year === cur)) { addInto(acc, liveLine); seasons++; if (live.xseen) ddOn = true; }
        if (acc.g) line = derive(acc, ddOn);
      } else {
        const x = byId[id];
        if (x) { line = x.s; team = x.team; }
        else if (ctx.year !== cur) { const r = careerRow(p, ctx.year); if (r && r.team) team = r.team; }
      }
      const onTeam = isTeam(p.team) && !p.retired && !(p.stashedUntil && p.stashedUntil > cls);
      if (!onTeam && !played.length && !(liveLine && liveLine.g > 0)) return;
      const ovr0 = draftOvr(p, cls);
      out.push({ p, d, team, s: line, seasons, ovr: p.ovr || 0, ovr0, dov: ovr0 != null ? (p.ovr || 0) - ovr0 : null });
    });
    return out;
  }
  const RCOLS = [['g', 'G'], ['min', 'MPG'], ['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK'], ['fgp', 'FG%'], ['tpp', '3P%'], ['eff', 'EFF']];
  function getRk(x, k) {
    if (k === 'name') return x.p.name;
    if (k === 'team') return x.team;
    if (k === 'draft') return x.d.undrafted ? 1e7 : x.d.year * 100 + x.d.pick;
    if (k === 'ovr') return x.ovr;
    if (k === 'ovr0') return x.ovr0;
    if (k === 'dov') return x.dov;
    if (k === 'seasons') return x.seasons;
    return x.s ? value(x.s, k, 'pg') : null;
  }
  function royRace(rows, ctx) {
    const tg = teamGames(ctx.year, false, ctx.list) || 1;
    const scored = rows.filter(x => x.s && x.s.g > 0).map(x => {
      const w = Math.sqrt(Math.max(0, Math.min(1, x.s.g / (tg * 0.85))));
      return { x, score: (x.s.eff / x.s.g) * w + 0.1 * (x.s.min / x.s.g) };
    }).sort((a, b) => b.score - a.score).slice(0, 5);
    if (!scored.length) return '';
    const best = scored[0].score || 1;
    return `<section class="sc-roy">
      <header class="sc-roy-h"><span>ROOKIE OF THE YEAR RACE</span><small>Score: efficiency per game, weighted by games played, plus a little for minutes</small></header>
      <ol>${scored.map((r, i) => { const s = r.x.s; return `<li class="${i ? '' : 'lead'}">
        <span class="sc-roy-n">${i + 1}</span>
        <a class="sc-roy-hs" href="#/player/${esc(r.x.p.id)}" tabindex="-1" aria-hidden="true">${UI.headshot(r.x.p)}</a>
        <span class="sc-roy-who">${nameLink(r.x.p)}<span class="sc-roy-meta">${teamCell(r.x.team, 18)}<small>${esc(draftText(r.x.d))}</small></span>
          <small class="sc-roy-line">${UI.fmt1(s.pts / s.g)} PTS | ${UI.fmt1(s.reb / s.g)} REB | ${UI.fmt1(s.ast / s.g)} AST | ${s.g} G</small></span>
        <span class="sc-roy-sc"><b>${r.score.toFixed(1)}</b><i style="width:${Math.max(6, Math.round(r.score / best * 100))}%"></i></span>
      </li>`; }).join('')}</ol></section>`;
  }
  function royWinner(year) {
    const g = game();
    const h = ((g && g.history && g.history.seasons) || []).find(x => x && x.year === year);
    let id = h && h.awards && h.awards.roy;
    if (id && typeof id === 'object') id = id.id;
    const p = id && g.players[id];
    return p ? `<p class="sc-note sc-won">ROOKIE OF THE YEAR ${esc(seasonName(year))}: ${nameLink(p)}</p>` : '';
  }
  function rookiesTable(ctx, cls) {
    const st = V.rk, user = UI.userTeam();
    // draft order first, so rows without stats (or tied) stay in pick order
    const rows = sortList(sortList(classRows(cls, ctx), 'draft', 1, getRk), st.sort, st.dir, getRk);
    const cols = st.view === 'career' ? [['seasons', 'SEAS']].concat(RCOLS) : RCOLS;
    const head = `<tr>${th('name', 'PLAYER', st, 'l sc-name')}${th('draft', 'DRAFT', st, 'l')}${th('team', 'TEAM', st, 'l')}${cols.map(([k, l]) => th(k, l, st)).join('')}${th('ovr', 'OVR', st, '', 'Overall rating now')}${th('ovr0', 'DRAFT OVR', st, '', 'Overall rating on draft day')}${th('dov', '+/-', st, '', 'Change since draft day')}</tr>`;
    const body = rows.length ? rows.map(x => `<tr class="${x.team === user ? 'mine' : ''}">
        <td class="l sc-name"><span class="sc-wp">${UI.headshot(x.p, 'sc-mini')}<span>${nameLink(x.p)} <small>${esc(posLabel(x.p))}</small></span></span></td>
        <td class="l sc-draft">${esc(draftText(x.d))}</td><td class="l">${teamCell(x.team)}</td>
        ${cols.map(([k]) => (k === 'seasons' ? `<td class="${st.sort === k ? 'on' : ''}">${x.seasons}</td>` : statCell(k, x.s, 'pg', st.sort))).join('')}
        <td class="${st.sort === 'ovr' ? 'on' : ''}"><span class="sc-ovr ${UI.ovrClass(x.ovr)}">${x.ovr || '-'}</span></td>
        <td class="${st.sort === 'ovr0' ? 'on' : ''}">${x.ovr0 != null ? x.ovr0 : '-'}</td>
        <td class="${st.sort === 'dov' ? 'on' : ''}">${x.dov == null ? '-' : `<span class="${x.dov > 0 ? 'sc-up' : x.dov < 0 ? 'sc-down' : 'muted'}">${x.dov > 0 ? '+' : ''}${x.dov}</span>`}</td></tr>`).join('')
      : `<tr><td colspan="${cols.length + 6}" class="l muted">No rookies match this filter.</td></tr>`;
    return { head, body, rows };
  }
  function rookieClass(ctx) {
    const years = classYears();
    let cls = V.rk.cls != null && years.indexOf(V.rk.cls) >= 0 ? V.rk.cls : ctx.year;
    if (years.indexOf(cls) < 0 && years.length) cls = years.find(y => y <= ctx.year) || years[0];
    return { cls, years };
  }
  function rookiesHtml(ctx) {
    const st = V.rk, cur = curYear();
    const { cls, years } = rookieClass(ctx);
    const t = rookiesTable(ctx, cls);
    const showRace = st.view === 'season' && !ctx.po && cls === ctx.year;
    const race = showRace ? (ctx.year === cur && !inOffseason() ? royRace(t.rows, ctx) : royWinner(cls) || royRace(t.rows, ctx)) : '';
    const statSeason = st.view === 'career' ? 'every season in this save since they arrived, per game' : seasonName(ctx.year) + (ctx.po ? ' playoffs' : '') + ', per game';
    return `<div class="sc-bar">
        <label class="sc-f"><span>DRAFT CLASS</span><select data-sc-rk="cls">${years.map(y => opt(y, (y - 1) + ' class (' + seasonName(y) + (y > cur ? ', next season' : '') + ')', y === cls)).join('')}</select></label>
        <label class="sc-f"><span>DRAFT ROUND</span><select data-sc-rk="round">${opt('', 'All', !st.round)}${opt('1', 'Round 1', st.round === '1')}${opt('2', 'Round 2', st.round === '2')}${opt('u', 'Undrafted', st.round === 'u')}</select></label>
        ${seg('rkview', [['season', 'SEASON'], ['career', 'SINCE DRAFTED']], st.view)}
      </div>
      ${race}
      <p class="sc-note">${t.rows.length} rookie${t.rows.length === 1 ? '' : 's'} whose first season was ${esc(seasonName(cls))}, including late arrivals and undrafted players. Stats: ${esc(statSeason)}. DRAFT OVR is the rating on draft day.</p>
      <div class="tscroll sc-scroll"><table class="stats sc-table sc-rtable" data-sc-t="rk"><thead>${t.head}</thead><tbody>${t.body}</tbody></table></div>`;
  }

  // ---------- TEAMS ----------
  function teamRows(year, po, list) {
    const g = game();
    const X = g && g.xstats && g.xstats[year];
    const T = X ? (po ? X.pt : X.t) : null;
    const st = standingsFor(year);
    const abbrs = Object.keys(st).length ? Object.keys(st) : UI.teams().map(t => t.abbr);
    const fallback = {};
    list.forEach(x => { if (!fallback[x.team]) fallback[x.team] = {}; addInto(fallback[x.team], x.s); });
    let approx = false;
    const rows = abbrs.map(abbr => {
      const s0 = st[abbr] || {};
      const tr = T && T[abbr];
      const gp = po ? (tr ? tr.g : 0) : (s0.w || 0) + (s0.l || 0);
      if (!gp) return null;
      const full = !!tr && tr.g >= gp;
      if (!full) approx = true;
      const own = full ? derive(tr.f) : fallback[abbr] ? derive(fallback[abbr]) : null;
      const opp = full ? derive(tr.o) : null;
      if (!own) return null;
      const ownPoss = own.fga - own.oreb + own.tov + 0.44 * own.fta;
      const oppPoss = opp ? opp.fga - opp.oreb + opp.tov + 0.44 * opp.fta : ownPoss;
      const poss = (ownPoss + oppPoss) / 2;
      const ptsFor = !po && s0.pf != null ? s0.pf : own.pts, ptsAg = !po && s0.pa != null ? s0.pa : opp ? opp.pts : null;
      const r = { abbr, gp, w: po ? null : s0.w || 0, l: po ? null : s0.l || 0, own, opp, full };
      r.pts = ptsFor / gp; r.opp_pts = ptsAg != null ? ptsAg / gp : null;
      r.diff = r.opp_pts != null ? r.pts - r.opp_pts : null;
      r.ortg = poss > 0 && full ? 100 * ptsFor / poss : null;
      r.drtg = poss > 0 && full && ptsAg != null ? 100 * ptsAg / poss : null;
      r.net = r.ortg != null && r.drtg != null ? r.ortg - r.drtg : null;
      r.pace = full ? poss / gp : null;
      return r;
    }).filter(Boolean);
    return { rows, approx };
  }
  const TCOLS = [['pts', 'PTS'], ['fgm', 'FGM'], ['fga', 'FGA'], ['fgp', 'FG%'], ['tpm', '3PM'], ['tpa', '3PA'], ['tpp', '3P%'], ['ftm', 'FTM'], ['fta', 'FTA'], ['ftp', 'FT%'],
    ['oreb', 'OREB'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK'], ['tov', 'TOV'], ['pf', 'PF']];
  const TEAM_KEYS = ['gp', 'w', 'l', 'diff', 'ortg', 'drtg', 'net', 'pace', 'opp_pts'];
  function getTm(r, k) {
    const opp = V.tm.side === 'opp', side = opp ? r.opp : r.own;
    if (k === 'team') return UI.teamName(r.abbr);
    if (TEAM_KEYS.indexOf(k) >= 0) return r[k];
    if (k === 'pts') return opp ? r.opp_pts : r.pts;
    if (!side) return null;
    if (PCT[k]) return side[k];
    return side[k] / r.gp;
  }
  function teamsTable(ctx) {
    const st = V.tm, user = UI.userTeam(), opp = st.side === 'opp';
    const tr = teamRows(ctx.year, ctx.po, ctx.list);
    const rows = sortList(tr.rows, st.sort, st.dir, getTm);
    const head = `<tr><th class="sc-rk">#</th>${th('team', 'TEAM', st, 'l sc-name')}${th('gp', 'G', st)}${ctx.po ? '' : th('w', 'W', st) + th('l', 'L', st)}${TCOLS.map(([k, l]) => th(k, (opp ? 'OPP ' : '') + l, st)).join('')}${opp ? '' : th('opp_pts', 'OPP', st, '', 'Points allowed per game')}${th('diff', 'DIFF', st)}${th('ortg', 'ORTG', st, '', 'Points scored per 100 possessions')}${th('drtg', 'DRTG', st, '', 'Points allowed per 100 possessions')}${th('net', 'NET', st)}${th('pace', 'PACE', st, '', 'Possessions per game')}</tr>`;
    const cell = (k, v, isPct) => `<td class="${st.sort === k ? 'on' : ''}">${v == null || isNaN(v) ? '-' : isPct ? (v * 100).toFixed(1) : Number(v).toFixed(1)}</td>`;
    const signed = (k, v) => `<td class="${st.sort === k ? 'on' : ''}">${v == null ? '-' : `<span class="${v > 0 ? 'sc-up' : v < 0 ? 'sc-down' : ''}">${v > 0 ? '+' : ''}${v.toFixed(1)}</span>`}</td>`;
    const body = rows.map((r, i) => `<tr class="${r.abbr === user ? 'mine' : ''}"><td class="sc-rk muted">${i + 1}</td>
      <td class="l sc-name">${isTeam(r.abbr) ? `<a class="sc-tm" href="#/team/${esc(r.abbr)}">${UI.logo(r.abbr, 26)}<b class="sc-full">${esc(UI.teamName(r.abbr))}</b><b class="sc-short">${esc(r.abbr)}</b></a>` : esc(r.abbr)}</td>
      <td class="${st.sort === 'gp' ? 'on' : ''}">${r.gp}</td>${ctx.po ? '' : `<td class="${st.sort === 'w' ? 'on' : ''}">${r.w}</td><td class="${st.sort === 'l' ? 'on' : ''}">${r.l}</td>`}
      ${TCOLS.map(([k]) => cell(k, getTm(r, k), PCT[k])).join('')}${opp ? '' : cell('opp_pts', r.opp_pts)}
      ${signed('diff', r.diff)}${cell('ortg', r.ortg)}${cell('drtg', r.drtg)}${signed('net', r.net)}${cell('pace', r.pace)}</tr>`).join('');
    return { head, body: body || '<tr><td colspan="30" class="l muted">No games played yet.</td></tr>', approx: tr.approx, rows };
  }
  function teamsHtml(ctx) {
    const t = teamsTable(ctx);
    const note = t.approx ? '<p class="sc-note">Some games of this season were played before team box score totals were kept, so those teams\' numbers come from their players\' lines and the opponent and rating columns stay blank.</p>' : '';
    return `<div class="sc-bar">${seg('side', [['own', 'TEAM'], ['opp', 'OPPONENT']], V.tm.side)}<span class="sc-count">Per game. ${V.tm.side === 'opp' ? 'What each team allowed.' : 'Tap a column to sort.'}</span></div>${note}
      <div class="tscroll sc-scroll"><table class="stats sc-table sc-ttable" data-sc-t="tm"><thead>${t.head}</thead><tbody>${t.body}</tbody></table></div>`;
  }

  // ---------- MY TEAM ----------
  const SPLITS = [['season', 'SEASON'], ['last10', 'LAST 10'], ['home', 'HOME'], ['away', 'AWAY'], ['wins', 'WINS'], ['losses', 'LOSSES']];
  function splitLines(user, split, po) {
    const games = UI.games().filter(gm => gm.played && !!gm.playoff === !!po && (gm.home === user || gm.away === user))
      .filter(gm => { const r = gm.result; return r && r.home && typeof r.home === 'object' && Array.isArray(r.home.box); })
      .sort((a, b) => a.day - b.day);
    const won = gm => (gm.home === user ? gm.hs > gm.as : gm.as > gm.hs);
    let pick = games;
    if (split === 'last10') pick = games.slice(-10);
    else if (split === 'home') pick = games.filter(gm => gm.home === user);
    else if (split === 'away') pick = games.filter(gm => gm.away === user);
    else if (split === 'wins') pick = games.filter(won);
    else if (split === 'losses') pick = games.filter(gm => !won(gm));
    const map = {};
    let w = 0, l = 0, pf = 0, pa = 0;
    pick.forEach(gm => {
      const r = gm.result, side = gm.home === user ? 'home' : 'away';
      const mine = gm.home === user ? gm.hs : gm.as, theirs = gm.home === user ? gm.as : gm.hs;
      pf += mine; pa += theirs;
      if (mine > theirs) w++; else l++;
      (r[side].box || []).forEach(row => {
        if (!row) return;
        const a = map[row.id] || (map[row.id] = { g: 0, gs: 0, dd: 0, td: 0 });
        if (row.min > 0) {
          a.g++;
          const cats = ddCats(row);
          if (cats >= 2) a.dd++;
          if (cats >= 3) a.td++;
        }
        if (row.starter) a.gs++;
        K.forEach(k => { a[k] = (a[k] || 0) + (Number(row[k]) || 0); });
      });
    });
    return { map, n: pick.length, w, l, pf, pa };
  }
  const MCOLS = [['g', 'G'], ['gs', 'GS'], ['min', 'MIN'], ['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK'], ['tov', 'TOV'], ['fgp', 'FG%'], ['tpp', '3P%'], ['ftp', 'FT%'], ['tsp', 'TS%'], ['dd', 'DD'], ['eff', 'EFF']];
  function myRows(ctx, user) {
    const g = game(), cur = curYear(), live = ctx.year === cur;
    const split = live ? V.my.split : 'season';
    const rows = [];
    if (split === 'season') {
      const seen = {};
      ctx.list.forEach(x => { if (x.team === user) { rows.push({ p: x.p, s: x.s }); seen[x.p.id] = 1; } });
      if (live && !ctx.po) UI.roster(user).forEach(p => { if (!seen[p.id] && !(p.stashedUntil && p.stashedUntil > cur)) rows.push({ p, s: null }); });
      return { rows, sp: null };
    }
    const sp = splitLines(user, split, ctx.po);
    Object.keys(sp.map).forEach(id => { const p = g.players[id]; if (p && sp.map[id].g > 0) rows.push({ p, s: derive(sp.map[id], true) }); });
    return { rows, sp };
  }
  const getMy = (x, k) => (k === 'name' ? x.p.name : x.s ? value(x.s, k, V.mode) : null);
  function myTable(ctx, user) {
    const st = V.my;
    const mr = myRows(ctx, user);
    const rows = sortList(mr.rows, st.sort, st.dir, getMy);
    const head = `<tr>${th('name', 'PLAYER', st, 'l sc-name')}${MCOLS.map(([k, l]) => th(k, k === 'min' && V.mode === 'p36' ? 'MPG' : l, st)).join('')}</tr>`;
    const body = rows.length ? rows.map(x => `<tr${x.p.team !== user ? ' class="sc-gone"' : ''}><td class="l sc-name"><span class="sc-wp">${UI.headshot(x.p, 'sc-mini')}<span>${nameLink(x.p)} <small>${esc(posLabel(x.p))}${x.p.team !== user ? ' | now ' + esc(x.p.team) : ''}</small> ${UI.injuryBadge(x.p)}</span></span></td>
        ${MCOLS.map(([k]) => (!x.s && k === 'g' ? `<td class="${st.sort === k ? 'on' : ''}">0</td>` : statCell(k, x.s, V.mode, st.sort))).join('')}</tr>`).join('')
      : `<tr><td colspan="${MCOLS.length + 1}" class="l muted">No games in this split yet.</td></tr>`;
    return { head, body, sp: mr.sp };
  }
  function myHtml(ctx) {
    const user = UI.userTeam();
    if (!user) return UI.empty('NO TEAM', 'Start an Association to follow your own team.');
    const live = ctx.year === curYear();
    const tr = teamRows(ctx.year, ctx.po, ctx.list);
    const mine = tr.rows.find(r => r.abbr === user);
    const rank = (k, low) => {
      if (!mine || mine[k] == null) return '';
      const vals = tr.rows.filter(r => r[k] != null).sort((a, b) => (low ? a[k] - b[k] : b[k] - a[k]));
      const i = vals.findIndex(r => r.abbr === user);
      return i >= 0 ? `<small>${ordinal(i + 1)} of ${vals.length}</small>` : '';
    };
    const stat = (label, v, k, low) => `<div><b>${v}</b><span>${label}</span>${rank(k, low)}</div>`;
    const rec = ctx.po ? '' : mine ? mine.w + '-' + mine.l : UI.record(user);
    const t = myTable(ctx, user), sp = t.sp;
    const splitBar = live ? seg('split', SPLITS, V.my.split) : '<span class="sc-count">Splits are kept for the current season only.</span>';
    const spNote = sp ? `<p class="sc-note">${sp.n ? `${sp.n} game${sp.n === 1 ? '' : 's'} in this split: ${sp.w}-${sp.l}, ${UI.fmt1(sp.pf / sp.n)} points scored and ${UI.fmt1(sp.pa / sp.n)} allowed per game.` : 'No games in this split yet.'}</p>` : '';
    return `<div class="sc-my" style="--c1:${esc(UI.teamColor(user))}">
        <a href="#/team/${esc(user)}" class="sc-my-logo" aria-hidden="true" tabindex="-1">${UI.logo(user, 64)}</a>
        <div class="sc-my-name"><small>${esc(seasonName(ctx.year))}${ctx.po ? ' PLAYOFFS' : ''}</small><a href="#/team/${esc(user)}">${esc(UI.teamName(user).toUpperCase())}</a>${rec ? `<span>${esc(rec)}</span>` : ''}</div>
        <div class="sc-my-stats">${mine ? stat('PPG', UI.fmt1(mine.pts), 'pts') + stat('OPP PPG', UI.fmt1(mine.opp_pts), 'opp_pts', true) + stat('ORTG', UI.fmt1(mine.ortg), 'ortg') + stat('DRTG', UI.fmt1(mine.drtg), 'drtg', true) + stat('NET', mine.net == null ? '-' : (mine.net > 0 ? '+' : '') + mine.net.toFixed(1), 'net') : '<div><span>NO GAMES YET</span></div>'}</div>
      </div>
      <div class="sc-bar">${splitBar}${seg('mode', MODES, V.mode)}</div>${spNote}
      <div class="tscroll sc-scroll"><table class="stats sc-table" data-sc-t="my"><thead>${t.head}</thead><tbody>${t.body}</tbody></table></div>`;
  }

  // ---------- page ----------
  function needLeague(app) {
    if (UI.state.game && UI.state.season) return false;
    app.innerHTML = UI.header('STATS CENTER') + UI.empty('NO SEASON YET', 'Stats come from the games played in your league. Start or load an Association first.',
      `<div class="row-btns">${UI.canPlay() ? '<a class="btn btn-gold" href="#/new">PLAY THE ASSOCIATION</a>' : ''}<a class="btn" href="#/saves">LOAD</a></div>`);
    return true;
  }

  P.stats = function (app, arg) {
    if (needLeague(app)) return;
    try { sync(); } catch (e) { console.warn('Stats center sync failed', e); }
    const a = parseArg(arg);
    const cur = curYear();
    const years = seasonYears();
    const year = a.year && years.indexOf(a.year) >= 0 ? a.year : cur;
    const po = a.po && hasPlayoffs(year);
    const tab = a.tab === 'myteam' && !UI.userTeam() ? 'leaders' : a.tab;
    const ctx = { year, po, tab, list: pool(year, po) };
    const kicker = seasonName(year) + (po ? ' PLAYOFFS' : ' REGULAR SEASON');
    const tabs = TABS.filter(t => t[0] !== 'myteam' || UI.userTeam())
      .map(([k, l]) => `<a href="${href(k, year, po)}" class="${k === tab ? 'on' : ''}"${k === tab ? ' aria-current="page"' : ''}>${l}</a>`).join('');
    const ctl = `<div class="sc-ctl">
        <label class="sc-f"><span>SEASON</span><select id="scSeason">${years.map(y => `<option value="${y}"${y === year ? ' selected' : ''}>${esc(seasonName(y))}${y === cur ? ' (current)' : ''}</option>`).join('')}</select></label>
        ${hasPlayoffs(year) ? `<div class="sc-seg" role="group"><a href="${href(tab, year, false)}" class="${po ? '' : 'on'}">REGULAR</a><a href="${href(tab, year, true)}" class="${po ? 'on' : ''}">PLAYOFFS</a></div>` : ''}
      </div>`;
    const noGames = !ctx.list.length;
    let body;
    if ((tab === 'leaders' || tab === 'players' || tab === 'teams') && noGames) {
      body = UI.empty('NO GAMES PLAYED YET', 'Sim a few days and the numbers will show up here. The rookie tracker already lists this season\'s rookies.',
        `<div class="row-btns"><a class="btn btn-gold" href="#/season">BACK TO THE HUB</a><a class="btn" href="${href('rookies', year, po)}">ROOKIES</a></div>`);
    } else if (tab === 'leaders') body = leadersHtml(ctx);
    else if (tab === 'players') body = playersHtml(ctx);
    else if (tab === 'rookies') body = rookiesHtml(ctx);
    else if (tab === 'teams') body = teamsHtml(ctx);
    else body = myHtml(ctx);
    app.innerHTML = `<div class="sc">
      <div class="sc-hero"><div class="sc-title"><small>${esc(kicker)}</small><h2>STATS CENTER</h2></div>${ctl}</div>
      <nav class="sc-tabs" aria-label="Stats sections">${tabs}</nav>
      <div class="sc-body" data-tab="${esc(tab)}">${body}</div></div>`;
    wire(app, ctx);
  };

  function wire(app, ctx) {
    const root = app.querySelector('.sc');
    if (!root) return;
    const sel = UI.$('#scSeason', root);
    if (sel) sel.addEventListener('change', () => { location.hash = href(ctx.tab, +sel.value, false); });
    const swap = (name, t) => { const tb = root.querySelector(`table[data-sc-t="${name}"]`); if (tb) { tb.tHead.innerHTML = t.head; tb.tBodies[0].innerHTML = t.body; } };
    // Sorting and paging redraw only the table rows, so a table scrolled sideways stays put.
    const redraw = {
      pl() { const t = playersTable(ctx); swap('pl', t); const pg = UI.$('#scPager', root); if (pg) pg.innerHTML = t.pager; },
      rk() { swap('rk', rookiesTable(ctx, rookieClass(ctx).cls)); },
      tm() { swap('tm', teamsTable(ctx)); },
      my() { swap('my', myTable(ctx, UI.userTeam())); }
    };
    function rerender(focusSel) {
      const y = window.scrollY;
      P.stats(app, argOf(ctx.tab, ctx.year, ctx.po));
      window.scrollTo(0, y);
      if (focusSel) { const el = app.querySelector(focusSel); if (el) el.focus({ preventScroll: true }); }
    }
    root.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || !root.contains(b)) return;
      const sortKey = b.getAttribute('data-sc-sort');
      if (sortKey) {
        const tb = b.closest('table[data-sc-t]');
        const name = tb && tb.getAttribute('data-sc-t');
        const st = V[name];
        if (!st || !redraw[name]) return;
        if (st.sort === sortKey) st.dir = -st.dir;
        else { st.sort = sortKey; st.dir = ASC.indexOf(sortKey) >= 0 ? 1 : -1; }
        if (name === 'pl') st.page = 0;
        redraw[name]();
        const again = root.querySelector(`table[data-sc-t="${name}"] [data-sc-sort="${sortKey}"]`);
        if (again) again.focus({ preventScroll: true });
        return;
      }
      const pg = b.getAttribute('data-sc-page');
      if (pg) {
        V.pl.page = Math.max(0, V.pl.page + Number(pg));
        redraw.pl();
        const box = root.querySelector('.sc-scroll');
        if (box && box.getBoundingClientRect().top < 0) window.scrollTo(0, window.scrollY + box.getBoundingClientRect().top - 90);
        return;
      }
      const pairs = [['data-sc-mode', v => { V.mode = v; V.pl.page = 0; }], ['data-sc-side', v => { V.tm.side = v; }],
        ['data-sc-split', v => { V.my.split = v; }], ['data-sc-rkview', v => { V.rk.view = v; }]];
      for (const [attr, set] of pairs) {
        const v = b.getAttribute(attr);
        if (v) { set(v); rerender(`[${attr}="${v}"]`); return; }
      }
    });
    root.addEventListener('change', e => {
      const el = e.target;
      const f = el.getAttribute('data-sc-f');
      if (f) { V.pl[f] = f === 'minG' ? Number(el.value) || 0 : el.value; V.pl.page = 0; redraw.pl(); return; }
      const rk = el.getAttribute('data-sc-rk');
      if (rk) { V.rk[rk] = rk === 'cls' ? Number(el.value) : el.value; rerender(`[data-sc-rk="${rk}"]`); }
    });
    const q = UI.$('#scQ', root);
    if (q) {
      let timer = null;
      q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { V.pl.q = q.value; V.pl.page = 0; redraw.pl(); }, 120); });
    }
  }
  // The old leaders route opens the same page.
  P.leaders = function (app, arg) { P.stats(app, 'leaders' + (arg ? '/' + arg : '')); };

  // For tests and other pages.
  UI.statsCenter = { rookieYear, draftInfo, draftText, pool, classYears, countGame, sync, teamRows };
})();
