import { escapeXml, parsePointString } from './normalize.js';

const API_URL = 'https://api.trafikinfo.trafikverket.se/v2/data.json';

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
  const photoTime = Date.parse(camera.PhotoTime);
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
  fetchImpl = fetch,
  apiKey = process.env.TRAFIKVERKET_API_KEY,
} = {}) {
  if (!apiKey) return [];
  try {
    const response = await fetchImpl(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: `<REQUEST><LOGIN authenticationkey="${escapeXml(apiKey)}"/><QUERY objecttype="Camera" schemaversion="1"><FILTER><AND><EQ name="Active" value="true"/><EQ name="Deleted" value="false"/></AND></FILTER></QUERY></REQUEST>`,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('upstream');
    const data = await response.json();
    const result = data.RESPONSE?.RESULT?.[0];
    if (!Array.isArray(result?.Camera)) throw new Error('invalid catalog');
    return result.Camera.map(normalizeTrafikverketCamera).filter(Boolean);
  } catch {
    // Never log the request, credential or upstream error payload.
    console.warn('[CCTV] Trafikverket camera catalog unavailable');
    return [];
  }
}
