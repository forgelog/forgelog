import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb } from '../db/index';
import { mobileStore, type LoggedSetUpdate } from '../db/mobileStore';
import type { PersonalRecord, PersonalRecordEvent, RecordType, Workout } from '../db/types';

type LoggedSetRecordContext = {
  workout_exercise_id: string;
  completed: number;
};

export async function completeSet(
  setId: string,
  exerciseId: string
): Promise<{ improvedRecords: PersonalRecord[]; recordEvents: PersonalRecordEvent[] }> {
  const db = await getDb();
  let improvedRecords: PersonalRecord[] = [];
  let recordEvents: PersonalRecordEvent[] = [];

  await db.withTransactionAsync(async () => {
    const setContext = await getLoggedSetRecordContext(db, setId);
    const existingOccurrenceEventTypes = setContext
      ? await getRecordEventTypesForOccurrence(db, setContext.workout_exercise_id)
      : new Set<RecordType>();
    await mobileStore.workouts.updateSet(setId, { completed: true });
    const state = await mobileStore.records.replaceForExercise(exerciseId);
    recordEvents = eventsForSetExcludingExistingTypes(
      state.events,
      setId,
      existingOccurrenceEventTypes
    );
    const eventTypes = new Set(recordEvents.map((event) => event.record_type));
    improvedRecords = state.currentRecords.filter((record) => eventTypes.has(record.record_type));
  });

  return { improvedRecords, recordEvents };
}

export async function uncompleteSet(setId: string, exerciseId: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await mobileStore.workouts.updateSet(setId, { completed: false });
    await mobileStore.records.replaceForExercise(exerciseId);
  });
}

export async function updateSetAndRecomputeRecords(
  setId: string,
  exerciseId: string,
  fields: LoggedSetUpdate
): Promise<{ recordEvents: PersonalRecordEvent[] }> {
  const db = await getDb();
  let recordEvents: PersonalRecordEvent[] = [];

  await db.withTransactionAsync(async () => {
    const setContext = await getLoggedSetRecordContext(db, setId);
    const shouldRecompute = setContext?.completed === 1 || fields.completed === true;
    const existingOccurrenceEventTypes = setContext
      ? await getRecordEventTypesForOccurrence(db, setContext.workout_exercise_id)
      : new Set<RecordType>();
    await mobileStore.workouts.updateSet(setId, fields);
    if (!shouldRecompute) return;
    const state = await mobileStore.records.replaceForExercise(exerciseId);
    recordEvents = eventsForSetExcludingExistingTypes(
      state.events,
      setId,
      existingOccurrenceEventTypes
    );
  });

  return { recordEvents };
}

export async function deleteSet(setId: string, exerciseId: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    // Nullify FK before deleting so personal_records doesn't block the delete
    await db.runAsync(
      'UPDATE personal_records SET logged_set_id = NULL WHERE logged_set_id = $id',
      { $id: setId }
    );
    await mobileStore.workouts.removeSet(setId);
    await mobileStore.records.replaceForExercise(exerciseId);
  });
}

export async function deleteExerciseFromWorkout(
  workoutExerciseId: string,
  exerciseId: string
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE personal_records SET logged_set_id = NULL
       WHERE logged_set_id IN (
         SELECT id FROM logged_sets WHERE workout_exercise_id = $id
       )`,
      { $id: workoutExerciseId }
    );
    await db.runAsync('DELETE FROM workout_exercises WHERE id = $id', { $id: workoutExerciseId });
    await mobileStore.records.replaceForExercise(exerciseId);
  });
}

export async function discardWorkout(workoutId: string): Promise<void> {
  const db = await getDb();
  const detail = await mobileStore.workouts.getDetail(workoutId);
  const exerciseIds = [...new Set((detail?.exercises ?? []).map((we) => we.exercise_id))];

  await db.withTransactionAsync(async () => {
    // Nullify FK refs from PRs to sets in this workout before cascade delete
    await db.runAsync(
      `UPDATE personal_records SET logged_set_id = NULL
       WHERE logged_set_id IN (
         SELECT ls.id FROM logged_sets ls
         JOIN workout_exercises we ON we.id = ls.workout_exercise_id
         WHERE we.workout_id = $workoutId
       )`,
      { $workoutId: workoutId }
    );
    await mobileStore.workouts.remove(workoutId);
    for (const exerciseId of exerciseIds) {
      await mobileStore.records.replaceForExercise(exerciseId);
    }
  });
}

export async function startOrResumeWorkout(
  routineId?: string
): Promise<{ workout: Workout; resumed: boolean }> {
  const existing = await mobileStore.workouts.getActive();
  if (existing) {
    return { workout: existing, resumed: true };
  }
  const workout = await mobileStore.workouts.start({ routineId });
  return { workout, resumed: false };
}

async function getLoggedSetRecordContext(
  db: SQLiteDatabase,
  setId: string
): Promise<LoggedSetRecordContext | null> {
  return db.getFirstAsync<LoggedSetRecordContext>(
    `SELECT workout_exercise_id, completed
       FROM logged_sets
      WHERE id = $id`,
    { $id: setId }
  );
}

async function getRecordEventTypesForOccurrence(
  db: SQLiteDatabase,
  workoutExerciseId: string
): Promise<Set<RecordType>> {
  const events = await db.getAllAsync<{ record_type: RecordType }>(
    `SELECT record_type
       FROM personal_record_events
      WHERE workout_exercise_id = $id`,
    { $id: workoutExerciseId }
  );
  return new Set(events.map((event) => event.record_type));
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
