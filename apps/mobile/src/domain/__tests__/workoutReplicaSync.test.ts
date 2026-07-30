import {
  canonicalWorkoutContentEqual,
  compareEntryVersions,
  joinActiveWorkoutBodies,
  materializeActiveWorkout,
  resolveSameWorkout,
  selectCurrentGeneration,
  selectOutboundCandidate,
  type ActiveWorkoutBody,
  type AuthoredWorkoutReplica,
  type EntryVersion,
  type WorkoutReplica,
} from '../workoutReplicaSync';

const phoneVersion = (changed_at_ms: number): EntryVersion => ({
  changed_at_ms,
  writer: 'phone',
});

const watchVersion = (changed_at_ms: number): EntryVersion => ({
  changed_at_ms,
  writer: 'watch',
});

function activeBody(version: EntryVersion, name = 'Workout'): ActiveWorkoutBody {
  return {
    fields: {
      routine_id: { version, value: null },
      routine_structure_version: { version, value: null },
      name: { version, value: name },
      notes: { version, value: null },
      bodyweight_kg: { version, value: null },
    },
    exercises: [],
  };
}

function activeReplica(
  writer: 'phone' | 'watch',
  changedAt: number,
  body: ActiveWorkoutBody,
  workoutId = 'workout-1',
  startedAt = 100
): AuthoredWorkoutReplica {
  return {
    writer,
    replica: {
      workout_id: workoutId,
      started_at_ms: startedAt,
      changed_at_ms: changedAt,
      state: { kind: 'active', workout: body },
    },
  };
}

function finishedReplica(
  writer: 'phone' | 'watch',
  changedAt: number,
  name: string,
  workoutId = 'workout-1',
  startedAt = 100
): AuthoredWorkoutReplica {
  return {
    writer,
    replica: {
      workout_id: workoutId,
      started_at_ms: startedAt,
      changed_at_ms: changedAt,
      state: {
        kind: 'finished',
        ended_at_ms: changedAt,
        workout: {
          routine_id: null,
          routine_structure_version: null,
          name,
          notes: null,
          bodyweight_kg: null,
          exercises: [],
        },
      },
    },
  };
}

