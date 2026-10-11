import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const origin = 'https://radio.garden';
async function json(path) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()).data;
}
const places = (await json('/api/ara/content/places')).list.filter(p => p.country === 'Sweden');
const stations = new Map();
for (const place of places) {
  const page = await json(`/api/ara/content/page/${place.id}/channels`);
  for (const section of page.content || []) {
    for (const item of section.items || []) {
      const channel = item.page;
      if (channel?.type !== 'channel' || channel.place?.id !== place.id) continue;
      const gardenId = channel.url.split('/').at(-1);
      const detail = await json(`/api/ara/content/channel/${gardenId}`);
      const listen = `${origin}/api/ara/content/listen/${gardenId}/channel.mp3`;
      const response = await fetch(listen, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
      const destination = response.headers.get('location');
      await response.body?.cancel();
      if (!(response.ok || (response.status >= 300 && response.status < 400))) throw new Error(`Stream ${gardenId}: ${response.status}`);
      const hash = createHash('sha256').update(`radio-garden:${gardenId}`).digest('hex');
      const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
      stations.set(gardenId, {
        id, name: detail.title, lat: place.geo[1], lon: place.geo[0],
        streamUrl: destination?.startsWith('https://') ? destination : listen,
        homepage: detail.website?.startsWith('https://') ? detail.website : origin + channel.url,
        tags: ['swedish', 'radio garden'], languages: ['Swedish'], state: place.title,
        country: 'Sweden', countryCode: 'SE', metadataTrust: 'untrusted-community',
        codec: /aac/i.test(destination || '') ? 'AAC' : 'MP3', bitrate: null,
        gardenId, gardenUrl: origin + channel.url,
      });
    }
  }
}
const result = { source: origin, importedAt: new Date().toISOString(), places: places.length, stations: [...stations.values()] };
await writeFile(new URL('../server/providers/radio/sweden-garden.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ places: places.length, expected: places.reduce((n,p)=>n+p.size,0), stations: stations.size }));
