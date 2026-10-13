import * as C from 'cesium';

export function createReachabilityLayer() {
  let viewer, data, panel, handler, status, inputs, choices;
  let active = false,
    selecting = false,
    epoch = 0,
    controller;
  const element = (tag, text) => {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    return e;
  };
  function draw(result) {
    data.entities.removeAll();
    const times = [...result.minutes].sort((a, b) => b - a);
    const colors = [C.Color.CYAN, C.Color.YELLOW, C.Color.ORANGE];
    for (const feature of result.geometry.features) {
      const polygons =
        feature.geometry.type === 'Polygon'
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates;
      const color = colors[times.indexOf(feature.properties.contour)];
      const hierarchy = (rings) =>
        new C.PolygonHierarchy(
          C.Cartesian3.fromDegreesArray(rings[0].flat()),
          rings
            .slice(1)
            .map(
              (ring) =>
                new C.PolygonHierarchy(
                  C.Cartesian3.fromDegreesArray(ring.flat()),
                ),
            ),
        );
      for (const rings of polygons)
        data.entities.add({
          name: feature.properties.contour + ' min till fots',
          polygon: {
            hierarchy: hierarchy(rings),
            material: color.withAlpha(0.18),
            outline: true,
            outlineColor: color,
          },
        });
    }
    data.entities.add({
      name: 'Start · gång',
      position: C.Cartesian3.fromDegrees(result.origin.lon, result.origin.lat),
      point: {
        pixelSize: 10,
        color: C.Color.WHITE,
        outlineColor: C.Color.CYAN,
        outlineWidth: 2,
        heightReference: C.HeightReference.CLAMP_TO_GROUND,
      },
    });
    status.textContent =
      result.minutes.join(' / ') +
      ' minuter · ' +
      result.speed +
      ' km/h. ' +
      result.model +
      ' Underlag: ' +
      result.dataTime +
      '. ' +
      result.attribution +
      '. Största ytan cyan, därefter gul och orange.';
    void viewer.flyTo(data, { duration: 1 });
    viewer.scene.requestRender();
  }
  const layer = {
    id: 'reachability',
    name: 'Räckvidd · Till fots',
    source: 'Lokal Valhalla / OpenStreetMap',
    category: 'tools',
    init(v) {
      viewer = v;
      data = new C.CustomDataSource('reachability');
      data.show = false;
      v.dataSources.add(data);
    },
    enable() {
      if (active) return;
      active = true;
      data.show = true;
      const token = ++epoch;
      panel = element('aside');
      panel.className = 'local-ai-panel own-poi-panel';
      panel.setAttribute('aria-label', 'Räckvidd till fots');
      Object.assign(panel.style, {
        top: '90px',
        bottom: 'auto',
        right: '20px',
        left: 'auto',
        maxHeight: 'calc(100vh - 190px)',
      });
      const header = element('header');
      header.className = 'local-ai-header';
      header.append(element('h3', 'Räckvidd · Till fots'));
      const body = element('div');
      body.className = 'local-ai-body';
      const minimize = element('button', '−');
      minimize.type = 'button';
      minimize.setAttribute('aria-label', 'Minimera räckvidd');
      minimize.onclick = () => {
        body.hidden = !body.hidden;
        minimize.setAttribute('aria-expanded', String(!body.hidden));
      };
      header.append(minimize);
      status = element(
        'p',
        'Gångytor längs vägnätet. Första versionen täcker Skövdeområdet, högst 30 minuter.',
      );
      status.setAttribute('aria-live', 'polite');
      body.append(status);
      inputs = {};
      for (const [key, title, value] of [
        ['search', 'Sök adress eller plats', ''],
        ['lat', 'Latitud', '58.3897'],
        ['lon', 'Longitud', '13.8457'],
        ['minutes', 'Minuter (1–3 gränser, separera med komma)', '5,10,15'],
        ['speed', 'Gånghastighet (km/h)', '6'],
      ]) {
        const label = element('label', title);
        label.className = 'local-ai-field';
        const input = element('input');
        input.value = value;
        input.setAttribute('aria-label', title);
        if (['lat', 'lon', 'speed'].includes(key)) {
          input.type = 'number';
          input.step = 'any';
        }
        if (key === 'speed') {
          input.min = '0.5';
          input.max = '8';
        }
        input.oninput = () => {
          controller?.abort();
          data.entities.removeAll();
          viewer.scene.requestRender();
        };
        inputs[key] = input;
        label.append(input);
        body.append(label);
      }
      choices = element('div');
      choices.className = 'local-ai-choices';
      const search = element('button', 'Sök platser');
      search.type = 'button';
      search.onclick = async () => {
        controller?.abort();
        const request = (controller = new AbortController());
        try {
          const r = await fetch(
            '/api/address-search?' +
              new URLSearchParams({ q: inputs.search.value }),
            { signal: request.signal },
          );
          const result = await r.json();
          if (!active || token !== epoch || controller !== request) return;
          if (!r.ok) throw Error(result.error || 'Sökningen misslyckades.');
          choices.replaceChildren();
          for (const row of result.rows) {
            const button = element('button', row.name);
            button.type = 'button';
            button.onclick = () => {
              controller?.abort();
              inputs.lat.value = row.lat;
              inputs.lon.value = row.lon;
              data.entities.removeAll();
              choices.replaceChildren();
              status.textContent = 'Vald start: ' + row.name;
              viewer.scene.requestRender();
            };
            choices.append(button);
          }
          status.textContent =
            'Välj start bland ' +
            result.rows.length +
            ' träffar. © OpenStreetMap contributors / Photon.';
        } catch (e) {
          if (
            active &&
            token === epoch &&
            controller === request &&
            e.name !== 'AbortError'
          )
            status.textContent = e.message;
        }
      };
      const map = element('button', 'Välj start på kartan');
      map.type = 'button';
      map.onclick = () => {
        selecting = !selecting;
        status.textContent = selecting
          ? 'Klicka på kartan för att välja start.'
          : 'Kartval avbrutet.';
      };
      const calculate = element('button', 'Beräkna gångytor');
      calculate.type = 'button';
      calculate.onclick = async () => {
        controller?.abort();
        const request = (controller = new AbortController());
        data.entities.removeAll();
        viewer.scene.requestRender();
        status.textContent = 'Beräknar gångytor…';
        try {
          if (
            !inputs.lat.value.trim() ||
            !inputs.lon.value.trim() ||
            !inputs.speed.value.trim()
          )
            throw Error('Ange startpunkt och hastighet.');
          const r = await fetch('/api/reachability', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: request.signal,
            body: JSON.stringify({
              lat: Number(inputs.lat.value),
              lon: Number(inputs.lon.value),
              speed: Number(inputs.speed.value),
              minutes: inputs.minutes.value
                .split(',')
                .map((s) => Number(s.trim())),
            }),
          });
          const result = await r.json();
          if (!active || token !== epoch || controller !== request) return;
          if (!r.ok) throw Error(result.error || 'Beräkningen misslyckades.');
          draw(result);
        } catch (e) {
          if (
            active &&
            token === epoch &&
            controller === request &&
            e.name !== 'AbortError'
          )
            status.textContent = e.message;
        }
      };
      body.append(
        search,
        map,
        choices,
        calculate,
        element(
          'p',
          'Skövde: 58,34–58,46° N / 13,75–13,98° E. Beräknade ytor är uppskattningar; OSM kan sakna gångvägar.',
        ),
      );
      panel.append(header, body);
      document.body.append(panel);
      handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((e) => {
        if (!selecting) return;
        const ray = viewer.camera.getPickRay(e.position);
        const terrain = ray && viewer.scene.globe.pick(ray, viewer.scene);
        const point =
          terrain ||
          viewer.camera.pickEllipsoid(e.position, viewer.scene.globe.ellipsoid);
        if (!point) {
          status.textContent = 'Ingen kartposition hittades.';
          return;
        }
        const c = C.Cartographic.fromCartesian(point);
        controller?.abort();
        inputs.lat.value = C.Math.toDegrees(c.latitude).toFixed(6);
        inputs.lon.value = C.Math.toDegrees(c.longitude).toFixed(6);
        data.entities.removeAll();
        selecting = false;
        viewer.scene.requestRender();
        status.textContent = terrain
          ? 'Start vald på kartan.'
          : 'Start vald utan höjddata.';
      }, C.ScreenSpaceEventType.LEFT_CLICK);
    },
    disable() {
      active = false;
      epoch++;
      selecting = false;
      controller?.abort();
      handler?.destroy();
      handler = undefined;
      panel?.remove();
      panel = undefined;
      if (data) data.show = false;
      viewer?.scene.requestRender();
    },
    update() {
      return true;
    },
    getStats() {
      return { count: data?.entities.values.length || 0 };
    },
    destroy() {
      layer.disable();
      if (data) viewer.dataSources.remove(data, true);
    },
  };
  return layer;
}
