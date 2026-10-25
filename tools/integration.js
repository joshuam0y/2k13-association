// End-to-end check with every module that exists: node tools/integration.js [seasons]
// Loads the same files as index.html, plays full seasons and offseasons, and reports problems.
const fs = require("fs");
global.window = global;
const warnings = [];
const origWarn = console.warn;
console.warn = (...a) => { warnings.push(a.join(" ")); };
const files = ["data/league2012.js", "data/drafts.js", "data/targets.js", "data/cap-history.js", "data/coaches.js", "data/coach-history.js", "data/gleague.js",
  "data/history.js", "data/personalities.js", "data/logos.js", "data/world-events.js", "data/career-prior.js", "data/picks-2012.js", "data/awards-prior.js", "data/schedules.js", "js/engine.js", "js/cba.js", "js/trade.js", "js/freeagency.js", "js/mood.js",
  "js/draft.js", "js/draft-gen.js", "js/progression.js", "js/coaches.js", "js/gleague.js", "js/awards.js", "js/news.js", "js/league.js", "js/allstar.js", "js/positions.js"];
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
  // The offseason the way the UI runs it: the draft stops on each of the user's picks (the user
  // takes the best player on his board), re-signing goes through FA.autoResign, then progression.
  let userStops = 0, steps = 0, sawReport = false;
  while (s.phase !== "regular" && steps++ < 120) {
    s.events.forEach(e => (e.resolved = true)); L.clearResolved(s);
    const r = L.advance(s, "nextPhase");
    if (r && r.stopped === "userPick") {
      userStops++;
      const D = window.DRAFT, slot = D.current(s);
      if (!slot || slot.team !== s.userTeam) { problems.push(`draft stopped for the user but pick ${slot && slot.overall} is ${slot && slot.team}'s`); break; }
      const pool = Object.values(s.players).filter(p => p.team === "DRAFT" && +p.draftYear === s.year && !p.undrafted);
      pool.sort((a, b) => b.ovr - a.ovr);
      const res = D.pick(s, s.userTeam, pool[0].id);
      if (!res.ok) { problems.push("user pick failed: " + res.reason); break; }
    }
    if (s.phase === "training" && s.progressReport && s.progressReport.year === s.year + 1) sawReport = true;
  }
  if (s.phase !== "regular") problems.push(`offseason after ${s.year - 1} did not finish (phase ${s.phase})`);
  if (!sawReport) problems.push(`no progression report before the ${s.year} season`);
  const userPicks = (s.teams[s.userTeam].picks || []).length;
  console.log(`  offseason: ${steps} steps, ${userStops} user draft stops, progression report ${sawReport ? "yes" : "no"}, user picks owned ${userPicks}`);
  // roster limits for the season that just started: 13 to 15 standard, two-way slots from 2017-18; stashed players never count
  const rr = L.rosterRules(s.year), bad = [];
  for (const abbr in s.teams) {
    const ro = L.rosterOf(s, abbr, s.year);
    if (ro.std.length < rr.min || ro.std.length > rr.max) bad.push(abbr + " " + ro.std.length);
    if (ro.two.length > (rr.twoWay ? rr.slots : 0)) bad.push(abbr + " two-way " + ro.two.length);
  }
  if (bad.length) problems.push(`after ${s.year - 1} offseason, roster sizes off: ${bad.join(", ")}`);
  // real retirements: nobody plays past his real last season (TARGETS retire = first season not played)
  const T = window.TARGETS || {};
  // (players under 31 at their real exit may keep playing if a team signs them)
  const late = Object.values(s.players).filter(p => !p.retired && p.team !== "DRAFT" && T[p.id] && T[p.id].retire != null && T[p.id].retire + 1 < s.year
    && (p.age || 0) - (s.year - T[p.id].retire) >= 31);
  if (late.length) problems.push(`${late.length} players still active two or more seasons past their real retirement: ${late.slice(0, 5).map(p => p.name).join(", ")}`);
  const lb = s.players.jamesle01, lbT = window.PROG && window.PROG.targetFor ? window.PROG.targetFor("jamesle01", s.year) : null;
  // history as a guide with variety: LeBron moves around his real arc but stays a star
  if (lb && !lb.retired && lbT != null && (lb.ovr < Math.min(90, lbT - 5) || lb.ovr > lbT + 8)) problems.push(`LeBron ${lb.ovr} vs real ${lbT} in ${s.year}`);
}
console.log("time", ((Date.now() - t0) / 1000).toFixed(1), "s; save", Math.round(JSON.stringify(s).length / 1024), "KB; news", s.news.length, "; transactions", s.transactions.length);
const uniq = [...new Set(warnings.map(w => w.replace(/\d+/g, "#")))];
console.log("module warnings:", uniq.length ? uniq.slice(0, 15) : "none");
console.log("problems:", problems.length ? problems : "none");
console.warn = origWarn;
