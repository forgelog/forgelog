import type { DatabaseExecutor } from '../executor';
import type { PersonalRecord, RoutineDetail } from '../types';
import { listRoutines, getRoutineDetail } from './routines';
import { getRecordsForExercise } from './personalRecords';
import { getProfile, type Sex } from './profile';

export const SYNC_PROTOCOL_VERSION = 2;

export type SyncProfile = {
  name: string;
  sex: Sex | null;
  birth_date: string | null;
  height_cm: number | null;
  bodyweight_kg: number | null;
};

// Everything the watch needs to log a workout offline: routine templates
// (with exercise_type/superset info and their sets), the
// exercises they reference, and the current PR baseline for those exercises
// so the watch can detect a new PR without the phone being reachable.
export type SyncSnapshot = {
  protocol_version: typeof SYNC_PROTOCOL_VERSION;
  routines: RoutineDetail[];
  personalRecords: PersonalRecord[];
  profile: SyncProfile;
};

export async function getSyncSnapshot(db: DatabaseExecutor): Promise<SyncSnapshot> {
  const routines = await listRoutines(db);
  const details: RoutineDetail[] = [];
  const exerciseIds = new Set<string>();

  for (const routine of routines) {
    const detail = await getRoutineDetail(db, routine.id);
    if (!detail) continue;
    details.push(detail);
    for (const re of detail.exercises) exerciseIds.add(re.exercise_id);
  }

  const personalRecords: PersonalRecord[] = [];
  for (const exerciseId of exerciseIds) {
    personalRecords.push(...(await getRecordsForExercise(db, exerciseId)));
  }

  const profile = await getProfile(db);
  return {
    protocol_version: SYNC_PROTOCOL_VERSION,
    routines: details,
    personalRecords,
    profile: {
      name: profile.name,
      sex: profile.sex,
      birth_date: profile.birthDate,
      height_cm: profile.heightCm,
      bodyweight_kg: profile.bodyweightKg,
    },
  };
}
