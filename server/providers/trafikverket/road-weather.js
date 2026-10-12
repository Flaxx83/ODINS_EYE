import { getTrafikverketClient } from './client.js';
import { parseReportedTime } from './models.js';
export function weatherPoint(wkt) {
  const m =
    typeof wkt === 'string' &&
    wkt.match(/^POINT\s*\(\s*([-+\d.]+)\s+([-+\d.]+)\s*\)$/i);
  if (!m) return null;
  const lon = Number(m[1]),
    lat = Number(m[2]);
  return Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
    ? { lat, lon }
    : null;
}
const number = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export function normalizeWeatherStations(rows, now = Date.now()) {
  return rows
    .filter((r) => !r.Deleted)
    .flatMap((r) => {
      const point = weatherPoint(r.Geometry?.WGS84);
      if (!point || r.Id == null) return [];
      const o = r.Observation || {},
        sample = parseReportedTime(o.Sample),
        valid = Number.isFinite(sample) && sample <= now + 300000;
      return [
        {
          id: String(r.Id),
          name: r.Name || 'Uppgift saknas',
          ...point,
          sampledAt: valid ? o.Sample : null,
          stale: !valid || now - sample > 1800000,
          roadTemperatureC: number(o.Surface?.Temperature?.Value),
          airTemperatureC: number(o.Air?.Temperature?.Value),
          precipitation:
            typeof o.Weather?.Precipitation === 'string'
              ? o.Weather.Precipitation
              : null,
          wind:
            o.Wind?.map((w) => ({
              heightM: number(w.Height),
              speedMps: number(w.Speed?.Value),
              directionDeg: number(w.Direction?.Value),
            })) || [],
        },
      ];
    });
}
export function weatherDistance(a, b) {
  const rad = Math.PI / 180,
    dlat = (b.lat - a.lat) * rad,
    dlon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function nearestWeather(stations, point) {
  const candidates = stations
    .map((s) => ({ ...s, distanceKm: weatherDistance(point, s) }))
    .filter((s) => s.distanceKm <= 30)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  return candidates[0] || null;
}
export async function getRoadWeather(
  box,
  { getClient = getTrafikverketClient, now = Date.now, point } = {},
) {
  if (
    !Array.isArray(box) ||
    box.length !== 4 ||
    box.some((v) => !Number.isFinite(v)) ||
    box[0] >= box[2] ||
    box[1] >= box[3] ||
    box[0] < -180 ||
    box[2] > 180 ||
    box[1] < -90 ||
    box[3] > 90 ||
    box[2] - box[0] > 30 ||
    box[3] - box[1] > 20
  )
    throw Error('bbox');
  const [station, conditions] = await Promise.all([
    getClient().query({
      type: 'WeatherMeasurepoint',
      filter: { op: 'EQ', field: 'Deleted', value: false },
    }),
    getClient().query({
      type: 'RoadCondition',
      include: [
        'Id',
        'ConditionText',
        'ConditionInfo',
        'StartTime',
        'Geometry.WGS84',
        'ModifiedTime',
        'RoadNumber',
        'LocationText',
      ],
      filter: { op: 'EQ', field: 'Deleted', value: false },
    }),
  ]);
  const all = normalizeWeatherStations(station.rows || [], now());
  return {
    stations: all.filter(
      (s) =>
        s.lon >= box[0] &&
        s.lon <= box[2] &&
        s.lat >= box[1] &&
        s.lat <= box[3],
    ),
    nearest: point ? nearestWeather(all, point) : null,
    reports: normalizeRoadConditions(conditions.rows || [], box, now(), point),
    sources: [station.metadata, conditions.metadata],
    available: Array.isArray(station.rows),
    stale: station.metadata.stale,
    partial: !station.rows || !conditions.rows,
    conditionNote:
      'Väglagsrapporter gäller angivna vägsträckor; närhet är inte bekräftelse för exakt kamerayta. Inget normalt väglag antas från temperatur.',
    conditionReportsAvailable: Array.isArray(conditions.rows),
    note: 'Stationsobservation, inte en säker halkbedömning. Närmaste station representerar inte automatiskt kamerans exakta plats.',
  };
}
export function roadWeatherPlugin() {
  const install = (server) => {
    server.middlewares.use('/api/road-weather', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.end('{}');
        return;
      }
      try {
        const q = new URL(req.url, 'http://localhost').searchParams;
        if ([...q.keys()].some((k) => !['bbox', 'lat', 'lon'].includes(k)))
          throw Error();
        let box = q.get('bbox')?.split(',').map(Number),
          point;
        if (q.has('lat') || q.has('lon')) {
          if (!q.get('lat')?.trim() || !q.get('lon')?.trim()) throw Error();
          point = { lat: Number(q.get('lat')), lon: Number(q.get('lon')) };
          if (
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lon) ||
            Math.abs(point.lat) > 90 ||
            Math.abs(point.lon) > 180
          )
            throw Error();
          if (!box)
            box = [
              Math.max(-180, point.lon - 1),
              Math.max(-90, point.lat - 0.5),
              Math.min(180, point.lon + 1),
              Math.min(90, point.lat + 0.5),
            ];
        }
        res.end(JSON.stringify(await getRoadWeather(box, { point })));
      } catch {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            error: 'Vägväder kunde inte hämtas; kontrollera området.',
          }),
        );
      }
    });
  };
  return {
    name: 'road-weather',
    configureServer: install,
    configurePreviewServer: install,
  };
}

export function normalizeRoadConditions(rows, box, now = Date.now(), point) {
  return rows
    .filter((r) => !r.Deleted)
    .flatMap((r) => {
      const m = r.Geometry?.WGS84?.match(/^LINESTRING\s*\((.*)\)$/i);
      if (!m) return [];
      const points = m[1]
        .split(',')
        .map((p) => p.trim().split(/\s+/).map(Number));
      if (
        points.length < 2 ||
        points.length > 10000 ||
        points.some(
          (p) =>
            p.length !== 2 ||
            !p.every(Number.isFinite) ||
            Math.abs(p[0]) > 180 ||
            Math.abs(p[1]) > 90,
        )
      )
        return [];
      if (
        !points.some(
          ([lon, lat]) =>
            lon >= box[0] && lon <= box[2] && lat >= box[1] && lat <= box[3],
        )
      )
        return [];
      const time = parseReportedTime(r.ModifiedTime);
      const start = parseReportedTime(r.StartTime);
      if (Number.isFinite(start) && start > now) return [];
      const distanceKm = point
        ? Math.min(
            ...points.map(([lon, lat]) => weatherDistance(point, { lat, lon })),
          )
        : null;
      if (point && distanceKm > 3) return [];
      return [
        {
          id: String(r.Id),
          road: r.RoadNumber || null,
          place: r.LocationText || null,
          text: r.ConditionText || null,
          info: Array.isArray(r.ConditionInfo) ? r.ConditionInfo : [],
          reportedAt: Number.isFinite(time) ? r.ModifiedTime : null,
          stale:
            !Number.isFinite(time) ||
            time > now + 300000 ||
            now - time > 21600000,
          distanceKm,
          geometry: 'reported-road-line',
        },
      ];
    })
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    .slice(0, 20);
}
