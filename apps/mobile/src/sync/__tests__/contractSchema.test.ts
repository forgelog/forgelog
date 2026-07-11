import Ajv from 'ajv';

const schema = require('../../../../../data/contracts/sync.schema.json');

const watchWorkoutPayloadFixture = require('../../../../../data/contracts/fixtures/watch-workout-payload.json');
const malformedPayloadFixture = require('../../../../../data/contracts/fixtures/malformed-watch-workout-payload.json');
const versionSkewPayloadFixture = require('../../../../../data/contracts/fixtures/version-skew-watch-workout-payload.json');
const syncSnapshotFixture = require('../../../../../data/contracts/fixtures/sync-snapshot.json');

const ajv = new Ajv();

function makeValidator(definitionName: string) {
  return ajv.compile({ ...schema.definitions[definitionName], definitions: schema.definitions });
}

const validateWorkoutPayload = makeValidator('WatchWorkoutPayload');
const validateSyncSnapshot = makeValidator('SyncSnapshot');

test('watch-workout-payload fixture validates against WatchWorkoutPayload schema', () => {
  expect(validateWorkoutPayload(watchWorkoutPayloadFixture)).toBe(true);
  expect(validateWorkoutPayload.errors).toBeNull();
});

test('sync-snapshot fixture validates against SyncSnapshot schema', () => {
  expect(validateSyncSnapshot(syncSnapshotFixture)).toBe(true);
  expect(validateSyncSnapshot.errors).toBeNull();
});

test('malformed-watch-workout-payload fixture fails WatchWorkoutPayload schema', () => {
  expect(validateWorkoutPayload(malformedPayloadFixture)).toBe(false);
});

test('version-skew-watch-workout-payload fixture fails WatchWorkoutPayload schema', () => {
  expect(validateWorkoutPayload(versionSkewPayloadFixture)).toBe(false);
});
