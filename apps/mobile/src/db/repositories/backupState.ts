import type { DatabaseExecutor } from '../executor';

export type RestoreSource = 'os' | 'file' | 'cloud';
export type RestoreNotice = 'active_workout_discarded';

export type BackupState = {
  installation_id: string | null;
  last_restored_at: string | null;
  last_restore_source: RestoreSource | null;
  restore_notice: RestoreNotice | null;
};

export async function getBackupState(db: DatabaseExecutor): Promise<BackupState> {
  const row = await db.getFirstAsync<BackupState>(
    `SELECT installation_id, last_restored_at, last_restore_source, restore_notice
       FROM backup_state
      WHERE id = 0`
  );
  if (!row) throw new Error('Missing backup_state row');
  return row;
}

export async function saveInstallationId(
  db: DatabaseExecutor,
  installationId: string
): Promise<void> {
  await db.runAsync('UPDATE backup_state SET installation_id = $id WHERE id = 0', {
    $id: installationId,
  });
}

export async function recordRestore(
  db: DatabaseExecutor,
  input: { source: RestoreSource; restoredAt: string; notice: RestoreNotice | null }
): Promise<void> {
  await db.runAsync(
    `UPDATE backup_state SET
       last_restored_at = $restored_at,
       last_restore_source = $source,
       restore_notice = COALESCE($notice, restore_notice)
     WHERE id = 0`,
    { $restored_at: input.restoredAt, $source: input.source, $notice: input.notice }
  );
}

export async function getRestoreNotice(db: DatabaseExecutor): Promise<RestoreNotice | null> {
  return (await getBackupState(db)).restore_notice;
}

export async function clearRestoreNotice(db: DatabaseExecutor): Promise<void> {
  await db.runAsync('UPDATE backup_state SET restore_notice = NULL WHERE id = 0');
}
