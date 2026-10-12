import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWeatherStations,
  weatherPoint,
  nearestWeather,
  normalizeRoadConditions,
} from './road-weather.js';
const now = Date.parse('2026-10-12T12:00:00Z');
const row = (o = {}) => ({
  Id: 1,
  Name: 'Fixture',
  Geometry: { WGS84: 'POINT (13 58)' },
  Observation: {
    Sample: '2026-10-12T11:50:00Z',
    Surface: { Temperature: { Value: 0 } },
    Air: { Temperature: { Value: -1 } },
    Wind: [{ Speed: { Value: 2 }, Direction: { Value: 90 }, Height: 6 }],
    ...o,
  },
});
test('station geometry is separate from measurements; zero Celsius and m/s remain numeric', () => {
  const s = normalizeWeatherStations([row()], now)[0];
  assert.equal(s.roadTemperatureC, 0);
  assert.equal(s.airTemperatureC, -1);
  assert.equal(s.wind[0].speedMps, 2);
  assert.equal(s.wind[0].heightM, 6);
  assert.equal(s.stale, false);
});
test('missing, unknown-zone, stale and future observations are identified', () => {
  const r = normalizeWeatherStations(
    [
      row({ Sample: '2026-10-12T10:00:00Z' }),
      row({ Sample: '2026-10-12T11:59:00' }),
      row({ Sample: '2026-10-13T00:00:00Z' }),
      { Id: 2, Geometry: { WGS84: 'POINT (13 58)' } },
    ],
    now,
  );
  assert.ok(r.every((s) => s.stale));
  assert.equal(r[3].roadTemperatureC, null);
});
test('invalid station coordinates and deleted stations are not shown', () => {
  assert.equal(weatherPoint('POINT (181 58)'), null);
  assert.equal(
    normalizeWeatherStations([{ ...row(), Deleted: true }], now).length,
    0,
  );
});
test('camera association reports distance and is bounded to 30 km', () => {
  const s = normalizeWeatherStations([row()], now);
  assert.ok(nearestWeather(s, { lat: 58, lon: 13.01 }).distanceKm < 1);
  assert.equal(nearestWeather(s, { lat: 59, lon: 13 }), null);
});
test('reported condition geometry and age stay separate from temperature-based risk', () => {
  const reports = normalizeRoadConditions(
    [
      {
        Id: 1,
        Geometry: { WGS84: 'LINESTRING (13 58,13.01 58.01)' },
        ConditionText: 'Normalt',
        ConditionInfo: ['Våt'],
        ModifiedTime: '2026-10-12T10:00:00Z',
        StartTime: '2026-10-12T08:00:00Z',
      },
    ],
    [12, 57, 14, 59],
    now,
    { lat: 58, lon: 13 },
  );
  assert.equal(reports[0].text, 'Normalt');
  assert.equal(reports[0].geometry, 'reported-road-line');
  assert.equal(reports[0].stale, false);
});
