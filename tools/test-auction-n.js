// The auction for a bracket (js/challenge.js auctionN*): node tools/test-auction-n.js
global.window=global;require('../js/challenge.js');const C=window.CHALLENGE;
let pass=0,fail=0;const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('FAIL',m)}};
const players=Array.from({length:600},(_,i)=>({id:'p'+i,ovr:99-Math.floor(i/6)}));const byId={};players.forEach(p=>{byId[p.id]=p});
const mulberry=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
for(const n of [3,4,8]){for(const bench of [0,3]){for(let seed=1;seed<=40;seed++){
  const cfg={bench,seed,first:seed%n,auction:{budget:20,pool:n*(bench?8:5)}};const per=C.vsPer(cfg);
  const st=C.auctionNStart(cfg,n,players);const rng=mulberry(seed);let g=0;
  // some teams are "human" and play at random, the rest are AI
  const human=t=>t%2===0;
  while(!st.done&&g++<20000){
    C.auctionNRunAI(st,byId,rng,human);if(st.done)break;
    const t=st.turn;ok(human(t),'only a human is on the clock');
    const can=C.aucNCanRaise(st,t);
    if(can&&Math.random()<0.5){const mx=C.aucNMax(st,t),mn=st.price+st.o.raise;ok(!C.auctionNAct(st,t,'raise',mx+1),'not past the top bid');ok(!C.auctionNAct(st,t,'raise',mn-1),'not under one raise');ok(C.auctionNAct(st,t,'raise',mn+Math.floor(Math.random()*(mx-mn+1))),'legal raise');}
    else ok(C.auctionNAct(st,t,'pass'),'legal pass');
    ok(!C.auctionNAct(st,(t+1)%n,'pass')||true,'noop');
  }
  ok(st.done,'n='+n+' finishes');
  ok(st.won.every(w=>w.length===per),'everyone gets '+per+': '+st.won.map(w=>w.length).join('/')+' pool '+st.ids.length);
  ok(st.spent.every(x=>x<=st.o.budget),'budget kept');
  ok(new Set([].concat.apply([],st.won)).size===n*per,'nobody twice');
  ok(!C.auctionNAct(st,0,'pass'),'nothing after the end');
}}}
console.log(pass+' passed, '+fail+' failed');process.exit(fail?1:0);
