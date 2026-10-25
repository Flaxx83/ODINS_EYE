export const RADIO_FAVORITES_KEY = 'odins-eye.radio-favorites.v1';
export function createRadioFavorites(
  getStorage = () => globalThis.localStorage,
) {
  const list = () => {
    try {
      const rows = JSON.parse(
        getStorage()?.getItem(RADIO_FAVORITES_KEY) || '[]',
      );
      return Array.isArray(rows)
        ? rows
            .filter(
              (row) =>
                row &&
                typeof row.id === 'string' &&
                typeof row.name === 'string' &&
                row.id.length <= 200,
            )
            .slice(0, 200)
            .map((row) => ({
              id: row.id,
              name: row.name.slice(0, 200),
              state:
                typeof row.state === 'string' ? row.state.slice(0, 200) : '',
              country:
                typeof row.country === 'string'
                  ? row.country.slice(0, 200)
                  : '',
              tags: Array.isArray(row.tags)
                ? row.tags
                    .filter((tag) => typeof tag === 'string')
                    .slice(0, 10)
                    .map((tag) => tag.slice(0, 200))
                : [],
            }))
        : [];
    } catch {
      return [];
    }
  };
  const has = (id) => list().some((row) => row.id === id);
  const toggle = (station) => {
    const rows = list();
    const exists = rows.some((row) => row.id === station.id);
    if (!exists && rows.length >= 200)
      return { error: 'Du har nått gränsen på 200 favoriter.' };
    const text = (value) => String(value || '').slice(0, 200);
    const next = exists
      ? rows.filter((row) => row.id !== station.id)
      : [
          ...rows,
          {
            id: text(station.id),
            name: text(station.name),
            state: text(station.state),
            country: text(station.country),
            tags: (Array.isArray(station.tags) ? station.tags : [])
              .slice(0, 10)
              .map(text),
          },
        ];
    try {
      const storage = getStorage();
      if (!storage) throw Error('unavailable');
      storage.setItem(RADIO_FAVORITES_KEY, JSON.stringify(next));
      return { saved: !exists };
    } catch {
      return {
        error:
          'Favoriten kunde inte sparas. Kontrollera webbläsarens lokala lagring.',
      };
    }
  };
  return { list, has, toggle };
}

export function filterClusterStations(stations, query = '') {
  const key = query.trim().toLocaleLowerCase('sv');
  return stations.filter((station) =>
    [
      station.name,
      station.state,
      station.country,
      ...(station.tags || []),
    ].some((value) =>
      String(value || '')
        .toLocaleLowerCase('sv')
        .includes(key),
    ),
  );
}

