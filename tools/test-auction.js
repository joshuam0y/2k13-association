// The auction draft rules (js/challenge.js): node tools/test-auction.js
global.window=global;require('../js/challenge.js');const C=window.CHALLENGE;
let pass=0,fail=0;const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('FAIL',m)}};
const players=Array.from({length:300},(_,i)=>({id:'p'+i,ovr:99-Math.floor(i/4)}));
for(const o of [{},{budget:30,pool:12,start:1,raise:2},{budget:10,pool:10},{budget:50,start:2,raise:1,pool:20,quality:'any'}]){
 for(const bench of [0,3]){
  for(let seed=1;seed<=60;seed++){
    const cfg={bench,seed,auction:o};const per=C.vsPer(cfg);
    const st=C.auctionStart(cfg,players);let guard=0;const A=C.aucOpts(o);
    if(A.budget<per*A.start) continue;
    while(!st.done&&guard++<5000){ // random play
      const side=st.turn;const r=Math.random();
      const can=C.aucCanRaise(st,side);
      const act=can&&r<0.6?'raise':'pass';
      ok(C.auctionAct(st,side,act),'legal '+act);
    }
    ok(st.done,'finishes');
    ok(st.won[0].length===per&&st.won[1].length===per,'each gets '+per+' got '+st.won[0].length+'/'+st.won[1].length+' pool '+st.ids.length+' o '+JSON.stringify(o));
    ok(st.spent[0]<=A.budget&&st.spent[1]<=A.budget,'budget');
    ok(new Set(st.won[0].concat(st.won[1])).size===2*per,'no duplicate');
    ok(!C.auctionAct(st,0,'pass'),'no acts after done');
  }
 }
}
console.log(pass+' passed, '+fail+' failed');
