import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { deleteCompletedWorkout } from '../../application/completedWorkoutHistory';
import { getRecordEventsForWorkout } from '../../db/repositories/personalRecords';
import { getWorkoutDetail } from '../../db/repositories/workouts';
import type { WorkoutDetail } from '../../db/types';
import { WorkoutDetailScreen } from '../WorkoutDetailScreen';

jest.mock('../../db/repositories/workouts');
jest.mock('../../db/repositories/personalRecords');
jest.mock('../../application/completedWorkoutHistory');

const mockGetWorkoutDetail = getWorkoutDetail as jest.MockedFunction<typeof getWorkoutDetail>;
const mockGetRecordEventsForWorkout = getRecordEventsForWorkout as jest.MockedFunction<
  typeof getRecordEventsForWorkout
>;
const mockDeleteCompletedWorkout = deleteCompletedWorkout as jest.MockedFunction<
  typeof deleteCompletedWorkout
>;

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
  bodyweight_kg: null,
  exercises: [
    makeExercise('we1', 'Bench Press', 'g1'),
    makeExercise('we2', 'Overhead Press', 'g1'),
  ],
};

beforeEach(() => {
  jest.restoreAllMocks();
  mockGetWorkoutDetail.mockResolvedValue(workoutDetail);
  mockGetRecordEventsForWorkout.mockResolvedValue([]);
  mockDeleteCompletedWorkout.mockResolvedValue();
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

test('keeps workout detail visible when PR events fail to load', async () => {
  mockGetRecordEventsForWorkout.mockRejectedValueOnce(new Error('record events unavailable'));

  const { getByText, queryByText } = await render(
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
  expect(queryByText('PR')).toBeNull();
});

test('keeps workout detail visible and reports a completed-workout deletion failure', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  mockDeleteCompletedWorkout.mockRejectedValueOnce(new Error('database unavailable'));
  const detail = await render(
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

  await waitFor(() => expect(detail.getByText('Overhead Press')).toBeTruthy());
  fireEvent.press(detail.getByRole('button', { name: 'Delete workout' }));
  const deleteAction = alertSpy.mock.calls[0]?.[2]?.find((button) => button.text === 'Delete');
  await deleteAction?.onPress?.();

  await waitFor(() =>
    expect(alertSpy).toHaveBeenLastCalledWith(
      'Could not delete workout',
      'Your workout was not deleted. Please try again.'
    )
  );
  expect(detail.getByText('Overhead Press')).toBeTruthy();
});
