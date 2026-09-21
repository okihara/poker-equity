/* ================= color ================= */
function hex2rgb(h){return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];}
const s2l=v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
const l2s=v=>{const x=v<=0.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-0.055;return Math.max(0,Math.min(255,Math.round(x*255)));};
function rgb2oklab(c){const r=s2l(c[0]),g=s2l(c[1]),b=s2l(c[2]);
  const l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b);
  const m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b);
  const s=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);
  return [0.2104542553*l+0.7936177850*m-0.0040720468*s,
          1.9779984951*l-2.4285922050*m+0.4505937099*s,
          0.0259040371*l+0.7827717662*m-0.8086757660*s];}
function oklab2rgb(L){const l=Math.pow(L[0]+0.3963377774*L[1]+0.2158037573*L[2],3);
  const m=Math.pow(L[0]-0.1055613458*L[1]-0.0638541728*L[2],3);
  const s=Math.pow(L[0]-0.0894841775*L[1]-1.2914855480*L[2],3);
  return [l2s(4.0767416621*l-3.3077115913*m+0.2309699292*s),
          l2s(-1.2684380046*l+2.6097574011*m-0.3413193965*s),
          l2s(-0.0041960863*l-0.7034186147*m+1.7076147010*s)];}
function cssVar(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim();}
let PAL={};
function refreshPalette(){
  PAL.mid=rgb2oklab(hex2rgb(cssVar('--pole-mid')));
  PAL.hi=rgb2oklab(hex2rgb(cssVar('--pole-hi')));
  PAL.lo=rgb2oklab(hex2rgb(cssVar('--pole-lo')));
  PAL.opp=rgb2oklab(hex2rgb(cssVar('--opp')));
  PAL.surf=rgb2oklab(hex2rgb(cssVar('--surface-2')));
}
const mix=(A,B,t)=>[A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,A[2]+(B[2]-A[2])*t];
const toCss=c=>'rgb('+c[0]+','+c[1]+','+c[2]+')';
function divergeColor(eq){ // eq 0..1, midpoint .5
  const t=Math.max(-1,Math.min(1,(eq-0.5)/0.5));
  const s=Math.sign(t)*Math.pow(Math.abs(t),0.72);
  const lab=mix(PAL.mid,s>=0?PAL.hi:PAL.lo,Math.abs(s));
  return oklab2rgb(lab);}
function weightColor(w){return oklab2rgb(mix(PAL.surf,PAL.opp,0.18+0.82*w));}
const lum=c=>0.2126*s2l(c[0])+0.7152*s2l(c[1])+0.0722*s2l(c[2]);
const inkOn=c=>lum(c)>0.32?'#0e1620':'#ffffff';

/* ================= state ================= */
let hero=[], board=[], activeSlot={kind:'hero',i:0};
let cellW=Array.from({length:13},()=>new Float64Array(13));
let paintW=1, precision=1200000, lastRes=null;

