// Draft Challenge, two players (#/challenge/vs): pick a season and a franchise each, take turns drafting
// five (snake order A B B A A B B A A B) on one phone, then both teams play the same season and finish
// with a best-of-seven showdown against each other. Logic in js/challenge.js (buildYear sides, playVersus).
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
          <p class="ch-hero-p">Pass the phone. Take turns drafting five from one season, then both teams play it out in the same league and finish with a best-of-seven showdown.</p></section>
        <div class="ch-setup">
          <div class="ch-step"><div class="ch-step-k">1 | THE SEASON</div><div class="ch-chips">${C.SEASONS.map(s => `<button type="button" class="ch-chip${VS.year === s.year ? ' on' : ''}" data-year="${s.year}">${esc(s.label)}</button>`).join('')}</div></div>
          ${[0, 1].map(i => `<div class="ch-step"><div class="ch-step-k">${i + 2} | PLAYER ${i + 1}</div>
            <label class="field"><span>NAME</span><input data-name="${i}" maxlength="20" placeholder="Player ${i + 1}" value="${esc(VS.names[i] || '')}"></label>${grid(i)}</div>`).join('')}
          <div class="ch-go"><button type="button" class="btn btn-gold btn-big" id="vsStart">START THE DRAFT</button>
            ${VS.cfg ? '<a class="btn" href="#/challenge/vs/draft">BACK TO OUR DRAFT</a>' : ''}<a class="btn" href="#/challenge">ONE PLAYER</a></div>
        </div>`;
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
    const t = tOf(teams, p.team), st = p.stats;
    return `<li class="ch-pl"><span class="ch-pl-b"><b>${esc(p.name)}</b><small>${logo(t, 18)} ${esc(C.primaryPos(p.pos))}${p.age ? ' | ' + p.age : ''}${st ? '<span class="ch-real">' + esc(st.pts + ' / ' + st.reb + ' / ' + st.ast) + ' <i>PTS / REB / AST</i></span>' : ''}</small></span>
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
      } else body = `<div class="ch-ready"><div><b>BOTH FIVES ARE SET.</b><span class="muted"> Eight scrubs fill each bench.</span></div><button type="button" class="btn btn-gold btn-big" id="vsSim">PLAY IT OUT</button></div>`;
      app.innerHTML = `<div class="ch-top"><div><div class="ch-top-k">${esc(lbl(cfg.year))} | TWO PLAYERS</div><div class="ch-top-t">THE DRAFT</div></div>
          <a class="btn btn-small" href="#/challenge/vs">SETUP</a></div>
        <div class="vs-sides">${fives}</div>${body}`;
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
      if (sim) sim.addEventListener('click', () => { location.hash = '#/challenge/vs/result'; });
    });
  }

  function result(app) {
    const cfg = VS.cfg;
    if (!cfg || C.vsOnClock(cfg) >= 0) { location.hash = '#/challenge/vs' + (cfg ? '/draft' : ''); return; }
    loadThen(app, cfg.year, () => {
      app.innerHTML = `<section class="ch-load"><div class="ch-spin-ring"></div><div>PLAYING THE ${esc(lbl(cfg.year))} SEASON...</div></section>`;
      setTimeout(() => {
        let r;
        try { r = C.playVersus(cfg); } catch (e) { app.innerHTML = UI.empty('COULD NOT PLAY IT', esc(e.message || e), '<div class="row-btns"><a class="btn" href="#/challenge/vs">BACK</a></div>'); return; }
        const d = C.seasonData(cfg.year), teams = d.teams;
        const sideT = i => tOf(teams, cfg.sides[i].team), shown = i => cfg.sides[i].name || tName(sideT(i));
        const sd = r.showdown, wi = sd.winner === cfg.sides[0].team ? 0 : 1;
        const card = (res, i) => `<div class="vs-res" style="--c1:${esc(sideT(i).colors[0])}">
          <div class="vs-side-h">${logo(sideT(i), 44)}<div><small>${esc(who(i))}</small><b>${esc(shown(i))}</b></div></div>
          <div class="vs-rec">${res.w}-${res.l}</div><div class="vs-out">${esc(res.exit === 'champion' ? 'NBA CHAMPIONS' : res.result)}</div>
          <ul>${res.five.map(x => `<li><span>${esc(x.name)}</span><small>${x.line ? esc(x.line.pts + ' / ' + x.line.reb + ' / ' + x.line.ast) : ''}</small></li>`).join('')}</ul></div>`;
        const ab = a => a === cfg.sides[0].team ? shown(0) : shown(1);
        app.innerHTML = `
          <section class="vs-win" style="--c1:${esc(sideT(wi).colors[0])}">${logo(sideT(wi), 64)}<div><div class="ch-hero-k">THE SHOWDOWN</div>
            <h1>${esc(who(wi)).toUpperCase()} WINS ${Math.max(sd.wins[cfg.sides[0].team], sd.wins[cfg.sides[1].team])}-${Math.min(sd.wins[cfg.sides[0].team], sd.wins[cfg.sides[1].team])}</h1>
            ${sd.mvp ? `<p>Series MVP: <b>${esc(sd.mvp.name)}</b> (${esc(sd.mvp.line.pts + ' PTS, ' + sd.mvp.line.reb + ' REB, ' + sd.mvp.line.ast + ' AST')})</p>` : ''}</div></section>
          <div class="vs-sides">${card(r.a, 0)}${card(r.b, 1)}</div>
          <section class="vs-games">${UI.header('THE SHOWDOWN', 'Best of seven, home court to the better record')}
            <ol>${sd.games.map(g => `<li>${esc(ab(g.away))} ${g.as}, ${esc(ab(g.home))} ${g.hs}</li>`).join('')}</ol></section>
          ${r.h2h.length ? `<section class="vs-games">${UI.header('IN THE REGULAR SEASON', r.h2h.length + ' meetings')}<ol>${r.h2h.map(g => `<li>${esc(UI.dateLabel(g.date))}: ${esc(ab(g.away))} ${g.as}, ${esc(ab(g.home))} ${g.hs}</li>`).join('')}</ol></section>` : ''}
          <div class="row-btns center ch-acts"><button type="button" class="btn btn-gold" id="vsAgain">RUN IT BACK</button><a class="btn" href="#/challenge/vs">NEW MATCHUP</a></div>`;
        UI.$('#vsAgain').addEventListener('click', () => { VS.cfg.seed = Math.floor(Math.random() * 2147483646) + 1; ls.set(VS); result(app); });
      }, 30);
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
