const value = (v, unit) => (v == null ? 'Uppgift saknas' : v + ' ' + unit);
export function showWeatherCard(
  station,
  sources = [],
  context = '',
  reports = [],
) {
  document.querySelector('.road-weather-card')?.remove();
  const panel = document.createElement('section');
  panel.className = 'road-event-card road-weather-card';
  panel.setAttribute('aria-label', 'Vägväder');
  const close = document.createElement('button');
  close.textContent = 'Stäng';
  close.onclick = () => panel.remove();
  panel.append(close);
  const h = document.createElement('h3');
  h.textContent = 'Vägväder · ' + (station?.name || 'Uppgift saknas');
  panel.append(h);
  const texts = station
    ? [
        'Vägtemperatur: ' + value(station.roadTemperatureC, '°C'),
        'Lufttemperatur: ' + value(station.airTemperatureC, '°C'),
        'Nederbörd (rapporterad kod): ' +
          (station.precipitation ?? 'Uppgift saknas'),
        ...(station.wind.length ? [] : ['Vind: Uppgift saknas']),
        ...station.wind.map(
          (w) =>
            'Vind: ' +
            value(w.speedMps, 'm/s') +
            ' · riktning ' +
            value(w.directionDeg, '°') +
            ' · mäthöjd ' +
            value(w.heightM, 'm'),
        ),
        'Mättid: ' +
          (station.sampledAt
            ? new Date(station.sampledAt).toLocaleString('sv-SE', {
                timeZone: 'Europe/Stockholm',
              })
            : 'Uppgift saknas'),
        station.stale
          ? 'Gammal eller okänd observation (gräns 30 minuter)'
          : 'Observation inom 30 minuter vid hämtning',
        station.distanceKm != null
          ? 'Avstånd kamera–station: ' + station.distanceKm.toFixed(1) + ' km'
          : '',
      ]
    : [];
  texts.push(
    context,
    ...reports.map(
      (r) =>
        'Väglagsrapport i urvalet (ingen exakt punktmatchning): ' +
        (r.road || r.place || 'okänd sträcka') +
        ' · ' +
        (r.text || 'Uppgift saknas') +
        ' ' +
        r.info.join(', ') +
        ' · rapporterad ' +
        (r.reportedAt || 'okänd tid') +
        (r.stale ? ' · äldre än 6 h/okänd tid' : '') +
        ' · gäller vägsträckan, inte automatiskt stationens/kamerans exakta yta',
    ),
    'Ingen halkbedömning utifrån temperatur ensam.',
  );
  for (const text of texts) {
    if (!text) continue;
    const p = document.createElement('p');
    p.textContent = text;
    panel.append(p);
  }
  for (const s of sources) {
    const p = document.createElement('p');
    p.textContent =
      'Källa: Trafikverket · ' +
      s.type +
      ' · ' +
      s.status +
      ' · hämtad ' +
      (s.fetchedAt || 'okänd');
    panel.append(p);
  }
  document.body.append(panel);
  return panel;
}
