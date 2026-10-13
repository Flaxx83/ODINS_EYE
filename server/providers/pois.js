import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { admitSameSite } from './common/same-site.js';
import { readResponseTextCapped } from '../../src/sources/httpBody.js';

const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
const idValid = (id) => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
export function validatePoi(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('Ogiltig plats.');
  const result = {};
  for (const [key, max] of [
    ['name', 140],
    ['address', 500],
    ['notes', 10000],
  ]) {
    if (
      typeof value[key] !== 'string' ||
      value[key].length > max ||
      value[key].includes('\0')
    )
      fail('Ogiltigt ' + key + '.');
    result[key] = key === 'notes' ? value[key] : value[key].trim();
  }
  if (!result.name) fail('Ange ett namn.');
  for (const [key, max] of [
    ['lat', 90],
    ['lon', 180],
  ]) {
    if (
      typeof value[key] !== 'number' ||
      !Number.isFinite(value[key]) ||
      Math.abs(value[key]) > max
    )
      fail('Ogiltiga koordinater.');
    result[key] = value[key];
  }
  return result;
}
export function openPoiStore(
  path,
  { now = () => new Date().toISOString() } = {},
) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 1) {
    db.close();
    fail('Databasen kräver en nyare appversion.', 503);
  }
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
  if (version === 0)
    db.exec(
      'BEGIN; CREATE TABLE pois (id TEXT PRIMARY KEY, name TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, address TEXT NOT NULL, notes TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL) STRICT; CREATE INDEX pois_location ON pois(lat,lon); PRAGMA user_version=1; COMMIT;',
    );
  const get = (id) => db.prepare('SELECT * FROM pois WHERE id=?').get(id);
  const list = (bbox) =>
    bbox
      ? db
          .prepare(
            'SELECT * FROM pois WHERE lon BETWEEN ? AND ? AND lat BETWEEN ? AND ? ORDER BY name LIMIT 10001',
          )
          .all(bbox[0], bbox[2], bbox[1], bbox[3])
      : db.prepare('SELECT * FROM pois ORDER BY name LIMIT 10001').all();
  const insert = (row) =>
    db
      .prepare('INSERT INTO pois VALUES (?,?,?,?,?,?,?,?)')
      .run(
        row.id,
        row.name,
        row.lat,
        row.lon,
        row.address,
        row.notes,
        row.createdAt,
        row.updatedAt,
      );
  const snapshot = () => ({ version: 1, exportedAt: now(), pois: list() });
  const budget = (rows) => {
    if (Buffer.byteLength(JSON.stringify(rows)) > 12000000)
      fail(
        'POI-lagringen har nått 12 MB. Säkerhetskopiera och minska anteckningarna.',
        409,
      );
  };
  return {
    get,
    list,
    snapshot,
    create(value) {
      const clean = validatePoi(value);
      if (list().length >= 10000) fail('Högst 10 000 egna platser stöds.', 409);
      const time = now(),
        row = { ...clean, id: randomUUID(), createdAt: time, updatedAt: time };
      budget([...list(), row]);
      insert(row);
      return row;
    },
    update(id, value) {
      const clean = validatePoi(value);
      const old = get(id);
      if (!old) fail('Platsen finns inte längre.', 404);
      if (value.updatedAt !== old.updatedAt)
        fail('Platsen har ändrats i en annan vy. Öppna den igen.', 409);
      const time = new Date(
        Math.max(Date.parse(now()), Date.parse(old.updatedAt) + 1),
      ).toISOString();
      budget(
        list().map((row) =>
          row.id === id ? { ...old, ...clean, updatedAt: time } : row,
        ),
      );
      db.prepare(
        'UPDATE pois SET name=?,lat=?,lon=?,address=?,notes=?,updatedAt=? WHERE id=?',
      ).run(
        clean.name,
        clean.lat,
        clean.lon,
        clean.address,
        clean.notes,
        time,
        id,
      );
      return get(id);
    },
    remove(id) {
      if (!get(id)) fail('Platsen finns inte längre.', 404);
      db.prepare('DELETE FROM pois WHERE id=?').run(id);
    },
    restore(payload) {
      if (
        payload?.version !== 1 ||
        !Array.isArray(payload.pois) ||
        payload.pois.length > 10000
      )
        fail('Ogiltig säkerhetskopia.');
      const ids = new Set();
      const rows = payload.pois.map((row) => {
        const clean = validatePoi(row);
        if (
          !idValid(row.id) ||
          ids.has(row.id) ||
          !Number.isFinite(Date.parse(row.createdAt)) ||
          !Number.isFinite(Date.parse(row.updatedAt))
        )
          fail('Ogiltig säkerhetskopia.');
        ids.add(row.id);
        return {
          ...clean,
          id: row.id,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      });
      budget(rows);
      if (path !== ':memory:') {
        const backupDir = join(dirname(path), 'backups');
        mkdirSync(backupDir, { recursive: true });
        writeFileSync(
          join(backupDir, 'before-restore-' + randomUUID() + '.json'),
          JSON.stringify(snapshot()),
          { flag: 'wx' },
        );
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec('DELETE FROM pois');
        for (const row of rows) insert(row);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return rows.length;
    },
    close: () => db.close(),
  };
}
export function poiPlugin({
  path = () =>
    process.env.ODINS_POI_DB ||
    join(
      process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'),
      'ODINS_EYE',
      'data',
      'pois.sqlite',
    ),
} = {}) {
  let store;
  let reverseBusy = false,
    lastReverse = 0;
  const reverseCache = new Map();
  const install = (server) => {
    server.middlewares.use('/api/pois', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      if (admitSameSite(req, res)) return;
      try {
        const url = new URL(req.url, 'http://localhost');
        const route = url.pathname.replace(/^\//, '');
        if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method))
          fail('Metoden stöds inte.', 405);
        let body;
        if (req.method === 'POST' || req.method === 'PUT') {
          if (
            !/^application\/json(?:;|$)/i.test(
              req.headers['content-type'] || '',
            )
          )
            fail('Använd JSON.', 415);
          const chunks = [];
          let bytes = 0;
          for await (const chunk of req) {
            bytes += chunk.length;
            if (bytes > 16000000) fail('För stor säkerhetskopia.', 413);
            chunks.push(chunk);
          }
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            fail('Ogiltig JSON.');
          }
        }
        store ||= openPoiStore(path());
        let result;
        if (route === 'reverse' && req.method === 'GET') {
          const lat = Number(url.searchParams.get('lat')),
            lon = Number(url.searchParams.get('lon'));
          if (
            !url.searchParams.get('lat') ||
            !url.searchParams.get('lon') ||
            !Number.isFinite(lat) ||
            !Number.isFinite(lon) ||
            Math.abs(lat) > 90 ||
            Math.abs(lon) > 180
          )
            fail('Ogiltiga koordinater.');
          const key = lat.toFixed(6) + ':' + lon.toFixed(6),
            hit = reverseCache.get(key);
          if (hit && Date.now() - hit.at < 86400000) result = hit.value;
          else {
            if (reverseBusy || Date.now() - lastReverse < 1100)
              fail('Vänta innan nästa adressuppslag.', 429);
            reverseBusy = true;
            lastReverse = Date.now();
            try {
              const endpoint = new URL(
                'reverse',
                (
                  process.env.ODINS_PHOTON_URL || 'https://photon.komoot.io/'
                ).replace(/\/?$/, '/'),
              );
              endpoint.search = new URLSearchParams({
                lat,
                lon,
                limit: 1,
                radius: 0.2,
              }).toString();
              const response = await fetch(endpoint, {
                headers: { 'User-Agent': 'ODINS-EYE-local-POI/1.0' },
                signal: AbortSignal.timeout(10000),
              });
              if (!response.ok) throw Error();
              const d = JSON.parse(
                await readResponseTextCapped(response, 256000),
              );
              const p = d.features?.[0]?.properties;
              result = {
                address: p
                  ? [
                      p.street || p.name,
                      p.housenumber,
                      p.postcode,
                      p.city || p.district,
                      p.country,
                    ]
                      .filter((v) => typeof v === 'string')
                      .join(', ')
                      .slice(0, 500)
                  : '',
                source: 'Photon / OpenStreetMap',
                note: 'Närliggande adressförslag; kontrollera själv. Det är inte en verifierad entré.',
              };
              reverseCache.set(key, { at: Date.now(), value: result });
              while (reverseCache.size > 128)
                reverseCache.delete(reverseCache.keys().next().value);
            } catch {
              fail('Adressen kunde inte hämtas. Ange den manuellt.', 503);
            } finally {
              reverseBusy = false;
            }
          }
        } else if (route === 'backup' && req.method === 'GET')
          result = store.snapshot();
        else if (route === 'restore' && req.method === 'POST') {
          if (body?.confirm !== 'REPLACE') fail('Bekräfta återställningen.');
          result = { restored: store.restore(body.backup) };
        } else if (!route && req.method === 'GET') {
          let bbox;
          if (url.searchParams.has('bbox')) {
            if (
              url.searchParams
                .get('bbox')
                .split(',')
                .some((value) => !value.trim())
            )
              fail('Ogiltigt kartområde.');
            bbox = url.searchParams.get('bbox').split(',').map(Number);
            if (
              bbox.length !== 4 ||
              !bbox.every(Number.isFinite) ||
              bbox[0] < -180 ||
              bbox[2] > 180 ||
              bbox[1] < -90 ||
              bbox[3] > 90 ||
              bbox[0] > bbox[2] ||
              bbox[1] > bbox[3]
            )
              fail('Ogiltigt kartområde.');
          }
          result = { pois: store.list(bbox) };
        } else if (!route && req.method === 'POST') {
          result = store.create(body);
          res.statusCode = 201;
        } else if (idValid(route)) {
          if (req.method === 'GET') {
            result = store.get(route);
            if (!result) fail('Platsen finns inte.', 404);
          } else if (req.method === 'PUT') result = store.update(route, body);
          else if (req.method === 'DELETE') {
            store.remove(route);
            result = { deleted: true };
          } else fail('Metoden stöds inte.', 405);
        } else fail('Okänd POI-adress.', 404);
        res.end(JSON.stringify(result));
      } catch (error) {
        res.statusCode = error.status || 503;
        res.end(
          JSON.stringify({
            error: error.status
              ? error.message
              : 'Platsdatabasen kunde inte användas. Inga ändringar bekräftas.',
          }),
        );
      }
    });
    server.httpServer?.once('close', () => {
      store?.close();
      store = undefined;
    });
  };
  return {
    name: 'local-persistent-pois',
    configureServer: install,
    configurePreviewServer: install,
  };
}
