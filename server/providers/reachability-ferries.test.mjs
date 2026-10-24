import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ferryCandidate, loadFerryDepartures } from './reachability-ferries.js';
import { validateReachability } from './reachability.js';
const start = Date.parse('2026-10-22T10:00:00+02:00');
const stop = (gid, area) => ({
  gid,
  name: 'Kaj',
  latitude: 57.7055,
  longitude: 11.94,
  stopArea: { gid: area },
});
const fixture = () => {
  const row = {
    isCancelled: false,
    isPartCancelled: false,
    detailsReference: 'ref',
    plannedTime: '2026-10-22T10:05:00+02:00',
    stopPoint: { gid: 'from' },
    serviceJourney: { gid: 'trip' },
  };
  const from = {
    stopPoint: stop('from', '9021014004493000'),
    plannedDepartureTime: row.plannedTime,
    isCancelled: false,
  };
  const to = {
    stopPoint: stop('to', '9021014006242000'),
    plannedArrivalTime: '2026-10-22T10:11:00+02:00',
    isCancelled: false,
  };
  return {
    row,
    from,
    to,
    details: {
      serviceJourneys: [
        {
          gid: 'trip',
          line: { transportMode: 'ferry', technicalLineNumber: '5286' },
          callsOnServiceJourney: [from, to],
        },
      ],
    },
  };
};
const normalize = (f) =>
  ferryCandidate(
    f.row,
    f.details,
    '9021014004493000',
    start,
    start + 30 * 60000,
  );
test('land policy explicit and restricted to walking; pilot bounded geographically', () => {
  const q = { lat: 57.7055, lon: 11.94, mode: 'walk', speed: 6, minutes: [15] };
  const bbox = [10, 55, 25, 70];
  assert.equal(validateReachability(q, bbox).ferryPolicy, 'network');
  for (const ferryPolicy of ['exclude', 'gothenburg'])
    assert.equal(
      validateReachability({ ...q, ferryPolicy }, bbox).ferryPolicy,
      ferryPolicy,
    );
  for (const change of [
    { ferryPolicy: 'yes' },
    { mode: 'bicycle', ferryPolicy: 'exclude' },
    { lat: 58.4, ferryPolicy: 'gothenburg' },
  ])
    assert.throws(() => validateReachability({ ...q, ...change }, bbox));
});
test('planned and estimated pairs remain distinct; invalid and cancelled trips rejected', () => {
  let f = fixture();
  assert.equal(normalize(f).arrival - start, 11 * 60000);
  assert.equal(normalize(f).timeQuality, 'Planerad tidtabell');
  f.from.estimatedDepartureTime = '2026-10-22T10:09:00+02:00';
  f.to.estimatedArrivalTime = '2026-10-22T10:15:00+02:00';
  assert.equal(normalize(f).departure - start, 9 * 60000);
  assert.match(normalize(f).timeQuality, /inte verifierad/);
  for (const key of ['isCancelled', 'isPartCancelled']) {
    f = fixture();
    f.row[key] = true;
    assert.equal(normalize(f), null);
  }
  f = fixture();
  f.to.isArrivalCancelled = true;
  assert.equal(normalize(f), null);
  f = fixture();
  f.to.plannedArrivalTime = '2026-10-22T10:40:00+02:00';
  assert.equal(normalize(f), null);
  f = fixture();
  f.to.plannedArrivalTime = 'nonsense';
  assert.throws(() => normalize(f));
  f = fixture();
  f.from.stopPoint.longitude = 50;
  assert.throws(() => normalize(f));
});
test('time offsets handle midnight and DST without local wall-clock arithmetic', () => {
  const f = fixture();
  f.row.plannedTime = f.from.plannedDepartureTime = '2026-10-25T02:55:00+02:00';
  f.to.plannedArrivalTime = '2026-10-25T02:05:00+01:00';
  const s = Date.parse('2026-10-25T02:50:00+02:00');
  const c = ferryCandidate(
    f.row,
    f.details,
    '9021014004493000',
    s,
    s + 30 * 60000,
  );
  assert.equal(c.arrival - c.departure, 10 * 60000);
  f.row.plannedTime = f.from.plannedDepartureTime = '2026-10-22T23:58:00+02:00';
  f.to.plannedArrivalTime = '2026-10-23T00:04:00+02:00';
  const midnight = Date.parse('2026-10-22T23:50:00+02:00');
  assert.equal(
    ferryCandidate(
      f.row,
      f.details,
      '9021014004493000',
      midnight,
      midnight + 30 * 60000,
    ).arrival - midnight,
    14 * 60000,
  );
});
test('bounded feed refuses truncation and never invents fallback data', async () => {
  await assert.rejects(
    loadFerryDepartures({ start, minutes: 15 }, async () => ({
      results: [],
      links: { next: 'next' },
    })),
    /ofullständigt/,
  );
  await assert.rejects(
    loadFerryDepartures({ start, minutes: 15 }, async () => {
      throw Error('offline');
    }),
    /offline/,
  );
  const paths = [];
  const r = await loadFerryDepartures({ start, minutes: 15 }, async (path) => {
    paths.push(path);
    return { results: [] };
  });
  assert.equal(r.candidates.length, 0);
  assert.equal(paths.length, 2);
  assert.ok(
    paths.every(
      (p) =>
        p.includes('maxDeparturesPerLineAndDirection=100') &&
        p.includes('startDateTime='),
    ),
  );
});
