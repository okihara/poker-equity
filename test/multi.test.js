const test = require('node:test');
const assert = require('node:assert');
const { loadEngine, parseCards, cellRange } = require('./harness.js');

const E = loadEngine();
const cells = (names) => names.flatMap((n) => cellRange(E, n));
const one = (s) => [[...parseCards(s), 1]];
const cards = (s) => (s ? parseCards(s) : []);
const multi = (ranges, board, opts) => E.computeMultiEquity(ranges, cards(board), [], opts || {});
/* Sampled results are checked against exact ones within five standard errors:
   tight enough to catch a biased sampler, loose enough never to flake (the
   seed is fixed anyway, so a pass is reproducible). */
const within = (got, se, want, label) =>
  assert.ok(Math.abs(got - want) <= 5 * se + 1e-12, label + ': got ' + got + ' ± ' + se + ', expected ' + want);

/* The reference for single-combo players: every runout, pot split evenly
   among the best hands. */
function exactHands(hands, board) {
  const used = new Set([...board, ...hands.flat()]);
  const deck = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
  const k = 5 - board.length;
  const runs = k === 0 ? [[]] : k === 1 ? deck.map((c) => [c])
    : deck.flatMap((c, i) => deck.slice(i + 1).map((d) => [c, d]));
  const eq = hands.map(() => 0);
  for (const ru of runs) {
    const v = hands.map(([x, y]) => E.eval7(x, y, ...board, ...ru));
    const best = Math.max(...v), n = v.filter((x) => x === best).length;
    v.forEach((x, p) => { if (x === best) eq[p] += 1 / n; });
  }
  return eq.map((x) => x / runs.length);
}

test('on the river with one combo each, every trial agrees, so the result is exact', async () => {
  const r = await multi([one('AsAh'), one('KsKh'), one('Qd2c')], 'Ac Kd 7h 4s 9c');
  assert.deepStrictEqual(r.players.map((p) => p.equity), [1, 0, 0]);
  assert.deepStrictEqual(r.se, [0, 0, 0]);
  const s = await multi([one('AsQh'), one('AdQs'), one('7d2c')], 'Ac Kd Jh Ts 3c');
  assert.deepStrictEqual(s.players.map((p) => p.equity), [0.5, 0.5, 0]);
  assert.deepStrictEqual(s.players.map((p) => p.tie), [1, 1, 0]);
});

test('single combos on a flop match full enumeration', async () => {
  const hands = ['AsAh', 'KdKc', 'Jh Th'].map(parseCards);
  const want = exactHands(hands, parseCards('Qh 9h 2c'));
  const r = await multi(hands.map((h) => [[...h, 1]]), 'Qh 9h 2c');
  r.players.forEach((p, i) => within(p.equity, r.se[i], want[i], 'player ' + (i + 1)));
});

test('with two players it agrees with the exact heads-up engine', async () => {
  const a = cells(['AA', 'KK', 'AKs', 'AQo']), b = cells(['QQ', 'JJ', 'TT', 'AJs', 'KQs']);
  for (const board of ['', 'Ks 8d 3c']) {
    const want = await E.computeRangeEquity(a, b, cards(board), []);
    const r = await multi([a, b], board, { trials: 400000 });
    within(r.players[0].equity, r.se[0], want.equity, 'A on ' + (board || 'preflop'));
    within(r.players[1].equity, r.se[1], want.opp.equity, 'B on ' + (board || 'preflop'));
  }
});

test('the pot is shared out in full, and per-combo figures add up to the totals', async () => {
  const r = await multi([cells(['AA', 'KK', 'AKs']), cells(['QQ', 'JJ', 'AQs']), cells(['T9s', '98s', '22'])], '', { trials: 50000 });
  const total = r.players.reduce((s, p) => s + p.equity, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, 'equities sum to ' + total);
  for (const p of r.players) {
    assert.ok(Math.abs(p.win + p.tie + p.lose - 1) < 1e-12);
    assert.ok(Math.abs(p.perCombo.reduce((s, c) => s + c.share, 0) - 1) < 1e-9);
    assert.ok(Math.abs(p.perCombo.reduce((s, c) => s + c.share * c.eq, 0) - p.equity) < 1e-9);
  }
});

test('the same query gives the same answer', async () => {
  const q = [cells(['AA', 'AKs']), cells(['KK', 'QQ']), cells(['JJ', 'TT'])];
  const a = await multi(q, '', { trials: 20000 }), b = await multi(q, '', { trials: 20000 });
  assert.deepStrictEqual(a.players.map((p) => p.equity), b.players.map((p) => p.equity));
});

test('blocked ranges and ranges that cannot all be dealt are errors, not hangs', async () => {
  const blocked = await multi([one('AsKs'), one('QdQc'), one('7h7c')], 'As 8d 3c');
  assert.match(blocked.error, /プレイヤー1/);
  const clash = await multi([one('AsAh'), one('AsKs'), one('7h7c')], '');
  assert.ok(clash.error, 'two players can never both hold the A♠');
  const short = await multi([one('AsAh'), one('KsKh'), one('7h7c')], 'As 8d');
  assert.ok(short.error);
});

test('reports a running estimate per player, and can be abandoned', async () => {
  const all = [];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) all.push([a, b, 1]);
  const seen = [];
  const r = await multi([all, all, all], '', {
    onProgress: (p, eq) => seen.push([p, eq]),
    isStale: () => seen.length >= 2,
  });
  assert.deepStrictEqual(r, { stale: true });
  assert.ok(seen.every(([p, eq]) => p > 0 && p < 1 && eq.length === 3));
});
