import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stockholmTime,
  stationMatch,
  announcementMatch,
  trainLegs,
  enrichTrainTrips,
  trainStatusText,
} from './train-status.js';

const now = Date.parse('2026-10-12T05:00:00Z');
const stations = [
  {
    LocationSignature: 'Sk',
    AdvertisedLocationName: 'Skövde C',
    Advertised: true,
    Deleted: false,
    Geometry: { WGS84: 'POINT (13.853 58.391)' },
  },
  {
    LocationSignature: 'G',
    AdvertisedLocationName: 'Göteborg C',
    Advertised: true,
    Deleted: false,
    Geometry: { WGS84: 'POINT (11.974 57.709)' },
  },
  {
    LocationSignature: 'Cst',
    AdvertisedLocationName: 'Stockholm C',
    Advertised: true,
    Deleted: false,
    Geometry: { WGS84: 'POINT (18.058 59.330)' },
  },
];
const meta = {
  status: 'fresh',
  stale: false,
  complete: true,
  fetchedAt: '2026-10-12T05:00:00Z',
};
const ep = {
  signature: 'Sk',
  activity: 'Avgang',
  planned: '2026-10-12T05:00:00Z',
};
const row = (extra = {}) => ({
  ActivityId: 'sk-departure',
  LocationSignature: 'Sk',
  ActivityType: 'Avgang',
  AdvertisedTrainIdent: '422',
  AdvertisedTimeAtLocation: '2026-10-12T07:00:00+02:00',
  Advertised: true,
  Deleted: false,
  Canceled: false,
  ModifiedTime: '2026-10-12T04:59:00Z',
  ScheduledDepartureDateTime: '2026-10-12T00:00:00+02:00',
  ...extra,
});
const trip = (
  from = 'Skövde Centralstation',
  fromPoint = { lon: 13.853, lat: 58.391 },
) => [
  {
    LegList: {
      Leg: [
        {
          type: 'JNY',
          Product: [{ name: 'Snabbtåg 422', num: '422' }],
          Origin: {
            name: from,
            ...fromPoint,
            date: '2026-10-12',
            time: '07:00:00',
          },
          Destination: {
            name: 'Stockholm Centralstation',
            lon: 18.058,
            lat: 59.33,
            date: '2026-10-12',
            time: '09:00:00',
          },
        },
      ],
    },
  },
];
function fakeClient(
  rows = [
    row(),
    row({
      ActivityId: 'cst-arrival',
      LocationSignature: 'Cst',
      ActivityType: 'Ankomst',
      AdvertisedTimeAtLocation: '2026-10-12T09:00:00+02:00',
      EstimatedTimeAtLocation: '2026-10-12T09:12:00+02:00',
    }),
  ],
  metadata = meta,
) {
  const calls = [];
  return {
    calls,
    async query(q) {
      calls.push(q);
      return q.type === 'TrainStation'
        ? { rows: stations, metadata: meta }
        : { rows, metadata };
    },
  };
}
test('Stockholm local dates handle midnight, winter and summer independently of host timezone', () => {
  assert.equal(
    stockholmTime('2026-10-12', '00:05:00'),
    '2026-10-11T22:05:00.000Z',
  );
  assert.equal(
    stockholmTime('2026-01-12', '07:00'),
    '2026-01-12T06:00:00.000Z',
  );
  assert.equal(
    stockholmTime('2026-07-12', '07:00'),
    '2026-07-12T05:00:00.000Z',
  );
});
test('invalid calendar dates, DST gaps and overlapping local times do not select an instant', () => {
  for (const [d, t] of [
    ['2026-02-30', '07:00'],
    ['2026-03-29', '02:30'],
    ['2026-10-25', '02:30'],
    ['2026-10-12', '25:00'],
  ])
    assert.equal(stockholmTime(d, t), null);
});
test('station central/resecentrum aliases require proximity when coordinates exist', () => {
  assert.equal(
    stationMatch(
      { name: 'Skövde resecentrum', coordinates: [13.853, 58.391] },
      stations,
    ).signature,
    'Sk',
  );
  assert.equal(
    stationMatch(
      { name: 'Göteborg central', coordinates: [11.974, 57.709] },
      stations,
    ).signature,
    'G',
  );
  assert.equal(
    stationMatch(
      { name: 'Stockholm Centralstation', coordinates: [13, 58] },
      stations,
    ).reason,
    'station_unmatched',
  );
});
test('ambiguous stations and malformed station geometry remain unknown', () => {
  assert.equal(
    stationMatch({ name: 'Skövde C' }, [
      ...stations,
      { ...stations[0], LocationSignature: 'Sk2' },
    ]).reason,
    'station_ambiguous',
  );
  assert.equal(
    stationMatch({ name: 'Skövde C', coordinates: [13.853, 58.391] }, [
      { ...stations[0], Geometry: { WGS84: 17 } },
    ]).reason,
    'station_unmatched',
  );
});
test('a delayed departure preserves planned, estimated and actual clocks separately', () => {
  const e = announcementMatch(
    ep,
    '422',
    [
      row({
        EstimatedTimeAtLocation: '2026-10-12T07:12:00+02:00',
        TrackAtLocation: '3',
        EstimatedTimeIsPreliminary: true,
        Deviation: [{ Description: 'Signalfel' }],
      }),
    ],
    meta,
    now,
  );
  assert.equal(e.status, 'late');
  assert.equal(e.delayMinutes, 12);
  assert.equal(e.actual, null);
  assert.equal(e.track, '3');
  assert.equal(e.preliminary, true);
  assert.deepEqual(e.deviations, ['Signalfel']);
  assert.equal(e.trafficDate, '2026-10-12');
});
test('canceled does not depend on a forecast and missing canceled is not false', () => {
  assert.equal(
    announcementMatch(ep, '422', [row({ Canceled: true })], meta, now).status,
    'canceled',
  );
  assert.equal(
    announcementMatch(ep, '422', [row({ Canceled: undefined })], meta, now)
      .canceled,
    null,
  );
});
test('a missing forecast never means on time, while explicit actual time can confirm it', () => {
  assert.equal(
    announcementMatch(ep, '422', [row()], meta, now).reason,
    'forecast_missing',
  );
  assert.equal(
    announcementMatch(
      ep,
      '422',
      [row({ TimeAtLocation: '2026-10-12T07:00:00+02:00' })],
      meta,
      now,
    ).status,
    'on_time',
  );
});
test('future actual time and numeric forecast fields are ignored', () => {
  assert.equal(
    announcementMatch(
      ep,
      '422',
      [
        row({
          TimeAtLocation: '2026-10-12T08:00:00+02:00',
          EstimatedTimeAtLocation: 0,
        }),
      ],
      meta,
      now,
    ).status,
    'unknown',
  );
});
test('station, activity, date and number must all match, deleted records cannot match', () => {
  for (const changed of [
    { LocationSignature: 'G' },
    { ActivityType: 'Ankomst' },
    { AdvertisedTrainIdent: '423' },
    { AdvertisedTimeAtLocation: '2026-10-13T07:00:00+02:00' },
    { Deleted: true },
    { Advertised: false },
  ])
    assert.equal(
      announcementMatch(ep, '422', [row(changed)], meta, now).reason,
      'train_unmatched',
    );
});
test('distinct activity identities remain ambiguous; same identity revision takes latest clock', () => {
  assert.equal(
    announcementMatch(
      ep,
      '422',
      [row(), row({ ActivityId: 'another' })],
      meta,
      now,
    ).reason,
    'train_ambiguous',
  );
  assert.equal(
    announcementMatch(
      ep,
      '422',
      [row(), row({ Canceled: true, ModifiedTime: '2026-10-12T05:00:00Z' })],
      meta,
      now,
    ).status,
    'canceled',
  );
});
test('stale, missing or future source timestamps cannot assert fresh status', () => {
  for (const changed of [
    { ModifiedTime: undefined },
    { ModifiedTime: '2026-10-11T00:00:00Z' },
    { ModifiedTime: '2026-10-13T00:00:00Z' },
  ])
    assert.equal(
      announcementMatch(
        ep,
        '422',
        [row({ ...changed, Canceled: true })],
        meta,
        now,
      ).status,
      'stale',
    );
  assert.equal(
    announcementMatch(
      ep,
      '422',
      [row({ Canceled: true })],
      { ...meta, stale: true },
      now,
    ).status,
    'stale',
  );
});
test('unavailable and capped data are unknown, not empty or punctual', () => {
  assert.equal(
    announcementMatch(ep, '422', null, { status: 'unavailable' }, now).reason,
    'source_unavailable',
  );
  assert.equal(
    announcementMatch(ep, '422', [row()], { ...meta, complete: false }, now)
      .reason,
    'source_incomplete',
  );
});
test('bus, tram, metro and walk legs do not receive train status or trigger queries', async () => {
  for (const name of ['Buss 422', 'Spårvagn 422', 'Tunnelbana 422']) {
    const trips = trip();
    trips[0].LegList.Leg[0].Product[0].name = name;
    const client = fakeClient();
    assert.deepEqual((await enrichTrainTrips(trips, { client, now })).trips, [
      [],
    ]);
    assert.equal(client.calls.length, 0);
  }
});
test('Skövde–Stockholm and Göteborg–Stockholm match separate departure/arrival records', async () => {
  for (const [from, coordinates, signature] of [
    ['Skövde Centralstation', { lon: 13.853, lat: 58.391 }, 'Sk'],
    ['Göteborg Centralstation', { lon: 11.974, lat: 57.709 }, 'G'],
  ]) {
    const client = fakeClient([
      row({
        LocationSignature: signature,
        EstimatedTimeAtLocation: '2026-10-12T07:05:00+02:00',
      }),
      row({
        ActivityId: 'arr',
        ActivityType: 'Ankomst',
        LocationSignature: 'Cst',
        AdvertisedTimeAtLocation: '2026-10-12T09:00:00+02:00',
        Canceled: true,
      }),
    ]);
    const d = await enrichTrainTrips(trip(from, coordinates), { client, now });
    assert.equal(d.trips[0][0].departure.status, 'late');
    assert.equal(d.trips[0][0].arrival.status, 'canceled');
    assert.equal(d.sources[0].name, 'Trafikverket · tågannonsering');
    assert.equal(
      client.calls[1].filter.filters.find((f) => f.field === 'ActivityType')
        .value,
      'Avgang',
    );
    assert.equal(
      client.calls[2].filter.filters.find((f) => f.field === 'ActivityType')
        .value,
      'Ankomst',
    );
  }
});
test('tomorrow outside live window makes no requests and cannot acquire current status', async () => {
  const client = fakeClient();
  const data = await enrichTrainTrips(trip(), { client, now: now - 86400000 });
  assert.equal(data.trips[0][0].departure.reason, 'outside_live_window');
  assert.equal(client.calls.length, 0);
});
test('missing train number does not infer it from line, name or service id', async () => {
  const trips = trip();
  delete trips[0].LegList.Leg[0].Product[0].num;
  const client = fakeClient();
  const d = await enrichTrainTrips(trips, { client, now });
  assert.equal(d.trips[0][0].departure.reason, 'train_number_missing');
  assert.equal(client.calls.length, 0);
});
test('query deduplication shares endpoints across alternative suggestions', async () => {
  const client = fakeClient();
  await enrichTrainTrips([...trip(), ...trip(), ...trip()], { client, now });
  assert.equal(client.calls.length, 3);
});
test('source error is isolated from the trip and clearly formatted', async () => {
  const d = await enrichTrainTrips(trip(), {
    client: {
      query: async () => {
        throw Error('secret upstream detail');
      },
    },
    now,
  });
  const t = trainStatusText(d.trips[0][0]);
  assert.match(t, /Okänd status/);
  assert.match(t, /Uppgift saknas/);
  assert.doesNotMatch(t, /secret upstream/);
});
test('overnight arrival can match next calendar date with same operational traffic date', async () => {
  const trips = trip();
  trips[0].LegList.Leg[0].Origin.time = '23:55:00';
  trips[0].LegList.Leg[0].Destination.date = '2026-10-13';
  trips[0].LegList.Leg[0].Destination.time = '00:20:00';
  const client = fakeClient([
    row({
      AdvertisedTimeAtLocation: '2026-10-12T23:55:00+02:00',
      ModifiedTime: '2026-10-12T21:55:00Z',
      Canceled: true,
    }),
    row({
      ActivityId: 'arr',
      ActivityType: 'Ankomst',
      LocationSignature: 'Cst',
      AdvertisedTimeAtLocation: '2026-10-13T00:20:00+02:00',
      ModifiedTime: '2026-10-12T21:55:00Z',
      Canceled: true,
    }),
  ]);
  const d = await enrichTrainTrips(trips, {
    client,
    now: Date.parse('2026-10-12T21:55:00Z'),
  });
  assert.equal(d.trips[0][0].arrival.status, 'canceled');
  assert.equal(d.trips[0][0].arrival.trafficDate, '2026-10-12');
});
test('operational date mismatch across endpoints invalidates both statuses', async () => {
  const client = fakeClient([
    row(),
    row({
      ActivityId: 'arr',
      ActivityType: 'Ankomst',
      LocationSignature: 'Cst',
      AdvertisedTimeAtLocation: '2026-10-12T09:00:00+02:00',
      ScheduledDepartureDateTime: '2026-10-11T00:00:00+02:00',
    }),
  ]);
  const d = await enrichTrainTrips(trip(), { client, now });
  assert.equal(d.trips[0][0].arrival.reason, 'traffic_date_conflict');
  assert.equal(d.trips[0][0].departure.reason, 'traffic_date_conflict');
});
test('Västtrafik uses explicit train number and zoned planned clocks, never service gid', () => {
  const t = [
    {
      tripLegs: [
        {
          origin: { stopPoint: { name: 'Skövde C' } },
          destination: { stopPoint: { name: 'Stockholm C' } },
          plannedDepartureTime: '2026-10-12T07:00:00+02:00',
          plannedArrivalTime: '2026-10-12T09:00:00+02:00',
          serviceJourney: {
            gid: '123456',
            trainNumber: '422',
            line: { transportMode: 'train' },
          },
        },
      ],
    },
  ];
  assert.equal(trainLegs(t, 'vasttrafik')[0][0].trainNumber, '422');
  delete t[0].tripLegs[0].serviceJourney.trainNumber;
  assert.equal(trainLegs(t, 'vasttrafik')[0][0].trainNumber, null);
});

