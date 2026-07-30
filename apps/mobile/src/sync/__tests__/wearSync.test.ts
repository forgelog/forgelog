import WearSync from 'wear-sync';

import { mobileStore } from '../../db/mobileStore';
import {
  initWearSync,
  publishSyncSnapshot,
  publishWorkoutMailbox,
  refreshWorkoutMailbox,
} from '../wearSync';
import { subscribeWorkoutMailboxApplied } from '../workoutMailboxSignal';

jest.mock('wear-sync', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn(),
    publishSnapshot: jest.fn().mockResolvedValue(undefined),
    publishWorkoutMailbox: jest.fn().mockResolvedValue(undefined),
    getPeerWorkoutMailbox: jest.fn().mockResolvedValue(null),
  },
}));

const mockAddListener = WearSync.addListener as jest.Mock;
const mockPublishSnapshot = WearSync.publishSnapshot as jest.Mock;
const mockPublishWorkoutMailbox = WearSync.publishWorkoutMailbox as jest.Mock;
const mockGetPeerWorkoutMailbox = WearSync.getPeerWorkoutMailbox as jest.Mock;
const mockGetSyncSnapshot = jest.spyOn(mobileStore.sync, 'getSnapshot');
const mockApplyWatchMailbox = jest.spyOn(mobileStore.sync, 'applyWatchWorkoutMailbox');
const mockGetDesiredMailbox = jest.spyOn(mobileStore.sync, 'getDesiredWorkoutMailbox');

function getListener(event: string): (arg: any) => unknown {
  const call = mockAddListener.mock.calls.find(([name]) => name === event);
  if (!call) throw new Error(`no listener registered for ${event}`);
  return call[1];
}

initWearSync();
const onPeerWorkoutMailbox = getListener('onPeerWorkoutMailbox');
const onSyncRequested = getListener('onSyncRequested');

beforeEach(() => {
  mockGetSyncSnapshot.mockReset().mockResolvedValue({
    protocol_version: 2,
    routines: [],
    personalRecords: [],
    profile: {
      name: '',
      sex: null,
      birth_date: null,
      height_cm: null,
      bodyweight_kg: null,
    },
  });
  mockGetDesiredMailbox.mockReset().mockResolvedValue({
    protocol_version: 1,
    candidate: null,
    watch_receipt: null,
  });
  mockApplyWatchMailbox.mockReset().mockResolvedValue(true);
  mockPublishSnapshot.mockReset().mockResolvedValue(undefined);
  mockPublishWorkoutMailbox.mockReset().mockResolvedValue(undefined);
  mockGetPeerWorkoutMailbox.mockReset().mockResolvedValue(null);
});

test('listeners are wired once', () => {
  mockAddListener.mockClear();
  initWearSync();
  expect(mockAddListener).not.toHaveBeenCalled();
});

test('sync requests publish a fresh reference snapshot', async () => {
  onSyncRequested(undefined);
  await Promise.resolve();
  await Promise.resolve();

  expect(mockGetSyncSnapshot).toHaveBeenCalledTimes(1);
  expect(mockPublishSnapshot).toHaveBeenCalledTimes(1);
});

test('peer mailbox events use the persisted reducer then publish committed desired state', async () => {
  const mailbox = { protocol_version: 1, candidate: null, watch_receipt: null };
  const applied = jest.fn();
  const unsubscribe = subscribeWorkoutMailboxApplied(applied);

  await onPeerWorkoutMailbox({ payload: JSON.stringify(mailbox) });

  expect(mockApplyWatchMailbox).toHaveBeenCalledWith(mailbox);
  expect(mockPublishWorkoutMailbox).toHaveBeenCalledWith(JSON.stringify(mailbox));
  expect(applied).toHaveBeenCalledTimes(1);
  unsubscribe();
});

test('foreground refresh reads and reduces the durable peer mailbox', async () => {
  const mailbox = { protocol_version: 1, candidate: null, watch_receipt: null };
  mockGetPeerWorkoutMailbox.mockResolvedValueOnce(JSON.stringify(mailbox));

  await refreshWorkoutMailbox();

  expect(mockApplyWatchMailbox).toHaveBeenCalledWith(mailbox);
  expect(mockPublishWorkoutMailbox).toHaveBeenCalledWith(JSON.stringify(mailbox));
});

test('unparseable peer payload is dropped', async () => {
  await expect(onPeerWorkoutMailbox({ payload: 'not-json{{' })).resolves.toBe(false);
  expect(mockApplyWatchMailbox).not.toHaveBeenCalled();
});

test('publisher reads durable desired state and swallows transport failure', async () => {
  mockPublishWorkoutMailbox.mockRejectedValueOnce(new Error('offline'));
  await expect(publishWorkoutMailbox()).resolves.toBeUndefined();
  expect(mockGetDesiredMailbox).toHaveBeenCalled();
});

test('reference snapshot publication remains best effort', async () => {
  mockPublishSnapshot.mockRejectedValueOnce(new Error('offline'));
  await expect(publishSyncSnapshot()).resolves.toBeUndefined();
});
