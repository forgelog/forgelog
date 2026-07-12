import { CommonActions, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { Alert, Text } from 'react-native';

import { deleteRoutine, getRoutineDetail, updateRoutine } from '../../db/repositories/routines';
import type { RoutineDetail } from '../../db/types';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { RoutineEditorScreen } from '../RoutineEditorScreen';

jest.mock('../../db/repositories/routines');

const mockDeleteRoutine = deleteRoutine as jest.MockedFunction<typeof deleteRoutine>;
const mockGetRoutineDetail = getRoutineDetail as jest.MockedFunction<typeof getRoutineDetail>;
const mockUpdateRoutine = updateRoutine as jest.MockedFunction<typeof updateRoutine>;

type TestParamList = RootStackParamList & {
  Home: undefined;
};

const Stack = createNativeStackNavigator<TestParamList>();

function HomeStub() {
  return <Text>Home screen</Text>;
}

function RoutineEditorWithPop(props: ComponentProps<typeof RoutineEditorScreen>) {
  return (
    <>
      <RoutineEditorScreen {...props} />
      <Text onPress={() => props.navigation.dispatch(CommonActions.goBack())}>Pop editor</Text>
    </>
  );
}

function renderEditor(
  params: RootStackParamList['RoutineEditor'],
  editor: typeof RoutineEditorScreen = RoutineEditorScreen
) {
  return render(
    <NavigationContainer
      initialState={{ routes: [{ name: 'Home' }, { name: 'RoutineEditor', params }], index: 1 }}
    >
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeStub} />
        <Stack.Screen name="RoutineEditor" component={editor} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

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
    sets:
      id === 're1'
        ? [
            {
              id: 'rs1',
              routine_exercise_id: 're1',
              position: 0,
              set_type: 'normal' as const,
              target_weight: 80,
              target_reps: 8,
              target_duration_seconds: null,
              target_distance_meters: null,
            },
          ]
        : [],
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
  jest.clearAllMocks();
  mockDeleteRoutine.mockResolvedValue();
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

test('clearing the routine name shows an error and does not persist it', async () => {
  const { getByDisplayValue, getByText, queryByText } = await render(
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

  await waitFor(() => expect(getByDisplayValue('Push Day')).toBeTruthy());
  const nameInput = getByDisplayValue('Push Day');

  await act(async () => fireEvent.changeText(nameInput, '   '));
  await act(async () => fireEvent(nameInput, 'blur'));

  await waitFor(() => expect(getByText('Routine name is required.')).toBeTruthy());
  expect(mockUpdateRoutine).not.toHaveBeenCalledWith('r1', expect.objectContaining({ name: expect.anything() }));
  expect(queryByText('Routine name is required.')).toBeTruthy();
});

test('saving a valid routine name persists the trimmed value', async () => {
  const { getByDisplayValue } = await render(
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

  await waitFor(() => expect(getByDisplayValue('Push Day')).toBeTruthy());
  const nameInput = getByDisplayValue('Push Day');

  await act(async () => fireEvent.changeText(nameInput, '  Leg Day  '));
  await act(async () => fireEvent(nameInput, 'blur'));

  await waitFor(() =>
    expect(mockUpdateRoutine).toHaveBeenCalledWith('r1', { name: 'Leg Day' })
  );
});

test('pressing Save persists the current routine name without requiring a blur first', async () => {
  const { getByDisplayValue, getByText } = await render(
    <NavigationContainer
      initialState={{
        routes: [{ name: 'Home' }, { name: 'RoutineEditor', params: { routineId: 'r1' } }],
        index: 1,
      }}
    >
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeStub} />
        <Stack.Screen
          name="RoutineEditor"
          component={RoutineEditorScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );

  await waitFor(() => expect(getByDisplayValue('Push Day')).toBeTruthy());
  const nameInput = getByDisplayValue('Push Day');

  await act(async () => fireEvent.changeText(nameInput, '  Phase Five Workout  '));
  await act(async () => fireEvent.press(getByText('Save')));

  await waitFor(() =>
    expect(mockUpdateRoutine).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ name: 'Phase Five Workout' })
    )
  );
});

test('closing an empty newly created routine discards it without Save validation', async () => {
  mockGetRoutineDetail.mockResolvedValue({ ...routineDetail, exercises: [] });
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const { getByLabelText, getByText } = await renderEditor({ routineId: 'r1', isNew: true });

  await waitFor(() => expect(getByLabelText('Close')).toBeTruthy());
  await act(async () => fireEvent.press(getByLabelText('Close')));

  await waitFor(() => expect(getByText('Home screen')).toBeTruthy());
  expect(mockDeleteRoutine).toHaveBeenCalledWith('r1');
  expect(mockUpdateRoutine).not.toHaveBeenCalled();
  expect(alertSpy).not.toHaveBeenCalledWith('No exercises', expect.any(String));
});

test('closing an existing routine does not delete it', async () => {
  const { getByLabelText, getByText } = await renderEditor({ routineId: 'r1' });

  await waitFor(() => expect(getByLabelText('Close')).toBeTruthy());
  await act(async () => fireEvent.press(getByLabelText('Close')));

  await waitFor(() => expect(getByText('Home screen')).toBeTruthy());
  expect(mockDeleteRoutine).not.toHaveBeenCalled();
});

test('stays in the editor when discarding a new routine fails', async () => {
  mockDeleteRoutine.mockRejectedValue(new Error('delete failed'));
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const { getByLabelText, queryByText } = await renderEditor({ routineId: 'r1', isNew: true });

  await waitFor(() => expect(getByLabelText('Close')).toBeTruthy());
  await act(async () => fireEvent.press(getByLabelText('Close')));

  await waitFor(() =>
    expect(alertSpy).toHaveBeenCalledWith('Close failed', 'Could not discard the new routine.')
  );
  expect(queryByText('Home screen')).toBeNull();
  expect(getByLabelText('Close')).toBeTruthy();
});

test('a navigator back action also discards a newly created routine', async () => {
  const { getByDisplayValue, getByText } = await renderEditor(
    { routineId: 'r1', isNew: true },
    RoutineEditorWithPop
  );

  await waitFor(() => expect(getByDisplayValue('Push Day')).toBeTruthy());
  await act(async () => fireEvent.press(getByText('Pop editor')));

  await waitFor(() => expect(getByText('Home screen')).toBeTruthy());
  expect(mockDeleteRoutine).toHaveBeenCalledWith('r1');
});

test('exposes stable E2E labels for routine editing controls', async () => {
  const { getByLabelText, getByTestId, getByText } = await render(
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

  await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
  expect(getByLabelText('Routine name')).toBeTruthy();
  expect(getByLabelText('Routine notes')).toBeTruthy();
  expect(getByLabelText('Tracking type for Bench Press: Weight × reps')).toBeTruthy();
  expect(getByLabelText('Add Exercise')).toBeTruthy();
  expect(getByLabelText('Add set to Bench Press')).toBeTruthy();
  expect(getByLabelText('Remove Bench Press')).toBeTruthy();
  expect(getByTestId('routine-set-0-0-weight')).toBeTruthy();
  expect(getByTestId('routine-set-0-0-reps')).toBeTruthy();
});
