import {
  computeRecordState,
  effectiveLoadKg,
  estimateOneRepMax,
  type ExerciseOccurrence,
} from '../personalRecords';

function occurrence(
  id: string,
  startedAt: string,
  sets: ExerciseOccurrence['sets'],
  exerciseType: ExerciseOccurrence['exerciseType'] = 'weight_reps'
): ExerciseOccurrence {
  return {
    id,
    workoutId: `workout-${id}`,
    exerciseId: 'bench',
    exerciseType,
    startedAt,
    position: 0,
    sets,
  };
}

test('first occurrence seeds current records but emits no PR events', () => {
  const state = computeRecordState([
    occurrence('first', '2026-07-01T10:00:00.000Z', [
      {
        id: 'set-1',
        position: 0,
        setType: 'normal',
        weight: 100,
        reps: 5,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: '2026-07-01T10:05:00.000Z',
      },
    ]),
  ]);

  expect(state.events).toEqual([]);
  expect(state.currentRecords).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'max_weight', value: 100, loggedSetId: 'set-1' }),
      expect.objectContaining({ type: 'max_volume', value: 500, loggedSetId: 'set-1' }),
      expect.objectContaining({ type: 'est_1rm', loggedSetId: 'set-1' }),
    ])
  );
  expect(state.currentRecords.some((record) => record.type === 'max_reps')).toBe(false);
});

test('later occurrence emits one event per improved metric on occurrence-best sets', () => {
  const state = computeRecordState([
    occurrence('first', '2026-07-01T10:00:00.000Z', [
      {
        id: 'baseline-heavy',
        position: 0,
        setType: 'normal',
        weight: 100,
        reps: 5,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: '2026-07-01T10:05:00.000Z',
      },
    ]),
    occurrence('second', '2026-07-08T10:00:00.000Z', [
      {
        id: 'ramp',
        position: 0,
        setType: 'normal',
        weight: 105,
        reps: 3,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: '2026-07-08T10:05:00.000Z',
      },
      {
        id: 'top',
        position: 1,
        setType: 'normal',
        weight: 110,
        reps: 5,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: '2026-07-08T10:08:00.000Z',
      },
    ]),
  ]);

  expect(state.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'max_weight', value: 110, loggedSetId: 'top' }),
      expect.objectContaining({ type: 'max_volume', value: 550, loggedSetId: 'top' }),
    ])
  );
  expect(state.events.filter((event) => event.type === 'max_weight')).toHaveLength(1);
  expect(state.events.some((event) => event.loggedSetId === 'ramp')).toBe(false);
});

test('warmups are excluded and ties do not emit PR events', () => {
  const state = computeRecordState([
    occurrence('first', '2026-07-01T10:00:00.000Z', [
      {
        id: 'baseline',
        position: 0,
        setType: 'normal',
        weight: 100,
        reps: 5,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: '2026-07-01T10:05:00.000Z',
      },
    ]),
    occurrence('second', '2026-07-08T10:00:00.000Z', [
      {
        id: 'warmup',
        position: 0,
        setType: 'warmup',
        weight: 140,
        reps: 5,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: '2026-07-08T10:05:00.000Z',
      },
      {
        id: 'tie',
        position: 1,
        setType: 'normal',
        weight: 100,
        reps: 5,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: '2026-07-08T10:08:00.000Z',
      },
    ]),
  ]);

  expect(state.events).toEqual([]);
  expect(state.currentRecords.find((record) => record.type === 'max_weight')).toEqual(
    expect.objectContaining({ value: 100, loggedSetId: 'baseline' })
  );
});

test('completed rows with missing completed_at still use fallback timestamps', () => {
  const state = computeRecordState(
    [
      occurrence('first', '2026-07-01T10:00:00.000Z', [
        {
          id: 'legacy-completed',
          position: 0,
          setType: 'normal',
          weight: 100,
          reps: 5,
          durationSeconds: null,
          distanceMeters: null,
          completedAt: null,
        },
      ]),
    ],
    { fallbackAchievedAt: '2026-07-01T10:05:00.000Z' }
  );

  expect(state.currentRecords).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'max_weight',
        value: 100,
        achievedAt: '2026-07-01T10:05:00.000Z',
        loggedSetId: 'legacy-completed',
      }),
    ])
  );
});

test('assisted bodyweight uses bodyweight only when available', () => {
  const assistedSet = {
    id: 'assisted',
    position: 0,
    setType: 'normal' as const,
    weight: 20,
    reps: 8,
    durationSeconds: null,
    distanceMeters: null,
    completedAt: '2026-07-01T10:05:00.000Z',
  };

  expect(effectiveLoadKg({ exerciseType: 'assisted_bodyweight', weight: 20, bodyweightKg: 80 })).toBe(
    60
  );
  expect(
    computeRecordState([occurrence('first', '2026-07-01T10:00:00.000Z', [assistedSet], 'assisted_bodyweight')])
      .currentRecords
  ).toEqual([expect.objectContaining({ type: 'max_reps', value: 8 })]);
  expect(
    computeRecordState([
      occurrence('first', '2026-07-01T10:00:00.000Z', [assistedSet], 'assisted_bodyweight'),
    ], {
      bodyweightKg: 80,
    }).currentRecords
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'max_reps', value: 8 }),
      expect.objectContaining({ type: 'max_volume', value: 480 }),
    ])
  );
});

test('Hevy-style estimated 1RM table is capped to supported reps', () => {
  expect(estimateOneRepMax(75, 10)).toBeCloseTo(100);
  expect(estimateOneRepMax(75, 16)).toBeNull();
});
