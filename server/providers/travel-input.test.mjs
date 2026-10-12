import { placeMatches } from './travel-input.js';
import { needsTravelRoute } from './travel-input.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTravelTime, normalizeTravelMessage } from './travel-input.js';

const now = new Date('2026-10-11T03:00:00Z');
test('pasted line breaks and invisible spacing preserve journey names', () => {
  const text =
    'Sverige: Jag vill resa från Göteborg central till Vällingby T-\r\nbana imorgon vid 07 tiden.';
  const expected =
    'Sverige: Jag vill resa från Göteborg central till Vällingby T-bana';
  assert.equal(parseTravelTime(text, now).clean, expected);
  assert.equal(parseTravelTime(text, now).time, '07:00');
  assert.equal(
    normalizeTravelMessage(
      'från Göteborg\ncentral\u00a0till Vällingby\u200b T-bana',
    ),
    'från Göteborg central till Vällingby T-bana',
  );
});
test('user journey request preserves both stop names and departure at 07', () => {
  assert.deepEqual(
    parseTravelTime(
      'Jag vill resa från Göteborg central till Vällingby T-bana imorgon vid 07 tiden.',
      now,
    ),
    {
      date: '2026-10-12',
      hasDate: true,
      time: '07:00',
      clean: 'Jag vill resa från Göteborg central till Vällingby T-bana',
      mode: 'departure',
      instant: '2026-10-12T05:00:00.000Z',
    },
  );
});
test('hour-only and minute-based Swedish time expressions', () => {
  for (const suffix of [
    'vid 07 tiden',
    'vid 7-tiden',
    'kl 7',
    'kl. 07',
    'klockan 7',
    'vid 07:00',
    'vid 7.00',
  ]) {
    const result = parseTravelTime(
      'Jag vill resa från Göteborg central till Vällingby T-bana ' +
        suffix +
        '.',
      now,
    );
    assert.equal(result.time, '07:00', suffix);
    assert.equal(
      result.clean,
      'Jag vill resa från Göteborg central till Vällingby T-bana',
      suffix,
    );
  }
  assert.equal(parseTravelTime('resa imorgon kl 07:35', now).time, '07:35');
  assert.throws(() => parseTravelTime('resa imorgon', now), /klockslag/);
});
test('invalid or incomplete explicit times never silently become departure now', () => {
  for (const suffix of ['vid 25 tiden', 'kl 07:60', 'vid 07:5', 'vid 7-9'])
    assert.throws(
      () => parseTravelTime('resa imorgon ' + suffix, now),
      /tid|Tiden/,
    );
});
test('tomorrow follows the Stockholm calendar over spring daylight-saving change', () => {
  assert.equal(
    parseTravelTime('resa imorgon vid 7', new Date('2026-03-28T22:30:00Z'))
      .date,
    '2026-03-29',
  );
});
import {
  applyJourneyTime,
  choiceMessage,
  addressCandidates,
} from './travel-input.js';
import { planTrip } from './local-trip.js';
import { planSlTrip } from './local-sl-trip.js';
import { askLocalAi } from './local-ai.js';

