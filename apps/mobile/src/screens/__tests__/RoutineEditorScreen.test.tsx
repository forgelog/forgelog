import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { render, waitFor } from '@testing-library/react-native';

import type { RoutineDetail } from '../../db/types';
import { RoutineEditorScreen } from '../RoutineEditorScreen';

jest.mock('../../db/repositories/routines');

import { getRoutineDetail } from '../../db/repositories/routines';

const mockGetRoutineDetail = getRoutineDetail as jest.MockedFunction<typeof getRoutineDetail>;

type TestParamList = { RoutineEditor: { routineId: string } };

const Stack = createNativeStackNavigator<TestParamList>();

function makeExercise(id: string, name: string, superset_group_id: string | null) {
  return {
    id,
    routine_id: 'r1',
    exercise_id: `${id}-ex`,
    position: 0,
    superset_group_id,
    rest_seconds: null,
    tracking_type: null,
    notes: null,
    exercise: {
      id: `${id}-ex`,
      name,
      muscle_group: 'chest',
      equipment: 'barbell',
      tracking_type: 'weight_reps',
      is_custom: false,
      instructions: [],
      images: [],
      secondary_muscles: [],
      created_at: new Date().toISOString(),
    },
    sets: [],
  };
}

const routineDetail: RoutineDetail = {
  id: 'r1',
  name: 'Push Day',
  notes: null,
  position: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  exercises: [makeExercise('re1', 'Bench Press', 'g1'), makeExercise('re2', 'Overhead Press', 'g1')],
};

beforeEach(() => {
  mockGetRoutineDetail.mockResolvedValue(routineDetail);
});

test('does not show superset toggle or tag controls, even with a superset_group_id set', async () => {
  const { queryByText, getByText } = await render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="RoutineEditor"
          component={RoutineEditorScreen}
          initialParams={{ routineId: 'r1' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );

  await waitFor(() => expect(getByText('Overhead Press')).toBeTruthy());
  expect(queryByText(/Superset/)).toBeNull();
});
