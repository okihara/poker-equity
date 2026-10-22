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
  PAL.hero=rgb2oklab(hex2rgb(cssVar('--hero')));
  PAL.surf=rgb2oklab(hex2rgb(cssVar('--surface-2')));
}
const mix=(A,B,t)=>[A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,A[2]+(B[2]-A[2])*t];
const toCss=c=>'rgb('+c[0]+','+c[1]+','+c[2]+')';
function divergeLab(eq){ // eq 0..1, midpoint .5
  const t=Math.max(-1,Math.min(1,(eq-0.5)/0.5));
  const s=Math.sign(t)*Math.pow(Math.abs(t),0.72);
  return mix(PAL.mid,s>=0?PAL.hi:PAL.lo,Math.abs(s));}
const divergeColor=eq=>oklab2rgb(divergeLab(eq));
const lum=c=>0.2126*s2l(c[0])+0.7152*s2l(c[1])+0.0722*s2l(c[2]);
const inkOn=c=>lum(c)>0.32?'#0e1620':'#ffffff';

/* ================= state ================= */
/* mode 'hand': hero's two cards vs ranges[1]. mode 'range': ranges[0] vs
   ranges[1], each edited in its own panel RP[k], hero's first. */
/* dead cards have no input for now; the engine still takes them */
const dead=[];
let hero=[], board=[], activeSlot=null; // the slot the open picker fills
let mode='hand', hmSide=1; // hmSide: the range the heatmap shows
const newRange=()=>Array.from({length:13},()=>new Float64Array(13));
const ranges=[newRange(),newRange()];
let precision=2000, lastRes=null;
const SLOTS={hero:{cap:2,label:'ヒーロー'},board:{cap:5,label:'ボード'}};
const cardsOf=k=>k==='hero'?hero:board;
/* Rows keep their cards in place: taking one out leaves a hole (null) rather
   than sliding the rest left, so live() is what the engine and labels see. */
const live=a=>a.filter(c=>c!=null);
/* the first hole at or after `from`, wrapping round the row; -1 when it is full */
function holeOf(kind,from){const arr=cardsOf(kind),cap=SLOTS[kind].cap;
  for(let n=0;n<cap;n++){const i=(from+n)%cap;if(arr[i]==null)return i;}return -1;}

/* ---- DOM build ---- */
const $=id=>document.getElementById(id);
const heroSlots=$('heroSlots'), boardSlots=$('boardSlots'), picker=$('picker'), hmEl=$('hm');
function buildSlots(){
  heroSlots.innerHTML='';boardSlots.innerHTML='';
  for(let i=0;i<2;i++)heroSlots.appendChild(mkSlot('hero',i));
  for(let i=0;i<5;i++)boardSlots.appendChild(mkSlot('board',i));
}
function mkSlot(kind,i){
  const b=document.createElement('button');b.className='slot';b.dataset.kind=kind;b.dataset.i=i;
  b.type='button';b.setAttribute('aria-label',SLOTS[kind].label+(i+1)+'枚目');
  b.addEventListener('click',()=>openPicker(kind,i));
  return b;
}
/* A four-colour card face: the suit's colour fills the card, the corner index
   stacks rank over suit and a big rank sits bottom right. U+FE0E keeps iOS from
   drawing the suits as emoji, which would ignore the white ink. */
const faceCls=c=>' fc f-'+SCLS[c&3];
function face(c){const r=RANKS[c>>2]==='T'?'10':RANKS[c>>2];
  return '<span class="ix"><b>'+r+'</b><i>'+SYM[c&3]+'\uFE0E</i></span><span class="big">'+r+'</span>';}
function paintSlot(el,card,active){
  el.className='slot'+(card!=null?' filled'+faceCls(card):'')+(active?' active':'');
  el.innerHTML=card==null?'<span class="ph">+</span>':face(card);
}
function buildPicker(){
  picker.innerHTML='';
  for(let s=3;s>=0;s--)for(let r=12;r>=0;r--){
    const c=(r<<2)|s;const b=document.createElement('button');b.type='button';b.className='pc'+faceCls(c);b.dataset.c=c;
    b.innerHTML=face(c);
    b.setAttribute('aria-label',RANKS[r]+SYM[s]);
    b.addEventListener('click',()=>pickCard(c));
    picker.appendChild(b);
  }
}
function pickCard(c){
  if(!activeSlot)return;
  if(usedCards().has(c)){unpickCard(c);return;}
  const {kind,i}=activeSlot,arr=cardsOf(kind),replace=arr[i]!=null;
  arr[i]=c;schedule();
  /* filling empty slots walks on to the next one; a swap, or a full row, is done */
  const nx=replace?-1:holeOf(kind,i+1);
  if(nx<0){closePicker();return;}
  activeSlot={kind,i:nx};render();
}
/* A card already in play is taken back out of whichever row holds it, leaving
   a hole where it was; the open slot stays where it is. */
