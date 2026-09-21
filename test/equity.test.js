const test = require('node:test');
const assert = require('node:assert');
const { loadEngine, parseCards, cellRange } = require('./harness.js');

const E = loadEngine();
const run = (hand, board, range, opts) =>
  E.computeEquity(parseCards(hand), board ? parseCards(board) : [], range, opts || {});
const cell = (name) => cellRange(E, name);
const near = (got, want, tol, label) =>
  assert.ok(Math.abs(got - want) <= tol,
    label + ': got ' + got.toFixed(4) + '%, expected ' + want + '% (+/-' + tol + ')');

/* Exact enumeration is deterministic, so these are exact to the last digit
   shown. Spot values cross-checked against the standard published figures for
   single-combo matchups (AKs vs QQ 46.21%, AKo vs QQ 42.84%, AA vs KK 81.25%);
   the numbers below are averaged over every combo of the opponent cell, so card
   removal moves them slightly off the single-combo figures. */
test('preflop, hand vs a single-cell range (exact enumeration)', async () => {
  const cases = [
    ['AsKs', 'QQ', 46.0485],
    ['AsKh', 'QQ', 43.2423],
    ['8s8h', 'AKo', 55.1615],
    ['AcAd', 'KK', 81.9461],
    ['7h2c', 'AKo', 32.4350],
    ['AsKs', 'AA', 12.1405],
    ['5c5d', 'AKs', 51.9656],
  ];
  for (const [hand, name, want] of cases) {
    const r = await run(hand, '', cell(name));
    assert.strictEqual(r.mode, 'exact', hand + ' vs ' + name + ' should enumerate');
    near(r.equity * 100, want, 0.0005, hand + ' vs ' + name);
  }
});

test('postflop, hand vs a single-cell range (exact enumeration)', async () => {
  const cases = [
    ['AsKd', 'Qs Js 2h', '99', 42.0202],
    ['7c7d', 'Ac Kd 7h', 'AKo', 83.2323],
    ['AsKs', '2c 7d 9h', 'QQ', 23.9394],
    ['JhTh', '9s 8c 2d', 'AA', 34.2424],
    ['AcQc', 'Kc 7c 3d 2s', 'JJ', 32.9545],
  ];
  for (const [hand, board, name, want] of cases) {
    const r = await run(hand, board, cell(name));
    assert.strictEqual(r.mode, 'exact');
    near(r.equity * 100, want, 0.0005, hand + ' on ' + board + ' vs ' + name);
  }
});

test('a made hand that cannot be caught is 100%, and its mirror is 0%', async () => {
  const board = '9s 5c 2h Ad Kd';
  const hero = await run('9h9d', board, cell('AKo'));
  assert.strictEqual(hero.equity, 1, 'trip nines beat top two pair on a static river');
  const villain = await run('AcKc', board, [[...parseCards('9h9d'), 1]]);
  assert.strictEqual(villain.equity, 0);
});

test('hero equity and villain equity sum to 1', async () => {
  const board = 'Qs Js 2h';
  const hero = parseCards('AsKd');
  const villain = parseCards('9c9d');
  const a = await run('AsKd', board, [[villain[0], villain[1], 1]]);
  const b = await run('9c9d', board, [[hero[0], hero[1], 1]]);
  assert.ok(Math.abs(a.equity + b.equity - 1) < 1e-12, a.equity + ' + ' + b.equity);
});

test('win + tie + lose = 1', async () => {
  const r = await run('AsKs', '', cell('QQ'));
  assert.ok(Math.abs(r.win + r.tie + r.lose - 1) < 1e-12);
  assert.ok(Math.abs(r.equity - (r.win + r.tie / 2)) < 1e-12, 'chops count as half');
});

test('combo weights are relative, not absolute', async () => {
  const full = await run('AsKs', '', cell('QQ'));
  const halved = await run('AsKs', '', cell('QQ').map((c) => [c[0], c[1], 0.5]));
  assert.ok(Math.abs(full.equity - halved.equity) < 1e-12);
});

test('a mixed-weight range lands between its pure components', async () => {
  const vsAA = (await run('AsKd', '', cell('AA'))).equity;
  const vs22 = (await run('AsKd', '', cell('22'))).equity;
  const mixed = (await run('AsKd', '', [...cell('AA'), ...cell('22')])).equity;
  assert.ok(vsAA < mixed && mixed < vs22, [vsAA, mixed, vs22].join(' / '));
  const tilted = (await run('AsKd', '',
    [...cell('AA'), ...cell('22').map((c) => [c[0], c[1], 0.1])])).equity;
  assert.ok(tilted < mixed, 'down-weighting 22 should move equity toward the AA number');
});

test('blocked combos are dropped from the range', async () => {
  const r = await run('AsKs', '', cell('AA'));
  assert.strictEqual(r.nCombos, 3, 'holding the As leaves 3 AA combos, not 6');
  const dead = await run('AsAh', '', cell('AA'));
  assert.strictEqual(dead.nCombos, 1, 'holding two aces leaves exactly one AA combo');
  assert.strictEqual(dead.equity, 0.5, 'AA vs AA is a coin flip by symmetry');
  assert.ok(dead.tie > 0.95, 'and almost always a chop, got ' + dead.tie);
  const impossible = await run('AsAh', '', [[...parseCards('AsAh'), 1]]);
  assert.ok(impossible.error, 'a range made only of blocked combos is an error');
});

