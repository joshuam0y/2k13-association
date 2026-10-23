// Secondary position test. Run: node tools/test-positions.js
// 1. Every player in data/league2012.js and data/drafts.js, and fictional DRAFTGEN prospects,
//    gets a pos2 that differs from pos and sits next to it (PG-SG, SG-SF, SF-PF, PF-C).
// 2. Every REAL entry is adjacent to the player's listed position (so none is silently dropped).
// 3. The rule follows the examples: a 6'7" SF with handle and pass gets SG, a strong 6'9" SF gets PF.
// 4. coverage(): primary minutes first, short positions filled from deep ones by secondary positions.
'use strict';
const path = require('path');
global.window = global;
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'data/league2012.js'));
require(path.join(ROOT, 'data/drafts.js'));
const POS = require(path.join(ROOT, 'js/positions.js'));
let GEN = null;
try { GEN = require(path.join(ROOT, 'js/draft-gen.js')); } catch (e) { console.log('  (draft-gen.js not loadable: ' + e.message + ')'); }

let failures = 0, checks = 0;
function check(ok, msg) { checks++; if (!ok) failures++; console.log((ok ? '  ok   ' : '  FAIL ') + msg); }
const ORDER = ['PG', 'SG', 'SF', 'PF', 'C'];
const adj = (a, b) => Math.abs(ORDER.indexOf(a) - ORDER.indexOf(b)) === 1 && ORDER.indexOf(a) >= 0 && ORDER.indexOf(b) >= 0;

function audit(label, list) {
  const bad = [];
  const pairs = {};
  list.forEach(p => {
    const o = POS.of(p);
    if (o.pos !== String(p.pos).toUpperCase() || !o.pos2 || o.pos2 === o.pos || !adj(o.pos, o.pos2)) bad.push(p.id + ' ' + p.name + ' ' + p.pos + ' -> ' + o.pos + '/' + o.pos2);
    if (POS.label(p) !== o.pos + '/' + o.pos2) bad.push(p.id + ' label ' + POS.label(p));
    const k = o.pos + '/' + o.pos2; pairs[k] = (pairs[k] || 0) + 1;
  });
  check(!bad.length, `${label}: ${list.length} players, every pos2 differs from pos and is adjacent` + (bad.length ? ' | ' + bad.slice(0, 5).join('; ') : ''));
  console.log('        ' + Object.keys(pairs).sort((a, b) => ORDER.indexOf(a.split('/')[0]) - ORDER.indexOf(b.split('/')[0]) || a.localeCompare(b)).map(k => k + ' ' + pairs[k]).join(', '));
}

const league = window.LEAGUE_2012.players;
audit('league2012', league);
const drafts = [];
Object.keys(window.DRAFTS).forEach(y => window.DRAFTS[y].forEach(p => drafts.push(p)));
audit('drafts', drafts);
if (GEN && typeof GEN.generate === 'function') {
  const gen = [];
  for (let y = 2027; y < 2037; y++) GEN.generate(y, null).forEach(p => gen.push(p));
  audit('DRAFTGEN 2027-2036', gen);
}

// REAL entries must fit the listed position
const all = new Map(league.concat(drafts).map(p => [p.id, p]));
const misfit = Object.keys(POS.REAL).filter(id => all.has(id) && !adj(String(all.get(id).pos), POS.REAL[id])).map(id => id + ' ' + all.get(id).pos + '>' + POS.REAL[id]);
const unknown = Object.keys(POS.REAL).filter(id => !all.has(id));
check(!misfit.length, `${Object.keys(POS.REAL).length} real secondary positions all fit the listed position` + (misfit.length ? ' | ' + misfit.join(', ') : ''));
check(!unknown.length, 'every real entry matches a player id' + (unknown.length ? ' | ' + unknown.join(', ') : ''));
const covered = league.filter(p => POS.REAL[p.id]).length;
check(covered === league.length, `${covered} of ${league.length} 2012-13 players have a sourced secondary position`);

// spot checks
const byId = id => all.get(id);
const sc = [['jamesle01', 'SF/PF'], ['paulch01', 'PG/SG'], ['bryanko01', 'SG/SF'], ['nowitdi01', 'PF/C'], ['howardw01', 'C/PF'], ['duranke01', 'SF/PF']];
sc.forEach(([id, want]) => check(byId(id) && POS.label(byId(id)) === want, `${id} is ${want} (${byId(id) ? POS.label(byId(id)) : 'missing'})`));

