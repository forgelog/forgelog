import Ajv from 'ajv';

import { getDb, resetDbForTests } from '../../index';
import { mobileStore } from '../../mobileStore';
import { seededExercise } from '../../../test-utils/db';

const contractSchema = require('../../../../../../data/contracts/sync.schema.json');
const validateSyncSnapshot = new Ajv().compile({
  ...contractSchema.definitions.SyncSnapshot,
  definitions: contractSchema.definitions,
});

beforeEach(() => {
  resetDbForTests();
});

test('reference snapshot matches the shared contract without exposing app-only profile state', async () => {
  await mobileStore.profile.completeOnboarding({ name: 'Jordan', bodyweightKg: 80 });
  await mobileStore.profile.update({ sex: 'male', birthDate: '1990-03-14', heightCm: 180 });
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  await mobileStore.routines.saveDraft({
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

  const snapshot = await mobileStore.sync.getSnapshot();

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
});
