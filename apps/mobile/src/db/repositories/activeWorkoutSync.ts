import type { DatabaseExecutor } from '../executor';
import { id } from '../id';
import * as Crypto from 'expo-crypto';

import {
  ACTIVE_WORKOUT_PROTOCOL_VERSION,
  applyActiveWorkoutMutation,
  assertActiveWorkoutPayloadSize,
  deriveConflictKeys,
  normalizedActiveWorkoutJson,
  parseActiveWorkoutMutation,
  type ActiveWorkoutCanonicalState,
  type ActiveWorkoutMutation,
  type ActiveWorkoutOperation,
  type ActiveWorkoutResult,
  type ActiveWorkoutSnapshot,
} from '../../sync/activeWorkoutProtocol';
import type { WorkoutDetail } from '../types';
import { getWorkoutDetail } from './workouts';
import { clearSetReference, clearSetReferencesForWorkoutExercise, clearSetReferencesForWorkout, replaceRecordStateForExercise } from './personalRecords';

export type ActiveWorkoutSyncStatus = {
  installationId: string;
  coordinatorEpoch: string;
  revision: number;
  lifecycle: 'none' | 'active' | 'finished' | 'discarded';
  workoutId: string | null;
  pendingStateRevision: number | null;
  legacyWorkoutId: string | null;
};

export type ActiveWorkoutConflict = {
  operationId: string;
  status: string;
  mutation: ActiveWorkoutMutation;
  result: ActiveWorkoutResult;
};

type CoordinatorRow = {
  installation_id: string;
  coordinator_epoch: string;
  revision: number;
  lifecycle: ActiveWorkoutSyncStatus['lifecycle'];
  workout_id: string | null;
  publish_needed_revision: number | null;
  legacy_workout_id: string | null;
};

export async function ensureCoordinator(
  db: DatabaseExecutor,
  preexistingWorkoutId: string | null = null
): Promise<ActiveWorkoutSyncStatus> {
  const existing = await getStatus(db);
  if (existing) return existing;
  const now = new Date().toISOString();
  const installationId = id();
  const coordinatorEpoch = id();
  await db.runAsync(
    `INSERT INTO active_workout_coordinator
       (singleton, installation_id, coordinator_epoch, revision, revision_committed_at,
        lifecycle, workout_id, publish_needed_revision, legacy_workout_id, initialized_at)
     VALUES (1, $installationId, $epoch, 0, $now, 'none', NULL, 0, $legacyWorkoutId, $now)`,
    {
      $installationId: installationId,
      $epoch: coordinatorEpoch,
      $now: now,
      $legacyWorkoutId: preexistingWorkoutId,
    }
  );
  return {
    installationId,
    coordinatorEpoch,
    revision: 0,
    lifecycle: 'none',
    workoutId: null,
    pendingStateRevision: 0,
    legacyWorkoutId: preexistingWorkoutId,
  };
}

export async function getStatus(db: DatabaseExecutor): Promise<ActiveWorkoutSyncStatus | null> {
  const row = await db.getFirstAsync<CoordinatorRow>(
    `SELECT installation_id, coordinator_epoch, revision, lifecycle, workout_id,
            publish_needed_revision, legacy_workout_id
       FROM active_workout_coordinator WHERE singleton = 1`
  );
  return row
    ? {
        installationId: row.installation_id,
        coordinatorEpoch: row.coordinator_epoch,
        revision: row.revision,
        lifecycle: row.lifecycle,
        workoutId: row.workout_id,
        pendingStateRevision: row.publish_needed_revision,
        legacyWorkoutId: row.legacy_workout_id,
      }
    : null;
}

