import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { parse } from 'csv-parse/sync';
import { parse as parseStream } from 'csv-parse';
import { Readable } from 'node:stream';
import { saveTransitShapes } from '../server/providers/transit-shapes.js';
import { recordTrafiklabRequest } from '../server/providers/trafiklab-budget.js';

export async function importGtfs(operator, archive, cacheDir) {
  if (!['sl', 'sj'].includes(operator))
    throw new Error('Operator måste vara sl eller sj.');
  const required =
    operator === 'sj'
      ? ['trips', 'stops', 'stop_times', 'shapes']
      : ['routes', 'trips', 'stops', 'stop_times', 'shapes'];
  const names = new Set(
    [...required, 'calendar', 'calendar_dates'].map((n) => n + '.txt'),
  );
  const files = unzipSync(archive, { filter: (f) => names.has(f.name) });
  for (const name of required)
    if (!files[name + '.txt']) throw new Error('GTFS saknar ' + name + '.txt');
  const rows = (name) =>
    files[name + '.txt']
      ? parse(strFromU8(files[name + '.txt']), {
          columns: true,
          bom: true,
          skip_empty_lines: true,
        })
      : [];
  await mkdir(cacheDir, { recursive: true });
  let payload;
  if (operator === 'sj') {
    if (!files['calendar.txt'] && !files['calendar_dates.txt'])
      throw new Error('GTFS saknar trafikdatum.');
    payload = Object.fromEntries(
      [
        'trips',
        'stops',
        'stop_times',
        'shapes',
        'calendar',
        'calendar_dates',
      ].map((n) => [n, rows(n)]),
    );
  } else {
    const routes = Object.fromEntries(
      rows('routes').map((r) => [
        r.route_id,
        { name: r.route_long_name || r.route_short_name, type: r.route_type },
      ]),
    );
    const trips = Object.fromEntries(
      rows('trips').map((t) => [
        t.trip_id,
        { route: t.route_id, headsign: t.trip_headsign, shapeId: t.shape_id },
      ]),
    );
    const stops = Object.fromEntries(
      rows('stops').map((s) => [s.stop_id, s.stop_name]),
    );
    const last = new Map();
    const raw = files['stop_times.txt'];
    function* chunks() {
      for (let i = 0; i < raw.length; i += 65536)
        yield raw.subarray(i, i + 65536);
    }
    for await (const row of Readable.from(chunks()).pipe(
      parseStream({ columns: true, bom: true, skip_empty_lines: true }),
    )) {
      const seq = Number(row.stop_sequence);
      if (
        Number.isFinite(seq) &&
        (!last.has(row.trip_id) || seq > last.get(row.trip_id).seq)
      )
        last.set(row.trip_id, {
          seq,
          stop: row.stop_id,
          headsign: row.stop_headsign,
        });
    }
    for (const [id, trip] of Object.entries(trips)) {
      const tail = last.get(id);
      trip.destinationSource =
        trip.headsign || tail?.headsign ? 'headsign' : 'last-stop';
      trip.headsign ||= tail?.headsign || stops[tail?.stop] || null;
    }
    await saveTransitShapes(
      'sl',
      files['shapes.txt'],
      pathToFileURL(join(cacheDir, 'sl-shapes') + '/'),
    );
    payload = { version: 2, at: Date.now(), routes, trips };
  }
  const destination = join(
    cacheDir,
    operator === 'sj' ? 'sj-geometry.json' : 'sl-metadata.json',
  );
  await writeFile(destination + '.tmp', JSON.stringify(payload));
  await rename(destination + '.tmp', destination);
  return {
    operator,
    trips:
      operator === 'sj'
        ? payload.trips.length
        : Object.keys(payload.trips).length,
  };
}

async function main() {
  try {
    process.loadEnvFile?.();
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const args = process.argv.slice(2),
    options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--download') options.download = true;
    else if (
      ['--operator', '--zip', '--cache-dir'].includes(args[i]) &&
      args[i + 1]
    )
      options[args[i].slice(2)] = args[++i];
    else
      throw new Error(
        'Använd --operator sl|sj och --zip <fil> eller --download, samt valfri --cache-dir.',
      );
  }
  if (
    !['sl', 'sj'].includes(options.operator) ||
    Boolean(options.zip) === Boolean(options.download)
  )
    throw new Error('Välj sl|sj och exakt ett av --zip eller --download.');
  const cacheDir = resolve(
    options['cache-dir'] ||
      fileURLToPath(new URL('../.gev-cache/', import.meta.url)),
  );
  let archive;
  if (options.zip)
    archive = new Uint8Array(await readFile(resolve(options.zip)));
  else {
    const key = process.env.TRAFIKLAB_STATIC_KEY;
    if (!key)
      throw new Error(
        'TRAFIKLAB_STATIC_KEY saknas. Lokal ZIP-import kräver ingen nyckel.',
      );
    await recordTrafiklabRequest('regionalStatic');
    const url = new URL(
      `https://opendata.samtrafiken.se/gtfs/${options.operator}/${options.operator}.zip`,
    );
    url.searchParams.set('key', key);
    // Never log a URL containing credentials, including network errors.
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(120000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error();
      const limit = 150_000_000;
      if (Number(response.headers.get('content-length')) > limit)
        throw new Error();
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > limit) throw new Error();
        chunks.push(chunk);
      }
      archive = new Uint8Array(Buffer.concat(chunks));
    } catch {
      throw new Error(
        'Trafiklab-hämtning misslyckades. Kontrollera nyckel, kvot och nätverk.',
      );
    }
  }
  console.log(
    JSON.stringify(await importGtfs(options.operator, archive, cacheDir)),
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
