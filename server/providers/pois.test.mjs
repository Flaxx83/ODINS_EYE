import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { openPoiStore, poiPlugin } from './pois.js';
const sample = { name: 'Testplats', lat: 58.4, lon: 13.85, address: '', notes: '  <script>test</script> och åäö\n' };
test('SQLite persists POI through reopen, protects stale edits and preserves notes during move', () => {
  const directory = mkdtempSync(join(tmpdir(), 'odins-poi-test-')); const path = join(directory, 'pois.sqlite');
  let store;
  try {
    store = openPoiStore(path, { now: () => '2026-10-13T10:00:00.000Z' });
    const row = store.create(sample); store.close(); store = openPoiStore(path, { now: () => '2026-10-13T10:00:00.000Z' });
    assert.equal(store.get(row.id).notes, sample.notes);
    const moved = store.update(row.id, { ...row, lat: 58.5, address: 'Ny adress' });
    assert.equal(moved.notes, sample.notes); assert.equal(moved.id, row.id);
    assert.notEqual(moved.updatedAt, row.updatedAt);
    assert.throws(() => store.update(row.id, row), /annan vy/);
    assert.equal(store.list([13,58.45,14,59]).length, 1); assert.equal(store.list([13,58,14,58.45]).length, 0);
    const backup = store.snapshot(); store.remove(row.id); assert.equal(store.list().length, 0);
    store.restore(backup); assert.equal(store.get(row.id).notes, sample.notes);
    assert.equal(readdirSync(join(directory, 'backups')).length, 1);
    assert.throws(() => store.restore({ version: 1, pois: [moved, { ...moved, lat: Infinity }] }));
    assert.equal(store.list().length, 1);
    assert.throws(() => store.create({ ...sample, lat: '58.4' }));
    assert.throws(() => store.create({ ...sample, notes: 'x'.repeat(10001) }));
  } finally { store?.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('POI HTTP rejects cross-site access and malformed input; CRUD and backup use the same store', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'odins-poi-http-')); let middleware;
  const http = createServer((req,res) => { req.url = req.url.replace('/api/pois', ''); void middleware(req,res); });
  poiPlugin({ path: () => join(directory, 'pois.sqlite') }).configureServer({ middlewares: { use: (_,handler) => middleware=handler }, httpServer: http });
  await new Promise(resolve => http.listen(0,'127.0.0.1',resolve)); const base = 'http://127.0.0.1:' + http.address().port + '/api/pois';
  try {
    assert.equal((await fetch(base, { headers: { Origin: 'https://example.com' } })).status, 403);
    assert.equal((await fetch(base, { method:'POST', headers:{'Content-Type':'application/json'},body:'bad' })).status, 400);
    const r = await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sample)}); assert.equal(r.status,201);const row=await r.json();
    assert.equal((await (await fetch(base)).json()).pois.length,1);
    assert.equal((await fetch(base+'/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({backup:{version:1,pois:[]}})})).status,400);
    assert.equal((await (await fetch(base+'/backup')).json()).pois[0].id,row.id);
    assert.equal((await fetch(base+'/'+row.id,{method:'DELETE'})).status,200);
    assert.equal((await (await fetch(base)).json()).pois.length,0);
  } finally { await new Promise(resolve=>http.close(resolve)); rmSync(directory,{recursive:true,force:true}); }
});