test('verified SJ regional designation is allowed, internal number and commuter line are not', () => {
  const t = [
    {
      tripLegs: [
        {
          origin: { stopPoint: { name: 'Skövde resecentrum (tåg), Skövde' } },
          destination: { stopPoint: { name: 'Göteborg C' } },
          plannedDepartureTime: '2026-10-12T07:52:00+02:00',
          plannedArrivalTime: '2026-10-12T09:00:00+02:00',
          serviceJourney: {
            gid: '9015074160300001',
            number: '1',
            line: {
              designation: '157',
              operator: 'SJ',
              transportMode: 'train',
              transportSubMode: 'regionaltrain',
            },
          },
        },
      ],
    },
  ];
  assert.equal(trainLegs(t, 'vasttrafik')[0][0].trainNumber, '157');
  t[0].tripLegs[0].serviceJourney.line.transportSubMode = 'commutertrain';
  assert.equal(trainLegs(t, 'vasttrafik')[0][0].trainNumber, null);
  assert.equal(
    stationMatch(
      {
        name: 'Skövde resecentrum (tåg), Skövde',
        coordinates: [13.853, 58.391],
      },
      stations,
    ).signature,
    'Sk',
  );
});
test('a hanging API request respects the whole enrichment deadline without breaking a trip', async () => {
  const started = Date.now();
  const d = await enrichTrainTrips(trip(), {
    client: { query: () => new Promise(() => {}) },
    now,
    timeoutMs: 20,
  });
  assert.equal(d.trips[0][0].departure.status, 'unknown');
  assert.ok(Date.now() - started < 2000);
});
test('a stale cancellation is labeled as older information rather than current cancellation', () => {
  const leg = trainLegs(trip(), 'resrobot')[0][0];
  leg.departure = announcementMatch(
    ep,
    '422',
    [row({ Canceled: true })],
    { ...meta, stale: true },
    now,
  );
  leg.arrival = { status: 'unknown', reason: 'forecast_missing' };
  assert.match(
    trainStatusText(leg),
    /Rapporterad inställning i den äldre uppgiften/,
  );
});

