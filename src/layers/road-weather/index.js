import * as C from 'cesium';
import {
  registerPickOwner,
  unregisterPickOwner,
  resolvePickId,
} from '../../data/pickRegistry.js';
import { showWeatherCard } from './card.js';
export function createRoadWeatherLayer() {
  let viewer,
    data,
    handler,
    controller,
    enabled = false,
    timer,
    listener,
    payload,
    error = null;
  const rows = new Map();
  const layer = {
    id: 'road-weather',
    name: 'Trafikverket · Vägväder',
    source: 'Trafikverket',
    category: 'infrastructure',
    updateInterval: 60000,
    init(v) {
      viewer = v;
      data = new C.CustomDataSource('road-weather');
      data.show = false;
      v.dataSources.add(data);
    },
    enable() {
      enabled = true;
      data.show = true;
      registerPickOwner('road-weather', (id) => id.startsWith('road-weather:'));
      handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((e) => {
        const s = rows.get(resolvePickId(viewer.scene.pick(e.position)));
        if (s)
          showWeatherCard(s, payload.sources, payload.note, payload.reports);
      }, C.ScreenSpaceEventType.LEFT_CLICK);
      listener = () => {
        clearTimeout(timer);
        timer = setTimeout(() => void layer.update(), 500);
      };
      viewer.camera.moveEnd.addEventListener(listener);
    },
    disable() {
      enabled = false;
      controller?.abort();
      clearTimeout(timer);
      handler?.destroy();
      handler = null;
      if (listener) viewer.camera.moveEnd.removeEventListener(listener);
      unregisterPickOwner('road-weather');
      document.querySelector('.road-weather-card')?.remove();
      if (data) data.show = false;
      viewer?.scene.requestRender();
    },
    async update() {
      if (!enabled || document.hidden) return false;
      const r = viewer.camera.computeViewRectangle();
      if (!r) return false;
      const box = [r.west, r.south, r.east, r.north].map(C.Math.toDegrees);
      if (box[2] - box[0] > 30 || box[3] - box[1] > 20) {
        error = 'Zooma in över Sverige';
        rows.clear();
        data.entities.removeAll();
        return false;
      }
      controller?.abort();
      const req = new AbortController();
      controller = req;
      try {
        const r = await fetch(
          '/api/road-weather?' + new URLSearchParams({ bbox: box.join(',') }),
          { signal: req.signal },
        );
        if (!r.ok) throw Error();
        const next = await r.json();
        if (!enabled || req.signal.aborted) return false;
        payload = next;
        rows.clear();
        data.entities.removeAll();
        for (const s of next.stations) {
          const id = 'road-weather:' + s.id;
          rows.set(id, s);
          data.entities.add({
            id,
            name: s.name,
            position: C.Cartesian3.fromDegrees(s.lon, s.lat),
            point: {
              pixelSize: 10,
              color: s.stale ? C.Color.GRAY : C.Color.CYAN,
              outlineColor: C.Color.BLACK,
              outlineWidth: 2,
              heightReference: C.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Infinity,
            },
          });
        }
        error = !next.available
          ? 'Vägväderstationer otillgängliga'
          : next.partial
            ? 'Delvis tillgängliga källor'
            : next.stale
              ? 'Gammal cache'
              : null;
        viewer.scene.requestRender();
        return true;
      } catch {
        if (!req.signal.aborted) {
          error = 'Vägväder kunde inte hämtas';
          rows.clear();
          data.entities.removeAll();
        }
        return false;
      }
    },
    getStats() {
      return {
        count: rows.size,
        error,
        fetchedAt: payload?.sources?.[0]?.fetchedAt,
      };
    },
    destroy() {
      layer.disable();
      if (viewer && data) viewer.dataSources.remove(data, true);
    },
  };
  return layer;
}
