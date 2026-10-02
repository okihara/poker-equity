const test = require('node:test');
const assert = require('node:assert');
const { loadEngine, parseCards, cellRange, cardStr } = require('./harness.js');

const E = loadEngine();
const cell = (name, w = 1) => cellRange(E, name).map((c) => [c[0], c[1], w]);
const cells = (names) => names.flatMap((n) => cell(n));
const one = (s, w = 1) => [[...parseCards(s), w]];
const rvr = (a, b, board, dead, opts) =>
  E.computeRangeEquity(a, b, parseCards(board), dead ? parseCards(dead) : [], opts || {});
const close = (got, want, tol, label) =>
  assert.ok(Math.abs(got - want) <= tol, label + ': got ' + got + ', expected ' + want);

/* The reference: every (a, b) pair that shares no card, against every runout
   that shares no card with either, two eval7 calls each. No sorting, no
   cumulative weights, no inclusion-exclusion -- none of the machinery under
   test. Returns the same shape as computeRangeEquity, keyed by combo. */
function naive(rangeA, rangeB, board, dead) {
  const used = new Set([...board, ...dead]);
  const live = (r) => r.filter(([x, y, w]) => w > 0 && !used.has(x) && !used.has(y));
  const A = live(rangeA), B = live(rangeB);
  const deck = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
  const k = 5 - board.length;
  const runouts = k === 0 ? [[]] : k === 1 ? deck.map((c) => [c])
    : deck.flatMap((c, i) => deck.slice(i + 1).map((d) => [c, d]));
  const side = () => ({ win: 0, tie: 0, n: 0, per: new Map() });
  const sa = side(), sb = side();
  const add = (s, key, w, res) => {
    const p = s.per.get(key) || { win: 0, tie: 0, n: 0 };
    p.n += w; s.n += w;
    if (res > 0) { p.win += w; s.win += w; } else if (res === 0) { p.tie += w; s.tie += w; }
    s.per.set(key, p);
  };
  for (const [a0, a1, wa] of A) for (const [b0, b1, wb] of B) {
    if (a0 === b0 || a0 === b1 || a1 === b0 || a1 === b1) continue;
    for (const ru of runouts) {
      if (ru.some((c) => c === a0 || c === a1 || c === b0 || c === b1)) continue;
      const bd = [...board, ...ru];
      const res = Math.sign(E.eval7(a0, a1, ...bd) - E.eval7(b0, b1, ...bd));
      add(sa, Math.min(a0, a1) + ',' + Math.max(a0, a1), wa * wb, res);
      add(sb, Math.min(b0, b1) + ',' + Math.max(b0, b1), wa * wb, -res);
    }
  }
  return [sa, sb];
}

function assertMatchesNaive(got, rangeA, rangeB, board, dead, label) {
  const [na, nb] = naive(rangeA, rangeB, board, dead);
  for (const [r, n, who] of [[got, na, 'A'], [got.opp, nb, 'B']]) {
    close(r.win, n.win / n.n, 1e-9, label + ' ' + who + ' win');
    close(r.tie, n.tie / n.n, 1e-9, label + ' ' + who + ' tie');
    close(r.equity, (n.win + n.tie / 2) / n.n, 1e-9, label + ' ' + who + ' equity');
    assert.strictEqual(r.perCombo.length, n.per.size, label + ' ' + who + ' live combo count');
    for (const pc of r.perCombo) {
      const p = n.per.get(pc.a + ',' + pc.b);
      assert.ok(p, label + ' ' + who + ' reports a combo the reference never saw');
      close(pc.eq, (p.win + p.tie / 2) / p.n, 1e-9, label + ' ' + who + ' ' + cardStr(pc.a) + cardStr(pc.b));
      close(pc.share, p.n / n.n, 1e-9, label + ' ' + who + ' share of ' + cardStr(pc.a) + cardStr(pc.b));
    }
  }
}

/* Random ranges are drawn from a few ranks only, so the two ranges collide on
   cards constantly, often hold the very same combo, and tie often -- the cases
   the inclusion-exclusion and the tie grouping exist for. */