function unpickCard(c){
  for(const k of mode==='hand'?['hero','board']:['board']){
    const arr=cardsOf(k),j=arr.indexOf(c);if(j<0)continue;
    arr[j]=null;schedule();render();return;
  }
}
/* ---- card picker dialog ---- */
const dlg=$('pickdlg');
/* an empty slot past the row's first hole opens that hole instead */
function openPicker(kind,i){if(cardsOf(kind)[i]==null)i=holeOf(kind,0);activeSlot={kind,i};render();if(!dlg.open)dlg.showModal();}
/* 'close' fires a task later; drop the target now so no click lands in between */
function closePicker(){activeSlot=null;if(dlg.open)dlg.close();render();}
dlg.addEventListener('close',()=>{activeSlot=null;render();});
/* A backdrop click lands on the dialog element itself, but so does a click on
   its padding, hence the rectangle test. Only for clicks on the dialog: a
   button pressed with Enter/Space reports a click at (0,0), which is outside. */
function onBackdrop(d,close){d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();
  if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();});}
onBackdrop(dlg,closePicker);
$('pickClose').addEventListener('click',closePicker);
/* ---- help dialog ---- */
const help=$('helpdlg'),closeHelp=()=>help.close();
onBackdrop(help,closeHelp);
$('helpClose').addEventListener('click',closeHelp);
$('helpBtn').addEventListener('click',()=>{closeMenu();help.showModal();});
/* ---- menu (top right) ---- */
const menuBtn=$('menuBtn'),menuPop=$('menuPop');
function closeMenu(){menuPop.hidden=true;menuBtn.setAttribute('aria-expanded','false');}
menuBtn.addEventListener('click',()=>{const o=menuPop.hidden;menuPop.hidden=!o;menuBtn.setAttribute('aria-expanded',o?'true':'false');});
document.addEventListener('pointerdown',e=>{if(!menuPop.hidden&&!e.target.closest('.menu'))closeMenu();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menuPop.hidden){closeMenu();menuBtn.focus();}});
/* ---- theme: 'auto' follows the OS; the resolved one goes on the root element's data-theme ---- */
let theme='auto';const darkMq=window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(){
  document.documentElement.dataset.theme=theme==='auto'?(darkMq.matches?'dark':'light'):theme;
  pressed($('themeBtns'),$('themeBtns').querySelector('[data-t="'+theme+'"]'));
  /* range cells, heatmap and legend carry inline colours mixed from the palette */
  refreshPalette();drawLegend();
  if(RP.length){for(const P of RP)repaintGrid(P);if(lastRes)drawHeat(lastRes);}
}
try{const t=localStorage.getItem('eqtheme');if(t==='light'||t==='dark')theme=t;}catch(e){}
darkMq.addEventListener('change',()=>{if(theme==='auto')applyTheme();});
$('themeBtns').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  theme=b.dataset.t;try{localStorage.setItem('eqtheme',theme);}catch(e){}applyTheme();});
$('pickRemove').addEventListener('click',()=>{if(!activeSlot)return;
  cardsOf(activeSlot.kind)[activeSlot.i]=null;schedule();closePicker();});
