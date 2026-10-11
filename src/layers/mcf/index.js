import * as Cesium from 'cesium';
import {
  registerPickOwner,
  unregisterPickOwner,
  resolvePickId,
} from '../../data/pickRegistry.js';
const SOURCE = 'Myndigheten för civilt försvar';
function panel(title) {
  const box = document.createElement('section');
  box.setAttribute('aria-label', title);
  box.style.cssText =
    'position:fixed;right:24px;bottom:85px;width:340px;max-width:80vw;max-height:60vh;overflow:auto;background:#101820;color:white;padding:18px;border:1px solid #999;z-index:10000;font:14px sans-serif';
  const close = document.createElement('button');
  close.textContent = 'Stäng ×';
  close.onclick = () => box.remove();
  box.append(close);
  const heading = document.createElement('h3');
  heading.textContent = title;
  box.append(heading);
  document.body.append(box);
  return box;
}
function text(box, value) {
  const p = document.createElement('p');
  p.textContent = value;
  box.append(p);
}
function source(box) {
  const a = document.createElement('a');
  a.href = 'https://www.mcf.se/sv/verktyg--tjanster/kartportalen/';
  a.textContent = `Källa: ${SOURCE}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.color = '#7edcff';
  box.append(a);
}
export function createMcfPoints(kind, name, color) {
  const id = `mcf-${kind}`;
  let points,
    rows = [],
    enabled = false,
    request,
    handler,
    box,
    error = null,
    loadedAt = null;
  return {
    id,
    name,
    icon: '◉',
    source: SOURCE,
    updateInterval: 86400000,
    init(viewer) {
      points = viewer.scene.primitives.add(
        new Cesium.PointPrimitiveCollection(),
      );
      points.show = false;
    },
    enable(viewer) {
      enabled = true;
      points.show = true;
      registerPickOwner(id, (key) => key.startsWith(id + ':'));
      handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((click) => {
        if (!enabled) return;
        const key = resolvePickId(viewer.scene.pick(click.position));
        if (!key?.startsWith(id + ':')) return;
        const row = rows[Number(key.split(':')[1])];
        if (!row) return;
        box?.remove();
        box = panel(name);
        text(box, row.title);
        if (row.address) text(box, row.address);
        if (row.places != null) text(box, `Antal platser: ${row.places}`);
        if (row.type) text(box, row.type);
        text(
          box,
          `Registerdatum: ${row.date || 'Ej angivet'} · Nedladdat 2026-10-11`,
        );
        source(box);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      viewer.scene.requestRender();
    },
    disable(viewer) {
      enabled = false;
      points.show = false;
      request?.abort();
      handler?.destroy();
      handler = null;
      box?.remove();
      unregisterPickOwner(id);
      viewer.scene.requestRender();
    },
    async update(viewer) {
      if (!enabled) return false;
      if (rows.length) return true;
      request?.abort();
      const current = new AbortController();
      request = current;
      try {
        const response = await fetch(`/data/mcf/${kind}.json`, {
          signal: current.signal,
        });
        if (!response.ok) throw new Error('Registret kunde inte läsas');
        const payload = await response.json();
        if (!enabled || current !== request) return false;
        rows = payload.rows;
        points.removeAll();
        rows.forEach((row, index) =>
          points.add({
            id: `${id}:${index}`,
            position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat, 30),
            color,
            pixelSize: kind === 'shelters' ? 5 : 9,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            disableDepthTestDistance: Infinity,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
              0,
              kind === 'shelters' ? 150000 : 1500000,
            ),
          }),
        );
        loadedAt = new Date(payload.downloadedAt);
        error = null;
        viewer.scene.requestRender();
        return true;
      } catch (e) {
        if (!current.signal.aborted) error = e.message;
        return false;
      }
    },
    getStats() {
      return { count: rows.length, lastUpdate: loadedAt, error };
    },
    destroy(viewer) {
      this.disable(viewer);
      viewer.scene.primitives.remove(points);
      rows = [];
    },
  };
}
export function createMcfWms(kind, name, choices) {
  const id = `mcf-${kind}`;
  let imagery,
    viewerRef,
    enabled = false,
    box,
    error = null;
  let selected = choices[0];
  function load() {
    if (imagery) viewerRef.imageryLayers.remove(imagery, true);
    const provider = new Cesium.WebMapServiceImageryProvider({
      url: `/api/mcf/wms?dataset=${kind}`,
      layers: selected[0],
      parameters: { transparent: true, format: 'image/png', version: '1.1.1' },
      rectangle: Cesium.Rectangle.fromDegrees(9, 54, 26, 70),
      maximumLevel: 14,
      credit: SOURCE,
      enablePickFeatures: false,
    });
    provider.errorEvent.addEventListener(() => {
      error = 'MCF kartbilder kunde inte hämtas';
    });
    imagery = viewerRef.imageryLayers.addImageryProvider(provider);
    imagery.alpha = 0.65;
    imagery.show = enabled;
    viewerRef.scene.requestRender();
  }
  return {
    id,
    name,
    icon: '▧',
    source: SOURCE,
    updateInterval: 86400000,
    init(viewer) {
      viewerRef = viewer;
    },
    enable() {
      enabled = true;
      error = null;
      load();
      box?.remove();
      box = panel(name);
      text(
        box,
        kind === 'flood'
          ? 'Beräknade översvämningsscenarier. Kartan visar möjliga utbredningar längs karterade vattendrag.'
          : 'Historiska brandriskvärden, inte aktuell brandrisk. Zooma in för att se rutorna.',
      );
      const select = document.createElement('select');
      for (const [value, label] of choices) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.append(option);
      }
      select.value = selected[0];
      select.onchange = () => {
        selected = choices.find((c) => c[0] === select.value);
        load();
      };
      box.append(select);
      const legend = document.createElement('img');
      legend.alt = 'MCF teckenförklaring';
      legend.style.cssText =
        'display:block;max-width:100%;margin:12px 0;background:white';
      function updateLegend() {
        legend.src = `/api/mcf/wms?dataset=${kind}&service=WMS&request=GetLegendGraphic&format=image/png&layer=${selected[0]}`;
      }
      select.addEventListener('change', updateLegend);
      updateLegend();
      box.append(legend);
      source(box);
    },
    disable() {
      enabled = false;
      if (imagery) imagery.show = false;
      box?.remove();
      viewerRef.scene.requestRender();
    },
    update() {
      return enabled;
    },
    getStats() {
      return { count: imagery ? 1 : 0, error };
    },
    destroy() {
      this.disable();
      if (imagery) viewerRef.imageryLayers.remove(imagery, true);
      imagery = null;
    },
  };
}
export function createMcfLayers() {
  return [
    createMcfPoints('shelters', 'MCF · Skyddsrum', Cesium.Color.CYAN),
    createMcfPoints('stations', 'MCF · Brandstationer', Cesium.Color.ORANGERED),
    createMcfWms('flood', 'MCF · Översvämningsrisk', [
      ['NZ_Oversvamning_100', '100-årsflöde'],
      ['NZ_Oversvamning_200', '200-årsflöde'],
      ['NZ_Oversvamning_BHF', 'Beräknat högsta flöde'],
    ]),
    createMcfWms('fire', 'MCF · Brandrisk, historik', [
      ['Brandriskvarden2024', '2024'],
      ['Brandriskvarden2023', '2023'],
      ['Brandriskvarden2022', '2022'],
      ['Brandriskvarden2022_2', '2022:2'],
      ['Brandriskvarden2021', '2021'],
      ['Brandriskvarden2020', '2020'],
    ]),
  ];
}
