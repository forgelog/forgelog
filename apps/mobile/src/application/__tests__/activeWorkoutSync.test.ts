import { getDb, resetDbForTests } from '../../db/index';
import { finishWorkoutWithRoutineAction, getWorkoutFinishPlan, startOrResumeWorkout } from '../activeWorkout';
import {
  acknowledgeActiveWorkoutState,
  applyRemoteActiveWorkoutMutation,
  getActiveWorkoutSyncStatus,
  getActiveWorkoutConflicts,
  getDirtyActiveWorkoutPublications,
  markActiveWorkoutResultPublished,
  markActiveWorkoutStatePublished,
  resolveActiveWorkoutConflict,
  rejectMalformedActiveWorkoutMutation,
} from '../activeWorkoutSync';
import {
  ACTIVE_WORKOUT_PROTOCOL_VERSION,
  deriveConflictKeys,
  type ActiveWorkoutMutation,
  type ActiveWorkoutOperation,
} from '../../sync/activeWorkoutProtocol';

beforeEach(() => resetDbForTests());

async function remoteMutation(
  workoutId: string,
  operation: ActiveWorkoutOperation,
  overrides: Partial<ActiveWorkoutMutation> = {}
): Promise<ActiveWorkoutMutation> {
  const status = await getActiveWorkoutSyncStatus();
  return {
    protocol_version: ACTIVE_WORKOUT_PROTOCOL_VERSION,
    operation_id: 'operation-1',
    device_id: 'watch-1',
    device_sequence: 1,
    coordinator_epoch: status.coordinatorEpoch,
    workout_id: workoutId,
    base_revision: status.revision,
    predecessor_operation_id: null,
    conflict_keys: deriveConflictKeys(operation, workoutId),
    created_at: '2026-07-23T10:00:00Z',
    operation,
    ...overrides,
  };
}

test('a phone start atomically advances canonical revision and dirty publication state', async () => {
  const { workout } = await startOrResumeWorkout();
  await expect(getActiveWorkoutSyncStatus()).resolves.toMatchObject({
    revision: 1,
    lifecycle: 'active',
    workoutId: workout.id,
    pendingStateRevision: 1,
  });
});

test('remote operations are gapless, idempotent, and reject path reuse with different bytes', async () => {
  const { workout } = await startOrResumeWorkout();
  const operation = { type: 'rename_workout' as const, name: 'Watch Name' };
  const mutation = {
    protocol_version: ACTIVE_WORKOUT_PROTOCOL_VERSION,
    operation_id: 'operation-1',
    device_id: 'watch-1',
    device_sequence: 1,
    coordinator_epoch: (await getActiveWorkoutSyncStatus()).coordinatorEpoch,
    workout_id: workout.id,
    base_revision: 1,
    predecessor_operation_id: null,
    conflict_keys: deriveConflictKeys(operation, workout.id),
    created_at: '2026-07-23T10:00:00Z',
    operation,
  };

  await expect(applyRemoteActiveWorkoutMutation(mutation)).resolves.toMatchObject({
    status: 'accepted',
    canonical_revision: 2,
  });
  await expect(applyRemoteActiveWorkoutMutation(mutation)).resolves.toMatchObject({
    status: 'accepted',
    canonical_revision: 2,
    idempotent: true,
  });
  await expect(
    applyRemoteActiveWorkoutMutation({ ...mutation, operation: { ...operation, name: 'Different' } })
  ).resolves.toMatchObject({ status: 'rejected', reason: 'sequence_payload_mismatch' });

  const db = await getDb();
  await expect(
    applyRemoteActiveWorkoutMutation({
      ...mutation,
      operation_id: 'operation-3',
      device_sequence: 3,
      predecessor_operation_id: 'operation-1',
    })
  ).resolves.toMatchObject({ status: 'blocked_by_predecessor', reason: 'sequence_gap' });
  await expect(
    db.getFirstAsync<{ name: string }>('SELECT name FROM workouts WHERE id = $id', {
      $id: workout.id,
    })
  ).resolves.toEqual({ name: 'Watch Name' });
});

