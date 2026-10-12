import { parseRoadDatex } from './road-model.js';
import { readResponseTextCapped } from '../../../src/sources/httpBody.js';
import {
  TRAFIKVERKET_MODELS,
  normalizeQuery,
  queryXml,
  parseReportedTime,
} from './models.js';
const API_URL = 'https://api.trafikinfo.trafikverket.se/v2/data.json';
const DAY = 86400000;
const failure = (code, httpStatus) =>
  Object.assign(new Error('Trafikverket request failed'), { code, httpStatus });
const iso = (ms) => new Date(ms).toISOString();
/** Bound structural work and reject decoded credential echoes, including JSON escapes. */
function validatePayloadTree(payload, apiKey) {
  const pending = [[payload, 0]];
  let visited = 0;
  while (pending.length) {
    const [value, depth] = pending.pop();
    if (++visited > 500000 || depth > 64) throw failure('invalid_schema');
    if (typeof value === 'string' && value.includes(apiKey))
      throw failure('credential_in_response');
    if (typeof value === 'number' && !Number.isFinite(value))
      throw failure('invalid_schema');
    if (value && typeof value === 'object') {
      for (const [name, child] of Object.entries(value)) {
        if (name.includes(apiKey)) throw failure('credential_in_response');
        pending.push([child, depth + 1]);
      }
    }
  }
}