/* ---- DOM build ---- */
const $=id=>document.getElementById(id);
const heroSlots=$('heroSlots'), boardSlots=$('boardSlots'), picker=$('picker'), rgrid=$('rgrid'), hmEl=$('hm');
function buildSlots(){
  heroSlots.innerHTML='';boardSlots.innerHTML='';
  for(let i=0;i<2;i++)heroSlots.appendChild(mkSlot('hero',i));
  for(let i=0;i<5;i++)boardSlots.appendChild(mkSlot('board',i));
}
function mkSlot(kind,i){
  const b=document.createElement('button');b.className='slot';b.dataset.kind=kind;b.dataset.i=i;
  b.type='button';b.setAttribute('aria-label',(kind==='hero'?'ヒーロー':'ボード')+(i+1)+'枚目');
  b.addEventListener('click',()=>{const arr=kind==='hero'?hero:board;
    if(arr[i]!==undefined){arr.splice(i,1);}
    activeSlot={kind,i:Math.min(i,(kind==='hero'?hero:board).length)};render();schedule();});
  return b;
}
function paintSlot(el,card,active){
  el.classList.toggle('filled',card!==undefined);
  el.classList.toggle('active',active);
  if(card===undefined){el.innerHTML='<span class="ph">+</span>';}
  else{el.innerHTML='<span class="r">'+RANKS[card>>2]+'</span><span class="s '+SCLS[card&3]+'">'+SYM[card&3]+'</span>';}
}
function buildPicker(){
  picker.innerHTML='';
  for(let s=3;s>=0;s--)for(let r=12;r>=0;r--){
    const c=(r<<2)|s;const b=document.createElement('button');b.type='button';b.className='pc';b.dataset.c=c;
    b.innerHTML='<span class="r">'+RANKS[r]+'</span><span class="'+SCLS[s]+'">'+SYM[s]+'</span>';
    b.setAttribute('aria-label',RANKS[r]+SYM[s]);
    b.addEventListener('click',()=>pickCard(c));
    picker.appendChild(b);
  }
}
function pickCard(c){
  if(hero.includes(c)||board.includes(c))return;
  const {kind,i}=activeSlot;
  const arr=kind==='hero'?hero:board, cap=kind==='hero'?2:5;
  if(i<arr.length)arr[i]=c; else if(arr.length<cap)arr.push(c); else return;
  if(kind==='hero'&&hero.length<2)activeSlot={kind:'hero',i:hero.length};
  else if(kind==='hero')activeSlot={kind:'board',i:board.length};
  else activeSlot={kind:'board',i:Math.min(board.length,4)};
  render();schedule();
}
const hmCells=[];
function buildGrids(){
  rgrid.innerHTML='';hmEl.innerHTML='';
  for(let i=0;i<13;i++)for(let j=0;j<13;j++){
    const b=document.createElement('button');b.type='button';b.className='rc'+(i===j?' pair':'');
    b.dataset.i=i;b.dataset.j=j;b.textContent=CELLN[i][j];rgrid.appendChild(b);
  }
  const corner=document.createElement('div');corner.className='hl';hmEl.appendChild(corner);
  for(let j=0;j<13;j++){const d=document.createElement('div');d.className='hl';d.textContent=RANKS[12-j];hmEl.appendChild(d);}
  for(let i=0;i<13;i++){
    hmCells.push([]);
    const rl=document.createElement('div');rl.className='hl';rl.textContent=RANKS[12-i];hmEl.appendChild(rl);
    for(let j=0;j<13;j++){
      const h=document.createElement('div');h.className='hc';h.dataset.i=i;h.dataset.j=j;
      hmEl.appendChild(h);hmCells[i].push(h);
    }
  }
}

/* ---- range painting ---- */
let dragging=false,dragErase=false;
function setCell(i,j,w){if(cellW[i][j]!==w){cellW[i][j]=w;paintCell(i,j);}}
function paintCell(i,j){
  const el=rgrid.children[i*13+j],w=cellW[i][j];
  if(w>0){const c=weightColor(w);el.classList.add('on');el.style.background=toCss(c);el.style.color=inkOn(c);
    el.textContent=w<1?CELLN[i][j]:CELLN[i][j];el.title=CELLN[i][j]+' — ウェイト '+Math.round(w*100)+'%';}
  else{el.classList.remove('on');el.style.background='';el.style.color='';el.title=CELLN[i][j];}
}
function repaintAll(){for(let i=0;i<13;i++)for(let j=0;j<13;j++)paintCell(i,j);updateRangeInfo();}
function cellFromEvent(e){
  const t=document.elementFromPoint(e.clientX,e.clientY);
  if(!t||!t.classList.contains('rc'))return null;
  return [+t.dataset.i,+t.dataset.j];
}
rgrid.addEventListener('pointerdown',e=>{
  const c=cellFromEvent(e);if(!c)return;
  e.preventDefault();dragging=true;
  dragErase=cellW[c[0]][c[1]]===paintW;
  setCell(c[0],c[1],dragErase?0:paintW);updateRangeInfo();
  rgrid.setPointerCapture(e.pointerId);
});
rgrid.addEventListener('pointermove',e=>{
  if(!dragging)return;const c=cellFromEvent(e);if(!c)return;
  setCell(c[0],c[1],dragErase?0:paintW);
});
function endDrag(){if(!dragging)return;dragging=false;updateRangeInfo();syncText();schedule();}
rgrid.addEventListener('pointerup',endDrag);
rgrid.addEventListener('pointercancel',endDrag);
window.addEventListener('pointerup',endDrag);