test('stale same-field watch edit is rejected after a phone edit', async () => {
  const { workout } = await startOrResumeWorkout();
  const db = await getDb();
  await db.runAsync('UPDATE workouts SET name = $name WHERE id = $id', {
    $name: 'Phone Name',
    $id: workout.id,
  });
  await db.runAsync(
    `UPDATE active_workout_coordinator
        SET revision = 2, revision_committed_at = '2026-07-23T10:00:00Z', publish_needed_revision = 2`
  );
  await db.runAsync(
    `INSERT OR REPLACE INTO active_workout_conflict_keys
       (conflict_key, revision, operation_id, device_id, device_sequence)
     VALUES ($key, 2, NULL, 'phone', NULL)`,
    { $key: `workout:${workout.id}:name` }
  );
  const operation = { type: 'rename_workout' as const, name: 'Watch Name' };
  await expect(
    applyRemoteActiveWorkoutMutation({
      protocol_version: 1,
      operation_id: 'stale-1',
      device_id: 'watch-1',
      device_sequence: 1,
      coordinator_epoch: (await getActiveWorkoutSyncStatus()).coordinatorEpoch,
      workout_id: workout.id,
      base_revision: 1,
      predecessor_operation_id: null,
      conflict_keys: deriveConflictKeys(operation, workout.id),
      created_at: '2026-07-23T10:01:00Z',
      operation,
    })
  ).resolves.toMatchObject({ status: 'rejected', reason: 'conflict' });
});

test('independent watch start remains durable until the phone explicitly keeps or applies it', async () => {
  await startOrResumeWorkout();
  const status = await getActiveWorkoutSyncStatus();
  const watchWorkout = {
    id: 'watch-workout', routine_id: null, name: 'Watch Session',
    started_at: '2026-07-23T11:00:00Z', ended_at: null, notes: null,
    bodyweight_kg: null, routine_structure_version: null, exercises: [],
  };
  const operation = { type: 'start_workout' as const, workout: watchWorkout };
  const mutation = {
    protocol_version: 1 as const,
    operation_id: 'watch-start', device_id: 'watch-1', device_sequence: 1,
    coordinator_epoch: status.coordinatorEpoch, workout_id: watchWorkout.id,
    base_revision: status.revision, predecessor_operation_id: null,
    conflict_keys: deriveConflictKeys(operation, watchWorkout.id),
    created_at: '2026-07-23T11:00:00Z', operation,
  };

  await expect(applyRemoteActiveWorkoutMutation(mutation)).resolves.toMatchObject({
    status: 'needs_resolution',
  });
  await expect(getActiveWorkoutConflicts()).resolves.toHaveLength(1);

  await resolveActiveWorkoutConflict('watch-start', 'operation_reapplied', status.revision);
  const db = await getDb();
  await expect(db.getFirstAsync<{ name: string }>(
    'SELECT name FROM workouts WHERE ended_at IS NULL'
  )).resolves.toEqual({ name: 'Watch Session' });
  await expect(getActiveWorkoutConflicts()).resolves.toEqual([]);
});

test('reapplying a recovery proposal replaces the phone workout with the recovered snapshot', async () => {
  const { workout: phoneWorkout } = await startOrResumeWorkout();
  const status = await getActiveWorkoutSyncStatus();
  const recoveredWorkout = {
    id: 'recovered-workout', routine_id: null, name: 'Recovered Session',
    started_at: '2026-07-23T08:00:00Z', ended_at: null, notes: 'from watch',
    bodyweight_kg: null, routine_structure_version: null, exercises: [],
  };
  const operation = {
    type: 'recover_workout' as const,
    recovery_lifecycle: 'active' as const,
    workout: recoveredWorkout,
    old_epoch: 'old-phone-epoch',
    old_operation_ids: ['old-operation'],
  };

  await expect(applyRemoteActiveWorkoutMutation({
    protocol_version: 1,
    operation_id: 'recover-watch-workout',
    device_id: 'watch-1',
    device_sequence: 1,
    coordinator_epoch: status.coordinatorEpoch,
    workout_id: recoveredWorkout.id,
    base_revision: status.revision,
    predecessor_operation_id: null,
    conflict_keys: deriveConflictKeys(operation, recoveredWorkout.id),
    created_at: '2026-07-23T12:00:00Z',
    operation,
  })).resolves.toMatchObject({ status: 'needs_resolution' });

  await resolveActiveWorkoutConflict('recover-watch-workout', 'operation_reapplied', status.revision);

  const db = await getDb();
  await expect(db.getFirstAsync<{ id: string; name: string }>(
    'SELECT id, name FROM workouts WHERE ended_at IS NULL'
  )).resolves.toEqual({ id: recoveredWorkout.id, name: recoveredWorkout.name });
  await expect(db.getFirstAsync('SELECT id FROM workouts WHERE id = $id', {
    $id: phoneWorkout.id,
  })).resolves.toBeNull();
});

