# Interfaces for the full game (multi-season)

Same rules as contract.md: plain JS classic scripts on `window` (also `module.exports` when `typeof module !== "undefined"`, so Node tests can load them), no libraries, no em or en dashes. Every module owns its own files; never edit another module's files. Each module ships a Node test in `tools/test-<module>.js`.

## The league state (one plain-JSON object, saved by the UI)

```js
state = {
  version: 1, year: 2013,                 // season-ending year of the current season
  phase: "preseason" | "regular" | "playoffs" | "draftLottery" | "draft" | "resign" | "freeAgency" | "training",
  userTeam: "OKC", day: 0, rngSeed: 123,
  players: { [id]: Player },              // everyone: NBA, G League, free agents, retired (retired: true), draft prospects (team "DRAFT")
  teams: { [abbr]: Team },
  season: SeasonObject,                   // from ENGINE.newSeason (contract.md)
  history: { seasons: [ { year, champion, finalsMvp, awards: {...}, standings: {...} } ], prior: {...} },
  transactions: [ { year, day, type: "trade"|"sign"|"release"|"draft"|"retire"|"injury"|"option"|"assign", text, ids: [] } ],
  news: [ { year, day, headline, body, ids: [] } ],
  events: [ { type: "tradeOffer"|"contractDecision"|"complaint"|"injury", ... } ],  // pending decisions for the user
  settings: { difficulty: "normal" }
}
```

Player (extends the contract.md player):
```js
{ ...id, name, team, pos, age, ht, wt, ovr, pot, attrs, nbaId, injury,
  contract: { salaries: [ { year: 2013, amount: 16669630 } ], option: null | { year, type: "player"|"team"|"eto" },
              rookie: false, twoWay: false, signedYear: 2010 },
  yearsPro: 5, yearsWithTeam: 5, draft: { year, round, pick, team } | null,
  personality: { loyalty: 0..100, winning: 0..100, money: 0..100, market: 0..100, ego: 0..100 },
  mood: 0..100, stashedUntil: null | year, gleague: false,
  careerStats: [ { year, team, g, ... } ], awards: [ { year, award } ], retired: false, hof: false }
```

Team: `{ abbr, city, name, conf, div, colors, logo, picks: [ { year, round, original: "OKC", protection: null | { top: 10, until: 2016 } } ], coach: coachId, direction: "contend"|"rebuild"|"neutral", strategy: { pace, three, defense, crash }, rotation: [ids] | null, budget: { coaching, facilities, health, scouting }, finances: { revenue, expenses, ticketPrice }, gleagueTeam: "OKC-G" }`

## Module APIs

- `window.CBA` (js/cba.js, data/cap-history.js): `rules(year)` returns `{ cap, tax, apron, minPayroll, maxPct: [25,30,35], minSalary(yearsPro), rookieScale(pick), mle, roomException, bae, twoWay: bool, maxTwoWay, playIn: bool, lotteryOdds: [...], nbaCup: bool, seasonGames }`; `payroll(state, abbr, year)`; `capSpace(state, abbr, year)`; `canSign(state, abbr, playerId, salaries, opts)` returns `{ ok, via: "space"|"mle"|"min"|"bird"|"rookie"|"twoWay", reason }`; `validateTrade(state, trade)` returns `{ ok, reasons: [] }` with era salary matching (2012 CBA: over-cap team may take back 125% + $100,000 of outgoing). Real cap figures for every season 2012-13 through 2026-27, then 4.5% a year growth.
- `window.TRADE` (js/trade.js): `trade = { teams: ["OKC","HOU"], give: { OKC: { players: [ids], picks: [pickRefs] }, HOU: {...} } }`; `value(state, playerId, forAbbr)`, `pickValue(state, pick, forAbbr)`, `evaluate(state, trade)` returns `{ accepts: bool, margin, message }` (AI side), `finder(state, userAbbr, targetAbbr, wantIds)` returns proposals, `aiOffers(state, rng)` returns offers to the user, `aiTrades(state, rng)` (AI to AI deals, a few per season), `execute(state, trade)`. Uses CBA.validateTrade. Values depend on team direction (contenders value now, rebuilders value youth and picks).
- `window.FA` (js/freeagency.js, js/mood.js): `startOffseason(state)` (contracts expire, options decided, qualifying offers for RFAs), `demand(state, playerId)` returns `{ amount, years }`, `offer(state, abbr, playerId, { salaries, option })` returns `{ accepted, message }`, `simDay(state, rng)` (AI signings, offer sheets, matching), `resignWindow(state)`, `release(state, abbr, playerId)`. `MOOD.update(state)` and `MOOD.of(state, playerId)` return `{ score, reasons: [] }` (winning, playing time, money, market, loyalty, coach).
- `window.DRAFT` (js/draft.js): `lottery(state, rng)` (era odds), `order(state, year)`, `aiPick(state, abbr)`, `pick(state, abbr, prospectId)`, `signRookies(state)`; draft classes from `window.DRAFTS` (data/drafts.js); stashed picks get `stashedUntil` and a "Playing overseas" injury until then. From 2027 on, generate fictional classes.
- `window.PROG` (js/progression.js): `offseason(state, rng)` (aging, development toward `window.TARGETS[id][year]` for history players with noise, ratings for others by age curve and potential, retirements near `TARGETS[id].retire`), `inSeason(state, rng)` (small changes each month).
- `window.COACH` (js/coaches.js, data/coaches.js), `window.GLEAGUE` (js/gleague.js, data/gleague.js: 2012-13 D-League with shared affiliations, later one-to-one), `window.AWARDS` (js/awards.js: MVP, DPOY, ROY, 6MOY, MIP, COY, All-NBA, All-Defense, All-Rookie, Finals MVP, All-Star selection), `window.NEWS` (js/news.js: headline generator for trades, signings, injuries, milestones, awards).
- `window.LEAGUE` (js/league.js, the orchestrator, written last): `newLeague(userTeam, opts)`, `advance(state, how)` where how is { days } | "tradeDeadline" | "allStar" | "endRegular" | "endPlayoffs" | "nextPhase"; stops on `state.events`; runs the offseason flow: lottery, draft, re-signing, free agency days, training camp (no development), new season.

## Data files

- data/league2012.js (exists): window.LEAGUE_2012.
- data/drafts.js: `window.DRAFTS = { 2013: [ Player + { draftYear, realPick, arrivalYear, undrafted: bool } ] , ... 2026 }`. Rookie ratings = real rookie-season level, `pot` = real peak (2K scale).
- data/targets.js: `window.TARGETS = { [id]: { 2014: 84, 2015: 86, ..., retire: 2016 } }` for every history player (2012 players and draftees). Real 2K overalls where known (2K16 to 2K26 from game roster snapshots), the stats formula elsewhere.
- data/cap-history.js, data/coaches.js, data/gleague.js, data/history.js (franchise history before 2012: champions by year, retired numbers).
