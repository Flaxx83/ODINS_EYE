import test from 'node:test';
import assert from 'node:assert/strict';
import { createRailResolver } from './rail-network-geometry.js';
import { resRobotMapTrips } from './trip-map.js';
const leg = (overrides = {}) => ({
  type: 'JNY',
  Origin: { name: 'A', lon: 13, lat: 58 },
  Destination: { name: 'B', lon: 14, lat: 59 },
  Product: [{ name: 'SJ Snabbtåg', num: '422' }],
  ...overrides,
});
const trip = (l) => [{ LegList: { Leg: Array.isArray(l) ? l : [l] } }];
const good = (points) => ({
  status: 'ok',
  coordinates: points.map((p) => [...p]),
  distanceMeters: 10000,
  snaps: points.map((p) => ({ distanceMeters: 10, position: [...p] })),
  segments: [{ distanceMeters: 10000, limitMeters: 20000 }],
});
const stat = async () => ({ mtimeMs: 1, size: 1 });
test('a two-point path from a verified graph edge is calculated, with station diagnostics', async () => {
  const raw = trip(leg());
  const mapped = resRobotMapTrips(raw);
  const resolve = createRailResolver({
    getGraphStat: stat,
    calculateRoute: async (points) => good(points),
  });
  await resolve(raw, mapped);
  const l = mapped[0].legs[0];
  assert.equal(l.approximate, false);
  assert.equal(l.calculated, true);
  assert.equal(l.geometryDiagnostics.stations[0].name, 'A');
  assert.match(l.geometrySource, /faktiska spårval är inte bekräftat/);
});
test('missing route gives a concrete reason at the affected stations and keeps endpoints only', async () => {
  const raw = trip(leg());
  const mapped = resRobotMapTrips(raw);
  const resolve = createRailResolver({
    getGraphStat: stat,
    calculateRoute: async () => ({
      status: 'missing',
      reason: 'detour_rejected',
      segmentIndex: 0,
      limitMeters: 72000,
      coordinates: [],
    }),
  });
  await resolve(raw, mapped);
  const l = mapped[0].legs[0];
  assert.equal(l.approximate, true);
  assert.equal(l.geometryReason.code, 'detour_rejected');
  assert.equal(l.geometryReason.station, 'A');
  assert.equal(l.geometryReason.nextStation, 'B');
  assert.equal(l.geometryReason.limitMeters, 72000);
  assert.deepEqual(l.coordinates, [
    [13, 58],
    [14, 59],
  ]);
});
test('missing graph cannot leave sparse SJ geometry marked as a usable track path', async () => {
  const raw = trip(leg());
  const mapped = resRobotMapTrips(raw);
  mapped[0].legs[0].approximate = false;
  mapped[0].legs[0].geometrySource = 'SJ GTFS · matchat';
  const resolve = createRailResolver({
    getGraphStat: async () => {
      throw Error('absent');
    },
    calculateRoute: () => {
      throw Error('must not run');
    },
  });
  await resolve(raw, mapped);
  assert.equal(mapped[0].legs[0].approximate, true);
  assert.equal(mapped[0].legs[0].geometryReason.code, 'graph_unavailable');
});
test('bad intermediate coordinates are not silently dropped to manufacture a simpler path', async () => {
  for (const lon of [null, '', true, 'NaN']) {
    let calls = 0;
    const raw = trip(
      leg({ Stops: { Stop: [{ name: 'Invalid station', lon, lat: 58.5 }] } }),
    );
    const mapped = resRobotMapTrips(raw);
    await createRailResolver({
      getGraphStat: stat,
      calculateRoute: async () => {
        calls++;
        return good([
          [13, 58],
          [14, 59],
        ]);
      },
    })(raw, mapped);
    assert.equal(calls, 0);
    assert.equal(mapped[0].legs[0].geometryReason.code, 'invalid_points');
  }
});
test('an invalid first leg is still reported and cannot shift geometry onto the wrong subsequent leg', async () => {
  const raw = trip([
    leg({
      Origin: { name: 'Unknown', lon: null, lat: null },
      Destination: { name: 'A', lon: 13, lat: 58 },
    }),
    leg(),
  ]);
  const mapped = resRobotMapTrips(raw);
  assert.equal(mapped[0].legs.length, 2);
  let calls = 0;
  await createRailResolver({
    getGraphStat: stat,
    calculateRoute: async (p) => {
      calls++;
      return good(p);
    },
  })(raw, mapped);
  assert.equal(calls, 1);
  assert.equal(mapped[0].legs[0].geometryReason.code, 'invalid_points');
  assert.equal(mapped[0].legs[1].approximate, false);
});
test('malformed or distant worker outputs never become drawable railway geometry', async () => {
  for (const patch of [
    {
      coordinates: [
        [13, 58],
        [181, 59],
      ],
    },
    { coordinates: [[13, 58]] },
    { distanceMeters: 0 },
    {
      snaps: [
        { distanceMeters: 501, position: [13, 58] },
        { distanceMeters: 0, position: [14, 59] },
      ],
    },
  ]) {
    const raw = trip(leg());
    const mapped = resRobotMapTrips(raw);
    await createRailResolver({
      getGraphStat: stat,
      calculateRoute: async (p) => ({ ...good(p), ...patch }),
    })(raw, mapped);
    assert.equal(mapped[0].legs[0].approximate, true);
    assert.equal(
      mapped[0].legs[0].geometryReason.code,
      'invalid_routing_result',
    );
  }
});
test('concurrent requests share computation but not mutable route coordinates or metadata', async () => {
  let calls = 0;
  const resolve = createRailResolver({
    getGraphStat: stat,
    calculateRoute: async (p) => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return good(p);
    },
  });
  const raw = trip(leg());
  const a = resRobotMapTrips(raw),
    b = resRobotMapTrips(raw);
  await Promise.all([resolve(raw, a), resolve(raw, b)]);
  assert.equal(calls, 1);
  a[0].legs[0].coordinates[0][0] = 999;
  a[0].legs[0].geometryDiagnostics.segments[0].distanceMeters = 999;
  assert.equal(b[0].legs[0].coordinates[0][0], 13);
  assert.equal(
    b[0].legs[0].geometryDiagnostics.segments[0].distanceMeters,
    10000,
  );
});
test('graph replacement invalidates cached paths and cache capacity evicts old routes', async () => {
  let version = 1,
    calls = 0;
  const resolve = createRailResolver({
    getGraphStat: async () => ({ mtimeMs: version, size: 1 }),
    maxEntries: 2,
    calculateRoute: async (p) => {
      calls++;
      return good(p);
    },
  });
  const run = async (lon) => {
    const raw = trip(leg({ Origin: { name: 'A', lon, lat: 58 } }));
    await resolve(raw, resRobotMapTrips(raw));
  };
  await run(13);
  await run(13);
  assert.equal(calls, 1);
  version++;
  await run(13);
  assert.equal(calls, 2);
  await run(12);
  await run(11);
  await run(13);
  assert.equal(calls, 5);
});
test('transient failures can retry without leaking raw Python diagnostics', async () => {
  let calls = 0;
  const resolve = createRailResolver({
    getGraphStat: stat,
    calculateRoute: async (p) => {
      if (++calls === 1) throw Error('private details');
      return good(p);
    },
  });
  const raw = trip(leg()),
    a = resRobotMapTrips(raw);
  await resolve(raw, a);
  assert.equal(a[0].legs[0].geometryReason.code, 'routing_failed');
  assert.doesNotMatch(JSON.stringify(a), /private details/);
  const b = resRobotMapTrips(raw);
  await resolve(raw, b);
  assert.equal(b[0].legs[0].approximate, false);
  assert.equal(calls, 2);
});
test('existing authoritative non-SJ geometry is retained without running the network fallback', async () => {
  const raw = trip(leg());
  const mapped = resRobotMapTrips(raw);
  mapped[0].legs[0].approximate = false;
  mapped[0].legs[0].geometrySource = 'SL operatörsgeometri';
  await createRailResolver({
    getGraphStat: stat,
    calculateRoute: () => {
      throw Error('must not run');
    },
  })(raw, mapped);
  assert.equal(mapped[0].legs[0].geometrySource, 'SL operatörsgeometri');
  assert.equal(mapped[0].legs[0].approximate, false);
});