test('Monte Carlo reproduces the textbook AA-vs-random number', async () => {
  const everyCombo = [];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) everyCombo.push([a, b, 1]);
  const r = await run('AcAd', '', everyCombo, { mcTotal: 4e6 });
  assert.strictEqual(r.mode, 'mc', '1225 combos x 2.1M boards is far past the exact budget');
  near(r.equity * 100, 85.20, 0.06, 'AA vs a random hand');
  assert.ok(r.se > 0 && r.se * 196 < 0.1, 'reported 95% CI should be under 0.1pt, got ' + r.se * 196);
});

test('Monte Carlo is seeded, so the same query gives the same answer', async () => {
  const everyCombo = [];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) everyCombo.push([a, b, 1]);
  const a = await run('7h2c', '', everyCombo, { mcTotal: 4e5 });
  const b = await run('7h2c', '', everyCombo, { mcTotal: 4e5 });
  assert.strictEqual(a.equity, b.equity);
  near(a.equity * 100, 34.57, 0.3, '72o vs a random hand');
});

test('exact mode reports no sampling error', async () => {
  const r = await run('AsKd', 'Qs Js 2h', cell('99'));
  assert.strictEqual(r.se, 0);
  // 47 unseen cards from hero's point of view: the villain's two are unknown,
  // so they stay in the deck and are skipped per-combo during the sweep.
  assert.strictEqual(r.nBoards, 1081, 'C(47,2) turn-and-river runouts');
  assert.strictEqual(r.perCombo[0].n, 990, 'C(45,2) of them are live for a given combo');
});

test('reports progress monotonically while enumerating', async () => {
  const seen = [];
  const r = await run('AsKs', '', [...cell('AA'), ...cell('KK')], { onProgress: (p) => seen.push(p) });
  assert.strictEqual(r.mode, 'exact');
  assert.ok(seen.length > 0, 'a 2.1M-board sweep should report progress at least once');
  for (let i = 0; i < seen.length; i++) {
    assert.ok(seen[i] >= 0 && seen[i] <= 1, 'progress outside 0..1: ' + seen[i]);
    if (i) assert.ok(seen[i] >= seen[i - 1], 'progress went backwards at ' + i);
  }
});

test('isStale aborts the sweep instead of finishing it', async () => {
  let asked = 0;
  const r = await run('AsKs', '', [...cell('AA'), ...cell('KK')],
    { isStale: () => { asked++; return true; } });
  assert.ok(asked > 0, 'a long sweep should ask whether it is still wanted');
  assert.deepStrictEqual(r, { stale: true }, 'an abandoned run must not report numbers');
});

const everyCombo = () => {
  const out = [];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) out.push([a, b, 1]);
  return out;
};

/* The per-hand heatmap colours one cell per combo, so Monte Carlo spreads its
   boards evenly instead of sampling combos at random. Plain sampling would
   leave rare combos with too few boards to colour. */
test('Monte Carlo gives every surviving combo its own samples', async () => {
  const r = await run('AcAd', '', everyCombo(), { mcTotal: 4e5 });
  assert.strictEqual(r.mode, 'mc');
  assert.strictEqual(r.perCombo.length, r.nCombos, 'the heatmap needs one row per live combo');
  const n = r.perCombo[0].n;
  assert.ok(n >= 200, 'the stratified floor is 200 boards per combo, got ' + n);
  for (const pc of r.perCombo) assert.strictEqual(pc.n, n, 'every combo gets the same board count');
});

test('the per-combo breakdown reproduces the headline equity', async () => {
  const mixed = [...cell('99'), ...cell('AA').map((c) => [c[0], c[1], 0.4])];
  for (const r of [await run('AsKd', 'Qs Js 2h', mixed),
                   await run('AcAd', '', everyCombo(), { mcTotal: 4e5 })]) {
    let sum = 0, weight = 0;
    for (const pc of r.perCombo) { sum += pc.w * pc.eq; weight += pc.w; }
    assert.ok(Math.abs(sum / weight - r.equity) < 1e-12,
      r.mode + ': breakdown gives ' + sum / weight + ', headline says ' + r.equity);
    assert.ok(Math.abs(weight - r.weight) < 1e-12, r.mode + ': reported weight disagrees');
  }
});

test('counts the remaining runouts for every board length', async () => {
  for (const [board, want] of [['Qs Js 2h 7d 3c', 1], ['Qs Js 2h 7d', 46], ['Qs Js 2h', 1081]]) {
    const r = await run('AsKd', board, cell('99'));
    assert.strictEqual(r.nBoards, want, board + ' should leave ' + want + ' runouts');
  }
  assert.strictEqual((await run('AsKd', '', cell('99'))).nBoards, 2118760, 'C(50,5) preflop');
});

/* The yield cadence used to be a fixed stride of 32 combos, but the work per
   combo scales with 1/nCombos, so a range small enough to stay under that
   stride ran to completion without yielding once. Monte Carlo needs at least
   15 combos to be chosen at all, which left a 15..31 window that froze the
   page and could not be cancelled. */
test('a small Monte Carlo range still reports progress and can be abandoned', async () => {
  const small = ['AA', 'KK', 'QQ', 'JJ', 'TT'].flatMap((n) => cell(n));
  const seen = [];
  const r = await run('AsKs', '', small, { onProgress: (p) => seen.push(p) });
  assert.strictEqual(r.mode, 'mc');
  assert.ok(r.nCombos < 32, 'this test is pointless unless it lands in the window, got ' + r.nCombos);
  assert.ok(seen.length > 0, 'progress must be reported whatever the combo count');
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1], 'progress went backwards');

  let asked = 0;
  const abandoned = await run('AsKs', '', small, { isStale: () => { asked++; return true; } });
  assert.ok(asked > 0, 'a small range must still be asked whether it is wanted');
  assert.deepStrictEqual(abandoned, { stale: true });
});
