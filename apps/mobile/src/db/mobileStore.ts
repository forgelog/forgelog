import * as exercises from './repositories/exercises';
import * as personalRecords from './repositories/personalRecords';
import * as profile from './repositories/profile';
import * as routines from './repositories/routines';
import * as sync from './repositories/sync';
import * as workouts from './repositories/workouts';
import type { DatabaseExecutor } from './executor';
import { getDb } from './index';

export type { ExerciseFilters, NewCustomExercise } from './repositories/exercises';
export type { ExerciseRecordRow } from './repositories/personalRecords';
export type { ReplacedRecordState } from './personalRecordState';
export type { Profile, ProfileUpdate, Sex, ThemeMode } from './repositories/profile';
export type {
  RoutineSetInput,
  RoutineSummary,
  SaveRoutineDraftInput,
} from './repositories/routines';
export type {
  SyncSnapshot,
  WatchLoggedSetPayload,
  WatchWorkoutExercisePayload,
  WatchWorkoutPayload,
} from './repositories/sync';
export type { ExerciseSession, LoggedSetUpdate, ProfileStats } from './repositories/workouts';

/**
 * Public persistence entry point for the mobile app.
 *
 * Keep SQL and row mapping in the feature repositories. Code outside `src/db`
 * should depend on this facade instead of importing repository modules directly.
 */
type RepositoryOperation<Args extends unknown[], Result> = (
  db: DatabaseExecutor,
  ...args: Args
) => Promise<Result>;

function bind<Args extends unknown[], Result>(
  operation: RepositoryOperation<Args, Result>
): (...args: Args) => Promise<Result> {
  return async (...args) => operation(await getDb(), ...args);
}

function bindTransaction<Args extends unknown[], Result>(
  operation: RepositoryOperation<Args, Result>
): (...args: Args) => Promise<Result> {
  return async (...args) => {
    const db = await getDb();
    let result!: Result;
    await db.withTransactionAsync(async () => {
      result = await operation(db, ...args);
    });
    return result;
  };
}

export const mobileStore = {
  exercises: {
    list: bind(exercises.listExercises),
    get: bind(exercises.getExercise),
    createCustom: bind(exercises.createCustomExercise),
    setType: bind(exercises.setExerciseType),
    listMuscleGroups: bind(exercises.listMuscleGroups),
    listEquipment: bind(exercises.listEquipment),
  },
  routines: {
    list: bind(routines.listRoutines),
    getDetail: bind(routines.getRoutineDetail),
    listSummaries: bind(routines.listRoutineSummaries),
    create: bind(routines.createRoutine),
    update: bind(routines.updateRoutine),
    remove: bind(routines.deleteRoutine),
    addExercise: bind(routines.addExerciseToRoutine),
    removeExercise: bind(routines.removeRoutineExercise),
    updateExercise: bind(routines.updateRoutineExercise),
    reorderExercises: bindTransaction(routines.reorderRoutineExercises),
    saveDraft: bindTransaction(routines.saveRoutineDraft),
    addSet: bind(routines.addRoutineSet),
    updateSet: bind(routines.updateRoutineSet),
    removeSet: bind(routines.deleteRoutineSet),
  },
  workouts: {
    start: bindTransaction(workouts.startWorkout),
    getActive: bind(workouts.getActiveWorkout),
    getDetail: bind(workouts.getWorkoutDetail),
    getPreviousSessionSets: bind(workouts.getPreviousSessionSets),
    getSessionsForExercise: bind(workouts.getSessionsForExercise),
    addExercise: bind(workouts.addExerciseToWorkout),
    updateExercise: bind(workouts.updateWorkoutExercise),
    addSet: bind(workouts.addSet),
    updateSet: bind(workouts.updateLoggedSet),
    removeSet: bind(workouts.deleteLoggedSet),
    finish: bind(workouts.finishWorkout),
    remove: bind(workouts.deleteWorkout),
    list: bind(workouts.listWorkouts),
    getProfileStats: bind(workouts.getProfileStats),
    hasCompletedSet: workouts.hasCompletedSet,
  },
  records: {
    getForExercise: bind(personalRecords.getRecordsForExercise),
    getEventsForExercise: bind(personalRecords.getRecordEventsForExercise),
    getEventsForWorkout: bind(personalRecords.getRecordEventsForWorkout),
    listAll: bind(personalRecords.listAllRecords),
    replaceForExercise: bind(personalRecords.replaceRecordStateForExercise),
    replaceCurrentForExercise: bind(personalRecords.replaceRecordsForExercise),
  },
  profile: {
    get: bind(profile.getProfile),
    update: bind(profile.updateProfile),
    setName: bind(profile.setProfileName),
    getThemeMode: bind(profile.getThemeMode),
    setThemeMode: bind(profile.setThemeMode),
  },
  sync: {
    getSnapshot: bind(sync.getSyncSnapshot),
    ingestWatchWorkout: bindTransaction(sync.ingestWatchWorkout),
  },
} as const;