test('query volume is bounded even with many different train legs', async () => {
  const trips = trip();
  const base = trips[0].LegList.Leg[0];
  trips[0].LegList.Leg = Array.from({ length: 24 }, (_, i) => ({
    ...base,
    Product: [{ name: 'Snabbtåg ' + (400 + i), num: String(400 + i) }],
  }));
  const client = fakeClient();
  await enrichTrainTrips(trips, { client, now });
  assert.equal(client.calls.length, 19);
});
test('stale station catalog prevents fresh status and capped catalog prevents matching', async () => {
  for (const metadata of [
    { ...meta, stale: true },
    { ...meta, complete: false },
  ]) {
    const c = fakeClient([row({ Canceled: true })]);
    const query = c.query;
    c.query = async (q) => {
      const d = await query(q);
      if (q.type === 'TrainStation') d.metadata = metadata;
      return d;
    };
    const d = await enrichTrainTrips(trip(), { client: c, now });
    assert.equal(
      d.trips[0][0].departure.status,
      metadata.stale ? 'stale' : 'unknown',
    );
  }
});
test('SL commuter train is eligible while metro with the same number is excluded', () => {
  const t = trip();
  t[0].LegList.Leg[0].Product[0].name = 'Pendeltåg 422';
  assert.equal(trainLegs(t, 'resrobot')[0].length, 1);
  t[0].LegList.Leg[0].Product[0].name = 'Tunnelbana 422';
  assert.equal(trainLegs(t, 'resrobot')[0].length, 0);
});

test('source footer uses real cache fetch time and never invents a fetch for future trips', async () => {
  const future = await enrichTrainTrips(trip(), {
    client: fakeClient(),
    now: now - 86400000,
  });
  assert.deepEqual(future.sources, []);
  const old = { ...meta, fetchedAt: '2026-10-12T04:59:30Z' };
  const d = await enrichTrainTrips(trip(), {
    client: fakeClient([row()], old),
    now,
  });
  assert.equal(d.sources[0].time, '2026-10-12T04:59:30.000Z');
  const unavailable = await enrichTrainTrips(trip(), {
    client: {
      query: async () => ({ rows: null, metadata: { status: 'unavailable' } }),
    },
    now,
  });
  assert.deepEqual(unavailable.sources, []);
});
