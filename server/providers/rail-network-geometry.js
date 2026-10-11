import { access } from 'node:fs/promises';
import { geometryWarning } from './geometry-availability.js';
import { runPython } from './python-runtime.js';
import { fileURLToPath } from 'node:url';
const cache = new Map();
export async function resolveRailNetwork(trips, mapped) {
  if (
    !trips.some((t) =>
      (t.LegList?.Leg || []).some((l) =>
        /tåg/i.test(l.Product?.[0]?.name || ''),
      ),
    )
  )
    return mapped;
  try {
    await access(new URL('../../.gev-cache/rail-network.pkl', import.meta.url));
  } catch {
    for (const t of mapped)
      for (const l of t.legs)
        if (l.geometrySource?.startsWith('SJ GTFS')) l.approximate = true;
    return geometryWarning(
      mapped,
      'Järnväg',
      'Järnvägsgraf saknas. Kör npm run import:rail -- --gpkg <100-kommunikation.gpkg>. Spårväg kan inte beräknas.',
    );
  }
  for (const [i, trip] of trips.entries())
    for (const [j, leg] of (trip.LegList?.Leg || []).entries()) {
      const target = mapped[i]?.legs[j];
      if (
        !target ||
        target.from !== leg.Origin?.name ||
        !/tåg/i.test(leg.Product?.[0]?.name || '') ||
        /tunnelbana/i.test(leg.Product?.[0]?.name || '')
      )
        continue;
      if (!target.approximate && !target.geometrySource?.startsWith('SJ GTFS'))
        continue;
      const points = [leg.Origin, ...(leg.Stops?.Stop || []), leg.Destination]
        .map((p) => [Number(p.lon), Number(p.lat)])
        .filter((p) => p.every(Number.isFinite));
      if (points.length < 2) continue;
      target.approximate = true;
      const key = JSON.stringify(points);
      try {
        let coords = cache.get(key);
        if (!coords) {
          const { stdout } = await runPython(
            [
              fileURLToPath(
                new URL('./rail-routing/route.py', import.meta.url),
              ),
              JSON.stringify(points),
            ],
            { timeout: 45000, windowsHide: true, maxBuffer: 8000000 },
          );
          coords = JSON.parse(stdout);
          if (coords?.length > 2) cache.set(key, coords);
        }
        if (coords?.length > 2) {
          target.coordinates = coords;
          target.approximate = false;
          target.calculated = true;
          target.geometrySource =
            'Beräknad spårväg i Lantmäteriets järnvägsnät via resans stationer; tågets faktiska spårval är inte bekräftat';
        }
      } catch (e) {
        geometryWarning(mapped, 'Järnväg', e.message);
      }
    }
  return mapped;
}
