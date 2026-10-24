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
   top, 1/k in a k-way split. mcPrep sets a deal up once per board; mcTrial
   runs one. */
function mcPrep(raws,board,dead){
  const L=board.length;
  if(L!==0&&(L<3||L>5))return{error:'ボードは0枚か3〜5枚にしてください。'};
  const used=new Uint8Array(52);for(const c of board)used[c]=1;for(const c of dead)used[c]=1;
  const R=raws.map(r=>rvrPrep(r,used)),P=R.length,e=R.findIndex(r=>!r.n);
  if(e>=0)return{error:'プレイヤー'+(e+1)+'のレンジのコンボがすべてブロックされています。',blocked:e};
  const cum=R.map(r=>{const c=new Float64Array(r.n);let s=0;for(let i=0;i<r.n;i++){s+=r.w[i];c[i]=s;}return c;});
  const deck=[];for(let c=0;c<52;c++)if(!used[c])deck.push(c);
  const b=new Int32Array(5);for(let i=0;i<L;i++)b[i]=board[i];
  /* a card is taken in this attempt when stamp[c]===st, so nothing needs clearing */
  return{R,P,cum,deck,L,b,pick:new Int32Array(P),v:new Int32Array(P),stamp:new Int32Array(52),st:0,best:-1};
}
/* One trial on X: the combos dealt go in X.pick, each player's strength in X.v
   and the winning strength in X.best. Returns how many split the pot, or 0
   when no disjoint deal turned up in 20000 attempts. */
function mcTrial(X,rng){
  const{R,P,cum,deck,L,b,pick,v,stamp}=X,D=deck.length;let st=X.st;
  for(let tries=0;;){st++;let ok=true;
    for(let p=0;p<P;p++){const r=R[p],c=cum[p],u=rng()*c[c.length-1];let lo=0,hi=c.length-1;
      while(lo<hi){const m=(lo+hi)>>1;if(c[m]>u)hi=m;else lo=m+1;}
      const x=r.c0[lo],y=r.c1[lo];if(stamp[x]===st||stamp[y]===st){ok=false;break;}stamp[x]=st;stamp[y]=st;pick[p]=lo;}
    if(ok)break;if(++tries>20000){X.st=st;return 0;}}
  for(let s=L;s<5;s++){let c;do c=deck[(rng()*D)|0];while(stamp[c]===st);stamp[c]=st;b[s]=c;}
  X.st=st;let best=-1,nb=0;
  for(let p=0;p<P;p++){const r=R[p],i=pick[p],x=eval7(r.c0[i],r.c1[i],b[0],b[1],b[2],b[3],b[4]);v[p]=x;
    if(x>best){best=x;nb=1;}else if(x===best)nb++;}
  X.best=best;return nb;
}
const NO_DEAL='レンジどうしでカードが重ならない組み合わせがありません。';
/* Returns {players:[{equity,win,tie,lose,perCombo,nCombos}],se:[...],
   mode:'mc',nTrials}; perCombo as computeRangeEquity's. */
