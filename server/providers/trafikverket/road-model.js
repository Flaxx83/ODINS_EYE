import { SaxesParser } from 'saxes';
const stamp = (v) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)
    ? Date.parse(v)
    : NaN;
export function parseRoadDatex(xml, feed) {
  const rows = [],
    stack = [];
  let record = null,
    root = false,
    comment = '',
    informationStatus = null;
  const parser = new SaxesParser({ xmlns: true });
  parser.on('doctype', () => {
    throw Error('DTD not supported');
  });
  parser.on('opentag', (tag) => {
    if (stack.length > 80) throw Error('XML depth');
    const attrs = Object.fromEntries(
      Object.values(tag.attributes).map((a) => [a.local, a.value]),
    );
    stack.push({ name: tag.local, text: '', attrs });
    if (tag.local === 'situation') informationStatus = null;
    if (tag.local === 'messageContainer') root = true;
    if (tag.local === 'situationRecord') {
      record = {
        id: attrs.id,
        informationStatus,
        type: attrs.type?.split(':').at(-1) || feed,
        feed,
        version: Number(attrs.version) || 0,
        description: '',
      };
    }
    if (
      record &&
      [
        'validPeriod',
        'exceptionPeriod',
        'recurringTimePeriodOfDay',
        'recurringDayWeekMonthPeriod',
      ].includes(tag.local)
    )
      record.detailedValidity = true;
    if (tag.local === 'generalPublicComment') comment = '';
  });
  parser.on('text', (text) => {
    if (stack.length)
      stack.at(-1).text = (stack.at(-1).text + text).slice(0, 4000);
  });
  parser.on('closetag', () => {
    const node = stack.pop();
    if (node.name === 'informationStatus') informationStatus = node.text.trim();
    if (!record) return;
    const name = node.name,
      t = node.text.trim(),
      path = stack.map((x) => x.name);
    if (name === 'situationRecordVersionTime') record.ModifiedTime = t;
    if (name === 'overallStartTime') record.start = t;
    if (name === 'overallEndTime') record.end = t;
    if (name === 'validityStatus') record.validity = t;
    if (name === 'severity') record.severity = t;
    if (name === 'roadNumber') record.road = t;
    if (name === 'value' && (!node.attrs.lang || node.attrs.lang === 'sv')) {
      if (path.includes('generalPublicComment')) comment += t + ' ';
      if (path.includes('locationDescription')) record.place = t;
    }
    if (name === 'generalPublicComment')
      record.description = (record.description + ' ' + comment)
        .trim()
        .slice(0, 2000);
    if (path.includes('coordinatesForDisplay') && name === 'latitude')
      record.lat = t ? Number(t) : NaN;
    if (path.includes('coordinatesForDisplay') && name === 'longitude')
      record.lon = Number(t);
    if (name === 'situationRecord') {
      if (record.id && rows.length < 20000) rows.push(record);
      else if (rows.length >= 20000) throw Error('Too many records');
      record = null;
    }
  });
  parser.write(xml).close();
  if (!root) throw Error('Invalid DATEX response');
  return rows;
}
export function selectRoadEvents(rows, box, now = Date.now()) {
  const latest = new Map();
  for (const r of rows) {
    const old = latest.get(r.id);
    if (
      !old ||
      stamp(r.ModifiedTime) > stamp(old.ModifiedTime) ||
      (stamp(r.ModifiedTime) === stamp(old.ModifiedTime) &&
        r.version > old.version) ||
      (!Number.isFinite(stamp(old.ModifiedTime)) && r.version >= old.version)
    )
      latest.set(r.id, r);
  }
  let missingGeometry = 0,
    unknownTime = 0;
  const events = [];
  for (const r of latest.values()) {
    if (r.informationStatus && r.informationStatus !== 'real') continue;
    const start = stamp(r.start),
      end = stamp(r.end);
    if (!Number.isFinite(start)) {
      unknownTime++;
      continue;
    }
    if (
      r.validity === 'suspended' ||
      (r.validity === 'definedByValidityTimeSpec' && start > now) ||
      start > now ||
      (Number.isFinite(end) && end <= now)
    )
      continue;
    if (
      !Number.isFinite(r.lat) ||
      !Number.isFinite(r.lon) ||
      Math.abs(r.lat) > 90 ||
      Math.abs(r.lon) > 180
    ) {
      missingGeometry++;
      continue;
    }
    if (r.lon < box[0] || r.lat < box[1] || r.lon > box[2] || r.lat > box[3])
      continue;
    const content = (r.type + ' ' + r.description).toLowerCase();
    const kind = /abnormaltraffic|trafficcongestion|köbildning|trafikkö/.test(
      content,
    )
      ? 'Kö'
      : /road.*management|avstäng|stängd/.test(content)
        ? 'Avstängning'
        : r.feed === 'roadworks'
          ? 'Vägarbete'
          : r.feed === 'accident'
            ? 'Olycka'
            : 'Trafikmeddelande';
    events.push({ ...r, kind, geometry: 'reported-display-point' });
  }
  return {
    events: events.slice(0, 500),
    truncated: events.length > 500,
    missingGeometry,
    unknownTime,
  };
}
