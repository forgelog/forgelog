import {
  ACTIVE_WORKOUT_MAX_PAYLOAD_BYTES,
  ACTIVE_WORKOUT_PROTOCOL_VERSION,
  applyActiveWorkoutMutation,
  assertActiveWorkoutPayloadSize,
  deriveConflictKeys,
  isActiveWorkoutMutation,
  normalizedActiveWorkoutJson,
  parseActiveWorkoutMutation,
  type ActiveWorkoutCanonicalState,
  type ActiveWorkoutMutation,
  type ActiveWorkoutSnapshot,
} from '../activeWorkoutProtocol';

const state: ActiveWorkoutCanonicalState = {
  protocol_version: ACTIVE_WORKOUT_PROTOCOL_VERSION,
  coordinator_id: 'phone-1',
  coordinator_epoch: 'epoch-1',
  revision: 4,
  revision_committed_at: '2026-07-23T10:00:00.000Z',
  lifecycle: 'active',
  workout_id: 'workout-1',
  workout: {
    id: 'workout-1',
    routine_id: null,
    name: 'Workout',
    started_at: '2026-07-23T09:00:00.000Z',
    ended_at: null,
    notes: null,
    bodyweight_kg: null,
    routine_structure_version: null,
    exercises: [
      {
        id: 'occurrence-1',
        exercise_id: 'exercise-1',
        exercise_name: 'Squat',
        position: 0,
        exercise_type: 'weight_reps',
        notes: null,
        source_routine_exercise_id: null,
        superset_group_id: null,
        pr_baselines: {},
        alerted_record_types: [],
        sets: [
          {
            id: 'set-1',
            source_routine_set_id: null,
            position: 0,
            set_type: 'normal',
            weight: 100,
            reps: 5,
            duration_seconds: null,
            distance_meters: null,
            rpe: null,
            completed: false,
            completed_at: null,
          },
        ],
      },
    ],
  },
  terminal: null,
};

function mutation(
  operation: ActiveWorkoutMutation['operation']
): ActiveWorkoutMutation {
  return {
    protocol_version: ACTIVE_WORKOUT_PROTOCOL_VERSION,
    operation_id: 'operation-1',
    device_id: 'watch-1',
    device_sequence: 1,
    coordinator_epoch: 'epoch-1',
    workout_id: 'workout-1',
    base_revision: 4,
    predecessor_operation_id: null,
    conflict_keys: deriveConflictKeys(operation, 'workout-1'),
    created_at: '2026-07-23T10:01:00.000Z',
    operation,
  };
}