async function computeMultiEquity(raws,board,dead,opts){
  opts=opts||{};
  const X=mcPrep(raws,board,dead||[]);if(X.error)return{error:X.error};
  const{R,P,pick,v}=X,N=Math.max(1000,opts.trials||1000000),rng=makeRng(opts.seed||0x2545f491);
  /* per combo: pot share won and trials dealt; per player: totals and squares for the error */
  const sh=R.map(r=>new Float64Array(r.n)),ct=R.map(r=>new Float64Array(r.n));
  const win=new Float64Array(P),tie=new Float64Array(P),eq=new Float64Array(P),sq=new Float64Array(P);
  let t0=Date.now();
  for(let t=0;t<N;t++){
    const nb=mcTrial(X,rng);if(!nb)return{error:NO_DEAL};
    for(let p=0;p<P;p++){const i=pick[p];ct[p][i]++;if(v[p]!==X.best)continue;
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
/* ================= flop set ================= */
/* Every flop up to swapping suits: 1755 classes of the 22100 flops, each with
   its count n and a representative c (cards high to low, suits numbered in
   order of first use, so the representative is the same whichever member
   named it). Ranges built from the 13x13 grid treat suits alike, so one flop
   per class stands for them all. Sorted by high, middle, low rank, then suits. */
let FLOPS=null;
function flopClasses(){
  if(FLOPS)return FLOPS;
  const m=new Map();
  for(let a=0;a<52;a++)for(let b=a+1;b<52;b++)for(let c=b+1;c<52;c++){
    const cs=[a,b,c].sort((x,y)=>(y>>2)-(x>>2)||(x&3)-(y&3)),map=[-1,-1,-1,-1];let ns=0;
    /* within a rank the suit order is free, so try each order of equal ranks and keep the smallest naming */
    let best=null;
    for(const o of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]){
      const q=o.map(i=>cs[i]);if(q[0]>>2<q[1]>>2||q[1]>>2<q[2]>>2)continue;
      map.fill(-1);ns=0;const r=q.map(x=>{const s=x&3;if(map[s]<0)map[s]=ns++;return(x&~3)|map[s];});
      const k=r[0]*2704+r[1]*52+r[2];if(!best||k<best.k)best={k,r};}
    const e=m.get(best.k);if(e)e.n++;else m.set(best.k,{c:best.r,n:1});}
  FLOPS=[...m.values()].sort((x,y)=>(x.c[0]>>2)-(y.c[0]>>2)||(x.c[1]>>2)-(y.c[1]>>2)||(x.c[2]>>2)-(y.c[2]>>2)||
    (x.c[0]&3)-(y.c[0]&3)||(x.c[1]&3)-(y.c[1]&3)||(x.c[2]&3)-(y.c[2]&3));
  return FLOPS;
}
/* A flop's texture for the filters: suits 0 rainbow, 1 two-tone, 2 monotone;
   pair 0 none, 1 paired, 2 trips; conn 2 when a straight is possible, 1 when
   only an open-ender is (two ranks within a span of four), else 0. */
function flopTexture(c){
  const su=new Set(c.map(x=>x&3)).size,rk=[...new Set(c.map(x=>x>>2))];
  /* ranks with the ace also low, as 0..13 */
  const lo=rk.flatMap(r=>r===12?[13,0]:[r+1]);
  let conn=0;
  if(rk.length===3)for(let w=0;w<=9;w++)if(rk.every(r=>(r===12?[13,0]:[r+1]).some(x=>x>=w&&x<w+5))){conn=2;break;}
  if(!conn)for(const x of lo)for(const y of lo)if(x<y&&y-x<=3)conn=1;
  return{suits:3-su,pair:3-rk.length,conn,hi:c[0]>>2,mid:c[1]>>2,lo:c[2]>>2};
}
/* Each player's equity on every flop class, sampled with opts.trials deals
   per flop (default 6000). Returns {flops:[{c,n,eq:[...]|null}],trials}; eq is
   null where a range has no combo left on that flop. */
async function computeFlopSet(raws,opts){
  opts=opts||{};
  const F=flopClasses(),N=Math.max(100,opts.trials||6000),rng=makeRng(opts.seed||0x5be0cd19),out=[];
  let t0=Date.now();
  for(let f=0;f<F.length;f++){
    const X=mcPrep(raws,F[f].c,[]);let eq=null;
    if(!X.error){const s=new Float64Array(X.P);
      for(let t=0;t<N;t++){const nb=mcTrial(X,rng);if(!nb){eq=null;break;}
        for(let p=0;p<X.P;p++)if(X.v[p]===X.best)s[p]+=1/nb;eq=s;}
      if(eq)eq=Array.from(s,x=>x/N);}
    out.push({c:F[f].c,n:F[f].n,eq});
    if(Date.now()-t0>30&&f+1<F.length){
      if(opts.onProgress)opts.onProgress((f+1)/F.length);
      await sleep();if(opts.isStale&&opts.isStale())return{stale:true};t0=Date.now();}
  }
  return{flops:out,trials:N};
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
/* What a combo has on this board, judged against the board rather than by the
   hand category alone (a pair on the board is not the combo's pair). Returns
   [made, draw] as indexes into MADE and DRAW, strongest first; each combo
   lands in exactly one of each, the first that fits. draw is -1 on the river.
   A combo that has made a straight or better draws to nothing. A flush draw is
   the nuts when a hole card is the highest of its suit not on the board; with a
   straight draw as well it is still a combo draw. */
const MADE=['ストレート以上','セット・ツーペア','オーバーペア・トップペア','ミドルペア','弱いペア','ハイカード'];
const DRAW=['コンボドロー','ナッツフラッシュドロー','フラッシュドロー','両面（ダブルガット含む）','ガットショット','バックドアのみ','ドローなし'];
function handClass(x,y,board){
  const L=board.length,hv=evalN([x,y,...board]),bv=evalN(board),hx=x>>2,hy=y>>2;
  let bm=0;for(const c of board)bm|=1<<(c>>2);
  const br=[];for(let r=12;r>=0;r--)if(bm>>r&1)br.push(r);
  const bc=new Int8Array(13);for(const c of board)bc[c>>2]++;
  let made;
  if(Math.floor(hv/CAT)>=4&&hv!==bv)made=0;
  else if(hx===hy?bc[hx]>0:bc[hx]>1||bc[hy]>1||bc[hx]&&bc[hy])made=1;
  else if(hx===hy?hx>br[0]:hx===br[0]||hy===br[0])made=2;
  else if(hx===hy?hx>br[1]:hx===br[1]||hy===br[1])made=3;
  else if(hx===hy||bc[hx]||bc[hy])made=4;
  else made=5;
  if(L>=5)return[made,-1];
  if(made===0)return[made,6];
  /* flush draws: a suit one short (or, on the flop, two short) with a hole card in it */
  const sc=new Int8Array(4);for(const c of [x,y,...board])sc[c&3]++;
  const inHole=s=>(x&3)===s||(y&3)===s;
  let fd=false,nut=false,bdf=false;
  for(let s=0;s<4;s++){
    if(sc[s]===4&&inHole(s)){fd=true;let top=12;while(board.includes(top<<2|s))top--;nut=x===(top<<2|s)||y===(top<<2|s);}
    if(sc[s]===3&&inHole(s))bdf=true;}
  /* straight draws: the ranks that would complete a straight the board alone would not */
  const m=bm|1<<hx|1<<hy,fills=extra=>STRAIGHT[m|extra]>=0&&STRAIGHT[bm|extra]<0;
  let outs=0;for(let r=0;r<13;r++)if(!(m>>r&1)&&fills(1<<r))outs++;
  let bds=false;
  if(L===3&&!outs)for(let r=0;r<13&&!bds;r++)for(let t=r+1;t<13;t++)if(!(m>>r&1)&&!(m>>t&1)&&fills(1<<r|1<<t)){bds=true;break;}
  const draw=fd&&outs?0:nut?1:fd?2:outs>=2?3:outs?4:L===3&&(bdf||bds)?5:6;
  return[made,draw];
}
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
