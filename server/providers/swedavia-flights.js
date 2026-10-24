const day = (date) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(
    date,
  );
const clock = (value) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })
    : 'Uppgift saknas';
const clean = (value) => (typeof value === 'string' ? value.slice(0, 140) : '');

export function createSwedaviaFlights({
  fetchImpl = fetch,
  key = () => process.env.SWEDAVIA_FLIGHTINFO_KEY,
  now = () => new Date(),
} = {}) {
  const cache = new Map();
  return async function lookup(query) {
    if (!key() || !/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(query)) return null;
    const today = day(now());
    const cacheKey = today + query;
    const old = cache.get(cacheKey);
    if (old && Date.now() - old.at < 60000) return old.value;
    const previous = new Date(today + 'T12:00:00Z');
    previous.setUTCDate(previous.getUTCDate() - 1);
    const stamp = (d) => d.replaceAll('-', '').slice(2);
    const url = new URL('https://api.swedavia.se/flightinfo/v2/query');
    url.searchParams.set(
      'filter',
      `(scheduled eq '${stamp(today)}' or scheduled eq '${stamp(previous.toISOString().slice(0, 10))}') and flightId eq '${query}'`,
    );
    url.searchParams.set('count', '1000');
    let payload;
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'Ocp-Apim-Subscription-Key': key(),
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw Error('upstream');
      payload = await response.json();
      if (!Array.isArray(payload.flights) || payload.flights.length >= 1000)
        throw Error('incomplete');
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
        if (!f) continue;
        const times = f[direction + 'Time'];
        if (
          !times?.scheduledUtc ||
          !Number.isFinite(Date.parse(times.scheduledUtc)) ||
          day(new Date(times.scheduledUtc)) !== today
        )
          continue;
        if (f.flightId !== query && !f.codeShareData?.includes(query)) continue;
        const id = f.flightLegIdentifier || {};
        const route =
          clean(id.departureAirportIata) + ' → ' + clean(id.arrivalAirportIata);
        const status =
          clean(f.locationAndStatus?.flightLegStatusSwedish) ||
          'Uppgift saknas';
        const label = `${clean(f.flightId)} · ${route} · ${direction === 'departure' ? 'Avgång' : 'Ankomst'}`;
        rows.push({
          label,
          callsign: /^[A-Z0-9]{2,10}$/i.test(id.callsign || '')
            ? id.callsign.toUpperCase()
            : null,
          text: `${label}\nPlanerad: ${clock(times.scheduledUtc)}\nBeräknad: ${clock(times.estimatedUtc)}\nFaktisk: ${clock(times.actualUtc)}\nStatus: ${status} · Gate: ${clean(f.locationAndStatus?.gate) || 'Uppgift saknas'}`,
        });
      }
    const value = {
      answer: rows.length
        ? `Swedavia: ${query}, ${today}. Tider visas i svensk tid. Kartposition kräver en separat flygobservation.`
        : `Ingen avgång eller ankomst för ${query} hittades hos Swedavia ${today}. Sökningen gäller deras flygplatser och dagens datum, inte hela flygbolagets nät.`,
      flightResults: rows,
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
