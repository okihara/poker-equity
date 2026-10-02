const test = require('node:test');
const assert = require('node:assert');
const { loadEngine } = require('./harness.js');

const { eval7, CAT } = loadEngine();

/* Every one of the C(52,7) = 133,784,560 seven-card hands, once. The category
   counts and the number of distinct hand values are textbook figures computed
   independently of any particular evaluator, so matching all ten of them rules
   out a whole class of bugs (a category that is reachable from the wrong card
   pattern, two different hands packed to the same value, two equal hands
   packed differently) that sampled showdowns can miss. It costs ~3s, which is
   why it lives in its own file: node --test runs files in parallel. */
test('exhaustive: category counts and distinct values over all C(52,7) hands', () => {
  const count = new Float64Array(9);
  const seen = new Uint8Array(9 * CAT);
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++)
    for (let d = c + 1; d < 52; d++) for (let e = d + 1; e < 52; e++)
      for (let f = e + 1; f < 52; f++) for (let g = f + 1; g < 52; g++) {
        const v = eval7(a, b, c, d, e, f, g);
        count[(v / CAT) | 0]++;
        seen[v] = 1;
      }
  const want = {
    'high card': 23294460, 'pair': 58627800, 'two pair': 31433400, 'trips': 6461620,
    'straight': 6180020, 'flush': 4047644, 'full house': 3473184, 'quads': 224848,
    'straight flush': 41584,
  };
  Object.values(want).forEach((n, i) =>
    assert.strictEqual(count[i], n, Object.keys(want)[i] + ' count'));
  assert.strictEqual(count.reduce((s, n) => s + n, 0), 133784560);
  let distinct = 0;
  for (let i = 0; i < seen.length; i++) distinct += seen[i];
  assert.strictEqual(distinct, 4824, 'seven-card hands fall into 4824 equivalence classes');
});
