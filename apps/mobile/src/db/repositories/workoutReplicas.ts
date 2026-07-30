import {
  compareCanonicalStrings,
  materializeActiveWorkout,
  type ActiveLoggedSet,
  type ActiveWorkoutBody,
  type AuthoredWorkoutReplica,
  type EntryVersion,
  type LoggedSetFields,
  type WorkoutBody,
  type WorkoutExerciseBody,
  type WorkoutMailbox,
  type WorkoutReplica,
} from '../../domain/workoutReplicaSync';
import { computeRecordState } from '../../domain/personalRecords';
import { requireExerciseType } from '../../domain/setFields';
import type { DatabaseExecutor } from '../executor';
import { id } from '../id';
import { replaceRecordStateForExerciseInDb } from '../personalRecordState';
import type {
  Exercise,
  LoggedSet,
  PersonalRecord,
  PersonalRecordEvent,
  RecordType,
  SetType,
  Workout,
  WorkoutDetail,
  WorkoutExercise,
  WorkoutExerciseDetail,
} from '../types';
import { getExercise } from './exercises';
import { getRecordsForExercise } from './personalRecords';
import { getProfile } from './profile';
import { getRoutineDetail } from './routines';
import { getWorkoutDetail, type LoggedSetValueUpdate } from './workouts';

type ReplicaRow = {
  workout_id: string;
  started_at_ms: number;
  state_kind: 'active' | 'finished' | 'discarded';
  ended_at_ms: number | null;
  changed_at_ms: number;
  writer: 'phone' | 'watch';
  replica_json: string;
};

const PHONE_WRITER = 'phone' as const;
const EMPTY_MAILBOX: WorkoutMailbox = {
  protocol_version: 1,
  candidate: null,
  watch_receipt: null,
};

function version(changedAtMs: number): EntryVersion {
  return { changed_at_ms: changedAtMs, writer: PHONE_WRITER };
}

function parseRow(row: ReplicaRow): AuthoredWorkoutReplica {
  return {
    writer: row.writer,
    replica: JSON.parse(row.replica_json) as WorkoutReplica,
  };
}

async function loadReplicaRow(
  db: DatabaseExecutor,
  workoutId: string
): Promise<AuthoredWorkoutReplica | null> {
  const row = await db.getFirstAsync<ReplicaRow>(
    'SELECT * FROM workout_replica_state WHERE workout_id = $id',
    { $id: workoutId }
  );
  return row ? parseRow(row) : null;
}

async function loadCurrentGeneration(
  db: DatabaseExecutor
): Promise<AuthoredWorkoutReplica | null> {
  const row = await db.getFirstAsync<ReplicaRow>(
    `SELECT * FROM workout_replica_state
      ORDER BY started_at_ms DESC, workout_id DESC
      LIMIT 1`
  );
  return row ? parseRow(row) : null;
}

export async function listAuthoredWorkoutReplicas(
  db: DatabaseExecutor
): Promise<AuthoredWorkoutReplica[]> {
  const rows = await db.getAllAsync<ReplicaRow>(
    'SELECT * FROM workout_replica_state ORDER BY started_at_ms, workout_id'
  );
  return rows.map(parseRow);
}

export async function saveAuthoredWorkoutReplica(
  db: DatabaseExecutor,
  authored: AuthoredWorkoutReplica
): Promise<void> {
  const { replica, writer } = authored;
  await db.runAsync(
    `INSERT INTO workout_replica_state
       (workout_id, started_at_ms, state_kind, ended_at_ms,
        changed_at_ms, writer, replica_json)
     VALUES
       ($workout_id, $started_at_ms, $state_kind, $ended_at_ms,
        $changed_at_ms, $writer, $replica_json)
     ON CONFLICT(workout_id) DO UPDATE SET
       started_at_ms = excluded.started_at_ms,
       state_kind = excluded.state_kind,
       ended_at_ms = excluded.ended_at_ms,
       changed_at_ms = excluded.changed_at_ms,
       writer = excluded.writer,
       replica_json = excluded.replica_json`,
    {
      $workout_id: replica.workout_id,
      $started_at_ms: replica.started_at_ms,
      $state_kind: replica.state.kind,
      $ended_at_ms: replica.state.kind === 'finished' ? replica.state.ended_at_ms : null,
      $changed_at_ms: replica.changed_at_ms,
      $writer: writer,
      $replica_json: JSON.stringify(replica),
    }
  );
}

