/*
 * 2K13 Association: real NBA salary cap history, 2012-13 through 2026-27.
 * Keys are season-ending years (2013 = the 2012-13 season). Seasons after 2027 are
 * projected by js/cba.js at 4.5% a year from the 2026-27 figures.
 *
 * Sources (checked 2026-10-22):
 *  - NBA.com / pr.nba.com yearly salary cap releases ("NBA Salary Cap for 20xx-yy season set at ..."):
 *    cap, tax level, minimum team salary, non-taxpayer, taxpayer and room mid-level exceptions.
 *    2012-13 https://pr.nba.com/nba-salary-cap-2012-13-season
 *    2013-14 https://pr.nba.com/nba-salary-cap-2013-14-season
 *    2014-15 https://pr.nba.com/nba-salary-cap-2014-15-season
 *    2015-16 https://pr.nba.com/nba-salary-cap-2015-16-season
 *    2016-17 https://pr.nba.com/nba-salary-cap-2016-17-season
 *    2017-18 https://pr.nba.com/nba-salary-cap-2017-18-season
 *    2018-19 https://pr.nba.com/nba-salary-cap-2018-19-season
 *    2019-20 https://pr.nba.com/nba-salary-cap-for-2019-20-season-set-at-109-140-million
 *    2023-24 https://pr.nba.com/nba-salary-cap-for-2023-24-season-set-at-136-021-million
 *    2025-26 https://pr.nba.com/nba-salary-cap-2025-26-season
 *    2026-27 https://pr.nba.com/2026-27-salary-cap/ (cap 164.961M, tax 200.428M, aprons 209.015M / 221.686M)
 *  - Larry Coon's NBA Salary Cap FAQ, http://www.cbafaq.com/salarycap.htm (2011 CBA and 2017 CBA
 *    versions): minimum salary tables 2011-12 to 2016-17 and 2017-18, maximum salaries 2011-12 to
 *    2016-17 (the 2011 CBA max was based on a separate BRI figure, so it is not exactly 25/30/35% of
 *    the cap), bi-annual exception 2011-12 to 2016-17 and 2017-18, apron = tax + $4M (2011 CBA) and
 *    tax + $6M (2017 CBA, then indexed), trade salary matching bands.
 *  - Larry Coon, "Scale Salary Amounts for First Round Draft Picks", http://www.cbafaq.com/scale2011.htm
 *    (2012-13 rookie scale, all 30 picks).
 *  - Hoops Rumors: "Salary Cap, Tax Line Set For 20xx/yy NBA Season" and "Values Of 20xx/yy Mid-Level,
 *    Bi-Annual Exceptions" (2021-22 through 2025-26 aprons, MLEs, BAE), "Salary-Matching Rules For
 *    Trades During 2023/24 Season" (2023 CBA trade rules).
 *    https://hoopsrumors.com/2021/08/salary-cap-tax-line-set-for-2021-22-nba-season.html
 *    https://hoopsrumors.com/2022/07/values-of-2022-23-mid-level-bi-annual-exceptions.html
 *    https://hoopsrumors.com/2024/06/salary-cap-tax-line-set-for-2024-25-nba-season.html
 *    https://hoopsrumors.com/2024/06/values-of-2024-25-mid-level-bi-annual-exceptions.html
 *    https://hoopsrumors.com/2023/09/salary-matching-rules-for-trades-during-2023-24-season.html
 *  - Yardbarker / Hoops Rumors "NBA Minimum Salaries For 2026/27" and "Values Of 2026/27 Mid-Level,
 *    Bi-Annual Exceptions" (2026-27 minimums 1,357,763 / 3,876,529 and BAE 5,477,000).
 *
 * Notes:
 *  - From 2017-18 on, minimums, BAE and the max are indexed to the cap, so later seasons follow the cap
 *    change exactly; the stored figures are the real published ones.
 *  - minScale is the full 0..10+ years-of-service minimum table where the source gives it; for other
 *    seasons js/cba.js fills the middle steps from the 2017-18 table ratios (same shape every CBA) and
 *    keeps the real 0 and 10+ figures stored here.
 *  - maxSalary is stored only for 2011 CBA seasons (2013 to 2017). From 2017-18 the max is exactly
 *    25 / 30 / 35% of the cap.
 *  - The 2012-13 tax line, apron and exceptions were unchanged from 2011-12 (lockout season).
 */
