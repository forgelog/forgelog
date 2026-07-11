import { WATCH_WORKOUT_PAYLOAD_SCHEMA } from '../watchWorkoutValidator';

const contractSchema = require('../../../../../data/contracts/sync.schema.json');

type JsonObject = Record<string, unknown>;

function expandRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(expandRefs);
  if (!value || typeof value !== 'object') return value;

  const object = value as JsonObject;
  if (typeof object.$ref === 'string') {
    const definitionName = object.$ref.replace('#/definitions/', '');
    return expandRefs(contractSchema.definitions[definitionName]);
  }

  return Object.fromEntries(
    Object.entries(object).map(([key, child]) => [key, key === 'definitions' ? child : expandRefs(child)])
  );
}

test('watch workout runtime validator stays in sync with the contract schema', () => {
  expect(WATCH_WORKOUT_PAYLOAD_SCHEMA).toEqual(
    expandRefs(contractSchema.definitions.WatchWorkoutPayload)
  );
});
