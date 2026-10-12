import { recordTrafiklabRequest } from './trafiklab-budget.js';
export function createTimetableLoader({
  fetchImpl = fetch,
  recordRequest = recordTrafiklabRequest,
  getKey = () => process.env.TRAFIKLAB_TIMETABLE_KEY,
  now = Date.now,
} = {}) {
  const cache = new Map();
  return async function load(path, ttl) {
    let e = cache.get(path);
    if (!e || now() - e.at > ttl) {
      e = {
        at: now(),
        promise: (async () => {
          await recordRequest('timetable');
          const key = getKey();
          if (!key) throw new Error('API key missing');
          const r = await fetchImpl(
            `https://realtime-api.trafiklab.se/v1/${path}?key=${encodeURIComponent(key)}`,
            { signal: AbortSignal.timeout(20000), redirect: 'error' },
          );
          if (!r.ok) throw new Error('Trafiklab unavailable');
          const payload = await r.json();
          return path.startsWith('departures/')
            ? { ...payload, gev: { fetchedAt: new Date(now()).toISOString() } }
            : payload;
        })(),
      };
      cache.set(path, e);
      e.promise.catch(() => cache.delete(path));
    }
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return e.promise;
  };
}
const load = createTimetableLoader();
export function timetablePlugin() {
  return {
    name: 'trafiklab-timetables',
    configureServer(server) {
      server.middlewares.use('/api/timetable', async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const reply = (code, p) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(p));
        };
        if (req.method !== 'GET') return reply(405, { error: 'GET required' });
        try {
          if (url.pathname === '/stops') {
            const p = await load('stops/list', 86400000);
            if (!Array.isArray(p.stop_groups)) throw new Error('Format');
            return reply(200, p);
          }
          if (url.pathname === '/departures') {
            const id = url.searchParams.get('id');
            if (!/^\d{1,15}$/.test(id || ''))
              return reply(400, { error: 'Ogiltig hållplats' });
            return reply(200, await load('departures/' + id, 60000));
          }
          reply(404, { error: 'Unknown route' });
        } catch {
          reply(502, {
            error:
              'Avgångsdata kunde inte hämtas. Kontrollera Trafiklab-nyckel eller anropskvot.',
          });
        }
      });
    },
  };
}
