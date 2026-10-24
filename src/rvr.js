/* ================= range vs range ================= */
const sleep=()=>new Promise(r=>setTimeout(r,0));
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
   only the <= side needs adding back. Returns this runout's weighted equity
   numerator for A, and leaves the denominator in S.de (Monte Carlo needs both
   per board for its error estimate). */
function rvrSweep(A,sa,mA,B,sb,mB,S,win,tie,tot){
  const{cw,lc,ec,sw,es}=S,bc0=B.c0,bc1=B.c1,bw=B.w,ac0=A.c0,ac1=A.c1,aw=A.w;
  cw.fill(0);lc.fill(0);ec.fill(0);let T=0,lT=0,eT=0,nu=0,de=0;
  for(let j=0;j<mB;j++){const ib=sb[j]%2048,x=bc0[ib],y=bc1[ib],w=bw[ib];T+=w;cw[x]+=w;cw[y]+=w;sw[x*52+y]=w;}
  let j=0,k=0;
  for(let i=0;i<mA;i++){
    const key=sa[i],ia=key%2048,lo=key-ia,hi=lo+2048;
    while(j<mB&&sb[j]<lo){const ib=sb[j]%2048,x=bc0[ib],y=bc1[ib],w=bw[ib];lT+=w;lc[x]+=w;lc[y]+=w;j++;}
    while(k<mB&&sb[k]<hi){const ib=sb[k]%2048,x=bc0[ib],y=bc1[ib],w=bw[ib];eT+=w;ec[x]+=w;ec[y]+=w;es[x*52+y]=w;k++;}
    const x=ac0[ia],y=ac1[ia],s=x*52+y;
    const l=lT-lc[x]-lc[y],e=eT-ec[x]-ec[y]+es[s];
    const t=T-cw[x]-cw[y]+sw[s];
    win[ia]+=l;tie[ia]+=e-l;tot[ia]+=t;nu+=aw[ia]*(l+e)/2;de+=aw[ia]*t;
  }
  for(let j=0;j<mB;j++){const ib=sb[j]%2048,s=bc0[ib]*52+bc1[ib];sw[s]=0;es[s]=0;}
  S.de=de;return nu;
}
function rvrSide(R,win,tie,tot){
  let n=0,nw=0,nt=0;const pc=[];
  for(let i=0;i<R.n;i++){const w=R.w[i];n+=w*tot[i];nw+=w*win[i];nt+=w*tie[i];}
  for(let i=0;i<R.n;i++)if(tot[i]>0)
    pc.push({a:R.c0[i],b:R.c1[i],w:R.w[i],eq:(win[i]+tie[i]/2)/tot[i],share:R.w[i]*tot[i]/n});
  return{equity:(nw+nt/2)/n,win:nw/n,tie:nt/n,lose:1-(nw+nt)/n,perCombo:pc,mass:n};}
function rvrResult(A,B,wA,tA,nA,wB,tB,nB,extra){
  const ra=rvrSide(A,wA,tA,nA),rb=rvrSide(B,wB,tB,nB);
  if(!(ra.mass>0))return{error:'2つのレンジにカードが重ならない組み合わせがありません。'};
  return Object.assign({equity:ra.equity,win:ra.win,tie:ra.tie,lose:ra.lose,perCombo:ra.perCombo,
    opp:{equity:rb.equity,win:rb.win,tie:rb.tie,lose:rb.lose,perCombo:rb.perCombo},
    nCombos:A.n,nCombosOpp:B.n},extra);}
/* Preflop with no dead cards: every live pair is one lookup in the table. */
function rvrPreflop(A,B){
  const P=pfInit(),cls=P.cls,pw=P.win,pt=P.tie;
  const wA=new Float64Array(A.n),tA=new Float64Array(A.n),nA=new Float64Array(A.n);
  const wB=new Float64Array(B.n),tB=new Float64Array(B.n),nB=new Float64Array(B.n);
  const hb=new Int32Array(B.n);for(let j=0;j<B.n;j++)hb[j]=P.HI[B.c0[j]*52+B.c1[j]];
  for(let i=0;i<A.n;i++){
    const row=P.HI[A.c0[i]*52+A.c1[i]]*1326,wa=A.w[i];let sw=0,st=0,sn=0;
    for(let j=0;j<B.n;j++){const c=cls[row+hb[j]];if(c<0)continue;
      const id=c>>1,t=pt[id],w=c&1?1-pw[id]-t:pw[id],wb=B.w[j];
      sw+=wb*w;st+=wb*t;sn+=wb;wB[j]+=wa*(1-w-t);tB[j]+=wa*t;nB[j]+=wa;}
    wA[i]=sw;tA[i]=st;nA[i]=sn;}
  return rvrResult(A,B,wA,tA,nA,wB,tB,nB,{mode:'exact',se:0,nRunouts:PF_BOARDS});}