/* ---- range panels: villain's #rp1 is in the markup, hero's #rp0 its clone ---- */
const RP=[];
function buildPanels(){
  const v=$('rp1'),h=v.cloneNode(true);
  h.id='rp0';h.dataset.k='0';
  h.insertBefore($('heroGrp'),h.querySelector('.reditor'));
  v.parentNode.insertBefore(h,v);
  for(const el of [h,v]){
    const k=+el.dataset.k,q=c=>el.querySelector('.'+c),nm=k?'相手':'ヒーロー';
    const P={k,el,w:ranges[k],eq:Array.from({length:13},()=>new Float64Array(13).fill(-1)),paintW:1,
      grid:q('rgrid'),slider:q('topSlider'),out:q('topOut'),text:q('rtext'),info:q('rangeInfo'),title:q('rtitle')};
    P.title.id='h-range'+k;el.setAttribute('aria-labelledby',P.title.id);
    P.grid.setAttribute('aria-label',nm+'のレンジグリッド');P.text.setAttribute('aria-label',nm+'のレンジのテキスト表記');
    P.slider.setAttribute('aria-label',nm+'のレンジを上位何パーセントで選ぶか');
    for(let i=0;i<13;i++)for(let j=0;j<13;j++){
      const b=document.createElement('button');b.type='button';b.className='rc'+(i===j?' pair':'');
      b.dataset.i=i;b.dataset.j=j;b.textContent=CELLN[i][j];P.grid.appendChild(b);}
    wirePanel(P);RP[k]=P;
  }
}
const hmCells=[];
function buildHeatGrid(){
  hmEl.innerHTML='';
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
let drag=null,dragErase=false; // drag: the panel being painted
function setCell(P,i,j,w){if(P.w[i][j]!==w){P.w[i][j]=w;paintCell(P,i,j);}}
function paintCell(P,i,j){
  const el=P.grid.children[i*13+j],w=P.w[i][j];
  /* Colour carries equity (the heatmap's scale, or the side's own colour before
     a result exists) at full strength; weight is the filled height from the
     bottom, so a partial weight never turns into a washed-out tint. */
  if(w>0){const e=P.eq[i][j],c=oklab2rgb(e>=0?divergeLab(e):P.k?PAL.opp:PAL.hero),h=(w*100).toFixed(1)+'%';
    el.classList.add('on');
    el.style.background=w<1?'linear-gradient(to top,'+toCss(c)+' '+h+',var(--surface-2) '+h+')':toCss(c);
    el.style.color=w>=0.5?inkOn(c):'var(--ink)';
    el.textContent=CELLN[i][j];el.title=CELLN[i][j]+' — ウェイト '+Math.round(w*100)+'%'+(e>=0?' / ヒーロー '+(e*100).toFixed(1)+'%':'');}
  else{el.classList.remove('on');el.style.background='';el.style.color='';el.title=CELLN[i][j];}
}
function repaintGrid(P){for(let i=0;i<13;i++)for(let j=0;j<13;j++)paintCell(P,i,j);}
function repaintAll(P){repaintGrid(P);updateRangeInfo(P);}
/* only cells of P's own grid: a drag that wanders onto the other panel stops there */
function cellFromEvent(e,P){
  const t=document.elementFromPoint(e.clientX,e.clientY);
  if(!t||t.parentNode!==P.grid)return null;
  return [+t.dataset.i,+t.dataset.j];
}
function endDrag(){if(!drag)return;const P=drag;drag=null;updateRangeInfo(P);syncText(P);schedule();}
window.addEventListener('pointerup',endDrag);
/* MTT 100bb chipEV opening frequencies. */
const PRESETS=[['UTG 16.5%',16.5],['MP 22%',22],['CO 36.3%',36.3],['BTN 56%',56],['SB 88%',88]];
function wirePanel(P){
  const g=P.grid,q=c=>P.el.querySelector('.'+c);
  g.addEventListener('pointerdown',e=>{
    const c=cellFromEvent(e,P);if(!c)return;
    e.preventDefault();drag=P;
    dragErase=P.w[c[0]][c[1]]===P.paintW;
    setCell(P,c[0],c[1],dragErase?0:P.paintW);updateRangeInfo(P);
    g.setPointerCapture(e.pointerId);
  });
  g.addEventListener('pointermove',e=>{
    if(drag!==P)return;const c=cellFromEvent(e,P);if(!c)return;
    setCell(P,c[0],c[1],dragErase?0:P.paintW);
  });
  g.addEventListener('pointerup',endDrag);g.addEventListener('pointercancel',endDrag);
  const top=p=>{P.slider.value=p;P.out.textContent=p.toFixed(1)+'%';selectTopPct(P,p);schedule();};
  P.slider.addEventListener('input',()=>top(+P.slider.value));
  for(const [label,pct] of PRESETS){
    const b=document.createElement('button');b.type='button';b.className='tbtn';b.textContent=label;
    b.addEventListener('click',()=>top(pct));q('presets').appendChild(b);
  }
  const fill=x=>{for(const r of P.w)r.fill(x);repaintAll(P);syncText(P);schedule();};
  q('clrRange').addEventListener('click',()=>fill(0));
  q('allRange').addEventListener('click',()=>fill(1));
  q('applyText').addEventListener('click',()=>{applyText(P);syncText(P);});
}

/* ---- range helpers ---- */
function totalCombos(w){let t=0;for(let i=0;i<13;i++)for(let j=0;j<13;j++)t+=w[i][j]*comboCount(CELLN[i][j]);return t;}
function selectTopPct(P,p){
  const target=1326*p/100;let acc=0;
  for(const r of P.w)r.fill(0);
  for(const nm of RANK_ORDER){
    const n=comboCount(nm);if(acc+n>target+1e-9)break;
    const [i,j]=NAME2IJ[nm];P.w[i][j]=1;acc+=n;
  }
  repaintAll(P);syncText(P);
}
function updateRangeInfo(P){
  const t=totalCombos(P.w);
  P.info.textContent=t.toFixed(t%1?1:0)+' コンボ / 1326 ('+(t/13.26).toFixed(1)+'%)';
}
function rangeText(w){
  const parts=[];
  for(let i=0;i<13;i++)for(let j=0;j<13;j++){const x=w[i][j];
    if(x>0)parts.push(CELLN[i][j]+(x<1?':'+x:''));}
  return parts.join(',');
}
function syncText(P){P.text.value=rangeText(P.w);}
function applyText(P){
  const bad=parseRange(P.text.value,P.w);
  repaintAll(P);schedule();
  if(bad)flash(bad+'個のトークンを認識できませんでした。');
}
/* Overwrites w with the range txt spells; returns how many tokens it could not read. */
function parseRange(txt,w){
  for(const r of w)r.fill(0);
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
    let x=m[1]===undefined?1:parseFloat(m[1].replace('%',''))*(m[1].includes('%')?0.01:1);
    if(!(x>0))x=0;if(x>1)x=1;
    const [i,j]=NAME2IJ[nm];w[i][j]=x;
  }
  return bad;
}

