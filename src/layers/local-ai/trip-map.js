import { createMapLabels } from './map-labels.js';
import * as C from 'cesium';
export function createTripMap(viewer) {
  const labels = createMapLabels();
  const data = new C.CustomDataSource('ai-trip-route');
  viewer.dataSources.add(data);
  return {
    show(trip) {
      data.entities.removeAll();
      const points = [];
      trip.legs.forEach((leg, i) => {
        if (
          !Array.isArray(leg.coordinates) ||
          leg.coordinates.length < 2 ||
          leg.coordinates.some(
            (p) =>
              !Array.isArray(p) ||
              p.length !== 2 ||
              !p.every(Number.isFinite) ||
              Math.abs(p[0]) > 180 ||
              Math.abs(p[1]) > 90,
          )
        )
          return;
        const coordinates = leg.coordinates.flat();
        const color =
          leg.mode === 'walk'
            ? C.Color.WHITE
            : leg.mode === 'rail' || leg.mode === 'train' || leg.mode === 'tram'
              ? C.Color.MEDIUMPURPLE
              : C.Color.DEEPSKYBLUE;
        if (!leg.approximate)
          data.entities.add({
            id: 'ai-trip-leg:' + i,
            name: leg.name,
            polyline: {
              positions: C.Cartesian3.fromDegreesArray(coordinates),
              width: 4,
              clampToGround: true,
              material: leg.approximate
                ? new C.PolylineDashMaterialProperty({ color, dashLength: 16 })
                : color,
            },
          });
        for (const [j, p] of [
          leg.coordinates[0],
          leg.coordinates.at(-1),
        ].entries()) {
          const position = C.Cartesian3.fromDegrees(...p);
          points.push(position);
          data.entities.add({
            id: `ai-trip-stop:${i}:${j}`,
            name:
              (j ? leg.to : leg.from) +
              (leg.approximate ? ' · Resväg saknas' : ''),
            position,
            point: {
              pixelSize: 10,
              color,
              outlineColor: C.Color.BLACK,
              outlineWidth: 2,
              heightReference: C.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Infinity,
            },
          });
        }
      });
      labels.replace(data.entities.values, viewer);
      if (points.length) {
        const sphere = C.BoundingSphere.fromPoints(points);
        viewer.camera.flyToBoundingSphere(sphere, {
          duration: 2,
          offset: new C.HeadingPitchRange(
            0,
            -Math.PI / 2,
            Math.max(3000, sphere.radius * 3),
          ),
        });
      }
      viewer.scene.requestRender();
    },
    clear() {
      labels.clear();
      data.entities.removeAll();
      viewer.scene.requestRender();
    },
    destroy() {
      labels.clear();
      viewer.dataSources.remove(data, true);
    },
  };
}
