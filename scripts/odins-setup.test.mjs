import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
import { importGtfs } from './import-gtfs.mjs';
import { pythonCommand } from '../server/providers/python-runtime.js';

const fixture = {
  'routes.txt': 'route_id,route_long_name,route_type\n100,Testlinje,3\n',
  'trips.txt':
    'route_id,service_id,trip_id,trip_headsign,shape_id\n100,weekday,trip1,,123\n',
  'stops.txt':
    'stop_id,stop_name,stop_lat,stop_lon\na,Start,58,13\nb,Slut,58.1,13.1\n',
  'stop_times.txt':
    'trip_id,arrival_time,departure_time,stop_id,stop_sequence\ntrip1,07:00:00,07:00:00,a,1\ntrip1,07:10:00,07:10:00,b,2\n',
  'shapes.txt':
    'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n123,58.1,13.1,2\n123,58,13,1\n',
  'calendar_dates.txt': 'service_id,date,exception_type\nweekday,20261012,1\n',
};
const archive = zipSync(
  Object.fromEntries(Object.entries(fixture).map(([n, s]) => [n, strToU8(s)])),
);
test('Python selection supports override, project venv and platform defaults', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'odins-python-'));
  try {
    assert.deepEqual(
      await pythonCommand({ GEV_PYTHON: 'C:/Python/python.exe' }, 'win32', dir),
      { file: 'C:/Python/python.exe', prefix: [] },
    );
    assert.deepEqual(await pythonCommand({}, 'win32', dir), {
      file: 'py',
      prefix: ['-3'],
    });
    assert.deepEqual(await pythonCommand({}, 'linux', dir), {
      file: 'python3',
      prefix: [],
    });
    await mkdir(join(dir, '.venv', 'Scripts'), { recursive: true });
    await writeFile(join(dir, '.venv', 'Scripts', 'python.exe'), '');
    assert.equal(
      (await pythonCommand({}, 'win32', dir)).file,
      join(dir, '.venv', 'Scripts', 'python.exe'),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('offline GTFS bootstrap works with empty cache, sorted shapes and headsign fallback', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'odins-gtfs-'));
  try {
    await importGtfs('sl', archive, dir);
    const sl = JSON.parse(
      await readFile(join(dir, 'sl-metadata.json'), 'utf8'),
    );
    assert.equal(sl.trips.trip1.headsign, 'Slut');
    assert.deepEqual(
      JSON.parse(await readFile(join(dir, 'sl-shapes', '123.json'), 'utf8')),
      [
        [13, 58],
        [13.1, 58.1],
      ],
    );
    await importGtfs('sj', archive, dir);
    const sj = JSON.parse(
      await readFile(join(dir, 'sj-geometry.json'), 'utf8'),
    );
    assert.equal(sj.calendar.length, 0);
    assert.equal(sj.calendar_dates.length, 1);
    const previous = await readFile(join(dir, 'sj-geometry.json'), 'utf8');
    await assert.rejects(
      importGtfs(
        'sj',
        zipSync({ 'trips.txt': strToU8(fixture['trips.txt']) }),
        dir,
      ),
      /saknar/,
    );
    assert.equal(
      await readFile(join(dir, 'sj-geometry.json'), 'utf8'),
      previous,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('a clean clone without geometry keeps trips and explains missing imports', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'odins-clean-'));
  try {
    const providers = join(dir, 'server', 'providers');
    await mkdir(providers, { recursive: true });
    await writeFile(join(dir, 'package.json'), '{"type":"module"}');
    for (const name of [
      'sj-trip-geometry.js',
      'sl-trip-geometry.js',
      'rail-network-geometry.js',
      'local-ai-data.js',
      'journey-mode.js',
      'geometry-availability.js',
      'python-runtime.js',
      'topography.js',
    ])
      await cp(
        new URL('../server/providers/' + name, import.meta.url),
        join(providers, name),
      );
    const mapped = [
      {
        legs: [
          {
            from: 'Start',
            to: 'Slut',
            approximate: true,
            coordinates: [
              [13, 58],
              [18, 59],
            ],
          },
        ],
      },
    ];
    for (const [name, fn] of [
      ['sj-trip-geometry.js', 'resolveSjGeometry'],
      ['sl-trip-geometry.js', 'resolveSlGeometry'],
      ['rail-network-geometry.js', 'resolveRailNetwork'],
    ]) {
      const mod = await import(pathToFileURL(join(providers, name)));
      const result = await mod[fn](
        [
          {
            LegList: {
              Leg: [
                {
                  Origin: { name: 'Start', lon: 13, lat: 58 },
                  Destination: { name: 'Slut', lon: 18, lat: 59 },
                  Product: [
                    { name: 'tåg', operatorInfo: { name: 'SJ' } },
                    { operatorInfo: { name: 'Storstockholm' } },
                  ],
                },
              ],
            },
          },
        ],
        mapped,
      );
      assert.equal(result, mapped);
      assert.equal(result[0].legs[0].approximate, true);
    }
    assert.equal(mapped[0].geometryWarnings.length, 3);
    assert.equal(mapped[0].legs[0].geometryReason.code, 'graph_unavailable');
    let handler;
    const { topographyPlugin } = await import(
      pathToFileURL(join(providers, 'topography.js'))
    );
    topographyPlugin().configureServer({
      middlewares: { use: (_path, fn) => (handler = fn) },
    });
    let payload;
    const res = {
      setHeader() {},
      end(s) {
        payload = JSON.parse(s);
      },
    };
    await handler(
      { url: '?scale=100&theme=kommunikation&bbox=13,58,14,59' },
      res,
    );
    assert.equal(res.statusCode, 503);
    assert.match(payload.error, /import:topography/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