export async function getDesiredPhoneMailbox(db: DatabaseExecutor): Promise<WorkoutMailbox> {
  const row = await db.getFirstAsync<{ desired_mailbox_json: string }>(
    'SELECT desired_mailbox_json FROM workout_mailbox_state WHERE id = 0'
  );
  return row ? (JSON.parse(row.desired_mailbox_json) as WorkoutMailbox) : EMPTY_MAILBOX;
}

export async function setPhoneTransportIntent(
  db: DatabaseExecutor,
  replica: WorkoutReplica | null
): Promise<void> {
  const state = await db.getFirstAsync<{ pending_watch_receipt_json: string | null }>(
    'SELECT pending_watch_receipt_json FROM workout_mailbox_state WHERE id = 0'
  );
  const watchReceipt = state?.pending_watch_receipt_json
    ? (JSON.parse(state.pending_watch_receipt_json) as WorkoutMailbox['watch_receipt'])
    : null;
  const mailbox: WorkoutMailbox = {
    protocol_version: 1,
    candidate: replica,
    watch_receipt: watchReceipt,
  };
  await db.runAsync(
    `UPDATE workout_mailbox_state SET
       outbound_workout_id = $workout_id,
       outbound_changed_at_ms = $changed_at_ms,
       desired_mailbox_json = $mailbox
     WHERE id = 0`,
    {
      $workout_id: replica?.workout_id ?? null,
      $changed_at_ms: replica?.changed_at_ms ?? null,
      $mailbox: JSON.stringify(mailbox),
    }
  );
}

async function persistLocalCandidate(db: DatabaseExecutor, replica: WorkoutReplica): Promise<void> {
  await saveAuthoredWorkoutReplica(db, { writer: PHONE_WRITER, replica });
  await setPhoneTransportIntent(db, replica);
}

function activeWorkoutRow(replica: WorkoutReplica, body: WorkoutBody): Workout {
  return {
    id: replica.workout_id,
    routine_id: body.routine_id,
    name: body.name,
    started_at: new Date(replica.started_at_ms).toISOString(),
    ended_at: null,
    notes: body.notes,
    bodyweight_kg: body.bodyweight_kg,
    routine_structure_version: body.routine_structure_version,
  };
}

async function exerciseForBody(
  db: DatabaseExecutor,
  exerciseId: string,
  snapshotName: string,
  exerciseType: string
): Promise<Exercise> {
  return (
    (await getExercise(db, exerciseId)) ?? {
      id: exerciseId,
      name: snapshotName,
      muscle_group: 'other',
      equipment: '',
      exercise_type: requireExerciseType(exerciseType),
      is_custom: false,
      instructions: [],
      images: [],
      secondary_muscles: [],
      created_at: new Date(0).toISOString(),
    }
  );
}

async function materializeDetail(
  db: DatabaseExecutor,
  replica: WorkoutReplica,
  active: ActiveWorkoutBody
): Promise<WorkoutDetail> {
  const body = materializeActiveWorkout(active);
  const exercises: WorkoutExerciseDetail[] = [];
  for (const [exercisePosition, exercise] of body.exercises.entries()) {
    const exerciseRow: WorkoutExercise = {
      id: exercise.id,
      workout_id: replica.workout_id,
      exercise_id: exercise.exercise_id,
      position: exercisePosition,
      source_routine_exercise_id: exercise.source_routine_exercise_id,
      superset_group_id: exercise.superset_group_id,
      exercise_type: requireExerciseType(exercise.exercise_type),
      notes: exercise.notes,
    };
    const sets: LoggedSet[] = exercise.sets.map((set, setPosition) => ({
      id: set.id,
      workout_exercise_id: exercise.id,
      position: setPosition,
      source_routine_set_id: set.source_routine_set_id,
      set_type: set.set_type as SetType,
      weight: set.weight,
      reps: set.reps,
      duration_seconds: set.duration_seconds,
      distance_meters: set.distance_meters,
      rpe: set.rpe,
      completed: set.completed,
      completed_at:
        set.completed_at_ms === null ? null : new Date(set.completed_at_ms).toISOString(),
    }));
    exercises.push({
      ...exerciseRow,
      exercise: await exerciseForBody(
        db,
        exercise.exercise_id,
        exercise.exercise_name,
        exercise.exercise_type
      ),
      sets,
    });
  }
  return { ...activeWorkoutRow(replica, body), exercises };
}

