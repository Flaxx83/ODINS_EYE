import { token } from './vasttrafik.js';
const AREAS = ['9021014004493000', '9021014006242000'];
const fail = (message) => Object.assign(new Error(message), { status: 502 });
const stamp = (value) =>
  typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value)
    ? Date.parse(value)
    : NaN;
async function get(path) {
  const response = await fetch('https://ext-api.vasttrafik.se/pr/v4/' + path, {
    headers: { Authorization: 'Bearer ' + (await token()) },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok)
    throw fail(
      'Färjeuppgifter kunde inte hämtas. Ingen statisk färjereserv används.',
    );
  return response.json();
}
export function ferryCandidate(row, details, area, start, end) {
  if (row.isCancelled || row.isPartCancelled) return null;
  const journey = details.serviceJourneys?.find(
    (j) => j.gid === row.serviceJourney?.gid,
  );
  if (!journey || !Array.isArray(journey.callsOnServiceJourney))
    throw fail('Ofullständiga färjeuppgifter.');
  if (
    journey.line?.transportMode !== 'ferry' ||
    !['5285', '5286'].includes(journey.line.technicalLineNumber)
  )
    return null;
  const calls = journey.callsOnServiceJourney;
  const index = calls.findIndex(
    (c) =>
      c.stopPoint?.gid === row.stopPoint?.gid &&
      c.plannedDepartureTime === row.plannedTime,
  );
  if (index < 0) throw fail('Avgången kunde inte matchas till kajen.');
  const from = calls[index];
  const to = calls
    .slice(index + 1)
    .find(
      (c) =>
        AREAS.includes(c.stopPoint?.stopArea?.gid) &&
        c.stopPoint.stopArea.gid !== area,
    );
  if (!to) return null;
  if (
    [from, to].some(
      (c) => c.isCancelled || c.isDepartureCancelled || c.isArrivalCancelled,
    )
  )
    return null;
  // Use a consistent pair of provider estimates, otherwise planned times only.
  const estimated =
    Number.isFinite(stamp(from.estimatedDepartureTime)) &&
    Number.isFinite(stamp(to.estimatedArrivalTime));
  const departure = stamp(
    estimated ? from.estimatedDepartureTime : from.plannedDepartureTime,
  );
  const arrival = stamp(
    estimated ? to.estimatedArrivalTime : to.plannedArrivalTime,
  );
  if (
    !Number.isFinite(departure) ||
    !Number.isFinite(arrival) ||
    arrival <= departure
  )
    throw fail('Ogiltiga färjetider.');
  if (departure < start || departure > end || arrival >= end) return null;
  const point = (c) => {
    const p = c.realtimeStopPoint || c.stopPoint;
    if (
      ![p?.latitude, p?.longitude].every(Number.isFinite) ||
      p.latitude < 57.68 ||
      p.latitude > 57.74 ||
      p.longitude < 11.9 ||
      p.longitude > 12.0
    )
      throw fail('Ogiltigt kajläge.');
    return { lat: p.latitude, lon: p.longitude, gid: p.gid, name: p.name };
  };
  return {
    line: journey.line.technicalLineNumber === '5285' ? '285' : '286',
    journeyGid: journey.gid,
    from: point(from),
    to: point(to),
    departure,
    arrival,
    timeQuality: estimated
      ? 'Leverantörens uppskattade tider; realtid inte verifierad'
      : 'Planerad tidtabell',
  };
}
export async function loadFerryDepartures({ start, minutes }, getImpl = get) {
  const end = start + minutes * 60000;
  const deadline = Date.now() + 30000;
  const load = async (path) => {
    if (Date.now() > deadline)
      throw fail('Färjehämtningen tog för lång tid. Försök igen.');
    return getImpl(path);
  };
  const candidates = [];
  for (const area of AREAS) {
    const payload = await load(
      'stop-areas/' +
        area +
        '/departures?' +
        new URLSearchParams({
          startDateTime: new Date(start).toISOString(),
          timeSpanInMinutes: String(minutes),
          maxDeparturesPerLineAndDirection: '100',
          limit: '100',
          transportModes: 'ferry',
          technicalLineNumbers: '5285,5286',
        }),
    );
    // Bounded pilot: refuse truncated data rather than claiming complete coverage.
    if (
      !Array.isArray(payload.results) ||
      payload.results.length >= 100 ||
      payload.links?.next ||
      payload.results.length > 24
    )
      throw fail(
        'Färjeunderlaget är ofullständigt eller för stort för piloten.',
      );
    for (const row of payload.results) {
      if (row.isCancelled || row.isPartCancelled) continue;
      if (
        typeof row.detailsReference !== 'string' ||
        row.detailsReference.length > 4096
      )
        throw fail('Färjedetaljer saknas.');
      const details = await load(
        'stop-areas/' +
          area +
          '/departures/' +
          encodeURIComponent(row.detailsReference) +
          '/details?includes=servicejourneycalls',
      );
      const candidate = ferryCandidate(row, details, area, start, end);
      if (
        candidate &&
        !candidates.some(
          (c) =>
            c.journeyGid === candidate.journeyGid &&
            c.from.gid === candidate.from.gid &&
            c.departure === candidate.departure,
        )
      )
        candidates.push(candidate);
    }
  }
  return {
    startTime: new Date(start).toISOString(),
    start,
    candidates,
    boardingSeconds: 120,
  };
}
