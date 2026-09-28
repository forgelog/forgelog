export type LaunchKind = 'adopt' | 'normal' | 'restored';

/**
 * Classifies a launch by comparing the installation marker (a file excluded
 * from OS backup) with the installation ID stored in the database (included
 * in OS backup). A database that remembers a different installation was
 * copied here by an OS backup restore or device transfer.
 */
export function classifyLaunch(
  markerInstallationId: string,
  databaseInstallationId: string | null
): LaunchKind {
  if (databaseInstallationId === null) return 'adopt';
  return databaseInstallationId === markerInstallationId ? 'normal' : 'restored';
}
