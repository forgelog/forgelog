import WearSync from 'wear-sync';

import { mobileStore, type WatchWorkoutPayload } from '../../db/mobileStore';
import { initWearSync, publishSyncSnapshot } from '../wearSync';

jest.mock('wear-sync', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn(),
    publishSnapshot: jest.fn(),
  },
}));

const mockAddListener = WearSync.addListener as jest.Mock;
const mockPublishSnapshot = WearSync.publishSnapshot as jest.Mock;
const mockGetSyncSnapshot = jest.spyOn(mobileStore.sync, 'getSnapshot');
const mockIngestWatchWorkout = jest.spyOn(mobileStore.sync, 'ingestWatchWorkout');

const watchPayloadFixture = require('../../../../../data/contracts/fixtures/watch-workout-payload.json') as WatchWorkoutPayload;
const malformedPayloadFixture = require('../../../../../data/contracts/fixtures/malformed-watch-workout-payload.json');
const versionSkewPayloadFixture = require('../../../../../data/contracts/fixtures/version-skew-watch-workout-payload.json');

function getListener(event: string): (arg: unknown) => unknown {
  const call = mockAddListener.mock.calls.find(([name]) => name === event);
  if (!call) throw new Error(`no listener registered for ${event}`);
  return call[1];
}

// initWearSync() is a guarded singleton (matches App.tsx calling it once on
// mount), so it's only invoked once here too — subsequent tests reuse the
// listeners captured from that single call.
initWearSync();
const onWorkoutReceived = getListener('onWorkoutReceived');
const onSyncRequested = getListener('onSyncRequested');

beforeEach(() => {
  mockGetSyncSnapshot.mockReset().mockResolvedValue({ routines: [], personalRecords: [] });
  mockPublishSnapshot.mockReset().mockResolvedValue(undefined);
  mockIngestWatchWorkout.mockReset();
});

test('addListener is only wired up once even if initWearSync is called again', () => {
  mockAddListener.mockClear();

  initWearSync();

  expect(mockAddListener).not.toHaveBeenCalled();
});

test('onSyncRequested triggers a fresh publishSyncSnapshot (not stale data)', async () => {
  await onSyncRequested(undefined);

  expect(mockGetSyncSnapshot).toHaveBeenCalledTimes(1);
  expect(mockPublishSnapshot).toHaveBeenCalledTimes(1);
});

test('onWorkoutReceived ingests the watch payload', async () => {
  await onWorkoutReceived({ payload: JSON.stringify(watchPayloadFixture) });

  expect(mockIngestWatchWorkout).toHaveBeenCalledWith(watchPayloadFixture);
});

test('onWorkoutReceived drops malformed payload without calling ingestWatchWorkout', async () => {
  await onWorkoutReceived({ payload: JSON.stringify(malformedPayloadFixture) });

  expect(mockIngestWatchWorkout).not.toHaveBeenCalled();
});

test('onWorkoutReceived drops payload with malformed exercise items without calling ingestWatchWorkout', async () => {
  const payloadWithBadExercise = {
    protocol_version: 2,
    id: 'w1',
    routine_id: null,
    name: 'test',
    started_at: '2026-07-07T00:00:00.000Z',
    ended_at: null,
    notes: null,
    exercises: [{ id: 'we1', exercise_id: 'ex1', position: 0 }],
  };

  await onWorkoutReceived({ payload: JSON.stringify(payloadWithBadExercise) });

  expect(mockIngestWatchWorkout).not.toHaveBeenCalled();
});

test('onWorkoutReceived ingests payload missing optional nullable fields (real WearOS shape)', async () => {
  const noNullableFields = {
    protocol_version: 2,
    id: 'w2',
    name: 'Quick Workout',
    started_at: '2026-07-11T10:00:00.000Z',
    exercises: [],
  };

  await onWorkoutReceived({ payload: JSON.stringify(noNullableFields) });

  expect(mockIngestWatchWorkout).toHaveBeenCalledTimes(1);
});

test('onWorkoutReceived drops payload with malformed set items', async () => {
  const payloadWithBadSet = {
    protocol_version: 2,
    id: 'w3',
    name: 'test',
    started_at: '2026-07-11T10:00:00.000Z',
    exercises: [{
      id: 'we1',
      exercise_id: 'ex1',
      position: 0,
      sets: [{}],
    }],
  };

  await onWorkoutReceived({ payload: JSON.stringify(payloadWithBadSet) });

  expect(mockIngestWatchWorkout).not.toHaveBeenCalled();
});

test('onWorkoutReceived drops version-skew payload (protocol_version != 2)', async () => {
  await onWorkoutReceived({ payload: JSON.stringify(versionSkewPayloadFixture) });

  expect(mockIngestWatchWorkout).not.toHaveBeenCalled();
});

test('onWorkoutReceived drops payload missing protocol_version', async () => {
  const noVersionPayload = { ...watchPayloadFixture };
  delete (noVersionPayload as Record<string, unknown>).protocol_version;

  await onWorkoutReceived({ payload: JSON.stringify(noVersionPayload) });

  expect(mockIngestWatchWorkout).not.toHaveBeenCalled();
});

test('onWorkoutReceived drops unparseable JSON without throwing', async () => {
  await expect(onWorkoutReceived({ payload: 'not json{{{' })).resolves.toBeUndefined();

  expect(mockIngestWatchWorkout).not.toHaveBeenCalled();
});

test('publishSyncSnapshot swallows errors when no watch is reachable', async () => {
  mockPublishSnapshot.mockRejectedValueOnce(new Error('no connected node'));

  await expect(publishSyncSnapshot()).resolves.toBeUndefined();
});
