import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrafikverketClient } from './client.js';
import { normalizeQuery, queryXml } from './models.js';
const START = Date.parse('2026-10-11T12:00:00Z');
const API_KEY = 'fixture-secret-key';
const camera = {
  Id: 'fixture-camera',
  Active: true,
  PhotoTime: new Date(START).toISOString(),
  ModifiedTime: new Date(START - 1000).toISOString(),
};
const reply = (type = 'Camera', rows = [camera]) =>
  Response.json({ RESPONSE: { RESULT: [{ [type]: rows }] } });
function harness(options = {}) {
  let time = START,
    calls = 0;
  let handler =
    options.handler ||
    ((url, o) => reply(o.body.match(/objecttype="(\w+)"/)[1]));
  const client = createTrafikverketClient({
    getApiKey: () => API_KEY,
    now: () => time,
    policies: { Camera: { ttlMs: 1000, maxStaleMs: 5000 } },
    fetchImpl: (...args) => {
      calls++;
      return handler(...args);
    },
    ...options,
  });
  return {
    client,
    calls: () => calls,
    advance: (ms) => (time += ms),
    setHandler: (f) => (handler = f),
  };
}
test('unknown models, invalid fields, raw XML and invalid limits fail before network use', async () => {
  const h = harness();
  for (const query of [
    { type: 'constructor' },
    { type: 'Camera', limit: 0 },
    { type: 'Camera', limit: 3001 },
    { type: 'Camera', include: ['Id</INCLUDE>'] },
    { type: 'Camera', xml: '<LOGIN/>' },
    { type: 'Camera', filter: false },
    { type: 'Camera', filter: { op: 'EQ', field: 'Id', value: {} } },
  ])
    await assert.rejects(h.client.query(query), TypeError);
  assert.equal(h.calls(), 0);
});
test('attribute escaping cannot inject a second login or query; include order is canonical', () => {
  const query = normalizeQuery({
    type: 'Camera',
    include: ['Name', 'Id', 'Name'],
    filter: {
      op: 'EQ',
      field: 'Name',
      value: '"><LOGIN authenticationkey="bad"/>',
    },
  });
  const xml = queryXml(query, 'fixture&key');
  assert.ok(xml.includes('fixture&amp;key'));
  assert.ok(xml.includes('&lt;LOGIN'));
  assert.equal((xml.match(/<LOGIN /g) || []).length, 1);
  assert.deepEqual(query.include, ['Id', 'Name']);
});
test('concurrent identical callers share a fetch, cache their result and receive isolated rows', async () => {
  let resolve;
  const h = harness({ handler: () => new Promise((r) => (resolve = r)) });
  const first = h.client.query({ type: 'Camera' }),
    second = h.client.query({ type: 'Camera' });
  assert.equal(h.calls(), 1);
  resolve(reply());
  const [a, b] = await Promise.all([first, second]);
  a.rows[0].Id = 'mutated';
  assert.equal(b.rows[0].Id, camera.Id);
  const cached = await h.client.query({ type: 'Camera' });
  assert.equal(cached.rows[0].Id, camera.Id);
  assert.equal(cached.metadata.status, 'cached');
  assert.equal(h.calls(), 1);
});
test('a confirmed empty response stays distinct from missing or invalid data', async () => {
  const h = harness({ handler: () => reply('Camera', []) });
  const r = await h.client.query({ type: 'Camera' });
  assert.deepEqual(r.rows, []);
  assert.equal(r.metadata.empty, true);
  assert.equal(r.metadata.complete, true);
  assert.equal(r.metadata.status, 'fresh');
  h.advance(1001);
  h.setHandler(() => Response.json({ RESPONSE: { RESULT: [{}] } }));
  const failed = await h.client.query({ type: 'Camera' });
  assert.equal(failed.metadata.status, 'stale');
  assert.equal(failed.metadata.refreshFailed, true);
  assert.equal(failed.metadata.errorCode, 'invalid_schema');
});
test('upstream failure retains clocks, backs off and expires last-good data', async () => {
  const h = harness();
  const good = await h.client.query({ type: 'Camera' });
  h.advance(1001);
  h.setHandler(() => {
    throw Error(API_KEY);
  });
  const stale = await h.client.query({ type: 'Camera' });
  assert.equal(stale.metadata.fetchedAt, good.metadata.fetchedAt);
  assert.equal(stale.metadata.status, 'stale');
  assert.equal(stale.metadata.errorCode, 'network');
  assert.ok(!JSON.stringify(stale).includes(API_KEY));
  await h.client.query({ type: 'Camera' });
  assert.equal(h.calls(), 2);
  h.advance(4000);
  const expired = await h.client.query({ type: 'Camera' });
  assert.equal(expired.rows, null);
  assert.equal(expired.metadata.status, 'unavailable');
  assert.equal(expired.metadata.empty, null);
});
test('429 Retry-After suppresses all new queries, not only the failing cache key', async () => {
  const h = harness({
    handler: () =>
      new Response('secret upstream body', {
        status: 429,
        headers: { 'Retry-After': '120' },
      }),
  });
  const a = await h.client.query({ type: 'Camera' });
  assert.equal(a.metadata.errorCode, 'upstream_rate_limit');
  const b = await h.client.query({ type: 'TrainStation' });
  assert.equal(h.calls(), 1);
  assert.equal(b.metadata.errorCode, 'upstream_rate_limit');
  h.advance(119000);
  await h.client.query({ type: 'TrainStation' });
  assert.equal(h.calls(), 1);
  h.advance(1001);
  h.setHandler((url, o) => reply(o.body.match(/objecttype="(\w+)"/)[1], []));
  const c = await h.client.query({ type: 'TrainStation' });
  assert.equal(c.metadata.status, 'fresh');
  assert.equal(h.calls(), 2);
});
test('local request budgets stop new work and reset on the next UTC day', async () => {
  const h = harness({ dailyBudget: 1 });
  await h.client.query({ type: 'Camera' });
  const b = await h.client.query({ type: 'TrainStation' });
  assert.equal(b.rows, null);
  assert.equal(b.metadata.errorCode, 'request_budget');
  assert.equal(h.calls(), 1);
  h.advance(86400000);
  await h.client.query({ type: 'TrainStation' });
  assert.equal(h.calls(), 2);
});
test('missing credentials never contact upstream and public status has no key or query values', async () => {
  const h = harness({ getApiKey: () => '' });
  const r = await h.client.query({ type: 'Camera' });
  assert.equal(r.metadata.status, 'unconfigured');
  assert.equal(r.rows, null);
  assert.equal(h.calls(), 0);
  const configured = harness();
  await configured.client.query({
    type: 'Camera',
    filter: { op: 'EQ', field: 'Name', value: 'private-query-value' },
  });
  const status = JSON.stringify(configured.client.getStatus());
  assert.ok(!status.includes(API_KEY));
  assert.ok(!status.includes('private-query-value'));
});
test('whole-request timeout also ends a fetch implementation that ignores abort', async () => {
  const h = harness({ handler: () => new Promise(() => {}), timeoutMs: 20 });
  const r = await h.client.query({ type: 'Camera' });
  assert.equal(r.metadata.errorCode, 'timeout');
  assert.equal(r.rows, null);
  assert.equal(h.client.getStatus().activeRequests, 0);
});
test('streamed response byte cap cancels oversized bodies', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('å'.repeat(100)));
    },
    cancel() {
      cancelled = true;
    },
  });
  const h = harness({
    maxResponseBytes: 100,
    handler: () => new Response(stream),
  });
  const r = await h.client.query({ type: 'Camera' });
  assert.equal(r.metadata.errorCode, 'RESPONSE_TOO_LARGE');
  assert.equal(cancelled, true);
});
test('upstream credential echoes never become cached camera data', async () => {
  const h = harness({ handler: () => reply('Camera', [{ Id: API_KEY }]) });
  const r = await h.client.query({ type: 'Camera' });
  assert.equal(r.rows, null);
  assert.equal(r.metadata.errorCode, 'credential_in_response');
  assert.ok(!JSON.stringify(h.client.getStatus()).includes(API_KEY));
});
test('observed age is separate from fetch age and a future departure is not an observation', async () => {
  const h = harness({
    handler: (url, o) =>
      o.body.includes('TrainAnnouncement')
        ? reply('TrainAnnouncement', [
            { AdvertisedTimeAtLocation: '2026-10-12T07:00:00Z' },
          ])
        : reply('Camera', [{ ...camera, PhotoTime: '2026-10-10T00:00:00Z' }]),
  });
  const c = await h.client.query({ type: 'Camera' });
  assert.equal(c.metadata.status, 'fresh');
  assert.equal(c.metadata.staleObservations, 1);
  const t = await h.client.query({ type: 'TrainAnnouncement' });
  assert.equal(t.metadata.newestObservationAt, null);
  assert.equal(t.metadata.unknownObservations, 1);
});
test('reaching the requested limit is explicitly potentially truncated', async () => {
  const h = harness();
  const r = await h.client.query({ type: 'Camera', limit: 1 });
  assert.equal(r.metadata.complete, false);
});
test('credential changes discard older in-flight generations and both waiting consumers', async () => {
  let key = API_KEY,
    resolve;
  const h = harness({
    getApiKey: () => key,
    handler: () => new Promise((r) => (resolve = r)),
  });
  const a = h.client.query({ type: 'Camera' }),
    b = h.client.query({ type: 'Camera' });
  key = 'other-fixture-key';
  h.client.getStatus();
  resolve(reply());
  for (const r of await Promise.all([a, b])) {
    assert.equal(r.rows, null);
    assert.equal(r.metadata.errorCode, 'credentials_changed');
  }
  assert.equal(h.client.getStatus().cachedBytes, 0);
});
test('cache entry and byte budgets bound retained query variants', async () => {
  const h = harness({ maxEntries: 2 });
  for (const name of ['one', 'two', 'three'])
    await h.client.query({
      type: 'Camera',
      filter: { op: 'EQ', field: 'Name', value: name },
    });
  assert.equal(h.client.getStatus().cacheEntries, 2);
  const tiny = harness({ maxCacheBytes: 32 });
  await tiny.client.query({ type: 'Camera' });
  assert.ok(tiny.client.getStatus().cachedBytes <= 32);
});

