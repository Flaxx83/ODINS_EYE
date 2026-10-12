import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAddressSearch,
  normalizeSearchRows,
  rankSearchRows,
  addressSearchPlugin,
} from './address-search.js';
const vt = {
  results: [
    {
      name: 'Storgatan, 541 30 Skövde',
      latitude: 58.4,
      longitude: 13.8,
      locationType: 'address',
    },
    {
      name: 'Storgatan, Stockholm',
      latitude: 59.3,
      longitude: 18.0,
      locationType: 'address',
    },
    {
      name: 'Storgatan 12 A, Skövde',
      latitude: 58.4,
      longitude: 13.8,
      locationType: 'address',
    },
    {
      name: 'Storgatan 12 B, Skövde',
      latitude: 58.4,
      longitude: 13.8,
      locationType: 'address',
    },
    {
      name: 'Torget, Skövde',
      latitude: 58.4,
      longitude: 13.8,
      locationType: 'stoparea',
    },
  ],
};
const area = { lat: 58.4, lon: 13.8 };
test('general street search preserves alternatives and softly prioritizes current area', () => {
  const r = rankSearchRows(normalizeSearchRows(vt), 'Storgatan', area);
  assert.ok(r.length > 1);
  assert.match(r[0].name, /Skövde/);
  assert.ok(r.some((x) => x.name.includes('Stockholm')));
});
test('house number and suffix cannot be silently replaced', () => {
  const r = rankSearchRows(
    normalizeSearchRows(vt),
    'Storgatan 12 A i Skövde',
    area,
  );
  assert.equal(r.length, 1);
  assert.match(r[0].name, /12 A/);
  assert.equal(r[0].exact, true);
});
test('stop and invalid coordinates have distinct handling', () => {
  const rows = normalizeSearchRows({
    results: [...vt.results, { name: 'Torget', latitude: 999, longitude: 1 }],
  });
  assert.equal(rows.length, 5);
  assert.equal(rankSearchRows(rows, 'Torget')[0].kind, 'stop');
});
test('cache and in-flight coalescing avoid duplicate upstream calls and isolate returned values', async () => {
  let calls = 0;
  const service = createAddressSearch({
    getToken: async () => 'fixture',
    wait: async () => {},
    fetchImpl: async (url) => {
      calls++;
      return new Response(
        JSON.stringify(url.includes('vasttrafik') ? vt : { features: [] }),
      );
    },
  });
  const [a, b] = await Promise.all([
    service.search('Storgatan', { area }),
    service.search('Storgatan', { area }),
  ]);
  assert.equal(calls, 2);
  a.rows[0].name = 'mutated';
  assert.notEqual(b.rows[0].name, 'mutated');
  await service.search('Storgatan', { area });
  assert.equal(calls, 2);
});
test('partial outage is explicit and is not cached as complete', async () => {
  let calls = 0;
  const service = createAddressSearch({
    getToken: async () => 'fixture',
    wait: async () => {},
    fetchImpl: async (url) => {
      calls++;
      if (url.includes('photon')) throw Error('down');
      return new Response(JSON.stringify(vt));
    },
  });
  assert.equal((await service.search('Torget')).partial, true);
  await service.search('Torget');
  assert.equal(calls, 4);
});
test('middleware registration returns no Vite post-hook', () => {
  assert.equal(
    addressSearchPlugin().configureServer({
      middlewares: {
        use() {
          return () => {};
        },
      },
    }),
    undefined,
  );
});