/* ---- range helpers ---- */
function totalCombos(){let t=0;for(let i=0;i<13;i++)for(let j=0;j<13;j++)t+=cellW[i][j]*comboCount(CELLN[i][j]);return t;}
function selectTopPct(p){
  const target=1326*p/100;let acc=0;
  for(let i=0;i<13;i++)cellW[i].fill(0);
  for(const nm of RANK_ORDER){
    const n=comboCount(nm);if(acc+n>target+1e-9)break;
    const [i,j]=NAME2IJ[nm];cellW[i][j]=1;acc+=n;
  }
  repaintAll();syncText();
}
function updateRangeInfo(){
  const t=totalCombos();
  $('rangeInfo').textContent=t.toFixed(t%1?1:0)+' コンボ / 1326 ('+(t/13.26).toFixed(1)+'%)';
}
function syncText(){
  const parts=[];
  for(let i=0;i<13;i++)for(let j=0;j<13;j++){const w=cellW[i][j];
    if(w>0)parts.push(CELLN[i][j]+(w<1?':'+w:''));}
  $('rtext').value=parts.join(',');
}
function applyText(){
  const txt=$('rtext').value;
  for(let i=0;i<13;i++)cellW[i].fill(0);
  let bad=0;
  for(let tok of txt.split(/[,\s]+/)){
    tok=tok.trim();if(!tok)continue;
    const m=tok.split(':'),h=m[0];
    /* Cell names are 2 or 3 characters. Indexing h[1] without checking threw on
       a one-character token, and the throw escaped applyText after the weights
       had already been cleared, so the grid kept painting a range that no
       longer existed. The upper bound also stops "JJ+" being read as "JJ". */
    if(h.length<2||h.length>3){bad++;continue;}
    const nm=h[0].toUpperCase()+h[1].toUpperCase()+(h.length>2?h[2].toLowerCase():'');
    if(!(nm in NAME2IJ)){bad++;continue;}
    let w=m[1]===undefined?1:parseFloat(m[1].replace('%',''))*(m[1].includes('%')?0.01:1);
    if(!(w>0))w=0;if(w>1)w=1;
    const [i,j]=NAME2IJ[nm];cellW[i][j]=w;
  }
  repaintAll();schedule();
  if(bad)flash(bad+'個のトークンを認識できませんでした。');
}
/* MTT 100bb chipEV opening frequencies. */
const PRESETS=[['UTG 16.5%',16.5],['MP 22%',22],['CO 36.3%',36.3],['BTN 56%',56],['SB 88%',88]];
function buildPresets(){
  const p=$('presets');p.innerHTML='';
  for(const [label,pct] of PRESETS){
    const b=document.createElement('button');b.type='button';b.className='tbtn';b.textContent=label;
    b.addEventListener('click',()=>{$('topSlider').value=pct;$('topOut').textContent=pct.toFixed(1)+'%';selectTopPct(pct);schedule();});
    p.appendChild(b);
  }
}

/* ---- render ---- */
function render(){
  for(let i=0;i<2;i++)paintSlot(heroSlots.children[i],hero[i],activeSlot.kind==='hero'&&activeSlot.i===i);
  for(let i=0;i<5;i++)paintSlot(boardSlots.children[i],board[i],activeSlot.kind==='board'&&activeSlot.i===i);
  const dead=new Set([...hero,...board]);
  for(const b of picker.children)b.disabled=dead.has(+b.dataset.c);
}
function handStr(cards){return cards.map(c=>'<span class="'+SCLS[c&3]+'" style="font-weight:600">'+RANKS[c>>2]+SYM[c&3]+'</span>').join('');}
function flash(msg){const w=$('warn');w.textContent=msg;w.hidden=false;setTimeout(()=>{w.hidden=true;},4000);}

let token=0,timer=null;
function schedule(){clearTimeout(timer);timer=setTimeout(run,180);}
/* Every field showResult() writes, reset together. Clearing only #eqv and
   #matchup left the bar, its legend and the confidence interval showing the
   previous run's numbers next to a –, and left the progress bar switched on
   when this run superseded one that was still in flight. */
