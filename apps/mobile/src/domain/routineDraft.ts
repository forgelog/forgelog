import {
  parseNonNegativeInteger,
  parseNonNegativeNumber,
  type SetFieldKey,
  type TrackingType,
} from './setFields';
import { NAME_MAX_LENGTH, NOTES_MAX_LENGTH, validateText } from '../validation/textInput';

export type SetType = 'normal' | 'warmup' | 'dropset' | 'failure';

export type DraftExercise = {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;
  tracking_type: string | null;
  is_custom: boolean;
  instructions: string[];
  images: string[];
  secondary_muscles: string[];
  created_at: string;
};

type RoutineDetailSource = {
  id: string;
  name: string;
  notes: string | null;
  exercises: {
    id: string;
    exercise_id: string;
    superset_group_id: string | null;
    rest_seconds: number | null;
    tracking_type: string | null;
    notes: string | null;
    exercise: DraftExercise;
    sets: {
      id: string;
      set_type: SetType;
      target_weight: number | null;
      target_reps: number | null;
      target_duration_seconds: number | null;
      target_distance_meters: number | null;
    }[];
  }[];
};

export type RoutineDraft = {
  routineId?: string;
  name: string;
  notes: string;
  exercises: RoutineExerciseDraft[];
};

export type RoutineExerciseDraft = {
  localId: string;
  persistedId?: string;
  exercise_id: string;
  superset_group_id: string | null;
  exercise: DraftExercise;
  rest_seconds: number | null;
  tracking_type: string | null;
  notes: string | null;
  sets: RoutineSetDraft[];
};

export type RoutineSetDraft = {
  localId: string;
  persistedId?: string;
  set_type: SetType;
  target_weight: number | null;
  target_reps: number | null;
  target_duration_seconds: number | null;
  target_distance_meters: number | null;
};

export type SaveReadyRoutineDraft = {
  routineId?: string;
  name: string;
  notes: string | null;
  exercises: {
    exercise_id: string;
    superset_group_id: string | null;
    rest_seconds: number | null;
    tracking_type: string | null;
    notes: string | null;
    sets: {
      set_type: SetType;
      target_weight: number | null;
      target_reps: number | null;
      target_duration_seconds: number | null;
      target_distance_meters: number | null;
    }[];
  }[];
};

export type RoutineDraftValidation = {
  name: string | null;
  notes: string | null;
  exercises: string | null;
};

export type RoutineDraftValidationResult =
  | { ok: true; value: SaveReadyRoutineDraft; errors: RoutineDraftValidation }
  | { ok: false; errors: RoutineDraftValidation };

const SET_COLUMN: Record<SetFieldKey, keyof RoutineSetDraft> = {
  weight: 'target_weight',
  reps: 'target_reps',
  duration: 'target_duration_seconds',
  distance: 'target_distance_meters',
};

const INTEGER_FIELDS = new Set<SetFieldKey>(['reps', 'duration']);

export function createEmptyRoutineDraft(): RoutineDraft {
  return { name: '', notes: '', exercises: [] };
}

export function routineDetailToDraft(
  detail: RoutineDetailSource,
  makeLocalId: () => string
): RoutineDraft {
  return {
    routineId: detail.id,
    name: detail.name,
    notes: detail.notes ?? '',
    exercises: detail.exercises.map((exercise) => ({
      localId: makeLocalId(),
      persistedId: exercise.id,
      exercise_id: exercise.exercise_id,
      superset_group_id: exercise.superset_group_id,
      exercise: { ...exercise.exercise },
      rest_seconds: exercise.rest_seconds,
      tracking_type: exercise.tracking_type,
      notes: exercise.notes,
      sets: exercise.sets.map((set) => ({
        localId: makeLocalId(),
        persistedId: set.id,
        set_type: set.set_type,
        target_weight: set.target_weight,
        target_reps: set.target_reps,
        target_duration_seconds: set.target_duration_seconds,
        target_distance_meters: set.target_distance_meters,
      })),
    })),
  };
}

export function addExerciseToDraft(
  draft: RoutineDraft,
  exercise: DraftExercise,
  makeLocalId: () => string
): RoutineDraft {
  return {
    ...draft,
    exercises: [
      ...draft.exercises,
      {
        localId: makeLocalId(),
        exercise_id: exercise.id,
        superset_group_id: null,
        exercise: { ...exercise },
        rest_seconds: null,
        tracking_type: null,
        notes: null,
        sets: [],
      },
    ],
  };
}

export function removeExerciseFromDraft(draft: RoutineDraft, localId: string): RoutineDraft {
  return { ...draft, exercises: draft.exercises.filter((exercise) => exercise.localId !== localId) };
}

