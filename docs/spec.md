# 2K13 Association: design spec

A public website that recreates the franchise simulation of NBA 2K13's Association mode: real 2012-13 players, 2K13 ratings, real future draft classes and history, and a full league sim. No on-court gameplay; you run a franchise and simulate.

Decided with the owner on 2026-10-22. Anything marked "approximate" is a known limit of the public data.

## 1. Product

- Name: **2K13 Association**. Public repo `2k13-association`, hosted on GitHub Pages.
- Look: inspired by 2K13's menus. Black and gold, bold condensed type, tile menus, player cards with headshots. No copying of 2K's logos or artwork. Real 2012-13 NBA team logos, with later logos on rebrand dates.
- Laptop first, works on a phone.
- Soundtrack: the official 2K13 soundtrack (24 songs, in order) through an embedded YouTube playlist. Starts on the first click and keeps playing; a small bar with skip and mute.
- Hub pages: team rosters, player cards, draft classes 2013 to 2026, soundtrack and how to play.
- Saves: several save slots in the browser, autosave, export and import of a save file.
- One user-controlled team.

## 2. Starting state

- Rosters: 2K13 launch rosters (early October 2012, James Harden still on the Thunder), plus the real unsigned free agents at that date.
- Ratings: 2K13 launch overalls (Sept 2012 official list). Overalls are shown on the 2K scale everywhere, in the hub and in the game.
- Real injuries at the start of 2012-13 (for example Derrick Rose's ACL).
- Real 2012-13 contracts (approximate for some option years and minimum deals).
- Real 2012-13 head coaches, rated from their real records and reputation.
- Real 2012-13 D-League (16 teams with shared affiliations), changing as it really did, into today's one-to-one G League.
- Real franchise history before 2012: champions, awards, retired jerseys.
- Difficulty Normal. Game and sim settings at defaults.

## 3. Players and ratings

- About 35 attributes per player in a 2K13-style set: shot close, mid-range, three-point, free throw, layup, dunk, post moves, ball handling, passing, offensive and defensive rebounding, steal, block, on-ball defense, lateral quickness, speed, vertical, strength, stamina, durability, offensive and defensive IQ, and more. Estimated from real stats and physical data, then scaled so each player's overall equals his 2K13 overall.
- Potential is an exact 2K-style number, from each player's real career peak.
- Careers follow history closely: every player, 2012 veterans included, has a year-by-year rating target built from his real seasons through 2025-26. Development tracks that target with some noise, so stars rise and fall around their real years. Retirements happen around the real retirement year, unless the sim has made a player much better or worse than he really was.
- Progression: the main change each offseason, small in-season changes for streaks, slumps and injuries.
- No training camp development: camps can't raise ratings or potential. Training camp is only a preseason step on the calendar. (Possible stage 4 add-on if wanted later.)
- Personalities: real traits for known players (loyalty, winning, market, money, ego); random for others.

## 4. Draft and new players

- Real draft classes 2013 to 2026. Draft-day level = the player's real rookie level; potential = his real peak (Giannis raw with very high potential; Anthony Bennett low potential).
- Draft-and-stash players: drafted normally, then marked "playing overseas" until the season they really arrived. The team holds his rights; his contract starts when he arrives.
- Notable real undrafted players join as undrafted free agents after their real draft.
- Real players only through the 2026 class; fictional prospects only from the 2027 draft on.
- Lottery: drawn randomly, using the real odds of each era (the 2019 reform included).

## 5. League rules over time

Follow real history: the 2012 CBA and its cap and tax numbers, the real cap each season through 2026-27 (including the 2016 jump), then realistic growth. Two-way contracts from 2017-18, the play-in from 2020-21, the NBA Cup from 2023-24, All-Star format changes on their real dates, and the real shortened seasons (2019-20 stopped in March and finished in the bubble; 2020-21 was 72 games). Team rebrands on their real dates (Pelicans 2013, Hornets 2014). Real schedules through 2025-26, then generated schedules.

## 6. Business rules

- Trades: real CBA salary matching for the era (125% plus $100K in 2012), future first and second round picks with protections, the trade deadline, trade finder.
- Contracts: rookie scale, Bird rights, max by years of service, the supermax from 2017, minimums by experience, mid-level exception and other exceptions, player and team options, early termination options, restricted free agency with offer sheets and matching, two-way contracts.
- G League: assignments and recalls, its own games and stats.
- Coaching staff: head coach and assistants with ratings that affect development, game decisions and morale; hire and fire.
- AI teams pick a direction (contend or rebuild) and switch when their situation changes. They value players by age, contract, fit and the team's direction.

## 7. Simulation

- Possession-by-possession game engine using ratings, fatigue, rotations, coaching and team strategy.
- Your controls: starters, bench order, minutes, pace, three-point emphasis, defensive style, offensive rebounding.
- Watch any game live (play-by-play ticker, clock, box score, adjustable speed) or sim it.
- Sim day, week or month, or to a date, the trade deadline, All-Star, end of season or end of playoffs. Full offseason flow: lottery, draft, re-signing, free agency days, training camp.
- The sim stops for trade offers, contract decisions, player complaints and injuries to your players.
- Injuries: real injury types and recovery times, with a small chance of lasting rating loss, affected by durability and age.
- Player mood and morale, owner finances (tickets, budgets, revenue), expansion and relocation, All-Star Game, Hall of Fame, jersey retirement, draft scouting.
- Awards: MVP, DPOY, ROY, 6MOY, MIP, Coach of the Year, All-NBA, All-Defense, All-Rookie, Finals MVP. Career stats, records, league leaders, a transaction log and news feed.
- Extras: commissioner mode (edit players and contracts, force trades, change rules), fantasy draft start.

## 8. Architecture

- Static site, no server. The simulation runs in a Web Worker so the screens stay responsive; league state saved in IndexedDB.
- Real data is collected once by Python scripts in `pipeline/` from public sources (mainly Basketball-Reference, with credit and polite request rates; the 2K13 overall list from The Real 2K Insider; NBA.com player IDs for headshots) and shipped as JSON in `data/`.
- Modules, each testable on its own: data loader, ratings and progression, game engine, schedule and calendar, CBA and contracts, trades and AI GM, draft and lottery, injuries, G League and two-ways, coaches, awards and history, news, saves, UI.

## 9. Testing

- Sim calibration against real 2012-13 league averages (points, pace, field goal, three-point and free throw rates, rebounds, turnovers), and stars near their real stat lines.
- An independent checker for cap, contract, salary matching and option math, written separately from the engine (like the Antoni site's verify.js).
- Multi-season soak test: 15 simmed seasons with no crashes, a valid roster count for every team, and the history-following players peaking near their real years.

## 10. Stages

Each stage goes live when it passes its tests.
1. Data, hub, rosters, player cards, draft class browser, soundtrack.
2. One full season: schedule, game engine, box scores, standings, playoffs, saves.
3. Trades, contracts, free agency, the CBA rules.
4. Draft, progression, retirements, multi-season play, rule history.
5. G League, two-ways, coaches, mood, finances, awards, history, commissioner mode, fantasy draft, watch live.

Several weeks of work over many sessions. Stage 1 first.
