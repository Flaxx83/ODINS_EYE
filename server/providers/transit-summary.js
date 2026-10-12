import { stockholmTime } from './trafikverket/train-status.js';
import { parseReportedTime } from './trafikverket/models.js';

export function trafficTime(value) {
  if (typeof value !== 'string') return null;
  const calendar = value.slice(0, 10);
  const date = Date.parse(calendar + 'T00:00:00Z');
  if (
    !Number.isFinite(date) ||
    new Date(date).toISOString().slice(0, 10) !== calendar
  )
    return null;
  if (Number(value.slice(11, 13)) > 23) return null;
  const zoned = parseReportedTime(value);
  if (Number.isFinite(zoned)) return zoned;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) return null;
  const local = stockholmTime(calendar, value.slice(11));
  return local ? Date.parse(local) : null;
}
export function departureStatus(d) {
  if (d.stale === true || d.conflict === true) return 'unknown';
  if (d.canceled === true) return 'cancelled';
  if (d.is_realtime !== true || !Number.isFinite(d.delay)) return 'unknown';
  return d.delay > 60 ? 'late' : d.delay < -60 ? 'early' : 'onTime';
}
const id = (value) =>
  typeof value === 'string' && value.trim() && value.length <= 256
    ? value.trim()
    : null;
export function normalizeDeparture(row, provider, stale = false) {
  if (!row || typeof row !== 'object') return null;
  const vt = provider === 'vasttrafik';
  const planned = trafficTime(vt ? row.plannedTime : row.scheduled);
  const estimated = trafficTime(vt ? row.estimatedTime : row.realtime);
  const tripId = id(vt ? row.serviceJourney?.gid : row.trip?.trip_id);
  const stopId = id(vt ? row.stopPoint?.gid : row.stop?.id);
  const mode = String(
    vt
      ? row.serviceJourney?.line?.transportMode || ''
      : row.route?.transport_mode || '',
  ).toUpperCase();
  if (planned == null || !tripId || !stopId || !mode) return null;
  const hasForecast =
    estimated != null &&
    Math.abs(estimated - planned) <= 48 * 3600000 &&
    (vt || row.is_realtime === true);
  const delay = hasForecast ? (estimated - planned) / 1000 : null;
  const conflict =
    !vt &&
    hasForecast &&
    Number.isFinite(row.delay) &&
    Math.abs(row.delay - delay) > 1;
  return {
    key: JSON.stringify([
      provider,
      tripId,
      vt ? null : id(row.trip?.start_date),
      stopId,
      planned,
    ]),
    provider,
    tripId,
    stopId,
    mode,
    planned,
    estimated: hasForecast ? estimated : null,
    canceled: (vt ? row.isCancelled : row.canceled) === true,
    is_realtime: hasForecast,
    delay,
    conflict,
    stale,
  };
}
export function summarizeDepartures(results, { start, end, modes = [] }) {
  const groups = new Map();
  const coverage = {
    selectedStops: results.length,
    successfulStops: 0,
    failedStops: 0,
    emptyStops: 0,
    cappedStops: 0,
    staleStops: 0,
    invalidRows: 0,
    excludedRows: 0,
    outsideWindowRows: 0,
    duplicateRows: 0,
    conflictingDepartures: 0,
  };
  const stops = [];
  for (const result of results) {
    if (result.error) {
      coverage.failedStops++;
      stops.push({
        id: result.id,
        name: result.name,
        status: 'unavailable',
        reason: result.error,
      });
      continue;
    }
    coverage.successfulStops++;
    if (!result.rows.length) coverage.emptyStops++;
    if (result.capped) coverage.cappedStops++;
    if (result.stale) coverage.staleStops++;
    stops.push({
      id: result.id,
      name: result.name,
      status: result.stale ? 'stale' : 'available',
      fetchedAt: result.fetchedAt,
      generatedAt: result.generatedAt,
      returnedRows: result.rows.length,
      capped: result.capped,
    });
    for (const row of result.rows) {
      if (
        !row ||
        typeof row !== 'object' ||
        (result.provider === 'sl' && typeof row.agency?.name !== 'string')
      ) {
        coverage.invalidRows++;
        continue;
      }
      if (
        result.provider === 'sl' &&
        !/^(?:AB )?SL(?: Kundtjänst)?$/i.test(row.agency?.name || '')
      ) {
        coverage.excludedRows++;
        continue;
      }
      const d = normalizeDeparture(row, result.provider, result.stale);
      if (!d) {
        coverage.invalidRows++;
        continue;
      }
      if (modes.length && !modes.includes(d.mode)) {
        coverage.excludedRows++;
        continue;
      }
      const effective =
        !d.stale && !d.conflict && !d.canceled && d.estimated != null
          ? d.estimated
          : d.planned;
      if (effective < start || effective >= end) {
        coverage.outsideWindowRows++;
        continue;
      }
      const old = groups.get(d.key);
      if (old) {
        coverage.duplicateRows++;
        if (
          old.canceled !== d.canceled ||
          old.is_realtime !== d.is_realtime ||
          old.delay !== d.delay ||
          old.mode !== d.mode
        )
          old.conflict = true;
        old.stale ||= d.stale;
        old.conflict ||= d.conflict;
      } else groups.set(d.key, d);
    }
  }
  const totals =
    coverage.successfulStops &&
    !(groups.size === 0 && (coverage.invalidRows || coverage.staleStops))
      ? { late: 0, early: 0, onTime: 0, unknown: 0, cancelled: 0 }
      : null;
  for (const d of groups.values()) {
    totals[departureStatus(d)]++;
    if (d.conflict) coverage.conflictingDepartures++;
  }
  const partial =
    coverage.failedStops ||
    coverage.cappedStops ||
    coverage.staleStops ||
    coverage.invalidRows ||
    coverage.conflictingDepartures;
  return {
    status: !coverage.successfulStops
      ? 'unavailable'
      : partial
        ? 'partial'
        : 'sample',
    window: {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      minutes: (end - start) / 60000,
    },
    thresholdSeconds: 60,
    unit: 'unique_stop_departures',
    count: totals ? groups.size : null,
    totals,
    coverage,
    stops,
  };
}