export function createClusterList({ state, parts }) {
  const favorites = createRadioFavorites();
  let dialog;
  function close() {
    if (!dialog) return;
    dialog.close();
    dialog.remove();
    dialog = null;
  }
  function open(ids, { favoritesOnly = false } = {}) {
    if (!favoritesOnly && !parts.interaction.radioPresentationAllowed())
      return false;
    const stations = [...new Set(ids)]
      .map((id) => state._stationById.get(id))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'sv'));
    if (!stations.length && !favoritesOnly) return false;
    close();
    dialog = document.createElement('dialog');
    dialog.className = 'radio-cluster-dialog';
    dialog.setAttribute('aria-label', 'Radiokanaler i gruppen');
    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.textContent = 'Radiokanaler i gruppen';
    const exit = document.createElement('button');
    exit.textContent = 'Stäng';
    exit.onclick = close;
    header.append(title, exit);
    const mode = document.createElement('button');
    mode.type = 'button';
    mode.textContent = favoritesOnly
      ? 'Visar alla favoriter'
      : 'Visa alla favoriter';
    mode.setAttribute('aria-pressed', String(favoritesOnly));
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Sök namn, kategori eller ort';
    search.setAttribute('aria-label', 'Sök i radiogruppen');
    const count = document.createElement('p');
    count.setAttribute('aria-live', 'polite');
    const list = document.createElement('div');
    list.className = 'radio-cluster-list';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const render = () => {
      const source = favoritesOnly
        ? favorites
            .list()
            .map((station) => state._stationById.get(station.id) || station)
        : stations;
      title.textContent = favoritesOnly
        ? 'Mina radiokanaler'
        : 'Radiokanaler i gruppen';
      const matches = filterClusterStations(source, search.value);
      count.textContent = `${matches.length} av ${source.length} stationer · ${favoritesOnly ? 'alla sparade favoriter' : 'gruppen från ditt klick'}`;
      list.replaceChildren();
      for (const station of matches) {
        const row = document.createElement('section');
        const name = document.createElement('strong');
        name.textContent = station.name;
        const details = document.createElement('p');
        details.textContent =
          [station.state, station.country, (station.tags || []).join(', ')]
            .filter(Boolean)
            .join(' · ') || 'Ort och kategori saknas';
        const actions = document.createElement('div');
        const favorite = document.createElement('button');
        favorite.textContent = favorites.has(station.id)
          ? '★ Favorit'
          : '☆ Spara favorit';
        favorite.setAttribute('aria-label', `Favorit: ${station.name}`);
        favorite.setAttribute(
          'aria-pressed',
          String(favorites.has(station.id)),
        );
        favorite.onclick = () => {
          const result = favorites.toggle(station);
          status.textContent =
            result.error ||
            (result.saved
              ? 'Favoriten är sparad på den här webbläsaren.'
              : 'Favoriten är borttagen.');
          render();
          parts.presentation?.emitState();
          const replacement = [...list.querySelectorAll('button')].find(
            (button) =>
              button.getAttribute('aria-label') === `Favorit: ${station.name}`,
          );
          (replacement || search).focus();
        };
        actions.append(favorite);
        for (const [label, autoplay, focus] of [
          ['Lyssna', true, false],
          ['Visa på kartan', false, true],
        ]) {
          const button = document.createElement('button');
          button.textContent = label;
          button.setAttribute('aria-label', `${label}: ${station.name}`);
          if (
            favoritesOnly &&
            (!state._stationById.has(station.id) ||
              !parts.interaction.radioPresentationAllowed())
          )
            button.disabled = true;
          button.onclick = () => {
            const accepted = parts.selection.selectRadioStation(station.id, {
              autoplay,
              focus,
              origin: 'user',
            });
            if (!accepted) {
              status.textContent =
                'Stationen är inte längre tillgänglig. Öppna gruppen igen.';
              return;
            }
            if (focus) close();
            else
              status.textContent = `Uppspelning begärd: ${station.name}. Uppspelningsstatus visas i radiopanelen.`;
          };
          actions.append(button);
        }
        row.append(name, details, actions);
        if (favoritesOnly && !state._stationById.has(station.id)) {
          const unavailable = document.createElement('p');
          unavailable.textContent =
            'Stationen är inte inläst. Aktivera radio eller uppdatera katalogen.';
          row.append(unavailable);
        }
        list.append(row);
      }
      if (!matches.length)
        list.textContent =
          favoritesOnly && !source.length
            ? 'Inga favoriter sparade ännu. Använd stjärnan vid en station eller i radiopanelen.'
            : 'Inga stationer matchar sökningen.';
    };
    search.oninput = render;
    mode.onclick = () => {
      favoritesOnly = !favoritesOnly;
      mode.textContent = favoritesOnly ? 'Visa gruppen' : 'Visa alla favoriter';
      mode.setAttribute('aria-pressed', String(favoritesOnly));
      render();
    };
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    dialog.append(header, mode, search, count, list, status);
    document.body.append(dialog);
    render();
    dialog.showModal();
    search.focus();
    return true;
  }
  return {
    open,
    close,
    openFavorites: () => open([], { favoritesOnly: true }),
    isFavorite: favorites.has,
    toggleSelectedFavorite: () => {
      const station = state._stationById.get(state._selectedId);
      if (!station) return { error: 'Välj en radiokanal först.' };
      const result = favorites.toggle(station);
      parts.presentation.emitState();
      return result;
    },
  };
}
