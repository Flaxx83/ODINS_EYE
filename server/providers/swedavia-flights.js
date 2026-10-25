const day = (date) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(
    date,
  );
const clock = (value) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })
    : 'Uppgift saknas';
const clean = (value) => (typeof value === 'string' ? value.slice(0, 140) : '');
const flightNumber = (value) =>
  String(value || '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(
      /^([A-Z]{2})0*(\d+)([A-Z]?)$/,
      (_, prefix, number, suffix) => prefix + Number(number) + suffix,
    );

export function parseFlightDate(message, now = new Date()) {
  const today = day(now);
  const dates = [];
  const midnight = Date.parse(today + 'T12:00:00Z');
  const add = (value) => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value + 'T12:00:00Z')) ||
      new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value
    )
      throw Error('Ogiltigt datum. Ange ÅÅÅÅ-MM-DD.');
    dates.push(value);
  };
  try {
    for (const match of message.matchAll(/\b\d{4}-\d{1,2}-\d{1,2}\b/g))
      add(match[0]);
    for (const match of message.matchAll(
      /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g,
    ))
      add(
        `${match[3] || today.slice(0, 4)}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`,
      );
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
    for (const match of message.matchAll(
      new RegExp(
        `\\b(\\d{1,2})\\s+(${months.join('|')})(?:\\s+(\\d{4}))?\\b`,
        'gi',
      ),
    ))
      add(
        `${match[3] || today.slice(0, 4)}-${String(months.indexOf(match[2].toLowerCase()) + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`,
      );
    for (const match of message.matchAll(
      /\bi\s*(dag|morgon|övermorgon|går)\b/gi,
    )) {
      const offset = { dag: 0, morgon: 1, övermorgon: 2, går: -1 }[
        match[1].toLowerCase()
      ];
      add(new Date(midnight + offset * 86400000).toISOString().slice(0, 10));
    }
    if (
      /nästa vecka|helgen|måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag/i.test(
        message,
      )
    )
      throw Error('Ange ett exakt datum för flyget, till exempel ÅÅÅÅ-MM-DD.');
    if (new Set(dates).size > 1)
      throw Error('Frågan innehåller flera datum. Ange ett datum för flyget.');
    const date = dates[0] || today;
    const difference = (Date.parse(date + 'T12:00:00Z') - midnight) / 86400000;
    if (difference < -7 || difference > 90)
      throw Error(
        'Välj ett datum från 7 dagar tillbaka till 90 dagar framåt. Datatäckningen kan vara kortare.',
      );
    return { date };
  } catch (error) {
    return { error: error.message };
  }
}

