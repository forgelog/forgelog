-- ============================================================
-- Workout tracker — v1 local schema (SQLite / expo-sqlite)
-- Personal-only, fully offline. No auth/sync tables yet —
-- those get added as a separate migration when Supabase sync
-- lands in v1.5, without touching anything below.
-- ============================================================

-- Run this once per connection (SQLite has it off by default):
-- PRAGMA foreign_keys = ON;

-- ---------- Exercise library ----------
-- todo: audit pending
CREATE TABLE exercises (
  id            TEXT PRIMARY KEY,           -- uuid, generated client-side
  name          TEXT NOT NULL,
  muscle_group  TEXT NOT NULL,              -- 'abdominals','abductors','adductors','arms','back','biceps','calves',
                                             -- 'cardio','chest','core','forearms','full_body','glutes','hamstrings',
                                             -- 'lats','legs','lower_back','middle_back','neck','other','quadriceps',
                                             -- 'shoulders','traps','triceps','upper_back'
  equipment     TEXT NOT NULL,              -- free text, any equipment value from the source dataset
  exercise_type TEXT NOT NULL CHECK (
    exercise_type IN (
      'weight_reps',
      'reps_only',
      'weighted_bodyweight',
      'assisted_bodyweight',
      'duration',
      'duration_weight',
      'distance_duration',
      'weight_distance'
    )
  ),
  is_custom     INTEGER NOT NULL DEFAULT 0, -- user-created vs seeded from the library
  instructions  TEXT,                       -- JSON array of strings, e.g. '["Step 1...","Step 2..."]'
  images        TEXT,                       -- JSON array of image URLs, e.g. '["https://...0.jpg","https://...1.jpg"]'
  secondary_muscles TEXT,                   -- JSON array of secondary muscle strings, e.g. '["triceps","front deltoids"]'
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- todo: audit pending
CREATE INDEX idx_exercises_muscle_group ON exercises(muscle_group);

-- ---------- Routines (reusable templates) ----------
-- todo: audit pending
CREATE TABLE routines (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  notes      TEXT,
  position   INTEGER NOT NULL DEFAULT 0,    -- order in the user's routine list
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- todo: audit pending
CREATE TABLE routine_exercises (
  id                TEXT PRIMARY KEY,
  routine_id        TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  exercise_id       TEXT NOT NULL REFERENCES exercises(id),
  position          INTEGER NOT NULL,
  superset_group_id TEXT,               -- shared value links exercises into one superset
  exercise_type     TEXT NOT NULL CHECK (
    exercise_type IN (
      'weight_reps',
      'reps_only',
      'weighted_bodyweight',
      'assisted_bodyweight',
      'duration',
      'duration_weight',
      'distance_duration',
      'weight_distance'
    )
  ),                                    -- snapshot of exercises.exercise_type
  notes             TEXT
);

-- todo: audit pending
CREATE INDEX idx_routine_exercises_routine ON routine_exercises(routine_id);

-- todo: audit pending
CREATE TABLE routine_sets (
  id                      TEXT PRIMARY KEY,
  routine_exercise_id     TEXT NOT NULL REFERENCES routine_exercises(id) ON DELETE CASCADE,
  position                INTEGER NOT NULL,
  set_type                TEXT NOT NULL DEFAULT 'normal', -- 'normal','warmup','dropset'
  target_weight           REAL,
  target_reps             INTEGER,
  target_duration_seconds INTEGER,
  target_distance_meters  REAL
);

-- todo: audit pending
CREATE INDEX idx_routine_sets_routine_exercise ON routine_sets(routine_exercise_id);

-- ---------- Workouts (actual sessions) ----------
-- todo: audit pending
CREATE TABLE workouts (
  id          TEXT PRIMARY KEY,
  routine_id  TEXT REFERENCES routines(id) ON DELETE SET NULL, -- freestyle workouts allowed; deleting a routine keeps history
  name        TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,                      -- null while a workout is in progress
  notes       TEXT
);

-- todo: audit pending
CREATE INDEX idx_workouts_started_at ON workouts(started_at DESC);

-- todo: audit pending
CREATE TABLE workout_exercises (
  id                TEXT PRIMARY KEY,
  workout_id        TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id       TEXT NOT NULL REFERENCES exercises(id),
  position          INTEGER NOT NULL,
  superset_group_id TEXT,               -- shared value links exercises into one superset
  exercise_type     TEXT NOT NULL CHECK (
    exercise_type IN (
      'weight_reps',
      'reps_only',
      'weighted_bodyweight',
      'assisted_bodyweight',
      'duration',
      'duration_weight',
      'distance_duration',
      'weight_distance'
    )
  ),                                    -- snapshot of routine/catalog exercise_type at log time
  notes             TEXT
);

-- todo: audit pending
CREATE INDEX idx_workout_exercises_workout ON workout_exercises(workout_id);
-- todo: audit pending
CREATE INDEX idx_workout_exercises_exercise ON workout_exercises(exercise_id);

-- todo: audit pending
CREATE TABLE logged_sets (
  id                  TEXT PRIMARY KEY,
  workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  position            INTEGER NOT NULL,
  set_type            TEXT NOT NULL DEFAULT 'normal', -- 'normal','warmup','dropset','failure'
  weight              REAL,
  reps                INTEGER,
  duration_seconds    INTEGER,
  distance_meters     REAL,
  rpe                 REAL,
  completed           INTEGER NOT NULL DEFAULT 0,
  completed_at        TEXT
);

-- todo: audit pending
CREATE INDEX idx_logged_sets_workout_exercise ON logged_sets(workout_exercise_id);

-- ---------- Personal records ----------
-- Cached, not computed on the fly: updated by app logic right after a set
-- is marked completed, so a "new PR!" banner can show up instantly instead
-- of running an aggregate query on every screen render.
-- todo: audit pending
CREATE TABLE personal_records (
  id            TEXT PRIMARY KEY,
  exercise_id   TEXT NOT NULL REFERENCES exercises(id),
  record_type   TEXT NOT NULL,   -- 'max_weight','max_reps','max_volume','est_1rm'
  value         REAL NOT NULL,
  logged_set_id TEXT REFERENCES logged_sets(id),
  achieved_at   TEXT NOT NULL,
  UNIQUE(exercise_id, record_type)
);

-- todo: audit pending
CREATE TABLE personal_record_events (
  id                  TEXT PRIMARY KEY,
  exercise_id         TEXT NOT NULL REFERENCES exercises(id),
  workout_id          TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  logged_set_id       TEXT REFERENCES logged_sets(id) ON DELETE CASCADE,
  record_type         TEXT NOT NULL, -- 'max_weight','max_reps','max_volume','est_1rm'
  scope               TEXT NOT NULL CHECK (scope IN ('set','exercise_session')),
  value               REAL NOT NULL,
  achieved_at         TEXT NOT NULL,
  formula_version     TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(exercise_id, record_type, workout_exercise_id, scope)
);

-- todo: audit pending
CREATE INDEX idx_personal_record_events_exercise
  ON personal_record_events(exercise_id, achieved_at DESC);
-- todo: audit pending
CREATE INDEX idx_personal_record_events_set
  ON personal_record_events(logged_set_id);
-- todo: audit pending
CREATE INDEX idx_personal_record_events_workout
  ON personal_record_events(workout_id);

-- ---------- Profile ----------
-- Single-row table for local, unauthenticated profile info.
-- todo: audit pending
CREATE TABLE profile (
  id            INTEGER PRIMARY KEY CHECK (id = 0),
  name          TEXT NOT NULL DEFAULT '',
  theme_mode    TEXT NOT NULL DEFAULT 'system', -- 'system','light','dark'
  sex           TEXT CHECK (sex IN ('male', 'female', 'prefer_not_to_say')),
  birth_date    TEXT,                           -- ISO 'YYYY-MM-DD'
  height_cm     REAL,
  bodyweight_kg REAL
);
