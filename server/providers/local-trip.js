import {
  parseTravelTime,
  applyJourneyTime,
  journeyTimeLabel,
  choiceMessage,
  addressCandidates,
} from './travel-input.js';
import {
  enrichTrainTrips,
  trainStatusText,
} from './trafikverket/train-status.js';
import { resolveVasttrafikGeometry } from './trip-geometry.js';
import { vasttrafikMapTrips } from './trip-map.js';
import { token } from './vasttrafik.js';
async function get(path) {
  const r = await fetch('https://ext-api.vasttrafik.se/pr/v4/' + path, {
    headers: { Authorization: 'Bearer ' + (await token()) },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw Error('Västtrafik svarade ' + r.status);
  return r.json();
}
export async function planTrip(
  message,
  choice,
  { getImpl = get, now = () => new Date() } = {},
) {
  if (
    !/från.+till/i.test(message) ||
    !/buss|resa|åka|spårvagn|resplan|tåg|tunnelbana/i.test(message)
  )
    return null;
  const travel = parseTravelTime(message, now());
  const m = travel.clean.match(
    /från\s+(.+?)\s+till\s+(.+?)(?:\s+(?:med buss|med spårvagn|nu))?[.!?]*$/i,
  );
  if (!m) return null;
  if (!/buss|resa|åka|spårvagn|resplan|tåg|tunnelbana/i.test(message))
    return null;
  const from = m[1].trim(),
    to = m[2].replace(/\s+(med buss|med spårvagn|nu).*$/i, '').trim();
  const find = async (q) =>
    (
      await getImpl(
        'locations/by-text?' +
          new URLSearchParams({
            q: q.replace(/\s+i\s+/i, ', '),
            limit: '15',
            types: 'stoparea',
          }),
      )
    ).results.filter((r) => r.gid && r.locationType === 'stoparea');
  const [origins, destinations] = await Promise.all([
    addressCandidates(from).then((rows) => rows ?? find(from)),
    addressCandidates(to).then((rows) => rows ?? find(to)),
  ]);
  if (!origins.length || !destinations.length)
    return {
      answer:
        'Ingen hållplats hittades för ' +
        (!origins.length ? from : to) +
        '. Ange hållplatsnamn och kommun.',
    };
  const pick = (rows, id) =>
    id ? rows.find((r) => r.gid === id) : rows.length === 1 ? rows[0] : null;
  const o = pick(origins, choice?.origin),
    d = pick(destinations, choice?.destination);
  if (!o || !d)
    return {
      answer:
        'Välj exakta adresser eller hållplatser. Sökningen gäller ' +
        journeyTimeLabel(travel) +
        '.',
      tripChoices: {
        origins,
        destinations,
        message: choiceMessage(message, travel),
      },
    };
  const bus = /buss/i.test(message);
  const q = new URLSearchParams({
    limit: '5',
  });
  for (const [prefix, location] of [
    ['origin', o],
    ['destination', d],
  ]) {
    if (location.gid.startsWith('coord:')) {
      q.set(prefix + 'Latitude', String(location.lat));
      q.set(prefix + 'Longitude', String(location.lon));
    } else q.set(prefix + 'Gid', location.gid);
  }
  applyJourneyTime(q, travel, 'vasttrafik');
  if (bus) q.append('transportModes', 'bus');
  const data = await getImpl('journeys?' + q);
  const trips = (data.results || [])
    .filter(
      (j) =>
        !bus ||
        j.tripLegs?.every(
          (l) =>
            !l.serviceJourney || l.serviceJourney.line?.transportMode === 'bus',
        ),
    )
    .slice(0, 3);
  const trainStatus = await enrichTrainTrips(trips, { format: 'vasttrafik' });
  const clock = (s) =>
    s
      ? new Date(s).toLocaleTimeString('sv-SE', {
          timeZone: 'Europe/Stockholm',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';
  const lines = [
    `Reseförslag från ${o.name} till ${d.name}. ${journeyTimeLabel(travel)}.`,
  ];
  if (!trips.length)
    lines.push('Inga reseförslag för valt färdsätt returnerades.');
  trips.forEach((j, i) => {
    lines.push('\nFörslag ' + (i + 1));
    for (const train of trainStatus.trips[i] || [])
      lines.push(trainStatusText(train));
    for (const l of [
      ...(j.tripLegs || []),
      ...(j.connectionLinks || []),
      ...(j.departureAccessLink ? [j.departureAccessLink] : []),
      ...(j.arrivalAccessLink ? [j.arrivalAccessLink] : []),
    ].sort(
      (a, b) =>
        Date.parse(a.plannedDepartureTime || a.origin?.plannedTime) -
        Date.parse(b.plannedDepartureTime || b.origin?.plannedTime),
    )) {
      const origin = l.origin?.stopPoint?.name || l.origin?.name || '',
        destination =
          l.destination?.stopPoint?.name || l.destination?.name || '';
      const line = l.serviceJourney?.line;
      lines.push(
        `${line?.name || 'Gång/anslutning'}: ${origin} → ${destination}, ${clock(l.estimatedDepartureTime || l.plannedDepartureTime || l.origin?.estimatedOtherwisePlannedTime)}–${clock(l.estimatedArrivalTime || l.plannedArrivalTime || l.destination?.estimatedOtherwisePlannedTime)}${l.isCancelled ? ' · INSTÄLLD' : ''}`,
      );
    }
  });
  return {
    trainStatus: trainStatus.trips,
    mapTrips: await resolveVasttrafikGeometry(trips, vasttrafikMapTrips(trips)),
    answer:
      lines.join('\n') +
      '\nTider är prognos när tillgänglig, annars tidtabell. Kontrollera trafikmeddelanden hos Västtrafik.',
    sources: [
      ...trainStatus.sources,
      {
        name: 'Västtrafik reseplanering',
        url: 'https://www.vasttrafik.se/',
        time: new Date().toISOString(),
      },
    ],
  };
}