export async function getActiveWorkoutFromReplica(db: DatabaseExecutor): Promise<Workout | null> {
  const current = await loadCurrentGeneration(db);
  if (current?.replica.state.kind !== 'active') return null;
  return activeWorkoutRow(current.replica, materializeActiveWorkout(current.replica.state.workout));
}

export async function getWorkoutDetailFromReplica(
  db: DatabaseExecutor,
  workoutId: string
): Promise<WorkoutDetail | null> {
  const stored = await loadReplicaRow(db, workoutId);
  if (!stored) return getWorkoutDetail(db, workoutId);
  if (stored.replica.state.kind === 'discarded') return null;
  if (stored.replica.state.kind === 'finished') return getWorkoutDetail(db, workoutId);
  return materializeDetail(db, stored.replica, stored.replica.state.workout);
}

function canonicalBody(body: ActiveWorkoutBody): ActiveWorkoutBody {
  return {
    ...body,
    exercises: [...body.exercises]
      .sort((a, b) => compareCanonicalStrings(a.id, b.id))
      .map((exercise) => ({
        ...exercise,
        sets: [...exercise.sets].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
      })),
  };
}

function requireActive(stored: AuthoredWorkoutReplica | null, workoutId?: string): WorkoutReplica & {
  state: { kind: 'active'; workout: ActiveWorkoutBody };
} {
  if (
    stored?.replica.state.kind !== 'active' ||
    (workoutId !== undefined && stored.replica.workout_id !== workoutId)
  ) {
    throw new Error('Active workout not found');
  }
  return stored.replica as WorkoutReplica & {
    state: { kind: 'active'; workout: ActiveWorkoutBody };
  };
}

function nextStamp(replica: WorkoutReplica, nowMs: number): number {
  return Math.max(nowMs, replica.changed_at_ms + 1);
}

export async function startActiveWorkoutReplica(
  db: DatabaseExecutor,
  options: { routineId?: string; name?: string; nowMs?: number } = {}
): Promise<Workout> {
  const current = await loadCurrentGeneration(db);
  if (current?.replica.state.kind === 'active') {
    return activeWorkoutRow(
      current.replica,
      materializeActiveWorkout(current.replica.state.workout)
    );
  }
  const newest = await db.getFirstAsync<{ newest: number | null }>(
    'SELECT MAX(started_at_ms) AS newest FROM workout_replica_state'
  );
  const startedAtMs = Math.max(options.nowMs ?? Date.now(), (newest?.newest ?? -1) + 1);
  const stamp = version(startedAtMs);
  const routine = options.routineId ? await getRoutineDetail(db, options.routineId) : null;
  const profile = await getProfile(db);
  const body: ActiveWorkoutBody = canonicalBody({
    fields: {
      routine_id: { version: stamp, value: options.routineId ?? null },
      routine_structure_version: { version: stamp, value: routine ? 1 : null },
      name: { version: stamp, value: options.name ?? routine?.name ?? 'Workout' },
      notes: { version: stamp, value: null },
      bodyweight_kg: { version: stamp, value: profile.bodyweightKg },
    },
    exercises:
      routine?.exercises.map((routineExercise) => ({
        id: id(),
        version: stamp,
        deleted: false,
        position: routineExercise.position,
        value: {
          exercise_id: routineExercise.exercise_id,
          exercise_name: routineExercise.exercise.name,
          source_routine_exercise_id: routineExercise.id,
          superset_group_id: routineExercise.superset_group_id,
          exercise_type: routineExercise.exercise_type,
          notes: routineExercise.notes,
        },
        sets: routineExercise.sets
          .map((set) => ({
            id: id(),
            version: stamp,
            deleted: false,
            position: set.position,
            value: {
              source_routine_set_id: set.id,
              set_type: set.set_type,
              weight: set.target_weight,
              reps: set.target_reps,
              duration_seconds: set.target_duration_seconds,
              distance_meters: set.target_distance_meters,
              rpe: null,
              completed: false,
              completed_at_ms: null,
            },
          }))
          .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
      })) ?? [],
  });
  const replica: WorkoutReplica = {
    workout_id: id(),
    started_at_ms: startedAtMs,
    changed_at_ms: startedAtMs,
    state: { kind: 'active', workout: body },
  };
  await persistLocalCandidate(db, replica);
  return activeWorkoutRow(replica, materializeActiveWorkout(body));
}

