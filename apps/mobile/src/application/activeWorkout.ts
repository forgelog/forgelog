import { runInMobileStoreTransaction, type LoggedSetValueUpdate } from '../db/mobileStore';
import type { PersonalRecord, PersonalRecordEvent, RecordType, Workout } from '../db/types';
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
  return runInMobileStoreTransaction(async (store) => {
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
    return { improvedRecords, recordEvents };
  });
}

export async function uncompleteSet(setId: string, exerciseId: string): Promise<void> {
  await runInMobileStoreTransaction(async (store) => {
    await store.workouts.setSetCompletion(setId, false);
    await store.records.replaceForExercise(exerciseId);
  });
}

export async function updateSetAndRecomputeRecords(
  setId: string,
  exerciseId: string,
  fields: LoggedSetValueUpdate
): Promise<{ recordEvents: PersonalRecordEvent[] }> {
  return runInMobileStoreTransaction(async (store) => {
    const setContext = await store.workouts.getSetRecordContext(setId);
    const shouldRecompute = setContext?.completed === 1;
    const existingOccurrenceEventTypes = setContext
      ? await store.records.getEventTypesForOccurrence(setContext.workout_exercise_id)
      : new Set<RecordType>();
    await store.workouts.updateSetValues(setId, fields);
    if (!shouldRecompute) return { recordEvents: [] };
    const state = await store.records.replaceForExercise(exerciseId);
    const recordEvents = eventsForSetExcludingExistingTypes(
      state.events,
      setId,
      existingOccurrenceEventTypes
    );
    return { recordEvents };
  });
}

export async function deleteSet(setId: string, exerciseId: string): Promise<void> {
  await runInMobileStoreTransaction(async (store) => {
    // Nullify FK before deleting so personal_records doesn't block the delete
    await store.records.clearSetReference(setId);
    await store.workouts.removeSet(setId);
    await store.records.replaceForExercise(exerciseId);
  });
}

export async function deleteExerciseFromWorkout(
  workoutExerciseId: string,
  exerciseId: string
): Promise<void> {
  await runInMobileStoreTransaction(async (store) => {
    await store.records.clearSetReferencesForWorkoutExercise(workoutExerciseId);
    await store.workouts.removeExercise(workoutExerciseId);
    await store.records.replaceForExercise(exerciseId);
  });
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
  });
}

export async function startOrResumeWorkout(
  routineId?: string
): Promise<{ workout: Workout; resumed: boolean }> {
  return runInMobileStoreTransaction(async (store) => {
    const existing = await store.workouts.getActive();
    if (existing) {
      return { workout: existing, resumed: true };
    }
    const workout = await store.workouts.start({ routineId });
    return { workout, resumed: false };
  });
}

export async function getWorkoutFinishPlan(workoutId: string): Promise<WorkoutFinishPlan> {
  return runInMobileStoreTransaction(async (store) => {
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
  return runInMobileStoreTransaction(async (store) => {
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
    return routineId ? { routineId } : {};
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
