import { runInMobileStoreTransaction, type LoggedSetValueUpdate } from '../db/mobileStore';
import type {
  LoggedSet,
  PersonalRecord,
  PersonalRecordEvent,
  Workout,
  WorkoutExercise,
} from '../db/types';
import {
  buildRoutineDraftFromWorkout,
  findRoutineStructureChanges,
  type RoutineStructureChange,
} from '../domain/routineWorkoutStructure';
import { signalWorkoutMailboxPublisher } from '../sync/workoutMailboxSignal';

export type WorkoutFinishPlan =
  | { kind: 'freestyle'; suggestedName: string }
  | { kind: 'routine-unchanged'; routineName: string }
  | { kind: 'routine-update-unavailable'; routineName: string }
  | { kind: 'routine-changed'; routineName: string; changes: RoutineStructureChange[] };

export type WorkoutFinishAction =
  { kind: 'finish-only' } | { kind: 'create-routine'; name: string } | { kind: 'update-routine' };

export async function completeSet(
  setId: string,
  _exerciseId: string
): Promise<{ improvedRecords: PersonalRecord[]; recordEvents: PersonalRecordEvent[] }> {
  const result = await runInMobileStoreTransaction(async (store) => {
    const active = await store.workoutReplicas.getActive();
    if (!active) return { improvedRecords: [], recordEvents: [] };
    await store.workoutReplicas.setSetCompletion(setId, true);
    return store.workoutReplicas.recomputeRecordOverlay(active.id, setId);
  });
  signalWorkoutMailboxPublisher();
  return result;
}

export async function uncompleteSet(setId: string, _exerciseId: string): Promise<void> {
  await runInMobileStoreTransaction(async (store) => {
    const active = await store.workoutReplicas.getActive();
    if (!active) return;
    await store.workoutReplicas.setSetCompletion(setId, false);
    await store.workoutReplicas.recomputeRecordOverlay(active.id);
  });
  signalWorkoutMailboxPublisher();
}

export async function updateSetAndRecomputeRecords(
  setId: string,
  _exerciseId: string,
  fields: LoggedSetValueUpdate
): Promise<{ recordEvents: PersonalRecordEvent[] }> {
  const result = await runInMobileStoreTransaction(async (store) => {
    const active = await store.workoutReplicas.getActive();
    if (!active) return { recordEvents: [] };
    await store.workoutReplicas.updateSetValues(setId, fields);
    await store.workoutReplicas.recomputeRecordOverlay(active.id);
    return { recordEvents: [] };
  });
  signalWorkoutMailboxPublisher();
  return result;
}

export async function deleteSet(setId: string, _exerciseId: string): Promise<void> {
  await runInMobileStoreTransaction(async (store) => {
    const active = await store.workoutReplicas.getActive();
    if (!active) return;
    await store.workoutReplicas.removeSet(setId);
    await store.workoutReplicas.recomputeRecordOverlay(active.id);
  });
  signalWorkoutMailboxPublisher();
}

export async function deleteExerciseFromWorkout(
  workoutExerciseId: string,
  _exerciseId: string
): Promise<void> {
  await runInMobileStoreTransaction(async (store) => {
    const active = await store.workoutReplicas.getActive();
    if (!active) return;
    await store.workoutReplicas.removeExercise(workoutExerciseId);
    await store.workoutReplicas.recomputeRecordOverlay(active.id);
  });
  signalWorkoutMailboxPublisher();
}

export async function discardWorkout(workoutId: string): Promise<void> {
  await runInMobileStoreTransaction(async (store) => {
    await store.workoutReplicas.discard(workoutId);
  });
  signalWorkoutMailboxPublisher();
}

export async function startOrResumeWorkout(
  routineId?: string
): Promise<{ workout: Workout; resumed: boolean }> {
  const result = await runInMobileStoreTransaction(async (store) => {
    const existing = await store.workoutReplicas.getActive();
    if (existing) {
      return { workout: existing, resumed: true };
    }
    const workout = await store.workoutReplicas.start({ routineId });
    return { workout, resumed: false };
  });
  signalWorkoutMailboxPublisher();
  return result;
}

export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string
): Promise<WorkoutExercise> {
  const result = await runInMobileStoreTransaction((store) =>
    store.workoutReplicas.addExercise(workoutId, exerciseId)
  );
  signalWorkoutMailboxPublisher();
  return result;
}

export async function addSetToWorkout(workoutExerciseId: string): Promise<LoggedSet> {
  const result = await runInMobileStoreTransaction((store) =>
    store.workoutReplicas.addSet(workoutExerciseId)
  );
  signalWorkoutMailboxPublisher();
  return result;
}

export async function moveExerciseInWorkout(
  workoutExerciseId: string,
  delta: -1 | 1
): Promise<void> {
  await runInMobileStoreTransaction((store) =>
    store.workoutReplicas.moveExercise(workoutExerciseId, delta)
  );
  signalWorkoutMailboxPublisher();
}

export async function getActiveWorkoutRecordEvents(
  workoutId: string
): Promise<PersonalRecordEvent[]> {
  return runInMobileStoreTransaction((store) => store.workoutReplicas.getRecordEvents(workoutId));
}

export async function getWorkoutFinishPlan(workoutId: string): Promise<WorkoutFinishPlan> {
  return runInMobileStoreTransaction(async (store) => {
    const workout = await store.workoutReplicas.getDetail(workoutId);
    if (!workout) throw new Error('Workout not found');
    if (!workout.routine_id) {
      return {
        kind: 'freestyle',
        suggestedName: workout.name === 'Workout' ? '' : workout.name,
      };
    }

    const routine = await store.routines.getDetail(workout.routine_id);
    if (!routine) {
      return {
        kind: 'freestyle',
        suggestedName: workout.name === 'Workout' ? '' : workout.name,
      };
    }
    if (workout.routine_structure_version !== 1) {
      return { kind: 'routine-update-unavailable', routineName: routine.name };
    }
    const changes = findRoutineStructureChanges(routine, workout);
    return changes.length > 0
      ? { kind: 'routine-changed', routineName: routine.name, changes }
      : { kind: 'routine-unchanged', routineName: routine.name };
  });
}

export async function finishWorkoutWithRoutineAction(
  workoutId: string,
  action: WorkoutFinishAction
): Promise<{ routineId?: string }> {
  const result = await runInMobileStoreTransaction(async (store) => {
    const workout = await store.workoutReplicas.getDetail(workoutId);
    if (!workout) throw new Error('Workout not found');

    let routineId: string | undefined;
    if (action.kind === 'create-routine') {
      const saved = await store.routines.saveDraft(
        buildRoutineDraftFromWorkout(workout, { name: action.name })
      );
      routineId = saved.id;
    } else if (action.kind === 'update-routine') {
      if (!workout.routine_id) throw new Error('Workout has no source routine');
      if (workout.routine_structure_version !== 1) {
        throw new Error('Routine structure provenance unavailable');
      }
      const routine = await store.routines.getDetail(workout.routine_id);
      if (!routine) throw new Error('Source routine not found');
      const saved = await store.routines.saveDraft(
        buildRoutineDraftFromWorkout(workout, { existingRoutine: routine })
      );
      routineId = saved.id;
    }

    await store.workoutReplicas.finish(workoutId);
    return routineId ? { routineId } : {};
  });
  signalWorkoutMailboxPublisher();
  return result;
}