function clearResult(msg){
  lastRes=null;
  $('eqv').textContent='–';$('eqse').textContent='';
  for(const id of ['segW','segT','segL']){const e=$(id);e.style.width='0';e.textContent='';}
  $('kw').textContent='–';$('kt').textContent='–';$('kl').textContent='–';
  $('chips').innerHTML='';$('matchup').innerHTML=msg;
  $('prog').classList.remove('on');
  clearHeat();
}
async function run(){
  const my=++token;
  if(hero.length<2){clearResult('ヒーローの2枚を選んでください。');return;}
  const raw=[];
  for(let i=0;i<13;i++)for(let j=0;j<13;j++){const w=cellW[i][j];if(w>0)for(const c of cellCombos(i,j))raw.push([c[0],c[1],w]);}
  if(!raw.length){clearResult('相手のレンジを選んでください。');return;}
  $('prog').classList.add('on');$('progi').style.width='0%';
  const res=await computeEquity(hero,board,raw,{mcTotal:precision,
    onProgress:p=>{if(my===token)$('progi').style.width=(p*100).toFixed(0)+'%';},
    isStale:()=>my!==token});
  if(my!==token)return;
  $('prog').classList.remove('on');
  if(res.stale)return;
  if(res.error){clearResult(res.error);return;}
  lastRes=res;showResult(res);save();
}
function showResult(r){
  $('eqv').textContent=(r.equity*100).toFixed(2);
  $('eqse').textContent=r.se>0?'± '+(r.se*196).toFixed(2):'完全列挙';
  const pct=x=>(x*100).toFixed(1)+'%';
  $('segW').style.width=(r.win*100)+'%';$('segT').style.width=(r.tie*100)+'%';$('segL').style.width=(r.lose*100)+'%';
  $('segW').textContent=r.win>0.1?pct(r.win):'';
  $('segT').textContent=r.tie>0.1?pct(r.tie):'';
  $('segL').textContent=r.lose>0.1?pct(r.lose):'';
  $('kw').textContent=pct(r.win);$('kt').textContent=pct(r.tie);$('kl').textContent=pct(r.lose);
  const t=totalCombos();
  $('matchup').innerHTML=handStr(hero)+' <span style="color:var(--ink-3)">vs</span> レンジ'+
    (board.length?' <span style="color:var(--ink-3)">/ ボード</span> '+handStr(board):' <span style="color:var(--ink-3)">（プリフロップ）</span>');
  const chips=[];
  chips.push(['レンジ '+t.toFixed(t%1?1:0)+'コンボ ('+(t/13.26).toFixed(1)+'%)',false]);
  chips.push(['ブロッカー除外後 '+r.nCombos+'コンボ',false]);
  chips.push([r.mode==='exact'?'完全列挙 '+r.nBoards.toLocaleString()+'ボード':'モンテカルロ '+(r.nCombos*Math.max(200,Math.ceil(precision/r.nCombos))).toLocaleString()+'回',true]);
  $('chips').innerHTML=chips.map(c=>'<span class="chip'+(c[1]?' acc':'')+'">'+c[0]+'</span>').join('');
  drawHeat(r);
}
function clearHeat(){
  for(const el of hmEl.querySelectorAll('.hc')){el.className='hc';el.style.background='';el.style.color='';el.textContent='';el.title='';}
  $('tbl').querySelector('tbody').innerHTML='';
}
function drawHeat(r){
  const agg=Array.from({length:13},()=>Array.from({length:13},()=>({s:0,w:0,n:0})));
  for(const pc of r.perCombo){const [i,j]=cellOf(pc.a,pc.b);const a=agg[i][j];a.s+=pc.eq*pc.w;a.w+=pc.w;a.n++;}
  const rows=[];
  for(let i=0;i<13;i++)for(let j=0;j<13;j++){
    const el=hmCells[i][j],a=agg[i][j];
    if(a.w<=0){el.className='hc';el.style.background='';el.style.color='';el.textContent='';el.removeAttribute('data-tip');continue;}
    const eq=a.s/a.w,c=divergeColor(eq);
    el.className='hc on';el.style.background=toCss(c);el.style.color=inkOn(c);
    el.textContent=Math.round(eq*100);
    el.dataset.tip=CELLN[i][j]+'  ヒーロー '+(eq*100).toFixed(1)+'%  ('+a.n+'コンボ, ウェイト'+Math.round(a.w/a.n*100)+'%)';
    rows.push([CELLN[i][j],eq,a.n,a.w/a.n]);
  }
  rows.sort((x,y)=>x[1]-y[1]);
  $('tbl').querySelector('tbody').innerHTML=rows.map(x=>
    '<tr><td>'+x[0]+'</td><td>'+(x[1]*100).toFixed(2)+'%</td><td>'+x[2]+'</td><td>'+Math.round(x[3]*100)+'%</td></tr>').join('');
}
/* tooltip */
const tip=$('tip');
hmEl.addEventListener('pointerover',e=>{const t=e.target;if(!t.dataset||!t.dataset.tip){tip.classList.remove('on');return;}
  tip.textContent=t.dataset.tip;tip.classList.add('on');});
