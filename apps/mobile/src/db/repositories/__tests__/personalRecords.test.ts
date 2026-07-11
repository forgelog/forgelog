import { getDb, resetDbForTests } from '../../index';
import { seededExercise } from '../../../test-utils/db';
import { getRecordsForExercise, replaceRecordsForExercise } from '../personalRecords';
import {
  addExerciseToWorkout,
  addSet,
  finishWorkout,
  startWorkout,
  updateLoggedSet,
} from '../workouts';

beforeEach(() => {
  resetDbForTests();
});

async function setCompletedAt(setId: string, completedAt: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE logged_sets SET completed_at = $completedAt WHERE id = $id', {
    $completedAt: completedAt,
    $id: setId,
  });
}

test('replacement uses completed sets and earliest timing tie-breaks', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startWorkout({ name: 'PR session' });
  const workoutExercise = await addExerciseToWorkout(workout.id, bench.id);
  const laterTie = await addSet(workoutExercise.id);
  const earlierTie = await addSet(workoutExercise.id);
  const ignoredIncomplete = await addSet(workoutExercise.id);

  await updateLoggedSet(laterTie.id, { weight: 100, reps: 5, completed: true });
  await updateLoggedSet(earlierTie.id, { weight: 100, reps: 5, completed: true });
  await updateLoggedSet(ignoredIncomplete.id, { weight: 200, reps: 1, completed: false });
  await finishWorkout(workout.id);
  await setCompletedAt(laterTie.id, '2026-07-11T10:00:00.000Z');
  await setCompletedAt(earlierTie.id, '2026-07-11T09:00:00.000Z');

  const records = await replaceRecordsForExercise(bench.id);

  expect(records).toHaveLength(4);
  expect(records.every((record) => record.logged_set_id === earlierTie.id)).toBe(true);
  await expect(getRecordsForExercise(bench.id)).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ record_type: 'max_weight', value: 100, logged_set_id: earlierTie.id }),
      expect.objectContaining({ record_type: 'max_reps', value: 5, logged_set_id: earlierTie.id }),
      expect.objectContaining({ record_type: 'max_volume', value: 500, logged_set_id: earlierTie.id }),
    ])
  );
});
