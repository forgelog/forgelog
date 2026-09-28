import { getDb, resetDbForTests } from '../../index';
import {
  clearRestoreNotice,
  getBackupState,
  getRestoreNotice,
  recordRestore,
  saveInstallationId,
} from '../backupState';

beforeEach(() => {
  resetDbForTests();
});

test('starts with an empty backup state', async () => {
  const db = await getDb();

  await expect(getBackupState(db)).resolves.toEqual({
    installation_id: null,
    last_restored_at: null,
    last_restore_source: null,
    restore_notice: null,
  });
});

test('stores the installation ID', async () => {
  const db = await getDb();

  await saveInstallationId(db, 'install-a');

  await expect(getBackupState(db)).resolves.toMatchObject({ installation_id: 'install-a' });
});

test('records a restore with its notice until the notice is cleared', async () => {
  const db = await getDb();

  await recordRestore(db, {
    source: 'os',
    restoredAt: '2026-09-28T10:00:00.000Z',
    notice: 'active_workout_discarded',
  });

  await expect(getBackupState(db)).resolves.toMatchObject({
    last_restored_at: '2026-09-28T10:00:00.000Z',
    last_restore_source: 'os',
    restore_notice: 'active_workout_discarded',
  });

  await clearRestoreNotice(db);

  await expect(getRestoreNotice(db)).resolves.toBeNull();
});

test('keeps an undismissed notice when a later restore has none', async () => {
  const db = await getDb();
  await recordRestore(db, {
    source: 'os',
    restoredAt: '2026-09-28T10:00:00.000Z',
    notice: 'active_workout_discarded',
  });

  await recordRestore(db, { source: 'os', restoredAt: '2026-09-29T10:00:00.000Z', notice: null });

  await expect(getBackupState(db)).resolves.toMatchObject({
    last_restored_at: '2026-09-29T10:00:00.000Z',
    restore_notice: 'active_workout_discarded',
  });
});

test('rejects unknown restore sources', async () => {
  const db = await getDb();

  await expect(
    db.runAsync("UPDATE backup_state SET last_restore_source = 'usb' WHERE id = 0")
  ).rejects.toMatchObject({ message: expect.stringContaining('CHECK constraint failed') });
});
