// Repairs players whose attributes were clamped flat at 99 (a 97+ overall scaled past the ceiling): the profile is rebuilt from the
// same player's least saturated card (any season), or a same-position player when there is none, and set back to the card's overall
// with the soft ceiling in js/progression.js. Fixes data/start-*.js and data/challenge-pool.js.
// node tools/fix-saturation.js
const fs = require('fs');
global.window = global;
console.warn = () => {};
require('../js/progression.js');
const P = window.PROG;
const AT = ['close', 'mid', 'three', 'ft', 'layup', 'dunk', 'post', 'handle', 'pass', 'oreb', 'dreb', 'steal', 'block', 'perD', 'intD', 'speed', 'vert', 'strength', 'stamina', 'durability', 'oiq', 'diq'];
const spread = p => { const v = Object.values(p.attrs), m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length); };
const hot = p => p.attrs ? Object.values(p.attrs).filter(v => v >= 99).length : 0;
const SAT = 8;   // eight or more attributes at 99 counts as flattened
const starts = {};
fs.readdirSync('data').filter(x => /^start-\d+\.js$/.test(x)).forEach(x => {
  const f = 'data/' + x, s = fs.readFileSync(f, 'utf8'), y = +x.match(/\d+/)[0], tag = 'window.START_LEAGUES[' + y + '] = ';
  const a = s.indexOf(tag) + tag.length, b = s.indexOf(';\n', a) < 0 ? s.length - 2 : s.indexOf(';\n', a) - 1;   // the data sits on one line, ending at its semicolon
  starts[y] = { f, s, a, b, L: JSON.parse(s.slice(a, b + 1)) };
});
const pf = 'data/challenge-pool.js', ps = fs.readFileSync(pf, 'utf8'), pa = ps.indexOf('window.CHALLENGE_POOL = ') + 24, pb = ps.lastIndexOf('};');
const pool = JSON.parse(ps.slice(pa, pb + 1));
const all = [];
Object.keys(starts).forEach(y => starts[y].L.players.forEach(p => all.push(p)));
pool.players.forEach(p => all.push(p));
const orig = new Map(all.map(p => [p, p.attrs ? Object.assign({}, p.attrs) : null]));   // donors are read from the data as it was, never from a card this run already rebuilt
const byId = {};
all.forEach(p => { if (p.attrs) (byId[p.id] = byId[p.id] || []).push(p); });
const group = p => String(p.pos || 'SF').toUpperCase().split(/[-\/ ,]/)[0].replace('G', 'SG').replace('F', 'SF');
const clean = all.filter(p => p.attrs && hot(p) <= 1 && p.ovr >= 70);
const fixed = new Map();
function rebuild(p) {
  const spreadO = q => spread({ attrs: orig.get(q) });
  const cands = (byId[p.id] || []).filter(q => q !== p && hot({ attrs: orig.get(q) }) <= 3);
  // his most varied card that is still a real player (within 20% of this overall): later seasons were scaled from earlier ones and drift toward one flat number
  let donor = cands.filter(q => q.ovr >= p.ovr * 0.8).sort((x, y) => spreadO(y) - spreadO(x))[0] || cands.sort((x, y) => y.ovr - x.ovr)[0];
  if (!donor) donor = clean.filter(q => group(q) === group(p)).sort((x, y) => Math.abs(x.ovr - p.ovr) - Math.abs(y.ovr - p.ovr))[0];
  if (!donor) return false;
  // aim the position-weighted attribute mean a little under the overall for stars (2K's overall rewards a few elite attributes, so a 99 is not 99 across the board)
  const aim = Math.min(p.ovr, p.ovr - Math.max(0, (p.ovr - 85) * 0.5));
  const q = { attrs: Object.assign({}, orig.get(donor)), ovr: null, pos: p.pos, age: p.age || donor.age };
  P.setOvr(q, aim, { keepPot: true });
  p.attrs = q.attrs;
  return true;
}
let n = 0, miss = 0;
all.forEach(p => { if (hot(p) >= SAT) { const key = p.id + '@' + p.season; if (rebuild(p)) n++; else miss++; } });
Object.keys(starts).forEach(y => { const o = starts[y]; fs.writeFileSync(o.f, o.s.slice(0, o.a) + JSON.stringify(o.L) + o.s.slice(o.b + 1)); });
fs.writeFileSync(pf, ps.slice(0, pa) + JSON.stringify(pool) + ps.slice(pb + 1));
console.log('rebuilt', n, 'no donor', miss);
const left = all.filter(p => hot(p) >= SAT).length;
console.log('still flat:', left);
