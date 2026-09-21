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

test('the lookup tables match an independent spec for all 8192 rank masks', () => {
  const { STRAIGHT, PACK5, POPC } = loadEngine();
  for (let m = 0; m < 8192; m++) {
    /* highest rank that completes five in a row, or 3 for the ace-low wheel */
    let straight = -1;
    for (let hi = 12; hi >= 4; hi--) {
      let run5 = true;
      for (let d = 0; d < 5; d++) if (!(m & (1 << (hi - d)))) { run5 = false; break; }
      if (run5) { straight = hi; break; }
    }
    if (straight < 0 && (m & 0x1000) && (m & 1) && (m & 2) && (m & 4) && (m & 8)) straight = 3;
    assert.strictEqual(STRAIGHT[m], straight, 'STRAIGHT[' + m.toString(2) + ']');

    const ranks = [];
    for (let r = 12; r >= 0; r--) if (m & (1 << r)) ranks.push(r);
    let packed = 0;
    for (let i = 0; i < 5; i++) packed = (packed << 4) | (ranks[i] === undefined ? 0 : ranks[i]);
    assert.strictEqual(PACK5[m], packed, 'PACK5[' + m + ']');
    assert.strictEqual(POPC[m], ranks.length, 'POPC[' + m + ']');
  }
});

/* Deals biased toward the categories a uniform shuffle rarely reaches. */
function generators(rng) {
  const pick = (n) => (rng() * n) | 0;
  const fill = (out, used) => {
    while (out.length < 7) { const c = pick(52); if (!used.has(c)) { used.add(c); out.push(c); } }
    return out;
  };
  return {
    uniform: () => fill([], new Set()),
    /* five to seven cards of one suit: flushes and straight flushes */
    suited: () => {
      const suit = pick(4), n = 5 + pick(3);
      const ranks = Array.from({ length: 13 }, (_, i) => i);
      for (let s = 0; s < n; s++) { const r = s + pick(13 - s); const t = ranks[s]; ranks[s] = ranks[r]; ranks[r] = t; }
      const out = ranks.slice(0, n).map((r) => (r << 2) | suit);
      return fill(out, new Set(out));
    },
    /* a five-rank window: straights, quads, boats, three pair */
    clumped: () => {
      const lo = pick(9), out = [], used = new Set();
      while (out.length < 7) {
        const c = ((lo + pick(Math.min(5, 13 - lo))) << 2) | pick(4);
        if (!used.has(c)) { used.add(c); out.push(c); }
      }
      return out;
    },
    /* aces, wheel cards and broadway: the ace-high/ace-low straight corner */
    wheelish: () => {
      const pool = [12, 0, 1, 2, 3, 8, 9, 10, 11], out = [], used = new Set();
      while (out.length < 7) {
        const c = (pool[pick(pool.length)] << 2) | pick(4);
        if (!used.has(c)) { used.add(c); out.push(c); }
      }
      return out;
    },
  };
}

/* The showdown test above only compares the SIGN for two hands sharing a board,
   which cannot see an ordering error that happens to fall the same way in every
   sampled pair. This ranks many hands outright and demands the same order —
   and the same ties — as the naive evaluator, plus the same category. */
test('induces the same total ordering as the naive evaluator, ties included', () => {
  const CAT = 0x100000;
  const naiveCat = (v) => (v >= 1e9 ? Math.floor(v / 1e9) : 0);
  for (const [name, gen] of Object.entries(generators(makeRng(0xc0ffee11)))) {
    const rows = [];
    for (let i = 0; i < 6000; i++) {
      const h = gen(), slow = naive7(h), fast = eval7(...h);
      assert.strictEqual(Math.floor(fast / CAT), naiveCat(slow),
        name + ': category disagrees on ' + h.map(cardStr).join(' '));
      rows.push([slow, fast, h]);
    }
    rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (let i = 1; i < rows.length; i++) {
      const [s0, f0, h0] = rows[i - 1], [s1, f1, h1] = rows[i];
      const why = name + ': ' + h0.map(cardStr).join(' ') + ' vs ' + h1.map(cardStr).join(' ');
      if (s0 === s1) assert.strictEqual(f0, f1, why + ' should tie');
      else assert.ok(f0 < f1, why + ' is ordered the other way');
    }
  }
});

test('picks the best five out of six- and seven-card flushes', () => {
  assert.strictEqual(ev('As Qs 9s 7s 5s 3s 2h'), ev('As Qs 9s 7s 5s 2s 3h'),
    'the sixth flush card is not part of the hand');
  assert.ok(ev('As Qs 9s 7s 5s 3s 2s') > ev('Ks Qs 9s 7s 5s 3s 2s'), 'top five still decide');
  assert.strictEqual(catOf(ev('5s 4s 3s 2s As 9s Kh')), 8, 'a suited wheel is a straight flush');
  assert.ok(ev('5s 4s 3s 2s As 9s Kh') < ev('6h 5h 4h 3h 2h Ac Kd'), '5-high loses to 6-high');
});

test('resolves kickers that only the sixth and seventh card decide', () => {
  assert.ok(ev('Ac Ad Kc Kd Qh Qs Jc') > ev('Ac Ad Kc Kd Jh Js Th'),
    'three pair plays the two best pairs, then the best remaining card');
  assert.strictEqual(ev('Ac Ad Kc Kd Qh Qs 2c'), ev('Ac Ad Kc Kd Qh Qs 3d'),
    'the seventh card is irrelevant once five are fixed');
  assert.ok(ev('9c 9d 9h 9s Ac 2d 3h') > ev('9c 9d 9h 9s Kc Qd Jh'), 'quads take one kicker');
  assert.ok(ev('2c 2d 2h 2s 3c 4d 5h') > ev('Ac Ad Ah Kc Kd Kh Qs'), 'the worst quads beat any boat');
});
