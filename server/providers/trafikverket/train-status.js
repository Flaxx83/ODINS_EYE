import { getTrafikverketClient } from './client.js';
import { parseReportedTime } from './models.js';

const SOURCE =
  'https://www.trafikverket.se/e-tjanster/trafikverkets-oppna-api-for-trafikinformation/';
const text = (v) =>
  typeof v === 'string'
    ? v
        .replace(/[\x00-\x1f]/g, ' ')
        .slice(0, 300)
        .trim()
    : null;
const nameKey = (v) =>
  (text(v) || '')
    .split(',')[0]
    .toLocaleLowerCase('sv-SE')
    .normalize('NFC')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\bcentralstation\b|\bcentral\b/g, 'c')
    .replace(/\bresecentrum\b|\bstation\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ c$/, '');
const dateParts = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
/** Return no instant for nonexistent or ambiguous Stockholm wall times. */
export function stockholmTime(date, time) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date || '') ||
    !/^\d{2}:\d{2}(?::\d{2})?$/.test(time || '')
  )
    return null;
  const wall = `${date}T${time.length === 5 ? time + ':00' : time}`;
  const utc = Date.parse(wall + 'Z');
  if (!Number.isFinite(utc)) return null;
  const candidates = [1, 2]
    .map((offset) => utc - offset * 3600000)
    .filter((value) => {
      const p = Object.fromEntries(
        dateParts.formatToParts(value).map((x) => [x.type, x.value]),
      );
      return (
        `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}` ===
        wall
      );
    });
  return candidates.length === 1 ? new Date(candidates[0]).toISOString() : null;
}
const explicitTime = (v) => {
  const parsed = parseReportedTime(v);
  if (!Number.isFinite(parsed) || Number(v.slice(11, 13)) > 23) return null;
  // Date.parse normalizes e.g. February 30; a source clock must not do so silently.
  const calendar = new Date(v.slice(0, 10) + 'T00:00:00Z');
  if (calendar.toISOString().slice(0, 10) !== v.slice(0, 10)) return null;
  return new Date(parsed).toISOString();
};
const point = (p) => {
  const lat = p?.lat ?? p?.latitude,
    lon = p?.lon ?? p?.longitude;
  return lat != null &&
    lon != null &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lon)) &&
    Math.abs(Number(lat)) <= 90 &&
    Math.abs(Number(lon)) <= 180
    ? [Number(lon), Number(lat)]
    : null;
};
const stationPoint = (s) => {
  const m =
    typeof s.Geometry?.WGS84 === 'string'
      ? s.Geometry.WGS84.match(/^POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)$/)
      : null;
  return m ? point({ lon: m[1], lat: m[2] }) : null;
};
const near = (a, b) =>
  a &&
  b &&
  Math.hypot((a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180), a[1] - b[1]) *
    111 <=
    1.5;
const number = (v) =>
  typeof v === 'string' || typeof v === 'number'
    ? /^\d{1,6}$/.test(String(v).trim())
      ? String(Number(v))
      : null
    : null;
const eq = (field, value) => ({ op: 'EQ', field, value });
const unknown = (reason) => ({ status: 'unknown', reason });

export function stationMatch(endpoint, stations) {
  const wanted = nameKey(endpoint.name);
  if (!wanted) return unknown('station_missing');
  const matches = stations.filter(
    (s) =>
      s.Deleted === false &&
      s.Advertised === true &&
      text(s.LocationSignature) &&
      [
        s.AdvertisedLocationName,
        s.AdvertisedShortLocationName,
        s.OfficialLocationName,
      ].some((n) => nameKey(n) === wanted) &&
      (!endpoint.coordinates || near(endpoint.coordinates, stationPoint(s))),
  );
  const signatures = [...new Set(matches.map((s) => s.LocationSignature))];
  return signatures.length === 1
    ? { status: 'matched', signature: signatures[0] }
    : unknown(
        signatures.length > 1 ? 'station_ambiguous' : 'station_unmatched',
      );
}

