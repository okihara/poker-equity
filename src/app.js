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
  PAL.opp2=rgb2oklab(hex2rgb(cssVar('--opp2')));
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
/* Three players split the pot a third each, so in 3-player mode the scale's
   midpoint moves to 1/3: 0..1/3 fills the low half, 1/3..1 the high half. */
const eqT=e=>mode!=='multi'?e:e<1/3?e*1.5:0.5+(e-1/3)*0.75;
const sideLab=k=>[PAL.hero,PAL.opp,PAL.opp2][k];
const lum=c=>0.2126*s2l(c[0])+0.7152*s2l(c[1])+0.0722*s2l(c[2]);
const inkOn=c=>lum(c)>0.32?'#0e1620':'#ffffff';

/* ================= state ================= */
/* mode 'hand': hero's two cards vs ranges[1]. mode 'range': ranges[0] vs
   ranges[1], each edited in its own panel RP[k], hero's first. mode 'multi'
   (wide screens only): ranges[0], [1] and [2] all-in three ways. */
/* dead cards have no input for now; the engine still takes them */
const dead=[];
let hero=[], board=[], activeSlot=null; // the slot the open picker fills
let mode='hand', hmSide=1; // hmSide: the range the heatmap shows
/* A range is 13x13 cell weights plus cut, the combos (ckey) taken out one by
   one, which a cell weight cannot say: the call filter keeps A♥K♥ and drops
   the other AKs. Painting a cell, a preset or text puts its combos back. */
const newRange=()=>{const w=Array.from({length:13},()=>new Float64Array(13));w.cut=new Set();return w;};
const ckey=(a,b)=>a<b?a*52+b:b*52+a;
/* combos of cell i,j still in range w */
function keptIn(w,i,j){if(!w.cut.size)return comboCount(CELLN[i][j]);let n=0;for(const [a,b] of cellCombos(i,j))if(!w.cut.has(ckey(a,b)))n++;return n;}
const ranges=[newRange(),newRange(),newRange()];
const PN=['ヒーロー','相手1','相手2']; // player names in 3-player mode
const wideMq=window.matchMedia('(min-width:1100px)'); // where the 3-player button shows
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
  if(RP.length){for(const P of RP)repaintGrid(P);if(lastRes)drawHeat(lastRes);if(fsRes)drawMini();}
}
try{const t=localStorage.getItem('eqtheme');if(t==='light'||t==='dark')theme=t;}catch(e){}
darkMq.addEventListener('change',()=>{if(theme==='auto')applyTheme();});
$('themeBtns').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  theme=b.dataset.t;try{localStorage.setItem('eqtheme',theme);}catch(e){}applyTheme();});
$('pickRemove').addEventListener('click',()=>{if(!activeSlot)return;
  cardsOf(activeSlot.kind)[activeSlot.i]=null;schedule();closePicker();});
/* ---- range panels: villain's #rp1 is in the markup; hero's #rp0 and the
   3-player mode's second villain #rp2 are its clones ---- */
