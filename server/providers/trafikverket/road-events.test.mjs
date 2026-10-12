import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoadDatex, selectRoadEvents } from './road-model.js';
import { roadEvents } from './road-events.js';
import { createTrafikverketClient } from './client.js';
const now = Date.parse('2026-10-12T12:00:00Z');
const record = (x = {}) => ({
  id: 'one',
  version: 1,
  ModifiedTime: '2026-10-12T10:00:00Z',
  start: '2026-10-12T08:00:00+02:00',
  end: '2026-10-13T08:00:00+02:00',
  validity: 'definedByValidityTimeSpec',
  lat: 58,
  lon: 13,
  feed: 'roadworks',
  description: 'Arbete',
  ...x,
});
const bbox = [12, 57, 14, 59];
const xml =
  '<con:messageContainer xmlns:con="urn:container" xmlns:sit="urn:situation" xmlns:com="urn:common" xmlns:loc="urn:location" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><sit:situationRecord id="one" version="1" xsi:type="sit:MaintenanceWorks"><sit:situationRecordVersionTime>2026-10-12T10:00:00Z</sit:situationRecordVersionTime><com:overallStartTime>2026-10-12T08:00:00+02:00</com:overallStartTime><com:overallEndTime>2026-10-13T08:00:00+02:00</com:overallEndTime><com:validityStatus>definedByValidityTimeSpec</com:validityStatus><sit:generalPublicComment><com:value lang="sv">Arbete &amp; avstängning</com:value></sit:generalPublicComment><loc:coordinatesForDisplay><loc:latitude>58</loc:latitude><loc:longitude>13</loc:longitude></loc:coordinatesForDisplay></sit:situationRecord></con:messageContainer>';
test('DATEX namespaces and reported display geometry are normalized without inferring road lines', () => {
  const rows = parseRoadDatex(xml, 'roadworks');
  assert.equal(rows[0].description, 'Arbete & avstängning');
  assert.equal(
    selectRoadEvents(rows, bbox, now).events[0].geometry,
    'reported-display-point',
  );
});
test('ended, suspended, future, invalid-coordinate and unknown-zone events are excluded', () => {
  const rows = [
    record(),
    record({ id: 'end', end: '2026-10-12T10:00:00Z' }),
    record({ id: 'pause', validity: 'suspended' }),
    record({ id: 'future', start: '2026-10-13T00:00:00Z' }),
    record({ id: 'invalid', lat: 999 }),
    record({ id: 'zone', start: '2026-10-12T08:00:00' }),
  ];
  const d = selectRoadEvents(rows, bbox, now);
  assert.equal(d.events.length, 1);
  assert.equal(d.missingGeometry, 1);
  assert.equal(d.unknownTime, 1);
});
test('newest version replaces old update, but overlapping separate events remain separate', () => {
  const d = selectRoadEvents(
    [
      record(),
      record({
        version: 2,
        ModifiedTime: '2026-10-12T11:00:00Z',
        description: 'Nytt',
      }),
      record({ id: 'two' }),
    ],
    bbox,
    now,
  );
  assert.equal(d.events.length, 2);
  assert.equal(d.events[0].description, 'Nytt');
});
test('unsupported XML and DTD are rejected', () => {
  assert.throws(() => parseRoadDatex('<RESPONSE/>', 'roadworks'));
  assert.throws(() => parseRoadDatex('<!DOCTYPE x><x/>', 'roadworks'));
});
test('feed outages and stale cache remain visible instead of claiming no events', async () => {
  const result = await roadEvents(bbox, {
    now: () => now,
    getClient: () => ({
      query: async (q) => ({
        rows: q.type === 'Datex-roadworks' ? [record()] : null,
        metadata: {
          type: q.type,
          stale: true,
          fetchedAt: '2026-10-12T11:55:00Z',
        },
      }),
    }),
  });
  assert.equal(result.partial, true);
  assert.equal(result.stale, true);
  assert.equal(result.events.length, 1);
});
test('DATEX shares cache and request budget and keeps credential out of diagnostics', async () => {
  let calls = 0;
  const client = createTrafikverketClient({
    getApiKey: () => 'private-fixture-key',
    now: () => now,
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(options.method, 'GET');
      assert.ok(url.includes('authenticationkey='));
      return new Response(xml);
    },
  });
  const a = await client.query({ type: 'Datex-roadworks' });
  await client.query({ type: 'Datex-roadworks' });
  assert.equal(calls, 1);
  assert.equal(a.rows.length, 1);
  assert.ok(
    !JSON.stringify(client.getStatus()).includes('private-fixture-key'),
  );
});
test('recurring validity is explicit and never interpreted as verified current activity', () => {
  const detailed = xml.replace(
    '<com:validityStatus>',
    '<com:validPeriod><com:recurringTimePeriodOfDay/></com:validPeriod><com:validityStatus>',
  );
  const rows = parseRoadDatex(detailed, 'roadworks');
  assert.equal(rows[0].detailedValidity, true);
});
test('source-marked test situations are never presented as real road events', () => {
  assert.equal(
    selectRoadEvents([record({ informationStatus: 'test' })], bbox, now).events
      .length,
    0,
  );
});
