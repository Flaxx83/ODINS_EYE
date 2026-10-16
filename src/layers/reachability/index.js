import * as C from 'cesium';

export function createReachabilityLayer() {
  let viewer,
    data,
    panel,
    handler,
    status,
    inputs,
    choices,
    coverageStatus,
    detailsText;
  let active = false,
    selecting = false,
    epoch = 0,
    controller;
  const element = (tag, text) => {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    return e;
  };
  function draw(result, append = false) {
    const previous = append ? status.textContent : '';
    const previousDetails = append ? detailsText?.textContent : '';
    if (!append) data.entities.removeAll();
    const modeName = {
      walk: 'Gång',
      bicycle: 'Cykel',
      car: 'Bil',
      scooter: 'Elsparkcykel',
    }[result.mode];
    const speedLabel = result.mode === 'car' ? 'hastighetstak ' : '';
    const colorName = {
      walk: 'cerise',
      bicycle: 'blå',
      car: 'orange',
      scooter: 'lila',
    }[result.mode];
    const times = [...result.minutes].sort((a, b) => b - a);
    // Outer contours are lighter; shorter time budgets are more saturated.
    const colors = {
      walk: ['#f04bba', '#d51b91', '#9e0067'],
      bicycle: ['#168cff', '#0064db', '#003aa6'],
      car: ['#ff9429', '#ed5900', '#b82c00'],
      scooter: ['#b473ff', '#893de8', '#5d16b0'],
    }[result.mode].map((hex) => C.Color.fromCssColorString(hex));
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
      for (const rings of polygons) {
        data.entities.add({
          name: modeName + ' · ' + feature.properties.contour + ' min',
          polygon: {
            hierarchy: hierarchy(rings),
            material: color.withAlpha(0.42),
            zIndex: times.indexOf(feature.properties.contour),
            outline: true,
            outlineColor: color,
          },
        });
        // Ground polygon outlines are not supported consistently by Cesium.
        // Explicit ground polylines keep the boundary visible over imagery.
        for (const ring of rings)
          data.entities.add({
            name: modeName + ' · gräns ' + feature.properties.contour + ' min',
            polyline: {
              positions: C.Cartesian3.fromDegreesArray(ring.flat()),
              width: 3,
              material: color,
              clampToGround: true,
            },
          });
      }
    }
    if (!append)
      data.entities.add({
        name: 'Start',
        position: C.Cartesian3.fromDegrees(
          result.origin.lon,
          result.origin.lat,
        ),
        point: {
          pixelSize: 10,
          color: C.Color.WHITE,
          outlineColor: C.Color.CYAN,
          outlineWidth: 2,
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
        },
      });
    status.textContent =
      modeName +
      ' · ' +
      result.minutes.join(' / ') +
      ' minuter · ' +
      speedLabel +
      result.speed +
      ' km/h. ' +
      result.model +
      ' Underlag: ' +
      result.dataTime +
      '. ' +
      result.attribution +
      ('. Färg: ' + colorName + '.');
    if (result.networkOrigin)
      status.textContent +=
        ' Anslutning till nätet för färdsättet: ' +
        result.networkOrigin.distanceMeters +
        ' m. Tiderna räknas från nätanslutningen; vägen dit ingår inte och tillträde måste kontrolleras.';
    if (result.boundaryNote) status.textContent += ' ' + result.boundaryNote;
    if (detailsText)
      detailsText.textContent =
        (previousDetails ? previousDetails + '\n\n' : '') + status.textContent;
    status.textContent =
      (previous ? previous + '\n' : '') +
      modeName +
      ' · ' +
      result.minutes.join(' / ') +
      ' min · ' +
      speedLabel +
      result.speed +
      ' km/h · ' +
      colorName;
    if (coverageStatus)
      coverageStatus.textContent =
        result.coverageName +
        ' · Underlag: ' +
        result.dataTime +
        (result.boundaryNote ? '. ' + result.boundaryNote : '');
    void viewer.flyTo(data, { duration: 1 });
    viewer.scene.requestRender();
  }
  const layer = {
    id: 'reachability',
    name: 'Räckvidd',
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
      data.entities.removeAll();
      data.show = true;
      const token = ++epoch;
      panel = element('aside');
      panel.className = 'local-ai-panel own-poi-panel';
      panel.setAttribute('aria-label', 'Räckvidd');
      Object.assign(panel.style, {
        top: '90px',
        bottom: 'auto',
        right: '20px',
        left: 'auto',
        maxHeight: 'calc(100vh - 190px)',
      });
      const header = element('header');
      header.className = 'local-ai-header';
      header.append(element('h3', 'Räckvidd'));
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
        'Nätbaserad räckvidd i Sverige. Välj gång, cykel, bil eller elsparkcykel. Högst 30 minuter.',
      );
      status.setAttribute('aria-live', 'polite');
      status.style.whiteSpace = 'pre-line';
      body.append(status);
      inputs = {};
      const modeLabel = element('label', 'Färdsätt');
      modeLabel.className = 'local-ai-field';
      const mode = element('select');
      mode.setAttribute('aria-label', 'Färdsätt');
      for (const [value, name] of [
        ['walk', 'Till fots'],
        ['bicycle', 'På cykel'],
        ['car', 'Med bil'],
        ['scooter', 'Med elsparkcykel'],
        ['compare', 'Jämför gång och cykel'],
      ]) {
        const option = element('option', name);
        option.value = value;
        mode.append(option);
      }
      mode.onchange = () => {
        for (const [key, selected] of [
          ['speed', 'walk'],
          ['bikeSpeed', 'bicycle'],
          ['carSpeed', 'car'],
          ['scooterSpeed', 'scooter'],
        ]) {
          inputs[key].parentElement.style.display =
            mode.value === selected ||
            (mode.value === 'compare' && ['walk', 'bicycle'].includes(selected))
              ? ''
              : 'none';
        }
        controller?.abort();
        data.entities.removeAll();
        viewer.scene.requestRender();
      };
      modeLabel.append(mode);
      body.append(modeLabel);

      for (const [key, title, value] of [
        ['search', 'Sök adress eller plats', ''],
        ['lat', 'Latitud', '58.3897'],
        ['lon', 'Longitud', '13.8457'],
        ['minutes', 'Minuter (1–3 gränser, separera med komma)', '5,10,15'],
        ['speed', 'Gånghastighet (km/h)', '6'],
        ['bikeSpeed', 'Cykelhastighet på plant underlag (km/h)', '18'],
        ['carSpeed', 'Bilens hastighetstak (km/h)', '120'],
        ['scooterSpeed', 'Elsparkcykel på plant underlag (km/h)', '20'],
      ]) {
        const label = element('label', title);
        label.className = 'local-ai-field';
        const input = element('input');
        input.value = value;
        input.setAttribute('aria-label', title);
        if (
          [
            'lat',
            'lon',
            'speed',
            'bikeSpeed',
            'carSpeed',
            'scooterSpeed',
          ].includes(key)
        ) {
          input.type = 'number';
          input.step = 'any';
        }
        if (key === 'speed') {
          input.min = '0.5';
          input.max = '8';
        }
        if (key === 'bikeSpeed') {
          input.min = '5';
          input.max = '35';
        }
        if (key === 'carSpeed') {
          input.min = '10';
          input.max = '120';
        }
        if (key === 'scooterSpeed') {
          input.min = '5';
          input.max = '20';
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
      mode.onchange();
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
      const poi = element('button', 'Välj sparad POI');
      poi.type = 'button';
      poi.onclick = async () => {
        controller?.abort();
        const request = (controller = new AbortController());
        try {
          const r = await fetch('/api/pois', { signal: request.signal });
          const payload = await r.json();
          if (!active || token !== epoch || controller !== request) return;
          if (!r.ok)
            throw Error(payload.error || 'Sparade platser kunde inte hämtas.');
          const rows = payload.pois;
          choices.replaceChildren();
          for (const row of rows) {
            const pick = element(
              'button',
              row.name + (row.address ? ' · ' + row.address : ''),
            );
            pick.type = 'button';
            pick.onclick = () => {
              controller?.abort();
              inputs.lat.value = row.lat;
              inputs.lon.value = row.lon;
              data.entities.removeAll();
              viewer.scene.requestRender();
              choices.replaceChildren();
              status.textContent = 'Start från sparad POI: ' + row.name;
            };
            choices.append(pick);
          }
          status.textContent = rows.length
            ? 'Välj en sparad startplats.'
            : 'Inga sparade POI finns ännu.';
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
      map.type = 'button';
      map.onclick = () => {
        selecting = !selecting;
        status.textContent = selecting
          ? 'Klicka på kartan för att välja start.'
          : 'Kartval avbrutet.';
      };
      const calculate = element('button', 'Beräkna räckvidd');
      calculate.type = 'button';
      calculate.onclick = async () => {
        controller?.abort();
        const request = (controller = new AbortController());
        data.entities.removeAll();
        viewer.scene.requestRender();
        status.textContent = 'Beräknar räckvidd…';
        try {
          if (!inputs.lat.value.trim() || !inputs.lon.value.trim())
            throw Error('Ange startpunkt och hastighet.');
          const modes =
            mode.value === 'compare' ? ['walk', 'bicycle'] : [mode.value];
          const results = [];
          for (const selectedMode of modes) {
            const speedInput =
              inputs[
                {
                  walk: 'speed',
                  bicycle: 'bikeSpeed',
                  car: 'carSpeed',
                  scooter: 'scooterSpeed',
                }[selectedMode]
              ];
            if (!speedInput.value.trim())
              throw Error('Ange hastighet för valt färdsätt.');
            const r = await fetch('/api/reachability', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: request.signal,
              body: JSON.stringify({
                mode: selectedMode,
                lat: Number(inputs.lat.value),
                lon: Number(inputs.lon.value),
                speed: Number(speedInput.value),
                minutes: inputs.minutes.value
                  .split(',')
                  .map((s) => Number(s.trim())),
              }),
            });
            const result = await r.json();
            if (!active || token !== epoch || controller !== request) return;
            if (!r.ok) throw Error(result.error || 'Beräkningen misslyckades.');
            results.push(result);
          }
          if (results.some((result) => result.version !== results[0].version))
            throw Error(
              'Kartunderlaget ändrades under beräkningen. Beräkna jämförelsen på nytt.',
            );
          for (let i = 0; i < results.length; i++) draw(results[i], i > 0);
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
      const details = element('details');
      details.append(element('summary', 'Antaganden och källor'));
      detailsText = element(
        'p',
        'Beräknade nätbaserade ytor. Välj färdsätt och beräkna för modellens antaganden och anslutningsavstånd.',
      );
      detailsText.style.whiteSpace = 'pre-line';
      details.append(detailsText);
      body.append(
        search,
        map,
        poi,
        choices,
        calculate,
        details,
        element(
          'p',
          'Ytor interpoleras från vägnätet och kan täcka vatten/hinder mellan vägar. OSM kan sakna gångvägar. Startpunkten är den vita markören.',
        ),
      );
      panel.append(header, body);
      document.body.append(panel);
      const coverage = element('p', 'Kontrollerar underlag…');
      coverageStatus = coverage;
      body.append(coverage);
      fetch('/api/reachability')
        .then(async (r) => {
          const d = await r.json();
          if (!active || token !== epoch) return;
          coverage.textContent = r.ok
            ? d.coverageName +
              ' · ' +
              d.coverage[1] +
              '–' +
              d.coverage[3] +
              '° N / ' +
              d.coverage[0] +
              '–' +
              d.coverage[2] +
              '° E. Underlag: ' +
              d.dataTime +
              (d.boundaryNote ? '. ' + d.boundaryNote : '')
            : d.error;
        })
        .catch(() => {
          if (active && token === epoch)
            coverage.textContent = 'Underlagsstatus kunde inte hämtas.';
        });
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
      coverageStatus = undefined;
      detailsText = undefined;
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
