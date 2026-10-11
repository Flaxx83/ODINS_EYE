import { fileURLToPath } from 'node:url';
process.argv[1] = fileURLToPath(new URL('./import-gtfs.mjs', import.meta.url));
process.argv.splice(2, 0, '--operator', 'sl');
await import('./import-gtfs.mjs');
