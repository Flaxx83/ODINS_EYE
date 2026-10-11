const cache = new Map();
let queue = Promise.resolve();
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
export async function resolveWalking(mapped) {
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
        let points = cache.get(key);
        if (!points) {
          const job = queue.then(async () => {
            const params = {
              locations: [
                { lon: a[0], lat: a[1] },
                { lon: b[0], lat: b[1] },
              ],
              costing: 'pedestrian',
              shape_format: 'polyline6',
              units: 'kilometers',
            };
            const r = await fetch(
              'https://valhalla1.openstreetmap.de/route?json=' +
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
            cache.set(key, p);
            return p;
          });
          queue = job.then(
            () => new Promise((r) => setTimeout(r, 1100)),
            () => new Promise((r) => setTimeout(r, 1100)),
          );
          points = await job;
        }
        leg.coordinates = points;
        leg.approximate = false;
        leg.geometrySource = 'Beräknad gångväg · Valhalla / OpenStreetMap';
      } catch {}
    }
  return mapped;
}