/** Bounded, server-only cache and budget shared by all consumers of one client. */
export function createTrafikverketClient({
  fetchImpl = fetch,
  getApiKey = () => process.env.TRAFIKVERKET_API_KEY,
  now = Date.now,
  timeoutMs = 20000,
  maxResponseBytes = 6 * 1024 * 1024,
  maxCacheBytes = 32 * 1024 * 1024,
  maxEntries = 32,
  maxInFlight = 4,
  dailyBudget = 5000,
  minuteBudget = 60,
  policies = {},
} = {}) {
  for (const value of [
    timeoutMs,
    maxResponseBytes,
    maxCacheBytes,
    maxEntries,
    maxInFlight,
  ])
    if (!Number.isInteger(value) || value < 1)
      throw new TypeError('Invalid client configuration');
  for (const value of [dailyBudget, minuteBudget])
    if (!Number.isInteger(value) || value < 0)
      throw new TypeError('Invalid request budget');
  if (
    typeof fetchImpl !== 'function' ||
    typeof getApiKey !== 'function' ||
    typeof now !== 'function' ||
    !policies ||
    typeof policies !== 'object' ||
    Array.isArray(policies) ||
    Object.keys(policies).some(
      (type) => !Object.hasOwn(TRAFIKVERKET_MODELS, type),
    )
  )
    throw new TypeError('Invalid client configuration');
  const resolved = Object.fromEntries(
    Object.entries(TRAFIKVERKET_MODELS).map(([type, model]) => {
      const override = policies[type] || {};
      if (
        Object.keys(override).some(
          (name) => !['ttlMs', 'maxStaleMs'].includes(name),
        )
      )
        throw new TypeError('Invalid cache policy');
      return [type, Object.freeze({ ...model, ...override })];
    }),
  );
  const policy = (type) => resolved[type];
  for (const type of Object.keys(TRAFIKVERKET_MODELS)) {
    const p = policy(type);
    if (
      !Number.isFinite(p.ttlMs) ||
      p.ttlMs < 0 ||
      !Number.isFinite(p.maxStaleMs) ||
      p.maxStaleMs < p.ttlMs
    )
      throw new TypeError('Invalid cache policy');
  }
  const entries = new Map();
  let cachedBytes = 0,
    active = 0,
    credential,
    epoch = 0,
    day = -1,
    dayRequests = 0,
    windowStart = 0,
    minuteRequests = 0,
    cooldownUntil = 0,
    cooldownCode = null;
  const key = () => {
    let value = String(getApiKey() || '').trim();
    if (value.length > 512 || /[\x00-\x1f]/.test(value)) value = '';
    if (value !== credential) {
      credential = value;
      epoch++;
      entries.clear();
      cachedBytes = 0;
      cooldownUntil = 0;
      cooldownCode = null;
    }
    return value;
  };
  const resetBudget = () => {
    const time = now(),
      date = Math.floor(time / DAY);
    if (date !== day) {
      day = date;
      dayRequests = 0;
    }
    if (time - windowStart >= 60000 || time < windowStart) {
      windowStart = time;
      minuteRequests = 0;
    }
  };
  const remove = (id, state) => {
    entries.delete(id);
    cachedBytes -= state.bytes || 0;
  };
  const trim = () => {
    for (const [id, state] of entries) {
      if (cachedBytes <= maxCacheBytes) break;
      if (!state.inflight) remove(id, state);
    }
  };
  const clocks = (rows, p) => {
    let unknown = 0,
      stale = 0,
      fresh = 0;
    const measured = [],
      modified = [];
    for (const row of rows) {
      const m = parseReportedTime(row.ModifiedTime);
      if (Number.isFinite(m) && m <= now() + 300000) modified.push(m);
      const value = p.observationField
        ? parseReportedTime(row[p.observationField])
        : NaN;
      if (!Number.isFinite(value) || value > now() + 300000) {
        unknown++;
        continue;
      }
      measured.push(value);
      if (now() - value > p.observationMaxAgeMs) stale++;
      else fresh++;
    }
    return {
      observationField: p.observationField || null,
      oldestObservationAt: measured.length ? iso(Math.min(...measured)) : null,
      newestObservationAt: measured.length ? iso(Math.max(...measured)) : null,
      sourceUpdatedAt: modified.length ? iso(Math.max(...modified)) : null,
      unknownObservations: unknown,
      staleObservations: stale,
      freshObservations: fresh,
    };
  };
  const snapshot = (state, type, statusOverride) => {
    const p = policy(type),
      age =
        state.fetchedAt == null ? null : Math.max(0, now() - state.fetchedAt),
      usable = state.rows != null && age != null && age <= p.maxStaleMs;
    const stale = usable && age >= p.ttlMs;
    return {
      rows: usable ? structuredClone(state.rows) : null,
      metadata: {
        provider: 'Trafikverket',
        license: 'CC0 1.0',
        type,
        schemaVersion: p.version,
        status:
          statusOverride ||
          (usable ? (stale ? 'stale' : 'cached') : 'unavailable'),
        fetchedAt: state.fetchedAt == null ? null : iso(state.fetchedAt),
        cacheAgeMs: age,
        stale,
        refreshFailed: Boolean(state.error?.refreshFailed),
        errorCode: state.error?.code || null,
        httpStatus: state.error?.httpStatus || null,
        lastAttemptAt:
          state.lastAttemptAt == null ? null : iso(state.lastAttemptAt),
        retryAt: state.retryAt > now() ? iso(state.retryAt) : null,
        complete: usable ? state.rows.length < state.limit : false,
        empty: usable ? state.rows.length === 0 : null,
        ...(usable
          ? clocks(state.rows, p)
          : {
              observationField: p.observationField || null,
              oldestObservationAt: null,
              newestObservationAt: null,
              sourceUpdatedAt: null,
              unknownObservations: 0,
              staleObservations: 0,
              freshObservations: 0,
            }),
      },
    };
  };
  const retryAfter = (response) => {
    const raw = response.headers?.get('retry-after');
    if (!raw) return 0;
    const seconds = Number(raw),
      date = Date.parse(raw);
    return Math.min(
      DAY,
      Math.max(
        0,
        Number.isFinite(seconds)
          ? seconds * 1000
          : Number.isFinite(date)
            ? date - now()
            : 0,
      ),
    );
  };
  async function refresh(spec, state, apiKey, generation) {
    active++;
    dayRequests++;
    minuteRequests++;
    state.lastAttemptAt = now();
    const controller = new AbortController();
    let timeout;
    try {
      const deadline = new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(failure('timeout'));
        }, timeoutMs);
      });
      const work = (async () => {
        const model = TRAFIKVERKET_MODELS[spec.type];
        const datexUrl = model.feed
          ? new URL(
              'https://api.trafikinfo.trafikverket.se/v2/datex2/3.1/' +
                model.feed +
                '/sit:situation',
            )
          : null;
        if (datexUrl) datexUrl.searchParams.set('authenticationkey', apiKey);
        const response = await fetchImpl(datexUrl?.href || API_URL, {
          method: datexUrl ? 'GET' : 'POST',
          headers: { 'Content-Type': 'text/xml' },
          ...(datexUrl ? {} : { body: queryXml(spec, apiKey) }),
          redirect: 'error',
          signal: controller.signal,
        });
        if (!response.ok) {
          void response.body?.cancel?.().catch(() => {});
          throw Object.assign(
            failure(
              response.status === 429 ? 'upstream_rate_limit' : 'upstream_http',
              response.status,
            ),
            { retryMs: retryAfter(response) },
          );
        }
        const text = await readResponseTextCapped(
          response,
          model.maxResponseBytes || maxResponseBytes,
          controller.signal,
        );
        if (text.includes(apiKey)) throw failure('credential_in_response');
        if (model.feed) {
          try {
            return parseRoadDatex(text, model.feed);
          } catch {
            throw failure('invalid_schema');
          }
        }
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          throw failure('invalid_json');
        }
        validatePayloadTree(payload, apiKey);
        const result = payload.RESPONSE?.RESULT;
        if (result?.[0]?.ERROR || payload.RESPONSE?.ERROR)
          throw failure('upstream_api');
        if (!Array.isArray(result) || result.length !== 1)
          throw failure('invalid_schema');
        const rows = result[0]?.[spec.type];
        if (
          !Array.isArray(rows) ||
          rows.length > spec.limit ||
          rows.some(
            (row) => !row || typeof row !== 'object' || Array.isArray(row),
          )
        )
          throw failure('invalid_schema');
        if (JSON.stringify(rows).includes(apiKey))
          throw failure('credential_in_response');
        return rows;
      })();
      const rows = await Promise.race([work, deadline]);
      if (generation !== epoch) return;
      let owned, bytes;
      try {
        owned = structuredClone(rows);
        bytes = new TextEncoder().encode(JSON.stringify(owned)).byteLength;
      } catch {
        throw failure('invalid_schema');
      }
      cachedBytes -= state.bytes || 0;
      state.rows = owned;
      state.bytes = bytes;
      cachedBytes += state.bytes;
      state.fetchedAt = now();
      state.error = null;
      state.retryAt = 0;
      state.failures = 0;
    } catch (error) {
      if (generation === epoch) {
        const allowed = new Set([
          'timeout',
          'invalid_json',
          'invalid_schema',
          'credential_in_response',
          'upstream_http',
          'upstream_api',
          'upstream_rate_limit',
          'RESPONSE_TOO_LARGE',
        ]);
        state.failures = (state.failures || 0) + 1;
        state.error = {
          code: allowed.has(error?.code) ? error.code : 'network',
          httpStatus: Number.isInteger(error?.httpStatus)
            ? error.httpStatus
            : null,
          refreshFailed: true,
        };
        state.retryAt =
          now() +
          Math.max(
            Math.min(900000, 30000 * 2 ** Math.min(10, state.failures - 1)),
            error?.retryMs || 0,
          );
        if (error?.code === 'upstream_rate_limit' || error?.retryMs > 0) {
          cooldownUntil = Math.max(cooldownUntil, state.retryAt);
          cooldownCode = state.error.code;
        }
      }
    } finally {
      clearTimeout(timeout);
      controller.abort();
      active--;
    }
  }
  async function query(input) {
    const spec = normalizeQuery(input),
      apiKey = key();
    resetBudget();
    if (!apiKey) return snapshot({}, spec.type, 'unconfigured');
    const id = JSON.stringify(spec);
    let state = entries.get(id);
    if (!state) {
      if (entries.size >= maxEntries) {
        const victim = [...entries].find(([, s]) => !s.inflight);
        if (victim) remove(...victim);
        else
          return snapshot(
            { error: { code: 'busy', refreshFailed: false } },
            spec.type,
          );
      }
      state = { type: spec.type, limit: spec.limit, rows: null, bytes: 0 };
      entries.set(id, state);
    }
    // LRU ordering only; cache freshness is tied to the successful response clock.
    entries.delete(id);
    entries.set(id, state);
    if (state.rows && now() - state.fetchedAt < policy(spec.type).ttlMs)
      return snapshot(state, spec.type);
    if (state.inflight) {
      const generation = epoch;
      await state.inflight;
      if (generation !== epoch)
        return snapshot(
          { error: { code: 'credentials_changed', refreshFailed: false } },
          spec.type,
        );
      return snapshot(state, spec.type);
    }
    if (state.retryAt > now()) return snapshot(state, spec.type);
    if (cooldownUntil > now())
      return snapshot(
        {
          ...state,
          error: { code: cooldownCode, refreshFailed: false },
          retryAt: cooldownUntil,
        },
        spec.type,
      );
    if (dayRequests >= dailyBudget || minuteRequests >= minuteBudget) {
      state.error = { code: 'request_budget', refreshFailed: false };
      state.retryAt =
        dayRequests >= dailyBudget ? (day + 1) * DAY : windowStart + 60000;
      return snapshot(state, spec.type);
    }
    if (active >= maxInFlight)
      return snapshot(
        { ...state, error: { code: 'busy', refreshFailed: false } },
        spec.type,
      );
    const generation = epoch;
    state.inflight = refresh(spec, state, apiKey, generation);
    await state.inflight;
    state.inflight = null;
    trim();
    if (generation !== epoch)
      return snapshot(
        { error: { code: 'credentials_changed', refreshFailed: false } },
        spec.type,
      );
    return snapshot(state, spec.type, state.error ? undefined : 'fresh');
  }
  function getStatus() {
    const configured = Boolean(key());
    resetBudget();
    return {
      provider: 'Trafikverket',
      configured,
      license: 'CC0 1.0',
      activeRequests: active,
      cacheEntries: entries.size,
      cachedBytes,
      dailyRequests: dayRequests,
      dailyBudget,
      minuteRequests,
      minuteBudget,
      models: Object.entries(TRAFIKVERKET_MODELS).map(([type, p]) => ({
        type,
        schemaVersion: p.version,
        queries: [...entries.values()].filter((s) => s.type === type).length,
      })),
      upstreamRetryAt: cooldownUntil > now() ? iso(cooldownUntil) : null,
      cachedQueries: [...entries.values()].map((s) => ({
        type: s.type,
        status:
          s.rows != null && now() - s.fetchedAt <= policy(s.type).maxStaleMs
            ? now() - s.fetchedAt >= policy(s.type).ttlMs
              ? 'stale'
              : 'cached'
            : 'unavailable',
        fetchedAt: s.fetchedAt == null ? null : iso(s.fetchedAt),
        errorCode: s.error?.code || null,
        ...(s.rows ? clocks(s.rows, policy(s.type)) : {}),
      })),
    };
  }
  return Object.freeze({ query, getStatus });
}
let shared;
export function getTrafikverketClient() {
  shared ??= createTrafikverketClient({
    dailyBudget: Number(process.env.TRAFIKVERKET_DAILY_REQUEST_BUDGET ?? 5000),
  });
  return shared;
}
