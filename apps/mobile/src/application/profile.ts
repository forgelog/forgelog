import { runInMobileStoreTransaction } from '../db/mobileStore';

export type CompleteOnboardingInput = {
  name: string;
  bodyweightKg?: number | null;
};

export async function completeOnboarding(input: CompleteOnboardingInput): Promise<void> {
  await runInMobileStoreTransaction(async (store) => {
    await store.profile.completeOnboarding(input);

    if (input.bodyweightKg !== null && input.bodyweightKg !== undefined) {
      await store.measurements.record({
        measuredAt: todayKey(),
        values: [{ measurementTypeId: 'bodyweight', canonicalValue: input.bodyweightKg }],
      });
    }
  });
}

function todayKey(): string {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
}
