import { readFile, readdir } from 'node:fs/promises';
const root = new URL('../../.gev-cache/topography/', import.meta.url);
export function topographyPlugin() {
  const install = (server) => {
    server.middlewares.use('/api/topography', async (req, res) => {
      try {
        const q = new URL(req.url, 'http://localhost').searchParams;
        const theme = q.get('theme');
        const scale = q.get('scale');
        const box = (q.get('bbox') || '').split(',').map(Number);
        if (
          !['administrativindelning', 'kommunikation', 'hydrografi'].includes(
            theme,
          ) ||
          !['1m', '250', '100'].includes(scale) ||
          box.length !== 4 ||
          box.some((x) => !Number.isFinite(x)) ||
          box[0] > box[2] ||
          box[1] > box[3] ||
          box[2] - box[0] > 30 ||
          box[3] - box[1] > 25
        )
          throw Error('Ogiltigt område');
        try {
          const entries = await readdir(new URL(`${scale}/${theme}/`, root));
          if (
            !entries.some((n) => n.endsWith('.json') && n !== 'manifest.json')
          )
            throw Error();
        } catch {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error:
                'Topografidata saknas för ' +
                scale +
                '/' +
                theme +
                '. Kör npm run import:topography -- --scale ' +
                scale +
                ' --theme ' +
                theme +
                ' --zip <export.zip>. Se docs/ODINS_SETUP.md.',
            }),
          );
          return;
        }
        const rows = new Map();
        for (let x = Math.floor(box[0] / 2); x <= Math.floor(box[2] / 2); x++)
          for (
            let y = Math.floor(box[1] / 2);
            y <= Math.floor(box[3] / 2);
            y++
          ) {
            let features = [];
            try {
              features = JSON.parse(
                await readFile(
                  new URL(`${scale}/${theme}/${x}_${y}.json`, root),
                  'utf8',
                ),
              );
            } catch (e) {
              if (e.code !== 'ENOENT') throw e;
            }
            for (const f of features) {
              const b = f.bbox;
              if (
                b[0] <= box[2] &&
                b[2] >= box[0] &&
                b[1] <= box[3] &&
                b[3] >= box[1]
              )
                rows.set(f.id, f);
            }
          }
        const all = [...rows.values()];
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            type: 'FeatureCollection',
            features: all.slice(0, 12000),
            total: all.length,
            truncated: all.length > 12000,
            scale,
          }),
        );
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  };
  return {
    name: 'local-topography',
    configureServer: install,
    configurePreviewServer: install,
  };
}