/* ---- render ---- */
function render(){
  const on=(k,i)=>!!activeSlot&&activeSlot.kind===k&&activeSlot.i===i;
  for(let i=0;i<2;i++)paintSlot(heroSlots.children[i],hero[i],on('hero',i));
  for(let i=0;i<5;i++)paintSlot(boardSlots.children[i],board[i],on('board',i));
  if(!activeSlot)return;
  const {kind,i}=activeSlot,arr=cardsOf(kind),cur=arr[i],used=usedCards();
  for(const b of picker.children){const c=+b.dataset.c;const u=used.has(c);b.classList.toggle('used',u);b.title=u?'クリックで外す':'';b.classList.toggle('cur',c===cur);}
  $('pickttl').innerHTML=SLOTS[kind].label+' '+(i+1)+'枚目'+(cur!=null?'を差し替え':'')+
    (live(arr).length?' <span class="sub">'+handStr(live(arr))+'</span>':'');
  $('pickRemove').hidden=cur==null;
  $('picknote').textContent=kind==='board'?'ボードは0・3・4・5枚のどれか。フロップだけなら3枚選んで閉じてください。':'';
}
/* Hero's cards only count in hand mode; in range mode they are hidden and ignored. */
function usedCards(){return new Set(live([...(mode==='hand'?hero:[]),...board,...dead]));}
function handStr(cards){return cards.map(c=>'<span class="'+SCLS[c&3]+'" style="font-weight:600">'+RANKS[c>>2]+SYM[c&3]+'</span>').join('');}
let warnTimer=null;
/* One timer, restarted on every message: without clearing it the previous
   call's timeout hid a warning that had only just appeared. */
function flash(msg){const w=$('warn');w.textContent=msg;w.hidden=false;
  clearTimeout(warnTimer);warnTimer=setTimeout(()=>{w.hidden=true;},4000);}

/* ---- engine: a Worker built from the #engine script's own text, or, where the
   page may not start one (a CSP without blob: workers), the same code here. ---- */
