// Fictional draft class test. Run: node tools/test-draft-gen.js [--classes N] [--seed N]
// 1. Shape: every generated prospect has every field that all real prospects in data/drafts.js have,
//    with the same value types, and attrs has exactly the same 22 keys.
// 2. Determinism: the same rng gives the same class.
// 3. Names: unique, and never the full name of a real player found anywhere in data/*.js.
// 4. Distributions: N generated classes (default 50) against the real 2013 to 2025 classes, as a table.
//    2026 is shown but not used as the reference: its ratings are pre-career projections.
'use strict';
const fs = require('fs');
const path = require('path');

global.window = global;
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'data/league2012.js'));
require(path.join(ROOT, 'data/drafts.js'));
const PROG = require(path.join(ROOT, 'js/progression.js'));
const GEN = require(path.join(ROOT, 'js/draft-gen.js'));

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const NCLASSES = argVal('--classes', 50);
const SEED = argVal('--seed', 2027);

let failures = 0, checks = 0;
function check(ok, msg) {
  checks++;
  if (!ok) failures++;
  console.log((ok ? '  ok   ' : '  FAIL ') + msg);
}
const D = window.DRAFTS;
const REF_YEARS = Object.keys(D).filter(y => +y <= 2025);
const realClasses = REF_YEARS.map(y => D[y]);
const realAll = [].concat(...realClasses);
const everyReal = [].concat(...Object.keys(D).map(y => D[y]));
const K = PROG.ATTR_KEYS;
const typeOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;

// ---------------------------------------------------------------------------
// Generated classes
// ---------------------------------------------------------------------------
const genClasses = [];
for (let c = 0; c < NCLASSES; c++) {
  const year = 2027 + c;
  genClasses.push(GEN.generate(year, PROG.mulberry32(SEED * 1000 + c)));
}
const genAll = [].concat(...genClasses);

// ---------------------------------------------------------------------------
// 1. Shape
// ---------------------------------------------------------------------------
console.log('Shape');
const keyCount = {}, keyTypes = {};
everyReal.forEach(p => Object.keys(p).forEach(k => {
  keyCount[k] = (keyCount[k] || 0) + 1;
  (keyTypes[k] = keyTypes[k] || new Set()).add(typeOf(p[k]));
}));
const required = Object.keys(keyCount).filter(k => keyCount[k] === everyReal.length);
const optional = Object.keys(keyCount).filter(k => keyCount[k] < everyReal.length);
const EXTRA_OK = ['college', 'country', 'fictional'];
console.log('  real fields on every prospect: ' + required.join(', '));
console.log('  real optional fields (not generated): ' + optional.join(', '));
let missing = [], badType = [], extras = new Set(), badAttrs = 0, badVals = [];
genAll.forEach(p => {
  required.forEach(k => {
    if (!(k in p)) missing.push(p.id + '.' + k);
    else if (!keyTypes[k].has(typeOf(p[k]))) badType.push(p.id + '.' + k + ':' + typeOf(p[k]));
  });
  Object.keys(p).forEach(k => { if (!keyCount[k]) extras.add(k); });
  const ak = Object.keys(p.attrs || {});
  if (ak.length !== K.length || K.some(k => !Number.isInteger(p.attrs[k]) || p.attrs[k] < 25 || p.attrs[k] > 99)) badAttrs++;
  if (!Number.isInteger(p.ovr) || !Number.isInteger(p.pot) || p.pot < p.ovr || p.pot > 99) badVals.push(p.id + ' ovr/pot');
  if (!Number.isInteger(p.age) || p.age < 18 || p.age > 24) badVals.push(p.id + ' age');
  if (['PG', 'SG', 'SF', 'PF', 'C'].indexOf(p.pos) < 0) badVals.push(p.id + ' pos');
  if (p.team !== 'DRAFT' || p.nbaId !== null || p.injury !== null || p.stats !== null || p.face !== null || p.undrafted !== false || p.realPick !== null) badVals.push(p.id + ' fixed fields');
  if (!(p.arrivalYear >= p.draftYear + 1 && p.arrivalYear <= p.draftYear + 4)) badVals.push(p.id + ' arrivalYear');
  if (typeof p.college !== 'string' || !p.college || typeof p.country !== 'string') badVals.push(p.id + ' college/country');
});
check(missing.length === 0, 'every real field present on every generated prospect' + (missing.length ? ': ' + missing.slice(0, 5).join(', ') : ''));
check(badType.length === 0, 'every field has a type real prospects use' + (badType.length ? ': ' + badType.slice(0, 5).join(', ') : ''));
check(badAttrs === 0, 'attrs has exactly the 22 keys, integers 25 to 99 (' + badAttrs + ' bad)');
check(badVals.length === 0, 'values valid: ovr <= pot <= 99, age 18 to 24, pos, fixed fields, arrivalYear, college and country' + (badVals.length ? ': ' + badVals.slice(0, 5).join(', ') : ''));
const extraList = [...extras];
check(extraList.every(k => EXTRA_OK.indexOf(k) >= 0), 'only expected extra fields: ' + (extraList.join(', ') || 'none'));
check(Object.keys(D['2013'][0].attrs).join() === Object.keys(genAll[0].attrs).join(), 'attrs key order matches the real prospects');
const idOk = genClasses.every((cls, c) => cls.every((p, i) => /^gen\d{4}_\d{3}$/.test(p.id) && p.id.slice(3, 7) === String(2027 + c)) && new Set(cls.map(p => p.id)).size === cls.length);
check(idOk, 'ids look like gen2027_001 and are unique in each class');
check(genAll.every(p => p.draftYear >= 2027), 'draftYear set to the class year');
const sizes = genClasses.map(c => c.length);
check(Math.min(...sizes) >= 70 && Math.max(...sizes) <= 90, 'class sizes ' + Math.min(...sizes) + ' to ' + Math.max(...sizes) + ' (wanted 70 to 90)');
check(GEN.generate(2030, PROG.mulberry32(1), { size: 85 }).length === 85, 'opts.size sets the class size');

