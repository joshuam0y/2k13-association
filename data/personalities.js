/* Real personality tendencies (0 to 100) for well-known players of the 2012 to 2026 era, keyed by
   Basketball-Reference id. loyalty: stays with his team; winning: chases contenders and rings;
   money: follows the biggest offer; market: wants a big city or a specific home market; ego: wants
   the ball, the starring role and control. Built from public free agency and trade history.
   Everyone else gets a seeded random personality when a league starts (MOOD.initPersonalities). */
(typeof window !== 'undefined' ? window : global).PERSONALITIES = {
  // One-franchise icons
  duncati01: { loyalty: 99, winning: 90, money: 15, market: 5, ego: 15 },   // 19 seasons in San Antonio, took pay cuts
  nowitdi01: { loyalty: 99, winning: 80, money: 15, market: 10, ego: 20 },  // 21 seasons in Dallas, took discounts
  ginobma01: { loyalty: 99, winning: 85, money: 15, market: 10, ego: 20 },
  parketo01: { loyalty: 90, winning: 85, money: 45, market: 30, ego: 45 },
  bryanko01: { loyalty: 97, winning: 90, money: 80, market: 75, ego: 99 },  // 20 years a Laker, big 2013 extension
  curryst01: { loyalty: 96, winning: 75, money: 45, market: 30, ego: 25 },
  thompkl01: { loyalty: 85, winning: 75, money: 70, market: 40, ego: 40 },
  greendr01: { loyalty: 95, winning: 85, money: 65, market: 35, ego: 85 },
  lillada01: { loyalty: 92, winning: 55, money: 60, market: 15, ego: 55 },  // stayed in Portland for 11 years
  antetgi01: { loyalty: 95, winning: 88, money: 60, market: 10, ego: 40 },  // supermax with Milwaukee, title in 2021
  jokicni01: { loyalty: 92, winning: 65, money: 40, market: 5, ego: 10 },
  embiijo01: { loyalty: 88, winning: 70, money: 65, market: 30, ego: 75 },
  wadedw01: { loyalty: 82, winning: 80, money: 60, market: 70, ego: 70 },   // left Miami in 2016 over money, came back
  westbru01: { loyalty: 80, winning: 55, money: 65, market: 30, ego: 90 },  // re-signed in OKC after Durant left
  derozde01: { loyalty: 95, winning: 55, money: 65, market: 40, ego: 45 },  // "I am Toronto"
  conlemi01: { loyalty: 90, winning: 60, money: 65, market: 20, ego: 25 },
  gasolma01: { loyalty: 88, winning: 70, money: 55, market: 20, ego: 40 },
  randoza01: { loyalty: 85, winning: 55, money: 70, market: 20, ego: 55 },
  middlkh01: { loyalty: 90, winning: 70, money: 60, market: 20, ego: 30 },
  bealbr01: { loyalty: 88, winning: 45, money: 85, market: 30, ego: 50 },   // stayed in Washington on a no-trade supermax
  bookede01: { loyalty: 90, winning: 65, money: 70, market: 30, ego: 65 },
  tatumja01: { loyalty: 85, winning: 75, money: 70, market: 50, ego: 55 },
  doncilu01: { loyalty: 82, winning: 70, money: 65, market: 40, ego: 75 },
  gilgesh01: { loyalty: 90, winning: 75, money: 60, market: 15, ego: 40 },
  edwaran01: { loyalty: 85, winning: 75, money: 65, market: 40, ego: 70 },
  wembavi01: { loyalty: 85, winning: 75, money: 50, market: 20, ego: 40 },
  noahjo01: { loyalty: 85, winning: 75, money: 55, market: 50, ego: 60 },
  walljo01: { loyalty: 80, winning: 55, money: 75, market: 30, ego: 70 },
  rosede01: { loyalty: 85, winning: 60, money: 70, market: 50, ego: 40 },
  piercpa01: { loyalty: 85, winning: 80, money: 50, market: 50, ego: 70 },
  hibbero01: { loyalty: 60, winning: 55, money: 70, market: 30, ego: 50 },

  // Winning and control
  jamesle01: { loyalty: 35, winning: 95, money: 60, market: 70, ego: 90 },  // Decision, return to Cleveland, Lakers, short deals
  duranke01: { loyalty: 30, winning: 92, money: 55, market: 45, ego: 70 },  // chose Golden State in 2016 to win
  leonaka01: { loyalty: 12, winning: 70, money: 70, market: 70, ego: 75 },  // forced out of San Antonio, went home to LA
  georgpa01: { loyalty: 25, winning: 70, money: 75, market: 75, ego: 65 },  // trade requests, LA home market
  davisan02: { loyalty: 25, winning: 80, money: 65, market: 85, ego: 65 },  // forced a trade to the Lakers
  irvinky01: { loyalty: 10, winning: 60, money: 55, market: 70, ego: 92 },  // left LeBron, left Boston, forced out of Brooklyn
  hardeja01: { loyalty: 15, winning: 78, money: 75, market: 50, ego: 88 },  // forced exits from Houston, Brooklyn, Philadelphia
  paulch01: { loyalty: 35, winning: 88, money: 70, market: 60, ego: 70 },   // forced trade in 2011, many moves for a ring
  butleji01: { loyalty: 20, winning: 85, money: 75, market: 50, ego: 88 },
  couside01: { loyalty: 65, winning: 80, money: 55, market: 40, ego: 92 },  // took a one-year deal with the champion Warriors
  simmobe01: { loyalty: 15, winning: 50, money: 70, market: 60, ego: 75 },
  mitchdo01: { loyalty: 45, winning: 75, money: 70, market: 60, ego: 60 },
  brunsja01: { loyalty: 40, winning: 70, money: 70, market: 80, ego: 40 },  // left Dallas for New York
  howardw01: { loyalty: 12, winning: 65, money: 70, market: 70, ego: 85 },  // forced out of Orlando, left LA after a year
  loveke01: { loyalty: 40, winning: 85, money: 65, market: 60, ego: 50 },
  aldrila01: { loyalty: 30, winning: 75, money: 65, market: 55, ego: 60 },
  boshch01: { loyalty: 70, winning: 80, money: 75, market: 70, ego: 45 },
  willide01: { loyalty: 40, winning: 55, money: 80, market: 70, ego: 70 },
  rondora01: { loyalty: 50, winning: 70, money: 60, market: 50, ego: 85 },
  griffbl01: { loyalty: 60, winning: 70, money: 70, market: 70, ego: 60 },
  haywago01: { loyalty: 35, winning: 70, money: 60, market: 50, ego: 40 },
  horfoal01: { loyalty: 50, winning: 80, money: 65, market: 50, ego: 30 },
  lowryky01: { loyalty: 70, winning: 75, money: 65, market: 45, ego: 60 },
  walkeke02: { loyalty: 70, winning: 65, money: 70, market: 50, ego: 40 },
  holidjr01: { loyalty: 55, winning: 85, money: 60, market: 30, ego: 20 },

  // Money and market first
  anthoca01: { loyalty: 40, winning: 50, money: 88, market: 95, ego: 82 },  // forced his way to New York, then max money
  smithjr01: { loyalty: 50, winning: 50, money: 70, market: 65, ego: 70 },
  thomais02: { loyalty: 55, winning: 60, money: 85, market: 50, ego: 80 },
  smithjo03: { loyalty: 40, winning: 55, money: 85, market: 50, ego: 70 },
  johnsjo02: { loyalty: 50, winning: 60, money: 85, market: 40, ego: 50 },
  ellismo01: { loyalty: 40, winning: 50, money: 80, market: 40, ego: 70 },
  gayru01: { loyalty: 40, winning: 50, money: 85, market: 40, ego: 55 },
  ibakase01: { loyalty: 55, winning: 65, money: 75, market: 40, ego: 50 },
  bynuman01: { loyalty: 35, winning: 50, money: 80, market: 60, ego: 70 },

  // Ring chasers late in their careers
  allenra02: { loyalty: 20, winning: 95, money: 30, market: 50, ego: 50 },  // left Boston for Miami in 2012
  westda01: { loyalty: 40, winning: 98, money: 10, market: 30, ego: 30 },   // left $12M on the table for the Spurs
  garneke01: { loyalty: 85, winning: 88, money: 45, market: 30, ego: 75 },
  kiddja01: { loyalty: 30, winning: 85, money: 45, market: 70, ego: 50 },
  nashst01: { loyalty: 40, winning: 85, money: 50, market: 60, ego: 30 },
  gasolpa01: { loyalty: 50, winning: 85, money: 40, market: 60, ego: 40 },
  battish01: { loyalty: 40, winning: 90, money: 40, market: 50, ego: 25 },
  korveky01: { loyalty: 45, winning: 85, money: 45, market: 40, ego: 20 },
  iguodan01: { loyalty: 40, winning: 88, money: 55, market: 50, ego: 30 },
  cartevi01: { loyalty: 40, winning: 60, money: 30, market: 30, ego: 30 },  // played 22 seasons anywhere he could
  chandty01: { loyalty: 45, winning: 80, money: 60, market: 50, ego: 40 },
  artesro01: { loyalty: 55, winning: 75, money: 45, market: 60, ego: 70 }
};
if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : global).PERSONALITIES;
