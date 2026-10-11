import { createMapLabels } from '../local-ai/map-labels.js';
import * as Cesium from 'cesium';
export function createSelectedTransitRoute() {
  const labels = createMapLabels();
  let viewer,
    data,
    request,
    selection = 0;
  return {
    init(v) {
      viewer = v;
      data = new Cesium.CustomDataSource('selected-transit-route');
      v.dataSources.add(data);
    },
    clear() {
      labels.clear();
      selection++;
      request?.abort();
      request = null;
      data?.entities.removeAll();
      viewer?.scene.requestRender();
    },
    async show(row, operator, container) {
      this.clear();
      if (!row.tripId) return;
      const status = document.createElement('p');
      status.textContent = 'Hämtar planerad färdväg…';
      container.append(status);
      const current = new AbortController();
      request = current;
      const token = selection;
      try {
        const path =
          operator === 'vasttrafik'
            ? '/api/vasttrafik/route'
            : operator === 'sl'
              ? '/api/sl/route'
              : '/api/regional-route/' + operator;
        const r = await fetch(
          path + '?trip=' + encodeURIComponent(row.tripId),
          { signal: current.signal },
        );
        const p = await r.json();
        if (!r.ok) throw new Error(p.error);
        if (
          token !== selection ||
          current.signal.aborted ||
          !container.isConnected
        )
          return;
        const coordinates = p.coordinates;
        if (
          !Array.isArray(coordinates) ||
          coordinates.length < 2 ||
          coordinates.some(
            (c) =>
              !Array.isArray(c) ||
              !Number.isFinite(c[0]) ||
              !Number.isFinite(c[1]) ||
              Math.abs(c[0]) > 180 ||
              Math.abs(c[1]) > 90,
          )
        )
          throw new Error('Ogiltig färdväg');
        data.entities.add({
          id: 'selected-route',
          name: 'Planerad färdväg',
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(coordinates.flat()),
            width: 4,
            material: Cesium.Color.CYAN,
            clampToGround: true,
          },
        });
        for (const [index, stop] of (p.stops || []).entries())
          if (Number.isFinite(stop.lon) && Number.isFinite(stop.lat))
            data.entities.add({
              id: 'route-stop:' + index,
              name: stop.name + (stop.platform ? ' · ' + stop.platform : ''),
              position: Cesium.Cartesian3.fromDegrees(stop.lon, stop.lat),
              point: {
                pixelSize: 8,
                color: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.CYAN,
                outlineWidth: 2,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Infinity,
              },
            });
        labels.replace(data.entities.values, viewer);
        status.textContent =
          operator === 'vasttrafik'
            ? `Cyan linje: planerad färdväg med ${p.stops?.length || 0} hållplatslägen. Turmarkören visas separat.`
            : 'Cyan linje: turens planerade färdväg. Fordonsmarkören visar rapporterad position.';
        const hide = document.createElement('button');
        hide.textContent = 'Dölj färdväg';
        hide.onclick = () => {
          this.clear();
          status.textContent = 'Färdvägen är dold.';
          hide.remove();
        };
        container.append(hide);
        const close = container.querySelector('button');
        close?.addEventListener('click', () => this.clear(), { once: true });
        viewer.scene.requestRender();
      } catch (e) {
        if (!current.signal.aborted && token === selection)
          status.textContent = e.message;
      }
    },
    destroy() {
      this.clear();
      if (data) viewer.dataSources.remove(data, true);
      data = null;
    },
  };
}