export async function commitLocalRevision(
  db: DatabaseExecutor,
  input: {
    workoutId: string | null;
    lifecycle: ActiveWorkoutSyncStatus['lifecycle'];
    conflictKeys: string[];
  }
): Promise<number | null> {
  const status = await ensureCoordinator(db);
  if (status.legacyWorkoutId && status.legacyWorkoutId === input.workoutId) return null;
  const revision = status.revision + 1;
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE active_workout_coordinator
        SET revision = $revision, revision_committed_at = $now, lifecycle = $lifecycle,
            workout_id = $workoutId, publish_needed_revision = $revision
      WHERE singleton = 1`,
    {
      $revision: revision,
      $now: now,
      $lifecycle: input.lifecycle,
      $workoutId: input.workoutId,
    }
  );
  for (const conflictKey of input.conflictKeys) {
    await db.runAsync(
      `INSERT INTO active_workout_conflict_keys
         (conflict_key, revision, operation_id, device_id, device_sequence)
       VALUES ($key, $revision, NULL, 'phone', NULL)
       ON CONFLICT(conflict_key) DO UPDATE SET
         revision = excluded.revision, operation_id = NULL,
         device_id = 'phone', device_sequence = NULL`,
      { $key: conflictKey, $revision: revision }
    );
  }
  return revision;
}

export async function clearLegacyWorkout(db: DatabaseExecutor, workoutId: string): Promise<void> {
  await db.runAsync(
    `UPDATE active_workout_coordinator
        SET legacy_workout_id = NULL, lifecycle = 'none', workout_id = NULL,
            publish_needed_revision = revision
      WHERE singleton = 1 AND legacy_workout_id = $workoutId`,
    { $workoutId: workoutId }
  );
}

export async function markStatePublished(
  db: DatabaseExecutor,
  publishedRevision: number
): Promise<void> {
  await db.runAsync(
    `UPDATE active_workout_coordinator SET publish_needed_revision = NULL
      WHERE singleton = 1 AND publish_needed_revision = $revision`,
    { $revision: publishedRevision }
  );
}

export async function markResultPublished(
  db: DatabaseExecutor,
  operationId: string
): Promise<void> {
  await db.runAsync(
    `UPDATE active_workout_operations SET publish_needed = 0
      WHERE operation_id = $operationId`,
    { $operationId: operationId }
  );
}

export async function acknowledgeWatchState(
  db: DatabaseExecutor,
  acknowledgement: { device_id: string; coordinator_epoch: string; revision: number }
): Promise<void> {
  const status = await ensureCoordinator(db);
  if (acknowledgement.coordinator_epoch !== status.coordinatorEpoch) return;
  await db.runAsync(
    `INSERT INTO active_workout_devices
       (coordinator_epoch, device_id, last_finalized_sequence, last_seen_at, acknowledged_revision)
     VALUES ($epoch, $deviceId, 0, $now, $revision)
     ON CONFLICT(coordinator_epoch, device_id) DO UPDATE SET
       last_seen_at = excluded.last_seen_at,
       acknowledged_revision = MAX(acknowledged_revision, excluded.acknowledged_revision)`,
    { $epoch: acknowledgement.coordinator_epoch, $deviceId: acknowledgement.device_id,
      $now: new Date().toISOString(), $revision: acknowledgement.revision }
  );
}

export async function capturePrBaselinesForWorkout(
  db: DatabaseExecutor,
  workoutId: string
): Promise<void> {
  const occurrences = await db.getAllAsync<{ id: string; exercise_id: string }>(
    'SELECT id, exercise_id FROM workout_exercises WHERE workout_id = $workoutId',
    { $workoutId: workoutId }
  );
  for (const occurrence of occurrences) {
    const records = await db.getAllAsync<{ record_type: string; value: number }>(
      'SELECT record_type, value FROM personal_records WHERE exercise_id = $exerciseId',
      { $exerciseId: occurrence.exercise_id }
    );
    for (const record of records) await db.runAsync(
      `INSERT OR IGNORE INTO active_workout_pr_baselines
         (workout_exercise_id, record_type, value) VALUES ($id, $type, $value)`,
      { $id: occurrence.id, $type: record.record_type, $value: record.value }
    );
  }
}

export async function addAlertedRecordTypes(
  db: DatabaseExecutor,
  workoutExerciseId: string,
  recordTypes: readonly string[]
): Promise<void> {
  for (const recordType of recordTypes) await db.runAsync(
    `INSERT OR IGNORE INTO active_workout_alerts (workout_exercise_id, record_type)
     VALUES ($id, $type)`,
    { $id: workoutExerciseId, $type: recordType }
  );
}

export async function listConflicts(db: DatabaseExecutor): Promise<ActiveWorkoutConflict[]> {
  const rows = await db.getAllAsync<{
    operation_id: string;
    status: string;
    payload_json: string;
    result_json: string;
  }>(
    `SELECT operation_id, status, payload_json, result_json
       FROM active_workout_operations
      WHERE status IN ('rejected', 'needs_resolution', 'blocked_by_predecessor')
      ORDER BY coordinator_epoch, device_id, device_sequence`
  );
  return rows.flatMap((row) => {
    try {
      const mutation = parseActiveWorkoutMutation(JSON.parse(row.payload_json));
      if (!mutation) return [];
      return [{
        operationId: row.operation_id,
        status: row.status,
        mutation,
        result: JSON.parse(row.result_json) as ActiveWorkoutResult,
      }];
    } catch {
      return [];
    }
  });
}

export async function resolveConflict(
  db: DatabaseExecutor,
  operationId: string,
  resolution: 'canonical_kept' | 'operation_reapplied',
  reviewedRevision: number
): Promise<ActiveWorkoutResult> {
  const conflict = (await listConflicts(db)).find((item) => item.operationId === operationId);
  if (!conflict) throw new Error('Active workout conflict not found');
  const status = await ensureCoordinator(db);
  if (resolution === 'operation_reapplied' && status.revision !== reviewedRevision) {
    throw new Error('canonical_revision_changed');
  }
  const mutation = parseActiveWorkoutMutation(conflict.mutation);
  if (!mutation) throw new Error('invalid_conflict_payload');
  let revision = status.revision;
  if (resolution === 'operation_reapplied') {
    if (mutation.operation.type === 'recover_workout' &&
        mutation.operation.recovery_lifecycle !== 'discarded' &&
        !mutation.operation.workout) {
      throw new Error('recovery_snapshot_missing');
    }
    if (mutation.operation.type === 'start_workout' || mutation.operation.type === 'recover_workout') {
      const active = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM workouts WHERE ended_at IS NULL LIMIT 1'
      );
      if (active) {
        await clearSetReferencesForWorkout(db, active.id);
        await db.runAsync('DELETE FROM workouts WHERE id = $id', { $id: active.id });
      }
      const snapshotId = mutation.operation.workout?.id;
      if (snapshotId && snapshotId !== active?.id) {
        await clearSetReferencesForWorkout(db, snapshotId);
        await db.runAsync('DELETE FROM workouts WHERE id = $id', { $id: snapshotId });
      }
    }
    revision += 1;
    await applyOperationToDatabase(db, mutation.operation, mutation.workout_id, revision, mutation.operation_id);
    const lifecycle = mutation.operation.type === 'recover_workout'
      ? mutation.operation.recovery_lifecycle
      : mutation.operation.type === 'finish_workout' ? 'finished'
      : mutation.operation.type === 'discard_workout' ? 'discarded' : 'active';
    const canonicalWorkoutId = lifecycle === 'discarded' ? null : mutation.workout_id;
    await db.runAsync(
      `UPDATE active_workout_coordinator
          SET revision = $revision, revision_committed_at = $now, lifecycle = $lifecycle,
              workout_id = $workoutId, publish_needed_revision = $revision
        WHERE singleton = 1`,
      { $revision: revision, $now: new Date().toISOString(), $lifecycle: lifecycle, $workoutId: canonicalWorkoutId }
    );
    for (const key of deriveConflictKeys(mutation.operation, mutation.workout_id)) {
      await db.runAsync(
        `INSERT INTO active_workout_conflict_keys
           (conflict_key, revision, operation_id, device_id, device_sequence, resolution_audit_id)
         VALUES ($key, $revision, $operationId, $deviceId, $sequence, $auditId)
         ON CONFLICT(conflict_key) DO UPDATE SET revision = excluded.revision,
           operation_id = excluded.operation_id, device_id = excluded.device_id,
           device_sequence = excluded.device_sequence, resolution_audit_id = excluded.resolution_audit_id`,
        { $key: key, $revision: revision, $operationId: mutation.operation_id,
          $deviceId: mutation.device_id, $sequence: mutation.device_sequence, $auditId: id() }
      );
    }
  } else {
    await db.runAsync(
      `UPDATE active_workout_coordinator SET publish_needed_revision = $revision
        WHERE singleton = 1`,
      { $revision: revision }
    );
  }
  const result: ActiveWorkoutResult = {
    protocol_version: ACTIVE_WORKOUT_PROTOCOL_VERSION,
    coordinator_epoch: mutation.coordinator_epoch,
    device_id: mutation.device_id,
    device_sequence: mutation.device_sequence,
    operation_id: mutation.operation_id,
    status: 'resolved',
    canonical_revision: revision,
    resolution,
    resolution_revision: revision,
  };
  await db.runAsync(
    `UPDATE active_workout_operations
        SET status = 'resolved', result_json = $resultJson, accepted_revision = $revision,
            publish_needed = 1
      WHERE operation_id = $operationId`,
    { $resultJson: JSON.stringify(result), $revision: revision, $operationId: operationId }
  );
  await db.runAsync(
    `INSERT OR REPLACE INTO active_workout_receipts
       (coordinator_epoch, device_id, device_sequence, operation_id, payload_hash,
        disposition, canonical_revision, minimal_result_json)
     SELECT coordinator_epoch, device_id, device_sequence, operation_id, payload_hash,
            'resolved', $revision, $resultJson
       FROM active_workout_operations WHERE operation_id = $operationId`,
    { $revision: revision, $resultJson: JSON.stringify(result), $operationId: operationId }
  );
  await db.runAsync(
    `INSERT INTO active_workout_devices
       (coordinator_epoch, device_id, last_finalized_sequence, last_seen_at, acknowledged_revision)
     VALUES ($epoch, $deviceId, $sequence, $now, 0)
     ON CONFLICT(coordinator_epoch, device_id) DO UPDATE SET
       last_finalized_sequence = MAX(last_finalized_sequence, excluded.last_finalized_sequence),
       last_seen_at = excluded.last_seen_at`,
    { $epoch: mutation.coordinator_epoch, $deviceId: mutation.device_id,
      $sequence: mutation.device_sequence, $now: new Date().toISOString() }
  );
  return result;
}

export async function getCanonicalState(
  db: DatabaseExecutor
): Promise<ActiveWorkoutCanonicalState> {
  const active = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM workouts WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
  );
  const status = await ensureCoordinator(db, active?.id ?? null);
  const detail = status.workoutId ? await getWorkoutDetail(db, status.workoutId) : null;
  return {
    protocol_version: ACTIVE_WORKOUT_PROTOCOL_VERSION,
    coordinator_id: status.installationId,
    coordinator_epoch: status.coordinatorEpoch,
    revision: status.revision,
    revision_committed_at:
      (await db.getFirstAsync<{ revision_committed_at: string }>(
        'SELECT revision_committed_at FROM active_workout_coordinator WHERE singleton = 1'
      ))?.revision_committed_at ?? new Date(0).toISOString(),
    lifecycle: status.lifecycle,
    workout_id: status.workoutId,
    workout: detail ? await detailToSnapshot(db, detail) : null,
    terminal: status.lifecycle === 'finished' && detail?.ended_at
      ? { ended_at: detail.ended_at, operation_id: null, origin_device_id: null }
      : null,
  };
}

export async function listDirtyPublications(db: DatabaseExecutor): Promise<{
  state: ActiveWorkoutCanonicalState | null;
  results: ActiveWorkoutResult[];
}> {
  const status = await getStatus(db);
  const rows = await db.getAllAsync<{ result_json: string }>(
    `SELECT result_json FROM active_workout_operations
      WHERE publish_needed = 1 ORDER BY coordinator_epoch, device_id, device_sequence`
  );
  return {
    state: status?.pendingStateRevision == null ? null : await getCanonicalState(db),
    results: rows.map((row) => JSON.parse(row.result_json) as ActiveWorkoutResult),
  };
}

export async function applyRemoteMutation(
  db: DatabaseExecutor,
  mutation: ActiveWorkoutMutation
): Promise<ActiveWorkoutResult> {
  assertActiveWorkoutPayloadSize(mutation);
  const canonical = await getCanonicalState(db);
  const payloadJson = normalizedActiveWorkoutJson(mutation);
  const payloadHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    payloadJson
  );
  const base = resultBase(canonical, mutation);

  const existingOperation = await db.getFirstAsync<{
    coordinator_epoch: string;
    device_id: string;
    device_sequence: number;
    payload_json: string | null;
    result_json: string;
  }>(
    `SELECT coordinator_epoch, device_id, device_sequence, payload_json, result_json
       FROM active_workout_operations WHERE operation_id = $operationId`,
    { $operationId: mutation.operation_id }
  );
  if (existingOperation) {
    if (
      existingOperation.coordinator_epoch !== mutation.coordinator_epoch ||
      existingOperation.device_id !== mutation.device_id ||
      existingOperation.device_sequence !== mutation.device_sequence
    ) return rejected(base, 'operation_id_reused', deriveConflictKeys(mutation.operation, mutation.workout_id));
    if (existingOperation.payload_json !== JSON.stringify(mutation)) {
      return rejected(base, 'sequence_payload_mismatch', deriveConflictKeys(mutation.operation, mutation.workout_id));
    }
    const existingResult = JSON.parse(existingOperation.result_json) as ActiveWorkoutResult;
    return existingResult.status === 'accepted'
      ? { ...existingResult, idempotent: true }
      : existingResult;
  }

  const sequenceReceipt = await db.getFirstAsync<{
    operation_id: string | null;
    payload_hash: string;
    minimal_result_json: string;
  }>(
    `SELECT operation_id, payload_hash, minimal_result_json
       FROM active_workout_receipts
      WHERE coordinator_epoch = $epoch AND device_id = $deviceId AND device_sequence = $sequence`,
    {
      $epoch: mutation.coordinator_epoch,
      $deviceId: mutation.device_id,
      $sequence: mutation.device_sequence,
    }
  );
  if (sequenceReceipt) {
    if (
      sequenceReceipt.operation_id !== mutation.operation_id ||
      sequenceReceipt.payload_hash !== payloadHash
    ) {
      return rejected(base, 'sequence_payload_mismatch', deriveConflictKeys(mutation.operation, mutation.workout_id));
    }
    const result = JSON.parse(sequenceReceipt.minimal_result_json) as ActiveWorkoutResult;
    return result.status === 'accepted' ? { ...result, idempotent: true } : result;
  }

  if (mutation.coordinator_epoch !== canonical.coordinator_epoch) {
    return rejected(base, 'coordinator_epoch_mismatch', deriveConflictKeys(mutation.operation, mutation.workout_id));
  }
  const device = await db.getFirstAsync<{ last_finalized_sequence: number }>(
    `SELECT last_finalized_sequence FROM active_workout_devices
      WHERE coordinator_epoch = $epoch AND device_id = $deviceId`,
    { $epoch: mutation.coordinator_epoch, $deviceId: mutation.device_id }
  );
  const nextSequence = (device?.last_finalized_sequence ?? 0) + 1;
  if (mutation.device_sequence !== nextSequence) {
    return {
      ...base,
      status: 'blocked_by_predecessor',
      reason: mutation.device_sequence > nextSequence ? 'sequence_gap' : 'sequence_already_finalized',
    };
  }
  if (mutation.operation.type === 'recover_workout') {
    return persistUnresolved(db, mutation, payloadHash, {
      ...base,
      status: 'needs_resolution',
      reason: 'coordinator_recovery_requires_resolution',
    });
  }

  const reduced = applyActiveWorkoutMutation(canonical, mutation);
  if (reduced.kind === 'conflict') {
    const result = reduced.reason === 'independent_active_workout'
      ? ({ ...base, status: 'needs_resolution', reason: reduced.reason } as const)
      : rejected(base, reduced.reason, reduced.conflict_keys);
    return result.status === 'needs_resolution'
      ? persistUnresolved(db, mutation, payloadHash, result)
      : finalize(db, mutation, payloadHash, result, null);
  }

  if (reduced.kind !== 'noop') {
    const conflicts: string[] = [];
    for (const key of deriveConflictKeys(mutation.operation, mutation.workout_id)) {
      if (key.startsWith('alerts:')) continue;
      const row = await db.getFirstAsync<{ revision: number; operation_id: string | null }>(
        'SELECT revision, operation_id FROM active_workout_conflict_keys WHERE conflict_key = $key',
        { $key: key }
      );
      if (
        row &&
        row.revision > mutation.base_revision &&
        !(row.operation_id && await predecessorReaches(db, mutation, row.operation_id))
      ) conflicts.push(key);
    }
    if (conflicts.length) {
      return finalize(db, mutation, payloadHash, rejected(base, 'conflict', conflicts), null);
    }
    await applyOperationToDatabase(db, mutation.operation, mutation.workout_id, canonical.revision + 1, mutation.operation_id);
  }

  const revision = reduced.kind === 'noop' ? canonical.revision : canonical.revision + 1;
  const result: ActiveWorkoutResult = {
    ...base,
    status: 'accepted',
    canonical_revision: revision,
    idempotent: reduced.kind === 'noop',
    ...(mutation.operation.type === 'finish_workout' && reduced.state.workout
      ? { terminal_workout: reduced.state.workout }
      : {}),
  };
  return finalize(db, mutation, payloadHash, result, reduced.kind === 'noop' ? null : {
    revision,
    lifecycle: reduced.state.lifecycle,
    workoutId: reduced.state.workout_id,
    conflictKeys: deriveConflictKeys(mutation.operation, mutation.workout_id),
  });
}

export async function rejectMalformedMutation(
  db: DatabaseExecutor,
  envelope: { coordinatorEpoch: string; deviceId: string; deviceSequence: number },
  payload: string
): Promise<ActiveWorkoutResult> {
  const canonical = await getCanonicalState(db);
  const operationId = (() => {
    try {
      const parsed = JSON.parse(payload) as { operation_id?: unknown };
      return typeof parsed.operation_id === 'string' ? parsed.operation_id : null;
    } catch { return null; }
  })();
  const base = {
    protocol_version: ACTIVE_WORKOUT_PROTOCOL_VERSION,
    coordinator_epoch: envelope.coordinatorEpoch,
    device_id: envelope.deviceId,
    device_sequence: envelope.deviceSequence,
    operation_id: operationId,
    canonical_revision: canonical.revision,
  } as const;
  if (envelope.coordinatorEpoch !== canonical.coordinator_epoch) {
    return { ...base, status: 'rejected', reason: 'coordinator_epoch_mismatch', conflict_keys: [] };
  }
  const device = await db.getFirstAsync<{ last_finalized_sequence: number }>(
    `SELECT last_finalized_sequence FROM active_workout_devices
      WHERE coordinator_epoch = $epoch AND device_id = $deviceId`,
    { $epoch: envelope.coordinatorEpoch, $deviceId: envelope.deviceId }
  );
  const next = (device?.last_finalized_sequence ?? 0) + 1;
  if (envelope.deviceSequence !== next) {
    return { ...base, status: 'blocked_by_predecessor', reason: 'sequence_gap' };
  }
  const result: ActiveWorkoutResult = {
    ...base,
    status: 'rejected',
    reason: 'malformed_payload',
    conflict_keys: [],
  };
  const diagnosticId = operationId ?? `malformed:${envelope.coordinatorEpoch}:${envelope.deviceId}:${envelope.deviceSequence}`;
  const payloadHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, payload);
  await db.runAsync(
    `INSERT OR REPLACE INTO active_workout_operations
       (operation_id, coordinator_epoch, device_id, device_sequence, payload_hash, payload_json,
        status, result_json, publish_needed)
     VALUES ($operationId, $epoch, $deviceId, $sequence, $hash, $payload,
             'rejected', $result, 1)`,
    { $operationId: diagnosticId, $epoch: envelope.coordinatorEpoch, $deviceId: envelope.deviceId,
      $sequence: envelope.deviceSequence, $hash: payloadHash, $payload: payload,
      $result: JSON.stringify(result) }
  );
  await db.runAsync(
    `INSERT OR REPLACE INTO active_workout_receipts
       (coordinator_epoch, device_id, device_sequence, operation_id, payload_hash,
        disposition, canonical_revision, minimal_result_json)
     VALUES ($epoch, $deviceId, $sequence, $operationId, $hash, 'rejected', $revision, $result)`,
    { $epoch: envelope.coordinatorEpoch, $deviceId: envelope.deviceId,
      $sequence: envelope.deviceSequence, $operationId: operationId, $hash: payloadHash,
      $revision: canonical.revision, $result: JSON.stringify(result) }
  );
  await db.runAsync(
    `INSERT INTO active_workout_devices
       (coordinator_epoch, device_id, last_finalized_sequence, last_seen_at, acknowledged_revision)
     VALUES ($epoch, $deviceId, $sequence, $now, 0)
     ON CONFLICT(coordinator_epoch, device_id) DO UPDATE SET
       last_finalized_sequence = excluded.last_finalized_sequence, last_seen_at = excluded.last_seen_at`,
    { $epoch: envelope.coordinatorEpoch, $deviceId: envelope.deviceId,
      $sequence: envelope.deviceSequence, $now: new Date().toISOString() }
  );
  return result;
}

async function detailToSnapshot(
  db: DatabaseExecutor,
  detail: WorkoutDetail
): Promise<ActiveWorkoutSnapshot> {
  return {
    id: detail.id,
    routine_id: detail.routine_id,
    name: detail.name,
    started_at: detail.started_at,
    ended_at: detail.ended_at,
    notes: detail.notes,
    bodyweight_kg: detail.bodyweight_kg,
    routine_structure_version: detail.routine_structure_version ?? null,
    exercises: await Promise.all(detail.exercises.map(async (exercise) => {
      const baselines = await db.getAllAsync<{ record_type: string; value: number }>(
        'SELECT record_type, value FROM active_workout_pr_baselines WHERE workout_exercise_id = $id',
        { $id: exercise.id }
      );
      const alerts = await db.getAllAsync<{ record_type: string }>(
        'SELECT record_type FROM active_workout_alerts WHERE workout_exercise_id = $id ORDER BY record_type',
        { $id: exercise.id }
      );
      return {
        id: exercise.id,
        exercise_id: exercise.exercise_id,
        exercise_name: exercise.exercise.name,
        position: exercise.position,
        exercise_type: exercise.exercise_type,
        notes: exercise.notes,
        source_routine_exercise_id: exercise.source_routine_exercise_id ?? null,
        superset_group_id: exercise.superset_group_id,
        pr_baselines: Object.fromEntries(baselines.map((row) => [row.record_type, row.value])),
        alerted_record_types: alerts.map((row) => row.record_type),
        sets: exercise.sets.map((set) => ({
          id: set.id,
          source_routine_set_id: set.source_routine_set_id ?? null,
          position: set.position,
          set_type: set.set_type,
          weight: set.weight,
          reps: set.reps,
          duration_seconds: set.duration_seconds,
          distance_meters: set.distance_meters,
          rpe: set.rpe,
          completed: set.completed,
          completed_at: set.completed_at,
        })),
      };
    })),
  };
}

function resultBase(canonical: ActiveWorkoutCanonicalState, mutation: ActiveWorkoutMutation) {
  return {
    protocol_version: ACTIVE_WORKOUT_PROTOCOL_VERSION,
    coordinator_epoch: canonical.coordinator_epoch,
    device_id: mutation.device_id,
    device_sequence: mutation.device_sequence,
    operation_id: mutation.operation_id,
    canonical_revision: canonical.revision,
  } as const;
}

function rejected(
  base: ReturnType<typeof resultBase>,
  reason: string,
  conflictKeys: string[]
): ActiveWorkoutResult {
  return { ...base, status: 'rejected', reason, conflict_keys: conflictKeys };
}

async function persistUnresolved(
  db: DatabaseExecutor,
  mutation: ActiveWorkoutMutation,
  payloadHash: string,
  result: ActiveWorkoutResult
): Promise<ActiveWorkoutResult> {
  await insertOperation(db, mutation, payloadHash, result);
  return result;
}

async function finalize(
  db: DatabaseExecutor,
  mutation: ActiveWorkoutMutation,
  payloadHash: string,
  result: ActiveWorkoutResult,
  canonicalUpdate: { revision: number; lifecycle: ActiveWorkoutSyncStatus['lifecycle']; workoutId: string | null; conflictKeys: string[] } | null
): Promise<ActiveWorkoutResult> {
  await insertOperation(db, mutation, payloadHash, result);
  const now = new Date().toISOString();
  if (canonicalUpdate) {
    await db.runAsync(
      `UPDATE active_workout_coordinator
          SET revision = $revision, revision_committed_at = $now, lifecycle = $lifecycle,
              workout_id = $workoutId, publish_needed_revision = $revision
        WHERE singleton = 1`,
      { $revision: canonicalUpdate.revision, $now: now, $lifecycle: canonicalUpdate.lifecycle, $workoutId: canonicalUpdate.workoutId }
    );
    for (const key of canonicalUpdate.conflictKeys) {
      await db.runAsync(
        `INSERT INTO active_workout_conflict_keys
           (conflict_key, revision, operation_id, device_id, device_sequence)
         VALUES ($key, $revision, $operationId, $deviceId, $sequence)
         ON CONFLICT(conflict_key) DO UPDATE SET revision = excluded.revision,
           operation_id = excluded.operation_id, device_id = excluded.device_id,
           device_sequence = excluded.device_sequence`,
        { $key: key, $revision: canonicalUpdate.revision, $operationId: mutation.operation_id, $deviceId: mutation.device_id, $sequence: mutation.device_sequence }
      );
    }
  }
  await db.runAsync(
    `INSERT INTO active_workout_receipts
       (coordinator_epoch, device_id, device_sequence, operation_id, payload_hash,
        disposition, canonical_revision, minimal_result_json)
     VALUES ($epoch, $deviceId, $sequence, $operationId, $payloadHash,
             $disposition, $revision, $resultJson)`,
    {
      $epoch: mutation.coordinator_epoch,
      $deviceId: mutation.device_id,
      $sequence: mutation.device_sequence,
      $operationId: mutation.operation_id,
      $payloadHash: payloadHash,
      $disposition: result.status,
      $revision: result.canonical_revision,
      $resultJson: JSON.stringify(result),
    }
  );
  await db.runAsync(
    `INSERT INTO active_workout_devices
       (coordinator_epoch, device_id, last_finalized_sequence, last_seen_at, acknowledged_revision)
     VALUES ($epoch, $deviceId, $sequence, $now, 0)
     ON CONFLICT(coordinator_epoch, device_id) DO UPDATE SET
       last_finalized_sequence = excluded.last_finalized_sequence, last_seen_at = excluded.last_seen_at`,
    { $epoch: mutation.coordinator_epoch, $deviceId: mutation.device_id, $sequence: mutation.device_sequence, $now: now }
  );
  return result;
}

async function insertOperation(
  db: DatabaseExecutor,
  mutation: ActiveWorkoutMutation,
  payloadHash: string,
  result: ActiveWorkoutResult
) {
  await db.runAsync(
    `INSERT INTO active_workout_operations
       (operation_id, coordinator_epoch, device_id, device_sequence, workout_id,
        base_revision, predecessor_operation_id, payload_hash, payload_json, status,
        result_json, accepted_revision, publish_needed)
     VALUES ($operationId, $epoch, $deviceId, $sequence, $workoutId, $baseRevision,
             $predecessor, $payloadHash, $payloadJson, $status, $resultJson,
             $acceptedRevision, 1)`,
    {
      $operationId: mutation.operation_id,
      $epoch: mutation.coordinator_epoch,
      $deviceId: mutation.device_id,
      $sequence: mutation.device_sequence,
      $workoutId: mutation.workout_id,
      $baseRevision: mutation.base_revision,
      $predecessor: mutation.predecessor_operation_id,
      $payloadHash: payloadHash,
      $payloadJson: JSON.stringify(mutation),
      $status: result.status,
      $resultJson: JSON.stringify(result),
      $acceptedRevision: result.status === 'accepted' ? result.canonical_revision : null,
    }
  );
}

async function predecessorReaches(
  db: DatabaseExecutor,
  mutation: ActiveWorkoutMutation,
  operationId: string
): Promise<boolean> {
  let predecessor = mutation.predecessor_operation_id;
  const seen = new Set<string>();
  while (predecessor && !seen.has(predecessor)) {
    if (predecessor === operationId) return true;
    seen.add(predecessor);
    const row = await db.getFirstAsync<{ predecessor_operation_id: string | null; device_id: string; status: string }>(
      `SELECT predecessor_operation_id, device_id, status FROM active_workout_operations
        WHERE operation_id = $operationId`,
      { $operationId: predecessor }
    );
    if (!row || row.device_id !== mutation.device_id || !['accepted', 'resolved'].includes(row.status)) return false;
    predecessor = row.predecessor_operation_id;
  }
  return false;
}

async function applyOperationToDatabase(
  db: DatabaseExecutor,
  operation: ActiveWorkoutOperation,
  workoutId: string,
  revision: number,
  operationId: string
): Promise<void> {
  switch (operation.type) {
    case 'start_workout':
      return insertSnapshot(db, operation.workout);
    case 'recover_workout':
      if (operation.workout) await insertSnapshot(db, operation.workout);
      return;
    case 'rename_workout':
      await db.runAsync('UPDATE workouts SET name = $value WHERE id = $id', { $value: operation.name, $id: workoutId });
      return;
    case 'update_workout_notes':
      await db.runAsync('UPDATE workouts SET notes = $value WHERE id = $id', { $value: operation.notes, $id: workoutId });
      return;
    case 'add_exercise':
      await ensureExercise(db, operation.exercise.exercise_id, operation.exercise.exercise_name, operation.exercise.exercise_type);
      await db.runAsync(
        `INSERT INTO workout_exercises
           (id, workout_id, exercise_id, position, source_routine_exercise_id, superset_group_id, exercise_type, notes)
         VALUES ($id, $workoutId, $exerciseId, $position, $sourceId, $supersetId, $type, $notes)`,
        { $id: operation.exercise.id, $workoutId: workoutId, $exerciseId: operation.exercise.exercise_id,
          $position: operation.exercise.position, $sourceId: operation.exercise.source_routine_exercise_id,
          $supersetId: operation.exercise.superset_group_id, $type: operation.exercise.exercise_type, $notes: operation.exercise.notes }
      );
      await insertExerciseProtocolData(db, operation.exercise);
      return;
    case 'remove_exercise': {
      await clearSetReferencesForWorkoutExercise(db, operation.exercise_id);
      const removedExercise = await db.getFirstAsync<{ position: number; exercise_id: string }>(
        'SELECT position, exercise_id FROM workout_exercises WHERE id = $id', { $id: operation.exercise_id }
      );
      const childSets = await db.getAllAsync<{ id: string }>(
        'SELECT id FROM logged_sets WHERE workout_exercise_id = $id', { $id: operation.exercise_id }
      );
      await insertTombstone(db, `exercise:${operation.exercise_id}`, workoutId, revision, operationId);
      for (const set of childSets) await insertTombstone(db, `set:${set.id}`, workoutId, revision, operationId);
      await db.runAsync('DELETE FROM workout_exercises WHERE id = $id', { $id: operation.exercise_id });
      if (removedExercise) {
        await db.runAsync('UPDATE workout_exercises SET position = position - 1 WHERE workout_id = $workoutId AND position > $position',
          { $workoutId: workoutId, $position: removedExercise.position });
        await replaceRecordStateForExercise(db, removedExercise.exercise_id);
      }
      return;
    }
    case 'reorder_exercises':
      for (const [position, exerciseId] of operation.exercise_ids.entries()) await db.runAsync(
        'UPDATE workout_exercises SET position = $position WHERE id = $id AND workout_id = $workoutId',
        { $position: position, $id: exerciseId, $workoutId: workoutId }
      );
      return;
    case 'update_exercise':
      await db.runAsync(
        `UPDATE workout_exercises SET ${exerciseUpdateColumn(operation.field)} = $value WHERE id = $id`,
        { $value: operation.value, $id: operation.exercise_id }
      );
      return;
    case 'add_set':
      await db.runAsync(
        `INSERT INTO logged_sets
           (id, workout_exercise_id, position, source_routine_set_id, set_type, weight, reps,
            duration_seconds, distance_meters, rpe, completed, completed_at)
         VALUES ($id, $exerciseId, $position, $sourceId, $setType, $weight, $reps,
                 $duration, $distance, $rpe, $completed, $completedAt)`,
        setParams(operation.exercise_id, operation.set)
      );
      return;
    case 'remove_set': {
      await clearSetReference(db, operation.set_id);
      const removedSet = await db.getFirstAsync<{ position: number; workout_exercise_id: string; exercise_id: string }>(
        `SELECT ls.position, ls.workout_exercise_id, we.exercise_id FROM logged_sets ls
          JOIN workout_exercises we ON we.id = ls.workout_exercise_id WHERE ls.id = $id`, { $id: operation.set_id }
      );
      await insertTombstone(db, `set:${operation.set_id}`, workoutId, revision, operationId);
      await db.runAsync('DELETE FROM logged_sets WHERE id = $id', { $id: operation.set_id });
      if (removedSet) {
        await db.runAsync('UPDATE logged_sets SET position = position - 1 WHERE workout_exercise_id = $exerciseId AND position > $position',
          { $exerciseId: removedSet.workout_exercise_id, $position: removedSet.position });
        await replaceRecordStateForExercise(db, removedSet.exercise_id);
      }
      return;
    }
    case 'reorder_sets':
      for (const [position, setId] of operation.set_ids.entries()) await db.runAsync(
        'UPDATE logged_sets SET position = $position WHERE id = $id AND workout_exercise_id = $exerciseId',
        { $position: position, $id: setId, $exerciseId: operation.exercise_id }
      );
      return;
    case 'update_set':
      await db.runAsync(
        `UPDATE logged_sets SET ${setUpdateColumn(operation.field)} = $value WHERE id = $id`,
        { $value: operation.value, $id: operation.set_id }
      );
      return;
    case 'complete_set': {
      await db.runAsync('UPDATE logged_sets SET completed = $completed, completed_at = $completedAt WHERE id = $id',
        { $completed: operation.completed ? 1 : 0, $completedAt: operation.completed_at, $id: operation.set_id });
      for (const type of operation.alerted_record_types) await db.runAsync(
        'INSERT OR IGNORE INTO active_workout_alerts (workout_exercise_id, record_type) VALUES ($id, $type)',
        { $id: operation.exercise_id, $type: type }
      );
      const completedExercise = await db.getFirstAsync<{ exercise_id: string }>(
        'SELECT exercise_id FROM workout_exercises WHERE id = $id', { $id: operation.exercise_id }
      );
      if (completedExercise) await replaceRecordStateForExercise(db, completedExercise.exercise_id);
      return;
    }
    case 'finish_workout':
      await db.runAsync('UPDATE workouts SET ended_at = $endedAt WHERE id = $id', { $endedAt: operation.ended_at, $id: workoutId });
      return;
    case 'discard_workout':
      await clearSetReferencesForWorkout(db, workoutId);
      await db.runAsync('DELETE FROM workouts WHERE id = $id', { $id: workoutId });
  }
}

function exerciseUpdateColumn(field: Extract<ActiveWorkoutOperation, { type: 'update_exercise' }>['field']): string {
  const columns: Record<typeof field, string> = {
    notes: 'notes', exercise_type: 'exercise_type', superset_group_id: 'superset_group_id',
  };
  const column = columns[field];
  if (!column) throw new Error('invalid_exercise_update_field');
  return column;
}

function setUpdateColumn(field: Extract<ActiveWorkoutOperation, { type: 'update_set' }>['field']): string {
  const columns: Record<typeof field, string> = {
    weight: 'weight', reps: 'reps', duration_seconds: 'duration_seconds',
    distance_meters: 'distance_meters', rpe: 'rpe', set_type: 'set_type',
  };
  const column = columns[field];
  if (!column) throw new Error('invalid_set_update_field');
  return column;
}

async function insertTombstone(
  db: DatabaseExecutor,
  entityKey: string,
  workoutId: string,
  revision: number,
  operationId: string
) {
  await db.runAsync(
    `INSERT OR REPLACE INTO active_workout_tombstones
       (entity_key, workout_id, deleted_revision, operation_id, deleted_at)
     VALUES ($entityKey, $workoutId, $revision, $operationId, $deletedAt)`,
    { $entityKey: entityKey, $workoutId: workoutId, $revision: revision,
      $operationId: operationId, $deletedAt: new Date().toISOString() }
  );
}

async function insertSnapshot(db: DatabaseExecutor, workout: ActiveWorkoutSnapshot) {
  await db.runAsync(
    `INSERT INTO workouts (id, routine_id, name, started_at, ended_at, notes, bodyweight_kg, routine_structure_version)
     VALUES ($id, NULL, $name, $startedAt, $endedAt, $notes, $bodyweight, $structureVersion)`,
    { $id: workout.id, $name: workout.name, $startedAt: workout.started_at, $endedAt: workout.ended_at,
      $notes: workout.notes, $bodyweight: workout.bodyweight_kg, $structureVersion: workout.routine_structure_version }
  );
  for (const exercise of workout.exercises) {
    await ensureExercise(db, exercise.exercise_id, exercise.exercise_name, exercise.exercise_type);
    await db.runAsync(
      `INSERT INTO workout_exercises
         (id, workout_id, exercise_id, position, source_routine_exercise_id, superset_group_id, exercise_type, notes)
       VALUES ($id, $workoutId, $exerciseId, $position, $sourceId, $supersetId, $type, $notes)`,
      { $id: exercise.id, $workoutId: workout.id, $exerciseId: exercise.exercise_id, $position: exercise.position,
        $sourceId: exercise.source_routine_exercise_id, $supersetId: exercise.superset_group_id,
        $type: exercise.exercise_type, $notes: exercise.notes }
    );
    await insertExerciseProtocolData(db, exercise);
  }
}

async function insertExerciseProtocolData(db: DatabaseExecutor, exercise: ActiveWorkoutSnapshot['exercises'][number]) {
  const authoritativeBaselines = await db.getAllAsync<{ record_type: string; value: number }>(
    'SELECT record_type, value FROM personal_records WHERE exercise_id = $exerciseId',
    { $exerciseId: exercise.exercise_id }
  );
  for (const { record_type: type, value } of authoritativeBaselines) await db.runAsync(
    'INSERT INTO active_workout_pr_baselines (workout_exercise_id, record_type, value) VALUES ($id, $type, $value)',
    { $id: exercise.id, $type: type, $value: value }
  );
  for (const type of exercise.alerted_record_types) await db.runAsync(
    'INSERT INTO active_workout_alerts (workout_exercise_id, record_type) VALUES ($id, $type)',
    { $id: exercise.id, $type: type }
  );
  for (const set of exercise.sets) await db.runAsync(
    `INSERT INTO logged_sets
       (id, workout_exercise_id, position, source_routine_set_id, set_type, weight, reps,
        duration_seconds, distance_meters, rpe, completed, completed_at)
     VALUES ($id, $exerciseId, $position, $sourceId, $setType, $weight, $reps,
             $duration, $distance, $rpe, $completed, $completedAt)`,
    setParams(exercise.id, set)
  );
}

function setParams(exerciseId: string, set: ActiveWorkoutSnapshot['exercises'][number]['sets'][number]) {
  return { $id: set.id, $exerciseId: exerciseId, $position: set.position,
    $sourceId: set.source_routine_set_id, $setType: set.set_type, $weight: set.weight,
    $reps: set.reps, $duration: set.duration_seconds, $distance: set.distance_meters,
    $rpe: set.rpe, $completed: set.completed ? 1 : 0, $completedAt: set.completed_at };
}

async function ensureExercise(db: DatabaseExecutor, exerciseId: string, name: string, exerciseType: string) {
  await db.runAsync(
    `INSERT OR IGNORE INTO exercises
       (id, name, muscle_group, equipment, exercise_type, is_custom, instructions, images, secondary_muscles)
     VALUES ($id, $name, 'other', 'Unknown', $type, 1, '[]', '[]', '[]')`,
    { $id: exerciseId, $name: name, $type: exerciseType }
  );
}