export function createSwedaviaFlights({
  fetchImpl = fetch,
  key = () => process.env.SWEDAVIA_FLIGHTINFO_KEY,
  now = () => new Date(),
} = {}) {
  const cache = new Map();
  return async function lookup(
    query,
    { direction: requestedDirection, airport, date } = {},
  ) {
    if (!key() || !/^[A-Z]{2,3}\d[A-Z0-9]{0,5}$/.test(query)) return null;
    if (
      requestedDirection &&
      !['arrival', 'departure'].includes(requestedDirection)
    )
      throw Error('Invalid flight direction');
    if (airport && !['ARN', 'GOT'].includes(airport))
      throw Error('Invalid airport');
    const commercial = /^[A-Z]{2}\d{1,4}[A-Z]?$/.test(query);
    const number = commercial ? query.match(/^([A-Z]{2})(\d+)([A-Z]?)$/) : null;
    const aliases = number
      ? [
          ...new Set([
            query,
            ...[1, 3, 4].map(
              (width) =>
                number[1] +
                String(Number(number[2])).padStart(width, '0') +
                number[3],
            ),
          ]),
        ]
      : [];
    const parsedDate = parseFlightDate(date || '', now());
    if (parsedDate.error)
      return {
        answer: parsedDate.error,
        needsClarification: true,
        flightResults: [],
      };
    const today = parsedDate.date;
    const cacheKey = JSON.stringify([
      today,
      query,
      requestedDirection,
      airport,
    ]);
    const old = cache.get(cacheKey);
    if (old && Date.now() - old.at < 60000) return old.value;
    const previous = new Date(today + 'T12:00:00Z');
    previous.setUTCDate(previous.getUTCDate() - 1);
    const stamp = (d) => d.replaceAll('-', '').slice(2);
    const url = new URL('https://api.swedavia.se/flightinfo/v2/query');
    url.searchParams.set(
      'filter',
      `(scheduled eq '${stamp(today)}' or scheduled eq '${stamp(previous.toISOString().slice(0, 10))}')` +
        (commercial
          ? ` and (${aliases.map((value) => `flightId eq '${value}'`).join(' or ')})`
          : '') +
        (requestedDirection
          ? ` and flightType eq '${requestedDirection === 'arrival' ? 'A' : 'D'}'`
          : '') +
        (airport ? ` and airport eq '${airport}'` : ''),
    );
    url.searchParams.set('count', '1000');
    let payload;
    try {
      const flights = [];
      const tokens = new Set();
      const deadline = Date.now() + 30000;
      for (let page = 0; page < 5; page++) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw Error('timeout');
        const response = await fetchImpl(url, {
          headers: {
            Accept: 'application/json',
            'Ocp-Apim-Subscription-Key': key(),
          },
          signal: AbortSignal.timeout(Math.min(12000, remaining)),
        });
        if (!response.ok) throw Error('upstream');
        payload = await response.json();
        if (!Array.isArray(payload.flights) || payload.flights.length > 1000)
          throw Error('incomplete');
        flights.push(...payload.flights);
        if (payload.flights.length < 1000) break;
        const token = payload.continuationtoken;
        if (
          page === 4 ||
          typeof token !== 'string' ||
          !token ||
          token.length > 32000 ||
          tokens.has(token)
        )
          throw Error('incomplete');
        tokens.add(token);
        url.searchParams.set('continuationtoken', token);
      }
      payload = { flights };
    } catch {
      return {
        answer:
          'Swedavias avgångsinformation kunde inte hämtas. Försök igen senare.',
        flightResults: [],
      };
    }
    const rows = [];
    for (const entry of payload.flights)
      for (const direction of ['departure', 'arrival']) {
        const f = entry[direction];
        if (!f || (requestedDirection && direction !== requestedDirection))
          continue;
        const times = f[direction + 'Time'];
        if (
          !times?.scheduledUtc ||
          !Number.isFinite(Date.parse(times.scheduledUtc)) ||
          day(new Date(times.scheduledUtc)) !== today
        )
          continue;
        const id = f.flightLegIdentifier || {};
        if (
          flightNumber(f.flightId) !== flightNumber(query) &&
          !f.codeShareData?.some(
            (value) => flightNumber(value) === flightNumber(query),
          ) &&
          clean(id.callsign).replace(/\s+/g, '').toUpperCase() !== query
        )
          continue;
        if (
          airport &&
          id[
            direction === 'arrival'
              ? 'arrivalAirportIata'
              : 'departureAirportIata'
          ] !== airport
        )
          continue;
        const route =
          clean(id.departureAirportIata) + ' → ' + clean(id.arrivalAirportIata);
        const cancelled = f.locationAndStatus?.flightLegStatus === 'CAN';
        const status = cancelled
          ? 'Inställt'
          : clean(f.locationAndStatus?.flightLegStatusSwedish) ||
            'Uppgift saknas';
        const label = `${clean(f.flightId)} · ${route} · ${direction === 'departure' ? 'Avgång' : 'Ankomst'} · ${clock(times.scheduledUtc)}`;
        rows.push({
          label,
          cancelled,
          mapEligible: !cancelled && today === day(now()),
          callsign: /^[A-Z0-9]{2,10}$/i.test(id.callsign || '')
            ? id.callsign.toUpperCase()
            : null,
          text: `${label}\nPlanerad: ${clock(times.scheduledUtc)}\nBeräknad: ${cancelled ? 'Ej aktuell – flyget är inställt' : clock(times.estimatedUtc)}\nFaktisk: ${clock(times.actualUtc)}\nStatus: ${status} · Gate: ${clean(f.locationAndStatus?.gate) || 'Uppgift saknas'}`,
        });
      }
    const uniqueRows = [
      ...new Map(rows.map((row) => [row.label, row])).values(),
    ];
    const value = {
      answer: uniqueRows.length
        ? `Swedavia: ${query}, ${today}. Tider visas i svensk tid.\n\n` +
          (uniqueRows.length === 1
            ? uniqueRows[0].text
            : `${uniqueRows.length} träffar. Välj en avgång eller ankomst i listan för att visa uppgifterna.`)
        : `Ingen avgång eller ankomst för ${query} hittades hos Swedavia ${today}. Sökningen gäller deras flygplatser och det valda datumet, inte hela flygbolagets nät.`,
      flightResults: uniqueRows,
      sources: [
        {
          name: 'Swedavia FlightInfo',
          url: 'https://www.swedavia.se/',
          time: new Date().toISOString(),
        },
      ],
    };
    cache.set(cacheKey, { at: Date.now(), value });
    if (cache.size > 64) cache.delete(cache.keys().next().value);
    return value;
  };
}
export const lookupSwedaviaFlight = createSwedaviaFlights();