/** Keep source clocks/fields distinct; no missing forecast is interpreted as punctual. */
export function announcementMatch(
  endpoint,
  trainNumber,
  rows,
  metadata,
  now = Date.now(),
) {
  const planned = Date.parse(endpoint.planned);
  if (!Number.isFinite(planned)) return unknown('time_missing');
  if (!Array.isArray(rows))
    return {
      ...unknown('source_unavailable'),
      sourceStatus: metadata?.status,
      errorCode: metadata?.errorCode,
    };
  if (metadata?.complete === false) return unknown('source_incomplete');
  const matches = rows.filter(
    (r) =>
      r.Deleted === false &&
      r.Advertised === true &&
      r.LocationSignature === endpoint.signature &&
      r.ActivityType === endpoint.activity &&
      number(r.AdvertisedTrainIdent) === trainNumber &&
      Math.abs(
        Date.parse(explicitTime(r.AdvertisedTimeAtLocation)) - planned,
      ) <= 60000,
  );
  // Identical ActivityId revisions may coalesce, but distinct activities must not silently win.
  const groups = new Map();
  for (const r of matches) {
    const id = text(r.ActivityId) || JSON.stringify(r);
    if (
      !groups.has(id) ||
      parseReportedTime(r.ModifiedTime) >
        parseReportedTime(groups.get(id).ModifiedTime)
    )
      groups.set(id, r);
  }
  if (groups.size !== 1)
    return unknown(groups.size > 1 ? 'train_ambiguous' : 'train_unmatched');
  const r = [...groups.values()][0];
  const modified = explicitTime(r.ModifiedTime);
  const stale =
    metadata?.stale === true ||
    !modified ||
    now - Date.parse(modified) > 6 * 3600000 ||
    Date.parse(modified) > now + 300000;
  const eventTime = (value) => {
    const valid = explicitTime(value);
    return valid && Math.abs(Date.parse(valid) - planned) <= 48 * 3600000
      ? valid
      : null;
  };
  const estimated = eventTime(r.EstimatedTimeAtLocation),
    actual = eventTime(r.TimeAtLocation);
  // Neither a future actual time nor a very old record may assert present status.
  const usableActual =
    actual && Date.parse(actual) <= now + 60000 ? actual : null;
  const canceled = typeof r.Canceled === 'boolean' ? r.Canceled : null;
  const reference = usableActual || estimated;
  return {
    status: stale
      ? 'stale'
      : canceled === true
        ? 'canceled'
        : reference
          ? Date.parse(reference) - planned > 60000
            ? 'late'
            : Date.parse(reference) - planned < -60000
              ? 'early'
              : 'on_time'
          : 'unknown',
    reason: stale
      ? 'source_old'
      : !reference && canceled !== true
        ? 'forecast_missing'
        : null,
    planned: explicitTime(r.AdvertisedTimeAtLocation),
    estimated,
    actual: usableActual,
    delayMinutes: reference
      ? Math.round((Date.parse(reference) - planned) / 60000)
      : null,
    canceled,
    track: text(r.TrackAtLocation),
    preliminary: r.EstimatedTimeIsPreliminary === true,
    deviations: (Array.isArray(r.Deviation) ? r.Deviation : [])
      .slice(0, 8)
      .map((d) => text(d.Description))
      .filter(Boolean),
    trafficDate: explicitTime(
      r.ScheduledDepartureDateTime || r.DepartureDateOTN,
    )
      ? (r.ScheduledDepartureDateTime || r.DepartureDateOTN).slice(0, 10)
      : null,
    sourceUpdatedAt: modified,
    fetchedAt: metadata?.fetchedAt || null,
    sourceStatus: metadata?.status || null,
    refreshFailed: metadata?.refreshFailed === true,
  };
}

export function trainLegs(trips, format) {
  return trips.slice(0, 3).map((trip) => {
    const legs =
      format === 'vasttrafik' ? trip.tripLegs || [] : trip.LegList?.Leg || [];
    return legs.slice(0, 24).flatMap((leg, legIndex) => {
      const product = leg.Product?.[0];
      const service = leg.serviceJourney;
      const rail =
        format === 'vasttrafik'
          ? service?.line?.transportMode === 'train'
          : leg.type !== 'WALK' &&
            /tåg/i.test(product?.name || '') &&
            !/tunnelbana|spårvagn/i.test(product?.name || '');
      if (!rail) return [];
      const origin =
        format === 'vasttrafik'
          ? leg.origin?.stopPoint || leg.origin
          : leg.Origin;
      const destination =
        format === 'vasttrafik'
          ? leg.destination?.stopPoint || leg.destination
          : leg.Destination;
      // Product.num is the advertised train number, not GTFS trip id, line id or numeric serviceJourney gid.
      const trainNumber =
        format === 'vasttrafik'
          ? number(service?.trainNumber) ||
            (/^SJ$/i.test(service?.line?.operator || '') &&
            service?.line?.transportSubMode === 'regionaltrain'
              ? number(service?.line?.designation)
              : null)
          : number(product?.num);
      const endpoint = (p, activity, iso) => ({
        name: text(p?.name),
        coordinates: point(p),
        activity,
        planned:
          format === 'vasttrafik'
            ? explicitTime(iso)
            : stockholmTime(p?.date, p?.time),
      });
      return [
        {
          legIndex,
          trainNumber,
          from: endpoint(origin, 'Avgang', leg.plannedDepartureTime),
          to: endpoint(destination, 'Ankomst', leg.plannedArrivalTime),
        },
      ];
    });
  });
}

