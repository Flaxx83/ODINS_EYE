import { recordTrafiklabRequest } from './trafiklab-budget.js';
const cache = new Map();
async function load(path, ttl) {
  let e = cache.get(path);
  if (!e || Date.now() - e.at > ttl) {
    e = {
      at: Date.now(),
      promise: (async () => {
        await recordTrafiklabRequest('timetable');
        const key = process.env.TRAFIKLAB_TIMETABLE_KEY;
        if (!key) throw new Error('API key missing');
        const r = await fetch(
          `https://realtime-api.trafiklab.se/v1/${path}?key=${encodeURIComponent(key)}`,
          { signal: AbortSignal.timeout(20000), redirect: 'error' },
        );
        if (!r.ok) throw new Error('Trafiklab unavailable');
        return r.json();
      })(),
    };
    cache.set(path, e);
    e.promise.catch(() => cache.delete(path));
  }
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return e.promise;
}
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
