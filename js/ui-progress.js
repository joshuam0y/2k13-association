/* Offseason progression report page (#/progress). Shown after PROG.offseason runs and before the new
   season starts. Reads state.progressReport = { year, players: { id: [oldOvr, newOvr, age] }, rookies: [ids] }.
   Potential is never shown. */
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI) return;
  const esc = UI.esc;
  const P = UI.pages = UI.pages || {};

  const CSS = `
  .pg-wrap { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 20px; align-items: start; }
  @media (max-width: 860px) { .pg-wrap { grid-template-columns: minmax(0, 1fr); } }
  .pg-hero { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 14px 18px; margin-bottom: 18px; background: var(--bg2, #141416); border: 1px solid var(--line, #26262c); border-left: 4px solid var(--gold, #d4a72c); }
  .pg-hero .pg-k { font-family: var(--display, sans-serif); letter-spacing: .14em; font-size: 12px; color: var(--muted, #8b8b93); }
  .pg-hero .pg-t { font-family: var(--display, sans-serif); font-weight: 700; font-size: 22px; letter-spacing: .06em; }
  .pg-sum { display: flex; gap: 18px; margin-left: auto; flex-wrap: wrap; }
  .pg-sum div { text-align: center; min-width: 64px; }
  .pg-sum b { display: block; font-family: var(--display, sans-serif); font-size: 24px; }
  .pg-sum small { color: var(--muted, #8b8b93); letter-spacing: .12em; font-size: 11px; }
  .pg-p { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .pg-p .pg-hs { width: 40px; height: 30px; flex: none; overflow: hidden; border-radius: 3px; background: #0c0c0e; }
  .pg-p .pg-hs img, .pg-p .pg-hs svg { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pg-p b { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pg-p small { color: var(--muted, #8b8b93); }
  .pg-ch { font-family: var(--display, sans-serif); font-weight: 700; font-size: 16px; white-space: nowrap; }
  .pg-up { color: #36c76a; }
  .pg-down { color: #ec4b40; }
  .pg-same { color: var(--muted, #8b8b93); }
  .pg-old { color: var(--muted, #8b8b93); }
  .pg-new { font-family: var(--display, sans-serif); font-weight: 700; font-size: 17px; }
  .pg-list { list-style: none; margin: 0 0 18px; padding: 0; border: 1px solid var(--line, #26262c); }
  .pg-list li { display: grid; grid-template-columns: 22px 28px minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 8px 12px; border-bottom: 1px solid #1f1f24; }
  .pg-list li:last-child { border-bottom: 0; }
  .pg-list .pg-n { color: var(--muted, #8b8b93); font-family: var(--display, sans-serif); }
  .pg-list a { color: #fff; }
  .pg-list a:hover { color: var(--gold2, #f2c94c); }
  .pg-list .pg-nums { color: var(--muted, #8b8b93); font-size: 13px; white-space: nowrap; }
  .pg-btns { display: flex; gap: 10px; flex-wrap: wrap; margin: 4px 0 20px; }
  .pg-wrap .tscroll { overflow-x: auto; }
  tr.pg-mine-big td { background: rgba(62, 196, 109, .06); }
  tr.pg-mine-drop td { background: rgba(226, 71, 63, .06); }
  `;
  function ensureCss() {
    if (document.getElementById('pg-style')) return;
    const st = document.createElement('style');
    st.id = 'pg-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function game() { return UI.state && UI.state.game ? UI.state.game : null; }
  function change(d) {
    if (d > 0) return `<span class="pg-ch pg-up" title="Up ${d}">&#9650; +${d}</span>`;
    if (d < 0) return `<span class="pg-ch pg-down" title="Down ${-d}">&#9660; ${d}</span>`;
    return '<span class="pg-ch pg-same" title="No change">&#9644; 0</span>';
  }
  function hs(p) { try { return UI.headshot(p); } catch (e) { return ''; } }
  function teamOk(g, abbr) { return !!(g.teams && g.teams[abbr]); }

  function render(app) {
    ensureCss();
    const g = game();
    if (!g) { app.innerHTML = UI.empty('NO LEAGUE LOADED', 'Start a new Association or load a save first.', '<a class="btn" href="#/home">HOME</a>'); return; }
    const rep = g.progressReport;
    const user = g.userTeam;
    if (!rep || !rep.players) {
      app.innerHTML = UI.header('PLAYER PROGRESSION') + UI.empty('NO PROGRESSION REPORT YET',
        'Player ratings change once a year, after free agency and before training camp. The report shows up here when that happens.',
        '<div class="row-btns"><a class="btn" href="#/season">BACK TO THE SEASON</a></div>');
      return;
    }
    const firstView = !rep.seen;
    rep.seen = true;
    const rows = [];
    Object.keys(rep.players).forEach(id => {
      const p = g.players[id], v = rep.players[id];
      if (!p || !Array.isArray(v) || p.retired) return;
      rows.push({ p, id, from: Number(v[0]) || 0, to: Number(v[1]) || 0, age: v[2] != null ? v[2] : p.age, d: (Number(v[1]) || 0) - (Number(v[0]) || 0) });
    });
    const overseas = p => p.stashedUntil && Number(p.stashedUntil) > rep.year;
    const mine = rows.filter(r => r.p.team === user).sort((a, b) => b.to - a.to || b.d - a.d);
    const rookies = (rep.rookies || []).map(id => g.players[id]).filter(p => p && p.team === user && !p.retired);
    const league = rows.filter(r => teamOk(g, r.p.team) && !overseas(r.p));
    const risers = league.filter(r => r.d > 0).sort((a, b) => b.d - a.d || b.to - a.to).slice(0, 10);
    const fallers = league.filter(r => r.d < 0).sort((a, b) => a.d - b.d || b.from - a.from).slice(0, 10);
    const up = mine.filter(r => r.d > 0).length, down = mine.filter(r => r.d < 0).length;
    const net = mine.reduce((s, r) => s + r.d, 0);
    const avg = list => (list.length ? (list.reduce((s, r) => s + r, 0) / list.length).toFixed(1) : '-');
    const top8 = list => list.slice().sort((a, b) => b - a).slice(0, 8);
    const before = avg(top8(mine.map(r => r.from))), after = avg(top8(mine.map(r => r.to)));
    const season = UI.fmtSeasonEnd ? UI.fmtSeasonEnd(rep.year) : rep.year;
    const inTraining = g.phase === 'training';

    const myRows = mine.map(r => `<tr class="${r.d >= 3 ? 'pg-mine-big' : r.d <= -3 ? 'pg-mine-drop' : ''}">
        <td class="l"><a class="pg-p" href="#/player/${esc(r.id)}"><span class="pg-hs">${hs(r.p)}</span><span><b>${esc(r.p.name)}</b><small>${esc(r.p.pos || '')}${overseas(r.p) ? ' | Playing overseas' : ''}</small></span></a></td>
        <td>${esc(r.age != null ? r.age : '-')}</td>
        <td class="pg-old">${r.from}</td>
        <td><span class="pg-new ${UI.ovrClass(r.to)}">${r.to}</span></td>
        <td>${change(r.d)}</td>
      </tr>`).join('');
    const rookieRows = rookies.map(p => `<tr>
        <td class="l"><a class="pg-p" href="#/player/${esc(p.id)}"><span class="pg-hs">${hs(p)}</span><span><b>${esc(p.name)}</b><small>${esc(p.pos || '')} | Rookie${p.draft ? ', pick #' + esc(p.draft.pick) : ''}</small></span></a></td>
        <td>${esc(p.age || '-')}</td><td class="pg-old">-</td><td><span class="pg-new ${UI.ovrClass(p.ovr || 0)}">${esc(p.ovr || '-')}</span></td><td><span class="pg-ch pg-same">NEW</span></td>
      </tr>`).join('');
    const list = (arr, empty) => arr.length ? `<ol class="pg-list">${arr.map((r, i) => `<li>
        <span class="pg-n">${i + 1}</span>${UI.logo(r.p.team, 26)}
        <a class="pg-p" href="#/player/${esc(r.id)}"><span><b>${esc(r.p.name)}</b><small>${esc(r.p.pos || '')} | ${esc(r.age != null ? r.age : '-')} yrs</small></span></a>
        <span class="pg-nums">${r.from} to <b class="${UI.ovrClass(r.to)}">${r.to}</b></span>${change(r.d)}
      </li>`).join('')}</ol>` : `<p class="muted">${empty}</p>`;

    app.innerHTML = `${UI.header('PLAYER PROGRESSION', esc(season) + ' season | offseason ratings changes')}
      <div class="pg-hero">${UI.logo(user, 52)}<div><div class="pg-k">${esc(String(UI.teamName(user)).toUpperCase())}</div><div class="pg-t">OFFSEASON PROGRESSION</div></div>
        <div class="pg-sum">
          <div><b class="pg-up">${up}</b><small>IMPROVED</small></div>
          <div><b class="pg-down">${down}</b><small>DECLINED</small></div>
          <div><b class="${net > 0 ? 'pg-up' : net < 0 ? 'pg-down' : 'pg-same'}">${net > 0 ? '+' : ''}${net}</b><small>NET OVR</small></div>
          <div><b>${before} <span class="pg-same">&#8594;</span> ${after}</b><small>TOP 8 AVG</small></div>
        </div></div>
      <div class="pg-btns">${inTraining && UI.sim ? '<button type="button" class="btn btn-gold" data-act="start">CONTINUE: START THE SEASON</button>' : ''}<a class="btn" href="#/season">SEASON HUB</a>${UI.pages.manage ? '<a class="btn" href="#/manage">ROTATION</a>' : ''}</div>
      <div class="pg-wrap">
        <section>
          ${UI.header('YOUR ROSTER', 'Old and new overall for every player under contract')}
          ${mine.length || rookies.length ? `<div class="tscroll"><table class="stats pg-table"><thead><tr><th class="l">PLAYER</th><th>AGE</th><th>OLD</th><th>NEW</th><th>CHANGE</th></tr></thead><tbody>${myRows}${rookieRows}</tbody></table></div>`
            : '<p class="muted">No players on your roster had a rating change this offseason.</p>'}
        </section>
        <section>
          ${UI.header('BIGGEST RISERS', 'League wide')}
          ${list(risers, 'Nobody improved this offseason.')}
          ${UI.header('BIGGEST FALLERS', 'League wide')}
          ${list(fallers, 'Nobody declined this offseason.')}
        </section>
      </div>`;
    app.onclick = ev => {
      const b = ev.target.closest('[data-act="start"]');
      if (b && UI.sim) UI.sim('nextPhase');
    };
    if (firstView && UI.saves && typeof UI.saves.write === 'function') {
      try { Promise.resolve(UI.saves.write()).catch(() => {}); } catch (e) { /* ignore */ }
    }
  }

  P.progress = function (app) {
    app.onclick = null; app.onchange = null; app.onsubmit = null;
    render(app);
  };
  P.progress.navLabel = 'Progression';
  P.progress.hidden = true;
})();
