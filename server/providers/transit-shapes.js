import { parse } from 'csv-parse';
import { Readable } from 'node:stream';
import { mkdir, writeFile } from 'node:fs/promises';
export async function saveTransitShapes(operator, raw, destination) {
  if (!raw) return false;
  const dir =
    destination ||
    new URL(`../../.gev-cache/${operator}-shapes/`, import.meta.url);
  await mkdir(dir, { recursive: true });
  const shapes = new Map();
  function* chunks() {
    for (let i = 0; i < raw.length; i += 65536)
      yield raw.subarray(i, i + 65536);
  }
  for await (const row of Readable.from(chunks()).pipe(
    parse({ columns: true, skip_empty_lines: true, bom: true }),
  )) {
    if (!/^[\w-]{1,120}$/.test(row.shape_id)) continue;
    const lat = Number(row.shape_pt_lat),
      lon = Number(row.shape_pt_lon),
      seq = Number(row.shape_pt_sequence);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      !Number.isFinite(seq) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      continue;
    let points = shapes.get(row.shape_id);
    if (!points) {
      points = [];
      shapes.set(row.shape_id, points);
    }
    points.push([seq, lon, lat]);
  }
  const entries = [...shapes];
  for (let i = 0; i < entries.length; i += 32)
    await Promise.all(
      entries
        .slice(i, i + 32)
        .map(([id, points]) =>
          writeFile(
            new URL(id + '.json', dir),
            JSON.stringify(
              points.sort((a, b) => a[0] - b[0]).map((p) => [p[1], p[2]]),
            ),
          ),
        ),
    );
  return true;
}
