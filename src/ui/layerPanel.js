import { syncChipGroup } from './chipGroup.js';
import { syncRowList } from './rowList.js';
import { layerFeedState } from '../data/feedState.js';
export { layerFeedState } from '../data/feedState.js';
import { GUIDANCE_STATUSES } from '../loadingFeedback.js';
import { keySetupRequirement } from '../keySetupCore.mjs';
import { createWeatherPanel } from './weatherPanel.js';
const FEED_STATE_LABELS = Object.freeze({
  nominal: 'ON',
  loading: 'LOADING',
  degraded: 'DEGRADED',
  stale: 'STALE',
  partial: 'PARTIAL',
  fallback: 'FALLBACK',
  unavailable: 'UNAVAILABLE',
});

// Presentation order is independent of catalog registration and startup order.
const PANEL_GROUPS = [
  {
    label: 'Trafik och resor',
    ids: [
      'traffic',
      'transit',
      'sl-live',
      'vasttrafik',
      'sweden-stops',
      'sweden-transit',
      'bikeshare',
      'road-events',
      'road-weather',
      'cctv',
      'directions',
    ],
  },
  {
    label: 'Flyg och sjöfart',
    ids: ['flights', 'military', 'local-adsb', 'ais-live-vessels'],
  },
  {
    label: 'Samhälle och infrastruktur',
    ids: [
      'alpr-cameras',
      'military-installations',
      'local-datacenters',
      'telegeography-submarine-cables',
      'local-dams',
      'polisen',
      'liveuamap',
      'military-awareness',
      'mcf-shelters',
      'mcf-stations',
      'lm-administrativindelning',
      'lm-kommunikation',
      'lm-hydrografi',
    ],
  },
  {
    label: 'Väder, miljö och risker',
    ids: [
      'earthquakes',
      'local-firms',
      'fire-perimeters',
      'gdacs',
      'air-quality',
      'smhi',
      'smhi-observations',
      'smhi-forecast',
      'smhi-radar',
      'kris-news',
      'kris-vma',
      'mcf-flood',
      'mcf-fire',
      'wind',
      'weather-radar',
      'weather-satellite',
      'weather-lightning',
      'weather-cyclones',
    ],
  },
  {
    label: 'Rymd',
    ids: ['satellites', 'rocket-launches'],
  },
  {
    label: 'Kartverktyg och radio',
    ids: [
      'local-ai',
      'own-pois',
      'reachability',
      'place-labels',
      'recent-imagery',
      'street-level',
      'radio',
    ],
  },
];
const PANEL_ORDER = PANEL_GROUPS.flatMap(({ label, ids }) =>
  ids.map((id) => ({ id, label })),
);
const PANEL_POSITIONS = new Map(
  PANEL_ORDER.map(({ id }, index) => [id, index]),
);
const PANEL_LABELS = {
  'ais-live-vessels': 'Live Vessels',
  bikeshare: 'Bike Share',
  cctv: 'Cameras',
  'street-level': 'Street Level',
  'alpr-cameras': 'Mapped ALPR Cameras',
  'local-datacenters': 'Data Centers',
  'local-firms': 'Active Fires',
};

function panelLabel(layer) {
  return PANEL_LABELS[layer.id] || layer.name;
}

/**
 * Guidance for a control a missing provider key is holding back.
 *
 * The key registry already owns what each key is called and which environment
 * variables enable it, so a layer only declares WHICH key it needs
 * (`requiresKeyId`) and reports `stats.keyRequired` while that key is absent.
 * Naming the variable turns an unexplained dead control into a next step.
 *
 * An unnamed or unknown key returns '' rather than guessing: guidance naming
 * the wrong variable sends the operator to the wrong provider.
 *
 * @param {object} [layer] Row from the layer manager's getAll().
 * @returns {string} Guidance text, or '' when no key guidance applies.
 */
export function layerKeyRequirementTooltip(layer = {}) {
  if (layer?.stats?.keyRequired !== true) return '';
  const requiresKeyId = String(layer.requiresKeyId || '').trim();
  return requiresKeyId ? keySetupRequirement(requiresKeyId) : '';
}

