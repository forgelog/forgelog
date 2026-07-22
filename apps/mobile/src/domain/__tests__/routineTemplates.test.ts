import type { DraftExercise } from '../routineDraft';
import seedExercises from '../../db/exercises.seed.json';
import {
  ROUTINE_TEMPLATES,
  getRoutineTemplate,
  routineTemplateToDraft,
  type RoutineTemplate,
} from '../routineTemplates';

function exercise(id: string, exerciseType = 'weight_reps'): DraftExercise {
  return {
    id,
    name: id.replaceAll('_', ' '),
    muscle_group: 'full_body',
    equipment: 'barbell',
    exercise_type: exerciseType,
    is_custom: false,
    instructions: [],
    images: [],
    secondary_muscles: [],
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

const template: RoutineTemplate = {
  id: 'test-strength',
  name: 'Test Strength',
  description: 'A test template.',
  exercises: [
    {
      exerciseId: 'Barbell_Full_Squat',
      exerciseName: 'Barbell Full Squat',
      sets: [
        { setType: 'warmup', targetReps: 10 },
        { setType: 'normal', targetWeight: 60, targetReps: 8 },
      ],
    },
    {
      exerciseId: 'Plank',
      exerciseName: 'Plank',
      sets: [{ setType: 'normal', targetDurationSeconds: 30 }],
    },
  ],
};

test('finds a built-in routine template by its stable id', () => {
  expect(getRoutineTemplate('beginner-full-body')).toMatchObject({
    id: 'beginner-full-body',
    name: 'Beginner Full Body',
  });
  expect(getRoutineTemplate('missing-template')).toBeNull();
});

test('every template references a matching exercise from the seeded catalog', () => {
  const seededNamesById = new Map(seedExercises.map((exercise) => [exercise.id, exercise.name]));

  for (const template of ROUTINE_TEMPLATES) {
    for (const exercise of template.exercises) {
      expect(seededNamesById.get(exercise.exerciseId)).toBe(exercise.exerciseName);
    }
  }
});

test('builds a new editable routine draft from a template', () => {
  let localId = 0;
  const draft = routineTemplateToDraft(
    template,
    [exercise('Barbell_Full_Squat'), exercise('Plank', 'duration')],
    () => `local-${localId++}`
  );

  expect(draft).toEqual({
    name: 'Test Strength',
    notes: '',
    exercises: [
      {
        localId: 'local-0',
        exercise_id: 'Barbell_Full_Squat',
        superset_group_id: null,
        exercise: exercise('Barbell_Full_Squat'),
        exercise_type: 'weight_reps',
        notes: null,
        sets: [
          {
            localId: 'local-1',
            set_type: 'warmup',
            target_weight: null,
            target_reps: 10,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
          {
            localId: 'local-2',
            set_type: 'normal',
            target_weight: 60,
            target_reps: 8,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
        ],
      },
      {
        localId: 'local-3',
        exercise_id: 'Plank',
        superset_group_id: null,
        exercise: exercise('Plank', 'duration'),
        exercise_type: 'duration',
        notes: null,
        sets: [
          {
            localId: 'local-4',
            set_type: 'normal',
            target_weight: null,
            target_reps: null,
            target_duration_seconds: 30,
            target_distance_meters: null,
          },
        ],
      },
    ],
  });
  expect(draft).not.toHaveProperty('routineId');
});

test('rejects a template when a seeded exercise is unavailable', () => {
  expect(() =>
    routineTemplateToDraft(template, [exercise('Barbell_Full_Squat')], () => 'local')
  ).toThrow('Template exercise not found: Plank');
});
