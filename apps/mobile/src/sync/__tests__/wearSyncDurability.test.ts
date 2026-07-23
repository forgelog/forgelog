import { waitFor } from '@testing-library/react-native';
import WearSync from 'wear-sync';

import * as activeWorkoutSync from '../../application/activeWorkoutSync';
import { mobileStore } from '../../db/mobileStore';
import type {
  ActiveWorkoutCanonicalState,
  ActiveWorkoutMutation,
  ActiveWorkoutResult,
} from '../activeWorkoutProtocol';
import { initWearSync, publishDirtyActiveWorkout } from '../wearSync';

const mockListeners = new Map<string, (event: any) => unknown>();
let mockChangeListener: (() => void) | undefined;

jest.mock('wear-sync', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn((event: string, listener: (event: any) => unknown) => {
      mockListeners.set(event, listener);
    }),
    publishSnapshot: jest.fn().mockResolvedValue(undefined),
    ackWorkout: jest.fn().mockResolvedValue(undefined),
    publishActiveWorkoutState: jest.fn().mockResolvedValue(undefined),
    publishActiveWorkoutResult: jest.fn().mockResolvedValue(undefined),
    enumerateActiveWorkoutDataItems: jest.fn().mockResolvedValue([]),
    deleteDataItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../db/mobileStore', () => ({
  mobileStore: {
    sync: {
      getSnapshot: jest.fn().mockResolvedValue({ protocol_version: 2, routines: [] }),
      ingestWatchWorkout: jest.fn().mockResolvedValue(undefined),
      verifyActiveWorkoutCheckpoint: jest.fn().mockResolvedValue('pending'),
    },
  },
}));

jest.mock('../../application/activeWorkoutSync', () => ({
  applyRemoteActiveWorkoutMutation: jest.fn().mockResolvedValue({ status: 'accepted' }),
  getDirtyActiveWorkoutPublications: jest.fn().mockResolvedValue({ state: null, results: [] }),
  markActiveWorkoutResultPublished: jest.fn().mockResolvedValue(undefined),
  markActiveWorkoutStatePublished: jest.fn().mockResolvedValue(undefined),
  subscribeActiveWorkoutChanges: jest.fn((listener: () => void) => {
    mockChangeListener = listener;
    return jest.fn();
  }),
  acknowledgeActiveWorkoutState: jest.fn().mockResolvedValue(undefined),
  rejectMalformedActiveWorkoutMutation: jest.fn().mockResolvedValue({ status: 'rejected' }),
}));

const mockAddListener = WearSync.addListener as jest.Mock;
const mockAckWorkout = WearSync.ackWorkout as jest.Mock;
const mockPublishState = WearSync.publishActiveWorkoutState as jest.Mock;
const mockPublishResult = WearSync.publishActiveWorkoutResult as jest.Mock;
const mockEnumerate = WearSync.enumerateActiveWorkoutDataItems as jest.Mock;
const mockDeleteDataItem = WearSync.deleteDataItem as jest.Mock;
const mockIngestWorkout = mobileStore.sync.ingestWatchWorkout as jest.Mock;
const mockVerifyCheckpoint = mobileStore.sync.verifyActiveWorkoutCheckpoint as jest.Mock;
const mockApplyMutation = activeWorkoutSync.applyRemoteActiveWorkoutMutation as jest.Mock;
const mockRejectMutation = activeWorkoutSync.rejectMalformedActiveWorkoutMutation as jest.Mock;
const mockGetDirty = activeWorkoutSync.getDirtyActiveWorkoutPublications as jest.Mock;
const mockMarkStatePublished = activeWorkoutSync.markActiveWorkoutStatePublished as jest.Mock;
const mockMarkResultPublished = activeWorkoutSync.markActiveWorkoutResultPublished as jest.Mock;
const mockAcknowledgeState = activeWorkoutSync.acknowledgeActiveWorkoutState as jest.Mock;

const watchWorkout = require('../../../../../data/contracts/fixtures/watch-workout-payload.json');
const mutation = (require('../../../../../data/contracts/fixtures/active-workout-mutations.json') as ActiveWorkoutMutation[])[2];
const state = require('../../../../../data/contracts/fixtures/active-workout-state.json') as ActiveWorkoutCanonicalState;

function listener(name: string): (event: any) => unknown {
  const value = mockListeners.get(name);
  if (!value) throw new Error(`Missing ${name} listener`);
  return value;
}

function activeCheckpoint() {
  return {
    ...watchWorkout,
    active_sync: {
      finish_operation_id: 'finish-1',
      device_id: 'watch-1',
      device_sequence: 4,
      canonical_revision: 8,
      provisional: false,
      payload_hash: 'hash',
    },
  };
}

async function sendActiveData(path: string, payload: unknown, raw = false): Promise<void> {
  const callsBefore = mockEnumerate.mock.calls.length;
  listener('onActiveWorkoutDataChanged')({
    path,
    payload: raw ? String(payload) : JSON.stringify(payload),
  });
  await waitFor(() => expect(mockEnumerate.mock.calls.length).toBeGreaterThan(callsBefore));
}

