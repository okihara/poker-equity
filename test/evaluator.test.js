const test = require('node:test');
const assert = require('node:assert');
const { loadEngine, parseCards, cardStr } = require('./harness.js');

const { eval7, makeRng } = loadEngine();
const CATS = ['high card', 'pair', 'two pair', 'trips', 'straight', 'flush', 'full house', 'quads', 'straight flush'];
const ev = (s) => eval7(...parseCards(s));
const catOf = (v) => Math.floor(v / 0x100000);

test('classifies every hand category', () => {
  const cases = [
    ['As Ks Qs Js Ts 2c 3d', 8, 'royal flush'],
    ['5s 4s 3s 2s As 9c Kd', 8, 'steel wheel (ace plays low)'],
    ['Ac Ad Ah As Kc 2d 3h', 7, 'quads'],
    ['Ac Ad Ah Ks Kc 2d 3h', 6, 'full house'],
    ['Ac 9c 7c 5c 3c 2d Kh', 5, 'flush'],
    ['Ac Kd Qh Js Tc 2d 3h', 4, 'broadway straight'],
    ['5c 4d 3h 2s Ac 9d Kh', 4, 'wheel'],
    ['Ac Ad Ah Ks Qc 2d 3h', 3, 'trips'],
    ['Ac Ad Kh Ks Qc 2d 3h', 2, 'two pair'],
    ['Ac Ad 9h 7s 5c 2d 3h', 1, 'one pair'],
    ['Ac Kd 9h 7s 5c 2d 3h', 0, 'high card'],
  ];
  for (const [hand, want, label] of cases) {
    assert.strictEqual(CATS[catOf(ev(hand))], CATS[want], label + ': ' + hand);
  }
});

test('a full house outranks a flush, and trips outrank two pair', () => {
  assert.ok(ev('Ac Ad Ah Kc Kd 2s 3h') > ev('Ah Kh Qh Jh 9h 2c 3d'));
  assert.ok(ev('9c 9d 9h 2s 5d 7h Jc') > ev('9c 9d 8h 8s 5d 7h Jc'));
  assert.ok(ev('9c 9d 9h 2s 2c 5d 7h') > ev('8c 8d 8h 3s 3c 5d 7h'));
});

test('identical five-card hands tie regardless of the extra cards', () => {
  assert.strictEqual(ev('Ac Kc 5h 4d 3s 2c 9h'), ev('Ad Kd 5s 4c 3d 2h 8c'));
});

/* An independent, deliberately slow evaluator: score all C(7,5) five-card
   subsets the obvious way and keep the best. It shares no code with eval7, so
   agreeing with it over many random showdowns is real evidence. */
function eval5(cs) {
  const rs = cs.map((c) => c >> 2).sort((a, b) => b - a);
  const ss = cs.map((c) => c & 3);
  const flush = ss.every((x) => x === ss[0]);
  const uniq = [...new Set(rs)];
  let straightHigh = -1;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 12 && uniq[1] === 3 && uniq[4] === 0) straightHigh = 3;
  }
  const counts = {};
  rs.forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
  const groups = Object.entries(counts).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const k = groups.map((g) => g[1]);
  const pack = (arr) => arr.reduce((v, r) => v * 16 + r, 0) * Math.pow(16, 5 - arr.length);
  if (flush && straightHigh >= 0) return 8e9 + straightHigh * 1e6;
  if (groups[0][0] === 4) return 7e9 + k[0] * 1e6 + k[1] * 1e4;
  if (groups[0][0] === 3 && groups[1][0] === 2) return 6e9 + k[0] * 1e6 + k[1] * 1e4;
  if (flush) return 5e9 + pack(rs);
  if (straightHigh >= 0) return 4e9 + straightHigh * 1e6;
  if (groups[0][0] === 3) return 3e9 + k[0] * 1e6 + k[1] * 1e4 + k[2] * 1e2;
  if (groups[0][0] === 2 && groups[1][0] === 2) return 2e9 + k[0] * 1e6 + k[1] * 1e4 + k[2] * 1e2;
  if (groups[0][0] === 2) return 1e9 + k[0] * 1e6 + k[1] * 1e4 + k[2] * 1e2 + k[3];
  return pack(rs);
}
function naive7(cs) {
  let best = -1;
  for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) for (let c = b + 1; c < 7; c++)
    for (let d = c + 1; d < 7; d++) for (let e = d + 1; e < 7; e++) {
      const v = eval5([cs[a], cs[b], cs[c], cs[d], cs[e]]);
      if (v > best) best = v;
    }
  return best;
}

test('agrees with a naive best-of-C(7,5) evaluator on 40k random showdowns', () => {
  const rng = makeRng(0x5eed1234);
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let t = 0; t < 40000; t++) {
    for (let s = 0; s < 9; s++) {
      const r = s + ((rng() * (52 - s)) | 0);
      const tmp = deck[s]; deck[s] = deck[r]; deck[r] = tmp;
    }
    const board = deck.slice(4, 9);
    const A = [deck[0], deck[1], ...board];
    const B = [deck[2], deck[3], ...board];
    const fast = Math.sign(eval7(...A) - eval7(...B));
    const slow = Math.sign(naive7(A) - naive7(B));
    assert.strictEqual(fast, slow,
      'disagreed on ' + A.map(cardStr).join('') + ' vs ' + B.map(cardStr).join(''));
  }
});
