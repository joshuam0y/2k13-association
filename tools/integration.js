// End-to-end check with every module that exists: node tools/integration.js [seasons]
// Loads the same files as index.html, plays full seasons and offseasons, and reports problems.
const fs = require("fs");
global.window = global;
const warnings = [];
const origWarn = console.warn;
console.warn = (...a) => { warnings.push(a.join(" ")); };
const files = ["data/league2012.js", "data/drafts.js", "data/targets.js", "data/cap-history.js", "data/coaches.js", "data/gleague.js",
  "data/history.js", "data/personalities.js", "js/engine.js", "js/cba.js", "js/trade.js", "js/freeagency.js", "js/mood.js",
  "js/draft.js", "js/progression.js", "js/coaches.js", "js/gleague.js", "js/awards.js", "js/news.js", "js/league.js"];
const loaded = [];
for (const f of files) if (fs.existsSync(f)) { try { require("../" + f); loaded.push(f); } catch (e) { console.log("LOAD FAIL", f, e.message); } }
console.log("loaded:", loaded.map(f => f.replace(/^(js|data)\//, "")).join(", "));
const L = window.LEAGUE;
const seasons = Number(process.argv[2] || 2);
const t0 = Date.now();
const s = L.newLeague("OKC", { seed: 2024 });
const problems = [];
for (let n = 0; n < seasons; n++) {
  let r, guard = 0;
  do { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); r = L.advance(s, "endPlayoffs"); } while (r.stopped !== "seasonOver" && ++guard < 400);
  const h = s.history.seasons[s.history.seasons.length - 1] || {};
  const recs = Object.entries(s.season.standings).map(([k, v]) => [k, v.w, v.l]).sort((a, b) => b[1] - a[1]);
  console.log(`season ${s.year}: champion ${h.champion}, best ${recs[0]}, worst ${recs[recs.length - 1]}, MVP ${h.awards && h.awards.mvp ? JSON.stringify(h.awards.mvp).slice(0, 60) : "n/a"}`);
  for (let i = 0; i < L.OFFSEASON.length; i++) L.advance(s, "nextPhase");
  const counts = {};
  for (const id in s.players) { const p = s.players[id]; if (!p.retired && s.teams[p.team]) counts[p.team] = (counts[p.team] || 0) + 1; }
  const bad = Object.entries(counts).filter(([, c]) => c < 13 || c > 17);
  if (bad.length) problems.push(`after ${s.year - 1} offseason, roster sizes off: ${bad.join(" ")}`);
}
console.log("time", ((Date.now() - t0) / 1000).toFixed(1), "s; save", Math.round(JSON.stringify(s).length / 1024), "KB; news", s.news.length, "; transactions", s.transactions.length);
const uniq = [...new Set(warnings.map(w => w.replace(/\d+/g, "#")))];
console.log("module warnings:", uniq.length ? uniq.slice(0, 15) : "none");
console.log("problems:", problems.length ? problems : "none");
console.warn = origWarn;
