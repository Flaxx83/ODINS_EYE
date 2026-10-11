import {
  setOverlayEntries,
  clearOverlaySource,
  setOverlaySourceVisible,
} from '../../overlays/worldOverlay.js';
let sequence = 0;
/** Keep local map text in the shared collision-managed overlay, with instance ownership. */
export function createMapLabels() {
  const source = `local-map-text-${++sequence}`;
  return {
    replace(entities, viewer) {
      const entries = entities
        .filter((entity) => entity.point)
        .map((entity) => ({
          id: String(entity.id),
          title: entity.name || '',
          variant: 'label',
          position: entity.position.getValue(viewer.clock?.currentTime),
        }));
      setOverlayEntries(source, entries, {
        cohortLimit: 100,
        collisionCapacity: 100,
        moving: false,
      });
      setOverlaySourceVisible(source, true);
    },
    clear() {
      clearOverlaySource(source);
      setOverlaySourceVisible(source, false);
    },
  };
}
