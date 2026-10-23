// All-Star Weekend tests: node tools/test-allstar.js
// Sims a league past the All-Star break and checks the weekend is built once, is deterministic,
// and records its winners once (awards and news).
'use strict';
const fs = require('fs');
global.window = global;
const files = ['data/league2012.js', 'data/drafts.js', 'data/targets.js', 'data/cap-history.js', 'data/coaches.js', 'data/coach-history.js', 'data/gleague.js',
  'data/history.js', 'data/personalities.js', 'data/logos.js', 'data/world-events.js', 'data/career-prior.js', 'data/picks-2012.js', 'data/awards-prior.js', 'data/schedules.js',
  'js/engine.js', 'js/cba.js', 'js/trade.js', 'js/freeagency.js', 'js/mood.js', 'js/draft.js', 'js/draft-gen.js', 'js/progression.js', 'js/coaches.js', 'js/gleague.js',
  'js/awards.js', 'js/news.js', 'js/league.js', 'js/allstar.js'];
const origWarn = console.warn; const warns = [];
console.warn = (...a) => warns.push(a.join(' '));
for (const f of files) if (fs.existsSync(__dirname + '/../' + f)) require('../' + f);
console.warn = origWarn;
const L = window.LEAGUE, AS = window.ALLSTAR;
let pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log('FAIL: ' + msg); } }
const DASH = new RegExp('[' + String.fromCharCode(0x2012, 0x2013, 0x2014, 0x2015) + ']');

ok(!DASH.test(fs.readFileSync(__dirname + '/../js/allstar.js', 'utf8')), 'no em or en dashes in js/allstar.js');
ok(!DASH.test(fs.readFileSync(__dirname + '/../js/ui-allstar.js', 'utf8')), 'no em or en dashes in js/ui-allstar.js');
ok(!/\.pot\b/.test(fs.readFileSync(__dirname + '/../js/ui-allstar.js', 'utf8')), 'the page never reads potential');

function toBreak(s) {
  let g = 0;
  while (!(s.allStars && s.allStars.year === s.year) && g++ < 200) { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); L.advance(s, { days: 1 }); }
}
const s = L.newLeague('OKC', { seed: 77 });
ok(AS.weekend(s) === null, 'no weekend before the rosters are named');
toBreak(s);
const wk = s.allStarWeekend && s.allStarWeekend[s.year];
ok(!!wk, 'weekend built by the advance hook at the break');
ok(AS.weekend(s) === wk, 'weekend(state) returns the stored weekend');
// determinism: a clone of the state at the break rebuilt from scratch matches
const c = JSON.parse(JSON.stringify(s));
delete c.allStarWeekend;
Object.values(c.players).forEach(p => { p.awards = (p.awards || []).filter(a => !AS.AWARDS.includes(a.award)); });
c.news = c.news.filter(n => n.type !== 'allStars');
c.rngSeed = s.rngSeed;
// the stored seed is from the moment of the build: rebuild with it
const seedState = JSON.parse(JSON.stringify(c));
const strip = w => JSON.stringify(Object.assign({}, w, { day: 0 }));
const w1 = AS.weekend(c);
const c2 = JSON.parse(JSON.stringify(seedState));
const w2 = AS.weekend(c2);
ok(strip(w1) === strip(w2), 'same state gives the same weekend');
ok(strip(w1) === strip(wk), 'rebuild matches the weekend made at the break');