/** Layer row presentation over supplied state and actions; no layer imports. */
export class LayerPanel {
  constructor({
    getLayers,
    isEnabled,
    setEnabled,
    setLayerParams,
    getRowControls,
    hasRowControls,
    subscribeRowControls,
    onHiddenRefresh = () => {},
    weatherClock,
  }) {
    this.weatherClock = weatherClock;
    this.getAll = getLayers;
    this.isEnabled = isEnabled;
    this.setEnabled = setEnabled;
    this.setLayerParams = setLayerParams;
    this._rowControlsFor = getRowControls;
    this.hasRowControls = hasRowControls;
    this.subscribeRowControls = subscribeRowControls;
    this.onHiddenRefresh = onHiddenRefresh;
    this._generation = 0;
    this._removers = [];
    this._destroyed = false;
    this._cancelRowControlsRefresh = null;
    this._recentImageryFactory = null;
    this._recentImageryPanel = null;
    this._layerQuery = '';
    this._activeOnly = false;
    this._openGroups = {};
    try {
      const saved = JSON.parse(
        globalThis.localStorage?.getItem('odins-eye.layer-groups.v1') || '{}',
      );
      if (saved && typeof saved === 'object' && !Array.isArray(saved))
        this._openGroups = saved;
    } catch {
      /* Storage is optional. */
    }
  }
  mount(container) {
    if (this._destroyed) return;
    this._releaseBindings();
    this._toggleContainer = container;
    this._weatherPanel?.destroy();
    this._weatherPanel = createWeatherPanel({
      clock: this.weatherClock,
      container:
        container?.ownerDocument?.getElementById?.('weather-panel-body'),
      setLayerParams: this.setLayerParams,
    });
    this._mountRecentImagery();
    this._renderToggles();
  }
  /**
   * Host the Recent Imagery readout in its rail body, like the weather
   * readout. The application supplies the factory once the layer, viewer and
   * box tool exist; a remount rebuilds the readout in place.
   * @param {((container: HTMLElement) => { destroy: () => void } | null) | null} factory
   */
  attachRecentImagery(factory) {
    if (this._destroyed) return;
    this._recentImageryFactory = typeof factory === 'function' ? factory : null;
    this._mountRecentImagery();
  }
  _mountRecentImagery() {
    this._recentImageryPanel?.destroy();
    this._recentImageryPanel = null;
    const container = this._toggleContainer?.ownerDocument?.getElementById?.(
      'recent-imagery-panel-body',
    );
    if (container && this._recentImageryFactory)
      this._recentImageryPanel = this._recentImageryFactory(container) || null;
  }
  _bind(element, type, listener) {
    element.addEventListener(type, listener);
    this._removers.push(() => element.removeEventListener(type, listener));
  }
  _releaseBindings() {
    this._generation++;
    this._cancelRowControlsRefresh?.();
    this._cancelRowControlsRefresh = null;
    for (const remove of this._removers.splice(0)) remove();
  }
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._releaseBindings();
    this._weatherPanel?.destroy();
    this._weatherPanel = null;
    this._recentImageryPanel?.destroy();
    this._recentImageryPanel = null;
    this._recentImageryFactory = null;
    this._toggleContainer = null;
    this._layerGroups?.clear();
    this._layerRows?.clear();
    this._layerSearch = null;
    this._layerEmpty = null;
  }
  _renderToggles() {
    if (this._destroyed || !this._toggleContainer) return;
    this._releaseBindings();
    this._toggleContainer.innerHTML = '';

    const generation = this._generation;
    this._layerGroups = new Map();
    this._layerRows = new Map();
    const toolbar = document.createElement('div');
    toolbar.className = 'data-layer-toolbar';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Sök lager…';
    search.value = this._layerQuery;
    search.setAttribute('aria-label', 'Sök datalager');
    this._layerSearch = search;
    const activeLabel = document.createElement('label');
    const active = document.createElement('input');
    active.type = 'checkbox';
    active.checked = this._activeOnly;
    const activeText = document.createElement('span');
    activeText.textContent = 'Visa endast aktiva';
    activeLabel.appendChild(active);
    activeLabel.appendChild(activeText);
    this._bind(search, 'input', () => {
      this._layerQuery = search.value;
      this._applyLayerFilters();
    });
    this._bind(active, 'change', () => {
      this._activeOnly = active.checked;
      this._applyLayerFilters();
    });
    toolbar.appendChild(search);
    toolbar.appendChild(activeLabel);
    this._toggleContainer.appendChild(toolbar);
    this._layerEmpty = document.createElement('p');
    this._layerEmpty.className = 'data-layer-empty';
    this._layerEmpty.textContent = 'Inga lager matchar sökningen.';
    const layers = this.getAll()
      .slice()
      .sort(
        (a, b) =>
          (PANEL_POSITIONS.get(a.id) ?? PANEL_ORDER.length) -
          (PANEL_POSITIONS.get(b.id) ?? PANEL_ORDER.length),
      );
    for (const layer of layers) {
      if (!layer.showInTogglePanel) continue;
      const group =
        PANEL_ORDER[PANEL_POSITIONS.get(layer.id)]?.label ?? 'Övriga lager';
      if (!this._layerGroups.has(group)) {
        const section = document.createElement('details');
        section.className = 'data-layer-group';
        const summary = document.createElement('summary');
        summary.className = 'data-layer-group-heading';
        const title = document.createElement('span');
        title.textContent = group;
        const count = document.createElement('span');
        count.className = 'data-layer-group-count';
        summary.appendChild(title);
        summary.appendChild(count);
        section.appendChild(summary);
        this._layerGroups.set(group, { section, summary, count, ids: [] });
        this._bind(summary, 'click', (event) => {
          event.preventDefault();
          section.open = !section.open;
          if (!this._layerQuery.trim() && !this._activeOnly) {
            this._openGroups[group] = section.open;
            try {
              globalThis.localStorage?.setItem(
                'odins-eye.layer-groups.v1',
                JSON.stringify(this._openGroups),
              );
            } catch {
              /* Storage is optional. */
            }
          }
        });
        this._toggleContainer.appendChild(section);
      }
      this._layerGroups.get(group).ids.push(layer.id);
      const row = document.createElement('div');
      row.className = 'data-toggle-row';
      row.dataset.layerId = layer.id;

      const topRow = document.createElement('div');
      topRow.className = 'data-toggle-top';

      const left = document.createElement('div');
      left.className = 'data-toggle-left';
      const icon = document.createElement('span');
      icon.className = 'data-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = layer.icon;
      const name = document.createElement('span');
      name.className = 'data-name';
      name.textContent = panelLabel(layer);
      left.appendChild(icon);
      left.appendChild(name);

      const right = document.createElement('div');
      right.className = 'data-toggle-right';

      const count = document.createElement('span');
      count.className = 'data-count';
      count.textContent = this._layerCountText(layer.stats);

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = `data-toggle-btn${layer.enabled ? ' active' : ''}`;
      this._syncToggleButton(toggle, layer);
      this._bind(toggle, 'click', async () => {
        // Native `disabled` immediately evicts keyboard focus in Chromium. Keep
        // the lifecycle control focusable while it is busy, and enforce the
        // same single-flight interaction contract through ARIA instead.
        if (
          this._destroyed ||
          this._generation !== generation ||
          toggle.getAttribute('aria-disabled') === 'true'
        )
          return;
        toggle.setAttribute('aria-disabled', 'true');
        toggle.setAttribute('aria-busy', 'true');
        try {
          await this.setEnabled(layer.id, !this.isEnabled(layer.id), {
            origin: 'user',
          });
        } catch (error) {
          console.warn(`[Data] ${layer.id} toggle error:`, error);
        } finally {
          const current = this.getAll().find(({ id }) => id === layer.id);
          if (!this._destroyed && current && this._generation === generation) {
            this._syncToggleButton(toggle, current);
            this._applyLayerFilters();
          }
        }
      });

      const readout = Boolean(this._rowControlsFor(layer.id)?.readout);
      if (!readout) right.appendChild(count);
      right.appendChild(toggle);
      topRow.appendChild(left);
      topRow.appendChild(right);

      const bottomRow = document.createElement('div');
      bottomRow.className = 'data-toggle-meta';
      bottomRow.textContent = this._buildMetaText(layer);

      row.appendChild(topRow);
      row.appendChild(bottomRow);

      // Optional per-layer sub-controls (chips + color legend). The click
      // listener is delegated and attached once here, so it survives
      // _refreshTogglePanel — which only rewrites the container's contents.
      if (this.hasRowControls(layer.id)) {
        // A layer whose controls settle asynchronously (a chunked catalog load
        // that can also fail) pushes a re-render through this; nothing else
        // would repaint the row before its next scheduled refresh.
        const unsubscribe = this.subscribeRowControls(layer.id, () =>
          this._scheduleRowControlsRefresh(),
        );
        if (unsubscribe) this._removers.push(unsubscribe);
        if (!readout) {
          const controls = document.createElement('div');
          controls.className = 'data-toggle-controls';
          this._bind(controls, 'click', (event) => {
            const button = event.target?.closest?.('.data-toggle-chip');
            if (!button || button.disabled) return;
            // Re-read the live descriptor rather than trusting the rendered
            // chip, so a stale row can never apply an inverted toggle.
            const chip = this._rowControlsFor(layer.id)?.chips?.find(
              (entry) => entry.id === button.dataset.chipId,
            );
            if (!chip || chip.disabled || !this.isEnabled(layer.id)) return;
            if (typeof chip.onClick === 'function') chip.onClick();
            else if (chip.params)
              this.setLayerParams(layer.id, chip.params, { origin: 'user' });
          });
          row.appendChild(controls);
          // An ordered list below the chips, for a layer whose row carries a
          // sequence (turn-by-turn directions). Its own delegated listener, its
          // own container — the chip row stays a chip row.
          const list = document.createElement('ol');
          list.className = 'data-row-list';
          list.hidden = true;
          this._bind(list, 'click', (event) => {
            const button = event.target?.closest?.('.data-row-list-item');
            if (!button || button.disabled) return;
            const item = this._rowControlsFor(layer.id)?.list?.items?.find(
              (entry) => entry.id === button.dataset.listItemId,
            );
            if (item?.params)
              this.setLayerParams(layer.id, item.params, { origin: 'user' });
          });
          row.appendChild(list);
          this._syncRowControls(controls, layer, list);
        }
      }

      this._layerGroups.get(group).section.appendChild(row);
      this._layerRows.set(layer.id, { row, group });
    }
    this._toggleContainer.appendChild(this._layerEmpty);
    this._applyLayerFilters();
    this._refreshWeatherPanel();
  }

  _applyLayerFilters() {
    if (this._destroyed || !this._layerGroups) return;
    const normalize = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLocaleLowerCase('sv');
    const query = normalize(this._layerQuery.trim());
    const layers = new Map(this.getAll().map((layer) => [layer.id, layer]));
    let visible = 0;
    for (const [group, entry] of this._layerGroups) {
      let active = 0,
        shown = 0;
      for (const id of entry.ids) {
        const layer = layers.get(id);
        const row = this._layerRows.get(id).row;
        if (layer?.enabled) active++;
        const matches =
          !!layer &&
          (!this._activeOnly || layer.enabled) &&
          (!query ||
            normalize(
              [panelLabel(layer), layer.id, layer.source, group].join(' '),
            ).includes(query));
        if (!matches && row.contains?.(document.activeElement))
          this._layerSearch.focus();
        if (row.hidden !== !matches) row.hidden = !matches;
        if (matches) shown++;
      }
      const countText = `${active} aktiva`;
      if (entry.count.textContent !== countText)
        entry.count.textContent = countText;
      if (entry.section.hidden !== (shown === 0))
        entry.section.hidden = shown === 0;
      const open =
        query || this._activeOnly
          ? shown > 0
          : typeof this._openGroups[group] === 'boolean'
            ? this._openGroups[group]
            : active > 0;
      if (entry.section.open !== open) entry.section.open = open;
      visible += shown;
    }
    if (this._layerEmpty.hidden !== visible > 0)
      this._layerEmpty.hidden = visible > 0;
  }

  _scheduleRowControlsRefresh() {
    if (this._destroyed || this._cancelRowControlsRefresh) return;
    const refresh = () => {
      this._cancelRowControlsRefresh = null;
      if (!this._destroyed) this._refreshTogglePanel();
    };
    if (typeof requestAnimationFrame === 'function') {
      const frame = requestAnimationFrame(refresh);
      this._cancelRowControlsRefresh = () => cancelAnimationFrame(frame);
    } else {
      const timer = setTimeout(refresh, 0);
      this._cancelRowControlsRefresh = () => clearTimeout(timer);
    }
  }

  /** Synchronously flush a pending row-controls refresh, including in tests. */
  _flushRowControlsRefresh() {
    if (this._destroyed || !this._cancelRowControlsRefresh) return;
    this._cancelRowControlsRefresh();
    this._cancelRowControlsRefresh = null;
    this._refreshTogglePanel();
  }

  _refreshWeatherPanel() {
    this._weatherPanel?.update(
      this.getAll()
        .filter(
          (layer) =>
            layer.enabled &&
            [
              'wind',
              'weather-radar',
              'weather-satellite',
              'weather-lightning',
              'weather-cyclones',
            ].includes(layer.id),
        )
        .map((layer) => ({
          id: layer.id,
          icon: layer.icon,
          ...this._rowControlsFor(layer.id),
        })),
    );
  }

  /** Qualify a loaded count when it does not mean items currently on screen. */
  _layerCountText(stats) {
    if (typeof stats.countLabel === 'string' && stats.countLabel.trim())
      return stats.countLabel;
    return stats.count ? this._formatCount(stats.count) : '—';
  }

  /**
   * Render a layer's row chips and color legend, and keep the whole block
   * hidden while the layer is off (or while a dependency owner has surrendered
   * it) so a quiet row stays quiet.
   *
   * Chip BUTTONS are reconciled in place, keyed by chip id, rather than
   * rebuilt: this runs on every panel refresh — including the one the chip's
   * own click triggers — and replacing the node would drop keyboard focus
   * mid-interaction. Legend entries are rebuilt only when their content changes;
   * the info node is retained across refreshes.
   * @param {HTMLElement|null} container The row's `.data-toggle-controls` node.
   * @param {object} layer Registered layer entry.
   * @param {HTMLElement|null} [listContainer] The row's `.data-row-list` node.
   */
  _syncRowControls(container, layer, listContainer = null) {
    if (!container) return;
    const controls = layer.enabled ? this._rowControlsFor(layer.id) : null;
    if (controls?.readout) {
      container.remove();
      listContainer?.remove();
      return;
    }
    const chips = controls?.chips || [];
    const legend = controls?.legend || [];
    const infoText = controls?.info;
    this._syncRowList(listContainer, controls?.list || null);
    container.hidden = chips.length === 0 && legend.length === 0 && !infoText;

    const info = container._rowControlsInfo || null;
    const firstLegend = container.querySelector('.data-toggle-legend-item');

    syncChipGroup(container, chips, { before: firstLegend || info });

    const legendSignature = JSON.stringify(
      legend.map(({ label, color, count, blurb }) => [
        label,
        color,
        count,
        blurb,
      ]),
    );
    if (container._legendSignature !== legendSignature) {
      for (const node of [...container.children]) {
        if (node.className === 'data-toggle-legend-item') node.remove();
      }
      for (const item of legend) {
        const entry = document.createElement('span');
        entry.className = 'data-toggle-legend-item';
        if (item.blurb) entry.title = item.blurb;
        const swatch = document.createElement('span');
        swatch.className = 'data-toggle-legend-swatch';
        swatch.style.background = item.color;
        const text = document.createElement('span');
        text.textContent =
          item.count == null
            ? String(item.label)
            : `${item.label} ${this._formatCount(item.count)}`;
        entry.append(swatch, text);
        container.insertBefore(entry, info);
      }
      container._legendSignature = legendSignature;
    }
    if (infoText || info) {
      const node = info || document.createElement('div');
      if (!info) {
        container.appendChild(node);
        container._rowControlsInfo = node;
      }
      const className = 'data-toggle-controls-info';
      if (node.className !== className) node.className = className;
      const text = infoText ? String(infoText) : '';
      const title = controls?.infoTitle || '';
      if (node.textContent !== text) node.textContent = text;
      if (node.title !== title) node.title = title;
      const hidden = !text;
      if (node.hidden !== hidden) node.hidden = hidden;
    }
  }

  /**
   * Render a row's ordered list (turn-by-turn directions).
   *
   * Each entry is a real `<button>` inside a real `<li>`, so Tab reaches it and
   * Enter activates it with no key handling of our own, and the `<ol>` carries
   * the ordering a screen reader announces. Items are reconciled in place,
   * keyed by id, for the same reason chips are: this runs on every refresh —
   * including the one a click on the list triggers — and replacing the node
   * would drop keyboard focus mid-interaction.
   * @param {HTMLElement|null} container The row's `.data-row-list` node.
   * @param {{ariaLabel?: string, items?: Array<object>}|null} list Descriptor.
   */
  _syncRowList(container, list) {
    syncRowList(container, list);
  }

  _refreshTogglePanel() {
    if (this._destroyed || !this._toggleContainer) return;
    // Skip DOM churn while hidden; visibilitychange (main.js) triggers one
    // refresh on return. (perf wave 2)
    if (typeof document !== 'undefined' && document.hidden) {
      this.onHiddenRefresh();
      return;
    }
    for (const layer of this.getAll()) {
      const row = this._toggleContainer.querySelector(
        `[data-layer-id="${layer.id}"]`,
      );
      if (!row) continue;

      const btn = row.querySelector('.data-toggle-btn');
      if (btn) {
        this._syncToggleButton(btn, layer);
      }

      const count = row.querySelector('.data-count');
      if (count) {
        count.textContent = this._layerCountText(layer.stats);
      }

      const meta = row.querySelector('.data-toggle-meta');
      if (meta) {
        meta.textContent = this._buildMetaText(layer);
      }

      this._syncRowControls(
        row.querySelector('.data-toggle-controls'),
        layer,
        row.querySelector('.data-row-list'),
      );
    }
    this._applyLayerFilters();
    this._refreshWeatherPanel();
  }

  _buildMetaText(layer) {
    const stats = layer.stats || {};
    const feedState = layerFeedState(stats);
    const stateLabel = FEED_STATE_LABELS[feedState];
    const source = stats.source || layer.source;
    const lifecycleState =
      layer.lifecycleState || (layer.enabled ? 'enabled' : 'disabled');
    if (lifecycleState === 'enabling' || lifecycleState === 'disabling') {
      return `${lifecycleState.toUpperCase()} · ${source}`;
    }
    if (layer.lifecycleUncertain) {
      return `UNCERTAIN · ${source} · lifecycle state requires reconciliation`;
    }
    const presentedError =
      stats.error || stats.lastError || stats.managerRefreshError;
    if (presentedError) {
      if (typeof stats.retryInSec === 'number' && stats.retryInSec > 0) {
        return `${stateLabel} · ${source} · ${presentedError} · retry ${stats.retryInSec}s`;
      }
      return `${stateLabel} · ${source} · ${presentedError}`;
    }
    // A guidance status carries its prompt in `statusMessage`, not `error`, so
    // the row still tells the operator what to do without reporting a fault.
    if (
      GUIDANCE_STATUSES.includes(String(stats.status || '').toLowerCase()) &&
      typeof stats.statusMessage === 'string' &&
      stats.statusMessage.trim()
    ) {
      return `${source} · ${stats.statusMessage.trim()}`;
    }
    const ago = stats.lastUpdate ? this._timeAgo(stats.lastUpdate) : 'never';
    if (stats.loading) {
      const loadingLabel =
        typeof stats.loadingLabel === 'string' && stats.loadingLabel.trim()
          ? stats.loadingLabel.trim()
          : 'loading...';
      return `${source} · ${loadingLabel}`;
    }
    if (feedState === 'fallback') {
      const detail =
        typeof stats.loadingLabel === 'string' && stats.loadingLabel.trim()
          ? stats.loadingLabel.trim()
          : stats.coverage || ago;
      return `${stateLabel} · ${source} · ${detail}`;
    }
    if (feedState === 'partial') {
      const { acceptedRowCount, rawRowCount } = stats;
      const detail =
        Number.isInteger(acceptedRowCount) &&
        Number.isInteger(rawRowCount) &&
        acceptedRowCount >= 0 &&
        rawRowCount > acceptedRowCount
          ? `${acceptedRowCount} of ${rawRowCount} records accepted`
          : 'incomplete snapshot';
      return `${stateLabel} · ${source} · ${detail} · ${ago}`;
    }
    if (feedState === 'stale') {
      const retry =
        typeof stats.retryInSec === 'number' && stats.retryInSec > 0
          ? ` · retrying in ${stats.retryInSec}s`
          : '';
      return `${stateLabel} · ${source} · ${ago}${retry}`;
    }
    if (typeof stats.loadingLabel === 'string' && stats.loadingLabel.trim()) {
      return `${source} · ${stats.loadingLabel.trim()}`;
    }
    return `${source} · ${ago}`;
  }

  _syncToggleButton(button, layer) {
    const unavailable = layer.stats?.sourceUnavailable === true;
    const feedState = unavailable
      ? 'unavailable'
      : layer.enabled
        ? layerFeedState(layer.stats)
        : 'off';
    const transitioning =
      layer.lifecycleState === 'enabling' ||
      layer.lifecycleState === 'disabling';
    const uncertain = Boolean(layer.lifecycleUncertain);
    button.classList.toggle('active', layer.enabled);
    button.classList.toggle('transitioning', transitioning);
    button.classList.toggle('enabling', layer.lifecycleState === 'enabling');
    button.classList.toggle('disabling', layer.lifecycleState === 'disabling');
    button.classList.toggle('lifecycle-uncertain', uncertain);
    for (const state of Object.keys(FEED_STATE_LABELS)) {
      button.classList.toggle(
        `feed-${state}`,
        (layer.enabled || unavailable) && !uncertain && feedState === state,
      );
    }
    button.dataset.feedState = transitioning
      ? layer.lifecycleState
      : uncertain
        ? 'uncertain'
        : feedState;
    // A busy toggle remains the keyboard focus owner. `aria-disabled` plus the
    // click guard above prevents repeat activation without the focus loss caused
    // by native `disabled`.
    button.disabled = false;
    button.setAttribute(
      'aria-disabled',
      String(transitioning || (unavailable && !layer.enabled)),
    );
    button.setAttribute('aria-busy', String(transitioning));
    button.textContent = transitioning
      ? layer.lifecycleState.toUpperCase()
      : uncertain
        ? 'UNCERTAIN'
        : layer.enabled || unavailable
          ? FEED_STATE_LABELS[feedState]
          : 'OFF';
    const keyGuidance = unavailable
      ? String(layer.stats.error || 'Data source unavailable')
      : layerKeyRequirementTooltip(layer);
    // Name the missing key on the control itself: a row reading KEY REQUIRED
    // without saying WHICH key leaves a dead control and no next step. Empty
    // when the layer needs no key, or already has one.
    button.title = keyGuidance;
    button.setAttribute(
      'aria-label',
      keyGuidance
        ? `${panelLabel(layer)}: ${button.textContent}. ${keyGuidance}`
        : `${panelLabel(layer)}: ${button.textContent}`,
    );
  }

  _formatCount(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  }

  _timeAgo(timestamp) {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }
}
