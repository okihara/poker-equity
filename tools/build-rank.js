#!/usr/bin/env node
/**
 * Regenerates src/rank-order.json: the 169 starting hands sorted by their
 * all-in equity against a uniformly random opposing hand.
 *
 * That ordering is what the "top n%" slider walks down. It is a pure equity
 * ranking with no playability adjustment, so small pairs sit higher here than
 * in a typical opening chart.
 *
 *   node tools/build-rank.js [samplesPerHand]   (default 2,000,000, ~40s)
 *
 * Monte Carlo, because the exact figure per hand is an average over C(50,2)
 * villain hands x C(48,5) boards. At 2M samples the standard error is about
 * 0.035 points, comfortably below the gaps that decide the order.
 */
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./load-engine.js');

const N = parseInt(process.argv[2] || '2000000', 10);
const SEED = 0x12345678;
const { eval7, makeRng, cellCombos, cellName } = loadEngine();

const rng = makeRng(SEED);
const deck = new Int32Array(50);
const rows = [];
const started = Date.now();

for (let i = 0; i < 13; i++) {
  for (let j = 0; j < 13; j++) {
    const [h0, h1] = cellCombos(i, j)[0]; // suits are interchangeable vs a random hand
    let k = 0;
    for (let c = 0; c < 52; c++) if (c !== h0 && c !== h1) deck[k++] = c;
    let win = 0, tie = 0;
    for (let it = 0; it < N; it++) {
      for (let s = 0; s < 7; s++) { // 5 board cards + the villain's 2
        const r = s + ((rng() * (50 - s)) | 0);
        const t = deck[s]; deck[s] = deck[r]; deck[r] = t;
      }
      const b0 = deck[0], b1 = deck[1], b2 = deck[2], b3 = deck[3], b4 = deck[4];
      const hero = eval7(h0, h1, b0, b1, b2, b3, b4);
      const villain = eval7(deck[5], deck[6], b0, b1, b2, b3, b4);
      if (hero > villain) win++; else if (hero === villain) tie++;
    }
    rows.push({ name: cellName(i, j), equity: (win + tie / 2) / N });
  }
}

rows.sort((a, b) => b.equity - a.equity);
const out = path.join(__dirname, '..', 'src', 'rank-order.json');
fs.writeFileSync(out, JSON.stringify(rows.map((r) => r.name)) + '\n');

const pct = (r) => r.name + ' ' + (r.equity * 100).toFixed(2) + '%';
console.log(N.toLocaleString() + ' samples/hand in ' + ((Date.now() - started) / 1000).toFixed(1) + 's');
console.log('best:  ' + rows.slice(0, 6).map(pct).join(', '));
console.log('worst: ' + rows.slice(-6).map(pct).join(', '));
console.log('wrote ' + path.relative(path.join(__dirname, '..'), out) + ' — run `npm run build` to embed it');
