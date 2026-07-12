export type SetType = 'normal' | 'warmup' | 'dropset' | 'failure';

export type Exercise = {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;
  exercise_type: string;
  is_custom: boolean;
  instructions: string[];
  images: string[];
  secondary_muscles: string[];
  created_at: string;
};

export type Routine = {
  id: string;
  name: string;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type RoutineExercise = {
  id: string;
  routine_id: string;
  exercise_id: string;
  position: number;
  superset_group_id: string | null;
  rest_seconds: number | null;
  exercise_type: string;
  notes: string | null;
};

export type RoutineSet = {
  id: string;
  routine_exercise_id: string;
  position: number;
  set_type: SetType;
  target_weight: number | null;
  target_reps: number | null;
  target_duration_seconds: number | null;
  target_distance_meters: number | null;
};

export type Workout = {
  id: string;
  routine_id: string | null;
  name: string;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
};

export type WorkoutExercise = {
  id: string;
  workout_id: string;
  exercise_id: string;
  position: number;
  superset_group_id: string | null;
  exercise_type: string;
  rest_seconds: number | null;
  notes: string | null;
};

export type LoggedSet = {
  id: string;
  workout_exercise_id: string;
  position: number;
  set_type: SetType;
  weight: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  rpe: number | null;
  completed: boolean;
  completed_at: string | null;
};

export type RecordType = 'max_weight' | 'max_reps' | 'max_volume' | 'est_1rm';

export type PersonalRecord = {
  id: string;
  exercise_id: string;
  record_type: RecordType;
  value: number;
  logged_set_id: string | null;
  achieved_at: string;
};

// Composite shapes returned by detail queries.
export type RoutineExerciseDetail = RoutineExercise & {
  exercise: Exercise;
  sets: RoutineSet[];
};

export type RoutineDetail = Routine & {
  exercises: RoutineExerciseDetail[];
};

export type WorkoutExerciseDetail = WorkoutExercise & {
  exercise: Exercise;
  sets: LoggedSet[];
};

export type WorkoutDetail = Workout & {
  exercises: WorkoutExerciseDetail[];
};
