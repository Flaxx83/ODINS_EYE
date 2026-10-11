import { getWorldOverlayDiagnostics } from '../../overlays/worldOverlay.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTripMap } from './trip-map.js';
const setup = () => {
  let data;
  const viewer = {
    dataSources: {
      add: (d) => {
        data = d;
      },
      remove: () => {},
    },
    scene: { requestRender() {} },
    camera: { flyToBoundingSphere() {} },
  };
  return { map: createTripMap(viewer), entities: () => data.entities.values };
};
const leg = {
  name: 'SJ',
  mode: 'rail',
  from: 'Skövde',
  to: 'Stockholm',
  coordinates: [
    [13.85, 58.4],
    [18.06, 59.33],
  ],
};
test('missing route geometry draws endpoints but never a straight rail line', (t) => {
  const f = setup();
  t.after(() => f.map.destroy());
  f.map.show({ legs: [{ ...leg, approximate: true }] });
  assert.equal(f.entities().filter((e) => e.polyline).length, 0);
  assert.equal(f.entities().filter((e) => e.point).length, 2);
  assert.ok(f.entities().every((e) => e.name.includes('Resväg saknas')));
});
test('verified geometry is drawn; malformed coordinates never reach the globe', () => {
  const f = setup();
  f.map.show({
    legs: [
      { ...leg, approximate: false },
      {
        ...leg,
        coordinates: [
          [Infinity, 58],
          [18, 59],
        ],
      },
      {
        ...leg,
        coordinates: [
          [13, 95],
          [18, 59],
        ],
      },
    ],
  });
  assert.equal(f.entities().filter((e) => e.polyline).length, 1);
  assert.equal(f.entities().length, 3);
  f.map.clear();
  assert.equal(f.entities().length, 0);
});

test('two routes own separate shared text entries and clear only their own labels', (t) => {
  const a = setup(),
    b = setup();
  t.after(() => {
    a.map.destroy();
    b.map.destroy();
  });
  const baseline = getWorldOverlayDiagnostics().entryCount;
  a.map.show({ legs: [{ ...leg, approximate: true }] });
  b.map.show({ legs: [{ ...leg, approximate: true }] });
  assert.equal(getWorldOverlayDiagnostics().entryCount, baseline + 4);
  a.map.clear();
  assert.equal(getWorldOverlayDiagnostics().entryCount, baseline + 2);
  b.map.clear();
  assert.equal(getWorldOverlayDiagnostics().entryCount, baseline);
});