export async function enrichTrainTrips(
  trips,
  { format = 'resrobot', client, now = Date.now(), timeoutMs = 25000 } = {},
) {
  const details = trainLegs(trips, format);
  const deadline = Date.now() + Math.max(1, Math.min(25000, timeoutMs));
  let queries = 0;
  const fetchedTimes = new Map();
  const source = {
    name: 'Trafikverket · tågannonsering',
    url: SOURCE,
    time: new Date(now).toISOString(),
  };
  if (!details.some((legs) => legs.length))
    return { trips: details, sources: [] };
  let stationData;
  const query = async (spec) => {
    const unavailable = { rows: null, metadata: { status: 'unavailable' } };
    if (++queries > 19 || Date.now() >= deadline) return unavailable;
    let timer;
    try {
      const result = await Promise.race([
        (client || getTrafikverketClient()).query(spec),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(unavailable), deadline - Date.now());
        }),
      ]);
      const fetched = parseReportedTime(result?.metadata?.fetchedAt);
      if (Array.isArray(result?.rows) && Number.isFinite(fetched))
        fetchedTimes.set(
          spec.type,
          Math.max(fetchedTimes.get(spec.type) || 0, fetched),
        );
      return result;
    } catch {
      return unavailable;
    } finally {
      clearTimeout(timer);
    }
  };
  const queryMemo = new Map();
  const eligible = (leg) =>
    leg.trainNumber &&
    leg.from.planned &&
    leg.to.planned &&
    Date.parse(leg.from.planned) <= now + 6 * 3600000 &&
    Date.parse(leg.to.planned) >= now - 6 * 3600000;
  if (details.some((legs) => legs.some(eligible)))
    stationData = await query({
      type: 'TrainStation',
      filter: {
        op: 'AND',
        filters: [eq('Deleted', false), eq('Advertised', true)],
      },
    });
  const endpoint = async (p, trainNumber) => {
    if (
      Date.parse(p.planned) > now + 6 * 3600000 ||
      Date.parse(p.planned) < now - 6 * 3600000
    )
      return unknown('outside_live_window');
    if (
      !Array.isArray(stationData?.rows) ||
      stationData.metadata?.complete === false
    )
      return unknown('stations_unavailable');
    const station = stationMatch(p, stationData.rows);
    if (station.status !== 'matched') return station;
    const spec = {
      type: 'TrainAnnouncement',
      filter: {
        op: 'AND',
        filters: [
          eq('Deleted', false),
          eq('Advertised', true),
          eq('LocationSignature', station.signature),
          eq('ActivityType', p.activity),
          eq('AdvertisedTrainIdent', trainNumber),
          {
            op: 'GTE',
            field: 'AdvertisedTimeAtLocation',
            value: new Date(Date.parse(p.planned) - 60000).toISOString(),
          },
          {
            op: 'LTE',
            field: 'AdvertisedTimeAtLocation',
            value: new Date(Date.parse(p.planned) + 60000).toISOString(),
          },
        ],
      },
    };
    const key = JSON.stringify(spec);
    if (!queryMemo.has(key)) queryMemo.set(key, query(spec));
    const data = await queryMemo.get(key);
    const matched = announcementMatch(
      { ...p, signature: station.signature },
      trainNumber,
      data.rows,
      data.metadata,
      now,
    );
    if (stationData.metadata?.stale && matched.status !== 'unknown')
      return { ...matched, status: 'stale', reason: 'station_catalog_old' };
    return matched;
  };
  // Bounded sequential calls avoid exceeding the shared client's in-flight limit.
  for (const legs of details)
    for (const leg of legs) {
      const reason = !leg.trainNumber
        ? 'train_number_missing'
        : !leg.from.planned || !leg.to.planned
          ? 'time_missing'
          : !eligible(leg)
            ? 'outside_live_window'
            : null;
      if (reason) {
        leg.departure = unknown(reason);
        leg.arrival = unknown(reason);
        continue;
      }
      leg.departure = await endpoint(leg.from, leg.trainNumber);
      leg.arrival = await endpoint(leg.to, leg.trainNumber);
      if (
        leg.departure.trafficDate &&
        leg.arrival.trafficDate &&
        leg.departure.trafficDate !== leg.arrival.trafficDate
      ) {
        leg.departure = unknown('traffic_date_conflict');
        leg.arrival = unknown('traffic_date_conflict');
      }
    }
  const fetched =
    fetchedTimes.get('TrainAnnouncement') ?? fetchedTimes.get('TrainStation');
  return {
    trips: details,
    sources:
      fetched == null
        ? []
        : [
            {
              ...source,
              name: fetchedTimes.has('TrainAnnouncement')
                ? source.name
                : 'Trafikverket · stationsregister',
              time: new Date(fetched).toISOString(),
            },
          ],
  };
}

