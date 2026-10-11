import { fileURLToPath } from 'node:url';
import { runPython } from '../server/providers/python-runtime.js';
const jobs = {
  test: new URL('./import-topography.test.py', import.meta.url),
  topography: new URL('./import-topography.py', import.meta.url),
  rail: new URL('../server/providers/rail-routing/build.py', import.meta.url),
  whisper: new URL('./download-whisper.py', import.meta.url),
};
try {
  process.loadEnvFile?.();
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const [job, ...args] = process.argv.slice(2);
if (!jobs[job]) throw new Error('Ange topography, rail eller whisper.');
try {
  const result = await runPython([fileURLToPath(jobs[job]), ...args], {
    timeout: 60 * 60 * 1000,
    maxBuffer: 8 * 1024 * 1024,
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
} catch (e) {
  console.error(e.message);
  // These offline jobs take no secrets; expose diagnostics for import repair.
  if (e.cause?.stderr) console.error(e.cause.stderr);
  process.exitCode = 1;
}
