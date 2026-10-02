/* ================= preflop table ================= */
/* Every heads-up preflop matchup falls into one of 47,008 classes under suit
   permutation. PF_TABLE (base64, injected by the build from
   src/preflop-table.bin) holds, per class, the boards the class representative's
   first hand wins and ties out of C(48,5). pfInit numbers the classes the same
   way tools/build-preflop.js does -- it is the same code -- and expands them
   into a 1326x1326 lookup once. */
const PF_BOARDS=1712304;
let PF=null;
function pfInit(){
  if(PF)return PF;
  const HI=new Int16Array(2704).fill(-1),H0=new Int8Array(1326),H1=new Int8Array(1326);
  let n=0;for(let x=0;x<52;x++)for(let y=x+1;y<52;y++){HI[x*52+y]=n;H0[n]=x;H1[n]=y;n++;}
  const perms=[];
  for(let a=0;a<4;a++)for(let b=0;b<4;b++)for(let c=0;c<4;c++)for(let d=0;d<4;d++)
    if(a!==b&&a!==c&&a!==d&&b!==c&&b!==d&&c!==d)perms.push([a,b,c,d]);
  const HP=new Int16Array(24*1326);
  for(let p=0;p<24;p++)for(let h=0;h<1326;h++){
    const x=(H0[h]&~3)|perms[p][H0[h]&3],y=(H1[h]&~3)|perms[p][H1[h]&3];
    HP[p*1326+h]=x<y?HI[x*52+y]:HI[y*52+x];}
  /* cls[a*1326+b] = class*2 + (1 if a,b is the representative the other way round),
     -1 where the hands share a card. Walking a<b in key order meets each class's
     smallest key -- its representative -- before any other member. */
  const cls=new Int32Array(1326*1326).fill(-1),repA=[],repB=[];let nc=0;
  for(let a=0;a<1326;a++){const a0=H0[a],a1=H1[a];
    for(let b=a+1;b<1326;b++){const b0=H0[b],b1=H1[b];
      if(a0===b0||a0===b1||a1===b0||a1===b1)continue;
      let best=a*1326+b,flip=0;
      for(let p=0;p<24;p++){const pa=HP[p*1326+a],pb=HP[p*1326+b];
        if(pa<pb){const k=pa*1326+pb;if(k<best){best=k;flip=0;}}
        else{const k=pb*1326+pa;if(k<best){best=k;flip=1;}}}
      let id;
      if(best===a*1326+b){id=nc++;repA.push(a);repB.push(b);}else id=cls[best]>>1;
      cls[a*1326+b]=id*2+flip;cls[b*1326+a]=id*2+(flip^1);}}
  let win=null,tie=null;
  if(typeof PF_TABLE==='string'&&PF_TABLE){
    const s=atob(PF_TABLE);if(s.length!==nc*8)throw new Error('PF_TABLE has '+s.length/8+' classes, expected '+nc);
    win=new Float64Array(nc);tie=new Float64Array(nc);
    const u=i=>(s.charCodeAt(i)|s.charCodeAt(i+1)<<8|s.charCodeAt(i+2)<<16|s.charCodeAt(i+3)<<24)>>>0;
    for(let i=0;i<nc;i++){win[i]=u(i*8)/PF_BOARDS;tie[i]=u(i*8+4)/PF_BOARDS;}}
  PF={n:nc,HI,H0,H1,cls,repA:Int16Array.from(repA),repB:Int16Array.from(repB),win,tie};
  return PF;
}
