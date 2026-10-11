const FEED = 'https://www.gdacs.org/contentdata/xml/gdacsAPP_Home.geojson';
export function normalizeGdacs(payload) {
  if (payload?.type !== 'FeatureCollection' || !Array.isArray(payload.features))
    throw new Error('Oväntat GDACS-format.');
  const seen = new Set();
  return payload.features.slice(0, 3000).flatMap((feature) => {
    const p = feature.properties || {};
    if (feature.geometry?.type !== 'Point') return [];
    let coords = feature.geometry.coordinates;
    if (Array.isArray(coords?.[0])) coords = coords[0];
    if (
      !Array.isArray(coords) ||
      coords.length < 2 ||
      coords.some((v) => v == null || v === '')
    )
      return [];
    const lon = Number(coords[0]),
      lat = Number(coords[1]);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      return [];
    const id = `${p.eventtype}:${p.eventid}`;
    if (p.eventid == null || seen.has(id)) return [];
    seen.add(id);
    const url = new URL('https://www.gdacs.org/report.aspx');
    url.search = new URLSearchParams({
      eventtype: String(p.eventtype),
      eventid: String(p.eventid),
    }).toString();
    return [
      {
        id,
        lat,
        lon,
        title: String(p.title || 'GDACS').slice(0, 1500),
        time: String(p.fromdate || '').slice(0, 40),
        endTime: String(p.todate || '').slice(0, 40),
        alert: String(p.alertlevel || 'Unknown'),
        category: String(p.eventtype || ''),
        country: String(p.country || '').slice(0, 200),
        summary: String(p.description || '').slice(0, 2000),
        severity: String(p.severity ?? ''),
        unit: String(p.severityunit || ''),
        link: url.href,
      },
    ];
  });
}
export function gdacsPlugin() {
  let cache, pending;
  return {
    name: 'local-gdacs',
    configureServer(server) {
      server.middlewares.use('/api/gdacs/events', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        const reply = (code, value) => {
          res.statusCode = code;
          res.end(JSON.stringify(value));
        };
        if (req.method !== 'GET') return reply(405, { error: 'GET required' });
        try {
          if (!cache || Date.now() - cache.at > 900000) {
            pending ??= (async () => {
              const response = await fetch(FEED, {
                signal: AbortSignal.timeout(20000),
              });
              if (!response.ok) throw new Error('GDACS unavailable');
              const raw = await response.text();
              if (raw.length > 8000000)
                throw new Error('GDACS response too large');
              cache = {
                at: Date.now(),
                events: normalizeGdacs(JSON.parse(raw)),
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
              'GDACS kunde inte hämtas. Tidigare markörer kan vara inaktuella.',
          });
        }
      });
    },
  };
}
