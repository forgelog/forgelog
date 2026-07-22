import { resetDbForTests } from '../../db/index';
import { mobileStoreForTests as mobileStore } from '../../test-utils/db';
import { completeOnboarding } from '../profile';

beforeEach(() => {
  resetDbForTests();
});

test('completeOnboarding seeds bodyweight as a measurement when provided', async () => {
  await completeOnboarding({ name: 'Jordan', bodyweightKg: 75 });

  await expect(mobileStore.profile.get()).resolves.toMatchObject({
    name: 'Jordan',
    bodyweightKg: 75,
  });
  const current = await mobileStore.measurements.listCurrent();
  expect(current.find((type) => type.id === 'bodyweight')?.current).toMatchObject({
    canonicalValue: 75,
  });
});

test('completeOnboarding does not seed a bodyweight measurement when skipped', async () => {
  await completeOnboarding({ name: 'Jordan', bodyweightKg: null });

  await expect(mobileStore.profile.get()).resolves.toMatchObject({
    name: 'Jordan',
    bodyweightKg: null,
  });
  const current = await mobileStore.measurements.listCurrent();
  expect(current.find((type) => type.id === 'bodyweight')?.current).toBeNull();
});