// rule examples
const att = o => Object.assign({ close: 60, mid: 60, three: 60, ft: 70, layup: 60, dunk: 60, post: 50, handle: 60, pass: 60, oreb: 50, dreb: 55, steal: 55, block: 45, perD: 60, intD: 50, speed: 65, vert: 65, strength: 55, stamina: 70, durability: 80, oiq: 60, diq: 60 }, o);
check(POS.rule({ ht: 79, wt: 215, attrs: att({ handle: 80, pass: 78 }) }, 'SF') === 'SG', "rule: 6'7\" SF with good handle and pass gets SG");
check(POS.rule({ ht: 81, wt: 235, attrs: att({ strength: 80, post: 65, dreb: 70 }) }, 'SF') === 'PF', "rule: strong 6'9\" SF gets PF");
check(POS.rule({ ht: 82, wt: 250, attrs: att({ block: 80, post: 70, intD: 75, strength: 75, three: 30 }) }, 'PF') === 'C', 'rule: PF with block and post gets C');
check(POS.rule({ ht: 81, wt: 225, attrs: att({ three: 80, mid: 75, handle: 65, block: 40, post: 40 }) }, 'PF') === 'SF', 'rule: stretch PF gets SF');
check(POS.rule({ ht: 75, wt: 185, attrs: att({ three: 85 }) }, 'PG') === 'SG', 'rule: PG with scoring gets SG');
check(POS.of({ id: 'x', pos: 'SG-SF', ht: 78 }).pos2 === 'SF' && POS.of({ id: 'y', pos: 'SG', pos2: 'PG' }).pos2 === 'PG', 'combined pos "SG-SF" and explicit pos2 are honoured');

// coverage
const mk = (id, pos, pos2) => ({ id, name: id, pos, pos2, ovr: 70 });
const team = [mk('a', 'PG', 'SG'), mk('b', 'PG', 'SG'), mk('c', 'SG', 'SF'), mk('d', 'SF', 'PF'), mk('e', 'PF', 'C'), mk('f', 'PF', 'C'), mk('g', 'C', 'PF')];
const min = { a: 34, b: 30, c: 34, d: 36, e: 34, f: 30, g: 30 };
const cv = POS.coverage(team, min);
check(cv.total === 228 && cv.by.PG.min === 48 && cv.by.SG.min === 48 && cv.by.SF.min === 38 && cv.by.PF.min === 48 && cv.by.C.min === 46, `coverage moves PG surplus to SG (and on to SF) and PF surplus to C (PG ${cv.by.PG.min}, SG ${cv.by.SG.min}, SF ${cv.by.SF.min}, PF ${cv.by.PF.min}, C ${cv.by.C.min})`);
check(cv.thin.join() === 'SF,C' && cv.deep.join() === '', `thin ${cv.thin.join()} deep ${cv.deep.join()}`);
const cv2 = POS.coverage([mk('a', 'PG', 'SG'), mk('c', 'SG', 'SF')], { a: 48, c: 48 });
check(cv2.by.PG.min === 48 && cv2.by.SG.min === 48 && cv2.by.SF.min === 0, 'no surplus, nothing moves');
// chain: deep SF pushes a SF/PF to the four so a PF/C slides to center
const cv3 = POS.coverage([mk('a', 'PG', 'SG'), mk('b', 'SG', 'PG'), mk('s1', 'SF', 'PF'), mk('s2', 'SF', 'PF'), mk('p1', 'PF', 'C'), mk('c1', 'C', 'PF')], { a: 48, b: 48, s1: 40, s2: 40, p1: 40, c1: 24 });
check(cv3.by.SF.min === 48 && cv3.by.PF.min === 48 && cv3.by.C.min === 48, `chained cover: SF ${cv3.by.SF.min}, PF ${cv3.by.PF.min}, C ${cv3.by.C.min}`);
const p1 = cv3.by.C.players.find(x => x.id === 'p1');
check(!!p1 && p1.via === 'secondary' && p1.min === 24, 'the PF/C plays 24 at center');
// total is never changed
const cv4 = POS.coverage(team, Object.assign({}, min, { a: 48, b: 48 }));
check(cv4.total === 260, 'coverage keeps every minute (total ' + cv4.total + ')');

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
