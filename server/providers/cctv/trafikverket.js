import { parseReportedTime } from '../trafikverket/models.js';
import { parsePointString } from './normalize.js';
import {
  createTrafikverketClient,
  getTrafikverketClient,
} from '../trafikverket/client.js';

const CAMERA_QUERY = {
  type: 'Camera',
  filter: {
    op: 'AND',
    filters: [
      { op: 'EQ', field: 'Active', value: true },
      { op: 'EQ', field: 'Deleted', value: false },
    ],
  },
};

/** Convert upstream records without exposing credentials or arbitrary image hosts. */
export function normalizeTrafikverketCamera(camera) {
  if (!camera?.Active || camera.Deleted || !camera.Id) return null;
  const { lat, lon } = parsePointString(camera.Geometry?.WGS84);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    return null;
  let image;
  try {
    image = new URL(camera.PhotoUrl);
  } catch {
    return null;
  }
  if (
    image.protocol !== 'https:' ||
    image.hostname !== 'api.trafikinfo.trafikverket.se' ||
    image.username ||
    image.password ||
    !image.pathname.startsWith('/v2/Images/')
  )
    return null;
  const heading = camera.Direction == null ? NaN : Number(camera.Direction);
  const hasHeading = Number.isFinite(heading) && heading >= 0 && heading < 360;
  const photoTime = parseReportedTime(camera.PhotoTime);
  return {
    id: `se-trafikverket-${camera.Id}`,
    name: String(camera.Name || camera.Id),
    city: 'Sverige',
    cityId: 'sweden',
    provider: 'Trafikverket',
    lat,
    lon,
    headingDeg: hasHeading ? heading : 0,
    headingConfidence: hasHeading ? 'high' : 'low',
    // Only position and direction are supplied. Projection dimensions are estimates.
    pitchDeg: -18,
    fovDeg: 44,
    rangeM: 145,
    mountHeightM: 8,
    feedType: 'image',
    url: image.href,
    snapshotUrl: image.href,
    sourceKind: 'trafikverket-open-data',
    license: 'Trafikverket öppna data',
    credit: String(camera.Type || 'Vägkamera'),
    photoTime: Number.isFinite(photoTime)
      ? new Date(photoTime).toISOString()
      : '',
  };
}

export async function loadTrafikverketSources({
  fetchImpl,
  apiKey,
  client,
} = {}) {
  try {
    const activeClient =
      client ||
      (fetchImpl || apiKey !== undefined
        ? createTrafikverketClient({
            fetchImpl: fetchImpl || fetch,
            getApiKey: () => apiKey ?? process.env.TRAFIKVERKET_API_KEY,
          })
        : getTrafikverketClient());
    const result = await activeClient.query(CAMERA_QUERY);
    return (result.rows || [])
      .map(normalizeTrafikverketCamera)
      .filter(Boolean)
      .map((camera) => ({
        ...camera,
        catalogFetchedAt: result.metadata.fetchedAt,
        catalogStale: result.metadata.stale,
        catalogRefreshFailed: result.metadata.refreshFailed,
        catalogComplete: result.metadata.complete,
      }));
  } catch {
    console.warn('[CCTV] Trafikverket camera catalog unavailable');
    return [];
  }
}