// ---------------------------------------------------------------------------
// 2. Determinism
// ---------------------------------------------------------------------------
console.log('Determinism');
const a1 = JSON.stringify(GEN.generate(2031, PROG.mulberry32(99)));
const a2 = JSON.stringify(GEN.generate(2031, PROG.mulberry32(99)));
const a3 = JSON.stringify(GEN.generate(2031, PROG.mulberry32(100)));
check(a1 === a2, 'same rng gives the same class');
check(a1 !== a3, 'a different rng gives a different class');
check(JSON.stringify(GEN.generate(2031)) === JSON.stringify(GEN.generate(2031)), 'no rng: seeded from the year, still deterministic');
// The rng is the only source of randomness: Math.random is never used
const mr = Math.random; let usedMR = false; Math.random = () => { usedMR = true; return mr(); };
GEN.generate(2032, PROG.mulberry32(3)); Math.random = mr;
check(!usedMR, 'Math.random is never called');

// ---------------------------------------------------------------------------
// 3. Names
// ---------------------------------------------------------------------------
console.log('Names');
const dataText = fs.readdirSync(path.join(ROOT, 'data')).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')).join('\n');
const nameLike = new Set();
(dataText.match(/[A-ZÀ-ſ][A-Za-zÀ-ſ'.\-]+(?: [A-Za-zÀ-ſ'.\-]+){1,3}/g) || []).forEach(s => {
  nameLike.add(s.toLowerCase());
  const w = s.split(' ');
  for (let i = 0; i + 1 < w.length; i++) { nameLike.add((w[i] + ' ' + w[i + 1]).toLowerCase()); if (i + 2 < w.length) nameLike.add((w[i] + ' ' + w[i + 1] + ' ' + w[i + 2]).toLowerCase()); }
});
const realNames = new Set(everyReal.map(p => p.name.toLowerCase()).concat(window.LEAGUE_2012.players.map(p => p.name.toLowerCase())));
const genNames = genAll.map(p => p.name);
const clashes = [...new Set(genNames.filter(n => realNames.has(n.toLowerCase()) || nameLike.has(n.toLowerCase())))];
check(clashes.length === 0, 'no generated name matches a real name in data/*.js (' + new Set(genNames).size + ' distinct names checked)' + (clashes.length ? ': ' + clashes.slice(0, 10).join(', ') : ''));
check(genClasses.every(c => new Set(c.map(p => p.name)).size === c.length), 'names unique inside each class');
const reuse = genNames.length - new Set(genNames).size;
console.log('  names repeated across ' + NCLASSES + ' independent classes: ' + reuse + ' of ' + genNames.length + ' (pass opts.used to avoid names already in the league)');
const usedTest = GEN.generate(2040, PROG.mulberry32(7)).map(p => p.name);
const avoid = GEN.generate(2040, PROG.mulberry32(7), { used: usedTest });
check(avoid.every(p => usedTest.indexOf(p.name) < 0), 'opts.used names are avoided');
console.log('  sample: ' + genClasses[0].slice(0, 12).map(p => p.name + ' (' + p.country + ', ' + p.college + ')').join('; '));

