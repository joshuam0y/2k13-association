/* 2K13 Association: NBA D-League (G League from 2017-18) clubs and NBA affiliations.
   Years are season-ending years (2013 = 2012-13).
   2012-13: 16 clubs, 11 single affiliations and shared ones for Bakersfield, Fort Wayne, Iowa, Reno and Sioux Falls
   (source: NBA.com press release "NBA announces affiliations with NBA D-League for 2012-13 season", pr.nba.com).
   2013-14: Hoops Rumors "NBA D-League affiliations for 2013/14" (17 clubs, 14 single affiliates).
   Later seasons: team histories on Wikipedia and NBA.com, best effort; relocations are new club ids, renames are
   entries in names. A team with no affiliate in a season uses flexible assignment (GLEAGUE picks a club).
   Every NBA team has its own affiliate from 2024-25 on. */
(function (root) {
  var clubs = [
    // the 2012-13 league
    { id: 'AUS', from: 2013, to: null, names: [{ from: 2013, city: 'Austin', name: 'Toros' }, { from: 2015, city: 'Austin', name: 'Spurs' }] },
    { id: 'BAK', from: 2013, to: 2016, names: [{ from: 2013, city: 'Bakersfield', name: 'Jam' }] },
    { id: 'CAN', from: 2013, to: null, names: [{ from: 2013, city: 'Canton', name: 'Charge' }, { from: 2022, city: 'Cleveland', name: 'Charge' }] },
    { id: 'ERI', from: 2013, to: 2017, names: [{ from: 2013, city: 'Erie', name: 'BayHawks' }] },
    { id: 'FWA', from: 2013, to: null, names: [{ from: 2013, city: 'Fort Wayne', name: 'Mad Ants' }, { from: 2026, city: 'Noblesville', name: 'Boom' }] },
    { id: 'IDA', from: 2013, to: 2016, names: [{ from: 2013, city: 'Idaho', name: 'Stampede' }] },
    { id: 'IOW', from: 2013, to: null, names: [{ from: 2013, city: 'Iowa', name: 'Energy' }, { from: 2018, city: 'Iowa', name: 'Wolves' }] },
    { id: 'LAD', from: 2013, to: null, names: [{ from: 2013, city: 'Los Angeles', name: 'D-Fenders' }, { from: 2018, city: 'South Bay', name: 'Lakers' }] },
    { id: 'MAI', from: 2013, to: null, names: [{ from: 2013, city: 'Maine', name: 'Red Claws' }, { from: 2022, city: 'Maine', name: 'Celtics' }] },
    { id: 'REN', from: 2013, to: 2018, names: [{ from: 2013, city: 'Reno', name: 'Bighorns' }] },
    { id: 'RGV', from: 2013, to: null, names: [{ from: 2013, city: 'Rio Grande Valley', name: 'Vipers' }] },
    { id: 'SCW', from: 2013, to: null, names: [{ from: 2013, city: 'Santa Cruz', name: 'Warriors' }] },
    { id: 'SXF', from: 2013, to: null, names: [{ from: 2013, city: 'Sioux Falls', name: 'Skyforce' }] },
    { id: 'SPR', from: 2013, to: 2014, names: [{ from: 2013, city: 'Springfield', name: 'Armor' }] },
    { id: 'TEX', from: 2013, to: null, names: [{ from: 2013, city: 'Texas', name: 'Legends' }] },
    { id: 'TUL', from: 2013, to: null, names: [{ from: 2013, city: 'Tulsa', name: '66ers' }, { from: 2015, city: 'Oklahoma City', name: 'Blue' }] },
    // added later
    { id: 'DEL', from: 2014, to: null, names: [{ from: 2014, city: 'Delaware', name: '87ers' }, { from: 2019, city: 'Delaware', name: 'Blue Coats' }] },
    { id: 'GRD', from: 2015, to: null, names: [{ from: 2015, city: 'Grand Rapids', name: 'Drive' }, { from: 2022, city: 'Grand Rapids', name: 'Gold' }] },
    { id: 'WES', from: 2015, to: null, names: [{ from: 2015, city: 'Westchester', name: 'Knicks' }] },
    { id: 'TOR9', from: 2016, to: null, names: [{ from: 2016, city: 'Mississauga', name: 'Raptors 905' }] },
    { id: 'GSO', from: 2017, to: null, names: [{ from: 2017, city: 'Greensboro', name: 'Swarm' }] },
    { id: 'LIN', from: 2017, to: null, names: [{ from: 2017, city: 'Long Island', name: 'Nets' }] },
    { id: 'WCB', from: 2017, to: null, names: [{ from: 2017, city: 'Windy City', name: 'Bulls' }] },
    { id: 'SLC', from: 2017, to: null, names: [{ from: 2017, city: 'Salt Lake City', name: 'Stars' }] },
    { id: 'NAZ', from: 2017, to: 2021, names: [{ from: 2017, city: 'Northern Arizona', name: 'Suns' }] },
    { id: 'ACC', from: 2018, to: null, names: [{ from: 2018, city: 'Agua Caliente', name: 'Clippers' }, { from: 2024, city: 'Ontario', name: 'Clippers' }, { from: 2025, city: 'San Diego', name: 'Clippers' }] },
    { id: 'LKL', from: 2018, to: null, names: [{ from: 2018, city: 'Lakeland', name: 'Magic' }, { from: 2024, city: 'Osceola', name: 'Magic' }] },
    { id: 'ERA', from: 2018, to: null, names: [{ from: 2018, city: 'Erie', name: 'BayHawks' }, { from: 2020, city: 'College Park', name: 'Skyhawks' }] },
    { id: 'MEMH', from: 2018, to: null, names: [{ from: 2018, city: 'Memphis', name: 'Hustle' }] },
    { id: 'WIS', from: 2018, to: null, names: [{ from: 2018, city: 'Wisconsin', name: 'Herd' }] },
    { id: 'CCG', from: 2019, to: null, names: [{ from: 2019, city: 'Capital City', name: 'Go-Go' }] },
    { id: 'STO', from: 2019, to: null, names: [{ from: 2019, city: 'Stockton', name: 'Kings' }] },
    { id: 'ERN', from: 2020, to: null, names: [{ from: 2020, city: 'Erie', name: 'BayHawks' }, { from: 2022, city: 'Birmingham', name: 'Squadron' }] },
    { id: 'IGN', from: 2021, to: 2024, names: [{ from: 2021, city: 'G League', name: 'Ignite' }] },
    { id: 'MCC', from: 2022, to: null, names: [{ from: 2022, city: 'Motor City', name: 'Cruise' }] },
    { id: 'MXC', from: 2022, to: null, names: [{ from: 2022, city: 'Mexico City', name: 'Capitanes' }] },
    { id: 'RCR', from: 2024, to: null, names: [{ from: 2024, city: 'Rip City', name: 'Remix' }] },
    { id: 'VAL', from: 2025, to: null, names: [{ from: 2025, city: 'Valley', name: 'Suns' }] }
  ];

  // [fromYear, toYear (null = open), clubId] for each NBA team. Missing years = no affiliate (flexible assignment).
  var affiliates = {
    ATL: [[2013, 2014, 'BAK'], [2015, 2015, 'FWA'], [2018, null, 'ERA']],
    BOS: [[2013, null, 'MAI']],
    BKN: [[2013, 2014, 'SPR'], [2015, 2015, 'FWA'], [2017, null, 'LIN']],
    CHA: [[2013, 2015, 'FWA'], [2017, null, 'GSO']],
    CHI: [[2013, 2014, 'IOW'], [2015, 2015, 'FWA'], [2017, null, 'WCB']],
    CLE: [[2013, null, 'CAN']],
    DAL: [[2013, null, 'TEX']],
    DEN: [[2013, 2014, 'IOW'], [2015, 2015, 'FWA'], [2022, null, 'GRD']],
    DET: [[2013, 2014, 'FWA'], [2015, 2021, 'GRD'], [2022, null, 'MCC']],
    GSW: [[2013, null, 'SCW']],
    HOU: [[2013, null, 'RGV']],
    IND: [[2013, null, 'FWA']],
    LAC: [[2013, 2014, 'BAK'], [2015, 2015, 'FWA'], [2018, null, 'ACC']],
    LAL: [[2013, null, 'LAD']],
    MEM: [[2013, 2013, 'REN'], [2014, 2014, 'FWA'], [2015, 2017, 'IOW'], [2018, null, 'MEMH']],
    MIA: [[2013, null, 'SXF']],
    MIL: [[2013, 2015, 'FWA'], [2018, null, 'WIS']],
    MIN: [[2013, 2013, 'SXF'], [2014, 2014, 'IOW'], [2015, 2015, 'FWA'], [2018, null, 'IOW']],
    NOH: [[2013, 2014, 'IOW'], [2015, 2015, 'FWA'], [2020, null, 'ERN']],
    NYK: [[2013, 2014, 'ERI'], [2015, null, 'WES']],
    OKC: [[2013, null, 'TUL']],
    ORL: [[2013, 2013, 'SXF'], [2014, 2014, 'FWA'], [2015, 2017, 'ERI'], [2018, null, 'LKL']],
    PHI: [[2013, 2013, 'SXF'], [2014, null, 'DEL']],
    PHX: [[2013, 2016, 'BAK'], [2017, 2021, 'NAZ'], [2025, null, 'VAL']],
    POR: [[2013, 2014, 'IDA'], [2015, 2015, 'FWA'], [2024, null, 'RCR']],
    SAC: [[2013, 2018, 'REN'], [2019, null, 'STO']],
    SAS: [[2013, null, 'AUS']],
    TOR: [[2013, 2014, 'BAK'], [2015, 2015, 'FWA'], [2016, null, 'TOR9']],
    UTA: [[2013, 2013, 'REN'], [2014, 2014, 'BAK'], [2015, 2016, 'IDA'], [2017, null, 'SLC']],
    WAS: [[2013, 2014, 'IOW'], [2015, 2015, 'FWA'], [2019, null, 'CCG']]
  };
  // Indiana took Fort Wayne as its single affiliate in 2015-16; before that the Mad Ants were shared.
  // New Orleans keeps the NOH key; the rebrand to NOP is handled by the league module.
  affiliates.NOP = affiliates.NOH;
  affiliates.CHH = affiliates.CHA;

  var GLEAGUE_DATA = {
    clubs: clubs,
    affiliates: affiliates,
    leagueNames: [{ from: 2002, name: 'NBA D-League' }, { from: 2018, name: 'NBA G League' }],
    champions: { 2013: 'RGV' }
  };
  if (typeof window !== 'undefined') window.GLEAGUE_DATA = GLEAGUE_DATA;
  else if (root) root.GLEAGUE_DATA = GLEAGUE_DATA;
  if (typeof module !== 'undefined' && module.exports) module.exports = GLEAGUE_DATA;
})(typeof self !== 'undefined' ? self : this);
