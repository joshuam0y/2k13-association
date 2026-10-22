/* Real personality tendencies (0 to 100) for well-known players of the 2012 to 2026 era, keyed by
   Basketball-Reference id. loyalty: stays with his team; winning: chases contenders and rings;
   money: follows the biggest offer; market: wants a big city or a specific home market; ego: wants
   the ball, the starring role and control. Built from public free agency and trade history; the
   newest draft classes are an early read of their reputations.
   window.PERSONALITY_NOTES holds a one-line reason per player (kept apart so saves stay small).
   Everyone else gets a seeded random personality when a league starts (MOOD.initPersonalities). */
(function (g) {
  g.PERSONALITIES = {
    // One-franchise icons
    duncati01: { loyalty: 99, winning: 90, money: 15, market: 5, ego: 15 },   // Tim Duncan
    nowitdi01: { loyalty: 99, winning: 80, money: 15, market: 10, ego: 20 },   // Dirk Nowitzki
    ginobma01: { loyalty: 99, winning: 85, money: 15, market: 10, ego: 20 },   // Manu Ginóbili
    parketo01: { loyalty: 90, winning: 85, money: 45, market: 30, ego: 45 },   // Tony Parker
    bryanko01: { loyalty: 97, winning: 90, money: 80, market: 75, ego: 99 },   // Kobe Bryant
    curryst01: { loyalty: 96, winning: 75, money: 45, market: 30, ego: 25 },   // Stephen Curry
    thompkl01: { loyalty: 85, winning: 75, money: 70, market: 40, ego: 40 },   // Klay Thompson
    greendr01: { loyalty: 95, winning: 85, money: 65, market: 35, ego: 85 },   // Draymond Green
    lillada01: { loyalty: 96, winning: 55, money: 55, market: 15, ego: 50 },   // Damian Lillard
    antetgi01: { loyalty: 95, winning: 88, money: 60, market: 10, ego: 40 },   // Giannis Antetokounmpo
    jokicni01: { loyalty: 92, winning: 65, money: 40, market: 5, ego: 10 },   // Nikola Jokić
    embiijo01: { loyalty: 88, winning: 70, money: 65, market: 30, ego: 75 },   // Joel Embiid
    wadedw01: { loyalty: 82, winning: 80, money: 60, market: 70, ego: 70 },   // Dwyane Wade
    westbru01: { loyalty: 80, winning: 55, money: 65, market: 30, ego: 90 },   // Russell Westbrook
    derozde01: { loyalty: 95, winning: 55, money: 65, market: 40, ego: 45 },   // DeMar DeRozan
    conlemi01: { loyalty: 90, winning: 60, money: 65, market: 20, ego: 25 },   // Mike Conley
    gasolma01: { loyalty: 88, winning: 70, money: 55, market: 20, ego: 40 },   // Marc Gasol
    randoza01: { loyalty: 85, winning: 55, money: 70, market: 20, ego: 55 },   // Zach Randolph
    middlkh01: { loyalty: 90, winning: 70, money: 60, market: 20, ego: 30 },   // Khris Middleton
    bealbr01: { loyalty: 88, winning: 45, money: 85, market: 30, ego: 50 },   // Bradley Beal
    bookede01: { loyalty: 90, winning: 65, money: 70, market: 30, ego: 65 },   // Devin Booker
    tatumja01: { loyalty: 85, winning: 75, money: 70, market: 50, ego: 55 },   // Jayson Tatum
    doncilu01: { loyalty: 82, winning: 70, money: 65, market: 40, ego: 75 },   // Luka Dončić
    gilgesh01: { loyalty: 90, winning: 75, money: 60, market: 15, ego: 40 },   // Shai Gilgeous-Alexander
    edwaran01: { loyalty: 85, winning: 75, money: 65, market: 40, ego: 70 },   // Anthony Edwards
    wembavi01: { loyalty: 85, winning: 75, money: 50, market: 20, ego: 40 },   // Victor Wembanyama
    noahjo01: { loyalty: 85, winning: 75, money: 55, market: 50, ego: 60 },   // Joakim Noah
    walljo01: { loyalty: 80, winning: 55, money: 75, market: 30, ego: 70 },   // John Wall
    rosede01: { loyalty: 85, winning: 60, money: 70, market: 50, ego: 40 },   // Derrick Rose
    piercpa01: { loyalty: 85, winning: 80, money: 50, market: 50, ego: 70 },   // Paul Pierce
    hibbero01: { loyalty: 60, winning: 55, money: 70, market: 30, ego: 50 },   // Roy Hibbert

    // Winning and control
    jamesle01: { loyalty: 30, winning: 96, money: 60, market: 80, ego: 90 },   // LeBron James
    duranke01: { loyalty: 25, winning: 94, money: 55, market: 45, ego: 70 },   // Kevin Durant
    leonaka01: { loyalty: 15, winning: 75, money: 65, market: 92, ego: 40 },   // Kawhi Leonard
    georgpa01: { loyalty: 25, winning: 70, money: 75, market: 75, ego: 65 },   // Paul George
    davisan02: { loyalty: 25, winning: 80, money: 65, market: 85, ego: 65 },   // Anthony Davis
    irvinky01: { loyalty: 10, winning: 60, money: 55, market: 70, ego: 95 },   // Kyrie Irving
    hardeja01: { loyalty: 15, winning: 78, money: 75, market: 50, ego: 88 },   // James Harden
    paulch01: { loyalty: 35, winning: 88, money: 70, market: 60, ego: 70 },   // Chris Paul
    butleji01: { loyalty: 20, winning: 92, money: 75, market: 50, ego: 88 },   // Jimmy Butler
    couside01: { loyalty: 65, winning: 80, money: 55, market: 40, ego: 92 },   // DeMarcus Cousins
    simmobe01: { loyalty: 15, winning: 50, money: 70, market: 60, ego: 75 },   // Ben Simmons
    mitchdo01: { loyalty: 45, winning: 75, money: 70, market: 60, ego: 60 },   // Donovan Mitchell
    brunsja01: { loyalty: 40, winning: 70, money: 70, market: 80, ego: 40 },   // Jalen Brunson
    howardw01: { loyalty: 10, winning: 60, money: 70, market: 82, ego: 92 },   // Dwight Howard
    loveke01: { loyalty: 40, winning: 85, money: 65, market: 60, ego: 50 },   // Kevin Love
    aldrila01: { loyalty: 30, winning: 75, money: 65, market: 55, ego: 60 },   // LaMarcus Aldridge
    boshch01: { loyalty: 70, winning: 80, money: 75, market: 70, ego: 45 },   // Chris Bosh
    willide01: { loyalty: 40, winning: 55, money: 80, market: 70, ego: 70 },   // Deron Williams
    rondora01: { loyalty: 50, winning: 70, money: 60, market: 50, ego: 85 },   // Rajon Rondo
    griffbl01: { loyalty: 60, winning: 70, money: 70, market: 70, ego: 60 },   // Blake Griffin
    haywago01: { loyalty: 35, winning: 70, money: 60, market: 50, ego: 40 },   // Gordon Hayward
    horfoal01: { loyalty: 50, winning: 80, money: 65, market: 50, ego: 30 },   // Al Horford
    lowryky01: { loyalty: 70, winning: 75, money: 65, market: 45, ego: 60 },   // Kyle Lowry
    walkeke02: { loyalty: 70, winning: 65, money: 70, market: 50, ego: 40 },   // Kemba Walker
    holidjr01: { loyalty: 55, winning: 85, money: 60, market: 30, ego: 20 },   // Jrue Holiday

    // Money and market first
    anthoca01: { loyalty: 40, winning: 50, money: 88, market: 95, ego: 82 },   // Carmelo Anthony
    smithjr01: { loyalty: 50, winning: 50, money: 70, market: 65, ego: 70 },   // J.R. Smith
    thomais02: { loyalty: 55, winning: 60, money: 85, market: 50, ego: 80 },   // Isaiah Thomas
    smithjo03: { loyalty: 40, winning: 55, money: 85, market: 50, ego: 70 },   // Josh Smith
    johnsjo02: { loyalty: 50, winning: 60, money: 85, market: 40, ego: 50 },   // Joe Johnson
    ellismo01: { loyalty: 40, winning: 50, money: 80, market: 40, ego: 70 },   // Monta Ellis
    gayru01: { loyalty: 40, winning: 50, money: 85, market: 40, ego: 55 },   // Rudy Gay
    ibakase01: { loyalty: 55, winning: 65, money: 75, market: 40, ego: 50 },   // Serge Ibaka
    bynuman01: { loyalty: 35, winning: 50, money: 80, market: 60, ego: 70 },   // Andrew Bynum

    // Ring chasers late in their careers
    allenra02: { loyalty: 20, winning: 95, money: 30, market: 50, ego: 50 },   // Ray Allen
    westda01: { loyalty: 40, winning: 98, money: 10, market: 30, ego: 30 },   // David West
    garneke01: { loyalty: 85, winning: 88, money: 45, market: 30, ego: 75 },   // Kevin Garnett
    kiddja01: { loyalty: 30, winning: 85, money: 45, market: 70, ego: 50 },   // Jason Kidd
    nashst01: { loyalty: 40, winning: 85, money: 50, market: 60, ego: 30 },   // Steve Nash
    gasolpa01: { loyalty: 50, winning: 85, money: 40, market: 60, ego: 40 },   // Pau Gasol
    battish01: { loyalty: 40, winning: 90, money: 40, market: 50, ego: 25 },   // Shane Battier
    korveky01: { loyalty: 45, winning: 85, money: 45, market: 40, ego: 20 },   // Kyle Korver
    iguodan01: { loyalty: 40, winning: 88, money: 55, market: 50, ego: 30 },   // Andre Iguodala
    cartevi01: { loyalty: 40, winning: 60, money: 30, market: 30, ego: 30 },   // Vince Carter
    chandty01: { loyalty: 45, winning: 80, money: 60, market: 50, ego: 40 },   // Tyson Chandler
    artesro01: { loyalty: 55, winning: 75, money: 45, market: 60, ego: 70 },   // Metta World Peace

    // More one-team players and hometown favorites
    collini01: { loyalty: 98, winning: 65, money: 30, market: 15, ego: 10 },   // Nick Collison
    hasleud01: { loyalty: 99, winning: 85, money: 15, market: 40, ego: 25 },   // Udonis Haslem
    varejan01: { loyalty: 88, winning: 75, money: 50, market: 25, ego: 40 },   // Anderson Varejão
    hinriki01: { loyalty: 85, winning: 60, money: 40, market: 30, ego: 30 },   // Kirk Hinrich
    allento01: { loyalty: 85, winning: 75, money: 50, market: 20, ego: 60 },   // Tony Allen
    nelsoja01: { loyalty: 85, winning: 55, money: 60, market: 30, ego: 40 },   // Jameer Nelson
    princta01: { loyalty: 78, winning: 70, money: 50, market: 30, ego: 30 },   // Tayshaun Prince
    bareajo01: { loyalty: 85, winning: 65, money: 40, market: 30, ego: 45 },   // J.J. Barea
    millspa02: { loyalty: 85, winning: 80, money: 45, market: 30, ego: 30 },   // Patty Mills
    lopezbr01: { loyalty: 82, winning: 60, money: 60, market: 35, ego: 25 },   // Brook Lopez
    gibsota01: { loyalty: 80, winning: 70, money: 55, market: 40, ego: 25 },   // Taj Gibson
    vucevni01: { loyalty: 80, winning: 55, money: 65, market: 25, ego: 35 },   // Nikola Vučević
    grangda01: { loyalty: 75, winning: 55, money: 60, market: 35, ego: 45 },   // Danny Granger
    mccolcj01: { loyalty: 85, winning: 55, money: 60, market: 30, ego: 40 },   // CJ McCollum
    adamsst01: { loyalty: 80, winning: 65, money: 55, market: 20, ego: 20 },   // Steven Adams
    smartma01: { loyalty: 85, winning: 80, money: 55, market: 35, ego: 65 },   // Marcus Smart
    inglejo01: { loyalty: 75, winning: 65, money: 50, market: 30, ego: 30 },   // Joe Ingles
    murraja01: { loyalty: 90, winning: 80, money: 60, market: 25, ego: 50 },   // Jamal Murray
    adebaba01: { loyalty: 92, winning: 80, money: 60, market: 40, ego: 40 },   // Bam Adebayo
    brownja02: { loyalty: 85, winning: 80, money: 80, market: 40, ego: 55 },   // Jaylen Brown
    herroty01: { loyalty: 82, winning: 70, money: 65, market: 50, ego: 80 },   // Tyler Herro
    halibty01: { loyalty: 85, winning: 80, money: 55, market: 25, ego: 40 },   // Tyrese Haliburton
    maxeyty01: { loyalty: 92, winning: 75, money: 60, market: 45, ego: 40 },   // Tyrese Maxey
    pritcpa01: { loyalty: 80, winning: 75, money: 50, market: 40, ego: 40 },   // Payton Pritchard
    cunnica01: { loyalty: 85, winning: 70, money: 60, market: 25, ego: 55 },   // Cade Cunningham
    mobleev01: { loyalty: 85, winning: 70, money: 60, market: 25, ego: 25 },   // Evan Mobley
    wagnefr01: { loyalty: 92, winning: 70, money: 60, market: 25, ego: 40 },   // Franz Wagner
    banchpa01: { loyalty: 82, winning: 65, money: 65, market: 30, ego: 60 },   // Paolo Banchero
    holmgch01: { loyalty: 82, winning: 75, money: 60, market: 25, ego: 45 },   // Chet Holmgren
    willija06: { loyalty: 82, winning: 75, money: 60, market: 25, ego: 40 },   // Jalen Williams
    joneshe01: { loyalty: 82, winning: 65, money: 50, market: 25, ego: 20 },   // Herbert Jones
    stewais01: { loyalty: 80, winning: 65, money: 55, market: 25, ego: 55 },   // Isaiah Stewart
    dortlu01: { loyalty: 82, winning: 65, money: 50, market: 25, ego: 40 },   // Luguentz Dort
    reidna01: { loyalty: 82, winning: 60, money: 60, market: 25, ego: 35 },   // Naz Reid
    zubaciv01: { loyalty: 85, winning: 60, money: 55, market: 35, ego: 20 },   // Ivica Zubac
    turnemy01: { loyalty: 72, winning: 60, money: 65, market: 30, ego: 35 },   // Myles Turner
    isaacjo01: { loyalty: 85, winning: 55, money: 50, market: 25, ego: 20 },   // Jonathan Isaac
    jacksja02: { loyalty: 85, winning: 65, money: 60, market: 25, ego: 40 },   // Jaren Jackson Jr.
    garlada01: { loyalty: 75, winning: 60, money: 65, market: 35, ego: 45 },   // Darius Garland
    braunch01: { loyalty: 72, winning: 75, money: 55, market: 35, ego: 30 },   // Christian Braun

    // Stars and starters who chased winning
    billuch01: { loyalty: 50, winning: 75, money: 50, market: 55, ego: 55 },   // Chauncey Billups
    mariosh01: { loyalty: 50, winning: 85, money: 50, market: 40, ego: 40 },   // Shawn Marion
    butleca01: { loyalty: 45, winning: 75, money: 55, market: 50, ego: 45 },   // Caron Butler
    jamisan01: { loyalty: 40, winning: 80, money: 40, market: 50, ego: 45 },   // Antawn Jamison
    hillgr01: { loyalty: 50, winning: 70, money: 40, market: 45, ego: 30 },   // Grant Hill
    brandel01: { loyalty: 55, winning: 75, money: 40, market: 40, ego: 35 },   // Elton Brand
    terryja01: { loyalty: 40, winning: 80, money: 50, market: 55, ego: 75 },   // Jason Terry
    millemi01: { loyalty: 40, winning: 85, money: 40, market: 40, ego: 30 },   // Mike Miller
    lewisra02: { loyalty: 40, winning: 85, money: 40, market: 40, ego: 35 },   // Rashard Lewis
    anderch01: { loyalty: 40, winning: 80, money: 40, market: 40, ego: 60 },   // Chris Andersen
    onealje01: { loyalty: 40, winning: 80, money: 45, market: 45, ego: 55 },   // Jermaine O'Neal
    jefferi01: { loyalty: 40, winning: 80, money: 40, market: 50, ego: 45 },   // Richard Jefferson
    cambyma01: { loyalty: 35, winning: 80, money: 40, market: 40, ego: 30 },   // Marcus Camby
    pachuza01: { loyalty: 50, winning: 85, money: 45, market: 35, ego: 40 },   // Zaza Pachulia
    leeda02: { loyalty: 55, winning: 70, money: 65, market: 50, ego: 55 },   // David Lee
    millspa01: { loyalty: 55, winning: 75, money: 70, market: 35, ego: 35 },   // Paul Millsap
    greenda02: { loyalty: 55, winning: 85, money: 55, market: 35, ego: 20 },   // Danny Green
    tuckepj01: { loyalty: 40, winning: 88, money: 60, market: 40, ego: 55 },   // P.J. Tucker
    mcgeeja01: { loyalty: 40, winning: 85, money: 50, market: 50, ego: 55 },   // JaVale McGee
    kirilan01: { loyalty: 45, winning: 70, money: 50, market: 50, ego: 40 },   // Andrei Kirilenko
    beverpa01: { loyalty: 45, winning: 75, money: 60, market: 45, ego: 85 },   // Patrick Beverley
    crowdja01: { loyalty: 35, winning: 78, money: 60, market: 40, ego: 60 },   // Jae Crowder
    perkike01: { loyalty: 60, winning: 75, money: 50, market: 35, ego: 70 },   // Kendrick Perkins
    carusal01: { loyalty: 65, winning: 85, money: 55, market: 40, ego: 25 },   // Alex Caruso
    brownbr01: { loyalty: 35, winning: 75, money: 65, market: 40, ego: 40 },   // Bruce Brown
    whitede01: { loyalty: 75, winning: 85, money: 55, market: 35, ego: 20 },   // Derrick White
    hartjo01: { loyalty: 60, winning: 80, money: 60, market: 55, ego: 45 },   // Josh Hart
    bridgmi01: { loyalty: 60, winning: 70, money: 65, market: 60, ego: 35 },   // Mikal Bridges
    divindo01: { loyalty: 45, winning: 65, money: 70, market: 50, ego: 40 },   // Donte DiVincenzo
    anunoog01: { loyalty: 60, winning: 65, money: 70, market: 45, ego: 25 },   // OG Anunoby
    siakapa01: { loyalty: 70, winning: 70, money: 70, market: 35, ego: 45 },   // Pascal Siakam
    gordoaa01: { loyalty: 60, winning: 75, money: 60, market: 35, ego: 45 },   // Aaron Gordon
    capelca01: { loyalty: 55, winning: 65, money: 70, market: 35, ego: 40 },   // Clint Capela
    allenja01: { loyalty: 70, winning: 60, money: 65, market: 35, ego: 30 },   // Jarrett Allen
    favorde01: { loyalty: 70, winning: 55, money: 65, market: 25, ego: 35 },   // Derrick Favors
    denglu01: { loyalty: 70, winning: 65, money: 65, market: 40, ego: 30 },   // Luol Deng

    // Money and the biggest offer
    monrogr01: { loyalty: 45, winning: 45, money: 85, market: 15, ego: 45 },   // Greg Monroe
    jeffeal01: { loyalty: 50, winning: 50, money: 80, market: 25, ego: 55 },   // Al Jefferson
    gordoer01: { loyalty: 40, winning: 55, money: 85, market: 55, ego: 60 },   // Eric Gordon
    stoudam01: { loyalty: 50, winning: 60, money: 80, market: 70, ego: 70 },   // Amar'e Stoudemire
    boozeca01: { loyalty: 30, winning: 60, money: 85, market: 55, ego: 60 },   // Carlos Boozer
    jennibr01: { loyalty: 35, winning: 45, money: 80, market: 60, ego: 75 },   // Brandon Jennings
    evansty01: { loyalty: 45, winning: 50, money: 75, market: 40, ego: 65 },   // Tyreke Evans
    martike02: { loyalty: 30, winning: 55, money: 75, market: 40, ego: 55 },   // Kevin Martin
    blatcan01: { loyalty: 40, winning: 45, money: 75, market: 45, ego: 70 },   // Andray Blatche
    mayooj01: { loyalty: 40, winning: 45, money: 75, market: 45, ego: 60 },   // O.J. Mayo
    gordobe01: { loyalty: 35, winning: 45, money: 80, market: 40, ego: 60 },   // Ben Gordon
    arenagi01: { loyalty: 40, winning: 40, money: 80, market: 50, ego: 92 },   // Gilbert Arenas
    batumni01: { loyalty: 75, winning: 55, money: 75, market: 40, ego: 35 },   // Nicolas Batum
    parsoch01: { loyalty: 40, winning: 55, money: 85, market: 65, ego: 55 },   // Chandler Parsons
    biyombi01: { loyalty: 40, winning: 50, money: 90, market: 35, ego: 40 },   // Bismack Biyombo
    harrito02: { loyalty: 45, winning: 60, money: 85, market: 40, ego: 45 },   // Tobias Harris
    drumman01: { loyalty: 50, winning: 50, money: 85, market: 40, ego: 65 },   // Andre Drummond
    thomptr01: { loyalty: 65, winning: 75, money: 85, market: 40, ego: 40 },   // Tristan Thompson
    bledser01: { loyalty: 45, winning: 50, money: 85, market: 40, ego: 60 },   // Eric Bledsoe
    jacksre01: { loyalty: 40, winning: 50, money: 75, market: 40, ego: 75 },   // Reggie Jackson
    kanteen01: { loyalty: 35, winning: 55, money: 70, market: 55, ego: 70 },   // Enes Freedom
    waitedi01: { loyalty: 35, winning: 50, money: 75, market: 45, ego: 95 },   // Dion Waiters
    youngni01: { loyalty: 40, winning: 60, money: 65, market: 70, ego: 85 },   // Nick Young
    stephla01: { loyalty: 50, winning: 55, money: 70, market: 40, ego: 85 },   // Lance Stephenson
    turneev01: { loyalty: 50, winning: 45, money: 75, market: 40, ego: 60 },   // Evan Turner
    bargnan01: { loyalty: 50, winning: 45, money: 75, market: 55, ego: 50 },   // Andrea Bargnani
    asikom01: { loyalty: 55, winning: 55, money: 75, market: 35, ego: 25 },   // Ömer Aşık
    mozgoti01: { loyalty: 50, winning: 55, money: 85, market: 40, ego: 30 },   // Timofey Mozgov
    clarkjo01: { loyalty: 55, winning: 55, money: 70, market: 40, ego: 60 },   // Jordan Clarkson
    grantje01: { loyalty: 50, winning: 50, money: 80, market: 40, ego: 45 },   // Jerami Grant
    lavinza01: { loyalty: 55, winning: 50, money: 85, market: 45, ego: 60 },   // Zach LaVine
    randlju01: { loyalty: 55, winning: 55, money: 80, market: 60, ego: 65 },   // Julius Randle
    roziete01: { loyalty: 50, winning: 55, money: 75, market: 45, ego: 55 },   // Terry Rozier
    schrode01: { loyalty: 35, winning: 55, money: 80, market: 40, ego: 80 },   // Dennis Schröder
    brogdma01: { loyalty: 45, winning: 60, money: 80, market: 40, ego: 40 },   // Malcolm Brogdon
    vanvlfr01: { loyalty: 70, winning: 70, money: 80, market: 40, ego: 55 },   // Fred VanVleet
    sabondo01: { loyalty: 70, winning: 60, money: 75, market: 30, ego: 45 },   // Domantas Sabonis
    murrade01: { loyalty: 50, winning: 60, money: 80, market: 45, ego: 60 },   // Dejounte Murray
    harteis01: { loyalty: 40, winning: 65, money: 85, market: 40, ego: 35 },   // Isaiah Hartenstein
    kuzmaky01: { loyalty: 50, winning: 60, money: 75, market: 55, ego: 65 },   // Kyle Kuzma
    poolejo01: { loyalty: 50, winning: 50, money: 80, market: 45, ego: 80 },   // Jordan Poole
    kuminjo01: { loyalty: 40, winning: 50, money: 80, market: 40, ego: 70 },   // Jonathan Kuminga
    thomaca02: { loyalty: 40, winning: 40, money: 80, market: 45, ego: 92 },   // Cam Thomas
    sextoco01: { loyalty: 45, winning: 50, money: 75, market: 40, ego: 70 },   // Collin Sexton
    aytonde01: { loyalty: 35, winning: 50, money: 80, market: 40, ego: 55 },   // Deandre Ayton
    porteke02: { loyalty: 30, winning: 45, money: 70, market: 40, ego: 80 },   // Kevin Porter Jr.

    // Market and the bright lights
    linje01: { loyalty: 40, winning: 55, money: 70, market: 65, ego: 40 },   // Jeremy Lin
    odomla01: { loyalty: 40, winning: 70, money: 55, market: 75, ego: 45 },   // Lamar Odom
    davisba01: { loyalty: 40, winning: 60, money: 65, market: 70, ego: 70 },   // Baron Davis
    barnema02: { loyalty: 40, winning: 70, money: 55, market: 50, ego: 75 },   // Matt Barnes
    crawfja01: { loyalty: 40, winning: 55, money: 70, market: 60, ego: 70 },   // Jamal Crawford
    jordade01: { loyalty: 50, winning: 60, money: 65, market: 60, ego: 45 },   // DeAndre Jordan
    porzikr01: { loyalty: 40, winning: 60, money: 70, market: 55, ego: 55 },   // Kristaps Porziņģis
    russeda01: { loyalty: 35, winning: 55, money: 75, market: 55, ego: 70 },   // D'Angelo Russell
    reaveau01: { loyalty: 65, winning: 65, money: 75, market: 65, ego: 40 },   // Austin Reaves
    barrerj01: { loyalty: 60, winning: 55, money: 70, market: 60, ego: 50 },   // RJ Barrett
    hachiru01: { loyalty: 50, winning: 60, money: 65, market: 55, ego: 40 },   // Rui Hachimura
    balllo01: { loyalty: 55, winning: 60, money: 65, market: 55, ego: 35 },   // Lonzo Ball
    greenja05: { loyalty: 50, winning: 50, money: 75, market: 50, ego: 75 },   // Jalen Green
    willizi01: { loyalty: 50, winning: 55, money: 70, market: 55, ego: 70 },   // Zion Williamson
    baileac01: { loyalty: 40, winning: 50, money: 65, market: 55, ego: 70 },   // Ace Bailey
    robinmi01: { loyalty: 70, winning: 55, money: 60, market: 50, ego: 30 },   // Mitchell Robinson
    quickim01: { loyalty: 55, winning: 55, money: 75, market: 45, ego: 45 },   // Immanuel Quickley
    toppiob01: { loyalty: 55, winning: 55, money: 55, market: 50, ego: 35 },   // Obi Toppin
    wiggian01: { loyalty: 65, winning: 60, money: 70, market: 35, ego: 35 },   // Andrew Wiggins
    dragigo01: { loyalty: 55, winning: 65, money: 70, market: 55, ego: 55 },   // Goran Dragić

    // Ego, control and the ball
    jacksst02: { loyalty: 30, winning: 65, money: 60, market: 45, ego: 80 },   // Stephen Jackson
    robinna01: { loyalty: 35, winning: 50, money: 60, market: 50, ego: 85 },   // Nate Robinson
    beaslmi01: { loyalty: 30, winning: 45, money: 70, market: 50, ego: 70 },   // Michael Beasley
    willilo02: { loyalty: 40, winning: 55, money: 70, market: 55, ego: 60 },   // Lou Williams
    moranja01: { loyalty: 75, winning: 65, money: 65, market: 25, ego: 85 },   // Ja Morant
    youngtr01: { loyalty: 75, winning: 60, money: 70, market: 45, ego: 85 },   // Trae Young
    ballla01: { loyalty: 70, winning: 55, money: 70, market: 45, ego: 75 },   // LaMelo Ball
    brookdi01: { loyalty: 50, winning: 65, money: 70, market: 40, ego: 85 },   // Dillon Brooks
    allengr01: { loyalty: 50, winning: 65, money: 60, market: 35, ego: 60 },   // Grayson Allen
    morrima03: { loyalty: 40, winning: 65, money: 70, market: 50, ego: 70 },   // Marcus Morris
    morrima02: { loyalty: 40, winning: 65, money: 65, market: 40, ego: 70 },   // Markieff Morris
    riverau01: { loyalty: 40, winning: 55, money: 65, market: 45, ego: 60 },   // Austin Rivers
    sengual01: { loyalty: 80, winning: 60, money: 65, market: 30, ego: 65 },   // Alperen Şengün
    townska01: { loyalty: 75, winning: 65, money: 70, market: 50, ego: 55 },   // Karl-Anthony Towns
    ingrabr01: { loyalty: 55, winning: 55, money: 80, market: 40, ego: 55 },   // Brandon Ingram
    portemi01: { loyalty: 60, winning: 65, money: 70, market: 40, ego: 60 },   // Michael Porter Jr.
    bridgmi02: { loyalty: 55, winning: 50, money: 70, market: 35, ego: 55 },   // Miles Bridges
    oladivi01: { loyalty: 60, winning: 55, money: 70, market: 50, ego: 55 },   // Victor Oladipo
    hendesc01: { loyalty: 60, winning: 55, money: 65, market: 35, ego: 60 },   // Scoot Henderson
    suggsja01: { loyalty: 70, winning: 65, money: 60, market: 30, ego: 55 },   // Jalen Suggs
    foxde01: { loyalty: 40, winning: 60, money: 70, market: 50, ego: 55 },   // De'Aaron Fox
    giddejo01: { loyalty: 50, winning: 55, money: 70, market: 40, ego: 55 },   // Josh Giddey

    // Role players and steady pros
    shumpim01: { loyalty: 50, winning: 70, money: 65, market: 55, ego: 45 },   // Iman Shumpert
    roybr01: { loyalty: 80, winning: 60, money: 40, market: 30, ego: 40 },   // Brandon Roy
    bradlav01: { loyalty: 65, winning: 60, money: 65, market: 35, ego: 30 },   // Avery Bradley
    bogutan01: { loyalty: 55, winning: 75, money: 60, market: 40, ego: 45 },   // Andrew Bogut
    rubiori01: { loyalty: 60, winning: 55, money: 60, market: 45, ego: 40 },   // Ricky Rubio
    greenje02: { loyalty: 30, winning: 65, money: 65, market: 40, ego: 35 },   // Jeff Green
    matthwe02: { loyalty: 50, winning: 55, money: 70, market: 35, ego: 40 },   // Wesley Matthews
    redicjj01: { loyalty: 45, winning: 75, money: 65, market: 60, ego: 45 },   // JJ Redick
    arizatr01: { loyalty: 40, winning: 70, money: 70, market: 45, ego: 35 },   // Trevor Ariza
    diawbo01: { loyalty: 50, winning: 70, money: 45, market: 40, ego: 30 },   // Boris Diaw
    chalmma01: { loyalty: 60, winning: 70, money: 55, market: 45, ego: 60 },   // Mario Chalmers
    sandela01: { loyalty: 30, winning: 35, money: 75, market: 30, ego: 50 },   // Larry Sanders
    carrode01: { loyalty: 40, winning: 60, money: 75, market: 40, ego: 40 },   // DeMarre Carroll
    teaguje01: { loyalty: 50, winning: 55, money: 70, market: 40, ego: 45 },   // Jeff Teague
    gallida01: { loyalty: 45, winning: 60, money: 75, market: 45, ego: 50 },   // Danilo Gallinari
    fredeji01: { loyalty: 50, winning: 45, money: 60, market: 50, ego: 50 },   // Jimmer Fredette
    hillge01: { loyalty: 50, winning: 65, money: 70, market: 45, ego: 30 },   // George Hill
    bartowi01: { loyalty: 65, winning: 50, money: 65, market: 30, ego: 50 },   // Will Barton
    barneha02: { loyalty: 55, winning: 70, money: 70, market: 40, ego: 40 },   // Harrison Barnes
    cartemi01: { loyalty: 40, winning: 50, money: 60, market: 40, ego: 55 },   // Michael Carter-Williams
    noelne01: { loyalty: 30, winning: 45, money: 85, market: 40, ego: 55 },   // Nerlens Noel
    porteot01: { loyalty: 55, winning: 65, money: 70, market: 40, ego: 30 },   // Otto Porter Jr.
    goberru01: { loyalty: 75, winning: 65, money: 70, market: 20, ego: 55 },   // Rudy Gobert
    parkeja01: { loyalty: 40, winning: 45, money: 70, market: 50, ego: 50 },   // Jabari Parker
    bogdabo01: { loyalty: 50, winning: 60, money: 75, market: 40, ego: 40 },   // Bogdan Bogdanović
    dinwisp01: { loyalty: 40, winning: 55, money: 75, market: 45, ego: 65 },   // Spencer Dinwiddie
    portibo01: { loyalty: 65, winning: 70, money: 60, market: 35, ego: 50 },   // Bobby Portis
    powelno01: { loyalty: 60, winning: 60, money: 70, market: 55, ego: 40 },   // Norman Powell
    hieldbu01: { loyalty: 45, winning: 55, money: 75, market: 40, ego: 45 },   // Buddy Hield
    fultzma01: { loyalty: 55, winning: 45, money: 60, market: 35, ego: 30 },   // Markelle Fultz
    markkla01: { loyalty: 70, winning: 55, money: 75, market: 35, ego: 35 },   // Lauri Markkanen
    collijo01: { loyalty: 50, winning: 50, money: 75, market: 40, ego: 55 },   // John Collins
    williro04: { loyalty: 60, winning: 60, money: 55, market: 30, ego: 30 },   // Robert Williams
    baglema01: { loyalty: 40, winning: 45, money: 65, market: 40, ego: 55 },   // Marvin Bagley III
    avdijde01: { loyalty: 55, winning: 65, money: 65, market: 40, ego: 45 },   // Deni Avdija
    banede01: { loyalty: 70, winning: 65, money: 65, market: 30, ego: 45 },   // Desmond Bane
    barnesc01: { loyalty: 80, winning: 65, money: 65, market: 35, ego: 55 },   // Scottie Barnes
    grimequ01: { loyalty: 40, winning: 55, money: 70, market: 40, ego: 50 },   // Quentin Grimes
    daniedy01: { loyalty: 60, winning: 65, money: 60, market: 30, ego: 30 },   // Dyson Daniels
    durenja01: { loyalty: 65, winning: 55, money: 70, market: 35, ego: 50 },   // Jalen Duren

    // Recent draft classes (early read)
    millebr02: { loyalty: 70, winning: 60, money: 65, market: 30, ego: 50 },   // Brandon Miller
    thompam01: { loyalty: 70, winning: 65, money: 65, market: 35, ego: 55 },   // Amen Thompson
    thompau01: { loyalty: 70, winning: 65, money: 60, market: 30, ego: 45 },   // Ausar Thompson
    coulibi01: { loyalty: 65, winning: 60, money: 60, market: 30, ego: 30 },   // Bilal Coulibaly
    livelde01: { loyalty: 75, winning: 70, money: 55, market: 35, ego: 40 },   // Dereck Lively II
    jaqueja01: { loyalty: 70, winning: 70, money: 60, market: 40, ego: 40 },   // Jaime Jaquez Jr.
    risacza01: { loyalty: 65, winning: 60, money: 60, market: 30, ego: 35 },   // Zaccharie Risacher
    sarral01: { loyalty: 65, winning: 55, money: 60, market: 30, ego: 40 },   // Alex Sarr
    sheppre01: { loyalty: 75, winning: 60, money: 55, market: 30, ego: 30 },   // Reed Sheppard
    castlst01: { loyalty: 70, winning: 75, money: 60, market: 30, ego: 50 },   // Stephon Castle
    edeyza01: { loyalty: 70, winning: 60, money: 55, market: 25, ego: 40 },   // Zach Edey
    clingdo01: { loyalty: 70, winning: 60, money: 55, market: 25, ego: 30 },   // Donovan Clingan
    buzelma01: { loyalty: 75, winning: 55, money: 60, market: 40, ego: 50 },   // Matas Buzelis
    mccaija01: { loyalty: 65, winning: 60, money: 60, market: 45, ego: 50 },   // Jared McCain
    flaggco01: { loyalty: 75, winning: 75, money: 60, market: 35, ego: 40 },   // Cooper Flagg
    harpedy01: { loyalty: 70, winning: 70, money: 60, market: 40, ego: 45 },   // Dylan Harper
    edgecvj01: { loyalty: 70, winning: 65, money: 60, market: 40, ego: 50 },   // VJ Edgecombe
    knuepko01: { loyalty: 70, winning: 65, money: 55, market: 30, ego: 30 },   // Kon Knueppel
    dybanaj01: { loyalty: 60, winning: 60, money: 65, market: 45, ego: 55 },   // AJ Dybantsa
    peterda02: { loyalty: 60, winning: 60, money: 65, market: 40, ego: 55 },   // Darryn Peterson
    boozeca02: { loyalty: 65, winning: 65, money: 60, market: 40, ego: 45 }   // Cameron Boozer
  };
  g.PERSONALITY_NOTES = {
    duncati01: 'Spent all 19 seasons in San Antonio, took pay cuts to keep the core together',
    nowitdi01: 'Spent all 21 seasons in Dallas, took discounts to help the roster',
    ginobma01: 'One franchise for 16 seasons, took less to stay a Spur',
    parketo01: 'Seventeen seasons in San Antonio before a final year in Charlotte',
    bryanko01: 'Twenty years a Laker, signed a huge extension in 2013',
    curryst01: 'Never left Golden State, signed a team friendly deal in 2013',
    thompkl01: 'Long Warriors run before leaving for Dallas in 2024',
    greendr01: 'Warriors lifer and enforcer, wants the respect of a star',
    lillada01: 'Turned down every exit for 11 years in Portland, said he wanted to win there',
    antetgi01: 'Signed the supermax with Milwaukee and won the 2021 title there',
    jokicni01: 'Low ego Denver lifer, loves the quiet of a small market',
    embiijo01: 'Stayed with Philadelphia through the Process and beyond',
    wadedw01: 'Took less to build the Big Three, left Miami over money in 2016, came back',
    westbru01: 'Re-signed in OKC after Durant left, later bounced around',
    derozde01: 'Said I am Toronto, re-signed without visiting anyone else',
    conlemi01: 'Spent 12 seasons in Memphis before a trade',
    gasolma01: 'Memphis lifer until the 2019 trade to Toronto',
    randoza01: 'Became the face of grit and grind in Memphis',
    middlkh01: 'Re-signed with Milwaukee twice and won a title',
    bealbr01: 'Stayed in Washington on a no-trade supermax',
    bookede01: 'Stayed with Phoenix through lean years',
    tatumja01: 'Signed the supermax in Boston, won the 2024 title',
    doncilu01: 'Wanted to stay in Dallas, was shockingly traded to the Lakers',
    gilgesh01: 'Happy in OKC, signed a long extension, 2025 MVP and champion',
    edwaran01: 'Signed the max with Minnesota, wants to be the guy',
    wembavi01: 'French phenom, committed to building in San Antonio',
    noahjo01: 'Heart of the Thibodeau Bulls before chasing money in New York',
    walljo01: 'Signed a supermax to stay in Washington',
    rosede01: 'Chicago native and hometown MVP',
    piercpa01: 'Fifteen seasons in Boston, cried when traded',
    hibbero01: 'Indiana center who faded fast after the 2014 run',
    jamesle01: 'The Decision, back to Cleveland, then the Lakers, always on short deals',
    duranke01: 'Left OKC for a Warriors team that had just beaten him, later asked out of Brooklyn and Phoenix',
    leonaka01: 'Quiet, forced his way out of San Antonio and went home to Los Angeles',
    georgpa01: 'Requested trades from Indiana and OKC, wanted to play near home in LA',
    davisan02: 'Forced a trade from New Orleans to the Lakers',
    irvinky01: 'Asked out of LeBrons shadow in Cleveland, left Boston, forced out of Brooklyn',
    hardeja01: 'Forced exits from Houston, Brooklyn and Philadelphia',
    paulch01: 'Forced a trade out of New Orleans, moved often chasing a ring',
    butleji01: 'Ultra competitive, wore out his welcome in Chicago, Minnesota, Philadelphia and Miami',
    couside01: 'Took a cheap one year deal with the champion Warriors',
    simmobe01: 'Refused to play for Philadelphia after the 2021 playoffs',
    mitchdo01: 'Wanted a bigger market than Utah, landed in Cleveland',
    brunsja01: 'Left Dallas for New York and took a discount there',
    howardw01: 'Forced out of Orlando, left the Lakers for Houston after one season',
    loveke01: 'Forced his way out of Minnesota to chase a ring',
    aldrila01: 'Left Portland for San Antonio in 2015',
    boshch01: 'Left Toronto to join the Heat Big Three, took the max to stay',
    willide01: 'Chose Brooklyn money and market, struggled with the spotlight',
    rondora01: 'Brilliant and stubborn, clashed with coaches',
    griffbl01: 'Re-signed with the Clippers in 2017, traded six months later',
    haywago01: 'Left Utah for Boston to win, then signed big in Charlotte',
    horfoal01: 'Left Atlanta for Boston and a contender',
    lowryky01: 'Re-signed in Toronto and won the 2019 title',
    walkeke02: 'Charlotte loyalist who left when the supermax never came',
    holidjr01: 'Selfless winner, two titles as a role star',
    anthoca01: 'Forced his way to New York, then took the max to stay',
    smithjr01: 'Gunner who followed LeBron to titles',
    thomais02: 'Wanted a max deal badly, chip on his shoulder',
    smithjo03: 'Took big money in Detroit and fell out of favor fast',
    johnsjo02: 'Iso Joe, took the max in Atlanta and Brooklyn',
    ellismo01: 'Volume scorer who chased the biggest offer',
    gayru01: 'Opted out of bigger money more than once',
    ibakase01: 'Followed the money after leaving OKC',
    bynuman01: 'Talented center with motivation questions',
    allenra02: 'Left Boston for Miami and a ring in 2012',
    westda01: 'Left $12M on the table to join the Spurs',
    garneke01: 'Intense, waived his no-trade only for Boston and Brooklyn',
    kiddja01: 'Moved for contenders late in his career',
    nashst01: 'Chose the Lakers late to chase a ring',
    gasolpa01: 'Joined San Antonio late for another shot at a title',
    battish01: 'Ultimate glue guy, signed with Miami to win',
    korveky01: 'Sharpshooter who followed contenders',
    iguodan01: 'Took his talents to Golden State for a ring',
    cartevi01: 'Played 22 seasons for anyone who would have him',
    chandty01: 'Defensive anchor who moved for contenders',
    artesro01: 'Unpredictable, loves the Los Angeles spotlight',
    collini01: 'Spent all 14 seasons with the Sonics and Thunder',
    hasleud01: 'Miami native, 20 seasons with the Heat on minimum deals',
    varejan01: 'Cleveland fan favorite for 12 seasons',
    hinriki01: 'Came back to Chicago at a discount',
    allento01: 'Grit and grind heart of Memphis',
    nelsoja01: 'Ten years in Orlando, mentor to young guards',
    princta01: 'Pistons lifer until the 2013 trade',
    bareajo01: 'Came back to Dallas after his Minnesota detour',
    millspa02: 'Re-signed with San Antonio for a decade',
    lopezbr01: 'Nine years in Brooklyn, then a long Milwaukee run',
    gibsota01: 'Chicago favorite who followed Thibodeau everywhere',
    vucevni01: 'Ten seasons in Orlando, rarely complained',
    grangda01: 'Indiana star until injuries took over',
    mccolcj01: 'Stayed loyal to Portland beside Lillard',
    adamsst01: 'Low maintenance Kiwi enforcer',
    smartma01: 'Celtic to the core, crushed when traded',
    inglejo01: 'Long Utah run, wanted to retire a Jazz',
    murraja01: 'Denver lifer and Jokic partner',
    adebaba01: 'Heat culture lifer',
    brownja02: 'Signed the then record supermax with Boston',
    herroty01: 'Heat loyalist who wants a bigger role',
    halibty01: 'Embraced Indiana and the small market',
    maxeyty01: 'Took less than the max to help Philadelphia',
    pritcpa01: 'Happy in Boston, won 6MOY in 2025',
    cunnica01: 'Franchise player in Detroit, signed the max early',
    mobleev01: 'Quiet Cleveland cornerstone',
    wagnefr01: 'Loves Orlando, plays with his brother Moritz',
    banchpa01: 'Face of the Magic',
    holmgch01: 'Bought into the OKC plan',
    willija06: 'Signed the extension in OKC, 2025 champion',
    joneshe01: 'Low ego Pelicans stopper',
    stewais01: 'Detroit enforcer, loyal to the Pistons',
    dortlu01: 'Undrafted Thunder defender who stuck',
    reidna01: 'Undrafted, re-signed in Minnesota twice',
    zubaciv01: 'Signed team friendly deals with the Clippers',
    turnemy01: 'Ten years in Indiana, left for Milwaukee in 2025',
    isaacjo01: 'Stayed in Orlando through years of injuries',
    jacksja02: 'Memphis core piece, signed long extensions',
    garlada01: 'Cleveland guard on a long max deal',
    braunch01: 'Champion role player in Denver',
    billuch01: 'Mr. Big Shot, went home to Detroit for one last run',
    mariosh01: 'Chased one last title with LeBron in Cleveland',
    butleca01: 'Moved around chasing contenders late',
    jamisan01: 'Took the minimum to join Kobe and Nash',
    hillgr01: 'Classy veteran, chose the Clippers to compete',
    brandel01: 'Veteran mentor who went where he could win',
    terryja01: 'Tattooed the trophy before winning it, followed contenders',
    millemi01: 'Chased rings with LeBron',
    lewisra02: 'Took the minimum in Miami',
    anderch01: 'Birdman, signed cheap to win in Miami',
    onealje01: 'Veteran big who chased one more run',
    jefferi01: 'Took the minimum and won in Cleveland',
    cambyma01: 'Late career ring chaser',
    pachuza01: 'Took a discount with the champion Warriors',
    leeda02: 'Accepted a bench role for a title',
    millspa01: 'Picked Atlanta, then Denver, for good teams',
    greenda02: 'Three titles with three teams',
    tuckepj01: 'Gritty vet who always found a contender',
    mcgeeja01: 'Reinvented himself as a champion role player',
    kirilan01: 'Took a discount to join Brooklyn',
    beverpa01: 'Pest who talks a lot and plays hard everywhere',
    crowdja01: 'Role player who kept landing on contenders',
    perkike01: 'Tough guy who followed winning teams',
    carusal01: 'Selfless defender who wants to win',
    brownbr01: 'Left Brooklyn and won a title in Denver',
    whitede01: 'Selfless winner, champion in Boston',
    hartjo01: 'Hustle guy who took a discount to reunite in New York',
    bridgmi01: 'Never missed a game, joined his Villanova friends in New York',
    divindo01: 'Champion bench guard, chose New York',
    anunoog01: 'Quiet two way wing who rarely speaks up',
    siakapa01: 'Late bloomer, champion in Toronto',
    gordoaa01: 'Asked out of Orlando, thrived as a role player in Denver',
    capelca01: 'Rim runner who followed the money to Atlanta',
    allenja01: 'Low ego center, stayed in Cleveland',
    favorde01: 'Spent most of his career in Utah',
    denglu01: 'Thibodeau warrior, took big money in LA late',
    monrogr01: 'Took the qualifying offer to leave Detroit, then chose Milwaukee money',
    jeffeal01: 'Signed with the Bobcats for the biggest offer',
    gordoer01: 'Said his heart was in Phoenix while New Orleans matched',
    stoudam01: 'Left Phoenix for a max in New York',
    boozeca01: 'Left Cleveland for a bigger deal in Utah',
    jennibr01: 'Wanted a big market and a big contract',
    evansty01: 'Rookie of the Year who followed the offers',
    martike02: 'Journeyman scorer, moved for the best offer',
    blatcan01: 'Talent with focus issues',
    mayooj01: 'Took the Bucks money',
    gordobe01: 'Big Detroit deal, then faded',
    arenagi01: 'Agent Zero, huge ego and a huge contract',
    batumni01: 'Took 120 million to stay in Charlotte',
    parsoch01: 'Chased the max in Dallas and Memphis',
    biyombi01: 'Turned one playoff run into a 72 million deal',
    harrito02: 'Took the max to stay in Philadelphia',
    drumman01: 'Rebounding machine who wanted to be paid like a star',
    thomptr01: 'Held out for a big deal with Cleveland',
    bledser01: 'Tweeted that he did not want to be in Phoenix',
    jacksre01: 'Forced his way out of OKC to start',
    kanteen01: 'Wanted out of OKC and Utah for a bigger role',
    waitedi01: 'Kobe Waiters, total self belief',
    youngni01: 'Swaggy P, loves Los Angeles',
    stephla01: 'Born Ready, turned down Indiana to cash in',
    turneev01: 'Took big money in Portland',
    bargnan01: 'Former top pick, chased big deals',
    asikom01: 'Signed a big offer sheet with Houston',
    mozgoti01: 'Turned a title run into a 64 million deal',
    clarkjo01: 'Microwave scorer, long Utah run',
    grantje01: 'Left Denver to get paid and start in Detroit',
    lavinza01: 'Took the max in Chicago',
    randlju01: 'Cashed in with the Knicks',
    roziete01: 'Scary Terry, took the money in Charlotte',
    schrode01: 'Turned down 84 million and bounced around',
    brogdma01: 'Left Milwaukee for an Indiana payday',
    vanvlfr01: 'Bet on himself, left Toronto for a huge Houston deal',
    sabondo01: 'Signed the max in Sacramento',
    murrade01: 'Wanted a bigger role than San Antonio offered',
    harteis01: 'Left New York for a big OKC offer',
    kuzmaky01: 'Flashy champion who cashed in with Washington',
    poolejo01: 'Took the big extension, then got traded',
    kuminjo01: 'Held out in a long contract standoff with Golden State',
    thomaca02: 'Pure scorer who took the qualifying offer',
    sextoco01: 'Scoring guard who wants the ball',
    aytonde01: 'Former top pick, signed a big offer sheet',
    porteke02: 'Talented scorer with off court trouble',
    linje01: 'Linsanity in New York, then the poison pill offer in Houston',
    odomla01: 'Never got over being traded from the Lakers',
    davisba01: 'Wanted to play at home in Los Angeles',
    barnema02: 'Fiery, liked the California teams',
    crawfja01: 'Three time 6MOY, followed the shots',
    jordade01: 'Backed out of a Dallas deal to stay with the Clippers',
    porzikr01: 'Forced his way out of New York',
    russeda01: 'Moved often, liked the big markets',
    reaveau01: 'Undrafted Laker, chose LA over a bigger offer',
    barrerj01: 'Toronto native, thrilled to go home',
    hachiru01: 'Found a home with the Lakers',
    balllo01: 'Los Angeles native, drafted by his hometown Lakers',
    greenja05: 'Athletic scorer who loves the spotlight',
    willizi01: 'Huge star power, whispers about wanting a bigger market',
    baileac01: 'Skipped workouts with Utah before the 2025 draft',
    robinmi01: 'Rebounder who stayed in New York',
    quickim01: 'Signed a big deal in Toronto',
    toppiob01: 'Wanted a bigger role than New York gave him',
    wiggian01: 'Quiet, re-signed with Minnesota and won with Golden State',
    dragigo01: 'Forced a trade from Phoenix to Miami',
    jacksst02: 'Captain Jack, outspoken',
    robinna01: 'Undersized bundle of confidence',
    beaslmi01: 'Elite scorer, moved a lot',
    willilo02: 'Bench scorer who wants to shoot',
    moranja01: 'Loves Memphis and the spotlight',
    youngtr01: 'Signed the max in Atlanta, needs the ball',
    ballla01: 'Charlotte franchise star from a famous family',
    brookdi01: 'Self styled villain',
    allengr01: 'Tough and divisive',
    morrima03: 'Tough forward, outspoken',
    morrima02: 'Demanded a trade from Phoenix after his twin was dealt',
    riverau01: 'Played for his father with the Clippers',
    sengual01: 'Houston big who loves to create',
    townska01: 'Spent eight years in Minnesota before New York',
    ingrabr01: 'Wanted a max, moved to Toronto',
    portemi01: 'Confident scorer, champion in Denver',
    bridgmi02: 'Re-signed with Charlotte after his suspension',
    oladivi01: 'Big personality, Indiana revival',
    hendesc01: 'Confident G League Ignite guard',
    suggsja01: 'Fiery Orlando guard on a long extension',
    foxde01: 'Refused to extend in Sacramento, forced a move to San Antonio',
    giddejo01: 'Playmaker who needs the ball',
    shumpim01: 'Champion role player in Cleveland',
    roybr01: 'Portland legend, comeback in Minnesota',
    bradlav01: 'Defensive pest, moved often after Boston',
    bogutan01: 'Defensive anchor on the 2015 champions',
    rubiori01: 'Spanish passer, beloved in Minnesota',
    greenje02: 'Journeyman who played everywhere',
    matthwe02: 'Iron Man wing who left Portland for Dallas money',
    redicjj01: 'Picked teams near family and contenders',
    arizatr01: 'Moved often as a 3 and D wing',
    diawbo01: 'Easygoing Frenchman, won the 2014 title with the Spurs',
    chalmma01: 'Two title Heat point guard who talks back to stars',
    sandela01: 'Walked away from a big deal',
    carrode01: 'Journeyman who cashed in with Toronto',
    teaguje01: 'Indianapolis native, went home',
    gallida01: 'Italian scorer who kept landing big deals',
    fredeji01: 'College legend who struggled to stick, later a star in China',
    hillge01: 'Indianapolis native',
    bartowi01: 'Thrill, long Denver run',
    barneha02: 'Professional, chose Dallas money',
    cartemi01: 'Rookie of the Year who never matched it',
    noelne01: 'Turned down a 70 million offer to bet on himself',
    porteot01: 'Low key wing, champion in Golden State',
    goberru01: 'Three time DPOY, sensitive to criticism',
    parkeja01: 'Chicago native, injuries derailed him',
    bogdabo01: 'Serbian guard, spurned a Sacramento sign and trade',
    dinwisp01: 'Bet on himself with creative contracts',
    portibo01: 'Crazy eyes, fan favorite in Milwaukee',
    powelno01: 'Second round pick who became a scorer',
    hieldbu01: 'Sharpshooter who got traded often',
    fultzma01: 'Former top pick derailed by a shoulder injury',
    markkla01: 'Re-signed in Utah instead of forcing a move',
    collijo01: 'Athletic big, frustrated with his role in Atlanta',
    williro04: 'Time Lord shot blocker',
    baglema01: 'Former number two pick',
    avdijde01: 'Israeli forward who blossomed in Portland',
    banede01: 'Memphis shooter, later traded to Orlando',
    barnesc01: 'Toronto star, signed the max extension',
    grimequ01: 'Took the qualifying offer',
    daniedy01: 'Steals leader and Most Improved Player in Atlanta',
    durenja01: 'Young Detroit center',
    millebr02: 'Charlotte wing, number two pick in 2023',
    thompam01: 'Twin with elite athleticism',
    thompau01: 'Twin, Detroit defender',
    coulibi01: 'Wemby teammate from France',
    livelde01: 'Dallas rim runner',
    jaqueja01: 'Heat culture fit',
    risacza01: 'French number one pick',
    sarral01: 'French big in Washington',
    sheppre01: 'Kentucky shooter',
    castlst01: 'Rookie of the Year in San Antonio',
    edeyza01: 'Two time college player of the year',
    clingdo01: 'UConn champion center',
    buzelma01: 'Chicago area native',
    mccaija01: 'Social media savvy guard',
    flaggco01: 'Number one pick, competitive and humble',
    harpedy01: 'Rutgers guard, son of Ron Harper',
    edgecvj01: 'Explosive Bahamian guard',
    knuepko01: 'Duke shooter',
    dybanaj01: 'Top 2026 prospect from Massachusetts, played at BYU',
    peterda02: 'Top 2026 guard prospect',
    boozeca02: 'Son of Carlos Boozer'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = g.PERSONALITIES;
})(typeof window !== 'undefined' ? window : global);
