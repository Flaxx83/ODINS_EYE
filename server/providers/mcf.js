const services = { flood: 'oversvamning', fire: 'brandrisk' };
export function mcfPlugin() {
  return {
    name: 'local-mcf-wms',
    configureServer(server) {
      server.middlewares.use('/api/mcf/wms', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          return res.end();
        }
        const input = new URL(req.url, 'http://localhost');
        const service = services[input.searchParams.get('dataset')];
        if (!service) {
          res.statusCode = 400;
          return res.end();
        }
        const target = new URL(`https://inspire.mcf.se/${service}/wms`);
        for (const [key, value] of input.searchParams)
          if (key !== 'dataset') target.searchParams.set(key, value);
        try {
          const response = await fetch(target, {
            signal: AbortSignal.timeout(20000),
          });
          res.statusCode = response.status;
          res.setHeader(
            'Content-Type',
            response.headers.get('content-type') || 'application/octet-stream',
          );
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          res.statusCode = 502;
          res.end('MCF karttjänst kunde inte hämtas');
        }
      });
    },
  };
}
