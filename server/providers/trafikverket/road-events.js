import { getTrafikverketClient } from './client.js';
import { selectRoadEvents } from './road-model.js';
export async function roadEvents(
  box,
  { getClient = getTrafikverketClient, now = Date.now } = {},
) {
  if (
    !Array.isArray(box) ||
    box.length !== 4 ||
    box.some((x) => !Number.isFinite(x)) ||
    box[0] >= box[2] ||
    box[1] >= box[3] ||
    box[0] < -180 ||
    box[2] > 180 ||
    box[1] < -90 ||
    box[3] > 90 ||
    box[2] - box[0] > 30 ||
    box[3] - box[1] > 20
  )
    throw Error('Ogiltigt kartområde');
  const snapshots = await Promise.all(
    ['roadworks', 'accident', 'trafficmessage'].map((feed) =>
      getClient().query({ type: 'Datex-' + feed }),
    ),
  );
  const usable = snapshots.filter((s) => Array.isArray(s.rows));
  const selected = selectRoadEvents(
    usable.flatMap((s) => s.rows),
    box,
    now(),
  );
  return {
    ...selected,
    sources: snapshots.map((s) => s.metadata),
    partial: usable.length !== snapshots.length,
    stale: snapshots.some((s) => s.metadata.stale),
    available: usable.length > 0,
    checkedAt: new Date(now()).toISOString(),
    note: 'Urval inom kartområdet. Markerad punkt är källans visningspunkt, inte händelsens fulla utbredning. Återkommande delperioder utvärderas inte; giltighet är inte bekräftad aktivitet just nu. Ingen beräknad försening eller omruttning.',
  };
}
export function roadEventsPlugin() {
  const install = (server) => {
    server.middlewares.use('/api/road-events', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.end('{}');
        return;
      }
      try {
        const p = new URL(req.url, 'http://localhost').searchParams;
        if ([...p.keys()].some((k) => k !== 'bbox')) throw Error();
        const raw = p.get('bbox');
        if (!raw || raw.split(',').some((x) => !x.trim())) throw Error();
        res.end(JSON.stringify(await roadEvents(raw.split(',').map(Number))));
      } catch {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            error: 'Väghändelser kunde inte hämtas. Kontrollera kartområdet.',
          }),
        );
      }
    });
  };
  return {
    name: 'trafikverket-road-events',
    configureServer: install,
    configurePreviewServer: install,
  };
}
