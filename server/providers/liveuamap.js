export function normalizeEvents(payload) {
  if (!(
    payload?.success === true ||
    payload?.success === 1 ||
    payload?.success === '1'
  ))
    throw new Error(
      'Liveuamap avvisade anropet. Kontrollera API-nyckel och åtkomst.',
    );
  if (!Array.isArray(payload.venues))
    throw new Error('Oväntat Liveuamap-format.');
  return payload.venues.slice(0, 100).flatMap((row, index) => {
    if (
      row.lat == null ||
      row.lng == null ||
      String(row.lat).trim() === '' ||
      String(row.lng).trim() === ''
    )
      return [];
    const lat = Number(row.lat),
      lon = Number(row.lng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      return [];
    const safeUrl = (value) => {
      try {
        const u = new URL(value, 'https://liveuamap.com/');
        return ['https:', 'http:'].includes(u.protocol) ? u.href : null;
      } catch {
        return null;
      }
    };
    const timestamp = Number(row.timestamp);
    return [
      {
        id: String(row.id ?? index),
        lat,
        lon,
        title: String(row.name ?? 'Liveuamap').slice(0, 1500),
        time:
          Number.isFinite(timestamp) && timestamp > 0 && timestamp < 1e11
            ? new Date(timestamp * 1000).toISOString()
            : null,
        link: safeUrl(row.link),
        source: safeUrl(row.source),
      },
    ];
  });
}

export function liveuamapPlugin() {
  let cache = null,
    pending = null;
  return {
    name: 'local-liveuamap',
    configureServer(server) {
      server.middlewares.use('/api/liveuamap/events', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        const reply = (code, body) => {
          res.statusCode = code;
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'GET') return reply(405, { error: 'GET required' });
        if (
          !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
            req.socket.remoteAddress,
          )
        )
          return reply(403, { error: 'Local access only' });
        const key = process.env.LIVEUAMAP_API_KEY;
        if (!key)
          return reply(503, {
            error:
              'Liveuamap kräver API-nyckel. Följ LIVEUAMAP-INSTALLATION.md i programmappen.',
          });
        try {
          if (!cache || Date.now() - cache.at > 600000) {
            pending ??= (async () => {
              const region = process.env.LIVEUAMAP_REGION_ID || '0';
              if (!/^\d{1,4}$/.test(region))
                throw new Error('Ogiltigt region-ID.');
              const url = new URL('https://a.liveuamap.com/api');
              url.search = new URLSearchParams({
                a: 'mpts',
                resid: region,
                time: String(Math.floor(Date.now() / 1000)),
                count: '100',
                key,
              }).toString();
              const response = await fetch(url, {
                signal: AbortSignal.timeout(15000),
                redirect: 'error',
              });
              if (!response.ok) throw new Error('Liveuamaps API svarade inte.');
              const raw = await response.text();
              if (raw.length > 2000000) throw new Error('För stort API-svar.');
              cache = {
                at: Date.now(),
                events: normalizeEvents(JSON.parse(raw)),
              };
            })().finally(() => {
              pending = null;
            });
            await pending;
          }
          reply(200, {
            events: cache.events,
            fetchedAt: new Date(cache.at).toISOString(),
          });
        } catch {
          reply(502, {
            error:
              'Liveuamap kunde inte hämtas. Kontrollera nyckel, region och API-åtkomst.',
          });
        }
      });
    },
  };
}