describe('active workout protocol', () => {
  test('accepts every shared mutation fixture', () => {
    const fixtures = require('../../../../../data/contracts/fixtures/active-workout-mutations.json') as ActiveWorkoutMutation[];
    expect(fixtures.every(isActiveWorkoutMutation)).toBe(true);
    for (const fixture of fixtures) {
      expect(parseActiveWorkoutMutation(fixture)).not.toBeNull();
      expect(deriveConflictKeys(fixture.operation, fixture.workout_id)).toEqual(
        [...fixture.conflict_keys].sort()
      );
    }
  });

  test('rejects malformed operation bodies and non-allowlisted update fields', () => {
    const envelope = {
      protocol_version: 1,
      operation_id: 'operation-1',
      device_id: 'watch-1',
      device_sequence: 1,
      coordinator_epoch: 'epoch-1',
      workout_id: 'workout-1',
      base_revision: 0,
      predecessor_operation_id: null,
      conflict_keys: [],
      created_at: '2026-07-23T10:00:00Z',
    };

    expect(isActiveWorkoutMutation({ ...envelope, operation: { type: 'add_set' } })).toBe(false);
    expect(isActiveWorkoutMutation({
      ...envelope,
      operation: { type: 'update_set', set_id: 'set-1', field: 'DROP TABLE workouts', value: 1 },
    })).toBe(false);
    expect(isActiveWorkoutMutation({
      ...envelope,
      operation: { type: 'update_exercise', exercise_id: 'exercise-1', field: 'position', value: 'x' },
    })).toBe(false);
  });

  test('validates every mutation envelope and nested snapshot field', () => {
    const startOperation: Extract<ActiveWorkoutMutation['operation'], { type: 'start_workout' }> = {
      type: 'start_workout',
      workout: state.workout!,
    };
    const full = mutation(startOperation);
    expect(parseActiveWorkoutMutation(full)).toEqual(full);

    const invalid: unknown[] = [
      null, [],
      { ...full, protocol_version: 2 },
      { ...full, operation_id: '' },
      { ...full, device_id: '' },
      { ...full, device_sequence: 0 },
      { ...full, coordinator_epoch: '' },
      { ...full, workout_id: '' },
      { ...full, base_revision: -1 },
      { ...full, predecessor_operation_id: 2 },
      { ...full, conflict_keys: [1] },
      { ...full, created_at: 1 },
      { ...full, operation: null },
      { ...full, operation: { type: 'unknown' } },
    ];
    const snapshotFields: [string, unknown][] = [
      ['id', ''], ['routine_id', 1], ['name', 1], ['started_at', 1], ['ended_at', 1],
      ['notes', 1], ['bodyweight_kg', 'heavy'], ['routine_structure_version', 1.5],
      ['exercises', {}],
    ];
    for (const [field, value] of snapshotFields) invalid.push({
      ...full,
      operation: { ...startOperation, workout: { ...startOperation.workout, [field]: value } },
    });
    const exercise = state.workout!.exercises[0];
    const exerciseFields: [string, unknown][] = [
      ['id', ''], ['exercise_id', ''], ['exercise_name', 1], ['position', -1],
      ['exercise_type', 1], ['notes', 1], ['source_routine_exercise_id', 1],
      ['superset_group_id', 1], ['pr_baselines', []], ['alerted_record_types', [1]],
      ['sets', {}],
    ];
    for (const [field, value] of exerciseFields) invalid.push({
      ...full,
      operation: {
        ...startOperation,
        workout: { ...startOperation.workout, exercises: [{ ...exercise, [field]: value }] },
      },
    });
    const set = exercise.sets[0];
    const setFields: [string, unknown][] = [
      ['id', ''], ['source_routine_set_id', 1], ['position', -1], ['set_type', 1],
      ['weight', 'heavy'], ['reps', 1.5], ['duration_seconds', 1.5],
      ['distance_meters', 'far'], ['rpe', 'hard'], ['completed', 1], ['completed_at', 1],
    ];
    for (const [field, value] of setFields) invalid.push({
      ...full,
      operation: {
        ...startOperation,
        workout: {
          ...startOperation.workout,
          exercises: [{ ...exercise, sets: [{ ...set, [field]: value }] }],
        },
      },
    });

    invalid.forEach((candidate) => expect(isActiveWorkoutMutation(candidate)).toBe(false));
  });

  test('rejects malformed bodies for every operation family', () => {
    const envelope = { ...mutation({ type: 'rename_workout', name: 'x' }), operation: undefined };
    const operations: unknown[] = [
      { type: 'start_workout' },
      { type: 'recover_workout', recovery_lifecycle: 'none', workout: null, old_epoch: 'x', old_operation_ids: [] },
      { type: 'recover_workout', recovery_lifecycle: 'active', workout: {}, old_epoch: 'x', old_operation_ids: [] },
      { type: 'recover_workout', recovery_lifecycle: 'active', workout: null, old_epoch: 1, old_operation_ids: [] },
      { type: 'recover_workout', recovery_lifecycle: 'active', workout: null, old_epoch: 'x', old_operation_ids: [1] },
      { type: 'rename_workout', name: 1 }, { type: 'update_workout_notes', notes: 1 },
      { type: 'add_exercise', exercise: {} }, { type: 'remove_exercise', exercise_id: 1 },
      { type: 'reorder_exercises', exercise_ids: [1] },
      { type: 'update_exercise', exercise_id: 1, field: 'notes', value: null },
      { type: 'update_exercise', exercise_id: 'x', field: 1, value: null },
      { type: 'update_exercise', exercise_id: 'x', field: 'position', value: null },
      { type: 'update_exercise', exercise_id: 'x', field: 'exercise_type', value: null },
      { type: 'add_set', exercise_id: 1, set: {} }, { type: 'add_set', exercise_id: 'x', set: {} },
      { type: 'remove_set', exercise_id: 1, set_id: 'x' }, { type: 'remove_set', exercise_id: 'x', set_id: 1 },
      { type: 'reorder_sets', exercise_id: 1, set_ids: [] }, { type: 'reorder_sets', exercise_id: 'x', set_ids: [1] },
      { type: 'update_set', set_id: 1, field: 'weight', value: 1 },
      { type: 'update_set', set_id: 'x', field: 1, value: 1 },
      { type: 'update_set', set_id: 'x', field: 'bad', value: 1 },
      { type: 'update_set', set_id: 'x', field: 'set_type', value: 1 },
      { type: 'update_set', set_id: 'x', field: 'weight', value: 'bad' },
      { type: 'complete_set', set_id: 1, exercise_id: 'x', completed: true, completed_at: null, alerted_record_types: [] },
      { type: 'complete_set', set_id: 'x', exercise_id: 1, completed: true, completed_at: null, alerted_record_types: [] },
      { type: 'complete_set', set_id: 'x', exercise_id: 'x', completed: 1, completed_at: null, alerted_record_types: [] },
      { type: 'complete_set', set_id: 'x', exercise_id: 'x', completed: true, completed_at: 1, alerted_record_types: [] },
      { type: 'complete_set', set_id: 'x', exercise_id: 'x', completed: true, completed_at: null, alerted_record_types: [1] },
      { type: 'finish_workout', ended_at: 1 }, { type: 'discard_workout', discarded_at: 1 },
    ];
    operations.forEach((operation) => expect(isActiveWorkoutMutation({ ...envelope, operation })).toBe(false));
  });

  it.each([
    [{ type: 'rename_workout', name: 'Heavy Day' }, ['workout:workout-1:name']],
    [
      { type: 'complete_set', set_id: 'set-1', exercise_id: 'occurrence-1', completed: true,
        completed_at: '2026-07-23T10:02:00.000Z', alerted_record_types: ['max_weight'] },
      ['alerts:occurrence-1', 'set:set-1:completed', 'set:set-1:completed_at'],
    ],
    [{ type: 'remove_exercise', exercise_id: 'occurrence-1' },
      ['exercise:occurrence-1:entity', 'exercise_order', 'set_order:occurrence-1']],
    [{ type: 'finish_workout', ended_at: '2026-07-23T11:00:00.000Z' },
      ['workout:workout-1:status']],
  ] as const)('derives authoritative conflict keys for %j', (operation, expected) => {
    expect(deriveConflictKeys(operation, 'workout-1')).toEqual(expected);
  });

  it('applies a mutation and treats identical replay as an idempotent no-op', () => {
    const edit = mutation({ type: 'update_set', set_id: 'set-1', field: 'weight', value: 105 });
    const applied = applyActiveWorkoutMutation(state, edit);
    expect(applied.kind).toBe('applied');
    if (applied.kind !== 'applied') return;
    expect(applied.state.workout?.exercises[0].sets[0].weight).toBe(105);

    const replay = applyActiveWorkoutMutation(applied.state, edit);
    expect(replay.kind).toBe('noop');
  });

  it('returns a replay conflict when an add reuses an id with different content', () => {
    const edit = mutation({
      type: 'add_set',
      exercise_id: 'occurrence-1',
      set: { ...state.workout!.exercises[0].sets[0], weight: 110 },
    });
    expect(applyActiveWorkoutMutation(state, edit)).toMatchObject({
      kind: 'conflict',
      reason: 'entity_mismatch',
    });
  });

  it('rejects encoded payloads above the Data Layer guard', () => {
    expect(ACTIVE_WORKOUT_MAX_PAYLOAD_BYTES).toBeLessThan(100_000);
    expect(() => assertActiveWorkoutPayloadSize({ payload: 'x'.repeat(100_000) })).toThrow(
      'active_workout_payload_too_large'
    );
  });

  it('applies and safely replays every structural mutation family', () => {
    const exercise = state.workout!.exercises[0];
    const set = exercise.sets[0];
    const secondSet = { ...set, id: 'set-2', position: 1 };
    const secondExercise = {
      ...exercise,
      id: 'occurrence-2',
      exercise_id: 'exercise-2',
      exercise_name: 'Bench',
      position: 1,
      sets: [secondSet],
    };
    const populated: ActiveWorkoutCanonicalState = {
      ...state,
      workout: { ...state.workout!, exercises: [exercise, secondExercise] },
    };
    const apply = (
      operation: ActiveWorkoutMutation['operation'],
      canonical: ActiveWorkoutCanonicalState = populated
    ) => applyActiveWorkoutMutation(canonical, mutation(operation));

    expect(apply({ type: 'rename_workout', name: 'Workout' }).kind).toBe('noop');
    expect(apply({ type: 'rename_workout', name: 'Heavy Day' }).kind).toBe('applied');
    expect(apply({ type: 'update_workout_notes', notes: 'Notes' }).kind).toBe('applied');

    const thirdExercise = { ...secondExercise, id: 'occurrence-3', position: 9 };
    expect(apply({ type: 'add_exercise', exercise: thirdExercise }).kind).toBe('applied');
    expect(apply({ type: 'add_exercise', exercise }).kind).toBe('noop');
    expect(apply({ type: 'add_exercise', exercise: { ...exercise, exercise_name: 'Other' } }).kind)
      .toBe('conflict');
    expect(apply({ type: 'remove_exercise', exercise_id: 'missing' }).kind).toBe('noop');
    expect(apply({ type: 'remove_exercise', exercise_id: exercise.id }).kind).toBe('applied');
    expect(apply({ type: 'reorder_exercises', exercise_ids: [secondExercise.id, exercise.id] }).kind)
      .toBe('applied');
    expect(apply({ type: 'reorder_exercises', exercise_ids: [exercise.id] }).kind).toBe('conflict');
    expect(apply({ type: 'reorder_exercises', exercise_ids: [exercise.id, exercise.id] }).kind)
      .toBe('conflict');
    expect(apply({ type: 'reorder_exercises', exercise_ids: [exercise.id, 'missing'] }).kind)
      .toBe('conflict');
    expect(apply({
      type: 'update_exercise', exercise_id: exercise.id, field: 'notes', value: 'Deep',
    }).kind).toBe('applied');
    expect(apply({
      type: 'update_exercise', exercise_id: 'missing', field: 'notes', value: 'Deep',
    }).kind).toBe('conflict');

    const newSet = { ...set, id: 'set-3', position: 8 };
    expect(apply({ type: 'add_set', exercise_id: exercise.id, set: newSet }).kind).toBe('applied');
    expect(apply({ type: 'add_set', exercise_id: exercise.id, set }).kind).toBe('noop');
    expect(apply({ type: 'add_set', exercise_id: exercise.id, set: { ...set, reps: 99 } }).kind)
      .toBe('conflict');
    expect(apply({ type: 'add_set', exercise_id: 'missing', set: newSet }).kind).toBe('conflict');
    expect(apply({ type: 'remove_set', exercise_id: exercise.id, set_id: set.id }).kind)
      .toBe('applied');
    expect(apply({ type: 'remove_set', exercise_id: exercise.id, set_id: 'missing' }).kind)
      .toBe('noop');
    expect(apply({ type: 'remove_set', exercise_id: 'missing', set_id: set.id }).kind)
      .toBe('conflict');
    expect(apply({ type: 'reorder_sets', exercise_id: exercise.id, set_ids: [set.id] }).kind)
      .toBe('noop');
    expect(apply({ type: 'reorder_sets', exercise_id: exercise.id, set_ids: [] }).kind)
      .toBe('conflict');
    expect(apply({ type: 'reorder_sets', exercise_id: 'missing', set_ids: [] }).kind)
      .toBe('conflict');
    expect(apply({ type: 'update_set', set_id: set.id, field: 'weight', value: 110 }).kind)
      .toBe('applied');
    expect(apply({ type: 'update_set', set_id: 'missing', field: 'weight', value: 110 }).kind)
      .toBe('conflict');
    expect(apply({
      type: 'complete_set', set_id: set.id, exercise_id: exercise.id, completed: true,
      completed_at: '2026-07-23T10:10:00Z', alerted_record_types: ['max_weight', 'max_weight'],
    }).kind).toBe('applied');
    expect(apply({
      type: 'complete_set', set_id: 'missing', exercise_id: exercise.id, completed: true,
      completed_at: null, alerted_record_types: [],
    }).kind).toBe('conflict');
    expect(apply({
      type: 'complete_set', set_id: set.id, exercise_id: 'missing', completed: true,
      completed_at: null, alerted_record_types: [],
    }).kind).toBe('conflict');
  });

  it('enforces coordinator, identity, start, and terminal invariants', () => {
    const start = mutation({ type: 'start_workout', workout: state.workout! });
    expect(applyActiveWorkoutMutation(state, { ...start, conflict_keys: [] }))
      .toMatchObject({ reason: 'conflict_key_mismatch' });
    expect(applyActiveWorkoutMutation(state, { ...start, protocol_version: 2 as 1 }))
      .toMatchObject({ reason: 'unsupported_version' });
    expect(applyActiveWorkoutMutation(state, { ...start, coordinator_epoch: 'other' }))
      .toMatchObject({ reason: 'coordinator_epoch_mismatch' });
    expect(applyActiveWorkoutMutation(state, start)).toMatchObject({ kind: 'noop' });
    expect(applyActiveWorkoutMutation(
      { ...state, lifecycle: 'none', workout: null, workout_id: null }, start
    )).toMatchObject({ kind: 'applied' });

    const otherWorkout = { ...state.workout!, id: 'other' };
    const otherStart = {
      ...mutation({ type: 'start_workout', workout: otherWorkout }),
      workout_id: 'other',
    };
    otherStart.conflict_keys = deriveConflictKeys(otherStart.operation, 'other');
    expect(applyActiveWorkoutMutation(state, otherStart))
      .toMatchObject({ reason: 'independent_active_workout' });
    expect(applyActiveWorkoutMutation(state, mutation({
      type: 'recover_workout', recovery_lifecycle: 'discarded', workout: null,
      old_epoch: 'old', old_operation_ids: [],
    }))).toMatchObject({ reason: 'missing_workout' });

    const rename = mutation({ type: 'rename_workout', name: 'Other' });
    expect(applyActiveWorkoutMutation({ ...state, workout: null }, rename))
      .toMatchObject({ reason: 'active_workout_mismatch' });
    const wrongWorkout = { ...rename, workout_id: 'other' };
    wrongWorkout.conflict_keys = deriveConflictKeys(wrongWorkout.operation, 'other');
    expect(applyActiveWorkoutMutation(state, wrongWorkout))
      .toMatchObject({ reason: 'active_workout_mismatch' });

    const finish = mutation({ type: 'finish_workout', ended_at: '2026-07-23T11:00:00Z' });
    const appliedFinish = applyActiveWorkoutMutation(state, finish);
    expect(appliedFinish.kind).toBe('applied');
    if (appliedFinish.kind !== 'applied') return;
    expect(applyActiveWorkoutMutation(appliedFinish.state, finish)).toMatchObject({ kind: 'noop' });
    expect(applyActiveWorkoutMutation(appliedFinish.state, {
      ...finish, operation: { type: 'finish_workout', ended_at: 'other' },
    })).toMatchObject({ reason: 'terminal_mismatch' });

    const discard = mutation({ type: 'discard_workout', discarded_at: '2026-07-23T11:00:00Z' });
    const appliedDiscard = applyActiveWorkoutMutation(state, discard);
    expect(appliedDiscard.kind).toBe('applied');
    if (appliedDiscard.kind !== 'applied') return;
    expect(applyActiveWorkoutMutation(appliedDiscard.state, discard)).toMatchObject({ kind: 'noop' });
    expect(applyActiveWorkoutMutation(appliedFinish.state, discard))
      .toMatchObject({ reason: 'terminal_mismatch' });
  });

  it('normalizes omitted fields and stable JSON with every UTF-8 width', () => {
    const minimal: ActiveWorkoutSnapshot = {
      id: 'workout-minimal', name: 'Minimal', started_at: 'now', exercises: [{
        id: 'exercise-minimal', exercise_id: 'exercise', exercise_name: 'Exercise', position: 0,
        exercise_type: 'weight_reps', pr_baselines: {}, alerted_record_types: [], sets: [{
          id: 'set-minimal', position: 0, set_type: 'normal', completed: false,
        } as ActiveWorkoutSnapshot['exercises'][number]['sets'][number]],
      }],
    } as unknown as ActiveWorkoutSnapshot;
    const parsed = parseActiveWorkoutMutation(mutation({ type: 'start_workout', workout: minimal }));
    expect(parsed?.operation).toMatchObject({
      workout: {
        routine_id: null, ended_at: null, notes: null, bodyweight_kg: null,
        routine_structure_version: null,
      },
    });
    expect(normalizedActiveWorkoutJson({ z: 'é漢😀', a: [2, 1] }))
      .toBe('{"a":[2,1],"z":"é漢😀"}');
    expect(() => assertActiveWorkoutPayloadSize('é漢😀')).not.toThrow();
  });
});
