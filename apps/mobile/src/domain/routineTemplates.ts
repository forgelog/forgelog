import type { DraftExercise, RoutineDraft, SetType } from './routineDraft';

export type RoutineTemplateSet = Readonly<{
  setType: SetType;
  targetWeight?: number;
  targetReps?: number;
  targetDurationSeconds?: number;
  targetDistanceMeters?: number;
}>;

export type RoutineTemplateExercise = Readonly<{
  exerciseId: string;
  sets: readonly RoutineTemplateSet[];
}>;

export type RoutineTemplate = Readonly<{
  id: string;
  name: string;
  description: string;
  exercises: readonly RoutineTemplateExercise[];
}>;

function normalSets(count: number, targetReps: number): RoutineTemplateSet[] {
  return Array.from({ length: count }, () => ({ setType: 'normal', targetReps }));
}

export const ROUTINE_TEMPLATES: readonly RoutineTemplate[] = [
  {
    id: 'beginner-full-body',
    name: 'Beginner Full Body',
    description: 'A balanced full-body session built around five foundational movements.',
    exercises: [
      { exerciseId: 'Barbell_Full_Squat', sets: normalSets(3, 8) },
      { exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', sets: normalSets(3, 8) },
      { exerciseId: 'Bent_Over_Barbell_Row', sets: normalSets(3, 10) },
      { exerciseId: 'Dumbbell_Shoulder_Press', sets: normalSets(2, 10) },
      { exerciseId: 'Romanian_Deadlift', sets: normalSets(3, 8) },
    ],
  },
  {
    id: 'push-day',
    name: 'Push Day',
    description: 'Chest, shoulders, and triceps with straightforward working sets.',
    exercises: [
      { exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', sets: normalSets(3, 8) },
      { exerciseId: 'Dumbbell_Shoulder_Press', sets: normalSets(3, 10) },
      { exerciseId: 'Side_Lateral_Raise', sets: normalSets(3, 12) },
      { exerciseId: 'Triceps_Pushdown', sets: normalSets(3, 12) },
    ],
  },
  {
    id: 'pull-day',
    name: 'Pull Day',
    description: 'Back and biceps with a mix of vertical and horizontal pulling.',
    exercises: [
      { exerciseId: 'Barbell_Deadlift', sets: normalSets(3, 5) },
      { exerciseId: 'Bent_Over_Barbell_Row', sets: normalSets(3, 8) },
      { exerciseId: 'Wide-Grip_Lat_Pulldown', sets: normalSets(3, 10) },
      { exerciseId: 'Barbell_Curl', sets: normalSets(3, 12) },
    ],
  },
  {
    id: 'leg-day',
    name: 'Leg Day',
    description: 'Quads, hamstrings, glutes, and calves in one lower-body session.',
    exercises: [
      { exerciseId: 'Barbell_Full_Squat', sets: normalSets(3, 8) },
      { exerciseId: 'Romanian_Deadlift', sets: normalSets(3, 8) },
      { exerciseId: 'Leg_Press', sets: normalSets(3, 10) },
      { exerciseId: 'Standing_Barbell_Calf_Raise', sets: normalSets(3, 12) },
    ],
  },
];

export function getRoutineTemplate(templateId: string): RoutineTemplate | null {
  return ROUTINE_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function routineTemplateToDraft(
  template: RoutineTemplate,
  exercises: readonly DraftExercise[],
  makeLocalId: () => string
): RoutineDraft {
  const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise] as const));

  return {
    name: template.name,
    notes: '',
    exercises: template.exercises.map((templateExercise) => {
      const exercise = exercisesById.get(templateExercise.exerciseId);
      if (!exercise) {
        throw new Error(`Template exercise not found: ${templateExercise.exerciseId}`);
      }

      return {
        localId: makeLocalId(),
        exercise_id: exercise.id,
        superset_group_id: null,
        exercise: { ...exercise },
        exercise_type: exercise.exercise_type,
        notes: null,
        sets: templateExercise.sets.map((set) => ({
          localId: makeLocalId(),
          set_type: set.setType,
          target_weight: set.targetWeight ?? null,
          target_reps: set.targetReps ?? null,
          target_duration_seconds: set.targetDurationSeconds ?? null,
          target_distance_meters: set.targetDistanceMeters ?? null,
        })),
      };
    }),
  };
}