/* Range vs range, all-in. rawA/rawB are [card,card,weight] lists, board 0 or
   3..5 cards, dead an optional card list. On a 3..5-card board every runout is
   enumerated, so the result is exact: the pairs (a,b) that a runout leaves live
   all face the same C(D-4,k) runouts, so summing over runouts is the joint
   expectation. Preflop reads the precomputed table, which assumes no dead
   cards; with dead cards it samples whole boards instead (opts.mcBoards, each
   one still swept over every pair, so a few thousand go a long way). */
async function computeRangeEquity(rawA,rawB,board,dead,opts){
  opts=opts||{};dead=dead||[];
  const L=board.length;
  if(L!==0&&(L<3||L>5))return{error:'ボードは0枚か3〜5枚にしてください。'};
  const used=new Uint8Array(52);for(const c of board)used[c]=1;for(const c of dead)used[c]=1;
  const A=rvrPrep(rawA,used),B=rvrPrep(rawB,used);
  if(!A.n||!B.n)return{error:(A.n?'相手':'ヒーロー')+'のレンジのコンボがすべてブロックされています。'};
  if(L===0&&!dead.length)return rvrPreflop(A,B);
  const deck=[];for(let c=0;c<52;c++)if(!used[c])deck.push(c);
  const k=5-L,mc=L===0,D=deck.length,runs=[];
  const rng=makeRng(0x7f4a7c15);
  if(!mc){
    if(k===0)runs.push([]);else if(k===1)for(const c of deck)runs.push([c]);
    else for(let i=0;i<D;i++)for(let j=i+1;j<D;j++)runs.push([deck[i],deck[j]]);
    /* Shuffled, so the running total shown while enumerating is an unbiased
       estimate rather than "every runout with a deuce first". */
    for(let i=runs.length-1;i>0;i--){const r=(rng()*(i+1))|0;const t=runs[i];runs[i]=runs[r];runs[r]=t;}
  }
  const wA=new Float64Array(A.n),tA=new Float64Array(A.n),nA=new Float64Array(A.n);
  const wB=new Float64Array(B.n),tB=new Float64Array(B.n),nB=new Float64Array(B.n);
  const sa=new Float64Array(A.n),sb=new Float64Array(B.n),onRun=new Uint8Array(52);
  const S={cw:new Float64Array(52),lc:new Float64Array(52),ec:new Float64Array(52),
    sw:new Float64Array(2704),es:new Float64Array(2704),de:0};
  const b=new Int32Array(5);for(let i=0;i<L;i++)b[i]=board[i];
  const N=mc?Math.max(100,opts.mcBoards||2000):runs.length;
  const nums=new Float64Array(mc?N:0),dens=new Float64Array(mc?N:0),pick=deck.slice(),ru=[0,0,0,0,0];
  let t0=Date.now();
  for(let r=0;r<N;r++){
    if(mc){for(let s=0;s<5;s++){const x=s+((rng()*(D-s))|0);const t=pick[s];pick[s]=pick[x];pick[x]=t;ru[s]=pick[s];}}
    const run=mc?ru:runs[r];
    for(let i=0;i<k;i++){b[L+i]=run[i];onRun[run[i]]=1;}
    const mA=rvrKeys(A,b,onRun,sa),mB=rvrKeys(B,b,onRun,sb);
    const nu=rvrSweep(A,sa,mA,B,sb,mB,S,wA,tA,nA);
    if(mc){nums[r]=nu;dens[r]=S.de;}
    rvrSweep(B,sb,mB,A,sa,mA,S,wB,tB,nB);
    for(let i=0;i<k;i++)onRun[run[i]]=0;
    if((r&7)===7&&Date.now()-t0>30&&r+1<N){
      if(opts.onProgress){const p=rvrSide(A,wA,tA,nA);opts.onProgress((r+1)/N,p.mass>0?p.equity:NaN);}
      await sleep();if(opts.isStale&&opts.isStale())return{stale:true};t0=Date.now();}
  }
  let se=0;
  if(mc){/* ratio estimator: equity = sum(num)/sum(den) over iid boards */
    let sn=0,sd=0;for(let r=0;r<N;r++){sn+=nums[r];sd+=dens[r];}
    const R=sn/sd;let v=0;for(let r=0;r<N;r++){const d=nums[r]-R*dens[r];v+=d*d;}
    se=sd>0?Math.sqrt(v/(N*(N-1)))/(sd/N):0;}
  return rvrResult(A,B,wA,tA,nA,wB,tB,nB,{mode:mc?'mc':'exact',se,nRunouts:N});
}
/* ================= multiway ================= */
/* Three or more ranges all-in. Summing over every disjoint triple is out of
   reach, so this samples: one combo from each range by weight, all redrawn
   until no two share a card -- exactly the product of the weights conditioned
   on disjoint hands, the joint the heads-up engine sums -- then the rest of
   the board. Each player takes a share of the pot per trial: 1 alone at the
   top, 1/k in a k-way split. Returns {players:[{equity,win,tie,lose,perCombo,
   nCombos}],se:[...],mode:'mc',nTrials}; perCombo as computeRangeEquity's. */
