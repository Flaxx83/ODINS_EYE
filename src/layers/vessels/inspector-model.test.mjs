import test from 'node:test';
import assert from 'node:assert/strict';
import { reportedEtaText, vesselInspectorFields } from './inspector-model.js';
import { normalizeVesselObservation } from '../../sources/live/vessels.js';
import { normalizeVessel } from './records.js';
import {
  ingestAisStreamEnvelope,
  aisStreamRows,
} from '../../../server/providers/vessels/ais-store.js';

test('reported AIS ETA has no invented year and unknown sentinel values are missing', () => {
  assert.equal(
    reportedEtaText({ Month: 10, Day: 12, Hour: 13, Minute: 30 }),
    '12/10 13:30 UTC · år ej rapporterat',
  );
  for (const eta of [
    null,
    { Month: 0, Day: 0, Hour: 24, Minute: 60 },
    { Month: 2, Day: 30, Hour: 7, Minute: 0 },
  ])
    assert.equal(reportedEtaText(eta), 'Uppgift saknas');
  const fields = Object.fromEntries(
    vesselInspectorFields(
      { speed: 0, course: 0, navigationalStatus: 0, lastPositionEpoch: 60 },
      120000,
    ),
  );
  assert.equal(fields['Fart / kurs'], '0.0 kn / 0°');
  assert.equal(fields.Navigationsstatus, 'Under gång med motor');
  assert.equal(fields.Positionsrapport, '1 min sedan');
  assert.equal(
    Object.fromEntries(vesselInspectorFields({})).Destination,
    'Uppgift saknas',
  );
});
test('AIS static ETA and navigation status survive store and observation normalization', () => {
  const id = 265998877;
  ingestAisStreamEnvelope({
    MessageType: 'ShipStaticData',
    MetaData: { MMSI: id },
    Message: {
      ShipStaticData: {
        UserID: id,
        Name: 'TEST SHIP',
        Type: 60,
        Eta: { Month: 10, Day: 12, Hour: 7, Minute: 0 },
        Destination: 'SE GOT',
        ImoNumber: 1234567,
      },
    },
  });
  ingestAisStreamEnvelope({
    MessageType: 'PositionReport',
    MetaData: { MMSI: id, time_utc: new Date().toISOString() },
    Message: {
      PositionReport: {
        UserID: id,
        Latitude: 57,
        Longitude: 12,
        Sog: 8,
        Cog: 90,
        NavigationalStatus: 1,
      },
    },
  });
  const row = aisStreamRows(50000).find((r) => r.mmsi === String(id));
  assert.equal(row.navigational_status, 1);
  assert.equal(row.reported_eta.Hour, 7);
  const observation = normalizeVesselObservation(row);
  assert.equal(observation.reportedEta.Hour, 7);
  assert.equal(observation.navigationalStatus, 1);
  const display = normalizeVessel(row);
  assert.equal(display.reportedEta.Hour, 7);
  assert.equal(display.navigationalStatus, 1);
  ingestAisStreamEnvelope({
    MessageType: 'ShipStaticData',
    MetaData: {
      MMSI: id,
      latitude: 57,
      longitude: 12,
      time_utc: new Date().toISOString(),
    },
    Message: {
      ShipStaticData: {
        UserID: id,
        Name: 'TEST SHIP',
        Destination: 'DK CPH',
        Eta: { Month: 10, Day: 13, Hour: 8, Minute: 0 },
      },
    },
  });
  const refreshed = aisStreamRows(50000).find((r) => r.mmsi === String(id));
  assert.equal(refreshed.speed, 8);
  assert.equal(refreshed.last_position_epoch, row.last_position_epoch);
  assert.equal(refreshed.destination, 'DK CPH');
  assert.equal(refreshed.reported_eta.Hour, 8);
});