describe('workout replica merge', () => {
  test('canonical content equality ignores JSON object key order', () => {
    expect(
      canonicalWorkoutContentEqual(
        { state: { kind: 'discarded' }, changed_at_ms: 2, workout_id: 'w1' },
        { workout_id: 'w1', changed_at_ms: 2, state: { kind: 'discarded' } }
      )
    ).toBe(true);
  });

  test('compares versions by timestamp and then writer', () => {
    expect(compareEntryVersions(phoneVersion(2), watchVersion(1))).toBeGreaterThan(0);
    expect(compareEntryVersions(watchVersion(2), phoneVersion(2))).toBeGreaterThan(0);
    expect(compareEntryVersions(phoneVersion(2), phoneVersion(2))).toBe(0);
  });

  test('preserves independent field, exercise, and nested-set changes', () => {
    const baseVersion = phoneVersion(1);
    const phone = activeBody(baseVersion, 'Phone name');
    phone.fields.name = { version: phoneVersion(3), value: 'Phone name' };
    phone.exercises = [
      {
        id: 'exercise-1',
        version: phoneVersion(2),
        deleted: false,
        position: 0,
        value: {
          exercise_id: 'bench',
          exercise_name: 'Bench Press',
          source_routine_exercise_id: null,
          superset_group_id: null,
          exercise_type: 'weight_reps',
          notes: 'phone note',
        },
        sets: [],
      },
    ];

    const watch = activeBody(baseVersion, 'Workout');
    watch.fields.notes = { version: watchVersion(4), value: 'watch workout note' };
    watch.exercises = [
      {
        ...phone.exercises[0],
        version: watchVersion(1),
        value: { ...phone.exercises[0].value!, notes: null },
        sets: [
          {
            id: 'set-1',
            version: watchVersion(5),
            deleted: false,
            position: 0,
            value: {
              source_routine_set_id: null,
              set_type: 'normal',
              weight: 80,
              reps: 8,
              duration_seconds: null,
              distance_meters: null,
              rpe: null,
              completed: true,
              completed_at_ms: 5,
            },
          },
        ],
      },
    ];

    const joined = joinActiveWorkoutBodies(phone, watch);

    expect(joined.fields.name.value).toBe('Phone name');
    expect(joined.fields.notes.value).toBe('watch workout note');
    expect(joined.exercises[0].value?.notes).toBe('phone note');
    expect(joined.exercises[0].sets).toHaveLength(1);
    expect(joined.exercises[0].sets[0].value?.weight).toBe(80);
  });

  test('resolves same-entry edits and deletion-versus-edit by entry version', () => {
    const older = activeBody(phoneVersion(1));
    older.exercises = [
      {
        id: 'exercise-1',
        version: phoneVersion(2),
        deleted: false,
        position: 0,
        value: {
          exercise_id: 'bench',
          exercise_name: 'Bench Press',
          source_routine_exercise_id: null,
          superset_group_id: null,
          exercise_type: 'weight_reps',
          notes: null,
        },
        sets: [],
      },
    ];
    const deleted = activeBody(watchVersion(1));
    deleted.exercises = [
      {
        id: 'exercise-1',
        version: watchVersion(3),
        deleted: true,
        position: null,
        value: null,
        sets: [],
      },
    ];

    expect(joinActiveWorkoutBodies(older, deleted).exercises[0].deleted).toBe(true);
    expect(joinActiveWorkoutBodies(deleted, older).exercises[0].deleted).toBe(true);
  });

  test('join is commutative, associative, and idempotent', () => {
    const a = activeBody(phoneVersion(1), 'A');
    const b = activeBody(watchVersion(2), 'B');
    b.fields.notes = { version: watchVersion(3), value: 'B notes' };
    const c = activeBody(phoneVersion(4), 'C');

    expect(joinActiveWorkoutBodies(a, b)).toEqual(joinActiveWorkoutBodies(b, a));
    expect(joinActiveWorkoutBodies(a, a)).toEqual(a);
    expect(joinActiveWorkoutBodies(joinActiveWorkoutBodies(a, b), c)).toEqual(
      joinActiveWorkoutBodies(a, joinActiveWorkoutBodies(b, c))
    );
  });

  test('materialization hides tombstones and orders entries by position then id', () => {
    const body = activeBody(phoneVersion(1));
    const exerciseValue = {
      exercise_id: 'bench',
      exercise_name: 'Bench Press',
      source_routine_exercise_id: null,
      superset_group_id: null,
      exercise_type: 'weight_reps',
      notes: null,
    };
    body.exercises = [
      {
        id: 'hidden',
        version: phoneVersion(4),
        deleted: true,
        position: null,
        value: null,
        sets: [],
      },
      {
        id: 'b',
        version: phoneVersion(2),
        deleted: false,
        position: 1,
        value: exerciseValue,
        sets: [],
      },
      {
        id: 'a',
        version: phoneVersion(3),
        deleted: false,
        position: 0,
        value: exerciseValue,
        sets: [],
      },
    ];

    expect(materializeActiveWorkout(body).exercises.map((exercise) => exercise.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('workout lifecycle and outbound selection', () => {
  test('finished wins unchanged over active and discarded', () => {
    const active = activeReplica('phone', 9, activeBody(phoneVersion(9)));
    const finished = finishedReplica('watch', 8, 'Watch snapshot');
    const discarded: AuthoredWorkoutReplica = {
      writer: 'phone',
      replica: {
        workout_id: 'workout-1',
        started_at_ms: 100,
        changed_at_ms: 10,
        state: { kind: 'discarded' },
      },
    };

    expect(resolveSameWorkout(active, finished, 'phone', 11)).toEqual(finished);
    expect(resolveSameWorkout(discarded, finished, 'phone', 11)).toEqual(finished);
  });

  test('two finished candidates choose one whole snapshot', () => {
    const phone = finishedReplica('phone', 8, 'Phone snapshot');
    const watch = finishedReplica('watch', 9, 'Watch snapshot');

    const resolved = resolveSameWorkout(phone, watch, 'phone', 10);

    expect(resolved).toEqual(watch);
    expect(resolved.replica.state.kind).toBe('finished');
    if (resolved.replica.state.kind === 'finished') {
      expect(resolved.replica.state.workout.name).toBe('Watch snapshot');
    }
  });

  test('a composite active join gets one local envelope without rewriting entry versions', () => {
    const phoneBody = activeBody(phoneVersion(1), 'Phone');
    const watchBody = activeBody(phoneVersion(1), 'Workout');
    watchBody.fields.notes = { version: watchVersion(2), value: 'Watch' };

    const resolved = resolveSameWorkout(
      activeReplica('phone', 3, phoneBody),
      activeReplica('watch', 2, watchBody),
      'phone',
      4
    );

    expect(resolved.writer).toBe('phone');
    expect(resolved.replica.changed_at_ms).toBe(4);
    if (resolved.replica.state.kind === 'active') {
      expect(resolved.replica.state.workout.fields.name.version).toEqual(phoneVersion(1));
      expect(resolved.replica.state.workout.fields.notes.version).toEqual(watchVersion(2));
    }
  });

  test('current generation is selected independently from lifecycle rank', () => {
    const olderFinished = finishedReplica('phone', 500, 'Old', 'old', 100);
    const newerActive = activeReplica('watch', 201, activeBody(watchVersion(201)), 'new', 200);

    expect(selectCurrentGeneration([olderFinished, newerActive])).toEqual(newerActive);
  });

  test('watch outbound selection prefers the oldest pending finish', () => {
    const active = activeReplica('watch', 30, activeBody(watchVersion(30))).replica;
    const finishedA = finishedReplica('watch', 10, 'A', 'a', 1).replica;
    const finishedB = finishedReplica('watch', 20, 'B', 'b', 2).replica;

    expect(
      selectOutboundCandidate('watch', {
        pending_finished: [finishedA, finishedB],
        transport_intent: active,
      })
    ).toEqual(finishedA);
    expect(
      selectOutboundCandidate('phone', {
        pending_finished: [finishedA],
        transport_intent: active,
      })
    ).toEqual(active);
  });
});

// Keeps the imported wire type exercised by TypeScript as the schema evolves.
const _replicaTypeCheck: WorkoutReplica | null = null;
void _replicaTypeCheck;
