/** Unknown product types must not be presented as the explicitly requested mode. */
export function journeyMatchesMode(legs, message, provider) {
  const requested = /med tåg/i.test(message)
    ? 'train'
    : /med spårvagn/i.test(message)
      ? 'tram'
      : null;
  if (!requested) return true;
  let services = 0;
  const matched = legs.every((leg) => {
    if (provider === 'vasttrafik') {
      if (!leg.serviceJourney) return true;
      services++;
      return leg.serviceJourney.line?.transportMode === requested;
    }
    if (leg.type === 'WALK') return true;
    services++;
    return (leg.Product || []).some((p) => {
      const text = [p.name, p.catOut, p.catIn].filter(Boolean).join(' ');
      return requested === 'tram'
        ? /spårvagn|spårväg/i.test(text)
        : /tåg|pendel/i.test(text) && !/tunnelbana|spårvagn|buss/i.test(text);
    });
  });
  return matched && services > 0;
}
