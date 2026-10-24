const key = (value) =>
  String(value || '')
    .replace(/\s+/g, '')
    .toUpperCase();

export function exactFlightMatch(module, query) {
  const found = module?.findByQuery?.(key(query));
  if (!found) return null;
  // The shared lookup also accepts prefixes/substrings. Never navigate to one
  // of those when the user supplied a flight identifier.
  return [found.callsign, found.icao24, found.registration].some(
    (value) => value && key(value) === key(query),
  )
    ? found
    : null;
}

export async function showFlight(dataManager, query, isCurrent = () => true) {
  await dataManager.setEnabled('flights', true, { origin: 'user' });
  if (!isCurrent()) return null;
  const module = dataManager.layers.get('flights')?.module;
  const found = exactFlightMatch(module, query);
  if (!found)
    return (
      'Ingen exakt träff för ' +
      query +
      ' i flyglagrets inlästa observationer. Det betyder inte att flyget saknas eller är inställt. Bokningsnumret kan skilja sig från planets anropssignal. Prova anropssignal eller registrering, eller sök igen när nya flygdata har hämtats.'
    );
  if (!module.trackById?.(found.icao24, { origin: 'user' }))
    throw Error('Flyget hittades men kunde inte visas. Sök igen.');
  return (
    'Visar ' +
    query +
    ' från flyglagrets observationer på kartan. Positionen är inte en bekräftelse på tidtabell eller flygstatus.'
  );
}
