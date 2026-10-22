// Development stub: a tiny fake league and a fake engine, loaded only with ?stub=1.
// It replaces window.LEAGUE_2012 and window.ENGINE (with the same season shape as js/engine.js),
// so the UI can be tested quickly; js/league.js runs on top of it unchanged.
(function () {
  'use strict';

  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const r0 = seeded(2013);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

  const ATTR_KEYS = ['close', 'mid', 'three', 'ft', 'layup', 'dunk', 'post', 'handle', 'pass', 'oreb', 'dreb',
    'steal', 'block', 'perD', 'intD', 'speed', 'vert', 'strength', 'stamina', 'durability', 'oiq', 'diq'];

  function attrsFor(ovr, pos) {
    const big = pos === 'C' || pos === 'PF';
    const a = {};
    ATTR_KEYS.forEach(k => {
      let base = ovr - 8 + r0() * 16;
      if (big && ['oreb', 'dreb', 'block', 'intD', 'post', 'strength'].includes(k)) base += 10;
      if (big && ['three', 'handle', 'speed'].includes(k)) base -= 15;
      if (!big && ['oreb', 'block', 'post', 'strength'].includes(k)) base -= 12;
      a[k] = clamp(base, 25, 99);
    });
    return a;
  }

  // [id, name, pos, age, ht, wt, ovr, pot, nbaId, salary, contractEnd, injury, ppg, rpg, apg]
  const ROSTERS = {
    OKC: [
      ['duranke01', 'Kevin Durant', 'SF', 24, 81, 240, 94, 97, 201142, 16669630, 2016, null, 28.1, 7.9, 4.6],
      ['westbru01', 'Russell Westbrook', 'PG', 23, 75, 200, 88, 92, 201566, 5082416, 2017, null, 23.2, 5.2, 7.4],
      ['hardeja01', 'James Harden', 'SG', 23, 77, 220, 84, 92, 201935, 5820417, 2013, null, 16.8, 4.1, 3.7],
      ['ibakase01', 'Serge Ibaka', 'PF', 23, 82, 245, 80, 85, 201586, 2253284, 2013, null, 13.2, 7.7, 0.5],
      ['perkike01', 'Kendrick Perkins', 'C', 27, 82, 270, 72, 72, null, 7834449, 2015, null, 4.2, 6.0, 1.4],
      ['sefolth01', 'Thabo Sefolosha', 'SG', 28, 79, 222, 73, 73, null, 3900000, 2014, null, 7.6, 3.9, 1.3],
      ['collini01', 'Nick Collison', 'PF', 31, 82, 255, 72, 72, null, 3125000, 2015, null, 5.1, 4.1, 1.7],
      ['maynoer01', 'Eric Maynor', 'PG', 25, 75, 175, 70, 72, null, 3300000, 2013, null, 2.9, 1.0, 2.0],
      ['cookda02', 'Daequan Cook', 'SG', 25, 77, 210, 68, 69, null, 3200000, 2013, null, 4.5, 1.6, 0.4],
      ['thabeha01', 'Hasheem Thabeet', 'C', 25, 87, 263, 64, 66, null, 854389, 2014, null, 2.1, 2.9, 0.2],
      ['jonespe02', 'Perry Jones', 'SF', 21, 83, 235, 66, 78, null, 1082520, 2016, null, 2.4, 1.6, 0.3],
      ['jacksre01', 'Reggie Jackson', 'PG', 22, 75, 208, 69, 80, null, 1288800, 2015, null, 5.6, 2.9, 1.9],
      ['aldrico01', 'Cole Aldrich', 'C', 24, 83, 250, 63, 66, null, 2457000, 2013, { type: 'Sprained ankle', games: 6 }, 1.6, 2.1, 0.2]
    ],
    MIA: [
      ['jamesle01', 'LeBron James', 'SF', 27, 80, 250, 95, 98, 2544, 17545000, 2016, null, 26.8, 8.0, 7.3],
      ['wadedw01', 'Dwyane Wade', 'SG', 30, 76, 220, 90, 90, 2548, 17182000, 2016, null, 21.2, 5.0, 5.1],
      ['boshch01', 'Chris Bosh', 'PF', 28, 83, 235, 85, 86, 2547, 17545000, 2016, null, 16.6, 6.8, 1.7],
      ['allenra02', 'Ray Allen', 'SG', 37, 77, 205, 79, 79, 951, 3090000, 2014, null, 10.9, 2.7, 1.7],
      ['chalmma01', 'Mario Chalmers', 'PG', 26, 74, 190, 75, 76, null, 4000000, 2014, null, 8.6, 2.2, 3.5],
      ['battish01', 'Shane Battier', 'SF', 34, 80, 220, 73, 73, null, 3135000, 2014, null, 6.6, 2.4, 1.0],
      ['haslemu01', 'Udonis Haslem', 'PF', 32, 80, 235, 71, 71, null, 4045000, 2014, null, 3.9, 5.4, 0.5],
      ['millemi01', 'Mike Miller', 'SF', 32, 80, 218, 72, 72, null, 5800000, 2015, { type: 'Back spasms', games: 3 }, 4.7, 2.3, 1.3],
      ['anthojo01', 'Joel Anthony', 'C', 30, 81, 245, 68, 68, null, 3800000, 2015, null, 1.4, 1.8, 0.1],
      ['coleno01', 'Norris Cole', 'PG', 23, 74, 175, 70, 75, null, 1092720, 2015, null, 5.6, 1.6, 2.0],
      ['lewisra02', 'Rashard Lewis', 'PF', 33, 82, 235, 70, 70, null, 1352181, 2014, null, 5.0, 1.8, 0.4],
      ['harrejo01', 'Josh Harrellson', 'PF', 23, 82, 275, 64, 68, null, 762195, 2013, null, 2.1, 2.5, 0.3],
      ['pittmde01', 'Dexter Pittman', 'C', 24, 83, 308, 62, 65, null, 854389, 2013, null, 1.9, 1.4, 0.1]
    ]
  };

  const players = [];
  Object.keys(ROSTERS).forEach(team => {
    ROSTERS[team].forEach(row => {
      const [id, name, pos, age, ht, wt, ovr, pot, nbaId, salary, contractEnd, injury, pts, reb, ast] = row;
      const g = clamp(40 + r0() * 42, 1, 82);
      players.push({
        id, name, team, pos, age, ht, wt, ovr, pot, nbaId, salary, contractEnd, injury,
        attrs: attrsFor(ovr, pos),
        stats: {
          g, mpg: +(8 + ovr / 3 + r0() * 4).toFixed(1), pts, reb, ast,
          stl: +(r0() * 1.8).toFixed(1), blk: +(r0() * 1.5).toFixed(1),
          fgp: +(0.4 + r0() * 0.12).toFixed(3), tpp: +(0.3 + r0() * 0.1).toFixed(3), ftp: +(0.65 + r0() * 0.25).toFixed(3)
        },
        face: null
      });
    });
  });
  players.push({
    id: 'fakefa01', name: 'Free Agent Guard', team: 'FA', pos: 'PG', age: 29, ht: 73, wt: 180, ovr: 61, pot: 61,
    nbaId: null, salary: 0, contractEnd: 2013, injury: null, attrs: attrsFor(61, 'PG'),
    stats: { g: 30, mpg: 11.2, pts: 3.4, reb: 1.1, ast: 2.2, stl: 0.4, blk: 0.0, fgp: 0.41, tpp: 0.33, ftp: 0.78 }, face: null
  });

  window.LEAGUE_2012 = {
    season: 2013,
    teams: [
      { abbr: 'OKC', city: 'Oklahoma City', name: 'Thunder', conf: 'West', div: 'Northwest',
        colors: ['#007ac1', '#ef3b24'], logo: 'https://cdn.nba.com/logos/nba/1610612760/primary/L/logo.svg' },
      { abbr: 'MIA', city: 'Miami', name: 'Heat', conf: 'East', div: 'Southeast',
        colors: ['#98002e', '#f9a01b'], logo: 'https://cdn.nba.com/logos/nba/1610612748/primary/L/logo.svg' }
    ],
    players
  };

  // ---------- fake engine, same season shape as js/engine.js ----------
  const STAT_KEYS = ['min', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf'];
  const INJURIES = ['Sprained ankle', 'Bruised knee', 'Back spasms', 'Strained hamstring'];

  function teamBox(players, rng, injuries) {
    const healthy = players.filter(p => !(injuries && injuries[p.id])).sort((a, b) => b.ovr - a.ovr);
    const rot = healthy.slice(0, 10);
    const weights = rot.map((p, i) => (i < 5 ? 34 : 14) + rng() * 6);
    const sum = weights.reduce((s, w) => s + w, 0);
    return rot.map((p, i) => {
      const min = Math.round(weights[i] / sum * 2400) / 10;
      const usage = (p.ovr - 55) / 40;
      const fga = Math.max(0, Math.round(min * (0.25 + usage * 0.35) * (0.7 + rng() * 0.6)));
      const tpa = Math.round(fga * ((p.attrs && p.attrs.three) || 50) / 250 * rng());
      const fgm = Math.round(fga * (0.38 + rng() * 0.16));
      const tpm = Math.min(fgm, Math.round(tpa * (0.28 + rng() * 0.15)));
      const fta = Math.round(min * usage * 0.18 * rng() * 2);
      const ftm = Math.round(fta * (0.65 + rng() * 0.3));
      return {
        id: p.id, name: p.name, min, fgm, fga, tpm, tpa, ftm, fta,
        pts: 2 * (fgm - tpm) + 3 * tpm + ftm,
        oreb: Math.round(rng() * min / 14), dreb: Math.round(rng() * min / 6),
        ast: Math.round(rng() * min / 7 * (p.pos === 'PG' ? 2 : 1)),
        stl: Math.round(rng() * 2), blk: Math.round(rng() * (p.pos === 'C' ? 3 : 1)),
        tov: Math.round(rng() * 3), pf: Math.round(rng() * 4), starter: i < 5
      };
    });
  }

  function split(total, parts, rng) {
    const w = Array.from({ length: parts }, () => 0.8 + rng() * 0.4);
    const s = w.reduce((a, b) => a + b, 0);
    const out = w.map(x => Math.floor(total * x / s));
    out[parts - 1] += total - out.reduce((a, b) => a + b, 0);
    return out;
  }

  function simGame(homeTeam, awayTeam, rng, opts) {
    rng = rng || Math.random;
    const inj = opts && opts.injuries;
    const hb = teamBox(homeTeam.players, rng, inj);
    const ab = teamBox(awayTeam.players, rng, inj);
    const tot = box => box.reduce((s, r) => s + r.pts, 0);
    if (tot(hb) === tot(ab)) { hb[0].ftm++; hb[0].fta++; hb[0].pts++; }
    const hp = tot(hb), ap = tot(ab);
    const hq = split(hp, 4, rng), aq = split(ap, 4, rng);
    const pbp = [];
    const all = hb.concat(ab);
    const verbs = ['makes a 3-pt jumper', 'misses a driving layup', 'makes a dunk', 'grabs a defensive rebound', 'makes a mid-range jumper', 'commits a turnover'];
    for (let q = 1; q <= 4; q++) {
      for (let k = 0; k < 30; k++) {
        const r = all[Math.floor(rng() * all.length)];
        const sec = Math.max(0, 720 - k * 24 - Math.floor(rng() * 20));
        pbp.push('Q' + q + ' ' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') + ' ' + r.name + ' ' + verbs[Math.floor(rng() * verbs.length)]);
      }
    }
    const injuries = [];
    [hb, ab].forEach(box => { if (rng() < 0.04) injuries.push({ id: box[Math.floor(rng() * box.length)].id, type: INJURIES[Math.floor(rng() * INJURIES.length)], games: 1 + Math.floor(rng() * 6) }); });
    return {
      home: { abbr: homeTeam.abbr, pts: hp, box: hb }, away: { abbr: awayTeam.abbr, pts: ap, box: ab },
      quarters: hq.map((h, i) => [h, aq[i]]), ot: 0, pbp, injuries, winner: hp > ap ? homeTeam.abbr : awayTeam.abbr
    };
  }

  function addDays(iso, n) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function newSeason(league, opts) {
    const year = (opts && opts.year) || league.season || 2013;
    const teams = league.teams.map(t => ({ abbr: t.abbr, conf: t.conf, div: t.div }));
    const days = [];
    let n = 0;
    for (let d = 0; d < 82; d++) {
      const home = d % 2 ? teams[0].abbr : teams[1].abbr;
      const away = home === teams[0].abbr ? teams[1].abbr : teams[0].abbr;
      days.push({ date: addDays((year - 1) + '-10-30', d * 2), games: [{ id: 'g' + String(++n).padStart(4, '0'), home, away, played: false, hs: null, as: null }] });
    }
    const standings = {};
    teams.forEach(t => { standings[t.abbr] = { w: 0, l: 0, streak: 0, home: [0, 0], away: [0, 0], pf: 0, pa: 0, last10: [] }; });
    const injuries = {};
    (league.players || []).forEach(p => { if (p.injury && p.injury.games > 0) injuries[p.id] = { type: p.injury.type, games: p.injury.games }; });
    return { year, day: 0, days, teams, standings, playerStats: {}, playoffStats: {}, boxScores: {}, injuries, phase: 'regular', playoffs: null, champion: null, order: [], version: 1 };
  }

  function addLine(map, r) {
    const s = map[r.id] || (map[r.id] = { g: 0, gs: 0 });
    if (r.min > 0) s.g++;
    if (r.starter) s.gs++;
    STAT_KEYS.forEach(k => { s[k] = Math.round(((s[k] || 0) + r[k]) * 10) / 10; });
  }

  function record(season, g, res) {
    const H = season.standings[g.home], A = season.standings[g.away];
    const hw = res.home.pts > res.away.pts;
    const W = hw ? H : A, L = hw ? A : H;
    W.w++; L.l++;
    W.streak = W.streak > 0 ? W.streak + 1 : 1;
    L.streak = L.streak < 0 ? L.streak - 1 : -1;
    if (hw) { H.home[0]++; A.away[1]++; } else { H.home[1]++; A.away[0]++; }
    H.pf += res.home.pts; H.pa += res.away.pts; A.pf += res.away.pts; A.pa += res.home.pts;
    W.last10.push(1); L.last10.push(0);
    if (W.last10.length > 10) W.last10.shift();
    if (L.last10.length > 10) L.last10.shift();
  }

  function rosterOf(league, abbr) { return (league.players || []).filter(p => p.team === abbr); }

  function simDays(season, n, rng, league) {
    rng = rng || Math.random;
    league = league || window.LEAGUE_2012;
    const out = { gamesPlayed: [], phaseChanged: false, injuries: [], daysPlayed: 0 };
    for (let i = 0; i < n; i++) {
      if (season.phase === 'regular' && season.day >= season.days.length) {
        season.phase = 'playoffs';
        season.playoffs = playoffs(season);
        out.phaseChanged = true;
      }
      if (season.phase === 'playoffs' && season.day >= season.days.length) {
        const s = season.playoffs.rounds[0][0];
        const gn = s.hw + s.lw + 1;
        const hiHome = gn === 1 || gn === 2 || gn === 5 || gn === 7;
        season.days.push({ date: addDays(season.days[season.days.length - 1].date, 2), playoff: true,
          games: [{ id: 'pF-' + gn, home: hiHome ? s.hi : s.lo, away: hiHome ? s.lo : s.hi, played: false, hs: null, as: null, series: 'F', gameNum: gn }] });
      }
      if (season.phase === 'done') break;
      const day = season.days[season.day];
      day.games.forEach(g => {
        if (g.played) return;
        const res = simGame({ abbr: g.home, players: rosterOf(league, g.home) }, { abbr: g.away, players: rosterOf(league, g.away) }, rng, { injuries: season.injuries });
        res.id = g.id; res.date = day.date;
        g.played = true; g.hs = res.home.pts; g.as = res.away.pts;
        const map = day.playoff ? season.playoffStats : season.playerStats;
        res.home.box.forEach(r => addLine(map, r));
        res.away.box.forEach(r => addLine(map, r));
        Object.keys(season.injuries).forEach(id => { const e = season.injuries[id]; if (--e.games <= 0) delete season.injuries[id]; });
        res.injuries.forEach(x => { season.injuries[x.id] = { type: x.type, games: x.games }; out.injuries.push(x); });
        season.boxScores[g.id] = res;
        season.order.push(g.id);
        const old = season.order[season.order.length - 51];
        if (old && season.boxScores[old]) delete season.boxScores[old].pbp;
        if (day.playoff) {
          res.playoff = true;
          const s = season.playoffs.rounds[0][0];
          s.games.push(g.id);
          if (res.winner === s.hi) s.hw++; else s.lw++;
          if (s.hw === 4 || s.lw === 4) { s.winner = s.hw === 4 ? s.hi : s.lo; season.playoffs.champion = s.winner; season.playoffs.finalsMvp = res[s.winner === g.home ? 'home' : 'away'].box[0].id; }
        } else record(season, g, res);
        out.gamesPlayed.push(res);
      });
      season.day++;
      out.daysPlayed++;
      if (season.playoffs && season.playoffs.champion) { season.phase = 'done'; season.champion = season.playoffs.champion; out.phaseChanged = true; break; }
    }
    return out;
  }

  // With two teams the bracket is a single Finals series.
  function playoffs(season) {
    if (season.playoffs) return season.playoffs;
    const ranked = Object.keys(season.standings).sort((a, b) => season.standings[b].w - season.standings[a].w);
    return {
      seeds: {}, round: 4, champion: null, finalsMvp: null,
      rounds: [[{ id: 'F', conf: 'Finals', round: 4, hi: ranked[0], lo: ranked[1], hiSeed: 1, loSeed: 1, hw: 0, lw: 0, games: [], winner: null }]]
    };
  }

  window.ENGINE = { version: 1, newSeason, simDays, simGame, playoffs, seedPlayoffs: playoffs, getBoxScore: (s, id) => s.boxScores[id] || null, rng: seeded, STAT_KEYS, ATTR_KEYS };
  window.__A13_STUB = true;
})();
