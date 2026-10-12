import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalkingResolver } from './walking-geometry.js';
function shape(points) {
  let last = [0, 0],
    s = '';
  for (const [lon, lat] of points) {
    const vals = [Math.round(lat * 1e6), Math.round(lon * 1e6)];
    for (let i = 0; i < 2; i++) {
      let d = vals[i] - last[i];
      last[i] = vals[i];
      let n = d < 0 ? ~(d << 1) : d << 1;
      while (n >= 32) {
        s += String.fromCharCode((32 | (n & 31)) + 63);
        n >>>= 5;
      }
      s += String.fromCharCode(n + 63);
    }
  }
  return s;
}
const points = [
  [13, 58],
  [13.001, 58.001],
  [13.002, 58.002],
];
const trip = () => [
  {
    legs: [
      { name: 'Gång', approximate: true, coordinates: [points[0], points[2]] },
    ],
  },
];
const response = () =>
  new Response(JSON.stringify({ trip: { legs: [{ shape: shape(points) }] } }));
test('walking cache expires and never exposes mutable cached geometry', async () => {
  let clock = 0,
    calls = 0;
  const resolve = createWalkingResolver({
    now: () => clock,
    ttlMs: 100,
    wait: async () => {},
    fetchImpl: async () => {
      calls++;
      return response();
    },
  });
  const a = await resolve(trip());
  a[0].legs[0].coordinates[0][0] = 99;
  const b = await resolve(trip());
  assert.equal(calls, 1);
  assert.equal(b[0].legs[0].coordinates[0][0], 13);
  clock = 101;
  await resolve(trip());
  assert.equal(calls, 2);
});
test('concurrent identical walking requests share a single dispatch', async () => {
  let calls = 0;
  const resolve = createWalkingResolver({
    wait: async () => {},
    fetchImpl: async () => {
      calls++;
      return response();
    },
  });
  await Promise.all([resolve(trip()), resolve(trip())]);
  assert.equal(calls, 1);
});
test('walking cache evicts bounded entries', async () => {
  let calls = 0;
  const resolve = createWalkingResolver({
    maxEntries: 1,
    wait: async () => {},
    fetchImpl: async () => {
      calls++;
      return response();
    },
  });
  await resolve(trip());
  const other = trip();
  other[0].legs[0].coordinates[1] = [13.003, 58.003];
  await resolve(other);
  await resolve(trip());
  assert.equal(calls, 3);
});
test('failed routing keeps missing geometry and retries rather than caching failure', async () => {
  let calls = 0;
  const resolve = createWalkingResolver({
    wait: async () => {},
    fetchImpl: async () => {
      calls++;
      throw Error('offline');
    },
  });
  const a = await resolve(trip());
  assert.equal(a[0].legs[0].approximate, true);
  await resolve(trip());
  assert.equal(calls, 2);
});
test('configured routing endpoint is used without falling back to the public demo', async () => {
  let url;
  const resolve = createWalkingResolver({
    getBaseUrl: () => 'http://127.0.0.1:8002',
    wait: async () => {},
    fetchImpl: async (u) => {
      url = u;
      return response();
    },
  });
  await resolve(trip());
  assert.match(url, /^http:\/\/127\.0\.0\.1:8002\/route\?json=/);
});
