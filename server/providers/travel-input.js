import { token } from './vasttrafik.js';
import { stockholmTime } from './trafikverket/train-status.js';
export function normalizeTravelMessage(message) {
  return message
    .normalize('NFC')
    .replace(/[\u00ad\u200b\ufeff]/g, '')
    .replace(/(\p{L})-[ \t]*\r?\n[ \t]*(?=\p{L})/gu, '$1-')
    .replace(/\s+/gu, ' ')
    .trim();
}
export class TravelInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TravelInputError';
  }
}
const months = [
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
];
const weekdays = [
  'söndag',
  'måndag',
  'tisdag',
  'onsdag',
  'torsdag',
  'fredag',
  'lördag',
];
const words = [
  'tolv',
  'ett',
  'två',
  'tre',
  'fyra',
  'fem',
  'sex',
  'sju',
  'åtta',
  'nio',
  'tio',
  'elva',
];
const isoDay = (value) => new Date(value).toISOString().slice(0, 10);
export function parseTravelTime(message, now = new Date()) {
  message = normalizeTravelMessage(message);
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    dateStyle: 'short',
  }).format(now);
  const midnight = Date.parse(today + 'T00:00:00Z');
  const dates = [],
    spans = [];
  const add = (value, match) => {
    dates.push(value);
    spans.push([match.index, match.index + match[0].length]);
  };
  const validDate = (y, m, d) => {
    const value =
      String(y).padStart(4, '0') +
      '-' +
      String(m).padStart(2, '0') +
      '-' +
      String(d).padStart(2, '0');
    const instant = Date.parse(value + 'T00:00:00Z');
    if (!Number.isFinite(instant) || isoDay(instant) !== value)
      throw new TravelInputError(
        'Ogiltigt datum. Ange ett giltigt kalenderdatum som 2026-10-13.',
      );
    return value;
  };
  for (const m of message.matchAll(/\b(?:den\s+)?(\d{4})-(\d{2})-(\d{2})\b/g))
    add(validDate(+m[1], +m[2], +m[3]), m);
  for (const m of message.matchAll(
    /\b(?:den\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g,
  ))
    add(validDate(+(m[3] || today.slice(0, 4)), +m[2], +m[1]), m);
  const monthPattern = new RegExp(
    '\\b(?:den\\s+)?(\\d{1,2})\\s+(' +
      months.join('|') +
      ')(?:\\s+(\\d{4}))?\\b',
    'gi',
  );
  for (const m of message.matchAll(monthPattern))
    add(
      validDate(
        +(m[3] || today.slice(0, 4)),
        months.indexOf(m[2].toLocaleLowerCase('sv')) + 1,
        +m[1],
      ),
      m,
    );
  for (const m of message.matchAll(
    /\b(?:i\s*morgon|i\s*dag|i\s*övermorgon|i\s*går)\b/gi,
  )) {
    const key = m[0].replace(/\s/g, '').toLowerCase();
    const offset =
      key === 'imorgon'
        ? 1
        : key === 'iövermorgon'
          ? 2
          : key === 'igår'
            ? -1
            : 0;
    add(isoDay(midnight + offset * 86400000), m);
  }
  const weekdayPattern = new RegExp(
    '\\b(?:(nästa|på)\\s+)?(' + weekdays.join('|') + ')\\b',
    'gi',
  );
  for (const m of message.matchAll(weekdayPattern)) {
    const target = weekdays.indexOf(m[2].toLowerCase()),
      current = new Date(midnight).getUTCDay();
    const offset =
      m[1]?.toLowerCase() === 'nästa'
        ? 7 - ((current + 6) % 7) + ((target + 6) % 7)
        : (target - current + 7) % 7;
    add(isoDay(midnight + offset * 86400000), m);
  }
  if (/\b\d{4}-\d{1,2}-\d{1,2}\b/.test(message) && !dates.length)
    throw new TravelInputError('Skriv datum som ÅÅÅÅ-MM-DD.');
  if (/\b(?:nästa vecka|i helgen|nästa helg)\b/i.test(message))
    throw new TravelInputError('Ange ett exakt datum för resan.');
  if (new Set(dates).size > 1)
    throw new TravelInputError(
      'Frågan innehåller olika datum. Ange ett datum för resan.',
    );
  const date = dates[0] || today;
  const arrival =
    /ankomst(?:tid)?|anlända|(?:vara|komma)\s+(?:framme|fram|där)|framme\s+(?:kl|klockan|vid|senast)|senast\s+(?:kl\.?|klockan|vid|\d)/i.test(
      message,
    );
  if (
    arrival &&
    /avgång(?:stid)?|avresa|åka\s+(?:kl\.?|klockan|vid)/i.test(message)
  )
    throw new TravelInputError(
      'Ange antingen avgångstid eller ankomsttid i samma sökning.',
    );
  const clockPattern =
    /(?:(?:kl\.?|klockan|vid|senast)\s*(\d{1,2})(?:[:.](\d{2}))?(?:\s*-?\s*tiden)?|\b(\d{1,2}):(\d{2}))(?=\s|[.!?]|$)/gi;
  for (const match of message.matchAll(
    /(?:kl\.?|klockan|vid|senast)\s*(\d[\d:.]*(?:-\d+)?)/gi,
  )) {
    const value = match[1].replace(/\.$/, '');
    if (!/^\d{1,2}(?:[:.]\d{2})?$/.test(value))
      throw new TravelInputError('Tiden kunde inte tolkas. Ange HH:MM.');
  }
  const times = [];
  for (const m of message.matchAll(clockPattern)) {
    const h = +(m[1] ?? m[3]),
      minute = +(m[2] ?? m[4] ?? 0);
    if (h > 23 || minute > 59)
      throw new TravelInputError(
        'Ogiltig tid. Ange en tid mellan 00:00 och 23:59.',
      );
    const evening = /på eftermiddagen|på kvällen/i.test(message),
      morning = /på morgonen|på förmiddagen/i.test(message);
    if (evening && morning)
      throw new TravelInputError('Ange ett entydigt klockslag.');
    if ((evening || morning) && h > 12)
      throw new TravelInputError(
        'Ange tiden som HH:MM utan motstridiga delar av dygnet.',
      );
    times.push({ h: evening ? (h % 12) + 12 : h, minute });
    spans.push([m.index, m.index + m[0].length]);
  }
  const swedishClock = new RegExp(
    '\\b(halv|kvart över|kvart i)\\s+(' + words.join('|') + '|\\d{1,2})\\b',
    'gi',
  );
  for (const m of message.matchAll(swedishClock)) {
    let h = /^\d+$/.test(m[2])
      ? +m[2]
      : words.indexOf(m[2].toLowerCase()) || 12;
    if (h < 1 || h > 12) throw new TravelInputError('Ange tiden som HH:MM.');
    const minute =
      m[1].toLowerCase() === 'kvart över'
        ? 15
        : m[1].toLowerCase() === 'halv'
          ? 30
          : 45;
    if (minute !== 15) h = (h + 11) % 12;
    if (
      !/på morgonen|på förmiddagen|på eftermiddagen|på kvällen/i.test(message)
    )
      throw new TravelInputError(
        'Ange morgon eller kväll, eller skriv tiden som HH:MM.',
      );
    if (/på eftermiddagen|på kvällen/i.test(message)) h = (h % 12) + 12;
    times.push({ h, minute });
    spans.push([m.index, m.index + m[0].length]);
  }
  if (new Set(times.map((t) => t.h + ':' + t.minute)).size > 1)
    throw new TravelInputError(
      'Frågan innehåller flera tider. Ange en avgångstid eller ankomsttid.',
    );
  if (!times.length && /(?:kl\.?|klockan|vid)\s*\d|\b\d{1,2}:\d/i.test(message))
    throw new TravelInputError(
      'Tiden kunde inte tolkas. Skriv exempelvis vid 07:00 eller vid 07 tiden.',
    );
  if (
    /(?:kl\.?|klockan|vid)\s*\d{1,2}[:-]\d(?!\d)|(?:kl\.?|klockan|vid)\s*\d{1,2}-\d/i.test(
      message,
    )
  )
    throw new TravelInputError('Tiden kunde inte tolkas. Ange HH:MM.');
  const time = times.length
    ? String(times[0].h).padStart(2, '0') +
      ':' +
      String(times[0].minute).padStart(2, '0')
    : undefined;
  if ((dates.length || arrival) && !time)
    throw new TravelInputError(
      'Ange också klockslag och om det gäller avgång eller ankomst.',
    );
  if (date < today)
    throw new TravelInputError(
      'Datumet ligger i det förflutna. Ange ett framtida datum.',
    );
  const instant = time ? stockholmTime(date, time) : now.toISOString();
  if (time && !instant)
    throw new TravelInputError(
      'Tiden finns inte eller är tvetydig vid byte mellan sommar- och vintertid. Välj ett annat klockslag.',
    );
  if (time && Date.parse(instant) < now.getTime())
    throw new TravelInputError(
      'Tiden har redan passerat. Ange ett framtida datum och klockslag.',
    );
  let clean = message;
  for (const [a, b] of spans.sort((a, b) => b[0] - a[0]))
    clean = clean.slice(0, a) + ' ' + clean.slice(b);
  clean = clean
    .replace(
      /\b(?:och jag vill|jag vill|för att|och)?\s*(?:vara|komma)\s+(?:framme|fram|där)\b|\b(?:ankomst(?:tid)?|anlända|senast|avgång(?:stid)?|avresa)\b|\bpå (?:morgonen|förmiddagen|eftermiddagen|kvällen)\b/gi,
      ' ',
    )
    .replace(/[.!?]\s*(?:Jag vill (?:åka|resa))?\s*[.!?]*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[.!?\s]+$/, '')
    .trim();
  return {
    date,
    time,
    clean,
    mode: arrival ? 'arrival' : 'departure',
    instant,
  };
}
export function journeyTimeLabel(travel) {
  return (
    (travel.mode === 'arrival' ? 'ankomst senast ' : 'avgång ') +
    travel.date +
    (travel.time ? ' kl ' + travel.time : ' från aktuell tid') +
    ' (svensk tid)'
  );
}
export function applyJourneyTime(query, travel, provider) {
  if (provider === 'resrobot') {
    query.set('date', travel.date);
    if (travel.time) query.set('time', travel.time);
    query.set('searchForArrival', travel.mode === 'arrival' ? '1' : '0');
  } else {
    query.set('dateTime', travel.instant);
    query.set('dateTimeRelatesTo', travel.mode);
  }
  return query;
}
export async function addressCandidates(
  query,
  { fetchImpl = fetch, getToken = token } = {},
) {
  if (!/\d/.test(query)) return null;
  const q = query.replace(/\s+i\s+/i, ', ');
  const r = await fetchImpl(
    'https://ext-api.vasttrafik.se/pr/v4/locations/by-text?' +
      new URLSearchParams({ q, limit: '15', types: 'address' }),
    {
      headers: { Authorization: 'Bearer ' + (await getToken()) },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!r.ok) throw Error('Adressökning misslyckades');
  const data = await r.json();
  const city = q.split(',').at(-1).trim().toLocaleLowerCase('sv');
  const street = q.split(',')[0].trim().toLocaleLowerCase('sv');
  return (data.results || [])
    .filter(
      (x) =>
        x.locationType === 'address' &&
        x.name.toLocaleLowerCase('sv').includes(city) &&
        x.name
          .toLocaleLowerCase('sv')
          .replace(/(\d)\s+([a-z])\b/g, '$1$2')
          .split(',')[0]
          .trim() === street.replace(/(\d)\s+([a-z])\b/g, '$1$2') &&
        Number.isFinite(x.latitude) &&
        Number.isFinite(x.longitude),
    )
    .map((x) => ({
      name: x.name,
      id: 'coord:' + x.latitude + ':' + x.longitude,
      gid: 'coord:' + x.latitude + ':' + x.longitude,
      lat: x.latitude,
      lon: x.longitude,
    }));
}

export function choiceMessage(message, travel) {
  return travel.time
    ? travel.clean +
        ' ' +
        travel.date +
        ' ' +
        (travel.mode === 'arrival' ? 'ankomst' : 'avgång') +
        ' kl ' +
        travel.time
    : message;
}

export function needsTravelRoute(message) {
  if (/från.+till/i.test(message)) return false;
  return (
    /^(?:(?:Sverige|SL):\s*)?(?:(?:och|men)\s+)?(?:imorgon|i morgon|idag|i dag|den\s+\d|\d{4}-\d{2}-\d{2}|(?:kl\.?|klockan|vid)\s*\d|samma resa|(?:istället|i stället)\s+(?:kl|imorgon)|ankomst|vara framme|senast\s*\d)/i.test(
      message,
    ) ||
    /\b(?:jag vill|kan jag|kan vi)\s+(?:åka|resa)\b|\b(?:vara|komma)\s+(?:framme|fram)\b/i.test(
      message,
    )
  );
}

export function placeMatches(query, name) {
  const norm = (value) =>
    value
      .toLocaleLowerCase('sv')
      .normalize('NFC')
      .replace(/(\d)\s+([a-z])\b/g, '$1$2')
      .replace(/\s+i\s+/g, ' ')
      .replace(/[(),]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const haystack = norm(name);
  return norm(query)
    .split(' ')
    .every((part) =>
      /\d/.test(part)
        ? haystack.split(/[^\p{L}\p{N}]+/u).includes(part)
        : haystack.includes(part),
    );
}
