const test = require('node:test');
const assert = require('node:assert');
const { loadEngine, parseCards, cellRange, cardStr } = require('./harness.js');

const E = loadEngine();
const P = E.pfInit();
const cell = (name) => cellRange(E, name);
const cells = (names) => names.flatMap(cell);
const one = (s) => [[...parseCards(s), 1]];
const close = (got, want, tol, label) =>
  assert.ok(Math.abs(got - want) <= tol, label + ': got ' + got + ', expected ' + want);
const handStr = (h) => cardStr(P.H0[h]) + cardStr(P.H1[h]);

/* Straight enumeration of every board that misses both hands -- the definition
   the table is supposed to encode, with no grouping and no suit symmetry. */
function enumerate(a0, a1, b0, b1, dead = []) {
  const out = new Set([a0, a1, b0, b1, ...dead]);
  const deck = [];
  for (let c = 0; c < 52; c++) if (!out.has(c)) deck.push(c);
  const D = deck.length;
  let win = 0, tie = 0, n = 0;
  for (let i = 0; i < D; i++) for (let j = i + 1; j < D; j++) for (let k = j + 1; k < D; k++)
    for (let l = k + 1; l < D; l++) for (let m = l + 1; m < D; m++) {
      const c = deck[i], d = deck[j], e = deck[k], f = deck[l], g = deck[m];
      const va = E.eval7(a0, a1, c, d, e, f, g), vb = E.eval7(b0, b1, c, d, e, f, g);
      if (va > vb) win++; else if (va === vb) tie++;
      n++;
    }
  return { win, tie, n };
}
const count = (x) => Math.round(x * E.PF_BOARDS);

test('the table covers all 47,008 classes with possible counts', () => {
  assert.strictEqual(P.n, 47008);
  assert.ok(P.win && P.tie, 'src/preflop-table.bin is missing — run `npm run preflop`');
  for (let id = 0; id < P.n; id++) {
    const w = count(P.win[id]), t = count(P.tie[id]);
    assert.ok(w >= 0 && t >= 0 && w + t <= E.PF_BOARDS, 'class ' + id);
  }
  let pairs = 0;
  for (let a = 0; a < 1326; a++) for (let b = 0; b < 1326; b++) if (P.cls[a * 1326 + b] >= 0) pairs++;
  assert.strictEqual(pairs, 1326 * 1225, 'every ordered pair of disjoint hands has a class');
});

/* Sampled class representatives, recomputed board by board: the counts must
   match exactly, not approximately. */
test('representatives match full enumeration exactly', () => {
  const rng = E.makeRng(0x9f1e7ab1);
  const ids = [0, P.n - 1];
  for (let i = 0; i < 14; i++) ids.push((rng() * P.n) | 0);
  for (const id of ids) {
    const a = P.repA[id], b = P.repB[id];
    const r = enumerate(P.H0[a], P.H1[a], P.H0[b], P.H1[b]);
    assert.strictEqual(r.n, E.PF_BOARDS);
    const label = 'class ' + id + ' ' + handStr(a) + ' vs ' + handStr(b);
    assert.strictEqual(count(P.win[id]), r.win, label + ' wins');
    assert.strictEqual(count(P.tie[id]), r.tie, label + ' ties');
  }
});

/* Arbitrary pairs, in either order: this is what checks the suit-isomorphism
   mapping and the orientation flag rather than the stored numbers. */
test('arbitrary matchups resolve to the right class and orientation', async () => {
  const rng = E.makeRng(0x51c0ffee);
  for (let i = 0; i < 14; i++) {
    let a, b;
    do { a = (rng() * 1326) | 0; b = (rng() * 1326) | 0; } while (P.cls[a * 1326 + b] < 0);
    const r = enumerate(P.H0[a], P.H1[a], P.H0[b], P.H1[b]);
    const got = await E.computeRangeEquity([[P.H0[a], P.H1[a], 1]], [[P.H0[b], P.H1[b], 1]], [], []);
    const label = handStr(a) + ' vs ' + handStr(b);
    close(got.win, r.win / r.n, 1e-12, label + ' win');
    close(got.tie, r.tie / r.n, 1e-12, label + ' tie');
  }
});

/* The same figures test/equity.test.js pins by full enumeration. */
test('reproduces the enumerated hand-vs-cell values', async () => {
  const cases = [
    ['AsKs', 'QQ', 46.0485], ['AsKh', 'QQ', 43.2423], ['8s8h', 'AKo', 55.1615],
    ['AcAd', 'KK', 81.9461], ['7h2c', 'AKo', 32.4350], ['AsKs', 'AA', 12.1405], ['5c5d', 'AKs', 51.9656],
  ];
  for (const [hand, name, want] of cases) {
    const r = await E.computeRangeEquity(one(hand), cell(name), [], []);
    assert.strictEqual(r.mode, 'exact');
    close(r.equity * 100, want, 0.00005, hand + ' vs ' + name);
  }
});

test('matches computeEquity for a hand against a small range', async () => {
  const range = cells(['QQ', 'JTs', 'A5s']).map((c, i) => [c[0], c[1], [1, 0.5, 0.25][i % 3]]);
  const want = await E.computeEquity(parseCards('AsKd'), [], range, {});
  assert.strictEqual(want.mode, 'exact');
  const got = await E.computeRangeEquity(one('AsKd'), range, [], []);
  for (const f of ['equity', 'win', 'tie']) close(got[f], want[f], 1e-12, f);
});

test('textbook range-vs-range numbers', async () => {
  const cases = [
    [['AA'], ['KK'], 81.9, 0.1],
    [['AKs'], ['QQ'], 46.0, 0.3],
    [['AKo'], ['22'], 47.0, 1.0],
  ];
  for (const [a, b, want, tol] of cases) {
    const r = await E.computeRangeEquity(cells(a), cells(b), [], []);
    close(r.equity * 100, want, tol, a + ' vs ' + b);
  }
  const all = [];
  for (let x = 0; x < 52; x++) for (let y = x + 1; y < 52; y++) all.push([x, y, 1]);
  close((await E.computeRangeEquity(one('AcAd'), all, [], [])).equity * 100, 85.20, 0.01, 'AA vs a random hand');
  close((await E.computeRangeEquity(all, all, [], [])).equity, 0.5, 1e-12, 'any two vs any two');
});

test('with dead cards, preflop samples boards and reports a sound error bar', async () => {
  const [a0, a1] = parseCards('AsKs'), [b0, b1] = parseCards('QdQc'), dead = parseCards('2c Qh');
  const exact = enumerate(a0, a1, b0, b1, dead);
  const want = (exact.win + exact.tie / 2) / exact.n;
  const r = await E.computeRangeEquity(one('AsKs'), one('QdQc'), [], dead, { mcBoards: 20000 });
  assert.strictEqual(r.mode, 'mc');
  assert.ok(r.se > 0 && r.se < 0.005, 'standard error ' + r.se);
  assert.ok(Math.abs(r.equity - want) < 4 * r.se, 'MC ' + r.equity + ' vs exact ' + want + ' (se ' + r.se + ')');
  close(r.equity + r.opp.equity, 1, 1e-12, 'the two sides still sum to 1');
  const same = cells(['AA', 'KQs', '76s']);
  close((await E.computeRangeEquity(same, same, [], dead, { mcBoards: 200 })).equity, 0.5, 1e-12,
    'a range against itself is 50% on every sampled board');
});
