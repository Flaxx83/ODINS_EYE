const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time = value => value ? escape(new Date(value).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })) : 'Ej angivet';
export function warningFeatures(warnings, fetchedAt, now = Date.now()) {
  return { type: 'FeatureCollection', features: warnings.flatMap(warning => (warning.warningAreas || []).flatMap(area => {
    if (!area.area?.geometry) return [];
    if (area.approximateEnd && Date.parse(area.approximateEnd) <= now) return [];
    const title = area.eventDescription?.sv || warning.event?.sv || 'SMHI';
    const texts = [...(warning.descriptions || []), ...(area.descriptions || [])];
    return [{ type: 'Feature', id: `smhi:${warning.id}:${area.id}`, geometry: area.area.geometry, properties: {
      name: `${title} · ${area.areaName?.sv || ''}`,
      level: area.warningLevel?.code,
      description: `<h3>${escape(title)}</h3><p>${escape(area.areaName?.sv)} · ${escape(area.warningLevel?.sv)}</p><p>Från: ${time(area.approximateStart)}<br>Till: ${time(area.approximateEnd)}<br>Tider i Sverige.</p>${texts.map(d => `<h4>${escape(d.title?.sv)}</h4><p style="white-space:pre-wrap">${escape(d.text?.sv)}</p>`).join('')}<p>Publicerad: ${time(area.published)}<br>Hämtad: ${time(fetchedAt)}</p><p>Källa: <a href="https://www.smhi.se/vader/prognoser-och-varningar" target="_blank" rel="noopener noreferrer">SMHI – aktuella varningar</a></p>`,
    } }];
  })) };
}
