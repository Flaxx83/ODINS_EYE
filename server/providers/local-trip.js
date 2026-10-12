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
export async function planTrip(message, choice) {
  const m = message.match(
    /från\s+(.+?)\s+till\s+(.+?)(?:\s+(?:med buss|med spårvagn|nu))?[.!?]*$/i,
  );
  if (!m) return null;
  if (!/buss|resa|åka|spårvagn|resplan/i.test(message)) return null;
  const from = m[1].trim(),
    to = m[2].replace(/\s+(med buss|med spårvagn|nu).*$/i, '').trim();
  if (/imorgon|i morgon|klockan|\d{1,2}:\d{2}/i.test(message))
    return {
      answer:
        'Det första reseläget gäller avgång nu. Skriv exempelvis: Jag vill åka buss från Skövde resecentrum till Södra Ryd väg 26.',
    };
  const find = async (q) =>
    (
      await get(
        'locations/by-text?' +
          new URLSearchParams({ q, limit: '15', types: 'stoparea' }),
      )
    ).results.filter((r) => r.gid && r.locationType === 'stoparea');
  const [origins, destinations] = await Promise.all([find(from), find(to)]);
  if (!origins.length || !destinations.length)
    return {
      answer:
        'Ingen hållplats hittades för ' +
        (!origins.length ? from : to) +
        '. Ange hållplatsnamn och kommun.',
    };
  const pick = (rows, id) =>
    rows.find((r) => r.gid === id) || (rows.length === 1 ? rows[0] : null);
  const o = pick(origins, choice?.origin),
    d = pick(destinations, choice?.destination);
  if (!o || !d)
    return {
      answer: 'Välj de exakta hållplatserna nedan. Sökningen gäller avgång nu.',
      tripChoices: { origins, destinations, message },
    };
  const bus = /buss/i.test(message);
  const q = new URLSearchParams({
    originGid: o.gid,
    destinationGid: d.gid,
    limit: '5',
  });
  if (bus) q.append('transportModes', 'bus');
  const data = await get('journeys?' + q);
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
  const lines = [`Reseförslag från ${o.name} till ${d.name}. Avgång nu.`];
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
