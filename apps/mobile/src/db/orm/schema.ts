import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { ExerciseType } from '../../domain/setFields';
import type { SetType } from '../types';

// This schema maps the existing SQLite tables for type-safe queries. The SQL
// schema and migrations remain sourced from internal-docs/schema.sql.
export const exercises = sqliteTable('exercises', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  muscle_group: text('muscle_group').notNull(),
  equipment: text('equipment').notNull(),
  exercise_type: text('exercise_type').$type<ExerciseType>().notNull(),
  is_custom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
  instructions: text('instructions', { mode: 'json' }).$type<string[] | null>(),
  images: text('images', { mode: 'json' }).$type<string[] | null>(),
  secondary_muscles: text('secondary_muscles', { mode: 'json' }).$type<string[] | null>(),
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const routines = sqliteTable('routines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  notes: text('notes'),
  position: integer('position').notNull().default(0),
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updated_at: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const routineExercises = sqliteTable('routine_exercises', {
  id: text('id').primaryKey(),
  routine_id: text('routine_id')
    .notNull()
    .references(() => routines.id, { onDelete: 'cascade' }),
  exercise_id: text('exercise_id')
    .notNull()
    .references(() => exercises.id),
  position: integer('position').notNull(),
  superset_group_id: text('superset_group_id'),
  exercise_type: text('exercise_type').$type<ExerciseType>().notNull(),
  notes: text('notes'),
});

export const routineSets = sqliteTable('routine_sets', {
  id: text('id').primaryKey(),
  routine_exercise_id: text('routine_exercise_id')
    .notNull()
    .references(() => routineExercises.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  set_type: text('set_type').$type<SetType>().notNull().default('normal'),
  target_weight: real('target_weight'),
  target_reps: integer('target_reps'),
  target_duration_seconds: integer('target_duration_seconds'),
  target_distance_meters: real('target_distance_meters'),
});
