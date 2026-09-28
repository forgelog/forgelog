import type { InstallationMarker } from '../../backup/installationMarker';
import { getDb, resetDbForTests } from '../../db/index';
import { mobileStore, runInMobileStoreTransaction } from '../../db/mobileStore';
import { checkForOsRestore } from '../restore';

const RESTORED_AT = new Date('2026-09-28T10:00:00.000Z');

function markerWith(installationId: string): InstallationMarker {
  return { readOrCreate: jest.fn().mockResolvedValue(installationId) };
}

function startWorkout(options: { name: string }) {
  return runInMobileStoreTransaction((store) => store.workoutReplicas.start(options));
}

function backupState() {
  return runInMobileStoreTransaction((store) => store.backupState.get());
}

async function restoreDatabaseFromInstallation(installationId: string) {
  await runInMobileStoreTransaction((store) =>
    store.backupState.saveInstallationId(installationId)
  );
}

beforeEach(() => {
  resetDbForTests();
});

test('adopts the marker on a fresh install without recording a restore', async () => {
  await expect(checkForOsRestore(markerWith('install-a'), () => RESTORED_AT)).resolves.toBe(
    'adopt'
  );

  await expect(backupState()).resolves.toEqual({
    installation_id: 'install-a',
    last_restored_at: null,
    last_restore_source: null,
    restore_notice: null,
  });
});

test('leaves state untouched on a normal launch', async () => {
  const workout = await startWorkout({ name: 'Push Day' });
  await checkForOsRestore(markerWith('install-a'));

  await expect(checkForOsRestore(markerWith('install-a'))).resolves.toBe('normal');

  await expect(mobileStore.workouts.getActive()).resolves.toMatchObject({ id: workout.id });
  await expect(backupState()).resolves.toMatchObject({ last_restored_at: null });
});

test('records an OS restore without a notice when no workout was active', async () => {
  await restoreDatabaseFromInstallation('old-phone');

  await expect(checkForOsRestore(markerWith('new-phone'), () => RESTORED_AT)).resolves.toBe(
    'restored'
  );

  await expect(backupState()).resolves.toEqual({
    installation_id: 'new-phone',
    last_restored_at: RESTORED_AT.toISOString(),
    last_restore_source: 'os',
    restore_notice: null,
  });
});

test('discards a restored in-progress workout and leaves a notice', async () => {
  const workout = await startWorkout({ name: 'Old Phone Workout' });
  await restoreDatabaseFromInstallation('old-phone');

  await checkForOsRestore(markerWith('new-phone'), () => RESTORED_AT);

  await expect(mobileStore.workouts.getActive()).resolves.toBeNull();
  await expect(mobileStore.backupState.getRestoreNotice()).resolves.toBe(
    'active_workout_discarded'
  );
  const mailbox = await mobileStore.sync.getDesiredWorkoutMailbox();
  expect(mailbox.candidate).toMatchObject({
    workout_id: workout.id,
    state: { kind: 'discarded' },
  });
});

test('keeps completed history when restoring', async () => {
  const workout = await startWorkout({ name: 'Finished Before Backup' });
  await runInMobileStoreTransaction((store) => store.workoutReplicas.finish(workout.id));
  await restoreDatabaseFromInstallation('old-phone');

  await checkForOsRestore(markerWith('new-phone'), () => RESTORED_AT);

  await expect(mobileStore.workouts.getDetail(workout.id)).resolves.toMatchObject({
    name: 'Finished Before Backup',
  });
  await expect(mobileStore.backupState.getRestoreNotice()).resolves.toBeNull();
});

test('treats the launch after a restore as normal', async () => {
  await restoreDatabaseFromInstallation('old-phone');
  await checkForOsRestore(markerWith('new-phone'), () => RESTORED_AT);

  await expect(
    checkForOsRestore(markerWith('new-phone'), () => new Date('2026-09-29T10:00:00.000Z'))
  ).resolves.toBe('normal');

  await expect(backupState()).resolves.toMatchObject({
    last_restored_at: RESTORED_AT.toISOString(),
  });
});

test('retries the restore when the database update did not commit', async () => {
  await startWorkout({ name: 'Old Phone Workout' });
  await restoreDatabaseFromInstallation('old-phone');
  const db = await getDb();
  await db.execAsync('ALTER TABLE backup_state RENAME TO backup_state_unavailable');

  await expect(checkForOsRestore(markerWith('new-phone'), () => RESTORED_AT)).rejects.toMatchObject(
    {
      message: expect.stringContaining('no such table'),
    }
  );
  await expect(mobileStore.workouts.getActive()).resolves.not.toBeNull();

  await db.execAsync('ALTER TABLE backup_state_unavailable RENAME TO backup_state');
  await expect(checkForOsRestore(markerWith('new-phone'), () => RESTORED_AT)).resolves.toBe(
    'restored'
  );
  await expect(mobileStore.workouts.getActive()).resolves.toBeNull();
});
