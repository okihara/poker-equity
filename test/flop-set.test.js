const test = require('node:test');
const assert = require('node:assert');
const { loadEngine, parseCards, cellRange } = require('./harness.js');

const E = loadEngine();
const cells = (names) => names.flatMap((n) => cellRange(E, n));
const tex = (s) => E.flopTexture(parseCards(s));

test('the flop classes cover every flop once, 1755 classes up to suits', () => {
  const F = E.flopClasses();
  assert.strictEqual(F.length, 1755);
  assert.strictEqual(F.reduce((s, f) => s + f.n, 0), 22100);
  /* rainbow unpaired 4 suits x 3 x 2 = 24 ways, two-tone 36, monotone 4,
     paired rainbow 12 (pair suits 6 x kicker 2), paired two-tone 12, trips 4 */
  const sizes = new Set(F.map((f) => f.n));
  assert.deepStrictEqual([...sizes].sort((a, b) => a - b), [4, 12, 24]);
  for (const f of F) {
    assert.ok(f.c[0] >> 2 >= f.c[1] >> 2 && f.c[1] >> 2 >= f.c[2] >> 2, 'cards high to low');
    assert.strictEqual(f.c[0] & 3, 0, 'suits numbered from the first card');
  }
});

test('flops are sorted by high, middle, then low rank', () => {
  const F = E.flopClasses(), key = (f) => (f.c[0] >> 2) * 169 + (f.c[1] >> 2) * 13 + (f.c[2] >> 2);
  for (let i = 1; i < F.length; i++) assert.ok(key(F[i - 1]) <= key(F[i]));
  assert.deepStrictEqual(F[0].c.map((c) => c >> 2), [0, 0, 0], '222 first');
  assert.deepStrictEqual(F[F.length - 1].c.map((c) => c >> 2), [12, 12, 12], 'AAA last');
});

test('flop textures', () => {
  assert.deepStrictEqual(tex('Ks 9h 4d'), { suits: 0, pair: 0, conn: 0, hi: 11, mid: 7, lo: 2 });
  assert.strictEqual(tex('Ks 9s 4d').suits, 1);
  assert.strictEqual(tex('Ks 9s 4s').suits, 2);
  assert.strictEqual(tex('Ks Kh 4d').pair, 1);
  assert.strictEqual(tex('4s 4h 4d').pair, 2);
  assert.strictEqual(tex('9s 8h 6d').conn, 2, 'a T7 or 75 makes a straight');
  assert.strictEqual(tex('As 4h 2d').conn, 2, 'the wheel counts');
  assert.strictEqual(tex('Ks Th 4d').conn, 1, 'K and T are close enough for an open-ender');
  assert.strictEqual(tex('Ks 8h 3d').conn, 0);
  assert.strictEqual(tex('8s 8h 7d').conn, 1, 'a paired board cannot make a straight with two cards');
});

test('each flop agrees with the exact heads-up engine on that flop', async () => {
  const a = cells(['AA', 'KK', 'AKs', 'QJs']), b = cells(['QQ', 'JJ', 'TT', 'AQs', '98s']);
  const r = await E.computeFlopSet([a, b], { trials: 4000 });
  assert.strictEqual(r.flops.length, 1755);
  /* a few flops of different textures; 4000 deals gives a standard error of
     about 0.8%, so 4% is five of them */
  for (const i of [0, 400, 900, 1300, 1754]) {
    const f = r.flops[i], want = await E.computeRangeEquity(a, b, f.c, []);
    assert.ok(Math.abs(f.eq[0] - want.equity) < 0.04, f.c.map(E.cardName).join('') + ': ' + f.eq[0] + ' vs ' + want.equity);
    assert.ok(Math.abs(f.eq[0] + f.eq[1] - 1) < 1e-9);
  }
});

test('a flop that empties a range has no figures, and the run can be abandoned', async () => {
  const r = await E.computeFlopSet([cells(['AA']), cells(['KK'])], { trials: 100 });
  const aaa = r.flops.find((f) => f.c.every((c) => c >> 2 === 12));
  assert.strictEqual(aaa.eq, null, 'three aces on the flop leave one, so AA cannot be dealt');
  assert.strictEqual(r.flops.filter((f) => !f.eq).length, 2, 'AAA and KKK');
  let calls = 0;
  const s = await E.computeFlopSet([cells(['AA']), cells(['KK'])], { trials: 5000, onProgress: () => calls++, isStale: () => calls >= 1 });
  assert.deepStrictEqual(s, { stale: true });
});
