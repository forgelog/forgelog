import { runInMobileStoreTransaction, type LoggedSetValueUpdate } from '../db/mobileStore';
import type { PersonalRecord, PersonalRecordEvent, RecordType, Workout } from '../db/types';
import { deriveConflictKeys, type ActiveWorkoutOperation } from '../sync/activeWorkoutProtocol';
import { notifyActiveWorkoutChanged } from './activeWorkoutSync';
import {
  buildRoutineDraftFromWorkout,
  findRoutineStructureChanges,
  type RoutineStructureChange,
} from '../domain/routineWorkoutStructure';

export type WorkoutFinishPlan =
  | { kind: 'freestyle'; suggestedName: string }
  | { kind: 'routine-unchanged'; routineName: string }
  | { kind: 'routine-update-unavailable'; routineName: string }
  | { kind: 'routine-changed'; routineName: string; changes: RoutineStructureChange[] };

export type WorkoutFinishAction =
  { kind: 'finish-only' } | { kind: 'create-routine'; name: string } | { kind: 'update-routine' };

export async function completeSet(
  setId: string,
  exerciseId: string
): Promise<{ improvedRecords: PersonalRecord[]; recordEvents: PersonalRecordEvent[] }> {
  const result = await runInMobileStoreTransaction(async (store) => {
    const setContext = await store.workouts.getSetRecordContext(setId);
    const existingOccurrenceEventTypes = setContext
      ? await store.records.getEventTypesForOccurrence(setContext.workout_exercise_id)
      : new Set<RecordType>();
    await store.workouts.setSetCompletion(setId, true);
    const state = await store.records.replaceForExercise(exerciseId);
    const recordEvents = eventsForSetExcludingExistingTypes(
      state.events,
      setId,
      existingOccurrenceEventTypes
    );
    const eventTypes = new Set(recordEvents.map((event) => event.record_type));
    const improvedRecords = state.currentRecords.filter((record) =>
      eventTypes.has(record.record_type)
    );
    if (setContext) {
      await store.activeWorkoutSync.addAlertedRecordTypes(
        setContext.workout_exercise_id,
        [...eventTypes]
      );
    }
    await commitActiveMutation(store, {
      type: 'complete_set',
      set_id: setId,
      exercise_id: setContext?.workout_exercise_id ?? '',
      completed: true,
      completed_at: null,
      alerted_record_types: [...eventTypes],
    });
    return { improvedRecords, recordEvents };
  });
  notifyActiveWorkoutChanged();
  return result;
}

export async function uncompleteSet(setId: string, exerciseId: string): Promise<void> {
  await runInMobileStoreTransaction(async (store) => {
    await store.workouts.setSetCompletion(setId, false);
    await store.records.replaceForExercise(exerciseId);
    const context = await store.workouts.getSetRecordContext(setId);
    await commitActiveMutation(store, {
      type: 'complete_set', set_id: setId, exercise_id: context?.workout_exercise_id ?? '',
      completed: false, completed_at: null, alerted_record_types: [],
    });
  });
  notifyActiveWorkoutChanged();
}

export async function updateSetAndRecomputeRecords(
  setId: string,
  exerciseId: string,
  fields: LoggedSetValueUpdate
): Promise<{ recordEvents: PersonalRecordEvent[] }> {
  const result = await runInMobileStoreTransaction(async (store) => {
    const setContext = await store.workouts.getSetRecordContext(setId);
    const shouldRecompute = setContext?.completed === 1;
    const existingOccurrenceEventTypes = setContext
      ? await store.records.getEventTypesForOccurrence(setContext.workout_exercise_id)
      : new Set<RecordType>();
    await store.workouts.updateSetValues(setId, fields);
    const active = await store.workouts.getActive();
    if (active) {
      await store.activeWorkoutSync.commitLocalRevision({
        workoutId: active.id,
        lifecycle: 'active',
        conflictKeys: Object.entries(fields).flatMap(([field, value]) =>
          deriveConflictKeys({ type: 'update_set', set_id: setId, field: field as keyof LoggedSetValueUpdate, value: value ?? null } as ActiveWorkoutOperation, active.id)
        ),
      });
    }
    if (!shouldRecompute) return { recordEvents: [] };
    const state = await store.records.replaceForExercise(exerciseId);
    const recordEvents = eventsForSetExcludingExistingTypes(
      state.events,
      setId,
      existingOccurrenceEventTypes
    );
    return { recordEvents };
  });
  notifyActiveWorkoutChanged();
  return result;
}

