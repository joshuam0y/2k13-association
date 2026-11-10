// UI core: shared state, formatting helpers, headshots and logos, and adapters that read
// the league state (window.LEAGUE, docs/contract-v2.md) and the engine's season object.
(function () {
  'use strict';
  const UI = window.UI = window.UI || {};

  UI.state = {
    league: null,      // window.LEAGUE_2012 (the starting data)
    engine: null,      // window.ENGINE
    L: null,           // window.LEAGUE (the orchestrator)
    game: null,        // the league state from LEAGUE.newLeague: players, teams, season, events...
    slot: null,        // active save slot number
    save: null,        // save metadata { name, created, updated }
    ver: 0             // bumped whenever the state changes, for caches
  };
  // The engine season object always comes from the league state (it is replaced each new season).
  Object.defineProperty(UI.state, 'season', { get() { return this.game ? this.game.season : null; } });
  UI.canPlay = () => !!(UI.state.L && UI.state.engine);
  // The active league state, for pages added by other modules.
  UI.getState = UI.getLeagueState = () => UI.state.game;

  // ---------- DOM and text ----------
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  UI.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  UI.$ = (sel, root) => (root || document).querySelector(sel);
  UI.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  UI.toast = function (msg, kind) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(UI.toast._t);
    UI.toast._t = setTimeout(() => { el.className = 'toast'; }, kind === 'error' ? 6000 : 2800);
  };

  UI.header = (title, sub) =>
    `<div class="sec-head"><h2>${UI.esc(title)}</h2>${sub ? `<div class="sec-sub">${sub}</div>` : ''}</div>`;

  UI.empty = (title, body, actions) =>
    `<div class="empty"><div class="empty-title">${UI.esc(title)}</div><p>${body || ''}</p>${actions || ''}</div>`;

  // ---------- formatting ----------
  UI.fmtHt = inches => {
    const n = Number(inches);
    if (!n) return '-';
    return Math.floor(n / 12) + "'" + (Math.round(n) % 12) + '"';
  };
  UI.fmtMoney = d => {
    const n = Number(d);
    if (!n) return '-';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    return '$' + Math.round(n / 1e3) + 'K';
  };
  UI.fmtSeasonEnd = y => (y ? (y - 1) + '-' + String(y).slice(-2) : '-');
  UI.fmt1 = v => (v == null || isNaN(v) ? '-' : Number(v).toFixed(1));
  UI.fmtPct = v => {
    if (v == null || isNaN(v)) return '-';
    const x = Number(v) > 1 ? Number(v) / 100 : Number(v);
    return (x * 100).toFixed(1);
  };
  UI.fmtWinPct = (w, l) => {
    const g = w + l;
    if (!g) return '.000';
    const p = w / g;
    return p >= 1 ? '1.000' : '.' + String(Math.round(p * 1000)).padStart(3, '0');
  };
  // the arrow next to a rating: up or down since last season (development, form, injuries, mood); '' when it has not moved
  UI.mv = function (x) {
    const g = UI.state && UI.state.game;
    if (!g || !x) return '';
    const p = (x.id && g.players && g.players[x.id]) || (typeof x === 'string' ? g.players && g.players[x] : x);
    const m = p && p.ovrMove;
    if (!m || !m.d || m.year !== g.year) return '';
    return `<i class="mv ${m.d > 0 ? 'up' : 'down'}" title="${m.d > 0 ? 'Up' : 'Down'} ${Math.abs(m.d)} since last season">${Math.abs(m.d)}</i>`;
  };
  UI.ovrClass = o => (o >= 85 ? 'ovr-elite' : o >= 75 ? 'ovr-good' : o >= 65 ? 'ovr-mid' : 'ovr-low');

  // ---------- teams ----------
  const FA_TEAM = { abbr: 'FA', city: 'Free', name: 'Agents', conf: '', div: '', colors: ['#3a3a40', '#8a8a90'], logo: null };
  UI.teams = function () {
    const g = UI.state.game;
    if (g && g.teams) return Object.keys(g.teams).map(k => g.teams[k]);
    return (UI.state.league && UI.state.league.teams) || [];
  };
  UI.team = abbr => UI.teams().find(t => t.abbr === abbr) || (abbr === 'FA' ? FA_TEAM : { abbr: abbr || '?', city: abbr || '?', name: '', colors: ['#333', '#777'], logo: null });
  UI.teamColor = abbr => {
    const t = UI.team(abbr);
    return (t.colors && t.colors[0]) || '#555';
  };
  UI.teamName = abbr => {
    const t = UI.team(abbr);
    return (t.city + ' ' + t.name).trim();
  };

  // Seasons a new Association can open in. Other than 2012-13 they load data/start-YYYY.js on demand.
  UI.START_YEARS = [
    { year: 1977, label: '1976-77', note: 'The first season after the ABA merger', file: 'data/start-1977.js' },
    { year: 1978, label: '1977-78', note: 'The Bullets win it all', file: 'data/start-1978.js' },
    { year: 1979, label: '1978-79', note: 'The Sonics win the title', file: 'data/start-1979.js' },
    { year: 1980, label: '1979-80', note: 'Magic and Bird arrive', file: 'data/start-1980.js' },
    { year: 1981, label: '1980-81', note: "Bird's Celtics win it all", file: 'data/start-1981.js' },
    { year: 1982, label: '1981-82', note: "Magic's Lakers win it", file: 'data/start-1982.js' },
    { year: 1983, label: '1982-83', note: "Dr. J and Moses's Sixers win it", file: 'data/start-1983.js' },
    { year: 1984, label: '1983-84', note: 'The Celtics beat the Lakers', file: 'data/start-1984.js' },
    { year: 1985, label: '1984-85', note: "Jordan's rookie season", file: 'data/start-1985.js' },
    { year: 1986, label: '1985-86', note: 'The 67-win Celtics', file: 'data/start-1986.js' },
    { year: 1987, label: '1986-87', note: 'The Lakers win again', file: 'data/start-1987.js' },
    { year: 1988, label: '1987-88', note: 'The Lakers repeat', file: 'data/start-1988.js' },
    { year: 1989, label: '1988-89', note: 'The Pistons win their first', file: 'data/start-1989.js' },
    { year: 1990, label: '1989-90', note: 'The Pistons repeat', file: 'data/start-1990.js' },
    { year: 1991, label: '1990-91', note: "Jordan's first title", file: 'data/start-1991.js' },
    { year: 1992, label: '1991-92', note: 'The Dream Team summer', file: 'data/start-1992.js' },
    { year: 1993, label: '1992-93', note: "Jordan's three-peat", file: 'data/start-1993.js' },
    { year: 1994, label: '1993-94', note: 'The Rockets win it', file: 'data/start-1994.js' },
    { year: 1995, label: '1994-95', note: "Hakeem's Rockets repeat", file: 'data/start-1995.js' },
    { year: 1996, label: '1995-96', note: 'The 72-win Bulls', file: 'data/start-1996.js' },
    { year: 1997, label: '1996-97', note: "The Bulls again, Kobe's rookie year", file: 'data/start-1997.js' },
    { year: 1998, label: '1997-98', note: "Jordan's last title with the Bulls", file: 'data/start-1998.js' },
    { year: 1999, label: '1998-99', note: 'The lockout season, the Spurs win it (82 games here)', file: 'data/start-1999.js' },
    { year: 2000, label: '1999-00', note: "Shaq's MVP and the Lakers' first title together", file: 'data/start-2000.js' },
    { year: 2001, label: '2000-01', note: "Iverson's MVP year, the Lakers repeat", file: 'data/start-2001.js' },
    { year: 2002, label: '2001-02', note: 'The Lakers three-peat, Yao is drafted next', file: 'data/start-2002.js' },
    { year: 2003, label: '2002-03', note: "Duncan's second title, Yao's rookie year (generated contracts)", file: 'data/start-2003.js' },
    { year: 2004, label: '2003-04', note: "LeBron's rookie year", file: 'data/start-2004.js' },
    { year: 2005, label: '2004-05', note: 'The Bobcats arrive, Shaq goes to Miami', file: 'data/start-2005.js' },
    { year: 2006, label: '2005-06', note: "Kobe's 81-point season", file: 'data/start-2006.js' },
    { year: 2007, label: '2006-07', note: "Dirk's MVP year", file: 'data/start-2007.js' },
    { year: 2008, label: '2007-08', note: 'The new Big Three in Boston', file: 'data/start-2008.js' },
    { year: 2009, label: '2008-09', note: "LeBron's first MVP", file: 'data/start-2009.js' },
    { year: 2010, label: '2009-10', note: 'The Lakers go back to back', file: 'data/start-2010.js' },
    { year: 2011, label: '2010-11', note: "Dirk's title run", file: 'data/start-2011.js' },
    { year: 2012, label: '2011-12', note: "The Heat's first title", file: 'data/start-2012.js' },
    { year: 2013, label: '2012-13', note: 'The 2K13 rosters' },
    { year: 2014, label: '2013-14', note: "The Spurs' beautiful game", file: 'data/start-2014.js' },
    { year: 2015, label: '2014-15', note: "Curry's Warriors take off", file: 'data/start-2015.js' },
    { year: 2016, label: '2015-16', note: 'The 73-win Warriors', file: 'data/start-2016.js' },
    { year: 2017, label: '2016-17', note: 'KD joins the Warriors', file: 'data/start-2017.js' },
    { year: 2018, label: '2017-18', note: "LeBron's last Cleveland run", file: 'data/start-2018.js' },
    { year: 2019, label: '2018-19', note: 'Kawhi in Toronto', file: 'data/start-2019.js' },
    { year: 2020, label: '2019-20', note: 'LeBron and AD in L.A.', file: 'data/start-2020.js' },
    { year: 2021, label: '2020-21', note: 'Giannis and the Bucks', file: 'data/start-2021.js' },
    { year: 2022, label: '2021-22', note: "The Warriors' fourth ring", file: 'data/start-2022.js' },
    { year: 2023, label: '2022-23', note: 'Jokic and the Nuggets', file: 'data/start-2023.js' },
    { year: 2024, label: '2023-24', note: "The Celtics' 18th banner", file: 'data/start-2024.js' },
    { year: 2025, label: '2024-25', note: 'SGA and the Thunder', file: 'data/start-2025.js' },
    { year: 2026, label: '2025-26', note: 'Last season', file: 'data/start-2026.js' },
    { year: 2027, label: '2026-27', note: 'This season, as it opened', file: 'data/start-2027.js' }
  ];
  // Phones: a row of chips that swipes sideways (.ch-swipe) shows the chosen one in the middle
  UI.centerChips = function (root) {
    (root || document).querySelectorAll('.ch-swipe').forEach(row => {
      const on = row.querySelector('.ch-chip.on');
      if (on && row.scrollWidth > row.clientWidth) row.scrollLeft = on.offsetLeft - row.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
    });
  };
  // real-life mode's moves (data/real-moves.js, about 700 KB): loaded only for leagues that use it
  let realLoad = null;
  UI.loadRealMoves = function () {
    if (window.REAL_MOVES) return Promise.resolve(true);
    if (!realLoad) realLoad = new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'data/real-moves.js';
      sc.onload = () => (window.REAL_MOVES ? res(true) : rej(new Error('The real-life moves did not load.')));
      sc.onerror = () => { realLoad = null; rej(new Error('The real-life moves did not load. Check the connection and try again.')); };
      document.head.appendChild(sc);
    });
    return realLoad;
  };
  const startLoads = {};
  UI.loadStart = function (year) {
    year = +year;
    if (year === 2013 || (window.START_LEAGUES && window.START_LEAGUES[year])) return Promise.resolve(true);
    const info = UI.START_YEARS.find(s => s.year === year);
    if (!info || !info.file) return Promise.reject(new Error('This save started in ' + (year - 1) + '-' + String(year).slice(2) + ', which this version does not have.'));
    if (!startLoads[year]) startLoads[year] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = info.file;
      s.onload = () => (window.START_LEAGUES && window.START_LEAGUES[year] ? res(true) : rej(new Error('The ' + info.label + ' league data did not load.')));
      s.onerror = () => { delete startLoads[year]; rej(new Error('The ' + info.label + ' league data did not load. Check the connection and try again.')); };
      document.head.appendChild(s);
    });
    return startLoads[year];
  };
  // A logo from a team object (for teams outside the loaded league, like another start year's)
  // logos that are mostly black (the Brooklyn Nets, the Spurs) vanish on the dark page
  UI.darkLogo = t => !!t.logo && /logos\/(BKN|SAS)-/.test(t.logo);
  // a franchise's logo files (assets/logos), oldest first: older seasons with no logo of their own borrow the franchise's earliest one when the city matches
  UI.LOGO_FILES = {ATL: ['ATL-1996.svg', 'ATL-2008.png', 'ATL-2016.png', 'ATL-2021.svg'], BKN: ['BKN-2013.png', 'BKN-2025.svg'], BOS: ['BOS-1997.svg'], CHA: ['CHA-2005.svg', 'CHA-2013.png', 'CHA-2015.svg'], CHI: ['CHI-1967.svg'], CLE: ['CLE-2004.svg', 'CLE-2011.png', 'CLE-2018.png', 'CLE-2023.svg'], DAL: ['DAL-2002.png', 'DAL-2018.svg'], DEN: ['DEN-2009.png', 'DEN-2019.svg'], DET: ['DET-2002.svg', 'DET-2006.png', 'DET-2018.svg'], GSW: ['GSW-1998.svg', 'GSW-2011.png', 'GSW-2020.svg'], HOU: ['HOU-2004.png', 'HOU-2020.png', 'HOU-2027.svg'], IND: ['IND-1991.svg', 'IND-2006.png', 'IND-2018.svg'], LAC: ['LAC-1985.svg', 'LAC-2011.png', 'LAC-2016.png', 'LAC-2025.svg'], LAL: ['LAL-2002.svg'], MEM: ['MEM-2005.png', 'MEM-2019.svg'], MIA: ['MIA-2000.svg'], MIL: ['MIL-1994.svg', 'MIL-2007.png', 'MIL-2016.svg'], MIN: ['MIN-1997.svg', 'MIN-2009.png', 'MIN-2018.png', 'MIN-2027.svg'], NJN: ['NJN-1998.svg'], NOH: ['NOH-2003.svg', 'NOH-2009.png', 'NOH-2014.png', 'NOH-2024.svg'], NYK: ['NYK-2012.svg'], OKC: ['OKC-2009.svg'], ORL: ['ORL-2001.svg', 'ORL-2011.png', 'ORL-2026.svg'], PHI: ['PHI-1998.svg', 'PHI-2010.png', 'PHI-2016.svg'], PHX: ['PHX-2001.png', 'PHX-2014.svg'], POR: ['POR-2003.svg', 'POR-2005.png', 'POR-2018.svg'], SAC: ['SAC-1995.png', 'SAC-2017.svg'], SAS: ['SAS-2003.png', 'SAS-2018.svg'], SEA: ['SEA-2002.svg'], TOR: ['TOR-1996.svg', 'TOR-2009.png', 'TOR-2016.png', 'TOR-2021.svg'], UTA: ['UTA-1997.svg', 'UTA-2005.svg', 'UTA-2011.png', 'UTA-2017.png', 'UTA-2023.png', 'UTA-2026.svg'], WAS: ['WAS-1998.svg', 'WAS-2008.svg', 'WAS-2012.png', 'WAS-2016.svg']};
  // the full name has to match too: a Washington Bullets team must not wear the Wizards logo
  UI.LOGO_CITY = {ATL: /^Atlanta Hawks$/, BKN: /^(New Jersey|Brooklyn) Nets$/, CHA: /^Charlotte (Bobcats|Hornets)$/, CHI: /^Chicago Bulls$/, CLE: /^Cleveland Cavaliers$/, DAL: /^Dallas Mavericks$/, DEN: /^Denver Nuggets$/, DET: /^Detroit Pistons$/, GSW: /^(Golden State|San Francisco) Warriors$/, HOU: /^Houston Rockets$/, IND: /^Indiana Pacers$/, LAC: /^Los Angeles Clippers$/, LAL: /^Los Angeles Lakers$/, MEM: /^Memphis Grizzlies$/, MIA: /^Miami Heat$/, MIL: /^Milwaukee Bucks$/, MIN: /^Minnesota Timberwolves$/, NOH: /^New Orleans (Hornets|Pelicans)$/, NJN: /^New Jersey Nets$/, NYK: /^New York Knicks$/, OKC: /^Oklahoma City Thunder$/, ORL: /^Orlando Magic$/, PHI: /^Philadelphia 76ers$/, PHX: /^Phoenix Suns$/, POR: /^Portland Trail Blazers$/, SAC: /^Sacramento Kings$/, SAS: /^San Antonio Spurs$/, SEA: /^Seattle SuperSonics$/, TOR: /^Toronto Raptors$/, UTA: /^Utah Jazz$/, WAS: /^Washington Wizards$/};
  // a logo for any team in any season: its own file, a historic one (data/team-logos.js, by city and name), or the franchise's earliest
  // file for the three marks that have hardly changed (Celtics, Bulls, Knicks); never a modern logo on a different-looking old team
  const STABLE_MARK = { BOS: 1, CHI: 1, NYK: 1 };
  UI.logoSrc = t => {
    if (t.logo) return t.logo;
    const full = ((t.city || '') + ' ' + (t.name || '')).trim();
    if (window.TEAM_LOGOS && window.TEAM_LOGOS[full]) return window.TEAM_LOGOS[full];
    const list = UI.LOGO_FILES[t.abbr];
    return STABLE_MARK[t.abbr] && list && list.length && UI.LOGO_CITY[t.abbr] && UI.LOGO_CITY[t.abbr].test(full) ? 'assets/logos/' + list[0] : '';
  };
  UI.logoFor = function (t, size) {
    const c1 = (t.colors && t.colors[0]) || '#333';
    const c2 = (t.colors && t.colors[1]) || '#999';
    const style = `--c1:${c1};--c2:${c2};--sz:${size || 40}px`;
    const src0 = UI.logoSrc(t), t0 = src0 === t.logo ? t : Object.assign({}, t, { logo: src0 });
    t = t0;
    const img = t.logo ? `<img src="${UI.esc(t.logo)}" alt="" loading="lazy"${t.logoNoRef || /wikia|nocookie/.test(t.logo) ? ' referrerpolicy="no-referrer"' : ''} onerror="this.parentNode.classList.add('nologo');this.remove()">` : '';
    return `<span class="logo${t.logo ? '' : ' nologo'}${UI.darkLogo(t) ? ' dark' : ''}" style="${style}" title="${UI.esc(((t.city || '') + ' ' + (t.name || '')).trim())}">${img}<b>${UI.esc(t.abbr)}</b></span>`;
  };

  UI.logo = function (abbr, size) {
    const t = UI.team(abbr);
    const c1 = (t.colors && t.colors[0]) || '#333';
    const c2 = (t.colors && t.colors[1]) || '#999';
    const style = `--c1:${c1};--c2:${c2};--sz:${size || 40}px`;
    const img = t.logo ? `<img src="${UI.esc(t.logo)}" alt="" loading="lazy"${t.logoNoRef || /wikia|nocookie/.test(t.logo) ? ' referrerpolicy="no-referrer"' : ''} onerror="this.parentNode.classList.add('nologo');this.remove()">` : '';
    return `<span class="logo${t.logo ? '' : ' nologo'}${UI.darkLogo(t) ? ' dark' : ''}" style="${style}" title="${UI.esc(UI.teamName(abbr))}">${img}<b>${UI.esc(t.abbr)}</b></span>`;
  };

  // ---------- headshots ----------
  UI.faceSvg = function (color) {
    const c = color || '#555';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 190"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".95"/><stop offset="1" stop-color="${c}" stop-opacity=".55"/></linearGradient></defs><circle cx="130" cy="78" r="44" fill="url(#g)"/><path d="M42 190c4-52 42-80 88-80s84 28 88 80z" fill="url(#g)"/></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  };
  // ---------- faces: the NBA's headshot, else Basketball-Reference's, else a face drawn for him ----------
  // Real players have Basketball-Reference ids (jamesle01); a pool key (jamesle01@2013) is the same man.
  const brId = p => { const id = String((p && (p.base || p.id)) || '').split('@')[0]; return /^[a-z]{2,7}\d{2}$/.test(id) ? id : ''; };
  UI.brHeadshot = p => { const id = brId(p); return id ? 'https://www.basketball-reference.com/req/202106291/images/headshots/' + id + '.jpg' : ''; };
  // A generated face, the same every time for the same player (seeded by his id or name): skin, head shape,
  // hair, brows, eyes, nose, mouth, facial hair and a jersey in the team color, on the NBA headshot canvas.
  const FACES = {};
  const SKIN = ['#3a2117', '#4a2b1c', '#573421', '#653e28', '#734a31', '#83563a', '#946446', '#a97752', '#bf8d65', '#d4a47c', '#e3b993', '#efcfae'];
  UI.faceGen = function (seed, c1, c2) {
    const key = seed + '|' + c1 + '|' + c2;
    if (FACES[key]) return FACES[key];
    let h = 2166136261;
    for (const ch of String(seed || 'x')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const rnd = () => { h += 0x6D2B79F5; let x = h; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const pick = a => a[Math.floor(rnd() * a.length)];
    const col = c1 || '#555', trim = c2 || '#ddd';
    const si = Math.min(SKIN.length - 1, Math.floor(Math.pow(rnd(), 1.35) * SKIN.length)), skin = SKIN[si];
    const shade = 'rgba(0,0,0,.18)';
    const hairC = si >= 9 && rnd() < 0.35 ? pick(['#5a3a1f', '#8a5a2b', '#b8894a']) : pick(['#0e0a07', '#16100b', '#22160e', '#2e1d12']);
    const cx = 130, cy = 80, rx = 31 + rnd() * 8, ry = 41 + rnd() * 7, jaw = 0.82 + rnd() * 0.14;
    const top = cy - ry, eyeY = cy - 4 + rnd() * 4, gap = 13 + rnd() * 4;
    const headPath = `M${cx - rx},${cy - 6} C${cx - rx},${top - 4} ${cx + rx},${top - 4} ${cx + rx},${cy - 6} C${cx + rx},${cy + ry * 0.55} ${cx + rx * jaw * 0.55},${cy + ry} ${cx},${cy + ry} C${cx - rx * jaw * 0.55},${cy + ry} ${cx - rx},${cy + ry * 0.55} ${cx - rx},${cy - 6} Z`;
    const style = pick(['bald', 'buzz', 'buzz', 'short', 'short', 'fade', 'fade', 'afro', 'twists', 'cornrows', 'locs', 'flat']);
    let back = '', front = '';
    if (style === 'afro') back = `<ellipse cx="${cx}" cy="${top + 22}" rx="${rx + 14}" ry="${ry * 0.78}" fill="${hairC}"/>`;
    if (style === 'locs') back = `<path d="M${cx - rx - 6},${cy - 10} Q${cx - rx - 10},${cy + 40} ${cx - rx + 2},${cy + 52} L${cx + rx - 2},${cy + 52} Q${cx + rx + 10},${cy + 40} ${cx + rx + 6},${cy - 10} Z" fill="${hairC}"/>`;
    const cap = (dy, op) => `<path d="M${cx - rx - 1},${cy - 4 + dy} C${cx - rx - 2},${top - 8} ${cx + rx + 2},${top - 8} ${cx + rx + 1},${cy - 4 + dy} C${cx + rx * 0.6},${top + 10} ${cx - rx * 0.6},${top + 10} ${cx - rx - 1},${cy - 4 + dy} Z" fill="${hairC}" opacity="${op}"/>`;
    if (style === 'buzz') front = cap(-12, 0.55);
    if (style === 'short' || style === 'fade' || style === 'afro' || style === 'locs') front = cap(style === 'fade' ? -14 : -8, style === 'fade' ? 0.9 : 1);
    if (style === 'fade') front += `<path d="M${cx - rx},${cy - 14} Q${cx - rx + 2},${cy - 2} ${cx - rx + 3},${cy + 4}" stroke="${hairC}" stroke-width="5" opacity=".35" fill="none"/><path d="M${cx + rx},${cy - 14} Q${cx + rx - 2},${cy - 2} ${cx + rx - 3},${cy + 4}" stroke="${hairC}" stroke-width="5" opacity=".35" fill="none"/>`;
    if (style === 'twists') { front = cap(-8, 1); for (let i = 0; i < 9; i++) { const x = cx - rx + 4 + i * (rx * 2 - 8) / 8; front += `<circle cx="${x}" cy="${top + 2 + (i % 2) * 3}" r="5.5" fill="${hairC}"/>`; } }
    if (style === 'cornrows') { front = cap(-10, 0.95); for (let i = -3; i <= 3; i++) front += `<path d="M${cx + i * 8},${top + 1} Q${cx + i * 10},${top + 18} ${cx + i * 11},${cy - 14}" stroke="rgba(255,255,255,.12)" stroke-width="1.4" fill="none"/>`; }
    if (style === 'flat') front = `<path d="M${cx - rx + 3},${top + 12} L${cx - rx + 6},${top - 10} Q${cx},${top - 15} ${cx + rx - 6},${top - 10} L${cx + rx - 3},${top + 12} Z" fill="${hairC}"/>` + cap(-10, 1);
    const band = rnd() < 0.12 ? `<rect x="${cx - rx - 1}" y="${top + 10}" width="${rx * 2 + 2}" height="7" rx="3" fill="${rnd() < 0.5 ? col : '#f4f4f4'}"/>` : '';
    const browW = 2.6 + rnd() * 2.2, tilt = -2 + rnd() * 4;
    const brow = s => `<path d="M${cx + s * (gap - 7)},${eyeY - 8 + tilt * 0.3} Q${cx + s * gap},${eyeY - 11} ${cx + s * (gap + 8)},${eyeY - 8 - tilt * 0.3}" stroke="${hairC}" stroke-width="${browW}" stroke-linecap="round" fill="none"/>`;
    const eye = s => `<ellipse cx="${cx + s * gap}" cy="${eyeY}" rx="5.2" ry="${2.6 + rnd() * 0.9}" fill="#f4efe6"/><circle cx="${cx + s * gap}" cy="${eyeY + 0.2}" r="2.5" fill="#1b120c"/><path d="M${cx + s * (gap - 5.5)},${eyeY - 1.5} Q${cx + s * gap},${eyeY - 4.6} ${cx + s * (gap + 5.5)},${eyeY - 1.5}" stroke="rgba(0,0,0,.45)" stroke-width="1.2" fill="none"/>`;
    const nw = 6 + rnd() * 4, ny = eyeY + 18 + rnd() * 4;
    const nose = `<path d="M${cx - 1},${eyeY + 4} L${cx - 3},${ny - 3}" stroke="${shade}" stroke-width="1.6" fill="none"/><path d="M${cx - nw},${ny} Q${cx},${ny + 5} ${cx + nw},${ny}" stroke="rgba(0,0,0,.35)" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    const my = ny + 12 + rnd() * 3, mw = 9 + rnd() * 4, smile = rnd() * 3 - 0.6;
    const mouth = `<path d="M${cx - mw},${my} Q${cx},${my + smile} ${cx + mw},${my}" stroke="#3a1f17" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M${cx - mw + 3},${my + 3.5} Q${cx},${my + 6} ${cx + mw - 3},${my + 3.5}" stroke="rgba(0,0,0,.12)" stroke-width="2" fill="none"/>`;
    const fh = pick(['none', 'none', 'stubble', 'goatee', 'beard', 'beard', 'stache']);
    let hair2 = '';
    if (fh === 'stubble') hair2 = `<path d="M${cx - rx + 4},${cy + 6} C${cx - rx + 6},${cy + ry} ${cx + rx - 6},${cy + ry} ${cx + rx - 4},${cy + 6} C${cx + rx * 0.5},${cy + ry * 0.8} ${cx - rx * 0.5},${cy + ry * 0.8} ${cx - rx + 4},${cy + 6} Z" fill="${hairC}" opacity=".28"/>`;
    if (fh === 'beard') hair2 = `<path d="M${cx - rx + 1},${cy - 2} C${cx - rx + 2},${cy + ry + 4} ${cx + rx - 2},${cy + ry + 4} ${cx + rx - 1},${cy - 2} L${cx + rx - 6},${cy + 8} C${cx + mw + 6},${my + 10} ${cx - mw - 6},${my + 10} ${cx - rx + 6},${cy + 8} Z" fill="${hairC}" opacity=".92"/><path d="M${cx - mw - 2},${my - 4} Q${cx},${my - 9} ${cx + mw + 2},${my - 4}" stroke="${hairC}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    if (fh === 'goatee') hair2 = `<path d="M${cx - mw + 1},${my + 4} Q${cx},${my + 20} ${cx + mw - 1},${my + 4} Q${cx},${my + 9} ${cx - mw + 1},${my + 4} Z" fill="${hairC}" opacity=".9"/><path d="M${cx - mw},${my - 4} Q${cx},${my - 8} ${cx + mw},${my - 4}" stroke="${hairC}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    if (fh === 'stache') hair2 = `<path d="M${cx - mw - 1},${my - 3} Q${cx},${my - 9} ${cx + mw + 1},${my - 3}" stroke="${hairC}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    const ear = s => `<ellipse cx="${cx + s * (rx + 1)}" cy="${eyeY + 6}" rx="5" ry="9" fill="${skin}"/><ellipse cx="${cx + s * (rx + 1)}" cy="${eyeY + 6}" rx="2.2" ry="5" fill="${shade}"/>`;
    const neckW = 17 + rnd() * 5;
    const body = `<path d="M${cx - neckW},${cy + ry - 14} L${cx - neckW - 2},${150} L${cx + neckW + 2},${150} L${cx + neckW},${cy + ry - 14} Z" fill="${skin}"/><path d="M${cx - neckW},${cy + ry - 4} Q${cx},${cy + ry + 8} ${cx + neckW},${cy + ry - 4} L${cx + neckW},${cy + ry + 4} Q${cx},${cy + ry + 14} ${cx - neckW},${cy + ry + 4} Z" fill="${shade}"/>
      <path d="M26,190 C28,158 62,143 ${cx - neckW - 4},139 L${cx + neckW + 4},139 C198,143 232,158 234,190 Z" fill="${skin}"/>
      <path d="M64,190 C66,166 80,150 ${cx - neckW - 9},145 Q${cx},${172} ${cx + neckW + 9},145 C180,150 194,166 196,190 Z" fill="${col}" stroke="${trim}" stroke-width="4"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 190"><g transform="translate(130 182) scale(1.15) translate(-130 -182)">${back}${body}${ear(-1)}${ear(1)}<path d="${headPath}" fill="${skin}"/><path d="${headPath}" fill="url(#sh)" opacity=".5"/>
      <defs><radialGradient id="sh" cx=".38" cy=".32" r=".8"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs>
      ${hair2}${front}${band}${brow(-1)}${brow(1)}${eye(-1)}${eye(1)}${nose}${mouth}</g></svg>`;
    return (FACES[key] = 'data:image/svg+xml,' + encodeURIComponent(svg));
  };
  const faceSeed = p => String((p && (brId(p) || p.base || p.id || p.name)) || 'x').split('@')[0];
  UI.faceFor = (p, color) => UI.faceGen(faceSeed(p) + (p && p.name ? '|' + p.name : ''), color, '#e9e9e9');
  // the next picture to try when one does not load: the Basketball-Reference photo, then the drawn face
  UI.faceFallback = function (img) {
    const br = img.getAttribute('data-br');
    if (br && img.getAttribute('src') !== br) { img.src = br; img.classList.add('hs-br'); return; }
    img.onerror = null;
    img.src = UI.faceGen(img.getAttribute('data-seed') || 'x', img.getAttribute('data-c'), '#e9e9e9');
    img.classList.remove('hs-br');
    img.classList.add('hs-gen');
  };
  // one <img> for any player: tries the NBA headshot, the Basketball-Reference photo, then the drawn face
  UI.faceImg = function (p, color, cls) {
    const k = 'hs ' + (cls || ''), c = color || '#444', br = UI.brHeadshot(p), seed = faceSeed(p) + (p && p.name ? '|' + p.name : '');
    const nba = p && p.nbaId ? `https://cdn.nba.com/headshots/nba/latest/260x190/${p.nbaId}.png` : (p && p.face) || '';
    const first = nba || br;
    if (!first) return `<img class="${k} hs-gen" src="${UI.faceGen(seed, c, '#e9e9e9')}" alt="">`;
    return `<img class="${k}${!nba ? ' hs-br' : ''}" src="${UI.esc(first)}" data-br="${nba ? UI.esc(br) : ''}" data-seed="${UI.esc(seed)}" data-c="${UI.esc(c)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="UI.faceFallback(this)">`;
  };
  UI.headshot = function (p, cls) { return UI.faceImg(p, UI.teamColor(p.team), cls); };

  // ---------- players ----------
  // With a league loaded, everyone lives in state.players (NBA, free agents, retired, draft prospects).
  // Before that, the starting data in LEAGUE_2012 is shown.
  UI.player = function (id) {
    const g = UI.state.game;
    if (g && g.players) return g.players[id] || null;
    const L = UI.state.league;
    const base = L && L.players.find(p => p.id === id);
    if (base) return base;
    // Draft prospects before a league exists.
    const D = window.DRAFTS;
    if (D) for (const y of Object.keys(D)) { const p = D[y].find(x => x.id === id); if (p) return Object.assign({ team: 'DRAFT' }, p); }
    return null;
  };
  UI.allPlayers = function () {
    const g = UI.state.game;
    if (g && g.players) return Object.keys(g.players).map(k => g.players[k]);
    return (UI.state.league && UI.state.league.players) || [];
  };
  const active = p => p && !p.retired && p.team !== 'DRAFT';
  UI.roster = function (abbr) {
    return UI.allPlayers().filter(p => active(p) && p.team === abbr).sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
  };
  UI.teamOvr = function (abbr) {
    const r = UI.roster(abbr).filter(p => !p.gleague && !(p.stashedUntil && UI.state.game && p.stashedUntil > UI.state.game.year)).slice(0, 8);
    if (!r.length) return 0;
    const w = [1.6, 1.4, 1.3, 1.2, 1.1, 0.8, 0.7, 0.6];
    let s = 0, ws = 0;
    r.forEach((p, i) => { s += (p.ovr || 0) * w[i]; ws += w[i]; });
    return Math.round(s / ws);
  };
  UI.year = () => (UI.state.game ? UI.state.game.year : (UI.state.league && UI.state.league.season) || 2013);
  // Install as an app: Chrome and Android offer a prompt (beforeinstallprompt); iPhone needs Share, then Add to
  // Home Screen. Nothing shows once it runs installed.
  let installEvt = null;
  const standalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; const el = document.getElementById('mmInstall'); if (el) el.innerHTML = UI.installButton(); });
  window.addEventListener('appinstalled', () => { installEvt = null; const el = document.getElementById('mmInstall'); if (el) el.innerHTML = ''; });
  UI.installButton = function () {
    if (standalone()) return '';
    if (installEvt) return '<button type="button" class="btn btn-small mm-inst" onclick="UI.install()">INSTALL THE APP</button>';
    if (isIOS()) return '<span class="mm-inst-tip">Play it like an app: tap Share, then <b>Add to Home Screen</b>.</span>';
    return '';
  };
  UI.install = async function () {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch (e) { /* closed */ }
    installEvt = null;
    const el = document.getElementById('mmInstall'); if (el) el.innerHTML = UI.installButton();
  };
  UI.seasonLabel = y => (y - 1) + '-' + String(y).slice(-2);
  // Salary this season and the last season of the deal, from contract.salaries when present.
  UI.salaryOf = function (p) {
    const c = p && p.contract;
    if (c && Array.isArray(c.salaries) && c.salaries.length) {
      const y = UI.year();
      const cur = c.salaries.find(s => s.year === y) || c.salaries[0];
      return cur.amount;
    }
    return p ? p.salary : 0;
  };
  UI.contractEndOf = function (p) {
    const c = p && p.contract;
    if (c && Array.isArray(c.salaries) && c.salaries.length) return c.salaries[c.salaries.length - 1].year;
    if (UI.state.game && p && p.team === 'FA') return null;
    return p ? p.contractEnd : null;
  };
  UI.contractNote = function (p) {
    const c = p && p.contract;
    if (!c) return '';
    const bits = [];
    const opts = Array.isArray(c.options) && c.options.length ? c.options : c.option ? [c.option] : [];
    opts.forEach(o => { if (o && o.type) bits.push((o.type === 'eto' ? 'ETO' : o.type === 'player' ? 'Player option' : 'Team option') + ' ' + UI.seasonLabel(o.year)); });
    if (c.rookie) bits.push('Rookie scale');
    if (c.twoWay) bits.push('Two-way');
    return bits.join(', ');
  };
  // Current injury: the season's injury table during a season, else the player's own field.
  UI.injuryOf = function (p) {
    if (!p) return null;
    const s = UI.state.season;
    if (s && s.injuries && s.injuries[p.id]) return s.injuries[p.id];
    if (p.injury && (p.injury.games == null || p.injury.games > 0) && (!s || p.injury.type === 'Playing overseas')) return p.injury;
    return null;
  };
  UI.injuryBadge = function (p) {
    const inj = UI.injuryOf(p);
    let out = '';
    const t = p && UI.state.game && UI.state.game.teams && UI.state.game.teams[p.team];
    const hurt = inj && inj.hurt && inj.games > 0 && inj.games < 900 && !(t && t.playHurt === false);
    if (inj && hurt) out += `<span class="badge badge-hurt" title="${UI.esc((inj.type || 'Injured') + ': playing through it, ' + inj.hurt + ' overall for about ' + inj.games + ' more games')}">HURT -${inj.hurt}</span>`;
    else if (inj) out += `<span class="badge badge-inj" title="${UI.esc((inj.type || 'Injured') + (inj.type !== 'Playing overseas' ? ': out' : ''))}">${inj.type === 'Playing overseas' ? 'OVERSEAS' : 'OUT' + (inj.games && inj.games < 900 ? ' ' + inj.games + 'G' : ' SEASON')}</span>`;
    // in-season form, like 2K: his change since opening night
    if (p && p.form && UI.state.season && UI.state.season.phase !== 'done') out += ` <span class="badge badge-form ${p.form > 0 ? 'up' : 'down'}" title="In-season form: ${p.form > 0 ? '+' : ''}${p.form} overall since opening night (how he is playing for his rating, and his mood)">${p.form > 0 ? '&#9650;+' : '&#9660;'}${p.form}</span>`;
    if (p && p.gleague) out += ' <span class="badge badge-dim">G LEAGUE</span>';
    if (p && p.contract && p.contract.twoWay) out += ' <span class="badge badge-dim">TWO-WAY</span>';
    return out;
  };

  // ---------- season adapters (engine season object, contract.md) ----------
  const abbrOf = x => (x == null ? null : typeof x === 'string' ? x : (x.abbr || x.team || x.id || null));
  UI.abbrOf = abbrOf;

  // Every game of the season, flattened from season.days; result is the stored box score.
  let gcache = { ver: -1 };
  UI.games = function () {
    const s = UI.state.season;
    if (!s) return [];
    if (gcache.ver === UI.state.ver && gcache.season === s) return gcache.list;
    const list = [];
    (s.days || []).forEach((d, i) => (d.games || []).forEach(g => {
      list.push({
        id: String(g.id), day: i, date: d.date || null, playoff: !!d.playoff,
        home: g.home, away: g.away, played: !!g.played,
        hs: g.hs, as: g.as, series: g.series || null, gameNum: g.gameNum || null, real: !!g.real,
        get result() { return (s.boxScores && s.boxScores[g.id]) || null; }
      });
    }));
    gcache = { ver: UI.state.ver, season: s, list };
    return list;
  };
  UI.game = id => UI.games().find(g => g.id === String(id)) || null;
  UI.currentDay = () => { const s = UI.state.season; return s ? s.day || 0 : 0; };
  UI.regularDays = () => { const s = UI.state.season; return s && s.days ? s.days.filter(d => !d.playoff).length : 0; };
  UI.lastDay = () => { const n = UI.regularDays(); return n ? n - 1 : null; };
  UI.regularSeasonDone = () => { const s = UI.state.season; return !!s && s.phase !== 'regular'; };
  UI.userTeam = () => (UI.state.game && UI.state.game.userTeam) || null;
  UI.dateLabel = function (iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  UI.gameDay = g => (g.date ? UI.dateLabel(g.date).replace(/, \d{4}$/, '') : 'Day ' + (g.day + 1));

  // Standings rows from season.standings.
  let scache = { ver: -1 };
  UI.standings = function () {
    if (scache.ver === UI.state.ver && scache.season === UI.state.season) return scache.rows;
    const st = (UI.state.season && UI.state.season.standings) || {};
    const rows = {};
    UI.teams().forEach(t => {
      const x = st[t.abbr] || {};
      const w = x.w || 0, l = x.l || 0;
      const streak = typeof x.streak === 'number' ? (x.streak > 0 ? 'W' + x.streak : x.streak < 0 ? 'L' + (-x.streak) : '-') : (x.streak || '-');
      const l10 = Array.isArray(x.last10) && x.last10.length ? x.last10.filter(v => v).length + '-' + x.last10.filter(v => !v).length : '-';
      rows[t.abbr] = {
        abbr: t.abbr, conf: t.conf, div: t.div, w, l, pct: w + l ? w / (w + l) : 0,
        hw: (x.home || [0, 0])[0], hl: (x.home || [0, 0])[1], aw: (x.away || [0, 0])[0], al: (x.away || [0, 0])[1],
        diff: (x.pf || 0) - (x.pa || 0), streakText: streak, l10
      };
    });
    scache = { ver: UI.state.ver, season: UI.state.season, rows };
    return rows;
  };
  UI.confTable = function (conf) {
    const rows = Object.values(UI.standings()).filter(r => r.conf === conf)
      .sort((a, b) => b.pct - a.pct || b.diff - a.diff || a.abbr.localeCompare(b.abbr));
    const lead = rows[0];
    rows.forEach((r, i) => {
      r.rank = i + 1;
      const gb = lead ? ((lead.w - r.w) + (r.l - lead.l)) / 2 : 0;
      r.gb = gb === 0 ? '-' : (gb % 1 ? gb.toFixed(1) : String(gb));
    });
    return rows;
  };
  UI.record = abbr => {
    const r = UI.standings()[abbr];
    return r ? r.w + '-' + r.l : '0-0';
  };

  // Player season totals (season.playerStats, or season.playoffStats).
  UI.seasonTotals = function (playoffs) {
    const s = UI.state.season;
    return (s && (playoffs ? s.playoffStats : s.playerStats)) || {};
  };
  UI.perGame = function (t) {
    if (!t || !t.g) return null;
    const g = t.g;
    const reb = t.reb != null ? t.reb : (t.oreb || 0) + (t.dreb || 0);
    return {
      g, mpg: t.min / g, pts: t.pts / g, reb: reb / g, ast: t.ast / g, stl: t.stl / g, blk: t.blk / g,
      fgp: t.fga ? t.fgm / t.fga : null, tpp: t.tpa ? t.tpm / t.tpa : null, ftp: t.fta ? t.ftm / t.fta : null,
      // tracked since plus-minus, triple-doubles and guarded shots were added (null on older seasons)
      pm: t.pm != null ? t.pm / g : null, td: t.td != null ? t.td : null, ofg: t.dfga ? t.dfgm / t.dfga : null
    };
  };

  // Game log for a player from the stored box scores.
  UI.gameLog = function (pid) {
    const out = [];
    UI.games().forEach(g => {
      if (!g.played) return;
      const r = g.result;
      if (!r) return;
      ['home', 'away'].forEach(side => {
        const box = r[side] && r[side].box;
        const row = Array.isArray(box) && box.find(x => x && x.id === pid);
        if (row) out.push({ game: g, side, row });
      });
    });
    return out.sort((a, b) => b.game.day - a.game.day);
  };

  UI.bump = () => { UI.state.ver++; };
})();