beforeAll(async () => {
  initWearSync();
  await waitFor(() => expect(mockEnumerate).toHaveBeenCalled());
});

beforeEach(() => {
  mockAckWorkout.mockClear();
  mockIngestWorkout.mockClear();
  mockVerifyCheckpoint.mockReset().mockResolvedValue('pending');
  mockApplyMutation.mockReset().mockResolvedValue({ status: 'accepted' });
  mockRejectMutation.mockReset().mockResolvedValue({ status: 'rejected' });
  mockDeleteDataItem.mockClear();
  mockEnumerate.mockReset().mockResolvedValue([]);
  mockGetDirty.mockReset().mockResolvedValue({ state: null, results: [] });
  mockPublishState.mockClear();
  mockPublishResult.mockClear();
  mockMarkStatePublished.mockClear();
  mockMarkResultPublished.mockClear();
  mockAcknowledgeState.mockClear();
});

test('initializes durable listeners, drains startup state, and reacts to local changes', async () => {
  expect(mockAddListener).toHaveBeenCalledTimes(3);
  expect(mockChangeListener).toBeDefined();

  const callsBefore = mockGetDirty.mock.calls.length;
  mockChangeListener!();
  await waitFor(() => expect(mockGetDirty.mock.calls.length).toBeGreaterThan(callsBefore));
});

test('handles legacy and active-protocol workout callbacks', async () => {
  const onWorkout = listener('onWorkoutReceived');

  await onWorkout({ payload: JSON.stringify(watchWorkout) });
  expect(mockIngestWorkout).toHaveBeenCalledWith(watchWorkout);
  expect(mockAckWorkout).toHaveBeenCalledWith(watchWorkout.id);

  mockAckWorkout.mockClear();
  mockVerifyCheckpoint.mockResolvedValueOnce('acknowledged');
  const checkpoint = activeCheckpoint();
  await onWorkout({ payload: JSON.stringify(checkpoint) });
  expect(mockVerifyCheckpoint).toHaveBeenCalledWith(checkpoint);
  expect(mockAckWorkout).toHaveBeenCalledWith(checkpoint.id);

  mockAckWorkout.mockClear();
  mockVerifyCheckpoint.mockResolvedValueOnce('pending');
  await onWorkout({ payload: JSON.stringify(checkpoint) });
  expect(mockAckWorkout).not.toHaveBeenCalled();
});

test('drains legacy checkpoints and ignores malformed workout DataItems', async () => {
  await sendActiveData('/workout/bad-json', '{', true);
  await sendActiveData('/workout/bad-shape', {});
  expect(mockIngestWorkout).not.toHaveBeenCalled();

  await sendActiveData(`/workout/${watchWorkout.id}`, watchWorkout);
  expect(mockIngestWorkout).toHaveBeenCalledWith(watchWorkout);
  expect(mockAckWorkout).toHaveBeenCalledWith(watchWorkout.id);
});

test('verifies active checkpoints before acknowledging them', async () => {
  const checkpoint = activeCheckpoint();
  mockVerifyCheckpoint.mockResolvedValueOnce('acknowledged');
  await sendActiveData(`/workout/${checkpoint.id}`, checkpoint);
  expect(mockAckWorkout).toHaveBeenCalledWith(checkpoint.id);

  mockAckWorkout.mockClear();
  mockVerifyCheckpoint.mockResolvedValueOnce('pending');
  await sendActiveData(`/workout/${checkpoint.id}`, checkpoint);
  expect(mockAckWorkout).not.toHaveBeenCalled();
});

test('accepts only well-formed matching state acknowledgements', async () => {
  const path = '/active-workout/state-ack/watch-1';
  await sendActiveData(path, {
    protocol_version: 1,
    device_id: 'watch-1',
    coordinator_epoch: 'epoch-1',
    revision: 4,
  });
  expect(mockAcknowledgeState).toHaveBeenCalledWith(expect.objectContaining({
    device_id: 'watch-1',
    coordinator_epoch: 'epoch-1',
    revision: 4,
  }));

  for (const payload of [
    '{',
    JSON.stringify({ protocol_version: 2, device_id: 'watch-1', coordinator_epoch: 'epoch-1', revision: 4 }),
    JSON.stringify({ protocol_version: 1, device_id: 1, coordinator_epoch: 'epoch-1', revision: 4 }),
    JSON.stringify({ protocol_version: 1, device_id: 'watch-1', coordinator_epoch: 1, revision: 4 }),
    JSON.stringify({ protocol_version: 1, device_id: 'watch-1', coordinator_epoch: 'epoch-1', revision: '4' }),
  ]) await sendActiveData(path, payload, true);
  expect(mockAcknowledgeState).toHaveBeenCalledTimes(1);
});

test('ignores unrelated paths and invalid mutation paths', async () => {
  for (const path of [
    '/unrelated',
    '/active-workout/mutation/epoch-1/watch-1',
    '/active-workout/mutation/epoch-1/watch-1/0',
    '/active-workout/mutation/epoch-1/watch-1/not-a-number',
  ]) await sendActiveData(path, mutation);
  expect(mockApplyMutation).not.toHaveBeenCalled();
  expect(mockRejectMutation).not.toHaveBeenCalled();
});