const RP=[];
function buildPanels(){
  const v=$('rp1'),h=v.cloneNode(true),v2=v.cloneNode(true);
  h.id='rp0';h.dataset.k='0';v2.id='rp2';v2.dataset.k='2';
  h.insertBefore($('heroGrp'),h.querySelector('.reditor'));
  v.parentNode.insertBefore(h,v);v.after(v2);
  for(const el of [h,v,v2]){
    const k=+el.dataset.k,q=c=>el.querySelector('.'+c),nm=['ヒーロー','相手','相手2'][k];
    const P={k,el,w:ranges[k],eq:Array.from({length:13},()=>new Float64Array(13).fill(-1)),paintW:1,
      grid:q('rgrid'),slider:q('topSlider'),out:q('topOut'),text:q('rtext'),info:q('rangeInfo'),title:q('rtitle'),bk:q('bk')};
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
function setCell(P,i,j,w){let un=false;if(P.w.cut.size)for(const [a,b] of cellCombos(i,j))un=P.w.cut.delete(ckey(a,b))||un;
  if(P.w[i][j]!==w||un){P.w[i][j]=w;paintCell(P,i,j);}}
function paintCell(P,i,j){
  /* a cell the call filter thinned shows as the weight of what is left */
  const el=P.grid.children[i*13+j],n=comboCount(CELLN[i][j]),k=keptIn(P.w,i,j),w=P.w[i][j]*k/n;
  /* Colour carries equity (the heatmap's scale, or the side's own colour before
     a result exists) at full strength; weight is the filled height from the
     bottom, so a partial weight never turns into a washed-out tint. */
  if(w>0){const e=P.eq[i][j],c=oklab2rgb(e>=0?divergeLab(eqT(e)):sideLab(P.k)),h=(w*100).toFixed(1)+'%';
    el.classList.add('on');
    el.style.background=w<1?'linear-gradient(to top,'+toCss(c)+' '+h+',var(--surface-2) '+h+')':toCss(c);
    el.style.color=w>=0.5?inkOn(c):'var(--ink)';
    el.textContent=CELLN[i][j];el.title=CELLN[i][j]+' — ウェイト '+Math.round(w*100)+'%'+(k<n?'（絞り込みで '+k+'/'+n+' コンボ）':'')+(e>=0?' / '+(mode==='multi'?PN[P.k]:'ヒーロー')+' '+(e*100).toFixed(1)+'%':'');}
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
  /* the list: a preset's value is "p:<index>", a saved range's "s:<name>" */
  P.sel=q('rsel');
  P.sel.addEventListener('change',()=>{const v=P.sel.value;
    if(v.startsWith('p:'))top(PRESETS[+v.slice(2)][1]);
    else if(v.startsWith('s:')){const s=loadRanges().find(x=>x.name===v.slice(2));if(s)applyRange(P,s);}
    P.sel.value=v;q('rdel').hidden=!v.startsWith('s:');});
  const form=q('rsave'),name=q('rname'),close=()=>{form.hidden=true;};
  q('rsaveBtn').addEventListener('click',()=>{form.hidden=!form.hidden;if(!form.hidden){name.value='';
    const t=totalCombos(P.w);name.placeholder=(t/13.26).toFixed(1)+'%（'+t.toFixed(t%1?1:0)+' コンボ）';name.focus();}});
  q('rcancel').addEventListener('click',close);
  form.addEventListener('submit',e=>{e.preventDefault();const nm=name.value.trim()||name.placeholder;
    if(!putEntry('eqranges',{name:nm,r:rangeText(P.w),x:[...P.w.cut],t:Date.now()})){flash('このブラウザでは保存できませんでした。');return;}
    close();fillRangeLists();P.sel.value='s:'+nm;q('rdel').hidden=false;});
  q('rdel').addEventListener('click',()=>{const v=P.sel.value;if(!v.startsWith('s:'))return;
    dropEntry('eqranges',v.slice(2));fillRangeLists();});
  q('applyText').addEventListener('click',()=>{applyText(P);syncText(P);});
  q('callCut').addEventListener('click',()=>callCut(P));
  q('uncut').addEventListener('click',()=>{P.w.cut.clear();repaintAll(P);schedule();});
}

/* ---- range helpers ---- */
function totalCombos(w){let t=0;for(let i=0;i<13;i++)for(let j=0;j<13;j++)if(w[i][j]>0)t+=w[i][j]*keptIn(w,i,j);return t;}
/* Thin P's range to what can call on the board (engine canCall). Combos the
   board blocks stay: the engine drops them anyway, and they come back if the
   board changes. */
function callCut(P){
  const B=live(board);if(B.length<3)return;
  for(let i=0;i<13;i++)for(let j=0;j<13;j++)if(P.w[i][j]>0)for(const [a,b] of cellCombos(i,j))
    if(!B.includes(a)&&!B.includes(b)&&!canCall(a,b,B))P.w.cut.add(ckey(a,b));
  repaintAll(P);schedule();
}
function selectTopPct(P,p){
  const target=1326*p/100;let acc=0;
  for(const r of P.w)r.fill(0);P.w.cut.clear();
  for(const nm of RANK_ORDER){
    const n=comboCount(nm);if(acc+n>target+1e-9)break;
    const [i,j]=NAME2IJ[nm];P.w[i][j]=1;acc+=n;
  }
  repaintAll(P);syncText(P);
}
/* ---- saved ranges: named range texts with their cuts, shared by every panel ---- */
/* Saved ranges (eqranges) and spots (eqspots) are lists of {name,t,...}, t the
   time of the last change. A deletion stays as {name,del:true,t}, so that sync
   can carry it to the other devices; the lists people see leave those out. */
const rawList=k=>{try{const s=JSON.parse(localStorage.getItem(k));return Array.isArray(s)?s.filter(x=>x&&typeof x.name==='string'):[];}catch(e){return [];}};
const storeList=(k,L)=>{try{localStorage.setItem(k,JSON.stringify(L));return true;}catch(e){return false;}};
/* e, newest first, in place of any entry of its name */
const putEntry=(k,e)=>{const ok=storeList(k,[e,...rawList(k).filter(x=>x.name!==e.name)]);if(ok)syncSoon();return ok;};
const dropEntry=(k,name)=>putEntry(k,{name,del:true,t:Date.now()});
function loadRanges(){return rawList('eqranges').filter(x=>!x.del&&typeof x.r==='string');}
function applyRange(P,s){parseRange(s.r,P.w);for(const c of s.x||[])if(Number.isInteger(c))P.w.cut.add(c);
  repaintAll(P);syncText(P);schedule();}
const escHtml=t=>t.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* rebuild every panel's list, keeping each one's pick where it still exists */
function fillRangeLists(){
  const L=loadRanges();
  for(const P of RP){const v=P.sel.value;
    P.sel.innerHTML='<option value="">プリセット・保存したレンジ…</option><optgroup label="プリセット（MTT 100bb chipEV オープン）">'+
      PRESETS.map(([l],i)=>'<option value="p:'+i+'">'+l+'</option>').join('')+'</optgroup>'+
      (L.length?'<optgroup label="保存したレンジ">'+L.map(x=>'<option value="s:'+escHtml(x.name)+'">'+escHtml(x.name)+'</option>').join('')+'</optgroup>':'');
    P.sel.value=[...P.sel.options].some(o=>o.value===v)?v:'';P.el.querySelector('.rdel').hidden=!P.sel.value.startsWith('s:');}
}
function updateRangeInfo(P){
  /* any change to the range unpicks the list; applying a pick sets it again after */
  if(P.sel&&P.sel.value){P.sel.value='';P.el.querySelector('.rdel').hidden=true;}
  const t=totalCombos(P.w);
  P.info.textContent=t.toFixed(t%1?1:0)+' コンボ / 1326 ('+(t/13.26).toFixed(1)+'%)'+(P.w.cut.size?' 絞り込み中':'');
  P.el.querySelector('.uncut').hidden=!P.w.cut.size;
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
  for(const r of w)r.fill(0);w.cut.clear();
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
  for(const P of RP)P.el.querySelector('.callCut').disabled=live(board).length<3;
  const faces=a=>a.map(c=>'<span class="'+faceCls(c).trim()+'">'+face(c)+'</span>').join(''),B=live(board),H=mode==='hand'?live(hero):[];
  $('stickHero').innerHTML=faces(H);$('stickHero').hidden=!H.length;
  $('stickBoard').innerHTML=B.length?faces(B):'<span class="stickpf">プリフロップ</span>';
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
const calcHere=j=>{const o={mcBoards:j.mcBoards,trials:j.trials,onProgress:j.onProgress,isStale:j.isStale};
  return j.multi?computeMultiEquity(j.multi,j.board,j.dead,o):computeRangeEquity(j.a,j.b,j.board,j.dead,o);};
/* a and b: hero's and villain's ranges; or a alone as the list of every player's (3-player mode) */
function calc(id,a,b,onProgress,isStale){
  return new Promise(done=>{
    /* a newer query supersedes the rest; the worker drops them without answering */
    for(const [k,j] of jobs){jobs.delete(k);j.done({stale:true});}
    const multi=b?null:a,j={a,b,multi,board:live(board),dead:live(dead),mcBoards:precision,trials:precision>2000?5e6:1e6,onProgress,isStale,done};
    if(!worker){calcHere(j).then(done);return;}
    jobs.set(id,j);worker.postMessage({id,a,b,multi,board:j.board,dead:j.dead,opts:{mcBoards:j.mcBoards,trials:j.trials}});
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
  drawMres(null);
  for(const id of ['segW','segT','segL']){const e=$(id);e.style.width='0';e.textContent='';}
  $('kw').textContent='–';$('kt').textContent='–';$('kl').textContent='–';
  $('chips').innerHTML='';$('matchup').innerHTML='';$('resmsg').textContent=msg;$('resmsg').hidden=!msg;
  $('prog').classList.remove('on');
  clearHeat();
}
function rawRange(w){const raw=[];
  for(let i=0;i<13;i++)for(let j=0;j<13;j++){const x=w[i][j];if(x>0)for(const c of cellCombos(i,j))if(!w.cut.has(ckey(c[0],c[1])))raw.push([c[0],c[1],x]);}
  return raw;}
async function run(){
  const my=++token;
  drawMade();fsState();
  const H=live(hero),nb=live(board).length;
  if(mode==='hand'&&H.length<2){clearResult('ヒーローの2枚を選んでください。');return;}
  if(nb===1||nb===2){clearResult('ボードは0枚・3枚・4枚・5枚のどれかにしてください。');return;}
  let a,b=null;
  if(mode==='multi'){a=ranges.map(rawRange);const e=a.findIndex(r=>!r.length);
    if(e>=0){clearResult(PN[e]+'のレンジを選んでください。');return;}}
  else{a=mode==='hand'?[[H[0],H[1],1]]:rawRange(ranges[0]);b=rawRange(ranges[1]);
    if(!a.length){clearResult('ヒーローのレンジを選んでください。');return;}
    if(!b.length){clearResult('相手のレンジを選んでください。');return;}}
  $('prog').classList.add('on');$('progi').style.width='0%';
  const res=await calc(my,a,b,
    (p,eq)=>{if(my!==token)return;$('progi').style.width=(p*100).toFixed(0)+'%';
      /* runouts and trials go in random order, so the running figure is a fair estimate */
      if(mode==='multi'){drawMres({players:eq.map(x=>({equity:x}))},true);return;}
      if(eq>=0){$('eqv').textContent=(eq*100).toFixed(1);$('eqv').parentNode.classList.add('interim');$('eqse').textContent='計算中';}},
    ()=>my!==token);
  if(my!==token)return;
  $('prog').classList.remove('on');$('eqv').parentNode.classList.remove('interim');$('mres').classList.remove('interim');
  if(res.stale)return;
  if(res.error){clearResult(res.error);return;}
  lastRes=res;showResult(res);save();
}
/* 3-player mode's figures, one block per player; r null clears them, and
   interim greys out a running estimate (it has equity only). */
function drawMres(r,interim){
  const m=$('mres');
  if(!m.children.length)m.innerHTML=PN.map((n,k)=>'<div class="mp" data-k="'+k+'"><div class="mpn">'+n+'</div>'+
    '<div class="mpv"><span class="v">–</span><span class="pct">%</span></div><div class="mps"></div></div>').join('');
  m.classList.toggle('interim',!!interim);
  for(let k=0;k<3;k++){const b=m.children[k],p=r&&r.players[k];
    b.querySelector('.v').textContent=p?(p.equity*100).toFixed(interim?1:2):'–';
    b.querySelector('.mps').textContent=!p?'':interim?'計算中':
      '± '+(r.se[k]*196).toFixed(2)+' · 勝ち '+(p.win*100).toFixed(1)+'% · 引分 '+(p.tie*100).toFixed(1)+'%';}
}
function showMulti(r){
  $('resmsg').hidden=true;drawMres(r);
  $('precBtn').hidden=false;
  $('precBtn').textContent=precision>2000?'標準精度に戻す':'高精度で再計算（約5倍の時間）';
  $('matchup').innerHTML=PN.join(' <span style="color:var(--ink-3)">vs</span> ')+
    (live(board).length?' <span style="color:var(--ink-3)">/ ボード</span> '+handStr(live(board)):' <span style="color:var(--ink-3)">（プリフロップ）</span>');
  const chips=PN.map((n,k)=>[n+' '+totalCombos(ranges[k]).toFixed(0)+'コンボ → '+r.players[k].nCombos,false]);
  chips.push(['モンテカルロ '+r.nTrials.toLocaleString()+'回',true]);
  $('chips').innerHTML=chips.map(c=>'<span class="chip'+(c[1]?' acc':'')+'">'+c[0]+'</span>').join('');
  drawHeat(r);
}
function showResult(r){
  if(mode==='multi'){showMulti(r);return;}
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
  const combos=w=>{const t=totalCombos(w);return t.toFixed(t%1?1:0);};
  const chips=[];
  if(mode==='range')chips.push(['ヒーロー '+combos(ranges[0])+'コンボ → '+r.nCombos,false]);
  chips.push([(mode==='range'?'相手 ':'レンジ ')+combos(ranges[1])+'コンボ → '+r.nCombosOpp+'（ブロッカー除外後）',false]);
  chips.push([r.mode==='mc'?'モンテカルロ '+r.nRunouts.toLocaleString()+'ボード':
    live(board).length?'完全列挙 '+r.nRunouts.toLocaleString()+'ランナウト':'事前計算表（全ボード列挙済み）',true]);
  $('chips').innerHTML=chips.map(c=>'<span class="chip'+(c[1]?' acc':'')+'">'+c[0]+'</span>').join('');
  drawHeat(r);
}
/* Buckets, three kinds stacked, strongest first in each. Equity: how much of
   each range sits in each of seven bands of its own player's equity; the
   middle band straddles the fair share -- 50% heads-up, 1/3 three ways -- and
   the bands narrow towards it, where the close calls are. Made hands and draws
   (a flop or later; no draws on the river): the range split by handClass, with
   each class's average equity. Combos count by share, so blockers weigh in. */
const bkCut=()=>mode==='multi'?[10,20,30,40,50,70]:[20,35,45,55,65,80];
function drawBuckets(r){
  const B=live(board),c=bkCut(),cut=c.map(x=>x/100);
  /* per kind: title, names strongest first, and each combo's row in that order */
  const kinds=[['エクイティ',[...c,0].map((x,i)=>!i?'〜'+x+'%':i===c.length?c[i-1]+'%〜':c[i-1]+'〜'+x+'%').reverse(),
    pc=>{let i=0;while(i<cut.length&&pc.eq>=cut[i])i++;return c.length-i;}]];
  if(B.length>=3)kinds.push(['役',MADE,pc=>handClass(pc.a,pc.b,B)[0]]);
  if(B.length>=3&&B.length<5)kinds.push(['ドロー',DRAW,pc=>handClass(pc.a,pc.b,B)[1]]);
  for(const P of RP){
    /* a lone hand has nothing to bucket; the second villain plays only three ways */
    P.bk.hidden=mode==='hand'&&!P.k||mode!=='multi'&&P.k===2;if(P.bk.hidden)continue;
    const pcs=!r?[]:r.players?r.players[P.k].perCombo:P.k?r.opp.perCombo:r.perCombo;
    /* with no result the rows stay, empty, so the panel keeps its height */
    P.bk.innerHTML=kinds.map(([title,nm,row])=>{
      const s=nm.map(()=>0),e=nm.map(()=>0),shade=j=>'b'+Math.round((nm.length-1-j)*6/(nm.length-1));
      for(const pc of pcs){const j=row(pc);s[j]+=pc.share;e[j]+=pc.share*pc.eq;}
      return '<span class="bks">'+title+'</span><span class="bkh">割合</span><span class="bkh">EQ</span>'+
        nm.map((n,j)=>'<span class="bkn"><i class="'+shade(j)+'"></i>'+n+'</span>'+
        '<span class="bkt"><i class="'+shade(j)+'" style="width:'+(s[j]*100)+'%"></i></span><span class="bkp">'+(r?(s[j]*100).toFixed(1)+'%':'–')+'</span>'+
        '<span class="bkq">'+(!r?'':s[j]>0?(e[j]/s[j]*100).toFixed(1)+'%':'–')+'</span>').join('');}).join('');}
}
/* Equity chart: each player's combos sorted by their own equity, as a step
   line whose steps are as wide as the combo's share. chart keeps the sorted
   combos and where each step ends, for the hover readout. */
let chart=[];
function drawChart(r){
  const paths=$('plot').querySelectorAll('.ln'),names=mode==='multi'?PN:['ヒーロー','相手'];
  const sides=!r?[]:r.players?r.players.map((p,k)=>[k,p.perCombo,p.equity]):[[0,r.perCombo,r.equity],[1,r.opp.perCombo,r.opp.equity]];
  for(const p of paths)p.setAttribute('d','');chart=[];
  for(const [k,pcs] of sides){
    const s=pcs.slice().sort((a,b)=>a.eq-b.eq),ends=[];let x=0,d='';
    for(const pc of s){const y=(100-pc.eq*100).toFixed(2);x+=pc.share*100;d+=(d?'V'+y:'M0 '+y)+'H'+x.toFixed(2);ends.push(x);}
    paths[k].setAttribute('d',d);chart.push({s,ends,name:names[k]});}
  $('chartKey').innerHTML=sides.map(([k,,eq])=>'<span><i class="c'+k+'"></i>'+names[k]+' <b>'+(eq*100).toFixed(1)+'%</b></span>').join('');
}
function clearHeat(){
  drawBuckets(null);drawChart(null);
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
  /* 3-player mode: each player's own equity, there being no one view to take */
  const pcs=r.players?r.players[k].perCombo:k?r.opp.perCombo:r.perCombo,own=!!r.players;
  for(const pc of pcs){const [i,j]=cellOf(pc.a,pc.b);const a=agg[i][j],eq=k&&!own?1-pc.eq:pc.eq;
    a.s+=eq*pc.share;a.m+=pc.share;a.w+=pc.w;a.n++;}
  return agg;
}
/* Colours both range grids, and the heatmap for the range hmSide picks. */
function drawHeat(r){
  drawBuckets(r);drawChart(r);
  for(const P of RP){if(mode==='hand'&&!P.k)continue;
    const agg=aggregate(r,P.k);
    for(let i=0;i<13;i++)for(let j=0;j<13;j++){const a=agg[i][j];P.eq[i][j]=a.m>0?a.s/a.m:-1;}
    repaintGrid(P);}
  const agg=aggregate(r,hmSide),rows=[];
  for(let i=0;i<13;i++)for(let j=0;j<13;j++){
    const el=hmCells[i][j],a=agg[i][j];
    if(a.m<=0){el.className='hc';el.style.background='';el.style.color='';el.textContent='';el.removeAttribute('data-tip');continue;}
    const eq=a.s/a.m,c=divergeColor(eqT(eq));
    el.className='hc on';el.style.background=toCss(c);el.style.color=inkOn(c);
    el.textContent=Math.round(eq*100);
    el.dataset.tip=CELLN[i][j]+'  '+(r.players?PN[hmSide]:'ヒーロー')+' '+(eq*100).toFixed(1)+'%  ('+a.n+'コンボ, ウェイト'+Math.round(a.w/a.n*100)+'%)';
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
  const B=live(board),H=live(hero),show=B.length>=3&&mode!=='multi',b=rawRange(ranges[1]);$('mhPanel').hidden=!show;
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
  tip.textContent=t.dataset.tip;tip.classList.remove('multi');tip.classList.add('on');});
hmEl.addEventListener('pointermove',e=>{if(!tip.classList.contains('on'))return;
  const x=Math.min(window.innerWidth-tip.offsetWidth-8,e.clientX+12);
  tip.style.left=x+'px';tip.style.top=(e.clientY-tip.offsetHeight-10)+'px';});
hmEl.addEventListener('pointerleave',()=>tip.classList.remove('on'));

/* the chart's readout: every line's combo at the pointer's place in its range */
const plot=$('plot'),guide=$('guide');
plot.addEventListener('pointermove',e=>{
  const rc=plot.getBoundingClientRect(),x=Math.max(0,Math.min(100,(e.clientX-rc.left)/rc.width*100));
  if(!chart.length){tip.classList.remove('on');guide.classList.remove('on');return;}
  const rows=chart.map(c=>{let i=0;while(i<c.ends.length-1&&c.ends[i]<x)i++;const pc=c.s[i],hi=Math.max(pc.a,pc.b),lo=Math.min(pc.a,pc.b);
    return c.name+'  '+(pc.eq*100).toFixed(1)+'%  '+cardName(hi)+cardName(lo);});
  guide.style.left=x+'%';guide.classList.add('on');
  tip.textContent='レンジの '+x.toFixed(0)+'% 地点\n'+rows.join('\n');tip.classList.add('on','multi');
  tip.style.left=Math.min(window.innerWidth-tip.offsetWidth-8,e.clientX+12)+'px';tip.style.top=(e.clientY-tip.offsetHeight-10)+'px';});
plot.addEventListener('pointerleave',()=>{tip.classList.remove('on','multi');guide.classList.remove('on');});

function drawLegend(){
  const stops=[];for(let i=0;i<=10;i++){const c=divergeColor(i/10);stops.push(toCss(c)+' '+(i*10)+'%');}
  $('legbar').style.background='linear-gradient(90deg,'+stops.join(',')+')';
  /* the ticks sit at 0, 25, 50, 75, 100% of the bar; eqT moves what they mean */
  const t=mode==='multi'?['0%','17%','33%','67%','100%']:['0%','25%','50%','75%','100%'];
  [...$('legticks').children].forEach((x,i)=>x.textContent=t[i]);
}

/* ---- flop set: every flop class's equities, on a Worker of its own so the
   main result keeps coming while it runs; then filtered and drawn here ---- */
const FSF=[['suits','スーツ',['レインボー','ツートーン','モノトーン']],['pair','ペア',['ペアなし','ペアあり','トリプル']],
  ['conn','コネクト',['非コネクト','OESDあり','コネクト']],
  ...[['hi','最も高いカード'],['mid','中間のカード'],['lo','最も低いカード']].map(([k,t])=>[k,t,[...RANKS].reverse(),[...RANKS].map((x,i)=>12-i)])];
const fsSel={suits:-1,pair:-1,conn:-1,hi:-1,mid:-1,lo:-1};
let fsRes=null,fsSig='',fsW=null,fsId=0,fsJob=null; // fsJob: the latest run's {done,prog}
/* what the result depends on: the mode and the ranges in play */
const fsRanges=()=>mode==='multi'?ranges:ranges.slice(0,2);
const fsSigNow=()=>mode+'|'+fsRanges().map(w=>rangeText(w)+'/'+[...w.cut].join(',')).join('|');
function buildFsFilters(){
  $('fsFilt').innerHTML=FSF.map(([k,t,labels,vals])=>'<div><div class="lbl">'+t+'</div><div class="segbtns" data-f="'+k+'" role="group" aria-label="'+t+'">'+
    '<button data-v="-1" aria-pressed="true">すべて</button>'+labels.map((l,i)=>'<button data-v="'+(vals?vals[i]:i)+'" aria-pressed="false">'+l+'</button>').join('')+'</div></div>').join('');
  $('fsFilt').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const g=b.parentNode;
    fsSel[g.dataset.f]=+b.dataset.v;pressed(g,b);drawFlopSet();});
}
function fsState(){
  /* the flop classes stand for every suit alike, which a thinned range does not */
  const cut=fsRanges().some(w=>w.cut.size),ok=mode!=='hand'&&!cut;$('fsRun').disabled=!ok;
  $('fsMsg').textContent=mode==='hand'?'レンジ vs レンジと3人モードで使えます。':cut?'コールできるハンドに絞ったレンジがあると使えません。':fsRes&&fsSig!==fsSigNow()?'レンジが変わりました。もう一度計算してください。':'';
  $('fsBars').classList.toggle('stale',!!fsRes&&fsSig!==fsSigNow());
}
function runFlopSet(){
  if($('fsRun').disabled)return;
  const id=++fsId,sig=fsSigNow(),rs=(mode==='multi'?ranges:ranges.slice(0,2)).map(rawRange),e=rs.findIndex(r=>!r.length);
  if(e>=0){$('fsMsg').textContent=(mode==='multi'?PN[e]:['ヒーロー','相手'][e])+'のレンジを選んでください。';return;}
  $('fsProg').classList.add('on');$('fsProgi').style.width='0%';$('fsRun').textContent='計算中…';
  const done=r=>{if(id!==fsId||r.stale)return;$('fsProg').classList.remove('on');$('fsRun').textContent='全フロップを計算';
    r.names=mode==='multi'?PN:['ヒーロー','相手'];fsRes=r;fsSig=sig;fsState();drawFlopSet();};
  const prog=p=>{if(id===fsId)$('fsProgi').style.width=(p*100).toFixed(0)+'%';};
  /* The worker outlives runs, so its handler goes through fsJob: bound to the
     first run's done and prog, it dropped every later run's answer as stale. */
  fsJob={done,prog};
  if(!fsW)try{fsW=new Worker(URL.createObjectURL(new Blob([$('engine').textContent],{type:'text/javascript'})));
    fsW.onmessage=e=>{const m=e.data;if(m.id!==fsId)return;if(m.result)fsJob.done(m.result);else fsJob.prog(m.progress);};
    fsW.onerror=()=>{fsW=null;};}catch(err){fsW=null;}
  if(fsW)fsW.postMessage({id,flopset:rs,opts:{}});
  else computeFlopSet(rs,{onProgress:prog,isStale:()=>id!==fsId}).then(done);
}
/* the filtered flops as bars, players stacked from the bottom; labels are the
   ranks high to low in their suit's colour */
function drawFlopSet(){
  const bars=$('fsBars');
  if(!fsRes){bars.innerHTML='';$('fsKey').innerHTML='';fsShown=[];drawMini();return;}
  const names=fsRes.names,P=names.length;
  const L=fsShown=fsRes.flops.filter(f=>{if(!f.tx)f.tx=flopTexture(f.c);return Object.keys(fsSel).every(k=>fsSel[k]<0||f.tx[k]===fsSel[k]);});
  bars.innerHTML=L.map(f=>'<div class="fsb" data-i="'+fsRes.flops.indexOf(f)+'"><div class="fsst">'+
    (f.eq?f.eq.map((x,k)=>'<i class="c'+k+'" style="height:'+(x*100).toFixed(2)+'%"></i>').join(''):'')+'</div>'+
    '<div class="fsl">'+f.c.map(c=>'<b class="s'+(c&3)+'">'+RANKS[c>>2]+'</b>').join('')+'</div></div>').join('');
  /* weighted by how many raw flops each class stands for */
  const s=new Float64Array(P);let n=0;
  for(const f of L)if(f.eq){n+=f.n;for(let k=0;k<P;k++)s[k]+=f.eq[k]*f.n;}
  $('fsKey').innerHTML=(n?[...s].map((x,k)=>'<span><i class="c'+k+'"></i>'+names[k]+' <b>'+(x/n*100).toFixed(1)+'%</b></span>').join(''):'')+
    '<span>'+L.length.toLocaleString()+' 種（'+n.toLocaleString()+' 通り）のフロップ</span>';
  $('fsScroll').scrollLeft=0;drawMini();
}
/* The overview under the bars: the same filtered flops squeezed into the
   width, the scrolled-to stretch framed, and where each high card starts. */
let fsShown=[];
function drawMini(){
  const box=$('fsMini');box.hidden=!fsRes||!fsShown.length;if(box.hidden)return;
  const cv=$('fsMiniC'),w=cv.clientWidth,h=cv.clientHeight,dpr=window.devicePixelRatio||1,n=fsShown.length,bw=w/n;
  cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);
  const g=cv.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  const col=['--hero','--opp','--opp2'].map(cssVar);
  fsShown.forEach((f,i)=>{if(!f.eq)return;let y=h;
    /* a hair wider than its slot, so neighbouring columns leave no seams */
    f.eq.forEach((x,k)=>{const d=x*h;g.fillStyle=col[k];g.fillRect(i*bw,y-d,bw+0.5,d);y-=d;});});
  /* labels at each high card's first flop; ones that would crowd the last merge into it ("5432") */
  const lab=[];let last=-99;
  fsShown.forEach((f,i)=>{if(i&&f.c[0]>>2===fsShown[i-1].c[0]>>2)return;const x=i*bw,r=RANKS[f.c[0]>>2];
    if(lab.length&&x-last<14)lab[lab.length-1][1]+=r;else{lab.push([x,r]);last=x;}});
  $('fsMLab').innerHTML=lab.map(([x,t])=>'<span style="left:'+x.toFixed(1)+'px">'+t+'</span>').join('');
  frameMini();
}
function frameMini(){
  const sc=$('fsScroll'),v=$('fsView'),W=sc.scrollWidth||1,w=$('fsMiniC').clientWidth;
  v.style.left=(sc.scrollLeft/W*w)+'px';v.style.width=Math.max(6,sc.clientWidth/W*w)+'px';
}
$('fsScroll').addEventListener('scroll',frameMini);
/* tap or drag on the overview: centre the bars on that point */
(()=>{const mb=$('fsMini').querySelector('.fsminibox');let on=false;
  const go=e=>{const r=mb.getBoundingClientRect(),sc=$('fsScroll');
    sc.scrollLeft=(e.clientX-r.left)/r.width*sc.scrollWidth-sc.clientWidth/2;};
  mb.addEventListener('pointerdown',e=>{on=true;mb.setPointerCapture(e.pointerId);go(e);});
  mb.addEventListener('pointermove',e=>{if(on)go(e);});
  for(const t of ['pointerup','pointercancel'])mb.addEventListener(t,()=>{on=false;});
  new ResizeObserver(()=>{if(fsRes)drawMini();}).observe(mb);})();
$('fsRun').addEventListener('click',runFlopSet);
$('fsBars').addEventListener('click',e=>{const b=e.target.closest('.fsb');if(!b)return;
  board=fsRes.flops[+b.dataset.i].c.slice();render();schedule();window.scrollTo({top:0,behavior:'smooth'});});
$('fsBars').addEventListener('pointerover',e=>{const b=e.target.closest('.fsb');if(!b){tip.classList.remove('on');return;}
  const f=fsRes.flops[+b.dataset.i],names=fsRes.names;
  tip.textContent=f.c.map(c=>RANKS[c>>2]+SYM[c&3]).join('')+'  '+f.n+'通り\n'+(f.eq?f.eq.map((x,k)=>names[k]+'  '+(x*100).toFixed(1)+'%').join('\n'):'レンジが空になるフロップ')+'\nクリックでボードに入れる';
  tip.classList.add('on','multi');});
$('fsBars').addEventListener('pointermove',e=>{if(!tip.classList.contains('on'))return;
  tip.style.left=Math.min(window.innerWidth-tip.offsetWidth-8,e.clientX+12)+'px';tip.style.top=(e.clientY-tip.offsetHeight-10)+'px';});
$('fsBars').addEventListener('pointerleave',()=>tip.classList.remove('on','multi'));

/* ---- persistence ---- */
function save(){try{localStorage.setItem('eqtool',JSON.stringify({hero,board,mode,hm:hmSide,
  ranges:ranges.map(w=>w.map(r=>Array.from(r))),cuts:ranges.map(w=>[...w.cut]),precision}));}catch(e){}}
function load(){try{const s=JSON.parse(localStorage.getItem('eqtool'));
  if(!s||!Array.isArray(s.hero))return false;
  hero=s.hero.slice(0,2);board=(s.board||[]).slice(0,5);
  /* before range vs range, a save held the one villain range as `cells` */
  const saved=s.ranges||[null,s.cells];
  for(let k=0;k<3;k++)if(saved[k])for(let i=0;i<13;i++)for(let j=0;j<13;j++)ranges[k][i][j]=saved[k][i][j]||0;
  if(Array.isArray(s.cuts))for(let k=0;k<3;k++)for(const c of s.cuts[k]||[])if(Number.isInteger(c))ranges[k].cut.add(c);
  mode=okMode(s.mode);if(s.hm===0||s.hm===2)hmSide=s.hm;
  /* precision used to be a Monte Carlo sample count for hand vs range */
  if(s.precision===2000||s.precision===10000)precision=s.precision;
  return true;}catch(e){return false;}}

/* ---- spots: named snapshots of mode, cards and both ranges, newest first ---- */
const spotDlg=$('spotdlg');
function loadSpots(){return rawList('eqspots').filter(x=>!x.del);}
const cardStr=a=>live(a).map(c=>RANKS[c>>2]+SYM[c&3]).join('');
function snapshot(){return {mode,hero:live(hero),board:live(board),r:ranges.map(rangeText),x:ranges.map(w=>[...w.cut]),t:Date.now()};}
/* what the spot is, as the default name and the line under each saved one */
function spotDesc(s){
  const pct=t=>{const w=newRange();parseRange(t||'',w);return (totalCombos(w)/13.26).toFixed(1)+'%';};
  return (s.mode==='hand'?cardStr(s.hero)||'?':pct(s.r[0]))+' vs '+pct(s.r[1])+(s.mode==='multi'?' vs '+pct(s.r[2]):'')+(s.board.length?' / '+cardStr(s.board):'');
}
/* Cards come back only if they are real and unclaimed, so a hand-edited
   store cannot put one card in two slots. */
function applySpot(s){
  const seen=new Set(),ok=c=>Number.isInteger(c)&&c>=0&&c<52&&!seen.has(c)&&seen.add(c);
  board=(s.board||[]).filter(ok).slice(0,5);hero=(s.hero||[]).filter(ok).slice(0,2);
  /* a spot saved before 3-player mode has two ranges; the third stays as it is */
  for(let k=0;k<3;k++){const t=(s.r||[])[k];if(k<2||typeof t==='string')parseRange(t||'',ranges[k]);
    for(const c of (s.x||[])[k]||[])if(Number.isInteger(c))ranges[k].cut.add(c);}
  spotDlg.close();setMode(okMode(s.mode));save();run();
}
function drawSpots(){
  const L=loadSpots(),ul=$('spotList');ul.innerHTML='';$('spotEmpty').hidden=L.length>0;
  for(const s of L){
    const li=document.createElement('li'),b=document.createElement('button'),d=document.createElement('button');
    b.type='button';b.className='spotload';b.innerHTML='<span class="nm"></span><span class="sub"></span>';
    b.firstChild.textContent=s.name;
    b.lastChild.textContent=({range:'レンジ vs レンジ',multi:'3人'}[s.mode]||'ハンド vs レンジ')+' · '+spotDesc(s)+
      (s.t?' · '+new Date(s.t).toLocaleDateString():'');
    b.addEventListener('click',()=>applySpot(s));
    d.type='button';d.className='tbtn spotdel';d.textContent='削除';d.setAttribute('aria-label','「'+s.name+'」を削除');
    d.addEventListener('click',()=>{dropEntry('eqspots',s.name);$('spotMsg').textContent='「'+s.name+'」を削除しました。';drawSpots();});
    li.append(b,d);ul.appendChild(li);
  }
}
$('spotBtn').addEventListener('click',()=>{closeMenu();$('spotName').value='';$('spotName').placeholder=spotDesc(snapshot());
  $('spotMsg').textContent='';drawSpots();spotDlg.showModal();});
$('spotForm').addEventListener('submit',e=>{e.preventDefault();
  const s=snapshot();s.name=$('spotName').value.trim()||spotDesc(s);
  const L=loadSpots(),over=L.some(x=>x.name===s.name);
  if(!putEntry('eqspots',s)){$('spotMsg').textContent='このブラウザでは保存できませんでした。';return;}
  $('spotMsg').textContent='「'+s.name+'」を'+(over?'上書き':'保存')+'しました。';$('spotName').value='';drawSpots();});
$('spotClose').addEventListener('click',()=>spotDlg.close());
onBackdrop(spotDlg,()=>spotDlg.close());

/* ---- sync across devices: the app keeps one set of saved ranges and spots
   on the server (api/sync.js), which does the merging; the page sends all it
   has, deletions included, and keeps what comes back. Where no such server
   answers (a file, a Claude Artifact, a plain static server) it stays off
   without a word. ---- */
let syncOn=/^https?:$/.test(location.protocol),syncTimer=null,syncWarned=false;
function syncSoon(){if(!syncOn)return;clearTimeout(syncTimer);syncTimer=setTimeout(syncNow,800);}
async function syncNow(){
  if(!syncOn)return;
  /* entries saved before sync had no time; the server needs one */
  const all=k=>rawList(k).map(x=>Object.assign({},x,{t:x.t||1})),sentAt=Date.now();
  try{
    const r=await fetch('/api/sync',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({data:{ranges:all('eqranges'),spots:all('eqspots')}})});
    if(r.status===404||r.status===405||r.status===501){syncOn=false;return;}
    const j=await r.json();if(!r.ok)throw new Error(j.error||'HTTP '+r.status);
    /* anything saved here while the request was out stays, and goes up next time */
    let fresh=false;
    for(const [k,L] of [['eqranges',j.data.ranges],['eqspots',j.data.spots]]){
      const mine=rawList(k).filter(x=>x.t>sentAt);if(mine.length)fresh=true;
      storeList(k,[...mine,...L.filter(x=>!mine.some(m=>m.name===x.name))]);}
    fillRangeLists();if(spotDlg.open)drawSpots();if(fresh)syncSoon();syncWarned=false;
  }catch(e){if(!syncWarned)flash('保存したレンジ・スポットを同期できませんでした。');syncWarned=true;}
}

/* ---- mode and heatmap side ---- */
const pressed=(box,el)=>{for(const x of box.children)x.setAttribute('aria-pressed',x===el?'true':'false');};
/* 3-player mode needs a wide screen; a save or spot made in it falls back to range vs range elsewhere */
const okMode=m=>m==='multi'?(wideMq.matches?m:'range'):m==='range'?m:'hand';
function setHmSide(s){
  hmSide=mode==='hand'?1:mode!=='multi'&&s===2?1:s;
  pressed($('hmbtns'),$('hmbtns').children[hmSide]);
  $('hmnote').textContent=mode==='multi'?PN[hmSide]+'のレンジの各ハンドでの'+PN[hmSide]+'のエクイティ（色の中央は均等割りの 33.3%）。':
    hmSide?'相手のレンジの各ハンドに対するヒーローのエクイティ。':'ヒーローのレンジの各ハンドのエクイティ。';
  if(lastRes)drawHeat(lastRes);else clearHeat();
}
function setMode(m){
  mode=m;
  pressed($('mbtns'),$('mbtns').querySelector('[data-m="'+m+'"]'));
  /* the hero panel holds either the two-card hand or the range editor */
  $('heroGrp').hidden=m!=='hand';RP[0].el.querySelector('.reditor').hidden=m==='hand';
  $('hmbtns').hidden=m==='hand';$('cols').classList.toggle('rvr',m==='range');RP[0].info.hidden=m==='hand';
  const mu=m==='multi',hb=$('hmbtns').children;
  /* 3-player mode spreads over the whole width, three range panels abreast,
     with the result band pinned to the top in place of the sticky bar */
  document.body.classList.toggle('multi',mu);$('cols').classList.toggle('multi',mu);RP[2].el.hidden=!mu;
  hb[2].hidden=!mu;hb[0].textContent='ヒーローのレンジ';hb[1].textContent=mu?'相手1のレンジ':'相手のレンジ';
  $('bignum').hidden=mu;$('mres').hidden=!mu;$('bar').hidden=mu;$('barkey').hidden=mu;
  if(mu){stick.classList.remove('on');stick.setAttribute('aria-hidden','true');}
  RP[0].title.textContent=m==='hand'?'ヒーローのハンド':'ヒーローのレンジ';RP[1].title.textContent=mu?'相手1のレンジ':'相手のレンジ';RP[2].title.textContent='相手2のレンジ';
  /* hero's cards were ignored in range mode, so board or dead may have taken one */
  if(m==='hand'){const u=new Set([...board,...dead]);hero=hero.map(c=>u.has(c)?null:c);}
  lastRes=null;clearResult('');drawLegend();
  for(const P of RP){repaintAll(P);syncText(P);}
  setHmSide(hmSide);render();fsState();drawFlopSet();
}

/* ---- controls ---- */
$('mbtns').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.dataset.m===mode)return;
  setMode(b.dataset.m);schedule();});