test('numeric or date-only observations remain unknown, rather than inventing midnight or epoch data', async () => {
  const h = harness({
    handler: () =>
      reply('Camera', [
        { ...camera, PhotoTime: 0 },
        { ...camera, PhotoTime: '2026-10-11' },
        { ...camera, PhotoTime: '2026-10-12T12:00:00Z' },
      ]),
  });
  const r = await h.client.query({ type: 'Camera' });
  assert.equal(r.metadata.newestObservationAt, null);
  assert.equal(r.metadata.unknownObservations, 3);
});
test('the minute budget prevents bursts independently of the daily allowance', async () => {
  const h = harness({ minuteBudget: 1 });
  await h.client.query({ type: 'Camera' });
  const limited = await h.client.query({ type: 'TrainStation' });
  assert.equal(limited.metadata.errorCode, 'request_budget');
  assert.equal(h.calls(), 1);
  h.advance(60001);
  await h.client.query({ type: 'TrainStation' });
  assert.equal(h.calls(), 2);
});

test('cache policy is copied and cannot change the verified schema version', async () => {
  assert.throws(
    () =>
      createTrafikverketClient({
        policies: { Camera: { version: 'unverified' } },
      }),
    TypeError,
  );
  const policies = { Camera: { ttlMs: 1000, maxStaleMs: 5000 } };
  const h = harness({ policies });
  await h.client.query({ type: 'Camera' });
  policies.Camera.ttlMs = 0;
  await h.client.query({ type: 'Camera' });
  assert.equal(h.calls(), 1);
});

