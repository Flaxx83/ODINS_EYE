import { createTimetableLoader } from './timetables.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  departureStatus,
  normalizeDeparture,
  summarizeDepartures,
  trafficTime,
} from './transit-summary.js';
import { trafficAnswer } from './local-traffic.js';
const start = Date.parse('2026-10-12T07:00:00Z'),
  end = start + 3600000;
const row = (o = {}) => ({
  scheduled: '2026-10-12T09:10:00',
  realtime: '2026-10-12T09:12:00',
  delay: 120,
  is_realtime: true,
  canceled: false,
  agency: { name: 'AB SL Kundtjänst' },
  stop: { id: 's1' },
  trip: { trip_id: 't1', start_date: '2026-10-12' },
  route: { transport_mode: 'BUS' },
  ...o,
});
const board = (rows, extra = {}) => ({
  id: 'area1',
  name: 'A',
  provider: 'sl',
  rows,
  fetchedAt: new Date(start).toISOString(),
  generatedAt: new Date(start).toISOString(),
  ...extra,
});
const sum = (r, modes = []) => summarizeDepartures(r, { start, end, modes });
test('same trip at different stops remains distinct; duplicate aliases and platform changes do not', () => {
  const r = sum([
    board([
      row(),
      row({ scheduled_platform: { id: 'changed' } }),
      row({ stop: { id: 's2' } }),
    ]),
  ]);
  assert.equal(r.count, 2);
  assert.equal(r.coverage.duplicateRows, 1);
  assert.equal(r.totals.late, 2);
});
test('same trip on different service days/times remains distinct', () => {
  const r = sum([
    board([
      row(),
      row({ trip: { trip_id: 't1', start_date: '2026-10-11' } }),
      row({
        scheduled: '2026-10-12T09:20:00',
        realtime: '2026-10-12T09:22:00',
      }),
    ]),
  ]);
  assert.equal(r.count, 3);
});
test('conflicting duplicates become unknown and do not choose whichever board happens to be first', () => {
  for (const rows of [
    [row(), row({ canceled: true })],
    [row({ canceled: true }), row()],
  ]) {
    const r = sum([board(rows)]);
    assert.equal(r.count, 1);
    assert.equal(r.totals.unknown, 1);
    assert.equal(r.coverage.conflictingDepartures, 1);
  }
});
test('explicit SL realtime flag is required even when fallback times and delay zero exist', () => {
  assert.equal(
    departureStatus(
      normalizeDeparture(
        row({ is_realtime: false, realtime: '2026-10-12T09:10:00', delay: 0 }),
        'sl',
      ),
    ),
    'unknown',
  );
  assert.equal(
    departureStatus({ canceled: 'false', is_realtime: true, delay: 0 }),
    'onTime',
  );
});
test('Västtrafik uses explicit estimatedTime and never otherwise-planned fallback or a line-level flag', () => {
  const x = {
    serviceJourney: {
      gid: 'journey',
      line: { transportMode: 'tram', isRealtimeJourney: false },
    },
    stopPoint: { gid: 'stop' },
    plannedTime: '2026-10-12T09:10:00+02:00',
    estimatedTime: '2026-10-12T09:15:00+02:00',
  };
  assert.equal(departureStatus(normalizeDeparture(x, 'vasttrafik')), 'late');
  delete x.estimatedTime;
  x.estimatedOtherwisePlannedTime = x.plannedTime;
  assert.equal(departureStatus(normalizeDeparture(x, 'vasttrafik')), 'unknown');
});
test('thresholds are strict and an explicit forecast can be early or within tolerance', () => {
  for (const [delay, status] of [
    [60, 'onTime'],
    [-60, 'onTime'],
    [61, 'late'],
    [-61, 'early'],
  ])
    assert.equal(departureStatus({ is_realtime: true, delay }), status);
  assert.equal(departureStatus({ canceled: true, stale: true }), 'unknown');
});
test('contradicting delay and timestamp fields, missing forecasts and malformed clocks stay unknown', () => {
  assert.equal(
    departureStatus(normalizeDeparture(row({ delay: 0 }), 'sl')),
    'unknown',
  );
  assert.equal(
    departureStatus(normalizeDeparture(row({ realtime: null }), 'sl')),
    'unknown',
  );
  assert.equal(trafficTime('2026-02-30T09:00:00Z'), null);
  assert.equal(trafficTime('2026-10-25T02:30:00'), null);
});
test('window includes delayed past-scheduled departures, excludes future/outside and supports BUS OR TRAM', () => {
  const r = sum(
    [
      board([
        row({
          scheduled: '2026-10-12T08:55:00',
          realtime: '2026-10-12T09:05:00',
          delay: 600,
        }),
        row({ trip: { trip_id: 'tram' }, route: { transport_mode: 'TRAM' } }),
        row({
          trip: { trip_id: 'end' },
          scheduled: '2026-10-12T10:00:00',
          realtime: '2026-10-12T10:00:00',
          delay: 0,
        }),
        row({ trip: { trip_id: 'train' }, route: { transport_mode: 'TRAIN' } }),
      ]),
    ],
    ['BUS', 'TRAM'],
  );
  assert.equal(r.count, 2);
  assert.equal(r.coverage.outsideWindowRows, 1);
  assert.equal(r.coverage.excludedRows, 1);
});
test('empty, failed, malformed, capped and stale boards are distinguishable', () => {
  assert.equal(sum([board([])]).count, 0);
  assert.equal(sum([{ id: 'a', error: 'fetch' }]).count, null);
  assert.equal(sum([board([row({ trip: undefined })])]).count, null);
  const r = sum([
    board([row()], { capped: true, stale: true }),
    { id: 'b', error: 'fetch' },
  ]);
  assert.equal(r.status, 'partial');
  assert.equal(r.totals.unknown, 1);
  assert.equal(r.coverage.failedStops, 1);
  assert.equal(r.coverage.cappedStops, 1);
});
test('non-SL agencies are excluded and missing authority is reported as invalid', () => {
  const r = sum([
    board([row(), row({ agency: { name: 'SJ' } }), row({ agency: null })]),
  ]);
  assert.equal(r.count, 1);
  assert.equal(r.coverage.excludedRows, 1);
  assert.equal(r.coverage.invalidRows, 1);
  assert.equal(r.status, 'partial');
});
const stops = [
  { id: '740000001', name: 'A', lat: 59.33, lon: 18.06 },
  { id: '740000002', name: 'B', lat: 59.331, lon: 18.06 },
];
test('SL adapter reports partial failures with actual cached fetch clock, not a new one', async () => {
  const d = await trafficAnswer(
    'SL: Hur många bussar är sena?',
    { lat: 59.33, lon: 18.06 },
    'http://fixture',
    {
      getNow: () => start,
      getStops: async () => stops,
      fetchImpl: async (url) =>
        url.endsWith('002')
          ? new Response('', { status: 503 })
          : Response.json({
              timestamp: '2026-10-12T09:00:00',
              gev: { fetchedAt: '2026-10-12T06:59:30Z' },
              departures: [row()],
            }),
    },
  );
  assert.equal(d.trafficSummary.coverage.failedStops, 1);
  assert.equal(d.trafficSummary.totals.late, 1);
  assert.equal(d.sources[0].time, '2026-10-12T06:59:30.000Z');
  assert.match(d.answer, /inte hela stadens/);
});
test('all fetch errors yield null counts and no fabricated source clock', async () => {
  const d = await trafficAnswer('SL: sena bussar', {}, 'http://fixture', {
    getNow: () => start,
    getStops: async () => stops,
    fetchImpl: async () => {
      throw Error('private credential');
    },
  });
  assert.equal(d.trafficSummary.totals, null);
  assert.deepEqual(d.sources, []);
  assert.doesNotMatch(d.answer, /private credential/);
});
test('future traffic status and conflicting cities never make network requests', async () => {
  for (const m of [
    'sena bussar i Göteborg imorgon',
    'trafikläge Göteborg och Stockholm',
    'SL: sena bussar i Göteborg',
  ]) {
    const d = await trafficAnswer(m, {}, '', {
      fetchImpl: () => {
        throw Error('unexpected fetch');
      },
    });
    assert.equal(d.trafficSummary.count, null);
  }
});
test('Västtrafik selects unique nearby stop areas without the national catalog and marks capped boards', async () => {
  let calls = 0;
  const d = await trafficAnswer(
    'sena bussar och spårvagnar i Göteborg',
    {},
    '',
    {
      getNow: () => start,
      getToken: async () => 'dummy',
      getStops: () => {
        throw Error('national stop registry must not be used');
      },
      fetchImpl: async (url) => {
        calls++;
        return url.includes('by-coordinates')
          ? Response.json({
              results: [
                {
                  gid: '9021014001760000',
                  locationType: 'stoparea',
                  name: 'A',
                  latitude: 57.708,
                  longitude: 11.974,
                },
                {
                  gid: '9021014001760000',
                  locationType: 'stoparea',
                  name: 'A alias',
                  latitude: 57.708,
                  longitude: 11.974,
                },
              ],
            })
          : Response.json({
              results: [
                {
                  serviceJourney: {
                    gid: 'journey',
                    line: { transportMode: 'bus' },
                  },
                  stopPoint: { gid: 'stop' },
                  plannedTime: '2026-10-12T09:10:00+02:00',
                  estimatedTime: '2026-10-12T09:12:00+02:00',
                },
              ],
              links: { next: 'more' },
            });
      },
    },
  );
  assert.equal(calls, 2);
  assert.equal(d.trafficSummary.coverage.selectedStops, 1);
  assert.equal(d.trafficSummary.coverage.cappedStops, 1);
  assert.equal(d.trafficSummary.totals.late, 1);
});
test('explicit town selects its own center and does not silently use the map', async () => {
  let url;
  const d = await trafficAnswer(
    'Hur många bussar är sena i Skövde?',
    { lat: 59.33, lon: 18.06 },
    '',
    {
      getNow: () => start,
      getToken: async () => 'dummy',
      fetchImpl: async (u) => {
        url = u;
        return Response.json({ results: [] });
      },
    },
  );
  assert.match(url, /latitude=58.39118/);
  assert.match(url, /longitude=13.84506/);
  assert.equal(d.trafficSummary.count, null);
  for (const message of [
    'sena bussar i Okändstad',
    'SL: sena bussar i Skövde',
  ]) {
    const r = await trafficAnswer(message, {}, '', {
      fetchImpl: () => {
        throw Error('unexpected network');
      },
    });
    assert.equal(r.trafficSummary.count, null);
  }
});

test('coalesced and cached departure responses retain the actual upstream fetch time', async () => {
  let clock = start,
    calls = 0,
    budget = 0;
  const load = createTimetableLoader({
    now: () => clock,
    getKey: () => 'test-only',
    recordRequest: async () => {
      budget++;
    },
    fetchImpl: async () => {
      calls++;
      return Response.json({
        departures: [],
        timestamp: '2026-10-12T09:00:00',
      });
    },
  });
  const [a, b] = await Promise.all([
    load('departures/1', 60000),
    load('departures/1', 60000),
  ]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  assert.equal(budget, 1);
  clock += 30000;
  const cached = await load('departures/1', 60000);
  assert.equal(cached.gev.fetchedAt, new Date(start).toISOString());
  assert.equal(calls, 1);
  clock += 31000;
  const fresh = await load('departures/1', 60000);
  assert.equal(fresh.gev.fetchedAt, new Date(clock).toISOString());
  assert.equal(calls, 2);
});
