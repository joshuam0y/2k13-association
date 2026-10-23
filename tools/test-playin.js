// Play-In Tournament tests for js/engine.js: node tools/test-playin.js
// Builds a 2020-21 season straight from a new league (no offseasons), plays it out and checks the
// six Play-In games, the seeding, the bracket, the stats and the 2019-20 bubble play-in rule.
const path = require("path");
global.window = global;
const R = f => require(path.join(__dirname, "..", f));
["data/league2012.js", "data/drafts.js", "data/targets.js", "data/cap-history.js", "data/coaches.js", "data/personalities.js", "data/career-prior.js",
  "data/schedules.js", "js/engine.js", "js/cba.js", "js/trade.js", "js/freeagency.js", "js/mood.js", "js/draft.js", "js/progression.js", "js/coaches.js", "js/league.js"].forEach(R);
const L = window.LEAGUE, E = window.ENGINE, C = window.CBA;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const pct = s => (s.w + s.l ? s.w / (s.w + s.l) : 0);

function seasonFor(year, user) {
  const st = L.newLeague(user || "OKC", { seed: 99 });
  st.year = year;
  const view = L.leagueView(st);
  const season = E.newSeason(view, { year, userTeam: st.userTeam, rules: C.rules(year) });
  return { st, view, season };
}
function ranked(season, conf) {
  return E.standingsList(season, conf).map(r => r.abbr);
}

// ---------- 2020-21: modern Play-In ----------
{
  const { view, season } = seasonFor(2021);
  ok(season.playIn === true, "2021 season has the Play-In on");
  const rng = E.rng(2021);
  const regDays = season.days.length;
  E.simDays(season, regDays, rng, view);
  ok(season.phase === "playoffs", "regular season over, phase " + season.phase);
  const b = season.playoffs;
  ok(b && b.stage === "playIn" && b.rounds.length === 0, "postseason starts with the Play-In");
  const last = season.days[regDays - 1].date;
  if (season.realSchedule) ok(last === "2021-05-16", "real 2021 schedule ends May 16, got " + last);
  const before = {};
  Object.keys(season.standings).forEach(a => { before[a] = season.standings[a].w + "-" + season.standings[a].l; });
  const top = {};
  ["East", "West"].forEach(c => {
    top[c] = ranked(season, c);
    const x = b.playIn[c];
    ok(x["7v8"].hi === top[c][6] && x["7v8"].lo === top[c][7] && x["7v8"].hiSeed === 7 && x["7v8"].loSeed === 8, c + " 7 v 8 pairs seeds 7 and 8");
    ok(x["9v10"].hi === top[c][8] && x["9v10"].lo === top[c][9], c + " 9 v 10 pairs seeds 9 and 10");
    ok(b.seeds[c].length === 6 && b.seeds[c].join() === top[c].slice(0, 6).join(), c + " seeds 1 to 6 go straight in");
    for (let i = 6; i < 10; i++) ok(season.standings[top[c][i]].clinch === "playin", c + " seed " + (i + 1) + " marked playin");
  });
  // play the Play-In: the West 7 v 8 through the live-game path (simGame + recordGame), the rest through simDays
  let guard = 0, piGames = 0, liveDone = false;
  while (season.playoffs.stage === "playIn" && guard++ < 10) {
    if (season.day >= season.days.length) ok(E.schedulePlayoffDay(season), "a Play-In day can be scheduled");
    const day = season.days[season.day];
    ok(day.playIn && day.playoff, "Play-In days are flagged");
    const g = day.games.find(x => x.playIn === "West" && x.slot === "7v8");
    if (g && !liveDone) {
      const T = abbr => ({ abbr, players: view.players.filter(p => p.team === abbr) });
      const res = E.simGame(T(g.home), T(g.away), E.rng(7), { injuries: season.injuries, norms: season.norms });
      E.recordGame(season, g, res, view, { playoff: true, date: day.date });
      liveDone = g.played;
    }
    piGames += day.games.length;
    E.simDays(season, 1, rng, view);
  }
  ok(liveDone, "a Play-In game recorded through ENGINE.recordGame");
  ok(piGames === 6, "6 Play-In games, got " + piGames);
  const piDays = season.days.filter(d => d.playIn);
  ok(piDays.reduce((n, d) => n + d.games.length, 0) === 6, "6 Play-In games on the schedule");
  ok(piDays.every(d => d.games.every(g => g.played)), "every Play-In game played");
  const expDates = season.year === 2021 ? [2, 3, 4, 5] : [2, 3, 5];
  ok(piDays.map(d => d.date).join() === expDates.map(n => addDays(last, n)).join(), "Play-In dates " + piDays.map(d => d.date).join());
  if (season.realSchedule) ok(piDays.map(d => d.date).join() === "2021-05-18,2021-05-19,2021-05-20,2021-05-21", "real 2021 Play-In dates");
  ok(b.stage === "bracket" && b.rounds.length === 1, "bracket drawn after the Play-In");
  ok(b.startDate === addDays(last, 6), "playoffs start six days after the regular season, got " + b.startDate);
  ["East", "West"].forEach(c => {
    const x = b.playIn[c], a = x["7v8"], n = x["9v10"], f = x.final;
    [a, n, f].forEach(p => {
      ok(p.winner && p.gameId && p.hs != null && p.as != null && p.date, c + " Play-In game complete " + JSON.stringify(p));
      ok(p.winner === (p.hs > p.as ? p.hi : p.lo), c + " winner matches the score");
      const box = season.boxScores[p.gameId];
      ok(box && box.playIn && box.home.abbr === p.hi, c + " box score stored, higher seed at home");
    });
    const l78 = a.winner === a.hi ? a.lo : a.hi;
    ok(f.hi === l78 && f.lo === n.winner, c + " final: loser of 7 v 8 hosts winner of 9 v 10");
    ok(f.hiSeed < f.loSeed, c + " final higher seed hosts");
    ok(b.seeds[c].length === 8 && b.seeds[c][6] === a.winner && b.seeds[c][7] === f.winner, c + " seeds 7 and 8 are the Play-In winners");
    const r1 = b.rounds[0].filter(s => s.conf === c);
    const s18 = r1.find(s => s.hiSeed === 1), s27 = r1.find(s => s.hiSeed === 2);
    ok(s18.hi === top[c][0] && s18.lo === f.winner && s18.loSeed === 8, c + " 1 v 8 uses the Play-In final winner");
    ok(s27.hi === top[c][1] && s27.lo === a.winner && s27.loSeed === 7, c + " 2 v 7 uses the 7 v 8 winner");
    ok(season.standings[n.winner === n.hi ? n.lo : n.hi].clinch === "out", c + " 9 v 10 loser marked out");
  });
  // Play-In games are neither regular season nor playoffs
  Object.keys(season.standings).forEach(a => ok(season.standings[a].w + "-" + season.standings[a].l === before[a], "standings unchanged by the Play-In for " + a));
  ok(Object.keys(season.playoffStats).length === 0, "no playoff stats from the Play-In");
  ok(Object.keys(season.playInStats || {}).length > 0, "Play-In lines kept in season.playInStats");
  // finish the playoffs
  E.simDays(season, 200, rng, view);
  ok(season.phase === "done" && season.champion, "2021 playoffs finish, champion " + season.champion);
  ok(b.rounds.length === 4, "four playoff rounds");
}

