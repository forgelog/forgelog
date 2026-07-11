import Ajv from 'ajv';

import type { WatchWorkoutPayload } from '../db/repositories/sync';

const syncSchema = require('../../../../data/contracts/sync.schema.json');
const ajv = new Ajv();

export const validateWatchWorkoutPayload = ajv.compile<WatchWorkoutPayload>({
  ...syncSchema.definitions.WatchWorkoutPayload,
  definitions: syncSchema.definitions,
});
