import {
  addExerciseToDraft,
  addSetToDraft,
  createEmptyRoutineDraft,
  moveExerciseInDraft,
  removeExerciseFromDraft,
  removeSetFromDraft,
  routineDetailToDraft,
  updateDraftName,
  updateDraftRest,
  updateDraftSetField,
  updateDraftTrackingType,
  validateRoutineDraft,
} from '../routineDraft';

function makeLocalId() {
  let next = 0;
  return () => `local-${next++}`;
}

function makeExercise(id: string, name = id) {
  return {
    id,
    name,
    muscle_group: 'chest',
    equipment: 'barbell',
    tracking_type: 'weight_reps',
    is_custom: false,
    instructions: [],
    images: [],
    secondary_muscles: [],
    created_at: '2026-01-01',
  };
}

const detail = {
  id: 'routine-1',
  name: 'Push Day',
  notes: 'Heavy',
  position: 0,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  exercises: [
    {
      id: 're-1',
      routine_id: 'routine-1',
      exercise_id: 'bench',
      position: 0,
      superset_group_id: 'group-a',
      rest_seconds: 90,
      tracking_type: 'weight_reps',
      notes: 'Pause',
      exercise: makeExercise('bench', 'Bench Press'),
      sets: [
        {
          id: 'rs-1',
          routine_exercise_id: 're-1',
          position: 0,
          set_type: 'normal' as const,
          target_weight: 80,
          target_reps: 8,
          target_duration_seconds: null,
          target_distance_meters: null,
        },
      ],
    },
  ],
};

test('converts routine detail to a draft without mutating source objects', () => {
  const source = structuredClone(detail);
  const draft = routineDetailToDraft(source, makeLocalId());

  expect(draft).toMatchObject({
    routineId: 'routine-1',
    name: 'Push Day',
    notes: 'Heavy',
    exercises: [
      expect.objectContaining({
        localId: 'local-0',
        persistedId: 're-1',
        exercise_id: 'bench',
        superset_group_id: 'group-a',
        rest_seconds: 90,
        notes: 'Pause',
        sets: [expect.objectContaining({ localId: 'local-1', persistedId: 'rs-1' })],
      }),
    ],
  });
  expect(source).toEqual(detail);
  expect(draft.exercises[0].sets[0]).not.toBe(source.exercises[0].sets[0]);
});

test('creates an empty new routine draft', () => {
  expect(createEmptyRoutineDraft()).toEqual({ name: '', notes: '', exercises: [] });
});

test('adds an exercise with the current empty-set strategy', () => {
  const draft = addExerciseToDraft(createEmptyRoutineDraft(), makeExercise('bench'), makeLocalId());

  expect(draft.exercises).toEqual([
    expect.objectContaining({
      localId: 'local-0',
      exercise_id: 'bench',
      superset_group_id: null,
      rest_seconds: null,
      tracking_type: null,
      notes: null,
      sets: [],
    }),
  ]);
});

test('add, remove, and move operations preserve order and local ids', () => {
  const ids = makeLocalId();
  let draft = createEmptyRoutineDraft();
  draft = addExerciseToDraft(draft, makeExercise('bench'), ids);
  draft = addExerciseToDraft(draft, makeExercise('squat'), ids);
  draft = addSetToDraft(draft, 'local-0', ids);
  draft = addSetToDraft(updateDraftSetField(draft, 'local-0', 'local-2', 'weight', '100'), 'local-0', ids);
  draft = moveExerciseInDraft(draft, 0, 1);
  draft = removeSetFromDraft(draft, 'local-0', 'local-2');
  draft = removeExerciseFromDraft(draft, 'local-1');

  expect(draft.exercises.map((exercise) => exercise.localId)).toEqual(['local-0']);
  expect(draft.exercises[0].sets).toEqual([
    expect.objectContaining({ localId: 'local-3', target_weight: 100 }),
  ]);
});

test('set field updates affect only the intended set and field', () => {
  const ids = makeLocalId();
  let draft = addExerciseToDraft(createEmptyRoutineDraft(), makeExercise('bench'), ids);
  draft = addSetToDraft(draft, 'local-0', ids);
  draft = addSetToDraft(draft, 'local-0', ids);

  const updated = updateDraftSetField(draft, 'local-0', 'local-2', 'reps', '5');

  expect(updated.exercises[0].sets).toEqual([
    expect.objectContaining({ localId: 'local-1', target_reps: null }),
    expect.objectContaining({ localId: 'local-2', target_reps: 5 }),
  ]);
});

test('rest and tracking edits stay local and ignore invalid raw input', () => {
  const ids = makeLocalId();
  let draft = addExerciseToDraft(createEmptyRoutineDraft(), makeExercise('bench'), ids);
  draft = updateDraftRest(draft, 'local-0', '120');
  draft = updateDraftRest(draft, 'local-0', '-5');
  draft = updateDraftTrackingType(draft, 'local-0', 'duration');

  expect(draft.exercises[0]).toMatchObject({ rest_seconds: 120, tracking_type: 'duration' });
});

test('validation trims name and notes and rejects missing name or empty exercises', () => {
  const ids = makeLocalId();
  const empty = validateRoutineDraft(createEmptyRoutineDraft());
  expect(empty.ok).toBe(false);
  expect(empty.errors).toMatchObject({
    name: 'Routine name is required.',
    exercises: 'Add at least one exercise before saving.',
  });

  const draft = updateDraftName(
    addExerciseToDraft(createEmptyRoutineDraft(), makeExercise('bench'), ids),
    '  Push  '
  );
  const valid = validateRoutineDraft({ ...draft, notes: '  Notes  ' });
  expect(valid.ok).toBe(true);
  if (valid.ok) {
    expect(valid.value).toMatchObject({ name: 'Push', notes: 'Notes' });
  }
});

test('draft data does not include route mode concerns', () => {
  const draft = createEmptyRoutineDraft();

  expect('isNew' in draft).toBe(false);
  expect('mode' in draft).toBe(false);
});
