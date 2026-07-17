import { resetDbForTests } from '../../index';
import { mobileStoreForTests as mobileStore } from '../../../test-utils/db';

beforeEach(() => {
  resetDbForTests();
});

test('lists all types with their latest recorded values', async () => {
  await mobileStore.measurements.record({
    measuredAt: '2026-07-16',
    values: [
      { measurementTypeId: 'bodyweight', canonicalValue: 81.2 },
      { measurementTypeId: 'waist', canonicalValue: 90 },
    ],
  });
  await mobileStore.measurements.record({
    measuredAt: '2026-07-17',
    values: [{ measurementTypeId: 'bodyweight', canonicalValue: 80.5 }],
  });

  const current = await mobileStore.measurements.listCurrent();

  expect(current).toHaveLength(18);
  expect(current[0]).toMatchObject({
    id: 'bodyweight',
    name: 'Bodyweight',
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

test('records only valid values for known measurement types', async () => {
  await expect(
    mobileStore.measurements.record({
      measuredAt: '2026-07-17',
      values: [{ measurementTypeId: 'bodyweight', canonicalValue: -1 }],
    })
  ).rejects.toThrow('Measurement values must be zero or greater.');

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