// ---------------------------------------------------------------------------
// 4. Distributions
// ---------------------------------------------------------------------------
console.log('Distributions: real 2013 to 2025 (' + realClasses.length + ' classes, ' + realAll.length + ' prospects) vs ' + NCLASSES + ' generated classes (' + genAll.length + ' prospects)');
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) * (v - m)))); };
const share = (list, f) => list.filter(f).length / list.length;
const value = p => 0.62 * p.pot + 0.38 * p.ovr;
// Simulated draft order: AI teams in js/draft.js rank by 0.62 pot + 0.38 ovr with scouting noise (pot sd 2.6, ovr sd 1.3)
function simOrder(cls, seed) {
  const r = PROG.mulberry32(seed);
  const g = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  return cls.map(p => ({ p, v: 0.62 * (p.pot + g() * 2.6) + 0.38 * (p.ovr + g() * 1.3) })).sort((x, y) => y.v - x.v).map(x => x.p);
}
const perClass = (classes, f) => mean(classes.map(f));
const rows = [];
function row(label, real, gen, tol, fmt, info) {
  const d = Math.abs(real - gen);
  const ok = info ? null : d <= tol;
  rows.push({ label, real, gen, tol, ok, fmt: fmt || 1, info });
}
const best = cls => cls.slice().sort((a, b) => value(b) - value(a))[0];
const bustsSim = (classes, salt) => perClass(classes, (c, i) => simOrder(c, salt + i).slice(0, 14).filter(p => p.pot < 78).length);
const lotteryPotSim = (classes, salt) => perClass(classes, (c, i) => mean(simOrder(c, salt + i).slice(0, 14).map(p => p.pot)));