test('an API error envelope is unavailable, never a confirmed empty dataset', async () => {
  const h = harness({
    handler: () =>
      Response.json({
        RESPONSE: {
          RESULT: [{ ERROR: { SOURCE: 'Request', MESSAGE: 'not available' } }],
        },
      }),
  });
  const r = await h.client.query({ type: 'Camera' });
  assert.equal(r.rows, null);
  assert.equal(r.metadata.empty, null);
  assert.equal(r.metadata.errorCode, 'upstream_api');
});
test('distinct queries cannot exceed the in-flight request cap', async () => {
  let resolve;
  const h = harness({
    maxInFlight: 1,
    handler: () => new Promise((r) => (resolve = r)),
  });
  const a = h.client.query({ type: 'Camera' });
  const b = await h.client.query({ type: 'TrainStation' });
  assert.equal(b.metadata.errorCode, 'busy');
  assert.equal(h.calls(), 1);
  resolve(reply());
  await a;
  assert.equal(h.client.getStatus().activeRequests, 0);
});

test('decoded JSON escapes cannot leak a quoted API credential', async () => {
  const key = 'fixture"quoted-secret';
  const h = harness({
    getApiKey: () => key,
    handler: () => reply('Camera', [{ Id: key }]),
  });
  const r = await h.client.query({ type: 'Camera' });
  assert.equal(r.rows, null);
  assert.equal(r.metadata.errorCode, 'credential_in_response');
});
test('deep payloads are rejected without publishing partially cached data', async () => {
  let object = {};
  for (let i = 0; i < 70; i++) object = { nested: object };
  const h = harness({ handler: () => reply('Camera', [object]) });
  const r = await h.client.query({ type: 'Camera' });
  assert.equal(r.rows, null);
  assert.equal(r.metadata.errorCode, 'invalid_schema');
  assert.equal(h.client.getStatus().cachedBytes, 0);
});
