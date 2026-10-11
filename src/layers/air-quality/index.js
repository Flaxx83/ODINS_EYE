import * as C from 'cesium';
import {
  registerPickOwner,
  unregisterPickOwner,
  resolvePickId,
} from '../../data/pickRegistry.js';
const names = { 6001: 'PM2,5', 5: 'PM10', 8: 'Kvävedioxid', 7: 'Ozon' };
export function createAirQualityLayer() {
  let viewer,
    data,
    enabled = false,
    panel,
    select,
    stationSelect,
    info,
    status,
    handler,
    timer,
    rows = [],
    fetchedAt,
    error,
    selected = null,
    request;
  const text = (el, s) => {
    const p = document.createElement('p');
    p.textContent = s;
    el.append(p);
  };
  function show(row) {
    selected = row.id;
    info.replaceChildren();
    const latest = row.history.at(-1);
    text(info, row.name);
    text(
      info,
      `${names[row.pollutant]}: ${latest.value.toFixed(2)} ${row.unit === 'ug.m-3' ? 'µg/m³' : row.unit} (${row.aggregation})`,
    );
    const old = Date.now() - Date.parse(latest.time) > 6 * 3600000;
    text(
      info,
      `Mättid: ${new Date(latest.time).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}${old ? ' · Äldre än 6 timmar' : ''}`,
    );
    text(info, 'Preliminära mätningar (EEA E2a). Ingen riskklassning.');
    const history = row.history;
    const values = history.map((p) => p.value);
    let min = Math.min(...values),
      max = Math.max(...values);
    if (min === max) max = min + 1;
    const t0 = Date.parse(history[0].time),
      t1 = Date.parse(latest.time);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 360 140');
    svg.style.width = '100%';
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      `Mätkurva för ${row.name}, ${names[row.pollutant]}`,
    );
    const line = document.createElementNS(svg.namespaceURI, 'polyline');
    line.setAttribute(
      'points',
      history
        .map(
          (p) =>
            `${10 + (340 * (Date.parse(p.time) - t0)) / Math.max(1, t1 - t0)},${130 - (120 * (p.value - min)) / (max - min)}`,
        )
        .join(' '),
    );
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#80dfff');
    line.setAttribute('stroke-width', '2');
    svg.append(line);
    info.append(svg);
    text(
      info,
      `Kurvans skala: ${min.toFixed(2)}–${max.toFixed(2)} ${row.unit}. ${history.length} mätningar under senaste tre dygnen.`,
    );
    text(
      info,
      `${new Date(history[0].time).toLocaleString('sv-SE')} – ${new Date(latest.time).toLocaleString('sv-SE')}`,
    );
  }
  function render() {
    data.entities.removeAll();
    const visible = rows.filter((r) => r.pollutant === Number(select.value));
    for (const row of visible) {
      const latest = row.history.at(-1),
        old = Date.now() - Date.parse(latest.time) > 6 * 3600000;
      data.entities.add({
        id: 'air-quality:' + row.id,
        name: row.name,
        position: C.Cartesian3.fromDegrees(row.lon, row.lat),
        point: {
          pixelSize: 10,
          color: old ? C.Color.GRAY : C.Color.LIGHTSKYBLUE,
          outlineColor: C.Color.WHITE,
          outlineWidth: 1,
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Infinity,
        },
      });
    }
    stationSelect.replaceChildren();
    const prompt = document.createElement('option');
    prompt.value = '';
    prompt.textContent = 'Välj station eller klicka på kartan';
    stationSelect.append(prompt);
    for (const row of visible) {
      const o = document.createElement('option');
      o.value = row.id;
      o.textContent = row.name;
      stationSelect.append(o);
    }
    stationSelect.value = selected || '';
    status.textContent = `${visible.length} mätserier · hämtat ${fetchedAt ? new Date(fetchedAt).toLocaleString('sv-SE') : '—'}${error ? ' · ' + error : ''}`;
    const current = visible.find((r) => r.id === selected);
    info.replaceChildren();
    if (current) show(current);
    else {
      selected = null;
      text(
        info,
        'Klicka på en stationspunkt. Grå punkter har mätningar äldre än sex timmar.',
      );
    }
    viewer.scene.requestRender();
  }
  return {
    id: 'air-quality',
    name: 'EEA · Luftkvalitet Sverige',
    category: 'weather',
    init(v) {
      viewer = v;
      data = new C.CustomDataSource('air-quality');
      data.show = false;
      v.dataSources.add(data);
    },
    enable() {
      enabled = true;
      data.show = true;
      panel = document.createElement('aside');
      panel.style.cssText =
        'position:fixed;right:16px;bottom:40px;width:390px;max-height:65vh;overflow:auto;background:#141d26ef;color:white;padding:14px;z-index:1200;border:1px solid #80dfff';
      text(panel, 'Luftkvalitet · Sverige');
      select = document.createElement('select');
      for (const [id, name] of Object.entries(names)) {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = name;
        select.append(o);
      }
      select.value = '6001';
      select.onchange = render;
      panel.append(select);
      stationSelect = document.createElement('select');
      stationSelect.style.maxWidth = '100%';
      stationSelect.onchange = () => {
        const row = rows.find((r) => r.id === stationSelect.value);
        if (row) show(row);
      };
      panel.append(stationSelect);
      status = document.createElement('p');
      panel.append(status);
      info = document.createElement('div');
      panel.append(info);
      const a = document.createElement('a');
      a.href =
        'https://www.eea.europa.eu/en/datahub/datahubitem-view/778ef9f5-6293-4846-badd-56a29c70880d';
      a.textContent = 'Källa: European Environment Agency';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      panel.append(a);
      document.body.append(panel);
      registerPickOwner('air-quality', (id) => id.startsWith('air-quality:'));
      handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((click) => {
        const id = resolvePickId(viewer.scene.pick(click.position));
        const row = rows.find((r) => 'air-quality:' + r.id === id);
        if (row) show(row);
      }, C.ScreenSpaceEventType.LEFT_CLICK);
      timer = setInterval(() => this.update(), 3600000);
    },
    disable() {
      enabled = false;
      request?.abort();
      clearInterval(timer);
      handler?.destroy();
      panel?.remove();
      data.show = false;
      unregisterPickOwner('air-quality');
    },
    async update() {
      if (!enabled || document.hidden) return false;
      request?.abort();
      const current = new AbortController();
      request = current;
      try {
        const r = await fetch('/api/air-quality', { signal: current.signal });
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!enabled || current.signal.aborted) return false;
        rows = d.series;
        fetchedAt = d.fetchedAt;
        error = d.refreshFailed
          ? 'Uppdatering misslyckades; tidigare data visas'
          : null;
        render();
        return true;
      } catch (e) {
        if (!current.signal.aborted) {
          error = e.message;
          status.textContent = error;
        }
        return false;
      }
    },
    getStats() {
      return {
        count: rows.filter((r) => r.pollutant === Number(select?.value)).length,
        error,
        lastUpdate: fetchedAt ? new Date(fetchedAt) : null,
      };
    },
    destroy() {
      this.disable();
      viewer.dataSources.remove(data, true);
    },
  };
}
