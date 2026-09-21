/* ================= evaluator ================= */
const STRAIGHT=new Int8Array(8192).fill(-1),PACK5=new Int32Array(8192),POPC=new Int8Array(8192);
for(let m=0;m<8192;m++){let best=-1;
  for(let hi=12;hi>=4;hi--){const need=0x1F<<(hi-4);if((m&need)===need){best=hi;break;}}
  if(best<0&&(m&0x100F)===0x100F)best=3;STRAIGHT[m]=best;
  let v=0,n=0,x=m;while(x&&n<5){const b=31-Math.clz32(x);v=(v<<4)|b;x&=~(1<<b);n++;}
  while(n<5){v=v<<4;n++;}PACK5[m]=v;let c=0,y=m;while(y){y&=y-1;c++;}POPC[m]=c;}
const hi1=m=>31-Math.clz32(m);
function packN(m,n){let v=0,x=m;for(let i=0;i<n;i++){const b=31-Math.clz32(x);v=(v<<4)|b;x&=~(1<<b);}return v;}
const SU=new Int32Array(4),CAT=0x100000;
function eval7(c0,c1,c2,c3,c4,c5,c6){
  SU[0]=0;SU[1]=0;SU[2]=0;SU[3]=0;
  SU[c0&3]|=1<<(c0>>2);SU[c1&3]|=1<<(c1>>2);SU[c2&3]|=1<<(c2>>2);SU[c3&3]|=1<<(c3>>2);
  SU[c4&3]|=1<<(c4>>2);SU[c5&3]|=1<<(c5>>2);SU[c6&3]|=1<<(c6>>2);
  const s0=SU[0],s1=SU[1],s2=SU[2],s3=SU[3],rm=s0|s1|s2|s3;
  let fs=0;
  if(POPC[s0]>=5)fs=s0;else if(POPC[s1]>=5)fs=s1;else if(POPC[s2]>=5)fs=s2;else if(POPC[s3]>=5)fs=s3;
  if(fs){const sf=STRAIGHT[fs];if(sf>=0)return 8*CAT+(sf<<16);}
  const p2=(s0&s1)|(s0&s2)|(s0&s3)|(s1&s2)|(s1&s3)|(s2&s3);
  const p3=(s0&s1&s2)|(s0&s1&s3)|(s0&s2&s3)|(s1&s2&s3);
  const p4=s0&s1&s2&s3;
  if(p4){const q=hi1(p4);return 7*CAT+(q<<16)+(hi1(rm&~(1<<q))<<12);}
  if(p3){const t=hi1(p3),rest=(p2|p3)&~(1<<t);if(rest)return 6*CAT+(t<<16)+(hi1(rest)<<12);}
  if(fs)return 5*CAT+PACK5[fs];
  const st=STRAIGHT[rm];if(st>=0)return 4*CAT+(st<<16);
  if(p3){const t=hi1(p3);return 3*CAT+(t<<16)+(packN(rm&~(1<<t),2)<<8);}
  if(p2){
    if(POPC[p2]>=2){const a=hi1(p2),b=hi1(p2&~(1<<a));return 2*CAT+(a<<16)+(b<<12)+(hi1(rm&~(1<<a)&~(1<<b))<<8);}
    const a=hi1(p2);return 1*CAT+(a<<16)+(packN(rm&~(1<<a),3)<<4);
  }
  return PACK5[rm];
}
function makeRng(seed){let a=seed|0||0x9e3779b9,b=0x243f6a88,c=0xb7e15162,d=0xdeadbeef;
  return function(){const t=a^(a<<11);a=b;b=c;c=d;d=(d^(d>>>19))^(t^(t>>>8));return (d>>>0)/4294967296;};}

/* ================= cards / cells ================= */
const RANKS='23456789TJQKA', SUITS='cdhs', SYM=['♣','♦','♥','♠'], SCLS=['cl','di','he','sp'];
const rankOf=c=>c>>2, suitOf=c=>c&3;
const cardName=c=>RANKS[c>>2]+SUITS[c&3];
function cellCombos(i,j){const ri=12-i,rj=12-j,out=[];
  if(i===j){for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)out.push([(ri<<2)|a,(ri<<2)|b]);}
  else if(i<j){for(let s=0;s<4;s++)out.push([(ri<<2)|s,(rj<<2)|s]);}
  else{for(let a=0;a<4;a++)for(let b=0;b<4;b++)if(a!==b)out.push([(rj<<2)|a,(ri<<2)|b]);}
  return out;}
function cellName(i,j){const ri=RANKS[12-i],rj=RANKS[12-j];
  return i===j?ri+ri:(i<j?ri+rj+'s':rj+ri+'o');}
function cellOf(a,b){let r1=rankOf(a),r2=rankOf(b);const suited=suitOf(a)===suitOf(b);
  if(r1<r2){const t=r1;r1=r2;r2=t;}
  if(r1===r2)return [12-r1,12-r1];
  return suited?[12-r1,12-r2]:[12-r2,12-r1];}
const CELLN=[];for(let i=0;i<13;i++){CELLN.push([]);for(let j=0;j<13;j++)CELLN[i].push(cellName(i,j));}
const NAME2IJ={};for(let i=0;i<13;i++)for(let j=0;j<13;j++)NAME2IJ[CELLN[i][j]]=[i,j];
const comboCount=n=>n.length===2?6:(n[2]==='s'?4:12);
