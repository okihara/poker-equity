/* ================= range vs range ================= */
/* Range = {n,c0,c1,w}: duplicates merged, blocked and zero-weight combos dropped. */
function rvrPrep(raw,used){
  const acc=new Float64Array(2704),keys=[];
  for(const c of raw){const w=c[2];if(!(w>0))continue;let x=c[0],y=c[1];
    if(x===y||used[x]||used[y])continue;if(x>y){const t=x;x=y;y=t;}
    const k=x*52+y;if(!acc[k])keys.push(k);acc[k]+=w;}
  const n=keys.length,c0=new Int32Array(n),c1=new Int32Array(n),w=new Float64Array(n);
  for(let i=0;i<n;i++){const k=keys[i];c0[i]=(k/52)|0;c1[i]=k%52;w[i]=acc[k];}
  return{n,c0,c1,w};}
/* Evaluate the combos of R that survive the runout once, as sortable keys
   strength*2048+index (exact in a double), sorted ascending. Returns the count. */
function rvrKeys(R,b,onRun,key){
  let m=0;const c0=R.c0,c1=R.c1;
  for(let i=0;i<R.n;i++){const x=c0[i],y=c1[i];if(onRun[x]||onRun[y])continue;
    key[m++]=eval7(x,y,b[0],b[1],b[2],b[3],b[4])*2048+i;}
  key.subarray(0,m).sort();return m;}
/* For every live combo of A: the B weight it beats, ties, and can face at all,
   summed into win/tie/tot. One pass over both sorted lists; a combo's opponents
   that share a card are taken back out by inclusion-exclusion:
     beat(x,y) = L - L[x] - L[y]           (L: total, L[c]: combos holding c)
     tieOrBeat = E - E[x] - E[y] + E[xy]   (E[xy]: the B combo identical to it)
   An identical combo always has the same strength, so it is never below and
   only the <= side needs adding back. */
function rvrSweep(A,sa,mA,B,sb,mB,S,win,tie,tot){
  const{cw,lc,ec,sw,es}=S,bc0=B.c0,bc1=B.c1,bw=B.w,ac0=A.c0,ac1=A.c1;
  cw.fill(0);lc.fill(0);ec.fill(0);let T=0,lT=0,eT=0;
  for(let j=0;j<mB;j++){const ib=sb[j]%2048,x=bc0[ib],y=bc1[ib],w=bw[ib];T+=w;cw[x]+=w;cw[y]+=w;sw[x*52+y]=w;}
  let j=0,k=0;
  for(let i=0;i<mA;i++){
    const key=sa[i],ia=key%2048,lo=key-ia,hi=lo+2048;
    while(j<mB&&sb[j]<lo){const ib=sb[j]%2048,x=bc0[ib],y=bc1[ib],w=bw[ib];lT+=w;lc[x]+=w;lc[y]+=w;j++;}
    while(k<mB&&sb[k]<hi){const ib=sb[k]%2048,x=bc0[ib],y=bc1[ib],w=bw[ib];eT+=w;ec[x]+=w;ec[y]+=w;es[x*52+y]=w;k++;}
    const x=ac0[ia],y=ac1[ia],s=x*52+y;
    const l=lT-lc[x]-lc[y],e=eT-ec[x]-ec[y]+es[s];
    win[ia]+=l;tie[ia]+=e-l;tot[ia]+=T-cw[x]-cw[y]+sw[s];
  }
  for(let j=0;j<mB;j++){const ib=sb[j]%2048,s=bc0[ib]*52+bc1[ib];sw[s]=0;es[s]=0;}
}
function rvrSide(R,win,tie,tot){
  let n=0,nw=0,nt=0;const pc=[];
  for(let i=0;i<R.n;i++){const w=R.w[i];n+=w*tot[i];nw+=w*win[i];nt+=w*tie[i];}
  for(let i=0;i<R.n;i++)if(tot[i]>0)
    pc.push({a:R.c0[i],b:R.c1[i],w:R.w[i],eq:(win[i]+tie[i]/2)/tot[i],share:R.w[i]*tot[i]/n});
  return{equity:(nw+nt/2)/n,win:nw/n,tie:nt/n,lose:1-(nw+nt)/n,perCombo:pc,mass:n};}
