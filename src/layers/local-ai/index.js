import './panel.css';
import { createTripMap } from './trip-map.js';
import * as C from 'cesium';
export function createLocalAiLayer() {
  let map,
    viewer,
    panel,
    dockButton,
    dockObserver,
    positionPanel,
    escapePanel,
    request,
    enabled = false,
    recorder,
    stream,
    recordTimer;
  function stopRecording() {
    clearTimeout(recordTimer);
    if (recorder?.state === 'recording') recorder.stop();
    stream?.getTracks().forEach((t) => t.stop());
  }
  return {
    id: 'local-ai',
    name: 'Lokal AI · Bionic',
    category: 'tools',
    init(v) {
      viewer = v;
      map = createTripMap(v);
    },
    enable() {
      enabled = true;
      panel = document.createElement('aside');
      panel.className = 'local-ai-panel';
      panel.setAttribute('aria-label', 'Lokal AI');
      const title = document.createElement('h3');
      title.textContent = 'Lokal AI';
      const header = document.createElement('header');
      header.className = 'local-ai-header';
      const body = document.createElement('div');
      body.className = 'local-ai-body';
      const fold = document.createElement('button');
      fold.type = 'button';
      fold.textContent = '−';
      fold.setAttribute('aria-label', 'Minimera AI-panelen');
      fold.setAttribute('aria-expanded', 'true');
      panel.id = 'local-ai-popover';
      dockButton = document.createElement('button');
      dockButton.type = 'button';
      dockButton.className = 'local-ai-dock-button';
      dockButton.textContent = 'AI';
      dockButton.setAttribute('aria-controls', panel.id);
      dockButton.setAttribute('aria-expanded', 'true');
      dockButton.setAttribute('aria-label', 'Minimera lokal AI');
      const setOpen = (open) => {
        panel.hidden = !open;
        dockButton.setAttribute('aria-expanded', String(open));
        dockButton.setAttribute(
          'aria-label',
          open ? 'Minimera lokal AI' : 'Öppna lokal AI',
        );
        if (open) positionPanel();
      };
      fold.onclick = () => {
        setOpen(false);
        dockButton.focus();
      };
      dockButton.onclick = () => setOpen(panel.hidden);
      escapePanel = (event) => {
        if (
          event.key === 'Escape' &&
          !panel.hidden &&
          panel.contains(document.activeElement)
        ) {
          setOpen(false);
          dockButton.focus();
        }
      };
      document.addEventListener('keydown', escapePanel);
      positionPanel = () => {
        if (!dockButton?.isConnected || panel.hidden) return;
        const anchor = dockButton.getBoundingClientRect();
        const width = panel.getBoundingClientRect().width;
        const location = document
          .getElementById('location-bar')
          ?.getBoundingClientRect();
        const rightEdge = location?.right ?? anchor.right;
        panel.style.left =
          Math.max(
            12,
            Math.min(rightEdge - width, window.innerWidth - width - 12),
          ) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = window.innerHeight - anchor.top + 12 + 'px';
        panel.style.maxHeight = Math.max(100, anchor.top - 24) + 'px';
      };
      header.append(title, fold);
      const model = document.createElement('div');
      model.className = 'local-ai-model';
      model.textContent = 'BIONIC · Qwen3.5 4B';
      const hint = document.createElement('p');
      hint.textContent =
        'Planera en resa, utforska kartan eller fråga om trafik, polis och luftkvalitet i området.';
      hint.className = 'local-ai-hint';
      const network = document.createElement('select');
      for (const n of ['Västtrafik', 'SL', 'Hela Sverige']) {
        const o = document.createElement('option');
        o.textContent = n;
        network.append(o);
      }
      const networkLabel = document.createElement('label');
      networkLabel.className = 'local-ai-field';
      networkLabel.append(document.createTextNode('Trafiknät'), network);
      const form = document.createElement('form'),
        input = document.createElement('textarea');
      input.placeholder =
        'Exempel: Jag vill resa från Skövde resecentrum till Vällingby imorgon kl 07:00.';
      input.setAttribute('aria-label', 'Fråga eller reseönskemål');
      input.maxLength = 2000;

      const send = document.createElement('button');
      send.textContent = 'Skicka ↗';
      send.className = 'local-ai-send';
      const mic = document.createElement('button');
      mic.type = 'button';
      mic.textContent = 'Spela in';
      const speak = document.createElement('button');
      speak.type = 'button';
      speak.textContent = 'Läs upp svar';
      const output = document.createElement('div');
      output.className = 'local-ai-output';
      output.setAttribute('aria-live', 'polite');
      const choices = document.createElement('div');
      choices.className = 'local-ai-choices';
      const actions = document.createElement('div');
      actions.className = 'local-ai-actions';
      actions.append(send, mic, speak);
      form.append(input, actions);
      body.append(model, hint, networkLabel, form, choices, output);
      panel.append(header, body);
      document.body.append(panel);
      const dock = document.getElementById('command-dock');
      if (dock) dock.prepend(dockButton);
      else document.body.append(dockButton);
      dockObserver = new ResizeObserver(positionPanel);
      dockObserver.observe(dock || dockButton);
      if (dock) dockObserver.observe(dockButton);
      window.addEventListener('resize', positionPanel);
      positionPanel();
      let lastAnswer = '',
        tripChoice = null;
      async function submit(message, choice) {
        send.disabled = true;
        choices.replaceChildren();
        map.clear();
        output.textContent = 'Hämtar svar…';
        request = new AbortController();
        try {
          const r = await fetch('/api/local-ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message:
                network.value === 'Hela Sverige' &&
                !message.startsWith('Sverige:')
                  ? 'Sverige: ' + message
                  : network.value === 'SL' && !message.startsWith('SL:')
                    ? 'SL: ' + message
                    : message,
              choice,
              area: {
                lat: C.Math.toDegrees(
                  viewer.camera.positionCartographic.latitude,
                ),
                lon: C.Math.toDegrees(
                  viewer.camera.positionCartographic.longitude,
                ),
              },
            }),
            signal: request.signal,
          });
          const d = await r.json();
          if (!r.ok) throw Error(d.error);
          if (!enabled) return;
          output.textContent = d.answer;
          lastAnswer = d.answer;
          for (const source of d.sources || []) {
            const p = document.createElement('p'),
              a = document.createElement('a');
            a.href = source.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = source.name;
            p.append(
              a,
              document.createTextNode(
                ' · hämtat ' + new Date(source.time).toLocaleString('sv-SE'),
              ),
            );
            output.append(p);
          }
          if (d.mapTrips?.length) {
            const note = document.createElement('p');
            note.textContent =
              'Vit: gång. Blå: buss. Lila: spårtrafik. Linjer följer hämtad eller beräknad nätgeometri. Beräknad spårväg är inte bekräftelse på tågets faktiska spårval. Gångvägar: © OpenStreetMap contributors, Valhalla/FOSSGIS. Övriga delsträckor visar ändpunkter och Resväg saknas. Klicka på ett förslag för att visa det.';
            choices.append(note);
            for (const trip of d.mapTrips) {
              const b = document.createElement('button');
              b.textContent =
                trip.label +
                ' · Visa på kartan (' +
                trip.legs.filter((l) => !l.approximate).length +
                '/' +
                trip.legs.length +
                ' sträckor med geometri)';
              b.onclick = () => {
                map.show(trip);
                let report = choices.querySelector('[data-route-coverage]');
                if (!report) {
                  report = document.createElement('div');
                  report.setAttribute('data-route-coverage', '');
                  choices.append(report);
                }
                report.replaceChildren();
                const title = document.createElement('p');
                const missing = trip.legs.filter((l) => l.approximate);
                title.textContent = missing.length
                  ? 'Ofullständig resväg — följande delsträckor saknar geometri:'
                  : 'Alla delsträckor har geometri.';
                report.append(title);
                for (const warning of trip.geometryWarnings || []) {
                  const p = document.createElement('p');
                  p.textContent = warning.message;
                  report.append(p);
                }
                for (const leg of trip.legs.filter((l) => !l.approximate)) {
                  const p = document.createElement('p');
                  p.textContent =
                    leg.name + ': ' + (leg.geometrySource || 'Källgeometri');
                  report.append(p);
                }
                for (const leg of missing) {
                  const p = document.createElement('p');
                  p.textContent = leg.name + ': ' + leg.from + ' → ' + leg.to;
                  report.append(p);
                }
              };
              choices.append(b);
            }
            const clear = document.createElement('button');
            clear.textContent = 'Dölj resväg';
            clear.onclick = () => map.clear();
            choices.append(clear);
          }
          if (d.tripChoices) {
            tripChoice = d.tripChoices;
            const selects = [];
            for (const [label, rows] of [
              ['Från', tripChoice.origins],
              ['Till', tripChoice.destinations],
            ]) {
              const l = document.createElement('label');
              l.textContent = label;
              const select = document.createElement('select');
              select.style.maxWidth = '100%';
              for (const row of rows) {
                const o = document.createElement('option');
                o.value = row.gid;
                o.textContent = row.name;
                select.append(o);
              }
              l.append(select);
              choices.append(l);
              selects.push(select);
            }
            const go = document.createElement('button');
            go.textContent = 'Hämta resor';
            go.onclick = () =>
              submit(tripChoice.message, {
                origin: selects[0].value,
                destination: selects[1].value,
              });
            choices.append(go);
          }
          if (d.destination)
            viewer.camera.flyTo({
              destination: C.Cartesian3.fromDegrees(
                d.destination.lon,
                d.destination.lat,
                25000,
              ),
              orientation: { heading: 0, pitch: -C.Math.PI_OVER_TWO, roll: 0 },
              duration: 2,
            });
        } catch (e) {
          if (enabled) output.textContent = e.message;
        } finally {
          send.disabled = false;
        }
      }
      form.onsubmit = (e) => {
        e.preventDefault();
        if (input.value.trim()) submit(input.value);
      };
      mic.onclick = async () => {
        if (recorder?.state === 'recording') {
          stopRecording();
          return;
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (!enabled) {
            stopRecording();
            return;
          }
          const chunks = [];
          recorder = new MediaRecorder(stream);
          recorder.ondataavailable = (e) => {
            if (e.data.size) chunks.push(e.data);
          };
          recorder.onstop = async () => {
            clearTimeout(recordTimer);
            stream?.getTracks().forEach((t) => t.stop());
            mic.textContent = 'Spela in';
            if (!enabled) return;
            mic.disabled = true;
            output.textContent = 'Tolkar tal lokalt…';
            try {
              const r = await fetch('/api/local-voice', {
                method: 'POST',
                body: new Blob(chunks, { type: recorder.mimeType }),
              });
              const d = await r.json();
              if (!r.ok) throw Error(d.error);
              if (!enabled) return;
              input.value = d.text;
              output.textContent = d.text
                ? 'Granska texten och klicka Skicka.'
                : 'Inget tal hittades. Försök igen.';
            } catch (e) {
              if (enabled) output.textContent = e.message;
            } finally {
              mic.disabled = false;
            }
          };
          recorder.start();
          mic.textContent = 'Stoppa inspelning';
          output.textContent = 'Spelar in, högst 30 sekunder…';
          recordTimer = setTimeout(stopRecording, 30000);
        } catch (e) {
          output.textContent = 'Mikrofonen kunde inte startas: ' + e.message;
        }
      };
      speak.onclick = () => {
        if (!lastAnswer) return;
        const voice = speechSynthesis
          .getVoices()
          .find((v) => v.localService && v.lang.startsWith('sv'));
        if (!voice) {
          output.append(
            document.createTextNode(
              '\nIngen lokal svensk uppläsningsröst är installerad. Installera en svensk röst i Windows språk-/talinställningar.',
            ),
          );
          return;
        }
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(lastAnswer);
        u.voice = voice;
        u.lang = 'sv-SE';
        speechSynthesis.speak(u);
      };
    },
    disable() {
      enabled = false;
      request?.abort();
      map.clear();
      stopRecording();
      speechSynthesis.cancel();
      dockObserver?.disconnect();
      window.removeEventListener('resize', positionPanel);
      document.removeEventListener('keydown', escapePanel);
      dockButton?.remove();
      panel?.remove();
    },
    update() {
      return true;
    },
    getStats() {
      return { count: 0 };
    },
    destroy() {
      this.disable();
      map.destroy();
    },
  };
}