const labels = {
  station_missing: 'station saknas',
  station_ambiguous: 'tvetydig station',
  station_unmatched: 'station kunde inte matchas',
  stations_unavailable: 'stationsunderlag saknas eller är begränsat',
  time_missing: 'entydig planerad tid saknas',
  source_unavailable: 'källan kunde inte hämtas',
  source_incomplete: 'begränsat källurval',
  train_ambiguous: 'tvetydigt tåg',
  train_unmatched: 'ingen matchad tågannonsering',
  forecast_missing: 'prognos saknas',
  source_old: 'äldre källuppgift',
  station_catalog_old: 'äldre stationskatalog',
  train_number_missing: 'annonserat tågnummer saknas',
  outside_live_window: 'utanför fönstret för aktuell trafikstatus',
  traffic_date_conflict: 'trafikdatum stämmer inte mellan avgång och ankomst',
};
const clock = (iso) =>
  iso
    ? new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Stockholm',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(Date.parse(iso))
    : 'Uppgift saknas';
export function trainStatusText(leg) {
  const result = [
    `Trafikverket · tåg ${leg.trainNumber || 'Uppgift saknas'} · ${leg.from.name} → ${leg.to.name}`,
  ];
  for (const [name, e] of [
    ['Avgång', leg.departure],
    ['Ankomst', leg.arrival],
  ]) {
    const status = {
      canceled: 'INSTÄLLD',
      late: 'sen',
      early: 'tidig',
      on_time: 'i tid enligt uppgiften',
      stale: 'ÄLDRE UPPGIFT',
      unknown: 'Okänd status',
    }[e.status];
    result.push(
      `${name}: ${status}${e.reason ? ' · ' + (labels[e.reason] || 'Uppgift saknas') : ''}. Planerad${!e.planned ? ' (reseplanerare)' : ''}: ${clock(e.planned || (name === 'Avgång' ? leg.from.planned : leg.to.planned))}. Beräknad: ${clock(e.estimated)}${e.preliminary ? ' (preliminär)' : ''}. Faktisk: ${clock(e.actual)}. Spår: ${e.track || 'Uppgift saknas'}.`,
    );
    if (e.status === 'stale' && e.canceled === true)
      result.push(
        'Rapporterad inställning i den äldre uppgiften; aktuell status är okänd.',
      );
    if (e.delayMinutes != null)
      result.push(
        `Avvikelse mot plan: ${e.delayMinutes} min${e.status === 'stale' ? ' (äldre uppgift)' : ''}.`,
      );
    if (e.deviations?.length)
      result.push('Rapporterad avvikelse: ' + e.deviations.join('; '));
    if (e.fetchedAt)
      result.push(
        `Hämtad: ${e.fetchedAt}. Källan ändrad: ${e.sourceUpdatedAt || 'Uppgift saknas'}${e.refreshFailed ? ' · uppdatering misslyckades' : ''}.`,
      );
  }
  return result.join('\n');
}
