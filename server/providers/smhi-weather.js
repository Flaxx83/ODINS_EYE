import sharp from 'sharp';
import proj4 from 'proj4';
const projection = proj4(
  'EPSG:4326',
  '+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs',
);
const radarRoot =
  'https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp';
const cache = new Map();
async function cached(key, ttl, loader) {
  let entry = cache.get(key);
  if (!entry || Date.now() - entry.at > ttl) {
    entry = { at: Date.now(), promise: loader() };
    cache.set(key, entry);
    entry.promise.catch(() => cache.delete(key));
  }
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  return entry.promise;
}
async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('SMHI svarade inte');
  return r.json();
}
export async function observations() {
  const definitions = [
    [1, 'temperature', '°C'],
    [4, 'wind', 'm/s'],
    [3, 'direction', '°'],
    [7, 'rain', 'mm under senaste timmen'],
  ];
  const results = await Promise.allSettled(
    definitions.map(async ([id, key, unit]) => ({
      key,
      unit,
      data: await json(
        `https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/${id}/station-set/all/period/latest-hour/data.json`,
      ),
    })),
  );
  const stations = new Map(),
    missing = [];
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      missing.push(definitions[index][1]);
      return;
    }
    const { key, unit, data } = result.value;
    for (const station of data.station || []) {
      const value = station.value?.at(-1);
      if (!value || !Number.isFinite(Number(value.value))) continue;
      let row = stations.get(station.key);
      if (!row) {
        row = {
          id: station.key,
          name: station.name,
          lat: station.latitude,
          lon: station.longitude,
          values: {},
        };
        stations.set(station.key, row);
      }
      row.values[key] = {
        value: Number(value.value),
        time: value.date,
        quality: value.quality,
        unit,
      };
    }
  });
  if (!stations.size) throw new Error('Inga observationer kunde hämtas');
  return {
    stations: [...stations.values()],
    missing,
    fetchedAt: new Date().toISOString(),
  };
}
export async function forecast(lon, lat) {
  return json(
    `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${lon}/lat/${lat}/data.json?timeseries=48&parameters=air_temperature,wind_speed,wind_from_direction,wind_speed_of_gust,probability_of_precipitation`,
  );
}
export async function radar() {
  const index = await json(radarRoot + '.json');
  const latest = index.lastFiles?.find((file) =>
    file.formats?.some((format) => format.key === 'png'),
  );
  if (!latest) throw new Error('Ingen radarbild');
  const name = latest.key,
    timestamp = latest.valid.replace(' ', 'T') + ':00Z';
  const imageResponse = await fetch(radarRoot + '/latest.png', {
    signal: AbortSignal.timeout(20000),
  });
  if (!imageResponse.ok) throw new Error('Radarbild saknas');
  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Extent verified against the accompanying GeoTIFF, UTM zone 33 / GRS80.
  const bounds = [126648.404, 5983984.983, 1075693.7, 7771252.876];
  const border = [];
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    for (const xy of [
      [bounds[0] + t * (bounds[2] - bounds[0]), bounds[1]],
      [bounds[0] + t * (bounds[2] - bounds[0]), bounds[3]],
      [bounds[0], bounds[1] + t * (bounds[3] - bounds[1])],
      [bounds[2], bounds[1] + t * (bounds[3] - bounds[1])],
    ])
      border.push(projection.inverse(xy));
  }
  const bbox = [
    Math.min(...border.map((p) => p[0])),
    Math.min(...border.map((p) => p[1])),
    Math.max(...border.map((p) => p[0])),
    Math.max(...border.map((p) => p[1])),
  ];
  const width = 600,
    height = 1100,
    out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const lon = bbox[0] + ((x + 0.5) / width) * (bbox[2] - bbox[0]),
        lat = bbox[3] - ((y + 0.5) / height) * (bbox[3] - bbox[1]);
      const [east, north] = projection.forward([lon, lat]);
      const sx = Math.floor(
          ((east - bounds[0]) / (bounds[2] - bounds[0])) * info.width,
        ),
        sy = Math.floor(
          ((bounds[3] - north) / (bounds[3] - bounds[1])) * info.height,
        );
      if (sx < 0 || sy < 0 || sx >= info.width || sy >= info.height) continue;
      const at = (sy * info.width + sx) * 4;
      data.copy(out, (y * width + x) * 4, at, at + 4);
    }
  return {
    png: await sharp(out, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer(),
    bbox,
    timestamp,
    name,
  };
}
export function smhiWeatherPlugin() {
  return {
    name: 'smhi-weather',
    configureServer(server) {
      server.middlewares.use('/api/smhi/weather', async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const route = url.pathname;
        const reply = (code, body) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'GET') return reply(405, { error: 'GET required' });
        try {
          if (route === '/observations')
            return reply(
              200,
              await cached('observations', 600000, observations),
            );
          if (route === '/forecast') {
            const lat = Number(url.searchParams.get('lat')),
              lon = Number(url.searchParams.get('lon'));
            if (
              !url.searchParams.has('lat') ||
              !url.searchParams.has('lon') ||
              !Number.isFinite(lat) ||
              !Number.isFinite(lon) ||
              lat < 50 ||
              lat > 72 ||
              lon < 0 ||
              lon > 35
            )
              return reply(400, {
                error: 'Välj en plats i Sverige eller dess närområde.',
              });
            return reply(
              200,
              await cached(
                `forecast:${lon.toFixed(3)}:${lat.toFixed(3)}`,
                1800000,
                () => forecast(lon.toFixed(3), lat.toFixed(3)),
              ),
            );
          }
          if (route === '/radar' || route === '/radar.png') {
            const image = await cached('radar', 300000, radar);
            if (route.endsWith('.png')) {
              res.setHeader('Content-Type', 'image/png');
              res.setHeader('Cache-Control', 'public, max-age=60');
              return res.end(image.png);
            }
            return reply(200, {
              bbox: image.bbox,
              timestamp: image.timestamp,
              image: `/api/smhi/weather/radar.png?t=${encodeURIComponent(image.timestamp)}`,
            });
          }
          reply(404, { error: 'Unknown route' });
        } catch {
          reply(502, {
            error:
              'SMHI-data kunde inte hämtas. Försök igen eller kontrollera smhi.se.',
          });
        }
      });
    },
  };
}
