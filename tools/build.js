#!/usr/bin/env node
/**
 * Assembles the single-file app from src/.
 *
 *   index.html          standalone page; opens straight from the filesystem
 *   dist/artifact.html  body-only fragment for the Claude Artifact platform,
 *                       which supplies its own doctype/head/body wrapper
 *
 * Both embed the exact bytes of src/evaluator.js and src/equity.js, so what the
 * tests exercise is what ships. test/build.test.js enforces that.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const R = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const W = (p, s) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), s); };

const parts = {
  head: R('src/app.head.html').trim(),
  css: R('src/app.css').trimEnd(),
  body: R('src/app.body.html').trim(),
  rank: R('src/rank-order.json').trim(),
  evaluator: R('src/evaluator.js').trimEnd(),
  equity: R('src/equity.js').trimEnd(),
  app: R('src/app.js').trimEnd(),
};

const script = [
  '<script>',
  '/* RANK_ORDER is generated from src/rank-order.json by tools/build.js */',
  'const RANK_ORDER=' + parts.rank + ';',
  '',
  parts.evaluator,
  '',
  parts.equity,
  '',
  parts.app,
  '</script>',
].join('\n');

const fragment = [parts.head, '<style>', parts.css, '</style>', '', parts.body, script, ''].join('\n');

/* The Artifact platform injects this reset; the standalone build repeats it so
   the two render identically. */
const RESET = [
  ':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}',
  'body{margin:0;font:14px system-ui,sans-serif;background:#fafaf9}',
  'img{max-width:100%}',
  '[hidden]{display:none!important}',
].join('\n');

const standalone = [
  '<!doctype html>',
  '<html lang="ja">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  parts.head,
  '<style>',
  RESET,
  parts.css,
  '</style>',
  '</head>',
  '<body>',
  parts.body,
  script,
  '</body>',
  '</html>',
  '',
].join('\n');

W('dist/artifact.html', fragment);
W('index.html', standalone);
for (const f of ['index.html', 'dist/artifact.html']) {
  console.log('built ' + f + ' (' + fs.statSync(path.join(root, f)).size + ' bytes)');
}
