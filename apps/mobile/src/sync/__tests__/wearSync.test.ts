jest.mock('wear-sync', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn(),
    publishSnapshot: jest.fn(),
  },
}));
jest.mock('../../db/repositories/sync');

import WearSync from 'wear-sync';

import { getSyncSnapshot, ingestWatchWorkout } from '../../db/repositories/sync';
import { initWearSync, publishSyncSnapshot } from '../wearSync';

const mockAddListener = WearSync.addListener as jest.Mock;
const mockPublishSnapshot = WearSync.publishSnapshot as jest.Mock;
const mockGetSyncSnapshot = getSyncSnapshot as jest.MockedFunction<typeof getSyncSnapshot>;
const mockIngestWatchWorkout = ingestWatchWorkout as jest.MockedFunction<typeof ingestWatchWorkout>;

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
  const payload = {
    id: 'w1',
    routine_id: null,
    name: 'Freestyle',
    started_at: '2026-01-01',
    ended_at: null,
    notes: null,
    exercises: [],
  };
  await onWorkoutReceived({ payload: JSON.stringify(payload) });

  expect(mockIngestWatchWorkout).toHaveBeenCalledWith(payload);
});

test('publishSyncSnapshot swallows errors when no watch is reachable', async () => {
  mockPublishSnapshot.mockRejectedValueOnce(new Error('no connected node'));

  await expect(publishSyncSnapshot()).resolves.toBeUndefined();
});
