// Draft Challenge, two players (#/challenge/vs): pick a season and a franchise each, take turns drafting
// five (snake order A B B A A B B A A B) on one phone, then the two fives meet in a best-of-five series,
// each playing all 48 minutes; positions and fit count. Logic in js/challenge.js (lineupFit, playVersus).
(function () {
  'use strict';
  const P = UI.pages, esc = UI.esc, C = window.CHALLENGE;
  if (!C || typeof P.challenge !== 'function') return;
  const KEY = 'a13-ch-vs';
  const ls = {
    get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  let VS = ls.get() || { year: 2008, teams: ['BOS', 'LAL'], names: ['', ''], cfg: null, pos: '', q: '' };
  const POS = ['PG', 'SG', 'SF', 'PF', 'C'];
  const lbl = y => (y - 1) + '-' + String(y).slice(2);
  const logo = (t, n) => UI.logoFor(t || { abbr: '?' }, n);
  const tOf = (teams, a) => teams.find(t => t.abbr === a) || { abbr: a, city: a, name: '', colors: ['#333', '#777'] };
  const tName = t => ((t.city || '') + ' ' + (t.name || '')).trim();
  const who = (i, teams) => VS.names[i] || ('PLAYER ' + (i + 1));

  function loadThen(app, year, fn) {
    if (C.loaded(year)) { fn(); return; }
    app.innerHTML = `<section class="ch-load"><div class="ch-spin-ring"></div><div>LOADING THE ${esc(lbl(year))} ROSTERS...</div></section>`;
    C.load(year).then(fn).catch(e => { app.innerHTML = UI.empty('ROSTERS DID NOT LOAD', esc(e.message || e), '<div class="row-btns"><a class="btn" href="#/challenge/vs">BACK</a></div>'); });
  }

  function setup(app) {
    loadThen(app, VS.year, () => {
      const d = C.seasonData(VS.year), teams = d.teams.slice().sort((a, b) => tName(a).localeCompare(tName(b)));
      VS.teams = VS.teams.map((a, i) => teams.some(t => t.abbr === a) ? a : teams[i].abbr);
      if (VS.teams[0] === VS.teams[1]) VS.teams[1] = teams.find(t => t.abbr !== VS.teams[0]).abbr;
      const grid = i => `<div class="ch-teams">${teams.map(t => `<button type="button" class="ch-team${VS.teams[i] === t.abbr ? ' on' : ''}" data-side="${i}" data-team="${esc(t.abbr)}"${VS.teams[1 - i] === t.abbr ? ' disabled' : ''} style="--c1:${esc(t.colors[0])}">${logo(t, 30)}<span>${esc(t.name)}</span></button>`).join('')}</div>`;
      app.innerHTML = `
        <section class="ch-hero"><div class="ch-hero-k">DRAFT CHALLENGE | TWO PLAYERS</div><h1 class="ch-hero-t">YOU VS ME.</h1>
          <p class="ch-hero-p">Pass the phone. Take turns drafting five from one season, then your fives play a best-of-five series. Nobody comes off the bench: all five play 48 minutes, so positions and fit matter.</p></section>
        <div class="ch-setup">
          <div class="ch-step"><div class="ch-step-k">1 | THE SEASON</div><div class="ch-chips ch-swipe">${C.SEASONS.map(s => `<button type="button" class="ch-chip${VS.year === s.year ? ' on' : ''}" data-year="${s.year}">${esc(s.label)}</button>`).join('')}</div></div>
          ${[0, 1].map(i => `<div class="ch-step"><div class="ch-step-k">${i + 2} | PLAYER ${i + 1}</div>
            <label class="field"><span>NAME</span><input data-name="${i}" maxlength="20" placeholder="Player ${i + 1}" value="${esc(VS.names[i] || '')}"></label>${grid(i)}</div>`).join('')}
          <div class="ch-go"><button type="button" class="btn btn-gold btn-big" id="vsStart">START THE DRAFT</button>
            ${VS.cfg ? '<a class="btn" href="#/challenge/vs/draft">BACK TO OUR DRAFT</a>' : ''}<a class="btn" href="#/challenge">ONE PLAYER</a></div>
        </div>`;
      UI.centerChips(app);
      const redraw = () => { ls.set(VS); setup(app); };
      app.querySelectorAll('[data-year]').forEach(b => b.addEventListener('click', () => { VS.year = +b.dataset.year; redraw(); }));
      app.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', () => { VS.teams[+b.dataset.side] = b.dataset.team; redraw(); }));
      app.querySelectorAll('[data-name]').forEach(inp => inp.addEventListener('input', () => { VS.names[+inp.dataset.name] = inp.value.trim(); ls.set(VS); }));
      UI.$('#vsStart').addEventListener('click', () => {
        VS.cfg = { mode: 'versus', year: VS.year, injuries: true, seed: Math.floor(Math.random() * 2147483646) + 1,
          sides: [0, 1].map(i => ({ team: VS.teams[i], name: VS.names[i] ? VS.names[i] + "'s " + tOf(teams, VS.teams[i]).name : '', picks: [] })) };
        VS.pos = ''; VS.q = ''; ls.set(VS);
        location.hash = '#/challenge/vs/draft';
      });
    });
  }

  function playerRow(p, teams, btn) {
    const t = tOf(teams, p.team);
    return `<li class="ch-pl"><span class="ch-pl-b"><b>${esc(p.name)}</b><small>${logo(t, 18)} ${esc(String(p.pos || '').replace(/-/g, '/'))}${p.age ? ' | ' + p.age : ''}</small></span>
      <b class="ch-ovr ${UI.ovrClass(p.ovr)}">${esc(p.ovr)}</b>${btn}</li>`;
  }

  function draft(app) {
    const cfg = VS.cfg;
    if (!cfg) { location.hash = '#/challenge/vs'; return; }
    loadThen(app, cfg.year, () => {
      const d = C.seasonData(cfg.year), teams = d.teams, byId = {};
      d.players.concat(d.free).forEach(p => { byId[p.id] = p; });
      const taken = cfg.sides[0].picks.concat(cfg.sides[1].picks), on = C.vsOnClock(cfg);
      const fives = cfg.sides.map((sd, i) => {
        const t = tOf(teams, sd.team), mine = sd.picks.map(id => byId[id]).filter(Boolean);
        return `<div class="vs-side${on === i ? ' on' : ''}" style="--c1:${esc(t.colors[0])}"><div class="vs-side-h">${logo(t, 36)}<div><small>${esc(who(i))}</small><b>${esc(sd.name || tName(t))}</b></div></div>
          <ol>${[0, 1, 2, 3, 4].map(k => `<li>${mine[k] ? esc(mine[k].name) + ' <b class="' + UI.ovrClass(mine[k].ovr) + '">' + esc(mine[k].ovr) + '</b>' : '<span class="muted">-</span>'}</li>`).join('')}</ol></div>`;
      }).join('');
      let body = '';
      if (on >= 0) {
        const q = (VS.q || '').toLowerCase();
        const list = d.players.filter(p => taken.indexOf(p.id) < 0 && (!VS.pos || C.primaryPos(p.pos) === VS.pos) && (!q || p.name.toLowerCase().indexOf(q) >= 0));
        body = `<div class="vs-clock">ON THE CLOCK: <b>${esc(who(on))}</b> <span class="muted">(pick ${taken.length + 1} of 10)</span></div>
          <div class="ch-filters">${[''].concat(POS).map(x => `<button type="button" class="ch-chip sm${VS.pos === x ? ' on' : ''}" data-pos="${x}">${x || 'ALL'}</button>`).join('')}
          <input id="vsQ" placeholder="Search players" value="${esc(VS.q || '')}" autocomplete="off"></div>
          <ul class="ch-list">${list.slice(0, 80).map(p => playerRow(p, teams, `<button type="button" class="btn btn-small btn-gold" data-add="${esc(p.id)}">TAKE</button>`)).join('')}</ul>`;
      } else body = `<div class="ch-ready"><div><b>BOTH FIVES ARE SET.</b><span class="muted"> Best of five, all five play 48 minutes.</span></div><button type="button" class="btn btn-gold btn-big" id="vsSim">TO THE SERIES</button></div>`;
      app.innerHTML = `<div class="ch-top"><div><div class="ch-top-k">${esc(lbl(cfg.year))} | TWO PLAYERS</div><div class="ch-top-t">THE DRAFT</div></div>
          <a class="btn btn-small" href="#/challenge/vs">SETUP</a></div>
        <div class="vs-sides vs-compact">${fives}</div>
        <div class="vs-fits">${cfg.sides.map((sd, i) => sd.picks.length ? UI.challengeFit(C.lineupFit(sd.picks.map(id => byId[id]).filter(Boolean)), { compact: true, title: (who(i) + "'s lineup").toUpperCase() }) : '').join('')}</div>${body}`;
      app.querySelectorAll('[data-pos]').forEach(b => b.addEventListener('click', () => { VS.pos = b.dataset.pos; ls.set(VS); draft(app); }));
      const qi = UI.$('#vsQ');
      if (qi) qi.addEventListener('input', () => { VS.q = qi.value; ls.set(VS); const pos = qi.selectionStart; draft(app); const n = UI.$('#vsQ'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } });
      app.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
        const i = C.vsOnClock(VS.cfg);
        if (i < 0) return;
        VS.cfg.sides[i].picks.push(b.dataset.add); VS.q = ''; ls.set(VS);
        draft(app); window.scrollTo(0, 0);
      }));
      const sim = UI.$('#vsSim');
      if (sim) sim.addEventListener('click', () => { VS.shown = 0; ls.set(VS); location.hash = '#/challenge/vs/result'; });
    });
  }

  // The series, one game at a time (VS.shown games revealed; the whole series is decided by the seed)
  function result(app) {
    const cfg = VS.cfg;
    if (!cfg || C.vsOnClock(cfg) >= 0) { location.hash = '#/challenge/vs' + (cfg ? '/draft' : ''); return; }
    loadThen(app, cfg.year, () => {
      let r;
      try { r = C.playVersus(cfg); } catch (e) { app.innerHTML = UI.empty('COULD NOT PLAY IT', esc(e.message || e), '<div class="row-btns"><a class="btn" href="#/challenge/vs">BACK</a></div>'); return; }
      const shown = Math.min(r.games.length, VS.shown || 0), done = shown >= r.games.length;
      const S = r.sides, idx = a => (a === S[0].abbr ? 0 : 1);
      const nm = i => cfg.sides[i].name || tName(S[i].team), whoA = a => who(idx(a));
      const w = shown ? r.games[shown - 1].wins : { [S[0].abbr]: 0, [S[1].abbr]: 0 };
      const P = {}; S.forEach(sd => sd.five.forEach(p => { P[p.id] = p; }));
      const score = `<div class="vs-score">${S.map((sd, i) => `<div class="vs-score-t${done && r.winner === sd.abbr ? ' won' : ''}" style="--c1:${esc((sd.team.colors || ['#333'])[0])}">${logo(sd.team, 40)}<span><small>${esc(who(i))}</small><b>${esc(nm(i))}</b></span><strong>${w[sd.abbr]}</strong></div>`).join('<i>-</i>')}</div>`;
      const head = done
        ? `<section class="vs-win" style="--c1:${esc((S[idx(r.winner)].team.colors || ['#333'])[0])}">${logo(S[idx(r.winner)].team, 64)}<div><div class="ch-hero-k">BEST OF FIVE</div>
            <h1>${esc(whoA(r.winner)).toUpperCase()} WINS ${r.wins[r.winner]}-${r.wins[r.winner === S[0].abbr ? S[1].abbr : S[0].abbr]}</h1>
            ${r.mvp ? `<p>Series MVP: <b>${esc(r.mvp.name)}</b> (${esc(r.mvp.line.pts + ' PTS, ' + r.mvp.line.reb + ' REB, ' + r.mvp.line.ast + ' AST')})</p>` : ''}</div></section>`
        : `<section class="vs-next"><div class="ch-hero-k">BEST OF FIVE | ${esc(lbl(cfg.year))}</div><h1>${shown ? 'GAME ' + (shown + 1) + ' IS NEXT' : 'THE SERIES'}</h1>
            <p class="muted">${esc(whoA(r.home))} has home court (games 1, 2 and 5). All ten players go the full 48.</p></section>`;
      const games = r.games.slice(0, shown).map(g => {
        const t = g.top && P[g.top.id];
        return `<li><span class="vs-g-n">GAME ${g.n}</span><span class="vs-g-s"><b class="${g.winner === g.away ? 'w' : ''}">${esc(whoA(g.away))} ${g.as}</b> @ <b class="${g.winner === g.home ? 'w' : ''}">${esc(whoA(g.home))} ${g.hs}</b>${g.ot ? ' <small>(' + (g.ot > 1 ? g.ot : '') + 'OT)</small>' : ''}</span>${t ? `<small class="muted">${esc(t.name)}: ${g.top.pts} pts, ${g.top.reb} reb, ${g.top.ast} ast</small>` : ''}</li>`;
      }).join('');
      const box = done ? `<section class="vs-box">${UI.header('SERIES BOX', 'Per game')}<div class="vs-sides">${S.map((sd, i) => `<div class="vs-res" style="--c1:${esc((sd.team.colors || ['#333'])[0])}"><div class="vs-side-h">${logo(sd.team, 32)}<div><small>${esc(who(i))}</small><b>${esc(nm(i))}</b></div></div>
          <table class="vs-tbl"><thead><tr><th class="l">PLAYER</th><th>SPOT</th><th>PTS</th><th>REB</th><th>AST</th><th>FG%</th></tr></thead><tbody>${sd.five.slice().sort((a, b) => C.SLOTS.indexOf(a.slot) - C.SLOTS.indexOf(b.slot)).map(p => { const l = r.lines[p.id] || {}; return `<tr><td class="l">${esc(p.name)}</td><td>${esc(p.slot || '')}</td><td>${l.pts != null ? l.pts : '-'}</td><td>${l.reb != null ? l.reb : '-'}</td><td>${l.ast != null ? l.ast : '-'}</td><td>${l.fgp != null ? l.fgp : '-'}</td></tr>`; }).join('')}</tbody></table></div>`).join('')}</div></section>` : '';
      app.innerHTML = `${head}${score}
        ${games ? `<ol class="vs-glist">${games}</ol>` : ''}
        <div class="row-btns center ch-acts">${done ? '<button type="button" class="btn btn-gold" id="vsAgain">RUN IT BACK</button><a class="btn" href="#/challenge/vs">NEW MATCHUP</a>'
          : `<button type="button" class="btn btn-gold btn-big" id="vsNext">PLAY GAME ${shown + 1}</button><button type="button" class="btn" id="vsAll">SIM THE REST</button>`}</div>
        ${box}
        <div class="vs-fits">${S.map((sd, i) => UI.challengeFit(sd.fit, { compact: true, title: (who(i) + "'s lineup").toUpperCase() })).join('')}</div>`;
      const go = n => { VS.shown = n; ls.set(VS); result(app); window.scrollTo(0, 0); };
      const nx = UI.$('#vsNext'); if (nx) nx.addEventListener('click', () => go(shown + 1));
      const al = UI.$('#vsAll'); if (al) al.addEventListener('click', () => go(r.games.length));
      const ag = UI.$('#vsAgain'); if (ag) ag.addEventListener('click', () => { VS.cfg.seed = Math.floor(Math.random() * 2147483646) + 1; go(0); });
    });
  }

  const base = P.challenge;
  P.challenge = function (app, arg) {
    const part = String(arg || '').split('/');
    if (part[0] !== 'vs') return base.apply(this, arguments);
    if (part[1] === 'draft') return draft(app);
    if (part[1] === 'result') return result(app);
    return setup(app);
  };
  Object.keys(base).forEach(k => { P.challenge[k] = base[k]; });
})();
