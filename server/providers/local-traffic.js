import towns from './sweden-towns.json' with { type: 'json' };
import { token } from './vasttrafik.js';
import { swedenStops } from './local-sl-trip.js';
import { distanceKm } from './local-ai-data.js';
import { readResponseTextCapped } from '../../src/sources/httpBody.js';
import {
  departureStatus,
  summarizeDepartures,
  trafficTime,
} from './transit-summary.js';
export { departureStatus };

const validPoint = (p) =>
  p &&
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lon) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lon) <= 180;
export async function trafficAnswer(
  message,
  area,
  base,
  {
    fetchImpl = fetch,
    getStops = swedenStops,
    getToken = token,
    getNow = Date.now,
    selected: toolSelected = false,
    placeName,
    mode,
  } = {},
) {
  if (
    !toolSelected &&
    !/avgång|försen|sena|tidiga|i tid|trafikläge/i.test(message)
  )
    return null;
  const unknown = (reason) => ({
    answer: reason,
    trafficSummary: { status: 'unavailable', count: null, totals: null },
  });
  if (/imorgon|i morgon|igår|i går|(?:kl\.?|klockan|vid)\s*\d/i.test(message))
    return unknown(
      'Detta trafikläge gäller kommande 60 minuter, inte historiska eller framtida prognoser.',
    );
  if (/stockholm/i.test(message) && /göteborg/i.test(message))
    return unknown('Ange en stad åt gången för trafikläget.');
  if (/^SL:/i.test(message) && /göteborg/i.test(message))
    return unknown(
      'SL täcker inte Göteborg. Välj Hela Sverige eller Västtrafik.',
    );
  let center = area;
  let centerName = 'kartans position';
  const places = placeName
    ? [placeName]
    : [
        ...message.matchAll(
          /\bi\s+(\p{L}[\p{L} -]*?)(?=\s+i\s|\s+(?:är|just|nu|idag|som)|[?.!]|$)/giu,
        ),
      ]
        .map((m) => m[1].trim())
        .filter((p) => !/^(?:tid|dag|området|närheten)$/i.test(p));
  if (places.length > 1)
    return unknown('Ange en stad åt gången för trafikläget.');
  const place = places[0];
  if (place) {
    const normalized = place.toLocaleLowerCase('sv');
    const matches = towns.filter(
      (t) =>
        t.name.toLocaleLowerCase('sv') === normalized ||
        (normalized === 'göteborg' && t.name === 'Gothenburg'),
    );
    if (matches.length !== 1)
      return unknown(
        'Ange en entydig stad eller flytta kartan och fråga om trafikläget där.',
      );
    center = { lat: matches[0].lat, lon: matches[0].lon };
    centerName = normalized === 'göteborg' ? 'Göteborg' : matches[0].name;
  } else if (/stockholm/i.test(message)) {
    center = { lat: 59.33, lon: 18.06 };
    centerName = 'Stockholm';
  } else if (/göteborg/i.test(message)) {
    center = { lat: 57.708, lon: 11.974 };
    centerName = 'Göteborg';
  } else if (/^SL:/i.test(message)) {
    center = { lat: 59.33, lon: 18.06 };
    centerName = 'Stockholm';
  }
  if (!validPoint(center))
    return unknown(
      'En giltig kartposition eller stad behövs för trafikurvalet.',
    );
  const sl =
    center.lat > 58.7 &&
    center.lat < 60.5 &&
    center.lon > 17 &&
    center.lon < 19.8;
  if (/^SL:/i.test(message) && !sl)
    return unknown(
      'Den angivna platsen ligger utanför SL-urvalet. Välj rätt trafiknät.',
    );
  const provider = sl ? 'sl' : 'vasttrafik';
  const start = getNow(),
    end = start + 3600000;
  const modes = [
    ...(/buss/i.test(message) || mode === 'bus' ? ['BUS'] : []),
    ...(/spårvagn/i.test(message) || mode === 'tram' ? ['TRAM'] : []),
    ...(mode === 'train' ? ['TRAIN'] : []),
  ];
  const name = message
    .match(/(?:vid|hållplats(?:en)?|från)\s+(.+?)[?!.]*$/i)?.[1]
    ?.trim();
  const json = async (url, headers) => {
    const r = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
    if (!r.ok) throw Error('upstream_http');
    return JSON.parse(await readResponseTextCapped(r, 2 * 1024 * 1024));
  };
  let selected = [],
    candidateStops = 0;
  let headers;
  try {
    if (sl) {
      const all = await getStops(base);
      const seen = new Set();
      const near = all
        .filter(
          (s) =>
            validPoint(s) &&
            typeof s.id === 'string' &&
            /^\d{1,15}$/.test(s.id) &&
            !seen.has(s.id) &&
            (seen.add(s.id), true),
        )
        .map((s) => ({ s, d: distanceKm(center, s) }))
        .filter(
          (x) =>
            x.d <= 10 &&
            (!name ||
              x.s.name
                ?.toLocaleLowerCase('sv')
                .includes(name.toLocaleLowerCase('sv'))),
        )
        .sort((a, b) => a.d - b.d);
      candidateStops = near.length;
      selected = near
        .slice(0, name ? 3 : 5)
        .map((x) => ({ id: x.s.id, name: x.s.name }));
    } else {
      headers = { Authorization: 'Bearer ' + (await getToken()) };
      // Query Västtrafik's own nearby catalog instead of a sparse national stop selection.
      const url =
        'https://ext-api.vasttrafik.se/pr/v4/locations/' +
        (name
          ? 'by-text?' +
            new URLSearchParams({ q: name, types: 'stoparea', limit: '10' })
          : 'by-coordinates?' +
            new URLSearchParams({
              latitude: String(center.lat),
              longitude: String(center.lon),
              radiusInMeters: '10000',
              types: 'stoparea',
              limit: '10',
            }));
      const d = await json(url, headers);
      if (!Array.isArray(d.results)) throw Error('invalid_schema');
      const seen = new Set();
      const near = d.results
        .filter(
          (s) =>
            s.locationType === 'stoparea' &&
            /^9021\d{12}$/.test(s.gid || '') &&
            validPoint({ lat: s.latitude, lon: s.longitude }) &&
            distanceKm(center, { lat: s.latitude, lon: s.longitude }) <= 10 &&
            (!name ||
              s.name
                ?.toLocaleLowerCase('sv')
                .includes(name.toLocaleLowerCase('sv'))) &&
            !seen.has(s.gid) &&
            (seen.add(s.gid), true),
        )
        .sort(
          (a, b) =>
            distanceKm(center, { lat: a.latitude, lon: a.longitude }) -
            distanceKm(center, { lat: b.latitude, lon: b.longitude }),
        );
      candidateStops = near.length;
      selected = near
        .slice(0, name ? 3 : 5)
        .map((s) => ({ id: s.gid, name: s.name }));
    }
  } catch {
    return unknown(
      'Hållplatsurvalet kunde inte hämtas. Trafikläget är okänt, inte noll förseningar.',
    );
  }
  if (!selected.length)
    return unknown(
      'Ingen matchande hållplats hittades inom 10 km. Ange ett hållplatsnamn eller flytta kartan.',
    );
  const results = await Promise.all(
    selected.map(async (s) => {
      try {
        const d = await json(
          sl
            ? base + '/api/timetable/departures?id=' + s.id
            : 'https://ext-api.vasttrafik.se/pr/v4/stop-areas/' +
                s.id +
                '/departures?limit=30',
          headers,
        );
        const rows = sl ? d.departures : d.results;
        if (!Array.isArray(rows)) throw Error('invalid_schema');
        const retrieved = getNow();
        const fetched = sl ? trafficTime(d.gev?.fetchedAt) : retrieved;
        const generated = sl ? trafficTime(d.timestamp) : null;
        const stale =
          retrieved - start > 120000 ||
          (fetched != null &&
            (retrieved - fetched > 120000 || fetched > retrieved + 60000)) ||
          (generated != null &&
            (retrieved - generated > 120000 || generated > retrieved + 60000));
        return {
          ...s,
          provider,
          rows,
          fetchedAt: fetched == null ? null : new Date(fetched).toISOString(),
          retrievedAt: new Date(retrieved).toISOString(),
          generatedAt:
            generated == null ? null : new Date(generated).toISOString(),
          stale,
          capped: !sl && (rows.length >= 30 || Boolean(d.links?.next)),
        };
      } catch {
        return { ...s, provider, error: 'fetch_or_schema_error' };
      }
    }),
  );
  const summary = summarizeDepartures(results, { start, end, modes });
  summary.scope = {
    provider,
    center,
    centerName,
    radiusKm: 10,
    candidateStops,
    selectionLimit: name ? 3 : 5,
    selection: 'closest_returned_stop_areas',
    catalogComplete: false,
    modes,
  };
  const t = summary.totals;
  const localTime = (value) =>
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(value));
  const statusName = {
    unavailable: 'kunde inte hämtas',
    stale: 'gammalt underlag',
    available: 'hämtad',
  };
  const lines = [
    `Urval kring ${centerName} (${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}): ${summary.coverage.selectedStops} hållplatsområden inom 10 km. Tidsfönster: ${localTime(summary.window.start)}–${localTime(summary.window.end)} svensk tid (60 min).`,
    `Hämtade: ${summary.coverage.successfulStops}. Hämtfel: ${summary.coverage.failedStops}. Begränsade tavlor: ${summary.coverage.cappedStops}. Gamla tavlor: ${summary.coverage.staleStops}.`,
    t
      ? `${summary.count} identifierade unika hållplatsavgångar. Sena (>1 min): ${t.late}. Tidiga (>1 min): ${t.early}. Inom ±1 min enligt prognos: ${t.onTime}. Inställda: ${t.cancelled}. Okänd/jämförbar prognos saknas: ${t.unknown}.`
      : 'Urvalet saknar tillförlitligt avgångsunderlag. Trafikläget är okänt, inte noll förseningar.',
    `Dubblettrader borttagna: ${summary.coverage.duplicateRows}. Motstridiga avgångar: ${summary.coverage.conflictingDepartures}. Rader utan säker identitet/tid: ${summary.coverage.invalidRows}.`,
    ...summary.stops.map(
      (s) =>
        `${s.name}: ${statusName[s.status]}${s.fetchedAt ? ' · hämtad ' + localTime(s.fetchedAt) : ''}${s.generatedAt ? ' · källsvaret skapat ' + localTime(s.generatedAt) : ' · källans observationstid saknas'}.`,
    ),
    'Detta är ett begränsat avgångsurval, inte hela stadens trafik eller antalet unika fordon. Samma tur kan ha flera hållplatsavgångar. Saknad prognos betyder aldrig i tid. Västtrafiks prognosfält är inte ett GPS-bevis eller en observationstid.',
  ];
  const fetched = summary.stops
    .filter((s) => s.fetchedAt)
    .map((s) => s.fetchedAt)
    .sort()
    .at(-1);
  return {
    answer: lines.join('\n'),
    trafficSummary: summary,
    sources: fetched
      ? [
          {
            name: sl
              ? 'SL-urval · data från Trafiklab.se'
              : 'Avgångsurval · Västtrafiks API',
            url: sl
              ? 'https://www.trafiklab.se/api/our-apis/trafiklab-realtime-apis/timetables/'
              : 'https://developer.vasttrafik.se/',
            time: fetched,
          },
        ]
      : [],
  };
}
