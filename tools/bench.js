#!/usr/bin/env node
/**
 * Throughput numbers for the engine, measured on the same bytes that ship.
 *
 *   npm run bench
 *
 * Kept out of the test suite on purpose: a timing assertion either has a floor
 * loose enough to be meaningless or tight enough to fail on a busy machine.
 * The performance targets for range-vs-range (preflop < 100ms, flop < 1s,
 * turn/river near-instant) get their own rows here as those phases land.
 */
const { loadEngine, parseCards } = require('./load-engine.js');

const E = loadEngine();

/* Best of several runs, so one GC pause or a cold JIT does not set the number. */
function best(runs, fn) {
  let min = Infinity, out;
  for (let i = 0; i < runs; i++) {
    const t = process.hrtime.bigint();
    out = fn();
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    if (ms < min) min = ms;
  }
  return { ms: min, out };
}

function benchEval7() {
  /* Pre-deal distinct seven-card hands so the loop times eval7 and nothing
     else: no shuffling, no RNG calls, no duplicate cards. */
  const N = 2000000, rng = E.makeRng(0xbe7c4);
  const cards = new Int32Array(N * 7), deck = Array.from({ length: 52 }, (_, i) => i);
  for (let h = 0; h < N; h++) {
    for (let s = 0; s < 7; s++) {
      const r = s + ((rng() * (52 - s)) | 0);
      const t = deck[s]; deck[s] = deck[r]; deck[r] = t;
      cards[h * 7 + s] = deck[s];
    }
  }
  const { ms, out } = best(5, () => {
    let sum = 0;
    for (let i = 0; i < N * 7; i += 7) {
      sum += E.eval7(cards[i], cards[i + 1], cards[i + 2], cards[i + 3], cards[i + 4], cards[i + 5], cards[i + 6]);
    }
    return sum;
  });
  if (!out) throw new Error('unreachable: keeps the loop from being optimised away');
  return [(ms * 1e6 / N).toFixed(1) + ' ns/eval', (N / ms / 1000).toFixed(1) + 'M evals/s'];
}

/* Range vs range at its worst case: every one of the 1326 combos on both sides. */
async function benchRvr(board, target) {
  const all = [];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) all.push([a, b, 1]);
  let min = Infinity;
  for (let i = 0; i < 3; i++) {
    const t = process.hrtime.bigint();
    await E.computeRangeEquity(all, all, parseCards(board), [], {});
    min = Math.min(min, Number(process.hrtime.bigint() - t) / 1e6);
  }
  return [min.toFixed(1) + ' ms', 'target ' + target];
}

(async () => {
  const rows = [
    ['eval7 (random 7-card hands)', ...benchEval7()],
    ['rvr full vs full, flop', ...await benchRvr('Qs Js 2h', '< 1s')],
    ['rvr full vs full, turn', ...await benchRvr('Qs Js 2h 7d', 'instant')],
    ['rvr full vs full, river', ...await benchRvr('Qs Js 2h 7d 3c', 'instant')],
  ];
  console.log('node ' + process.version + ', ' + process.arch);
  for (const r of rows) console.log(r[0].padEnd(34) + r.slice(1).map((s) => s.padStart(16)).join(''));
})();
