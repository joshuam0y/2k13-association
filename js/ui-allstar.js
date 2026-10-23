/* All-Star Weekend page (#/allstar, #/allstar/<year>/<fri|sat|sun>): a 2K style screen with three tabs.
   FRIDAY: Rising Stars. SATURDAY: Skills Challenge, Three-Point Contest, Slam Dunk Contest. SUNDAY: All-Star Game.
   Reads window.ALLSTAR (js/allstar.js); builds the weekend on first view after the break.
   Also adds an ALL-STAR WEEKEND tile to the League page and points the hub's All-Star day banner here.
   Potential is never shown. */
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI) return;
  const esc = UI.esc;
  const P = UI.pages = UI.pages || {};
  const AS = () => window.ALLSTAR || null;
  const game = () => UI.state.game;
  const DAYS = [['fri', 'FRIDAY', 'Rising Stars'], ['sat', 'SATURDAY', 'Skills, Three-Point, Dunk'], ['sun', 'SUNDAY', 'All-Star Game']];

  const pl = id => (game() && game().players[id]) || UI.player(id) || { id, name: id, pos: '', team: 'FA' };
  const pname = id => esc(pl(id).name || id);
  const plink = id => `<a href="#/player/${esc(id)}">${pname(id)}</a>`;
  const dateText = iso => { try { return UI.dateLabel(iso); } catch (e) { return iso; } };

  function playerChip(id, extra) {
    const p = pl(id);
    return `<a class="as-chip" href="#/player/${esc(id)}">${UI.headshot(p, 'as-hs')}<span class="as-chip-t"><b>${esc(p.name)}</b><small>${esc(p.pos || '')}${p.team && p.team !== 'FA' ? ' | ' + esc(p.team) : ''}${extra ? ' | ' + extra : ''}</small></span></a>`;
  }
  function winnerCard(kicker, id, line, names) {
    if (!id && !names) return '';
    const ids = Array.isArray(id) ? id : id ? [id] : [];
    const faces = ids.map(x => UI.headshot(pl(x), 'as-win-hs')).join('');
    const title = names || ids.map(pname).join(' and ');
    return `<div class="as-win"><div class="as-win-faces">${faces}</div><div class="as-win-t"><small>${esc(kicker)}</small><b>${ids.length === 1 && !names ? plink(ids[0]) : esc(title)}</b>${line ? `<span>${line}</span>` : ''}</div></div>`;
  }
  function rosterCard(t, opts) {
    const o = opts || {};
    const starters = t.starters || [];
    const rows = t.ids.map(id => `<li>${playerChip(id, starters.includes(id) && o.starters !== false ? 'STARTER' : (t.captain === id ? 'CAPTAIN' : ''))}</li>`).join('');
    return `<section class="as-roster" style="--tc:${esc(t.color || '#d4af37')}"><header><b>${esc(t.name)}</b>${t.coach ? `<small>Coach: ${esc(t.coach)}</small>` : ''}${t.from ? `<small>From ${esc(t.from)}</small>` : ''}${t.gleague ? '<small>G League</small>' : ''}</header><ul>${rows}</ul></section>`;
  }
  function boxTable(side) {
    if (!side.box) return '<p class="muted">Box score no longer kept for this season.</p>';
    const rows = side.box.slice().sort((a, b) => b.pts - a.pts);
    const tr = r => `<tr><td class="l">${plink(r.id)}${r.starter ? ' <span class="bx-s">S</span>' : ''}</td><td>${Math.round(r.min)}</td><td><b>${r.pts}</b></td><td>${r.fgm}-${r.fga}</td><td>${r.tpm}-${r.tpa}</td><td>${r.ftm}-${r.fta}</td><td>${r.oreb + r.dreb}</td><td>${r.ast}</td><td>${r.stl}</td><td>${r.blk}</td></tr>`;
    return `<div class="tscroll"><table class="stats box as-box"><thead><tr><th class="l">${esc(side.name.toUpperCase())}</th><th>MIN</th><th>PTS</th><th>FG</th><th>3P</th><th>FT</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th></tr></thead><tbody>${rows.map(tr).join('')}</tbody></table></div>`;
  }
  function gameCard(g, ev, open) {
    const col = key => { const t = (ev.teams || []).find(x => x.key === key); return t ? t.color : '#d4af37'; };
    const side = (s, win) => `<div class="as-sb-side${win ? ' win' : ''}" style="--tc:${esc(col(s.key))}"><span>${esc(s.name)}</span><b>${s.pts}</b></div>`;
    const q = g.quarters && g.quarters.length ? `<div class="tscroll"><table class="stats qtable"><thead><tr><th class="l">TEAM</th>${g.quarters.map((_, i) => `<th>${i < 4 ? 'Q' + (i + 1) : 'OT'}</th>`).join('')}<th>T</th></tr></thead><tbody>
      <tr><td class="l">${esc(g.away.name)}</td>${g.quarters.map(x => `<td>${x[1]}</td>`).join('')}<td><b>${g.away.pts}</b></td></tr>
      <tr><td class="l">${esc(g.home.name)}</td>${g.quarters.map(x => `<td>${x[0]}</td>`).join('')}<td><b>${g.home.pts}</b></td></tr></tbody></table></div>` : '';
    return `<article class="as-game"><div class="as-game-k">${esc(g.label.toUpperCase())}${g.elam ? ` | FIRST TO ${g.elam}` : ''}</div>
      <div class="as-sb">${side(g.away, g.winner === g.away.key)}<i>FINAL</i>${side(g.home, g.winner === g.home.key)}</div>
      <details class="as-det"${open ? ' open' : ''}><summary>BOX SCORE</summary>${q}${boxTable(g.away)}${boxTable(g.home)}</details></article>`;
  }

  // ---------- Friday ----------
  const RS_FMT = { chuckShaq: 'Rookies and sophomores, drafted by Charles Barkley and Shaquille O\'Neal.', usaWorld: 'First and second year players: Team USA against Team World.',
    tournament: 'Four teams of seven: three of first and second year players and one from the G League. Semifinals to 40, the final to 25.' };
  function friday(wk) {
    const rs = wk.rising;
    if (!rs || rs.format === 'none') return `<section class="as-ev">${UI.header('RISING STARS')}<p class="muted">${esc((rs && rs.note) || 'Not held this season.')}</p></section>`;
    const mvp = rs.mvp;
    const champ = (rs.teams.find(t => t.key === rs.champion) || {}).name || '';
    return `<section class="as-ev">${UI.header('RISING STARS', esc(RS_FMT[rs.format] || ''))}
      ${rs.draftNote ? `<p class="as-note">${esc(rs.draftNote)}</p>` : ''}
      <div class="as-wins">${winnerCard('RISING STARS MVP', mvp && mvp.id, mvp ? `${mvp.pts} PTS, ${mvp.reb} REB, ${mvp.ast} AST${mvp.g > 1 ? ' in ' + mvp.g + ' games' : ''}` : '')}
        ${champ ? `<div class="as-win as-win-team"><div class="as-win-t"><small>CHAMPIONS</small><b>${esc(champ)}</b></div></div>` : ''}</div>
      ${rs.games.map((g, i) => gameCard(g, rs, i === rs.games.length - 1)).join('')}
      ${UI.header('ROSTERS')}<div class="as-rosters">${rs.teams.map(t => rosterCard(t)).join('')}</div></section>`;
  }

  // ---------- Saturday ----------
  function skillsHtml(sk) {
    if (!sk || !sk.rounds.length) return `<section class="as-ev">${UI.header('SKILLS CHALLENGE')}<p class="muted">Not enough players for the course.</p></section>`;
    const who = ids => ids.map(plink).join(' / ');
    const rounds = sk.rounds.map(r => {
      if (r.matches) return `<div class="as-round"><h4>${esc(r.name.toUpperCase())}</h4><div class="as-matches">${r.matches.map(m => `<div class="as-match">
          ${['a', 'b'].map(k => `<div class="${m.win === m[k].ids[0] ? 'win' : ''}">${UI.headshot(pl(m[k].ids[0]), 'as-mini')}<span>${who(m[k].ids)}</span><b>${m[k].time.toFixed(1)}s</b></div>`).join('')}</div>`).join('')}</div></div>`;
      return `<div class="as-round"><h4>${esc(r.name.toUpperCase())}</h4><div class="tscroll"><table class="stats as-tab"><thead><tr><th class="l">${sk.format === 'teams' ? 'TEAM' : 'PLAYER'}</th><th>${r.rows[0] && r.rows[0].attempts != null ? 'SHOTS' : 'TIME'}</th>${r.rows[0] && r.rows[0].pts != null ? '<th>PTS</th>' : ''}</tr></thead><tbody>
        ${r.rows.map(x => `<tr class="${x.adv || x.made ? 'adv' : ''}"><td class="l">${x.label ? `<b>${esc(x.label)}</b> <small class="muted">${x.ids.map(pname).join(', ')}</small>` : who(x.ids)}${x.adv ? ' <span class="as-adv">ADVANCES</span>' : ''}${x.made ? ' <span class="as-adv">MADE IT</span>' : ''}</td>
          <td>${x.attempts != null ? x.attempts : x.time.toFixed(1) + 's'}</td>${x.pts != null ? `<td>${x.pts}</td>` : ''}</tr>`).join('')}</tbody></table></div></div>`;
    }).join('');
    return `<section class="as-ev">${UI.header('SKILLS CHALLENGE', sk.format === 'bracket' ? 'Head-to-head races through the obstacle course.' : sk.format === 'teams' ? 'Team events: shooting, passing and dribbling, then a half-court shot final.' : 'Timed runs through the obstacle course.')}
      <div class="as-wins">${winnerCard('SKILLS CHALLENGE', sk.winner, '', sk.format === 'teams' ? sk.winnerName : null)}</div>${rounds}</section>`;
  }
  function threeHtml(th) {
    if (!th || !th.rounds.length) return `<section class="as-ev">${UI.header('THREE-POINT CONTEST')}<p class="muted">Not enough shooters.</p></section>`;
    const fieldInfo = {};
    (th.field || []).forEach(f => { fieldInfo[f.id] = f; });
    const rack = rk => `<span class="as-rack${rk.money ? ' money' : ''}" title="${esc(rk.spot)}${rk.money ? ', money ball rack' : ''}">${rk.balls.map(b => `<i class="${b.m ? 'in' : ''}${b.v > 1 ? ' mb' : ''}"></i>`).join('')}</span>`;
    const rounds = th.rounds.map(r => `<div class="as-round"><h4>${esc(r.name.toUpperCase())}</h4><div class="as-shooters">${r.rows.slice().sort((a, b) => b.score - a.score).map(x => `
        <div class="as-shooter${x.adv ? ' adv' : ''}${r.name === 'Final' && x.id === th.winner ? ' as-champ' : ''}">${UI.headshot(pl(x.id), 'as-mini')}
          <div class="as-sh-t"><span>${plink(x.id)}${fieldInfo[x.id] ? ` <small class="muted">${fieldInfo[x.id].tpm} 3PM, ${fieldInfo[x.id].pct}%</small>` : ''}</span>
          <div class="as-racks">${x.racks.map(rack).join('')}${x.deep && x.deep.length ? `<span class="as-rack deep" title="Deep shots, 3 points">${x.deep.map(b => `<i class="${b.m ? 'in' : ''} mb"></i>`).join('')}</span>` : ''}</div></div>
          <b>${x.score}</b></div>`).join('')}</div></div>`).join('');
    const rl = th.rules;
    return `<section class="as-ev">${UI.header('THREE-POINT CONTEST', `${(th.field || []).length} shooters, ${rl.balls} balls a round, money balls worth 2${rl.moneyRack ? ', one money ball rack' : ''}${rl.deep ? ', two deep shots worth 3' : ''}. Max ${rl.max}.`)}
      <div class="as-wins">${winnerCard('THREE-POINT CHAMPION', th.winner, th.winScore != null ? th.winScore + ' in the final' : '')}</div>${rounds}
      <p class="as-key"><i class="in"></i> make <i class="in mb"></i> money ball <i></i> miss</p></section>`;
  }
  function dunkHtml(dk) {
    if (!dk || !dk.rounds.length) return `<section class="as-ev">${UI.header('SLAM DUNK CONTEST')}<p class="muted">No dunkers this year.</p></section>`;
    const rounds = dk.rounds.map(r => `<div class="as-round"><h4>${esc(r.name.toUpperCase())}</h4><div class="as-dunkers">${r.rows.map(x => `
      <div class="as-dunker${x.adv ? ' adv' : ''}${/Final|Dunk-off/.test(r.name) && x.id === dk.winner ? ' as-champ' : ''}">
        <div class="as-dk-h">${UI.headshot(pl(x.id), 'as-mini')}<span>${plink(x.id)}</span><b>${x.score}</b></div>
        ${x.dunks.map(d => `<div class="as-dk"><span>${esc(d.dunk)}${d.made ? (d.attempts > 1 ? ` <small class="muted">(attempt ${d.attempts})</small>` : '') : ' <small class="as-miss">MISSED</small>'}</span><span class="as-judges">${d.judges.map(j => `<i class="${j === 10 ? 'ten' : ''}">${j}</i>`).join('')}</span><b class="${d.score === 50 ? 'ten' : ''}">${d.score}</b></div>`).join('')}
      </div>`).join('')}</div></div>`).join('');
    return `<section class="as-ev">${UI.header('SLAM DUNK CONTEST', 'Five judges score each dunk from 6 to 10, so a dunk scores 30 to 50.')}
      <div class="as-wins">${winnerCard('SLAM DUNK CHAMPION', dk.winner, '')}</div>${rounds}</section>`;
  }
  const saturday = wk => skillsHtml(wk.skills) + threeHtml(wk.three) + dunkHtml(wk.dunk);

  // ---------- Sunday ----------
  const ASG_FMT = { eastWest: 'East against West. Fans pick the starters, the coaches pick the reserves.',
    captains: 'The leading vote getter in each conference is a captain and drafts his team from the pool of All-Stars.',
    tournament: 'Four teams: three of eight All-Stars and the Rising Stars champions. Every game is played to 40.' };
  function sunday(wk) {
    const gm = wk.game;
    if (!gm || !gm.games.length) return `<section class="as-ev">${UI.header('ALL-STAR GAME')}<p class="muted">The game could not be played.</p></section>`;
    const mvp = gm.mvp;
    const champ = (gm.teams.find(t => t.key === gm.champion) || {}).name || '';
    const draft = gm.draft && gm.draft.length ? `<details class="as-det"><summary>THE DRAFT</summary><ol class="as-draft">${gm.draft.map(d => `<li><small>${esc(pl(d.by).name)}</small> ${plink(d.id)}</li>`).join('')}</ol></details>` : '';
    return `<section class="as-ev">${UI.header('ALL-STAR GAME', esc(ASG_FMT[gm.format] || '') + (gm.elamNote ? ' ' + esc(gm.elamNote) : ''))}
      <div class="as-wins">${winnerCard(gm.trophy ? 'ALL-STAR MVP | ' + gm.trophy.toUpperCase() : 'ALL-STAR MVP', mvp && mvp.id, mvp ? `${mvp.pts} PTS, ${mvp.reb} REB, ${mvp.ast} AST${mvp.g > 1 ? ' in ' + mvp.g + ' games' : ''}` : '')}
        ${champ ? `<div class="as-win as-win-team"><div class="as-win-t"><small>WINNERS</small><b>${esc(champ)}</b></div></div>` : ''}</div>
      ${gm.games.map((g, i) => gameCard(g, gm, i === gm.games.length - 1)).join('')}
      ${UI.header('ROSTERS', gm.format === 'tournament' ? '' : 'Starters first.')}${draft}<div class="as-rosters">${gm.teams.map(t => rosterCard(t, { starters: gm.format !== 'tournament' })).join('')}</div></section>`;
  }

  // ---------- page ----------
  function save() { try { if (typeof UI.saveNow === 'function') UI.saveNow(); else if (UI.bump) UI.bump(); } catch (e) { console.warn('All-Star save failed', e); } }
  P.allstar = function (app, arg) {
    const g = game(), A = AS();
    if (!g || !g.season) { app.innerHTML = UI.header('ALL-STAR WEEKEND') + UI.empty('NO LEAGUE LOADED', 'Start or load an Association to see the All-Star Weekend.', '<a class="btn btn-gold" href="#/home">MAIN MENU</a>'); return; }
    if (!A) { app.innerHTML = UI.header('ALL-STAR WEEKEND') + UI.empty('NOT AVAILABLE', 'The All-Star module did not load.'); return; }
    const parts = String(arg || '').split('/');
    let year = /^\d{4}$/.test(parts[0]) ? Number(parts[0]) : g.year;
    let day = DAYS.some(d => d[0] === parts[parts.length - 1]) ? parts[parts.length - 1] : 'sun';
    const st = A.status(g);
    if (year === g.year && !st.weekend && st.passed) { if (A.weekend(g)) save(); }
    const book = g.allStarWeekend || {};
    const years = Object.keys(book).map(Number).sort((a, b) => b - a);
    const wk = book[year] || null;
    const hero = `<section class="as-hero"><div class="as-hero-k">${esc(UI.seasonLabel(year))} NBA ALL-STAR</div><h1>ALL-STAR WEEKEND</h1>
      <div class="as-hero-s">${esc(dateText(A.dateOf(year)))}${A.hostOf(year) ? ' | ' + esc(A.hostOf(year).toUpperCase()) : ''}</div></section>`;
    const yearTabs = years.length > 1 || (years.length && years[0] !== g.year) ? `<nav class="tabs as-years">${(years.includes(g.year) ? years : [g.year].concat(years)).map(y => `<a href="#/allstar/${y}/${day}" class="${y === year ? 'on' : ''}">${y}</a>`).join('')}</nav>` : '';
    if (!wk) {
      app.innerHTML = hero + yearTabs + `<div class="as-soon"><b>${esc(dateText(A.dateOf(year)).toUpperCase())}</b><p>The All-Star rosters are announced soon.</p><p class="muted">Rising Stars on Friday, the Skills Challenge, Three-Point Contest and Slam Dunk Contest on Saturday, and the All-Star Game on Sunday.</p>
        <div class="row-btns"><a class="btn" href="#/season">BACK TO THE SEASON</a></div></div>`;
      return;
    }
    const tabs = `<nav class="as-days">${DAYS.map(d => `<a href="#/allstar/${year}/${d[0]}" class="${d[0] === day ? 'on' : ''}"><b>${d[1]}</b><small>${esc(d[2])}</small></a>`).join('')}</nav>`;
    const body = day === 'fri' ? friday(wk) : day === 'sat' ? saturday(wk) : sunday(wk);
    app.innerHTML = `<div class="as-page">${hero}${yearTabs}${tabs}${body}</div>`;
  };
  P.allstar.navLabel = 'All-Star';
  P.allstar.navDesc = 'All-Star Weekend: Rising Stars, the Saturday contests and the All-Star Game.';

  // ---------- ways in: League page tile, hub banner, All-Star rosters page ----------
  const baseLeague = P.league;
  if (typeof baseLeague === 'function') {
    P.league = function (app, arg) {
      baseLeague.call(this, app, arg);
      try {
        const grid = UI.$('.tile-grid', app);
        if (grid && game() && !UI.$('a[href="#/allstar"]', grid)) grid.insertAdjacentHTML('afterbegin', UI.tile('#/allstar', 'awards', 'ALL-STAR WEEKEND', { cls: 'as-tile' }));
      } catch (e) { console.warn('All-Star tile failed', e); }
    };
    Object.keys(baseLeague).forEach(k => { P.league[k] = baseLeague[k]; });
  }
  if (typeof UI.seasonMoment === 'function' && !UI.seasonMoment.__as) {
    const baseMoment = UI.seasonMoment;
    UI.seasonMoment = function () {
      const m = baseMoment.apply(this, arguments);
      if (m && m.key === 'allStar') { m.href = '#/allstar'; m.btn = 'ALL-STAR WEEKEND'; }
      return m;
    };
    UI.seasonMoment.__as = true;
  }
  const baseAwards = P.awards;
  if (typeof baseAwards === 'function') {
    P.awards = function (app, arg) {
      baseAwards.call(this, app, arg);
      try {
        if (arg !== 'allstars' || UI.$('.as-link', app)) return;
        const head = UI.$('.sec-head', app);
        if (head) head.insertAdjacentHTML('afterend', '<a class="btn btn-gold as-link" href="#/allstar">ALL-STAR WEEKEND</a>');
      } catch (e) { console.warn('All-Star link failed', e); }
    };
    Object.keys(baseAwards).forEach(k => { P.awards[k] = baseAwards[k]; });
  }
})();