async function computeMultiEquity(raws,board,dead,opts){
  opts=opts||{};dead=dead||[];
  const L=board.length;
  if(L!==0&&(L<3||L>5))return{error:'ボードは0枚か3〜5枚にしてください。'};
  const used=new Uint8Array(52);for(const c of board)used[c]=1;for(const c of dead)used[c]=1;
  const R=raws.map(r=>rvrPrep(r,used)),P=R.length,e=R.findIndex(r=>!r.n);
  if(e>=0)return{error:'プレイヤー'+(e+1)+'のレンジのコンボがすべてブロックされています。'};
  const cum=R.map(r=>{const c=new Float64Array(r.n);let s=0;for(let i=0;i<r.n;i++){s+=r.w[i];c[i]=s;}return c;});
  const draw=(c,u)=>{const x=u*c[c.length-1];let lo=0,hi=c.length-1;while(lo<hi){const m=(lo+hi)>>1;if(c[m]>x)hi=m;else lo=m+1;}return lo;};
  const deck=[];for(let c=0;c<52;c++)if(!used[c])deck.push(c);
  const D=deck.length,k=5-L,N=Math.max(1000,opts.trials||1000000),rng=makeRng(opts.seed||0x2545f491);
  /* per combo: pot share won and trials dealt; per player: totals and squares for the error */
  const sh=R.map(r=>new Float64Array(r.n)),ct=R.map(r=>new Float64Array(r.n));
  const win=new Float64Array(P),tie=new Float64Array(P),eq=new Float64Array(P),sq=new Float64Array(P);
  const pick=new Int32Array(P),v=new Int32Array(P),b=new Int32Array(5),stamp=new Int32Array(52);
  for(let i=0;i<L;i++)b[i]=board[i];
  /* a card is taken in this attempt when stamp[c]===st, so nothing needs clearing */
  let st=0,tries=0,t0=Date.now();
  for(let t=0;t<N;t++){
    for(;;){st++;let ok=true;
      for(let p=0;p<P;p++){const r=R[p],i=draw(cum[p],rng()),x=r.c0[i],y=r.c1[i];
        if(stamp[x]===st||stamp[y]===st){ok=false;break;}stamp[x]=st;stamp[y]=st;pick[p]=i;}
      if(ok)break;
      if(++tries>20000&&t===0)return{error:'レンジどうしでカードが重ならない組み合わせがありません。'};}
    for(let s=0;s<k;s++){let c;do c=deck[(rng()*D)|0];while(stamp[c]===st);stamp[c]=st;b[L+s]=c;}
    let best=-1,nb=0;
    for(let p=0;p<P;p++){const r=R[p],i=pick[p],x=eval7(r.c0[i],r.c1[i],b[0],b[1],b[2],b[3],b[4]);v[p]=x;
      if(x>best){best=x;nb=1;}else if(x===best)nb++;}
    for(let p=0;p<P;p++){const i=pick[p];ct[p][i]++;if(v[p]!==best)continue;
      const s=1/nb;eq[p]+=s;sq[p]+=s*s;sh[p][i]+=s;if(nb===1)win[p]++;else tie[p]++;}
    if((t&1023)===1023&&Date.now()-t0>30&&t+1<N){
      if(opts.onProgress)opts.onProgress((t+1)/N,Array.from(eq,x=>x/(t+1)));
      await sleep();if(opts.isStale&&opts.isStale())return{stale:true};t0=Date.now();}
  }
  const players=R.map((r,p)=>{const pc=[];
    for(let i=0;i<r.n;i++)if(ct[p][i]>0)pc.push({a:r.c0[i],b:r.c1[i],w:r.w[i],eq:sh[p][i]/ct[p][i],share:ct[p][i]/N});
    return{equity:eq[p]/N,win:win[p]/N,tie:tie[p]/N,lose:1-(win[p]+tie[p])/N,perCombo:pc,nCombos:r.n};});
  const se=players.map((x,p)=>Math.sqrt(Math.max(0,sq[p]/N-x.equity*x.equity)/(N-1)));
  return{players,se,mode:'mc',nTrials:N};
}
/* ================= made hands ================= */
/* Strength of the best hand in 5..7 cards. eval7 only ORs cards into suit
   masks, so repeating a card changes nothing: a short hand is padded with its
   last card. */
