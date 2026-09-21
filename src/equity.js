/* ================= equity ================= */
const sleep=()=>new Promise(r=>setTimeout(r,0));
async function computeEquity(hero,board,rawCombos,opts){
  const EXACT_BUDGET=3e7, MC_TOTAL=opts.mcTotal||1200000;
  const used=new Uint8Array(52);used[hero[0]]=1;used[hero[1]]=1;
  for(const c of board)used[c]=1;
  const combos=[];
  for(const c of rawCombos){if(c[2]<=0)continue;if(used[c[0]]||used[c[1]])continue;combos.push(c);}
  const nC=combos.length;
  if(!nC)return{error:'レンジ内のコンボがすべてブロックされています。'};
  const deck=[];for(let c=0;c<52;c++)if(!used[c])deck.push(c);
  const D=deck.length,k=5-board.length;
  let nBoards=1;for(let i=0;i<k;i++)nBoards=nBoards*(D-i)/(i+1);
  nBoards=Math.round(nBoards);
  const win=new Float64Array(nC),tie=new Float64Array(nC),cnt=new Float64Array(nC);
  const exact=nBoards*nC<=EXACT_BUDGET;
  const b=new Int32Array(5);for(let i=0;i<board.length;i++)b[i]=board[i];
  const off=board.length,h0=hero[0],h1=hero[1];
  let stale=false;
  if(exact){
    const idx=new Int32Array(k);for(let i=0;i<k;i++)idx[i]=i;
    let done=false,bd=0;
    while(!done){
      for(let i=0;i<k;i++)b[off+i]=deck[idx[i]];
      const hv=eval7(h0,h1,b[0],b[1],b[2],b[3],b[4]);
      for(let ci=0;ci<nC;ci++){
        const c=combos[ci],x=c[0],y=c[1];let clash=false;
        for(let i=0;i<k;i++){const v=b[off+i];if(v===x||v===y){clash=true;break;}}
        if(clash)continue;
        const ov=eval7(x,y,b[0],b[1],b[2],b[3],b[4]);
        cnt[ci]++;if(hv>ov)win[ci]++;else if(hv===ov)tie[ci]++;
      }
      bd++;
      if((bd&0x1FFFF)===0){opts.onProgress&&opts.onProgress(bd/nBoards);await sleep();if(opts.isStale&&opts.isStale()){stale=true;break;}}
      if(k===0)break;
      let p=k-1;while(p>=0&&idx[p]===D-k+p)p--;
      if(p<0)done=true;else{idx[p]++;for(let q=p+1;q<k;q++)idx[q]=idx[q-1]+1;}
    }
  }else{
    const per=Math.max(200,Math.ceil(MC_TOTAL/nC));
    const rng=makeRng(0x2545f491);const sub=new Int32Array(D);
    for(let ci=0;ci<nC;ci++){
      const c=combos[ci],x=c[0],y=c[1];let m=0;
      for(let i=0;i<D;i++){const v=deck[i];if(v!==x&&v!==y)sub[m++]=v;}
      let w=0,t=0;
      for(let it=0;it<per;it++){
        for(let s=0;s<k;s++){const r=s+((rng()*(m-s))|0);const tm=sub[s];sub[s]=sub[r];sub[r]=tm;b[off+s]=sub[s];}
        const hv=eval7(h0,h1,b[0],b[1],b[2],b[3],b[4]);
        const ov=eval7(x,y,b[0],b[1],b[2],b[3],b[4]);
        if(hv>ov)w++;else if(hv===ov)t++;
      }
      win[ci]=w;tie[ci]=t;cnt[ci]=per;
      if((ci&31)===31){opts.onProgress&&opts.onProgress(ci/nC);await sleep();if(opts.isStale&&opts.isStale()){stale=true;break;}}
    }
  }
  if(stale)return{stale:true};
  let sw=0,st=0,tw=0,varsum=0;const perCombo=[];
  for(let ci=0;ci<nC;ci++){
    if(!cnt[ci])continue;
    const c=combos[ci],w=c[2],n=cnt[ci];
    const pw=win[ci]/n,pt=tie[ci]/n,eq=pw+pt/2;
    sw+=w*pw;st+=w*pt;tw+=w;
    if(!exact){const m2=(win[ci]+0.25*tie[ci])/n;const vr=Math.max(0,m2-eq*eq);varsum+=w*w*vr/n;}
    perCombo.push({a:c[0],b:c[1],w,eq,n});
  }
  return{equity:(sw+st/2)/tw,win:sw/tw,tie:st/tw,lose:1-(sw+st)/tw,
    mode:exact?'exact':'mc',nCombos:nC,weight:tw,nBoards,
    se:exact?0:Math.sqrt(varsum)/tw,perCombo};
}