$('hmbtns').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;setHmSide(+b.dataset.s);save();});
$('precBtn').addEventListener('click',()=>{precision=precision>2000?2000:10000;$('precBtn').hidden=true;run();});
$('clrHero').addEventListener('click',()=>{hero=[];render();schedule();});
$('clrBoard').addEventListener('click',()=>{board=[];render();schedule();});

/* ---- sticky hand, board and equity ---- */
/* The bar copies #eqv (final, interim or cleared) rather than being written
   alongside it, and shows once the board panel is wholly above the viewport. */
const stick=$('stick'),eqBox=$('eqv').parentNode;
new MutationObserver(()=>{$('stickEq').textContent=$('eqv').textContent;stick.classList.toggle('interim',eqBox.classList.contains('interim'));})
  .observe(eqBox,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});
new IntersectionObserver(([e])=>{const on=!e.isIntersecting&&e.boundingClientRect.bottom<0&&mode!=='multi';
  stick.classList.toggle('on',on);stick.setAttribute('aria-hidden',on?'false':'true');}).observe($('boardPanel'));
stick.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));

/* ---- boot ---- */
applyTheme();buildSlots();buildPicker();buildPanels();fillRangeLists();buildHeatGrid();buildFsFilters();startWorker();
if(!load()){
  hero=[(12<<2)|3,(11<<2)|3]; board=[];
  selectTopPct(RP[1],15);
}
setMode(mode);run();
syncNow();
