import { decodeVehiclePositions } from '../../src/data/gtfsRealtime.js';
import { unzipSync, strFromU8 } from 'fflate';
import { parse } from 'csv-parse/sync';
import { parse as parseStream } from 'csv-parse';
import { Readable } from 'node:stream';
import { recordTrafiklabRequest } from './trafiklab-budget.js';
import { saveTransitShapes } from './transit-shapes.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
export function enrichSl(decoded, metadata, now = Date.now()) {
  if (decoded.incrementality !== 0)
    throw new Error('Inkrementellt flöde stöds inte');
  return decoded.vehicles
    .filter(
      (v) =>
        Number.isFinite(v.timestamp) &&
        v.timestamp * 1000 > now - 300000 &&
        v.timestamp * 1000 < now + 60000,
    )
    .map((v) => {
      const trip = metadata?.trips?.[v.tripId],
        route = metadata?.routes?.[v.routeId || trip?.route];
      return {
        ...v,
        line: route?.name || null,
        mode: route?.type || null,
        destination: trip?.headsign || null,
        destinationSource: trip?.destinationSource || null,
      };
    });
}
async function bytes(url, max) {
  await recordTrafiklabRequest(
    url.includes('/gtfs-rt/') ? 'regionalRealtime' : 'regionalStatic',
  );
  const r = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    redirect: 'error',
  });
  if (!r.ok) throw new Error('Trafiklab svarade inte');
  if (Number(r.headers.get('content-length')) > max)
    throw new Error('För stort svar');
  const data = new Uint8Array(await r.arrayBuffer());
  if (data.length > max) throw new Error('För stort svar');
  return data;
}
export function slPlugin({ operator = 'sl', route = '/api/sl/vehicles' } = {}) {
  const cacheFile = new URL(
    `../../.gev-cache/${operator}-metadata.json`,
    import.meta.url,
  );
  let cache,
    pending,
    metadata,
    metadataPending,
    lastMetadataAttempt = 0;
  async function getMetadata() {
    if (metadata?.version === 2 && Date.now() - metadata.at < 86400000)
      return metadata;
    if (Date.now() - lastMetadataAttempt < 3600000) return metadata;
    metadataPending ??= (async () => {
      lastMetadataAttempt = Date.now();
      try {
        if (!metadata) {
          try {
            metadata = JSON.parse(await readFile(cacheFile, 'utf8'));
          } catch {}
        }
        if (metadata?.version === 2 && Date.now() - metadata.at < 86400000)
          return metadata;
        const key = process.env.TRAFIKLAB_STATIC_KEY;
        if (!key) return metadata;
        const files = unzipSync(
          await bytes(
            `https://opendata.samtrafiken.se/gtfs/${operator}/${operator}.zip?key=` +
              encodeURIComponent(key),
            150000000,
          ),
          {
            filter: (file) =>
              [
                'routes.txt',
                'trips.txt',
                'stops.txt',
                'stop_times.txt',
                'shapes.txt',
              ].includes(file.name),
          },
        );
        const routes = Object.fromEntries(
          parse(strFromU8(files['routes.txt']), {
            columns: true,
            skip_empty_lines: true,
            bom: true,
          }).map((r) => [
            r.route_id,
            {
              name: r.route_long_name || r.route_short_name,
              type: r.route_type,
            },
          ]),
        );
        const trips = Object.fromEntries(
          parse(strFromU8(files['trips.txt']), {
            columns: true,
            skip_empty_lines: true,
            bom: true,
          }).map((t) => [
            t.trip_id,
            {
              route: t.route_id,
              headsign: t.trip_headsign,
              shapeId: t.shape_id,
            },
          ]),
        );
        const stops = Object.fromEntries(
          parse(strFromU8(files['stops.txt']), {
            columns: true,
            skip_empty_lines: true,
            bom: true,
          }).map((s) => [s.stop_id, s.stop_name]),
        );
        const lastStops = new Map();
        const raw = files['stop_times.txt'];
        function* chunks() {
          for (let i = 0; i < raw.length; i += 65536)
            yield raw.subarray(i, i + 65536);
        }
        for await (const row of Readable.from(chunks()).pipe(
          parseStream({ columns: true, skip_empty_lines: true, bom: true }),
        )) {
          const seq = Number(row.stop_sequence);
          const prev = lastStops.get(row.trip_id);
          if (Number.isFinite(seq) && (!prev || seq > prev.seq))
            lastStops.set(row.trip_id, {
              seq,
              stop: row.stop_id,
              headsign: row.stop_headsign,
            });
        }
        for (const [id, trip] of Object.entries(trips)) {
          if (trip.headsign) {
            trip.destinationSource = 'headsign';
            continue;
          }
          const last = lastStops.get(id);
          trip.headsign = last?.headsign || stops[last?.stop] || null;
          trip.destinationSource = last?.headsign ? 'headsign' : 'last-stop';
        }
        await saveTransitShapes(operator, files['shapes.txt']);
        metadata = { version: 2, at: Date.now(), routes, trips };
        await mkdir(new URL('../../.gev-cache/', import.meta.url), {
          recursive: true,
        });
        await writeFile(cacheFile, JSON.stringify(metadata));
      } catch {}
      return metadata;
    })().finally(() => {
      metadataPending = null;
    });
    return metadataPending;
  }
  return {
    name: 'local-transit-' + operator,
    configureServer(server) {
      server.middlewares.use(
        operator === 'sl' ? '/api/sl/route' : `/api/regional-route/${operator}`,
        async (req, res) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          const reply = (code, p) => {
            res.statusCode = code;
            res.end(JSON.stringify(p));
          };
          if (req.method !== 'GET')
            return reply(405, { error: 'GET required' });
          const tripId = new URL(req.url, 'http://localhost').searchParams.get(
            'trip',
          );
          if (!tripId || tripId.length > 160)
            return reply(400, { error: 'Ogiltig tur' });
          try {
            const meta = await getMetadata();
            const trip = meta?.trips?.[tripId];
            if (!trip?.shapeId || !/^[\w-]{1,120}$/.test(trip.shapeId))
              return reply(404, {
                error: 'Ingen färdväg finns för denna tur.',
              });
            const coordinates = JSON.parse(
              await readFile(
                new URL(
                  `../../.gev-cache/${operator}-shapes/${trip.shapeId}.json`,
                  import.meta.url,
                ),
                'utf8',
              ),
            );
            return reply(200, {
              coordinates,
              shapeId: trip.shapeId,
              line: meta.routes[trip.route]?.name || null,
              planned: true,
            });
          } catch {
            return reply(404, {
              error: 'Färdvägen kunde inte läsas från linjeregistret.',
            });
          }
        },
      );
      server.middlewares.use(route, async (req, res) => {
        const reply = (code, p) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(p));
        };
        if (req.method !== 'GET') return reply(405, { error: 'GET required' });
        if (!process.env.TRAFIKLAB_REALTIME_KEY)
          return reply(503, {
            error:
              'SL kräver en GTFS Regional Realtime-nyckel från Trafiklab. Se SL-INSTALLATION.md i programmappen.',
          });
        try {
          if (!cache || Date.now() - cache.at > 120000) {
            pending ??= (async () => {
              const [data, meta] = await Promise.all([
                bytes(
                  `https://opendata.samtrafiken.se/gtfs-rt/${operator}/VehiclePositions.pb?key=` +
                    encodeURIComponent(process.env.TRAFIKLAB_REALTIME_KEY),
                  8000000,
                ),
                getMetadata(),
              ]);
              const decoded = decodeVehiclePositions(data);
              cache = { at: Date.now(), decoded, metadata: !!meta };
            })().finally(() => {
              pending = null;
            });
            await pending;
          }
          reply(200, {
            vehicles: enrichSl(cache.decoded, metadata),
            feedTime: cache.decoded.timestamp,
            fetchedAt: new Date(cache.at).toISOString(),
            metadataAvailable: cache.metadata,
          });
        } catch {
          reply(502, {
            error:
              'SL-positionerna kunde inte hämtas. Kontrollera Trafiklab-nyckel och återstående kvot.',
          });
        }
      });
    },
  };
}