// ---------- 2012-13: no Play-In ----------
{
  const { view, season } = seasonFor(2013);
  ok(season.playIn === false, "2013 has no Play-In");
  E.simDays(season, season.days.length, E.rng(5), view);
  ok(!season.playoffs.playIn && season.playoffs.rounds.length === 1 && season.playoffs.seeds.East.length === 8, "2013 seeds the top 8 straight in");
}

// ---------- 2019-20 bubble: 8 v 9 when the 9th is within 4 games ----------
function bubble(gap) {
  const { view, season } = seasonFor(2020);
  ok(season.playIn === false, "2020 has no modern Play-In");
  // skip the regular season with made-up records: West 8th 35-39, 9th (35 - gap)-(39 + gap) games behind
  season.days.forEach(d => d.games.forEach(g => { g.played = true; }));
  season.day = season.days.length;
  ["East", "West"].forEach(c => {
    const list = season.teams.filter(t => t.conf === c).map(t => t.abbr);
    // East: 5 games between neighbors (no bubble game); West: 3 games, then 8th and 9th set below
    list.forEach((a, i) => { const s = season.standings[a]; s.w = c === "East" ? 70 - 5 * i : 60 - 3 * i; s.l = 74 - s.w; });
    if (c === "West") { season.standings[list[7]].w = 35; season.standings[list[7]].l = 39; for (let i = 8; i < list.length; i++) { season.standings[list[i]].w = 35 - gap - 3 * (i - 8); season.standings[list[i]].l = 74 - season.standings[list[i]].w; } }
  });
  E.simDays(season, 1, E.rng(3), view);
  return { view, season };
}
{
  const { view, season } = bubble(1);   // 5 games back in the East, 1 in the West
  const b = season.playoffs;
  ok(b.playInFormat === "bubble" && b.playIn.West && !b.playIn.East, "bubble Play-In only where the 9th is within 4 games");
  const g1 = b.playIn.West.game1;
  ok(g1.hiSeed === 8 && g1.loSeed === 9, "bubble game 1 is 8 v 9");
  E.simDays(season, 3, E.rng(4), view);
  const x = b.playIn.West;
  const games = (x.game1 ? 1 : 0) + (x.game2 ? 1 : 0);
  ok(x.seed8 && (x.game1.winner === x.game1.hi ? games === 1 : games === 2), "the 8th needs one win, the 9th two");
  ok(b.stage === "bracket" && b.seeds.West[7] === x.seed8 && b.seeds.East.length === 8, "bubble winner is the West 8 seed");
  const r = b.rounds[0].find(s => s.conf === "West" && s.hiSeed === 1);
  ok(r.lo === x.seed8, "1 v 8 uses the bubble winner");
}
{
  const { season } = bubble(5);
  ok(!season.playoffs.playIn && season.playoffs.rounds.length === 1, "no bubble Play-In when the 9th is 5 games back");
}

console.log(`test-playin: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
