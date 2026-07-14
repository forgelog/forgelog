import {
  runInMobileStoreTransaction,
  type LoggedSetUpdate,
} from '../db/mobileStore';
import type { PersonalRecord, PersonalRecordEvent, RecordType, Workout } from '../db/types';

export async function completeSet(
  setId: string,
  exerciseId: string
): Promise<{ improvedRecords: PersonalRecord[]; recordEvents: PersonalRecordEvent[] }> {
  return runInMobileStoreTransaction(async (store) => {
    const setContext = await store.workouts.getSetRecordContext(setId);
    const existingOccurrenceEventTypes = setContext
      ? await store.records.getEventTypesForOccurrence(setContext.workout_exercise_id)
      : new Set<RecordType>();
    await store.workouts.updateSet(setId, { completed: true });
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
    await store.workouts.updateSet(setId, { completed: false });
    await store.records.replaceForExercise(exerciseId);
  });
}

export async function updateSetAndRecomputeRecords(
  setId: string,
  exerciseId: string,
  fields: LoggedSetUpdate
): Promise<{ recordEvents: PersonalRecordEvent[] }> {
  return runInMobileStoreTransaction(async (store) => {
    const setContext = await store.workouts.getSetRecordContext(setId);
    const shouldRecompute = setContext?.completed === 1 || fields.completed === true;
    const existingOccurrenceEventTypes = setContext
      ? await store.records.getEventTypesForOccurrence(setContext.workout_exercise_id)
      : new Set<RecordType>();
    await store.workouts.updateSet(setId, fields);
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

function eventsForSetExcludingExistingTypes(
  events: PersonalRecordEvent[],
  setId: string,
  existingTypes: Set<RecordType>
): PersonalRecordEvent[] {
  return events.filter(
    (event) => event.logged_set_id === setId && !existingTypes.has(event.record_type)
  );
}
