import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverUnitTestFiles } from './run-unit-tests.mjs';
test('unit discovery includes nested server regressions as well as browser tests', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'odins-test-discovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'src'), { recursive: true });
  await mkdir(path.join(root, 'server/providers/cctv'), { recursive: true });
  for (const file of [
    'src/example.test.mjs',
    'server/providers/cctv/example.test.mjs',
    'server/providers/cctv/production.js',
  ])
    await writeFile(path.join(root, file), '');
  assert.deepEqual(discoverUnitTestFiles(root), [
    'server/providers/cctv/example.test.mjs',
    'src/example.test.mjs',
  ]);
});
