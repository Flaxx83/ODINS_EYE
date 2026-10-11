import * as Cesium from 'cesium';
import { createSelectedTransitRoute } from './route.js';
import {
  registerPickOwner,
  unregisterPickOwner,
  resolvePickId,
} from '../../data/pickRegistry.js';
function createPanel(title) {
  const box = document.createElement('section');
  box.setAttribute('aria-label', title);
  box.style.cssText =
    'position:fixed;right:24px;bottom:85px;width:360px;max-width:85vw;max-height:60vh;overflow:auto;background:#101820;color:white;padding:18px;border:1px solid #999;z-index:10000;font:14px sans-serif';
  const close = document.createElement('button');
  close.textContent = 'Stäng ×';
  close.onclick = () => box.remove();
  box.append(close);
  const h = document.createElement('h3');
  h.textContent = title;
  box.append(h);
  document.body.append(box);
  return box;
}
function text(box, s) {
  const p = document.createElement('p');
  p.textContent = s;
  box.append(p);
}
const time = (v) =>
  new Date(v).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' });
export function createSlLayer(options = {}) {
  let data,
    enabled = false,
    request,
    handler,
    box,
    rows = new Map(),
    lastUpdate,
    error,
    selectedVehicle = null,
    selectedTrip = null;
  const selectedRoute = createSelectedTransitRoute();
  const id = options.id || 'sl-live';
  let operator = options.operator || 'sl',
    viewer;
  const title = options.name || 'SL · Livetrafik';
  function panel() {
    const box = createPanel(title);
    if (options.regions) {
      const select = document.createElement('select');
      for (const [code, name] of options.regions) {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = name;
        select.append(opt);
      }
      select.value = operator;
      select.onchange = () => {
        operator = select.value;
        selectedVehicle = null;
        selectedRoute.clear();
        request?.abort();
        data.entities.removeAll();
        rows.clear();
        layer.update(viewer);
      };
      box.append(select);
    }
    return box;
  }
  const layer = {
    id,
    name: title,
    icon: '🚌',
    source: options.regions ? 'Trafiklab' : 'SL / Trafiklab',
    updateInterval: 120000,
    init(v) {
      viewer = v;
      selectedRoute.init(v);
      data = new Cesium.CustomDataSource(id);
      data.show = false;
      v.dataSources.add(data);
    },
    enable(v) {
      enabled = true;
      data.show = true;
      registerPickOwner(id, (key) => key.startsWith(id + ':'));
      handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
      handler.setInputAction((click) => {
        if (!enabled) return;
        const row = rows.get(resolvePickId(v.scene.pick(click.position)));
        if (!row) return;
        selectedVehicle = row.id;
        selectedTrip = row.tripId;
        box?.remove();
        box = panel();
        text(
          box,
          row.line
            ? 'Linje ' + row.line
            : 'Linje-ID: ' + (row.routeId || 'Ej angivet'),
        );
        if (row.destination)
          text(
            box,
            (row.destinationSource === 'last-stop'
              ? 'Planerad sluthållplats: '
              : 'Mot ') + row.destination,
          );
        text(box, 'Fordon: ' + (row.label || row.id));
        if (row.speedMps != null)
          text(
            box,
            'Rapporterad hastighet: ' +
              Math.round(row.speedMps * 3.6) +
              ' km/h',
          );
        text(box, 'Position rapporterad: ' + time(row.timestamp * 1000));
        text(
          box,
          'Källa: Trafiklab. Senast rapporterad position; uppdatering varannan minut.',
        );
        selectedRoute.show(row, operator, box);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    },
    disable(v) {
      enabled = false;
      selectedVehicle = null;
      selectedRoute.clear();
      request?.abort();
      handler?.destroy();
      handler = null;
      box?.remove();
      data.show = false;
      unregisterPickOwner(id);
      v.scene.requestRender();
    },
    async update(v) {
      if (!enabled || document.hidden) return false;
      request?.abort();
      const current = new AbortController();
      request = current;
      try {
        const r = await fetch(
          options.regions ? '/api/regional/' + operator : '/api/sl/vehicles',
          { signal: current.signal },
        );
        const p = await r.json();
        if (!r.ok) throw new Error(p.error);
        if (!enabled || request !== current) return false;
        data.entities.removeAll();
        rows = new Map();
        for (const row of p.vehicles) {
          const entityId = `${id}:${row.id}`;
          rows.set(entityId, row);
          data.entities.add({
            id: entityId,
            name: row.line
              ? (options.regions ? 'Linje ' : 'SL ') + row.line
              : row.label || row.id,
            position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
            point: {
              pixelSize: 10,
              color: Cesium.Color.YELLOW,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Infinity,
            },
          });
        }
        lastUpdate = new Date(p.fetchedAt);
        error = null;
        if (
          selectedVehicle &&
          rows.get(`${id}:${selectedVehicle}`)?.tripId !== selectedTrip
        ) {
          selectedRoute.clear();
          selectedVehicle = null;
        }
        if (!selectedVehicle || !box?.isConnected) {
          selectedVehicle = null;
          selectedRoute.clear();
          box?.remove();
          box = panel();
          text(
            box,
            `${rows.size} fordon med positioner rapporterade under de senaste fem minuterna.`,
          );
          text(box, 'Kontrollerat ' + time(p.fetchedAt));
          if (!p.metadataAvailable)
            text(
              box,
              'Linjenamn och destination kräver även GTFS Regional Static-nyckel. Fordonspositioner fungerar utan den.',
            );
          text(box, 'Källa: Trafiklab. Uppdatering varannan minut.');
        }
        v.scene.requestRender();
        return true;
      } catch (e) {
        if (!current.signal.aborted) {
          error = e.message;
          selectedVehicle = null;
          selectedRoute.clear();
          data.entities.removeAll();
          rows.clear();
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
      selectedRoute.destroy();
      v.dataSources.remove(data, true);
    },
  };
  return layer;
}
