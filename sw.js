// Offline play: the first visit online saves every game file on the device, so the site still
// opens with no connection (on a plane). Network first, so updates show up whenever online.
// Saves live in IndexedDB and never go through here. Player photos and music still need a connection.
var CACHE = '2k13-v1';
var FILES = [ "./", "index.html", "css/style.css", "css/ui-fa.css", "css/ui-features.css", "css/ui-live.css", "css/ui-player.css", "css/ui-team.css", "data/awards-prior.js", "data/cap-history.js", "data/career-prior.js", "data/coach-history.js", "data/coaches.js", "data/drafts.js", "data/gleague.js", "data/history.js", "data/league2012.js", "data/logos.js", "data/personalities.js", "data/picks-2012.js", "data/schedules.js", "data/targets.js", "data/tendencies.js", "data/world-events.js", "js/allstar.js", "js/awards.js", "js/cba.js", "js/coaches.js", "js/dev-stub.js", "js/draft-gen.js", "js/draft.js", "js/engine.js", "js/fantasy.js", "js/freeagency.js", "js/gleague.js", "js/league.js", "js/mood.js", "js/news.js", "js/positions.js", "js/progression.js", "js/soundtrack.js", "js/trade.js", "js/ui-allstar.js", "js/ui-awards.js", "js/ui-commish.js", "js/ui-core.js", "js/ui-draft.js", "js/ui-fa.js", "js/ui-gleague.js", "js/ui-guide.js", "js/ui-history.js", "js/ui-hub.js", "js/ui-live.js", "js/ui-music.js", "js/ui-player.js", "js/ui-progress.js", "js/ui-retire.js", "js/ui-saves.js", "js/ui-season.js", "js/ui-settings.js", "js/ui-sim.js", "js/ui-stats.js", "js/ui-team.js", "js/ui-trade.js", "js/ui.js", "assets/logos/ATL-2008.png", "assets/logos/ATL-2016.png", "assets/logos/ATL-2021.svg", "assets/logos/BKN-2013.png", "assets/logos/BKN-2025.svg", "assets/logos/BOS-1997.svg", "assets/logos/CHA-2013.png", "assets/logos/CHA-2015.svg", "assets/logos/CHI-1967.svg", "assets/logos/CLE-2011.png", "assets/logos/CLE-2018.png", "assets/logos/CLE-2023.svg", "assets/logos/DAL-2002.png", "assets/logos/DAL-2018.svg", "assets/logos/DEN-2009.png", "assets/logos/DEN-2019.svg", "assets/logos/DET-2006.png", "assets/logos/DET-2018.svg", "assets/logos/GSW-2011.png", "assets/logos/GSW-2020.svg", "assets/logos/HOU-2004.png", "assets/logos/HOU-2020.png", "assets/logos/HOU-2027.svg", "assets/logos/IND-2006.png", "assets/logos/IND-2018.svg", "assets/logos/LAC-2011.png", "assets/logos/LAC-2016.png", "assets/logos/LAC-2025.svg", "assets/logos/LAL-2002.svg", "assets/logos/MEM-2005.png", "assets/logos/MEM-2019.svg", "assets/logos/MIA-2000.svg", "assets/logos/MIL-2007.png", "assets/logos/MIL-2016.svg", "assets/logos/MIN-2009.png", "assets/logos/MIN-2018.png", "assets/logos/MIN-2027.svg", "assets/logos/NOH-2009.png", "assets/logos/NOH-2014.png", "assets/logos/NOH-2024.svg", "assets/logos/NYK-2012.svg", "assets/logos/OKC-2009.svg", "assets/logos/ORL-2011.png", "assets/logos/ORL-2026.svg", "assets/logos/PHI-2010.png", "assets/logos/PHI-2016.svg", "assets/logos/PHX-2001.png", "assets/logos/PHX-2014.svg", "assets/logos/POR-2005.png", "assets/logos/POR-2018.svg", "assets/logos/SAC-1995.png", "assets/logos/SAC-2017.svg", "assets/logos/SAS-2003.png", "assets/logos/SAS-2018.svg", "assets/logos/TOR-2009.png", "assets/logos/TOR-2016.png", "assets/logos/TOR-2021.svg", "assets/logos/UTA-2011.png", "assets/logos/UTA-2017.png", "assets/logos/UTA-2023.png", "assets/logos/UTA-2026.svg", "assets/logos/WAS-2012.png", "assets/logos/WAS-2016.svg" ];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined) || Response.error();
    });
  }));
});
