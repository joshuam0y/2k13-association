/* 2K13 Association: head coaches.
   start: the real head coach of every team on opening night of 2012-13.
   pool: real coaches who got NBA head jobs from 2013 to 2026, available from their real first hire
   (season-ending year), plus a few veterans who were on the market in 2012.
   Ratings 40 to 99 (offense, defense, development, motivation) are estimates from real records and reputation.
   born: birth year. last: last real season as an NBA head coach (season-ending year), null if still active in 2026.
   Sources: Basketball-Reference coach pages, NBA.com. */
(function (root) {
  var C = function (id, name, born, off, def, dev, mot, extra) {
    var o = { id: id, name: name, born: born, offense: off, defense: def, development: dev, motivation: mot };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  };
  var start = [
    C('popovgr99', 'Gregg Popovich', 1949, 92, 95, 94, 96, { team: 'SAS', since: 1997, last: 2025, titles: 4 }),
    C('spoeler99', 'Erik Spoelstra', 1970, 88, 93, 88, 90, { team: 'MIA', since: 2009, last: null, titles: 1 }),
    C('thibotr99', 'Tom Thibodeau', 1958, 76, 98, 78, 86, { team: 'CHI', since: 2011, last: null }),
    C('riverdo01', 'Doc Rivers', 1961, 84, 88, 76, 92, { team: 'BOS', since: 2005, last: null, titles: 1 }),
    C('brooksc01', 'Scott Brooks', 1965, 78, 80, 86, 80, { team: 'OKC', since: 2009, last: 2023 }),
    C('karlge99', 'George Karl', 1951, 92, 74, 84, 86, { team: 'DEN', since: 2005, last: 2016 }),
    C('brownmi99', 'Mike Brown', 1970, 66, 88, 70, 62, { team: 'LAL', since: 2012, last: null }),
    C('delnevi01', 'Vinny Del Negro', 1966, 70, 64, 64, 68, { team: 'LAC', since: 2011, last: 2013 }),
    C('hollili01', 'Lionel Hollins', 1953, 72, 90, 80, 84, { team: 'MEM', since: 2009, last: 2016 }),
    C('carliri01', 'Rick Carlisle', 1959, 95, 86, 84, 88, { team: 'DAL', since: 2009, last: null, titles: 1 }),
    C('johnsav01', 'Avery Johnson', 1965, 70, 76, 64, 68, { team: 'BKN', since: 2011, last: 2013 }),
    C('woodsmi01', 'Mike Woodson', 1958, 80, 74, 66, 78, { team: 'NYK', since: 2012, last: 2014 }),
    C('vogelfr99', 'Frank Vogel', 1973, 72, 93, 82, 86, { team: 'IND', since: 2011, last: 2024 }),
    C('vaughja01', 'Jacque Vaughn', 1975, 60, 64, 72, 70, { team: 'ORL', since: 2013, last: 2025 }),
    C('collido01', 'Doug Collins', 1951, 76, 84, 72, 72, { team: 'PHI', since: 2011, last: 2013 }),
    C('caseydw99', 'Dwane Casey', 1957, 72, 86, 82, 82, { team: 'TOR', since: 2012, last: 2023 }),
    C('wittmra01', 'Randy Wittman', 1959, 64, 76, 66, 66, { team: 'WAS', since: 2012, last: 2016 }),
    C('drewla01', 'Larry Drew', 1958, 74, 72, 70, 74, { team: 'ATL', since: 2011, last: 2014 }),
    C('dunlami99', 'Mike Dunlap', 1957, 56, 66, 64, 58, { team: 'CHA', since: 2013, last: 2013 }),
    C('scottby01', 'Byron Scott', 1961, 70, 64, 68, 68, { team: 'CLE', since: 2011, last: 2016 }),
    C('frankla99', 'Lawrence Frank', 1970, 66, 78, 66, 62, { team: 'DET', since: 2012, last: 2014 }),
    C('skilesc01', 'Scott Skiles', 1964, 66, 86, 66, 70, { team: 'MIL', since: 2009, last: 2016 }),
    C('adelmri01', 'Rick Adelman', 1946, 92, 72, 78, 84, { team: 'MIN', since: 2012, last: 2014 }),
    C('willimo01', 'Monty Williams', 1971, 68, 80, 76, 80, { team: 'NOH', since: 2011, last: 2025 }),
    C('mchalke01', 'Kevin McHale', 1957, 80, 68, 80, 76, { team: 'HOU', since: 2012, last: 2016 }),
    C('jacksma01', 'Mark Jackson', 1965, 72, 84, 76, 88, { team: 'GSW', since: 2012, last: 2014 }),
    C('gentral99', 'Alvin Gentry', 1954, 88, 60, 74, 80, { team: 'PHX', since: 2009, last: 2022 }),
    C('stottte01', 'Terry Stotts', 1957, 86, 64, 80, 78, { team: 'POR', since: 2013, last: 2021 }),
    C('smartke01', 'Keith Smart', 1964, 62, 60, 62, 64, { team: 'SAC', since: 2012, last: 2014 }),
    C('corbity01', 'Tyrone Corbin', 1962, 64, 66, 68, 66, { team: 'UTA', since: 2011, last: 2014 })
  ];
  var pool = [
    // veterans out of work in the fall of 2012
    C('vangust99', 'Stan Van Gundy', 1959, 84, 84, 76, 74, { available: 2013, last: 2021 }),
    C('mcmilna01', 'Nate McMillan', 1964, 70, 84, 70, 80, { available: 2013, last: 2023 }),
    C('dantomi99', "Mike D'Antoni", 1951, 92, 58, 72, 74, { available: 2013, last: 2020 }),
    // first hired 2013 to 2026 (season-ending year of the first season)
    C('stevebr99', 'Brad Stevens', 1976, 86, 86, 88, 84, { available: 2014, last: 2021 }),
    C('budenmi99', 'Mike Budenholzer', 1969, 86, 88, 82, 80, { available: 2014, last: 2025 }),
    C('kiddja01', 'Jason Kidd', 1973, 80, 80, 76, 82, { available: 2014, last: null }),
    C('cliffst99', 'Steve Clifford', 1961, 72, 86, 74, 80, { available: 2014, last: 2025 }),
    C('hornaje01', 'Jeff Hornacek', 1963, 74, 64, 70, 66, { available: 2014, last: 2018 }),
    C('shawbr01', 'Brian Shaw', 1966, 66, 62, 64, 58, { available: 2014, last: 2015 }),
    C('joergda99', 'Dave Joerger', 1974, 72, 86, 76, 78, { available: 2014, last: 2019 }),
    C('brownbr99', 'Brett Brown', 1961, 74, 78, 90, 82, { available: 2014, last: 2020 }),
    C('malonmi99', 'Michael Malone', 1971, 86, 74, 88, 84, { available: 2014, last: 2025 }),
    C('cheekma01', 'Maurice Cheeks', 1956, 64, 62, 66, 66, { available: 2014, last: 2014 }),
    C('kerrst01', 'Steve Kerr', 1965, 92, 86, 86, 92, { available: 2015, last: null }),
    C('snydequ99', 'Quin Snyder', 1966, 86, 86, 90, 80, { available: 2015, last: null }),
    C('blattda99', 'David Blatt', 1959, 82, 74, 70, 66, { available: 2015, last: 2016 }),
    C('fishede01', 'Derek Fisher', 1974, 58, 62, 60, 56, { available: 2015, last: 2016 }),
    C('saundfl99', 'Flip Saunders', 1955, 78, 66, 72, 74, { available: 2015, last: 2015 }),
    C('hoibefr01', 'Fred Hoiberg', 1972, 76, 62, 70, 62, { available: 2016, last: 2019 }),
    C('donovbi99', 'Billy Donovan', 1965, 80, 84, 86, 82, { available: 2016, last: null }),
    C('luety01', 'Tyronn Lue', 1977, 88, 80, 76, 90, { available: 2016, last: null }),
    C('bickejb99', 'J.B. Bickerstaff', 1979, 72, 84, 84, 80, { available: 2016, last: null }),
    C('waltolu01', 'Luke Walton', 1980, 72, 66, 74, 72, { available: 2017, last: 2022 }),
    C('atkinke99', 'Kenny Atkinson', 1967, 80, 74, 90, 84, { available: 2017, last: null }),
    C('piercll99', 'Lloyd Pierce', 1976, 70, 76, 82, 70, { available: 2019, last: 2021 }),
    C('nursen99', 'Nick Nurse', 1967, 88, 90, 86, 82, { available: 2019, last: null }),
    C('borreja99', 'James Borrego', 1977, 72, 68, 82, 72, { available: 2019, last: 2022 }),
    C('kokosig99', 'Igor Kokoskov', 1971, 70, 60, 68, 58, { available: 2019, last: 2019 }),
    C('saundry99', 'Ryan Saunders', 1986, 62, 62, 66, 64, { available: 2019, last: 2021 }),
    C('jenkita99', 'Taylor Jenkins', 1984, 80, 84, 88, 82, { available: 2020, last: 2025 }),
    C('nashst01', 'Steve Nash', 1974, 80, 58, 64, 60, { available: 2021, last: 2023 }),
    C('finchch99', 'Chris Finch', 1970, 86, 76, 80, 80, { available: 2021, last: null }),
    C('silasst99', 'Stephen Silas', 1973, 70, 60, 78, 66, { available: 2021, last: 2023 }),
    C('bjorkna99', 'Nate Bjorkgren', 1975, 66, 72, 64, 52, { available: 2021, last: 2021 }),
    C('daignma99', 'Mark Daigneault', 1985, 86, 92, 94, 88, { available: 2021, last: null }),
    C('udokaim01', 'Ime Udoka', 1977, 78, 92, 80, 80, { available: 2022, last: null }),
    C('greenwi01', 'Willie Green', 1981, 74, 80, 78, 84, { available: 2022, last: null }),
    C('mosleja99', 'Jamahl Mosley', 1978, 70, 84, 86, 78, { available: 2022, last: null }),
    C('billuch01', 'Chauncey Billups', 1976, 72, 68, 76, 72, { available: 2022, last: 2025 }),
    C('unselwe02', 'Wes Unseld Jr.', 1975, 66, 74, 74, 68, { available: 2022, last: 2024 }),
    C('hardywi99', 'Will Hardy', 1988, 84, 74, 90, 80, { available: 2023, last: null }),
    C('mazzujo99', 'Joe Mazzulla', 1988, 88, 88, 82, 84, { available: 2023, last: null }),
    C('hamda01', 'Darvin Ham', 1973, 70, 76, 70, 76, { available: 2023, last: 2024 }),
    C('griffad01', 'Adrian Griffin', 1974, 62, 64, 62, 54, { available: 2024, last: 2024 }),
    C('redicjj01', 'JJ Redick', 1984, 84, 74, 78, 78, { available: 2025, last: null }),
    C('fernajo99', 'Jordi Fernandez', 1982, 80, 74, 84, 82, { available: 2025, last: null }),
    C('leech99', 'Charles Lee', 1984, 76, 84, 80, 80, { available: 2025, last: null }),
    C('keefebr99', 'Brian Keefe', 1976, 66, 68, 78, 70, { available: 2025, last: null }),
    C('johnsmi99', 'Mitch Johnson', 1986, 80, 78, 80, 80, { available: 2025, last: null }),
    C('chrisdo01', 'Doug Christie', 1970, 66, 70, 70, 74, { available: 2026, last: null })
  ];
  var startByTeam = {};
  start.forEach(function (c) { startByTeam[c.team] = c.id; });
  var COACHES = {
    start: start,
    pool: pool,
    startByTeam: startByTeam,
    firstNames: ['Marcus', 'Derrick', 'Tony', 'Brian', 'Kevin', 'Andre', 'Sam', 'Chris', 'Darnell', 'Paul', 'Luis',
      'Mateo', 'Jalen', 'Owen', 'Elijah', 'Rafael', 'Victor', 'Noah', 'Isaiah', 'Tyler', 'Ryan', 'Malik', 'Greg', 'Omar'],
    lastNames: ['Whitfield', 'Callahan', 'Okafor', 'Brennan', 'Dawson', 'Moreno', 'Harlan', 'Pruitt', 'Lindqvist',
      'Castellano', 'Mercer', 'Ashby', 'Kowalski', 'Fairbanks', 'Delgado', 'Thornton', 'Vance', 'Holloway', 'Sutter',
      'Bramwell', 'Okoye', 'Renfro', 'Galloway', 'Pemberton']
  };
  if (typeof window !== 'undefined') window.COACHES = COACHES;
  else if (root) root.COACHES = COACHES;
  if (typeof module !== 'undefined' && module.exports) module.exports = COACHES;
})(typeof self !== 'undefined' ? self : this);