test('arrival intent and exact calendar date are retained without corrupting endpoints', () => {
  const r = parseTravelTime(
    'Jag vill resa från A till B den 13 oktober 2026 och vara framme senast kl 08:15',
    now,
  );
  assert.equal(r.mode, 'arrival');
  assert.equal(r.date, '2026-10-13');
  assert.equal(r.time, '08:15');
  assert.equal(r.instant, '2026-10-13T06:15:00.000Z');
  assert.equal(r.clean, 'Jag vill resa från A till B');
});
test('dates and clocks before the route are removed without deleting the destination', () => {
  const r = parseTravelTime(
    'Jag vill resa imorgon kl 07:00 från Lillegårdsvägen 11 A i Skövde till Vällingby',
    now,
  );
  assert.equal(
    r.clean,
    'Jag vill resa från Lillegårdsvägen 11 A i Skövde till Vällingby',
  );
});
test('ISO, numeric Swedish and named Swedish dates agree', () => {
  for (const date of ['2026-10-13', '13/10/2026', '13/10', 'den 13 oktober'])
    assert.equal(
      parseTravelTime('resa ' + date + ' kl 07:00', now).date,
      '2026-10-13',
    );
  assert.equal(
    parseTravelTime('resa i övermorgon kl 07', now).date,
    '2026-10-13',
  );
});
test('weekday and next calendar week are explicit, not elapsed-day arithmetic', () => {
  assert.equal(parseTravelTime('resa på tisdag kl 07', now).date, '2026-10-13');
  assert.equal(
    parseTravelTime('resa nästa söndag kl 07', now).date,
    '2026-10-18',
  );
});
test('invalid dates, conflicting dates and past times require clarification', () => {
  for (const suffix of [
    '2026-02-30 kl 07',
    '31/11/2026 kl 07',
    '2026-10-10 kl 07',
    'idag kl 04',
    'imorgon den 14 oktober kl 07',
    'nästa vecka kl 07',
    '2026-1-13 kl 07',
  ])
    assert.throws(() => parseTravelTime('resa ' + suffix, now));
});
test('arrival without clock and multiple or contradictory clocks never become departure now', () => {
  for (const suffix of [
    'vara framme imorgon',
    'ankomst imorgon kl 07 avgång kl 06',
    'kl 07 och kl 08',
    'imorgon',
    'vid 7.5',
    'kl 07:000',
    'vid 7-9',
  ])
    assert.throws(() => parseTravelTime('resa ' + suffix, now));
});
test('spring gap and autumn overlap are rejected rather than picking an arbitrary instant', () => {
  for (const date of ['2026-03-29', '2026-10-25'])
    assert.throws(
      () =>
        parseTravelTime(
          'resa ' + date + ' kl 02:30',
          new Date('2026-01-01T12:00:00Z'),
        ),
      /sommar|vinter/,
    );
  assert.equal(
    parseTravelTime('resa 2026-10-25 kl 03:30', now).instant,
    '2026-10-25T02:30:00.000Z',
  );
});
test('Swedish half and quarter expressions require a day part', () => {
  assert.equal(
    parseTravelTime('resa imorgon halv åtta på morgonen', now).time,
    '07:30',
  );
  assert.equal(
    parseTravelTime('resa imorgon kvart i åtta på kvällen', now).time,
    '19:45',
  );
  assert.equal(
    parseTravelTime('resa imorgon kvart över sju på kvällen', now).time,
    '19:15',
  );
  assert.throws(
    () => parseTravelTime('resa imorgon halv åtta', now),
    /morgon|kväll/,
  );
});
test('selection freezes an explicit relative date across midnight', () => {
  const message = 'SL: Jag vill resa från A till B imorgon vara framme kl 08';
  const r = parseTravelTime(message, now);
  const later = parseTravelTime(
    choiceMessage(message, r),
    new Date('2026-10-12T00:00:00Z'),
  );
  assert.equal(later.date, '2026-10-12');
  assert.equal(later.mode, 'arrival');
  assert.equal(later.time, '08:00');
});
test('both upstream adapters receive arrival semantics, never a departure search', () => {
  const r = parseTravelTime('resa imorgon ankomst kl 08', now);
  const rr = applyJourneyTime(new URLSearchParams(), r, 'resrobot'),
    vt = applyJourneyTime(new URLSearchParams(), r, 'vasttrafik');
  assert.equal(rr.get('searchForArrival'), '1');
  assert.equal(rr.get('date'), '2026-10-12');
  assert.equal(rr.get('time'), '08:00');
  assert.equal(vt.get('dateTimeRelatesTo'), 'arrival');
  assert.equal(vt.get('dateTime'), '2026-10-12T06:00:00.000Z');
});
test('Västtrafik planner sends the requested arrival datetime and asks on ambiguous stops', async () => {
  const stops = {
    A: { gid: '9021000000000001', locationType: 'stoparea', name: 'A' },
    B: { gid: '9021000000000002', locationType: 'stoparea', name: 'B' },
  };
  let q;
  const result = await planTrip(
    'Jag vill resa från A till B imorgon vara framme kl 08',
    null,
    {
      now: () => now,
      getImpl: async (path) => {
        if (path.startsWith('journeys?')) {
          q = new URLSearchParams(path.split('?')[1]);
          return { results: [] };
        }
        const name = new URLSearchParams(path.split('?')[1]).get('q');
        return { results: [stops[name]] };
      },
    },
  );
  assert.equal(q.get('dateTimeRelatesTo'), 'arrival');
  assert.equal(q.get('dateTime'), '2026-10-12T06:00:00.000Z');
  assert.match(result.answer, /ankomst senast/);
  let journeyCalled = false;
  const ambiguous = await planTrip(
    'Jag vill resa från A till B imorgon kl 08',
    null,
    {
      now: () => now,
      getImpl: async (path) => {
        if (path.startsWith('journeys')) journeyCalled = true;
        return {
          results: [
            { ...stops.A, name: 'A station' },
            { ...stops.A, gid: 'A2', name: 'A centrum' },
            { ...stops.B, name: 'B station' },
            { ...stops.B, gid: 'B2', name: 'B centrum' },
          ],
        };
      },
    },
  );
  assert.equal(journeyCalled, false);
  assert.ok(ambiguous.tripChoices);
  assert.match(ambiguous.tripChoices.message, /2026-10-12/);
});
test('ResRobot planner sends latest arrival and ignores stale selected IDs', async () => {
  const saved = process.env.RESROBOT_API_KEY;
  process.env.RESROBOT_API_KEY = 'fixture-only';
  try {
    let q;
    const deps = {
      now: () => now,
      getStops: async () => [
        { id: '1', name: 'A', lat: 59.3, lon: 18 },
        { id: '2', name: 'B', lat: 59.4, lon: 18 },
      ],
      fetchImpl: async (url) => {
        q = new URL(url).searchParams;
        return Response.json({ Trip: [] });
      },
    };
    const r = await planSlTrip(
      'SL: Jag vill resa från A till B imorgon vara framme kl 08',
      null,
      '',
      false,
      deps,
    );
    assert.equal(q.get('searchForArrival'), '1');
    assert.equal(q.get('date'), '2026-10-12');
    assert.equal(q.get('time'), '08:00');
    assert.match(r.answer, /ankomst senast/);
    q = null;
    const invalid = await planSlTrip(
      'SL: Jag vill resa från A till B imorgon kl 08',
      { origin: 'stale', destination: '2' },
      '',
      false,
      deps,
    );
    assert.equal(q, null);
    assert.ok(invalid.tripChoices);
  } finally {
    if (saved === undefined) delete process.env.RESROBOT_API_KEY;
    else process.env.RESROBOT_API_KEY = saved;
  }
});
test('address 11A and 11 A match equally, while 110 and 11B cannot be silently substituted', async () => {
  const options = {
    getToken: async () => 'dummy',
    fetchImpl: async () =>
      Response.json({
        results: ['11 A', '110', '11 B'].map((n) => ({
          name: 'Lillegårdsvägen ' + n + ', Skövde',
          locationType: 'address',
          latitude: 58.4,
          longitude: 13.8,
        })),
      }),
  };
  for (const q of [
    'Lillegårdsvägen 11A i Skövde',
    'Lillegårdsvägen 11 A i Skövde',
  ]) {
    const rows = await addressCandidates(q, options);
    assert.equal(rows.length, 1);
    assert.match(rows[0].name, /11 A/);
  }
});
test('a follow-up with no route requires a complete request instead of inventing context', async () => {
  const r = await askLocalAi('Och imorgon kl 07?', {}, '');
  assert.equal(r.needsClarification, true);
  assert.match(r.answer, /hela resan/);
});

