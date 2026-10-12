import { tripAddressCandidates } from './address-search.js';
import { planSlTrip } from './local-sl-trip.js';
import { normalizeTravelMessage, needsTravelRoute } from './travel-input.js';
import { trafficAnswer } from './local-traffic.js';
import { planTrip } from './local-trip.js';
import { localDataContext } from './local-ai-data.js';
export async function executeLocalQuery(
  message,
  area,
  base = 'http://127.0.0.1:4173',
  choice,
  toolOptions,
) {
  message = normalizeTravelMessage(message);
  if (toolOptions?.tool === 'traffic_status')
    return trafficAnswer(message, area, base, {
      selected: true,
      placeName: toolOptions.place,
      mode: toolOptions.mode,
    });
  if (needsTravelRoute(message))
    return {
      answer:
        'Skriv hela resan med från, till, datum och klockslag. Tidigare resefrågor återanvänds inte automatiskt.',
      needsClarification: true,
    };
  const tripOptions =
    toolOptions?.tool === 'plan_trip'
      ? { getAddresses: tripAddressCandidates }
      : undefined;
  const isTrip =
    /från.+till/i.test(message) &&
    /åka|resa|buss|spårvagn|tunnelbana|tåg/i.test(message);
  if (isTrip && /^Sverige:/i.test(message))
    return planSlTrip(message, choice, base, true, tripOptions);
  if (isTrip && /^SL:/i.test(message))
    return planSlTrip(message, choice, base, false, tripOptions);
  const trip = await planTrip(message, choice, tripOptions);
  if (trip) return trip;
  const traffic = await trafficAnswer(message, area, base);
  if (traffic) return traffic;
  const context = await localDataContext(message, area, base);
  if (context) {
    const lines = [
      'Hämtade uppgifter inom 50 km från kartpositionen (' +
        area.lat.toFixed(3) +
        ', ' +
        area.lon.toFixed(3) +
        ').',
    ];
    if (context.police) {
      const p = context.police;
      if (p.error) lines.push('Polisen: ' + p.error);
      else {
        lines.push(
          'Polisen: ' +
            p.total +
            ' publicerade notiser i urvalet. Visar högst 20.',
        );
        for (const e of p.events) lines.push(e.title + ' — ' + e.summary);
        lines.push(p.note);
      }
    }
    if (context.air) {
      const a = context.air;
      if (a.error) lines.push('Luftkvalitet: ' + a.error);
      else {
        lines.push(
          a.total
            ? 'EEA: ' + a.total + ' mätserier i området.'
            : 'EEA: inga matchade aktuella mätningar i området. Luftkvaliteten kan därför inte bedömas.',
        );
        for (const e of a.measurements)
          lines.push(
            e.name +
              ': ' +
              { 6001: 'PM2,5', 5: 'PM10', 8: 'NO2', 7: 'Ozon' }[e.pollutant] +
              ' ' +
              e.value.toFixed(2) +
              ' ' +
              e.unit +
              ' (' +
              e.aggregation +
              '), ' +
              e.time +
              (e.stale ? ' — äldre än 6 timmar' : ''),
          );
        lines.push(a.note);
        if (a.refreshFailed)
          lines.push('Uppdatering misslyckades; tidigare hämtade data visas.');
      }
    }
    return {
      answer: lines.join('\n'),
      sources: context.sources,
      area: context.area,
    };
  }
  return {
    answer: 'Ingen ansluten datakälla valdes för frågan.',
    needsClarification: true,
  };
}
