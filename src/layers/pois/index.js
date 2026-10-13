import * as C from 'cesium';
import {
  registerPickOwner,
  unregisterPickOwner,
  resolvePickId,
} from '../../data/pickRegistry.js';

export function createPoiLayer() {
  let viewer,
    data,
    panel,
    handler,
    enabled = false,
    selecting = false,
    selected = null,
    draft = null,
    generation = 0,
    epoch = 0;
  const rows = new Map();
  let inputs, list, status, choices, save, moving;
  const node = (tag, text) => {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    return e;
  };
  const dirty = () =>
    inputs &&
    JSON.stringify(read()) !==
      JSON.stringify(
        selected
          ? {
              name: selected.name,
              lat: selected.lat,
              lon: selected.lon,
              address: selected.address,
              notes: selected.notes,
            }
          : { name: '', lat: null, lon: null, address: '', notes: '' },
      );
  function read() {
    return {
      name: inputs.name.value,
      lat: inputs.lat.value.trim() ? Number(inputs.lat.value) : null,
      lon: inputs.lon.value.trim() ? Number(inputs.lon.value) : null,
      address: inputs.address.value,
      notes: inputs.notes.value,
    };
  }
  const mayLeave = () =>
    !dirty() || window.confirm('Lämna osparade ändringar?');
  function open(row, force = false) {
    if (!force && !mayLeave()) return;
    generation++;
    selecting = false;
    selected = row || null;
    choices.replaceChildren();
    for (const key of Object.keys(inputs)) inputs[key].value = row?.[key] ?? '';
    status.textContent = row
      ? 'Sparad: ' + new Date(row.updatedAt).toLocaleString('sv-SE')
      : 'Ny plats. Ange koordinater, sök adress eller välj på kartan.';
    moving.textContent = 'Välj position på kartan';
  }
  async function api(path = '', method = 'GET', body) {
    const owner = epoch;
    const r = await fetch('/api/pois' + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json();
    if (owner !== epoch || !enabled) throw Error('Vyn har stängts.');
    if (!r.ok) throw Error(d.error || 'Platsen kunde inte sparas.');
    return d;
  }
  async function refresh() {
    const result = await api();
    if (!enabled) return;
    rows.clear();
    data.entities.removeAll();
    list.replaceChildren();
    for (const row of result.pois) {
      rows.set('own-poi:' + row.id, row);
      data.entities.add({
        id: 'own-poi:' + row.id,
        name: row.name,
        position: C.Cartesian3.fromDegrees(row.lon, row.lat),
        point: {
          pixelSize: 12,
          color: C.Color.CYAN,
          outlineColor: C.Color.BLACK,
          outlineWidth: 2,
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Infinity,
        },
      });
      const button = node('button', row.name);
      button.type = 'button';
      button.onclick = () => {
        if (!mayLeave()) return;
        open(row, true);
        viewer.camera.flyTo({
          destination: C.Cartesian3.fromDegrees(row.lon, row.lat, 1000),
        });
      };
      list.append(button);
    }
    if (!result.pois.length)
      list.append(node('p', 'Inga sparade platser ännu.'));
    viewer.scene.requestRender();
  }
  async function work(action) {
    const owner = epoch,
      controls = [...panel.querySelectorAll('button,input,textarea')].map(
        (e) => [e, e.disabled],
      );
    controls.forEach(([e]) => (e.disabled = true));
    try {
      await action();
    } catch (error) {
      if (enabled && owner === epoch) status.textContent = error.message;
    } finally {
      controls.forEach(([e, disabled]) => (e.disabled = disabled));
    }
  }
  const layer = {
    id: 'own-pois',
    name: 'Egna POI · Sparade platser',
    source: 'Lokal SQLite',
    category: 'tools',
    init(v) {
      viewer = v;
      data = new C.CustomDataSource('own-pois');
      data.show = false;
      v.dataSources.add(data);
    },
    async enable() {
      epoch++;
      enabled = true;
      data.show = true;
      panel = node('aside');
      panel.className = 'local-ai-panel own-poi-panel';
      panel.setAttribute('aria-label', 'Egna POI');
      Object.assign(panel.style, {
        top: '90px',
        bottom: 'auto',
        right: '20px',
        left: 'auto',
        maxHeight: 'calc(100vh - 190px)',
      });
      const header = node('header');
      header.className = 'local-ai-header';
      header.append(node('h3', 'Egna POI'));
      const close = node('button', '−');
      close.type = 'button';
      close.setAttribute('aria-label', 'Minimera egna POI');
      const body = node('div');
      body.className = 'local-ai-body';
      close.onclick = () => {
        body.hidden = !body.hidden;
        close.setAttribute('aria-expanded', String(!body.hidden));
      };
      header.append(close);
      status = node('p');
      status.setAttribute('aria-live', 'polite');
      status.className = 'local-ai-hint';
      const actions = node('div');
      actions.className = 'local-ai-actions';
      const fresh = node('button', 'Ny plats');
      fresh.type = 'button';
      fresh.onclick = () => open(null);
      moving = node('button', 'Välj position på kartan');
      moving.type = 'button';
      moving.onclick = () => {
        selecting = !selecting;
        moving.textContent = selecting
          ? 'Avbryt kartval'
          : 'Välj position på kartan';
        status.textContent = selecting
          ? 'Klicka på kartan för ny position. Vid flytt rensas den gamla adressen; anteckningar behålls.'
          : 'Kartval avbrutet.';
      };
      actions.append(fresh, moving);
      const searchLabel = node('label', 'Sök adress eller plats');
      searchLabel.className = 'local-ai-field';
      const search = node('input');
      search.type = 'search';
      search.setAttribute('aria-label', 'Sök adress för POI');
      searchLabel.append(search);
      const searchButton = node('button', 'Sök platser');
      searchButton.type = 'button';
      choices = node('div');
      choices.className = 'local-ai-choices';
      searchButton.onclick = () =>
        void work(async () => {
          const token = ++generation;
          const r = await fetch(
            '/api/address-search?' + new URLSearchParams({ q: search.value }),
          );
          const found = await r.json();
          if (!enabled || token !== generation) return;
          if (!r.ok) throw Error(found.error || 'Adressökningen misslyckades.');
          choices.replaceChildren();
          for (const row of found.rows) {
            const pick = node('button', row.name);
            pick.type = 'button';
            pick.onclick = () => {
              inputs.lat.value = row.lat;
              inputs.lon.value = row.lon;
              inputs.address.value = row.name;
              if (!inputs.name.value) inputs.name.value = row.name;
              choices.replaceChildren();
              generation++;
              status.textContent = 'Vald plats. Spara för att lagra den.';
            };
            choices.append(pick);
          }
          status.textContent = found.rows.length
            ? 'Välj en plats bland träffarna.'
            : 'Ingen adress hittades. Ange koordinater och eventuell adress manuellt.';
          for (const source of [
            ...new Map(
              found.rows.map((r) => [r.source.url, r.source]),
            ).values(),
          ]) {
            const link = node('a', source.name);
            link.href = source.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            choices.append(link);
          }
        });
      const form = node('form');
      inputs = {};
      for (const [key, title, limit] of [
        ['name', 'Namn', 140],
        ['lat', 'Latitud (WGS84)', 30],
        ['lon', 'Longitud (WGS84)', 30],
        ['address', 'Adress (valfri, annars uppgift saknas)', 500],
        ['notes', 'Anteckningar', 10000],
      ]) {
        const label = node('label', title);
        label.className = 'local-ai-field';
        const input = node(key === 'notes' ? 'textarea' : 'input');
        input.setAttribute('aria-label', title);
        input.maxLength = limit;
        if (key === 'lat' || key === 'lon') {
          input.type = 'number';
          input.step = 'any';
          input.min = key === 'lat' ? '-90' : '-180';
          input.max = key === 'lat' ? '90' : '180';
          input.required = true;
        } else if (key === 'name') input.required = true;
        if (key === 'address') input.placeholder = 'Uppgift saknas';
        inputs[key] = input;
        label.append(input);
        form.append(label);
        if (key === 'lat' || key === 'lon')
          input.oninput = () => {
            generation++;
            inputs.address.value = '';
            status.textContent =
              'Position ändrad. Kontrollera eller hämta adressen på nytt; anteckningar behålls.';
          };
      }
      save = node('button', 'Spara plats');
      save.type = 'submit';
      save.className = 'local-ai-send';
      const copy = node('button', 'Kopiera koordinater');
      copy.type = 'button';
      copy.onclick = () =>
        void work(async () => {
          const v = read();
          if (
            v.lat == null ||
            v.lon == null ||
            !Number.isFinite(v.lat) ||
            !Number.isFinite(v.lon) ||
            Math.abs(v.lat) > 90 ||
            Math.abs(v.lon) > 180
          )
            throw Error('Ange giltiga koordinater först.');
          await navigator.clipboard.writeText(
            v.lat.toFixed(6) + ', ' + v.lon.toFixed(6),
          );
          status.textContent = 'Koordinater kopierade.';
        });
      const reverse = node('button', 'Hämta adress vid koordinater');
      reverse.type = 'button';
      reverse.onclick = () =>
        void work(async () => {
          const v = read();
          if (v.lat == null || v.lon == null)
            throw Error('Ange koordinater först.');
          const found = await api(
            '/reverse?' + new URLSearchParams({ lat: v.lat, lon: v.lon }),
          );
          inputs.address.value = found.address;
          status.textContent = found.address
            ? found.note + ' Källa: Photon / OpenStreetMap.'
            : 'Uppgift saknas. Ange adress manuellt.';
        });
      const privacy = node(
        'p',
        'Adressuppslag skickar koordinater till Photon. Namn och anteckningar skickas inte.',
      );
      privacy.className = 'local-ai-hint';
      const attribution = node('a', '© OpenStreetMap contributors');
      attribution.href = 'https://www.openstreetmap.org/copyright';
      attribution.target = '_blank';
      attribution.rel = 'noopener noreferrer';
      const remove = node('button', 'Ta bort plats');
      remove.type = 'button';
      remove.onclick = () => {
        if (!selected || !window.confirm('Ta bort ' + selected.name + '?'))
          return;
        const id = selected.id;
        void work(async () => {
          await api('/' + id, 'DELETE');
          if (!enabled) return;
          open(null, true);
          await refresh();
          status.textContent = 'Platsen borttagen.';
        });
      };
      const editActions = node('div');
      editActions.className = 'local-ai-actions';
      editActions.append(save, copy, reverse, remove);
      form.append(editActions, privacy, attribution);
      form.onsubmit = (e) => {
        e.preventDefault();
        const row = read(),
          old = selected;
        void work(async () => {
          const saved = await api(
            old ? '/' + old.id : '',
            old ? 'PUT' : 'POST',
            { ...row, updatedAt: old?.updatedAt },
          );
          if (!enabled) return;
          open(saved, true);
          await refresh();
        });
      };
      const backupActions = node('div');
      backupActions.className = 'local-ai-actions';
      const backup = node('button', 'Säkerhetskopiera');
      backup.type = 'button';
      backup.onclick = () =>
        void work(async () => {
          const snapshot = await api('/backup');
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(snapshot, null, 2)], {
              type: 'application/json',
            }),
          );
          const link = node('a');
          link.href = url;
          link.download =
            'odins-pois-' + new Date().toISOString().slice(0, 10) + '.json';
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          status.textContent =
            'Säkerhetskopian innehåller privata anteckningar. Spara den på en egen säker plats.';
        });
      const restoreLabel = node('label', 'Återställ säkerhetskopia');
      restoreLabel.className = 'local-ai-field';
      const file = node('input');
      file.type = 'file';
      file.accept = '.json,application/json';
      restoreLabel.append(file);
      file.onchange = () =>
        void work(async () => {
          const chosen = file.files[0];
          if (!chosen) return;
          if (chosen.size > 16000000)
            throw Error('Säkerhetskopian är för stor.');
          const snapshot = JSON.parse(await chosen.text());
          if (
            !window.confirm(
              'Återställningen ersätter alla egna platser. En automatisk kopia sparas först. Fortsätt?',
            )
          )
            return;
          await api('/restore', 'POST', {
            confirm: 'REPLACE',
            backup: snapshot,
          });
          if (!enabled) return;
          open(null, true);
          await refresh();
          status.textContent = 'Säkerhetskopian återställd.';
        });
      backupActions.append(backup);
      list = node('div');
      list.className = 'local-ai-choices';
      list.setAttribute('aria-label', 'Sparade platser');
      body.append(
        status,
        actions,
        searchLabel,
        searchButton,
        choices,
        form,
        node('h4', 'Sparade platser'),
        list,
        backupActions,
        restoreLabel,
      );
      panel.append(header, body);
      document.body.append(panel);
      open(null, true);
      if (draft) {
        selected = draft.selected;
        for (const key of Object.keys(inputs))
          inputs[key].value = draft.values[key] ?? '';
        status.textContent =
          'Senaste platsen återöppnad. Osparade ändringar ligger kvar i denna session.';
      }
      registerPickOwner('own-pois', (id) => id.startsWith('own-poi:'));
      handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((e) => {
        if (selecting) {
          const ray = viewer.camera.getPickRay(e.position);
          const terrainPoint =
            ray && viewer.scene.globe.pick(ray, viewer.scene);
          const point =
            terrainPoint ||
            viewer.camera.pickEllipsoid(
              e.position,
              viewer.scene.globe.ellipsoid,
            );
          if (!point) {
            status.textContent =
              'Ingen kartposition hittades. Zooma in eller ange koordinater.';
            return;
          }
          const c = C.Cartographic.fromCartesian(point);
          inputs.lat.value = C.Math.toDegrees(c.latitude).toFixed(6);
          inputs.lon.value = C.Math.toDegrees(c.longitude).toFixed(6);
          inputs.address.value = '';
          selecting = false;
          moving.textContent = 'Välj position på kartan';
          generation++;
          status.textContent =
            'Ny position vald. Adress saknas; sök eller ange den manuellt. Anteckningar behålls.';
          if (!terrainPoint)
            status.textContent += ' Positionen är beräknad utan höjddata.';
        } else {
          const row = rows.get(resolvePickId(viewer.scene.pick(e.position)));
          if (row) open(row);
        }
      }, C.ScreenSpaceEventType.LEFT_CLICK);
      try {
        await refresh();
      } catch (error) {
        if (enabled) status.textContent = error.message;
      }
    },
    disable() {
      if (panel && inputs) draft = { selected, values: read() };
      epoch++;
      enabled = false;
      generation++;
      selecting = false;
      handler?.destroy();
      handler = undefined;
      panel?.remove();
      panel = undefined;
      if (data) data.show = false;
      unregisterPickOwner('own-pois');
      viewer?.scene.requestRender();
    },
    update() {
      return true;
    },
    getStats() {
      return { count: rows.size };
    },
    destroy() {
      layer.disable();
      draft = null;
      if (data) viewer.dataSources.remove(data, true);
    },
  };
  return layer;
}