(function (root) {
  var CAP_HISTORY = {
    growthAfter: 0.045,           // projected yearly growth after the last real season
    lastRealYear: 2027,

    // Real figures by season-ending year. Dollars.
    seasons: {
      2013: { cap: 58044000, tax: 70307000, apron: 74307000, apron2: null, minPayroll: 49337000,
              mle: 5000000, taxMle: 3090000, roomException: 2575000, bae: 1957000,
              minSalary0: 473604, minSalary10: 1352181,
              minScale: [473604, 762195, 854389, 885120, 915852, 992680, 1069509, 1146337, 1223166, 1229255, 1352181],
              maxSalary: [13668750, 16402500, 19136250] },
      2014: { cap: 58679000, tax: 71748000, apron: 75748000, apron2: null, minPayroll: 52811000,
              mle: 5150000, taxMle: 3183000, roomException: 2652000, bae: 2016000,
              minSalary0: 490180, minSalary10: 1399507,
              minScale: [490180, 788872, 884293, 916099, 947907, 1027424, 1106941, 1186459, 1265977, 1272279, 1399507],
              maxSalary: [13701250, 16441500, 19181750] },
      2015: { cap: 63065000, tax: 76829000, apron: 80829000, apron2: null, minPayroll: 56759000,
              mle: 5305000, taxMle: 3278000, roomException: 2732000, bae: 2077000,
              minSalary0: 507336, minSalary10: 1448490,
              minScale: [507336, 816482, 915243, 948163, 981084, 1063384, 1145685, 1227985, 1310286, 1316809, 1448490],
              maxSalary: [14746000, 17695200, 20644400] },
      2016: { cap: 70000000, tax: 84740000, apron: 88740000, apron2: null, minPayroll: 63000000,
              mle: 5464000, taxMle: 3376000, roomException: 2814000, bae: 2139000,
              minSalary0: 525093, minSalary10: 1499187,
              minScale: [525093, 845059, 947276, 981348, 1015421, 1100602, 1185784, 1270964, 1356146, 1362897, 1499187],
              maxSalary: [16407500, 19689000, 22970500] },
      2017: { cap: 94143000, tax: 113287000, apron: 117287000, apron2: null, minPayroll: 84729000,
              mle: 5628000, taxMle: 3477000, roomException: 2898000, bae: 2203000,
              minSalary0: 543471, minSalary10: 1551659,
              minScale: [543471, 874636, 980431, 1015696, 1050961, 1139123, 1227286, 1315448, 1403611, 1410598, 1551659],
              maxSalary: [22116750, 26540100, 30963450] },
      // 2017 CBA starts (two-way contracts, supermax, apron = tax + $6M)
      2018: { cap: 99093000, tax: 119266000, apron: 125266000, apron2: null, minPayroll: 89184000,
              mle: 8406000, taxMle: 5192000, roomException: 4328000, bae: 3290000,
              minSalary0: 815615, minSalary10: 2328652,
              minScale: [815615, 1312611, 1471382, 1524305, 1577230, 1709538, 1841849, 1974159, 2106470, 2116955, 2328652] },
      2019: { cap: 101869000, tax: 123733000, apron: 129817000, apron2: null, minPayroll: 91682000,
              mle: 8641000, taxMle: 5337000, roomException: 4449000, bae: 3382000,
              minSalary0: 838464, minSalary10: 2393887 },
      2020: { cap: 109140000, tax: 132627000, apron: 138928000, apron2: null, minPayroll: 98226000,
              mle: 9258000, taxMle: 5718000, roomException: 4767000, bae: 3619000,
              minSalary0: 898310, minSalary10: 2564753 },
      // 2020-21: cap held flat because of the pandemic
      2021: { cap: 109140000, tax: 132627000, apron: 138928000, apron2: null, minPayroll: 98226000,
              mle: 9258000, taxMle: 5718000, roomException: 4767000, bae: 3623000,
              minSalary0: 898310, minSalary10: 2564753 },
      2022: { cap: 112414000, tax: 136606000, apron: 143002000, apron2: null, minPayroll: 101173000,
              mle: 9536000, taxMle: 5890000, roomException: 4910000, bae: 3732000,
              minSalary0: 925258, minSalary10: 2641691 },
      2023: { cap: 123655000, tax: 150267000, apron: 156983000, apron2: null, minPayroll: 111290000,
              mle: 10490000, taxMle: 6479000, roomException: 5401000, bae: 4105000,
              minSalary0: 1017781, minSalary10: 2905851 },
      // 2023 CBA starts (first and second apron, NBA Cup, three two-way slots)
      2024: { cap: 136021000, tax: 165294000, apron: 172346000, apron2: 182794000, minPayroll: 122418000,
              mle: 12405000, taxMle: 5000000, roomException: 7723000, bae: 4516000,
              minSalary0: 1119563, minSalary10: 3196448 },
      2025: { cap: 140588000, tax: 170814000, apron: 178132000, apron2: 188931000, minPayroll: 126529000,
              mle: 12822000, taxMle: 5168000, roomException: 7983000, bae: 4668000,
              minSalary0: 1157153, minSalary10: 3303771 },
      2026: { cap: 154647000, tax: 187895000, apron: 195945000, apron2: 207824000, minPayroll: 139182000,
              mle: 14104000, taxMle: 5685000, roomException: 8781000, bae: 5134000,
              minSalary0: 1272870, minSalary10: 3634153 },
      2027: { cap: 164961000, tax: 200428000, apron: 209015000, apron2: 221686000, minPayroll: 148465000,
              mle: 15044000, taxMle: 6064000, roomException: 9366000, bae: 5477000,
              minSalary0: 1357763, minSalary10: 3876529 }
    },

    // Shape of the minimum salary table (years of service 0..10+), from the 2017-18 table.
    // Every CBA since 2011 uses the same proportions.
    minScaleShape: [815615, 1312611, 1471382, 1524305, 1577230, 1709538, 1841849, 1974159, 2106470, 2116955, 2328652],

    // 2012-13 first round rookie scale (100% figures): [year 1, year 2, year 3 (team option),
    // year 4 raise over year 3 (team option), qualifying offer raise over year 4]. Index 0 = pick 1.
    rookieScale2013: [
      [4286900, 4479800, 4672700, 0.261, 0.300], [3835600, 4008200, 4180800, 0.262, 0.305],
      [3444400, 3599400, 3754400, 0.264, 0.312], [3105500, 3245200, 3385000, 0.265, 0.319],
      [2812200, 2938700, 3065300, 0.267, 0.326], [2554200, 2669100, 2784100, 0.268, 0.334],
      [2331700, 2436600, 2541600, 0.270, 0.341], [2136100, 2232200, 2328300, 0.272, 0.348],
      [1963600, 2052000, 2140300, 0.274, 0.355], [1865300, 1949200, 2033200, 0.275, 0.362],
      [1772100, 1851800, 1931600, 0.327, 0.369], [1683500, 1759300, 1835000, 0.378, 0.376],
      [1599300, 1671300, 1743200, 0.429, 0.383], [1519400, 1587800, 1656100, 0.481, 0.391],
      [1443300, 1508200, 1573200, 0.533, 0.398], [1371200, 1432900, 1494600, 0.534, 0.405],
      [1302600, 1361200, 1419800, 0.536, 0.412], [1237500, 1293200, 1348900, 0.538, 0.419],
      [1181800, 1235000, 1288200, 0.540, 0.426], [1134500, 1185600, 1236600, 0.542, 0.433],
      [1089100, 1138100, 1187100, 0.593, 0.441], [1045600, 1092700, 1139700, 0.645, 0.448],
      [1003800, 1049000, 1094100, 0.697, 0.455], [963600, 1007000, 1050300, 0.749, 0.462],
      [925100, 966700, 1008400, 0.801, 0.469], [894400, 934600, 974900, 0.803, 0.476],
      [868600, 907700, 946800, 0.804, 0.483], [863300, 902100, 941000, 0.805, 0.490],
      [857000, 895600, 934100, 0.805, 0.500], [850800, 889100, 927400, 0.805, 0.500]
    ],

    // Draft lottery odds for the #1 pick, worst record first (percent).
    lotteryOdds: {
      // 1994 to 2018 system: 250, 199, 156, 119 ... chances out of 1000, top 3 picks drawn.
      pre2019: [25, 19.9, 15.6, 11.9, 8.8, 6.3, 4.3, 2.8, 1.7, 1.1, 0.8, 0.7, 0.6, 0.5],
      // 2019 reform: flattened odds, top 4 picks drawn.
      from2019: [14, 14, 14, 12.5, 10.5, 9, 7.5, 6, 4.5, 3, 2, 1.5, 1, 0.5]
    },

    // Two-way contract pay (approximate before 2020-21: G League rate; from 2020-21 half the rookie minimum).
    twoWaySalary: { 2018: 77250, 2019: 77250, 2020: 79568 },

    // Season length notes.
    seasonNotes: {
      2020: "2019-20 was suspended on March 11, 2020 and finished in the Orlando bubble; teams played 63 to 75 games. Simulated as 72.",
      2021: "2020-21 was shortened to 72 games."
    }
  };

  if (typeof window !== "undefined") window.CAP_HISTORY = CAP_HISTORY;
  if (root) root.CAP_HISTORY = CAP_HISTORY;
  if (typeof module !== "undefined" && module.exports) module.exports = CAP_HISTORY;
})(typeof self !== "undefined" ? self : this);