hmEl.addEventListener('pointermove',e=>{if(!tip.classList.contains('on'))return;
  const x=Math.min(window.innerWidth-tip.offsetWidth-8,e.clientX+12);
  tip.style.left=x+'px';tip.style.top=(e.clientY-tip.offsetHeight-10)+'px';});
hmEl.addEventListener('pointerleave',()=>tip.classList.remove('on'));

function drawLegend(){
  const stops=[];for(let i=0;i<=10;i++){const c=divergeColor(i/10);stops.push(toCss(c)+' '+(i*10)+'%');}
  $('legbar').style.background='linear-gradient(90deg,'+stops.join(',')+')';
}

/* ---- persistence ---- */
function save(){try{localStorage.setItem('eqtool',JSON.stringify({hero,board,
  cells:cellW.map(r=>Array.from(r)),precision}));}catch(e){}}
function load(){try{const s=JSON.parse(localStorage.getItem('eqtool'));
  if(!s||!Array.isArray(s.hero))return false;
  hero=s.hero.slice(0,2);board=(s.board||[]).slice(0,5);
  if(s.cells)for(let i=0;i<13;i++)for(let j=0;j<13;j++)cellW[i][j]=s.cells[i][j]||0;
  if(s.precision)precision=s.precision;
  return true;}catch(e){return false;}}

/* ---- controls ---- */
$('topSlider').addEventListener('input',e=>{const p=+e.target.value;
  $('topOut').textContent=p.toFixed(1)+'%';selectTopPct(p);schedule();});
$('wbtns').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  paintW=+b.dataset.w;for(const x of $('wbtns').children)x.setAttribute('aria-pressed',x===b?'true':'false');});
$('pbtns').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  precision=+b.dataset.p;for(const x of $('pbtns').children)x.setAttribute('aria-pressed',x===b?'true':'false');schedule();});
$('clrHero').addEventListener('click',()=>{hero=[];activeSlot={kind:'hero',i:0};render();schedule();});
$('clrBoard').addEventListener('click',()=>{board=[];activeSlot={kind:'board',i:0};render();schedule();});
$('clrRange').addEventListener('click',()=>{for(let i=0;i<13;i++)cellW[i].fill(0);repaintAll();syncText();schedule();});
$('allRange').addEventListener('click',()=>{for(let i=0;i<13;i++)cellW[i].fill(1);repaintAll();syncText();schedule();});
$('applyText').addEventListener('click',()=>{applyText();syncText();});
const mq=window.matchMedia('(prefers-color-scheme: dark)');
mq.addEventListener&&mq.addEventListener('change',()=>{refreshPalette();repaintAll();drawLegend();if(lastRes)drawHeat(lastRes);});
new MutationObserver(()=>{refreshPalette();repaintAll();drawLegend();if(lastRes)drawHeat(lastRes);})
  .observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

/* ---- boot ---- */
refreshPalette();buildSlots();buildPicker();buildGrids();buildPresets();drawLegend();
if(!load()){
  hero=[(12<<2)|3,(11<<2)|3]; board=[];
  selectTopPct(15);
}else{
  for(const x of $('pbtns').children)x.setAttribute('aria-pressed',+x.dataset.p===precision?'true':'false');
}
activeSlot={kind:'hero',i:hero.length<2?hero.length:0};
if(hero.length>=2)activeSlot={kind:'board',i:board.length};
repaintAll();syncText();render();run();
