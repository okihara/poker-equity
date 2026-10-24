const test = require('node:test');
const assert = require('node:assert');
const { merge, handle, DB_KEY, corsHeaders } = require('../api/sync.js');

const env = { KV_REST_API_URL: 'https://redis.test', KV_REST_API_TOKEN: 't' };

/* A stand-in for Upstash's REST API: GET and SET on a Map, answered the way
   the real one answers ({ result }). */
function fakeUpstash() {
  const db = new Map(), calls = [];
  const f = async (url, init) => {
    assert.strictEqual(url, env.KV_REST_API_URL);
    assert.strictEqual(init.headers.Authorization, 'Bearer t');
    const cmd = JSON.parse(init.body);
    calls.push(cmd);
    const result = cmd[0] === 'GET' ? db.get(cmd[1]) ?? null : (db.set(cmd[1], cmd[2]), 'OK');
    return { ok: true, json: async () => ({ result }) };
  };
  return { db, calls, f };
}

test('the newest entry for each name wins, and a deletion travels as one', () => {
  const a = { ranges: [{ name: 'CO', r: 'AA', t: 1 }, { name: 'BTN', r: 'KK', t: 5 }], spots: [] };
  const b = { ranges: [{ name: 'CO', r: 'QQ', t: 2 }, { name: 'BTN', del: true, t: 4 }], spots: [{ name: 's', t: 3 }] };
  const m = merge(a, b, 10);
  assert.deepStrictEqual(m.ranges.map((x) => [x.name, x.r]), [['BTN', 'KK'], ['CO', 'QQ']]);
  assert.deepStrictEqual(m.spots.map((x) => x.name), ['s']);
  const d = merge(a, { ranges: [{ name: 'CO', del: true, t: 3 }] }, 10);
  assert.ok(d.ranges.find((x) => x.name === 'CO').del, 'a later deletion beats the edit');
});

test('old deletions are dropped and malformed entries ignored', () => {
  const day = 24 * 3600 * 1000, now = 200 * day;
  const m = merge({ ranges: [{ name: 'old', del: true, t: now - 100 * day }, { name: 'new', del: true, t: now - day },
    { r: 'no name', t: 1 }, { name: 'no time' }, null] }, null, now);
  assert.deepStrictEqual(m.ranges.map((x) => x.name), ['new']);
});

test('every POST merges into the one saved set', async () => {
  const u = fakeUpstash();
  const r1 = await handle({ method: 'POST', body: { data: { ranges: [{ name: 'A', r: 'AA', t: 1 }] } } }, env, u.f);
  assert.strictEqual(r1.status, 200);
  const r2 = await handle({ method: 'POST', body: JSON.stringify({ data: { spots: [{ name: 'S', t: 2 }] } }) }, env, u.f);
  assert.deepStrictEqual(r2.json.data.ranges.map((x) => x.name), ['A'], 'the other device\'s range survives');
  assert.deepStrictEqual(r2.json.data.spots.map((x) => x.name), ['S']);
  assert.deepStrictEqual([...u.db.keys()], [DB_KEY]);
  assert.strictEqual(u.calls.find((c) => c[0] === 'SET').length, 3, 'stored without an expiry');
  const g = await handle({ method: 'GET' }, env, u.f);
  assert.deepStrictEqual(g.json.data, r2.json.data);
});

test('bad bodies, other methods and missing storage are refused', async () => {
  const u = fakeUpstash();
  assert.strictEqual((await handle({ method: 'POST', body: '{' }, env, u.f)).status, 400);
  assert.strictEqual((await handle({ method: 'POST', body: 'x'.repeat(300000) }, env, u.f)).status, 413);
  assert.strictEqual((await handle({ method: 'PUT', body: {} }, env, u.f)).status, 405);
  assert.strictEqual((await handle({ method: 'GET' }, {}, u.f)).status, 503);
  assert.strictEqual(u.db.size, 0, 'nothing was written');
});

test('only local pages get CORS headers', () => {
  for (const o of ['http://localhost:8731', 'http://localhost', 'http://127.0.0.1:3000'])
    assert.strictEqual(corsHeaders(o)['Access-Control-Allow-Origin'], o, o);
  for (const o of [undefined, 'null', 'https://localhost:8731', 'http://localhost.evil.test', 'https://example.com', 'http://192.168.0.2:8731'])
    assert.deepStrictEqual(corsHeaders(o), {}, String(o));
});
