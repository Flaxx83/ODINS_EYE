export function filterPoliceEvents(
  events,
  { area = '', type = '', date = '', search = '' } = {},
) {
  const q = search.trim().toLocaleLowerCase('sv');
  return events.filter(
    (e) =>
      (!area || e.area === area) &&
      (!type || e.type === type) &&
      (!date || e.date === date) &&
      (!q ||
        `${e.title} ${e.summary} ${e.area}`
          .toLocaleLowerCase('sv')
          .includes(q)),
  );
}
export function groupPoliceEvents(events) {
  const groups = new Map();
  for (const event of events) {
    if (!Number.isFinite(event.lat) || !Number.isFinite(event.lon)) continue;
    const key = event.lat + ',' + event.lon;
    let group = groups.get(key);
    if (!group) {
      group = { id: key, lat: event.lat, lon: event.lon, events: [] };
      groups.set(key, group);
    }
    group.events.push(event);
  }
  return [...groups.values()];
}
