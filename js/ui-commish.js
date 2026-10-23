// Commissioner mode (#/commish): edit players and contracts, force trades, change the rules for
// future seasons. Every change is written to the transaction log with type "commissioner".
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI) { if (window.console) console.warn('[commish] UI core (js/ui-core.js) is not loaded; commissioner mode is off.'); return; }
  const P = UI.pages = UI.pages || {};
  const esc = UI.esc;

  const ATTR_LABELS = {
    close: 'Shot close', mid: 'Mid-range', three: 'Three point', ft: 'Free throw', layup: 'Layup', dunk: 'Dunk', post: 'Post moves',
    handle: 'Ball handle', pass: 'Passing', oreb: 'Off. rebound', dreb: 'Def. rebound', steal: 'Steal', block: 'Block',
    perD: 'On-ball D', intD: 'Interior D', speed: 'Speed', vert: 'Vertical', strength: 'Strength', stamina: 'Stamina',
    durability: 'Durability', oiq: 'Offensive IQ', diq: 'Defensive IQ'
  };
  const POS = ['PG', 'SG', 'SF', 'PF', 'C'];
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const fmtM = d => (d ? (d / 1e6).toFixed(2) : '');

  function X() { return UI.extras || null; }
  function cba(state, year) {
    try { return window.CBA && typeof window.CBA.rules === 'function' ? window.CBA.rules(year || state.year) : null; } catch (e) { return null; }
  }
  function salaryNow(state, p) {
    const c = p.contract;
    if (!c || !Array.isArray(c.salaries)) return 0;
    const row = c.salaries.find(s => s.year === state.year) || c.salaries[0];
    return row ? row.amount : 0;
  }
  function contractEnd(p) {
    const c = p.contract;
    if (!c || !Array.isArray(c.salaries) || !c.salaries.length) return null;
    return Math.max.apply(null, c.salaries.map(s => s.year));
  }
  function teamAbbrs(state) { return Object.keys(state.teams || {}).sort(); }
  function teamLabel(state, abbr) {
    if (abbr === 'FA') return 'Free agent';
    if (abbr === 'DRAFT') return 'Draft prospect';
    const t = state.teams[abbr];
    return t ? (t.city + ' ' + t.name) : abbr;
  }

  // ---------- page shell ----------
  P.commish = function (app, arg) {
    const x = X();
    if (!x) { app.innerHTML = UI.empty('COMMISSIONER MODE UNAVAILABLE', 'The helper file <code>js/ui-live.js</code> did not load.', '<a class="btn" href="#/home">HOME</a>'); return; }
    if (x.need(app, 'state')) return;
    const state = x.getState();
    const parts = String(arg || '').split('/');
    const tab = parts[0] || 'players';
    const tabs = [['players', 'PLAYERS'], ['trade', 'FORCE TRADE'], ['rules', 'RULES'], ['log', 'LOG']];
    const on = tab === 'player' ? 'players' : tab;
    app.innerHTML = `${UI.header('COMMISSIONER MODE', 'Full control of the league. ' + (state.year - 1) + '-' + String(state.year).slice(2) + ' season.')}
      <div class="note cm-warn"><b>Commissioner changes affect realism.</b> Edits here skip the CBA, the AI general managers and the real player histories this league follows. Every change is recorded in the transaction log.</div>
      <nav class="tabs cm-tabs">${tabs.map(t => `<a class="btn btn-small${on === t[0] ? ' btn-gold' : ''}" href="#/commish/${t[0]}">${t[1]}</a>`).join('')}</nav>
      <div id="cmBody"></div>`;
    const body = UI.$('#cmBody');
    if (tab === 'player') drawEditor(body, state, parts.slice(1).join('/'));
    else if (tab === 'trade') drawTrade(body, state);
    else if (tab === 'rules') drawRules(body, state);
    else if (tab === 'log') drawLog(body, state);
    else drawPlayers(body, state);
  };

  P.commish.navLabel = 'Commissioner';
  P.commish.navDesc = 'Edit players and contracts, force trades, change the rules';

  // ---------- players ----------
  const listOpts = { q: '', team: '' };
  function drawPlayers(body, state) {
    const abbrs = teamAbbrs(state);
    body.innerHTML = `<div class="cm-filters">
        <label class="field"><span>SEARCH</span><input id="cmQ" placeholder="Player name" value="${esc(listOpts.q)}"></label>
        <label class="field"><span>TEAM</span><select id="cmTeam">
          <option value="">All teams</option>${abbrs.map(a => `<option value="${a}" ${listOpts.team === a ? 'selected' : ''}>${esc(teamLabel(state, a))}</option>`).join('')}
          <option value="FA" ${listOpts.team === 'FA' ? 'selected' : ''}>Free agents</option><option value="DRAFT" ${listOpts.team === 'DRAFT' ? 'selected' : ''}>Draft prospects</option>
        </select></label>
      </div><div id="cmList"></div>`;
    const draw = () => {
      const q = listOpts.q.trim().toLowerCase();
      const rows = Object.keys(state.players).map(id => state.players[id])
        .filter(p => p && !p.retired && (listOpts.team ? p.team === listOpts.team : p.team !== 'DRAFT') && (!q || String(p.name).toLowerCase().indexOf(q) >= 0))
        .sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
      const shown = rows.slice(0, 60);
      UI.$('#cmList').innerHTML = rows.length ? `<div class="tscroll"><table class="stats cm-list"><thead><tr><th class="l">PLAYER</th><th class="l">TEAM</th><th>POS</th><th>AGE</th><th>OVR</th><th>SALARY</th><th>THRU</th><th></th></tr></thead><tbody>
        ${shown.map(p => `<tr><td class="l"><a href="#/commish/player/${esc(p.id)}">${esc(p.name)}</a></td><td class="l">${esc(p.team)}</td><td>${esc(p.pos)}</td><td>${p.age || '-'}</td>
          <td><b class="${UI.ovrClass ? UI.ovrClass(p.ovr) : ''}">${p.ovr || '-'}</b></td><td>${x$(salaryNow(state, p))}</td><td>${contractEnd(p) || '-'}</td>
          <td><a class="btn btn-small" href="#/commish/player/${esc(p.id)}">EDIT</a></td></tr>`).join('')}
        </tbody></table></div>${rows.length > shown.length ? `<p class="muted">Showing the top ${shown.length} of ${rows.length}. Search to narrow it down.</p>` : ''}`
        : '<p class="muted">No players match.</p>';
    };
    UI.$('#cmQ').addEventListener('input', e => { listOpts.q = e.target.value; draw(); });
    UI.$('#cmTeam').addEventListener('change', e => { listOpts.team = e.target.value; draw(); });
    draw();
  }
  const x$ = d => (X() ? X().money(d) : d);

  function drawEditor(body, state, id) {
    const p = state.players[id];
    if (!p) { body.innerHTML = UI.empty('PLAYER NOT FOUND', 'No player with the id ' + esc(id) + '.', '<a class="btn" href="#/commish/players">ALL PLAYERS</a>'); return; }
    const abbrs = teamAbbrs(state);
    const attrs = p.attrs || {};
    const keys = Object.keys(ATTR_LABELS).filter(k => k in attrs).concat(Object.keys(attrs).filter(k => !(k in ATTR_LABELS)));
    const c = p.contract;
    const opt = c && c.option;
    const end = contractEnd(p);
    body.innerHTML = `<div class="cm-edit">
      <div class="cm-edit-head">${UI.headshot(p)}<div><div class="lv-k">${esc(teamLabel(state, p.team))} | ${esc(p.pos)}</div><h3>${esc(p.name)}</h3></div></div>
      <div class="cm-row">
        <label class="field"><span>OVERALL</span><input type="number" id="ceOvr" min="25" max="99" value="${p.ovr || 0}"></label>
        <label class="field"><span>AGE</span><input type="number" id="ceAge" min="17" max="45" value="${p.age || 0}"></label>
        <label class="field"><span>POSITION</span><select id="cePos">${POS.map(x => `<option ${String(p.pos).split(/[-\/]/)[0] === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="field"><span>TEAM</span><select id="ceTeam">${abbrs.map(a => `<option value="${a}" ${p.team === a ? 'selected' : ''}>${esc(a)} ${esc(teamLabel(state, a))}</option>`).join('')}
          <option value="FA" ${p.team === 'FA' ? 'selected' : ''}>FA Free agent</option>${p.team === 'DRAFT' ? '<option value="DRAFT" selected>Draft prospect</option>' : ''}</select></label>
      </div>
      <label class="cm-asset" style="border:0;padding:0 0 8px"><input type="checkbox" id="ceScale" checked><span class="nm">Move all attributes with the overall change (games are simmed from the attributes)</span></label>
      <div class="cm-h4">CONTRACT</div>
      <div class="cm-row">
        <label class="field"><span>SALARY ${state.year - 1}-${String(state.year).slice(2)} ($M)</span><input type="number" id="ceSal" step="0.01" min="0" value="${fmtM(salaryNow(state, p))}"></label>
        <label class="field"><span>LAST SEASON (ENDING YEAR)</span><input type="number" id="ceEnd" min="${state.year}" max="${state.year + 7}" value="${end || state.year}"></label>
        <label class="field"><span>OPTION</span><select id="ceOpt"><option value="">None</option>${['player', 'team', 'eto'].map(o => `<option value="${o}" ${opt && opt.type === o ? 'selected' : ''}>${o === 'eto' ? 'Early termination' : o[0].toUpperCase() + o.slice(1) + ' option'}</option>`).join('')}</select></label>
        <label class="field"><span>OPTION YEAR</span><input type="number" id="ceOptY" min="${state.year}" max="${state.year + 7}" value="${opt ? opt.year : ''}"></label>
      </div>
      <p class="muted" style="margin-top:-6px;font-size:13px">Raises 4.5% a year after this season. A free agent has no contract; moving a player to FA releases him from his deal.</p>
      <div class="cm-h4">ATTRIBUTES</div>
      <div class="cm-attrs">${keys.map(k => `<label class="field"><span>${esc((ATTR_LABELS[k] || k).toUpperCase())}</span><input type="number" min="25" max="99" data-attr="${esc(k)}" value="${attrs[k]}"></label>`).join('')}</div>
      <div class="row-btns"><button type="button" class="btn btn-gold" id="ceSave">SAVE CHANGES</button><a class="btn" href="#/commish/players">BACK TO PLAYERS</a><a class="btn" href="#/player/${esc(p.id)}">PLAYER CARD</a></div>
    </div>`;
    UI.$('#ceSave').addEventListener('click', () => {
      const num = (sel) => { const raw = String(UI.$(sel).value).trim(); const v = Number(raw); return raw === '' || isNaN(v) ? null : v; };
      const changes = [];
      const set = (label, oldV, newV, fn) => { if (newV != null && newV !== oldV) { changes.push(label + ' ' + oldV + ' to ' + newV); fn(newV); } };
      const newOvr = num('#ceOvr') != null ? clamp(Math.round(num('#ceOvr')), 25, 99) : p.ovr;
      const dOvr = newOvr - (p.ovr || 0);
      // attributes first (typed values), then the overall shift if asked
      UI.$$('[data-attr]', body).forEach(inp => {
        const k = inp.getAttribute('data-attr');
        const v = Number(inp.value);
        if (!isNaN(v) && v !== attrs[k]) { changes.push(k + ' ' + attrs[k] + ' to ' + clamp(Math.round(v), 25, 99)); attrs[k] = clamp(Math.round(v), 25, 99); }
      });
      if (dOvr && UI.$('#ceScale').checked) Object.keys(attrs).forEach(k => { attrs[k] = clamp(Math.round(attrs[k] + dOvr), 25, 99); });
      p.attrs = attrs;
      set('overall', p.ovr, newOvr, v => { p.ovr = v; });
      const age = num('#ceAge'); set('age', p.age, age != null ? clamp(Math.round(age), 17, 45) : null, v => { p.age = v; });
      const pos = UI.$('#cePos').value;
      if (String(p.pos).split(/[-\/]/)[0] !== pos) { changes.push('position ' + p.pos + ' to ' + pos); p.pos = pos; }
      const team = UI.$('#ceTeam').value;
      if (team !== p.team) {
        const from = p.team;
        changes.push('team ' + from + ' to ' + team);
        [from, team].forEach(t => {
          const tm = state.teams[t];
          if (tm && Array.isArray(tm.rotation)) {
            tm.rotation = tm.rotation.filter(i => i !== p.id);
            if (t === team) tm.rotation.push(p.id);
          }
        });
        p.team = team; p.yearsWithTeam = 0; p.gleague = false;
        if (team === 'FA' && p.contract) { p.contract = null; changes.push('contract released'); }
      }
      if (p.team !== 'FA' && p.team !== 'DRAFT') {
        const sal = num('#ceSal'), endY = num('#ceEnd');
        const oldSal = salaryNow(state, p), oldEnd = contractEnd(p);
        const rules = cba(state);
        let minSal = 490180;
        try { if (rules && typeof rules.minSalary === 'function') minSal = rules.minSalary(p.yearsPro || 0) || minSal; } catch (e) { /* keep default */ }
        const amount = sal ? Math.round(sal * 1e6) : (oldSal || minSal);
        const last = clamp(Math.round(endY || oldEnd || state.year), state.year, state.year + 7);
        if (amount > 0 && (!p.contract || Math.abs(amount - oldSal) >= 5000 || last !== oldEnd)) {
          const salaries = [];
          for (let y = state.year; y <= last; y++) salaries.push({ year: y, amount: Math.round(amount * Math.pow(1.045, y - state.year)) });
          const prev = p.contract || {};
          p.contract = { salaries, option: prev.option || null, rookie: !!prev.rookie, twoWay: !!prev.twoWay, signedYear: prev.signedYear || state.year };
          changes.push('contract ' + x$(oldSal) + (oldEnd ? ' thru ' + oldEnd : '') + ' to ' + x$(amount) + ' thru ' + last);
        }
        if (p.contract) {
          const ot = UI.$('#ceOpt').value;
          const oy = num('#ceOptY');
          const old = p.contract.option;
          const next = ot ? { year: clamp(Math.round(oy || last), state.year, last), type: ot } : null;
          if (JSON.stringify(old || null) !== JSON.stringify(next)) {
            p.contract.option = next;
            p.contract.options = next ? [next] : [];
            changes.push('option ' + (old ? old.type + ' ' + old.year : 'none') + ' to ' + (next ? next.type + ' ' + next.year : 'none'));
          }
        }
      }
      if (!changes.length) { UI.toast('Nothing changed.'); return; }
      X().log(state, 'commissioner', 'Commissioner edit: ' + p.name + ': ' + changes.join(', ') + '.', [p.id]);
      X().refresh();
      X().persist();
      UI.toast('Saved ' + changes.length + ' change' + (changes.length > 1 ? 's' : '') + ' to ' + p.name + '.');
      drawEditor(body, state, id);
    });
  }

  // ---------- forced trades ----------
  const tradeSel = { a: null, b: null, pick: {} };
  function pickRef(pk) { return pk.year + '-' + pk.round + '-' + pk.original; }
  function pickLabel(pk) {
    return pk.year + ' ' + (pk.round === 1 ? '1st' : '2nd') + ' round (' + pk.original + ')' + (pk.protection && pk.protection.top ? ', top ' + pk.protection.top + ' protected' : '');
  }
  function rosterOf(state, abbr) {
    return Object.keys(state.players).map(id => state.players[id]).filter(p => p && !p.retired && p.team === abbr).sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
  }
  function buildTrade(state) {
    const t = { teams: [tradeSel.a, tradeSel.b], give: {} };
    [tradeSel.a, tradeSel.b].forEach(a => { t.give[a] = { players: [], picks: [] }; });
    Object.keys(tradeSel.pick).forEach(k => {
      if (!tradeSel.pick[k]) return;
      const [side, kind, ref] = k.split('|');
      const abbr = side === 'a' ? tradeSel.a : tradeSel.b;
      t.give[abbr][kind === 'p' ? 'players' : 'picks'].push(ref);
    });
    return t;
  }
  function warningsFor(state, trade) {
    let res = null;
    try {
      if (window.CBA && typeof window.CBA.validateTrade === 'function') res = window.CBA.validateTrade(state, trade);
      else if (window.TRADE && typeof window.TRADE.validate === 'function') res = window.TRADE.validate(state, trade);
    } catch (e) { res = { ok: false, reasons: ['The CBA check failed: ' + (e && e.message ? e.message : e)] }; }
    const out = res && Array.isArray(res.reasons) ? res.reasons.slice() : [];
    const checked = !!res;
    // simple local checks when no CBA module is loaded
    if (!res) {
      const rules = cba(state);
      const cap = (rules && rules.cap) || 58044000;
      trade.teams.forEach(a => {
        const other = trade.teams.find(b => b !== a);
        const outSal = trade.give[a].players.reduce((s, id) => s + salaryNow(state, state.players[id]), 0);
        const inSal = trade.give[other].players.reduce((s, id) => s + salaryNow(state, state.players[id]), 0);
        const payroll = rosterOf(state, a).reduce((s, p) => s + salaryNow(state, p), 0);
        if (payroll - outSal + inSal > cap && inSal > outSal * 1.25 + 100000) out.push(a + ' is over the cap and takes back more than 125% plus $100K of the salary it sends out.');
      });
    }
    trade.teams.forEach(a => {
      const other = trade.teams.find(b => b !== a);
      const n = rosterOf(state, a).length - trade.give[a].players.length + trade.give[other].players.length;
      if (n > 15 && !out.some(r => r.indexOf(a) >= 0 && /roster/i.test(r))) out.push(a + ' would have ' + n + ' players (the limit is 15).');
      if (n < 13 && !out.some(r => r.indexOf(a) >= 0 && /roster/i.test(r))) out.push(a + ' would have ' + n + ' players (the minimum is 13).');
    });
    return { reasons: out, checked };
  }
  function localExecute(state, trade) {
    const moved = [];
    trade.teams.forEach(a => {
      const to = trade.teams.find(b => b !== a);
      trade.give[a].players.forEach(id => {
        const p = state.players[id];
        if (!p) return;
        p.team = to; p.yearsWithTeam = 0; p.gleague = false;
        moved.push(p.name + ' to ' + to);
        [a, to].forEach(t => {
          const tm = state.teams[t];
          if (tm && Array.isArray(tm.rotation)) { tm.rotation = tm.rotation.filter(i => i !== id); if (t === to) tm.rotation.push(id); }
        });
      });
      trade.give[a].picks.forEach(ref => {
        const from = state.teams[a], dest = state.teams[to];
        const i = (from.picks || []).findIndex(pk => pickRef(pk) === ref);
        if (i < 0) return;
        const pk = from.picks.splice(i, 1)[0];
        (dest.picks = dest.picks || []).push(pk);
        moved.push(pickLabel(pk) + ' to ' + to);
      });
    });
    return { ok: true, text: moved.join(', ') };
  }

  function drawTrade(body, state) {
    const abbrs = teamAbbrs(state);
    if (!tradeSel.a || !state.teams[tradeSel.a]) tradeSel.a = state.userTeam && state.teams[state.userTeam] ? state.userTeam : abbrs[0];
    if (!tradeSel.b || !state.teams[tradeSel.b] || tradeSel.b === tradeSel.a) tradeSel.b = abbrs.find(a => a !== tradeSel.a);
    const side = key => {
      const abbr = tradeSel[key];
      const players = rosterOf(state, abbr);
      const picks = ((state.teams[abbr] && state.teams[abbr].picks) || []).slice().sort((x, y) => x.year - y.year || x.round - y.round);
      return `<div class="cm-side">
        <h3>${UI.logo(abbr, 30)}<select data-team="${key}">${abbrs.map(a => `<option value="${a}" ${a === abbr ? 'selected' : ''}>${esc(teamLabel(state, a))}</option>`).join('')}</select></h3>
        <div class="lv-k" style="margin-bottom:6px">${esc(abbr)} SENDS</div>
        <div class="cm-assets">
          ${players.map(p => { const k = key + '|p|' + p.id; return `<label class="cm-asset"><input type="checkbox" data-k="${esc(k)}" ${tradeSel.pick[k] ? 'checked' : ''}><span class="nm">${esc(p.name)}</span><span class="mt">${esc(p.pos)} | ${p.ovr} OVR | ${x$(salaryNow(state, p))}</span></label>`; }).join('')}
          ${picks.map(pk => { const k = key + '|k|' + pickRef(pk); return `<label class="cm-asset"><input type="checkbox" data-k="${esc(k)}" ${tradeSel.pick[k] ? 'checked' : ''}><span class="nm">${esc(pickLabel(pk))}</span><span class="mt">PICK</span></label>`; }).join('')}
        </div></div>`;
    };
    body.innerHTML = `<p class="muted">Pick any two teams and any players or picks. The AI does not get a say, but CBA problems are listed so you know what the rules would have said.</p>
      <div class="cm-trade">${side('a')}${side('b')}</div>
      <div class="cm-summary" id="cmSum"></div>
      <div class="row-btns"><button type="button" class="btn btn-gold" id="cmForce">FORCE TRADE</button><button type="button" class="btn" id="cmClear">CLEAR</button></div>`;
    const summary = () => {
      const t = buildTrade(state);
      const any = t.teams.some(a => t.give[a].players.length || t.give[a].picks.length);
      const btn = UI.$('#cmForce');
      btn.disabled = !any;
      if (!any) { UI.$('#cmSum').innerHTML = '<span class="muted">Select players or picks on either side.</span>'; return; }
      const w = warningsFor(state, t);
      const desc = t.teams.map(a => {
        const items = t.give[a].players.map(id => state.players[id] ? state.players[id].name : id)
          .concat(t.give[a].picks.map(r => { const [y, rd, o] = r.split('-'); return y + ' ' + (rd === '1' ? '1st' : '2nd') + ' (' + o + ')'; }));
        return `<div><b>${esc(a)}</b> sends ${items.length ? esc(items.join(', ')) : 'nothing'}</div>`;
      }).join('');
      UI.$('#cmSum').innerHTML = desc + (w.reasons.length
        ? `<div class="bad" style="margin-top:8px"><b>CBA WARNINGS</b> (the trade will still go through):<ul>${w.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>`
        : `<div class="ok" style="margin-top:8px">${w.checked ? 'No CBA problems found.' : 'No problems found by the basic checks (the CBA module is not loaded).'}</div>`);
    };
    body.querySelectorAll('select[data-team]').forEach(s => s.addEventListener('change', () => {
      const key = s.getAttribute('data-team');
      tradeSel[key] = s.value;
      if (tradeSel.a === tradeSel.b) tradeSel[key === 'a' ? 'b' : 'a'] = abbrs.find(a => a !== s.value);
      tradeSel.pick = {};
      drawTrade(body, state);
    }));
    body.querySelectorAll('input[data-k]').forEach(c => c.addEventListener('change', () => { tradeSel.pick[c.getAttribute('data-k')] = c.checked; summary(); }));
    UI.$('#cmClear').addEventListener('click', () => { tradeSel.pick = {}; drawTrade(body, state); });
    UI.$('#cmForce').addEventListener('click', () => {
      const t = buildTrade(state);
      const w = warningsFor(state, t);
      let r;
      try {
        r = window.TRADE && typeof window.TRADE.execute === 'function' ? window.TRADE.execute(state, t, { force: true }) : localExecute(state, t);
      } catch (e) { r = { ok: false, reason: e && e.message ? e.message : String(e) }; }
      if (!r || !r.ok) { UI.toast('The trade could not be made: ' + ((r && r.reason) || 'unknown problem'), 'error'); return; }
      const ids = t.teams.reduce((s, a) => s.concat(t.give[a].players), []);
      X().log(state, 'commissioner', 'Commissioner forced trade between ' + t.teams.join(' and ') + ': ' + (r.text || '') +
        (w.reasons.length ? ' (CBA warnings ignored: ' + w.reasons.join(' ') + ')' : ''), ids, { teams: t.teams.slice() });
      tradeSel.pick = {};
      X().refresh();
      X().persist();
      UI.toast('Trade done.');
      drawTrade(body, state);
    });
    summary();
  }

  // ---------- rules ----------
  function drawRules(body, state) {
    state.settings = state.settings || {};
    const ov = state.settings.overrides || {};
    const next = state.year + 1;
    const r = cba(state, next) || {};
    const defGames = r.seasonGames || 82;
    const defPlayIn = r.playIn != null ? !!r.playIn : next >= 2021;
    const defCap = r.cap || null;
    body.innerHTML = `<p class="muted">These rules start with the ${next - 1}-${String(next).slice(2)} season. The season in progress is not changed. Leave a field on default to follow real history.</p>
      <div class="cm-edit">
        <div class="cm-row">
          <label class="field"><span>SEASON LENGTH (GAMES)</span><input type="number" id="crGames" min="10" max="82" placeholder="Default ${defGames}" value="${ov.seasonGames || ''}"></label>
          <label class="field"><span>PLAYOFF TEAMS</span><select id="crPO"><option value="">Default (16)</option>${[4, 8, 12, 16, 20].map(n => `<option value="${n}" ${ov.playoffTeams === n ? 'selected' : ''}>${n} teams</option>`).join('')}</select></label>
          <label class="field"><span>PLAY-IN TOURNAMENT</span><select id="crPI"><option value="">Default (${defPlayIn ? 'on' : 'off'})</option><option value="on" ${ov.playIn === true ? 'selected' : ''}>On</option><option value="off" ${ov.playIn === false ? 'selected' : ''}>Off</option></select></label>
          <label class="field"><span>SALARY CAP OVERRIDE ($M)</span><input type="number" id="crCap" step="0.1" min="10" max="500" placeholder="${defCap ? 'Default ' + (defCap / 1e6).toFixed(1) : 'Real cap'}" value="${ov.salaryCap ? (ov.salaryCap / 1e6).toFixed(1) : ''}"></label>
        </div>
        <div class="row-btns"><button type="button" class="btn btn-gold" id="crSave">SAVE RULES</button><button type="button" class="btn btn-danger" id="crReset">BACK TO REAL RULES</button></div>
      </div>
      <div class="cm-summary">Stored overrides: <code>${esc(JSON.stringify(state.settings.overrides || {}))}</code></div>`;
    const describe = o => {
      const parts = [];
      if (o.seasonGames) parts.push(o.seasonGames + '-game seasons');
      if (o.playoffTeams) parts.push(o.playoffTeams + ' playoff teams');
      if (o.playIn != null) parts.push('play-in ' + (o.playIn ? 'on' : 'off'));
      if (o.salaryCap) parts.push('salary cap ' + x$(o.salaryCap));
      return parts.length ? parts.join(', ') : 'real rules';
    };
    UI.$('#crSave').addEventListener('click', () => {
      const games = Number(UI.$('#crGames').value) || null;
      const po = Number(UI.$('#crPO').value) || null;
      const pi = UI.$('#crPI').value;
      const cap = Number(UI.$('#crCap').value) || null;
      const o = { fromYear: next };
      if (games) o.seasonGames = clamp(Math.round(games), 10, 82);
      if (po) o.playoffTeams = po;
      if (pi) o.playIn = pi === 'on';
      if (cap) o.salaryCap = Math.round(clamp(cap, 10, 500) * 1e6);
      const before = describe(state.settings.overrides || {});
      state.settings.overrides = o;
      X().log(state, 'commissioner', 'Commissioner rule change from ' + (next - 1) + '-' + String(next).slice(2) + ': ' + before + ' to ' + describe(o) + '.', []);
      X().refresh(); X().persist();
      UI.toast('Rules saved for future seasons.');
      drawRules(body, state);
    });
    UI.$('#crReset').addEventListener('click', () => {
      if (!state.settings.overrides || !Object.keys(state.settings.overrides).length) { UI.toast('Already on the real rules.'); return; }
      const before = describe(state.settings.overrides);
      delete state.settings.overrides;
      X().log(state, 'commissioner', 'Commissioner rule change: ' + before + ' back to the real rules.', []);
      X().refresh(); X().persist();
      UI.toast('Back to the real rules.');
      drawRules(body, state);
    });
  }

  // ---------- log ----------
  function drawLog(body, state) {
    const list = (state.transactions || []).filter(t => t && t.type === 'commissioner').slice().reverse();
    body.innerHTML = list.length
      ? `<ol class="pbp cm-log">${list.map(t => `<li><small>${t.year - 1}-${String(t.year).slice(2)} DAY ${(t.day || 0) + 1}</small>${esc(t.text)}</li>`).join('')}</ol>`
      : '<p class="muted">No commissioner changes yet.</p>';
  }
})();
