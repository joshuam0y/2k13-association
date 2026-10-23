// Fictional draft classes: window.DRAFTGEN (and module.exports under Node).
// DRAFTGEN.generate(year, rng, opts) returns about 72 to 80 prospects shaped exactly like the real
// prospects in data/drafts.js, for drafts from 2027 on (2013 to 2026 are real).
// rng: a function returning [0, 1) (for example a mulberry32 stream). Same rng, same class.
// opts (optional): { size: exact class size, used: names to avoid (object map, array or a state with players) }.
// The model constants below were measured from the real 2013 to 2025 classes (2026 is left out because its
// ratings are pre-career projections): age comes from the real mix and pot and ovr from a Gaussian copula
// fitted to each age group, attributes from per-position archetypes (k-means) plus the real spread,
// and height and weight from per-position means and the real height to weight slope.
(function (root) {
  'use strict';

  var ATTR_KEYS = ['close', 'mid', 'three', 'ft', 'layup', 'dunk', 'post', 'handle', 'pass', 'oreb', 'dreb',
    'steal', 'block', 'perD', 'intD', 'speed', 'vert', 'strength', 'stamina', 'durability', 'oiq', 'diq'];
  // Same weights as js/progression.js (used only when window.PROG is not loaded).
  var POS_WEIGHTS = {
    PG: [0.6, 1.0, 1.2, 0.5, 1.0, 0.3, 0.1, 1.6, 1.6, 0.1, 0.3, 1.0, 0.1, 1.1, 0.1, 1.3, 0.5, 0.2, 0.6, 0.3, 1.3, 0.8],
    SG: [0.7, 1.2, 1.4, 0.6, 1.1, 0.6, 0.2, 1.1, 0.8, 0.2, 0.4, 1.0, 0.2, 1.1, 0.2, 1.1, 0.7, 0.3, 0.6, 0.3, 1.2, 0.8],
    SF: [0.9, 1.1, 1.1, 0.5, 1.0, 0.8, 0.5, 0.8, 0.7, 0.5, 0.7, 0.8, 0.5, 1.0, 0.6, 0.9, 0.8, 0.6, 0.6, 0.3, 1.1, 0.9],
    PF: [1.2, 0.8, 0.5, 0.4, 0.8, 0.9, 1.0, 0.3, 0.4, 1.1, 1.3, 0.4, 1.0, 0.4, 1.2, 0.4, 0.7, 1.1, 0.5, 0.3, 1.0, 1.0],
    C: [1.3, 0.4, 0.2, 0.3, 0.6, 1.0, 1.1, 0.1, 0.3, 1.3, 1.5, 0.3, 1.4, 0.2, 1.5, 0.3, 0.6, 1.3, 0.5, 0.3, 0.9, 1.1]
  };

  // ---------------------------------------------------------------------------
  // Model fitted to the real 2013 to 2025 classes (877 prospects)
  // ---------------------------------------------------------------------------
  var GRID = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9,
    0.93, 0.95, 0.97, 0.98, 0.99, 0.995, 1];
  var AGES = [18, 19, 20, 21, 22, 23, 24];
  var AGE_N = [55, 212, 152, 161, 178, 95, 24]; // 24 counts 24 and older
  // By age group: quantiles (at GRID) of pot and of ovr, and their normal-score correlation.
  // pot is then raised to ovr when the draw lands below it (16% of real prospects have pot equal to ovr).
  var AGE_GROUPS = {
    young: { // 18 and 19
      pot: [62, 69.38, 71.72, 72.66, 73.68, 75.49, 76.39, 77.39, 78.29, 79.28, 80.05, 81.1, 82.22, 83.52, 84.36, 85.88,
        87.05, 88.26, 89.95, 91.44, 93.54, 95.26, 97.09, 97.96, 98.29, 99],
      ovr: [60, 66.49, 68.13, 68.96, 69.71, 70.32, 70.81, 71.25, 71.65, 71.98, 72.31, 72.68, 73.08, 73.48, 74.47,
        75.22, 76.33, 77.55, 78.98, 80.31, 81.34, 82.41, 83.23, 85.34, 86.67, 88],
      r: 0.644 },
    mid: { // 20 and 21
      pot: [61, 65.92, 68.91, 70.56, 71.3, 71.96, 72.61, 73.39, 74.51, 75.16, 75.81, 76.46, 77.58, 78.91, 79.81,
        81, 82.29, 83.55, 84.88, 86.07, 87.4, 89.49, 90.32, 93.69, 94.91, 96],
      ovr: [59, 63.64, 65.29, 67.33, 68.49, 69.03, 69.56, 70.01, 70.45, 70.8, 71.14, 71.48, 71.8, 72.12, 72.44,
        73.28, 74.08, 75.11, 76.66, 77.33, 78.15, 79.74, 80.08, 80.43, 80.81, 81],
      r: 0.681 },
    old: { // 22 and up
      pot: [56, 63.72, 66.54, 68.76, 70.24, 71.28, 72.09, 72.86, 73.59, 74.3, 75, 75.64, 76.14, 76.67, 77.31,
        78, 78.69, 79.33, 80.51, 81.85, 82.64, 84.04, 85.79, 87.01, 87.55, 88],
      ovr: [56, 61.83, 64.01, 65.83, 67.11, 67.85, 68.34, 68.92, 69.53, 69.98, 70.42, 70.92, 71.43, 71.86, 72.27,
        72.71, 73.19, 74.01, 75.16, 75.79, 76.25, 76.87, 77.3, 78.32, 80.39, 81],
      r: 0.628 }
  };
  function ageGroup(age) { return age <= 19 ? 'young' : age <= 21 ? 'mid' : 'old'; }
  // Real class sizes 2013 to 2025 (the core of a class; low-end fringe prospects fill it to the target size)
  var REAL_SIZES = [69, 69, 67, 71, 71, 66, 76, 65, 70, 65, 61, 63, 64];
  var OVR_MIN = 55, OVR_MAX = 90;

  var POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
  // share, calibration offset (ovr minus weighted attrs) mean and sd,
  // body: htMean, htSd, htMin, htMax, wtMean, wt per inch, wtResidualSd, wtMin, wtMax,
  // arch: attribute minus weighted attrs for each archetype, archW: archetype shares, res: spread around the archetype
  var POS = {
    PG: { share: 0.188, off: [3.67, 2.01], body: [74.93, 2.17, 69, 81, 191.7, 2.92, 14.1, 160, 255],
      arch: [[-18, -2, 2, 6, -2, -16, -15, 13, 16, -13, -15, -1, -17, -3, -16, 14, -12, -23, -2, 14, -11, -16], [-24, -10, -4, -3, -5, -19, -20, 9, 13, -20, -17, 24, -15, 17, -8, 21, -16, -26, -21, 4, -24, 5], [-22, -16, -12, -14, 2, -3, -17, 6, 9, 6, -7, 17, 6, 16, 4, 20, 8, -20, -18, -3, -21, 7], [-9, -15, -10, -22, 2, -27, -25, 10, 19, -22, -30, 6, -36, 10, -19, 15, -22, -35, -33, -30, 22, 7]],
      archW: [0.529, 0.267, 0.18, 0.023],
      res: [7.7, 7.1, 11.8, 12.9, 6.7, 7.3, 6.1, 8.4, 8.5, 12.8, 11.8, 12.1, 12.1, 7.6, 8.3, 6, 7.9, 8.7, 14.5, 14.4, 10.2, 13.1] },
    SG: { share: 0.247, off: [2.74, 3.93], body: [77.21, 1.41, 73, 81, 200.6, 1.67, 13.1, 160, 255],
      arch: [[-9, -4, -1, -5, 6, -9, -14, 0, 1, 0, 0, 12, -15, 12, -4, 14, -6, -12, -6, 11, -13, 3], [-15, -8, -2, -7, 4, 0, -15, -1, -1, 5, -4, 13, 12, 15, 8, 17, 7, -12, -19, 0, -17, 8], [-10, -1, 14, 1, 4, -10, -9, 12, 10, -9, -12, 1, -19, 1, -14, 16, -10, -12, -22, -5, -3, -11], [-11, 8, 14, 17, 2, -9, -12, 6, 5, -11, -12, -6, -11, -5, -13, 8, -9, -17, 2, 24, -5, -16]],
      archW: [0.178, 0.293, 0.221, 0.308],
      res: [10.2, 6.9, 12.5, 12.6, 8.9, 8.5, 7.4, 9.9, 10.6, 14.2, 14.9, 15.5, 10.5, 9.2, 7.3, 6.8, 9, 9.8, 12.1, 12.9, 11.3, 13] },
    SF: { share: 0.22, off: [0.01, 2.66], body: [79.13, 1.51, 76, 84, 213, -0.41, 14.3, 170, 255],
      arch: [[-6, -3, -1, -4, 5, 2, -9, -3, -3, 4, 0, 8, 1, 8, 1, 6, 2, -4, 0, 18, -13, 1], [-5, 7, 10, 13, 6, 0, -5, 3, 0, 6, 3, -9, -11, -4, -9, 7, -2, 5, -4, 10, -5, -14], [-12, -8, -7, -7, 3, 3, -16, -11, -10, 6, 10, 18, 7, 20, 13, 10, 6, -4, -23, -2, -19, 19], [-1, -1, 5, -5, 8, 7, -6, -3, -6, 12, 9, -13, 11, -3, 4, 3, 10, -2, -18, 4, -5, -7]],
      archW: [0.34, 0.22, 0.209, 0.23],
      res: [9.7, 6.9, 12.9, 12.5, 8.6, 8.3, 7.5, 8.4, 9.4, 13.4, 13.8, 10.9, 12.3, 6.4, 6.7, 8.4, 9.4, 9.9, 12.3, 12.8, 11.2, 11.4] },
    PF: { share: 0.18, off: [1.14, 2.51], body: [81.01, 1.43, 77, 85, 229.8, -0.36, 17.8, 180, 285],
      arch: [[-3, -9, -13, -14, 2, 10, -5, -12, -15, 16, 11, -18, 15, -10, 5, -12, 12, 7, -16, 6, -11, -8], [-11, -15, -20, -16, -3, 6, -12, -12, -13, 16, 12, 14, 14, 12, 12, 0, 10, 4, -28, -9, -17, 10], [1, 2, 15, -1, -5, 2, -6, -11, -14, 10, 3, -9, 2, -5, -1, -12, 0, 4, -21, 5, 13, -6], [-3, -1, 0, 1, 3, 9, 5, 6, 2, 2, 10, -11, -4, -9, -6, -2, 1, 14, 0, 0, -8, -17]],
      archW: [0.451, 0.296, 0.105, 0.148],
      res: [11, 6.7, 14, 11.7, 9.2, 7.5, 7.3, 9.8, 10.6, 12.3, 12.3, 13.6, 12.4, 9, 7, 9.8, 8.2, 9.7, 14.1, 16.8, 12.5, 13.5] },
    C: { share: 0.164, off: [5.18, 2.08], body: [83.19, 1.8, 79, 88, 238.9, 1.65, 18.3, 190, 305],
      arch: [[-15, -19, -24, -17, -5, 20, -4, -19, -23, 21, 13, -18, 23, -17, 4, -14, 20, 13, -32, -19, -29, -19], [1, -20, -36, -31, -1, 11, -8, -27, -29, 12, 7, -21, 15, -11, 8, -25, 12, 4, -28, -3, -12, 2], [10, -11, -33, -23, 0, 10, 2, -22, -27, 17, 11, -33, 13, -29, -3, -28, 10, 11, -21, 1, -5, -27], [-6, -9, 2, -10, -7, 10, 3, -3, -7, 13, 11, -13, -2, -11, -3, -15, 3, 17, -20, -1, -8, -12]],
      archW: [0.222, 0.479, 0.16, 0.139],
      res: [8.8, 7.3, 9.6, 11, 9.1, 6.2, 7.4, 10.1, 10.6, 8.7, 10.3, 17.1, 8.5, 9.6, 5.7, 9.4, 7, 8.5, 11.7, 13.8, 12.2, 11.3] }
  };
  // Real drafted prospects whose first NBA season came 2 or more years after the draft: 66 of 773 (8.5%).
  // Delays: 2 years 71%, 3 years 18%, 4 years 11%.
  var STASH_DELAY = [[2, 0.71], [3, 0.18], [4, 0.11]];

  // ---------------------------------------------------------------------------
  // Names, schools and clubs
  // ---------------------------------------------------------------------------
  var US_FIRST = ['Amari', 'Andre', 'Brayden', 'Brandon', 'Bryce', 'Caleb', 'Cameron', 'Carter', 'Chance', 'Colby',
    'Cole', 'Damari', 'Damon', 'Darius', 'Dashawn', 'Davion', 'Deandre', 'Demetrius', 'Desmond', 'Devin', 'Dominic',
    'Elijah', 'Emanuel', 'Ethan', 'Gavin', 'Isaiah', 'Jabril', 'Jace', 'Jaden', 'Jalen', 'Jamal', 'Jamison', 'Jaquan',
    'Jarell', 'Javon', 'Jaylen', 'Jeremiah', 'Jordan', 'Josiah', 'Julian', 'Justice', 'Kaden', 'Kalib', 'Kameron',
    'Keon', 'Kendall', 'Kendrick', 'Khalil', 'Landon', 'Lamont', 'Malachi', 'Malik', 'Marcus', 'Mekhi', 'Micah',
    'Nasir', 'Nehemiah', 'Noah', 'Omari', 'Quincy', 'Rashad', 'Reggie', 'Rodney', 'Ronnell', 'Shamar', 'Solomon',
    'Tavion', 'Terrell', 'Trey', 'Tyrese', 'Xavier', 'Brody', 'Chase', 'Conor', 'Drew', 'Grady', 'Hunter', 'Jake',
    'Luke', 'Mason', 'Owen', 'Parker', 'Tanner', 'Wyatt', 'Zach', 'Mateo', 'Adrian', 'Diego', 'Isaac', 'Ahmad',
    'Amir', 'Bryson', 'Cayden', 'Corbin', 'Dorian', 'Jaxon', 'Kyrell', 'Ladarius', 'Messiah', 'Nolan', 'Quentin',
    'Roman', 'Silas', 'Tariq', 'Ty', 'Zaire', 'Jamari', 'Keyshawn', 'Dante', 'Marquise', 'Bennett', 'Graham'];
  var US_LAST = ['Ashby', 'Bancroft', 'Barrow', 'Bolden', 'Brantley', 'Calloway', 'Carver', 'Coker', 'Councill',
    'Dorsey', 'Ealy', 'Fairley', 'Fenwick', 'Gaines', 'Gilchrist', 'Goins', 'Hargrove', 'Hatcher', 'Jefferies',
    'Kemper', 'Langston', 'Ledford', 'Lowery', 'Mabry', 'McCrae', 'McGhee', 'McKnight', 'Merritt', 'Pettaway',
    'Pickett', 'Pressley', 'Quarles', 'Ransom', 'Rollins', 'Royster', 'Sheppard', 'Singletary', 'Vance', 'Whitlock',
    'Winfield', 'Womack', 'Yarbrough', 'Abernathy', 'Alston', 'Ballard', 'Batts', 'Benford', 'Blakely', 'Boatwright',
    'Bridgeforth', 'Brockington', 'Burkes', 'Castleberry', 'Champion', 'Cherry', 'Clemons', 'Copeland', 'Covington',
    'Crumpton', 'Dabney', 'Darden', 'Easley', 'Echols', 'Faison', 'Fobbs', 'Gadsden', 'Gatling', 'Givens', 'Grubbs',
    'Hairgrove', 'Halsey', 'Hammonds', 'Hardnett', 'Hightower', 'Hinton', 'Holcomb', 'Huckaby', 'Ivory', 'Jemison',
    'Kearse', 'Kimbrough', 'Lampkin', 'Leverett', 'Lockett', 'Mapp', 'McAlister', 'McCree', 'McFadden', 'Mims',
    'Nettles', 'Oakley', 'Peoples', 'Pendleton', 'Pugh', 'Ragland', 'Redmon', 'Rountree', 'Sauls', 'Scales', 'Seabrook',
    'Shorter', 'Spikes', 'Stallworth', 'Swain', 'Tillery', 'Toomer', 'Truitt', 'Upshaw', 'Varner', 'Waddell', 'Whitsett',
    'Wigfall', 'Wimbush', 'Woodfork', 'Yancey', 'Brennan', 'Callahan', 'Donnelly', 'Eckert', 'Fitzgerald', 'Gorman',
    'Hollister', 'Kessler', 'Lindell', 'McCaffrey', 'Novak', 'Pruett', 'Ramsey', 'Schaefer', 'Thorne', 'Vogel',
    'Whitaker', 'Aguilar', 'Cardenas', 'Espinoza', 'Montoya', 'Quintero', 'Valdez'];
  var US_SUFFIX = [' Jr.', ' Jr.', ' II', ' III'];

  // Regions: first names, last names, family name first (Chinese), clubs (with the country in brackets)
  var REGIONS = {
    France: { first: ['Théo', 'Mathis', 'Yanis', 'Ibrahima', 'Mamadou', 'Enzo', 'Hugo', 'Lucas', 'Nolan', 'Sekou', 'Ilian', 'Rayan', 'Maxime', 'Alexandre', 'Adam', 'Ousmane', 'Noah', 'Bastien', 'Clément', 'Kylian', 'Amadou', 'Wilfried', 'Lenny'],
      last: ['Diakité', 'Traoré', 'Camara', 'Lefèvre', 'Moreau', 'Girard', 'Bonnet', 'Fofana', 'Sylla', 'Kanté', 'Mbaye', 'Lacombe', 'Perrin', 'Roussel', 'Chevalier', 'Delmas', 'Faure', 'Marchand', 'Doumbia', 'Konaté', 'Baldé', 'Lemoine', 'Garnier', 'Touré', 'Bakayoko'],
      clubs: ['ASVEL', 'Paris Basketball', 'Metropolitans 92', 'AS Monaco', 'Cholet Basket', 'JL Bourg', 'SIG Strasbourg', 'Nanterre 92', 'Le Mans'] },
    Spain: { first: ['Álvaro', 'Pablo', 'Sergio', 'Javier', 'Iñaki', 'Marc', 'Pol', 'Unai', 'Adrián', 'Rubén', 'Aleix', 'Hugo', 'Izan', 'Mario'],
      last: ['Ortega', 'Domínguez', 'Herrera', 'Salinas', 'Castillo', 'Vidal', 'Serra', 'Puig', 'Iglesias', 'Cabrera', 'Morales', 'Gallego', 'Aranda', 'Bermúdez'],
      clubs: ['Real Madrid', 'FC Barcelona', 'Joventut Badalona', 'Valencia Basket', 'Unicaja', 'Gran Canaria', 'Baskonia'] },
    Serbia: { first: ['Nikola', 'Stefan', 'Marko', 'Filip', 'Uroš', 'Vuk', 'Aleksa', 'Nemanja', 'Mihailo', 'Lazar', 'Dušan', 'Petar', 'Ognjen', 'Strahinja', 'Andrija'],
      last: ['Stojanović', 'Milošević', 'Pavlović', 'Ristić', 'Lazić', 'Kovačević', 'Đorđević', 'Vuković', 'Simić', 'Radović', 'Perić', 'Knežević', 'Janković', 'Milenković', 'Tomić'],
      clubs: ['Mega Basket', 'Partizan', 'Crvena Zvezda', 'FMP'] },
    Croatia: { first: ['Ivan', 'Josip', 'Ante', 'Luka', 'Matej', 'Karlo', 'Roko', 'Fran', 'Toni', 'Mislav'],
      last: ['Horvat', 'Jurić', 'Babić', 'Matić', 'Kovač', 'Marić', 'Pavić', 'Grgić', 'Šimunović', 'Vidović'],
      clubs: ['Cibona', 'KK Split', 'KK Zadar', 'Cedevita Junior'] },
    Slovenia: { first: ['Žiga', 'Jaka', 'Tilen', 'Gašper', 'Nejc', 'Rok', 'Matic', 'Urban'],
      last: ['Kos', 'Zupan', 'Novak', 'Kralj', 'Golob', 'Mlakar', 'Vidmar', 'Kovačič'],
      clubs: ['Cedevita Olimpija', 'Krka Novo Mesto'] },
    Montenegro: { first: ['Nikola', 'Vuk', 'Balša', 'Đorđije', 'Luka', 'Marko'],
      last: ['Vujošević', 'Popović', 'Radulović', 'Bulatović', 'Vukčević', 'Šćepanović'],
      clubs: ['Budućnost', 'Mornar Bar'] },
    Bosnia: { first: ['Dino', 'Mirza', 'Amar', 'Adnan', 'Kenan', 'Haris', 'Emir'],
      last: ['Hodžić', 'Mehmedović', 'Begić', 'Delić', 'Hadžić', 'Salihović', 'Bešlić'],
      clubs: ['Igokea', 'Borac Banja Luka'] },
    Lithuania: { first: ['Mantas', 'Rokas', 'Lukas', 'Deividas', 'Gytis', 'Tadas', 'Arnas', 'Ignas', 'Matas', 'Paulius', 'Nojus'],
      last: ['Kazlauskas', 'Jankauskas', 'Petrauskas', 'Vaitkus', 'Butkus', 'Balčiūnas', 'Žukauskas', 'Navickas', 'Stankevičius', 'Paulauskas'],
      clubs: ['Žalgiris', 'Rytas Vilnius', 'Lietkabelis'] },
    Latvia: { first: ['Rihards', 'Artūrs', 'Kārlis', 'Roberts', 'Dairis', 'Mareks', 'Kristers'],
      last: ['Bērziņš', 'Kalniņš', 'Ozols', 'Liepiņš', 'Krūmiņš', 'Zariņš', 'Vītols'],
      clubs: ['VEF Riga'] },
    Germany: { first: ['Jonas', 'Lukas', 'Niklas', 'Tim', 'Leon', 'Felix', 'Jannik', 'Malte', 'Johannes', 'Luis', 'Ben', 'Justus'],
      last: ['Weber', 'Schulz', 'Fischer', 'Koch', 'Richter', 'Klein', 'Wolf', 'Neumann', 'Braun', 'Zimmermann', 'Krüger', 'Hartmann', 'Lange'],
      clubs: ['Alba Berlin', 'Bayern Munich', 'Ratiopharm Ulm', 'Bamberg Baskets', 'MHP Riesen Ludwigsburg'] },
    Greece: { first: ['Giorgos', 'Dimitris', 'Nikos', 'Kostas', 'Vasilis', 'Panagiotis', 'Stavros', 'Alexandros'],
      last: ['Papadopoulos', 'Georgiou', 'Nikolaidis', 'Karagiannis', 'Vlachos', 'Dimitriou', 'Christodoulou', 'Kyriakidis'],
      clubs: ['Panathinaikos', 'Olympiacos', 'AEK Athens', 'PAOK'] },
    Turkey: { first: ['Emir', 'Kerem', 'Arda', 'Berk', 'Efe', 'Mert', 'Ömer', 'Yiğit', 'Deniz'],
      last: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Aydın', 'Öztürk', 'Arslan', 'Doğan'],
      clubs: ['Anadolu Efes', 'Fenerbahçe', 'Galatasaray', 'Darüşşafaka'] },
    Italy: { first: ['Matteo', 'Lorenzo', 'Alessandro', 'Andrea', 'Riccardo', 'Simone', 'Gabriele', 'Tommaso'],
      last: ['Ricci', 'Marino', 'Greco', 'Gallo', 'Conti', 'Esposito', 'Colombo', 'Mancini', 'Ferrara'],
      clubs: ['Olimpia Milano', 'Virtus Bologna', 'Reyer Venezia', 'Aquila Trento'] },
    Israel: { first: ['Yonatan', 'Itay', 'Noam', 'Omer', 'Ariel', 'Ido', 'Yuval'],
      last: ['Levi', 'Mizrahi', 'Peretz', 'Avraham', 'Friedman', 'Shapira', 'Golan'],
      clubs: ['Maccabi Tel Aviv', 'Hapoel Jerusalem', 'Hapoel Tel Aviv'] },
    Nigeria: { first: ['Chukwuemeka', 'Obinna', 'Chidi', 'Ifeanyi', 'Tobenna', 'Ebuka', 'Oluwaseun', 'Tunde', 'Ayodele', 'Femi', 'Chinedu', 'Uchenna', 'Somto', 'Daniel'],
      last: ['Okonkwo', 'Nwachukwu', 'Okeke', 'Adeyemi', 'Nnamdi', 'Uzoma', 'Ogunleye', 'Balogun', 'Akinola', 'Ibekwe', 'Chukwu', 'Obiora', 'Onyekachi', 'Adekunle'],
      clubs: ['NBA Academy Africa'] },
    Senegal: { first: ['Mamadou', 'Cheikh', 'Ousmane', 'Abdoulaye', 'Babacar', 'Pape', 'Moustapha', 'Serigne', 'Ibou'],
      last: ['Ndiaye', 'Diop', 'Sarr', 'Faye', 'Diouf', 'Seck', 'Cissé', 'Mbengue', 'Thiam'],
      clubs: ['NBA Academy Africa', 'SEED Academy'] },
    Mali: { first: ['Seydou', 'Moussa', 'Bakary', 'Oumar', 'Adama', 'Boubacar'],
      last: ['Keita', 'Coulibaly', 'Dembélé', 'Sangaré', 'Konaré', 'Maïga'],
      clubs: ['NBA Academy Africa'] },
    Cameroon: { first: ['Christian', 'Joël', 'Yves', 'Junior', 'Arnaud', 'Jean', 'Franck', 'Brice'],
      last: ['Mbah', 'Tchoumi', 'Nkoulou', 'Essomba', 'Fotso', 'Ngando', 'Ebanga', 'Nyobe'],
      clubs: ['NBA Academy Africa'] },
    'DR Congo': { first: ['Christian', 'Junior', 'Patrick', 'Jonathan', 'Benjamin', 'Glody'],
      last: ['Mukendi', 'Kalonji', 'Tshibangu', 'Ilunga', 'Kabongo', 'Lukusa', 'Mbuyi'],
      clubs: ['NBA Academy Africa'] },
    'South Sudan': { first: ['Deng', 'Majok', 'Garang', 'Akol', 'Manyang', 'Mabior', 'Kuany', 'Makuach'],
      last: ['Mayen', 'Akec', 'Kuol', 'Chol', 'Malual', 'Ajak', 'Thon', 'Madut'],
      clubs: ['Overtime Elite'] },
    Australia: { first: ['Jack', 'Josh', 'Liam', 'Mitchell', 'Lachlan', 'Will', 'Angus', 'Jai', 'Hamish', 'Cooper', 'Riley', 'Callum'],
      last: ['Hartley', 'McKenzie', 'Fraser', 'Gallagher', "O'Brien", 'Doyle', 'Sheridan', 'Hogan', 'Baird', 'Whitehead', 'Clarke', 'Pemberton', 'Lockyer'],
      clubs: ['Sydney Kings', 'Perth Wildcats', 'Melbourne United', 'Brisbane Bullets', 'Adelaide 36ers', 'Illawarra Hawks'] },
    'New Zealand': { first: ['Tama', 'Finn', 'Hemi', 'Sam', 'Reuben', 'Kahu'],
      last: ['Ngata', 'Walsh', 'Tipene', 'Herewini', 'Bryce', 'Tuhoe'],
      clubs: ['New Zealand Breakers'] },
    Brazil: { first: ['Gabriel', 'Rafael', 'Matheus', 'Guilherme', 'Thiago', 'Vinícius', 'Caio', 'Felipe'],
      last: ['Oliveira', 'Souza', 'Pereira', 'Almeida', 'Carvalho', 'Ribeiro', 'Nascimento', 'Teixeira'],
      clubs: ['Franca', 'Flamengo', 'Minas Tênis Clube'] },
    Argentina: { first: ['Facundo', 'Nicolás', 'Joaquín', 'Agustín', 'Santiago', 'Franco', 'Juan Ignacio'],
      last: ['Romero', 'Sosa', 'Acosta', 'Benítez', 'Medina', 'Ledesma', 'Quiroga'],
      clubs: ['San Lorenzo', 'Obras Sanitarias', 'Quimsa'] },
    Japan: { first: ['Yuto', 'Haruki', 'Kenta', 'Ren', 'Sota', 'Kaito', 'Riku', 'Daiki'],
      last: ['Suzuki', 'Takahashi', 'Kobayashi', 'Yamamoto', 'Nakamura', 'Fujimoto', 'Ishikawa', 'Mori'],
      clubs: ['Alvark Tokyo', 'Chiba Jets', 'Ryukyu Golden Kings'] },
    China: { first: ['Hao', 'Jun', 'Lei', 'Tao', 'Peng', 'Zhen', 'Yuxuan', 'Haoran'],
      last: ['Zhang', 'Liu', 'Chen', 'Zhao', 'Huang', 'Xu', 'Sun', 'Gao'], familyFirst: true,
      clubs: ['Guangdong Southern Tigers', 'Beijing Ducks', 'Liaoning Flying Leopards'] },
    'South Korea': { first: ['Ji-hoon', 'Min-jun', 'Seung-woo', 'Hyun-woo', 'Do-yun'],
      last: ['Park', 'Choi', 'Jung', 'Kang', 'Yoon'], familyFirst: true,
      clubs: ['Seoul SK Knights'] },
    Philippines: { first: ['Carl', 'Rhenz', 'Jalen', 'Kevin', 'Joshua', 'AJ'],
      last: ['Reyes', 'Bautista', 'Mendoza', 'Dizon', 'Manalo', 'Aquino'],
      clubs: ['Ateneo'] },
    Ukraine: { first: ['Oleksandr', 'Dmytro', 'Artem', 'Bohdan', 'Maksym', 'Yaroslav'],
      last: ['Kovalenko', 'Bondarenko', 'Tkachenko', 'Kravchenko', 'Melnyk', 'Savchenko'],
      clubs: ['Budivelnyk Kyiv', 'Prometey'] },
    Georgia: { first: ['Giorgi', 'Nikoloz', 'Davit', 'Levan', 'Sandro', 'Tornike'],
      last: ['Beridze', 'Kapanadze', 'Gelashvili', 'Lomidze', 'Tsiklauri', 'Kvaratskhelia'],
      clubs: ['Dinamo Tbilisi'] },
    'Dominican Republic': { first: ['José', 'Luis', 'Ángel', 'Ramón', 'Jhonny', 'Edwin', 'Yeison'],
      last: ['Peña', 'Báez', 'Rosario', 'Vásquez', 'Familia', 'Almonte', 'Tavárez'],
      clubs: ['Leones de Santo Domingo'] },
    Finland: { first: ['Eetu', 'Joonas', 'Mikael', 'Elias', 'Aleksi', 'Onni'],
      last: ['Virtanen', 'Mäkinen', 'Nieminen', 'Heikkinen', 'Laaksonen', 'Salonen'],
      clubs: ['Helsinki Seagulls', 'Kataja'] },
    Sweden: { first: ['Oskar', 'Viktor', 'Emil', 'Hampus', 'Axel'],
      last: ['Lindgren', 'Nilsson', 'Bergström', 'Sandberg', 'Ekholm'],
      clubs: ['Norrköping Dolphins'] }
  };
  // Relative country weights: about 24% of a class is international, the 2013 to 2025 NBA draft norm.
  var COUNTRIES = [['USA', 0.82], ['Canada', 0.035], ['France', 0.04], ['Serbia', 0.015], ['Croatia', 0.009],
    ['Slovenia', 0.005], ['Montenegro', 0.004], ['Bosnia', 0.004], ['Australia', 0.02], ['New Zealand', 0.003],
    ['Nigeria', 0.014], ['Germany', 0.011], ['Spain', 0.01], ['Lithuania', 0.006], ['Latvia', 0.004],
    ['Senegal', 0.008], ['Mali', 0.003], ['Cameroon', 0.007], ['DR Congo', 0.005], ['South Sudan', 0.006],
    ['Greece', 0.005], ['Turkey', 0.005], ['Italy', 0.005], ['Israel', 0.004], ['Brazil', 0.005],
    ['Argentina', 0.004], ['Japan', 0.003], ['China', 0.003], ['South Korea', 0.001], ['Philippines', 0.002],
    ['Ukraine', 0.003], ['Georgia', 0.003], ['Dominican Republic', 0.004], ['Finland', 0.003], ['Sweden', 0.002]];
  // Chance that a player from this country played US college ball (the rest come from a club or academy)
  var COLLEGE_RATE = { USA: 0.95, Canada: 0.95, Nigeria: 0.75, Senegal: 0.5, Mali: 0.4, Cameroon: 0.75,
    'DR Congo': 0.75, 'South Sudan': 0.6, Australia: 0.45, 'New Zealand': 0.5, Philippines: 0.6,
    'Dominican Republic': 0.85, Israel: 0.25, Finland: 0.3, Sweden: 0.3, Japan: 0.25 };
  var COLLEGE_RATE_DEFAULT = 0.12;
  var BIG_SCHOOLS = ['Duke', 'Kentucky', 'North Carolina', 'Kansas', 'UCLA', 'Arizona', 'Gonzaga', 'Michigan',
    'Michigan State', 'Villanova', 'Baylor', 'Houston', 'Alabama', 'Auburn', 'Arkansas', 'Tennessee', 'Texas', 'USC',
    'Oregon', 'Indiana', 'Purdue', 'Ohio State', 'Illinois', 'Connecticut', 'Florida', 'LSU', 'Louisville',
    'Syracuse', 'Virginia', 'Memphis', 'Texas Tech', 'Creighton', 'Marquette', 'Iowa State', 'Washington'];
  var OTHER_SCHOOLS = ['Wake Forest', 'Stanford', 'Xavier', 'Iowa', 'Wisconsin', 'Arizona State', 'Colorado', 'Utah',
    'Oklahoma State', 'Miami (FL)', 'Georgia Tech', 'Florida State', 'Notre Dame', 'Maryland', 'Missouri', 'NC State',
    "St. John's", 'Seton Hall', 'Dayton', 'San Diego State', "Saint Mary's", 'BYU', 'Kansas State', 'Ole Miss',
    'Mississippi State', 'South Carolina', 'Providence', 'Pittsburgh', 'Clemson', 'Vanderbilt', 'Georgia',
    'Cincinnati', 'West Virginia', 'Nebraska', 'Minnesota', 'Penn State', 'Rutgers', 'Butler', 'Georgetown',
    'Wichita State', 'VCU', 'Murray State', 'Davidson', 'Belmont', 'Weber State', 'Santa Clara', 'Charleston',
    'Oral Roberts', 'Loyola Chicago', 'UNLV', 'New Mexico', 'Boise State', 'Nevada', 'Colorado State', 'TCU',
    'Oklahoma', 'Virginia Tech', 'SMU', 'Grand Canyon', 'Utah State', 'Drake', 'Bradley', 'Furman'];
  var US_PRO_PATHS = ['Overtime Elite', 'G League', 'NBL Next Stars'];
  // Famous retired players not in the data files, so a generated name never matches one of them
  var FAMOUS = ['Michael Jordan', 'Magic Johnson', 'Larry Bird', 'Kareem Abdul-Jabbar', 'Wilt Chamberlain',
    'Bill Russell', 'Julius Erving', 'Isiah Thomas', 'Hakeem Olajuwon', 'David Robinson', 'Charles Barkley',
    'Karl Malone', 'John Stockton', 'Patrick Ewing', 'Scottie Pippen', 'Dennis Rodman', 'Clyde Drexler',
    'Reggie Miller', 'Chris Mullin', 'Dominique Wilkins', 'Moses Malone', 'Kevin McHale', 'Robert Parish',
    'James Worthy', 'Shaquille O\'Neal', 'Allen Iverson', 'Shawn Kemp', 'Gary Payton', 'Alonzo Mourning',
    'Penny Hardaway', 'Grant Hill', 'Chris Webber', 'Jason Kidd', 'Vince Carter', 'Tracy McGrady', 'Yao Ming',
    'Steve Nash', 'Dirk Nowitzki', 'Tim Duncan', 'Ben Wallace', 'Rasheed Wallace', 'Chauncey Billups',
    'Larry Johnson', 'Kevin Johnson', 'Eddie Johnson', 'Dennis Johnson', 'Marques Johnson', 'Avery Johnson',
    'Mitch Richmond', 'Tim Hardaway', 'Mark Price', 'Dale Ellis', 'Glen Rice', 'Kenny Anderson', 'Derrick Coleman',
    'Mookie Blaylock', 'Latrell Sprewell', 'Jamal Mashburn', 'Antoine Walker', 'Damon Stoudamire', 'Marcus Camby',
    'Brandon Roy', 'Greg Oden', 'Darius Miles', 'Darius Morris', 'Jalen Rose', 'Juwan Howard', 'Jamal Crawford',
    'Desmond Mason', 'Malik Sealy', 'Malik Rose', 'Reggie Lewis', 'Reggie Evans', 'Reggie Jackson', 'Marcus Fizer',
    'Quentin Richardson', 'Devin Harris', 'Devin Booker', 'Rodney Rogers', 'Rodney Stuckey', 'Terrell Brandon',
    'Isaiah Rider', 'Isaiah Thomas', 'Dante Exum', 'Xavier McDaniel', 'Xavier Henry', 'Andre Miller',
    'Andre Iguodala', 'Jordan Hill', 'Jordan Farmar', 'Owen Paul', 'Chase Budinger', 'Luke Ridnour', 'Luke Walton',
    'Mason Plumlee', 'Drew Gooden', 'Drew Barry', 'Tyrese Maxey', 'Tyrese Haliburton', 'Kendall Gill',
    'Kendrick Perkins', 'Khalil Iverson', 'Jaylen Brown', 'Jalen Green', 'Jalen Suggs', 'Cameron Payne',
    'Cameron Johnson', 'Brandon Jennings', 'Brandon Knight', 'Bryce Dejean-Jones', 'Damon Jones', 'Jamal Murray',
    'Micah Potter', 'Noah Vonleh', 'Isaac Okoro', 'Jeremiah Robinson-Earl', 'Josiah-Jordan James', 'Elijah Hughes',
    'Caleb Swanigan', 'Caleb Martin', 'Ethan Thompson', 'Amir Johnson', 'Ahmad Caver', 'Ty Lawson', 'Ty Jerome',
    'Zach LaVine', 'Zach Randolph', 'Silas Melson', 'Corbin Kaufusi', 'Quincy Pondexter', 'Quincy Acy',
    'Rashad McCants', 'Rashad Vaughn', 'Jarell Martin', 'Javon Freeman-Liberty', 'Kaden Archie', 'Jace Carter',
    'Bennett Stirtz', 'Graham Ike', 'Dante Cunningham', 'Marquise Chriss', 'Keyshawn Woods', 'Jamari Wheeler',
    'Ladarius Marshall', 'Adrian Dantley', 'Damari Monsanto', 'Darius Garland', 'Darius Bazley'];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function mulberry32(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261 >>> 0;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function gauss(rng) {
    var u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  // Standard normal CDF (Abramowitz and Stegun 7.1.26, error under 1.5e-7)
  function phi(z) {
    var x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
    var erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
  }
  function quantile(q, u) {
    u = clamp(u, 0, 1);
    for (var i = 1; i < GRID.length; i++) {
      if (u <= GRID[i]) { var f = (u - GRID[i - 1]) / (GRID[i] - GRID[i - 1]); return q[i - 1] + (q[i] - q[i - 1]) * f; }
    }
    return q[q.length - 1];
  }
  function pickWeighted(rng, pairs) {
    var tot = 0, i;
    for (i = 0; i < pairs.length; i++) tot += pairs[i][1];
    var r = rng() * tot;
    for (i = 0; i < pairs.length; i++) { r -= pairs[i][1]; if (r < 0) return pairs[i][0]; }
    return pairs[pairs.length - 1][0];
  }
  function pickOne(rng, list) { return list[Math.floor(rng() * list.length) % list.length]; }
  function weightedOvr(attrs, pos) {
    var P = root && root.PROG;
    if (P && typeof P.weightedOvr === 'function') return P.weightedOvr(attrs, pos);
    var w = POS_WEIGHTS[pos] || POS_WEIGHTS.SF, s = 0, ws = 0;
    for (var i = 0; i < ATTR_KEYS.length; i++) { var v = attrs[ATTR_KEYS[i]]; if (v == null) continue; s += w[i] * v; ws += w[i]; }
    return ws ? s / ws : 0;
  }

  var AGE_PAIRS = AGES.map(function (a, i) { return [a, AGE_N[i]]; });
  var FRINGE_POT = 74; // fringe prospects (past the real class size) come from the bottom 35% by pot

  // One draw of (age, ovr, pot): age from the real mix, then pot and ovr from a Gaussian copula
  // fitted to that age group (young players carry more upside, older ones are closer to finished).
  function drawRatings(rng, fixedAge) {
    var age = fixedAge || pickWeighted(rng, AGE_PAIRS);
    var G = AGE_GROUPS[ageGroup(age)];
    var e1 = gauss(rng), e2 = gauss(rng);
    var pot = Math.round(quantile(G.pot, phi(e1)));
    var ovr = Math.round(clamp(quantile(G.ovr, phi(G.r * e1 + Math.sqrt(1 - G.r * G.r) * e2)), OVR_MIN, OVR_MAX));
    if (pot < ovr) pot = ovr;
    return { age: age, ovr: ovr, pot: Math.min(99, pot) };
  }

  // Attributes for a position and overall: archetype shape plus the real spread, shifted so the
  // weighted attributes plus a real-like calibration offset give exactly the overall.
  function buildAttrs(pos, ovr, rng) {
    var M = POS[pos];
    var ai = pickWeighted(rng, M.archW.map(function (w, i) { return [i, w]; }));
    var arch = M.arch[ai];
    var off = M.off[0] + clamp(gauss(rng), -2.2, 2.2) * M.off[1];
    var dev = ATTR_KEYS.map(function (k, i) { return arch[i] + gauss(rng) * M.res[i]; });
    var want = ovr - off;
    function build(b, round) {
      var a = {};
      for (var i = 0; i < ATTR_KEYS.length; i++) {
        var v = clamp(b + dev[i], 25, 99);
        a[ATTR_KEYS[i]] = round ? Math.round(v) : v;
      }
      return a;
    }
    var lo = 0, hi = 140;
    for (var it = 0; it < 40; it++) {
      var mid = (lo + hi) / 2;
      if (weightedOvr(build(mid, false), pos) < want) lo = mid; else hi = mid;
    }
    return build((lo + hi) / 2, true);
  }

  function body(pos, rng) {
    var b = POS[pos].body;
    var ht = Math.round(clamp(b[0] + gauss(rng) * b[1], b[2], b[3]));
    var wt = Math.round(clamp(b[4] + b[5] * (ht - b[0]) + gauss(rng) * b[6], b[7], b[8]));
    return { ht: ht, wt: wt };
  }

  // Names already taken: real prospects, the 2012-13 league, famous retirees and anything passed in opts.used
  var baseUsed = null;
  function knownNames() {
    if (baseUsed) return baseUsed;
    var s = {};
    FAMOUS.forEach(function (n) { s[n.toLowerCase()] = true; });
    var D = root && root.DRAFTS;
    if (D) Object.keys(D).forEach(function (y) { (D[y] || []).forEach(function (p) { if (p && p.name) s[String(p.name).toLowerCase()] = true; }); });
    var L = root && root.LEAGUE_2012;
    if (L && L.players) L.players.forEach(function (p) { if (p && p.name) s[String(p.name).toLowerCase()] = true; });
    if (D || L) baseUsed = s; // cache only once the data is loaded
    return s;
  }
  function addUsed(target, used) {
    if (!used) return;
    if (Array.isArray(used)) { used.forEach(function (n) { target[String(n).toLowerCase()] = true; }); return; }
    if (used.players && typeof used.players === 'object') {
      Object.keys(used.players).forEach(function (id) { var p = used.players[id]; if (p && p.name) target[String(p.name).toLowerCase()] = true; });
      return;
    }
    Object.keys(used).forEach(function (n) { if (used[n]) target[String(n).toLowerCase()] = true; });
  }

  function makeName(country, rng, taken) {
    var reg = REGIONS[country];
    var us = !reg;
    for (var tries = 0; tries < 80; tries++) {
      var name;
      if (us) {
        name = pickOne(rng, US_FIRST) + ' ' + pickOne(rng, US_LAST);
        if (rng() < 0.035) name += pickOne(rng, US_SUFFIX);
      } else if (reg.familyFirst) name = pickOne(rng, reg.last) + ' ' + pickOne(rng, reg.first);
      else name = pickOne(rng, reg.first) + ' ' + pickOne(rng, reg.last);
      // Names that repeat a word ("Deng Deng") read like a typo
      var parts = name.split(' ');
      if (parts[0] === parts[parts.length - 1]) continue;
      if (!taken[name.toLowerCase()]) return name;
    }
    // Fallback: add a suffix until it is free
    var base = (us ? pickOne(rng, US_FIRST) + ' ' + pickOne(rng, US_LAST) : pickOne(rng, reg.first) + ' ' + pickOne(rng, reg.last));
    var sfx = [' Jr.', ' II', ' III', ' IV'];
    for (var j = 0; j < sfx.length; j++) if (!taken[(base + sfx[j]).toLowerCase()]) return base + sfx[j];
    return base + ' ' + (Math.floor(rng() * 90) + 10);
  }

  function schoolFor(country, pot, rng) {
    var rate = COLLEGE_RATE[country] != null ? COLLEGE_RATE[country] : COLLEGE_RATE_DEFAULT;
    if (rng() < rate) {
      var big = pot >= 82 ? 0.85 : pot >= 76 ? 0.55 : 0.3;
      return { college: pickOne(rng, rng() < big ? BIG_SCHOOLS : OTHER_SCHOOLS), club: false };
    }
    if (country === 'USA' || country === 'Canada') return { college: pickOne(rng, US_PRO_PATHS), club: false };
    var reg = REGIONS[country];
    return { college: pickOne(rng, reg.clubs) + ' (' + country + ')', club: true };
  }

  // ---------------------------------------------------------------------------
  // generate(year, rng, opts)
  // ---------------------------------------------------------------------------
  function generate(year, rng, opts) {
    year = +year;
    opts = opts || {};
    if (typeof rng !== 'function') rng = mulberry32(hashStr('draftgen:' + year + ':' + (rng != null ? rng : '')));
    var target = opts.size ? Math.max(1, Math.round(opts.size)) : 72 + Math.floor(rng() * 9); // 72 to 80
    var core = Math.min(target, pickOne(rng, REAL_SIZES));
    var taken = {};
    var known = knownNames();
    Object.keys(known).forEach(function (k) { taken[k] = true; });
    addUsed(taken, opts.used);

    var posPairs = POSITIONS.map(function (p) { return [p, POS[p].share]; });
    var out = [];
    for (var i = 0; i < target; i++) {
      var r = drawRatings(rng);
      // Past the real class size, the extra prospects are fringe players from the bottom of the pool
      if (i >= core) { for (var t = 0; t < 80 && r.pot > FRINGE_POT; t++) r = drawRatings(rng, r.age); }
      var pos = pickWeighted(rng, posPairs);
      var country = pickWeighted(rng, COUNTRIES);
      var name = makeName(country, rng, taken);
      taken[name.toLowerCase()] = true;
      var bd = body(pos, rng);
      var attrs = buildAttrs(pos, r.ovr, rng);
      var sch = schoolFor(country, r.pot, rng);
      // Club players sometimes stay overseas a year or more (8.5% of real drafted prospects arrived late)
      var delay = 1;
      if (sch.club && rng() < (r.ovr >= 78 ? 0.3 : 0.6)) delay = pickWeighted(rng, STASH_DELAY);
      out.push({
        id: null, name: name, team: 'DRAFT', pos: pos, age: r.age, ht: bd.ht, wt: bd.wt,
        ovr: r.ovr, pot: r.pot, nbaId: null, injury: null, attrs: attrs, stats: null, face: null,
        draftYear: year, realPick: null, arrivalYear: year + delay, undrafted: false,
        college: sch.college, country: country, fictional: true
      });
    }
    // Shuffle so the ids do not reveal the fringe prospects
    for (var j = out.length - 1; j > 0; j--) { var k = Math.floor(rng() * (j + 1)), tmp = out[j]; out[j] = out[k]; out[k] = tmp; }
    out.forEach(function (p, n) { p.id = 'gen' + year + '_' + ('00' + (n + 1)).slice(-3); });
    return out;
  }

  var DRAFTGEN = {
    generate: generate,
    ATTR_KEYS: ATTR_KEYS,
    POSITIONS: POSITIONS,
    COUNTRIES: COUNTRIES.map(function (c) { return c[0]; }),
    _resetNameCache: function () { baseUsed = null; }
  };

  if (root) root.DRAFTGEN = DRAFTGEN;
  if (typeof module !== 'undefined' && module.exports) module.exports = DRAFTGEN;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
