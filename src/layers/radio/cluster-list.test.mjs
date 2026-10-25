import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRadioFavorites,
  RADIO_FAVORITES_KEY,
  filterClusterStations,
} from './cluster-list.js';
test('favorites survive new store instances and removal preserves other stations', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const first = createRadioFavorites(() => storage);
  assert.deepEqual(
    first.toggle({
      id: 'a',
      name: 'Nacka',
      tags: ['talk'],
      url: 'https://private.invalid/stream',
    }),
    { saved: true },
  );
  first.toggle({ id: 'b', name: 'Gotland' });
  const reloaded = createRadioFavorites(() => storage);
  assert.equal(reloaded.has('a'), true);
  assert.equal(reloaded.list().length, 2);
  assert.doesNotMatch(values.get(RADIO_FAVORITES_KEY), /private|stream/);
  assert.deepEqual(reloaded.toggle({ id: 'a', name: 'Nacka' }), {
    saved: false,
  });
  assert.deepEqual(
    first.list().map((row) => row.id),
    ['b'],
  );
});
test('blocked storage reports failure instead of claiming a favorite was saved', () => {
  const store = createRadioFavorites(() => {
    throw Error('blocked');
  });
  assert.deepEqual(store.list(), []);
  assert.match(
    store.toggle({ id: 'a', name: 'Nacka' }).error,
    /kunde inte sparas/,
  );
  assert.equal(store.has('a'), false);
});
test('invalid stored data is tolerated and search covers name, place and category', () => {
  const store = createRadioFavorites(() => ({ getItem: () => '{invalid' }));
  assert.deepEqual(store.list(), []);
  const stations = [
    {
      name: 'Nacka FM',
      state: 'Stockholm',
      country: 'Sverige',
      tags: ['talk'],
    },
  ];
  for (const query of ['NACKA', 'stockholm', 'talk', 'Sverige'])
    assert.equal(filterClusterStations(stations, query).length, 1);
  assert.equal(filterClusterStations(stations, 'jazz').length, 0);
});