let worker=null;const jobs=new Map();
function startWorker(){
  try{
    worker=new Worker(URL.createObjectURL(new Blob([$('engine').textContent],{type:'text/javascript'})));
    worker.onmessage=e=>{const m=e.data,j=jobs.get(m.id);if(!j)return;
      if(m.result){jobs.delete(m.id);j.done(m.result);}else j.onProgress(m.progress,m.partial);};
    /* a worker that fails to load reports here, not by throwing */
    worker.onerror=()=>{worker=null;for(const [id,j] of jobs){jobs.delete(id);calcHere(j).then(j.done);}};
  }catch(e){worker=null;}
}
const calcHere=j=>computeRangeEquity(j.a,j.b,j.board,j.dead,{mcBoards:j.mcBoards,onProgress:j.onProgress,isStale:j.isStale});
function calc(id,a,b,onProgress,isStale){
  return new Promise(done=>{
    /* a newer query supersedes the rest; the worker drops them without answering */
    for(const [k,j] of jobs){jobs.delete(k);j.done({stale:true});}
    const j={a,b,board:live(board),dead:live(dead),mcBoards:precision,onProgress,isStale,done};
    if(!worker){calcHere(j).then(done);return;}
    jobs.set(id,j);worker.postMessage({id,a,b,board:j.board,dead:j.dead,opts:{mcBoards:j.mcBoards}});
  });
}

let token=0,timer=null;
function schedule(){clearTimeout(timer);timer=setTimeout(run,180);}
/* Every field showResult() writes, reset together. Clearing only #eqv and
   #matchup left the bar, its legend and the confidence interval showing the
   previous run's numbers next to a –, and left the progress bar switched on
   when this run superseded one that was still in flight. */
function clearResult(msg){
  lastRes=null;
  $('eqv').textContent='–';$('eqse').textContent='';$('eqv').parentNode.classList.remove('interim');$('precBtn').hidden=true;
  for(const id of ['segW','segT','segL']){const e=$(id);e.style.width='0';e.textContent='';}
  $('kw').textContent='–';$('kt').textContent='–';$('kl').textContent='–';
  $('chips').innerHTML='';$('matchup').innerHTML='';$('resmsg').textContent=msg;$('resmsg').hidden=!msg;
  $('prog').classList.remove('on');
  clearHeat();
}
function rawRange(w){const raw=[];
  for(let i=0;i<13;i++)for(let j=0;j<13;j++){const x=w[i][j];if(x>0)for(const c of cellCombos(i,j))raw.push([c[0],c[1],x]);}
  return raw;}
async function run(){
  const my=++token;
  drawMade();
  const H=live(hero),nb=live(board).length;
  if(mode==='hand'&&H.length<2){clearResult('ヒーローの2枚を選んでください。');return;}
  if(nb===1||nb===2){clearResult('ボードは0枚・3枚・4枚・5枚のどれかにしてください。');return;}
  const a=mode==='hand'?[[H[0],H[1],1]]:rawRange(ranges[0]),b=rawRange(ranges[1]);
  if(!a.length){clearResult('ヒーローのレンジを選んでください。');return;}
  if(!b.length){clearResult('相手のレンジを選んでください。');return;}
  $('prog').classList.add('on');$('progi').style.width='0%';
  const res=await calc(my,a,b,
    (p,eq)=>{if(my!==token)return;$('progi').style.width=(p*100).toFixed(0)+'%';
      /* runouts go in shuffled order, so the running figure is a fair estimate */
      if(eq>=0){$('eqv').textContent=(eq*100).toFixed(1);$('eqv').parentNode.classList.add('interim');$('eqse').textContent='計算中';}},
    ()=>my!==token);
  if(my!==token)return;
  $('prog').classList.remove('on');$('eqv').parentNode.classList.remove('interim');
  if(res.stale)return;
  if(res.error){clearResult(res.error);return;}
  lastRes=res;showResult(res);save();
}
function showResult(r){
  $('resmsg').hidden=true;
  $('eqv').textContent=(r.equity*100).toFixed(2);
  $('eqse').textContent=r.se>0?'± '+(r.se*196).toFixed(2):'完全列挙';
  /* only a sampled result (preflop with dead cards) has a precision to change */
  $('precBtn').hidden=r.mode!=='mc';
  $('precBtn').textContent=precision>2000?'標準精度に戻す':'高精度で再計算（約5倍の時間）';
  const pct=x=>(x*100).toFixed(1)+'%';
  $('segW').style.width=(r.win*100)+'%';$('segT').style.width=(r.tie*100)+'%';$('segL').style.width=(r.lose*100)+'%';
  $('segW').textContent=r.win>0.1?pct(r.win):'';
  $('segT').textContent=r.tie>0.1?pct(r.tie):'';
  $('segL').textContent=r.lose>0.1?pct(r.lose):'';
  $('kw').textContent=pct(r.win);$('kt').textContent=pct(r.tie);$('kl').textContent=pct(r.lose);
  const vs=' <span style="color:var(--ink-3)">vs</span> ';
  $('matchup').innerHTML=(mode==='hand'?handStr(live(hero)):'ヒーローのレンジ')+vs+(mode==='hand'?'レンジ':'相手のレンジ')+
    (live(board).length?' <span style="color:var(--ink-3)">/ ボード</span> '+handStr(live(board)):' <span style="color:var(--ink-3)">（プリフロップ）</span>')+
    (live(dead).length?' <span style="color:var(--ink-3)">/ デッド</span> '+handStr(live(dead)):'');
  const combos=w=>{let t=0;for(let i=0;i<13;i++)for(let j=0;j<13;j++)t+=w[i][j]*comboCount(CELLN[i][j]);return t.toFixed(t%1?1:0);};
  const chips=[];
  if(mode==='range')chips.push(['ヒーロー '+combos(ranges[0])+'コンボ → '+r.nCombos,false]);
  chips.push([(mode==='range'?'相手 ':'レンジ ')+combos(ranges[1])+'コンボ → '+r.nCombosOpp+'（ブロッカー除外後）',false]);
  chips.push([r.mode==='mc'?'モンテカルロ '+r.nRunouts.toLocaleString()+'ボード':
    live(board).length?'完全列挙 '+r.nRunouts.toLocaleString()+'ランナウト':'事前計算表（全ボード列挙済み）',true]);
  $('chips').innerHTML=chips.map(c=>'<span class="chip'+(c[1]?' acc':'')+'">'+c[0]+'</span>').join('');
  drawHeat(r);
}
function clearHeat(){
  for(const el of hmEl.querySelectorAll('.hc')){el.className='hc';el.style.background='';el.style.color='';el.textContent='';el.title='';el.removeAttribute('data-tip');}
  $('tbl').querySelector('tbody').innerHTML='';
  for(const P of RP){for(const r of P.eq)r.fill(-1);repaintGrid(P);}
}
/* Per-cell equity of one side's range, always in hero's terms: hero's equity
   with each hand of its own range, or against each hand of villain's. Within a
   cell, combos count by their share of the matchups, so a combo that blockers
   keep out of most pairs moves the cell less. */