row('class size', perClass(realClasses, c => c.length), perClass(genClasses, c => c.length), 0, 1, 'info: generated adds low-end fringe to 72-80');
row('per class: pot >= 90 (future stars)', perClass(realClasses, c => c.filter(p => p.pot >= 90).length), perClass(genClasses, c => c.filter(p => p.pot >= 90).length), 1.0, 2);
row('per class: pot >= 85 (all-star level)', perClass(realClasses, c => c.filter(p => p.pot >= 85).length), perClass(genClasses, c => c.filter(p => p.pot >= 85).length), 2.0, 2);
row('per class: pot >= 80 (starters)', perClass(realClasses, c => c.filter(p => p.pot >= 80).length), perClass(genClasses, c => c.filter(p => p.pot >= 80).length), 3.5, 2);
row('per class: ovr >= 75 (ready now)', perClass(realClasses, c => c.filter(p => p.ovr >= 75).length), perClass(genClasses, c => c.filter(p => p.ovr >= 75).length), 3.5, 2);
row('per class: pot < 70 (fringe)', perClass(realClasses, c => c.filter(p => p.pot < 70).length), perClass(genClasses, c => c.filter(p => p.pot < 70).length), 4, 2);
row('best prospect ovr', perClass(realClasses, c => best(c).ovr), perClass(genClasses, c => best(c).ovr), 2.5, 2);
row('best prospect pot', perClass(realClasses, c => best(c).pot), perClass(genClasses, c => best(c).pot), 2.5, 2);
row('real No. 1 pick ovr (info)', perClass(realClasses, c => c.find(p => p.realPick === 1).ovr), perClass(genClasses, (c, i) => simOrder(c, 500 + i)[0].ovr), 0, 2, 'info: gen = simulated AI pick 1');
row('real No. 1 pick pot (info)', perClass(realClasses, c => c.find(p => p.realPick === 1).pot), perClass(genClasses, (c, i) => simOrder(c, 500 + i)[0].pot), 0, 2, 'info: gen = simulated AI pick 1');
row('max pot in class', perClass(realClasses, c => Math.max(...c.map(p => p.pot))), perClass(genClasses, c => Math.max(...c.map(p => p.pot))), 2.0, 2);
row('max ovr in class', perClass(realClasses, c => Math.max(...c.map(p => p.ovr))), perClass(genClasses, c => Math.max(...c.map(p => p.ovr))), 2.0, 2);
row('sim lottery: busts (pot < 78) of 14', bustsSim(realClasses, 100), bustsSim(genClasses, 300), 1.5, 2);
row('sim lottery: mean pot', lotteryPotSim(realClasses, 100), lotteryPotSim(genClasses, 300), 1.5, 2);
row('real lottery busts (actual picks 1-14)', perClass(realClasses, c => c.filter(p => p.realPick && p.realPick <= 14 && p.pot < 78).length), NaN, 0, 2, 'info: real scouting was worse');
row('ovr mean', mean(realAll.map(p => p.ovr)), mean(genAll.map(p => p.ovr)), 1.2, 2);
row('ovr sd', sd(realAll.map(p => p.ovr)), sd(genAll.map(p => p.ovr)), 0.8, 2);
row('pot mean', mean(realAll.map(p => p.pot)), mean(genAll.map(p => p.pot)), 1.5, 2);
row('pot sd', sd(realAll.map(p => p.pot)), sd(genAll.map(p => p.pot)), 1.0, 2);
row('pot minus ovr mean', mean(realAll.map(p => p.pot - p.ovr)), mean(genAll.map(p => p.pot - p.ovr)), 0.8, 2);
row('share pot == ovr', share(realAll, p => p.pot === p.ovr), share(genAll, p => p.pot === p.ovr), 0.06, 3);
const corr = (xs, ys) => { const mx = mean(xs), my = mean(ys); return mean(xs.map((x, i) => (x - mx) * (ys[i] - my))) / sd(xs) / sd(ys); };
row('corr(ovr, pot)', corr(realAll.map(p => p.ovr), realAll.map(p => p.pot)), corr(genAll.map(p => p.ovr), genAll.map(p => p.pot)), 0.08, 3);
row('corr(age, pot)', corr(realAll.map(p => p.age), realAll.map(p => p.pot)), corr(genAll.map(p => p.age), genAll.map(p => p.pot)), 0.08, 3);
[18, 19, 20, 21, 22, 23].forEach(a => row('age ' + a + ' share', share(realAll, p => p.age === a), share(genAll, p => p.age === a), 0.03, 3));
row('age 24+ share', share(realAll, p => p.age >= 24), share(genAll, p => p.age >= 24), 0.02, 3);
row('pot >= 85 share, ages 18-19', share(realAll.filter(p => p.age <= 19), p => p.pot >= 85), share(genAll.filter(p => p.age <= 19), p => p.pot >= 85), 0.06, 3);
row('pot >= 85 share, ages 22+', share(realAll.filter(p => p.age >= 22), p => p.pot >= 85), share(genAll.filter(p => p.age >= 22), p => p.pot >= 85), 0.04, 3);
['PG', 'SG', 'SF', 'PF', 'C'].forEach(pos => row(pos + ' share', share(realAll, p => p.pos === pos), share(genAll, p => p.pos === pos), 0.03, 3));
['PG', 'SG', 'SF', 'PF', 'C'].forEach(pos => {
  const r = realAll.filter(p => p.pos === pos), g = genAll.filter(p => p.pos === pos);
  row(pos + ' height mean (in)', mean(r.map(p => p.ht)), mean(g.map(p => p.ht)), 0.5, 2);
  row(pos + ' weight mean (lb)', mean(r.map(p => p.wt)), mean(g.map(p => p.wt)), 4, 1);
  row(pos + ' weight sd (lb)', sd(r.map(p => p.wt)), sd(g.map(p => p.wt)), 3, 1);
});
row('stashed overseas share', share(realAll, p => p.arrivalYear > p.draftYear + 1), share(genAll, p => p.arrivalYear > p.draftYear + 1), 0.03, 3);
row('international share', NaN, share(genAll, p => p.country !== 'USA'), 0, 3, 'info: no country in real data, target 0.24');
// Attributes: attr minus ovr by position, mean and spread, over all 22 keys
['PG', 'SG', 'SF', 'PF', 'C'].forEach(pos => {
  const r = realAll.filter(p => p.pos === pos), g = genAll.filter(p => p.pos === pos);
  let dm = 0, ds = 0, worst = '', wv = 0;
  K.forEach(k => {
    const rv = r.map(p => p.attrs[k] - p.ovr), gv = g.map(p => p.attrs[k] - p.ovr);
    const d = Math.abs(mean(rv) - mean(gv));
    dm += d; ds += Math.abs(sd(rv) - sd(gv));
    if (d > wv) { wv = d; worst = k; }
  });
  row(pos + ' attrs: mean |diff| of (attr - ovr), 22 keys', 0, dm / K.length, 2.0, 2);
  row(pos + ' attrs: mean |diff| of sd, 22 keys', 0, ds / K.length, 2.5, 2);
  row(pos + ' attrs: worst key ' + worst, 0, wv, 4.5, 2);
});
row('calibration ovr - weighted attrs', mean(realAll.map(p => p.ovr - PROG.weightedOvr(p.attrs, p.pos))), mean(genAll.map(p => p.ovr - PROG.weightedOvr(p.attrs, p.pos))), 0.6, 2);
row('attrs at 25 share', share([].concat(...realAll.map(p => K.map(k => p.attrs[k]))), v => v <= 25), share([].concat(...genAll.map(p => K.map(k => p.attrs[k]))), v => v <= 25), 0.015, 3);
row('attrs at 99 share', share([].concat(...realAll.map(p => K.map(k => p.attrs[k]))), v => v >= 99), share([].concat(...genAll.map(p => K.map(k => p.attrs[k]))), v => v >= 99), 0.025, 3);
// High ovr prospects should have higher attributes in the skills that matter for their position
const top = genAll.filter(p => p.ovr >= 78), low = genAll.filter(p => p.ovr <= 66);
row('weighted attrs: ovr >= 78 minus ovr <= 66', mean(realAll.filter(p => p.ovr >= 78).map(p => PROG.weightedOvr(p.attrs, p.pos))) - mean(realAll.filter(p => p.ovr <= 66).map(p => PROG.weightedOvr(p.attrs, p.pos))),
  mean(top.map(p => PROG.weightedOvr(p.attrs, p.pos))) - mean(low.map(p => PROG.weightedOvr(p.attrs, p.pos))), 3, 2);

