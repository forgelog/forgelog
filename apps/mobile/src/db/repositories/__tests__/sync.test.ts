import Ajv from 'ajv';

import { getDb, resetDbForTests } from '../../index';
import { mobileStore, type WatchWorkoutPayload } from '../../mobileStore';
import { seededExercise } from '../../../test-utils/db';

const { saveDraft: saveRoutineDraft } = mobileStore.routines;
const { getSnapshot: getSyncSnapshot, ingestWatchWorkout } = mobileStore.sync;
const { getDetail: getWorkoutDetail } = mobileStore.workouts;
const { completeOnboarding, update: updateProfile } = mobileStore.profile;

const contractSchema = require('../../../../../../data/contracts/sync.schema.json');

const ajv = new Ajv();
const validateSyncSnapshot = ajv.compile({
  ...contractSchema.definitions.SyncSnapshot,
  definitions: contractSchema.definitions,
});

beforeEach(() => {
  resetDbForTests();
});

async function rowCounts(): Promise<Record<string, number>> {
  const db = await getDb();
  const tables = ['workouts', 'workout_exercises', 'logged_sets', 'personal_records'];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
    counts[table] = row?.count ?? 0;
  }
  return counts;
}

async function personalRecordRows(): Promise<
  {
    id: string;
    exercise_id: string;
    record_type: string;
    value: number;
    logged_set_id: string | null;
    achieved_at: string;
  }[]
> {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT id, exercise_id, record_type, value, logged_set_id, achieved_at
       FROM personal_records
      ORDER BY exercise_id, record_type`
  );
}

test('snapshots validate and duplicate watch deliveries keep row counts stable', async () => {
  await completeOnboarding({ name: 'Jordan', bodyweightKg: 80 });
  await updateProfile({ sex: 'male', birthDate: '1990-03-14', heightCm: 180 });
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  await saveRoutineDraft({
    name: 'Watch Push',
    notes: null,
    exercises: [
      {
        exercise_id: bench.id,
        exercise_type: 'weight_reps',
        notes: null,
        sets: [
          {
            set_type: 'normal',
            target_weight: 60,
            target_reps: 8,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
        ],
      },
    ],
  });

  const db = await getDb();
  await db.runAsync(
    `INSERT INTO personal_records (id, exercise_id, record_type, value, logged_set_id, achieved_at)
     VALUES ('manual-pr', $exerciseId, 'max_weight', 62.5, NULL, '2026-01-01T00:00:00.000Z')`,
    { $exerciseId: bench.id }
  );

  const snapshot = await getSyncSnapshot();
  expect(validateSyncSnapshot(snapshot)).toBe(true);
  expect(validateSyncSnapshot.errors).toBeNull();
  expect(snapshot).toMatchObject({
    protocol_version: 2,
    profile: {
      name: 'Jordan',
      sex: 'male',
      birth_date: '1990-03-14',
      height_cm: 180,
      bodyweight_kg: 80,
    },
  });
  expect(snapshot.profile).not.toHaveProperty('themeMode');

  const payload: WatchWorkoutPayload = {
    protocol_version: 2,
    id: 'watch-workout-1',
    routine_id: null,
    name: 'Watch Push',
    started_at: '2026-07-11T08:00:00.000Z',
    ended_at: '2026-07-11T08:45:00.000Z',
    notes: null,
    exercises: [
      {
        id: 'watch-workout-exercise-1',
        exercise_id: bench.id,
        position: 0,
        superset_group_id: null,
        exercise_type: 'weight_reps',
        notes: null,
        sets: [
          {
            id: 'watch-logged-set-1',
            workout_exercise_id: 'watch-workout-exercise-1',
            position: 0,
            set_type: 'normal',
            weight: 70,
            reps: 5,
            duration_seconds: null,
            distance_meters: null,
            rpe: 8,
            completed: true,
            completed_at: '2026-07-11T08:10:00.000Z',
          },
        ],
      },
    ],
  };

  await ingestWatchWorkout(payload);
  const firstCounts = await rowCounts();
  const firstPersonalRecords = await personalRecordRows();
  await ingestWatchWorkout(payload);

  await expect(rowCounts()).resolves.toEqual(firstCounts);
  await expect(personalRecordRows()).resolves.toEqual(firstPersonalRecords);
  await expect(getWorkoutDetail(payload.id)).resolves.toMatchObject({
    id: payload.id,
    exercises: [
      expect.objectContaining({
        exercise_id: bench.id,
        sets: [expect.objectContaining({ id: 'watch-logged-set-1', weight: 70, reps: 5 })],
      }),
    ],
  });
});