async function updateCurrentActive(
  db: DatabaseExecutor,
  nowMs: number,
  transform: (body: ActiveWorkoutBody, stamp: EntryVersion) => ActiveWorkoutBody,
  workoutId?: string
): Promise<WorkoutReplica> {
  const active = requireActive(await loadCurrentGeneration(db), workoutId);
  const changedAtMs = nextStamp(active, nowMs);
  const updated: WorkoutReplica = {
    ...active,
    changed_at_ms: changedAtMs,
    state: {
      kind: 'active',
      workout: canonicalBody(transform(active.state.workout, version(changedAtMs))),
    },
  };
  await persistLocalCandidate(db, updated);
  return updated;
}

export async function addExerciseToActiveReplica(
  db: DatabaseExecutor,
  workoutId: string,
  exerciseId: string,
  nowMs = Date.now()
): Promise<WorkoutExercise> {
  const exercise = await getExercise(db, exerciseId);
  if (!exercise) throw new Error('Exercise not found');
  const exerciseEntryId = id();
  let position = 0;
  await updateCurrentActive(
    db,
    nowMs,
    (body, stamp) => {
      position = Math.max(-1, ...body.exercises.filter((entry) => !entry.deleted).map((entry) => entry.position ?? -1)) + 1;
      return {
        ...body,
        exercises: [
          ...body.exercises,
          {
            id: exerciseEntryId,
            version: stamp,
            deleted: false,
            position,
            value: {
              exercise_id: exercise.id,
              exercise_name: exercise.name,
              source_routine_exercise_id: null,
              superset_group_id: null,
              exercise_type: exercise.exercise_type,
              notes: null,
            },
            sets: [],
          },
        ],
      };
    },
    workoutId
  );
  return {
    id: exerciseEntryId,
    workout_id: workoutId,
    exercise_id: exercise.id,
    position,
    source_routine_exercise_id: null,
    superset_group_id: null,
    exercise_type: exercise.exercise_type,
    notes: null,
  };
}

export async function addSetToActiveReplica(
  db: DatabaseExecutor,
  workoutExerciseId: string,
  setType: SetType = 'normal',
  nowMs = Date.now()
): Promise<LoggedSet> {
  const setId = id();
  let position = 0;
  await updateCurrentActive(db, nowMs, (body, stamp) => {
    let found = false;
    const exercises = body.exercises.map((exercise) => {
      if (exercise.id !== workoutExerciseId || exercise.deleted) return exercise;
      found = true;
      position = Math.max(-1, ...exercise.sets.filter((set) => !set.deleted).map((set) => set.position ?? -1)) + 1;
      const set: ActiveLoggedSet = {
        id: setId,
        version: stamp,
        deleted: false,
        position,
        value: emptySetFields(setType),
      };
      return { ...exercise, sets: [...exercise.sets, set] };
    });
    if (!found) throw new Error('Workout exercise not found');
    return { ...body, exercises };
  });
  return {
    id: setId,
    workout_exercise_id: workoutExerciseId,
    position,
    source_routine_set_id: null,
    set_type: setType,
    weight: null,
    reps: null,
    duration_seconds: null,
    distance_meters: null,
    rpe: null,
    completed: false,
    completed_at: null,
  };
}

