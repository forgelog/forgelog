import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { render, waitFor } from '@testing-library/react-native';

import type { WorkoutDetail } from '../../db/types';
import { WorkoutDetailScreen } from '../WorkoutDetailScreen';

jest.mock('../../db/repositories/workouts');

import { getWorkoutDetail } from '../../db/repositories/workouts';

const mockGetWorkoutDetail = getWorkoutDetail as jest.MockedFunction<typeof getWorkoutDetail>;

type TestParamList = { WorkoutDetail: { workoutId: string } };

const Stack = createNativeStackNavigator<TestParamList>();

function makeExercise(id: string, name: string, superset_group_id: string | null) {
  return {
    id,
    workout_id: 'w1',
    exercise_id: `${id}-ex`,
    position: 0,
    superset_group_id,
    exercise_type: 'weight_reps',
    rest_seconds: null,
    notes: null,
    exercise: {
      id: `${id}-ex`,
      name,
      muscle_group: 'chest',
      equipment: 'barbell',
      exercise_type: 'weight_reps',
      is_custom: false,
      instructions: [],
      images: [],
      secondary_muscles: [],
      created_at: new Date().toISOString(),
    },
    sets: [
      {
        id: `${id}-s1`,
        workout_exercise_id: id,
        position: 0,
        set_type: 'normal' as const,
        weight: 100,
        reps: 5,
        duration_seconds: null,
        distance_meters: null,
        rpe: null,
        completed: true,
        completed_at: new Date().toISOString(),
      },
    ],
  };
}

const workoutDetail: WorkoutDetail = {
  id: 'w1',
  routine_id: null,
  name: 'Push Day',
  started_at: new Date().toISOString(),
  ended_at: new Date().toISOString(),
  notes: null,
  exercises: [makeExercise('we1', 'Bench Press', 'g1'), makeExercise('we2', 'Overhead Press', 'g1')],
};

beforeEach(() => {
  mockGetWorkoutDetail.mockResolvedValue(workoutDetail);
});

test('does not show a superset tag even when exercises share a superset_group_id', async () => {
  const { queryByText, getByText } = await render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="WorkoutDetail"
          component={WorkoutDetailScreen}
          initialParams={{ workoutId: 'w1' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );

  await waitFor(() => expect(getByText('Overhead Press')).toBeTruthy());
  expect(queryByText(/Superset/)).toBeNull();
});
