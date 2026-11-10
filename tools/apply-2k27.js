// Sets the 2026-27 start (and the 2026-27 cards in the all-time pool) to the real NBA 2K27 launch ratings (nba.2k.com top 100).
// node tools/apply-2k27.js
const fs = require('fs');
global.window = global;
console.warn = () => {};
require('../js/progression.js');
const P = window.PROG;
const R = `Shai Gilgeous-Alexander 97|Victor Wembanyama 97|Nikola Jokić 97|Luka Dončić 96|Jalen Brunson 96|Giannis Antetokounmpo 96|Anthony Edwards 95|Cade Cunningham 94|Stephen Curry 93|Kevin Durant 93|Kawhi Leonard 93|Jayson Tatum 93|Donovan Mitchell 93|Karl-Anthony Towns 93|Tyrese Maxey 92|LeBron James 91|Jaylen Brown 91|Joel Embiid 91|Devin Booker 91|Tyrese Haliburton 90|Anthony Davis 90|Jamal Murray 89|Scottie Barnes 88|OG Anunoby 88|Deni Avdija 88|Austin Reaves 88|Paolo Banchero 87|Jalen Johnson 87|Bam Adebayo 87|Pascal Siakam 87|James Harden 87|Evan Mobley 87|Alperen Şengün 87|Stephon Castle 87|Trae Young 87|Kyrie Irving 87|Cooper Flagg 87|Lauri Markkanen 86|LaMelo Ball 86|Jaren Jackson Jr. 86|Amen Thompson 86|Chet Holmgren 86|Damian Lillard 86|Jalen Duren 85|Jalen Williams 85|Jimmy Butler 85|Trey Murphy III 85|Franz Wagner 85|Michael Porter Jr. 85|Zion Williamson 85|Dylan Harper 85|Jaden McDaniels 85|Ausar Thompson 85|Tyler Herro 85|Domantas Sabonis 85|Jarrett Allen 85|Brandon Miller 85|De'Aaron Fox 84|Rudy Gobert 84|Ja Morant 84|Brandon Ingram 84|Josh Giddey 84|Norman Powell 84|Darius Garland 84|Desmond Bane 84|Kon Knueppel 84|Ivica Zubac 84|Mikal Bridges 84|Keyonte George 84|Nickeil Alexander-Walker 83|Derrick White 83|Aaron Gordon 83|Julius Randle 83|CJ McCollum 83|V.J. Edgecombe 83|Alex Sarr 83|DeMar DeRozan 83|Paul George 82|Josh Hart 82|Naz Reid 82|Jrue Holiday 82|Isaiah Hartenstein 82|Ajay Mitchell 82|Dillon Brooks 82|Payton Pritchard 82|Zach LaVine 82|R.J. Barrett 82|Dejounte Murray 82|Donovan Clingan 82|Immanuel Quickley 82|Cason Wallace 81|Matas Buzelis 81|Alex Caruso 81|Dyson Daniels 81|Ayo Dosunmu 81|Shaedon Sharpe 81|Onyeka Okongwu 81|Devin Vassell 81|Tobias Harris 81|Walker Kessler 81`;
const key = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const target = {};
R.split('|').forEach(x => { const i = x.lastIndexOf(' '); target[key(x.slice(0, i))] = +x.slice(i + 1); });
let hit = 0; const changed = [];
function fix(p) {
  const t = target[key(p.name)];
  if (t == null || p.ovr === t) return;
  const before = p.ovr;
  if (p.attrs) P.setOvr(p, t, { keepPot: true }); else p.ovr = t;
  p.ovr = t; hit++; changed.push(p.name + ' ' + before + '>' + t);
}
// the 2026-27 start
let f = 'data/start-2027.js', s = fs.readFileSync(f, 'utf8');
let a = s.indexOf('window.START_LEAGUES[2027] = ') + 'window.START_LEAGUES[2027] = '.length, b = s.lastIndexOf('};\nif (typeof module');
let L = JSON.parse(s.slice(a, b + 1));
L.players.forEach(fix);
fs.writeFileSync(f, s.slice(0, a) + JSON.stringify(L) + s.slice(b + 1));
console.log('start-2027:', hit, 'players set');
// the pool's 2026-27 cards
f = 'data/challenge-pool.js'; s = fs.readFileSync(f, 'utf8');
a = s.indexOf('window.CHALLENGE_POOL = '); const a2 = a + 'window.CHALLENGE_POOL = '.length; b = s.lastIndexOf('};');
const pool = JSON.parse(s.slice(a2, b + 1)); const h0 = hit;
pool.players.filter(p => p.season === 2027).forEach(fix);
pool.players.sort((x, y) => 0);
fs.writeFileSync(f, s.slice(0, a2) + JSON.stringify(pool) + s.slice(b + 1));
console.log('pool 2027:', hit - h0, 'cards set');
console.log(changed.slice(0, 12).join(', '));
