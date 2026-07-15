import { asc, count, eq, getTableColumns, max, sql, type SQL } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

import { requireExerciseType } from '../../domain/setFields';
import { NAME_MAX_LENGTH, NOTES_MAX_LENGTH, validateText } from '../../validation/textInput';
import type { DatabaseExecutor } from '../executor';
import { id } from '../id';
import { exercises, getOrm, routineExercises, routineSets, routines } from '../orm';
import type {
  Routine,
  RoutineDetail,
  RoutineExercise,
  RoutineExerciseDetail,
  RoutineSet,
  SetType,
} from '../types';

export async function listRoutines(db: DatabaseExecutor): Promise<Routine[]> {
  return getOrm(db)
    .select()
    .from(routines)
    .orderBy(asc(routines.position), asc(routines.created_at))
    .all();
}

export async function getRoutineDetail(
  db: DatabaseExecutor,
  routineId: string
): Promise<RoutineDetail | null> {
  const orm = getOrm(db);
  const routine = orm.select().from(routines).where(eq(routines.id, routineId)).get();
  if (!routine) return null;

  const rows = orm
    .select({
      routineExercise: routineExercises,
      exercise: exercises,
      set: routineSets,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(routineExercises.exercise_id, exercises.id))
    .leftJoin(routineSets, eq(routineSets.routine_exercise_id, routineExercises.id))
    .where(eq(routineExercises.routine_id, routineId))
    .orderBy(asc(routineExercises.position), asc(routineSets.position))
    .all();

  const detailById = new Map<string, RoutineExerciseDetail>();
  for (const row of rows) {
    let detail = detailById.get(row.routineExercise.id);
    if (!detail) {
      detail = {
        ...row.routineExercise,
        exercise: {
          ...row.exercise,
          exercise_type: requireExerciseType(row.exercise.exercise_type),
          instructions: row.exercise.instructions ?? [],
          images: row.exercise.images ?? [],
          secondary_muscles: row.exercise.secondary_muscles ?? [],
        },
        sets: [],
      };
      detailById.set(detail.id, detail);
    }
    if (row.set) detail.sets.push(row.set);
  }

  return { ...routine, exercises: [...detailById.values()] };
}

export type RoutineSummary = Routine & { exerciseCount: number; exerciseNames: string[] };

export async function getRoutinesWithSummaries(db: DatabaseExecutor): Promise<RoutineSummary[]> {
  return getOrm(db)
    .select({
      ...getTableColumns(routines),
      exerciseCount: count(routineExercises.id),
      exerciseNames: sql<string>`coalesce(
        json_group_array(distinct ${exercises.name})
          filter (where ${exercises.id} is not null),
        json('[]')
      )`.mapWith((value) => JSON.parse(value) as string[]),
    })
    .from(routines)
    .leftJoin(routineExercises, eq(routineExercises.routine_id, routines.id))
    .leftJoin(exercises, eq(exercises.id, routineExercises.exercise_id))
    .groupBy(routines.id)
    .orderBy(asc(routines.position), asc(routines.created_at))
    .all();
}

function validateRoutineName(name: string): string {
  const { value, error } = validateText(name, {
    required: true,
    maxLength: NAME_MAX_LENGTH,
    fieldLabel: 'Routine name',
  });
  if (error) throw new Error(error);
  return value;
}

function validateRoutineNotes(notes: string | null | undefined): string | null {
  if (notes == null) return null;
  const { value, error } = validateText(notes, {
    maxLength: NOTES_MAX_LENGTH,
    fieldLabel: 'Notes',
    multiline: true,
  });
  if (error) throw new Error(error);
  return value || null;
}

export async function createRoutine(
  db: DatabaseExecutor,
  name: string,
  notes?: string
): Promise<Routine> {
  const validName = validateRoutineName(name);
  const validNotes = validateRoutineNotes(notes);
  const newId = id();
  const orm = getOrm(db);
  const position = nextRoutinePosition(db);

  orm.insert(routines).values({ id: newId, name: validName, notes: validNotes, position }).run();
  const created = orm.select().from(routines).where(eq(routines.id, newId)).get();
  if (!created) throw new Error('Failed to create routine');
  return created;
}

export async function updateRoutine(
  db: DatabaseExecutor,
  routineId: string,
  fields: { name?: string; notes?: string | null }
): Promise<void> {
  if (fields.name === undefined && fields.notes === undefined) return;

  const updates: { name?: string; notes?: string | null; updated_at: SQL } = {
    updated_at: sql`datetime('now')`,
  };
  if (fields.name !== undefined) updates.name = validateRoutineName(fields.name);
  if (fields.notes !== undefined) updates.notes = validateRoutineNotes(fields.notes);

  getOrm(db).update(routines).set(updates).where(eq(routines.id, routineId)).run();
}

export async function deleteRoutine(db: DatabaseExecutor, routineId: string): Promise<void> {
  getOrm(db).delete(routines).where(eq(routines.id, routineId)).run();
}

export async function addExerciseToRoutine(
  db: DatabaseExecutor,
  routineId: string,
  exerciseId: string
): Promise<RoutineExercise> {
  const orm = getOrm(db);
  const exercise = orm
    .select({ exercise_type: exercises.exercise_type })
    .from(exercises)
    .where(eq(exercises.id, exerciseId))
    .get();
  if (!exercise) throw new Error('Exercise not found');

  const newId = id();
  const position = nextPosition(db, routineExercises.position, routineExercises, {
    column: routineExercises.routine_id,
    value: routineId,
  });
  orm
    .insert(routineExercises)
    .values({
      id: newId,
      routine_id: routineId,
      exercise_id: exerciseId,
      position,
      exercise_type: requireExerciseType(exercise.exercise_type),
    })
    .run();

  const created = orm.select().from(routineExercises).where(eq(routineExercises.id, newId)).get();
  if (!created) throw new Error('Failed to add exercise to routine');
  return created;
}

export async function removeRoutineExercise(
  db: DatabaseExecutor,
  routineExerciseId: string
): Promise<void> {
  getOrm(db).delete(routineExercises).where(eq(routineExercises.id, routineExerciseId)).run();
}

export async function updateRoutineExercise(
  db: DatabaseExecutor,
  routineExerciseId: string,
  fields: { superset_group_id?: string | null; notes?: string | null }
): Promise<void> {
  const updates: { superset_group_id?: string | null; notes?: string | null } = {};
  if (fields.superset_group_id !== undefined) {
    updates.superset_group_id = fields.superset_group_id;
  }
  if (fields.notes !== undefined) updates.notes = fields.notes;
  if (!Object.keys(updates).length) return;

  getOrm(db)
    .update(routineExercises)
    .set(updates)
    .where(eq(routineExercises.id, routineExerciseId))
    .run();
}

export async function reorderRoutineExercises(
  db: DatabaseExecutor,
  orderedIds: string[]
): Promise<void> {
  const orm = getOrm(db);
  for (let position = 0; position < orderedIds.length; position++) {
    orm
      .update(routineExercises)
      .set({ position })
      .where(eq(routineExercises.id, orderedIds[position]))
      .run();
  }
}

export type RoutineSetInput = {
  set_type?: SetType;
  target_weight?: number | null;
  target_reps?: number | null;
  target_duration_seconds?: number | null;
  target_distance_meters?: number | null;
};

export type SaveRoutineDraftInput = {
  routineId?: string;
  name: string;
  notes?: string | null;
  exercises: {
    exercise_id: string;
    superset_group_id?: string | null;
    exercise_type: string;
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

export async function saveRoutineDraft(
  db: DatabaseExecutor,
  input: SaveRoutineDraftInput
): Promise<RoutineDetail> {
  const validName = validateRoutineName(input.name);
  const validNotes = validateRoutineNotes(input.notes);
  if (input.exercises.length === 0) {
    throw new Error('Add at least one exercise before saving.');
  }

  const orm = getOrm(db);
  const routineId = input.routineId ?? id();
  if (input.routineId) {
    orm
      .update(routines)
      .set({ name: validName, notes: validNotes, updated_at: sql`datetime('now')` })
      .where(eq(routines.id, routineId))
      .run();
    orm.delete(routineExercises).where(eq(routineExercises.routine_id, routineId)).run();
  } else {
    orm
      .insert(routines)
      .values({
        id: routineId,
        name: validName,
        notes: validNotes,
        position: nextRoutinePosition(db),
      })
      .run();
  }

  for (const [exerciseIndex, exercise] of input.exercises.entries()) {
    const exerciseExists = orm
      .select({ id: exercises.id })
      .from(exercises)
      .where(eq(exercises.id, exercise.exercise_id))
      .get();
    if (!exerciseExists) throw new Error('Exercise not found');

    const routineExerciseId = id();
    orm
      .insert(routineExercises)
      .values({
        id: routineExerciseId,
        routine_id: routineId,
        exercise_id: exercise.exercise_id,
        position: exerciseIndex,
        superset_group_id: exercise.superset_group_id ?? null,
        exercise_type: requireExerciseType(exercise.exercise_type),
        notes: exercise.notes,
      })
      .run();

    if (exercise.sets.length) {
      orm
        .insert(routineSets)
        .values(
          exercise.sets.map((set, position) => ({
            id: id(),
            routine_exercise_id: routineExerciseId,
            position,
            ...set,
          }))
        )
        .run();
    }
  }

  const saved = await getRoutineDetail(db, routineId);
  if (!saved) throw new Error('Failed to save routine');
  return saved;
}

export async function addRoutineSet(
  db: DatabaseExecutor,
  routineExerciseId: string,
  input: RoutineSetInput = {}
): Promise<RoutineSet> {
  const orm = getOrm(db);
  const newId = id();
  const position = nextPosition(db, routineSets.position, routineSets, {
    column: routineSets.routine_exercise_id,
    value: routineExerciseId,
  });
  orm
    .insert(routineSets)
    .values({
      id: newId,
      routine_exercise_id: routineExerciseId,
      position,
      set_type: input.set_type ?? 'normal',
      target_weight: input.target_weight ?? null,
      target_reps: input.target_reps ?? null,
      target_duration_seconds: input.target_duration_seconds ?? null,
      target_distance_meters: input.target_distance_meters ?? null,
    })
    .run();

  const created = orm.select().from(routineSets).where(eq(routineSets.id, newId)).get();
  if (!created) throw new Error('Failed to add routine set');
  return created;
}

export async function updateRoutineSet(
  db: DatabaseExecutor,
  setId: string,
  fields: RoutineSetInput
): Promise<void> {
  const updates: RoutineSetInput = {};
  if (fields.set_type !== undefined) updates.set_type = fields.set_type;
  if (fields.target_weight !== undefined) updates.target_weight = fields.target_weight;
  if (fields.target_reps !== undefined) updates.target_reps = fields.target_reps;
  if (fields.target_duration_seconds !== undefined) {
    updates.target_duration_seconds = fields.target_duration_seconds;
  }
  if (fields.target_distance_meters !== undefined) {
    updates.target_distance_meters = fields.target_distance_meters;
  }
  if (!Object.keys(updates).length) return;

  getOrm(db).update(routineSets).set(updates).where(eq(routineSets.id, setId)).run();
}

export async function deleteRoutineSet(db: DatabaseExecutor, setId: string): Promise<void> {
  getOrm(db).delete(routineSets).where(eq(routineSets.id, setId)).run();
}

function nextRoutinePosition(db: DatabaseExecutor): number {
  const row = getOrm(db)
    .select({ value: max(routines.position) })
    .from(routines)
    .get();
  return (row?.value ?? -1) + 1;
}

type PositionTable = typeof routineExercises | typeof routineSets;

function nextPosition(
  db: DatabaseExecutor,
  positionColumn: AnySQLiteColumn<{ data: number }>,
  table: PositionTable,
  scope: { column: AnySQLiteColumn<{ data: string }>; value: string }
): number {
  const row = getOrm(db)
    .select({ value: max(positionColumn) })
    .from(table)
    .where(eq(scope.column, scope.value))
    .get();
  return (row?.value ?? -1) + 1;
}