function emptySetFields(setType: SetType): LoggedSetFields {
  return {
    source_routine_set_id: null,
    set_type: setType,
    weight: null,
    reps: null,
    duration_seconds: null,
    distance_meters: null,
    rpe: null,
    completed: false,
    completed_at_ms: null,
  };
}

export async function updateActiveSetValues(
  db: DatabaseExecutor,
  setId: string,
  fields: LoggedSetValueUpdate,
  nowMs = Date.now()
): Promise<void> {
  await updateCurrentActive(db, nowMs, (body, stamp) => {
    let found = false;
    const exercises = body.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => {
        if (set.id !== setId || set.deleted || !set.value) return set;
        found = true;
        return { ...set, version: stamp, value: { ...set.value, ...fields } };
      }),
    }));
    if (!found) throw new Error('Set not found');
    return { ...body, exercises };
  });
}

export async function setActiveSetCompletion(
  db: DatabaseExecutor,
  setId: string,
  completed: boolean,
  nowMs = Date.now()
): Promise<void> {
  await updateCurrentActive(db, nowMs, (body, stamp) => {
    let found = false;
    const exercises = body.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => {
        if (set.id !== setId || set.deleted || !set.value) return set;
        found = true;
        return {
          ...set,
          version: stamp,
          value: {
            ...set.value,
            completed,
            completed_at_ms: completed ? stamp.changed_at_ms : null,
          },
        };
      }),
    }));
    if (!found) throw new Error('Set not found');
    return { ...body, exercises };
  });
}

export async function deleteActiveSet(
  db: DatabaseExecutor,
  setId: string,
  nowMs = Date.now()
): Promise<void> {
  await updateCurrentActive(db, nowMs, (body, stamp) => {
    let found = false;
    const exercises = body.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => {
        if (set.id !== setId || set.deleted) return set;
        found = true;
        return { ...set, version: stamp, deleted: true, position: null, value: null };
      }),
    }));
    if (!found) throw new Error('Set not found');
    return { ...body, exercises };
  });
}

export async function deleteActiveExercise(
  db: DatabaseExecutor,
  workoutExerciseId: string,
  nowMs = Date.now()
): Promise<void> {
  await updateCurrentActive(db, nowMs, (body, stamp) => {
    let found = false;
    const exercises = body.exercises.map((exercise) => {
      if (exercise.id !== workoutExerciseId || exercise.deleted) return exercise;
      found = true;
      return { ...exercise, version: stamp, deleted: true, position: null, value: null };
    });
    if (!found) throw new Error('Workout exercise not found');
    return { ...body, exercises };
  });
}

export async function moveActiveExercise(
  db: DatabaseExecutor,
  workoutExerciseId: string,
  delta: -1 | 1,
  nowMs = Date.now()
): Promise<void> {
  await updateCurrentActive(db, nowMs, (body, stamp) => {
    const live = body.exercises
      .filter((exercise) => !exercise.deleted)
      .sort(
        (a, b) =>
          (a.position ?? 0) - (b.position ?? 0) || compareCanonicalStrings(a.id, b.id)
      );
    const currentIndex = live.findIndex((exercise) => exercise.id === workoutExerciseId);
    const targetIndex = currentIndex + delta;
    if (currentIndex < 0) throw new Error('Workout exercise not found');
    if (targetIndex < 0 || targetIndex >= live.length) return body;
    const reordered = [...live];
    const [current] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, current);
    const positions = new Map(reordered.map((exercise, index) => [exercise.id, index]));
    return {
      ...body,
      exercises: body.exercises.map((exercise) => {
        const position = positions.get(exercise.id);
        return position === undefined || position === exercise.position
          ? exercise
          : { ...exercise, version: stamp, position };
      }),
    };
  });
}

