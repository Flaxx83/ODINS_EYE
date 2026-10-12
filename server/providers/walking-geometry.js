export function decodeShape(s) {
  let i = 0,
    lat = 0,
    lon = 0,
    points = [];
  const next = () => {
    let n = 0,
      shift = 0,
      b;
    do {
      b = s.charCodeAt(i++) - 63;
      n |= (b & 31) << shift;
      shift += 5;
    } while (b >= 32 && i < s.length);
    return n & 1 ? ~(n >> 1) : n >> 1;
  };
  while (i < s.length) {
    lat += next();
    lon += next();
    points.push([lon / 1e6, lat / 1e6]);
  }
  return points;
}
export function createWalkingResolver({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = Date.now,
  wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  ttlMs = 86400000,
  maxEntries = 128,
  getBaseUrl = () =>
    process.env.VALHALLA_BASE_URL || 'https://valhalla1.openstreetmap.de/',
} = {}) {
  const cache = new Map(),
    pending = new Map();
  let queue = Promise.resolve();
  return async function resolveWalking(mapped) {
    for (const trip of mapped)
      for (const leg of trip.legs) {
        if (!leg.approximate || !['Gång', 'Byten'].includes(leg.name)) continue;
        const a = leg.coordinates[0],
          b = leg.coordinates.at(-1);
        if (
          Math.hypot(
            (a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180),
            a[1] - b[1],
          ) > 0.045
        )
          continue;
        const key = JSON.stringify([a, b]);
        try {
          const hit = cache.get(key);
          let points = hit && now() - hit.at < ttlMs ? hit.points : null;
          if (!points) cache.delete(key);
          if (!points) {
            const existing = pending.get(key);
            if (!existing && pending.size >= 32) throw Error('Routing budget');
            const job =
              existing ||
              queue.then(async () => {
                const params = {
                  locations: [
                    { lon: a[0], lat: a[1] },
                    { lon: b[0], lat: b[1] },
                  ],
                  costing: 'pedestrian',
                  shape_format: 'polyline6',
                  units: 'kilometers',
                };
                const r = await fetchImpl(
                  new URL('route', getBaseUrl().replace(/\/?$/, '/')).href +
                    '?json=' +
                    encodeURIComponent(JSON.stringify(params)),
                  {
                    headers: {
                      'X-Client-Id': 'gods-eye-view-local',
                      'User-Agent': 'GodsEyeViewLocal/0.2.1',
                    },
                    signal: AbortSignal.timeout(20000),
                  },
                );
                if (!r.ok) throw Error();
                const d = await r.json();
                const p = decodeShape(d.trip.legs[0].shape);
                if (p.length < 3) throw Error();
                cache.set(key, { points: p, at: now() });
                while (cache.size > maxEntries)
                  cache.delete(cache.keys().next().value);
                return p;
              });
            if (!existing) {
              pending.set(key, job);
              queue = job.then(
                () => wait(1100),
                () => wait(1100),
              );
            }
            try {
              points = await job;
            } finally {
              if (!existing) pending.delete(key);
            }
          }
          leg.coordinates = structuredClone(points);
          leg.approximate = false;
          leg.geometrySource = 'Beräknad gångväg · Valhalla / OpenStreetMap';
        } catch {}
      }
    return mapped;
  };
}
export const resolveWalking = createWalkingResolver();