/* Range vs range, all-in on a 3/4/5-card board. rawA/rawB are [card,card,weight]
   lists, dead an optional card list. Every turn/river runout is enumerated, so
   the result is exact: the pairs (a,b) that a runout leaves live all face the
   same C(D-4,k) runouts, so summing over runouts is the joint expectation. */
async function computeRangeEquity(rawA,rawB,board,dead,opts){
  opts=opts||{};dead=dead||[];
  if(board.length<3||board.length>5)return{error:'ボードは3〜5枚にしてください。'};
  const used=new Uint8Array(52);for(const c of board)used[c]=1;for(const c of dead)used[c]=1;
  const A=rvrPrep(rawA,used),B=rvrPrep(rawB,used);
  if(!A.n||!B.n)return{error:'レンジ'+(A.n?'B':'A')+'のコンボがすべてブロックされています。'};
  const deck=[];for(let c=0;c<52;c++)if(!used[c])deck.push(c);
  const k=5-board.length,runs=[];
  if(k===0)runs.push([]);else if(k===1)for(const c of deck)runs.push([c]);
  else for(let i=0;i<deck.length;i++)for(let j=i+1;j<deck.length;j++)runs.push([deck[i],deck[j]]);
  /* Shuffled, so the running total shown while enumerating is an unbiased
     estimate rather than "every runout with a deuce first". */
  const rng=makeRng(0x7f4a7c15);
  for(let i=runs.length-1;i>0;i--){const r=(rng()*(i+1))|0;const t=runs[i];runs[i]=runs[r];runs[r]=t;}
  const wA=new Float64Array(A.n),tA=new Float64Array(A.n),nA=new Float64Array(A.n);
  const wB=new Float64Array(B.n),tB=new Float64Array(B.n),nB=new Float64Array(B.n);
  const sa=new Float64Array(A.n),sb=new Float64Array(B.n),onRun=new Uint8Array(52);
  const S={cw:new Float64Array(52),lc:new Float64Array(52),ec:new Float64Array(52),
    sw:new Float64Array(2704),es:new Float64Array(2704)};
  const b=new Int32Array(5);for(let i=0;i<board.length;i++)b[i]=board[i];
  const N=runs.length;let t0=Date.now();
  for(let r=0;r<N;r++){
    const ru=runs[r];for(let i=0;i<k;i++){b[board.length+i]=ru[i];onRun[ru[i]]=1;}
    const mA=rvrKeys(A,b,onRun,sa),mB=rvrKeys(B,b,onRun,sb);
    rvrSweep(A,sa,mA,B,sb,mB,S,wA,tA,nA);
    rvrSweep(B,sb,mB,A,sa,mA,S,wB,tB,nB);
    for(let i=0;i<k;i++)onRun[ru[i]]=0;
    if((r&7)===7&&Date.now()-t0>30&&r+1<N){
      if(opts.onProgress){const p=rvrSide(A,wA,tA,nA);opts.onProgress((r+1)/N,p.mass>0?p.equity:NaN);}
      await sleep();if(opts.isStale&&opts.isStale())return{stale:true};t0=Date.now();}
  }
  const ra=rvrSide(A,wA,tA,nA),rb=rvrSide(B,wB,tB,nB);
  if(!(ra.mass>0))return{error:'2つのレンジにカードが重ならない組み合わせがありません。'};
  return{equity:ra.equity,win:ra.win,tie:ra.tie,lose:ra.lose,perCombo:ra.perCombo,
    opp:{equity:rb.equity,win:rb.win,tie:rb.tie,lose:rb.lose,perCombo:rb.perCombo},
    mode:'exact',se:0,nRunouts:N,nCombos:A.n,nCombosOpp:B.n};
}
