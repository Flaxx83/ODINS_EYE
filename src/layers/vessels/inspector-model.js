const missing = 'Uppgift saknas';
export function reportedEtaText(eta) {
  if (!eta || typeof eta !== 'object') return missing;
  const { Month: m, Day: d, Hour: h, Minute: n } = eta;
  if (
    ![m, d, h, n].every(Number.isInteger) ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ||
    h < 0 ||
    h > 23 ||
    n < 0 ||
    n > 59
  )
    return missing;
  return `${d}/${m} ${String(h).padStart(2, '0')}:${String(n).padStart(2, '0')} UTC · år ej rapporterat`;
}
export function vesselInspectorFields(record, now = Date.now()) {
  const statuses = {
    0: 'Under gång med motor',
    1: 'För ankar',
    2: 'Ej manöverduglig',
    3: 'Begränsad manöverförmåga',
    4: 'Begränsad av djupgående',
    5: 'Förtöjd',
    6: 'På grund',
    7: 'Fiske',
    8: 'Under segel',
    11: 'Bogserar akterut',
    12: 'Skjuter eller bogserar längs sidan',
    14: 'AIS nödsändare',
  };
  const time = record.lastPositionEpoch
    ? record.lastPositionEpoch * 1000
    : Date.parse(record.lastPositionUtc);
  const age =
    Number.isFinite(time) && time <= now
      ? `${Math.floor((now - time) / 60000)} min sedan`
      : missing;
  return [
    [
      'Fart / kurs',
      [
        Number.isFinite(record.speed)
          ? record.speed.toFixed(1) + ' kn'
          : missing,
        Number.isFinite(record.course)
          ? Math.round(record.course) + '°'
          : missing,
      ].join(' / '),
    ],
    ['Destination', record.destination?.trim() || missing],
    ['Rapporterad ETA', reportedEtaText(record.reportedEta)],
    ['Navigationsstatus', statuses[record.navigationalStatus] || missing],
    [
      'Positionsrapport',
      age +
        (record.missedRefreshes > 0 ? ' · saknas i senaste uppdatering' : ''),
    ],
    ['MMSI / IMO', [record.mmsi || missing, record.imo || missing].join(' / ')],
  ];
}
