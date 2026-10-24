const test = require('node:test');
const assert = require('node:assert');
const { loadEngine, parseCards } = require('./harness.js');

const E = loadEngine();
/* handClass returns indexes; compare by name so a failure reads as poker. */
function cls(hand, board) {
  const [x, y] = parseCards(hand);
  const [m, d] = E.handClass(x, y, parseCards(board));
  return [E.MADE[m], d < 0 ? null : E.DRAW[d]];
}
const made = (hand, board) => cls(hand, board)[0];
const draw = (hand, board) => cls(hand, board)[1];

test('pairs are judged against the board', () => {
  const b = 'Ks 9h 4d';
  assert.strictEqual(made('AhAc', b), 'オーバーペア・トップペア');
  assert.strictEqual(made('KcQd', b), 'オーバーペア・トップペア');
  assert.strictEqual(made('9s9c', b), 'セット・ツーペア');
  assert.strictEqual(made('Kh9c', b), 'セット・ツーペア');
  assert.strictEqual(made('TsTc', b), 'ミドルペア', 'a pocket pair between the top two board ranks');
  assert.strictEqual(made('7s7c', b), '弱いペア', 'a pocket pair under the second board rank');
  assert.strictEqual(made('9cQd', b), 'ミドルペア');
  assert.strictEqual(made('3s3c', b), '弱いペア');
  assert.strictEqual(made('Ac4c', b), '弱いペア');
  assert.strictEqual(made('AcQd', b), 'ハイカード');
});

test('a pair on the board is not the combo\'s own pair', () => {
  const b = 'Ks Kd 4c';
  assert.strictEqual(made('7h2c', b), 'ハイカード', 'two pair by eval7, but all of it is the board');
  assert.strictEqual(made('Kh7c', b), 'セット・ツーペア', 'trips with the board pair');
  assert.strictEqual(made('4h4s', b), 'ストレート以上', 'a full house');
});

test('straights and flushes the combo makes, but not ones the board makes alone', () => {
  assert.deepStrictEqual(cls('Ts6s', '9h 8d 7c'), ['ストレート以上', 'ドローなし']);
  assert.strictEqual(made('Ah2h', 'Kh 9h 4h'), 'ストレート以上');
  assert.strictEqual(made('AcKd', 'Th 9s 8d 7c 6h'), 'ハイカード', 'only plays the board straight');
});

test('flush and straight draws', () => {
  assert.strictEqual(draw('AhQh', 'Ks 9h 4h'), 'ナッツフラッシュドロー');
  assert.strictEqual(draw('Qh2h', 'Ks 9h 4h'), 'フラッシュドロー');
  assert.strictEqual(draw('KhJh', 'Ah 7h 2c'), 'ナッツフラッシュドロー', 'the ace is on the board, so the king is the nuts');
  assert.strictEqual(draw('QhJh', 'Ah 7h 2c'), 'フラッシュドロー');
  assert.strictEqual(draw('Ah5h', 'Kh 4h 3c'), 'コンボドロー', 'a nut flush draw with a straight draw is still a combo draw');
  assert.strictEqual(draw('As7h', 'Ks 9h 4h 2c'), 'ドローなし', 'one heart and two on board is only three');
  assert.strictEqual(draw('6c5c', 'Ks 8h 7d'), '両面（ダブルガット含む）');
  assert.strictEqual(draw('Jc8s', '9h 7d 5c'), '両面（ダブルガット含む）', 'a double gutter has two ranks too');
  assert.strictEqual(draw('5c4c', 'Ks 8h 7d'), 'ガットショット');
  assert.strictEqual(draw('6h5h', 'Ks 8h 7h'), 'コンボドロー');
  assert.strictEqual(draw('Ac2d', '9h 8d 7c 6s'), 'ドローなし', 'the T or 5 straightens the board for everyone');
});

test('backdoors count on the flop only, and nothing draws on the river', () => {
  assert.strictEqual(draw('KcQc', 'Ks 9h 4d'), 'バックドアのみ', 'J and T make a straight');
  assert.strictEqual(draw('AhJh', 'Ks 9h 4d'), 'バックドアのみ', 'three hearts');
  assert.strictEqual(draw('AhAc', 'Ks 9h 4d'), 'ドローなし');
  assert.strictEqual(draw('KcQc', 'Ks 9h 4d 2c'), 'ドローなし', 'a turn leaves no backdoor');
  assert.strictEqual(draw('AhQh', 'Ks 9h 4h 2c 3d'), null);
});

test('every combo lands in exactly one made-hand and one draw class', () => {
  const board = parseCards('Qh Jh 4c');
  const seen = new Set(board);
  for (let x = 0; x < 52; x++) for (let y = x + 1; y < 52; y++) {
    if (seen.has(x) || seen.has(y)) continue;
    const [m, d] = E.handClass(x, y, board);
    assert.ok(m >= 0 && m < E.MADE.length && d >= 0 && d < E.DRAW.length);
  }
});

test('what can call: a pair of its own or a real draw', () => {
  const call = (hand, board) => { const [x, y] = parseCards(hand); return E.canCall(x, y, parseCards(board)); };
  assert.strictEqual(call('3s3c', 'Ks 9h 4d'), true, 'an underpair is a pair');
  assert.strictEqual(call('Ac2d', 'Ks 9h 4d'), false, 'ace high, no draw');
  assert.strictEqual(call('7h2c', 'Ks Kd 4c'), false, 'the board pair is not its own');
  assert.strictEqual(call('5c4c', 'Ks 8h 7d'), true, 'a gutshot');
  assert.strictEqual(call('Qh2h', 'Ks 9h 4h'), true, 'a flush draw');
  assert.strictEqual(call('KcQc', 'Ks 9h 4d'), true, 'top pair');
  assert.strictEqual(call('AhJh', 'Ks 9h 4d'), false, 'a backdoor alone does not call');
  assert.strictEqual(call('Qh2h', 'Ks 9h 4h 3c 7d'), false, 'no draws on the river');
});