test('null, blank and boolean endpoints never become invented zero-degree map positions', () => {
  for (const lon of [null, '', ' ', false, true]) {
    const raw = trip(leg({ Origin: { name: 'Invalid', lon, lat: 58 } }));
    const mapped = resRobotMapTrips(raw);
    assert.equal(mapped[0].legs.length, 1);
    assert.deepEqual(mapped[0].legs[0].coordinates, [[14, 59]]);
  }
});

test('previous calculated geometry is reconsidered after the graph changes even on the same mapped object', async () => {
  let version = 1,
    calls = 0;
  const resolve = createRailResolver({
    getGraphStat: async () => ({ mtimeMs: version, size: 1 }),
    calculateRoute: async (points) => {
      calls++;
      return version === 1
        ? good(points)
        : {
            status: 'missing',
            reason: 'disconnected_network',
            segmentIndex: 0,
          };
    },
  });
  const raw = trip(leg()),
    mapped = resRobotMapTrips(raw);
  await resolve(raw, mapped);
  assert.equal(mapped[0].legs[0].approximate, false);
  version = 2;
  await resolve(raw, mapped);
  assert.equal(calls, 2);
  assert.equal(mapped[0].legs[0].approximate, true);
  assert.equal(mapped[0].legs[0].geometryReason.code, 'disconnected_network');
});
