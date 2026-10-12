import test from 'node:test';
import assert from 'node:assert/strict';
import { findPickPoint } from './qa-street-level.mjs';

function sceneFixture(t, blocked = false) {
  const canvas = {
    getBoundingClientRect: () => ({
      left: 10,
      top: 20,
      width: 300,
      height: 200,
    }),
  };
  class ScreenPoint {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
  }
  class Cartographic {
    static fromDegrees() {
      return {};
    }
  }
  const billboard = {
    id: 'mly:img:photo',
    show: true,
    ready: true,
    computeScreenSpacePosition: () => new ScreenPoint(100, 80),
  };
  const collection = { length: 1, get: () => billboard };
  let actualPicks = 0;
  const scene = {
    canvas,
    primitives: { length: 1, get: () => collection },
    globe: { ellipsoid: { cartographicToCartesian: () => ({}) } },
    cartesianToCanvasCoordinates: () => new ScreenPoint(60, 80),
    pick: (p) => {
      actualPicks++;
      return p.x === 103 && p.y === 81
        ? { id: 'mly:img:photo' }
        : { id: 'mly:seq:line' };
    },
  };
  const saved = ['window', 'document'].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ]);
  t.after(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  globalThis.window = {
    __godsEyeView: {
      viewer: { scene, camera: { positionCartographic: new Cartographic() } },
    },
  };
  globalThis.document = {
    elementFromPoint: () => (blocked ? {} : canvas),
  };
  return { picks: () => actualPicks, billboard: collection.get(), scene };
}
test('pick proof finds an opaque diagonal pixel of a clamped alpha-masked billboard', (t) => {
  const f = sceneFixture(t);
  assert.deepEqual(
    findPickPoint({
      prefix: 'mly:img:',
      id: null,
      points: [[0, 0]],
      billboardIds: null,
      billboardPrefix: 'mly:img:',
    }),
    { x: 113, y: 101, id: 'photo' },
  );
  assert.ok(
    f.picks() > 0,
    'the proof comes from scene.pick, not merely a billboard position',
  );
});
test('a panel covering the marker cannot count as a clickable cone', (t) => {
  const f = sceneFixture(t, true);
  assert.equal(
    findPickPoint({
      prefix: 'mly:img:',
      id: null,
      points: [[0, 0]],
      billboardIds: null,
      billboardPrefix: 'mly:img:',
    }),
    null,
  );
  assert.equal(f.picks(), 0);
});

test('an unloaded billboard yields without GPU picking until a render makes it ready', (t) => {
  const f = sceneFixture(t);
  f.billboard.ready = false;
  let renders = 0;
  f.scene.requestRender = () => {
    renders++;
    f.billboard.ready = true;
  };
  const input = {
    prefix: 'mly:img:',
    id: null,
    points: [[0, 0]],
    billboardIds: null,
    billboardPrefix: 'mly:img:',
  };
  assert.equal(findPickPoint(input), null);
  assert.equal(f.picks(), 0);
  assert.equal(renders, 1);
  assert.equal(findPickPoint(input).id, 'photo');
});