function aggregate(r,k){
  const agg=Array.from({length:13},()=>Array.from({length:13},()=>({s:0,m:0,w:0,n:0})));
  for(const pc of k?r.opp.perCombo:r.perCombo){const [i,j]=cellOf(pc.a,pc.b);const a=agg[i][j],eq=k?1-pc.eq:pc.eq;
    a.s+=eq*pc.share;a.m+=pc.share;a.w+=pc.w;a.n++;}
  return agg;
}
/* Colours both range grids, and the heatmap for the range hmSide picks. */
function drawHeat(r){
  for(const P of RP){if(mode==='hand'&&!P.k)continue;
    const agg=aggregate(r,P.k);
    for(let i=0;i<13;i++)for(let j=0;j<13;j++){const a=agg[i][j];P.eq[i][j]=a.m>0?a.s/a.m:-1;}
    repaintGrid(P);}
  const agg=aggregate(r,hmSide),rows=[];
  for(let i=0;i<13;i++)for(let j=0;j<13;j++){
    const el=hmCells[i][j],a=agg[i][j];
    if(a.m<=0){el.className='hc';el.style.background='';el.style.color='';el.textContent='';el.removeAttribute('data-tip');continue;}
    const eq=a.s/a.m,c=divergeColor(eq);
    el.className='hc on';el.style.background=toCss(c);el.style.color=inkOn(c);
    el.textContent=Math.round(eq*100);
    el.dataset.tip=CELLN[i][j]+'  ヒーロー '+(eq*100).toFixed(1)+'%  ('+a.n+'コンボ, ウェイト'+Math.round(a.w/a.n*100)+'%)';
    rows.push([CELLN[i][j],eq,a.n,a.w/a.n]);
  }
  rows.sort((x,y)=>x[1]-y[1]);
  $('tbl').querySelector('tbody').innerHTML=rows.map(x=>
    '<tr><td>'+x[0]+'</td><td>'+(x[1]*100).toFixed(2)+'%</td><td>'+x[2]+'</td><td>'+Math.round(x[3]*100)+'%</td></tr>').join('');
}
/* Villain's range as the hands it makes on this board, strongest first, with
   hero's hand slotted in where it ranks. Weighted combo counts throughout, so
   "above hero" reads as a share of the range, not of the rows. */