test('rejects malformed mutation bytes and retains sequence gaps', async () => {
  const path = '/active-workout/mutation/epoch-1/watch-1/3';
  await sendActiveData(path, '{', true);
  expect(mockRejectMutation).toHaveBeenCalledWith({
    coordinatorEpoch: 'epoch-1', deviceId: 'watch-1', deviceSequence: 3,
  }, '{');
  expect(mockDeleteDataItem).toHaveBeenCalledWith(path);

  mockDeleteDataItem.mockClear();
  mockRejectMutation.mockResolvedValueOnce({
    status: 'blocked_by_predecessor', reason: 'sequence_gap',
  });
  await sendActiveData(path, '{', true);
  expect(mockDeleteDataItem).not.toHaveBeenCalled();
});

test('rejects invalid or path-mismatched mutation envelopes', async () => {
  const path = '/active-workout/mutation/epoch-1/watch-1/3';
  await sendActiveData(path, { ...mutation, operation: { type: 'unknown' } });
  expect(mockRejectMutation).toHaveBeenCalled();
  expect(mockDeleteDataItem).toHaveBeenCalledWith(path);

  for (const mismatch of [
    { coordinator_epoch: 'other' },
    { device_id: 'other' },
    { device_sequence: 30 },
  ]) await sendActiveData(path, { ...mutation, ...mismatch });
  expect(mockRejectMutation).toHaveBeenCalledTimes(4);
});

test('applies valid mutations and deletes them only after a final result', async () => {
  const path = `/active-workout/mutation/${mutation.coordinator_epoch}/${mutation.device_id}/${mutation.device_sequence}`;
  await sendActiveData(path, mutation);
  expect(mockApplyMutation).toHaveBeenCalledWith(mutation);
  expect(mockDeleteDataItem).toHaveBeenCalledWith(path);

  mockDeleteDataItem.mockClear();
  mockApplyMutation.mockResolvedValueOnce({
    status: 'blocked_by_predecessor', reason: 'sequence_gap',
  });
  await sendActiveData(path, mutation);
  expect(mockDeleteDataItem).not.toHaveBeenCalled();
});

test('publishes dirty canonical state and operation results', async () => {
  const withOperation: ActiveWorkoutResult = {
    protocol_version: 1,
    coordinator_epoch: 'epoch-1',
    device_id: 'watch-1',
    device_sequence: 3,
    operation_id: 'op-3',
    status: 'accepted',
    canonical_revision: 4,
    idempotent: false,
  };
  const withoutOperation: ActiveWorkoutResult = { ...withOperation, device_sequence: 4, operation_id: null };
  mockGetDirty.mockResolvedValueOnce({ state, results: [withOperation, withoutOperation] });

  await publishDirtyActiveWorkout();

  expect(mockPublishState).toHaveBeenCalledWith(JSON.stringify(state));
  expect(mockMarkStatePublished).toHaveBeenCalledWith(state.revision);
  expect(mockPublishResult).toHaveBeenNthCalledWith(
    1,
    '/active-workout/result/epoch-1/watch-1/3',
    JSON.stringify(withOperation)
  );
  expect(mockMarkResultPublished).toHaveBeenCalledWith('op-3');
  expect(mockMarkResultPublished).toHaveBeenCalledTimes(1);
});

test('sorts persistent mutations by stream and sequence before applying', async () => {
  const first = { ...mutation, operation_id: 'first', device_sequence: 1 };
  const second = { ...mutation, operation_id: 'second', device_sequence: 2 };
  const other = { ...mutation, operation_id: 'other', device_id: 'watch-2', device_sequence: 1 };
  mockEnumerate.mockResolvedValueOnce([
    { path: '/z', payload: '{}' },
    { path: '/active-workout/mutation/epoch-1/watch-1/2', payload: JSON.stringify(second) },
    { path: '/active-workout/mutation/epoch-1/watch-2/1', payload: JSON.stringify(other) },
    { path: '/active-workout/mutation/epoch-1/watch-1/1', payload: JSON.stringify(first) },
    { path: '/a', payload: '{}' },
  ]).mockResolvedValue([]);

  listener('onActiveWorkoutDataChanged')({ path: '/unrelated', payload: '{}' });
  await waitFor(() => expect(mockApplyMutation).toHaveBeenCalledTimes(3));
  expect(mockApplyMutation.mock.calls.map(([value]) => value.operation_id)).toEqual([
    'first', 'second', 'other',
  ]);
});

test('contains unavailable Wear APIs during event processing', async () => {
  mockEnumerate.mockRejectedValueOnce(new Error('Wear unavailable'));
  listener('onActiveWorkoutDataChanged')({ path: '/unrelated', payload: '{}' });
  await new Promise((resolve) => setTimeout(resolve, 0));

  mockGetDirty.mockRejectedValueOnce(new Error('Wear unavailable'));
  mockChangeListener!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(WearSync.addListener).toHaveBeenCalled();
});