// formats and contents for 2013
ok(wk.rising.format === 'chuckShaq' && wk.rising.teams.length === 2 && wk.rising.teams[0].name === 'Team Chuck', 'Rising Stars 2013: Team Chuck vs Team Shaq');
ok(wk.rising.teams.every(t => t.ids.every(id => s.players[id].yearsPro <= 1)), 'Rising Stars: rookies and sophomores only');
ok(wk.game.format === 'eastWest' && wk.game.teams.map(t => t.name).join() === 'East,West', 'All-Star Game 2013: East vs West');
const gm = wk.game.games[0];
ok(Math.max(gm.home.pts, gm.away.pts) >= 150, 'All-Star Game winner scores 150+: ' + gm.home.pts + '-' + gm.away.pts);
ok(gm.home.box.reduce((a, r) => a + r.pts, 0) === gm.home.pts, 'box score adds up to the score');
ok(gm.home.box.every(r => r.pts === 2 * (r.fgm - r.tpm) + 3 * r.tpm + r.ftm && r.fgm <= r.fga && r.tpm <= r.tpa && r.ftm <= r.fta), 'box rows are consistent');
ok(gm.quarters.reduce((a, q) => a + q[0], 0) === gm.home.pts, 'quarters add up');
ok(wk.game.mvp && wk.game.teams.find(t => t.key === wk.game.champion).ids.includes(wk.game.mvp.id), 'All-Star MVP is on the winning team');
ok(wk.three.field.length === 6 && wk.three.winner, 'Three-Point Contest: six shooters and a winner');
const scores = wk.three.rounds.flatMap(r => r.rows.map(x => x.score));
ok(scores.every(x => x >= 0 && x <= 30), '2013 three-point scores within 0 to 30');
ok(wk.dunk.field.length === 6 && wk.dunk.winner, 'Dunk Contest: six dunkers and a winner');
ok(wk.dunk.rounds.every(r => r.rows.every(x => x.dunks.every(d => d.score >= 30 && d.score <= 50))), 'dunk scores 30 to 50');
ok(wk.skills.winner.length === 1 && wk.skills.format === 'individual', 'Skills Challenge 2013: individual winner');

// winners recorded once
const count = award => Object.values(s.players).reduce((n, p) => n + (p.awards || []).filter(a => a.year === s.year && a.award === award).length, 0);
AS.AWARDS.forEach(a => ok(count(a) === 1, a + ' recorded once (' + count(a) + ')'));
const newsN = s.news.filter(n => n.type === 'allStars').length;
AS.weekend(s); wk.recorded = false; AS.weekend(s);
AS.AWARDS.forEach(a => ok(count(a) === 1, a + ' still once after re-run'));
ok(s.news.filter(n => n.type === 'allStars').length === newsN && newsN === 5, 'five news items, no duplicates (' + newsN + ')');

// later formats on the same rosters (year switched to exercise every era)
for (const y of [2016, 2019, 2021, 2023, 2025]) {
  const t = JSON.parse(JSON.stringify(s));
  delete t.allStarWeekend; t.year = y; t.allStars.year = y;
  const w = AS.weekend(t, { record: false });
  ok(!!w, y + ' weekend builds');
  if (!w) continue;
  if (y === 2016) ok(w.rising.format === 'usaWorld' && w.skills.format === 'bracket' && w.three.field.length === 8, '2016: USA vs World, bracket, 8 shooters');
  if (y === 2016) ok(w.skills.rounds[0].matches.length === 4 && w.skills.rounds[2].matches.length === 1, '2016 skills bracket 4-2-1');
  if (y === 2019) ok(w.game.format === 'captains' && /^Team /.test(w.game.teams[0].name) && w.game.teams[0].ids.length === 12, '2019: captains draft, 12 a side');
  if (y === 2021) ok(w.rising.format === 'none' && w.game.trophy === 'Kobe Bryant Trophy', '2021: no Rising Stars, Kobe Bryant Trophy');
  if (y === 2023) {
    ok(w.rising.format === 'tournament' && w.rising.games.length === 3, '2023 Rising Stars: three games');
    const f = w.rising.games[2], s1 = w.rising.games[0];
    ok(Math.max(s1.home.pts, s1.away.pts) >= 40 && Math.max(s1.home.pts, s1.away.pts) <= 42 && Math.min(s1.home.pts, s1.away.pts) < 40, 'semifinal to 40: ' + score(s1));
    ok(Math.max(f.home.pts, f.away.pts) >= 25 && Math.max(f.home.pts, f.away.pts) <= 27 && Math.min(f.home.pts, f.away.pts) < 25, 'final to 25: ' + score(f));
    ok(w.skills.format === 'teams' && w.skills.winner.length === 3, '2023 skills: team of three');
  }
  if (y === 2025) ok(w.game.format === 'tournament' && w.game.teams.length === 4 && w.game.teams[3].key === 'rising' && w.game.games.length === 3, '2025: four-team tournament with the Rising Stars winner');
}
function score(g) { return g.home.pts + '-' + g.away.pts; }
ok(!warns.some(w => /allstar/.test(w)), 'no allstar warnings: ' + warns.filter(w => /allstar/.test(w)).join(' | '));
console.log('All-Star tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
