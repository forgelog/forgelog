// Mirrors docs/schema.sql (source of truth) — Metro can't bundle a file
// outside the app directory, so this copy has to be kept in sync by hand.
export const SCHEMA_SQL = `
CREATE TABLE exercises (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  muscle_group  TEXT NOT NULL,
  equipment     TEXT NOT NULL,
  tracking_type TEXT,
  is_custom     INTEGER NOT NULL DEFAULT 0,
  instructions  TEXT,
  images        TEXT,
  secondary_muscles TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_exercises_muscle_group ON exercises(muscle_group);

CREATE TABLE routines (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  notes      TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE routine_exercises (
  id                TEXT PRIMARY KEY,
  routine_id        TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  exercise_id       TEXT NOT NULL REFERENCES exercises(id),
  position          INTEGER NOT NULL,
  superset_group_id TEXT,
  rest_seconds      INTEGER,
  tracking_type     TEXT,
  notes             TEXT
);

CREATE INDEX idx_routine_exercises_routine ON routine_exercises(routine_id);

CREATE TABLE routine_sets (
  id                      TEXT PRIMARY KEY,
  routine_exercise_id     TEXT NOT NULL REFERENCES routine_exercises(id) ON DELETE CASCADE,
  position                INTEGER NOT NULL,
  set_type                TEXT NOT NULL DEFAULT 'normal',
  target_weight           REAL,
  target_reps             INTEGER,
  target_duration_seconds INTEGER,
  target_distance_meters  REAL
);

CREATE INDEX idx_routine_sets_routine_exercise ON routine_sets(routine_exercise_id);

CREATE TABLE workouts (
  id          TEXT PRIMARY KEY,
  routine_id  TEXT REFERENCES routines(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  notes       TEXT
);

CREATE INDEX idx_workouts_started_at ON workouts(started_at DESC);

CREATE TABLE workout_exercises (
  id                TEXT PRIMARY KEY,
  workout_id        TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id       TEXT NOT NULL REFERENCES exercises(id),
  position          INTEGER NOT NULL,
  superset_group_id TEXT,
  tracking_type     TEXT,
  rest_seconds      INTEGER,
  notes             TEXT
);

CREATE INDEX idx_workout_exercises_workout ON workout_exercises(workout_id);
CREATE INDEX idx_workout_exercises_exercise ON workout_exercises(exercise_id);

CREATE TABLE logged_sets (
  id                  TEXT PRIMARY KEY,
  workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  position            INTEGER NOT NULL,
  set_type            TEXT NOT NULL DEFAULT 'normal',
  weight              REAL,
  reps                INTEGER,
  duration_seconds    INTEGER,
  distance_meters     REAL,
  rpe                 REAL,
  completed           INTEGER NOT NULL DEFAULT 0,
  completed_at        TEXT
);

CREATE INDEX idx_logged_sets_workout_exercise ON logged_sets(workout_exercise_id);

CREATE TABLE personal_records (
  id            TEXT PRIMARY KEY,
  exercise_id   TEXT NOT NULL REFERENCES exercises(id),
  record_type   TEXT NOT NULL,
  value         REAL NOT NULL,
  logged_set_id TEXT REFERENCES logged_sets(id),
  achieved_at   TEXT NOT NULL,
  UNIQUE(exercise_id, record_type)
);

CREATE TABLE profile (
  id   INTEGER PRIMARY KEY CHECK (id = 0),
  name TEXT NOT NULL DEFAULT 'Alex Rivera'
);
`;
