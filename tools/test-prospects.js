// Draft class integrity tests (js/draft.js, data/drafts.js). Run: node tools/test-prospects.js
// Nobody already in the league (on a roster, a free agent with NBA experience, stashed or retired) is
// ever in a draft pool: real classes 2013 to 2026 and generated classes from 2027.
'use strict';
const path = require('path');
global.window = global;
const R = f => require(path.join(__dirname, '..', f));
['data/league2012.js', 'data/drafts.js', 'data/targets.js', 'data/cap-history.js', 'data/coaches.js', 'data/personalities.js', 'data/career-prior.js',
  'data/history.js', 'data/gleague.js', 'data/awards-prior.js',
  'js/engine.js', 'js/cba.js', 'js/trade.js', 'js/freeagency.js', 'js/mood.js', 'js/draft-gen.js', 'js/draft.js', 'js/progression.js', 'js/coaches.js',
  'js/gleague.js', 'js/awards.js', 'js/news.js', 'js/league.js'].forEach(R);
const L = window.LEAGUE, D = window.DRAFT;
let pass = 0, fail = 0;
function check(ok, msg) { if (ok) pass++; else { fail++; console.log('  FAIL ' + msg); } }
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// 1. The data: ids unique across the league file, the classes and the rights list; no shared NBA.com ids
{
  const seen = {}, nba = {}, dups = [], nbaDups = [];
  const add = (p, src) => {
    if (seen[p.id]) dups.push(p.id + ' (' + seen[p.id] + ', ' + src + ')'); else seen[p.id] = src;
    if (p.nbaId) { if (nba[p.nbaId] && nba[p.nbaId] !== p.id) nbaDups.push(p.nbaId + ' ' + nba[p.nbaId] + '/' + p.id); nba[p.nbaId] = p.id; }
  };
  window.LEAGUE_2012.players.forEach(p => add(p, 'league2012'));
  (window.DRAFT_RIGHTS || []).forEach(p => add(p, 'DRAFT_RIGHTS'));
  Object.keys(window.DRAFTS).forEach(y => window.DRAFTS[y].forEach(p => add(p, 'DRAFTS ' + y)));
  check(!dups.length, 'every id appears once in league2012, DRAFT_RIGHTS and DRAFTS' + (dups.length ? ': ' + dups.join(', ') : ''));
  check(!nbaDups.length, 'no NBA.com id shared by two players' + (nbaDups.length ? ': ' + nbaDups.join(', ') : ''));
  const CP = window.CAREER_PRIOR || {};
  const before = [];
  Object.keys(window.DRAFTS).forEach(y => window.DRAFTS[y].forEach(p => {
    if ((CP[p.id] || []).length) before.push(p.name);
    if (p.returning && !(p.priorNba && p.priorNba.yearsPro > 0)) before.push(p.name + ' (returning without priorNba)');
  }));
  check(!before.length, 'no class lists a player with NBA seasons before 2012-13 unless flagged returning with his NBA past' + (before.length ? ': ' + before.join(', ') : ''));
}

// 2. A new league: every class 2013 to 2026, then generated classes 2027 to 2034
const s = L.newLeague('TOR', { seed: 4242 });
const removed = D.cleanClasses(s);
check(removed.some(x => x.id === 'ajincal01'), 'Alexis Ajinca (NBA 2008 to 2011) is taken out of the 2013 class');
const aj = s.players.ajincal01;
check(aj && aj.team === 'FA' && aj.yearsPro === 3 && aj.draft && aj.draft.year === 2008 && aj.draft.pick === 20, 'he is a free agent with 3 NBA seasons, drafted 2008 #20');
check(aj && aj.stashedUntil === 2014, 'he stays overseas until 2013-14 like in reality');
function nonDraft(state) {
  const idx = {};
  Object.values(state.players).forEach(q => { if (q.team !== 'DRAFT') (idx[fold(q.name)] = idx[fold(q.name)] || []).push(q); });
  return idx;
}
function checkPool(state, year) {
  const ids = D.pool(state, year), idx = nonDraft(state), bad = [];
  ids.forEach(id => {
    const p = state.players[id];
    if (!p || p.team !== 'DRAFT') bad.push(id + ' not a prospect');
    (idx[fold(p.name)] || []).forEach(q => {
      const by = q.retired && q.retiredYear ? q.retiredYear - q.age : (state.year - q.age);
      if (by === year - p.age) bad.push(p.name + ' ' + id + ' = ' + q.id + ' (' + q.team + ')');
    });
    if (p.returning || (window.CAREER_PRIOR[id] || []).length) bad.push(p.name + ' played in the NBA before');
    if (p.yearsPro) bad.push(p.name + ' has ' + p.yearsPro + ' years pro');
  });
  check(!bad.length, year + ' pool (' + ids.length + ' prospects) has nobody already in the league' + (bad.length ? ': ' + bad.slice(0, 5).join('; ') : ''));
  check(new Set(ids).size === ids.length, year + ' pool lists every prospect once');
  return ids;
}
for (let y = 2013; y <= 2026; y++) checkPool(s, y);

