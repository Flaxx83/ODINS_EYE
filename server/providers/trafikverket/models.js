const minute = 60000;
const hour = 60 * minute;
/** Versions accepted by a bounded live probe on 2026-10-11. Not a promise of full API coverage. */
export const TRAFIKVERKET_MODELS = Object.freeze({
  ...Object.fromEntries(
    ['roadworks', 'accident', 'trafficmessage'].map((feed) => [
      'Datex-' + feed,
      Object.freeze({
        version: '3.1',
        feed,
        limit: 20000,
        ttlMs: 300000,
        maxStaleMs: 900000,
        maxResponseBytes: 67108864,
      }),
    ]),
  ),
  Camera: Object.freeze({
    version: '1',
    limit: 3000,
    ttlMs: 15 * minute,
    maxStaleMs: hour,
    observationField: 'PhotoTime',
    observationMaxAgeMs: 30 * minute,
  }),
  TrainAnnouncement: Object.freeze({
    version: '1.9',
    limit: 2000,
    ttlMs: 30_000,
    maxStaleMs: 2 * minute,
  }),
  TrainStation: Object.freeze({
    version: '1.4',
    limit: 2000,
    ttlMs: 24 * hour,
    maxStaleMs: 7 * 24 * hour,
  }),
  WeatherObservation: Object.freeze({
    version: '2',
    limit: 3000,
    ttlMs: 5 * minute,
    maxStaleMs: 15 * minute,
    observationField: 'Sample',
    observationMaxAgeMs: 30 * minute,
  }),
  WeatherMeasurepoint: Object.freeze({
    version: '2',
    limit: 2000,
    ttlMs: 5 * minute,
    maxStaleMs: 15 * minute,
    observationField: 'Observation.Sample',
    observationMaxAgeMs: 30 * minute,
  }),
  RoadCondition: Object.freeze({
    maxResponseBytes: 33554432,
    version: '1.2',
    limit: 2000,
    ttlMs: 5 * minute,
    maxStaleMs: 15 * minute,
  }),
});
const OPS = new Set(['EQ', 'NE', 'GT', 'GTE', 'LT', 'LTE']);
const field = (value) =>
  typeof value === 'string' &&
  /^[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*){0,3}$/.test(value) &&
  value.length <= 128;
export const escapeAttribute = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
export function normalizeQuery(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (k) => !['type', 'limit', 'include', 'filter'].includes(k),
    )
  )
    throw new TypeError('Invalid Trafikverket query');
  const model = TRAFIKVERKET_MODELS[input.type];
  if (!Object.hasOwn(TRAFIKVERKET_MODELS, input.type))
    throw new TypeError('Unsupported Trafikverket model');
  const limit = input.limit ?? model.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > model.limit)
    throw new TypeError('Invalid query limit');
  const include = input.include ?? [];
  if (!Array.isArray(include) || include.length > 40 || !include.every(field))
    throw new TypeError('Invalid query fields');
  if (model.feed && (include.length || input.filter || limit !== model.limit))
    throw new TypeError('DATEX queries use fixed feed snapshots');
  let nodes = 0;
  const normalizeFilter = (f, depth = 0) => {
    if (
      !f ||
      typeof f !== 'object' ||
      Array.isArray(f) ||
      depth > 3 ||
      ++nodes > 32
    )
      throw new TypeError('Invalid query filter');
    if (f.op === 'AND' || f.op === 'OR') {
      if (
        Object.keys(f).some((k) => !['op', 'filters'].includes(k)) ||
        !Array.isArray(f.filters) ||
        !f.filters.length ||
        f.filters.length > 16
      )
        throw new TypeError('Invalid query filter');
      return {
        op: f.op,
        filters: f.filters
          .map((x) => normalizeFilter(x, depth + 1))
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      };
    }
    if (
      Object.keys(f).some((k) => !['op', 'field', 'value'].includes(k)) ||
      !OPS.has(f.op) ||
      !field(f.field)
    )
      throw new TypeError('Invalid query filter');
    const value = f.value;
    if (
      !['string', 'number', 'boolean'].includes(typeof value) ||
      (typeof value === 'number' && !Number.isFinite(value)) ||
      String(value).length > 256 ||
      /[\x00-\x1f]/.test(String(value))
    )
      throw new TypeError('Invalid filter value');
    return { op: f.op, field: f.field, value };
  };
  return {
    type: input.type,
    version: model.version,
    limit,
    include: [...new Set(include)].sort(),
    filter: input.filter != null ? normalizeFilter(input.filter) : null,
  };
}
export function queryXml(query, apiKey) {
  const filter = (f) =>
    f.op === 'AND' || f.op === 'OR'
      ? `<${f.op}>${f.filters.map(filter).join('')}</${f.op}>`
      : `<${f.op} name="${escapeAttribute(f.field)}" value="${escapeAttribute(f.value)}"/>`;
  return `<REQUEST><LOGIN authenticationkey="${escapeAttribute(apiKey)}"/><QUERY objecttype="${query.type}" schemaversion="${query.version}" limit="${query.limit}">${query.filter ? `<FILTER>${filter(query.filter)}</FILTER>` : ''}${query.include.map((f) => `<INCLUDE>${f}</INCLUDE>`).join('')}</QUERY></REQUEST>`;
}

/** Source clocks must include a time and explicit zone; missing numeric values are not dates. */
export function parseReportedTime(value) {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
    ? Date.parse(value)
    : NaN;
}
