import Ajv from 'ajv';

const schema = require('../../../../../data/contracts/sync.schema.json');

const watchWorkoutPayloadFixture = require('../../../../../data/contracts/fixtures/watch-workout-payload.json');
const malformedPayloadFixture = require('../../../../../data/contracts/fixtures/malformed-watch-workout-payload.json');
const versionSkewPayloadFixture = require('../../../../../data/contracts/fixtures/version-skew-watch-workout-payload.json');
const syncSnapshotFixture = require('../../../../../data/contracts/fixtures/sync-snapshot.json');
const malformedSyncSnapshotFixture = require('../../../../../data/contracts/fixtures/malformed-sync-snapshot.json');
const versionSkewSyncSnapshotFixture = require('../../../../../data/contracts/fixtures/version-skew-sync-snapshot.json');
const activeWorkoutSchema = require('../../../../../data/contracts/active-workout.schema.json');
const activeWorkoutStateFixture = require('../../../../../data/contracts/fixtures/active-workout-state.json');
const activeWorkoutMutationsFixture = require('../../../../../data/contracts/fixtures/active-workout-mutations.json');

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

test('malformed-sync-snapshot fixture fails SyncSnapshot schema', () => {
  expect(validateSyncSnapshot(malformedSyncSnapshotFixture)).toBe(false);
});

test('version-skew-sync-snapshot fixture fails SyncSnapshot schema', () => {
  expect(validateSyncSnapshot(versionSkewSyncSnapshotFixture)).toBe(false);
});

test('active workout canonical state and every mutation family validate', () => {
  const activeAjv = new Ajv({ discriminator: true, allowUnionTypes: true });
  const stateValidator = activeAjv.compile({
    ...activeWorkoutSchema.definitions.CanonicalState,
    definitions: activeWorkoutSchema.definitions,
  });
  const mutationValidator = activeAjv.compile({
    ...activeWorkoutSchema.definitions.Mutation,
    definitions: activeWorkoutSchema.definitions,
  });
  expect(stateValidator(activeWorkoutStateFixture)).toBe(true);
  expect(stateValidator.errors).toBeNull();
  for (const fixture of activeWorkoutMutationsFixture) {
    expect(mutationValidator(fixture)).toBe(true);
    expect(mutationValidator.errors).toBeNull();
  }
});
