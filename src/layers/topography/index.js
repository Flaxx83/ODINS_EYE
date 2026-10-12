import * as C from 'cesium';
export function createTopographyLayers() {
  return [
    ['administrativindelning', 'Gränser', C.Color.YELLOW],
    ['kommunikation', 'Vägar och järnvägar', C.Color.ORANGE],
    ['hydrografi', 'Vattendrag', C.Color.CYAN],
  ].map(([theme, name, color]) => {
    let viewer,
      data,
      enabled = false,
      request,
      timer,
      last = '',
      count = 0,
      error = null,
      listener;
    const layer = {
      id: 'lm-' + theme,
      name: 'Lantmäteriet · ' + name,
      category: 'infrastructure',
      init(v) {
        viewer = v;
        data = new C.GeoJsonDataSource(this.id);
        data.show = false;
        v.dataSources.add(data);
      },
      enable() {
        enabled = true;
        data.show = true;
        listener = () => {
          clearTimeout(timer);
          timer = setTimeout(() => layer.update(), 500);
        };
        viewer.camera.moveEnd.addEventListener(listener);
      },
      disable() {
        enabled = false;
        request?.abort();
        clearTimeout(timer);
        viewer.camera.moveEnd.removeEventListener(listener);
        data.show = false;
      },
      async update() {
        if (!enabled) return;
        const r = viewer.camera.computeViewRectangle();
        if (!r) return;
        let box = [r.west, r.south, r.east, r.north].map(C.Math.toDegrees);
        box = [
          Math.max(10, box[0]),
          Math.max(54, box[1]),
          Math.min(25, box[2]),
          Math.min(70, box[3]),
        ];
        if (box[0] >= box[2] || box[1] >= box[3]) {
          data.entities.removeAll();
          count = 0;
          return;
        }
        const h = viewer.camera.positionCartographic.height;
        const scale = h > 250000 ? '1m' : h > 60000 ? '250' : '100';
        const key = scale + box.map((x) => x.toFixed(3)).join(',');
        if (key === last) return;
        request?.abort();
        const current = new AbortController();
        request = current;
        try {
          const response = await fetch(
            `/api/topography?theme=${theme}&scale=${scale}&bbox=${box.join(',')}`,
            { signal: current.signal },
          );
          if (!response.ok) throw Error('Kartdata kunde inte läsas');
          const geo = await response.json();
          if (current.signal.aborted || !enabled) return;
          const staged = new C.GeoJsonDataSource(layer.id);
          await staged.load(geo, {
            stroke: color,
            strokeWidth: theme === 'administrativindelning' ? 2 : 1.5,
            clampToGround: true,
          });
          if (current.signal.aborted || !enabled) return;
          viewer.dataSources.remove(data, true);
          data = staged;
          viewer.dataSources.add(data);
          count = geo.features.length;
          error = geo.truncated ? 'Zooma in för att visa fler objekt' : null;
          last = key;
          viewer.scene.requestRender();
          return true;
        } catch (e) {
          if (!current.signal.aborted) error = e.message;
          return false;
        }
      },
      getStats() {
        return { count, error };
      },
      destroy() {
        this.disable();
        viewer.dataSources.remove(data, true);
      },
    };
    return layer;
  });
}

/** Transparent reference tiles above satellite imagery; includes place names and boundaries. */
export function createPlaceNamesLayer() {
  let viewer,
    imagery,
    enabled = false,
    error = null;
  return {
    id: 'place-labels',
    name: 'Ortsnamn · Esri',
    category: 'infrastructure',
    init(v) {
      viewer = v;
      imagery = C.ImageryLayer.fromProviderAsync(
        C.ArcGisMapServerImageryProvider.fromUrl(
          'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer',
          {
            enablePickFeatures: false,
            credit: 'Esri · World Boundaries and Places',
          },
        ),
        { show: false },
      );
      imagery.errorEvent.addEventListener(() => {
        error = 'Ortsnamn kunde inte hämtas från Esri.';
      });
      viewer.imageryLayers.add(imagery);
    },
    enable() {
      enabled = true;
      imagery.show = true;
      viewer.imageryLayers.raiseToTop(imagery);
      viewer.scene.requestRender();
    },
    disable() {
      enabled = false;
      if (imagery) imagery.show = false;
      viewer?.scene.requestRender();
    },
    update() {
      if (enabled && imagery) viewer.imageryLayers.raiseToTop(imagery);
    },
    getStats() {
      return { count: imagery?.ready ? 1 : 0, error };
    },
    destroy() {
      enabled = false;
      if (viewer && imagery) viewer.imageryLayers.remove(imagery, true);
      imagery = null;
    },
  };
}
