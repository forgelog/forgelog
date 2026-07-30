import Ajv from 'ajv';

const schema = require('../../../../../data/contracts/sync.schema.json');

const syncSnapshotFixture = require('../../../../../data/contracts/fixtures/sync-snapshot.json');
const malformedSyncSnapshotFixture = require('../../../../../data/contracts/fixtures/malformed-sync-snapshot.json');
const versionSkewSyncSnapshotFixture = require('../../../../../data/contracts/fixtures/version-skew-sync-snapshot.json');
const workoutMailboxFixture = require('../../../../../data/contracts/fixtures/workout-mailbox.json');
const malformedWorkoutMailboxFixture = require('../../../../../data/contracts/fixtures/malformed-workout-mailbox.json');
const versionSkewWorkoutMailboxFixture = require('../../../../../data/contracts/fixtures/version-skew-workout-mailbox.json');

const ajv = new Ajv();

function makeValidator(definitionName: string) {
  return ajv.compile({ ...schema.definitions[definitionName], definitions: schema.definitions });
}

const validateSyncSnapshot = makeValidator('SyncSnapshot');
const validateWorkoutMailbox = makeValidator('WorkoutMailbox');

test('workout-mailbox fixture validates against WorkoutMailbox schema', () => {
  expect(validateWorkoutMailbox(workoutMailboxFixture)).toBe(true);
  expect(validateWorkoutMailbox.errors).toBeNull();
});

test('malformed and version-skew workout mailboxes fail schema validation', () => {
  expect(validateWorkoutMailbox(malformedWorkoutMailboxFixture)).toBe(false);
  expect(validateWorkoutMailbox(versionSkewWorkoutMailboxFixture)).toBe(false);
});

test('sync-snapshot fixture validates against SyncSnapshot schema', () => {
  expect(validateSyncSnapshot(syncSnapshotFixture)).toBe(true);
  expect(validateSyncSnapshot.errors).toBeNull();
});

test('malformed-sync-snapshot fixture fails SyncSnapshot schema', () => {
  expect(validateSyncSnapshot(malformedSyncSnapshotFixture)).toBe(false);
});

test('version-skew-sync-snapshot fixture fails SyncSnapshot schema', () => {
  expect(validateSyncSnapshot(versionSkewSyncSnapshotFixture)).toBe(false);
});
