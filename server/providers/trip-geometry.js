import { token } from './vasttrafik.js';
export async function resolveVasttrafikGeometry(trips, mapped) {
  await Promise.all(
    trips.map(async (trip, index) => {
      try {
        if (!trip.detailsReference) return;
        const r = await fetch(
          'https://ext-api.vasttrafik.se/pr/v4/journeys/' +
            encodeURIComponent(trip.detailsReference) +
            '/details?includes=servicejourneycoordinates&includes=servicejourneycalls',
          {
            headers: { Authorization: 'Bearer ' + (await token()) },
            signal: AbortSignal.timeout(20000),
          },
        );
        if (!r.ok) return;
        const details = await r.json();
        for (const leg of mapped[index].legs) {
          if (!leg.approximate) continue;
          const journeys = (details.tripLegs || []).flatMap(
            (l) => l.serviceJourneys || [],
          );
          const candidates = journeys.filter(
            (j) =>
              (j.serviceJourneyCoordinates || []).length > 2 &&
              (j.callsOnServiceJourney || []).some(
                (c) => c.stopPoint?.name === leg.from,
              ) &&
              (j.callsOnServiceJourney || []).some(
                (c) => c.stopPoint?.name === leg.to,
              ),
          );
          if (candidates.length !== 1) continue;
          const coords = candidates[0].serviceJourneyCoordinates.map((p) => [
            p.longitude,
            p.latitude,
          ]);
          const start = leg.coordinates[0],
            end = leg.coordinates.at(-1);
          const nearest = (p) =>
            coords.reduce(
              (best, c, i) =>
                Math.hypot(c[0] - p[0], c[1] - p[1]) < best.d
                  ? { i, d: Math.hypot(c[0] - p[0], c[1] - p[1]) }
                  : best,
              { i: 0, d: Infinity },
            );
          const a = nearest(start),
            b = nearest(end);
          if (a.d > 0.002 || b.d > 0.002 || a.i >= b.i) continue;
          leg.coordinates = coords.slice(a.i, b.i + 1);
          leg.approximate = false;
          leg.geometrySource = 'Västtrafik turgeometri';
        }
      } catch {}
    }),
  );
  return mapped;
}
