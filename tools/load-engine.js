/**
 * Loads src/evaluator.js and src/equity.js the same way the built page does:
 * plain classic scripts sharing one scope, concatenated in order. Keeping src/
 * free of module boilerplate means the bytes under test are the bytes that
 * ship (test/build.test.js checks that), and evaluating them in this realm
 * rather than a vm context keeps them at full speed.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const EXPORTS = ['eval7', 'makeRng', 'computeEquity', 'cellCombos', 'cellName', 'cellOf',
  'comboCount', 'cardName', 'RANKS', 'SUITS', 'RANK_ORDER', 'NAME2IJ', 'CELLN'];

function loadEngine() {
  const src = [
    'const RANK_ORDER=' + read('src/rank-order.json').trim() + ';',
    read('src/evaluator.js'),
    read('src/equity.js'),
    'return {' + EXPORTS.join(',') + '};',
  ].join('\n');
  return new Function(src)();
}

/** "AsKh" / "Qs Jd 2c" -> [card, ...] with card = rank<<2 | suit */
function parseCards(s) {
  return s.replace(/\s+/g, '').match(/../g).map((t) => {
    const r = '23456789TJQKA'.indexOf(t[0].toUpperCase());
    const u = 'cdhs'.indexOf(t[1].toLowerCase());
    if (r < 0 || u < 0) throw new Error('bad card: ' + t);
    return (r << 2) | u;
  });
}
const cardStr = (c) => '23456789TJQKA'[c >> 2] + 'cdhs'[c & 3];

/** Every combo of one 13x13 cell, at weight 1. "QQ" | "AKs" | "AKo" */
function cellRange(engine, name) {
  const ij = engine.NAME2IJ[name];
  if (!ij) throw new Error('unknown cell: ' + name);
  return engine.cellCombos(ij[0], ij[1]).map((c) => [c[0], c[1], 1]);
}

module.exports = { loadEngine, parseCards, cardStr, cellRange, EXPORTS };
