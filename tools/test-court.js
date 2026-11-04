// Court view test (js/ui-court.js and the structured play-by-play in js/engine.js). Run: node tools/test-court.js
// 1. Every pbp line has a pbx code and the timeline has one event per line.
// 2. The score after each event matches the score printed on the line, the quarter totals and the final.
// 3. Points, rebounds and assists summed from the events match every box score row.
// 4. Five players a side on the floor at every event, and everyone named on a line is on the floor.
// 5. The codes agree with the text: names, shot types, free throws, steals, blocks.
// 6. Substitution lines (opts.pbpSubs) match the lineup changes.
// 7. The extra fields change nothing in the game and stay small; saved games keep them only with the pbp.
'use strict';
const path = require('path');
global.window = global;
const ROOT = path.join(__dirname, '..');
const ENGINE = require(path.join(ROOT, 'js', 'engine.js'));
require(path.join(ROOT, 'data', 'league2012.js'));
require(path.join(ROOT, 'data', 'tendencies.js'));
const COURT = require(path.join(ROOT, 'js', 'ui-court.js'));
const league = window.LEAGUE_2012;

let pass = 0, fail = 0;
function check(ok, msg) { if (ok) pass++; else fail++; console.log((ok ? '  ok   ' : '  FAIL ') + msg); }

const by = {};
league.teams.forEach(t => { by[t.abbr] = { abbr: t.abbr, players: [], starters: t.starters }; });
league.players.forEach(p => { if (by[p.team]) by[p.team].players.push(p); });
const abbrs = Object.keys(by);

// helpers
check(JSON.stringify(COURT.bitsOf(0)) === '[]' && JSON.stringify(COURT.bitsOf(1 + 4 + 1024)) === '[0,2,10]', 'bitsOf reads lineup masks');
const u = ENGINE.unpackPbx(ENGINE.PBX.MAKE + 16 * 1 + 32 * 3 + 1024 * 7 + 32768 * 2 + 1048576 * 3);
check(u.k === ENGINE.PBX.MAKE && u.side === 1 && u.a === 2 && u.b === 6 && u.c === 1 && u.x === 3, 'unpackPbx reverses the packing');
check(COURT.timeline({ home: { abbr: 'A', box: [] }, away: { abbr: 'B', box: [] }, pbp: ['Q1 12:00 x'] }) === null, 'no timeline without pbx (old saves, the test stub)');

const games = [];
for (let s = 1; s <= 40; s++) {
  const home = by[abbrs[s % abbrs.length]], away = by[abbrs[(s * 11 + 5) % abbrs.length]];
  if (home === away) continue;
  games.push(ENGINE.simGame(home, away, ENGINE.rng(s * 104729), { year: 2013 }));
}
// one overtime game for the period handling
let ot = null;
for (let s = 1; s < 400 && !ot; s++) {
  const r = ENGINE.simGame(by.MIA, by.BOS, ENGINE.rng(s * 31337), { year: 2013 });
  if (r.ot) ot = r;
}
if (ot) games.push(ot);
check(!!ot, 'found an overtime game to test (' + (ot ? ot.ot + ' OT' : 'none') + ')');

