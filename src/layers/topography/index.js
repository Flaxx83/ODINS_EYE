import * as C from 'cesium';
export function createTopographyLayers() {
  return [
    ['administrativindelning', 'Gränser', C.Color.YELLOW],
    [
      'kommunikation',
      'Vägar och järnvägar',
      C.Color.fromCssColorString('#c3c8cf'),
    ],
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
      listener,
      legend;
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
        if (theme === 'kommunikation' && !legend) {
          legend = document.createElement('aside');
          legend.setAttribute(
            'aria-label',
            'Teckenförklaring vägar och järnvägar',
          );
          Object.assign(legend.style, {
            position: 'fixed',
            right: '20px',
            bottom: '120px',
            zIndex: '30',
            background: 'rgba(10,18,21,.94)',
            color: '#e7edf1',
            padding: '12px',
            border: '1px solid #34454b',
            borderRadius: '12px',
            fontSize: '12px',
            maxWidth: 'calc(100vw - 40px)',
            pointerEvents: 'none',
          });
          for (const [title, tone, dashed] of [
            ['Väg', '#c3c8cf', false],
            ['Järnväg / spår', '#bd77ff', false],
            ['Färjeled', '#43bfd0', true],
          ]) {
            const row = document.createElement('div');
            Object.assign(row.style, {
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              margin: '4px 0',
            });
            const swatch = document.createElement('span');
            swatch.setAttribute('aria-hidden', 'true');
            Object.assign(swatch.style, {
              width: '28px',
              borderTop: '3px ' + (dashed ? 'dashed' : 'solid') + ' ' + tone,
            });
            row.append(swatch, document.createTextNode(title));
            legend.append(row);
          }
          const note = document.createElement('div');
          note.textContent = 'Lantmäteriets kartlager · ej vald resväg';
          legend.append(note);
          document.body.append(legend);
        }
        listener = () => {
          clearTimeout(timer);
          timer = setTimeout(() => layer.update(), 500);
        };
        viewer.camera.moveEnd.addEventListener(listener);
      },
      disable() {
        enabled = false;
        legend?.remove();
        legend = undefined;
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
          if (theme === 'kommunikation') {
            for (const entity of staged.entities.values) {
              if (!entity.polyline) continue;
              const kind = entity.properties?.typ?.getValue();
              if (kind === 'ralstrafik') {
                entity.polyline.width = 3;
                entity.polyline.zIndex = 2;
                entity.polyline.material = new C.ColorMaterialProperty(
                  C.Color.fromCssColorString('#bd77ff'),
                );
                entity.name = 'Järnväg / spår · Lantmäteriet';
              } else if (kind === 'farjeled') {
                entity.polyline.width = 2;
                entity.polyline.material = new C.PolylineDashMaterialProperty({
                  color: C.Color.fromCssColorString('#43bfd0'),
                  dashLength: 20,
                });
                entity.name = 'Färjeled · Lantmäteriet';
              } else {
                entity.polyline.width = kind === 'ovrig_vag' ? 1 : 1.5;
                entity.polyline.material = new C.ColorMaterialProperty(
                  C.Color.fromCssColorString('#c3c8cf'),
                );
                entity.name = ['vaglinje', 'ovrig_vag'].includes(kind)
                  ? 'Väg · Lantmäteriet'
                  : 'Kommunikation · Lantmäteriet';
              }
            }
          }
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
