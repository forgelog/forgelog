import { getDb, resetDbForTests } from '../../index';
import { mobileStoreForTests as mobileStore } from '../../../test-utils/db';

beforeEach(() => {
  resetDbForTests();
});

test('lists all types with their latest recorded values', async () => {
  await mobileStore.measurements.record({
    measuredAt: '2026-07-17',
    values: [{ measurementTypeId: 'bodyweight', canonicalValue: 80.5 }],
  });
  await mobileStore.measurements.record({
    measuredAt: '2026-07-16',
    values: [
      { measurementTypeId: 'bodyweight', canonicalValue: 81.2 },
      { measurementTypeId: 'waist', canonicalValue: 90 },
    ],
  });

  const current = await mobileStore.measurements.listCurrent();

  expect(current).toHaveLength(18);
  expect(current[0]).toMatchObject({
    id: 'bodyweight',
    name: 'Body Weight',
    dimension: 'mass',
    canonicalUnit: 'kg',
    position: 0,
    current: { canonicalValue: 80.5, measuredAt: '2026-07-17' },
  });
  expect(current.find((type) => type.id === 'waist')?.current).toMatchObject({
    canonicalValue: 90,
    measuredAt: '2026-07-16',
  });
  expect(current.find((type) => type.id === 'neck')?.current).toBeNull();
});

test('current bodyweight ignores legacy out-of-range measurements', async () => {
  await mobileStore.measurements.record({
    measuredAt: '2026-07-17',
    values: [{ measurementTypeId: 'bodyweight', canonicalValue: 80.5 }],
  });
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO measurements
       (id, measurement_type_id, canonical_value, measured_at, notes)
     VALUES ('legacy-invalid-bodyweight', 'bodyweight', 9999, '2026-07-18', NULL)`
  );

  const current = await mobileStore.measurements.listCurrent();

  expect(current.find((type) => type.id === 'bodyweight')?.current).toMatchObject({
    canonicalValue: 80.5,
    measuredAt: '2026-07-17',
  });
});

test('records only valid values for known measurement types', async () => {
  await expect(
    mobileStore.measurements.record({
      measuredAt: '2026-07-17',
      values: [{ measurementTypeId: 'bodyweight', canonicalValue: -1 }],
    })
  ).rejects.toThrow('Measurement values must be zero or greater.');

  await expect(
    mobileStore.measurements.record({
      measuredAt: '2026-07-17',
      values: [{ measurementTypeId: 'bodyweight', canonicalValue: 10 }],
    })
  ).rejects.toThrow(/between 20 and 400/);

  await expect(
    mobileStore.measurements.record({
      measuredAt: '2026-02-30',
      values: [{ measurementTypeId: 'bodyweight', canonicalValue: 80 }],
    })
  ).rejects.toThrow('Measurement date is invalid.');

  await expect(
    mobileStore.measurements.record({
      measuredAt: '9999-12-31',
      values: [{ measurementTypeId: 'bodyweight', canonicalValue: 80 }],
    })
  ).rejects.toThrow('Measurement date cannot be in the future.');

  await expect(
    mobileStore.measurements.record({
      measuredAt: '2026-07-17',
      values: [{ measurementTypeId: 'unknown', canonicalValue: 80 }],
    })
  ).rejects.toThrow('Measurement type not found.');
});

test('recording bodyweight keeps the profile bodyweight snapshot current', async () => {
  await mobileStore.profile.completeOnboarding({ name: 'Jordan', bodyweightKg: null });

  await mobileStore.measurements.record({
    measuredAt: '2026-07-17',
    values: [{ measurementTypeId: 'bodyweight', canonicalValue: 80.5 }],
  });

  await expect(mobileStore.profile.get()).resolves.toMatchObject({ bodyweightKg: 80.5 });

  await mobileStore.measurements.record({
    measuredAt: '2026-07-16',
    values: [{ measurementTypeId: 'bodyweight', canonicalValue: 79 }],
  });

  await expect(mobileStore.profile.get()).resolves.toMatchObject({ bodyweightKg: 80.5 });
});

test('bodyweight snapshot ignores legacy out-of-range measurements', async () => {
  await mobileStore.profile.completeOnboarding({ name: 'Jordan', bodyweightKg: null });
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO measurements
       (id, measurement_type_id, canonical_value, measured_at, notes)
     VALUES ('legacy-invalid-bodyweight', 'bodyweight', 9999, '2026-07-18', NULL)`
  );

  await mobileStore.measurements.record({
    measuredAt: '2026-07-17',
    values: [{ measurementTypeId: 'bodyweight', canonicalValue: 80.5 }],
  });

  await expect(mobileStore.profile.get()).resolves.toMatchObject({ bodyweightKg: 80.5 });
});

test('rolls back the entire batch when one value is invalid', async () => {
  await expect(
    mobileStore.measurements.record({
      measuredAt: '2026-07-17',
      values: [
        { measurementTypeId: 'bodyweight', canonicalValue: 80 },
        { measurementTypeId: 'unknown', canonicalValue: 90 },
      ],
    })
  ).rejects.toThrow('Measurement type not found.');

  const current = await mobileStore.measurements.listCurrent();
  expect(current.find((type) => type.id === 'bodyweight')?.current).toBeNull();
});
