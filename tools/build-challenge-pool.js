// Builds data/challenge-pool.js, the all-time Draft Challenge pool: the best veterans of every finished season
// from 1946-47 to 2025-26 (no rookies; 20+ games and 12+ minutes when the season's line is known), with that
// season's rating, attributes, style of play and per-game line. node tools/build-challenge-pool.js
// 2003-04 on: the best 48 of each season. Before that PER_TEAM per team in the league that season (10 from an
// 8-team 1950s league), so the small early leagues do not crowd the pool and the file stays small.
const fs = require("fs");
global.window = global;
console.warn = () => {};
["data/league2012.js", "data/pos-history.js", "data/career-prior.js", "data/tendencies.js", "js/engine.js", "js/challenge.js"].forEach(f => require("../" + f));
const C = window.CHALLENGE, E = window.ENGINE, PER_TEAM = 1.3;
const out = { teams: {}, players: [] };
C.SEASONS.forEach(s => {
  if (s.year >= 2027) return;
  if (s.file) require("../" + s.file);
  const d = C.seasonData(s.year);
  if (!d) { console.log("no data", s.year); return; }
  out.teams[s.year] = d.teams.map(t => ({ abbr: t.abbr, city: t.city, name: t.name, colors: t.colors, logo: t.logo, logoNoRef: t.logoNoRef || undefined }));
  const per = s.year >= 2004 ? 48 : Math.round(PER_TEAM * d.teams.length);
  const pool = d.players.filter(p => !p.rookie && !(p.stats && (p.stats.g < 20 || p.stats.mpg < 12))).slice(0, per);
  pool.forEach(p => {
    const q = JSON.parse(JSON.stringify(p));
    if (!q.tend) {
      const t = JSON.parse(JSON.stringify(E.tendencyOf(p))), dr = E.defRates(p);
      t.blk = Math.round(dr.blk * 100) / 10; t.stl = Math.round(dr.stl * 100) / 10;
      delete t.generated;
      q.tend = t;
    }
    delete q.rookie;
    out.players.push(q);
  });
  console.log(s.label, pool.length, pool.slice(0, 3).map(p => p.name + " " + p.ovr).join(", "));
});
const head = "/* 2K13 Association: the all-time Draft Challenge pool (js/challenge.js). The best veterans of every season\n" +
  "   from 1946-47 to 2025-26 by that season's rating (48 a season from 2003-04, " + PER_TEAM + " per team before), with attributes,\n" +
  "   style of play and real per-game line.\n" +
  "   Built by tools/build-challenge-pool.js from data/era-YYYY.js, data/league2012.js and data/start-YYYY.js. */\n";
fs.writeFileSync("data/challenge-pool.js", head + "window.CHALLENGE_POOL = " + JSON.stringify(out) + ";\n");
console.log("players", out.players.length, "size", Math.round(fs.statSync("data/challenge-pool.js").size / 1024) + " KB");
