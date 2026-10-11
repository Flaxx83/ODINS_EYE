import * as Cesium from 'cesium';
import { createSelectedTransitRoute } from '../sl/route.js';
import {
  registerPickOwner,
  unregisterPickOwner,
  resolvePickId,
} from '../../data/pickRegistry.js';
function panel() {
  const p = document.createElement('section');
  p.setAttribute('aria-label', 'Västtrafik · Trafikpositioner');
  p.style.cssText =
    'position:fixed;right:24px;bottom:85px;width:370px;max-width:85vw;max-height:60vh;overflow:auto;background:#101820;color:white;padding:18px;border:1px solid #999;z-index:10000;font:14px sans-serif';
  const b = document.createElement('button');
  b.textContent = 'Stäng ×';
  b.onclick = () => p.remove();
  p.append(b);
  document.body.append(p);
  return p;
}
function text(el, s) {
  const p = document.createElement('p');
  p.textContent = s;
  el.append(p);
}
export function createVasttrafikLayer() {
  let data,
    enabled = false,
    request,
    handler,
    box,
    rows = new Map(),
    lastUpdate,
    error,
    move,
    timer,
    selected = null;
  const route = createSelectedTransitRoute();
  const layer = {
    id: 'vasttrafik',
    name: 'Västtrafik · Trafikpositioner',
    icon: '🚌',
    source: 'Västtrafik',
    updateInterval: 60000,
    init(v) {
      route.init(v);
      data = new Cesium.CustomDataSource('vasttrafik');
      data.show = false;
      v.dataSources.add(data);
    },
    enable(v) {
      enabled = true;
      data.show = true;
      registerPickOwner('vasttrafik', (id) => id.startsWith('vasttrafik:'));
      handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
      handler.setInputAction((click) => {
        const row = rows.get(resolvePickId(v.scene.pick(click.position)));
        if (!row) return;
        selected = 'vasttrafik:' + row.id;
        box?.remove();
        box = panel();
        text(box, 'Linje ' + row.line + ' · ' + row.direction);
        text(box, 'Trafikslag: ' + row.mode);
        text(
          box,
          row.realtimeJourney
            ? 'Realtidstur enligt Västtrafik'
            : 'Tidtabellstur enligt Västtrafik',
        );
        text(
          box,
          'Hämtat: ' +
            lastUpdate.toLocaleString('sv-SE', {
              timeZone: 'Europe/Stockholm',
            }),
        );
        text(
          box,
          'API:t lämnar turpositioner. Markörerna är inte verifierade GPS-positioner. Källa: Västtrafik.',
        );
        route.show({ ...row, tripId: row.id }, 'vasttrafik', box);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      move = () => {
        clearTimeout(timer);
        timer = setTimeout(() => layer.update(v), 600);
      };
      v.camera.moveEnd.addEventListener(move);
    },
    disable(v) {
      enabled = false;
      selected = null;
      route.clear();
      request?.abort();
      clearTimeout(timer);
      handler?.destroy();
      handler = null;
      if (move) v.camera.moveEnd.removeEventListener(move);
      box?.remove();
      data.show = false;
      unregisterPickOwner('vasttrafik');
      v.scene.requestRender();
    },
    async update(v) {
      if (!enabled || document.hidden) return false;
      request?.abort();
      const current = new AbortController();
      request = current;
      const height = v.camera.positionCartographic.height;
      const pos = v.camera.pickEllipsoid(
        new Cesium.Cartesian2(
          v.scene.canvas.clientWidth / 2,
          v.scene.canvas.clientHeight / 2,
        ),
        v.scene.globe.ellipsoid,
      );
      const c = pos ? Cesium.Cartographic.fromCartesian(pos) : null,
        lat = c ? Cesium.Math.toDegrees(c.latitude) : 0,
        lon = c ? Cesium.Math.toDegrees(c.longitude) : 0;
      if (height > 200000 || lat < 55 || lat > 61 || lon < 10 || lon > 16) {
        data.entities.removeAll();
        rows.clear();
        selected = null;
        route.clear();
        box?.remove();
        box = panel();
        text(
          box,
          'Zooma in över Västtrafiks område för att hämta trafikpositioner.',
        );
        v.scene.requestRender();
        return false;
      }
      try {
        const r = await fetch(
          `/api/vasttrafik/positions?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`,
          { signal: current.signal },
        );
        const p = await r.json();
        if (!r.ok) throw new Error(p.error);
        if (!enabled || request !== current) return false;
        data.entities.removeAll();
        rows = new Map();
        for (const row of p.positions) {
          const id = 'vasttrafik:' + row.id;
          if (rows.has(id)) continue;
          rows.set(id, row);
          data.entities.add({
            id,
            name: row.line + ' · ' + row.direction,
            position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
            point: {
              pixelSize: 10,
              color: Cesium.Color.fromCssColorString(row.color),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Infinity,
            },
          });
        }
        lastUpdate = new Date(p.fetchedAt);
        error = null;
        if (selected && !rows.has(selected)) {
          selected = null;
          route.clear();
        }
        if (!selected || !box?.isConnected) {
          selected = null;
          route.clear();
          box?.remove();
          box = panel();
          text(box, `${rows.size} turpositioner nära kartans mitt.`);
          if (p.limitReached)
            text(
              box,
              'API-gränsen på 200 träffar nåddes. Alla turer i området kanske inte visas.',
            );
          text(
            box,
            'Turpositioner enligt Västtrafik; GPS-ursprung är inte verifierat. Uppdatering varje minut. Klicka för linje, riktning, färdväg och dess hållplatser.',
          );
        }
        v.scene.requestRender();
        return true;
      } catch (e) {
        if (!current.signal.aborted) {
          error = e.message;
          data.entities.removeAll();
          rows.clear();
          selected = null;
          route.clear();
          box?.remove();
          box = panel();
          text(box, error);
          v.scene.requestRender();
        }
        return false;
      }
    },
    getStats() {
      return { count: rows.size, lastUpdate, error };
    },
    destroy(v) {
      this.disable(v);
      route.destroy();
      v.dataSources.remove(data, true);
    },
  };
  return layer;
}
