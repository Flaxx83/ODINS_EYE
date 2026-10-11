import test from 'node:test';
import assert from 'node:assert/strict';
import { departureStatus } from './local-traffic.js';
import { localDataContext } from './local-ai-data.js';
test('missing real-time forecast remains unknown, never on time', () => {
  assert.equal(departureStatus({ delay: 0, is_realtime: false }), 'unknown');
  assert.equal(departureStatus({ is_realtime: true, delay: null }), 'unknown');
  assert.equal(departureStatus({ is_realtime: true, delay: 61 }), 'late');
  assert.equal(departureStatus({ is_realtime: true, delay: -61 }), 'early');
  assert.equal(departureStatus({ is_realtime: true, delay: 60 }), 'onTime');
  assert.equal(departureStatus({ canceled: true }), 'cancelled');
});
test('AI air context keeps stale measurements and refresh failure explicit', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({
      series: [
        {
          lat: 58.4,
          lon: 13.85,
          name: 'station',
          pollutant: 'PM10',
          history: [{ time: '2000-01-01T00:00:00Z', value: 12 }],
        },
      ],
      refreshFailed: true,
      fetchedAt: '2026-10-11T00:00:00Z',
    }),
  }));
  const result = await localDataContext(
    'luftkvalitet',
    { lat: 58.4, lon: 13.85 },
    'http://fixture.invalid',
  );
  assert.equal(result.air.measurements[0].stale, true);
  assert.equal(result.air.refreshFailed, true);
  assert.equal(result.sources[0].time, '2026-10-11T00:00:00Z');
});
test('AI source failure is unknown, not an empty set of events', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw Error('offline fixture');
  });
  const result = await localDataContext(
    'polis',
    { lat: 58.4, lon: 13.85 },
    'http://fixture.invalid',
  );
  assert.match(result.police.error, /okänt/);
  assert.equal(result.police.total, undefined);
});
