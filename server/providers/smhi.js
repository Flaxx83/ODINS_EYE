const FEED =
  'https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json';
export function smhiPlugin() {
  let cache, pending;
  return {
    name: 'local-smhi-warnings',
    configureServer(server) {
      server.middlewares.use('/api/smhi/warnings', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        const reply = (code, body) => {
          res.statusCode = code;
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'GET') return reply(405, { error: 'GET required' });
        try {
          if (!cache || Date.now() - cache.at > 300000) {
            pending ??= (async () => {
              const response = await fetch(FEED, {
                signal: AbortSignal.timeout(15000),
              });
              if (!response.ok) throw new Error('SMHI unavailable');
              const raw = await response.text();
              if (raw.length > 8000000) throw new Error('Response too large');
              const warnings = JSON.parse(raw);
              if (!Array.isArray(warnings))
                throw new Error('Unexpected format');
              cache = { warnings, at: Date.now() };
            })().finally(() => {
              pending = null;
            });
            await pending;
          }
          reply(200, {
            warnings: cache.warnings,
            fetchedAt: new Date(cache.at).toISOString(),
          });
        } catch {
          reply(502, {
            error:
              'SMHI kunde inte hämtas. Kontrollera aktuella varningar på smhi.se.',
          });
        }
      });
    },
  };
}