const fmtv = (v, f) => (v == null || Number.isNaN(v)) ? 'n/a' : v.toFixed(f);
const W = Math.max(...rows.map(r => r.label.length)) + 2;
console.log('  ' + 'metric'.padEnd(W) + 'real'.padStart(9) + 'gen'.padStart(9) + 'tol'.padStart(8) + '  result');
rows.forEach(r => {
  const res = r.info ? r.info : (r.ok ? 'ok' : 'FAIL');
  console.log('  ' + r.label.padEnd(W) + fmtv(r.real, r.fmt).padStart(9) + fmtv(r.gen, r.fmt).padStart(9) + (r.info ? '' : ('+-' + r.tol)).padStart(8) + '  ' + res);
  if (!r.info) { checks++; if (!r.ok) failures++; }
});
// 2026 for reference only
const c26 = D['2026'] || [];
if (c26.length) console.log('  (2026 class, not used as reference: ovr mean ' + mean(c26.map(p => p.ovr)).toFixed(1) + ', pot mean ' + mean(c26.map(p => p.pot)).toFixed(1) + ', pot >= 85: ' + c26.filter(p => p.pot >= 85).length + ')');

// The class plugs into js/draft.js without errors
console.log('Integration with js/draft.js');
try {
  const DRAFT = require(path.join(ROOT, 'js/draft.js'));
  const st = { year: 2027, rngSeed: 5, players: {}, teams: {}, draftClasses: {} };
  if (typeof DRAFT.loadClass === 'function') {
    const ids = DRAFT.loadClass(st, 2027);
    const p = st.players[ids[0]];
    console.log('  DRAFT.loadClass(2027): ' + ids.length + ' prospects, first id ' + ids[0] + (p && p.fictional ? ', fictional' : '') + (String(ids[0]).indexOf('_') > 0 ? ' (uses DRAFTGEN)' : ' (still the old built-in generator)'));
  }
} catch (e) { console.log('  could not run DRAFT.loadClass: ' + e.message); }

console.log('\n' + checks + ' checks, ' + failures + ' failures');
process.exit(failures ? 1 : 0);
