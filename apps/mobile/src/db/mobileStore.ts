import { Platform } from 'react-native';

import * as exercises from './repositories/exercises';
import * as measurements from './repositories/measurements';
import * as personalRecords from './repositories/personalRecords';
import * as profile from './repositories/profile';
import * as routines from './repositories/routines';
import * as sync from './repositories/sync';
import * as workouts from './repositories/workouts';
import type { DatabaseExecutor } from './executor';
import { getDb } from './index';

export type { ExerciseFilters } from './repositories/exercises';
export type {
  CurrentMeasurement,
  MeasurementDimension,
  RecordMeasurementsInput,
} from './repositories/measurements';
export type { ExerciseRecordRow } from './repositories/personalRecords';
export type { ReplacedRecordState } from './personalRecordState';
export type { Profile, ProfileUpdate, Sex, ThemeMode } from './repositories/profile';
export type { RoutineSummary, SaveRoutineDraftInput } from './repositories/routines';
export type {
  SyncSnapshot,
  WatchLoggedSetPayload,
  WatchWorkoutExercisePayload,
  WatchWorkoutPayload,
} from './repositories/sync';
export type {
  ExerciseHistoryEntry,
  LoggedSetValueUpdate,
  ProfileStats,
} from './repositories/workouts';

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

type ExecutorProvider = () => Promise<DatabaseExecutor>;
type TransactionRunner = <Result>(
  operation: (db: DatabaseExecutor) => Promise<Result>
) => Promise<Result>;

function createBoundMobileStore(
  getExecutor: ExecutorProvider,
  runInTransaction: TransactionRunner
) {
  const bind =
    <Args extends unknown[], Result>(operation: RepositoryOperation<Args, Result>) =>
    async (...args: Args): Promise<Result> =>
      operation(await getExecutor(), ...args);

  const bindTransaction =
    <Args extends unknown[], Result>(operation: RepositoryOperation<Args, Result>) =>
    async (...args: Args): Promise<Result> =>
      runInTransaction((db) => operation(db, ...args));

  return {
    exercises: {
      list: bind(exercises.listExercises),
      get: bind(exercises.getExercise),
      listMuscleGroups: bind(exercises.listMuscleGroups),
      listEquipment: bind(exercises.listEquipment),
    },
    routines: {
      list: bind(routines.listRoutines),
      getDetail: bind(routines.getRoutineDetail),
      getWithSummaries: bind(routines.getRoutinesWithSummaries),
      remove: bind(routines.deleteRoutine),
      saveDraft: bindTransaction(routines.saveRoutineDraft),
    },
    workouts: {
      start: bindTransaction(workouts.startWorkout),
      getActive: bind(workouts.getActiveWorkout),
      getDetail: bind(workouts.getWorkoutDetail),
      getPreviousExerciseSets: bind(workouts.getPreviousExerciseSets),
      listExerciseHistory: bind(workouts.listExerciseHistory),
      getSetRecordContext: bind(workouts.getLoggedSetRecordContext),
      addExercise: bind(workouts.addExerciseToWorkout),
      removeExercise: bind(workouts.deleteWorkoutExercise),
      addSet: bind(workouts.addSet),
      updateSetValues: bind(workouts.updateLoggedSetValues),
      setSetCompletion: bind(workouts.setLoggedSetCompletion),
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
      getEventTypesForOccurrence: bind(personalRecords.getRecordEventTypesForOccurrence),
      listAll: bind(personalRecords.listAllRecords),
      replaceForExercise: bind(personalRecords.replaceRecordStateForExercise),
      replaceCurrentForExercise: bind(personalRecords.replaceRecordsForExercise),
      clearSetReference: bind(personalRecords.clearSetReference),
      clearSetReferencesForWorkoutExercise: bind(
        personalRecords.clearSetReferencesForWorkoutExercise
      ),
      clearSetReferencesForWorkout: bind(personalRecords.clearSetReferencesForWorkout),
    },
    measurements: {
      listCurrent: bind(measurements.listCurrentMeasurements),
      record: bindTransaction(measurements.recordMeasurements),
    },
    profile: {
      hasCompletedOnboarding: bind(profile.hasCompletedOnboarding),
      completeOnboarding: bind(profile.completeOnboarding),
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
}

export type TransactionBoundMobileStore = ReturnType<typeof createBoundMobileStore>;

async function runDefaultTransaction<Result>(
  operation: (db: DatabaseExecutor) => Promise<Result>
): Promise<Result> {
  const db = await getDb();
  let result!: Result;
  if (Platform.OS === 'web') {
    await db.withTransactionAsync(async () => {
      result = await operation(db);
    });
    return result;
  }
  await db.withExclusiveTransactionAsync(async (transaction) => {
    result = await operation(transaction);
  });
  return result;
}

const defaultStore = createBoundMobileStore(getDb, runDefaultTransaction);

export const mobileStore = {
  exercises: defaultStore.exercises,
  routines: defaultStore.routines,
  workouts: {
    getActive: defaultStore.workouts.getActive,
    getDetail: defaultStore.workouts.getDetail,
    getPreviousExerciseSets: defaultStore.workouts.getPreviousExerciseSets,
    listExerciseHistory: defaultStore.workouts.listExerciseHistory,
    addExercise: defaultStore.workouts.addExercise,
    addSet: defaultStore.workouts.addSet,
    finish: defaultStore.workouts.finish,
    list: defaultStore.workouts.list,
    getProfileStats: defaultStore.workouts.getProfileStats,
    hasCompletedSet: defaultStore.workouts.hasCompletedSet,
  },
  records: {
    getForExercise: defaultStore.records.getForExercise,
    getEventsForExercise: defaultStore.records.getEventsForExercise,
    getEventsForWorkout: defaultStore.records.getEventsForWorkout,
    listAll: defaultStore.records.listAll,
  },
  measurements: defaultStore.measurements,
  profile: defaultStore.profile,
  sync: defaultStore.sync,
} as const;

/**
 * Application-only entry point for atomic, multi-repository use cases.
 * UI and transport code must call an invariant-preserving application use case instead.
 */
export function runInMobileStoreTransaction<Result>(
  operation: (store: TransactionBoundMobileStore) => Promise<Result>
): Promise<Result> {
  return runDefaultTransaction((transaction) =>
    operation(
      createBoundMobileStore(
        async () => transaction,
        (nestedOperation) => nestedOperation(transaction)
      )
    )
  );
}