export async function updateActiveWorkoutName(
  db: DatabaseExecutor,
  workoutId: string,
  name: string,
  nowMs = Date.now()
): Promise<void> {
  await updateCurrentActive(
    db,
    nowMs,
    (body, stamp) => ({
      ...body,
      fields: { ...body.fields, name: { version: stamp, value: name } },
    }),
    workoutId
  );
}

type ActiveOverlayRow = {
  alerted_types_json: string;
  record_events_json: string;
};

type AlertedRecordTypes = Record<string, RecordType[]>;

export async function recomputeActiveRecordOverlay(
  db: DatabaseExecutor,
  workoutId: string,
  newlyCompletedSetId?: string
): Promise<{ improvedRecords: PersonalRecord[]; recordEvents: PersonalRecordEvent[] }> {
  const stored = requireActive(await loadReplicaRow(db, workoutId), workoutId);
  const body = materializeActiveWorkout(stored.state.workout);
  const overlay = await db.getFirstAsync<ActiveOverlayRow>(
    'SELECT alerted_types_json, record_events_json FROM active_workout_overlay WHERE workout_id = $id',
    { $id: workoutId }
  );
  const alerted: AlertedRecordTypes = overlay
    ? (JSON.parse(overlay.alerted_types_json) as AlertedRecordTypes)
    : {};
  const currentEvents: PersonalRecordEvent[] = [];
  const improvedByType = new Map<string, PersonalRecord>();

  for (const [position, exercise] of body.exercises.entries()) {
    const baseline = new Map(
      (await getRecordsForExercise(db, exercise.exercise_id)).map((record) => [
        record.record_type,
        record,
      ])
    );
    const completedSets = exercise.sets.filter((set) => set.completed);
    if (completedSets.length === 0) continue;
    const state = computeRecordState([
      {
        id: exercise.id,
        workoutId,
        exerciseId: exercise.exercise_id,
        exerciseType: requireExerciseType(exercise.exercise_type),
        startedAt: new Date(stored.started_at_ms).toISOString(),
        position,
        bodyweightKg: body.bodyweight_kg,
        sets: completedSets.map((set, setPosition) => ({
          id: set.id,
          position: setPosition,
          setType: set.set_type as SetType,
          weight: set.weight,
          reps: set.reps,
          durationSeconds: set.duration_seconds,
          distanceMeters: set.distance_meters,
          completedAt:
            set.completed_at_ms === null
              ? new Date(stored.changed_at_ms).toISOString()
              : new Date(set.completed_at_ms).toISOString(),
        })),
      },
    ]);
    for (const candidate of state.currentRecords) {
      const previous = baseline.get(candidate.type);
      if (!previous || candidate.value <= previous.value) continue;
      const event: PersonalRecordEvent = {
        id: `active_record_event:${exercise.id}:${candidate.type}`,
        exercise_id: exercise.exercise_id,
        workout_id: workoutId,
        workout_exercise_id: exercise.id,
        logged_set_id: candidate.loggedSetId,
        record_type: candidate.type,
        scope: 'set',
        value: candidate.value,
        achieved_at: candidate.achievedAt,
        formula_version: candidate.formulaVersion ?? null,
        created_at: candidate.achievedAt,
      };
      currentEvents.push(event);
      improvedByType.set(`${exercise.id}:${candidate.type}`, {
        id: `active_record:${exercise.exercise_id}:${candidate.type}`,
        exercise_id: exercise.exercise_id,
        record_type: candidate.type,
        value: candidate.value,
        logged_set_id: candidate.loggedSetId,
        achieved_at: candidate.achievedAt,
      });
    }
  }

  const newEvents = newlyCompletedSetId
    ? currentEvents.filter((event) => {
        if (event.logged_set_id !== newlyCompletedSetId) return false;
        return !(alerted[event.workout_exercise_id] ?? []).includes(event.record_type);
      })
    : [];
  for (const event of newEvents) {
    alerted[event.workout_exercise_id] = [
      ...new Set([...(alerted[event.workout_exercise_id] ?? []), event.record_type]),
    ];
  }
  await db.runAsync(
    `INSERT INTO active_workout_overlay
       (workout_id, alerted_types_json, record_events_json)
     VALUES ($workout_id, $alerted, $events)
     ON CONFLICT(workout_id) DO UPDATE SET
       alerted_types_json = excluded.alerted_types_json,
       record_events_json = excluded.record_events_json`,
    {
      $workout_id: workoutId,
      $alerted: JSON.stringify(alerted),
      $events: JSON.stringify(currentEvents),
    }
  );
  return {
    improvedRecords: newEvents
      .map((event) => improvedByType.get(`${event.workout_exercise_id}:${event.record_type}`))
      .filter((record): record is PersonalRecord => record !== undefined),
    recordEvents: newEvents,
  };
}

