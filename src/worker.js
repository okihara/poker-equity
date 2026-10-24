/* ================= worker ================= */
/* The page starts a Worker from this same engine script. Inside it, answer
   {id,a,b,board,dead,opts} (or {id,multi:[range,...],...}
   for three or more players) with {id,progress,partial} while running and
   {id,result} at the end. A newer id makes the running query stale; it sees
   that at its next yield and stops without posting a result. */
if(typeof WorkerGlobalScope!=='undefined'&&self instanceof WorkerGlobalScope){
  let latest=0;
  self.onmessage=async e=>{const q=e.data;latest=q.id;
    const o=Object.assign({},q.opts,{
      onProgress:(p,eq)=>self.postMessage({id:q.id,progress:p,partial:eq}),
      isStale:()=>q.id!==latest});
    const r=await(q.multi?computeMultiEquity(q.multi,q.board,q.dead,o):computeRangeEquity(q.a,q.b,q.board,q.dead,o));
    if(!r.stale)self.postMessage({id:q.id,result:r});};
  setTimeout(pfInit,0); // expand the preflop table before the first question
}
