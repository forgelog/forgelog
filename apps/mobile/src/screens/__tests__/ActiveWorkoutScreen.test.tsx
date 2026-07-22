import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { getRecordEventsForWorkout } from '../../db/repositories/personalRecords';
import {
  getPreviousExerciseSets,
  getWorkoutDetail,
  moveWorkoutExercise,
} from '../../db/repositories/workouts';
import { mobileStore } from '../../db/mobileStore';
import type { WorkoutDetail } from '../../db/types';
import { deferred } from '../../test-utils/async';
import { ActiveWorkoutScreen } from '../ActiveWorkoutScreen';

jest.mock('../../db/repositories/personalRecords');
jest.mock('../../db/repositories/workouts');
jest.mock('@expo/ui/community/bottom-sheet');

const mockGetWorkoutDetail = getWorkoutDetail as jest.MockedFunction<typeof getWorkoutDetail>;
const mockGetPreviousExerciseSets = getPreviousExerciseSets as jest.MockedFunction<
  typeof getPreviousExerciseSets
>;
const mockGetRecordEventsForWorkout = getRecordEventsForWorkout as jest.MockedFunction<
  typeof getRecordEventsForWorkout
>;
const mockMoveWorkoutExercise = moveWorkoutExercise as jest.MockedFunction<
  typeof moveWorkoutExercise
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
  bodyweight_kg: null,
  exercises: [
    {
      id: 'we1',
      workout_id: 'w1',
      exercise_id: 'e1',
      position: 0,
      superset_group_id: null,
      exercise_type: 'weight_reps',
      notes: null,
      exercise: {
        id: 'e1',
        name: LONG_EXERCISE_NAME,
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
  mockGetPreviousExerciseSets.mockResolvedValue([]);
  mockGetRecordEventsForWorkout.mockResolvedValue([]);
  mockMoveWorkoutExercise.mockResolvedValue();
});

test('truncates a long exercise name and renders descriptor-driven set fields', async () => {
  const { getByLabelText, getByTestId, getByText, queryByText } = await render(
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
  expect(queryByText('Weight × reps')).toBeNull();
  expect(getByLabelText(`Complete set 1 for ${LONG_EXERCISE_NAME}`)).toBeTruthy();
  expect(getByLabelText(`Workout set 1 weight for ${LONG_EXERCISE_NAME}`)).toBeTruthy();
  expect(getByLabelText(`Workout set 1 reps for ${LONG_EXERCISE_NAME}`)).toBeTruthy();
  expect(getByTestId('workout-set-0-0-weight')).toBeTruthy();
  expect(getByTestId('workout-set-0-0-reps')).toBeTruthy();
});

test('keeps focused set inputs above the keyboard', async () => {
  const workout = await render(
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

  const scrollView = await waitFor(() => workout.getByTestId('workout-keyboard-aware-scroll-view'));
  expect(scrollView.props.bottomOffset).toBeGreaterThan(0);
});

test('does not show a superset tag even when exercises share a superset_group_id', async () => {
  const groupedDetail: WorkoutDetail = {
    ...workoutDetail,
    exercises: [
      { ...workoutDetail.exercises[0], id: 'we1', superset_group_id: 'g1' },
      {
        ...workoutDetail.exercises[0],
        id: 'we2',
        exercise: { ...workoutDetail.exercises[0].exercise, id: 'e2', name: 'Second Exercise' },
        superset_group_id: 'g1',
        sets: [],
      },
    ],
  };
  mockGetWorkoutDetail.mockResolvedValue(groupedDetail);

  const { queryByText, getByText } = await render(
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

  await waitFor(() => expect(getByText('Second Exercise')).toBeTruthy());
  expect(queryByText(/Superset/)).toBeNull();
});

test('gates repeated reorder presses while persistence is pending', async () => {
  const groupedDetail: WorkoutDetail = {
    ...workoutDetail,
    exercises: [
      workoutDetail.exercises[0],
      {
        ...workoutDetail.exercises[0],
        id: 'we2',
        exercise_id: 'e2',
        exercise: { ...workoutDetail.exercises[0].exercise, id: 'e2', name: 'Second Exercise' },
        position: 1,
        sets: [],
      },
    ],
  };
  const pendingMove = deferred<void>();
  mockGetWorkoutDetail.mockResolvedValue(groupedDetail);
  const moveExercise = jest
    .spyOn(mobileStore.workouts, 'moveExercise')
    .mockReturnValue(pendingMove.promise);

  const active = await render(
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

  const moveUp = await waitFor(() => active.getByLabelText('Move Second Exercise up'));
  await act(async () => fireEvent.press(moveUp));
  await act(async () => fireEvent.press(moveUp));

  expect(moveExercise).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(
      active.getAllByTestId(/workout-exercise-\d+-name/).map((node) => node.props.children)
    ).toEqual(['Second Exercise', LONG_EXERCISE_NAME])
  );

  await act(async () => {
    pendingMove.resolve();
    await pendingMove.promise;
    await Promise.resolve();
  });
  active.unmount();
});
