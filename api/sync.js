/**
 * Syncs saved ranges and spots across devices. The app has one set of saved
 * data: every page that can reach this function shares it, and nothing ties it
 * to a person, so anyone who can open the site can read and change it.
 *
 *   GET  /api/sync   -> { data }            what is stored
 *   POST /api/sync   { data } -> { data }   merged with what is stored, saved
 *
 * data is { ranges: [...], spots: [...] }, each entry carrying a name and t
 * (ms since epoch, when it last changed). The server does the merging, so the
 * page has no merge code of its own: it sends everything it has and keeps
 * what comes back.
 *
 * Storage is the Upstash for Redis resource attached to the project, reached
 * over its REST API with plain fetch so the app stays dependency-free.
 *
 * A page opened from localhost calls the deployed function across origins, so
 * those origins (and only those) get CORS headers and a preflight answer.
 */
const KINDS = ['ranges', 'spots'];
const DB_KEY = 'eq:saved';
const MAX_BODY = 256 * 1024;
/* A deletion is kept as an entry with del:true long enough to reach every
   device; after that it is dropped. */
const KEEP_DELETED_MS = 90 * 24 * 3600 * 1000;

/* Per kind, the newest entry for each name wins; at the same time a deletion
   beats an edit. Newest first. */
function merge(a, b, now = Date.now()) {
  const out = {};
  for (const k of KINDS) {
    const m = new Map();
    for (const x of [...((a && a[k]) || []), ...((b && b[k]) || [])]) {
      if (!x || typeof x.name !== 'string' || !Number.isFinite(x.t)) continue;
      const cur = m.get(x.name);
      if (!cur || x.t > cur.t || (x.t === cur.t && x.del && !cur.del)) m.set(x.name, x);
    }
    out[k] = [...m.values()].filter((x) => !x.del || now - x.t < KEEP_DELETED_MS).sort((x, y) => y.t - x.t);
  }
  return out;
}

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
/* The CORS headers for a request from origin: none unless it is a local page. */
function corsHeaders(origin) {
  if (typeof origin !== 'string' || !LOCAL_ORIGIN.test(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    Vary: 'Origin',
  };
}

/* One Redis command over Upstash's REST API: POST the command as a JSON array. */
async function redis(cmd, env, f) {
  const r = await f(env.KV_REST_API_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.KV_REST_API_TOKEN },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).result;
}

/* The request as plain values in, { status, json } out, so the tests can run
   it against a stand-in for Upstash. */
async function handle({ method, body }, env = process.env, f = fetch) {
  if (method !== 'GET' && method !== 'POST') return { status: 405, json: { error: 'GET or POST' } };
  if (!env.KV_REST_API_URL || !env.KV_REST_API_TOKEN) return { status: 503, json: { error: 'storage is not configured' } };
  let incoming = null;
  if (method === 'POST') {
    const text = typeof body === 'string' ? body : JSON.stringify(body || {});
    if (text.length > MAX_BODY) return { status: 413, json: { error: 'too large' } };
    try { incoming = JSON.parse(text).data; } catch (e) { return { status: 400, json: { error: 'bad json' } }; }
  }
  const stored = await redis(['GET', DB_KEY], env, f);
  const cur = stored ? JSON.parse(stored) : merge(null, null);
  if (method === 'GET') return { status: 200, json: { data: cur } };
  const next = merge(cur, incoming);
  const out = JSON.stringify(next);
  if (out.length > MAX_BODY) return { status: 413, json: { error: 'too large' } };
  await redis(['SET', DB_KEY, out], env, f);
  return { status: 200, json: { data: next } };
}

module.exports = async function handler(req, res) {
  for (const [k, v] of Object.entries(corsHeaders(req.headers.origin))) res.setHeader(k, v);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  try {
    const r = await handle({ method: req.method, body: req.body });
    res.setHeader('Cache-Control', 'no-store');
    res.status(r.status).json(r.json);
  } catch (e) {
    res.status(502).json({ error: 'storage unavailable' });
  }
};
module.exports.merge = merge;
module.exports.handle = handle;
module.exports.DB_KEY = DB_KEY;
module.exports.corsHeaders = corsHeaders;
