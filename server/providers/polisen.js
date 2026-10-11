import { locatePoliceTown } from './police-towns.js';
export function normalizePoliceEvents(raw) {
  if (!Array.isArray(raw)) throw new Error('Oväntat format från Polisen');
  const seen = new Set();
  return raw
    .slice(0, 500)
    .flatMap((row) => {
      const id = String(row.id ?? '');
      if (!id || seen.has(id)) return [];
      seen.add(id);
      const parts = String(row.location?.gps || '')
        .split(',')
        .map((s) => Number(s.trim()));
      const valid =
        parts.length === 2 &&
        parts.every(Number.isFinite) &&
        Math.abs(parts[0]) <= 90 &&
        Math.abs(parts[1]) <= 180;
      const date = String(row.datetime || '').match(
        /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})\s*([+-]\d{2}:\d{2})$/,
      );
      const timestamp = date
        ? Date.parse(
            `${date[1]}T${date[2].padStart(2, '0')}:${date[3]}:${date[4]}${date[5]}`,
          )
        : null;
      let url = null;
      try {
        const u = new URL(row.url, 'https://polisen.se');
        if (u.protocol === 'https:' && u.hostname === 'polisen.se')
          url = u.href;
      } catch {}
      return [
        {
          id,
          title: String(row.name || ''),
          summary: String(row.summary || ''),
          type: String(row.type || ''),
          area: String(row.location?.name || 'Okänt område'),
          lat: valid ? parts[0] : null,
          lon: valid ? parts[1] : null,
          date: date?.[1] || '',
          timestamp: Number.isFinite(timestamp) ? timestamp : null,
          url,
        },
      ];
    })
    .map(locatePoliceTown);
}
export function policePlugin() {
  let cache,
    pending,
    lastAttempt = 0,
    permanent404 = false;
  return {
    name: 'local-polisen',
    configureServer(server) {
      server.middlewares.use('/api/polisen/events', async (req, res) => {
        const reply = (code, p) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(p));
        };
        if (req.method !== 'GET') return reply(405, { error: 'GET required' });
        try {
          if (permanent404)
            throw new Error(
              'Polisens API svarade 404. Automatisk hämtning är stoppad.',
            );
          if (!cache || Date.now() - cache.at > 300000) {
            if (!pending) {
              if (Date.now() - lastAttempt < 60000)
                throw new Error(
                  'Polisen kunde inte hämtas. Vänta en minut innan nytt försök.',
                );
              lastAttempt = Date.now();
              pending = (async () => {
                const response = await fetch('https://polisen.se/api/events', {
                  headers: {
                    'User-Agent': 'GodsEyeView-Local/0.2.1',
                    Accept: 'application/json',
                  },
                  signal: AbortSignal.timeout(20000),
                  redirect: 'error',
                });
                if (response.status === 404) permanent404 = true;
                if (!response.ok)
                  throw new Error('Polisens händelser kunde inte hämtas.');
                const raw = await response.text();
                if (raw.length > 4000000) throw new Error('För stort svar');
                cache = {
                  at: Date.now(),
                  events: normalizePoliceEvents(JSON.parse(raw)),
                };
              })().finally(() => {
                pending = null;
              });
            }
            await pending;
          }
          reply(200, {
            events: cache.events,
            fetchedAt: new Date(cache.at).toISOString(),
          });
        } catch (e) {
          reply(502, { error: e.message });
        }
      });
    },
  };
}