test('two-sentence hour request preserves the destination and day-part clocks are explicit', () => {
  const r = parseTravelTime(
    'Jag vill resa från A till B imorgon. Jag vill åka vid 07:00.',
    now,
  );
  assert.equal(r.clean, 'Jag vill resa från A till B');
  assert.equal(r.time, '07:00');
  assert.equal(
    parseTravelTime('resa imorgon kl 7 på kvällen', now).time,
    '19:00',
  );
  assert.throws(
    () => parseTravelTime('resa imorgon kl 7 på kvällen på morgonen', now),
    /entydigt/,
  );
});
test('DST-invalid planner request makes no upstream calls', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      planTrip(
        'Jag vill resa från A till B den 25 oktober 2026 kl 02:30',
        null,
        {
          now: () => now,
          getImpl: async () => {
            calls++;
            throw Error('unexpected');
          },
        },
      ),
    /sommar|vinter/,
  );
  assert.equal(calls, 0);
});
test('municipality-qualified stop matches around the stop type without selecting another town', async () => {
  const r = await planSlTrip(
    'SL: Jag vill resa från Slussen i Stockholm till B imorgon kl 08',
    null,
    '',
    false,
    {
      now: () => now,
      getStops: async () => [
        { id: '1', name: 'Slussen T-bana (Stockholm kn)', lat: 59.3, lon: 18 },
        { id: '2', name: 'Slussen (Annan kommun)', lat: 59.3, lon: 18 },
        { id: '3', name: 'B', lat: 59.3, lon: 18 },
        { id: '4', name: 'B station', lat: 59.3, lon: 18 },
      ],
      fetchImpl: async () => {
        throw Error('should ask to resolve B');
      },
    },
  );
  assert.equal(r.tripChoices.origins.length, 1);
  assert.equal(r.tripChoices.origins[0].id, '1');
});

test('short clock follow-up needs a route while unrelated follow-ups retain their own intent', async () => {
  for (const message of [
    'kl 07:00',
    'Och imorgon kl 07?',
    'Jag vill åka till Stockholm',
  ]) {
    const r = await askLocalAi(message, {}, '');
    assert.equal(r.needsClarification, true);
  }
  for (const message of [
    'Och polishändelser i Göteborg?',
    'Och hur många bussar är sena i Göteborg?',
    'Jag vill resa från A till B imorgon kl 07',
  ])
    assert.equal(needsTravelRoute(message), false);
});