export async function deleteSet(setId: string, exerciseId: string): Promise<void> {
  await runInMobileStoreTransaction(async (store) => {
    const context = await store.workouts.getSetRecordContext(setId);
    // Nullify FK before deleting so personal_records doesn't block the delete
    await store.records.clearSetReference(setId);
    await store.workouts.removeSet(setId);
    await store.records.replaceForExercise(exerciseId);
    const active = await store.workouts.getActive();
    if (active) await store.activeWorkoutSync.commitLocalRevision({
      workoutId: active.id, lifecycle: 'active', conflictKeys: [
        ...(context ? [`set_order:${context.workout_exercise_id}`] : []),
        `set:${setId}:entity`,
      ],
    });
  });
  notifyActiveWorkoutChanged();
}

export async function deleteExerciseFromWorkout(
  workoutExerciseId: string,
  exerciseId: string
): Promise<void> {
  await runInMobileStoreTransaction(async (store) => {
    await store.records.clearSetReferencesForWorkoutExercise(workoutExerciseId);
    await store.workouts.removeExercise(workoutExerciseId);
    await store.records.replaceForExercise(exerciseId);
    const active = await store.workouts.getActive();
    if (active) await store.activeWorkoutSync.commitLocalRevision({
      workoutId: active.id, lifecycle: 'active',
      conflictKeys: ['exercise_order', `exercise:${workoutExerciseId}:entity`, `set_order:${workoutExerciseId}`],
    });
  });
  notifyActiveWorkoutChanged();
}

export async function discardWorkout(workoutId: string): Promise<void> {
  await runInMobileStoreTransaction(async (store) => {
    const detail = await store.workouts.getDetail(workoutId);
    const exerciseIds = [...new Set((detail?.exercises ?? []).map((we) => we.exercise_id))];
    // Nullify FK refs from PRs to sets in this workout before cascade delete
    await store.records.clearSetReferencesForWorkout(workoutId);
    await store.workouts.remove(workoutId);
    for (const exerciseId of exerciseIds) {
      await store.records.replaceForExercise(exerciseId);
    }
    const status = await store.activeWorkoutSync.ensureCoordinator(workoutId);
    if (status.legacyWorkoutId === workoutId) await store.activeWorkoutSync.clearLegacyWorkout(workoutId);
    else await store.activeWorkoutSync.commitLocalRevision({
      workoutId, lifecycle: 'discarded', conflictKeys: [`workout:${workoutId}:status`],
    });
  });
  notifyActiveWorkoutChanged();
}

export async function startOrResumeWorkout(
  routineId?: string
): Promise<{ workout: Workout; resumed: boolean }> {
  const result = await runInMobileStoreTransaction(async (store) => {
    const existing = await store.workouts.getActive();
    await store.activeWorkoutSync.ensureCoordinator(existing?.id ?? null);
    if (existing) {
      return { workout: existing, resumed: true };
    }
    const workout = await store.workouts.start({ routineId });
    await store.activeWorkoutSync.capturePrBaselinesForWorkout(workout.id);
    await store.activeWorkoutSync.commitLocalRevision({
      workoutId: workout.id,
      lifecycle: 'active',
      conflictKeys: ['active_workout', `workout:${workout.id}:entity`, `workout:${workout.id}:status`],
    });
    return { workout, resumed: false };
  });
  notifyActiveWorkoutChanged();
  return result;
}

export async function getWorkoutFinishPlan(workoutId: string): Promise<WorkoutFinishPlan> {
  return runInMobileStoreTransaction(async (store): Promise<WorkoutFinishPlan> => {
    const workout = await store.workouts.getDetail(workoutId);
    if (!workout) throw new Error('Workout not found');
    if (!workout.routine_id) {
      return {
        kind: 'freestyle',
        suggestedName: workout.name === 'Workout' ? '' : workout.name,
      };
    }

    const routine = await store.routines.getDetail(workout.routine_id);
    if (!routine) {
      return {
        kind: 'freestyle',
        suggestedName: workout.name === 'Workout' ? '' : workout.name,
      };
    }
    if (workout.routine_structure_version !== 1) {
      return { kind: 'routine-update-unavailable', routineName: routine.name };
    }
    const changes = findRoutineStructureChanges(routine, workout);
    return changes.length > 0
      ? { kind: 'routine-changed', routineName: routine.name, changes }
      : { kind: 'routine-unchanged', routineName: routine.name };
  });
}