function evalN(cs){const n=cs.length,c=i=>cs[i<n?i:n-1];return eval7(c(0),c(1),c(2),c(3),c(4),c(5),c(6));}
/* The combos of a range as the hands they make on this board right now, strongest
   first, one group per strength: [{v,w,combos:[[c0,c1,w],...]}]. Duplicates are
   merged and combos holding a used card dropped, as rvrPrep does. */
function madeHands(raw,board,used){
  const u=new Uint8Array(52);for(const c of board)u[c]=1;for(const c of used)u[c]=1;
  const R=rvrPrep(raw,u),g=new Map();
  for(let i=0;i<R.n;i++){const v=evalN([R.c0[i],R.c1[i],...board]);let e=g.get(v);
    if(!e){e={v,w:0,combos:[]};g.set(v,e);}e.w+=R.w[i];e.combos.push([R.c0[i],R.c1[i],R.w[i]]);}
  return [...g.values()].sort((x,y)=>y.v-x.v);}
/* "ワンペア QQ (A 9 5)" from an eval7 strength */
const HCAT=['ハイカード','ワンペア','ツーペア','スリーカード','ストレート','フラッシュ','フルハウス','フォーカード','ストレートフラッシュ'];
function handLabel(v){const t=Math.floor(v/CAT),r=v%CAT,nb=k=>RANKS[(r>>(4*k))&15],rep=(x,n)=>x.repeat(n),ks=(a,b)=>{const o=[];for(let k=a;k>=b;k--)o.push(nb(k));return o.join(' ');};
  switch(t){
    case 8:return nb(4)==='A'?'ロイヤルフラッシュ':HCAT[8]+' '+nb(4)+'ハイ';
    case 7:return HCAT[7]+' '+rep(nb(4),4)+' ('+nb(3)+')';
    case 6:return HCAT[6]+' '+rep(nb(4),3)+'-'+rep(nb(3),2);
    case 5:case 0:return HCAT[t]+' '+ks(4,0);
    case 4:return HCAT[4]+' '+nb(4)+'ハイ';
    case 3:return HCAT[3]+' '+rep(nb(4),3)+' ('+ks(3,2)+')';
    case 2:return HCAT[2]+' '+rep(nb(4),2)+'-'+rep(nb(3),2)+' ('+nb(2)+')';
    default:return HCAT[1]+' '+rep(nb(4),2)+' ('+ks(3,1)+')';}}
