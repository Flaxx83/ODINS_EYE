import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFlightDate, createSwedaviaFlights } from './swedavia-flights.js';
import { createLocalAiService } from './local-ai-tools.js';
const now = () => new Date('2026-10-24T22:30:00Z'); // 25 October in Sweden.
const fixture = (overrides = {}) => ({
  arrival: {
    flightId: 'SK2844',
    arrivalTime: {
      scheduledUtc: '2026-10-25T10:00:00Z',
      estimatedUtc: '2026-10-25T10:10:00Z',
    },
    flightLegIdentifier: {
      callsign: 'SAS2844',
      departureAirportIata: 'GZP',
      arrivalAirportIata: 'ARN',
    },
    locationAndStatus: { flightLegStatus: 'SCH' },
    ...overrides,
  },
});
const service = (get, extra = {}) =>
  createSwedaviaFlights({
    now,
    key: () => 'fixture',
    fetchImpl: get,
    ...extra,
  });
test('flight calendar uses Swedish day across midnight, DST and year boundary', () => {
  assert.equal(parseFlightDate('idag', now()).date, '2026-10-25');
  assert.equal(parseFlightDate('imorgon', now()).date, '2026-10-26');
  assert.equal(
    parseFlightDate('i morgon', new Date('2026-03-28T23:30:00Z')).date,
    '2026-03-30',
  );
  assert.equal(
    parseFlightDate('imorgon', new Date('2026-12-31T12:00:00Z')).date,
    '2027-01-01',
  );
  assert.equal(parseFlightDate('26 oktober', now()).date, '2026-10-26');
  assert.equal(parseFlightDate('26/10/2026', now()).date, '2026-10-26');
  assert.equal(parseFlightDate('2026-10-26', now()).date, '2026-10-26');
  for (const message of [
    '2026-02-30',
    '2026-2-3',
    'idag imorgon',
    'nästa vecka',
    '2028-01-01',
  ])
    assert.ok(parseFlightDate(message, now()).error, message);
});
test('requested dates isolate cached data and future results cannot track current aircraft', async () => {
  const filters = [];
  const lookup = service(async (url) => {
    filters.push(url.searchParams.get('filter'));
    return {
      ok: true,
      json: async () => ({
        flights: [
          fixture(),
          fixture({ arrivalTime: { scheduledUtc: '2026-10-26T10:00:00Z' } }),
        ],
      }),
    };
  });
  const today = await lookup('SAS2844', { date: '2026-10-25' });
  const tomorrow = await lookup('SAS2844', { date: '2026-10-26' });
  assert.equal(today.flightResults.length, 1);
  assert.equal(today.flightResults[0].mapEligible, true);
  assert.equal(tomorrow.flightResults.length, 1);
  assert.equal(tomorrow.flightResults[0].mapEligible, false);
  assert.match(filters[1], /261026/);
  await lookup('SAS2844', { date: '2026-10-26' });
  assert.equal(filters.length, 2);
});
test('cancelled flights are explicit and never offer map tracking or a current estimate', async () => {
  const lookup = service(async () => ({
    ok: true,
    json: async () => ({
      flights: [
        fixture({
          locationAndStatus: {
            flightLegStatus: 'CAN',
            flightLegStatusSwedish: 'Planerad',
          },
        }),
      ],
    }),
  }));
  const r = await lookup('SAS2844');
  assert.equal(r.flightResults[0].cancelled, true);
  assert.equal(r.flightResults[0].mapEligible, false);
  assert.match(r.answer, /Inställt/);
  assert.match(r.answer, /Ej aktuell/);
  assert.doesNotMatch(r.answer, /Beräknad: 2026/);
});
test('multiple legs require a choice and duplicate source rows do not duplicate choices', async () => {
  const lookup = service(async () => ({
    ok: true,
    json: async () => ({
      flights: [
        fixture(),
        fixture(),
        fixture({ arrivalTime: { scheduledUtc: '2026-10-25T18:00:00Z' } }),
      ],
    }),
  }));
  const r = await lookup('SAS2844');
  assert.equal(r.flightResults.length, 2);
  assert.match(r.answer, /Välj en avgång eller ankomst/);
  assert.notEqual(r.flightResults[0].label, r.flightResults[1].label);
});
test('full pages follow bounded encoded continuation tokens; missing/repeated token is an error', async () => {
  let calls = 0;
  const lookup = service(async (url) => {
    calls++;
    if (calls === 2)
      assert.equal(url.searchParams.get('continuationtoken'), 'a+/=');
    return {
      ok: true,
      json: async () =>
        calls === 1
          ? {
              flights: Array.from({ length: 1000 }, () => ({})),
              continuationtoken: 'a+/=',
            }
          : { flights: [fixture()] },
    };
  });
  assert.equal((await lookup('SAS2844')).flightResults.length, 1);
  assert.equal(calls, 2);
  for (const token of [undefined, 'repeat']) {
    const broken = service(async () => ({
      ok: true,
      json: async () => ({
        flights: Array.from({ length: 1000 }, () => ({})),
        continuationtoken: token,
      }),
    }));
    assert.match((await broken('SAS2844')).answer, /kunde inte hämtas/);
  }
});
test('future question without configured source never falls back to current map position', async () => {
  const ai = createLocalAiService({
    now: () => now().getTime(),
    lookupFlight: async () => null,
  });
  const r = await ai.ask({
    message: 'Visa flight SK2844 imorgon',
    network: 'Västtrafik',
  });
  assert.equal(r.flightQuery, undefined);
  assert.match(r.answer, /inte tillgängliga/);
});
test('commercial flight numbers accept leading zeros without guessing an ICAO prefix', async () => {
  const lookup = service(async (url) => {
    assert.match(url.searchParams.get('filter'), /flightId eq 'SK007'/);
    assert.doesNotMatch(url.searchParams.get('filter'), /SAS7/);
    return {
      ok: true,
      json: async () => ({
        flights: [
          fixture({
            flightId: 'SK007',
            flightLegIdentifier: {
              callsign: 'SASX7',
              departureAirportIata: 'GOT',
              arrivalAirportIata: 'ARN',
            },
          }),
        ],
      }),
    };
  });
  const result = await lookup('SK7');
  assert.equal(result.flightResults[0].callsign, 'SASX7');
});
test('AI forwards tomorrow as a date and rejects conflicting dates before source access', async () => {
  let calls = 0;
  const ai = createLocalAiService({
    now: () => now().getTime(),
    lookupFlight: async (query, options) => {
      calls++;
      assert.equal(options.date, '2026-10-26');
      return { answer: 'Planerad tid', flightResults: [] };
    },
  });
  await ai.ask({ message: 'När landar flight SK2844 imorgon?', network: 'SL' });
  const invalid = await ai.ask({
    message: 'Visa flight SK2844 idag och imorgon',
    network: 'SL',
  });
  assert.equal(invalid.needsClarification, true);
  assert.equal(calls, 1);
});