// 3. A planted duplicate: the same person as a league player under another id (exact name and birth
//    year), and one with an existing NBA.com id. Both are skipped; a same name with another birth year stays.
{
  const lebron = s.players.jamesle01;
  const twin = JSON.parse(JSON.stringify(s.players[D.pool(s, 2015)[0]]));
  twin.id = 'jamesle99'; twin.name = 'LeBron James'; twin.age = 2015 - (s.year - lebron.age); twin.nbaId = null; twin.draftYear = 2015;
  s.players.jamesle99 = twin; s.draftClasses[2015].push('jamesle99');
  const nbaTwin = JSON.parse(JSON.stringify(twin)); nbaTwin.id = 'twinnb01'; nbaTwin.name = 'Somebody Else'; nbaTwin.nbaId = s.players.paulch01.nbaId;
  s.players.twinnb01 = nbaTwin; s.draftClasses[2015].push('twinnb01');
  const other = JSON.parse(JSON.stringify(twin)); other.id = 'jamesle98'; other.age = twin.age - 6;
  s.players.jamesle98 = other; s.draftClasses[2015].push('jamesle98');
  const pool = D.pool(s, 2015);
  check(pool.indexOf('jamesle99') < 0, 'pool() skips a prospect with the name and birth year of a league player');
  check(pool.indexOf('twinnb01') < 0, 'pool() skips a prospect with the NBA.com id of a league player');
  check(pool.indexOf('jamesle98') >= 0, 'pool() keeps a namesake born in another year');
  D.cleanClasses(s);
  check(!s.players.jamesle99 && !s.players.twinnb01 && !!s.players.jamesle98, 'cleanClasses removes the planted duplicates from the save');
  delete s.players.jamesle98; s.draftClasses[2015] = s.draftClasses[2015].filter(id => id !== 'jamesle98');
}

// 4. Generated classes 2027 on: no name collides with anyone in the save, ids are new
{
  const st = L.newLeague('BOS', { seed: 99 });
  let clash = [], idClash = [];
  for (let y = 2027; y <= 2034; y++) {
    const before = new Set(Object.keys(st.players).filter(id => st.players[id].team !== 'DRAFT' || +st.players[id].draftYear !== y));
    const names = {};
    Object.values(st.players).forEach(q => { if (!(q.team === 'DRAFT' && +q.draftYear === y)) names[fold(q.name)] = q.id; });
    const ids = D.loadClass(st, y);
    ids.forEach(id => { if (before.has(id)) idClash.push(id); const n = fold(st.players[id].name); if (names[n]) clash.push(st.players[id].name + ' ' + y); });
    checkPool(st, y);
    // the class drafts and joins the league, so the next class is checked against it too
    ids.forEach(id => { st.players[id].team = 'FA'; });
  }
  check(!idClash.length, 'generated prospects get new ids' + (idClash.length ? ': ' + idClash.join(', ') : ''));
  check(!clash.length, 'generated prospect names never match a player already in the save' + (clash.length ? ': ' + clash.slice(0, 5).join(', ') : ''));
}

// 5. Through two real drafts: the drafted and undrafted players never come back in a later class
{
  const st = L.newLeague('TOR', { seed: 5 });
  for (let n = 0; n < 2; n++) {
    let r, guard = 0;
    do { st.events.forEach(e => (e.resolved = true)); L.clearResolved(st); r = L.advance(st, 'endPlayoffs'); } while (r.stopped !== 'seasonOver' && ++guard < 400);
    let steps = 0;
    while (st.phase !== 'regular' && steps++ < 120) {
      st.events.forEach(e => (e.resolved = true)); L.clearResolved(st);
      const r2 = L.advance(st, 'nextPhase');
      if (r2 && r2.stopped === 'userPick') {
        const ids = D.pool(st, st.year).filter(id => !st.players[id].undrafted).sort((a, b) => st.players[b].ovr - st.players[a].ovr);
        D.pick(st, st.userTeam, ids[0]);
      }
    }
  }
  const later = [];
  for (let y = st.year; y <= 2026; y++) D.pool(st, y).forEach(id => { const p = st.players[id]; if (p.careerStats && p.careerStats.length) later.push(p.name + ' ' + y); });
  check(st.year >= 2015, 'two seasons simulated (now ' + st.year + ')');
  check(!later.length, 'nobody with NBA games is in a later class' + (later.length ? ': ' + later.slice(0, 5).join(', ') : ''));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