function drawMade(){
  const B=live(board),H=live(hero),show=B.length>=3,b=rawRange(ranges[1]);$('mhPanel').hidden=!show;
  if(!show)return;
  const me=mode==='hand'&&H.length===2,G=madeHands(b,B,[...live(dead),...(me?H:[])]);
  const fmt=t=>t.toFixed(t%1?1:0),tot=G.reduce((s,g)=>s+g.w,0),pct=x=>tot>0?(x/tot*100).toFixed(1)+'%':'–';
  const hv=me?evalN([...H,...B]):-1,rows=[];let acc=0,above=-1,tie=0;
  const heroRow=()=>{above=acc;rows.push('<tr class="me"><td>'+handLabel(hv)+'</td><td>'+handStr(H)+'</td><td colspan="2">ヒーロー</td></tr>');};
  for(const g of G){
    if(me&&above<0&&g.v<=hv)heroRow();
    if(g.v===hv)tie=g.w;
    acc+=g.w;
    const cells=new Map();
    for(const [x,y] of g.combos){const [i,j]=cellOf(x,y),n=CELLN[i][j];cells.set(n,(cells.get(n)||[]).concat(cardName(Math.max(x,y))+cardName(Math.min(x,y))));}
    rows.push('<tr><td>'+handLabel(g.v)+'</td><td>'+
      [...cells].map(([n,cs])=>'<span title="'+cs.join(' ')+'">'+n+(cs.length<comboCount(n)?'×'+cs.length:'')+'</span>').join(' ')+
      '</td><td>'+fmt(g.w)+'</td><td>'+pct(acc)+'</td></tr>');
  }
  if(me&&above<0)heroRow();
  $('mhtbl').querySelector('tbody').innerHTML=rows.join('')||'<tr><td colspan="4">相手のレンジにコンボがありません</td></tr>';
  $('mhCur').textContent=me&&tot>0?' — 上に '+fmt(above)+'/'+fmt(tot)+'コンボ（'+pct(above)+'）'+(tie>0?'・同じ強さ '+fmt(tie):''):'';
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
function save(){try{localStorage.setItem('eqtool',JSON.stringify({hero,board,mode,hm:hmSide,
  ranges:ranges.map(w=>w.map(r=>Array.from(r))),precision}));}catch(e){}}
function load(){try{const s=JSON.parse(localStorage.getItem('eqtool'));
  if(!s||!Array.isArray(s.hero))return false;
  hero=s.hero.slice(0,2);board=(s.board||[]).slice(0,5);
  /* before range vs range, a save held the one villain range as `cells` */
  const saved=s.ranges||[null,s.cells];
  for(let k=0;k<2;k++)if(saved[k])for(let i=0;i<13;i++)for(let j=0;j<13;j++)ranges[k][i][j]=saved[k][i][j]||0;
  if(s.mode==='range')mode='range';if(s.hm===0)hmSide=0;
  /* precision used to be a Monte Carlo sample count for hand vs range */
  if(s.precision===2000||s.precision===10000)precision=s.precision;
  return true;}catch(e){return false;}}

/* ---- spots: named snapshots of mode, cards and both ranges, newest first ---- */
const spotDlg=$('spotdlg');
function loadSpots(){try{const s=JSON.parse(localStorage.getItem('eqspots'));return Array.isArray(s)?s.filter(x=>x&&typeof x.name==='string'):[];}catch(e){return [];}}
function storeSpots(L){try{localStorage.setItem('eqspots',JSON.stringify(L));return true;}catch(e){return false;}}
const cardStr=a=>live(a).map(c=>RANKS[c>>2]+SYM[c&3]).join('');
function snapshot(){return {mode,hero:live(hero),board:live(board),r:ranges.map(rangeText),t:Date.now()};}
/* what the spot is, as the default name and the line under each saved one */
function spotDesc(s){
  const pct=t=>{const w=newRange();parseRange(t||'',w);return (totalCombos(w)/13.26).toFixed(1)+'%';};
  return (s.mode==='range'?pct(s.r[0]):cardStr(s.hero)||'?')+' vs '+pct(s.r[1])+(s.board.length?' / '+cardStr(s.board):'');
}
/* Cards come back only if they are real and unclaimed, so a hand-edited
   store cannot put one card in two slots. */
function applySpot(s){
  const seen=new Set(),ok=c=>Number.isInteger(c)&&c>=0&&c<52&&!seen.has(c)&&seen.add(c);
  board=(s.board||[]).filter(ok).slice(0,5);hero=(s.hero||[]).filter(ok).slice(0,2);
  for(let k=0;k<2;k++)parseRange((s.r||[])[k]||'',ranges[k]);
  spotDlg.close();setMode(s.mode==='range'?'range':'hand');save();run();
}
function drawSpots(){
  const L=loadSpots(),ul=$('spotList');ul.innerHTML='';$('spotEmpty').hidden=L.length>0;
  for(const s of L){
    const li=document.createElement('li'),b=document.createElement('button'),d=document.createElement('button');
    b.type='button';b.className='spotload';b.innerHTML='<span class="nm"></span><span class="sub"></span>';
    b.firstChild.textContent=s.name;
    b.lastChild.textContent=(s.mode==='range'?'レンジ vs レンジ':'ハンド vs レンジ')+' · '+spotDesc(s)+
      (s.t?' · '+new Date(s.t).toLocaleDateString():'');
    b.addEventListener('click',()=>applySpot(s));
    d.type='button';d.className='tbtn spotdel';d.textContent='削除';d.setAttribute('aria-label','「'+s.name+'」を削除');
    d.addEventListener('click',()=>{storeSpots(loadSpots().filter(x=>x.name!==s.name));$('spotMsg').textContent='「'+s.name+'」を削除しました。';drawSpots();});
    li.append(b,d);ul.appendChild(li);
  }
}
$('spotBtn').addEventListener('click',()=>{closeMenu();$('spotName').value='';$('spotName').placeholder=spotDesc(snapshot());
  $('spotMsg').textContent='';drawSpots();spotDlg.showModal();});
$('spotForm').addEventListener('submit',e=>{e.preventDefault();
  const s=snapshot();s.name=$('spotName').value.trim()||spotDesc(s);
  const L=loadSpots(),over=L.some(x=>x.name===s.name);
  if(!storeSpots([s,...L.filter(x=>x.name!==s.name)])){$('spotMsg').textContent='このブラウザでは保存できませんでした。';return;}
  $('spotMsg').textContent='「'+s.name+'」を'+(over?'上書き':'保存')+'しました。';$('spotName').value='';drawSpots();});
$('spotClose').addEventListener('click',()=>spotDlg.close());
onBackdrop(spotDlg,()=>spotDlg.close());

/* ---- mode and heatmap side ---- */
const pressed=(box,el)=>{for(const x of box.children)x.setAttribute('aria-pressed',x===el?'true':'false');};
function setHmSide(s){
  hmSide=mode==='hand'?1:s;
  pressed($('hmbtns'),$('hmbtns').children[hmSide]);
  $('hmnote').textContent=hmSide?'相手のレンジの各ハンドに対するヒーローのエクイティ。':'ヒーローのレンジの各ハンドのエクイティ。';
  if(lastRes)drawHeat(lastRes);else clearHeat();
}
function setMode(m){
  mode=m;
  pressed($('mbtns'),$('mbtns').querySelector('[data-m="'+m+'"]'));
  /* the hero panel holds either the two-card hand or the range editor */
  $('heroGrp').hidden=m!=='hand';RP[0].el.querySelector('.reditor').hidden=m==='hand';
  $('hmbtns').hidden=m==='hand';$('cols').classList.toggle('rvr',m==='range');
  RP[0].title.textContent=m==='hand'?'ヒーローのハンド':'ヒーローのレンジ';RP[1].title.textContent='相手のレンジ';
  /* hero's cards were ignored in range mode, so board or dead may have taken one */
  if(m==='hand'){const u=new Set([...board,...dead]);hero=hero.map(c=>u.has(c)?null:c);}
  lastRes=null;
  for(const P of RP){repaintAll(P);syncText(P);}
  setHmSide(hmSide);render();
}

/* ---- controls ---- */
$('mbtns').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.dataset.m===mode)return;
  setMode(b.dataset.m);schedule();});
$('hmbtns').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;setHmSide(+b.dataset.s);save();});
$('precBtn').addEventListener('click',()=>{precision=precision>2000?2000:10000;$('precBtn').hidden=true;run();});
$('clrHero').addEventListener('click',()=>{hero=[];render();schedule();});
$('clrBoard').addEventListener('click',()=>{board=[];render();schedule();});

/* ---- boot ---- */
applyTheme();buildSlots();buildPicker();buildPanels();buildHeatGrid();startWorker();
if(!load()){
  hero=[(12<<2)|3,(11<<2)|3]; board=[];
  selectTopPct(RP[1],15);
}
setMode(mode);run();