export async function getActiveWorkoutRecordEvents(
  db: DatabaseExecutor,
  workoutId: string
): Promise<PersonalRecordEvent[]> {
  const row = await db.getFirstAsync<{ record_events_json: string }>(
    'SELECT record_events_json FROM active_workout_overlay WHERE workout_id = $id',
    { $id: workoutId }
  );
  return row ? (JSON.parse(row.record_events_json) as PersonalRecordEvent[]) : [];
}

export async function writeFinishedWorkoutTreeInDb(
  db: DatabaseExecutor,
  envelope: Pick<WorkoutReplica, 'workout_id' | 'started_at_ms'>,
  body: WorkoutBody,
  endedAtMs: number
): Promise<void> {
  const routine = body.routine_id
    ? await db.getFirstAsync<{ id: string }>('SELECT id FROM routines WHERE id = $id', {
        $id: body.routine_id,
      })
    : null;
  const oldExerciseIds = await db.getAllAsync<{ exercise_id: string }>(
    'SELECT exercise_id FROM workout_exercises WHERE workout_id = $id',
    { $id: envelope.workout_id }
  );
  await db.runAsync(
    `UPDATE personal_records SET logged_set_id = NULL
      WHERE logged_set_id IN (
        SELECT ls.id FROM logged_sets ls
        JOIN workout_exercises we ON we.id = ls.workout_exercise_id
        WHERE we.workout_id = $id
      )`,
    { $id: envelope.workout_id }
  );
  await db.runAsync(
    `INSERT INTO workouts
       (id, routine_id, name, started_at, ended_at, notes, bodyweight_kg, routine_structure_version)
     VALUES
       ($id, $routine_id, $name, $started_at, $ended_at, $notes,
        $bodyweight_kg, $routine_structure_version)
     ON CONFLICT(id) DO UPDATE SET
       routine_id = excluded.routine_id,
       name = excluded.name,
       started_at = excluded.started_at,
       ended_at = excluded.ended_at,
       notes = excluded.notes,
       bodyweight_kg = excluded.bodyweight_kg,
       routine_structure_version = excluded.routine_structure_version`,
    {
      $id: envelope.workout_id,
      $routine_id: routine?.id ?? null,
      $name: body.name,
      $started_at: new Date(envelope.started_at_ms).toISOString(),
      $ended_at: new Date(endedAtMs).toISOString(),
      $notes: body.notes,
      $bodyweight_kg: body.bodyweight_kg,
      $routine_structure_version: body.routine_structure_version,
    }
  );
  await db.runAsync('DELETE FROM workout_exercises WHERE workout_id = $id', {
    $id: envelope.workout_id,
  });
  for (const [exercisePosition, exercise] of body.exercises.entries()) {
    await ensureFinishedExerciseReference(db, exercise);
    await db.runAsync(
      `INSERT INTO workout_exercises
         (id, workout_id, exercise_id, position, source_routine_exercise_id,
          superset_group_id, exercise_type, notes)
       VALUES
         ($id, $workout_id, $exercise_id, $position, $source_routine_exercise_id,
          $superset_group_id, $exercise_type, $notes)`,
      {
        $id: exercise.id,
        $workout_id: envelope.workout_id,
        $exercise_id: exercise.exercise_id,
        $position: exercisePosition,
        $source_routine_exercise_id: exercise.source_routine_exercise_id,
        $superset_group_id: exercise.superset_group_id,
        $exercise_type: requireExerciseType(exercise.exercise_type),
        $notes: exercise.notes,
      }
    );
    for (const [setPosition, set] of exercise.sets.entries()) {
      await db.runAsync(
        `INSERT INTO logged_sets
           (id, workout_exercise_id, position, source_routine_set_id, set_type,
            weight, reps, duration_seconds, distance_meters, rpe, completed, completed_at)
         VALUES
           ($id, $workout_exercise_id, $position, $source_routine_set_id, $set_type,
            $weight, $reps, $duration_seconds, $distance_meters, $rpe, $completed, $completed_at)`,
        {
          $id: set.id,
          $workout_exercise_id: exercise.id,
          $position: setPosition,
          $source_routine_set_id: set.source_routine_set_id,
          $set_type: set.set_type,
          $weight: set.weight,
          $reps: set.reps,
          $duration_seconds: set.duration_seconds,
          $distance_meters: set.distance_meters,
          $rpe: set.rpe,
          $completed: set.completed ? 1 : 0,
          $completed_at:
            set.completed_at_ms === null ? null : new Date(set.completed_at_ms).toISOString(),
        }
      );
    }
  }
  const touched = new Set([
    ...oldExerciseIds.map((entry) => entry.exercise_id),
    ...body.exercises.map((exercise) => exercise.exercise_id),
  ]);
  for (const exerciseId of touched) await replaceRecordStateForExerciseInDb(db, exerciseId);
}

