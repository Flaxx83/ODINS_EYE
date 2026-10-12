import {
  enrichTrainTrips,
  trainStatusText,
} from './trafikverket/train-status.js';
import { resolveRailNetwork } from './rail-network-geometry.js';
import { resolveSjGeometry } from './sj-trip-geometry.js';
import { resolveWalking } from './walking-geometry.js';
import { resolveNationalVasttrafik } from './national-vt-geometry.js';
import { resolveSlGeometry } from './sl-trip-geometry.js';
import { resRobotMapTrips } from './trip-map.js';
import {
  parseTravelTime,
  addressCandidates,
  applyJourneyTime,
  journeyTimeLabel,
  choiceMessage,
} from './travel-input.js';
const cache = new Map();
export async function swedenStops(base) {
  let e = cache.get(base);
  if (!e || Date.now() - e.at > 86400000) {
    const r = await fetch(base + '/api/timetable/stops');
    if (!r.ok) throw Error('Hållplatsregistret kunde inte hämtas');
    const d = await r.json();
    e = {
      at: Date.now(),
      rows: d.stop_groups
        .filter((g) => g.area_type !== 'META_STOP')
        .map((g) => ({
          ...g,
          ...g.stops?.find(
            (s) => Number.isFinite(s.lat) && Number.isFinite(s.lon),
          ),
          id: g.id,
          name: g.name,
        }))
        .filter((g) => Number.isFinite(g.lat)),
    };
    cache.set(base, e);
  }
  return e.rows;
}
export async function planSlTrip(
  message,
  choice,
  base,
  national = false,
  { getStops = swedenStops, fetchImpl = fetch, now = () => new Date() } = {},
) {
  const travel = parseTravelTime(message, now());
  const m = travel.clean.match(/från\s+(.+?)\s+till\s+(.+?)[.!?]*$/i);
  if (!m)
    return {
      answer:
        'För SL-resor: skriv exempelvis Jag vill resa från Slussen till Stockholm Centralstation. Ange kommun vid behov.',
    };
  const from = m[1].trim(),
    to = m[2].replace(/\s+(?:med buss|nu).*$/i, '').trim();
  const stops = (await getStops(base)).filter(
    (g) =>
      national || (g.lat > 58.7 && g.lat < 60.5 && g.lon > 17 && g.lon < 19.8),
  );
  const nameKey = (value) =>
    value
      .toLocaleLowerCase('sv')
      .replace(/\s+i\s+/g, ' ')
      .replace(/[(),]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const find = (q) =>
    stops
      .filter((s) =>
        nameKey(q)
          .split(' ')
          .every((part) => nameKey(s.name).includes(part)),
      )
      .slice(0, 20)
      .map((s) => ({ ...s, gid: s.id }));
  let origins = await addressCandidates(from),
    destinations = await addressCandidates(to);
  origins ??= find(from);
  destinations ??= find(to);
  if (!destinations.length) destinations = find(to.replace(/\s+centrum$/i, ''));
  if (!origins.length || !destinations.length)
    return {
      answer:
        'Ingen hållplats hittades i valt sökområde. Prova namnet från hållplatsregistret.',
    };
  const pick = (rows, id) =>
      id ? rows.find((s) => s.id === id) : rows.length === 1 ? rows[0] : null,
    o = pick(origins, choice?.origin),
    d = pick(destinations, choice?.destination);
  if (!o || !d)
    return {
      answer: 'Välj exakta adresser eller hållplatser för resan.',
      tripChoices: {
        origins,
        destinations,
        message: choiceMessage(message, travel),
      },
    };
  const key = process.env.RESROBOT_API_KEY;
  if (!key) throw Error('ResRobot-nyckeln saknas');
  const q = new URLSearchParams({
    format: 'json',
    accessId: key,
    date: travel.date,
    passlist: 'true',
    showPassingPoints: 'true',
  });
  applyJourneyTime(q, travel, 'resrobot');
  for (const [prefix, location] of [
    ['origin', o],
    ['dest', d],
  ]) {
    if (location.id.startsWith('coord:')) {
      q.set(prefix + 'CoordLat', String(location.lat));
      q.set(prefix + 'CoordLong', String(location.lon));
    } else q.set(prefix + 'Id', location.id);
  }
  const r = await fetchImpl('https://api.resrobot.se/v2.1/trip?' + q, {
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw Error('Reseplaneraren kunde inte hämtas');
  const data = await r.json();
  if (data.errorCode) throw Error('Reseplaneraren hittade inga förslag');
  const legs = (j) => j.LegList?.Leg || [];
  const trips = (data.Trip || [])
    .filter(
      (j) =>
        national ||
        legs(j).every(
          (l) =>
            l.type === 'WALK' ||
            (l.Product || []).some((p) =>
              /Storstockholm|\bSL\b/i.test(p.operatorInfo?.name || ''),
            ),
        ),
    )
    .filter(
      (j) =>
        !/buss/i.test(message) ||
        legs(j).every(
          (l) =>
            l.type === 'WALK' ||
            (l.Product || []).some((p) => /buss/i.test(p.name || '')),
        ),
    )
    .slice(0, 3);
  const trainStatus = await enrichTrainTrips(trips);
  const lines = [
    `${national ? 'Sverigeresa' : 'SL-resa'} från ${o.name} till ${d.name}, ${journeyTimeLabel(travel)}. ResRobot-underlag.`,
  ];
  if (!trips.length)
    lines.push('Inga förslag med valt operatörsurval och färdsätt hittades.');
  for (const [i, j] of trips.entries()) {
    lines.push('\nFörslag ' + (i + 1));
    for (const train of trainStatus.trips[i] || [])
      lines.push(trainStatusText(train));
    for (const l of legs(j))
      lines.push(
        `${l.type === 'WALK' ? 'Gång' : (l.Product?.[0]?.name || 'Kollektivtrafik') + (l.Product?.[0]?.operatorInfo?.name ? ' · ' + l.Product[0].operatorInfo.name.trim() : '')}: ${l.Origin.name} → ${l.Destination.name}, ${l.Origin.rtDate || l.Origin.date} ${(l.Origin.rtTime || l.Origin.time).slice(0, 5)}–${l.Destination.rtDate || l.Destination.date} ${(l.Destination.rtTime || l.Destination.time).slice(0, 5)}${l.cancelled ? ' · INSTÄLLD' : ''}`,
      );
  }
  return {
    trainStatus: trainStatus.trips,
    mapTrips: await resolveWalking(
      await resolveRailNetwork(
        trips,
        await resolveSjGeometry(
          trips,
          await resolveNationalVasttrafik(
            trips,
            await resolveSlGeometry(trips, resRobotMapTrips(trips)),
          ),
        ),
      ),
    ),
    answer:
      lines.join('\n') +
      '\nPrognostid när sådan finns, annars tidtabell. Kontrollera avgångsstatus separat.',
    sources: [
      ...trainStatus.sources,
      {
        name: national
          ? 'Trafiklab ResRobot · hela Sverige'
          : 'Trafiklab ResRobot · SL-resor',
        url: 'https://www.trafiklab.se/api/our-apis/resrobot-v21/',
        time: new Date().toISOString(),
      },
    ],
  };
}
