import assert from 'node:assert/strict';
import {
  selectTools,
  validateToolPlan,
} from '../server/providers/local-ai-tools.js';
const cases = [
  {
    m: [
      'Jag vill resa från Göteborg central till Vällingby T-bana imorgon vid 07 tiden.',
    ],
  },
  {
    m: [
      'Jag vill resa från Brunnsparken i Göteborg till Lillegårdsvägen i Skövde imorgon och vara framme kl 09:00.',
    ],
  },
  { m: ['Hur många bussar är sena i Göteborg?'] },
  { m: ['Polis och luft i Göteborg?'] },
  { m: ['Visa Skövde på kartan'] },
  {
    m: [
      'Jag vill resa från Göteborg central till Vällingby imorgon kl 07:00',
      'Och vara framme kl 09:00 istället',
    ],
    mem: {
      origin: 'Göteborg central',
      destination: 'Vällingby',
      time: '2026-10-13 avgång kl 07:00',
      mode: 'any',
      place: null,
    },
  },
  {
    m: [
      'Jag vill resa till Stockholm',
      'Från Göteborg central imorgon kl 07:00',
    ],
  },
];
const expected = [
  ['plan_trip'],
  ['plan_trip'],
  ['traffic_status'],
  ['police_events', 'air_quality'],
  ['navigate'],
  ['plan_trip'],
  ['plan_trip'],
];
for (const [index, c] of cases.entries()) {
  const t = Date.now();
  try {
    const p = await selectTools(c.m, c.mem || null);
    validateToolPlan(p, [
      ...c.m,
      ...Object.values(c.mem || {}).filter((v) => typeof v === 'string'),
    ]);
    assert.deepEqual(
      p.actions.map((a) => a.tool),
      expected[index],
    );
    console.log(
      JSON.stringify({ message: c.m.at(-1), plan: p, ms: Date.now() - t }),
    );
  } catch (e) {
    console.log(JSON.stringify({ message: c.m.at(-1), error: e.message }));
    process.exitCode = 1;
  }
}