let lenBad = 0, tsBad = 0, qBad = 0, finBad = 0, boxBad = 0, fiveBad = 0, actorBad = 0, nameBad = 0, shotBad = 0, ftBad = 0, kindBad = 0, subs = 0, scored = 0;
const SHOT_WORD = { three: /three point/, mid: /jumper/, post: /hook|post/, close: /layup|dunk/ };
games.forEach(res => {
  const tl = COURT.timeline(res);
  if (!tl || res.pbx.length !== res.pbp.length || tl.events.length !== res.pbp.length) { lenBad++; return; }
  const name = key => res[COURT.sideOf(key)].box[COURT.idxOf(key)].name;
  const q = [];
  let lastEnd = { hs: 0, as: 0 };
  tl.events.forEach((ev, i) => {
    if (ev.ts && (ev.ts.hs !== ev.hs || ev.ts.as !== ev.as)) tsBad++;
    if (ev.pts) scored++;
    if (ev.k === 'end') { q.push([ev.hs - lastEnd.hs, ev.as - lastEnd.as]); lastEnd = ev; }
    // five a side, real box rows, all different
    ['home', 'away'].forEach(side => {
      const on = ev.on[side];
      if (on.length !== 5 || new Set(on).size !== 5 || on.some(k => COURT.sideOf(k) !== side || !res[side].box[COURT.idxOf(k)])) fiveBad++;
    });
    const onFloor = key => !key || ev.on[COURT.sideOf(key)].indexOf(key) >= 0;
    if (!onFloor(ev.a) || !onFloor(ev.b) || !onFloor(ev.c)) actorBad++;
    if (ev.b && ev.k === 'make' && COURT.sideOf(ev.b) !== ev.side) actorBad++;
    if (ev.b && (ev.k === 'miss' || ev.k === 'sfoul' || ev.k === 'tov') && COURT.sideOf(ev.b) === ev.side) actorBad++;
    // the code and the text agree
    const body = ev.body;
    if (ev.a && body.indexOf(name(ev.a) + ' ') !== 0) nameBad++;
    if (ev.k === 'make' && ev.b && body.indexOf('(' + name(ev.b) + ' assists)') < 0) nameBad++;
    if (ev.k === 'make' && !ev.b && /assists\)/.test(body)) nameBad++;
    if (ev.k === 'make' && ev.c && body.indexOf('fouled by ' + name(ev.c)) < 0) nameBad++;
    if (ev.k === 'miss' && ev.b && body.indexOf('blocked by ' + name(ev.b)) < 0) nameBad++;
    if (ev.k === 'tov' && ev.tov === 'steal' && body.indexOf('stolen by ' + name(ev.b)) < 0) nameBad++;
    if (ev.k === 'sfoul' && body.indexOf('fouled by ' + name(ev.b) + ' on ') < 0) nameBad++;
    if ((ev.k === 'make' || ev.k === 'miss' || ev.k === 'sfoul') && !SHOT_WORD[ev.shot].test(body)) shotBad++;
    if (ev.k === 'make' && /three point/.test(body) !== (ev.pts === 3)) shotBad++;
    if (ev.k === 'ft' && body.indexOf('makes ' + ev.made + ' of ' + ev.att + ' free throws') < 0) ftBad++;
    const want = { make: / makes (?!\d)/, miss: / misses /, oreb: / offensive rebound$/, dreb: / defensive rebound$/, pf: / personal foul$/,
      foulout: / fouls out$/, inj: / leaves the game/, tip: /^Tip-off/, end: /^End of /, final: /^Final: /, tov: / turnover| offensive foul$/ }[ev.k];
    if (want && !want.test(body)) kindBad++;
    if (i === 0 && ev.k !== 'tip') kindBad++;
  });
  const last = tl.events[tl.events.length - 1];
  if (last.k !== 'final' || last.hs !== res.home.pts || last.as !== res.away.pts) finBad++;
  if (JSON.stringify(q) !== JSON.stringify(res.quarters)) qBad++;
  // box score lines
  const lines = COURT.linesAt(tl, tl.events.length);
  ['home', 'away'].forEach(side => res[side].box.forEach((r, i) => {
    const l = lines[COURT.keyOf(side, i)] || { pts: 0, reb: 0, ast: 0 };
    if (l.pts !== r.pts || l.reb !== r.oreb + r.dreb || l.ast !== r.ast) boxBad++;
  }));
  // lineup changes happen during the game
  for (let i = 1; i < tl.events.length; i++) if (tl.events[i].on !== tl.events[i - 1].on) { subs++; break; }
});
check(lenBad === 0, 'every pbp line has a pbx code and an event (' + games.length + ' games, ' + lenBad + ' bad)');
check(tsBad === 0, 'the score after each event matches the score printed on the line (' + tsBad + ' off, ' + scored + ' scoring plays)');
check(qBad === 0, 'quarter totals from the events match res.quarters (' + qBad + ' games off)');
check(finBad === 0, 'the last event is the final and its score is the final score (' + finBad + ' off)');
check(boxBad === 0, 'points, rebounds and assists from the events match every box score row (' + boxBad + ' rows off)');
check(fiveBad === 0, 'five different players a side on the floor at every event (' + fiveBad + ' bad)');
check(actorBad === 0, 'every player named on a line is on the floor, on the right team (' + actorBad + ' bad)');
check(nameBad === 0, 'the codes name the same players as the text (' + nameBad + ' mismatches)');
check(shotBad === 0, 'shot types match the shot descriptions (' + shotBad + ' mismatches)');
check(ftBad === 0, 'free throw made and attempted match the text (' + ftBad + ' mismatches)');
check(kindBad === 0, 'event kinds match the text (' + kindBad + ' mismatches)');
check(subs === games.length, 'lineups change during every game (' + subs + ' of ' + games.length + ')');
if (ot) {
  const tl = COURT.timeline(ot);
  const ends = tl.events.filter(e => e.k === 'end').map(e => e.per);
  check(ends.length === 4 + ot.ot && ends[4] === 'OT1' && tl.events[tl.events.length - 1].t === 2880 + 300 * ot.ot,
    'overtime periods and clock (' + ends.join(' ') + ')');
}
// the game clock
const tl0 = COURT.timeline(games[0]);
check(tl0.events[0].t === 0 && tl0.events[0].per === 'Q1' && tl0.events.every((e, i) => i === 0 || e.t >= tl0.events[i - 1].t), 'game time never runs backwards');
check(COURT.linesAt(tl0, 0) && Object.keys(COURT.linesAt(tl0, 0)).length === 0, 'nobody has a line before the first event');

