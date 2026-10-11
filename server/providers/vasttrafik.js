import { readFile, writeFile } from 'node:fs/promises';
const tokenFile = new URL(
  '../../.gev-cache/vasttrafik-token.json',
  import.meta.url,
);
let tokenState, tokenPending;
const cache = new Map();
export async function token() {
  if (!tokenState) {
    try {
      tokenState = JSON.parse(await readFile(tokenFile, 'utf8'));
    } catch {}
  }
  if (tokenState?.expires > Date.now()) return tokenState.token;
  tokenPending ??= (async () => {
    const id = process.env.VASTTRAFIK_CLIENT_ID,
      secret = process.env.VASTTRAFIK_CLIENT_SECRET;
    if (!id || !secret) throw new Error('Credentials missing');
    const r = await fetch('https://ext-api.vasttrafik.se/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' + Buffer.from(id + ':' + secret).toString('base64'),
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error('Authentication failed');
    const p = await r.json();
    if (!p.access_token || !Number.isFinite(p.expires_in))
      throw new Error('Invalid token');
    tokenState = {
      token: p.access_token,
      expires: Date.now() + p.expires_in * 1000,
    };
    await writeFile(tokenFile, JSON.stringify(tokenState));
    return p.access_token;
  })().finally(() => {
    tokenPending = null;
  });
  return tokenPending;
}
export function normalizeVasttrafik(rows) {
  if (!Array.isArray(rows)) throw new Error('Invalid positions');
  const seen = new Set();
  return rows.flatMap((r, i) => {
    if (
      !Number.isFinite(r.latitude) ||
      !Number.isFinite(r.longitude) ||
      Math.abs(r.latitude) > 90 ||
      Math.abs(r.longitude) > 180
    )
      return [];
    const id = r.detailsReference || 'unreferenced:' + i;
    if (seen.has(id)) return [];
    seen.add(id);
    return [
      {
        id,
        lat: r.latitude,
        lon: r.longitude,
        line: r.line?.name || r.name || '',
        direction: r.direction || '',
        mode: r.line?.transportMode || 'unknown',
        realtimeJourney: r.line?.isRealtimeJourney === true,
        color: /^#[\da-f]{6}$/i.test(r.line?.backgroundColor || '')
          ? r.line.backgroundColor
          : '#ffff50',
      },
    ];
  });
}
export function vasttrafikPlugin() {
  return {
    name: 'local-vasttrafik',
    configureServer(server) {
      server.middlewares.use('/api/vasttrafik/route', async (req, res) => {
        const reply = (code, p) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(p));
        };
        if (req.method !== 'GET') return reply(405, { error: 'GET required' });
        const reference = new URL(req.url, 'http://localhost').searchParams.get(
          'trip',
        );
        if (!reference || reference.length > 2000)
          return reply(400, { error: 'Ogiltig turreferens' });
        const key = 'route:' + reference;
        try {
          let entry = cache.get(key);
          if (!entry || Date.now() - entry.at > 600000) {
            entry = {
              at: Date.now(),
              promise: (async () => {
                const r = await fetch(
                  'https://ext-api.vasttrafik.se/pr/v4/journeys/' +
                    encodeURIComponent(reference) +
                    '/details?includes=servicejourneycoordinates&includes=servicejourneycalls',
                  {
                    headers: { Authorization: 'Bearer ' + (await token()) },
                    signal: AbortSignal.timeout(20000),
                  },
                );
                if (!r.ok) throw new Error('Route unavailable');
                const p = await r.json();
                const journeys = (p.tripLegs || []).flatMap(
                  (l) => l.serviceJourneys || [],
                );
                const journey = journeys.find(
                  (j) => j.serviceJourneyCoordinates?.length > 1,
                );
                if (!journey) throw new Error('Coordinates unavailable');
                const coordinates = journey.serviceJourneyCoordinates
                  .filter(
                    (c) =>
                      Number.isFinite(c.longitude) &&
                      Number.isFinite(c.latitude),
                  )
                  .map((c) => [c.longitude, c.latitude]);
                const stops = (journey.callsOnServiceJourney || []).flatMap(
                  (call) => {
                    const stop = call.stopPoint;
                    if (
                      !Number.isFinite(stop?.latitude) ||
                      !Number.isFinite(stop?.longitude)
                    )
                      return [];
                    return [
                      {
                        id: stop.gid,
                        name: stop.name,
                        lat: stop.latitude,
                        lon: stop.longitude,
                        platform:
                          call.estimatedPlatform ||
                          call.plannedPlatform ||
                          stop.platform ||
                          '',
                      },
                    ];
                  },
                );
                return { coordinates, stops, planned: true };
              })(),
            };
            cache.set(key, entry);
            entry.promise.catch(() => cache.delete(key));
          }
          reply(200, await entry.promise);
        } catch {
          reply(502, { error: 'Färdvägen kunde inte hämtas för denna tur.' });
        }
      });
      server.middlewares.use('/api/vasttrafik/positions', async (req, res) => {
        const reply = (code, p) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(p));
        };
        if (req.method !== 'GET') return reply(405, { error: 'GET required' });
        const u = new URL(req.url, 'http://localhost'),
          lat = Number(u.searchParams.get('lat')),
          lon = Number(u.searchParams.get('lon'));
        if (
          !u.searchParams.has('lat') ||
          !u.searchParams.has('lon') ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lon) ||
          lat < 55 ||
          lat > 61 ||
          lon < 10 ||
          lon > 16
        )
          return reply(400, { error: 'Navigera till Västtrafiks område.' });
        const key = lat.toFixed(2) + ':' + lon.toFixed(2);
        try {
          let entry = cache.get(key);
          if (!entry || Date.now() - entry.at > 60000) {
            entry = {
              at: Date.now(),
              promise: (async () => {
                const params = new URLSearchParams({
                  lowerLeftLat: String(lat - 0.15),
                  lowerLeftLong: String(lon - 0.25),
                  upperRightLat: String(lat + 0.15),
                  upperRightLong: String(lon + 0.25),
                  limit: '200',
                });
                const r = await fetch(
                  'https://ext-api.vasttrafik.se/pr/v4/positions?' + params,
                  {
                    headers: { Authorization: 'Bearer ' + (await token()) },
                    signal: AbortSignal.timeout(20000),
                  },
                );
                if (!r.ok) throw new Error('Positions unavailable');
                const rows = await r.json();
                return {
                  positions: normalizeVasttrafik(rows),
                  fetchedAt: new Date().toISOString(),
                  limitReached: rows.length >= 200,
                };
              })(),
            };
            cache.set(key, entry);
            entry.promise.catch(() => cache.delete(key));
          }
          if (cache.size > 40) cache.delete(cache.keys().next().value);
          reply(200, await entry.promise);
        } catch {
          reply(502, {
            error:
              'Västtrafiks positioner kunde inte hämtas. Kontrollera API-behörighet eller försök igen.',
          });
        }
      });
    },
  };
}
