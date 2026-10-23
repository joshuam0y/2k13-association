/* D-League / G League page (#/gleague): one 2K-style screen with the NBA roster on the left
   (SEND DOWN) and the affiliate on the right (CALL UP). Reads GLEAGUE.roster(state, abbr).
   Potential is never shown. Also makes sure GLEAGUE.sync runs after every LEAGUE.advance, so the
   affiliate plays its weekly games while the season is simmed (safe if league.js calls it too). */
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI) return;
  const esc = UI.esc;
  const P = UI.pages = UI.pages || {};

  // ---------- weekly D-League games after every sim step ----------
  (function hookAdvance() {
    const L = window.LEAGUE;
    if (!L || typeof L.advance !== 'function' || L.advance.__gleague) return;
    const orig = L.advance;
    const wrapped = function (state) {
      const r = orig.apply(this, arguments);
      try { if (window.GLEAGUE && typeof window.GLEAGUE.sync === 'function' && state && state.season) window.GLEAGUE.sync(state); }
      catch (e) { console.warn('[gleague] weekly games failed', e); }
      return r;
    };
    wrapped.__gleague = true;
    L.advance = wrapped;
  })();

  const CSS = `
  .gl-hero { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 14px 18px; margin-bottom: 14px; background: var(--bg2); border: 1px solid var(--line); border-left: 4px solid var(--gold); }
  .gl-hero .gl-arrow { color: var(--gold); font-family: var(--display); font-size: 22px; }
  .gl-hero .gl-club { min-width: 0; }
  .gl-hero .gl-k { font-family: var(--display); letter-spacing: .14em; font-size: 11px; color: var(--muted); }
  .gl-hero .gl-t { font-family: var(--display); font-weight: 700; font-size: 20px; letter-spacing: .05em; text-transform: uppercase; }
  .gl-hero .gl-note { flex-basis: 100%; color: var(--muted); font-size: 13px; }
  .gl-counts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
  .gl-counts div { background: var(--bg2); border: 1px solid var(--line); padding: 10px 12px; text-align: center; }
  .gl-counts small { display: block; color: var(--muted); letter-spacing: .12em; font-size: 11px; font-family: var(--display); }
  .gl-counts b { font-family: var(--display); font-size: 24px; }
  .gl-rule { color: var(--text2); font-size: 14px; margin: 0 0 18px; }
  .gl-rule b { color: var(--gold2); }
  .gl-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: start; }
  @media (max-width: 860px) { .gl-cols { grid-template-columns: minmax(0, 1fr); } .gl-counts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .gl-panel { border: 1px solid var(--line); background: var(--bg2); min-width: 0; }
  .gl-panel > h3 { margin: 0; padding: 12px 14px; font-family: var(--display); letter-spacing: .1em; font-size: 15px; font-weight: 600; border-bottom: 2px solid var(--gold); display: flex; justify-content: space-between; gap: 10px; }
  .gl-panel > h3 span { color: var(--muted); font-weight: 400; white-space: nowrap; }
  .gl-list { list-style: none; margin: 0; padding: 0; }
  .gl-row { display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--line); }
  .gl-row:last-child { border-bottom: 0; }
  .gl-ovr { font-family: var(--display); font-weight: 700; font-size: 20px; text-align: center; border: 1px solid var(--line2); padding: 4px 0; }
  .gl-main { min-width: 0; }
  .gl-name { display: block; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gl-name a { color: var(--text); }
  .gl-name a:hover { color: var(--gold2); }
  .gl-meta { display: block; color: var(--muted); font-size: 13px; }
  .gl-stats { display: block; color: var(--text2); font-size: 13px; }
  .gl-stats b { color: var(--gold2); font-weight: 600; }
  .gl-left { display: inline-block; margin-top: 2px; font-family: var(--display); letter-spacing: .06em; font-size: 12px; color: var(--gold2); }
  .gl-left.out { color: var(--loss); }
  .gl-why { grid-column: 2 / 4; color: var(--muted); font-size: 12px; }
  .gl-row .btn { white-space: nowrap; }
  .gl-none { padding: 18px 14px; color: var(--muted); }
  .gl-tag { display: inline-block; font-size: 11px; letter-spacing: .06em; padding: 1px 6px; border: 1px solid var(--line2); color: var(--text2); margin-left: 4px; vertical-align: 1px; }
  .gl-tag.tw { border-color: var(--gold-dim); color: var(--gold2); }
  .gl-tag.inj { border-color: var(--loss); color: var(--loss); }
  `;
  function ensureCss() {
    if (document.getElementById('gl-style')) return;
    const st = document.createElement('style');
    st.id = 'gl-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  const f1 = v => (v == null || isNaN(v) ? '-' : Number(v).toFixed(1));
  const pct = (m, a) => (a > 0 ? (100 * m / a).toFixed(1) : '-');
  function teamFull(g, abbr) {
    const t = g.teams && g.teams[abbr];
    if (t && t.name) return ((t.city || '') + ' ' + t.name).trim();
    return UI.teamName ? UI.teamName(abbr) : abbr;
  }
  function save() {
    try {
      if (typeof UI.bump === 'function') UI.bump();
      const r = typeof UI.saveNow === 'function' ? UI.saveNow() : UI.saves && UI.saves.write ? UI.saves.write() : null;
      if (r && typeof r.catch === 'function') r.catch(e => console.warn('[gleague] save failed', e));
    } catch (e) { console.warn('[gleague] save failed', e); }
  }

  function statLine(r, lg) {
    const s = r.stats;
    if (!s || !s.g) return `<span class="gl-stats">${esc(lg)}: no games yet</span>`;
    return `<span class="gl-stats">${esc(lg)}: <b>${s.g}</b> GP | <b>${f1(s.pts)}</b> PTS | ${f1(s.reb)} REB | ${f1(s.ast)} AST | ${pct(s.fgm, s.fga)} FG% | ${f1(s.min)} MIN</span>`;
  }
  function leftLine(r) {
    const n = r.nbaLeft;
    if (!n) return '';
    return `<span class="gl-left${n.left ? '' : ' out'}">NBA ${n.type.toUpperCase()} LEFT: ${n.left}</span>`;
  }
  function row(r, side, lg) {
    const a = r.action || { ok: false, reason: '' };
    const btn = side === 'nba'
      ? `<button type="button" class="btn btn-small" data-send="${esc(r.id)}"${a.ok ? '' : ' disabled'}>SEND DOWN</button>`
      : `<button type="button" class="btn btn-small btn-gold" data-call="${esc(r.id)}"${a.ok ? '' : ' disabled'}>CALL UP</button>`;
    const tags = (r.twoWay ? '<span class="gl-tag tw">2-WAY</span>' : '') +
      (r.injury ? `<span class="gl-tag inj" title="${esc(r.injury.type)}">INJ ${esc(r.injury.games)}G</span>` : '');
    const n = r.yearsPro + 1, ord = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th';
    const yrs = r.yearsPro === 0 ? 'Rookie' : n + ord + ' season';
    const stats = side === 'aff' || (r.stats && r.stats.g) ? statLine(r, lg) : '';
    return `<li class="gl-row" data-id="${esc(r.id)}">
      <span class="gl-ovr ${UI.ovrClass ? UI.ovrClass(r.ovr) : ''}" title="Overall">${esc(r.ovr || '-')}</span>
      <span class="gl-main"><span class="gl-name"><a href="#/player/${encodeURIComponent(r.id)}">${esc(r.name)}</a>${tags}</span>
        <span class="gl-meta">${esc(r.pos)} | Age ${esc(r.age || '-')} | ${esc(r.contract)} | ${esc(yrs)}</span>
        ${stats}${leftLine(r)}</span>
      ${btn}
      ${!a.ok && a.reason ? `<span class="gl-why">${esc(a.reason)}</span>` : ''}
    </li>`;
  }

  function render(app) {
    ensureCss();
    const g = UI.state && UI.state.game;
    const G = window.GLEAGUE;
    if (!g || !g.userTeam) {
      app.innerHTML = UI.header('D-LEAGUE') + UI.empty('NO ASSOCIATION LOADED', 'Start a new Association or continue a saved one first.',
        '<div class="row-btns center"><a class="btn btn-gold" href="#/new">NEW LEAGUE</a><a class="btn" href="#/continue">CONTINUE</a></div>');
      return;
    }
    if (!G || typeof G.roster !== 'function') {
      app.innerHTML = UI.header('D-LEAGUE') + UI.empty('NOT LOADED', 'The D-League module (<code>js/gleague.js</code>) did not load.');
      return;
    }
    try { if (g.season) G.sync(g); } catch (e) { console.warn('[gleague] sync failed', e); }
    const abbr = g.userTeam;
    const R = G.roster(g, abbr);
    const lg = R.shortName;
    const max = window.LEAGUE && typeof window.LEAGUE.rosterRules === 'function' ? (window.LEAGUE.rosterRules(g.year) || {}).max || 15 : 15;
    const tw = R.twoWayRules || { allowed: false };
    const shared = R.shared.length
      ? `Shared affiliate: the ${esc(R.clubName)} also take players from ${R.shared.map(esc).join(', ')}.`
      : R.flexible ? `No affiliate this season: players go to the ${esc(R.clubName)} (flexible assignment).`
      : `One-to-one affiliate: only ${esc(abbr)} players go to the ${esc(R.clubName)}.`;
    const rec = R.record ? `${R.record.w}-${R.record.l}` : '0-0';
    const twLine = tw.allowed
      ? ` Two-way players live in the ${esc(lg)} and can spend ${tw.limit} NBA ${tw.limitType} with the team (${tw.slots} slots).`
      : '';
    app.innerHTML = `${UI.header(lg.toUpperCase(), 'Send players down to get minutes. Call them up any time. Players down there do not play NBA games.')}
      <div class="gl-hero">
        ${UI.logo ? UI.logo(abbr, 44) : ''}
        <div class="gl-club"><div class="gl-k">NBA</div><div class="gl-t">${esc(teamFull(g, abbr))}</div></div>
        <span class="gl-arrow">&#8644;</span>
        <div class="gl-club"><div class="gl-k">${esc(R.league.toUpperCase())} AFFILIATE</div><div class="gl-t">${esc(R.clubName || '-')}</div></div>
        <div class="gl-club"><div class="gl-k">RECORD</div><div class="gl-t">${esc(rec)}</div></div>
        <div class="gl-note">${shared} Week ${esc(R.week)} of the ${esc(lg)} season.</div>
      </div>
      <div class="gl-counts">
        <div><small>ROSTER</small><b>${R.counts.roster}/${max}</b></div>
        <div><small>NBA ACTIVE</small><b>${R.counts.active}</b></div>
        <div><small>IN THE ${esc(lg.toUpperCase())}</small><b>${R.counts.down}</b></div>
        <div><small>TWO-WAY</small><b>${tw.allowed ? R.counts.twoWay + '/' + R.counts.twoWaySlots : '-'}</b></div>
      </div>
      <p class="gl-rule"><b>${esc(g.year - 1)}-${esc(String(g.year).slice(2))} rules:</b> ${esc(R.rule)} Veterans must agree.${twLine} Assigned players still count on the ${max}-man roster.</p>
      <div class="gl-cols">
        <section class="gl-panel" aria-label="NBA roster"><h3>NBA ROSTER <span>${R.nba.length} players</span></h3>
          <ul class="gl-list">${R.nba.map(r => row(r, 'nba', lg)).join('') || '<li class="gl-none">Nobody is with the NBA team.</li>'}</ul></section>
        <section class="gl-panel" aria-label="Affiliate"><h3>${esc((R.clubName || 'AFFILIATE').toUpperCase())} <span>${R.affiliate.length} assigned</span></h3>
          <ul class="gl-list">${R.affiliate.map(r => row(r, 'aff', lg)).join('') || `<li class="gl-none">Nobody is in the ${esc(lg)}. Use SEND DOWN on a young player to get him minutes.</li>`}</ul></section>
      </div>`;

    const act = (kind, id) => {
      const p = g.players[id];
      let r;
      try { r = kind === 'send' ? G.assign(g, id) : G.recall(g, id); } catch (e) { console.warn('[gleague] ' + kind + ' failed', e); r = { ok: false, reason: 'That move failed.' }; }
      if (r && r.ok) {
        UI.toast(kind === 'send' ? `${p.name} sent down to the ${r.clubName || R.clubName}.` : `${p.name} called up. He joins the end of the bench.`);
        save();
        if (UI.updateChrome) UI.updateChrome();
      } else UI.toast((r && r.reason) || 'That move is not allowed.', 'error');
      render(app);
    };
    UI.$$('[data-send]', app).forEach(b => b.addEventListener('click', () => act('send', b.getAttribute('data-send'))));
    UI.$$('[data-call]', app).forEach(b => b.addEventListener('click', () => act('call', b.getAttribute('data-call'))));
  }

  P.gleague = function (app) { render(app); };
  P.gleague.navLabel = 'G League';
  P.gleague.navDesc = 'Send players down to the D-League or G League and call them up';
})();
