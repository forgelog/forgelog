import type {
  AuthoredWorkoutReplica,
  WorkoutMailbox,
  WorkoutReplica,
} from '../../domain/workoutReplicaSync';
import {
  receiptMatchesPendingFinish,
  validateWorkoutMailbox,
} from '../workoutMailboxValidator';

const validMailbox = require('../../../../../data/contracts/fixtures/workout-mailbox.json') as WorkoutMailbox;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mailboxWithEntries(): WorkoutMailbox {
  const mailbox = clone(validMailbox);
  if (mailbox.candidate?.state.kind !== 'active') throw new Error('fixture must be active');
  const version = { changed_at_ms: 1001, writer: 'watch' as const };
  mailbox.candidate.state.workout.exercises = [
    {
      id: 'exercise-1',
      version,
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
      sets: [
        {
          id: 'set-1',
          version,
          deleted: false,
          position: 0,
          value: {
            source_routine_set_id: null,
            set_type: 'normal',
            weight: 60,
            reps: 8,
            duration_seconds: null,
            distance_meters: null,
            rpe: null,
            completed: true,
            completed_at_ms: 1001,
          },
        },
      ],
    },
  ];
  return mailbox;
}

describe('workout mailbox validation', () => {
  test('accepts the shared valid fixture from the watch path', () => {
    expect(validateWorkoutMailbox('watch', validMailbox, [])).toEqual(validMailbox);
  });

  test('rejects unsupported versions and receipts in the watch mailbox', () => {
    expect(
      validateWorkoutMailbox('watch', { ...validMailbox, protocol_version: 99 } as unknown, [])
    ).toBeNull();
    expect(
      validateWorkoutMailbox(
        'watch',
        {
          ...validMailbox,
          watch_receipt: {
            workout_id: 'workout-1',
            watch_started_at_ms: 1000,
            watch_changed_at_ms: 1002,
          },
        },
        []
      )
    ).toBeNull();
  });

  test('keeps a valid phone receipt when its coexisting candidate is invalid', () => {
    const receipt = {
      workout_id: 'workout-1',
      watch_started_at_ms: 1000,
      watch_changed_at_ms: 1002,
    };

    expect(
      validateWorkoutMailbox(
        'phone',
        {
          protocol_version: 1,
          candidate: { invalid: true },
          watch_receipt: receipt,
        },
        []
      )
    ).toEqual({ protocol_version: 1, candidate: null, watch_receipt: receipt });
  });

  test('rejects a watch mailbox whose only candidate is schema-invalid', () => {
    expect(
      validateWorkoutMailbox(
        'watch',
        {
          protocol_version: 1,
          candidate: { invalid: true },
          watch_receipt: null,
        },
        []
      )
    ).toBeNull();
  });

  test('rejects non-canonical arrays, invalid tombstones, and future entry versions', () => {
    const mailbox = clone(validMailbox);
    if (mailbox.candidate?.state.kind !== 'active') throw new Error('fixture must be active');
    const version = { changed_at_ms: 1001, writer: 'watch' as const };
    mailbox.candidate.state.workout.exercises = [
      {
        id: 'z',
        version,
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
      {
        id: 'a',
        version,
        deleted: true,
        position: 1,
        value: null,
        sets: [],
      },
    ];

    expect(validateWorkoutMailbox('watch', mailbox, [])?.candidate).toBeNull();

    mailbox.candidate.state.workout.exercises = [];
    mailbox.candidate.state.workout.fields.name.version.changed_at_ms = 1003;
    expect(validateWorkoutMailbox('watch', mailbox, [])?.candidate).toBeNull();
  });

  test('accepts a canonical live exercise and set', () => {
    const mailbox = mailboxWithEntries();

    expect(validateWorkoutMailbox('watch', mailbox, [])?.candidate).toEqual(mailbox.candidate);
  });

  test.each([
    ['future set version', (mailbox: WorkoutMailbox) => {
      if (mailbox.candidate?.state.kind === 'active') {
        mailbox.candidate.state.workout.exercises[0].sets[0].version.changed_at_ms = 1003;
      }
    }],
    ['live set with negative position', (mailbox: WorkoutMailbox) => {
      if (mailbox.candidate?.state.kind === 'active') {
        mailbox.candidate.state.workout.exercises[0].sets[0].position = -1;
      }
    }],
    ['invalid set tombstone', (mailbox: WorkoutMailbox) => {
      if (mailbox.candidate?.state.kind === 'active') {
        const set = mailbox.candidate.state.workout.exercises[0].sets[0];
        set.deleted = true;
        set.position = null;
      }
    }],
    ['incomplete set with completion time', (mailbox: WorkoutMailbox) => {
      if (mailbox.candidate?.state.kind === 'active') {
        const value = mailbox.candidate.state.workout.exercises[0].sets[0].value;
        if (value) value.completed = false;
      }
    }],
    ['future exercise version', (mailbox: WorkoutMailbox) => {
      if (mailbox.candidate?.state.kind === 'active') {
        mailbox.candidate.state.workout.exercises[0].version.changed_at_ms = 1003;
      }
    }],
    ['live exercise with negative position', (mailbox: WorkoutMailbox) => {
      if (mailbox.candidate?.state.kind === 'active') {
        mailbox.candidate.state.workout.exercises[0].position = -1;
      }
    }],
    ['invalid exercise tombstone', (mailbox: WorkoutMailbox) => {
      if (mailbox.candidate?.state.kind === 'active') {
        const exercise = mailbox.candidate.state.workout.exercises[0];
        exercise.deleted = true;
        exercise.value = null;
      }
    }],
    ['non-canonical sets', (mailbox: WorkoutMailbox) => {
      if (mailbox.candidate?.state.kind === 'active') {
        const set = mailbox.candidate.state.workout.exercises[0].sets[0];
        mailbox.candidate.state.workout.exercises[0].sets = [
          { ...clone(set), id: 'set-z' },
          set,
        ];
      }
    }],
  ])('drops %s independently', (_name, mutate) => {
    const mailbox = mailboxWithEntries();
    mutate(mailbox);

    expect(validateWorkoutMailbox('watch', mailbox, [])?.candidate).toBeNull();
  });

  test('rejects reused workout and entry versions with conflicting canonical content', () => {
    const known = clone(validMailbox.candidate) as WorkoutReplica;
    const knownAuthored: AuthoredWorkoutReplica = { writer: 'watch', replica: known };
    const conflicting = clone(validMailbox);
    if (conflicting.candidate?.state.kind !== 'active') throw new Error('fixture must be active');
    conflicting.candidate.state.workout.fields.name.value = 'Different name';

    expect(validateWorkoutMailbox('watch', conflicting, [knownAuthored])?.candidate).toBeNull();

    const reusedId = clone(validMailbox);
    if (!reusedId.candidate) throw new Error('fixture must have candidate');
    reusedId.candidate.started_at_ms += 1;
    expect(validateWorkoutMailbox('watch', reusedId, [knownAuthored])?.candidate).toBeNull();
  });

  test('rejects reused exercise and set versions or a moved set id', () => {
    const knownMailbox = mailboxWithEntries();
    const known = clone(knownMailbox.candidate) as WorkoutReplica;
    const knownAuthored: AuthoredWorkoutReplica = { writer: 'watch', replica: known };

    const exerciseConflict = mailboxWithEntries();
    if (exerciseConflict.candidate?.state.kind !== 'active') throw new Error('Expected active');
    exerciseConflict.candidate.changed_at_ms = 1003;
    const exerciseValue = exerciseConflict.candidate.state.workout.exercises[0].value;
    if (!exerciseValue) throw new Error('Expected live exercise');
    exerciseValue.notes = 'Different';
    expect(
      validateWorkoutMailbox('watch', exerciseConflict, [knownAuthored])?.candidate
    ).toBeNull();

    const setConflict = mailboxWithEntries();
    if (setConflict.candidate?.state.kind !== 'active') throw new Error('Expected active');
    setConflict.candidate.changed_at_ms = 1003;
    const setValue = setConflict.candidate.state.workout.exercises[0].sets[0].value;
    if (!setValue) throw new Error('Expected live set');
    setValue.weight = 70;
    expect(validateWorkoutMailbox('watch', setConflict, [knownAuthored])?.candidate).toBeNull();

    const movedSet = mailboxWithEntries();
    if (movedSet.candidate?.state.kind !== 'active') throw new Error('Expected active');
    movedSet.candidate.changed_at_ms = 1003;
    const originalExercise = movedSet.candidate.state.workout.exercises[0];
    const moved = originalExercise.sets[0];
    originalExercise.sets = [];
    movedSet.candidate.state.workout.exercises.push({
      ...clone(originalExercise),
      id: 'exercise-2',
      sets: [moved],
    });
    expect(validateWorkoutMailbox('watch', movedSet, [knownAuthored])?.candidate).toBeNull();
  });

  test('rejects an invalid finished lifecycle and incomplete completion timestamp', () => {
    const finished: WorkoutReplica = {
      workout_id: 'finished-1',
      started_at_ms: 100,
      changed_at_ms: 200,
      state: {
        kind: 'finished',
        ended_at_ms: 99,
        workout: {
          routine_id: null,
          routine_structure_version: null,
          name: 'Finished',
          notes: null,
          bodyweight_kg: null,
          exercises: [],
        },
      },
    };
    expect(validateWorkoutMailbox('watch', {
      protocol_version: 1,
      candidate: finished,
      watch_receipt: null,
    }, [])?.candidate).toBeNull();

    finished.state = {
      kind: 'finished',
      ended_at_ms: 200,
      workout: {
        routine_id: null,
        routine_structure_version: null,
        name: 'Finished',
        notes: null,
        bodyweight_kg: null,
        exercises: [
          {
            id: 'exercise-1',
            exercise_id: 'bench',
            exercise_name: 'Bench Press',
            source_routine_exercise_id: null,
            superset_group_id: null,
            exercise_type: 'weight_reps',
            notes: null,
            sets: [
              {
                id: 'set-1',
                source_routine_set_id: null,
                set_type: 'normal',
                weight: 60,
                reps: 8,
                duration_seconds: null,
                distance_meters: null,
                rpe: null,
                completed: false,
                completed_at_ms: 150,
              },
            ],
          },
        ],
      },
    };
    expect(validateWorkoutMailbox('watch', {
      protocol_version: 1,
      candidate: finished,
      watch_receipt: null,
    }, [])?.candidate).toBeNull();
  });

  test('matches receipts to one exact pending watch finish', () => {
    const pending: WorkoutReplica = {
      workout_id: 'workout-1',
      started_at_ms: 1000,
      changed_at_ms: 1002,
      state: {
        kind: 'finished',
        ended_at_ms: 1002,
        workout: {
          routine_id: null,
          routine_structure_version: null,
          name: 'Workout',
          notes: null,
          bodyweight_kg: null,
          exercises: [],
        },
      },
    };
    const exact = {
      workout_id: 'workout-1',
      watch_started_at_ms: 1000,
      watch_changed_at_ms: 1002,
    };

    expect(receiptMatchesPendingFinish(exact, pending)).toBe(true);
    expect(receiptMatchesPendingFinish({ ...exact, watch_changed_at_ms: 1003 }, pending)).toBe(
      false
    );
  });
});
