const test = require('node:test');
const assert = require('node:assert');
const { loadEngine, parseCards, cellRange } = require('./harness.js');

const E = loadEngine();
const cell = (name, w = 1) => cellRange(E, name).map((c) => [c[0], c[1], w]);

/* evalN pads a short hand by repeating its last card. That only works because
   eval7 builds bitmasks, so check it against the obvious brute force: the best
   five-card subset, each subset scored by eval7 with its fifth card repeated
   (which for exactly five distinct cards is what eval7 sees anyway). */
test('evalN on 5 and 6 cards matches the best 5-card subset', () => {
  const rng = E.makeRng(0x5eed);
  for (let t = 0; t < 3000; t++) {
    const deck = Array.from({ length: 52 }, (_, i) => i);
    const n = 5 + (t % 2);
    const cs = [];
    for (let i = 0; i < n; i++) cs.push(deck.splice((rng() * deck.length) | 0, 1)[0]);
    let best = -1;
    for (let skip = 0; skip < n; skip++) {
      const h = n === 5 ? cs : cs.filter((_, i) => i !== skip);
      best = Math.max(best, E.eval7(...h, h[4], h[4]));
      if (n === 5) break;
    }
    assert.strictEqual(E.evalN(cs), best);
  }
  /* seven cards go straight through */
  const seven = parseCards('AsKsQsJsTs2c3d');
  assert.strictEqual(E.evalN(seven), E.eval7(...seven));
});

test('madeHands groups by strength, strongest first, and drops blocked combos', () => {
  const board = parseCards('8s8d3c');
  const range = [...cell('88'), ...cell('33'), ...cell('AKs'), ...cell('AA', 0.5)];
  const G = E.madeHands(range, board, parseCards('Ah'));
  /* 88: only 8h8c survives the board -> quads. 33: three combos -> full house.
     AA: Ah is used, so three combos at weight .5. AKs: Ah blocks one suit. */
  assert.deepStrictEqual(G.map((g) => E.handLabel(g.v)), [
    'フォーカード 8888 (3)', 'フルハウス 333-88', 'ツーペア AA-88 (3)', 'ワンペア 88 (A K 3)',
  ]);
  assert.deepStrictEqual(G.map((g) => g.w), [1, 3, 1.5, 3]);
  for (let i = 1; i < G.length; i++) assert.ok(G[i - 1].v > G[i].v);
});

test('handLabel names every category', () => {
  const lab = (s) => E.handLabel(E.evalN(parseCards(s)));
  assert.strictEqual(lab('AsKsQsJsTs'), 'ロイヤルフラッシュ');
  assert.strictEqual(lab('5s4s3s2sAs'), 'ストレートフラッシュ 5ハイ');
  assert.strictEqual(lab('KsKdKhKc2s'), 'フォーカード KKKK (2)');
  assert.strictEqual(lab('KsKdKh2c2s'), 'フルハウス KKK-22');
  assert.strictEqual(lab('As9s7s4s2s'), 'フラッシュ A 9 7 4 2');
  assert.strictEqual(lab('Ad5c4s3h2s'), 'ストレート 5ハイ');
  assert.strictEqual(lab('7d7c7s3h2s'), 'スリーカード 777 (3 2)');
  assert.strictEqual(lab('7d7c3s3hAs'), 'ツーペア 77-33 (A)');
  assert.strictEqual(lab('7d7cKs3hAs'), 'ワンペア 77 (A K 3)');
  assert.strictEqual(lab('Kd7cJs3hAs'), 'ハイカード A K J 7 3');
});
