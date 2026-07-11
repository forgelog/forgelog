import Ajv from 'ajv';

import type { WatchWorkoutPayload } from '../db/repositories/sync';

const ajv = new Ajv();

const loggedSetSchema = {
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

const schema = {
  type: 'object',
  required: ['protocol_version', 'id', 'name', 'started_at', 'exercises'],
  properties: {
    protocol_version: { type: 'integer', const: 1 },
    id: { type: 'string' },
    routine_id: { type: ['string', 'null'] },
    name: { type: 'string' },
    started_at: { type: 'string' },
    ended_at: { type: ['string', 'null'] },
    notes: { type: ['string', 'null'] },
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'exercise_id', 'position', 'sets'],
        properties: {
          id: { type: 'string' },
          exercise_id: { type: 'string' },
          position: { type: 'integer' },
          sets: { type: 'array', items: loggedSetSchema },
        },
      },
    },
  },
};

export const validateWatchWorkoutPayload = ajv.compile<WatchWorkoutPayload>(schema);
