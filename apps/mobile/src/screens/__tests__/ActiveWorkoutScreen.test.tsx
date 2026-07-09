import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { render, waitFor } from '@testing-library/react-native';

import type { WorkoutDetail } from '../../db/types';
import { ActiveWorkoutScreen } from '../ActiveWorkoutScreen';

jest.mock('../../db/repositories/personalRecords');
jest.mock('../../db/repositories/workouts');

import { getRecordsForExercise } from '../../db/repositories/personalRecords';
import { getPreviousSessionSets, getWorkoutDetail } from '../../db/repositories/workouts';

const mockGetWorkoutDetail = getWorkoutDetail as jest.MockedFunction<typeof getWorkoutDetail>;
const mockGetPreviousSessionSets = getPreviousSessionSets as jest.MockedFunction<
  typeof getPreviousSessionSets
>;
const mockGetRecordsForExercise = getRecordsForExercise as jest.MockedFunction<
  typeof getRecordsForExercise
>;

type TestParamList = { ActiveWorkout: { workoutId: string } };

const Stack = createNativeStackNavigator<TestParamList>();

const LONG_EXERCISE_NAME =
  'Incline Barbell Bench Press With Extended Pause At The Bottom Of Every Rep';

const workoutDetail: WorkoutDetail = {
  id: 'w1',
  routine_id: null,
  name: 'Push Day',
  started_at: new Date().toISOString(),
  ended_at: null,
  notes: null,
  exercises: [
    {
      id: 'we1',
      workout_id: 'w1',
      exercise_id: 'e1',
      position: 0,
      superset_group_id: null,
      tracking_type: null,
      rest_seconds: null,
      notes: null,
      exercise: {
        id: 'e1',
        name: LONG_EXERCISE_NAME,
        muscle_group: 'chest',
        equipment: 'barbell',
        tracking_type: 'weight_reps',
        is_custom: false,
        instructions: [],
        images: [],
        secondary_muscles: [],
        created_at: new Date().toISOString(),
      },
      sets: [
        {
          id: 's1',
          workout_exercise_id: 'we1',
          position: 0,
          set_type: 'normal',
          weight: 100,
          reps: 5,
          duration_seconds: null,
          distance_meters: null,
          rpe: null,
          completed: false,
          completed_at: null,
        },
      ],
    },
  ],
};

beforeEach(() => {
  mockGetWorkoutDetail.mockResolvedValue(workoutDetail);
  mockGetPreviousSessionSets.mockResolvedValue([]);
  mockGetRecordsForExercise.mockResolvedValue([]);
});

test('truncates a long exercise name instead of overlapping the info icon and tracking chip', async () => {
  const { getByText } = await render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="ActiveWorkout"
          component={ActiveWorkoutScreen}
          initialParams={{ workoutId: 'w1' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );

  const nameNode = await waitFor(() => getByText(LONG_EXERCISE_NAME));
  expect(nameNode.props.numberOfLines).toBe(1);
  // tracking-type chip stays reachable alongside the name, not pushed off-screen
  await waitFor(() => expect(getByText('Weight × reps')).toBeTruthy());
});
