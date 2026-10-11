import { readFile, writeFile, mkdir } from 'node:fs/promises';
const file = new URL('../../.gev-cache/trafiklab-usage.json', import.meta.url);
let usage,
  queue = Promise.resolve();
export function recordTrafiklabRequest(type) {
  const operation = queue.then(async () => {
    if (!usage) {
      try {
        usage = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        usage = {};
      }
    }
    const now = Date.now();
    const times = (usage[type] || []).filter((t) => t > now - 30 * 86400000);
    const limit = {
      regionalRealtime: 29000,
      regionalStatic: 58,
      timetable: 95000,
    }[type];
    if (times.length >= limit)
      throw new Error('Den lokala anropsbudgeten är slut.');
    times.push(now);
    usage[type] = times;
    await mkdir(new URL('../../.gev-cache/', import.meta.url), {
      recursive: true,
    });
    await writeFile(file, JSON.stringify(usage));
  });
  queue = operation.catch(() => {});
  return operation;
}
