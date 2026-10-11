import { geometryWarning } from './geometry-availability.js';
import { readFile } from 'node:fs/promises';
let db;
const close = (a, b) =>
  Math.hypot((a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180), a[1] - b[1]) <
  0.0015;
export async function resolveSjGeometry(trips, mapped) {
  if (
    !trips.some((t) =>
      (t.LegList?.Leg || []).some((l) =>
        l.Product?.some((p) => /^SJ\b/i.test(p.operatorInfo?.name || '')),
      ),
    )
  )
    return mapped;
  try {
    db ??= JSON.parse(
      await readFile(
        new URL('../../.gev-cache/sj-geometry.json', import.meta.url),
        'utf8',
      ),
    );
    if (
      ![
        'stops',
        'trips',
        'stop_times',
        'shapes',
        'calendar',
        'calendar_dates',
      ].every((k) => Array.isArray(db[k]))
    )
      throw Error('Invalid cache');
  } catch {
    return geometryWarning(
      mapped,
      'SJ',
      'SJ-geometridata saknas eller kan inte läsas. Kör npm run import:gtfs -- --operator sj --zip <sj.zip>. Resans tider och ändpunkter visas ändå.',
    );
  }
  const stops = new Map(
    db.stops.map((s) => [s.stop_id, [Number(s.stop_lon), Number(s.stop_lat)]]),
  );
  const active = (id, date) => {
    const compact = date.replaceAll('-', '');
    const exception = db.calendar_dates.find(
      (c) => c.service_id === id && c.date === compact,
    );
    if (exception) return exception.exception_type === '1';
    const c = db.calendar.find((c) => c.service_id === id);
    const day = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ][new Date(date + 'T12:00:00Z').getUTCDay()];
    return (
      c && c.start_date <= compact && c.end_date >= compact && c[day] === '1'
    );
  };
  for (const [i, trip] of trips.entries())
    for (const [j, leg] of (trip.LegList?.Leg || []).entries()) {
      const target = mapped[i]?.legs[j];
      if (
        !target ||
        target.from !== leg.Origin?.name ||
        !target.approximate ||
        !leg.Product?.some((p) => /^SJ\b/i.test(p.operatorInfo?.name || ''))
      )
        continue;
      const candidates = [];
      for (const time of db.stop_times) {
        if (
          time.departure_time !== leg.Origin.time ||
          !stops.has(time.stop_id) ||
          !close(stops.get(time.stop_id), target.coordinates[0])
        )
          continue;
        const t = db.trips.find((t) => t.trip_id === time.trip_id);
        if (!t || !active(t.service_id, leg.Origin.date)) continue;
        const dest = db.stop_times.find(
          (s) =>
            s.trip_id === t.trip_id &&
            Number(s.stop_sequence) > Number(time.stop_sequence) &&
            stops.has(s.stop_id) &&
            close(stops.get(s.stop_id), target.coordinates.at(-1)),
        );
        if (dest && t.shape_id) candidates.push(t.shape_id);
      }
      const ids = [...new Set(candidates)];
      if (ids.length !== 1) continue;
      const coords = db.shapes
        .filter((s) => s.shape_id === ids[0])
        .sort(
          (a, b) => Number(a.shape_pt_sequence) - Number(b.shape_pt_sequence),
        )
        .map((s) => [Number(s.shape_pt_lon), Number(s.shape_pt_lat)]);
      const nearest = (p) =>
        coords.reduce(
          (best, c, k) =>
            Math.hypot(c[0] - p[0], c[1] - p[1]) < best.d
              ? { i: k, d: Math.hypot(c[0] - p[0], c[1] - p[1]) }
              : best,
          { i: 0, d: Infinity },
        );
      const a = nearest(target.coordinates[0]),
        b = nearest(target.coordinates.at(-1));
      if (a.i >= b.i || a.d > 0.003 || b.d > 0.003) continue;
      target.coordinates = coords.slice(a.i, b.i + 1);
      target.approximate = false;
      target.geometrySource =
        'SJ GTFS · matchat trafikdatum, avgångstid och stationer';
    }
  return mapped;
}