function randomCase(rng, boardLen, size) {
  const pick = (n) => (rng() * n) | 0;
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let s = 0; s < 52; s++) { const r = s + pick(52 - s); const t = deck[s]; deck[s] = deck[r]; deck[r] = t; }
  const board = deck.slice(0, boardLen), nDead = pick(3), dead = deck.slice(boardLen, boardLen + nDead);
  const ranks = new Set();
  while (ranks.size < 5) ranks.add(pick(13));
  const pool = [];
  for (const r1 of ranks) for (const r2 of ranks) for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) {
    const x = (r1 << 2) | s1, y = (r2 << 2) | s2;
    if (x < y) pool.push([x, y]);
  }
  const range = () => {
    const out = [];
    for (let i = 0; i < size; i++) {
      const [x, y] = pool[pick(pool.length)];
      out.push([x, y, [1, 1, 0.5, 0.25, 0.8][pick(5)]]);
    }
    /* drop duplicates here so the reference and the engine see the same range */
    const seen = new Set();
    return out.filter(([x, y]) => !seen.has(x * 52 + y) && seen.add(x * 52 + y));
  };
  return { board, dead, a: range(), b: range() };
}

test('matches the naive all-pairs, all-runouts reference to 1e-9', async () => {
  const rng = E.makeRng(0x0dd5eed5);
  let checked = 0;
  for (const [boardLen, trials, size] of [[5, 40, 60], [4, 20, 40], [3, 8, 18]]) {
    for (let t = 0; t < trials; t++) {
      const { board, dead, a, b } = randomCase(rng, boardLen, size);
      const label = boardLen + '-card board ' + board.map(cardStr).join('') + ' #' + t;
      const got = await E.computeRangeEquity(a, b, board, dead, {});
      if (got.error) continue; // every pair collided; the error path is tested below
      assertMatchesNaive(got, a, b, board, dead, label);
      checked++;
    }
  }
  assert.ok(checked >= 60, 'too many random cases were fully blocked: only ' + checked + ' of 68 compared');
});

test('a range holding one combo reproduces computeEquity exactly', async () => {
  const cases = [
    ['AsKd', 'Qs Js 2h', ['99', 'AA', 'KQs', 'T9s']],
    ['JhTh', '9s 8c 2d', ['AA']],
    ['AcQc', 'Kc 7c 3d 2s', ['JJ', 'AK' + 'o']],
    ['7d7c', '7s 2h 2d Ah Kc', ['AA', 'A2s', '22']],
  ];
  for (const [hand, board, names] of cases) {
    const range = cells(names);
    const want = await E.computeEquity(parseCards(hand), parseCards(board), range, {});
    const got = await rvr(one(hand), range, board);
    for (const f of ['equity', 'win', 'tie', 'lose']) close(got[f], want[f], 1e-12, hand + ' ' + f);
    /* the villain side, combo by combo, is the mirror of computeEquity's breakdown */
    const mirror = new Map(want.perCombo.map((p) => [Math.min(p.a, p.b) + ',' + Math.max(p.a, p.b), 1 - p.eq]));
    for (const pc of got.opp.perCombo) close(pc.eq, mirror.get(pc.a + ',' + pc.b), 1e-12, hand + ' villain combo');
  }
});

/* Pinned by test/equity.test.js against the published single-hand figures. */
test('reproduces the known hand-vs-range values', async () => {
  const cases = [['JhTh', '9s 8c 2d', 'AA', 34.2424], ['AcQc', 'Kc 7c 3d 2s', 'JJ', 32.9545]];
  for (const [hand, board, name, want] of cases) {
    close((await rvr(one(hand), cell(name), board)).equity * 100, want, 0.00005, hand + ' vs ' + name);
  }
});

