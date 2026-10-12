import { distanceKm } from './local-ai-data.js';
import { stat } from 'node:fs/promises';
import { geometryWarning } from './geometry-availability.js';
import { runPython } from './python-runtime.js';
import { fileURLToPath } from 'node:url';
const graphFile = new URL('../../.gev-cache/rail-network.pkl', import.meta.url);
const train = (leg) =>
  leg.Product?.some((p) => /tåg/i.test(p.name || '')) &&
  !leg.Product?.some((p) => /tunnelbana/i.test(p.name || ''));
const coordinate = (value) =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every(Number.isFinite) &&
  Math.abs(value[0]) <= 180 &&
  Math.abs(value[1]) <= 90;
const numeric = (value) =>
  (typeof value === 'number' || (typeof value === 'string' && value.trim())) &&
  Number.isFinite(Number(value));
export const railGeometryMessage = (code) =>
  ({
    graph_unavailable:
      'Järnvägsgraf saknas. Importera järnvägsnätet enligt installationsanvisningarna.',
    graph_invalid:
      'Järnvägsgrafen kan inte användas. Kontrollera eller importera om nätet.',
    invalid_points:
      'Stationskoordinater saknas eller är ogiltiga. En spårväg kan inte beräknas säkert.',
    station_off_network:
      'En station ligger för långt från det tillgängliga spårnätet (högst 500 meter).',
    disconnected_network:
      'Ingen sammanhängande spårväg finns mellan stationerna i det tillgängliga underlaget.',
    detour_rejected:
      'Den tillgängliga nätvägen ger en för stor omväg och visas därför inte som resväg.',
    repeated_track:
      'Nätvägen går tillbaka över en längre spårsträcka. Tågets resväg kan inte fastställas säkert från underlaget.',
    zero_length:
      'Ingen användbar spårsträcka kunde beräknas mellan stationerna.',
    invalid_routing_result:
      'Ruttberäkningen gav ogiltig geometri. Resvägen visas inte.',
    routing_failed:
      'Spårruttningen kunde inte köras. Kontrollera Pythonmiljön och geodataberoendena.',
  })[code] || 'Spårväg saknas i det tillgängliga underlaget.';
const calculate = async (points) => {
  const { stdout } = await runPython(
    [
      fileURLToPath(new URL('./rail-routing/route.py', import.meta.url)),
      JSON.stringify(points),
    ],
    { timeout: 45000, windowsHide: true, maxBuffer: 8000000 },
  );
  return JSON.parse(stdout);
};
export function createRailResolver({
  getGraphStat = stat,
  calculateRoute = calculate,
  maxEntries = 32,
} = {}) {
  const cache = new Map();
  return async function resolve(trips, mapped) {
    if (!trips.some((t) => (t.LegList?.Leg || []).some(train))) return mapped;
    let version;
    try {
      const s = await getGraphStat(graphFile);
      version = s.mtimeMs + ':' + s.size;
    } catch {}
    for (const [i, trip] of trips.entries())
      for (const [j, leg] of (trip.LegList?.Leg || []).entries()) {
        if (!train(leg)) continue;
        const target =
          mapped[i]?.legs.find((l) => l.sourceLegIndex === j) ||
          mapped[i]?.legs[j];
        if (
          !target ||
          target.from !== leg.Origin?.name ||
          target.to !== leg.Destination?.name
        )
          continue;
        if (
          !target.approximate &&
          !target.geometrySource?.startsWith('SJ GTFS') &&
          !target.calculated
        )
          continue;
        target.approximate = true;
        target.calculated = false;
        const fail = (code, details = {}) => {
          const context = details.station
            ? ' Berörd del: ' +
              details.station +
              (details.nextStation ? ' → ' + details.nextStation : '') +
              '.'
            : '';
          target.geometryReason = {
            code,
            message: railGeometryMessage(code) + context,
            ...details,
          };
          delete target.geometryDiagnostics;
        };
        if (!version) {
          fail('graph_unavailable');
          geometryWarning(
            [mapped[i]],
            'Järnväg',
            target.geometryReason.message,
          );
          continue;
        }
        const stops = [leg.Origin, ...(leg.Stops?.Stop || []), leg.Destination];
        if (
          stops.some(
            (p) =>
              !p ||
              !numeric(p.lon) ||
              !numeric(p.lat) ||
              !coordinate([Number(p.lon), Number(p.lat)]),
          )
        ) {
          fail('invalid_points');
          continue;
        }
        const points = [];
        const names = [];
        for (const p of stops) {
          const point = [Number(p.lon), Number(p.lat)];
          if (JSON.stringify(point) !== JSON.stringify(points.at(-1))) {
            points.push(point);
            names.push(p.name);
          }
        }
        if (points.length < 2 || points.length > 64) {
          fail('invalid_points');
          continue;
        }
        const key = version + ':' + JSON.stringify(points);
        try {
          let promise = cache.get(key);
          if (!promise) {
            promise = Promise.resolve().then(() => calculateRoute(points));
            cache.set(key, promise);
            if (cache.size > maxEntries)
              cache.delete(cache.keys().next().value);
          } else {
            cache.delete(key);
            cache.set(key, promise);
          }
          let result;
          try {
            result = await promise;
          } catch (e) {
            if (cache.get(key) === promise) cache.delete(key);
            throw e;
          }
          if (result?.status === 'missing') {
            if (cache.get(key) === promise) cache.delete(key);
            const index = result.stationIndex ?? result.segmentIndex;
            fail(result.reason, {
              ...(Number.isInteger(index)
                ? {
                    station: names[index],
                    nextStation:
                      result.segmentIndex != null
                        ? names[index + 1]
                        : undefined,
                  }
                : {}),
              ...(Number.isFinite(result.limitMeters)
                ? { limitMeters: result.limitMeters }
                : {}),
            });
            continue;
          }
          if (
            result?.status !== 'ok' ||
            !Array.isArray(result.coordinates) ||
            result.coordinates.length < 2 ||
            !result.coordinates.every(coordinate) ||
            !Number.isFinite(result.distanceMeters) ||
            result.distanceMeters <= 0 ||
            !Array.isArray(result.snaps) ||
            result.snaps.length !== points.length ||
            result.snaps.some(
              (s, index) =>
                !Number.isFinite(s.distanceMeters) ||
                s.distanceMeters < 0 ||
                s.distanceMeters > 500 ||
                !coordinate(s.position) ||
                distanceKm(
                  { lon: points[index][0], lat: points[index][1] },
                  { lon: s.position[0], lat: s.position[1] },
                ) > 0.501 ||
                !result.coordinates.some(
                  (p) => p[0] === s.position[0] && p[1] === s.position[1],
                ),
            )
          ) {
            cache.delete(key);
            fail('invalid_routing_result');
            continue;
          }
          target.coordinates = result.coordinates.map((p) => [...p]);
          target.approximate = false;
          target.calculated = true;
          delete target.geometryReason;
          target.geometryDiagnostics = {
            graphVersion: version,
            distanceMeters: result.distanceMeters,
            snapRadiusMeters: 500,
            stations: result.snaps.map((s, index) => ({
              name: names[index],
              distanceMeters: s.distanceMeters,
              position: [...s.position],
            })),
            segments: structuredClone(result.segments),
          };
          target.geometrySource =
            'Beräknad spårväg i Lantmäteriets järnvägsnät via resans stationer; tågets faktiska spårval är inte bekräftat';
        } catch {
          fail('routing_failed');
          geometryWarning(
            [mapped[i]],
            'Järnväg',
            target.geometryReason.message,
          );
        }
      }
    return mapped;
  };
}
export const resolveRailNetwork = createRailResolver();
