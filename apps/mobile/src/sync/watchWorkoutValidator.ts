import Ajv from 'ajv';

import type { WatchWorkoutPayload } from '../db/repositories/sync';
import { EXERCISE_TYPES } from '../domain/setFields';

const ajv = new Ajv();
export const WATCH_WORKOUT_PROTOCOL_VERSION = 2;

export const LOGGED_SET_PAYLOAD_SCHEMA = {
  type: 'object',
  required: ['id', 'workout_exercise_id', 'position', 'set_type', 'completed'],
  properties: {
    id: { type: 'string' },
    workout_exercise_id: { type: 'string' },
    position: { type: 'integer' },
    set_type: { type: 'string', enum: ['normal', 'warmup', 'dropset', 'failure'] },
    weight: { type: ['number', 'null'] },
    reps: { type: ['integer', 'null'] },
    duration_seconds: { type: ['integer', 'null'] },
    distance_meters: { type: ['number', 'null'] },
    rpe: { type: ['number', 'null'] },
    completed: { type: 'boolean' },
    completed_at: { type: ['string', 'null'] },
  },
};

export const WORKOUT_EXERCISE_PAYLOAD_SCHEMA = {
  type: 'object',
  required: ['id', 'exercise_id', 'position', 'exercise_type', 'sets'],
  properties: {
    id: { type: 'string' },
    exercise_id: { type: 'string' },
    position: { type: 'integer' },
    superset_group_id: { type: ['string', 'null'] },
    exercise_type: { type: 'string', enum: [...EXERCISE_TYPES] },
    rest_seconds: { type: ['integer', 'null'] },
    notes: { type: ['string', 'null'] },
    sets: { type: 'array', items: LOGGED_SET_PAYLOAD_SCHEMA },
  },
};

export const WATCH_WORKOUT_PAYLOAD_SCHEMA = {
  type: 'object',
  required: ['protocol_version', 'id', 'name', 'started_at', 'exercises'],
  properties: {
    protocol_version: { type: 'integer', const: WATCH_WORKOUT_PROTOCOL_VERSION },
    id: { type: 'string' },
    routine_id: { type: ['string', 'null'] },
    name: { type: 'string' },
    started_at: { type: 'string' },
    ended_at: { type: ['string', 'null'] },
    notes: { type: ['string', 'null'] },
    exercises: {
      type: 'array',
      items: WORKOUT_EXERCISE_PAYLOAD_SCHEMA,
    },
  },
};

export const validateWatchWorkoutPayload =
  ajv.compile<WatchWorkoutPayload>(WATCH_WORKOUT_PAYLOAD_SCHEMA);