// substitution lines (off by default) agree with the lineup changes
{
  const res = ENGINE.simGame(by.OKC, by.SAS, ENGINE.rng(77), { year: 2013, pbpSubs: true });
  const tl = COURT.timeline(res);
  let bad = 0, n = 0;
  tl.events.forEach((ev, i) => {
    if (ev.k !== 'sub') return;
    n++;
    const next = tl.events[i + 1] || ev;
    const m = /^substitution: (.+) in for (.+)$/.exec(ev.body);
    if (!m) { bad++; return; }
    const onNames = next.on[ev.side].map(k => res[ev.side].box[COURT.idxOf(k)].name);
    const before = ev.on[ev.side].map(k => res[ev.side].box[COURT.idxOf(k)].name);
    m[1].split(', ').forEach(nm => { if (onNames.indexOf(nm) < 0) bad++; });
    m[2].split(', ').forEach(nm => { if (before.indexOf(nm) < 0) bad++; });
  });
  check(n > 10 && bad === 0, 'substitution lines match the lineup changes (' + n + ' lines, ' + bad + ' bad)');
}

// the structured fields change nothing in the game itself
{
  let same = 0;
  for (let s = 1; s <= 8; s++) {
    const a = ENGINE.simGame(by.LAL, by.DEN, ENGINE.rng(s), { year: 2013 });
    const b = ENGINE.simGame(by.LAL, by.DEN, ENGINE.rng(s), { year: 2013, pbp: false });
    if (JSON.stringify([a.home, a.away, a.quarters, a.injuries]) === JSON.stringify([b.home, b.away, b.quarters, b.injuries]) && !b.pbx) same++;
  }
  check(same === 8, 'games with and without play-by-play come out the same (' + same + ' of 8)');
}
{
  let pb = 0, extra = 0;
  games.forEach(r => { pb += JSON.stringify(r.pbp).length; extra += JSON.stringify(r.pbx).length + JSON.stringify(r.pbl).length; });
  check(extra / pb < 0.2, 'pbx and pbl add ' + Math.round(extra / games.length) + ' bytes a game, ' + (extra / pb * 100).toFixed(1) + '% of the pbp text');
}

// saved games: pbx and pbl kept with the pbp, dropped with it, and the timeline works from the compact box
{
  const rng = ENGINE.rng(2013);
  const season = ENGINE.newSeason(league, { rng, userTeam: league.teams[0].abbr });
  ENGINE.simDays(season, 4, rng, league);
  const stored = Object.values(season.boxScores).filter(r => r && r.home && typeof r.home === 'object');
  const withP = stored.filter(r => r.pbp), without = stored.filter(r => !r.pbp);
  check(withP.length === 20 && withP.every(r => Array.isArray(r.pbx) && Array.isArray(r.pbl)), 'the ' + withP.length + ' games with pbp keep pbx and pbl');
  check(without.length > 0 && without.every(r => r.pbx === undefined && r.pbl === undefined), 'older games drop pbx and pbl with the pbp (' + without.length + ' games)');
  let off = 0;
  withP.forEach(r => {
    const tl = COURT.timeline(r);
    const lines = COURT.linesAt(tl, tl.events.length);
    ['home', 'away'].forEach(side => r[side].box.forEach((row, i) => { const l = lines[COURT.keyOf(side, i)]; if ((l ? l.pts : 0) !== (row.pts || 0)) off++; }));
    const last = tl.events[tl.events.length - 1];
    if (last.hs !== r.home.pts || last.as !== r.away.pts) off++;
  });
  check(off === 0, 'stored box scores replay to the same points (' + off + ' off)');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
