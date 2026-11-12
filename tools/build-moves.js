// Builds data/historic-moves.js: what changed in the league from one real season to the next, 1947-48 to 1987-88, for an
// Association that opens before it (js/expansion.js applyMoves runs a season's moves in the summer before it).
//   node tools/build-moves.js
// From the Draft Challenge season files (data/era-YYYY.js), by franchise (one abbreviation each, see AB in build-start.js):
//   add      a franchise that was not in the league the season before (an expansion team, or a team that joined from another league)
//   fold     a franchise that is gone the next season (its players go to the free agents)
//   rename   the same franchise under a new city, name or colours (a move)
//   align    a new conference or division
const fs = require('fs'), path = require('path'), vm = require('vm');
global.window = global;
const ROOT = path.join(__dirname, '..');
const run = f => vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
const AB = { NJN: 'BKN', CHH: 'NOH', VAN: 'MEM', NYN: 'BKN', WSB: 'WAS', BUF: 'LAC', SDC: 'LAC', NOJ: 'UTA', KCK: 'SAC',
  PHW: 'GSW', SFW: 'GSW', MNL: 'LAL', ROC: 'SAC', CIN: 'SAC', KCO: 'SAC', SYR: 'PHI', FTW: 'DET', MLH: 'ATL', STL: 'ATL', TRI: 'ATL',
  CHP: 'WAS', CHZ: 'WAS', BAL: 'WAS', CAP: 'WAS', SDR: 'HOU' };
const ab = a => AB[a] || a;
const era = y => { if (!global.ERA_ROSTERS || !global.ERA_ROSTERS[y]) run('data/era-' + y + '.js'); return global.ERA_ROSTERS[y]; };
const label = y => (y - 1) + '-' + String(y).slice(2);
const names = l => l.length <= 1 ? l.join('') : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1];
const out = {};
for (let Y = 1948; Y <= 1988; Y++) {
  const a = {}, b = {};
  era(Y - 1).teams.forEach(t => { a[ab(t.abbr)] = t; });
  era(Y).teams.forEach(t => { b[ab(t.abbr)] = t; });
  const m = { add: [], fold: [], rename: {}, align: {} };
  const full = t => (t.city + ' ' + t.name).trim();
  Object.keys(b).forEach(k => {
    const t = b[k], o = a[k];
    if (!o) { m.add.push({ abbr: k, city: t.city, name: t.name, conf: t.conf, div: t.div, colors: t.colors }); return; }
    if (o.city !== t.city || o.name !== t.name) m.rename[k] = { city: t.city, name: t.name, colors: t.colors, from: full(o) };
    if (o.conf !== t.conf || o.div !== t.div) m.align[k] = [t.conf, t.div];
  });
  Object.keys(a).forEach(k => { if (!b[k]) m.fold.push(k); });
  if (!m.add.length && !m.fold.length && !Object.keys(m.rename).length && !Object.keys(m.align).length) continue;
  // the headline and the transaction text
  const bits = [];
  if (m.add.length) bits.push(names(m.add.map(full)) + (m.add.length > 1 ? ' join' : ' joins') + ' the league');
  if (m.fold.length) bits.push(names(m.fold.map(k => full(a[k]))) + (m.fold.length > 1 ? ' fold' : ' folds'));
  Object.keys(m.rename).forEach(k => bits.push('the ' + m.rename[k].from + ' become the ' + full(b[k])));
  m.n = Object.keys(b).length;
  m.headline = bits.length ? bits[0].charAt(0).toUpperCase() + bits[0].slice(1) : 'The league realigns';
  m.body = bits.length ? 'For ' + label(Y) + ': ' + bits.join('; ') + '. The league has ' + m.n + ' teams.' : 'The league realigns its divisions for ' + label(Y) + '.';
  m.tx = bits.length ? 'League change for ' + label(Y) + ': ' + bits.join('; ') + '.' : 'The league realigns for ' + label(Y) + '.';
  out[Y] = m;
}
const head = '/* Historic league changes, 1947-48 to 1987-88 (built by tools/build-moves.js from data/era-YYYY.js): teams that join, fold or move, and realignments. Run by js/expansion.js for an Association that opens before them. */\n';
fs.writeFileSync(path.join(ROOT, 'data', 'historic-moves.js'), head + 'window.HISTORIC_MOVES = ' + JSON.stringify(out) + ';\n');
console.log(Object.keys(out).length + ' seasons with changes');
Object.keys(out).forEach(Y => console.log(Y, out[Y].tx));
