import Ajv from 'ajv';

import type { WatchWorkoutPayload } from '../db/repositories/sync';

const ajv = new Ajv();

const schema = {
  type: 'object',
  required: ['protocol_version', 'id', 'routine_id', 'name', 'started_at', 'ended_at', 'notes', 'exercises'],
  properties: {
    protocol_version: { type: 'number', const: 1 },
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
          position: { type: 'number' },
          sets: { type: 'array' },
        },
      },
    },
  },
};

export const validateWatchWorkoutPayload = ajv.compile<WatchWorkoutPayload>(schema);