export function moveExerciseInDraft(draft: RoutineDraft, index: number, delta: number): RoutineDraft {
  const target = index + delta;
  if (target < 0 || target >= draft.exercises.length) return draft;
  const exercises = [...draft.exercises];
  [exercises[index], exercises[target]] = [exercises[target], exercises[index]];
  return { ...draft, exercises };
}

export function addSetToDraft(
  draft: RoutineDraft,
  exerciseLocalId: string,
  makeLocalId: () => string
): RoutineDraft {
  return updateExercise(draft, exerciseLocalId, (exercise) => {
    const last = exercise.sets.at(-1);
    return {
      ...exercise,
      sets: [
        ...exercise.sets,
        {
          localId: makeLocalId(),
          set_type: last?.set_type ?? 'normal',
          target_weight: last?.target_weight ?? null,
          target_reps: last?.target_reps ?? null,
          target_duration_seconds: last?.target_duration_seconds ?? null,
          target_distance_meters: last?.target_distance_meters ?? null,
        },
      ],
    };
  });
}

export function removeSetFromDraft(
  draft: RoutineDraft,
  exerciseLocalId: string,
  setLocalId: string
): RoutineDraft {
  return updateExercise(draft, exerciseLocalId, (exercise) => ({
    ...exercise,
    sets: exercise.sets.filter((set) => set.localId !== setLocalId),
  }));
}

export function updateDraftName(draft: RoutineDraft, name: string): RoutineDraft {
  return { ...draft, name };
}

export function updateDraftNotes(draft: RoutineDraft, notes: string): RoutineDraft {
  return { ...draft, notes };
}

export function updateDraftRest(
  draft: RoutineDraft,
  exerciseLocalId: string,
  raw: string
): RoutineDraft {
  const value = parseNonNegativeInteger(raw);
  if (value === undefined) return draft;
  return updateExercise(draft, exerciseLocalId, (exercise) => ({ ...exercise, rest_seconds: value }));
}

export function updateDraftTrackingType(
  draft: RoutineDraft,
  exerciseLocalId: string,
  trackingType: TrackingType
): RoutineDraft {
  return updateExercise(draft, exerciseLocalId, (exercise) => ({
    ...exercise,
    tracking_type: trackingType,
  }));
}

export function updateDraftSetField(
  draft: RoutineDraft,
  exerciseLocalId: string,
  setLocalId: string,
  field: SetFieldKey,
  raw: string
): RoutineDraft {
  const value = INTEGER_FIELDS.has(field)
    ? parseNonNegativeInteger(raw)
    : parseNonNegativeNumber(raw);
  if (value === undefined) return draft;
  const column = SET_COLUMN[field];
  return updateExercise(draft, exerciseLocalId, (exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => (set.localId === setLocalId ? { ...set, [column]: value } : set)),
  }));
}

export function validateRoutineDraft(draft: RoutineDraft): RoutineDraftValidationResult {
  const nameResult = validateText(draft.name, {
    required: true,
    maxLength: NAME_MAX_LENGTH,
    fieldLabel: 'Routine name',
  });
  const notesResult = validateText(draft.notes, {
    maxLength: NOTES_MAX_LENGTH,
    fieldLabel: 'Notes',
    multiline: true,
  });
  const errors: RoutineDraftValidation = {
    name: nameResult.error,
    notes: notesResult.error,
    exercises: draft.exercises.length === 0 ? 'Add at least one exercise before saving.' : null,
  };

  if (errors.name || errors.notes || errors.exercises) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors,
    value: {
      routineId: draft.routineId,
      name: nameResult.value,
      notes: notesResult.value || null,
      exercises: draft.exercises.map((exercise) => ({
        exercise_id: exercise.exercise_id,
        superset_group_id: exercise.superset_group_id,
        rest_seconds: exercise.rest_seconds,
        tracking_type: exercise.tracking_type,
        notes: exercise.notes,
        sets: exercise.sets.map((set) => ({
          set_type: set.set_type,
          target_weight: set.target_weight,
          target_reps: set.target_reps,
          target_duration_seconds: set.target_duration_seconds,
          target_distance_meters: set.target_distance_meters,
        })),
      })),
    },
  };
}

function updateExercise(
  draft: RoutineDraft,
  exerciseLocalId: string,
  update: (exercise: RoutineExerciseDraft) => RoutineExerciseDraft
): RoutineDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((exercise) =>
      exercise.localId === exerciseLocalId ? update(exercise) : exercise
    ),
  };
}