async function ensureFinishedExerciseReference(
  db: DatabaseExecutor,
  exercise: WorkoutExerciseBody
): Promise<void> {
  await db.runAsync(
    `INSERT INTO exercises
       (id, name, muscle_group, equipment, exercise_type, is_custom,
        instructions, images, secondary_muscles, is_history_placeholder)
     VALUES
       ($id, $name, 'other', '', $exercise_type, 0, '[]', '[]', '[]', 1)
     ON CONFLICT(id) DO NOTHING`,
    {
      $id: exercise.exercise_id,
      $name: exercise.exercise_name,
      $exercise_type: requireExerciseType(exercise.exercise_type),
    }
  );
}

export async function finishActiveWorkout(
  db: DatabaseExecutor,
  workoutId: string,
  nowMs = Date.now()
): Promise<WorkoutReplica> {
  const active = requireActive(await loadCurrentGeneration(db), workoutId);
  const changedAtMs = nextStamp(active, nowMs);
  const body = materializeActiveWorkout(active.state.workout);
  const finished: WorkoutReplica = {
    workout_id: active.workout_id,
    started_at_ms: active.started_at_ms,
    changed_at_ms: changedAtMs,
    state: { kind: 'finished', ended_at_ms: changedAtMs, workout: body },
  };
  await writeFinishedWorkoutTreeInDb(db, finished, body, changedAtMs);
  await persistLocalCandidate(db, finished);
  await db.runAsync('DELETE FROM active_workout_overlay WHERE workout_id = $id', {
    $id: workoutId,
  });
  return finished;
}

export async function discardActiveWorkout(
  db: DatabaseExecutor,
  workoutId: string,
  nowMs = Date.now()
): Promise<WorkoutReplica> {
  const active = requireActive(await loadCurrentGeneration(db), workoutId);
  const changedAtMs = nextStamp(active, nowMs);
  const discarded: WorkoutReplica = {
    workout_id: active.workout_id,
    started_at_ms: active.started_at_ms,
    changed_at_ms: changedAtMs,
    state: { kind: 'discarded' },
  };
  await persistLocalCandidate(db, discarded);
  await db.runAsync('DELETE FROM active_workout_overlay WHERE workout_id = $id', {
    $id: workoutId,
  });
  return discarded;
}
