# Interfaces for the first playable version

Plain HTML, CSS and JavaScript, no build step, no frameworks, no external JS libraries. Classic scripts that attach to `window`.

## Data: `data/league2012.js` (built by the pipeline)

```js
window.LEAGUE_2012 = {
  season: 2013,                      // the 2012-13 season
  teams: [ { abbr: "OKC", city: "Oklahoma City", name: "Thunder", conf: "West", div: "Northwest",
             colors: ["#007ac1", "#ef3b24"], logo: "https://...png" } ],   // 30 teams
  players: [ {
    id: "duranke01",                 // Basketball-Reference id, unique
    name: "Kevin Durant", team: "OKC" /* or "FA" */, pos: "SF", age: 24,
    ht: 81 /* inches */, wt: 240, ovr: 94 /* 2K13 scale */, pot: 97,
    nbaId: 201142,                   // NBA.com id for the headshot, or null
    salary: 16669630, contractEnd: 2016,   // dollars this season; last season of the deal (season-ending year)
    injury: null /* or { type: "Torn ACL", games: 82 } */,
    attrs: { close: 0, mid: 0, three: 0, ft: 0, layup: 0, dunk: 0, post: 0, handle: 0, pass: 0,
             oreb: 0, dreb: 0, steal: 0, block: 0, perD: 0, intD: 0, speed: 0, vert: 0, strength: 0,
             stamina: 0, durability: 0, oiq: 0, diq: 0 },   // 25 to 99, 2K-style
    stats: { g: 0, mpg: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgp: 0, tpp: 0, ftp: 0 },  // real 2012-13 (or last season played)
    face: null                       // or an image URL fallback
  } ]
};
```

Headshot URL: `https://cdn.nba.com/headshots/nba/latest/260x190/${nbaId}.png`. When `nbaId` is null or the image fails, draw a generated face (simple SVG silhouette in the team's colors).

## Engine: `js/engine.js` (built separately)

```js
window.ENGINE = {
  // teams: [{ abbr, players: [playerObject...] }], schedule built inside
  newSeason(league) -> season,        // schedule (82 games each), standings, empty stats
  simDays(season, n, rng) -> results, // plays the next n days; updates standings, player season stats, box scores
  simGame(homeTeam, awayTeam, rng) -> { home: { pts, box: [ {id, min, pts, fgm, fga, tpm, tpa, ftm, fta, oreb, dreb, ast, stl, blk, tov, pf} ] }, away: {...}, quarters: [[h,a]...], pbp: [ "string", ... ] },
  playoffs(season) -> bracket          // 16 teams, 4 rounds, best of 7
}
```

## UI: `index.html`, `css/`, `js/ui.js`

2K13-inspired black and gold. Pages (hash routing): home (Play The Association, Continue, soundtrack), team rosters, player card, season (schedule, sim controls, standings, box scores, leaders), playoffs, settings and saves.