export async function finishWorkoutWithRoutineAction(
  workoutId: string,
  action: WorkoutFinishAction
): Promise<{ routineId?: string }> {
  const result = await runInMobileStoreTransaction(async (store) => {
    const workout = await store.workouts.getDetail(workoutId);
    if (!workout) throw new Error('Workout not found');

    let routineId: string | undefined;
    if (action.kind === 'create-routine') {
      const saved = await store.routines.saveDraft(
        buildRoutineDraftFromWorkout(workout, { name: action.name })
      );
      routineId = saved.id;
    } else if (action.kind === 'update-routine') {
      if (!workout.routine_id) throw new Error('Workout has no source routine');
      if (workout.routine_structure_version !== 1) {
        throw new Error('Routine structure provenance unavailable');
      }
      const routine = await store.routines.getDetail(workout.routine_id);
      if (!routine) throw new Error('Source routine not found');
      const saved = await store.routines.saveDraft(
        buildRoutineDraftFromWorkout(workout, { existingRoutine: routine })
      );
      routineId = saved.id;
    }

    await store.workouts.finish(workoutId);
    const status = await store.activeWorkoutSync.ensureCoordinator(workoutId);
    if (status.legacyWorkoutId === workoutId) await store.activeWorkoutSync.clearLegacyWorkout(workoutId);
    else await store.activeWorkoutSync.commitLocalRevision({
      workoutId, lifecycle: 'finished', conflictKeys: [`workout:${workoutId}:status`],
    });
    return routineId ? { routineId } : {};
  });
  notifyActiveWorkoutChanged();
  return result;
}

export async function addExerciseToActiveWorkout(workoutId: string, exerciseId: string) {
  const result = await runInMobileStoreTransaction(async (store) => {
    const exercise = await store.workouts.addExercise(workoutId, exerciseId);
    await store.activeWorkoutSync.capturePrBaselinesForWorkout(workoutId);
    await store.activeWorkoutSync.commitLocalRevision({
      workoutId, lifecycle: 'active',
      conflictKeys: ['exercise_order', `exercise:${exercise.id}:entity`],
    });
    return exercise;
  });
  notifyActiveWorkoutChanged();
  return result;
}

export async function addSetToActiveWorkout(workoutId: string, workoutExerciseId: string) {
  const result = await runInMobileStoreTransaction(async (store) => {
    const set = await store.workouts.addSet(workoutExerciseId);
    await store.activeWorkoutSync.commitLocalRevision({
      workoutId, lifecycle: 'active',
      conflictKeys: [`set_order:${workoutExerciseId}`, `set:${set.id}:entity`],
    });
    return set;
  });
  notifyActiveWorkoutChanged();
  return result;
}

export async function moveActiveWorkoutExercise(
  workoutId: string,
  workoutExerciseId: string,
  delta: -1 | 1
): Promise<void> {
  await runInMobileStoreTransaction(async (store) => {
    await store.workouts.moveExercise(workoutExerciseId, delta);
    await store.activeWorkoutSync.commitLocalRevision({
      workoutId, lifecycle: 'active', conflictKeys: ['exercise_order'],
    });
  });
  notifyActiveWorkoutChanged();
}

export async function updateWorkoutName(workoutId: string, name: string): Promise<void> {
  await runInMobileStoreTransaction(async (store) => {
    const workout = await store.workouts.getDetail(workoutId);
    if (!workout) throw new Error('Workout not found');
    await store.workouts.updateName(workoutId, name);
    if (!workout.ended_at) await store.activeWorkoutSync.commitLocalRevision({
      workoutId, lifecycle: 'active', conflictKeys: [`workout:${workoutId}:name`],
    });
  });
  notifyActiveWorkoutChanged();
}

async function commitActiveMutation(
  store: Parameters<Parameters<typeof runInMobileStoreTransaction>[0]>[0],
  operation: ActiveWorkoutOperation
) {
  const active = await store.workouts.getActive();
  if (!active) return;
  await store.activeWorkoutSync.commitLocalRevision({
    workoutId: active.id,
    lifecycle: 'active',
    conflictKeys: deriveConflictKeys(operation, active.id),
  });
}

function eventsForSetExcludingExistingTypes(
  events: PersonalRecordEvent[],
  setId: string,
  existingTypes: Set<RecordType>
): PersonalRecordEvent[] {
  return events.filter(
    (event) => event.logged_set_id === setId && !existingTypes.has(event.record_type)
  );
}
