import { readFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { projectRoot, runPython } from './python-runtime.js';
import { admitSameSite } from './common/same-site.js';

const failure = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export const CORE = [13.75, 58.34, 13.98, 58.46];
const inside = (lon, lat, bbox) =>
  lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
export function validateReachability(value, coverage = CORE) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== 'object' ||
    Object.keys(value).some(
      (k) => !['lat', 'lon', 'minutes', 'speed', 'mode'].includes(k),
    )
  )
    throw failure('Ogiltig förfrågan.');
  const mode = value.mode === undefined ? 'walk' : value.mode;
  if (!['walk', 'bicycle', 'car', 'scooter'].includes(mode))
    throw failure('Välj gång, cykel, bil eller elsparkcykel.');
  if (
    ![value.lat, value.lon, value.speed].every(
      (v) => typeof v === 'number' && Number.isFinite(v),
    ) ||
    value.speed < { walk: 0.5, bicycle: 5, car: 10, scooter: 5 }[mode] ||
    value.speed > { walk: 8, bicycle: 35, car: 120, scooter: 20 }[mode] ||
    !inside(value.lon, value.lat, coverage)
  )
    throw failure(
      'Kontrollera täckningsområdet och hastigheten: gång 0,5–8, cykel 5–35, bilens hastighetstak 10–120, elsparkcykel 5–20 km/h.',
    );
  if (
    !Array.isArray(value.minutes) ||
    value.minutes.length < 1 ||
    value.minutes.length > 3 ||
    value.minutes.some((v) => !Number.isInteger(v) || v < 1 || v > 30) ||
    new Set(value.minutes).size !== value.minutes.length
  )
    throw failure('Ange 1–3 olika tidsgränser mellan 1 och 30 minuter.');
  return {
    mode,
    lat: value.lat,
    lon: value.lon,
    speed: value.speed,
    minutes: [...value.minutes].sort((a, b) => a - b),
  };
}
export function validateContours(data, minutes, bbox) {
  if (
    data?.type !== 'FeatureCollection' ||
    !Array.isArray(data.features) ||
    data.features.length !== minutes.length
  )
    throw failure('Motorn gav inga fullständiga räckviddsytor.', 502);
  const seen = new Set();
  let count = 0;
  for (const feature of data.features) {
    const time = feature?.properties?.contour;
    if (!minutes.includes(time) || seen.has(time))
      throw failure('Ogiltiga tidsytor.', 502);
    seen.add(time);
    const g = feature.geometry;
    const polygons =
      g?.type === 'Polygon'
        ? [g.coordinates]
        : g?.type === 'MultiPolygon'
          ? g.coordinates
          : null;
    if (!Array.isArray(polygons) || !polygons.length)
      throw failure('Ogiltig räckviddsgeometri.', 502);
    for (const polygon of polygons) {
      if (!Array.isArray(polygon) || !polygon.length)
        throw failure('Ogiltig polygon.', 502);
      for (const ring of polygon) {
        if (!Array.isArray(ring) || ring.length < 4)
          throw failure('Ogiltig polygonring.', 502);
        for (const p of ring) {
          if (
            ++count > 50000 ||
            !Array.isArray(p) ||
            p.length !== 2 ||
            !p.every(Number.isFinite) ||
            !inside(p[0], p[1], bbox)
          )
            throw failure(
              'Räckviddsytan når underlagets gräns eller har ogiltig geometri. Välj kortare tid.',
              422,
            );
        }
        if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])
          throw failure('Polygonringen är inte sluten.', 502);
      }
    }
  }
  return data;
}
export function createReachabilityService({
  run = runPython,
  directory = join(projectRoot, '.gev-cache/routing'),
} = {}) {
  let busy = false;
  let attempts = [];
  const cache = new Map();
  async function configuration() {
    try {
      const pointer = JSON.parse(
        await readFile(join(directory, 'active.json'), 'utf8'),
      );
      if (
        typeof pointer.version !== 'string' ||
        !/^[a-z0-9-]+$/.test(pointer.version)
      )
        throw Error('Invalid version');
      const folder = resolve(directory, pointer.version);
      if (relative(directory, folder).startsWith('..'))
        throw Error('Invalid path');
      const manifest = JSON.parse(
        await readFile(join(folder, 'manifest.json'), 'utf8'),
      );
      if (
        !Array.isArray(manifest.bbox) ||
        manifest.bbox.length !== 4 ||
        !manifest.bbox.every(Number.isFinite)
      )
        throw Error('Invalid coverage');
      const coverage = manifest.coverage || CORE;
      if (
        !Array.isArray(coverage) ||
        coverage.length !== 4 ||
        !coverage.every(Number.isFinite) ||
        coverage[0] >= coverage[2] ||
        coverage[1] >= coverage[3] ||
        !inside(coverage[0], coverage[1], manifest.bbox) ||
        !inside(coverage[2], coverage[3], manifest.bbox)
      )
        throw Error('Invalid start coverage');
      return { folder, manifest, coverage, version: pointer.version };
    } catch {
      throw failure(
        'Lokal routingdata saknas. Bygg och aktivera underlaget enligt docs/ODINS_REACHABILITY.md.',
        503,
      );
    }
  }
  const info = (c) => ({
    engine: 'Valhalla',
    engineVersion: c.manifest.engineVersion,
    dataTime: c.manifest.dataTime,
    attribution: '© OpenStreetMap contributors · ODbL',
    coverage: c.coverage,
    coverageName: c.manifest.coverageName || 'Skövdeområdet',
    boundaryNote: c.manifest.boundaryNote || null,
    version: c.version,
    model:
      'Beräknad gångyta längs OSM-nätet. Konturer interpoleras och kan täcka vatten eller hinder mellan vägar. Hastighet är ett antagande; pauser och individuell förmåga ingår inte.',
  });
  return {
    async status() {
      return {
        available: true,
        modes: ['walk', 'bicycle', 'car', 'scooter'],
        ...info(await configuration()),
      };
    },
    async calculate(value) {
      const config = await configuration();
      const query = validateReachability(value, config.coverage);
      const key = JSON.stringify([config.version, query]);
      const old = cache.get(key);
      if (old && Date.now() - old.at < 600000) return old.value;
      if (busy)
        throw failure('En beräkning pågår. Försök igen om en stund.', 429);
      attempts = attempts.filter((at) => Date.now() - at < 60000);
      if (attempts.length >= 10)
        throw failure(
          'Beräkningsbudgeten är slut för denna minut. Vänta en stund.',
          429,
        );
      attempts.push(Date.now());
      busy = true;
      try {
        let stdout;
        try {
          ({ stdout } = await run(
            [
              join(projectRoot, 'server/providers/reachability-query.py'),
              join(config.folder, 'valhalla.json'),
              JSON.stringify(query),
            ],
            { timeout: 30000, maxBuffer: 3000000 },
          ));
        } catch {
          throw failure(
            'Räckvidden kunde inte beräknas. Välj start nära en tillåten väg för färdsättet (högst 100 m), eller kontrollera routingunderlaget och requirements-routing.txt.',
            502,
          );
        }
        let geometry;
        try {
          geometry = JSON.parse(stdout);
        } catch {
          throw failure('Ogiltigt svar från routingmotorn.', 502);
        }
        validateContours(geometry, query.minutes, config.manifest.bbox);
        const value = {
          ...info(config),
          mode: query.mode,
          model:
            query.mode === 'car'
              ? 'Beräknad bilyta för personbil med vägnätets hastigheter och valt hastighetstak. OSM-tillträde, enkelriktning och svängrestriktioner används. Köer, aktuella avstängningar, parkering och tidsberoende regler ingår inte. Interpolerade ytor kan täcka vatten/hinder.'
              : query.mode === 'scooter'
                ? 'Uppskattning för elsparkcykel på cykelnätet, med stadscykelmodell och undvikande av dåliga underlag. Avser cykelklassad elsparkcykel, högst 20 km/h och 250 W. Lokala elsparkcykelförbud, batteri, höjd, väder och pauser ingår inte. Interpolerade ytor kan täcka vatten/hinder.'
                : query.mode === 'bicycle'
                  ? 'Beräknad cykelyta, stadscykel. Hastigheten gäller jämnt plant underlag; vägtyp och underlag påverkar modellen. Höjddata, trafik, väder och pauser ingår inte. Interpolerade ytor kan täcka vatten/hinder.'
                  : info(config).model,
          origin: { lat: query.lat, lon: query.lon },
          networkOrigin: geometry.networkOrigin,
          speed: query.speed,
          minutes: query.minutes,
          geometry,
        };
        cache.set(key, { at: Date.now(), value });
        if (cache.size > 32) cache.delete(cache.keys().next().value);
        return value;
      } finally {
        busy = false;
      }
    },
  };
}
export function reachabilityPlugin() {
  const service = createReachabilityService();
  const install = (server) => {
    server.middlewares.use(async (req, res, next) => {
      if (req.url?.split('?')[0] !== '/api/reachability') return next();
      if (admitSameSite(req, res)) return;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      try {
        let result;
        if (req.method === 'GET') result = await service.status();
        else if (req.method === 'POST') {
          if (!req.headers['content-type']?.startsWith('application/json'))
            throw failure('Använd JSON.', 415);
          const chunks = [];
          let length = 0;
          for await (const chunk of req) {
            length += chunk.length;
            if (length > 16384) throw failure('För stor förfrågan.', 413);
            chunks.push(chunk);
          }
          let body;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            throw failure('Ogiltig JSON.');
          }
          result = await service.calculate(body);
        } else throw failure('Metoden stöds inte.', 405);
        res.end(JSON.stringify(result));
      } catch (error) {
        res.statusCode = error.status || 500;
        res.end(
          JSON.stringify({
            error: error.status ? error.message : 'Beräkningen misslyckades.',
          }),
        );
      }
    });
  };
  return {
    name: 'local-reachability',
    configureServer: install,
    configurePreviewServer: install,
  };
}
