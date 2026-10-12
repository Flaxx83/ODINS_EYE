import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runPython } from '../server/providers/python-runtime.js';
try {
  process.loadEnvFile?.();
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const graph = new URL('../.gev-cache/rail-network.pkl', import.meta.url);
const fixtureFile = new URL(
  '../server/providers/rail-routing/fixtures/sweden-2026-10-12.json',
  import.meta.url,
);
const data = JSON.parse(await readFile(fixtureFile, 'utf8'));
let checksum = null;
try {
  checksum = createHash('sha256')
    .update(await readFile(graph))
    .digest('hex');
} catch {}
const results = [];
for (const fixture of data.fixtures) {
  const points = [],
    names = [];
  for (const point of fixture.points) {
    const p = [point.lon, point.lat];
    if (JSON.stringify(p) !== JSON.stringify(points.at(-1))) {
      points.push(p);
      names.push(point.name);
    }
  }
  const { stdout } = await runPython(
    [
      fileURLToPath(
        new URL('../server/providers/rail-routing/route.py', import.meta.url),
      ),
      JSON.stringify(points),
    ],
    { timeout: 45000, maxBuffer: 8000000 },
  );
  const r = JSON.parse(stdout);
  if (!['ok', 'missing'].includes(r.status))
    throw Error('Unexpected routing result');
  results.push({
    train: fixture.train,
    date: fixture.date,
    time: fixture.time,
    from: fixture.from,
    to: fixture.to,
    status: r.status,
    reason: r.reason,
    fromStation: Number.isInteger(r.segmentIndex)
      ? names[r.segmentIndex]
      : undefined,
    toStation: Number.isInteger(r.segmentIndex)
      ? names[r.segmentIndex + 1]
      : undefined,
    station: Number.isInteger(r.stationIndex)
      ? names[r.stationIndex]
      : undefined,
    points: r.coordinates?.length,
    distanceMeters: r.distanceMeters,
    limitMeters: r.limitMeters,
    repeatedMeters: r.repeatedMeters,
    maxSnapMeters: r.snaps?.length
      ? Math.max(...r.snaps.map((s) => s.distanceMeters))
      : undefined,
  });
}
console.log(
  JSON.stringify(
    {
      source: data.source,
      graphSha256: checksum,
      fixtureCount: results.length,
      geometryCount: results.filter((x) => x.status === 'ok').length,
      results,
    },
    null,
    2,
  ),
);
if (
  process.argv.includes('--require-all') &&
  results.some((x) => x.status !== 'ok')
)
  process.exitCode = 1;
