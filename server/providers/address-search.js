import { token } from './vasttrafik.js';
import { distanceKm } from './local-ai-data.js';
import { readResponseTextCapped } from '../../src/sources/httpBody.js';

const sources = {
  vt: {
    name: 'Västtrafik platsregister',
    url: 'https://developer.vasttrafik.se/',
  },
  osm: {
    name: 'Photon · © OpenStreetMap contributors',
    url: 'https://www.openstreetmap.org/copyright',
  },
};
const norm = (text) =>
  String(text)
    .normalize('NFC')
    .toLocaleLowerCase('sv')
    .replace(/(\d)\s+([a-z])\b/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
export const validSearchPoint = (p) =>
  p &&
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lon) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lon) <= 180;
export function cleanPlaceQuery(query) {
  return String(query)
    .trim()
    .replace(/^(?:ungefär(?:\s+(?:vid|på))?|i närheten av|nära)\s+/i, '')
    .replace(/\s+i\s+/i, ', ');
}
function row(name, lat, lon, kind, source, house = '') {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    !validSearchPoint({ lat, lon })
  )
    return null;
  return {
    id: `coord:${lat}:${lon}`,
    gid: `coord:${lat}:${lon}`,
    name: name.slice(0, 250),
    lat,
    lon,
    kind,
    precision:
      kind === 'street' ? 'street' : kind === 'address' ? 'address' : 'place',
    house: norm(house),
    source: { ...source },
  };
}
export function normalizeSearchRows(vt, photon) {
  const rows = [];
  for (const x of vt?.results || []) {
    const head = x.name?.split(',')[0] || '';
    const house = head.match(/\s(\d+\s*[a-z]?)$/i)?.[1] || '';
    const kind =
      x.locationType === 'stoparea' || x.locationType === 'stoppoint'
        ? 'stop'
        : x.locationType === 'address'
          ? house
            ? 'address'
            : 'street'
          : 'place';
    const r = row(x.name, x.latitude, x.longitude, kind, sources.vt, house);
    if (r) rows.push(r);
  }
  for (const x of photon?.features || []) {
    if (x.geometry?.type !== 'Point') continue;
    const p = x.properties || {},
      [lon, lat] = x.geometry.coordinates || [];
    const address = p.street
      ? p.street + (p.housenumber ? ' ' + p.housenumber : '')
      : p.name;
    const parts = [
      ...new Set(
        [
          p.name && p.name !== p.street ? p.name : null,
          address,
          p.postcode,
          p.city || p.town || p.village || p.district,
          p.state,
          p.country,
        ].filter(Boolean),
      ),
    ];
    const kind = p.housenumber
      ? 'address'
      : p.type === 'street' || p.osm_key === 'highway'
        ? 'street'
        : p.osm_key === 'public_transport' || p.osm_value === 'bus_stop'
          ? 'stop'
          : p.osm_key === 'place' &&
              ['city', 'town', 'village', 'hamlet'].includes(p.osm_value)
            ? 'city'
            : 'place';
    const r = row(parts.join(', '), lat, lon, kind, sources.osm, p.housenumber);
    if (r) rows.push(r);
  }
  return rows;
}
export function rankSearchRows(rows, query, area) {
  const q = norm(cleanPlaceQuery(query)),
    head = q.split(',')[0];
  const requestedHouse = head.match(/\s(\d+\s*[a-z]?)(?=\s|$)/i)?.[1];
  const terms = q.split(/[ ,]+/).filter(Boolean);
  const unique = [];
  for (const r of rows) {
    if (
      requestedHouse &&
      (r.kind === 'address' || r.kind === 'street') &&
      r.house !== norm(requestedHouse)
    )
      continue;
    if (
      unique.some(
        (u) =>
          norm(u.name) === norm(r.name) &&
          distanceKm(u, r) <
            (u.kind === 'street' && r.kind === 'street' ? 2 : 0.05),
      )
    )
      continue;
    const label = norm(r.name),
      first = label.split(',')[0];
    const matches = terms.filter((t) => label.includes(t)).length;
    if (matches < Math.max(1, terms.length * 0.65)) continue;
    // Every entered word must occur before one result may be used automatically.
    const exact = first === head && matches === terms.length;
    unique.push({
      ...r,
      exact,
      matchScore: matches / Math.max(1, terms.length),
      distanceKm: validSearchPoint(area) ? distanceKm(area, r) : null,
    });
  }
  return unique
    .sort(
      (a, b) =>
        b.matchScore - a.matchScore ||
        Number(b.exact) - Number(a.exact) ||
        (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
    )
    .slice(0, 10);
}
export function createAddressSearch({
  fetchImpl = fetch,
  getToken = token,
  now = Date.now,
  wait = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  const cache = new Map(),
    pending = new Map();
  let calls = [],
    active = 0,
    lastPhoton = -Infinity;
  async function search(query, { area } = {}) {
    if (
      typeof query !== 'string' ||
      query.trim().length < 3 ||
      query.length > 200
    )
      throw Object.assign(Error('Skriv minst tre tecken och högst 200.'), {
        status: 400,
      });
    if (area != null && !validSearchPoint(area))
      throw Object.assign(Error('Ogiltig kartposition.'), { status: 400 });
    const q = cleanPlaceQuery(query),
      key =
        norm(q) +
        '|' +
        (area ? area.lat.toFixed(2) + ',' + area.lon.toFixed(2) : '');
    const stamp = now(),
      hit = cache.get(key);
    if (hit && stamp - hit.at < 600000) return structuredClone(hit.data);
    if (pending.has(key)) return structuredClone(await pending.get(key));
    calls = calls.filter((t) => stamp - t < 60000);
    if (calls.length >= 30 || active >= 2)
      throw Object.assign(
        Error('Sökningen är tillfälligt upptagen. Försök igen om en stund.'),
        { status: 429 },
      );
    active++;
    calls.push(stamp);
    const task = (async () => {
      const json = async (url, headers) => {
        const r = await fetchImpl(url, {
          headers,
          signal: AbortSignal.timeout(5000),
          redirect: 'error',
        });
        if (!r.ok) throw Error('source');
        return JSON.parse(await readResponseTextCapped(r, 1024 * 1024));
      };
      const vt = async () => {
        const d = await json(
          'https://ext-api.vasttrafik.se/pr/v4/locations/by-text?' +
            new URLSearchParams({ q, limit: '20' }),
          { Authorization: 'Bearer ' + (await getToken()) },
        );
        if (!Array.isArray(d.results)) throw Error('schema');
        return d;
      };
      const photon = async () => {
        const delay = Math.max(0, lastPhoton + 1000 - now());
        if (delay > 2000) throw Error('busy');
        lastPhoton = now() + delay;
        await wait(delay);
        const p = new URLSearchParams({ q, limit: '10' });
        if (area) {
          p.set('lat', String(area.lat));
          p.set('lon', String(area.lon));
        }
        const d = await json('https://photon.komoot.io/api/?' + p);
        if (!Array.isArray(d.features)) throw Error('schema');
        return d;
      };
      const results = await Promise.allSettled([vt(), photon()]);
      if (results.every((r) => r.status === 'rejected'))
        throw Object.assign(
          Error('Platskällorna kunde inte hämtas. Försök igen senare.'),
          { status: 503 },
        );
      const data = {
        query: q,
        rows: rankSearchRows(
          normalizeSearchRows(results[0].value, results[1].value),
          q,
          area,
        ),
        partial: results.some((r) => r.status === 'rejected'),
        fetchedAt: new Date(stamp).toISOString(),
      };
      if (!data.partial) {
        cache.delete(key);
        cache.set(key, { at: stamp, data });
        while (cache.size > 64) cache.delete(cache.keys().next().value);
      }
      return data;
    })();
    pending.set(key, task);
    try {
      return structuredClone(await task);
    } finally {
      pending.delete(key);
      active--;
    }
  }
  return { search };
}
export const addressSearch = createAddressSearch();
export async function tripAddressCandidates(query) {
  const result = await addressSearch.search(query);
  return result.rows.filter((r) => r.matchScore === 1);
}
export function addressSearchPlugin() {
  const install = (server) => {
    server.middlewares.use('/api/address-search', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.end('{}');
        return;
      }
      try {
        const p = new URL(req.url, 'http://localhost').searchParams;
        const has = p.has('lat') || p.has('lon');
        const area = has
          ? { lat: Number(p.get('lat')), lon: Number(p.get('lon')) }
          : undefined;
        if (
          has &&
          (!p.has('lat') ||
            !p.has('lon') ||
            !p.get('lat')?.trim() ||
            !p.get('lon')?.trim())
        )
          throw Object.assign(Error('Ogiltig kartposition.'), { status: 400 });
        res.end(
          JSON.stringify(await addressSearch.search(p.get('q'), { area })),
        );
      } catch (e) {
        res.statusCode = e.status || 503;
        res.end(
          JSON.stringify({
            error: e.status ? e.message : 'Platskällorna kunde inte hämtas.',
          }),
        );
      }
    });
  };
  return {
    name: 'shared-address-search',
    configureServer: install,
    configurePreviewServer: install,
  };
}
