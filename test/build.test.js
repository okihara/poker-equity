const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/* The tests exercise src/. These assert that the committed builds contain those
   exact bytes, so a stale index.html fails the suite instead of shipping. */
for (const out of ['index.html', 'dist/artifact.html']) {
  test(out + ' is built from the current src/', () => {
    const built = read(out);
    for (const src of ['src/evaluator.js', 'src/equity.js', 'src/app.js', 'src/app.css']) {
      assert.ok(built.includes(read(src).trimEnd()),
        out + ' does not contain the current ' + src + ' — run `npm run build`');
    }
    assert.ok(built.includes('const RANK_ORDER=' + read('src/rank-order.json').trim() + ';'),
      out + ' has a stale RANK_ORDER — run `npm run build`');
  });
}

test('index.html is a complete standalone document', () => {
  const html = read('index.html');
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.ok(html.includes('</body>\n</html>'));
});

test('dist/artifact.html carries no document wrapper', () => {
  const frag = read('dist/artifact.html');
  for (const tag of ['!doctype', 'html', 'head', 'body']) {
    assert.ok(!new RegExp('<' + tag + '[\\s/>]', 'i').test(frag),
      'fragment must not contain a <' + tag + '> tag');
  }
  assert.match(frag, /^<title>/);
});

test('the page loads no scripts from outside the CSP allowlist', () => {
  const html = read('index.html');
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(srcs, [], 'the app is dependency-free; keep it that way');
  const sheets = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
  for (const href of sheets) {
    assert.match(href, /^https:\/\/fonts\.googleapis\.com\//, 'unexpected stylesheet host: ' + href);
  }
});

test('the 169-hand preflop order is complete and strictly ordered by combo count', () => {
  const order = JSON.parse(read('src/rank-order.json'));
  assert.strictEqual(order.length, 169);
  assert.strictEqual(new Set(order).size, 169, 'no duplicates');
  const combos = (n) => (n.length === 2 ? 6 : n[2] === 's' ? 4 : 12);
  assert.strictEqual(order.reduce((t, n) => t + combos(n), 0), 1326, 'covers the whole deck');
  assert.strictEqual(order[0], 'AA');
  assert.strictEqual(order[order.length - 1], '32o');
});
