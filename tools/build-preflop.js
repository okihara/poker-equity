#!/usr/bin/env node
/**
 * Regenerates src/preflop-table.bin: for each of the 47,008 suit-isomorphism
 * classes of heads-up preflop matchups, the number of the C(48,5) = 1,712,304
 * boards on which the class representative's first hand wins, and on which it
 * ties. Two little-endian uint32 per class, in pfInit's class order.
 *
 *   npm run preflop        (~5 minutes on 8 cores)
 *
 * Every board is enumerated -- no sampling -- so the table is exact and the
 * runtime lookup agrees with full enumeration to rounding error.
 *
 * Classes are grouped by their first hand (169 groups, one per canonical
 * starting hand). A worker walks the C(50,5) boards that miss that hand once,
 * evaluates it once per board, and only then evaluates each opponent hand the
 * board does not hit -- roughly halving the eval7 calls versus doing every
 * matchup independently.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort } = require('worker_threads');
const { loadEngine } = require('./load-engine.js');

const OUT = path.join(__dirname, '..', 'src', 'preflop-table.bin');

function runGroup(E, P, a, ids) {
  const a0 = P.H0[a], a1 = P.H1[a], n = ids.length;
  const b0 = new Int32Array(n), b1 = new Int32Array(n);
  for (let i = 0; i < n; i++) { b0[i] = P.H0[P.repB[ids[i]]]; b1[i] = P.H1[P.repB[ids[i]]]; }
  const deck = [];
  for (let c = 0; c < 52; c++) if (c !== a0 && c !== a1) deck.push(c);
  const D = deck.length, on = new Uint8Array(52), win = new Float64Array(n), tie = new Float64Array(n);
  for (let i = 0; i < D; i++) { const c = deck[i]; on[c] = 1;
    for (let j = i + 1; j < D; j++) { const d = deck[j]; on[d] = 1;
      for (let k = j + 1; k < D; k++) { const e = deck[k]; on[e] = 1;
        for (let l = k + 1; l < D; l++) { const f = deck[l]; on[f] = 1;
          for (let m = l + 1; m < D; m++) { const g = deck[m];
            const va = E.eval7(a0, a1, c, d, e, f, g);
            for (let t = 0; t < n; t++) {
              const x = b0[t], y = b1[t];
              if (on[x] || on[y] || x === g || y === g) continue;
              const vb = E.eval7(x, y, c, d, e, f, g);
              if (va > vb) win[t]++; else if (va === vb) tie[t]++;
            }
          }
          on[f] = 0; }
        on[e] = 0; }
      on[d] = 0; }
    on[c] = 0; }
  return { ids, win: Array.from(win), tie: Array.from(tie) };
}

if (!isMainThread) {
  const E = loadEngine(), P = E.pfInit();
  parentPort.on('message', ({ a, ids }) => parentPort.postMessage(runGroup(E, P, a, ids)));
} else {
  const E = loadEngine(), P = E.pfInit();
  const groups = new Map();
  for (let id = 0; id < P.n; id++) {
    const a = P.repA[id];
    if (!groups.has(a)) groups.set(a, []);
    groups.get(a).push(id);
  }
  /* largest first, so no worker is left holding a big group at the end */
  const queue = [...groups].map(([a, ids]) => ({ a, ids })).sort((x, y) => y.ids.length - x.ids.length);
  const out = Buffer.alloc(P.n * 8);
  const nWorkers = Math.min(os.cpus().length, queue.length);
  const t0 = Date.now();
  let done = 0, classesDone = 0, live = nWorkers;
  console.log(P.n + ' classes in ' + queue.length + ' groups, ' + nWorkers + ' workers');
  for (let w = 0; w < nWorkers; w++) {
    const worker = new Worker(__filename);
    const next = () => { if (queue.length) worker.postMessage(queue.shift()); else { worker.terminate(); finish(); } };
    worker.on('message', (r) => {
      r.ids.forEach((id, i) => {
        if (r.win[i] + r.tie[i] > E.PF_BOARDS) throw new Error('impossible counts for class ' + id);
        out.writeUInt32LE(r.win[i], id * 8);
        out.writeUInt32LE(r.tie[i], id * 8 + 4);
      });
      done++; classesDone += r.ids.length;
      const s = (Date.now() - t0) / 1000;
      process.stdout.write('\r' + done + '/' + groups.size + ' groups, ' + classesDone + ' classes, ' +
        s.toFixed(0) + 's elapsed, ~' + (s / classesDone * (P.n - classesDone)).toFixed(0) + 's left   ');
      next();
    });
    worker.on('error', (e) => { console.error(e); process.exit(1); });
    next();
  }
  function finish() {
    if (--live) return;
    if (classesDone !== P.n) throw new Error('only ' + classesDone + ' of ' + P.n + ' classes computed');
    fs.writeFileSync(OUT, out);
    console.log('\nwrote ' + path.relative(process.cwd(), OUT) + ' (' + out.length + ' bytes) in ' +
      ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
}
