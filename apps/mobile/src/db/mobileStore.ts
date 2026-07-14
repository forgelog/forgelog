import * as exercises from './repositories/exercises';
import * as personalRecords from './repositories/personalRecords';
import * as profile from './repositories/profile';
import * as routines from './repositories/routines';
import * as sync from './repositories/sync';
import * as workouts from './repositories/workouts';

export type { ExerciseFilters, NewCustomExercise } from './repositories/exercises';
export type { ExerciseRecordRow } from './repositories/personalRecords';
export type { ReplacedRecordState } from './personalRecordState';
export type { Profile, ProfileUpdate, Sex, ThemeMode } from './repositories/profile';
export type { RoutineSetInput, RoutineSummary, SaveRoutineDraftInput } from './repositories/routines';
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
export const mobileStore = {
  exercises: {
    list: exercises.listExercises,
    get: exercises.getExercise,
    createCustom: exercises.createCustomExercise,
    setType: exercises.setExerciseType,
    listMuscleGroups: exercises.listMuscleGroups,
    listEquipment: exercises.listEquipment,
  },
  routines: {
    list: routines.listRoutines,
    getDetail: routines.getRoutineDetail,
    listSummaries: routines.listRoutineSummaries,
    create: routines.createRoutine,
    update: routines.updateRoutine,
    remove: routines.deleteRoutine,
    addExercise: routines.addExerciseToRoutine,
    removeExercise: routines.removeRoutineExercise,
    updateExercise: routines.updateRoutineExercise,
    reorderExercises: routines.reorderRoutineExercises,
    saveDraft: routines.saveRoutineDraft,
    addSet: routines.addRoutineSet,
    updateSet: routines.updateRoutineSet,
    removeSet: routines.deleteRoutineSet,
  },
  workouts: {
    start: workouts.startWorkout,
    getActive: workouts.getActiveWorkout,
    getDetail: workouts.getWorkoutDetail,
    getPreviousSessionSets: workouts.getPreviousSessionSets,
    getSessionsForExercise: workouts.getSessionsForExercise,
    addExercise: workouts.addExerciseToWorkout,
    updateExercise: workouts.updateWorkoutExercise,
    addSet: workouts.addSet,
    updateSet: workouts.updateLoggedSet,
    removeSet: workouts.deleteLoggedSet,
    finish: workouts.finishWorkout,
    remove: workouts.deleteWorkout,
    list: workouts.listWorkouts,
    getProfileStats: workouts.getProfileStats,
    hasCompletedSet: workouts.hasCompletedSet,
  },
  records: {
    getForExercise: personalRecords.getRecordsForExercise,
    getEventsForExercise: personalRecords.getRecordEventsForExercise,
    getEventsForWorkout: personalRecords.getRecordEventsForWorkout,
    listAll: personalRecords.listAllRecords,
    replaceForExercise: personalRecords.replaceRecordStateForExercise,
    replaceCurrentForExercise: personalRecords.replaceRecordsForExercise,
  },
  profile: {
    get: profile.getProfile,
    update: profile.updateProfile,
    setName: profile.setProfileName,
    getThemeMode: profile.getThemeMode,
    setThemeMode: profile.setThemeMode,
  },
  sync: {
    getSnapshot: sync.getSyncSnapshot,
    ingestWatchWorkout: sync.ingestWatchWorkout,
  },
} as const;
