let nextId = 0;
/** Shared address/name endpoint; no camera move until an unambiguous submit or choice. */
export class PlaceSuggestions {
  constructor({
    input,
    getArea,
    onSelect,
    fallback,
    fetchImpl = fetch,
    doc = document,
    debounceMs = 850,
  }) {
    Object.assign(this, {
      input,
      getArea,
      onSelect,
      fallback,
      fetchImpl,
      doc,
      debounceMs,
    });
    this.id = 'place-options-' + ++nextId;
    this.rows = [];
    this.active = -1;
    this.generation = 0;
    this.removers = [];
    this.popup = doc.createElement('div');
    this.popup.className = 'place-suggestions';
    this.popup.id = this.id;
    this.popup.hidden = true;
    this.popup.setAttribute('role', 'listbox');
    doc.body.append(this.popup);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', this.id);
    input.setAttribute('aria-expanded', 'false');
    input.placeholder = 'Adress, gata eller plats…';
    this.bind(input, 'input', () => {
      clearTimeout(this.timer);
      this.controller?.abort();
      this.generation++;
      this.hide();
      const q = input.value.trim();
      if (q.length >= 3)
        this.timer = setTimeout(() => void this.lookup(q), debounceMs);
    });
    this.bind(input, 'keydown', (e) => {
      if (e.key === 'Escape') {
        this.dismiss();
        return;
      }
      if (
        (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
        this.rows.length &&
        !this.popup.hidden
      ) {
        e.preventDefault();
        this.active =
          (this.active + (e.key === 'ArrowDown' ? 1 : -1) + this.rows.length) %
          this.rows.length;
        this.paintActive();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (this.active >= 0 && !this.popup.hidden)
          this.choose(this.rows[this.active]);
        else void this.submit(input.value);
      }
    });
    this.bind(doc, 'pointerdown', (e) => {
      if (!this.popup.contains(e.target) && e.target !== input) this.dismiss();
    });
    this.bind(doc.defaultView, 'resize', () => this.position());
  }
  bind(el, event, fn) {
    el?.addEventListener(event, fn);
    this.removers.push(() => el?.removeEventListener(event, fn));
  }
  position() {
    if (this.popup.hidden) return;
    const r = this.input.getBoundingClientRect(),
      w = this.doc.defaultView;
    this.popup.style.width = Math.min(420, w.innerWidth - 24) + 'px';
    this.popup.style.left =
      Math.max(12, Math.min(r.left, w.innerWidth - 432)) + 'px';
    this.popup.style.bottom = Math.max(12, w.innerHeight - r.top + 8) + 'px';
    this.popup.style.maxHeight = Math.max(100, r.top - 24) + 'px';
  }
  hide() {
    this.popup.hidden = true;
    this.input.setAttribute('aria-expanded', 'false');
    this.input.removeAttribute('aria-activedescendant');
    this.active = -1;
  }
  dismiss() {
    clearTimeout(this.timer);
    this.controller?.abort();
    this.generation++;
    this.hide();
  }
  async lookup(q) {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const generation = ++this.generation;
    try {
      const params = new URLSearchParams({ q });
      const area = this.getArea?.();
      if (area) {
        params.set('lat', area.lat);
        params.set('lon', area.lon);
      }
      const r = await this.fetchImpl('/api/address-search?' + params, {
        signal: controller.signal,
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || 'Sökningen kunde inte hämtas.');
      if (generation !== this.generation || this.destroyed) return null;
      this.rows = data.rows;
      this.lastQuery = q;
      this.lastData = data;
      this.render(data);
      return data;
    } catch (e) {
      if (controller.signal.aborted || this.destroyed) return null;
      this.rows = [];
      this.render({ rows: [], error: e.message });
      return null;
    }
  }
  render(data) {
    this.popup.replaceChildren();
    this.active = -1;
    this.popup.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
    const title = this.doc.createElement('div');
    title.className = 'place-suggestions-status';
    title.textContent =
      data.error ||
      (!data.rows.length
        ? 'Inga träffar. Lägg till ort eller fler tecken.'
        : data.partial
          ? 'Träffar från tillgängliga källor. Välj plats.'
          : 'Välj plats · närliggande träffar prioriteras');
    this.popup.append(title);
    for (const [i, row] of data.rows.entries()) {
      const b = this.doc.createElement('button');
      b.type = 'button';
      b.id = this.id + '-' + i;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', 'false');
      b.textContent =
        row.name +
        ' · ' +
        ({
          street: 'gata',
          address: 'adress',
          stop: 'hållplats',
          city: 'ort',
          area: 'område',
          place: 'plats',
        }[row.kind] || 'plats');
      b.title = row.source?.name || '';
      b.onclick = () => this.choose(row);
      this.popup.append(b);
    }
    const footer = this.doc.createElement('div');
    footer.className = 'place-suggestions-status';
    for (const source of new Map(
      data.rows.map((r) => [r.source?.url, r.source]),
    ).values()) {
      if (!source?.url) continue;
      const a = this.doc.createElement('a');
      a.href = source.url;
      a.textContent = source.name;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      footer.append(a, this.doc.createTextNode(' '));
    }
    this.popup.append(footer);
    this.position();
  }
  paintActive() {
    const buttons = [...this.popup.querySelectorAll('button')];
    buttons.forEach((b, i) =>
      b.setAttribute('aria-selected', String(i === this.active)),
    );
    const b = buttons[this.active];
    if (b) {
      this.input.setAttribute('aria-activedescendant', b.id);
      b.scrollIntoView({ block: 'nearest' });
    }
  }
  async submit(query) {
    clearTimeout(this.timer);
    const q = String(query || '').trim();
    if (/^[-+]?\d+(?:\.\d+)?\s*[,;]\s*[-+]?\d+(?:\.\d+)?$/.test(q)) {
      this.hide();
      return this.fallback?.(q);
    }
    if (q.length < 3)
      return this.render({ rows: [], error: 'Skriv minst tre tecken.' });
    const data = await this.lookup(q);
    if (data?.rows.length === 1 && data.rows[0].exact && !data.partial)
      this.choose(data.rows[0]);
    else if (data) this.render(data);
  }
  choose(row) {
    this.hide();
    this.controller?.abort();
    this.generation++;
    this.input.value = row.name;
    this.lastQuery = null;
    this.lastData = null;
    this.onSelect(row);
  }
  destroy() {
    this.destroyed = true;
    clearTimeout(this.timer);
    this.controller?.abort();
    for (const r of this.removers) r();
    this.popup.remove();
    this.input.removeAttribute('aria-controls');
    this.input.removeAttribute('aria-activedescendant');
    this.input.setAttribute('aria-expanded', 'false');
  }
}
