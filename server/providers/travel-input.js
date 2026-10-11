import { token } from './vasttrafik.js';
export function parseTravelTime(message, now = new Date()) {
  const tomorrow = /i\s*morgon/i.test(message);
  const timePattern =
    /(?:kl\.?|klockan|vid)\s*(\d{1,2})(?:[:.](\d{2}))?(?:\s*-?\s*tiden)?(?=\s|[.!?]|$)/i;
  const match = message.match(timePattern);
  if (match && (Number(match[1]) > 23 || Number(match[2] || 0) > 59))
    throw Error('Ogiltig tid. Ange en tid mellan 00:00 och 23:59.');
  if (!match && /(?:kl\.?|klockan|vid)\s*\d/i.test(message))
    throw Error(
      'Tiden kunde inte tolkas. Skriv exempelvis vid 07:00 eller vid 07 tiden.',
    );
  // Advance the Stockholm calendar date, not 24 elapsed hours across DST changes.
  const localDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [year, month, day] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + (tomorrow ? 1 : 0)))
    .toISOString()
    .slice(0, 10);
  return {
    date,
    time: match
      ? match[1].padStart(2, '0') + ':' + (match[2] || '00')
      : undefined,
    clean: message
      .replace(/\s+(?:imorgon|i morgon|idag|i dag)\b.*$/i, '')
      .replace(new RegExp('\\s+' + timePattern.source + '[^]*$', 'i'), ''),
  };
}
export async function addressCandidates(query) {
  if (!/\d/.test(query)) return null;
  const q = query.replace(/\s+i\s+/i, ', ');
  const r = await fetch(
    'https://ext-api.vasttrafik.se/pr/v4/locations/by-text?' +
      new URLSearchParams({ q, limit: '15', types: 'address' }),
    {
      headers: { Authorization: 'Bearer ' + (await token()) },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!r.ok) throw Error('Adressökning misslyckades');
  const data = await r.json();
  const city = q.split(',').at(-1).trim().toLocaleLowerCase('sv');
  const street = q.split(',')[0].trim().toLocaleLowerCase('sv');
  return (data.results || [])
    .filter(
      (x) =>
        x.locationType === 'address' &&
        x.name.toLocaleLowerCase('sv').includes(city) &&
        x.name
          .toLocaleLowerCase('sv')
          .replace(/(\d)\s+([a-z])\b/g, '$1$2')
          .startsWith(street.replace(/(\d)\s+([a-z])\b/g, '$1$2')) &&
        Number.isFinite(x.latitude) &&
        Number.isFinite(x.longitude),
    )
    .map((x) => ({
      name: x.name,
      id: 'coord:' + x.latitude + ':' + x.longitude,
      gid: 'coord:' + x.latitude + ':' + x.longitude,
      lat: x.latitude,
      lon: x.longitude,
    }));
}
