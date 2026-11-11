// Gives every all-time pool card the rating the calibrated start file has for the same player and season.
// node tools/sync-pool-ovr.js
const fs = require('fs');
global.window = global;
console.warn = () => {};
require('../js/progression.js');
const P = window.PROG;
const f = 'data/challenge-pool.js', src = fs.readFileSync(f, 'utf8');
const a = src.indexOf('window.CHALLENGE_POOL = ') + 'window.CHALLENGE_POOL = '.length, b = src.lastIndexOf('};');
const pool = JSON.parse(src.slice(a, b + 1));
const leagues = {};
fs.readdirSync('data').filter(x => /^start-\d+\.js$/.test(x)).forEach(x => { require('../data/' + x); });
let n = 0;
pool.players.forEach(p => {
  const L = window.START_LEAGUES[p.season], s = L && L.players.find(q => q.id === p.id);
  if (!s || s.ovr === p.ovr) return;
  if (p.attrs) P.setOvr(p, s.ovr, { keepPot: true }); else p.ovr = s.ovr;
  n++;
});
fs.writeFileSync(f, src.slice(0, a) + JSON.stringify(pool) + src.slice(b + 1));
console.log('synced', n);
