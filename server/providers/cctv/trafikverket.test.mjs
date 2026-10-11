import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeTrafikverketCamera,
  loadTrafikverketSources,
} from './trafikverket.js';
const record = {
  Active: true,
  Deleted: false,
  Id: 'camera1',
  Name: 'E20',
  Direction: 320,
  Geometry: { WGS84: 'POINT (11.905099 57.652022)' },
  PhotoUrl: 'https://api.trafikinfo.trafikverket.se/v2/Images/camera.jpg',
  PhotoTime: '2026-10-11T18:41:38+02:00',
  Type: 'Trafikflödeskamera',
};
test('position, direction and capture time survive mapping', () => {
  const c = normalizeTrafikverketCamera(record);
  assert.equal(c.lon, 11.905099);
  assert.equal(c.lat, 57.652022);
  assert.equal(c.headingDeg, 320);
  assert.equal(c.photoTime, '2026-10-11T16:41:38.000Z');
  assert.equal(c.feedType, 'image');
});
test('inactive, deleted, invalid positions and foreign image hosts are rejected', () => {
  for (const patch of [
    { Active: false },
    { Deleted: true },
    { Geometry: { WGS84: 'bad' } },
    { PhotoUrl: 'https://attacker.example/v2/Images/image.jpg' },
    {
      PhotoUrl:
        'https://user:secret@api.trafikinfo.trafikverket.se/v2/Images/image.jpg',
    },
  ])
    assert.equal(normalizeTrafikverketCamera({ ...record, ...patch }), null);
});
test('missing direction and invalid time remain estimates/unknown', () => {
  const c = normalizeTrafikverketCamera({
    ...record,
    Direction: null,
    PhotoTime: 'bad',
  });
  assert.equal(c.headingConfidence, 'low');
  assert.equal(c.photoTime, '');
});
test('request escapes credentials; mapped output never includes the key', async () => {
  const cameras = await loadTrafikverketSources({
    apiKey: 'test&key',
    fetchImpl: async (url, options) => {
      assert.ok(options.body.includes('test&amp;key'));
      return {
        ok: true,
        json: async () => ({ RESPONSE: { RESULT: [{ Camera: [record] }] } }),
      };
    },
  });
  assert.equal(cameras.length, 1);
  assert.ok(!JSON.stringify(cameras).includes('test&key'));
});
test('missing credentials skip the network', async () => {
  assert.deepEqual(
    await loadTrafikverketSources({
      apiKey: '',
      fetchImpl: () => {
        throw Error('should not run');
      },
    }),
    [],
  );
});