test('malformed payload at a valid sequence is finalized so later sequences can proceed', async () => {
  const { workout } = await startOrResumeWorkout();
  const status = await getActiveWorkoutSyncStatus();
  await expect(rejectMalformedActiveWorkoutMutation({
    coordinatorEpoch: status.coordinatorEpoch,
    deviceId: 'watch-1',
    deviceSequence: 1,
  }, '{bad-json')).resolves.toMatchObject({ status: 'rejected', reason: 'malformed_payload' });
  await expect(getActiveWorkoutConflicts()).resolves.toEqual([]);

  const operation = { type: 'rename_workout' as const, name: 'After malformed' };
  await expect(applyRemoteActiveWorkoutMutation({
    protocol_version: 1,
    operation_id: 'operation-2',
    device_id: 'watch-1',
    device_sequence: 2,
    coordinator_epoch: status.coordinatorEpoch,
    workout_id: workout.id,
    base_revision: status.revision,
    predecessor_operation_id: null,
    conflict_keys: deriveConflictKeys(operation, workout.id),
    created_at: '2026-07-23T12:00:00Z',
    operation,
  })).resolves.toMatchObject({ status: 'accepted' });
});

test('dirty publications survive failed compare-and-set clears and include terminal state', async () => {
  await expect(getDirtyActiveWorkoutPublications()).resolves.toEqual({ state: null, results: [] });

  const { workout } = await startOrResumeWorkout();
  await expect(getDirtyActiveWorkoutPublications()).resolves.toMatchObject({
    state: { lifecycle: 'active', workout_id: workout.id },
    results: [],
  });
  await markActiveWorkoutStatePublished(99);
  await expect(getDirtyActiveWorkoutPublications()).resolves.toMatchObject({
    state: { revision: 1 },
  });
  await markActiveWorkoutStatePublished(1);
  await expect(getDirtyActiveWorkoutPublications()).resolves.toMatchObject({ state: null });

  const rename = await remoteMutation(workout.id, { type: 'rename_workout', name: 'Watch Name' });
  await applyRemoteActiveWorkoutMutation(rename);
  await expect(getDirtyActiveWorkoutPublications()).resolves.toMatchObject({
    state: { revision: 2 },
    results: [expect.objectContaining({ operation_id: rename.operation_id })],
  });
  await markActiveWorkoutResultPublished(rename.operation_id);
  await expect(getDirtyActiveWorkoutPublications()).resolves.toMatchObject({ results: [] });

  await finishWorkoutWithRoutineAction(workout.id, { kind: 'finish-only' });
  await expect(getDirtyActiveWorkoutPublications()).resolves.toMatchObject({
    state: {
      lifecycle: 'finished',
      terminal: expect.objectContaining({ operation_id: null, origin_device_id: null }),
    },
  });
});

test('operation identity, receipt replay, epoch, and finalized sequence checks are durable', async () => {
  const { workout } = await startOrResumeWorkout();
  const first = await remoteMutation(workout.id, { type: 'rename_workout', name: 'First' });
  await expect(applyRemoteActiveWorkoutMutation(first)).resolves.toMatchObject({ status: 'accepted' });

  await expect(applyRemoteActiveWorkoutMutation({
    ...first, device_sequence: 2,
  })).resolves.toMatchObject({ status: 'rejected', reason: 'operation_id_reused' });
  await expect(applyRemoteActiveWorkoutMutation({
    ...first, operation_id: 'old-sequence', device_sequence: 0,
    operation: { type: 'rename_workout', name: 'Old' },
  })).resolves.toMatchObject({ status: 'blocked_by_predecessor', reason: 'sequence_already_finalized' });
  await expect(applyRemoteActiveWorkoutMutation({
    ...first, operation_id: 'wrong-epoch', device_sequence: 2, coordinator_epoch: 'other-epoch',
  })).resolves.toMatchObject({ status: 'rejected', reason: 'coordinator_epoch_mismatch' });

  const db = await getDb();
  await db.runAsync('DELETE FROM active_workout_operations WHERE operation_id = $id', {
    $id: first.operation_id,
  });
  await expect(applyRemoteActiveWorkoutMutation(first)).resolves.toMatchObject({
    status: 'accepted', idempotent: true,
  });
  await expect(applyRemoteActiveWorkoutMutation({ ...first, operation_id: 'receipt-mismatch' }))
    .resolves.toMatchObject({ status: 'rejected', reason: 'sequence_payload_mismatch' });
});

