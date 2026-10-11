import * as Cesium from 'cesium';
import {
  registerPickOwner,
  unregisterPickOwner,
  resolvePickId,
} from '../../data/pickRegistry.js';
const time = (v) =>
  new Date(v).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' });
const value = (v) => (Number.isFinite(v) && v !== 9999 ? String(v) : '—');
function box(title) {
  const el = document.createElement('section');
  el.setAttribute('aria-label', title);
  el.style.cssText =
    'position:fixed;right:24px;bottom:85px;width:430px;max-width:85vw;max-height:65vh;overflow:auto;background:#101820;color:white;padding:18px;border:1px solid #999;z-index:10000;font:14px sans-serif';
  const close = document.createElement('button');
  close.textContent = 'Stäng ×';
  close.onclick = () => el.remove();
  el.append(close);
  const h = document.createElement('h3');
  h.textContent = title;
  el.append(h);
  document.body.append(el);
  return el;
}
function text(el, s) {
  const p = document.createElement('p');
  p.textContent = s;
  el.append(p);
  return p;
}
function source(el, modified = false) {
  text(
    el,
    'Källa: SMHI · CC BY 4.0' +
      (modified ? ' · Kartbild omprojicerad till globens koordinater.' : ''),
  );
  const a = document.createElement('a');
  a.textContent = 'Öppna SMHI';
  a.href = 'https://www.smhi.se/';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.color = '#7edcff';
  el.append(a);
}
async function get(route, signal) {
  const r = await fetch('/api/smhi/weather/' + route, { signal });
  const p = await r.json();
  if (!r.ok) throw new Error(p.error);
  return p;
}
export function createSmhiObservations() {
  let data,
    rows = new Map(),
    enabled = false,
    request,
    handler,
    panel,
    lastUpdate,
    error;
  return {
    id: 'smhi-observations',
    name: 'SMHI · Mätstationer',
    icon: '◉',
    source: 'SMHI',
    updateInterval: 600000,
    init(v) {
      data = new Cesium.CustomDataSource('smhi-observations');
      data.show = false;
      v.dataSources.add(data);
    },
    enable(v) {
      enabled = true;
      data.show = true;
      registerPickOwner('smhi-observations', (id) =>
        id.startsWith('smhi-obs:'),
      );
      handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
      handler.setInputAction((click) => {
        if (!enabled) return;
        const id = resolvePickId(v.scene.pick(click.position));
        const row = rows.get(id);
        if (!row) return;
        panel?.remove();
        panel = box(row.name);
        const labels = {
          temperature: 'Temperatur',
          wind: 'Vindhastighet',
          direction: 'Vindriktning',
          rain: 'Nederbörd',
        };
        for (const [key, reading] of Object.entries(row.values))
          text(
            panel,
            `${labels[key]}: ${reading.value} ${reading.unit} · ${time(reading.time)} · Kvalitetskod: ${reading.quality}`,
          );
        text(
          panel,
          'Uppmätta värden. Olika parametrar kan ha olika mättider. Tider i Sverige.',
        );
        source(panel);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      v.scene.requestRender();
    },
    disable(v) {
      enabled = false;
      request?.abort();
      handler?.destroy();
      handler = null;
      panel?.remove();
      data.show = false;
      unregisterPickOwner('smhi-observations');
      v.scene.requestRender();
    },
    async update(v) {
      if (!enabled) return false;
      request?.abort();
      const current = new AbortController();
      request = current;
      try {
        const payload = await get('observations', current.signal);
        if (!enabled || request !== current) return false;
        data.entities.removeAll();
        rows = new Map();
        for (const row of payload.stations) {
          if (!Number.isFinite(row.lon) || !Number.isFinite(row.lat)) continue;
          const id = `smhi-obs:${row.id}`;
          rows.set(id, row);
          data.entities.add({
            id,
            name: row.name,
            position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
            point: {
              pixelSize: 9,
              color: Cesium.Color.DEEPSKYBLUE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 1,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Infinity,
            },
          });
        }
        lastUpdate = new Date(payload.fetchedAt);
        error = payload.missing.length
          ? 'Vissa observationer saknas: ' + payload.missing.join(', ')
          : null;
        v.scene.requestRender();
        return true;
      } catch (e) {
        if (!current.signal.aborted) error = e.message;
        return false;
      }
    },
    getStats() {
      return { count: rows.size, lastUpdate, error };
    },
    destroy(v) {
      this.disable(v);
      v.dataSources.remove(data, true);
    },
  };
}
export function createSmhiForecast() {
  let enabled = false,
    handler,
    panel,
    request,
    lastUpdate,
    error,
    count = 0;
  return {
    id: 'smhi-forecast',
    name: 'SMHI · Platsprognos',
    icon: '☀',
    source: 'SMHI SNOW',
    updateInterval: 1800000,
    init() {},
    enable(v) {
      enabled = true;
      panel?.remove();
      panel = box('SMHI · Platsprognos');
      text(
        panel,
        'Välj en plats på kartan eller hämta prognosen för kartans mitt.',
      );
      const content = document.createElement('div');
      const load = async (lon, lat) => {
        request?.abort();
        const current = new AbortController();
        request = current;
        content.replaceChildren();
        text(content, 'Hämtar prognos…');
        try {
          const p = await get(`forecast?lon=${lon}&lat=${lat}`, current.signal);
          if (!enabled || request !== current) return;
          content.replaceChildren();
          text(
            content,
            `Vald plats: ${lat.toFixed(3)}, ${lon.toFixed(3)} · Prognos skapad ${time(p.createdTime)}`,
          );
          const coords = p.geometry?.coordinates;
          if (coords)
            text(content, `Närmaste prognospunkt: ${JSON.stringify(coords)}`);
          const table = document.createElement('table');
          table.style.cssText = 'width:100%;border-spacing:6px';
          const head = document.createElement('tr');
          for (const s of ['Tid', '°C', 'Vind m/s', 'By m/s', 'Regn %']) {
            const th = document.createElement('th');
            th.textContent = s;
            head.append(th);
          }
          table.append(head);
          const series = p.timeSeries.filter(
            (s) => Date.parse(s.time) >= Date.now(),
          );
          for (const row of series) {
            const tr = document.createElement('tr');
            const d = row.data;
            for (const s of [
              time(row.time),
              value(d.air_temperature),
              value(d.wind_speed),
              value(d.wind_speed_of_gust),
              value(d.probability_of_precipitation),
            ]) {
              const td = document.createElement('td');
              td.textContent = s;
              tr.append(td);
            }
            table.append(tr);
          }
          content.append(table);
          text(
            content,
            'Tider i Sverige. Regn % avser sannolikhet för nederbörd.',
          );
          source(content);
          lastUpdate = new Date(p.createdTime);
          count = series.length;
          error = null;
        } catch (e) {
          if (!current.signal.aborted) {
            error = e.message;
            content.replaceChildren();
            text(content, error);
          }
        }
      };
      const choose = document.createElement('button');
      choose.textContent = 'Välj plats på kartan';
      choose.onclick = () => {
        choose.textContent = 'Klicka på en plats…';
        handler?.destroy();
        handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
        handler.setInputAction((click) => {
          const ray = v.camera.getPickRay(click.position);
          const pos = ray ? v.scene.globe.pick(ray, v.scene) : null;
          if (!pos) return;
          const c = Cesium.Cartographic.fromCartesian(pos);
          handler.destroy();
          handler = null;
          choose.textContent = 'Välj plats på kartan';
          load(
            Cesium.Math.toDegrees(c.longitude),
            Cesium.Math.toDegrees(c.latitude),
          );
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      };
      panel.append(choose);
      const center = document.createElement('button');
      center.textContent = 'Prognos för kartans mitt';
      center.onclick = () => {
        const pos = v.camera.pickEllipsoid(
          new Cesium.Cartesian2(
            v.scene.canvas.clientWidth / 2,
            v.scene.canvas.clientHeight / 2,
          ),
          v.scene.globe.ellipsoid,
        );
        if (!pos) {
          content.replaceChildren();
          text(content, 'Rikta kartan mot Sverige och försök igen.');
          return;
        }
        const c = Cesium.Cartographic.fromCartesian(pos);
        load(
          Cesium.Math.toDegrees(c.longitude),
          Cesium.Math.toDegrees(c.latitude),
        );
      };
      panel.append(center, content);
    },
    disable() {
      enabled = false;
      request?.abort();
      handler?.destroy();
      handler = null;
      panel?.remove();
    },
    update() {
      return enabled;
    },
    getStats() {
      return { count, lastUpdate, error };
    },
    destroy() {
      this.disable();
    },
  };
}
export function createSmhiRadar() {
  let enabled = false,
    imagery,
    request,
    panel,
    lastUpdate,
    error,
    generation = 0;
  return {
    id: 'smhi-radar',
    name: 'SMHI · Nederbördsradar',
    icon: '▧',
    source: 'SMHI',
    updateInterval: 300000,
    init() {},
    enable() {
      enabled = true;
    },
    disable(v) {
      enabled = false;
      generation++;
      request?.abort();
      if (imagery) imagery.show = false;
      panel?.remove();
      v.scene.requestRender();
    },
    async update(v) {
      if (!enabled) return false;
      request?.abort();
      const current = new AbortController();
      request = current;
      const token = ++generation;
      try {
        const p = await get('radar', current.signal);
        if (!enabled || token !== generation) return false;
        const provider = await Cesium.SingleTileImageryProvider.fromUrl(
          p.image,
          {
            rectangle: Cesium.Rectangle.fromDegrees(...p.bbox),
            credit: 'SMHI · Omprojicerad radarbild',
          },
        );
        if (!enabled || token !== generation) return false;
        if (imagery) v.imageryLayers.remove(imagery, true);
        imagery = v.imageryLayers.addImageryProvider(provider);
        imagery.alpha = 0.7;
        lastUpdate = new Date(p.timestamp);
        error =
          Date.now() - lastUpdate > 1800000
            ? 'Radarbilden är äldre än 30 minuter'
            : null;
        panel?.remove();
        panel = box('SMHI · Nederbördsradar');
        text(panel, `Radarbild: ${time(p.timestamp)} (svensk tid)`);
        text(
          panel,
          'Senaste tillgängliga radarbild. Färgerna kommer från SMHI:s originalbild. Radar visar observerade ekon, inte en prognos.',
        );
        if (error) text(panel, error);
        source(panel, true);
        v.scene.requestRender();
        return true;
      } catch (e) {
        if (!current.signal.aborted) {
          error = e.message;
          if (imagery) imagery.show = false;
          panel?.remove();
          panel = box('SMHI · Nederbördsradar');
          text(panel, error);
        }
        return false;
      }
    },
    getStats() {
      return { count: imagery ? 1 : 0, lastUpdate, error };
    },
    destroy(v) {
      this.disable(v);
      if (imagery) v.imageryLayers.remove(imagery, true);
    },
  };
}