test('the two sides are mirror images', async () => {
  const a = cells(['AA', 'KK', 'AKs', 'QJs', '76s']), b = cells(['TT', '99', 'AQo', 'KJs', 'A5s']);
  const r = await rvr(a, b, 'Qs Ts 5h');
  close(r.equity + r.opp.equity, 1, 1e-12, 'equities sum to 1');
  close(r.win, r.opp.lose, 1e-12, 'A wins exactly when B loses');
  close(r.tie, r.opp.tie, 1e-12, 'ties are shared');
  const s = await rvr(b, a, 'Qs Ts 5h');
  close(s.equity, r.opp.equity, 1e-12, 'swapping the arguments swaps the answers');
  for (const side of [r, r.opp]) {
    let eq = 0, share = 0;
    for (const pc of side.perCombo) { eq += pc.share * pc.eq; share += pc.share; }
    close(share, 1, 1e-12, 'combo shares sum to 1');
    close(eq, side.equity, 1e-12, 'the per-combo breakdown reproduces the headline');
  }
});

test('identical ranges split exactly 50/50', async () => {
  const all = [];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) all.push([a, b, 1]);
  for (const board of ['Qs Js 2h', 'Qs Js 2h 7d', 'Qs Js 2h 7d 3c']) {
    const r = await rvr(all, all, board);
    close(r.equity, 0.5, 1e-12, board);
  }
});

test('weights are relative within each range', async () => {
  const a = [...cell('AA'), ...cell('76s', 0.5)], b = [...cell('KK'), ...cell('A5s', 0.25)];
  const base = await rvr(a, b, 'Ks 7d 6c');
  const scaled = await rvr(a.map((c) => [c[0], c[1], c[2] * 0.3]), b.map((c) => [c[0], c[1], c[2] * 0.7]), 'Ks 7d 6c');
  close(scaled.equity, base.equity, 1e-12, 'scaling a whole range changes nothing');
});

test('duplicate entries merge, and blocked or zero-weight combos drop out', async () => {
  const doubled = await rvr([...cell('AA'), ...cell('AA')], cell('KK'), '2c 7d 9h');
  const single = await rvr(cell('AA'), cell('KK'), '2c 7d 9h');
  close(doubled.equity, single.equity, 1e-12, 'a combo listed twice is one combo');
  assert.strictEqual(doubled.nCombos, 6);
  const r = await rvr([...cell('AA'), ...cell('KK', 0)], cell('QQ'), 'Ac 7d 9h', 'Ad');
  assert.strictEqual(r.nCombos, 1, 'Ac on board and Ad dead leave AhAs only; KK has weight 0');
  assert.strictEqual(r.nRunouts, 48 * 47 / 2, '52 - 3 board - 1 dead = 48 cards left for turn and river');
  assert.ok((await rvr(cell('AA'), cell('KK'), 'Ac Ad Ah')).error, 'a fully blocked range is an error');
  assert.ok((await rvr(one('AsKs'), one('AsQs'), '2c 7d 9h')).error, 'no pair that shares no card is an error');
});

test('reports progress with a running estimate, and can be abandoned', async () => {
  const all = [];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) all.push([a, b, 1]);
  const a = cells(['AA', 'KK', 'QQ', 'AKs', 'AKo']);
  const seen = [];
  const r = await rvr(a, all, 'Qs Js 2h', '', { onProgress: (p, eq) => seen.push([p, eq]) });
  assert.ok(seen.length > 0, 'a full-range flop takes long enough to report progress');
  for (let i = 0; i < seen.length; i++) {
    assert.ok(seen[i][0] > 0 && seen[i][0] < 1, 'progress outside (0,1): ' + seen[i][0]);
    if (i) assert.ok(seen[i][0] > seen[i - 1][0], 'progress went backwards');
  }
  /* runouts are shuffled, so even the first estimate is a fair sample */
  close(seen[0][1], r.equity, 0.05, 'first running estimate');

  let asked = 0;
  const gone = await rvr(a, all, 'Qs Js 2h', '', { isStale: () => { asked++; return true; } });
  assert.ok(asked > 0);
  assert.deepStrictEqual(gone, { stale: true });
});
