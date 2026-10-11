import * as Cesium from 'cesium';

const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
export function createLiveuamapLayer() {
  let data,
    enabled = false,
    request,
    lastUpdate = null,
    error = null;
  return {
    id: 'liveuamap',
    name: 'Liveuamap · Events',
    icon: '◉',
    source: 'Liveuamap',
    updateInterval: 600000,
    init(viewer) {
      data = new Cesium.CustomDataSource('liveuamap');
      data.show = false;
      viewer.dataSources.add(data);
    },
    enable(viewer) {
      enabled = true;
      data.show = true;
      viewer.scene.requestRender();
    },
    disable(viewer) {
      enabled = false;
      request?.abort();
      data.show = false;
      viewer.scene.requestRender();
    },
    async update(viewer) {
      if (!enabled) return false;
      request?.abort();
      const current = new AbortController();
      request = current;
      try {
        const response = await fetch('/api/liveuamap/events', {
          signal: current.signal,
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || 'Liveuamap kunde inte hämtas.');
        if (!enabled || request !== current) return false;
        const entities = payload.events.map(
          (row) =>
            new Cesium.Entity({
              id: `liveuamap:${row.id}`,
              name: row.title,
              position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
              point: {
                pixelSize: 11,
                color: Cesium.Color.ORANGE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
              description: `<p>${escape(row.title)}</p><p>${escape(row.time || '')}</p>${row.link ? `<p><a href="${escape(row.link)}" target="_blank" rel="noopener noreferrer">Öppna händelsen</a></p>` : ''}${row.source ? `<p><a href="${escape(row.source)}" target="_blank" rel="noopener noreferrer">Ursprungskälla</a></p>` : ''}<p>Källa: <a href="https://liveuamap.com/" target="_blank" rel="noopener noreferrer">Liveuamap</a></p>`,
            }),
        );
        data.entities.removeAll();
        entities.forEach((entity) => data.entities.add(entity));
        lastUpdate = new Date(payload.fetchedAt);
        error = null;
        viewer.scene.requestRender();
        return true;
      } catch (e) {
        if (!current.signal.aborted) error = e.message;
        return false;
      }
    },
    getStats() {
      return { count: data?.entities.values.length || 0, lastUpdate, error };
    },
    destroy(viewer) {
      enabled = false;
      request?.abort();
      if (data) viewer.dataSources.remove(data, true);
      data = null;
    },
  };
}
