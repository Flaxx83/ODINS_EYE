import { geometryWarning } from './geometry-availability.js';
import { readFile } from 'node:fs/promises';
const root = new URL('../../.gev-cache/', import.meta.url);
let metadata;
export async function resolveSlGeometry(trips, mapped) {
  if (
    !trips.some((t) =>
      (t.LegList?.Leg || []).some((l) =>
        l.Product?.some((p) =>
          /Storstockholm/i.test(p.operatorInfo?.name || ''),
        ),
      ),
    )
  )
    return mapped;
  try {
    metadata ??= JSON.parse(
      await readFile(new URL('sl-metadata.json', root), 'utf8'),
    );
    if (
      !metadata?.routes ||
      !metadata?.trips ||
      typeof metadata.routes !== 'object' ||
      typeof metadata.trips !== 'object'
    )
      throw Error('Invalid cache');
  } catch {
    return geometryWarning(
      mapped,
      'SL',
      'SL-geometridata saknas eller kan inte läsas. Kör npm run import:gtfs -- --operator sl --zip <sl.zip>. Resans tider och ändpunkter visas ändå.',
    );
  }
  for (const [i, trip] of trips.entries()) {
    for (const [j, leg] of (trip.LegList?.Leg || []).entries()) {
      const target = mapped[i]?.legs[j];
      if (!target || !target.approximate || leg.type === 'WALK') continue;
      const product = leg.Product?.[0];
      if (!/Storstockholm/i.test(product?.operatorInfo?.name || '')) continue;
      const line = Number(product.num);
      if (!Number.isInteger(line)) continue;
      const routes = Object.keys(metadata.routes).filter(
        (id) => Number(id.slice(7, -4)) === line * 10,
      );
      const shapeIds = [
        ...new Set(
          Object.values(metadata.trips)
            .filter((t) => routes.includes(t.route) && t.shapeId)
            .map((t) => t.shapeId),
        ),
      ];
      const candidates = new Map();
      let missingShape = false;
      for (const shapeId of shapeIds) {
        try {
          if (!/^\d+$/.test(shapeId)) continue;
          const coords = JSON.parse(
            await readFile(
              new URL('sl-shapes/' + shapeId + '.json', root),
              'utf8',
            ),
          );
          const nearest = (p) =>
            coords.reduce(
              (best, c, k) => {
                const d = Math.hypot(
                  (c[0] - p[0]) * Math.cos((p[1] * Math.PI) / 180),
                  c[1] - p[1],
                );
                return d < best.d ? { i: k, d } : best;
              },
              { i: 0, d: Infinity },
            );
          const a = nearest(target.coordinates[0]),
            b = nearest(target.coordinates.at(-1));
          if (a.d > 0.0015 || b.d > 0.0015 || a.i >= b.i) continue;
          const segment = coords.slice(a.i, b.i + 1);
          if (segment.length < 3) continue;
          const signature = segment
            .map((p) => p.map((n) => n.toFixed(4)).join(','))
            .join(';');
          candidates.set(signature, segment);
        } catch {
          missingShape = true;
        }
      }
      if (missingShape)
        geometryWarning(
          mapped,
          'SL',
          'SL-linjeformer saknas eller är oläsbara. Importera SL GTFS på nytt enligt docs/ODINS_SETUP.md.',
        );
      const paths = [...candidates.values()];
      const near = (p, q) =>
        Math.hypot(
          (p[0] - q[0]) * Math.cos((p[1] * Math.PI) / 180),
          p[1] - q[1],
        );
      const follows = (a, b) =>
        a.every(
          (p, k) =>
            k % Math.max(1, Math.ceil(a.length / 200)) !== 0 ||
            b.some((q) => near(p, q) < 0.00025),
        );
      const equivalent =
        paths.length > 0 &&
        paths.every(
          (path) => follows(path, paths[0]) && follows(paths[0], path),
        );
      if (equivalent) {
        target.coordinates = paths[0];
        target.approximate = false;
        target.geometrySource = 'SL planerad linjegeometri';
      }
    }
  }
  return mapped;
}