test('numeric stop names remain eligible while different house numbers are rejected', () => {
  assert.equal(
    placeMatches('Södra Ryd väg 26', 'Södra Ryd väg 26, Skövde'),
    true,
  );
  assert.equal(
    placeMatches('Södra Ryd väg 26', 'Södra Ryd väg 260, Skövde'),
    false,
  );
  assert.equal(
    placeMatches(
      'Lillegårdsvägen 11 A i Skövde',
      'Lillegårdsvägen 11A, Skövde',
    ),
    true,
  );
  assert.equal(
    placeMatches('Lillegårdsvägen 11A i Skövde', 'Lillegårdsvägen 11B, Skövde'),
    false,
  );
});

test('numeric literal stop survives empty address results in both planners', async () => {
  let vtQuery;
  const vt = await planTrip(
    'Jag vill resa från A till Södra Ryd väg 26 imorgon kl 08',
    null,
    {
      now: () => now,
      getAddresses: async () => [],
      getImpl: async (path) => {
        if (path.startsWith('journeys?')) {
          vtQuery = new URLSearchParams(path.split('?')[1]);
          return { results: [] };
        }
        const query = new URLSearchParams(path.split('?')[1]).get('q');
        return {
          results: [
            {
              gid: query === 'A' ? '1' : '26',
              locationType: 'stoparea',
              name: query,
            },
          ],
        };
      },
    },
  );
  assert.equal(vtQuery.get('destinationGid'), '26');
  assert.match(vt.answer, /Södra Ryd väg 26/);
  const saved = process.env.RESROBOT_API_KEY;
  process.env.RESROBOT_API_KEY = 'fixture-only';
  try {
    let rrQuery;
    await planSlTrip(
      'SL: Jag vill resa från A till Södra Ryd väg 26 imorgon kl 08',
      null,
      '',
      false,
      {
        now: () => now,
        getAddresses: async () => [],
        getStops: async () => [
          { id: '1', name: 'A', lat: 59.3, lon: 18 },
          { id: '26', name: 'Södra Ryd väg 26', lat: 59.3, lon: 18 },
          { id: '260', name: 'Södra Ryd väg 260', lat: 59.3, lon: 18 },
        ],
        fetchImpl: async (url) => {
          rrQuery = new URL(url).searchParams;
          return Response.json({ Trip: [] });
        },
      },
    );
    assert.equal(rrQuery.get('destId'), '26');
  } finally {
    if (saved === undefined) delete process.env.RESROBOT_API_KEY;
    else process.env.RESROBOT_API_KEY = saved;
  }
});

test('street without house number uses exact street and municipality, never an earlier house number', async () => {
  const rows = await addressCandidates('Lillegårdsvägen i Skövde', {
    getToken: async () => 'dummy',
    fetchImpl: async () =>
      Response.json({
        results: [
          {
            name: 'Lillegårdsvägen, 549 42 Skövde',
            locationType: 'address',
            latitude: 58.4,
            longitude: 13.8,
          },
          {
            name: 'Lillegårdsvägen 11A, Skövde',
            locationType: 'address',
            latitude: 58.5,
            longitude: 13.8,
          },
          {
            name: 'Lillegårdsvägen, Lidköping',
            locationType: 'address',
            latitude: 58.6,
            longitude: 13.8,
          },
          {
            name: 'Källegårdsvägen, Skövde',
            locationType: 'address',
            latitude: 58.3,
            longitude: 13.8,
          },
        ],
      }),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Lillegårdsvägen, 549 42 Skövde');
  assert.equal(rows[0].precision, 'street');
});
test('street target is routed as coordinates and explicitly described as a street point', async () => {
  let q;
  const r = await planTrip(
    'Jag vill resa från Brunnsparken i Göteborg till Lillegårdsvägen i Skövde imorgon och vara framme kl 09:00',
    null,
    {
      now: () => now,
      getAddresses: async (name) =>
        name.includes('Lillegårdsvägen')
          ? [
              {
                name: 'Lillegårdsvägen, Skövde',
                gid: 'coord:58.4:13.8',
                lat: 58.4,
                lon: 13.8,
                precision: 'street',
              },
            ]
          : null,
      getImpl: async (path) => {
        if (path.startsWith('journeys?')) {
          q = new URLSearchParams(path.split('?')[1]);
          return { results: [] };
        }
        return {
          results: [
            {
              gid: '9021014001760000',
              name: 'Brunnsparken, Göteborg',
              locationType: 'stoparea',
            },
          ],
        };
      },
    },
  );
  assert.equal(q.get('destinationLatitude'), '58.4');
  assert.equal(q.get('destinationLongitude'), '13.8');
  assert.equal(q.get('dateTimeRelatesTo'), 'arrival');
  assert.match(r.answer, /husnummer saknas/);
});
