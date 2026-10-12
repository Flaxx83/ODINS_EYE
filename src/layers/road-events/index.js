import * as C from 'cesium';
import {
  registerPickOwner,
  unregisterPickOwner,
  resolvePickId,
} from '../../data/pickRegistry.js';
const missing = 'Uppgift saknas';
const clock = (value) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })
    : missing;
export function createRoadEventsLayer() {
  let viewer,
    data,
    handler,
    panel,
    enabled = false,
    controller,
    timer,
    listener,
    result,
    selected,
    loading = false,
    error = null;
  const rows = new Map();
  function close() {
    panel?.remove();
    panel = null;
    selected = null;
  }
  function show(id) {
    const e = rows.get(id);
    if (!e) return;
    close();
    selected = id;
    panel = document.createElement('section');
    panel.className = 'road-event-card';
    panel.setAttribute('aria-label', 'Väghändelse');
    const button = document.createElement('button');
    button.textContent = 'Stäng';
    button.onclick = close;
    panel.append(button);
    const h = document.createElement('h3');
    h.textContent = e.kind + ' · ' + (e.road || e.place || missing);
    panel.append(h);
    const overlapping = [...rows.entries()].filter(
      ([, r]) => Math.hypot(r.lat - e.lat, r.lon - e.lon) < 0.0002,
    );
    if (overlapping.length > 1) {
      const choose = document.createElement('select');
      choose.setAttribute('aria-label', 'Välj rapport vid samma plats');
      for (const [key, r] of overlapping) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent =
          r.kind + ' · ' + (r.description || r.road || r.id).slice(0, 100);
        choose.append(option);
      }
      choose.value = id;
      choose.onchange = () => show(choose.value);
      panel.append(choose);
    }
    for (const text of [
      e.description || missing,
      e.place || missing,
      'Rapporterad påverkan: ' + (e.severity || missing),
      'Övergripande giltighet från: ' + clock(e.start),
      e.detailedValidity
        ? 'Återkommande/detaljerade tider finns. Att händelsen pågår just nu är inte verifierat.'
        : '',
      'Rapporterat slut: ' + clock(e.end),
      'Senast ändrad: ' + clock(e.ModifiedTime),
      'Hämtad: ' +
        clock(
          result.sources.find((s) => s.type === 'Datex-' + e.feed)?.fetchedAt,
        ),
      result.stale ? 'Gammal cache · uppdatering misslyckades' : '',
      result.partial ? 'Delvis tillgängliga källor' : '',
      result.note,
    ]) {
      if (!text) continue;
      const p = document.createElement('p');
      p.textContent = text;
      panel.append(p);
    }
    const a = document.createElement('a');
    a.href = 'https://data.trafikverket.se/';
    a.textContent = 'Källa: Trafikverket · DATEX II';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    panel.append(a);
    document.body.append(panel);
  }
  const layer = {
    id: 'road-events',
    name: 'Trafikverket · Väghändelser',
    category: 'infrastructure',
    source: 'Trafikverket · DATEX II',
    updateInterval: 60000,
    init(v) {
      viewer = v;
      data = new C.CustomDataSource('road-events');
      data.show = false;
      v.dataSources.add(data);
    },
    enable() {
      enabled = true;
      data.show = true;
      registerPickOwner('road-events', (id) => id.startsWith('road-event:'));
      handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((click) => {
        const id = resolvePickId(viewer.scene.pick(click.position));
        if (rows.has(id)) show(id);
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
      close();
      unregisterPickOwner('road-events');
      if (data) data.show = false;
      viewer?.scene.requestRender();
    },
    async update() {
      if (!enabled || document.hidden) return false;
      const rectangle = viewer.camera.computeViewRectangle();
      if (!rectangle) return false;
      const box = [
        rectangle.west,
        rectangle.south,
        rectangle.east,
        rectangle.north,
      ].map(C.Math.toDegrees);
      if (box[2] - box[0] > 30 || box[3] - box[1] > 20) {
        error = 'Zooma in över Sverige för att visa väghändelser';
        data.entities.removeAll();
        rows.clear();
        close();
        return false;
      }
      controller?.abort();
      const request = new AbortController();
      controller = request;
      loading = true;
      try {
        const response = await fetch(
          '/api/road-events?' + new URLSearchParams({ bbox: box.join(',') }),
          { signal: request.signal },
        );
        if (!response.ok) throw Error();
        const next = await response.json();
        if (request.signal.aborted || !enabled) return false;
        result = next;
        rows.clear();
        data.entities.removeAll();
        for (const e of result.events) {
          const id = 'road-event:' + e.id;
          rows.set(id, e);
          data.entities.add({
            id,
            name: e.kind,
            position: C.Cartesian3.fromDegrees(e.lon, e.lat),
            point: {
              pixelSize: 11,
              color:
                e.kind === 'Olycka'
                  ? C.Color.RED
                  : e.kind === 'Kö'
                    ? C.Color.YELLOW
                    : C.Color.ORANGE,
              outlineColor: C.Color.BLACK,
              outlineWidth: 2,
              heightReference: C.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Infinity,
            },
          });
        }
        error = !result.available
          ? 'Trafikverkets händelsekällor är otillgängliga'
          : result.partial
            ? 'Delvis tillgängliga källor'
            : result.stale
              ? 'Gammal cache'
              : result.truncated
                ? 'Urvalet är begränsat; zooma in'
                : null;
        if (selected) {
          if (rows.has(selected)) show(selected);
          else close();
        }
        viewer.scene.requestRender();
        return true;
      } catch {
        if (!request.signal.aborted) {
          error = 'Väghändelser kunde inte hämtas';
          rows.clear();
          data.entities.removeAll();
          close();
        }
        return false;
      } finally {
        if (controller === request) loading = false;
      }
    },
    getStats() {
      return {
        count: rows.size,
        error,
        status: loading ? 'loading' : error ? 'partial' : 'ready',
        fetchedAt:
          result?.sources
            .map((s) => s.fetchedAt)
            .filter((t) => Number.isFinite(Date.parse(t)))
            .sort()[0] || null,
        checkedAt: result?.checkedAt,
      };
    },
    destroy() {
      layer.disable();
      if (viewer && data) viewer.dataSources.remove(data, true);
    },
  };
  return layer;
}
