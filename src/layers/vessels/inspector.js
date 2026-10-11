import { vesselInspectorFields } from './inspector-model.js';
import { normalizeVesselType } from '../../data/vesselLabels.js';

export function createVesselInspector({ onClose, onTrack }) {
  let panel, record, timer;
  const update = () => {
    if (!panel || !record) return;
    panel.querySelector('h3').textContent = record.name || 'Uppgift saknas';
    panel.querySelector('.vessel-inspector-type').textContent =
      normalizeVesselType(record.type) || 'Uppgift saknas';
    const list = panel.querySelector('dl');
    list.replaceChildren();
    for (const [label, value] of vesselInspectorFields(record)) {
      const dt = document.createElement('dt'),
        dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      list.append(dt, dd);
    }
  };
  function hide() {
    clearInterval(timer);
    panel?.remove();
    panel = null;
    record = null;
  }
  function show(next) {
    if (
      typeof document === 'undefined' ||
      !document.body ||
      !document.createElement
    )
      return;
    record = next;
    if (!panel) {
      panel = document.createElement('aside');
      panel.className = 'vessel-inspector';
      panel.setAttribute('aria-label', 'Fartygsinformation');
      const header = document.createElement('header'),
        title = document.createElement('h3'),
        close = document.createElement('button');
      close.type = 'button';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Stäng fartygskort');
      close.onclick = onClose;
      header.append(title, close);
      const type = document.createElement('p');
      type.className = 'vessel-inspector-type';
      const list = document.createElement('dl'),
        track = document.createElement('button'),
        note = document.createElement('p');
      track.type = 'button';
      track.textContent = 'Visa senaste spår';
      note.className = 'vessel-inspector-note';
      note.textContent =
        'Senaste spår samlas under denna serversession. Rapporterad ETA är AIS-uppgift, inte en beräknad prognos.';
      track.onclick = async () => {
        const selected = record;
        track.disabled = true;
        try {
          const count = await onTrack(selected);
          if (record === selected && panel)
            note.textContent =
              count > 1
                ? 'Senaste insamlade spår visas på kartan. Detta är inte en fullständig resehistorik.'
                : 'Uppgift saknas: för få positionsrapporter för ett spår.';
        } catch {
          if (panel)
            note.textContent = 'Spåret kunde inte hämtas. Försök igen.';
        } finally {
          track.disabled = false;
        }
      };
      panel.append(header, type, list, track, note);
      document.body.append(panel);
      timer = setInterval(update, 30000);
    }
    update();
  }
  return { show, hide };
}
