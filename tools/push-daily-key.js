// Sends the answer key for a run of days (from data/reach/<day>.json) to Supabase by itself, so no SQL has to be pasted.
// It calls the set_daily_key function with the secret in DAILY_KEY_SECRET; the function only adds or replaces rows for days after today.
//   DAILY_KEY_SECRET=... node tools/push-daily-key.js 2026-11-18 60
// Exit code 0 only when every row was accepted.
const fs = require('fs'), https = require('https'), path = require('path');
const URL_ = 'https://feozimahsjhnvlqlkwyh.supabase.co', KEY = 'sb_publishable_IejaVhDl93-NonWwHdeeIA_zBRDGXv9';   // the public (publishable) key, the same one the site uses
const secret = process.env.DAILY_KEY_SECRET, start = process.argv[2], N = +(process.argv[3] || 60);
if (!secret) { console.log('no DAILY_KEY_SECRET set'); process.exit(2); }
if (!/^\d{4}-\d\d-\d\d$/.test(start || '')) { console.log('usage: node tools/push-daily-key.js YYYY-MM-DD [days]'); process.exit(1); }
const rows = [];
for (let i = 0; i < N; i++) {
  const d = new Date(start + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i); const day = d.toISOString().slice(0, 10);
  const f = path.join(__dirname, '..', 'data', 'reach', day + '.json');
  if (!fs.existsSync(f)) continue;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (Array.isArray(j.names) && j.names.length === 10 && typeof j.best === 'number') rows.push({ day, names: j.names, best: Math.round(j.best * 100) / 100 });
}
if (!rows.length) { console.log('no rows to send'); process.exit(1); }
const body = JSON.stringify({ p_secret: secret, p_rows: rows });
const req = https.request(URL_ + '/rest/v1/rpc/set_daily_key', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
  let b = ''; res.on('data', c => b += c); res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) { console.log('sent', rows.length, 'rows, the server stored', b.trim()); process.exit(Number(b.trim()) > 0 ? 0 : 3); }
    console.log('the server said', res.statusCode, b.slice(0, 200)); process.exit(4);
  });
});
req.on('error', e => { console.log('could not reach the server:', e.message); process.exit(5); });
req.end(body);
