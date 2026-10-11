import { warningFeatures } from './model.js';
import * as Cesium from 'cesium';
import { registerPickOwner, unregisterPickOwner, resolvePickId } from '../../data/pickRegistry.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createSmhiLayer() {
  let data, enabled = false, request, lastUpdate = null, error = null, handler, panel;
  return {
    id: 'smhi', name: 'SMHI · Varningar', icon: '◉', source: 'SMHI', updateInterval: 300000,
    init(viewer) { data = new Cesium.CustomDataSource('smhi'); data.show = false; viewer.dataSources.add(data); },
    enable(viewer) {
      enabled = true; data.show = true;
      registerPickOwner('smhi', id => id.startsWith('smhi:'));
      if (viewer.scene.canvas && !handler) {
        handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction(click => {
          if (!enabled) return;
          const id = resolvePickId(viewer.scene.pick(click.position));
          const entity = id?.startsWith('smhi:') ? data.entities.getById(id) : null;
          if (!entity) return;
          panel?.remove(); panel = document.createElement('section');
          panel.setAttribute('aria-label', 'SMHI disaster report');
          panel.style.cssText = 'position:fixed;right:24px;bottom:85px;width:340px;max-width:80vw;max-height:60vh;overflow:auto;background:#101820;color:white;padding:18px;border:1px solid #999;z-index:10000;font:14px sans-serif';
          const close = document.createElement('button'); close.textContent = 'Stäng ×'; close.onclick = () => panel?.remove(); panel.append(close);
          const content = document.createElement('div'); content.innerHTML = entity.description.getValue();
          content.querySelectorAll('a').forEach(a => a.style.color = '#7edcff'); panel.append(content); document.body.append(panel);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      }
      viewer.scene.requestRender();
    },
    disable(viewer) { enabled = false; request?.abort(); data.show = false; panel?.remove(); unregisterPickOwner('smhi'); handler?.destroy(); handler = null; viewer.scene.requestRender(); },
    async update(viewer) {
      if (!enabled) return false;
      request?.abort(); const current = new AbortController(); request = current;
      try {
        const response = await fetch('/api/smhi/warnings', { signal: current.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'SMHI kunde inte hämtas.');
        if (!enabled || request !== current) return false;
        const collection = warningFeatures(payload.warnings, payload.fetchedAt);
        const loaded = await Cesium.GeoJsonDataSource.load(collection, { clampToGround: true });
        if (!enabled || request !== current) return false;
        const entities = loaded.entities.values.slice();
        for (const entity of entities) {
          const level = entity.properties?.level?.getValue();
          const color = ({ YELLOW: Cesium.Color.YELLOW, ORANGE: Cesium.Color.ORANGE, RED: Cesium.Color.RED, MESSAGE: Cesium.Color.DEEPSKYBLUE })[level] || Cesium.Color.GRAY;
          if (entity.polygon) { entity.polygon.material = color.withAlpha(0.22); entity.polygon.outline = true; entity.polygon.outlineColor = color; }
        }
        data.entities.removeAll(); entities.forEach(entity => data.entities.add(entity));
        lastUpdate = new Date(payload.fetchedAt); error = null; viewer.scene.requestRender(); return true;
      } catch (e) { if (!current.signal.aborted) error = e.message; return false; }
    },
    getStats() { return { count: data?.entities.values.length || 0, lastUpdate, error }; },
    destroy(viewer) { this.disable(viewer); if (data) viewer.dataSources.remove(data, true); data = null; },
  };
}



