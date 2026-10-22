/* 2K13 Association: real-world news by date for the news feed (window.WORLD_EVENTS), 2012 to 2026.
   Neutral, factual wording. Only events that do not depend on the simulated league: no NBA trades, signings,
   game or playoff results, injuries or deaths of NBA players or coaches (the save diverges from real life).
   NBA items are league business and rules (CBA, formats, media deals, ownership, rebrands).
   Sources: AP, NBA.com press releases (pr.nba.com), NFL.com, FIFA.com, Olympics.com, WHO. */
(function (root) {
  function E(date, headline, body, tag) { return { date: date, headline: headline, body: body, tag: tag }; }
  var WORLD_EVENTS = [
    // 2012 and 2013
    E('2012-11-06', 'Obama Wins Second Term', 'President Barack Obama defeated Mitt Romney to win re-election.', 'politics'),
    E('2013-01-21', 'Obama Sworn In For Second Term', 'President Obama took the oath at his second inauguration in Washington.', 'politics'),
    E('2013-01-24', 'Hornets To Become Pelicans', 'New Orleans announced the franchise will be renamed the Pelicans starting with the 2013-14 season.', 'nba'),
    E('2013-02-03', 'Ravens Win Super Bowl XLVII', 'The Baltimore Ravens beat the San Francisco 49ers 34-31 in New Orleans.', 'sports'),
    E('2013-03-13', 'Pope Francis Elected', 'Cardinal Jorge Mario Bergoglio of Argentina was elected pope and took the name Francis.', 'world'),
    // 2014
    E('2014-02-01', 'Adam Silver Takes Over As Commissioner', 'Adam Silver succeeded David Stern as NBA commissioner. Stern had led the league for 30 years.', 'nba'),
    E('2014-02-02', 'Seahawks Win Super Bowl XLVIII', 'The Seattle Seahawks beat the Denver Broncos 43-8 for the franchise\'s first title.', 'sports'),
    E('2014-02-07', 'Sochi Winter Olympics Open', 'The XXII Olympic Winter Games opened in Sochi, Russia.', 'sports'),
    E('2014-04-29', 'Silver Bans Clippers Owner For Life', 'Commissioner Adam Silver banned Clippers owner Donald Sterling from the NBA for life and fined him $2.5 million.', 'nba'),
    E('2014-05-20', 'Charlotte Bobcats Become The Hornets', 'Charlotte officially reclaimed the Hornets name, along with the history of the original Charlotte franchise.', 'nba'),
    E('2014-07-13', 'Germany Wins The World Cup', 'Germany beat Argentina 1-0 after extra time in Rio de Janeiro.', 'sports'),
    E('2014-08-12', 'Ballmer Completes Clippers Purchase', 'Former Microsoft CEO Steve Ballmer completed his $2 billion purchase of the Los Angeles Clippers.', 'nba'),
    E('2014-09-09', 'Apple Unveils Apple Watch', 'Apple introduced the iPhone 6 and its first smartwatch, the Apple Watch.', 'tech'),
    E('2014-09-14', 'USA Wins Basketball World Cup', 'The United States beat Serbia 129-92 in Madrid to win the FIBA Basketball World Cup.', 'sports'),
    E('2014-10-06', 'NBA Signs $24 Billion TV Deal', 'The NBA agreed to nine-year media deals with ESPN and Turner, starting in 2016-17.', 'nba'),
    // 2015
    E('2015-02-01', 'Patriots Win Super Bowl XLIX', 'The New England Patriots beat the Seattle Seahawks 28-24 in Glendale, Arizona.', 'sports'),
    E('2015-06-26', 'Supreme Court Rules On Same-Sex Marriage', 'The U.S. Supreme Court ruled that same-sex couples have a constitutional right to marry.', 'politics'),
    E('2015-07-05', 'USA Wins Women\'s World Cup', 'The United States beat Japan 5-2 in Vancouver to win the FIFA Women\'s World Cup.', 'sports'),
    E('2015-12-12', 'Paris Climate Agreement Adopted', 'Nearly 200 countries adopted the Paris Agreement on climate change.', 'world'),
    // 2016
    E('2016-02-07', 'Broncos Win Super Bowl 50', 'The Denver Broncos beat the Carolina Panthers 24-10 in Santa Clara, California.', 'sports'),
    E('2016-04-15', 'NBA Approves Jersey Sponsor Patches', 'The Board of Governors approved sponsor patches on uniforms, starting with the 2017-18 season.', 'nba'),
    E('2016-06-23', 'UK Votes To Leave The EU', 'Voters in the United Kingdom chose to leave the European Union in a referendum.', 'world'),
    E('2016-07-01', 'Salary Cap Jumps To $94.1 Million', 'Fueled by the new TV deals, the NBA salary cap rose from $70 million to $94.1 million.', 'nba'),
    E('2016-08-05', 'Rio Olympics Open', 'The Games of the XXXI Olympiad opened in Rio de Janeiro.', 'sports'),
    E('2016-08-21', 'USA Men Win Olympic Gold In Rio', 'The U.S. men beat Serbia 96-66 for the gold medal. The U.S. women won gold the day before, beating Spain 101-72.', 'sports'),
    E('2016-11-02', 'Cubs Win First World Series Since 1908', 'The Chicago Cubs beat Cleveland in Game 7 to end a 108-year championship drought.', 'sports'),
    E('2016-11-08', 'Trump Elected President', 'Donald Trump defeated Hillary Clinton to win the U.S. presidential election.', 'politics'),
    // 2017
    E('2017-01-19', 'NBA Ratifies New CBA', 'The new collective bargaining agreement adds two-way contracts and the Designated Veteran extension (the supermax) from 2017-18.', 'nba'),
    E('2017-01-20', 'Trump Inaugurated', 'Donald Trump was sworn in as the 45th president of the United States.', 'politics'),
    E('2017-02-05', 'Patriots Win Super Bowl LI In Overtime', 'The New England Patriots rallied from a 28-3 deficit to beat the Atlanta Falcons 34-28 in overtime.', 'sports'),
    E('2017-02-14', 'D-League To Become The G League', 'The NBA Development League will be renamed the NBA Gatorade League starting in 2017-18.', 'nba'),
    E('2017-08-21', 'Total Solar Eclipse Crosses America', 'A total solar eclipse was visible from Oregon to South Carolina.', 'world'),
    E('2017-09-28', 'NBA Approves Draft Lottery Reform', 'The Board of Governors flattened the lottery odds, giving the three worst teams equal 14 percent chances starting in 2019.', 'nba'),
    E('2017-10-03', 'All-Star Game Goes To Captains Format', 'Starting in 2018, the top vote-getter in each conference will draft All-Star teams, replacing East vs West.', 'nba'),
    // 2018 and 2019
    E('2018-02-04', 'Eagles Win Super Bowl LII', 'The Philadelphia Eagles beat the New England Patriots 41-33 for their first Super Bowl title.', 'sports'),
    E('2018-02-09', 'PyeongChang Winter Olympics Open', 'The XXIII Olympic Winter Games opened in PyeongChang, South Korea.', 'sports'),
    E('2018-07-15', 'France Wins The World Cup', 'France beat Croatia 4-2 in Moscow to win its second World Cup.', 'sports'),
    E('2019-02-03', 'Patriots Win Super Bowl LIII', 'The New England Patriots beat the Los Angeles Rams 13-3 in Atlanta.', 'sports'),
    E('2019-04-10', 'First Image Of A Black Hole', 'The Event Horizon Telescope released the first image of a black hole.', 'tech'),
    E('2019-07-07', 'USA Repeats As Women\'s World Cup Champion', 'The United States beat the Netherlands 2-0 in Lyon, France.', 'sports'),
    E('2019-09-15', 'Spain Wins Basketball World Cup', 'Spain beat Argentina 95-75 in Beijing. The United States finished seventh.', 'sports'),
    // 2020
    E('2020-01-31', 'UK Formally Leaves The EU', 'The United Kingdom left the European Union.', 'world'),
    E('2020-02-02', 'Chiefs Win Super Bowl LIV', 'The Kansas City Chiefs beat the San Francisco 49ers 31-20 in Miami.', 'sports'),
    E('2020-03-11', 'WHO Declares COVID-19 A Pandemic', 'The World Health Organization declared the coronavirus outbreak a global pandemic.', 'covid'),
    E('2020-03-11', 'NBA Suspends Season', 'The NBA suspended the season indefinitely after a player tested positive for COVID-19.', 'covid'),
    E('2020-03-13', 'U.S. Declares National Emergency', 'The United States declared a national emergency over the coronavirus outbreak.', 'covid'),
    E('2020-03-24', 'Tokyo Olympics Postponed', 'The 2020 Tokyo Olympics were postponed to 2021 because of the pandemic.', 'covid'),
    E('2020-06-04', 'NBA Approves Restart At Disney World', 'The Board of Governors approved a 22-team return to play near Orlando, Florida, with a possible play-in for the last playoff spot.', 'nba'),
    E('2020-07-30', 'NBA Resumes Play In The Bubble', 'The NBA season resumed at Walt Disney World with no fans in attendance.', 'nba'),
    E('2020-11-07', 'Biden Projected Winner Of Election', 'Joe Biden was projected to defeat President Trump in the U.S. presidential election.', 'politics'),
    E('2020-11-17', 'NBA Approves 72-Game Season And Play-In', 'The 2020-21 season will have 72 games and a play-in tournament for seeds 7 through 10 in each conference.', 'nba'),
    E('2020-12-11', 'First COVID-19 Vaccine Authorized', 'The FDA authorized the Pfizer-BioNTech COVID-19 vaccine for emergency use.', 'covid'),
    // 2021 and 2022
    E('2021-01-20', 'Biden Inaugurated', 'Joe Biden was sworn in as the 46th president of the United States.', 'politics'),
    E('2021-02-07', 'Buccaneers Win Super Bowl LV', 'The Tampa Bay Buccaneers beat the Kansas City Chiefs 31-9 in Tampa.', 'sports'),
    E('2021-02-18', 'Perseverance Lands On Mars', 'NASA\'s Perseverance rover landed in Jezero Crater on Mars.', 'tech'),
    E('2021-07-23', 'Tokyo Olympics Open A Year Late', 'The delayed Tokyo Games opened without spectators.', 'sports'),
    E('2021-08-07', 'USA Men Win Gold In Tokyo', 'The U.S. men beat France 87-82 for gold. The U.S. women won their seventh straight gold the next day, beating Japan 90-75.', 'sports'),
    E('2021-12-25', 'James Webb Telescope Launches', 'The James Webb Space Telescope launched from French Guiana.', 'tech'),
    E('2022-02-04', 'Beijing Winter Olympics Open', 'The XXIV Olympic Winter Games opened in Beijing.', 'sports'),
    E('2022-02-13', 'Rams Win Super Bowl LVI', 'The Los Angeles Rams beat the Cincinnati Bengals 23-20 at SoFi Stadium.', 'sports'),
    E('2022-02-24', 'Russia Invades Ukraine', 'Russia launched a full-scale invasion of Ukraine.', 'world'),
    E('2022-11-30', 'ChatGPT Released', 'OpenAI released the ChatGPT chatbot to the public.', 'tech'),
    E('2022-12-18', 'Argentina Wins The World Cup', 'Argentina beat France on penalties after a 3-3 draw in Qatar.', 'sports'),
    // 2023 and 2024
    E('2023-02-12', 'Chiefs Win Super Bowl LVII', 'The Kansas City Chiefs beat the Philadelphia Eagles 38-35 in Glendale, Arizona.', 'sports'),
    E('2023-04-26', 'NBA Ratifies New CBA', 'The seven-year deal adds a second apron, a 65-game minimum for major awards, a third two-way slot per team and an in-season tournament.', 'nba'),
    E('2023-05-05', 'WHO Ends COVID-19 Emergency', 'The World Health Organization declared that COVID-19 is no longer a global health emergency.', 'covid'),
    E('2023-07-08', 'NBA Unveils In-Season Tournament', 'The NBA announced its first in-season tournament, with the semifinals and final in Las Vegas in December.', 'nba'),
    E('2023-09-10', 'Germany Wins Basketball World Cup', 'Germany beat Serbia 83-77 in Manila to win its first FIBA World Cup.', 'sports'),
    E('2024-02-11', 'Chiefs Repeat In Super Bowl LVIII', 'The Kansas City Chiefs beat the San Francisco 49ers 25-22 in overtime in Las Vegas.', 'sports'),
    E('2024-04-08', 'Total Solar Eclipse Over North America', 'A total solar eclipse crossed Mexico, the United States and Canada.', 'world'),
    E('2024-07-24', 'NBA Finalizes $76 Billion Media Deals', 'The NBA completed 11-year deals with Disney, NBC and Amazon starting in 2025-26.', 'nba'),
    E('2024-07-26', 'Paris Olympics Open', 'The Games of the XXXIII Olympiad opened in Paris with a ceremony along the Seine.', 'sports'),
    E('2024-08-10', 'USA Men Win Gold In Paris', 'The U.S. men beat France 98-87 for gold. The U.S. women won an eighth straight gold the next day, beating France 67-66.', 'sports'),
    E('2024-11-06', 'Trump Wins Presidency Again', 'Donald Trump defeated Kamala Harris to win a second, non-consecutive term.', 'politics'),
    // 2025 and 2026
    E('2025-01-20', 'Trump Inaugurated For Second Term', 'Donald Trump was sworn in as the 47th president in the Capitol Rotunda.', 'politics'),
    E('2025-02-09', 'Eagles Win Super Bowl LIX', 'The Philadelphia Eagles beat the Kansas City Chiefs 40-22 in New Orleans.', 'sports'),
    E('2025-05-08', 'First American Pope Elected', 'Cardinal Robert Prevost of Chicago was elected pope and took the name Leo XIV.', 'world'),
    E('2026-02-06', 'Milan Cortina Winter Olympics Open', 'The XXV Olympic Winter Games opened in Milan and Cortina d\'Ampezzo, Italy.', 'sports'),
    E('2026-02-08', 'Seahawks Win Super Bowl LX', 'The Seattle Seahawks beat the New England Patriots 29-13 in Santa Clara, California.', 'sports'),
    E('2026-06-11', 'World Cup Kicks Off In North America', 'The first 48-team World Cup opened in Mexico City, co-hosted by the United States, Canada and Mexico.', 'sports'),
    E('2026-07-19', 'Spain Wins The World Cup', 'Spain beat Argentina 1-0 after extra time at MetLife Stadium in New Jersey.', 'sports')
  ];
  WORLD_EVENTS.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  if (typeof window !== 'undefined') window.WORLD_EVENTS = WORLD_EVENTS;
  else if (root) root.WORLD_EVENTS = WORLD_EVENTS;
  if (typeof module !== 'undefined' && module.exports) module.exports = WORLD_EVENTS;
})(typeof self !== 'undefined' ? self : this);
