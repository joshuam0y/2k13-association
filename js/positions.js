/* Primary and secondary positions for every player, 2K13 style ("PG/SG").
   POSITIONS.of(p)    -> { pos, pos2 }  pos2 is always next to pos on PG, SG, SF, PF, C
   POSITIONS.label(p) -> "PG/SG"
   POSITIONS.coverage(players, minutes) -> minutes at each position for a rotation
   Secondary positions for the 2012-13 rosters and notable real draftees come from the
   combined positions Basketball-Reference and 2K13 list for them (REAL below). Everyone else,
   including fictional DRAFTGEN prospects, gets a deterministic rule from height, weight and
   attributes. A player object may also carry its own p.pos2 (or a combined p.pos like "SG-SF"). */
(function (root) {
  'use strict';
  var ORDER = ['PG', 'SG', 'SF', 'PF', 'C'];
  var ALIAS = { G: 'SG', F: 'SF', GF: 'SF', FC: 'PF' };

  // id:secondary. 2012-13 rosters (2K13 launch) plus notable real draft picks 2013 to 2026.
  var REAL_SRC = [
    // ATL DAL
    'smithjo03:SF horfoal01:PF willilo02:PG harride01:SG teaguje01:SG stevede01:SF johnsiv01:C morroan01:SF korveky01:SF pachuza01:PF jenkijo01:SF petrojo01:PF tollian01:PF scottmi01:SF',
    'nowitdi01:C cartevi01:SF mariosh01:PF brandel01:C collida01:SG mayooj01:PG kamanch01:PF jonesda02:SF beaubro01:SG cunnija01:PG jonesdo02:PG wrighbr03:PF crowdja01:PF curryed01:PF jamesbe01:PF',
    // free agents at launch
    'jamesmi01:SG akognjo01:SG macksh01:SG templga01:SF willite01:SG adrieje01:C simshe01:PF joneske01:SF doolike01:SG johnsch04:SG beverpa01:SG ohlbrti01:PF holidju01:SF goudean01:SG anderch01:PF gelabmi01:SG johnsch03:PF martike01:C richaqu01:SG baynear01:PF arenagi01:SG westde01:SG davisba01:SG flynnjo01:SG leslitr01:SF forbega01:SG greendo01:PF willish03:PF eyengch01:SG johnsja02:C willijo03:C harpeju01:SF brockjo01:C gadzuda01:PF',
    // October 2012 free agents (unsigned veterans, camp cuts, undrafted rookies)
    'fishede01:SG livinsh01:SG howarjo01:SG pietrmi01:SG mcgratr01:SF anderja01:SF bibbymi01:SG harrima01:SF okurme01:PF butlera01:SG simmobo01:SG magloja01:PF uzohbe01:SG russewa02:SG evansma01:SG',
    'hudsole01:SG battito01:PF jonesso01:PF cartean01:SG summeda01:PF howarju01:C wrighch01:PF jamesda01:PF whiteha01:PF jordaje01:PF boykiea01:SG douglch01:SG randosh01:C varnaja01:C quinnch01:SG',
    'wrighch02:PG dentmju01:SG thomama01:SF whitedj01:C johnsar02:SG alabiso01:PF reddmi01:SF thompmy02:SF walkebi01:SF gutiejo01:SG murryto01:SG wareca01:SG gordodr01:C lucaska01:SG',
    // WAS GSW BOS BKN
    'walljo01:SG hilarne01:PF okafoem01:PF arizatr01:SG crawfjo02:PG bealbr01:SF singlch01:PF webstma02:SG booketr01:SF martica01:SG veselja01:PF priceaj01:SG serapke01:PF barroea01:PF pargoja01:SG',
    'curryst01:SG leeda02:C bogutan01:PF jackja01:SG barneha02:PF landrca01:C jefferi01:SG thompkl01:SF rushbr01:SF jenkich01:SG tylerje01:C biedran01:PF ezelife01:PF bazemke01:SF greendr01:PF',
    'rondora01:SG garneke01:C piercpa01:SG bradlav01:PG greenje02:PF terryja01:PG barbole01:PG leeco01:SF bassbr01:C sullija01:C wilcoch01:C melofa01:PF collija04:PF josepkr01:SG milicda01:PF',
    'willide01:SG johnsjo02:SF wallage01:PF lopezbr01:PF humphkr01:C brookma01:SF boganke01:SF watsocj01:SG stackje01:SF evansre01:C blatcan01:PF teletmi01:SF tayloty01:SG shengto01:PF childjo01:SG',
    // CHA ORL NOH CHI
    'walkeke02:SG sessira01:SG gordobe01:PG hendege02:SF thomaty01:C haywobr01:PF willire02:SG biyombi01:C mulleby01:PF carroma01:SF kiddgmi01:SG tayloje03:SG diopde01:PF higgico01:PG',
    'afflaar01:SF nelsoja01:SG turkohe01:PF harrial01:SF redicjj01:SF smithis01:SG nichoan01:C harklma01:SG mcrobjo01:C ayongu01:C vucevni01:PF davisgl01:C mooreet01:PG oquinky01:PF jonesde01:SG',
    'gordoer01:SF davisan02:PF vasqugr01:SG anderry01:SF henryxa01:SF masonro01:SF riverau01:SG warriha01:SF lopezro01:PF smithja02:C aminual01:PF roberbr01:SG thomala01:PF milleda01:SG',
    'denglu01:PF noahjo01:PF boozeca01:C gibsota01:C robinna01:SG hinriki01:SG hamilri01:SF butleji01:SG belinma01:SF mohamna01:PF radmavl01:SF teaguma01:SG rosede01:SG',
    // OKC CLE MEM DEN
    'duranke01:PF westbru01:SG hardeja01:SF ibakase01:C perkike01:PF sefolth01:SF maynoer01:SG jacksre01:SG collini01:C cookda02:SF haywala01:PF jonespe01:SF aldrico01:PF ortonda01:PF thabeha01:PF',
    'irvinky01:SG varejan01:PF waitedi01:PG milescj01:SG thomptr01:C waltolu01:PF zellety01:PF casspom01:PF samuesa01:C gibsoda01:SG pargoje01:SG geeal01:SG haranlu01:SF leuerjo01:PF sloando01:SG',
    'gayru01:PF randoza01:C gasolma01:PF conlemi01:SG allento01:SF arthuda01:C bayleje01:SG ellinwa01:SF wroteto01:SG pondequ01:SG selbyjo01:SG haddaha01:PF speigma01:PF',
    'iguodan01:SG lawsoty01:SG chandwi01:PF farieke01:C millean02:SG mcgeeja01:PF gallida01:PF randoan01:C breweco01:SF hamiljo02:SG mozgoti01:PF fournev01:SF koufoko01:PF millequ01:SF stoneju01:SG',
    // DET TOR HOU SAC
    'monrogr01:PF stuckro01:PG princta01:PF maggeco01:SG knighbr03:SG maxieja01:C bynumwi01:SG villach01:SF jerebjo01:SF dayeau01:PF drumman01:PF singlky01:SG middlkh01:SF kravtvi01:PF engliki01:SF',
    'lowryky01:SG caldejo01:SG bargnan01:C derozde01:SF fieldla01:SF rosste01:SF johnsam01:PF davised01:C lucasjo02:SG kleizli01:PF valanjo01:PF grayaa01:PF anderal01:SG acyqu01:C mcguido01:PF',
    'martike02:SF linje01:SG parsoch01:PF pattepa01:C douglto01:SG lambje01:SF delfica01:SG morrima03:SF joneste01:SF motiedo01:C smithgr02:PF asikom01:PF machasc01:SG whitero03:SF',
    'couside01:PF evansty01:SF brookaa01:SG robinth01:C thomais02:SG thornma01:SF hayesch01:C salmojo01:SG thompja02:C garcifr01:SG outlatr01:PF fredeji01:SG honeyty01:SG johnsja01:PF',
    // IND LAC PHI LAL
    'grangda01:PF hibbero01:PF georgpa01:SF greenge01:SG westda01:C augusdj01:SG hillge01:SG hansbty01:C mahinia01:PF stephla01:SF plumlmi01:PF pendeje02:C youngsa01:SF johnsor01:SF hansbbe01:SG',
    'paulch01:SG griffbl01:C billuch01:SG butleca01:SG crawfja01:PG hillgr01:SG barnema02:PF jordade01:PF odomla01:SF greenwi01:SF bledser01:SG turiaro01:PF holliry01:PF thomptr02:C',
    'holidjr01:SG turneev01:SF youngth01:SF richaja01:SF wrighdo01:PF youngni01:SF hawessp01:PF allenla01:C moultar01:C brownkw01:PF iveyro01:SG wilkida02:SF waynsma01:SG bynuman01:PF',
    'howardw01:PF bryanko01:SF gasolpa01:C nashst01:SG jamisan01:SF artesro01:PF hilljo01:PF duhonch01:SG blakest01:SG meeksjo01:SF morrida01:SG ebankde01:PF clarkea01:SF johnsda03:PG sacrero01:PF',
    // MIA MIL MIN NYK
    'jamesle01:PF wadedw01:PG boshch01:C allenra02:SF battish01:PF chalmma01:SG hasleud01:C lewisra02:PF millemi01:SG coleno01:SG anthojo01:PF jonesja02:SG pittmde01:PF harrejo01:PF harrite01:PG',
    'ellismo01:PG jennibr01:SG ilyaser01:SF dalemsa01:PF goodedr01:C mbahalu01:PF udrihbe01:SG harrito02:PF dunlemi02:SF sandela01:C hensojo01:C przybjo01:PF udohek01:PF daniema01:SG lambdo01:SF',
    'loveke01:C roybr01:SF rubiori01:SG pekovni01:PF kirilan01:PF ridnolu01:SG budinch01:SG willide02:SF bareajo01:SG leema01:PG stiemgr01:PF cunnida01:PF shvedal01:PG amundlo01:C conrowi01:SG',
    'anthoca01:PF stoudam01:C kiddja01:SG shumpim01:PG chandty01:PF smithjr01:SF brewero02:SF feltora01:SG cambyma01:PF thomaku01:PF novakst01:PF copelch01:SF whiteja02:SG prigipa01:SG wallara01:PF',
    // PHX POR SAS UTA
    'gortama01:PF beaslmi01:PF scolalu01:C brownsh01:SF dragigo01:SG dudleja01:SG johnswe01:SF onealje01:PF morrima02:C telfase01:SG marshke01:SG tuckepj01:SF garredi02:SG zellelu01:PF fryech01:C',
    'aldrila01:C batumni01:SG matthwe02:SF hicksjj01:C lillada01:SG smithno01:SG pricero01:SG babbilu01:PF leoname01:PF jeffrja01:SF pavloal01:SF bartowi01:SF clavevi01:PF freeljo01:C williel01:SF',
    'duncati01:PF ginobma01:SF parketo01:SG jacksst02:SG leonaka01:PF millspa02:SG diawbo01:C splitti01:C josepco01:SG bonnema01:PF greenda02:SF blairde01:C nealga01:PG decolna01:PG',
    'jeffeal01:PF millspa01:SF willima01:SG favorde01:C burksal01:SF foyera01:PG haywago01:SF tinslja01:SG watsoea01:SG willima02:PF evansje01:SF kanteen01:PF carrode01:PF murphke01:SF bellra01:SF',
    // notable real draftees 2013 to 2026
    'oladivi01:PG mccolcj01:PG antetgi01:PF goberru01:PF wiggian01:SG embiijo01:PF randlju01:C lavinza01:SG capelca01:PF jokicni01:PF townska01:PF russeda01:SG porzikr01:C bookede01:SF powelno01:SF',
    'simmobe01:PF ingrabr01:SG brownja02:SG murraja01:PG sabondo01:PF siakapa01:SF murrade01:SG zubaciv01:PF tatumja01:PF foxde01:SG markkla01:C mitchdo01:PG adebaba01:PF allenja01:PF anunoog01:PF whitede01:SG',
    'aytonde01:PF doncilu01:PG jacksja02:C youngtr01:SG bridgmi01:SF gilgesh01:SG portemi01:PF brunsja01:SG willizi01:C moranja01:SG garlada01:SG herroty01:PG edwaran01:SF ballla01:SG avdijde01:PF halibty01:PG maxeyty01:SG banede01:SG',
    'cunnica01:SG greenja05:SF mobleev01:C barnesc01:SF giddejo01:PG wagnefr01:SG sengual01:PF banchpa01:SF holmgch01:PF wembavi01:PF millebr02:SG thompam01:PG thompau01:SF flaggco01:PF harpedy01:SG knuepko01:SG dybanaj01:PF peterda02:PG boozeca02:C'
  ].join(' ');
  var REAL = {};
  REAL_SRC.split(/\s+/).forEach(function (t) { var kv = t.split(':'); if (kv[0] && kv[1]) REAL[kv[0]] = kv[1]; });

  function norm(pos) {
    var s = String(pos || '').toUpperCase().trim();
    if (ORDER.indexOf(s) >= 0) return s;
    if (ALIAS[s]) return ALIAS[s];
    var first = s.split(/[-\/ ,]/)[0];
    if (ORDER.indexOf(first) >= 0) return first;
    return ALIAS[first] || 'SF';
  }
  function adjacent(a, b) {
    var i = ORDER.indexOf(a), j = ORDER.indexOf(b);
    return i >= 0 && j >= 0 && Math.abs(i - j) === 1;
  }
  // a second position written into the player record itself (p.pos2, or p.pos like "SG-SF")
  function fromRecord(p, pos) {
    if (p.pos2 && adjacent(pos, norm(p.pos2))) return norm(p.pos2);
    var parts = String(p.pos || '').toUpperCase().split(/[-\/ ,]/);
    if (parts.length > 1 && adjacent(pos, parts[1])) return parts[1];
    return null;
  }

  // The rule for everyone without a real listing: height (inches), weight and attributes.
  function rule(p, pos) {
    var a = (p && p.attrs) || {};
    var v = function (k) { var x = Number(a[k]); return isNaN(x) ? 50 : x; };
    var ht = Number(p && p.ht) || 79, wt = Number(p && p.wt) || 215;
    if (pos === 'PG') return 'SG';
    if (pos === 'C') return 'PF';
    if (pos === 'SG') {
      // small playmakers slide to the point, everyone else to the wing
      var play = (v('handle') + v('pass')) / 2;
      if (ht <= 74) return 'PG';
      if (ht <= 77 && play >= 66) return 'PG';
      if (ht <= 76 && play >= 58 && v('pass') >= v('three')) return 'PG';
      return 'SF';
    }
    if (pos === 'SF') {
      // a 6'7" ball handler is also a guard, a strong 6'9" forward is also a four
      var guard = (v('handle') + v('pass') + v('speed') + v('three')) / 4;
      var big = (v('strength') + v('post') + v('dreb') + v('intD')) / 4;
      var score = (guard - big) - (ht - 79.5) * 6 - (wt - 222) / 6;
      return score >= 0 ? 'SG' : 'PF';
    }
    // PF: shot blockers and post players also play center, stretch fours also play the three
    var inside = (v('block') + v('post') + v('intD') + v('strength') + v('oreb')) / 5;
    var outside = (v('three') + v('mid') + v('handle') + v('speed')) / 4;
    var s2 = (inside - outside) + (ht - 81) * 5 + (wt - 240) / 5;
    return s2 >= 0 ? 'C' : 'SF';
  }

  function of(p) {
    if (!p) return { pos: 'SF', pos2: 'SG' };
    var pos = norm(p.pos);
    var pos2 = fromRecord(p, pos);
    if (!pos2 && p.id && REAL[p.id] && adjacent(pos, REAL[p.id])) pos2 = REAL[p.id];
    if (!pos2) pos2 = rule(p, pos);
    return { pos: pos, pos2: pos2 };
  }
  function label(p) { var o = of(p); return o.pos + '/' + o.pos2; }
  function plays(p, slot) { var o = of(p); return o.pos === slot || o.pos2 === slot; }

  // Minutes at each position for a rotation. Every player's minutes count at his primary
  // position first (up to 48 there, best players first). Positions still short of 48 are then
  // filled by moving minutes to secondary positions, chained when needed: a deep SF group can
  // push a SF/PF to the four so a PF/C slides to center. This is a small max flow
  // (players -> their two positions -> 48 per position), started from the primary assignment.
  // Minutes that fit nowhere stay at the primary position, which then shows as crowded.
  // Returns { need, total, by: { PG: { min, primary, secondary, players: [{ id, name, min, via }] } }, thin, deep }
  function coverage(players, minutes, need) {
    need = need || 48;
    var by = {};
    ORDER.forEach(function (k) { by[k] = { min: 0, primary: 0, secondary: 0, players: [] }; });
    var rows = [];
    (players || []).forEach(function (p) {
      if (!p) return;
      var m = Math.max(0, Math.round(Number(minutes ? minutes[p.id] : 0) || 0));
      if (!m) return;
      var o = of(p);
      rows.push({ p: p, pos: o.pos, pos2: o.pos2, m: m, atPrim: 0, atSec: 0, free: m });
    });
    var load = {};
    ORDER.forEach(function (k) { load[k] = 0; });
    rows.slice().sort(function (a, b) { return (b.p.ovr || 0) - (a.p.ovr || 0) || b.m - a.m; }).forEach(function (r) {
      var put = Math.min(r.free, need - load[r.pos]);
      if (put > 0) { r.atPrim += put; r.free -= put; load[r.pos] += put; }
    });
    var at = function (r, k) { return k === r.pos ? r.atPrim : k === r.pos2 ? r.atSec : 0; };
    var add = function (r, k, v) { if (k === r.pos) r.atPrim += v; else r.atSec += v; };
    // augmenting paths: free minutes -> player -> position -> (player already there -> his other position)* -> open slot
    for (var guard = 0; guard < 400; guard++) {
      var prev = {}, queue = [], seen = {}, end = null;
      rows.forEach(function (r, i) {
        if (r.free <= 0) return;
        [r.pos, r.pos2].forEach(function (k) { if (!seen[k]) { seen[k] = true; prev[k] = { from: null, row: i }; queue.push(k); } });
      });
      while (queue.length && !end) {
        var k = queue.shift();
        if (load[k] < need) { end = k; break; }
        rows.forEach(function (r, i) {
          if (end || at(r, k) <= 0) return;
          var other = k === r.pos ? r.pos2 : r.pos;
          if (seen[other]) return;
          seen[other] = true; prev[other] = { from: k, row: i }; queue.push(other);
        });
      }
      if (!end) break;
      // bottleneck along the path
      var amt = need - load[end], k2 = end, steps = [];
      while (k2) { var st = prev[k2]; steps.push({ to: k2, from: st.from, row: rows[st.row] }); k2 = st.from; }
      steps.forEach(function (s) { amt = Math.min(amt, s.from == null ? s.row.free : at(s.row, s.from)); });
      if (amt <= 0) break;
      steps.forEach(function (s) {
        add(s.row, s.to, amt);
        if (s.from == null) s.row.free -= amt; else add(s.row, s.from, -amt);
      });
      load[end] += amt;
    }
    // what fits nowhere stays at the primary position
    rows.forEach(function (r) { if (r.free > 0) { r.atPrim += r.free; load[r.pos] += r.free; r.free = 0; } });
    ORDER.forEach(function (k) { by[k].min = load[k]; });
    rows.forEach(function (r) {
      if (r.atPrim > 0) { by[r.pos].primary += r.atPrim; by[r.pos].players.push({ id: r.p.id, name: r.p.name, min: r.atPrim, via: 'primary' }); }
      if (r.atSec > 0) { by[r.pos2].secondary += r.atSec; by[r.pos2].players.push({ id: r.p.id, name: r.p.name, min: r.atSec, via: 'secondary' }); }
    });
    ORDER.forEach(function (k) { by[k].players.sort(function (a, b) { return b.min - a.min; }); });
    var total = ORDER.reduce(function (s, k) { return s + by[k].min; }, 0);
    return {
      need: need, total: total, by: by,
      thin: ORDER.filter(function (k) { return by[k].min < need; }),
      deep: ORDER.filter(function (k) { return by[k].min > need; })
    };
  }

  var POSITIONS = { ORDER: ORDER, REAL: REAL, of: of, label: label, plays: plays, adjacent: adjacent, norm: norm, rule: rule, coverage: coverage };
  if (root) root.POSITIONS = POSITIONS;
  if (typeof module !== 'undefined' && module.exports) module.exports = POSITIONS;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
