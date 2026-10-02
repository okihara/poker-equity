const test = require('node:test');
const assert = require('node:assert');
const { loadEngine, parseCards } = require('./harness.js');

/* src/worker.js only wires itself up inside a Worker. Load the engine with a
   stand-in WorkerGlobalScope so the same bytes take that branch here. */
function fakeWorker() {
  const posted = [];
  globalThis.__fakeWorker = { postMessage: (m) => posted.push(m) };
  loadEngine({
    prelude: 'class WorkerGlobalScope{};' +
      'const self=Object.setPrototypeOf(globalThis.__fakeWorker,WorkerGlobalScope.prototype);',
  });
  const self = globalThis.__fakeWorker;
  delete globalThis.__fakeWorker;
  return { self, posted };
}

const all = [];
for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) all.push([a, b, 1]);

test('the worker answers a query with progress and then a result', async () => {
  const { self, posted } = fakeWorker();
  assert.strictEqual(typeof self.onmessage, 'function', 'worker.js did not install onmessage');
  await self.onmessage({ data: { id: 1, a: all, b: all, board: parseCards('Qs Js 2h'), dead: [], opts: {} } });
  const results = posted.filter((m) => m.result);
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].id, 1);
  assert.ok(Math.abs(results[0].result.equity - 0.5) < 1e-12);
  const progress = posted.filter((m) => 'progress' in m);
  assert.ok(progress.length > 0, 'a full-range flop should report progress');
  assert.ok(progress.every((m) => m.id === 1 && m.progress > 0 && m.progress < 1 && Number.isFinite(m.partial)));
  assert.ok(posted.indexOf(results[0]) === posted.length - 1, 'the result comes last');
});

test('a newer query makes the running one stop without a result', async () => {
  const { self, posted } = fakeWorker();
  const slow = self.onmessage({ data: { id: 1, a: all, b: all, board: parseCards('Qs Js 2h'), dead: [], opts: {} } });
  const fast = self.onmessage({ data: { id: 2, a: all, b: all, board: parseCards('Qs Js 2h 7d 3c'), dead: [], opts: {} } });
  await Promise.all([slow, fast]);
  const results = posted.filter((m) => m.result);
  assert.deepStrictEqual(results.map((m) => m.id), [2], 'only the newest query may answer');
});
