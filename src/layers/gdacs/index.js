import * as Cesium from 'cesium';
import { registerPickOwner, unregisterPickOwner, resolvePickId } from '../../data/pickRegistry.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createGdacsLayer() {
  let data, enabled = false, request, lastUpdate = null, error = null, handler, panel;
  return {
    id: 'gdacs', name: 'GDACS · Disaster alerts', icon: '◉', source: 'GDACS', updateInterval: 900000,
    init(viewer) { data = new Cesium.CustomDataSource('gdacs'); data.show = false; viewer.dataSources.add(data); },
    enable(viewer) {
      enabled = true; data.show = true;
      registerPickOwner('gdacs', id => id.startsWith('gdacs:'));
      if (viewer.scene.canvas && !handler) {
        handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction(click => {
          if (!enabled) return;
          const id = resolvePickId(viewer.scene.pick(click.position));
          const entity = id?.startsWith('gdacs:') ? data.entities.getById(id) : null;
          if (!entity) return;
          panel?.remove(); panel = document.createElement('section');
          panel.setAttribute('aria-label', 'GDACS disaster report');
          panel.style.cssText = 'position:fixed;right:24px;bottom:85px;width:340px;max-width:80vw;max-height:60vh;overflow:auto;background:#101820;color:white;padding:18px;border:1px solid #999;z-index:10000;font:14px sans-serif';
          const close = document.createElement('button'); close.textContent = 'Stäng ×'; close.onclick = () => panel?.remove(); panel.append(close);
          const content = document.createElement('div'); content.innerHTML = entity.description.getValue();
          content.querySelectorAll('a').forEach(a => a.style.color = '#7edcff'); panel.append(content); document.body.append(panel);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      }
      viewer.scene.requestRender();
    },
    disable(viewer) { enabled = false; request?.abort(); data.show = false; panel?.remove(); unregisterPickOwner('gdacs'); handler?.destroy(); handler = null; viewer.scene.requestRender(); },
    async update(viewer) {
      if (!enabled) return false;
      request?.abort(); const current = new AbortController(); request = current;
      try {
        const response = await fetch('/api/gdacs/events', { signal: current.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'GDACS kunde inte hämtas.');
        if (!enabled || request !== current) return false;
        const entities = payload.events.map(row => new Cesium.Entity({
          id: `gdacs:${row.id}`, name: row.title,
          position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
          point: { pixelSize: 11, color: ({ Red: Cesium.Color.RED, Orange: Cesium.Color.ORANGE, Green: Cesium.Color.LIME })[row.alert] || Cesium.Color.GRAY, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          description: `<p>${escape(row.title)}</p><p>${escape(row.time || '')} – ${escape(row.endTime)}</p><p>${escape(row.country)} · ${escape(row.category)} · ${escape(row.alert)}</p><p>${escape(row.summary)}</p><p>${escape(row.severity)} ${escape(row.unit)}</p>${row.link ? `<p><a href="${escape(row.link)}" target="_blank" rel="noopener noreferrer">Öppna händelsen</a></p>` : ''}${row.source ? `<p><a href="${escape(row.source)}" target="_blank" rel="noopener noreferrer">Ursprungskälla</a></p>` : ''}<p>Källa: <a href="https://www.gdacs.org/" target="_blank" rel="noopener noreferrer">GDACS</a></p>`,
        }));
        data.entities.removeAll(); entities.forEach(entity => data.entities.add(entity));
        lastUpdate = new Date(payload.fetchedAt); error = null; viewer.scene.requestRender(); return true;
      } catch (e) { if (!current.signal.aborted) error = e.message; return false; }
    },
    getStats() { return { count: data?.entities.values.length || 0, lastUpdate, error }; },
    destroy(viewer) { this.disable(viewer); if (data) viewer.dataSources.remove(data, true); data = null; },
  };
}


