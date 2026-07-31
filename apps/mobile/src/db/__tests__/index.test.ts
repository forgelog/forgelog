import { getDb, resetDbForTests } from '../index';
import { mobileStoreForTests as mobileStore } from '../../test-utils/db';

const { start: startWorkout, getActive: getActiveWorkout } = mobileStore.workouts;

beforeEach(() => {
  resetDbForTests();
});

test('getDb() runs real schema and round-trips a workout', async () => {
  const workout = await startWorkout({ name: 'Smoke test' });
  expect(workout.id).toBeTruthy();

  const active = await getActiveWorkout();
  expect(active?.id).toBe(workout.id);
  expect(active?.name).toBe('Smoke test');
});

test('resetDbForTests gives each test a fresh DB', async () => {
  const active = await getActiveWorkout();
  expect(active).toBeNull();
});

test('migration 1 creates unconstrained exercise_type columns', async () => {
  const db = await getDb();
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');

  expect(version?.user_version).toBeGreaterThanOrEqual(1);

  for (const table of ['exercises', 'routine_exercises', 'workout_exercises']) {
    const columns = await db.getAllAsync<{ name: string; notnull: number }>(
      `PRAGMA table_info(${table})`
    );
    const schema = await db.getFirstAsync<{ sql: string }>(
      'SELECT sql FROM sqlite_master WHERE type = $type AND name = $table',
      { $type: 'table', $table: table }
    );
    expect(columns.some((column) => column.name === 'tracking_type')).toBe(false);
    expect(columns.find((column) => column.name === 'exercise_type')?.notnull).toBe(1);
    expect(schema?.sql).toContain('exercise_type');
    expect(schema?.sql).toContain('NOT NULL');
    expect(schema?.sql).not.toContain('CHECK');
  }
});

test('migration 2 creates and seeds measurement tables', async () => {
  const db = await getDb();
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const types = await db.getAllAsync<{
    id: string;
    name: string;
    dimension: string;
    canonical_unit: string;
    position: number;
  }>(
    'SELECT id, name, dimension, canonical_unit, position FROM measurement_types ORDER BY position'
  );

  expect(version?.user_version).toBeGreaterThanOrEqual(2);
  expect(types).toHaveLength(18);
  expect(types[0]).toEqual({
    id: 'bodyweight',
    name: 'Body Weight',
    dimension: 'mass',
    canonical_unit: 'kg',
    position: 0,
  });
  expect(types[17]).toEqual({
    id: 'right_calf',
    name: 'Right Calf',
    dimension: 'length',
    canonical_unit: 'cm',
    position: 17,
  });

  const measurementSchema = await db.getFirstAsync<{ sql: string }>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'measurements'`
  );
  expect(measurementSchema?.sql).toContain('CHECK (canonical_value >= 0)');
});

test('migration 4 creates canonical workout replica and mailbox state', async () => {
  const db = await getDb();
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const tables = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN (
        'workout_replica_state',
        'workout_mailbox_state',
        'active_workout_overlay'
      )
      ORDER BY name`
  );
  const mailbox = await db.getFirstAsync<{
    id: number;
    outbound_workout_id: string | null;
    desired_mailbox_json: string;
  }>('SELECT id, outbound_workout_id, desired_mailbox_json FROM workout_mailbox_state');

  expect(version?.user_version).toBeGreaterThanOrEqual(4);
  expect(tables.map((table) => table.name)).toEqual([
    'active_workout_overlay',
    'workout_mailbox_state',
    'workout_replica_state',
  ]);
  expect(mailbox).toEqual({
    id: 0,
    outbound_workout_id: null,
    desired_mailbox_json: JSON.stringify({
      protocol_version: 1,
      candidate: null,
      watch_receipt: null,
    }),
  });
});

test('migration 5 creates durable completed-workout local state', async () => {
  const db = await getDb();
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'completed_workout_local_state'`
  );

  expect(version?.user_version).toBeGreaterThanOrEqual(5);
  expect(table?.name).toBe('completed_workout_local_state');
});
