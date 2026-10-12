function point(p) {
  const rawLon = p?.lon ?? p?.longitude,
    rawLat = p?.lat ?? p?.latitude;
  const numeric = (v) =>
    typeof v === 'number' || (typeof v === 'string' && v.trim() !== '');
  if (!numeric(rawLon) || !numeric(rawLat)) return null;
  const lon = Number(p?.lon ?? p?.longitude),
    lat = Number(p?.lat ?? p?.latitude);
  return Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    Math.abs(lon) <= 180 &&
    Math.abs(lat) <= 90
    ? [lon, lat]
    : null;
}
export function resRobotMapTrips(trips) {
  return trips.map((trip, index) => ({
    label: 'Förslag ' + (index + 1),
    legs: (trip.LegList?.Leg || []).map((l, sourceLegIndex) => ({
      sourceLegIndex,
      name: l.type === 'WALK' ? 'Gång' : l.Product?.[0]?.name || 'Resa',
      mode:
        l.type === 'WALK'
          ? 'walk'
          : /tåg|tunnelbana/i.test(l.Product?.[0]?.name || '')
            ? 'rail'
            : 'bus',
      from: l.Origin?.name,
      to: l.Destination?.name,
      departure: (l.Origin?.rtTime || l.Origin?.time || '').slice(0, 5),
      arrival: (l.Destination?.rtTime || l.Destination?.time || '').slice(0, 5),
      coordinates: [
        point(l.Origin),
        ...(l.Stops?.Stop || []).map(point),
        point(l.Destination),
      ].filter(Boolean),
      approximate: true,
    })),
  }));
}
export function vasttrafikMapTrips(trips) {
  return trips.map((trip, index) => ({
    label: 'Förslag ' + (index + 1),
    legs: [
      ...(trip.tripLegs || []),
      ...(trip.connectionLinks || []),
      ...(trip.departureAccessLink ? [trip.departureAccessLink] : []),
      ...(trip.arrivalAccessLink ? [trip.arrivalAccessLink] : []),
    ]
      .sort(
        (a, b) =>
          Date.parse(a.plannedDepartureTime) -
          Date.parse(b.plannedDepartureTime),
      )
      .map((l) => ({
        name: l.serviceJourney?.line?.name || 'Gång/anslutning',
        mode: l.serviceJourney?.line?.transportMode || 'walk',
        from: l.origin?.stopPoint?.name || l.origin?.name,
        to: l.destination?.stopPoint?.name || l.destination?.name,
        departure: l.estimatedDepartureTime || l.plannedDepartureTime,
        arrival: l.estimatedArrivalTime || l.plannedArrivalTime,
        coordinates: l.linkCoordinates?.length
          ? l.linkCoordinates.map(point).filter(Boolean)
          : [
              point(l.origin?.stopPoint || l.origin),
              point(l.destination?.stopPoint || l.destination),
            ].filter(Boolean),
        approximate: (l.linkCoordinates?.length || 0) < 3,
      }))
      .filter((l) => l.coordinates.length >= 2),
  }));
}
