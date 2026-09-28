import { File, Paths } from 'expo-file-system';

import { id } from '../db/id';

/**
 * Per-install identity used to detect OS backup restores. The file lives in
 * the document directory but is deliberately left out of the Android backup
 * rules, so a restored database never arrives with a matching marker.
 */
export type InstallationMarker = {
  readOrCreate(): Promise<string>;
};

const MARKER_FILE_NAME = 'forgelog-installation.json';

export function parseInstallationMarker(contents: string): string | null {
  try {
    const parsed: unknown = JSON.parse(contents);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const installationId = (parsed as { installation_id?: unknown }).installation_id;
    return typeof installationId === 'string' && installationId.length > 0 ? installationId : null;
  } catch {
    return null;
  }
}

export const fileInstallationMarker: InstallationMarker = {
  async readOrCreate() {
    const file = new File(Paths.document, MARKER_FILE_NAME);
    if (file.exists) {
      const existing = parseInstallationMarker(await file.text());
      if (existing) return existing;
    } else {
      file.create();
    }
    const installationId = id();
    file.write(JSON.stringify({ installation_id: installationId }));
    return installationId;
  },
};