test('malformed sequence handling preserves operation identity and respects epoch and gaps', async () => {
  const { workout } = await startOrResumeWorkout();
  const status = await getActiveWorkoutSyncStatus();

  await expect(rejectMalformedActiveWorkoutMutation({
    coordinatorEpoch: 'other-epoch', deviceId: 'watch-1', deviceSequence: 1,
  }, JSON.stringify({ operation_id: 'malformed-id' }))).resolves.toMatchObject({
    status: 'rejected', reason: 'coordinator_epoch_mismatch', operation_id: 'malformed-id',
  });
  await expect(rejectMalformedActiveWorkoutMutation({
    coordinatorEpoch: status.coordinatorEpoch, deviceId: 'watch-1', deviceSequence: 2,
  }, '{}')).resolves.toMatchObject({ status: 'blocked_by_predecessor', reason: 'sequence_gap' });

  await acknowledgeActiveWorkoutState({
    device_id: 'watch-1', coordinator_epoch: 'other-epoch', revision: 99,
  });
  await acknowledgeActiveWorkoutState({
    device_id: 'watch-1', coordinator_epoch: status.coordinatorEpoch, revision: status.revision,
  });
  const db = await getDb();
  await expect(db.getFirstAsync<{ acknowledged_revision: number }>(
    'SELECT acknowledged_revision FROM active_workout_devices WHERE coordinator_epoch = $epoch AND device_id = $deviceId',
    { $epoch: status.coordinatorEpoch, $deviceId: 'watch-1' }
  )).resolves.toEqual({ acknowledged_revision: status.revision });

  await expect(getWorkoutFinishPlan('missing-workout')).rejects.toThrow('Workout not found');
  await expect(getActiveWorkoutSyncStatus()).resolves.toMatchObject({ workoutId: workout.id });
});

test('conflict resolution rejects stale reviews and can explicitly keep the phone value', async () => {
  const { workout } = await startOrResumeWorkout();
  const status = await getActiveWorkoutSyncStatus();
  const db = await getDb();
  await db.runAsync('UPDATE workouts SET name = $name WHERE id = $id', {
    $name: 'Phone Name', $id: workout.id,
  });
  await db.runAsync(
    `UPDATE active_workout_coordinator
        SET revision = 2, revision_committed_at = '2026-07-23T10:00:00Z'`
  );
  await db.runAsync(
    `INSERT OR REPLACE INTO active_workout_conflict_keys
       (conflict_key, revision, operation_id, device_id, device_sequence)
     VALUES ($key, 2, NULL, 'phone', NULL)`,
    { $key: `workout:${workout.id}:name` }
  );
  const mutation = await remoteMutation(
    workout.id,
    { type: 'rename_workout', name: 'Watch Name' },
    { base_revision: status.revision }
  );
  await expect(applyRemoteActiveWorkoutMutation(mutation)).resolves.toMatchObject({
    status: 'rejected', reason: 'conflict',
  });
  await expect(resolveActiveWorkoutConflict(mutation.operation_id, 'operation_reapplied', 1))
    .rejects.toThrow('canonical_revision_changed');
  await expect(resolveActiveWorkoutConflict(mutation.operation_id, 'canonical_kept', 1))
    .resolves.toMatchObject({ status: 'resolved', resolution: 'canonical_kept' });
  await expect(resolveActiveWorkoutConflict('missing', 'canonical_kept', 2))
    .rejects.toThrow('Active workout conflict not found');
});
