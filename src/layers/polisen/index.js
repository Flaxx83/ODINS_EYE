import { createMapLabels } from '../local-ai/map-labels.js';
import * as Cesium from 'cesium';
import { filterPoliceEvents, groupPoliceEvents } from './model.js';
import {
  registerPickOwner,
  unregisterPickOwner,
  resolvePickId,
} from '../../data/pickRegistry.js';
function text(el, value) {
  const p = document.createElement('p');
  p.textContent = value;
  el.append(p);
  return p;
}
export function createPoliceLayer() {
  const labels = createMapLabels();
  let data,
    viewer,
    enabled = false,
    request,
    handler,
    panel,
    list,
    status,
    area,
    type,
    date,
    search,
    all = [],
    groups = new Map(),
    lastUpdate,
    error,
    selected = null,
    shown = 50;
  function render() {
    if (!list) return;
    const events = filterPoliceEvents(all, {
      area: area.value,
      type: type.value,
      date: date.value,
      search: search.value,
    });
    data.entities.removeAll();
    groups = new Map();
    for (const g of groupPoliceEvents(events)) {
      const id = 'polisen:' + g.id;
      groups.set(id, g);
      data.entities.add({
        id,
        name:
          (g.events[0].place || g.events[0].area) +
          ' · ' +
          g.events.length +
          ' notiser',
        position: Cesium.Cartesian3.fromDegrees(g.lon, g.lat),
        point: {
          pixelSize: 12,
          color: Cesium.Color.DODGERBLUE,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Infinity,
        },
      });
    }
    labels.replace(data.entities.values, viewer);
    const selectedEvents = selected ? groups.get(selected)?.events : null;
    const visible = selectedEvents || events;
    if (selected && !selectedEvents) selected = null;
    list.replaceChildren();
    status.textContent = `${events.length} notiser i ${groups.size} områdesmarkörer. Hämtat: ${lastUpdate ? lastUpdate.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }) : '—'}`;
    if (selected) {
      const clear = document.createElement('button');
      clear.textContent = 'Visa hela urvalet';
      clear.onclick = () => {
        selected = null;
        shown = 50;
        render();
      };
      list.append(clear);
    }
    for (const row of visible.slice(0, shown)) {
      const article = document.createElement('article');
      article.style.cssText = 'border-top:1px solid #555;padding:8px 0';
      const h = document.createElement('h4');
      h.textContent = row.title;
      article.append(h);
      text(article, row.summary);
      text(article, `${row.area} · ${row.type}`);
      text(
        article,
        row.positionKind === 'approximate-town'
          ? 'Ort från rubriken: ' + row.place + ' – exakt händelseplats okänd.'
          : 'Polisens områdeskoordinat – exakt händelseplats okänd.',
      );
      if (row.url) {
        const a = document.createElement('a');
        a.href = row.url;
        a.textContent = 'Läs hos Polisen';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.style.color = '#7edcff';
        article.append(a);
      }
      list.append(article);
    }
    if (!visible.length) text(list, 'Inga notiser i detta urval.');
    if (visible.length > shown) {
      const more = document.createElement('button');
      more.textContent = 'Visa fler notiser';
      more.onclick = () => {
        shown += 50;
        render();
      };
      list.append(more);
    }
    viewer.scene.requestRender();
  }
  function options(select, values, title) {
    const previous = select.value;
    select.replaceChildren();
    for (const value of ['', ...values]) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = value || title;
      select.append(o);
    }
    select.value = values.includes(previous) ? previous : '';
  }
  function open() {
    panel?.remove();
    panel = document.createElement('section');
    panel.setAttribute('aria-label', 'Polisen · Händelser');
    panel.style.cssText =
      'position:fixed;right:24px;bottom:85px;width:450px;max-width:85vw;max-height:70vh;overflow:auto;background:#101820;color:white;padding:18px;border:1px solid #999;z-index:10000;font:14px sans-serif';
    const close = document.createElement('button');
    close.textContent = 'Stäng ×';
    close.onclick = () => panel.remove();
    panel.append(close);
    const h = document.createElement('h3');
    h.textContent = 'Polisen · Händelser';
    panel.append(h);
    text(
      panel,
      'Ortsnamn i rubriken matchas inom angivet län och visas som ungefärliga ortspunkter. Omatchade notiser behåller Polisens områdeskoordinat. Ett urval av publicerade notiser; uppgifterna är preliminära och kan ändras.',
    );
    area = document.createElement('select');
    area.setAttribute('aria-label', 'Polisen område');
    type = document.createElement('select');
    type.setAttribute('aria-label', 'Polisen händelsetyp');
    date = document.createElement('input');
    date.type = 'date';
    date.setAttribute('aria-label', 'Polisen datum');
    search = document.createElement('input');
    search.placeholder = 'Sök plats eller text';
    search.setAttribute('aria-label', 'Sök polisnotiser');
    panel.append(area, type, date, search);
    for (const el of [area, type, date, search])
      el.oninput = () => {
        selected = null;
        shown = 50;
        render();
      };
    status = text(panel, 'Hämtar…');
    list = document.createElement('div');
    panel.append(list);
    text(
      panel,
      'Källa: Polisen. Ortspunkter: GeoNames, CC BY 4.0 (geonames.org), bearbetade med ortsmatchning. Uppdatering var femte minut. Urvalet begränsas till API:ts senaste 500 notiser.',
    );
    document.body.append(panel);
    options(area, [...new Set(all.map((e) => e.area))].sort(), 'Alla områden');
    options(
      type,
      [...new Set(all.map((e) => e.type))].sort(),
      'Alla händelsetyper',
    );
    if (all.length) render();
  }
  return {
    id: 'polisen',
    name: 'Polisen · Händelser',
    icon: '◉',
    source: 'Polisen',
    updateInterval: 300000,
    init(v) {
      viewer = v;
      data = new Cesium.CustomDataSource('polisen');
      data.show = false;
      v.dataSources.add(data);
    },
    enable(v) {
      enabled = true;
      data.show = true;
      open();
      registerPickOwner('polisen', (id) => id.startsWith('polisen:'));
      handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
      handler.setInputAction((click) => {
        const id = resolvePickId(v.scene.pick(click.position));
        if (!groups.has(id)) return;
        if (!panel?.isConnected) open();
        selected = id;
        shown = 50;
        render();
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    },
    disable(v) {
      labels.clear();
      enabled = false;
      request?.abort();
      handler?.destroy();
      handler = null;
      panel?.remove();
      data.show = false;
      unregisterPickOwner('polisen');
      v.scene.requestRender();
    },
    async update() {
      if (!enabled || document.hidden) return false;
      request?.abort();
      const current = new AbortController();
      request = current;
      try {
        const r = await fetch('/api/polisen/events', {
          signal: current.signal,
        });
        const p = await r.json();
        if (!r.ok) throw new Error(p.error);
        if (!enabled || request !== current) return false;
        all = p.events;
        lastUpdate = new Date(p.fetchedAt);
        error = null;
        options(
          area,
          [...new Set(all.map((e) => e.area))].sort(),
          'Alla områden',
        );
        options(
          type,
          [...new Set(all.map((e) => e.type))].sort(),
          'Alla händelsetyper',
        );
        render();
        return true;
      } catch (e) {
        if (!current.signal.aborted) {
          error = e.message;
          data.entities.removeAll();
          groups.clear();
          status.textContent = error;
          list.replaceChildren();
          viewer.scene.requestRender();
        }
        return false;
      }
    },
    getStats() {
      return {
        count: filterPoliceEvents(all, {
          area: area?.value,
          type: type?.value,
          date: date?.value,
          search: search?.value,
        }).length,
        lastUpdate,
        error,
      };
    },
    destroy(v) {
      this.disable(v);
      v.dataSources.remove(data, true);
    },
  };
}
