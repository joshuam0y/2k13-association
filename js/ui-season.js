// Season pages: the Association hub with sim controls, box score, standings, stats, playoffs, saves.
(function () {
  'use strict';
  const UI = window.UI;
  const P = UI.pages = UI.pages || {};
  const esc = UI.esc;

  const needSeason = app => {
    if (!UI.canPlay()) { app.innerHTML = UI.notBuilt('engine'); return true; }
    if (!UI.state.game) {
      app.innerHTML = UI.empty('NO LEAGUE LOADED', 'Start a new Association or load one of your saves.',
        '<div class="row-btns"><a class="btn btn-gold" href="#/new">PLAY THE ASSOCIATION</a><a class="btn" href="#/saves">LOAD</a></div>');
      return true;
    }
    return false;
  };

  // =====================================================================
  // SEASON CALENDAR (2K13 style strip of key dates, countdowns and "today" banners)
  // =====================================================================
  // Real dates by season-ending year, month-day. Used for display; the trade deadline the game
  // enforces comes from the league modules (see deadlineMD) so the calendar never disagrees with them.
  const REAL = {
    tradeDeadline: { 2013: '02-21', 2014: '02-20', 2015: '02-19', 2016: '02-18', 2017: '02-23', 2018: '02-08', 2019: '02-07', 2020: '02-06', 2021: '03-25', 2022: '02-10', 2023: '02-09', 2024: '02-08', 2025: '02-06', 2026: '02-05' },
    allStar: { 2013: '02-17', 2014: '02-16', 2015: '02-15', 2016: '02-14', 2017: '02-19', 2018: '02-18', 2019: '02-17', 2020: '02-16', 2021: '03-07', 2022: '02-20', 2023: '02-19', 2024: '02-18', 2025: '02-16', 2026: '02-15' },
    cupFinal: { 2024: '2023-12-09', 2025: '2024-12-17', 2026: '2025-12-16' },
    draft: { 2013: '06-27', 2014: '06-26', 2015: '06-25', 2016: '06-23', 2017: '06-22', 2018: '06-21', 2019: '06-20', 2020: '11-18', 2021: '07-29', 2022: '06-23', 2023: '06-22', 2024: '06-26', 2025: '06-25' },
    freeAgency: { 2020: '11-20', 2021: '08-02' },
    camp: { 2020: '12-01', 2021: '09-28' }
  };
  UI.REAL_DATES = REAL;
  const DAY_MS = 86400000;
  const isoT = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const addDays = (iso, n) => new Date(isoT(iso) + n * DAY_MS).toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((isoT(b) - isoT(a)) / DAY_MS);
  const shortDate = iso => { if (!iso) return ''; const d = new Date(iso + 'T12:00:00'); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase(); };
  const cbaRules = y => { try { return window.CBA && window.CBA.rules ? window.CBA.rules(y) || {} : {}; } catch (e) { return {}; } };

  // The trade deadline the game enforces (js/trade.js and js/league.js). Reads LEAGUE.KEY_DATES or a
  // TRADE helper when one is exported (string "MM-DD", { year: "MM-DD" } or a function of the year).
  function deadlineMD(year) {
    const pickV = v => (typeof v === 'function' ? v(year) : v && typeof v === 'object' ? v[year] : v);
    let v = null;
    try {
      const L = window.LEAGUE, T = window.TRADE;
      v = pickV(L && L.KEY_DATES && L.KEY_DATES.tradeDeadline);
      if (!v && T && typeof T.deadline === 'function') v = T.deadline(year);
      if (!v && T) v = pickV(T.DEADLINE_MD || T.KEY_DATES && T.KEY_DATES.tradeDeadline);
    } catch (e) { v = null; }
    v = typeof v === 'string' && /\d\d-\d\d$/.test(v) ? v.slice(-5) : '02-21';
    return v;
  }
  // All-Star Sunday: the real date, else the Sunday inside the longest February gap in the schedule.
  function allStarDate(s, year) {
    if (REAL.allStar[year]) return year + '-' + REAL.allStar[year];
    const reg = (s.days || []).filter(d => !d.playoff);
    let best = null;
    for (let i = 1; i < reg.length; i++) {
      const a = reg[i - 1].date, b = reg[i].date;
      if (!/-0[23]-/.test(b)) continue;
      const gap = daysBetween(a, b);
      if (gap >= 3 && (!best || gap > best.gap)) best = { a, gap };
    }
    if (best) {
      for (let k = 1; k < best.gap; k++) { const d = addDays(best.a, k); if (new Date(d + 'T12:00:00Z').getUTCDay() === 0) return d; }
      return addDays(best.a, Math.ceil(best.gap / 2));
    }
    return year + '-02-16';
  }
  // Every playoff series by id, and the first day a Finals game is on the schedule.
  function finalsStart(s) {
    const b = s.playoffs;
    if (!b || !Array.isArray(b.rounds) || b.rounds.length < 4) return null;
    const ids = {};
    (b.rounds[3] || []).forEach(x => { if (x && x.id) ids[x.id] = 1; });
    const d = (s.days || []).find(day => day.playoff && (day.games || []).some(g => ids[g.series]));
    return d ? d.date : null;
  }

  const OFF_KEYS = { lottery: 'draftLottery', draft: 'draft', resign: 'resign', fa: 'freeAgency', camp: 'training' };
  // -> { year, today, prev, events: [{ key, label, date, sub, approx, status: past|today|now|next|future, days }] }
  UI.seasonCalendar = function () {
    const g = UI.state.game;
    const s = g && g.season;
    if (!g || !s || !Array.isArray(s.days)) return null;
    const Y = g.year;
    const rules = cbaRules(Y);
    const reg = s.days.filter(d => !d.playoff);
    const first = reg.length ? reg[0].date : null;
    const lastReg = reg.length ? reg[reg.length - 1].date : null;
    const off = UI.inOffseason();
    const sp = s.phase;
    const today = off ? null : UI.currentDate();
    const prev = !off && s.day > 0 && s.days[s.day - 1] ? s.days[s.day - 1].date : null;
    const poStart = (s.playoffs && s.playoffs.startDate) || (lastReg ? addDays(lastReg, 3) : null);
    const fin = finalsStart(s);
    const asg = allStarDate(s, Y);
    const dl = Y + '-' + deadlineMD(Y);
    const ev = [];
    const add = (key, label, date, extra) => ev.push(Object.assign({ key, label, date: date || null }, extra || {}));
    add('opening', 'OPENING NIGHT', first);
    if (rules.nbaCup) add('cup', 'NBA CUP FINAL', REAL.cupFinal[Y] || (Y - 1) + '-12-16', { approx: !REAL.cupFinal[Y] });
    add('deadline', 'TRADE DEADLINE', dl);
    add('allStar', 'ALL-STAR WEEKEND', asg);
    add('endRegular', 'END OF REGULAR SEASON', lastReg);
    if (rules.playIn) add('playIn', 'PLAY-IN', lastReg ? addDays(lastReg, 1) : null, { sub: 'SEEDS 7 TO 10' });
    add('playoffs', 'PLAYOFFS', poStart);
    add('finals', 'NBA FINALS', fin || (poStart ? addDays(poStart, 40) : null), { approx: !fin });
    add('lottery', 'DRAFT LOTTERY', null, { sub: 'AFTER THE FINALS' });
    add('draft', 'DRAFT DAY', Y + '-' + (REAL.draft[Y] || '06-25'), { approx: !REAL.draft[Y] });
    add('resign', 'RE-SIGNING', null, { sub: 'AFTER THE DRAFT' });
    add('fa', 'FREE AGENCY', Y + '-' + (REAL.freeAgency[Y] || (Y >= 2019 ? '06-30' : '07-01')));
    add('camp', 'TRAINING CAMP', Y + '-' + (REAL.camp[Y] || (Y <= 2016 ? '10-01' : '09-26')), { approx: !REAL.camp[Y], sub: UI.seasonLabel(Y + 1) });

    // In-season dates in calendar order (the deadline falls after the All-Star break in some years)
    const inSeason = ev.filter(e => !OFF_KEYS[e.key]).map((e, i) => ({ e, i }))
      .sort((x, y) => (x.e.date && y.e.date && x.e.date !== y.e.date ? (x.e.date < y.e.date ? -1 : 1) : x.i - y.i)).map(x => x.e);
    ev.splice(0, inSeason.length, ...inSeason);
    const champ = s.playoffs && s.playoffs.champion;
    const offIdx = off ? UI.OFFSEASON().indexOf(g.phase) : -1;
    ev.forEach(e => {
      const offPhase = OFF_KEYS[e.key];
      if (offPhase) {
        const i = UI.OFFSEASON().indexOf(offPhase);
        e.status = !off ? 'future' : i < offIdx ? 'past' : i === offIdx ? 'now' : 'future';
        return;
      }
      if (off) { e.status = 'past'; return; }
      if (e.key === 'finals') e.status = champ ? 'past' : fin && today >= fin ? 'now' : 'future';
      else if (e.key === 'playoffs') e.status = sp === 'playoffs' ? (fin && today >= fin ? 'past' : 'now') : 'future';
      else if (sp !== 'regular') e.status = 'past';
      else if (e.key === 'allStar') e.status = prev && prev < e.date && e.date <= today ? 'today' : e.date < today ? 'past' : 'future';
      else if (e.key === 'opening') e.status = s.day === 0 ? 'today' : 'past';
      else if (!e.date || !today) e.status = 'future';
      else e.status = e.date < today ? 'past' : e.date === today ? 'today' : 'future';
    });
    const nx = ev.find(e => e.status === 'future');
    if (nx) nx.status = 'next';
    ev.forEach(e => { if (today && e.date && (e.status === 'next' || e.status === 'future') && !OFF_KEYS[e.key]) e.days = daysBetween(today, e.date); });
    return { year: Y, today, prev, off, events: ev, deadline: dl, allStar: asg, lastReg, poStart, first };
  };
  const inDays = n => (n <= 0 ? 'TODAY' : n === 1 ? 'TOMORROW' : 'IN ' + n + ' DAYS');

  // The moment the league is in right now: a banner for the day itself, or null.
  // -> { key, kicker, title, text, href, btn, short }
  UI.seasonMoment = function () {
    const g = UI.state.game;
    const cal = UI.seasonCalendar();
    if (!g || !cal) return null;
    const s = g.season, u = g.userTeam;
    const find = k => cal.events.find(e => e.key === k);
    const t = UI.team(u);
    if (cal.off) {
      const ph = g.phase;
      if (ph === 'draftLottery') {
        return { key: 'lottery', kicker: 'OFFSEASON', title: 'DRAFT LOTTERY', short: 'DRAFT LOTTERY',
          text: 'The ping-pong balls decide the order of the top picks. Run the lottery to see where you pick.', href: '#/draft', btn: 'DRAFT ORDER' };
      }
      if (ph === 'draft') {
        let picks = [];
        try { picks = UI.state.L && UI.state.L.userPicksLeft ? UI.state.L.userPicksLeft(g) : []; } catch (e) { picks = []; }
        const nums = picks.map(x => '#' + (x.overall || x.pick || '?'));
        const onClock = g.draft && g.draft.userOnClock;
        return { key: 'draft', kicker: 'TODAY', title: 'DRAFT DAY' + (nums.length ? ': YOU PICK ' + nums[0] : ''), short: 'NBA DRAFT',
          text: onClock ? 'You are on the clock with pick #' + onClock + '.' : nums.length > 1 ? 'Your picks: ' + nums.join(', ') + '.' : nums.length ? 'Scout the class and get ready to make your pick.' : 'You have no picks left in this draft. The rest of the league is picking.',
          href: '#/draft', btn: 'GO TO THE DRAFT ROOM' };
      }
      if (ph === 'resign') {
        let n = 0;
        try { const r = window.FA && window.FA.resignWindow ? window.FA.resignWindow(g) : null; n = r && Array.isArray(r.players) ? r.players.length : 0; } catch (e) { n = 0; }
        return { key: 'resign', kicker: 'OFFSEASON', title: 'RE-SIGNING WINDOW', short: 'RE-SIGNING',
          text: n ? n + ' of your player' + (n > 1 ? 's have' : ' has') + ' an expiring contract. Keep them before free agency opens.' : 'No contracts of yours are expiring. Free agency opens next.', href: '#/fa', btn: 'RE-SIGN PLAYERS' };
      }
      if (ph === 'freeAgency') {
        const top = UI.allPlayers().filter(p => p && p.team === 'FA' && !p.retired).sort((a, b) => (b.ovr || 0) - (a.ovr || 0)).slice(0, 3);
        return { key: 'fa', kicker: 'NOW', title: 'FREE AGENCY IS OPEN', short: 'FREE AGENCY',
          text: top.length ? 'Top names on the market: ' + top.map(p => p.name).join(', ') + '.' : 'Make your offers before the best players are gone.', href: '#/fa', btn: 'FREE AGENCY' };
      }
      if (ph === 'training') {
        return { key: 'camp', kicker: 'OFFSEASON', title: 'TRAINING CAMP', short: 'TRAINING CAMP',
          text: 'The ' + UI.seasonLabel(g.year + 1) + ' season is next. Set your starters and minutes before opening night.', href: '#/manage', btn: 'SET THE ROTATION' };
      }
      return null;
    }
    const dl = find('deadline'), as = find('allStar'), fin = find('finals'), po = find('playoffs');
    if (dl && dl.status === 'today') {
      return { key: 'deadline', kicker: 'TODAY', title: 'TRADE DEADLINE', short: 'TRADE DEADLINE TODAY',
        text: 'Last chance to make trades. After today, rosters are locked until the season is over.', href: '#/trade', btn: 'MAKE A TRADE' };
    }
    if (as && as.status === 'today') {
      const st = g.allStars && g.allStars.year === g.year ? g.allStars : null;
      const mine = [];
      if (st) ['East', 'West'].forEach(c => { const x = st[c]; if (x) (x.starters || []).concat(x.reserves || []).forEach(id => { const p = UI.player(id); if (p && p.team === u) mine.push(p.name); }); });
      return { key: 'allStar', kicker: shortDate(as.date), title: 'ALL-STAR WEEKEND', short: 'ALL-STAR WEEKEND',
        text: st ? (mine.length ? mine.join(', ') + (mine.length > 1 ? ' made' : ' made') + ' the team. ' : 'None of your players made the team this year. ') + 'The league takes its break.' : 'The league takes its break. The rosters are named when play resumes.',
        href: st ? '#/awards/allstars' : null, btn: st ? 'SEE THE ALL-STAR ROSTERS' : null };
    }
    const op = find('opening');
    if (op && op.status === 'today') {
      return { key: 'opening', kicker: 'TONIGHT', title: 'OPENING NIGHT', short: 'OPENING NIGHT',
        text: 'The ' + UI.seasonLabel(g.year) + ' season tips off. Set your rotation, then play your first game.', href: '#/manage', btn: 'SET THE ROTATION' };
    }
    const er = find('endRegular');
    if (er && er.status === 'today') {
      const r = UI.confTable(t.conf).find(z => z.abbr === u);
      return { key: 'endRegular', kicker: 'TODAY', title: 'FINAL DAY OF THE REGULAR SEASON', short: 'FINAL DAY OF THE SEASON',
        text: r ? 'You sit #' + r.rank + ' in the ' + t.conf + '. Seeds lock after tonight.' : 'Seeds lock after tonight.', href: '#/standings', btn: 'STANDINGS' };
    }
    if (fin && fin.status === 'now') {
      const b = s.playoffs && UI.normBracket(s.playoffs);
      const x = b && b.rounds[3] && b.rounds[3].series[0];
      const mineF = x && (x.a === u || x.b === u);
      return { key: 'finals', kicker: 'NOW', title: 'THE NBA FINALS', short: mineF ? 'NBA FINALS: ' + seriesText(x) : 'NBA FINALS',
        text: x && x.a && x.b ? UI.teamName(x.a) + ' vs ' + UI.teamName(x.b) + (x.aw != null ? ', ' + x.aw + '-' + x.bw + '.' : '.') + (mineF ? ' Four wins from a title.' : '') : 'The title is on the line.', href: '#/playoffs', btn: 'SEE THE BRACKET' };
    }
    if (po && po.status === 'now') {
      const started = UI.games().some(x => x.playoff && x.played);
      if (!started) {
        const ser = userSeries();
        const opp = ser ? (ser.a === u ? ser.b : ser.a) : null;
        const r = UI.confTable(t.conf).find(z => z.abbr === u);
        return { key: 'playoffs', kicker: shortDate(po.date), title: 'THE PLAYOFFS ARE SET', short: 'PLAYOFFS',
          text: opp ? 'You open against the ' + UI.teamName(opp) + (r ? ' as the #' + r.rank + ' seed in the ' + t.conf : '') + '.' : 'You finished ' + (r ? '#' + r.rank + ' in the ' + t.conf : 'out of the top eight') + ' and missed the playoffs. The Draft Lottery is next.',
          href: '#/playoffs', btn: 'SEE THE BRACKET' };
      }
    }
    // The day after the deadline went by
    if (dl && cal.prev && cal.prev <= dl.date && cal.today > dl.date && s.phase === 'regular') {
      return { key: 'deadlinePassed', kicker: 'DEADLINE PASSED', title: 'ROSTERS ARE LOCKED', short: 'TRADE DEADLINE PASSED',
        text: 'No more trades until the season is over. Free agents can still be signed.', href: '#/fa', btn: 'FREE AGENTS' };
    }
    return null;
  };

  // Short text for the top bar chip: the moment, a close countdown, or the date.
  UI.seasonStatus = function () {
    const g = UI.state.game;
    if (!g || !g.season) return null;
    const cal = UI.seasonCalendar();
    const m = UI.seasonMoment();
    const d = UI.currentDate();
    const title = d && !cal.off ? UI.dateLabel(d) : '';
    if (m) return { text: m.short, hot: true, title };
    if (cal.off) return { text: (UI.PHASES[g.phase] || g.phase || '').toUpperCase(), hot: false, title };
    if (g.season.phase === 'playoffs') {
      const ser = userSeries();
      return { text: ser && !ser.winner ? 'PLAYOFFS: ' + seriesText(ser) : 'PLAYOFFS', hot: false, title };
    }
    const nx = cal.events.find(e => e.status === 'next' && e.days != null);
    if (nx && nx.days <= 21) return { text: nx.label + ' ' + inDays(nx.days), hot: nx.days <= 3, title };
    return { text: d ? UI.dateLabel(d).toUpperCase() : 'DAY ' + (UI.currentDay() + 1), hot: false, title };
  };

  function calendarHtml() {
    const cal = UI.seasonCalendar();
    if (!cal) return '';
    const evs = cal.events;
    const nx = evs.find(e => e.status === 'next');
    const cds = evs.filter(e => (e.status === 'next' || e.status === 'future') && e.days != null && e.days > 0).slice(0, 2);
    const count = cds.map((e, i) => `<span class="cal-cd${i ? ' dim' : ''}">${esc(e.label.replace(/^END OF /, 'END OF '))} <b>${esc(inDays(e.days))}</b></span>`).join('');
    const items = [];
    let todayPlaced = false;
    evs.forEach(e => {
      // A "today" flag sits between the last event that went by and the next one.
      if (!todayPlaced && cal.today && (e.status === 'next' || e.status === 'future') && !evs.some(x => x.status === 'today' || x.status === 'now')) {
        items.push(`<li class="cal-ev cal-flag" aria-current="date"><i></i><b>TODAY</b><small>${esc(shortDate(cal.today))}</small></li>`);
        todayPlaced = true;
      }
      const when = e.date ? (e.approx ? '~' : '') + shortDate(e.date) : (e.sub || '');
      const tag = e.status === 'today' || e.status === 'now' ? `<em>${e.status === 'now' ? 'NOW' : 'TODAY'}</em>` : e.status === 'next' && e.days != null ? `<em>${esc(inDays(e.days))}</em>` : '';
      items.push(`<li class="cal-ev ${e.status}"${e.status === 'today' || e.status === 'now' ? ' aria-current="date"' : ''}><i></i><b>${esc(e.label)}</b><small>${esc(when)}${e.date && e.sub ? ' | ' + esc(e.sub) : ''}</small>${tag}</li>`);
    });
    return `<section class="cal" aria-label="Season calendar">
      <div class="cal-head"><span class="cal-k">${esc(UI.seasonLabel(cal.year))} CALENDAR</span>${count ? `<span class="cal-cds">${count}</span>` : nx && cal.off ? `<span class="cal-cds"><span class="cal-cd">NEXT: <b>${esc(nx.label)}</b></span></span>` : ''}</div>
      <ol class="cal-strip">${items.join('')}</ol></section>`;
  }
  function momentHtml(m) {
    if (!m) return '';
    return `<section class="moment m-${esc(m.key)}" role="status"><div class="mo-text"><span class="mo-k">${esc(m.kicker)}</span><b class="mo-t">${esc(m.title)}</b><p>${esc(m.text)}</p></div>
      ${m.href && m.btn ? `<a class="btn btn-gold mo-btn" href="${esc(m.href)}">${esc(m.btn)}</a>` : ''}</section>`;
  }

  // =====================================================================
  // NEWS: kinds, badges and a stable newest-first order (shared with js/ui-history.js)
  // =====================================================================
  const NEWS_KINDS = [['trade', 'TRADE'], ['injury', 'INJURY'], ['signing', 'SIGNING'], ['award', 'AWARD'], ['milestone', 'MILESTONE'], ['draft', 'DRAFT'], ['world', 'WORLD'], ['league', 'LEAGUE']];
  UI.NEWS_KINDS = NEWS_KINDS;
  const TYPE_KIND = { trade: 'trade', sign: 'signing', signing: 'signing', release: 'signing', injury: 'injury', award: 'award', playoffs: 'award', allStars: 'award', milestone: 'milestone', record: 'milestone', draft: 'draft', world: 'world', retire: 'league', coach: 'league' };
  function newsKind(n) {
    if (!n) return 'league';
    if (n.world) return 'world';
    if (n.type && TYPE_KIND[n.type]) return TYPE_KIND[n.type];
    const h = (n.headline || '') + ' ' + (n.headline ? '' : n.body || '');
    if (/requests? a trade/i.test(h)) return 'league';
    if (/\btrade[sd]?\b|\bacquire|blockbuster|\bdeal\b|swap picks|\bship\b|headed to/i.test(h)) return 'trade';
    if (/injur|\btorn\b|sprain|fractur|surgery|out for the season|miss(es)? about/i.test(h)) return 'injury';
    if (/\bMVP\b|All-Star|All-NBA|All-Defens|All-Rookie|of the Year|\baward|title\b|champion|Hall of Fame|jersey/i.test(h)) return 'award';
    if (/record|milestone|career-high|triple-double|\b[4-9]\d points\b/i.test(h)) return 'milestone';
    if (/\bsigns?\b|re-signs|agrees|opts? out|free agen|contract|waive|extension|offer sheet|qualifying/i.test(h)) return 'signing';
    if (/\bdraft|lottery|No\. 1 pick|\bselect/i.test(h)) return 'draft';
    return 'league';
  }
  const reEsc = x => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // -> { kind, label, mine, big }
  UI.newsInfo = function (n) {
    const g = UI.state.game;
    const kind = newsKind(n);
    const label = (NEWS_KINDS.find(k => k[0] === kind) || [0, 'LEAGUE'])[1];
    if (!g) return { kind, label, mine: false, big: false };
    const u = g.userTeam, t = g.teams && g.teams[u];
    const ps = (n.ids || []).map(id => g.players && g.players[id]).filter(Boolean);
    const txt = (n.headline || '') + ' ' + (n.body || '');
    const mine = !n.world && (ps.some(p => p.team === u) || /\byour team\b/i.test(txt) || (!!t && !!t.name && new RegExp('\\b' + reEsc(t.name) + '\\b').test(txt)));
    const top = ps.reduce((m, p) => Math.max(m, p.ovr || 0), 0);
    const big = mine || kind === 'award' || kind === 'milestone' || /blockbuster|title|champion/i.test(txt) ||
      (kind === 'trade' && top >= 80) || (kind === 'injury' && top >= 82) || (kind === 'signing' && top >= 80);
    return { kind, label, mine, big };
  };
  // Modules write news in two orders (some unshift, some push), with different day counters in the
  // offseason. The UI gives each story a sequence number the first time it sees it, so the feed stays
  // newest first. The first batch after a load is ordered by the welcome story: items before it were
  // added at the front (newest first), items after it at the back (oldest first).
  const newsSeq = new WeakMap();
  let seqN = 0;
  function orderFresh(arr, isFresh, anchor) {
    const head = [], tail = [];
    arr.forEach((n, i) => { if (isFresh(n)) (i <= anchor ? head : tail).push(n); });
    head.reverse();
    const keyed = list => { let y = null, m = -Infinity; return list.map(n => { const yr = n.year || 0; if (yr !== y) { y = yr; m = -Infinity; } m = Math.max(m, n.day == null ? m : Number(n.day) || 0); return { n, y: yr, d: m }; }); };
    const a = keyed(head), b = keyed(tail), out = [];
    let i = 0, j = 0;
    while (i < a.length || j < b.length) {
      if (j >= b.length || (i < a.length && (a[i].y < b[j].y || (a[i].y === b[j].y && a[i].d <= b[j].d)))) out.push(a[i++].n);
      else out.push(b[j++].n);
    }
    out.forEach(n => newsSeq.set(n, ++seqN));
  }
  UI.newsList = function () {
    const g = UI.state.game;
    if (!g) return [];
    const arr = (g.news || []).filter(n => n && typeof n === 'object' && (n.headline || n.body));
    const known = arr.findIndex(n => newsSeq.has(n));
    if (arr.some(n => !newsSeq.has(n))) {
      let anchor;
      if (known < 0) { anchor = arr.findIndex(n => /^Welcome to the /.test(n.headline || '')); if (anchor < 0) anchor = arr.length - 1; }
      else anchor = known - 1;
      orderFresh(arr, n => !newsSeq.has(n), anchor);
    }
    let extra = [];
    try { extra = typeof UI.newsExtras === 'function' ? UI.newsExtras(g) || [] : []; } catch (e) { extra = []; }
    extra.forEach(n => { if (!newsSeq.has(n)) newsSeq.set(n, ++seqN); });
    return arr.concat(extra).sort((x, y) => newsSeq.get(y) - newsSeq.get(x));
  };
  UI.newsBadge = (info, cls) => `<span class="nbadge nb-${esc(info.kind)}${cls ? ' ' + cls : ''}">${esc(info.label)}</span>`;
  UI.newsDate = function (n) {
    const g = UI.state.game;
    if (n.date) return shortDate(n.date);
    if (g && g.season && n.year === g.year && n.day != null && g.season.days && g.season.days[n.day] && n.day < (g.season.day || 0) + 1) return shortDate(g.season.days[n.day].date);
    return UI.seasonLabel(n.year || UI.year());
  };
  function hubNewsHtml() {
    const list = UI.newsList().slice(0, 5);
    if (!list.length) return '';
    const href = '#/' + (UI.pages.news ? 'news' : 'league');
    return `<section class="hub-news">${UI.header('LATEST NEWS', `<a href="${href}">ALL NEWS</a>`)}
      <ul class="hn-list">${list.map(n => {
        const info = UI.newsInfo(n);
        return `<li class="hn${info.mine ? ' mine' : ''}${info.big ? ' big' : ''}"><a href="${href}${info.mine ? '/mine' : '/' + info.kind}">${UI.newsBadge(info)}<span class="hn-h">${esc(n.headline || n.body)}</span><small>${info.mine ? '<i>YOUR TEAM</i> ' : ''}${esc(UI.newsDate(n))}</small></a></li>`;
      }).join('')}</ul></section>`;
  }

  // =====================================================================
  // WHILE YOU WERE SIMMING
  // =====================================================================
  // Each hub render keeps a snapshot of the league (news, moves, injuries, the day). When the next
  // render finds the league moved on, the difference becomes the summary card.
  let snapMark = null, lastSummary = null;
  function snapshot(g) {
    const s = g.season;
    const inj = {};
    if (s && s.injuries) Object.keys(s.injuries).forEach(id => { inj[id] = s.injuries[id] && s.injuries[id].games; });
    return {
      g, season: s, year: g.year, phase: g.phase, sphase: s && s.phase, day: s ? s.day || 0 : 0,
      date: UI.currentDate(), news: new WeakSet((g.news || []).filter(x => x && typeof x === 'object')),
      tx: new WeakSet((g.transactions || []).filter(x => x && typeof x === 'object')), inj, seasons: (g.history && g.history.seasons || []).length
    };
  }
  const moved = (a, b) => a.year !== b.year || a.phase !== b.phase || a.sphase !== b.sphase || a.day !== b.day || a.season !== b.season;
  function buildSummary(a, b) {
    const g = b.g, u = g.userTeam, s = g.season;
    const out = { from: a, to: b, games: [], rows: [], played: 0 };
    const P1 = id => g.players && g.players[id];
    const teamNick = UI.team(u).name || u;
    // the user's games and big box score lines
    if (a.season === s && s.days) {
      for (let i = a.day; i < Math.min(b.day, s.days.length); i++) {
        (s.days[i].games || []).forEach(gm => {
          if (!gm.played) return;
          const box = s.boxScores && s.boxScores[gm.id];
          const mineG = gm.home === u || gm.away === u;
          if (mineG) { const r = resultParts({ home: gm.home, away: gm.away, hs: gm.hs, as: gm.as }); out.games.push(Object.assign({ id: gm.id }, r)); }
          const rows = box && box.home && typeof box.home === 'object' ? [].concat(box.home.box || [], box.away.box || []) : [];
          rows.forEach(r => {
            if (!r || !(r.min > 0)) return;
            const p = P1(r.id);
            if (!p) return;
            const reb = r.reb != null ? r.reb : (r.oreb || 0) + (r.dreb || 0);
            const dbl = [r.pts || 0, reb, r.ast || 0, r.stl || 0, r.blk || 0].filter(v => v >= 10).length;
            const opp = gm.home === p.team ? gm.away : gm.home;
            const line = `${r.pts || 0} PTS, ${reb} REB, ${r.ast || 0} AST`;
            const mineP = p.team === u && mineG;
            let what = null;
            if (r.pts >= 50) what = 'scored ' + r.pts + ' points';
            else if (mineP && r.pts >= 40) what = 'scored ' + r.pts + ' points';
            else if (mineP && dbl >= 3) what = 'had a triple-double (' + line + ')';
            else if (mineP && reb >= 20) what = 'grabbed ' + reb + ' rebounds';
            else if (mineP && (r.ast || 0) >= 15) what = 'dished ' + r.ast + ' assists';
            else if (mineP && (r.blk || 0) >= 8) what = 'blocked ' + r.blk + ' shots';
            if (what) out.rows.push({ kind: 'milestone', label: 'MILESTONE', mine: mineP, pri: mineP ? 1 : 4, text: p.name + ' ' + what + ' vs ' + opp + '.', href: '#/game/' + encodeURIComponent(gm.id) });
          });
        });
      }
    }
    // moves
    const txNew = (g.transactions || []).filter(x => x && typeof x === 'object' && !a.tx.has(x));
    const seenIds = {};
    txNew.forEach(x => {
      const ps = (x.ids || []).map(P1).filter(Boolean);
      const top = ps.reduce((m, p) => Math.max(m, p.ovr || 0), 0);
      const mineX = (x.teams || []).includes(u) || ps.some(p => p.team === u) || new RegExp('\\b' + reEsc(teamNick) + '\\b').test(x.text || '');
      let kind = null, pri = 9;
      if (x.type === 'trade' && (mineX || top >= 78)) { kind = 'trade'; pri = mineX ? 0 : 2; }
      else if (/^(sign|resign|extension|offerSheet)$/.test(x.type) && (mineX || top >= 80)) { kind = 'signing'; pri = mineX ? 1 : 3; }
      else if (x.type === 'retire' && (mineX || top >= 82)) { kind = 'league'; pri = 5; }
      else if (x.type === 'release' && mineX) { kind = 'signing'; pri = 3; }
      else if (x.type === 'draft' && mineX) { kind = 'draft'; pri = 1; }
      if (!kind) return;
      ps.forEach(p => { seenIds[p.id] = 1; });
      out.rows.push({ kind, label: (NEWS_KINDS.find(k => k[0] === kind) || [0, 'LEAGUE'])[1], mine: mineX, pri, text: x.text || '', href: '#/news/transactions' });
    });
    // injuries to stars and to the user's players
    if (a.season === s && s && s.injuries) {
      Object.keys(s.injuries).forEach(id => {
        const cur = s.injuries[id], p = P1(id);
        if (!p || !cur || a.inj[id] != null || !(cur.games > 0)) return;
        const mineP = p.team === u;
        if (!mineP && !((p.ovr || 0) >= 82 && cur.games >= 5)) return;
        out.rows.push({ kind: 'injury', label: 'INJURY', mine: mineP, pri: mineP ? 0 : 3, text: p.name + ' (' + p.team + '): ' + (cur.type || 'injury') + ', out about ' + cur.games + ' games.', href: '#/player/' + encodeURIComponent(id) });
        seenIds[id] = 1;
      });
    }
    // stories: awards, world news, the user's own headlines (not repeated from the moves above)
    const newsNew = (g.news || []).filter(n => n && typeof n === 'object' && !a.news.has(n) && (n.headline || n.body));
    newsNew.forEach(n => {
      const info = UI.newsInfo(n);
      if (info.kind === 'trade' || info.kind === 'injury') return;
      if ((n.ids || []).some(id => seenIds[id]) && info.kind === 'signing') return;
      if (!(info.kind === 'award' || info.kind === 'world' || info.kind === 'milestone' || info.mine)) return;
      if (/ win the \d{4} title/.test(n.headline || '') && (g.history && g.history.seasons || []).length > a.seasons) return;   // the champions row below says it
      out.rows.push({ kind: info.kind, label: info.label, mine: info.mine, pri: info.mine ? 1 : info.kind === 'award' ? 2 : 6, text: n.headline || n.body, href: '#/news' + (info.mine ? '/mine' : '/' + info.kind) });
    });
    // season awards when a season finished during the sim
    const hs = (g.history && g.history.seasons) || [];
    if (hs.length > a.seasons) hs.slice(a.seasons).forEach(h => {
      const c = UI.abbrOf(h.champion);
      if (c) out.rows.push({ kind: 'award', label: 'CHAMPIONS', mine: c === u, pri: 0, text: UI.teamName(c) + ' win the ' + h.year + ' title.', href: '#/history/' + h.year });
    });
    out.rows.sort((x, y) => x.pri - y.pri);
    out.extra = Math.max(0, out.rows.length - 8);
    out.rows = out.rows.slice(0, 8);
    return out;
  }
  function trackSim(g) {
    const cur = snapshot(g);
    if (snapMark && snapMark.g === g && moved(snapMark, cur)) {
      lastSummary = buildSummary(snapMark, cur);
      lastSummary.dismissed = false;
    }
    if (!snapMark || snapMark.g !== g) lastSummary = null;
    snapMark = cur;
  }
  function summaryHtml() {
    const x = lastSummary;
    if (!x || x.dismissed || x.to.g !== UI.state.game) return '';
    const a = x.from, b = x.to;
    let range;
    if (a.year === b.year && a.phase === b.phase && !UI.OFFSEASON().includes(b.phase) && a.date && b.date) {
      const prevB = b.season && b.season.days && b.day > 0 && b.season.days[b.day - 1] ? b.season.days[b.day - 1].date : b.date;
      const n = Math.max(1, daysBetween(a.date, prevB) + 1);
      range = shortDate(a.date) + (prevB !== a.date ? ' TO ' + shortDate(prevB) : '') + ' | ' + n + ' DAY' + (n > 1 ? 'S' : '');
    } else {
      const nm = st => (UI.OFFSEASON().includes(st.phase) ? UI.PHASES[st.phase] : UI.PHASES[st.sphase] || st.sphase || '') || '';
      range = (nm(a) + ' TO ' + nm(b)).toUpperCase();
    }
    const w = x.games.filter(r => r.won).length, l = x.games.length - w;
    const gamesHtml = x.games.length ? `<div class="wy-rec"><span class="wy-wl"><b>${w}-${l}</b><small>YOUR GAMES</small></span><span class="wy-games">${x.games.slice(-6).map(r =>
      `<a class="wy-g ${r.won ? 'win' : 'loss'}" href="#/game/${encodeURIComponent(r.id)}"><b>${r.won ? 'W' : 'L'}</b> ${r.us}-${r.them} <small>${r.home ? 'vs' : '@'} ${esc(r.opp)}</small></a>`).join('')}${x.games.length > 6 ? `<small class="muted">+${x.games.length - 6} more</small>` : ''}</span></div>` : '';
    const rows = x.rows.map(r => `<li class="${r.mine ? 'mine' : ''}"><span class="nbadge nb-${esc(r.kind)}">${esc(r.label)}</span>${r.href ? `<a href="${esc(r.href)}">${esc(r.text)}</a>` : `<span>${esc(r.text)}</span>`}</li>`).join('');
    if (!gamesHtml && !rows) return '';
    return `<section class="wyws" aria-label="While you were simming">
      <div class="wy-head"><span class="wy-k">WHILE YOU WERE SIMMING</span><small>${esc(range)}</small><button type="button" class="wy-x" id="wyClose" aria-label="Hide the summary">&times;</button></div>
      ${gamesHtml}${rows ? `<ul class="wy-list">${rows}</ul>` : '<p class="muted wy-quiet">A quiet stretch around the league.</p>'}
      ${x.extra ? `<a class="more" href="#/news">${x.extra} MORE IN THE NEWS</a>` : ''}</section>`;
  }

  // ---------- Association hub ----------
  // Built like the 2K13 Association hub: a team header, one big PLAY tile with the sim controls,
  // and eight menu tiles. Everything else is one click further in.
  function playOffseason(g) {
    const phases = UI.OFFSEASON();
    const idx = phases.indexOf(g.phase);
    const nextName = idx >= 0 && idx < phases.length - 1 ? UI.PHASES[phases[idx + 1]] : 'Opening Night';
    const last = g.history && Array.isArray(g.history.seasons) ? g.history.seasons[g.history.seasons.length - 1] : null;
    const champ = last && UI.abbrOf(last.champion);
    const link = {
      draftLottery: ['draft', 'DRAFT ORDER'], draft: ['draft', 'DRAFT ROOM'],
      resign: ['fa', 'RE-SIGN PLAYERS'], freeAgency: ['fa', 'FREE AGENCY'], training: ['manage', 'ROTATION']
    }[g.phase];
    return `<div class="mt-l">${esc((UI.PHASES[g.phase] || g.phase).toUpperCase())}</div>
      <ol class="os-dots" aria-label="Offseason steps">${phases.map((p, i) => `<li class="${i < idx ? 'done' : i === idx ? 'on' : ''}" title="${esc(UI.PHASES[p] || p)}"><span>${esc(UI.PHASES[p] || p)}</span></li>`).join('')}</ol>
      ${champ ? `<div class="play-note">${UI.logo(champ, 28)} <span>${esc(last.year)} CHAMPIONS: ${esc(UI.teamName(champ).toUpperCase())}</span></div>` : ''}
      <div class="play-btns">
        <button type="button" class="btn btn-gold btn-big" id="nextPhase">NEXT: ${esc(nextName.toUpperCase())}</button>
        ${link && UI.pages[link[0]] ? `<a class="btn btn-big" href="#/${link[0]}">${link[1]}</a>` : ''}
      </div>`;
  }

  // ---------- sim next game and the result strip ----------
  // The user's games this season in day order, and the ones already played.
  const myGames = () => { const u = UI.userTeam(); return UI.games().filter(x => x.home === u || x.away === u); };
  const myPlayed = () => myGames().filter(x => x.played);
  // Where the user's team stands in the playoffs: the latest series it is in (normalized), or null.
  function userSeries() {
    const s = UI.state.season;
    const br = s && s.playoffs ? UI.normBracket(s.playoffs) : null;
    const u = UI.userTeam();
    if (!br || !u) return null;
    let found = null;
    br.rounds.forEach(r => r.series.forEach(x => { if (x.a && x.b && (x.a === u || x.b === u)) found = Object.assign({ round: r.name }, x); }));
    return found;
  }
  function seriesText(x) {
    if (!x) return '';
    const u = UI.userTeam();
    const mine = x.a === u ? x.aw : x.bw, theirs = x.a === u ? x.bw : x.aw;
    const m = Number(mine) || 0, t = Number(theirs) || 0;
    const opp = x.a === u ? x.b : x.a;
    const word = x.winner ? (x.winner === u ? 'WON' : 'LOST') : m > t ? 'LEAD' : m < t ? 'TRAIL' : 'TIED';
    return `${word} ${m}-${t} VS ${opp}`;
  }
  // True when there is a user game left to sim to in this phase.
  function canSimNext() {
    const g = UI.state.game;
    if (!g || !g.season || UI.inOffseason()) return false;
    if (myGames().some(x => !x.played)) return true;
    const sp = g.season.phase;
    if (sp === 'playoffs') { const x = userSeries(); return !!x && !x.winner; }
    if (sp === 'regular') {
      const t = UI.team(g.userTeam);
      const r = t && UI.confTable(t.conf).find(z => z.abbr === g.userTeam);
      return !!r && r.rank <= 8;
    }
    return false;
  }
  // Marks the state before a sim so the hub can say what happened in it.
  let simMark = null;
  const markSim = () => { simMark = { year: UI.year(), n: myPlayed().length }; };
  // Sims until the user's next game is played. Regular season days are all scheduled, so one
  // { days: n } sim gets there. Playoff days are drawn one at a time, so those go a day at a time.
  async function simNextGame() {
    if (UI.simming || !canSimNext()) return;
    markSim();
    const before = simMark.n;
    for (let i = 0; i < 14; i++) {
      if (UI.simming || UI.pendingEvents() || UI.inOffseason()) break;
      const next = myGames().find(x => !x.played);
      // No game scheduled yet: finish the regular season first, then go a playoff day at a time.
      const regLeft = UI.state.season.phase === 'regular' ? UI.regularDays() - UI.currentDay() : 0;
      const n = next ? Math.max(1, next.day - UI.currentDay() + 1) : Math.max(1, regLeft);
      const r = await UI.sim({ days: n });
      // a popup is waiting, or the user stopped at a key date: let them answer before going on
      if (!r || (r.stopped && r.stopped !== 'days') || UI.pendingEvents()) break;
      if (myPlayed().length > before || !canSimNext()) break;
    }
  }
  UI.simNextGame = simNextGame;
  function resultParts(x) {
    const u = UI.userTeam();
    const home = x.home === u;
    const us = home ? x.hs : x.as, them = home ? x.as : x.hs;
    return { won: us > them, us, them, opp: home ? x.away : x.home, home };
  }
  // "W 112-104 vs LAL | 3-1 THIS SIM | 15-6" right under the PLAY header after a sim.
  function resultStrip() {
    if (!simMark || simMark.year !== UI.year() || UI.inOffseason()) return '';
    const played = myPlayed();
    if (played.length < simMark.n) return '';
    const fresh = played.slice(simMark.n);
    const row = UI.standings()[UI.userTeam()] || { w: 0, l: 0 };
    const recTxt = `<span class="rs-bit">${row.w}-${row.l}</span>`;
    if (!fresh.length) return `<div class="res-strip"><span class="rs-k">LAST SIM</span><span class="rs-bit muted">No game for your team</span>${recTxt}</div>`;
    const last = fresh[fresh.length - 1];
    const r = resultParts(last);
    const w = fresh.filter(x => resultParts(x).won).length;
    const po = last.playoff ? seriesText(userSeries()) : '';
    return `<div class="res-strip"><a class="rs-game" href="#/game/${encodeURIComponent(last.id)}"><b class="${r.won ? 'win' : 'loss'}">${r.won ? 'W' : 'L'}</b> ${r.us}-${r.them} <span>${r.home ? 'vs' : '@'} ${esc(r.opp)}</span><small>BOX</small></a>
      ${fresh.length > 1 ? `<span class="rs-bit">${w}-${fresh.length - w} THIS SIM</span>` : ''}${po ? `<span class="rs-bit">${esc(po)}</span>` : ''}${recTxt}</div>`;
  }
  // Wires every sim button on a page: data-how buttons go through UI.sim, "nextGame" sims to the next game.
  function wireSim(root) {
    root.querySelectorAll('.sim-btn[data-how]').forEach(b => b.addEventListener('click', () => {
      const how = JSON.parse(b.getAttribute('data-how'));
      if (how === 'nextGame') { simNextGame(); return; }
      markSim();
      UI.sim(how);
    }));
  }

  function playSeason(g, next, user) {
    const sp = g.season.phase;
    const reg = sp === 'regular';
    const btn = (how, label, cls, dis) => `<button type="button" class="btn sim-btn ${cls || ''}" data-how="${esc(JSON.stringify(how))}"${dis ? ' disabled' : ''}>${label}</button>`;
    let match;
    const ser = sp === 'playoffs' ? userSeries() : null;
    if (next) {
      const home = next.home === user;
      const opp = home ? next.away : next.home;
      match = `<a class="play-next" href="#/team/${esc(opp)}">${UI.logo(opp, 56)}<span><small>${next.playoff ? 'PLAYOFFS GAME ' + esc(next.gameNum || '') : 'NEXT GAME'} | ${esc(UI.gameDay(next).toUpperCase())}</small><b>${home ? 'VS' : '@'} ${esc(UI.teamName(opp).toUpperCase())}</b><small>${esc(UI.record(opp))}</small></span></a>`;
    } else if (ser && !ser.winner) {
      const opp = ser.a === user ? ser.b : ser.a;
      match = `<a class="play-next" href="#/playoffs">${UI.logo(opp, 56)}<span><small>${esc(ser.round)} | NEXT GAME</small><b>VS ${esc(UI.teamName(opp).toUpperCase())}</b><small>${esc(seriesText(ser))}</small></span></a>`;
    } else {
      const out = sp === 'playoffs' && ser && ser.winner && ser.winner !== user;
      match = `<div class="play-next"><span><small>${sp === 'playoffs' ? 'PLAYOFFS' : 'REGULAR SEASON'}</small><b>${sp === 'playoffs' ? (out ? 'ELIMINATED' : 'NO GAME LEFT') : 'COMPLETE'}</b>${out ? `<small>${esc(seriesText(ser))}</small>` : ''}</span></div>`;
    }
    const nextOk = canSimNext();
    return `<div class="mt-l">PLAY</div>
      ${resultStrip()}
      ${match}
      <div class="sim-btns">
        ${nextOk ? btn('nextGame', 'SIM NEXT GAME', 'btn-gold sim-next') : ''}${btn({ days: 1 }, 'SIM DAY', nextOk ? '' : 'btn-gold')}${btn({ days: 7 }, 'SIM WEEK')}${btn({ days: 30 }, 'SIM MONTH')}
        ${next && UI.pages.live ? `<a class="btn sim-btn lv-watch" href="#/live/next">WATCH LIVE</a>` : ''}
      </div>
      <details class="sim-more"><summary>SIM TO...</summary><div class="sim-more-list">
        ${btn('tradeDeadline', 'TRADE DEADLINE', '', !reg)}${btn('allStar', 'ALL-STAR BREAK', '', !reg)}${btn('endRegular', 'END OF REGULAR SEASON', '', !reg)}${btn('endPlayoffs', 'END OF PLAYOFFS')}
      </div></details>`;
  }

  P.season = function (app) {
    if (needSeason(app)) return;
    const g = UI.state.game;
    const user = g.userTeam;
    const t = UI.team(user);
    const s = g.season;
    const mine = UI.games().filter(x => x.home === user || x.away === user);
    const next = mine.find(x => !x.played);
    const last = mine.filter(x => x.played).slice(-1)[0];
    const off = UI.inOffseason();
    const row = UI.standings()[user] || { w: 0, l: 0, streakText: '-' };
    const confRow = UI.confTable(t.conf).find(r => r.abbr === user) || {};
    const date = UI.currentDate();
    const pending = UI.pendingEvents();
    const phaseName = (off ? UI.PHASES[g.phase] : UI.PHASES[s.phase] || s.phase) || '';

    let lastHtml = '';
    if (last) {
      const home = last.home === user;
      const won = home ? last.hs > last.as : last.as > last.hs;
      const opp = home ? last.away : last.home;
      lastHtml = `<a class="hh-last" href="#/game/${encodeURIComponent(last.id)}"><small>LAST GAME</small><b class="${won ? 'win' : 'loss'}">${won ? 'W' : 'L'} ${home ? last.hs : last.as}-${home ? last.as : last.hs}</b><span>${home ? 'vs' : '@'} ${esc(opp)}</span></a>`;
    }

    // The tile that matters most in this phase gets the gold edge.
    const hot = { draftLottery: 'draft', draft: 'draft', resign: 'fa', freeAgency: 'fa', training: 'manage' }[g.phase] || '';
    const tile = (key, href, icon, label) => UI.tile(href, icon, label, hot === key ? { cls: 'mt-hot', sub: 'NOW' } : null);
    trackSim(g);
    const moment = UI.seasonMoment();
    // Secondary links under the tiles: the minor league is one click away.
    let glName = '';
    if (UI.pages.gleague) {
      try { glName = window.GLEAGUE && window.GLEAGUE.leagueName ? String(window.GLEAGUE.leagueName(g.year) || '') : ''; } catch (e) { glName = ''; }
      glName = /D-League/i.test(glName) ? 'D-LEAGUE' : glName ? 'G LEAGUE' : g.year >= 2018 ? 'G LEAGUE' : 'D-LEAGUE';
    }
    const links = [glName && ['#/gleague', glName], UI.pages.news && ['#/news/transactions', 'TRANSACTIONS'], UI.pages.awards && ['#/awards', 'AWARD RACE'], ['#/playoffs', 'PLAYOFFS']].filter(Boolean);

    app.innerHTML = `
      <section class="hub-head" style="--c1:${esc(t.colors[0])};--c2:${esc(t.colors[1] || t.colors[0])}">
        ${UI.logo(user, 96)}
        <div class="hh-info">
          <div class="hh-k">${esc(UI.seasonLabel(g.year))} | ${esc(phaseName.toUpperCase())}${date && !off ? ' | ' + esc(UI.dateLabel(date).toUpperCase()) : ''}</div>
          <h1 class="hh-name">${esc(UI.teamName(user))}</h1>
          <div class="hh-stats">
            <div><b>${row.w}-${row.l}</b><small>RECORD</small></div>
            ${confRow.rank ? `<div><b>#${confRow.rank}</b><small>${esc(t.conf.toUpperCase())}</small></div>` : ''}
            <div><b>${esc(row.streakText)}</b><small>STREAK</small></div>
            <div><b>${UI.teamOvr(user) || '-'}</b><small>TEAM OVR</small></div>
          </div>
        </div>
        ${lastHtml}
      </section>
      ${pending ? `<div class="pending"><span><b>${pending}</b> decision${pending > 1 ? 's' : ''} waiting</span><button type="button" class="btn btn-gold btn-small" id="openEvents">DECIDE NOW</button></div>` : ''}
      ${momentHtml(moment)}
      ${summaryHtml()}
      ${calendarHtml()}
      <div class="hub-grid">
        <div class="mtile mt-play">${off ? playOffseason(g) : playSeason(g, next, user)}</div>
        ${tile('roster', '#/team/' + encodeURIComponent(user), 'roster', 'ROSTER')}
        ${tile('manage', '#/manage', 'rotation', 'ROTATION')}
        ${tile('trade', '#/trade', 'trade', 'TRADES')}
        ${tile('fa', '#/fa', 'fa', 'FREE AGENCY')}
        ${tile('standings', '#/standings', 'standings', 'STANDINGS')}
        ${tile('stats', '#/stats', 'stats', 'STATS')}
        ${tile('draft', '#/draft', 'draft', 'DRAFT')}
        ${tile('league', '#/league', 'league', 'LEAGUE')}
      </div>
      <nav class="hub-links" aria-label="More">${links.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join('')}</nav>
      ${hubNewsHtml()}`;
    wireSim(app);
    const wy = UI.$('#wyClose', app);
    if (wy) wy.addEventListener('click', () => { if (lastSummary) lastSummary.dismissed = true; const c = wy.closest('.wyws'); if (c) c.remove(); });
    const strip = UI.$('.cal-strip', app);
    if (strip) {
      const cur = strip.querySelector('.cal-ev.today, .cal-ev.now, .cal-flag, .cal-ev.next');
      if (cur && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = Math.max(0, cur.offsetLeft - strip.offsetLeft - strip.clientWidth / 3);
    }
    const np = UI.$('#nextPhase');
    if (np) np.addEventListener('click', () => UI.sim('nextPhase'));
    const oe = UI.$('#openEvents');
    if (oe) oe.addEventListener('click', () => UI.showEvents());
    const more = UI.$('.sim-more', app);
    if (more) document.addEventListener('click', function close(e) {
      if (!document.body.contains(more)) { document.removeEventListener('click', close); return; }
      if (!more.contains(e.target)) more.open = false;
    });
  };

  // ---------- Box score ----------
  // Player rows sort by points by default. Tapping a column header sorts both teams by it,
  // tapping it again flips the order. Players who did not play stay at the bottom.
  const BOX_COLS = [['min', 'MIN'], ['pts', 'PTS'], ['fg', 'FG'], ['tp', '3P'], ['ft', 'FT'], ['oreb', 'OREB'], ['dreb', 'DREB'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK'], ['tov', 'TOV'], ['pf', 'PF']];
  const boxSort = { key: 'pts', dir: -1, game: null };
  const boxReb = r => (r.reb != null ? Number(r.reb) || 0 : (Number(r.oreb) || 0) + (Number(r.dreb) || 0));
  const boxName = r => { const p = UI.player(r.id); return r.name || (p ? p.name : r.id); };
  function boxVal(r, k) {
    const n = x => Number(x) || 0;
    if (k === 'fg') return n(r.fgm) + n(r.fga) / 1000;
    if (k === 'tp') return n(r.tpm) + n(r.tpa) / 1000;
    if (k === 'ft') return n(r.ftm) + n(r.fta) / 1000;
    if (k === 'reb') return boxReb(r);
    return n(r[k]);
  }
  function sortedBox(rows) {
    const k = boxSort.key, d = boxSort.dir;
    return rows.slice().sort((a, b) => {
      const ap = a.min > 0 ? 1 : 0, bp = b.min > 0 ? 1 : 0;
      if (ap !== bp) return bp - ap;
      let c = k === 'name' ? String(boxName(a)).localeCompare(String(boxName(b))) * d : (boxVal(a, k) - boxVal(b, k)) * d;
      if (!c) c = (Number(b.pts) || 0) - (Number(a.pts) || 0) || (Number(b.min) || 0) - (Number(a.min) || 0);
      return c;
    });
  }
  function boxHead() {
    const th = (k, label, cls) => {
      const on = boxSort.key === k;
      const arrow = on ? `<i class="bx-arr" aria-hidden="true">${boxSort.dir === -1 ? '▼' : '▲'}</i>` : '';
      return `<th class="sortable bx-th${cls ? ' ' + cls : ''}${on ? ' on' : ''}"${on ? ` aria-sort="${boxSort.dir === -1 ? 'descending' : 'ascending'}"` : ''}><button type="button" class="bx-sort" data-bsort="${k}">${label}${arrow}</button></th>`;
    };
    return `<tr>${th('name', 'PLAYER', 'l')}${BOX_COLS.map(([k, l]) => th(k, l)).join('')}</tr>`;
  }
  function boxBody(rows) {
    const k = boxSort.key;
    const td = (key, v) => `<td${key === k ? ' class="on"' : ''}>${v}</td>`;
    return sortedBox(rows).map(r => {
      const p = UI.player(r.id);
      const dnp = !(r.min > 0);
      return `<tr class="${dnp ? 'dnp' : ''}"><td class="l"><a href="#/player/${esc(r.id)}">${esc(boxName(r))}</a>${r.starter ? ' <span class="bx-s" title="Starter">S</span>' : ''}${p ? ` <small class="muted">${esc(p.pos)}</small>` : ''}</td>
        ${dnp ? '<td colspan="13" class="l muted">Did not play</td>' : td('min', Math.round(r.min)) + td('pts', `<b>${r.pts || 0}</b>`) + td('fg', `${r.fgm || 0}-${r.fga || 0}`) + td('tp', `${r.tpm || 0}-${r.tpa || 0}`) + td('ft', `${r.ftm || 0}-${r.fta || 0}`) +
          td('oreb', r.oreb || 0) + td('dreb', r.dreb || 0) + td('reb', boxReb(r)) + td('ast', r.ast || 0) + td('stl', r.stl || 0) + td('blk', r.blk || 0) + td('tov', r.tov || 0) + td('pf', r.pf || 0)}</tr>`;
    }).join('');
  }
  function boxTable(abbr, box) {
    const rows = (box || []).filter(Boolean);
    const sum = k => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const reb = boxReb;
    const pct = (m, a) => (a ? ' <small>' + (m / a * 100).toFixed(1) + '</small>' : '');
    const fgm = sum('fgm'), fga = sum('fga'), tpm = sum('tpm'), tpa = sum('tpa'), ftm = sum('ftm'), fta = sum('fta');
    return `<div class="box-team">${UI.header(UI.teamName(abbr).toUpperCase())}
      <div class="tscroll"><table class="stats box"><thead>${boxHead()}</thead>
      <tbody>${boxBody(rows)}</tbody>
      <tfoot><tr><td class="l">TOTALS</td><td>${Math.round(sum('min'))}</td><td><b>${sum('pts')}</b></td><td>${fgm}-${fga}${pct(fgm, fga)}</td><td>${tpm}-${tpa}${pct(tpm, tpa)}</td><td>${ftm}-${fta}${pct(ftm, fta)}</td><td>${sum('oreb')}</td><td>${sum('dreb')}</td><td>${rows.reduce((s, r) => s + reb(r), 0)}</td><td>${sum('ast')}</td><td>${sum('stl')}</td><td>${sum('blk')}</td><td>${sum('tov')}</td><td>${sum('pf')}</td></tr></tfoot>
      </table></div></div>`;
  }

  P.game = function (app, id) {
    if (needSeason(app)) return;
    const g = UI.game(id || '');
    if (g && g.id !== boxSort.game) { boxSort.game = g.id; boxSort.key = 'pts'; boxSort.dir = -1; }
    if (!g) { app.innerHTML = UI.empty('GAME NOT FOUND', 'There is no game with the id ' + esc(id) + ' in this season.', '<a class="btn" href="#/season">SEASON</a>'); return; }
    const head = score => `<section class="scoreboard">
        <a class="sb-team" href="#/team/${esc(g.away)}">${UI.logo(g.away, 72)}<span class="sb-name">${esc(UI.teamName(g.away))}</span><small>${esc(UI.record(g.away))}</small></a>
        <div class="sb-mid">${score}</div>
        <a class="sb-team" href="#/team/${esc(g.home)}">${UI.logo(g.home, 72)}<span class="sb-name">${esc(UI.teamName(g.home))}</span><small>${esc(UI.record(g.home))}</small></a>
      </section>`;
    const dayLbl = esc(g.date ? UI.dateLabel(g.date).toUpperCase() : 'DAY ' + (g.day + 1)) + (g.playoff ? ' | PLAYOFFS GAME ' + esc(g.gameNum || '') : '');
    const r = g.result;
    if (!g.played || !r) {
      app.innerHTML = head(`<div class="sb-k">${dayLbl}</div>${g.played ? `<div class="sb-score"><span class="${g.as > g.hs ? 'win' : ''}">${g.as}</span><i>-</i><span class="${g.hs > g.as ? 'win' : ''}">${g.hs}</span></div><div class="sb-k">BOX SCORE NOT KEPT</div>` : '<div class="sb-at">@</div><div class="sb-k">NOT PLAYED YET</div>'}`) +
        '<div class="row-btns center"><a class="btn" href="#/season">BACK TO SEASON</a></div>';
      return;
    }
    const q = Array.isArray(r.quarters) ? r.quarters : [];
    const qLabel = i => (i < 4 ? 'Q' + (i + 1) : 'OT' + (q.length > 5 ? i - 3 : ''));
    const qtable = q.length ? `<div class="tscroll"><table class="stats qtable"><thead><tr><th class="l">TEAM</th>${q.map((_, i) => `<th>${qLabel(i)}</th>`).join('')}<th>T</th></tr></thead><tbody>
        <tr><td class="l">${UI.logo(g.away, 20)} ${esc(g.away)}</td>${q.map(x => `<td>${esc(x[1])}</td>`).join('')}<td><b>${g.as}</b></td></tr>
        <tr><td class="l">${UI.logo(g.home, 20)} ${esc(g.home)}</td>${q.map(x => `<td>${esc(x[0])}</td>`).join('')}<td><b>${g.hs}</b></td></tr>
      </tbody></table></div>` : '';
    const pbp = Array.isArray(r.pbp) ? r.pbp : [];
    const LIMIT = 80;
    const line = x => `<li>${esc(typeof x === 'string' ? x : x && (x.text || JSON.stringify(x)))}</li>`;
    const pbpHtml = pbp.length ? `${UI.header('PLAY-BY-PLAY', pbp.length + ' plays')}
      <ol class="pbp" id="pbp">${pbp.slice(0, LIMIT).map(line).join('')}</ol>
      ${pbp.length > LIMIT ? `<button type="button" class="btn" id="pbpMore">SHOW ALL ${pbp.length} PLAYS</button>` : ''}`
      : `${UI.header('PLAY-BY-PLAY')}<p class="muted">Play-by-play is kept for the most recent games only.</p>`;
    const awayWon = g.as > g.hs;
    const ot = q.length > 4 ? (q.length > 5 ? '/' + (q.length - 4) + 'OT' : '/OT') : '';
    app.innerHTML = head(`<div class="sb-k">FINAL${ot}</div>
        <div class="sb-score"><span class="${awayWon ? 'win' : ''}">${g.as}</span><i>-</i><span class="${awayWon ? '' : 'win'}">${g.hs}</span></div><div class="sb-k">${dayLbl}</div>`) +
      qtable + boxTable(g.away, r.away && r.away.box) + boxTable(g.home, r.home && r.home.box) + pbpHtml;
    // Sorting redraws only the head and body rows, so a table scrolled sideways on a phone stays put.
    const boxes = [(r.away && r.away.box) || [], (r.home && r.home.box) || []].map(b => b.filter(Boolean));
    const tables = Array.from(app.querySelectorAll('table.box'));
    const redraw = () => tables.forEach((tb, i) => { tb.tHead.innerHTML = boxHead(); tb.tBodies[0].innerHTML = boxBody(boxes[i] || []); });
    tables.forEach(tb => tb.addEventListener('click', e => {
      const b = e.target.closest('[data-bsort]');
      if (!b) return;
      const k = b.getAttribute('data-bsort');
      if (boxSort.key === k) boxSort.dir = -boxSort.dir;
      else { boxSort.key = k; boxSort.dir = k === 'name' ? 1 : -1; }
      redraw();
      const again = tb.querySelector(`[data-bsort="${k}"]`);
      if (again) again.focus({ preventScroll: true });
    }));
    const more = UI.$('#pbpMore');
    if (more) more.addEventListener('click', () => { UI.$('#pbp').innerHTML = pbp.map(line).join(''); more.remove(); });
  };

  // ---------- Standings ----------
  P.standings = function (app) {
    const user = UI.userTeam();
    const confList = [];
    UI.teams().forEach(t => { if (t.conf && !confList.includes(t.conf)) confList.push(t.conf); });
    confList.sort((a, b) => (a === 'East' ? -1 : b === 'East' ? 1 : 0));
    const tables = confList.map(c => {
      const rows = UI.confTable(c);
      return `<section class="stand-wrap">${UI.header(c.toUpperCase())}
        <div class="tscroll"><table class="stand"><thead><tr><th>#</th><th class="l">TEAM</th><th>W</th><th>L</th><th>PCT</th><th>GB</th><th class="hide-sm">HOME</th><th class="hide-sm">AWAY</th><th class="hide-sm">L10</th><th>STRK</th></tr></thead>
        <tbody>${rows.map(r => `<tr class="${r.abbr === user ? 'mine' : ''}${r.rank === 8 ? ' cut' : ''}">
          <td>${r.rank}</td><td class="l"><a href="#/team/${esc(r.abbr)}">${UI.logo(r.abbr, 28)}<span class="full">${esc(UI.teamName(r.abbr))}</span><span class="short">${esc(r.abbr)}</span></a></td>
          <td><b>${r.w}</b></td><td>${r.l}</td><td>${UI.fmtWinPct(r.w, r.l)}</td><td>${r.gb}</td>
          <td class="hide-sm">${r.hw}-${r.hl}</td><td class="hide-sm">${r.aw}-${r.al}</td><td class="hide-sm">${r.l10}</td><td>${esc(r.streakText)}</td></tr>`).join('')}</tbody></table></div></section>`;
    }).join('');
    const sub = UI.state.game ? esc(UI.seasonLabel(UI.year())) + '. The top 8 in each conference make the playoffs.' : 'No league loaded, so every team is 0-0.';
    app.innerHTML = UI.header('STANDINGS', sub) + `<div class="two-col tight">${tables}</div>`;
  };

  // ---------- Stats: league leaders and the full player table ----------
  // Only stats played in this save. Nothing from outside the league is shown here.
  const CATS = [['pts', 'POINTS'], ['reb', 'REBOUNDS'], ['ast', 'ASSISTS'], ['stl', 'STEALS'], ['blk', 'BLOCKS']];
  const MIN_G = 20;
  const COLS = [['g', 'G'], ['mpg', 'MIN'], ['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK'], ['fgp', 'FG%'], ['tpp', '3P%'], ['ftp', 'FT%']];
  const statView = { sort: 'pts', dir: -1, team: '', shown: 60 };

  P.stats = function (app, arg) {
    const parts = String(arg || '').split('/');
    const view = parts[0] === 'players' ? 'players' : 'leaders';
    const po = parts.includes('playoffs');
    const hasSeason = !!(UI.state.game && UI.state.season);
    if (!hasSeason) {
      app.innerHTML = UI.header('STATS') + UI.empty('NO SEASON YET', 'Stats come from the games played in your league. Start or load an Association first.',
        `<div class="row-btns">${UI.canPlay() ? '<a class="btn btn-gold" href="#/new">PLAY THE ASSOCIATION</a>' : ''}<a class="btn" href="#/saves">LOAD</a></div>`);
      return;
    }
    const tot = UI.seasonTotals(po);
    const hasPo = Object.keys(UI.seasonTotals(true)).length > 0;
    const pool = Object.keys(tot).map(id => ({ p: UI.player(id), s: UI.perGame(tot[id]) })).filter(x => x.p && x.s && x.s.g > 0);
    const base = view === 'players' ? '#/stats/players' : '#/stats';
    const tabs = `<div class="tabs">
        <a href="#/stats${po ? '/playoffs' : ''}" class="${view === 'leaders' ? 'on' : ''}">LEADERS</a>
        <a href="#/stats/players${po ? '/playoffs' : ''}" class="${view === 'players' ? 'on' : ''}">ALL PLAYERS</a>
        ${hasPo ? `<span class="tabs-gap"></span><a href="${base}" class="${po ? '' : 'on'}">SEASON</a><a href="${base}/playoffs" class="${po ? 'on' : ''}">PLAYOFFS</a>` : ''}
      </div>`;
    const title = UI.seasonLabel(UI.year()) + (po ? ' PLAYOFFS' : ' SEASON');
    if (!pool.length) {
      app.innerHTML = UI.header('STATS', esc(title)) + tabs + UI.empty('NO GAMES PLAYED YET', 'Sim a few days and the numbers will show up here.', '<div class="row-btns"><a class="btn btn-gold" href="#/season">BACK TO THE HUB</a></div>');
      return;
    }
    if (view === 'leaders') {
      const maxG = pool.reduce((m, x) => Math.max(m, x.s.g), 0);
      const minG = po ? 1 : Math.min(MIN_G, Math.max(1, Math.ceil(maxG * 0.6)));
      const q = pool.filter(x => x.s.g >= minG);
      const body = `<div class="leader-grid">${CATS.map(([k, label]) => {
        const top = q.filter(x => x.s[k] != null).sort((a, b) => b.s[k] - a.s[k]).slice(0, 10);
        if (!top.length) return '';
        const lead = top[0];
        return `<section class="leader-card">
          <div class="lc-head"><span>${label}</span><small>PER GAME</small></div>
          <a class="lc-top" href="#/player/${esc(lead.p.id)}" style="--c1:${esc(UI.teamColor(lead.p.team))}">${UI.headshot(lead.p)}<span class="lc-top-name"><b>${esc(lead.p.name)}</b><small>${esc(lead.p.team)} | ${esc(lead.p.pos)}</small></span><span class="lc-top-v">${UI.fmt1(lead.s[k])}</span></a>
          <ol class="lc-list">${top.slice(1).map((x, i) => `<li><span class="lc-n">${i + 2}</span><a href="#/player/${esc(x.p.id)}">${esc(x.p.name)}</a><span class="lc-t">${esc(x.p.team)}</span><b>${UI.fmt1(x.s[k])}</b></li>`).join('')}</ol>
        </section>`;
      }).join('')}</div>`;
      app.innerHTML = UI.header('STATS', esc(title) + '. Per game, at least ' + minG + ' game' + (minG > 1 ? 's' : '') + '.') + tabs + body;
      return;
    }
    // full table
    const user = UI.userTeam();
    const draw = () => {
      const k = statView.sort;
      let list = pool.filter(x => !statView.team || x.p.team === statView.team);
      list.sort((a, b) => {
        if (k === 'name') return statView.dir * -1 * String(a.p.name).localeCompare(String(b.p.name));
        const av = a.s[k] == null ? -1 : a.s[k], bv = b.s[k] == null ? -1 : b.s[k];
        return (bv - av) * (statView.dir === -1 ? 1 : -1) || b.s.pts - a.s.pts;
      });
      const shown = list.slice(0, statView.shown);
      const fmt = (key, v) => (key === 'g' ? v : /p$/.test(key) ? UI.fmtPct(v) : UI.fmt1(v));
      const teams = UI.teams().slice().sort((a, b) => a.city.localeCompare(b.city));
      app.innerHTML = UI.header('STATS', esc(title) + '. Per game. Tap a column to sort.') + tabs +
        `<div class="stat-filters"><label class="field"><span>TEAM</span><select id="stTeam">
          <option value="">All teams</option>${user ? `<option value="${esc(user)}" ${statView.team === user ? 'selected' : ''}>My team (${esc(user)})</option>` : ''}
          ${teams.map(t => `<option value="${esc(t.abbr)}" ${statView.team === t.abbr && t.abbr !== user ? 'selected' : ''}>${esc(t.city + ' ' + t.name)}</option>`).join('')}
        </select></label><span class="muted">${list.length} players</span></div>
        <div class="tscroll"><table class="stats stat-table"><thead><tr><th>#</th><th class="l sortable${k === 'name' ? ' on' : ''}" data-sort="name">PLAYER</th><th class="l hide-sm">TEAM</th>
          ${COLS.map(([c, l]) => `<th class="sortable${k === c ? ' on' : ''}" data-sort="${c}">${l}</th>`).join('')}</tr></thead>
        <tbody>${shown.map((x, i) => `<tr class="${x.p.team === user ? 'mine' : ''}"><td class="muted">${i + 1}</td>
          <td class="l"><a href="#/player/${esc(x.p.id)}">${esc(x.p.name)}</a> <small class="muted">${esc(x.p.pos)}</small></td><td class="l hide-sm">${UI.logo(x.p.team, 22)} ${esc(x.p.team)}</td>
          ${COLS.map(([c]) => `<td class="${k === c ? 'on' : ''}">${c === 'pts' ? '<b>' + fmt(c, x.s[c]) + '</b>' : fmt(c, x.s[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        ${list.length > shown.length ? `<div class="row-btns center"><button type="button" class="btn" id="stMore">SHOW MORE</button></div>` : ''}`;
      UI.$('#stTeam').addEventListener('change', e => { statView.team = e.target.value; statView.shown = 60; draw(); });
      app.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
        const c = th.getAttribute('data-sort');
        if (statView.sort === c) statView.dir = -statView.dir; else { statView.sort = c; statView.dir = -1; }
        draw();
      }));
      const more = UI.$('#stMore');
      if (more) more.addEventListener('click', () => { statView.shown += 100; const y = window.scrollY; draw(); window.scrollTo(0, y); });
    };
    draw();
  };
  // The old leaders route opens the same page.
  P.leaders = function (app, arg) { P.stats(app, arg === 'playoffs' ? 'leaders/playoffs' : ''); };

  // ---------- Playoffs ----------
  // Built like the NBA 2K Playoffs screen: the round and your status up top, 2K style sim buttons,
  // the Play-In (when the season has one), then the 16 team bracket with the West on the left, the
  // East on the right and the Finals in the middle. A series opens a side panel (#/playoffs/<id>).
  const ROUND_NAMES = ['FIRST ROUND', 'CONFERENCE SEMIFINALS', 'CONFERENCE FINALS', 'NBA FINALS'];
  const RD_SHORT = ['FIRST ROUND', 'CONF. SEMIFINALS', 'CONF. FINALS', 'NBA FINALS'];
  const RD_LOWER = ['the first round', 'the conference semifinals', 'the conference finals', 'the NBA Finals'];
  const CONF_FULL = { West: 'WESTERN CONFERENCE', East: 'EASTERN CONFERENCE' };
  function normSeries(s) {
    return {
      id: s.id || null, round: s.round || null, games: Array.isArray(s.games) ? s.games : [],
      a: UI.abbrOf(s.hi || s.high || s.a), b: UI.abbrOf(s.lo || s.low || s.b),
      aSeed: s.hiSeed != null ? s.hiSeed : s.highSeed, bSeed: s.loSeed != null ? s.loSeed : s.lowSeed,
      aw: s.hw != null ? s.hw : s.wins ? s.wins[0] : null, bw: s.lw != null ? s.lw : s.wins ? s.wins[1] : null,
      winner: UI.abbrOf(s.winner), conf: s.conf || null
    };
  }
  UI.normBracket = function (b) {
    if (!b || !Array.isArray(b.rounds)) return null;
    const drawn = b.rounds.length;
    const rounds = b.rounds.map((r, i) => {
      const list = Array.isArray(r) ? r : (r.series || []);
      const order = x => (x.conf === 'West' ? 0 : x.conf === 'East' ? 1 : 2);
      return { name: (r && r.name) || ROUND_NAMES[i] || 'ROUND ' + (i + 1), series: list.map(normSeries).sort((x, y) => order(x) - order(y)) };
    });
    // Placeholders for rounds not drawn yet.
    for (let i = rounds.length; i < 4; i++) rounds.push({ name: ROUND_NAMES[i], series: Array.from({ length: 8 >> i }, () => ({ a: null, b: null })) });
    const fm = b.finalsMvp && typeof b.finalsMvp === 'object' ? b.finalsMvp.id : b.finalsMvp;
    return { rounds, drawn, champion: UI.abbrOf(b.champion), finalsMvp: fm || null };
  };

  // Seeds 1 to 8 per conference: from standings when a league is loaded, else by team overall.
  function projected() {
    const r1 = [];
    ['West', 'East'].filter(c => UI.teams().some(t => t.conf === c)).forEach(c => {
      let seeds = UI.state.season ? UI.confTable(c).map(r => r.abbr)
        : UI.teams().filter(t => t.conf === c).map(t => t.abbr).sort((a, b) => UI.teamOvr(b) - UI.teamOvr(a));
      seeds = seeds.slice(0, 8);
      [[1, 8], [4, 5], [3, 6], [2, 7]].forEach(([x, y]) => r1.push({ hi: seeds[x - 1] || null, lo: seeds[y - 1] || null, hiSeed: x, loSeed: y, conf: c }));
    });
    const br = UI.normBracket({ rounds: [r1], champion: null });
    br.projected = true;
    return br;
  }

  const minLeft = x => (!x || !x.a || x.winner ? 0 : 4 - Math.max(Number(x.aw) || 0, Number(x.bw) || 0));
  const liveBracket = () => { const s = UI.state.season; return s && s.playoffs ? UI.normBracket(s.playoffs) : null; };
  const curRoundIdx = br => Math.max(0, Math.min(3, (br.drawn || 1) - 1));
  // The user's latest series in the bracket and its round index.
  function mySeries(br, u) {
    let found = null;
    if (br && u) br.rounds.forEach((r, i) => r.series.forEach(x => { if (x.id && (x.a === u || x.b === u)) found = { x, ri: i }; }));
    return found;
  }
  function findSeriesById(br, id) {
    let out = null;
    if (br && id) br.rounds.forEach((r, i) => r.series.forEach(x => { if (x.id && x.id === id) out = { x, ri: i }; }));
    return out;
  }
  // Bracket slots per conference and round, with known winners carried into rounds not drawn yet.
  function confSlots(br, conf, ri) {
    const want = 4 >> ri;
    const real = br.rounds[ri].series.filter(x => x.conf === conf && x.a);
    if (real.length >= want || (ri === 0 && real.length)) return real;
    if (ri === 0) return Array.from({ length: want }, () => ({ a: null, b: null }));
    const prev = confSlots(br, conf, ri - 1);
    return Array.from({ length: want }, (_, j) => {
      const p = prev[2 * j], q = prev[2 * j + 1];
      const sd = (x, w) => (x && w ? (x.a === w ? x.aSeed : x.bSeed) : null);
      return { a: p && p.winner || null, b: q && q.winner || null, aSeed: sd(p, p && p.winner), bSeed: sd(q, q && q.winner), pend: true };
    });
  }
  function finalsSlot(br) {
    const f = br.rounds[3].series[0];
    if (f && f.a) return f;
    const w = confSlots(br, 'West', 2)[0], e = confSlots(br, 'East', 2)[0];
    const sd = (x, k) => (x && x.winner ? (x.a === x.winner ? x.aSeed : x.bSeed) : null);
    return { a: w && w.winner || null, b: e && e.winner || null, aSeed: sd(w), bSeed: sd(e), pend: true };
  }

  // "OKC leads 3-1", "MIA wins 4-2", "Series tied 2-2"
  function seriesLine(x) {
    if (!x || !x.a || !x.b) return x && (x.a || x.b) ? 'Waiting on the other series' : '';
    if (!x.id) return x.pend ? 'Next round' : '';
    const aw = Number(x.aw) || 0, bw = Number(x.bw) || 0;
    if (x.winner) return x.winner + ' wins ' + Math.max(aw, bw) + '-' + Math.min(aw, bw);
    if (!aw && !bw) return 'Game 1 next';
    if (aw === bw) return 'Series tied ' + aw + '-' + bw;
    return (aw > bw ? x.a : x.b) + ' leads ' + Math.max(aw, bw) + '-' + Math.min(aw, bw);
  }
  function pbTeam(x, side, u) {
    const abbr = side ? x.b : x.a, seed = side ? x.bSeed : x.aSeed, w = side ? x.bw : x.aw;
    if (!abbr) return '<div class="pb-t tbd"><span class="pb-seed"></span><span class="pb-n"><b>TBD</b></span></div>';
    const won = !!x.winner && x.winner === abbr, lost = !!x.winner && !won;
    return `<div class="pb-t${won ? ' win' : ''}${lost ? ' out' : ''}${abbr === u ? ' you' : ''}" style="--tc:${esc(UI.teamColor(abbr))}">
      <span class="pb-seed">${seed != null ? esc(seed) : ''}</span>${UI.logo(abbr, 26)}<span class="pb-n"><b>${esc(abbr)}</b><small>${esc(UI.team(abbr).name || '')}</small></span><span class="pb-w">${x.id && w != null ? esc(w) : ''}</span></div>`;
  }
  function pbCard(x, u, sel) {
    const mine = !!u && (x.a === u || x.b === u);
    const cls = `pb-card${mine ? ' mine' : ''}${x.winner ? ' done' : ''}${x.id && x.id === sel ? ' sel' : ''}${x.id ? '' : ' pend'}`;
    const inner = pbTeam(x, 0, u) + pbTeam(x, 1, u) + `<div class="pb-st">${esc(seriesLine(x)) || '&nbsp;'}</div>`;
    if (!x.id) return `<div class="${cls}">${inner}</div>`;
    return `<a class="${cls}" href="#/playoffs/${encodeURIComponent(x.id)}" aria-label="${esc(UI.teamName(x.a) + ' vs ' + UI.teamName(x.b) + ': ' + seriesLine(x) + '. Open the series')}">${inner}</a>`;
  }
  function bracket2k(br, sel) {
    const u = UI.userTeam();
    const col = (conf, ri) => `<div class="pb-col pb-${conf === 'West' ? 'w' : 'e'}${ri + 1}"><div class="pb-h"><small>${conf === 'West' ? 'WEST' : 'EAST'}</small>${RD_SHORT[ri]}</div>
      <div class="pb-list">${confSlots(br, conf, ri).map(x => pbCard(x, u, sel)).join('')}</div></div>`;
    const champ = br.champion;
    const fin = `<div class="pb-col pb-f"><div class="pb-h pb-hf"><small>${br.projected ? 'PROJECTED' : esc(String(UI.state.season ? UI.state.season.year : UI.year()))}</small>NBA FINALS</div>
      <div class="pb-list">${pbCard(finalsSlot(br), u, sel)}
        <div class="pb-champ${champ ? '' : ' tbd'}"${champ ? ` style="--tc:${esc(UI.teamColor(champ))}"` : ''}>${champ ? UI.logo(champ, 64) : '<span class="pb-trophy" aria-hidden="true"></span>'}<b>${champ ? 'CHAMPIONS' : 'CHAMPION'}</b><span>${champ ? esc(UI.teamName(champ).toUpperCase()) : 'TBD'}</span></div>
      </div></div>`;
    return `<div class="pb" role="region" aria-label="Playoff bracket">${col('West', 0)}${col('West', 1)}${col('West', 2)}${fin}${col('East', 2)}${col('East', 1)}${col('East', 0)}</div>`;
  }

  // ---------- Play-In Tournament (2020-21 on) ----------
  // Reads season.playoffs.playIn (or season.playIn): { West: { '7v8': g, '9v10': g, final: g }, East: ... },
  // a { West: [g, g, g] } list, or a flat [g] list with g.conf. g: { hi|home, lo|away, hiSeed, loSeed,
  // hs, as, winner, gameId|id } in any of those spellings; scores come from the box score when kept.
  function playInGames() {
    const s = UI.state.season;
    const pi = s && ((s.playoffs && (s.playoffs.playIn || s.playoffs.playin)) || s.playIn);
    if (!pi || typeof pi !== 'object') return null;
    const list = [];
    if (Array.isArray(pi)) pi.forEach(g => list.push(g));
    else if (Array.isArray(pi.games)) pi.games.forEach(g => list.push(g));
    else ['West', 'East'].forEach(c => {
      const x = pi[c];
      if (Array.isArray(x)) x.forEach(g => g && list.push(Object.assign({ conf: c }, g)));
      else if (x && typeof x === 'object') Object.keys(x).forEach(k => { if (x[k] && typeof x[k] === 'object' && (x[k].hi || x[k].home || x[k].a || x[k].lo || x[k].away)) list.push(Object.assign({ conf: c, slot: k }, x[k])); });
    });
    const out = { West: {}, East: {} };
    list.forEach(g => {
      if (!g || typeof g !== 'object') return;
      const gid = g.gameId || g.game || (typeof g.id === 'string' && UI.game(g.id) ? g.id : null);
      const gm = gid ? UI.game(gid) : null;
      const a = UI.abbrOf(g.hi || g.high || g.home || g.a), b = UI.abbrOf(g.lo || g.low || g.away || g.b);
      const aSeed = [g.hiSeed, g.highSeed, g.homeSeed, g.aSeed].find(v => v != null);
      const bSeed = [g.loSeed, g.lowSeed, g.awaySeed, g.bSeed].find(v => v != null);
      let as = null, bs = null;
      if (gm && gm.played) { as = gm.home === a ? gm.hs : gm.as; bs = gm.home === a ? gm.as : gm.hs; }
      else if (g.hs != null || g.as != null) { const aHome = !g.home || UI.abbrOf(g.home) === a; as = aHome ? g.hs : g.as; bs = aHome ? g.as : g.hs; }
      else if (Array.isArray(g.score)) { as = g.score[0]; bs = g.score[1]; }
      let winner = UI.abbrOf(g.winner);
      if (!winner && as != null && bs != null && (gm ? gm.played : g.played !== false)) winner = as > bs ? a : bs > as ? b : null;
      const key = String(g.slot || g.kind || g.type || g.key || g.id || '');
      const seeds = [Number(aSeed), Number(bSeed)].sort((m, n) => m - n).join('-');
      const slot = /9\D{0,3}10|910/.test(key) ? '910' : /7\D{0,3}8|78/.test(key) ? '78' : /final|last|elim|second|8th/i.test(key) ? 'final'
        : seeds === '7-8' ? '78' : seeds === '9-10' ? '910' : 'final';
      const conf = g.conf === 'East' || g.conf === 'West' ? g.conf : a && UI.team(a).conf === 'East' ? 'East' : 'West';
      out[conf][slot] = { a, b, aSeed, bSeed, as, bs, winner, gameId: gm ? gm.id : gid, date: (gm && gm.date) || g.date || null, slot };
    });
    return Object.keys(out.West).length || Object.keys(out.East).length ? out : null;
  }
  function piCard(g, label, u) {
    if (!g) return `<div class="pi-g tbd"><div class="pi-l">${esc(label)}</div><div class="pb-t tbd"><span class="pb-n"><b>TBD</b></span></div><div class="pb-t tbd"><span class="pb-n"><b>TBD</b></span></div></div>`;
    const row = (abbr, seed, pts) => {
      if (!abbr) return '<div class="pb-t tbd"><span class="pb-seed"></span><span class="pb-n"><b>TBD</b></span></div>';
      const won = g.winner === abbr, lost = !!g.winner && !won;
      return `<div class="pb-t${won ? ' win' : ''}${lost ? ' out' : ''}${abbr === u ? ' you' : ''}" style="--tc:${esc(UI.teamColor(abbr))}"><span class="pb-seed">${seed != null ? esc(seed) : ''}</span>${UI.logo(abbr, 24)}<span class="pb-n"><b>${esc(abbr)}</b><small>${esc(UI.team(abbr).name || '')}</small></span><span class="pb-w">${pts != null ? esc(pts) : ''}</span></div>`;
    };
    const st = g.winner ? g.winner + ' wins' + (g.as != null && g.bs != null ? ' ' + Math.max(g.as, g.bs) + '-' + Math.min(g.as, g.bs) : '') : g.date ? shortDate(g.date) : 'Not played yet';
    const mine = !!u && (g.a === u || g.b === u);
    const inner = `<div class="pi-l">${esc(label)}</div>${row(g.a, g.aSeed, g.as)}${row(g.b, g.bSeed, g.bs)}<div class="pb-st">${esc(st)}${g.winner && g.gameId ? ' <span class="pi-box">BOX SCORE</span>' : ''}</div>`;
    return g.gameId && g.winner ? `<a class="pi-g${mine ? ' mine' : ''}" href="#/game/${encodeURIComponent(g.gameId)}">${inner}</a>` : `<div class="pi-g${mine ? ' mine' : ''}">${inner}</div>`;
  }
  function playInHtml(pi) {
    if (!pi) return '';
    const u = UI.userTeam();
    const conf = c => `<div class="pi-conf"><div class="pi-ch">${CONF_FULL[c]}</div><div class="pi-br">
        <div class="pi-c1">${piCard(pi[c]['78'], '7 VS 8 | WINNER IS THE 7 SEED', u)}${piCard(pi[c]['910'], '9 VS 10 | LOSER IS OUT', u)}</div>
        <div class="pi-c2">${piCard(pi[c].final, 'FOR THE 8 SEED', u)}</div></div></div>`;
    return `<section class="pi" aria-label="Play-In Tournament"><div class="pi-head"><b>PLAY-IN TOURNAMENT</b><small>Seeds 7 to 10 play for the last two spots in each conference</small></div>
      <div class="pi-grid">${conf('West')}${conf('East')}</div></section>`;
  }
  // The user's Play-In result, when he lost there.
  function playInOut(pi, u) {
    if (!pi || !u) return null;
    const t = UI.team(u), c = pi[t.conf] || {};
    const fin = c.final, nine = c['910'];
    const lostIn = g => g && g.winner && (g.a === u || g.b === u) && g.winner !== u ? g : null;
    const g = lostIn(fin) || lostIn(nine);
    if (!g) return null;
    const opp = g.a === u ? g.b : g.a, us = g.a === u ? g.as : g.bs, them = g.a === u ? g.bs : g.as;
    return 'Eliminated in the Play-In by ' + opp + ' ' + them + '-' + us;
  }

  // ---------- header: the round and the user's status ----------
  function roundTitle(br, u) {
    const ri = curRoundIdx(br);
    if (ri === 3) return 'NBA FINALS';
    const me = mySeries(br, u);
    const alive = me && (!me.x.winner || me.x.winner === u);
    const conf = alive ? UI.team(u).conf : null;
    return conf && CONF_FULL[conf] ? CONF_FULL[conf] + ' ' + (ri === 0 ? 'FIRST ROUND' : ri === 1 ? 'SEMIFINALS' : 'FINALS') : ROUND_NAMES[ri];
  }
  function youStatus(br, u) {
    if (!u) return '';
    const me = mySeries(br, u);
    if (!me) {
      const pio = playInOut(playInGames(), u);
      if (pio) return pio + '.';
      const t = UI.team(u), r = UI.confTable(t.conf).find(z => z.abbr === u);
      return 'You missed the playoffs' + (r ? ' (#' + r.rank + ' in the ' + t.conf + ')' : '') + '.';
    }
    const x = me.x, ri = me.ri;
    const opp = x.a === u ? x.b : x.a;
    const my = Number(x.a === u ? x.aw : x.bw) || 0, th = Number(x.a === u ? x.bw : x.aw) || 0;
    if (x.winner && x.winner !== u) return ri === 3 ? `Lost the NBA Finals to ${opp} ${th}-${my}` : `Eliminated in ${RD_LOWER[ri]} by ${opp} ${th}-${my}`;
    if (x.winner === u) return ri === 3 ? `NBA Champions: beat ${opp} ${my}-${th} in the Finals` : `You beat ${opp} ${my}-${th}. Next: ${RD_LOWER[ri + 1]}`;
    if (!my && !th) return `Game 1 vs ${opp} is next`;
    if (my === th) return `Series tied ${my}-${th} with ${opp}`;
    return my > th ? `You lead ${opp} ${my}-${th}` : `You trail ${opp} ${my}-${th}`;
  }
  function poHero(kicker, title, status, u, tone) {
    return `<section class="po-hero"${u ? ` style="--tc:${esc(UI.teamColor(u))}"` : ''}>
      <div class="po-hk">${esc(kicker)}</div><h1 class="po-rd">${esc(title)}</h1>
      ${status ? `<div class="po-you${tone ? ' ' + tone : ''}">${u ? UI.logo(u, 30) : ''}<span>${esc(status)}</span></div>` : ''}</section>`;
  }

  // ---------- sims that stop at series and round ends ----------
  // Playoff days are drawn one at a time, so these sim the fewest days the target can take
  // (a series needs at least 4 - max(wins) more games, one a day at most) and check again.
  async function simUntil(done, bound) {
    if (UI.simming) return;
    markSim();
    for (let i = 0; i < 40; i++) {
      if (done() || UI.simming || UI.pendingEvents() || UI.inOffseason()) break;
      const n = Math.max(1, bound() || 1);
      const r = await UI.sim({ days: n });
      if (!r || (r.stopped && r.stopped !== 'days') || UI.pendingEvents()) break;
      // the sim took the user somewhere else (the awards show, the draft room): stop there
      if (!/^#\/playoffs/.test(location.hash)) break;
    }
  }
  function simSeriesEnd() {
    const u = UI.userTeam();
    const me = mySeries(liveBracket(), u);
    if (!me || me.x.winner) return;
    const id = me.x.id;
    const cur = () => findSeriesById(liveBracket(), id);
    return simUntil(() => { const c = cur(); return !c || !!c.x.winner; }, () => { const c = cur(); return c ? minLeft(c.x) : 1; });
  }
  const roundLeft = br => br.rounds[curRoundIdx(br)].series.reduce((m, x) => Math.max(m, minLeft(x)), 0);
  function simRound() {
    const br0 = liveBracket();
    if (!br0 || br0.champion) return;
    const r0 = br0.drawn;
    return simUntil(() => { const b = liveBracket(); return !b || !!b.champion || b.drawn > r0; }, () => { const b = liveBracket(); return b ? roundLeft(b) : 1; });
  }
  function simToFinals() {
    const br0 = liveBracket();
    if (!br0 || br0.champion || br0.drawn >= 4) return;
    return simUntil(() => { const b = liveBracket(); return !b || !!b.champion || b.drawn >= 4; },
      () => { const b = liveBracket(); return b ? roundLeft(b) + 4 * Math.max(0, 3 - b.drawn) : 1; });
  }

  // ---------- series panel ----------
  function seriesGames(x) {
    const list = UI.games().filter(g => g.series && g.series === x.id);
    if (!list.length) return (x.games || []).map(id => UI.game(id)).filter(Boolean);
    return list.sort((a, b) => (a.gameNum || 0) - (b.gameNum || 0));
  }
  // Per player totals over a set of games (full box scores only).
  function linesOver(games) {
    const per = {};
    games.forEach(gm => {
      const r = gm.played ? gm.result : null;
      if (!r || !r.home || typeof r.home !== 'object') return;
      ['home', 'away'].forEach(side => {
        const sd = r[side];
        (sd.box || []).forEach(row => {
          if (!row || !(row.min > 0)) return;
          const o = per[row.id] || (per[row.id] = { id: row.id, team: sd.abbr, g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0 });
          o.g++;
          o.pts += Number(row.pts) || 0; o.reb += boxReb(row); o.ast += Number(row.ast) || 0; o.stl += Number(row.stl) || 0; o.blk += Number(row.blk) || 0;
          o.fgm += Number(row.fgm) || 0; o.fga += Number(row.fga) || 0; o.tpm += Number(row.tpm) || 0; o.tpa += Number(row.tpa) || 0;
        });
      });
    });
    return per;
  }
  function topScorer(gm) {
    const r = gm.result;
    if (!r || !r.home || typeof r.home !== 'object') return null;
    let best = null;
    ['home', 'away'].forEach(side => (r[side].box || []).forEach(row => { if (row && (!best || (Number(row.pts) || 0) > (Number(best.row.pts) || 0))) best = { row, team: r[side].abbr }; }));
    if (!best) return null;
    const p = UI.player(best.row.id);
    return { id: best.row.id, name: best.row.name || (p ? p.name : best.row.id), team: best.team, pts: Number(best.row.pts) || 0, reb: boxReb(best.row), ast: Number(best.row.ast) || 0 };
  }
  function panelHtml(x, ri) {
    const u = UI.userTeam();
    const games = seriesGames(x);
    const rows = games.map(gm => {
      const ts = gm.played ? topScorer(gm) : null;
      const aw = gm.played && gm.as > gm.hs;
      return `<li class="sp-g${gm.played ? '' : ' next'}">
        <div class="sp-gk"><b>GAME ${esc(gm.gameNum || '')}</b><span>${esc(shortDate(gm.date))}</span><span class="sp-at">at ${esc(gm.home)}</span></div>
        <div class="sp-sc"><span class="sp-side${aw ? ' win' : ''}">${UI.logo(gm.away, 22)}<b>${esc(gm.away)}</b><i>${gm.played ? esc(gm.as) : ''}</i></span><span class="sp-v">@</span><span class="sp-side${gm.played && !aw ? ' win' : ''}">${UI.logo(gm.home, 22)}<b>${esc(gm.home)}</b><i>${gm.played ? esc(gm.hs) : ''}</i></span></div>
        <div class="sp-gf">${gm.played ? (ts ? `<span class="sp-top">TOP: <a href="#/player/${esc(ts.id)}">${esc(ts.name)}</a> <small>${esc(ts.team)}</small> ${ts.pts} PTS, ${ts.reb} REB, ${ts.ast} AST</span>` : '<span class="sp-top muted">Box score not kept</span>') +
          `<a class="btn btn-small sp-box" href="#/game/${encodeURIComponent(gm.id)}">BOX SCORE</a>` : '<span class="sp-top muted">Up next</span>'}</div></li>`;
    }).join('');
    const per = linesOver(games);
    const cats = [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST']];
    const leader = (abbr, k) => {
      const best = Object.values(per).filter(o => o.team === abbr && o.g).sort((m, n) => n[k] / n.g - m[k] / m.g)[0];
      if (!best) return '<td class="muted">-</td>';
      const p = UI.player(best.id);
      return `<td><a href="#/player/${esc(best.id)}">${esc(p ? p.name : best.id)}</a><b>${UI.fmt1(best[k] / best.g)}</b></td>`;
    };
    const anyLines = Object.keys(per).length > 0;
    const lead = anyLines ? `<h3 class="sp-h">SERIES LEADERS <small>PER GAME</small></h3>
      <table class="sp-lead"><thead><tr><th></th><th>${UI.logo(x.a, 20)} ${esc(x.a)}</th><th>${UI.logo(x.b, 20)} ${esc(x.b)}</th></tr></thead>
      <tbody>${cats.map(([k, l]) => `<tr><th>${l}</th>${leader(x.a, k)}${leader(x.b, k)}</tr>`).join('')}</tbody></table>` : '';
    const side = (abbr, seed, w) => `<a class="sp-tm${x.winner === abbr ? ' win' : x.winner ? ' out' : ''}${abbr === u ? ' you' : ''}" href="#/team/${esc(abbr)}">${UI.logo(abbr, 56)}<span><small>${seed != null ? '#' + esc(seed) + ' SEED' : ''}</small><b>${esc(UI.team(abbr).name || abbr)}</b></span><em>${esc(w != null ? w : 0)}</em></a>`;
    const conf = x.conf && CONF_FULL[x.conf] ? CONF_FULL[x.conf] + ' ' : '';
    return `<div class="sp-back" data-close></div>
      <aside class="sp-panel" role="dialog" aria-modal="true" aria-label="Series details">
        <div class="sp-top-bar"><span>${esc(ri === 3 ? 'NBA FINALS' : conf + (ri === 0 ? 'FIRST ROUND' : ri === 1 ? 'SEMIFINALS' : 'FINALS'))}</span><button type="button" class="sp-x" data-close aria-label="Close the series">&times;</button></div>
        <div class="sp-head">${side(x.a, x.aSeed, x.aw)}<span class="sp-dash">-</span>${side(x.b, x.bSeed, x.bw)}</div>
        <div class="sp-status">${esc(seriesLine(x))}</div>
        <h3 class="sp-h">GAMES</h3>
        ${rows ? `<ol class="sp-games">${rows}</ol>` : '<p class="muted">Game 1 has not been played yet.</p>'}
        ${lead}
      </aside>`;
  }
  let escWired = false;
  function wireEsc() {
    if (escWired) return;
    escWired = true;
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && /^#\/playoffs\/./.test(location.hash) && document.querySelector('.sp-panel')) location.hash = '#/playoffs';
    });
  }

  // ---------- champion screen ----------
  let champOpen = null;   // the year whose champion screen is up in this session
  function champScreen(br, yr) {
    const champ = br.champion;
    const fin = br.rounds[3].series[0] && br.rounds[3].series[0].a ? br.rounds[3].series[0] : null;
    const u = UI.userTeam();
    const g = UI.state.game;
    const hist = g && g.history && (g.history.seasons || []).find(h => h.year === yr);
    const mvpId = br.finalsMvp || (hist && hist.finalsMvp) || null;
    const mvp = mvpId ? UI.player(typeof mvpId === 'object' ? mvpId.id : mvpId) : null;
    let line = '';
    if (mvp && fin) {
      const o = linesOver(seriesGames(fin))[mvp.id];
      if (o && o.g) {
        line = [UI.fmt1(o.pts / o.g) + ' PPG', UI.fmt1(o.reb / o.g) + ' RPG', UI.fmt1(o.ast / o.g) + ' APG', o.fga ? (o.fgm / o.fga * 100).toFixed(1) + ' FG%' : ''].filter(Boolean).join(' | ');
      }
    }
    const opp = fin ? (fin.a === champ ? fin.b : fin.a) : null;
    const cw = fin ? Math.max(Number(fin.aw) || 0, Number(fin.bw) || 0) : 4, lw = fin ? Math.min(Number(fin.aw) || 0, Number(fin.bw) || 0) : 0;
    const t = UI.team(champ);
    return `<section class="po-champ" style="--c1:${esc(t.colors && t.colors[0] || '#333')};--c2:${esc(t.colors && t.colors[1] || t.colors && t.colors[0] || '#777')}" aria-label="${esc(yr)} NBA Champions">
      <div class="pc-logo">${UI.logo(champ, 180)}</div>
      <div class="pc-k">${esc(yr)} NBA CHAMPIONS</div>
      <h1 class="pc-t">${esc(UI.teamName(champ).toUpperCase())}</h1>
      ${opp ? `<div class="pc-sub">Beat the ${esc(UI.teamName(opp))} ${cw}-${lw} in the NBA Finals</div>` : ''}
      ${champ === u ? '<div class="pc-you">YOUR TEAM WON THE TITLE</div>' : ''}
      ${mvp ? `<a class="pc-mvp" href="#/player/${esc(mvp.id)}">${UI.headshot(mvp, 'pc-hs')}<span><small>FINALS MVP</small><b>${esc(mvp.name)}</b>${line ? `<em>${esc(line)}</em>` : ''}</span></a>` : ''}
      <div class="pc-btns"><button type="button" class="btn btn-gold btn-big" id="poContinue">CONTINUE TO OFFSEASON</button><button type="button" class="btn btn-big" id="poBracket">VIEW BRACKET</button></div>
    </section>`;
  }
  async function continueToOffseason() {
    champOpen = null;
    // The Finals are over but the season has not been closed yet: one more step ends it (awards, history).
    if (!UI.inOffseason() && UI.state.season && UI.state.season.phase === 'done' && !UI.simming) await UI.sim({ days: 1 });
    location.hash = '#/season';
  }

  P.playoffs = function (app, arg) {
    const s = UI.state.season;
    const g = UI.state.game;
    const live = s && s.playoffs ? UI.normBracket(s.playoffs) : null;
    const yr = s ? s.year : UI.year();
    const u = UI.userTeam();
    const sel = arg ? String(arg) : null;
    wireEsc();
    // Champion screen: once per season, right after the Finals
    if (live && live.champion && g && !sel) {
      g.champShown = g.champShown || {};
      if (!g.champShown[yr]) {
        g.champShown[yr] = true;
        champOpen = yr;
        // keep the "shown" mark even if the page is reloaded before the next sim saves
        try { const w = UI.saves && UI.saves.write && UI.saves.write(); if (w && w.catch) w.catch(() => {}); } catch (e) { /* saved with the next sim */ }
      }
      if (champOpen === yr) {
        app.innerHTML = champScreen(live, yr);
        UI.$('#poContinue', app).addEventListener('click', continueToOffseason);
        UI.$('#poBracket', app).addEventListener('click', () => { champOpen = null; UI.route(); });
        return;
      }
    }
    const br = live || projected();
    const off = UI.inOffseason();
    const canSim = UI.canPlay() && !!g && !off;
    let hero, controls = '';
    const btn = (id, label, on, gold, title) => `<button type="button" class="btn po-b${gold ? ' btn-gold' : ''}" id="${id}"${on ? '' : ' disabled'}${title ? ` title="${esc(title)}"` : ''}>${label}</button>`;
    if (live) {
      const me = mySeries(live, u);
      const st = youStatus(live, u);
      const out = !!me && !!me.x.winner && me.x.winner !== u;
      const won = live.champion && live.champion === u;
      hero = poHero(yr + ' NBA PLAYOFFS', live.champion ? 'NBA FINALS: ' + live.champion + ' WIN THE TITLE' : roundTitle(live, u), st, u, won ? 'gold' : out || !me ? 'dim' : '');
      if (canSim && !live.champion) {
        const nextOk = canSimNext();
        const active = !!me && !me.x.winner;
        controls = `${resultStrip()}<div class="po-ctl" role="group" aria-label="Sim the playoffs">
          ${nextOk ? btn('poNext', 'SIM NEXT GAME', true, true) : btn('poDay', 'SIM DAY', true, true)}
          ${btn('poSeries', 'SIM TO END OF SERIES', active, false, active ? '' : 'Your team has no series in progress')}
          ${btn('poRound', 'SIM ROUND', true)}
          ${btn('poFinals', 'SIM TO FINALS', live.drawn < 4, false, live.drawn < 4 ? '' : 'The Finals are on')}
          ${btn('poAll', 'SIM PLAYOFFS', true)}</div>`;
      } else if (live.champion && !off && g) {
        controls = `<div class="po-ctl"><button type="button" class="btn btn-gold po-b" id="poContinue">CONTINUE TO OFFSEASON</button></div>`;
      }
    } else {
      const t = u ? UI.team(u) : null;
      const r = t && s ? UI.confTable(t.conf).find(z => z.abbr === u) : null;
      const st = !g ? '' : r ? (r.rank <= 8 ? 'You would be the #' + r.rank + ' seed in the ' + t.conf : 'You are #' + r.rank + ' in the ' + t.conf + ', outside the top 8') : '';
      hero = poHero(yr + ' NBA PLAYOFFS', 'PLAYOFF PICTURE', st, g ? u : null, r && r.rank > 8 ? 'dim' : '');
      const sub = !g ? 'Projected by team overall. Start the Association to play it out.' : 'If the season ended today.';
      controls = `<p class="po-note muted">${sub}</p>` + (canSim ? `<div class="po-ctl">${btn('poToPo', 'SIM TO PLAYOFFS', true, true)}${btn('poAll', 'SIM PLAYOFFS', true)}</div>` : '');
    }
    const champBanner = live && live.champion ? (() => {
      const mvp = live.finalsMvp && UI.player(live.finalsMvp);
      return `<a class="po-cb" href="#/playoffs" id="poShowChamp" style="--tc:${esc(UI.teamColor(live.champion))}">${UI.logo(live.champion, 40)}<span><small>${esc(yr)} NBA CHAMPIONS</small><b>${esc(UI.teamName(live.champion).toUpperCase())}</b></span>${mvp ? `<span class="po-cb-mvp"><small>FINALS MVP</small><b>${esc(mvp.name)}</b></span>` : ''}</a>`;
    })() : '';
    const found = live && sel ? findSeriesById(live, sel) : null;
    app.innerHTML = `<div class="po-page">${hero}${controls}${champBanner}${live ? playInHtml(playInGames()) : ''}${bracket2k(br, found ? sel : null)}</div>${found ? panelHtml(found.x, found.ri) : ''}`;

    // wiring
    const on = (id, fn) => { const b = UI.$('#' + id, app); if (b) b.addEventListener('click', fn); };
    on('poNext', () => simNextGame());
    on('poDay', () => { markSim(); UI.sim({ days: 1 }); });
    on('poSeries', () => simSeriesEnd());
    on('poRound', () => simRound());
    on('poFinals', () => simToFinals());
    on('poAll', () => { markSim(); UI.sim('endPlayoffs'); });
    on('poToPo', () => { markSim(); UI.sim('endRegular'); });
    on('poContinue', continueToOffseason);
    const sc = UI.$('#poShowChamp', app);
    if (sc) sc.addEventListener('click', e => { e.preventDefault(); champOpen = yr; if (location.hash !== '#/playoffs') location.hash = '#/playoffs'; else UI.route(); window.scrollTo(0, 0); });
    app.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => { location.hash = '#/playoffs'; }));
    const x = UI.$('.sp-panel .sp-x', app);
    if (x) x.focus({ preventScroll: true });
  };

  // ---------- Saves ----------
  P.saves = function (app) {
    const list = UI.saves.list();
    const active = UI.state.slot;
    const card = ({ slot, meta }) => {
      if (!meta) {
        return `<div class="slot empty-slot"><div class="slot-n">SLOT ${slot}</div><div class="slot-body"><div class="slot-name muted">Empty</div></div>
          <div class="slot-actions">${UI.canPlay() ? `<a class="btn btn-small" href="#/new">NEW LEAGUE</a>` : ''}<button type="button" class="btn btn-small" data-act="import" data-slot="${slot}">IMPORT</button></div></div>`;
      }
      if (meta.broken) {
        return `<div class="slot"><div class="slot-n">SLOT ${slot}</div><div class="slot-body"><div class="slot-name">Unreadable save</div></div>
          <div class="slot-actions"><button type="button" class="btn btn-small btn-danger" data-act="delete" data-slot="${slot}">DELETE</button></div></div>`;
      }
      const when = meta.updated ? new Date(meta.updated).toLocaleString() : '';
      const where = [meta.year ? UI.seasonLabel(meta.year) : '', UI.PHASES[meta.phase === 'regular' ? meta.seasonPhase || 'regular' : meta.phase] || '', meta.date ? UI.dateLabel(meta.date) : ''].filter(Boolean).join(' | ');
      return `<div class="slot${slot === active ? ' active' : ''}" data-slot="${slot}">
        <div class="slot-n">SLOT ${slot}${slot === active ? ' <span class="badge badge-gold">LOADED</span>' : ''}</div>
        <div class="slot-body">${UI.logo(meta.userTeam, 48)}<div>
          <div class="slot-name" data-name>${esc(meta.name)}</div>
          <div class="slot-meta">${esc(UI.teamName(meta.userTeam))} | ${esc(meta.record || '0-0')}${where ? ' | ' + esc(where) : ''}</div>
          <div class="slot-meta muted">${esc(when)}</div>
        </div></div>
        <div class="slot-actions">
          ${slot === active ? `<a class="btn btn-small btn-gold" href="#/season">PLAY</a>` : `<button type="button" class="btn btn-small btn-gold" data-act="load" data-slot="${slot}" ${UI.canPlay() ? '' : 'disabled'}>LOAD</button>`}
          <details class="slot-more"><summary class="btn btn-small">MORE</summary><div class="slot-more-list">
            <button type="button" class="btn btn-small" data-act="rename" data-slot="${slot}">RENAME</button>
            <button type="button" class="btn btn-small" data-act="export" data-slot="${slot}">EXPORT</button>
            <button type="button" class="btn btn-small" data-act="import" data-slot="${slot}">IMPORT</button>
            <button type="button" class="btn btn-small btn-danger" data-act="delete" data-slot="${slot}">DELETE</button>
          </div></details>
        </div>
      </div>`;
    };
    app.innerHTML = UI.header('LOAD', 'Your leagues save in this browser after every sim. Use Export to keep a copy.') +
      `<div class="slots">${list.map(card).join('')}</div><input type="file" id="importFile" accept=".json,application/json" hidden>`;

    const fileInput = UI.$('#importFile');
    let importSlot = null;
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!f || importSlot == null) return;
      try {
        await UI.saves.importFile(f, importSlot);
        UI.toast('Imported into slot ' + importSlot + '.');
        UI.updateChrome();
        UI.route();
      } catch (e) { UI.toast('Import failed: ' + e.message, 'error'); }
    });

    app.querySelector('.slots').addEventListener('click', async e => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const slot = Number(b.getAttribute('data-slot'));
      const act = b.getAttribute('data-act');
      const info = list.find(x => x.slot === slot);
      try {
        if (act === 'load') {
          b.disabled = true;
          b.textContent = 'LOADING...';
          await UI.saves.load(slot);
          UI.updateChrome();
          location.hash = '#/season';
        } else if (act === 'export') {
          await UI.saves.exportFile(slot);
        } else if (act === 'import') {
          if (info && info.meta && b.getAttribute('data-confirm') !== '1') {
            b.setAttribute('data-confirm', '1');
            b.textContent = 'OVERWRITE?';
            return;
          }
          importSlot = slot;
          fileInput.click();
        } else if (act === 'delete') {
          if (b.getAttribute('data-confirm') !== '1') {
            b.setAttribute('data-confirm', '1');
            b.textContent = 'CONFIRM DELETE';
            return;
          }
          await UI.saves.remove(slot);
          UI.updateChrome();
          UI.toast('Slot ' + slot + ' deleted.');
          UI.route();
        } else if (act === 'rename') {
          const nameEl = b.closest('.slot').querySelector('[data-name]');
          nameEl.innerHTML = `<form class="rename"><input maxlength="40" value="${esc(info.meta.name)}" aria-label="Save name"><button class="btn btn-small btn-gold" type="submit">OK</button></form>`;
          const form = nameEl.querySelector('form');
          const input = form.querySelector('input');
          input.focus();
          input.select();
          form.addEventListener('submit', async ev => {
            ev.preventDefault();
            await UI.saves.rename(slot, input.value);
            UI.updateChrome();
            UI.route();
          });
        }
      } catch (err) {
        console.warn(err);
        UI.toast(err.message || String(err), 'error');
        if (act === 'load') UI.route();
      }
    });
  };
})();
